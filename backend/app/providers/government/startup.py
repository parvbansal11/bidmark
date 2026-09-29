from typing import Any, Optional

from app.providers.government.base import BaseGovernmentProvider, _seeded_random, outcome_to_status, pick_outcome


class StartupIndiaProvider(BaseGovernmentProvider):
    registry_name = "STARTUP_INDIA"

    def verify(self, identifier: str, context: Optional[dict[str, Any]] = None) -> dict[str, Any]:
        rng = _seeded_random(identifier, "startup")
        outcome = pick_outcome(identifier, "startup")
        status = outcome_to_status(outcome)
        data = {
            "startup_recognition_number": identifier,
            "recognition_status": "Recognized" if outcome == "VERIFIED" else "Not Recognized",
            "sector": rng.choice(["IT/ITES", "Manufacturing", "Fintech", "AgriTech"]),
            "recognized_on": f"{rng.randint(2019, 2024)}-{rng.randint(1,12):02d}-{rng.randint(1,28):02d}",
            "outcome": outcome,
        }
        if outcome == "RECORD_NOT_FOUND":
            data["message"] = "No DPIIT Startup India recognition found for this number."
        return self._envelope(outcome != "RECORD_NOT_FOUND", status, data)
