# Becon Authentication & Identity Architecture

This document specifies the authentication and authorization model for Becon.

In accordance with **Decision D3**, **Supabase Auth is the single identity system** across both development and production. The custom local JWT issuance and verification system (`app/auth.py`, `/api/register`, `/api/login`, `/api/auth/guest`, `/api/auth/supabase-sync`) has been retired.

---

## 1. Authentication Flow & Sequence Diagram

The browser client authenticates directly with Supabase Auth (via email/password, Google OAuth, or anonymous guest sign-in). The client sends the returned Supabase Access Token (a signed JWT) in the standard HTTP `Authorization: Bearer <token>` header to the Becon FastAPI backend.

The backend verifies the token and maps it to a local row in the `user_profiles` database table using the Supabase user UUID (`external_auth_id`).

```mermaid
sequenceDiagram
    autonumber
    actor User as User / Browser
    participant Supabase as Supabase Auth (Cloud / Self-hosted)
    participant Backend as Becon Backend (FastAPI)
    participant DB as Becon Database (PostgreSQL / SQLite)

    %% 1. Sign In
    User->>Supabase: 1. Sign In / Register / Anonymous Guest
    Note over User,Supabase: Email+Password, Google OAuth, or signInAnonymously()
    Supabase-->>User: 2. Return Supabase Session (access_token JWT, refresh_token)

    %% 2. Authenticated API Call
    User->>Backend: 3. Request (e.g. GET /api/me)<br/>Header "Authorization: Bearer <access_token>"

    %% 3. Token Verification
    critical Token Verification
        Backend->>Backend: Check header format (Bearer token)
        Backend->>Supabase: Fetch JWKS (cached 10 min, max 1 refetch/min on unknown kid)
        Backend->>Backend: Verify signature (ES256/RS256 via JWKS or HS256 via secret)
        Backend->>Backend: Validate claims (aud=authenticated, iss={SUPABASE_URL}/auth/v1, exp leeway=10s, sub is UUID)
    end

    %% 4. User Mapping
    critical User Mapping (app.deps.get_current_user)
        Backend->>DB: Query user_profiles WHERE external_auth_id = sub
        alt User Exists
            DB-->>Backend: Return UserProfile
        else First Visit (Not Yet in DB)
            alt Has Email & Legacy User Exists with external_auth_id IS NULL
                Backend->>DB: UPDATE user_profiles SET external_auth_id = sub WHERE email = lower(email)
                DB-->>Backend: Linked Legacy User
            else New User (or Anonymous)
                Backend->>DB: INSERT INTO user_profiles (external_auth_id, email, is_anonymous, ...)
                DB-->>Backend: Created UserProfile
            end
        end
        Backend->>Backend: Check deleted_at IS NULL (reject 401 if soft-deleted)
    end

    %% 5. Response
    Backend-->>User: 4. HTTP 200 OK (UserProfile payload)
```

---

## 2. Environment Variables & Secret Storage

