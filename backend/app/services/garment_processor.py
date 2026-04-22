"""
GradFiT - Garment Processing Service

Handles garment image processing via Replicate API:
- Background removal (lucataco/remove-bg)
- CLIP embedding extraction (andreasjansson/clip-features)
- Garment type classification via CLIP zero-shot
- Local image optimization (Pillow)
"""

import logging
import io
import hashlib
from typing import Optional, List

from PIL import Image
import numpy as np

from app.config import settings
from app.services.cache import get_cache_service
from app.services.replicate import get_replicate_service

logger = logging.getLogger(__name__)

# Replicate model versions
REMOVE_BG_MODEL = "lucataco/remove-bg:95fcc2a26d3899cd6c2691c900c28f59f3af085583b285b70eb42720f3d84ec7"
CLIP_FEATURES_MODEL = "andreasjansson/clip-features:75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a"

# Garment type labels for CLIP zero-shot classification
GARMENT_CATEGORIES = [
    ("a photograph of an upper body garment like a shirt, blouse, or top", "upper_body"),
    ("a photograph of lower body clothing like pants, trousers, or a skirt", "lower_body"),
    ("a photograph of a full body outfit or dress", "full_body"),
    ("a photograph of a jacket, coat, or outerwear", "outerwear"),
    ("a photograph of a fashion accessory like a bag, hat, or shoes", "accessory"),
]


class GarmentProcessor:
    """Service for processing garment images.

    All methods are synchronous (blocking). They should be called
    from a background thread when used in an async web context.
    """

    def __init__(self):
        self.replicate_service = get_replicate_service()

    def process_garment_image(self, image_bytes: bytes) -> bytes:
        """Process garment image locally (resize, optimize).

        Args:
            image_bytes: Raw image bytes.

        Returns:
            Optimized JPEG bytes.
        """
        image = Image.open(io.BytesIO(image_bytes))
        if image.mode != "RGB":
            image = image.convert("RGB")
        max_size = 2048
        if max(image.size) > max_size:
            image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
        output = io.BytesIO()
        image.save(output, format="JPEG", quality=85, optimize=True)
        return output.getvalue()

    def _key(self, prefix: str, payload: str) -> str:
        digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()
        return f"gradfit:{prefix}:{digest}"

    def remove_background(self, image_url: str) -> str:
        """Remove background from a garment image using Replicate remove-bg.

        Works for both flat-lay garment photos and person-wearing-garment
        photos. OOTDiffusion handles on-body references well, so a clean
        background-removed image is sufficient for garment extraction.

        Args:
            image_url: Public URL of the image.

        Returns:
            URL of the background-removed image (hosted by Replicate).
        """
        logger.info(f"remove_background: Processing {image_url}")
        cache = get_cache_service()
        cache_key = self._key("remove_bg", image_url)

        cached = cache.get_json(cache_key)
        if isinstance(cached, str) and cached:
            logger.info("remove_background: Cache hit")
            return cached

        try:
            output = self.replicate_service.run_model(
                REMOVE_BG_MODEL,
                {"image": image_url},
            )
            result_url = str(output)
            cache.set_json(
                cache_key,
                result_url,
                settings.ARTIFACT_CACHE_TTL_SECONDS,
            )
            logger.info(f"remove_background: Done → {result_url}")
            return result_url
        except Exception as e:
            logger.error(f"remove_background failed: {e}")
            raise

    def get_clip_embedding(self, image_url: str) -> List[float]:
        """Get CLIP image embedding vector for an image.

        Args:
            image_url: Public URL of the image.

        Returns:
            List of floats representing the 512-dim CLIP embedding.
        """
        logger.info(f"get_clip_embedding: Processing {image_url}")
        cache = get_cache_service()
        cache_key = self._key("clip_embedding", image_url)

        cached = cache.get_json(cache_key)
        if isinstance(cached, list) and cached:
            logger.info("get_clip_embedding: Cache hit")
            return [float(v) for v in cached]

        try:
            output = self.replicate_service.run_model(
                CLIP_FEATURES_MODEL,
                {"inputs": image_url},
            )
            # The model returns a list of dicts with "embedding" key
            if isinstance(output, list) and len(output) > 0:
                embedding = output[0].get("embedding", [])
                if embedding:
                    cache.set_json(
                        cache_key,
                        embedding,
                        settings.EMBEDDING_CACHE_TTL_SECONDS,
                    )
                logger.info(f"get_clip_embedding: Got {len(embedding)}-dim vector")
                return embedding
            logger.warning("get_clip_embedding: Unexpected output format")
            return []
        except Exception as e:
            logger.error(f"get_clip_embedding failed: {e}")
            raise

    def classify_garment(self, image_url: str) -> str:
        """Classify garment type using CLIP zero-shot classification.

        Compares the image embedding against text embeddings for each
        garment category and returns the best match.

        Args:
            image_url: Public URL of the garment image.

        Returns:
            One of: upper_body, lower_body, full_body, outerwear, accessory
        """
        logger.info(f"classify_garment: Classifying {image_url}")
        cache = get_cache_service()
        cache_key = self._key("garment_class", image_url)
        cached = cache.get_json(cache_key)
        if isinstance(cached, str) and cached:
            logger.info("classify_garment: Cache hit")
            return cached

        try:
            # Get image embedding
            image_embedding = self.get_clip_embedding(image_url)
            if not image_embedding:
                return "upper_body"  # safe default

            image_vec = np.array(image_embedding)
            best_score = -1.0
            best_category = "upper_body"

            for text_prompt, category_name in GARMENT_CATEGORIES:
                text_output = self.replicate_service.run_model(
                    CLIP_FEATURES_MODEL,
                    {"inputs": text_prompt},
                )
                if isinstance(text_output, list) and len(text_output) > 0:
                    text_vec = np.array(text_output[0].get("embedding", []))
                    if text_vec.size > 0 and image_vec.size > 0:
                        similarity = float(
                            np.dot(image_vec, text_vec)
                            / (np.linalg.norm(image_vec) * np.linalg.norm(text_vec))
                        )
                        if similarity > best_score:
                            best_score = similarity
                            best_category = category_name

            logger.info(f"classify_garment: {best_category} (score={best_score:.3f})")
            cache.set_json(
                cache_key,
                best_category,
                settings.ARTIFACT_CACHE_TTL_SECONDS,
            )
            return best_category
        except Exception as e:
            logger.error(f"classify_garment failed: {e}")
            return "upper_body"  # safe default


_garment_processor: Optional[GarmentProcessor] = None


def get_garment_processor() -> GarmentProcessor:
    """Get singleton instance of GarmentProcessor."""
    global _garment_processor
    if _garment_processor is None:
        _garment_processor = GarmentProcessor()
    return _garment_processor
