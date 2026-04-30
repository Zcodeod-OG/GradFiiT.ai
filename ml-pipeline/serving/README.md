# GradFiT — ML Serving Container

SageMaker BYOC image that hosts the entire generative pipeline behind a
single Async Inference endpoint on `ml.g5.2xlarge`:

- **CatVTON-Flux** (`xiaozaa/catvton-flux-alpha` + `FLUX.1-Fill-dev`) —
  primary virtual try-on model, served under the `tryon_v2` task. SOTA
  on VITON-HD (FID 5.59) and Apache-2.0-compatible for global commercial
  use. Targets ≤10s warm P95 on `g5.2xlarge` at the balanced lane.
- **SAM2** large — garment / person / reference masking (also feeds the
  CatVTON inpaint mask)
- **FLUX.1-dev** — text-to-image + inpaint backbone for design / stylist
  / legacy `tryon` tasks
- **ControlNet** (canny + depth) — pose / structure conditioning for
  legacy `tryon` and `design`
- **IP-Adapter** (FLUX) — garment / face / style references for stylist
- **Default Clothing LoRA** — `tryonlabs/FLUX.1-dev-LoRA-Outfit-Generator`
- **Real-ESRGAN x4** — opt-in super-resolution (`upscale` task)

Per-user / per-brand LoRAs are hot-swapped from S3 at request time via
the `options.lora_uri` field on the legacy `tryon` / `design` tasks.

## Tasks

| `task`     | Inputs                                                                  | Output                                            |
|------------|-------------------------------------------------------------------------|---------------------------------------------------|
| `tryon_v2` | `person_image_url`, `garment_image_url`, `output_s3_prefix`             | `result_image_uri`, `candidate_image_uris[]`      |
| `tryon`    | `person_image_url`, `garment_image_url`, `output_s3_prefix`             | `result_image_uri`, `raw_image_uri`               |
| `design`   | `prompt`, optional `sketch_image_url`, `style_reference_url`            | `image_uris[]`                                    |
| `stylist`  | `prompt`, `pieces[]`, optional `model_reference_url`                    | `image_uris[]`                                    |
| `mask`     | `image_url`, `options.target` ∈ {`garment`, `person`, `lower_garment`}  | `mask_image_uri`, optional `cutout_image_uri`     |
| `upscale`  | `image_url`, `options.scale` ∈ {2, 4}                                   | `image_uri`                                       |

`tryon_v2` is the default for new traffic. `tryon` is retained for the
LoRA-hot-swap codepath used by brand DNA / studios. Both share the same
endpoint, so we pay for one GPU.

## Local development

```bash
docker build -t gradfit-serving:dev ml-pipeline/serving
docker run --gpus all -p 8080:8080 \
  -e GRADFIT_FLUX_REPO=black-forest-labs/FLUX.1-dev \
  -e HUGGINGFACE_TOKEN=$HUGGINGFACE_TOKEN \
  -e AWS_ACCESS_KEY_ID=... -e AWS_SECRET_ACCESS_KEY=... \
  gradfit-serving:dev
```

Smoke test:

```bash
python ml-pipeline/serving/scripts/smoke_test.py --bucket gradfit-dev
```

## Deploying to SageMaker

The deploy script (`ml-pipeline/serving/scripts/deploy_sagemaker.py`)
pushes the image to ECR and creates an Async Inference endpoint on
`ml.g5.2xlarge` with scale-to-zero. It also wires CloudWatch warm-up at
the schedule defined in `infra/warmup_schedule.json`.

## Ops & cost (one-shot)

After the endpoint exists, apply the lifecycle / warm-up / recommender
configuration in one go:

```bash
export GRADFIT_S3_BUCKET=gradfit-prod
export GRADFIT_WARMUP_BUCKET=gradfit-prod
export GRADFIT_ENDPOINT_NAME=gradfit-serving
export GRADFIT_LAMBDA_ROLE_ARN=arn:aws:iam::ACCOUNT:role/GradfitWarmupLambda
export GRADFIT_LAMBDA_PACKAGE=dist/warmup-lambda.zip
export GRADFIT_RECOMMENDER_ROLE_ARN=arn:aws:iam::ACCOUNT:role/SageMakerExecutionRole
export GRADFIT_RECOMMENDER_MODEL_PKG=arn:aws:sagemaker:...:model-package/gradfit-serving/1

python ml-pipeline/serving/scripts/apply_ops_cost.py
```

The script consumes the JSON specs in `infra/`:

- `s3_lifecycle.json` — moves `inference/` outputs to IA after 30d,
  Glacier IR after 90d, expires at 180d; daily cleanup on `warmup/out/`.
- `warmup_schedule.json` — EventBridge cron rules that fire the warm-up
  Lambda 5min before peak windows in IST + ET, plus a 10-min keep-alive.
- `inference_recommender.json` — benchmarks `g5.xlarge / 2xlarge /
  4xlarge` against a sample payload so we can revisit our sizing
  decision with real numbers (target P95 ≤ 25s).

Cost envelope at v1 traffic (1k generations/day, ~12s each on a warm
endpoint, scale-to-zero outside peak):

- SageMaker `g5.2xlarge` async, ~6h warm/day → **~$280/mo**
- S3 + egress → **~$50/mo**
- Total → **<$5k/yr**, comfortably inside the $10k AWS credit budget.
