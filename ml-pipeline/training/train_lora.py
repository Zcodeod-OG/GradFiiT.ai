"""SageMaker Training entry-point for per-brand LoRA fine-tuning.

This is the script that runs INSIDE the HuggingFace Training DLC. It is
invoked by SageMaker with the hyperparameters set in
``launch_lora_training.py`` as CLI args.

SageMaker conventions used here:
    /opt/ml/input/data/train       — dataset channel (mounted from S3)
    /opt/ml/model                  — anything written here is tar.gz'd to
                                     ``OutputDataConfig.S3OutputPath/<job>/output/``
    /opt/ml/checkpoints            — managed-spot checkpoint dir (configured
                                     via CheckpointConfig in the launcher)
    SM_HP_<NAME>                   — hyperparameters as env vars (also passed
                                     as CLI args; we parse the CLI form for
                                     clarity)

Status: scaffolding. The argument plumbing, output layout, and HF token
handling are real; the training loop is a placeholder that creates an empty
LoRA artifact so the pipeline can be wired end-to-end and exercised against
the serving container's ``resolve_lora_weights()`` before the real loop
lands. Replace ``_run_training()`` with the actual diffusers PEFT LoRA loop
(reference: diffusers/examples/dreambooth/train_dreambooth_lora_flux.py).
"""

from __future__ import annotations

import argparse
import json
import logging
import os
from pathlib import Path

logger = logging.getLogger("gradfit.train")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


SM_MODEL_DIR = Path(os.environ.get("SM_MODEL_DIR", "/opt/ml/model"))
SM_TRAIN_CHANNEL = Path(os.environ.get("SM_CHANNEL_TRAIN", "/opt/ml/input/data/train"))
SM_CHECKPOINT_DIR = Path("/opt/ml/checkpoints")


def _resolve_hf_token() -> str | None:
    """Pull the HF token from Secrets Manager if the secret name was passed in.

    Falls back to the HUGGINGFACE_TOKEN env var when running outside SageMaker
    (e.g. local smoke tests).
    """
    secret_name = os.environ.get("HUGGINGFACE_TOKEN_SECRET")
    if secret_name:
        try:
            import boto3

            sm = boto3.client("secretsmanager")
            value = sm.get_secret_value(SecretId=secret_name)
            return value.get("SecretString")
        except Exception as exc:
            logger.warning("Could not resolve HF token secret %s: %s", secret_name, exc)
    return os.environ.get("HUGGINGFACE_TOKEN")


def _run_training(args: argparse.Namespace, hf_token: str | None) -> None:
    """Placeholder training loop. Replace with a real diffusers LoRA loop.

    The real implementation should:
      1. Load the base model from ``args.base_model_repo`` with bf16.
      2. Wrap the transformer in PEFT LoraConfig(r=args.rank, target_modules=...).
      3. Build a torch.utils.data.Dataset from images under SM_TRAIN_CHANNEL.
      4. Train for args.max_steps with the configured LR + batch size.
      5. Save the adapter via pipe.save_lora_weights(SM_MODEL_DIR).
      6. Write adapter_config.json with brand metadata.
    """
    logger.info("=== gradfit-lora training stub ===")
    logger.info("brand_id=%s base=%s rank=%d steps=%d lr=%g res=%d",
                args.brand_id, args.base_model_repo, args.rank,
                args.max_steps, args.learning_rate, args.resolution)
    logger.info("hf_token_present=%s", bool(hf_token))
    logger.info("train_channel=%s exists=%s", SM_TRAIN_CHANNEL, SM_TRAIN_CHANNEL.exists())

    SM_MODEL_DIR.mkdir(parents=True, exist_ok=True)

    # Write a manifest so the launcher/serving side can verify the artifact
    # layout end-to-end even before the real training loop lands.
    manifest = {
        "brand_id": args.brand_id,
        "base_model_repo": args.base_model_repo,
        "rank": args.rank,
        "max_steps": args.max_steps,
        "learning_rate": args.learning_rate,
        "resolution": args.resolution,
        "status": "stub",
        "notes": "Replace _run_training() in train_lora.py with the real diffusers LoRA loop.",
    }
    (SM_MODEL_DIR / "adapter_config.json").write_text(json.dumps(manifest, indent=2))
    # Empty placeholder so resolve_lora_weights() has something to fetch
    # during a wiring smoke test. The real run will overwrite this.
    (SM_MODEL_DIR / "adapter_model.safetensors").write_bytes(b"")
    logger.info("Wrote stub artifacts to %s", SM_MODEL_DIR)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--brand-id", required=True)
    p.add_argument("--dataset-s3", required=True)
    p.add_argument("--base-model-repo", required=True)
    p.add_argument("--rank", type=int, required=True)
    p.add_argument("--learning-rate", type=float, required=True)
    p.add_argument("--max-steps", type=int, required=True)
    p.add_argument("--train-batch-size", type=int, required=True)
    p.add_argument("--resolution", type=int, required=True)
    args = p.parse_args()

    hf_token = _resolve_hf_token()
    _run_training(args, hf_token)


if __name__ == "__main__":
    main()
