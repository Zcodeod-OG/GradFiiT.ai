"""Release-gate checks for latency/reliability metrics."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from statistics import median
from typing import Any, Dict, Iterable, List, Tuple


SUCCESS_STATUSES = {"completed"}
TERMINAL_STATUSES = {
    "completed",
    "failed",
    "dead_letter",
    "timeout",
    "http_error",
    "request_error",
    "response_error",
    "exception",
    "unknown",
}


def normalize_status(value: Any) -> str:
    if value is None:
        return "unknown"
    text = str(value).strip().lower()
    return text if text else "unknown"


def to_float(value: Any) -> float | None:
    try:
        number = float(value)
    except Exception:
        return None
    if math.isnan(number) or math.isinf(number):
        return None
    return number


def percentile(values: List[float], p: float) -> float:
    """Compute percentile using nearest-rank method.

    For small samples this avoids underestimating the p95 tail.
    """
    if not values:
        return 0.0
    values = sorted(values)
    n = len(values)
    rank = max(1, int(math.ceil(p * n)))
    return values[rank - 1]


def load_records(metrics_path: str) -> List[Dict[str, Any]]:
    payload = json.loads(Path(metrics_path).read_text(encoding="utf-8"))
    if isinstance(payload, list):
        records = payload
    elif isinstance(payload, dict) and isinstance(payload.get("results"), list):
        records = payload["results"]
    else:
        raise SystemExit("Metrics JSON must be a list or a dict containing a 'results' list")

    return [x for x in records if isinstance(x, dict)]


def evaluate_records(
    records: Iterable[Dict[str, Any]],
    *,
    min_sample_size: int,
    p50_threshold_seconds: float,
    p95_threshold_seconds: float,
    failure_rate_threshold: float,
) -> Tuple[Dict[str, object], bool]:
    rows = list(records)
    sample_size = len(rows)

    status_counts: Dict[str, int] = {}
    success_latencies: List[float] = []
    all_latencies: List[float] = []
    failure_count = 0
    non_terminal_count = 0

    for row in rows:
        status = normalize_status(row.get("status"))
        status_counts[status] = status_counts.get(status, 0) + 1
        if status not in TERMINAL_STATUSES:
            non_terminal_count += 1

        if status not in SUCCESS_STATUSES:
            failure_count += 1

        latency = to_float(row.get("wall_time_seconds"))
        if latency is not None and latency >= 0:
            all_latencies.append(latency)
            if status in SUCCESS_STATUSES:
                success_latencies.append(latency)

    p50_success = median(success_latencies) if success_latencies else 0.0
    p95_success = percentile(success_latencies, 0.95) if success_latencies else 0.0
    p50_all = median(all_latencies) if all_latencies else 0.0
    p95_all = percentile(all_latencies, 0.95) if all_latencies else 0.0

    failure_rate = (failure_count / sample_size) if sample_size else 1.0
    non_terminal_rate = (non_terminal_count / sample_size) if sample_size else 1.0

    gates = {
        "sample_size_minimum": sample_size >= min_sample_size,
        "has_successful_cases": len(success_latencies) > 0,
        "p50_success_under_threshold": p50_success < p50_threshold_seconds,
        "p95_success_under_threshold": p95_success < p95_threshold_seconds,
        "failure_rate_under_threshold": failure_rate < failure_rate_threshold,
        "all_cases_terminal": non_terminal_rate == 0.0,
    }
    is_pass = all(gates.values())

    result: Dict[str, object] = {
        "sample_size": sample_size,
        "success_count": len(success_latencies),
        "failure_count": failure_count,
        "status_counts": status_counts,
        "p50_seconds_success": round(p50_success, 3),
        "p95_seconds_success": round(p95_success, 3),
        "p50_seconds_all": round(p50_all, 3),
        "p95_seconds_all": round(p95_all, 3),
        "failure_rate": round(failure_rate, 4),
        "non_terminal_rate": round(non_terminal_rate, 4),
        "thresholds": {
            "min_sample_size": min_sample_size,
            "p50_threshold_seconds": p50_threshold_seconds,
            "p95_threshold_seconds": p95_threshold_seconds,
            "failure_rate_threshold": failure_rate_threshold,
        },
        "gates": gates,
        "pass": is_pass,
    }
    return result, is_pass


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--metrics", required=True, help="Benchmark result JSON path")
    parser.add_argument(
        "--out",
        default="ml-pipeline/benchmarks/release_gate_report.json",
        help="Output report path",
    )
    parser.add_argument(
        "--min-sample-size",
        type=int,
        default=100,
        help="Minimum benchmark sample size required for gate validity",
    )
    parser.add_argument(
        "--p50-threshold-seconds",
        type=float,
        default=8.0,
        help="Maximum allowed p50 latency on successful runs",
    )
    parser.add_argument(
        "--p95-threshold-seconds",
        type=float,
        default=20.0,
        help="Maximum allowed p95 latency on successful runs",
    )
    parser.add_argument(
        "--failure-rate-threshold",
        type=float,
        default=0.01,
        help="Maximum allowed benchmark failure rate",
    )
    args = parser.parse_args()

    records = load_records(args.metrics)
    result, is_pass = evaluate_records(
        records,
        min_sample_size=args.min_sample_size,
        p50_threshold_seconds=args.p50_threshold_seconds,
        p95_threshold_seconds=args.p95_threshold_seconds,
        failure_rate_threshold=args.failure_rate_threshold,
    )

    Path(args.out).write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))

    if not is_pass:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
