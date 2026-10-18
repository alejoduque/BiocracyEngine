#!/usr/bin/env python3
"""
Shelve the visual register for the Library of Babel (slot C on the dome).

Packs every poster in corpus/visual/index.json into two atlases, each cell the
picture over a caption strip set in JetBrains Mono (the type of the blended
slots and of Estratos):

  corpus/visual/babel/ct.jpg   camera trap, 256 px cells — the animals, the
                               books that come close enough to read
  corpus/visual/babel/am.jpg   AudioMoth spectrograms, 128 px cells — 612 of
                               them, mostly seen far up the shaft
  corpus/visual/babel/babel.json   the grid of each, and which clip is where

Why atlases: 642 separate posters in the page meant 642 image decodes and a
GPU upload per poster as each landed (the dome's own perf notes: per-image
uploads are what clicked the audio). Two prebuilt images are two decodes and
two uploads, about 36 MB of texture together with their mipmaps.

Run after build_visual.py (which calls it at the end):
    python3 tools/build_babel.py
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
CORPUS = ROOT / "corpus"
INDEX = CORPUS / "visual" / "index.json"
DEST = CORPUS / "visual" / "babel"
FONT = ROOT / "nw_wrld_local" / "ecosystems" / "default_ecosystem" / "assets" / "fonts" / "JetBrainsMonoNL-SemiBold.ttf"

GREEN = (141, 240, 180)
AMBER = (255, 186, 94)
PLATE = (4, 22, 13)

# (cell width, picture height, caption height, columns)
SPECS = {
    "ct": (256, 144, 18, 8),
    "am": (128, 72, 12, 16),
}


def caption(clip: dict) -> tuple[str, bool]:
    doy = f"doy {clip['doy']:03d}"
    if clip["register"] == "cameratrap":
        sp = clip.get("species") or []
        names = ", ".join(s["common"] for s in sp) or "sin etiqueta"
        return f"{doy} · {names}", any(s.get("group") == "felid" for s in sp)
    return f"{doy} · {clip.get('role') or clip.get('domain') or '—'}", False


def build(name: str, clips: list[dict]) -> dict:
    cw, ih, chh, cols = SPECS[name]
    ch = ih + chh
    rows = max(1, math.ceil(len(clips) / cols))
    sheet = Image.new("RGB", (cw * cols, ch * rows), PLATE)
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.truetype(str(FONT), max(8, chh - 6))
    keys, felid = [], []
    for i, clip in enumerate(clips):
        x, y = (i % cols) * cw, (i // cols) * ch
        poster = CORPUS / clip["poster"]
        with Image.open(poster) as im:
            sheet.paste(im.convert("RGB").resize((cw, ih), Image.LANCZOS), (x, y))
        text, fel = caption(clip)
        # Cut to the cell, or it runs on into the next book's.
        while text and font.getlength(text) > cw - 8:
            text = text[:-2] + "…"
        draw.text((x + 4, y + ih + 2), text, font=font, fill=AMBER if fel else GREEN)
        draw.rectangle((x, y, x + cw - 1, y + ch - 1), outline=(55, 95, 72))
        keys.append(clip["key"])
        felid.append(fel)
    DEST.mkdir(parents=True, exist_ok=True)
    sheet.save(DEST / f"{name}.jpg", quality=82, optimize=True)
    return {"image": f"visual/babel/{name}.jpg", "cols": cols, "rows": rows,
            "cell": [cw, ch], "keys": keys, "felid": felid}


def main() -> int:
    if not INDEX.exists():
        print(f"no index: {INDEX} — run build_visual.py first", file=sys.stderr)
        return 1
    clips = json.loads(INDEX.read_text(encoding="utf-8"))["clips"]
    with_poster = [c for c in clips if c.get("poster") and (CORPUS / c["poster"]).exists()]
    ct = [c for c in with_poster if c["register"] == "cameratrap"]
    am = [c for c in with_poster if c["register"] == "audiomoth"]
    out = {"ct": build("ct", ct), "am": build("am", am)}
    (DEST / "babel.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    for k, v in out.items():
        size = (DEST / f"{k}.jpg").stat().st_size / 1e6
        print(f"babel {k}: {len(v['keys'])} books, {v['cols']}x{v['rows']} cells, {size:.1f} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
