← [README](../../README.en.md) · [Español](../es/controles.md)

# Controls and sound

> **Cuaderno de Mandos** — interactive reference for all controls: <https://claude.ai/code/artifact/785cc1af-01a5-48a5-b915-272e957e80e2>. Unlike the static table below, it gives **both** incidences of every control — which bus/SynthDef it moves in the sound, and which visual binding it touches, module by module — with search and family filtering. Regenerated from the registry on change; the table below is the snapshot checked into the repo.

**71 parameters**, all generated from one registry entry each (`~paramDefs` in `0_parameters.scd`): **64 MIDI CCs** and **75 OSC routes**. Every slider/knob/CC drives both SC audio buses and the visualizations simultaneously. The first ten rows cross the visual slots, giving 10 parameters × 10 slots = 100 bindings in that layer alone.

The engine reports these counts at boot (see [Boot sanity check](diagnostics.md#boot-sanity-check)); where this document and the banner disagree, the banner wins.

## Row 1–2: Core Performance + Ambient Processing (all slots)

| Param | MIDI CC | SC Audio | Slot 0 Parliament | Slot 1 Asteroid | Slot 2 LowEarth | Slot 3 Perlin |
|---|---|---|---|---|---|---|
| **volume** | CC 0 | master volume | pt light intensity | wave stroke alpha | white cloud opacity | stroke opacity |
| **pitchShift** | CC 1 | freq ±2 oct | species Z amplitude | lane X offset | cloud Y-stretch | noise intensity |
| **timeDilation** | CC 2 | env stretch ×0.5–6 | orbit speed | noise X zoom | rotation damping | cycle frames |
| **spectralShift** | CC 3 | LPF sweep 80–2400 Hz | bloom threshold | amber-cyan tint | line hue shift | layer compression |
| **spatialSpread** | CC 4 | quad pan L↔R | camera distance | lane spread | lines XY spread | blob X/Y offset |
| **textureDepth** | CC 32 | granular density | film grain | grid line density | point size | stroke weight |
| **atmosphereMix** | CC 33 | reverb 0–0.9 | afterimage damp | background ghosting | red cloud opacity | layer count |
| **memoryFeed** | CC 34 | delay feedback 0–0.8 | bloom strength | ghost trail alpha | red lines opacity | ghost alpha |
| **harmonicRich** | CC 35 | FM ratio 0.1–5 | lissajous complexity | harmonic overlay | Bézier Z-scale | hue drift |
| **resonantBody** | CC 36 | filter Q 0.1–0.8 | chroma aberration | peak dot glow | red cloud scale | inner weight |

## Row 3–4: Drone & Noise

| Param | MIDI CC | SC Audio |
|---|---|---|
| **masterAmp** | CC 5 | layer trim — pads, drone **and** beat engine from one control |
| **filterCutoff** | CC 6 | broad tone tilt, under `spectralShift`'s absolute setting |
| **noiseLevel** | CC 7 | pink-noise breath under the pad |
| **noiseFilt** | CC 8 | noise LPF 200–2000 Hz |
| **droneDepth** | CC 9 | how far the sub body sinks |
| **droneFade** | CC 37 | glide time on the drone's own controls — **including its pitch** (see below) |
| **droneSpace** | CC 38 | reverb room size |
| **droneMix** | CC 39 | dry drone ↔ fully bloomed (wash + sub) |
| **delayFeedback** | CC 40 | comb delay feedback |
| **transactionInfluence** | CC 41 | how far chain activity bends the engine |

> Six of these (CC 5, 6, 9, 37, 38, 39) previously wrote to control buses that **no UGen read** — `\opalDrone` did not declare them and `\elektronBell` read them into variables it discarded. They now shape the drone.

> **The drone glides between pitches.** Every four bars the beat engine walks `#[55, 62, 73, 82, 49, 65, 55, 41]` Hz on the phrase counter — about every 45 to 50 seconds at the usual tempo — and it did it with a bare `.set(\freq, …)`. `freq` was the one parameter in `\opalDrone` without a lag, so a voice that had been holding a note for most of a minute stepped a fifth or a sixth instantly, which on a continuous drone reads as a fault rather than a change. It now rides `droneFade` like every other continuous control in that SynthDef, doubled — a pitch move needs noticeably longer than a filter move to stop sounding like an edit. At the 2 s default that is a 4 s portamento; the top of the fader takes it to 10.

## Row 5: Cámara Fenológica de lo Vivo — the corpus on the 365-day ring

`14_phenological_corpus.scd` plays 261 AudioMoth clips from La Luna / Planeta Rica across the phenological ring of Article 42. Only **34 of 365 days carry a recording**; the other 331 are silence, and under Article 44 that silence is the piece's dominant material, never interpolated.

| Param | MIDI CC | SC Audio |
|---|---|---|
| **activityThreshold** | CC 10 | Art. 45 — presence above 0.5 lights the seat; below it the species is in the territory but silent in the Chamber |
| **windowWidth** | CC 11 | Art. 43 — Gaussian reach in ring days. 0.4 leaves recordings isolated points in silence; 2.5 lets a real day be heard from across a gap (it never invents one) |
| **seasonalBias** | CC 12 | pulls selection toward Seca (−1) or lluvias (+1) independently of the cursor |
| **absenceWeight** | CC 13 | Art. 44 — 0 leaves unrecorded days truly silent; above it they sound the ×8 ultrasonic layer, so what fills the silence is what human hearing cannot reach |
| **pulseGain** | CC 14 | Art. 45 — how hard *quórum sensible* pushes back into `harmonicRich`, `textureDepth` and `/bio/consensus` |
| **opacityFloor** | CC 15 | Art. 47 — raising it withholds more of the corpus from analysis, projection and the laser |
| **bancada** | CC 16 | Art. 43 — 0 = todas, then the detector's four ecological roles |
| **phenoRate** | CC 21 | ring speed in days/second. Default 0.0167 = one day per minute = a 6 h 05 m year; full range 91 s → 48 h |
| **corpusLevel** | CC 22 | the field recordings against the synthesis |

> Before this layer, five of these buses (`windowWidth`, `seasonalBias`, `absenceWeight`, `pulseGain`, `opacityFloor`) were allocated and reachable by MIDI and OSC but had **zero readers in SuperCollider**. The corpus is what they were built for.

**The ring answers while the day is still running.** Every control in this row is consulted in one place — `~phenoPool`, called once per phenological day — and the ring used to sleep out the whole day in a single `wait`. At the default rate that is sixty seconds between turning a knob and hearing it, and eight minutes at the slow end, so the entire bench read as unwired. The same fault hit the transport from the other side: **NEXT REC. DAY ▶** set the cursor correctly and the routine slept through it (the log shows two `skip -> doy 211` a few seconds apart and the day itself arriving much later).

The ring still turns at `phenoRate`. What changed is that the wait is sliced (0.25 s), and on each slice the Chamber re-asks who is admitted *today*:

* **skip requests are honoured immediately** — `/pheno/next`, `/pheno/goto` and the button wake the ring and release what is sounding, so the jump is audible instead of buried under a clip with fifty seconds left to run;
* **selection is re-decided twice a second**, diffed by clip key, so a knob sweep starts only what has genuinely just crossed the threshold and stops only what has fallen below it — nothing retriggers while you drag;
* **`pulseGain` is picked up on a deadband** rather than once a day, so the reverse breath follows the fader without fighting the performer's own `harmonicRich`.

> **Releasing a corpus voice needs a negative gate.** Both corpus envelopes are `Env.new([0,1,1,0], …)` — fixed length, no release node — and for those EnvGen treats `gate` as a pure trigger: `.set(\gate, 0)` does nothing at all and the clip plays out its full atk+hold+rel. The forced release is `gate < 0`, over `-1.0 - gate` seconds. `~phenoPanic` had always used a zero gate, which is why `/pheno/stop` stopped the ring clock and left every voice sounding.

**Two playback paths, because 384 kHz is not optional.** A 60 s AudioMoth clip is 92 MB as a server Buffer — the corpus would be 24 GB resident. Nothing reads the originals at run time; two derived tiers carry the layer:

* `corpus/audible/` (48 kHz) feeds a fixed pool of 16 RAM slots recycled by the ring's look-ahead. Nothing is allocated at trigger time.
* `corpus/expanded/` (×8 time-expanded) is streamed with `DiskIn` for the absence voice — 4 cue buffers, ~2 MB.

Resident cost ≈ 230 MB, so `memSize` and `numBuffers` are unchanged.

> **Why the expansion is baked offline.** `DiskIn` performs no sample-rate conversion, so pointing it at a raw 384 kHz file at a 48 kHz server expands ×8 for free — a tempting trick, and wrong. It drops *everything* three octaves, so the loud audible band lands at 125 Hz–2.5 kHz and buries the ultrasound it was meant to reveal. The renderer high-passes at 38 kHz (24 dB/oct) **before** expanding, so only what was genuinely inaudible arrives, at 4.75–24 kHz.

**Gain staging.** `~trimCorpus = 2.60 × ~trimMaster`, measured rather than guessed. The seven MP3s in `samples/` average −22.2 dB mean; `corpus/audible/` averages −21.3 dB after the single global gain — within ~1 dB, so parity of trim is parity of loudness. Since `corpusLevel` sits in this layer's path and defaults to 0.5, the trim compensates: the layer lands within ~1 dB of the sample layer at the fader's default and ~6 dB below the drone bed, leaving the top half of the fader as real headroom.

The build applies **one global gain across the whole corpus**, never per-clip normalisation — a quiet dry-season night has to stay quiet against a rainy insect chorus, since `activity` and `richness` are exactly the signal per-clip normalisation would flatten.

Build the derived library (~4.2 GB, one-off) with:

```bash
python3 tools/build_corpus.py --dry-run   # counts and projected sizes
python3 tools/build_corpus.py             # renders + writes corpus/manifest.json
```

Ring transport: `/pheno/goto <doy>`, `/pheno/next`, `/pheno/stop`, `/pheno/start`.

> **The ring opens on a recorded day.** Only 34 of 365 days carry audio and the first is doy 9, so starting the cursor at doy 1 meant the instrument began with eight minutes of nothing — and since the two arcs are separated by gaps of 178 and 131 days, it can then be silent for up to **three hours** at the default rate. Absence is the material (Art. 44), but it should be arrived at, not booted into. `/pheno/next` and the **NEXT REC. DAY ▶** button skip to the next day that actually has audio.

## Cámara de las Especies — the five seats, as voices

Browser-only sliders (no MIDI CC), five species × two controls, taken from the live IUCN roster. For as long as they existed they emitted `/agents/species/*` into UDP 57120 where **no OSCdef received them** — the bridge's `/diag` showed 30 messages sent and nothing returning — so `FREQ` read a hardcoded `440Hz` and `VOT` a hardcoded `0` for every session.

| Control | Emits | SC effect |
|---|---|---|
| **Species Activity** (×5) | `/agents/species/activity [id, v]` | weights how often that seat is picked for a percussion hit |
| **Species Presence** (×5) | `/agents/species/presence [id, v]` | how loudly the seat speaks, and a register belongs to it |
| **eDNA Biodiversity** | `/agents/edna/biodiversity [id, v]` | site reading; echoed back with a decaying validation |

The corpus cannot carry taxonomy — it is indexed by ecological *role*, which is why Article 43's bancadas are labelled by role. So a species becomes audible in the percussion layer instead, where a pitch pool and a trigger already exist. The division of labour is deliberate: the **pool** still chooses the degree and the **seat** only chooses the register. One species does not get to overwrite the melody; it gets to say which octave the chamber hears it in.

`~speciesBand` is `[1.0, 1.33, 1.78, 2.37, 3.16]` — ~5-semitone steps, upward only, seat 0 at unity. Measured against the real pool rather than guessed: a symmetric set around 1.0 put the lower seats under the 40 Hz floor `\opalPerc` enforces, and at the bottom of the `harmonicRich` fader two or three of them collapsed onto 40 Hz and became the same voice (21 clipped notes, adjacent-seat ratio 1.00 — identical). Upward-only clips nothing and holds a full 1.33 between seats across the whole fader range, topping out near 780 Hz. Unity at seat 0 means the layer's original register is not lost, just assigned to the first seat — which, at the default presences, is also the most likely pick.

**A species votes by sounding.** `~speciesVotes[i]` increments at the moment of the hit, and the seat reports back on `/agent/species/state [id, presence, activity, votes, freq]` from the engine's existing throttled broadcast. `parliamentStore.ts` has parsed that message, in exactly that argument order, since it was written — it simply had no emitter.

## BioToken V3 — the formula shows its own terms

The panel's formula was static text and it disagreed with the code it described: it read `Presence × Duration` where `bioTokenTerms()` has always multiplied by *activity*, and printed IUCN as the raw `×5` multiplier while the factor applied is that over 5. Two of its six factors were frozen constants left behind when the Fungi Networks and Gaia AI Core panels were removed. Every term now carries its live value beside it:

| Term | Source |
|---|---|
| Presence | mean of `species[].presence` |
| **Activity** | mean of `species[].activity` — relabelled from "Duration" to match the code |
| eDNA.biodiv | mean over the **surfaced** sites only — it averaged all eight while only Córdoba has a fader, so seven frozen 0.5s permanently damped the token |
| Fungi.chem | ← `/bio/nutrient`, the mycelial pulse the Eco panel already shows |
| AI.optim | ← `/bio/density`, transaction density |
| IUCN.weight | `max(IUCN_MULT) / 5`, shown normalised |

## Row 7: the chain as process — `chainProcess`

| Param | MIDI CC | SC Audio |
|---|---|---|
| **chainProcess** | CC 23 | 0 is the corpus untouched; 1 is the corpus fully processed by what the chain is doing |

Until here the coupling ran: chain → synth voices. A transaction arrived, its value was log-mapped to a MIDI note, its gas to a velocity, its priority to an envelope, and a bell rang. Three scalars per transaction. Meanwhile the corpus — 261 recordings of the actual site — sat in a separate layer being merely scheduled by a calendar, untouched by the chain at all.

That wasted the data: an audit of what `eth_sonify.py` sends found `blockHash`, `calldataLen` and `nonce` parsed and read by nothing, while `entropy`, `blockNum` and `blockTxCount` were computed and only ever printed in the monitor line. And it pointed the piece backwards. The work's claim is that the chain acts UPON a territory; having the chain perform alongside the forest, on a separate set of synthesised instruments, states the opposite: two parties playing together.

So the corpus is the material and the chain is what is done to it. Three dimensions, and none of them is a note — they are all conditions:

| Chain reading | Sets |
|---|---|
| `entropy` | **DIFFUSION** — a chain arriving evenly leaves the recording legible, a bursty one smears it until the forest is a wash of where it used to be |
| `calldataLen` | **SMEAR WINDOW** — how far across the spectrum the magnitudes bleed, so an act that merely moves money barely touches the recording and one that executes something drags it sideways |
| `congestion` | **DRIVE and the filter** — block fullness against base fee: pressure on the chain becomes pressure on the recording |

The two corpus voices route to `~corpusProcBus` so they can be processed as a **group**; they wrote straight to the main output before (both hard-wired `Out.ar(0, …)`), which is exactly why nothing could be placed across the layer. `~corpusOutBus` defaults to 0, so if this file never loads the corpus goes straight out as it always did.

## Row 8: Matrix mixer — the only controls that change loudness

| Param | MIDI CC | Layer |
|---|---|---|
| **mixDrone** | CC 42 | `\opalDrone` — the continuous bed |
| **mixPad** | CC 43 | `\elektronBell` |
| **mixKick** | CC 44 | `\opalKick` |
| **mixPerc** | CC 45 | `\opalPerc` |
| **mixDust** | CC 46 | `\opalDust` |
| **mixSample** | CC 47 | `samples/` via `\samplePlayer*` |
| **mixCorpus** | CC 48 | the AudioMoth audible layer |
| **mixUltra** | CC 49 | the ×8 absence voice |

Every other control on the surface shapes **timbre**. Before this row, the balance between layers lived only in the hardcoded gain budget of `3_synthdefs.scd` (`~trimDrone`, `~trimPad`, …), fixed at load and unreachable while playing — so the instrument could not be mixed.

Unity is **1.0 at mid-throw**: at boot these multiply by exactly 1 and the engine sounds as it did before. `0` is a true mute, `2.0` is +6 dB. They multiply the trims rather than replacing them, so the documented gain budget stays meaningful. Measured on the drone layer: unity 0.0262 RMS, 0.5 → 0.0132 (−6 dB), 2.0 → 0.0531 (+6 dB), 0 → silence.

The SC GUI strips carry a **MUTE** that remembers the fader position, so unmuting restores the exact level. Mixer faders appear on both surfaces and follow MIDI, browser and preset loads through the same `~setParam` path as every other control.

## Marea — the density arc

The rhythm is not a grid. There is no step pattern deciding what sounds; a slow swell decides how *likely* any onset is, and events are placed by probability with ±45% of a tick of jitter so nothing lands on an audible pulse. The kick can only occur where the chain itself has a seam — a new block — and even there only with probability `tide²`, so the low end is present at the crest and absent through the trough.

The arc is measured in **blocks**, not seconds, so it stays locked to the chain's own cadence rather than drifting against it when the network speeds up or stalls.

| Control | OSC | MIDI CC | Effect |
|---|---|---|---|
| **ARCO CORTO** | `/tide/short` | CC 17 | ~3.5 blocks (40–50 s) |
| **ARCO MEDIO** | `/tide/media` | CC 18 | ~8 blocks (1.5–2 min) — default |
| **ARCO LARGO** | `/tide/larga` | CC 19 | ~25 blocks (4–6 min) |
| **PULSO** | `/tide/pulse` | CC 20 | sub-bass heartbeat, one per block, crosses the troughs |

The three arcs are **mutually exclusive, and SC is what enforces that rule** — it is enforced once in `~setParam` (`exclusiveGroup`), the single write path every surface already shares, so ticking one in the browser also unticks the others on the SC GUI and under MIDI. The browser only reflects the echo; it never enforces. All three off is a legal state: flat density, no swell.

Watch it on `[MON]`: `tide:<arc>/<phase>=<swell>` and `puls:`.

## Gain staging

The master bus previously ran at `outPk` 3–6 against a full scale of 1.0 with the limiter holding back 90–98% *continuously* — a compressor, not a limiter, which is why the level barely responded to `masterVolume` or `masterAmp`. The cause was singular: the pad layer summed **linearly** with concurrency (20 pads = 1.96) while every other layer was ≤ 0.17.

Pads get polyphony compensation (`1/√n`, so the layer grows as `√n`), and a single `~trimMaster` sets the absolute level.

The balance was then wrong in a second way, which peak measurements could not see. Calibrating on the **crest** left nothing holding the **floor**: measured over a full tidal arc the mix was below 0.05 — inaudible — in **48% of windows**, with a 340:1 crest factor. Half the piece was silence punctuated by peaks. The drone is now the **bed** rather than a quiet reference, the tidal trough thins to 0.42 instead of 0.15, and the field recordings sustain and cross-fade instead of punctuating. Result: **inaudible 48% → 16%**, crest 340:1 → **37:1**, median level ×1.8, `outPk` p90 0.745.

These trims remain the *structure* of the balance. What Row 8 adds is a live multiplier on each of them, so the structure can be adjusted while playing without editing constants and rebooting.

## The SC GUI is 1-bit monospace, with two exceptions

Black and white only, one typeface (Menlo), labels in caps. The previous amber scheme carried five hues that each encoded a state — green ok, red stop, yellow armed — none of which survived a projector or a photograph, and which made hue do the work that state should. Every control is white on black and an **engaged** control inverts to black on white.

Two things are deliberately not 1-bit, because inversion needs a body to invert and neither of these has one.

**The status lights are red when live, dark when dead.** A control has a shape you can read; a light has nothing but its own state. When the palette went 1-bit, `mainTheme.green` and `mainTheme.red` both became `Color.white` — and the LED drawFunc still chose between those two names as its *only* state signal, so all five lights were identical white discs in every condition. They now carry two literal colours of their own; an unlit light keeps its rim, so only the filament goes out. Nothing else on the window is red, so the status row is the one thing that can catch your eye across a stage.

Three of them were also answering the wrong question — testing whether something had been *registered* rather than whether it was *running*, which becomes true at boot and stays true through a dead feed:

| Light | Was | Is |
|---|---|---|
| **SERVER** | `Server.default.serverRunning` | unchanged |
| **BEAT** | `~beatRoutine.notNil` — never nil'd after `.stop`, so a stopped engine read as running | `~lastBeatTime` within 3 s, stamped once per step |
| **OSC** | `OSCdef(\txHandler).notNil` — registration, not traffic | `~lastOscTime` within 5 s |
| **ETH** | *(did not exist)* | `~lastEthTime` within 30 s — the feed the OSC light used to claim, and never watched |
| **MIDI** | a device is enumerated — stays lit through a dead cable | `~lastMidiTime` within 5 s, any CC |
| **BRIDGE RX** | `~lastBrowserOscTime` within 5 s | unchanged — the only one that was ever live |

**The knob grid is seven across.** Four performance rows of 5/5/5/6 became three of seven — the Cámara row already proved seven fits (7 × 132 px cells + gaps + margins = 992 px inside 1100) — and `phenoRate` joined the Cámara row to make it seven too. Seven rows became six.

**`bancada` is a button row, not a knob.** It is the last stepped spec that was still a Knob, and a Knob cannot serve one here: `~makeKnob` rebuilds the `ControlSpec` from `(min, max, warp)` and **drops the step**, `~setParam` re-quantises against the real spec and writes the rounded value back into the widget, and a `\vert`-mode Knob drags *relative to its current value*. So the write-back reset the accumulator on every mouse event, and crossing into position 1 needed 0.125 normalised in a single event — about 16 px between two consecutive Qt moves. The knob was not sending nothing; it was sending 0, repeatedly. MIDI CC 16 and the browser's five buttons were always fine. Five radio buttons now, reconciled from the bus at 2 Hz so every source relights them.

**Row 5, the Cámara Fenológica, is tinted amber.** It is the one bench whose controls change *who speaks* rather than how the engine sounds. The tint marks the row; it does not restart the hue-as-state habit the rewrite removed.
