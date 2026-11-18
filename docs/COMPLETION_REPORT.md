> Snapshot as of 2026-11-18 before cleanup

=== BECON PROGRESS REPORT ===
Phase / Task ID: Project completion audit (post Phase 1, read-only)
Status: PARTIAL
Summary (max 8 lines):
Backend Phase 1 foundation is solid: ruff passes, 44/44 SQLite pytest tests pass (2 PostgreSQL tests skipped locally), Alembic 0001->0003 upgrade/downgrade/upgrade is clean across 21 SQLite tables (20 ORM + alembic_version), and seeding is idempotent (2 professions, 54 topics, 113 aliases).
However, the working tree has an uncommitted broken edit in `frontend/src/app/page.tsx` (+439 lines vs `HEAD`) causing a JSX syntax error at lines 933 & 941 that breaks `tsc`, `eslint`, `vitest` (`finite_briefing.test.tsx`), and `next build`.
Two major Phase 6 tasks (`6.1` 4-part cards + drawer in `376852d`; `6.2` finite briefing in `4afb33f`) were already committed to `HEAD` but are NOT ticked in `ROADMAP.md`.
Core MVP differentiators remain unbuilt: Gemini is inactive locally (template fallbacks served, no claim-in-source validation), feeds still rely on dev.to/Google News, save/feedback/report-error/email-digest/metrics/deployment are not started, and `/api/search-topic` & `/api/topic-search` called by frontend 404 against backend.
All 9 manual Supabase auth QA checks remain unchecked. Estimated MVP completion: ~30%.

Files created/changed (path + one-line purpose):
- `docs/COMPLETION_REPORT.md`: Read-only project completion audit report as of 2026-11-18.

Commands run + key output (tests, lint, build, migrations):
- Backend ruff (`backend/.venv/Scripts/ruff.exe check app/ tests/`): PASS (`All checks passed!`, exit 0).
- Backend import (`python -c "import app.main; print('IMPORT_OK')"`): PASS (`IMPORT_OK`, exit 0; warnings: `GEMINI_API_KEY is not set... AI generation will use fallback cards.`, `Supabase Auth not configured (SUPABASE_URL is unset)`).
- Backend pytest (`pytest tests/ -v`): PASS (`44 passed, 2 skipped, 2 warnings in 5.24s`; skipped: `test_postgres_migrations`, `test_postgres_rls_enabled` — no local PostgreSQL configured).
- Backend Alembic fresh SQLite cycle: `upgrade head` (`-> 0001 -> 0002 -> 0003`) PASS -> 21 tables (20 app + `alembic_version`); `downgrade base` PASS -> `['alembic_version']`; `upgrade head` (2nd) PASS.
- Backend seed (`python -m app.seed` x2 on temp SQLite DB): PASS, idempotent — Run 1 & Run 2 identical: `Professions: 2`, `Focus topics: 54`, `Topic aliases: 113`, `Profession-topic links: 54`.
- Frontend `npx tsc --noEmit`: FAIL (exit 2) — `src/app/page.tsx(933,55): error TS1382`, `(941,25): error TS1381` (caused by uncommitted dirty working-tree edit).
- Frontend `npm run lint`: FAIL (exit 1) — `33 problems (13 errors, 20 warnings)` including `page.tsx:933` parse error plus pre-existing errors in `about/page.tsx`, `onboarding/page.tsx`, `profile/page.tsx`, `ThemeContext.tsx`.
- Frontend `npm test`: FAIL (exit 1) — `Test Files: 1 failed | 6 passed (7)`, `Tests: 38 passed (38)`. Failing suite: `src/test/finite_briefing.test.tsx` (esbuild transform error on `page.tsx:933,941`). Passing: `redirect` (5), `cache` (3), `api` (6), `RequireAuth` (4), `cards` (13), `AuthForm` (7).
- Frontend `npm run build`: FAIL (exit 1) — Next.js 16.3.0 (Turbopack) parse error on `src/app/page.tsx:933:55` and `941:25`.
- Docker (`docker compose config` / `build`): COULD NOT RUN — `docker` CLI not installed / not in `PATH` on this host (`CommandNotFoundException`).

