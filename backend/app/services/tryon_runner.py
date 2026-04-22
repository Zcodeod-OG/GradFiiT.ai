"""GradFiT - Try-On Runner

Shared try-on execution logic used by both Celery workers and the
in-process thread fallback.

The 2D path now goes through :func:`get_tryon_provider` so we can swap
between Fashn.ai (default) and the legacy 5-stage Replicate pipeline
without touching this module. The 3D path is unchanged -- it still calls
the dedicated 3D try-on service.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence

from app.config import settings
from app.database import SessionLocal
from app.models.tryon import TryOn, TryOnStatus
from app.services.three_d_tryon import get_three_d_tryon_service
from app.services.tryon_input_gate import InputGateError, get_tryon_input_gate
from app.services.tryon_postprocessor import postprocess as run_postprocess
from app.services.tryon_preprocessor import get_tryon_preprocessor
from app.services.tryon_providers import (
    PROVIDER_STAGE_COMPLETED,
    PROVIDER_STAGE_PROCESSING,
    PROVIDER_STAGE_QUEUED,
    ProviderError,
    get_tryon_provider,
)
from app.services.postprocess.bg_compose import isolate_person
from app.services.storage import get_storage

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


# Map provider stage names onto the TryOnStatus enum used everywhere else.
# Single-call providers emit only the three short-form stages; the legacy
# pipeline still emits the long-form garment_extracting / quality_* /
# stage2_processing / rating_computing labels, which we keep mapping here
# so neither path is special-cased downstream.
_STAGE_TO_STATUS: Dict[str, TryOnStatus] = {
    PROVIDER_STAGE_QUEUED: TryOnStatus.QUEUED,
    PROVIDER_STAGE_PROCESSING: TryOnStatus.STAGE1_PROCESSING,
    PROVIDER_STAGE_COMPLETED: TryOnStatus.STAGE1_COMPLETED,
    "garment_extracting": TryOnStatus.GARMENT_EXTRACTING,
    "garment_extracted": TryOnStatus.GARMENT_EXTRACTED,
    "stage1_processing": TryOnStatus.STAGE1_PROCESSING,
    "stage1_completed": TryOnStatus.STAGE1_COMPLETED,
    "quality_checking": TryOnStatus.QUALITY_CHECKING,
    "quality_passed": TryOnStatus.QUALITY_PASSED,
    "quality_failed": TryOnStatus.QUALITY_FAILED,
    "stage2_processing": TryOnStatus.STAGE2_PROCESSING,
    "rating_computing": TryOnStatus.RATING_COMPUTING,
    # Layer 2 post-processing stages -- collapse to a single enum value
    # so we don't sprawl the schema. The frontend reads the granular
    # label from STAGE_LABEL_MAP in api/routes/tryon.py.
    "postprocess_identity": TryOnStatus.POSTPROCESSING,
    "postprocess_face": TryOnStatus.POSTPROCESSING,
    "postprocess_upscale": TryOnStatus.POSTPROCESSING,
}


def run_tryon_pipeline(
    tryon_id: int,
    person_image_url: str,
    garment_image_url: str,
    garment_description: str,
    quality: str,
    garment_category: Optional[str] = None,
    preprocessed_garment_url: Optional[str] = None,
    mode: str = "2d",
    provider_override: Optional[str] = None,
    raise_on_error: bool = False,
    cached_default_person_url: Optional[str] = None,
    cached_smart_crop_url: Optional[str] = None,
    cached_face_url: Optional[str] = None,
    cached_face_embedding: Optional[Sequence[float]] = None,
) -> None:
    """Run the active try-on provider and persist status/results on the row.

    Args:
        provider_override: Optional ``TRYON_PROVIDER`` slug forwarded to
            :func:`get_tryon_provider`. Typically supplied via the
            ``X-TryOn-Provider`` header so QA can A/B compare backends.
    """
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

        normalized_mode = (mode or "2d").lower().strip()

        if normalized_mode == "3d":
            _run_three_d_path(
                db=db,
                tryon=tryon,
                person_image_url=person_image_url,
                garment_image_url=garment_image_url,
                garment_description=garment_description,
                quality=quality,
            )
        else:
            _run_two_d_path(
                db=db,
                tryon=tryon,
                person_image_url=person_image_url,
                garment_image_url=garment_image_url,
                garment_description=garment_description,
                garment_category=garment_category,
                preprocessed_garment_url=preprocessed_garment_url,
                quality=quality,
                provider_override=provider_override,
                cached_default_person_url=cached_default_person_url,
                cached_smart_crop_url=cached_smart_crop_url,
                cached_face_url=cached_face_url,
                cached_face_embedding=(
                    list(cached_face_embedding) if cached_face_embedding else None
                ),
            )

        tryon.status = TryOnStatus.COMPLETED
        tryon.lifecycle_status = "ready"
        tryon.error_message = None
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
        logger.info("Try-on completed for TryOn %s", tryon_id)
    except Exception as exc:
        logger.error("Try-on failed for TryOn %s: %s", tryon_id, exc)
        try:
            tryon = db.query(TryOn).filter(TryOn.id == tryon_id).first()
            if tryon:
                if not tryon.result_image_url and tryon.stage1_result_url:
                    tryon.result_image_url = tryon.stage1_result_url
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


# ── 2D path: provider-backed single (or multi-stage) call ──────


def _run_two_d_path(
    *,
    db,
    tryon: TryOn,
    person_image_url: str,
    garment_image_url: str,
    garment_description: str,
    garment_category: Optional[str],
    preprocessed_garment_url: Optional[str],
    quality: str,
    provider_override: Optional[str],
    cached_default_person_url: Optional[str] = None,
    cached_smart_crop_url: Optional[str] = None,
    cached_face_url: Optional[str] = None,
    cached_face_embedding: Optional[List[float]] = None,
) -> None:
    provider = get_tryon_provider(provider_override)

    # When the runner was invoked with the user's saved default photo
    # *and* we have a precomputed smart-crop / face embedding for it, we
    # can short-circuit the input gate and the postprocessor's reference
    # face crop. The cache is only safe to use when the URL we're about
    # to process is the same one the cache was built from -- otherwise
    # we fall back to the full Layer-1 path.
    cache_applies = bool(
        cached_default_person_url
        and person_image_url
        and cached_default_person_url.strip() == person_image_url.strip()
    )

    # Use the background-removed garment when available; falls back to the
    # raw upload otherwise.
    effective_garment_url = preprocessed_garment_url or garment_image_url

    # Keep the truly-original person URL around; the postprocessor needs it
    # for identity comparison and BG composite, both of which want the
    # untouched user photo, not the smart-cropped/isolated variant we send
    # to Fashn.
    original_person_url = person_image_url

    preprocess_notes: Dict[str, str] = {}
    try:
        prep = get_tryon_preprocessor().preprocess(
            person_image_url=person_image_url,
            garment_image_url=effective_garment_url,
        )
        person_image_url = prep.person_image_url
        effective_garment_url = prep.garment_image_url
        preprocess_notes = prep.notes or {}
        if prep.person_changed or prep.garment_changed:
            logger.info(
                "TryOn %s: preprocessor normalized inputs (person=%s, garment=%s)",
                tryon.id,
                prep.person_changed,
                prep.garment_changed,
            )
    except Exception as exc:
        # Preprocessor failures should never block the try-on -- the
        # downstream provider will surface a real error if it matters.
        logger.warning("TryOn %s: preprocessor failed (%s); using raw URLs", tryon.id, exc)

    # ── Layer 1: input quality gate (pose/blur/coverage + smart crop) ──
    input_gate_metrics: Dict[str, Any] = {}
    if cache_applies and cached_smart_crop_url:
        # The user already passed the gate when they uploaded their
        # default photo. Reuse the cached smart-crop so we skip the
        # YOLO pose pass + S3 upload on every try-on.
        input_gate_metrics = {
            "passed": True,
            "smart_cropped": True,
            "reasons": [],
            "metrics": {"gate": "cached_default_photo"},
        }
        person_image_url = cached_smart_crop_url
    elif cache_applies:
        input_gate_metrics = {
            "passed": True,
            "smart_cropped": False,
            "reasons": [],
            "metrics": {"gate": "cached_default_photo_no_crop"},
        }
    else:
        try:
            gate = get_tryon_input_gate().validate(person_image_url)
            input_gate_metrics = {
                "passed": gate.passed,
                "smart_cropped": gate.smart_cropped,
                "reasons": gate.reasons,
                "metrics": gate.metrics,
            }
            if gate.smart_cropped and gate.person_image_url:
                person_image_url = gate.person_image_url
            if not gate.passed:
                if settings.INPUT_GATE_HARD_FAIL:
                    raise InputGateError(
                        "Input image rejected by quality gate: "
                        + "; ".join(gate.reasons or ["unknown"])
                    )
                logger.info(
                    "TryOn %s: input gate flagged issues but hard-fail off (reasons=%s)",
                    tryon.id,
                    gate.reasons,
                )
        except InputGateError:
            raise
        except Exception as exc:
            logger.warning("TryOn %s: input gate raised (%s); skipping", tryon.id, exc)

    # ── Layer 1: optional BG isolation before sending to provider ──────
    bg_isolate_meta: Dict[str, Any] = {}
    if settings.BG_ISOLATE_ENABLED:
        isolated_url, bg_isolate_meta = isolate_person(person_image_url)
        if isolated_url:
            logger.info("TryOn %s: BG-isolated person image", tryon.id)
            person_image_url = isolated_url

    def on_progress(stage_name: str) -> None:
        new_status = _STAGE_TO_STATUS.get(stage_name)
        if new_status:
            tryon.status = new_status
            # Stash the granular sub-stage so the API can render a
            # finer-grained label than the bare TryOnStatus enum value.
            if stage_name.startswith("postprocess_"):
                meta = dict(tryon.pipeline_metadata or {})
                pp = dict(meta.get("postprocess") or {})
                pp["current_stage"] = stage_name
                meta["postprocess"] = pp
                tryon.pipeline_metadata = meta
            db.commit()

    # Our S3 bucket is private, so bare
    # `https://<bucket>.s3.<region>.amazonaws.com/<key>` URLs return 403 to
    # external providers (e.g. Fashn's ImageLoader). Presign on the way out
    # so the provider can fetch for the duration of the prediction. Falls
    # back to the original URL for non-bucket URLs (CDN, retailer images).
    _storage = get_storage()
    provider_person_url = (
        _storage.to_provider_access_url(person_image_url, expiration=3600)
        or person_image_url
    )
    provider_garment_url = (
        _storage.to_provider_access_url(effective_garment_url, expiration=3600)
        or effective_garment_url
    )

    def _invoke_provider(*, force_new_seed: bool = False):
        # Wrapped so the postprocessor can re-run with a fresh seed when
        # identity drift can't be resolved by candidate rescoring. We
        # keep the same person/garment URLs -- only the seed varies.
        return provider.run(
            person_image_url=provider_person_url,
            garment_image_url=provider_garment_url,
            garment_category=garment_category,
            garment_description=garment_description,
            quality=quality,
            tryon_id=tryon.id,
            on_progress=on_progress if not force_new_seed else None,
        )

    try:
        result = _invoke_provider()
    except ProviderError as exc:
        # Surface provider errors with provider context attached.
        raise RuntimeError(
            f"[{exc.provider}] {exc}"
            + (f" -- details={exc.details}" if exc.details else "")
        ) from exc

    if not result.result_image_url:
        raise RuntimeError("Try-on provider returned no result image URL")

    raw_provider_url = result.result_image_url
    raw_candidates = list(result.candidate_image_urls or [])

    # ── Layer 2: post-processing (Fashn provider only, lane-gated) ─────
    final_image_url = raw_provider_url
    postprocess_payload: Dict[str, Any] = {}
    if settings.TRYON_POSTPROCESS_ENABLED and provider.name == "fashn":
        def _provider_rerun() -> Dict[str, Any]:
            try:
                rerun = _invoke_provider(force_new_seed=True)
            except ProviderError as exc:
                logger.warning(
                    "TryOn %s: provider rerun failed (%s)", tryon.id, exc
                )
                return {}
            return {
                "result_image_url": rerun.result_image_url,
                "candidates": list(rerun.candidate_image_urls or []),
            }

        try:
            pp = run_postprocess(
                result_image_url=raw_provider_url,
                candidates=raw_candidates,
                person_image_url=original_person_url,
                garment_image_url=effective_garment_url,
                lane=quality,
                provider_name=provider.name,
                on_stage=on_progress,
                provider_rerun=_provider_rerun,
                reference_face_embedding=(
                    cached_face_embedding if cache_applies else None
                ),
                reference_face_url=(
                    cached_face_url if cache_applies else None
                ),
            )
            final_image_url = pp.final_image_url or raw_provider_url
            postprocess_payload = {
                "metrics": pp.metrics,
                "notes": pp.notes,
                "timings": pp.timings,
                "retried_provider": pp.retried_provider,
                "raw_provider_url": raw_provider_url,
            }
        except Exception as exc:
            logger.warning(
                "TryOn %s: postprocessor crashed (%s); using raw provider output",
                tryon.id,
                exc,
            )
            postprocess_payload = {"status": "crashed", "error": str(exc)}

    tryon.extracted_garment_url = preprocessed_garment_url
    tryon.stage1_result_url = raw_provider_url
    tryon.result_image_url = final_image_url

    # Surface picker / legacy pipeline scoring on the existing columns so
    # the frontend doesn't need to change.
    quality_gate = (result.provider_meta or {}).get("quality_gate_score")
    if isinstance(quality_gate, (int, float)):
        tryon.quality_gate_score = float(quality_gate)
    quality_gate_passed = (result.provider_meta or {}).get("quality_gate_passed")
    if isinstance(quality_gate_passed, bool):
        tryon.quality_gate_passed = quality_gate_passed
    rating_score = (result.provider_meta or {}).get("rating_score")
    if isinstance(rating_score, (int, float)):
        tryon.rating_score = float(rating_score)

    metadata = dict(tryon.pipeline_metadata or {})
    metadata.update(
        {
            "mode": "2d",
            "provider": provider.name,
            "provider_meta": result.provider_meta,
            "quality": quality,
            "candidates": raw_candidates,
            "timings": result.timings,
            "cost_estimate_usd": result.cost_estimate_usd,
            "seed": result.seed,
            "preprocess_notes": preprocess_notes,
            "input_gate": input_gate_metrics,
            "bg_isolate": bg_isolate_meta,
            "postprocess": postprocess_payload,
        }
    )
    tryon.pipeline_metadata = metadata


# ── 3D path: unchanged from before the provider refactor ──────


def _run_three_d_path(
    *,
    db,
    tryon: TryOn,
    person_image_url: str,
    garment_image_url: str,
    garment_description: str,
    quality: str,
) -> None:
    tryon.status = TryOnStatus.AVATAR_3D_GENERATING
    db.commit()

    three_d_service = get_three_d_tryon_service()
    user = tryon.user
    avatar_metadata: Any = (
        user.avatar_metadata if user and isinstance(user.avatar_metadata, dict) else {}
    )
    can_reuse_avatar = bool(
        user
        and user.avatar_status == "ready"
        and (user.avatar_model_id or user.avatar_model_url)
    )
    result = three_d_service.run(
        person_image_url=person_image_url,
        garment_image_url=garment_image_url,
        garment_description=garment_description,
        quality=quality,
        existing_avatar_model_id=user.avatar_model_id if can_reuse_avatar else None,
        existing_avatar_model_url=user.avatar_model_url if can_reuse_avatar else None,
        existing_avatar_preview_url=user.avatar_preview_url if can_reuse_avatar else None,
        existing_avatar_turntable_url=user.avatar_turntable_url if can_reuse_avatar else None,
        body_profile=avatar_metadata.get("body_profile") if isinstance(avatar_metadata, dict) else None,
        force_rebuild_avatar=not can_reuse_avatar,
    )

    tryon.status = TryOnStatus.GARMENT_FITTING_3D
    db.commit()

    tryon.result_image_url = result.get("result_image_url")
    tryon.result_model_url = result.get("result_model_url")
    tryon.result_turntable_url = result.get("result_turntable_url")
    tryon.status = TryOnStatus.MODEL_RENDERING_3D
    db.commit()
    tryon.pipeline_metadata = {
        "mode": "3d",
        "provider": result.get("provider"),
        "pose_engine": result.get("pose_engine"),
        "avatar_reused": result.get("avatar_reused", False),
        "avatar": result.get("avatar"),
        "garment_fit": result.get("garment_fit"),
    }


def run_combo_tryon_pipeline(
    tryon_id: int,
    person_image_url: str,
    garments: List[Dict[str, Any]],
    quality: str,
    provider_override: Optional[str] = None,
    raise_on_error: bool = False,
    cached_default_person_url: Optional[str] = None,
    cached_smart_crop_url: Optional[str] = None,
    cached_face_url: Optional[str] = None,
    cached_face_embedding: Optional[Sequence[float]] = None,
) -> None:
    """Chain N single-garment provider calls into one composite outfit.

    The Fashn API accepts exactly one garment per call. To simulate a
    multi-garment try-on (e.g. a top + a pant) we run the provider once
    per garment and feed the result of run K in as the person image of
    run K+1. Each run still sees a photorealistic person with a single
    new garment, so quality stays close to the single-garment baseline.

    We apply Layer 1 (input gate + BG isolate + smart crop) once to the
    original person photo, and Layer 2 (face restoration + upscale +
    identity rescore) once to the final composite. Intermediate results
    skip post-processing -- they're throwaways that only exist so the
    next run has a realistic "person" to dress.

    `garments` is an ordered list of dicts:
        [{"image_url": ..., "category": ..., "description": ..., "garment_id": ...}, ...]
    The category hints the Fashn provider (tops / bottoms / one-pieces)
    so the model doesn't overwrite a previously-applied layer.
    """
    if not garments:
        raise ValueError("combo pipeline requires at least one garment")

    db = SessionLocal()
    try:
        tryon = db.query(TryOn).filter(TryOn.id == tryon_id).first()
        if not tryon:
            logger.error("TryOn %s not found for combo execution", tryon_id)
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

        provider = get_tryon_provider(provider_override)
        original_person_url = person_image_url

        # ── Layer 1 (once, against the original person photo). ──────
        cache_applies = bool(
            cached_default_person_url
            and person_image_url
            and cached_default_person_url.strip() == person_image_url.strip()
        )
        input_gate_metrics: Dict[str, Any] = {}
        preprocess_notes: Dict[str, str] = {}

        if cache_applies and cached_smart_crop_url:
            person_image_url = cached_smart_crop_url
            input_gate_metrics = {
                "passed": True,
                "smart_cropped": True,
                "reasons": [],
                "metrics": {"gate": "cached_default_photo"},
            }
        else:
            try:
                gate = get_tryon_input_gate().validate(person_image_url)
                input_gate_metrics = {
                    "passed": gate.passed,
                    "smart_cropped": gate.smart_cropped,
                    "reasons": gate.reasons,
                    "metrics": gate.metrics,
                }
                if gate.smart_cropped and gate.person_image_url:
                    person_image_url = gate.person_image_url
                if not gate.passed and settings.INPUT_GATE_HARD_FAIL:
                    raise InputGateError(
                        "Input image rejected by quality gate: "
                        + "; ".join(gate.reasons or ["unknown"])
                    )
            except InputGateError:
                raise
            except Exception as exc:
                logger.warning(
                    "ComboTryOn %s: input gate raised (%s); skipping", tryon.id, exc
                )

        # Run the preprocessor on the person only; garments get normalised
        # on the fly inside the loop so the category hint still applies.
        try:
            prep = get_tryon_preprocessor().preprocess(
                person_image_url=person_image_url,
                garment_image_url=garments[0]["image_url"],
            )
            person_image_url = prep.person_image_url
            preprocess_notes = prep.notes or {}
        except Exception as exc:
            logger.warning("ComboTryOn %s: preprocessor failed (%s)", tryon.id, exc)

        bg_isolate_meta: Dict[str, Any] = {}
        if settings.BG_ISOLATE_ENABLED:
            isolated_url, bg_isolate_meta = isolate_person(person_image_url)
            if isolated_url:
                person_image_url = isolated_url

        # Every provider call must go through a presigned URL when the
        # image lives in our private bucket (same fix as /generate).
        _storage = get_storage()
        def _for_provider(url: str) -> str:
            return _storage.to_provider_access_url(url, expiration=3600) or url

        def on_progress(stage_name: str) -> None:
            new_status = _STAGE_TO_STATUS.get(stage_name)
            if new_status:
                tryon.status = new_status
                db.commit()

        # ── Provider chain ──────────────────────────────────────────
        current_person_url = person_image_url
        chain_meta: List[Dict[str, Any]] = []
        all_timings: Dict[str, float] = {}
        total_cost: float = 0.0
        last_result_image: Optional[str] = None

        for idx, g in enumerate(garments):
            g_url = g.get("image_url") or ""
            g_category = (g.get("category") or None)
            g_description = (g.get("description") or None)
            if not g_url:
                raise ValueError(f"combo garment #{idx} missing image_url")

            try:
                result = provider.run(
                    person_image_url=_for_provider(current_person_url),
                    garment_image_url=_for_provider(g_url),
                    garment_category=g_category,
                    garment_description=g_description,
                    quality=quality,
                    tryon_id=tryon.id,
                    on_progress=on_progress if idx == 0 else None,
                )
            except ProviderError as exc:
                raise RuntimeError(
                    f"[{exc.provider}] combo step {idx + 1}/{len(garments)} failed: {exc}"
                    + (f" -- details={exc.details}" if exc.details else "")
                ) from exc

            if not result.result_image_url:
                raise RuntimeError(
                    f"combo step {idx + 1}/{len(garments)} returned no image"
                )

            last_result_image = result.result_image_url
            current_person_url = result.result_image_url

            chain_meta.append(
                {
                    "step": idx + 1,
                    "garment_id": g.get("garment_id"),
                    "garment_image_url": g_url,
                    "garment_category": g_category,
                    "result_image_url": result.result_image_url,
                    "candidate_image_urls": list(result.candidate_image_urls or []),
                    "provider_meta": result.provider_meta,
                    "seed": result.seed,
                    "timings": result.timings,
                    "cost_estimate_usd": result.cost_estimate_usd,
                }
            )
            for k, v in (result.timings or {}).items():
                all_timings[f"step{idx + 1}_{k}"] = v
            if result.cost_estimate_usd:
                total_cost += float(result.cost_estimate_usd)

            # After the first stitched result we have a realistic person
            # wearing the first garment -- surface it early so the UI
            # can show progress-y thumbnails during the second call.
            if idx == 0:
                tryon.stage1_result_url = result.result_image_url
                db.commit()

        assert last_result_image is not None  # for type checkers

        # ── Layer 2 on the final composite ──────────────────────────
        final_image_url = last_result_image
        postprocess_payload: Dict[str, Any] = {}
        if settings.TRYON_POSTPROCESS_ENABLED and provider.name == "fashn":
            # Combo rescoring with CLIP-garment is ambiguous (we'd need
            # to score against both garments). Fall back to the last
            # garment -- that's usually the most visually dominant layer
            # (e.g. pants in a top+bottom combo). The face/upscale
            # stages work fine either way.
            last_garment_url = garments[-1].get("image_url") or ""
            try:
                pp = run_postprocess(
                    result_image_url=last_result_image,
                    candidates=[last_result_image],
                    person_image_url=original_person_url,
                    garment_image_url=last_garment_url,
                    lane=quality,
                    provider_name=provider.name,
                    on_stage=on_progress,
                    provider_rerun=None,
                    reference_face_embedding=(
                        list(cached_face_embedding) if cache_applies and cached_face_embedding else None
                    ),
                    reference_face_url=(
                        cached_face_url if cache_applies else None
                    ),
                )
                final_image_url = pp.final_image_url or last_result_image
                postprocess_payload = {
                    "metrics": pp.metrics,
                    "notes": pp.notes,
                    "timings": pp.timings,
                    "retried_provider": pp.retried_provider,
                    "raw_provider_url": last_result_image,
                }
            except Exception as exc:
                logger.warning(
                    "ComboTryOn %s: postprocessor crashed (%s); using raw chain output",
                    tryon.id,
                    exc,
                )
                postprocess_payload = {"status": "crashed", "error": str(exc)}

        tryon.result_image_url = final_image_url
        tryon.stage1_result_url = tryon.stage1_result_url or last_result_image

        metadata = dict(tryon.pipeline_metadata or {})
        metadata.update(
            {
                "mode": "2d",
                "combo": True,
                "combo_garment_ids": [g.get("garment_id") for g in garments],
                "combo_chain": chain_meta,
                "provider": provider.name,
                "quality": quality,
                "timings": all_timings,
                "cost_estimate_usd": round(total_cost, 4) if total_cost else None,
                "preprocess_notes": preprocess_notes,
                "input_gate": input_gate_metrics,
                "bg_isolate": bg_isolate_meta,
                "postprocess": postprocess_payload,
            }
        )
        tryon.pipeline_metadata = metadata

        tryon.status = TryOnStatus.COMPLETED
        tryon.lifecycle_status = "ready"
        tryon.error_message = None
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
                int(
                    (tryon.execution_finished_at - tryon.queue_enqueued_at).total_seconds()
                    * 1000
                ),
            )
        db.commit()
        logger.info("Combo try-on completed for TryOn %s (%s steps)", tryon_id, len(garments))
    except Exception as exc:
        logger.error("Combo try-on failed for TryOn %s: %s", tryon_id, exc)
        try:
            tryon = db.query(TryOn).filter(TryOn.id == tryon_id).first()
            if tryon:
                if not tryon.result_image_url and tryon.stage1_result_url:
                    tryon.result_image_url = tryon.stage1_result_url
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
                db.commit()
        except Exception:
            logger.exception("Failed to persist failure for Combo TryOn %s", tryon_id)

        if raise_on_error:
            raise
    finally:
        db.close()


__all__ = [
    "run_tryon_pipeline",
    "run_combo_tryon_pipeline",
    "mark_tryon_dead_letter",
]
