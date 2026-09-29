"""Forensics on image uploads (scans and phone photos of certificates)."""
from __future__ import annotations

import io

EDITING_SOFTWARE = ["photoshop", "gimp", "snapseed", "picsart", "lightroom", "canva", "pixlr", "paint.net", "affinity", "facetune", "remini"]


def _signal(code, severity, title, detail, *, confidence="medium", bbox=None, evidence=None):
    return {"code": code, "severity": severity, "title": title, "detail": detail, "confidence": confidence,
            "page": 1, "bbox": bbox, "field": None, "evidence": evidence or {}}


def error_level_hotspot(img, quality: int = 90, block: int = 16) -> dict | None:
    """Re-saves the image at a known JPEG quality and looks for one region whose
    compression error stands far above the rest. A region pasted in from another
    source was compressed a different number of times, so it re-compresses differently."""
    import numpy as np
    from PIL import Image, ImageChops

    rgb = img.convert("RGB")
    buf = io.BytesIO()
    rgb.save(buf, "JPEG", quality=quality)
    resaved = Image.open(io.BytesIO(buf.getvalue()))
    diff = np.asarray(ImageChops.difference(rgb, resaved).convert("L"), dtype=np.float32)
    h, w = diff.shape
    if h < block * 4 or w < block * 4:
        return None
    hb, wb = h // block, w // block
    blocks = diff[: hb * block, : wb * block].reshape(hb, block, wb, block).mean(axis=(1, 3))
    med = float(np.median(blocks))
    mad = float(np.median(np.abs(blocks - med))) or 0.5
    z = (blocks - med) / (1.4826 * mad)
    hot = z > 12
    if hot.sum() < 2 or hot.mean() > 0.2:
        return None
    ys, xs = np.nonzero(hot)
    return {
        "bbox": [int(xs.min() * block), int(ys.min() * block), int((xs.max() + 1) * block), int((ys.max() + 1) * block)],
        "blocks": int(hot.sum()),
        "max_z": round(float(z.max()), 1),
        "median_error": round(med, 2),
    }


def analyse_image(raw: bytes) -> dict:
    from PIL import ExifTags, Image

    signals = []
    try:
        img = Image.open(io.BytesIO(raw))
        img.load()
    except Exception as exc:
        return {"kind": "image", "error": str(exc), "signals": []}

    exif = {}
    try:
        for k, v in (img.getexif() or {}).items():
            exif[ExifTags.TAGS.get(k, str(k))] = str(v)[:120]
    except Exception:
        pass

    software = exif.get("Software", "")
    if any(s in software.lower() for s in EDITING_SOFTWARE):
        signals.append(_signal("IMAGE_EDITOR", "MEDIUM", "Saved by photo-editing software",
                               f"EXIF Software tag reads '{software}'.", confidence="high", evidence={"software": software}))

    if img.format == "JPEG":
        spot = error_level_hotspot(img)
        if spot:
            signals.append(_signal("COMPRESSION_HOTSPOT", "MEDIUM", "One region compresses differently",
                                   f"{spot['blocks']} blocks re-compress far above the rest of the image "
                                   f"(peak {spot['max_z']} robust SD). Pasted-in regions behave like this.",
                                   confidence="low", bbox=spot["bbox"], evidence=spot))

    return {"kind": "image", "format": img.format, "size": list(img.size), "exif": exif, "signals": signals}
