"""
LocalOCRProvider — best-effort real extraction when the uploaded file
actually carries a text layer (e.g. a text-based PDF). If no usable text is
found, extraction returns None and the caller falls back to
MockDocumentProvider. No network calls, no paid OCR API.
"""
import re
from typing import Any, Optional

from app.providers.document.base import DocumentExtractionProvider

PAN_RE = re.compile(r"\b[A-Z]{5}[0-9]{4}[A-Z]\b")
GSTIN_RE = re.compile(r"\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z0-9]\b")
CIN_RE = re.compile(r"\b[UL]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}\b")
DATE_RE = re.compile(r"\b(\d{4}-\d{2}-\d{2})\b")


def _extract_pdf_text(file_path: str) -> str:
    try:
        from pypdf import PdfReader

        reader = PdfReader(file_path)
        return "\n".join((page.extract_text() or "") for page in reader.pages)
    except Exception:
        return ""


class LocalOCRProvider(DocumentExtractionProvider):
    def extract(self, document, bidder, file_path: Optional[str] = None) -> dict[str, Any] | None:
        if not file_path:
            return None
        text = ""
        if file_path.lower().endswith(".pdf"):
            text = _extract_pdf_text(file_path)
        elif file_path.lower().endswith((".txt",)):
            try:
                with open(file_path, "r", errors="ignore") as fh:
                    text = fh.read()
            except Exception:
                text = ""
        if not text or len(text.strip()) < 10:
            return None

        pan = PAN_RE.search(text)
        gstin = GSTIN_RE.search(text)
        cin = CIN_RE.search(text)
        dates = DATE_RE.findall(text)

        if not any([pan, gstin, cin]):
            return None

        return {
            "company_name": bidder.company_name if bidder else None,
            "pan": pan.group(0) if pan else None,
            "gstin": gstin.group(0) if gstin else None,
            "cin": cin.group(0) if cin else None,
            "registration_number": (gstin or pan or cin).group(0) if (gstin or pan or cin) else None,
            "address": bidder.registered_address if bidder else None,
            "issue_date": dates[0] if dates else None,
            "validity_date": dates[1] if len(dates) > 1 else None,
            "document_number": None,
            "turnover_crore": None,
            "raw_extracted_fields": {"raw_text_excerpt": text[:500]},
            "extraction_confidence": 0.97,
            "extraction_provider": "LocalOCRProvider",
        }
