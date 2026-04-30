"""Lazy-loading model context shared across tasks.

Loading FLUX-dev + ControlNet + SAM2 + Real-ESRGAN onto an A10G takes
~80-110 seconds and ~21GB of VRAM. We keep one process-wide singleton
that loads each component on first use and pins it in GPU memory for the
remaining endpoint lifetime. Async Inference + scale-to-zero gives us
the cost win; once warm we never pay the cold start again.
"""

from __future__ import annotations

import logging
import os
import threading
from dataclasses import dataclass, field
from typing import Any, Dict, Optional, Set

logger = logging.getLogger(__name__)


# Tasks we support — used by warmup hints to skip unrelated loaders.
TASK_TRYON = "tryon"
TASK_TRYON_V2 = "tryon_v2"  # specialized CatVTON-Flux path (~7-10s warm)
TASK_DESIGN = "design"
TASK_STYLIST = "stylist"
TASK_MASK = "mask"
TASK_UPSCALE = "upscale"


_TASK_DEPENDENCIES = {
    TASK_TRYON: {"flux", "controlnet", "ip_adapter", "sam2", "esrgan"},
    # tryon_v2 = CatVTON-Flux + SAM2 for the garment mask. No ControlNet
    # / IP-Adapter / Real-ESRGAN on the synchronous path; the user can
    # opt into upscaling via /api/tryon/{id}/upscale which routes back
    # to the legacy upscale task in this same container.
    TASK_TRYON_V2: {"catvton_flux", "sam2"},
    TASK_DESIGN: {"flux", "controlnet"},
    TASK_STYLIST: {"flux", "ip_adapter"},
    TASK_MASK: {"sam2"},
    TASK_UPSCALE: {"esrgan"},
}


