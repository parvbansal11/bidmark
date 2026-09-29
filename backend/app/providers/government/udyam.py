from typing import Any, Optional

from app.providers.government.base import BaseGovernmentProvider, _seeded_random, outcome_to_status, pick_outcome
from app.providers.government.fake_data import fake_udyam


class UdyamProvider(BaseGovernmentProvider):
    registry_name = "UDYAM"

    def verify(self, identifier: str, context: Optional[dict[str, Any]] = None) -> dict[str, Any]:
        context = context or {}
        rng = _seeded_random(identifier, "udyam")
        outcome = pick_outcome(identifier, "udyam")
        status = outcome_to_status(outcome)
        data = {
            "udyam_registration_number": identifier or fake_udyam(rng),
            "enterprise_name": context.get("company_name", "Registered Enterprise"),
            "enterprise_type": rng.choice(["Micro", "Small", "Medium"]),
            "major_activity": rng.choice(["Manufacturing", "Services"]),
            "date_of_registration": f"{rng.randint(2016, 2023)}-{rng.randint(1,12):02d}-{rng.randint(1,28):02d}",
            "outcome": outcome,
        }
        if outcome == "RECORD_NOT_FOUND":
            data["message"] = "No Udyam/MSME registration found for the provided number."
        return self._envelope(outcome != "RECORD_NOT_FOUND", status, data)
