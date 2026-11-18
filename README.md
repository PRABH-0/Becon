# Becon

Becon is a career update companion that delivers a personalized daily briefing of source-grounded Action Cards in a calm, newspaper-style layout. It filters through industry noise and release feeds to keep professionals current in 3-5 focused minutes without algorithmic distractions. Designed to be profession-agnostic, with software developers as the launch vertical.

## Prerequisites
- **Python**: 3.12+
- **Node.js**: 24+ & npm
- **Docker**: (Optional, for containerized multi-service runtime)

## Quick Start (Local Development)

### 1. One-Command Setup
Run the development helper script to install dependencies for both backend and frontend:
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
```

## Testing & Code Quality

Run tests and linters with:
```powershell
# Run backend test suite (pytest)
.\scripts\dev.ps1 test

# Run linter and type checks (Ruff & TypeScript)
.\scripts\dev.ps1 lint
```

## Supabase Authentication Setup

Becon uses [Supabase Auth](docs/AUTH.md) as its single identity provider for email/password authentication, Google OAuth, and anonymous guest exploration.

### 1. Environment Variables
- **Frontend (`frontend/.env.local`):**
  - `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL (`https://<project-id>.supabase.co`).
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase `anon` public API key.
  - `NEXT_PUBLIC_API_URL`: Backend API base URL (`http://127.0.0.1:8000`).
- **Backend (`backend/.env`):**
  - `SUPABASE_URL`: Supabase project URL for JWKS token verification and Admin API.
  - `SUPABASE_JWT_AUDIENCE`: Expected token audience (default: `authenticated`).
  - `SUPABASE_SERVICE_ROLE_KEY`: Supabase `service_role` secret (required for `DELETE /api/account`).
  - `SUPABASE_JWT_SECRET`: Optional legacy secret if project uses HS256 symmetric signing.

### 2. Supabase Dashboard Settings
In your Supabase project dashboard:
- **Authentication $\rightarrow$ Providers $\rightarrow$ Email**: Turn **ON**; enable **Confirm email**.
- **Authentication $\rightarrow$ Providers $\rightarrow$ Anonymous Sign-Ins**: Turn **ON** (allows instant guest mode).
- **Authentication $\rightarrow$ URL Configuration**:
  - Set Site URL to `http://localhost:3000` (or your production domain).
  - Add Redirect URLs: `http://localhost:3000/auth/callback` and `http://localhost:3000/auth/reset-password`.
- **Authentication $\rightarrow$ Providers $\rightarrow$ Google** (Optional): Add Google Client ID and Secret if enabling OAuth.

For full architectural details, sequence diagrams, and RLS policies, see [docs/AUTH.md](docs/AUTH.md).

## Running with Docker Compose

To run the entire stack (FastAPI backend, Next.js frontend, and PostgreSQL):
```bash
docker compose up -d
```
- Frontend: `http://localhost:3000`
- Backend API & Docs: `http://localhost:8000/docs`
- Health probe: `http://localhost:8000/health`

## Vercel Deployment Notes (Frontend)

When deploying the Next.js frontend to Vercel (Preview and Production):
- **Root Directory:** Set to `frontend` in Vercel Project Settings.
- **Node.js Version:** `24.x` (matches `frontend/Dockerfile` and local verification; Next.js `16.3.0` with Turbopack).
- **Standalone Output Handling:** [`frontend/next.config.ts`](frontend/next.config.ts) sets `output: process.env.VERCEL ? undefined : "standalone"`. Vercel sets `VERCEL=1` automatically, disabling `output: "standalone"` so Vercel's Next.js 16 build adapter (`onBuildComplete`) bundles routes cleanly without hitting `ENOENT` on `.next/next-server.js.nft.json`, while Docker (`frontend/Dockerfile` / `docker-compose.yml`) and local builds retain `output: "standalone"`.
- **Self-Hosted Fonts (Zero External Fetch at Build Time):** `Space Grotesk`, `Plus Jakarta Sans`, and `Source Serif 4` (Latin `.woff2` + SIL OFL 1.1 licenses) are committed under `frontend/src/app/fonts/` and loaded via `next/font/local` in [`frontend/src/app/layout.tsx`](frontend/src/app/layout.tsx), so Vercel builds do not fetch fonts from `fonts.googleapis.com`.
- **Required Environment Variables (Preview & Production):**
  - `NEXT_PUBLIC_SUPABASE_URL` — Bare Supabase project root URL (e.g. `https://<project-ref>.supabase.co`, **no trailing path** such as `/rest/v1` or `/auth/v1`).
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase project `anon` public key.
  - `NEXT_PUBLIC_API_URL` — Public base URL of the deployed Becon FastAPI backend (e.g. `https://api.example.com`).
- **Supabase Redirect URLs:** Add your Vercel Preview (`https://*.vercel.app/auth/callback`) and Production (`https://<your-domain>/auth/callback`, `/auth/reset-password`) URLs in Supabase Dashboard $\rightarrow$ Authentication $\rightarrow$ URL Configuration.

## Project Architecture & Tracking
- **Project Tracking & Phases**: See [ROADMAP.md](ROADMAP.md) for current phase status, tasks, and change log.
- **Agent Context & Guardrails**: See [CLAUDE.md](CLAUDE.md) for engineering guidelines, verified commands, and rules.
- **UI Design System**: See [UI_DESIGN.md](UI_DESIGN.md) for the bento grid design tokens and component specs.
- **System Audit**: See [AUDIT_REPORT.md](AUDIT_REPORT.md) for architectural audit notes and baseline metrics.
