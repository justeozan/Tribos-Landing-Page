#!/usr/bin/env python3
"""
Tribos landing page - iOS captures and app widget assets.

Reads the sources staged in `.context/src/ios/` (copies from the app repo, which
is the source of truth) and writes:

    assets/app/ios-<screen>.webp / .jpg        900 px wide, phone frames
    assets/app/ios-<screen>-sm.webp / .jpg     450 px wide
    assets/appui/avatar-<name>.webp / .jpg     96 x 96, leaderboard and chat
    assets/appui/group-banner.webp / .jpg      the "Les Loups" group banner
    assets/appui/*.svg                         the app's own icons, verbatim
    assets/appui/icons.svg                     Material icons the widgets use

Where the sources come from (app repo, /Users/.../Tribos):

    store/app-store/screenshot-0N-*-1320x2868.png   the App Store boards
    store/app-store/sources/avatar-max.jpg          CC0 (StockSnap)
    store/play/sources/avatar-alex.jpg, avatar-lena.jpg, group-banner.jpg  CC0
    assets/icons/flame.svg, "ellipse completed.svg" (staged as day-done.svg)

Material icons: the app draws its widgets with Flutter's Material icons
(Icons.workspace_premium, flash_on_rounded, chat_bubble_outline_rounded,
send_rounded). The official SVGs (google/material-design-icons, Apache 2.0)
are staged in .context/src/material/ and folded into one sprite, used inside
the app widgets only: the site's own icons stay Phosphor.

Not taken: the wolf mascot (assets/mascotte/loup.png) and its Triangles.svg
backdrop. The site's design system bans the old wolf, so the "Séance du jour"
card, the only widget that carries it, is not rebuilt.

Why the App Store boards: they are the real app (release build, no DEBUG
ribbon), driven by the demo account "Max" of the fictional group "Les Loups",
every image loaded, the iOS status bar forced to 9:41. The boards were made by
the app repo's scripts/gen_app_store_assets.py, which pastes the raw capture
at 1100 px wide (x 110..1210) under a 3 px border and lets it run off the
bottom edge. This script finds the top of that border, cuts the screen back
out, and trims every screen to the same height so the cross-fading frames of
the site have one size. The top corners of the cut keep the board's 70 px
rounding; the site's device frame masks them with a larger radius.

To refresh: re-run the app repo's capture pipeline (docs/app-store.md, section
6), copy the boards and sources into .context/src/ios/, then run this script.

Usage:
    /opt/homebrew/bin/python3 tools/build-ios.py

Requirements: Python 3.9+, Pillow >= 10 with WebP. No network.
Idempotent: same sources, same bytes.
"""

from __future__ import annotations

import re
import shutil
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / ".context" / "src" / "ios"
MATERIAL = ROOT / ".context" / "src" / "material"
APP_DIR = ROOT / "assets" / "app"
UI_DIR = ROOT / "assets" / "appui"

BOARD_SIZE = (1320, 2868)
SCREEN_X = (110, 1210)            # the pasted capture, 1100 px wide
BORDER = ((0xE9, 0xDD, 0xCF), (0xFF, 0xD9, 0xB0))  # cream boards, orange cover
SCREEN_H = 2296                   # common height: the shortest stage screen

# site name, board file
SCREENS = (
    ("programmes", "screenshot-06-programmes-1320x2868.png"),
    ("groupe", "screenshot-02-groupe-1320x2868.png"),
    ("player", "screenshot-03-entrainement-1320x2868.png"),
    ("seance", "screenshot-05-seance-1320x2868.png"),
)

AVATARS = ("max", "alex", "lena")
AVATAR_SIZE = 96
BANNER_WIDTH = 900
ICONS = ("flame.svg", "day-done.svg")

# sprite id, staged Material file (24px viewBox)
MATERIAL_ICONS = (
    ("m-premium", "workspace_premium-materialicons.svg"),
    ("m-flash", "flash_on-materialiconsround.svg"),
    ("m-chat", "chat_bubble_outline-round.svg"),
    ("m-send", "send-round.svg"),
)

WIDTH, WIDTH_SM = 900, 450
WEBP_QUALITY = 84
JPEG_QUALITY = 84
RESAMPLE = Image.Resampling.LANCZOS


def close(c: tuple[int, int, int], ref: tuple[int, int, int], tol: int = 3) -> bool:
    return all(abs(a - b) <= tol for a, b in zip(c, ref))


