"""GradFiT - Face Processor (CLIP-based identity comparison)

Light wrapper that crops a face from an image (via the existing YOLO11
pose keypoints, which include the 5 face landmarks), uploads the crop to
S3, and asks ``GarmentProcessor.get_clip_embedding`` for a vector. We
then compare two crops via cosine similarity to detect identity drift
between the input person photo and the VTON output.

Why CLIP and not ArcFace?
* ArcFace pretrained weights from the InsightFace package require a
  paid commercial license. The Apache/MIT-clean ArcFace ports we audited
  either lack solid pretrained weights or rely on datasets with
  non-commercial restrictions.
* CLIP is already wired through ``GarmentProcessor`` and shares its
  Redis embedding cache, so this stays cheap.
* CLIP face similarity is a noisier signal than ArcFace (~0.78 cosine
  is a reasonable "same person" threshold versus ~0.4 for ArcFace),
  but it's directionally correct and ships today. Upgrade path is
  isolated to this file.
"""

from __future__ import annotations

import hashlib
import io
import logging
import math
from typing import Any, Dict, List, Optional, Sequence, Tuple

import httpx

try:
    from PIL import Image  # type: ignore
except ImportError:  # pragma: no cover
    Image = None  # type: ignore

from app.config import settings
from app.services.storage import get_storage
from app.services.yolo_pose import get_yolo_pose_service

logger = logging.getLogger(__name__)


# Face landmarks live at COCO keypoint indexes 0-4 (nose, eyes, ears).
_FACE_KP_INDEXES = (0, 1, 2, 3, 4)
_KP_CONFIDENCE_THRESHOLD = 0.30
_DOWNLOAD_TIMEOUT = 20

# Padding around the face bbox: face crops with a bit of forehead/chin
# context embed more reliably than tight nose-only crops.
_FACE_CROP_PADDING = 0.45


