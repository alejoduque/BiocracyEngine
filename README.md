```text
∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿

██████╗ ██╗ ██████╗  ██████╗██████╗  █████╗  ██████╗██╗   ██╗
██╔══██╗██║██╔═══██╗██╔════╝██╔══██╗██╔══██╗██╔════╝╚██╗ ██╔╝
██████╔╝██║██║   ██║██║     ██████╔╝███████║██║      ╚████╔╝ 
██╔══██╗██║██║   ██║██║     ██╔══██╗██╔══██║██║       ╚██╔╝  
██████╔╝██║╚██████╔╝╚██████╗██║  ██║██║  ██║╚██████╗   ██║   
╚═════╝ ╚═╝ ╚═════╝  ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝   ╚═╝   
                                                             
             ███████╗███╗   ██╗ ██████╗ ██╗███╗   ██╗███████╗
             ██╔════╝████╗  ██║██╔════╝ ██║████╗  ██║██╔════╝
             █████╗  ██╔██╗ ██║██║  ███╗██║██╔██╗ ██║█████╗  
             ██╔══╝  ██║╚██╗██║██║   ██║██║██║╚██╗██║██╔══╝  
             ███████╗██║ ╚████║╚██████╔╝██║██║ ╚████║███████╗
             ╚══════╝╚═╝  ╚═══╝ ╚═════╝ ╚═╝╚═╝  ╚═══╝╚══════╝
                                                             
        cybernetic feedback → multispecies parliament        
∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿
```

# BiocracyEngine

A live audiovisual instrument and a deployable public artifact that couples three registers into a single feedback loop: a public blockchain, a deliberative assembly (the multispecies parliament), and the phenology of a tropical dry forest. Every control parameter simultaneously drives SuperCollider audio synthesis and visual modules (slots 0–9, P, F, B, E, and R) via a bidirectional OSC/WebSocket bridge.

Rather than "visualizing data," the engine performs a cybernetic coupling where the forest, blockchain protocols, and human actions hold equal standing as political agents.

