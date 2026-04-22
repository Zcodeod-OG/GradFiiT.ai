"""GradFiT - Best-of-N Candidate Picker

When the provider returns multiple candidate images, score each one and
pick the winner. The base score is CLIP cosine similarity against the
source garment (garment fidelity). When ``person_image_url`` is also
supplied, we blend a face-identity score from CLIP face crops:

    score = 0.6 * garment_clip + 0.4 * identity_clip

This is what the Layer 2 postprocessor uses on the balanced/best lanes
to avoid showing an output that "wears the right clothes but looks like
a different person". The single-arg signature is preserved so existing
callers (the bare ``best`` lane in ``providers/fashn.py``) keep working
without modification.

The implementation reuses the existing CLIP wiring in
``GarmentProcessor.get_clip_embedding`` so we share the embedding cache
with the legacy quality gate.
"""

from __future__ import annotations

import logging
import math
from typing import Any, Dict, List, Optional, Sequence, Tuple

logger = logging.getLogger(__name__)


# Weights used when blending garment fidelity with face identity. Tuned
# empirically: garment weight kept higher because the user explicitly
# uploaded the garment; identity is the "don't ruin my face" floor.
_GARMENT_WEIGHT = 0.6
_IDENTITY_WEIGHT = 0.4


def _cosine(a: Sequence[float], b: Sequence[float]) -> float:
    if not a or not b:
        return 0.0
    if len(a) != len(b):
        # Defensive: Replicate sometimes pads or truncates depending on
        # the model variant; just bail out -> caller falls back.
        return 0.0
    dot = sum(float(x) * float(y) for x, y in zip(a, b))
    norm_a = math.sqrt(sum(float(x) * float(x) for x in a))
    norm_b = math.sqrt(sum(float(y) * float(y) for y in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def pick_best_by_clip(
    *,
    candidates: Sequence[str],
    garment_image_url: str,
    person_image_url: Optional[str] = None,
) -> Tuple[str, Dict[str, Any]]:
    """Return ``(best_url, meta)`` with the highest-scoring candidate.

    Parameters
    ----------
    candidates
        Provider output URLs to compare.
    garment_image_url
        Reference garment URL (used for the CLIP fidelity score).
    person_image_url
        Optional original person URL. When supplied, the picker also
        compares face crops from ``person_image_url`` and each candidate
        and blends the score 60/40 (garment/identity).

    Performs at most ``len(candidates)*2 + 2`` CLIP embedding calls.
    Embeddings are cached by URL in Redis so repeat scoring within the
    embedding TTL is free.

    On any error we fall back to the first candidate -- callers should
    treat this as best-effort.
    """
    if not candidates:
        raise ValueError("pick_best_by_clip requires at least one candidate")
    if len(candidates) == 1:
        return candidates[0], {"strategy": "single_candidate"}

    # Imported lazily so the legacy lane / fashn dependency graph stays
    # lean (we don't want every fast/balanced run to pull Replicate in).
    from app.services.garment_processor import get_garment_processor

    processor = get_garment_processor()

    try:
        garment_embedding = processor.get_clip_embedding(garment_image_url)
    except Exception as exc:
        logger.warning("Best-picker: failed to embed garment (%s)", exc)
        return candidates[0], {
            "strategy": "fallback_first",
            "reason": "garment_embedding_failed",
            "error": str(exc),
        }

    if not garment_embedding:
        return candidates[0], {
            "strategy": "fallback_first",
            "reason": "empty_garment_embedding",
        }

    # Optional identity reference: embed the reference face crop once.
    person_face_embedding: Optional[List[float]] = None
    if person_image_url:
        try:
            from app.services.face_processor import get_face_processor

            person_face_embedding = get_face_processor().embed_face(person_image_url)
        except Exception as exc:
            logger.warning("Best-picker: reference face embed failed (%s)", exc)
            person_face_embedding = None

    use_identity = person_face_embedding is not None

    scores: List[Dict[str, Any]] = []
    best_idx = 0
    best_score = -1.0

    for idx, url in enumerate(candidates):
        try:
            candidate_embedding = processor.get_clip_embedding(url)
        except Exception as exc:
            logger.warning("Best-picker: candidate %s embed failed: %s", idx, exc)
            scores.append({"index": idx, "url": url, "score": None, "error": str(exc)})
            continue

        garment_score = _cosine(garment_embedding, candidate_embedding)

        identity_score: Optional[float] = None
        blended = garment_score
        if use_identity:
            try:
                from app.services.face_processor import get_face_processor

                cand_face_emb = get_face_processor().embed_face(url)
            except Exception as exc:
                logger.warning(
                    "Best-picker: candidate %s face embed failed: %s", idx, exc
                )
                cand_face_emb = None

            if cand_face_emb:
                identity_score = _cosine(person_face_embedding, cand_face_emb)
                blended = (
                    _GARMENT_WEIGHT * garment_score
                    + _IDENTITY_WEIGHT * identity_score
                )

        scores.append(
            {
                "index": idx,
                "url": url,
                "garment_score": round(garment_score, 4),
                "identity_score": (
                    round(identity_score, 4) if identity_score is not None else None
                ),
                "score": round(blended, 4),
            }
        )

        if blended > best_score:
            best_score = blended
            best_idx = idx

    return candidates[best_idx], {
        "strategy": "clip_blended" if use_identity else "clip_cosine",
        "winner_index": best_idx,
        "winner_score": round(best_score, 4),
        "weights": (
            {"garment": _GARMENT_WEIGHT, "identity": _IDENTITY_WEIGHT}
            if use_identity
            else {"garment": 1.0}
        ),
        "scores": scores,
    }


__all__ = ["pick_best_by_clip"]