For the canonical list of backend and frontend environment variables (names, scope, and defaults), see [`CLAUDE.md` — Section 5](../CLAUDE.md#5-environment-variables).

> [!IMPORTANT]
> - **Never** expose `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_JWT_SECRET` to the frontend or git.
> - In `production`, `SUPABASE_URL` is mandatory on the backend and must be a bare project root URL; the backend fails fast at startup if it is missing or contains a path.
> - In `development`, if `SUPABASE_URL` is unset or misconfigured, protected backend endpoints return `503 Service Unavailable` with a clear actionable error message.

### Common Setup Mistakes
- **Including a path in `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`:** Both variables **must** be the bare project root (e.g. `https://<ref>.supabase.co`, no `/rest/v1`, `/auth/v1`, or other path). Copying the Data API URL (`.../rest/v1`) causes Supabase Auth to request `.../rest/v1/auth/v1/signup` (`404 PGRST125`) and breaks Google OAuth (`No API key found in request`). Trailing slashes are stripped automatically; any non-root path is rejected with a clear error.
- **Forgetting to restart dev servers after editing `.env` / `.env.local`:** Next.js (`npm run dev`) and FastAPI (`uvicorn`) read environment files at startup. Always restart both dev servers after modifying `frontend/.env.local` or `backend/.env`.

---

## 3. Supabase Dashboard Configuration Checklist

To configure your Supabase project for Becon:

1. **Authentication $\rightarrow$ Providers $\rightarrow$ Email**:
   - [x] Enable Email provider.
   - [x] **Confirm email**: Enable (requires users to verify their email before first sign-in).
   - [x] Secure email change: Enable.
2. **Authentication $\rightarrow$ Providers $\rightarrow$ Anonymous Sign-Ins**:
   - [x] **Enable Anonymous Sign-Ins**: Turned ON (enables instantaneous zero-friction guest mode for new users without passwords).
3. **Authentication $\rightarrow$ URL Configuration**:
   - [x] **Site URL**: `http://localhost:3000` (development) or production domain.
   - [x] **Redirect URLs**:
     - `http://localhost:3000/auth/callback`
     - `http://localhost:3000/auth/reset-password`
     - Production equivalents when deployed.
4. **Authentication $\rightarrow$ Providers $\rightarrow$ Google (Optional)**:
   - Configure Google Client ID and Client Secret in the Supabase Dashboard (not on the Becon backend).
   - Add authorized redirect URI in Google Cloud Console: `https://<supabase-project-id>.supabase.co/auth/v1/callback`.
5. **API Settings $\rightarrow$ JWT Verification**:
   - Verify whether your project signs tokens with **Asymmetric Keys (ES256 or RS256)** or **Symmetric Secret (HS256)**.
   - If using asymmetric keys (standard for modern Supabase projects), leave `SUPABASE_JWT_SECRET` unset; the backend verifies tokens via JWKS automatically.
   - If using legacy HS256, set `SUPABASE_JWT_SECRET` from **Settings $\rightarrow$ API $\rightarrow$ JWT Secret**.

---

## 4. User Account Linking & Deletion Architecture

### User Mapping Rules (`app.deps.map_token_to_user`)
1. **Direct Match:** Search `user_profiles` where `external_auth_id == sub`. If found, return user.
2. **Legacy User Migration:** If not found and token contains an `email`:
   - Search `user_profiles` by lowercase email.
   - If found with `external_auth_id IS NULL`, link it to this `sub`.
   - If found with a *different* `external_auth_id`, reject with `409 Conflict` (prevent account takeover).
3. **New User Creation:**
   - Anonymous users: `is_anonymous=True`, `email=None`.
   - Authenticated users: `is_anonymous=False`, `email=lowercase(email)`, name from `user_metadata.full_name`.
4. **Concurrency Handling:** If a race occurs on first login, catch `IntegrityError`, rollback session, and re-query by `external_auth_id`.
5. **Soft-Delete Guard:** If `deleted_at` is set, reject with `401 Unauthorized` ("Account has been deleted").

### Account Deletion (`DELETE /api/account`)
Per GDPR/privacy rights and technical hygiene:
1. Client issues `DELETE /api/account` with Supabase Bearer token.
2. Backend calls Supabase Admin API:
   `DELETE {SUPABASE_URL}/auth/v1/admin/users/{sub}` with `apikey: {SUPABASE_SERVICE_ROLE_KEY}`.
3. If Supabase returns an error (4xx/5xx), backend halts and returns `502 Bad Gateway`, leaving the local user record intact.
4. If Supabase successfully deletes the user:
   - Backend deletes the local `user_profiles` row.
   - Database foreign key constraints cascade deletion to `saved_cards`, `user_follows`, `card_feedback`, `deliveries`, and `metrics_events`.
   - Backend returns `204 No Content`.

---

## 5. Row Level Security (RLS) on PostgreSQL

The Supabase project exposes a PostgREST Data API on `/rest/v1`. Because the Supabase anon key is public in the browser:
- Migration `0003_supabase_auth_rls` executes `ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;` on all application tables and `alembic_version` in PostgreSQL (see [DATA_MODEL.md](DATA_MODEL.md)).
- With zero policies defined, **all direct queries via PostgREST using the anon or authenticated roles are denied by default**.
- The Becon backend connects directly using the PostgreSQL connection string (`DATABASE_URL`) as the database owner, which **bypasses RLS by default**.
- This guarantees that client applications cannot bypass FastAPI business logic or read/write arbitrary tables directly via Supabase.

---

## 6. Frontend Authentication Architecture (Phase 1.4b)

The frontend client application uses a layered auth architecture:

```mermaid
flowchart TD
    subgraph Browser ["Next.js App Router Client"]
        SC["supabaseClient.ts\n(Lazy Singleton)"]
        AC["AuthContext.tsx\n(onAuthStateChange)"]
        AF["apiFetch (lib/api.ts)\nBearer Token Injection & 401 Refresh"]
        RA["RequireAuth.tsx\nRoute Protection"]
        UI["Pages & Views\n(/, /profile, /onboarding)"]
    end

    subgraph Supabase ["Supabase Auth Service"]
        SAuth["Auth Endpoints\n(PKCE, Email, OAuth, Anon)"]
        JWKS["JWKS Public Keys\n(/.well-known/jwks.json)"]
    end

    subgraph FastAPI ["Becon FastAPI Backend"]
        Verify["Token Verifier\n(verify_supabase_token)"]
        Deps["app.deps.get_current_user\n(User Profile Resolution)"]
        Endpoints["Protected Endpoints\n(/api/me, /api/profile, /api/account)"]
    end

    UI --> RA
    RA --> AC
    AC --> SC
    SC <--> SAuth
    UI --> AF
    AF --> SC
    AF -- "Authorization: Bearer <JWT>" --> FastAPI
    FastAPI --> Verify
    Verify <--> JWKS
    Verify --> Deps
    Deps --> Endpoints
```

### Core Components
1. **Lazy Supabase Client (`lib/supabaseClient.ts`)**: Initializes `@supabase/supabase-js` with `persistSession: true`, `autoRefreshToken: true`, and `detectSessionInUrl: true`. Fails gracefully during build time if environment variables are missing.
2. **`AuthContext` (`context/AuthContext.tsx`)**: Global provider that listens to `onAuthStateChange` events (`SIGNED_IN`, `SIGNED_OUT`, `TOKEN_REFRESHED`, `USER_UPDATED`). Exposes session state, anonymous flag, user metadata, and methods (`signInWithPassword`, `signUpWithPassword`, `signInWithGoogle`, `signInAsGuest`, `signOut`, `sendPasswordReset`, `updatePassword`, `upgradeGuestWithEmail`). Synchronizes cache with `syncUserCache(userId)`.
3. **`apiFetch` (`lib/api.ts`)**: Central fetch wrapper that resolves the latest Supabase access token, attaches `Authorization: Bearer <token>`, handles 401 with a single session refresh retry, and triggers local sign-out and redirect to `/login` if authentication cannot be renewed.
4. **`RequireAuth` (`components/RequireAuth.tsx`)**: Higher-order route wrapper and `useRequireAuth` hook that redirects unauthenticated users to `/login?next=<encodedPath>` while rendering a calm loader during credential checks.
5. **Cache Hygiene (`lib/cache.ts`)**: Ensures all user preferences and briefings caches (`becon_cached_briefings_*`, `becon_user_name`, `becon_user_avatar`) are purged upon sign-out, account deletion, or account switching, while strictly preserving `becon_theme`.

### Identity Display and Prefill (Task 1.9)
- **Backend Backfill & Avatar Hygiene (`app/deps.py`, `app/main.py`):** On login, `map_token_to_user` stores `user_metadata.full_name` (falling back to `user_metadata.name`) for new users, enforces `https://`-only avatar URLs (`avatar_url`/`picture` exposed as `picture_url` in `GET /api/me`), and backfills empty `name`/`email` columns on existing rows without ever overwriting saved non-empty values. Guest accounts (`is_anonymous=True`) always keep `email=None`.
- **Shared Identity Display (`components/UserAvatar.tsx`, `lib/identity.ts`):** Header profile menus (`/` and `/profile`) render `<UserAvatar />` and `<UserChip />` using resolved display name (`saved profile name -> /api/me -> full_name -> name -> email prefix`; guests `"Guest Reader"`), subtitle (`saved profession -> email`; guests `"Exploring as guest"`), and `https://`-only photo with `referrerPolicy="no-referrer"` and React-state fallback to initials (or generic icon for guests).
- **Frontend Prefill (`app/profile/page.tsx`):** After `GET /api/profile` loads, empty `Full Name` and `Email` fields are prefilled in priority order: **(1) saved profile values (always win)** $\rightarrow$ **(2) `GET /api/me` data** $\rightarrow$ **(3) `AuthContext` `user.user_metadata.full_name || name` and `user.email`**. Anonymous guests receive no prefill, and prefill never auto-saves (`POST /api/profile` runs only when the user clicks Save).
- **Cache Hygiene & Google Account Chooser:** `becon_user_name` and `becon_user_avatar` are refreshed from the active session and purged on sign-out and across account switches (tracked via `becon_active_user_id` across reloads). `signInWithGoogle()` passes `queryParams: { prompt: "select_account" }` so users can reliably choose or switch Google accounts.

---

## 7. Manual QA Checklist for Project Lead

Run this checklist against a live Supabase project to verify end-to-end functionality:

- [ ] **1. Email/password sign-up**:
  - Navigate to `/register`.
  - Enter valid email and password (>= 6 chars).
  - Submit: Verify calm confirmation message appears ("Check your email").
  - Click confirmation link in email: Redirects to `/profile?setup=true` (or `/auth/callback`).
- [ ] **2. Email/password sign-in**:
  - Navigate to `/login`.
  - Sign in with verified credentials: Redirects to `/` (or destination specified in `?next=`).
- [ ] **3. Google OAuth sign-in**:
  - Click "Continue with Google" on `/login` or `/register`.
  - Complete Google consent: Redirects through `/auth/callback` to `/profile?setup=true` (first time) or `/`.
- [ ] **4. Anonymous Guest exploration**:
  - On `/login`, click "Continue as Guest".
  - Redirected to `/`: Verify `<GuestBanner />` displays with upgrade prompt.
- [ ] **5. Guest account upgrade**:
  - Click upgrade button on `<GuestBanner />` or navigate to `/register?upgrade=1`.
  - Enter email and password: Confirm session upgrades to permanent account without losing reading history.
- [ ] **6. Password reset**:
  - Navigate to `/forgot-password`, enter registered email, and submit.
  - Open email link: Redirected to `/auth/reset-password`.
  - Enter new password (>= 6 chars) and save: Verify successful login with new password.
- [ ] **7. Danger zone account deletion**:
  - Navigate to `/profile`, scroll to "Danger Zone".
  - Type `DELETE` into the confirmation field and click "Permanently Delete Account".
  - Verify `DELETE /api/account` returns 204, Supabase user and local database rows are purged, and user is redirected to `/login?deleted=1`.
- [ ] **8. Silent token refresh**:
  - Wait until the Supabase access token expires (or manually test with an expired token).
  - Verify `apiFetch` calls `refreshSession()` and transparently completes the API request without user interruption.
- [ ] **9. Theme preservation on sign-out**:
  - Switch theme to Dark Mode via top theme toggle.
  - Sign out: Verify `/login` remains in Dark Mode (`becon_theme` preserved, all other caches cleared).

---

## 8. Known Limitations & Follow-Up Tasks

- **Task 6.7 (Anonymous User Cleanup):** Anonymous guest accounts accumulate over time. A periodic cleanup job will purge anonymous users older than 30 days that have no saved cards or follows, and support converting anonymous sessions to permanent email accounts.
- **Task 7.1 (Custom SMTP):** Default Supabase email service is rate-limited to 30 emails per hour. Production deployment will configure Resend SMTP in the Supabase Dashboard.
- **Task 8.1 (CAPTCHA for Anonymous Sign-Ins):** To prevent bot spam on anonymous user creation in production, Cloudflare Turnstile CAPTCHA will be enabled in Supabase Auth settings.

---

## 9. Rate Limits & Abuse Controls

Becon enforces lightweight, zero-dependency in-process sliding-window rate limits and hard UTC-day Gemini quotas in [`backend/app/rate_limit.py`](../backend/app/rate_limit.py).

> [!WARNING]
> **Per-Process Limiter Caveat:** `InProcessRateLimiter` stores sliding windows and daily counters in Python process memory. **Before running multiple Uvicorn/Gunicorn workers or horizontally scaled replicas, migrate the backing store to Redis or another shared store** so per-IP, per-user, guest-pool, and global daily Gemini quotas are enforced globally across instances and survive restarts.

### Enforcement Scopes
Environment variable names and defaults are owned by [`CLAUDE.md` — Section 5](../CLAUDE.md#5-environment-variables):
- **Public endpoints** (`/api/briefings`, `/api/briefings/search`, `/api/topics/search`): per-IP 60s sliding window (`RATE_LIMIT_PUBLIC_PER_MIN`). `X-Forwarded-For` is ignored unless the direct socket peer matches `TRUSTED_PROXIES`. Unauthenticated callers read persisted DB rows only (zero ingestion, zero `Source`/`FocusTopic`/`Profession`/`CardVariant` creation, zero Gemini calls).
- **Authenticated AI/refresh triggers** (`/api/onboarding/chat`, `/api/ai/match-topics`, `/api/briefings?refresh=true`, `/api/briefings/search?live=true`): per-user 60s sliding window (`RATE_LIMIT_AUTH_AI_PER_MIN` for full accounts; stricter `GUEST_AI_PER_MIN` for anonymous guests).
- **Daily Gemini quotas:** Hard UTC-day per-user (`GEMINI_DAILY_CAP_PER_USER`), per-guest (`GEMINI_DAILY_CAP_GUEST`), all-guests shared pool (`GEMINI_DAILY_CAP_ALL_GUESTS`), and global per-process (`GEMINI_DAILY_CAP_GLOBAL`) call caps, toggled via `RATE_LIMIT_ENABLED`. Daily quota is counted **at most once per logical request** (retries capped at `1`, and calls that fail before reaching Gemini consume zero quota).
- **Anonymous Guest Boundary:** Guests receive read-only access to shared persisted cards and cached variants (rejected with `403` on `refresh=true` and `live=true`; never trigger ingestion or `CardVariant` generation). **Limitation:** anonymous guest account creation (`signInAnonymously()`) occurs directly at Supabase Auth, so the Becon backend cannot enforce an IP rate limit on guest account creation; bot-farm protection requires enabling Cloudflare Turnstile CAPTCHA in Supabase Auth (**`ROADMAP.md` Task `8.1`**).
- **Ingest Per-Run Budget:** `POST /api/ingest` enforces `INGEST_MAX_GEMINI_CALLS_PER_RUN` so one run cannot exhaust `GEMINI_DAILY_CAP_GLOBAL`; excess items remain persisted as `raw_items` (`status='new'`) for the next run.

All limit and quota rejections return **HTTP `429 Too Many Requests`** with a standard **`Retry-After`** header (seconds).

### Additional Hardening Guards
- **`GET /api/briefings` & `GET /api/briefings/search`:** Unauthenticated callers are strictly DB-only (search cache misses return empty `cards` + `"No matches yet"` message). Input caps enforce `422` on violations (`interests` max 10 topics / 60 chars each, `role` max 120 chars, `custom_prompt` max 500 chars). `refresh=true` and `live=true` require an authenticated non-guest account (`401` unauthenticated, `403` guest).
- **`POST /api/ai/match-topics` & `POST /api/onboarding/chat`:** Require authentication (`401`); `match-topics` caps `description` at 500 chars (`422`), `onboarding/chat` caps `messages` at 20 items and `content` at 1000 chars (`422`). Every Gemini call enforces configurable `max_output_tokens` (`GEMINI_MAX_OUTPUT_TOKENS_CARD`, `GEMINI_MAX_OUTPUT_TOKENS_CHAT`, `GEMINI_MAX_OUTPUT_TOKENS_MATCH_TOPICS`).
- **`POST /api/ingest`:** Verifies `X-Ingest-Token` against `INGEST_API_TOKEN` using constant-time `hmac.compare_digest`.
- **Shared `CardVariant` Isolation:** `get_or_create_card_variant` resolves `role` strictly against existing active `professions` rows, generates variants solely from canonical `card` + `profession` (never writing `custom_prompt` or user free text into shared cache rows), and skips variant generation for unauthenticated/guest callers.
- **CORS:** Restricted to explicit origins (`ALLOWED_ORIGINS`), explicit methods (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`), and explicit headers (`Authorization`, `Content-Type`, `Accept`, `X-Request-ID`, `X-Ingest-Token`).
