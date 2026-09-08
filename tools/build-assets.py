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
BADGE_DIR = OUT / "badge"
PHOTO_DIR = OUT / "photo"
MANAGED_DIRS = (BRAND_DIR, APP_DIR, ILLUS_DIR, BADGE_DIR, PHOTO_DIR)

# App screenshots come from the Google Play listing boards, not from the Figma
# mocks. Three reasons, each disqualifying on its own:
#
#   1. The mocks are stale. They put a points leaderboard on the group screen;
#      the shipped app puts a shared weekly objective there, and
#      weekly_goal_card.dart says so in as many words - members are "JAMAIS
#      retries par contribution : c'est un objectif commun, pas un classement".
#      They also show a "Defi ! 5 000" steps card, when a defi is really a
#      challenge of 2 to 5 sessions aimed at one group member. And the programme
#      picker mock lists disciplines (cyclisme, natation) that are not in the
#      shipped catalogue.
#   2. The mocks are half in English ("Good Morning", "days streak").
#   3. The Play boards were anonymised by the app repo's own
#      scripts/anonymize_shots.py: real faces and usernames became CC0 portraits
#      and the names Alex / Lena / Les Loups. They are the only captures cleared
#      for publication.
#
# Each board is 1080x1920: a headline on a brand background, with the app screen
# bleeding off the bottom edge. Only the screen is wanted, so the card is cropped
# out and the site re-frames it.
STORE_DIR = "store"
STORE_CARD_X = (140, 940)      # card edges, identical on every board
STORE_SOURCES: Sequence[tuple[str, str, int, int]] = (
    # name, file, y of the card's top edge, height of the crop.
    # Full height, down to the board's bottom edge. An earlier version trimmed
    # these so each screen "ended on content", which made them 0.67-0.89 wide-to
    # -tall; a handset face is 0.46, so the device frame around them came out
    # squat enough to read as a tablet. Taller is the fix: the site clips the
    # device instead, so the screen reads as running off the bottom.
    ("groupe", "screenshot-02-group.png", 564, 1356),
    ("seance", "screenshot-04-session.png", 564, 1356),
)

# Live captures from the running emulator (adb screencap, 1080x2400), staged in
# .context/src/emu/. The programme-detail capture was anonymised before staging:
# its two member avatars came from a real account and were replaced in place
# with the same CC0 portraits the Play listing uses. The "programme" name moves
# here from the Play boards: this is the same screen type, captured from the
# running app with a real photo hero, richer than the board version.
#
# Every capture is cropped 132px from the top: that band carries the emulator
# status bar and Flutter's red DEBUG ribbon.
EMU_DIR = "emu"
EMU_TOP = 132
EMU_SOURCES: Sequence[tuple[str, str, int]] = (
    # name, file, bottom edge in the raw 2400px space
    ("player", "raw-player.png", 2400),
    ("repos", "raw-repos.png", 2400),
    ("picker", "raw-programme.png", 2400),
    ("programme", "raw-programme-detail.png", 2400),
)

# CC0 photography (StockSnap, via the app repo's Play sources), processed into
# the site's own art direction: one orange duotone and one monochrome, both
# derived from the same runners photo so the page reads as a single shoot.
PHOTO_SRC = "store-photos/group-banner.jpg"


# The home screen ships as the team's own Figma mockup (the same file the Play
# listing uses as its cover), not as a live capture: the test account is nearly
# empty, and this one shows the screen with a full week, a real leaderboard and
# the bonus active.
#
# It is exported in English, so the strings below are re-set in place with the
# app's brand font. Only text is touched; the layout and artwork are the team's.
#
# NOT translated, and worth knowing: the "Defi ! 5 000" card describes a step
# goal. In the shipped app a defi is a challenge of 2 to 5 SESSIONS aimed at one
# group member, and the card is not permanent. Rewriting it would also invalidate
# the "88 %" and the bar chart under it, so the card is left exactly as the team
# published it rather than half-corrected here.
MOCKUP_SRC = "mockup/home-mockup.png"
MOCKUP_FONTS = Path("/tmp/fonts")

# (box, new text, font, weight-file, colour) - boxes are tight ink bounds
# measured on the 604x1302 export.
MOCKUP_TEXT = (
    ((32, 53, 193, 72), "Bonjour,", "Montserrat-Medium", (47, 58, 66)),
    ((77, 157, 374, 178), "14 jours d\u2019affil\u00e9e !", "Montserrat-Bold", (47, 58, 66)),
    ((78, 191, 178, 206), "Bien jou\u00e9 !", "Montserrat-Regular", (114, 114, 114)),
)

