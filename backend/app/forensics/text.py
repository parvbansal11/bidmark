"""Text extraction that keeps every word's position.

Positions are what let a flag point at the exact spot in the source document.
Text-layer PDFs go through pdfplumber. Pages with no text layer, and image
uploads, go through Tesseract when it is installed. Coordinates are PDF
points with the origin at the top left of the page.
"""
from __future__ import annotations

import os
import re
import shutil
from dataclasses import dataclass, field


@dataclass
class Word:
    text: str
    page: int
    x0: float
    top: float
    x1: float
    bottom: float
    font: str | None = None
    size: float | None = None
    source: str = "text_layer"

    def bbox(self) -> list[float]:
        return [round(self.x0, 1), round(self.top, 1), round(self.x1, 1), round(self.bottom, 1)]


@dataclass
class Line:
    page: int
    words: list[Word]

    @property
    def text(self) -> str:
        return " ".join(w.text for w in self.words)


@dataclass
class Extracted:
    pages: int = 0
    page_sizes: list[tuple[float, float]] = field(default_factory=list)
    lines: list[Line] = field(default_factory=list)
    chars: list[dict] = field(default_factory=list)
    rects: list[dict] = field(default_factory=list)
    method: str = "none"
    ocr_pages: list[int] = field(default_factory=list)
    error: str | None = None
    occluded: list[dict] = field(default_factory=list)

    @property
    def text(self) -> str:
        return "\n".join(l.text for l in self.lines)

    @property
    def words(self) -> list[Word]:
        return [w for l in self.lines for w in l.words]


def _group_lines(words: list[Word], tol: float = 3.0) -> list[Line]:
    words = sorted(words, key=lambda w: (w.page, round(w.top), w.x0))
    lines: list[Line] = []
    for w in words:
        if lines and lines[-1].page == w.page and abs(lines[-1].words[0].top - w.top) <= tol:
            lines[-1].words.append(w)
        else:
            lines.append(Line(w.page, [w]))
    for l in lines:
        l.words.sort(key=lambda w: w.x0)
    return lines


def tesseract_available() -> bool:
    return shutil.which("tesseract") is not None


def _ocr_image(image, page: int, scale: float) -> list[Word]:
    import pytesseract

    data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT)
    out = []
    for i, txt in enumerate(data["text"]):
        txt = (txt or "").strip()
        if not txt or float(data["conf"][i]) < 30:
            continue
        x, y, w, h = (data[k][i] for k in ("left", "top", "width", "height"))
        out.append(Word(txt, page, x / scale, y / scale, (x + w) / scale, (y + h) / scale, source="ocr"))
    return out


