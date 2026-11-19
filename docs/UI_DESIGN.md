# Becon — Frontend UI Architecture & Design Specification

Describes the current Next.js App Router frontend architecture, visual design tokens, layout geometry, reusable components, and user flows. For project status, history, and upcoming UI work, see [ROADMAP.md](../ROADMAP.md); for the product manifesto, see [BECON.md](../BECON.md); for auth flows, see [AUTH.md](AUTH.md).

---

## 1. Tech Stack & Runtime Architecture

| Layer | Technology | Entry Point |
| :--- | :--- | :--- |
| **Framework** | Next.js (App Router, Turbopack) | [`frontend/package.json`](../frontend/package.json) |
| **UI Library** | React (Client Components for stateful views) | [`frontend/src/app/layout.tsx`](../frontend/src/app/layout.tsx) |
| **Styling** | Tailwind CSS v4 (`@tailwindcss/postcss`, `@theme inline`) | [`frontend/src/app/globals.css`](../frontend/src/app/globals.css) |
| **Typography** | Self-hosted `next/font/local` (`Space Grotesk`, `Plus Jakarta Sans`, `Source Serif 4`, Latin `.woff2`, SIL OFL 1.1) | [`frontend/src/app/layout.tsx`](../frontend/src/app/layout.tsx) |
| **Icons** | `lucide-react` | Imported per component |
| **State & Context** | `ThemeContext`, `LoadingContext`, `AuthContext` | [`frontend/src/context/`](../frontend/src/context) |

---

## 2. Route Map

| Route | Purpose | Auth Gating | Source File |
| :--- | :--- | :--- | :--- |
| `/` | Daily Intelligence Gazette — Top Showcase (Lead + Quick Wire) + Bento Grid + topic search + finite end state | Protected (`<RequireAuth>`) | [`frontend/src/app/page.tsx`](../frontend/src/app/page.tsx) |
| `/login` | Unified editorial sign-in (email/password, Google OAuth, anonymous Guest) inside `<AuthShell>` | Public | [`frontend/src/app/login/page.tsx`](../frontend/src/app/login/page.tsx) |
| `/register` | Account creation & guest upgrade (`/register?upgrade=1`) inside `<AuthShell>` | Public | [`frontend/src/app/register/page.tsx`](../frontend/src/app/register/page.tsx) |
| `/forgot-password` | Password reset email request inside `<AuthShell>` | Public | [`frontend/src/app/forgot-password/page.tsx`](../frontend/src/app/forgot-password/page.tsx) |
| `/auth/reset-password` | New password submission from Supabase recovery link inside `<AuthShell>` | Public (recovery session) | [`frontend/src/app/auth/reset-password/page.tsx`](../frontend/src/app/auth/reset-password/page.tsx) |
| `/auth/callback` | PKCE OAuth / email verification callback handler | Public | [`frontend/src/app/auth/callback/page.tsx`](../frontend/src/app/auth/callback/page.tsx) |
| `/onboarding` | Conversational AI onboarding chat extracting role and interests | Protected (`<RequireAuth>`) | [`frontend/src/app/onboarding/page.tsx`](../frontend/src/app/onboarding/page.tsx) |
| `/profile` | User identity prefill, role & topic catalog selection, custom prompt, tone, Danger Zone deletion | Protected (`<RequireAuth>`) | [`frontend/src/app/profile/page.tsx`](../frontend/src/app/profile/page.tsx) |
| `/about` | Product manifesto and interactive 4-part Action Card demonstration | Public | [`frontend/src/app/about/page.tsx`](../frontend/src/app/about/page.tsx) |

---

## 3. Design Tokens

Defined via CSS variables and `@theme inline` in [`frontend/src/app/globals.css`](../frontend/src/app/globals.css) and Tailwind utility classes across components.

### 3.1 Color Palette

