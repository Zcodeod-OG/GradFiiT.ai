"""Deploy the GradFiT serving container to SageMaker.

Workflow:

1. Build + push the Docker image to ECR.
2. Upload the prepared model artifacts to S3 (output of
   ``download_models.py``).
3. Create or update a SageMaker Model, EndpointConfig, and async
   Endpoint with scale-to-zero.

Usage::

    python deploy_sagemaker.py \\
        --account-id 123456789012 \\
        --region us-east-1 \\
        --image-tag $(git rev-parse --short HEAD) \\
        --bucket gradfit-prod \\
        --model-data s3://gradfit-prod/models/serving-2026-04-27.tar.gz

The script is idempotent: re-running creates a new EndpointConfig and
calls ``UpdateEndpoint`` with zero downtime.
"""

from __future__ import annotations

import argparse
import logging
import subprocess
import time
from typing import Optional

import boto3

logger = logging.getLogger("gradfit.deploy")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


REPO_NAME = "gradfit-serving"
MODEL_NAME = "gradfit-serving"
ENDPOINT_CONFIG_PREFIX = "gradfit-serving"
ENDPOINT_NAME = "gradfit-serving"


def shell(cmd: list[str], **kwargs) -> str:
    logger.info("$ %s", " ".join(cmd))
    return subprocess.check_output(cmd, **kwargs).decode().strip()


def build_and_push_image(*, account_id: str, region: str, image_tag: str) -> str:
    repo_uri = f"{account_id}.dkr.ecr.{region}.amazonaws.com/{REPO_NAME}"
    image_uri = f"{repo_uri}:{image_tag}"

    ecr = boto3.client("ecr", region_name=region)
    try:
        ecr.create_repository(repositoryName=REPO_NAME, imageTagMutability="MUTABLE")
        logger.info("Created ECR repo %s", REPO_NAME)
    except ecr.exceptions.RepositoryAlreadyExistsException:
        logger.info("ECR repo %s already exists", REPO_NAME)

    auth = ecr.get_authorization_token()["authorizationData"][0]
    proxy = auth["proxyEndpoint"]
    shell(
        [
            "bash",
            "-c",
            f"echo {auth['authorizationToken']} | base64 -d | "
            f"cut -d: -f2 | docker login --username AWS --password-stdin {proxy}",
        ]
    )
    shell(["docker", "build", "-t", image_uri, "ml-pipeline/serving"])
    shell(["docker", "push", image_uri])
    return image_uri


def create_or_update_endpoint(
    *,
    region: str,
    image_uri: str,
    model_data: str,
    role_arn: str,
    instance_type: str = "ml.g5.2xlarge",
    output_s3_path: str = "s3://gradfit-prod/inference/output/",
    failure_s3_path: str = "s3://gradfit-prod/inference/failures/",
) -> None:
    sm = boto3.client("sagemaker", region_name=region)
    suffix = time.strftime("%Y%m%d-%H%M%S")
    model_name = f"{MODEL_NAME}-{suffix}"
    endpoint_config_name = f"{ENDPOINT_CONFIG_PREFIX}-{suffix}"

    sm.create_model(
        ModelName=model_name,
        PrimaryContainer={
            "Image": image_uri,
            "ModelDataUrl": model_data,
            "Environment": {
                "GRADFIT_FLUX_REPO": "black-forest-labs/FLUX.1-dev",
                "GRADFIT_FLUX_FILL_REPO": "black-forest-labs/FLUX.1-Fill-dev",
                "GRADFIT_CATVTON_TRANSFORMER_REPO": "xiaozaa/catvton-flux-alpha",
                "GRADFIT_DEFAULT_LORA": (
                    "tryonlabs/FLUX.1-dev-LoRA-Outfit-Generator"
                ),
                "AWS_REGION": region,
            },
        },
        ExecutionRoleArn=role_arn,
    )

    sm.create_endpoint_config(
        EndpointConfigName=endpoint_config_name,
        ProductionVariants=[
            {
                "VariantName": "primary",
                "ModelName": model_name,
                "InstanceType": instance_type,
                "InitialInstanceCount": 1,
                "InitialVariantWeight": 1.0,
                "ContainerStartupHealthCheckTimeoutInSeconds": 1200,
                "ModelDataDownloadTimeoutInSeconds": 1200,
            }
        ],
        AsyncInferenceConfig={
            "OutputConfig": {
                "S3OutputPath": output_s3_path,
                "S3FailurePath": failure_s3_path,
            },
            "ClientConfig": {"MaxConcurrentInvocationsPerInstance": 2},
        },
    )

    try:
        sm.describe_endpoint(EndpointName=ENDPOINT_NAME)
        logger.info("Updating existing endpoint %s", ENDPOINT_NAME)
        sm.update_endpoint(
            EndpointName=ENDPOINT_NAME,
            EndpointConfigName=endpoint_config_name,
            RetainAllVariantProperties=False,
        )
    except sm.exceptions.ClientError:
        logger.info("Creating endpoint %s", ENDPOINT_NAME)
        sm.create_endpoint(
            EndpointName=ENDPOINT_NAME,
            EndpointConfigName=endpoint_config_name,
        )

    register_autoscaling(
        region=region, endpoint_name=ENDPOINT_NAME, variant_name="primary"
    )


def register_autoscaling(*, region: str, endpoint_name: str, variant_name: str) -> None:
    """Configure scale-to-zero based on backlog."""
    asg = boto3.client("application-autoscaling", region_name=region)
    resource_id = f"endpoint/{endpoint_name}/variant/{variant_name}"
    asg.register_scalable_target(
        ServiceNamespace="sagemaker",
        ResourceId=resource_id,
        ScalableDimension="sagemaker:variant:DesiredInstanceCount",
        MinCapacity=0,
        MaxCapacity=2,
    )
    asg.put_scaling_policy(
        PolicyName="gradfit-async-backlog",
        ServiceNamespace="sagemaker",
        ResourceId=resource_id,
        ScalableDimension="sagemaker:variant:DesiredInstanceCount",
        PolicyType="TargetTrackingScaling",
        TargetTrackingScalingPolicyConfiguration={
            "TargetValue": 5.0,
            "CustomizedMetricSpecification": {
                "MetricName": "ApproximateBacklogSizePerInstance",
                "Namespace": "AWS/SageMaker",
                "Dimensions": [
                    {"Name": "EndpointName", "Value": endpoint_name},
                ],
                "Statistic": "Average",
            },
            "ScaleInCooldown": 600,
            "ScaleOutCooldown": 60,
        },
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--account-id", required=True)
    parser.add_argument("--region", default="us-east-1")
    parser.add_argument("--image-tag", required=True)
    parser.add_argument("--model-data", required=True, help="s3://... model.tar.gz")
    parser.add_argument("--role-arn", required=True)
    parser.add_argument("--bucket", required=True)
    parser.add_argument("--instance-type", default="ml.g5.2xlarge")
    args = parser.parse_args()

    image_uri = build_and_push_image(
        account_id=args.account_id, region=args.region, image_tag=args.image_tag
    )
    create_or_update_endpoint(
        region=args.region,
        image_uri=image_uri,
        model_data=args.model_data,
        role_arn=args.role_arn,
        instance_type=args.instance_type,
        output_s3_path=f"s3://{args.bucket}/inference/output/",
        failure_s3_path=f"s3://{args.bucket}/inference/failures/",
    )


if __name__ == "__main__":
    main()
