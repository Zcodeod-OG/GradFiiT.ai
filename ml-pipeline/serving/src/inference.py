"""GradFiT — SageMaker BYOC HTTP handler.

Implements the two endpoints SageMaker requires for hosting (/ping and
/invocations) and forwards every request to :mod:`routes.dispatch`.

Request envelope (sent as JSON to /invocations):

    {
        "task": "tryon" | "design" | "stylist" | "mask" | "upscale",
        "inputs": { ...task-specific... },
        "options": { ...optional knobs... },
        "request_id": "<gradfit-request-id>"
    }

The handler always returns a JSON object. Output images are uploaded to
the caller-provided S3 prefix and only their s3 URIs are returned, which
keeps SageMaker payloads under the 25MB Async limit even on 4k upscales.
"""

from __future__ import annotations

import json
import logging
import os
import time
import traceback
from typing import Any, Dict

from flask import Flask, Response, jsonify, request

from .routes import dispatch
from .pipeline.context import PipelineContext, get_pipeline_context

logger = logging.getLogger("gradfit.serving")
logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s - %(levelname)s - %(name)s - %(message)s",
)


app = Flask(__name__)


@app.route("/ping", methods=["GET"])
def ping() -> Response:
    """SageMaker health probe.

    Returns 200 once the lazy-loaded pipeline can answer. We deliberately
    do NOT load FLUX at /ping time — first request pays the cold start
    cost (~90s) but /ping stays sub-second so SageMaker doesn't kill the
    container during scale-up.
    """
    try:
        ctx = get_pipeline_context()
        ready = ctx.is_initialised()
        return Response(
            response=json.dumps({"status": "healthy", "warm": ready}),
            status=200,
            mimetype="application/json",
        )
    except Exception as exc:  # pragma: no cover — defensive
        logger.exception("Ping failed: %s", exc)
        return Response(
            response=json.dumps({"status": "error", "error": str(exc)}),
            status=500,
            mimetype="application/json",
        )


@app.route("/invocations", methods=["POST"])
def invocations() -> Response:
    """Main inference entrypoint."""
    started = time.time()
    request_id = request.headers.get("X-Amzn-SageMaker-Custom-Attributes", "")

    try:
        payload: Dict[str, Any] = request.get_json(force=True, silent=False) or {}
    except Exception as exc:
        logger.warning("Invalid JSON payload: %s", exc)
        return jsonify({"error": f"invalid json: {exc}"}), 400

    task = (payload.get("task") or "").strip().lower()
    if not task:
        return jsonify({"error": "missing 'task' field"}), 400

    payload.setdefault("request_id", request_id or f"local-{int(started)}")

    ctx: PipelineContext = get_pipeline_context()

    try:
        ctx.warmup_for_task(task)
        result = dispatch(task=task, payload=payload, ctx=ctx)
    except KeyError as exc:
        return jsonify({"error": f"unknown task '{task}': {exc}"}), 400
    except ValueError as exc:
        return jsonify({"error": f"bad request: {exc}"}), 422
    except Exception as exc:  # noqa: BLE001 — we always want JSON back
        logger.exception("Inference failure: %s", exc)
        return (
            jsonify(
                {
                    "error": "inference_failure",
                    "message": str(exc),
                    "trace": traceback.format_exc().splitlines()[-12:],
                }
            ),
            500,
        )

    elapsed_ms = int((time.time() - started) * 1000)
    result.setdefault("timings", {})["total_ms"] = elapsed_ms
    result.setdefault("request_id", payload["request_id"])
    return jsonify(result), 200


@app.route("/", methods=["GET"])
def root() -> Response:
    return jsonify(
        {
            "service": "gradfit-serving",
            "tasks": ["tryon", "design", "stylist", "mask", "upscale"],
            "version": os.environ.get("GRADFIT_BUILD_SHA", "dev"),
        }
    )


__all__ = ["app"]