@dataclass
class PipelineContext:
    """Container of lazily-loaded model handles.

    Each ``ensure_*`` method is idempotent and thread-safe. Heavy imports
    happen inside the methods (not at module import) so that ``/ping``
    can answer instantly during cold start.
    """

    device: str = "cuda"
    dtype_name: str = "bfloat16"
    s3_models_prefix: str = field(
        default_factory=lambda: os.environ.get(
            "GRADFIT_MODELS_S3_PREFIX", "s3://gradfit-models/v1/"
        )
    )
    flux_repo: str = field(
        default_factory=lambda: os.environ.get(
            "GRADFIT_FLUX_REPO", "black-forest-labs/FLUX.1-dev"
        )
    )
    default_lora_repo: str = field(
        default_factory=lambda: os.environ.get(
            "GRADFIT_DEFAULT_LORA",
            "tryonlabs/FLUX.1-dev-LoRA-Outfit-Generator",
        )
    )
    default_lora_filename: str = field(
        default_factory=lambda: os.environ.get(
            "GRADFIT_DEFAULT_LORA_FILE", "outfit-generator.safetensors"
        )
    )

    catvton_transformer_repo: str = field(
        default_factory=lambda: os.environ.get(
            "GRADFIT_CATVTON_TRANSFORMER_REPO", "xiaozaa/catvton-flux-alpha"
        )
    )
    flux_fill_repo: str = field(
        default_factory=lambda: os.environ.get(
            "GRADFIT_FLUX_FILL_REPO", "black-forest-labs/FLUX.1-Fill-dev"
        )
    )

    _flux_pipeline: Any = None
    _flux_inpaint_pipeline: Any = None
    _controlnet_canny: Any = None
    _controlnet_depth: Any = None
    _depth_estimator: Any = None
    _ip_adapter_loaded: bool = False
    _sam2_predictor: Any = None
    _esrgan_upscaler: Any = None
    _catvton_flux_pipeline: Any = None
    _loras_loaded: Set[str] = field(default_factory=set)
    _lock: threading.RLock = field(default_factory=threading.RLock)

    # ── Public ────────────────────────────────────────────────────

    def is_initialised(self) -> bool:
        """Return True once at least one heavy model has loaded.

        Used by /ping to surface warm-up state. We don't require *all*
        models to be loaded — partial warmth is still useful (mask-only
        traffic during a deploy, for example)."""
        return any(
            [
                self._flux_pipeline is not None,
                self._sam2_predictor is not None,
                self._esrgan_upscaler is not None,
                self._catvton_flux_pipeline is not None,
            ]
        )

    def warmup_for_task(self, task: str) -> None:
        deps = _TASK_DEPENDENCIES.get(task, set())
        if "flux" in deps:
            self.ensure_flux()
        if "controlnet" in deps:
            self.ensure_controlnet()
        if "ip_adapter" in deps:
            self.ensure_ip_adapter()
        if "sam2" in deps:
            self.ensure_sam2()
        if "esrgan" in deps:
            self.ensure_esrgan()
        if "catvton_flux" in deps:
            self.ensure_catvton_flux()

    # ── CatVTON-Flux (specialized try-on) ─────────────────────────

    def ensure_catvton_flux(self) -> Any:
        if self._catvton_flux_pipeline is not None:
            return self._catvton_flux_pipeline
        with self._lock:
            if self._catvton_flux_pipeline is not None:
                return self._catvton_flux_pipeline
            from .loaders import load_catvton_flux_pipeline

            self._catvton_flux_pipeline = load_catvton_flux_pipeline(
                transformer_repo=self.catvton_transformer_repo,
                flux_fill_repo=self.flux_fill_repo,
                device=self.device,
                dtype_name=self.dtype_name,
            )
        return self._catvton_flux_pipeline

    # ── FLUX (text-to-image + inpaint) ────────────────────────────

    def ensure_flux(self) -> Any:
        if self._flux_pipeline is not None:
            return self._flux_pipeline
        with self._lock:
            if self._flux_pipeline is not None:
                return self._flux_pipeline
            from .loaders import load_flux_pipeline

            self._flux_pipeline = load_flux_pipeline(
                repo=self.flux_repo,
                device=self.device,
                dtype_name=self.dtype_name,
            )
            # Apply the default clothing LoRA so design/tryon prompts speak
            # the H&M caption taxonomy out of the box.
            self._maybe_load_default_lora()
        return self._flux_pipeline

    def ensure_flux_inpaint(self) -> Any:
        if self._flux_inpaint_pipeline is not None:
            return self._flux_inpaint_pipeline
        # Reuse the text-to-image pipeline transformer/VAE/text-encoders
        # for the inpaint pipeline to avoid loading FLUX twice.
        with self._lock:
            if self._flux_inpaint_pipeline is not None:
                return self._flux_inpaint_pipeline
            base = self.ensure_flux()
            from .loaders import build_flux_inpaint_from_base

            self._flux_inpaint_pipeline = build_flux_inpaint_from_base(base)
        return self._flux_inpaint_pipeline

    # ── ControlNet (canny + depth) ────────────────────────────────

    def ensure_controlnet(self) -> Dict[str, Any]:
        if self._controlnet_canny is not None and self._controlnet_depth is not None:
            return {"canny": self._controlnet_canny, "depth": self._controlnet_depth}
        with self._lock:
            if self._controlnet_canny is None or self._controlnet_depth is None:
                from .loaders import load_flux_controlnets

                cnets = load_flux_controlnets(
                    device=self.device, dtype_name=self.dtype_name
                )
                self._controlnet_canny = cnets["canny"]
                self._controlnet_depth = cnets["depth"]
                self._depth_estimator = cnets.get("depth_estimator")
        return {"canny": self._controlnet_canny, "depth": self._controlnet_depth}

    @property
    def depth_estimator(self) -> Any:
        if self._depth_estimator is None:
            self.ensure_controlnet()
        return self._depth_estimator

    # ── IP-Adapter (image refs) ───────────────────────────────────

    def ensure_ip_adapter(self) -> bool:
        if self._ip_adapter_loaded:
            return True
        with self._lock:
            if self._ip_adapter_loaded:
                return True
            base = self.ensure_flux()
            from .loaders import attach_ip_adapter

            attach_ip_adapter(base)
            self._ip_adapter_loaded = True
        return True

    # ── SAM2 ──────────────────────────────────────────────────────

    def ensure_sam2(self) -> Any:
        if self._sam2_predictor is not None:
            return self._sam2_predictor
        with self._lock:
            if self._sam2_predictor is None:
                from .loaders import load_sam2_predictor

                self._sam2_predictor = load_sam2_predictor(
                    device=self.device, dtype_name=self.dtype_name
                )
        return self._sam2_predictor

    # ── Real-ESRGAN ───────────────────────────────────────────────

    def ensure_esrgan(self) -> Any:
        if self._esrgan_upscaler is not None:
            return self._esrgan_upscaler
        with self._lock:
            if self._esrgan_upscaler is None:
                from .loaders import load_realesrgan

                self._esrgan_upscaler = load_realesrgan(device=self.device)
        return self._esrgan_upscaler

    # ── LoRA hot-swap ─────────────────────────────────────────────

    def apply_lora(
        self,
        *,
        adapter_name: str,
        lora_uri: Optional[str],
        scale: float = 1.0,
    ) -> None:
        """Load a LoRA into the FLUX pipeline (no-op when ``lora_uri`` is
        empty). Caches loaded adapters so a second hit is free."""
        if not lora_uri:
            return
        if adapter_name in self._loras_loaded:
            return self._set_lora_scale(adapter_name, scale)
        with self._lock:
            if adapter_name in self._loras_loaded:
                return self._set_lora_scale(adapter_name, scale)
            pipe = self.ensure_flux()
            from .loaders import resolve_lora_weights

            weights_path = resolve_lora_weights(lora_uri)
            pipe.load_lora_weights(
                weights_path, adapter_name=adapter_name
            )
            self._loras_loaded.add(adapter_name)
            self._set_lora_scale(adapter_name, scale)

    def _set_lora_scale(self, adapter_name: str, scale: float) -> None:
        try:
            pipe = self._flux_pipeline
            if pipe is None:
                return
            pipe.set_adapters([adapter_name], adapter_weights=[scale])
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("Could not set LoRA scale for %s: %s", adapter_name, exc)

    def _maybe_load_default_lora(self) -> None:
        """Best-effort attach of the H&M outfit LoRA when configured."""
        repo = (self.default_lora_repo or "").strip()
        if not repo:
            return
        try:
            pipe = self._flux_pipeline
            pipe.load_lora_weights(
                repo,
                weight_name=self.default_lora_filename or None,
                adapter_name="default_outfit",
            )
            self._loras_loaded.add("default_outfit")
            self._set_lora_scale("default_outfit", 1.0)
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning(
                "Default outfit LoRA could not be loaded (%s); continuing without it",
                exc,
            )


_context_singleton: Optional[PipelineContext] = None
_context_lock = threading.RLock()


def get_pipeline_context() -> PipelineContext:
    global _context_singleton
    if _context_singleton is None:
        with _context_lock:
            if _context_singleton is None:
                _context_singleton = PipelineContext()
    return _context_singleton


__all__ = [
    "PipelineContext",
    "get_pipeline_context",
    "TASK_TRYON",
    "TASK_TRYON_V2",
    "TASK_DESIGN",
    "TASK_STYLIST",
    "TASK_MASK",
    "TASK_UPSCALE",
]
