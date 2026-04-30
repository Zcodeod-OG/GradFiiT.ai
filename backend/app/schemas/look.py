"""Pydantic schemas for user-saved Looks (closet outfit assemblies)."""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class LookBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    notes: Optional[str] = Field(None, max_length=500)


class LookCreate(LookBase):
    garment_ids: List[int] = Field(
        ...,
        min_length=2,
        max_length=3,
        description="Ordered garment ids (bottom-layer first). 2-3 garments.",
    )


class LookUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    notes: Optional[str] = Field(None, max_length=500)
    garment_ids: Optional[List[int]] = Field(
        None,
        min_length=2,
        max_length=3,
        description="Ordered garment ids (bottom-layer first). 2-3 garments.",
    )


class LookRenderRequest(BaseModel):
    person_image_url: Optional[str] = None
    quality: Optional[str] = Field(
        "balanced",
        description="Combo try-on supports 'fast' or 'balanced' only.",
    )


class Look(LookBase):
    id: int
    user_id: int
    garment_ids: List[int]
    last_rendered_tryon_id: Optional[int] = None
    # Derived from the joined TryOn row at serialize time. Not columns on
    # the looks table -- they live on the TryOn the look points at.
    last_rendered_image_url: Optional[str] = None
    last_rendered_at: Optional[datetime] = None
    last_rendered_status: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
