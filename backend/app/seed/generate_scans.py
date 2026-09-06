"""Synthetic scan generator for the demo dataset.

Real Jamabandi scans cannot be shipped in a public repository — they carry
citizens' names and Khasra numbers. These pages are drawn from scratch with the
same layout grammar as a real register (title block, ruled parcel table, owner
column, margin remarks, round revenue seal) so the pipeline exercises exactly
the same code paths, and Case B is then physically degraded: rotated, blurred,
speckled, and given a fold line and reverse-side bleed-through.
"""

from __future__ import annotations

import random
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

PAGE_W, PAGE_H = 1700, 2200  # A4 at 200 DPI

FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/lohit-devanagari/Lohit-Devanagari.ttf",
    "/usr/share/fonts/truetype/Sarai/Sarai.ttf",
    "/usr/share/fonts/truetype/noto/NotoSansDevanagari-Regular.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]


_WARNED = False


def _devanagari_font_path() -> str | None:
    for path in FONT_CANDIDATES[:-1]:      # last entry is the Latin-only fallback
        if Path(path).exists():
            return path
    return None


def _font(size: int) -> ImageFont.FreeTypeFont:
    global _WARNED
    if _devanagari_font_path() is None and not _WARNED:
        _WARNED = True
        print(
            "WARNING: no Devanagari font found, so Hindi and Marathi text will "
            "render as empty boxes. Install fonts-lohit-deva (the backend "
            "Docker image already does) and regenerate."
        )
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def _draw_seal(draw: ImageDraw.ImageDraw, cx: int, cy: int, r: int = 90) -> None:
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=30, width=4)
    draw.ellipse([cx - r + 12, cy - r + 12, cx + r - 12, cy + r - 12], outline=30, width=2)
    label = _font(20)
    draw.text((cx - 62, cy - 12), "REVENUE", font=label, fill=40)
    draw.text((cx - 46, cy + 10), "OFFICE", font=label, fill=40)


def render_register_page(
    title: str,
    subtitle: str,
    khata_number: str,
    rows: list[tuple[str, str, str]],
    owners: list[str],
    total_line: str,
    remark: str,
) -> np.ndarray:
    """Draw one Record of Rights page as a clean grayscale array."""
    image = Image.new("L", (PAGE_W, PAGE_H), color=248)
    draw = ImageDraw.Draw(image)

    h1, h2, body, small = _font(52), _font(34), _font(30), _font(24)

    draw.text((110, 90), title, font=h1, fill=20)
    draw.text((110, 165), subtitle, font=h2, fill=45)
    draw.line([(110, 220), (PAGE_W - 110, 220)], fill=60, width=3)
    draw.text((110, 250), khata_number, font=h2, fill=20)

    # ---- ruled parcel table ----
    top, left, right = 340, 110, PAGE_W - 420
    row_h = 74
    col_x = [left, left + 300, left + 720, right]
    table_bottom = top + row_h * (len(rows) + 2)

    for index in range(len(rows) + 3):
        y = top + index * row_h
        if y <= table_bottom:
            draw.line([(left, y), (right, y)], fill=70, width=2)
    for x in col_x:
        draw.line([(x, top), (x, table_bottom)], fill=70, width=2)

    headers = ("खसरा संख्या", "क्षेत्रफल", "भूमि श्रेणी")
    for index, header in enumerate(headers):
        draw.text((col_x[index] + 18, top + 20), header, font=body, fill=25)

    for r_index, row in enumerate(rows, start=1):
        for c_index, cell in enumerate(row):
            draw.text((col_x[c_index] + 18, top + r_index * row_h + 20), cell, font=body, fill=25)

    draw.text((col_x[0] + 18, top + (len(rows) + 1) * row_h + 20), total_line, font=body, fill=25)

    # ---- owner block ----
    y = table_bottom + 70
    draw.text((110, y), "खातेदार विवरण", font=h2, fill=20)
    for index, owner in enumerate(owners):
        draw.text((130, y + 60 + index * 52), f"{index + 1}. {owner}", font=body, fill=25)

    # ---- margin remarks (handwriting zone) ----
    mx = right + 40
    draw.line([(mx - 20, top), (mx - 20, table_bottom + 320)], fill=90, width=2)
    draw.text((mx, top + 20), "टिप्पणी", font=small, fill=60)
    for index, chunk in enumerate(_wrap(remark, 16)):
        draw.text((mx, top + 70 + index * 40), chunk, font=small, fill=55)

    _draw_seal(draw, PAGE_W - 260, PAGE_H - 260)
    draw.text((150, PAGE_H - 200), "पटवारी हस्ताक्षर", font=small, fill=60)
    draw.line([(150, PAGE_H - 150), (520, PAGE_H - 155)], fill=45, width=3)

    return np.array(image)


def _wrap(text: str, width: int) -> list[str]:
    words, lines, current = text.split(), [], ""
    for word in words:
        if len(current) + len(word) + 1 > width:
            lines.append(current)
            current = word
        else:
            current = f"{current} {word}".strip()
    if current:
        lines.append(current)
    return lines


