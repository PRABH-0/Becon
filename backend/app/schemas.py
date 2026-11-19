import uuid
from datetime import datetime
from typing import Any, List, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

CUSTOM_PROMPT_MAX_LENGTH: int = 500


# 1. Action Guidance Sub-Model (Target action: learn, apply, avoid, prepare)
class ActionGuidance(BaseModel):
    action_type: Literal["learn", "apply", "avoid", "prepare"] = Field(..., description="Category of action to take")
    guidance: str = Field(..., description="Specific, actionable advice for the user")


# 2. The Personalized 4-Part Card Content
class BriefingCardContent(BaseModel):
    what_happened: List[str] = Field(..., description="1-2 concise bullet points explaining the news item")
    why_it_matters: str = Field(..., description="Industry & professional relevance of this news")
    how_it_affects_you: str = Field(..., description="Direct personal impact on the user's role and interests")
    what_to_do_next: ActionGuidance = Field(..., description="Tactical advice on what the user should do next")


# 3. Main Briefing Card DTO (Wrapper)
class BriefingCard(BaseModel):
    id: str | None = None
    rank: int | None = Field(default=None, description="Priority ranking from 1 (most critical) to 10")
    title: str = Field(..., description="Clean, readable headline")
    source_url: str = Field(..., description="Link to original news/blog article")
    target_role: str = Field(default="User")
    target_stack: List[str] = Field(default_factory=list)
    priority: str | None = Field(
        default="brief", description="UI layout category: lead, major, brief, watch, spotlight"
    )
    image_url: str | None = Field(default=None, description="Direct hero/cover image extracted from original blog post")
    is_real_image: bool = Field(
        default=False, description="True ONLY if image genuinely came from the article's real RSS/media resource"
    )
    published_at: str | None = Field(default=None, description="Original publication date or human-readable timestamp")
    card_content: BriefingCardContent


class UserProfileBase(BaseModel):
    name: str = Field(default="Alex Doe", description="Full name of user", examples=["Alex Doe"])
    role: str = Field(
        default="Senior Full Stack .NET & Angular Engineer",
        description="Target professional role or job title",
        examples=["Senior Full Stack .NET & Angular Engineer"],
    )
    email: str | None = Field(
        default=None, description="Corporate or personal email address", examples=["alex@example.com"]
    )
    experience: str = Field(
        default="Senior (5+ Years)",
        description="Years of professional experience or career tier",
        examples=["Senior (5+ Years)"],
    )
    interests: str = Field(
        default=".NET Core, Angular",
        description="Comma-separated topics and industry sectors of interest",
        examples=[".NET Core, Angular, Python, Cloud Architecture"],
    )
    customPrompt: str = Field(
        default="",
        max_length=CUSTOM_PROMPT_MAX_LENGTH,
        description="Custom AI tuning directive or editorial prompt instruction",
        examples=["Focus on architectural trade-offs, system design, and security updates."],
    )
    aiTone: str = Field(
        default="Architectural Analysis (Deep Tech)",
        description="Synthesis tone and analytical depth",
        examples=["Architectural Analysis (Deep Tech)"],
    )
    picture_url: str | None = Field(
        default=None,
        description="Avatar picture URL (e.g. from Gmail/Google)",
        examples=["https://lh3.googleusercontent.com/a/..."],
    )
    auth_provider: str | None = Field(
        default="local", description="Authentication provider: 'local', 'google', or 'guest'", examples=["google"]
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "name": "Alex Doe",
                    "role": "Senior Full Stack .NET & Angular Engineer",
                    "email": "alex@example.com",
                    "experience": "Senior (5+ Years)",
                    "interests": ".NET Core, Angular, Python, Cloud Architecture",
                    "customPrompt": "Focus on architectural trade-offs, system design, and security updates.",
                    "aiTone": "Architectural Analysis (Deep Tech)",
                }
            ]
        }
    }


class UserProfileCreate(UserProfileBase):
    pass


