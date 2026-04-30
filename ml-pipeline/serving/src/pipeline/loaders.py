"""Heavy model loaders. Imported lazily by :mod:`context`."""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


def _torch_dtype(name: str):
    import torch

    return {
        "float16": torch.float16,
        "fp16": torch.float16,
        "bfloat16": torch.bfloat16,
        "bf16": torch.bfloat16,
        "float32": torch.float32,
    }.get(name.lower(), torch.bfloat16)


# ── FLUX ──────────────────────────────────────────────────────────────


def load_flux_pipeline(*, repo: str, device: str, dtype_name: str) -> Any:
    """Load FLUX.1-dev (text-to-image) and move it to ``device``."""
    import torch
    from diffusers import FluxPipeline

    dtype = _torch_dtype(dtype_name)
    logger.info("Loading FLUX pipeline from %s (dtype=%s)", repo, dtype_name)
    pipe = FluxPipeline.from_pretrained(
        repo,
        torch_dtype=dtype,
        cache_dir=os.environ.get("HF_HOME"),
        token=os.environ.get("HUGGINGFACE_TOKEN"),
    )
    if device == "cuda" and torch.cuda.is_available():
        pipe = pipe.to(device)
        # Reduce VRAM footprint on g5.2xlarge (24GB). Sequential CPU
        # offload on the text encoders only — we keep the transformer
        # and VAE pinned to GPU for inference latency.
        try:
            pipe.enable_model_cpu_offload()
        except Exception:
            logger.warning(
                "FLUX cpu offload unavailable; running fully on GPU."
            )
    try:
        pipe.enable_xformers_memory_efficient_attention()
    except Exception:
        # FLUX often ships with native scaled-dot-product attention; xformers
        # is a nice-to-have. Continue silently.
        pass
    return pipe


def build_flux_inpaint_from_base(base: Any) -> Any:
    """Build a FluxInpaintPipeline that shares weights with the base."""
    from diffusers import FluxInpaintPipeline

    return FluxInpaintPipeline(
        scheduler=base.scheduler,
        vae=base.vae,
        text_encoder=base.text_encoder,
        tokenizer=base.tokenizer,
        text_encoder_2=base.text_encoder_2,
        tokenizer_2=base.tokenizer_2,
        transformer=base.transformer,
    )


# ── ControlNet ────────────────────────────────────────────────────────


def load_flux_controlnets(*, device: str, dtype_name: str) -> Dict[str, Any]:
    """Load FLUX ControlNets (canny + depth) and the depth estimator.

    Uses InstantX's union ControlNet for FLUX as the canonical option;
    falls back to silently disabling ControlNet support if loading fails
    (the pipeline still produces images, just without conditioning).
    """
    import torch

    dtype = _torch_dtype(dtype_name)
    out: Dict[str, Any] = {}
    try:
        from diffusers import FluxControlNetModel

        canny = FluxControlNetModel.from_pretrained(
            "InstantX/FLUX.1-dev-Controlnet-Canny",
            torch_dtype=dtype,
            cache_dir=os.environ.get("HF_HOME"),
        )
        depth = FluxControlNetModel.from_pretrained(
            "Shakker-Labs/FLUX.1-dev-ControlNet-Depth",
            torch_dtype=dtype,
            cache_dir=os.environ.get("HF_HOME"),
        )
        if device == "cuda" and torch.cuda.is_available():
            canny = canny.to(device)
            depth = depth.to(device)
        out["canny"] = canny
        out["depth"] = depth
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("FLUX ControlNets unavailable: %s", exc)

    try:
        from transformers import pipeline as hf_pipeline

        depth_estimator = hf_pipeline(
            "depth-estimation",
            model="LiheYoung/depth-anything-base-hf",
            device=0 if device == "cuda" else -1,
        )
        out["depth_estimator"] = depth_estimator
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("Depth estimator unavailable: %s", exc)

    return out


# ── IP-Adapter ────────────────────────────────────────────────────────


def attach_ip_adapter(pipe: Any) -> None:
    """Attach the FLUX IP-Adapter (style + face refs).

    Best-effort: if loading fails we log and continue. The studio APIs
    surface a ``has_ip_adapter`` flag in their response so the frontend
    can hide reference dropzones gracefully.
    """
    try:
        pipe.load_ip_adapter(
            "XLabs-AI/flux-ip-adapter",
            weight_name="ip_adapter.safetensors",
            image_encoder_pretrained_model_name_or_path="openai/clip-vit-large-patch14",
        )
        pipe.set_ip_adapter_scale(0.6)
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("IP-Adapter could not be attached: %s", exc)


# ── SAM2 ──────────────────────────────────────────────────────────────


