> Superseded. This describes the earlier prototype (simulated forensic signals, 44 tests). The current technical approach is in ../USPS.md and ../WORKFLOW.md.

# TECHNICAL APPROACH — SIH Slide Prep (grounded in actual codebase)

Everything below was pulled from the actual repository (backend/app and frontend/src), not written from memory of a generic template. Where the prototype uses real code vs. simulated behavior is called out explicitly, because that distinction is what protects you in front of judges.

---

## PART 1 — TECHNOLOGY STACK

### Frontend (implemented)
| Technology | What it does here | Why |
|---|---|---|
| React 19 + TypeScript | Builds the entire single-page application UI | Type safety, component reuse across Bidder/Officer/Admin views |
| Vite | Dev server and production build tool | Fast local iteration, small production bundle |
| Tailwind CSS v4 | All styling | Consistent design system without hand-written CSS |
| React Router v7 | Client-side routing, role-aware navigation | Different screens for Bidder vs Officer vs Admin |
| Axios | All HTTP calls to the backend REST API | Centralized request/response handling, auth header injection |
| React Hook Form + Zod | Form state and schema validation (login, bidder profile, tender/requirement forms) | Client-side validation before hitting the API |
| Recharts | Dashboard charts (risk distribution, score breakdowns) | Data visualization |
| lucide-react | Icon set | UI consistency |

### Backend (implemented)
| Technology | What it does here | Why |
|---|---|---|
| Python 3 | Backend language | — |
| FastAPI | REST API framework, 17 versioned route groups under `/api/v1` | Async-capable, automatic OpenAPI docs at `/docs` |
| Uvicorn | ASGI server | Runs the FastAPI app |
| SQLAlchemy 2.0 (ORM) | All database models and queries | Written with no SQLite-specific features, so it is Postgres-compatible by design |
| Pydantic v2 + pydantic-settings | Request/response schemas, environment-based config | Validation + typed settings from `.env` |
| python-jose | JWT issuing and decoding | Session/auth tokens |
| passlib + bcrypt | Password hashing | Auth security |
| python-multipart | Parses multipart file uploads | Document upload endpoint |
| httpx | Used in the test suite as the API test client | Testing |
| email-validator | Validates email fields | Registration form validation |

### Database
- **Implemented:** SQLite (`gem_compliance.db`), accessed only through SQLAlchemy 2.0 ORM.
- **Planned:** PostgreSQL. The team deliberately avoided any SQLite-only feature, so this is a one-line `DATABASE_URL` change, not a rewrite. Say this as "designed for," not "already running on."

### AI / ML
| Component | Type | Status |
|---|---|---|
| TF-IDF vectorizer + cosine similarity (scikit-learn) | Real, classic NLP/IR technique — not a trained model | **Implemented** — used only inside the Document Fingerprinting engine to compare two documents' text content |
| MockAIProvider (compliance recommendation, anomaly explanations, copilot answers) | Deterministic, hand-written rule-based Python logic (if/else over already-computed evidence) | **Implemented**, but this is rule-based decision support, not machine learning |
| LLMProvider | Scaffolded Python class, selectable via `AI_PROVIDER=llm` | **Not implemented.** It currently just forwards every call back to MockAIProvider. No real LLM SDK is wired in. This is future scope only. |

There is no trained classifier, no model file, and no external AI/LLM API call anywhere in this codebase. Say that plainly if asked.

### NLP / OCR
| Component | What it does | Status |
|---|---|---|
| pypdf (`LocalOCRProvider`) | Extracts real text from PDFs/`.txt` files that already contain a text layer, then regex-matches PAN / GSTIN / CIN / dates out of that text | **Implemented, but limited** — works only on "digital" documents with extractable text, not scanned images |
| MockDocumentProvider | When no real text layer is found (true for most demo/placeholder uploads), deterministically generates plausible field values seeded from the document's ID | **Implemented as an explicit, labeled fallback** (`"simulated": true` in the stored record) — this is *not* reading the file, it's realistic synthetic data for the demo |
| Pillow | Installed dependency | Present in requirements but not used for OCR in the current code |

