← [README](../../README.en.md) · [Español](../es/modulos.md)

# Visual modules

## Slots 4–9 · the six instruments

The six data-structure slots were flat diagrams on orthographic cameras that read control *values* and never the sound. They are now the **six voices of the engine, one each and no repeats** — the instrument laid out across six screens:

| Slot | Instrument | SC voice | Register |
|---|---|---|---|
| 4 | **DRONE** | `\opalDrone` | the sustained bed |
| 5 | **CAMPANAS** | `\elektronBell` | pads |
| 6 | **PERCUSIÓN** | `\opalPerc` | pulse |
| 7 | **BOMBO** | `\opalKick` | sub |
| 8 | **POLVO** | `\opalDust` | granular |
| 9 | **MUESTRAS** | `samplePlayer*` | field recordings |

Each has a perspective camera the viewer can orbit, real depth in its geometry (the drone's traces recede by age, the bell lattice breathes on Z, the tree stands in layers, the kick radiates as a pressure front, the cache is a stack you could walk into, the hash table is a ring), and the same idle drift as every other slot.

The instrument's name used to be **drawn into the scene** as a sprite floating over each one. That is gone. The name was a caption on a projection surface — the one element in six otherwise wordless slots that addressed the viewer instead of the room, and it sat in the same upper third the performance projects into. The binding it announced is the real one and it survives untouched: each slot still reads its own band of the spectrum and its own voice's onsets, per the table above.

**And now they play it.** Each of the six was a listener: bound to one voice, reading that voice's band and onset, drawing what it heard. They also *speak* now, from their own structural events — the screen plays the instrument:

| Slot | Voice | The structure's own event |
|---|---|---|
| 4 | DRONE | the reticule completes a full sweep → a sustained **partial** joins over the bed |
| 5 | CAMPANAS | an edge forms — two nodes that were not connected now are |
| 6 | PERCUSIÓN | a node arrives at its target — a rebalance has actually completed |
| 7 | BOMBO | a target is acquired — a ray crosses a sweep |
| 8 | POLVO | a layer overflows its own level — blocks spilling past the edge |
| 9 | MUESTRAS | a hash collision — and *which* bucket collided picks the recording |

**A slot plays the engine's voice, not a new instrument.** The first version made them separate: pitches from independent linear maps, envelopes from literals, spawns unbundled. They did not blend, and one of them did not move at all — `\elektronBell` clamps its fundamental to 28–180 Hz (`3_synthdefs.scd:241`), so a linear map to MIDI 48–84 crossed the ceiling at tone 0.15 and **85 % of the range played one identical pitch**. Now:

- the **pad** snaps to the semitone grid and octave-folds below 160 Hz the way the ETH pads do, and is queued on `~padQueue` so the drain gives it `\polyComp` — spawning direct made it up to 4.9× louder than a concurrent engine pad *and* corrupted the engine's own `1/√n` compensation by staying invisible to `~padLive`;
- the **perc** draws from `~computePitchPool` × `~speciesBand`, the engine's own mode, rather than a continuous sweep that touched those notes by coincidence;
- the **kick** walks the engine's seven discrete steps (45.5–54.5 Hz) and rings for its 0.9–1.3 s rather than clicking for 0.28;
- everything spawns inside `s.makeBundle(s.latency, …)`, as every engine voice does.

**Slot 4 adds a partial; it does not re-pitch the bed.** It used to call `~opalDroneSynth.set(\freq, …)` — a second controller of a node the beat engine walks every four bars, with no arbitration (`\drone` is the one voice the engine never stamps into `~lastVoiceAt`). On a 4-second glide (`droneFade × 2`) the bed spent most of its life in transit and never arrived. It now spawns its own low-amplitude `\opalDrone`, capped at two concurrent and released after nine seconds. One source of control each.

**A slot speaks on an EXCURSION, not on a change.** These counts jitter every frame — slot 6 adds `Math.random()` to node positions on the line after it counts which nodes have arrived, so "arrived" is frame noise by construction. A naive "has it risen since last time?" is therefore true whenever the rate gate reopens, and the gate stops being a limit and becomes the clock: measured, slot 6 fired 8×/s (a vibration) and slot 7 at a dead-steady ~83 BPM (a drum machine). Neither was the structure speaking; both were the rate limiter. Each slot now runs a Schmitt trigger on a slow baseline — the measure has to rise ~35% above what it has lately been doing, and come back down before it can speak again. Measured after: 0.05–1.35 onsets/s, irregular.

**The slot does not decide whether the note happens.** The beat engine already decides when kick, perc and dust speak, and the ETH handler decides the bell; a slot deciding the same thing would be a second authority over one rule, which is the failure this codebase keeps having to undo — the seven `/rhythm/` toggles that were removed for it, the tide exclusivity enforced in exactly one place.

So a slot *requests*, on `/slot/voice [voiceIdx, amp, tone]`, and `15_slot_voices.scd` decides. Both the engine and the scheduler stamp one shared onset clock, `~lastVoiceAt`, and a request landing inside a voice's minimum gap is dropped rather than layered. A slot can therefore only speak where the engine has left room — the pulse stays the engine's, the punctuation is the slot's. Measured: a runaway emitter at 100 requests/second is capped to 13.7 onsets/s on `dust`, and a slot asking for a kick immediately after the engine fired one is refused.

Gaps are set by what the voice is *for*, not by taste: `drone` 6 s (a re-pitch is structural), `dust` 0.07 s (granular, it should be able to swarm), `sample` 1.6 s (these are 30-second field recordings, and two a second is a collage). `/slot/voices/enable 0` puts all six back to listening without unmounting them.

> **The trigger never comes from audio.** A slot firing its own voice from its own band energy is a feedback loop — it would play because it is playing. Every emitter is driven by the simulation, which is also the whole point.

**They react to the sound, not to the intention.** `\masterScope` analyses the master bus *after* the limiter and sends 16 log-spaced bands at 20 Hz — that had been arriving all along with nothing listening, so the spectrogram was running on its synthetic fallback. It now feeds `window.__scAudio`, and SC additionally broadcasts `/voice/*` at the moment each note starts. Energy in a band tells you a bell is ringing; the onset tells you it was struck, and without it every visual is late and smeared.

Each slot reads **its own register**, normalised against its own recent peak — a kick visual must not brighten because a bell rang, and measured on a live engine the low band runs ~40× hotter than the high one, so a raw reading leaves the treble slots looking dead while they work.

## Slots 4–9 · the blended space

Every instrument slot (4–9) keeps its whole world: structures, trails, constellations, ticker. Into the same scene, `blend/blendLayer.ts` adds a **conceptual blend** (Fauconnier & Turner) of the engine's two input spaces: *neuronal · bosque* (the CORPUS layer, the species) and *silicio · cadena* (Ethereum mainnet). Because it lives in the slot's scene, the dome, NDI and the 4K render carry it, with the slot's own bloom and trails.

- **Formulas in flight.** A swell in the forest writes the slot's neuronal law in mid-air, and it flies in from one side. A block on the chain sends the silicon law in from the other. Each carries a live number. When both reach the front they **transform into each other** (manim's TransformMatchingParts) and become the blend, or the generic structure both share; it rises and dissolves. A formula that meets nobody flies on through and unwrites itself.
- **The blend surface.** A mesh under the structure whose shape is the blend: `h = (1−λ)·membrane + λ·lattice`. The membrane is smooth swells at the species, breathing with the forest. The lattice is terraces raised by the transactions, the stepped shape of a ledger. λ is the chain's share of current activity. The surface turns slowly and its colour leans green or amber with whichever world is raising it.

