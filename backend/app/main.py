import secrets
import time
import uuid
from collections import defaultdict
from threading import Lock
from typing import Dict, List

from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.ai_service import ai_match_topics
from app.auth import ALGORITHM, SECRET_KEY, create_access_token, get_password_hash, verify_password
from app.config import settings
from app.database import get_db
from app.feed_service import get_live_briefings, search_topic_briefings
from app.models import UserProfile
from app.schemas import (
    BriefingCard,
    ChatRequest,
    ChatResponse,
    HealthResponse,
    IngestResponse,
    SupabaseAuthSync,
    Token,
    TopicSearchResponse,
    UserProfileCreate,
    UserProfileResponse,
    UserRegister,
)

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
    "eBPF & System Observability",
]

API_DESCRIPTION = """
## Overview
**Becon AI** delivers hyper-personalized, executive-density intelligence briefings tailored to the reader's exact professional role, focus stacks, and industry sectors.

## Authentication Workflow
1. **Register**: Create an account via [`POST /api/register`](#/Auth/register_api_register_post) with your email and password.
2. **Authorize**: Click the green **Authorize** button at the top right of this Swagger UI page.
3. **Login Credentials**: Enter your registered email into the **username** field and your password into the **password** field, then click **Authorize**.
4. **Access Protected Endpoints**: Endpoints under the **Profile** and **Onboarding** tags will now automatically send your Bearer JWT access token.
"""

OPENAPI_TAGS = [
    {
        "name": "Health",
        "description": "System health and operational telemetry status endpoints.",
    },
    {
        "name": "Briefings",
        "description": "Real-time AI briefings, customized subject search, and broadsheet feed generation.",
    },
    {
        "name": "Auth",
        "description": "User registration and OAuth2 password-bearer authentication.",
    },
    {
        "name": "Profile",
        "description": "Authenticated user profile management and personalized intelligence preferences.",
    },
    {
        "name": "Onboarding",
        "description": "Conversational AI assistant for progressive profile extraction and setup.",
    },
    {
        "name": "Ingestion",
        "description": "Background RSS multi-feed ingestion and cache pre-warming triggers.",
    },
]

