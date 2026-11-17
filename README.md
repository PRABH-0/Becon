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

## Running with Docker Compose

To run the entire stack (FastAPI backend, Next.js frontend, and PostgreSQL):
```bash
docker compose up -d
```
- Frontend: `http://localhost:3000`
- Backend API & Docs: `http://localhost:8000/docs`
- Health probe: `http://localhost:8000/health`

## Project Architecture & Tracking
- **Project Tracking & Phases**: See [ROADMAP.md](ROADMAP.md) for current phase status, tasks, and change log.
- **Agent Context & Guardrails**: See [CLAUDE.md](CLAUDE.md) for engineering guidelines, verified commands, and rules.
- **UI Design System**: See [UI_DESIGN.md](UI_DESIGN.md) for the bento grid design tokens and component specs.
- **System Audit**: See [AUDIT_REPORT.md](AUDIT_REPORT.md) for architectural audit notes and baseline metrics.