**Important honesty point for judges:** most demo documents will go through the mock fallback, because they don't carry a real text layer. Real OCR only kicks in for genuine text-based PDFs. Image/scanned-document OCR (e.g. Tesseract, a vision API) is **not** implemented — future scope.

### APIs / External Services
- **Zero live external API calls anywhere in the backend.** No network calls to any government system.
- 13 mock registries behind one `GovernmentVerificationProvider` facade: GST, PAN, Udyam, Income Tax, MCA, Startup India, NSIC, EPFO, ESIC, OEM Authorization, Local Content, Debarment/Blacklisting, DigiLocker.
- Every single mock response is wrapped in an envelope tagged `"source": "MOCK_GOVERNMENT_API", "is_mock": true"` — this is baked into the code itself, not just documentation.
- **Planned:** replacing each mock provider with a real, authorized integration (GSTN, NSDL, MCA21, EPFO, ESIC, DigiLocker, etc.). The one-provider-per-registry design exists specifically so this swap doesn't require touching any calling code — that architectural intent is real and worth stating, the integrations themselves are not.

### Authentication / Security (implemented)
- JWT (HS256) issued at login via `python-jose`, carrying user id and role.
- Passwords hashed with bcrypt via `passlib`.
- Role-based access control: three roles (`BIDDER`, `PROCUREMENT_OFFICER`, `ADMIN`) enforced server-side on every protected endpoint via FastAPI dependency guards, not just hidden in the UI.

### File / Document Processing (implemented)
- FastAPI `UploadFile` + `python-multipart` for handling uploads.
- SHA-256 hash computed on every uploaded file's raw bytes (used later by the forensics engine to detect identical files reused across bidders).
- Files stored on local disk under a per-bidder folder.
- **Planned:** cloud/object storage (e.g. S3) in place of local disk for a real deployment.

### Deployment / Hosting
- **Implemented:** Dockerfiles for both backend and frontend, orchestrated by `docker-compose.yml` — one command (`docker compose up --build`) runs the full stack locally.
- **Written but not yet actually deployed:** `render.yaml` (Render Blueprint config for the backend) and `netlify.toml` (Netlify build config for the frontend). These are deployment configurations sitting in the repo — going live still requires someone to actually connect the repo on Render/Netlify and click deploy. Don't claim "live in production" unless that step has actually been done and you can show a working URL.

### Development Tools
- pytest — 44 tests covering auth/RBAC, bidder/tender management, document upload, government verification, cross-document checks, compliance scoring, forensics, behavioral analysis, the simulator, decisions, and audit trail. All passing.
- oxlint — frontend linting.
- TypeScript compiler (strict build step before `vite build`).

---

## PART 2 — COMPLETE TECHNICAL WORKFLOW

This mirrors what `workflow_orchestrator.run_full_verification()` actually executes, plus the surrounding user journey.

1. **Registration / Login.** A user registers as Bidder, Procurement Officer, or Admin. Password is bcrypt-hashed and stored. Login returns a JWT carrying the user's id and role; every subsequent API call sends this token, and the backend checks role permissions on each endpoint (RBAC), not just in the UI.

2. **Bidder profile and tender setup.** A bidder fills in company details (legal name, PAN, GST, CIN, Udyam number, registered address, incorporation date). A Procurement Officer creates a tender and attaches weighted requirements (PAN, GST, Udyam, EPFO, ESIC, local content %, turnover minimum, debarment check, etc.), each marked mandatory or optional.

3. **Bid submission.** The bidder submits bid-level declared data for that tender: quoted price, declared turnover, declared local content percentage, submission timestamp.

4. **Document upload.** For each required category, the bidder uploads a file. The backend computes its SHA-256 hash, stores it on disk under a per-bidder folder, and creates a `Document` record.

5. **Document extraction (OCR / field extraction).** The system first tries `LocalOCRProvider`: if the file is a PDF or text file with a real text layer, `pypdf` extracts the text and regex pulls out PAN, GSTIN, CIN, and dates. If no usable text is found — the common case for placeholder demo uploads — it falls back to `MockDocumentProvider`, which deterministically generates realistic field values (occasionally injecting a minor name variation or an expired date, on purpose, so the downstream consistency and expiry checks have something to catch). Every mock-generated record is explicitly flagged `"simulated": true`.

