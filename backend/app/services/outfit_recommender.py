"""Outfit recommender — composes full outfits from the user's closet.

Builds on top of ``garment_suggestions.suggest_pairings`` (single-pair
heuristic) and the new per-garment ``color_palette`` to assemble ranked
multi-piece outfits.

Design choices:

* Rule-based and deterministic. No embeddings, no LLM. Keeps recurring
  recommendations stable so the user sees the same top picks across
  sessions until their closet changes.
* Each outfit has a base ``(top, bottom)`` pair, optionally extended
  with outerwear and/or an accessory. ``full_body`` items stand alone
  as a single-piece outfit (with optional outerwear + accessory layers).
* Scoring blends type/category rules + RGB color harmony + Brand-DNA
  palette alignment. Missing palettes contribute zero rather than
  penalising — graceful for older garments that predate the palette
  extraction.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from typing import Iterable, List, Optional, Sequence

from sqlalchemy.orm import Session

from app.models.brand_dna import BrandDNA
from app.models.garment import Garment
from app.services.garment_suggestions import (
    _CATEGORY_MATCH_BONUS,
    _NAME_OVERLAP_BONUS,
    _name_overlap,
    _normalize,
)

logger = logging.getLogger(__name__)


# Cap fan-out per slot to keep combinatorics tractable. With 6 tops,
# 6 bottoms, 4 outerwear, 4 accessories that's worst-case 576
# candidates — fast enough to score in Python on every request.
_PER_SLOT_LIMIT = 6
_OUTERWEAR_LIMIT = 4
_ACCESSORY_LIMIT = 4

# Score weights. Tuned by feel so palette can outweigh the rule bonus
# when both pieces have palettes, while still letting rule-only outfits
# (older garments) get a sensible base score.
_BASE_SCORE = 0.5
_PALETTE_HARMONY_WEIGHT = 0.4
_BRAND_DNA_WEIGHT = 0.2
_LAYER_BONUS = 0.05  # for each optional layer (outerwear / accessory)
_DIVERSITY_PENALTY = 0.05  # per repeat of the same anchor in the top-N


@dataclass
class OutfitSuggestion:
    """A composed outfit and the reason it scored where it did."""

    garments: List[Garment]
    score: float
    reason: str
    palette: List[str] = field(default_factory=list)


# --------------------------------------------------------------------- #
# Color math                                                            #
# --------------------------------------------------------------------- #


def _hex_to_rgb(value: str) -> Optional[tuple[int, int, int]]:
    v = (value or "").strip().lstrip("#")
    if len(v) != 6:
        return None
    try:
        return int(v[0:2], 16), int(v[2:4], 16), int(v[4:6], 16)
    except ValueError:
        return None


def _palette_dominant_rgb(
    palette: Optional[Sequence[dict]],
) -> Optional[tuple[int, int, int]]:
    """Return the highest-weight color in a palette as an RGB tuple."""
    if not palette:
        return None
    best: Optional[dict] = None
    for entry in palette:
        if not isinstance(entry, dict):
            continue
        if best is None or float(entry.get("weight", 0.0)) > float(
            best.get("weight", 0.0)
        ):
            best = entry
    if not best:
        return None
    return _hex_to_rgb(str(best.get("hex", "")))


def _rgb_distance(a: tuple[int, int, int], b: tuple[int, int, int]) -> float:
    """Euclidean distance in RGB space, normalised to [0, 1].

    Not perceptually uniform — CIE-LAB ΔE would be more accurate — but
    cheap, dependency-free, and good enough for the first pass.
    """
    dr, dg, db = a[0] - b[0], a[1] - b[1], a[2] - b[2]
    raw = math.sqrt(dr * dr + dg * dg + db * db)
    # Max possible distance is sqrt(3) * 255 ≈ 441.67.
    return min(1.0, raw / 441.67)


def _palette_harmony(palette_pair: Iterable[Optional[Sequence[dict]]]) -> float:
    """Score how visually compatible a list of palettes is.

    Returns 0..1 where higher is better. Strategy:

    * Pick the dominant color of each garment's palette.
    * Average pairwise RGB distance; map to harmony with a sweet spot
      around 0.35 distance (neither identical nor jarring).
    """
    dominants = [
        _palette_dominant_rgb(p) for p in palette_pair if p
    ]
    dominants = [d for d in dominants if d is not None]
    if len(dominants) < 2:
        return 0.0

    distances: List[float] = []
    for i in range(len(dominants)):
        for j in range(i + 1, len(dominants)):
            distances.append(_rgb_distance(dominants[i], dominants[j]))
    if not distances:
        return 0.0

    avg = sum(distances) / len(distances)
    # Bell curve around 0.35: identical (0) or maximally distant (1)
    # both lose points; a mid-contrast pair maxes out.
    score = max(0.0, 1.0 - (abs(avg - 0.35) / 0.35))
    return min(1.0, score)


def _brand_dna_alignment(
    outfit_palettes: Sequence[Optional[Sequence[dict]]],
    brand_palette: Sequence[str],
) -> float:
    """Score how close an outfit's palette is to the user's Brand-DNA palette.

    Returns 0..1. 0 if either side has no usable colors.
    """
    brand_rgbs = [c for c in (_hex_to_rgb(h) for h in brand_palette) if c]
    if not brand_rgbs:
        return 0.0
    outfit_rgbs = [
        c for c in (_palette_dominant_rgb(p) for p in outfit_palettes) if c
    ]
    if not outfit_rgbs:
        return 0.0

    # Best-match per outfit color (closest brand color). Average the
    # similarities — encourages outfits that pick up multiple brand hues.
    sims: List[float] = []
    for c in outfit_rgbs:
        best = min(_rgb_distance(c, b) for b in brand_rgbs)
        sims.append(1.0 - best)
    return sum(sims) / len(sims)


# --------------------------------------------------------------------- #
# Composition                                                           #
# --------------------------------------------------------------------- #


def _by_type(
    garments: Sequence[Garment],
) -> dict[str, List[Garment]]:
    """Group garments by their `garment_type`, newest first."""
    buckets: dict[str, List[Garment]] = {}
    for g in garments:
        t = _normalize(g.garment_type)
        if not t:
            continue
        buckets.setdefault(t, []).append(g)
    # Newest first so the candidate fan-out per slot prioritises items
    # the user just added.
    epoch = None
    for items in buckets.values():
        items.sort(key=lambda g: g.created_at or epoch, reverse=True)
    return buckets


def _outfit_palette(garments: Sequence[Garment]) -> List[str]:
    """Up to 5 hex colours summarising the composite palette."""
    seen: List[str] = []
    for g in garments:
        for entry in (g.color_palette or []):
            if not isinstance(entry, dict):
                continue
            hex_value = str(entry.get("hex", "")).upper()
            if hex_value and hex_value not in seen:
                seen.append(hex_value)
            if len(seen) >= 5:
                return seen
    return seen


def _category_rule_bonus(garments: Sequence[Garment]) -> tuple[float, bool, bool]:
    """Reuse word-overlap + category-match heuristics from garment_suggestions.

    Returns ``(bonus, any_category_match, any_name_overlap)``.
    """
    if len(garments) < 2:
        return 0.0, False, False
    anchor = garments[0]
    bonus = 0.0
    any_cat = False
    any_name = False
    for other in garments[1:]:
        if (
            _normalize(anchor.category)
            and _normalize(other.category)
            and _normalize(anchor.category) == _normalize(other.category)
        ):
            bonus += _CATEGORY_MATCH_BONUS
            any_cat = True
        if _name_overlap(anchor, other):
            bonus += _NAME_OVERLAP_BONUS
            any_name = True
    return bonus, any_cat, any_name


def _reason_for(
    base_types: Sequence[str],
    palette_score: float,
    brand_score: float,
    has_outerwear: bool,
    has_accessory: bool,
    category_match: bool,
) -> str:
    """Short human label explaining the recommendation."""
    parts: List[str] = []
    if palette_score >= 0.6:
        parts.append("Balanced palette")
    elif palette_score >= 0.3:
        parts.append("Warm color pairing")
    if brand_score >= 0.5:
        parts.append("Matches your Brand DNA")
    if category_match:
        parts.append("Same category")
    if has_outerwear:
        parts.append("+ layer")
    if has_accessory:
        parts.append("+ accessory")
    if not parts:
        pretty = " + ".join(t.replace("_", " ") for t in base_types)
        return f"Pairs {pretty}".strip()
    return " · ".join(parts)


def _compose_base_pairs(
    buckets: dict[str, List[Garment]],
) -> List[List[Garment]]:
    """Generate the seed (no-layer) outfits.

    * upper_body × lower_body
    * full_body (solo)
    """
    pairs: List[List[Garment]] = []
    tops = buckets.get("upper_body", [])[:_PER_SLOT_LIMIT]
    bottoms = buckets.get("lower_body", [])[:_PER_SLOT_LIMIT]
    for top in tops:
        for bottom in bottoms:
            pairs.append([top, bottom])
    full = buckets.get("full_body", [])[:_PER_SLOT_LIMIT]
    for piece in full:
        pairs.append([piece])
    return pairs


def _maybe_extend_with_layers(
    base: List[Garment],
    buckets: dict[str, List[Garment]],
) -> List[List[Garment]]:
    """Return base outfit plus optional layered variants.

    Each base produces up to three candidates: bare, +outerwear,
    +accessory. We don't compound outerwear+accessory in the same
    outfit — keeps the top-N list visually varied.
    """
    out: List[List[Garment]] = [list(base)]
    outerwear = buckets.get("outerwear", [])[:_OUTERWEAR_LIMIT]
    if outerwear:
        out.append([*base, outerwear[0]])
    accessories = buckets.get("accessory", [])[:_ACCESSORY_LIMIT]
    if accessories:
        out.append([*base, accessories[0]])
    return out


def recommend_outfits(
    db: Session,
    *,
    user_id: int,
    limit: int = 10,
    anchor_garment_id: Optional[int] = None,
) -> List[OutfitSuggestion]:
    """Return up to ``limit`` ranked outfits composed from the user's closet.

    When ``anchor_garment_id`` is supplied, every returned outfit will
    include that garment as one of its pieces. Useful for "what goes
    with this?" UX from the detail modal.
    """
    closet = (
        db.query(Garment)
        .filter(
            Garment.user_id == user_id,
            Garment.saved_to_closet.is_(True),
            Garment.preprocess_status == "ready",
        )
        .all()
    )
    if len(closet) < 2:
        return []

    buckets = _by_type(closet)
    base_pairs = _compose_base_pairs(buckets)
    if not base_pairs:
        return []

    # Optionally constrain to outfits that include the anchor garment.
    anchor: Optional[Garment] = None
    if anchor_garment_id is not None:
        anchor = next(
            (g for g in closet if g.id == anchor_garment_id),
            None,
        )
        if anchor is not None:
            base_pairs = [
                pair for pair in base_pairs if any(g.id == anchor.id for g in pair)
            ]
            if not base_pairs:
                return []

    candidates: List[List[Garment]] = []
    for base in base_pairs:
        candidates.extend(_maybe_extend_with_layers(base, buckets))

    # Brand DNA palette, if the user has one configured.
    brand = (
        db.query(BrandDNA)
        .filter(BrandDNA.user_id == user_id)
        .first()
    )
    brand_palette = []
    if brand and isinstance(brand.palette, list):
        brand_palette = [str(c) for c in brand.palette if isinstance(c, str)]

    scored: List[OutfitSuggestion] = []
    for combo in candidates:
        palette_score = _palette_harmony(g.color_palette for g in combo)
        brand_score = _brand_dna_alignment(
            [g.color_palette for g in combo], brand_palette
        )
        rule_bonus, any_cat, _ = _category_rule_bonus(combo)
        layer_bonus = 0.0
        types_present = {_normalize(g.garment_type) for g in combo}
        has_outerwear = "outerwear" in types_present
        has_accessory = "accessory" in types_present
        if has_outerwear:
            layer_bonus += _LAYER_BONUS
        if has_accessory:
            layer_bonus += _LAYER_BONUS

        score = (
            _BASE_SCORE
            + (_PALETTE_HARMONY_WEIGHT * palette_score)
            + (_BRAND_DNA_WEIGHT * brand_score)
            + rule_bonus
            + layer_bonus
        )

        base_types = [
            _normalize(g.garment_type)
            for g in combo
            if _normalize(g.garment_type) in {"upper_body", "lower_body", "full_body"}
        ]
        reason = _reason_for(
            base_types,
            palette_score,
            brand_score,
            has_outerwear,
            has_accessory,
            any_cat,
        )

        scored.append(
            OutfitSuggestion(
                garments=combo,
                score=round(score, 3),
                reason=reason,
                palette=_outfit_palette(combo),
            )
        )

    # Diversity: penalise outfits that share the same anchor (first
    # piece) as a higher-scoring one already in the list.
    scored.sort(key=lambda s: s.score, reverse=True)
    seen_anchor_counts: dict[int, int] = {}
    final: List[OutfitSuggestion] = []
    for s in scored:
        anchor_id = s.garments[0].id
        count = seen_anchor_counts.get(anchor_id, 0)
        if count:
            s.score = max(0.0, s.score - _DIVERSITY_PENALTY * count)
        seen_anchor_counts[anchor_id] = count + 1
        final.append(s)

    final.sort(key=lambda s: s.score, reverse=True)
    return final[: max(0, limit)]


__all__ = ["OutfitSuggestion", "recommend_outfits"]