Acceptance criteria: each number -> PASS/FAIL + evidence
- 0.1 Repo audit: PASS — `AUDIT_REPORT.md` present and tracked.
- 0.2 UI audit: PASS — `UI_DESIGN.md` present (323 lines; now drifted, see Section 5).
- 0.3 `CLAUDE.md`: PASS — `CLAUDE.md` present (122 lines; minor drift, see Section 5).
- 1.1 Hygiene & guardrails: PASS — zero tracked `.env`/`.db` files; zero hardcoded secret matches in tracked code; `.gitignore` and `.env.example` match `CLAUDE.md` Sec 5 (except undocumented `FEED_CACHE_TTL_SECONDS`); `/api/ingest` requires `X-Ingest-Token` (`backend/app/main.py:344-394`); retired auth artifacts absent from grep; prompt sanitized (`backend/app/ai_service.py:24-34,104-110`); neutral schema defaults (`backend/app/schemas.py:40-48`).
- 1.1b Remote secrets scan & history rewrite: PARTIAL — local tree verified clean, but remote history/push state could not be verified offline.
- 1.2 Tooling & CI: PASS — `ruff.toml`, `requirements.lock`, `ci.yml` (3 jobs), `backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml`, `logging_config.py`, `GET /health`, `scripts/dev.ps1`, `.pre-commit-config.yaml` exist (Docker runtime unverified).
- 1.3 Alembic & full schema: PASS — `0001`, `0002`, `0003` exist and run full up/down/up; 20 ORM tables + `alembic_version` = 21 DB tables; email dedup + UUID PKs + CHECK constraints verified; idempotent seeder verified.
- 1.4 Supabase Auth consolidation: PASS (code/unit tests) / PENDING (manual browser QA) — JWKS (`ES256`/`RS256`, 10m cache, 1/min unknown-`kid` refetch) + `HS256` fallback (`supabase_auth.py:54-210`); user mapping direct/legacy-link/409/IntegrityError-race/soft-delete-401 (`deps.py:35-170`); `DELETE /api/account` returns 502 and preserves local row on Supabase failure (`main.py:453-478`); custom JWT/guest endpoints fully removed.
- 1.4c Post-auth cleanup & docs drift: PARTIAL — `docker-compose.yml`, `.env.example`, and CI PG job updated, but `UI_DESIGN.md` Sec 11 and `docs/AUTH.md` still contain substantial drift.
- 1.4d Viewport fitting: PASS — `AuthShell.tsx` (`h-dvh min-h-dvh`, `[@media(max-height:760px)]:hidden`) wraps `AuthForm`, `forgot-password`, and `auth/reset-password`.
- 1.5 DB persistence & remove `_USER_CACHES`: PASS — `ingestion.py` persists `sources`, `raw_items`, `events`, `cards`, `card_variants` keyed by `(card_id, profession_id)`; re-ingest yields 0 duplicates; stale-while-revalidate works (`feed_service.py:446-460`); `_USER_CACHES` 0 grep hits.

Design decisions and deviations from the spec (with reasons):
- Read-only audit: no source, migration, or config files modified; temporary SQLite DB for Alembic/seed verification was created in `%TEMP%` and deleted immediately.
- Code treated as source of truth wherever documentation disagreed.
- Compact card variant (`ActionCardBody.tsx:80-110`) deviates from the strict 4-part rule by omitting `why_it_matters` when `how_it_affects_you` is present (all 4 parts render in `wide` cards and `CardDrawer`).

Assumptions made:
- Assumed `backend/.env` and `frontend/.env.local` are intentionally excluded from git and should not be read for values; absence of `GEMINI_API_KEY` and `SUPABASE_URL` was inferred strictly from `python -c "import app.main"` startup log output.
- Assumed uncommitted changes in `frontend/src/app/page.tsx` are an unintended partial merge/revert left in the workspace prior to this audit.

Known issues / tech debt / risks:
- BLOCKER: Uncommitted broken edit in `frontend/src/app/page.tsx` breaks `tsc`, `lint`, `vitest`, and `next build`.
- BUG: Frontend calls `GET /api/search-topic` (`page.tsx:309,355`) and `GET /api/topic-search` (`profile/page.tsx:168`), neither of which exists in `backend/app/main.py`; backend's `GET /api/briefings/search` uses `TopicSearchResponse` which strips `cards`.
- Gemini inactive locally (fallback templates served); no strict source-only prompt constraint and no claim-in-source validator (`validation_status` hardcoded `"passed"`).
- Zero rate limiting on backend endpoints (including unauthenticated `POST /api/ai/match-topics` and `GET /api/briefings?refresh=true`).
- 9 manual Supabase auth QA items + live Supabase RLS migration check remain unrun.
- CI hides ESLint failures with `continue-on-error: true`; `scripts/dev.ps1 test` skips frontend tests.
- Soft-delete 401 guard in `deps.py` has no automated test.