6. **Mock government verification.** The extracted registration number is sent to `GovernmentVerificationProvider`, which routes to the matching one of 13 seeded simulators. Each is deterministic (the same identifier always produces the same result, which keeps demos reproducible) and returns one of: VERIFIED, RECORD_NOT_FOUND, EXPIRED, MISMATCH, INACTIVE, or PENDING_VERIFICATION — always tagged as coming from the Mock Government Verification API Gateway.

7. **Per-document verification status.** Combining required-field completeness, a validity-date check, the mock registry outcome, and a name-similarity check against the bidder's profile, each document gets a final status: VERIFIED, FAILED, EXPIRED, MISSING_INFORMATION, or REQUIRES_REVIEW.

8. **Cross-document consistency checking.** Independent of any single document, the Cross-Check Engine compares fields *across* a bidder's documents and declared profile: company name across every document, whether the PAN is correctly embedded inside the GSTIN, address consistency, declared turnover vs. financial/income-tax documents, MCA incorporation date vs. the bidder's declared date, and whether the OEM authorization letter names the right entity. Each comparison is classified MATCH, MINOR_VARIATION, or MAJOR_MISMATCH (using exact matching plus a Levenshtein-ratio fuzzy match), and a MAJOR_MISMATCH creates a scored discrepancy.

9. **Digital forensics.** For every document, the Forensics Engine checks real, checkable signals (identical SHA-256 hash reused by a *different* bidder, unusually small file size, low extraction confidence) plus a small number of deterministic simulated structural signals (metadata timestamp anomaly, font inconsistency, and similar), each drawn with a fixed seeded probability so results are reproducible. It outputs a 0–100 forensic risk score and a LOW/MEDIUM/HIGH level. It never states a document is fake — only "potential anomaly, manual verification recommended."

10. **Document fingerprinting.** A "fingerprint" is built per document (file hash, normalized-text hash, structural features, a term-frequency map). For same-category documents from *different* bidders on the same tender, a similarity score is computed with scikit-learn's TF-IDF vectorizer and cosine similarity, blended 75/25 with a simple structural-feature match. Identical file bytes are always flagged HIGH regardless of the text score.

11. **Requirement evaluation and compliance scoring.** The Compliance Engine walks every tender requirement, resolves a status using the relevant check above (or a direct turnover/local-content/debarment check for those three special types), applies the requirement's configured weight, and computes a fully traceable weighted score from 0–100. Score bands: 90–100 = LOW risk, 70–89 = MEDIUM risk, 0–69 = HIGH risk. Cross-document discrepancy penalties are subtracted. Every point on the score is attributable to a specific requirement evaluation stored in the database — nothing is a black box.

12. **Behavioral risk intelligence.** Layers on submission-timing anomalies (unusually fast after tender publication, last-minute, synchronized with other bidders), document-behavior signals drawn from the forensics results, cross-bidder signals (shared registered address, overlapping MCA directors, near-identical pricing, high document similarity), company lifecycle (incorporated shortly before a large tender), and historical patterns (repeated high-severity discrepancies, frequent bid withdrawals). Each flag adds a fixed weight to a 0–100 behavioral risk score, and every flag is marked `requires_human_review = true` — never an accusation.

13. **Cross-bidder intelligence graph.** For the whole tender, a node/edge graph connects the tender to every participating bidder, and bidders to each other wherever a relationship signal exists (shared address, document similarity, shared director, similar pricing, synchronized submission time). Used for visualization and investigation only, and explicitly labeled "signals for further review... do not establish collusion, fraud or misconduct."

14. **Red flag cascade.** Every discrepancy is turned into an explainable chain: source evidence → anomaly → affected requirement → score impact → risk level → review recommendation → officer action (if one has already been recorded).