class UserProfileResponse(UserProfileBase):
    id: int = Field(..., description="Unique profile database identifier", examples=[1])

    model_config = {
        "from_attributes": True,
        "json_schema_extra": {
            "examples": [
                {
                    "id": 1,
                    "name": "Alex Doe",
                    "role": "Senior Full Stack .NET & Angular Engineer",
                    "email": "alex@example.com",
                    "experience": "Senior (5+ Years)",
                    "interests": ".NET Core, Angular, Python, Cloud Architecture",
                    "customPrompt": "Focus on architectural trade-offs, system design, and security updates.",
                    "aiTone": "Architectural Analysis (Deep Tech)",
                }
            ]
        },
    }


class UserMeResponse(BaseModel):
    id: int = Field(..., description="Unique profile database identifier")
    email: str | None = Field(default=None, description="User email address or null for anonymous users")
    name: str = Field(..., description="Display name")
    picture_url: str | None = Field(default=None, description="Avatar picture URL")
    is_anonymous: bool = Field(..., description="True if guest/anonymous account")
    profession: str | None = Field(default=None, description="Profession slug or null")
    timezone: str = Field(default="UTC", description="User timezone")
    delivery_time: str = Field(default="07:00", description="Preferred delivery time (HH:MM)")
    email_digest_enabled: bool = Field(default=True, description="Whether email digest is enabled")
    has_completed_setup: bool = Field(
        ..., description="True when legacy role & interests are non-empty or profession is selected"
    )

    model_config = {"from_attributes": True}


class ChatMessage(BaseModel):
    role: str = Field(
        ...,
        max_length=32,
        description="Role of the message author: 'user', 'assistant', or 'system'",
        examples=["user"],
    )
    content: str = Field(
        ...,
        max_length=1000,
        description="Text content of the message (capped at 1000 characters)",
        examples=["Hi, I am a Senior Full Stack Engineer interested in Python and Cloud Architecture."],
    )


class ChatRequest(BaseModel):
    messages: List[ChatMessage] = Field(
        ...,
        max_length=20,
        description="List of chronological chat messages for AI onboarding context (capped at 20 messages)",
        examples=[
            [
                {
                    "role": "user",
                    "content": "Hi, I am a Senior Full Stack Engineer interested in Python and Cloud Architecture.",
                }
            ]
        ],
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "messages": [
                        {"role": "system", "content": "User has just registered. Start the onboarding."},
                        {
                            "role": "user",
                            "content": "Hi! My name is Alex, I am a Senior Full Stack Engineer interested in Python, .NET Core, and Azure.",
                        },
                    ]
                }
            ]
        }
    }


class ExtractedProfile(BaseModel):
    name: str | None = Field(default=None, description="Extracted user name", examples=["Alex"])
    role: str | None = Field(
        default=None, description="Extracted professional role", examples=["Senior Full Stack Engineer"]
    )
    experience: str | None = Field(
        default=None, description="Extracted experience level", examples=["Senior (5+ Years)"]
    )
    interests: str | None = Field(
        default=None, description="Extracted technology and industry interests", examples=["Python, .NET Core, Azure"]
    )


class ChatResponse(BaseModel):
    reply_text: str = Field(
        ...,
        description="AI conversational reply message",
        examples=[
            "Welcome aboard Alex! I've personalized your Daily Gazette for Senior Full Stack Engineering with a focus on Python, .NET Core, and Azure."
        ],
    )
    onboarding_complete: bool = Field(
        ...,
        description="Indicates whether the AI has collected all required profile fields to complete onboarding",
        examples=[True],
    )
    extracted_data: ExtractedProfile | None = Field(
        default=None, description="Extracted profile attributes if onboarding concluded during this turn"
    )


class HealthResponse(BaseModel):
    status: str = Field(default="online", description="Health check status", examples=["online"])
    app: str = Field(
        default="Becon AI Intelligence Briefing",
        description="Application service name",
        examples=["Becon AI Intelligence Briefing"],
    )
    engine: str = Field(
        default="Becon AI Intelligence (Personalized & Structured)",
        description="Underlying intelligence engine",
        examples=["Becon AI Intelligence (Personalized & Structured)"],
    )