Env vars or secrets needed (names only):
- Backend: `ENVIRONMENT`, `LOG_LEVEL`, `DATABASE_URL`, `ALLOWED_ORIGINS`, `ENABLE_DOCS`, `FEED_CACHE_TTL_SECONDS`, `GEMINI_API_KEY`, `INGEST_API_TOKEN`, `SUPABASE_URL`, `SUPABASE_JWT_AUDIENCE`, `SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`.
- Frontend: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

Open questions for the project lead:
1. Should the dirty working-tree changes in `frontend/src/app/page.tsx` be discarded (`git checkout -- frontend/src/app/page.tsx`) to restore clean `HEAD` (`4afb33f`)?
2. Should `ROADMAP.md` now tick `6.1` (after confirming compact-card `why_it_matters` behavior) and `6.2`?
3. When will the 9 live Supabase auth QA items + `alembic upgrade head` against Supabase dev be executed?
4. Should we proceed next with `6.3` + fixing the broken search endpoints, or jump straight to Phase 2 (official sources & scheduler)?

Suggested next step:
Inspect and discard the broken uncommitted diff in `frontend/src/app/page.tsx`, re-verify `tsc`/`test`/`build` green on `HEAD`, fix the frontend-backend search endpoint mismatch (`/api/search-topic` & `/api/topic-search` vs `/api/briefings/search`), complete the 9 live Supabase QA checks, and update `ROADMAP.md` and `UI_DESIGN.md` before starting Phase 2 (or Task 6.3).
=== END REPORT ===

---

## Detailed Audit Appendix (Steps 1–7)

### Step 1: Command Execution & CI Comparison

#### Backend Verification
| Check | Result | Key Output |
| :--- | :--- | :--- |
| `ruff check app/ tests/` | **PASS** | `All checks passed!` (exit 0) |
| `python -c "import app.main; print('IMPORT_OK')"` | **PASS** | `IMPORT_OK` (warnings: `GEMINI_API_KEY` unset -> fallback cards; `SUPABASE_URL` unset -> protected endpoints return 503) |
| `pytest tests/ -v` | **PASS** | `44 passed, 2 skipped, 2 warnings in 5.24s` (skipped: `test_postgres_migrations`, `test_postgres_rls_enabled`) |
| `alembic upgrade head` (fresh SQLite) | **PASS** | `-> 0001 -> 0002 -> 0003`; created **21 tables** (20 ORM + `alembic_version`) |
| `alembic downgrade base` -> `upgrade head` | **PASS** | `0003 -> 0002 -> 0001 ->` (only `alembic_version` left), then re-upgraded cleanly |
| `python -m app.seed` (x2) | **PASS** | Idempotent: Run 1 & Run 2 both `professions: 2`, `focus_topics: 54`, `topic_aliases: 113`, `profession_topics: 54` |

#### Frontend Verification (Dirty Working Tree `M frontend/src/app/page.tsx`)
| Check | Result | Key Output |
| :--- | :--- | :--- |
| `npx tsc --noEmit` | **FAIL** (exit 2) | `src/app/page.tsx(933,55): error TS1382`, `(941,25): error TS1381` |
| `npm run lint` | **FAIL** (exit 1) | `33 problems (13 errors, 20 warnings)` (`page.tsx:933` parse error + pre-existing errors in `about`, `onboarding`, `profile`, `ThemeContext`) |
| `npm test` | **FAIL** (exit 1) | `Test Files: 1 failed \| 6 passed (7)`; `Tests: 38 passed (38)` (`finite_briefing.test.tsx` failed transform on `page.tsx:933,941`) |
| `npm run build` | **FAIL** (exit 1) | Next.js 16.3.0 (Turbopack) parse error on `src/app/page.tsx:933:55` and `941:25` |

> **Root Cause of Frontend Failures:** `git status` shows uncommitted `M frontend/src/app/page.tsx` (+439 lines vs `HEAD` commit `4afb33f`). It duplicates the `lucide-react` import (lines 3–4), re-inserts old `renderLeadSidebarCard`/`renderBriefCard`/`renderSquareCard`/`renderRectangleCard` and infinite-scroll state variables, and leaves two `: topWireStories.map(...)` branches in the same ternary at line 933.

