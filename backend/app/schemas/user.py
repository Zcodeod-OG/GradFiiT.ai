from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional, Dict, Any


class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None
    subscription_tier: str = "free_2d"
    preferred_tryon_mode: str = "2d"
    avatar_status: str = "not_started"
    avatar_source_image_url: Optional[str] = None
    avatar_model_id: Optional[str] = None
    avatar_model_url: Optional[str] = None
    avatar_preview_url: Optional[str] = None
    avatar_turntable_url: Optional[str] = None
    avatar_metadata: Optional[Dict[str, Any]] = None
    avatar_error_message: Optional[str] = None
    avatar_updated_at: Optional[datetime] = None
    is_active: bool = True


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    subscription_tier: Optional[str] = None
    preferred_tryon_mode: Optional[str] = None
    is_active: Optional[bool] = None


class AvatarBuildRequest(BaseModel):
    person_image_url: str
    quality: str = "best"
    height_cm: Optional[float] = None
    body_type: Optional[str] = None
    gender: Optional[str] = None
    fit_preference: Optional[str] = None
    notes: Optional[str] = None
    force_rebuild: bool = False


class UserInDB(UserBase):
    id: int
    hashed_password: str
    is_superuser: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class User(UserBase):
    id: int
    is_superuser: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

