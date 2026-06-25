"""Unit tests for the Bedrock-backed stylist notes layer.

These are pure-Python unit tests: no database and no live Bedrock. The
boto3 client is monkeypatched so we exercise the prompt assembly, brand
block rendering, response parsing, and the graceful-fallback contract the
recommendations route relies on.

Run with:  pytest backend/tests/test_stylist.py
"""

from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services import stylist
from app.services.outfit_recommender import OutfitSuggestion


def _make_suggestion(reason: str = "Tonal top + bottom pairing") -> OutfitSuggestion:
    top = SimpleNamespace(
        garment_type="upper_body",
        category="tops",
        name="White tee",
        color_palette=[{"hex": "#FFFFFF", "weight": 0.8}],
    )
    bottom = SimpleNamespace(
        garment_type="lower_body",
        category="bottoms",
        name="Blue jeans",
        color_palette=[{"hex": "#274690", "weight": 0.7}],
    )
    return OutfitSuggestion(
        garments=[top, bottom],
        score=0.82,
        reason=reason,
        palette=["#FFFFFF", "#274690"],
    )


class _FakeBedrockClient:
    """Stub that returns a canned Converse response."""

    def __init__(self, payload_text: str):
        self._payload_text = payload_text
        self.calls = []

    def converse(self, **kwargs):
        self.calls.append(kwargs)
        return {
            "output": {
                "message": {"content": [{"text": self._payload_text}]}
            },
            "usage": {"inputTokens": 10, "outputTokens": 20},
        }


def test_build_brand_block_uses_voice_field():
    """The brand block must read `voice` + `palette`, not the old
    `moods`/`description` fields that don't exist on BrandDNA."""
    brand = SimpleNamespace(palette=["#102030", "#A0B0C0"], voice="Quiet luxury, muted tones")
    block = stylist._build_brand_block(brand)
    assert block is not None
    assert "Quiet luxury" in block
    assert "#102030" in block


def test_build_brand_block_none_when_empty():
    brand = SimpleNamespace(palette=[], voice="")
    assert stylist._build_brand_block(brand) is None
    assert stylist._build_brand_block(None) is None


def test_parse_response_extracts_json():
    note = stylist._parse_response(
        '{"rationale": "Clean and crisp.", "alternatives": ["Swap in loafers"]}'
    )
    assert note.rationale == "Clean and crisp."
    assert note.alternatives == ["Swap in loafers"]


def test_parse_response_strips_code_fence():
    note = stylist._parse_response(
        '```json\n{"rationale": "Sharp fit.", "alternatives": []}\n```'
    )
    assert note.rationale == "Sharp fit."


def test_annotate_outfit_falls_back_when_bedrock_unavailable(monkeypatch):
    """When the client can't be built, the note degrades to the rule reason
    so the route never has to special-case the failure path."""
    monkeypatch.setattr(stylist, "_bedrock_client", lambda: None)
    suggestion = _make_suggestion(reason="Rule-based reason")
    note = stylist.annotate_outfit(suggestion)
    assert note.rationale == "Rule-based reason"
    assert note.alternatives == []


def test_annotate_outfit_uses_bedrock_response(monkeypatch):
    fake = _FakeBedrockClient(
        '{"rationale": "Balanced contrast.", "alternatives": ["Add a belt"]}'
    )
    monkeypatch.setattr(stylist, "_bedrock_client", lambda: fake)
    note = stylist.annotate_outfit(_make_suggestion())
    assert note.rationale == "Balanced contrast."
    assert note.alternatives == ["Add a belt"]
    assert len(fake.calls) == 1


def test_annotate_outfit_falls_back_on_bedrock_error(monkeypatch):
    class _Boom:
        def converse(self, **kwargs):
            raise RuntimeError("throttled")

    monkeypatch.setattr(stylist, "_bedrock_client", lambda: _Boom())
    suggestion = _make_suggestion(reason="Fallback reason")
    note = stylist.annotate_outfit(suggestion)
    assert note.rationale == "Fallback reason"
