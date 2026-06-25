#!/usr/bin/env python3
"""GradFiT - Closet end-to-end smoke test.

Exercises the closet happy path against a *running* API:

    1. Log in (or use a provided bearer token).
    2. List saved garments.
    3. Fetch outfit recommendations (with AI stylist notes).
    4. Create a Look from the first recommended outfit's pieces.
    5. Render the Look and poll the try-on status to completion.

Unlike the unit tests this talks to a live server, so it doubles as a
post-deploy check that the recommendations -> looks -> render chain works
end to end. It only reads/writes the authenticated user's own data.

Usage:

    python -m scripts.closet_smoke \\
        --base-url http://localhost:8000 \\
        --email you@example.com --password secret

    # or skip login with an existing token:
    python -m scripts.closet_smoke --base-url https://api.example.com \\
        --token "$ACCESS_TOKEN" --no-render
"""

from __future__ import annotations

import argparse
import sys
import time
from typing import Any, Dict, List, Optional

import httpx

_TERMINAL_OK = {"completed"}
_TERMINAL_FAIL = {"failed", "dead_letter", "cancelled"}


def _login(client: httpx.Client, base_url: str, email: str, password: str) -> str:
    # OAuth2 password form: username == email.
    resp = client.post(
        f"{base_url}/api/auth/login",
        data={"username": email, "password": password},
    )
    resp.raise_for_status()
    token = resp.json().get("access_token")
    if not token:
        raise SystemExit("Login succeeded but no access_token in response.")
    return token


def _list_garments(client: httpx.Client, base_url: str) -> List[Dict[str, Any]]:
    resp = client.get(f"{base_url}/api/garments", params={"limit": 200})
    resp.raise_for_status()
    return resp.json() or []


def _recommend(
    client: httpx.Client, base_url: str, with_notes: bool
) -> List[Dict[str, Any]]:
    resp = client.get(
        f"{base_url}/api/garments/outfits/recommendations",
        params={"limit": 5, "with_notes": str(with_notes).lower()},
    )
    resp.raise_for_status()
    return resp.json().get("outfits", [])


def _create_look(
    client: httpx.Client, base_url: str, name: str, garment_ids: List[int], notes: str
) -> Dict[str, Any]:
    resp = client.post(
        f"{base_url}/api/looks/",
        json={"name": name, "garment_ids": garment_ids, "notes": notes},
    )
    resp.raise_for_status()
    return resp.json()


def _render_look(
    client: httpx.Client, base_url: str, look_id: int
) -> Optional[int]:
    resp = client.post(
        f"{base_url}/api/looks/{look_id}/render", json={"quality": "balanced"}
    )
    resp.raise_for_status()
    return resp.json().get("data", {}).get("tryon_id")


def _poll(
    client: httpx.Client, base_url: str, tryon_id: int, timeout_s: int
) -> Dict[str, Any]:
    deadline = time.time() + timeout_s
    last: Dict[str, Any] = {}
    while time.time() < deadline:
        resp = client.get(f"{base_url}/api/tryon/status/{tryon_id}")
        resp.raise_for_status()
        last = resp.json().get("data", {}) or {}
        status = last.get("status")
        if last.get("result_image_url") or status in _TERMINAL_OK:
            return last
        if status in _TERMINAL_FAIL:
            return last
        print(f"   ... {status} ({last.get('current_stage', '')})")
        time.sleep(3)
    return last


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--email")
    parser.add_argument("--password")
    parser.add_argument("--token", help="Bearer token (skips login)")
    parser.add_argument(
        "--no-render",
        action="store_true",
        help="Stop after creating the look; skip the render + poll.",
    )
    parser.add_argument("--timeout", type=int, default=300)
    args = parser.parse_args()

    base_url = args.base_url.rstrip("/")

    with httpx.Client(timeout=60) as client:
        token = args.token
        if not token:
            if not (args.email and args.password):
                parser.error("Provide --token, or --email and --password.")
            print(f"Logging in as {args.email} ...")
            token = _login(client, base_url, args.email, args.password)
        client.headers["Authorization"] = f"Bearer {token}"

        print("Listing garments ...")
        garments = _list_garments(client, base_url)
        ready = [g for g in garments if g.get("preprocess_status") == "ready"]
        print(f"   {len(garments)} garments ({len(ready)} ready).")
        if len(ready) < 2:
            print("Need at least 2 ready garments to build an outfit. Stopping.")
            return 1

        print("Fetching outfit recommendations ...")
        outfits = _recommend(client, base_url, with_notes=True)
        if not outfits:
            print("No outfits returned. Stopping.")
            return 1
        for i, o in enumerate(outfits):
            note = o.get("stylist_note") or o.get("reason")
            print(f"   [{i}] score={o.get('score'):.2f} :: {note}")
            for alt in o.get("alternatives", []) or []:
                print(f"        alt: {alt}")

        top = outfits[0]
        ids = [g["id"] for g in top.get("garments", [])][:3]
        if len(ids) < 2:
            print("Top outfit has fewer than 2 pieces. Stopping.")
            return 1

        name = " + ".join(
            g.get("name", "piece") for g in top.get("garments", [])[:2]
        )
        print(f"Creating look '{name}' from garments {ids} ...")
        look = _create_look(
            client,
            base_url,
            name=name,
            garment_ids=ids,
            notes=top.get("stylist_note") or top.get("reason") or "",
        )
        look_id = look["id"]
        print(f"   Created look #{look_id}.")

        if args.no_render:
            print("Skipping render (--no-render). Smoke OK.")
            return 0

        print(f"Rendering look #{look_id} ...")
        tryon_id = _render_look(client, base_url, look_id)
        if not tryon_id:
            print("Render did not return a tryon_id. Stopping.")
            return 1

        final = _poll(client, base_url, tryon_id, args.timeout)
        status = final.get("status")
        if final.get("result_image_url"):
            print(f"Render complete. Result: {final['result_image_url']}")
            print("Smoke OK.")
            return 0
        print(
            f"Render did not complete (status={status}): "
            f"{final.get('error_message') or 'timed out'}"
        )
        return 1


if __name__ == "__main__":
    sys.exit(main())
