#!/usr/bin/env python3
"""
Build the phenological corpus for the Cámara Fenológica layer of BiocracyEngine.

Reads the AudioMoth detector output at 12Gig_La_Luna_SN26/ — 384 kHz mono clips
plus per-recording events.json and a root phenological_series.csv — and renders a
derived library that SuperCollider can actually stream, together with a single
manifest keyed on the 365-day phenological ring of Article 42.

The originals are opened read-only and never modified.

Four tiers:

  audible/   every clip, 384 -> 48 kHz through soxr. The layer that sounds as
             itself.
  expanded/  the ultrasonic-rich events, band-passed above 38 kHz and then
             *reinterpreted* at 48 kHz. That is an exact x8 time expansion:
             60 s becomes 8 minutes and bat echolocation lands in the audible
             band. Not time-aligned with the audible tier, deliberately — the
             bat's time is not ours.
  stems/     the clips the ring actually schedules, split three ways. The
             ultrasonic stem is heterodyned rather than expanded so it stays in
             sync with its siblings and can be mixed against them.
  grains/    short cuts at event onsets, small enough to stay resident.

Usage:
    python3 tools/build_corpus.py --dry-run
    python3 tools/build_corpus.py
    python3 tools/build_corpus.py --tiers audible,grains --jobs 8
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import re
import shutil
import subprocess
import sys
import unicodedata
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import date, datetime
from pathlib import Path

SOURCE = Path("/Users/a/Documents/code/bioacustic-scripts/12Gig_La_Luna_SN26")
DEST = Path(__file__).resolve().parent.parent / "corpus"

TARGET_SR = 48000
SOURCE_SR = 384000
EXPANSION = SOURCE_SR // TARGET_SR  # 8

# The 384 -> 48 kHz decimation filter. This material carries real, loud energy
# above 24 kHz — ultrasonic_low routinely outweighs the audible bands — so a
# weak filter would fold all of it back as aliasing.
#
# Measured on this box against a 60 kHz tone (which folds to 12 kHz under 8:1
# decimation), floor -153.8 dB: swr default rejects 112 dB, filter_size=256
# rejects 130 dB. Adding explicit biquad lowpasses reaches the measurement
# floor but rolls off real 15-22 kHz content, so it is not worth it. libsoxr is
# not compiled into the Homebrew ffmpeg here and is not needed — 130 dB is
# already beyond what 24-bit output can represent.
RESAMPLE = f"aresample={TARGET_SR}:filter_size=256:cutoff=0.97"

# The corpus already peaks at 0.0 dBFS in places, and both filtering and
# resampling overshoot, so the global gain aims well below full scale.
CEILING_DBFS = -3.0
ULTRASONIC_BOOST_DB = 12.0
SAFETY_LIMIT = "alimiter=limit=0.9:level=disabled"

# Article 42. The only seasons this Chamber recognises, by day-of-year.
# Seca wraps the end of the ring, so it is tested first.
TEMPORADAS = (
    ("primeras_lluvias", 91, 151),
    ("medio_seco", 152, 243),
    ("segundas_lluvias", 244, 334),
)

# Article 47. Opacity as an architectural limit rather than a declaration: a
# per-clip sensitivity that the opacityFloor bus thresholds at run time. Seeded
# from CORINE habitat — intact forest and open water score highest — and meant
# to be hand-edited afterwards, since the statute vests this choice in the
# community of the territory and not in this script.
HABITAT_OPACITY = {
    "Bosque denso alto de tierra firme": 1.00,
    "Zonas pantanosas": 0.90,
    "Lagunas, lagos y ciénagas naturales": 0.85,
    "Bosque de galería y-o ripario": 0.80,
    "Vegetación secundaria alta": 0.60,
    "Vegetación secundaria baja": 0.50,
    "Plantación de latifoliadas": 0.35,
    "Cultivos permanentes arbóreos": 0.30,
    "Pastos arbolados": 0.30,
    "Mosaico de cultivos": 0.25,
    "Palma de aceite": 0.20,
    "Palmas de aceite": 0.20,
    "Pastos enmalezados": 0.20,
    "Otros cultivos transitorios": 0.15,
    "Pastos limpios": 0.10,
    "Tierras desnudas y degradadas": 0.00,
}
# Normalise the keys too, so the table cannot drift out of the form the lookup
# normalises to if this file is ever re-saved by an editor that decomposes.
HABITAT_OPACITY = {
    unicodedata.normalize("NFC", k): v for k, v in HABITAT_OPACITY.items()
}

# Article 43 as the data can honestly support it: the detector yields ecological
# roles, not taxa. The bancada bus selects among these, with 0 reserved for
# "todas", so index i here is bus position i+1.
#
# Dawn and dusk chorus share one seat: dawn alone is 6 events in 261, too few to
# convene a bancada of its own. Kept in step with BANCADA_NAMES in
# projector/phenology/breath.ts and BANCADA_MODE in projector/estratos.
BANCADA_ROLES = (
    "nocturnal_voice",
    "insect_chorus",
    "chorus_participant",
    "community_shift",
)
ROLE_TO_BANCADA = {
    "nocturnal_voice": 0,
    "insect_chorus": 1,
    "dusk_chorus_participant": 2,
    "dawn_chorus_participant": 2,
    "community_shift": 3,
}

ULTRASONIC_BANDS = ("ultrasonic_low", "ultrasonic_mid", "ultrasonic_high")

# Selection sizes for the derived tiers.
ULTRASONIC_SHARE_MIN = 0.20   # expanded/ takes events above this
EXPANDED_WINDOW_S = 20.0      # 20 s of source -> 160 s expanded
STEM_LEN_S = 60.0             # stems stay full length so the three bands align
STEMS_PER_DAY = 3             # stems/ takes the best N clips of each ring day
GRAIN_LEN_S = 2.0
GRAINS_PER_DAY = 4


def temporada(doy: int) -> str:
    """Article 42. Seca wraps the ring end (335-90)."""
    for name, lo, hi in TEMPORADAS:
        if lo <= doy <= hi:
            return name
    return "seca"


def run(cmd: list[str]) -> None:
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(
            f"ffmpeg failed ({proc.returncode})\n"
            f"  {' '.join(cmd[:12])} ...\n"
            f"{proc.stderr[-1500:]}"
        )


def probe_peak_db(path: Path) -> float | None:
    """Peak level of a file after decimation, via ffmpeg volumedetect."""
    proc = subprocess.run(
        ["ffmpeg", "-v", "info", "-i", str(path),
         "-af", f"{RESAMPLE},volumedetect",
         "-f", "null", "-"],
        capture_output=True, text=True,
    )
    match = re.search(r"max_volume:\s*(-?\d+(?:\.\d+)?) dB", proc.stderr)
    return float(match.group(1)) if match else None


# ── filter chains ───────────────────────────────────────────────────────────

def chain_audible(gain_db: float) -> str:
    return (
        f"highpass=f=15,"                       # AudioMoth DC, gently
        f"volume={gain_db:.2f}dB,"
        f"{RESAMPLE}"
    )


def chain_expanded(gain_db: float) -> str:
    # Isolate above 38 kHz at 24 dB/oct, then relabel the rate: asetrate does
    # not resample, so 384 kHz read as 48 kHz *is* the x8 expansion, and the
    # 38-192 kHz band arrives at 4.75-24 kHz.
    return (
        f"highpass=f=38000:poles=2,highpass=f=38000:poles=2,"
        # Ultrasound sits far below the audible bands, so it needs lifting to be
        # mixable. The limiter is a wrap guard for the few clips with very
        # strong bat activity, not a dynamics tool.
        f"volume={gain_db + ULTRASONIC_BOOST_DB:.2f}dB,{SAFETY_LIMIT},"
        f"asetrate={TARGET_SR}"
    )


def chain_stem(band: str, gain_db: float) -> str:
    if band == "geophony":
        return (f"lowpass=f=1000:poles=2,lowpass=f=1000:poles=2,"
                f"volume={gain_db:.2f}dB,{RESAMPLE}")
    if band == "biophony":
        return (f"highpass=f=1000:poles=2,lowpass=f=20000:poles=2,"
                f"volume={gain_db:.2f}dB,{RESAMPLE}")
    raise ValueError(band)


def render_stem_ultrasonic(src: Path, dst: Path, gain_db: float) -> None:
    """
    Heterodyne the ultrasonic band down, the way a bat detector does: multiply
    by a 38 kHz carrier and keep the difference. Unlike expanded/, this stays
    sample-aligned with the geophony and biophony stems, so the three can be
    mixed as one moment rather than three different times. It therefore runs
    the full clip length, matching its siblings.
    """
    dur = STEM_LEN_S
    run([
        "ffmpeg", "-v", "error", "-y",
        "-i", str(src),
        "-f", "lavfi", "-t", f"{dur}",
        "-i", f"aevalsrc=sin(2*PI*38000*t):s={SOURCE_SR}",
        "-filter_complex",
        "[0:a]atrim=0:{d},highpass=f=36000:poles=2,highpass=f=36000:poles=2[u];"
        "[u][1:a]amultiply[m];"
        "[m]lowpass=f=20000:poles=2,volume={g:.2f}dB,{lim},{rs}[out]".format(
            d=dur, g=gain_db + ULTRASONIC_BOOST_DB, lim=SAFETY_LIMIT, rs=RESAMPLE),
        # -f is explicit because dst is a .part temp file, whose extension
        # gives ffmpeg nothing to infer the muxer from.
        "-map", "[out]", "-c:a", "flac", "-sample_fmt", "s32", "-f", "flac",
        str(dst),
    ])


def render(job: dict) -> tuple[str, str | None]:
    """Worker. Returns (key, error-or-None)."""
    src, dst = Path(job["src"]), Path(job["dst"])
    if dst.exists() and dst.stat().st_size > 0:
        return job["key"], None
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_suffix(dst.suffix + ".part")
    try:
        if job["kind"] == "stem_ultrasonic":
            render_stem_ultrasonic(src, tmp, job["gain_db"])
        else:
            cmd = ["ffmpeg", "-v", "error", "-y"]
            # -ss and -t must both precede -i so they bound the INPUT read. As
            # output options -t would instead truncate the result, which would
            # silently defeat the x8 expansion in the expanded tier.
            if job.get("ss") is not None:
                cmd += ["-ss", f"{job['ss']:.3f}"]
            if job.get("t") is not None:
                cmd += ["-t", f"{job['t']:.3f}"]
            cmd += ["-i", str(src)]
            cmd += ["-af", job["chain"],
                    "-ar", str(TARGET_SR),
                    "-c:a", "flac", "-sample_fmt", "s32", "-f", "flac",
                    str(tmp)]
            run(cmd)
        tmp.replace(dst)
        return job["key"], None
    except Exception as exc:  # noqa: BLE001 - reported, not raised, per file
        tmp.unlink(missing_ok=True)
        return job["key"], str(exc)


# ── corpus scan ─────────────────────────────────────────────────────────────

def load_daily_series() -> dict[str, dict]:
    """phenological_series.csv, keyed by ISO date. Already carries cv_* 0-1."""
    path = SOURCE / "phenological_series.csv"
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as fh:
        return {row["date"]: row for row in csv.DictReader(fh)}


def scan() -> list[dict]:
    """One record per clip that exists on disk, with everything the ring needs."""
    daily = load_daily_series()
    records: list[dict] = []

    for events_path in sorted(SOURCE.glob("*/events.json")):
        folder = events_path.parent
        try:
            meta = json.loads(events_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            print(f"  ! skipping {folder.name}: {exc}", file=sys.stderr)
            continue

        stamp = meta.get("recording_datetime")
        if not stamp:
            continue
        when = datetime.fromisoformat(stamp)
        doy = when.timetuple().tm_yday
        iso = when.date().isoformat()
        # NFC, and not optionally. The detector's events.json carries habitat
        # names in NFD — macOS writes decomposed filenames and the strings came
        # from a directory tree — so "galería" arrives as g-a-l-e-r-i+◌́-a while
        # HABITAT_OPACITY below is keyed in composed form. Same glyphs, different
        # bytes, and dict lookup is byte equality: every accented habitat missed
        # and fell through to the 0.4 default.
        #
        # That is not a cosmetic bug. It is Article 47 scored wrong for 105 of
        # 261 clips, 90 of them UNDER-protected — Bosque de galería (47 clips)
        # should be 0.80 and Lagunas/ciénagas (33) should be 0.85, the two most
        # sensitive habitats in the survey, both stored as 0.4 and therefore
        # audible and projectable at opacity floors that should have withheld
        # them.
        habitat = unicodedata.normalize("NFC", meta.get("habitat", ""))
        day = daily.get(iso, {})

        def cv(field: str) -> float:
            raw = day.get(f"cv_{field}")
            try:
                return float(raw)
            except (TypeError, ValueError):
                return 0.0

        for event in meta.get("events", []):
            rel = event.get("clip_path")
            if not rel:
                continue
            clip = folder / rel
            if not clip.exists():
                continue

            bands = event.get("band_energies", {}) or {}
            total = sum(v for v in bands.values() if isinstance(v, (int, float)))
            ultra = sum(bands.get(b, 0.0) for b in ULTRASONIC_BANDS)
            share = (ultra / total) if total > 0 else 0.0
            opacity = HABITAT_OPACITY.get(habitat, 0.4)
            role = event.get("role", "")
            key = f"{folder.name}_{event.get('event_index', 0):03d}"

            records.append({
                "key": key,
                "source": str(clip),
                "doy": doy,
                "date": iso,
                "hour": when.hour,
                # Article 42, derived from day-of-year. The corpus's own binary
                # "Época lluvias/seca" label is not one of the four temporadas
                # this Chamber recognises, so it is not used here.
                "temporada": temporada(doy),
                "habitat": habitat,
                "role": role,
                "domain": event.get("domain", ""),
                "bancada": ROLE_TO_BANCADA.get(role, -1),
                "temperature_c": meta.get("temperature_c"),
                "confidence": float(event.get("confidence") or 0.0),
                "centroid": float(event.get("centroid") or 0.0),
                "flatness": float(event.get("flatness") or 0.0),
                "periodicity": float(event.get("periodicity") or 0.0),
                "onset_s": float(event.get("onset_s") or 0.0),
                "offset_s": float(event.get("offset_s") or 0.0),
                "duration_s": float(event.get("duration_s") or 0.0),
                "aci": float(event.get("aci") or 0.0),
                "ndsi": float(event.get("ndsi") or 0.0),
                "ultrasonic_share": round(share, 4),
                "opacity": opacity,
                # Hard withholding, independent of the graded opacityFloor.
                "opaque": opacity >= 1.0,
                "cv_activity": cv("activity"),
                "cv_richness": cv("richness"),
                "cv_biophony": cv("biophony"),
                "cv_ndsi": cv("ndsi"),
                "cv_aci": cv("aci"),
            })

    records.sort(key=lambda r: (r["doy"], r["date"], r["key"]))
    return records


def select(records: list[dict]) -> None:
    """Mark which records feed the expanded/, stems/ and grains/ tiers."""
    for rec in records:
        rec["want_expanded"] = rec["ultrasonic_share"] >= ULTRASONIC_SHARE_MIN
        rec["want_stems"] = False
        rec["want_grain"] = False

    by_doy: dict[int, list[dict]] = {}
    for rec in records:
        by_doy.setdefault(rec["doy"], []).append(rec)

    for group in by_doy.values():
        ranked = sorted(group, key=lambda r: -r["confidence"])
        for rec in ranked[:STEMS_PER_DAY]:
            rec["want_stems"] = True
        for rec in ranked[:GRAINS_PER_DAY]:
            rec["want_grain"] = True


def build_jobs(records: list[dict], gain_db: float, tiers: set[str]) -> list[dict]:
    jobs: list[dict] = []
    for rec in records:
        src, key = rec["source"], rec["key"]

        if "audible" in tiers:
            dst = DEST / "audible" / f"{key}.flac"
            rec["audible"] = str(dst.relative_to(DEST))
            jobs.append({"key": f"audible/{key}", "kind": "simple", "src": src,
                         "dst": str(dst), "chain": chain_audible(gain_db)})

        if "expanded" in tiers and rec["want_expanded"]:
            dst = DEST / "expanded" / f"{key}.flac"
            rec["expanded"] = str(dst.relative_to(DEST))
            # Window the source around the event, then let asetrate stretch it.
            start = max(0.0, min(rec["onset_s"], 60.0 - EXPANDED_WINDOW_S))
            jobs.append({"key": f"expanded/{key}", "kind": "simple", "src": src,
                         "dst": str(dst), "chain": chain_expanded(gain_db),
                         "ss": start, "t": EXPANDED_WINDOW_S})

        if "stems" in tiers and rec["want_stems"]:
            rec["stems"] = {}
            for band in ("geophony", "biophony"):
                dst = DEST / "stems" / band / f"{key}.flac"
                rec["stems"][band] = str(dst.relative_to(DEST))
                jobs.append({"key": f"stems/{band}/{key}", "kind": "simple",
                             "src": src, "dst": str(dst),
                             "chain": chain_stem(band, gain_db)})
            dst = DEST / "stems" / "ultrasonic" / f"{key}.flac"
            rec["stems"]["ultrasonic"] = str(dst.relative_to(DEST))
            jobs.append({"key": f"stems/ultrasonic/{key}", "kind": "stem_ultrasonic",
                         "src": src, "dst": str(dst), "gain_db": gain_db})

        if "grains" in tiers and rec["want_grain"]:
            dst = DEST / "grains" / f"{key}.flac"
            rec["grain"] = str(dst.relative_to(DEST))
            start = max(0.0, min(rec["onset_s"], 60.0 - GRAIN_LEN_S))
            jobs.append({"key": f"grains/{key}", "kind": "simple", "src": src,
                         "dst": str(dst), "chain": chain_audible(gain_db),
                         "ss": start, "t": GRAIN_LEN_S})

    return jobs


def write_manifest(records: list[dict], gain_db: float) -> Path:
    """
    One flat array on the 365-day ring, plus the ring summary SuperCollider
    needs to know where the silences are without walking every record.
    """
    days: dict[int, dict] = {}
    for rec in records:
        day = days.setdefault(rec["doy"], {
            "doy": rec["doy"], "date": rec["date"],
            "temporada": rec["temporada"], "clips": 0,
            "cv_activity": rec["cv_activity"],
            "cv_richness": rec["cv_richness"],
            "cv_biophony": rec["cv_biophony"],
        })
        day["clips"] += 1

    recorded = sorted(days)
    # Distance from every ring position to the nearest recorded day, measured
    # around the ring rather than along a line. Article 44: this is what gives
    # absence its shape, and it is what absenceWeight scales.
    gap_depth = []
    for doy in range(1, 366):
        gap_depth.append(min(
            min(abs(doy - r), 365 - abs(doy - r)) for r in recorded
        ) if recorded else 365)

    manifest = {
        "generated": datetime.now().astimezone().isoformat(timespec="seconds"),
        "source": str(SOURCE),
        "target_sample_rate": TARGET_SR,
        "source_sample_rate": SOURCE_SR,
        "expansion_factor": EXPANSION,
        "global_gain_db": round(gain_db, 2),
        "bancada_roles": list(BANCADA_ROLES),
        "temporadas": {
            "seca": [335, 90], "primeras_lluvias": [91, 151],
            "medio_seco": [152, 243], "segundas_lluvias": [244, 334],
        },
        "ring": {
            "recorded_days": recorded,
            "gap_depth": gap_depth,
            "days": [days[d] for d in recorded],
        },
        "clips": records,
    }

    DEST.mkdir(parents=True, exist_ok=True)
    path = DEST / "manifest.json"
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    return path


def summarise(records: list[dict]) -> None:
    from collections import Counter

    per_temporada = Counter(r["temporada"] for r in records)
    span = {"seca": 121, "primeras_lluvias": 61, "medio_seco": 92, "segundas_lluvias": 91}
    days = {t: len({r["doy"] for r in records if r["temporada"] == t}) for t in span}

    print(f"\n  clips              {len(records)}")
    print(f"  ring days recorded {len({r['doy'] for r in records})} of 365")
    print(f"  {'temporada':<18}{'days':>6}{'recorded':>10}{'coverage':>10}{'clips':>8}")
    for t, total in span.items():
        print(f"  {t:<18}{total:>6}{days[t]:>10}{days[t] / total * 100:>9.0f}%"
              f"{per_temporada[t]:>8}")

    expanded = sum(1 for r in records if r["want_expanded"])
    stems = sum(1 for r in records if r["want_stems"])
    grains = sum(1 for r in records if r["want_grain"])
    opaque = sum(1 for r in records if r["opaque"])
    print(f"\n  audible   {len(records):>4}  ~{len(records) * 5.2 / 1024:.2f} GB")
    print(f"  expanded  {expanded:>4}  ~{expanded * 13.9 / 1024:.2f} GB   "
          f"(ultrasonic share >= {ULTRASONIC_SHARE_MIN})")
    print(f"  stems     {stems:>4}  ~{stems * 3 * 5.2 / 1024:.2f} GB   "
          f"({STEMS_PER_DAY}/day x 3 bands)")
    print(f"  grains    {grains:>4}  ~{grains * 0.18 / 1024:.2f} GB")
    print(f"\n  opaque (Art. 47 hard withhold)  {opaque}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true",
                    help="scan, report counts and projected sizes, write nothing")
    ap.add_argument("--tiers", default="audible,expanded,stems,grains",
                    help="comma-separated subset to render")
    ap.add_argument("--jobs", type=int, default=8, help="parallel ffmpeg workers")
    ap.add_argument("--gain-probe", type=int, default=40,
                    help="clips sampled to measure the single global gain")
    args = ap.parse_args()

    if not shutil.which("ffmpeg"):
        print("ffmpeg not found on PATH", file=sys.stderr)
        return 1
    if not SOURCE.exists():
        print(f"corpus not found: {SOURCE}", file=sys.stderr)
        return 1

    tiers = {t.strip() for t in args.tiers.split(",") if t.strip()}

    print(f"scanning {SOURCE} ...")
    records = scan()
    if not records:
        print("no clips found", file=sys.stderr)
        return 1
    select(records)
    summarise(records)

    # One gain for the whole corpus, never per clip. A quiet dry-season night
    # has to stay quiet against a rainy insect chorus — activity and richness
    # are precisely the signal per-clip normalisation would flatten.
    print(f"\nmeasuring global gain over {args.gain_probe} clips ...")
    step = max(1, len(records) // args.gain_probe)
    peaks = [p for p in (probe_peak_db(Path(r["source"]))
                         for r in records[::step]) if p is not None]
    gain_db = (CEILING_DBFS - max(peaks)) if peaks else 0.0
    print(f"  loudest sampled peak {max(peaks):.1f} dBFS"
          f"  ->  global gain {gain_db:+.2f} dB (ceiling {CEILING_DBFS:.0f} dBFS)")

    jobs = build_jobs(records, gain_db, tiers)
    print(f"\n{len(jobs)} render jobs across tiers: {', '.join(sorted(tiers))}")

    if args.dry_run:
        print("\n--dry-run: nothing written.")
        return 0

    done = failed = skipped = 0
    errors: list[tuple[str, str]] = []
    with ProcessPoolExecutor(max_workers=args.jobs) as pool:
        futures = {pool.submit(render, j): j for j in jobs}
        for future in as_completed(futures):
            key, err = future.result()
            if err:
                failed += 1
                errors.append((key, err))
            else:
                done += 1
            if (done + failed) % 25 == 0 or (done + failed) == len(jobs):
                print(f"  {done + failed}/{len(jobs)}  ok={done} failed={failed}",
                      flush=True)

    for key, err in errors[:10]:
        print(f"\n  ! {key}\n    {err.splitlines()[-1] if err else ''}", file=sys.stderr)
    if len(errors) > 10:
        print(f"  ... and {len(errors) - 10} more", file=sys.stderr)

    # Drop tier paths that did not actually render, so SC never cues a missing file.
    for rec in records:
        for field in ("audible", "expanded", "grain"):
            rel = rec.get(field)
            if rel and not (DEST / rel).exists():
                rec.pop(field, None)
        if "stems" in rec:
            rec["stems"] = {b: p for b, p in rec["stems"].items()
                            if (DEST / p).exists()}
            if not rec["stems"]:
                rec.pop("stems")
        for flag in ("want_expanded", "want_stems", "want_grain"):
            rec.pop(flag, None)

    path = write_manifest(records, gain_db)
    total = sum(f.stat().st_size for f in DEST.rglob("*.flac"))
    print(f"\nmanifest  {path}")
    print(f"rendered  {done} files, {total / 1024**3:.2f} GB in {DEST}")
    if failed:
        print(f"failed    {failed} (re-run to retry; completed files are skipped)")
    return 1 if failed and done == 0 else 0


if __name__ == "__main__":
    sys.exit(main())