- **The grove (slots 6 and 9, instead of the surface).** Four trees, each the blend of two real trees on one topology: a **dendrite** (irregular, 3-D, tapering) and a **Merkle tree** (binary, symmetric, straight: the tree that commits every Ethereum block). The shape morphs with λ. A swell of the forest sends a green pulse from a branch tip to the root; a block sends an amber pulse from a leaf to the root, the path of a Merkle proof.

**On the dome:**
- The ticker of slots 4–9 becomes **three rings of text** around the dome (elevations 5°, 24°, 44°), turning slowly, alternate rings the other way.
- Slot 1 (Shan Shui) **wraps around the audience** (`dome/domeBend.ts`). Frequency goes all the way round, the live range circles the horizon, and the past rises toward the zenith. The flat screen is unchanged and reframed to fill the width.

| Slot | Neuronal law | Silicon law | They meet as |
|---|---|---|---|
| 4 | τ dV/dt = −V + R I(t) | G_{n+1} = G_n + g_tx | τ dU/dt = −(1−λ)U + (1−λ)I + λ g: the leak is the difference |
| 5 | Δw_ij = η x_i x_j (Hebb) | Δw_ab = v_{a→b} | Δw = (1−λ)η x_i x_j + λ v_{a→b} |
| 6 | Δw = η r_pre r_post − γ w | splay access lemma | cost ↓ the more x is used |
| 7 | tuning curve r(θ) | Voronoi cell | space → response regions |
| 8 | R(t) = e^{−t/S} | AMAT = hit + m·miss | capacity ↔ latency |
| 9 | h(x) = WTA_k(Mx) (fly olfaction) | keccak256 | signal → short fingerprint |

