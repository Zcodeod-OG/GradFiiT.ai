"""GradFiT - Try-On Input Quality Gate (Layer 1)

Sits between the preprocessor and the VTON provider. Its job is to catch
inputs that are guaranteed to produce a bad try-on (sideways selfies,
heavy motion blur, half-body crops, low-resolution thumbnails) BEFORE we
spend a Fashn credit on them, and to give the model a denser portrait
crop when pose detection finds a clear person bbox.

Design notes
------------
* All checks are best-effort. If YOLO11 is unavailable or pose detection
  fails, the gate degrades to a "passed=True, gate=skipped" result -- we
  never want a missing optional dependency to break the runner.
* Hard-fail behaviour is opt-in via ``INPUT_GATE_HARD_FAIL``. Default is
  warn-only so we can collect rejection signal in production without
  blocking users.
* Smart crop is computed from the YOLO11 person bbox derived from the
  visible keypoints. We pad by ``INPUT_GATE_SMART_CROP_PADDING`` (8% by
  default) and re-upload to the same SHA-keyed S3 path the preprocessor
  uses, so repeat runs are free.
"""

from __future__ import annotations

import hashlib
import io
import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import httpx

try:
    import numpy as np  # type: ignore
except ImportError:  # pragma: no cover - numpy is a hard dep but be safe
    np = None  # type: ignore

try:
    from PIL import Image, ImageFilter  # type: ignore
except ImportError:  # pragma: no cover
    Image = None  # type: ignore
    ImageFilter = None  # type: ignore

from app.config import settings
from app.services.storage import get_storage
from app.services.yolo_pose import get_yolo_pose_service

logger = logging.getLogger(__name__)


# YOLO11-pose returns the standard 17 COCO keypoints. Indexes 0-4 cover
# the face (nose, eyes, ears); 5-10 the upper body (shoulders, elbows,
# wrists); 11-16 the lower body (hips, knees, ankles). We consider a
# keypoint "visible" when its confidence >= _KP_CONFIDENCE_THRESHOLD.
_KP_CONFIDENCE_THRESHOLD = 0.35
_FACE_KP_INDEXES = {0, 1, 2, 3, 4}
_UPPER_KP_INDEXES = {5, 6, 7, 8, 9, 10}
_LOWER_KP_INDEXES = {11, 12, 13, 14, 15, 16}

_DOWNLOAD_TIMEOUT = 20


@dataclass
class InputGateResult:
    """What the gate returns to the runner.

    Attributes
    ----------
    passed
        True when all enabled checks succeeded (or the gate was skipped).
    person_image_url
        Either the original URL or the smart-cropped URL when a tighter
        portrait crop was produced. Always safe to forward to the provider.
    smart_cropped
        True when ``person_image_url`` is the new smart-cropped artifact.
    reasons
        Human-readable explanation of any failed checks. Surfaced to the
        user when ``INPUT_GATE_HARD_FAIL`` is true.
    metrics
        Numeric signals captured for observability (blur var, body
        coverage, face visibility, bbox).
    """

    passed: bool
    person_image_url: str
    smart_cropped: bool = False
    reasons: List[str] = field(default_factory=list)
    metrics: Dict[str, Any] = field(default_factory=dict)


class InputGateError(RuntimeError):
    """Raised by the runner when ``INPUT_GATE_HARD_FAIL=true`` and the gate failed."""


