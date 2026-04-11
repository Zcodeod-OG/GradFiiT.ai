from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.config import settings
from app.models.user import User
from app.models.garment import Garment
from app.schemas.garment import Garment as GarmentSchema, GarmentCreate, GarmentUpdate
from app.api.deps import get_current_active_user
from app.services.garment_runner import run_garment_preprocess
from app.services.tasks import process_garment_task

router = APIRouter()


@router.get("/", response_model=List[GarmentSchema])
def get_garments(
    skip: int = 0,
    limit: int = 100,
    saved_only: bool = False,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get all garments for current user"""
    query = db.query(Garment).filter(Garment.user_id == current_user.id)
    if saved_only:
        query = query.filter(Garment.saved_to_closet.is_(True))
    garments = query.offset(skip).limit(limit).all()
    return garments


@router.get("/{garment_id}", response_model=GarmentSchema)
def get_garment(
    garment_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get a specific garment"""
    garment = (
        db.query(Garment)
        .filter(Garment.id == garment_id, Garment.user_id == current_user.id)
        .first()
    )
    if not garment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Garment not found"
        )
    return garment


@router.post("/", response_model=GarmentSchema, status_code=status.HTTP_201_CREATED)
def create_garment(
    garment: GarmentCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Create a new garment"""
    db_garment = Garment(
        **garment.model_dump(),
        user_id=current_user.id,
        preprocess_status="queued",
        preprocess_error=None,
    )
    db.add(db_garment)
    db.commit()
    db.refresh(db_garment)

    if settings.ENABLE_CELERY_GARMENT_PREPROCESS:
        try:
            process_garment_task.apply_async(args=(db_garment.id,), ignore_result=True)
        except Exception:
            db_garment.preprocess_status = "processing"
            db.commit()
            run_garment_preprocess(db_garment.id)
    else:
        db_garment.preprocess_status = "processing"
        db.commit()
        run_garment_preprocess(db_garment.id)
    db.refresh(db_garment)
    return db_garment


@router.put("/{garment_id}", response_model=GarmentSchema)
def update_garment(
    garment_id: int,
    garment_update: GarmentUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Update a garment"""
    db_garment = (
        db.query(Garment)
        .filter(Garment.id == garment_id, Garment.user_id == current_user.id)
        .first()
    )
    if not db_garment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Garment not found"
        )

    update_data = garment_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_garment, field, value)

    db.commit()
    db.refresh(db_garment)
    return db_garment


@router.delete("/{garment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_garment(
    garment_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Delete a garment"""
    db_garment = (
        db.query(Garment)
        .filter(Garment.id == garment_id, Garment.user_id == current_user.id)
        .first()
    )
    if not db_garment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Garment not found"
        )
    db.delete(db_garment)
    db.commit()
    return None

