from typing import List, Literal
from pydantic import BaseModel, Field


# 1. Action Guidance Sub-Model (Target action: learn, apply, avoid, prepare)
class ActionGuidance(BaseModel):
    action_type: Literal["learn", "apply", "avoid", "prepare"] = Field(
        ..., description="Category of action to take"
    )
    guidance: str = Field(
        ..., description="Specific, actionable advice for the user"
    )


# 2. The Personalized 4-Part Card Content
class BriefingCardContent(BaseModel):
    what_happened: List[str] = Field(
        ..., description="1-2 concise bullet points explaining the news item"
    )
    why_it_matters: str = Field(
        ..., description="Industry & professional relevance of this news"
    )
    how_it_affects_you: str = Field(
        ..., description="Direct personal impact on the user's role and interests"
    )
    what_to_do_next: ActionGuidance = Field(
        ..., description="Tactical advice on what the user should do next"
    )


# 3. Main Briefing Card DTO (Wrapper)
class BriefingCard(BaseModel):
    id: str | None = None
    rank: int | None = Field(
        default=None, description="Priority ranking from 1 (most critical) to 10"
    )
    title: str = Field(..., description="Clean, readable headline")
    source_url: str = Field(..., description="Link to original news/blog article")
    target_role: str = Field(default="User")
    target_stack: List[str] = Field(default_factory=list)
    priority: str | None = Field(
        default="brief", description="UI layout category: lead, major, brief, watch, spotlight"
    )
    image_url: str | None = Field(
        default=None, description="Direct hero/cover image extracted from original blog post"
    )
    is_real_image: bool = Field(
        default=False, description="True ONLY if image genuinely came from the article's real RSS/media resource"
    )
    published_at: str | None = Field(
        default=None, description="Original publication date or human-readable timestamp"
    )
    card_content: BriefingCardContent

class UserProfileBase(BaseModel):
    name: str = Field(
        default="Prabhjot Singh",
        description="Full name of user",
        examples=["Prabhjot Singh"]
    )
    role: str = Field(
        default="Senior Full Stack .NET & Angular Engineer",
        description="Target professional role or job title",
        examples=["Senior Full Stack .NET & Angular Engineer"]
    )
    email: str = Field(
        default="prabhjot@example.com",
        description="Corporate or personal email address",
        examples=["prabhjot@example.com"]
    )
    experience: str = Field(
        default="Senior (5+ Years)",
        description="Years of professional experience or career tier",
        examples=["Senior (5+ Years)"]
    )
    interests: str = Field(
        default=".NET Core, Angular",
        description="Comma-separated topics and industry sectors of interest",
        examples=[".NET Core, Angular, Python, Cloud Architecture"]
    )
    customPrompt: str = Field(
        default="",
        description="Custom AI tuning directive or editorial prompt instruction",
        examples=["Focus on architectural trade-offs, system design, and security updates."]
    )
    aiTone: str = Field(
        default="Architectural Analysis (Deep Tech)",
        description="Synthesis tone and analytical depth",
        examples=["Architectural Analysis (Deep Tech)"]
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "name": "Prabhjot Singh",
                    "role": "Senior Full Stack .NET & Angular Engineer",
                    "email": "prabhjot@example.com",
                    "experience": "Senior (5+ Years)",
                    "interests": ".NET Core, Angular, Python, Cloud Architecture",
                    "customPrompt": "Focus on architectural trade-offs, system design, and security updates.",
                    "aiTone": "Architectural Analysis (Deep Tech)"
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
                    "name": "Prabhjot Singh",
                    "role": "Senior Full Stack .NET & Angular Engineer",
                    "email": "prabhjot@example.com",
                    "experience": "Senior (5+ Years)",
                    "interests": ".NET Core, Angular, Python, Cloud Architecture",
                    "customPrompt": "Focus on architectural trade-offs, system design, and security updates.",
                    "aiTone": "Architectural Analysis (Deep Tech)"
                }
            ]
        }
    }

