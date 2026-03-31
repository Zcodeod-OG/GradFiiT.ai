# Rollout Summary (Production Decision Record)

This file must be completed for each release candidate before production launch.

## A. Change Set
1. Queue-first orchestration changes:
2. Lifecycle/telemetry changes:
3. Quality gate and threshold changes:
4. Routing or fallback changes:

## B. Benchmark Evidence
1. Dataset version:
2. Sample size:
3. p50 latency (success cases):
4. p95 latency (success cases):
5. Failure rate:
6. Dead-letter rate:
7. Human-review acceptance rate:

Attach artifacts:
1. ml-pipeline/benchmarks/benchmark_results.json
2. ml-pipeline/benchmarks/release_gate_report.json
3. ml-pipeline/benchmarks/calibrated_thresholds.json (if recalibrated)

## C. Release Gate Decision
1. Gate status: PASS / FAIL
2. Failed gates (if any):
3. Waiver approved: YES / NO
4. Waiver approver:

## D. Risks and Mitigations
1. Top reliability risk:
2. Top quality risk:
3. Top operations risk:
4. Mitigations in place:

## E. Rollout Plan
1. Internal validation window:
2. 5% traffic window:
3. 25% traffic window:
4. 100% traffic target:
5. Rollback owner on-call:

## F. Sign-Off
1. Engineering lead:
2. Product lead:
3. Date:
