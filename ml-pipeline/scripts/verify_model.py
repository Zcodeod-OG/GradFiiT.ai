"""Verify required model accessibility and manifest consistency."""

from __future__ import annotations

import json
import os
from pathlib import Path

import replicate


def main() -> None:
	token = os.getenv("REPLICATE_API_TOKEN")
	if not token:
		raise SystemExit("REPLICATE_API_TOKEN is required")

	manifest_path = Path("ml-pipeline/docs/model_manifest.json")
	if not manifest_path.exists():
		raise SystemExit("model_manifest.json not found. Run download_models.py first.")

	data = json.loads(manifest_path.read_text(encoding="utf-8"))
	client = replicate.Client(api_token=token)

	report = {"verified": [], "failed": []}
	for item in data.get("models", []):
		model_name = item["name"]
		try:
			model = client.models.get(model_name)
			latest = getattr(model, "latest_version", None)
			report["verified"].append(
				{
					"name": model_name,
					"latest_version": getattr(latest, "id", None),
				}
			)
		except Exception as exc:
			report["failed"].append({"name": model_name, "error": str(exc)})

	print(json.dumps(report, indent=2))
	if report["failed"]:
		raise SystemExit(1)


if __name__ == "__main__":
	main()

