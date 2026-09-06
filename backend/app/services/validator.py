"""Validation engine.

Every rule returns a structured finding rather than raising, so a single pass
reports all problems with a record at once — a reviewer should see the full
picture on one screen instead of fixing one error to reveal the next.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from decimal import Decimal
from enum import Enum
from typing import Any

from app.core.config import settings
from app.services.ulpin import validate_ulpin

D = Decimal


class Severity(str, Enum):
    CRITICAL = "CRITICAL"
    WARNING = "WARNING"
    INFO = "INFO"


class RuleCode(str, Enum):
    AREA_SUM_MISMATCH = "AREA_SUM_MISMATCH"
    INVALID_OWNER_SHARES = "INVALID_OWNER_SHARES"
    DUPLICATE_KHASRA = "DUPLICATE_KHASRA"
    MISSING_KHATA_NUMBER = "MISSING_KHATA_NUMBER"
    INVALID_KHASRA_FORMAT = "INVALID_KHASRA_FORMAT"
    NON_POSITIVE_AREA = "NON_POSITIVE_AREA"
    ULPIN_INVALID = "ULPIN_INVALID"
    ULPIN_MISSING = "ULPIN_MISSING"
    ORPHAN_OWNER = "ORPHAN_OWNER"
    LOW_FIELD_CONFIDENCE = "LOW_FIELD_CONFIDENCE"
    OUTSIDE_VILLAGE_BOUNDARY = "OUTSIDE_VILLAGE_BOUNDARY"


@dataclass
class Finding:
    code: RuleCode
    severity: Severity
    message: str
    field_path: str
    observed: Any = None
    expected: Any = None
    delta: Any = None

    def to_dict(self) -> dict:
        data = asdict(self)
        data["code"] = self.code.value
        data["severity"] = self.severity.value
        return data


@dataclass
class ValidationReport:
    findings: list[Finding] = field(default_factory=list)
    ocr_confidence: float = 0.0
    layout_confidence: float = 0.0
    math_checks_pass: float = 0.0
    total_confidence: float = 0.0

    @property
    def critical(self) -> list[Finding]:
        return [f for f in self.findings if f.severity is Severity.CRITICAL]

    @property
    def is_committable(self) -> bool:
        return (
            not self.critical
            and self.total_confidence >= settings.AUTO_COMMIT_THRESHOLD
        )

    def to_dict(self) -> dict:
        return {
            "findings": [f.to_dict() for f in self.findings],
            "critical_count": len(self.critical),
            "ocr_confidence": round(self.ocr_confidence, 4),
            "layout_confidence": round(self.layout_confidence, 4),
            "math_checks_pass": round(self.math_checks_pass, 4),
            "total_confidence": round(self.total_confidence, 4),
            "committable": self.is_committable,
        }


# Khasra numbers legitimately carry sub-division suffixes: 112, 112/1, 112/1-अ
_KHASRA_ALLOWED = set("0123456789/-अआइईउऊकखगघचछजझटठडढणतथदधनपफबभमयरलवशषसह ")


class LandRecordValidator:
    """Stateless rule engine. `payload` is the extracted record as a plain dict
    so the same code path serves both the Celery pipeline and the HITL
    re-validation endpoint."""

    def __init__(
        self,
        area_tolerance: Decimal | None = None,
        share_tolerance: Decimal | None = None,
        low_confidence_floor: float = 0.50,
    ) -> None:
        self.area_tolerance = area_tolerance or D(str(settings.AREA_TOLERANCE_SQM))
        self.share_tolerance = share_tolerance or D(str(settings.SHARE_TOLERANCE_PCT))
        self.low_confidence_floor = low_confidence_floor

    # ---------------- individual rules ----------------

    def check_area_balance(self, khata: dict, parcels: list[dict]) -> list[Finding]:
        total = D(str(khata.get("total_area_sqm") or 0))
        parcel_sum = sum((D(str(p.get("plot_area_sqm") or 0)) for p in parcels), D("0"))
        deviation = abs(total - parcel_sum)

        if deviation > self.area_tolerance:
            hectares = (deviation / D("10000")).quantize(D("0.0001"))
            return [
                Finding(
                    code=RuleCode.AREA_SUM_MISMATCH,
                    severity=Severity.CRITICAL,
                    message=(
                        f"Parcel areas total {parcel_sum} sqm but the Khata declares "
                        f"{total} sqm — a difference of {deviation} sqm ({hectares} ha)."
                    ),
                    field_path="khata.total_area_sqm",
                    observed=float(parcel_sum),
                    expected=float(total),
                    delta=float(deviation),
                )
            ]
        return []

    def check_owner_shares(self, owners: list[dict]) -> list[Finding]:
        if not owners:
            return [
                Finding(
                    code=RuleCode.ORPHAN_OWNER,
                    severity=Severity.CRITICAL,
                    message="No owner recorded against this Khata.",
                    field_path="owners",
                    observed=0,
                    expected="at least 1",
                )
            ]

        total = sum((D(str(o.get("share_percentage") or 0)) for o in owners), D("0"))
        if abs(total - D("100")) > self.share_tolerance:
            return [
                Finding(
                    code=RuleCode.INVALID_OWNER_SHARES,
                    severity=Severity.CRITICAL,
                    message=(
                        f"Ownership shares total {total}%, which does not close to 100%."
                    ),
                    field_path="owners.share_percentage",
                    observed=float(total),
                    expected=100.0,
                    delta=float(total - D("100")),
                )
            ]
        return []

    def check_parcels(self, parcels: list[dict]) -> list[Finding]:
        findings: list[Finding] = []
        seen: dict[str, int] = {}

        for index, parcel in enumerate(parcels):
            khasra = str(parcel.get("khasra_number") or "").strip()
            path = f"parcels[{index}]"

            if not khasra:
                findings.append(
                    Finding(
                        RuleCode.INVALID_KHASRA_FORMAT, Severity.CRITICAL,
                        "Khasra number is blank.", f"{path}.khasra_number",
                    )
                )
            elif not set(khasra) <= _KHASRA_ALLOWED:
                bad = "".join(sorted(set(khasra) - _KHASRA_ALLOWED))
                findings.append(
                    Finding(
                        RuleCode.INVALID_KHASRA_FORMAT, Severity.WARNING,
                        f"Khasra number {khasra!r} contains unexpected characters ({bad}).",
                        f"{path}.khasra_number", observed=khasra,
                    )
                )

            if khasra:
                if khasra in seen:
                    findings.append(
                        Finding(
                            RuleCode.DUPLICATE_KHASRA, Severity.CRITICAL,
                            f"Khasra {khasra} appears twice (rows {seen[khasra] + 1} "
                            f"and {index + 1}).",
                            f"{path}.khasra_number", observed=khasra,
                        )
                    )
                else:
                    seen[khasra] = index

            area = D(str(parcel.get("plot_area_sqm") or 0))
            if area <= 0:
                findings.append(
                    Finding(
                        RuleCode.NON_POSITIVE_AREA, Severity.CRITICAL,
                        f"Plot area for Khasra {khasra or '?'} is {area} sqm.",
                        f"{path}.plot_area_sqm", observed=float(area), expected="> 0",
                    )
                )

            ulpin = parcel.get("ulpin")
            if ulpin and not validate_ulpin(str(ulpin)):
                findings.append(
                    Finding(
                        RuleCode.ULPIN_INVALID, Severity.WARNING,
                        f"ULPIN {ulpin} fails its check character.",
                        f"{path}.ulpin", observed=ulpin,
                    )
                )
            elif not ulpin:
                findings.append(
                    Finding(
                        RuleCode.ULPIN_MISSING, Severity.INFO,
                        "No ULPIN assigned; parcel geometry is required to mint one.",
                        f"{path}.ulpin",
                    )
                )

        return findings

    def check_metadata(self, khata: dict) -> list[Finding]:
        if not str(khata.get("khata_number") or "").strip():
            return [
                Finding(
                    RuleCode.MISSING_KHATA_NUMBER, Severity.CRITICAL,
                    "Khata number could not be read from the document.",
                    "khata.khata_number",
                )
            ]
        return []

    def check_field_confidence(self, khata: dict, parcels: list[dict], owners: list[dict]):
        findings: list[Finding] = []
        groups = (("parcels", parcels), ("owners", owners))
        for label, rows in groups:
            for index, row in enumerate(rows):
                for field_name, conf in (row.get("field_confidence") or {}).items():
                    if float(conf) < self.low_confidence_floor:
                        findings.append(
                            Finding(
                                RuleCode.LOW_FIELD_CONFIDENCE, Severity.WARNING,
                                f"{field_name} read with {float(conf):.0%} confidence; "
                                "needs a human read.",
                                f"{label}[{index}].{field_name}", observed=float(conf),
                                expected=self.low_confidence_floor,
                            )
                        )
        return findings

    # ---------------- orchestration ----------------

    def score(self, ocr_conf: float, layout_conf: float, math_pass: float) -> float:
        """C_total = 0.5·OCR + 0.3·Layout + 0.2·MathChecks"""
        return round(
            (0.5 * float(ocr_conf)) + (0.3 * float(layout_conf)) + (0.2 * float(math_pass)),
            4,
        )

    def validate(self, payload: dict) -> ValidationReport:
        khata = payload.get("khata", {}) or {}
        parcels = payload.get("parcels", []) or []
        owners = payload.get("owners", []) or []

        findings: list[Finding] = []
        findings += self.check_metadata(khata)
        findings += self.check_area_balance(khata, parcels)
        findings += self.check_owner_shares(owners)
        findings += self.check_parcels(parcels)
        findings += self.check_field_confidence(khata, parcels, owners)

        # math_checks_pass is the share of arithmetic invariants that held.
        math_rules = {RuleCode.AREA_SUM_MISMATCH, RuleCode.INVALID_OWNER_SHARES,
                      RuleCode.NON_POSITIVE_AREA, RuleCode.DUPLICATE_KHASRA}
        failed = {f.code for f in findings} & math_rules
        math_pass = (len(math_rules) - len(failed)) / len(math_rules)

        ocr_conf = float(khata.get("ocr_confidence", payload.get("ocr_confidence", 0.0)))
        layout_conf = float(khata.get("layout_confidence", payload.get("layout_confidence", 0.0)))

        report = ValidationReport(
            findings=findings,
            ocr_confidence=ocr_conf,
            layout_confidence=layout_conf,
            math_checks_pass=math_pass,
        )
        report.total_confidence = self.score(ocr_conf, layout_conf, math_pass)
        return report


def validate_record(payload: dict) -> ValidationReport:
    return LandRecordValidator().validate(payload)
