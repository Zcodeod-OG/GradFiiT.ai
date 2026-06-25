#!/usr/bin/env python3
"""GradFiT - Studio (Design + Stylist) generation smoke test.

Drives the two FLUX-backed studios end to end against a *running* API to
confirm the backend <-> SageMaker serving contract actually returns
images. This is the verification companion to the ``studios.py`` contract
fix: if the field names or input/option split drift again, this script
fails loudly with the inference id and error message.

    python -m scripts.studio_smoke \\
        --base-url http://localhost:8000 \\
        --email you@example.com --password secret

    # or with an existing bearer token, only the design task:
    python -m scripts.studio_smoke --base-url https://api.example.com \\
        --token "$ACCESS_TOKEN" --task design

Note: each call blocks while the backend synchronously polls SageMaker,
so allow up to a couple of minutes per generation on a cold endpoint.
"""

from __future__ import annotations

import argparse
import sys
from typing import Any, Dict, Optional

import httpx


def _login(client: httpx.Client, base_url: str, email: str, password: str) -> str:
    resp = client.post(
        f"{base_url}/api/auth/login",
        data={"username": email, "password": password},
    )
    resp.raise_for_status()
    token = resp.json().get("access_token")
    if not token:
        raise SystemExit("Login succeeded but no access_token in response.")
    return token


def _summarise(label: str, body: Dict[str, Any]) -> bool:
    status = body.get("status")
    primary = body.get("primary_image_url")
    inference_id = (body.get("pipeline_metadata") or {}).get("inference_id")
    print(f"[{label}] status={status} inference_id={inference_id}")
    if primary:
        print(f"[{label}] primary_image_url={primary}")
        for i, url in enumerate(body.get("image_urls", [])):
            print(f"[{label}]   image[{i}]={url}")
        return True
    print(f"[{label}] no image -- error: {body.get('error_message')}")
    return False


def _run_design(client: httpx.Client, base_url: str, prompt: str) -> bool:
    print("Generating design ...")
    resp = client.post(
        f"{base_url}/api/studios/design/generate",
        json={"prompt": prompt, "num_images": 1},
    )
    if resp.status_code == 502:
        print(f"[design] SageMaker error 502: {resp.text}")
        return False
    resp.raise_for_status()
    return _summarise("design", resp.json())


def _run_stylist(client: httpx.Client, base_url: str, prompt: str) -> bool:
    print("Generating stylist look ...")
    resp = client.post(
        f"{base_url}/api/studios/stylist/generate",
        json={
            "prompt": prompt,
            "pieces": [
                {"slot": "top", "description": "white linen shirt"},
                {"slot": "bottom", "description": "tailored navy trousers"},
            ],
            "background": "studio",
        },
    )
    if resp.status_code == 502:
        print(f"[stylist] SageMaker error 502: {resp.text}")
        return False
    resp.raise_for_status()
    return _summarise("stylist", resp.json())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--email")
    parser.add_argument("--password")
    parser.add_argument("--token", help="Bearer token (skips login)")
    parser.add_argument(
        "--task",
        choices=["design", "stylist", "both"],
        default="both",
    )
    parser.add_argument(
        "--prompt",
        default="minimalist oversized wool coat, editorial studio lighting",
    )
    parser.add_argument("--timeout", type=int, default=180)
    args = parser.parse_args()

    base_url = args.base_url.rstrip("/")

    with httpx.Client(timeout=args.timeout) as client:
        token: Optional[str] = args.token
        if not token:
            if not (args.email and args.password):
                parser.error("Provide --token, or --email and --password.")
            print(f"Logging in as {args.email} ...")
            token = _login(client, base_url, args.email, args.password)
        client.headers["Authorization"] = f"Bearer {token}"

        ok = True
        if args.task in ("design", "both"):
            ok = _run_design(client, base_url, args.prompt) and ok
        if args.task in ("stylist", "both"):
            ok = _run_stylist(client, base_url, args.prompt) and ok

    if ok:
        print("Studio smoke OK.")
        return 0
    print("Studio smoke FAILED -- see errors above.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
