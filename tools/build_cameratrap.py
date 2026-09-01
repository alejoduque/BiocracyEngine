#!/usr/bin/env python3
"""
Build the camera-trap register for the Cámara Fenológica (slot C).

Reads the Reserva MANAKAI camera-trap directory — 22 ten-second 1920x1080 MOV
files — and places each one on the same 365-day phenological ring of Article 42
that tools/build_corpus.py uses for the AudioMoth corpus. Output is
corpus/cameratrap.json, shaped so a reader that already understands
manifest.json needs no second vocabulary.

The originals are opened read-only and never modified.

Where the two registers differ
------------------------------
The AudioMoth corpus carries *roles* produced by a detector: the machine heard
something and classified its ecological function. The camera trap carries
*sightings* named by a person in the filename, in informal Spanish. Those are
different kinds of claim and this script does not pretend otherwise:

  label       what the field name literally says ("ocelote", "3pumas")
  taxon       the most specific name the label honestly supports
  rank        how far down the tree that name actually reaches

A file called `08180030.MOV` has no label. It is kept, with an empty species
list, because an unlabelled capture is still a capture on that day — dropping
it would silently thin the ring.

Nothing here withholds
----------------------
Every clip is projected. There is no veil list and no hard refusal: the
Chamber decides what to show through the /camara/opacity control, not through
a constant in this file. What each record does carry is a `sensitivity`
scalar, which says how strongly that record answers to that control — see
SENSITIVITY below. At full opacity every record renders identically; the
scalar only shapes the *order* in which things recede when the Chamber turns
the fader down.

Usage:
    python3 tools/build_cameratrap.py --dry-run
    python3 tools/build_cameratrap.py
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import unicodedata
from datetime import datetime
from pathlib import Path

SOURCE = Path("/Users/a/Desktop/camaratrampaAgosto2026")
DEST = Path(__file__).resolve().parent.parent / "corpus"

STATION = "CT-MANAKAI-01"
LOCALITY = "Reserva MANAKAI"

# Kept identical to build_corpus.py so both registers fold onto one ring.
TEMPORADAS = (
    ("primeras_lluvias", 91, 151),
    ("medio_seco", 152, 243),
    ("segundas_lluvias", 244, 334),
)


def temporada(doy: int) -> str:
    """Article 42. Seca wraps the ring end (335-90)."""
    for name, lo, hi in TEMPORADAS:
        if lo <= doy <= hi:
            return name
    return "seca"


# ── Field labels → what they honestly support ───────────────────────────────
#
# Keys are matched against the accent-stripped, lowercased filename tail, so
# "aulladoresdefondo" and "sonidosAulladores" both reach `aullador`. Longer
# keys are tested first, which is why `avegarza` resolves to the heron rather
# than to the generic bird.
#
# `rank` is the honest one. Only the two felids and the howler are identifiable
# to species from a still frame in this region; everything else stops at family
# or class, and the taxon column says so rather than inventing a binomial.
LABELS: tuple[tuple[str, dict], ...] = (
    ("ocelote",   {"taxon": "Leopardus pardalis",  "rank": "species", "common": "ocelote",          "group": "felid"}),
    ("puma",      {"taxon": "Puma concolor",       "rank": "species", "common": "puma",             "group": "felid"}),
    ("aullador",  {"taxon": "Alouatta seniculus",  "rank": "species", "common": "mono aullador",    "group": "primate"}),
    ("mapache",   {"taxon": "Procyon cancrivorus", "rank": "species", "common": "mapache cangrejero", "group": "mammal"}),
    ("garza",     {"taxon": "Ardeidae",            "rank": "family",  "common": "garza",            "group": "bird"}),
    ("avenegra",  {"taxon": "Aves",                "rank": "class",   "common": "ave (oscura)",     "group": "bird"}),
    ("avequecanta", {"taxon": "Aves",              "rank": "class",   "common": "ave cantora",      "group": "bird"}),
    # Singular and plural collapse deliberately. They carry the same taxon,
    # rank and sensitivity, and a concatenated field name cannot tell them
    # apart anyway — "pasoavesonido" reads "aves" out of "ave" + "sonido".
    ("ave",       {"taxon": "Aves",                "rank": "class",   "common": "ave",              "group": "bird"}),
    ("grillo",    {"taxon": "Gryllidae",           "rank": "family",  "common": "grillo",           "group": "insect"}),
    ("insectos",  {"taxon": "Insecta",             "rank": "class",   "common": "insectos",         "group": "insect"}),
    ("mosca",     {"taxon": "Diptera",             "rank": "order",   "common": "mosca",            "group": "insect"}),
    # Not a species. Rain is the other half of the soundscape the AudioMoth
    # calls geophony, and it belongs on the ring for the same reason.
    ("lluvia",    {"taxon": None,                  "rank": "geophony", "common": "lluvia",          "group": "geophony"}),
)

# How strongly a record answers to /camara/opacity. 1.0 recedes first, 0.0
# never recedes at all. This is a dial on an ordering, NOT a veil: at the
# control's default of 1.0 every record is projected in full.
#
# The felids lead because they are the animals whose exact location is worth
# money to someone else; the insects trail because a cricket's coordinates
# endanger no cricket. The Chamber can disagree — that is what the fader is for.
SENSITIVITY = {
    "felid": 1.0,
    "primate": 0.6,
    "mammal": 0.5,
    "bird": 0.3,
    "insect": 0.0,
    "geophony": 0.0,
}

STOPWORDS = {"sonido", "sonidos", "noche", "paso", "de", "fondo", "sec", "y", "que", "canta", "pasa"}


def strip_accents(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", s)
        if unicodedata.category(c) != "Mn"
    )


def parse_labels(stem: str) -> tuple[list[dict], list[str]]:
    """
    Filename → species records + the raw tokens that produced them.

    `08180029_ocelote_aulladoresdefondo` carries two animals; the ring needs
    both, and the more sensitive of the two is what sets the record's own
    sensitivity.
    """
    tail = stem.split("_", 1)[1] if "_" in stem else ""
    hay = strip_accents(tail).lower()
    if not hay:
        return [], []

    # Matches are consumed by span, because these keys nest: "ave" sits inside
    # "aves", "avegarza" and "avenegra", and a naive substring test reports a
    # generic bird alongside every specific one. LABELS is ordered specific
    # first, so the first key to claim a span keeps it.
    found: list[dict] = []
    seen: set[str] = set()
    taken: list[tuple[int, int]] = []

    def overlaps(a: int, b: int) -> bool:
        return any(a < end and start < b for start, end in taken)

    for key, meta in LABELS:
        for m in re.finditer(re.escape(key), hay):
            start, end = m.span()
            # A Spanish field name builds bird compounds as "ave" + qualifier
            # ("avegarza" = ave garza). Swallow that prefix with the qualifier
            # so the heron does not also register as an anonymous bird.
            if meta["group"] == "bird" and hay[max(0, start - 3):start] == "ave":
                start -= 3
            if overlaps(start, end):
                continue
            taken.append((start, end))
            if meta["common"] in seen:
                continue
            seen.add(meta["common"])
            # "3pumas" — the field name counted them, so keep the count.
            c = re.search(r"(\d+)\s*" + re.escape(key), hay)
            rec = dict(meta)
            rec["count"] = int(c.group(1)) if c else 1
            rec["sensitivity"] = SENSITIVITY.get(meta["group"], 0.3)
            found.append(rec)

    raw = [t for t in re.split(r"[^a-z0-9]+", hay) if t and t not in STOPWORDS]
    return found, raw


def probe(path: Path) -> dict:
    """Duration, dimensions, fps and the camera's own creation_time."""
    proc = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json",
         "-show_format", "-show_streams", str(path)],
        capture_output=True, text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"ffprobe failed on {path.name}")
    data = json.loads(proc.stdout)

    video = next((s for s in data.get("streams", []) if s.get("codec_type") == "video"), {})
    fmt = data.get("format", {})

    num, _, den = (video.get("r_frame_rate") or "0/1").partition("/")
    try:
        fps = round(float(num) / float(den), 3) if float(den) else 0.0
    except (ValueError, ZeroDivisionError):
        fps = 0.0

    when = (video.get("tags", {}) or {}).get("creation_time") \
        or (fmt.get("tags", {}) or {}).get("creation_time")

    return {
        "duration_s": round(float(fmt.get("duration") or 0.0), 3),
        "width": int(video.get("width") or 0),
        "height": int(video.get("height") or 0),
        "fps": fps,
        "creation_time": when,
    }


