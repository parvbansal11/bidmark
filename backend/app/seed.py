"""Demo dataset. Every document is a real PDF that the pipeline reads and
inspects; nothing about a bidder's outcome is decided by a random number.

Tender CPCL/2026/PUMP/089, six bidders:
  Alpha Pumps        clean; GST certificate digitally signed by a trusted issuer
  Bharat Flowtech    OEM authorization lapsed before the bid date; Udyam
                     certificate is issued to "Bharat Flowtek" (look-alike)
  Coastal Hydraulics OEM validity retyped over the original date
  Deccan Pump Works  GSTIN fails its check digit; CIN year contradicts the
                     declared incorporation date; GST PDF re-saved in iLovePDF
  Eastern Fluid +    shared director, phone, device and PDF author; bids three
  Eastline Supplies  minutes apart; Eastline's CA-signed turnover certificate
                     was edited after signing to lift 4.10 crore to 6.10 crore
Tender CPCL/2026/VALVE/092 has three mostly clean bidders, one already decided.
Tender CPCL/2026/SOLAR/098 is a draft with no requirements (an Admin task).

Run from backend/:  python -m app.seed
"""
import hashlib
import os
import shutil
import sys
from datetime import date, datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings  # noqa: E402
from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.demo import documents as D  # noqa: E402
from app.forensics.identifiers import make_gstin  # noqa: E402
from app.models.bid import BidSubmission  # noqa: E402
from app.models.bidder import Bidder  # noqa: E402
from app.models.document import Document  # noqa: E402
from app.models.telemetry import SubmissionEvent  # noqa: E402
from app.models.tender import Requirement, Tender, TenderBidder  # noqa: E402
from app.models.user import User, UserRole  # noqa: E402
from app.providers.government import sandbox  # noqa: E402
from app.services import case_service as cs  # noqa: E402
from app.services.audit_service import log_action  # noqa: E402
from app.services.telemetry_service import _h  # noqa: E402
from app.utils.ids import new_id  # noqa: E402

NOW = datetime.now(timezone.utc)
TODAY = NOW.date()


def dmy(d: date) -> str:
    return d.strftime("%d/%m/%Y")