def load_sam2_predictor(*, device: str, dtype_name: str) -> Any:
    """Load Meta's SAM2 image predictor (large)."""
    import torch
    from sam2.build_sam import build_sam2
    from sam2.sam2_image_predictor import SAM2ImagePredictor

    checkpoint = os.environ.get(
        "GRADFIT_SAM2_CHECKPOINT",
        "/opt/ml/model/sam2/sam2_hiera_large.pt",
    )
    config = os.environ.get(
        "GRADFIT_SAM2_CONFIG",
        "sam2_hiera_l.yaml",
    )
    dtype = _torch_dtype(dtype_name)
    logger.info("Loading SAM2 (cfg=%s, ckpt=%s)", config, checkpoint)
    sam2 = build_sam2(config, checkpoint, device=device)
    if device == "cuda" and torch.cuda.is_available():
        sam2 = sam2.to(dtype=dtype)
    return SAM2ImagePredictor(sam2)


# ── Real-ESRGAN ───────────────────────────────────────────────────────


def load_realesrgan(*, device: str) -> Any:
    """Load Real-ESRGAN x4plus."""
    from basicsr.archs.rrdbnet_arch import RRDBNet
    from realesrgan import RealESRGANer

    weights_path = os.environ.get(
        "GRADFIT_ESRGAN_WEIGHTS",
        "/opt/ml/model/realesrgan/RealESRGAN_x4plus.pth",
    )
    model = RRDBNet(
        num_in_ch=3,
        num_out_ch=3,
        num_feat=64,
        num_block=23,
        num_grow_ch=32,
        scale=4,
    )
    return RealESRGANer(
        scale=4,
        model_path=weights_path,
        model=model,
        tile=512,
        tile_pad=10,
        pre_pad=0,
        half=device == "cuda",
        device=device,
    )


# ── LoRA helpers ──────────────────────────────────────────────────────


def resolve_lora_weights(lora_uri: str) -> str:
    """Resolve a LoRA reference (HF repo or s3:// URI) to a local path
    or a HuggingFace identifier consumable by ``load_lora_weights``."""
    parsed = urlparse(lora_uri)
    if parsed.scheme == "s3":
        from .io import download_s3_to_local

        local = download_s3_to_local(lora_uri)
        return local
    # diffusers can load directly from a HF repo id
    return lora_uri


# ── CatVTON-Flux (specialized try-on) ─────────────────────────────────


def load_catvton_flux_pipeline(
    *,
    transformer_repo: str,
    flux_fill_repo: str,
    device: str,
    dtype_name: str,
) -> Any:
    """Load CatVTON-Flux (xiaozaa/catvton-flux-alpha + FLUX.1-Fill-dev).

    CatVTON-Flux is a FluxTransformer2DModel checkpoint fine-tuned for
    in-context virtual try-on. We swap it into a stock FluxFillPipeline
    so the rest of the FLUX runtime (VAE, schedulers, text encoders) is
    canonical and we get torch.compile, xformers etc. for free.

    Memory footprint at bf16 on g5.2xlarge (24GB A10G):
      VAE + text encoders (CPU offloaded): 0
      CatVTON transformer (pinned)       : ~12GB
      Activation/KV cache at 1536x1024   : ~6GB
      Headroom                           : ~6GB

    We enable model_cpu_offload so the text encoders move to CPU between
    requests, keeping the transformer pinned for sub-step latency.
    """
    import torch
    from diffusers import FluxFillPipeline, FluxTransformer2DModel

    dtype = _torch_dtype(dtype_name)
    cache_dir = os.environ.get("HF_HOME")
    token = os.environ.get("HUGGINGFACE_TOKEN")

    logger.info(
        "Loading CatVTON transformer from %s (dtype=%s)", transformer_repo, dtype_name
    )
    transformer = FluxTransformer2DModel.from_pretrained(
        transformer_repo,
        torch_dtype=dtype,
        cache_dir=cache_dir,
        token=token,
    )

    logger.info(
        "Loading FLUX-Fill base from %s, swapping in CatVTON transformer",
        flux_fill_repo,
    )
    pipe = FluxFillPipeline.from_pretrained(
        flux_fill_repo,
        transformer=transformer,
        torch_dtype=dtype,
        cache_dir=cache_dir,
        token=token,
    )

    if device == "cuda" and torch.cuda.is_available():
        pipe = pipe.to(device)
        try:
            pipe.enable_model_cpu_offload()
        except Exception:
            logger.warning(
                "CatVTON-Flux cpu offload unavailable; running fully on GPU."
            )
    try:
        pipe.enable_xformers_memory_efficient_attention()
    except Exception:
        # Diffusers' native SDPA is fine when xformers isn't built for the
        # current torch version.
        pass

    return pipe


__all__ = [
    "load_flux_pipeline",
    "build_flux_inpaint_from_base",
    "load_flux_controlnets",
    "attach_ip_adapter",
    "load_sam2_predictor",
    "load_realesrgan",
    "load_catvton_flux_pipeline",
    "resolve_lora_weights",
]