Formulas are written in **manim's visual language**, live in three.js (`src/projector/manim/`): MathJax → SVG paths, Write / Transform / Indicate / Flash, live DecimalNumbers. All of them are in `src/projector/manim/formulas.json`. Keep displayed TeX ASCII: write accents as `\acute{a}`, `\tilde{n}`. SC sends each mixer layer's level to the browser as `/stems` (10 Hz); the forest side reads the CORPUS layer.

## Idle auto-rotation · ROTATION SPD

The slider reaches **all sixteen slots** now. It reached exactly one before — the phenological calendar, where it sets the year-sweep rate, not any rotation.

`src/projector/vizMotion.ts` publishes `window.__vizMotion` (mutated in place, like `__ednaBio`): `{ rotation, idle, factor, speed, angle, t }`. Interaction is captured once at the document — `pointerdown`, `wheel`, `keydown`, `input`, in capture phase — so both the control panel and a camera drag reset the clock, with no per-module wiring. After **8 s idle** the drift eases in over **4 s** (smoothstep, so it neither starts nor settles with a corner) and reaches roughly **one turn every three minutes** at `rotation = 1.0`.

The seven OrbitControls slots need nothing of their own: there is exactly one `new OrbitControls` in the tree, so `helpers/threeBase.ts` enables `autoRotate` and feeds `autoRotateSpeed` from the shared value on a 200 ms timer. That same change **removed the `"change"` → `render` listener**: with damping on it fired every `update()`, so every one of those slots was rendering the same frame twice.

The nine remaining slots each got an idiom rather than a literal spin — a flat chart that slowly tilts reads as broken. Slot 1 drifts the phase of its noise field; slots 4 and 7 add to their radar sweep; 5 and 6 precess; 8 leans like a settling shelf; 9 precesses its bucket ring.

## Votes and consensus — all sixteen

Votes reached 9 slots and missed 7 (2, 4–9). Consensus was dead in 5: slot 1 ignored it, slot 8 never received it, the calendar had **no path at all**, and DarkForest and Antifonía wrote it into a `coherence` field no render path read. Each now has a reaction in its own vocabulary — a radar ping, an edge cascade, a forced rebalance, a flush wave down the hierarchy, a forced rehash, a ripple through the point cloud; consensus becomes wave alignment, cache coherence, phenological quorum, flow straightness, chorus synchrony.

