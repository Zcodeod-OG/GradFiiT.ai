"""AI Stylist — LLM-generated rationale and alternative pairings.

Sits ON TOP of :mod:`app.services.outfit_recommender` (rule-based, deterministic)
rather than replacing it. The deterministic recommender picks *which* outfits to
surface; this module turns each top pick into a short stylist note ("Why this
works for you") plus optional alternative pairing suggestions.

Why a thin wrapper instead of an LLM-first recommender:
* Latency budget — Bedrock adds 500–1500ms; we only invoke it after the rule-
  based recommender has already picked the top N, not per candidate.
* Stability — users see the same top picks across sessions until their closet
  changes. The LLM only *narrates* the picks.
* Cost control — system prompt + brand context are cached (90% discount on
  repeated style guides), so per-call cost is dominated by the small user
  message describing one outfit.

Provider: Amazon Bedrock Converse API, Claude Haiku 4.5 by default.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence

import boto3
from botocore.config import Config

from app.config import settings
from app.models.brand_dna import BrandDNA
from app.services.outfit_recommender import OutfitSuggestion

logger = logging.getLogger(__name__)


# Bedrock cross-region inference profile for Claude Haiku 4.5. Override via env
# for region-specific deployment or to A/B test against Sonnet.
DEFAULT_MODEL_ID = "us.anthropic.claude-haiku-4-5-20251001-v1:0"

# Keep responses snappy. Stylist copy should fit on a single card.
DEFAULT_MAX_TOKENS = 280
DEFAULT_TEMPERATURE = 0.6

# Bedrock client timeout — we want fast failure so the API route can fall back
# to the rule-based reason() without an LLM rationale rather than blocking.
_BEDROCK_TIMEOUT_SECONDS = 6


@dataclass
class StylistNote:
    """LLM-generated commentary attached to an OutfitSuggestion."""

    rationale: str
    alternatives: List[str] = field(default_factory=list)
    raw_score: Optional[float] = None


def _bedrock_client():
    """Lazy boto3 Bedrock Runtime client.

    Reuses the same credentials as the rest of the app (AWS_ACCESS_KEY_ID /
    AWS_SECRET_ACCESS_KEY) and the configured AWS_REGION. Returns ``None`` when
    the SDK isn't available or credentials are missing — callers fall back to
    the deterministic reason().
    """
    try:
        return boto3.client(
            "bedrock-runtime",
            region_name=settings.AWS_REGION,
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            config=Config(
                read_timeout=_BEDROCK_TIMEOUT_SECONDS,
                connect_timeout=_BEDROCK_TIMEOUT_SECONDS,
                retries={"max_attempts": 1},
            ),
        )
    except Exception as exc:
        logger.warning("Bedrock client unavailable: %s", exc)
        return None


_STYLIST_PERSONA = """You are GradFiT's resident AI stylist.
You write short, confident, specific outfit rationales for a user's virtual try-on results.

