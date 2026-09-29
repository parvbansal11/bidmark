"""Entity name comparison.

Three outcomes matter to an officer, and a plain string match can't tell them
apart:
  "Alpha Pumps Pvt Ltd" vs "Alpha Pumps Private Limited"  same entity
  "Alpha Pumps Pvt Ltd" vs "Alpha Pumps Ltd"              different legal form
  "Alpha Pumps Pvt Ltd" vs "Alfa Pumps Pvt Ltd"           look-alike, the risky one
"""
from __future__ import annotations

import re
from difflib import SequenceMatcher

_EXPAND = {
    "PVT": "PRIVATE", "PVT.": "PRIVATE", "PRIV": "PRIVATE", "LTD": "LIMITED", "LTD.": "LIMITED",
    "CO": "COMPANY", "CORP": "CORPORATION", "INDS": "INDUSTRIES", "IND": "INDUSTRIES",
    "ENGG": "ENGINEERING", "MFG": "MANUFACTURING", "INTL": "INTERNATIONAL", "&": "AND",
    "TECH": "TECHNOLOGIES", "SVCS": "SERVICES",
}
_DROP = {"M/S", "MS", "MESSRS", "THE"}
LEGAL_FORMS = [
    ("PRIVATE LIMITED", "PRIVATE_LIMITED"), ("ONE PERSON COMPANY", "OPC"), ("LIMITED LIABILITY PARTNERSHIP", "LLP"),
    ("LLP", "LLP"), ("LIMITED", "PUBLIC_LIMITED"), ("PROPRIETORSHIP", "PROPRIETORSHIP"), ("PARTNERSHIP", "PARTNERSHIP"),
]


def normalize(name: str | None) -> str:
    if not name:
        return ""
    s = name.upper().replace("M/S.", " ").replace("M/S", " ")
    s = re.sub(r"[().,'\"]", " ", s).replace("&", " & ")
    tokens = [(_EXPAND.get(t, t)) for t in s.split() if t not in _DROP]
    return " ".join(tokens)


def legal_form(name: str | None) -> str | None:
    n = normalize(name)
    for phrase, form in LEGAL_FORMS:
        if n.endswith(phrase) or f" {phrase} " in f" {n} ":
            return form
    return None


def core(name: str | None) -> str:
    n = normalize(name)
    for phrase, _ in LEGAL_FORMS:
        if n.endswith(" " + phrase):
            n = n[: -len(phrase) - 1]
            break
    return re.sub(r"[^A-Z0-9]", "", n)


def compare(a: str | None, b: str | None) -> dict:
    if not a or not b:
        return {"verdict": "UNMEASURED", "ratio": None, "detail": "One of the names is missing."}
    ca, cb = core(a), core(b)
    fa, fb = legal_form(a), legal_form(b)
    ratio = round(SequenceMatcher(None, ca, cb).ratio(), 3)
    if ca == cb:
        if fa and fb and fa != fb:
            return {"verdict": "LEGAL_FORM_DIFFERS", "ratio": 1.0, "legal_forms": [fa, fb],
                    "detail": f"Same name, different legal form ({fa} vs {fb}). These are different legal entities."}
        return {"verdict": "SAME", "ratio": 1.0, "detail": "Same entity; only spelling of the legal suffix differs." if a.strip() != b.strip() else "Identical."}
    if ratio >= 0.8:
        ops = [op for op in SequenceMatcher(None, ca, cb).get_opcodes() if op[0] != "equal"]
        diffs = [f"'{ca[i1:i2]}' vs '{cb[j1:j2]}'" for _, i1, i2, j1, j2 in ops][:3]
        return {"verdict": "LOOKALIKE", "ratio": ratio, "differences": diffs,
                "detail": f"Names are {int(ratio * 100)}% alike but not the same ({', '.join(diffs)}). "
                          "A near-identical name is how a different entity passes a quick visual check."}
    return {"verdict": "DIFFERENT", "ratio": ratio, "detail": "Names refer to different entities."}
