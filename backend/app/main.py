import hmac
import logging
import re
import time
import uuid

from fastapi import (
    BackgroundTasks,
    Depends,
    FastAPI,
    Header,
    HTTPException,
    Query,
    Request,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.ai_service import ai_match_topics
from app.config import settings
from app.database import get_db
from app.deps import get_current_user, get_optional_user
from app.feed_service import get_live_briefings, search_topic_briefings
from app.ingestion import run_ingestion_pipeline
from app.logging_config import request_id_ctx_var, setup_logging
from app.models import FocusTopic, TopicAlias, UserProfile
from app.rate_limit import (
    GeminiQuotaExceededError,
    enforce_auth_ai_rate_limit,
    enforce_public_rate_limit,
)
from app.schemas import (
    BriefingCard,
    BriefingSearchResponse,
    ChatRequest,
    ChatResponse,
    HealthResponse,
    IngestCounts,
    IngestResponse,
    MatchTopicsRequest,
    TopicSearchResponse,
    UserMeResponse,
    UserProfileCreate,
    UserProfileResponse,
)
from app.supabase_auth import (
    SupabaseAuthNotConfiguredError,
    delete_supabase_user_admin,
    log_verification_modes,
)

setup_logging(environment=settings.ENVIRONMENT, log_level=settings.LOG_LEVEL)
log_verification_modes()
logger = logging.getLogger("becon.api")

REQUEST_ID_REGEX = re.compile(r"^[A-Za-z0-9._-]{1,64}$")

AVAILABLE_TOPICS = [
    "AI & Generative Models",
    "Cloud Architecture & AWS",
    "Kubernetes & Containers",
    "Full-Stack Development (React, Next.js, Node)",
    "Systems Programming (Rust, Go)",
    "Backend & Distributed Systems (.NET, Java, Python)",
    "DevOps & Platform Engineering",
    "Security & Vulnerabilities (CVE, OWASP)",
    "Data Engineering & Databases",
    "System Design & Scalability",
]

API_DESCRIPTION = """
### Becon AI Intelligence Briefing Engine (API v1.0)
Becon is an editorial-first, newspaper-style intelligence briefing web application for engineers.
It aggregates, clusters, deduplicates, and synthesizes developer news into high-signal,
action-oriented cards with four consistent dimensions:
1. **What Happened** (concise summary bullets)
2. **Why It Matters** (macro industry & professional impact)
3. **How It Affects You** (hyper-personalized relevance based on role & stack)
4. **What To Do Next** (specific tactical guidance categorized as *learn*, *apply*, *avoid*, or *prepare*)

---
### Authentication Model
Authentication is delegated entirely to **Supabase Auth**.
- The browser authenticates via Supabase Auth (email/password, OAuth, or anonymous exploration).
- Pass the issued Supabase JWT as `Authorization: Bearer <token>` to protected endpoints.
- The backend verifies tokens asymmetrically using Supabase JWKS (ES256/RS256) or via legacy HS256 secret.
"""

OPENAPI_TAGS = [
    {
        "name": "Health",
        "description": "System health, readiness probes, and core operational metrics.",
    },
    {
        "name": "Briefings",
        "description": "Personalized 4-part intelligence cards derived from live official tech feeds.",
    },
    {
        "name": "Auth",
        "description": "Supabase identity verification, user account management, and profile state.",
    },
    {
        "name": "Profile",
        "description": "User profile settings, engineering stack, custom prompt directives, and tone preference.",
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

CORS_ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
CORS_ALLOWED_HEADERS = [
    "Authorization",
    "Content-Type",
    "Accept",
    "X-Request-ID",
    "X-Ingest-Token",
]
CORS_EXPOSED_HEADERS = ["X-Request-ID", "Retry-After"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=CORS_ALLOWED_METHODS,
    allow_headers=CORS_ALLOWED_HEADERS,
    expose_headers=CORS_EXPOSED_HEADERS,
)


@app.exception_handler(GeminiQuotaExceededError)
async def gemini_quota_exceeded_handler(request: Request, exc: GeminiQuotaExceededError):
    return JSONResponse(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        content={"detail": exc.detail},
        headers={"Retry-After": str(exc.retry_after)},
    )


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    incoming_id = request.headers.get("x-request-id")
    if incoming_id and REQUEST_ID_REGEX.match(incoming_id):
        request_id = incoming_id
    else:
        request_id = uuid.uuid4().hex

    token = request_id_ctx_var.set(request_id)
    start_time = time.perf_counter()
    try:
        response = await call_next(request)
        duration_ms = (time.perf_counter() - start_time) * 1000.0
        logger.info(
            f"{request.method} {request.url.path} {response.status_code} - {duration_ms:.2f}ms",
            extra={
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": round(duration_ms, 2),
            },
        )
        response.headers["X-Request-ID"] = request_id
        return response
    except Exception as exc:
        duration_ms = (time.perf_counter() - start_time) * 1000.0
        logger.error(
            f"{request.method} {request.url.path} 500 - {duration_ms:.2f}ms - Error: {exc}",
            exc_info=True,
            extra={
                "method": request.method,
                "path": request.url.path,
                "status_code": 500,
                "duration_ms": round(duration_ms, 2),
            },
        )
        raise
    finally:
        request_id_ctx_var.reset(token)


@app.get(
    "/health",
    tags=["Health"],
    summary="Liveness and health check endpoint",
    response_model=dict,
)
def health_check():
    """
    Returns ok status for container health checks and orchestrator probes.
    Does not touch database or external services.
    """
    return {"status": "ok"}


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
    response_model=list[BriefingCard],
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
        description="Direct card offset for explicit pagination slicing",
        examples=[0, 6, 12],
    ),
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db),
    current_user: UserProfile | None = Depends(get_optional_user),
    _: None = Depends(enforce_public_rate_limit),
):
    """
    Returns finite daily briefing cards tailored to the user's profession, interests, and preferences.
    Supports two-phase loading (scope='top' then scope='remaining') and explicit offset pagination.
    Accepts optional Bearer token to personalize based on authenticated user preferences (required for refresh=true).
    """
    if refresh:
        if current_user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required to force refresh briefings.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        enforce_auth_ai_rate_limit(current_user.id, scope="briefings_refresh")

    # Use authenticated profile preferences as defaults if available and not overridden
    effective_role = role
    effective_interests = interests
    effective_prompt = custom_prompt

    if current_user:
        if effective_role in ("Professional", "Developer") and current_user.role:
            effective_role = current_user.role
        if not effective_interests and current_user.interests:
            effective_interests = current_user.interests
        if not effective_prompt and current_user.customPrompt:
            effective_prompt = current_user.customPrompt

    return get_live_briefings(
        db=db,
        background_tasks=background_tasks,
        force_refresh=refresh,
        user_role=effective_role,
        user_interests=effective_interests,
        custom_prompt=effective_prompt,
        page=page,
        limit=limit,
        scope=scope,
        offset=offset,
    )


