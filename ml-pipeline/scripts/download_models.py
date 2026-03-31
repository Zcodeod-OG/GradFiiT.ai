"""Fetch model metadata and write a local model manifest.

This does not download model weights locally when using hosted models.
It validates provider-side model availability and records versions.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import replicate


REQUIRED_MODELS = [
	"lucataco/remove-bg",
	"cuuupid/idm-vton",
	"andreasjansson/clip-features",
	"fofr/realvisxl-v3-multi-controlnet-lora",
	"black-forest-labs/flux-kontext-pro",
]


def main() -> None:
	token = os.getenv("REPLICATE_API_TOKEN")
	if not token:
		raise SystemExit("REPLICATE_API_TOKEN is required")

	client = replicate.Client(api_token=token)
	manifest = {"models": []}
	for model_name in REQUIRED_MODELS:
		model = client.models.get(model_name)
		latest = getattr(model, "latest_version", None)
		manifest["models"].append(
			{
				"name": model_name,
				"latest_version": getattr(latest, "id", None),
				"owner": getattr(model, "owner", None),
				"visibility": getattr(model, "visibility", None),
			}
		)

	out_path = Path("ml-pipeline/docs/model_manifest.json")
	out_path.parent.mkdir(parents=True, exist_ok=True)
	out_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
	print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
	main()

