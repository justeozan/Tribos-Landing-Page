#!/usr/bin/env python3
"""
Tribos landing page - Cinematic 3D visuals.

Reads the master renders staged in `.context/src/cine/` and writes the
responsive variants served by the site into `assets/cine/`:

    <name>-<width>.avif / .webp           full frame, desktop and tablet
    <name>-portrait-<width>.avif / .webp  recadrage mobile, renard au centre
    + .jpg at the two smallest widths of each, as the <img> fallback

The masters are the 3D visuals of the "Cinematic 3D" preset
(.claude/skills/tribos-da-3d-cinematique): the canonical fox, a mountain at
golden hour, a bottom edge that already fades into the night blue of the page.
Whatever produced them (a 4K generation, or an x4 upscale of an earlier render),
the pipeline only crops, resizes and encodes.

Usage:
    python3 tools/build-cine.py            # build + print manifest
    python3 tools/build-cine.py --prune    # also delete files in assets/cine/
                                           # that are not part of the output

Requirements: Python 3.9+, Pillow >= 11.3 built with AVIF (the encoder is
checked up front: a partial set of formats would leave stale files behind).
Idempotent: same masters, same bytes.
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, features

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / ".context" / "src" / "cine"
OUT = ROOT / "assets" / "cine"


@dataclass(frozen=True)
class Visual:
    name: str
    master: str
    # Mobile crop in master pixels: (left, top, right, bottom). The fox, its tail
    # and its raised hand must all stay inside it.
    portrait_box: tuple[int, int, int, int]
    widths: tuple[int, ...] = (1280, 1920, 2560, 3200)
    portrait_widths: tuple[int, ...] = (640, 960, 1280, 1600)


VISUALS = (
    # Le renard salue au bord d'un sentier, forêt de pins, soleil couchant.
    Visual("sentier", "sentier-x4.png", (1400, 0, 4400, 3200)),
    # Le renard au sommet, poing levé, mer de nuages au coucher du soleil.
    Visual("sommet", "sommet-x4.png", (1300, 0, 4300, 3200)),
)

# Quality settings, tuned by eye on the hero at 100 %: painterly gradients band
# early, so the sky sets the floor rather than the fur.
AVIF = {"quality": 58, "speed": 4}
WEBP = {"quality": 80, "method": 6}
JPEG = {"quality": 82, "optimize": True, "progressive": True}


def encode(img: Image.Image, stem: Path, jpeg: bool) -> list[Path]:
    """Write one size as AVIF + WebP, plus a JPEG when asked; return the paths.

    JPEG is only the <img> fallback for browsers that read neither AVIF nor
    WebP, so it stops at the two smaller widths: shipping it at 3200 px would
    triple the folder for a browser that does not exist any more."""
    stem.parent.mkdir(parents=True, exist_ok=True)
    rgb = img.convert("RGB")
    paths = [stem.with_suffix(".avif"), stem.with_suffix(".webp")]
    rgb.save(paths[0], "AVIF", **AVIF)
    rgb.save(paths[1], "WEBP", **WEBP)
    if jpeg:
        paths.append(stem.with_suffix(".jpg"))
        rgb.save(paths[2], "JPEG", **JPEG)
    return paths


def resize(img: Image.Image, width: int) -> Image.Image:
    height = round(img.height * width / img.width)
    return img.resize((width, height), Image.LANCZOS, reducing_gap=3.0)


def build() -> list[Path]:
    written: list[Path] = []
    for v in VISUALS:
        src = SRC / v.master
        if not src.exists():
            sys.exit(f"Master introuvable : {src.relative_to(ROOT)} (voir README, visuels Cinematic 3D)")
        master = Image.open(src)
        master.load()
        for w in v.widths:
            written += encode(resize(master, w), OUT / f"{v.name}-{w}", w in v.widths[:2])
        portrait = master.crop(v.portrait_box)
        for w in v.portrait_widths:
            written += encode(resize(portrait, w), OUT / f"{v.name}-portrait-{w}", w in v.portrait_widths[:2])
    return written


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--prune", action="store_true", help="delete stale files in assets/cine/")
    args = parser.parse_args()

    if not features.check("avif"):
        sys.exit("Pillow sans encodeur AVIF : installer Pillow >= 11.3 (pip install -U Pillow).")

    written = build()
    if args.prune:
        keep = set(written)
        for stale in sorted(OUT.glob("*")):
            if stale.is_file() and stale not in keep:
                stale.unlink()
                print(f"supprimé : {stale.relative_to(ROOT)}")

    print(f"{'fichier':<44} {'taille':>9}  dimensions")
    for path in written:
        with Image.open(path) as im:
            size = f"{im.width}x{im.height}"
        print(f"{str(path.relative_to(ROOT)):<44} {path.stat().st_size / 1024:>7.0f} k  {size}")


if __name__ == "__main__":
    main()
