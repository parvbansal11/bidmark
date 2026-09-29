# API Reference

Base URL (local dev): `http://localhost:8000`. Interactive OpenAPI docs are always available at `/docs` (Swagger UI) and `/redoc` while the backend is running.

All responses use a consistent envelope:

```json
{ "success": true, "data": { "...": "..." }, "message": "Human-readable summary", "timestamp": "2026-09-11T00:00:00Z" }
```

Errors:

```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "details": null }, "timestamp": "..." }
```

Authenticate by sending `Authorization: Bearer <token>` on every request after login/register. Tokens are JWTs valid for `ACCESS_TOKEN_EXPIRE_MINUTES` (default 480).

Roles: `BIDDER`, `PROCUREMENT_OFFICER`, `ADMIN`. Most write endpoints require `PROCUREMENT_OFFICER` or `ADMIN`; read endpoints generally accept any authenticated role.

---

## Authentication

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/v1/auth/register` | none | `{ email, password, full_name, role }`. A `BIDDER` registration auto-creates a linked `Bidder` profile. |
| POST | `/api/v1/auth/login` | none | `{ email, password }` → `{ access_token, user }` |
| GET | `/api/v1/auth/me` | any | Current user |

## Bidders

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/v1/bidders` | any | Create a bidder profile |
| GET | `/api/v1/bidders` | any | List, filter by `q` / `gstin` / `pan` |
| GET | `/api/v1/bidders/{bidder_id}` | any | |
| PUT | `/api/v1/bidders/{bidder_id}` | any | Partial update |

## Tenders & Requirements

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/v1/tenders` | officer/admin | `{ tender_number, title, ..., requirements: [...] }` |
| GET | `/api/v1/tenders` | any | Filter by `status` / `q` |
| GET | `/api/v1/tenders/{tender_id}` | any | Includes requirements |
| PUT | `/api/v1/tenders/{tender_id}` | officer/admin | |
| POST | `/api/v1/tenders/{tender_id}/requirements` | officer/admin | Add a requirement |
| GET | `/api/v1/tenders/{tender_id}/requirements` | any | |
| POST | `/api/v1/tenders/{tender_id}/bidders/{bidder_id}` | officer/admin | Link a bidder to a tender |
| GET | `/api/v1/tenders/{tender_id}/bidders` | any | List linked bidders |

## Bid Submissions

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/v1/tenders/{tender_id}/bidders/{bidder_id}/bid-submission` | any | Create or update (upsert) a bidder's declared bid: `quoted_price`, `local_content_percent`, `declared_turnover_crore`, `submitted_at`. Feeds the compliance engine's `LOCAL_CONTENT`/`TURNOVER` checks and the behavioral engine's submission-timing analysis. |
| GET | `/api/v1/tenders/{tender_id}/bidders/{bidder_id}/bid-submission` | any | 404 if none recorded |

