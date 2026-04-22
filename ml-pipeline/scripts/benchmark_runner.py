"""Benchmark runner for GradFiT virtual try-on pipeline.

Reads JSONL input where each line has:
- person_image_url
- garment_id
- quality (optional)
- idempotency_key (optional)
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


TERMINAL_STATUSES = {"completed", "failed", "dead_letter"}
SUCCESS_STATUSES = {"completed"}
FAILURE_STATUSES = {
    "failed",
    "dead_letter",
    "timeout",
    "http_error",
    "request_error",
    "response_error",
    "exception",
    "unknown",
}


def build_session() -> requests.Session:
    """Build a requests session with conservative retries for transient errors."""
    retry = Retry(
        total=3,
        connect=3,
        read=3,
        backoff_factor=0.4,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=("GET", "POST"),
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry)
    session = requests.Session()
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    return session


def normalize_status(value: Any) -> str:
    if value is None:
        return "unknown"
    text = str(value).strip().lower()
    return text if text else "unknown"


def safe_json(response: requests.Response) -> Dict[str, Any]:
    try:
        data = response.json()
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def is_failure_status(status: str) -> bool:
    status = normalize_status(status)
    if status in FAILURE_STATUSES:
        return True
    if status in SUCCESS_STATUSES:
        return False
    return True


def run_case(
    session: requests.Session,
    base_url: str,
    token: str,
    case: Dict[str, Any],
    idx: int,
    poll_interval_seconds: float,
    poll_timeout_seconds: int,
    request_timeout_seconds: int,
    max_poll_errors: int,
) -> Dict[str, object]:
    headers = {"Authorization": f"Bearer {token}"}
    if case.get("idempotency_key"):
        headers["X-Idempotency-Key"] = str(case["idempotency_key"])

    payload = {
        "garment_id": int(case["garment_id"]),
        "person_image_url": case["person_image_url"],
        "quality": case.get("quality", "auto"),
    }

    started = time.time()
    tryon_id: Optional[int] = None
    status_payload: Dict[str, Any] = {}

    try:
        create_resp = session.post(
            f"{base_url}/api/tryon/generate",
            json=payload,
            headers=headers,
            timeout=request_timeout_seconds,
        )
        create_resp.raise_for_status()
        create_data = safe_json(create_resp).get("data") or {}
        tryon_id = create_data.get("tryon_id")
        if tryon_id is None:
            raise ValueError("Missing tryon_id in generate response")
    except requests.HTTPError as exc:
        ended = time.time()
        response = exc.response
        response_body = safe_json(response) if response is not None else {}
        return {
            "case_index": idx,
            "tryon_id": None,
            "status": "http_error",
            "wall_time_seconds": round(ended - started, 2),
            "http_status": response.status_code if response is not None else None,
            "phase": "create",
            "error_message": (
                response_body.get("detail")
                if isinstance(response_body.get("detail"), str)
                else str(exc)
            )[:500],
        }
    except requests.RequestException as exc:
        ended = time.time()
        return {
            "case_index": idx,
            "tryon_id": None,
            "status": "request_error",
            "wall_time_seconds": round(ended - started, 2),
            "phase": "create",
            "error_message": str(exc)[:500],
        }
    except Exception as exc:
        ended = time.time()
        return {
            "case_index": idx,
            "tryon_id": None,
            "status": "response_error",
            "wall_time_seconds": round(ended - started, 2),
            "phase": "create",
            "error_message": str(exc)[:500],
        }

    deadline = time.time() + poll_timeout_seconds
    poll_errors = 0
    last_poll_error = ""
    while time.time() < deadline:
        try:
            status_resp = session.get(
                f"{base_url}/api/tryon/status/{tryon_id}",
                headers=headers,
                timeout=request_timeout_seconds,
            )
            status_resp.raise_for_status()
            payload_data = safe_json(status_resp).get("data")
            if isinstance(payload_data, dict):
                status_payload = payload_data
            current_status = normalize_status(status_payload.get("status"))
            if current_status in TERMINAL_STATUSES:
                break
        except requests.RequestException as exc:
            poll_errors += 1
            last_poll_error = str(exc)
            if poll_errors >= max_poll_errors:
                status_payload = {
                    "status": "request_error",
                    "error_message": f"Polling failed repeatedly: {last_poll_error}"[:500],
                }
                break
        time.sleep(poll_interval_seconds)

    ended = time.time()
    final_status = normalize_status(status_payload.get("status"))
    if final_status not in TERMINAL_STATUSES and final_status not in {"request_error"}:
        final_status = "timeout"
        status_payload.setdefault(
            "error_message",
            f"Polling exceeded timeout of {poll_timeout_seconds} seconds",
        )

    return {
        "case_index": idx,
        "tryon_id": tryon_id,
        "status": final_status,
        "lifecycle_status": status_payload.get("lifecycle_status"),
        "wall_time_seconds": round(ended - started, 2),
        "queue_wait_ms": status_payload.get("queue_wait_ms"),
        "execution_ms": status_payload.get("execution_ms"),
        "total_latency_ms": status_payload.get("total_latency_ms"),
        "quality_gate_score": status_payload.get("quality_gate_score"),
        "error_message": status_payload.get("error_message"),
        "phase": "status",
    }


def build_summary(results: List[Dict[str, object]]) -> Dict[str, object]:
    status_counts: Dict[str, int] = {}
    failure_count = 0
    for result in results:
        status = normalize_status(result.get("status"))
        status_counts[status] = status_counts.get(status, 0) + 1
        if is_failure_status(status):
            failure_count += 1

    sample_size = len(results)
    success_count = sample_size - failure_count
    failure_rate = (failure_count / sample_size) if sample_size else 1.0
    return {
        "sample_size": sample_size,
        "success_count": success_count,
        "failure_count": failure_count,
        "failure_rate": round(failure_rate, 4),
        "status_counts": status_counts,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--token", required=True)
    parser.add_argument("--input", required=True, help="JSONL benchmark cases")
    parser.add_argument(
        "--output",
        default="ml-pipeline/benchmarks/benchmark_results.json",
        help="Benchmark results output file",
    )
    parser.add_argument(
        "--poll-interval-seconds",
        type=float,
        default=2.5,
        help="Polling interval in seconds",
    )
    parser.add_argument(
        "--poll-timeout-seconds",
        type=int,
        default=420,
        help="Max seconds to wait for a terminal status per case",
    )
    parser.add_argument(
        "--request-timeout-seconds",
        type=int,
        default=30,
        help="HTTP timeout in seconds for API calls",
    )
    parser.add_argument(
        "--max-poll-errors",
        type=int,
        default=3,
        help="Max consecutive polling errors before failing a case",
    )
    parser.add_argument(
        "--max-cases",
        type=int,
        default=0,
        help="Optional cap on number of input cases (0 means all)",
    )
    parser.add_argument(
        "--fail-on-errors",
        action="store_true",
        help="Return exit code 1 when any benchmark case fails",
    )
    args = parser.parse_args()

    cases: List[Dict[str, Any]] = []
    with open(args.input, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            cases.append(json.loads(line))

    if args.max_cases > 0:
        cases = cases[: args.max_cases]

    session = build_session()
    results: List[Dict[str, object]] = []
    for i, case in enumerate(cases):
        try:
            results.append(
                run_case(
                    session=session,
                    base_url=args.base_url,
                    token=args.token,
                    case=case,
                    idx=i,
                    poll_interval_seconds=args.poll_interval_seconds,
                    poll_timeout_seconds=args.poll_timeout_seconds,
                    request_timeout_seconds=args.request_timeout_seconds,
                    max_poll_errors=args.max_poll_errors,
                )
            )
        except Exception as exc:
            results.append(
                {
                    "case_index": i,
                    "tryon_id": None,
                    "status": "exception",
                    "wall_time_seconds": 0.0,
                    "error_message": str(exc)[:500],
                }
            )

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(results, indent=2), encoding="utf-8")
    summary = build_summary(results)
    print(json.dumps({"summary": summary, "results": results}, indent=2))

    if args.fail_on_errors and summary["failure_count"] > 0:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
