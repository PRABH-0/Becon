import hmac
import logging
import re
import time
import uuid
from datetime import UTC, datetime
from typing import Any

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

from app.briefing_service import invalidate_daily_briefing_cache
from app.config import settings
from app.database import get_db
from app.deps import get_current_user, get_optional_user, sanitize_https_avatar_url
from app.feed_service import get_live_briefings
from app.ingestion import run_ingestion_pipeline
from app.logging_config import request_id_ctx_var, setup_logging
from app.models import (
    Card,
    CardFeedback,
    Delivery,
    ErrorReport,
    FocusTopic,
    MetricsEvent,
    Profession,
    SavedCard,
    Source,
    TopicAlias,
    UserFocusTopic,
    UserProfile,
)
from app.rate_limit import (
    GeminiQuotaExceededError,
    enforce_auth_ai_rate_limit,
    enforce_public_rate_limit,
    get_client_ip,
    rate_limiter,
)
from app.schemas import (
    CUSTOM_PROMPT_MAX_LENGTH,
    BriefingCard,
    CardFeedbackRequest,
    CardReportRequest,
    HealthResponse,
    IngestCounts,
    IngestResponse,
    MetricsEventCreate,
    MetricsEventResponse,
    ProfessionResponse,
    SavedCardsResponse,
    SourceHealthItem,
    SourceHealthResponse,
    SourceHealthSummary,
    SuggestedTopicResponse,
    SynthesisStatusResponse,
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

if settings.SENTRY_DSN:
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration

        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            environment=settings.ENVIRONMENT,
            integrations=[FastApiIntegration()],
            traces_sample_rate=0.1 if settings.ENVIRONMENT == "production" else 1.0,
        )
        logger.info("Sentry monitoring initialized successfully")
    except ImportError:
        logger.warning("SENTRY_DSN configured but sentry-sdk package is not installed; skipping Sentry initialization")
    except Exception as sentry_err:
        logger.warning("Failed to initialize Sentry: %s", sentry_err)

REQUEST_ID_REGEX = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
MAX_BRIEFING_INTEREST_TOPICS = 10
MAX_BRIEFING_INTEREST_TOPIC_LEN = 60


def validate_interests_param(interests: str) -> str:
    """Validate comma-separated interests query parameter (max 10 topics, each max 60 chars)."""
    if not interests:
        return ""
    if len(interests) > 1000:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="interests exceeds maximum allowed length.",
        )
    topics = [t.strip() for t in interests.split(",") if t.strip()]
    if len(topics) > MAX_BRIEFING_INTEREST_TOPICS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"interests cannot exceed {MAX_BRIEFING_INTEREST_TOPICS} topics.",
        )
    for topic in topics:
        if len(topic) > MAX_BRIEFING_INTEREST_TOPIC_LEN:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Each interest topic must be at most {MAX_BRIEFING_INTEREST_TOPIC_LEN} characters.",
            )
    return ", ".join(topics)


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
    "/api/sources/health",
    tags=["Health", "Sources"],
    summary="Get operational health metrics and per-source status",
    response_model=SourceHealthResponse,
    responses={
        401: {"description": "Unauthorized - Missing or invalid X-Ingest-Token"},
        503: {"description": "Service Unavailable - INGEST_API_TOKEN is not configured"},
    },
)
def get_sources_health(
    request: Request,
    db: Session = Depends(get_db),
    x_ingest_token: str | None = Header(default=None, alias="X-Ingest-Token"),
):
    """
    Returns aggregate health metrics and per-source status records.
    Protected by X-Ingest-Token header (constant-time comparison) and rate-limited.
    """
    enforce_public_rate_limit(request)

    if not settings.INGEST_API_TOKEN or not settings.INGEST_API_TOKEN.strip():
        logger.error("GET /api/sources/health triggered but INGEST_API_TOKEN is not configured")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Endpoint is disabled because INGEST_API_TOKEN is not configured.",
        )

    expected = settings.INGEST_API_TOKEN.strip().encode("utf-8")
    provided = x_ingest_token.strip().encode("utf-8") if x_ingest_token else b""
    if not x_ingest_token or not hmac.compare_digest(provided, expected):
        logger.warning("Unauthorized /api/sources/health attempt with invalid or missing token")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-Ingest-Token header.",
        )

    sources = db.query(Source).order_by(Source.slug.asc()).all()
    total = len(sources)
    healthy = sum(1 for s in sources if s.status == "healthy")
    degraded = sum(1 for s in sources if s.status == "degraded")
    failing = sum(1 for s in sources if s.status == "failing")
    never_fetched = sum(1 for s in sources if s.last_fetched_at is None)

    last_successful = [
        s.last_success_at.replace(tzinfo=UTC) if s.last_success_at.tzinfo is None else s.last_success_at
        for s in sources
        if s.last_success_at is not None
    ]
    last_success_time = max(last_successful) if last_successful else None
    oldest_success_time = min(last_successful) if last_successful else None

    summary = SourceHealthSummary(
        total=total,
        healthy=healthy,
        degraded=degraded,
        failing=failing,
        never_fetched=never_fetched,
        last_successful_run_at=last_success_time,
        oldest_last_success_at=oldest_success_time,
    )

    items = [
        SourceHealthItem(
            slug=s.slug,
            name=s.name,
            enabled=s.enabled,
            status=s.status,
            last_fetched_at=s.last_fetched_at,
            last_success_at=s.last_success_at,
            consecutive_failures=s.consecutive_failures,
            last_error=s.last_error[:500] if s.last_error else None,
            next_fetch_at=s.next_fetch_at,
        )
        for s in sources
    ]

    return SourceHealthResponse(summary=summary, sources=items)


