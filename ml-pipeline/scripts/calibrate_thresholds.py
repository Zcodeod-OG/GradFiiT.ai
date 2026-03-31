"""Calibrate quality thresholds from benchmark data.

Input CSV columns expected:
- clip_similarity
- color_similarity (optional)
- edge_similarity (optional)
- accepted (0/1) or human_score (0-5)
"""

from __future__ import annotations

import argparse
import csv
import json
import math
from pathlib import Path
from typing import Any, Dict, List


def to_float(value: str, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return default


def normalize_label(row: Dict[str, str]) -> int:
    if "accepted" in row and row["accepted"].strip() != "":
        return 1 if to_float(row["accepted"]) >= 1 else 0
    if "human_score" in row and row["human_score"].strip() != "":
        return 1 if to_float(row["human_score"]) >= 3.5 else 0
    return 0


def combined_score(row: Dict[str, str]) -> float:
    clip = to_float(row.get("clip_similarity", "0"))
    color = to_float(row.get("color_similarity", ""), clip)
    edge = to_float(row.get("edge_similarity", ""), clip)
    score = clip * 0.60 + color * 0.25 + edge * 0.15
    return max(0.0, min(1.0, score))


def evaluate_threshold(rows: List[Dict[str, str]], threshold: float) -> Dict[str, float]:
    tp = fp = tn = fn = 0
    for row in rows:
        label = normalize_label(row)
        pred = 1 if combined_score(row) >= threshold else 0
        if pred == 1 and label == 1:
            tp += 1
        elif pred == 1 and label == 0:
            fp += 1
        elif pred == 0 and label == 0:
            tn += 1
        else:
            fn += 1

    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
    accuracy = (tp + tn) / max(1, tp + tn + fp + fn)
    return {
        "threshold": threshold,
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "accuracy": round(accuracy, 4),
        "tp": tp,
        "fp": fp,
        "tn": tn,
        "fn": fn,
    }


def threshold_grid(start: float, end: float, step: float) -> List[float]:
    if step <= 0:
        raise ValueError("threshold step must be > 0")
    if start <= 0 or end > 1 or start >= end:
        raise ValueError("threshold range must be within (0, 1] and start < end")

    count = int(math.floor((end - start) / step)) + 1
    values = [round(start + i * step, 6) for i in range(count)]
    if values[-1] < end:
        values.append(round(end, 6))
    return values


def pick_best(candidates: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not candidates:
        raise ValueError("no calibration candidates were generated")

    # Prefer highest F1, then higher recall, then higher precision, then higher accuracy,
    # and finally the lower threshold to reduce false negatives at decision boundary.
    sorted_candidates = sorted(
        candidates,
        key=lambda x: (
            x["f1"],
            x["recall"],
            x["precision"],
            x["accuracy"],
            -x["threshold"],
        ),
        reverse=True,
    )
    return sorted_candidates[0]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="Path to benchmark CSV")
    parser.add_argument(
        "--output",
        default="ml-pipeline/benchmarks/calibrated_thresholds.json",
        help="Output JSON file",
    )
    parser.add_argument(
        "--min-rows",
        type=int,
        default=30,
        help="Minimum number of benchmark rows required for reliable calibration",
    )
    parser.add_argument(
        "--threshold-start",
        type=float,
        default=0.50,
        help="Lower bound for threshold search",
    )
    parser.add_argument(
        "--threshold-end",
        type=float,
        default=0.95,
        help="Upper bound for threshold search",
    )
    parser.add_argument(
        "--threshold-step",
        type=float,
        default=0.01,
        help="Step size for threshold search",
    )
    args = parser.parse_args()

    rows: List[Dict[str, str]] = []
    with open(args.input, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)

    if not rows:
        raise SystemExit("No benchmark rows found")
    if len(rows) < args.min_rows:
        raise SystemExit(
            f"Need at least {args.min_rows} rows for calibration, found {len(rows)}"
        )

    grid = threshold_grid(args.threshold_start, args.threshold_end, args.threshold_step)
    candidates: List[Dict[str, Any]] = []
    for t in grid:
        stats = evaluate_threshold(rows, t)
        candidates.append(stats)

    best = pick_best(candidates)
    thresholds = {
        "excellent": round(best["threshold"], 2),
        "acceptable": round(max(0.45, best["threshold"] - 0.10), 2),
        "poor": round(max(0.35, best["threshold"] - 0.20), 2),
    }

    positive_labels = sum(1 for row in rows if normalize_label(row) == 1)
    negative_labels = len(rows) - positive_labels

    output = {
        "rows": len(rows),
        "label_balance": {
            "positive": positive_labels,
            "negative": negative_labels,
        },
        "search": {
            "start": args.threshold_start,
            "end": args.threshold_end,
            "step": args.threshold_step,
            "candidates": len(candidates),
        },
        "best": best,
        "recommended_thresholds": thresholds,
    }

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