def scan() -> list[dict]:
    records: list[dict] = []

    for src in sorted(SOURCE.glob("*.MOV")):
        try:
            info = probe(src)
        except RuntimeError as e:
            print(f"  skip  {src.name}: {e}", file=sys.stderr)
            continue

        if not info["creation_time"]:
            print(f"  skip  {src.name}: no creation_time", file=sys.stderr)
            continue

        when = datetime.fromisoformat(info["creation_time"].replace("Z", "+00:00"))
        doy = when.timetuple().tm_yday

        species, raw = parse_labels(src.stem)

        # A record is as sensitive as the most sensitive thing in frame. An
        # unlabelled capture could be anything, so it takes the felid rate
        # rather than assuming the camera caught nothing worth protecting.
        sensitivity = max((s["sensitivity"] for s in species), default=1.0)

        records.append({
            "key": f"ct_{src.stem}",
            "source": str(src),
            "station": STATION,
            "locality": LOCALITY,
            "register": "cameratrap",
            "doy": doy,
            "date": when.date().isoformat(),
            "hour": when.hour,
            "minute": when.minute,
            "temporada": temporada(doy),
            "duration_s": info["duration_s"],
            "width": info["width"],
            "height": info["height"],
            "fps": info["fps"],
            # Diel bucket, the one thing a camera trap says that the clock
            # alone does not: these are IR-lit at night and colour by day.
            "diel": "noche" if (when.hour >= 18 or when.hour < 6) else "dia",
            "species": species,
            "labels": raw,
            "unlabelled": not species,
            "sensitivity": round(sensitivity, 3),
        })

    records.sort(key=lambda r: (r["doy"], r["hour"], r["minute"], r["key"]))
    return records