@app.get(
    "/api/synthesis/status",
    tags=["Synthesis"],
    summary="Get synthesis queue size and card validation status counts",
    response_model=SynthesisStatusResponse,
    responses={
        401: {"description": "Unauthorized - Missing or invalid X-Ingest-Token"},
        503: {"description": "Service Unavailable - INGEST_API_TOKEN is not configured"},
    },
)
def get_synthesis_status(
    request: Request,
    db: Session = Depends(get_db),
    x_ingest_token: str | None = Header(default=None, alias="X-Ingest-Token"),
):
    """
    Returns synthesis queue size, card counts by validation status, and remaining Gemini quota.
    Protected by X-Ingest-Token header (constant-time comparison). Strictly DB-only.
    """
    enforce_public_rate_limit(request)

    if not settings.INGEST_API_TOKEN or not settings.INGEST_API_TOKEN.strip():
        logger.error("GET /api/synthesis/status triggered but INGEST_API_TOKEN is not configured")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Endpoint is disabled because INGEST_API_TOKEN is not configured.",
        )

    expected = settings.INGEST_API_TOKEN.strip().encode("utf-8")
    provided = x_ingest_token.strip().encode("utf-8") if x_ingest_token else b""
    if not hmac.compare_digest(expected, provided):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-Ingest-Token header.",
        )

    from app.synthesize import get_synthesis_queue

    queue = get_synthesis_queue(db)
    passed_total = (
        db.query(func.count(Card.id))
        .filter(Card.validation_status == "passed", Card.model_name != "fallback-heuristic")
        .scalar()
        or 0
    )
    flagged_total = db.query(func.count(Card.id)).filter(Card.validation_status == "flagged").scalar() or 0
    unvalidated_total = db.query(func.count(Card.id)).filter(Card.validation_status == "unvalidated").scalar() or 0
    synthesized_total = db.query(func.count(Card.id)).filter(Card.model_name != "fallback-heuristic").scalar() or 0
    quota_remaining = rate_limiter.get_global_gemini_remaining()

    return SynthesisStatusResponse(
        queue_size=len(queue),
        synthesized_total=synthesized_total,
        passed_total=passed_total,
        flagged_total=flagged_total,
        unvalidated_total=unvalidated_total,
        quota_remaining=quota_remaining,
    )


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
        max_length=120,
        description="Target role or profession of reading user",
        examples=["Senior Full Stack Engineer", "Accountant / Finance", "Retail Store Owner"],
    ),
    interests: str = Query(
        default="",
        description="Comma-separated list of focus areas, technologies, and industry interests (max 10 topics, 60 chars each)",
        examples=[".NET Core, Angular, Python", "Tax Regulations, GST, Accounting"],
    ),
    custom_prompt: str = Query(
        default="",
        max_length=CUSTOM_PROMPT_MAX_LENGTH,
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
    validated_interests = validate_interests_param(interests)

    if refresh:
        if current_user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required to force refresh briefings.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        if current_user.is_anonymous:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Sign in with a full account to force refresh briefings.",
            )
        enforce_auth_ai_rate_limit(current_user.id, scope="briefings_refresh")

    # Use authenticated profile preferences as defaults if available and not overridden
    effective_role = role
    effective_interests = validated_interests
    effective_prompt = custom_prompt

    if current_user:
        if effective_role in ("Professional", "Developer") and current_user.role:
            effective_role = current_user.role
        if not effective_interests and current_user.interests:
            effective_interests = current_user.interests
        if not effective_prompt and current_user.customPrompt:
            effective_prompt = current_user.customPrompt

    is_authenticated_non_guest = bool(current_user and not current_user.is_anonymous)

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
        allow_ingestion=is_authenticated_non_guest,
        allow_variant_generation=is_authenticated_non_guest,
        user_key=str(current_user.id) if current_user else None,
        user=current_user,
    )


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
        picture_url=sanitize_https_avatar_url(current_user.picture_url),
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


