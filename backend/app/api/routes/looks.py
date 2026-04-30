"""User-saved Looks (closet outfit assemblies).

A Look is a named, reusable combo of 2-3 garments. The render endpoint
delegates to the existing /api/tryon/combo handler so we don't fork the
provider/quota/queue logic; we just wire the look's stored garment_ids
through and remember the resulting tryon_id for the cover preview.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user
from app.api.routes.tryon import TryOnComboCreate, generate_combo_tryon
from app.database import get_db
from app.models.garment import Garment
from app.models.look import Look
from app.models.tryon import TryOn
from app.models.user import User
from app.schemas.look import (
    Look as LookSchema,
    LookCreate,
    LookRenderRequest,
    LookUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/looks", tags=["looks"])


def _serialise_look(look: Look, db: Session) -> LookSchema:
    """Resolve the joined TryOn so the cover preview reflects the live
    state of the most recent render rather than a stale snapshot."""
    schema = LookSchema.model_validate(look)
    if look.last_rendered_tryon_id:
        tryon = (
            db.query(TryOn)
            .filter(TryOn.id == look.last_rendered_tryon_id)
            .first()
        )
        if tryon:
            schema.last_rendered_image_url = tryon.result_image_url
            schema.last_rendered_at = (
                tryon.execution_finished_at or tryon.updated_at or tryon.created_at
            )
            schema.last_rendered_status = (
                tryon.status.value if tryon.status else None
            )
    return schema


def _validate_owned_garments(
    db: Session, user_id: int, garment_ids: List[int]
) -> None:
    """Reject look creates/updates that reference garments the user
    doesn't own. The combo endpoint also checks this, but we want a
    400 at save time rather than at render time."""
    if not garment_ids:
        return
    owned = (
        db.query(Garment.id)
        .filter(Garment.id.in_(garment_ids), Garment.user_id == user_id)
        .all()
    )
    owned_ids = {row[0] for row in owned}
    missing = [gid for gid in garment_ids if gid not in owned_ids]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Garment(s) not found or not yours: {missing}",
        )


@router.get("/", response_model=List[LookSchema])
def list_looks(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> List[LookSchema]:
    """List the current user's saved looks, newest first."""
    rows = (
        db.query(Look)
        .filter(Look.user_id == current_user.id)
        .order_by(Look.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return [_serialise_look(row, db) for row in rows]


@router.get("/{look_id}", response_model=LookSchema)
def get_look(
    look_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> LookSchema:
    look = (
        db.query(Look)
        .filter(Look.id == look_id, Look.user_id == current_user.id)
        .first()
    )
    if not look:
        raise HTTPException(status_code=404, detail="Look not found")
    return _serialise_look(look, db)


@router.post(
    "/", response_model=LookSchema, status_code=status.HTTP_201_CREATED
)
def create_look(
    payload: LookCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> LookSchema:
    _validate_owned_garments(db, current_user.id, payload.garment_ids)
    look = Look(
        user_id=current_user.id,
        name=payload.name.strip(),
        notes=(payload.notes or None),
        garment_ids=list(payload.garment_ids),
    )
    db.add(look)
    db.commit()
    db.refresh(look)
    return _serialise_look(look, db)


@router.put("/{look_id}", response_model=LookSchema)
def update_look(
    look_id: int,
    payload: LookUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> LookSchema:
    look = (
        db.query(Look)
        .filter(Look.id == look_id, Look.user_id == current_user.id)
        .first()
    )
    if not look:
        raise HTTPException(status_code=404, detail="Look not found")

    update_data = payload.model_dump(exclude_unset=True)
    if "garment_ids" in update_data and update_data["garment_ids"] is not None:
        _validate_owned_garments(db, current_user.id, update_data["garment_ids"])

    for field, value in update_data.items():
        if field == "name" and value is not None:
            value = value.strip()
        setattr(look, field, value)
    db.commit()
    db.refresh(look)
    return _serialise_look(look, db)


@router.delete("/{look_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_look(
    look_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    look = (
        db.query(Look)
        .filter(Look.id == look_id, Look.user_id == current_user.id)
        .first()
    )
    if not look:
        raise HTTPException(status_code=404, detail="Look not found")
    db.delete(look)
    db.commit()
    return None


@router.post("/{look_id}/render")
def render_look(
    look_id: int,
    payload: Optional[LookRenderRequest] = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Kick off a combo try-on for this look's garments.

    Delegates to the existing /api/tryon/combo handler so quota,
    provider routing, and the background pipeline behave identically to
    a hand-built combo. We just remember the resulting tryon_id on the
    look so the cover preview can derive its image when polling
    completes.
    """
    look = (
        db.query(Look)
        .filter(Look.id == look_id, Look.user_id == current_user.id)
        .first()
    )
    if not look:
        raise HTTPException(status_code=404, detail="Look not found")

    garment_ids = list(look.garment_ids or [])
    if len(garment_ids) < 2:
        raise HTTPException(
            status_code=422,
            detail="This look needs at least 2 garments before it can be rendered.",
        )

    body = payload or LookRenderRequest()
    quality = (body.quality or "balanced").lower().strip()
    if quality not in {"fast", "balanced"}:
        quality = "balanced"

    combo_payload = TryOnComboCreate(
        garment_ids=garment_ids,
        person_image_url=body.person_image_url,
        mode="2d",
        quality=quality,
    )
    response = generate_combo_tryon(
        data=combo_payload,
        x_tryon_provider=None,
        current_user=current_user,
        db=db,
    )

    tryon_id = (response.get("data") or {}).get("tryon_id")
    if tryon_id:
        look.last_rendered_tryon_id = tryon_id
        db.commit()
        db.refresh(look)

    return response
