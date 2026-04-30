"""SQLAlchemy model for Brand DNA -- the user's persistent style guide.

Brand DNA is reused as conditioning across every studio. We store:

* ``palette``  - a list of HEX colors the user picked.
* ``logos``    - a list of S3 URLs pointing at brand marks.
* ``model_references`` - face / body image URLs the IP-Adapter draws
  from to keep models consistent across sessions.
* ``lora_uri`` - optional fine-tuned LoRA the user (or admin) trained on
  their catalog. When set, the FLUX provider hot-swaps it in for every
  generation (overriding the default outfit LoRA).
"""

from sqlalchemy import (
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


class BrandDNA(Base):
    __tablename__ = "brand_dnas"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        unique=True,
        index=True,
    )

    palette = Column(JSON, nullable=False, default=list)
    logos = Column(JSON, nullable=False, default=list)
    model_references = Column(JSON, nullable=False, default=list)
    voice = Column(Text, nullable=True)

    lora_uri = Column(String, nullable=True)
    lora_status = Column(String, nullable=False, default="none")
    lora_strength = Column(Float, nullable=False, default=1.0)
    lora_metadata = Column(JSON, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User", backref="brand_dna", uselist=False)
