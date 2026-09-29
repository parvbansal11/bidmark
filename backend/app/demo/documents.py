"""Synthetic certificate PDFs for the demo dataset and the test suite.

Each document is a plain layout with the fields an officer checks, and a
footer marking it as a synthetic specimen. The tamper helpers reproduce the
edits seen on real submissions: retyping a value over a white box, re-saving
through an online editor, and editing a digitally signed file.
"""
from __future__ import annotations

import io
import os
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from reportlab.lib.pagesizes import A4
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

FOOTER = "SYNTHETIC SPECIMEN GENERATED FOR SOFTWARE TESTING. NOT ISSUED BY ANY AUTHORITY."
LABEL_X, VALUE_X = 50, 290


@dataclass
class Placed:
    x: float
    y: float
    font: str
    size: float
    text: str


@dataclass
class Doc:
    kind: str
    pdf: bytes
    fields: dict[str, Placed] = field(default_factory=dict)


TITLES = {
    "GST": ("Form GST REG-06", "Registration Certificate", "Goods and Services Tax"),
    "UDYAM": ("Udyam Registration Certificate", "Ministry of Micro, Small and Medium Enterprises", ""),
    "PAN": ("Permanent Account Number", "Income Tax Department", "PAN allotment letter"),
    "MCA": ("Certificate of Incorporation", "Registrar of Companies", "Ministry of Corporate Affairs"),
    "OEM_AUTHORIZATION": ("Manufacturer's Authorization Letter", "OEM Authorization", ""),
    "ISO": ("Certificate of Registration", "ISO 9001:2015 Quality Management System", ""),
    "FINANCIAL": ("Turnover Certificate", "Issued by Chartered Accountants", ""),
    "EPFO": ("Certificate of Registration", "Employees' Provident Fund Organisation", ""),
}


def _pdf_date(dt: datetime) -> str:
    return dt.strftime("D:%Y%m%d%H%M%S+05'30'")


def render(kind: str, rows: list[tuple[str, str]], *, author: str = "Issuing Portal", producer: str = "ReportLab PDF Library",
           created: datetime | None = None, value_font: str = "Helvetica") -> Doc:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4, invariant=1)
    c.setAuthor(author)
    c.setCreator("Issuing Portal Certificate Service")
    c.setProducer(producer)
    c.setTitle(TITLES[kind][0])
    w, h = A4
    t1, t2, t3 = TITLES[kind]
    c.setFont("Helvetica-Bold", 18)
    c.drawCentredString(w / 2, h - 80, t1)
    c.setFont("Helvetica", 12)
    c.drawCentredString(w / 2, h - 102, t2)
    if t3:
        c.drawCentredString(w / 2, h - 120, t3)
    c.line(LABEL_X, h - 135, w - LABEL_X, h - 135)

    doc = Doc(kind, b"")
    y = h - 170
    for label, value in rows:
        c.setFont("Helvetica-Bold", 10)
        c.drawString(LABEL_X, y, f"{label}:")
        c.setFont(value_font, 11)
        c.drawString(VALUE_X, y, value)
        doc.fields[label] = Placed(VALUE_X, y, value_font, 11, value)
        y -= 26
    c.setFont("Helvetica", 7)
    c.drawCentredString(w / 2, 40, FOOTER)
    c.save()

    pdf = buf.getvalue()
    created = created or datetime(2024, 4, 1, 10, 0, tzinfo=timezone(timedelta(hours=5, minutes=30)))
    doc.pdf = set_metadata(pdf, {"/CreationDate": _pdf_date(created), "/ModDate": _pdf_date(created)})
    return doc


def set_metadata(pdf: bytes, meta: dict[str, str], incremental: bool = False) -> bytes:
    from pypdf import PdfReader, PdfWriter

    reader = PdfReader(io.BytesIO(pdf))
    writer = PdfWriter(io.BytesIO(pdf), incremental=True) if incremental else PdfWriter(clone_from=reader)
    current = {k: v for k, v in (reader.metadata or {}).items()}
    current.update(meta)
    writer.add_metadata(current)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def retype(doc: Doc, label: str, new_text: str, *, font: str = "Times-Roman", incremental: bool = True,
           producer: str | None = None) -> bytes:
    """Covers a value with a white box and types a new one on top, the cheap edit."""
    from pypdf import PdfReader, PdfWriter

    p = doc.fields[label]
    overlay = io.BytesIO()
    c = canvas.Canvas(overlay, pagesize=A4)
    width = max(stringWidth(p.text, p.font, p.size), stringWidth(new_text, font, p.size)) + 2
    c.setFillColorRGB(1, 1, 1)
    c.rect(p.x - 1, p.y - 3, width, p.size + 4, stroke=0, fill=1)
    c.setFillColorRGB(0, 0, 0)
    c.setFont(font, p.size)
    c.drawString(p.x, p.y, new_text)
    c.save()

    over_page = PdfReader(io.BytesIO(overlay.getvalue())).pages[0]
    if incremental:
        writer = PdfWriter(io.BytesIO(doc.pdf), incremental=True)
    else:
        writer = PdfWriter(clone_from=PdfReader(io.BytesIO(doc.pdf)))
    writer.pages[0].merge_page(over_page)
    if producer:
        writer.add_metadata({"/Producer": producer})
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


