# Migration Guide

This guide covers two migrations:

1. **Alembic** — database schema migrations.
2. **Try-On Provider** — switching between Fashn.ai (default) and the
   legacy 5-stage Replicate pipeline.

---

## Alembic Migrations

### Initial Setup

#### 1. Initialize Alembic (Already Done)

```bash
cd backend
alembic init alembic
```

---

## Try-On Provider Switch

The virtual try-on pipeline is now provider-pluggable. The runner calls
`get_tryon_provider()` (in `app/services/tryon_providers/`) instead of the
legacy `PipelineService.run_full_pipeline()` directly. There are two
providers shipped today:

| Provider slug       | Backend                                | When to use it                                   |
| ------------------- | -------------------------------------- | ------------------------------------------------ |
| `fashn`             | Fashn.ai `/v1/run`                     | **Default.** Best quality, single-call latency.  |
| `replicate_legacy`  | Existing 5-stage Replicate pipeline    | Fallback / A-B comparison, no Fashn key needed.  |

### Selecting a provider

There are two ways to pick the provider:

1. **Globally** via the `TRYON_PROVIDER` environment variable. Allowed
   values: `fashn`, `replicate_legacy`. Defaults to `fashn`.

   ```env
   TRYON_PROVIDER=fashn
   ```

   If `TRYON_PROVIDER=fashn` but `FASHN_API_KEY` is empty, the factory
   transparently falls back to `replicate_legacy` and logs a warning so
   the app keeps working in dev.

2. **Per-request** via the `X-TryOn-Provider` header on
   `POST /api/tryon/generate`. This overrides the env for that single
   request only and is the recommended way to A-B compare backends in
   QA. Example:

   ```bash
   curl -X POST https://api.example.com/api/tryon/generate \
        -H "Authorization: Bearer $JWT" \
        -H "Content-Type: application/json" \
        -H "X-TryOn-Provider: replicate_legacy" \
        -d '{"garment_id": 42, "person_image_url": "https://...", "quality": "best"}'
   ```

   Invalid slugs return `400`. The chosen provider is echoed back in the
   response body under `data.provider` and persisted on
   `tryon.pipeline_metadata.provider_override` for later debugging.

### Required environment

For the default Fashn provider, set:

```env
TRYON_PROVIDER=fashn
TRYON_OUTPUT_RESOLUTION=1024     # or 1k / 2k / 4k for the best lane
TRYON_OUTPUT_FORMAT=png          # png (default) | jpeg

FASHN_API_KEY=<from app.fashn.ai/api>
FASHN_BASE_URL=https://api.fashn.ai/v1
FASHN_HTTP_TIMEOUT_SECONDS=60
FASHN_POLL_INTERVAL_SECONDS=1.5
FASHN_MAX_WAIT_SECONDS=180
# Optional. When set, Fashn pushes status updates to
# {FASHN_WEBHOOK_URL}/{tryon_id}. Falls back to polling if blank.
FASHN_WEBHOOK_URL=https://api.example.com/api/webhooks/fashn
FASHN_DEFAULT_MODEL=tryon-v1.6
FASHN_BEST_MODEL=tryon-max
FASHN_BEST_NUM_SAMPLES=2
```

### Quality lanes

| Lane       | Fashn model    | Notes                                                                   |
| ---------- | -------------- | ----------------------------------------------------------------------- |
| `fast`     | `tryon-v1.6`   | `mode=performance`, JPEG output. ~5s.                                   |
| `balanced` | `tryon-v1.6`   | `mode=balanced`, PNG output. ~8s.                                       |
| `best`     | `tryon-max`    | `quality` mode, requests `FASHN_BEST_NUM_SAMPLES` candidates and picks  |
|            |                | the highest CLIP-similarity result via `tryon_providers.best_picker`.   |

The `best` lane is the only place we still pay for Replicate (one CLIP
embedding call per candidate, ~2s total). Fast/balanced are 100% Fashn.

### Webhooks

If `FASHN_WEBHOOK_URL` is set, the Fashn provider attaches
`?webhook_url={FASHN_WEBHOOK_URL}/{tryon_id}` to the `/v1/run` request.
Fashn POSTs the status payload to that URL when the prediction settles;
`POST /api/webhooks/fashn/{tryon_id}` (registered in `app/main.py`)
applies the result to the row directly. The runner's polling loop is
still the source-of-truth fallback in case the webhook is missed.