class UserRegister(BaseModel):
    name: str | None = Field(
        default="Prabhjot Singh",
        description="User's full name",
        examples=["Prabhjot Singh"]
    )
    email: str = Field(
        ...,
        description="Valid unique email address for registration",
        examples=["prabhjot@example.com"]
    )
    password: str = Field(
        ...,
        description="Account password (minimum 6 characters recommended)",
        examples=["StrongP@ssw0rd!"]
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "name": "Prabhjot Singh",
                    "email": "prabhjot@example.com",
                    "password": "StrongP@ssw0rd!"
                }
            ]
        }
    }

class ChatMessage(BaseModel):
    role: str = Field(
        ...,
        description="Role of the message author: 'user', 'assistant', or 'system'",
        examples=["user"]
    )
    content: str = Field(
        ...,
        description="Text content of the message",
        examples=["Hi, I am a Senior Full Stack Engineer interested in Python and Cloud Architecture."]
    )

class ChatRequest(BaseModel):
    messages: List[ChatMessage] = Field(
        ...,
        description="List of chronological chat messages for AI onboarding context",
        examples=[
            [
                {
                    "role": "user",
                    "content": "Hi, I am a Senior Full Stack Engineer interested in Python and Cloud Architecture."
                }
            ]
        ]
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "messages": [
                        {
                            "role": "system",
                            "content": "User has just registered. Start the onboarding."
                        },
                        {
                            "role": "user",
                            "content": "Hi! My name is Prabhjot, I am a Senior Full Stack Engineer interested in Python, .NET Core, and Azure."
                        }
                    ]
                }
            ]
        }
    }

class ExtractedProfile(BaseModel):
    name: str | None = Field(default=None, description="Extracted user name", examples=["Prabhjot"])
    role: str | None = Field(default=None, description="Extracted professional role", examples=["Senior Full Stack Engineer"])
    experience: str | None = Field(default=None, description="Extracted experience level", examples=["Senior (5+ Years)"])
    interests: str | None = Field(default=None, description="Extracted technology and industry interests", examples=["Python, .NET Core, Azure"])

class ChatResponse(BaseModel):
    reply_text: str = Field(
        ...,
        description="AI conversational reply message",
        examples=["Welcome aboard Prabhjot! I've personalized your Daily Gazette for Senior Full Stack Engineering with a focus on Python, .NET Core, and Azure."]
    )
    onboarding_complete: bool = Field(
        ...,
        description="Indicates whether the AI has collected all required profile fields to complete onboarding",
        examples=[True]
    )
    extracted_data: ExtractedProfile | None = Field(
        default=None,
        description="Extracted profile attributes if onboarding concluded during this turn"
    )

class Token(BaseModel):
    access_token: str = Field(
        ...,
        description="OAuth2 Bearer JSON Web Token (JWT) string",
        examples=["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."]
    )
    token_type: str = Field(
        default="bearer",
        description="Standard OAuth2 token type",
        examples=["bearer"]
    )

class HealthResponse(BaseModel):
    status: str = Field(default="online", description="Health check status", examples=["online"])
    app: str = Field(default="Becon AI Intelligence Briefing", description="Application service name", examples=["Becon AI Intelligence Briefing"])
    engine: str = Field(default="Becon AI Intelligence (Personalized & Structured)", description="Underlying intelligence engine", examples=["Becon AI Intelligence (Personalized & Structured)"])

class TopicSearchResponse(BaseModel):
    query: str = Field(..., description="The queried keyword or phrase", examples=["python"])
    matches: List[str] = Field(..., description="List of semantically matched topics from the catalog", examples=["Python, Data & Analytics", "Python & FastAPI Setup"])

class IngestResponse(BaseModel):
    message: str = Field(..., description="Status announcement message", examples=["Real-time AI feed ingestion triggered in background"])
    status: str = Field(default="processing", description="Background execution status", examples=["processing"])

