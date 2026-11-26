#!/bin/sh
set -e

echo "==> [BECON] Running database migrations (alembic upgrade head)..."
alembic upgrade head

echo "==> [BECON] Starting Uvicorn (single worker, in-process rate limiting)..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers 1
