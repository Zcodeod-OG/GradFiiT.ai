"""
ALTER.AI - 5-Stage Virtual Try-On Pipeline

Stage 0: Garment Extraction (lucataco/remove-bg)
Stage 1: OOTDiffusion (configurable Replicate model) — virtual try-on
Stage 2: Quality Gate (andreasjansson/clip-features) — CLIP similarity
Stage 3: RealVisXL V3 + Multi-ControlNet (Depth + OpenPose + HED) — refinement
         Fallback: FLUX Kontext Pro — text-guided editing
Stage 4: Final Rating — reuse CLIP embeddings, map to 1-5 stars

All stages run via Replicate API. The pipeline runs synchronously
in a background thread to avoid blocking the FastAPI event loop.
"""

import logging
import time
from typing import Optional, Dict, Any, List

from app.services.replicate import get_replicate_service
from app.services.garment_processor import get_garment_processor
from app.services.quality_gate import get_quality_gate_service

logger = logging.getLogger(__name__)

# ── Refinement models ──────────────────────────────────────────
# Primary: RealVisXL V3 + Multi-ControlNet (Depth + OpenPose + Soft Edge HED)
# Photorealism-tuned SDXL checkpoint with 3 simultaneous ControlNets —
# Depth preserves 3D draping, OpenPose locks body pose, HED captures fabric folds.
REALVISXL_MULTI_CONTROLNET = "fofr/realvisxl-v3-multi-controlnet-lora"

# Fallback: FLUX Kontext Pro — text-guided editing, no ControlNet config needed
FLUX_KONTEXT_MODEL = "black-forest-labs/flux-kontext-pro"


class PipelineConfig:
    """Configuration for pipeline quality settings."""

    QUALITY_PRESETS = {
        "fast": {
            "skip_extraction": False,
            "skip_quality_gate": True,
            "skip_refinement": True,
            "skip_rating": False,
            "description": "OOTDiffusion only, no refinement",
        },
        "balanced": {
            "skip_extraction": False,
            "skip_quality_gate": False,
            "skip_refinement": False,  # Conditional on quality gate
            "skip_rating": False,
            # img2img strength — how much the refiner changes the image
            "prompt_strength": 0.30,
            "num_inference_steps": 25,
            # ControlNet conditioning scales (Depth, OpenPose, HED)
            "depth_conditioning_scale": 0.80,
            "openpose_conditioning_scale": 0.85,
            "hed_conditioning_scale": 0.65,
            "description": "Full pipeline with quality gate",
        },
        "best": {
            "skip_extraction": False,
            "skip_quality_gate": False,
            "skip_refinement": False,
            "skip_rating": False,
            "prompt_strength": 0.35,
            "num_inference_steps": 40,
            "depth_conditioning_scale": 0.85,
            "openpose_conditioning_scale": 0.90,
            "hed_conditioning_scale": 0.70,
            "description": "Full pipeline, higher quality refinement",
        },
    }

    @classmethod
    def get_preset(cls, quality: str) -> dict:
        return cls.QUALITY_PRESETS.get(quality, cls.QUALITY_PRESETS["balanced"])


