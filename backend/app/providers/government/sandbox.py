"""Sandbox registry: a fixed dataset of registered entities that the mock
gateway answers from before falling back to its seeded simulation.

The dataset stands in for GSTN, MCA21, Udyam and the rest during development,
as the problem statement allows. Because answers come from records rather
than a hash of the identifier, a clean bidder always verifies and a lapsed
registration always reads as lapsed.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone

from app.core.config import settings
from app.forensics.identifiers import decode_gstin
from app.utils.ids import new_ref

_CACHE: dict | None = None
_MTIME = 0.0


def _load() -> dict:
    global _CACHE, _MTIME
    path = settings.SANDBOX_REGISTRY_PATH
    if not os.path.exists(path):
        return {}
    mtime = os.path.getmtime(path)
    if _CACHE is None or mtime != _MTIME:
        with open(path) as fh:
            _CACHE = json.load(fh)
        _MTIME = mtime
    return _CACHE


def lookup(registry: str, identifier: str) -> dict | None:
    data = _load()
    if not data:
        return None
    ident = (identifier or "").strip().upper()
    rec = (data.get(registry.upper()) or {}).get(ident)
    if rec is None and registry.upper() == "GST" and ident and not decode_gstin(ident).valid:
        # GSTN cannot hold a number that fails its own check digit.
        rec = {"status": "RECORD_NOT_FOUND", "gstin": ident,
               "message": "No GST registration exists for this number; it fails the GSTIN check digit."}
    if rec is None:
        return None
    status = rec.get("status", "VERIFIED")
    data = {k: v for k, v in rec.items() if k != "status"}
    data["outcome"] = status
    data["lookup"] = "SANDBOX_REGISTRY"
    return {
        "success": status != "RECORD_NOT_FOUND",
        "status": {"VERIFIED": "VERIFIED", "EXPIRED": "EXPIRED", "INACTIVE": "FAILED", "CANCELLED": "FAILED",
                   "MISMATCH": "REQUIRES_REVIEW", "RECORD_NOT_FOUND": "FAILED"}.get(status, "REQUIRES_REVIEW"),
        "source": "MOCK_GOVERNMENT_API",
        "is_mock": True,
        "registry": registry.upper(),
        "reference_id": new_ref("SBX-REF"),
        "verified_at": datetime.now(timezone.utc).isoformat(),
        "data": data,
    }


def write(records: dict) -> None:
    path = settings.SANDBOX_REGISTRY_PATH
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w") as fh:
        json.dump(records, fh, indent=2, sort_keys=True)
