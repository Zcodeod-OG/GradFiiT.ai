"""Local smoke test for the GradFiT serving container.

Boots the Flask app via gunicorn-less Werkzeug (in-process) and posts a
small payload to each task endpoint. Skips tasks that require GPU when
running on CPU-only machines (returns 200 on /ping but lets the payload
fail gracefully).

Run with::

    python scripts/smoke_test.py --bucket gradfit-dev --prefix smoke/
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from typing import Dict


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bucket", required=True)
    parser.add_argument("--prefix", default="smoke/")
    parser.add_argument(
        "--person",
        default="https://images.unsplash.com/photo-1483985988355-763728e1935b?w=960",
    )
    parser.add_argument(
        "--garment",
        default="https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=960",
    )
    args = parser.parse_args()

    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
    from inference import app  # type: ignore

    client = app.test_client()

    ping = client.get("/ping")
    print("[ping]", ping.status_code, ping.json)

    out_prefix = f"s3://{args.bucket}/{args.prefix.lstrip('/')}"

    cases: Dict[str, dict] = {
        "mask": {
            "task": "mask",
            "inputs": {"image_url": args.person, "output_s3_prefix": out_prefix + "mask/"},
            "options": {"target": "person"},
        },
        "design": {
            "task": "design",
            "inputs": {
                "prompt": (
                    "denim dark blue 5-pocket ankle-length jeans in washed stretch denim "
                    "slightly looser fit with a wide waist panel and tapered legs"
                ),
                "output_s3_prefix": out_prefix + "design/",
            },
            "options": {"num_images": 1, "num_inference_steps": 24},
        },
        "tryon": {
            "task": "tryon",
            "inputs": {
                "person_image_url": args.person,
                "garment_image_url": args.garment,
                "output_s3_prefix": out_prefix + "tryon/",
                "garment_category": "tops",
                "garment_description": "a white linen oversized shirt",
            },
            "options": {"quality": "balanced"},
        },
        "tryon_v2": {
            "task": "tryon_v2",
            "inputs": {
                "person_image_url": args.person,
                "garment_image_url": args.garment,
                "output_s3_prefix": out_prefix + "tryon_v2/",
                "garment_category": "top",
                "garment_description": "a white linen oversized shirt",
            },
            "options": {"quality": "balanced", "seed": 42},
        },
        "upscale": {
            "task": "upscale",
            "inputs": {
                "image_url": args.person,
                "output_s3_prefix": out_prefix + "upscale/",
            },
            "options": {"scale": 2},
        },
    }

    for name, payload in cases.items():
        print(f"\n[{name}] sending...")
        started = time.time()
        resp = client.post(
            "/invocations",
            data=json.dumps(payload),
            content_type="application/json",
        )
        elapsed = int((time.time() - started) * 1000)
        body = resp.json
        print(f"[{name}] {resp.status_code} in {elapsed}ms")
        if resp.status_code != 200:
            print(json.dumps(body, indent=2)[:1000])
        else:
            print(json.dumps(body, indent=2)[:600])


if __name__ == "__main__":
    main()
