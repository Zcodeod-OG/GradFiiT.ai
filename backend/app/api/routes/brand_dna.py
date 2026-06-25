"""Brand DNA route - persistent style guide that conditions every studio.

The Brand DNA row is a per-user singleton (unique on ``user_id``). The
endpoints lazily upsert it on first ``PUT`` so the frontend never has to
care whether a row exists yet.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user
from app.database import get_db
from app.models.brand_dna import BrandDNA
from app.models.user import User
from app.schemas.studios import BrandDNAResponse, BrandDNAUpdate

router = APIRouter(prefix="/api/brand-dna", tags=["brand-dna"])


def _lora_uri_is_valid(uri: str) -> bool:
    """Best-effort check that a pasted LoRA URI looks usable."""
    value = (uri or "").strip()
    if not value:
        return False
    if value.startswith("s3://"):
        return value.endswith(".safetensors")
    if value.startswith(("http://", "https://")):
        return ".safetensors" in value.lower()
    return False


def _resolve_lora_status(lora_uri: Optional[str]) -> str:
    if not lora_uri or not str(lora_uri).strip():
        return "none"
    return "ready" if _lora_uri_is_valid(str(lora_uri)) else "none"


def _get_or_create(db: Session, user_id: int) -> BrandDNA:
    row = db.query(BrandDNA).filter(BrandDNA.user_id == user_id).first()
    if row:
        return row
    row = BrandDNA(
        user_id=user_id,
        palette=[],
        logos=[],
        model_references=[],
        lora_status="none",
        lora_strength=1.0,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("", response_model=BrandDNAResponse)
def get_brand_dna(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> BrandDNA:
    return _get_or_create(db, current_user.id)


@router.put("", response_model=BrandDNAResponse)
def update_brand_dna(
    data: BrandDNAUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> BrandDNA:
    row = _get_or_create(db, current_user.id)
    payload = data.model_dump(exclude_unset=True)
    for field, value in payload.items():
        setattr(row, field, value)
    if "lora_uri" in payload:
        row.lora_status = _resolve_lora_status(payload.get("lora_uri"))
    db.commit()
    db.refresh(row)
    return row


@router.delete("")
def reset_brand_dna(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    row = db.query(BrandDNA).filter(BrandDNA.user_id == current_user.id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Brand DNA not configured")
    db.delete(row)
    db.commit()
    return {"reset": True}
