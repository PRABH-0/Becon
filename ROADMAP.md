# BECON ROADMAP AND PROGRESS TRACKER

Single source of truth for where the project stands. Lives in the repo root. Maintained by the project lead (Claude chat) and updated by Antigravity after each approved task.

Last updated: 2026-11-26  
Current phase: Fast-track MVP  
Current task: Launch Sprint (S1-S6)  

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
- [~] 1.1b [DEFERRED] Remote secrets scan and local history rewrite *(remote history scrub unverified)*
- [x] 1.2 Tooling: pytest and ruff setup, GitHub Actions CI, Dockerfile and docker-compose, structured logging
- [x] 1.3 Alembic and full schema: professions, focus_topics (aliases, versions), sources, raw_items, events, cards, card_variants, user_follows, saved_cards (with user link), feedback, error_reports, deliveries, metrics_events; unique email
- [x] 1.4 Auth consolidated on Supabase Auth: email/password plus Google, verification, reset, account deletion; retire custom JWT and guest hack; dedupe login/register pages
- [~] 1.4c [DEFERRED] Post-auth cleanup and docs drift: docker-compose cleanup, .env.example matching CLAUDE.md, docs/UI_DESIGN.md and README.md updated, CI PostgreSQL service container job added *(remote history verification still open under 1.1b)*
- [x] 1.4d Viewport fitting: auth pages fit within one viewport without scrollbars via AuthShell and responsive height queries
- [x] 1.5 Persist cards and events in the database; replace in-memory `_USER_CACHES`
- [x] 1.6 Pre-push stabilization: back up and discard dirty `page.tsx` diff, verify green `tsc`/`test`/`build`, fix trivial ESLint errors, update `dev.ps1 test` to run frontend + backend tests, fix high-priority doc drift, commit & push *(approved; commits `74dccc7`, `695ed3e`, `d35c4dd`)*
- [x] 1.6b Supabase URL misconfiguration handling (normalize trailing slash, reject non-root paths like `/rest/v1` & `/auth/v1`, fail fast in prod, friendly `AuthForm` error) + lower signup/reset password min length to 6 via shared `PASSWORD_MIN_LENGTH` constant (login allows short existing passwords) *(merged in `a59f089`)*
- [x] 1.7 Pre-Phase-2 hardening: fix `/api/search-topic` and `/api/topic-search` vs `/api/briefings/search` contract, add `/api/topics/search`, in-process rate limiting & daily Gemini caps with `TRUSTED_PROXIES`, `hmac.compare_digest` for ingest token, gate `refresh=true` and `/api/ai/match-topics`, tighten CORS, test for soft-delete 401, stop auto-creating `Profession` rows *(merged in `a59f089`)*
- [x] 1.7b Close Gemini spend/abuse holes (pre-`GEMINI_API_KEY` hardening): unauthenticated `/api/briefings/search` & `/api/briefings` strictly DB-only (`422` caps on `interests`/`role`/`custom_prompt`/`ChatRequest`, `live=true` auth-gated), shared `CardVariant` isolated from `custom_prompt` & unauthenticated generation, configurable `max_output_tokens` on all Gemini calls, retries capped at 1 & counted once per logical request (unreached failures consume 0), stricter guest limits (`GUEST_AI_PER_MIN`, `GEMINI_DAILY_CAP_GUEST`, `GEMINI_DAILY_CAP_ALL_GUESTS`), per-run ingest budget (`INGEST_MAX_GEMINI_CALLS_PER_RUN`), docs & fake-Gemini test suite *(approved, merged `e4f8b2e`)*
- [x] 1.8 Frontend ESLint cleanup: 0 errors/warnings on `npm run lint`, CI `continue-on-error: true` removed (`ci.yml` strictly enforces ESLint) *(completed in sprint-launch)*
- [x] 1.8a Documentation consolidation: fold concise baseline into `ROADMAP.md`, remove superseded report files (`AUDIT_REPORT.md`, `docs/COMPLETION_REPORT.md`, `docs/MERGE_READINESS_REPORT.md`, `frontend/README.md`), move & refresh `UI_DESIGN.md` -> `docs/UI_DESIGN.md`, replace `file:///` links with relative links, deduplicate env vars/auth setup/hardcoded counts, add doc guardrails to `CLAUDE.md` *(approved, merged `0ec76d9`)*
- [x] 1.9 Show real user identity (prefill + avatar + name) from Supabase: backend backfills empty `name`/`email` without overwriting saved values and enforces `https://`-only `picture_url`; shared `UserAvatar`/`UserChip` + `resolveUserIdentity` replace hardcoded `"Reader"`/`"Professional"`/`"P"` headers on `/` and `/profile`; `/profile` prefills empty fields (non-guests only, no auto-save); `becon_user_name`/`becon_user_avatar` refresh & cross-reload purge on account switch; Google OAuth uses `prompt=select_account` *(merged in `a59f089`)*
- [x] 1.10 Header cleanup: shared accessible `UserMenu` (`aria-haspopup`, `aria-expanded`, `role="menu"`/`menuitem`, Escape refocus, click-outside, arrow-key/Home/End/Tab nav, `max-w-[280px]` email truncation with `title`, guest `"Create account"` -> `/register?upgrade=1`, quiet rose `Sign out`) and shared `HeaderActions` right-side cluster (`[backLink] [ThemeToggle] [UserMenu]`, uniform `h-9` / `rounded-lg` / `gap-2`, zero overflow at 360px) adopted on `/` and `/profile` *(merged in `a59f089`)*
- [x] 1.10b Remove duplicate `ThemeToggle` from `/` coverage ribbon; right-align Prev/Next scroll buttons and add `min-w-0` on horizontal pill track *(merged in `a59f089`)*
- [x] 1.11 Fix Vercel preview build standalone failure (`ENOENT` on `.next/next-server.js.nft.json` in `onBuildComplete`): make `output: "standalone"` conditional on `!process.env.VERCEL` in `frontend/next.config.ts` while Docker keeps standalone output; add Vercel deployment notes to `README.md` *(merged in `a59f089`; note: the Vercel build works end-to-end with `1.11` plus `1.12` together)*
- [x] 1.12 Self-host fonts via `next/font/local`: bundle Latin `.woff2` files + OFL licenses under `frontend/src/app/fonts/` for `Space Grotesk` (`500, 600, 700`), `Plus Jakarta Sans` (`400, 500, 600, 700`), and editorial serif `Source Serif 4` (`400, 600, 700, 900`, resolving Task `6.6`'s missing serif); eliminates build-time Google Fonts fetches so the Vercel build works cleanly with `1.11` plus `1.12` *(merged in `a59f089`)*

*Pending manual QA (to be done post-push): email signup + verification, Google OAuth, guest upgrade, forgot/reset password, account deletion, token refresh, and `alembic upgrade head` against the Supabase dev project (RLS role check).*

*Exit: one-command local run, CI green, schema migrated, auth works end to end, data survives restart.*

---

## FAST-TRACK MVP (F1 – F8)

Approved code-first fast-track sequence delivering an end-to-end working briefing product:  
**F1 -> F3 -> F2 -> F4 -> F5 -> F6 -> F7 -> F8**.  
*Deferred (do not touch until MVP complete):* CI polish, Docker polish, ESLint 1.8 cleanup, history scrub (1.1b), docs drift (1.4c), monitoring (8.2), legal pages (8.3), landing page & waitlist (8.4), metrics dashboards (7.3), Telegram alerts (8.6), Phase 9 creator follows.

- [x] **F1: Pipeline bridge + real data + remove mocks**  
  *Goal:* Dev DB migrated & seeded (38 official feeds), remove Google News/dev.to, bridge `fetch_and_store_source` raw_items to events/cards, delete frontend mock generators & show clean empty state.  
  *Acceptance:* Zero "news.google"/"dev.to" feed refs, live DB has 38 sources and >0 raw_items & events after one run, mock generators gone from page.tsx, tests green.
- [~] **F3: Grounded Gemini synthesis & claim validation**  
  *Goal:* Live `GEMINI_API_KEY`, source-only prompt with `<untrusted_source>` injection guard, schema validation + claim-in-source check, flag-on-failure.  
  *Acceptance:* Real cards generated from official source text, 0 hallucinations on spot check, unvalidated cards marked flagged/unpublishable. *(Partial: awaiting live Gemini verification by lead)*
- [x] **F2: Title normalization, alias-based tagging & simple severity**  
  *Goal:* Strip title noise, map raw items to `FocusTopic` via keyword/alias taxonomy, compute 0–100 severity score.  
  *Acceptance:* Normalized titles, events tagged with DB topics, severity formula scores CVE/breaking/recency accurately. Fallback cards set to unvalidated.
- [x] **F4: Relevance ranking & daily briefing builder**  
  *Goal:* Score cards against user's profession + focus topics, select daily Lead Story, cap 5–10 cards, cache per user per UTC day.  
  *Acceptance:* Topic & alias matched cards ranked higher than generic cards, lead card designated, daily cached briefing served.
- [x] **F4.1: Briefing quality fixes**  
  *Goal:* Relevance floor (cap generic cards at 2), suppress/penalize prereleases, bare version title canonicalization.  
  *Acceptance:* Matched cards prioritized, rc/beta suppressed/penalized, bare versions like "22.2.6" prefixed to "Angular 22.2.6".
- [x] **F5: Frontend component split & profession/focus onboarding**  
  *Goal:* Decompose `page.tsx` into clean components (<400 lines), rebuild onboarding wizard around DB professions and focus topics.  
  *Acceptance:* `page.tsx` is 241 lines, 4-step DB-driven onboarding connects to `/api/professions` & `/api/topics/search`, Gemini chat dependency removed.
- [x] **F6: Card actions (Save, Feedback, Error Reporting)**  
  *Goal:* Enable interactive actions on Action Cards backed by DB tables, with optimistic UI updates and finite /saved page.  
  *Acceptance:* Save to `saved_cards`, thumbs feedback to `card_feedback`, report error to `error_reports`, `/saved` page with finite pagination.
- [x] **F4.2: Small fixes (DB-driven default profession, extended prerelease matching, normalizer prefix fix)**  
  *Goal:* DB-driven cold start default via `is_default` boolean on professions (migration 0009), extend prerelease matching (next, canary, dev, snapshot, pre, insiders), strip noise prefixes in normalizer while preserving "What's new in".  
  *Acceptance:* Zero hardcoded profession slugs in code, prerelease patterns detected & penalized, backfill preserves "What's new in".
- [x] **F3.1: Production synthesis queue, scheduler job, and limited-briefing fallback**  
  *Goal:* Prioritized background synthesis queue (severity DESC, published_at DESC, topic_count DESC), daily/per-run quota enforcement, retry-once, clean Gemini backoff without flagging, scheduler job, CLI `app.synthesize`, `dev.ps1 synthesize`, `GET /api/synthesis/status`, and calm limited-today briefing fallback.  
  *Acceptance:* Production serves only validated non-fallback cards, queue synthesizes highest-value events first, CLI & endpoint return live counts, UI shows limited-today banner when <3 cards.
- [x] **F7: Daily email digest via Resend**  
  *Goal:* Responsive 4-part HTML + ASCII plain-text daily briefing email sent via Resend API matching user morning schedule, RFC 8058 one-click and web unsubscribe flows, bounce/complaint webhook handling, and delivery idempotency.  
  *Acceptance:* Responsive 4-part card email received by test recipient, unsubscribe functions correctly with token verification, deliveries table prevents duplicate sends.
- [ ] **F8: Basic production deployment**  
  *Goal:* Deploy Next.js to Vercel and FastAPI to cloud host with Supabase PostgreSQL.  
  *Acceptance:* Live web signup -> onboarding -> real Gemini-synthesized daily briefing works end-to-end.

---

## PHASE 2: Source registry and ingestion
- [x] 2.1 Source registry model and admin seed script (approved, merged `b98f9dd`)
- [x] 2.2 Curate and seed 25-40 official developer sources (blogs, release notes, GitHub releases, advisories) (approved, merged `b98f9dd`)
- [x] 2.3 Fetchers: RSS/Atom, GitHub Releases API, advisories (GHSA/NVD); conditional GET; full-text extraction; sanitization (approved, merged `85cbd62`)
- [x] 2.4 Scheduler (APScheduler or equivalent) with retries, backoff, per-source health, health endpoint (approved, merged `29aca4e`)
- [x] 2.5 Remove Google News and dev.to as primary sources *(completed in F1, confirmed in audit)*

*Exit: scheduled run fills raw_items reliably; source health visible.*

---

## PHASE 3: Dedup and classification
- [~] 3.1 Exact dedup (URL/hash) and normalization *(exact dedup done in 1.5; normalization edge cases pending)*
- [ ] 3.2 Semantic dedup with embeddings into events
- [x] 3.3 Focus tagging via taxonomy, category (release, deprecation, security, EOL, industry) *(completed in F2/F2.1)*
- [x] 3.4 Severity score (D7) *(completed in F2/F2.1; modified date used for NVD recency, CISA KEV scored separately)*

*Exit: sample evaluation shows duplicates merged and tags correct; thresholds documented.*

---

## PHASE 4: Grounded Gemini synthesis
- [~] 4.1 Gemini key configured; strict schema; source-only prompt *(partially covered by F3; pending live verification by lead)*
- [~] 4.2 Validation layer (schema, claim-in-source check, retry once, else flag and do not publish) *(partially covered by F3; pending live verification by lead)*
- [~] 4.3 Rate-limit handling with backoff, caching, cost tracking *(partially covered by F3; pending live verification by lead)*
- [ ] 4.4 Evaluation set of 30+ real updates and manual review report

*Exit: quality gate passed (zero unsupported claims on the evaluation set).*

---

## PHASE 5: Personalization and briefing builder
- [x] 5.1 Profile: profession, focus topics with versions, timezone, delivery time *(completed in F5)*
- [x] 5.2 Relevance scoring and ranking *(completed in F4/F4.1)*
- [x] 5.3 Briefing builder: 5-10 cards, reading-time estimate, lead story, cached per user per day *(completed in F4)*
- [ ] 5.4 Per-profession "How it affects you" variants
- [x] 5.5 Cold-start seeded briefing and empty states *(completed in F4/F4.1)*

*Exit: two different profiles get clearly different, sensible briefings.*

---

## PHASE 6: Frontend completion
- [~] 6.1 Render all 4 Action Card parts and action badge on every card; card detail drawer *(committed `376852d`; compact cards omit `why_it_matters`; tracked in `6.1b`)*
- [x] 6.1b Compact cards render all 4 parts (short `why_it_matters` line), full text in `CardDrawer` *(merged in 6.8 via `4fdc08a`)*
- [x] 6.2 Remove infinite scroll and page-lift (D12); finite briefing with "you're done" end state *(committed `4afb33f`)*
- [x] 6.3 Remove ~1,300 lines of mock fallback generators from `page.tsx`; split `page.tsx` into components *(page.tsx is 241 lines, components under `frontend/src/components/briefing/`)*
- [x] 6.4 Onboarding rebuilt around profession plus focus (not hardcoded roles) *(completed in F5)*
- [x] 6.5a Save cards, useful/not-useful feedback, report error modal, and /saved cards view *(completed in F6)*
- [ ] 6.5b Clickable topic filters, archive search over stored cards (DB-only, no Gemini), drop deprecated legacy `saved_briefings` table
- [ ] 6.6 Typography (load editorial serif — *resolved in `1.12` via self-hosted Source Serif 4*), token cleanup, accessibility fixes (focus, Escape, contrast, aria; *note: Profile Menu dropdown Escape/`aria-expanded`/keyboard a11y resolved in `1.10`*)
- [ ] 6.7 Anonymous user cleanup job (30-day stale retention) and guest-to-real account upgrade flow
- [x] 6.8 UI polish pass (small fixes, NOT a redesign): compact cards 4-part rendering (6.1b), lead card dead space removal, equal-height card pinning, metadata/body text scaling & AA contrast, unified "Read source" & "Details" labels, remove full broadsheet density jargon, /profile placeholder & primary accent button & accessible tone radiogroup & live prompt counter & accurate privacy & account email copy *(approved, merged `4fdc08a`)*
- [x] 6.9 Remove home-page topic search UI and backend route; plan DB-only archive search under 6.5 after Phase 2 (approved, merged `b98f9dd`)

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
| 2026-11-19 | 6.9 | Approved, merged `b98f9dd` | Home-page search investigation & removal (`task-2.1-source-registry`): removed search input/states/handlers/pagination from `/`, restored clean finite broadsheet header, removed `/api/briefings/search` route, `search_topic_briefings` & `BriefingSearchResponse`, upheld 1.7b Gemini hardening guarantees on remaining endpoints, added 404 test, deferred DB-only archive search to 6.5 |
| 2026-11-19 | 2.1, 2.2 | Approved, merged `b98f9dd` | Source registry & curated official sources (DATA ONLY, `task-2.1-source-registry`): migration 0004 for `source_professions` join table with PostgreSQL RLS, `Source` model synonyms (`homepage_url`, `source_type`, `poll_interval_minutes`, `is_active`), `SourceSeedItem` Pydantic v2 DTO with https enforcement, 38 live-verified official developer feeds in `sources.json`, idempotent seeder, offline test suite + marker-gated network test |
| 2026-11-19 | 2.3 | Approved, merged `85cbd62` | Fetchers framework (RSS/Atom, GitHub Releases, advisory APIs): safe httpx client with SSRF guards, conditional GET, plain-text sanitization, raw_items metadata column (migration 0005), GHSA/CISA KEV/NVD advisory fetchers, runner and dev.ps1 fetch |
| 2026-11-19 | 2.4 | Approved, merged `29aca4e` | Scheduler worker, retries/exponential backoff, per-source health, health endpoint (`task-2.4-scheduler`): migration 0006 for status/next_fetch_at/lease columns, asyncio scheduler worker engine (`python -m app.scheduler`, `dev.ps1 scheduler`, docker-compose service), atomic DB leasing & expired lease reclaim, 45s per-source timeout & concurrency semaphores, consecutive failure tracking & backoff with Retry-After, GET /api/sources/health endpoint with X-Ingest-Token protection & slowapi rate limiting, CLI `--status` & `--once` flags, 11 deterministic offline tests |
| 2026-11-20 | F1 | Done (`a5075bd`) | Approved by lead: Migrations 0001-0006 applied, 41 sources seeded in becon.db, Google News/dev.to removed, pipeline bridged to deduplicated events & cards, mock generators removed from page.tsx, clean empty state, live fetch executed (538 raw items, 535 events, 535 cards) |
| 2026-11-20 | F3 | Partial (`a5075bd`) | Grounded Gemini synthesis & claim validation: source-only prompt with <untrusted_source>, entity check validator, backfill CLI, rate-limit/quota handling; pending live Gemini verification by lead |
| 2026-11-20 | F2 | Done (`a5075bd`) | Normalization, alias-based focus tags, category, simple severity (0-100), fallback cards set to unvalidated, live DB backfilled (559 events, 559 fallback cards unvalidated) |
| 2026-11-23 | F2.1 | Done (`5374477`) | Tag precision fix: word boundary + alias token matching, decoupled version extraction, deduplicated canonical alias terms, strict body threshold, source prior boost, cap at 4 tags, is_primary flag; live DB backfilled (709 tags, 1.26 avg/event, 6.8% untagged) |
| 2026-11-23 | F4 | Done (`6f78640`) | Relevance ranking & daily briefing builder: personalized scoring (topic, profession, severity, recency, version boost), max 2 cards per source diversity, lead story selection, reading time estimate, cold-start fallback, daily DB caching in daily_briefings (migration 0008), cache invalidation on profile update, zero Gemini calls for guests |
| 2026-11-23 | F4.1 | Done (`3bd55e6`) | Briefing quality: relevance floor (cap generic cards at 2), suppress prereleases when final release exists and apply score penalty/lead prohibition, bare-version title prefixing with source name; live DB backfilled (110 bare version titles canonicalized) |
| 2026-11-23 | F5 | Done (`e6af673`) | Frontend component split & DB-driven onboarding: split page.tsx to 241 lines via extracted briefing components (TopShowcase, BentoDeck, CoverageRibbon, BriefingHeader, BriefingEndState) and useBriefing hook; rebuilt 4-step onboarding wizard around /api/professions & /api/topics/search; deleted AI onboarding chat dependency |
| 2026-11-23 | F6 | Done (`916a9bc`) | Card actions & saved page: POST/DELETE /api/cards/{id}/save, GET /api/saved with finite pagination, POST /api/cards/{id}/feedback (+1/-1 toggle/upsert), POST /api/cards/{id}/report with rate limit & deduplication, BriefingCard annotated with is_saved & my_feedback, compact SaveButton on cards, action bar in CardDrawer, accessible ReportModal, /saved page |
| 2026-11-23 | F4.2 | Done (`9798693`) | Small quality fixes: migration 0009 for `is_default` boolean on professions table, DB-driven cold-start fallback in briefing service (zero hardcoded strings), extended prerelease regex (next, canary, dev, snapshot, pre, insiders), title normalizer strips noise prefixes ("Announcing", "Release:", "Introducing") while preserving "What's new in", ROADMAP 6.5 split into 6.5a/6.5b |
| 2026-11-23 | F3.1 | Done (`4220110`) | Production synthesis queue: background queue selecting eligible events ordered by severity/recency/topics, respects daily global and per-run caps, retry-once on invalid claims, clean quota backoff without flagging cards, CLI `python -m app.synthesize`, `dev.ps1 synthesize`, scheduler integration, GET /api/synthesis/status endpoint, and limited-today production briefing fallback banner |
| 2026-11-23 | F7 | Done (`29d8361`) | Daily email digest via Resend: responsive 4-part HTML table layout + ASCII broadsheet plain-text fallback, strict HTML escaping, HMAC-SHA256 token signer/verifier, GET & POST /api/unsubscribe (RFC 8058 one-click), POST /api/webhooks/resend bounce/complaint handling, POST /api/digest/preview endpoint, delivery scheduler batch with timezone support, frontend /unsubscribe page & profile digest settings, 0 ESLint errors |
| 2026-11-26 | S1, S2, S3 | Done (`e673fda`, `42cba4c`) | Launch Sprint S1-S3: UserProfile.daily_briefings cascade delete on delete_account (migration 0010), scheduler timeout test flakiness fixed, synthesis queue restricted to last 14 days and tagged events (backlog 55), ROADMAP / BECON / UI_DESIGN doc sync |
