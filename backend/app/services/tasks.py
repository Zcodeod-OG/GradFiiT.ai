import logging

from celery import Celery
from celery.signals import worker_process_init
from app.config import settings
from app.services.garment_runner import run_garment_preprocess
from app.services.tryon_runner import mark_tryon_dead_letter, run_tryon_pipeline

logger = logging.getLogger(__name__)

# Initialize Celery
celery_app = Celery(
    "gradfit",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    # API paths never await Celery task results; disabling result storage avoids
    # hard dependency on result backend connectivity during dispatch.
    task_ignore_result=True,
)


@celery_app.task(
    bind=True,
    name="process_tryon",
    max_retries=2,
    soft_time_limit=settings.TRYON_SOFT_TIME_LIMIT_SECONDS,
    time_limit=settings.TRYON_HARD_TIME_LIMIT_SECONDS,
    ignore_result=True,
)
def process_tryon_task(
    self,
    tryon_id: int,
    person_image_url: str,
    garment_image_url: str,
    garment_description: str,
    quality: str,
    garment_category: str | None = None,
    preprocessed_garment_url: str | None = None,
    mode: str = "2d",
    provider_override: str | None = None,
    cached_default_person_url: str | None = None,
    cached_smart_crop_url: str | None = None,
    cached_face_url: str | None = None,
    cached_face_embedding: list | None = None,
    source: str | None = None,
):
    """Celery task for processing virtual try-on."""
    try:
        run_tryon_pipeline(
            tryon_id=tryon_id,
            person_image_url=person_image_url,
            garment_image_url=garment_image_url,
            garment_description=garment_description,
            quality=quality,
            garment_category=garment_category,
            preprocessed_garment_url=preprocessed_garment_url,
            mode=mode,
            provider_override=provider_override,
            raise_on_error=True,
            cached_default_person_url=cached_default_person_url,
            cached_smart_crop_url=cached_smart_crop_url,
            cached_face_url=cached_face_url,
            cached_face_embedding=cached_face_embedding,
            source=source,
        )
    except Exception as exc:
        if self.request.retries >= self.max_retries:
            mark_tryon_dead_letter(
                tryon_id,
                f"Retries exhausted: {exc}",
            )
            raise
        raise self.retry(exc=exc, countdown=2 ** (self.request.retries + 1))


@celery_app.task(
    bind=True,
    name="process_garment",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=2,
    ignore_result=True,
)
def process_garment_task(self, garment_id: int):
    """Celery task for preprocessing garment metadata."""
    run_garment_preprocess(garment_id=garment_id, raise_on_error=True)


@celery_app.task(
    bind=True,
    name="precompute_person_photo",
    max_retries=1,
    soft_time_limit=180,
    time_limit=240,
    ignore_result=True,
)
def precompute_person_photo_task(self, user_id: int):
    """Run the input gate, face crop, and CLIP embedding for a user's saved
    person photo. Best-effort: failures degrade to "cache empty" and the
    try-on pipeline will re-compute on demand.
    """
    # Local imports keep the API process from pulling SQLAlchemy session
    # state when it just dispatches the task.
    from app.database import SessionLocal
    from app.models.user import User
    from app.services.person_photo import precompute_person_photo_artifacts

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user or not user.default_person_image_url:
            return
        try:
            precompute_person_photo_artifacts(db, user)
            db.add(user)
            db.commit()
        except Exception as exc:
            db.rollback()
            logger.warning(
                "precompute_person_photo_task: failed for user %s: %s", user_id, exc
            )
    finally:
        db.close()


@worker_process_init.connect
def _warm_yolo_on_worker_start(**_kwargs):
    """Load the YOLO11 pose model once per worker process so the first
    person-photo precompute doesn't pay the cold-start cost inside the
    request lifecycle of the task itself. Best-effort: never block boot.
    """
    try:
        from app.services.yolo_pose import get_yolo_pose_service

        get_yolo_pose_service()._load_model()
    except Exception as exc:  # pragma: no cover - optional warmup
        logger.warning("YOLO warmup at worker init failed: %s", exc)

