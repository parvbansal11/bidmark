"""
Shared fictional-data helpers for the Mock Government Verification API
Gateway. Nothing here touches a real registry — it is pure pseudo-random
generation seeded off the identifier being verified so results are stable.
"""
from __future__ import annotations

import random

STATE_CODES = {
    "07": "Delhi", "27": "Maharashtra", "29": "Karnataka", "33": "Tamil Nadu",
    "06": "Haryana", "24": "Gujarat", "09": "Uttar Pradesh", "19": "West Bengal",
}

SUFFIXES = ["Pvt Ltd", "Private Limited", "Industries", "Solutions Pvt Ltd", "Enterprises", "Technologies Pvt Ltd"]


def pick(rng: random.Random, choices, weights=None):
    return rng.choices(choices, weights=weights, k=1)[0]


def fake_pan(rng: random.Random) -> str:
    letters = "".join(rng.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ") for _ in range(5))
    digits = "".join(rng.choice("0123456789") for _ in range(4))
    check = rng.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
    return f"{letters}{digits}{check}"


def fake_gstin(rng: random.Random, pan: str | None = None) -> str:
    state = rng.choice(list(STATE_CODES.keys()))
    pan_part = pan or fake_pan(rng)
    entity_code = rng.choice("123456789")
    return f"{state}{pan_part}{entity_code}Z{rng.choice('0123456789')}"


def fake_cin(rng: random.Random) -> str:
    listing = rng.choice(["U", "L"])
    industry = "".join(rng.choice("0123456789") for _ in range(5))
    state = rng.choice(list(STATE_CODES.keys()))
    year = rng.choice(range(1998, 2024))
    kind = rng.choice(["PTC", "PLC"])
    number = "".join(rng.choice("0123456789") for _ in range(6))
    return f"{listing}{industry}{state}{year}{kind}{number}"


def fake_udyam(rng: random.Random, state_code: str = "DL") -> str:
    return f"UDYAM-{state_code}-{rng.randint(10,99):02d}-{rng.randint(1000000,9999999)}"
