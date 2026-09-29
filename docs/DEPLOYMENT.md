# Deployment

## Backend: Render

1. On render.com: New, then Blueprint, then pick the `parvbansal11/bidmark` repo. Render reads `render.yaml`.
2. It builds `backend/Dockerfile` (Python 3.12 + Tesseract). `start.sh` seeds the demo data when
   the database is missing, which on the free plan is every boot.
3. When the Vercel URL is known, set `CORS_ORIGINS` to it (comma-separated, keep `http://localhost:5173`).
4. Check `https://<service>.onrender.com/health` and `/docs`.

The free plan sleeps after inactivity; open the health URL a minute before a demo.

Optional: `AI_PROVIDER=llm` plus `LLM_API_KEY` (an Anthropic API key) makes the Copilot write its
answers with Claude (`LLM_MODEL`, default `claude-opus-5`). Without them it answers from templates
over the same evidence.

## Frontend: Vercel

1. vercel.com, signed in as yourself: Add New, then Project, then import `parvbansal11/bidmark`.
2. Project name `bidmark` (gives `bidmark.vercel.app` if free). Root directory `frontend`. Framework Vite.
3. Environment variable `VITE_API_BASE_URL` = the Render URL, no trailing slash.
4. Deploy. `frontend/vercel.json` rewrites all paths to `index.html` for client-side routing.

## Local

See the README. For PostgreSQL set `DATABASE_URL=postgresql://...`; no code changes.
