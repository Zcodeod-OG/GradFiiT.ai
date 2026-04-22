"""GradFiT - Try-On Output Post-processor (Layer 2)

Sits between ``provider.run(...)`` and the final ``TryOn`` row update.
Runs (in order, all best-effort):

1. **Candidate rescoring**: when the provider returned multiple
   candidates, re-pick the winner by combining the existing CLIP
   garment-fidelity score with the new face-identity score.
2. **Identity drift retry**: if the chosen candidate still falls below
   ``IDENTITY_DRIFT_THRESHOLD`` and a retry callable is supplied,
   invoke it once (subject to ``IDENTITY_RETRY_MAX``).
3. **Face restoration** via GFPGAN (Apache 2.0).
4. **Super-resolution** via Real-ESRGAN (BSD-3).
5. **Background composite** via rembg (MIT) -- only when the matching
   ``BG_*`` flags are enabled, otherwise skipped.

Each step is wrapped so a step-level exception is logged and recorded
in ``notes`` but never surfaces to the runner. The pipeline keeps
moving and the user gets *some* image. Failures degrade quality, never
break the call.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Sequence

from app.config import settings
from app.services.face_processor import get_face_processor
from app.services.postprocess.bg_compose import compose_back
from app.services.postprocess.face_restore import restore_face
from app.services.postprocess.upscale import upscale_image

logger = logging.getLogger(__name__)


# Optional retry callable signature. The runner wraps ``provider.run``
# in a closure that supplies a fresh seed and forwards every other
# argument unchanged.
ProviderRerunCallable = Callable[[], Dict[str, Any]]


@dataclass
class PostprocessResult:
    """What ``postprocess`` returns to the runner."""

    final_image_url: str
    metrics: Dict[str, Any] = field(default_factory=dict)
    notes: List[Dict[str, Any]] = field(default_factory=list)
    retried_provider: bool = False
    timings: Dict[str, float] = field(default_factory=dict)


def _lane_enabled(lane: str) -> bool:
    raw = (settings.POSTPROCESS_LANES or "").strip().lower()
    if not raw:
        return False
    enabled = {token.strip() for token in raw.split(",") if token.strip()}
    return lane.strip().lower() in enabled


def _score_candidates_with_identity(
    *,
    candidates: Sequence[str],
    garment_image_url: str,
    person_image_url: str,
    current_winner: str,
) -> Dict[str, Any]:
    """Re-score candidates blending garment fidelity (60%) and identity
    similarity (40%). Returns the winning URL plus per-candidate scores.
    """
    if not candidates:
        return {"winner": current_winner, "scores": [], "strategy": "no_candidates"}
    if len(candidates) == 1:
        return {
            "winner": candidates[0],
            "scores": [],
            "strategy": "single_candidate",
        }

    try:
        from app.services.tryon_providers.best_picker import pick_best_by_clip

        winner, meta = pick_best_by_clip(
            candidates=list(candidates),
            garment_image_url=garment_image_url,
            person_image_url=person_image_url,
        )
        meta["strategy"] = meta.get("strategy", "clip_with_identity")
        return {"winner": winner, "scores": meta.get("scores", []), "meta": meta}
    except Exception as exc:
        logger.warning("postprocess: candidate rescore failed (%s)", exc)
        return {
            "winner": current_winner,
            "scores": [],
            "strategy": "rescore_failed",
            "error": str(exc),
        }


def _identity_score(
    *,
    person_image_url: str,
    candidate_image_url: str,
    reference_embedding: Optional[Sequence[float]] = None,
    reference_face_url: Optional[str] = None,
) -> Dict[str, Any]:
    if not settings.IDENTITY_CHECK_ENABLED:
        return {"similarity": None, "status": "disabled"}
    if not candidate_image_url:
        return {"similarity": None, "status": "skipped_missing_url"}
    if reference_embedding is None and not person_image_url:
        return {"similarity": None, "status": "skipped_missing_url"}
    try:
        return get_face_processor().compare(
            reference_image_url=person_image_url,
            candidate_image_url=candidate_image_url,
            reference_embedding=reference_embedding,
            reference_face_url=reference_face_url,
        )
    except Exception as exc:
        logger.warning("postprocess: identity compare failed (%s)", exc)
        return {"similarity": None, "status": "failed", "error": str(exc)}


def postprocess(
    *,
    result_image_url: str,
    candidates: Sequence[str],
    person_image_url: str,
    garment_image_url: str,
    lane: str,
    provider_name: str,
    on_stage: Optional[Callable[[str], None]] = None,
    provider_rerun: Optional[ProviderRerunCallable] = None,
    reference_face_embedding: Optional[Sequence[float]] = None,
    reference_face_url: Optional[str] = None,
) -> PostprocessResult:
    """Run the Layer 2 stack.

    Parameters
    ----------
    result_image_url
        The provider's chosen best output. Always returned as the
        baseline if every step fails or the lane is excluded.
    candidates
        All candidate URLs from the provider (used to rescue identity
        drift without burning a full retry).
    person_image_url
        The original (preprocessed/smart-cropped) person image,
        treated as the reference identity.
    garment_image_url
        The garment URL the provider used (for CLIP rescoring).
    lane
        ``fast``/``balanced``/``best``. Only lanes listed in
        ``POSTPROCESS_LANES`` get processed.
    provider_name
        Provider slug (``fashn``/``replicate_legacy``/...). Currently
        only ``fashn`` is post-processed.
    on_stage
        Optional progress callback (stage name strings such as
        ``postprocess_identity``, ``postprocess_face``,
        ``postprocess_upscale``).
    provider_rerun
        Optional callable returning ``{"result_image_url": ..., "candidates": [...]}``
        for a fresh provider call. Invoked at most ``IDENTITY_RETRY_MAX``
        times when identity drift can't be resolved by candidate
        rescoring.
    """
    overall_start = time.time()

    notes: List[Dict[str, Any]] = []
    metrics: Dict[str, Any] = {
        "lane": lane,
        "provider": provider_name,
        "input_candidates": list(candidates),
    }
    timings: Dict[str, float] = {}

    if not settings.TRYON_POSTPROCESS_ENABLED:
        return PostprocessResult(
            final_image_url=result_image_url,
            metrics={**metrics, "status": "master_disabled"},
            timings={"total_seconds": round(time.time() - overall_start, 2)},
        )

    if provider_name != "fashn":
        return PostprocessResult(
            final_image_url=result_image_url,
            metrics={**metrics, "status": "skipped_provider"},
            timings={"total_seconds": round(time.time() - overall_start, 2)},
        )

    if not _lane_enabled(lane):
        return PostprocessResult(
            final_image_url=result_image_url,
            metrics={**metrics, "status": "skipped_lane"},
            timings={"total_seconds": round(time.time() - overall_start, 2)},
        )

    current_url = result_image_url
    current_candidates: List[str] = list(candidates) if candidates else [result_image_url]
    retried_provider = False

    # ── 1. Candidate rescoring with identity blend ────────────
    if len(current_candidates) > 1:
        if on_stage:
            on_stage("postprocess_identity")
        rescore_started = time.time()
        rescore = _score_candidates_with_identity(
            candidates=current_candidates,
            garment_image_url=garment_image_url,
            person_image_url=person_image_url,
            current_winner=current_url,
        )
        timings["rescore_seconds"] = round(time.time() - rescore_started, 2)
        notes.append({"step": "candidate_rescore", **rescore})
        if rescore.get("winner"):
            current_url = rescore["winner"]
            metrics["rescored_winner"] = current_url

    # ── 2. Identity drift check (+ optional retry) ────────────
    identity_started = time.time()
    identity = _identity_score(
        person_image_url=person_image_url,
        candidate_image_url=current_url,
        reference_embedding=reference_face_embedding,
        reference_face_url=reference_face_url,
    )
    timings["identity_check_seconds"] = round(time.time() - identity_started, 2)
    metrics["identity"] = identity
    notes.append({"step": "identity_check", **identity})

    similarity = identity.get("similarity")
    drifted = (
        similarity is not None
        and similarity < float(settings.IDENTITY_DRIFT_THRESHOLD)
    )

    if drifted and provider_rerun and settings.IDENTITY_RETRY_MAX > 0:
        # Try every other candidate first -- one of them may already
        # have a better face match and avoid the retry cost entirely.
        best_alt: Optional[str] = None
        best_alt_score = float(similarity)
        for cand in current_candidates:
            if cand == current_url:
                continue
            alt = _identity_score(
                person_image_url=person_image_url,
                candidate_image_url=cand,
                reference_embedding=reference_face_embedding,
                reference_face_url=reference_face_url,
            )
            alt_sim = alt.get("similarity")
            if isinstance(alt_sim, (int, float)) and alt_sim > best_alt_score:
                best_alt_score = float(alt_sim)
                best_alt = cand
            notes.append(
                {"step": "identity_alt_candidate", "candidate": cand, **alt}
            )

        if best_alt and best_alt_score >= float(settings.IDENTITY_DRIFT_THRESHOLD):
            current_url = best_alt
            metrics["identity_recovered_via"] = "alt_candidate"
            metrics["identity"]["similarity"] = best_alt_score
            drifted = False
        else:
            retries_used = 0
            while drifted and retries_used < settings.IDENTITY_RETRY_MAX:
                retries_used += 1
                logger.info(
                    "postprocess: identity drift %.2f < %.2f; retrying provider (%s/%s)",
                    similarity if similarity is not None else -1,
                    settings.IDENTITY_DRIFT_THRESHOLD,
                    retries_used,
                    settings.IDENTITY_RETRY_MAX,
                )
                retry_started = time.time()
                try:
                    rerun = provider_rerun() or {}
                except Exception as exc:
                    logger.warning("postprocess: provider rerun failed (%s)", exc)
                    notes.append(
                        {"step": "provider_rerun", "status": "failed", "error": str(exc)}
                    )
                    break

                timings.setdefault("provider_retry_seconds", 0.0)
                timings["provider_retry_seconds"] = round(
                    timings["provider_retry_seconds"] + (time.time() - retry_started), 2
                )

                new_url = rerun.get("result_image_url")
                new_candidates = rerun.get("candidates") or []
                if not new_url:
                    notes.append(
                        {"step": "provider_rerun", "status": "no_result"}
                    )
                    break

                retried_provider = True
                current_candidates = list(new_candidates) or [new_url]
                current_url = new_url

                # Score again -- maybe one of the new candidates is good.
                if len(current_candidates) > 1:
                    rescore = _score_candidates_with_identity(
                        candidates=current_candidates,
                        garment_image_url=garment_image_url,
                        person_image_url=person_image_url,
                        current_winner=current_url,
                    )
                    notes.append({"step": "candidate_rescore_retry", **rescore})
                    if rescore.get("winner"):
                        current_url = rescore["winner"]

                identity = _identity_score(
                    person_image_url=person_image_url,
                    candidate_image_url=current_url,
                    reference_embedding=reference_face_embedding,
                    reference_face_url=reference_face_url,
                )
                notes.append({"step": "identity_check_retry", **identity})
                similarity = identity.get("similarity")
                drifted = (
                    similarity is not None
                    and similarity < float(settings.IDENTITY_DRIFT_THRESHOLD)
                )
                metrics["identity_retry_count"] = retries_used
                metrics["identity"] = identity

    # ── 3. GFPGAN face restoration ────────────────────────────
    if settings.FACE_RESTORE_ENABLED:
        if on_stage:
            on_stage("postprocess_face")
        face_started = time.time()
        restored_url, restore_meta = restore_face(current_url)
        timings["face_restore_seconds"] = round(time.time() - face_started, 2)
        notes.append(restore_meta)
        if restored_url:
            current_url = restored_url
            metrics["face_restore_url"] = restored_url

    # ── 4. Real-ESRGAN super-resolution ───────────────────────
    if settings.UPSCALE_ENABLED:
        if on_stage:
            on_stage("postprocess_upscale")
        upscale_started = time.time()
        upscaled_url, upscale_meta = upscale_image(current_url)
        timings["upscale_seconds"] = round(time.time() - upscale_started, 2)
        notes.append(upscale_meta)
        if upscaled_url:
            current_url = upscaled_url
            metrics["upscale_url"] = upscaled_url

    # ── 5. Optional BG composite back to original photo ───────
    if settings.BG_COMPOSE_ENABLED and settings.BG_ISOLATE_ENABLED:
        compose_started = time.time()
        composed_url, compose_meta = compose_back(
            vton_image_url=current_url,
            original_person_image_url=person_image_url,
        )
        timings["bg_compose_seconds"] = round(time.time() - compose_started, 2)
        notes.append(compose_meta)
        if composed_url:
            current_url = composed_url
            metrics["bg_compose_url"] = composed_url

    metrics["status"] = "ok"
    timings["total_seconds"] = round(time.time() - overall_start, 2)

    return PostprocessResult(
        final_image_url=current_url,
        metrics=metrics,
        notes=notes,
        retried_provider=retried_provider,
        timings=timings,
    )


__all__ = ["postprocess", "PostprocessResult", "ProviderRerunCallable"]
