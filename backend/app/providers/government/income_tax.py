from typing import Any, Optional

from app.providers.government.base import BaseGovernmentProvider, _seeded_random, outcome_to_status, pick_outcome


class IncomeTaxProvider(BaseGovernmentProvider):
    registry_name = "INCOME_TAX"

    def verify(self, identifier: str, context: Optional[dict[str, Any]] = None) -> dict[str, Any]:
        context = context or {}
        rng = _seeded_random(identifier, "itr")
        outcome = pick_outcome(identifier, "itr")
        status = outcome_to_status(outcome)
        data = {
            "pan": identifier,
            "latest_return_filed_ay": f"{rng.randint(2022, 2025)}-{rng.randint(23,26)}",
            "filing_status": "Filed" if outcome == "VERIFIED" else rng.choice(["Filed Late", "Not Filed"]),
            "declared_turnover_crore": round(rng.uniform(1, 120), 2),
            "outcome": outcome,
        }
        if outcome == "RECORD_NOT_FOUND":
            data["message"] = "No income tax filing record found for this PAN."
        elif outcome == "EXPIRED":
            data["message"] = "Most recent return filing is older than the tender's required window."
        return self._envelope(outcome != "RECORD_NOT_FOUND", status, data)
