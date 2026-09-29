"""
GeM Bid Compliance Verification Platform, FastAPI application entrypoint.

PS 26100, AI-Powered Integrated Bid Compliance Verification Platform for GeM
Procurement. Ministry of Petroleum & Natural Gas / Chennai Petroleum
Corporation Limited (CPCL).

This backend never claims access to real government databases. All
government verification is served by a Mock Government Verification API
Gateway whose responses are always tagged {"source": "MOCK_GOVERNMENT_API",
"is_mock": true}. The architecture is provider-based so real, authorized
integrations can replace the mock providers later without touching callers.
"""
import os
import time

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import settings
from app.core.database import Base, engine
from app.utils.responses import error_response, now_iso

# Import all models so metadata is populated before create_all().
from app import models  # noqa: F401

app = FastAPI(
    title=settings.APP_NAME,
    description=(
        "AI-powered decision-support platform for verifying bidder compliance, "
        "document integrity and behavioral risk during GeM procurement. AI never "
        "issues a final qualification decision, that remains with the "
        "Procurement Officer."
    ),
    version="1.0.0",
    openapi_tags=[
        {"name": "Authentication", "description": "Register (bidder self-service only), login, current user"},
        {"name": "User Management", "description": "Admin-only provisioning of Procurement Officer / Admin / Bidder accounts"},
        {"name": "Bidders", "description": "Bidder profile management"},
        {"name": "Tenders", "description": "Tender and requirement management"},
        {"name": "Bid Submissions", "description": "Bidder-declared bid details (price, local content %, turnover, submission time)"},
        {"name": "Documents", "description": "Document upload, OCR extraction, verification"},
        {"name": "Government Verification", "description": "Mock Government Verification API Gateway"},
        {"name": "Cross Verification", "description": "Cross-document consistency checks"},
        {"name": "Compliance", "description": "Compliance evaluation, scoring, AI recommendation"},
        {"name": "Forensics", "description": "Digital document forensics and fingerprinting"},
        {"name": "Behavior", "description": "Behavioral risk intelligence"},
        {"name": "Cross-Bidder Intelligence", "description": "Cross-bidder relationship graph"},
        {"name": "Simulator", "description": "What-If compliance simulator"},
        {"name": "Copilot", "description": "Procurement Officer Copilot (evidence-grounded Q&A)"},
        {"name": "Dashboard", "description": "Dashboard and review-queue APIs"},
        {"name": "Decisions", "description": "Human-in-the-loop officer decisions"},
        {"name": "Audit", "description": "Append-only audit trail"},
        {"name": "Verification Workflow", "description": "End-to-end automated verification orchestration"},
        {"name": "Bidder Portal", "description": "Self-scoped bidder-facing dashboard, documents, compliance, actions, submissions, notifications and profile"},
        {"name": "Home", "description": "Role-specific landing data: tasks first, then the work queue"},
        {"name": "Cases", "description": "Evaluation workflow: submit, screen, review, rule on findings, clarify, decide"},
        {"name": "Evidence", "description": "Field positions, forensic signals, page images, tender intelligence, audit chain"},
    ],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    response.headers["X-Process-Time-Ms"] = str(round((time.time() - start) * 1000, 2))
    return response


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    detail = exc.detail
    if isinstance(detail, dict) and "code" in detail:
        return error_response(detail["code"], detail["message"], detail.get("details"), exc.status_code)
    return error_response("HTTP_ERROR", str(detail), status_code=exc.status_code)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return error_response("VALIDATION_ERROR", "Invalid request data", details=exc.errors(), status_code=422)


@app.on_event("startup")
def on_startup():
    os.makedirs(settings.UPLOAD_DIRECTORY, exist_ok=True)
    Base.metadata.create_all(bind=engine)


@app.get("/", tags=["Health"])
def root():
    return {
        "service": settings.APP_NAME,
        "status": "ok",
        "timestamp": now_iso(),
        "note": "All government verification in this prototype is served by a Mock Government Verification API Gateway.",
    }


@app.get("/health", tags=["Health"])
def health():
    return {"status": "healthy", "timestamp": now_iso()}


# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
from app.api.v1.auth import router as auth_router  # noqa: E402
from app.api.v1.users import router as users_router  # noqa: E402
from app.api.v1.government import router as government_router  # noqa: E402
from app.api.v1.bidders import router as bidders_router  # noqa: E402
from app.api.v1.tenders import router as tenders_router  # noqa: E402
from app.api.v1.bid_submissions import router as bid_submissions_router  # noqa: E402
from app.api.v1.documents import router as documents_router  # noqa: E402
from app.api.v1.cross_verification import router as cross_verification_router  # noqa: E402
from app.api.v1.compliance import router as compliance_router  # noqa: E402
from app.api.v1.forensics import router as forensics_router  # noqa: E402
from app.api.v1.behavior import router as behavior_router  # noqa: E402
from app.api.v1.cross_bidder import router as cross_bidder_router  # noqa: E402
from app.api.v1.simulator import router as simulator_router  # noqa: E402
from app.api.v1.copilot import router as copilot_router  # noqa: E402
from app.api.v1.audit import router as audit_router  # noqa: E402
from app.api.v1.decisions import router as decisions_router  # noqa: E402
from app.api.v1.dashboard import router as dashboard_router  # noqa: E402
from app.api.v1.workflow import router as workflow_router  # noqa: E402
from app.api.v1.bidder_portal import router as bidder_portal_router  # noqa: E402
from app.api.v1.bidmark import router as bidmark_router  # noqa: E402
from app.api.v1.cases import clar_router, router as cases_router  # noqa: E402
from app.api.v1.evidence import router as evidence_router  # noqa: E402
from app.api.v1.home import router as home_router  # noqa: E402

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(government_router)
app.include_router(bidders_router)
app.include_router(tenders_router)
app.include_router(bid_submissions_router)
app.include_router(documents_router)
app.include_router(cross_verification_router)
app.include_router(compliance_router)
app.include_router(forensics_router)
app.include_router(behavior_router)
app.include_router(cross_bidder_router)
app.include_router(simulator_router)
app.include_router(copilot_router)
app.include_router(audit_router)
app.include_router(decisions_router)
app.include_router(dashboard_router)
app.include_router(workflow_router)
app.include_router(bidder_portal_router)
app.include_router(bidmark_router)
app.include_router(home_router)
app.include_router(cases_router)
app.include_router(clar_router)
app.include_router(evidence_router)
