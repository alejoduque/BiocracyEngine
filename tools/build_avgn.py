#!/usr/bin/env python3
"""
Build the corpus's vocal latent space, after AVGN (Sainburg, Thielk & Gentner,
"Finding, visualizing, and quantifying latent structure across diverse animal
vocal repertoires", PLOS Comp Biol 2020; github.com/timsainb/AVGN, MIT).

AVGN's pipeline, applied to the AudioMoth corpus instead of birdsong:

  1. segmentation  dynamic thresholding: each band's floor (the chorus that
                   never stops) is removed, then the loudest-bin envelope is
                   cut at a level that rises until every unit is shorter than
                   MAX_UNIT_S. A swell still too long is cut into MAX_UNIT_S
                   pieces (a chained unit).
  2. units         each unit as a log-mel spectrogram, normalised, padded and
                   resampled to a fixed MELS x FRAMES tile.
  3. projection    UMAP of the tiles, twice: 3-D (slot 2) and 2-D (slot O).
  4. clusters      HDBSCAN on the 2-D projection, as in the paper; the
                   noise points stay label -1.
  5. sequences     each clip's units in time order — the transitions AVGN
                   draws as lines through the projection.

The generative part of AVGN (the autoencoders) is not run: the instrument shows
the projection and its clusters, not decoded spectrograms.

Article 47: a clip marked opaque (opacity 1.0) is never analysed — its vocal
structure is the sensitive part. Every other unit carries its clip's opacity,
so the projector can withhold it at the same opacityFloor SuperCollider uses.

Output: corpus/avgn.json (columnar, ~0.5 MB), read by the projector at
/corpus/avgn.json. The audio is opened read-only.

Needs numpy, scipy, soundfile, librosa, scikit-learn (HDBSCAN) and umap-learn:
    pip install numpy scipy soundfile librosa scikit-learn umap-learn

Usage:
    python3 tools/build_avgn.py
    python3 tools/build_avgn.py --jobs 8 --seed 7
"""

from __future__ import annotations

import argparse
import base64
import json
import sys
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
CORPUS = ROOT / "corpus"
MANIFEST = CORPUS / "manifest.json"
OUT = CORPUS / "avgn.json"

SR = 48000
N_FFT = 1024
HOP = 240                       # 5 ms
F_LO, F_HI = 300.0, 20000.0
MELS = 32
FRAMES = 24                     # every unit is resampled to this many columns

# Dynamic thresholding (after AVGN's dynamic_threshold_segmentation), in dB
# above each band's own floor.
LEVEL_DB = 6.0
LEVEL_DB_CEIL = 30.0
LEVEL_STEP_DB = 3.0
MIN_UNIT_S = 0.03
MAX_UNIT_S = 0.6
MAX_UNITS_PER_CLIP = 40         # the loudest, so a chorus does not swamp the map


def log_mel(y: np.ndarray):
    import librosa
    S = np.abs(librosa.stft(y, n_fft=N_FFT, hop_length=HOP, win_length=N_FFT)) ** 2
    mel = librosa.feature.melspectrogram(S=S, sr=SR, n_mels=MELS, fmin=F_LO, fmax=F_HI)
    db = librosa.power_to_db(mel, ref=np.max)          # 0 dB = the clip's loudest bin
    return db, S


