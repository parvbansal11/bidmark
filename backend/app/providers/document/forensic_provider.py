"""Reads the uploaded file itself. Every field keeps the page and box it came from."""
from __future__ import annotations

from typing import Any, Optional

from app.forensics.document import inspect
from app.providers.document.base import DocumentExtractionProvider

ID_FIELD_BY_CATEGORY = {
    "GST": "gstin", "PAN": "pan", "INCOME_TAX": "pan", "MCA": "cin", "UDYAM": "udyam",
}


class ForensicExtractionProvider(DocumentExtractionProvider):
    name = "BidmarkForensics"

    def inspect(self, document, file_path: str) -> dict:
        return inspect(file_path, document.category)

    def extract(self, document, bidder, file_path: Optional[str] = None, inspection: dict | None = None) -> dict[str, Any] | None:
        if not file_path:
            return None
        inspection = inspection or self.inspect(document, file_path)
        if not inspection["readable"]:
            return None
        ev = inspection["extraction"]["fields"]
        val = {k: e["value"] for k, e in ev.items()}
        id_key = ID_FIELD_BY_CATEGORY.get(document.category)
        confidences = [e["confidence"] for e in ev.values()] or [0.5]
        method = inspection["extraction"]["method"]
        return {
            "company_name": val.get("legal_name"),
            "registration_number": val.get(id_key) if id_key else (val.get("gstin") or val.get("cin") or val.get("udyam") or val.get("pan")),
            "pan": val.get("pan") or (val.get("gstin")[2:12] if val.get("gstin") else None),
            "gstin": val.get("gstin"),
            "cin": val.get("cin"),
            "address": val.get("address"),
            "issue_date": val.get("issue_date"),
            "validity_date": val.get("valid_until"),
            "document_number": None,
            "turnover_crore": val.get("turnover_crore"),
            "raw_extracted_fields": {
                "simulated": False,
                "evidence": ev,
                "udyam": val.get("udyam"),
                "trade_name": val.get("trade_name"),
                "detected_type": inspection["extraction"]["detected_type"],
                "raw_text_excerpt": inspection["text_excerpt"],
                "inspection": {k: v for k, v in inspection.items() if k not in ("text_excerpt",)},
            },
            "extraction_confidence": round(sum(confidences) / len(confidences) * (0.85 if method == "ocr" else 1.0), 3),
            "extraction_provider": f"{self.name}:{method}",
        }
