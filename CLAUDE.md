# CLAUDE.md — Agent & Project Instructions for Becon

> **Project Tracking:** Project phases, task statuses, decisions, and change history live **only** in [ROADMAP.md](ROADMAP.md). Read it before starting any task, and update it when a task is approved by the project lead.

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
- **Backend ([backend/app](backend/app)):** FastAPI service exposing REST endpoints for briefings, topic autocomplete, user profiles, authentication, onboarding chat, and ingestion triggers.
  - `main.py`: App routing, explicit CORS middleware, request ID tracking, `/health`, `/api/me`, `/api/account`, `/api/briefings`, `/api/topics/search`, `/api/ingest`.
  - `config.py`: Centralized Pydantic settings and Supabase URL root validation.
  - `rate_limit.py`: In-process sliding-window rate limiter, `TRUSTED_PROXIES` IP resolution, and UTC-day Gemini quotas.
  - `supabase_auth.py`: Token verification via PyJWT using Supabase JWKS (ES256/RS256) or legacy HS256 secret.
  - `deps.py`: User mapping (`get_current_user`, `get_optional_user`, `map_token_to_user`, `https://`-only avatar hygiene).
  - `ingestion.py`: Ingestion pipeline resolving feeds into `sources`, upserting `raw_items`, exact dedup into `events`, shared canonical `cards`, and lazy `card_variants` caching for existing active professions.
  - `feed_service.py`: Database-backed feed querying, stale-while-revalidate orchestration, and pagination slicing.
  - `ai_service.py`: Google Gemini integration (`google-genai`), Pydantic schema-constrained JSON extraction, prompt sanitization.
  - `database.py`: SQLAlchemy session and engine management for SQLite and PostgreSQL.
  - `models.py`: Declarative ORM models (full table catalog in [docs/DATA_MODEL.md](docs/DATA_MODEL.md)).
  - `seed/`: Idempotent data seeder loading professions and focus topics from JSON files in `seed/data/`.
  - `schemas.py`: Pydantic v2 validation DTOs (`BriefingCard`, `TopicSearchResponse`, `UserProfileBase`, `UserMeResponse`, `HealthResponse`).
- **Frontend ([frontend/src](frontend/src)):** Next.js App Router broadsheet web app using Tailwind CSS v4, Lucide icons, and self-hosted local fonts (full design spec in [docs/UI_DESIGN.md](docs/UI_DESIGN.md)).
  - `app/page.tsx`: Broadsheet layout containing Top Showcase (Lead + Quick Wire), Bento Grid deck, and finite briefing end state.
  - `app/profile/page.tsx`: Profile form (identity prefill, role, focus topics autocomplete, custom prompt, tone, Danger Zone deletion).
  - `app/onboarding/page.tsx`: Interactive chat wizard extracting profile attributes via Becon AI.
  - `app/about/page.tsx`: Manifesto and interactive 4-part Action Card role demonstration.
  - `app/login/page.tsx`, `app/register/page.tsx`, `app/forgot-password/page.tsx`, `app/auth/callback/page.tsx`, `app/auth/reset-password/page.tsx`: Auth flows inside `AuthShell` / `AuthForm`.
  - `app/fonts/`: Self-hosted Latin `.woff2` fonts + SIL OFL 1.1 licenses (`Space Grotesk`, `Plus Jakarta Sans`, `Source Serif 4`).
  - `components/`: `HeaderActions`, `UserMenu`, `UserAvatar`/`UserChip`, `ThemeToggle`, `AuthShell`, `AuthForm`, `RequireAuth`, `GuestBanner`, `CardDrawer`, and `cards/` (`LeadCard`, `RectangleCard`, `SquareCard`, `BriefCard`, `ActionBadge`, `ActionCardBody`).
  - `context/`: `ThemeContext`, `LoadingContext`, and `AuthContext`.
  - `lib/`: `api.ts` (`apiFetch` with Bearer injection & single 401 refresh retry), `supabaseClient.ts`, `identity.ts`, `cache.ts`, `redirect.ts`, `constants.ts`.
- **Data Pipeline:**
  `Sources` -> `raw_items` -> `events` (deduplicated) -> `cards` (1 per event) -> `card_variants` (personalized) -> `deliveries / user feed`.

## 4. Verified Commands
Run the test and migration commands below to check current test and table counts (do not hardcode counts in docs):

