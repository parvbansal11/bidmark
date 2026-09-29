"""Forensics against real PDFs built by app.demo.documents."""
import os
import tempfile

from app.demo import documents as D
from app.engines.cartel_engine import price_screens
from app.forensics import names
from app.forensics.document import inspect
from app.forensics.identifiers import cross_validate, decode_gstin, make_gstin

GSTIN = make_gstin("33", "AABCA4821K")
ADDR = "12 Industrial Estate, Guindy, Chennai, Tamil Nadu 600032"


def _inspect(pdf: bytes, category: str) -> dict:
    fd, path = tempfile.mkstemp(suffix=".pdf")
    with os.fdopen(fd, "wb") as fh:
        fh.write(pdf)
    try:
        return inspect(path, category)
    finally:
        os.remove(path)


def codes(result):
    return {s["code"] for s in result["signals"]}


def test_published_gstin_sample_passes_checksum():
    assert decode_gstin("27AAPFU0939F1ZV").valid
    bad = decode_gstin("27AAPFU0939F1ZW")
    assert not bad.valid and bad.findings[0].code == "GSTIN_CHECKSUM"


def test_company_cin_with_firm_pan_is_flagged():
    found = {f["code"] for f in cross_validate(pan="AAPFU0939F", cin="U29120TN2011PTC081234")["findings"]}
    assert "PAN_TYPE_VS_COMPANY" in found


def test_lookalike_name_is_not_treated_as_a_spelling_variant():
    assert names.compare("Bharat Flowtech Pvt Ltd", "Bharat Flowtek Private Limited")["verdict"] == "LOOKALIKE"
    assert names.compare("Alpha Pumps Pvt Ltd", "Alpha Pumps Private Limited")["verdict"] == "SAME"
    assert names.compare("Alpha Pumps Pvt Ltd", "Alpha Pumps Ltd")["verdict"] == "LEGAL_FORM_DIFFERS"


def test_clean_certificate_has_no_signals_and_fields_carry_positions():
    r = _inspect(D.gst("Alpha Pumps & Engineering Pvt Ltd", GSTIN, ADDR, "01/04/2019").pdf, "GST")
    assert r["signals"] == []
    f = r["extraction"]["fields"]
    assert f["gstin"]["value"] == GSTIN and f["legal_name"]["value"] == "Alpha Pumps & Engineering Pvt Ltd"
    assert f["gstin"]["page"] == 1 and len(f["gstin"]["bbox"]) == 4


def test_retyped_expiry_reports_both_layers():
    oem = D.oem("Coastal Hydraulics Ltd", "Synthetic Pumps", "Pumps", "01/04/2024", "31/03/2025")
    r = _inspect(D.retype(oem, "Valid Upto", "31/03/2027"), "OEM_AUTHORIZATION")
    assert {"OVERLAPPING_TEXT", "FIELD_FONT_OUTLIER", "INCREMENTAL_UPDATES"} <= codes(r)
    overlap = next(s for s in r["signals"] if s["code"] == "OVERLAPPING_TEXT")
    assert overlap["evidence"]["covered_text"] == "31/03/2025"
    assert overlap["evidence"]["visible_text"] == "31/03/2027"
    # Extraction reads what a person sees, not the covered layer.
    assert r["extraction"]["fields"]["valid_until"]["value"] == "2027-03-31"


def test_retype_with_same_glyphs_keeps_the_visible_value():
    ca = D.turnover("Eastline", [("FY 2024-25", "Rs 4.10 Crore")], "25AALC88AB8812", "01/07/2026")
    r = _inspect(D.retype(ca, "Average Annual Turnover", "Rs 6.10 Crore", font="Helvetica-Oblique"), "FINANCIAL")
    assert r["extraction"]["fields"]["turnover_crore"]["value"] == 6.1


def test_signed_clean_is_quiet_and_signed_then_edited_is_caught():
    doc = D.gst("Alpha Pumps & Engineering Pvt Ltd", GSTIN, ADDR, "01/04/2019")
    signed = D.sign(doc.pdf)
    assert codes(_inspect(signed, "GST")) <= {"SIGNER_NOT_TRUSTED"}
    edited = D.retype(D.Doc("GST", signed, doc.fields), "Legal Name", "Alpha Pumps & Engg Pvt Ltd")
    assert "MODIFIED_AFTER_SIGNING" in codes(_inspect(edited, "GST"))


def test_editor_resave_and_inverted_timestamps():
    doc = D.gst("Deccan Pump Works Pvt Ltd", make_gstin("27", "AABCD5678P"), "Pune, Maharashtra", "01/01/2020")
    pdf = D.set_metadata(doc.pdf, {"/Producer": "iLovePDF", "/ModDate": "D:20230101000000+05'30'"})
    assert {"EDITOR_TOOL", "TIMESTAMP_INVERSION"} <= codes(_inspect(pdf, "GST"))


def test_wrong_heading_is_reported():
    pdf = D.udyam("Alpha", "UDYAM-TN-02-0012345", ADDR, "12/06/2021").pdf
    assert "CATEGORY_MISMATCH" in codes(_inspect(pdf, "GST"))


def test_unreadable_file_is_unmeasured_not_clean():
    r = _inspect(b"%PDF-1.4 not really a pdf", "GST")
    assert not r["readable"] and "UNREADABLE" in codes(r)


def test_price_screens():
    ladder = price_screens({"a": 100.0, "b": 102.0, "c": 104.04, "d": 106.12})
    assert "PRICE_LADDER" in {f["code"] for f in ladder["flags"]}
    cover = price_screens({"a": 90.0, "b": 110.0, "c": 111.0, "d": 112.0})
    assert "COVER_BID_GAP" in {f["code"] for f in cover["flags"]}
    spread = price_screens({"a": 95.0, "b": 100.0, "c": 118.0, "d": 131.0})
    assert not spread["flags"]
