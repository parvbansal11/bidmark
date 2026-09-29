# Frontend contract

Everything the UI needs, screen by screen. The live OpenAPI schema is at `GET /docs` on the backend.

## Basics

- Base URL: `VITE_API_BASE_URL` (e.g. `https://bidmark-api.onrender.com`). All paths below start with `/api/v1`.
- Auth: `POST /api/v1/auth/login` `{email, password}` → `data.access_token`, `data.user.role`. Send `Authorization: Bearer <token>` on every call.
- Every response: `{success: true, data, message, timestamp}`. Errors: `{success: false, error: {code, message, details}}`. Show `error.message`; branch on `error.code`.
- Roles: `ADMIN`, `PROCUREMENT_OFFICER`, `BIDDER`, `AUDITOR`. Route to the role's home after login.
- **No mock fallback.** The old frontend silently switched to fake data when the API failed, which is why the deployed site showed numbers with no backend behind it. Remove `api/mockFallback.ts`; show a real error instead.

### Telemetry headers (bidder screens only)

On login, document upload and bid submission, send:

- `X-Device-Id`: a stable hash the browser computes once and keeps in localStorage (e.g. SHA-256 of user agent, screen size, timezone, language, hardware concurrency, plus a random id generated on first visit).
- `X-Session-Signals`: JSON `{"paste_count": n, "keystrokes": n, "fill_ms": n, "timezone": "Asia/Kolkata"}` for the form just submitted.

The server hashes them again before storing and never stores raw IPs. This feeds cartel detection.

### Evidence boxes

Findings and fields carry `page` (1-based) and `bbox` `[x0, top, x1, bottom]` in **PDF points, origin top left**.

- Page image: `GET /api/v1/documents/{id}/pages/{page}.png?scale=2`. It needs the auth header, so fetch it as a blob and use `URL.createObjectURL`; a plain `<img src>` won't send the token.
- Page size in points: `evidence.page_sizes[page-1]` = `[width, height]`.
- Draw the box at `bbox * (renderedImageWidth / width)`.

## Shared

| Screen | Call |
|---|---|
| Login | `POST /auth/login` |
| Register (bidder) | `POST /auth/register` `{email, password, full_name, company_name, role: "BIDDER"}` |
| Current user | `GET /auth/me` |
| Home (every role) | `GET /home`. Returns `data.role` plus role-specific blocks below. **Tasks first.** |

## Bidder

| Screen | Call | Notes |
|---|---|---|
| Home | `GET /home` | `tasks[]` (each has `code`, `label`, optional `case_id` / `tender_id` / `document_id`), `cases[]`, `open_tenders[]`, `expiring_documents[]`, `profile_complete` |
| Profile | `GET /portal/profile`; `PUT /bidders/{id}` limited to contact fields; `POST /portal/profile/request-correction` for official identifiers | |
| Tenders | `GET /portal/tenders`; `GET /tenders/{id}`; `GET /tenders/{id}/requirements` | |
| Upload document | `POST /bidders/{bidder_id}/documents` multipart `category`, `file`, optional `tender_id` | categories: GST, PAN, UDYAM, INCOME_TAX, MCA, STARTUP_INDIA, NSIC, EPFO, ESIC, OEM_AUTHORIZATION, LOCAL_CONTENT, EXPERIENCE_CERTIFICATE, FINANCIAL, OTHER |
| My documents | `GET /bidders/{bidder_id}/documents` | |
| Submit bid | `POST /tenders/{tender_id}/bidders/{bidder_id}/bid-submission` `{quoted_price, local_content_percent, declared_turnover_crore}` | Screening runs immediately |
| My bids | `GET /cases/mine` | each: `stage` (DRAFT, SUBMITTED, UNDER_EVALUATION, CLARIFICATION_REQUESTED, DECIDED), `missing_documents`, `clarifications[]`, `next_action`, `decision`, `decision_reason` |
| Answer clarification | upload the file first, then `POST /clarifications/{id}/answer` `{text, document_id}` | |
| Notifications | `GET /portal/notifications`, `POST /portal/notifications/{id}/read` | |

