#!/usr/bin/env python3
"""
Build the derived visual tier for the Cámara Fenológica (slot C).

Two registers feed one window:

  audiomoth   the scrolling spectrogram rendered beside every AudioMoth event
              (1280x720, 30 fps, 60 s). Not new evidence — it is the same
              event corpus/manifest.json already schedules, seen instead of
              heard, which is why it is keyed on manifest.json's own `key`.

  cameratrap  the MANAKAI camera trap (1920x1080, 20 fps, ~10 s). New
              evidence, keyed on corpus/cameratrap.json.

Both land in corpus/visual/ at a size a 920 px CRT can actually draw, with an
index.json the projector reads instead of walking 290 directories.

Why the originals cannot be used directly
-----------------------------------------
The AudioMoth mp4s are 3.39 GB and their sibling GIFs are 20.5 GB — 74 MB
each, for a 60-second loop. Nothing in an Electron renderer should touch
those. Downscaled and stripped of audio the same 290 clips come to a few
hundred MB.

Audio is removed, not merely muted. The corpus already sounds through
SuperCollider, and these mp4s carry their own 96 kHz AAC of the same event; a
<video> element with a live audio track is a double-playback bug waiting for
the first autoplay policy change. The picture is silent by construction.

The originals are opened read-only and never modified.

Usage:
    python3 tools/build_visual.py --dry-run
    python3 tools/build_visual.py
    python3 tools/build_visual.py --register cameratrap --jobs 8
    python3 tools/build_visual.py --force
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CORPUS = ROOT / "corpus"
DEST = CORPUS / "visual"

MANIFEST = CORPUS / "manifest.json"
CAMERATRAP = CORPUS / "cameratrap.json"

# A second AudioMoth deployment, scanned directly rather than through
# corpus/manifest.json.
#
# It is the same detector output — same clips/<domain>/<role>/ tree, same
# events.json, mp4 spectrogram beside each wav — but it has not been through
# build_corpus.py, and two of its fields do not survive that pipeline's
# assumptions: `clip_path` is null on more than half its events, and `habitat`
# holds a date string rather than one of the CORINE habitat names that
# HABITAT_OPACITY is keyed on. So it is read here for its PICTURES only; the
# sounding corpus is untouched.
#
# Everything is one day (2026-08-25, doy 237), which is why it is ADDED to the
# ring rather than replacing it: the existing corpus spans 34 days across six
# months, and swapping it out would leave the phenological calendar with a
# single recorded doy out of 365.
EXTRA_AUDIOMOTH = Path(
    "/Volumes/Untitled/AudioMothAgosto2026/AudioMothsAgosto2026px"
)

# Kept in step with build_corpus.py / build_cameratrap.py so all three
# registers land in the same season on the same ring.
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

# 480 px wide is the honest ceiling: the CRT surface caps at 920 px and the
# video occupies part of it, so anything larger is bytes the screen throws
# away. -2 keeps the height even, which yuv420p requires.
WIDTH = 480
CRF = 30
PRESET = "veryfast"


def run(cmd: list[str]) -> None:
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(
            f"ffmpeg failed ({proc.returncode})\n"
            f"  {' '.join(cmd[:10])} ...\n"
            f"{proc.stderr[-1200:]}"
        )


def transcode(job: dict) -> tuple[str, str | None]:
    """One clip → a silent mp4 plus a poster frame. Runs in a worker process."""
    src = Path(job["source"])
    out = Path(job["out"])
    poster = Path(job["poster"])

    if not src.exists():
        return job["key"], f"missing source: {src}"

    try:
        out.parent.mkdir(parents=True, exist_ok=True)
        run([
            "ffmpeg", "-nostdin", "-y", "-loglevel", "error",
            "-i", str(src),
            "-an",
            "-vf", f"scale={WIDTH}:-2:flags=bicubic",
            "-c:v", "libx264", "-crf", str(CRF), "-preset", PRESET,
            "-pix_fmt", "yuv420p", "-movflags", "+faststart",
            str(out),
        ])
        # Poster at a third in — far enough past the fade-in that a camera
        # trap has its animal in frame, early enough that a 60 s spectrogram
        # still shows the event rather than its tail.
        run([
            "ffmpeg", "-nostdin", "-y", "-loglevel", "error",
            "-ss", f"{max(0.0, job['duration_s'] / 3.0):.3f}",
            "-i", str(src),
            "-frames:v", "1",
            "-vf", f"scale={WIDTH}:-2:flags=bicubic",
            "-q:v", "4",
            str(poster),
        ])
    except RuntimeError as e:
        return job["key"], str(e)
    return job["key"], None


def load(path: Path, what: str) -> dict | None:
    if not path.exists():
        print(f"  {what} not found: {path}", file=sys.stderr)
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def collect_audiomoth() -> list[dict]:
    """
    Every corpus record whose .wav has an .mp4 beside it.

    build_corpus.py stores `source` as the absolute path of the event's wav in
    the AudioMoth tree; the detector wrote the spectrogram video next to it
    under the same stem.
    """
    data = load(MANIFEST, "corpus manifest")
    if not data:
        return []

    jobs, missing = [], 0
    for rec in data.get("clips", []):
        mp4 = Path(rec["source"]).with_suffix(".mp4")
        if not mp4.exists():
            missing += 1
            continue
        jobs.append({
            "key": rec["key"],
            "register": "audiomoth",
            "source": str(mp4),
            "doy": rec["doy"],
            "date": rec["date"],
            "temporada": rec["temporada"],
            "role": rec.get("role", ""),
            "domain": rec.get("domain", ""),
            "duration_s": float(rec.get("duration_s") or 60.0),
            # The corpus's own per-habitat opacity, carried through so slot C
            # can order the AudioMoth register the same way it orders the
            # camera trap. Not a veil — see build_cameratrap.py.
            "sensitivity": float(rec.get("opacity") or 0.0),
        })
    if missing:
        print(f"  audiomoth: {missing} records have no sibling .mp4")
    jobs += collect_extra_audiomoth({j["key"] for j in jobs})
    return jobs


def collect_extra_audiomoth(seen: set[str]) -> list[dict]:
    """
    The second deployment, walked from disk.

    Keys are prefixed `px_` so they can never collide with a manifest key, and
    the doy comes from the session directory's own timestamp rather than from
    events.json — the folder name is the authority here and is present even
    where the JSON is thin.
    """
    if not EXTRA_AUDIOMOTH.is_dir():
        print(f"  extra audiomoth not mounted, skipping: {EXTRA_AUDIOMOTH}")
        return []

    jobs = []
    # `._*` are AppleDouble sidecars from the exFAT volume, not media.
    for mp4 in sorted(EXTRA_AUDIOMOTH.glob("*/clips/*/*/*.mp4")):
        if mp4.name.startswith("._"):
            continue
        parts = mp4.parts
        try:
            session = parts[parts.index("clips") - 1]
            domain, role = parts[-3], parts[-2]
        except (ValueError, IndexError):
            continue

        m = re.search(r"(\d{8})_(\d{6})", session)
        if not m:
            continue
        when = datetime.strptime(m.group(1) + m.group(2), "%Y%m%d%H%M%S")
        doy = when.timetuple().tm_yday

        key = f"px_{session}_{mp4.stem}"[:96]
        if key in seen:
            continue

        # Duration off the filename's own span (…_0.0s-30.0s), which the
        # detector writes and which is cheaper than probing 351 files.
        d = re.search(r"_([\d.]+)s-([\d.]+)s", mp4.stem)
        dur = (float(d.group(2)) - float(d.group(1))) if d else 30.0

        jobs.append({
            "key": key,
            "register": "audiomoth",
            "source": str(mp4),
            "doy": doy,
            "date": when.date().isoformat(),
            "temporada": temporada(doy),
            "role": role,
            "domain": domain,
            "duration_s": dur,
            # No habitat to key HABITAT_OPACITY on, so this deployment carries
            # no per-record sensitivity. It answers to /camara/opacity like
            # everything else, just uniformly.
            "sensitivity": 0.0,
        })
    if jobs:
        print(f"  extra audiomoth: {len(jobs)} clips from {EXTRA_AUDIOMOTH.name}")
    return jobs


def collect_cameratrap() -> list[dict]:
    data = load(CAMERATRAP, "camera trap manifest")
    if not data:
        return []

    jobs = []
    for rec in data.get("clips", []):
        jobs.append({
            "key": rec["key"],
            "register": "cameratrap",
            "source": rec["source"],
            "doy": rec["doy"],
            "date": rec["date"],
            "temporada": rec["temporada"],
            "diel": rec.get("diel", ""),
            "species": rec.get("species", []),
            "unlabelled": rec.get("unlabelled", False),
            "duration_s": float(rec.get("duration_s") or 10.0),
            "sensitivity": float(rec.get("sensitivity") or 0.0),
        })
    return jobs


def write_index(entries: list[dict]) -> Path:
    by_doy: dict[int, list[str]] = {}
    for e in entries:
        by_doy.setdefault(e["doy"], []).append(e["key"])

    index = {
        "generated": datetime.now().astimezone().isoformat(timespec="seconds"),
        "width": WIDTH,
        "silent": True,
        "withholding": "none",
        "opacity_control": "/camara/opacity",
        "registers": sorted({e["register"] for e in entries}),
        "counts": {
            r: sum(1 for e in entries if e["register"] == r)
            for r in sorted({e["register"] for e in entries})
        },
        # doy → keys, so the ring cursor resolves a day to its pictures with
        # one lookup instead of a scan.
        "by_doy": {str(k): by_doy[k] for k in sorted(by_doy)},
        "clips": entries,
    }
    DEST.mkdir(parents=True, exist_ok=True)
    path = DEST / "index.json"
    path.write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
    return path


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true",
                    help="plan and report without transcoding")
    ap.add_argument("--register", choices=("audiomoth", "cameratrap", "both"),
                    default="both")
    ap.add_argument("--jobs", type=int, default=6,
                    help="parallel ffmpeg workers (default 6)")
    ap.add_argument("--force", action="store_true",
                    help="re-encode clips whose output already exists")
    args = ap.parse_args()

    if not shutil.which("ffmpeg"):
        print("ffmpeg not on PATH", file=sys.stderr)
        return 1

    jobs: list[dict] = []
    if args.register in ("cameratrap", "both"):
        jobs += collect_cameratrap()
    if args.register in ("audiomoth", "both"):
        jobs += collect_audiomoth()

    if not jobs:
        print("nothing to build — run build_corpus.py / build_cameratrap.py first",
              file=sys.stderr)
        return 1

    for j in jobs:
        j["out"] = str(DEST / j["register"] / f"{j['key']}.mp4")
        j["poster"] = str(DEST / j["register"] / f"{j['key']}.jpg")

    todo = jobs if args.force else [j for j in jobs if not Path(j["out"]).exists()]
    src_bytes = sum(Path(j["source"]).stat().st_size for j in jobs
                    if Path(j["source"]).exists())

    tally = ", ".join(
        "{}={}".format(r, sum(1 for j in jobs if j["register"] == r))
        for r in sorted({j["register"] for j in jobs})
    )
    print(f"clips        {len(jobs)}  ({tally})")
    print(f"originals    {src_bytes / 1e9:.2f} GB")
    print(f"to encode    {len(todo)}  ({len(jobs) - len(todo)} already present)")
    print(f"target       {WIDTH}px wide, h264 crf {CRF}, no audio")
    print(f"dest         {DEST}")

    if args.dry_run:
        print("\ndry run — nothing written")
        return 0

    failures: list[tuple[str, str]] = []
    if todo:
        done = 0
        with ProcessPoolExecutor(max_workers=args.jobs) as pool:
            futures = {pool.submit(transcode, j): j for j in todo}
            for fut in as_completed(futures):
                key, err = fut.result()
                done += 1
                if err:
                    failures.append((key, err))
                    print(f"  [{done}/{len(todo)}] FAIL {key}", file=sys.stderr)
                else:
                    print(f"  [{done}/{len(todo)}] {key}")

    # Index only what actually landed, so a partial run yields a manifest that
    # matches the disk rather than one that promises files it never wrote.
    entries = []
    for j in jobs:
        out = Path(j["out"])
        if not out.exists():
            continue
        e = {k: v for k, v in j.items() if k not in ("source", "out", "poster")}
        e["video"] = str(out.relative_to(CORPUS))
        p = Path(j["poster"])
        e["poster"] = str(p.relative_to(CORPUS)) if p.exists() else None
        e["bytes"] = out.stat().st_size
        entries.append(e)

    entries.sort(key=lambda e: (e["doy"], e["register"], e["key"]))
    path = write_index(entries)

    out_bytes = sum(e["bytes"] for e in entries)
    print(f"\nindexed      {len(entries)} clips")
    print(f"derived      {out_bytes / 1e6:.1f} MB", end="")
    if src_bytes:
        print(f"  ({out_bytes / src_bytes * 100:.1f}% of originals)")
    else:
        print()
    print(f"index        {path}")

    if failures:
        print(f"\n{len(failures)} failed:", file=sys.stderr)
        for key, err in failures[:10]:
            print(f"  {key}: {err.splitlines()[0]}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
