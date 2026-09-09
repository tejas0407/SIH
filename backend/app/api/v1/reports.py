"""Export endpoints producing DILRMP-consumable datasets."""

from __future__ import annotations

import csv
import io
import json
from typing import Literal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from geoalchemy2.shape import to_shape
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.land import ApprovalStatus, KhataRecord, User
from app.services.units import supported_units

router = APIRouter(prefix="/reports", tags=["reports"])

CSV_COLUMNS = [
    "state", "district", "tehsil", "village_code", "village_name",
    "khata_number", "fasli_year", "khasra_number", "ulpin",
    "plot_area_sqm", "land_classification", "khata_total_area_sqm",
    "owner_names", "owner_shares", "confidence_score", "approval_status",
]


async def _fetch(db: AsyncSession, village_code: str | None, only_approved: bool):
    stmt = select(KhataRecord)
    if village_code:
        stmt = stmt.where(KhataRecord.village_code == village_code)
    if only_approved:
        stmt = stmt.where(
            KhataRecord.approval_status.in_(
                [ApprovalStatus.AUTO_APPROVED, ApprovalStatus.MANUALLY_APPROVED]
            )
        )
    return (await db.execute(stmt.order_by(KhataRecord.khata_number))).scalars().all()


@router.get("/export")
async def export_records(
    fmt: Literal["geojson", "csv"] = Query("geojson", alias="format"),
    village_code: str | None = None,
    only_approved: bool = True,
    db: AsyncSession = Depends(get_db),
):
    """Export the register. Defaults to approved records only — unverified
    extractions must not leave the system as though they were authoritative."""
    khatas = await _fetch(db, village_code, only_approved)

    if fmt == "geojson":
        features = []
        for khata in khatas:
            village = khata.village
            owners = [
                {
                    "name": o.owner_name_vernacular,
                    "name_en": o.owner_name_en,
                    "relation": o.relation_type.value if o.relation_type else None,
                    "relative": o.relative_name,
                    "share_pct": float(o.share_percentage),
                }
                for o in khata.owners
            ]
            for parcel in khata.parcels:
                geometry = None
                if parcel.parcel_geom is not None:
                    geometry = json.loads(json.dumps(to_shape(parcel.parcel_geom).__geo_interface__))
                features.append(
                    {
                        "type": "Feature",
                        "geometry": geometry,
                        "properties": {
                            "ulpin": parcel.ulpin,
                            "khata_number": khata.khata_number,
                            "khasra_number": parcel.khasra_number,
                            "fasli_year": khata.fasli_year,
                            "plot_area_sqm": float(parcel.plot_area_sqm),
                            "khata_total_area_sqm": float(khata.total_area_sqm),
                            "land_classification": parcel.land_classification,
                            "village_code": village.village_code if village else None,
                            "village_name": village.village_name if village else None,
                            "tehsil": village.tehsil if village else None,
                            "district": village.district if village else None,
                            "state": village.state if village else None,
                            "owners": owners,
                            "confidence_score": khata.confidence_score,
                            "approval_status": khata.approval_status.value,
                        },
                    }
                )

        payload = {
            "type": "FeatureCollection",
            "name": "DILRMP_RoR_Export",
            "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:EPSG::4326"}},
            "features": features,
        }
        return StreamingResponse(
            io.BytesIO(json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")),
            media_type="application/geo+json",
            headers={"Content-Disposition": 'attachment; filename="dilrmp_export.geojson"'},
        )

    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=CSV_COLUMNS)
    writer.writeheader()
    for khata in khatas:
        village = khata.village
        owner_names = " | ".join(o.owner_name_vernacular for o in khata.owners)
        owner_shares = " | ".join(f"{float(o.share_percentage):.2f}" for o in khata.owners)
        for parcel in khata.parcels:
            writer.writerow(
                {
                    "state": village.state if village else "",
                    "district": village.district if village else "",
                    "tehsil": village.tehsil if village else "",
                    "village_code": village.village_code if village else "",
                    "village_name": village.village_name if village else "",
                    "khata_number": khata.khata_number,
                    "fasli_year": khata.fasli_year or "",
                    "khasra_number": parcel.khasra_number,
                    "ulpin": parcel.ulpin or "",
                    "plot_area_sqm": f"{float(parcel.plot_area_sqm):.4f}",
                    "land_classification": parcel.land_classification or "",
                    "khata_total_area_sqm": f"{float(khata.total_area_sqm):.4f}",
                    "owner_names": owner_names,
                    "owner_shares": owner_shares,
                    "confidence_score": f"{khata.confidence_score:.4f}",
                    "approval_status": khata.approval_status.value,
                }
            )

    # BOM keeps Devanagari owner names readable when a tehsil office opens the
    # file in Excel, which assumes the local codepage otherwise.
    data = ("\ufeff" + buffer.getvalue()).encode("utf-8")
    return StreamingResponse(
        io.BytesIO(data),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="dilrmp_export.csv"'},
    )


@router.get("/units")
async def list_units() -> list[dict]:
    """Conversion table backing the unit picker in the reviewer form."""
    return supported_units()


@router.get("/summary")
async def summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    khatas = (await db.execute(select(KhataRecord))).scalars().all()
    approved = [
        k for k in khatas
        if k.approval_status in (ApprovalStatus.AUTO_APPROVED, ApprovalStatus.MANUALLY_APPROVED)
    ]
    pending = [k for k in khatas if k.approval_status == ApprovalStatus.PENDING]
    parcels = sum(len(k.parcels) for k in khatas)
    area = sum(float(k.total_area_sqm) for k in approved)

    return {
        "khata_total": len(khatas),
        "approved": len(approved),
        "pending_review": len(pending),
        "parcels": parcels,
        "approved_area_hectares": round(area / 10000, 4),
        "auto_commit_rate": round(len(approved) / len(khatas), 4) if khatas else 0.0,
        "mean_confidence": (
            round(sum(k.confidence_score for k in khatas) / len(khatas), 4) if khatas else 0.0
        ),
    }
