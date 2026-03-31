# Benchmark Suite

This folder contains benchmark inputs and outputs for latency and quality calibration.

## Input format
Use JSONL where each line contains:
- person_image_url
- garment_id
- quality (optional, default `auto`)
- idempotency_key (optional)

Example line:
```json
{"person_image_url":"https://.../person.jpg","garment_id":42,"quality":"auto","idempotency_key":"bench-0001"}
```

## Run benchmark
```bash
python ml-pipeline/scripts/benchmark_runner.py --token <JWT> --input ml-pipeline/benchmarks/<real_cases>.jsonl --output ml-pipeline/benchmarks/benchmark_results.json --fail-on-errors
```

## Release gate
```bash
python ml-pipeline/scripts/release_gate_check.py --metrics ml-pipeline/benchmarks/benchmark_results.json --out ml-pipeline/benchmarks/release_gate_report.json --min-sample-size 100 --p50-threshold-seconds 8 --p95-threshold-seconds 20 --failure-rate-threshold 0.01
```

## Production guidance
- Use at least 100 benchmark cases for gate validity.
- Any case ending in timeout, unknown, request_error, or http_error is counted as a failure.
- p95 is computed with nearest-rank logic to avoid underestimating tail latency on small samples.
