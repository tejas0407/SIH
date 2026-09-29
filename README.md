# Intelligent Land Record Digitization and Validation System

**Smart India Hackathon · Problem Statement SIH26018 · Ministry of Rural Development (DILRMP)**

Legacy Records of Rights — Jamabandi, 7/12 extracts, Khatauni — sit in tehsil record rooms as
folded, faded, handwritten paper in a dozen scripts and a dozen incompatible units of area. This
system reads them, checks that the numbers on the page actually add up, and puts a human in front
of exactly the records that need one.

The thing that makes a land record trustworthy is not OCR accuracy. It is arithmetic: the parcels
must sum to the declared holding, and the ownership shares must close at 100%. A record that reads
at 99% confidence but whose areas are 1.15 ha against a declared 1.00 ha is not a good extraction —
it is a discrepancy worth a Tehsildar's attention. That distinction is the spine of this design.

---

## What it does

1. **Ingests** a scan into the S3 object store (SeaweedFS), de-duplicated by SHA-256 so a re-scanned page never becomes a
   second record to review.
2. **Restores** the page: deskews with Hough or Radon, divides out reverse-side bleed-through,
   binarises with Sauvola so Devanagari matras survive, and repairs fold damage.
3. **Segments** it into header, parcel table, Patwari margin remarks, and seals.
4. **Reads** it with two engines — PaddleOCR for printed cells, TrOCR for handwriting — routed per
   zone, with Tesseract as an offline fallback so a demo never dies on a model download.
5. **Validates** it against mathematical invariants and regional unit rules.
6. **Commits or escalates.** Above 85% confidence with no failed rule, the record commits itself.
   Otherwise it lands in a reviewer's queue, worst-first.
7. **Records every correction** in a hash-chained, append-only audit ledger.

---

## Running it

Everything runs offline. No paid API, no internet access needed after the images are built.

```bash
git clone https://github.com/<you>/SIH.git
cd SIH
cp .env.example .env
docker compose -f docker/docker-compose.yml --env-file .env up --build
```

Then load the demo reviewer accounts and the three demo records:

```bash
docker compose -f docker/docker-compose.yml exec backend python -m app.seed.load_demo
```

| Service | URL |
|---|---|
| Reviewer console | http://localhost:3000 |
| API docs (OpenAPI) | http://localhost:8000/docs |
| Health check | http://localhost:8000/health |
| Object store (S3 API, SeaweedFS) | http://localhost:9000 |

`make up`, `make seed`, `make test` wrap the same commands.

### Signing in

The console is behind a user-ID-and-password sign-in. The seed creates two
accounts, one per role:

| Role | User ID | Password | Can |
|---|---|---|---|
| Patwari | `patwari.demo` | `patwari@123` | Verify and commit records that pass every check |
| Tehsildar | `tehsildar.demo` | `tehsildar@123` | Also override a failed arithmetic check, on the ledger |

`POST /api/v1/auth/login` returns a bearer token (a 12-hour JWT); every write
endpoint takes the actor and role straight off that token, so the audit ledger
names whoever actually holds the session rather than trusting the request body.
`make seed-users` re-creates or resets just these accounts. The token secret is
`JWT_SECRET_KEY` in `.env` — change it for any real deployment.

---

## The three demo cases

The seed data ships as **synthetically rendered register pages**, not real scans — real Jamabandi
pages carry citizens' names and Khasra numbers and cannot go in a public repository. They are drawn
with the same layout grammar as the real thing, so the pipeline runs exactly the same code paths.

| Case | Page | What it shows |
|---|---|---|
| **A** | Maharashtra 7/12, clean | Reads at 97.4% combined confidence, arithmetic closes, commits with no human involved |
| **B** | Western UP Khatauni, degraded | Rotated 6.5°, folded, bleed-through, foxing. Preprocessing restores it; residual skew after correction is **0.0°**. Combined confidence 81.1% (OCR 74%), so it goes to a reviewer despite passing every arithmetic check |
| **C** | Bihar Jamabandi, discrepancy | Parcels total **1.15 ha** against a declared **1.00 ha**. Reads at 94% OCR confidence — cleanly printed, no degradation — and high confidence still cannot push it through. `AREA_SUM_MISMATCH` fires, the banner shows the 1,500 m² gap, and only a Tehsildar can override |

