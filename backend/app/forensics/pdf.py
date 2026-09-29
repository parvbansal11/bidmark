"""Structural forensics on a PDF file.

Every signal here is computed from the file itself and can be reproduced by
anyone with the same bytes. Signals describe what was observed ("the expiry
date is set in a font used nowhere else in the file"); they never conclude
that a document is forged. That call belongs to the officer.
"""
from __future__ import annotations

import io
import logging
import os
import re
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

from app.core.config import settings
from app.forensics.text import Extracted

logging.getLogger("pyhanko").setLevel(logging.CRITICAL)
logging.getLogger("pyhanko_certvalidator").setLevel(logging.CRITICAL)
logging.getLogger("pypdf").setLevel(logging.ERROR)

# Consumer tools that edit existing PDFs. An issuing portal generates
# certificates server side, so one of these as the last writer means someone
# opened and re-saved the file.
EDITOR_TOOLS = [
    "photoshop", "illustrator", "ilovepdf", "smallpdf", "sejda", "pdfescape", "pdf-xchange", "foxit phantompdf",
    "foxit pdf editor", "nitro", "canva", "pdffiller", "dochub", "pdf candy", "soda pdf", "pdfelement", "wondershare",
    "inkscape", "gimp", "libreoffice", "microsoft® word", "microsoft word", "acrobat pro", "adobe acrobat pro",
    "pdfsam", "master pdf editor", "xodo", "pdf24", "pdfgear",
]

CRITICAL_FIELDS = ("valid_until", "issue_date", "legal_name", "gstin", "pan", "cin", "udyam", "turnover_crore")

_PDF_DATE = re.compile(r"D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([Z+\-])?(\d{2})?'?(\d{2})?")


def parse_pdf_date(value) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    m = _PDF_DATE.search(str(value))
    if not m:
        return None
    y, mo, d, h, mi, s, sign, oh, om = m.groups()
    dt = datetime(int(y), int(mo or 1), int(d or 1), int(h or 0), int(mi or 0), int(s or 0))
    offset = timedelta(0)
    if sign in ("+", "-") and oh:
        offset = timedelta(hours=int(oh), minutes=int(om or 0)) * (1 if sign == "+" else -1)
    return dt.replace(tzinfo=timezone(offset))


def _signal(code, severity, title, detail, *, confidence="medium", page=None, bbox=None, evidence=None, field=None):
    return {
        "code": code, "severity": severity, "title": title, "detail": detail, "confidence": confidence,
        "page": page, "bbox": bbox, "field": field, "evidence": evidence or {},
    }


def count_revisions(raw: bytes) -> int:
    eofs = len(re.findall(rb"%%EOF", raw))
    if b"/Linearized" in raw[:2048] and eofs > 1:
        eofs -= 1
    return max(eofs, 1)


def read_metadata(raw: bytes) -> dict:
    from pypdf import PdfReader

    try:
        r = PdfReader(io.BytesIO(raw), strict=False)
        info = r.metadata or {}
        meta = {k.lstrip("/").lower(): str(v) for k, v in info.items() if v is not None}
        xmp_agents: list[str] = []
        try:
            root = r.trailer["/Root"]
            if "/Metadata" in root:
                xmp = root["/Metadata"].get_object().get_data().decode("utf-8", "ignore")
                xmp_agents = sorted(set(re.findall(r"softwareAgent[=>\"']+([^<\"']+)", xmp)))
                for tag in ("CreatorTool", "Producer"):
                    m = re.search(rf"{tag}[=>\"']+([^<\"']+)", xmp)
                    if m:
                        meta[f"xmp_{tag.lower()}"] = m.group(1).strip()
        except Exception:
            pass
        meta["xmp_software_agents"] = xmp_agents
        meta["encrypted"] = bool(r.is_encrypted)
        return meta
    except Exception as exc:
        return {"error": str(exc)}


