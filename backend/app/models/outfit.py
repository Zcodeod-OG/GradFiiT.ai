"""SQLAlchemy model for AI Stylist outfit generations.

An ``Outfit`` is a styled full-look produced by the Stylist studio.
Unlike try-on, the model is generated rather than taken from a user
photo, so we don't tie it to a Garment. The selected ``pieces`` (top,
bottoms, accessories, etc.) are stored as JSON for re-rendering and as
the basis for "find similar items" affiliate lookups.
"""

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class Outfit(Base):
    __tablename__ = "outfits"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    prompt = Column(Text, nullable=False)
    pieces = Column(JSON, nullable=False, default=list)
    background = Column(String, nullable=False, default="studio")
    model_reference_url = Column(String, nullable=True)
    seed = Column(Integer, nullable=True)
    num_images = Column(Integer, nullable=False, default=1)
    lora_uri = Column(String, nullable=True)
    lora_scale = Column(Integer, nullable=True)

    primary_image_url = Column(String, nullable=True)
    image_urls = Column(JSON, nullable=False, default=list)
    saved = Column(Boolean, nullable=False, default=False)

    status = Column(String, nullable=False, default="queued")
    inference_id = Column(String, nullable=True, index=True)
    error_message = Column(Text, nullable=True)
    pipeline_metadata = Column(JSON, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User", backref="outfits")