class PipelineService:
    """
    Orchestrates the 5-stage virtual try-on pipeline.

    All methods are synchronous (blocking). They should be called
    from a background thread when used in an async web context.
    """

    def __init__(self):
        self.replicate_service = get_replicate_service()
        self.garment_processor = get_garment_processor()
        self.quality_gate = get_quality_gate_service()

    # ──────────────────────────────────────────────────────────
    # Stage 0: Garment Extraction
    # ──────────────────────────────────────────────────────────

    def run_stage0_garment_extraction(
        self, garment_image_url: str
    ) -> Dict[str, Any]:
        """Extract/clean garment image via background removal.

        Handles both flat-lay garment photos and person-wearing-garment
        photos by removing the background, leaving just the garment.
        """
        logger.info("Pipeline Stage 0: Starting garment extraction")
        try:
            extracted_url = self.garment_processor.remove_background(
                garment_image_url
            )
            logger.info(f"Pipeline Stage 0: Done → {extracted_url}")
            return {
                "extracted_garment_url": extracted_url,
                "status": "succeeded",
            }
        except Exception as e:
            logger.error(
                f"Pipeline Stage 0 failed: {e}. Falling back to original image."
            )
            return {
                "extracted_garment_url": garment_image_url,
                "status": "stage0_failed",
                "error": str(e),
            }

    # ──────────────────────────────────────────────────────────
    # Stage 1: OOTDiffusion
    # ──────────────────────────────────────────────────────────

    def run_stage1_oot_diffusion(
        self,
        person_image_url: str,
        garment_image_url: str,
        garment_description: str = "a garment",
        garment_category: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Run OOTDiffusion for virtual try-on."""
        logger.info("Pipeline Stage 1: Starting OOTDiffusion")
        result = self.replicate_service.generate_tryon(
            person_image_url=person_image_url,
            garment_image_url=garment_image_url,
            garment_description=garment_description,
            garment_category=garment_category,
            webhook_url=None,
        )

        output_url = result.get("output_url")
        if isinstance(output_url, list):
            output_url = output_url[0]

        logger.info(f"Pipeline Stage 1: OOTDiffusion completed → {output_url}")
        return {"output_url": output_url, "status": "succeeded"}

    # ──────────────────────────────────────────────────────────
    # Stage 2: Quality Gate
    # ──────────────────────────────────────────────────────────

    def run_stage2_quality_gate(
        self,
        garment_image_url: str,
        tryon_result_url: str,
    ) -> Dict[str, Any]:
        """Assess try-on quality using CLIP cosine similarity."""
        logger.info("Pipeline Stage 2: Starting quality gate assessment")
        try:
            evaluation = self.quality_gate.evaluate(
                garment_image_url=garment_image_url,
                tryon_result_url=tryon_result_url,
            )
            passed_str = "PASSED" if evaluation["passed"] else "FAILED"
            logger.info(
                f"Pipeline Stage 2: Quality gate {passed_str} "
                f"(score={evaluation['similarity_score']})"
            )
            return evaluation
        except Exception as e:
            logger.error(
                f"Pipeline Stage 2 failed: {e}. Assuming quality passed."
            )
            return {
                "passed": True,
                "similarity_score": None,
                "refinement_strength": 0.0,
                "garment_embedding": [],
                "result_embedding": [],
                "error": str(e),
            }

    # ──────────────────────────────────────────────────────────
    # Stage 3: Multi-ControlNet Refinement (RealVisXL V3)
    #   Fallback: FLUX Kontext Pro (text-guided editing)
    # ──────────────────────────────────────────────────────────

    def _build_refinement_prompt(
        self, garment_description: str = "a garment"
    ) -> tuple[str, str]:
        """Build prompt/negative-prompt tuned for garment refinement."""
        prompt = (
            f"professional fashion photograph of a person wearing {garment_description}, "
            "photorealistic, accurate fabric texture and weave, natural skin tones, "
            "studio lighting with soft shadows, razor-sharp garment details, "
            "correct anatomical proportions, natural clothing fit and draping, "
            "high-end fashion editorial quality, 8k detail"
        )
        negative_prompt = (
            "blurry, distorted, low quality, deformed, unrealistic, oversaturated, "
            "watermark, text, logo, cartoon, painting, illustration, 3d render, "
            "extra limbs, missing limbs, bad anatomy, disfigured, floating clothes, "
            "misaligned seams, wrong garment color, plastic skin, mannequin"
        )
        return prompt, negative_prompt

    def run_stage3_refinement(
        self,
        stage1_image_url: str,
        quality_preset: dict,
        refinement_strength: float = 0.30,
        garment_description: str = "a garment",
        refinement_mode: str = "heavy",
    ) -> Dict[str, Any]:
        """Refine try-on result using RealVisXL V3 + 3 ControlNets.

        Uses three simultaneous ControlNets on a photorealism-tuned base:
          - Depth (Midas):    preserves 3D garment draping & body volume
          - OpenPose:         locks body pose so limbs/torso stay correct
          - Soft Edge (HED):  captures organic fabric folds & wrinkles

        Falls back to FLUX Kontext Pro (text-guided editing) if the
        multi-ControlNet call fails.
        """
        logger.info(
            "Pipeline Stage 3: Starting RealVisXL Multi-ControlNet refinement "
            "(Depth + OpenPose + HED)"
        )

        prompt_strength = refinement_strength or quality_preset.get(
            "prompt_strength", 0.30
        )
        num_steps = quality_preset.get("num_inference_steps", 25)

        if refinement_mode == "light":
            prompt_strength = min(prompt_strength, 0.20)
            num_steps = min(num_steps, 16)

        depth_scale = quality_preset.get("depth_conditioning_scale", 0.80)
        openpose_scale = quality_preset.get("openpose_conditioning_scale", 0.85)
        hed_scale = quality_preset.get("hed_conditioning_scale", 0.65)

        prompt, negative_prompt = self._build_refinement_prompt(garment_description)

        # ── Attempt 1: RealVisXL V3 + Multi-ControlNet ────────
        try:
            output = self.replicate_service.run_model(
                REALVISXL_MULTI_CONTROLNET,
                {
                    # img2img: use the Stage-1 OOTDiffusion output as the starting image
                    "image": stage1_image_url,
                    "prompt": prompt,
                    "negative_prompt": negative_prompt,
                    "prompt_strength": prompt_strength,
                    "num_inference_steps": num_steps,
                    "guidance_scale": 7.5,
                    # ControlNet 1: Depth — 3D garment structure
                    "controlnet_1": "depth_midas",
                    "controlnet_1_image": stage1_image_url,
                    "controlnet_1_conditioning_scale": depth_scale,
                    "controlnet_1_start": 0.0,
                    "controlnet_1_end": 0.9,
                    # ControlNet 2: OpenPose — body pose lock
                    "controlnet_2": "openpose",
                    "controlnet_2_image": stage1_image_url,
                    "controlnet_2_conditioning_scale": openpose_scale,
                    "controlnet_2_start": 0.0,
                    "controlnet_2_end": 1.0,
                    # ControlNet 3: Soft Edge HED — organic fabric folds
                    "controlnet_3": "soft_edge_hed",
                    "controlnet_3_image": stage1_image_url,
                    "controlnet_3_conditioning_scale": hed_scale,
                    "controlnet_3_start": 0.1,
                    "controlnet_3_end": 0.8,
                    # Output config
                    "output_quality": 95,
                    "scheduler": "DPMSolverMultistep",
                },
            )

            output_url = output
            if isinstance(output_url, list):
                output_url = output_url[0]

            logger.info(
                f"Pipeline Stage 3: Multi-ControlNet refinement completed → {output_url}"
            )
            return {
                "output_url": str(output_url),
                "status": "succeeded",
                "method": "realvisxl_multi_controlnet",
                "refinement_mode": refinement_mode,
            }

        except Exception as e:
            logger.warning(
                f"Pipeline Stage 3: Multi-ControlNet failed ({e}), "
                "trying FLUX Kontext fallback..."
            )

        # ── Attempt 2: FLUX Kontext Pro (text-guided fallback) ─
        try:
            kontext_prompt = (
                f"Improve the realism of the clothing in this photo. "
                f"Make the {garment_description} look natural with proper fabric "
                f"texture, realistic wrinkles, and correct lighting. "
                f"Preserve the person's face, pose, body shape, and background exactly. "
                f"Fix any garment seam misalignment or color inaccuracy."
            )

            output = self.replicate_service.run_model(
                FLUX_KONTEXT_MODEL,
                {
                    "image": stage1_image_url,
                    "prompt": kontext_prompt,
                    "output_quality": 95,
                },
            )

            output_url = output
            if isinstance(output_url, list):
                output_url = output_url[0]

            logger.info(
                f"Pipeline Stage 3: FLUX Kontext fallback completed → {output_url}"
            )
            return {
                "output_url": str(output_url),
                "status": "succeeded",
                "method": "flux_kontext_fallback",
                "refinement_mode": refinement_mode,
            }

        except Exception as e2:
            logger.error(
                f"Pipeline Stage 3: Both refinement methods failed. "
                f"Multi-ControlNet: {e}, FLUX Kontext: {e2}. "
                f"Falling back to Stage 1 result."
            )
            return {
                "output_url": stage1_image_url,
                "status": "stage3_failed",
                "error": f"multi_cn: {e}; kontext: {e2}",
            }

    # ──────────────────────────────────────────────────────────
    # Stage 4: Final Rating
    # ──────────────────────────────────────────────────────────

    def run_stage4_rating(
        self,
        garment_embedding: List[float],
        final_image_url: str,
        result_embedding: Optional[List[float]] = None,
    ) -> Dict[str, Any]:
        """Compute the final quality rating for the try-on result.

        Reuses CLIP embeddings from the quality gate where possible
        to avoid redundant API calls.
        """
        logger.info("Pipeline Stage 4: Computing final rating")
        try:
            if not result_embedding:
                result_embedding = self.garment_processor.get_clip_embedding(
                    final_image_url
                )

            if not garment_embedding or not result_embedding:
                logger.warning("Pipeline Stage 4: Missing embeddings, skipping")
                return {"rating_score": None, "status": "skipped"}

            rating = self.quality_gate.compute_final_rating(
                garment_embedding=garment_embedding,
                final_result_embedding=result_embedding,
            )
            logger.info(f"Pipeline Stage 4: Final rating = {rating}/5.0")
            return {"rating_score": rating, "status": "succeeded"}
        except Exception as e:
            logger.error(f"Pipeline Stage 4 failed: {e}")
            return {"rating_score": None, "status": "stage4_failed", "error": str(e)}

    # ──────────────────────────────────────────────────────────
    # Full Pipeline Orchestration
    # ──────────────────────────────────────────────────────────

    def run_full_pipeline(
        self,
        person_image_url: str,
        garment_image_url: str,
        garment_description: str = "a garment",
        garment_category: Optional[str] = None,
        quality: str = "balanced",
        preprocessed_garment_url: Optional[str] = None,
        on_stage_update=None,
    ) -> Dict[str, Any]:
        """Run the complete 5-stage pipeline.

        Args:
            person_image_url: URL of the user's photo.
            garment_image_url: URL of the uploaded garment image.
            garment_description: Text description of the garment.
            quality: Quality preset — "fast", "balanced", or "best".
            on_stage_update: Callback(stage_name) for DB status tracking.

        Returns:
            Dict with all results, URLs, scores, and timing data.
        """
        preset = PipelineConfig.get_preset(quality)
        start_time = time.time()
        timings: Dict[str, float] = {}

        # ── Stage 0: Garment Extraction ──────────────────────
        extracted_garment_url = preprocessed_garment_url or garment_image_url
        skip_extraction = bool(preprocessed_garment_url) or preset.get("skip_extraction", False)

        if not skip_extraction:
            if on_stage_update:
                on_stage_update("garment_extracting")
            s0_start = time.time()
            stage0_result = self.run_stage0_garment_extraction(garment_image_url)
            timings["stage0_extraction_seconds"] = round(time.time() - s0_start, 1)
            extracted_garment_url = stage0_result["extracted_garment_url"]
            if on_stage_update:
                on_stage_update("garment_extracted")

        # ── Stage 1: OOTDiffusion ────────────────────────────
        if on_stage_update:
            on_stage_update("stage1_processing")
        s1_start = time.time()
        stage1_result = self.run_stage1_oot_diffusion(
            person_image_url=person_image_url,
            garment_image_url=extracted_garment_url,
            garment_description=garment_description,
            garment_category=garment_category,
        )
        timings["stage1_vton_seconds"] = round(time.time() - s1_start, 1)
        stage1_url = stage1_result["output_url"]
        if on_stage_update:
            on_stage_update("stage1_completed")

        # ── Stage 2: Quality Gate ────────────────────────────
        quality_gate_result = None
        garment_embedding: List[float] = []
        result_embedding: List[float] = []
        final_url = stage1_url

        if not preset.get("skip_quality_gate", False) and stage1_url:
            if on_stage_update:
                on_stage_update("quality_checking")
            s2_start = time.time()
            quality_gate_result = self.run_stage2_quality_gate(
                garment_image_url=extracted_garment_url,
                tryon_result_url=stage1_url,
            )
            timings["stage2_quality_seconds"] = round(time.time() - s2_start, 1)
            garment_embedding = quality_gate_result.get("garment_embedding", [])
            result_embedding = quality_gate_result.get("result_embedding", [])

            if quality_gate_result["passed"]:
                if on_stage_update:
                    on_stage_update("quality_passed")
            else:
                if on_stage_update:
                    on_stage_update("quality_failed")

        # ── Stage 3: Multi-ControlNet Refinement (conditional) ──
        ran_refinement = False
        refinement_mode = (
            quality_gate_result.get("refinement_mode")
            if quality_gate_result is not None
            else None
        )
        if (
            not preset.get("skip_refinement", False)
            and quality_gate_result is not None
            and quality_gate_result.get("refinement_mode") == "heavy"
            and stage1_url
        ):
            if on_stage_update:
                on_stage_update("stage2_processing")
            s3_start = time.time()
            stage3_result = self.run_stage3_refinement(
                stage1_image_url=stage1_url,
                quality_preset=preset,
                refinement_strength=quality_gate_result["refinement_strength"],
                garment_description=garment_description,
                refinement_mode=quality_gate_result.get("refinement_mode", "heavy"),
            )
            timings["stage3_refinement_seconds"] = round(time.time() - s3_start, 1)
            final_url = stage3_result["output_url"]
            ran_refinement = True
            # Clear result_embedding since the image changed
            result_embedding = []
        elif quality_gate_result is not None and refinement_mode == "light":
            # Light corrections avoid full-frame refinement to keep latency low.
            timings["stage3_refinement_seconds"] = 0.0

        # ── Stage 4: Final Rating ────────────────────────────
        rating_score = None
        if not preset.get("skip_rating", False):
            if on_stage_update:
                on_stage_update("rating_computing")
            s4_start = time.time()

            # Get garment embedding if we don't have one yet (fast preset)
            if not garment_embedding:
                garment_embedding = self.garment_processor.get_clip_embedding(
                    extracted_garment_url
                )

            # Reuse result embedding only if final_url didn't change
            reuse_emb = result_embedding if (not ran_refinement and result_embedding) else None

            stage4_result = self.run_stage4_rating(
                garment_embedding=garment_embedding,
                final_image_url=final_url,
                result_embedding=reuse_emb,
            )
            timings["stage4_rating_seconds"] = round(time.time() - s4_start, 1)
            rating_score = stage4_result.get("rating_score")

        total_time = time.time() - start_time
        timings["total_seconds"] = round(total_time, 1)

        return {
            "extracted_garment_url": extracted_garment_url,
            "stage1_url": stage1_url,
            "final_url": final_url,
            "quality": quality,
            "quality_gate_score": (
                quality_gate_result["similarity_score"]
                if quality_gate_result
                else None
            ),
            "quality_gate_metrics": {
                "clip_similarity": (
                    quality_gate_result.get("clip_similarity")
                    if quality_gate_result
                    else None
                ),
                "color_similarity": (
                    quality_gate_result.get("color_similarity")
                    if quality_gate_result
                    else None
                ),
                "edge_similarity": (
                    quality_gate_result.get("edge_similarity")
                    if quality_gate_result
                    else None
                ),
                "refinement_mode": (
                    quality_gate_result.get("refinement_mode")
                    if quality_gate_result
                    else None
                ),
            },
            "quality_gate_passed": (
                quality_gate_result["passed"]
                if quality_gate_result
                else None
            ),
            "rating_score": rating_score,
            "timings": timings,
            "stages_run": {
                "extraction": not skip_extraction,
                "vton": True,
                "quality_gate": not preset.get("skip_quality_gate", False),
                "refinement": ran_refinement,
                "rating": not preset.get("skip_rating", False),
            },
        }


_pipeline_service: Optional[PipelineService] = None


def get_pipeline_service() -> PipelineService:
    global _pipeline_service
    if _pipeline_service is None:
        _pipeline_service = PipelineService()
    return _pipeline_service
