from typing import Any, Optional

from app.providers.government.base import BaseGovernmentProvider, _seeded_random, outcome_to_status, pick_outcome


class OEMProvider(BaseGovernmentProvider):
    """
    OEM authorization is not a government registry in reality, but the SIH
    problem statement groups it with the other bidder-verification checks, so
    it is exposed through the same Mock Government API Gateway interface for
    architectural consistency (this can later be replaced with an OEM
    authorization-letter validation workflow instead of a registry lookup).
    """

    registry_name = "OEM_AUTHORIZATION"

    def verify(self, identifier: str, context: Optional[dict[str, Any]] = None) -> dict[str, Any]:
        context = context or {}
        rng = _seeded_random(identifier, "oem")
        outcome = pick_outcome(identifier, "oem")
        status = outcome_to_status(outcome)
        data = {
            "authorization_reference": identifier,
            "oem_name": context.get("oem_name", rng.choice(["Siemens", "Honeywell", "ABB", "Emerson", "Schneider Electric"])),
            "authorized_bidder": context.get("company_name", "Registered Entity"),
            "validity": f"{rng.randint(2025, 2027)}-{rng.randint(1,12):02d}-{rng.randint(1,28):02d}",
            "scope": rng.choice(["Sales & Service", "Sales Only", "Sales, Service & Spares"]),
            "outcome": outcome,
        }
        if outcome == "RECORD_NOT_FOUND":
            data["message"] = "OEM authorization letter reference could not be validated."
        elif outcome == "EXPIRED":
            data["message"] = "OEM authorization has expired as of the validity date."
        return self._envelope(outcome != "RECORD_NOT_FOUND", status, data)
