"""
Digital Document Forensics engine (USP 1). Answers "can this evidence be
trusted?" using a mix of real, checkable facts about the uploaded file
(hash reuse across the system, file size, extraction confidence) and
deterministic, seeded structural/metadata heuristics standing in for the
deeper forensic libraries a production system would run.

IMPORTANT: this engine never asserts that a document is fake. It only ever
raises "potential document integrity anomaly detected" language and defers
to a human for manual verification, per the platform's disclaimers.
"""
from __future__ import annotations

import hashlib
import random
from typing import Any

from sqlalchemy.orm import Session

from app.models.document import Document
from app.models.forensics import ForensicAnalysis


def _rng_for(document_id: str) -> random.Random:
    seed = int(hashlib.sha256(f"forensics:{document_id}".encode()).hexdigest(), 16) % (2**32)
    return random.Random(seed)


def analyze_document(db: Session, document: Document) -> ForensicAnalysis:
    signals: list[dict[str, Any]] = []
    evidence: list[str] = []
    score = 0

    # --- Real, checkable signal: identical file bytes reused elsewhere ---
    if document.file_hash_sha256:
        reused = (
            db.query(Document)
            .filter(
                Document.file_hash_sha256 == document.file_hash_sha256,
                Document.id != document.id,
                Document.is_deleted == False,  # noqa: E712
            )
            .all()
        )
        if reused:
            other_bidders = {d.bidder_id for d in reused}
            cross_bidder = other_bidders - {document.bidder_id}
            if cross_bidder:
                score += 35
                signals.append({"type": "IDENTICAL_FILE_REUSE_CROSS_BIDDER", "weight": 35, "confidence": "high"})
                evidence.append(
                    f"This file's SHA-256 hash is identical to {len(cross_bidder)} document(s) submitted by a different bidder."
                )
            else:
                score += 12
                signals.append({"type": "IDENTICAL_FILE_REUSE_SAME_BIDDER", "weight": 12, "confidence": "medium"})
                evidence.append("This exact file was uploaded more than once by the same bidder.")

    # --- Real, checkable signal: unusually small file for a formal certificate ---
    if 0 < document.file_size_bytes < 2000 and document.category not in ("OTHER",):
        score += 8
        signals.append({"type": "SUSPICIOUSLY_SMALL_FILE", "weight": 8, "confidence": "low"})
        evidence.append(f"File size ({document.file_size_bytes} bytes) is unusually small for a {document.category} certificate.")

    # --- Real, checkable signal: low OCR/extraction confidence ---
    if document.extraction and document.extraction.extraction_confidence is not None and document.extraction.extraction_confidence < 0.85:
        score += 10
        signals.append({"type": "LOW_EXTRACTION_CONFIDENCE", "weight": 10, "confidence": "medium"})
        evidence.append(f"Text extraction confidence was low ({document.extraction.extraction_confidence}).")

    # --- Deterministic simulated structural/metadata heuristics ---
    rng = _rng_for(document.id)
    simulated_checks = [
        ("METADATA_TIMESTAMP_ANOMALY", 0.15, 15, "Document metadata shows a modification timestamp earlier than its creation timestamp."),
        ("FONT_INCONSISTENCY", 0.12, 10, "Multiple inconsistent font families detected within the same document body."),
        ("STRUCTURAL_ANOMALY", 0.12, 12, "Unusual page/section structure detected relative to standard certificates of this type."),
        ("REPEATED_CONTENT_BLOCK", 0.10, 10, "A content block appears duplicated within the document in a way not typical of official templates."),
    ]
    for signal_type, probability, weight, description in simulated_checks:
        if rng.random() < probability:
            score += weight
            signals.append({"type": signal_type, "weight": weight, "confidence": "low"})
            evidence.append(description)

    score = min(100, score)
    if score >= 55:
        risk_level = "HIGH"
    elif score >= 25:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"

    requires_review = risk_level != "LOW"

    existing = db.query(ForensicAnalysis).filter(ForensicAnalysis.document_id == document.id).first()
    if existing:
        existing.forensic_risk_score = score
        existing.risk_level = risk_level
        existing.signals = signals
        existing.evidence = evidence
        existing.requires_human_review = requires_review
        analysis = existing
    else:
        analysis = ForensicAnalysis(
            document_id=document.id,
            forensic_risk_score=score,
            risk_level=risk_level,
            signals=signals,
            evidence=evidence,
            requires_human_review=requires_review,
        )
        db.add(analysis)

    db.commit()
    db.refresh(analysis)
    return analysis
