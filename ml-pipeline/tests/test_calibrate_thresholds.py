from __future__ import annotations

import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = ROOT / "scripts" / "calibrate_thresholds.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("calibrate_thresholds", SCRIPT_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_threshold_grid_includes_end_value() -> None:
    mod = _load_module()
    values = mod.threshold_grid(0.5, 0.55, 0.02)
    assert values == [0.5, 0.52, 0.54, 0.55]


def test_pick_best_uses_f1_then_recall_precision_accuracy() -> None:
    mod = _load_module()
    candidates = [
        {"threshold": 0.7, "f1": 0.8, "recall": 0.7, "precision": 0.9, "accuracy": 0.85},
        {"threshold": 0.68, "f1": 0.8, "recall": 0.8, "precision": 0.8, "accuracy": 0.84},
        {"threshold": 0.72, "f1": 0.79, "recall": 0.9, "precision": 0.8, "accuracy": 0.9},
    ]
    best = mod.pick_best(candidates)
    assert best["threshold"] == 0.68


def test_evaluate_threshold_counts_confusion_matrix() -> None:
    mod = _load_module()
    rows = [
        {"clip_similarity": "0.90", "color_similarity": "0.9", "edge_similarity": "0.9", "accepted": "1"},
        {"clip_similarity": "0.88", "color_similarity": "0.8", "edge_similarity": "0.8", "accepted": "1"},
        {"clip_similarity": "0.45", "color_similarity": "0.5", "edge_similarity": "0.4", "accepted": "0"},
        {"clip_similarity": "0.42", "color_similarity": "0.4", "edge_similarity": "0.4", "accepted": "0"},
    ]
    stats = mod.evaluate_threshold(rows, 0.7)
    assert stats["tp"] == 2
    assert stats["tn"] == 2
    assert stats["fp"] == 0
    assert stats["fn"] == 0