Bidders never receive findings. Don't build any UI that shows risk to a bidder.

## Procurement Officer

| Screen | Call | Notes |
|---|---|---|
| Home | `GET /home` | `stats` {to_review, escalated, standard, fast_track, sla_breached, linked_bidders, awaiting_bidder, decided_last_24h}, `queue[]`, `tasks[]` |
| Queue | `GET /cases/queue?tender_id=` | rows: `case_id, tender_number, bidder_name, stage, lane, priority, counts{HIGH,MEDIUM,LOW}, in_ring, ai_recommendation, sla_due_at, sla_breached, next_action` |
| Case | `GET /cases/{id}` | `findings[]` each `{id, code, severity, source (DOCUMENT/CROSS_CHECK/REQUIREMENT/CARTEL), title, detail, document_id, category, page, bbox, evidence, reliability{precision, reviewed}, disposition}`; `undisposed_high[]`; `summary` {compliance_score, fusion_verdict, recommendation_rationale, counts, in_ring}; `ai_recommendation`; `clarifications[]`; `allowed_transitions[]` |
| Start review | `POST /cases/{id}/start-review` | |
| Rule on a finding | `POST /cases/{id}/dispositions` `{finding_id, outcome: "UPHELD"/"DISMISSED", note}` | dismissal note ≥ 10 chars |
| Ask the bidder | `POST /cases/{id}/clarifications` `{question, finding_id?, requested_category?, due_days}` | |
| Decide | `POST /cases/{id}/decision` `{decision: "QUALIFIED"/"DISQUALIFIED", reason}` | 409 `FINDINGS_UNRESOLVED` until every HIGH finding has a ruling; disable the button while `undisposed_high` is non-empty |
| Re-run screening | `POST /cases/{id}/screen` | |
| Document evidence | `GET /documents/{id}/evidence` | `fields{name: {value, page, bbox, raw, fonts}}`, `signals[]`, `checks[]` (PASS/FLAG/UNMEASURED), `structure` (metadata, revisions, signatures, fonts), `simulated`, `page_sizes` |
| Tender intelligence | `GET /tenders/{id}/intelligence` | `rings[]`, `links[]`, `price_screens` {cv, relative_distance, step_ratios, flags[]}, `bidder_names` |
| Relationship graph | `GET /cross-bidder/graph/{tender_id}` | nodes (with `ring`, `flags`), edges, rings |
| Copilot | `POST /copilot/ask` `{bidder_id, tender_id, question}` | `answer`, `evidence[]` (finding ids; make them clickable) |
| Case timeline | `GET /cases/{id}/timeline` | `events[]` with `seq`, `row_hash`; `chain` status |

**The key screen is the case view**: findings on the left grouped HIGH / MEDIUM / LOW, the document page on the right with the box drawn. For `OVERLAPPING_TEXT`, show `evidence.covered_text` next to `evidence.visible_text`.

## Admin

| Screen | Call |
|---|---|
| Home | `GET /home`: `stats`, `tasks[]` (tenders with no requirements), `rules[]` (least reliable first), `audit_chain` |
| Tenders | `GET /tenders`, `POST /tenders` (body in OpenAPI; requirements inline), `PUT /tenders/{id}`, `POST /tenders/{id}/requirements` |
| Users | `GET /users`, `POST /users` `{email, password, full_name, role}`, `PATCH /users/{id}` |
| Bidder moderation | `POST /bidders/{id}/flag`, `/suspend`, `/ban`, `/reactivate` `{reason}` |
| Reopen a case | `POST /cases/{id}/reopen` `{reason}` |
| Rule reliability | `GET /rules/reliability` |

## Auditor (read only)

| Screen | Call |
|---|---|
| Home | `GET /home`: `audit_chain` {intact, entries, head_hash, broken_at?, problem?}, `stats`, `tasks[]` (decisions against the AI, dismissed HIGH findings), `recent_decisions[]` |
| Chain check | `GET /audit/chain/verify` |
| Audit feed | `GET /audit/feed?limit=100&action=FINAL_DECISION` |
| Case timeline | `GET /cases/{id}/timeline` |
