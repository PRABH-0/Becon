from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, Text
from app.database import Base


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), default="")
    role = Column(String(200), default="")
    email = Column(String(200), default="")
    experience = Column(String(100), default="")
    interests = Column(String(1000), default="")  # Comma separated
    customPrompt = Column(String(2000), default="")
    aiTone = Column(String(100), default="")
    password_hash = Column(String(500), nullable=True)
    picture_url = Column(String(1000), nullable=True)  # Gmail/Google Avatar URL
    auth_provider = Column(String(50), default="local")  # "local", "google", "guest"
    lastUpdated = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class SavedBriefing(Base):
    __tablename__ = "saved_briefings"

    id = Column(String(100), primary_key=True, index=True)
    title = Column(String(500))
    source_url = Column(String(1000))
    target_role = Column(String(200))
    target_stack = Column(String(500))  # Comma separated
    priority = Column(String(50))

    # Action card content as JSON string
    card_content_json = Column(Text)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
