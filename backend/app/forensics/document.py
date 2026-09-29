"""Single entry point: everything Bidmark can learn from one uploaded file."""
from __future__ import annotations

import os
from datetime import date

from app.forensics import fields as F
from app.forensics import identifiers as ID
from app.forensics.image import analyse_image
from app.forensics.pdf import analyse_pdf
from app.forensics.text import IMAGE_EXT, extract, tesseract_available

SEVERITY_POINTS = {"HIGH": 35, "MEDIUM": 15, "LOW": 5, "INFO": 0}

# Which declared categories a detected document type may legitimately be filed under.
CATEGORY_ALIASES = {
    "GST": {"GST"}, "UDYAM": {"UDYAM", "MSME"}, "PAN": {"PAN", "INCOME_TAX"}, "MCA": {"MCA"},
    "OEM_AUTHORIZATION": {"OEM_AUTHORIZATION"}, "EPFO": {"EPFO"}, "ESIC": {"ESIC"},
    "FINANCIAL": {"FINANCIAL", "INCOME_TAX", "TURNOVER"}, "ISO": {"ISO", "OTHER"},
    "LOCAL_CONTENT": {"LOCAL_CONTENT"}, "NSIC": {"NSIC"},
}


def risk_from_signals(signals: list[dict]) -> tuple[int, str]:
    score = min(100, sum(SEVERITY_POINTS.get(s["severity"], 0) for s in signals))
    return score, "HIGH" if score >= 55 else "MEDIUM" if score >= 25 else "LOW"


def inspect(path: str, declared_category: str | None = None, today: date | None = None) -> dict:
    today = today or date.today()
    ext = os.path.splitext(path)[1].lower()
    with open(path, "rb") as fh:
        raw = fh.read()

    ex = extract(path)
    parsed = F.extract_fields(ex)
    fields = parsed["fields"]
    readable = parsed["text_chars"] >= 20 and bool(fields or parsed["detected_type"])

    signals: list[dict] = []
    checks: list[dict] = []

    def check(code: str, ran: bool, flagged: bool = False, note: str = ""):
        checks.append({"code": code, "status": "UNMEASURED" if not ran else "FLAG" if flagged else "PASS", "note": note})

    if ext == ".pdf":
        structure = analyse_pdf(raw, ex, fields)
    elif ext in IMAGE_EXT:
        structure = analyse_image(raw)
    else:
        structure = {"kind": "other", "signals": []}
    signals += structure.get("signals", [])

    codes = {s["code"] for s in signals}
    is_pdf = structure["kind"] == "pdf"
    check("SIGNATURE_INTEGRITY", is_pdf and bool(structure.get("signatures")),
          bool(codes & {"SIGNATURE_BROKEN", "MODIFIED_AFTER_SIGNING"}),
          "" if structure.get("signatures") else "No digital signature in file.")
    check("REVISION_HISTORY", is_pdf, "INCREMENTAL_UPDATES" in codes)
    check("METADATA_TIMELINE", is_pdf, bool(codes & {"TIMESTAMP_INVERSION", "MODIFIED_LATER"}))
    check("PRODUCER_TOOL", is_pdf or structure["kind"] == "image", bool(codes & {"EDITOR_TOOL", "IMAGE_EDITOR"}))
    check("FIELD_FONT_CONSISTENCY", is_pdf and ex.method == "text_layer" and bool(fields), "FIELD_FONT_OUTLIER" in codes,
          "" if ex.method == "text_layer" else "Scanned page; font analysis needs a text layer.")
    check("OVERLAPPING_TEXT", is_pdf and ex.method != "ocr", "OVERLAPPING_TEXT" in codes)
    check("COMPRESSION_CONSISTENCY", structure.get("format") == "JPEG", "COMPRESSION_HOTSPOT" in codes)

    if not readable:
        why = ex.error or ("No text layer and Tesseract is not installed." if not tesseract_available() else "No readable text found.")
        signals.append({"code": "UNREADABLE", "severity": "MEDIUM", "title": "Could not read the document",
                        "detail": f"{why} Field checks could not run, so this file is unverified, not clean.",
                        "confidence": "high", "page": None, "bbox": None, "field": None, "evidence": {"method": ex.method}})

    detected = parsed["detected_type"]
    check("DOCUMENT_TYPE", readable and bool(detected) and bool(declared_category),
          bool(detected and declared_category and declared_category not in CATEGORY_ALIASES.get(detected, {detected})))
    if detected and declared_category and declared_category not in CATEGORY_ALIASES.get(detected, {detected}):
        signals.append({"code": "CATEGORY_MISMATCH", "severity": "MEDIUM", "title": "Uploaded under the wrong heading",
                        "detail": f"Filed as {declared_category}, but the content reads as a {detected} document "
                                  f"(matched: {', '.join(parsed['type_hints'])}).",
                        "confidence": "medium", "page": 1, "bbox": None, "field": None,
                        "evidence": {"declared": declared_category, "detected": detected}})

    v = {k: e["value"] for k, e in fields.items()}
    idcheck = ID.cross_validate(pan=v.get("pan"), gstin=v.get("gstin"), cin=v.get("cin"), udyam=v.get("udyam"),
                                legal_name=v.get("legal_name"), address=v.get("address"))
    check("IDENTIFIER_STRUCTURE", bool(idcheck["identifiers"]), bool(idcheck["findings"]))
    for f in idcheck["findings"]:
        keys = {"GSTIN": "gstin", "PAN": "pan", "CIN": "cin", "UDYAM": "udyam"}
        anchor = next((fields[keys[s]] for s in f["sources"] if keys.get(s) in fields), None)
        signals.append({"code": f["code"], "severity": f["severity"], "title": f["code"].replace("_", " ").capitalize(),
                        "detail": f["detail"], "confidence": "high", "page": anchor["page"] if anchor else None,
                        "bbox": anchor["bbox"] if anchor else None, "field": None, "evidence": {"sources": f["sources"]}})

    if "valid_until" in fields:
        until = date.fromisoformat(fields["valid_until"]["value"])
        check("VALIDITY_TODAY", True, until < today)
        if until < today:
            e = fields["valid_until"]
            signals.append({"code": "EXPIRED", "severity": "HIGH", "title": "Certificate has expired",
                            "detail": f"Valid until {until.isoformat()}, {(today - until).days} day(s) ago.",
                            "confidence": "high", "page": e["page"], "bbox": e["bbox"], "field": "valid_until",
                            "evidence": {"valid_until": until.isoformat(), "as_of": today.isoformat()}})
    else:
        check("VALIDITY_TODAY", False, note="No validity date found in the document.")

    score, level = risk_from_signals(signals)
    return {
        "extraction": parsed,
        "structure": {k: v for k, v in structure.items() if k != "signals"},
        "identifiers": idcheck["identifiers"],
        "signals": signals,
        "checks": checks,
        "risk_score": score,
        "risk_level": level,
        "readable": readable,
        "text_excerpt": ex.text[:2000],
    }
