"""Launch a per-brand LoRA fine-tuning job on SageMaker Training.

Produces a LoRA ``.safetensors`` artifact in S3 that the serving container's
``resolve_lora_weights()`` (ml-pipeline/serving/src/pipeline/loaders.py) hot-
loads at inference time. No serving-container changes are needed when a new
brand LoRA lands — the inference path already handles ``s3://`` URIs.

Cost envelope (rule of thumb, us-east-1, on-demand):
    ml.g5.12xlarge ≈ $7.10/hr × 2–4 hours = $14–$30 per brand fine-tune.
    Use spot via SageMaker managed spot training for ~70% off when the job
    is restartable (--max-wait > --max-run enables checkpoint resumption).

This script does NOT run training. It launches a SageMaker Training Job that
executes ``train_lora.py`` inside a HuggingFace DLC. The training script
itself is intentionally minimal scaffolding — fill in dataset loading and
the LoRA training loop before first use.

Usage::

    python ml-pipeline/training/launch_lora_training.py \\
        --brand-id acme-fashion \\
        --dataset-s3 s3://gradfit-prod/brand-datasets/acme/v1/ \\
        --output-s3 s3://gradfit-prod/loras/acme/ \\
        --role-arn arn:aws:iam::123456789012:role/gradfit-sagemaker \\
        --region us-east-1 \\
        --instance-type ml.g5.12xlarge \\
        --use-spot

Outputs:
    s3://gradfit-prod/loras/acme/<job-name>/output/model.tar.gz
        Contains adapter_model.safetensors + adapter_config.json. Register
        the unpacked .safetensors S3 URI in the brand record and the
        serving container's ``resolve_lora_weights()`` will hot-load it.
"""

from __future__ import annotations

import argparse
import logging
import time
from pathlib import Path

import boto3

logger = logging.getLogger("gradfit.training")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


# Pinned HuggingFace DLC. Update when the project upgrades torch/diffusers.
# Find current image URIs at: https://github.com/aws/deep-learning-containers/blob/master/available_images.md
HF_TRAINING_IMAGE = (
    "763104351884.dkr.ecr.{region}.amazonaws.com/"
    "huggingface-pytorch-training:2.3.0-transformers4.46.1-gpu-py311-cu121-ubuntu22.04"
)

# Where the training script lives inside the source bundle uploaded to S3.
ENTRY_POINT = "train_lora.py"
SOURCE_DIR = str(Path(__file__).resolve().parent)


def _build_hyperparameters(
    *,
    brand_id: str,
    dataset_s3: str,
    base_model_repo: str,
    rank: int,
    learning_rate: float,
    max_steps: int,
    train_batch_size: int,
    resolution: int,
) -> dict:
    """SageMaker passes these as CLI args to the entry-point script."""
    return {
        "brand-id": brand_id,
        "dataset-s3": dataset_s3,
        "base-model-repo": base_model_repo,
        "rank": rank,
        "learning-rate": learning_rate,
        "max-steps": max_steps,
        "train-batch-size": train_batch_size,
        "resolution": resolution,
    }


