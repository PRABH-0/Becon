# Becon Project: Interactive Learning & Building Progress

## 📌 Project Overview
**Becon** is a distraction-free, AI-powered daily briefing tool for developers that aggregates career updates, deduplicates them, and generates structured 4-part action cards (*What happened*, *Why it matters*, *How it affects you*, *What to do next*).

---

## 🎯 Learning Goal
The developer (**Prabhjot**) is a **.NET / C# and Angular** engineer learning **Python, FastAPI, and Google Gemini AI Integration** for the first time by **manually writing the backend code step-by-step**.

> ⚠️ **Rule for AI Assistants**: DO NOT automatically generate or modify project code files without explicit permission. Guide Prabhjot in the chat step-by-step so he types and tests the code himself.

---

## ✅ Completed Steps

### Step 1: Environment & Project Initialization
- Created `d:\Prabhjot\WebApplication\Becon\backend`
- Created Python 3.12 Virtual Environment (`venv`) via `python -m venv venv`.

### Step 2: Dependencies (`requirements.txt`)
- Created `requirements.txt` containing:
  - `fastapi>=0.110.0`
  - `uvicorn>=0.28.0`
  - `pydantic>=2.6.0`
  - `google-genai>=0.1.0`
  - `feedparser>=6.0.10`
  - `httpx>=0.27.0`
  - `python-dotenv>=1.0.1`
- Installed dependencies using `.\venv\Scripts\python.exe -m pip install -r requirements.txt`.

### Step 3: First FastAPI Server ("Hello World")
- Created `app/__init__.py` and `app/main.py`.
- Configured root `@app.get("/")` route.
- Ran server using `.\venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000`.
- Verified live Swagger UI docs at `http://127.0.0.1:8000/docs`.

### Step 4: Data Models & Pydantic Schemas (`app/schemas.py`)
- Created `app/schemas.py` containing:
  - `ActionGuidance` (Pydantic model with `Literal["learn", "apply", "avoid", "prepare"]`)
  - `BriefingCardContent` (Personalized 4-part card: *what_happened*, *why_it_matters*, *how_it_affects_you*, *what_to_do_next*)
  - `BriefingCard` (Wrapper model with title, source_url, target_role, target_stack)

### Step 5: Connecting Schemas to API Routes & CORS (`app/main.py`)
- Updated `app/main.py` with `CORS` middleware (`http://localhost:3000`).
- Implemented typed `GET /api/briefings` endpoint using `BriefingCard` schema.
- Added `POST /api/ingest` stub endpoint.

---

## 🚀 NEXT STEP FOR NEW CHAT SESSION

### Step 6: Building `app/ai_service.py` using Google Gemini API (`gemini-1.5-flash`)
In the next step:
1. Create `app/ai_service.py`.
2. Configure Google Gemini API key using `python-dotenv` and `google-genai`.
3. Create prompt generator for generating 4-part action cards from raw text/news items.