15. **AI recommendation.** `MockAIProvider` reads the compliance score, risk level, failed/pending/review-required requirements, discrepancies, forensic risk, and behavioral risk, and deterministically outputs exactly one of three labels — COMPLIANT, REQUIRES_REVIEW, or NON_COMPLIANT — with a confidence number, plain-language reasons, critical issues, and recommended actions. Every response carries the disclaimer: *"AI recommendation is decision-support only. Final decision rests with the Procurement Officer."*

16. **Officer decision (human in the loop).** The Procurement Officer reviews the full "Bidder 360" record — score, verification results, discrepancies, forensics, behavioral flags, red flag cascade, AI recommendation — and records a separate decision: QUALIFIED, DISQUALIFIED, or PENDING_REVIEW. This is stored independently of the AI recommendation, never merged into it.

17. **Audit trail.** Every step above is appended to an audit log tied to the bidder and tender (workflow start, extraction, cross-check, score change, AI analysis, workflow completion, decisions), viewable as a full timestamped history.

18. **Dashboards.** The Procurement Officer sees platform-wide risk distribution, an exception-only review queue (only bidders needing attention), the Bidder 360 view, the cross-bidder graph, the What-If simulator, and the audit trail. The Bidder sees only their own profile, documents, and compliance status — RBAC enforced server-side, not just hidden in the UI.

19. **What-if simulator.** An officer can hypothetically change a requirement's threshold, weight, or mandatory flag and see every bidder's score, risk band, and rank recompute in memory, with an explicit note that no real tender or requirement data is touched.

20. **Copilot.** An officer can ask questions in near-natural language. This is answered by a small templated intent matcher (checks for phrases like "why," "high risk," "which requirements failed") that returns an answer built strictly from evidence already computed and stored — it never invents anything not already on the record.

---

## PART 3 — AI/ML COMPONENT (exactly what is real vs. simulated)

| Question | Answer |
|---|---|
| Which AI/ML model or API is used? | scikit-learn's `TfidfVectorizer` + `cosine_similarity` — a real, classic NLP/information-retrieval technique. No trained model, no external AI API, no LLM. |
| Where exactly is it used? | Only inside the Document Fingerprinting engine, to compare the text content of two documents. |
| Input | Two pieces of document text (real OCR excerpt if available, otherwise a string built from extracted fields). |
| Processing | Vectorize both texts, compute cosine similarity, blend 75% text score with 25% structural-feature match ratio. |
| Output | A similarity score (0–1), a LOW/MEDIUM/HIGH level, shared terms, and a `requires_review` flag. |
| Contribution | Flags potentially templated, reused, or copied documents across different bidders, feeding the Behavioral and Cross-Bidder modules. |

**Is the compliance "AI recommendation" actual ML?** No. `MockAIProvider` is deterministic, hand-written, rule-based Python logic — conditional statements over already-computed evidence (score, risk level, failed requirements, discrepancies, forensic/behavioral risk). It has no model weights, no training data, no randomness, and makes no external calls. The same input always produces the same output. This should be presented honestly as **rule-based decision-support logic**, not a trained AI model.

**Is there an LLM anywhere?** No. `LLMProvider` exists as a Python class scaffold, selectable via an `AI_PROVIDER=llm` setting, but it is not implemented — the code's own comment says so, and calling it without configuration raises an error. Even if enabled, it currently just forwards every call back to the rule-based provider. There is no OpenAI/Claude/any external LLM call in this build. This is 100% future scope.

**Is the OCR real?** Partially. `pypdf`-based text extraction is real and does read genuine text-layer PDFs. But scanned/image-only documents are not read by any OCR at all — they fall through to the deterministic mock field generator. No image-based OCR (e.g. Tesseract, a vision API) exists in this build.

**Is the forensics engine real AI?** No — it's a hybrid of a few real, checkable computations (SHA-256 hash-reuse detection across bidders, file-size threshold, extraction-confidence threshold) plus a handful of deterministic, seeded pseudo-random "simulated" structural/metadata anomaly signals, which the code's own comments describe as "standing in for the deeper forensic libraries a production system would run." No real document-forensics library (ExifTool, PDF structure parsers, error-level image analysis) is used.

