from typing import Any, Optional

from app.providers.government.base import BaseGovernmentProvider, _seeded_random, outcome_to_status, pick_outcome
from app.providers.government.fake_data import fake_gstin


class GSTProvider(BaseGovernmentProvider):
    registry_name = "GST"

    def verify(self, identifier: str, context: Optional[dict[str, Any]] = None) -> dict[str, Any]:
        context = context or {}
        rng = _seeded_random(identifier, "gst")
        outcome = pick_outcome(identifier, "gst")
        status = outcome_to_status(outcome)
        legal_name = context.get("company_name", "Registered Entity")
        data = {
            "gstin": identifier or fake_gstin(rng),
            "legal_name": legal_name,
            "trade_name": legal_name,
            "registration_status": "Active" if outcome != "INACTIVE" else "Cancelled",
            "taxpayer_type": rng.choice(["Regular", "Composition"]),
            "registration_date": f"{rng.randint(2015, 2023)}-{rng.randint(1,12):02d}-{rng.randint(1,28):02d}",
            "state_jurisdiction": rng.choice(["Delhi", "Maharashtra", "Tamil Nadu", "Karnataka"]),
            "outcome": outcome,
        }
        if outcome == "RECORD_NOT_FOUND":
            data["message"] = "No GST record found for the provided GSTIN."
        elif outcome == "EXPIRED":
            data["message"] = "GST registration has lapsed / not renewed."
        elif outcome == "MISMATCH":
            data["message"] = "Legal name on GST record does not match submitted document."
            data["legal_name"] = legal_name + " Limited"
        return self._envelope(outcome != "RECORD_NOT_FOUND", status, data)
