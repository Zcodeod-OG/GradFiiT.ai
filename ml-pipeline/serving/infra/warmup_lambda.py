"""SageMaker warm-up Lambda for the GradFiT serving endpoint.

Triggered by EventBridge on a cron schedule (defined in
``warmup_schedule.json``). Sends a tiny no-op /invocations call so the
async endpoint scales from 0 -> 1 instance before the first user
request lands. The container's /ping is intentionally cheap; this
function instead invokes a real ``mask`` task on a single 64x64 image
held in S3 to force the model loaders to warm up.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict

import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

ENDPOINT_NAME = os.environ.get("GRADFIT_ENDPOINT_NAME", "gradfit-serving")
WARMUP_BUCKET = os.environ["GRADFIT_WARMUP_BUCKET"]
WARMUP_KEY = os.environ.get(
    "GRADFIT_WARMUP_KEY", "warmup/warmup-input.json"
)


def lambda_handler(event: Dict[str, Any], context) -> Dict[str, Any]:
    """Submit a warm-up async invocation."""
    runtime = boto3.client("sagemaker-runtime")
    s3_uri = f"s3://{WARMUP_BUCKET}/{WARMUP_KEY}"
    logger.info("Warming endpoint=%s with payload=%s", ENDPOINT_NAME, s3_uri)

    response = runtime.invoke_endpoint_async(
        EndpointName=ENDPOINT_NAME,
        InputLocation=s3_uri,
        ContentType="application/json",
        Accept="application/json",
        InferenceId=f"warmup-{int(context.aws_request_id[:8], 16)}"
        if context
        else "warmup",
    )
    logger.info("Submitted warmup InferenceId=%s", response.get("InferenceId"))

    return {
        "statusCode": 202,
        "body": json.dumps(
            {
                "endpoint": ENDPOINT_NAME,
                "inference_id": response.get("InferenceId"),
                "output_location": response.get("OutputLocation"),
            }
        ),
    }