Case C is the point of the whole system. Case B and Case C fail for opposite reasons, and the
system distinguishes them.

---

## Architecture

```
                  ┌───────────┐
   scan ────────► │  FastAPI  │ ──── S3 store (raw-scans)
                  └─────┬─────┘
                        │ Celery job
                  ┌─────▼─────────────────────────────────┐
                  │  ImagePreprocessor                    │  deskew, Sauvola,
                  │  DocumentLayoutSegmenter              │  bleed-through, folds
                  │  DualOcrEngine  (Paddle | TrOCR)      │
                  │  EntityExtractor                      │
                  └─────┬─────────────────────────────────┘
                        │
                  ┌─────▼─────┐   C_total ≥ 0.85 and no
                  │ Validator │──── critical finding ────► COMMITTED
                  └─────┬─────┘
                        │ otherwise
                  ┌─────▼─────┐
                  │ Redis ZSET│──► reviewer console ──► audit ledger ──► COMMITTED
                  └───────────┘     (dual-pane)         (hash-chained)
```

**Stack.** FastAPI + Celery + PostgreSQL 16/PostGIS + Redis + SeaweedFS (S3); Next.js 14, TypeScript,
Tailwind, TanStack Query, Zustand.

### Confidence score

```
C_total = 0.5·OCR + 0.3·Layout + 0.2·MathChecksPassed
```

`MathChecksPassed` is the fraction of arithmetic invariants that held. A record commits itself only
at `C_total ≥ 0.85` **and** zero critical findings — the two conditions are independent, which is
why Case C cannot buy its way through on a high OCR score.

### Validation rules

| Rule | Severity | Tolerance |
|---|---|---|
| `AREA_SUM_MISMATCH` | Critical | 0.005 m² |
| `INVALID_OWNER_SHARES` | Critical | ±0.01% |
| `DUPLICATE_KHASRA` | Critical | — |
| `NON_POSITIVE_AREA` | Critical | — |
| `ORPHAN_OWNER` | Critical | — |
| `MISSING_KHATA_NUMBER` | Critical | — |
| `INVALID_KHASRA_FORMAT` | Warning | Indic sub-division suffixes allowed |
| `ULPIN_INVALID` | Warning | check character |
| `LOW_FIELD_CONFIDENCE` | Warning | < 50% |

### Regional units

A Bigha in Meerut is not a Bigha in Patna. Conversions resolve against the record's state and
district, and refuse to guess when the region is unknown:

| Unit | m² | Scope |
|---|---|---|
| Hectare | 10,000 | everywhere |
| Bigha | 2,529.3 | Western UP |
| Bigha | 1,618.7 | Eastern UP, Bihar, Jharkhand |
| Biswa | 126.465 | Western UP (1/20 Bigha) |
| Guntha | 101.17 | Maharashtra, Karnataka |
| Cent | 40.46 | South India |
| Acre | 4,046.856 | everywhere |

Compound expressions parse as printed — `2 बीघा 10 बिस्वा` — and Devanagari numerals fold to ASCII
before any arithmetic.

### ULPIN (Bhu-Aadhaar)

Fourteen characters: a two-character state code, an eleven-character geohash of the parcel
centroid, and a weighted modulo-32 check character.

```
MH  +  te7w2yqxq5m  +  4        →  MHTE7W2YQXQ5M4
```

Because it derives from the land rather than a database sequence, it is reproducible from geometry
alone, decodes back to a location within ~15 cm, and a counter clerk's mistyped digit is caught
without a database round trip.

### Audit ledger

Every correction stores the SHA-256 of its own content plus the hash of the entry before it. Two
Postgres triggers reject `UPDATE` and `DELETE` on `audit_logs` outright. Altering any historic
correction changes every hash after it, and `GET /hitl/{id}/ledger` names the exact entry where the
chain breaks. Aadhaar numbers are never stored — only a salted digest, which supports duplicate
detection without holding the identifier.

---

## The reviewer console

A split-pane workspace built for someone who does this for six hours a day.