def segment(db: np.ndarray) -> list[tuple[int, int]]:
    """Frames [on, off) of each unit, raising the cut until none is too long.

    A night in the forest is never silent: the chorus sits under every call.
    So, as AVGN does with its noise reduction, each band's own floor (its
    median over the clip) is taken away first; what stands above it is the
    calling. AVGN then moves the cut until every unit fits; here the cut
    starts low, LEVEL_DB above the floor, and rises.
    """
    max_f = int(MAX_UNIT_S * SR / HOP)
    min_f = max(1, int(MIN_UNIT_S * SR / HOP))
    above = (db - np.median(db, axis=1, keepdims=True)).max(axis=0)
    above = np.convolve(above, np.ones(3) / 3, mode="same")
    units: list[tuple[int, int]] = []
    level = LEVEL_DB
    while level <= LEVEL_DB_CEIL:
        on = above > level
        edges = np.flatnonzero(np.diff(np.concatenate([[0], on.astype(np.int8), [0]])))
        units = [(a, b) for a, b in zip(edges[::2], edges[1::2]) if b - a >= min_f]
        if units and all(b - a <= max_f for a, b in units):
            break
        level += LEVEL_STEP_DB
    # A unit still too long at the ceiling is a chorus swell: chain it.
    out: list[tuple[int, int]] = []
    for a, b in units:
        while b - a > max_f:
            out.append((a, a + max_f))
            a += max_f
        if b - a >= min_f:
            out.append((a, b))
    return out


def tile(db: np.ndarray, a: int, b: int) -> np.ndarray:
    """The unit as a MELS x FRAMES tile in 0..1 (log-resized in time, as AVGN pads)."""
    seg = db[:, a:b]
    seg = np.clip((seg - seg.max() + 60.0) / 60.0, 0, 1)
    src = np.linspace(0, seg.shape[1] - 1, FRAMES)
    lo = np.floor(src).astype(int)
    hi = np.minimum(lo + 1, seg.shape[1] - 1)
    t = src - lo
    return (seg[:, lo] * (1 - t) + seg[:, hi] * t).astype(np.float32)


def analyse(job: tuple[int, str]):
    import soundfile as sf
    idx, path = job
    y, sr = sf.read(path, dtype="float32", always_2d=False)
    if y.ndim > 1:
        y = y.mean(axis=1)
    if sr != SR or len(y) < N_FFT * 4:
        return idx, []
    db, S = log_mel(y)
    freqs = np.fft.rfftfreq(N_FFT, 1.0 / SR)
    band = (freqs >= F_LO) & (freqs <= F_HI)
    units = []
    for a, b in segment(db):
        loud = float(db[:, a:b].max())
        spec = S[band, a:b].sum(axis=1)
        peak = float(freqs[band][int(np.argmax(spec))])
        units.append((a, b, loud, peak, tile(db, a, b)))
    units.sort(key=lambda u: -u[2])
    units = sorted(units[:MAX_UNITS_PER_CLIP], key=lambda u: u[0])
    return idx, [(a * HOP / SR, (b - a) * HOP / SR, peak, t) for a, b, _, peak, t in units]


