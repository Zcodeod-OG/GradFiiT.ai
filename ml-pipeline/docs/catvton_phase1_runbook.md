# CatVTON-Flux Phase 1 — Deploy & Benchmark Runbook

End-to-end checklist to (a) deploy the new `tryon_v2` (CatVTON-Flux)
serving build to SageMaker, (b) smoke-test it, and (c) capture P50 /
P95 / P99 latency so we can confirm the ≤10s budget is met before we
flip frontend traffic to it.

This runbook supersedes the earlier HunyuanVTO plan. Background: the
`tencent/HunyuanVTO` repo we previously wired against was never
published; we pivoted to CatVTON-Flux because it is real, SOTA on
VITON-HD, Apache-2.0-clean for global commercial launch, and pairs with
FLUX-Fill weights we already cache.

## Prereqs

- AWS account with `gradfit-prod` (or `gradfit-dev`) S3 bucket.
- IAM role for SageMaker execution + ECR push + S3 read/write.
- HuggingFace account with access to `black-forest-labs/FLUX.1-Fill-dev`
  (gated; you must accept its license once on huggingface.co). Token
  exported as `HUGGINGFACE_TOKEN`.
- Docker daemon with NVIDIA runtime. For local benchmarks, a CUDA-12.4
  GPU with ≥20 GB VRAM (g5.2xlarge equivalent or better). Skip the
  local mode if you only have a CPU.

## 1. Pre-bake model artifacts

Pre-downloading model weights into a `model.tar.gz` cuts the SageMaker
cold start from ~20 minutes (HF fetch on the GPU instance) to ~2
minutes (S3 → instance).

```bash
# From repo root, on a machine with enough disk for ~50GB.
python ml-pipeline/serving/scripts/download_models.py \
    --target /tmp/gradfit-models \
    --hf-token $HUGGINGFACE_TOKEN \
    # Drop --skip-legacy if you also need design/stylist tasks live.
    --skip-legacy

# Pack and upload.
cd /tmp/gradfit-models
tar -czf /tmp/serving-$(date +%Y%m%d).tar.gz .
aws s3 cp /tmp/serving-$(date +%Y%m%d).tar.gz \
    s3://gradfit-prod/models/serving-$(date +%Y%m%d).tar.gz
```

Note the s3 URI — it goes into `--model-data` below.

## 2. Build + deploy

```bash
python ml-pipeline/serving/scripts/deploy_sagemaker.py \
    --account-id <ACCOUNT_ID> \
    --region us-east-1 \
    --image-tag $(git rev-parse --short HEAD) \
    --model-data s3://gradfit-prod/models/serving-$(date +%Y%m%d).tar.gz \
    --role-arn arn:aws:iam::<ACCOUNT_ID>:role/SageMakerExecutionRole \
    --bucket gradfit-prod \
    --instance-type ml.g5.2xlarge
```

This builds the image, pushes to ECR, registers a SageMaker Model with
the new env vars (`GRADFIT_CATVTON_TRANSFORMER_REPO`,
`GRADFIT_FLUX_FILL_REPO`), creates a fresh `EndpointConfig`, and rolls
the endpoint update with zero downtime.

Watch the endpoint status until it's `InService`:

```bash
aws sagemaker describe-endpoint --endpoint-name gradfit-serving \
    --query EndpointStatus --output text
```

## 3. Smoke test

The smoke test posts one request per task (including the new
`tryon_v2`). Run it against the deployed endpoint by configuring the
backend's `SAGEMAKER_ENDPOINT_NAME` and hitting
`POST /api/tryon` from a dev shell, or use the local in-process variant
on a GPU machine:

```bash
python ml-pipeline/serving/scripts/smoke_test.py --bucket gradfit-dev
```

Expected output: every task returns a 200 with a `result_image_uri`
that resolves to an S3 object. The `tryon_v2` case will be the slowest
on cold start (model load).

## 4. Latency benchmark

The benchmark script invokes `tryon_v2` N times per quality lane,
discarding the first iteration (cold) and reporting P50 / P95 / P99
warm latencies plus container-internal timings (SAM2 mask, CatVTON
inpaint, total).

```bash
python ml-pipeline/serving/scripts/benchmark_tryon_v2.py \
    --mode sagemaker \
    --endpoint-name gradfit-serving \
    --bucket gradfit-prod \
    --iterations 10 \
    --lanes fast,balanced,best
```

Results land in `ml-pipeline/benchmarks/tryon_v2_<ts>.json`. The
markdown summary printed at the end includes a row per lane:

```
lane          cold    warm p50    warm p95    warm p99
fast          ...     ...         ...         ...
balanced      ...     ...         ...         ...
best          ...     ...         ...         ...
```

## 5. Pass/fail gates

- **Latency**: balanced lane warm P95 ≤ 10000 ms. Fast lane warm P95
  ≤ 7000 ms. If we miss, options in priority order: (a) drop balanced
  steps from 25 → 22; (b) try `g6.2xlarge` (L4) — same hourly price,
  ~15-20% faster on diffusion; (c) enable `torch.compile` on the
  transformer.
- **Cold start**: < 180s. If we miss, the `model.tar.gz` is too large —
  rerun `download_models.py --skip-legacy`.
- **Quality smoke**: visually inspect three balanced-lane outputs in
  the S3 prefix. Look for: garment fidelity (no texture corruption),
  identity preservation (face still recognizable), and no obvious
  seam at the mask boundary (would indicate the dilation isn't
  enough).

If all three pass, set the backend `TRYON_PROVIDER=catvton_flux`
(default in `.env.example`). Existing rows / .env files using the
deprecated `hunyuan_vto` slug still resolve via the registry alias.
Phase 2 in the plan (quantitative eval harness vs. IDM-VTON) lives
in a separate runbook.

## Cost envelope reminder

- `g5.2xlarge` async, ~6h warm/day → **~$280/mo**.
- S3 + egress → **~$50/mo**.
- Total → **<$5k/yr**, comfortably inside the $10k AWS credit budget.

If the benchmark suggests we need `g6.2xlarge`, the cost is similar
(~$1/hr vs. ~$1.21/hr) and still fits.

## Follow-ups (not Phase 1)

- Build the IDM-VTON eval harness (Phase 0 in the plan) once we have
  warm latency confirmed.
- Switch the LoRA hot-swap path on the legacy `tryon` task to also
  point at CatVTON if brand-DNA fine-tuning is needed.
- One-off SQL to migrate any existing `tryons.provider='hunyuan_vto'`
  rows to `'catvton_flux'`. The registry alias keeps them working in
  the meantime, but the cleanup makes analytics queries simpler.
