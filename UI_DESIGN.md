# Becon — Frontend UI Architecture & Design Documentation

> **Note:** Sections 6-9 and 12 predate Tasks 6.1/6.2; refresh pending in Task 1.8.  
> **Status:** Current State Documentation (As-Built)  
> **Source Directory:** `frontend/`  
> **Last Updated:** November 2026  
> **Audience:** Senior Product Designers, Frontend Engineers, Tech Leads

---

## 1. Overview

### 1.1 Product Definition
**Becon** is an update intelligence platform built to eliminate noise and scrolling for software engineers. Instead of aggregate tech news feeds, Becon ingests official releases, deprecations, breaking changes, and security advisories, structuring them into a personalized daily briefing.

### 1.2 Design Philosophy as Implemented
The user interface attempts to evoke a **"Modern Broadsheet / Editorial Intelligence Gazette"**:
- **Editorial Hierarchy:** Features a top lead story (`#1 Critical Update`), a 4-item dispatch wire (`The Quick Wire`), and a dynamic multi-span Bento Grid (`Architecture & Deep Takes`).
- **High-Density Typography:** Contrasting serif headlines with monospace metadata tags and sans-serif body text.
- **Signal-to-Noise Ratio:** No social feeds, no comments, no like counters, and no avatar walls.
- **Implemented Contradictions:** While the product vision calls for a calm, time-boxed 3–5 minute daily briefing without infinite scroll, the implementation introduces an infinite scroll listener with an elastic 20% page lift animation, fallback multi-edition generators, and topic search decks.