def unit_scale(p: np.ndarray) -> np.ndarray:
    """Centre on the median and fit the 98th-percentile radius to 1."""
    p = p - np.median(p, axis=0)
    r = np.percentile(np.linalg.norm(p, axis=1), 98)
    return p / max(r, 1e-6)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--jobs", type=int, default=6)
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()

    import umap
    from sklearn.cluster import HDBSCAN

    manifest = json.loads(MANIFEST.read_text())
    clips = [c for c in manifest["clips"] if not c.get("opaque") and c.get("audible")]
    veiled = sum(1 for c in manifest["clips"] if c.get("opaque"))
    jobs = [(i, str(CORPUS / c["audible"])) for i, c in enumerate(clips) if (CORPUS / c["audible"]).exists()]
    print(f"{len(jobs)} clips ({veiled} opaque, not analysed)", file=sys.stderr)

    per_clip: dict[int, list] = {}
    with ProcessPoolExecutor(max_workers=args.jobs) as ex:
        for n, (i, units) in enumerate(ex.map(analyse, jobs, chunksize=4), 1):
            per_clip[i] = units
            if n % 25 == 0:
                print(f"  {n}/{len(jobs)}", file=sys.stderr)

    rows = []   # (clip, t, d, peak)
    tiles = []
    for i in sorted(per_clip):
        for t, d, peak, tl in per_clip[i]:
            rows.append((i, t, d, peak))
            tiles.append(tl.ravel())
    X = np.stack(tiles)
    print(f"{len(X)} units; UMAP…", file=sys.stderr)

    p3 = unit_scale(umap.UMAP(n_components=3, n_neighbors=15, min_dist=0.25, random_state=args.seed).fit_transform(X))
    p2 = unit_scale(umap.UMAP(n_components=2, n_neighbors=15, min_dist=0.25, random_state=args.seed).fit_transform(X))
    labels = HDBSCAN(min_cluster_size=max(10, len(X) // 100), min_samples=5).fit_predict(p2)
    k = int(labels.max()) + 1
    print(f"{k} clusters, {int((labels < 0).sum())} unclustered", file=sys.stderr)

    # Clusters, largest first, renumbered so C1 is the commonest unit.
    order = sorted(range(k), key=lambda c: -int((labels == c).sum()))
    renum = {old: new for new, old in enumerate(order)}
    lab = np.array([renum.get(int(l), -1) for l in labels])
    clusters = []
    for c in range(k):
        m = np.flatnonzero(lab == c)
        roles: dict[str, int] = {}
        for j in m:
            r = clips[rows[j][0]]["role"]
            roles[r] = roles.get(r, 0) + 1
        role, nrole = max(roles.items(), key=lambda kv: kv[1])
        hours = [clips[rows[j][0]]["hour"] for j in m]
        c3, c2 = p3[m].mean(axis=0), p2[m].mean(axis=0)
        # Exemplars: the units nearest the centre, as AVGN's spectrogram insets.
        ex = m[np.argsort(np.linalg.norm(p2[m] - c2, axis=1))[:6]]
        mean_tile = X[m].mean(axis=0)
        clusters.append({
            "id": c + 1,
            "n": int(len(m)),
            "clips": len({rows[j][0] for j in m}),
            "role": role,
            "share": round(nrole / len(m), 3),
            "hz": int(np.median([rows[j][3] for j in m])),
            "ms": int(np.median([rows[j][2] for j in m]) * 1000),
            "hour": int(np.bincount(hours).argmax()),
            "c3": [round(float(v), 3) for v in c3],
            "c2": [round(float(v), 3) for v in c2],
            "ex": [int(j) for j in ex],
            # The cluster's mean spectrogram, MELS x FRAMES, row 0 = lowest band.
            "spec": base64.b64encode((np.clip(mean_tile, 0, 1) * 255).astype(np.uint8).tobytes()).decode(),
        })

    out = {
        "generated": datetime.now().astimezone().isoformat(timespec="seconds"),
        "method": "AVGN (Sainburg et al. 2020): dynamic-threshold segmentation, log-mel units, UMAP, HDBSCAN",
        "params": {
            "sr": SR, "n_fft": N_FFT, "hop": HOP, "f_lo": F_LO, "f_hi": F_HI, "mels": MELS, "frames": FRAMES,
            "level_db": [LEVEL_DB, LEVEL_DB_CEIL], "max_unit_s": MAX_UNIT_S,
            "umap": {"n_neighbors": 15, "min_dist": 0.25, "seed": args.seed},
        },
        "veiled": veiled,
        "clips": [{"key": c["key"], "opacity": c.get("opacity", 0), "role": c["role"], "bancada": c.get("bancada", -1),
                   "doy": c["doy"], "hour": c["hour"]} for c in clips],
        # One entry per unit, in clip and time order; a clip's units are its sequence.
        "units": {
            "clip": [r[0] for r in rows],
            "t": [round(r[1], 3) for r in rows],
            "d": [round(r[2], 3) for r in rows],
            "hz": [int(r[3]) for r in rows],
            "p3": [round(float(v), 3) for v in p3.ravel()],
            "p2": [round(float(v), 3) for v in p2.ravel()],
            "c": [int(v) + 1 if v >= 0 else 0 for v in lab],
        },
        "clusters": clusters,
    }
    OUT.write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False))
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
