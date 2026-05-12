"""Aggregate a user's closet into a compact 'style fingerprint'.

Consumed by the Chrome extension to decide whether a product image on
a retailer page is worth highlighting as 'you should try this'. The
profile is intentionally small (a few hundred bytes) so the extension
can cache it in chrome.storage and run match scoring entirely client
side without per-image API calls.

Schema:

* ``palette``        — list of top hex colors aggregated across the
                       closet, weighted by cumulative dominance.
* ``garment_types``  — { upper_body: count, lower_body: count, ... }
* ``categories``     — top free-form categories the user has tagged
                       items with, with counts. Capped at 12.
* ``keywords``       — frequent stopword-filtered tokens from garment
                       names + descriptions (freq >= 2). Used for the
                       extension's keyword-match scoring. Capped at 40.
* ``total_items``    — saved_to_closet count.
"""

from __future__ import annotations

import logging
import re
from collections import Counter
from dataclasses import dataclass, field
from typing import Dict, List

from sqlalchemy.orm import Session

from app.models.garment import Garment

logger = logging.getLogger(__name__)


# Stopwords lifted from garment_suggestions._name_overlap, kept in sync
# so the recommender and the style profile agree on what's signal.
_STOPWORDS = {
    "the", "a", "an", "and", "or", "of", "with", "for", "to",
    "shirt", "pants", "trousers", "dress", "top", "bottom",
    "jacket", "coat", "skirt", "jeans", "size", "style", "from",
    "color", "colour", "fit", "new", "the", "your", "our", "this",
}

_TOKEN_RE = re.compile(r"[a-z0-9]{3,}")


@dataclass
class StyleProfile:
    palette: List[str] = field(default_factory=list)
    garment_types: Dict[str, int] = field(default_factory=dict)
    categories: List[Dict[str, object]] = field(default_factory=list)
    keywords: List[str] = field(default_factory=list)
    total_items: int = 0


def _tokens(text: str | None) -> List[str]:
    if not text:
        return []
    return [t for t in _TOKEN_RE.findall(text.lower()) if t not in _STOPWORDS]


def build_style_profile(db: Session, user_id: int) -> StyleProfile:
    closet = (
        db.query(Garment)
        .filter(
            Garment.user_id == user_id,
            Garment.saved_to_closet.is_(True),
            Garment.preprocess_status == "ready",
        )
        .all()
    )
    if not closet:
        return StyleProfile()

    # --- Aggregate palette ------------------------------------------------
    # Sum dominance weights per hex across the whole closet so the most
    # represented colors bubble up.
    color_weights: Counter = Counter()
    for g in closet:
        palette = g.color_palette or []
        for entry in palette:
            if not isinstance(entry, dict):
                continue
            hex_value = str(entry.get("hex", "")).upper()
            try:
                weight = float(entry.get("weight", 0.0))
            except (TypeError, ValueError):
                weight = 0.0
            if hex_value:
                color_weights[hex_value] += weight
    top_palette = [hex_value for hex_value, _ in color_weights.most_common(8)]

    # --- Type / category counts ------------------------------------------
    type_counts: Counter = Counter()
    category_counts: Counter = Counter()
    for g in closet:
        if g.garment_type:
            type_counts[str(g.garment_type)] += 1
        if g.category:
            category_counts[str(g.category).strip().lower()] += 1

    top_categories = [
        {"name": name, "count": count}
        for name, count in category_counts.most_common(12)
    ]

    # --- Keywords ---------------------------------------------------------
    keyword_counts: Counter = Counter()
    for g in closet:
        for tok in _tokens(g.name):
            keyword_counts[tok] += 1
        for tok in _tokens(g.description):
            keyword_counts[tok] += 1
    # Only keep tokens that appear at least twice — singletons are noise
    # (one-off product names like a brand/SKU code).
    top_keywords = [
        tok for tok, count in keyword_counts.most_common(60) if count >= 2
    ][:40]

    return StyleProfile(
        palette=top_palette,
        garment_types=dict(type_counts),
        categories=top_categories,
        keywords=top_keywords,
        total_items=len(closet),
    )


__all__ = ["StyleProfile", "build_style_profile"]
