"""I/O helpers for the serving container.

All cross-task image transport goes through S3. We deliberately avoid
returning base64-encoded images in /invocations responses because the
SageMaker Async payload limit is 25MB and a single 4k upscale already
breaches that.
"""

from __future__ import annotations

import io
import logging
import os
import tempfile
import time
import uuid
from dataclasses import dataclass
from typing import Optional, Tuple
from urllib.parse import urlparse

import boto3
import requests
from botocore.exceptions import ClientError
from PIL import Image

logger = logging.getLogger(__name__)


_S3_CLIENT = None


def _s3():
    global _S3_CLIENT
    if _S3_CLIENT is None:
        _S3_CLIENT = boto3.client(
            "s3",
            region_name=os.environ.get("AWS_REGION", "us-east-1"),
        )
    return _S3_CLIENT


def _parse_s3_uri(uri: str) -> Tuple[str, str]:
    parsed = urlparse(uri)
    if parsed.scheme != "s3":
        raise ValueError(f"not an s3 URI: {uri}")
    bucket = parsed.netloc
    key = parsed.path.lstrip("/")
    if not bucket or not key:
        raise ValueError(f"malformed s3 URI: {uri}")
    return bucket, key


def download_image(url: str) -> Image.Image:
    """Fetch an image from HTTP(S) or s3:// and return a PIL.Image."""
    if url.startswith("s3://"):
        bucket, key = _parse_s3_uri(url)
        try:
            resp = _s3().get_object(Bucket=bucket, Key=key)
            data = resp["Body"].read()
        except ClientError as exc:
            raise RuntimeError(f"S3 download failed for {url}: {exc}")
    else:
        resp = requests.get(url, timeout=60, stream=True)
        if resp.status_code >= 400:
            raise RuntimeError(
                f"HTTP download failed ({resp.status_code}) for {url[:120]}"
            )
        data = resp.content

    img = Image.open(io.BytesIO(data)).convert("RGB")
    return img


def download_s3_to_local(uri: str) -> str:
    """Download an arbitrary s3 object to a local temp path and return it."""
    bucket, key = _parse_s3_uri(uri)
    fname = os.path.basename(key) or f"obj-{uuid.uuid4().hex}"
    local = os.path.join(tempfile.gettempdir(), f"gradfit-{uuid.uuid4().hex}-{fname}")
    _s3().download_file(bucket, key, local)
    return local


def persist_pil_to_s3(
    image: Image.Image,
    output_prefix: str,
    *,
    suffix: str,
    image_format: str = "PNG",
    extra_args: Optional[dict] = None,
) -> str:
    """Upload a PIL image to ``output_prefix/{ts}-{uuid}-{suffix}``.

    ``output_prefix`` is the per-job S3 prefix the backend assigned
    (e.g. ``s3://gradfit-prod/inference/tryon/4321/``). We attach a UUID
    so concurrent runs in the same job don't collide.
    """
    if not output_prefix.startswith("s3://"):
        raise ValueError("output_s3_prefix must be an s3:// URI")
    if not output_prefix.endswith("/"):
        output_prefix += "/"

    bucket, key_prefix = _parse_s3_uri(output_prefix.rstrip("/") + "/")
    fname = f"{int(time.time() * 1000)}-{uuid.uuid4().hex[:8]}-{suffix}"
    key = f"{key_prefix}{fname}"

    buf = io.BytesIO()
    image.save(buf, format=image_format, optimize=False)
    buf.seek(0)
    args = {"ContentType": f"image/{image_format.lower()}"}
    if extra_args:
        args.update(extra_args)
    _s3().put_object(Bucket=bucket, Key=key, Body=buf.getvalue(), **args)
    return f"s3://{bucket}/{key}"


@dataclass
class ImageWithMeta:
    image: Image.Image
    width: int
    height: int


def fit_image(image: Image.Image, max_side: int = 1024) -> Image.Image:
    """Resize so the long edge equals ``max_side`` (preserving aspect)."""
    w, h = image.size
    if max(w, h) <= max_side:
        return image
    if w >= h:
        new_w = max_side
        new_h = int(h * (max_side / w))
    else:
        new_h = max_side
        new_w = int(w * (max_side / h))
    return image.resize((new_w, new_h), Image.LANCZOS)


__all__ = [
    "download_image",
    "download_s3_to_local",
    "persist_pil_to_s3",
    "fit_image",
    "ImageWithMeta",
]
