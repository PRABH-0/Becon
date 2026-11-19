# Becon

Becon is a career update companion that delivers a personalized daily briefing of source-grounded Action Cards in a calm, newspaper-style layout. It filters through industry noise and release feeds to keep professionals current in 3–5 focused minutes without algorithmic distractions. Designed to be profession-agnostic, with software developers as the launch vertical.

## Prerequisites
- **Python**: 3.12+
- **Node.js**: 24+ & npm
- **Docker**: (Optional, for containerized multi-service runtime)

## Quick Start (Local Development)

### 1. One-Command Setup
Install dependencies for both backend and frontend:
```powershell
.\scripts\dev.ps1 install
```

### 2. Run Applications
In two separate terminal windows:
```powershell
# Terminal 1: Backend (FastAPI on http://localhost:8000, docs at /docs)
.\scripts\dev.ps1 dev-backend

# Terminal 2: Frontend (Next.js on http://localhost:3000)
.\scripts\dev.ps1 dev-frontend

# Optional Terminal 3: Source Scheduler Worker (runs due fetches in background)
.\scripts\dev.ps1 scheduler
```

## Testing & Code Quality

```powershell
# Run backend (pytest) and frontend (Vitest) test suites
.\scripts\dev.ps1 test

# Run linter and type checks (Ruff & TypeScript)
.\scripts\dev.ps1 lint
```
For the full command matrix (Alembic migrations, seeding, frontend builds), see [CLAUDE.md](CLAUDE.md#4-verified-commands).

## Authentication & Environment Setup

Becon uses Supabase Auth for email/password sign-in, Google OAuth, and anonymous guest exploration:
- **Canonical environment variables (`backend/.env` and `frontend/.env.local`):** See [CLAUDE.md — Section 5](CLAUDE.md#5-environment-variables) (templates in [`backend/.env.example`](backend/.env.example) and [`frontend/.env.example`](frontend/.env.example)).
- **Supabase Dashboard setup, redirect URLs, RLS, and manual QA checklist:** See [docs/AUTH.md](docs/AUTH.md).

## Running with Docker Compose

Run the full stack (FastAPI backend, Next.js frontend, and PostgreSQL):
```bash
docker compose up -d
```
- Frontend: `http://localhost:3000`
- Backend API & Docs: `http://localhost:8000/docs`
- Health probe: `http://localhost:8000/health`

## Vercel Deployment Notes (Frontend)

When deploying the Next.js frontend to Vercel (Preview and Production):
- **Root Directory:** Set to `frontend` in Vercel Project Settings.
- **Node.js Version:** `24.x` (matches [`frontend/Dockerfile`](frontend/Dockerfile) and local verification).
- **Standalone Output Handling:** [`frontend/next.config.ts`](frontend/next.config.ts) sets `output: process.env.VERCEL ? undefined : "standalone"`, so Vercel builds without `standalone` while Docker retains standalone output.
- **Self-Hosted Fonts:** `Space Grotesk`, `Plus Jakarta Sans`, and `Source Serif 4` (Latin `.woff2` + SIL OFL 1.1 licenses) are committed under [`frontend/src/app/fonts/`](frontend/src/app/fonts) and loaded via `next/font/local` in [`frontend/src/app/layout.tsx`](frontend/src/app/layout.tsx), so Vercel builds make zero external Google Fonts fetches.
- **Required Preview & Production Environment Variables** (details in [CLAUDE.md — Section 5](CLAUDE.md#5-environment-variables)): `NEXT_PUBLIC_SUPABASE_URL` (bare project root, no trailing path), `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_API_URL`.
- **Supabase Redirect URLs:** Add your Vercel Preview and Production `/auth/callback` and `/auth/reset-password` URLs per [docs/AUTH.md](docs/AUTH.md).

## Documentation Map
- **Product Vision:** [BECON.md](BECON.md)
- **Project Status, Decisions & Change Log:** [ROADMAP.md](ROADMAP.md)
- **Agent Rules, Architecture, Commands & Env Vars:** [CLAUDE.md](CLAUDE.md)
- **Authentication & Rate Limits:** [docs/AUTH.md](docs/AUTH.md)
- **Data Model & Migrations:** [docs/DATA_MODEL.md](docs/DATA_MODEL.md)
- **Frontend UI & Design System:** [docs/UI_DESIGN.md](docs/UI_DESIGN.md)
