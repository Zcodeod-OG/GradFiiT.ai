# Studio verification (Design + Stylist)

Use this checklist after deploying backend + SageMaker serving changes to confirm Design and Stylist studios return images end to end.

## Prerequisites

- Backend running with valid AWS credentials and SageMaker endpoint configured.
- At least one authenticated user account.
- SageMaker serving container deployed with `design` and `stylist` tasks enabled.

## Smoke script

From the repo root with backend dependencies installed:

```bash
python -m scripts.studio_smoke \
  --base-url https://gradfit-ai.onrender.com \
  --email you@example.com \
  --password 'your-password'
```

Options:

| Flag | Purpose |
|------|---------|
| `--token` | Skip login with an existing bearer token |
| `--task design` | Run design generation only |
| `--task stylist` | Run stylist generation only |
| `--timeout 300` | Max seconds to wait per generation |

**Pass criteria:** stdout prints `primary_image_url=...` for each task and exits with code `0`.

**Common failures:**

| Symptom | Likely cause |
|---------|----------------|
| `502` with SageMaker message | Endpoint cold, misconfigured, or container error |
| `no image -- error: no images returned` | Backend ↔ serving contract mismatch (field names in payload) |
| Login failure | Wrong credentials or backend auth misconfiguration |
| Timeout | Cold SageMaker endpoint; retry with higher `--timeout` |

## Manual UI check

1. Open `/studios/design`, enter a short prompt, click **Generate**.
2. Confirm the canvas shows a rendered garment within ~60–120s.
3. Open `/studios/stylist`, add two pieces + mood, click **Generate look**.
4. Confirm a full-look image appears.
5. With Brand DNA configured at `/account/brand-dna`, confirm the **Brand DNA active** badge appears and generations include your voice/palette prefix.

## Closet smoke (related)

To verify closet recommendations → looks → render:

```bash
python -m scripts.closet_smoke \
  --base-url http://localhost:8000 \
  --email you@example.com \
  --password 'your-password'
```

Use `--no-render` to stop after creating a look without waiting for combo try-on.
