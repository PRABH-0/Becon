# BECON ROADMAP AND PROGRESS TRACKER

Single source of truth for where the project stands. Lives in the repo root. Maintained by the project lead (Claude chat) and updated by Antigravity after each approved task.

Last updated: 2026-11-19  
Current phase: 2 (Source Registry and Ingestion) / 6 (Frontend Completion)  
Current task: 6.9 (Home-page topic search investigation)  

Legend: `[ ]` not started, `[~]` in progress, `[x]` done and approved, `[!]` blocked

---

## Vision in one line

Becon is a career update companion (not a news app): a 3-5 minute daily briefing of source-grounded Action Cards (What happened / Why it matters / How it affects you / What to do next) for anyone with a career. Developers first, profession-agnostic by design. Creator follows (YouTube, X, Instagram) come after the MVP.

---

## Decisions

| # | Decision | Status |
| :--- | :--- | :--- |
| **D1** | Creator/platform follows are core but ship after MVP (Phase 9); schema supports them from Phase 1 | Assumed confirmed |
| **D2** | One card per EVENT (shared), ranked per user; per-profession variants cached | Assumed confirmed |
| **D3** | Supabase Auth is the only identity system; custom JWT retired in 1.4 | Assumed confirmed |
| **D4** | MVP delivery = web briefing + daily email; Telegram after | Assumed confirmed |
| **D5** | Adaptive ranking deferred; MVP only collects feedback | Assumed confirmed |
| **D6** | Grounded generation: Gemini uses only fetched source text, output validated | Assumed confirmed |
| **D7** | Severity score from advisory severity, breaking/EOL flag, focus match, recency | Assumed confirmed |
| **D8** | Focus taxonomy with aliases and optional versions | Assumed confirmed |
| **D9** | Metrics from day one | Assumed confirmed |
| **D10** | Profession-agnostic architecture; developers are the launch vertical | Assumed confirmed |
| **D11** | Career/hiring signals are post-MVP | Assumed confirmed |
| **D12** | Time-boxed briefing: remove infinite scroll and page-lift animation (violates principles) | New, from audit |

---

## Audit baseline (2026-11-17)

Pre-Phase-1 baseline folded from the retired `AUDIT_REPORT.md` snapshot:
- **Runtime:** Python 3.12 / FastAPI + SQLAlchemy (SQLite `becon.db`), Node 24 / Next.js 16.3 + React 19 + Tailwind CSS v4.
- **Working at baseline:** Local FastAPI + Next.js dev servers ran, Bento Grid UI and light/dark theme worked, `tsc` clean.
- **Data & AI gaps:** `GEMINI_API_KEY` inactive (heuristic fallback templates served), zero card persistence (in-memory dict cache only), no Alembic migrations, no unique email constraint (duplicate `user_profiles` rows), no semantic dedup, feeds relied on Google News & dev.to instead of official sources.
- **Product & UI gaps:** Main feed cards omitted *How it affects you* and *What to do next*, no card detail drawer, infinite scroll + page-lift violated time-boxed briefing vision, no email/password UI.
- **Security & tooling gaps:** Unauthenticated `/api/ingest` and `/api/auth/guest`, custom JWT expiry bug (`15m` vs `7d`), unsanitized `custom_prompt`, wildcard CORS, two auth systems, zero automated tests, CI, Docker, or background scheduler.

---

## PHASE 0: Discovery (DONE)
- [x] 0.1 Repo audit *(retired `AUDIT_REPORT.md`; baseline folded above)*
- [x] 0.2 UI audit ([`docs/UI_DESIGN.md`](docs/UI_DESIGN.md))
- [x] 0.3 Repo [`CLAUDE.md`](CLAUDE.md) for agents

---

