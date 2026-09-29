"""
Demo data seeder for the GeM Bid Compliance Verification Platform.

Creates:
  - Demo login accounts (admin, procurement officer, one bidder login)
  - 3 fictional tenders, each with different requirements
  - 10 fictional bidders covering a spread of compliance/forensic/behavioral
    scenarios, including the "Alpha Energy Solutions" showcase bidder with
    multiple simultaneous issues (see PS spec section 37)
  - Uploaded documents, and a full run of every engine (extraction,
    verification, cross-check, compliance, forensics, fingerprinting,
    behavior) so the demo opens with fully populated data.

Run with:  python -m app.seed   (from the backend/ directory, venv active)
"""
import os
import sys
from datetime import date, datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.core.database import Base, SessionLocal, engine
from app.core.security import hash_password
from app.engines.behavioral_engine import analyze_behavior
from app.engines.compliance_engine import evaluate_compliance
from app.engines.cross_check_engine import run_cross_check
from app.engines.fingerprint_engine import compare_bidder_documents_across_tender, generate_fingerprint
from app.engines.forensics_engine import analyze_document
from app.models.bid import BidSubmission
from app.models.bidder import Bidder
from app.models.decision import OfficerDecision
from app.models.document import Document
from app.models.tender import Requirement, Tender, TenderBidder
from app.models.user import User, UserRole
from app.providers.government.base import pick_outcome
from app.providers.government.debarment import DebarmentProvider
from app.services.audit_service import log_action
from app.services.document_service import extract_document, verify_document
from app.services.recommendation_service import build_recommendation
from app.utils.ids import new_id

NOW = datetime.now(timezone.utc)


def find_identifier(prefix: str, registry_salt: str, desired_outcome: str, tries: int = 5000) -> str:
    for i in range(tries):
        candidate = f"{prefix}{i:05d}"
        if pick_outcome(candidate, registry_salt) == desired_outcome:
            return candidate
    raise RuntimeError(f"Could not find identifier for {registry_salt}->{desired_outcome}")


def find_debarred_identifier(prefix: str, tries: int = 5000) -> str:
    provider = DebarmentProvider()
    for i in range(tries):
        candidate = f"{prefix}{i:05d}"
        if provider.verify(candidate)["data"]["is_currently_debarred"]:
            return candidate
    raise RuntimeError("Could not find a debarred identifier")


# Categories whose mock verification identifier is generated fresh per
# *document* (not derived from a stable bidder field), which would otherwise
# make demo outcomes non-reproducible across seed runs. We stabilize these to
# a deterministic VERIFIED identifier unless a scenario deliberately wants a
# different outcome.
_RANDOM_CATEGORY_SALT = {"NSIC": "nsic", "EPFO": "epfo", "ESIC": "esic", "STARTUP_INDIA": "startup", "OEM_AUTHORIZATION": "oem"}


def stabilize_random_categories(db, bidder, skip_categories=()):
    for cat, salt in _RANDOM_CATEGORY_SALT.items():
        if cat in skip_categories:
            continue
        doc = db.query(Document).filter(Document.bidder_id == bidder.id, Document.category == cat).order_by(Document.created_at.desc()).first()
        if doc and doc.extraction:
            identifier = find_identifier(f"{salt[:3].upper()}{bidder.id[:6]}", salt, "VERIFIED")
            doc.extraction.registration_number = identifier
            db.commit()


