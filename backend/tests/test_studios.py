"""Unit tests for the studios <-> serving-container contract helpers.

Pure-Python: no DB, no SageMaker. Covers the payload normalisation that
caused Design/Stylist to silently return no images before the contract
fix (wrong field names, knobs in the wrong bag, unparsed response keys).

Run with:  pytest backend/tests/test_studios.py
"""

from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services import studios


def test_extract_reads_serving_primary_and_list():
    payload = {
        "task": "design",
        "primary_image_uri": "s3://bucket/designs/1/design_0.png",
        "image_uris": [
            "s3://bucket/designs/1/design_0.png",
            "s3://bucket/designs/1/design_1.png",
        ],
    }
    urls = studios._extract_image_urls(payload)
    # Primary is first and de-duplicated against the list. s3:// uris are
    # converted to presigned https urls, so assert on the key substring.
    assert len(urls) == 2
    assert "design_0.png" in urls[0]
    assert "design_1.png" in urls[1]


def test_extract_handles_legacy_shapes():
    assert studios._extract_image_urls({"image_url": "https://x/y.png"}) == [
        "https://x/y.png"
    ]
    assert studios._extract_image_urls({"images": ["https://a/b.png"]}) == [
        "https://a/b.png"
    ]
    assert studios._extract_image_urls({}) == []


def test_compact_drops_none_only():
    out = studios._compact({"a": 1, "b": None, "c": 0, "d": False})
    assert out == {"a": 1, "c": 0, "d": False}


def test_stylist_pieces_maps_slot_to_role():
    pieces = [
        {"slot": "top", "description": "linen shirt", "color": "white"},
        {"slot": "bottom", "description": "chinos", "fabric": "cotton"},
    ]
    mapped = studios._stylist_pieces(pieces)
    assert mapped[0]["role"] == "top"
    assert "white" in mapped[0]["description"]
    assert "linen shirt" in mapped[0]["description"]
    assert mapped[1]["role"] == "bottom"
    assert "cotton" in mapped[1]["description"]


def test_stylist_pieces_skips_empty_and_bad_entries():
    pieces = [
        {"slot": "top"},  # no description -> skipped
        "not-a-dict",  # ignored
        {"role": "shoes", "description": "white sneakers"},
    ]
    mapped = studios._stylist_pieces(pieces)
    assert mapped == [{"role": "shoes", "description": "white sneakers"}]


def test_brand_dna_is_active():
    assert studios.brand_dna_is_active(None) is False
    empty = SimpleNamespace(voice="", palette=[], model_references=[], lora_uri="")
    assert studios.brand_dna_is_active(empty) is False
    configured = SimpleNamespace(
        voice="Quiet luxury",
        palette=["#111111"],
        model_references=[],
        lora_uri="",
    )
    assert studios.brand_dna_is_active(configured) is True


def test_apply_brand_dna_to_design_prefixes_and_lora():
    design = SimpleNamespace(
        prompt="linen shirt",
        lora_uri=None,
        lora_scale=None,
    )
    brand = SimpleNamespace(
        voice="Minimal tailoring",
        palette=["#EEEEEE"],
        lora_uri="s3://bucket/brand.safetensors",
        lora_status="ready",
        lora_strength=0.85,
        model_references=[],
    )
    applied = studios._apply_brand_dna_to_design(design, brand)
    assert "Minimal tailoring" in design.prompt
    assert design.lora_uri == "s3://bucket/brand.safetensors"
    assert design.lora_scale == 0.85
    assert applied["lora"] is True
