"""
GradFiT - Quality Gate Service

Evaluates virtual try-on output quality using CLIP cosine similarity.
Also computes the final 1-5 star rating for completed try-ons.
"""

import logging
import io
from typing import Dict, Any, List, Optional

import numpy as np
import requests
from PIL import Image

from app.config import settings
from app.services.garment_processor import get_garment_processor

logger = logging.getLogger(__name__)

# Configurable quality thresholds
QUALITY_THRESHOLDS = {
    "excellent": settings.QUALITY_THRESHOLD_EXCELLENT,
    "acceptable": settings.QUALITY_THRESHOLD_ACCEPTABLE,
    "poor": settings.QUALITY_THRESHOLD_POOR,
}


class QualityGateService:
    """Evaluates Stage-1 try-on output quality using CLIP similarity."""

    def __init__(self):
        self.garment_processor = get_garment_processor()

    def compute_cosine_similarity(
        self, embedding_a: List[float], embedding_b: List[float]
    ) -> float:
        """Compute cosine similarity between two embedding vectors.

        Args:
            embedding_a: First CLIP embedding vector.
            embedding_b: Second CLIP embedding vector.

        Returns:
            Cosine similarity in range [-1, 1]. Higher = more similar.
        """
        a = np.array(embedding_a, dtype=np.float32)
        b = np.array(embedding_b, dtype=np.float32)
        if a.size == 0 or b.size == 0:
            logger.warning("compute_cosine_similarity: Empty embedding(s)")
            return 0.0
        norm_a = np.linalg.norm(a)
        norm_b = np.linalg.norm(b)
        if norm_a == 0.0 or norm_b == 0.0:
            return 0.0
        return float(np.dot(a, b) / (norm_a * norm_b))

    def _load_image_rgb(self, image_url: str) -> Optional[np.ndarray]:
        """Load a remote image and return RGB uint8 array."""
        try:
            response = requests.get(image_url, timeout=8)
            response.raise_for_status()
            img = Image.open(io.BytesIO(response.content)).convert("RGB")
            img = img.resize((384, 384), Image.Resampling.BILINEAR)
            return np.array(img, dtype=np.uint8)
        except Exception:
            return None

    def _color_hist_similarity(
        self,
        image_a: np.ndarray,
        image_b: np.ndarray,
    ) -> float:
        """Compare color distributions to preserve garment identity cues."""
        scores: List[float] = []
        for ch in range(3):
            hist_a, _ = np.histogram(image_a[:, :, ch], bins=32, range=(0, 255), density=True)
            hist_b, _ = np.histogram(image_b[:, :, ch], bins=32, range=(0, 255), density=True)
            denom = np.linalg.norm(hist_a) * np.linalg.norm(hist_b)
            if denom == 0:
                scores.append(0.0)
            else:
                scores.append(float(np.dot(hist_a, hist_b) / denom))
        return float(np.clip(np.mean(scores), 0.0, 1.0))

    def _edge_similarity(
        self,
        image_a: np.ndarray,
        image_b: np.ndarray,
    ) -> float:
        """Compare edge patterns as a weak structure-preservation signal."""
        gray_a = image_a.mean(axis=2).astype(np.float32)
        gray_b = image_b.mean(axis=2).astype(np.float32)

        gx_a = np.abs(np.gradient(gray_a, axis=1))
        gy_a = np.abs(np.gradient(gray_a, axis=0))
        gx_b = np.abs(np.gradient(gray_b, axis=1))
        gy_b = np.abs(np.gradient(gray_b, axis=0))

        edge_a = gx_a + gy_a
        edge_b = gx_b + gy_b

        flat_a = edge_a.flatten()
        flat_b = edge_b.flatten()
        denom = np.linalg.norm(flat_a) * np.linalg.norm(flat_b)
        if denom == 0:
            return 0.0
        return float(np.clip(np.dot(flat_a, flat_b) / denom, 0.0, 1.0))

    def _compute_combined_score(
        self,
        clip_similarity: float,
        color_similarity: Optional[float],
        edge_similarity: Optional[float],
    ) -> float:
        """Blend multimodal signals into one quality score."""
        if color_similarity is None or edge_similarity is None:
            return float(np.clip(clip_similarity, 0.0, 1.0))

        combined = (
            clip_similarity * 0.60
            + color_similarity * 0.25
            + edge_similarity * 0.15
        )
        return float(np.clip(combined, 0.0, 1.0))

    def evaluate(
        self,
        garment_image_url: str,
        tryon_result_url: str,
        garment_embedding: Optional[List[float]] = None,
    ) -> Dict[str, Any]:
        """Evaluate quality of a try-on result vs the original garment.

        Computes CLIP embeddings for both images (or reuses a cached
        garment embedding) and measures cosine similarity.

        Args:
            garment_image_url: URL of the original/extracted garment.
            tryon_result_url: URL of the Stage-1 try-on output.
            garment_embedding: Pre-computed garment embedding (optional).

        Returns:
            Dict with:
                passed: bool — did it meet the "excellent" threshold?
                similarity_score: float — raw cosine similarity (0-1)
                refinement_strength: float — suggested SDXL strength
                garment_embedding: list — cached for reuse in rating
                result_embedding: list — cached for reuse in rating
        """
        logger.info("QualityGate: Evaluating try-on quality")

        # Get embeddings (reuse garment embedding if provided)
        if garment_embedding is None:
            garment_embedding = self.garment_processor.get_clip_embedding(
                garment_image_url
            )
        result_embedding = self.garment_processor.get_clip_embedding(tryon_result_url)

        clip_similarity = self.compute_cosine_similarity(garment_embedding, result_embedding)

        garment_img = self._load_image_rgb(garment_image_url)
        tryon_img = self._load_image_rgb(tryon_result_url)

        color_similarity: Optional[float] = None
        edge_similarity: Optional[float] = None
        if garment_img is not None and tryon_img is not None:
            color_similarity = self._color_hist_similarity(garment_img, tryon_img)
            edge_similarity = self._edge_similarity(garment_img, tryon_img)

        combined_score = self._compute_combined_score(
            clip_similarity,
            color_similarity,
            edge_similarity,
        )

        passed = combined_score >= QUALITY_THRESHOLDS["excellent"]

        if combined_score >= QUALITY_THRESHOLDS["excellent"]:
            refinement_mode = "none"
            refinement_strength = 0.0
        elif combined_score >= QUALITY_THRESHOLDS["acceptable"]:
            refinement_mode = "light"
            refinement_strength = 0.18
        else:
            refinement_mode = "heavy"
            refinement_strength = 0.38

        logger.info(
            "QualityGate: clip=%.4f, color=%s, edge=%s, combined=%.4f, "
            "passed=%s, refinement_mode=%s, refinement_strength=%.2f",
            clip_similarity,
            f"{color_similarity:.4f}" if color_similarity is not None else "n/a",
            f"{edge_similarity:.4f}" if edge_similarity is not None else "n/a",
            combined_score,
            passed,
            refinement_mode,
            refinement_strength,
        )

        return {
            "passed": passed,
            "similarity_score": round(combined_score, 4),
            "clip_similarity": round(clip_similarity, 4),
            "color_similarity": round(color_similarity, 4) if color_similarity is not None else None,
            "edge_similarity": round(edge_similarity, 4) if edge_similarity is not None else None,
            "refinement_mode": refinement_mode,
            "refinement_strength": refinement_strength,
            "garment_embedding": garment_embedding,
            "result_embedding": result_embedding,
        }

    def compute_final_rating(
        self,
        garment_embedding: List[float],
        final_result_embedding: List[float],
    ) -> float:
        """Compute final 1.0-5.0 star rating for a try-on result.

        Maps CLIP cosine similarity (typically 0.55-0.90 for fashion
        images) to a human-friendly 1-5 star scale.

        Args:
            garment_embedding: CLIP embedding of the original garment.
            final_result_embedding: CLIP embedding of the final result.

        Returns:
            Rating from 1.0 to 5.0.
        """
        similarity = self.compute_cosine_similarity(
            garment_embedding, final_result_embedding
        )
        # Map similarity to 1-5 scale:
        # 0.90+ → 5.0, 0.80 → 3.0, 0.70 → 2.0, 0.60 → 1.0
        rating = max(1.0, min(5.0, (similarity - 0.50) * 10.0))
        logger.info(
            f"FinalRating: similarity={similarity:.4f} → rating={rating:.2f}"
        )
        return round(rating, 2)


_quality_gate_service: Optional[QualityGateService] = None


def get_quality_gate_service() -> QualityGateService:
    """Get singleton instance of QualityGateService."""
    global _quality_gate_service
    if _quality_gate_service is None:
        _quality_gate_service = QualityGateService()
    return _quality_gate_service