app = FastAPI(
    title="Becon AI Intelligence Briefing API",
    description=API_DESCRIPTION,
    version="1.0.0",
    openapi_tags=OPENAPI_TAGS,
    contact={
        "name": "Becon Intelligence Team",
        "url": "https://becon.dev",
        "email": "support@becon.dev",
    },
    license_info={
        "name": "MIT License",
        "url": "https://opensource.org/licenses/MIT",
    },
    docs_url="/docs" if settings.ENABLE_DOCS else None,
    redoc_url="/redoc" if settings.ENABLE_DOCS else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_guest_ip_log: Dict[str, List[float]] = defaultdict(list)
_guest_lock = Lock()


def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "127.0.0.1"


@app.get(
    "/",
    tags=["Health"],
    summary="System health status",
    response_model=HealthResponse,
)
def read_root():
    """
    Checks the service operational status and returns current intelligence engine metadata.
    """
    return {
        "status": "online",
        "app": "Becon AI Intelligence Briefing",
        "engine": "Becon AI Intelligence (Personalized & Structured)",
    }


@app.get(
    "/api/briefings",
    tags=["Briefings"],
    summary="Fetch personalized intelligence cards",
    response_model=List[BriefingCard],
)
def get_briefings(
    stack: str = Query(
        default="All",
        description="Filter by topic or category tag",
        examples=["All", "Python, Data & Analytics", "React & Next.js Systems"],
    ),
    role: str = Query(
        default="Professional",
        description="Target role or profession of reading user",
        examples=["Senior Full Stack Engineer", "Accountant / Finance", "Retail Store Owner"],
    ),
    interests: str = Query(
        default="",
        description="Comma-separated list of focus areas, technologies, and industry interests",
        examples=[".NET Core, Angular, Python", "Tax Regulations, GST, Accounting"],
    ),
    custom_prompt: str = Query(
        default="",
        description="Custom user editorial instruction for Gemini AI personalization",
        examples=["Focus on architectural trade-offs, security, and scalability."],
    ),
    refresh: bool = Query(
        default=False,
        description="Force re-fetch from live RSS feeds and regenerate AI cards",
    ),
    page: int = Query(
        default=1,
        ge=1,
        description="Page number for pagination",
        examples=[1, 2],
    ),
    limit: int = Query(
        default=16,
        ge=1,
        le=50,
        description="Maximum number of briefing cards to return per page",
        examples=[6, 16],
    ),
    scope: str = Query(
        default="all",
        description="Scope of briefings: 'top' (top 5 for fast initial render), 'remaining' (lazy-loaded remaining cards), or 'all'",
        examples=["all", "top", "remaining"],
    ),
    offset: int = Query(
        default=None,
        description="Direct card offset for continuous infinite scroll pagination",
        examples=[0, 6, 12],
    ),
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
        offset=offset,
    )


@app.get(
    "/api/search-topic",
    tags=["Briefings"],
    summary="Synthesize live cards for a custom topic",
    response_model=List[BriefingCard],
)
def get_search_topic_briefings(
    query: str = Query(
        ...,
        min_length=1,
        description="Topic or favorite subject to search and synthesize into briefing cards",
        examples=["punjabi", "generative ai", "retail inventory", "rust programming"],
    ),
    role: str = Query(
        default="Professional",
        description="Target professional role of reading user",
        examples=["Professional", "Data Engineer", "Founder"],
    ),
    limit: int = Query(
        default=6,
        ge=1,
        le=12,
        description="Number of synthesized cards to return",
        examples=[6],
    ),
    offset: int = Query(
        default=0,
        ge=0,
        description="Offset for infinite scroll pagination across search results",
        examples=[0, 6, 12],
    ),
    page: int = Query(
        default=1,
        ge=1,
        description="Page number for pagination tracking",
        examples=[1, 2],
    ),
):
    """
    Synthesizes real-time intelligence cards tailored to any specific favorite subject or topic using Gemini AI.
    Paginates dynamically across live RSS items.
    """
    return search_topic_briefings(topic=query, user_role=role, limit=limit, offset=offset, page=page)


@app.get(
    "/api/topic-search",
    tags=["Briefings"],
    summary="Semantic topic search & catalog autocomplete",
    response_model=TopicSearchResponse,
)
def search_topics(
    q: str = Query(
        ...,
        min_length=1,
        description="Search query to match against predefined topics",
        examples=["python", "cloud", "taxes", "angular"],
    ),
):
    """
    Uses Gemini AI to semantically match a search query against available topics.
    Returns up to 3 related topics from the predefined catalog.
    """
    matched = ai_match_topics(query=q, available_topics=AVAILABLE_TOPICS, max_results=3)
    return {"query": q, "matches": matched}


@app.post(
    "/api/ingest",
    tags=["Ingestion"],
    summary="Trigger background feed ingestion",
    response_model=IngestResponse,
    responses={
        401: {"description": "Unauthorized - Missing or invalid X-Ingest-Token header"},
        503: {"description": "Service Unavailable - Ingestion token is not configured on server"},
    },
)
def trigger_ingestion(
    background_tasks: BackgroundTasks,
    x_ingest_token: str | None = Header(default=None, alias="X-Ingest-Token"),
):
    """
    Triggers asynchronous polling and synthesis across all configured RSS feeds in the background.
    Protected by X-Ingest-Token header matching INGEST_API_TOKEN.
    """
    if not settings.INGEST_API_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Ingest API token is not configured on server (INGEST_API_TOKEN unset).",
        )
    if not x_ingest_token or not secrets.compare_digest(x_ingest_token, settings.INGEST_API_TOKEN):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-Ingest-Token header.",
        )

    background_tasks.add_task(get_live_briefings, force_refresh=True)
    return {
        "message": "Real-time AI feed ingestion triggered in background",
        "status": "processing",
    }


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/login")


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


@app.get(
    "/api/profile",
    tags=["Profile"],
    summary="Get authenticated user profile",
    response_model=UserProfileResponse,
    responses={
        401: {"description": "Unauthorized - Missing or invalid Bearer JWT token"},
    },
)
def get_profile(current_user: UserProfile = Depends(get_current_user)):
    """
    Retrieves the authenticated user's profile, including role, experience, focus topics, and custom AI prompt.
    """
    return current_user


