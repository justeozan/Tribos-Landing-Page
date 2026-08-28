#!/usr/bin/env python3
"""
Tribos landing page — production image asset pipeline.

Reads the staged design sources from `.context/src/` and writes the deployable
raster assets into `assets/brand/`, `assets/app/` and `assets/illus/`.

The script is idempotent: running it twice produces byte-identical output, and
it never touches anything outside the three managed output directories.

Usage:
    python3 tools/build-assets.py            # build + print manifest
    python3 tools/build-assets.py --prune    # also delete stale png/webp in the
                                             # managed dirs that are not part of
                                             # the declared output tree

Requirements: Python 3.9+, Pillow >= 10. No ImageMagick, no network.
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence

from PIL import Image

# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / ".context" / "src"
OUT = ROOT / "assets"

BRAND_DIR = OUT / "brand"
APP_DIR = OUT / "app"
ILLUS_DIR = OUT / "illus"
MANAGED_DIRS = (BRAND_DIR, APP_DIR, ILLUS_DIR)

# A row/column is part of a letterbox bar when fewer than 50% of its pixels are
# non-black (see row_means: pixels are clamped to 0/255 first, so the score is
# share-of-non-black x 255). Measured on the live captures: the rows carrying
# Android's white gesture pill score 66, every real UI row scores 255. 128 sits
# cleanly between the two.
#
# This assumes light-background sources, which is what every Tribos capture and
# mock is. A source with a genuinely dark full-bleed row would need a contiguity
# check instead of a flat threshold.
BAR_LUMA_THRESHOLD = 128.0

# Extra top crop applied AFTER the letterbox trim, per app source. The two live
# Android captures carry Flutter's red DEBUG banner in the top-right corner; it
# occupies the first 14 rows of the trimmed frame, inside otherwise blank status
# bar padding, so shaving 16px removes it without touching any UI.
APP_TOP_TRIM = {"home": 16, "groupe": 16}

WEBP_QUALITY = 82          # lossy quality for every WebP we emit
WEBP_ALPHA_QUALITY = 100   # keep the alpha channel lossless (clean cut-out edges)
WEBP_METHOD = 6            # slowest / best compression
PNG_COMPRESS_LEVEL = 9

APP_WIDTH = 900
APP_SM_WIDTH = 450
ILLUS_WIDTH = 720
MARK_SIZE = 512

# Brand palette
ORANGE = (0xF3, 0x73, 0x0A)
INK = (0x17, 0x14, 0x12)
WHITE = (0xFF, 0xFF, 0xFF)

RESAMPLE = Image.Resampling.LANCZOS

# name -> source path relative to SRC
APP_SOURCES: Sequence[tuple[str, str]] = (
    ("home", "shot-home.png"),
    ("groupe", "shot-groupe.png"),
    ("seance", "mocks/preview workout.png"),
    ("programmes", "mocks/Selection des programmes.png"),
)

ILLUS_SOURCES: Sequence[tuple[str, str]] = (
    ("trio-warmup", "onboarding/onb1.png"),
    ("fox-weights", "onboarding/onb2.png"),
    ("trio-calm", "onboarding/onb3.png"),
)


# --------------------------------------------------------------------------- #
# Manifest
# --------------------------------------------------------------------------- #

@dataclass
class Entry:
    path: Path
    width: int
    height: int
    size: int
    note: str

    @property
    def rel(self) -> str:
        return self.path.relative_to(ROOT).as_posix()


MANIFEST: list[Entry] = []


def record(path: Path, note: str = "") -> None:
    with Image.open(path) as im:
        w, h = im.size
    MANIFEST.append(Entry(path, w, h, path.stat().st_size, note))


# --------------------------------------------------------------------------- #
# Image helpers
# --------------------------------------------------------------------------- #

def load(rel: str) -> Image.Image:
    """Open a source image as RGBA with every metadata block dropped."""
    path = SRC / rel
    if not path.exists():
        raise FileNotFoundError(f"missing source: {path}")
    with Image.open(path) as im:
        im.load()
        out = im.convert("RGBA")
    out.info = {}  # drop EXIF / dpi / gamma / sRGB / ICC before any processing
    return out


def strip_meta(im: Image.Image) -> Image.Image:
    """Pillow copies `.info` through crop()/resize(); clear it before saving."""
    im.info = {}
    return im


def row_means(im: Image.Image) -> list[int]:
    """
    Per-row "is this a letterbox bar" score.

    A plain mean is not enough: Android's bottom bar is black but carries a
    bright white gesture pill, which lifts the row mean above the threshold and
    leaves the bar in the crop. So each pixel is first clamped to black/white at
    a dark cutoff, and the row score is the mean of that mask. A row therefore
    only survives the scan when a real share of it is non-black.
    """
    grey = im.convert("L").point(lambda v: 0 if v < 26 else 255)
    return list(grey.resize((1, grey.height), Image.Resampling.BOX).getdata())


def col_means(im: Image.Image) -> list[int]:
    """Per-column bar score. Same clamp-then-average logic as row_means."""
    grey = im.convert("L").point(lambda v: 0 if v < 26 else 255)
    return list(grey.resize((grey.width, 1), Image.Resampling.BOX).getdata())


def _scan(values: Sequence[float], threshold: float) -> tuple[int, int]:
    """First and last index whose value is >= threshold (inclusive)."""
    n = len(values)
    first = 0
    while first < n and values[first] < threshold:
        first += 1
    if first == n:  # fully black -> refuse to crop
        return 0, n - 1
    last = n - 1
    while last > first and values[last] < threshold:
        last -= 1
    return first, last


def trim_black_bars(im: Image.Image, threshold: float = BAR_LUMA_THRESHOLD):
    """
    Crop the near-black letterbox bars off all four edges.

    Scans inwards from each edge and stops at the first row/column whose mean
    luminance reaches `threshold`. Returns (cropped image, crop box, trimmed px).
    """
    flat = im.convert("RGB")
    top, bottom = _scan(row_means(flat), threshold)
    left, right = _scan(col_means(flat), threshold)
    box = (left, top, right + 1, bottom + 1)
    trimmed = (top, im.height - 1 - bottom, left, im.width - 1 - right)
    if box == (0, 0, im.width, im.height):
        return im, box, trimmed
    return strip_meta(im.crop(box)), box, trimmed


def fit_width(im: Image.Image, target: int) -> tuple[Image.Image, str]:
    """
    Resize to `target` width preserving aspect ratio.
    Never upscales: a narrower source is kept at its native width.
    """
    if im.width <= target:
        note = f"source only {im.width}px wide, kept 1.0x (no upscale)"
        return im, note
    height = max(1, round(im.height * target / im.width))
    return strip_meta(im.resize((target, height), RESAMPLE)), ""


def pad_to_square(im: Image.Image, fill=(0, 0, 0, 0)) -> Image.Image:
    """Centre the image on a transparent (or filled) square canvas."""
    side = max(im.size)
    canvas = Image.new("RGBA", (side, side), fill)
    canvas.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
    return canvas


def extend_to_square(im: Image.Image) -> Image.Image:
    """
    Make an opaque image square by replicating its own edge pixels.

    Used for the app icon, whose orange gradient runs to the border: stretching
    the outermost row/column outwards keeps the gradient continuous and avoids
    both distortion and a visible seam.
    """
    side = max(im.size)
    if im.size == (side, side):
        return im
    canvas = Image.new("RGBA", (side, side))
    ox, oy = (side - im.width) // 2, (side - im.height) // 2
    if ox:
        canvas.paste(im.crop((0, 0, 1, im.height)).resize((ox, im.height)), (0, oy))
        right = side - im.width - ox
        canvas.paste(
            im.crop((im.width - 1, 0, im.width, im.height)).resize((right, im.height)),
            (ox + im.width, oy),
        )
    if oy:
        canvas.paste(im.crop((0, 0, im.width, 1)).resize((im.width, oy)), (ox, 0))
        bottom = side - im.height - oy
        canvas.paste(
            im.crop((0, im.height - 1, im.width, im.height)).resize((im.width, bottom)),
            (ox, oy + im.height),
        )
    canvas.paste(im, (ox, oy))
    return strip_meta(canvas)


def trim_alpha(im: Image.Image) -> Image.Image:
    """Crop to the bounding box of the non-transparent pixels."""
    box = im.getchannel("A").getbbox()
    return strip_meta(im.crop(box)) if box else im


def recolour(im: Image.Image, rgb: tuple[int, int, int]) -> Image.Image:
    """Keep the alpha channel, replace RGB with a flat target colour."""
    out = Image.new("RGBA", im.size, rgb + (0,))
    out.putalpha(im.getchannel("A"))
    return out


def flatten(im: Image.Image, bg=(255, 255, 255)) -> Image.Image:
    """Composite onto an opaque background and return RGB."""
    if im.mode != "RGBA":
        return im.convert("RGB")
    canvas = Image.new("RGB", im.size, bg)
    canvas.paste(im, mask=im.getchannel("A"))
    return strip_meta(canvas)


# --------------------------------------------------------------------------- #
# Writers
# --------------------------------------------------------------------------- #

def write_png(im: Image.Image, path: Path, note: str = "") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    strip_meta(im).save(
        path, "PNG", optimize=True, compress_level=PNG_COMPRESS_LEVEL
    )
    record(path, note)


def write_webp(im: Image.Image, path: Path, note: str = "") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    strip_meta(im).save(
        path,
        "WEBP",
        quality=WEBP_QUALITY,
        alpha_quality=WEBP_ALPHA_QUALITY,
        method=WEBP_METHOD,
    )
    record(path, note)


def write_pair(im: Image.Image, directory: Path, stem: str, note: str = "") -> None:
    """Emit both `<stem>.webp` and `<stem>.png`."""
    write_webp(im, directory / f"{stem}.webp", note)
    write_png(im, directory / f"{stem}.png", note)


# --------------------------------------------------------------------------- #
# Build steps
# --------------------------------------------------------------------------- #

def build_brand() -> None:
    # --- app icon family ---------------------------------------------------
    icon_src = load("brand/app_icon.png")
    square = extend_to_square(icon_src)          # 530x560 -> 560x560, own orange
    base = flatten(square, ORANGE)               # opaque, no alpha channel

    note = f"from app_icon.png {icon_src.width}x{icon_src.height} -> square {square.width}"
    for size, name in (
        (512, "tribos-icon.png"),
        # nav + footer lockup, rendered at 30 CSS px (60 px at 2x)
        (64, "tribos-icon-64.png"),
        (192, "tribos-icon-192.png"),
        (180, "apple-touch-icon.png"),
        (32, "favicon-32.png"),
        (16, "favicon-16.png"),
    ):
        if size > base.width:
            raise ValueError(f"{name}: would upscale {base.width} -> {size}")
        write_png(base.resize((size, size), RESAMPLE), BRAND_DIR / name, note)

    # --- mark family -------------------------------------------------------
    mark_src = load("brand/tribos_mark.png")
    trimmed = trim_alpha(mark_src)
    mark = pad_to_square(trimmed)
    if MARK_SIZE > mark.width:
        mark_out = mark
        mark_note = f"content bbox {trimmed.width}x{trimmed.height}, kept 1.0x (no upscale)"
    else:
        mark_out = strip_meta(mark.resize((MARK_SIZE, MARK_SIZE), RESAMPLE))
        mark_note = f"content bbox {trimmed.width}x{trimmed.height} padded to {mark.width} square"

    write_png(mark_out, BRAND_DIR / "tribos-mark-white.png", mark_note)
    write_png(recolour(mark_out, INK), BRAND_DIR / "tribos-mark-ink.png",
              f"{mark_note}; RGB flattened to #171412")
    write_png(recolour(mark_out, ORANGE), BRAND_DIR / "tribos-mark-orange.png",
              f"{mark_note}; RGB flattened to #F3730A")


def build_app() -> None:
    for name, rel in APP_SOURCES:
        src = load(rel)
        cropped, box, (t, b, l, r) = trim_black_bars(src)
        bars = (f"cropped bars T{t}/B{b}/L{l}/R{r} -> {cropped.width}x{cropped.height}"
                if any((t, b, l, r)) else "no letterbox bars detected")

        extra = APP_TOP_TRIM.get(name, 0)
        if extra:
            cropped = strip_meta(cropped.crop((0, extra, cropped.width, cropped.height)))
            bars += f"; +{extra}px top (Flutter debug banner) -> {cropped.width}x{cropped.height}"

        opaque = flatten(cropped, WHITE)
        sized, warn = fit_width(opaque, APP_WIDTH)
        write_pair(sized, APP_DIR, name, "; ".join(x for x in (bars, warn) if x))

        # Only emit the small variant when it is genuinely smaller. A source
        # narrower than APP_SM_WIDTH would produce a byte-identical twin, which
        # is dead weight in the deploy and a pointless extra srcset candidate.
        if opaque.width > APP_SM_WIDTH:
            small, warn_sm = fit_width(opaque, APP_SM_WIDTH)
            write_pair(small, APP_DIR, f"{name}-sm",
                       "; ".join(x for x in (bars, warn_sm) if x))



def build_illus() -> None:
    for name, rel in ILLUS_SOURCES:
        src = load(rel)
        trimmed = trim_alpha(src)
        sized, warn = fit_width(trimmed, ILLUS_WIDTH)
        note = "; ".join(
            x for x in (f"trimmed {src.width}x{src.height} -> "
                        f"{trimmed.width}x{trimmed.height}", warn) if x
        )
        # Alpha stays lossless (WEBP_ALPHA_QUALITY = 100) so the cut-out edge
        # never bleeds; only the RGB shading goes through q82.
        write_pair(sized, ILLUS_DIR, name, note)


# --------------------------------------------------------------------------- #
# Verification / reporting
# --------------------------------------------------------------------------- #

def expected_files() -> list[Path]:
    files = [
        BRAND_DIR / n for n in (
            "tribos-icon.png", "tribos-icon-192.png", "tribos-icon-64.png",
            "favicon-32.png",
            "favicon-16.png", "apple-touch-icon.png", "tribos-mark-white.png",
            "tribos-mark-ink.png", "tribos-mark-orange.png",
            # written by tools/build-og.mjs, not by this script
            "og-card.png",
        )
    ]
    for name, rel in APP_SOURCES:
        files += [APP_DIR / f"{name}.webp", APP_DIR / f"{name}.png"]
        with Image.open(SRC / rel) as probe:
            has_small = probe.width > APP_SM_WIDTH   # matches build_app()
        if has_small:
            files += [APP_DIR / f"{name}-sm.webp", APP_DIR / f"{name}-sm.png"]
    for name, _ in ILLUS_SOURCES:
        files += [ILLUS_DIR / f"{name}.webp", ILLUS_DIR / f"{name}.png"]
    return files


def stale_files(expected: Iterable[Path]) -> list[Path]:
    keep = {p.resolve() for p in expected}
    found = []
    for d in MANAGED_DIRS:
        if not d.is_dir():
            continue
        for p in sorted(d.iterdir()):
            if p.is_file() and p.suffix.lower() in {".png", ".webp", ".jpg", ".jpeg"}:
                if p.resolve() not in keep:
                    found.append(p)
    return found


def print_manifest() -> None:
    def human(n: int) -> str:
        return f"{n/1024:.1f} KB" if n < 1024 * 1024 else f"{n/1048576:.2f} MB"

    w_path = max(len(e.rel) for e in MANIFEST)
    w_dim = max(len(f"{e.width}x{e.height}") for e in MANIFEST)
    header = f"{'FILE'.ljust(w_path)}  {'DIMENSIONS'.ljust(w_dim)}  {'BYTES':>9}  {'SIZE':>9}  NOTE"
    print(header)
    print("-" * len(header))
    total = 0
    for e in sorted(MANIFEST, key=lambda x: x.rel):
        total += e.size
        dims = f"{e.width}x{e.height}"
        print(f"{e.rel.ljust(w_path)}  {dims.ljust(w_dim)}  {e.size:>9}  {human(e.size):>9}  {e.note}")
    print("-" * len(header))
    print(f"{len(MANIFEST)} files, {total} bytes ({human(total)})")


def main(argv: Sequence[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--prune", action="store_true",
                    help="delete raster files in assets/{brand,app,illus} that are "
                         "not part of the declared output tree")
    args = ap.parse_args(argv)

    if not SRC.is_dir():
        print(f"ERROR: source directory not found: {SRC}", file=sys.stderr)
        return 2

    for d in MANAGED_DIRS:
        d.mkdir(parents=True, exist_ok=True)

    build_brand()
    build_app()
    build_illus()

    expected = expected_files()
    missing = [p for p in expected if not p.exists()]

    extras = stale_files(expected)
    if extras:
        for p in extras:
            if args.prune:
                p.unlink()
                print(f"pruned stale file: {p.relative_to(ROOT).as_posix()}")
            else:
                print(f"WARNING: unexpected file in managed dir (use --prune): "
                      f"{p.relative_to(ROOT).as_posix()}")

    print()
    print_manifest()
    print()

    if missing:
        for p in missing:
            print(f"ERROR: promised file not produced: {p.relative_to(ROOT).as_posix()}",
                  file=sys.stderr)
        return 1
    print(f"OK: all {len(expected)} promised files present.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