#### Docker & CI Summary
- **Docker:** Could not run `docker compose config` or `docker compose build` (`docker` binary not installed in this environment). Static review of `docker-compose.yml`, `backend/Dockerfile`, `frontend/Dockerfile`, and `frontend/next.config.ts` (`output: "standalone"`) shows no structural errors.
- **CI (`.github/workflows/ci.yml`):** Runs 3 jobs on push/PR to `main`:
  1. `backend` (Python 3.12, SQLite): `ruff check app/ tests/`, `pytest tests/ -v`. Matches local commands (does not separately run `import app.main` or CLI `alembic`/`seed`, though `test_schema.py` exercises them).
  2. `postgres` (Python 3.12 + `postgres:16` service): `alembic upgrade head`, `pytest tests/ -v` (runs the 2 PostgreSQL tests skipped locally).
  3. `frontend` (Node 24): `npm ci`, `npm run lint` (**masked via `continue-on-error: true`**), `npm test`, `npx tsc --noEmit`, `npm run build`. Matches local commands except lint errors do not fail CI.

---

### Step 2: Deep Verification Notes (Phase 0 & Phase 1)
- **Retired Auth Removal:** `git grep` across `backend/` and `frontend/src/` confirmed **0 matches** for `app/auth.py`, `/api/register`, `/api/login`, `/api/auth/guest`, `/api/auth/supabase-sync`, and `_USER_CACHES`.
- **Supabase Token Verification (`backend/app/supabase_auth.py`):**
  - Asymmetric JWKS (`ES256`, `RS256`) cached 10 min (`lifespan=600`, line 69); unknown-`kid` refetch rate-limited to 1/min (`>= 60.0`, line 87).
  - Optional symmetric `HS256` fallback when `SUPABASE_JWT_SECRET` is set (lines 131–161). Rejects `alg=none` (line 127), validates `aud`, `iss`, `exp` (`leeway=10`), and UUID `sub` (lines 202–208).
- **User Mapping & Account Deletion (`backend/app/deps.py`, `backend/app/main.py`):**
  - Direct match on `external_auth_id == sub` (`deps.py:67`), legacy email linking when `external_auth_id IS NULL` (`deps.py:91-121`), `409 Conflict` when email belongs to a different `external_auth_id` (`deps.py:124-131`), `IntegrityError` rollback + re-query race handling (`deps.py:112-121, 152-169`), soft-delete `401 Unauthorized` (`deps.py:69-73, 94-98, 159-163`).
  - `DELETE /api/account` (`main.py:433-478`): calls Supabase Admin API first; raises `502 Bad Gateway` and keeps local row intact on failure (lines 468–473); returns `204` after local cascade delete on success.
- **Gemini Status (`backend/app/ai_service.py`, `backend/app/ingestion.py`):**
  - **Inactive locally:** `GEMINI_API_KEY` is unset; `generate_action_card` immediately returns `fallback_card` (`ai_service.py:116-127`) and persists `model_name="fallback-heuristic"` (`ingestion.py:324,482`).
  - **Source-grounding & validation:** Prompt (`ai_service.py:129-150`) does **not** instruct "use only the provided source text / never invent facts." Only Pydantic JSON schema validation runs (`BriefingCardContent.model_validate_json`, line 170). No claim-in-source verification exists; `cards.validation_status` is hardcoded to `"passed"` (`ingestion.py:326`).

---

### Step 3: Roadmap Status Table (Phases 2–9)

