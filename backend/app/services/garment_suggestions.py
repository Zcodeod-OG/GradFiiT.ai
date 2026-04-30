"""Rules-based garment pairing for the closet's "complete the look" UX.

Given an anchor garment (the one the user has already added to a look or
opened in their closet), return a ranked list of other garments from the
same user's closet that visually pair with it. v3 of the closet feature
ships rules-only — no embeddings, no model calls — so this stays cheap
and predictable. The result rows carry a `score` and a short
human-readable `reason` so the UI can show *why* a suggestion was made.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models.garment import Garment


# Pair an anchor garment_type to the candidate types we should surface.
# Order matters: types listed earlier are preferred (higher score).
# - upper/lower pair as the obvious top↔bottom outfit completion
# - dress/full_body cover the whole torso, so the only useful pairing is
#   a layer (jacket/cardigan) — modeled here as upper_body candidates
_PAIR_RULES: dict[str, Tuple[str, ...]] = {
    "upper_body": ("lower_body",),
    "lower_body": ("upper_body",),
    "dress": ("upper_body",),
    "full_body": ("upper_body",),
}

# Score weights. Tuned by feel; the goal is just to keep ordering stable
# and explainable, not to be a real recommender.
_BASE_SCORE = 0.5
_TYPE_PRIMARY_BONUS = 0.0  # primary type already at base score
_CATEGORY_MATCH_BONUS = 0.3
_NAME_OVERLAP_BONUS = 0.1


@dataclass
class GarmentSuggestion:
    garment: Garment
    score: float
    reason: str


def _normalize(value: Optional[str]) -> str:
    return (value or "").strip().lower()


def _name_overlap(anchor: Garment, candidate: Garment) -> bool:
    """Cheap word-overlap heuristic across name + description.

    Used as a tiebreaker so two garments that share a stylistic word
    ("linen", "denim", "wool") rank above unrelated items of the same
    type. Stopwords are filtered to avoid trivial matches on common
    words like "shirt" or "the"."""
    stop = {
        "the", "a", "an", "and", "or", "of", "with", "for", "to",
        "shirt", "pants", "trousers", "dress", "top", "bottom",
        "jacket", "coat", "skirt", "jeans",
    }

    def tokens(g: Garment) -> set[str]:
        words = f"{_normalize(g.name)} {_normalize(g.description)}".split()
        return {w for w in words if len(w) > 2 and w not in stop}

    return bool(tokens(anchor) & tokens(candidate))


def _reason_for(
    anchor_type: str, candidate: Garment, *, category_match: bool, name_match: bool
) -> str:
    if category_match:
        cat = (candidate.category or "").strip()
        if cat:
            return f"Matches your {cat} style"
    if name_match:
        return "Similar vibe"
    pretty = anchor_type.replace("_", " ")
    return f"Pairs with {pretty}"


def suggest_pairings(
    db: Session,
    *,
    user_id: int,
    anchor: Garment,
    limit: int = 6,
) -> List[GarmentSuggestion]:
    """Return up to ``limit`` ranked suggestions to complete the anchor.

    Returns an empty list (not an error) when the anchor has no known
    garment_type or no candidate items exist — the UI treats that as
    "no suggestions yet" rather than a failure mode."""
    anchor_type = _normalize(anchor.garment_type)
    if not anchor_type or anchor_type not in _PAIR_RULES:
        return []

    target_types = _PAIR_RULES[anchor_type]

    # Pull all ready, saved candidates of any target type in one query;
    # the closet is small enough (tens, not thousands) that scoring in
    # Python is simpler than encoding the rules in SQL.
    candidates = (
        db.query(Garment)
        .filter(
            Garment.user_id == user_id,
            Garment.id != anchor.id,
            Garment.saved_to_closet.is_(True),
            Garment.preprocess_status == "ready",
            Garment.garment_type.in_(target_types),
        )
        .all()
    )

    anchor_category = _normalize(anchor.category)
    scored: List[GarmentSuggestion] = []
    for candidate in candidates:
        cand_type = _normalize(candidate.garment_type)
        # Type-based score: primary target type gets the base, fallbacks
        # get a small penalty so they sort below primaries.
        try:
            type_rank = target_types.index(cand_type)
        except ValueError:
            continue
        type_score = _BASE_SCORE - (0.05 * type_rank) + _TYPE_PRIMARY_BONUS

        cand_category = _normalize(candidate.category)
        category_match = bool(
            anchor_category and cand_category and anchor_category == cand_category
        )
        name_match = _name_overlap(anchor, candidate)

        score = type_score
        if category_match:
            score += _CATEGORY_MATCH_BONUS
        if name_match:
            score += _NAME_OVERLAP_BONUS

        reason = _reason_for(
            anchor_type,
            candidate,
            category_match=category_match,
            name_match=name_match,
        )
        scored.append(
            GarmentSuggestion(garment=candidate, score=round(score, 3), reason=reason)
        )

    # Sort by score desc, then newest first as a stable tiebreak.
    _epoch = datetime.min.replace(tzinfo=timezone.utc)
    scored.sort(
        key=lambda s: (s.score, s.garment.created_at or _epoch),
        reverse=True,
    )
    return scored[: max(0, limit)]
