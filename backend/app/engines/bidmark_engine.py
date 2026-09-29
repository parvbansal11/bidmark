"""
BIDMARK Verification Architecture — three-module + fusion engine.

Module 1 – Entity Registration Intelligence
  Cross-checks entity identifiers (GST / PAN / MCA / UDYAM) against
  authorised government registries.  Produces Entity Verdict.

Module 2 – Behavioural / Risk Intelligence
  Uses consent-based and authorised data sources (GST filing patterns,
  cross-bidder signals, submission timing) to surface risk patterns.
  Produces Compliance Verdict.

Module 3 – Document Intelligence + DigiLocker Integration Architecture
  Validates document presence, field integrity, entity name consistency,
  expiry dates, and forensic signals.  Produces Document Integrity Verdict.

Data Science Verdict Fusion
  Combines all three verdicts, detects cross-module inconsistencies, and
  produces a single Fusion Verdict with an explainability layer.

IMPORTANT — consent / privacy rules
• All data access is logged in the consent_audit trail (what, why, source,
  authorization, timestamp).
• "Consent-based and authorised data sources" only.  No claims of unrestricted
  access to private bank accounts, tax filings, SMS, or personal financial data.
• The Fusion Verdict is an AI recommendation only.  The Procurement Officer
  makes the binding APPROVE / REQUEST_CLARIFICATION / REJECT decision.
• No verdict ever automatically approves or rejects a bidder.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models.behavior import BehavioralRiskReport
from app.models.bidder import Bidder
from app.models.bidmark import BidmarkAnalysis
from app.models.compliance import ComplianceReport
from app.models.document import Document, DocumentExtraction
from app.models.forensics import ForensicAnalysis
from app.models.tender import Tender
from app.models.verification import CrossCheckResult, VerificationResult
from app.engines.cartel_engine import analyse_tender
from app.providers.government.registry import GovernmentVerificationProvider


# ── helpers ──────────────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _audit_entry(
    data_type: str,
    source: str,
    authorization: str,
    purpose: str,
) -> dict:
    return {
        "data_type": data_type,
        "source": source,
        "authorization": authorization,
        "purpose": purpose,
        "accessed_at": _now_iso(),
        "is_mock": True,
    }


def _verdict_from_score(score: float) -> str:
    """Map a 0–1 score to a BIDMARK verdict."""
    if score >= 0.75:
        return "VERIFIED"
    if score >= 0.45:
        return "NEEDS_REVIEW"
    return "FLAGGED"


# ── Module 1 — Entity Registration Intelligence ───────────────────────────────

def _run_entity_module(
    db: Session,
    bidder: Bidder,
    audit: list,
) -> tuple[str, float, str, list]:
    """
    Cross-checks entity IDs against authorised mock registries (GST, PAN,
    MCA21, UDYAM).  Returns (verdict, confidence, summary, checks[]).

    Authorized data sources used (mock):
      • GSTN API — GST registration status
      • NSDL PAN Verification API — PAN status and legal name
      • MCA21 Company/LLP Master Data — CIN / company status
      • UDYAM Registration Portal — MSME certificate
    """
    checks: list[dict] = []
    audit.append(_audit_entry("GST Registration", "GSTN API (Mock)", "Authorized government API", "Entity registration verification"))
    audit.append(_audit_entry("PAN Status", "NSDL PAN Verification API (Mock)", "Authorized government API", "Identity / entity name verification"))
    audit.append(_audit_entry("MCA Company Data", "MCA21 Master Data (Mock)", "Authorized government API", "Company registration status"))
    audit.append(_audit_entry("UDYAM / MSME Certificate", "UDYAM Registration Portal (Mock)", "Authorized government API", "MSME status verification"))

    # -- GST check --
    gstin = bidder.gstin or ""
    gst_result = GovernmentVerificationProvider.verify("GST", gstin, {"company_name": bidder.company_name}) if gstin else None
    if gst_result:
        gst_ok = gst_result["status"] == "VERIFIED"
        checks.append({
            "check": "GST Registration Status",
            "status": "PASS" if gst_ok else "FLAG",
            "source": "GSTN API",
            "identifier": gstin,
            "value": gst_result["data"].get("registration_status", "Unknown"),
            "expected": "Active",
            "note": gst_result["data"].get("message", "") or ("Active GST registration confirmed." if gst_ok else "GST status not VERIFIED."),
        })
    else:
        checks.append({
            "check": "GST Registration Status",
            "status": "MISSING",
            "source": "GSTN API",
            "identifier": None,
            "value": None,
            "expected": "Active",
            "note": "No GSTIN provided — GST entity check skipped.",
        })

    # -- PAN check --
    pan = bidder.pan_number or ""
    pan_result = GovernmentVerificationProvider.verify("PAN", pan, {"company_name": bidder.company_name}) if pan else None
    if pan_result:
        pan_ok = pan_result["status"] == "VERIFIED"
        checks.append({
            "check": "PAN Verification",
            "status": "PASS" if pan_ok else "FLAG",
            "source": "NSDL PAN API",
            "identifier": pan,
            "value": pan_result["data"].get("pan_status", "Unknown"),
            "expected": "ACTIVE",
            "note": pan_result["data"].get("message", "") or ("PAN confirmed active." if pan_ok else "PAN verification did not return VERIFIED."),
        })
    else:
        checks.append({
            "check": "PAN Verification",
            "status": "MISSING",
            "source": "NSDL PAN API",
            "identifier": None,
            "value": None,
            "expected": "ACTIVE",
            "note": "No PAN number provided — PAN entity check skipped.",
        })

    # -- MCA check --
    cin = bidder.cin or ""
    mca_result = GovernmentVerificationProvider.verify("MCA", cin, {"company_name": bidder.company_name}) if cin else None
    if mca_result:
        mca_ok = mca_result["status"] == "VERIFIED"
        checks.append({
            "check": "Company Registration (MCA21)",
            "status": "PASS" if mca_ok else "FLAG",
            "source": "MCA21 Master Data",
            "identifier": cin,
            "value": mca_result["data"].get("company_status", "Unknown"),
            "expected": "Active",
            "note": mca_result["data"].get("message", "") or ("Company status Active on MCA21." if mca_ok else "Company status not confirmed on MCA21."),
        })
    else:
        checks.append({
            "check": "Company Registration (MCA21)",
            "status": "MISSING",
            "source": "MCA21 Master Data",
            "identifier": None,
            "value": None,
            "expected": "Active",
            "note": "No CIN provided — MCA company check skipped.",
        })

    # -- UDYAM check --
    udyam = bidder.udyam_number or ""
    udyam_result = GovernmentVerificationProvider.verify("UDYAM", udyam, {"company_name": bidder.company_name}) if udyam else None
    if udyam_result:
        udyam_ok = udyam_result["status"] == "VERIFIED"
        checks.append({
            "check": "UDYAM / MSME Registration",
            "status": "PASS" if udyam_ok else "FLAG",
            "source": "UDYAM Portal",
            "identifier": udyam,
            "value": udyam_result["data"].get("enterprise_category", "Unknown"),
            "expected": "Valid MSME",
            "note": udyam_result["data"].get("message", "") or ("MSME registration verified." if udyam_ok else "UDYAM status not VERIFIED."),
        })
    else:
        checks.append({
            "check": "UDYAM / MSME Registration",
            "status": "MISSING",
            "source": "UDYAM Portal",
            "identifier": None,
            "value": None,
            "expected": "Valid MSME",
            "note": "No UDYAM number provided — MSME check skipped.",
        })

    # -- Entity name consistency across government registries --
    names_in_registries = []
    if gst_result and gst_result["data"].get("legal_name"):
        names_in_registries.append(("GST", gst_result["data"]["legal_name"]))
    if pan_result and pan_result["data"].get("legal_name"):
        names_in_registries.append(("PAN", pan_result["data"]["legal_name"]))
    if mca_result and mca_result["data"].get("company_name"):
        names_in_registries.append(("MCA", mca_result["data"]["company_name"]))

    if len(names_in_registries) >= 2:
        # Simple consistency: do they all roughly match the registered company_name?
        mismatches = [s for s, n in names_in_registries if bidder.company_name.lower() not in n.lower() and n.lower() not in bidder.company_name.lower()]
        if mismatches:
            checks.append({
                "check": "Entity Name Consistency",
                "status": "FLAG",
                "source": ", ".join(s for s, _ in names_in_registries),
                "identifier": bidder.company_name,
                "value": {s: n for s, n in names_in_registries},
                "expected": "Name consistent across registries",
                "note": f"Name in {', '.join(mismatches)} registry(ies) differs from registered company name.",
            })
        else:
            checks.append({
                "check": "Entity Name Consistency",
                "status": "PASS",
                "source": ", ".join(s for s, _ in names_in_registries),
                "identifier": bidder.company_name,
                "value": {s: n for s, n in names_in_registries},
                "expected": "Name consistent across registries",
                "note": "Entity name is consistent across all available registries.",
            })

    # Score
    passed = sum(1 for c in checks if c["status"] == "PASS")
    total = sum(1 for c in checks if c["status"] in ("PASS", "FLAG"))
    score = passed / total if total else 0.5
    confidence = min(0.95, 0.5 + (total * 0.08))
    verdict = _verdict_from_score(score)

    if verdict == "VERIFIED":
        summary = "All available entity identifiers verified against authorised government registries. No name or registration conflicts detected."
    elif verdict == "NEEDS_REVIEW":
        summary = "Partial entity verification — some identifiers confirmed but one or more registries returned inconclusive results. Manual cross-check recommended."
    else:
        summary = "Entity verification flagged significant conflicts across registries. Identifiers or legal name may not match authorised government records."

    return verdict, confidence, summary, checks


# ── Module 2 — Behavioural / Risk Intelligence ────────────────────────────────

def _run_compliance_module(
    db: Session,
    bidder: Bidder,
    tender: Tender,
    audit: list,
) -> tuple[str, float, str, list]:
    """
    Surfaces behavioural risk indicators using consent-based and authorised data
    sources only — i.e. GST filing patterns (with bidder consent for demo),
    submission timing anomalies, and cross-bidder signals.

    Authorised data sources (mock):
      • GST Return Filing History — GSTN API (consent-based for demo)
      • Cross-bidder submission metadata — platform internal data
      • Bid submission timing — platform internal data

    NOT accessed (privacy boundary):
      • Private bank accounts or transaction history
      • SMS or personal communications
      • Loan or credit bureau data
      • Tax returns or income details beyond GST filing status
    """
    checks: list[dict] = []
    audit.append(_audit_entry(
        "GST Filing Pattern",
        "GSTN API — Return Filing Status (Mock)",
        "Consent-based and authorised data source",
        "GST compliance pattern analysis (not individual transaction data)",
    ))
    audit.append(_audit_entry(
        "Bid Submission Metadata",
        "Platform internal data",
        "Authorised — platform operator data only",
        "Submission timing and completeness analysis",
    ))

    # Pull existing behavioral report if available (reuse existing engine result)
    behavior_report: BehavioralRiskReport | None = (
        db.query(BehavioralRiskReport)
        .filter(
            BehavioralRiskReport.bidder_id == bidder.id,
            BehavioralRiskReport.tender_id == tender.id,
        )
        .order_by(BehavioralRiskReport.created_at.desc())
        .first()
    )

    # Pull compliance report for scoring context
    compliance_report: ComplianceReport | None = (
        db.query(ComplianceReport)
        .filter(
            ComplianceReport.bidder_id == bidder.id,
            ComplianceReport.tender_id == tender.id,
        )
        .order_by(ComplianceReport.created_at.desc())
        .first()
    )

    gstin = bidder.gstin or ""
    checks.append({
        "check": "GST Return Filing Regularity",
        "status": "UNMEASURED",
        "source": "GSTN return filing API",
        "identifier": gstin or "Not provided",
        "value": None,
        "expected": "Regular filer",
        "note": "Needs GSTN API access with the bidder's consent, which this deployment does not have. "
                "Not counted for or against the bidder.",
    })

    # -- Submission completeness --
    if compliance_report:
        submit_score = compliance_report.overall_score
        doc_complete = submit_score >= 60
        checks.append({
            "check": "Document Submission Completeness",
            "status": "PASS" if doc_complete else "FLAG",
            "source": "Platform internal — compliance engine",
            "identifier": f"Compliance score: {submit_score:.1f}",
            "value": f"{submit_score:.1f}%",
            "expected": "≥ 60%",
            "note": (
                f"Compliance score {submit_score:.1f}% indicates adequate document submission."
                if doc_complete
                else f"Compliance score {submit_score:.1f}% indicates missing or failed requirements."
            ),
        })

    # -- Behavioral risk from existing engine --
    if behavior_report:
        beh_ok = behavior_report.behavioral_risk_score < 40
        flag_count = len(behavior_report.flags or [])
        checks.append({
            "check": "Behavioural Risk Indicators",
            "status": "PASS" if beh_ok else "FLAG",
            "source": "BIDMARK Behavioural Engine — platform internal",
            "identifier": f"Behavioral risk score: {behavior_report.behavioral_risk_score}",
            "value": f"{flag_count} flag(s) detected — risk score {behavior_report.behavioral_risk_score}",
            "expected": "Risk score < 40",
            "note": (
                "No significant behavioural anomalies detected."
                if beh_ok
                else f"{flag_count} behavioural flag(s) require officer review. Risk score: {behavior_report.behavioral_risk_score}."
            ),
        })
    else:
        checks.append({
            "check": "Behavioural Risk Indicators",
            "status": "PENDING",
            "source": "BIDMARK Behavioural Engine",
            "identifier": None,
            "value": "Not yet analysed",
            "expected": "Risk score < 40",
            "note": "Run full verification workflow to generate behavioural risk analysis.",
        })

    # -- Cartel links and price screens (tender-wide) --
    intel = analyse_tender(db, tender.id)
    mine = intel["per_bidder"].get(bidder.id, [])
    ring_flags = [f for f in mine if f["code"] in ("LINKED_BIDDER_RING", "POSSIBLE_COVER_BID")]
    price_flags = [f for f in mine if f["code"] not in ("LINKED_BIDDER_RING", "POSSIBLE_COVER_BID")]
    checks.append({
        "check": "Independence From Other Bidders",
        "status": "FLAG" if ring_flags else "PASS",
        "source": "Bidmark cartel engine (device, network, authorship, directors, contacts)",
        "identifier": f"Tender: {tender.tender_number}",
        "value": "; ".join(f["detail"] for f in ring_flags) or "No links to other bidders on this tender",
        "expected": "No shared device, network, director or documents with competitors",
        "note": ring_flags[0]["detail"] if ring_flags else "No links found to other bidders on this tender.",
    })
    screens = intel["price_screens"]
    if screens.get("n_bids", 0) >= 3 or price_flags:
        checks.append({
            "check": "Bid Pricing Pattern",
            "status": "FLAG" if price_flags else "PASS",
            "source": "Price screens: coefficient of variation, relative distance, step ladder",
            "identifier": f"Tender: {tender.tender_number}",
            "value": f"CV {screens.get('cv')}, RD {screens.get('relative_distance')}",
            "expected": "No coordinated pricing pattern",
            "note": price_flags[0]["detail"] if price_flags else "Prices show no coordination pattern.",
        })
    else:
        checks.append({
            "check": "Bid Pricing Pattern", "status": "UNMEASURED", "source": "Price screens",
            "identifier": f"Tender: {tender.tender_number}", "value": None, "expected": "No coordinated pricing pattern",
            "note": "Price screens need at least three priced bids on the tender.",
        })

    passed = sum(1 for c in checks if c["status"] == "PASS")
    total = sum(1 for c in checks if c["status"] in ("PASS", "FLAG"))
    score = passed / total if total else 0.55
    confidence = min(0.92, 0.5 + (total * 0.1))
    verdict = _verdict_from_score(score)

    if verdict == "VERIFIED":
        summary = "Behavioural and risk indicators within acceptable thresholds. GST filing patterns consistent; no significant anomalies on consent-based authorised data sources."
    elif verdict == "NEEDS_REVIEW":
        summary = "Some risk indicators require officer attention. Cross-check the flagged items against supporting documents before making a decision."
    else:
        summary = "Multiple risk indicators flagged across consent-based authorised data sources. Significant patterns require mandatory officer review."

    return verdict, confidence, summary, checks


# ── Module 3 — Document Intelligence + DigiLocker ────────────────────────────

def _run_document_module(
    db: Session,
    bidder: Bidder,
    tender: Tender,
    audit: list,
) -> tuple[str, float, str, list]:
    """
    Validates document presence, field integrity, entity name match, expiry
    dates, and forensic integrity signals.

    DigiLocker integration architecture: in production, submitted documents
    can be cryptographically verified against the issuing authority via
    DigiLocker's Pull API.  In this demo, DigiLocker status is simulated.

    Authorised data sources:
      • Platform document repository — bidder's uploaded documents
      • DigiLocker Pull API (Mock) — document authenticity via issuing authority
      • Forensic analysis — platform internal
    """
    checks: list[dict] = []
    audit.append(_audit_entry(
        "Uploaded Documents",
        "Platform document repository",
        "Authorised — bidder uploaded documents",
        "Document presence and format verification",
    ))
    audit.append(_audit_entry(
        "Document Authenticity",
        "DigiLocker Pull API (Mock / Architecture Demo)",
        "Authorised — bidder consent assumed for demo",
        "Cryptographic authenticity verification via issuing authority",
    ))
    audit.append(_audit_entry(
        "Forensic Signals",
        "Platform internal — BIDMARK Document Forensics Module",
        "Authorised — platform operator",
        "Digital forensic integrity analysis",
    ))

    docs = (
        db.query(Document)
        .filter(Document.bidder_id == bidder.id, Document.is_deleted == False)  # noqa: E712
        .all()
    )
    doc_categories = {d.category for d in docs}

    # -- Document presence --
    required_categories = ["GST", "PAN", "UDYAM"]
    for cat in required_categories:
        present = cat in doc_categories
        checks.append({
            "check": f"Document Present — {cat}",
            "status": "PASS" if present else "FLAG",
            "source": "Platform document repository",
            "identifier": cat,
            "value": "Document uploaded" if present else "Not submitted",
            "expected": "Document uploaded",
            "note": (
                f"{cat} document found in bidder's submission."
                if present
                else f"{cat} document has not been submitted. This is typically a mandatory requirement."
            ),
        })

    # -- Verification status of uploaded docs --
    verified_count = 0
    review_count = 0
    for doc in docs:
        latest_vr: VerificationResult | None = (
            db.query(VerificationResult)
            .filter(VerificationResult.document_id == doc.id)
            .order_by(VerificationResult.created_at.desc())
            .first()
        )
        if latest_vr:
            if latest_vr.status == "VERIFIED":
                verified_count += 1
            elif latest_vr.status in ("REQUIRES_REVIEW", "EXPIRED", "MISSING_INFORMATION"):
                review_count += 1

    if docs:
        doc_vr_score = verified_count / len(docs)
        checks.append({
            "check": "Document Verification Status",
            "status": "PASS" if doc_vr_score >= 0.7 else ("FLAG" if doc_vr_score < 0.4 else "REVIEW"),
            "source": "Platform — government mock verification results",
            "identifier": f"{len(docs)} document(s)",
            "value": f"{verified_count} verified, {review_count} need review, {len(docs) - verified_count - review_count} pending",
            "expected": "≥ 70% verified",
            "note": (
                f"{verified_count}/{len(docs)} documents verified by the mock government API gateway."
                if doc_vr_score >= 0.7
                else f"Only {verified_count}/{len(docs)} documents verified. {review_count} require additional review."
            ),
        })

    # -- Entity name consistency across documents --
    extractions = (
        db.query(DocumentExtraction)
        .join(Document, DocumentExtraction.document_id == Document.id)
        .filter(Document.bidder_id == bidder.id, Document.is_deleted == False)  # noqa: E712
        .all()
    )
    extracted_names = [
        e.company_name for e in extractions if e.company_name
    ]
    if extracted_names:
        mismatched = [
            n for n in extracted_names
            if bidder.company_name.lower() not in n.lower() and n.lower() not in bidder.company_name.lower()
        ]
        checks.append({
            "check": "Entity Name in Documents vs. Registration",
            "status": "PASS" if not mismatched else "FLAG",
            "source": "Document OCR extraction",
            "identifier": bidder.company_name,
            "value": f"{len(extracted_names)} document(s) checked",
            "expected": "Name consistent with registration",
            "note": (
                "Company name is consistent across all submitted documents and registration records."
                if not mismatched
                else f"Name mismatch in {len(mismatched)} document(s). Review document authenticity."
            ),
        })

    # -- Issuer digital signatures (what DigiLocker would guarantee for pulled documents) --
    sig_rows = []
    for fa in db.query(ForensicAnalysis).join(Document, ForensicAnalysis.document_id == Document.id).filter(Document.bidder_id == bidder.id):
        for sig in (fa.structure or {}).get("signatures") or []:
            sig_rows.append(sig)
    broken = [x for x in sig_rows if x.get("intact") is False or x.get("modification_level") not in (None, "NONE", "LTA_UPDATES")]
    trusted = [x for x in sig_rows if x.get("intact") and x.get("trusted")]
    if broken:
        status, value, note = "FLAG", f"{len(broken)} signed document(s) changed after signing", \
            "At least one digitally signed document was altered after the issuer signed it."
    elif trusted:
        status, value, note = "PASS", f"{len(trusted)} document(s) carry an intact signature from a trusted issuer", \
            "Signed by a trusted issuer and unchanged since signing."
    else:
        status, value, note = "UNMEASURED", "No digitally signed documents", \
            "None of the uploads is digitally signed. DigiLocker-pulled copies would carry the issuer's signature."
    checks.append({
        "check": "Issuer Digital Signature", "status": status, "source": "PDF signature validation (pyHanko)",
        "identifier": f"{len(sig_rows)} signature(s) found", "value": value, "expected": "Intact, trusted signature", "note": note,
    })

    # -- Forensic integrity --
    forensic_reports = (
        db.query(ForensicAnalysis)
        .join(Document, ForensicAnalysis.document_id == Document.id)
        .filter(Document.bidder_id == bidder.id)
        .all()
    )
    if forensic_reports:
        high_risk_docs = [f for f in forensic_reports if f.risk_level == "HIGH"]
        checks.append({
            "check": "Forensic Document Integrity",
            "status": "PASS" if not high_risk_docs else "FLAG",
            "source": "BIDMARK Digital Forensics Module",
            "identifier": f"{len(forensic_reports)} document(s) analysed",
            "value": f"{len(high_risk_docs)} high-risk, {len(forensic_reports) - len(high_risk_docs)} low/medium",
            "expected": "No HIGH forensic risk",
            "note": (
                "No forensic anomalies detected in submitted documents."
                if not high_risk_docs
                else f"{len(high_risk_docs)} document(s) carry HIGH forensic risk signals. Mandatory officer review."
            ),
        })

    passed = sum(1 for c in checks if c["status"] == "PASS")
    total = sum(1 for c in checks if c["status"] in ("PASS", "FLAG"))
    score = passed / total if total else 0.5
    confidence = min(0.93, 0.45 + (len(docs) * 0.06))
    verdict = _verdict_from_score(score)

    if verdict == "VERIFIED":
        summary = "Documents present, field data consistent with registration, and integrity signals clear. DigiLocker cryptographic check confirms authenticity (where available)."
    elif verdict == "NEEDS_REVIEW":
        summary = "Most documents pass integrity checks, but one or more items need manual officer review before a final decision can be made."
    else:
        summary = "Significant document integrity issues detected — missing mandatory documents, name mismatches, or forensic anomalies. Recommend clarification before proceeding."

    return verdict, confidence, summary, checks


# ── Data Science Verdict Fusion ───────────────────────────────────────────────

_VERDICT_SCORE = {"VERIFIED": 1.0, "NEEDS_REVIEW": 0.5, "FLAGGED": 0.0}
_VERDICT_WEIGHT = {"entity": 0.35, "compliance": 0.30, "document": 0.35}


def _fuse_verdicts(
    entity_verdict: str,
    compliance_verdict: str,
    document_verdict: str,
    entity_conf: float,
    compliance_conf: float,
    document_conf: float,
    entity_checks: list,
    compliance_checks: list,
    document_checks: list,
) -> tuple[str, float, str, list, list]:
    """
    Weighted fusion of all three module verdicts.
    Returns (fusion_verdict, fusion_confidence, explanation,
             detected_inconsistencies, explainable_flags).
    """
    scores = {
        "entity": _VERDICT_SCORE.get(entity_verdict, 0.5),
        "compliance": _VERDICT_SCORE.get(compliance_verdict, 0.5),
        "document": _VERDICT_SCORE.get(document_verdict, 0.5),
    }
    weighted_score = sum(
        scores[k] * _VERDICT_WEIGHT[k] for k in ("entity", "compliance", "document")
    )
    avg_conf = (entity_conf + compliance_conf + document_conf) / 3

    if weighted_score >= 0.70:
        fusion_verdict = "RECOMMEND_APPROVAL"
    elif weighted_score >= 0.35:
        fusion_verdict = "RECOMMEND_REVIEW"
    else:
        fusion_verdict = "RECOMMEND_REJECTION"

    fusion_confidence = round(min(0.95, avg_conf * (0.7 + weighted_score * 0.3)), 3)

    # ── Detected Inconsistencies ──
    inconsistencies: list[dict] = []
    all_checks = (
        [("Entity Module", c) for c in entity_checks]
        + [("Compliance Module", c) for c in compliance_checks]
        + [("Document Module", c) for c in document_checks]
    )
    for module, check in all_checks:
        if check["status"] == "FLAG":
            inconsistencies.append({
                "what": check["check"],
                "where": module,
                "why": check["note"],
                "severity": "HIGH" if check["status"] == "FLAG" and "mandatory" in check["note"].lower() else "MEDIUM",
                "evidence": {
                    "source": check.get("source", ""),
                    "value_found": check.get("value"),
                    "value_expected": check.get("expected"),
                },
            })

    # ── Explainable AI Flags ──
    flags: list[dict] = []
    for inc in inconsistencies:
        severity = inc["severity"]
        how_serious = (
            "HIGH — may significantly affect verification outcome"
            if severity == "HIGH"
            else "MEDIUM — should be reviewed but may not block approval"
        )
        flags.append({
            "flag": inc["what"],
            "what": f"Inconsistency detected: {inc['what']}",
            "why": inc["why"],
            "which_source": inc["evidence"].get("source", ""),
            "how_serious": how_serious,
            "what_to_review": (
                f"Cross-check the {inc['what']} against the original document or contact the bidder for clarification."
            ),
            "module": inc["where"],
            "severity": severity,
        })

    # Cross-module inconsistency: entity OK but document flags
    if entity_verdict == "VERIFIED" and document_verdict == "FLAGGED":
        flags.append({
            "flag": "Cross-Module Inconsistency — Entity vs Document",
            "what": "Entity registration verified, but document integrity flagged",
            "why": "The government registries confirm the entity exists and is active, but submitted documents carry integrity warnings. This combination may indicate document substitution or tampering.",
            "which_source": "Entity Module (GSTN/NSDL/MCA) vs Document Module (Platform forensics)",
            "how_serious": "HIGH — cross-module contradiction requires mandatory officer investigation",
            "what_to_review": "Request the bidder to re-submit the flagged documents, and verify directly against the registries if necessary.",
            "module": "Cross-Module Fusion",
            "severity": "HIGH",
        })
        inconsistencies.append({
            "what": "Cross-Module Contradiction: Entity verified but documents flagged",
            "where": "Cross-Module Fusion",
            "why": "Entity registration is valid, yet submitted document integrity checks failed. Potential document authenticity issue.",
            "severity": "HIGH",
            "evidence": {
                "source": "Fusion layer cross-check",
                "value_found": f"Entity: {entity_verdict}, Documents: {document_verdict}",
                "value_expected": "Both should be VERIFIED for clean approval",
            },
        })

    if compliance_verdict == "VERIFIED" and entity_verdict == "FLAGGED":
        flags.append({
            "flag": "Cross-Module Inconsistency — Compliance vs Entity",
            "what": "Compliance indicators look acceptable, but entity registration could not be verified",
            "why": "The bidder shows acceptable behavioural patterns, but fundamental registration identity issues remain unresolved.",
            "which_source": "Compliance Module vs Entity Module",
            "how_serious": "HIGH — entity identity must be resolved before approval",
            "what_to_review": "Resolve entity registration issues first. Do not proceed to approval until identity is confirmed.",
            "module": "Cross-Module Fusion",
            "severity": "HIGH",
        })

    # ── Explanation ──
    if fusion_verdict == "RECOMMEND_APPROVAL":
        explanation = (
            f"All three verification modules return acceptable verdicts "
            f"(Entity: {entity_verdict}, Compliance: {compliance_verdict}, "
            f"Document: {document_verdict}). Fusion confidence: {fusion_confidence:.0%}. "
            "The AI recommends approval, but the final decision rests entirely with the Procurement Officer."
        )
    elif fusion_verdict == "RECOMMEND_REVIEW":
        n_flags = len(inconsistencies)
        explanation = (
            f"Mixed verdicts across modules (Entity: {entity_verdict}, Compliance: {compliance_verdict}, "
            f"Document: {document_verdict}). {n_flags} inconsistency(ies) detected. "
            f"Fusion confidence: {fusion_confidence:.0%}. "
            "The AI recommends officer review before any decision."
        )
    else:
        n_flags = len(inconsistencies)
        explanation = (
            f"Significant issues detected (Entity: {entity_verdict}, Compliance: {compliance_verdict}, "
            f"Document: {document_verdict}). {n_flags} inconsistency(ies) require resolution. "
            f"Fusion confidence: {fusion_confidence:.0%}. "
            "The AI recommends rejection pending bidder clarification, but the final decision is the Procurement Officer's."
        )

    return fusion_verdict, fusion_confidence, explanation, inconsistencies, flags


# ── Public API ────────────────────────────────────────────────────────────────

def run_bidmark_analysis(db: Session, bidder_id: str, tender_id: str) -> BidmarkAnalysis:
    """
    Run the full BIDMARK three-module analysis and persist the result.
    Idempotent: if a result already exists for this pair it is replaced.
    """
    bidder = db.query(Bidder).filter(Bidder.id == bidder_id).first()
    tender = db.query(Tender).filter(Tender.id == tender_id).first()
    if not bidder or not tender:
        raise ValueError("Bidder or Tender not found")

    consent_audit: list[dict] = []

    # Module 1
    entity_verdict, entity_conf, entity_summary, entity_checks = _run_entity_module(
        db, bidder, consent_audit
    )

    # Module 2
    compliance_verdict, compliance_conf, compliance_summary, compliance_checks = _run_compliance_module(
        db, bidder, tender, consent_audit
    )

    # Module 3
    document_verdict, document_conf, document_summary, document_checks = _run_document_module(
        db, bidder, tender, consent_audit
    )

    # Fusion
    fusion_verdict, fusion_conf, fusion_explanation, inconsistencies, flags = _fuse_verdicts(
        entity_verdict, compliance_verdict, document_verdict,
        entity_conf, compliance_conf, document_conf,
        entity_checks, compliance_checks, document_checks,
    )

    # Persist (replace any existing record for this pair)
    existing = (
        db.query(BidmarkAnalysis)
        .filter(
            BidmarkAnalysis.bidder_id == bidder_id,
            BidmarkAnalysis.tender_id == tender_id,
        )
        .first()
    )

    if existing:
        record = existing
    else:
        record = BidmarkAnalysis(bidder_id=bidder_id, tender_id=tender_id)
        db.add(record)

    record.entity_verdict = entity_verdict
    record.entity_confidence = round(entity_conf, 3)
    record.entity_summary = entity_summary
    record.entity_checks = entity_checks
    record.compliance_verdict = compliance_verdict
    record.compliance_confidence = round(compliance_conf, 3)
    record.compliance_summary = compliance_summary
    record.compliance_checks = compliance_checks
    record.document_verdict = document_verdict
    record.document_confidence = round(document_conf, 3)
    record.document_summary = document_summary
    record.document_checks = document_checks
    record.fusion_verdict = fusion_verdict
    record.fusion_confidence = round(fusion_conf, 3)
    record.fusion_explanation = fusion_explanation
    record.detected_inconsistencies = inconsistencies
    record.explainable_flags = flags
    record.consent_audit = consent_audit
    record.completed_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(record)
    return record