def degrade(image: np.ndarray, angle: float = -6.5, seed: int = 7) -> np.ndarray:
    """Age a clean page: skew, fold, bleed-through, speckle, blur.

    This is what Case B demonstrates — the preprocessor has to undo all of it
    before OCR sees the page."""
    rng = np.random.default_rng(seed)
    random.seed(seed)
    h, w = image.shape

    # 1. reverse-side ink showing through
    bleed = cv2.flip(image, 1)
    faded = cv2.addWeighted(image, 0.88, bleed, 0.12, 0)

    # 2. uneven illumination from book-spine curvature
    gradient = np.tile(np.linspace(1.0, 0.72, w), (h, 1))
    lit = np.clip(faded.astype(np.float32) * gradient, 0, 255).astype(np.uint8)

    # 3. physical fold: a bright crease with a dark shadow beside it
    fold_x = w // 2 + 40
    lit[:, fold_x - 3:fold_x + 3] = np.clip(
        lit[:, fold_x - 3:fold_x + 3].astype(np.int16) + 40, 0, 255
    ).astype(np.uint8)
    lit[:, fold_x + 3:fold_x + 8] = np.clip(
        lit[:, fold_x + 3:fold_x + 8].astype(np.int16) - 60, 0, 255
    ).astype(np.uint8)

    # 4. foxing spots and dust
    for _ in range(160):
        cx, cy = rng.integers(0, w), rng.integers(0, h)
        cv2.circle(lit, (int(cx), int(cy)), int(rng.integers(1, 6)),
                   int(rng.integers(90, 170)), -1)

    # 5. sensor noise + soft focus
    noisy = np.clip(lit.astype(np.int16) + rng.normal(0, 9, lit.shape), 0, 255).astype(np.uint8)
    blurred = cv2.GaussianBlur(noisy, (3, 3), 0.9)

    # 6. skew introduced by a hand-fed flatbed scanner
    matrix = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    return cv2.warpAffine(
        blurred, matrix, (w, h), flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_CONSTANT, borderValue=235,
    )


# ---------------------------------------------------------------------
# The three demo pages
# ---------------------------------------------------------------------
def case_a_clean() -> np.ndarray:
    """Maharashtra 7/12 extract, crisp scan, arithmetic closes."""
    return render_register_page(
        title="गाव नमुना सात-बारा",
        subtitle="तालुका: हवेली   जिल्हा: पुणे   राज्य: महाराष्ट्र",
        khata_number="खाता संख्या : 142",
        rows=[
            ("खसरा संख्या 221/1", "40 guntha", "बागायत"),
            ("खसरा संख्या 221/2", "25 guntha", "जिरायत"),
            ("खसरा संख्या 223", "34 guntha", "बागायत"),
        ],
        owners=[
            "रमेश शिवाजी पाटील पुत्र शिवाजी पाटील  1/2",
            "सुनीता रमेश पाटील पत्नी रमेश पाटील  1/2",
        ],
        total_line="कुल योग : 99 guntha",
        remark="मोजणी 2019 मध्ये पूर्ण",
    )


def case_b_degraded() -> np.ndarray:
    """Western UP Khatauni, folded and skewed — the preprocessing showcase."""
    clean = render_register_page(
        title="खतौनी अभिलेख",
        subtitle="तहसील: सरधना   जिला: मेरठ   राज्य: उत्तर प्रदेश",
        khata_number="खाता संख्या : 87",
        rows=[
            ("खसरा संख्या 512", "2 बीघा", "सिंचित"),
            ("खसरा संख्या 513/1", "1 बीघा", "सिंचित"),
            ("खसरा संख्या 515", "1 बीघा", "असिंचित"),
        ],
        owners=[
            "हरिओम सिंह पुत्र जगदीश सिंह  1/3",
            "बलवीर सिंह पुत्र जगदीश सिंह  1/3",
            "कमला देवी पत्नी जगदीश सिंह  1/3",
        ],
        total_line="कुल योग : 4 बीघा",
        remark="पृष्ठ मुड़ा हुआ है पुनः सत्यापन आवश्यक",
    )
    return degrade(clean, angle=-6.5)


def case_c_discrepancy() -> np.ndarray:
    """Bihar Jamabandi where the parcels total 1.15 ha but the page says 1.00 ha."""
    return render_register_page(
        title="जमाबंदी पंजी",
        subtitle="अंचल: फुलवारी शरीफ   जिला: पटना   राज्य: बिहार",
        khata_number="खाता संख्या : 305",
        rows=[
            ("खसरा संख्या 88", "0.55 hectare", "सिंचित"),
            ("खसरा संख्या 89", "0.35 hectare", "सिंचित"),
            ("खसरा संख्या 91", "0.25 hectare", "बंजर"),
        ],
        owners=[
            "मोहन प्रसाद यादव पुत्र रामदेव यादव  60%",
            "गीता देवी पत्नी मोहन प्रसाद  40%",
        ],
        total_line="कुल योग : 1.00 hectare",
        remark="दाखिल खारिज लंबित",
    )


CASES = {
    "case_a_clean_712.png": case_a_clean,
    "case_b_degraded_khatauni.png": case_b_degraded,
    "case_c_area_discrepancy.png": case_c_discrepancy,
}


def write_all(destination: str | Path = "app/seed/scans") -> list[Path]:
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=True)
    written = []
    for name, builder in CASES.items():
        path = destination / name
        cv2.imwrite(str(path), builder())
        written.append(path)
    return written


if __name__ == "__main__":
    for path in write_all():
        print(f"wrote {path}")
