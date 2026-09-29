<div align="center">

# Bhu-Validate

**Intelligent land record digitisation and validation for India's revenue offices**

Smart India Hackathon 2026 · Problem Statement **SIH26018** · Ministry of Rural Development (DILRMP)

[![Live demo](https://img.shields.io/badge/live%20demo-online-2ea44f?style=flat-square)](https://172-198-137-255.sslip.io)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js%2014-000000?style=flat-square&logo=nextdotjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL%20%2B%20PostGIS-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white)
![Tests](https://img.shields.io/badge/tests-40%20passing-2ea44f?style=flat-square)

[Live demo](https://172-198-137-255.sslip.io) ·
[Architecture](docs/ARCHITECTURE.md) ·
[Deployment](docs/DEPLOYMENT.md) ·
[Demo script](docs/DEMO_SCRIPT.md)

<img src="docs/images/review.png" alt="Review workspace: the scanned register on the left with detected fields boxed, the editable record on the right" width="100%">

</div>

---

## The problem

Records of Rights — Jamabandi, 7/12 extracts, Khatauni — sit in tehsil record
rooms as folded, faded, handwritten paper, in many scripts and in regional units
of area that don't agree with each other. Digitising them with OCR alone is not
enough: a record can be read at 99% confidence and still be wrong.

**Bhu-Validate treats arithmetic as the test of truth.** Parcels must add up to
the declared holding and ownership shares must close at 100%. Records that are
confident *and* consistent commit themselves; everything else goes to an
officer, worst first, in a side-by-side editor built for long working days.

## Features

- **Reads difficult scans** — deskew, bleed-through removal, Sauvola
  binarisation and fold repair before OCR (PaddleOCR, with Tesseract for Hindi,
  Marathi and English built in, so it works fully offline).
- **Checks the numbers** — area and share invariants, duplicate survey numbers,
  missing owners, and region-aware unit conversion (a Bigha in Meerut is not a
  Bigha in Patna).
- **Human review only where needed** — confident, consistent records
  auto-commit; the rest are queued lowest-confidence first.
- **Side-by-side editor** — every detected field is boxed on the scan; focusing
  a field zooms to it. Multi-page PDFs and TIFFs with a page switcher.
- **Role-based sign-off** — Patwaris verify; only a Tehsildar can sign a record
  with a failing check, and the override is recorded.
- **Tamper-evident audit ledger** — every correction is hash-chained; the
  database refuses edits and deletes to history.
- **Certified copy** — a printable, bilingual Record of Rights with the signer,
  date and digital seal.
- **Seven Indian languages** — Hindi, Bengali, Marathi, Telugu, Tamil, Gujarati
  and Kannada, always shown beside English, with large, high-contrast text.

<table>
  <tr>
    <td width="50%"><img src="docs/images/language.png" alt="Language chooser with seven Indian languages"></td>
    <td width="50%"><img src="docs/images/certified.png" alt="Certified Record of Rights in Hindi and English"></td>
  </tr>
  <tr>
    <td align="center"><sub>Language chooser after sign-in</sub></td>
    <td align="center"><sub>Certified copy of a signed record</sub></td>
  </tr>
</table>

## How it works

```mermaid
flowchart TD
    scan([Scanned register]) --> pipe["Clean · segment · OCR · extract"]
    pipe --> check{"Confident and<br/>numbers add up?"}
    check -- yes --> reg[(Land register)]
    check -- no --> queue["Review queue<br/>worst first"]
    queue --> officer["Officer corrects side by side<br/>and e-signs"]
    officer --> ledger["Hash-chained audit ledger"]
    ledger --> reg
    reg --> cert([Certified copy])
```

```
C_total = 0.5 · OCR + 0.3 · Layout + 0.2 · MathChecksPassed
auto-commit  ⇔  C_total ≥ 0.85  and  no critical finding
```

The full design — components, sequence and state diagrams, data model, security
and deployment — is in **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

## Quick start

Requires Docker. Everything runs locally; no paid API or internet access is
needed after the images are built.

```bash
git clone https://github.com/tejas0407/SIH.git && cd SIH
cp .env.example .env
docker compose up --build            # or: make up
docker compose exec backend python -m app.seed.load_demo   # demo accounts + records
```

Open **http://localhost:3000** and sign in:

| Role | User ID | Password | Can |
|---|---|---|---|
| Patwari | `patwari.demo` | `patwari@123` | Review, correct and sign records that pass every check |
| Tehsildar | `tehsildar.demo` | `tehsildar@123` | Also sign records with a failing check (recorded as an override) |

API documentation is served at http://localhost:8000/docs. Run `make help` for
the other commands, and `make test` for the test suite.

### Demo records

The seed renders three **synthetic** register pages (real records contain
citizens' personal data):

| Record | Page | Outcome |
|---|---|---|
| Khata 142 | Maharashtra 7/12, clean | 97% confidence, numbers close — commits with no human involved |
| Khata 87 | Western UP Khatauni, rotated, folded, faded | Restored to 0° skew; 81% confidence, so it goes to review |
| Khata 305 | Bihar Jamabandi | Clean print, 94% OCR — but parcels total 1.15 ha against 1.00 ha declared, so it is blocked until a Tehsildar decides |

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, TypeScript, Tailwind CSS, TanStack Query, Zustand |
| API | FastAPI, SQLAlchemy 2, Pydantic 2, JWT + bcrypt |
| Processing | Celery, OpenCV, scikit-image, PaddleOCR, Tesseract |
| Data | PostgreSQL 16 + PostGIS, Redis, SeaweedFS (S3) |
| Delivery | Docker, Caddy (automatic HTTPS), nginx, supervisord |

## Project structure

```
backend/     FastAPI API, Celery worker, CV/OCR pipeline, SQL migrations, tests
frontend/    Next.js reviewer console
deploy/      production: all-in-one image, VM setup with HTTPS, DigitalOcean spec
docs/        architecture, deployment guide, demo script, screenshots
```

## Deployment

The live demo runs on a single Azure VM using `deploy/vm` — one command sets up
Docker, HTTPS and the whole stack, with data kept across restarts. See
**[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** for Azure for Students (free, no
card), any other Ubuntu VM, and DigitalOcean App Platform.

## Testing

```bash
make test        # 40 tests
```

The suite runs without any OCR model on disk and covers unit conversion and
regional ambiguity, ULPIN integrity, every validation rule, deskew accuracy
against known rotations, binarisation under uneven lighting, table detection
on a degraded page, and the authentication crypto.

---

<div align="center">
<sub>Built for Smart India Hackathon 2026 · Department of Land Resources, Ministry of Rural Development.
Not an official Government of India service.</sub>
</div>