### A-B smoke testing

Use the shipped smoke script to run the same inputs through every
configured provider and compare outputs side-by-side:

```bash
cd backend
python -m scripts.tryon_provider_smoke \
    --person  https://example.com/person.jpg \
    --garment https://example.com/garment.jpg \
    --category tops \
    --quality best \
    --providers fashn replicate_legacy \
    --out ./smoke_outputs
```

The script writes each candidate to
`./smoke_outputs/<provider>__<quality>__<idx>.<ext>` and prints a JSON
summary with per-provider timings and cost estimates.

### Rollback

To go back to the legacy pipeline globally, set:

```env
TRYON_PROVIDER=replicate_legacy
```

No code changes or redeploys are needed. The legacy multi-stage statuses
(`GARMENT_EXTRACTING`, `STAGE2_PROCESSING`, etc.) and progress map are
still wired up in `PROGRESS_MAP` / `STAGE_LABEL_MAP`.

---

## Quality Layers (Layer 1 input gate + Layer 2 post-processing)

On top of the Fashn provider we run a quality stack that wraps every
2D try-on:

```
preprocessor (existing)
  -> Layer 1 input gate         (pose / blur / coverage + smart crop)
  -> Layer 1 BG isolate         (rembg, off by default)
  -> provider.run               (Fashn)
  -> Layer 2 candidate rescore  (CLIP garment x CLIP face identity)
  -> Layer 2 identity retry     (re-run provider with fresh seed if drifted)
  -> Layer 2 face restore       (GFPGAN, Apache 2.0)
  -> Layer 2 upscale            (Real-ESRGAN, BSD-3)
  -> Layer 2 BG compose         (rembg, off by default)
  -> persist final URL on tryons.result_image_url
```

Every step is **best-effort**: a failure is logged and recorded in
`tryon.pipeline_metadata.postprocess.notes`, then the pipeline falls
through to the previous stage's URL. The user always gets *some* image
back; the only hard-fail path is the input gate, and only when
`INPUT_GATE_HARD_FAIL=true`.

### Provider gating

The post-processing stack only runs when **`provider.name == "fashn"`**.
The `replicate_legacy` provider keeps its existing internal multi-stage
pipeline and is never wrapped. Flip providers via `TRYON_PROVIDER` or
the per-request `X-TryOn-Provider` header (see above) and the stack
automatically detaches.

### Lane gating

The `POSTPROCESS_LANES` env var controls which Fashn quality lanes get
post-processed. Default `balanced,best`. The `fast` lane stays raw so
its sub-5s latency advantage is preserved.

```env
POSTPROCESS_LANES=balanced,best
```

### Master switch

To disable the entire Layer 2 stack (e.g. for a raw-baseline A/B):

```env
TRYON_POSTPROCESS_ENABLED=false
```

Layer 1 (input gate) is independently gated by `INPUT_GATE_ENABLED` so
you can keep the smart crop on while turning the post-processing off.

### Required environment

Defaults that ship in `.env.example` are sensible for production. The
ones you typically tune:

```env
# Master + lane gating
TRYON_POSTPROCESS_ENABLED=true
POSTPROCESS_LANES=balanced,best

# Layer 1: input gate
INPUT_GATE_ENABLED=true
INPUT_GATE_HARD_FAIL=false             # warn-only by default
INPUT_GATE_MIN_BLUR_VAR=80.0           # 0 disables the blur check
INPUT_GATE_MIN_BODY_COVERAGE=0.55      # fraction of YOLO11 keypoints
INPUT_GATE_SMART_CROP=true
INPUT_GATE_SMART_CROP_PADDING=0.08

# Layer 1/2: BG isolate + composite (off by default)
BG_ISOLATE_ENABLED=false
BG_COMPOSE_ENABLED=false               # requires BG_ISOLATE_ENABLED=true

# Layer 2: identity drift detection
IDENTITY_CHECK_ENABLED=true
IDENTITY_DRIFT_THRESHOLD=0.78          # CLIP cosine on face crop
IDENTITY_RETRY_MAX=1                   # provider re-runs if no candidate is OK

# Layer 2: face restoration (GFPGAN, Apache 2.0)
FACE_RESTORE_ENABLED=true
FACE_RESTORE_MODEL=tencentarc/gfpgan   # pin :version for determinism
FACE_RESTORE_SCALE=2

# Layer 2: super-resolution (Real-ESRGAN, BSD-3)
UPSCALE_ENABLED=true
UPSCALE_MODEL=nightmareai/real-esrgan
UPSCALE_FACTOR=2
UPSCALE_FACE_ENHANCE=false             # off because GFPGAN already restored faces

# Multi-sample on the balanced lane so the picker has 2 candidates
FASHN_BALANCED_NUM_SAMPLES=2
```