@app.get(
    "/api/briefings/search",
    tags=["Briefings"],
    summary="Search persisted briefing cards by topic or keyword",
    response_model=BriefingSearchResponse,
)
def search_briefings_endpoint(
    q: str = Query(
        ...,
        min_length=2,
        max_length=200,
        description="Search query string or specific topic name",
        examples=["Docker", "Rust memory safety", "PostgreSQL indexes"],
    ),
    role: str = Query(
        default="Software Engineer",
        max_length=120,
        description="Target professional role for relevance evaluation",
        examples=["Senior Backend Engineer"],
    ),
    limit: int = Query(
        default=10,
        ge=1,
        le=50,
        description="Maximum number of briefing cards to return",
    ),
    offset: int = Query(
        default=0,
        ge=0,
        description="Offset for search result pagination",
    ),
    db: Session = Depends(get_db),
    current_user: UserProfile | None = Depends(get_optional_user),
    _: None = Depends(enforce_public_rate_limit),
):
    """
    Searches persisted briefing cards and returns them in the same BriefingCard shape used by /api/briefings.
    """
    effective_role = current_user.role if (current_user and current_user.role) else role
    result = search_topic_briefings(query=q, user_role=effective_role, db=db, limit=limit, offset=offset)
    return BriefingSearchResponse(**result)


