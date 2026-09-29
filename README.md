# Bidmark

Bid compliance verification for GeM procurement. Smart India Hackathon 2026, PS 26100
(Ministry of Petroleum & Natural Gas / CPCL).

Bidmark reads every certificate a bidder uploads, checks it against the tender's eligibility
rules and against the bidder's other documents, points at the exact spot on the page where
something is wrong, and hands the officer a ranked queue. The officer decides; every step lands
in a hash-chained audit trail.

What makes it different is in [docs/USPS.md](docs/USPS.md). In short:

- **Document forensics with evidence pins.** Values typed over the original (with the original
  recovered), edits after digital signing, one-off fonts on key fields, editor re-saves, reused files.
- **Verification without portal access.** GSTIN check digit, PAN/CIN decoding and cross-checks,
  signature validation; registries behind an adapter with a sandbox dataset.
- **Proxy-bidder and cartel detection.** Shared device, network, author, director or file, plus
  bid-rigging price screens.
- **No silent overrides.** Every high finding needs an officer's ruling before a decision, and
  those rulings measure how reliable each rule is.

## Run it

```bash
cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m app.seed
uvicorn app.main:app --reload --port 8000
```

API docs at http://localhost:8000/docs. Scanned documents need Tesseract (`brew install tesseract`
or `apt install tesseract-ocr`); text PDFs don't.

```bash
cd frontend
npm install
VITE_API_BASE_URL=http://localhost:8000 npm run dev
```

Tests: `cd backend && pytest` (107 tests).

## Demo accounts

| Role | Email | Password |
|---|---|---|
| Admin | admin@cpcl.gov.in | Admin@123 |
| Procurement Officer | officer@cpcl.gov.in | Officer@123 |
| Auditor | auditor@cpcl.gov.in | Auditor@123 |
| Bidder (clean) | alpha@alphaindia.in | Bidder@123 |
| Bidder (flagged) | bharat@bharatflowtech.in | Bidder@123 |

The seed builds every document as a real PDF, including tampered ones. It never marks a
bidder good or bad at random. See the top of `backend/app/seed.py` for what each bidder
demonstrates.

## Layout

```
backend/app/
  forensics/     text and position extraction, PDF and image forensics, identifier checks, name matching
  engines/       cross-checks, compliance scoring, cartel detection, fusion, fingerprints, behaviour
  services/      case workflow, screening, audit chain, telemetry, copilot
  api/v1/        REST routes (home, cases, evidence, tenders, documents, ...)
  providers/     government registry adapter (sandbox + mock), document readers, copilot models
  demo/          synthetic certificate generator and tamper helpers used by the seed and tests
docs/
  USPS.md              what sets Bidmark apart, with honest limits
  WORKFLOW.md          roles, case lifecycle, user flows
  FRONTEND_CONTRACT.md endpoints per screen
  DEPLOYMENT.md        Render + Vercel
```

## Scope

Registry lookups answer from a sandbox dataset, with a seeded mock behind it; every result is
tagged `is_mock`. Real GSTN, MCA21 or EPFO access plugs into `providers/government/` without
changing callers. Recommendations are decision support; the officer's decision is recorded
separately, with its reason.
