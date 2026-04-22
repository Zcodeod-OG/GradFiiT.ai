#!/usr/bin/env python3
"""GradFiT - Try-On Provider Smoke / A-B Script

Run the same person + garment pair through every available try-on
provider and save the outputs side-by-side for visual inspection.

Usage:

    python -m scripts.tryon_provider_smoke \\
        --person  https://example.com/person.jpg \\
        --garment https://example.com/garment.jpg \\
        --category tops \\
        --quality balanced \\
        --providers fashn replicate_legacy \\
        --out ./smoke_outputs

The script writes each candidate to ``<out>/<provider>__<idx>.png`` and
prints a small JSON summary on stdout (timings, cost estimate, picker
metadata). It does *not* touch the database -- it only exercises the
provider layer, so it's safe to run against production keys.

Pass ``--postprocess`` to also run the Layer 2 post-processing pipeline
(face restore + upscale + identity check) on the raw provider output and
dump both the raw and post-processed images plus a metrics blob. Useful
for tuning the postprocess thresholds without spinning up the runner.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from pathlib import Path
from typing import List

# Make the backend importable when invoked directly from anywhere.
HERE = Path(__file__).resolve().parent
BACKEND_ROOT = HERE.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


def _setup_logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )


def _download(url: str, dest: Path) -> None:
    import httpx

    dest.parent.mkdir(parents=True, exist_ok=True)
    with httpx.stream("GET", url, timeout=60, follow_redirects=True) as response:
        response.raise_for_status()
        with dest.open("wb") as fh:
            for chunk in response.iter_bytes():
                fh.write(chunk)


def _extension_for(url: str) -> str:
    suffix = Path(url.split("?", 1)[0]).suffix.lower()
    if suffix in {".png", ".jpg", ".jpeg", ".webp"}:
        return suffix
    return ".png"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--person", required=True, help="Person image URL")
    parser.add_argument("--garment", required=True, help="Garment image URL")
    parser.add_argument("--category", default=None, help="Garment category hint")
    parser.add_argument(
        "--quality",
        default="balanced",
        choices=["fast", "balanced", "best"],
        help="Quality lane",
    )
    parser.add_argument(
        "--providers",
        nargs="+",
        default=["fashn", "replicate_legacy"],
        help="Provider slugs to exercise",
    )
    parser.add_argument(
        "--out",
        default="./smoke_outputs",
        help="Directory to write candidate images into",
    )
    parser.add_argument(
        "--no-download",
        action="store_true",
        help="Skip downloading outputs locally (just print URLs)",
    )
    parser.add_argument(
        "--postprocess",
        action="store_true",
        help=(
            "Run Layer 2 post-processing (face restore + upscale + identity "
            "check) on the raw provider output and dump both versions. Only "
            "applied to the fashn provider (mirrors the runtime gating)."
        ),
    )
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    _setup_logging(args.verbose)

    # Lazy imports so --help works even if the backend isn't fully configured.
    from app.services.tryon_providers import get_tryon_provider
    from app.services.tryon_providers.base import ProviderError

    out_root = Path(args.out).resolve()
    out_root.mkdir(parents=True, exist_ok=True)

    summary: List[dict] = []

    for provider_slug in args.providers:
        record = {
            "provider": provider_slug,
            "quality": args.quality,
            "ok": False,
            "elapsed_seconds": None,
            "result_image_url": None,
            "candidates": [],
            "saved_files": [],
            "cost_estimate_usd": None,
            "timings": {},
            "provider_meta_keys": [],
            "error": None,
        }

        try:
            provider = get_tryon_provider(provider_slug)
        except Exception as exc:
            record["error"] = f"factory_error: {exc}"
            summary.append(record)
            continue

        print(f"\n=== Provider: {provider_slug} (quality={args.quality}) ===", flush=True)
        started = time.time()
        try:
            result = provider.run(
                person_image_url=args.person,
                garment_image_url=args.garment,
                garment_category=args.category,
                quality=args.quality,
                tryon_id=None,
                on_progress=lambda stage: print(f"  [{provider_slug}] -> {stage}", flush=True),
            )
        except ProviderError as exc:
            record["error"] = f"provider_error: {exc} (details={exc.details})"
            record["elapsed_seconds"] = round(time.time() - started, 2)
            summary.append(record)
            continue
        except Exception as exc:  # pragma: no cover - keep smoke resilient
            record["error"] = f"unexpected: {exc}"
            record["elapsed_seconds"] = round(time.time() - started, 2)
            summary.append(record)
            continue

        elapsed = round(time.time() - started, 2)
        record.update(
            {
                "ok": True,
                "elapsed_seconds": elapsed,
                "result_image_url": result.result_image_url,
                "candidates": list(result.candidate_image_urls),
                "cost_estimate_usd": result.cost_estimate_usd,
                "timings": result.timings,
                "provider_meta_keys": sorted((result.provider_meta or {}).keys()),
            }
        )

        if not args.no_download:
            for idx, url in enumerate(result.candidate_image_urls):
                ext = _extension_for(url)
                dest = out_root / f"{provider_slug}__{args.quality}__raw__{idx}{ext}"
                try:
                    _download(url, dest)
                    record["saved_files"].append(str(dest))
                    print(f"  saved raw -> {dest}", flush=True)
                except Exception as exc:
                    print(f"  download failed for {url}: {exc}", flush=True)

        if args.postprocess and provider_slug == "fashn":
            from app.services.tryon_postprocessor import postprocess as run_pp

            print(f"  running postprocess for {provider_slug}...", flush=True)
            pp_started = time.time()
            try:
                pp_result = run_pp(
                    result_image_url=result.result_image_url,
                    candidates=list(result.candidate_image_urls),
                    person_image_url=args.person,
                    garment_image_url=args.garment,
                    lane=args.quality,
                    provider_name=provider_slug,
                    on_stage=lambda stage: print(
                        f"  [{provider_slug}/pp] -> {stage}", flush=True
                    ),
                    provider_rerun=None,
                )
            except Exception as exc:
                record["postprocess_error"] = str(exc)
                print(f"  postprocess crashed: {exc}", flush=True)
            else:
                record["postprocess"] = {
                    "final_image_url": pp_result.final_image_url,
                    "metrics": pp_result.metrics,
                    "notes": pp_result.notes,
                    "timings": pp_result.timings,
                    "retried_provider": pp_result.retried_provider,
                    "elapsed_seconds": round(time.time() - pp_started, 2),
                }
                if not args.no_download and pp_result.final_image_url:
                    ext = _extension_for(pp_result.final_image_url)
                    dest = (
                        out_root
                        / f"{provider_slug}__{args.quality}__postprocessed{ext}"
                    )
                    try:
                        _download(pp_result.final_image_url, dest)
                        record["saved_files"].append(str(dest))
                        print(f"  saved postprocessed -> {dest}", flush=True)
                    except Exception as exc:
                        print(
                            f"  download failed for postprocessed url: {exc}",
                            flush=True,
                        )
        elif args.postprocess:
            print(
                f"  --postprocess set but provider={provider_slug} is not 'fashn'; skipping",
                flush=True,
            )

        summary.append(record)

    print("\n=== Smoke summary ===")
    print(json.dumps(summary, indent=2, default=str))
    return 0 if any(r["ok"] for r in summary) else 1


if __name__ == "__main__":
    raise SystemExit(main())
