#!/usr/bin/env python3
"""
Tribos landing page - the app's fonts, for the app widgets only.

The site is set in Geist. The app is set in Montserrat (titles, figures) and
Roboto (body), through google_fonts. The widgets rebuilt on the site
(.appui, see the design-system skill) must look like the app, so they use the
app's fonts and nothing else does.

Reads the variable fonts staged in `.context/src/fonts/` (google/fonts, OFL):

    Montserrat[wght].ttf      -> renamed Montserrat.ttf when staged
    Roboto[wdth,wght].ttf     -> renamed Roboto.ttf when staged
    OFL.txt of each family    -> OFL-Montserrat.txt, OFL-Roboto.txt

and writes into `assets/fonts/`:

    montserrat-latin.woff2    wght 500-900 (the weights the app widgets use)
    roboto-latin.woff2        wght 400-900, width pinned at 100
    OFL-Montserrat.txt, OFL-Roboto.txt

Subset: the `latin` range of the Google Fonts CSS API (every French accent,
typographic quotes, the bullet of "Aujourd'hui • 08:31") plus U+2248 (≈).
Neither family draws U+202F, the narrow no-break space the site puts before
! ? : ; - the browser takes it from Geist, next in the widgets' font stack.

Usage:
    env -u PYTHONPATH /usr/bin/python3 tools/build-fonts.py
    (or: uv run --with fonttools --with brotli python3 tools/build-fonts.py)

Requirements: fontTools >= 4.40 and brotli. Network only to stage the sources:
    https://github.com/google/fonts/raw/main/ofl/montserrat/Montserrat%5Bwght%5D.ttf
    https://github.com/google/fonts/raw/main/ofl/roboto/Roboto%5Bwdth,wght%5D.ttf
"""

from __future__ import annotations

import io
import shutil
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / ".context" / "src" / "fonts"
OUT = ROOT / "assets" / "fonts"

LATIN = (
    "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,"
    "U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+2248,U+FEFF,U+FFFD"
)

# family file, output stem, axis limits
FONTS = (
    ("Montserrat.ttf", "montserrat-latin", {"wght": (500, 900)}),
    ("Roboto.ttf", "roboto-latin", {"wdth": 100, "wght": (400, 900)}),
)


def build(src: Path, stem: str, limits: dict) -> Path:
    font = instancer.instantiateVariableFont(TTFont(src, lazy=False), limits)
    # Round-trip through bytes: subsetting the instancer's in-memory result
    # trips over its partly rebuilt gvar (KeyError on a glyph name).
    buf = io.BytesIO()
    font.save(buf)
    buf.seek(0)
    font = TTFont(buf, lazy=False)
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["kern", "liga", "calt", "lnum", "pnum", "tnum", "case"]
    options.name_IDs = ["*"]
    options.notdef_outline = True
    options.drop_tables += ["DSIG"]
    sub = subset.Subsetter(options)
    sub.populate(unicodes=subset.parse_unicodes(LATIN))
    sub.subset(font)
    out = OUT / f"{stem}.woff2"
    font.flavor = "woff2"
    font.save(out)
    return out


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    for file, stem, limits in FONTS:
        out = build(SRC / file, stem, limits)
        print(f"{out.relative_to(ROOT)}  {out.stat().st_size / 1024:.1f} KB")
    for lic in ("OFL-Montserrat.txt", "OFL-Roboto.txt"):
        shutil.copyfile(SRC / lic, OUT / lic)
        print(f"assets/fonts/{lic}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