def launch(
    *,
    brand_id: str,
    dataset_s3: str,
    output_s3: str,
    role_arn: str,
    region: str,
    instance_type: str,
    base_model_repo: str,
    rank: int,
    learning_rate: float,
    max_steps: int,
    train_batch_size: int,
    resolution: int,
    max_run_seconds: int,
    use_spot: bool,
    max_wait_seconds: int,
    huggingface_token_secret: str | None,
) -> str:
    """Submit the SageMaker Training Job. Returns the job name."""
    sm = boto3.client("sagemaker", region_name=region)
    job_name = f"gradfit-lora-{brand_id}-{time.strftime('%Y%m%d-%H%M%S')}"

    image_uri = HF_TRAINING_IMAGE.format(region=region)

    hyperparameters = _build_hyperparameters(
        brand_id=brand_id,
        dataset_s3=dataset_s3,
        base_model_repo=base_model_repo,
        rank=rank,
        learning_rate=learning_rate,
        max_steps=max_steps,
        train_batch_size=train_batch_size,
        resolution=resolution,
    )
    # SageMaker requires string values.
    hyperparameters = {k: str(v) for k, v in hyperparameters.items()}

    env: dict[str, str] = {}
    if huggingface_token_secret:
        # Resolved at runtime via AWS Secrets Manager; the training script
        # reads the secret name from env and pulls the value with boto3.
        env["HUGGINGFACE_TOKEN_SECRET"] = huggingface_token_secret

    create_kwargs: dict = {
        "TrainingJobName": job_name,
        "HyperParameters": hyperparameters,
        "AlgorithmSpecification": {
            "TrainingImage": image_uri,
            "TrainingInputMode": "File",
            "EnableSageMakerMetricsTimeSeries": True,
        },
        "RoleArn": role_arn,
        "InputDataConfig": [
            {
                "ChannelName": "train",
                "DataSource": {
                    "S3DataSource": {
                        "S3DataType": "S3Prefix",
                        "S3Uri": dataset_s3,
                        "S3DataDistributionType": "FullyReplicated",
                    }
                },
                "ContentType": "application/x-image",
                "InputMode": "File",
            }
        ],
        "OutputDataConfig": {"S3OutputPath": output_s3},
        "ResourceConfig": {
            "InstanceType": instance_type,
            "InstanceCount": 1,
            "VolumeSizeInGB": 100,
        },
        "StoppingCondition": {"MaxRuntimeInSeconds": max_run_seconds},
        "Environment": env,
        "Tags": [
            {"Key": "project", "Value": "gradfit"},
            {"Key": "purpose", "Value": "lora-finetune"},
            {"Key": "brand-id", "Value": brand_id},
        ],
    }

    if use_spot:
        # Managed spot requires MaxWaitTimeInSeconds >= MaxRuntimeInSeconds
        # and a CheckpointConfig so the job can resume if reclaimed.
        create_kwargs["EnableManagedSpotTraining"] = True
        create_kwargs["StoppingCondition"]["MaxWaitTimeInSeconds"] = max(
            max_wait_seconds, max_run_seconds + 600
        )
        create_kwargs["CheckpointConfig"] = {
            "S3Uri": output_s3.rstrip("/") + "/checkpoints/",
        }

    logger.info("Submitting training job %s on %s", job_name, instance_type)
    sm.create_training_job(**create_kwargs)
    logger.info("Job submitted. Track: aws sagemaker describe-training-job --training-job-name %s", job_name)
    return job_name


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--brand-id", required=True, help="Stable slug, used in artifact paths")
    p.add_argument("--dataset-s3", required=True, help="s3:// prefix containing brand training images")
    p.add_argument("--output-s3", required=True, help="s3:// prefix where the LoRA artifact will land")
    p.add_argument("--role-arn", required=True)
    p.add_argument("--region", default="us-east-1")
    p.add_argument("--instance-type", default="ml.g5.12xlarge")
    p.add_argument(
        "--base-model-repo",
        default="black-forest-labs/FLUX.1-dev",
        help="HF repo of the base diffusion model to LoRA-fine-tune",
    )
    p.add_argument("--rank", type=int, default=32, help="LoRA rank (16/32/64)")
    p.add_argument("--learning-rate", type=float, default=1e-4)
    p.add_argument("--max-steps", type=int, default=1500)
    p.add_argument("--train-batch-size", type=int, default=1)
    p.add_argument("--resolution", type=int, default=1024)
    p.add_argument("--max-run-seconds", type=int, default=14400, help="4h default cap")
    p.add_argument("--use-spot", action="store_true", help="Enable managed spot training (~70%% cheaper)")
    p.add_argument("--max-wait-seconds", type=int, default=18000, help="Spot wait budget (must be > max-run)")
    p.add_argument(
        "--huggingface-token-secret",
        default=None,
        help="AWS Secrets Manager secret name holding HUGGINGFACE_TOKEN",
    )
    args = p.parse_args()

    launch(
        brand_id=args.brand_id,
        dataset_s3=args.dataset_s3,
        output_s3=args.output_s3,
        role_arn=args.role_arn,
        region=args.region,
        instance_type=args.instance_type,
        base_model_repo=args.base_model_repo,
        rank=args.rank,
        learning_rate=args.learning_rate,
        max_steps=args.max_steps,
        train_batch_size=args.train_batch_size,
        resolution=args.resolution,
        max_run_seconds=args.max_run_seconds,
        use_spot=args.use_spot,
        max_wait_seconds=args.max_wait_seconds,
        huggingface_token_secret=args.huggingface_token_secret,
    )


if __name__ == "__main__":
    main()
