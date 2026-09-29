# Handoff prompt for ChatGPT / Codex

Paste everything below the line into a new ChatGPT or Codex session with the repo attached
(`github.com/parvbansal11/bidmark`, private).

---

You're joining my Smart India Hackathon 2026 project, **Bidmark**, for problem statement **PS 26100**
(Ministry of Petroleum & Natural Gas / CPCL): an AI-powered bid compliance verification platform
for GeM procurement. We cleared the internal round and are preparing for the PPT round, where
roughly 200 teams submit on this PS. The backend is finished and tested. Your job is the frontend,
plus keeping frontend and backend in sync.

## What the PS asks, and our angle

Officers verify every bidder's GST, PAN, Udyam, MCA, OEM authorization, turnover and debarment
status by hand, across a dozen portals. The PS wants that automated, with a compliance summary
and the decision left to the officer. The weak point every team shares: the portal integrations
need credentialed government access nobody has, so most teams will demo mocked API responses.

Our angle comes from my startup, which does fraud and document forensics for lenders: **most of
the fraud this PS cares about is visible in the documents themselves and in how bids arrive**, so
we catch it with no portal access. Read `docs/USPS.md` first. The three headline USPs:

1. **The file tells on itself.** We read each PDF and point at the exact spot that was edited. When
   someone covers an expiry date with a white box and retypes it, we recover the original:
   "'15/08/2028' is printed on top of '15/08/2026'". We also catch certificates edited after being
   digitally signed, one-off fonts on key fields, re-saves in iLovePDF/Photoshop, and the same file
   submitted by two bidders.
2. **Verify without the portal.** The GSTIN check digit, PAN holder type, CIN decode (year, state,
   class) and their cross-consistency, plus digital signature validation, are all checked offline.
3. **Proxy bidders and cartels.** We link "competing" bidders who share a device, network, PDF
   author, director, phone or file, then run published bid-rigging price screens. We also re-flag
   the ring member who bid first and had screened clean.

Other things the UI must make visible: an officer can't decide until every HIGH finding has a
ruling; rulings teach the system which rules officers trust; the audit trail is hash-chained and
an Auditor role can verify it; unmeasured checks are never shown as passed; bidders never see
forensic or cartel findings.

## Repo layout

- `backend/`: FastAPI, SQLAlchemy, SQLite. `python -m app.seed` builds the demo dataset from real
  generated PDFs (with deliberately tampered ones). 107 pytest tests.
- `frontend/`: React 19 + TypeScript + Vite + Tailwind v4, recovered from an older version. It has
  many pages and a `mockFallback.ts` that fakes responses when the API fails. The old deployment
  ran entirely on that fallback; it was never connected to a backend.
- `docs/USPS.md`: what sets us apart (read first). `docs/WORKFLOW.md`: roles, case lifecycle, user
  flows. `docs/FRONTEND_CONTRACT.md`: every endpoint per screen, response shapes, how to draw
  evidence boxes. **Treat the contract as the source of truth.** `GET /docs` on the backend has the
  full OpenAPI schema.

## What to build

A **role-first** frontend that is very easy to use. After login, each role lands on its own home,
fed by one call, `GET /api/v1/home`, which already returns tasks first. Four roles:

- **Bidder**: home with tasks (upload missing documents, answer clarifications, renew expiring
  certificates), open tenders, my bids. Tender page, then upload documents, then submit bid.
  Clarification reply with a file. Outcome with the officer's reason. Never show risk or findings.
- **Procurement Officer**: home with lane counts and the queue (ESCALATED first). **The case view is
  the most important screen in the product**: findings on the left, grouped HIGH/MEDIUM/LOW with
  a source badge; clicking one opens the document page image on the right with the bbox drawn; for
  `OVERLAPPING_TEXT` show "covered: X / visible: Y". Each HIGH finding has Uphold / Dismiss (with a
  note). The decision panel stays disabled until `undisposed_high` is empty. There is also an "Ask
  bidder" action and a Copilot side panel whose cited finding ids are clickable. A tender view with
  the ring graph and price screens.
- **Admin**: home with tasks, tender create/edit with requirements, user management, bidder
  moderation, rule reliability table, audit chain status.
- **Auditor**: home with chain status (a big green "intact", or red with the broken entry), decisions
  made against the AI recommendation, dismissed HIGH findings, case timelines with hashes.

Keep the existing routes where they fit (`/bidder/*`, `/po/*`, `/admin/*`), plus `/auditor/*`.
Delete what the new flow replaces rather than keeping two versions.

## Rules

- **Remove `mockFallback.ts` and every silent fallback.** Show real errors. The demo runs on the real API.
- Send the telemetry headers on bidder login, upload and bid submit (spec in the contract).
- Page images need the auth header: fetch them as a blob, don't use a bare `<img src>`.
- Plain, confident UI copy. Label anything decision-support as such, once, without banners
  everywhere. Findings are "observations for review", never "fraud".
- No AI slop: no emoji in the UI, no em-dashes in copy, no comments like "// This function
  handles...", no generic gradient hero pages. It should look like a serious government
  procurement tool: dense, calm, fast.
- Commits are authored as me, with **no AI co-author trailers or "generated with" lines**, ever.
- Don't change backend behaviour without telling me. If the frontend needs a field the API doesn't
  return, say which endpoint and field, and propose the backend change separately.

## Demo accounts (after seeding)

admin@cpcl.gov.in / Admin@123 · officer@cpcl.gov.in / Officer@123 · auditor@cpcl.gov.in / Auditor@123 ·
alpha@alphaindia.in / Bidder@123 (clean) · bharat@bharatflowtech.in / Bidder@123 (flagged) ·
coastal@, deccan@, eastern@, eastline@, kaveri@ `bidder.example.in` / Bidder@123

## The 3-minute demo the UI has to support

1. Officer home: 3 escalated cases, 2 linked bidders.
2. Bharat Flowtech (the PS's "smallest thing that wins the room"): OEM authorization expired 5
   days before the bid date, and the Udyam certificate is issued to "Bharat Flowtek", a look-alike.
   Both pinned on the source page. Ask the bidder, who replies with a file, and the case re-screens.
3. Coastal Hydraulics: the retyped OEM date, with the original recovered from under the edit.
4. Eastline: a CA-signed turnover certificate edited after signing (4.10 crore to 6.10 crore), and
   linked to Eastern Fluid Systems through device, director, phone and PDF author, with a cover bid.
5. Try to decide without ruling on the findings (blocked), rule, decide. Switch to Auditor: the
   chain is intact and the decision carries its anchor hash.

## Deployment

Backend on Render (`render.yaml`, Docker; reseeds on boot). Frontend on Vercel under my account as
project `bidmark` (so `bidmark.vercel.app`), root `frontend/`, env `VITE_API_BASE_URL` = the Render
URL. Add the Vercel URL to the backend's `CORS_ORIGINS`.

Start by reading the three docs and `frontend/src/router/index.tsx`, then propose the screen list
and component plan before writing code.
