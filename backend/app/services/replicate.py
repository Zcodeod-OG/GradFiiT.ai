"""
AULTER.AI - Replicate Service
Handles virtual try-on generation using Replicate API
"""

import logging
import os
import time
from typing import Dict, Any, Optional, List
import replicate
from replicate.exceptions import ReplicateError

from app.config import get_settings
from app.services.storage import get_storage

logger = logging.getLogger(__name__)
settings = get_settings()


class ReplicateService:
    """
    Service for interacting with Replicate API for virtual try-on.
    """

    def __init__(self):
        """Initialize Replicate service."""
        self.api_token = ""
        self.client: Optional[replicate.Client] = None
        self._refresh_client(force=True)

    @staticmethod
    def _normalize_token(raw: Optional[str]) -> str:
        return (raw or "").strip().strip('"\'')

    def _resolve_api_token(self) -> str:
        """Resolve API token from settings/env, supporting legacy key names."""
        candidates = [
            settings.REPLICATE_API_TOKEN,
            os.getenv("REPLICATE_API_TOKEN"),
            os.getenv("REPLICATE_API_KEY"),
        ]
        for candidate in candidates:
            normalized = self._normalize_token(candidate)
            if normalized:
                return normalized
        return ""

    def _refresh_client(self, force: bool = False) -> None:
        token = self._resolve_api_token()
        token_changed = token != self.api_token

        if force or token_changed or self.client is None:
            self.api_token = token
            self.client = replicate.Client(api_token=token) if token else None
            if token:
                # Keep module-level replicate.run calls authenticated as well.
                os.environ["REPLICATE_API_TOKEN"] = token

        if not self.api_token:
            logger.warning("⚠️  REPLICATE_API_TOKEN not set")

    @staticmethod
    def _is_auth_error(details: str) -> bool:
        lowered = (details or "").lower()
        return "unauthenticated" in lowered or "authentication token" in lowered

    @staticmethod
    def _is_rate_limited(details: str) -> bool:
        lowered = (details or "").lower()
        return "status: 429" in lowered or "throttled" in lowered or "rate limit" in lowered

    def _ensure_client(self) -> replicate.Client:
        if not self.client:
            self._refresh_client(force=True)
        if not self.client:
            raise RuntimeError("Replicate is not configured. Set REPLICATE_API_TOKEN.")
        return self.client

    def _resolve_stage1_model(self) -> str:
        model_ref = (settings.TRYON_STAGE1_MODEL or "").strip()
        if not model_ref or model_ref.upper().startswith("CHANGE_ME"):
            raise RuntimeError(
                "TRYON_STAGE1_MODEL is not configured. "
                "Set it to your OOTDiffusion model slug or version."
            )
        return model_ref

    def _normalize_oot_category(self, garment_category: Optional[str]) -> str:
        raw = (garment_category or settings.OOT_DIFFUSION_DEFAULT_CATEGORY or "upperbody").strip().lower()

        lower_tokens = {"pant", "pants", "trouser", "trousers", "jean", "jeans", "skirt", "short", "shorts", "lower", "bottom"}
        dress_tokens = {"dress", "gown", "jumpsuit", "kurta"}

        if any(token in raw for token in dress_tokens):
            return "dress"
        if any(token in raw for token in lower_tokens):
            return "lowerbody"
        if raw in {"upperbody", "lowerbody", "dress"}:
            return raw
        return "upperbody"

    @staticmethod
    def _is_input_schema_error(details: str) -> bool:
        lowered = details.lower()
        schema_markers = [
            "validation",
            "invalid input",
            "unexpected",
            "required",
            "unknown field",
            "field",
        ]
        hard_fail_markers = [
            "unauthenticated",
            "insufficient credit",
            "payment required",
            "rate limit",
            "not found",
        ]
        if any(marker in lowered for marker in hard_fail_markers):
            return False
        return any(marker in lowered for marker in schema_markers)

    def _build_oot_input_candidates(
        self,
        person_image_url: str,
        garment_image_url: str,
        garment_category: str,
    ) -> List[Dict[str, Any]]:
        # The pinned default model `viktorfa/oot_diffusion` only accepts
        # `model_image` + `garment_image` (+ optional steps/guidance_scale/seed).
        # Cog rejects unknown fields with 422, so the primary candidate must
        # match that schema exactly. The remaining shapes are legacy fallbacks
        # for other OOT-style community models that some deployments may pin.
        primary = {
            "model_image": person_image_url,
            "garment_image": garment_image_url,
            "steps": 20,
            "guidance_scale": 2,
        }
        legacy_with_category = {
            "model_image": person_image_url,
            "garment_image": garment_image_url,
            "category": garment_category,
        }
        legacy_garm_img = {
            "model_img": person_image_url,
            "garm_img": garment_image_url,
            "category": garment_category,
        }
        legacy_human_img = {
            "human_img": person_image_url,
            "garm_img": garment_image_url,
            "category": garment_category,
        }
        return [primary, legacy_with_category, legacy_garm_img, legacy_human_img]

    def run_model(self, model_ref: str, input_data: Dict[str, Any]):
        """Run a Replicate model with token refresh/retry on auth failure."""
        max_attempts = 3
        for attempt in range(1, max_attempts + 1):
            try:
                return self._ensure_client().run(model_ref, input=input_data)
            except ReplicateError as exc:
                details = str(exc)
                if self._is_auth_error(details) and attempt < max_attempts:
                    logger.warning(
                        "Replicate auth error for model %s, refreshing token/client and retrying (attempt %s/%s)",
                        model_ref,
                        attempt + 1,
                        max_attempts,
                    )
                    self._refresh_client(force=True)
                    continue

                if self._is_rate_limited(details) and attempt < max_attempts:
                    backoff_seconds = min(12, 3 * attempt)
                    logger.warning(
                        "Replicate rate-limited for model %s; retrying in %ss (attempt %s/%s)",
                        model_ref,
                        backoff_seconds,
                        attempt + 1,
                        max_attempts,
                    )
                    time.sleep(backoff_seconds)
                    continue

                raise

    def _to_provider_access_url(self, image_url: str) -> str:
        """Ensure provider can access private bucket objects via signed URL."""
        if not image_url:
            return image_url

        try:
            converted = get_storage().to_provider_access_url(image_url)
            if converted and converted != image_url:
                logger.info("Converted provider input URL to presigned S3 URL")
            return converted or image_url
        except Exception as exc:
            logger.warning("Failed to convert provider input URL, using original: %s", exc)
            return image_url
    
    def generate_tryon(
        self,
        person_image_url: str,
        garment_image_url: str,
        garment_description: str = "a garment",
        garment_category: Optional[str] = None,
        webhook_url: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generate Stage-1 virtual try-on using OOTDiffusion on Replicate.
        
        Args:
            person_image_url: URL to person image
            garment_image_url: URL to garment image
            garment_description: Description of garment
            garment_category: Garment category hint for OOTDiffusion
            webhook_url: Optional webhook URL for async results
            
        Returns:
            Dictionary with prediction info
            
        Raises:
            ReplicateError: If API call fails
        """
        try:
            person_image_url = self._to_provider_access_url(person_image_url)
            garment_image_url = self._to_provider_access_url(garment_image_url)

            logger.info("🎨 Starting OOTDiffusion try-on generation")
            logger.info(f"   Person: {person_image_url}")
            logger.info(f"   Garment: {garment_image_url}")

            model_ref = self._resolve_stage1_model()
            oot_category = self._normalize_oot_category(garment_category or garment_description)
            input_candidates = self._build_oot_input_candidates(
                person_image_url=person_image_url,
                garment_image_url=garment_image_url,
                garment_category=oot_category,
            )
            
            # Run prediction
            if webhook_url:
                if ":" not in model_ref:
                    raise RuntimeError(
                        "Webhook mode requires TRYON_STAGE1_MODEL to include a pinned version."
                    )

                last_error: Exception | None = None
                for idx, input_data in enumerate(input_candidates, start=1):
                    try:
                        try:
                            prediction = self._ensure_client().predictions.create(
                                version=model_ref,
                                input=input_data,
                                webhook=webhook_url,
                                webhook_events_filter=["completed"],
                            )
                        except ReplicateError as auth_exc:
                            details = str(auth_exc)
                            if self._is_auth_error(details):
                                logger.warning("Replicate auth error, refreshing token/client and retrying once")
                                self._refresh_client(force=True)
                                prediction = self._ensure_client().predictions.create(
                                    version=model_ref,
                                    input=input_data,
                                    webhook=webhook_url,
                                    webhook_events_filter=["completed"],
                                )
                            else:
                                raise

                        logger.info("✅ Async OOT prediction created: %s", prediction.id)
                        return {
                            "prediction_id": prediction.id,
                            "status": prediction.status,
                            "webhook_url": webhook_url,
                            "async": True,
                            "stage1_model": model_ref,
                            "input_schema_attempt": idx,
                            "oot_category": oot_category,
                        }
                    except ReplicateError as exc:
                        last_error = exc
                        details = str(exc)
                        if idx < len(input_candidates) and self._is_input_schema_error(details):
                            logger.warning(
                                "OOT schema attempt %s rejected, trying next schema",
                                idx,
                            )
                            continue
                        raise
                if last_error:
                    raise last_error
                raise RuntimeError("Failed to run OOTDiffusion prediction")
            else:
                # Synchronous
                logger.info("⏳ Running synchronous OOT prediction...")

                last_error: Exception | None = None
                for idx, input_data in enumerate(input_candidates, start=1):
                    try:
                        output = self.run_model(model_ref, input_data)

                        logger.info("✅ OOT prediction complete")

                        return {
                            "output_url": output,
                            "status": "succeeded",
                            "async": False,
                            "stage1_model": model_ref,
                            "input_schema_attempt": idx,
                            "oot_category": oot_category,
                        }
                    except ReplicateError as exc:
                        last_error = exc
                        details = str(exc)
                        if idx < len(input_candidates) and self._is_input_schema_error(details):
                            logger.warning(
                                "OOT schema attempt %s rejected, trying next schema",
                                idx,
                            )
                            continue
                        raise
                if last_error:
                    raise last_error
                raise RuntimeError("Failed to run OOTDiffusion prediction")
                
        except ReplicateError as e:
            details = str(e)
            if "Unauthenticated" in details or "authentication token" in details.lower():
                logger.error("❌ Replicate authentication failed. Check REPLICATE_API_TOKEN validity.")
            else:
                logger.error(f"❌ Replicate API error: {details}")
            raise
            
        except Exception as e:
            logger.error(f"❌ Unexpected error: {str(e)}")
            raise
    
    def get_prediction(self, prediction_id: str) -> Dict[str, Any]:
        """
        Get status of a prediction.
        
        Args:
            prediction_id: Replicate prediction ID
            
        Returns:
            Prediction status and output
        """
        try:
            prediction = self._ensure_client().predictions.get(prediction_id)
            
            return {
                "id": prediction.id,
                "status": prediction.status,
                "output": prediction.output,
                "error": prediction.error,
                "logs": prediction.logs,
                "metrics": prediction.metrics,
            }
            
        except Exception as e:
            logger.error(f"❌ Failed to get prediction: {str(e)}")
            raise
    
    def cancel_prediction(self, prediction_id: str) -> bool:
        """
        Cancel a running prediction.
        
        Args:
            prediction_id: Replicate prediction ID
            
        Returns:
            True if cancelled successfully
        """
        try:
            prediction = self._ensure_client().predictions.get(prediction_id)
            prediction.cancel()
            
            logger.info(f"✅ Prediction cancelled: {prediction_id}")
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to cancel prediction: {str(e)}")
            return False


# Singleton instance
_replicate_service: Optional[ReplicateService] = None


def get_replicate_service() -> ReplicateService:
    """Get singleton instance of ReplicateService."""
    global _replicate_service
    
    if _replicate_service is None:
        _replicate_service = ReplicateService()
    
    return _replicate_service


__all__ = ["ReplicateService", "get_replicate_service"]