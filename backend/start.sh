#!/bin/sh
# Free hosting tiers wipe the disk on restart, so rebuild the demo data when it is missing.
set -e
if [ ! -f /app/data/bidmark.db ] || [ "${SEED_ON_BOOT:-false}" = "true" ]; then
  python -m app.seed
fi
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
