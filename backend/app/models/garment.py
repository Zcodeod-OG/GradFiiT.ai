from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base


class Garment(Base):
    __tablename__ = "garments"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String, nullable=True)
    image_url = Column(String, nullable=False)
    s3_key = Column(String, nullable=False)

    # Extracted garment (background removed)
    extracted_image_url = Column(String, nullable=True)
    extracted_s3_key = Column(String, nullable=True)
    garment_type = Column(String, nullable=True)  # upper_body, lower_body, full_body, dress
    preprocess_status = Column(String, nullable=False, default="pending")
    preprocess_error = Column(Text, nullable=True)
    saved_to_closet = Column(Boolean, nullable=False, default=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User", back_populates="garments")
    tryons = relationship("TryOn", back_populates="garment")