BIDDERS = [
    dict(key="alpha", name="Alpha Pumps & Engineering Pvt Ltd", pan="AABCA4821K", state="33", cin="U29120TN2011PTC081234",
         inc=date(2011, 6, 14), udyam="UDYAM-TN-02-0012345", addr="12 Industrial Estate, Guindy, Chennai, Tamil Nadu 600032",
         email="alpha@alphaindia.in", phone="+91 44 2250 1180", directors=[("Meena Iyer", "07123456"), ("Arjun Iyer", "07123457")],
         turnover=("Rs 42.10 Crore", "Rs 48.75 Crore"), device="alpha-laptop", ip="49.207.10.21"),
    dict(key="bharat", name="Bharat Flowtech Pvt Ltd", pan="AAFCB7734M", state="33", cin="U29130TN2014PTC095512",
         inc=date(2014, 2, 3), udyam="UDYAM-TN-06-0044180", addr="Plot 44, SIDCO Industrial Estate, Ambattur, Chennai, Tamil Nadu 600098",
         email="bharat@bharatflowtech.in", phone="+91 44 2625 7710", directors=[("Karthik Raman", "08011223")],
         turnover=("Rs 11.40 Crore", "Rs 13.20 Crore"), device="bharat-desktop", ip="117.222.4.18"),
    dict(key="coastal", name="Coastal Hydraulics Ltd", pan="AAHCC2210Q", state="33", cin="U29120TN2008PLC067781",
         inc=date(2008, 9, 22), udyam=None, addr="7 Harbour Road, Thoothukudi, Tamil Nadu 628001",
         email="tenders@coastalhydraulics.in", phone="+91 461 232 9900", directors=[("S. Pandian", "05544332")],
         turnover=("Rs 22.00 Crore", "Rs 24.60 Crore"), device="coastal-pc", ip="103.44.12.77"),
    dict(key="deccan", name="Deccan Pump Works Pvt Ltd", pan="AABCD5678P", state="27", cin="U29120MH2012PTC231190",
         inc=date(2015, 1, 9), udyam=None, addr="Gat 211, Chakan MIDC, Pune, Maharashtra 410501",
         email="bids@deccanpumps.in", phone="+91 20 6612 4400", directors=[("Rohit Kulkarni", "06677889")],
         turnover=("Rs 8.30 Crore", "Rs 9.10 Crore"), device="deccan-laptop", ip="182.70.3.9", bad_gstin="27AABCD5678P1ZQ"),
    dict(key="eastern", name="Eastern Fluid Systems Pvt Ltd", pan="AAKCE3391H", state="33", cin="U29120TN2017PTC118804",
         inc=date(2017, 11, 2), udyam=None, addr="21 Second Main Road, Perungudi, Chennai, Tamil Nadu 600096",
         email="eastern.fluid@gmail.com", phone="+91 98410 55123", directors=[("Suresh Kumar Rao", "08812345"), ("Lakshmi Rao", "08812346")],
         turnover=("Rs 7.90 Crore", "Rs 8.40 Crore"), device="suresh-laptop", ip="122.164.88.40", author="SURESH-LAPTOP"),
    dict(key="eastline", name="Eastline Industrial Supplies Pvt Ltd", pan="AALCE8812J", state="33", cin="U51909TN2019PTC129931",
         inc=date(2019, 4, 18), udyam=None, addr="4 Nehru Street, Velachery, Chennai, Tamil Nadu 600042",
         email="eastline.supplies@gmail.com", phone="+91 98410 55123", directors=[("Suresh Kumar Rao", "08812345")],
         turnover=("Rs 3.80 Crore", "Rs 4.10 Crore"), device="suresh-laptop", ip="122.164.88.40", author="SURESH-LAPTOP"),
    dict(key="kaveri", name="Kaveri Valves Pvt Ltd", pan="AAMCK4410D", state="29", cin="U29140KA2010PTC052210",
         inc=date(2010, 3, 30), udyam="UDYAM-KA-03-0098812", addr="88 Peenya Industrial Area, Bengaluru, Karnataka 560058",
         email="sales@kaverivalves.in", phone="+91 80 2839 4411", directors=[("Anand Rao", "04455667")],
         turnover=("Rs 15.20 Crore", "Rs 17.80 Crore"), device="kaveri-pc", ip="106.51.20.3"),
]

PUMP_PRICES = {"alpha": 10840000, "bharat": 10590000, "coastal": 11100000, "deccan": 11550000, "eastern": 10120000, "eastline": 10980000}
VALVE_PRICES = {"alpha": 3420000, "bharat": 3310000, "kaveri": 3375000}


def _reset():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    for d in (settings.UPLOAD_DIRECTORY,):
        if os.path.isdir(d):
            shutil.rmtree(d)
        os.makedirs(d, exist_ok=True)


def _store(db, bidder: Bidder, category: str, pdf: bytes, filename: str) -> Document:
    folder = os.path.join(settings.UPLOAD_DIRECTORY, bidder.id)
    os.makedirs(folder, exist_ok=True)
    stored = f"{new_id()}.pdf"
    path = os.path.join(folder, stored)
    with open(path, "wb") as fh:
        fh.write(pdf)
    doc = Document(bidder_id=bidder.id, tender_id=None, category=category, original_filename=filename, stored_filename=stored,
                   file_path=path, mime_type="application/pdf", file_size_bytes=len(pdf),
                   file_hash_sha256=hashlib.sha256(pdf).hexdigest(), uploaded_at=NOW - timedelta(days=2), status="UPLOADED")
    db.add(doc)
    db.commit()
    return doc


