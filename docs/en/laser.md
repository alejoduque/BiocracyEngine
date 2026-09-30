← [README](../../README.en.md) · [Español](../es/laser.md)

# Laser projection (ILDA / Helios DAC)

Projects the engine's **vector** geometry onto a real-world forest. Lasers draw sparse bright strokes (not rasterised images), so the browser sends a small laser-friendly scene — not the 3-D framebuffer.

```
browser laserTap ──WS:3337──► laser-bridge.js ──USB──► Helios DAC ──► laser
                                     └──────────────► frames.ild (ILDA fmt 5)
```

**Enable:** `LASER=1 ./start_ecosystem.sh` (off by default). With no DAC and no native binding it runs **DRY** (logs only) — safe to start anywhere.

**Frame contract** (browser → bridge): normalised, centre `(0,0)`, `x,y ∈ −1..1`.

```json
{ "type":"laserFrame", "pps":30000,
  "points":[ {"x":-0.8,"y":0.0,"r":0,"g":200,"b":90,"blank":false}, … ] }
```

**Frame source** (`src/projector/laserTap.ts`, started by `parliamentEntry.init`):

1. `window.__laserFrame` — any module may publish its own vector scene.
2. **slot-P default** — the phenological **year-ring** + a marker at today's active species (`window.__activeSpecies`). A **sensitive** species is *not* drawn: the opacity clause (Glissant) extended into physical space — the vulnerable being is never cast onto the real forest.

## What gets projected: the pulsar plot

Stacked ridgelines — the *Unknown Pleasures* / B1919+21 image. Successive observations of the same object drawn one above another, so a pattern invisible in a single pass emerges from the stack. `pulsarPlot.ts` publishes `window.__laserFrame`, which `laserTap.ts` already prefers over its year-ring default.

**Four sources**, ticked independently from the SC GUI (`/laser/src/*`, registry-backed so presets carry them). Each draws in its own hue so a mixed stack stays legible. **With none ticked the year ring returns** — that is how the ring stays reachable without a control of its own.

| Tick | OSC | One row is | Hue |
|---|---|---|---|
| `MIX` | `/laser/src/mix` | a spectrum snapshot of everything sounding | green |
| `CORPUS` | `/laser/src/corpus` | the same, over the corpus bus alone — the forest's own voice | amber |
| `DÍA` | `/laser/src/ring` | the corpus spectrum measured while a `/pheno/clip` day is sounding | blue |
| `CHAIN` | `/laser/src/chain` | a block's worth of transactions; x is arrival order, height is the bid | red |

Article 47 is carried, not re-litigated: an opaque clip is never announced, and a **sensitive** species contributes no row at all — the same refusal `laserTap.ts` already makes for the ring.

### Why six rows, and why serpentine

The galvo limits make this a **path-length** problem. Every point is scanned `FRAME_HZ` times a second, so a frame gets a fixed quantity of ink:

```
ink per frame = OMEGA_MAX / FRAME_HZ / deg_per_unit
              = 10000 / 30 / 22.5  =  14.8 normalised units
```

A full-width row costs ~1.5 units before it wiggles. **The album's 80 rows would need ~420 units.** Six is the ceiling, so the depth of the stack lives in *time* — the plot scrolls, and the pattern emerges for someone who watches rather than glances.

Two things are load-bearing rather than stylistic:

- **Serpentine scanning.** Drawing every row left-to-right means retracing the full width between them, and the mirror travels that whether the beam is on or not. Measured: 19.36 units, **131 % of budget → whole frame blanked**. Alternating direction makes the only inter-row move the row step. Serpentine: 12.03 units, 81 %.
- **Arc-length sampling.** Spacing points evenly in *x* and sizing that spacing to the step limit leaves nothing for the vertical component, so every sloped segment exceeds the limit and gets interpolated. Measured: a 516-point frame became **1041**, and a path using only 77 % of the ink budget hit **128 %** of the point budget and was blanked.

The generator is **self-budgeting** — it sheds the oldest row until the frame fits, *before* sending. Auto-blanking is a safety net, and content that lands in the net is content that is not being projected. Measured end to end: 646 points, **81 % scan budget, 0 over-speed, nothing blanked**.

## Scanner limits (Unity RAW 1.7 W, DMX + ILDA)

A laser projector is driven **by a waveform**: at the DAC's point rate each point is one sample, X on the left channel and Y on the right. The limits below come from the fixture datasheet, and every one is an env var.

`Scan Speed 30 kpps @ 8°` is a **rate–angle pair, not a rate**. A scanner that tracks 30 000 points/s across 8° cannot track 30 000 points/s across 45° — the mirror has five times as far to travel per point. So the step limit is derived from an angular-velocity ceiling rather than picked:

```
OMEGA_MAX  = RATED_ANGLE × RATED_PPS / TRAVERSE_PTS    =  8° × 30000 / 24  =  10 000 °/s
MAX_STEP   = OMEGA_MAX / pps / (SCAN_ANGLE / 2)        ≈  0.0185 at 24 kpps
```

