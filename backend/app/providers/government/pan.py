from typing import Any, Optional

from app.providers.government.base import BaseGovernmentProvider, _seeded_random, outcome_to_status, pick_outcome


class PANProvider(BaseGovernmentProvider):
    registry_name = "PAN"

    def verify(self, identifier: str, context: Optional[dict[str, Any]] = None) -> dict[str, Any]:
        context = context or {}
        rng = _seeded_random(identifier, "pan")
        outcome = pick_outcome(identifier, "pan")
        status = outcome_to_status(outcome)
        name = context.get("company_name", "Registered Entity")
        data = {
            "pan": identifier,
            "name_on_pan": name,
            "pan_status": "Active" if outcome not in ("INACTIVE", "RECORD_NOT_FOUND") else "Inactive",
            "pan_type": rng.choice(["Company", "Firm", "Individual"]),
            "last_updated": f"{rng.randint(2018, 2025)}-{rng.randint(1,12):02d}-{rng.randint(1,28):02d}",
            "outcome": outcome,
        }
        if outcome == "RECORD_NOT_FOUND":
            data["message"] = "PAN not found in Income Tax database."
        elif outcome == "MISMATCH":
            data["message"] = "Name on PAN differs from name submitted with the bid."
            data["name_on_pan"] = name + " Pvt Ltd"
        return self._envelope(outcome != "RECORD_NOT_FOUND", status, data)
