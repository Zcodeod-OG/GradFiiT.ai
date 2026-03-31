"""
ALTER.AI - Try-On Runner

Shared pipeline execution logic used by both Celery workers and
thread-based fallback execution.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from app.database import SessionLocal
from app.models.tryon import TryOn, TryOnStatus
from app.services.pipeline import get_pipeline_service

logger = logging.getLogger(__name__)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def mark_tryon_dead_letter(tryon_id: int, message: str) -> None:
    """Mark a try-on as dead-letter after retry exhaustion."""
    db = SessionLocal()
    try:
        tryon = db.query(TryOn).filter(TryOn.id == tryon_id).first()
        if not tryon:
            return
        tryon.status = TryOnStatus.DEAD_LETTER
        tryon.lifecycle_status = "dead_letter"
        tryon.error_message = message[:500]
        tryon.execution_finished_at = _utc_now()
        if tryon.queue_enqueued_at and tryon.execution_finished_at:
            delta = tryon.execution_finished_at - tryon.queue_enqueued_at
            tryon.total_latency_ms = max(0, int(delta.total_seconds() * 1000))
        db.commit()
    finally:
        db.close()


def run_tryon_pipeline(
    tryon_id: int,
    person_image_url: str,
    garment_image_url: str,
    garment_description: str,
    quality: str,
    preprocessed_garment_url: Optional[str] = None,
    raise_on_error: bool = False,
) -> None:
    """Run the full pipeline and persist status/results on the TryOn row."""
    db = SessionLocal()
    try:
        tryon = db.query(TryOn).filter(TryOn.id == tryon_id).first()
        if not tryon:
            logger.error("TryOn %s not found for execution", tryon_id)
            return

        queue_started_at = _utc_now()
        execution_started_at = _utc_now()
        tryon.queue_started_at = queue_started_at
        tryon.execution_started_at = execution_started_at
        tryon.lifecycle_status = "processing"
        if tryon.queue_enqueued_at:
            tryon.queue_wait_ms = max(
                0,
                int((queue_started_at - tryon.queue_enqueued_at).total_seconds() * 1000),
            )
        db.commit()

        def on_stage_update(stage_name: str) -> None:
            status_map = {
                "garment_extracting": TryOnStatus.GARMENT_EXTRACTING,
                "garment_extracted": TryOnStatus.GARMENT_EXTRACTED,
                "stage1_processing": TryOnStatus.STAGE1_PROCESSING,
                "stage1_completed": TryOnStatus.STAGE1_COMPLETED,
                "quality_checking": TryOnStatus.QUALITY_CHECKING,
                "quality_passed": TryOnStatus.QUALITY_PASSED,
                "quality_failed": TryOnStatus.QUALITY_FAILED,
                "stage2_processing": TryOnStatus.STAGE2_PROCESSING,
                "rating_computing": TryOnStatus.RATING_COMPUTING,
            }
            new_status = status_map.get(stage_name)
            if new_status:
                tryon.status = new_status
                db.commit()

        pipeline = get_pipeline_service()
        result = pipeline.run_full_pipeline(
            person_image_url=person_image_url,
            garment_image_url=garment_image_url,
            garment_description=garment_description,
            quality=quality,
            preprocessed_garment_url=preprocessed_garment_url,
            on_stage_update=on_stage_update,
        )

        tryon.extracted_garment_url = result.get("extracted_garment_url")
        tryon.stage1_result_url = result.get("stage1_url")
        tryon.result_image_url = result.get("final_url")
        tryon.quality_gate_score = result.get("quality_gate_score")
        tryon.quality_gate_passed = result.get("quality_gate_passed")
        tryon.rating_score = result.get("rating_score")
        tryon.status = TryOnStatus.COMPLETED
        tryon.lifecycle_status = "ready"
        tryon.error_message = None
        tryon.pipeline_metadata = {
            "quality": result.get("quality"),
            "timings": result.get("timings", {}),
            "stages_run": result.get("stages_run", {}),
        }
        tryon.execution_finished_at = _utc_now()
        if tryon.execution_started_at and tryon.execution_finished_at:
            tryon.execution_ms = max(
                0,
                int(
                    (tryon.execution_finished_at - tryon.execution_started_at).total_seconds()
                    * 1000
                ),
            )
        if tryon.queue_enqueued_at and tryon.execution_finished_at:
            tryon.total_latency_ms = max(
                0,
                int((tryon.execution_finished_at - tryon.queue_enqueued_at).total_seconds() * 1000),
            )
        db.commit()
        logger.info("Pipeline completed for TryOn %s", tryon_id)
    except Exception as exc:
        logger.error("Pipeline failed for TryOn %s: %s", tryon_id, exc)
        try:
            tryon = db.query(TryOn).filter(TryOn.id == tryon_id).first()
            if tryon:
                tryon.status = TryOnStatus.FAILED
                tryon.lifecycle_status = "failed"
                tryon.error_message = str(exc)[:500]
                tryon.execution_finished_at = _utc_now()
                if tryon.execution_started_at and tryon.execution_finished_at:
                    tryon.execution_ms = max(
                        0,
                        int(
                            (tryon.execution_finished_at - tryon.execution_started_at).total_seconds()
                            * 1000
                        ),
                    )
                if tryon.queue_enqueued_at and tryon.execution_finished_at:
                    tryon.total_latency_ms = max(
                        0,
                        int((tryon.execution_finished_at - tryon.queue_enqueued_at).total_seconds() * 1000),
                    )
                db.commit()
        except Exception:
            logger.exception("Failed to persist failure state for TryOn %s", tryon_id)

        if raise_on_error:
            raise
    finally:
        db.close()


__all__ = ["run_tryon_pipeline", "mark_tryon_dead_letter"]
