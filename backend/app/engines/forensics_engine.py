"""Document forensics (USP 1).

Signals come from the file itself (app.forensics) plus one platform-wide check
no single file can show: the same bytes submitted by two different bidders.
Findings are phrased as observations for the officer, never as a verdict that
a document is forged.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.forensics.document import SEVERITY_POINTS, inspect, risk_from_signals
from app.models.document import Document
from app.models.forensics import ForensicAnalysis


def _inspection(document: Document) -> dict | None:
    ext = document.extraction
    if ext and isinstance(ext.raw_extracted_fields, dict) and ext.raw_extracted_fields.get("inspection"):
        return ext.raw_extracted_fields["inspection"]
    try:
        return inspect(document.file_path, document.category)
    except OSError:
        return None


def _reuse_signals(db: Session, document: Document) -> list[dict]:
    if not document.file_hash_sha256:
        return []
    reused = (
        db.query(Document)
        .filter(Document.file_hash_sha256 == document.file_hash_sha256, Document.id != document.id, Document.is_deleted == False)  # noqa: E712
        .all()
    )
    others = {d.bidder_id for d in reused} - {document.bidder_id}
    if others:
        return [{
            "code": "IDENTICAL_FILE_REUSE_CROSS_BIDDER", "severity": "HIGH", "confidence": "high",
            "title": "Same file submitted by another bidder",
            "detail": f"This file is byte-for-byte identical (SHA-256) to {len(others)} document(s) from a different bidder. "
                      "Two independent companies cannot hold the same certificate file.",
            "page": None, "bbox": None, "field": None,
            "evidence": {"other_bidder_ids": sorted(others), "sha256": document.file_hash_sha256},
        }]
    if reused:
        return [{
            "code": "IDENTICAL_FILE_REUSE_SAME_BIDDER", "severity": "LOW", "confidence": "high",
            "title": "Uploaded more than once", "detail": "This exact file was uploaded more than once by the same bidder.",
            "page": None, "bbox": None, "field": None, "evidence": {"copies": len(reused)},
        }]
    return []


def analyze_document(db: Session, document: Document) -> ForensicAnalysis:
    insp = _inspection(document)
    signals = list(insp["signals"]) if insp else []
    signals += _reuse_signals(db, document)

    ext = document.extraction
    if ext and (ext.raw_extracted_fields or {}).get("simulated"):
        signals.append({
            "code": "SIMULATED_EXTRACTION", "severity": "INFO", "confidence": "high",
            "title": "Fields are simulated", "detail": "The file had no readable text, so fields were filled from the "
            "bidder profile for the demo. Nothing in this file has been verified.",
            "page": None, "bbox": None, "field": None, "evidence": {},
        })

    score, level = risk_from_signals(signals)
    for s in signals:
        s["type"] = s["code"]
        s["weight"] = SEVERITY_POINTS.get(s["severity"], 0)
    evidence = [s["detail"] for s in signals if s["severity"] != "INFO"]
    requires_review = level != "LOW" or any(s["severity"] == "HIGH" for s in signals)

    analysis = db.query(ForensicAnalysis).filter(ForensicAnalysis.document_id == document.id).first()
    if not analysis:
        analysis = ForensicAnalysis(document_id=document.id)
        db.add(analysis)
    analysis.forensic_risk_score = score
    analysis.risk_level = level
    analysis.signals = signals
    analysis.evidence = evidence
    analysis.requires_human_review = requires_review
    analysis.checks = insp["checks"] if insp else []
    analysis.structure = insp["structure"] if insp else {}
    db.commit()
    db.refresh(analysis)
    return analysis
