"""Tests for the parts an evaluator will poke at: unit conversion, ULPIN
integrity, and the arithmetic invariants that decide whether a record is
allowed into the land register."""

from decimal import Decimal

import pytest

from app.services.ulpin import (
    ULPIN_LENGTH,
    UlpinError,
    generate_ulpin,
    ulpin_to_centroid,
    validate_ulpin,
)
from app.services.units import (
    UnitResolutionError,
    normalise_digits,
    parse_area_expression,
    resolve_unit,
    to_sqm,
)
from app.services.validator import LandRecordValidator, RuleCode, Severity

D = Decimal


# ---------------------------------------------------------------- units
def test_hectare_and_guntha_conversion():
    assert to_sqm(1, "hectare")[0] == D("10000.0000")
    assert to_sqm(1, "guntha", state="Maharashtra")[0] == D("101.1700")
    assert to_sqm(1, "cent", state="Tamil Nadu")[0] == D("40.4600")


def test_bigha_resolves_differently_by_zone():
    """The whole point of the regional table: same word, different land."""
    west = to_sqm(1, "bigha", state="Uttar Pradesh", district="Meerut")[0]
    east = to_sqm(1, "bigha", state="Uttar Pradesh", district="Varanasi")[0]
    bihar = to_sqm(1, "bigha", state="Bihar", district="Patna")[0]

    assert west == D("2529.3000")
    assert east == D("1618.7000")
    assert bihar == east
    assert west > east


def test_ambiguous_bigha_without_region_is_rejected():
    with pytest.raises(UnitResolutionError, match="region-dependent"):
        resolve_unit("bigha", state=None, district=None)


def test_devanagari_digits_and_units():
    assert normalise_digits("२५") == "25"
    area = parse_area_expression("२ हेक्टेयर", state="Bihar")
    assert area == D("20000.0000")


def test_compound_area_expression():
    """'2 बीघा 10 बिस्वा' in Western UP = 2*2529.3 + 10*126.465"""
    total = parse_area_expression("2 बीघा 10 बिस्वा", state="Uttar Pradesh", district="Meerut")
    assert total == D("6323.2500")


def test_unknown_unit_raises():
    with pytest.raises(UnitResolutionError):
        to_sqm(1, "furlong-squared")


# ---------------------------------------------------------------- ULPIN
def test_ulpin_shape_and_checksum():
    ulpin = generate_ulpin(18.5793, 73.9776, state="Maharashtra")
    assert len(ulpin) == ULPIN_LENGTH
    assert ulpin.startswith("MH")
    assert validate_ulpin(ulpin)


def test_ulpin_is_deterministic_and_reversible():
    lat, lon = 25.5760, 85.0640
    first = generate_ulpin(lat, lon, state="Bihar")
    assert first == generate_ulpin(lat, lon, state="Bihar")

    back_lat, back_lon = ulpin_to_centroid(first)
    assert abs(back_lat - lat) < 0.0001
    assert abs(back_lon - lon) < 0.0001


def test_ulpin_detects_a_mistyped_character():
    ulpin = generate_ulpin(29.1450, 77.6100, state="Uttar Pradesh")
    body = list(ulpin)
    body[5] = "0" if body[5] != "0" else "1"
    assert not validate_ulpin("".join(body))


def test_distinct_parcels_get_distinct_ulpins():
    a = generate_ulpin(18.5793, 73.9776, state="Maharashtra")
    b = generate_ulpin(18.5802, 73.9787, state="Maharashtra")
    assert a != b


def test_out_of_range_coordinates_rejected():
    with pytest.raises(UlpinError):
        generate_ulpin(120.0, 40.0, state="Bihar")


# ------------------------------------------------------------ validator
def _record(total, parcel_areas, shares, ocr=0.95, layout=0.95):
    return {
        "khata": {
            "khata_number": "142",
            "total_area_sqm": total,
            "ocr_confidence": ocr,
            "layout_confidence": layout,
        },
        "parcels": [
            {"khasra_number": f"{100 + i}", "plot_area_sqm": area,
             "ulpin": None, "field_confidence": {}}
            for i, area in enumerate(parcel_areas)
        ],
        "owners": [{"share_percentage": s, "field_confidence": {}} for s in shares],
    }


