"""
Document DNA / Fingerprinting engine (USP 2). Builds a stable fingerprint for
each document (file hash, normalized-text hash, structural + metadata
features) and compares fingerprints across bidders to surface reused
templates or unusually similar submissions, framed strictly as a signal for
manual review, never as proof of collusion.
"""
from __future__ import annotations

import hashlib
from collections import Counter
from typing import Optional

from sqlalchemy.orm import Session

from app.engines.similarity_engine import compute_similarity
from app.models.document import Document
from app.models.forensics import DocumentFingerprint, FingerprintComparison


def _normalized_text(document: Document) -> str:
    """Builds the text used for similarity comparison. Prefers a real OCR
    excerpt when one exists; otherwise falls back to a normalized string of
    the (mock or real) extracted fields, which is still a meaningful and
    honest basis for comparing document *content*, not raw file bytes."""
    if document.extraction and document.extraction.raw_extracted_fields.get("raw_text_excerpt"):
        return document.extraction.raw_extracted_fields["raw_text_excerpt"]
    if document.extraction:
        parts = [
            document.category,
            document.extraction.company_name or "",
            document.extraction.registration_number or "",
            document.extraction.address or "",
            str(document.extraction.turnover_crore or ""),
        ]
        return " ".join(p for p in parts if p)
    return document.category


def _structural_features(document: Document, text: str) -> dict:
    words = text.split()
    return {
        "category": document.category,
        "text_length": len(text),
        "word_count": len(words),
        "unique_word_count": len(set(w.lower() for w in words)),
        "file_extension": document.original_filename.rsplit(".", 1)[-1].lower() if "." in document.original_filename else "",
    }


def _metadata_features(document: Document) -> dict:
    return {
        "file_size_bytes": document.file_size_bytes,
        "mime_type": document.mime_type,
        "extraction_provider": document.extraction.extraction_provider if document.extraction else None,
        "extraction_confidence": document.extraction.extraction_confidence if document.extraction else None,
    }


def generate_fingerprint(db: Session, document: Document) -> DocumentFingerprint:
    text = _normalized_text(document)
    normalized_text_hash = hashlib.sha256(text.lower().encode()).hexdigest()
    structural_features = _structural_features(document, text)
    metadata_features = _metadata_features(document)
    term_freq = dict(Counter(w.lower() for w in text.split()).most_common(30))

    existing = db.query(DocumentFingerprint).filter(DocumentFingerprint.document_id == document.id).first()
    if existing:
        existing.file_hash = document.file_hash_sha256 or ""
        existing.normalized_text_hash = normalized_text_hash
        existing.structural_features = structural_features
        existing.metadata_features = metadata_features
        existing.document_type = document.category
        existing.tfidf_vector = term_freq
        fingerprint = existing
    else:
        fingerprint = DocumentFingerprint(
            document_id=document.id,
            bidder_id=document.bidder_id,
            file_hash=document.file_hash_sha256 or "",
            normalized_text_hash=normalized_text_hash,
            structural_features=structural_features,
            metadata_features=metadata_features,
            document_type=document.category,
            tfidf_vector=term_freq,
        )
        db.add(fingerprint)

    db.commit()
    db.refresh(fingerprint)
    return fingerprint


def compare_documents(db: Session, document_a: Document, document_b: Document) -> FingerprintComparison:
    fp_a = db.query(DocumentFingerprint).filter(DocumentFingerprint.document_id == document_a.id).first() or generate_fingerprint(db, document_a)
    fp_b = db.query(DocumentFingerprint).filter(DocumentFingerprint.document_id == document_b.id).first() or generate_fingerprint(db, document_b)

    text_a = _normalized_text(document_a)
    text_b = _normalized_text(document_b)
    result = compute_similarity(text_a, text_b, fp_a.structural_features, fp_b.structural_features)

    # Identical file bytes is a maximal, certain signal regardless of text similarity.
    if document_a.file_hash_sha256 and document_a.file_hash_sha256 == document_b.file_hash_sha256:
        result["similarity_score"] = 1.0
        result["level"] = "HIGH"
        result["requires_review"] = True
        result["common_sections"] = ["identical_file_bytes"]

    comparison = FingerprintComparison(
        document_a_id=document_a.id,
        document_b_id=document_b.id,
        bidder_a_id=document_a.bidder_id,
        bidder_b_id=document_b.bidder_id,
        similarity_score=result["similarity_score"],
        level=result["level"],
        common_sections=result["common_sections"],
        requires_review=result["requires_review"],
    )
    db.add(comparison)
    db.commit()
    db.refresh(comparison)
    return comparison


def compare_bidder_documents_across_tender(db: Session, tender_id: str, min_score: float = 0.6) -> list[FingerprintComparison]:
    """Compares every same-category document pair between different bidders
    submitted for a given tender, returning only pairs at/above min_score."""
    docs = (
        db.query(Document)
        .filter(Document.tender_id == tender_id, Document.is_deleted == False)  # noqa: E712
        .all()
    )
    by_category: dict[str, list[Document]] = {}
    for d in docs:
        by_category.setdefault(d.category, []).append(d)

    results = []
    for category, category_docs in by_category.items():
        for i in range(len(category_docs)):
            for j in range(i + 1, len(category_docs)):
                a, b = category_docs[i], category_docs[j]
                if a.bidder_id == b.bidder_id:
                    continue
                comparison = compare_documents(db, a, b)
                if comparison.similarity_score >= min_score:
                    results.append(comparison)
    return results
