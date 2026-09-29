from typing import Any, Optional

from app.providers.government.base import BaseGovernmentProvider, _seeded_random, outcome_to_status, pick_outcome


class NSICProvider(BaseGovernmentProvider):
    registry_name = "NSIC"

    def verify(self, identifier: str, context: Optional[dict[str, Any]] = None) -> dict[str, Any]:
        rng = _seeded_random(identifier, "nsic")
        outcome = pick_outcome(identifier, "nsic")
        status = outcome_to_status(outcome)
        data = {
            "nsic_registration_number": identifier,
            "certificate_status": "Valid" if outcome == "VERIFIED" else rng.choice(["Expired", "Not Found"]),
            "monetary_limit_crore": round(rng.uniform(0.5, 15), 2),
            "valid_upto": f"{rng.randint(2024, 2027)}-{rng.randint(1,12):02d}-{rng.randint(1,28):02d}",
            "outcome": outcome,
        }
        if outcome == "RECORD_NOT_FOUND":
            data["message"] = "No NSIC single point registration found."
        elif outcome == "EXPIRED":
            data["message"] = "NSIC registration certificate has expired."
        return self._envelope(outcome != "RECORD_NOT_FOUND", status, data)
