"""
ALTER.AI - Garment Preprocess Runner

Shared garment preprocessing logic used by Celery workers and
synchronous fallback execution.
"""

from __future__ import annotations

import logging

from app.database import SessionLocal
from app.models.garment import Garment
from app.services.garment_processor import get_garment_processor

logger = logging.getLogger(__name__)


def run_garment_preprocess(
    garment_id: int,
    raise_on_error: bool = False,
) -> None:
    """Extract garment background and classify garment type."""
    db = SessionLocal()
    try:
        garment = db.query(Garment).filter(Garment.id == garment_id).first()
        if not garment:
            logger.warning("Garment %s not found for preprocessing", garment_id)
            return

        garment.preprocess_status = "processing"
        garment.preprocess_error = None
        db.commit()

        processor = get_garment_processor()

        try:
            garment.extracted_image_url = processor.remove_background(garment.image_url)
        except Exception as exc:
            logger.warning(
                "Garment %s background removal failed, using original: %s",
                garment_id,
                exc,
            )
            garment.extracted_image_url = garment.image_url

        try:
            garment.garment_type = processor.classify_garment(
                garment.extracted_image_url or garment.image_url
            )
        except Exception as exc:
            logger.warning(
                "Garment %s classification failed, defaulting to upper_body: %s",
                garment_id,
                exc,
            )
            garment.garment_type = "upper_body"

        garment.preprocess_status = "ready"
        garment.preprocess_error = None
        db.commit()
        logger.info("Garment %s preprocessing completed", garment_id)
    except Exception as exc:
        logger.error("Garment %s preprocessing failed: %s", garment_id, exc)
        db.rollback()
        try:
            garment = db.query(Garment).filter(Garment.id == garment_id).first()
            if garment:
                garment.preprocess_status = "failed"
                garment.preprocess_error = str(exc)[:500]
                db.commit()
        except Exception:
            logger.exception("Failed to persist garment preprocess error for %s", garment_id)
        if raise_on_error:
            raise
    finally:
        db.close()


__all__ = ["run_garment_preprocess"]
