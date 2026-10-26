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
    name: str = "Prabhjot Singh"
    role: str = "Senior Full Stack .NET & Angular Engineer"
    email: str = "prabhjot@example.com"
    experience: str = "Senior (5+ Years)"
    interests: str = ".NET Core, Angular"
    customPrompt: str = ""
    aiTone: str = "Architectural Analysis (Deep Tech)"

class UserProfileCreate(UserProfileBase):
    pass

class UserProfileResponse(UserProfileBase):
    id: int
    
    class Config:
        from_attributes = True

class UserRegister(BaseModel):
    name: str | None = None
    email: str
    password: str

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]

class ExtractedProfile(BaseModel):
    name: str | None = None
    role: str | None = None
    experience: str | None = None
    interests: str | None = None

class ChatResponse(BaseModel):
    reply_text: str
    onboarding_complete: bool
    extracted_data: ExtractedProfile | None = None

class Token(BaseModel):
    access_token: str
    token_type: str
