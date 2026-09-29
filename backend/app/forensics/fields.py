"""Pulls statutory fields out of extracted text, each with where it was found."""
from __future__ import annotations

import re
from datetime import date, datetime

from app.forensics.text import Extracted, Line, Word, find_in_lines, union_bbox

GSTIN_PAT = re.compile(r"\b\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]\b")
PAN_PAT = re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b")
CIN_PAT = re.compile(r"\b[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}\b")
UDYAM_PAT = re.compile(r"\bUDYAM-[A-Z]{2}-\d{2}-\d{7}\b")

_MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december"
DATE_PAT = re.compile(
    rf"\b(\d{{1,2}}[/.-]\d{{1,2}}[/.-]\d{{4}}|\d{{4}}-\d{{2}}-\d{{2}}|\d{{1,2}}(?:st|nd|rd|th)?\s+(?:{_MONTHS})[a-z]*,?\s+\d{{4}}|(?:{_MONTHS})[a-z]*\s+\d{{1,2}},?\s+\d{{4}})\b",
    re.I,
)

LABELS = {
    "legal_name": [
        r"legal name(?: of (?:the )?business)?", r"name of (?:the )?(?:enterprise|company|firm|entity|bidder|applicant|taxpayer|establishment)",
        r"company name", r"entity name", r"authori[sz]ed (?:dealer|distributor|partner|entity)", r"name of (?:the )?authori[sz]ed \w+",
        r"certified (?:organisation|organization|entity)", r"name",
    ],
    "trade_name": [r"trade name"],
    "address": [
        r"address of principal place of business", r"registered (?:office )?address", r"official address(?: of (?:the )?enterprise)?",
        r"address",
    ],
    "issue_date": [
        r"date of (?:issue|registration|incorporation|liability|certification)", r"issue date", r"issued on", r"registration date",
        r"date of udyam registration", r"certificate date",
    ],
    "valid_until": [
        r"valid (?:up ?to|upto|till|until|through)", r"validity(?: period)?(?: up ?to| till)?", r"expiry date", r"date of expiry",
        r"expires on", r"period of validity",
    ],
    "turnover": [r"average annual turnover", r"(?:annual )?turnover(?: for| in)?(?: fy| the)?[^:]*"],
}

DOC_TYPE_HINTS = [
    ("GST", [r"form gst reg-06", r"registration certificate.*goods and services tax", r"goods and services tax"]),
    ("UDYAM", [r"udyam registration certificate", r"ministry of micro,? small"]),
    ("PAN", [r"permanent account number", r"income tax department"]),
    ("MCA", [r"certificate of incorporation", r"registrar of companies", r"ministry of corporate affairs"]),
    ("OEM_AUTHORIZATION", [r"manufacturer'?s? authori[sz]ation", r"oem authori[sz]ation", r"authori[sz]ation (?:letter|certificate)"]),
    ("EPFO", [r"employees'? provident fund", r"epfo"]),
    ("ESIC", [r"employees'? state insurance"]),
    ("FINANCIAL", [r"chartered accountants?", r"turnover certificate", r"udin"]),
    ("ISO", [r"iso 9001", r"iso 14001", r"quality management system"]),
    ("LOCAL_CONTENT", [r"local content", r"class-?i local supplier"]),
    ("NSIC", [r"national small industries corporation"]),
]


def parse_date(raw: str) -> date | None:
    s = re.sub(r"(\d)(st|nd|rd|th)", r"\1", raw.strip().rstrip(".,"), flags=re.I).replace(",", "")
    s = re.sub(r"\s+", " ", s)
    fmts = ["%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%Y-%m-%d", "%d %b %Y", "%d %B %Y", "%b %d %Y", "%B %d %Y"]
    for f in fmts:
        try:
            return datetime.strptime(s.replace("Sept", "Sep"), f).date()
        except ValueError:
            continue
    return None


def _evidence(field_name: str, value, raw: str, line: Line, words: list[Word], label: str | None, confidence: float) -> dict:
    fonts = sorted({w.font for w in words if w.font})
    sizes = sorted({round(w.size, 1) for w in words if w.size})
    return {
        "field": field_name,
        "value": value,
        "raw": raw,
        "label": label,
        "page": line.page,
        "bbox": union_bbox(words),
        "line_text": line.text,
        "fonts": fonts,
        "sizes": sizes,
        "source": words[0].source if words else None,
        "confidence": confidence,
    }


