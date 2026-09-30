# Local frontend implementation

Audit baseline (29 September 2026): React 19, TypeScript, Vite 8; FastAPI, SQLAlchemy, SQLite. Backend: 107 tests pass. Frontend: 12 pass, 7 fail because Vitest lacks jsdom/setup configuration. Existing DB has 7 bidders, 3 tenders, 31 present documents. Pump tender has 6 bidders. No reseed needed.

Plan: replace obsolete routed screens with a government procurement shell; retain the framework and backend. Centralise authenticated requests and real errors. Implement role home, tenders/comparison, case evidence, dispositions/decision, connections, audit, seller submission/clarification, admin governance, then contextual Copilot. Browser-test real local flows and regression-test backend guarantees.

## Screen contracts

All requests below use /api/v1. Protected routes resolve /auth/me before rendering. Every data surface has pending, empty and error/retry states. Mutations show server errors and reload authoritative data. No synthetic network fallback.

| Screen | Endpoints | Permission |
| --- | --- | --- |
| Sign-in / registration | POST auth/login, POST auth/register, GET auth/me | Public; backend resolves role |
| Workspace | GET home | Role-specific response |
| Tenders | GET tenders, tenders/:id, tenders/:id/requirements | Staff; seller uses portal/tenders |
| Comparison | GET cases/queue?tender_id, dashboard/bidders/:bidder/:tender | Officer/Admin (dashboard endpoint excludes auditor) |
| Case | GET cases/:id, bidders/:id, documents list | Oversight |
| Compliance/registry | GET dashboard/bidders/:bidder/:tender | Officer/Admin |
| Forensics | GET documents/:id/evidence, documents/:id/pages/:page.png | Oversight; authenticated image blobs |
| Connections | GET tenders/:id/intelligence | Oversight |
| Decision | POST cases/:id/dispositions, start-review, clarifications, decision | Officer UI; backend remains authoritative |
| Audit | GET audit/feed, audit/chain/verify, cases/:id/timeline | Oversight |
| Seller | GET home, cases/mine, portal/profile, portal/tenders, own documents; POST upload, bid-submission, clarifications/:id/answer | Bidder only |
| Governance | GET/POST/PATCH users, GET rules/reliability, POST tenders/requirements, POST cases/:id/reopen | Admin |
| Copilot | POST copilot/ask | Officer; citations navigate to recorded findings |

## Contract limits and semantics

- Registry adapters are sandbox/mock, not live government access.
- Auditor cannot use legacy dashboard/360 endpoints; case/evidence/timeline are available.
- Actual backend allows Admin through require_officer; UI reserves qualification decisions for Procurement Officer per product brief. No backend permission changes.
- Backend registration supports privileged roles on configured domain, despite outdated comments; public UI offers bidder registration and demo staff login.
- Evidence geometry is top-left PDF points. Never invent geometry. Signature-level evidence may have no page pin.
- Copilot defaults to an evidence template provider; model-backed answers require configured credentials.
- Audit is tamper-evident chaining, not blockchain or immutable storage.
- Existing local service owns 8000. Bidmark uses 8001; frontend uses 5173 with development proxy.