### License compliance (commercial-safe)

All shipped models are commercial-OK:

| Model         | License    | Purpose                |
| ------------- | ---------- | ---------------------- |
| GFPGAN        | Apache 2.0 | Face restoration       |
| Real-ESRGAN   | BSD-3      | Super-resolution       |
| rembg         | MIT        | BG isolate / compose   |
| BiRefNet      | MIT        | (transitive via rembg) |
| YOLO11-pose   | AGPL       | (already in use; service-only invocation) |
| CLIP features | MIT        | Identity check + picker (via existing `garment_processor`) |

Models we **considered but rejected** for licensing reasons:
CodeFormer (S-Lab, non-commercial), InsightFace `buffalo_l`/`antelopev2`/`inswapper`
(paid commercial license), RMBG-2.0 (paid commercial license),
IDM-VTON (CC BY-NC-SA 4.0), most VITON-HD-trained checkpoints (dataset
restrictions).

### Latency / cost budget per try-on

Numbers are warm-cache, balanced lane, `num_samples=2`:

| Step                       | Wall time   | $ per try-on |
| -------------------------- | ----------- | ------------ |
| input_gate                 | ~0.4s       | 0            |
| provider.run (Fashn)       | ~6-9s       | ~$0.08       |
| candidate rescore (CLIP)   | ~0.5s       | <$0.001      |
| identity check (CLIP face) | ~0.5s       | <$0.001      |
| face_restore (GFPGAN)      | ~1.5-3s     | ~$0.0023     |
| upscale (Real-ESRGAN)      | ~1.5-3s     | ~$0.0023     |
| **Total added by L1+L2**   | **+4-7s**   | **+$0.005**  |

The fast lane bypasses all of this and stays at ~5s.

### Database changes

Adds **one** value (`POSTPROCESSING`) to the `tryonstatus` Postgres enum:

```bash
cd backend
alembic upgrade head    # applies 007_tryon_postprocessing_status
```

The migration uses `ALTER TYPE ... ADD VALUE IF NOT EXISTS` so it is
idempotent. Downgrade is a no-op (Postgres can't drop enum values
without recreating the type, and no rows depend on this value going
away).

### Pipeline metadata schema

Everything else is stashed under `tryons.pipeline_metadata` (JSONB):

```json
{
  "mode": "2d",
  "provider": "fashn",
  "input_gate": {
    "passed": true,
    "smart_cropped": true,
    "metrics": { "blur_var": 142.3, "body_coverage": 0.94, "face_visible": true }
  },
  "postprocess": {
    "current_stage": "postprocess_face",
    "metrics": { "lane": "balanced", "identity": { "similarity": 0.91 } },
    "notes": [{ "step": "face_restore", "status": "ok", ... }],
    "timings": { "face_restore_seconds": 2.1, "upscale_seconds": 1.8, "total_seconds": 6.4 },
    "retried_provider": false,
    "raw_provider_url": "https://.../raw.png"
  }
}
```

### A-B smoke testing the post-processing

The shipped smoke script accepts a `--postprocess` flag that runs the
full Layer 2 stack against the raw provider output and dumps both the
raw and post-processed images:

```bash
cd backend
python -m scripts.tryon_provider_smoke \
    --person  https://example.com/person.jpg \
    --garment https://example.com/garment.jpg \
    --quality balanced \
    --providers fashn \
    --postprocess \
    --out ./smoke_outputs
```

You'll get `fashn__balanced__raw__0.png`,
`fashn__balanced__raw__1.png`, and
`fashn__balanced__postprocessed.png`, plus the metrics JSON on stdout.

### Rollback

* **Disable the whole stack**: `TRYON_POSTPROCESS_ENABLED=false`
* **Disable a single step**: e.g. `FACE_RESTORE_ENABLED=false`
* **Roll back the lane**: `POSTPROCESS_LANES=best` to keep balanced raw
* **Roll back the schema**: `alembic downgrade -1` (no-op, see above)

No code redeploy required for any of these.
