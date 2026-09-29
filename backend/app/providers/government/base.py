"""
Mock Government Verification API Gateway, base provider interface.

IMPORTANT (prototype rule): this module does NOT access any real government
database or private GeM API. Every provider below is a deterministic,
seeded simulator that fabricates realistic-looking fictional data. Every
response is explicitly tagged {"source": "MOCK_GOVERNMENT_API", "is_mock":
true} so nothing can be mistaken for a real verification result.

The architecture is intentionally provider-based (one class per registry)
behind a single consistent interface (`verify(identifier, context) -> dict`)
so that, in a real deployment, each mock provider could be swapped for an
authorized, real integration (e.g. GSTN, NSDL, MCA21, DigiLocker) without any
change to the callers (routes/services that consume GovernmentVerificationProvider).
"""
from __future__ import annotations

import hashlib
import random
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any, Optional

from app.utils.ids import new_ref


def _seeded_random(identifier: str, salt: str) -> random.Random:
    """Deterministic per-identifier RNG so the same input always yields the
    same mock verdict within a session (stable demos, reproducible tests)."""
    seed = int(hashlib.sha256(f"{salt}:{identifier}".encode()).hexdigest(), 16) % (2**32)
    return random.Random(seed)


OUTCOMES = ["VERIFIED", "RECORD_NOT_FOUND", "EXPIRED", "MISMATCH", "INACTIVE", "PENDING_VERIFICATION"]
OUTCOME_WEIGHTS = [0.68, 0.08, 0.07, 0.07, 0.05, 0.05]


def pick_outcome(identifier: str, salt: str) -> str:
    rng = _seeded_random(identifier, salt)
    return rng.choices(OUTCOMES, weights=OUTCOME_WEIGHTS, k=1)[0]


def outcome_to_status(outcome: str) -> str:
    return {
        "VERIFIED": "VERIFIED",
        "RECORD_NOT_FOUND": "FAILED",
        "EXPIRED": "EXPIRED",
        "MISMATCH": "REQUIRES_REVIEW",
        "INACTIVE": "FAILED",
        "PENDING_VERIFICATION": "REQUIRES_REVIEW",
    }[outcome]


class BaseGovernmentProvider(ABC):
    """Every registry provider (GST, PAN, Udyam, ...) implements this contract."""

    registry_name: str = "GENERIC"

    @abstractmethod
    def verify(self, identifier: str, context: Optional[dict[str, Any]] = None) -> dict[str, Any]:
        ...

    def _envelope(
        self,
        success: bool,
        status: str,
        data: dict[str, Any],
        reference_id: Optional[str] = None,
    ) -> dict[str, Any]:
        return {
            "success": success,
            "status": status,
            "source": "MOCK_GOVERNMENT_API",
            "is_mock": True,
            "registry": self.registry_name,
            "reference_id": reference_id or new_ref("MOCK-REF"),
            "verified_at": datetime.now(timezone.utc).isoformat(),
            "data": data,
        }