@app.get(
    "/api/topics/search",
    tags=["Profile"],
    summary="Autocomplete canonical focus topics using focus_topics and topic_aliases",
    response_model=TopicSearchResponse,
)
def search_topics_autocomplete(
    q: str = Query(
        ...,
        min_length=1,
        max_length=100,
        description="Topic prefix, name, slug, or alias to match",
        examples=["pyt", "k8s", "nextjs"],
    ),
    limit: int = Query(
        default=10,
        ge=1,
        le=20,
        description="Maximum number of canonical topics to return (default 10)",
    ),
    db: Session = Depends(get_db),
    _: None = Depends(enforce_public_rate_limit),
):
    """
    Public topic autocomplete backed by focus_topics and topic_aliases.
    Prioritizes prefix and exact alias matches, returning deduplicated canonical topic names.
    """
    clean_q = q.strip()
    if not clean_q:
        return TopicSearchResponse(query=q, matches=[])

    q_lower = clean_q.lower()
    substr_pat = f"%{q_lower}%"

    # Find active focus_topics matching by name, slug, or any TopicAlias
    rows = (
        db.query(FocusTopic)
        .outerjoin(TopicAlias, TopicAlias.topic_id == FocusTopic.id)
        .filter(
            FocusTopic.is_active.is_(True),
            or_(
                func.lower(FocusTopic.name).like(substr_pat),
                func.lower(FocusTopic.slug).like(substr_pat),
                func.lower(TopicAlias.alias).like(substr_pat),
            ),
        )
        .distinct()
        .all()
    )

    # Rank: exact name/slug/alias match (0), prefix match (1), substring match (2), then alphabetical
    def _rank_topic(topic: FocusTopic) -> tuple[int, str]:
        name_l = topic.name.lower()
        slug_l = topic.slug.lower()
        aliases_l = [a.alias.lower() for a in (topic.aliases or [])]
        if q_lower == name_l or q_lower == slug_l or q_lower in aliases_l:
            return (0, name_l)
        if name_l.startswith(q_lower) or slug_l.startswith(q_lower) or any(a.startswith(q_lower) for a in aliases_l):
            return (1, name_l)
        return (2, name_l)

    ranked = sorted(rows, key=_rank_topic)
    matches = [t.name for t in ranked[:limit]]
    return TopicSearchResponse(query=clean_q, matches=matches)


@app.post(
    "/api/ai/match-topics",
    tags=["Onboarding"],
    summary="Semantic topic recommendation from user description",
    response_model=dict,
    responses={
        401: {"description": "Unauthorized - Missing or invalid Bearer JWT token"},
        422: {"description": "Validation Error - Description exceeds max length (500 chars)"},
        429: {"description": "Too Many Requests - Per-user rate limit or daily AI quota exceeded"},
    },
)
def match_topics_endpoint(
    payload: MatchTopicsRequest,
    current_user: UserProfile = Depends(get_current_user),
):
    """
    Extracts relevant developer topics from free-form natural language text using Gemini.
    Requires authentication, rate-limits per user, and caps input length at 500 characters.
    """
    enforce_auth_ai_rate_limit(current_user.id, scope="match_topics")
    description = payload.description.strip()
    if not description:
        return {"matched_topics": []}
    matched = ai_match_topics(description, AVAILABLE_TOPICS, user_key=str(current_user.id))
    return {"matched_topics": matched}


