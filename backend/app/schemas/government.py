from typing import Any, Optional

from pydantic import BaseModel


class VerifyRequest(BaseModel):
    identifier: str
    bidder_id: Optional[str] = None
    document_id: Optional[str] = None
    context: Optional[dict[str, Any]] = None
