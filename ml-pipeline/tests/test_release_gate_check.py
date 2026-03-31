from __future__ import annotations

import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = ROOT / "scripts" / "release_gate_check.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("release_gate_check", SCRIPT_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_percentile_uses_nearest_rank_for_tail() -> None:
    mod = _load_module()
    values = [6.2, 7.1, 8.8, 11.3]
    assert mod.percentile(values, 0.95) == 11.3


def test_gate_fails_for_small_sample_and_high_failure_rate() -> None:
    mod = _load_module()
    records = [
        {"status": "completed", "wall_time_seconds": 6.1},
        {"status": "completed", "wall_time_seconds": 7.2},
        {"status": "completed", "wall_time_seconds": 7.9},
        {"status": "failed", "wall_time_seconds": 9.5},
    ]

    report, is_pass = mod.evaluate_records(
        records,
        min_sample_size=100,
        p50_threshold_seconds=8.0,
        p95_threshold_seconds=20.0,
        failure_rate_threshold=0.01,
    )

    assert is_pass is False
    assert report["gates"]["sample_size_minimum"] is False
    assert report["gates"]["failure_rate_under_threshold"] is False
    assert report["failure_rate"] == 0.25


def test_gate_fails_when_non_terminal_status_present() -> None:
    mod = _load_module()
    records = [
        {"status": "completed", "wall_time_seconds": 6.0},
        {"status": "processing", "wall_time_seconds": 12.0},
    ]

    report, is_pass = mod.evaluate_records(
        records,
        min_sample_size=2,
        p50_threshold_seconds=15.0,
        p95_threshold_seconds=20.0,
        failure_rate_threshold=0.5,
    )

    assert is_pass is False
    assert report["gates"]["all_cases_terminal"] is False
