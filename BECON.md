# 🚀 Becon: AI-Powered Career News Briefing

> **Distraction-Free, Actionable Daily Briefings Tailored to Your Role & Tech Stack**

---

## 📌 Executive Summary

**Becon** is an AI-powered daily briefing tool designed to eliminate social media noise and information overload for professionals. Instead of scrolling endlessly through Twitter/X, YouTube, Hacker News, or Reddit, users receive a short, curated **3–7 minute daily briefing** containing structured, actionable updates relevant specifically to their role and technology stack.

---

## 💥 1. The Problem

Professionals in technology (and eventually other industries) face daily challenges staying updated on rapid industry changes, new tools, and career signals:

* ⌛ **Wasted Time**: Endless scrolling through algorithms optimized for engagement rather than signal.
* 🌀 **Frequent Distraction**: Important technical updates are buried under drama, memes, and opinion threads.
* 🔁 **Information Repetition**: The same news item appears across multiple platforms with varying levels of quality.
* ❓ **Lack of Actionable Advice**: Existing news tells you *what* happened, but rarely tells you *what to do about it*.

---

## 💡 2. The Solution

Becon acts as a distraction-free, intelligent "career newspaper" that automates the fetch-dedupe-rank-summarize pipeline:

```
[ Trusted Sources (RSS / Official Blogs) ]
                   │
                   ▼
  [ 1. Fetch & Async Data Pipeline ]
                   │
                   ▼
     [ 2. Vector / AI Deduplication ]
                   │
                   ▼
  [ 3. Role & Stack Relevance Ranking ]
                   │
                   ▼
 [ 4. Google Gemini 4-Part Summarization ]
                   │
                   ▼
[ 5. Next.js Distraction-Free Card Feed ]
```

### Key Workflow
1. **User Selects Role & Stack**: (e.g., *Developer → Frontend / .NET / Angular / DevOps*).
2. **System Ingests Data**: Collects release notes, security advisories, and official engineering blog posts.
3. **AI Filters & Deduplicates**: Groups identical news items and ranks them by impact.
4. **Structured Generation**: Google Gemini generates a personalized 4-part action card for each item.

---

## 🃏 3. What the User Sees: The 4-Part Action Card

Every update is rendered as a clean, scannable card divided into four distinct components:

| Section | Description |
| :--- | :--- |
| 📌 **What Happened** | 1–2 concise bullet points summarizing the core event or release. |
| 💡 **Why It Matters** | High-level industry relevance and architectural implications. |
| 👤 **How It Affects You** | Direct personal impact on your specific role and tech stack. |
| 🎯 **What To Do Next** | Categorized tactical guidance (**Learn**, **Apply**, **Avoid**, or **Prepare**). |

---

## 🏗️ 4. Technology Stack & Architecture

### **Frontend**
* **Framework**: Next.js 15 (React, TypeScript, App Router)
* **Styling**: Tailwind CSS with custom glassmorphism dark theme (`slate-950` palette)
* **UX/UI**: Dynamic stack filter pills, live preview fallback state, responsive grid layouts

### **Backend**
* **Framework**: FastAPI (Python 3.12)
* **Data Schemas**: Pydantic v2 (`BriefingCard`, `BriefingCardContent`, `ActionGuidance`)
* **Server**: Uvicorn with auto-reload (`uvicorn app.main:app --reload`)
* **Middleware**: CORS middleware enabling secure client-server communication

### **AI Integration & Pipeline**
* **Model**: Google Gemini API (`google-genai` / `gemini-1.5-flash`)
* **Prompt Engineering**: Structured Pydantic schema enforcement to guarantee JSON responses
* **Data Ingestion**: `feedparser` (RSS/Atom feeds), `httpx` (Async HTTP fetching)

---

## 🎯 5. MVP Scope (Phase 1 — Developers)

| Area | Scope & Details |
| :--- | :--- |
| **Target Audience** | Software Engineers (Frontend, Backend, .NET, Angular, DevOps, Mobile) |
| **Content Sections** | **Build & Ship** (tooling, security, framework updates)<br>**Career Market** (layoffs, hiring trends, org shifts) |
| **Delivery** | Fast-loading Web Application + optional daily email digest |

---

## 🌟 6. Why Becon Succeeds & Strategic Real-World Value

1. **Universal Daily Pain**: Tech updates change weekly. Becon converts frustration into a structured 3-minute morning routine.
2. **Defensible Personalization**: Layoffs or framework deprecations affect a React developer completely differently than a DevOps engineer. Stack-specific filtering provides high signal.
3. **Action-Oriented Output**: The **"What to do next"** card turns passive reading into proactive career planning.
4. **Scalable Engine**: The core pipeline (*Fetch → Dedupe → Rank → Summarize*) scales seamlessly to other professions (Finance, Healthcare, Marketing) by simply updating the feed list and relevance prompts.

---

## 🎓 7. Purpose & Next Steps

### **Current Purpose**
Primary goal is to build a high-impact portfolio application demonstrating full-stack engineering, cloud architecture, Python FastAPI development, and LLM orchestration (Google Gemini).

### **Roadmap & Next Steps**
- [x] Step 1: Environment Setup & FastAPI Hello World
- [x] Step 2: Pydantic Schema Design (`schemas.py`)
- [x] Step 3: FastAPI Endpoints & Next.js Frontend Integration (`main.py` + CORS)
- [ ] Step 4: Build RSS Ingestion Engine (`feed_service.py`)
- [ ] Step 5: Implement Google Gemini Summarization Engine (`ai_service.py`)
- [ ] Step 6: Connect Ingestion Pipeline to `POST /api/ingest`
- [ ] Step 7: Live Demo Deployment & User Feedback Gathering