| Task | Description | True Status | Code Evidence / Notes |
| :--- | :--- | :--- | :--- |
| **2.1** | Source registry model & admin seed script | **partial** | `Source`/`SourceTopic` ORM models exist (`models.py:274-342`), `get_or_create_source` in `ingestion.py:148`, no curated source seed script. |
| **2.2** | Curate & seed 25–40 official dev sources | **not started** | `feed_service.py:31-154` uses dev.to, Google News, BBC, and 1 MS .NET blog. |
| **2.3** | Multi-protocol fetchers, conditional GET, full-text | **partial** | Basic `feedparser` + HTML stripping only; no GitHub Releases/GHSA/NVD, no `ETag`/`Last-Modified` requests, no full-text extraction. |
| **2.4** | Scheduler, retries/backoff, source health endpoint | **partial** | DB tracks `consecutive_failures`/`last_error`, per-source try/except exists, but no scheduler, retries, backoff, or health endpoint. |
| **2.5** | Remove Google News & dev.to as primary sources | **not started** | Still primary in `feed_service.py:31-154, 207`. |
| **3.1** | Exact dedup (URL/hash) & normalization | **done** *(unrecorded)* | Built in Task 1.5 (`ingestion.py:51-100, 209-262`; tested in `test_ingestion_persistence.py`). |
| **3.2** | Semantic dedup with embeddings | **not started** | `events.embedding` column unused. |
| **3.3** | Focus tagging via taxonomy & category | **partial** | Keyword classifier `classify_event_category` (`ingestion.py:112-125`); `EventTopic` does not resolve via `topic_aliases`. |
| **3.4** | Severity score (D7) | **partial** | Keyword heuristic (`ingestion.py:128-145`); lacks advisory severity, focus match, recency. |
| **4.1** | Gemini configured, strict schema, source-only prompt | **partial** | `response_schema=BriefingCardContent` exists; key unset locally; prompt lacks strict source-only rule. |
| **4.2** | Validation layer (claim-in-source, retry, flag) | **not started** | `validation_status` hardcoded `"passed"` (`ingestion.py:326`). |
| **4.3** | Rate-limit backoff, caching, cost tracking | **partial** | DB caching done (1.5); no 429 backoff or cost tracking. |
| **4.4** | 30+ evaluation set & manual review report | **not started** | None present. |
| **5.1** | Profile: profession, versioned topics, timezone, delivery | **partial** | DB & `GET /api/me` support fields, but `/api/profile` & `/profile` UI still read/write legacy deprecated columns only. |
| **5.2** | Relevance scoring & ranking | **not started** | Orders strictly by `Event.published_at DESC, Card.created_at DESC` (`feed_service.py:493`). |
| **5.3** | Briefing builder: 5–10 cards, reading time, daily cache | **partial** | Frontend `HEAD` caps at `BRIEFING_MAX_CARDS = 10` with client-side reading-time estimate; no backend daily per-user cache. |
| **5.4** | Per-profession "How it affects you" variants | **partial** *(unrecorded)* | `get_or_create_card_variant` caches `(card_id, profession_id)` (`ingestion.py:426-501`), but driven by free-text role strings & fallback templates. |
| **5.5** | Cold-start seeded briefing & empty states | **not started** | Relies on hardcoded frontend mock decks + sync bootstrap fetch. |
| **6.1** | 4-part Action Card + badge + detail drawer | **partial** *(committed `376852d`, unrecorded; broken in working tree)* | Components + `CardDrawer` + 13 tests exist in `HEAD`, but `compact` cards omit `why_it_matters`, and dirty `page.tsx` breaks build. |
| **6.2** | Remove infinite scroll & page-lift (D12), end state | **done at HEAD** *(committed `4afb33f`, unrecorded; broken in working tree)* | Removed wheel/touch/lift & added `all-caught-up-panel` + 3 tests in `HEAD`; dirty `page.tsx` breaks test suite. |
| **6.3** | Remove mock fallback generators & split `page.tsx` | **partial** | Card renderers extracted in `376852d`, but 610 lines (`HEAD`) / 739 lines (working tree) of mock generators remain in `page.tsx`. |
| **6.4** | Onboarding rebuilt around profession + focus | **not started** | Still uses hardcoded `AVAILABLE_TOPICS` (`main.py:51-62`) and hardcoded UI arrays (`profile/page.tsx:34-82`). |
| **6.5** | Save cards, feedback, report error, clickable pills, archive | **not started** | Zero API endpoints or UI controls. |
| **6.6** | Editorial serif font, token cleanup, a11y fixes | **partial** | `CardDrawer` has Escape/focus-trap/aria-modal; serif webfont still missing in `layout.tsx`; `#090d16` vs `#070b12` & dropdown a11y remain. |
| **6.7** | 30-day anonymous cleanup job & guest upgrade flow | **partial** | Frontend upgrade UI (`/register?upgrade=1`) exists; no 30-day cleanup job. |
| **7.1–7.3** | Resend SMTP, digest template/schedule, metrics tracking | **not started** | None implemented. |
| **8.1–8.6** | Staging/prod deploy, monitoring, legal, landing, beta, Telegram | **not started** | None implemented. |
| **9.1–9.3** | YouTube, X/Twitter, Instagram follows | **not started** | Schema-ready only (`sources.type`, `user_follows`). |