## PHASE 1: Foundation
- [x] 1.1 Hygiene and security guardrails (secrets check, central config, protect `/api/ingest`, rate-limit guest, JWT expiry fix, remove personal defaults, prompt-injection hardening, first tests)
- [~] 1.1b Remote secrets scan and local history rewrite *(remote history scrub unverified)*
- [x] 1.2 Tooling: pytest and ruff setup, GitHub Actions CI, Dockerfile and docker-compose, structured logging
- [x] 1.3 Alembic and full schema: professions, focus_topics (aliases, versions), sources, raw_items, events, cards, card_variants, user_follows, saved_cards (with user link), feedback, error_reports, deliveries, metrics_events; unique email
- [x] 1.4 Auth consolidated on Supabase Auth: email/password plus Google, verification, reset, account deletion; retire custom JWT and guest hack; dedupe login/register pages
- [~] 1.4c Post-auth cleanup and docs drift: docker-compose cleanup, .env.example matching CLAUDE.md, docs/UI_DESIGN.md and README.md updated, CI PostgreSQL service container job added *(remote history verification still open under 1.1b)*
- [x] 1.4d Viewport fitting: auth pages fit within one viewport without scrollbars via AuthShell and responsive height queries
- [x] 1.5 Persist cards and events in the database; replace in-memory `_USER_CACHES`
- [x] 1.6 Pre-push stabilization: back up and discard dirty `page.tsx` diff, verify green `tsc`/`test`/`build`, fix trivial ESLint errors, update `dev.ps1 test` to run frontend + backend tests, fix high-priority doc drift, commit & push *(approved; commits `74dccc7`, `695ed3e`, `d35c4dd`)*
- [x] 1.6b Supabase URL misconfiguration handling (normalize trailing slash, reject non-root paths like `/rest/v1` & `/auth/v1`, fail fast in prod, friendly `AuthForm` error) + lower signup/reset password min length to 6 via shared `PASSWORD_MIN_LENGTH` constant (login allows short existing passwords) *(merged in `a59f089`)*
- [x] 1.7 Pre-Phase-2 hardening: fix `/api/search-topic` and `/api/topic-search` vs `/api/briefings/search` contract, add `/api/topics/search`, in-process rate limiting & daily Gemini caps with `TRUSTED_PROXIES`, `hmac.compare_digest` for ingest token, gate `refresh=true` and `/api/ai/match-topics`, tighten CORS, test for soft-delete 401, stop auto-creating `Profession` rows *(merged in `a59f089`)*
- [x] 1.7b Close Gemini spend/abuse holes (pre-`GEMINI_API_KEY` hardening): unauthenticated `/api/briefings/search` & `/api/briefings` strictly DB-only (`422` caps on `interests`/`role`/`custom_prompt`/`ChatRequest`, `live=true` auth-gated), shared `CardVariant` isolated from `custom_prompt` & unauthenticated generation, configurable `max_output_tokens` on all Gemini calls, retries capped at 1 & counted once per logical request (unreached failures consume 0), stricter guest limits (`GUEST_AI_PER_MIN`, `GEMINI_DAILY_CAP_GUEST`, `GEMINI_DAILY_CAP_ALL_GUESTS`), per-run ingest budget (`INGEST_MAX_GEMINI_CALLS_PER_RUN`), docs & fake-Gemini test suite *(approved, merged `e4f8b2e`)*
- [ ] 1.8 Frontend ESLint cleanup: resolve remaining pre-existing React hook & explicit `any` errors across `page.tsx`, `profile/page.tsx`, `onboarding/page.tsx`, and `ThemeContext.tsx`, then remove CI `continue-on-error: true` *(docs consolidation split into `1.8a`)*
- [x] 1.8a Documentation consolidation: fold concise baseline into `ROADMAP.md`, remove superseded report files (`AUDIT_REPORT.md`, `docs/COMPLETION_REPORT.md`, `docs/MERGE_READINESS_REPORT.md`, `frontend/README.md`), move & refresh `UI_DESIGN.md` -> `docs/UI_DESIGN.md`, replace `file:///` links with relative links, deduplicate env vars/auth setup/hardcoded counts, add doc guardrails to `CLAUDE.md` *(approved, merged `0ec76d9`)*
- [x] 1.9 Show real user identity (prefill + avatar + name) from Supabase: backend backfills empty `name`/`email` without overwriting saved values and enforces `https://`-only `picture_url`; shared `UserAvatar`/`UserChip` + `resolveUserIdentity` replace hardcoded `"Reader"`/`"Professional"`/`"P"` headers on `/` and `/profile`; `/profile` prefills empty fields (non-guests only, no auto-save); `becon_user_name`/`becon_user_avatar` refresh & cross-reload purge on account switch; Google OAuth uses `prompt=select_account` *(merged in `a59f089`)*
- [x] 1.10 Header cleanup: shared accessible `UserMenu` (`aria-haspopup`, `aria-expanded`, `role="menu"`/`menuitem`, Escape refocus, click-outside, arrow-key/Home/End/Tab nav, `max-w-[280px]` email truncation with `title`, guest `"Create account"` -> `/register?upgrade=1`, quiet rose `Sign out`) and shared `HeaderActions` right-side cluster (`[backLink] [ThemeToggle] [UserMenu]`, uniform `h-9` / `rounded-lg` / `gap-2`, zero overflow at 360px) adopted on `/` and `/profile` *(merged in `a59f089`)*
- [x] 1.10b Remove duplicate `ThemeToggle` from `/` coverage ribbon; right-align Prev/Next scroll buttons and add `min-w-0` on horizontal pill track *(merged in `a59f089`)*
- [x] 1.11 Fix Vercel preview build standalone failure (`ENOENT` on `.next/next-server.js.nft.json` in `onBuildComplete`): make `output: "standalone"` conditional on `!process.env.VERCEL` in `frontend/next.config.ts` while Docker keeps standalone output; add Vercel deployment notes to `README.md` *(merged in `a59f089`; note: the Vercel build works end-to-end with `1.11` plus `1.12` together)*
- [x] 1.12 Self-host fonts via `next/font/local`: bundle Latin `.woff2` files + OFL licenses under `frontend/src/app/fonts/` for `Space Grotesk` (`500, 600, 700`), `Plus Jakarta Sans` (`400, 500, 600, 700`), and editorial serif `Source Serif 4` (`400, 600, 700, 900`, resolving Task `6.6`'s missing serif); eliminates build-time Google Fonts fetches so the Vercel build works cleanly with `1.11` plus `1.12` *(merged in `a59f089`)*

*Pending manual QA (to be done post-push): email signup + verification, Google OAuth, guest upgrade, forgot/reset password, account deletion, token refresh, and `alembic upgrade head` against the Supabase dev project (RLS role check).*

*Exit: one-command local run, CI green, schema migrated, auth works end to end, data survives restart.*

---

## PHASE 2: Source registry and ingestion
- [ ] 2.1 Source registry model and admin seed script
- [ ] 2.2 Curate and seed 25-40 official developer sources (blogs, release notes, GitHub releases, advisories)
- [ ] 2.3 Fetchers: RSS/Atom, GitHub Releases API, advisories (GHSA/NVD); conditional GET; full-text extraction; sanitization
- [ ] 2.4 Scheduler (APScheduler or equivalent) with retries, backoff, per-source health, health endpoint
- [ ] 2.5 Remove Google News and dev.to as primary sources

*Exit: scheduled run fills raw_items reliably; source health visible.*

---

## PHASE 3: Dedup and classification
- [~] 3.1 Exact dedup (URL/hash) and normalization *(exact dedup done in 1.5; normalization edge cases pending)*
- [ ] 3.2 Semantic dedup with embeddings into events
- [ ] 3.3 Focus tagging via taxonomy, category (release, deprecation, security, EOL, industry)
- [ ] 3.4 Severity score (D7)

*Exit: sample evaluation shows duplicates merged and tags correct; thresholds documented.*

---

## PHASE 4: Grounded Gemini synthesis
- [ ] 4.1 Gemini key configured; strict schema; source-only prompt
- [ ] 4.2 Validation layer (schema, claim-in-source check, retry once, else flag and do not publish)
- [ ] 4.3 Rate-limit handling with backoff, caching, cost tracking
- [ ] 4.4 Evaluation set of 30+ real updates and manual review report

*Exit: quality gate passed (zero unsupported claims on the evaluation set).*

---

## PHASE 5: Personalization and briefing builder
- [ ] 5.1 Profile: profession, focus topics with versions, timezone, delivery time
- [ ] 5.2 Relevance scoring and ranking
- [ ] 5.3 Briefing builder: 5-10 cards, reading-time estimate, lead story, cached per user per day
- [ ] 5.4 Per-profession "How it affects you" variants
- [ ] 5.5 Cold-start seeded briefing and empty states

*Exit: two different profiles get clearly different, sensible briefings.*

---

## PHASE 6: Frontend completion
- [~] 6.1 Render all 4 Action Card parts and action badge on every card; card detail drawer *(committed `376852d`; compact cards omit `why_it_matters`; tracked in `6.1b`)*
- [x] 6.1b Compact cards render all 4 parts (short `why_it_matters` line), full text in `CardDrawer` *(merged in 6.8 via `4fdc08a`)*
- [x] 6.2 Remove infinite scroll and page-lift (D12); finite briefing with "you're done" end state *(committed `4afb33f`)*
- [ ] 6.3 Remove ~1,300 lines of mock fallback generators from `page.tsx`; split `page.tsx` into components
- [ ] 6.4 Onboarding rebuilt around profession plus focus (not hardcoded roles)
- [ ] 6.5 Save cards, useful/not-useful, report error, clickable topic filters, archive; drop deprecated legacy `saved_briefings` table once `saved_cards` UI ships
- [ ] 6.6 Typography (load editorial serif — *resolved in `1.12` via self-hosted Source Serif 4*), token cleanup, accessibility fixes (focus, Escape, contrast, aria; *note: Profile Menu dropdown Escape/`aria-expanded`/keyboard a11y resolved in `1.10`*)
- [ ] 6.7 Anonymous user cleanup job (30-day stale retention) and guest-to-real account upgrade flow
- [x] 6.8 UI polish pass (small fixes, NOT a redesign): compact cards 4-part rendering (6.1b), lead card dead space removal, equal-height card pinning, metadata/body text scaling & AA contrast, unified "Read source" & "Details" labels, remove full broadsheet density jargon, /profile placeholder & primary accent button & accessible tone radiogroup & live prompt counter & accurate privacy & account email copy *(approved, merged `4fdc08a`)*

*Exit: full user flow works against real data.*

---

## PHASE 7: Email digest and metrics
- [ ] 7.1 Resend with verified domain (SPF/DKIM/DMARC) (also configure custom SMTP in Supabase Auth dashboard to overcome default 30 emails/hr rate limit)
- [ ] 7.2 Digest template, per-timezone scheduling, unsubscribe, bounces
- [ ] 7.3 Event tracking and metrics view (open rate, useful ratio, cards read, retention)

*Exit: test user receives digest at chosen local time; metrics visible.*

---

## PHASE 8: Production and beta
- [ ] 8.1 Deploy staging and production (Vercel, backend host, separate Supabase production project with Cloudflare Turnstile CAPTCHA for anonymous sign-ins), secrets, backups
- [ ] 8.2 Monitoring (Sentry, uptime), security review, free-tier worker check
- [ ] 8.3 Terms, privacy policy, attribution policy
- [ ] 8.4 Landing page and waitlist
- [ ] 8.5 Onboard first 100 beta users; feedback loop
- [ ] 8.6 Telegram alerts (only if severity scoring is proven)

*Exit: MVP definition of done met.*

---

## MVP definition of done

25-40 curated official sources on a schedule; duplicates merged; every card validated and source-linked; signup to briefing in 3-5 minutes of reading; save/feedback/report-error; daily email digest; light/dark, mobile, accessible; tests and CI; staging and prod deployed; metrics recorded; legal pages and landing page live; 30-example quality gate passed.

---

## PHASE 9 (post-MVP): Creator and platform follows
- [ ] 9.1 YouTube channels (RSS/Data API), topic-gated cards
- [ ] 9.2 X/Twitter (decide on paid API cost first)
- [ ] 9.3 Instagram (feasibility study first; no legitimate way to read arbitrary accounts)

---

## LATER

Second profession vertical (for example accounting), adaptive ranking, career/hiring signals, teams and sharing, WhatsApp, payments.

---

## Update rules
1. Only the project lead marks a task `[x]`, after reviewing the Antigravity report.
2. When a task is approved, Antigravity updates this file: tick the task, set "Current task", update "Last updated", add a line to the change log.
3. New work discovered during a task is added as a new task here, never silently done.

---

## Change log

| Date | Task | Result | Notes |
| :--- | :--- | :--- | :--- |
| 2026-11-17 | 0.1, 0.2, 0.3 | Done | Audit, UI audit and repo CLAUDE.md created |
| 2026-11-17 | 1.1 | Done (`af04d7b`) | Hygiene & security guardrails implemented: .gitignore updated, obsolete DB scripts removed, settings centralized, ingest endpoint protected, guest rate-limited, token expiry fixed, personal defaults removed, prompt sanitized, test suite passing |
| 2026-11-17 | 1.1b | Partial (`0e9831d`) | Remote secrets scan, SECRET_KEY verified, local history rewritten, smoke tests passed *(remote history/UI_DESIGN drift unverified)* |
| 2026-11-17 | 1.2 | Done (`5da2a57`) | Approved by lead: Added GET /health, stdlib structured logging, requirements.lock, multi-stage Dockerfiles, docker-compose.yml, GitHub Actions CI, dev.ps1, pre-commit config, and README |
| 2026-11-17 | 1.3 | Done (`56d11d4`) | Approved by lead: Alembic migrations setup (0001 baseline + 0002 full schema), 20 application ORM tables (+ alembic_version = 21 with RLS) with UUID PKs and CHECK constraints, email deduplication on user_profiles, safe get-or-create user handling, idempotent seed data (54 topics, 2 professions), docs/DATA_MODEL.md, comprehensive test suite |
| 2026-11-17 | 1.4a/b | Done (`de4952d`, `903f769`) | Supabase Auth end-to-end: PyJWT JWKS (ES256/RS256) and HS256 fallback, user mapping, migration 0003 for nullable email and PostgreSQL RLS on all 20 application tables (+ alembic_version = 21 with RLS), retired custom JWT, added GET /api/me & DELETE /api/account, frontend AuthContext, apiFetch refresh retry, unified AuthForm, danger zone deletion, 25 Vitest tests. Approved by lead; manual browser QA of auth flows pending, to be done post-push |
| 2026-11-17 | 1.4c | Partial (`ad6b6b7`) | Post-auth cleanup and docs drift: docker-compose retired SECRET_KEY removed and Supabase variables passed through, .env.example matching CLAUDE.md Section 5, UI_DESIGN.md partially updated, AUDIT_REPORT.md historical baseline note added, README.md Supabase setup section added, CI PostgreSQL service container job added *(remote history/UI_DESIGN drift unverified)* |
| 2026-11-17 | 1.4d | Done (`7a6c521`) | Viewport fitting: created shared AuthShell, set h-dvh min-h-dvh, compacted vertical rhythm, added responsive height queries ([@media(max-height:760px)]:hidden on subtitles) so all auth pages fit within one viewport without scrollbars at 680px and 600px. Approved by lead; manual browser QA of auth flows pending, to be done post-push |
| 2026-11-17 | 1.5 | Done (`72d873c`) | Feed ingestion pipeline (backend/app/ingestion.py), exact deduplication (URL and title), durable DB persistence across sources/raw_items/events/cards/card_variants, lazy variant caching, stale-while-revalidate serving, in-memory _USER_CACHES retired, 44 passing backend tests. Approved by lead; manual browser QA of auth flows pending, to be done post-push |
| 2026-11-17 | 6.1 | In Progress (`376852d`) | Extracted 4-part card components (`LeadCard`, `RectangleCard`, `SquareCard`, `BriefCard`, `ActionBadge`, `ActionCardBody`) and `CardDrawer` (+13 Vitest tests); compact cards still omit `why_it_matters` (fix pending) |
| 2026-11-17 | 6.2 | Done (`4afb33f`) | Removed infinite scroll, wheel/touch listeners, and page-lift animation (D12); added `BRIEFING_MAX_CARDS=10`, reading-time estimate, and "You're all caught up for today" end state (+3 Vitest tests) |
| 2026-11-18 | 1.6 | Done (`74dccc7`, `695ed3e`, `d35c4dd`) | Approved by lead: Pre-push stabilization, backed up/restored dirty `page.tsx`, fixed trivial ESLint issues (12 errors/4 warnings remaining), updated `dev.ps1 test` to run backend + frontend tests, resolved high-priority doc drift, added `docs/COMPLETION_REPORT.md`, pushed `phase-6-action-cards` |
| 2026-11-18 | 1.7 | Approved, merged `a59f089` | Pre-Phase-2 hardening on `task-1.7-hardening`: aligned `/api/briefings/search` & `/api/topics/search` contracts + frontend callers, added in-process sliding-window rate limiter & daily Gemini caps with `TRUSTED_PROXIES`, gated `refresh=true` & `/api/ai/match-topics`, used `hmac.compare_digest` on `/api/ingest`, stopped auto-creating `Profession` rows, tightened CORS, added soft-delete 401 tests, updated docs/env examples |
| 2026-11-18 | 1.6b | Approved, merged `a59f089` | Supabase URL normalizer & path validation (`config.py`, `supabase_auth.py`, `supabaseClient.ts`, friendly `AuthForm` misconfiguration banner, prod fail-fast) + shared `PASSWORD_MIN_LENGTH=6` constant (login allows short existing passwords) + unit tests + `docs/AUTH.md` setup mistakes note |
| 2026-11-18 | 1.9 | Approved, merged `a59f089` | Real user identity (prefill + avatar + name) on `task-1.9-profile-prefill`: backend `map_token_to_user` backfills empty `name`/`email` without overwriting & enforces `https://`-only `picture_url`; shared `UserAvatar`/`UserChip` + `resolveUserIdentity` replace hardcoded header chips on `/` & `/profile`; `/profile` prefills empty `name`/`email` (non-guests, no auto-save); cross-reload `becon_user_name`/`becon_user_avatar` cache purge; Google OAuth `prompt=select_account` |
| 2026-11-18 | 1.10 | Approved, merged `a59f089` | Header cleanup on `task-1.10-header-usermenu`: created accessible `UserMenu` (`aria-haspopup`, `aria-expanded`, `role="menu"`/`menuitem`, Escape refocus, click-outside, arrow-key/Tab nav, `max-w-[280px]` truncated email + `title`, guest `"Create account"` -> `/register?upgrade=1`, quiet rose `Sign out`) and shared `HeaderActions` (`h-9`, `rounded-lg`, `gap-2`, responsive `← Gazette` back link) adopted on `/` and `/profile` |
| 2026-11-18 | 1.10b | Approved, merged `a59f089` | Removed duplicate inline theme toggle from `/` coverage ribbon (`task-1.10b-remove-ribbon-toggle`), right-aligned Prev/Next scroll controls with `min-w-0` pill track, added single-switch & `becon_theme` persistence tests |
| 2026-11-18 | 1.11 | Approved, merged `a59f089` | Fixed Vercel preview build failure (`task-1.11-vercel-build`): made `output: "standalone"` conditional (`process.env.VERCEL ? undefined : "standalone"`) in `frontend/next.config.ts` so Vercel's Next 16 adapter succeeds while Docker retains standalone output; added Vercel deployment notes to `README.md` |
| 2026-11-18 | 1.12 | Approved, merged `a59f089` | Self-hosted fonts via `next/font/local` (`task-1.12-self-host-fonts`): bundled Latin `.woff2` files + OFL 1.1 licenses under `frontend/src/app/fonts/` for `Space Grotesk`, `Plus Jakarta Sans`, and editorial serif `Source Serif 4` (also closing Task `6.6`'s missing editorial serif) so Vercel builds make zero Google Fonts fetches |
| 2026-11-18 | 1.8a | Approved, merged `0ec76d9` | Documentation consolidation (`task-1.8a-docs`): folded <=10-line audit baseline into `ROADMAP.md`, removed `AUDIT_REPORT.md`, `docs/COMPLETION_REPORT.md`, untracked `docs/MERGE_READINESS_REPORT.md`, and `frontend/README.md`, moved & refreshed `UI_DESIGN.md` -> `docs/UI_DESIGN.md`, eliminated all `file:///` links & duplicated env/count prose, added no-new-`.md`/chat-report rules to `CLAUDE.md`, ticked merged Phase 1 tasks (`1.6b`–`1.12`) |
| 2026-11-18 | 1.7b | Approved, merged `e4f8b2e` | Pre-`GEMINI_API_KEY` spend/abuse hardening (`task-1.7b-gemini-hardening`): DB-only unauthenticated `/api/briefings/search` & `/api/briefings`, `422` caps on `interests`/`role`/`custom_prompt`/`ChatRequest`, shared `CardVariant` isolated from `custom_prompt` & unauthenticated triggers, configurable `max_output_tokens`, once-per-logical-request retry quota accounting, stricter guest limits & all-guests pool cap, per-run ingest budget (`INGEST_MAX_GEMINI_CALLS_PER_RUN`), fake-Gemini test suite & docs |
| 2026-11-19 | 6.8, 6.1b | Approved, merged `4fdc08a` | UI polish pass & 4-part compact cards (`task-6.8-ui-polish`): 6.1b compact cards `why_it_matters` (line-clamp 2), lead card dead space removed, equal-height card pinning, metadata/body scaling & AA contrast, unified "Read source" & "Details" labels, broadsheet banner replaced, accessible tone radiogroup & live prompt counter & accurate privacy/account copy |