def test_case_a_balanced_record_commits():
    guntha = D("101.17")
    report = LandRecordValidator().validate(
        _record(guntha * 99, [guntha * 40, guntha * 25, guntha * 34], [D("50"), D("50")],
                ocr=0.972, layout=0.961)
    )
    assert report.critical == []
    assert report.total_confidence >= 0.85
    assert report.is_committable


def test_case_b_low_confidence_blocks_commit_without_critical_errors():
    bigha = D("2529.3")
    payload = _record(bigha * 4, [bigha * 2, bigha, bigha],
                      [D("33.34"), D("33.33"), D("33.33")], ocr=0.741, layout=0.802)
    payload["parcels"][1]["field_confidence"] = {"khasra_number": 0.43}
    report = LandRecordValidator().validate(payload)

    assert report.critical == []            # the arithmetic is fine
    assert not report.is_committable        # but nobody can vouch for the reading
    assert any(f.code is RuleCode.LOW_FIELD_CONFIDENCE for f in report.findings)


def test_case_c_area_mismatch_is_critical_regardless_of_confidence():
    """1.15 ha of parcels against a 1.00 ha declaration. High OCR confidence
    must not be able to push this through."""
    ha = D("10000")
    report = LandRecordValidator().validate(
        _record(ha, [ha * D("0.55"), ha * D("0.35"), ha * D("0.25")],
                [D("60"), D("40")], ocr=0.99, layout=0.99)
    )

    mismatch = [f for f in report.findings if f.code is RuleCode.AREA_SUM_MISMATCH]
    assert len(mismatch) == 1
    assert mismatch[0].severity is Severity.CRITICAL
    assert mismatch[0].delta == pytest.approx(1500.0)
    assert not report.is_committable


def test_area_tolerance_absorbs_rounding_but_not_error():
    ha = D("10000")
    ok = LandRecordValidator().validate(_record(ha, [D("9999.998")], [D("100")]))
    assert not [f for f in ok.findings if f.code is RuleCode.AREA_SUM_MISMATCH]

    bad = LandRecordValidator().validate(_record(ha, [D("9999.98")], [D("100")]))
    assert [f for f in bad.findings if f.code is RuleCode.AREA_SUM_MISMATCH]


def test_shares_must_close_to_100():
    ha = D("10000")
    report = LandRecordValidator().validate(_record(ha, [ha], [D("60"), D("30")]))
    finding = next(f for f in report.findings if f.code is RuleCode.INVALID_OWNER_SHARES)
    assert finding.severity is Severity.CRITICAL
    assert finding.observed == pytest.approx(90.0)


def test_thirds_are_accepted_within_tolerance():
    ha = D("10000")
    report = LandRecordValidator().validate(
        _record(ha, [ha], [D("33.34"), D("33.33"), D("33.33")])
    )
    assert not [f for f in report.findings if f.code is RuleCode.INVALID_OWNER_SHARES]


def test_duplicate_khasra_is_critical():
    ha = D("10000")
    payload = _record(ha, [ha / 2, ha / 2], [D("100")])
    payload["parcels"][1]["khasra_number"] = payload["parcels"][0]["khasra_number"]
    report = LandRecordValidator().validate(payload)
    assert any(f.code is RuleCode.DUPLICATE_KHASRA for f in report.findings)


def test_khata_with_no_owner_is_rejected():
    report = LandRecordValidator().validate(_record(D("10000"), [D("10000")], []))
    assert any(f.code is RuleCode.ORPHAN_OWNER for f in report.findings)


def test_confidence_weighting_matches_the_specified_formula():
    validator = LandRecordValidator()
    assert validator.score(0.9, 0.8, 1.0) == pytest.approx(0.5 * 0.9 + 0.3 * 0.8 + 0.2 * 1.0)


def test_unread_placeholder_counts_as_missing_khata_number():
    """A record whose Khata number OCR could not read must never auto-commit,
    even though the placeholder "UNREAD" is stored in its place."""
    record = {
        "khata": {"khata_number": "UNREAD", "total_area_sqm": Decimal("100"),
                  "ocr_confidence": 0.99, "layout_confidence": 0.99},
        "parcels": [{"khasra_number": "12", "plot_area_sqm": Decimal("100")}],
        "owners": [{"share_percentage": Decimal("100")}],
    }
    report = LandRecordValidator().validate(record)
    assert RuleCode.MISSING_KHATA_NUMBER in {f.code for f in report.critical}
    assert not report.is_committable