class TryOnInputGate:
    """Layer 1 quality gate for the person image."""

    def __init__(self) -> None:
        self._storage = get_storage()
        self._client = httpx.Client(timeout=_DOWNLOAD_TIMEOUT, follow_redirects=True)

    def validate(self, person_image_url: str) -> InputGateResult:
        if not settings.INPUT_GATE_ENABLED:
            return InputGateResult(
                passed=True,
                person_image_url=person_image_url,
                metrics={"gate": "disabled"},
            )

        if not person_image_url:
            return InputGateResult(
                passed=False,
                person_image_url=person_image_url or "",
                reasons=["missing_person_image_url"],
            )

        if Image is None or np is None:
            # Pillow / numpy missing -> degrade open. The provider will
            # still surface a real error if the URL is broken.
            return InputGateResult(
                passed=True,
                person_image_url=person_image_url,
                metrics={"gate": "skipped_pillow_unavailable"},
            )

        # Download the person image once -- we share the bytes across
        # blur measurement and the smart crop step.
        try:
            data, _ = self._download(person_image_url)
            image = Image.open(io.BytesIO(data))
            image.load()
            if image.mode != "RGB":
                image = image.convert("RGB")
        except Exception as exc:
            logger.warning("InputGate: could not load %s (%s)", person_image_url, exc)
            return InputGateResult(
                passed=True,  # let the downstream provider handle it
                person_image_url=person_image_url,
                metrics={"gate": "skipped_download_failed", "error": str(exc)},
            )

        reasons: List[str] = []
        metrics: Dict[str, Any] = {"gate": "evaluated"}

        # 1. Blur (Laplacian variance). Cheap, local, decent rule of thumb.
        blur_var = self._estimate_blur(image)
        metrics["blur_var"] = round(blur_var, 2)
        if (
            settings.INPUT_GATE_MIN_BLUR_VAR > 0
            and blur_var < settings.INPUT_GATE_MIN_BLUR_VAR
        ):
            reasons.append(
                f"image_too_blurry (laplacian_var={blur_var:.1f}, "
                f"min={settings.INPUT_GATE_MIN_BLUR_VAR})"
            )

        # 2. Pose-driven body coverage + face visibility + person bbox.
        pose = self._safe_pose(person_image_url)
        coverage = 0.0
        face_visible = False
        bbox: Optional[Tuple[int, int, int, int]] = None
        if pose:
            keypoints = pose.get("keypoints") or []
            confidences = pose.get("confidences") or []
            visible_idxs = self._visible_keypoint_indexes(keypoints, confidences)
            if keypoints:
                coverage = len(visible_idxs) / float(len(keypoints))
            face_visible = bool(visible_idxs & _FACE_KP_INDEXES)
            bbox = self._bbox_from_keypoints(keypoints, confidences, image.size)
            metrics["pose_engine"] = pose.get("engine")
            metrics["body_coverage"] = round(coverage, 3)
            metrics["face_visible"] = face_visible
            metrics["upper_body_visible"] = bool(visible_idxs & _UPPER_KP_INDEXES)
            metrics["lower_body_visible"] = bool(visible_idxs & _LOWER_KP_INDEXES)

            if (
                settings.INPUT_GATE_MIN_BODY_COVERAGE > 0
                and coverage < settings.INPUT_GATE_MIN_BODY_COVERAGE
            ):
                reasons.append(
                    f"insufficient_body_coverage ({coverage:.0%} keypoints, "
                    f"min={settings.INPUT_GATE_MIN_BODY_COVERAGE:.0%})"
                )
            if not face_visible:
                # Face missing is a soft signal -- some VTONs work fine
                # without a clear face. Record it but don't reject.
                metrics["face_visibility_warning"] = True
        else:
            metrics["pose"] = "unavailable"

        # 3. Smart crop from the bbox. Only when we have a confident bbox
        # AND the user enabled it. If the bbox already covers most of the
        # frame (>90%), there's nothing useful to crop and we skip.
        cropped_url = person_image_url
        smart_cropped = False
        if (
            settings.INPUT_GATE_SMART_CROP
            and bbox is not None
            and self._bbox_useful(bbox, image.size)
        ):
            try:
                cropped_url = self._smart_crop_and_upload(
                    image=image,
                    bbox=bbox,
                    padding=max(0.0, float(settings.INPUT_GATE_SMART_CROP_PADDING)),
                )
                smart_cropped = cropped_url != person_image_url
                if smart_cropped:
                    metrics["smart_crop_bbox"] = list(bbox)
            except Exception as exc:
                logger.warning("InputGate: smart crop failed (%s)", exc)
                metrics["smart_crop_error"] = str(exc)

        passed = not reasons
        if not passed:
            logger.info(
                "InputGate: gate failed for %s (reasons=%s, metrics=%s)",
                person_image_url,
                reasons,
                metrics,
            )

        return InputGateResult(
            passed=passed,
            person_image_url=cropped_url,
            smart_cropped=smart_cropped,
            reasons=reasons,
            metrics=metrics,
        )

    # ── Internals ─────────────────────────────────────────────

    def _download(self, url: str) -> Tuple[bytes, str]:
        # Our own S3 bucket is private, so plain virtual-hosted URLs come
        # back as 403. Presign when the URL points at our bucket; leave
        # external URLs (retailer CDNs, etc.) untouched.
        fetch_url = self._storage.to_provider_access_url(url, expiration=600) or url
        response = self._client.get(fetch_url)
        response.raise_for_status()
        return response.content, response.headers.get("content-type", "").lower()

    @staticmethod
    def _estimate_blur(image: "Image.Image") -> float:
        """Variance of the Laplacian of a greyscale, downscaled image.

        Higher values = sharper. Below ~80 is typically motion-blurred or
        out of focus. Computed on a 256-wide thumbnail so we don't pay
        for the full resolution -- the relative variance is what matters.
        """
        if Image is None or np is None or ImageFilter is None:
            return 1e9

        thumb = image.copy()
        thumb.thumbnail((256, 256), Image.Resampling.LANCZOS)
        grey = thumb.convert("L")

        # Pillow ships a Laplacian-style FIND_EDGES filter that's good
        # enough for a coarse focus signal without pulling in OpenCV.
        edges = grey.filter(ImageFilter.FIND_EDGES)
        arr = np.asarray(edges, dtype=np.float32)
        if arr.size == 0:
            return 0.0
        return float(arr.var())

    def _safe_pose(self, image_url: str) -> Optional[Dict[str, Any]]:
        try:
            return get_yolo_pose_service().estimate_pose(image_url)
        except Exception as exc:  # pragma: no cover
            logger.warning("InputGate: pose service raised (%s)", exc)
            return None

    @staticmethod
    def _visible_keypoint_indexes(
        keypoints: List[List[float]], confidences: List[float]
    ) -> set:
        if not keypoints:
            return set()
        if not confidences or len(confidences) != len(keypoints):
            # No per-keypoint confidence -> consider every non-zero coord
            # visible. Better than rejecting everything.
            return {
                i
                for i, kp in enumerate(keypoints)
                if isinstance(kp, (list, tuple)) and len(kp) >= 2 and (kp[0] or kp[1])
            }
        return {
            i
            for i, conf in enumerate(confidences)
            if conf is not None and float(conf) >= _KP_CONFIDENCE_THRESHOLD
        }

    @staticmethod
    def _bbox_from_keypoints(
        keypoints: List[List[float]],
        confidences: List[float],
        image_size: Tuple[int, int],
    ) -> Optional[Tuple[int, int, int, int]]:
        if not keypoints:
            return None
        w, h = image_size
        if w <= 0 or h <= 0:
            return None

        xs: List[float] = []
        ys: List[float] = []
        for idx, kp in enumerate(keypoints):
            if not isinstance(kp, (list, tuple)) or len(kp) < 2:
                continue
            if confidences and len(confidences) > idx:
                if float(confidences[idx] or 0) < _KP_CONFIDENCE_THRESHOLD:
                    continue
            x, y = float(kp[0]), float(kp[1])
            if x <= 0 and y <= 0:
                continue  # YOLO uses (0,0) for missing keypoints
            xs.append(x)
            ys.append(y)

        if len(xs) < 3 or len(ys) < 3:
            return None

        x_min, x_max = min(xs), max(xs)
        y_min, y_max = min(ys), max(ys)
        if x_max - x_min < 4 or y_max - y_min < 4:
            return None

        return (
            max(0, int(x_min)),
            max(0, int(y_min)),
            min(w, int(x_max)),
            min(h, int(y_max)),
        )

    @staticmethod
    def _bbox_useful(bbox: Tuple[int, int, int, int], image_size: Tuple[int, int]) -> bool:
        w, h = image_size
        if w <= 0 or h <= 0:
            return False
        bw = max(1, bbox[2] - bbox[0])
        bh = max(1, bbox[3] - bbox[1])
        # If the bbox already covers >90% of the frame on both axes,
        # cropping won't help -- it'll just lose a few pixels.
        return (bw / w) < 0.9 or (bh / h) < 0.9

    def _smart_crop_and_upload(
        self,
        *,
        image: "Image.Image",
        bbox: Tuple[int, int, int, int],
        padding: float,
    ) -> str:
        x_min, y_min, x_max, y_max = bbox
        w, h = image.size

        # Pad by `padding` of the bbox on each side, clamped to the image.
        bw = x_max - x_min
        bh = y_max - y_min
        pad_x = int(round(bw * padding))
        pad_y = int(round(bh * padding))

        crop_box = (
            max(0, x_min - pad_x),
            max(0, y_min - pad_y),
            min(w, x_max + pad_x),
            min(h, y_max + pad_y),
        )
        if crop_box[2] - crop_box[0] < 16 or crop_box[3] - crop_box[1] < 16:
            return ""  # crop too small, caller skips

        cropped = image.crop(crop_box)

        # Re-encode as JPEG-92 to keep the upload small. The downstream
        # preprocessor will already have force-converted to RGB so we
        # don't need to worry about alpha here.
        buffer = io.BytesIO()
        cropped.save(buffer, format="JPEG", quality=92, optimize=True, progressive=True)
        blob = buffer.getvalue()

        sha = hashlib.sha256(blob).hexdigest()
        key = f"tryon_inputs/person_smart_crop/{sha}.jpg"
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


_input_gate: Optional[TryOnInputGate] = None


def get_tryon_input_gate() -> TryOnInputGate:
    global _input_gate
    if _input_gate is None:
        _input_gate = TryOnInputGate()
    return _input_gate


__all__ = [
    "TryOnInputGate",
    "InputGateResult",
    "InputGateError",
    "get_tryon_input_gate",
]