### 1.3 Tech Stack & Architecture
| Layer | Technology | Version | Location / Config |
| :--- | :--- | :--- | :--- |
| **Framework** | Next.js (App Router) | `16.3.0` | [`frontend/package.json`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/package.json) |
| **UI Library** | React | `19.2.8` | [`frontend/package.json`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/package.json) |
| **Styling** | Tailwind CSS (v4 engine) via `@tailwindcss/postcss` | `^4.0.0` | [`frontend/src/app/globals.css`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/globals.css), [`frontend/postcss.config.mjs`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/postcss.config.mjs) |
| **Typography** | `next/font/google` (`Space_Grotesk`, `Plus_Jakarta_Sans`) | Native | [`frontend/src/app/layout.tsx:7-17`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/layout.tsx#L7-L17) |
| **Icons** | Lucide React | `^1.29.0` | [`frontend/package.json`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/package.json) |
| **Auth & Client DB** | Supabase JS Client (`@supabase/supabase-js`) | `^2.118.0` | [`frontend/src/lib/supabaseClient.ts`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/lib/supabaseClient.ts) |
| **State Management** | React Context (`ThemeContext`, `LoadingContext`) + `localStorage` | Native | [`frontend/src/context/`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/context) |

---

## 2. Site Map & Route Hierarchy

| Route Path | Page Purpose | Auth Gated? | Implemented Flow & Redirects | Source File |
| :--- | :--- | :--- | :--- | :--- |
| `/` | **The Daily Gazette:** Main briefing dashboard with Top Showcase (#1 Lead + Quick Wire 4-pack) and Bento Grid. | **Yes** (Client-side) | Protected via `<RequireAuth />` / `useRequireAuth`. Checks active Supabase session in `AuthContext`. If unauthenticated, redirects to `/login?next=/`. | [`frontend/src/app/page.tsx`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/page.tsx) |
| `/login` | **Authentication:** Unified sign in via email/password, Google OAuth, or instant Guest Reader session. | **No** | Renders `<AuthForm mode="login" />`. Email/password, Google OAuth, or guest exploration via `signInAnonymously()`. | [`frontend/src/app/login/page.tsx`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/login/page.tsx) |
| `/register` | **Registration & Upgrade:** Create account or upgrade guest session. | **No** | Renders `<AuthForm mode="signup" | "upgrade" />`. Supports email/password registration with confirmation email, guest session upgrade (`?upgrade=1`), and Google OAuth. | [`frontend/src/app/register/page.tsx`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/register/page.tsx) |
| `/auth/callback` | **OAuth & Email Callback Handler:** Completes PKCE token exchange with Supabase. | **No** (Intermediate) | Exchanges auth code for session via Supabase Auth, checks profile status via `GET /api/me`, and redirects to `/profile?setup=true` or destination. | [`frontend/src/app/auth/callback/page.tsx`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/auth/callback/page.tsx) |
| `/auth/reset-password` | **Reset Password:** Set new password from recovery link. | **No** | Validates active recovery session, updates password via Supabase Auth `updateUser()`, and redirects to `/login`. | [`frontend/src/app/auth/reset-password/page.tsx`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/auth/reset-password/page.tsx) |
| `/forgot-password` | **Forgot Password:** Request password recovery link. | **No** | Accepts email and triggers `resetPasswordForEmail()`. | [`frontend/src/app/forgot-password/page.tsx`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/forgot-password/page.tsx) |
| `/onboarding` | **AI Conversational Setup:** Chat assistant asking guided questions to configure stack and role. | **Yes** (Client-side) | Protected via `<RequireAuth />`. Interacts with `POST /api/onboarding/chat`. Redirects to `/profile` on completion. | [`frontend/src/app/onboarding/page.tsx`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/onboarding/page.tsx) |
| `/profile` | **Stack Preferences & Profile:** Direct form to customize role, experience level, interest topics, custom prompt, and Danger Zone deletion. | **Yes** (Client-side) | Protected via `<RequireAuth />`. Loads from `GET /api/profile`, updates via `POST /api/profile`, and handles permanent deletion via `DELETE /api/account`. | [`frontend/src/app/profile/page.tsx`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/profile/page.tsx) |
| `/about` | **Product Manifesto & Interactive Demo:** Public documentation detailing Becon's mission, comparison tables, and interactive Action Card sample tabs. | **No** | Publicly accessible marketing and manifesto page. Links to `/`, `/onboarding`, `/profile`, and `/login`. | [`frontend/src/app/about/page.tsx`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/about/page.tsx) |

---

## 3. Design Tokens

The styling architecture uses **Tailwind CSS v4** without a `tailwind.config.ts` file. Tokens are partially defined via CSS variables and `@theme inline` in [`frontend/src/app/globals.css`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/globals.css), but predominantly applied through hardcoded Tailwind utility classes.

### 3.1 Color Palette

| Token / Usage | Light Mode Value | Dark Mode Value | Where Defined / Notes |
| :--- | :--- | :--- | :--- |
| **Canvas Background** | `#FAF8F5` (Warm Cream) | `#070b12` (Deep Navy-Black) | Defined as `#090d16` in `globals.css:11`, but hardcoded as `bg-[#FAF8F5] dark:bg-[#070b12]` in `layout.tsx:51` and `page.tsx:811,1096`. |
| **Card / Surface Surface** | `#FFFFFF` (`bg-white`) | `#0f172a` / `#020617` (`dark:bg-slate-900`) | Hardcoded in `page.tsx` and `profile/page.tsx`. |
| **Text Primary** | `#020617` / `#0f172a` (`text-slate-950` / `900`) | `#f8fafc` / `#f1f5f9` (`dark:text-slate-50` / `100`) | Hardcoded on headers and card headlines. |
| **Text Muted / Metadata** | `#475569` / `#64748b` (`text-slate-600` / `500`) | `#94a3b8` / `#64748b` (`dark:text-slate-400` / `500`) | Hardcoded across cards, dates, and badges. |
| **Borders (Cards & Grid)** | `#cbd5e1` / `#e2e8f0` (`border-slate-300` / `200`) | `#1e293b` (`dark:border-slate-800`) | Hardcoded across card containers. |
| **Accent / Editorial Brand** | `#f59e0b` / `#fbbf24` (`amber-500` / `amber-400`) | `#fde68a` / `#fcd34d` (`dark:text-amber-300`) | Used for highlights, gazette branding, and active filters. |
| **Status: Apply** | `text-emerald-600 bg-slate-100/90` | `dark:text-emerald-400 dark:bg-slate-800/80` | Defined in `page.tsx:759-771` & `about/page.tsx:38`. |
| **Status: Prepare** | `text-amber-600 bg-slate-100/90` | `dark:text-amber-400 dark:bg-slate-800/80` | Defined in `page.tsx:767-770` & `about/page.tsx:53`. |
| **Status: Learn** | `text-sky-600 bg-slate-100/90` | `dark:text-sky-400 dark:bg-slate-800/80` | Defined in `page.tsx:763-764`. |
| **Status: Avoid / Urgent** | `text-rose-600 bg-rose-600` (Lead tag) | `dark:text-rose-400 dark:bg-rose-950/40` | Used for `#1 Critical Update` and `Avoid` badge. |

### 3.2 Typography

| Font Family | Declared Variable | Applied Elements | Issue / Note |
| :--- | :--- | :--- | :--- |
| **Space Grotesk** | `--font-heading` (`500, 600, 700`) | `h1-h6` via `globals.css:28-30` | Self-hosted via `next/font/local` in `frontend/src/app/fonts/space-grotesk/` (OFL 1.1). |
| **Plus Jakarta Sans** | `--font-body` (`400, 500, 600, 700`) | `body` via `globals.css:22-26` | Self-hosted via `next/font/local` in `frontend/src/app/fonts/plus-jakarta-sans/` (OFL 1.1). Global body typeface. |
| **Source Serif 4 (Editorial Serif)** | `--font-editorial-serif` -> `--font-serif` (`400, 600, 700, 900`) | Card titles, brand headers (`font-serif`) | Self-hosted via `next/font/local` in `frontend/src/app/fonts/source-serif-4/` (OFL 1.1, Task 1.12 / 6.6) with Georgia / Times New Roman fallback. |
| **Monospace (Data / Tags)** | None (Default system mono) | Timestamps, tags, badges, search bar (`font-mono`) | Uses system default monospace font stack. |

#### Type Scale & Weights (As Implemented)
- **Gazette Masthead:** `text-xl sm:text-2xl md:text-3xl font-black tracking-widest uppercase font-serif` ([`page.tsx:850`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/page.tsx#L850))
- **Lead Headline:** `text-lg sm:text-xl md:text-2xl font-black tracking-tight leading-tight font-serif` ([`page.tsx:1664`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/page.tsx#L1664))
- **Major Bento Headline:** `text-base sm:text-lg font-bold leading-snug font-serif` ([`page.tsx:1799`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/page.tsx#L1799))
- **Square / Brief Headline:** `text-sm sm:text-base font-bold leading-snug font-serif` ([`page.tsx:1926,2003`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/page.tsx#L1926))
- **Card Bullets:** `text-xs leading-relaxed font-sans` ([`page.tsx:1698,1807`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/page.tsx#L1698))
- **Metadata / Tag Pills:** `text-[10px] sm:text-[11px] font-mono font-semibold uppercase tracking-wider` ([`page.tsx:1409`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/page.tsx#L1409))

### 3.3 Spacing, Radii, Shadows, Breakpoints
- **Border Radii:** Card wrappers use `rounded-xl` (`12px`) or `rounded-2xl` (`16px`). Buttons and badges use `rounded-lg` (`8px`) or `rounded-full`.
- **Shadows:** Subtle broadsheet elevations `shadow-2xs`, `shadow-xs`, `shadow-sm`, and `shadow-md`. Modals/popups use `shadow-xl`.
- **Breakpoints (Tailwind Standards):**
  - `sm`: `640px` (adjusts header padding, button sizes, grid columns)
  - `md`: `768px` (Bento Grid shifts from 1 to 2 columns)
  - `lg`: `1024px` (Top Showcase splits into 5-col Lead + 7-col Quick Wire)
  - `xl`: `1280px` (Bento Grid shifts from 2 to 3 columns; max container widths to `1600px`)

---

## 4. Theming System

The theming implementation spans three layers:
1. **Flash-of-Unstyled-Theme (FOUT) Prevention Script:**  
   Inlined in `<head>` in [`frontend/src/app/layout.tsx:37-49`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/layout.tsx#L37-L49):
   ```js
   try {
     const theme = localStorage.getItem('becon_theme');
     if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
       document.documentElement.classList.add('dark');
     } else {
       document.documentElement.classList.remove('dark');
     }
   } catch (_) {}
   ```
2. **Context Provider:**  
   Managed by [`frontend/src/context/ThemeContext.tsx`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/context/ThemeContext.tsx). Synchronizes React state `isDarkMode` with `localStorage` key `becon_theme` and toggles `.dark` on `document.documentElement`.
3. **Toggle Switch Component:**  
   [`frontend/src/components/ThemeToggle.tsx`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/components/ThemeToggle.tsx): Accessible switch button (`role="switch"`, `aria-checked`) with sun/moon icons, sliding animated knob, and hover rotations. Re-rendered in:
   - Ribbon bar on `/` ([`page.tsx:1053-1086`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/page.tsx#L1053-L1086))
   - Header bar on `/about`, `/onboarding`, `/profile`, `/login`, and `/register`.

> [!WARNING]
> **Token Discrepancy:** In `globals.css:11`, `--background` for dark mode is set to `#090d16`. However, in `layout.tsx:51`, `page.tsx:811,1096`, and `login/page.tsx:77`, the dark background is hardcoded as `dark:bg-[#070b12]`. While visually close, this bypasses the CSS variable token system.

---

## 5. Layout System: The Bento Grid & Showcase

The home page layout ([`frontend/src/app/page.tsx`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/page.tsx)) operates as a two-tier presentation:

```
+-----------------------------------------------------------------------------------------+
| Top Header Bar (Auto-hiding sticky broadsheet header + Profile Dropdown)                 |
+-----------------------------------------------------------------------------------------+
| Coverage Ribbon (Horizontally scrollable active stack tags + Next/Prev + Theme Switch)  |
+-----------------------------------------------------------------------------------------+
| TOP SHOWCASE (lg:grid-cols-12):                                                         |
|  - Left 5 Columns: #1 Critical Update (Lead Card)                                       |
|  - Right 7 Columns: The Quick Wire (2x2 Grid of Rapid Signal Dispatches)                |
+-----------------------------------------------------------------------------------------+
| BENTO DECK HEADER: Search Input + Status Bar                                            |
+-----------------------------------------------------------------------------------------+
| FULL-WIDTH BENTO GRID (grid-cols-1 md:grid-cols-2 xl:grid-cols-3):                      |
|  - Span 1: Square Card (System Watch / Spotlights)                                      |
|  - Span 2: Wide Rectangle Card (Major Architectural Updates)                             |
|  - Span 3: Full-Width Rectangle Card (Deep Architecture Shifts)                         |
+-----------------------------------------------------------------------------------------+
```

### 5.1 Card Span Calculation Algorithm
Card spans inside the Bento Deck are dynamically assigned via `computeBentoSpans()` in [`frontend/src/app/page.tsx:51-77`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/page.tsx#L51-L77):
```typescript
function computeBentoSpans(total: number): number[] {
  const spans: number[] = [];
  let remaining = total;
  let flip = true;

  while (remaining > 0) {
    if (remaining === 1) {
      spans.push(3); remaining -= 1;
    } else if (remaining === 3) {
      spans.push(1, 1, 1); remaining -= 3;
    } else if (remaining === 4) {
      spans.push(1, 1, 1, 3); remaining -= 4;
    } else {
      spans.push(flip ? 2 : 1, flip ? 1 : 2);
      flip = !flip;
      remaining -= 2;
    }
  }
  return spans;
}
```

### 5.2 Card Assignment Rules & Responsive Breakpoints

| Priority / Card Type | Target Location | Grid Span Logic | Desktop (`xl`) | Tablet (`md`) | Mobile (`<sm`) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Lead Story** (`lead` or `rank: 1`) | Top Showcase Left | `lg:col-span-5` | 5/12 width | Full width | Full width stacked |
| **Quick Wire** (`brief` / ranks 2–5) | Top Showcase Right | `lg:col-span-7` | 7/12 width (2x2 grid) | 2-col grid | 1-col stacked |
| **Square Card** (Span 1) | Bento Grid | `col-span-1` | 1 of 3 cols (`33%`) | 1 of 2 cols (`50%`) | Full width (`100%`) |
| **Wide Rectangle** (Span 2) | Bento Grid | `col-span-1 md:col-span-2 xl:col-span-2` | 2 of 3 cols (`66%`) | 2 of 2 cols (`100%`) | Full width (`100%`) |
| **Full-Width Rectangle** (Span 3) | Bento Grid | `col-span-1 md:col-span-2 xl:col-span-3` | 3 of 3 cols (`100%`) | 2 of 2 cols (`100%`) | Full width (`100%`) |

---

## 6. Component Inventory

### 6.1 Component Matrix

| Component Name | File Path | Props & Interfaces | Variants / Styles | States Handled | Where Used |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **ThemeToggle** | [`frontend/src/components/ThemeToggle.tsx`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/components/ThemeToggle.tsx) | `{ className?: string, size?: "sm" \| "md" }` | Compact (`sm`), Standard (`md`) | Light, Dark, Hover, Focus | Headers on all routes; coverage ribbon on `/`. |
| **Lead Card** | `renderLeadSidebarCard` in [`page.tsx:1638`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/page.tsx#L1638) | `(card: BriefingCard, getBadgeColor, leadImageUrl)` | Editorial Lead Box | Default, With Image, Without Image (shows Context text) | Top Showcase Left on `/`. |
| **Quick Wire Card** | `renderBriefCard` in [`page.tsx:1969`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/page.tsx#L1969) | `(card: BriefingCard, getBadgeColor, rankNumber?)` | Dispatch Wire Card | Default, Hover border | Top Showcase Right on `/`. |
| **Rectangle Bento Card** | `renderRectangleCard` in [`page.tsx:1738`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/page.tsx#L1738) | `(card, getBadgeColor, showImage?, isFullWidth?, resolvedImageUrl?)` | 2-Col Span, 3-Col Span Full-Width | Text-only, With Left Thumbnail Split, Hover elevation | Bento Grid on `/`. |
| **Square Bento Card** | `renderSquareCard` in [`page.tsx:1874`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/page.tsx#L1874) | `(card, getBadgeColor, showImage?, resolvedImageUrl?)` | 1-Col Compact Square | Text-only, With Cover Image, Hover elevation | Bento Grid on `/`. |
| **Coverage Topics Ribbon** | Inline in [`page.tsx:981-1051`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/page.tsx#L981-L1051) | None (reads `userInterests`) | Horizontally scrollable tag container | Default pills, fallback pills, disabled scroll buttons | Sticky sub-header on `/`. |
| **Search Bar** | Inline in [`page.tsx:1170-1205`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/page.tsx#L1170-L1205) | Form state (`searchQuery`, `isSearchingTopic`) | Inline broadsheet search input | Default, Focused, Loading spinner, Clear button (`X`) | Bento Deck header on `/`. |
| **Profile Menu (`UserMenu` & `HeaderActions`)** | [`frontend/src/components/UserMenu.tsx`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/components/UserMenu.tsx) & [`HeaderActions.tsx`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/components/HeaderActions.tsx) | `{ identity, email?, currentPage?, onSignOut }` + `{ backLink? }` | Uniform `h-9` header cluster (`[backLink] [ThemeToggle] [UserMenu]`), `max-w-[280px]` dropdown, quiet rose `Sign out` | Closed, Open, Keyboard nav (Escape/Arrows/Home/End/Tab), Click-outside, Active `aria-current="page"`, Guest `"Create account"` (`/register?upgrade=1`), Truncated email + `title` | Top header bar right on `/` and `/profile`. |
| **Card Modal / Deep-Dive** | **NOT IMPLEMENTED** | `DeepDetail` interface defined in [`page.tsx:19-27`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/page.tsx#L19-L27) | **None** | **None** | **Missing from UI.** Clicking links opens external URLs. |
| **Skeleton Loaders** | `renderLeadSkeleton`, `renderBriefSkeleton`, `renderBentoSkeletonCard` in [`page.tsx:1418-1634`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/page.tsx#L1418-L1634) | `(rankNumber?: number, span?: number)` | Lead Skeleton, Brief Skeleton, Bento Skeleton | Shimmer pulse + `News-Loader.gif` | Displayed when `loading === true` or during search. |
| **Global Progress Bar** | [`frontend/src/context/LoadingContext.tsx:35-43`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/context/LoadingContext.tsx#L35-L43) | None (reads `isLoading` from context) | Fixed 4px top progress bar | Shimmer gradient animation (`loader-shimmer`) | Triggered on route transitions and profile saves. |

---

## 7. Action Card Anatomy (Vision vs. As-Built)

### 7.1 Schema Specification
The backend schema ([`backend/app/schemas.py:15-28`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/backend/app/schemas.py#L15-L28)) and the frontend interface ([`frontend/src/app/page.tsx:29-34`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/page.tsx#L29-L34)) require four distinct parts:
1. `what_happened`: `string[]` (1–2 concise release bullets)
2. `why_it_matters`: `string` (architectural context and industry shift)
3. `how_it_affects_you`: `string` (direct role & stack impact)
4. `what_to_do_next`: `ActionGuidance` (`action_type: learn | apply | avoid | prepare`, `guidance: string`)

### 7.2 Implementation Audit Across Screens

```
                                  +---------------------------+-----------------------------------+
                                  | Main Feed (`page.tsx`)     | Demo Page (`about/page.tsx`)      |
+---------------------------------+---------------------------+-----------------------------------+
| 1. WHAT HAPPENED               | RENDERED (1-2 bullets)    | RENDERED (Full bullets list)      |
| 2. WHY IT MATTERS               | PARTIAL (As "IMPACT" text)| RENDERED (Dedicated section)      |
| 3. HOW IT AFFECTS YOU           | MISSING (Omitted entirely)| RENDERED (Dedicated section)      |
| 4. WHAT TO DO NEXT (Guidance)   | MISSING (Omitted entirely)| RENDERED (Dedicated action alert) |
| Action Status Badge             | MISSING (Dead code)       | RENDERED (Color-coded badge)      |
| Source Link (Resource)          | RENDERED (External link)  | RENDERED (External link)          |
| Target Stack Pill               | RENDERED (`/ TAG`)        | RENDERED (Category header)        |
+---------------------------------+---------------------------+-----------------------------------+
```

#### Detailed Findings on Card Parts:
- **`how_it_affects_you` is completely absent from all card renderers on `/`:** Neither `renderLeadSidebarCard`, `renderRectangleCard`, `renderSquareCard`, nor `renderBriefCard` output this field.
- **`what_to_do_next` is completely absent from all card renderers on `/`:** The actionable guidance that defines Becon's value proposition is never displayed on the main feed.
- **Unused Badge Function:** `getActionBadgeColor()` is declared in [`page.tsx:759-771`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/page.tsx#L759-L771) and passed as an argument to every render function, but **never invoked inside them**.

---

## 8. Key User Flows (As Implemented)

| User Flow | Status | Step-by-Step Implemented Behavior | Gaps / Issues |
| :--- | :--- | :--- | :--- |
| **1. Authentication (Login / Signup)** | **Complete** | User visits `/login` or `/register`. Can sign in with email/password, sign up with email verification, continue with Google OAuth, explore as anonymous Guest (`signInAnonymously()`), or upgrade guest session to permanent account. | Unified `<AuthForm />` component; custom JWT and local credentials retired. |
| **2. AI Onboarding** | **Working** | User lands on `/onboarding`. System bot initiates chat. User replies in message box. Calls `POST /api/onboarding/chat`. When complete, pulses "PROFILE COMPLETE" and navigates to `/profile`. | Chat messages do not persist if page refreshes mid-conversation. |
| **3. Profile & Stack Setup** | **Working** | User visits `/profile`. Selects role, selects/searches topics from autocomplete catalog (instant prefix match + debounced `GET /api/topic-search`), edits prompt & tone. Click "Save Preferences" calls `POST /api/profile` and redirects to `/`. | No option to clear all topics in one click. |
| **4. Reading the Briefing** | **Working** | User visits `/`. If token exists, loads cached cards from `localStorage`, checks profile, and requests `GET /api/briefings` in 2 steps (top 5, then remaining). Bento grid renders cards. | Main cards omit `how_it_affects_you` and `what_to_do_next`. |
| **5. Opening a Card / Deep-Dive** | **Missing** | User clicks card title or "Resource" button. Browser immediately opens the external `source_url` in a new tab. | No modal, drawer, or in-app deep-dive view exists despite `DeepDetail` typing. |
| **6. Topic Search & Filtering** | **Partial** | User types in search bar and presses Enter. Calls `GET /api/search-topic`. Renders matching cards in Bento deck with active search banner and reset button. | **Coverage ribbon topic pills are unclickable.** Users cannot click an active topic pill in the header to filter the feed. |
| **7. Saving / Bookmarking Cards** | **Missing** | No bookmark, pin, or save icon exists on any card on the main feed or in the profile view. | Backend has `SavedBriefing` database table, but frontend has zero UI controls. |
| **8. Feedback (Useful / Not Useful)** | **Missing** | No thumbs up/down, upvote/downvote, or relevance voting controls exist on cards. | Vision calls for feedback-based ranking adaptation; completely absent in code. |

---

## 9. Data, State & Ingestion Pipeline

### 9.1 API Endpoints Integrated by the Frontend

| Endpoint | HTTP Method | Frontend Caller | Purpose | Auth Header |
| :--- | :--- | :--- | :--- | :--- |
| `/api/me` | `GET` | [`api.ts:88`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/lib/api.ts#L88), [`callback/page.tsx:87`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/auth/callback/page.tsx#L87) | Retrieves authenticated user identity and setup status | `Bearer <token>` |
| `/api/account` | `DELETE` | [`profile/page.tsx:321`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/profile/page.tsx#L321) | Permanently deletes account from Supabase Auth & cascades DB | `Bearer <token>` |
| `/api/profile` | `GET` | [`page.tsx:617`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/page.tsx#L617), [`profile/page.tsx:206`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/profile/page.tsx#L206) | Retrieves user profile, role, and focus topics | `Bearer <token>` |
| `/api/profile` | `POST` | [`profile/page.tsx:275`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/profile/page.tsx#L275) | Persists updated user profile and stack configuration | `Bearer <token>` |
| `/api/briefings` | `GET` | [`page.tsx:697,719`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/page.tsx#L697) | 2-phase fetch: `scope=top&limit=5`, then `scope=remaining` | Optional |
| `/api/search-topic` | `GET` | [`page.tsx:286,473`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/page.tsx#L286) | Queries AI-synthesized briefings matching a search string | Optional |
| `/api/topic-search` | `GET` | [`profile/page.tsx:141`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/profile/page.tsx#L141) | Autocomplete endpoint for interest topics during setup | None |
| `/api/onboarding/chat`| `POST` | [`onboarding/page.tsx:53`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/onboarding/page.tsx#L53) | Sends user chat messages to conversational AI engine | `Bearer <token>` |

### 9.2 Real Data vs. Mock & Fallback Generators
The frontend contains extensive fallback generators that produce simulated cards when the backend is offline or returns empty lists:
- [`page.tsx:2100-2268`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/page.tsx#L2100-L2268): `getBeautyFashionBroadsheetCards` (10 hardcoded cards)
- [`page.tsx:2270-2430`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/page.tsx#L2270-L2430): `getAccountingBroadsheetCards` (10 hardcoded cards)
- [`page.tsx:2432-3100`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/page.tsx#L2432-L3100): Additional vertical fallback decks for retail, business, and software engineering
- [`page.tsx:3102-3380`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/page.tsx#L3102-L3380): `getNextEditionCards` (Alternates odd/even architectural edition card batches)

---

## 10. Accessibility & Responsiveness Audit

### 10.1 Accessibility (a11y)
- **Positive Implementations:**
  - `ThemeToggle` has valid `role="switch"`, `aria-checked`, and `aria-label` attributes ([`ThemeToggle.tsx:19-22`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/components/ThemeToggle.tsx#L19-L22)).
  - Buttons generally declare `type="button"`.
  - Floating back-to-top button includes `<span className="sr-only">Back to top</span>` ([`page.tsx:1395`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/page.tsx#L1395)).
- **Accessibility Violations & Risks:**
  - **Color Contrast:** Low-contrast text in dark mode (`text-slate-500` on `#070b12` has ~3.2:1 ratio, below WCAG AA 4.5:1 standard).
  - **Interactive Cards:** Cards are rendered as `<article>` containers without keyboard focusability. Only the inner anchor tags can receive focus.
  - **Profile Menu Accessibility (Resolved in Task 1.10):** Replaced inline dropdown with shared [`UserMenu.tsx`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/components/UserMenu.tsx) implementing `aria-haspopup="menu"`, `aria-expanded`, `role="menu"` / `role="menuitem"`, `Escape` close + focus return to trigger, click-outside close, arrow-key/Home/End navigation, and `Tab` close.
  - **Direct DOM Mutation in Images:** Image tags mutate their parent's inline style via `onError={(e) => e.currentTarget.parentElement.style.display = "none"}` instead of using React state.

### 10.2 Responsiveness
- **Desktop (>= 1280px):** Layout is stable with 5-to-7 showcase split and 3-column Bento grid.
- **Tablet (768px – 1023px):** Top showcase stacks into full-width Lead + 2-col Quick wire; Bento grid smoothly drops to 2 columns.
- **Mobile (< 768px):**
  - **Search Bar Stacking:** The search bar in the Bento header drops to `order-3` and stretches full-width ([`page.tsx:1172`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/page.tsx#L1172)).
  - **Scroll Conflict:** The bottom pull/lift gesture listener ([`page.tsx:540-549`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/page.tsx#L540-L549)) listens to `touchmove` events when `diffY > 25` near the bottom of the page. This causes jerky screen movement and accidental page lifting during standard mobile scrolling.

---

## 11. Gaps and Inconsistencies Matrix

| Priority | Issue Description | Impact | Location |
| :--- | :--- | :--- | :--- |
| **HIGH** | **Missing Action Guidance & Impact Sections on Cards** | The 4-part Action Card is Becon's core differentiator. Main feed cards omit `how_it_affects_you` and `what_to_do_next`, turning cards into standard news summaries. | [`frontend/src/app/page.tsx:1638-2035`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/page.tsx#L1638-L2035) |
| **HIGH** | **Missing Card Detail Modal / Drawer** | Clicking a card immediately navigates away to third-party sources. No in-app expanded view exists for code snippets, architecture diagrams, or full writeups. | [`frontend/src/app/page.tsx:1723,1768,1898`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/page.tsx#L1723) |
| **MEDIUM** | **Unclickable Coverage Topic Pills** | Topic pills in the sticky sub-header ribbon show active topics but cannot be clicked to filter the feed. | [`frontend/src/app/page.tsx:1010-1035`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/page.tsx#L1010-L1035) |
| **MEDIUM** | **Missing Save / Bookmark Functionality** | Users cannot save cards to a personal digest or team backlog, despite backend database support (`SavedBriefing`). | Whole frontend |
| **MEDIUM** | **Missing Editorial Serif Font Declaration** | Headings use `font-serif`, but no serif font is loaded in `layout.tsx` or `globals.css`, causing inconsistent system font fallbacks. | [`frontend/src/app/layout.tsx:7-17`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/layout.tsx#L7-L17) |
| **LOW** | **Hardcoded Background Color Inconsistency** | `globals.css` specifies `#090d16` for dark mode, while layout and pages hardcode `#070b12`. | [`frontend/src/app/globals.css:11`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/globals.css#L11), [`frontend/src/app/layout.tsx:51`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/layout.tsx#L51) |
| **LOW** | **Bloated Page Component** | `frontend/src/app/page.tsx` contains 3,381 lines of code because multiple vertical mock databases are embedded in the component file. | [`frontend/src/app/page.tsx:2038-3381`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src/app/page.tsx#L2038-L3381) |

---

## 12. Implemented Screens vs. Product Vision

| Design & Product Principle | Product Vision ([`BECON.md`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/BECON.md)) | As Implemented Today ([`frontend/src/`](file:///d:/Prabhjot%20Private/Personal-Projects/Becon/frontend/src)) | Status |
| :--- | :--- | :--- | :--- |
| **Time-Boxed Briefing (3–5 min)** | Strict, finite daily edition. User reads updates, takes action, and exits. | Continuous scrolling with "DISPATCHING NEXT GAZETTE EDITION" loaders and infinite pagination. | **Divergence:** Current UI resembles an endless news aggregator rather than a time-boxed briefing. |
| **No Infinite Scroll / Tricks** | Principle 4 & 6: "No infinite scroll, no engagement tricks." | Page lift animation (`translateY(-120px)`) triggers when reaching bottom or on mouse wheel down, revealing hidden loader and auto-loading more cards. | **Direct Violation:** Implements infinite scroll and page lift animations. |
| **4-Part Action Card** | Every update must state: What happened, Why it matters, How it affects you, What to do next. | Only rendered fully on `/about`. The main feed (`/`) drops parts 3 and 4 entirely. | **Divergence:** Core brand premise is missing from the actual reading experience. |
| **FT / The Verge Typography** | Sophisticated editorial typography with intentional serif headlines and sans body. | Default system serif used for headlines without custom serif font loading. Space Grotesk is declared but underutilized. | **Partial:** Aesthetic direction is present, but font execution lacks curated editorial typography. |
| **Linear / Raycast Density** | High density, structured metadata, precise keyboard interactions. | Bento cards achieve good visual density, but lack keyboard shortcuts, card focus states, and quick actions. | **Partial:** Visual layout has good density, but interaction model is standard web point-and-click. |
| **Relevance Feedback** | Mark cards as useful/not useful to continuously train ranking model. | No voting or rating icons exist on cards. | **Missing:** Feature not yet implemented in frontend. |
