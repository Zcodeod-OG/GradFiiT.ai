"""Pre-download model weights for the GradFiT serving image.

Run this once during the SageMaker model-data preparation step so the
endpoint doesn't have to fetch ~30GB of weights on first invocation.

Usage:

    python scripts/download_models.py \\
        --hf-token $HUGGINGFACE_TOKEN \\
        --target /opt/ml/model

The script writes:
    {target}/hf_cache       — diffusers/transformers cache (FLUX, IP-Adapter, ControlNets)
    {target}/sam2/          — SAM2 large checkpoint
    {target}/realesrgan/    — RealESRGAN_x4plus.pth
"""

from __future__ import annotations

import argparse
import os
import pathlib
import urllib.request

SAM2_URL = (
    "https://dl.fbaipublicfiles.com/segment_anything_2/072824/sam2_hiera_large.pt"
)
ESRGAN_URL = (
    "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/"
    "RealESRGAN_x4plus.pth"
)


def download(url: str, target: pathlib.Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        print(f"[skip] {target}")
        return
    print(f"[get]  {url} -> {target}")
    urllib.request.urlretrieve(url, target)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", default="/opt/ml/model")
    parser.add_argument("--hf-token", default=os.environ.get("HUGGINGFACE_TOKEN"))
    parser.add_argument(
        "--flux-repo", default="black-forest-labs/FLUX.1-dev"
    )
    parser.add_argument(
        "--flux-fill-repo", default="black-forest-labs/FLUX.1-Fill-dev"
    )
    parser.add_argument(
        "--catvton-transformer-repo", default="xiaozaa/catvton-flux-alpha"
    )
    parser.add_argument(
        "--default-lora",
        default="tryonlabs/FLUX.1-dev-LoRA-Outfit-Generator",
    )
    parser.add_argument(
        "--skip-legacy",
        action="store_true",
        help=(
            "Skip ControlNet / IP-Adapter / depth-estimator / default-LoRA. "
            "Use this for tryon_v2-only deployments to halve cold-start "
            "model-data size (CatVTON-Flux is ~24GB on its own)."
        ),
    )
    args = parser.parse_args()

    root = pathlib.Path(args.target)
    hf_cache = root / "hf_cache"
    hf_cache.mkdir(parents=True, exist_ok=True)
    os.environ["HF_HOME"] = str(hf_cache)

    # SAM2 + Real-ESRGAN are direct downloads (used by tryon_v2 mask + opt-in upscale).
    download(SAM2_URL, root / "sam2" / "sam2_hiera_large.pt")
    download(ESRGAN_URL, root / "realesrgan" / "RealESRGAN_x4plus.pth")

    from huggingface_hub import snapshot_download

    # CatVTON-Flux: the transformer-only checkpoint that pairs with FLUX-Fill.
    print(f"[hf]  {args.catvton_transformer_repo}")
    snapshot_download(
        repo_id=args.catvton_transformer_repo,
        cache_dir=str(hf_cache),
        token=args.hf_token,
    )
    print(f"[hf]  {args.flux_fill_repo}")
    snapshot_download(
        repo_id=args.flux_fill_repo,
        cache_dir=str(hf_cache),
        token=args.hf_token,
        ignore_patterns=["*.bin"],
    )

    if args.skip_legacy:
        print("[done] tryon_v2-only models prepared at", root)
        return

    # Legacy FLUX path used by `tryon`, `design`, `stylist` tasks.
    print(f"[hf]  {args.flux_repo}")
    snapshot_download(
        repo_id=args.flux_repo,
        cache_dir=str(hf_cache),
        token=args.hf_token,
        ignore_patterns=["*.bin"],
    )
    print(f"[hf]  {args.default_lora}")
    snapshot_download(
        repo_id=args.default_lora,
        cache_dir=str(hf_cache),
        token=args.hf_token,
    )
    for repo in [
        "InstantX/FLUX.1-dev-Controlnet-Canny",
        "Shakker-Labs/FLUX.1-dev-ControlNet-Depth",
        "XLabs-AI/flux-ip-adapter",
        "openai/clip-vit-large-patch14",
        "LiheYoung/depth-anything-base-hf",
    ]:
        print(f"[hf]  {repo}")
        snapshot_download(repo_id=repo, cache_dir=str(hf_cache), token=args.hf_token)

    print("[done] models prepared at", root)


if __name__ == "__main__":
    main()
