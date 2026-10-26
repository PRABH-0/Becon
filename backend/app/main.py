from typing import List, Any, Dict
from fastapi import FastAPI, Query, BackgroundTasks, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import UserProfile
from fastapi import HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from app.auth import get_password_hash, verify_password, create_access_token
from jose import JWTError, jwt
from app.auth import SECRET_KEY, ALGORITHM
from app.schemas import BriefingCard, UserProfileCreate, UserProfileResponse, UserRegister, Token, ChatRequest, ChatResponse
from app.feed_service import get_live_briefings, search_topic_briefings
from app.ai_service import ai_match_topics

AVAILABLE_TOPICS = [
    "Tax Regulations & GST Compliance",
    "Retail & Shop Inventory Management",
    "Small Business Growth & Finance",
    "E-Commerce & Digital Sales",
    "Corporate Accounting & Audit Standards",
    "Artificial Intelligence & Productivity Tools",
    "Customer Retention & Retail POS",
    "Financial Forecasting & Cash Flow",
    "Digital Marketing & Social Selling",
    "Software Engineering & Web Apps",
    "Python, Data & Analytics",
    "Cloud Tools & Cyber Security",
    "Supply Chain & Vendor Management",
    "Banking, Payments & Fintech",
    "Business Law & Regulatory Filings",
    "Modern Cloud & Systems Architecture",
    ".NET Core & Minimal APIs",
    "C# Architecture & Microservices",
    "Angular & Web Frameworks",
    "React & Next.js Systems",
    "Python & FastAPI Setup",
    "Rust Programming Language",
    "Go & High-Performance Services",
    "Docker & Containerization",
    "Google Gemini & Generative AI",
    "Kubernetes & DevOps Pipelines",
    "Cloud Infrastructure & Azure",
    "TypeScript & Modern Tooling",
    "SQL & Vector Databases",
    "Micro-Frontends & Module Federation",
    "Zero-Trust Cloud Security",
    "eBPF & System Observability"
]

app = FastAPI(
    title="Becon AI Intelligence Briefing API",
    description="Personalized AI-Powered daily intelligence briefings for users across all professions",
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
        "app": "Becon AI Intelligence Briefing",
        "engine": "Becon AI Intelligence (Personalized & Structured)"
    }

@app.get("/api/briefings")
def get_briefings(
    stack: str = Query(default="All", description="Filter by topic or category"),
    role: str = Query(default="Professional", description="Target role or profession of reading user"),
    interests: str = Query(default="", description="Comma-separated list of focus areas and interests"),
    custom_prompt: str = Query(default="", description="Custom user instruction for Gemini AI"),
    refresh: bool = Query(default=False, description="Force re-fetch from live web and regenerate AI summaries"),
    page: int = Query(default=1, ge=1, description="Page number for pagination"),
    limit: int = Query(default=16, ge=1, le=50, description="Items per page"),
    scope: str = Query(default="all", description="Scope of briefings: 'top' (top 5 for fast initial render), 'remaining' (lazy-loaded remaining cards), or 'all'"),
    offset: int = Query(default=None, description="Direct offset for infinite scroll pagination")
):
    """
    Returns real-time intelligence cards tailored to the user's specific profession, interests, and preferences.
    Supports progressive loading (scope='top' then scope='remaining') and direct offset infinite scroll.
    """
    return get_live_briefings(
        force_refresh=refresh,
        user_role=role,
        user_interests=interests,
        custom_prompt=custom_prompt,
        page=page,
        limit=limit,
        scope=scope,
        offset=offset
    )

@app.get("/api/search-topic")
def get_search_topic_briefings(
    query: str = Query(..., min_length=1, description="Topic or favorite subject to search"),
    role: str = Query(default="Professional", description="Target role of reading user"),
    limit: int = Query(default=6, ge=1, le=12, description="Number of cards to synthesize")
):
    """
    Synthesizes real-time intelligence cards tailored to any specific favorite subject or topic using Gemini AI.
    """
    return search_topic_briefings(topic=query, user_role=role, limit=limit)

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


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = db.query(UserProfile).filter(UserProfile.email == email).first()
    if user is None:
        raise credentials_exception
    return user

@app.get("/api/profile", response_model=UserProfileResponse)
def get_profile(current_user: UserProfile = Depends(get_current_user)):
    return current_user

@app.post("/api/profile", response_model=UserProfileResponse)
def update_profile(profile_data: UserProfileCreate, current_user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)):
    for key, value in profile_data.model_dump().items():
        setattr(current_user, key, value)
    db.commit()
    db.refresh(current_user)
    return current_user

@app.post("/api/register", response_model=Token)
def register(user_data: UserRegister, db: Session = Depends(get_db)):
    existing_user = db.query(UserProfile).filter(UserProfile.email == user_data.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = get_password_hash(user_data.password)
    
    new_user = UserProfile(
        name=user_data.name if user_data.name else "User",
        email=user_data.email,
        password_hash=hashed_password,
        role="",
        experience="",
        interests=""
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    access_token = create_access_token(data={"sub": new_user.email})
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/api/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(UserProfile).filter(UserProfile.email == form_data.username).first()
    if not user or not user.password_hash or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/api/onboarding/chat", response_model=ChatResponse)
def onboarding_chat_endpoint(chat_request: ChatRequest, current_user: UserProfile = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.ai_service import ai_onboarding_chat
    
    response = ai_onboarding_chat(chat_request.messages, AVAILABLE_TOPICS)
    
    if response.onboarding_complete and response.extracted_data:
        if response.extracted_data.name: current_user.name = response.extracted_data.name
        if response.extracted_data.role: current_user.role = response.extracted_data.role
        if response.extracted_data.experience: current_user.experience = response.extracted_data.experience
        if response.extracted_data.interests: current_user.interests = response.extracted_data.interests
        db.commit()
        
    return response
