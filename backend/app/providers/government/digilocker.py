from typing import Any, Optional

from app.providers.government.base import BaseGovernmentProvider, _seeded_random, outcome_to_status, pick_outcome


class DigiLockerProvider(BaseGovernmentProvider):
    """Simulates DigiLocker-issued document authenticity verification."""

    registry_name = "DIGILOCKER"

    def verify(self, identifier: str, context: Optional[dict[str, Any]] = None) -> dict[str, Any]:
        rng = _seeded_random(identifier, "digilocker")
        outcome = pick_outcome(identifier, "digilocker")
        status = outcome_to_status(outcome)
        data = {
            "document_uri": identifier or f"IN.GOV.MOCK/{rng.randint(100000,999999)}",
            "issued_by": rng.choice(["CBSE", "Income Tax Department", "MCA", "State Government"]),
            "e_signed": outcome == "VERIFIED",
            "integrity_check": "PASSED" if outcome == "VERIFIED" else "COULD_NOT_VERIFY",
            "outcome": outcome,
        }
        if outcome == "RECORD_NOT_FOUND":
            data["message"] = "Document URI not found in DigiLocker mock repository."
        return self._envelope(outcome != "RECORD_NOT_FOUND", status, data)
