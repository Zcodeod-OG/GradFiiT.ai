"""P50/P95 benchmark for the tryon_v2 (CatVTON-Flux) task.

Runs N invocations against either:
  * the local Flask app (--mode local), or
  * a deployed SageMaker async endpoint (--mode sagemaker).

For each (quality lane) variant we report cold-start latency, warm P50,
P95, P99, plus mean container timings (sam2_ms, catvton_ms, total_ms)
broken out from the response. Results are written to
``ml-pipeline/benchmarks/tryon_v2_<timestamp>.json`` and a Markdown
summary is printed.

Why a dedicated harness: SageMaker's built-in Inference Recommender
benchmarks invocations but doesn't surface our internal timings, and
only varies instance type. We need to vary the quality lane (steps),
keep the instance fixed at g5.2xlarge, and watch the P95 vs. our 10s
budget. Also runs against a local container so we can iterate on step
counts without a full ECR push cycle.

Usage::

    # Local (in-process Flask):
    python scripts/benchmark_tryon_v2.py --mode local --bucket gradfit-dev \\
        --iterations 8

    # Against a deployed async endpoint:
    python scripts/benchmark_tryon_v2.py --mode sagemaker \\
        --endpoint-name gradfit-serving --bucket gradfit-prod \\
        --iterations 12 --lanes fast,balanced,best
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional


DEFAULT_PERSON = (
    "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=960"
)
DEFAULT_GARMENT = (
    "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=960"
)


def _percentile(values: List[float], pct: float) -> float:
    if not values:
        return 0.0
    sv = sorted(values)
    k = (len(sv) - 1) * (pct / 100.0)
    lo = int(k)
    hi = min(lo + 1, len(sv) - 1)
    return sv[lo] + (sv[hi] - sv[lo]) * (k - lo)


def _stats(values: List[float]) -> Dict[str, float]:
    if not values:
        return {}
    return {
        "n": len(values),
        "mean_ms": round(statistics.fmean(values), 1),
        "p50_ms": round(_percentile(values, 50), 1),
        "p95_ms": round(_percentile(values, 95), 1),
        "p99_ms": round(_percentile(values, 99), 1),
        "min_ms": round(min(values), 1),
        "max_ms": round(max(values), 1),
    }


# ── Local mode ────────────────────────────────────────────────────────


def _invoke_local(payload: Dict[str, Any]) -> Dict[str, Any]:
    import json as _json

    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
    from inference import app  # type: ignore

    client = app.test_client()
    resp = client.post(
        "/invocations",
        data=_json.dumps(payload),
        content_type="application/json",
    )
    body = resp.json
    if resp.status_code != 200:
        raise RuntimeError(
            f"local /invocations failed status={resp.status_code} body={str(body)[:300]}"
        )
    return body


# ── SageMaker async mode ──────────────────────────────────────────────


def _invoke_sagemaker_async(
    *,
    smr,
    s3,
    endpoint_name: str,
    bucket: str,
    payload: Dict[str, Any],
    poll_interval: float = 1.0,
    timeout_s: float = 120.0,
) -> Dict[str, Any]:
    """Submit an async invocation and block until the output JSON lands."""
    input_key = f"benchmarks/in/{uuid.uuid4().hex}.json"
    s3.put_object(
        Bucket=bucket,
        Key=input_key,
        Body=json.dumps(payload).encode("utf-8"),
        ContentType="application/json",
    )
    input_uri = f"s3://{bucket}/{input_key}"

    resp = smr.invoke_endpoint_async(
        EndpointName=endpoint_name,
        InputLocation=input_uri,
        ContentType="application/json",
        InferenceId=uuid.uuid4().hex[:24],
    )
    output_uri = resp["OutputLocation"]
    output_bucket = output_uri.split("/")[2]
    output_key = "/".join(output_uri.split("/")[3:])

    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            obj = s3.get_object(Bucket=output_bucket, Key=output_key)
            return json.loads(obj["Body"].read())
        except s3.exceptions.NoSuchKey:
            time.sleep(poll_interval)
        except Exception as exc:
            err = str(exc)
            if "NoSuchKey" in err or "404" in err:
                time.sleep(poll_interval)
                continue
            raise
    raise TimeoutError(
        f"async output never appeared at {output_uri} within {timeout_s}s"
    )


# ── Benchmark loop ────────────────────────────────────────────────────


def _run_lane(
    *,
    mode: str,
    lane: str,
    iterations: int,
    person_url: str,
    garment_url: str,
    bucket: str,
    output_prefix_base: str,
    seed_base: int,
    smr=None,
    s3=None,
    endpoint_name: Optional[str] = None,
) -> Dict[str, Any]:
    """Run ``iterations`` invocations on a single quality lane."""
    wall_ms: List[float] = []
    catvton_ms: List[float] = []
    sam2_ms: List[float] = []
    total_ms: List[float] = []
    cold_ms: Optional[float] = None

    for i in range(iterations):
        payload = {
            "task": "tryon_v2",
            "inputs": {
                "person_image_url": person_url,
                "garment_image_url": garment_url,
                "output_s3_prefix": f"{output_prefix_base}{lane}/",
                "garment_category": "top",
                "garment_description": "a white linen oversized shirt",
            },
            "options": {"quality": lane, "seed": seed_base + i},
        }
        started = time.time()
        try:
            if mode == "local":
                body = _invoke_local(payload)
            else:
                body = _invoke_sagemaker_async(
                    smr=smr,
                    s3=s3,
                    endpoint_name=endpoint_name,
                    bucket=bucket,
                    payload=payload,
                )
        except Exception as exc:  # noqa: BLE001 — record failure, keep going
            print(f"  [{lane}] iter {i} FAILED: {exc}")
            continue

        elapsed_ms = (time.time() - started) * 1000.0
        timings = body.get("timings") or {}

        # First request is cold; track separately so it doesn't poison P95.
        if i == 0:
            cold_ms = elapsed_ms
            print(
                f"  [{lane}] cold {elapsed_ms:.0f}ms "
                f"(catvton={timings.get('catvton_ms')}, sam2={timings.get('sam2_ms')})"
            )
            continue

        wall_ms.append(elapsed_ms)
        if isinstance(timings.get("catvton_ms"), (int, float)):
            catvton_ms.append(float(timings["catvton_ms"]))
        if isinstance(timings.get("sam2_ms"), (int, float)):
            sam2_ms.append(float(timings["sam2_ms"]))
        if isinstance(timings.get("total_ms"), (int, float)):
            total_ms.append(float(timings["total_ms"]))

        print(
            f"  [{lane}] warm {i}/{iterations - 1}: "
            f"wall={elapsed_ms:.0f}ms container_total={timings.get('total_ms')}"
        )

    return {
        "lane": lane,
        "iterations": iterations,
        "cold_ms": round(cold_ms, 1) if cold_ms is not None else None,
        "wall_warm": _stats(wall_ms),
        "container_catvton": _stats(catvton_ms),
        "container_sam2": _stats(sam2_ms),
        "container_total": _stats(total_ms),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["local", "sagemaker"], required=True)
    parser.add_argument("--bucket", required=True)
    parser.add_argument(
        "--prefix", default=f"benchmarks/tryon_v2/{int(time.time())}/"
    )
    parser.add_argument("--endpoint-name", default=os.environ.get("GRADFIT_ENDPOINT_NAME"))
    parser.add_argument("--region", default=os.environ.get("AWS_REGION", "us-east-1"))
    parser.add_argument("--person", default=DEFAULT_PERSON)
    parser.add_argument("--garment", default=DEFAULT_GARMENT)
    parser.add_argument("--iterations", type=int, default=8)
    parser.add_argument(
        "--lanes",
        default="balanced",
        help="Comma-separated quality lanes to benchmark (fast,balanced,best)",
    )
    parser.add_argument(
        "--out",
        default=None,
        help="Output JSON path; defaults to ml-pipeline/benchmarks/tryon_v2_<ts>.json",
    )
    args = parser.parse_args()

    if args.mode == "sagemaker" and not args.endpoint_name:
        parser.error("--endpoint-name is required in sagemaker mode")
    if args.iterations < 2:
        parser.error("--iterations must be >= 2 (1 cold + >=1 warm)")

    smr = None
    s3 = None
    if args.mode == "sagemaker":
        import boto3

        smr = boto3.client("sagemaker-runtime", region_name=args.region)
        s3 = boto3.client("s3", region_name=args.region)

    output_prefix_base = f"s3://{args.bucket}/{args.prefix.lstrip('/')}"
    lanes = [s.strip() for s in args.lanes.split(",") if s.strip()]

    print(
        f"\nBenchmarking tryon_v2 mode={args.mode} lanes={lanes} "
        f"iterations={args.iterations}\n"
    )
    started = time.time()

    results: List[Dict[str, Any]] = []
    for lane in lanes:
        print(f"\n=== lane: {lane} ===")
        results.append(
            _run_lane(
                mode=args.mode,
                lane=lane,
                iterations=args.iterations,
                person_url=args.person,
                garment_url=args.garment,
                bucket=args.bucket,
                output_prefix_base=output_prefix_base,
                seed_base=42 + 1000 * lanes.index(lane),
                smr=smr,
                s3=s3,
                endpoint_name=args.endpoint_name,
            )
        )

    summary = {
        "mode": args.mode,
        "endpoint_name": args.endpoint_name if args.mode == "sagemaker" else None,
        "iterations_per_lane": args.iterations,
        "lanes": results,
        "wall_clock_s": round(time.time() - started, 1),
    }

    out_path = args.out
    if not out_path:
        bench_dir = Path(__file__).resolve().parents[2] / "benchmarks"
        bench_dir.mkdir(parents=True, exist_ok=True)
        out_path = bench_dir / f"tryon_v2_{int(time.time())}.json"
    Path(out_path).write_text(json.dumps(summary, indent=2))

    print("\n── Summary ──────────────────────────────────────────")
    print(f"{'lane':<10}{'cold':>10}{'warm p50':>12}{'warm p95':>12}{'warm p99':>12}")
    for r in results:
        ww = r["wall_warm"] or {}
        print(
            f"{r['lane']:<10}"
            f"{(r['cold_ms'] or 0):>10.0f}"
            f"{ww.get('p50_ms', 0):>12.0f}"
            f"{ww.get('p95_ms', 0):>12.0f}"
            f"{ww.get('p99_ms', 0):>12.0f}"
        )
    print(f"\nResults written to {out_path}\n")


if __name__ == "__main__":
    main()
