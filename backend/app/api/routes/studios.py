"""GradFiT Studios HTTP routes (Design + Stylist).

Both studios are CRUD-style:

* ``POST /api/studios/design/generate`` - kicks off a generation, blocks
  on the SageMaker async result, returns the persisted ``Design`` row.
* ``GET /api/studios/design`` - paginated list (most recent first).
* ``DELETE /api/studios/design/{id}`` - permanent delete.

Stylist mirrors the same shape against the ``Outfit`` model.

Quota enforcement intentionally piggybacks on the existing
``check_user_quota`` flow used by try-on so a generation across any
studio counts toward the same monthly bucket.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user
from app.database import get_db
from app.models.design import Design
from app.models.outfit import Outfit
from app.models.user import User
from app.schemas.studios import (
    DesignGenerateRequest,
    DesignResponse,
    OutfitResponse,
    StylistGenerateRequest,
)
from app.services.sagemaker import SagemakerInferenceError
from app.services.studios import run_design, run_stylist

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/studios", tags=["studios"])


# ── Design ────────────────────────────────────────────────────────────


@router.post("/design/generate", response_model=DesignResponse)
def generate_design(
    data: DesignGenerateRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> Design:
    """Generate a fashion piece from text (and optional sketch / refs)."""
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
        return run_design(db=db, design=design)
    except SagemakerInferenceError as exc:
        # The service has already persisted status=failed + error_message;
        # surface a 502 so the UI shows "try again" instead of a 500 toast.
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
        return run_stylist(db=db, outfit=outfit)
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
