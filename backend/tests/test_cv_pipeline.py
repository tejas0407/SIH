"""CV tests. These run without any OCR model on disk — they exercise geometry,
deskew accuracy and layout detection, which is where most real failures live."""

import cv2
import numpy as np
import pytest

from app.seed.generate_scans import case_a_clean, degrade
from app.services.cv_pipeline import (
    DocumentLayoutSegmenter,
    DualOcrEngine,
    EntityExtractor,
    ImagePreprocessor,
    OcrToken,
    _iou,
)


@pytest.fixture(scope="module")
def clean_page():
    return case_a_clean()


def test_deskew_recovers_a_known_rotation(clean_page):
    """Rotate a page by a known angle and check the estimator asks for exactly
    the opposite rotation. The estimator returns a correction angle, not the
    angle that was applied, so undoing a -5 degree skew means reporting +5."""
    h, w = clean_page.shape
    matrix = cv2.getRotationMatrix2D((w / 2, h / 2), -5.0, 1.0)
    skewed = cv2.warpAffine(clean_page, matrix, (w, h), borderValue=240)

    estimated = ImagePreprocessor().estimate_skew_hough(skewed)
    assert estimated == pytest.approx(5.0, abs=1.0)


def test_deskew_leaves_no_residual_skew(clean_page):
    """The real contract: after deskewing, the page is straight."""
    h, w = clean_page.shape
    matrix = cv2.getRotationMatrix2D((w / 2, h / 2), -5.0, 1.0)
    skewed = cv2.warpAffine(clean_page, matrix, (w, h), borderValue=240)

    corrected, applied = ImagePreprocessor().deskew(skewed)
    assert applied == pytest.approx(5.0, abs=1.0)
    assert ImagePreprocessor().estimate_skew_hough(corrected) == pytest.approx(0.0, abs=0.5)


def test_deskew_leaves_a_straight_page_alone(clean_page):
    _, angle = ImagePreprocessor().deskew(clean_page)
    assert abs(angle) < 1.0


def test_radon_fallback_handles_pages_without_rulings():
    """A blank-ruled page still has text lines; Radon should find the skew."""
    page = np.full((700, 900), 245, np.uint8)
    for y in range(100, 600, 45):
        cv2.line(page, (90, y), (800, y), 30, 6)

    matrix = cv2.getRotationMatrix2D((450, 350), 4.0, 1.0)
    skewed = cv2.warpAffine(page, matrix, (900, 700), borderValue=245)

    estimated = ImagePreprocessor().estimate_skew_radon(skewed)
    assert estimated == pytest.approx(-4.0, abs=1.5)


def test_sauvola_binarisation_survives_uneven_lighting(clean_page):
    h, w = clean_page.shape
    gradient = np.tile(np.linspace(1.0, 0.55, w), (h, 1))
    lit = np.clip(clean_page * gradient, 0, 255).astype(np.uint8)

    binary = ImagePreprocessor().sauvola_threshold(lit)
    assert set(np.unique(binary)) <= {0, 255}

    # Ink must remain on both the bright and the dark side of the page.
    left_ink = (binary[:, : w // 2] == 0).mean()
    right_ink = (binary[:, w // 2 :] == 0).mean()
    assert left_ink > 0.001 and right_ink > 0.001


def test_degraded_page_is_restored_well_enough_to_segment(clean_page):
    """Case B end to end: a folded, skewed, speckled scan comes back with its
    parcel table findable."""
    degraded = degrade(clean_page, angle=-6.5)
    preprocessor = ImagePreprocessor()

    deskewed, angle = preprocessor.deskew(degraded)
    assert abs(angle) > 3.0                      # it noticed the skew
    assert abs(6.5 - angle) < 2.5                # and asked for the right correction

    cleaned = preprocessor.remove_bleed_through(deskewed)
    binary = preprocessor.close_folds(preprocessor.sauvola_threshold(cleaned))

    table = DocumentLayoutSegmenter().detect_table(binary)
    assert table is not None
    assert table.confidence > 0.5


def test_layout_finds_header_and_table(clean_page):
    preprocessor = ImagePreprocessor()
    binary = preprocessor.close_folds(preprocessor.sauvola_threshold(clean_page))
    from app.services.cv_pipeline import PageArtifacts

    page = PageArtifacts(page=0, original=clean_page, binarised=binary, skew_angle=0.0)
    zones = DocumentLayoutSegmenter().segment(page)

    kinds = {z.kind for z in zones}
    assert "table" in kinds
    assert "header" in kinds
    assert 0.0 <= DocumentLayoutSegmenter.layout_confidence(zones) <= 1.0


def test_iou_is_symmetric_and_bounded():
    a, b = (0, 0, 100, 100), (50, 50, 150, 150)
    assert _iou(a, b) == pytest.approx(_iou(b, a))
    assert 0 < _iou(a, b) < 1
    assert _iou(a, (500, 500, 600, 600)) == 0.0


def test_rows_group_by_vertical_position():
    tokens = [
        OcrToken("512", (100, 40, 130, 90), 0.9),
        OcrToken("2 बीघा", (104, 300, 134, 420), 0.9),
        OcrToken("सिंचित", (98, 700, 128, 820), 0.9),
        OcrToken("513/1", (200, 40, 230, 100), 0.9),
        OcrToken("1 बीघा", (203, 300, 233, 420), 0.9),
    ]
    rows = EntityExtractor.group_rows(tokens)
    assert len(rows) == 2
    assert [t.text for t in rows[0]] == ["512", "2 बीघा", "सिंचित"]


def test_parcels_parse_with_regional_units():
    extractor = EntityExtractor(state="Uttar Pradesh", district="Meerut")
    rows = [
        [OcrToken("खसरा संख्या 512", (100, 40, 130, 260), 0.94),
         OcrToken("2 बीघा", (100, 300, 130, 420), 0.91)],
        [OcrToken("खसरा संख्या 515", (200, 40, 230, 260), 0.88),
         OcrToken("1 बीघा", (200, 300, 230, 420), 0.86)],
    ]
    parcels = extractor.extract_parcels(rows)

    assert [p["khasra_number"] for p in parcels] == ["512", "515"]
    assert float(parcels[0]["plot_area_sqm"]) == pytest.approx(2 * 2529.3, abs=0.01)


def test_owner_and_share_parsing():
    extractor = EntityExtractor(state="Bihar", district="Patna")
    rows = [[OcrToken("मोहन प्रसाद यादव पुत्र रामदेव यादव 1/2", (10, 10, 40, 600), 0.9)]]
    owners = extractor.extract_owners(rows)

    assert owners[0]["relation_type"] == "S/o"
    assert float(owners[0]["share_percentage"]) == pytest.approx(50.0)


def test_shares_are_implied_equal_when_the_page_omits_them():
    extractor = EntityExtractor()
    rows = [
        [OcrToken("हरिओम सिंह पुत्र जगदीश सिंह", (10, 10, 40, 500), 0.9)],
        [OcrToken("बलवीर सिंह पुत्र जगदीश सिंह", (60, 10, 90, 500), 0.9)],
    ]
    owners = extractor.extract_owners(rows)
    assert sum(float(o["share_percentage"]) for o in owners) == pytest.approx(100.0)


def test_duplicate_readings_are_deduplicated_by_confidence():
    tokens = [
        OcrToken("142", (10, 10, 40, 80), 0.65, language="hi"),
        OcrToken("142", (11, 11, 41, 81), 0.93, language="en"),
    ]
    kept = DualOcrEngine._deduplicate(tokens)
    assert len(kept) == 1
    assert kept[0].confidence == 0.93
