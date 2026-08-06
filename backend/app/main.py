from typing import List, Any, Dict
from fastapi import FastAPI, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from app.schemas import BriefingCard
from app.feed_service import get_live_briefings
from app.ai_service import ai_match_topics

AVAILABLE_TOPICS = [
    ".NET Core & Minimal APIs",
    "C# Architecture & Microservices",
    "Angular & Web Frameworks",
    "React & Next.js Systems",
    "Python & FastAPI Setup",
    "Google Gemini & Generative AI",
    "Kubernetes & DevOps Pipelines",
    "Cloud Infrastructure & Azure",
    "SQL & Vector Databases",
    "Micro-Frontends & Module Federation",
    "Zero-Trust Cloud Security",
    "eBPF & System Observability"
]

app = FastAPI(
    title="Becon AI Career Briefing API",
    description="Personalized AI-Powered career briefings for developers",
    version="1.2.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {
        "status": "online",
        "app": "Becon AI Career News Briefing",
        "engine": "Google Gemini 1.5 Flash (Personalized & Structured)"
    }

@app.get("/api/briefings")
def get_briefings(
    stack: str = Query(default="All", description="Filter by tech stack"),
    role: str = Query(default="Senior Software Engineer", description="Target role of reading engineer"),
    interests: str = Query(default="", description="Comma-separated list of tech stack focus areas"),
    custom_prompt: str = Query(default="", description="Custom developer instruction for Gemini AI"),
    refresh: bool = Query(default=False, description="Force re-fetch from live web and regenerate AI summaries")
):
    """
    Returns real-time developer news cards tailored to the user's specific engineering identity and stack.
    """
    return get_live_briefings(
        force_refresh=refresh,
        user_role=role,
        user_interests=interests,
        custom_prompt=custom_prompt
    )

@app.get("/api/topic-search")
def search_topics(
    q: str = Query(..., min_length=1, description="Search query for topic matching"),
):
    """
    Uses Gemini AI to semantically match a search query against available topics.
    Returns up to 3 related topics from the predefined list.
    """
    matched = ai_match_topics(query=q, available_topics=AVAILABLE_TOPICS, max_results=3)
    return {"query": q, "matches": matched}

@app.post("/api/ingest")
def trigger_ingestion(background_tasks: BackgroundTasks):
    background_tasks.add_task(get_live_briefings, force_refresh=True)
    return {
        "message": "Real-time AI feed ingestion triggered in background",
        "status": "processing"
    }