#### Unrecorded Completed Work vs Unsubstantiated `[x]` Items
- **Done in git but unticked in `ROADMAP.md`:** Commits `376852d` (Task `6.1`), `4afb33f` (Task `6.2`), plus partial/done overlaps from Task `1.5` (`3.1` exact dedup, `5.4` variant caching). `ROADMAP.md:7` still reads `next: 6.1 and 6.2`.
- **Ticked `[x]` with gaps:** `1.1b` (remote history rewrite unverifiable locally); `1.4c` (claimed `UI_DESIGN.md` updated, but Section 11 still lists pre-1.4 auth gaps); Phase 1 exit criterion `"auth works end to end"` still awaiting manual browser QA.

---

### Step 4: Product-Principle Compliance (`CLAUDE.md` Section 2)

| Principle / Question | Compliance | Evidence |
| :--- | :--- | :--- |
| **4-part cards + ActionBadge on main feed** | **PARTIAL (`HEAD`) / BROKEN (working tree)** | At `HEAD`: `LeadCard` & `RectangleCard` (`variant="wide"`) render all 4 parts + `ActionBadge`; `BriefCard` & `SquareCard` (`variant="compact"`, `ActionCardBody.tsx:80-110`) omit `why_it_matters` whenever `how_it_affects_you` is set. Working tree re-injected legacy renderers and syntax errors. |
| **No infinite scroll / page-lift (D12)** | **MET (`HEAD`) / REGRESSED (working tree)** | `HEAD` (`4afb33f`) removed wheel/touchmove listeners, `translateY` lift, and `getNextEditionCards`, adding `BRIEFING_MAX_CARDS = 10` & `all-caught-up-panel`. Dirty working tree re-inserted unused `isLoadingMore`/`editionNumber` states (`page.tsx:175-182`). Backend docstring (`main.py:259,268`) still references infinite scroll. |
| **`page.tsx` size & mock fallback lines** | **NON-COMPLIANT** | Working tree: **2,655 lines** total (**739 lines** mock generators at `1917–2655`, plus 401 lines re-injected legacy renderers). `HEAD`: **2,087 lines** total (**610 lines** mock generators at `1478–2087`, 549 from `getBeautyFashionBroadsheetCards` at `1539`). |
| **No hardcoded professions/topics/feeds** | **VIOLATED** | Hardcoded in `backend/app/main.py:51-62` (`AVAILABLE_TOPICS`), `backend/app/feed_service.py:31-154` (`TOPIC_FEED_MAP`, `DEFAULT_FEED_SOURCES`), `frontend/src/app/profile/page.tsx:34-82` (`SUGGESTED_ROLES`, `POPULAR_TOPICS`, `EXTENDED_TECH_CATALOG`), `frontend/src/app/page.tsx:1917-2655` (5-vertical mock decks). |
| **Trusted official sources (no dev.to/Google News)** | **VIOLATED** | `backend/app/feed_service.py:31-154,207` still relies heavily on `news.google.com/rss/search` and `dev.to/feed/tag/*` (only 1 official vendor feed: Microsoft `.NET` blog). |

---

### Step 5: Documentation Drift Inventory

