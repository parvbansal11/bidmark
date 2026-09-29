"""Records where bidder actions come from.

The client may send two optional headers:
  X-Device-Id       a stable hash the browser computes from its own traits
  X-Session-Signals JSON: {"paste_count", "keystrokes", "fill_ms", "timezone"}
Everything else (IP, user agent) the server reads itself.
"""
from __future__ import annotations

import hashlib
import hmac
import ipaddress
import json

from fastapi import Request
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.telemetry import SubmissionEvent


def _h(value: str) -> str:
    return hmac.new(settings.JWT_SECRET.encode(), value.encode(), hashlib.sha256).hexdigest()


def client_ip(request: Request) -> str | None:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else None


def network_of(ip: str | None) -> str | None:
    if not ip:
        return None
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return None
    prefix = 24 if addr.version == 4 else 48
    return str(ipaddress.ip_network(f"{ip}/{prefix}", strict=False))


def record(db: Session, request: Request | None, event: str, *, user_id=None, bidder_id=None, tender_id=None,
           commit: bool = True) -> SubmissionEvent | None:
    if request is None:
        return None
    ip = client_ip(request)
    net = network_of(ip)
    device = (request.headers.get("x-device-id") or "").strip()[:128]
    try:
        signals = json.loads(request.headers.get("x-session-signals") or "{}")
        if not isinstance(signals, dict):
            signals = {}
    except ValueError:
        signals = {}
    signals = {k: signals[k] for k in ("paste_count", "keystrokes", "fill_ms", "fields", "timezone") if k in signals}
    ev = SubmissionEvent(
        user_id=user_id, bidder_id=bidder_id, tender_id=tender_id, event=event,
        ip_hash=_h(ip) if ip else None, network_hash=_h(net) if net else None,
        device_hash=_h(device) if device else None,
        user_agent=(request.headers.get("user-agent") or "")[:300] or None,
        timezone=str(signals.get("timezone"))[:60] if signals.get("timezone") else None,
        interaction=signals, paste_count=int(signals.get("paste_count") or 0),
    )
    db.add(ev)
    if commit:
        db.commit()
    return ev