- **Left:** the scan on a dark lightbox, zoom and pan, with an SVG overlay drawing a box around
  every detected field — green ≥85%, amber 50–84%, red <50% or failed.
- **Right:** tabbed editable form. Focusing a field pans and zooms the scan to its box, and never
  zooms *out* from where the reviewer already is.
- **Below:** the balance strip, pinned. Two live footings — parcels against the declared total, and
  shares against 100% — recomputed on every keystroke so a correction shows its effect while it is
  still being typed.
- **Signing:** a diff of every changed field, old beside new, before anything enters the ledger.

Colour is reserved entirely for confidence and validation state. Nothing decorative competes with
those three signals.

---

## API

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/v1/auth/login` | User ID + password → bearer token and the reviewer's role |
| `GET` | `/api/v1/auth/me` | The account the current token belongs to |
| `POST` | `/api/v1/documents/upload` | Multipart upload, queues a job, returns `job_id` |
| `GET` | `/api/v1/documents/{id}/status` | Step and percentage progress |
| `GET` | `/api/v1/hitl/queue` | Paginated review queue, least confident first |
| `GET` | `/api/v1/hitl/{khata_id}` | Record, signed scan URL, boxes, findings, audit trail |
| `PUT` | `/api/v1/hitl/{khata_id}/verify` | Corrections → ledger → re-validate → approve |
| `POST` | `/api/v1/hitl/{khata_id}/reject` | Return an undigitisable page to the record room |
| `GET` | `/api/v1/hitl/{khata_id}/ledger` | Recompute the hash chain and report integrity |
| `GET` | `/api/v1/reports/export` | DILRMP GeoJSON / CSV (approved records only by default) |
| `GET` | `/api/v1/reports/units` | Regional conversion table |

`verify` does four things in one transaction: writes the audit entries, applies the corrections,
re-runs every invariant against the corrected values, and sets approval state. A reviewer cannot
approve arithmetic that does not close unless they hold the Tehsildar role and say so explicitly —
and that override is itself written into the ledger.

---

## Tests

```bash
cd backend && pytest -q      # 40 tests
```

They run with no OCR model on disk, covering unit conversion and regional ambiguity, ULPIN
integrity and reversibility, every validation invariant, deskew accuracy against known rotations,
Sauvola under uneven lighting, table detection on a degraded page, row grouping, and the
sign-in crypto — bcrypt round-trips and JWT signing, expiry and tamper rejection.

Three real bugs were found by running them:

- `close_folds` applied morphological closing at the wrong polarity and then median-blurred, which
  erased the 2-pixel table rulings — the segmenter found **zero** parcel tables on a clean page.
- Table detection relied on a single connected contour; horizontal and vertical rules rarely survive
  binarisation connected, so it now unions all long rules and tolerates a grid broken by a fold.
- Seal detection returned **36 false seals** on a clean 7/12 extract with a uint16 overflow
  producing coordinates like `65532`.

---

## Layout

```
backend/
  app/
    api/           deps (auth guard); v1/ documents, hitl, reports, auth
    services/      cv_pipeline, validator, units, ulpin, audit, auth, storage
    workers/       celery_app, tasks, queue
    models/        SQLAlchemy ORM
    schemas/       Pydantic DTOs
    seed/          synthetic scan generator + demo loader + user loader
  migrations/      001_init_schema.sql, 002_users.sql
  tests/
frontend/
  app/             login, landing, queue, review/[khataId]
  components/      AuthGate, AppHeader, DocumentViewer, ReviewForm, BalanceStrip, SignModal
  lib/             api, auth, session, store, types, format
docker/            compose + both Dockerfiles
```

---

## Notes for evaluators

- **Fully offline.** `docker compose up --build` needs the internet only to pull base images.
  Tesseract with Hindi, Marathi and English is baked in as the OCR fallback, so the pipeline
  produces output even where PaddleOCR weights are absent.
- **Devanagari fonts** (`fonts-lohit-deva`) are installed in the backend image. Without them the
  synthetic scans render Hindi as empty boxes; the generator warns if it cannot find one.
- **Migrations** run automatically on first boot via `docker-entrypoint-initdb.d`. `make down`
  drops the volumes for a clean re-run.