| Action | Frontend (Node 24 / npm 11) | Backend (Python 3.12 / venv) | Unified Helper (`scripts/dev.ps1`) |
| :--- | :--- | :--- | :--- |
| **Install** | `cd frontend && npm install` | `cd backend && .\.venv\Scripts\pip install -r requirements.lock -r requirements-dev.txt` | `.\scripts\dev.ps1 install` |
| **Run** | `cd frontend && npm run dev` | `cd backend && .\.venv\Scripts\uvicorn app.main:app --port 8000 --reload` | `.\scripts\dev.ps1 dev-backend` / `dev-frontend` |
| **Migrate** | N/A | `cd backend && .\.venv\Scripts\alembic upgrade head` | `.\scripts\dev.ps1 migrate` |
| **Make Migration** | N/A | `cd backend && .\.venv\Scripts\alembic revision --autogenerate -m "..."` | `.\scripts\dev.ps1 makemigration -Message "..."` |
| **Seed** | N/A | `cd backend && .\.venv\Scripts\python -m app.seed` | `.\scripts\dev.ps1 seed` |
| **Typecheck** | `cd frontend && npx tsc --noEmit` | `cd backend && .\.venv\Scripts\python -c "import app.main; print('OK')"` | N/A |
| **Lint** | `cd frontend && npm run lint` | `cd backend && .\.venv\Scripts\ruff check app/ tests/` | `.\scripts\dev.ps1 lint` |
| **Build** | `cd frontend && npm run build` | N/A | N/A |
| **Test** | `cd frontend && npm test` | `backend\.venv\Scripts\pytest backend\tests -v` | `.\scripts\dev.ps1 test` |
| **Docker** | `docker compose build && docker compose up -d` | `docker compose build && docker compose up -d` | N/A |

## 5. Environment Variables
*Single source of truth for all environment variable names. Never print or commit secret values.*
- **Backend (`backend/.env`, template [`backend/.env.example`](backend/.env.example)):**
  - `ENVIRONMENT`: Runtime environment mode (`development`, `production`, `test`).
  - `LOG_LEVEL`: Logging verbosity level (`DEBUG`, `INFO`, `WARNING`, `ERROR`).
  - `GEMINI_API_KEY`: Google Gemini API key used for structured 4-part Action Card synthesis.
  - `DATABASE_URL`: SQLAlchemy connection string (`sqlite:///./becon.db` or PostgreSQL URL).
  - `SUPABASE_URL`: Bare Supabase project root URL (e.g. `https://<ref>.supabase.co`, no trailing path; required in production).
  - `SUPABASE_JWT_AUDIENCE`: Expected token audience (default: `authenticated`).
  - `SUPABASE_JWT_SECRET`: Optional legacy secret for HS256 token verification.
  - `SUPABASE_SERVICE_ROLE_KEY`: Backend-only service role secret for Supabase Admin API (`DELETE /api/account`).
  - `INGEST_API_TOKEN`: Secret authorization token for `POST /api/ingest` (verified with `hmac.compare_digest`).
  - `ALLOWED_ORIGINS`: Comma-separated CORS allowed origins (e.g. `http://localhost:3000`).
  - `ENABLE_DOCS`: Toggle for `/docs` and `/redoc` Swagger documentation endpoints (`"true"`/`"false"`).
  - `FEED_CACHE_TTL_SECONDS`: Stale-while-revalidate TTL in seconds for persisted briefing cards (default: `1800`).
  - `RATE_LIMIT_ENABLED`: Enable/disable in-process rate limits and daily Gemini quotas (default: `true`).
  - `RATE_LIMIT_PUBLIC_PER_MIN`: Per-IP requests/min limit on public endpoints (default: `30`).
  - `RATE_LIMIT_AUTH_AI_PER_MIN`: Per-user requests/min limit on authenticated AI-triggering endpoints (default: `10`).
  - `GUEST_AI_PER_MIN`: Per-guest requests/min limit on AI-triggering endpoints (default: `2`).
  - `GEMINI_DAILY_CAP_PER_USER`: Hard daily (UTC) Gemini call cap per full authenticated user (default: `25`).
  - `GEMINI_DAILY_CAP_GUEST`: Hard daily (UTC) Gemini call cap per anonymous guest (default: `3`).
  - `GEMINI_DAILY_CAP_ALL_GUESTS`: Hard daily (UTC) Gemini call cap shared across all anonymous guests (default: `30`).
  - `GEMINI_DAILY_CAP_GLOBAL`: Hard daily (UTC) Gemini call cap globally per process (default: `200`).
  - `INGEST_MAX_GEMINI_CALLS_PER_RUN`: Maximum Gemini card-synthesis calls per ingestion run; excess items remain as `raw_items` for the next run (default: `25`).
  - `GEMINI_MAX_OUTPUT_TOKENS_CARD`: `max_output_tokens` cap for card generation calls (default: `650`).
  - `GEMINI_MAX_OUTPUT_TOKENS_CHAT`: `max_output_tokens` cap for onboarding chat calls (default: `400`).
  - `GEMINI_MAX_OUTPUT_TOKENS_MATCH_TOPICS`: `max_output_tokens` cap for topic matching calls (default: `200`).
  - `TRUSTED_PROXIES`: Comma-separated reverse proxy IPs allowed to supply `X-Forwarded-For` (default: empty = ignore `X-Forwarded-For`).