@app.get(
    "/api/professions",
    tags=["Onboarding"],
    summary="List available professions and their suggested focus topics (DB-only, rate-limited)",
    response_model=list[ProfessionResponse],
)
def list_professions(
    db: Session = Depends(get_db),
    _: None = Depends(enforce_public_rate_limit),
):
    """
    Public endpoint returning active professions and their curated suggested topics.
    Database-only, zero AI calls, rate-limited.
    """
    professions = (
        db.query(Profession)
        .filter(Profession.is_active.is_(True))
        .order_by(Profession.sort_order.asc(), Profession.name.asc())
        .all()
    )
    result = []
    for p in professions:
        topics = []
        for pt in p.profession_topics:
            if pt.topic and pt.topic.is_active:
                topics.append(
                    SuggestedTopicResponse(
                        id=pt.topic.id,
                        name=pt.topic.name,
                        slug=pt.topic.slug,
                        kind=pt.topic.kind,
                    )
                )
        result.append(
            ProfessionResponse(
                id=p.id,
                slug=p.slug,
                name=p.name,
                description=p.description,
                suggested_topics=topics,
            )
        )
    return result


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
    Invalidates the cached daily briefing for the user upon update.
    """
    dumped = profile_data.model_dump(exclude_unset=True)
    focus_topic_ids = dumped.pop("focus_topic_ids", None)
    topic_versions = dumped.pop("topic_versions", None)

    for key, value in dumped.items():
        if key != "id" and hasattr(current_user, key):
            setattr(current_user, key, value)

    # Sync UserFocusTopics if focus_topic_ids is provided
    if focus_topic_ids is not None:
        db.query(UserFocusTopic).filter(UserFocusTopic.user_id == current_user.id).delete()
        for tid in focus_topic_ids:
            ver = None
            if topic_versions:
                ver = topic_versions.get(str(tid))
            db.add(UserFocusTopic(user_id=current_user.id, topic_id=tid, version=ver))

    db.commit()
    invalidate_daily_briefing_cache(db, current_user.id)
    db.refresh(current_user)
    return current_user


# ==========================================
# CARD ACTIONS: SAVE, FEEDBACK, ERROR REPORT
# ==========================================


@app.post(
    "/api/cards/{card_id}/save",
    tags=["Cards"],
    summary="Save / bookmark an action card",
    responses={
        401: {"description": "Unauthorized - Missing or invalid Bearer JWT token"},
        404: {"description": "Card not found"},
    },
)
def save_card(
    card_id: str,
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Saves (bookmarks) an action card for the authenticated user (idempotent)."""
    try:
        card_uuid = uuid.UUID(card_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card not found")

    card = db.query(Card).filter(Card.id == card_uuid).first()
    if not card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card not found")

    existing = db.query(SavedCard).filter(SavedCard.user_id == current_user.id, SavedCard.card_id == card_uuid).first()
    if not existing:
        saved_entry = SavedCard(user_id=current_user.id, card_id=card_uuid)
        db.add(saved_entry)
        db.add(
            MetricsEvent(
                user_id=current_user.id,
                name="card_saved",
                properties={"card_id": str(card_uuid)},
            )
        )
        db.commit()

    return {"saved": True, "card_id": str(card_uuid)}


@app.delete(
    "/api/cards/{card_id}/save",
    tags=["Cards"],
    summary="Remove a saved / bookmarked action card",
    responses={
        401: {"description": "Unauthorized - Missing or invalid Bearer JWT token"},
        404: {"description": "Card not found"},
    },
)
def unsave_card(
    card_id: str,
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Removes a saved bookmark for the authenticated user (idempotent)."""
    try:
        card_uuid = uuid.UUID(card_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card not found")

    existing = db.query(SavedCard).filter(SavedCard.user_id == current_user.id, SavedCard.card_id == card_uuid).first()
    if existing:
        db.delete(existing)
        db.commit()

    return {"saved": False, "card_id": str(card_uuid)}


@app.get(
    "/api/saved",
    tags=["Cards"],
    summary="Get paginated list of saved action cards for authenticated user",
    response_model=SavedCardsResponse,
    responses={
        401: {"description": "Unauthorized - Missing or invalid Bearer JWT token"},
    },
)
def get_saved_cards(
    page: int = Query(default=1, ge=1, description="Page number starting at 1"),
    limit: int = Query(default=10, ge=1, le=50, description="Items per page"),
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns a paginated list of cards saved by the authenticated user in reverse chronological order."""
    from app.feed_service import _db_card_to_briefing_card

    query = db.query(SavedCard).filter(SavedCard.user_id == current_user.id).order_by(SavedCard.created_at.desc())
    total = query.count()
    offset_val = (page - 1) * limit
    saved_items = query.offset(offset_val).limit(limit).all()

    # Pre-fetch feedback for these cards
    card_uuids = [sc.card_id for sc in saved_items if sc.card]
    fb_map: dict[uuid.UUID, str] = {}
    if card_uuids:
        fb_rows = (
            db.query(CardFeedback.card_id, CardFeedback.value)
            .filter(CardFeedback.user_id == current_user.id, CardFeedback.card_id.in_(card_uuids))
            .all()
        )
        fb_map = {cid: ("useful" if val == 1 else "not_useful") for cid, val in fb_rows}

    items: list[BriefingCard] = []
    for rank_idx, sc in enumerate(saved_items, 1):
        if not sc.card:
            continue
        dto = _db_card_to_briefing_card(
            db=db,
            card=sc.card,
            rank=rank_idx,
            user_role=current_user.role or "Professional",
            allow_variant_generation=False,
            user_key=str(current_user.id),
        )
        dto.is_saved = True
        dto.my_feedback = fb_map.get(sc.card_id)  # type: ignore[assignment]
        items.append(dto)

    has_more = (offset_val + limit) < total
    return SavedCardsResponse(
        items=items,
        total=total,
        page=page,
        limit=limit,
        has_more=has_more,
    )


@app.post(
    "/api/cards/{card_id}/feedback",
    tags=["Cards"],
    summary="Submit or toggle useful / not_useful feedback on an action card",
    responses={
        401: {"description": "Unauthorized - Missing or invalid Bearer JWT token"},
        404: {"description": "Card not found"},
    },
)
def submit_card_feedback(
    card_id: str,
    payload: CardFeedbackRequest,
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upserts or toggles user feedback (+1 / -1) on an action card."""
    try:
        card_uuid = uuid.UUID(card_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card not found")

    card = db.query(Card).filter(Card.id == card_uuid).first()
    if not card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card not found")

    val_int = 1 if payload.value == "useful" else -1

    existing = (
        db.query(CardFeedback)
        .filter(CardFeedback.user_id == current_user.id, CardFeedback.card_id == card_uuid)
        .first()
    )

    if existing:
        if existing.value == val_int:
            # Toggle off
            db.delete(existing)
            db.commit()
            return {"feedback": None, "card_id": str(card_uuid)}
        else:
            existing.value = val_int
            existing.updated_at = datetime.now(UTC)
            db.add(
                MetricsEvent(
                    user_id=current_user.id,
                    name="feedback_given",
                    properties={"card_id": str(card_uuid), "value": payload.value},
                )
            )
            db.commit()
            return {"feedback": payload.value, "card_id": str(card_uuid)}
    else:
        new_feedback = CardFeedback(
            user_id=current_user.id,
            card_id=card_uuid,
            value=val_int,
        )
        db.add(new_feedback)
        db.add(
            MetricsEvent(
                user_id=current_user.id,
                name="feedback_given",
                properties={"card_id": str(card_uuid), "value": payload.value},
            )
        )
        db.commit()
        return {"feedback": payload.value, "card_id": str(card_uuid)}


@app.post(
    "/api/metrics/event",
    tags=["Telemetry"],
    summary="Record product telemetry event",
    response_model=MetricsEventResponse,
    status_code=status.HTTP_201_CREATED,
)
def record_metrics_event(
    payload: MetricsEventCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: UserProfile | None = Depends(get_optional_user),
    _: None = Depends(enforce_public_rate_limit),
):
    """
    Records an anonymous or authenticated product telemetry event (write-only).
    Sanitizes properties and rejects personal data.
    """
    client_id = str(current_user.id) if (current_user and current_user.id) else get_client_ip(request)
    rate_limiter.check_sliding_window(f"metrics:{client_id}", limit=60, window_seconds=60)

    sanitized_props: dict[str, Any] = {}
    for k, v in payload.properties.items():
        clean_k = str(k)[:64]
        if isinstance(v, (str, int, float, bool)):
            sanitized_props[clean_k] = str(v)[:500] if isinstance(v, str) else v
        elif v is None:
            sanitized_props[clean_k] = None

    metric = MetricsEvent(
        user_id=current_user.id if current_user else None,
        session_id=payload.session_id,
        name=payload.name,
        properties=sanitized_props,
    )
    db.add(metric)
    db.commit()
    return MetricsEventResponse(status="recorded", event_id=str(metric.id))


@app.post(
    "/api/cards/{card_id}/report",
    tags=["Cards"],
    summary="Report a factual error or issue with an action card",
    responses={
        404: {"description": "Card not found"},
        429: {"description": "Too many reports - rate limit exceeded"},
    },
)
def report_card_error(
    card_id: str,
    payload: CardReportRequest,
    request: Request,
    current_user: UserProfile | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """Submits a factual error report for human editorial review.

    Includes rate-limiting (10/min) and automatic deduplication of repeat submissions.
    """
    try:
        card_uuid = uuid.UUID(card_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card not found")

    card = db.query(Card).filter(Card.id == card_uuid).first()
    if not card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card not found")

    user_identifier = str(current_user.id) if (current_user and current_user.id) else get_client_ip(request)
    # Rate limit: 10 reports per minute
    rate_limiter.check_sliding_window(f"report:{user_identifier}", limit=10, window_seconds=60)

    # Deduplicate repeated reports from same user on same card with same reason
    user_id_val = current_user.id if (current_user and current_user.id) else None
    reason_prefix = f"[{payload.reason}]"

    dedupe_query = db.query(ErrorReport).filter(
        ErrorReport.card_id == card_uuid,
        ErrorReport.message.like(f"{reason_prefix}%"),
    )
    if user_id_val is not None:
        dedupe_query = dedupe_query.filter(ErrorReport.user_id == user_id_val)
    existing_report = dedupe_query.first()

    if existing_report:
        return {"status": "deduplicated", "card_id": str(card_uuid)}

    note_text = payload.note.strip() if payload.note else ""
    msg = f"[{payload.reason}] {note_text}" if note_text else f"[{payload.reason}]"
    report = ErrorReport(
        id=uuid.uuid4(),
        user_id=user_id_val,
        card_id=card_uuid,
        message=msg[:2000],
        status="open",
    )
    db.add(report)
    db.commit()
    return {"status": "submitted", "card_id": str(card_uuid)}


# ==============================================================================
# EMAIL DIGEST & UNSUBSCRIBE ROUTES (Task F7)
# ==============================================================================


@app.get(
    "/api/unsubscribe",
    tags=["Email"],
    summary="Unsubscribe user from daily email digest via signed HMAC token",
    responses={
        400: {"description": "Invalid or expired unsubscribe link"},
        200: {"description": "Successfully unsubscribed"},
    },
)
def unsubscribe_get(
    request: Request,
    token: str = Query(..., description="Signed HMAC-SHA256 unsubscribe token"),
    db: Session = Depends(get_db),
):
    """Handles GET link clicks from email footer to unsubscribe from daily digest."""
    enforce_public_rate_limit(request)
    from app.email.signer import verify_unsubscribe_token

    user_id = verify_unsubscribe_token(token)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired unsubscribe link.",
        )

    user = db.query(UserProfile).filter(UserProfile.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    user.email_digest_enabled = False
    db.commit()
    return {"status": "unsubscribed", "email": user.email}


@app.post(
    "/api/unsubscribe",
    tags=["Email"],
    summary="One-click RFC 8058 unsubscribe from daily email digest",
    responses={
        400: {"description": "Invalid or expired unsubscribe token"},
        200: {"description": "Successfully unsubscribed"},
    },
)
async def unsubscribe_post(
    request: Request,
    token: str = Query(None, description="Signed HMAC-SHA256 unsubscribe token"),
    db: Session = Depends(get_db),
):
    """RFC 8058 one-click unsubscribe endpoint triggered by email clients or web UI."""
    enforce_public_rate_limit(request)
    from app.email.signer import verify_unsubscribe_token

    active_token = token
    if not active_token:
        try:
            body = await request.json()
            if isinstance(body, dict):
                active_token = body.get("token")
        except Exception:
            pass

    if not active_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing unsubscribe token.",
        )

    user_id = verify_unsubscribe_token(active_token)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired unsubscribe token.",
        )

    user = db.query(UserProfile).filter(UserProfile.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    user.email_digest_enabled = False
    db.commit()
    return {"status": "unsubscribed"}


@app.post(
    "/api/webhooks/resend",
    tags=["Email"],
    summary="Receive bounce and complaint webhooks from Resend",
)
async def resend_webhook(
    request: Request,
    db: Session = Depends(get_db),
):
    """Processes Resend webhook events (bounces, complaints) to automatically suppress digests."""
    secret = (settings.RESEND_WEBHOOK_SECRET or "").strip()
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Webhook endpoint disabled: RESEND_WEBHOOK_SECRET not configured.",
        )

    # Simple HMAC verification of webhook signature if provided
    signature = request.headers.get("svix-signature") or request.headers.get("X-Resend-Signature") or ""
    if not signature:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing webhook signature header.",
        )

    try:
        payload = await request.json()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid JSON payload: {exc}")

    event_type = payload.get("type", "")
    if event_type in ("email.bounced", "email.complained"):
        data = payload.get("data", {})
        recipients = data.get("to", [])
        target_email = recipients[0] if isinstance(recipients, list) and recipients else str(recipients)

        if target_email:
            user = db.query(UserProfile).filter(UserProfile.email == target_email.lower().strip()).first()
            if user:
                logger.warning("Disabling email digest for user %s due to Resend event: %s", user.id, event_type)
                user.email_digest_enabled = False

                latest_deliv = (
                    db.query(Delivery)
                    .filter(Delivery.user_id == user.id, Delivery.channel == "email")
                    .order_by(Delivery.created_at.desc())
                    .first()
                )
                if latest_deliv:
                    latest_deliv.status = "failed"
                    latest_deliv.error = f"Resend webhook event: {event_type}"
                db.commit()

    return {"status": "received", "type": event_type}


@app.post(
    "/api/digest/preview",
    tags=["Email"],
    summary="Preview raw HTML digest email for inspection",
    responses={
        401: {"description": "Unauthorized - Missing or invalid X-Ingest-Token"},
        503: {"description": "Service Unavailable - INGEST_API_TOKEN not configured"},
    },
)
def preview_digest(
    request: Request,
    email: str | None = Query(default=None, description="Optional target user email address"),
    db: Session = Depends(get_db),
    x_ingest_token: str | None = Header(default=None, alias="X-Ingest-Token"),
):
    """Renders HTML email preview for authenticated ingestion callers. Zero Gemini calls."""
    enforce_public_rate_limit(request)

    if not settings.INGEST_API_TOKEN or not settings.INGEST_API_TOKEN.strip():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Endpoint disabled: INGEST_API_TOKEN not configured.",
        )

    expected = settings.INGEST_API_TOKEN.strip().encode("utf-8")
    provided = x_ingest_token.strip().encode("utf-8") if x_ingest_token else b""
    if not hmac.compare_digest(expected, provided):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-Ingest-Token header.",
        )

    from app.email.digest import build_user_digest

    if email:
        user = db.query(UserProfile).filter(UserProfile.email == email.strip().lower()).first()
    else:
        user = db.query(UserProfile).filter(UserProfile.is_anonymous.is_(False)).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No user profile found to build preview.",
        )

    bundle = build_user_digest(db, user)
    if not bundle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No briefing cards available today to generate digest preview.",
        )

    html_content = bundle[0]
    from fastapi.responses import Response

    return Response(content=html_content, media_type="text/html")
