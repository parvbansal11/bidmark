from typing import Any, Optional

from app.providers.government.base import BaseGovernmentProvider, _seeded_random, outcome_to_status, pick_outcome


class EPFOProvider(BaseGovernmentProvider):
    registry_name = "EPFO"

    def verify(self, identifier: str, context: Optional[dict[str, Any]] = None) -> dict[str, Any]:
        rng = _seeded_random(identifier, "epfo")
        outcome = pick_outcome(identifier, "epfo")
        status = outcome_to_status(outcome)
        data = {
            "epfo_establishment_code": identifier,
            "compliance_status": "Compliant" if outcome == "VERIFIED" else rng.choice(["Defaulter", "Not Registered"]),
            "employees_covered": rng.randint(15, 500),
            "last_contribution_month": f"{rng.randint(2025, 2026)}-{rng.randint(1,8):02d}",
            "outcome": outcome,
        }
        if outcome == "RECORD_NOT_FOUND":
            data["message"] = "No EPFO establishment record found for this code."
        return self._envelope(outcome != "RECORD_NOT_FOUND", status, data)
