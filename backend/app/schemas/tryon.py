from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Dict, Any
from app.models.tryon import TryOnStatus


class TryOnCreate(BaseModel):
    garment_id: int
    person_image_url: str
    quality: str = "balanced"


class TryOnResponse(BaseModel):
    id: int
    user_id: int
    garment_id: int
    person_image_url: str
    garment_image_url: Optional[str] = None
    extracted_garment_url: Optional[str] = None
    status: TryOnStatus
    stage1_result_url: Optional[str] = None
    result_image_url: Optional[str] = None
    quality_gate_score: Optional[float] = None
    quality_gate_passed: Optional[bool] = None
    rating_score: Optional[float] = None
    error_message: Optional[str] = None
    pipeline_metadata: Optional[Dict[str, Any]] = None
    lifecycle_status: str
    worker_task_id: Optional[str] = None
    queue_wait_ms: Optional[int] = None
    execution_ms: Optional[int] = None
    total_latency_ms: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TryOnStatusResponse(BaseModel):
    tryon_id: int
    status: TryOnStatus
    progress: int = 0
    current_stage: str = "pending"
    extracted_garment_url: Optional[str] = None
    stage1_result_url: Optional[str] = None
    result_image_url: Optional[str] = None
    quality_gate_score: Optional[float] = None
    quality_gate_passed: Optional[bool] = None
    rating_score: Optional[float] = None
    error_message: Optional[str] = None
    pipeline_metadata: Optional[Dict[str, Any]] = None
    lifecycle_status: str = "queued"
    worker_task_id: Optional[str] = None
    queue_wait_ms: Optional[int] = None
    execution_ms: Optional[int] = None
    total_latency_ms: Optional[int] = None
    created_at: Optional[datetime] = None
