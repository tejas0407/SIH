"""Load the demo dataset.

Run inside the backend container:

    python -m app.seed.load_demo

Case A is committed automatically. Case B lands in the review queue with
low-confidence fields after preprocessing rescues a badly degraded page. Case C
is the fraud scenario: the parcels sum to 1.15 ha while the page declares
1.00 ha, so the area invariant fails and no confidence score can commit it.
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from pathlib import Path

from shapely.geometry import MultiPolygon, Polygon
from sqlalchemy import select

from app.core.config import settings
from app.db.session import SyncSessionLocal, sync_engine
from app.models.land import (
    ActorRole,
    ApprovalStatus,
    Document,
    KhasraParcel,
    KhataRecord,
    OwnershipDetail,
    ProcessingStatus,
    RelationType,
    Village,
)
from app.seed.generate_scans import write_all
from app.services.storage import get_store, sha256_bytes
from app.services.ulpin import generate_ulpin
from app.services.validator import LandRecordValidator
from app.workers.queue import push_to_hitl_queue
from app.workers.tasks import _sync_audit

D = Decimal
SCAN_DIR = Path("app/seed/scans")

VILLAGES = [
    {
        "village_code": "MH27PUN014", "village_name": "Wagholi", "tehsil": "Haveli",
        "district": "Pune", "state": "Maharashtra", "default_unit": "guntha",
        "centre": (18.5793, 73.9776),
    },
    {
        "village_code": "UP09MRT031", "village_name": "Sardhana Khurd", "tehsil": "Sardhana",
        "district": "Meerut", "state": "Uttar Pradesh", "default_unit": "bigha",
        "centre": (29.1450, 77.6100),
    },
    {
        "village_code": "BR10PAT007", "village_name": "Phulwari Sharif", "tehsil": "Phulwari Sharif",
        "district": "Patna", "state": "Bihar", "default_unit": "hectare",
        "centre": (25.5760, 85.0640),
    },
]


def _square(lat: float, lon: float, side_deg: float = 0.012) -> str:
    half = side_deg / 2
    polygon = Polygon(
        [
            (lon - half, lat - half), (lon + half, lat - half),
            (lon + half, lat + half), (lon - half, lat + half),
            (lon - half, lat - half),
        ]
    )
    return f"SRID=4326;{polygon.wkt}"


def _multi_square(lat: float, lon: float, side_deg: float = 0.0016) -> str:
    """Parcel geometry is MultiPolygon because a single Khasra is often split by
    a canal or a road into two physically separate pieces."""
    half = side_deg / 2
    polygon = Polygon(
        [
            (lon - half, lat - half), (lon + half, lat - half),
            (lon + half, lat + half), (lon - half, lat + half),
            (lon - half, lat - half),
        ]
    )
    return f"SRID=4326;{MultiPolygon([polygon]).wkt}"


GUNTHA, BIGHA_W, HECTARE = D("101.17"), D("2529.3"), D("10000")

CASES = [
    {
        "file": "case_a_clean_712.png",
        "village": "MH27PUN014",
        "khata_number": "142",
        "fasli_year": "2023-24",
        "declared_unit": "guntha",
        "total_area_sqm": (GUNTHA * 99).quantize(D("0.0001")),
        "ocr_confidence": 0.972,
        "layout_confidence": 0.961,
        "parcels": [
            ("221/1", GUNTHA * 40, "Orchard", {"khasra_number": 0.98, "plot_area_sqm": 0.97}),
            ("221/2", GUNTHA * 25, "Dry crop", {"khasra_number": 0.97, "plot_area_sqm": 0.96}),
            ("223", GUNTHA * 34, "Orchard", {"khasra_number": 0.98, "plot_area_sqm": 0.98}),
        ],
        "owners": [
            ("रमेश शिवाजी पाटील", "Ramesh Shivaji Patil", "S/o", "शिवाजी पाटील", D("50.00"), "1/2",
             {"owner_name_vernacular": 0.96, "share_percentage": 0.97}),
            ("सुनीता रमेश पाटील", "Sunita Ramesh Patil", "W/o", "रमेश पाटील", D("50.00"), "1/2",
             {"owner_name_vernacular": 0.95, "share_percentage": 0.97}),
        ],
    },
    {
        "file": "case_b_degraded_khatauni.png",
        "village": "UP09MRT031",
        "khata_number": "87",
        "fasli_year": "1430 F",
        "declared_unit": "bigha",
        "total_area_sqm": (BIGHA_W * 4).quantize(D("0.0001")),
        # Deskewing and Sauvola rescued the page, but the handwritten column
        # and one folded row are still uncertain.
        "ocr_confidence": 0.741,
        "layout_confidence": 0.802,
        "parcels": [
            ("512", BIGHA_W * 2, "Irrigated", {"khasra_number": 0.88, "plot_area_sqm": 0.71}),
            ("513/1", BIGHA_W * 1, "Irrigated", {"khasra_number": 0.43, "plot_area_sqm": 0.62}),
            ("515", BIGHA_W * 1, "Unirrigated", {"khasra_number": 0.79, "plot_area_sqm": 0.68}),
        ],
        "owners": [
            ("हरिओम सिंह", "Hariom Singh", "S/o", "जगदीश सिंह", D("33.34"), "1/3",
             {"owner_name_vernacular": 0.66, "share_percentage": 0.72}),
            ("बलवीर सिंह", "Balvir Singh", "S/o", "जगदीश सिंह", D("33.33"), "1/3",
             {"owner_name_vernacular": 0.47, "share_percentage": 0.72}),
            ("कमला देवी", "Kamla Devi", "W/o", "जगदीश सिंह", D("33.33"), "1/3",
             {"owner_name_vernacular": 0.71, "share_percentage": 0.70}),
        ],
    },
    {
        "file": "case_c_area_discrepancy.png",
        "village": "BR10PAT007",
        "khata_number": "305",
        "fasli_year": "2024-25",
        "declared_unit": "hectare",
        # The page says 1.00 ha. The parcels say 1.15 ha. Both are recorded as
        # read; the validator is what surfaces the gap.
        "total_area_sqm": HECTARE * 1,
        "ocr_confidence": 0.944,
        "layout_confidence": 0.930,
        "parcels": [
            ("88", HECTARE * D("0.55"), "Irrigated", {"khasra_number": 0.96, "plot_area_sqm": 0.94}),
            ("89", HECTARE * D("0.35"), "Irrigated", {"khasra_number": 0.95, "plot_area_sqm": 0.95}),
            ("91", HECTARE * D("0.25"), "Barren", {"khasra_number": 0.94, "plot_area_sqm": 0.93}),
        ],
        "owners": [
            ("मोहन प्रसाद यादव", "Mohan Prasad Yadav", "S/o", "रामदेव यादव", D("60.00"), "60%",
             {"owner_name_vernacular": 0.93, "share_percentage": 0.95}),
            ("गीता देवी", "Geeta Devi", "W/o", "मोहन प्रसाद", D("40.00"), "40%",
             {"owner_name_vernacular": 0.92, "share_percentage": 0.95}),
        ],
    },
]


def seed_villages(session) -> None:
    for entry in VILLAGES:
        exists = session.execute(
            select(Village).where(Village.village_code == entry["village_code"])
        ).scalar_one_or_none()
        if exists:
            continue
        lat, lon = entry["centre"]
        session.add(
            Village(
                village_code=entry["village_code"],
                village_name=entry["village_name"],
                tehsil=entry["tehsil"],
                district=entry["district"],
                state=entry["state"],
                default_unit=entry["default_unit"],
                boundary_geom=_square(lat, lon),
            )
        )
    session.commit()


def seed_case(session, case: dict) -> str:
    village = session.execute(
        select(Village).where(Village.village_code == case["village"])
    ).scalar_one()

    path = SCAN_DIR / case["file"]
    payload = path.read_bytes()
    digest = sha256_bytes(payload)

    existing = session.execute(
        select(Document).where(Document.file_hash_sha256 == digest)
    ).scalar_one_or_none()
    if existing:
        return f"{case['file']}: already loaded"

    document_id = uuid.uuid4()
    object_name = f"demo/{case['file']}"
    store = get_store()
    store.ensure_buckets()
    storage_path = store.put_bytes(settings.MINIO_BUCKET_RAW, object_name, payload, "image/png")

    document = Document(
        document_id=document_id,
        original_filename=case["file"],
        storage_path=storage_path,
        file_hash_sha256=digest,
        mime_type="image/png",
        page_count=1,
        processing_status=ProcessingStatus.VALIDATING,
        uploaded_by="seed.demo",
        village_code=village.village_code,
    )
    session.add(document)

    khata = KhataRecord(
        khata_id=uuid.uuid4(),
        document_id=document_id,
        village_code=village.village_code,
        khata_number=case["khata_number"],
        fasli_year=case["fasli_year"],
        total_area_sqm=case["total_area_sqm"],
        declared_unit=case["declared_unit"],
        ocr_confidence=case["ocr_confidence"],
        layout_confidence=case["layout_confidence"],
    )
    session.add(khata)
    session.flush()

    lat, lon = VILLAGES[[v["village_code"] for v in VILLAGES].index(village.village_code)]["centre"]

    for index, (khasra, area, classification, confidence) in enumerate(case["parcels"]):
        # Offset each parcel slightly so every ULPIN is distinct and decodes
        # back to a plausible location inside the village boundary.
        plat, plon = lat + index * 0.0009, lon + index * 0.0011
        session.add(
            KhasraParcel(
                parcel_id=uuid.uuid4(),
                khata_id=khata.khata_id,
                khasra_number=khasra,
                plot_area_sqm=D(str(area)).quantize(D("0.0001")),
                declared_unit=case["declared_unit"],
                land_classification=classification,
                ulpin=generate_ulpin(plat, plon, state=village.state),
                centroid_geom=f"SRID=4326;POINT({plon} {plat})",
                parcel_geom=_multi_square(plat, plon),
                bbox_json={"page": 0, "ymin": 420 + index * 74, "xmin": 128,
                           "ymax": 486 + index * 74, "xmax": 1180},
                field_confidence=confidence,
            )
        )

    for index, owner in enumerate(case["owners"]):
        name, name_en, relation, relative, share, fraction, confidence = owner
        session.add(
            OwnershipDetail(
                owner_id=uuid.uuid4(),
                khata_id=khata.khata_id,
                owner_name_vernacular=name,
                owner_name_en=name_en,
                relation_type=RelationType(relation),
                relative_name=relative,
                share_percentage=share,
                share_fraction=fraction,
                bbox_json={"page": 0, "ymin": 980 + index * 52, "xmin": 130,
                           "ymax": 1032 + index * 52, "xmax": 900},
                field_confidence=confidence,
            )
        )

    session.flush()
    session.refresh(khata)

    report = LandRecordValidator().validate(
        {
            "khata": {
                "khata_number": khata.khata_number,
                "total_area_sqm": khata.total_area_sqm,
                "ocr_confidence": khata.ocr_confidence,
                "layout_confidence": khata.layout_confidence,
            },
            "parcels": [
                {"khasra_number": p.khasra_number, "plot_area_sqm": p.plot_area_sqm,
                 "ulpin": p.ulpin, "field_confidence": p.field_confidence}
                for p in khata.parcels
            ],
            "owners": [
                {"share_percentage": o.share_percentage, "field_confidence": o.field_confidence}
                for o in khata.owners
            ],
        }
    )

    khata.validation_errors = [f.to_dict() for f in report.findings]
    khata.math_checks_pass = report.math_checks_pass
    khata.confidence_score = report.total_confidence

    if report.is_committable:
        khata.approval_status = ApprovalStatus.AUTO_APPROVED
        document.processing_status = ProcessingStatus.COMMITTED
        document.progress_pct = 100
        document.current_step = "Committed"
        _sync_audit(session, khata.khata_id, "approval_status", "PENDING", "AUTO_APPROVED",
                    "system", ActorRole.SYSTEM,
                    f"Auto-committed at {report.total_confidence:.2%} confidence")
        verdict = f"auto-committed at {report.total_confidence:.1%}"
    else:
        khata.approval_status = ApprovalStatus.PENDING
        document.processing_status = ProcessingStatus.NEEDS_REVIEW
        document.progress_pct = 95
        document.current_step = "Awaiting review"
        reason = (
            report.critical[0].message if report.critical
            else f"confidence {report.total_confidence:.1%} below threshold"
        )
        _sync_audit(session, khata.khata_id, "routing", "AUTO", "NEEDS_REVIEW",
                    "system", ActorRole.SYSTEM, reason)
        push_to_hitl_queue(str(khata.khata_id), report.total_confidence,
                           {"khata_number": khata.khata_number,
                            "critical": len(report.critical)})
        verdict = f"routed to review — {reason}"

    session.commit()
    return f"{case['file']}: Khata {khata.khata_number} {verdict}"


def main() -> None:
    if not SCAN_DIR.exists() or not any(SCAN_DIR.glob("*.png")):
        print("rendering demo scans...")
        write_all(SCAN_DIR)

    with sync_engine.connect() as conn:
        conn.exec_driver_sql("SELECT 1")

    session = SyncSessionLocal()
    try:
        seed_villages(session)
        print(f"villages: {len(VILLAGES)} ready")
        for case in CASES:
            print("  " + seed_case(session, case))
    finally:
        session.close()

    print("\nOpen http://localhost:3000/queue to review the flagged records.")


if __name__ == "__main__":
    main()