**`"failed"` was handled in eight places and produced in none.** SC reports real outcomes on `/parliament/vote/result`, and `parliamentStore` already ingested them — the result simply never reached `__voteEvent`. It does now, so a rejected motion looks different from a carried one.

## Slot 0 · Phenological rings (and variants O and T)

<p align="center"><img src="../rings/slot0.jpg" width="32%" alt="Slot 0 · nested clocks"> <img src="../rings/slotO.jpg" width="32%" alt="Slot O · reference"> <img src="../rings/slotT.jpg" width="32%" alt="Slot T · taxa"></p>

*Slot 0 · nested clocks — Slot O · reference — Slot T · taxa (captured with a test OSC feed).*

The rings are a live calendar, from the year down to the second (`nw_wrld_local/src/projector/rings/`):

* **YEAR** — each day keeps the corpus-bus spectrum heard while the SC ring stood on it; amber hand = `/pheno/cursor`, green = civil date.
* **DAY** — that day's AudioMoth recordings as tiles at their minute, painted while they sound (`/pheno/clip`).
* **NOW** — 30 s of the master bus as a swept spectrogram; no signal, black.
* **WAVE** — bus level, a node per voice strike (`/voice/*`) and arcs between strikes.

Today's most active species move from the calendar lane to the voice lane (their taxon sounds) or the event lane (affinity with a recording's role). Consensus draws them in; Article 47 withholds the name, never the body. Wheel = zoom to cursor, double-click = fly, same key again = whole dial. **O**: one turn = one phenological day. **T**: five year lanes by taxon. `\masterScope`/`\corpusScope` now use 96 bands.

## Slot A · Antifonía — the forest's acoustic parliament

Antiphony is alternating song between groups: a real bioacoustic phenomenon (duetting) and the oldest form of parliament, speaking in turns. Each sound source is a member taking the floor, and one session lasts a day.

**The vertical axis is height.** It reuses the same Humboldt strata that order DarkForest [F] and Estratos [E] — whoever sings, sings *from* a height: the howler from the emergent crowns, the frog from the understory, the bat crossing the canopy. A call at 20 m lands in the canopy in all three slots, and a check asserts the stack has not drifted apart between them.

**The stand is a simulated LiDAR sweep**, not scenery: one ceiba (*Ceiba pentandra*) with a clean bole and a flat tiered crown, campanos (*Albizia saman*) in umbrella domes wider than they are tall, ~50 ordinary dry-forest canopy trees, and exactly two wine palms (*Attalea butyracea*) — ~57 trees, counted at runtime and published on `window.__antifoniaStand`. The exact composition shifts when anything upstream changes how many numbers the seeded generator has drawn, which is why it is *counted* and asserted rather than declared: that is how a change to the ceiba silently took the palms to zero once already. They are **sown, not placed**: regeneration nuclei scattered through the lobe, cohorts crowding inward, and a minimum-exclusion test so no two crowns occupy the same cubic metre. A hand-written list of positions read as a maquette — even spacing, and the ceiba alone in a clearing nobody planted. It now stands off-centre with its retinue touching it, because an emergent lives surrounded. An aerial flight is simulated (canopy returns strongly, ground moderately, vertical boles barely), because that asymmetry is what makes an aerial cloud look the way it does. The ground boundary is **amorphous** — polar sampling with an angular lobe, thinned at the rim so the plot fades out instead of ending on a cartesian edge.

**The ceiba's crown is asymmetric, and that is load-bearing.** Its tiers were built as wheels — *N* branches at exact angular steps, all the same length, all concentric on the axis. From above, a radar sweep; from the front, five concentric discs. No emergent looks like that: a forty-metre ceiba has lost limbs, the ones left are of very different lengths, and each tier leans toward the light it found. Every branch is now described before it is sown — irregular angular step, its own length, its own droop, its own curve in plan, and a one-in-six chance it is simply missing — and points are distributed by branch *length*, because distributing them per branch would make a short limb as dense as one twice its size, which is the same symmetry wearing a disguise. Measured on the points rather than on the source: the old crown reached 0.74–0.93 R in all 24 azimuth sectors (CV 0.06); it now reaches 0.00–1.09 R (CV 0.41), with sky through the gaps.

