#Fetch model metadata and write a local model manifest.

#This does not download model weights locally when using hosted models.
#It validates provider-side model availability and records versions.


from __future__ import annotations

import json
import os
from pathlib import Path

import replicate


REQUIRED_MODELS = [
	"lucataco/remove-bg",
	"andreasjansson/clip-features",
	"fofr/realvisxl-v3-multi-controlnet-lora",
	"black-forest-labs/flux-kontext-pro",
]


def _resolve_stage1_model() -> str:
	model_ref = os.getenv("TRYON_STAGE1_MODEL", "").strip()
	if not model_ref:
		raise SystemExit(
			"TRYON_STAGE1_MODEL is required for OOTDiffusion migration. "
			"Set it to your deployed OOTDiffusion model slug/version."
		)
	return model_ref


def _split_model_ref(model_ref: str) -> tuple[str, str | None]:
	"""Split owner/model[:version] into model slug and optional pinned version."""
	if ":" in model_ref:
		model_slug, pinned_version = model_ref.split(":", 1)
		return model_slug, pinned_version
	return model_ref, None


def main() -> None:
	token = os.getenv("REPLICATE_API_TOKEN")
	if not token:
		raise SystemExit("REPLICATE_API_TOKEN is required")

	client = replicate.Client(api_token=token)
	stage1_model = _resolve_stage1_model()
	model_list = [stage1_model, *REQUIRED_MODELS]
	manifest = {"stage1_tryon_model": stage1_model, "models": []}
	for model_ref in model_list:
		model_name, pinned_version = _split_model_ref(model_ref)
		model = client.models.get(model_name)
		latest = getattr(model, "latest_version", None)
		manifest["models"].append(
			{
				"name": model_name,
				"requested_ref": model_ref,
				"selected_version": pinned_version or getattr(latest, "id", None),
				"pinned_version": pinned_version,
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