def check_signatures(raw: bytes) -> tuple[list[dict], list[dict]]:
    """Returns (signature summaries, signals). Uses pyHanko when installed."""
    summaries, signals = [], []
    if b"/ByteRange" not in raw:
        return summaries, signals
    try:
        from pyhanko.pdf_utils.reader import PdfFileReader
        from pyhanko.sign.validation import validate_pdf_signature
        from pyhanko.keys import load_cert_from_pemder
        from pyhanko_certvalidator import ValidationContext
    except Exception:
        return [{"note": "Signature present; pyHanko not installed so it was not validated."}], signals

    try:
        reader = PdfFileReader(io.BytesIO(raw), strict=False)
        sigs = reader.embedded_signatures
    except Exception as exc:
        return [{"error": str(exc)}], [_signal("SIGNATURE_UNREADABLE", "MEDIUM", "Signature could not be parsed",
                                                "The file declares a digital signature that could not be read.", evidence={"error": str(exc)})]
    roots = [load_cert_from_pemder(os.path.join(settings.TRUST_ROOTS_DIR, f))
             for f in sorted(os.listdir(settings.TRUST_ROOTS_DIR)) if f.endswith((".pem", ".crt", ".cer"))
             ] if os.path.isdir(settings.TRUST_ROOTS_DIR) else []
    for sig in sigs:
        entry = {"field": sig.field_name}
        try:
            vc = ValidationContext(trust_roots=roots, allow_fetching=False)
            status = validate_pdf_signature(sig, signer_validation_context=vc)
            cert = status.signing_cert
            entry.update({
                "intact": bool(status.intact),
                "valid": bool(status.valid),
                "trusted": bool(status.trusted),
                "coverage": getattr(status.coverage, "name", str(status.coverage)),
                "modification_level": getattr(status.modification_level, "name", str(status.modification_level)),
                "signer": cert.subject.human_friendly if cert is not None else None,
                "signed_at": str(status.signer_reported_dt) if status.signer_reported_dt else None,
            })
        except Exception as exc:
            entry["error"] = str(exc)
        summaries.append(entry)

        if entry.get("intact") is False:
            signals.append(_signal("SIGNATURE_BROKEN", "HIGH", "Signed content was altered",
                                   "Bytes covered by the digital signature no longer match the signature. "
                                   "The document was changed after it was signed.", confidence="high", evidence=entry))
        elif entry.get("coverage") not in (None, "ENTIRE_FILE") and entry.get("modification_level") not in (None, "NONE", "LTA_UPDATES"):
            signals.append(_signal("MODIFIED_AFTER_SIGNING", "HIGH", "Content added after signing",
                                   f"The signature is intact but only covers an earlier revision. Later changes are "
                                   f"classed as '{entry.get('modification_level')}', which a signed certificate should never need.",
                                   confidence="high", evidence=entry))
        elif entry.get("intact") and not entry.get("trusted"):
            signals.append(_signal("SIGNER_NOT_TRUSTED", "INFO", "Signer not in trust list",
                                   "The signature is intact, but the signing certificate does not chain to a configured "
                                   "trust root (for Indian DSCs, the CCA India root).", confidence="high", evidence=entry))
    return summaries, signals


def _font_outliers(ex: Extracted, fields: dict) -> list[dict]:
    usage = Counter(c["font"] for c in ex.chars if c.get("font") and c.get("text", "").strip())
    if len(usage) < 2:
        return []
    out = []
    for name in CRITICAL_FIELDS:
        ev = fields.get(name)
        if not ev or not ev.get("bbox") or ev.get("source") != "text_layer":
            continue
        x0, top, x1, bottom = ev["bbox"]
        inside = Counter(
            c["font"] for c in ex.chars
            if c.get("page") == ev["page"] and c.get("font") and c["x0"] >= x0 - 1 and c["x1"] <= x1 + 1
            and c["top"] >= top - 1 and c["bottom"] <= bottom + 1 and c["text"].strip()
        )
        for font, n in inside.items():
            share = n / usage[font]
            if share >= 0.9 and usage[font] < sum(usage.values()) * 0.25:
                out.append(_signal(
                    "FIELD_FONT_OUTLIER", "HIGH", f"'{name.replace('_', ' ')}' set in a one-off font",
                    f"The {name.replace('_', ' ')} value '{ev.get('raw')}' is drawn in font '{font}', which appears "
                    f"nowhere else in the document. Text typed over an existing certificate usually leaves exactly this trace.",
                    confidence="high", page=ev["page"], bbox=ev["bbox"], field=name,
                    evidence={"font": font, "chars_in_field": n, "chars_in_document": usage[font], "document_fonts": dict(usage)},
                ))
    return out


def _overlaps(ex: Extracted) -> list[dict]:
    """Reports text that was painted over by other text, and what each layer says."""
    if len(ex.occluded) < 3:
        return []
    rows: dict[tuple[int, int], list[dict]] = defaultdict(list)
    for c in ex.occluded:
        rows[(c["page"], round(c["top"] / 4))].append(c)
    out = []
    for (page, _), under in rows.items():
        if len(under) < 3:
            continue
        under.sort(key=lambda c: c["x0"])
        bbox = [round(min(c["x0"] for c in under), 1), round(min(c["top"] for c in under), 1),
                round(max(c["x1"] for c in under), 1), round(max(c["bottom"] for c in under), 1)]
        over = sorted((c for c in ex.chars if c["page"] == page and c["x1"] > bbox[0] and c["x0"] < bbox[2]
                       and c["bottom"] > bbox[1] and c["top"] < bbox[3]), key=lambda c: c["x0"])
        hidden_text = "".join(c["text"] for c in under).strip()
        visible_text = "".join(c["text"] for c in over).strip()
        out.append(_signal(
            "OVERLAPPING_TEXT", "HIGH", "Text typed over other text",
            f"On page {page}, '{visible_text}' is printed on top of '{hidden_text}'. The original value is still in "
            "the file underneath. Issuers regenerate a certificate; they do not type over it.",
            confidence="high", page=page, bbox=bbox,
            evidence={"covered_text": hidden_text, "visible_text": visible_text,
                      "covered_fonts": sorted({c["font"] for c in under if c.get("font")}),
                      "visible_fonts": sorted({c["font"] for c in over if c.get("font")})},
        ))
    return out


