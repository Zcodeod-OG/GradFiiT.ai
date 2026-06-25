"""GradFiT Studios HTTP routes (Design + Stylist).

Both studios are CRUD-style:

* ``POST /api/studios/design/generate`` - kicks off a generation, blocks
  on the SageMaker async result, returns the persisted ``Design`` row.
* ``GET /api/studios/design`` - paginated list (most recent first).
* ``DELETE /api/studios/design/{id}`` - permanent delete.

Stylist mirrors the same shape against the ``Outfit`` model.

Quota enforcement piggybacks on the existing try-on quota bucket so a
generation across any studio counts toward the same monthly allowance.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user
from app.config import settings
from app.database import get_db
from app.models.design import Design
from app.models.garment import Garment
from app.models.outfit import Outfit
from app.models.user import User
from app.schemas.garment import Garment as GarmentSchema
from app.schemas.studios import (
    DesignGenerateRequest,
    DesignResponse,
    OutfitResponse,
    SaveToClosetRequest,
    SetPrimaryImageRequest,
    StylistGenerateRequest,
)
from app.services.garment_runner import run_garment_preprocess
from app.services.sagemaker import SagemakerInferenceError
from app.services.storage import get_storage
from app.services.studios import run_design, run_stylist
from app.services.subscription import enforce_studio_quota
from app.services.tasks import process_garment_task

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/studios", tags=["studios"])


def _kickoff_preprocess(garment: Garment, db: Session) -> None:
    if settings.ENABLE_CELERY_GARMENT_PREPROCESS:
        try:
            process_garment_task.apply_async(args=(garment.id,), ignore_result=True)
        except Exception:
            garment.preprocess_status = "processing"
            db.commit()
            run_garment_preprocess(garment.id)
    else:
        garment.preprocess_status = "processing"
        db.commit()
        run_garment_preprocess(garment.id)


def _resolve_image_key(image_url: str, user_id: int) -> str:
    storage = get_storage()
    key = storage._extract_bucket_key_from_url(image_url)
    if key:
        return key
    return f"studios/{user_id}/{uuid.uuid4()}.png"


def _save_generation_to_closet(
    *,
    db: Session,
    user: User,
    image_url: str,
    default_name: str,
    payload: SaveToClosetRequest,
) -> Garment:
    if not image_url:
        raise HTTPException(status_code=400, detail="Generation has no image to save")

    name = (payload.name or default_name).strip()[:120]
    if not name:
        raise HTTPException(status_code=400, detail="Garment name is required")

    garment = Garment(
        user_id=user.id,
        name=name,
        description=None,
        category=(payload.category or "Studio").strip()[:64] or "Studio",
        image_url=image_url,
        s3_key=_resolve_image_key(image_url, user.id),
        saved_to_closet=True,
        preprocess_status="queued",
        preprocess_error=None,
    )
    db.add(garment)
    db.commit()
    db.refresh(garment)
    _kickoff_preprocess(garment, db)
    db.refresh(garment)
    return garment


# ── Design ────────────────────────────────────────────────────────────


@router.post("/design/generate", response_model=DesignResponse)
def generate_design(
    data: DesignGenerateRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> Design:
    """Generate a fashion piece from text (and optional sketch / refs)."""
    enforce_studio_quota(db=db, user=current_user)

    design = Design(
        user_id=current_user.id,
        prompt=data.prompt,
        negative_prompt=data.negative_prompt,
        sketch_image_url=data.sketch_image_url,
        style_reference_url=data.style_reference_url,
        width=data.width,
        height=data.height,
        guidance_scale=data.guidance_scale,
        num_inference_steps=data.num_inference_steps,
        num_images=data.num_images,
        seed=data.seed,
        lora_uri=data.lora_uri,
        lora_scale=data.lora_scale,
        status="queued",
    )
    db.add(design)
    db.commit()
    db.refresh(design)

    try:
        return run_design(db=db, design=design, use_brand_dna=data.use_brand_dna)
    except SagemakerInferenceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/design", response_model=List[DesignResponse])
def list_designs(
    skip: int = Query(0, ge=0),
    limit: int = Query(24, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> List[Design]:
    rows = (
        db.query(Design)
        .filter(Design.user_id == current_user.id)
        .order_by(Design.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return rows


@router.get("/design/{design_id}", response_model=DesignResponse)
def get_design(
    design_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> Design:
    row = (
        db.query(Design)
        .filter(Design.id == design_id, Design.user_id == current_user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Design not found")
    return row


@router.put("/design/{design_id}/primary", response_model=DesignResponse)
def set_design_primary(
    design_id: int,
    payload: SetPrimaryImageRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> Design:
    row = (
        db.query(Design)
        .filter(Design.id == design_id, Design.user_id == current_user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Design not found")
    urls = row.image_urls or []
    if payload.image_url not in urls:
        raise HTTPException(status_code=400, detail="Image is not part of this design")
    row.primary_image_url = payload.image_url
    db.commit()
    db.refresh(row)
    return row


@router.post("/design/{design_id}/save-to-closet", response_model=GarmentSchema)
def save_design_to_closet(
    design_id: int,
    payload: SaveToClosetRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> Garment:
    row = (
        db.query(Design)
        .filter(Design.id == design_id, Design.user_id == current_user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Design not found")
    if not row.primary_image_url:
        raise HTTPException(status_code=400, detail="Design has no rendered image yet")

    garment = _save_generation_to_closet(
        db=db,
        user=current_user,
        image_url=row.primary_image_url,
        default_name=row.prompt[:80],
        payload=payload,
    )
    row.saved = True
    db.commit()
    return garment


@router.delete("/design/{design_id}")
def delete_design(
    design_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    row = (
        db.query(Design)
        .filter(Design.id == design_id, Design.user_id == current_user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Design not found")
    db.delete(row)
    db.commit()
    return {"deleted": design_id}


# ── Stylist ───────────────────────────────────────────────────────────


@router.post("/stylist/generate", response_model=OutfitResponse)
def generate_outfit(
    data: StylistGenerateRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> Outfit:
    enforce_studio_quota(db=db, user=current_user)

    pieces_payload = [piece.model_dump(exclude_none=True) for piece in data.pieces]
    outfit = Outfit(
        user_id=current_user.id,
        prompt=data.prompt,
        pieces=pieces_payload,
        background=data.background,
        model_reference_url=data.model_reference_url,
        seed=data.seed,
        num_images=data.num_images,
        lora_uri=data.lora_uri,
        lora_scale=data.lora_scale,
        status="queued",
    )
    db.add(outfit)
    db.commit()
    db.refresh(outfit)

    try:
        return run_stylist(db=db, outfit=outfit, use_brand_dna=data.use_brand_dna)
    except SagemakerInferenceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/stylist", response_model=List[OutfitResponse])
def list_outfits(
    skip: int = Query(0, ge=0),
    limit: int = Query(24, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> List[Outfit]:
    return (
        db.query(Outfit)
        .filter(Outfit.user_id == current_user.id)
        .order_by(Outfit.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.get("/stylist/{outfit_id}", response_model=OutfitResponse)
def get_outfit(
    outfit_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> Outfit:
    row = (
        db.query(Outfit)
        .filter(Outfit.id == outfit_id, Outfit.user_id == current_user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Outfit not found")
    return row


@router.put("/stylist/{outfit_id}/primary", response_model=OutfitResponse)
def set_outfit_primary(
    outfit_id: int,
    payload: SetPrimaryImageRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> Outfit:
    row = (
        db.query(Outfit)
        .filter(Outfit.id == outfit_id, Outfit.user_id == current_user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Outfit not found")
    urls = row.image_urls or []
    if payload.image_url not in urls:
        raise HTTPException(status_code=400, detail="Image is not part of this outfit")
    row.primary_image_url = payload.image_url
    db.commit()
    db.refresh(row)
    return row


@router.post("/stylist/{outfit_id}/save-to-closet", response_model=GarmentSchema)
def save_outfit_to_closet(
    outfit_id: int,
    payload: SaveToClosetRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> Garment:
    row = (
        db.query(Outfit)
        .filter(Outfit.id == outfit_id, Outfit.user_id == current_user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Outfit not found")
    if not row.primary_image_url:
        raise HTTPException(status_code=400, detail="Outfit has no rendered image yet")

    garment = _save_generation_to_closet(
        db=db,
        user=current_user,
        image_url=row.primary_image_url,
        default_name=row.prompt[:80],
        payload=payload,
    )
    row.saved = True
    db.commit()
    return garment


@router.delete("/stylist/{outfit_id}")
def delete_outfit(
    outfit_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    row = (
        db.query(Outfit)
        .filter(Outfit.id == outfit_id, Outfit.user_id == current_user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Outfit not found")
    db.delete(row)
    db.commit()
    return {"deleted": outfit_id}
