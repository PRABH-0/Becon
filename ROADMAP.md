# BECON ROADMAP AND PROGRESS TRACKER

Single source of truth for where the project stands. Lives in the repo root. Maintained by the project lead (Claude chat) and updated by Antigravity after each approved task.

Last updated: 2026-11-17  
Current phase: 1 (Foundation)  
Current task: 1.2 Tooling (pytest, ruff, CI, Docker, logging)  

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

Backend runs, UI polished, tsc clean. Gaps: Gemini inactive (template fallbacks served), nothing persisted (in-memory cache only), sources are Google News/dev.to not official, main feed omits "How it affects you" and "What to do next", infinite scroll present, unauthenticated ingest/guest endpoints, no migrations, no tests/CI/Docker/scheduler, duplicate user rows, two auth systems.

---

## PHASE 0: Discovery (DONE)
- [x] 0.1 Repo audit (`AUDIT_REPORT.md`)
- [x] 0.2 UI audit (`UI_DESIGN.md`)
- [x] 0.3 Repo `CLAUDE.md` for agents

---

## PHASE 1: Foundation
- [x] 1.1 Hygiene and security guardrails (secrets check, central config, protect `/api/ingest`, rate-limit guest, JWT expiry fix, remove personal defaults, prompt-injection hardening, first tests)
- [ ] 1.2 Tooling: pytest and ruff setup, GitHub Actions CI, Dockerfile and docker-compose, structured logging
- [ ] 1.3 Alembic and full schema: professions, focus_topics (aliases, versions), sources, raw_items, events, cards, card_variants, user_follows, saved_cards (with user link), feedback, error_reports, deliveries, metrics_events; unique email
- [ ] 1.4 Auth consolidated on Supabase Auth: email/password plus Google, verification, reset, account deletion; retire custom JWT and guest hack; dedupe login/register pages
- [ ] 1.5 Persist cards and events in the database; replace in-memory `_USER_CACHES`

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
- [ ] 3.1 Exact dedup (URL/hash) and normalization
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
- [ ] 6.1 Render all 4 Action Card parts and action badge on every card; card detail drawer
- [ ] 6.2 Remove infinite scroll and page-lift (D12); finite briefing with "you're done" end state
- [ ] 6.3 Remove ~1,300 lines of mock fallback generators from `page.tsx`; split `page.tsx` into components
- [ ] 6.4 Onboarding rebuilt around profession plus focus (not hardcoded roles)
- [ ] 6.5 Save cards, useful/not-useful, report error, clickable topic filters, archive
- [ ] 6.6 Typography (load editorial serif), token cleanup, accessibility fixes (focus, Escape, contrast, aria)

*Exit: full user flow works against real data.*

---

## PHASE 7: Email digest and metrics
- [ ] 7.1 Resend with verified domain (SPF/DKIM/DMARC)
- [ ] 7.2 Digest template, per-timezone scheduling, unsubscribe, bounces
- [ ] 7.3 Event tracking and metrics view (open rate, useful ratio, cards read, retention)

*Exit: test user receives digest at chosen local time; metrics visible.*

---

## PHASE 8: Production and beta
- [ ] 8.1 Deploy staging and production (Vercel, backend host, Supabase), secrets, backups
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
| 2026-11-17 | 1.1b | Done (`0e9831d`) | Remote secrets scan, SECRET_KEY verified, local history safely rewritten to remove unredacted report commits, smoke tests passed |