## Documents

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/v1/bidders/{bidder_id}/documents` | any | `multipart/form-data`: `category`, optional `tender_id`, `file` |
| GET | `/api/v1/bidders/{bidder_id}/documents` | any | |
| GET | `/api/v1/documents/{document_id}` | any | Includes extraction + verification results |
| DELETE | `/api/v1/documents/{document_id}` | any | Soft delete |
| POST | `/api/v1/documents/{document_id}/extract` | any | Runs OCR/field extraction (Local OCR for real PDFs/text, Mock provider fallback) |
| POST | `/api/v1/documents/{document_id}/verify` | any | Verifies the extracted fields against the appropriate mock government registry |

## Government Verification (Mock Gateway)

All 13 routes share the same request/response shape. Every response is tagged `is_mock: true`, `source: "MOCK_GOVERNMENT_API"`.

| Method | Path | Registry |
|---|---|---|
| POST | `/api/v1/verify/gst` | GST |
| POST | `/api/v1/verify/pan` | PAN |
| POST | `/api/v1/verify/udyam` | Udyam |
| POST | `/api/v1/verify/income-tax` | Income Tax |
| POST | `/api/v1/verify/mca` | MCA |
| POST | `/api/v1/verify/startup` | Startup India |
| POST | `/api/v1/verify/nsic` | NSIC |
| POST | `/api/v1/verify/epfo` | EPFO |
| POST | `/api/v1/verify/esic` | ESIC |
| POST | `/api/v1/verify/oem` | OEM Authorization |
| POST | `/api/v1/verify/local-content` | Local Content self-certification |
| POST | `/api/v1/verify/debarment` | Debarment registry |
| POST | `/api/v1/verify/digilocker` | DigiLocker |
| GET | `/api/v1/verify/registries` | List all 13 registries |

Request body: `{ identifier, context?, bidder_id?, document_id? }`.

## Cross-Document Verification

| Method | Path | Notes |
|---|---|---|
| POST | `/api/v1/verification/cross-check/{bidder_id}/{tender_id}` | Runs the cross-check engine; returns `cross_checks` + `discrepancies` |
| GET | `/api/v1/verification/cross-check/{bidder_id}/{tender_id}` | Retrieve last results |

## Compliance & AI Recommendation

| Method | Path | Notes |
|---|---|---|
| POST | `/api/v1/compliance/evaluate/{bidder_id}/{tender_id}` | Runs the compliance engine → `ComplianceReport` |
| GET | `/api/v1/compliance/report/{bidder_id}/{tender_id}` | Latest report |
| POST | `/api/v1/compliance/recommendation/{bidder_id}/{tender_id}` | Requires a prior evaluation; returns `{ recommendation, confidence, reasons[], critical_issues[], missing_requirements[], recommended_actions[], disclaimer }`. `recommendation` is always one of `COMPLIANT` / `REQUIRES_REVIEW` / `NON_COMPLIANT`. |

## Forensics & Fingerprinting

| Method | Path | Notes |
|---|---|---|
| POST | `/api/v1/forensics/analyze/{document_id}` | Digital document forensics (USP 1) |
| POST | `/api/v1/forensics/fingerprint/{document_id}` | Generate a document fingerprint (USP 2) |
| POST | `/api/v1/forensics/compare` | `{ document_id_a, document_id_b }` → similarity comparison |
| GET | `/api/v1/forensics/compare/tender/{tender_id}?min_score=0.6` | Cross-bidder similarity scan for a tender |
| GET | `/api/v1/forensics/document/{document_id}` | Aggregated forensic + fingerprint + comparison view |

## Behavior

| Method | Path | Notes |
|---|---|---|
| POST | `/api/v1/behavior/analyze/{bidder_id}/{tender_id}` | Behavioral Risk Intelligence (USP 3) |
| GET | `/api/v1/behavior/report/{bidder_id}/{tender_id}` | Latest report |

## Cross-Bidder Intelligence

| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/cross-bidder/graph/{tender_id}` | Relationship graph (USP 4) |
| GET | `/api/v1/red-flag-cascade/{bidder_id}/{tender_id}` | Red Flag Cascade (USP 5) |

## Simulator (officer/admin only)

| Method | Path | Notes |
|---|---|---|
| POST | `/api/v1/simulator/{tender_id}` | `{ overrides: [{ requirement_id, threshold?, is_mandatory?, weight? }], bidder_ids? }` — pure in-memory recompute (USP 6); never mutates the tender |

## Copilot (officer/admin only)

| Method | Path | Notes |
|---|---|---|
| POST | `/api/v1/copilot/ask` | `{ bidder_id, tender_id, question, compare_bidder_id? }` — answers strictly from evidence already computed (USP 8) |

## Dashboard

| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/dashboard/overview` | Platform-wide counts |
| GET | `/api/v1/dashboard/tenders/{tender_id}` | Per-tender bidder table |
| GET | `/api/v1/dashboard/bidders/{bidder_id}/{tender_id}` | **Bidder 360°** — the primary investigation payload (USP 10) |
| GET | `/api/v1/dashboard/review-queue` | Exception-only queue (USP 7) |
| GET | `/api/v1/dashboard/risk-summary` | Aggregate distributions for charts |

## Decisions (human-in-the-loop)

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/v1/decisions/{bidder_id}/{tender_id}` | officer/admin | `{ decision: "QUALIFIED" \| "DISQUALIFIED" \| "PENDING_REVIEW", reason }` |
| GET | `/api/v1/decisions/{bidder_id}/{tender_id}` | any | History |

## Audit Trail

| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/audit/bidder/{bidder_id}` | Every action recorded for a bidder, across all tenders |
| GET | `/api/v1/audit/{bidder_id}/{tender_id}` | Scoped to one bidder + tender |

## Verification Workflow

| Method | Path | Notes |
|---|---|---|
| POST | `/api/v1/verification/run/{bidder_id}/{tender_id}` | Runs the full orchestrated pipeline (extraction → government verification → cross-check → compliance → forensics → fingerprinting → behavioral analysis → AI recommendation) in one call, logging every stage to the audit trail |
