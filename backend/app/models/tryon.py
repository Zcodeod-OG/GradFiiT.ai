from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum as SQLEnum, Text, JSON, Float, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import enum
from app.database import Base


class TryOnStatus(str, enum.Enum):
    PENDING = "pending"
    QUEUED = "queued"
    GARMENT_EXTRACTING = "garment_extracting"
    GARMENT_EXTRACTED = "garment_extracted"
    STAGE1_PROCESSING = "stage1_processing"
    STAGE1_COMPLETED = "stage1_completed"
    QUALITY_CHECKING = "quality_checking"
    QUALITY_PASSED = "quality_passed"
    QUALITY_FAILED = "quality_failed"
    STAGE2_PROCESSING = "stage2_processing"
    RATING_COMPUTING = "rating_computing"
    COMPLETED = "completed"
    FAILED = "failed"
    DEAD_LETTER = "dead_letter"


class TryOn(Base):
    __tablename__ = "tryons"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    garment_id = Column(Integer, ForeignKey("garments.id"), nullable=False)
    person_image_url = Column(String, nullable=False)
    garment_image_url = Column(String, nullable=True)

    # Garment extraction
    extracted_garment_url = Column(String, nullable=True)

    # Pipeline tracking
    status = Column(SQLEnum(TryOnStatus), default=TryOnStatus.PENDING)
    stage1_prediction_id = Column(String, nullable=True)
    stage1_result_url = Column(String, nullable=True)
    stage2_prediction_id = Column(String, nullable=True)
    result_image_url = Column(String, nullable=True)

    # Quality gate
    quality_gate_score = Column(Float, nullable=True)
    quality_gate_passed = Column(Boolean, nullable=True)

    # Final rating
    rating_score = Column(Float, nullable=True)

    error_message = Column(Text, nullable=True)
    pipeline_metadata = Column(JSON, nullable=True)

    # Queue reliability + telemetry
    lifecycle_status = Column(String, nullable=False, default="queued")
    idempotency_key = Column(String, nullable=True, index=True)
    worker_task_id = Column(String, nullable=True)
    queue_enqueued_at = Column(DateTime(timezone=True), nullable=True)
    queue_started_at = Column(DateTime(timezone=True), nullable=True)
    execution_started_at = Column(DateTime(timezone=True), nullable=True)
    execution_finished_at = Column(DateTime(timezone=True), nullable=True)
    queue_wait_ms = Column(Integer, nullable=True)
    execution_ms = Column(Integer, nullable=True)
    total_latency_ms = Column(Integer, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User", back_populates="tryons")
    garment = relationship("Garment", back_populates="tryons")