def _occluded(chars: list[dict]) -> tuple[set[int], set[int]]:
    """(indexes of chars drawn over by a later, different char, indexes of the chars drawing over them).

    Content-stream order is paint order, so when a value is covered and
    retyped the new glyphs come later in page.chars than the old ones.
    """
    grid: dict[tuple[int, int], list[int]] = {}
    for i, c in enumerate(chars):
        grid.setdefault((int(c["x0"] // 20), int(c["top"] // 20)), []).append(i)
    hidden, over = set(), set()
    for i, a in enumerate(chars):
        if not a["text"].strip():
            continue
        gx, gy = int(a["x0"] // 20), int(a["top"] // 20)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for j in grid.get((gx + dx, gy + dy), []):
                    if j <= i:
                        continue
                    b = chars[j]
                    ix = min(a["x1"], b["x1"]) - max(a["x0"], b["x0"])
                    iy = min(a["bottom"], b["bottom"]) - max(a["top"], b["top"])
                    area = max((a["x1"] - a["x0"]) * (a["bottom"] - a["top"]), 0.01)
                    if ix > 0 and iy > 0 and ix * iy / area > 0.4 and (b["text"] != a["text"] or b.get("fontname") != a.get("fontname")):
                        hidden.add(i)
                        over.add(j)
    return hidden, over


def _is_white(color) -> bool:
    vals = color if isinstance(color, (list, tuple)) else [color]
    if not vals or not all(isinstance(v, (int, float)) for v in vals):
        return False
    return (len(vals) in (1, 3) and min(vals) >= 0.97) or (len(vals) == 4 and max(vals) <= 0.03)


def _under_cover_box(chars: list[dict], rects: list[dict], hidden: set[int], over: set[int]) -> set[int]:
    """A white box drawn to hide a value covers the whole old value, including
    glyphs the new text happens not to overlap. Anything in that box painted
    before the first glyph of the new layer belongs to the old layer."""
    extra = set()
    for r in rects:
        if not r.get("fill") or not _is_white(r.get("non_stroking_color")):
            continue
        inside = [i for i, c in enumerate(chars) if c["x0"] >= r["x0"] - 0.5 and c["x1"] <= r["x1"] + 0.5
                  and c["top"] >= r["top"] - 0.5 and c["bottom"] <= r["bottom"] + 0.5]
        newer = [i for i in inside if i in over]
        if newer and any(i in hidden for i in inside):
            first = min(newer)
            extra |= {i for i in inside if i < first}
    return extra


def extract_pdf(path: str, ocr: bool = True) -> Extracted:
    import pdfplumber

    ex = Extracted(method="text_layer")
    words: list[Word] = []
    with pdfplumber.open(path) as pdf:
        ex.pages = len(pdf.pages)
        for pno, page in enumerate(pdf.pages, start=1):
            ex.page_sizes.append((float(page.width), float(page.height)))
            raw_chars = page.chars
            hidden, over = _occluded(raw_chars)
            hidden |= _under_cover_box(raw_chars, page.rects, hidden, over)
            # By identity: a retyped value often repeats the old glyphs at the same spot.
            hidden_ids = {id(raw_chars[i]) for i in hidden}
            visible = page.filter(lambda o: id(o) not in hidden_ids) if hidden else page
            page_words = visible.extract_words(extra_attrs=["fontname", "size"], keep_blank_chars=False, use_text_flow=False)
            for w in page_words:
                words.append(Word(w["text"], pno, w["x0"], w["top"], w["x1"], w["bottom"], w.get("fontname"), w.get("size")))
            for i, c in enumerate(raw_chars):
                rec = {
                    "page": pno, "text": c["text"], "font": c.get("fontname"), "size": c.get("size"),
                    "x0": c["x0"], "top": c["top"], "x1": c["x1"], "bottom": c["bottom"],
                    "color": c.get("non_stroking_color"),
                }
                (ex.occluded if i in hidden else ex.chars).append(rec)
            for r in page.rects:
                ex.rects.append({
                    "page": pno, "x0": r["x0"], "top": r["top"], "x1": r["x1"], "bottom": r["bottom"],
                    "fill": r.get("fill"), "color": r.get("non_stroking_color"),
                })
            if ocr and not page_words and tesseract_available():
                scale = 200 / 72
                img = page.to_image(resolution=200).original
                words += _ocr_image(img, pno, scale)
                ex.ocr_pages.append(pno)
    if ex.ocr_pages:
        ex.method = "ocr" if len(ex.ocr_pages) == ex.pages else "mixed"
    ex.lines = _group_lines(words)
    return ex


def extract_image(path: str) -> Extracted:
    ex = Extracted(method="ocr", pages=1)
    if not tesseract_available():
        ex.method = "none"
        return ex
    from PIL import Image

    with Image.open(path) as img:
        img = img.convert("RGB")
        ex.page_sizes.append((float(img.width), float(img.height)))
        ex.lines = _group_lines(_ocr_image(img, 1, 1.0))
    ex.ocr_pages = [1]
    return ex


def extract_text_file(path: str) -> Extracted:
    ex = Extracted(method="plain_text", pages=1)
    with open(path, "r", errors="ignore") as fh:
        for i, raw in enumerate(fh.read().splitlines()):
            tokens = raw.split()
            if tokens:
                ex.lines.append(Line(1, [Word(t, 1, 0, i * 12.0, 0, i * 12.0 + 10) for t in tokens]))
    return ex


IMAGE_EXT = (".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".webp")


def extract(path: str) -> Extracted:
    ext = os.path.splitext(path)[1].lower()
    try:
        if ext == ".pdf":
            return extract_pdf(path)
        if ext in IMAGE_EXT:
            return extract_image(path)
        if ext == ".txt":
            return extract_text_file(path)
    except Exception as exc:  # corrupt or password-protected upload
        return Extracted(method="error", error=str(exc))
    return Extracted()


def find_in_lines(lines: list[Line], pattern: re.Pattern) -> list[tuple[re.Match, Line, list[Word]]]:
    """Runs a regex over each line and returns the words that the match covers."""
    hits = []
    for line in lines:
        text = line.text
        spans, pos = [], 0
        for w in line.words:
            spans.append((pos, pos + len(w.text), w))
            pos += len(w.text) + 1
        for m in pattern.finditer(text):
            covered = [w for s, e, w in spans if s < m.end() and e > m.start()]
            hits.append((m, line, covered))
    return hits


def union_bbox(words: list[Word]) -> list[float] | None:
    if not words:
        return None
    return [
        round(min(w.x0 for w in words), 1), round(min(w.top for w in words), 1),
        round(max(w.x1 for w in words), 1), round(max(w.bottom for w in words), 1),
    ]
