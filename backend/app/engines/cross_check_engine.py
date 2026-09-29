"""
Cross-document verification engine — the core "consistency" intelligence
layer. It compares fields extracted from a bidder's different documents (and
the bidder's own declared profile) against each other and flags where they
agree, show a minor variation, or materially disagree.

Relationships checked:
  PAN <-> GST            (GSTIN must embed the PAN)
  PAN <-> MCA             (via company name)
  GST <-> UDYAM           (via company name)
  MCA <-> submitted docs  (via company name / incorporation date)
  Bidder <-> OEM authorization (authorized entity name)
  Turnover <-> financial documents
  Company name <-> all submitted documents
  Address <-> registrations
  Registration dates <-> document dates
"""
from __future__ import annotations

import re
from datetime import date
from typing import Optional

from sqlalchemy.orm import Session

from app.models.bid import BidSubmission
from app.models.bidder import Bidder
from app.models.document import Document
from app.models.verification import CrossCheckResult, Discrepancy

SUFFIXES = [
    "private limited", "pvt. ltd.", "pvt ltd", "limited", "ltd.", "ltd",
    "llp", "inc.", "inc", "corporation", "corp.", "corp",
]


def _normalize(name: Optional[str]) -> str:
    if not name:
        return ""
    n = name.lower().strip()
    for s in SUFFIXES:
        n = n.replace(s, "")
    n = re.sub(r"[^a-z0-9]", "", n)
    return n


def _core(name: Optional[str]) -> str:
    """A looser normalization used only to detect 'still basically the same
    company' for MINOR_VARIATION vs a real MAJOR_MISMATCH."""
    if not name:
        return ""
    return re.sub(r"[^a-z0-9]", "", name.lower())


def classify_values(values: list[str]) -> str:
    present = [v for v in values if v]
    if len(present) <= 1:
        return "NOT_APPLICABLE"
    normalized = {_normalize(v) for v in present}
    if len(normalized) == 1:
        return "MATCH"
    # minor variation: normalized forms share a long common substring
    sample = list(normalized)
    base = sample[0]
    is_minor = all(base in n or n in base or _levenshtein_ratio(base, n) > 0.8 for n in sample[1:])
    return "MINOR_VARIATION" if is_minor else "MAJOR_MISMATCH"


def _levenshtein_ratio(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    m, n = len(a), len(b)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1):
        dp[i][0] = i
    for j in range(n + 1):
        dp[0][j] = j
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            dp[i][j] = min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    dist = dp[m][n]
    return 1 - dist / max(m, n)