![Slot F · DarkForest — the tropical dry forest of Reserva Manakai (Planeta Rica, Córdoba) as a live stratigraphic data-scape: Humboldt's strata from atmósfera down through dosel, sotobosque and hojarasca to the mycorrhizal network, with species binomials, ecological flow vectors (fotosíntesis CO₂→C, respiración suelo C→ATM, micorriza C→hongo, herbivoría, fijación N) and the incoming Ethereum stream along the right edge.](BEngine.jpg)

*Slot F · **DarkForest** — the forest reading itself while the chain flows. Strata after Humboldt; every binomial is a member of the parliament.*

---

## 1. Theoretical Foundations & Research Contributions

The core contribution of the BiocracyEngine lies in **translating critical, decolonial, and political theory into working technical constraints in software.** It stands as a concrete, deployable counter-model to Nature Fintech and "Ecological State Protocols" by compiling philosophy into executable rules rather than citing it as external authority.

### Philosophy Compiled into Running Rules
*   **Glissant's Right to Opacity:** Implemented as a software constraint. The *Opacity Clause* (visualized via the `opacityFloor` parameter) withholds a deterministic fraction of active species labels from the projection. This clause is declared *untranslatable to sound* (it does not alter the SuperCollider synthesis), honoring Glissant's assertion that the subaltern must have a right to remain opaque and unconsumed by the Western gaze.
*   **Agamben's Coming Community:** Seated in the code as a parliament of *singularities, never identities*. The assembly does not classify species by their economic value or utility, but by their sheer presence.
*   **"Absence is Voice":** In slot P (Phenological Calendar) and slot F (DarkForest), species that fall below the sensory detection threshold are not deleted or set to zero; instead, they persist in the background as 1-bit dither or visual shimmer. Their absence speaks as a low-level frequency, asserting that what is unmeasured still participates.
*   **Seasonal Benches:** The membership and voting weight of the parliament's benches recompose dynamically following the seasonal cycles of the phenological calendar.

### The Parliament/Surveillance Distinction as an Architectural Claim
The pipeline used here is: **Acoustic Sensor → Vectorization → Smart Contract**.  
An important architectural claim of this work is that *the same sensing pipeline constitutes either surveillance or a parliament depending only on the architecture of power surrounding it.* Vectorization and remote sensing are not inherently tools of extraction; they can be configured to establish local sovereignty, turning a surveillance mesh into a site of representation.

### Non-Tradable Inscription: The BioToken
The BioToken inverts the "tokenize-the-planet" logic of carbon credits and biodiversity offsets. It is:
*   A **unit of political inscription** (participation) rather than a tradable asset (commodity).
*   A non-financialized protocol designed to register validated conservation actions and deep listening.
*   A buildable counter-model to speculative "Ecological State Protocols" and Nature Fintech.

### Disintermediation of the Extractive NGO Circuit
The system routes conservation value and decision-making sovereignty directly to the local, marginal community (El Balzal, Córdoba, Colombia). Data sovereignty is kept local, and the honest limits of the system—such as the dependencies and boundaries of chain-level governance—are made visible in the interface rather than hidden behind greenwashed UI templates.

### Phenology-Driven Governance
Rather than using the standardized global taxonomies of the IUCN Red List as an absolute authority, the engine maps the forest's own local seasonal calendar using a 572-species inventory from the Reserva Manakai. Ecological time governs the synthesis: the seasonal weight and active-species fraction are fed back into SuperCollider to drive `harmonicrich` and `texturedepth`.

### Situated Epistemology & Research-Creation
Rooted in *SubAmérica* and technodiversity (Yuk Hui), this project fuses Investigación-Acción Participativa (IAP, after Orlando Fals Borda) with on-chain governance. The result is delivered as a **liminal research object** rather than a finished artwork, making it reproducible and adaptable by other territorial communities.

---

## 2. Deployable Public Artifacts

The project is released across three software repositories and a community-facing field tool:
*   **BiocracyEngine**: The core audiovisual synthesis, WebGL/Three.js projection, and MIDI/OSC bridge engine.
*   **bioacoustic-scripts**: The python-based web3 blockchain parser and audio-vector feature extraction tools.
*   **dIAP (Decolonial IAP)**: Decentralized action research protocols and on-chain assembly tools.
*   **Biomap SoundWalk App**: A participatory listening and conservation instrument. It turns guided soundwalks in Reserva Manakai into logged acts of ecological presence, fusing deep listening and passive acoustic monitoring (PAM) in one field tool. The app carries the incentive layer, distributing BioToken-registered rewards to the El Balzal community for validated conservation actions, closing the loop between listening, inscription, and economic sustainability.

---

## 3. Technical Architecture & Data Flow

```
ETH Blockchain
     │
     ▼
eth_sonify.py  (web3 Python scraper)
     │  OSC → UDP:57120
     ▼
SuperCollider
  ├─ 1_server_config.scd   MOTU/CoreAudio auto-detect
  ├─ 2_midi_control.scd    Faderfox LC2 → ~buses (20 CC)
  ├─ 3_synthdefs.scd       SynthDefs (opalKick/Perc/Drone/Dust/Bell)
  ├─ 4_gui.scd             SC GUI (1-bit monospace) + matrix mixer
  ├─ 5_beat_engine.scd     Evolving beat engine (TX-driven melodic pool)
  ├─ 6_osc_handlers.scd    OSC in from HTML/bridge → ~buses
  ├─ 10_sample_system.scd  samples/ playback + paulstretch
  ├─ 14_phenological_corpus.scd  AudioMoth corpus on the 365-day ring
  └─ audio out → MOTU 828x or CoreAudio stereo
     │
     │  OSC echo → UDP:3333  (~visualsDest)
     ▼
parliament-bridge.js  (Node.js, OSC↔WebSocket)
  │  UDP:3333  ← SC / MIDI echo
  │  WS:3334   ↔ browser
  │  HTTP:3335 /diag
  │
  │  SC_TO_CH path translation:
  │    /soneth/* → /ch/setXxx  (method-trigger)
  │    /parliament/* and /agent/* → raw pass-through
  │
  ▼
nw_wrld Electron browser  (parliament.html)
  │
  ├─ HTML sliders (34 sliders, 4 rows + Beat Engine)
  │    └─ input → sendOSC → WS → bridge → SC bus
  │           └─ patchStoreFromSlider → __applySonethToViz (DIAG-tracked)
  │
  ├─ SC echo → onmessage → __applySonethToViz (DIAG-tracked)
  │
  └─ applySonethToViz(key, v)  ─────────────────────────────────────────┐
       │                                                                  │
       ├─ Slot 0  ParliamentStage.js   (Three.js)  amber + phosphor      │
       ├─ Slot 1  AsteroidWaves        (p5.js)  → __slot1Soneth          │
       ├─ Slot 2  LowEarthPoint        (Three.js)                        │
       ├─ Slot 3  PerlinBlob           (p5.js)  → __slot3Soneth          │
       ├─ Slot 4  TimeTravel           (p5.js)  → __slot4Soneth          │
       ├─ Slot 5  DynamicGraphs        (p5.js)  → __slot5Soneth          │
       ├─ Slot 6  DynamicOptimality    (p5.js)  → __slot6Soneth          │
       ├─ Slot 7  Geometry             (p5.js)  → __slot7Soneth          │
       ├─ Slot 8  MemoryHierarchy      (p5.js)  → __slot8Soneth          │
       ├─ Slot 9  Hashing              (p5.js)  → __slot9Soneth          │
       ├─ Slot P  PhenologicalCalendar (Three.js · fetched module)       │
       ├─ Slot F  DarkForest           (Three.js · fetched module)       │
       ├─ Slot B  Transito             (Three.js · fetched module)       │
       │          └─ reverse: throughput → /soneth/drone* → bridge → SC  │
       ├─ Slot E  Estratos             (Three.js · fetched module)       │
       │          └─ forward: __phenoParams → bancada pins the strata,    │
       │             activityThreshold → population, opacityFloor +       │
       │             seasonalWeight → which species are present today     │
       ├─ Slot R  Registro     (canvas · pretext ASCII field × slot 6)    │
       │          └─ reverse: buffer → /soneth/memoryfeed, consensus →     │
       │             atmospheremix                                          │
       └─ Slot A  Antifonía            (Three.js · fetched module) ───────┘
                  ├─ forward: /tide/state → chorus density, votes → the room
                  │           speaks, __ednaBio → per-stratum weight
                  ├─ events:  calls → /antifonia/call → SC picks the recording
                  └─ reverse: chorus → /soneth/texturedepth, spread →
                              spatialspread, machine share → noiselevel

MIDI (Faderfox Micromodul LC2) ──► SC buses ──► OSC echo ──► bridge ──► browser
```

### Slots 4–9 · the six instruments

The six data-structure slots were flat diagrams on orthographic cameras that
read control *values* and never the sound. They are now the **six voices of the
engine, one each and no repeats** — the instrument laid out across six screens:

| Slot | Instrument | SC voice | Register |
|---|---|---|---|
| 4 | **DRONE** | `\opalDrone` | the sustained bed |
| 5 | **CAMPANAS** | `\elektronBell` | pads |
| 6 | **PERCUSIÓN** | `\opalPerc` | pulse |
| 7 | **BOMBO** | `\opalKick` | sub |
| 8 | **POLVO** | `\opalDust` | granular |
| 9 | **MUESTRAS** | `samplePlayer*` | field recordings |

Each has a perspective camera the viewer can orbit, real depth in its geometry
(the drone's traces recede by age, the bell lattice breathes on Z, the tree
stands in layers, the kick radiates as a pressure front, the cache is a stack
you could walk into, the hash table is a ring), and the same idle drift as every
other slot.

The instrument's name used to be **drawn into the scene** as a sprite floating
over each one. That is gone. The name was a caption on a projection surface —
the one element in six otherwise wordless slots that addressed the viewer
instead of the room, and it sat in the same upper third the performance
projects into. The binding it announced is the real one and it survives
untouched: each slot still reads its own band of the spectrum and its own
voice's onsets, per the table above.

**And now they play it.** Each of the six was a listener: bound to one voice,
reading that voice's band and onset, drawing what it heard. They also *speak*
now, from their own structural events — the screen plays the instrument:

| Slot | Voice | The structure's own event |
|---|---|---|
| 4 | DRONE | the reticule completes a full sweep → a sustained **partial** joins over the bed |
| 5 | CAMPANAS | an edge forms — two nodes that were not connected now are |
| 6 | PERCUSIÓN | a node arrives at its target — a rebalance has actually completed |
| 7 | BOMBO | a target is acquired — a ray crosses a sweep |
| 8 | POLVO | a layer overflows its own level — blocks spilling past the edge |
| 9 | MUESTRAS | a hash collision — and *which* bucket collided picks the recording |

**A slot plays the engine's voice, not a new instrument.** The first version made
them separate: pitches from independent linear maps, envelopes from literals, spawns
unbundled. They did not blend, and one of them did not move at all — `\elektronBell`
clamps its fundamental to 28–180 Hz (`3_synthdefs.scd:241`), so a linear map to MIDI
48–84 crossed the ceiling at tone 0.15 and **85 % of the range played one identical
pitch**. Now:

- the **pad** snaps to the semitone grid and octave-folds below 160 Hz the way the ETH
  pads do, and is queued on `~padQueue` so the drain gives it `\polyComp` — spawning
  direct made it up to 4.9× louder than a concurrent engine pad *and* corrupted the
  engine's own `1/√n` compensation by staying invisible to `~padLive`;
- the **perc** draws from `~computePitchPool` × `~speciesBand`, the engine's own mode,
  rather than a continuous sweep that touched those notes by coincidence;
- the **kick** walks the engine's seven discrete steps (45.5–54.5 Hz) and rings for its
  0.9–1.3 s rather than clicking for 0.28;
- everything spawns inside `s.makeBundle(s.latency, …)`, as every engine voice does.

**Slot 4 adds a partial; it does not re-pitch the bed.** It used to call
`~opalDroneSynth.set(\freq, …)` — a second owner of a node the beat engine walks every
four bars, with no arbitration (`\drone` is the one voice the engine never stamps into
`~lastVoiceAt`). On a 4-second glide (`droneFade × 2`) the bed spent most of its life in
transit and never arrived. It now spawns its own low-amplitude `\opalDrone`, capped at
two concurrent and released after nine seconds. One owner each.

**A slot speaks on an EXCURSION, not on a change.** These counts jitter every
frame — slot 6 adds `Math.random()` to node positions on the line after it counts
which nodes have arrived, so "arrived" is frame noise by construction. A naive
"has it risen since last time?" is therefore true whenever the rate gate reopens,
and the gate stops being a limit and becomes the clock: measured, slot 6 fired
8×/s (a vibration) and slot 7 at a dead-steady ~83 BPM (a drum machine). Neither
was the structure speaking; both were the rate limiter. Each slot now runs a
Schmitt trigger on a slow baseline — the measure has to rise ~35% above what it
has lately been doing, and come back down before it can speak again. Measured
after: 0.05–1.35 onsets/s, irregular.

**The slot does not decide whether the note happens.** The beat engine already
owns when kick, perc and dust speak, and the ETH handler owns the bell; a slot
deciding the same thing would be a second owner of one rule, which is the
failure this codebase keeps having to undo — the seven `/rhythm/` toggles that
were removed for it, the tide exclusivity enforced in exactly one place.

So a slot *requests*, on `/slot/voice [voiceIdx, amp, tone]`, and
`15_slot_voices.scd` decides. Both the engine and the scheduler stamp one shared
onset clock, `~lastVoiceAt`, and a request landing inside a voice's minimum gap
is dropped rather than layered. A slot can therefore only speak where the engine
has left room — the pulse stays the engine's, the punctuation is the slot's.
Measured: a runaway emitter at 100 requests/second is capped to 13.7 onsets/s on
`dust`, and a slot asking for a kick immediately after the engine fired one is
refused.

Gaps are set by what the voice is *for*, not by taste: `drone` 6 s (a re-pitch
is structural), `dust` 0.07 s (granular, it should be able to swarm), `sample`
1.6 s (these are 30-second field recordings, and two a second is a collage).
`/slot/voices/enable 0` puts all six back to listening without unmounting them.

> **The trigger never comes from audio.** A slot firing its own voice from its
> own band energy is a feedback loop — it would play because it is playing.
> Every emitter is driven by the simulation, which is also the whole point.

**They react to the sound, not to the intention.** `\masterScope` analyses the
master bus *after* the limiter and sends 16 log-spaced bands at 20 Hz — that had
been arriving all along with nothing listening, so the spectrogram was running on
its synthetic fallback. It now feeds `window.__scAudio`, and SC additionally
broadcasts `/voice/*` at the moment each note starts. Energy in a band tells you
a bell is ringing; the onset tells you it was struck, and without it every
visual is late and smeared.

Each slot reads **its own register**, normalised against its own recent peak — a
kick visual must not brighten because a bell rang, and measured on a live engine
the low band runs ~40× hotter than the high one, so a raw reading leaves the
treble slots looking dead while they work.

### Idle auto-rotation · ROTATION SPD

The slider reaches **all sixteen slots** now. It reached exactly one before —
the phenological calendar, where it sets the year-sweep rate, not any rotation.

`src/projector/vizMotion.ts` publishes `window.__vizMotion` (mutated in place,
like `__ednaBio`): `{ rotation, idle, factor, speed, angle, t }`. Interaction is
captured once at the document — `pointerdown`, `wheel`, `keydown`, `input`, in
capture phase — so both the control panel and a camera drag reset the clock,
with no per-module wiring. After **8 s idle** the drift eases in over **4 s**
(smoothstep, so it neither starts nor settles with a corner) and reaches roughly
**one turn every three minutes** at `rotation = 1.0`.

The seven OrbitControls slots need nothing of their own: there is exactly one
`new OrbitControls` in the tree, so `helpers/threeBase.ts` enables `autoRotate`
and feeds `autoRotateSpeed` from the shared value on a 200 ms timer. That same
change **removed the `"change"` → `render` listener**: with damping on it fired
every `update()`, so every one of those slots was rendering the same frame
twice.

The nine remaining slots each got an idiom rather than a literal spin — a flat
chart that slowly tilts reads as broken. Slot 1 drifts the phase of its noise
field; slots 4 and 7 add to their radar sweep; 5 and 6 precess; 8 leans like a
settling shelf; 9 precesses its bucket ring.

### Votes and consensus — all sixteen

Votes reached 9 slots and missed 7 (2, 4–9). Consensus was dead in 5: slot 1
ignored it, slot 8 never received it, the calendar had **no path at all**, and
DarkForest and Antifonía wrote it into a `coherence` field no render path read.
Each now has a reaction in its own vocabulary — a radar ping, an edge cascade, a
forced rebalance, a flush wave down the hierarchy, a forced rehash, a ripple
through the point cloud; consensus becomes wave alignment, cache coherence,
phenological quorum, flow straightness, chorus synchrony.

**`"failed"` was handled in eight places and produced in none.** SC reports real
outcomes on `/parliament/vote/result`, and `parliamentStore` already ingested
them — the result simply never reached `__voteEvent`. It does now, so a rejected
motion looks different from a carried one.

### Bidirectional Feedback Loop
Every parameter change is reflected across all three control surfaces:
```
HTML slider ──► SC bus ──► SC GUI knob (visual update)
                    └──► OSC echo ──► HTML slider (position sync)
                                └──► applySonethToViz (12 slots)

MIDI CC ────► SC bus ──► SC GUI knob (visual update)
                  └──► OSC echo ──► HTML slider (position sync)
                              └──► applySonethToViz (12 slots)

SC GUI knob ► SC bus ──► OSC echo ──► HTML slider (position sync)
                                 └──► applySonethToViz (12 slots)
```

### Process Ports & Roles
Four processes are managed by `start_ecosystem.sh`:

| App | Process | Ports | Role |
|---|---|---|---|
| **Python ETH** | `eth_sonify.py` (venv) | → UDP **57120** | web3 scraper; per-tx `/eth/note` + `/eth/tx_info`, per-block `/eth/block` |
| **SuperCollider** | `sclang start_sonification.scd` | in **57120** (OSC) + **MIDI**; out **3333**; scsynth **57110** | audio engine, GUI, beat engine, drone, master limiter |
| **Bridge** | `parliament-bridge.js` (Node) | in UDP **3333**; WS **3334**; out UDP **57120**; HTTP **3335** `/diag` | OSC ↔ WebSocket, path translation |
| **Browser** | webpack-dev-server + Electron | HTTP **9001**; WS **3334** | `parliament.html` GUI, store, visual slots |
| **Laser** _(opt)_ | `laser-bridge.js` (Node, `LASER=1`) | WS **3337** in; USB → Helios DAC | vector frames → ILDA / laser onto the forest |

---

## 4. Control Matrix

10 core parameters × 10 visual slots = 100 bindings. Every slider/knob/CC drives both SC audio buses and all visualizations simultaneously. 32 parameters in total, all generated from one registry entry each (`~paramDefs` in `0_parameters.scd`).

### Row 1–2: Core Performance + Ambient Processing (all slots)

| Param | MIDI CC | SC Audio | Slot 0 Parliament | Slot 1 Asteroid | Slot 2 LowEarth | Slot 3 Perlin |
|---|---|---|---|---|---|---|
| **volume** | CC 0 | master volume | pt light intensity | wave stroke alpha | white cloud opacity | stroke opacity |
| **pitchShift** | CC 1 | freq ±2 oct | species Z amplitude | lane X offset | cloud Y-stretch | noise intensity |
| **timeDilation** | CC 2 | env stretch ×0.5–6 | orbit speed | noise X zoom | rotation damping | cycle frames |
| **spectralShift** | CC 3 | LPF sweep 80–3000 Hz | bloom threshold | amber-cyan tint | line hue shift | layer compression |
| **spatialSpread** | CC 4 | quad pan L↔R | camera distance | lane spread | lines XY spread | blob X/Y offset |
| **textureDepth** | CC 32 | granular density | film grain | grid line density | point size | stroke weight |
| **atmosphereMix** | CC 33 | reverb 0–0.9 | afterimage damp | background ghosting | red cloud opacity | layer count |
| **memoryFeed** | CC 34 | delay feedback 0–0.8 | bloom strength | ghost trail alpha | red lines opacity | ghost alpha |
| **harmonicRich** | CC 35 | FM ratio 0.1–8 | lissajous complexity | harmonic overlay | Bézier Z-scale | hue drift |
| **resonantBody** | CC 36 | filter Q 0.1–0.8 | chroma aberration | peak dot glow | red cloud scale | inner weight |

### Row 3–4: Drone & Noise

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

> Six of these (CC 5, 6, 9, 37, 38, 39) previously wrote to control buses that
> **no UGen read** — `\opalDrone` did not declare them and `\elektronBell` read
> them into variables it discarded. They now shape the drone.

> **The drone glides between pitches.** Every four bars the beat engine walks
> `#[55, 62, 73, 82, 49, 65, 55, 41]` Hz on the phrase counter — about every 45
> to 50 seconds at the usual tempo — and it did it with a bare `.set(\freq, …)`.
> `freq` was the one parameter in `\opalDrone` without a lag, so a voice that
> had been holding a note for most of a minute stepped a fifth or a sixth
> instantly, which on a continuous drone reads as a fault rather than a change.
> It now rides `droneFade` like every other continuous control in that SynthDef,
> doubled — a pitch move needs noticeably longer than a filter move to stop
> sounding like an edit. At the 2 s default that is a 4 s portamento; the top of
> the fader takes it to 10.

### Row 5: Cámara Fenológica de lo Vivo — the corpus on the 365-day ring

`14_phenological_corpus.scd` plays 261 AudioMoth clips from La Luna / Planeta
Rica across the phenological ring of Article 42. Only **34 of 365 days carry a
recording**; the other 331 are silence, and under Article 44 that silence is
the piece's dominant material, never interpolated.

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

> Before this layer, five of these buses (`windowWidth`, `seasonalBias`,
> `absenceWeight`, `pulseGain`, `opacityFloor`) were allocated and reachable by
> MIDI and OSC but had **zero readers in SuperCollider**. The corpus is what
> they were built for.

**The ring answers while the day is still running.** Every control in this row
is consulted in one place — `~phenoPool`, called once per phenological day —
and the ring used to sleep out the whole day in a single `wait`. At the default
rate that is sixty seconds between turning a knob and hearing it, and eight
minutes at the slow end, so the entire bench read as unwired. The same fault hit
the transport from the other side: **NEXT REC. DAY ▶** set the cursor correctly
and the routine slept through it (the log shows two `skip -> doy 211` a few
seconds apart and the day itself arriving much later).

The ring still turns at `phenoRate`. What changed is that the wait is sliced
(0.25 s), and on each slice the Chamber re-asks who is admitted *today*:

* **skip requests are honoured immediately** — `/pheno/next`, `/pheno/goto` and
  the button wake the ring and release what is sounding, so the jump is audible
  instead of buried under a clip with fifty seconds left to run;
* **selection is re-decided twice a second**, diffed by clip key, so a knob
  sweep starts only what has genuinely just crossed the threshold and stops only
  what has fallen below it — nothing retriggers while you drag;
* **`pulseGain` is picked up on a deadband** rather than once a day, so the
  reverse breath follows the fader without fighting the performer's own
  `harmonicRich`.

> **Releasing a corpus voice needs a negative gate.** Both corpus envelopes are
> `Env.new([0,1,1,0], …)` — fixed length, no release node — and for those EnvGen
> treats `gate` as a pure trigger: `.set(\gate, 0)` does nothing at all and the
> clip plays out its full atk+hold+rel. The forced release is `gate < 0`, over
> `-1.0 - gate` seconds. `~phenoPanic` had always used a zero gate, which is why
> `/pheno/stop` stopped the ring clock and left every voice sounding.

**Two playback paths, because 384 kHz is not optional.** A 60 s AudioMoth clip
is 92 MB as a server Buffer — the corpus would be 24 GB resident. Nothing reads
the originals at run time; two derived tiers carry the layer:

* `corpus/audible/` (48 kHz) feeds a fixed pool of 16 RAM slots recycled by the
  ring's look-ahead. Nothing is allocated at trigger time.
* `corpus/expanded/` (×8 time-expanded) is streamed with `DiskIn` for the
  absence voice — 4 cue buffers, ~2 MB.

Resident cost ≈ 230 MB, so `memSize` and `numBuffers` are unchanged.

> **Why the expansion is baked offline.** `DiskIn` performs no sample-rate
> conversion, so pointing it at a raw 384 kHz file at a 48 kHz server expands
> ×8 for free — a tempting trick, and wrong. It drops *everything* three
> octaves, so the loud audible band lands at 125 Hz–2.5 kHz and buries the
> ultrasound it was meant to reveal. The renderer high-passes at 38 kHz
> (24 dB/oct) **before** expanding, so only what was genuinely inaudible
> arrives, at 4.75–24 kHz.

**Gain staging.** `~trimCorpus = 2.60 × ~trimMaster`, measured rather than
guessed. The seven MP3s in `samples/` average −22.2 dB mean; `corpus/audible/`
averages −21.3 dB after the single global gain — within ~1 dB, so parity of
trim is parity of loudness. Since `corpusLevel` sits in this layer's path and
defaults to 0.5, the trim compensates: the layer lands within ~1 dB of the
sample layer at the fader's default and ~6 dB below the drone bed, leaving the
top half of the fader as real headroom.

The build applies **one global gain across the whole corpus**, never per-clip
normalisation — a quiet dry-season night has to stay quiet against a rainy
insect chorus, since `activity` and `richness` are exactly the signal per-clip
normalisation would flatten.

Build the derived library (~4.2 GB, one-off) with:

```bash
python3 tools/build_corpus.py --dry-run   # counts and projected sizes
python3 tools/build_corpus.py             # renders + writes corpus/manifest.json
```

Ring transport: `/pheno/goto <doy>`, `/pheno/next`, `/pheno/stop`, `/pheno/start`.

> **The ring opens on a recorded day.** Only 34 of 365 days carry audio and the
> first is doy 9, so starting the cursor at doy 1 meant the instrument began
> with eight minutes of nothing — and since the two arcs are separated by gaps
> of 178 and 131 days, it can then be silent for up to **three hours** at the
> default rate. Absence is the material (Art. 44), but it should be arrived at,
> not booted into. `/pheno/next` and the **NEXT REC. DAY ▶** button skip to the
> next day that actually has audio.

### Cámara de las Especies — the five seats, as voices

Browser-only sliders (no MIDI CC), five species × two controls, taken from the
live IUCN roster. For as long as they existed they emitted `/agents/species/*`
into UDP 57120 where **no OSCdef received them** — the bridge's `/diag` showed
30 messages sent and nothing returning — so `FREQ` read a hardcoded `440Hz` and
`VOT` a hardcoded `0` for every session.

| Control | Emits | SC effect |
|---|---|---|
| **Species Activity** (×5) | `/agents/species/activity [id, v]` | weights how often that seat is picked for a percussion hit |
| **Species Presence** (×5) | `/agents/species/presence [id, v]` | how loudly the seat speaks, and it owns a register |
| **eDNA Biodiversity** | `/agents/edna/biodiversity [id, v]` | site reading; echoed back with a decaying validation |

The corpus cannot carry taxonomy — it is indexed by ecological *role*, which is
why Article 43's bancadas are labelled by role. So a species becomes audible in
the percussion layer instead, where a pitch pool and a trigger already exist.
The division of labour is deliberate: the **pool** still chooses the degree and
the **seat** only chooses the register. One species does not get to overwrite
the melody; it gets to say which octave the chamber hears it in.

`~speciesBand` is `[1.0, 1.33, 1.78, 2.37, 3.16]` — ~5-semitone steps, upward
only, seat 0 at unity. Measured against the real pool rather than guessed: a
symmetric set around 1.0 put the lower seats under the 40 Hz floor `\opalPerc`
enforces, and at the bottom of the `harmonicRich` fader two or three of them
collapsed onto 40 Hz and became the same voice (21 clipped notes, adjacent-seat
ratio 1.00 — identical). Upward-only clips nothing and holds a full 1.33 between
seats across the whole fader range, topping out near 780 Hz. Unity at seat 0
means the layer's original register is not lost, just assigned to the first
seat — which, at the default presences, is also the most likely pick.

**A species votes by sounding.** `~speciesVotes[i]` increments at the moment of
the hit, and the seat reports back on
`/agent/species/state [id, presence, activity, votes, freq]` from the engine's
existing throttled broadcast. `parliamentStore.ts` has parsed that message, in
exactly that argument order, since it was written — it simply had no emitter.

### BioToken V3 — the formula shows its own terms

The panel's formula was static text and it disagreed with the code it described:
it read `Presence × Duration` where `bioTokenTerms()` has always multiplied by
*activity*, and printed IUCN as the raw `×5` multiplier while the factor applied
is that over 5. Two of its six factors were frozen constants left behind when
the Fungi Networks and Gaia AI Core panels were removed. Every term now carries
its live value beside it:

| Term | Source |
|---|---|
| Presence | mean of `species[].presence` |
| **Activity** | mean of `species[].activity` — relabelled from "Duration" to match the code |
| eDNA.biodiv | mean over the **surfaced** sites only — it averaged all eight while only Córdoba has a fader, so seven frozen 0.5s permanently damped the token |
| Fungi.chem | ← `/bio/nutrient`, the mycelial pulse the Eco panel already shows |
| AI.optim | ← `/bio/density`, transaction density |
| IUCN.weight | `max(IUCN_MULT) / 5`, shown normalised |

### Row 8: Matrix mixer — the only controls that change loudness

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

Every other control on the surface shapes **timbre**. Before this row, the
balance between layers lived only in the hardcoded gain budget of
`3_synthdefs.scd` (`~trimDrone`, `~trimPad`, …), fixed at load and unreachable
while playing — so the instrument could not be mixed.

Unity is **1.0 at mid-throw**: at boot these multiply by exactly 1 and the
engine sounds as it did before. `0` is a true mute, `2.0` is +6 dB. They
multiply the trims rather than replacing them, so the documented gain budget
stays meaningful. Measured on the drone layer: unity 0.0262 RMS, 0.5 → 0.0132
(−6 dB), 2.0 → 0.0531 (+6 dB), 0 → silence.

The SC GUI strips carry a **MUTE** that remembers the fader position, so
unmuting restores the exact level. Mixer faders appear on both surfaces and
follow MIDI, browser and preset loads through the same `~setParam` path as
every other control.

### Slot A · Antifonía — the forest's acoustic parliament

Antiphony is alternating song between groups: a real bioacoustic phenomenon
(duetting) and the oldest form of parliament, speaking in turns. Each sound
source is a member taking the floor, and one session lasts a day.

**The vertical axis is height.** It reuses the same Humboldt strata that order
DarkForest [F] and Estratos [E] — whoever sings, sings *from* a height: the
howler from the emergent crowns, the frog from the understory, the bat crossing
the canopy. A call at 20 m lands in the canopy in all three slots, and a check
asserts the stack has not drifted apart between them.

**The stand is a simulated LiDAR sweep**, not scenery: one ceiba (*Ceiba
pentandra*) with a clean bole and a flat tiered crown, campanos (*Albizia
saman*) in umbrella domes wider than they are tall, ~50 ordinary dry-forest
canopy trees, and exactly two wine palms (*Attalea butyracea*) — ~57 trees,
counted at runtime and published on `window.__antifoniaStand`. The exact
composition shifts when anything upstream changes how many numbers the seeded
generator has drawn, which is why it is *counted* and asserted rather than
declared: that is how a change to the ceiba silently took the palms to zero
once already. They are **sown,
not placed**: regeneration nuclei scattered through the lobe, cohorts crowding
inward, and a minimum-exclusion test so no two crowns occupy the same cubic
metre. A hand-written list of positions read as a maquette — even spacing, and
the ceiba alone in a clearing nobody planted. It now stands off-centre with its
retinue touching it, because an emergent lives surrounded. An
aerial flight is simulated (canopy returns strongly, ground moderately, vertical
boles barely), because that asymmetry is what makes an aerial cloud look the way
it does. The ground boundary is **amorphous** — polar sampling with an angular
lobe, thinned at the rim so the plot fades out instead of ending on a cartesian
edge.

**The ceiba's crown is asymmetric, and that is load-bearing.** Its tiers were
built as wheels — *N* branches at exact angular steps, all the same length, all
concentric on the axis. From above, a radar sweep; from the front, five
concentric discs. No emergent looks like that: a forty-metre ceiba has lost
limbs, the ones left are of very different lengths, and each tier leans toward
the light it found. Every branch is now described before it is sown — irregular
angular step, its own length, its own droop, its own curve in plan, and a one-in-
six chance it is simply missing — and points are distributed by branch *length*,
because distributing them per branch would make a short limb as dense as one
twice its size, which is the same symmetry wearing a disguise. Measured on the
points rather than on the source: the old crown reached 0.74–0.93 R in all 24
azimuth sectors (CV 0.06); it now reaches 0.00–1.09 R (CV 0.41), with sky
through the gaps.

The cloud is deliberately **sparse and small-pointed**: not a survey, but what
the machine manages to see of the forest — a spectral presence rather than a
model. Seeded, so the stand is identical every boot. Six `THREE.Points`, one per
stratum, shuffled at build so the adaptive LOD can trim the draw range into a
uniform subsample without regenerating anything. The wind sways each stratum
(more with height, driven by the geophony bench) by moving **six positions per
frame** — not one vertex is touched. Measured at **8.3 ms median, the same as
DarkForest and Estratos**.

Each call lights the stratum it came from, so the forest is the body that
speaks rather than the backdrop it speaks in front of.

**Every call is a Japanese candlestick** — the one from a trading chart. Thin
wick from high to low, thick body where the energy sits, filled if it closed
above the previous call of its own species and dimmed if below. The "price" is
frequency. This is not a visual joke: the engine already sonifies a blockchain,
and putting the forest into the same instrument a currency is quoted with says
out loud what the whole apparatus does — try to measure nature in real time,
with the wrong tool, leaving the seam visible.

The candles are **immersed**. The fauna are drawn as **LiDAR returns like
everything else** — denser clusters of the same white phosphor, not painted
silhouettes: every mark in this scene comes from the same scan. The howler sings
from **a howler (*Alouatta seniculus*) moving through the ceiba's branches** —
one animal, not two. Two of the same size moving through the same crown read as
a matched pair, which is a decorative relation; one is a presence. It is drawn
at 0.85 of the size it was, and because `PointsMaterial` attenuates by distance
and not by object transform, shrinking the animal does **not** shrink its
returns: a smaller cluster of the same dots, which is what a real scan would
give. — body, head and
prehensile tail, pausing long between moves as the animal does. They can only
be in the ceiba, because it is the one emergent: the same confinement that
already governed the call, now visible. Other canopy sources sing from a **bird
actually crossing the stand** — seven of them fly at canopy and emergent height, wings
beating, and the sky empties outside their hours. First you see who is
speaking, then what they said. Failing a bird, the call takes a **perch**: a
tree in this stand tall enough to reach its stratum. The howler can only be in
the ceiba, because it is the one emergent. The aircraft has no perch — it is in
the atmosphere, which is what it is. The strip along the bottom draws the same
reading as a full chart, time on x and frequency on y.

The **suelo** has inhabitants now: a **paujil piquiazul** (*Crax alberti*, CR
endemic) walks between the boles rather than flying, and a **file of leafcutter
ants** (*Atta cephalotes*) crosses from nest to tree. Both have voices — the
paujil a deep boom in the register where the kick lives, the ants a faint
high stridulation. Atta farm fungus, so the file **lights the mycelium it passes
over**: the two elements are one system rather than two decorations.

**Mycelium** runs under the ground and keeps going past the plot and out of
frame on every side. That it leaves is the claim, not a framing slip: the
network does not recognise the parcel boundary or the viewport. The unit the
eye thinks it is looking at — this stand, this rectangle — is an administrative
cut across something continuous. The forest above can be framed; the one below
cannot. It is split into **seven sub-networks, each keyed to its own band of the live
master spectrum**, so different paths light with different parts of the sound
and the net reads as carrying traffic rather than breathing as one body — the
"pulse" it had before was a free-running sine tied to nothing. Kick and dust
onsets give the flashes, band energy the sustain. Seven opacity writes per
frame; a per-vertex update would be ~200 KB/frame, 350× the bird and howler
systems combined.

**Frequency does not fight for that axis.** Each call is a glyph whose length is
its bandwidth; the spectrum reads as morphology. A separate strip along the
bottom carries time on x and log frequency on y — the acoustic niche, species
partitioning bands and hours so as not to mask one another.

**Three benches, not one.** Biophony, geophony, and anthropophony. The machine
is not an intruder in this chamber; it is the third bench, and its noise grows
into ambient through the deep-listening transitions instead of sitting beside
them. When the tide rises the forest speaks; when it falls, the machine holds
the air. That inversion is literal: anthropophony's spawn weight is driven by
`(1 - tide)`.

**It really sounds — and now with the forest's own voice.** A call goes out on
`/antifonia/call`, and **SuperCollider chooses the recording** (`16_corpus_calls.scd`).

Twelve sources shared seven MP3s: four species split the *aves* bed alone, and
LLUVIA and VIENTO carried `smp: -1`, drawn on screen and never sounding at all.
The corpus built from the AudioMoth survey holds 261 clips of the actual site,
and slot A could not reach any of it — the ring in `14_phenological_corpus.scd`
plays that material on the 365-day calendar, which is a calendar and not a call.

The bank now carries **116 two-second grains** (already cut by `build_corpus.py`
from each ring day's highest-confidence events) and **six geophony stems**, so
rain and wind finally have a recording. ≈114 MB resident.

**The species→role map lives in SuperCollider**, because the corpus carries
ecological roles and *no taxonomy* — that is the same fact that makes Article
43's bancadas role-labelled. A call therefore says *who* is speaking and *at what
hour*; SC decides which recording answers:

| Source | answers from |
|---|---|
| aullador · rana · murciélago | `nocturnal_voice` (the bat weighted toward clips that carry ultrasound) |
| chicharra · arriera | `insect_chorus` |
| aves · oropéndola · paujil | `dusk_` / `dawn_chorus_participant` |
| **lluvia · viento** | **geophony stems** |
| avión · cinta | their MP3s — the corpus has no anthropophony to offer |

Selection weights confidence against **hour proximity on a 24-hour ring**, through
a Gaussian of σ ≈ 3 h, about the width of a dawn chorus. A linear falloff was
tried first and does not work: it spans only 5× across the whole clock, and the
corpus is so nocturnal that the mass of far clips outvoted the near ones — a call
at 20 h still drew a median grain from 03 h. The Gaussian gives ~8×, which is the
difference between a preference and a rounding error.

**Article 47 is enforced before the clip is chosen and again in the voice.**
`opacityFloor` (CC 15) filters the eligible pool exactly as it does for the ring,
and `samplePlayer*` now carries the same veil `\corpusVoice` has always had —
that SynthDef had *none*, so routing recorded material through it would have
sounded what the Chamber had withheld. Measured: floor 0 admits 114 of 122 corpus
entries, 0.5 admits 73, 0.8 admits 23.

A call **opens a window into** the recording rather than truncating it. Five of
the seven MP3s are 51–360 s soundscape beds, not isolated calls, so a call's
duration shapes an envelope — attack, hold, release — over an excerpt taken from
a varying offset. Previously the duration was a hard `.free`, which cut a
51-second howler after 3% of itself with no release at all: a broadband click on
every call, and because the reverb and delay live *inside* the voice, the acoustic
space vanished with it.

> **The envelope now has to fit the recording.** Its span is atk+hold+rel ≈ 2.15 ×
> the hold, and that span was never computed anywhere — survivable while every
> file ran 51–360 s, wrong the moment a 2-second grain arrived: it became two
> seconds of forest followed by eight of silence holding one of twelve voices.
> The span is built explicitly now and scaled to the material when it overruns.
> Which also makes true, at last, what this section always claimed: the two short
> MP3s (ranas 4.9 s, oropéndola 6.2 s) are heard **whole**. They were not — a
> 10.75 s envelope over a 6.2 s file ran off its own end.

Only biophony is published to `__activeSpecies`: rain is not a species and
neither is an aircraft, and that field feeds the parliament's living census and
the laser's opacity clause.

Inspired by **AveRosetta™** (NeotropicalScience), a forest-communication
visualizer crossing a LiDAR cloud with annotated calls. No AveRosetta code or
data is used here; the debt is conceptual and is credited on screen.

Real annotations drop in at `assets/json/antifonia_calls.json` (schema in the
module header); absent that, the session is generated from the source table.

### Marea — the density arc

The rhythm is not a grid. There is no step pattern deciding what sounds; a slow
swell decides how *likely* any onset is, and events are placed by probability
with ±45% of a tick of jitter so nothing lands on an audible pulse. The kick can
only occur where the chain itself has a seam — a new block — and even there only
with probability `tide²`, so the low end is present at the crest and absent
through the trough.

The arc is measured in **blocks**, not seconds, so it stays locked to the
chain's own cadence rather than drifting against it when the network speeds up
or stalls.

| Control | OSC | MIDI CC | Effect |
|---|---|---|---|
| **ARCO CORTO** | `/tide/short` | CC 17 | ~3.5 blocks (40–50 s) |
| **ARCO MEDIO** | `/tide/media` | CC 18 | ~8 blocks (1.5–2 min) — default |
| **ARCO LARGO** | `/tide/larga` | CC 19 | ~25 blocks (4–6 min) |
| **PULSO** | `/tide/pulse` | CC 20 | sub-bass heartbeat, one per block, crosses the troughs |

The three arcs are **mutually exclusive, and SC owns that rule** — it is
enforced once in `~setParam` (`exclusiveGroup`), the single write path every
surface already shares, so ticking one in the browser also unticks the others
on the SC GUI and under MIDI. The browser only reflects the echo; it never
enforces. All three off is a legal state: flat density, no swell.

Watch it on `[MON]`: `tide:<arc>/<phase>=<swell>` and `puls:`.

### Gain staging

The master bus previously ran at `outPk` 3–6 against a full scale of 1.0 with
the limiter holding back 90–98% *continuously* — a compressor, not a limiter,
which is why the level barely responded to `masterVolume` or `masterAmp`. The
cause was singular: the pad layer summed **linearly** with concurrency (20 pads
= 1.96) while every other layer was ≤ 0.17.

Pads get polyphony compensation (`1/√n`, so the layer grows as `√n`), and a
single `~trimMaster` sets the absolute level.

The balance was then wrong in a second way, which peak measurements could not
see. Calibrating on the **crest** left nothing holding the **floor**: measured
over a full tidal arc the mix was below 0.05 — inaudible — in **48% of
windows**, with a 340:1 crest factor. Half the piece was silence punctuated by
peaks. The drone is now the **bed** rather than a quiet reference, the tidal
trough thins to 0.42 instead of 0.15, and the field recordings sustain and
cross-fade instead of punctuating. Result: **inaudible 48% → 16%**, crest
340:1 → **37:1**, median level ×1.8, `outPk` p90 0.745.

These trims remain the *structure* of the balance. What Row 8 adds is a live
multiplier on each of them, so the structure can be adjusted while playing
without editing constants and rebooting.

### Slot 0 is no longer entirely amber

`ParliamentStage.js` rendered every element in one hue, which made the chamber
read as a single instrument panel rather than an assembly — nothing could stand
apart from the amber because nothing was allowed to. Two elements now burn
**white phosphorous** (`#f2fff4`, a trace of green so it stays a phosphor rather
than a UI white):

* **the outermost radar ring** — the boundary of what the instrument can see.
  It is the only ring with real presence (base opacity 0.28 against 0.06), so a
  change of hue there is seen rather than inferred.
* **Alouatta, the howler** — Article 46 of the Cámara Fenológica gives it the
  one alert protocol in the statute, obliging the Corporation to attend to its
  silence. The species the instrument is bound to listen for is the species
  that is not amber. It keeps the same three-step dim→bright activity ramp as
  the others, in phosphor rather than amber, so it reads as the same state
  machine in a different substance — not as a node stuck at one colour while
  the rest of the chamber breathes.

### The SC GUI is 1-bit monospace, with two exceptions

Black and white only, one typeface (Menlo), labels in caps. The previous amber
scheme carried five hues that each encoded a state — green ok, red stop, yellow
armed — none of which survived a projector or a photograph, and which made hue
do the work that state should. Every control is white on black and an
**engaged** control inverts to black on white.

Two things are deliberately not 1-bit, because inversion needs a body to invert
and neither of these has one.

**The status lights are red when live, dark when dead.** A control has a shape
you can read; a light has nothing but its own state. When the palette went
1-bit, `mainTheme.green` and `mainTheme.red` both became `Color.white` — and the
LED drawFunc still chose between those two names as its *only* state signal, so
all five lights were identical white discs in every condition. They now carry
two literal colours of their own; an unlit light keeps its rim, so only the
filament goes out. Nothing else on the window is red, so the status row is the
one thing that can catch your eye across a stage.

Three of them were also answering the wrong question — testing whether
something had been *registered* rather than whether it was *running*, which
becomes true at boot and stays true through a dead feed:

| Light | Was | Is |
|---|---|---|
| **SERVER** | `Server.default.serverRunning` | unchanged |
| **BEAT** | `~beatRoutine.notNil` — never nil'd after `.stop`, so a stopped engine read as running | `~lastBeatTime` within 3 s, stamped once per step |
| **OSC** | `OSCdef(\txHandler).notNil` — registration, not traffic | `~lastOscTime` within 5 s |
| **ETH** | *(did not exist)* | `~lastEthTime` within 30 s — the feed the OSC light used to claim, and never watched |
| **MIDI** | a device is enumerated — stays lit through a dead cable | `~lastMidiTime` within 5 s, any CC |
| **BRIDGE RX** | `~lastBrowserOscTime` within 5 s | unchanged — the only one that was ever live |

**The knob grid is seven across.** Four performance rows of 5/5/5/6 became three of
seven — the Cámara row already proved seven fits (7 × 132 px cells + gaps + margins =
992 px inside 1100) — and `phenoRate` joined the Cámara row to make it seven too. Seven
rows became six.

**`bancada` is a button row, not a knob.** It is the last stepped spec that was still a
Knob, and a Knob cannot serve one here: `~makeKnob` rebuilds the `ControlSpec` from
`(min, max, warp)` and **drops the step**, `~setParam` re-quantises against the real spec
and writes the rounded value back into the widget, and a `\vert`-mode Knob drags
*relative to its current value*. So the write-back reset the accumulator on every mouse
event, and crossing into position 1 needed 0.125 normalised in a single event — about
16 px between two consecutive Qt moves. The knob was not sending nothing; it was sending
0, repeatedly. MIDI CC 16 and the browser's five buttons were always fine. Five radio
buttons now, reconciled from the bus at 2 Hz so every source relights them.

**Row 5, the Cámara Fenológica, is tinted amber.** It is the one bench whose
controls change *who speaks* rather than how the engine sounds. The tint marks
the row; it does not restart the hue-as-state habit the rewrite removed.

---

## 5. Laser Projection (ILDA / Helios DAC)

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

### Scanner limits (Unity RAW 1.7 W, DMX + ILDA)

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

### Galvo-safety scope (SC GUI, right-hand column)

`laser-bridge.js` sends `/laser/scope` to sclang at 12 Hz carrying the frame **after** sanitisation — the signal the DAC actually receives. The SC GUI draws it in a fixed column beside the scroll area, so it stays readable while the hands are on the knobs. Three lanes: **X**, **Y**, and the **step envelope** against the limit — a step limit is a limit on *slope*, so velocity is what the scope has to show. Decimated buckets carry the **worst** step inside them, never the step between surviving points.

Four states, all reachable:

| Condition | Reads |
|---|---|
| Within spec | `9274 / 10000 deg/s`, scan budget `48 %` |
| Frame wider than the rating | `field 31.5 deg (rated 8.0)` → *wide field* |
| Beam stopped moving | `BEAM PARKED 13.3 ms` |
| Too dense to scan | `budget 180 %`, residual `OVER-SPEED ×460` |
| Bridge absent | `no bridge` — never "compliant" |

> **Not a safety system.** This is a **Class 4** fixture (> 1.7 W RGB). People are protected by the interlock, E-stop, key, aperture mask, the fixture's own Scan Guard, beam-path design and trained operation. The scope keeps the engine inside the scanner's published *mechanical* envelope and makes loss of beam motion visible. It does not make anything eye-safe.

---

## 6. Quick Start & Diagnostics

### Run the ecosystem
```bash
./start_ecosystem.sh
```
Launches all services: nw_wrld, parliament-bridge, SuperCollider, Python ETH scraper.

### Diagnostic Sweep Test
```bash
cd nw_wrld_local && node diag-sweep.js
```
Sends all 22 params through the bridge (0 → 1 → 0.5), then runs a continuous volume LFO.

### Live engine monitor

The single most useful tool when something "sounds wrong". SuperCollider posts
one line every 2 s describing what it is actually receiving and doing:

```bash
tail -f sclang_log.txt | grep MON
```
```
[MON] flags:B-E---S  bells:47/gate:310/cap:12/bar:88  env(atk/dec/amp):0.81/0.83/0.071
      prio:0.264 ent:0.517 dens:0.312  blk:25670857 txN:290 idx:289 base:0.051  synths:9
```

| Field | Answers |
|---|---|
| `bells` | pads spawned, and skipped *by which gate*: `gate` time-gate, `cap` synth ceiling, `drop` queue overflow; `q:` shows pending/total queued |
| `kick` `perc` `err` | beat-engine spawns, and any errors the guarded loop caught and recovered from |
| `tg` `amp` | transport gain (`0.05` = Stop Parliament latched) and the performer's master level |
| `outPk` `gr` | peak level reaching the limiter, and how hard it is pulling back |
| `env` | atk/dec/amp of the last pad — if these stop being identical, the envelope is responding to the transaction |
| `prio` `ent` `dens` | live chain-derived values; a constant here means a mapping has saturated |
| `blk` `txN` `idx` `base` | whether the enriched `eth_sonify.py` payload is arriving at all |

Three OSC controls, from anything that can reach SC on **57120**:

| Address | Effect |
|---|---|
| `/diag/osctrace 1` | `OSCFunc.trace` — post **every** inbound OSC message; the definitive test of whether a control reaches SC |
| `/diag/monitor 0` | silence the `[MON]` line |
| `/diag/reset` | zero the pad counters to measure a fresh window |

### Boot sanity check

The registry banner in `sclang_log.txt` confirms the engine loaded the current
sources — worth checking first when a change appears to have no effect, since
`start_sonification.scd` reads all twelve `.scd` files from disk **at boot**:

```
Parameter registry loaded: 35 parameters, 39 OSC routes, 34 MIDI CCs.
Master limiter active (2 ch, ceiling 0.92) — output can no longer clip.
```

---

## License

MIT License
