#!/usr/bin/env python3
"""mixcheck.py — how a take (or a clip's WAV) sits as a MIX, measured.

The same measurements that diagnosed the engine's mud, as one command, so a
change to the mix (MEZCLA / mixCarve in SuperCollider) is judged by numbers
and not only by ear in a room that is not the dome:

  loudness   integrated LUFS, loudness range, true peak (EBU R128)
  crest      peak against RMS: isolated hits nothing is holding
  bands      octave-band levels relative to 40-80 Hz, against the slope a
             mixed electronic track tends to follow above 100 Hz
  width      side against mid per band: the lows should be mono
  infra      energy under 30 Hz, which a dome's subs turn into rumble

  python3 tools/mixcheck.py recordings/<take>.wav [--from 0] [--dur 120]
  python3 tools/mixcheck.py <wav> --ref <reference.wav>    side by side

Only ffmpeg is needed. Mid/side are taken from the first two channels (L R of
a stereo take, of the quad, or of a 5.1); bands and loudness from the whole.
"""

import argparse
import re
import subprocess
import sys

BANDS = [(20, 40), (40, 80), (80, 160), (160, 320), (320, 640), (640, 1280),
         (1280, 2560), (2560, 5120), (5120, 12000)]
NAMES = ["sub", "bajo", "bajo-alto", "medio-bajo", "medio", "medio-alto",
         "presencia", "brillo", "aire"]


def ff(path, start, dur, af, extra=()):
    cmd = ["ffmpeg", "-hide_banner", "-nostats", "-ss", str(start)]
    if dur:
        cmd += ["-t", str(dur)]
    cmd += ["-i", path, *extra, "-af", af, "-f", "null", "-"]
    return subprocess.run(cmd, capture_output=True, text=True).stderr


def rms(path, start, dur, chain):
    out = ff(path, start, dur, chain + ",astats=metadata=0")
    vals = re.findall(r"RMS level dB:\s*(-?[\d.]+|-inf)", out)
    v = vals[-1] if vals else "-inf"
    return float("-inf") if v == "-inf" else float(v)


def measure(path, start, dur):
    r = {}
    out = ff(path, start, dur, "ebur128=peak=true")
    s = out[out.rfind("Summary"):]
    num = lambda pat: float(re.search(pat, s).group(1)) if re.search(pat, s) else float("nan")
    r["lufs"] = num(r"I:\s+(-?[\d.]+) LUFS")
    r["lra"] = num(r"LRA:\s+(-?[\d.]+) LU")
    r["tp"] = num(r"Peak:\s+(-?[\d.]+) dBFS")
    st = ff(path, start, dur, "pan=mono|c0=0.5*c0+0.5*c1,astats=metadata=0")
    pk = re.findall(r"Peak level dB:\s*(-?[\d.]+)", st)
    rm = re.findall(r"RMS level dB:\s*(-?[\d.]+)", st)
    r["crest"] = float(pk[-1]) - float(rm[-1]) if pk and rm else float("nan")
    mono = "aformat=channel_layouts=mono"
    r["bands"] = [rms(path, start, dur,
                      f"{mono},highpass=f={lo}:poles=2,highpass=f={lo}:poles=2,"
                      f"lowpass=f={hi}:poles=2,lowpass=f={hi}:poles=2") for lo, hi in BANDS]
    r["width"] = []
    for lo, hi in [(20, 120), (120, 500), (500, 4000), (4000, 16000)]:
        f = f"highpass=f={lo},lowpass=f={hi},astats=metadata=0"
        m = rms(path, start, dur, f"pan=mono|c0=0.5*c0+0.5*c1,{f.rsplit(',', 1)[0]}")
        sd = rms(path, start, dur, f"pan=mono|c0=0.5*c0-0.5*c1,{f.rsplit(',', 1)[0]}")
        r["width"].append(((lo, hi), m, sd))
    r["infra"] = rms(path, start, dur, f"{mono},lowpass=f=30,lowpass=f=30")
    return r


def verdicts(r):
    b = r["bands"]
    ref = b[1]                                   # 40-80 Hz
    v = []
    v.append(("medios bajos bajo el bajo", b[3] <= ref - 3,
              f"160-320 Hz {b[3] - ref:+.1f} dB vs 40-80 (≤ −3)"))
    pres = (b[6] + b[7]) / 2
    v.append(("presencia audible", pres >= ref - 16,
              f"1.3-5 kHz {pres - ref:+.1f} dB vs 40-80 (≥ −16)"))
    lo = r["width"][0]
    v.append(("graves en mono", lo[2] <= lo[1] - 15,
              f"lado {lo[2] - lo[1]:+.1f} dB bajo 120 Hz (≤ −15)"))
    v.append(("sin rumble", r["infra"] <= ref - 12,
              f"< 30 Hz {r['infra'] - ref:+.1f} dB vs 40-80 (≤ −12)"))
    # Peak over RMS in dB. 12 would be a squashed master; a dynamic electronic
    # mix sits around 14-18. (The engine's take of 2026-10-05: 25.7.)
    v.append(("picos contenidos", r["crest"] <= 18,
              f"cresta {r['crest']:.1f} dB (≤ 18)"))
    return v


def report(path, r, other=None):
    print(f"\n{path}")
    print(f"  {r['lufs']:.1f} LUFS · LRA {r['lra']:.1f} · true peak {r['tp']:.1f} dBTP · cresta {r['crest']:.1f} dB")
    ref = r["bands"][1]
    print("  banda              nivel   vs 40-80" + ("    ref vs 40-80" if other else ""))
    for i, ((lo, hi), name) in enumerate(zip(BANDS, NAMES)):
        line = f"  {name:<11}{lo:>5}-{hi:<5} {r['bands'][i]:7.1f}  {r['bands'][i] - ref:+7.1f}"
        if other:
            line += f"   {other['bands'][i] - other['bands'][1]:+7.1f}"
        print(line)
    print("  ancho (lado vs centro)")
    for (lo, hi), m, sd in r["width"]:
        print(f"    {lo:>5}-{hi:<5} Hz  {sd - m:+6.1f} dB")
    print(f"  bajo 30 Hz {r['infra']:.1f} dB")
    for name, ok, why in verdicts(r):
        print(f"  {'✔' if ok else '✘'} {name:<26} {why}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("wav")
    ap.add_argument("--from", dest="start", type=float, default=0)
    ap.add_argument("--dur", type=float, default=120, help="seconds measured (0 = all)")
    ap.add_argument("--ref", help="a reference to compare against")
    a = ap.parse_args()
    r = measure(a.wav, a.start, a.dur)
    o = measure(a.ref, 0, a.dur) if a.ref else None
    report(a.wav, r, o)
    if o:
        report(a.ref, o)


if __name__ == "__main__":
    sys.exit(main())
