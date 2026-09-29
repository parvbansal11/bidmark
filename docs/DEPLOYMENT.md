# Deploying to a public URL (e.g. for demo/judging)

This is a two-service app: a Python/FastAPI backend and a React frontend. **Netlify only hosts static files** — it can't run the FastAPI backend, and it can't serve the raw `frontend/` source either (that needs a build step first). That's why dropping the zip straight into Netlify didn't open anything.

The straightforward path: host the backend somewhere that runs a persistent process, then point a Netlify (or Vercel) static deploy at it.

## 1. Backend → Render (free tier works)

1. Push this repo to GitHub.
2. On [render.com](https://render.com), "New +" → "Blueprint", point it at the repo. It will pick up `render.yaml` at the repo root automatically and build `backend/Dockerfile`.
   - No `render.yaml`/Blueprint? Create a "Web Service" manually: root directory `backend`, runtime "Docker", and it'll use `backend/Dockerfile` as-is.
3. Once it's live, open a shell tab on the service (or use `render.yaml`'s free-tier note) and run the seed command once:
   ```
   python -m app.seed
   ```
   Free-tier services have no persistent disk, so the SQLite file resets on every restart/redeploy — re-run this after each one. (Upgrade to a paid plan and mount a disk at `/app/data` in `render.yaml` if you want the data to survive.)
4. Note the service's public URL, e.g. `https://gem-compliance-backend.onrender.com`.

Any host that runs a Dockerfile works the same way (Railway, Fly.io, a VM, etc.) — `backend/Dockerfile` is the only thing that matters.

## 2. Frontend → Netlify

1. On [netlify.com](https://netlify.com), "Add new site" → "Import an existing project", point it at the same repo. It reads `netlify.toml` at the repo root, which already sets the base directory to `frontend`, the build command to `npm run build`, and the publish directory to `dist`, plus an SPA redirect so client-side routes don't 404 on refresh.
2. In Site settings → Environment variables, add:
   ```
   VITE_API_BASE_URL=https://gem-compliance-backend.onrender.com
   ```
   (your actual Render URL from step 1 — this gets baked into the build, so redeploy after changing it)
3. Trigger a deploy.

## 3. Close the loop on CORS

Back in the Render service's environment variables, set `CORS_ORIGINS` to your actual Netlify URL (comma-separated if you have more than one), e.g.:

```
CORS_ORIGINS=https://your-site-name.netlify.app
```

Redeploy the backend after changing this — it's read once at startup.

## Quicker alternative: skip deployment entirely

If this is just for a demo you're giving yourself (not something judges need to open independently), `docker compose up --build` (see the main README) gets both services running locally in one command, which is simpler than standing up two cloud services.
