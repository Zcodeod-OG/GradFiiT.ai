from celery import Celery
from app.config import settings
from app.services.garment_runner import run_garment_preprocess
from app.services.tryon_runner import mark_tryon_dead_letter, run_tryon_pipeline

# Initialize Celery
celery_app = Celery(
    "alterai",
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
)


@celery_app.task(
    bind=True,
    name="process_tryon",
    max_retries=2,
    soft_time_limit=settings.TRYON_SOFT_TIME_LIMIT_SECONDS,
    time_limit=settings.TRYON_HARD_TIME_LIMIT_SECONDS,
)
def process_tryon_task(
    self,
    tryon_id: int,
    person_image_url: str,
    garment_image_url: str,
    garment_description: str,
    quality: str,
    preprocessed_garment_url: str | None = None,
    mode: str = "2d",
):
    """Celery task for processing virtual try-on."""
    try:
        run_tryon_pipeline(
            tryon_id=tryon_id,
            person_image_url=person_image_url,
            garment_image_url=garment_image_url,
            garment_description=garment_description,
            quality=quality,
            preprocessed_garment_url=preprocessed_garment_url,
            mode=mode,
            raise_on_error=True,
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
)
def process_garment_task(self, garment_id: int):
    """Celery task for preprocessing garment metadata."""
    run_garment_preprocess(garment_id=garment_id, raise_on_error=True)