def cosine_similarity(a: Sequence[float], b: Sequence[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(float(x) * float(y) for x, y in zip(a, b))
    norm_a = math.sqrt(sum(float(x) * float(x) for x in a))
    norm_b = math.sqrt(sum(float(y) * float(y) for y in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


class FaceProcessor:
    """Crop faces and embed them via CLIP for identity comparison."""

    def __init__(self) -> None:
        self._storage = get_storage()
        self._client = httpx.Client(timeout=_DOWNLOAD_TIMEOUT, follow_redirects=True)

    def crop_face_url(self, image_url: str) -> Optional[str]:
        """Detect the face on ``image_url`` and return a URL to the crop.

        Returns ``None`` when no confident face landmarks are detected,
        when the image fails to download, or when YOLO11 is not
        available. Callers must treat this as best-effort.
        """
        if Image is None or not image_url:
            return None

        pose = self._safe_pose(image_url)
        if not pose:
            return None

        bbox = self._face_bbox(pose)
        if bbox is None:
            return None

        try:
            data, _ = self._download(image_url)
            image = Image.open(io.BytesIO(data))
            image.load()
            if image.mode != "RGB":
                image = image.convert("RGB")
        except Exception as exc:
            logger.warning("FaceProcessor: download/decode failed for %s (%s)", image_url, exc)
            return None

        try:
            return self._crop_and_upload(image, bbox)
        except Exception as exc:
            logger.warning("FaceProcessor: crop/upload failed for %s (%s)", image_url, exc)
            return None

    def embed_face(self, image_url: str) -> Optional[List[float]]:
        """Return the CLIP embedding of the face crop, or ``None`` on failure."""
        crop_url = self.crop_face_url(image_url)
        if not crop_url:
            return None
        try:
            from app.services.garment_processor import get_garment_processor

            return get_garment_processor().get_clip_embedding(crop_url)
        except Exception as exc:
            logger.warning("FaceProcessor: CLIP embed failed for %s (%s)", crop_url, exc)
            return None

    def compare(
        self,
        *,
        reference_image_url: str,
        candidate_image_url: str,
        reference_embedding: Optional[Sequence[float]] = None,
        reference_face_url: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Return ``{similarity, reference_face_url, candidate_face_url}``.

        ``similarity`` is in ``[-1, 1]`` (CLIP cosine). When either crop
        fails we surface ``similarity=None`` and the caller should treat
        that as "unknown" rather than "drifted".

        When ``reference_embedding`` is supplied (e.g. from the user's
        cached default-person-photo embedding) we skip the reference
        crop + embed roundtrip entirely. ``reference_face_url`` is
        optional metadata returned to callers that want to surface the
        previously-cached crop URL.
        """
        cand_url = self.crop_face_url(candidate_image_url)

        result: Dict[str, Any] = {
            "similarity": None,
            "reference_face_url": reference_face_url,
            "candidate_face_url": cand_url,
        }

        ref_emb: Optional[List[float]]
        if reference_embedding is not None:
            ref_emb = list(reference_embedding)
            result["reference_source"] = "cached"
        else:
            ref_url = self.crop_face_url(reference_image_url)
            result["reference_face_url"] = ref_url
            if not ref_url:
                result["reason"] = "missing_face_crop"
                return result
            try:
                from app.services.garment_processor import get_garment_processor

                ref_emb = get_garment_processor().get_clip_embedding(ref_url)
            except Exception as exc:
                logger.warning("FaceProcessor: ref embed failed (%s)", exc)
                result["reason"] = "embed_failed"
                result["error"] = str(exc)
                return result

        if not cand_url:
            result["reason"] = "missing_face_crop"
            return result

        try:
            from app.services.garment_processor import get_garment_processor

            cand_emb = get_garment_processor().get_clip_embedding(cand_url)
        except Exception as exc:
            logger.warning("FaceProcessor: cand embed failed (%s)", exc)
            result["reason"] = "embed_failed"
            result["error"] = str(exc)
            return result

        if not ref_emb or not cand_emb:
            result["reason"] = "empty_embedding"
            return result

        result["similarity"] = round(cosine_similarity(ref_emb, cand_emb), 4)
        return result

    # ── Internals ─────────────────────────────────────────────

    def _safe_pose(self, image_url: str) -> Optional[Dict[str, Any]]:
        try:
            return get_yolo_pose_service().estimate_pose(image_url)
        except Exception as exc:  # pragma: no cover
            logger.warning("FaceProcessor: pose service raised (%s)", exc)
            return None

    @staticmethod
    def _face_bbox(pose: Dict[str, Any]) -> Optional[Tuple[float, float, float, float]]:
        """Return (x_min, y_min, x_max, y_max) in source-image pixel space."""
        keypoints = pose.get("keypoints") or []
        confidences = pose.get("confidences") or []
        if not keypoints:
            return None

        face_pts: List[Tuple[float, float]] = []
        for idx in _FACE_KP_INDEXES:
            if idx >= len(keypoints):
                continue
            kp = keypoints[idx]
            if not isinstance(kp, (list, tuple)) or len(kp) < 2:
                continue
            if confidences and len(confidences) > idx:
                if float(confidences[idx] or 0) < _KP_CONFIDENCE_THRESHOLD:
                    continue
            x, y = float(kp[0]), float(kp[1])
            if x <= 0 and y <= 0:
                continue
            face_pts.append((x, y))

        if len(face_pts) < 2:
            return None

        xs = [p[0] for p in face_pts]
        ys = [p[1] for p in face_pts]
        x_min, x_max = min(xs), max(xs)
        y_min, y_max = min(ys), max(ys)

        # Face landmarks are clustered tightly; expand from the cluster
        # centroid into a square-ish region.
        width = max(20.0, x_max - x_min)
        height = max(20.0, y_max - y_min)
        side = max(width, height)
        cx = (x_min + x_max) / 2
        cy = (y_min + y_max) / 2

        return (cx - side / 2, cy - side / 2, cx + side / 2, cy + side / 2)

    def _crop_and_upload(
        self, image: "Image.Image", bbox: Tuple[float, float, float, float]
    ) -> Optional[str]:
        w, h = image.size
        x_min, y_min, x_max, y_max = bbox
        bw = x_max - x_min
        bh = y_max - y_min
        pad_x = bw * _FACE_CROP_PADDING
        pad_y = bh * _FACE_CROP_PADDING

        crop_box = (
            int(max(0, x_min - pad_x)),
            int(max(0, y_min - pad_y)),
            int(min(w, x_max + pad_x)),
            int(min(h, y_max + pad_y)),
        )
        if crop_box[2] - crop_box[0] < 32 or crop_box[3] - crop_box[1] < 32:
            return None

        face = image.crop(crop_box)
        # Standardise to 224 on the long edge so CLIP sees a similar size
        # regardless of the source resolution.
        face.thumbnail((224, 224), Image.Resampling.LANCZOS)

        buffer = io.BytesIO()
        face.save(buffer, format="JPEG", quality=92, optimize=True)
        blob = buffer.getvalue()

        sha = hashlib.sha256(blob).hexdigest()
        key = f"tryon_postprocess/face_crops/{sha}.jpg"
        bucket = self._storage.bucket_name
        s3 = self._storage.s3_client
        try:
            s3.head_object(Bucket=bucket, Key=key)
        except Exception:
            s3.put_object(
                Bucket=bucket,
                Key=key,
                Body=blob,
                ContentType="image/jpeg",
                CacheControl="public, max-age=86400",
            )
        return f"https://{bucket}.s3.{settings.AWS_REGION}.amazonaws.com/{key}"

    def _download(self, url: str) -> Tuple[bytes, str]:
        response = self._client.get(url)
        response.raise_for_status()
        return response.content, response.headers.get("content-type", "").lower()


_face_processor: Optional[FaceProcessor] = None


def get_face_processor() -> FaceProcessor:
    global _face_processor
    if _face_processor is None:
        _face_processor = FaceProcessor()
    return _face_processor


__all__ = ["FaceProcessor", "get_face_processor", "cosine_similarity"]
