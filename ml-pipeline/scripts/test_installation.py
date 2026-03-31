"""Smoke test for local Python environment and core dependencies."""

from __future__ import annotations

import importlib
import json
import os
import platform


REQUIRED_IMPORTS = [
	"numpy",
	"PIL",
	"requests",
	"httpx",
	"fastapi",
	"pydantic",
	"torch",
	"diffusers",
	"transformers",
	"replicate",
]


def main() -> None:
	report = {
		"python": platform.python_version(),
		"platform": platform.platform(),
		"replicate_token_present": bool(os.getenv("REPLICATE_API_TOKEN")),
		"imports": {},
	}

	failed = []
	for mod in REQUIRED_IMPORTS:
		try:
			imported = importlib.import_module(mod)
			version = getattr(imported, "__version__", "unknown")
			report["imports"][mod] = {"ok": True, "version": version}
		except Exception as exc:
			report["imports"][mod] = {"ok": False, "error": str(exc)}
			failed.append(mod)

	print(json.dumps(report, indent=2))
	if failed:
		raise SystemExit(1)


if __name__ == "__main__":
	main()