def add_document(db, bidder: Bidder, category: str, tender_id: str | None, content: bytes, filename: str) -> Document:
    bidder_dir = os.path.join(settings.UPLOAD_DIRECTORY, bidder.id)
    os.makedirs(bidder_dir, exist_ok=True)
    stored_filename = f"{new_id()}_{filename}"
    file_path = os.path.join(bidder_dir, stored_filename)
    with open(file_path, "wb") as fh:
        fh.write(content)
    import hashlib

    doc = Document(
        bidder_id=bidder.id, tender_id=tender_id, category=category,
        original_filename=filename, stored_filename=stored_filename, file_path=file_path,
        mime_type="text/plain" if filename.endswith(".txt") else "application/pdf",
        file_size_bytes=len(content), file_hash_sha256=hashlib.sha256(content).hexdigest(),
        uploaded_at=NOW, status="UPLOADED",
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


def generic_doc_text(category: str, company: str) -> bytes:
    return f"{category} CERTIFICATE\nIssued to: {company}\nThis is a prototype demo document for {category}.".encode()


OEM_LETTER_TEMPLATE = (
    "OEM AUTHORIZATION LETTER\n"
    "We, Emerson Process Management, hereby authorize {company} (PAN {pan}) as our "
    "authorized channel partner for sales and service of process control instrumentation "
    "in India for the period 2025-2027. This letter is issued for participation in "
    "government tenders including GeM procurement.\n"
    "Authorized scope: Sales, Service & Spares.\n"
)


def run_full_pipeline(db, bidder: Bidder, tender_id: str, actor: User):
    docs = db.query(Document).filter(Document.bidder_id == bidder.id, Document.is_deleted == False).all()  # noqa: E712
    for doc in docs:
        extract_document(db, doc)

    yield_point(db, bidder, tender_id)  # allow scenario-specific overrides between extract and verify

    for doc in docs:
        verify_document(db, doc)
        analyze_document(db, doc)
        generate_fingerprint(db, doc)

    run_cross_check(db, bidder.id, tender_id)
    evaluate_compliance(db, bidder.id, tender_id)
    analyze_behavior(db, bidder.id, tender_id)
    log_action(db, action="WORKFLOW_COMPLETED", actor=actor, bidder_id=bidder.id, tender_id=tender_id, description=f"Seed pipeline completed for {bidder.company_name}")


_overrides = {}


def yield_point(db, bidder, tender_id):
    fn = _overrides.get(bidder.id)
    skip = _skip_stabilize.get(bidder.id, ())
    stabilize_random_categories(db, bidder, skip_categories=skip)
    if fn:
        fn(db, bidder, tender_id)


_skip_stabilize: dict[str, tuple] = {}


def main():
    print("Creating tables...")
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    print("Seeding users...")
    admin = User(email="admin@cpcl.gov.in", hashed_password=hash_password("Admin@123"), full_name="System Administrator", role=UserRole.ADMIN)
    officer = User(email="officer@cpcl.gov.in", hashed_password=hash_password("Officer@123"), full_name="R. Krishnan, Procurement Officer", role=UserRole.PROCUREMENT_OFFICER)
    bidder_user = User(email="bidder@example.com", hashed_password=hash_password("Bidder@123"), full_name="Sneha Rani", role=UserRole.BIDDER)
    db.add_all([admin, officer, bidder_user])
    db.commit()

    print("Seeding tenders...")
    tender1 = Tender(
        tender_number="CPCL/GEM/2026/101", gem_tender_id="GEM/2026/B/1010101", title="Supply and Installation of Process Instrumentation & Control Valves",
        description="Procurement of field instrumentation (transmitters, control valves) for the CPCL Manali refinery expansion.",
        estimated_value=120000000, published_at=NOW - timedelta(days=20), deadline=NOW + timedelta(days=10),
        status="ACTIVE", created_by=officer.id,
        tender_type="OPEN_TENDER", tender_category="GOODS", tender_mode="ONLINE", bid_system="TWO_PACKET",
        location="Chennai, Tamil Nadu", bid_validity_days=120,
    )
    tender2 = Tender(
        tender_number="CPCL/GEM/2026/102", gem_tender_id="GEM/2026/B/1010102", title="Annual Maintenance Contract for Rotating Equipment",
        description="AMC for pumps, compressors and turbines across CPCL process units.",
        estimated_value=80000000, published_at=NOW - timedelta(days=15), deadline=NOW + timedelta(days=15),
        status="ACTIVE", created_by=officer.id,
        tender_type="LIMITED_TENDER", tender_category="SERVICES", tender_mode="ONLINE", bid_system="SINGLE_PACKET",
        location="Chennai, Tamil Nadu", bid_validity_days=90,
    )
    tender3 = Tender(
        tender_number="CPCL/GEM/2026/103", gem_tender_id="GEM/2026/B/1010103", title="Supply of Corrosion-Resistant Piping Systems",
        description="Supply of CRA-lined piping systems for CPCL's crude distillation unit revamp.",
        estimated_value=60000000, published_at=NOW - timedelta(days=30), deadline=NOW + timedelta(days=5),
        status="ACTIVE", created_by=officer.id,
        tender_type="OPEN_TENDER", tender_category="GOODS", tender_mode="ONLINE", bid_system="TWO_PACKET",
        location="Chennai, Tamil Nadu", bid_validity_days=90,
    )
    db.add_all([tender1, tender2, tender3])
    db.commit()

    def add_req(tender, rtype, desc, mandatory=True, threshold=None, unit=None, weight=1.0, evidence=None):
        r = Requirement(tender_id=tender.id, requirement_type=rtype, description=desc, is_mandatory=mandatory, threshold=threshold, threshold_unit=unit, weight=weight, evidence_type=evidence or rtype)
        db.add(r)
        return r

    for r in [
        ("GST", "Valid GST registration required", True, None, None, 1, "GST"),
        ("PAN", "Valid PAN required", True, None, None, 1, "PAN"),
        ("UDYAM", "Udyam/MSME registration required", True, None, None, 1, "UDYAM"),
        ("MCA", "Valid company incorporation (MCA) record required", True, None, None, 1, "MCA"),
        ("LOCAL_CONTENT", "Minimum local content of 50%", True, 50, "PERCENT", 2, "LOCAL_CONTENT"),
        ("OEM_AUTHORIZATION", "OEM authorization letter required", True, None, None, 1.5, "OEM_AUTHORIZATION"),
        ("DEBARMENT", "No active debarment/blacklisting", True, None, None, 1, "DEBARMENT"),
    ]:
        add_req(tender1, *r)

    for r in [
        ("GST", "Valid GST registration required", True, None, None, 1, "GST"),
        ("PAN", "Valid PAN required", True, None, None, 1, "PAN"),
        ("INCOME_TAX", "Income tax filing on record required", True, None, None, 1, "INCOME_TAX"),
        ("EPFO", "EPFO compliance required", True, None, None, 1, "EPFO"),
        ("ESIC", "ESIC compliance required", False, None, None, 0.5, "ESIC"),
        ("NSIC", "Valid NSIC registration required", True, None, None, 1, "NSIC"),
        ("TURNOVER", "Minimum annual turnover of ₹10 crore", True, 10, "CRORE", 1.5, "FINANCIAL"),
        ("DEBARMENT", "No active debarment/blacklisting", True, None, None, 1, "DEBARMENT"),
    ]:
        add_req(tender2, *r)

    for r in [
        ("GST", "Valid GST registration required", True, None, None, 1, "GST"),
        ("PAN", "Valid PAN required", True, None, None, 1, "PAN"),
        ("MCA", "Valid company incorporation (MCA) record required", True, None, None, 1, "MCA"),
        ("STARTUP_INDIA", "DPIIT Startup India recognition (optional bonus)", False, None, None, 0.5, "STARTUP_INDIA"),
        ("LOCAL_CONTENT", "Minimum local content of 60%", True, 60, "PERCENT", 2, "LOCAL_CONTENT"),
        ("DEBARMENT", "No active debarment/blacklisting", True, None, None, 1, "DEBARMENT"),
    ]:
        add_req(tender3, *r)
    db.commit()

    print("Seeding bidders...")

    def make_bidder(name, legal_name=None, pan=None, gstin=None, cin=None, udyam=None, address=None, incorp_days_ago=1500):
        b = Bidder(
            company_name=name, legal_name=legal_name or name,
            pan_number=pan, gstin=gstin, cin=cin, udyam_number=udyam,
            registered_address=address or f"Industrial Estate, {['Delhi','Chennai','Mumbai','Pune','Coimbatore'][hash(name) % 5]}, India",
            incorporation_date=(NOW - timedelta(days=incorp_days_ago)).date(),
            contact_email=f"{name.split()[0].lower()}@example.com", status="ACTIVE",
        )
        db.add(b)
        db.commit()
        db.refresh(b)
        return b

    # Every identifier below is deliberately *found* rather than hand-typed so
    # the seeded mock-government outcome is deterministic and reproducible:
    # "clean" bidders get identifiers that resolve to VERIFIED / CLEAR on every
    # relevant registry, and only the bidders with an intentional scenario get
    # an identifier forced to a different outcome.
    def vid(prefix, salt):
        return find_identifier(prefix, salt, "VERIFIED")

    def clean_cin(prefix):
        """A CIN that resolves to MCA-VERIFIED and is not flagged by the debarment registry."""
        provider = DebarmentProvider()
        for i in range(5000):
            candidate = f"{prefix}{i:05d}"
            if pick_outcome(candidate, "mca") == "VERIFIED" and not provider.verify(candidate)["data"]["is_currently_debarred"]:
                return candidate
        raise RuntimeError("Could not find a clean CIN")

    def paired_pan_gst(pan_prefix: str, state: str = "07", gst_outcome: str = "VERIFIED", pan_outcome: str = "VERIFIED"):
        """Finds a PAN and a matching GSTIN that correctly embeds it (GSTIN
        chars[2:12] == PAN, as the cross-check engine expects for a real
        GST<->PAN relationship), while independently landing on the desired
        mock-registry outcome for each. A GSTIN's only free characters given a
        fixed PAN+state are a 1-digit entity code and a 1-char checksum (90
        combinations), so when those 90 don't hit the desired GST outcome we
        try the next candidate PAN instead."""
        for p in range(2000):
            pan_candidate = f"{pan_prefix}{p:05d}"
            if pick_outcome(pan_candidate, "pan") != pan_outcome:
                continue
            for i in range(90):
                candidate_gst = f"{state}{pan_candidate}{(i % 9) + 1}Z{i % 10}"
                if pick_outcome(candidate_gst, "gst") == gst_outcome:
                    return pan_candidate, candidate_gst
        raise RuntimeError(f"Could not find a paired PAN/GSTIN for pan={pan_outcome} gst={gst_outcome}")

    alpha_pan, alpha_gst = paired_pan_gst("AAPAN")
    bright_pan, bright_gst = paired_pan_gst("BBPAN", state="27")
    chennai_pan, chennai_gst = paired_pan_gst("CCPAN", state="33")
    delta_pan, delta_gst = paired_pan_gst("DDPAN", gst_outcome="MISMATCH")
    everest_pan, everest_gst = paired_pan_gst("EEPAN", state="19")
    fortune_pan, fortune_gst = paired_pan_gst("FFPAN", state="24")
    global_pan, global_gst = paired_pan_gst("GGPAN", state="29")
    horizon_pan, horizon_gst = paired_pan_gst("HHPAN", state="06")
    indus_pan, indus_gst = paired_pan_gst("IIPAN", state="09")
    jupiter_pan, jupiter_gst = paired_pan_gst("JJPAN", pan_outcome="RECORD_NOT_FOUND")

    alpha = make_bidder("Alpha Energy Solutions Pvt Ltd", pan=alpha_pan, gstin=alpha_gst, cin=clean_cin("U31900DL2015PTC28"), udyam=vid("UDYAMAA", "udyam"), address="Plot 12, Sector 24, Faridabad, Haryana", incorp_days_ago=1400)
    # Link the demo bidder-portal login (Sneha Rani) to Alpha, the showcase
    # bidder with the richest demonstrable data (local-content shortfall,
    # a minor company-name variation discrepancy, and a shared OEM-authorization
    # forensic flag with Horizon), so the Bidder Portal demo opens populated.
    alpha.user_id = bidder_user.id
    db.commit()
    bright = make_bidder("Bright Turbo Industries Pvt Ltd", pan=bright_pan, gstin=bright_gst, cin=clean_cin("U29100MH2010PTC21"), udyam=vid("UDYAMBB", "udyam"), address="MIDC Industrial Area, Pune, Maharashtra", incorp_days_ago=5800)
    chennai_fab = make_bidder("Chennai Fabricators Ltd", pan=chennai_pan, gstin=chennai_gst, cin=clean_cin("U27100TN2012PLC21"), address="Ambattur Industrial Estate, Chennai, Tamil Nadu", incorp_days_ago=5100)
    delta = make_bidder("Delta Flow Controls Pvt Ltd", pan=delta_pan, gstin=delta_gst, cin=clean_cin("U31900DL2014PTC28"), udyam=vid("UDYAMDD", "udyam"), address="Okhla Industrial Area, Delhi", incorp_days_ago=4300)
    everest = make_bidder("Everest Engineering Pvt Ltd", pan=everest_pan, gstin=everest_gst, cin=clean_cin("U29200WB2011PTC21"), udyam=vid("UDYAMEE", "udyam"), address="Salt Lake Industrial Park, Kolkata, West Bengal", incorp_days_ago=4900)
    fortune = make_bidder("Fortune Pipeline Solutions Pvt Ltd", pan=fortune_pan, gstin=fortune_gst, cin=clean_cin("U27200GJ2009PTC21"), address="GIDC Industrial Estate, Ahmedabad, Gujarat", incorp_days_ago=6200)
    global_valve = make_bidder("Global Valve Corp Pvt Ltd", pan=global_pan, gstin=global_gst, cin=clean_cin("U29290KA2013PTC21"), address="Peenya Industrial Area, Bengaluru, Karnataka", incorp_days_ago=4700)
    horizon = make_bidder("Horizon Instruments Pvt Ltd", pan=horizon_pan, gstin=horizon_gst, cin=clean_cin("U33110HR2016PTC28"), udyam=vid("UDYAMHH", "udyam"), address="IMT Manesar, Gurugram, Haryana", incorp_days_ago=3500)
    indus = make_bidder("Indus Controls & Automation Pvt Ltd", pan=indus_pan, gstin=indus_gst, cin=clean_cin("U72900UP2012PTC21"), address="Noida Sector 63, Uttar Pradesh", incorp_days_ago=5000)
    jupiter = make_bidder(
        "Jupiter Process Equipment Pvt Ltd",
        pan=jupiter_pan,
        gstin=jupiter_gst,
        cin=find_debarred_identifier("U29290DL2017PTC28"),
        address="Bawana Industrial Area, Delhi", incorp_days_ago=3100,
    )

    def link(bidder, tender, submitted_at=None, quoted_price=None, local_content=None, turnover=None, status="SUBMITTED"):
        db.add(TenderBidder(tender_id=tender.id, bidder_id=bidder.id, invited_at=tender.published_at))
        db.add(BidSubmission(
            tender_id=tender.id, bidder_id=bidder.id, quoted_price=quoted_price,
            local_content_percent=local_content, declared_turnover_crore=turnover,
            submitted_at=submitted_at or (tender.published_at + timedelta(days=5)), status=status,
        ))
        db.commit()

    # --- Alpha: the showcase bidder with multiple simultaneous issues ---
    link(alpha, tender1, submitted_at=tender1.published_at + timedelta(minutes=45), quoted_price=11500000, local_content=35)
    for cat in ("GST", "PAN", "UDYAM"):
        add_document(db, alpha, cat, tender1.id, generic_doc_text(cat, alpha.company_name), f"{cat.lower()}_certificate.txt")
    add_document(db, alpha, "MCA", tender1.id, generic_doc_text("MCA", alpha.company_name), "mca_incorporation.txt")
    add_document(db, alpha, "OEM_AUTHORIZATION", tender1.id, OEM_LETTER_TEMPLATE.format(company=alpha.company_name, pan=alpha.pan_number).encode(), "oem_authorization_letter.txt")
    add_document(db, alpha, "EXPERIENCE_CERTIFICATE", tender1.id, generic_doc_text("EXPERIENCE_CERTIFICATE", alpha.company_name), "experience_certificate.txt")

    def alpha_overrides(db, bidder, tender_id):
        mca_doc = db.query(Document).filter(Document.bidder_id == bidder.id, Document.category == "MCA").first()
        if mca_doc and mca_doc.extraction:
            mca_doc.extraction.company_name = "Alpha Energy Solution Pvt Ltd"  # deliberate minor variation
            db.commit()

    _overrides[alpha.id] = alpha_overrides

    # --- Bright Turbo: fully compliant on two tenders ---
    link(bright, tender1, submitted_at=tender1.published_at + timedelta(days=6), quoted_price=11800000, local_content=72)
    link(bright, tender2, submitted_at=tender2.published_at + timedelta(days=4), quoted_price=9800000, turnover=45)
    for cat, tender in [("GST", tender1), ("PAN", tender1), ("UDYAM", tender1), ("MCA", tender1), ("OEM_AUTHORIZATION", tender1)]:
        add_document(db, bright, cat, tender.id, generic_doc_text(cat, bright.company_name), f"{cat.lower()}_certificate.txt")
    for cat in ("GST", "PAN", "INCOME_TAX", "EPFO", "ESIC", "NSIC"):
        add_document(db, bright, cat, tender2.id, generic_doc_text(cat, bright.company_name), f"{cat.lower()}_certificate.txt")
    add_document(db, bright, "FINANCIAL", tender2.id, generic_doc_text("FINANCIAL", bright.company_name), "financials.txt")

    # --- Chennai Fabricators: missing a mandatory document (no UDYAM) ---
    link(chennai_fab, tender1, submitted_at=tender1.published_at + timedelta(days=8), quoted_price=12200000, local_content=55)
    for cat in ("GST", "PAN", "MCA", "OEM_AUTHORIZATION"):
        add_document(db, chennai_fab, cat, tender1.id, generic_doc_text(cat, chennai_fab.company_name), f"{cat.lower()}_certificate.txt")

    # --- Delta Flow Controls: GST mismatch (forced via seeded mock outcome) ---
    link(delta, tender1, submitted_at=tender1.published_at + timedelta(days=7), quoted_price=11950000, local_content=58)
    for cat in ("GST", "PAN", "UDYAM", "MCA", "OEM_AUTHORIZATION"):
        add_document(db, delta, cat, tender1.id, generic_doc_text(cat, delta.company_name), f"{cat.lower()}_certificate.txt")

    # --- Everest Engineering: expired NSIC document (forced via seeded mock outcome) ---
    link(everest, tender2, submitted_at=tender2.published_at + timedelta(days=6), quoted_price=9600000, turnover=22)
    for cat in ("GST", "PAN", "INCOME_TAX", "EPFO", "ESIC"):
        add_document(db, everest, cat, tender2.id, generic_doc_text(cat, everest.company_name), f"{cat.lower()}_certificate.txt")
    nsic_id = find_identifier("NSICEV", "nsic", "EXPIRED")
    nsic_doc = add_document(db, everest, "NSIC", tender2.id, generic_doc_text("NSIC", everest.company_name), "nsic_certificate.txt")

    def everest_overrides(db, bidder, tender_id):
        doc = db.query(Document).filter(Document.bidder_id == bidder.id, Document.category == "NSIC").first()
        if doc and doc.extraction:
            doc.extraction.registration_number = nsic_id
            db.commit()

    _overrides[everest.id] = everest_overrides
    _skip_stabilize[everest.id] = ("NSIC",)
    add_document(db, everest, "FINANCIAL", tender2.id, generic_doc_text("FINANCIAL", everest.company_name), "financials.txt")

    # --- Fortune Pipeline: high local-content compliance ---
    link(fortune, tender3, submitted_at=tender3.published_at + timedelta(days=10), quoted_price=5800000, local_content=82)
    for cat in ("GST", "PAN", "MCA"):
        add_document(db, fortune, cat, tender3.id, generic_doc_text(cat, fortune.company_name), f"{cat.lower()}_certificate.txt")

    # --- Global Valve Corp: low local-content compliance (fails) ---
    link(global_valve, tender3, submitted_at=tender3.published_at + timedelta(days=12), quoted_price=5650000, local_content=28)
    for cat in ("GST", "PAN", "MCA"):
        add_document(db, global_valve, cat, tender3.id, generic_doc_text(cat, global_valve.company_name), f"{cat.lower()}_certificate.txt")

    # --- Horizon Instruments: forensic anomaly + document reuse with Alpha ---
    link(horizon, tender1, submitted_at=tender1.published_at + timedelta(days=9), quoted_price=11700000, local_content=61)
    for cat in ("GST", "PAN", "UDYAM", "MCA"):
        add_document(db, horizon, cat, tender1.id, generic_doc_text(cat, horizon.company_name), f"{cat.lower()}_certificate.txt")
    # Byte-identical OEM authorization letter to Alpha's -> real hash-collision forensic
    # signal + maximal document-DNA similarity across two different bidders.
    add_document(db, horizon, "OEM_AUTHORIZATION", tender1.id, OEM_LETTER_TEMPLATE.format(company=alpha.company_name, pan=alpha.pan_number).encode(), "oem_authorization_letter.txt")

    # --- Indus & Jupiter: synchronized submission timing + Jupiter's combined issues ---
    sync_time = tender2.published_at + timedelta(days=3, hours=2)
    link(indus, tender2, submitted_at=sync_time, quoted_price=9500000, turnover=18)
    for cat in ("GST", "PAN", "INCOME_TAX", "EPFO", "NSIC"):
        add_document(db, indus, cat, tender2.id, generic_doc_text(cat, indus.company_name), f"{cat.lower()}_certificate.txt")
    add_document(db, indus, "FINANCIAL", tender2.id, generic_doc_text("FINANCIAL", indus.company_name), "financials.txt")

    link(jupiter, tender2, submitted_at=sync_time + timedelta(minutes=4), quoted_price=9505000, turnover=4)
    for cat in ("GST", "PAN", "INCOME_TAX", "EPFO", "NSIC"):
        add_document(db, jupiter, cat, tender2.id, generic_doc_text(cat, jupiter.company_name), f"{cat.lower()}_certificate.txt")
    add_document(db, jupiter, "FINANCIAL", tender2.id, generic_doc_text("FINANCIAL", jupiter.company_name), "financials.txt")

    print("Running verification pipeline for every bidder (this drives every engine)...")
    all_pairs = [
        (alpha, tender1), (bright, tender1), (bright, tender2), (chennai_fab, tender1),
        (delta, tender1), (everest, tender2), (fortune, tender3), (global_valve, tender3),
        (horizon, tender1), (indus, tender2), (jupiter, tender2),
    ]
    for bidder, tender in all_pairs:
        run_full_pipeline(db, bidder, tender.id, officer)

    print("Running cross-bidder document similarity scan on tender 1...")
    compare_bidder_documents_across_tender(db, tender1.id, min_score=0.5)

    # Re-run compliance + behavior after cross-bidder comparisons exist, so
    # discrepancies / flags derived from them are reflected in final reports.
    for bidder, tender in all_pairs:
        run_cross_check(db, bidder.id, tender.id)
        evaluate_compliance(db, bidder.id, tender.id)
        analyze_behavior(db, bidder.id, tender.id)

    print("Recording a couple of officer decisions...")
    db.add(OfficerDecision(bidder_id=bright.id, tender_id=tender1.id, officer_id=officer.id, decision="QUALIFIED", reason="All mandatory requirements verified; no discrepancies found.", decided_at=NOW))
    db.add(OfficerDecision(bidder_id=alpha.id, tender_id=tender1.id, officer_id=officer.id, decision="PENDING_REVIEW", reason="Local content shortfall and document integrity signal require clarification from bidder before a decision.", decided_at=NOW))
    db.commit()

    print("\nSeed complete.")
    print("Demo credentials:")
    print("  Admin:              admin@cpcl.gov.in / Admin@123")
    print("  Procurement Officer: officer@cpcl.gov.in / Officer@123")
    print("  Bidder portal:       bidder@example.com / Bidder@123")
    print(f"\nShowcase bidder: {alpha.company_name} (id={alpha.id}) on tender {tender1.tender_number} (id={tender1.id})")

    db.close()


if __name__ == "__main__":
    main()