class MatchTopicsRequest(BaseModel):
    description: str = Field(
        default="",
        max_length=500,
        description="Free-form user description capped at 500 characters for topic recommendation",
    )


class TopicSearchResponse(BaseModel):
    query: str = Field(..., description="The queried keyword or phrase", examples=["python"])
    matches: List[str] = Field(
        ...,
        description="List of matched canonical topic names from focus_topics and topic_aliases",
        examples=[["Python", "PyTorch"]],
    )


class IngestCounts(BaseModel):
    sources_fetched: int = 0
    raw_items_new: int = 0
    raw_items_duplicate: int = 0
    events_created: int = 0
    cards_created: int = 0
    errors: int = 0


class IngestResponse(BaseModel):
    message: str = Field(
        ..., description="Status announcement message", examples=["Real-time AI feed ingestion triggered in background"]
    )
    status: str = Field(default="success", description="Execution status", examples=["success"])
    sources_fetched: int = 0
    raw_items_new: int = 0
    raw_items_duplicate: int = 0
    events_created: int = 0
    cards_created: int = 0
    errors: int = 0
    counts: IngestCounts | None = None


# 11. Source Registry Schemas (Phase 2.1)
SourceTypeLiteral = Literal[
    "rss",
    "atom",
    "github_release",
    "github_releases",
    "advisory",
    "changelog_html",
    "youtube_channel",
    "x_account",
    "instagram_account",
]

TrustTierLiteral = Literal["official", "vendor", "curated_creator", 1, 2, 3]


class SourceSeedItem(BaseModel):
    """Schema for validating source seed definitions from sources.json."""

    name: str = Field(..., min_length=1, max_length=200, description="Display name of source")
    slug: str = Field(..., min_length=1, max_length=100, pattern=r"^[a-z0-9-]+$", description="Unique URL slug")
    homepage_url: str = Field(..., description="Canonical source homepage URL (https required)")
    feed_url: str = Field(..., description="Direct RSS/Atom feed URL (https required)")
    source_type: SourceTypeLiteral = Field(default="rss", description="Feed format or channel type")
    trust_tier: TrustTierLiteral = Field(default="official", description="Source credibility tier")
    poll_interval_minutes: int = Field(default=60, ge=5, description="Polling frequency in minutes")
    is_active: bool = Field(default=True, description="Whether polling is enabled")
    topics: List[str] = Field(default_factory=list, description="Target focus topic slugs covered by source")
    professions: List[str] = Field(default_factory=list, description="Associated profession slugs")

    @field_validator("homepage_url", "feed_url")
    @classmethod
    def validate_https_url(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed.startswith("https://"):
            raise ValueError(f"URL must use secure https protocol: {v}")
        return trimmed

    @model_validator(mode="before")
    @classmethod
    def handle_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            # Support site_url as alias for homepage_url
            if "homepage_url" not in data and "site_url" in data:
                data["homepage_url"] = data["site_url"]
            # Support type as alias for source_type
            if "source_type" not in data and "type" in data:
                data["source_type"] = data["type"]
            # Support fetch_interval_minutes as alias for poll_interval_minutes
            if "poll_interval_minutes" not in data and "fetch_interval_minutes" in data:
                data["poll_interval_minutes"] = data["fetch_interval_minutes"]
            # Support enabled as alias for is_active
            if "is_active" not in data and "enabled" in data:
                data["is_active"] = data["enabled"]
        return data


class SourceResponse(BaseModel):
    """DTO for returning source details."""

    id: uuid.UUID
    slug: str
    name: str
    homepage_url: str
    feed_url: str
    source_type: str
    trust_tier: int
    trust_tier_label: str
    poll_interval_minutes: int
    is_active: bool
    topics: List[str] = Field(default_factory=list)
    professions: List[str] = Field(default_factory=list)
    consecutive_failures: int = 0
    last_error: str | None = None
    last_fetched_at: datetime | None = None
    last_success_at: datetime | None = None
    created_at: datetime