_SIGNER = None


def _signer():
    """Loads the synthetic demo CA, creating it on first use. Its certificate is
    copied into TRUST_ROOTS_DIR so documents it signs validate as trusted."""
    global _SIGNER
    if _SIGNER:
        return _SIGNER
    from pyhanko.sign import signers

    from app.core.config import settings

    kp = os.path.join(settings.DEMO_CA_DIR, "demo-ca.key")
    cp = os.path.join(settings.DEMO_CA_DIR, "demo-ca.pem")
    if not (os.path.exists(kp) and os.path.exists(cp)):
        _make_ca(kp, cp)
    os.makedirs(settings.TRUST_ROOTS_DIR, exist_ok=True)
    root = os.path.join(settings.TRUST_ROOTS_DIR, "bidmark-demo-ca.pem")
    if not os.path.exists(root):
        with open(cp, "rb") as src, open(root, "wb") as dst:
            dst.write(src.read())
    _SIGNER = signers.SimpleSigner.load(kp, cp)
    return _SIGNER


def _make_ca(key_path: str, cert_path: str) -> None:
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import NameOID

    os.makedirs(os.path.dirname(key_path), exist_ok=True)
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Synthetic Issuing Authority (test)"),
                      x509.NameAttribute(NameOID.COUNTRY_NAME, "IN")])
    now = datetime.now(timezone.utc)
    cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
            .serial_number(x509.random_serial_number()).not_valid_before(now - timedelta(days=1))
            .not_valid_after(now + timedelta(days=3650))
            .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
            .add_extension(x509.KeyUsage(True, True, False, False, False, True, True, False, False), critical=True)
            .sign(key, hashes.SHA256()))
    with open(key_path, "wb") as fh:
        fh.write(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    with open(cert_path, "wb") as fh:
        fh.write(cert.public_bytes(serialization.Encoding.PEM))


def sign(pdf: bytes) -> bytes:
    from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
    from pyhanko.sign import signers

    w = IncrementalPdfFileWriter(io.BytesIO(pdf))
    out = signers.sign_pdf(w, signers.PdfSignatureMetadata(field_name="IssuerSignature"), signer=_signer())
    return out.getvalue()


def gst(name: str, gstin: str, address: str, liability: str, constitution: str = "Private Limited Company", **kw) -> Doc:
    return render("GST", [
        ("Registration Number", gstin), ("Legal Name", name), ("Trade Name", name),
        ("Constitution of Business", constitution), ("Address of Principal Place of Business", address),
        ("Date of Liability", liability), ("Type of Registration", "Regular"),
    ], **kw)


def udyam(name: str, number: str, address: str, registered: str, category: str = "Small", **kw) -> Doc:
    return render("UDYAM", [
        ("Udyam Registration Number", number), ("Name of Enterprise", name), ("Type of Enterprise", category),
        ("Official Address of Enterprise", address), ("Date of Udyam Registration", registered),
    ], **kw)


def incorporation(name: str, cin: str, incorporated: str, **kw) -> Doc:
    return render("MCA", [
        ("Corporate Identity Number", cin), ("Name of the Company", name),
        ("Date of Incorporation", incorporated), ("Company Type", "Company limited by shares"),
    ], **kw)


def oem(dealer: str, oem_name: str, product: str, issued: str, valid_until: str, **kw) -> Doc:
    return render("OEM_AUTHORIZATION", [
        ("Manufacturer", oem_name), ("Name of Authorized Dealer", dealer), ("Products Covered", product),
        ("Date of Issue", issued), ("Valid Upto", valid_until),
    ], **kw)


def iso(org: str, cert_no: str, issued: str, valid_until: str, **kw) -> Doc:
    return render("ISO", [
        ("Certificate Number", cert_no), ("Certified Organisation", org), ("Standard", "ISO 9001:2015"),
        ("Date of Issue", issued), ("Valid Until", valid_until),
    ], **kw)


def turnover(name: str, fy_rows: list[tuple[str, str]], udin: str, issued: str, **kw) -> Doc:
    rows = [("Name of Bidder", name)] + [(f"Turnover {fy}", amt) for fy, amt in fy_rows]
    rows += [("Average Annual Turnover", fy_rows[-1][1]), ("UDIN", udin), ("Date of Issue", issued)]
    return render("FINANCIAL", rows, **kw)
