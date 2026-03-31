# Deployment Checklist (Apparel Try-On)

Use this checklist for same-day production deployment readiness.

## 1. Environment
- [ ] Production environment variables are set.
- [ ] Database and Redis connectivity verified.
- [ ] Celery worker can connect to broker and result backend.
- [ ] REPLICATE_API_TOKEN is present and valid.

## 2. Build and Dependency Integrity
- [ ] python ml-pipeline/scripts/test_installation.py passes.
- [ ] python ml-pipeline/scripts/download_models.py passes.
- [ ] python ml-pipeline/scripts/verify_model.py passes.

## 3. Data and Benchmarking
- [ ] Benchmark dataset is production-representative.
- [ ] Benchmark sample size is >= 100.
- [ ] No benchmark case ends in timeout or unknown state.
- [ ] Benchmark output written to ml-pipeline/benchmarks/benchmark_results.json.

## 4. Release Gate
- [ ] python ml-pipeline/scripts/release_gate_check.py passes.
- [ ] Gate report archived in ml-pipeline/benchmarks/release_gate_report.json.
- [ ] Failure rate < 1%.
- [ ] p50 success latency < 8s.
- [ ] p95 success latency < 20s.

## 5. Threshold Calibration
- [ ] Thresholds are calibrated with human-labeled data (>= 30 rows).
- [ ] QUALITY_THRESHOLD_EXCELLENT updated from calibration output.
- [ ] QUALITY_THRESHOLD_ACCEPTABLE updated from calibration output.
- [ ] QUALITY_THRESHOLD_POOR updated from calibration output.

## 6. Rollout Governance
- [ ] Rollout summary completed in ml-pipeline/docs/rollout_summary.md.
- [ ] Engineering sign-off recorded.
- [ ] Product sign-off recorded.
- [ ] Rollback owner and escalation path confirmed.

## 7. Post-Deploy Observation (first 60 minutes)
- [ ] queue_wait_ms p95 within expected range.
- [ ] total_latency_ms p95 within expected range.
- [ ] dead-letter count remains stable.
- [ ] No sustained error spike for 2 consecutive windows.
