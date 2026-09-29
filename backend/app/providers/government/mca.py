from typing import Any, Optional

from app.providers.government.base import BaseGovernmentProvider, _seeded_random, outcome_to_status, pick_outcome
from app.providers.government.fake_data import fake_cin

_FIRST_NAMES = [
    "Ramesh", "Suresh", "Anita", "Priya", "Vikram", "Sanjay", "Deepa", "Rajesh",
    "Kavita", "Arjun", "Neha", "Manoj", "Pooja", "Rahul", "Sunita", "Ashok",
    "Meena", "Vivek", "Shalini", "Rohit", "Geeta", "Amit", "Divya", "Kiran",
]
_LAST_NAMES = [
    "Sharma", "Verma", "Iyer", "Nair", "Reddy", "Gupta", "Menon", "Rao",
    "Chatterjee", "Bansal", "Malhotra", "Pillai", "Desai", "Joshi", "Kapoor", "Naidu",
]


def _fake_director_names(rng, count: int) -> list[str]:
    names = []
    for _ in range(count):
        names.append(f"{rng.choice(_FIRST_NAMES)} {rng.choice(_LAST_NAMES)}")
    return names


class MCAProvider(BaseGovernmentProvider):
    registry_name = "MCA"

    def verify(self, identifier: str, context: Optional[dict[str, Any]] = None) -> dict[str, Any]:
        context = context or {}
        rng = _seeded_random(identifier, "mca")
        outcome = pick_outcome(identifier, "mca")
        status = outcome_to_status(outcome)
        name = context.get("company_name", "Registered Company")
        data = {
            "cin": identifier or fake_cin(rng),
            "company_name": name,
            "company_status": "Active" if outcome != "INACTIVE" else "Struck Off",
            "date_of_incorporation": context.get(
                "incorporation_date", f"{rng.randint(2005, 2024)}-{rng.randint(1,12):02d}-{rng.randint(1,28):02d}"
            ),
            "registered_office_address": context.get("address", "Registered Office, India"),
            "directors": _fake_director_names(rng, rng.randint(2, 4)),
            "outcome": outcome,
        }
        if outcome == "RECORD_NOT_FOUND":
            data["message"] = "CIN not found in MCA21 registry."
        elif outcome == "MISMATCH":
            data["message"] = "Company name on MCA record shows minor variation from submitted documents."
            data["company_name"] = name.replace("Pvt Ltd", "Limited") if "Pvt Ltd" in name else name + " Limited"
        return self._envelope(outcome != "RECORD_NOT_FOUND", status, data)
