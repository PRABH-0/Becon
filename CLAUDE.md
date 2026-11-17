# CLAUDE.md — Agent & Project Instructions for Becon

> **Project Tracking:** Project phases, tasks and status are tracked in [ROADMAP.md](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/ROADMAP.md). Read it before starting any task, and update it when a task is approved by the project lead.

## 1. What Becon Is
Becon is a career update companion, NOT a news app. It keeps professionals up to date with critical changes in their own field in a focused 3–5 minute daily briefing, eliminating the need to browse distraction apps (Instagram, YouTube, X) just to "stay current." The user selects a profession and focus (tools, topics, technologies), and Becon delivers high-signal **Action Cards** synthesized from official sources. Each Action Card has 4 parts: *What happened, Why it matters, How it affects you, What to do next (Learn / Apply / Avoid / Prepare)*, with a direct link to the original source. While software engineering is the initial beachhead, the architecture is strictly profession-agnostic (professions, focus topics, and sources are data, never hardcoded enums).

## 2. Principles & Non-Goals
- **Action Over Information:** Every update ends with a concrete, classified next step (*Learn, Apply, Avoid, Prepare*).
- **Signal Over Volume:** High editorial density; fewer items, higher relevance; deduplicated events.
- **Trusted Sources Only:** Official release notes, changelogs, advisories, and curated creator channels.
- **Time-Boxed Briefing:** 3–5 minutes daily; **NON-GOAL: No infinite scroll, no engagement loops, no meme feeds**.
- **Source-Grounded AI:** Summaries must be strictly grounded in fetched source text (zero hallucination).
- **No Social Noise in Feeds:** No vanity metrics, comments, like counters, or unvetted community opinions.
- **V1 Scope Boundary:** **NON-GOAL: No payments or paywalls in V1**. Quality > low cost > speed.

## 3. Architecture Overview
- **Backend ([backend/app](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/backend/app)):** FastAPI service exposing REST endpoints for briefings, user profiles, authentication, onboarding chat, and ingestion triggers.
  - `main.py`: App routing, OAuth2 dependencies, CORS middleware, API documentation.
  - `feed_service.py`: RSS/Atom feed fetching (`feedparser`), image resolution, multi-tenant in-memory cache.
  - `ai_service.py`: Google Gemini integration (`google-genai`), Pydantic schema-constrained JSON extraction.
  - `database.py`: SQLAlchemy session and engine management for SQLite and PostgreSQL.
  - `models.py`: ORM schemas (`UserProfile`, `SavedBriefing`).
  - `schemas.py`: Pydantic v2 validation DTOs (`BriefingCard`, `ActionGuidance`, `UserProfileBase`, `ChatResponse`).
  - `auth.py`: Password hashing (`passlib`/`bcrypt`) and HS256 JWT encoding.
- **Frontend ([frontend/src](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src)):** Next.js 16 App Router broadsheet web app using Tailwind CSS v4 and Lucide icons.
  - `app/page.tsx`: Broadsheet layout containing Top Showcase (Lead + Quick Wire) and Bento Grid deck.
  - `app/profile/page.tsx`: Form to configure profession, experience, focus topics, custom prompts, and AI tone.
  - `app/onboarding/page.tsx`: Interactive chat wizard extracting profile attributes via Becon AI.
  - `app/about/page.tsx`: Manifesto and interactive 4-part Action Card role demonstration.
  - `app/login/page.tsx` & `app/register/page.tsx`: Google OAuth (via Supabase) and Guest exploration mode.
  - `context/`: `ThemeContext` (dark/light mode) and `LoadingContext` (top progress bar).
- **Data Flow:**
  `Official Sources / Feeds` -> `feed_service.py (HTTP fetch)` -> `ai_service.py (Gemini 4-part synthesis)` -> `_USER_CACHES (memory)` -> `FastAPI /api/briefings` -> `Next.js Broadsheet UI (Bento Grid)`.

## 4. Verified Commands

| Action | Frontend (Node 24 / npm 11) | Backend (Python 3.12 / venv) | Unified Helper (scripts/dev.ps1) | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Install** | `cd frontend && npm install` | `cd backend && .\.venv\Scripts\pip install -r requirements.lock -r requirements-dev.txt` | `.\scripts\dev.ps1 install` | Verified |
| **Run** | `cd frontend && npm run dev` | `cd backend && .\.venv\Scripts\uvicorn app.main:app --port 8000 --reload` | `.\scripts\dev.ps1 dev-backend` / `dev-frontend` | Verified |
| **Typecheck**| `cd frontend && npx tsc --noEmit` | `cd backend && .\.venv\Scripts\python -c "import app.main; print('OK')"` | N/A | Verified |
| **Lint** | `cd frontend && npm run lint` | `cd backend && .\.venv\Scripts\ruff check app/ tests/` | `.\scripts\dev.ps1 lint` | Verified |
| **Build** | `cd frontend && npm run build` | N/A | N/A | Verified |
| **Test** | `cd frontend && npm test` *(no unit tests yet)* | `backend\.venv\Scripts\pytest backend\tests -v` | `.\scripts\dev.ps1 test` | Verified |
| **Docker** | `docker compose build && docker compose up -d` | `docker compose build && docker compose up -d` | N/A | Config Verified |