`TRAVERSE_PTS` is the one figure the datasheet does not publish (the ILDA test pattern's point count) and is set deliberately low, putting the ceiling at the **bottom** of the range a 30 K scanner is credited with.

| Env | Default | Source |
|---|---|---|
| `LASER_PPS` | `24000` | derated to 80 % of the rating; clamped to `LASER_RATED_PPS` |
| `LASER_RATED_PPS` | `30000` | *Scan Speed 30 kpps @ 8°* |
| `LASER_RATED_ANGLE` | `8` | the angle that rating is quoted at |
| `LASER_SCAN_ANGLE` | `45` | *Scan Angle 45°*, full field |
| `LASER_TRAVERSE_PTS` | `24` | modelling constant — lower = more headroom |
| `LASER_POWER_W` | `1.7` | *Power > 1.7 W* |
| `LASER_BEAM_MM` / `LASER_DIVERGE` | `5` / `1.1` | *Beam 5 × 3 mm*, *< 1.1 mrad* |
| `LASER_THROW_M` / `LASER_DWELL_MS` | `10` / `1.0` | projection distance; dwell window |
| `LASER_MAX_STEP` | *(unset)* | override only — unset, it is computed above |

**Dwell** is physical, not a guessed epsilon: the beam must clear **its own width** at the throw distance within `LASER_DWELL_MS`, or successive points are landing in the same spot.

## Auto-blanking

Interpolation makes most jumps survivable but cannot make *every* frame compliant — `LASER_MAX_POINTS` and the scan budget are hard ceilings. Past them the beam is **switched off** rather than projected, targeted wherever targeting is meaningful:

| Fault | Response |
|---|---|
| **over-speed** | blank the point being jumped to — the mirrors still travel the gap, but dark. Does *not* repair the mechanical over-command, so the raw count is still reported separately. |
| **dwell** | once a stationary unblanked run reaches `LASER_DWELL_MS`, the rest of it is blanked. The one case where blanking removes the hazard outright. |
| **budget > 100 %** | cannot be targeted — no subset is being drawn at the rate it was authored for. **The whole frame goes dark.** |

Held for `LASER_BLANK_HOLD_MS` (250 ms) after the last fault, so a frame sitting on the threshold cannot strobe the beam at the frame rate. Disable with `LASER_SAFE_BLANK=0`.

The scope reports what was **done** separately from what was **measured** — a dwell of 0 because the beam was switched off is a different fact from a dwell of 0 because nothing ever stopped moving. Verified:

```
gentle   300 pts   679/10000 deg/s   field 2.7 deg   budget  56%   within scanner spec
parked   400 pts     0/10000 deg/s   dwell 958 us                  BLANKED 376 parked pts
dense   1200 pts   budget 225%                                     BLANKED — needs 54000 pps
```

## Galvo-safety scope (SC GUI, right-hand column)

`laser-bridge.js` sends `/laser/scope` to sclang at 12 Hz carrying the frame **after** sanitisation — the signal the DAC actually receives. The SC GUI draws it in a fixed **452 px column beside the scroll area** (window 1570 px), so it stays readable while the hands are on the knobs; the scope itself is 440 × 847. Three labelled lanes: **X**, **Y**, and **STEP / LIMIT** — a step limit is a limit on *slope*, so velocity is what the scope has to show, and it is not the same kind of quantity as the two above it. Decimated buckets carry the **worst** step inside them, never the step between surviving points.

Two lamps, in the same visual language as the feed lights but without their age column (neither is a feed whose silence means anything):

| Lamp | Lit when |
|---|---|
| **DAC** | the bridge has bound a real Helios. Dry run *and* no-bridge both read dark — in neither case is anything reaching a laser. |
| **BLANK** | the beam is down right now. Follows the bridge's own `LASER_BLANK_HOLD_MS` window, not the frame that tripped it: a 250 ms blanking reported for one 12 Hz frame would flash for 80 ms and be missed. |

Both go dark when the bridge stops speaking — an unlit BLANK must never be readable as *not blanking* when in truth nothing is being projected at all.

Four states, all reachable:

| Condition | Reads |
|---|---|
| Within spec | `9274 / 10000 deg/s`, scan budget `48 %` |
| Frame wider than the rating | `field 31.5 deg (rated 8.0)` → *wide field* |
| Beam stopped moving | `BEAM PARKED 13.3 ms` |
| Too dense to scan | `budget 180 %`, residual `OVER-SPEED ×460` |
| Bridge absent | `no bridge` — never "compliant" |

> **Not a safety system.** This is a **Class 4** fixture (> 1.7 W RGB). People are protected by the interlock, E-stop, key, aperture mask, the fixture's own Scan Guard, beam-path design and trained operation. The scope keeps the engine inside the scanner's published *mechanical* envelope and makes loss of beam motion visible. It does not make anything eye-safe.