- **Frontend (`frontend/.env.local`, template [`frontend/.env.example`](frontend/.env.example)):**
  - `NEXT_PUBLIC_API_URL`: Base URL of the backend FastAPI service (e.g. `http://127.0.0.1:8000`).
  - `NEXT_PUBLIC_SUPABASE_URL`: Bare Supabase project root URL (e.g. `https://<ref>.supabase.co`, no trailing path).
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase client anon public key.

## 6. Code Conventions
- **Backend:** Python 3.12 type hints (`X | None` union syntax); Pydantic v2 schemas; async route handlers where feasible; snake_case functions; PascalCase schemas/models.
- **Frontend:** Next.js App Router; React 19 Client Components (`"use client"`) for stateful views; TypeScript interfaces matching backend schemas; Tailwind CSS v4 styling; follow the Next.js agent-rules block in [`frontend/AGENTS.md`](frontend/AGENTS.md) (read `frontend/node_modules/next/dist/docs/` before editing Next.js code; never edit or delete `frontend/AGENTS.md` or `frontend/CLAUDE.md`).
- **Design Tokens:** Editorial serif (`Source Serif 4`) for headlines (`font-serif`), monospace for metadata pills (`font-mono`), `Plus Jakarta Sans` for body (`font-sans`); status accents (emerald = Apply, amber = Prepare, sky = Learn, rose = Avoid).

## 7. Data Model & Auth Pointers
- **Schema & Migrations:** Full specification, table catalog, ER diagram, and Alembic workflow live in [docs/DATA_MODEL.md](docs/DATA_MODEL.md). Run `alembic upgrade head` (via `.\scripts\dev.ps1 migrate`) to verify the live schema.
- **Identity, Auth & Rate Limits:** Full specification, RLS behavior, and abuse controls live in [docs/AUTH.md](docs/AUTH.md).
- **Database Selection:** Handled in [`backend/app/database.py`](backend/app/database.py) (defaults to SQLite locally; normalizes `postgres://` to `postgresql+psycopg2://` for Postgres/Supabase).

## 8. Rules for Any AI Agent Working in this Repo
1. **Read Before Writing:** Inspect existing code and schemas before modifying. Never guess implementation details.
2. **Small, Scoped Changes:** Work on one task at a time. Do not refactor unrelated files.
3. **Never Commit Secrets:** Check `.env` files and code. Never hardcode or print API keys, passwords, or tokens.
4. **Write or Update Tests:** Include automated verification for any newly introduced endpoints or utilities.
5. **Never Hardcode Professions or Topics:** Professions, focus areas, and feeds must remain dynamic data in database tables.
6. **Strict Source Grounding:** Ensure Gemini summarization prompts use only provided source text with zero hallucination.
7. **No Unapproved `.md` Files (Reports Go in Chat):** Never create a new `.md` file without explicit user approval. Progress, audit, and review reports go in chat output only — never written into `docs/` or committed to the repo.
8. **Status Lives Only in `ROADMAP.md`:** Never duplicate task statuses, completion checklists, or hardcoded test/table counts across other markdown files; point to [ROADMAP.md](ROADMAP.md) or the verifying command instead.
9. **Adhere to Report Format:** Always complete turns with the exact progress report template shown in Section 10 (in chat output).

## 9. Open Architectural Debt
Active tasks, status, and known gaps are tracked exclusively in [ROADMAP.md](ROADMAP.md) (see Phases 2–8, plus `1.8`, `6.1`, `6.3`, `6.5`, and `6.6`).

## 10. Required Progress Report Format (Chat Output Only)
Print this exact template directly in your chat response — **do not write it to a file in `docs/` or elsewhere in the repo**:

```
=== BECON PROGRESS REPORT ===
Phase / Task ID:
Status: DONE | PARTIAL | BLOCKED
Summary (max 8 lines):
Files created/changed (path + one-line purpose):
Commands run + key output (tests, lint, build, migrations):
Acceptance criteria: each number -> PASS/FAIL + evidence
Design decisions and deviations from the spec (with reasons):
Assumptions made:
Known issues / tech debt / risks:
Env vars or secrets needed (names only):
Open questions for the project lead:
Suggested next step:
=== END REPORT ===
```