The cloud is deliberately **sparse and small-pointed**: not a survey, but what the machine manages to see of the forest — a spectral presence rather than a model. Seeded, so the stand is identical every boot. Six `THREE.Points`, one per stratum, shuffled at build so the adaptive LOD can trim the draw range into a uniform subsample without regenerating anything. The wind sways each stratum (more with height, driven by the geophony bench) by moving **six positions per frame** — not one vertex is touched. Measured at **8.3 ms median, the same as DarkForest and Estratos**.

Each call lights the stratum it came from, so the forest is the body that speaks rather than the backdrop it speaks in front of.

**Every call is a Japanese candlestick** — the one from a trading chart. Thin wick from high to low, thick body where the energy sits, filled if it closed above the previous call of its own species and dimmed if below. The "price" is frequency. This is not a visual joke: the engine already sonifies a blockchain, and putting the forest into the same instrument a currency is quoted with says out loud what the whole apparatus does — try to measure nature in real time, with the wrong tool, leaving the seam visible.

The candles are **immersed**. The fauna are drawn as **LiDAR returns like everything else** — denser clusters of the same white phosphor, not painted silhouettes: every mark in this scene comes from the same scan. The howler sings from **a howler (*Alouatta seniculus*) moving through the ceiba's branches** — one animal, not two. Two of the same size moving through the same crown read as a matched pair, which is a decorative relation; one is a presence. It is drawn at 0.85 of the size it was, and because `PointsMaterial` attenuates by distance and not by object transform, shrinking the animal does **not** shrink its returns: a smaller cluster of the same dots, which is what a real scan would give. It has body, head and prehensile tail, and pauses long between moves as the animal does. It can only be in the ceiba, because that is the one emergent: the same confinement that already governed the call, now visible. Other canopy sources sing from a **bird actually crossing the stand** — seven of them fly at canopy and emergent height, wings beating, and the sky empties outside their hours. First you see who is speaking, then what they said. Failing a bird, the call takes a **perch**: a tree in this stand tall enough to reach its stratum. The aircraft has no perch — it is in the atmosphere, which is what it is.

The **suelo** has inhabitants now: a **paujil piquiazul** (*Crax alberti*, CR endemic) walks between the boles rather than flying, and a **file of leafcutter ants** (*Atta cephalotes*) crosses from nest to tree. Both have voices — the paujil a deep boom in the register where the kick lives, the ants a faint high stridulation. Atta farm fungus, so the file **lights the mycelium it passes over**: the two elements are one system rather than two decorations.

**Mycelium** runs under the ground and keeps going past the plot and out of frame on every side. That it leaves is the claim, not a framing slip: the network does not recognise the parcel boundary or the viewport. The unit the eye thinks it is looking at — this stand, this rectangle — is an administrative cut across something continuous. The forest above can be framed; the one below cannot. It is split into **seven sub-networks, each keyed to its own band of the live master spectrum**, so different paths light with different parts of the sound and the net reads as carrying traffic rather than breathing as one body — the "pulse" it had before was a free-running sine tied to nothing. Kick and dust onsets give the flashes, band energy the sustain. Seven opacity writes per frame; a per-vertex update would be ~200 KB/frame, 350× the bird and howler systems combined.

**Frequency does not fight for that axis.** Each call is a glyph whose length is its bandwidth; the spectrum reads as morphology. A separate strip along the bottom carries time on x and log frequency on y — the acoustic niche, species partitioning bands and hours so as not to mask one another.