| Token / Usage | Light Mode | Dark Mode | Notes |
| :--- | :--- | :--- | :--- |
| **Canvas Background** | `#FAF8F5` (warm newsprint) | `#070b12` (`#090d16` in `globals.css`) | Token alignment tracked under `ROADMAP.md` `6.6` |
| **Card / Surface** | `#FFFFFF` (`bg-white`) | `dark:bg-slate-900` / `bg-slate-950` | Elevated broadsheet panels and sticky dark headers |
| **Text Primary** | `text-slate-950` / `900` | `dark:text-slate-50` / `100` | Headlines and primary copy |
| **Text Muted / Metadata** | `text-slate-600` / `500` | `dark:text-slate-400` / `500` | Timestamps, secondary labels (`6.6` covers contrast polish) |
| **Borders** | `border-slate-300` / `200` | `dark:border-slate-800` | Grid dividers and control borders |
| **Editorial Brand Accent** | `amber-500` / `amber-400` | `dark:text-amber-300` | Masthead highlights, active topic pills, back links |
| **Action: Apply** | `text-emerald-600` | `dark:text-emerald-400` | Rendered via `ActionBadge` |
| **Action: Prepare** | `text-amber-600` | `dark:text-amber-400` | Rendered via `ActionBadge` |
| **Action: Learn** | `text-sky-600` | `dark:text-sky-400` | Rendered via `ActionBadge` |
| **Action: Avoid / Urgent** | `text-rose-600` / `bg-rose-600` | `dark:text-rose-400` | `#1 Critical Update` tag, `Avoid` badge, quiet rose `Sign out` |

### 3.2 Typography

All web fonts are self-hosted as Latin `.woff2` files with SIL OFL 1.1 licenses under [`frontend/src/app/fonts/`](../frontend/src/app/fonts) via `next/font/local` (`display: "swap"`), requiring zero external font fetches at build or runtime:

| Font Family | CSS Variable | Weights | Applied Elements |
| :--- | :--- | :--- | :--- |
| **Source Serif 4** | `--font-editorial-serif` (mapped to `--font-serif`) | `400, 600, 700, 900` | Masthead (`B E C O N`) and card headlines (`font-serif`), Georgia / Times New Roman fallback |
| **Space Grotesk** | `--font-heading` | `500, 600, 700` | Default `h1`–`h6` headings via `globals.css` |
| **Plus Jakarta Sans** | `--font-body` (mapped to `--font-sans`) | `400, 500, 600, 700` | Global body text and UI controls |
| **System Monospace** | Tailwind default `font-mono` | System | Metadata pills, timestamps, search controls, header labels |

### 3.3 Theming System
1. **No-FOUT Head Script:** Inline `<head>` script in [`frontend/src/app/layout.tsx`](../frontend/src/app/layout.tsx) reads `localStorage.getItem("becon_theme")` (falling back to `prefers-color-scheme`) and applies `.dark` before hydration.
2. **State Provider:** [`frontend/src/context/ThemeContext.tsx`](../frontend/src/context/ThemeContext.tsx) syncs `isDarkMode`, toggles `.dark`, and persists `becon_theme` (preserved across sign-out by [`frontend/src/lib/cache.ts`](../frontend/src/lib/cache.ts)).
3. **Controls:** [`ThemeToggle`](../frontend/src/components/ThemeToggle.tsx) (`role="switch"`, `aria-checked`) is rendered inside `<HeaderActions>` on `/` and `/profile`, and in the headers of `/onboarding`, `/about`, and `<AuthShell>` on auth routes.

---

## 4. Layout System & Finite Briefing Rules

