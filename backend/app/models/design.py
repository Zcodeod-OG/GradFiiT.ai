"""SQLAlchemy model for AI Fashion Design generations.

A `Design` is a single text-to-image generation produced by the FLUX
studio (no person photo required). Each generation can produce multiple
candidate images; the chosen one is promoted to ``primary_image_url``
and the rest are kept as a JSON array for the gallery view.
"""

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class Design(Base):
    __tablename__ = "designs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # Prompt + reference inputs
    prompt = Column(Text, nullable=False)
    negative_prompt = Column(Text, nullable=True)
    sketch_image_url = Column(String, nullable=True)
    style_reference_url = Column(String, nullable=True)

    # Generation knobs
    width = Column(Integer, nullable=False, default=1024)
    height = Column(Integer, nullable=False, default=1024)
    guidance_scale = Column(Float, nullable=False, default=4.5)
    num_inference_steps = Column(Integer, nullable=False, default=35)
    num_images = Column(Integer, nullable=False, default=1)
    seed = Column(Integer, nullable=True)
    lora_uri = Column(String, nullable=True)
    lora_scale = Column(Float, nullable=True)

    # Outputs
    primary_image_url = Column(String, nullable=True)
    image_urls = Column(JSON, nullable=False, default=list)
    saved = Column(Boolean, nullable=False, default=False)

    # Lifecycle
    status = Column(String, nullable=False, default="queued")
    inference_id = Column(String, nullable=True, index=True)
    error_message = Column(Text, nullable=True)
    pipeline_metadata = Column(JSON, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User", backref="designs")
