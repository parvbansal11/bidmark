from typing import Any, Optional

from app.providers.government.base import BaseGovernmentProvider, _seeded_random


class LocalContentProvider(BaseGovernmentProvider):
    """
    Make in India / local content self-certification check. This does not
    depend on an external registry, it validates the bidder's declared
    local-content percentage against the tender's threshold, and is exposed
    through the gateway for a consistent interface with the other checks.
    """

    registry_name = "LOCAL_CONTENT"

    def verify(self, identifier: str, context: Optional[dict[str, Any]] = None) -> dict[str, Any]:
        context = context or {}
        declared = context.get("declared_local_content_percent")
        threshold = context.get("required_local_content_percent")
        rng = _seeded_random(identifier or "local-content", "local_content")
        if declared is None:
            declared = round(rng.uniform(20, 95), 1)
        meets = threshold is None or declared >= threshold
        data = {
            "declared_local_content_percent": declared,
            "required_local_content_percent": threshold,
            "meets_requirement": meets,
            "self_certificate_reference": identifier,
            "outcome": "VERIFIED" if meets else "MISMATCH",
        }
        status = "VERIFIED" if meets else "FAILED"
        if not meets:
            data["message"] = f"Declared local content ({declared}%) is below the tender's required threshold ({threshold}%)."
        return self._envelope(True, status, data)
