import os
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
from app.schemas import (
    BriefingCard,
    UserProfileCreate,
    UserProfileResponse,
    UserRegister,
    Token,
    ChatRequest,
    ChatResponse,
    HealthResponse,
    TopicSearchResponse,
    IngestResponse,
)
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
        "description": "System health and operational telemetry status endpoints."
    },
    {
        "name": "Briefings",
        "description": "Real-time AI briefings, customized subject search, and broadsheet feed generation."
    },
    {
        "name": "Auth",
        "description": "User registration and OAuth2 password-bearer authentication."
    },
    {
        "name": "Profile",
        "description": "Authenticated user profile management and personalized intelligence preferences."
    },
    {
        "name": "Onboarding",
        "description": "Conversational AI assistant for progressive profile extraction and setup."
    },
    {
        "name": "Ingestion",
        "description": "Background RSS multi-feed ingestion and cache pre-warming triggers."
    }
]

enable_docs = os.getenv("ENABLE_DOCS", "true").strip().lower() in ("true", "1", "yes")

app = FastAPI(
    title="Becon AI Intelligence Briefing API",
    description=API_DESCRIPTION,
    version="1.0.0",
    openapi_tags=OPENAPI_TAGS,
    contact={
        "name": "Becon Intelligence Team",
        "url": "https://becon.dev",
        "email": "support@becon.dev"
    },
    license_info={
        "name": "MIT License",
        "url": "https://opensource.org/licenses/MIT"
    },
    docs_url="/docs" if enable_docs else None,
    redoc_url="/redoc" if enable_docs else None
)

origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get(
    "/",
    tags=["Health"],
    summary="System health status",
    response_model=HealthResponse
)
def read_root():
    """
    Checks the service operational status and returns current intelligence engine metadata.
    """
    return {
        "status": "online",
        "app": "Becon AI Intelligence Briefing",
        "engine": "Becon AI Intelligence (Personalized & Structured)"
    }

@app.get(
    "/api/briefings",
    tags=["Briefings"],
    summary="Fetch personalized intelligence cards",
    response_model=List[BriefingCard]
)
def get_briefings(
    stack: str = Query(
        default="All",
        description="Filter by topic or category tag",
        examples=["All", "Python, Data & Analytics", "React & Next.js Systems"]
    ),
    role: str = Query(
        default="Professional",
        description="Target role or profession of reading user",
        examples=["Senior Full Stack Engineer", "Accountant / Finance", "Retail Store Owner"]
    ),
    interests: str = Query(
        default="",
        description="Comma-separated list of focus areas, technologies, and industry interests",
        examples=[".NET Core, Angular, Python", "Tax Regulations, GST, Accounting"]
    ),
    custom_prompt: str = Query(
        default="",
        description="Custom user editorial instruction for Gemini AI personalization",
        examples=["Focus on architectural trade-offs, security, and scalability."]
    ),
    refresh: bool = Query(
        default=False,
        description="Force re-fetch from live RSS feeds and regenerate AI cards"
    ),
    page: int = Query(
        default=1,
        ge=1,
        description="Page number for pagination",
        examples=[1, 2]
    ),
    limit: int = Query(
        default=16,
        ge=1,
        le=50,
        description="Maximum number of briefing cards to return per page",
        examples=[6, 16]
    ),
    scope: str = Query(
        default="all",
        description="Scope of briefings: 'top' (top 5 for fast initial render), 'remaining' (lazy-loaded remaining cards), or 'all'",
        examples=["all", "top", "remaining"]
    ),
    offset: int = Query(
        default=None,
        description="Direct card offset for continuous infinite scroll pagination",
        examples=[0, 6, 12]
    )
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

@app.get(
    "/api/search-topic",
    tags=["Briefings"],
    summary="Synthesize live cards for a custom topic",
    response_model=List[BriefingCard]
)
def get_search_topic_briefings(
    query: str = Query(
        ...,
        min_length=1,
        description="Topic or favorite subject to search and synthesize into briefing cards",
        examples=["punjabi", "generative ai", "retail inventory", "rust programming"]
    ),
    role: str = Query(
        default="Professional",
        description="Target professional role of reading user",
        examples=["Professional", "Data Engineer", "Founder"]
    ),
    limit: int = Query(
        default=6,
        ge=1,
        le=12,
        description="Number of synthesized cards to return",
        examples=[6]
    ),
    offset: int = Query(
        default=0,
        ge=0,
        description="Offset for infinite scroll pagination across search results",
        examples=[0, 6, 12]
    ),
    page: int = Query(
        default=1,
        ge=1,
        description="Page number for pagination tracking",
        examples=[1, 2]
    )
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
    response_model=TopicSearchResponse
)
def search_topics(
    q: str = Query(
        ...,
        min_length=1,
        description="Search query to match against predefined topics",
        examples=["python", "cloud", "taxes", "angular"]
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
    response_model=IngestResponse
)
def trigger_ingestion(background_tasks: BackgroundTasks):
    """
    Triggers asynchronous polling and synthesis across all configured RSS feeds in the background.
    """
    background_tasks.add_task(get_live_briefings, force_refresh=True)
    return {
        "message": "Real-time AI feed ingestion triggered in background",
        "status": "processing"
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
        401: {"description": "Unauthorized - Missing or invalid Bearer JWT token"}
    }
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
        422: {"description": "Validation Error - Invalid profile payload"}
    }
)
def update_profile(
    profile_data: UserProfileCreate,
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db)
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
        422: {"description": "Validation Error - Invalid registration data"}
    }
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
        interests=""
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
        422: {"description": "Validation Error - Invalid login form data"}
    }
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
    "/api/onboarding/chat",
    tags=["Onboarding"],
    summary="Onboarding conversational chat endpoint",
    response_model=ChatResponse,
    responses={
        401: {"description": "Unauthorized - Missing or invalid Bearer JWT token"},
        422: {"description": "Validation Error - Invalid chat history format"}
    }
)
def onboarding_chat_endpoint(
    chat_request: ChatRequest,
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Processes chat messages with the onboarding conversational agent.
    When onboarding completes, automatically updates the user profile in the database.
    """
    from app.ai_service import ai_onboarding_chat
    
    response = ai_onboarding_chat(chat_request.messages, AVAILABLE_TOPICS)
    
    if response.onboarding_complete and response.extracted_data:
        if response.extracted_data.name: current_user.name = response.extracted_data.name
        if response.extracted_data.role: current_user.role = response.extracted_data.role
        if response.extracted_data.experience: current_user.experience = response.extracted_data.experience
        if response.extracted_data.interests: current_user.interests = response.extracted_data.interests
        db.commit()
        
    return response
