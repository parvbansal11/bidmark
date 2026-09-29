from typing import Any, Optional

from app.providers.government.base import BaseGovernmentProvider, _seeded_random, outcome_to_status, pick_outcome


class ESICProvider(BaseGovernmentProvider):
    registry_name = "ESIC"

    def verify(self, identifier: str, context: Optional[dict[str, Any]] = None) -> dict[str, Any]:
        rng = _seeded_random(identifier, "esic")
        outcome = pick_outcome(identifier, "esic")
        status = outcome_to_status(outcome)
        data = {
            "esic_employer_code": identifier,
            "compliance_status": "Compliant" if outcome == "VERIFIED" else rng.choice(["Defaulter", "Not Registered"]),
            "employees_covered": rng.randint(10, 400),
            "outcome": outcome,
        }
        if outcome == "RECORD_NOT_FOUND":
            data["message"] = "No ESIC employer record found for this code."
        return self._envelope(outcome != "RECORD_NOT_FOUND", status, data)