# Day initials: English M T W T F S S -> French L M M J V S D. Thursday is the
# "today" pill and keeps the app's blue.
MOCKUP_DAYS = (
    ((84, 220, 95, 230), "L", (47, 58, 66)),
    ((125, 220, 133, 230), "M", (47, 58, 66)),
    ((163, 220, 175, 230), "M", (47, 58, 66)),
    ((205, 220, 212, 230), "J", (52, 118, 246)),
    ((243, 220, 249, 230), "V", (47, 58, 66)),
    ((280, 220, 287, 230), "S", (47, 58, 66)),
    ((318, 220, 325, 230), "D", (47, 58, 66)),
)
MOCKUP_DAY_FONT = "Montserrat-SemiBold"

WEBP_QUALITY = 82          # lossy quality for every WebP we emit
WEBP_ALPHA_QUALITY = 100   # keep the alpha channel lossless (clean cut-out edges)
WEBP_METHOD = 6            # slowest / best compression
PNG_COMPRESS_LEVEL = 9
JPEG_QUALITY = 84          # fallback quality for photographic app screens

APP_WIDTH = 900
APP_SM_WIDTH = 450
ILLUS_WIDTH = 720
MARK_SIZE = 512

# Brand palette
ORANGE = (0xF3, 0x73, 0x0A)
INK = (0x17, 0x14, 0x12)
WHITE = (0xFF, 0xFF, 0xFF)

RESAMPLE = Image.Resampling.LANCZOS

# Achievement badges, cut out of the profil mock. These are the app's real reward
# artwork (fox / monkey / wolf) and the only place the mascots appear as *earned*
# objects rather than decoration, which is why they are worth lifting out as
# standalone assets. The mock's own captions read "First step" / "10 workouts" /
# "50 workouts" - English - so the row is cut above the caption band and the
# French label is supplied by the markup instead.
BADGE_SOURCE = "mocks/profil.png"
BADGE_ROW = (966, 1116)
# Nothing uses the achievement badges any more: the achievements section was cut
# (the app's public positioning never mentions badges) and the wolf, which stood
# in for the session icon, went with the DOM home screen the Figma mockup
# replaced. The crop boxes stay documented in case they are wanted again.
BADGE_BOXES: Sequence[tuple[str, int, int]] = ()
BADGE_WIDTH = 320

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


def write_jpg(im: Image.Image, path: Path, note: str = "") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    strip_meta(flatten(im, WHITE)).save(
        path, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True
    )
    record(path, note)


def write_pair(im: Image.Image, directory: Path, stem: str, note: str = "") -> None:
    """Emit both `<stem>.webp` and `<stem>.png`."""
    write_webp(im, directory / f"{stem}.webp", note)
    write_png(im, directory / f"{stem}.png", note)


def write_photo_pair(im: Image.Image, directory: Path, stem: str, note: str = "") -> None:
    """
    Emit `<stem>.webp` plus a JPEG fallback.

    PNG is the wrong fallback for these: the app screens lifted from the Play
    boards contain photographs (a group banner, a programme hero, 110 exercise
    thumbnails), and lossless PNG made them four to eight times larger than the
    WebP anyone actually downloads. JPEG keeps the fallback honest at a fraction
    of the weight, and it has no alpha to lose since the screens are opaque.
    """
    write_webp(im, directory / f"{stem}.webp", note)
    write_jpg(im, directory / f"{stem}.jpg", note)


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


def build_store() -> None:
    """Crop the app screen out of each Google Play listing board."""
    left, right = STORE_CARD_X
    for name, rel, top, height in STORE_SOURCES:
        src = load(f"{STORE_DIR}/{rel}")
        bottom = min(src.height, top + height)
        card = strip_meta(src.crop((left, top, right, bottom)))
        opaque = flatten(card, WHITE)
        note_base = (f"Play board crop x{left}-{right} y{top}-{bottom} "
                     f"-> {card.width}x{card.height}")

        sized, warn = fit_width(opaque, APP_WIDTH)
        write_photo_pair(sized, APP_DIR, name,
                   "; ".join(x for x in (note_base, warn) if x))

        if opaque.width > APP_SM_WIDTH:
            small, warn_sm = fit_width(opaque, APP_SM_WIDTH)
            write_photo_pair(small, APP_DIR, f"{name}-sm",
                       "; ".join(x for x in (note_base, warn_sm) if x))