## 5. Environment Variables
*Never print or commit secret values. List variable names and purpose only.*
- **Backend (`backend/.env`):**
  - `ENVIRONMENT`: Runtime environment mode (`development`, `production`, `test`).
  - `LOG_LEVEL`: Logging verbosity level (`DEBUG`, `INFO`, `WARNING`, `ERROR`).
  - `GEMINI_API_KEY`: Google Gemini API key used for structured 4-part Action Card synthesis.
  - `DATABASE_URL`: SQLAlchemy connection string (`sqlite:///./becon.db` or PostgreSQL URL).
  - `SECRET_KEY`: Secret HMAC key for signing JWT access tokens (16+ chars in production).
  - `INGEST_API_TOKEN`: Secret authorization token for `POST /api/ingest`.
  - `ALLOWED_ORIGINS`: Comma-separated CORS allowed domains (e.g. `http://localhost:3000`).
  - `ENABLE_DOCS`: Toggle for `/docs` and `/redoc` Swagger documentation endpoints (`"true"`/`"false"`).
- **Frontend (`frontend/.env.local`):**
  - `NEXT_PUBLIC_API_URL`: Base URL of the backend FastAPI service (e.g. `http://127.0.0.1:8000`).
  - `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL for Google OAuth handling.
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase client anon public key.

## 6. Code Conventions
- **Backend:** Python 3.11+ type hints; Pydantic v2 schemas for all inputs/outputs with field descriptions and examples; async route handlers where feasible; snake_case variables and functions; PascalCase schemas/models.
- **Frontend:** Next.js App Router; React 19 Client Components (`"use client"`) for stateful views; TypeScript interfaces matching backend schemas; Tailwind CSS v4 styling with semantic state transitions.
- **Design Tokens:** Editorial serif for headlines (`font-serif`), monospace for metadata pills (`font-mono`), sans-serif for body; status accents (emerald = Apply, amber = Prepare/Learn, rose = Avoid).

## 7. Data Model Summary & Database Selection
- **`user_profiles` table:** `id` (PK), `name`, `role`, `email`, `experience`, `interests` (comma-separated), `customPrompt`, `aiTone`, `password_hash`, `picture_url`, `auth_provider`, `lastUpdated`.
- **`saved_briefings` table:** `id` (PK), `title`, `source_url`, `target_role`, `target_stack`, `priority`, `card_content_json`, `created_at`.
- **Database Selection Mechanism:** Evaluated in [`backend/app/database.py:11-21`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/backend/app/database.py#L11-L21). If `DATABASE_URL` is unset or empty, it defaults to local SQLite (`sqlite:///./becon.db`). If `DATABASE_URL` contains `postgres://` or `postgresql://`, it normalizes the protocol to `postgresql+psycopg2://` for Supabase/PostgreSQL.

## 8. Rules for Any AI Agent Working in this Repo
1. **Read Before Writing:** Inspect existing code and schemas before modifying. Never guess implementation details.
2. **Small, Scoped Changes:** Work on one task at a time. Do not refactor unrelated files.
3. **Never Commit Secrets:** Check `.env` files and code. Never hardcode API keys, passwords, or tokens.
4. **Write or Update Tests:** Include automated verification for any newly introduced endpoints or utilities.
5. **Never Hardcode Professions or Topics:** Professions, focus areas, and feeds must remain dynamic data.
6. **Strict Source Grounding:** Ensure Gemini summarization prompts use only provided source text with zero hallucination.
7. **Adhere to Report Format:** Always complete turns with the exact progress report template shown in Section 10.

## 9. Known Gaps & Tech Debt (Factual)
- [`frontend/src/app/page.tsx:1638-2035`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/page.tsx#L1638-L2035): Main feed cards omit *How It Affects You* and *What To Do Next* (tactical guidance).
- [`frontend/src/app/page.tsx:1723`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/page.tsx#L1723): No modal or drawer component exists for card deep-dives (code snippets/diagrams).
- [`backend/app/feed_service.py:150`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/backend/app/feed_service.py#L150): Cards are cached only in memory (`_USER_CACHES`); zero card persistence in the database.
- [`backend/app/feed_service.py:18-138`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/backend/app/feed_service.py#L18-L138): Feeds rely on `dev.to` and Google News queries rather than official vendor release notes and advisories.
- [`backend/app/auth.py:23`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/backend/app/auth.py#L23): Hardcoded 15-minute fallback overrides the declared 7-day JWT expiration.
- [`backend/app/models.py:11`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/backend/app/models.py#L11): `UserProfile.email` lacks a unique constraint, causing duplicate user records in `becon.db`.
- [`backend/app/models.py:21`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/backend/app/models.py#L21): `SavedBriefing` has no relation or foreign key to `UserProfile`.
- [`backend/app/main.py:285,474`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/backend/app/main.py#L285): `POST /api/ingest` and `POST /api/auth/guest` are unauthenticated and lack rate limiting.
- Repo Root: Zero automated test files (`pytest`/`vitest`), no CI/CD pipelines, no Docker container configuration.

## 10. Required Progress Report Format
```
=== BECON PROGRESS REPORT ===
Phase / Task ID:
Status: DONE | PARTIAL | BLOCKED
Summary (max 8 lines):
Files created/changed (path + one-line purpose):
Commands run + key output (tests, lint, build, migrations):
Acceptance criteria: each number -> PASS/FAIL + evidence
Assumptions made:
Known issues / tech debt / risks:
Env vars or secrets needed (names only):
Open questions for the project lead:
Suggested next step:
=== END REPORT ===
```