**One-line honest summary for the slide:** *"The current build combines one real ML technique (TF-IDF/cosine similarity for document comparison) with deterministic rule-based decision-support logic and real-but-limited PDF text extraction. No trained classifier and no LLM is deployed; both are architected as swappable future integrations behind the same interface."*

---

## PART 4 — COMPLIANCE VERIFICATION LOGIC, PER AREA

All 11 areas share one underlying mechanism unless noted: a document (or declared value) is checked against a **seeded, deterministic mock registry simulator**, always tagged `"source": "MOCK_GOVERNMENT_API", "is_mock": true"`, with zero live calls to any real government system. Real integration is future scope for all of them, by design — the code is one provider class per registry behind a single interface specifically so a real integration can be substituted later.

| Area | Required document/data | What we check | Verification method | Expected result | Status |
|---|---|---|---|---|---|
| **PAN** | PAN card/certificate upload | PAN format, active status, name match, and that it is correctly embedded inside the bidder's GSTIN | OCR/mock extraction → mock PAN registry lookup → PAN↔GST cross-document check | VERIFIED / FAILED / EXPIRED / REQUIRES_REVIEW / MISSING_INFORMATION + any PAN_GST_MISMATCH discrepancy | Implemented (mock) |
| **GST** | GST registration certificate | GSTIN presence, active/cancelled status, legal/trade name match | Mock GST registry lookup + PAN↔GST cross-check | Same status set as above | Implemented (mock) |
| **Udyam / MSME** | Udyam registration certificate | Udyam number presence/format, mock registry status (enterprise type, activity) | Mock Udyam registry lookup | Same status set | Implemented (mock) |
| **Income Tax** | Income tax return / certificate | PAN-linked IT record status via mock lookup, and declared turnover vs. financial/income-tax document turnover (flagged if variance exceeds 25%) | Mock Income Tax registry + numeric cross-document comparison | Same status set + possible TURNOVER_MISMATCH discrepancy | Implemented (mock) |
| **Make in India / Local Content** | Bidder-declared local content % on the bid submission form (not a document) | Declared % vs. the tender's required threshold | Direct numeric comparison, wrapped in the same registry-style interface for consistency | VERIFIED if declared ≥ threshold, else FAILED, with the exact percentages shown | Implemented — this comparison logic is genuinely real, only the "registry lookup" framing is simulated |
| **EPFO / ESIC** | EPFO and ESIC registration certificates (two separate uploads) | Registration number presence, mock status lookup for each | Mock EPFO/ESIC registry lookups | Same status set | Implemented (mock) |
| **Startup India** | Startup India (DPIIT) recognition certificate | Mock recognition-status lookup | Mock Startup India registry | Same status set | Implemented (mock) |
| **NSIC** | NSIC registration certificate | Mock registration-status lookup | Mock NSIC registry | Same status set | Implemented (mock) |
| **OEM Authorization** | OEM authorization letter | Mock authorization-status lookup, plus a cross-check that the authorized entity's name in the letter matches the bidder's legal name | Mock OEM registry + OEM↔bidder-profile cross-check (HIGH severity if mismatched) | Same status set + possible OEM_AUTHORIZATION_MISMATCH discrepancy | Implemented (mock) |
| **DigiLocker** | Any document routed through the DigiLocker requirement category | Simulated e-sign and document-integrity check (issued-by authority, e-signed flag, integrity check pass/fail) | Mock DigiLocker registry, wired through the same document-backed pipeline | Same status set | Implemented as one of the 13 mock registries. **Not** a real DigiLocker account-linking/OAuth integration — that would require a government API partnership and is genuine future scope |
| **Blacklisting / Debarment** | No document needed — checked directly on the bidder's CIN/PAN/ID | Whether an active debarment/blacklisting record exists | Dedicated mock Debarment registry (skewed so only ~6% of demo bidders are flagged) | VERIFIED (clear) or REQUIRES_REVIEW (flagged, with an explicit note that manual verification against the official list is required) | Implemented (mock) |

---

## PART 5 — ARCHITECTURE