1. **`UI_DESIGN.md` Section 11 (CONFIRMED DRIFT):** Still lists `"Missing Email/Password Authentication"` (HIGH, line 304) and `"Duplicated Route Code between Login and Register"` (MEDIUM, line 308), both resolved in Task 1.4 (`AuthForm.tsx`, 18-line `login/page.tsx`, 26-line `register/page.tsx`). Sections 6–9, 11–12 also still describe pre-6.1/6.2 state (no drawer, missing parts 3–4, infinite scroll, 3,381-line `page.tsx`, `SavedBriefing` table, omits `AuthContext` in Sec 1.3).
2. **Guest upgrade URL (CONFIRMED DRIFT):** Real code uses **`/register?upgrade=1`** (`frontend/src/app/register/page.tsx:9`, `frontend/src/components/GuestBanner.tsx:56`, matching `UI_DESIGN.md:41`). `docs/AUTH.md:209` wrongly states `/register?mode=upgrade`.
3. **Table count 20 vs 21 (RECONCILED):** **20** application ORM tables in `backend/app/models.py` + **1** Alembic tracking table (`alembic_version`) = **21** total DB tables (all 21 receive PostgreSQL RLS in `0003_supabase_auth_rls.py:20-42`). `CLAUDE.md`, `DATA_MODEL.md`, and `AUTH.md` should clarify "20 application tables (+ `alembic_version` = 21 total)".
4. **`saved_briefings` drop schedule (CONFIRMED DRIFT):** `docs/DATA_MODEL.md:139,177` and `backend/app/models.py:108` say `saved_briefings` "will be dropped in Phase 1.5", yet Task 1.5 is closed and the table remains in `models.py` and DB migrations. Re-slot to Phase 2 or Phase 6.5 cleanup migration.
5. **`<RequireAuth />` gating (`UI_DESIGN.md:39,45,46`) (VERIFIED TRUE):** `<RequireAuth>` wraps `/`, `/onboarding`, and `/profile`; auth routes and `/about` remain public.
6. **Frontend-Backend Endpoint Mismatch (CRITICAL BUG + DRIFT):**
   - `frontend/src/app/page.tsx:309,355` calls `GET /api/search-topic` and `frontend/src/app/profile/page.tsx:168` calls `GET /api/topic-search` (both documented in `UI_DESIGN.md:263-264`). Neither route exists in `backend/app/main.py`!
   - Backend exposes `GET /api/briefings/search` (`main.py:298`) and `POST /api/ai/match-topics` (`main.py:327`). Moreover, `GET /api/briefings/search` declares `response_model=TopicSearchResponse` (`schemas.py:225-231`), which omits `cards` and strips the `cards` array returned by `search_topic_briefings` (`feed_service.py:601-605`).
7. **Other `CLAUDE.md` / Code Drifts:**
   - `FEED_CACHE_TTL_SECONDS` (`backend/app/config.py:26`) missing from `CLAUDE.md` Sec 5, `backend/.env.example`, and `docker-compose.yml`.
   - `CLAUDE.md` Sec 3 omits `CardDrawer.tsx`, `components/cards/*`, `GuestBanner.tsx`, `lib/cache.ts`, `lib/redirect.ts`, `lib/supabaseClient.ts`, `forgot-password`, `auth/callback`, `auth/reset-password`, `config.py`, `logging_config.py`.
   - `CLAUDE.md` Sec 4 says `25 unit tests via Vitest` (actual `HEAD` has 41 across 7 suites) and implies `.\scripts\dev.ps1 test` runs frontend tests (it only runs backend `pytest`).
   - `CLAUDE.md` Sec 9 still lists 6.1 gaps as active despite commit `376852d`.
   - `backend/app/schemas.py:75` still documents `auth_provider` as `'local', 'google', or 'guest'`.

---

### Step 6: MVP Definition of Done Scorecard (`ROADMAP.md:144`)

| # | MVP Criterion | Score | One-Line Reason |
| :--- | :--- | :--- | :--- |
| 1 | 25–40 curated official sources on a schedule | **NOT MET** | Hardcoded dev.to/Google News map; no scheduler or official registry. |
| 2 | Duplicates merged | **PARTIAL** | Exact URL/title dedup implemented (1.5); semantic embedding dedup not built. |
| 3 | Every card validated and source-linked | **PARTIAL** | All cards store `source_url`, but Gemini inactive locally and `validation_status` hardcoded `"passed"`. |
| 4 | Signup to briefing in 3–5 min of reading | **PARTIAL** | Auth + 10-card finite briefing exist at `HEAD`, but live QA unrun, search broken, working tree broken. |
| 5 | Save / feedback / report-error | **NOT MET** | DB tables exist; zero API endpoints or frontend UI. |
| 6 | Daily email digest | **NOT MET** | Phase 7 not started (no Resend, template, or timezone scheduler). |
| 7 | Light/dark, mobile, accessible | **PARTIAL** | Dark/light + responsive Bento + `CardDrawer` a11y done; serif font, contrast, dropdown a11y pending. |
| 8 | Tests and CI | **PARTIAL** | 44 backend + 38/41 frontend tests + 3-job CI exist, but CI ignores lint errors and working tree fails build. |
| 9 | Staging and prod deployed | **NOT MET** | Phase 8.1 not started. |
| 10 | Metrics recorded | **NOT MET** | `metrics_events` table unused; zero instrumentation. |
| 11 | Legal pages and landing page live | **NOT MET** | Only `/about` exists; no Terms, Privacy, Attribution, or waitlist landing page. |
| 12 | 30-example quality gate passed | **NOT MET** | Phase 4.4 not started. |