- **Top Header Bar (`/` and `/profile`):** Sticky `bg-slate-950` bar (`max-w-[1600px]`). On `/`, auto-hides on scroll down and slides down on scroll up. Right-side controls share `<HeaderActions>`: `[backLink?] [ThemeToggle] [UserMenu]`, all `h-9`, `rounded-lg`, `border-slate-700/80`, `gap-2`, engineered to fit single-row down to `360px` width without wrapping or overflow.
- **Coverage Ribbon (`/`):** Sticky sub-header directly under `<GuestBanner>` showing `[COVERAGE label]` + `[horizontally scrollable topic pills with flex-1 min-w-0]` + `[right-aligned Prev/Next scroll buttons]`.
- **Top Showcase (`/`):** `lg:grid-cols-12` split with `#1 Critical Update` (`LeadCard`, `lg:col-span-5`) on the left and `The Quick Wire` (`BriefCard` 2x2 grid, `lg:col-span-7`) on the right.
- **Dynamic Bento Grid (`/`):** `grid-cols-1 md:grid-cols-2 xl:grid-cols-3` using `computeBentoSpans` to alternate `SquareCard` (span 1), `RectangleCard` (span 2), and full-width `RectangleCard` (span 3) with zero orphan gaps.
- **Finite Daily Briefing (Decision D12):** Capped at `BRIEFING_MAX_CARDS = 10` with an estimated reading-time readout in the header and a calm `"You're all caught up for today"` end panel. Infinite scroll and page-lift animations are prohibited.
- **Viewport-Fitted Auth Shell:** All auth pages use [`AuthShell`](../frontend/src/components/AuthShell.tsx) (`h-dvh min-h-dvh`, compact vertical rhythm, responsive height queries) so login/register/reset flows fit above the fold without vertical scrollbars.

---

## 5. Component Inventory

| Component | File Path | Purpose & Key Behavior |
| :--- | :--- | :--- |
| **`HeaderActions`** | [`frontend/src/components/HeaderActions.tsx`](../frontend/src/components/HeaderActions.tsx) | Shared `h-9` right-side header cluster (`[backLink?] [ThemeToggle] [UserMenu]`) used on `/` and `/profile`. Back link renders `"← Gazette"` from `sm` up and an `aria-label` icon-only arrow below `sm`. |
| **`UserMenu`** | [`frontend/src/components/UserMenu.tsx`](../frontend/src/components/UserMenu.tsx) | Accessible profile dropdown (`aria-haspopup="menu"`, `aria-expanded`, `role="menu"`/`menuitem`, Escape close + trigger refocus, click-outside, Arrow/Home/End/Tab nav, `max-w-[280px]` truncated email + `title`, active `aria-current="page"`, guest `"Create account"` -> `/register?upgrade=1`, quiet rose `Sign out`). |
| **`UserAvatar` & `UserChip`** | [`frontend/src/components/UserAvatar.tsx`](../frontend/src/components/UserAvatar.tsx) | `https://`-only avatar `<img>` (`referrerPolicy="no-referrer"`) with React-state fallback to initials or guest icon; `UserChip` adds `min-w-0 truncate` + `title` tooltips. Identity resolved via [`frontend/src/lib/identity.ts`](../frontend/src/lib/identity.ts). |
| **`ThemeToggle`** | [`frontend/src/components/ThemeToggle.tsx`](../frontend/src/components/ThemeToggle.tsx) | Accessible light/dark switch (`role="switch"`, `aria-checked`, `sm`/`md` sizes). |
| **`AuthShell` & `AuthForm`** | [`frontend/src/components/AuthShell.tsx`](../frontend/src/components/AuthShell.tsx), [`AuthForm.tsx`](../frontend/src/components/AuthForm.tsx) | Viewport-fitted auth layout and unified email/password, Google OAuth (`prompt=select_account`), Guest sign-in, and Supabase misconfiguration banner. |
| **`RequireAuth` & `GuestBanner`** | [`frontend/src/components/RequireAuth.tsx`](../frontend/src/components/RequireAuth.tsx), [`GuestBanner.tsx`](../frontend/src/components/GuestBanner.tsx) | Route protection (`?next=` redirect) and guest upgrade prompt banner (`/register?upgrade=1`). |
| **Action Cards** | [`frontend/src/components/cards/`](../frontend/src/components/cards) | `LeadCard`, `RectangleCard`, `SquareCard`, `BriefCard`, `ActionBadge`, `ActionCardBody`. Wide and compact cards render all 4 Action Card parts (`SquareCard`, `BriefCard`, `RectangleCard` include concise `why_it_matters` line, Task 6.1b/6.8). Equal-height row pinning with bottom-pinned footers (`mt-auto`), unified `"Read source"` and `"Details"` labels. Clicking a card opens `CardDrawer`. |
| **`CardDrawer`** | [`frontend/src/components/CardDrawer.tsx`](../frontend/src/components/CardDrawer.tsx) | Accessible slide-over deep-dive drawer (`role="dialog"`, `aria-modal`, Escape close, focus management) displaying all 4 card parts, source link, and optional `deep_detail` code snippets. |
| **Global Progress Bar** | [`frontend/src/context/LoadingContext.tsx`](../frontend/src/context/LoadingContext.tsx) | Fixed top shimmer bar triggered on route transitions and profile saves. |