@app.post(
    "/api/ingest",
    tags=["Ingestion"],
    summary="Trigger immediate feed fetch and database persistence pipeline",
    response_model=IngestResponse,
    responses={
        401: {"description": "Unauthorized - Missing or invalid X-Ingest-Token"},
        503: {"description": "Service Unavailable - INGEST_API_TOKEN is not configured"},
    },
)
def trigger_ingest(
    db: Session = Depends(get_db),
    x_ingest_token: str | None = Header(default=None, alias="X-Ingest-Token"),
):
    """
    Triggers feed ingestion pipeline and persists sources, raw items, events, and cards in the database.
    Protected by a dedicated secret token header (`X-Ingest-Token`) verified with constant-time comparison.
    """
    if not settings.INGEST_API_TOKEN or not settings.INGEST_API_TOKEN.strip():
        logger.error("Ingest triggered but INGEST_API_TOKEN is not configured on this server")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Ingestion endpoint is disabled because INGEST_API_TOKEN is not configured.",
        )

    expected = settings.INGEST_API_TOKEN.strip().encode("utf-8")
    provided = x_ingest_token.strip().encode("utf-8") if x_ingest_token else b""
    if not x_ingest_token or not hmac.compare_digest(provided, expected):
        logger.warning("Unauthorized ingestion trigger attempt with invalid or missing token")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-Ingest-Token header.",
        )

    stats = run_ingestion_pipeline(db=db)
    return IngestResponse(
        message="Feed ingestion completed successfully",
        status="success",
        sources_fetched=stats.sources_fetched,
        raw_items_new=stats.raw_items_new,
        raw_items_duplicate=stats.raw_items_duplicate,
        events_created=stats.events_created,
        cards_created=stats.cards_created,
        errors=stats.errors,
        counts=IngestCounts(
            sources_fetched=stats.sources_fetched,
            raw_items_new=stats.raw_items_new,
            raw_items_duplicate=stats.raw_items_duplicate,
            events_created=stats.events_created,
            cards_created=stats.cards_created,
            errors=stats.errors,
        ),
    )


# =============================================================================
# User Identity & Account Endpoints (Supabase Auth)
# =============================================================================


@app.get(
    "/api/me",
    tags=["Auth"],
    summary="Get current user identity and profile state",
    response_model=UserMeResponse,
    responses={
        401: {"description": "Unauthorized - Missing or invalid Bearer JWT token"},
        503: {"description": "Service Unavailable - Supabase authentication not configured"},
    },
)
def get_me(current_user: UserProfile = Depends(get_current_user)):
    """
    Returns the authenticated user's profile, authentication metadata, and setup completion status.
    """
    has_completed_setup = bool((current_user.role and current_user.interests) or current_user.profession_id is not None)
    profession_slug = current_user.profession.slug if current_user.profession else None

    return UserMeResponse(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name or "",
        picture_url=current_user.picture_url,
        is_anonymous=current_user.is_anonymous,
        profession=profession_slug,
        timezone=current_user.timezone or "UTC",
        delivery_time=current_user.delivery_time or "07:00",
        email_digest_enabled=current_user.email_digest_enabled,
        has_completed_setup=has_completed_setup,
    )


@app.delete(
    "/api/account",
    tags=["Auth"],
    summary="Permanently delete user account and all personal data",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        204: {"description": "Account successfully deleted"},
        401: {"description": "Unauthorized - Missing or invalid Bearer token"},
        502: {"description": "Bad Gateway - Identity provider deletion failed"},
        503: {"description": "Service Unavailable - Admin deletion key not configured"},
    },
)
async def delete_account(
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Permanently deletes the user's account from Supabase Auth and the local Becon database.
    Cascades remove all follows, bookmarks, and feedback.
    """
    if not settings.SUPABASE_SERVICE_ROLE_KEY or not settings.SUPABASE_URL:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Account deletion is not available: Supabase service role key is not configured.",
        )

    # 1. Delete user from Supabase Auth via Admin API
    if current_user.external_auth_id:
        try:
            await delete_supabase_user_admin(current_user.external_auth_id)
        except SupabaseAuthNotConfiguredError as e:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=str(e),
            ) from e
        except Exception as e:
            logger.error(f"Supabase Admin API account deletion failed: {type(e).__name__}")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Failed to delete account from identity provider.",
            ) from e

    # 2. Delete local user_profiles row in one transaction
    db.delete(current_user)
    db.commit()
    return None


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
    for key, value in profile_data.model_dump(exclude_unset=True).items():
        if key != "id":
            setattr(current_user, key, value)
    db.commit()
    db.refresh(current_user)
    return current_user


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

    enforce_auth_ai_rate_limit(current_user.id, scope="onboarding_chat")
    response = ai_onboarding_chat(chat_request.messages, AVAILABLE_TOPICS, user_key=str(current_user.id))

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