**Overall MVP Completion Estimate: ~30%** (0 MET, 5 PARTIAL, 7 NOT MET). Solid engineering foundation (schema, auth, DB persistence, CI, initial card/finite-briefing refactor) is in place, but all core value-delivery phases (official ingestion, grounded+validated Gemini synthesis, personalization/ranking, user feedback/saves, email digest, metrics, legal/landing, deployment) remain ahead.

---

### Step 7: Risks, Security, Cost & Manual QA Backlog

#### Security & Reliability Risks
- **PostgreSQL RLS unverified live:** `0003` enables default-deny RLS on all 21 tables, which is essential because `NEXT_PUBLIC_SUPABASE_ANON_KEY` is exposed in the browser. Not yet applied/verified against the live Supabase project (`alembic upgrade head` + role check pending).
- **No Rate Limiting / Abuse Surface:** Zero rate limiting on any endpoint. Unauthenticated callers can trigger expensive synchronous RSS fetches + Gemini inference via `GET /api/briefings?refresh=true`, `GET /api/briefings/search`, or `POST /api/ai/match-topics`. Anonymous sign-ins have no Turnstile CAPTCHA yet (Phase 8.1).
- **Minor Auth/CORS Hardening Gaps:** `/api/ingest` token check uses `!=` instead of `hmac.compare_digest` (`main.py:369`); CORS allows `methods=["*"]` and `headers=["*"]` (`main.py:131-132`); `deleted_at` soft-delete 401 guard (`deps.py:69,94,159`) has zero automated test coverage.
- **Gemini Cost Exposure:** Once `GEMINI_API_KEY` is enabled, `get_or_create_card_variant` (`ingestion.py:426-501`) auto-creates `Profession` rows and triggers Gemini calls for arbitrary free-text `role` query params; combined with unauthenticated `refresh=true` and `/api/ai/match-topics`, this poses an uncapped spend risk.
- **Ingestion Reliability:** Global `socket.setdefaulttimeout(7.0)` (`feed_service.py:28`), no retries/backoff, no `ETag`/`Last-Modified` conditional GET, no background scheduler.

#### Manual QA Backlog (`docs/AUTH.md` Section 7 + `ROADMAP.md:60`)
| # | Manual QA Item | Automated Test Coverage | Live Verification |
| :--- | :--- | :--- | :--- |
| 1 | Email/password sign-up + confirmation email | Partial mock (`AuthForm.test.tsx`) | Pending |
| 2 | Email/password sign-in + `?next=` redirect | Partial mock (`AuthForm.test.tsx`, `redirect.test.ts`) | Pending |
| 3 | Google OAuth via `/auth/callback` | Minimal (button render only; callback untested) | Pending |
| 4 | Anonymous guest exploration + `<GuestBanner />` | Partial mock (`AuthForm.test.tsx`, backend `test_supabase_auth.py`; banner untested) | Pending |
| 5 | Guest account upgrade (`/register?upgrade=1`) | Partial mock (UI render only; upgrade flow untested; `AUTH.md` URL drifted) | Pending |
| 6 | Forgot/reset password flow | **None** | Pending |
| 7 | Danger zone account deletion (`DELETE /api/account`) | Partial (backend cascade/502/503 + `api.test.ts`; `/profile` UI untested) | Pending |
| 8 | Silent token refresh on 401 | Partial mock (`api.test.ts`) | Pending |
| 9 | Theme preservation (`becon_theme`) on sign-out | Partial unit (`cache.test.ts`) | Pending |
| + | `alembic upgrade head` & RLS check on live Supabase DB | SQLite + CI PG container only | Pending |

#### Blockers Before Phase 2
1. **Resolve dirty `frontend/src/app/page.tsx`** so frontend `tsc`, `vitest`, and `next build` are green again.
2. **Execute pending Phase 1 live Supabase QA** (including RLS verification) to genuinely satisfy Phase 1 exit criteria.
3. **Fix search endpoint contract mismatch** (`/api/search-topic` & `/api/topic-search` vs `/api/briefings/search` + `TopicSearchResponse`) and gate/rate-limit `refresh=true` & `/api/ai/match-topics` before turning on `GEMINI_API_KEY`.