def write_manifest(records: list[dict]) -> Path:
    days: dict[int, dict] = {}
    for rec in records:
        day = days.setdefault(rec["doy"], {
            "doy": rec["doy"], "date": rec["date"],
            "temporada": rec["temporada"], "clips": 0, "species": [],
        })
        day["clips"] += 1
        for s in rec["species"]:
            if s["common"] not in day["species"]:
                day["species"].append(s["common"])

    recorded = sorted(days)
    roster: dict[str, dict] = {}
    for rec in records:
        for s in rec["species"]:
            r = roster.setdefault(s["common"], {
                "common": s["common"], "taxon": s["taxon"], "rank": s["rank"],
                "group": s["group"], "sensitivity": s["sensitivity"],
                "clips": 0, "days": [],
            })
            r["clips"] += 1
            if rec["doy"] not in r["days"]:
                r["days"].append(rec["doy"])

    manifest = {
        "generated": datetime.now().astimezone().isoformat(timespec="seconds"),
        "source": str(SOURCE),
        "station": STATION,
        "locality": LOCALITY,
        "register": "cameratrap",
        # Stated so a reader never has to infer it: this register veils
        # nothing. Ordering under /camara/opacity is the only use of
        # `sensitivity` anywhere downstream.
        "withholding": "none",
        "opacity_control": "/camara/opacity",
        "temporadas": {
            "seca": [335, 90], "primeras_lluvias": [91, 151],
            "medio_seco": [152, 243], "segundas_lluvias": [244, 334],
        },
        "ring": {
            "recorded_days": recorded,
            "days": [days[d] for d in recorded],
        },
        "roster": [roster[k] for k in sorted(roster)],
        "clips": records,
    }

    DEST.mkdir(parents=True, exist_ok=True)
    path = DEST / "cameratrap.json"
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    return path


def summarise(records: list[dict]) -> None:
    if not records:
        print("no records")
        return

    doys = [r["doy"] for r in records]
    print(f"\n  clips        {len(records)}")
    print(f"  ring span    doy {min(doys)}-{max(doys)}  ({records[0]['date']} .. {records[-1]['date']})")
    print(f"  temporada    {', '.join(sorted({r['temporada'] for r in records}))}")

    noche = sum(1 for r in records if r["diel"] == "noche")
    print(f"  diel         {noche} noche / {len(records) - noche} dia")

    unl = sum(1 for r in records if r["unlabelled"])
    print(f"  unlabelled   {unl}")

    counts: dict[str, int] = {}
    for r in records:
        for s in r["species"]:
            counts[s["common"]] = counts.get(s["common"], 0) + 1
    print("\n  roster")
    for name in sorted(counts, key=lambda n: (-counts[n], n)):
        print(f"    {counts[name]:>2}  {name}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true",
                    help="scan and summarise without writing the manifest")
    args = ap.parse_args()

    if not SOURCE.is_dir():
        print(f"source not found: {SOURCE}", file=sys.stderr)
        return 1

    print(f"scanning  {SOURCE}")
    records = scan()
    summarise(records)

    if args.dry_run:
        print("\ndry run — nothing written")
        return 0

    path = write_manifest(records)
    print(f"\nmanifest  {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
