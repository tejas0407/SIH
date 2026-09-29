# Deployment

| Option | Cost | Best for |
|---|---|---|
| [Local (Docker Compose)](#local-development) | Free | Development and offline demos |
| [Azure for Students](#azure-for-students-recommended) | Free (student credit, no card) | The live demo — how it runs today |
| [Any Ubuntu VM](#any-ubuntu-vm) | Depends on provider | Oracle, AWS, GCP, a college server, … |
| [DigitalOcean App Platform](#digitalocean-app-platform) | Paid (~$145/month) | Fully managed services |

**Sizing.** Reading a scan peaks at about **2.3 GB of RAM**, so the full stack
needs a 4 GB machine. Free tiers limited to 512 MB (Render, Koyeb and similar)
can't run it.

---

## Local development

```bash
cp .env.example .env
docker compose up --build
docker compose exec backend python -m app.seed.load_demo
```

| Service | URL |
|---|---|
| Reviewer console | http://localhost:3000 |
| API + OpenAPI docs | http://localhost:8000/docs |
| Health check | http://localhost:8000/health |
| Object store (S3) | http://localhost:9000 |

Migrations run automatically the first time the database starts.
`docker compose down -v` removes the volumes for a clean slate.

---

## Azure for Students (recommended)

This is how the live demo runs. Azure for Students gives **$100 of credit for
12 months with no credit card** (verify with a college email, student ID or
GitHub Education). A 2 vCPU / 4 GiB VM costs about $18–31/month depending on
region, so the credit covers roughly 3–5 months.

### 1. Create the VM

1. Sign up at https://azure.microsoft.com/free/students — the student page
   never asks for a card.
2. Find your allowed regions: *Policy → Assignments → Allowed resource
   deployment regions → Parameters*. Student subscriptions get about five
   regions and only B-series sizes.
3. *Virtual machines → Create*:

   | Setting | Value |
   |---|---|
   | Region | One of the allowed regions (prefer one in or near India) |
   | Image | **Ubuntu Server 22.04 or 24.04 LTS by Canonical**, chosen from the Image dropdown — marketplace copies from other publishers cost extra and fail on a student subscription |
   | Size | `Standard_B2als_v2` (or `B2as_v2` / `B2s` — any 4 GiB B-series) |
   | Azure Spot | **Off** — Spot VMs can be evicted at any time |
   | Authentication | SSH public key → *Generate new key pair* |
   | Inbound ports | SSH (22), HTTP (80), HTTPS (443) |
   | OS disk | 64 GiB, Standard SSD |
   | Auto-shutdown | Off |

4. Create it, download the `.pem` key when prompted, and note the public IP.

### 2. Deploy

Continue with [Any Ubuntu VM](#any-ubuntu-vm) using user `azureuser`.

Track the remaining credit under *Cost Management*. Stopping (deallocating) the
VM when it isn't needed stretches the credit.

---

## Any Ubuntu VM

[`deploy/vm`](../deploy/vm) runs the [all-in-one image](../deploy/all-in-one)
behind Caddy on any Ubuntu 22.04/24.04 machine with 4 GB of RAM and ports 22,
80 and 443 open:

- automatic HTTPS at `https://<ip-with-dashes>.sslip.io` (no domain needed)
- containers restart after crashes and reboots
- the database, scans and model cache persist in Docker volumes
- secrets are generated on the server and never leave it

From the repository root on your machine:

```bash
KEY=path/to/key.pem
HOST=azureuser@<public-ip>

# one-time: 4 GB of swap as headroom for OCR
ssh -i $KEY $HOST "sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile && echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab"

# copy the code and deploy (repeat these two to ship changes)
git archive --format=tar HEAD | ssh -i $KEY $HOST "mkdir -p bhu-validate && tar -x -C bhu-validate"
ssh -i $KEY $HOST "cd bhu-validate && bash deploy/vm/setup.sh"
```

`setup.sh` installs Docker, opens the host firewall, writes
`deploy/vm/.env` (public host name and secrets — kept on re-runs) and builds and
starts the stack. The first build takes 15–25 minutes; the demo data is seeded
automatically on first boot.

**Public demo reset.** With `DEMO_NIGHTLY_RESET=1` (the default in
`deploy/vm/.env`), a cron job puts the three demo records back every night at
02:00 IST, so visitors can't leave the sandbox in a mess. To reset on demand:

```bash
ssh -i $KEY $HOST "sudo docker exec bhu-validate-app-1 python -m app.seed.reset_demo"
```

Set `DEMO_NIGHTLY_RESET=0` and re-run `setup.sh` for a deployment that holds
real records — the reset clears everything, including the audit ledger.

To build and try the all-in-one image locally:

```bash
docker build -f deploy/all-in-one/Dockerfile -t bhu-validate .
docker run --rm -p 7860:7860 -e PUBLIC_HOST=localhost:7860 -e LOCAL_HTTP=1 bhu-validate
```

**Provider notes**

- *Oracle Cloud Always Free* — use an Ampere A1 shape (ARM, up to 24 GB); the
  image builds natively on ARM. Add an ingress rule for ports 80 and 443 in the
  subnet's security list.
- *AWS / GCP* — open ports 80 and 443 in the security group / firewall rules.

---

## DigitalOcean App Platform

[`deploy/digitalocean/app.yaml`](../deploy/digitalocean/app.yaml) declares the
backend, worker and frontend, a PRE_DEPLOY migration job and managed PostgreSQL
and Redis. It needs a paid account.

1. Create a **Space** for scan storage and a Spaces access key, then fill in
   the `REPLACE_ME_*` values in the spec (as encrypted secrets — never commit
   real values).
2. Set `JWT_SECRET_KEY` and `AADHAAR_HASH_SALT` to random values
   (`python -c "import secrets; print(secrets.token_hex(32))"`).
3. Deploy:

   ```bash
   doctl auth init
   doctl apps create --spec deploy/digitalocean/app.yaml
   ```

4. Before the migration job first runs, enable the `postgis` extension on the
   managed database (*Settings → Extensions*).
5. Seed the demo data from the backend console:
   `python -m app.seed.load_demo`.

Managed Redis doesn't support multiple logical databases, so the broker,
results and review queue share one instance — functionally equivalent.
