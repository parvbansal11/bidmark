"""
Minimal in-memory rate limiter for login brute-force protection.

Intentionally simple: a fixed-window failure counter keyed by
`email:client_ip`, held in process memory. This is enough to stop naive
credential-stuffing / password-guessing scripts against a single-instance
deployment (which is what this platform runs as). A multi-instance
production deployment would swap this for a shared store (e.g. Redis)
behind the same `check` / `record_failure` / `clear` interface — nothing
above this module would need to change.
"""
from __future__ import annotations

import threading
import time

from fastapi import HTTPException, status


class LoginRateLimiter:
    def __init__(self, max_attempts: int = 5, window_seconds: int = 900, lockout_seconds: int = 900):
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self.lockout_seconds = lockout_seconds
        self._failures: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def _prune(self, key: str, now: float) -> list[float]:
        cutoff = now - self.window_seconds
        attempts = [t for t in self._failures.get(key, []) if t > cutoff]
        self._failures[key] = attempts
        return attempts

    def check(self, key: str) -> None:
        """Raise 429 if this key has exceeded the failed-attempt threshold."""
        now = time.time()
        with self._lock:
            attempts = self._prune(key, now)
            if len(attempts) >= self.max_attempts:
                retry_after = int(self.lockout_seconds - (now - attempts[0]))
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Too many failed login attempts. Please try again in {max(retry_after, 60) // 60} minute(s).",
                )

    def record_failure(self, key: str) -> None:
        now = time.time()
        with self._lock:
            self._prune(key, now)
            self._failures.setdefault(key, []).append(now)

    def clear(self, key: str) -> None:
        with self._lock:
            self._failures.pop(key, None)


# Shared instance used by the login endpoint.
login_rate_limiter = LoginRateLimiter()
