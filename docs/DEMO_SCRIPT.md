# Demo script

A five-minute run for evaluators. Start the stack and seed the data first:

```bash
cp .env.example .env
docker compose -f docker/docker-compose.yml --env-file .env up --build -d
docker compose -f docker/docker-compose.yml exec backend python -m app.seed.load_demo
```

The seed also creates two reviewer accounts and prints one line per demo case;
those three case lines are the whole argument:

```
case_a_clean_712.png: Khata 142 auto-committed at 97.4%
case_b_degraded_khatauni.png: Khata 87 routed to review — confidence 81.1% below threshold
case_c_area_discrepancy.png: Khata 305 routed to review — Parcel areas total 11500.0000 sqm
                             but the Khata declares 10000.0000 sqm — a difference of 1500.0000 sqm
```

---

## 0. Signing in (15s)

Open http://localhost:3000. Every route is behind a sign-in, so the console
sends you to `/login`. Sign in as the Patwari:

```
patwari.demo / patwari@123
```

For section 3, where a Tehsildar overrides a failed check, sign out from the top
bar and sign back in as `tehsildar.demo / tehsildar@123`. The point to make:
the token carries the role, and the server reads the actor off the token — so
the ledger entry in section 3 names whoever was actually signed in, not a value
the browser sent.

---

## 1. The system knows when to get out of the way (40s)

Open http://localhost:3000. Point at the summary strip: one of three records committed with no
human involved. Case A was a clean 7/12 extract, it read at 97%, its three Guntha parcels summed to
the declared 99 Guntha, and the two half-shares closed at 100%. Nobody looked at it.

The claim is not that the OCR is excellent. It is that the system can prove that particular record
is internally consistent, so a reviewer's time is better spent elsewhere.

## 2. Restoring a page nobody could read (90s)

Open the review queue and pick **Khata 87, Sardhana Khurd, Meerut**.

The left pane holds the raw scan: rotated 6.5°, creased down the middle, ink from the reverse side
showing through, foxing spots across it. That is what a 1970s Khatauni looks like coming off a
flatbed.

Show what preprocessing did to it:

```bash
docker compose -f docker/docker-compose.yml exec backend python -c "
from app.seed.generate_scans import case_a_clean, degrade
from app.services.cv_pipeline import ImagePreprocessor, DocumentLayoutSegmenter
p = ImagePreprocessor(); d = degrade(case_a_clean(), angle=-6.5)
img, angle = p.deskew(d)
print('correction applied:', angle, 'degrees')
print('residual skew after correction:', p.estimate_skew_hough(img))
b = p.close_folds(p.sauvola_threshold(p.remove_bleed_through(img)))
t = DocumentLayoutSegmenter().detect_table(b)
print('parcel table found at', t.bbox, 'confidence', round(t.confidence, 2))
"
```

It reports a 6.5° correction and **0.0° residual**, then locates the parcel table on the restored
page. Sauvola was chosen over Otsu because a book-spine shadow makes a global threshold erase whole
columns, and `k` is held at 0.28 so Devanagari matras are not thinned away.

Note what happened to this record: **every arithmetic check passed.** Three Bighas summing to four,
thirds closing at 100%. It went to a reviewer purely because the handwriting in row two read at 43%
and nobody should commit a Khasra number the machine could not see.

## 3. The fraud case (2m)

Open **Khata 305, Phulwari Sharif, Patna**. The red banner is there on load:

> Parcel areas total 11500.00 m² against a declared 10000.00 m².

This record read at **94% OCR confidence** (90.1% combined) — cleanly printed, well-lit, no degradation at all. Under a
confidence-threshold-only design it would have committed itself and put a 1,500 m² discrepancy into
the official register.

Walk the balance strip at the bottom. Two footings: parcels against declared, shares against 100%.
The shares close. The areas do not, by 0.15 hectares.

Now demonstrate that it cannot be waved through:

1. Click **Review and sign**. The dialog shows the failed check and refuses. As a Patwari the commit
   button is disabled — the only advice offered is to correct the values or ask a Tehsildar.
2. Fix the first parcel from `5500` to `4000`. The balance strip closes to **Balanced** while you
   are still typing; the banner clears. No round trip to the server.
3. Sign. The dialog shows the diff — `5500.0000 m²` struck through beside `4000.0000 m²` — and only
   then commits.

Open the **History** tab afterwards: the correction is there with its hash. Then prove the ledger is
real (the HITL routes need a token now — grab one from the login endpoint):

```bash
TOKEN=$(curl -s localhost:8000/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"login_id":"patwari.demo","password":"patwari@123"}' | python -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

curl -s -H "Authorization: Bearer $TOKEN" localhost:8000/api/v1/hitl/<khata_id>/ledger
# {"intact": true, "entries_checked": 3, "head": "9f2c…"}
```

Try to rewrite history and Postgres itself refuses:

```bash
docker compose -f docker/docker-compose.yml exec db \
  psql -U dilrmp -d land_records -c "UPDATE audit_logs SET corrected_value='0';"
# ERROR:  audit_logs is append-only; UPDATE is not permitted
```

## 4. Regional units and ULPIN (45s)

```bash
docker compose -f docker/docker-compose.yml exec backend python -c "
from app.services.units import to_sqm, resolve_unit
print('Meerut  ', to_sqm(1,'bigha',state='Uttar Pradesh',district='Meerut')[0])
print('Varanasi', to_sqm(1,'bigha',state='Uttar Pradesh',district='Varanasi')[0])
try: resolve_unit('bigha')
except Exception as e: print('no region given ->', e)
"
```

2529.3 m² against 1618.7 m² for the same printed word — a 56% difference in how much land a farmer
owns. With no region supplied the system refuses to guess rather than silently picking one.

```bash
docker compose -f docker/docker-compose.yml exec backend python -c "
from app.services.ulpin import generate_ulpin, ulpin_to_centroid, validate_ulpin
u = generate_ulpin(25.5760, 85.0640, state='Bihar'); print(u)
print('decodes back to', ulpin_to_centroid(u))
bad = u[:5] + ('0' if u[5] != '0' else '1') + u[6:]
print('one mistyped character ->', validate_ulpin(bad))
"
```

## 5. Export (20s)

```bash
curl -s "localhost:8000/api/v1/reports/export?format=geojson" | head -30
```

EPSG:4326 FeatureCollection with ULPIN, Khasra, owners and shares per parcel. Approved records only
by default — an unverified extraction must not leave the system looking authoritative.

---

## Questions worth expecting

**"What if the OCR is wrong in a way the arithmetic doesn't catch?"** Then it reaches a human, which
is what the confidence score is for. The two mechanisms cover different failures: confidence catches
what was read badly, invariants catch what was read cleanly but is wrong. Case B and Case C fail for
exactly these opposite reasons.

**"Can a corrupt official quietly change a record?"** Every write is chained to the one before it,
and `UPDATE`/`DELETE` are blocked by database trigger, not application code. A Tehsildar can
override a failed check, but the override is itself a ledger entry naming them.

**"Does this need a GPU or an internet connection?"** Neither. Tesseract with Hindi, Marathi and
English is in the image as a fallback, and every model is optional — the pipeline degrades to
lower confidence rather than failing, which routes the record to a human, which is the correct
behaviour.

**"What is the failure mode when the page is unreadable?"** `POST /hitl/{id}/reject` returns it to
the record room with a reason on the ledger. The system does not invent values for a page it cannot
read.
