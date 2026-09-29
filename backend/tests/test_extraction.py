"""Entity extraction from OCR tokens, using the noise real OCR produces:
misspelt labels, labels split from their values, doubled readings from two
passes, O-for-0 and garbled relation words. No OCR model is needed."""

from decimal import Decimal

from app.services.cv_pipeline import DualOcrEngine, EntityExtractor, OcrToken


def tok(text, y, x, w=80, h=30, conf=0.9):
    return OcrToken(text, (y, x, y + h, x + w), conf)


def test_khata_number_label_split_across_tokens_and_misspelt():
    tokens = [tok("खाता", 100, 100), tok("सखया", 100, 190), tok("305", 100, 280)]
    number, _, bbox = EntityExtractor().extract_khata_number(tokens)
    assert number == "305"
    assert bbox["xmin"] == 100 and bbox["xmax"] == 360


def test_khasra_label_with_dropped_halant():
    rows = [[tok("खसरा", 200, 100), tok("संखया", 200, 190), tok("221/1", 200, 280),
             tok("40 guntha", 200, 400, w=130)]]
    parcels = EntityExtractor(state="Maharashtra").extract_parcels(rows)
    assert [(p["khasra_number"], p["plot_area_sqm"]) for p in parcels] == [
        ("221/1", Decimal("4046.8000"))
    ]


def test_doubled_reading_is_not_added_twice():
    ex = EntityExtractor(state="Bihar", district="Patna")
    assert ex.extract_area("0.55 0.55 hectare. hectare") == Decimal("5500.0000")
    assert ex.extract_area("0.35 hectare 0.35 hectare") == Decimal("3500.0000")


def test_letter_o_read_for_zero():
    ex = EntityExtractor(state="Bihar", district="Patna")
    assert ex.extract_area("O.35 hectare") == Decimal("3500.0000")


def test_compound_units_still_sum():
    ex = EntityExtractor(state="Uttar Pradesh", district="Meerut")
    # 2 bigha + 10 biswa in western UP = 2 × 2529.3 + 10 × 126.465 m²
    assert ex.extract_area("2 बीघा 10 बिस्वा") == Decimal("6323.2500")


def test_labelled_row_with_unreadable_area_is_kept_for_review():
    rows = [[tok("खसरा", 200, 100), tok("संख्या", 200, 190), tok("512", 200, 280),
             tok("q|eT Hall?", 200, 400)]]
    parcels = EntityExtractor(state="Uttar Pradesh", district="Meerut").extract_parcels(rows)
    assert parcels[0]["khasra_number"] == "512"
    assert parcels[0]["plot_area_sqm"] == 0


def test_numbered_owner_line_is_not_a_parcel():
    rows = [[tok("1.", 900, 100, w=20), tok("हरिओम", 900, 130), tok("1/3", 900, 400)]]
    assert EntityExtractor().extract_parcels(rows) == []


def test_owner_without_readable_relation_under_heading():
    rows = [
        [tok("खातेदार", 800, 100), tok("विवरण", 800, 190)],
        [tok("1.", 850, 100, w=20), tok("बलवीर", 850, 130), tok("सिंह", 850, 220),
         tok("$/ th.", 850, 300), tok("1/3", 850, 400)],
    ]
    owners = EntityExtractor().extract_owners(rows)
    assert len(owners) == 1
    assert owners[0]["owner_name_vernacular"] == "बलवीर सिंह"
    assert owners[0]["share_percentage"] == Decimal("33.33")
    assert owners[0]["relation_type"] is None


def test_share_lines_above_the_owner_heading_are_ignored():
    rows = [[tok("कुल", 700, 100), tok("1/2", 700, 200)], [tok("खातेदार", 800, 100)]]
    assert EntityExtractor().extract_owners(rows) == []


def test_latin_ghost_over_devanagari_is_dropped():
    tokens = [
        tok("I HI 221/1", 200, 100, w=260, conf=0.95),
        tok("खसरा", 200, 100, w=90),
        tok("संखया", 200, 195, w=80),
        tok("221/१", 200, 280, w=80),
        tok("40 guntha", 200, 400, w=130),
    ]
    kept = [t.text for t in DualOcrEngine._deduplicate(tokens)]
    assert "I HI 221/1" not in kept
    assert "40 guntha" in kept