def _hidden_text(ex: Extracted) -> list[dict]:
    def white(color):
        if color is None:
            return False
        vals = color if isinstance(color, (list, tuple)) else [color]
        return len(vals) in (1, 3) and all(isinstance(v, (int, float)) and v >= 0.97 for v in vals) or (
            len(vals) == 4 and all(isinstance(v, (int, float)) and v <= 0.03 for v in vals))

    hidden = [c for c in ex.chars if c.get("text", "").strip() and (white(c.get("color")) or (c.get("size") or 10) < 1.0)]
    if len(hidden) < 4:
        return []
    by_page = Counter(c["page"] for c in hidden)
    page = by_page.most_common(1)[0][0]
    txt = "".join(c["text"] for c in hidden if c["page"] == page)[:80]
    return [_signal("HIDDEN_TEXT", "MEDIUM", "Invisible text in the text layer",
                    f"{len(hidden)} characters are white or sub-1pt, so they read as text to software but are invisible on screen.",
                    page=page, evidence={"count": len(hidden), "sample": txt})]


def analyse_pdf(raw: bytes, ex: Extracted, fields: dict) -> dict:
    signals: list[dict] = []
    meta = read_metadata(raw)
    revisions = count_revisions(raw)
    sig_summaries, sig_signals = check_signatures(raw)
    signals += sig_signals

    # A signature is itself an incremental save; only flag revisions it doesn't account for.
    signed_whole_file = any(x.get("intact") and x.get("coverage") == "ENTIRE_FILE" for x in sig_summaries)
    if revisions > 1 and not sig_signals and not signed_whole_file:
        signals.append(_signal("INCREMENTAL_UPDATES", "MEDIUM", f"Saved {revisions} times",
                               f"The file carries {revisions - 1} incremental update(s) on top of the original. "
                               "Something was appended after the file was first produced.",
                               confidence="high", evidence={"revisions": revisions}))

    created, modified = parse_pdf_date(meta.get("creationdate")), parse_pdf_date(meta.get("moddate"))
    if created and modified:
        if modified < created - timedelta(minutes=1):
            signals.append(_signal("TIMESTAMP_INVERSION", "MEDIUM", "Modified before it was created",
                                   f"ModDate {modified.isoformat()} is earlier than CreationDate {created.isoformat()}. "
                                   "Normal software never writes this; hand-edited metadata does.",
                                   confidence="high", evidence={"created": created.isoformat(), "modified": modified.isoformat()}))
        elif modified - created > timedelta(days=1) and not any(x.get("intact") for x in sig_summaries):
            signals.append(_signal("MODIFIED_LATER", "LOW", "Re-saved after issue",
                                   f"Last modified {(modified - created).days} days after creation.",
                                   evidence={"created": created.isoformat(), "modified": modified.isoformat()}))

    writers = [meta.get(k, "") for k in ("producer", "creator", "xmp_creatortool", "xmp_producer")] + meta.get("xmp_software_agents", [])
    hit = next(((w, t) for w in writers if w for t in EDITOR_TOOLS if t in w.lower()), None)
    if hit:
        signals.append(_signal("EDITOR_TOOL", "MEDIUM", "Last written by an editing tool",
                               f"Metadata names '{hit[0]}'. Issuing portals generate certificates server side, "
                               "so this file was opened and re-saved in an editor.",
                               confidence="medium", evidence={"writers": [w for w in writers if w]}))

    signals += _font_outliers(ex, fields)
    signals += _overlaps(ex)
    signals += _hidden_text(ex)

    active = [k.decode() for k in (b"/JavaScript", b"/Launch", b"/EmbeddedFile", b"/OpenAction") if k in raw]
    if any(k in active for k in ("/JavaScript", "/Launch", "/EmbeddedFile")):
        signals.append(_signal("ACTIVE_CONTENT", "MEDIUM", "Scripts or attachments inside the PDF",
                               f"The file contains {', '.join(active)}. A certificate has no reason to carry these.",
                               confidence="high", evidence={"markers": active}))

    return {
        "kind": "pdf",
        "metadata": meta,
        "revisions": revisions,
        "signatures": sig_summaries,
        "fonts": dict(Counter(c["font"] for c in ex.chars if c.get("font"))),
        "signals": signals,
    }