def _set_text(im, box, text, font_file, colour, centred=False):
    """Erase the ink inside `box` and re-set `text` at the same optical size.

    The font size is fitted against a reference glyph rather than the new string
    so accents and descenders do not shrink the result: "affil\u00e9e" must sit at the
    same cap height as the English it replaces.
    """
    from PIL import ImageDraw, ImageFont

    x0, y0, x1, y1 = box
    pad = 3
    draw = ImageDraw.Draw(im)
    draw.rectangle([x0 - pad, y0 - pad, x1 + pad, y1 + pad], fill=(255, 255, 255))

    target = (y1 - y0) + 1
    path = str(MOCKUP_FONTS / f"{font_file}.ttf")
    size = target
    for _ in range(40):
        f = ImageFont.truetype(path, size)
        cap = f.getbbox("H")
        h = cap[3] - cap[1]
        if abs(h - target) <= 1:
            break
        size += 1 if h < target else -1
    f = ImageFont.truetype(path, size)

    cap = f.getbbox("H")
    box_new = f.getbbox(text)
    x = x0 - box_new[0]
    if centred:
        x = x0 + ((x1 - x0) - (box_new[2] - box_new[0])) / 2 - box_new[0]
    # Align on the cap top so the new baseline matches the old one.
    draw.text((x, y0 - cap[1]), text, font=f, fill=colour)


def build_mockup() -> None:
    """Home screen: the team's Figma export, with its English strings re-set."""
    src = load(MOCKUP_SRC).convert("RGB")
    for box, text, font_file, colour in MOCKUP_TEXT:
        _set_text(src, box, text, font_file, colour)
    for box, letter, colour in MOCKUP_DAYS:
        _set_text(src, box, letter, MOCKUP_DAY_FONT, colour, centred=True)

    note = "Figma home mockup, English strings re-set in Montserrat"
    sized, warn = fit_width(src, APP_WIDTH)
    write_photo_pair(sized, APP_DIR, "home", "; ".join(x for x in (note, warn) if x))
    small, warn_sm = fit_width(src, APP_SM_WIDTH)
    write_photo_pair(small, APP_DIR, "home-sm", "; ".join(x for x in (note, warn_sm) if x))


def build_emu() -> None:
    """Resize the staged emulator captures into deployable app screens."""
    for name, rel, bottom in EMU_SOURCES:
        src = load(f"{EMU_DIR}/{rel}")
        card = strip_meta(src.crop((0, EMU_TOP, src.width, min(bottom, src.height))))
        opaque = flatten(card, WHITE)
        note = (f"emulator capture, -{EMU_TOP}px status/DEBUG "
                f"-> {card.width}x{card.height}")
        sized, warn = fit_width(opaque, APP_WIDTH)
        write_photo_pair(sized, APP_DIR, name,
                         "; ".join(x for x in (note, warn) if x))
        small, warn_sm = fit_width(opaque, APP_SM_WIDTH)
        write_photo_pair(small, APP_DIR, f"{name}-sm",
                         "; ".join(x for x in (note, warn_sm) if x))


def _duotone(im: Image.Image, shadow, highlight) -> Image.Image:
    """Map luminance onto a two-colour ramp: the poster treatment."""
    from PIL import ImageOps
    grey = ImageOps.autocontrast(im.convert("L"), cutoff=1)
    channels = []
    for ch in range(3):
        lo, hi = shadow[ch], highlight[ch]
        lut = [round(lo + (hi - lo) * (v / 255)) for v in range(256)]
        channels.append(grey.point(lut))
    return Image.merge("RGB", channels)


def _smear(im: Image.Image, steps: int = 14, shift: int = 6) -> Image.Image:
    """Cheap horizontal motion blur: stacked, offset, fading copies."""
    base = im.convert("RGBA")
    out = base.copy()
    for i in range(1, steps):
        layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
        layer.paste(base, (i * shift, 0))
        out = Image.blend(out, layer, alpha=1.0 / (i + 1.5))
    return out.convert("RGB")


