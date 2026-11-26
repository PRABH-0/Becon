#!/bin/sh
set -e

# 1. Run database migrations before booting the web process.
# When deployed against Supabase with PgBouncer connection pooling (port 6543),
# provide DIRECT_URL (port 5432) so Alembic runs directly, avoiding transaction-mode pooling issues.
echo "==> [BECON] Running database migrations (alembic upgrade head)..."
alembic upgrade head

# 2. Start Uvicorn web server.
# Enforce a single worker process because in-process rate limits and Gemini daily counters are memory-backed.
echo "==> [BECON] Starting Uvicorn (single worker, in-process rate limiting)..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers 1
