from __future__ import annotations

import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = ROOT / "scripts" / "benchmark_runner.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("benchmark_runner", SCRIPT_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_normalize_status_handles_empty_values() -> None:
    mod = _load_module()
    assert mod.normalize_status(None) == "unknown"
    assert mod.normalize_status("   ") == "unknown"
    assert mod.normalize_status("Completed") == "completed"


def test_build_summary_counts_failure_statuses() -> None:
    mod = _load_module()
    results = [
        {"status": "completed"},
        {"status": "failed"},
        {"status": "timeout"},
        {"status": "http_error"},
    ]

    summary = mod.build_summary(results)
    assert summary["sample_size"] == 4
    assert summary["success_count"] == 1
    assert summary["failure_count"] == 3
    assert summary["failure_rate"] == 0.75