def build_photos() -> None:
    """Hero field, gallery cards and CTA glow, all from one CC0 photo."""
    from PIL import ImageFilter, ImageOps
    src = load(PHOTO_SRC).convert("RGB")  # 960x640 runners in a park

    rust = (48, 16, 2)
    blaze = (255, 158, 74)

    # Hero background: the runners smeared into motion and mapped onto the brand
    # ramp. Kept dark at the base so white display type clears AA over it.
    hero = src.crop((140, 40, 960, 640)).resize((1640, 1200), RESAMPLE)
    hero = _smear(hero.filter(ImageFilter.GaussianBlur(3)), steps=16, shift=9)
    hero = _duotone(hero, rust, blaze)
    write_jpg(hero, PHOTO_DIR / "hero-run.jpg", "group-banner.jpg, smear + duotone")
    write_webp(hero, PHOTO_DIR / "hero-run.webp", "group-banner.jpg, smear + duotone")

    # Gallery portrait cards (3:4).
    bw = src.crop((300, 60, 640, 513)).resize((660, 880), RESAMPLE)
    bw = ImageOps.autocontrast(bw.convert("L"), cutoff=1).convert("RGB")
    write_jpg(bw, PHOTO_DIR / "gal-run-bw.jpg", "group-banner.jpg, mono crop")
    write_webp(bw, PHOTO_DIR / "gal-run-bw.webp", "group-banner.jpg, mono crop")

    duo = src.crop((560, 30, 940, 537)).resize((660, 880), RESAMPLE)
    duo = _duotone(duo, rust, blaze)
    write_jpg(duo, PHOTO_DIR / "gal-ride-duo.jpg", "group-banner.jpg, duotone crop")
    write_webp(duo, PHOTO_DIR / "gal-ride-duo.webp", "group-banner.jpg, duotone crop")

    # CTA panel backdrop: the same field pushed almost to abstraction.
    glow = src.crop((200, 100, 800, 550)).resize((1400, 1050), RESAMPLE)
    glow = glow.filter(ImageFilter.GaussianBlur(14))
    glow = _smear(glow, steps=10, shift=14)
    glow = _duotone(glow, (40, 12, 1), (244, 122, 32))
    write_webp(glow, PHOTO_DIR / "cta-glow.webp", "group-banner.jpg, blur + duotone")


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


def build_badges() -> None:
    """Cut the three achievement badges out of the profil mock."""
    src = load(BADGE_SOURCE)
    top, bottom = BADGE_ROW
    for name, left, right in BADGE_BOXES:
        card = strip_meta(src.crop((left, top, right, bottom)))
        # The badge cards carry a barely-tinted near-white fill. Flattening onto
        # white keeps that tint intact while dropping the alpha channel, so the
        # asset composites identically on the site's warm paper without a halo.
        opaque = flatten(card, WHITE)
        sized, warn = fit_width(opaque, BADGE_WIDTH)
        note = "; ".join(
            x for x in (f"profil.png crop x{left}-{right} y{top}-{bottom} "
                        f"-> {card.width}x{card.height}", warn) if x
        )
        write_pair(sized, BADGE_DIR, name, note)


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
    for name, *_ in EMU_SOURCES:
        files += [APP_DIR / f"{name}.webp", APP_DIR / f"{name}.jpg",
                  APP_DIR / f"{name}-sm.webp", APP_DIR / f"{name}-sm.jpg"]
    files += [APP_DIR / "home.webp", APP_DIR / "home.jpg",
              APP_DIR / "home-sm.webp", APP_DIR / "home-sm.jpg"]
    for stem in ("hero-run", "gal-run-bw", "gal-ride-duo"):
        files += [PHOTO_DIR / f"{stem}.jpg", PHOTO_DIR / f"{stem}.webp"]
    files += [PHOTO_DIR / "cta-glow.webp"]
    for name, *_ in STORE_SOURCES:
        files += [APP_DIR / f"{name}.webp", APP_DIR / f"{name}.jpg",
                  APP_DIR / f"{name}-sm.webp", APP_DIR / f"{name}-sm.jpg"]
    for name, _ in ILLUS_SOURCES:
        files += [ILLUS_DIR / f"{name}.webp", ILLUS_DIR / f"{name}.png"]
    for name, _, _ in BADGE_BOXES:
        files += [BADGE_DIR / f"{name}.webp", BADGE_DIR / f"{name}.png"]
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
    build_store()
    build_emu()
    build_mockup()
    build_photos()
    build_illus()
    build_badges()

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