**Three benches, not one.** Biophony, geophony, and anthropophony. The machine is not an intruder in this chamber; it is the third bench, and its noise grows into ambient through the deep-listening transitions instead of sitting beside them. When the tide rises the forest speaks; when it falls, the machine holds the air. That inversion is literal: anthropophony's spawn weight is driven by `(1 - tide)`.

**It really sounds — and now with the forest's own voice.** A call goes out on `/antifonia/call`, and **SuperCollider chooses the recording** (`16_corpus_calls.scd`).

Twelve sources shared seven MP3s: four species split the *aves* bed alone, and LLUVIA and VIENTO carried `smp: -1`, drawn on screen and never sounding at all. The corpus built from the AudioMoth survey holds 261 clips of the actual site, and slot A could not reach any of it — the ring in `14_phenological_corpus.scd` plays that material on the 365-day calendar, which is a calendar and not a call.

The bank now carries **116 two-second grains** (already cut by `build_corpus.py` from each ring day's highest-confidence events) and **six geophony stems**, so rain and wind finally have a recording. ≈114 MB resident.

**The species→role map lives in SuperCollider**, because the corpus carries ecological roles and *no taxonomy* — that is the same fact that makes Article 43's bancadas role-labelled. A call therefore says *who* is speaking and *at what hour*; SC decides which recording answers:

| Source | answers from |
|---|---|
| aullador · rana · murciélago | `nocturnal_voice` (the bat weighted toward clips that carry ultrasound) |
| chicharra · arriera | `insect_chorus` |
| aves · oropéndola · paujil | `dusk_` / `dawn_chorus_participant` |
| **lluvia · viento** | **geophony stems** |
| avión · cinta | their MP3s — the corpus has no anthropophony to offer |

Selection weights confidence against **hour proximity on a 24-hour ring**, through a Gaussian of σ ≈ 3 h, about the width of a dawn chorus. A linear falloff was tried first and does not work: it spans only 5× across the whole clock, and the corpus is so nocturnal that the mass of far clips outvoted the near ones — a call at 20 h still drew a median grain from 03 h. The Gaussian gives ~8×, which is the difference between a preference and a rounding error.

**Article 47 is enforced before the clip is chosen and again in the voice.** `opacityFloor` (CC 15) filters the eligible pool exactly as it does for the ring, and `samplePlayer*` now carries the same veil `\corpusVoice` has always had — that SynthDef had *none*, so routing recorded material through it would have sounded what the Chamber had withheld. Measured: floor 0 admits 114 of 122 corpus entries, 0.5 admits 73, 0.8 admits 23.

A call **opens a window into** the recording rather than truncating it. Five of the seven MP3s are 51–360 s soundscape beds, not isolated calls, so a call's duration shapes an envelope — attack, hold, release — over an excerpt taken from a varying offset. Previously the duration was a hard `.free`, which cut a 51-second howler after 3% of itself with no release at all: a broadband click on every call, and because the reverb and delay live *inside* the voice, the acoustic space vanished with it.

> **The envelope now has to fit the recording.** Its span is atk+hold+rel ≈ 2.15 × the hold, and that span was never computed anywhere — survivable while every file ran 51–360 s, wrong the moment a 2-second grain arrived: it became two seconds of forest followed by eight of silence holding one of twelve voices. The span is built explicitly now and scaled to the material when it overruns. Which also makes true, at last, what this section always claimed: the two short MP3s (ranas 4.9 s, oropéndola 6.2 s) are heard **whole**. They were not — a 10.75 s envelope over a 6.2 s file ran off its own end.

Only biophony is published to `__activeSpecies`: rain is not a species and neither is an aircraft, and that field feeds the parliament's living census and the laser's opacity clause.

Inspired by **AveRosetta™** (NeotropicalScience), a forest-communication visualizer crossing a LiDAR cloud with annotated calls. No AveRosetta code or data is used here; the debt is conceptual and is credited on screen.

Real annotations drop in at `assets/json/antifonia_calls.json` (schema in the module header); absent that, the session is generated from the source table.