def screen_top(board: Image.Image) -> int:
    """First row under the board's 3 px border, read down the centre column."""
    x = (SCREEN_X[0] + SCREEN_X[1]) // 2
    for y in range(200, 1400):
        if any(close(board.getpixel((x, y)), ref) for ref in BORDER):
            return y + 3
    raise SystemExit("bordure de la capture introuvable")


def save_pair(im: Image.Image, directory: Path, stem: str) -> list[Path]:
    rgb = im.convert("RGB")
    webp = directory / f"{stem}.webp"
    jpg = directory / f"{stem}.jpg"
    rgb.save(webp, "WEBP", quality=WEBP_QUALITY, method=6)
    rgb.save(jpg, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
    return [webp, jpg]


def resize_w(im: Image.Image, width: int) -> Image.Image:
    return im.resize((width, round(im.height * width / im.width)), RESAMPLE)


def build_screens() -> list[Path]:
    out = []
    for name, file in SCREENS:
        board = Image.open(SRC / file).convert("RGB")
        if board.size != BOARD_SIZE:
            raise SystemExit(f"{file} : {board.size}, attendu {BOARD_SIZE}")
        top = screen_top(board)
        if BOARD_SIZE[1] - top < SCREEN_H:
            raise SystemExit(f"{file} : écran trop court ({BOARD_SIZE[1] - top} px)")
        screen = board.crop((SCREEN_X[0], top, SCREEN_X[1], top + SCREEN_H))
        out += save_pair(resize_w(screen, WIDTH), APP_DIR, f"ios-{name}")
        out += save_pair(resize_w(screen, WIDTH_SM), APP_DIR, f"ios-{name}-sm")
    return out


def build_avatars() -> list[Path]:
    """Centre square, as the app's CircleAvatar shows the uploaded photo."""
    out = []
    for name in AVATARS:
        im = Image.open(SRC / f"avatar-{name}.jpg").convert("RGB")
        side = min(im.size)
        left, top = (im.width - side) // 2, (im.height - side) // 2
        im = im.crop((left, top, left + side, top + side)).resize((AVATAR_SIZE, AVATAR_SIZE), RESAMPLE)
        out += save_pair(im, UI_DIR, f"avatar-{name}")
    return out


def build_banner() -> list[Path]:
    im = Image.open(SRC / "group-banner.jpg").convert("RGB")
    if im.width > BANNER_WIDTH:
        im = resize_w(im, BANNER_WIDTH)
    return save_pair(im, UI_DIR, "group-banner")


def build_sprite() -> list[Path]:
    """One <symbol> per icon: the drawn paths, without the transparent box."""
    symbols = []
    for sid, file in MATERIAL_ICONS:
        svg = (MATERIAL / file).read_text()
        paths = [p for p in re.findall(r"<path [^>]*/>", svg) if 'fill="none"' not in p]
        if not paths:
            raise SystemExit(f"{file} : aucun tracé")
        symbols.append(f'  <symbol id="{sid}" viewBox="0 0 24 24">{"".join(paths)}</symbol>')
    out = UI_DIR / "icons.svg"
    out.write_text(
        '<svg xmlns="http://www.w3.org/2000/svg">\n'
        "  <!-- Material Icons, Google, Apache License 2.0 (LICENSE-material-icons.txt). -->\n"
        + "\n".join(symbols)
        + "\n</svg>\n"
    )
    lic = UI_DIR / "LICENSE-material-icons.txt"
    shutil.copyfile(MATERIAL / "LICENSE", lic)
    return [out, lic]


def copy_icons() -> list[Path]:
    out = []
    for name in ICONS:
        dest = UI_DIR / name
        shutil.copyfile(SRC / name, dest)
        out.append(dest)
    return out


def main() -> int:
    if not SRC.is_dir():
        raise SystemExit(f"sources absentes : {SRC}")
    APP_DIR.mkdir(parents=True, exist_ok=True)
    UI_DIR.mkdir(parents=True, exist_ok=True)
    paths = build_screens() + build_avatars() + build_banner() + copy_icons() + build_sprite()
    for p in paths:
        size = p.stat().st_size
        dims = ""
        if p.suffix not in (".svg", ".txt"):
            with Image.open(p) as im:
                dims = f"{im.width}x{im.height}"
        print(f"{p.relative_to(ROOT)}  {dims}  {size / 1024:.1f} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
