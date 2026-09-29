"""End-to-end computer-vision pipeline for legacy land records.

Stages
------
1. ImagePreprocessor       — rasterise, deskew, denoise without eating matras
2. DocumentLayoutSegmenter — split the page into header / table / margin / seal
3. DualOcrEngine           — PaddleOCR for print, TrOCR for Patwari handwriting
4. EntityExtractor         — tokens to typed DTOs

Heavy models (paddle, torch) are imported lazily inside the classes that need
them. That keeps the FastAPI process light — only Celery workers pay the import
cost — and lets the test suite run the geometry and parsing logic without a
single model weight on disk.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from app.core.config import settings
from app.services.units import _AREA_RE, UnitResolutionError, normalise_digits, to_sqm

logger = logging.getLogger(__name__)

BBox = tuple[int, int, int, int]  # (ymin, xmin, ymax, xmax)


def encode_png(image: np.ndarray) -> bytes:
    ok, encoded = cv2.imencode(".png", image)
    if not ok:
        raise ValueError("could not PNG-encode page image")
    return encoded.tobytes()


@dataclass
class OcrToken:
    text: str
    bbox: BBox
    confidence: float
    page: int = 0
    source: str = "printed"     # 'printed' | 'handwritten'
    language: str | None = None

    def to_dict(self) -> dict:
        ymin, xmin, ymax, xmax = self.bbox
        return {
            "text": self.text,
            "bbox": {"ymin": ymin, "xmin": xmin, "ymax": ymax, "xmax": xmax},
            "confidence": round(self.confidence, 4),
            "page": self.page,
            "source": self.source,
            "language": self.language,
        }


@dataclass
class LayoutZone:
    kind: str                   # header | table | margin_remarks | seal | unknown
    bbox: BBox
    confidence: float
    page: int = 0

    def crop(self, image: np.ndarray) -> np.ndarray:
        ymin, xmin, ymax, xmax = self.bbox
        return image[max(ymin, 0):ymax, max(xmin, 0):xmax]


@dataclass
class PageArtifacts:
    page: int
    original: np.ndarray
    binarised: np.ndarray
    skew_angle: float
    zones: list[LayoutZone] = field(default_factory=list)
    tokens: list[OcrToken] = field(default_factory=list)


# =====================================================================
# 1. Preprocessing
# =====================================================================
class ImagePreprocessor:
    """Turns whatever the tehsil record room scanned into a clean binary page.

    Legacy Jamabandi scans arrive folded, skewed, and with ink from the reverse
    side showing through. The order below matters: deskew before thresholding,
    because a rotated page smears the local windows Sauvola relies on.
    """

    def __init__(self, target_dpi: int | None = None, max_angle: float | None = None):
        self.target_dpi = target_dpi or settings.TARGET_DPI
        self.max_angle = max_angle or settings.MAX_DESKEW_ANGLE

    # ---------- ingestion ----------
    def load_pages(self, path: str | Path) -> list[np.ndarray]:
        """Accept PDF, TIFF, JPEG or PNG and return one grayscale array per page."""
        path = Path(path)
        suffix = path.suffix.lower()

        if suffix == ".pdf":
            from pdf2image import convert_from_path

            pages = convert_from_path(str(path), dpi=self.target_dpi, grayscale=True)
            return [np.array(p) for p in pages]

        if suffix in {".tif", ".tiff"}:
            ok, frames = cv2.imreadmulti(str(path), flags=cv2.IMREAD_GRAYSCALE)
            if ok and frames:
                return [np.asarray(f) for f in frames]

        image = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
        if image is None:
            raise ValueError(f"unreadable image: {path}")
        return [image]

    def normalise_resolution(self, image: np.ndarray, source_dpi: int = 200) -> np.ndarray:
        """Upsample low-DPI scans so Devanagari matras survive binarisation."""
        if source_dpi >= self.target_dpi:
            return image
        scale = self.target_dpi / float(source_dpi)
        return cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

    # ---------- deskew ----------
    def estimate_skew_hough(self, image: np.ndarray) -> float:
        """Angle from the dominant near-horizontal ruling of the parcel table."""
        edges = cv2.Canny(image, 50, 150, apertureSize=3)
        min_len = max(60, image.shape[1] // 6)
        lines = cv2.HoughLinesP(
            edges, 1, np.pi / 720, threshold=120,
            minLineLength=min_len, maxLineGap=20,
        )
        if lines is None:
            return 0.0

        angles: list[float] = []
        for x1, y1, x2, y2 in lines[:, 0]:
            angle = np.degrees(np.arctan2(y2 - y1, x2 - x1))
            if abs(angle) <= self.max_angle:
                angles.append(angle)
        if not angles:
            return 0.0
        return float(np.median(angles))

    def estimate_skew_radon(self, image: np.ndarray, coarse: float = 1.0) -> float:
        """Projection-profile (Radon) fallback for pages with no printed rules —
        handwritten Khatauni sheets in particular. The correct angle is the one
        that maximises variance of the horizontal ink projection."""
        binary = (image < 128).astype(np.float32)
        small = cv2.resize(binary, None, fx=0.35, fy=0.35, interpolation=cv2.INTER_AREA)
        h, w = small.shape
        centre = (w / 2, h / 2)

        best_angle, best_score = 0.0, -1.0
        angle = -self.max_angle
        while angle <= self.max_angle:
            matrix = cv2.getRotationMatrix2D(centre, angle, 1.0)
            rotated = cv2.warpAffine(small, matrix, (w, h), flags=cv2.INTER_LINEAR)
            projection = rotated.sum(axis=1)
            score = float(np.var(np.diff(projection)))
            if score > best_score:
                best_angle, best_score = angle, score
            angle += coarse

        # Refine around the coarse maximum at 0.1 degree steps.
        angle = best_angle - coarse
        while angle <= best_angle + coarse:
            matrix = cv2.getRotationMatrix2D(centre, angle, 1.0)
            rotated = cv2.warpAffine(small, matrix, (w, h), flags=cv2.INTER_LINEAR)
            score = float(np.var(np.diff(rotated.sum(axis=1))))
            if score > best_score:
                best_angle, best_score = angle, score
            angle += 0.1

        return float(best_angle)

    def deskew(self, image: np.ndarray) -> tuple[np.ndarray, float]:
        angle = self.estimate_skew_hough(image)
        if abs(angle) < 0.15:
            angle = self.estimate_skew_radon(image)
        if abs(angle) < 0.1:
            return image, 0.0

        h, w = image.shape[:2]
        matrix = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
        cos, sin = abs(matrix[0, 0]), abs(matrix[0, 1])
        new_w, new_h = int(h * sin + w * cos), int(h * cos + w * sin)
        matrix[0, 2] += (new_w / 2) - w / 2
        matrix[1, 2] += (new_h / 2) - h / 2

        rotated = cv2.warpAffine(
            image, matrix, (new_w, new_h),
            flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE,
        )
        return rotated, round(float(angle), 3)

    # ---------- cleanup ----------
    def remove_bleed_through(self, image: np.ndarray) -> np.ndarray:
        """Ink from the reverse side is lower-contrast than the true text, so a
        large-kernel background estimate divides it out while leaving strokes."""
        background = cv2.medianBlur(image, 31)
        normalised = cv2.divide(image, background, scale=255)
        return cv2.normalize(normalised, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)

    def sauvola_threshold(self, image: np.ndarray, window: int = 41, k: float = 0.28):
        """Sauvola adaptive binarisation.

        Chosen over Otsu because Jamabandi pages have uneven illumination from
        book-spine curvature; a global threshold erases whole columns. k is kept
        low (0.28) so thin Devanagari matras and nukta dots are not thinned away.
        """
        try:
            from skimage.filters import threshold_sauvola

            threshold = threshold_sauvola(image, window_size=window, k=k)
            return ((image > threshold) * 255).astype(np.uint8)
        except ImportError:  # pragma: no cover - scikit-image always present in docker
            return cv2.adaptiveThreshold(
                image, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv2.THRESH_BINARY, window if window % 2 else window + 1, 10,
            )

    def close_folds(self, binary: np.ndarray, min_speckle_area: int = 6) -> np.ndarray:
        """Repair strokes broken by a fold, then drop foxing specks.

        Two details matter here. The closing runs on the inverted image, because
        the strokes are the foreground and closing the white background would
        erase thin ink instead of joining it. And speckles are removed by
        connected-component area rather than a median blur: a 3x3 median wipes
        out the 2-pixel table rulings the layout stage depends on, which leaves
        the segmenter unable to find the parcel table at all.
        """
        ink = cv2.bitwise_not(binary)

        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 3))
        ink = cv2.morphologyEx(ink, cv2.MORPH_CLOSE, kernel, iterations=1)

        count, labels, stats, _ = cv2.connectedComponentsWithStats(ink, connectivity=8)
        if count > 1:
            keep = np.flatnonzero(stats[:, cv2.CC_STAT_AREA] >= min_speckle_area)
            keep = keep[keep != 0]
            ink = np.isin(labels, keep).astype(np.uint8) * 255

        return cv2.bitwise_not(ink)

    def run(self, path: str | Path) -> list[PageArtifacts]:
        artifacts: list[PageArtifacts] = []
        for index, page in enumerate(self.load_pages(path)):
            if page.ndim == 3:
                page = cv2.cvtColor(page, cv2.COLOR_BGR2GRAY)
            deskewed, angle = self.deskew(page)
            cleaned = self.remove_bleed_through(deskewed)
            binary = self.close_folds(self.sauvola_threshold(cleaned))
            artifacts.append(
                PageArtifacts(page=index, original=deskewed, binarised=binary, skew_angle=angle)
            )
            logger.info("page %s preprocessed (skew corrected by %.2f deg)", index, angle)
        return artifacts


# =====================================================================
# 2. Layout segmentation
# =====================================================================
class DocumentLayoutSegmenter:
    """Finds the four regions that matter on a Record of Rights page.

    The parcel table is located by its ruling lines rather than by a learned
    detector: ruled tables are the one thing every state's format shares, and a
    morphological approach needs no training data and no GPU at demo time.
    """

    def __init__(self, min_table_area_ratio: float = 0.08):
        self.min_table_area_ratio = min_table_area_ratio

    def _line_mask(self, binary: np.ndarray, axis: str) -> np.ndarray:
        inverted = cv2.bitwise_not(binary)
        h, w = binary.shape
        if axis == "horizontal":
            size = max(20, w // 25)
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (size, 1))
        else:
            size = max(20, h // 25)
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, size))
        eroded = cv2.erode(inverted, kernel, iterations=1)
        return cv2.dilate(eroded, kernel, iterations=1)

    def detect_table(self, binary: np.ndarray) -> LayoutZone | None:
        """Locate the parcel table from its ruling lines.

        Taking the largest connected contour is tempting but fragile: on a real
        scan the horizontal and vertical rules rarely survive binarisation as
        one connected component. Instead every sufficiently long rule is found
        independently and the table is their union — which still works when the
        grid is broken by a fold or a torn edge.
        """
        h, w = binary.shape
        h_mask = self._line_mask(binary, "horizontal")
        v_mask = self._line_mask(binary, "vertical")

        rules: list[tuple[int, int, int, int]] = []
        horizontal_count = 0

        for mask, axis in ((h_mask, "h"), (v_mask, "v")):
            contours, _ = cv2.findContours(mask, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
            for contour in contours:
                x, y, cw, ch = cv2.boundingRect(contour)
                if axis == "h" and cw >= 0.25 * w:
                    rules.append((x, y, cw, ch))
                    horizontal_count += 1
                elif axis == "v" and ch >= 0.05 * h:
                    rules.append((x, y, cw, ch))

        # A table needs at least a top and a bottom rule to be a table.
        if horizontal_count < 2:
            return None

        x0 = min(r[0] for r in rules)
        y0 = min(r[1] for r in rules)
        x1 = max(r[0] + r[2] for r in rules)
        y1 = max(r[1] + r[3] for r in rules)

        if (x1 - x0) * (y1 - y0) / float(w * h) < self.min_table_area_ratio:
            return None

        # More detected rules means a more complete grid and a safer read.
        completeness = min(horizontal_count / 6.0, 1.0)
        confidence = float(np.clip(0.55 + 0.44 * completeness, 0.0, 0.99))
        return LayoutZone("table", (y0, x0, y1, x1), confidence)

    def detect_cells(self, binary: np.ndarray, table: LayoutZone) -> list[BBox]:
        """Return per-cell boxes in page coordinates, ordered top-to-bottom then
        left-to-right, which is the reading order of every register format."""
        crop = table.crop(binary)
        grid = cv2.bitwise_and(
            self._line_mask(crop, "horizontal"), self._line_mask(crop, "vertical")
        )
        intersections = cv2.dilate(grid, np.ones((5, 5), np.uint8), iterations=1)
        contours, _ = cv2.findContours(
            cv2.bitwise_not(
                cv2.bitwise_or(
                    self._line_mask(crop, "horizontal"), self._line_mask(crop, "vertical")
                )
            ),
            cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE,
        )
        del intersections

        oy, ox = table.bbox[0], table.bbox[1]
        cells: list[BBox] = []
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            if w < 25 or h < 15 or w * h > 0.6 * crop.size:
                continue
            cells.append((oy + y, ox + x, oy + y + h, ox + x + w))

        cells.sort(key=lambda b: (b[0] // 12, b[1]))
        return cells

    def detect_margin_remarks(self, binary: np.ndarray, table: LayoutZone | None) -> list[LayoutZone]:
        """Patwari remarks live in the right-hand margin or below the table."""
        h, w = binary.shape
        zones: list[LayoutZone] = []
        if table is None:
            return zones

        ty, tx, by, bx = table.bbox
        if bx < w - 60:
            zones.append(LayoutZone("margin_remarks", (ty, bx, by, w), 0.7))
        if by < h - 80:
            zones.append(LayoutZone("margin_remarks", (by, 0, h, w), 0.65))
        return zones

    def detect_seals(self, gray: np.ndarray, max_seals: int = 4) -> list[LayoutZone]:
        """Round revenue stamps, found with a Hough circle pass.

        The search is restricted to the lower half of the page and to a
        realistic stamp radius, because dense Devanagari headline text produces
        dozens of spurious circles anywhere else — an unconstrained detector
        returned 36 'seals' on a clean 7/12 extract.
        """
        h, w = gray.shape
        offset_y = int(h * 0.5)
        region = cv2.medianBlur(gray[offset_y:, :], 5)

        circles = cv2.HoughCircles(
            region, cv2.HOUGH_GRADIENT, dp=1.2, minDist=int(min(h, w) * 0.12),
            param1=110, param2=80,
            minRadius=int(min(h, w) * 0.025), maxRadius=int(min(h, w) * 0.09),
        )
        if circles is None:
            return []

        zones: list[LayoutZone] = []
        # Strongest circles come first out of HoughCircles; keep a few and drop
        # any that overlap one already accepted.
        for raw in np.around(circles[0]).astype(int):
            x, y, r = int(raw[0]), int(raw[1]) + offset_y, int(raw[2])
            bbox = (max(y - r, 0), max(x - r, 0), min(y + r, h), min(x + r, w))
            if any(_iou(bbox, z.bbox) > 0.2 for z in zones):
                continue
            zones.append(LayoutZone("seal", bbox, 0.75))
            if len(zones) >= max_seals:
                break

        return zones

    def segment(self, artifacts: PageArtifacts) -> list[LayoutZone]:
        binary, gray = artifacts.binarised, artifacts.original
        h, w = binary.shape
        zones: list[LayoutZone] = []

        table = self.detect_table(binary)
        if table:
            zones.append(table)
            if table.bbox[0] > 40:
                zones.append(LayoutZone("header", (0, 0, table.bbox[0], w), 0.8))
        else:
            zones.append(LayoutZone("header", (0, 0, h // 4, w), 0.4))

        zones += self.detect_margin_remarks(binary, table)
        zones += self.detect_seals(gray)

        for zone in zones:
            zone.page = artifacts.page
        artifacts.zones = zones
        return zones

    @staticmethod
    def layout_confidence(zones: list[LayoutZone]) -> float:
        """Layout is trusted in proportion to how many expected zones were found
        and how cleanly each was bounded."""
        kinds = {z.kind for z in zones}
        coverage = len(kinds & {"header", "table", "margin_remarks", "seal"}) / 4.0
        mean_conf = float(np.mean([z.confidence for z in zones])) if zones else 0.0
        return round(0.6 * mean_conf + 0.4 * coverage, 4)


# =====================================================================
# 3. OCR
# =====================================================================
class DualOcrEngine:
    """Printed cells go to PaddleOCR; handwritten margin notes go to TrOCR.

    Routing is decided per zone rather than per page because almost every real
    Khatauni is a printed table with handwriting in the margins, and running a
    handwriting model over printed text costs accuracy in both directions.
    """

    def __init__(self, languages: list[str] | None = None):
        self.languages = languages or settings.ocr_lang_list
        self._paddle: dict[str, Any] = {}
        self._trocr: tuple[Any, Any] | None = None

    # ---------- printed ----------
    def _paddle_for(self, lang: str):
        if lang not in self._paddle:
            from paddleocr import PaddleOCR

            # 'devanagari' covers Hindi and Marathi with one recogniser.
            paddle_lang = {"hi": "devanagari", "mr": "devanagari", "en": "en"}.get(lang, lang)
            self._paddle[lang] = PaddleOCR(
                use_angle_cls=True, lang=paddle_lang, show_log=False, use_gpu=False
            )
        return self._paddle[lang]

    def read_printed(self, image: np.ndarray, page: int = 0, offset: BBox | None = None):
        tokens: list[OcrToken] = []
        oy, ox = (offset[0], offset[1]) if offset else (0, 0)

        for lang in self.languages:
            try:
                engine = self._paddle_for(lang)
                result = engine.ocr(image, cls=True)
            except Exception as exc:  # noqa: BLE001 - a missing model must not kill the job
                logger.warning("PaddleOCR unavailable for %s (%s); falling back", lang, exc)
                tokens += self._tesseract_fallback(image, lang, page, (oy, ox))
                continue

            for line in result or []:
                for entry in line or []:
                    quad, (text, conf) = entry[0], entry[1]
                    xs = [int(p[0]) for p in quad]
                    ys = [int(p[1]) for p in quad]
                    tokens.append(
                        OcrToken(
                            text=text.strip(),
                            bbox=(min(ys) + oy, min(xs) + ox, max(ys) + oy, max(xs) + ox),
                            confidence=float(conf),
                            page=page,
                            source="printed",
                            language=lang,
                        )
                    )

        return self._deduplicate(tokens)

    def _tesseract_fallback(self, image, lang: str, page: int, origin: tuple[int, int]):
        """Tesseract keeps the demo alive when Paddle weights are absent."""
        try:
            import pytesseract
            from pytesseract import Output
        except ImportError:
            return []

        code = {"hi": "hin", "mr": "mar", "en": "eng"}.get(lang, "eng")
        try:
            data = pytesseract.image_to_data(image, lang=code, output_type=Output.DICT)
        except Exception as exc:  # noqa: BLE001
            logger.warning("tesseract fallback failed for %s: %s", code, exc)
            return []

        oy, ox = origin
        tokens = []
        for i, text in enumerate(data["text"]):
            text = text.strip()
            conf = float(data["conf"][i])
            if not text or conf < 0:
                continue
            x, y, w, h = data["left"][i], data["top"][i], data["width"][i], data["height"][i]
            tokens.append(
                OcrToken(text, (y + oy, x + ox, y + h + oy, x + w + ox), conf / 100.0, page,
                         "printed", lang)
            )
        return tokens

    # ---------- handwritten ----------
    def _load_trocr(self):
        if self._trocr is None:
            from transformers import TrOCRProcessor, VisionEncoderDecoderModel

            processor = TrOCRProcessor.from_pretrained(
                settings.TROCR_MODEL, local_files_only=settings.OFFLINE_MODE
            )
            model = VisionEncoderDecoderModel.from_pretrained(
                settings.TROCR_MODEL, local_files_only=settings.OFFLINE_MODE
            )
            model.eval()
            self._trocr = (processor, model)
        return self._trocr

    def read_handwritten(self, image: np.ndarray, page: int = 0, offset: BBox | None = None):
        oy, ox = (offset[0], offset[1]) if offset else (0, 0)
        h, w = image.shape[:2]
        try:
            import torch
            from PIL import Image

            processor, model = self._load_trocr()
            rgb = Image.fromarray(cv2.cvtColor(image, cv2.COLOR_GRAY2RGB))
            pixel_values = processor(images=rgb, return_tensors="pt").pixel_values
            with torch.no_grad():
                generated = model.generate(pixel_values, max_new_tokens=64, output_scores=True,
                                           return_dict_in_generate=True)
            text = processor.batch_decode(generated.sequences, skip_special_tokens=True)[0]
            score = float(torch.softmax(generated.scores[0], dim=-1).max()) if generated.scores else 0.6
            return [OcrToken(text.strip(), (oy, ox, oy + h, ox + w), score, page, "handwritten")]
        except Exception as exc:  # noqa: BLE001
            logger.warning("TrOCR unavailable (%s); routing remark to Indic HTR fallback", exc)
            return self._indic_htr_fallback(image, page, (oy, ox))

    def _indic_htr_fallback(self, image: np.ndarray, page: int, origin: tuple[int, int]):
        """Tesseract in single-block mode is a weak but honest stand-in: whatever
        it returns is tagged low-confidence so the field always reaches a human."""
        tokens = self._tesseract_fallback(image, "hi", page, origin)
        for token in tokens:
            token.source = "handwritten"
            token.confidence = min(token.confidence, 0.45)
        return tokens

    @staticmethod
    def _deduplicate(tokens: list[OcrToken]) -> list[OcrToken]:
        """Multiple language passes see the same glyphs. Keep the most confident
        reading for each overlapping box, then drop Latin-script "ghosts": the
        English pass reads a Devanagari word as gibberish such as "I HI 221/1"
        over a box the Devanagari pass read properly, and those ghosts would
        otherwise lead every table row."""
        kept: list[OcrToken] = []
        for token in sorted(tokens, key=lambda t: -t.confidence):
            if not any(_iou(token.bbox, k.bbox) > 0.6 for k in kept):
                kept.append(token)
        devanagari = [t for t in kept if _DEVANAGARI.search(t.text)]
        kept = [
            t for t in kept
            if _DEVANAGARI.search(t.text)
            or not _LATIN.search(t.text)
            or _covered_fraction(t.bbox, [d.bbox for d in devanagari]) < 0.5
        ]
        return sorted(kept, key=lambda t: (t.page, t.bbox[0] // 10, t.bbox[1]))

    def run(self, artifacts: PageArtifacts) -> list[OcrToken]:
        tokens: list[OcrToken] = []
        for zone in artifacts.zones:
            if zone.kind in {"table", "header"}:
                tokens += self.read_printed(zone.crop(artifacts.binarised), artifacts.page, zone.bbox)
            elif zone.kind == "margin_remarks":
                tokens += self.read_handwritten(zone.crop(artifacts.original), artifacts.page, zone.bbox)
        if not artifacts.zones:
            tokens += self.read_printed(artifacts.binarised, artifacts.page)
        artifacts.tokens = tokens
        return tokens

    @staticmethod
    def mean_confidence(tokens: list[OcrToken]) -> float:
        printed = [t.confidence for t in tokens if t.source == "printed"]
        return round(float(np.mean(printed)), 4) if printed else 0.0


_DEVANAGARI = re.compile(r"[\u0900-\u097F]")
_LATIN = re.compile(r"[A-Za-z]")


def _covered_fraction(box: BBox, others: list[BBox]) -> float:
    """Share of `box` that lies under any of `others` (overlaps not double-counted
    along the dominant horizontal axis, which is how words sit on a line)."""
    y1, x1, y2, x2 = box
    area = max((y2 - y1) * (x2 - x1), 1)
    spans = []
    for oy1, ox1, oy2, ox2 in others:
        iy1, iy2 = max(y1, oy1), min(y2, oy2)
        ix1, ix2 = max(x1, ox1), min(x2, ox2)
        if iy2 > iy1 and ix2 > ix1:
            spans.append((ix1, ix2, iy2 - iy1))
    covered, last_end = 0, x1
    for sx1, sx2, h in sorted(spans):
        start = max(sx1, last_end)
        if sx2 > start:
            covered += (sx2 - start) * h
            last_end = sx2
    return covered / area


def _iou(a: BBox, b: BBox) -> float:
    ay1, ax1, ay2, ax2 = a
    by1, bx1, by2, bx2 = b
    iy1, ix1 = max(ay1, by1), max(ax1, bx1)
    iy2, ix2 = min(ay2, by2), min(ax2, bx2)
    if iy2 <= iy1 or ix2 <= ix1:
        return 0.0
    inter = (iy2 - iy1) * (ix2 - ix1)
    union = (ay2 - ay1) * (ax2 - ax1) + (by2 - by1) * (bx2 - bx1) - inter
    return inter / float(union or 1)


# =====================================================================
# 4. Entity extraction
# =====================================================================
# The label word after खाता / खसरा is optional and matched loosely: OCR drops
# the halant or the anusvara in संख्या ("संखया", "सखया") often enough that an
# exact match misses most real pages. Anything starting with स counts.
_LABEL = r"(?:स\S*|क्रमांक|क्र\.?|नं\.?|no\.?)"
# OCR reads a leading zero as the letter O ("O.35"), which would silently turn
# 0.35 ha into 35 ha.
_OCR_ZERO = re.compile(r"(?<![A-Za-z])[Oo](?=[.,]?\d)")
KHATA_PATTERNS = [
    re.compile(r"(?:खाता|खता|खाते)\s*" + _LABEL + r"?\s*[:\-]?\s*([0-9]+[अ-ह0-9/\-]*)"),
    re.compile(r"khata\s*(?:no\.?|number)?\s*[:\-]?\s*([0-9][0-9/\-]*)", re.I),
    re.compile(r"(?:खाते|गट)\s*क्रमांक\s*[:\-]?\s*([0-9/\-]+)"),
]
KHASRA_PATTERNS = [
    re.compile(r"(?:खसरा|सर्वे|गट)\s*" + _LABEL + r"?\s*[:\-]?\s*([0-9][0-9/\-अ-ह]*)"),
    re.compile(r"(?:khasra|survey|gat)\s*(?:no\.?|number)?\s*[:\-]?\s*([0-9][0-9/\-]*)", re.I),
]
RELATION_PATTERN = re.compile(
    r"(?P<owner>.+?)\s*(?P<rel>पुत्र|पुत्री|पत्नी|आत्मज|वल्द|s/o|d/o|w/o|c/o)\s*(?P<relative>.+)",
    re.I,
)
RELATION_MAP = {
    "पुत्र": "S/o", "आत्मज": "S/o", "वल्द": "S/o", "s/o": "S/o",
    "पुत्री": "D/o", "d/o": "D/o",
    "पत्नी": "W/o", "w/o": "W/o",
    "c/o": "C/o",
}
OWNER_HEADING = re.compile(r"खातेदार|भूमिस्वामी|भूधारक|owner", re.I)
SHARE_PATTERN = re.compile(r"(\d+)\s*/\s*(\d+)|(\d+(?:\.\d+)?)\s*%")


class EntityExtractor:
    """Turns a bag of OCR tokens into the structured record the database expects.

    Row grouping is geometric: tokens whose vertical centres fall within one
    median line-height belong to the same table row. That survives column
    ordering differences between a Maharashtra 7/12 and a UP Khatauni, which a
    fixed column-index parser would not.
    """

    def __init__(self, state: str | None = None, district: str | None = None):
        self.state = state
        self.district = district

    # ---------- geometry ----------
    @staticmethod
    def group_rows(tokens: list[OcrToken], tolerance_ratio: float = 0.6) -> list[list[OcrToken]]:
        if not tokens:
            return []
        heights = [t.bbox[2] - t.bbox[0] for t in tokens]
        tolerance = max(8, int(np.median(heights) * tolerance_ratio))

        ordered = sorted(tokens, key=lambda t: (t.bbox[0] + t.bbox[2]) / 2)
        rows: list[list[OcrToken]] = [[ordered[0]]]
        for token in ordered[1:]:
            centre = (token.bbox[0] + token.bbox[2]) / 2
            last = rows[-1]
            last_centre = float(np.mean([(t.bbox[0] + t.bbox[2]) / 2 for t in last]))
            if abs(centre - last_centre) <= tolerance:
                last.append(token)
            else:
                rows.append([token])

        for row in rows:
            row.sort(key=lambda t: t.bbox[1])
        return rows

    @staticmethod
    def row_bbox(row: list[OcrToken]) -> dict:
        return {
            "page": row[0].page,
            "ymin": min(t.bbox[0] for t in row),
            "xmin": min(t.bbox[1] for t in row),
            "ymax": max(t.bbox[2] for t in row),
            "xmax": max(t.bbox[3] for t in row),
        }

    # ---------- fields ----------
    def extract_khata_number(self, tokens: list[OcrToken]) -> tuple[str | None, float, dict | None]:
        # OCR usually splits "खाता संख्या : 142" into separate words, so try each
        # token and then each whole line.
        candidates = [[t] for t in tokens] + self.group_rows(tokens)
        for group in candidates:
            text = normalise_digits(" ".join(t.text for t in group))
            for pattern in KHATA_PATTERNS:
                match = pattern.search(text)
                if match:
                    confidence = float(np.min([t.confidence for t in group]))
                    return match.group(1), confidence, self.row_bbox(group)
        return None, 0.0, None

    def extract_area(self, text: str) -> Decimal | None:
        """The area printed in one table cell or line.

        Two OCR passes often read the same cell twice ("0.35 hectare 0.35
        hectare"), so a second reading in a unit already seen is a duplicate,
        not an addition. Only different units printed back to back form a
        compound area, e.g. "2 बीघा 10 बिस्वा".
        """
        cleaned = _OCR_ZERO.sub("0", normalise_digits(text))
        total, units, last_end = Decimal("0"), set(), None
        for match in _AREA_RE.finditer(cleaned):
            value, unit_text = match.group("value"), match.group("unit")
            converted = None
            for candidate in (unit_text, unit_text.split()[0]):
                try:
                    converted = to_sqm(value, candidate, self.state, self.district)
                    break
                except (UnitResolutionError, ValueError, ArithmeticError):
                    continue
            if converted is None:
                continue
            sqm, unit = converted
            if units and (unit.key in units or match.start() - last_end > 3):
                break
            total += sqm
            units.add(unit.key)
            last_end = match.end()
        return total.quantize(Decimal("0.0001")) if units else None

    def extract_parcels(self, rows: list[list[OcrToken]]) -> list[dict]:
        parcels: list[dict] = []
        for row in rows:
            joined = normalise_digits(" ".join(t.text for t in row))
            khasra, labelled = None, False
            for pattern in KHASRA_PATTERNS:
                match = pattern.search(joined)
                if match:
                    khasra, labelled = match.group(1), True
                    break
            if khasra is None:
                bare = re.match(r"^\s*([0-9]{1,5}(?:/[0-9अ-ह]+)?)\b", joined)
                khasra = bare.group(1) if bare else None
            if khasra is None:
                continue

            # A row explicitly labelled "खसरा …" whose area is unreadable (a
            # smudged "बीघा") is still worth keeping: the reviewer sees it boxed
            # on the scan and only types the area; area 0 guarantees review.
            # An unlabelled line starting with a number needs a real area, or
            # numbered owner lines would pass for parcels.
            area = self.extract_area(joined)
            confidences = [t.confidence for t in row]
            if area is None:
                if not labelled:
                    continue
                area = Decimal("0")
                confidences = [0.0]
            parcels.append(
                {
                    "khasra_number": khasra,
                    "plot_area_sqm": area,
                    "declared_text": joined,
                    "land_classification": self._classification(joined),
                    "bbox_json": self.row_bbox(row),
                    "field_confidence": {
                        "khasra_number": round(float(np.min(confidences)), 4),
                        "plot_area_sqm": round(float(np.mean(confidences)), 4),
                    },
                }
            )
        return parcels

    @staticmethod
    def _classification(text: str) -> str | None:
        table = {
            "सिंचित": "Irrigated", "असिंचित": "Unirrigated", "बंजर": "Barren",
            "आबादी": "Habitation", "चरागाह": "Pasture", "बागायत": "Orchard",
            "जिरायत": "Dry crop", "irrigated": "Irrigated", "barren": "Barren",
        }
        for key, value in table.items():
            if key in text.lower() or key in text:
                return value
        return None

    def extract_owners(self, rows: list[list[OcrToken]]) -> list[dict]:
        owners: list[dict] = []
        heading = next(
            (i for i, row in enumerate(rows)
             if OWNER_HEADING.search(" ".join(t.text for t in row))),
            None,
        )
        for index, row in enumerate(rows):
            joined = " ".join(t.text for t in row).strip()
            match = RELATION_PATTERN.search(joined)
            if not match:
                # The relation word (पुत्र, पत्नी…) is the part OCR garbles most.
                # Under the owners heading, a line that carries a share is an
                # owner even without it; the name is its Devanagari words.
                if heading is None or index <= heading:
                    continue
                share, share_text = self._share(joined)
                name = " ".join(
                    t.text for t in row if _DEVANAGARI.search(t.text) and not SHARE_PATTERN.search(normalise_digits(t.text))
                ).strip(" ,।:-.")
                if share is None or not name:
                    continue
                owners.append(
                    {
                        "owner_name_vernacular": name,
                        "relation_type": None,
                        "relative_name": None,
                        "share_percentage": share,
                        "share_fraction": share_text,
                        "bbox_json": self.row_bbox(row),
                        "field_confidence": {
                            "owner_name_vernacular": min(0.45, float(np.min([t.confidence for t in row]))),
                            "share_percentage": round(float(np.mean([t.confidence for t in row])), 4),
                        },
                    }
                )
                continue

            relation = RELATION_MAP.get(match.group("rel").lower().strip())
            share, share_text = self._share(joined)
            confidences = [t.confidence for t in row]

            owners.append(
                {
                    "owner_name_vernacular": match.group("owner").strip(" ,।:-"),
                    "relation_type": relation,
                    "relative_name": re.split(r"\s{2,}|\d", match.group("relative"))[0].strip(" ,।:-"),
                    "share_percentage": share,
                    "share_fraction": share_text,
                    "bbox_json": self.row_bbox(row),
                    "field_confidence": {
                        "owner_name_vernacular": round(float(np.min(confidences)), 4),
                        "share_percentage": round(float(np.mean(confidences)), 4),
                    },
                }
            )

        # A register that names owners without printing shares means equal shares.
        unshared = [o for o in owners if o["share_percentage"] is None]
        if owners and len(unshared) == len(owners):
            equal = (Decimal("100") / Decimal(len(owners))).quantize(Decimal("0.01"))
            remainder = Decimal("100") - equal * len(owners)
            for index, owner in enumerate(owners):
                owner["share_percentage"] = equal + (remainder if index == 0 else Decimal("0"))
                owner["share_fraction"] = f"1/{len(owners)} (implied)"
        return owners

    @staticmethod
    def _share(text: str) -> tuple[Decimal | None, str | None]:
        match = SHARE_PATTERN.search(normalise_digits(text))
        if not match:
            return None, None
        if match.group(3):
            return Decimal(match.group(3)), f"{match.group(3)}%"
        numerator, denominator = Decimal(match.group(1)), Decimal(match.group(2))
        if denominator == 0:
            return None, None
        pct = (numerator / denominator * Decimal("100")).quantize(Decimal("0.01"))
        return pct, f"{match.group(1)}/{match.group(2)}"

    def extract(self, artifacts: list[PageArtifacts]) -> dict:
        all_tokens = [t for page in artifacts for t in page.tokens]
        table_tokens = [
            t for page in artifacts for t in page.tokens
            if any(z.kind == "table" and _contains(z.bbox, t.bbox) for z in page.zones)
        ] or all_tokens

        rows = self.group_rows(table_tokens)
        khata_number, khata_conf, khata_bbox = self.extract_khata_number(all_tokens)
        parcels = self.extract_parcels(rows)
        # Owner lists are usually printed below the parcel table, not inside it.
        owners = self.extract_owners(self.group_rows(all_tokens))

        total = sum((Decimal(str(p["plot_area_sqm"])) for p in parcels), Decimal("0"))
        declared_total = self._declared_total(all_tokens)
        if declared_total is None:
            declared_total = self._total_row(rows, parcels)

        return {
            "khata": {
                "khata_number": khata_number,
                "khata_number_confidence": khata_conf,
                "khata_bbox": khata_bbox,
                # The printed total is authoritative; the parcel sum is what the
                # validator checks it against. Never silently substitute one.
                "total_area_sqm": declared_total if declared_total is not None else total,
                "total_area_source": "printed" if declared_total is not None else "derived",
            },
            "parcels": parcels,
            "owners": owners,
            "tokens": [t.to_dict() for t in all_tokens],
            "skew_angles": [a.skew_angle for a in artifacts],
        }

    def _total_row(self, rows: list[list[OcrToken]], parcels: list[dict]) -> Decimal | None:
        """The register's total line when its "कुल योग" label is unreadable: the
        first table line after the last parcel that carries an area but no
        survey number."""
        if not parcels:
            return None
        last_parcel_y = max(p["bbox_json"]["ymax"] for p in parcels)
        for row in rows:
            if min(t.bbox[0] for t in row) <= last_parcel_y:
                continue
            joined = normalise_digits(" ".join(t.text for t in row))
            if any(pattern.search(joined) for pattern in KHASRA_PATTERNS):
                continue
            area = self.extract_area(joined)
            if area:
                return area
        return None

    def _declared_total(self, tokens: list[OcrToken]) -> Decimal | None:
        for token in tokens:
            text = normalise_digits(token.text)
            if re.search(r"(योग|कुल|एकूण|total)", text, re.I):
                area = self.extract_area(text)
                if area:
                    return area
        return None


def _contains(outer: BBox, inner: BBox) -> bool:
    return (
        inner[0] >= outer[0] - 5 and inner[1] >= outer[1] - 5
        and inner[2] <= outer[2] + 5 and inner[3] <= outer[3] + 5
    )


# =====================================================================
# Orchestration
# =====================================================================
class LandRecordPipeline:
    """Single entry point used by the Celery task."""

    def __init__(self, state: str | None = None, district: str | None = None):
        self.preprocessor = ImagePreprocessor()
        self.segmenter = DocumentLayoutSegmenter()
        self.ocr = DualOcrEngine()
        self.extractor = EntityExtractor(state=state, district=district)

    def process(self, path: str | Path, on_step=None) -> dict:
        def step(name: str, pct: int):
            if on_step:
                on_step(name, pct)

        step("PREPROCESSING", 15)
        artifacts = self.preprocessor.run(path)

        step("SEGMENTING", 35)
        for page in artifacts:
            self.segmenter.segment(page)

        step("EXTRACTING", 60)
        for page in artifacts:
            self.ocr.run(page)

        step("PARSING", 85)
        result = self.extractor.extract(artifacts)

        all_tokens = [t for page in artifacts for t in page.tokens]
        all_zones = [z for page in artifacts for z in page.zones]
        result["ocr_confidence"] = DualOcrEngine.mean_confidence(all_tokens)
        result["layout_confidence"] = DocumentLayoutSegmenter.layout_confidence(all_zones)
        result["page_count"] = len(artifacts)
        result["zones"] = [
            {"kind": z.kind, "page": z.page, "confidence": z.confidence,
             "bbox": {"ymin": z.bbox[0], "xmin": z.bbox[1], "ymax": z.bbox[2], "xmax": z.bbox[3]}}
            for z in all_zones
        ]
        # Each deskewed page, PNG-encoded: the images every bbox above is
        # measured against (bbox "page" indexes this list), and ones a browser
        # can display even when the upload was a PDF or TIFF. Callers must pop
        # this before serialising the result.
        result["preview_pngs"] = [encode_png(page.original) for page in artifacts]
        return result
