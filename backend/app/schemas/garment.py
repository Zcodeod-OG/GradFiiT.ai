from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class GarmentBase(BaseModel):
    name: str
    description: Optional[str] = None
    category: Optional[str] = None


class GarmentCreate(GarmentBase):
    image_url: str
    s3_key: str
    saved_to_closet: bool = True
    source_url: Optional[str] = None


class GarmentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    saved_to_closet: Optional[bool] = None
    source_url: Optional[str] = None


class Garment(GarmentBase):
    id: int
    user_id: int
    image_url: str
    s3_key: str
    extracted_image_url: Optional[str] = None
    extracted_s3_key: Optional[str] = None
    garment_type: Optional[str] = None
    preprocess_status: str
    preprocess_error: Optional[str] = None
    saved_to_closet: bool
    source_url: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

