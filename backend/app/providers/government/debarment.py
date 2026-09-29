from typing import Any, Optional

from app.providers.government.base import BaseGovernmentProvider, _seeded_random


class DebarmentProvider(BaseGovernmentProvider):
    """Blacklisting / debarment registry check (e.g. GeM / CVC debarment list)."""

    registry_name = "DEBARMENT"

    def verify(self, identifier: str, context: Optional[dict[str, Any]] = None) -> dict[str, Any]:
        rng = _seeded_random(identifier, "debarment")
        # Debarment should be rare in a demo dataset, skew heavily toward "clear".
        is_debarred = rng.random() < 0.06
        data = {
            "entity_identifier": identifier,
            "is_currently_debarred": is_debarred,
            "debarment_records_found": 1 if is_debarred else 0,
            "outcome": "DEBARRED" if is_debarred else "CLEAR",
        }
        if is_debarred:
            data["message"] = (
                "An active debarment/blacklisting record was found. This is a mock registry result, "
                "manual verification against the official debarment list is required before any action."
            )
            status = "REQUIRES_REVIEW"
        else:
            data["message"] = "No active debarment or blacklisting record found."
            status = "VERIFIED"
        return self._envelope(True, status, data)
