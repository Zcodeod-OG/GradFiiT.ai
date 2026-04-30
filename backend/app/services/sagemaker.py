"""GradFiT - SageMaker Async Inference client.

Thin boto3 wrapper around the bundled GradFiT serving endpoint
(ml.g5.2xlarge running FLUX + LoRA + ControlNet + SAM2 + Real-ESRGAN).

The client speaks the SageMaker Async Inference protocol:

1. Upload the JSON request payload to S3.
2. Call ``invoke_endpoint_async`` with the S3 input location.
3. Poll the returned ``OutputLocation`` (and ``FailureLocation``) until
   the result JSON appears.

Why async (and not real-time): the endpoint runs FLUX inpaint at 1024
which takes 10-25s on a g5.2xlarge. SageMaker real-time would block the
HTTP worker, async lets the FastAPI process return immediately while
Celery polls for the output.

Public surface used by the providers / studio routes:

* :func:`submit_inference` -- enqueue a job, returns ``InferenceId`` and
  the S3 output location to poll later.
* :func:`wait_for_inference` -- block (with backoff) until the output
  appears, returns the parsed JSON.
* :func:`invoke_sync` -- convenience helper that submits and waits in a
  single call, used by the Celery worker path.
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Optional, Tuple
from urllib.parse import urlparse

import boto3
from botocore.exceptions import ClientError

from app.config import settings

logger = logging.getLogger(__name__)


_SAGEMAKER_RUNTIME = None
_S3_CLIENT = None


def _runtime():
    global _SAGEMAKER_RUNTIME
    if _SAGEMAKER_RUNTIME is None:
        _SAGEMAKER_RUNTIME = boto3.client(
            "sagemaker-runtime",
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=settings.AWS_REGION,
        )
    return _SAGEMAKER_RUNTIME


def _s3():
    global _S3_CLIENT
    if _S3_CLIENT is None:
        _S3_CLIENT = boto3.client(
            "s3",
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=settings.AWS_REGION,
        )
    return _S3_CLIENT


@dataclass
class InferenceSubmission:
    """Result of :func:`submit_inference`."""

    inference_id: str
    output_location: str
    failure_location: Optional[str]
    input_location: str
    submitted_at: float = field(default_factory=time.time)


@dataclass
class InferenceResult:
    """Final payload from the GradFiT serving container."""

    payload: Dict[str, Any]
    inference_id: str
    output_location: str
    elapsed_ms: int
    metadata: Dict[str, Any] = field(default_factory=dict)


class SagemakerInferenceError(RuntimeError):
    """Raised on async-invoke failure surfaces (timeouts, FailureLocation)."""

    def __init__(
        self,
        message: str,
        *,
        retryable: bool = False,
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        super().__init__(message)
        self.retryable = retryable
        self.details = details or {}


# ── Public API ────────────────────────────────────────────────────────


def submit_inference(
    *,
    task: str,
    inputs: Dict[str, Any],
    options: Optional[Dict[str, Any]] = None,
    request_id: Optional[str] = None,
    endpoint_name: Optional[str] = None,
) -> InferenceSubmission:
    """Upload payload to S3 and call ``invoke_endpoint_async``."""
    request_id = request_id or f"gradfit-{uuid.uuid4().hex[:12]}"
    endpoint_name = endpoint_name or settings.SAGEMAKER_ENDPOINT_NAME

    payload = {
        "task": task,
        "inputs": inputs,
        "options": options or {},
        "request_id": request_id,
    }

    bucket = settings.SAGEMAKER_INPUT_BUCKET or settings.S3_BUCKET_NAME
    key = (
        settings.SAGEMAKER_INPUT_PREFIX.rstrip("/")
        + f"/{task}/{time.strftime('%Y/%m/%d')}/{request_id}.json"
    )
    body = json.dumps(payload).encode("utf-8")
    _s3().put_object(
        Bucket=bucket,
        Key=key,
        Body=body,
        ContentType="application/json",
    )
    input_location = f"s3://{bucket}/{key}"

    try:
        response = _runtime().invoke_endpoint_async(
            EndpointName=endpoint_name,
            InputLocation=input_location,
            ContentType="application/json",
            Accept="application/json",
            InferenceId=request_id,
            CustomAttributes=f"gradfit-task={task}",
            InvocationTimeoutSeconds=int(settings.SAGEMAKER_INVOCATION_TIMEOUT_SECONDS),
        )
    except ClientError as exc:
        raise SagemakerInferenceError(
            f"invoke_endpoint_async failed: {exc}",
            retryable=True,
            details={"input_location": input_location},
        ) from exc

    output_location = response.get("OutputLocation")
    if not output_location:
        raise SagemakerInferenceError(
            "invoke_endpoint_async returned no OutputLocation",
            retryable=True,
            details={"response": response},
        )

    submission = InferenceSubmission(
        inference_id=response.get("InferenceId", request_id),
        output_location=output_location,
        failure_location=response.get("FailureLocation"),
        input_location=input_location,
    )
    logger.info(
        "SageMaker async submitted task=%s inference_id=%s output=%s",
        task,
        submission.inference_id,
        submission.output_location,
    )
    return submission


def wait_for_inference(
    submission: InferenceSubmission,
    *,
    timeout_seconds: Optional[int] = None,
    poll_interval_seconds: Optional[float] = None,
    on_progress: Optional[Callable[[str], None]] = None,
) -> InferenceResult:
    """Block until the SageMaker output JSON is written to S3."""
    started = submission.submitted_at
    deadline = started + (timeout_seconds or settings.SAGEMAKER_MAX_WAIT_SECONDS)
    interval = max(0.5, poll_interval_seconds or settings.SAGEMAKER_POLL_INTERVAL_SECONDS)

    bucket, key = _parse_s3_uri(submission.output_location)
    failure_bucket = failure_key = None
    if submission.failure_location:
        failure_bucket, failure_key = _parse_s3_uri(submission.failure_location)

    notified = False
    while True:
        if _exists(bucket, key):
            obj = _s3().get_object(Bucket=bucket, Key=key)
            body = obj["Body"].read().decode("utf-8")
            try:
                payload = json.loads(body)
            except json.JSONDecodeError as exc:
                raise SagemakerInferenceError(
                    f"output JSON malformed: {exc}",
                    retryable=False,
                    details={"output_location": submission.output_location},
                ) from exc
            elapsed_ms = int((time.time() - started) * 1000)
            return InferenceResult(
                payload=payload,
                inference_id=submission.inference_id,
                output_location=submission.output_location,
                elapsed_ms=elapsed_ms,
                metadata={"input_location": submission.input_location},
            )

        if failure_bucket and _exists(failure_bucket, failure_key):
            obj = _s3().get_object(Bucket=failure_bucket, Key=failure_key)
            err_body = obj["Body"].read().decode("utf-8", errors="replace")
            raise SagemakerInferenceError(
                f"async inference failed: {err_body[:500]}",
                retryable=False,
                details={"failure_location": submission.failure_location},
            )

        if time.time() >= deadline:
            raise SagemakerInferenceError(
                f"timed out after {int(time.time() - started)}s waiting for "
                f"{submission.output_location}",
                retryable=True,
                details={"inference_id": submission.inference_id},
            )

        if on_progress and not notified:
            on_progress("stage1_processing")
            notified = True

        time.sleep(interval)


def invoke_sync(
    *,
    task: str,
    inputs: Dict[str, Any],
    options: Optional[Dict[str, Any]] = None,
    request_id: Optional[str] = None,
    endpoint_name: Optional[str] = None,
    timeout_seconds: Optional[int] = None,
    on_progress: Optional[Callable[[str], None]] = None,
) -> InferenceResult:
    """Submit + wait in one call (used by Celery workers)."""
    submission = submit_inference(
        task=task,
        inputs=inputs,
        options=options,
        request_id=request_id,
        endpoint_name=endpoint_name,
    )
    if on_progress:
        on_progress("queued")
    return wait_for_inference(
        submission,
        timeout_seconds=timeout_seconds,
        on_progress=on_progress,
    )


def build_output_prefix(*, scope: str, scope_id: str | int) -> str:
    """Build an ``s3://bucket/prefix/`` for the serving container's
    ``output_s3_prefix`` field. Convention is
    ``inference/{scope}/{scope_id}/{date}/`` so we can lifecycle-expire
    them cheaply (see infra/s3_lifecycle.json)."""
    bucket = settings.SAGEMAKER_OUTPUT_BUCKET or settings.S3_BUCKET_NAME
    prefix = (
        settings.SAGEMAKER_OUTPUT_PREFIX.rstrip("/")
        + f"/{scope}/{scope_id}/{time.strftime('%Y/%m/%d')}/"
    )
    return f"s3://{bucket}/{prefix}"


def s3_uri_to_public_url(s3_uri: str, *, expiration: int = 3600) -> str:
    """Translate an ``s3://`` URI to a presigned HTTPS URL the frontend
    can show. Falls back to the canonical S3 URL if presign fails."""
    bucket, key = _parse_s3_uri(s3_uri)
    try:
        return _s3().generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": key},
            ExpiresIn=expiration,
        )
    except ClientError as exc:
        logger.warning("Presign failed for %s: %s", s3_uri, exc)
        return f"https://{bucket}.s3.{settings.AWS_REGION}.amazonaws.com/{key}"


# ── Helpers ───────────────────────────────────────────────────────────


def _parse_s3_uri(uri: str) -> Tuple[str, str]:
    parsed = urlparse(uri)
    if parsed.scheme != "s3":
        raise ValueError(f"not an s3 URI: {uri}")
    return parsed.netloc, parsed.path.lstrip("/")


def _exists(bucket: str, key: str) -> bool:
    try:
        _s3().head_object(Bucket=bucket, Key=key)
        return True
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code")
        if code in {"404", "NoSuchKey", "NotFound"}:
            return False
        # 403 here usually means the object exists but we lack list perms;
        # treat as not-yet-present so we keep polling and surface real
        # auth errors after the deadline.
        if code == "403":
            return False
        raise


__all__ = [
    "InferenceSubmission",
    "InferenceResult",
    "SagemakerInferenceError",
    "submit_inference",
    "wait_for_inference",
    "invoke_sync",
    "build_output_prefix",
    "s3_uri_to_public_url",
]
