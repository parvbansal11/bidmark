"""
Mock Government Verification API Gateway routes.

Every response returned here originates from a simulated registry and is
tagged is_mock=true / source="MOCK_GOVERNMENT_API". No real government
system or private GeM API is contacted.
"""
from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_officer
from app.models.user import User
from app.models.verification import VerificationResult
from app.providers.government.registry import GovernmentVerificationProvider
from app.schemas.government import VerifyRequest
from app.services.audit_service import log_action
from app.utils.responses import success

router = APIRouter(prefix="/api/v1/verify", tags=["Government Verification"])

REGISTRY_ROUTES = {
    "gst": "GST",
    "pan": "PAN",
    "udyam": "UDYAM",
    "income-tax": "INCOME_TAX",
    "mca": "MCA",
    "startup": "STARTUP_INDIA",
    "nsic": "NSIC",
    "epfo": "EPFO",
    "esic": "ESIC",
    "oem": "OEM_AUTHORIZATION",
    "local-content": "LOCAL_CONTENT",
    "debarment": "DEBARMENT",
    "digilocker": "DIGILOCKER",
}


def _make_handler(registry_key: str):
    def handler(
        payload: VerifyRequest,
        db: Session = Depends(get_db),
        current_user: User = Depends(require_officer),
    ):
        result = GovernmentVerificationProvider.verify(registry_key, payload.identifier, payload.context)

        if payload.document_id:
            record = VerificationResult(
                document_id=payload.document_id,
                verification_type=registry_key,
                status=result["status"],
                government_source=result["source"],
                is_mock=result["is_mock"],
                reference_id=result["reference_id"],
                verified_at=datetime.fromisoformat(result["verified_at"]),
                details=result["data"],
                reasons=[result["data"].get("message")] if result["data"].get("message") else [],
            )
            db.add(record)
            db.commit()

        log_action(
            db,
            action="GOVERNMENT_VERIFICATION",
            actor=current_user,
            entity_type="GovernmentVerification",
            entity_id=result["reference_id"],
            bidder_id=payload.bidder_id,
            description=f"{registry_key.upper()} mock verification for '{payload.identifier}' -> {result['status']}",
            metadata={"registry": registry_key, "status": result["status"]},
        )
        return success(result, f"{registry_key.upper()} verification completed (mock)")

    return handler


for path, registry in REGISTRY_ROUTES.items():
    router.add_api_route(
        f"/{path}",
        _make_handler(registry),
        methods=["POST"],
        summary=f"Verify {registry.replace('_', ' ').title()} (mock)",
    )


@router.get("/registries")
def list_registries():
    return success(GovernmentVerificationProvider.available_registries(), "Available mock government registries")