```
USER
  Bidder / Procurement Officer / Admin (3 RBAC roles)
        │
        ▼
FRONTEND
  React 19 + TypeScript SPA (Vite, Tailwind, Axios, role-aware routing)
        │  REST calls over HTTPS, JWT in Authorization header
        ▼
BACKEND / API LAYER
  FastAPI — 17 versioned route groups, JWT auth + RBAC guards, CORS
        │
        ▼
DOCUMENT PROCESSING
  Document Service — multipart upload, SHA-256 hashing, local disk storage
        │
        ▼
OCR / EXTRACTION
  LocalOCRProvider (pypdf + regex, real PDFs)  →  falls back to  →  MockDocumentProvider (deterministic synthetic fields)
        │
        ▼
MOCK GOVERNMENT VERIFICATION GATEWAY
  13 seeded simulators behind one facade: PAN · GST · Udyam · Income Tax · MCA ·
  Startup India · NSIC · EPFO · ESIC · OEM Authorization · Local Content · Debarment · DigiLocker
        │
        ▼
INTELLIGENCE ENGINES
  Cross-Check Engine · Compliance Engine · Forensics Engine ·
  Fingerprint/Similarity Engine (scikit-learn TF-IDF) · Behavioral Engine ·
  Cross-Bidder Graph Engine · Red Flag Cascade · Simulator Engine · MockAIProvider
        │
        ▼
DATABASE
  SQLAlchemy 2.0 ORM over SQLite (Postgres-compatible schema)
        │
        ▼
RISK & COMPLIANCE RESULT
  Explainable compliance score, AI recommendation (decision-support only), officer decision (human-authored, stored separately)
        │
        ▼
BIDDER / OFFICER / ADMIN DASHBOARD
  Bidder: own profile & status   |   Officer/Admin: review queue, Bidder 360, cross-bidder graph, simulator, audit trail
```

**Exact boxes to draw on the architecture slide:**
1. Bidder / Procurement Officer / Admin (User layer, RBAC)
2. React + TypeScript Frontend (Vite, Tailwind, Axios)
3. FastAPI REST API + JWT/RBAC
4. Document Service (upload, SHA-256 hashing, storage)
5. OCR/Extraction (real pypdf text extraction + deterministic mock fallback)
6. Mock Government Verification API Gateway (13 registries)
7. Compliance & Cross-Check Engine (explainable scoring)
8. Forensics + Fingerprinting Engine (scikit-learn TF-IDF)
9. Behavioral Risk + Cross-Bidder Graph Engine
10. MockAIProvider (rule-based recommendation — decision-support only)
11. SQLite / SQLAlchemy Database
12. Officer Decision + Audit Trail
13. Dashboards (Bidder / Officer / Admin)

---

## PART 6 — FLOWCHART FOR THE SIH SLIDE (one slide, 8 steps)

```
[Login — Bidder / Officer (JWT + RBAC)]
        ↓
[Document Upload]
        ↓
[OCR / Field Extraction]
        ↓
[Mock Govt. Verification — 13 registries]
        ↓
[Cross-Document + Forensic Checks]
        ↓
[Explainable Compliance Score]
        ↓
[AI Recommendation — rule-based, decision-support only]
        ↓
[Officer Decision + Dashboard / Audit Trail]
```

If you have room for a slightly longer version (e.g. for a backup/appendix slide), this is the full pipeline:

```
[Bidder/Officer Login] → [Tender & Requirement Setup] → [Bid Submission + Document Upload]
→ [OCR/Field Extraction] → [Mock Govt. Verification] → [Cross-Document Consistency Check]
→ [Forensics + Fingerprinting] → [Behavioral + Cross-Bidder Analysis]
→ [Explainable Compliance Score + AI Recommendation] → [Officer Decision] → [Audit Trail & Dashboards]
```

---

## PART 7 — FINAL SLIDE CONTENT

### 1. Exact slide text

**Slide title:** TECHNICAL APPROACH