def run_cross_check(db: Session, bidder_id: str, tender_id: str) -> dict:
    bidder = db.query(Bidder).filter(Bidder.id == bidder_id).first()
    if not bidder:
        raise ValueError("Bidder not found")

    # Clear previous cross-check results / discrepancies for this bidder+tender
    db.query(CrossCheckResult).filter(CrossCheckResult.bidder_id == bidder_id, CrossCheckResult.tender_id == tender_id).delete()
    db.query(Discrepancy).filter(Discrepancy.bidder_id == bidder_id, Discrepancy.tender_id == tender_id).delete()
    db.commit()

    docs = (
        db.query(Document)
        .filter(Document.bidder_id == bidder_id, Document.is_deleted == False)  # noqa: E712
        .filter((Document.tender_id == tender_id) | (Document.tender_id.is_(None)))
        .all()
    )

    by_category = {d.category: d for d in docs if d.extraction}

    results: list[CrossCheckResult] = []
    discrepancies: list[Discrepancy] = []

    def add_result(field: str, relation: str, sources: list[str], values: list, status: str, requires_review: bool):
        r = CrossCheckResult(
            bidder_id=bidder_id, tender_id=tender_id, field=field, relation=relation,
            sources=sources, values=values, status=status, requires_review=requires_review,
        )
        db.add(r)
        results.append(r)
        return r

    def add_discrepancy(category: str, description: str, severity: str, affected_requirement_type: Optional[str], score_impact: float, cross_check: Optional[CrossCheckResult] = None):
        d = Discrepancy(
            bidder_id=bidder_id, tender_id=tender_id, cross_check_result_id=cross_check.id if cross_check else None,
            category=category, description=description, severity=severity,
            affected_requirement_type=affected_requirement_type, score_impact=score_impact,
        )
        db.add(d)
        discrepancies.append(d)
        return d

    # 1. Company name across all documents that carry one, plus bidder profile
    name_sources, name_values = ["BIDDER_PROFILE"], [bidder.legal_name or bidder.company_name]
    for cat, doc in by_category.items():
        if doc.extraction and doc.extraction.company_name:
            name_sources.append(cat)
            name_values.append(doc.extraction.company_name)
    name_status = classify_values(name_values)
    if name_status != "NOT_APPLICABLE":
        cc = add_result("company_name", "PROFILE<->ALL_DOCUMENTS", name_sources, name_values, name_status, name_status == "MAJOR_MISMATCH")
        if name_status == "MINOR_VARIATION":
            add_discrepancy("NAME_VARIATION", f"Company name shows minor spelling/legal-suffix variation across {', '.join(name_sources)}.", "LOW", None, -3, cc)
        elif name_status == "MAJOR_MISMATCH":
            add_discrepancy("NAME_MISMATCH", f"Company name differs significantly across {', '.join(name_sources)}: {name_values}", "HIGH", None, -15, cc)

    # 2. PAN <-> GST format relationship (GSTIN embeds the PAN)
    pan_doc = by_category.get("PAN")
    gst_doc = by_category.get("GST")
    pan_value = (pan_doc.extraction.pan if pan_doc and pan_doc.extraction else None) or bidder.pan_number
    gstin_value = (gst_doc.extraction.gstin if gst_doc and gst_doc.extraction else None) or bidder.gstin
    if pan_value and gstin_value:
        embedded = gstin_value[2:12].upper() == pan_value.upper()
        status = "MATCH" if embedded else "MAJOR_MISMATCH"
        cc = add_result("pan_in_gstin", "PAN<->GST", ["PAN", "GST"], [pan_value, gstin_value], status, not embedded)
        if not embedded:
            add_discrepancy("PAN_GST_MISMATCH", f"PAN ({pan_value}) is not embedded correctly in GSTIN ({gstin_value}).", "HIGH", "GST", -12, cc)

    # 3. GST <-> UDYAM (via company name, already substantially covered above) + address
    udyam_doc = by_category.get("UDYAM")

    # 4. Address consistency: bidder profile vs any document address
    addr_sources, addr_values = ["BIDDER_PROFILE"], [bidder.registered_address]
    for cat, doc in by_category.items():
        if doc.extraction and doc.extraction.address:
            addr_sources.append(cat)
            addr_values.append(doc.extraction.address)
    addr_status = classify_values(addr_values)
    if addr_status != "NOT_APPLICABLE":
        cc = add_result("address", "PROFILE<->REGISTRATIONS", addr_sources, addr_values, addr_status, addr_status == "MAJOR_MISMATCH")
        if addr_status == "MAJOR_MISMATCH":
            add_discrepancy("ADDRESS_MISMATCH", f"Registered address differs across {', '.join(addr_sources)}.", "MEDIUM", None, -8, cc)

    # 5. Turnover <-> financial / income-tax documents vs declared bid turnover
    bid = db.query(BidSubmission).filter(BidSubmission.bidder_id == bidder_id, BidSubmission.tender_id == tender_id).first()
    turnover_sources, turnover_values = [], []
    if bid and bid.declared_turnover_crore is not None:
        turnover_sources.append("BID_SUBMISSION")
        turnover_values.append(bid.declared_turnover_crore)
    for cat in ("FINANCIAL", "INCOME_TAX"):
        doc = by_category.get(cat)
        if doc and doc.extraction and doc.extraction.turnover_crore is not None:
            turnover_sources.append(cat)
            turnover_values.append(doc.extraction.turnover_crore)
    if len(turnover_values) > 1:
        max_v, min_v = max(turnover_values), min(turnover_values)
        pct_diff = ((max_v - min_v) / max_v * 100) if max_v else 0
        status = "MATCH" if pct_diff <= 10 else ("MINOR_VARIATION" if pct_diff <= 25 else "MAJOR_MISMATCH")
        cc = add_result("turnover_crore", "BID<->FINANCIAL_DOCUMENTS", turnover_sources, turnover_values, status, status == "MAJOR_MISMATCH")
        if status == "MAJOR_MISMATCH":
            add_discrepancy("TURNOVER_MISMATCH", f"Declared turnover varies by {pct_diff:.1f}% across {', '.join(turnover_sources)}.", "MEDIUM", "TURNOVER", -10, cc)

    # 6. Registration dates <-> document dates: MCA issue date vs bidder incorporation date
    mca_doc = by_category.get("MCA")
    if mca_doc and mca_doc.extraction and mca_doc.extraction.issue_date and bidder.incorporation_date:
        try:
            mca_date = date.fromisoformat(mca_doc.extraction.issue_date[:10])
            delta_days = abs((mca_date - bidder.incorporation_date).days)
            status = "MATCH" if delta_days <= 30 else ("MINOR_VARIATION" if delta_days <= 365 else "MAJOR_MISMATCH")
            cc = add_result("registration_date", "MCA<->BIDDER_PROFILE", ["MCA", "BIDDER_PROFILE"], [mca_doc.extraction.issue_date, bidder.incorporation_date.isoformat()], status, status == "MAJOR_MISMATCH")
            if status == "MAJOR_MISMATCH":
                add_discrepancy("DATE_MISMATCH", "MCA certificate date is inconsistent with the bidder's declared incorporation date.", "LOW", "MCA", -5, cc)
        except ValueError:
            pass

    # 7. OEM authorization <-> bidder name
    oem_doc = by_category.get("OEM_AUTHORIZATION")
    if oem_doc and oem_doc.extraction and oem_doc.extraction.company_name:
        status = classify_values([oem_doc.extraction.company_name, bidder.legal_name or bidder.company_name])
        if status != "NOT_APPLICABLE":
            cc = add_result("oem_authorized_entity", "OEM<->BIDDER_PROFILE", ["OEM_AUTHORIZATION", "BIDDER_PROFILE"], [oem_doc.extraction.company_name, bidder.company_name], status, status == "MAJOR_MISMATCH")
            if status == "MAJOR_MISMATCH":
                add_discrepancy("OEM_AUTHORIZATION_MISMATCH", "OEM authorization letter names a different entity than the bidder.", "HIGH", "OEM_AUTHORIZATION", -15, cc)

    db.commit()
    for r in results:
        db.refresh(r)
    for d in discrepancies:
        db.refresh(d)

    return {"cross_checks": results, "discrepancies": discrepancies}
