"""Apply GradFiT ops/cost configuration in one shot.

This script consumes the JSON specs in ``ml-pipeline/serving/infra/`` and
applies them to AWS:

1. ``s3_lifecycle.json``        -> S3 lifecycle on the inference bucket.
2. ``warmup_lambda.py`` +
   ``warmup_schedule.json``     -> Lambda + EventBridge cron rules for
                                    scheduled SageMaker endpoint warm-ups.
3. ``inference_recommender.json`` -> SageMaker Inference Recommender job
                                      to validate ``ml.g5.2xlarge`` sizing.

It is intentionally idempotent: every resource is created or updated, never
deleted. Re-running is the safe way to roll out tweaks (e.g. new cron times
after a traffic study, longer payload TTL, additional candidate instance
types).

Required environment variables
------------------------------
- AWS_REGION                       (default: us-east-1)
- GRADFIT_S3_BUCKET                S3 bucket holding inference inputs/outputs.
- GRADFIT_WARMUP_BUCKET            Bucket where the warm-up Lambda reads its
                                    canned payload (often == GRADFIT_S3_BUCKET).
- GRADFIT_ENDPOINT_NAME            SageMaker endpoint name to warm + benchmark.
- GRADFIT_LAMBDA_ROLE_ARN          Execution role for the warm-up Lambda.
- GRADFIT_RECOMMENDER_ROLE_ARN     SageMaker execution role for Inference
                                    Recommender (needs sagemaker:* + s3:*).
- GRADFIT_RECOMMENDER_MODEL_PKG    ModelPackage ARN for the recommender job.
- GRADFIT_LAMBDA_PACKAGE           Path to a zip file containing
                                    ``warmup_lambda.py`` (built by CI).

This script is meant to be run once per environment after
``deploy_sagemaker.py`` has produced the endpoint.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from pathlib import Path
from typing import Any, Dict

try:
    import boto3
    from botocore.exceptions import ClientError
except ImportError:  # pragma: no cover - boto3 is required at runtime
    print("boto3 is required. `pip install boto3`", file=sys.stderr)
    raise

LOG = logging.getLogger("apply_ops_cost")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

INFRA_DIR = Path(__file__).resolve().parent.parent / "infra"
LIFECYCLE_FILE = INFRA_DIR / "s3_lifecycle.json"
SCHEDULE_FILE = INFRA_DIR / "warmup_schedule.json"
RECOMMENDER_FILE = INFRA_DIR / "inference_recommender.json"


def _load_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def _strip_doc_keys(node: Any) -> Any:
    """Drop ``_doc`` keys we use as inline JSON comments."""
    if isinstance(node, dict):
        return {k: _strip_doc_keys(v) for k, v in node.items() if k != "_doc"}
    if isinstance(node, list):
        return [_strip_doc_keys(item) for item in node]
    return node


def apply_s3_lifecycle(bucket: str) -> None:
    config = _strip_doc_keys(_load_json(LIFECYCLE_FILE))
    LOG.info("Applying S3 lifecycle to bucket=%s (%d rules)", bucket, len(config.get("Rules", [])))
    s3 = boto3.client("s3")
    s3.put_bucket_lifecycle_configuration(
        Bucket=bucket,
        LifecycleConfiguration={"Rules": config["Rules"]},
    )


def upload_warmup_payload(bucket: str) -> None:
    schedule = _load_json(SCHEDULE_FILE)
    payload_spec = schedule.get("warmup_payload_s3", {})
    if not payload_spec:
        LOG.warning("warmup_payload_s3 missing from schedule file; skipping payload upload")
        return
    key = payload_spec["key"]
    body = json.dumps(payload_spec["content"]).encode("utf-8")
    LOG.info("Uploading warm-up payload to s3://%s/%s", bucket, key)
    boto3.client("s3").put_object(
        Bucket=bucket,
        Key=key,
        Body=body,
        ContentType="application/json",
    )


def ensure_warmup_lambda(
    *,
    function_name: str,
    role_arn: str,
    endpoint_name: str,
    warmup_bucket: str,
    package_path: str,
) -> str:
    lam = boto3.client("lambda")
    with open(package_path, "rb") as fh:
        zip_bytes = fh.read()

    env = {
        "Variables": {
            "GRADFIT_ENDPOINT_NAME": endpoint_name,
            "GRADFIT_WARMUP_BUCKET": warmup_bucket,
        }
    }

    try:
        lam.get_function(FunctionName=function_name)
        LOG.info("Updating existing Lambda %s", function_name)
        lam.update_function_code(FunctionName=function_name, ZipFile=zip_bytes, Publish=True)
        lam.update_function_configuration(
            FunctionName=function_name,
            Role=role_arn,
            Handler="warmup_lambda.lambda_handler",
            Runtime="python3.11",
            Timeout=30,
            MemorySize=256,
            Environment=env,
        )
    except lam.exceptions.ResourceNotFoundException:
        LOG.info("Creating Lambda %s", function_name)
        lam.create_function(
            FunctionName=function_name,
            Runtime="python3.11",
            Role=role_arn,
            Handler="warmup_lambda.lambda_handler",
            Code={"ZipFile": zip_bytes},
            Timeout=30,
            MemorySize=256,
            Environment=env,
            Publish=True,
        )

    arn = lam.get_function(FunctionName=function_name)["Configuration"]["FunctionArn"]
    LOG.info("Lambda ready: %s", arn)
    return arn


def ensure_eventbridge_rules(*, lambda_arn: str, function_name: str) -> None:
    schedule = _load_json(SCHEDULE_FILE)
    events = boto3.client("events")
    lam = boto3.client("lambda")

    for rule in schedule.get("rules", []):
        name = rule["name"]
        LOG.info("Putting EventBridge rule %s (%s)", name, rule["schedule_expression"])
        events.put_rule(
            Name=name,
            ScheduleExpression=rule["schedule_expression"],
            State="ENABLED",
            Description=rule.get("description", ""),
        )
        events.put_targets(
            Rule=name,
            Targets=[{"Id": "warmup-target", "Arn": lambda_arn}],
        )

        statement_id = f"allow-eventbridge-{name}"
        try:
            lam.add_permission(
                FunctionName=function_name,
                StatementId=statement_id,
                Action="lambda:InvokeFunction",
                Principal="events.amazonaws.com",
                SourceArn=f"arn:aws:events:{boto3.session.Session().region_name}:"
                f"{boto3.client('sts').get_caller_identity()['Account']}:rule/{name}",
            )
        except ClientError as exc:
            if exc.response["Error"]["Code"] != "ResourceConflictException":
                raise


def submit_inference_recommender(*, role_arn: str, model_package_arn: str) -> str:
    spec = _strip_doc_keys(_load_json(RECOMMENDER_FILE))
    spec["RoleArn"] = role_arn
    spec["InputConfig"]["ModelPackageVersionArn"] = model_package_arn

    sm = boto3.client("sagemaker")
    LOG.info("Submitting Inference Recommender job %s", spec["JobName"])
    try:
        sm.create_inference_recommendations_job(**spec)
    except sm.exceptions.ResourceInUse:
        LOG.info("Recommender job %s already exists; leaving as-is", spec["JobName"])
    return spec["JobName"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--skip-lifecycle", action="store_true", help="Skip S3 lifecycle application"
    )
    parser.add_argument(
        "--skip-warmup", action="store_true", help="Skip Lambda + EventBridge wiring"
    )
    parser.add_argument(
        "--skip-recommender", action="store_true", help="Skip Inference Recommender job submission"
    )
    parser.add_argument(
        "--lambda-name",
        default=os.environ.get("GRADFIT_WARMUP_LAMBDA_NAME", "gradfit-endpoint-warmup"),
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    bucket = os.environ.get("GRADFIT_S3_BUCKET")
    warmup_bucket = os.environ.get("GRADFIT_WARMUP_BUCKET", bucket)
    endpoint_name = os.environ.get("GRADFIT_ENDPOINT_NAME", "gradfit-serving")

    if not args.skip_lifecycle:
        if not bucket:
            LOG.error("GRADFIT_S3_BUCKET is required for lifecycle step")
            return 2
        apply_s3_lifecycle(bucket)
        upload_warmup_payload(warmup_bucket)

    if not args.skip_warmup:
        role_arn = os.environ.get("GRADFIT_LAMBDA_ROLE_ARN")
        package_path = os.environ.get("GRADFIT_LAMBDA_PACKAGE")
        if not (role_arn and package_path and warmup_bucket):
            LOG.error(
                "GRADFIT_LAMBDA_ROLE_ARN, GRADFIT_LAMBDA_PACKAGE and "
                "GRADFIT_WARMUP_BUCKET are required for warm-up step"
            )
            return 2
        arn = ensure_warmup_lambda(
            function_name=args.lambda_name,
            role_arn=role_arn,
            endpoint_name=endpoint_name,
            warmup_bucket=warmup_bucket,
            package_path=package_path,
        )
        ensure_eventbridge_rules(lambda_arn=arn, function_name=args.lambda_name)

    if not args.skip_recommender:
        rec_role = os.environ.get("GRADFIT_RECOMMENDER_ROLE_ARN")
        model_pkg = os.environ.get("GRADFIT_RECOMMENDER_MODEL_PKG")
        if not (rec_role and model_pkg):
            LOG.warning(
                "Skipping recommender: set GRADFIT_RECOMMENDER_ROLE_ARN and "
                "GRADFIT_RECOMMENDER_MODEL_PKG to enable"
            )
        else:
            submit_inference_recommender(role_arn=rec_role, model_package_arn=model_pkg)

    LOG.info("Ops/cost configuration applied successfully.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
