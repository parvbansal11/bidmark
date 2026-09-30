# Bidmark

Bid compliance verification for public procurement: statutory checks, document evidence and linked-bidder analysis for every bid, with the qualification decision left to the procurement officer.

Bidmark reads every certificate a bidder uploads, checks it against the tender's eligibility rules and against the bidder's other documents, pins each finding to the place on the page where it was found, and gives the officer a prioritised queue. Every high finding needs an officer ruling before a decision can be recorded, and every action lands in a hash-chained audit trail.

## Architecture

```
GitHub (parvbansal11/bidmark)
        |
        +-------------------------+
        |                         |
     Vercel                    Render (Docker)
     frontend/                 backend/
     React + Vite SPA          FastAPI + SQLAlchemy
        |                         |  SQLite (seeded on boot)
        +------ HTTPS /api/v1 ----+  Tesseract, pdfplumber, pyHanko
                                  |  Anthropic API (optional, server side)
```

- **Frontend** (`frontend/`): React 19, TypeScript, Vite, Tailwind CSS. The mounted app lives in `frontend/src/app`. It talks to the API only through `VITE_API_BASE_URL`.
- **Backend** (`backend/`): FastAPI. JWT bearer authentication with four roles (Procurement Officer, Bidder, Auditor, Administrator). SQLite by default; any SQLAlchemy URL works.
- **Documents**: uploaded files live under `UPLOAD_DIRECTORY`. The seed generates real PDFs, including tampered ones, and a local signing CA for signature checks. Neither is committed.
- **Registries**: GST, MCA21, Udyam and other lookups answer from a sandbox dataset behind an adapter. Every result is tagged as sandbox; no live government API is called.
- **Ask Bidmark**: answers questions about one bid from the findings recorded on it. With `AI_PROVIDER=llm` the answers are written by Claude through the Anthropic API, server side only. Otherwise they are assembled from templates over the same findings.

More detail: [docs/WORKFLOW.md](docs/WORKFLOW.md) (roles and case lifecycle), [docs/API.md](docs/API.md), [docs/FRONTEND_CONTRACT.md](docs/FRONTEND_CONTRACT.md), [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Local development

### Backend

```bash
cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # edit as needed
python -m app.seed            # builds the sample tenders, bidders and documents
uvicorn app.main:app --reload --port 8001
```

API docs: http://localhost:8001/docs. Scanned documents need Tesseract (`brew install tesseract` or `apt install tesseract-ocr`); text PDFs do not.

### Frontend

```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

In development Vite proxies `/api` and `/health` to `http://127.0.0.1:8001` (see `vite.config.ts`), so `VITE_API_BASE_URL` can stay empty.

### Sample accounts (seeded)

| Role | Email | Password |
|---|---|---|
| Procurement Officer | officer@cpcl.gov.in | Officer@123 |
| Bidder | alpha@alphaindia.in | Bidder@123 |
| Auditor | auditor@cpcl.gov.in | Auditor@123 |
| Administrator | admin@cpcl.gov.in | Admin@123 |

The seeded data is synthetic. Signing in as several bidders from one machine records shared device and network signals, which the linked-bidder analysis will then report.

## Environment variables

Names only; see `backend/.env.example` and `frontend/.env.example`.

**Frontend** (public, baked into the build): `VITE_API_BASE_URL`.

**Backend**:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | SQLAlchemy URL |
| `JWT_SECRET`, `JWT_ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES` | Session tokens (secret required in production) |
| `CORS_ORIGINS` | Exact web origins allowed to call the API |
| `PRIVILEGED_ROLE_EMAIL_DOMAIN` | Domain for staff self-registration; empty in production |
| `UPLOAD_DIRECTORY`, `MAX_UPLOAD_SIZE_MB` | Document storage |
| `TRUST_ROOTS_DIR`, `DEMO_CA_DIR` | Trusted roots for PDF signature checks |
| `SANDBOX_REGISTRY_PATH`, `MOCK_GOVERNMENT_API` | Registry adapter |
| `SIMULATE_UNREADABLE_DOCUMENTS` | Fill unreadable files from the profile, marked simulated |
| `AI_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_TIMEOUT_SECONDS` | Ask Bidmark (key stays server side) |
| `SEED_ON_BOOT` | Rebuild the sample data on every container start |
| `ENVIRONMENT`, `APP_NAME` | Runtime labels |

Never put the LLM key or JWT secret in a `VITE_*` variable.

## Testing

```bash
cd backend && pytest                                   # API, engines, forensics, audit chain
cd frontend && npm test && npx tsc -p tsconfig.app.json --noEmit && npm run build
```

## Deployment

- **Backend** on Render from `render.yaml` (Docker, `backend/Dockerfile`). `start.sh` binds `0.0.0.0:$PORT` and seeds the database when it is missing. The free plan has no persistent disk, so data resets on restart. Set `CORS_ORIGINS` to the Vercel URL.
- **Frontend** on Vercel: root directory `frontend`, Vite preset, `npm run build`, output `dist`. Set `VITE_API_BASE_URL` to the Render URL. `frontend/vercel.json` rewrites every path to `index.html` for client-side routing.

Step by step: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Scope and limits

- Registry results come from a sandbox dataset and are labelled as such. Real GSTN, MCA21 or EPFO access plugs into `backend/app/providers/government/` without changing callers.
- Recommendations are decision support. The officer records the qualification decision and its reason, and both are kept with the system assessment in the audit trail.
- Bidmark is an independent verification layer. It is not the official GeM or CPCL portal.