**Left column — Technology Stack**
- Frontend: React 19 + TypeScript, Vite, Tailwind CSS
- Backend: FastAPI (Python), SQLAlchemy ORM
- Database: SQLite (Postgres-ready schema)
- AI/ML: TF-IDF + cosine similarity (scikit-learn) for document comparison; rule-based decision-support engine for recommendations
- Document processing: pypdf text extraction, SHA-256 hashing
- Security: JWT auth + bcrypt + role-based access control
- Deployment: Docker / docker-compose

**Right column — Methodology / Workflow**
- Login (role-based access: Bidder / Officer / Admin)
- Document upload & OCR extraction
- Mock Government Verification Gateway (13 simulated registries: PAN, GST, Udyam, Income Tax, MCA, EPFO, ESIC, Startup India, NSIC, OEM Authorization, Local Content, Debarment, DigiLocker)
- Cross-document consistency & digital forensics checks
- Explainable compliance scoring (0–100, fully traceable)
- AI recommendation (decision-support only, never a final verdict)
- Human officer makes the final qualification decision

**Small highlight box**
- "AI = rule-based decision-support + real TF-IDF document similarity. Government checks run on a clearly-labeled Mock Verification Gateway, architected so real APIs can be plugged in later without code changes."

### 2. Flowchart text (paste into PowerPoint SmartArt / boxes)
```
Login → Document Upload → OCR/Extraction → Mock Govt. Verification
→ Cross-Document + Forensic Checks → Explainable Compliance Score
→ AI Recommendation → Officer Decision + Dashboard
```

### 3. Architecture diagram labels
```
User (Bidder/Officer/Admin)
→ React + TypeScript Frontend
→ FastAPI Backend (JWT + RBAC)
→ Document Service (Upload + Hashing)
→ OCR/Extraction Layer
→ Mock Government Verification Gateway (13 registries)
→ Compliance + Forensics + Behavioral Engines
→ SQLite/SQLAlchemy Database
→ AI Recommendation (rule-based, decision-support)
→ Officer Decision + Dashboards
```

### 4. Speaker notes
"Our platform is built on a FastAPI backend and a React/TypeScript frontend. When a bidder uploads a document, we extract its fields — using real PDF text extraction where the file supports it — and run it through a Mock Government Verification Gateway that simulates 13 registries: PAN, GST, Udyam, Income Tax, MCA, EPFO, ESIC, Startup India, NSIC, OEM Authorization, Local Content, Debarment, and DigiLocker. We chose to build this as a mock gateway because we don't have production access to these government APIs, but every provider is written behind one common interface specifically so a real integration can be dropped in later without touching the rest of the system.

On top of that, we run cross-document consistency checks, digital forensics signals, and behavioral risk analysis to build a fully explainable compliance score, never a black-box number. Our AI layer today is a deterministic, rule-based recommendation engine, plus one real machine-learning technique — TF-IDF and cosine similarity — that we use to detect duplicated or highly similar documents across different bidders. The AI never issues a final decision; it always hands off to a human Procurement Officer, and every recommendation carries that disclaimer. We see richer AI, real government API integration, and PostgreSQL as the next steps beyond this hackathon prototype."

---

## PART 8 — LIKELY JUDGE QUESTIONS AND ANSWERS

**1. Why did you choose this tech stack?**
FastAPI gives us fast development with automatic API documentation and strong typing via Pydantic, which matters for a compliance system where data correctness is important. React + TypeScript gives us a maintainable, type-safe frontend. SQLAlchemy was written against Postgres-compatible patterns from day one, so moving off SQLite for production is a configuration change, not a rewrite.

**2. Where exactly is AI used?**
In two places: a real machine-learning technique (TF-IDF plus cosine similarity) that compares document text to flag duplicated or copied submissions across bidders, and a deterministic rule-based engine that turns the compliance score, discrepancies, and risk signals into a plain-language recommendation. We're upfront that the recommendation engine is rule-based logic today, not a trained model, and that a real LLM integration is scaffolded for the future but not wired in yet.

**3. How is document authenticity checked?**
Through a combination of real, checkable signals, an identical file hash reused by a different bidder, unusually small file sizes, and low extraction confidence, plus deterministic structural checks. We deliberately never claim to prove a document is forged; every finding is framed as "potential anomaly, needs manual review," because real forensic verification requires tools and legal authority beyond a hackathon prototype.