def _documents(b: dict) -> dict[str, tuple[bytes, str]]:
    name, gstin = b["name"], b.get("bad_gstin") or make_gstin(b["state"], b["pan"])
    author = b.get("author", "Issuing Portal")
    docs: dict[str, tuple[bytes, str]] = {}

    gst = D.gst(name, gstin, b["addr"], dmy(b["inc"] + timedelta(days=200)),
                constitution="Public Limited Company" if "PLC" in b["cin"] else "Private Limited Company")
    if b["key"] == "alpha":
        docs["GST"] = (D.sign(gst.pdf), "GST_REG06_Alpha.pdf")
    elif b["key"] == "deccan":
        docs["GST"] = (D.set_metadata(gst.pdf, {"/Producer": "iLovePDF", "/ModDate": "D:20230115093000+05'30'"}), "GST_Certificate_Deccan.pdf")
    else:
        docs["GST"] = (gst.pdf, f"GST_{b['key']}.pdf")

    docs["MCA"] = (D.incorporation(name, b["cin"], dmy(b["inc"])).pdf, f"COI_{b['key']}.pdf")

    oem_until = TODAY + timedelta(days=400)
    if b["key"] == "bharat":
        oem_until = TODAY - timedelta(days=6)
    oem = D.oem(name, "Synthetic Pumps Manufacturing Co", "Centrifugal process pumps", dmy(oem_until - timedelta(days=365)),
                dmy(oem_until), author=author)
    if b["key"] == "coastal":
        lapsed = TODAY - timedelta(days=45)
        oem = D.oem(name, "Synthetic Pumps Manufacturing Co", "Centrifugal process pumps", dmy(lapsed - timedelta(days=365)), dmy(lapsed))
        docs["OEM_AUTHORIZATION"] = (D.retype(oem, "Valid Upto", dmy(lapsed.replace(year=lapsed.year + 2))), "OEM_Authorization_Coastal.pdf")
    else:
        docs["OEM_AUTHORIZATION"] = (oem.pdf, f"OEM_{b['key']}.pdf")

    fy = [("FY 2023-24", b["turnover"][0]), ("FY 2024-25", b["turnover"][1])]
    ca = D.turnover(name, fy, f"25{b['pan'][:4]}88AB{b['pan'][5:9]}", dmy(TODAY - timedelta(days=90)), author=author)
    if b["key"] == "eastline":
        signed = D.Doc(ca.kind, D.sign(ca.pdf), ca.fields)
        docs["FINANCIAL"] = (D.retype(signed, "Average Annual Turnover", "Rs 6.10 Crore", font="Helvetica-Oblique"), "CA_Turnover_Eastline.pdf")
    else:
        docs["FINANCIAL"] = (ca.pdf, f"Turnover_{b['key']}.pdf")

    if b["udyam"]:
        u_name = "Bharat Flowtek Pvt Ltd" if b["key"] == "bharat" else name
        docs["UDYAM"] = (D.udyam(u_name, b["udyam"], b["addr"], dmy(b["inc"] + timedelta(days=2000))).pdf, f"Udyam_{b['key']}.pdf")
    return docs


def _registry(b: dict) -> dict:
    """What the sandbox registries hold for this bidder."""
    rec = {"GST": {}, "PAN": {}, "MCA": {}, "UDYAM": {}, "DEBARMENT": {}}
    if not b.get("bad_gstin"):
        rec["GST"][make_gstin(b["state"], b["pan"])] = {"status": "VERIFIED", "legal_name": b["name"], "registration_status": "Active"}
    rec["PAN"][b["pan"]] = {"status": "VERIFIED", "legal_name": b["name"], "pan_status": "ACTIVE"}
    rec["MCA"][b["cin"]] = {"status": "VERIFIED", "company_name": b["name"], "company_status": "Active",
                            "directors": [n for n, _ in b["directors"]]}
    if b["udyam"]:
        rec["UDYAM"][b["udyam"]] = {"status": "VERIFIED", "legal_name": "Bharat Flowtek Pvt Ltd" if b["key"] == "bharat" else b["name"],
                                    "enterprise_category": "Small"}
    rec["DEBARMENT"][b["cin"]] = {"status": "VERIFIED", "is_currently_debarred": False, "debarment_records_found": 0,
                                  "message": "No active debarment record in the sandbox list."}
    return rec