Rules:
- 2 sentences max. Active voice. No filler.
- Reference concrete attributes (color harmony, silhouette, occasion, texture mix). Never invent garments not in the outfit.
- If a Brand DNA is provided, anchor 1 phrase to it (palette or brand voice).
- Output strict JSON: {"rationale": "...", "alternatives": ["...", "..."]}
- "alternatives" is 0–2 brief suggestions for swappable pieces from the user's closet, each <8 words.
- No emojis. No markdown. No leading/trailing text outside the JSON.
"""


def _build_brand_block(brand: Optional[BrandDNA]) -> Optional[str]:
    """Render the user's Brand DNA into a stable, cache-friendly text block.

    Returns ``None`` when there's nothing useful — letting us drop the
    corresponding cache block so the cost is amortised across users who all
    share the empty-brand prefix.
    """
    if brand is None:
        return None
    palette = brand.palette if isinstance(brand.palette, list) else []
    voice = (brand.voice or "").strip()
    if not (palette or voice):
        return None
    payload = {
        "palette": [str(c) for c in palette if isinstance(c, str)][:8],
        "voice": voice[:400],
    }
    return f"Brand DNA:\n{json.dumps(payload, ensure_ascii=False)}"


def _outfit_to_payload(suggestion: OutfitSuggestion) -> Dict[str, Any]:
    """Serialize an OutfitSuggestion into the compact JSON the LLM consumes.

    Only the fields the stylist actually needs. Smaller payload = cheaper +
    faster + less risk of hallucinated detail.
    """
    pieces = []
    for g in suggestion.garments:
        pieces.append(
            {
                "type": getattr(g, "garment_type", None),
                "category": getattr(g, "category", None),
                "name": getattr(g, "name", None),
                "palette": [
                    str(entry.get("hex", "")).upper()
                    for entry in (getattr(g, "color_palette", None) or [])
                    if isinstance(entry, dict) and entry.get("hex")
                ][:3],
            }
        )
    return {
        "pieces": pieces,
        "composite_palette": suggestion.palette,
        "rule_score": suggestion.score,
        "rule_reason": suggestion.reason,
    }


def _parse_response(text: str) -> StylistNote:
    """Parse the model's JSON reply. Best-effort: on parse failure we surface
    the raw text as the rationale so the user still sees *something*."""
    text = (text or "").strip()
    # Strip code fences if the model added them despite the system rule.
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()
    try:
        data = json.loads(text)
        rationale = str(data.get("rationale", "")).strip()
        alts = data.get("alternatives", []) or []
        alternatives = [str(a).strip() for a in alts if str(a).strip()][:2]
        if not rationale:
            raise ValueError("empty rationale")
        return StylistNote(rationale=rationale, alternatives=alternatives)
    except Exception as exc:
        logger.warning("Stylist response parse failed: %s; raw=%r", exc, text[:200])
        return StylistNote(rationale=text[:240] or "Solid pick from your closet.")


def annotate_outfit(
    suggestion: OutfitSuggestion,
    *,
    brand: Optional[BrandDNA] = None,
    model_id: Optional[str] = None,
) -> StylistNote:
    """Produce a stylist note for one outfit suggestion.

    Returns a degraded note (the rule-based reason) when Bedrock is
    unavailable so the caller never has to special-case the failure path.
    """
    client = _bedrock_client()
    fallback = StylistNote(rationale=suggestion.reason, alternatives=[])
    if client is None:
        return fallback

    # System content is the cacheable prefix. Order matters: most-stable
    # content first, then the brand block, then the cachePoint marker.
    system: List[Dict[str, Any]] = [{"text": _STYLIST_PERSONA}]
    brand_block = _build_brand_block(brand)
    if brand_block:
        system.append({"text": brand_block})
    system.append({"cachePoint": {"type": "default"}})

    user_payload = _outfit_to_payload(suggestion)
    messages = [
        {
            "role": "user",
            "content": [
                {"text": "Outfit to narrate:"},
                {"text": json.dumps(user_payload, ensure_ascii=False)},
            ],
        }
    ]

    try:
        response = client.converse(
            modelId=model_id or DEFAULT_MODEL_ID,
            system=system,
            messages=messages,
            inferenceConfig={
                "maxTokens": DEFAULT_MAX_TOKENS,
                "temperature": DEFAULT_TEMPERATURE,
            },
        )
    except Exception as exc:
        logger.warning("Bedrock converse failed: %s", exc)
        return fallback

    try:
        blocks = response["output"]["message"]["content"]
        text = "".join(b.get("text", "") for b in blocks if isinstance(b, dict))
    except (KeyError, TypeError) as exc:
        logger.warning("Bedrock response shape unexpected: %s", exc)
        return fallback

    usage = response.get("usage") or {}
    cache_read = usage.get("cacheReadInputTokens", 0)
    cache_write = usage.get("cacheWriteInputTokens", 0)
    if cache_read or cache_write:
        logger.info(
            "Stylist cache: read=%d write=%d input=%d output=%d",
            cache_read,
            cache_write,
            usage.get("inputTokens", 0),
            usage.get("outputTokens", 0),
        )

    return _parse_response(text)


def annotate_outfits(
    suggestions: Sequence[OutfitSuggestion],
    *,
    brand: Optional[BrandDNA] = None,
    model_id: Optional[str] = None,
) -> List[StylistNote]:
    """Annotate a list of outfits sequentially.

    Sequential rather than parallel on purpose: the shared system prefix only
    hits cache after the first call writes it (cache TTL ~5 minutes). Parallel
    fan-out would write the prefix N times instead of once.
    """
    notes: List[StylistNote] = []
    for s in suggestions:
        notes.append(annotate_outfit(s, brand=brand, model_id=model_id))
    return notes


__all__ = ["StylistNote", "annotate_outfit", "annotate_outfits"]