**4. How do you prevent false positives?**
Every automated flag, whether it's a discrepancy, a forensic signal, or a behavioral flag, is explicitly marked as requiring human review rather than being treated as a conclusion. Nothing in the system disqualifies a bidder automatically; the officer always makes the final call, and can see the exact evidence behind every flag through the red flag cascade.

**5. How do you handle missing documents?**
A mandatory requirement with no matching document is marked PENDING and contributes zero to the score until it's resolved, it's never silently ignored or passed. The compliance report explicitly lists pending, failed, and review-required requirements so the officer knows exactly what's missing.

**6. How does the system scale?**
The backend is stateless behind JWT authentication, so it can run multiple instances behind a load balancer. The ORM layer has no SQLite-specific code, so moving to PostgreSQL for concurrent write-heavy production use is a configuration change. Document storage would move to object storage (like S3) for horizontal scaling, that's on our roadmap, not yet built.

**7. How will real government APIs be integrated?**
Each government check already sits behind its own provider class implementing one common `verify()` interface. To go live, we'd replace the internals of each provider, for example, swap the mock PAN lookup for an authorized NSDL/Income Tax API call, without changing any of the code that calls it. That's why we built it this way instead of hardcoding mock logic everywhere.

**8. How is sensitive bidder data protected?**
Passwords are bcrypt-hashed, never stored in plain text. Access to bidder data is protected by JWT authentication and role-based access control enforced on the server for every endpoint, not just hidden in the UI, so a bidder can only ever see their own data.

**9. What happens if an external verification API is unavailable?**
Today, since verification is a local, deterministic mock, there's no live-dependency failure mode to demo. In a production version with real APIs, the provider-per-registry design means we could add a retry/timeout and a "PENDING_VERIFICATION" fallback state per registry without touching the rest of the pipeline, since that failure handling already exists as one of our defined verification outcomes.

**10. What makes this better than manual verification?**
It standardizes the checks every officer runs today so verification quality doesn't depend on who happens to review a bid. It automatically cross-references data across a dozen documents that would otherwise be checked by hand, surfaces anomalies an officer might miss, and gives a fully explainable, auditable trail for every score, while keeping the final decision with a human at every step.

---

## ⚠️ THINGS I MUST NOT CLAIM IN FRONT OF JUDGES

- Do **not** say the platform is "integrated with real GST/PAN/Udyam/EPFO/ESIC/MCA/DigiLocker APIs." It is a Mock Government Verification Gateway, deterministic and offline, with zero live government calls.
- Do **not** say "we use a trained machine learning model to predict compliance." The recommendation logic is deterministic rule-based Python code, not a trained/learned model.
- Do **not** say "we use GPT / an LLM / Claude / OpenAI for verification or recommendations." No LLM is wired into this build. `LLMProvider` is an unimplemented placeholder that currently just calls the mock logic.
- Do **not** say "our OCR reads scanned or handwritten documents." Only digital PDFs/text files with a real text layer are actually read; everything else uses simulated field generation, which is clearly labeled in the data itself.
- Do **not** say "the platform is deployed live and running in production" unless you have actually deployed it (Render + Netlify configs exist in the repo but going live is a manual step someone still needs to complete and verify).
- Do **not** say "the system detects fraud" or "confirms forged documents." The forensics and behavioral engines only ever flag signals for human review; they are explicitly coded to never make an accusation.
- Do **not** say "we run on a production PostgreSQL database." The current prototype runs on SQLite. Postgres is a planned, low-effort migration, not something already running.
- Do **not** say "we're connected to DigiLocker" as if it's a real account-linking/OAuth integration. It's one of the 13 simulated mock registries.
- Do **not** oversell the 44 passing tests as "enterprise-grade test coverage." It's solid coverage for a hackathon prototype; frame it that way.
- Do **not** claim "real-time collusion or fraud detection." The cross-bidder relationship graph and behavioral flags are pattern signals for manual review, and the code itself explicitly disclaims that they don't establish collusion, fraud, or misconduct.