@app.post(
    "/api/profile",
    tags=["Profile"],
    summary="Update authenticated user profile",
    response_model=UserProfileResponse,
    responses={
        401: {"description": "Unauthorized - Missing or invalid Bearer JWT token"},
        422: {"description": "Validation Error - Invalid profile payload"},
    },
)
def update_profile(
    profile_data: UserProfileCreate,
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Updates the authenticated user's profile settings and preferences in the database.
    """
    for key, value in profile_data.model_dump().items():
        setattr(current_user, key, value)
    db.commit()
    db.refresh(current_user)
    return current_user


@app.post(
    "/api/register",
    tags=["Auth"],
    summary="Register a new user account",
    response_model=Token,
    responses={
        400: {"description": "Email already registered"},
        422: {"description": "Validation Error - Invalid registration data"},
    },
)
def register(user_data: UserRegister, db: Session = Depends(get_db)):
    """
    Registers a new user account with bcrypt password hashing and returns an initial access token.
    """
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
        interests="",
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    access_token = create_access_token(data={"sub": new_user.email})
    return {"access_token": access_token, "token_type": "bearer"}


@app.post(
    "/api/login",
    tags=["Auth"],
    summary="OAuth2 password login & token generation",
    response_model=Token,
    responses={
        401: {"description": "Incorrect email or password"},
        422: {"description": "Validation Error - Invalid login form data"},
    },
)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """
    Authenticates user credentials (email entered in username field) and returns an OAuth2 Bearer JWT.
    """
    user = db.query(UserProfile).filter(UserProfile.email == form_data.username).first()
    if not user or not user.password_hash or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}


@app.post(
    "/api/auth/supabase-sync",
    tags=["Auth"],
    summary="Sync Supabase OAuth (Google) user with Becon backend",
    response_model=Token,
    responses={
        400: {"description": "Invalid sync payload"},
        422: {"description": "Validation Error"},
    },
)
def supabase_auth_sync(payload: SupabaseAuthSync, db: Session = Depends(get_db)):
    """
    Syncs user authenticated via Supabase Google OAuth into the Becon database.
    Stores/updates their real Gmail profile picture (picture_url), name, and issues a Becon JWT.
    """
    email = payload.email.strip().lower()
    user = db.query(UserProfile).filter(UserProfile.email == email).first()

    clean_name = payload.name.strip() if payload.name else email.split("@")[0].capitalize()

    if not user:
        user = UserProfile(
            name=clean_name,
            email=email,
            picture_url=payload.picture_url,
            auth_provider=payload.provider or "google",
            role="",
            interests="",
            experience="",
            customPrompt="",
            aiTone="",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        updated = False
        if payload.picture_url and user.picture_url != payload.picture_url:
            user.picture_url = payload.picture_url
            updated = True
        if payload.name and user.name in ("User", "", None):
            user.name = clean_name
            updated = True
        if payload.provider and user.auth_provider != payload.provider:
            user.auth_provider = payload.provider
            updated = True
        if updated:
            db.commit()
            db.refresh(user)

    access_token = create_access_token(data={"sub": user.email, "provider": user.auth_provider or "google"})
    return {"access_token": access_token, "token_type": "bearer"}


@app.post(
    "/api/auth/guest",
    tags=["Auth"],
    summary="Instant guest exploration mode",
    response_model=Token,
    responses={
        422: {"description": "Validation Error"},
        429: {"description": "Too Many Requests - Rate limit exceeded for guest accounts"},
    },
)
def guest_auth(request: Request, db: Session = Depends(get_db)):
    """
    Creates an instant guest session with default engineering intelligence preferences.
    Requires zero credentials or personal data. Rate-limited per client IP.
    """
    client_ip = get_client_ip(request)
    now = time.time()
    cutoff = now - 3600.0  # 1 hour window

    with _guest_lock:
        valid_timestamps = [t for t in _guest_ip_log[client_ip] if t > cutoff]
        if len(valid_timestamps) >= settings.GUEST_RATE_LIMIT_PER_HOUR:
            _guest_ip_log[client_ip] = valid_timestamps
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many guest accounts created from this IP. Limit is {settings.GUEST_RATE_LIMIT_PER_HOUR} per hour.",
            )
        valid_timestamps.append(now)
        _guest_ip_log[client_ip] = valid_timestamps

    guest_uuid = uuid.uuid4().hex[:8]
    guest_email = f"guest_{guest_uuid}@guest.becon.local"

    guest_user = UserProfile(
        name="Guest Reader",
        email=guest_email,
        role="Technology Explorer",
        interests="AI & Generative Models, Cloud Architecture, Full-Stack Development",
        experience="Curious",
        auth_provider="guest",
        picture_url=None,
    )
    db.add(guest_user)
    db.commit()
    db.refresh(guest_user)

    access_token = create_access_token(data={"sub": guest_user.email, "provider": "guest"})
    return {"access_token": access_token, "token_type": "bearer"}


@app.post(
    "/api/onboarding/chat",
    tags=["Onboarding"],
    summary="Onboarding conversational chat endpoint",
    response_model=ChatResponse,
    responses={
        401: {"description": "Unauthorized - Missing or invalid Bearer JWT token"},
        422: {"description": "Validation Error - Invalid chat history format"},
    },
)
def onboarding_chat_endpoint(
    chat_request: ChatRequest,
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Processes chat messages with the onboarding conversational agent.
    When onboarding completes, automatically updates the user profile in the database.
    """
    from app.ai_service import ai_onboarding_chat

    response = ai_onboarding_chat(chat_request.messages, AVAILABLE_TOPICS)

    if response.onboarding_complete and response.extracted_data:
        if response.extracted_data.name:
            current_user.name = response.extracted_data.name
        if response.extracted_data.role:
            current_user.role = response.extracted_data.role
        if response.extracted_data.experience:
            current_user.experience = response.extracted_data.experience
        if response.extracted_data.interests:
            current_user.interests = response.extracted_data.interests
        db.commit()

    return response
