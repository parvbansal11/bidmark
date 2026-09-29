"""Offline structural checks on Indian statutory identifiers.

None of this needs portal access. A GSTIN carries a mod-36 check digit and
embeds the holder's PAN and state; a PAN encodes the holder type; a CIN encodes
listing status, industry, state, year and company class. A forged or
mistyped identifier usually fails one of these before any registry is asked.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

_ALNUM = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"

GST_STATES = {
    "01": "JAMMU AND KASHMIR", "02": "HIMACHAL PRADESH", "03": "PUNJAB", "04": "CHANDIGARH",
    "05": "UTTARAKHAND", "06": "HARYANA", "07": "DELHI", "08": "RAJASTHAN", "09": "UTTAR PRADESH",
    "10": "BIHAR", "11": "SIKKIM", "12": "ARUNACHAL PRADESH", "13": "NAGALAND", "14": "MANIPUR",
    "15": "MIZORAM", "16": "TRIPURA", "17": "MEGHALAYA", "18": "ASSAM", "19": "WEST BENGAL",
    "20": "JHARKHAND", "21": "ODISHA", "22": "CHHATTISGARH", "23": "MADHYA PRADESH",
    "24": "GUJARAT", "26": "DADRA AND NAGAR HAVELI AND DAMAN AND DIU", "27": "MAHARASHTRA",
    "29": "KARNATAKA", "30": "GOA", "31": "LAKSHADWEEP", "32": "KERALA", "33": "TAMIL NADU",
    "34": "PUDUCHERRY", "35": "ANDAMAN AND NICOBAR ISLANDS", "36": "TELANGANA",
    "37": "ANDHRA PRADESH", "38": "LADAKH", "97": "OTHER TERRITORY", "99": "CENTRE JURISDICTION",
}

# Two-letter codes used in CIN and Udyam numbers.
STATE_ABBR = {
    "JK": "JAMMU AND KASHMIR", "HP": "HIMACHAL PRADESH", "PB": "PUNJAB", "CH": "CHANDIGARH",
    "UK": "UTTARAKHAND", "UT": "UTTARAKHAND", "HR": "HARYANA", "DL": "DELHI", "RJ": "RAJASTHAN",
    "UP": "UTTAR PRADESH", "BR": "BIHAR", "SK": "SIKKIM", "AR": "ARUNACHAL PRADESH",
    "NL": "NAGALAND", "MN": "MANIPUR", "MZ": "MIZORAM", "TR": "TRIPURA", "ML": "MEGHALAYA",
    "AS": "ASSAM", "WB": "WEST BENGAL", "JH": "JHARKHAND", "OR": "ODISHA", "OD": "ODISHA",
    "CT": "CHHATTISGARH", "CG": "CHHATTISGARH", "MP": "MADHYA PRADESH", "GJ": "GUJARAT",
    "DN": "DADRA AND NAGAR HAVELI AND DAMAN AND DIU", "DD": "DADRA AND NAGAR HAVELI AND DAMAN AND DIU",
    "MH": "MAHARASHTRA", "KA": "KARNATAKA", "GA": "GOA", "LD": "LAKSHADWEEP", "KL": "KERALA",
    "TN": "TAMIL NADU", "PY": "PUDUCHERRY", "AN": "ANDAMAN AND NICOBAR ISLANDS",
    "TG": "TELANGANA", "TS": "TELANGANA", "AP": "ANDHRA PRADESH", "LA": "LADAKH",
}

PAN_HOLDER_TYPES = {
    "P": "Individual", "C": "Company", "H": "Hindu Undivided Family", "F": "Firm / LLP",
    "A": "Association of Persons", "T": "Trust", "B": "Body of Individuals",
    "L": "Local Authority", "J": "Artificial Juridical Person", "G": "Government",
}

CIN_CLASSES = {
    "PTC": "Private company", "PLC": "Public company", "OPC": "One person company",
    "GOI": "Central government company", "SGC": "State government company",
    "FLC": "Financial lease company", "GAP": "General association (public)",
    "GAT": "General association (private)", "NPL": "Section 8 (not for profit)",
    "ULL": "Unlimited liability public", "ULT": "Unlimited liability private", "FTC": "Subsidiary of foreign company",
}

PAN_RE = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")
GSTIN_RE = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")
CIN_RE = re.compile(r"^([LU])([0-9]{5})([A-Z]{2})([0-9]{4})([A-Z]{3})([0-9]{6})$")
UDYAM_RE = re.compile(r"^UDYAM-([A-Z]{2})-([0-9]{2})-([0-9]{7})$")


@dataclass
class Finding:
    code: str
    ok: bool
    detail: str
    severity: str = "HIGH"


@dataclass
class Decoded:
    kind: str
    value: str
    valid: bool
    parts: dict = field(default_factory=dict)
    findings: list[Finding] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "kind": self.kind,
            "value": self.value,
            "valid": self.valid,
            "parts": self.parts,
            "findings": [f.__dict__ for f in self.findings],
        }


def gstin_check_char(first14: str) -> str:
    total = 0
    for i, ch in enumerate(first14):
        product = _ALNUM.index(ch) * (2 if i % 2 else 1)
        total += product // 36 + product % 36
    return _ALNUM[(36 - total % 36) % 36]


def decode_pan(value: str) -> Decoded:
    v = (value or "").strip().upper()
    d = Decoded("PAN", v, False)
    if not PAN_RE.match(v):
        d.findings.append(Finding("PAN_FORMAT", False, f"'{v}' is not in the AAAAA9999A format."))
        return d
    holder = PAN_HOLDER_TYPES.get(v[3])
    d.parts = {"holder_type_code": v[3], "holder_type": holder or "Unknown", "name_initial": v[4]}
    if not holder:
        d.findings.append(Finding("PAN_HOLDER_TYPE", False, f"4th character '{v[3]}' is not a valid PAN holder type."))
        return d
    d.valid = True
    return d


def decode_gstin(value: str) -> Decoded:
    v = (value or "").strip().upper()
    d = Decoded("GSTIN", v, False)
    if not GSTIN_RE.match(v):
        d.findings.append(Finding("GSTIN_FORMAT", False, f"'{v}' is not a 15-character GSTIN."))
        return d
    state = GST_STATES.get(v[:2])
    expected = gstin_check_char(v[:14])
    d.parts = {
        "state_code": v[:2],
        "state": state or "Unknown",
        "pan": v[2:12],
        "registration_number_in_state": v[12],
        "check_char": v[14],
        "expected_check_char": expected,
    }
    if not state:
        d.findings.append(Finding("GSTIN_STATE", False, f"State code {v[:2]} does not exist."))
    if expected != v[14]:
        d.findings.append(Finding(
            "GSTIN_CHECKSUM", False,
            f"Check character is '{v[14]}' but the first 14 characters require '{expected}'. "
            "A real GSTIN always satisfies this, so the number was mistyped or made up.",
        ))
    pan = decode_pan(v[2:12])
    if not pan.valid:
        d.findings.append(Finding("GSTIN_EMBEDDED_PAN", False, "The PAN inside this GSTIN is itself malformed."))
    d.valid = not d.findings
    return d


def decode_cin(value: str) -> Decoded:
    v = (value or "").strip().upper()
    d = Decoded("CIN", v, False)
    m = CIN_RE.match(v)
    if not m:
        d.findings.append(Finding("CIN_FORMAT", False, f"'{v}' is not a 21-character CIN."))
        return d
    listing, nic, st, year, cls, reg = m.groups()
    d.parts = {
        "listed": listing == "L",
        "nic_industry_code": nic,
        "state_code": st,
        "state": STATE_ABBR.get(st, "Unknown"),
        "incorporation_year": int(year),
        "company_class_code": cls,
        "company_class": CIN_CLASSES.get(cls, "Unknown"),
        "registration_number": reg,
    }
    if st not in STATE_ABBR:
        d.findings.append(Finding("CIN_STATE", False, f"State code {st} does not exist."))
    if cls not in CIN_CLASSES:
        d.findings.append(Finding("CIN_CLASS", False, f"Company class {cls} is not a recognised MCA class."))
    if not 1850 <= int(year) <= 2100:
        d.findings.append(Finding("CIN_YEAR", False, f"Incorporation year {year} is implausible."))
    d.valid = not d.findings
    return d


def decode_udyam(value: str) -> Decoded:
    v = (value or "").strip().upper()
    d = Decoded("UDYAM", v, False)
    m = UDYAM_RE.match(v)
    if not m:
        d.findings.append(Finding("UDYAM_FORMAT", False, f"'{v}' is not in the UDYAM-XX-00-0000000 format."))
        return d
    st, district, serial = m.groups()
    d.parts = {"state_code": st, "state": STATE_ABBR.get(st, "Unknown"), "district_code": district, "serial": serial}
    if st not in STATE_ABBR:
        d.findings.append(Finding("UDYAM_STATE", False, f"State code {st} does not exist."))
    d.valid = not d.findings
    return d


def state_in_address(address: str | None) -> str | None:
    if not address:
        return None
    a = re.sub(r"[^A-Z ]", " ", address.upper())
    a = re.sub(r"\s+", " ", a)
    names = sorted(set(GST_STATES.values()) | {"ORISSA", "PONDICHERRY", "NEW DELHI"}, key=len, reverse=True)
    for name in names:
        if f" {name} " in f" {a} ":
            return {"ORISSA": "ODISHA", "PONDICHERRY": "PUDUCHERRY", "NEW DELHI": "DELHI"}.get(name, name)
    return None


def _first_significant_letter(name: str) -> str | None:
    words = re.sub(r"[^A-Za-z ]", " ", name).split()
    skip = {"M", "S", "MS", "THE", "SHRI", "SRI", "MESSRS"}
    for w in words:
        if w.upper() not in skip:
            return w[0].upper()
    return None


def cross_validate(
    *,
    pan: str | None = None,
    gstin: str | None = None,
    cin: str | None = None,
    udyam: str | None = None,
    legal_name: str | None = None,
    address: str | None = None,
    incorporation_year: int | None = None,
) -> dict:
    """Decodes every identifier supplied and checks them against each other.

    Returns {"identifiers": {...}, "findings": [...]} where each finding is
    either a failed structural check or an inconsistency between two sources.
    """
    decoded: dict[str, Decoded] = {}
    if pan:
        decoded["PAN"] = decode_pan(pan)
    if gstin:
        decoded["GSTIN"] = decode_gstin(gstin)
    if cin:
        decoded["CIN"] = decode_cin(cin)
    if udyam:
        decoded["UDYAM"] = decode_udyam(udyam)

    findings: list[dict] = []
    for d in decoded.values():
        findings += [{"sources": [d.kind], **f.__dict__} for f in d.findings]

    p, g, c, u = (decoded.get(k) for k in ("PAN", "GSTIN", "CIN", "UDYAM"))

    if p and g and p.valid and g.parts.get("pan") and g.parts["pan"] != p.value:
        findings.append({"sources": ["PAN", "GSTIN"], "code": "GSTIN_PAN_MISMATCH", "ok": False, "severity": "HIGH",
                         "detail": f"GSTIN embeds PAN {g.parts['pan']} but the PAN supplied is {p.value}."})

    pan_type = (p.parts.get("holder_type_code") if p and p.valid else None) or (
        g.parts["pan"][3] if g and g.parts.get("pan") else None)
    if c and c.valid and pan_type and pan_type != "C":
        findings.append({"sources": ["PAN", "CIN"], "code": "PAN_TYPE_VS_COMPANY", "ok": False, "severity": "HIGH",
                         "detail": f"A CIN means the bidder is a company, but the PAN holder type is "
                                   f"'{PAN_HOLDER_TYPES.get(pan_type, pan_type)}', not Company."})

    if legal_name and pan_type and pan_type != "P":
        initial = _first_significant_letter(legal_name)
        pan_initial = (p.value[4] if p and p.valid else g.parts["pan"][4] if g and g.parts.get("pan") else None)
        if initial and pan_initial and initial != pan_initial:
            findings.append({"sources": ["PAN", "NAME"], "code": "PAN_NAME_INITIAL", "ok": False, "severity": "MEDIUM",
                             "detail": f"For a non-individual PAN the 5th character is the entity name's first letter. "
                                       f"'{legal_name}' starts with {initial}, the PAN has {pan_initial}."})

    addr_state = state_in_address(address)
    for d, label in ((g, "GSTIN"), (c, "CIN"), (u, "UDYAM")):
        if d and d.parts.get("state") and d.parts["state"] != "Unknown" and addr_state and d.parts["state"] != addr_state:
            # A GSTIN is state-scoped, so a mismatch there is stronger than for CIN (registered office can move).
            findings.append({"sources": [label, "ADDRESS"], "code": f"{label}_STATE_VS_ADDRESS", "ok": False,
                             "severity": "MEDIUM" if label == "GSTIN" else "LOW",
                             "detail": f"{label} is registered in {d.parts['state']} but the address is in {addr_state}."})

    if c and c.valid and incorporation_year and c.parts["incorporation_year"] != incorporation_year:
        findings.append({"sources": ["CIN", "PROFILE"], "code": "CIN_YEAR_VS_INCORPORATION", "ok": False, "severity": "HIGH",
                         "detail": f"CIN says incorporated in {c.parts['incorporation_year']}, "
                                   f"the declared incorporation year is {incorporation_year}."})

    return {"identifiers": {k: v.as_dict() for k, v in decoded.items()}, "findings": findings}


def make_gstin(state_code: str, pan: str, entity_no: str = "1") -> str:
    """Builds a checksum-valid GSTIN. Used for seed data and tests."""
    body = f"{state_code}{pan.upper()}{entity_no}Z"
    return body + gstin_check_char(body)
