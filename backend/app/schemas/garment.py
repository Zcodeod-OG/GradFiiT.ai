from pydantic import BaseModel
from datetime import datetime
from typing import Any, List, Optional


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


class PaletteEntry(BaseModel):
    hex: str
    weight: float


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
    color_palette: Optional[List[PaletteEntry]] = None
    palette_extracted_at: Optional[datetime] = None
    attributes: Optional[dict[str, Any]] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class GarmentSuggestion(Garment):
    """A garment surfaced as a pairing suggestion for a chosen anchor.

    `score` is opaque to the UI (just used for ordering); `reason` is
    a short label rendered in the suggestion card so the user
    understands why this item was offered."""

    score: float
    reason: str


class OutfitRecommendation(BaseModel):
    """A composed outfit returned by the recommender.

    `garments` is the ordered list of pieces (anchor first); `palette`
    is up to 5 hex colours summarising the composite look. The UI uses
    `reason` as a one-line caption beneath the outfit thumbnail.
    """

    garments: List[Garment]
    score: float
    reason: str
    palette: List[str]


class OutfitRecommendationsResponse(BaseModel):
    outfits: List[OutfitRecommendation]


class StyleProfileCategory(BaseModel):
    name: str
    count: int


class StyleProfileResponse(BaseModel):
    """Compact style fingerprint consumed by the Chrome extension to
    decide whether a product image on a retailer page matches the
    user's closet. Built by `app.services.style_profile`.
    """

    palette: List[str]
    garment_types: dict[str, int]
    categories: List[StyleProfileCategory]
    keywords: List[str]
    total_items: int

