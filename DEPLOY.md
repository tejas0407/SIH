# Deploying to DigitalOcean App Platform

App Platform's "Create App" wizard scans the repo root for a `package.json`,
`requirements.txt`, or a top-level `Dockerfile` and gives up with **"No
components detected"** if it finds none — which is exactly what happens here,
because this repo's two Dockerfiles live under [docker/](docker/) and build
against the repo root as their context (they `COPY backend/` and `COPY
frontend/` explicitly). The fix is to skip the wizard and deploy from the
explicit app spec at [.do/app.yaml](.do/app.yaml) instead, which declares
every component by hand.

## What the spec sets up

| Component | Source | Purpose |
|---|---|---|
| `backend` | `docker/backend.Dockerfile` | FastAPI API, port 8000 |
| `celery-worker` | same image, different command | runs the CV/OCR pipeline |
| `frontend` | `docker/frontend.Dockerfile` | Next.js reviewer console, port 3000 |
| `migrate` (job) | same image as backend | applies the SQL schema before each deploy |
| `land-records-db` | managed database | PostgreSQL 16 |
| `land-records-redis` | managed database | Redis (Celery broker/results + HITL queue) |

Object storage is **not** provisioned by the spec — App Platform has no native
binding for DigitalOcean Spaces the way it does for its own managed databases,
so that step is manual (below).

## One-time setup, before the first deploy

1. **Push this repo to GitHub** so App Platform can pull from it (see the
   note on your git setup below if you haven't done this yet).

2. **Create a DigitalOcean Space** (Spaces Object Storage → Create a Space)
   for scan storage, and generate a Spaces access key/secret under
   *API → Spaces Keys*. Edit `.do/app.yaml` and replace the four
   `REPLACE_ME_*` placeholders under the `backend` service's `envs` with:
   - `MINIO_ENDPOINT` / `MINIO_PUBLIC_ENDPOINT`: your Space's endpoint, e.g.
     `nyc3.digitaloceanspaces.com`
   - `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`: the Spaces access key/secret
   The existing MinIO Python client code needs no changes — Spaces speaks the
   same S3 API.

3. **Generate real secrets** for `JWT_SECRET_KEY` and `AADHAAR_HASH_SALT` in
   the spec (e.g. `python -c "import secrets;print(secrets.token_hex(32))"`
   run twice) — the repo's values are dev-only placeholders and must not go
   to production as-is.

4. **Don't commit real secret values.** Either fill the four sections above
   in with a placeholder and set the real values via `doctl apps update
   <app-id> --spec .do/app.yaml` after first creating the app through the
   dashboard so you can edit encrypted env vars there instead, or keep a
   local, gitignored copy of `.do/app.yaml` with real values and deploy from
   that copy directly.

## Deploy

```bash
doctl auth init                              # once, with a DO API token
doctl apps create --spec .do/app.yaml
```

This provisions the two managed databases, builds and deploys all three
components, and runs the `migrate` job before the backend goes live.

**Enable PostGIS before the migrate job runs its first time**: open the new
`land-records-db` cluster in the DigitalOcean dashboard → *Settings* →
*Extensions*, and enable `postgis`. The schema migration's first statement is
`CREATE EXTENSION IF NOT EXISTS postgis;`, which only succeeds once the
extension is allow-listed there — a managed cluster doesn't grant that by
default the way the local `postgis/postgis` Docker image does.

Once it's live, seed the demo data and reviewer accounts through the App
Platform console (Console tab on the `backend` component) or `doctl`:

```bash
python -m app.seed.load_demo
```

## After changes

```bash
doctl apps update <app-id> --spec .do/app.yaml
```

Or just push to `main` — every service has `deploy_on_push: true`, so a
normal `git push` redeploys automatically once the app exists.

## Sizing and known trade-offs

- The backend/worker image bundles PaddleOCR, TrOCR (PyTorch) and
  Transformers. `apps-s-2vcpu-4gb` is close to the minimum that won't OOM
  during inference — watch the component's memory graph after the first few
  uploads and size up if you see it pinned near the limit.
- DigitalOcean's managed Redis doesn't support the multi-database `SELECT`
  the local `docker-compose.yml` uses to separate the HITL queue, the Celery
  broker, and Celery's result backend onto Redis logical databases 0/1/2. The
  spec points all three at the same managed instance instead — harmless
  functionally, just less isolated than local dev.
- Tesseract with Hindi/Marathi/English stays baked into the image as the
  offline OCR fallback exactly as it is locally, so the deployed pipeline
  degrades the same way local docker-compose does if PaddleOCR/TrOCR weights
  aren't cached yet on first request.