def _tender(db, number, title, value, deadline_days, status, reqs, creator) -> Tender:
    t = Tender(tender_number=number, title=title, estimated_value=value, published_at=NOW - timedelta(days=10),
               deadline=NOW + timedelta(days=deadline_days), status=status, created_by=creator.id, tender_type="OPEN_TENDER",
               tender_category="GOODS", tender_mode="ONLINE", bid_system="TWO_PACKET", location="Manali Refinery, Chennai",
               bid_validity_days=90, gem_tender_id=f"GEM/2026/B/{int(hashlib.sha1(number.encode()).hexdigest(), 16) % 10**7}")
    db.add(t)
    db.commit()
    for rtype, desc, mandatory, threshold, unit, evidence in reqs:
        db.add(Requirement(tender_id=t.id, requirement_type=rtype, description=desc, is_mandatory=mandatory, threshold=threshold,
                           threshold_unit=unit, weight=1.0, evidence_type=evidence))
    db.commit()
    return t


def _events(db, user: User, bidder: Bidder, tender: Tender, b: dict, at: datetime):
    for event, when in (("LOGIN", at - timedelta(minutes=20)), ("DOCUMENT_UPLOAD", at - timedelta(minutes=12)), ("BID_SUBMIT", at)):
        net = ".".join(b["ip"].split(".")[:3]) + ".0/24"
        db.add(SubmissionEvent(user_id=user.id, bidder_id=bidder.id, tender_id=tender.id, event=event, ip_hash=_h(b["ip"]),
                               network_hash=_h(net), device_hash=_h(b["device"]), user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                               timezone="Asia/Kolkata", interaction={"paste_count": 6 if b.get("author") else 0}, created_at=when,
                               paste_count=6 if b.get("author") else 0))
    db.commit()


