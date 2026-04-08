from sqlalchemy import Column, Integer, String, Boolean, DateTime, JSON, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=True)
    subscription_tier = Column(String, nullable=False, default="free_2d")
    preferred_tryon_mode = Column(String, nullable=False, default="2d")
    avatar_status = Column(String, nullable=False, default="not_started")
    avatar_source_image_url = Column(String, nullable=True)
    avatar_model_id = Column(String, nullable=True)
    avatar_model_url = Column(String, nullable=True)
    avatar_preview_url = Column(String, nullable=True)
    avatar_turntable_url = Column(String, nullable=True)
    avatar_metadata = Column(JSON, nullable=True)
    avatar_error_message = Column(Text, nullable=True)
    avatar_updated_at = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    garments = relationship("Garment", back_populates="user")
    tryons = relationship("TryOn", back_populates="user")

