from typing import List
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from app.schemas import BriefingCard, BriefingCardContent, ActionGuidance

app = FastAPI(
    title="Becon AI Career Briefing API",
    description="Personalized AI-Powered career briefings for developers",
    version="1.0.0"
)

# 1. Enable CORS so Next.js frontend can call FastAPI
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
        "app": "Becon AI Career News Briefing"
    }

# 2. GET Endpoint returning typed Briefing Cards
@app.get("/api/briefings", response_model=List[BriefingCard])
def get_briefings(stack: str = Query(default="Frontend", description="Filter by tech stack")):
    # Sample mock data returning 4-part action card matching Pydantic schema
    return [
        BriefingCard(
            id="card-1",
            rank=1,
            title=f"{stack} Ecosystem Updates & Performance Practices",
            source_url="https://dev.to",
            target_role="Developer",
            target_stack=[stack, "TypeScript"],
            card_content=BriefingCardContent(
                what_happened=[
                    f"New release updates and optimization tools announced for {stack}.",
                    "Improved compiler performance and lower runtime overhead."
                ],
                why_it_matters="Reduces build times and enhances application response speeds in production.",
                how_it_affects_you=f"Directly accelerates your local dev build cycles when developing with {stack}.",
                what_to_do_next=ActionGuidance(
                    action_type="prepare",
                    guidance=f"Review dependency tree for {stack} and test upgrading minor versions in a topic branch."
                )
            )
        )
    ]

# 3. POST Endpoint to trigger RSS & AI Summarization (Stub for Step 6 & 7)
@app.post("/api/ingest")
def trigger_ingestion():
    return {
        "message": "Ingestion triggered successfully",
        "status": "pending"
    }