def seed():
    _reset()
    db = SessionLocal()
    admin = User(email="admin@cpcl.gov.in", hashed_password=hash_password("Admin@123"), full_name="S. Venkatesh, Administrator", role=UserRole.ADMIN)
    officer = User(email="officer@cpcl.gov.in", hashed_password=hash_password("Officer@123"), full_name="Rajesh Kumar, Procurement Officer", role=UserRole.PROCUREMENT_OFFICER)
    auditor = User(email="auditor@cpcl.gov.in", hashed_password=hash_password("Auditor@123"), full_name="Priya Natarajan, Vigilance", role=UserRole.AUDITOR)
    db.add_all([admin, officer, auditor])
    db.commit()
    log_action(db, "SEED", actor=admin, description="Demo dataset created")

    pump = _tender(db, "CPCL/2026/PUMP/089", "Procurement of High-Capacity Centrifugal Pumps", 12000000, 7, "ACTIVE", [
        ("GST", "Valid GST registration", True, None, "NONE", "GST"),
        ("PAN", "PAN of the bidding entity", False, None, "NONE", "PAN"),
        ("MCA", "Certificate of incorporation", True, None, "NONE", "MCA"),
        ("OEM_AUTHORIZATION", "Manufacturer's authorization valid on the bid date", True, None, "NONE", "OEM_AUTHORIZATION"),
        ("TURNOVER", "Average annual turnover of at least 5 crore", True, 5, "CRORE", "FINANCIAL"),
        ("UDYAM", "Udyam registration for MSE purchase preference", False, None, "NONE", "UDYAM"),
        ("DEBARMENT", "Not debarred by any Central or State body", True, None, "BOOLEAN", "OTHER"),
    ], admin)
    valve = _tender(db, "CPCL/2026/VALVE/092", "Supply of Industrial Valves & Flanges", 3600000, 12, "ACTIVE", [
        ("GST", "Valid GST registration", True, None, "NONE", "GST"),
        ("MCA", "Certificate of incorporation", True, None, "NONE", "MCA"),
        ("TURNOVER", "Average annual turnover of at least 2 crore", True, 2, "CRORE", "FINANCIAL"),
        ("DEBARMENT", "Not debarred by any Central or State body", True, None, "BOOLEAN", "OTHER"),
    ], admin)
    _tender(db, "CPCL/2026/SOLAR/098", "Rooftop Solar PV Power Plant Installation", 8500000, 30, "DRAFT", [], admin)

    registry: dict[str, dict] = {k: {} for k in ("GST", "PAN", "MCA", "UDYAM", "DEBARMENT")}
    people: dict[str, tuple[User, Bidder, dict]] = {}
    for b in BIDDERS:
        email = b["email"] if b["key"] in ("alpha", "bharat") else f"{b['key']}@bidder.example.in"
        user = User(email=email, hashed_password=hash_password("Bidder@123"), full_name=f"{b['name']} (bid desk)", role=UserRole.BIDDER)
        db.add(user)
        db.commit()
        bidder = Bidder(user_id=user.id, company_name=b["name"], legal_name=b["name"], pan_number=b["pan"],
                        gstin=b.get("bad_gstin") or make_gstin(b["state"], b["pan"]), cin=b["cin"], udyam_number=b["udyam"],
                        registered_address=b["addr"], incorporation_date=b["inc"], contact_email=b["email"], contact_phone=b["phone"],
                        directors=[{"name": n, "din": din} for n, din in b["directors"]], status="ACTIVE")
        db.add(bidder)
        db.commit()
        for cat, (pdf, fname) in _documents(b).items():
            _store(db, bidder, cat, pdf, fname)
        for reg, recs in _registry(b).items():
            registry[reg].update(recs)
        people[b["key"]] = (user, bidder, b)
    sandbox.write(registry)

    def bid(tender: Tender, key: str, price: int, at: datetime, declared: float):
        user, bidder, b = people[key]
        db.add(TenderBidder(tender_id=tender.id, bidder_id=bidder.id, invited_at=NOW - timedelta(days=9)))
        db.add(BidSubmission(tender_id=tender.id, bidder_id=bidder.id, quoted_price=price, declared_turnover_crore=declared,
                             local_content_percent=62.0, submitted_at=at, status="SUBMITTED"))
        db.commit()
        _events(db, user, bidder, tender, b, at)
        case = cs.get_or_create(db, tender.id, bidder.id)
        cs.submit(db, case, user)
        return case

    base = NOW - timedelta(hours=26)
    declared = {"alpha": 45.4, "bharat": 12.3, "coastal": 23.3, "deccan": 8.7, "eastern": 8.15, "eastline": 6.1, "kaveri": 16.5}
    offsets = {"alpha": 0, "bharat": 95, "coastal": 180, "deccan": 260, "eastern": 400, "eastline": 403}
    cases = {}
    for key, price in PUMP_PRICES.items():
        cases[("pump", key)] = bid(pump, key, price, base + timedelta(minutes=offsets[key]), declared[key])
        print(f"  screened {people[key][1].company_name}: {cases[('pump', key)].lane}")
    for i, (key, price) in enumerate(VALVE_PRICES.items()):
        cases[("valve", key)] = bid(valve, key, price, base + timedelta(hours=3, minutes=40 * i), declared[key])

    # One finished case so the Auditor and bidder views have a decided record to show.
    done = cases[("valve", "kaveri")]
    cs.start_review(db, done, officer)
    for f in done.findings:
        if f["severity"] == "HIGH":
            cs.dispose(db, done, officer, f["id"], "UPHELD", "Checked against the source document.")
    cs.decide(db, done, officer, "QUALIFIED", "All mandatory requirements evidenced; no integrity findings.")

    # One case waiting on the bidder.
    wait = cases[("pump", "deccan")]
    cs.start_review(db, wait, officer)
    cs.request_clarification(db, wait, officer, "Your GSTIN 27AABCD5678P1ZQ does not pass the GSTIN check digit. "
                             "Please upload the GST REG-06 certificate downloaded from the GST portal.", requested_category="GST")
    db.close()

    print("\nDemo accounts (password in brackets):")
    print("  Admin              admin@cpcl.gov.in      (Admin@123)")
    print("  Procurement Officer officer@cpcl.gov.in    (Officer@123)")
    print("  Auditor            auditor@cpcl.gov.in    (Auditor@123)")
    print("  Bidder (clean)     alpha@alphaindia.in    (Bidder@123)")
    print("  Bidder (flagged)   bharat@bharatflowtech.in (Bidder@123)")
    print("  Other bidders      <key>@bidder.example.in (Bidder@123), key in coastal, deccan, eastern, eastline, kaveri")


if __name__ == "__main__":
    seed()
