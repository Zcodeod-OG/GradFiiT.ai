# Production Runbook

This runbook is the deployment and operations source of truth for apparel virtual try-on.

## 1. Go/No-Go Criteria

Deployment is allowed only when all of the following are true:
1. Database migrations are applied in target environment.
2. Installation smoke test passes.
3. Model manifest is generated and model verification passes.
4. Benchmark sample size is at least 100 cases.
5. Release gate report passes all checks.
6. Rollout summary is completed and signed by engineering + product.

## 2. Environment Prerequisites

Required services:
1. PostgreSQL
2. Redis
3. Backend API
4. Celery workers

Required environment variables:
1. DATABASE_URL
2. REDIS_URL / CELERY_BROKER_URL / CELERY_RESULT_BACKEND
3. REPLICATE_API_TOKEN
4. AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION / S3_BUCKET_NAME
5. QUALITY_THRESHOLD_EXCELLENT / QUALITY_THRESHOLD_ACCEPTABLE / QUALITY_THRESHOLD_POOR

Required feature flags:
1. ENABLE_CELERY_TRYON=true
2. ENABLE_CELERY_GARMENT_PREPROCESS=true
3. ALLOW_THREAD_FALLBACK_FOR_TRYON=false (enforce queue-first in production)

## 3. Pre-Release Commands

Run from repo root:

```bash
python ml-pipeline/scripts/test_installation.py
python ml-pipeline/scripts/download_models.py
python ml-pipeline/scripts/verify_model.py
python ml-pipeline/scripts/benchmark_runner.py --token <JWT> --input ml-pipeline/benchmarks/<real_dataset>.jsonl --output ml-pipeline/benchmarks/benchmark_results.json --fail-on-errors
python ml-pipeline/scripts/release_gate_check.py --metrics ml-pipeline/benchmarks/benchmark_results.json --out ml-pipeline/benchmarks/release_gate_report.json --min-sample-size 100 --p50-threshold-seconds 8 --p95-threshold-seconds 20 --failure-rate-threshold 0.01
```

If threshold recalibration is needed:

```bash
python ml-pipeline/scripts/calibrate_thresholds.py --input ml-pipeline/benchmarks/<human_rated>.csv --output ml-pipeline/benchmarks/calibrated_thresholds.json --min-rows 30
```

## 4. Startup Order

1. Start Redis.
2. Start backend API.
3. Start Celery workers.
4. Confirm API health and worker registration.

Worker command:

```bash
celery -A app.services.tasks.celery_app worker --loglevel=info --concurrency=4
```

## 5. Runtime Monitoring

Track these KPIs every 15 minutes during rollout:
1. queue_wait_ms p50/p95
2. execution_ms p50/p95
3. total_latency_ms p50/p95
4. failure rate
5. dead-letter count

Rollout progression:
1. Internal traffic
2. 5% traffic for 30 minutes
3. 25% traffic for 60 minutes
4. 100% traffic after gate re-check

Pause rollout immediately if:
1. failure rate >= 1%
2. dead-letter rate rising over 15-minute windows
3. p95 total latency > 20s

## 6. Incident Response

1. Confirm Redis and Celery health.
2. Inspect latest dead-letter and failed try-ons.
3. Check external provider errors (Replicate and S3).
4. If queue is unstable, keep queue-first behavior and reduce traffic.
5. Re-run benchmark and release gate before resuming normal traffic.

## 7. Rollback Conditions

Rollback is mandatory if any of the following hold for 2 consecutive windows:
1. failure rate > 1%
2. dead-letter rate > 0.5%
3. p95 latency > 25s

Rollback actions:
1. Stop traffic ramp.
2. Revert to last stable deployment.
3. Preserve benchmark and incident artifacts.
4. Publish incident summary with root-cause owner.