---

## 6. Frontend API Integrations

All authenticated calls go through [`apiFetch`](../frontend/src/lib/api.ts) (Bearer token injection + single silent `401` session refresh retry).

| Endpoint | Method | Caller | Purpose |
| :--- | :--- | :--- | :--- |
| `/api/me` | `GET` | `AuthContext`, `/auth/callback` | Authenticated user identity, avatar, and `has_completed_setup` |
| `/api/account` | `DELETE` | `/profile` Danger Zone | Permanent Supabase Admin + cascading DB account deletion |
| `/api/profile` | `GET` / `POST` | `/`, `/profile` | Load and save profile preferences (with non-overwriting identity prefill on `/profile`) |
| `/api/briefings` | `GET` | `/` | Two-phase briefing load (`scope=top&limit=5`, then `scope=remaining`) |
| `/api/briefings/search` | `GET` | `/` search bar | Persisted briefing card search (`q`, `role`, `limit=10`, `offset`) |
| `/api/topics/search` | `GET` | `/profile` topic autocomplete | Canonical topic + alias prefix autocomplete backed by `focus_topics` & `topic_aliases` |
| `/api/onboarding/chat` | `POST` | `/onboarding` | Conversational profile extraction |

---

## 7. Accessibility Highlights & Tracked Open UI Work

- **Implemented a11y:** `ThemeToggle` (`role="switch"`, `aria-checked`), `UserMenu` (ARIA menu semantics, Escape refocus, arrow/Home/End/Tab nav, click-outside), `CardDrawer` (`aria-modal`, Escape, focus handling), responsive back-link `aria-label`, back-to-top `sr-only` label, React-state avatar error fallback (no DOM mutation), `/profile` Tone selector `role="radiogroup"` / `role="radio"` with keyboard arrow navigation, and live 500-char prompt validation counter (Task 6.8).
- **Open UI work is tracked exclusively in [ROADMAP.md](../ROADMAP.md):**
  - `6.1` / `6.1b` — Compact cards 4-part rendering *(resolved under Task `6.8`)*.
  - `6.3` — Remove remaining mock fallback generators from `frontend/src/app/page.tsx` and split page modules.
  - `6.4` — Rebuild onboarding around dynamic `professions` + `focus_topics` instead of static suggestion lists.
  - `6.5` — Add save/bookmark (`saved_cards`), useful/not-useful feedback, error reporting, clickable coverage pills, and archive UI.
  - `6.6` — Remaining dark-mode color contrast polish, canvas background token alignment (`#090d16` vs `#070b12`), and interactive card keyboard focusability.
  - `1.8` — Resolve remaining pre-existing frontend ESLint errors so CI `continue-on-error` can be removed.

---

## 8. Change Log

| Date | Task | Result | Notes |
| :--- | :--- | :--- | :--- |
| 2026-11-18 | 1.12 | Done | Self-hosted fonts via `next/font/local` (`Source Serif 4`, `Plus Jakarta Sans`, `Space Grotesk`) |
| 2026-11-19 | 6.8 | Pending Approval | UI polish pass (folds `6.1b`): compact cards 4-part rendering, equal-height cards & footer pinning, unified "Read source" & "Details" labels, Lead card dead space removal, `/profile` tone radiogroup & live counter & primary accent save button |