def _label_value(lines: list[Line], idx: int, label_pat: re.Pattern):
    """Value after 'Label:' on the same line, or the next line when the label stands alone."""
    line = lines[idx]
    m = label_pat.search(line.text)
    if not m:
        return None
    rest_start = m.end()
    tail = line.text[rest_start:]
    tail_clean = re.sub(r"^\s*[:\-–]\s*", "", tail)
    offset = rest_start + (len(tail) - len(tail_clean))
    if tail_clean.strip():
        target, start = line, offset
    elif idx + 1 < len(lines) and lines[idx + 1].page == line.page:
        target, start = lines[idx + 1], 0
    else:
        return None
    text = target.text[start:].strip()
    pos, covered = 0, []
    for w in target.words:
        if pos + len(w.text) > start:
            covered.append(w)
        pos += len(w.text) + 1
    return text, target, covered, m.group(0)


def _labelled(lines: list[Line], name: str) -> dict | None:
    for pat in LABELS[name]:
        rx = re.compile(rf"^\s*(?:\d+\.\s*)?{pat}\b", re.I)
        for i, line in enumerate(lines):
            got = _label_value(lines, i, rx)
            if got and got[0]:
                return {"text": got[0], "line": got[1], "words": got[2], "label": got[3]}
    return None


def detect_type(text: str) -> tuple[str | None, list[str]]:
    low = text.lower()
    scores = []
    for cat, pats in DOC_TYPE_HINTS:
        hits = [p for p in pats if re.search(p, low)]
        if hits:
            scores.append((len(hits), cat, hits))
    if not scores:
        return None, []
    scores.sort(reverse=True)
    return scores[0][1], scores[0][2]


def extract_fields(ex: Extracted) -> dict:
    lines = ex.lines
    out: dict[str, dict] = {}

    for key, pat in (("gstin", GSTIN_PAT), ("cin", CIN_PAT), ("udyam", UDYAM_PAT)):
        hits = find_in_lines(lines, pat)
        if hits:
            m, line, words = hits[0]
            out[key] = _evidence(key, m.group(0), m.group(0), line, words, None, 0.99)
            if len({h[0].group(0) for h in hits}) > 1:
                out[key]["other_values"] = sorted({h[0].group(0) for h in hits} - {m.group(0)})

    pan_hits = [h for h in find_in_lines(lines, PAN_PAT) if not any(h[0].group(0) in (out.get(k, {}).get("value") or "") for k in ("gstin", "cin"))]
    if pan_hits:
        m, line, words = pan_hits[0]
        out["pan"] = _evidence("pan", m.group(0), m.group(0), line, words, None, 0.99)

    for name in ("legal_name", "trade_name", "address"):
        hit = _labelled(lines, name)
        if hit:
            value = re.split(r"\s{2,}|\s+(?:gstin|pan|cin|trade name|date)\b", hit["text"], flags=re.I)[0].strip(" .,:")
            if value:
                out[name] = _evidence(name, value, hit["text"], hit["line"], hit["words"], hit["label"], 0.9)

    for name in ("issue_date", "valid_until"):
        hit = _labelled(lines, name)
        if not hit:
            continue
        dm = DATE_PAT.findall(hit["text"])
        if not dm:
            continue
        # "Valid from X to Y" carries two dates; the expiry is the last one.
        raw = dm[-1] if name == "valid_until" else dm[0]
        parsed = parse_date(raw)
        if not parsed:
            continue
        date_words = [w for w in hit["words"] if w.text in raw or raw.startswith(w.text) or w.text.rstrip(".,") in raw.split()]
        out[name] = _evidence(name, parsed.isoformat(), raw, hit["line"], date_words or hit["words"], hit["label"], 0.92)

    hit = _labelled(lines, "turnover")
    if hit:
        m = re.search(r"(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d+)?)\s*(crore|cr|lakh|lakhs|lac)?", hit["text"], re.I)
        if m:
            amount = float(m.group(1).replace(",", ""))
            unit = (m.group(2) or "").lower()
            crore = amount / 100 if unit.startswith("la") else amount if unit.startswith("cr") else amount / 1e7
            out["turnover_crore"] = _evidence("turnover_crore", round(crore, 4), m.group(0), hit["line"], hit["words"], hit["label"], 0.85)

    detected, hints = detect_type(ex.text)
    return {
        "fields": out,
        "detected_type": detected,
        "type_hints": hints,
        "method": ex.method,
        "pages": ex.pages,
        "page_sizes": ex.page_sizes,
        "ocr_pages": ex.ocr_pages,
        "text_chars": len(ex.text),
    }
