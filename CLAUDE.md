# ALTER.ai / GradFiT — Claude Code Context

This file is the default operating context for Claude Code in this repository.
Use it for all major tasks across backend, ML pipeline, and frontend.

## Product and Goal

- Product: AI virtual try-on and fashion generation platform.
- Core areas:
  - FastAPI backend API and orchestration (`backend/`)
  - ML serving and deployment pipeline (`ml-pipeline/`)
  - Next.js frontend app (`frontend/`)
  - Chrome extension (`chrome-extension/`)
- Primary local dev flow runs backend + frontend together from repo root.

## Repository Map

- `backend/` FastAPI, SQLAlchemy, Alembic, async/job integrations, providers.
- `ml-pipeline/` model-serving container, SageMaker infra/scripts, benchmarking.
- `frontend/` Next.js App Router, React 19, TypeScript, UI components.
- `chrome-extension/` extension scripts/UI for browser integration.
- `README.md` high-level local development entry.

## Current Stack

- Backend: Python, FastAPI, SQLAlchemy, Alembic, Redis, Celery, Stripe, AWS SDK.
- Frontend: Next.js 16, React 19, TypeScript, Tailwind, Radix UI, React Query.
- ML Serving: Docker BYOC for SageMaker async inference, FLUX/ControlNet/SAM2 stack.
- Infra touchpoints: AWS S3 + SageMaker + EventBridge/Lambda automation scripts.

## Run and Build Commands

### Workspace root

- Start backend + frontend together:
  - `npm run dev`
- Expected local ports:
  - Backend `http://localhost:8000`
  - Frontend `http://localhost:3000`

### Backend (`backend/`)

- Install deps:
  - `pip install -r requirements.txt`
- Run API:
  - `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`
- Tests:
  - `pytest`
- Migrations:
  - `alembic upgrade head`

### Frontend (`frontend/`)

- Install deps:
  - `npm install`
- Dev server:
  - `npm run dev`
- Lint:
  - `npm run lint`
- Build:
  - `npm run build`

### ML Pipeline (`ml-pipeline/serving/`)

- Build serving image:
  - `docker build -t gradfit-serving:dev ml-pipeline/serving`
- Run container locally:
  - `docker run --gpus all -p 8080:8080 ... gradfit-serving:dev`
- Smoke test:
  - `python ml-pipeline/serving/scripts/smoke_test.py --bucket <bucket>`
- Deploy flow:
  - `python ml-pipeline/serving/scripts/deploy_sagemaker.py`
  - `python ml-pipeline/serving/scripts/apply_ops_cost.py`

## Architecture Notes

### Backend

- Entry point: `backend/app/main.py`.
- Routers are registered via `backend/app/api/routes/`.
- Key route domains include auth, users, garments, try-on, upload, billing, affiliate, webhook, studios, brand DNA.
- Data layer and models live under `backend/app/database.py` and `backend/app/models/`.
- Business logic is service-heavy in `backend/app/services/`.
- Alembic migrations in `backend/alembic/versions/`.

### ML Pipeline

- Serving container hosts tasks such as `tryon`, `design`, `stylist`, `mask`, `upscale`.
- Supports dynamic LoRA loading from S3 per request.
- SageMaker async endpoint target profile is documented in `ml-pipeline/serving/README.md`.

### Frontend

- App Router pages are in `frontend/app/`.
- Shared UI components are in `frontend/components/`.
- Studio workflows and try-on UX are split across app routes and studio components/hooks.

## Working Rules for Claude Code

1. Preserve existing architecture and naming conventions unless asked to refactor.
2. Prefer minimal, targeted edits over broad rewrites.
3. Keep API contracts backward compatible when possible.
4. If changing backend request/response shapes, update frontend callers in the same task.
5. For DB model changes, include Alembic migration updates.
6. For ML payload changes, ensure backend and serving schema alignment.
7. Add or update tests for non-trivial logic changes.
8. Run lint/tests relevant to touched areas before finalizing.
9. Avoid touching generated/cache artifacts (for example `.next/`, temporary outputs).
10. Never commit secrets from `.env` or cloud credentials.

## Environment and Secrets

- Use `backend/.env` for local backend configuration.
- Treat all API keys/tokens/secrets as sensitive.
- Do not print or persist secret values in code, logs, or commit history.
- Prefer `.env.example` updates when introducing new environment variables.

## Cross-Stack Change Checklist

When implementing a feature that spans multiple layers:

1. Backend API route + schema updates.
2. Service/business logic updates.
3. Frontend integration update (API call + UI state/error handling).
4. ML serving payload/response updates when needed.
5. Migration + data compatibility checks when models change.
6. Tests/lint/build verification for touched projects.

## Default Task Strategy

- For backend-heavy work:
  - Identify route -> schema -> service -> model path first.
- For ML-heavy work:
  - Validate expected request/response contract and infra script impact.
- For frontend-heavy work:
  - Keep UX responsive and typed; preserve component composition patterns.
- For major tasks:
  - Split into small verifiable steps, then integrate end-to-end.

## Known Focus Areas

- Try-on quality pipeline (input gate, postprocess, provider selection).
- Studios/Brand DNA domains and related API/frontend surfaces.
- Billing and affiliate flows (Stripe/webhooks/outbound links).
- ML serving reliability and cost-aware SageMaker operations.

