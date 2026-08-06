from typing import List, Literal
from pydantic import BaseModel, Field


# 1. Action Guidance Sub-Model (Target action: learn, apply, avoid, prepare)
class ActionGuidance(BaseModel):
    action_type: Literal["learn", "apply", "avoid", "prepare"] = Field(
        ..., description="Category of action to take"
    )
    guidance: str = Field(
        ..., description="Specific, actionable advice for the developer"
    )


# 2. The Personalized 4-Part Card Content
class BriefingCardContent(BaseModel):
    what_happened: List[str] = Field(
        ..., description="1-2 concise bullet points explaining the news item"
    )
    why_it_matters: str = Field(
        ..., description="Industry & career relevance of this news"
    )
    how_it_affects_you: str = Field(
        ..., description="Direct personal impact on the user's role and stack"
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
    target_role: str = Field(default="Developer")
    target_stack: List[str] = Field(default_factory=list)
    priority: str | None = Field(
        default="brief", description="UI layout category: lead, major, brief, watch, spotlight"
    )
    card_content: BriefingCardContent
