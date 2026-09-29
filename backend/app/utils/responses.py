"""
Consistent API response envelope used across every endpoint, per the platform's
API response standard.
"""
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import HTTPException
from fastapi.responses import JSONResponse


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def success(data: Any = None, message: str = "Operation completed successfully") -> dict:
    return {"success": True, "data": data, "message": message, "timestamp": now_iso()}


def error_response(code: str, message: str, details: Optional[list] = None, status_code: int = 400) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "success": False,
            "error": {"code": code, "message": message, "details": details or []},
            "timestamp": now_iso(),
        },
    )


class ApiError(HTTPException):
    """Raise this anywhere in a route/service to produce the standard error envelope."""

    def __init__(self, code: str, message: str, status_code: int = 400, details: Optional[list] = None):
        super().__init__(status_code=status_code, detail={"code": code, "message": message, "details": details or []})
