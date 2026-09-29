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

---

# Recommended: Azure for Students (free, no card)

This is how the live deployment runs. **Azure for Students** gives $100 of
credit for 12 months with no credit card (verify with a college email, student
ID or GitHub Education). A `Standard_B2als_v2` VM (2 vCPU, 4 GiB) costs about
$18–31/month depending on region, so the credit keeps the site up for roughly
3–5 months. Reading a scan peaks at about 2.3 GB of RAM, which is why the
512 MB free tiers elsewhere (Render, Koyeb, ...) can't run the full stack.

It uses the same single-container image and [deploy/oracle/](deploy/oracle/)
setup as the Oracle section below — nothing in them is Oracle-specific.

## 1. Create the VM (Azure portal)

1. Sign up at https://azure.microsoft.com/free/students — the student page,
   which never asks for a card.
2. Find the regions your subscription allows: *Policy → Assignments →
   Allowed resource deployment regions → Parameters*. Student subscriptions
   get about five, and only B-series sizes.
3. *Virtual machines → Create*:
   - **Region:** one of the allowed ones (prefer one in or near India)
   - **Image:** Ubuntu Server 22.04 or 24.04 LTS **by Canonical**, picked
     from the Image dropdown. Marketplace copies from other publishers
     (cloudimg, ATH Infosystems, ...) cost extra and fail validation on a
     student subscription.
   - **Size:** `Standard_B2als_v2`; else `Standard_B2as_v2` or `Standard_B2s`
     (any 4 GiB B-series). **Untick "Azure Spot"** — Spot VMs can be evicted
     at any time.
   - **Authentication:** SSH public key → *Generate new key pair*
   - **Inbound ports:** SSH (22), HTTP (80), HTTPS (443)
   - **Disks:** OS disk **64 GiB**, Standard SSD
   - **Management:** auto-shutdown **off**
4. Create, download the `.pem` key when prompted, and note the public IP.

## 2. Deploy

From the repo root on your machine (replace the key path and IP):

```bash
ssh -i path/to/key.pem azureuser@<public-ip> "sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile && echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab"
git archive --format=tar HEAD | ssh -i path/to/key.pem azureuser@<public-ip> "mkdir -p bhu-validate && tar -x -C bhu-validate"
ssh -i path/to/key.pem azureuser@<public-ip> "cd bhu-validate && bash deploy/oracle/setup.sh"
```

The 4 GB swap file is a safety margin: OCR plus Postgres sits close to the
VM's 4 GiB at peak. The first build takes 15–25 minutes; the site is then at
`https://<public-ip-with-dashes>.sslip.io`. Re-run the last two commands to
deploy new changes; the secrets and all data are kept.

Watch the credit under *Cost Management* in the portal, and stop (deallocate)
the VM when it isn't needed to stretch it further.

---

# Always-on and free: Oracle Cloud Always Free VM

Oracle's Always Free tier includes an Ampere A1 (ARM) VM with up to 4 OCPUs
and 24 GB RAM, enough for the whole stack including OCR. The single-container
image from [docker/single/Dockerfile](docker/single/Dockerfile) (the whole
stack — PostGIS, Redis, SeaweedFS (S3), backend, worker and frontend — under
supervisord, with nginx on port 7860) builds natively on ARM,
and [deploy/oracle/](deploy/oracle/) adds Caddy in front for automatic HTTPS
and Docker volumes so data survives restarts and reboots.

## 1. Create the VM (Oracle console)

1. Sign up at https://www.oracle.com/cloud/free/ (a card is needed for
   verification only; Always Free resources are not charged).
2. *Compute → Instances → Create instance*:
   - **Image:** Canonical Ubuntu 22.04 (or 24.04)
   - **Shape:** *Change shape → Ampere → VM.Standard.A1.Flex*, 4 OCPUs, 24 GB
   - **SSH keys:** *Generate a key pair for me* and download the private key
   - **Boot volume:** 100 GB (the image is large; up to 200 GB is free)
3. Open the instance's subnet → *Security list* → *Add ingress rules*:
   source `0.0.0.0/0`, TCP, destination ports `80,443`.

If creation fails with *Out of capacity*, try another availability domain
or retry later; free Ampere capacity is limited in popular regions.

## 2. Copy the code and start it

From the repo root on your own machine (replace the key path and IP):

```bash
git archive --format=tar HEAD | ssh -i path/to/ssh-key.key ubuntu@<public-ip> "mkdir -p bhu-validate && tar -x -C bhu-validate"
ssh -i path/to/ssh-key.key ubuntu@<public-ip> "cd bhu-validate && bash deploy/oracle/setup.sh"
```

The first build takes 15–25 minutes. The app is then served at
`https://<public-ip-with-dashes>.sslip.io` with a real certificate, and both
containers restart automatically after crashes and reboots.

To deploy new changes, run the same two commands again: the `.env` with the
host name and secrets is kept, and so is all data.

## Notes

- Oracle may reclaim Always Free instances that stay nearly idle for 7 days.
  Upgrading the account to Pay As You Go (still free for Always Free
  resources) removes that.

## Test the image locally

```bash
docker build -f docker/single/Dockerfile -t bhu-validate .
docker run --rm -p 7860:7860 -e PUBLIC_HOST=localhost:7860 -e LOCAL_HTTP=1 bhu-validate
```

Then open http://localhost:7860.
