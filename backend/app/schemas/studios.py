"""Pydantic schemas for the v1 Studios (Design + Stylist) and Brand DNA."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# ── Design ────────────────────────────────────────────────────────────


class DesignGenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=2, max_length=2000)
    negative_prompt: Optional[str] = Field(default=None, max_length=2000)
    sketch_image_url: Optional[str] = None
    style_reference_url: Optional[str] = None
    width: int = Field(default=1024, ge=512, le=1536)
    height: int = Field(default=1024, ge=512, le=1536)
    guidance_scale: float = Field(default=4.5, ge=1.0, le=10.0)
    num_inference_steps: int = Field(default=35, ge=15, le=60)
    num_images: int = Field(default=1, ge=1, le=4)
    seed: Optional[int] = None
    lora_uri: Optional[str] = None
    lora_scale: Optional[float] = Field(default=None, ge=0.0, le=1.5)
    use_brand_dna: bool = True


class DesignResponse(BaseModel):
    id: int
    user_id: int
    prompt: str
    negative_prompt: Optional[str] = None
    sketch_image_url: Optional[str] = None
    style_reference_url: Optional[str] = None
    width: int
    height: int
    num_images: int
    seed: Optional[int] = None
    primary_image_url: Optional[str] = None
    image_urls: List[str] = []
    saved: bool = False
    status: str
    error_message: Optional[str] = None
    pipeline_metadata: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ── Stylist ───────────────────────────────────────────────────────────


class StylistPiece(BaseModel):
    slot: str = Field(..., description="e.g. top, bottom, outerwear, shoes")
    description: str = Field(..., min_length=1, max_length=400)
    color: Optional[str] = None
    fabric: Optional[str] = None


class StylistGenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=2, max_length=2000)
    pieces: List[StylistPiece] = Field(default_factory=list, max_length=8)
    background: str = Field(default="studio", max_length=64)
    model_reference_url: Optional[str] = None
    seed: Optional[int] = None
    num_images: int = Field(default=1, ge=1, le=4)
    lora_uri: Optional[str] = None
    lora_scale: Optional[float] = Field(default=None, ge=0.0, le=1.5)
    use_brand_dna: bool = True


class OutfitResponse(BaseModel):
    id: int
    user_id: int
    prompt: str
    pieces: List[Dict[str, Any]] = []
    background: str
    model_reference_url: Optional[str] = None
    seed: Optional[int] = None
    num_images: int
    primary_image_url: Optional[str] = None
    image_urls: List[str] = []
    saved: bool = False
    status: str
    error_message: Optional[str] = None
    pipeline_metadata: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SetPrimaryImageRequest(BaseModel):
    image_url: str = Field(..., min_length=8)


class SaveToClosetRequest(BaseModel):
    name: Optional[str] = Field(default=None, max_length=120)
    category: Optional[str] = Field(default=None, max_length=64)


# ── Brand DNA ────────────────────────────────────────────────────────


class BrandDNAUpdate(BaseModel):
    palette: Optional[List[str]] = Field(default=None, max_length=12)
    logos: Optional[List[str]] = Field(default=None, max_length=8)
    model_references: Optional[List[str]] = Field(default=None, max_length=12)
    voice: Optional[str] = Field(default=None, max_length=2000)
    lora_uri: Optional[str] = None
    lora_strength: Optional[float] = Field(default=None, ge=0.0, le=1.5)


class BrandDNAResponse(BaseModel):
    id: int
    user_id: int
    palette: List[str] = []
    logos: List[str] = []
    model_references: List[str] = []
    voice: Optional[str] = None
    lora_uri: Optional[str] = None
    lora_status: str = "none"
    lora_strength: float = 1.0
    lora_metadata: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
