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
  ├─ 4_gui.scd             SC GUI knobs (20 params, amber palette)
  ├─ 5_beat_engine.scd     Evolving beat engine (TX-driven melodic pool)
  ├─ 6_osc_handlers.scd    OSC in from HTML/bridge → ~buses
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
       ├─ Slot 0  ParliamentStage.js   (Three.js)                        │
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
                  ├─ events:  calls → /sample/trigger → the field recordings
                  └─ reverse: chorus → /soneth/texturedepth, spread →
                              spatialspread, machine share → noiselevel

MIDI (Faderfox Micromodul LC2) ──► SC buses ──► OSC echo ──► bridge ──► browser
```

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
| **droneFade** | CC 37 | glide time on the drone's own controls |
| **droneSpace** | CC 38 | reverb room size |
| **droneMix** | CC 39 | dry drone ↔ fully bloomed (wash + sub) |
| **delayFeedback** | CC 40 | comb delay feedback |
| **transactionInfluence** | CC 41 | how far chain activity bends the engine |

> Six of these (CC 5, 6, 9, 37, 38, 39) previously wrote to control buses that
> **no UGen read** — `\opalDrone` did not declare them and `\elektronBell` read
> them into variables it discarded. They now shape the drone.

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
pentandra*) with a clean bole and a flat tiered crown, four campanos (*Albizia
saman*) in umbrella domes wider than they are tall, ~53 ordinary dry-forest
canopy trees, and exactly two wine palms (*Attalea butyracea*) — 60 trees,
counted at runtime and published on `window.__antifoniaStand`. They are **sown,
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

The candles are **immersed**. Canopy sources sing from a **bird actually
crossing the stand** — seven of them fly at canopy and emergent height, wings
beating, and the sky empties outside their hours. First you see who is
speaking, then what they said. Failing a bird, the call takes a **perch**: a
tree in this stand tall enough to reach its stratum. The howler can only be in
the ceiba, because it is the one emergent. The aircraft has no perch — it is in
the atmosphere, which is what it is. The strip along the bottom draws the same
reading as a full chart, time on x and frequency on y.

**Mycelium** runs under the ground and keeps going past the plot and out of
frame on every side. That it leaves is the claim, not a framing slip: the
network does not recognise the parcel boundary or the viewport. The unit the
eye thinks it is looking at — this stand, this rectangle — is an administrative
cut across something continuous. The forest above can be framed; the one below
cannot. It breathes with the mycorrhizal stratum's own weight, one opacity
write for ~7 000 segments.

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

**It really sounds.** Calls fire the seven field recordings in
`10_sample_system.scd` through `/sample/trigger`, each opened in that call's
frequency band and panned by its position. Geophony sources are drawn but
silent — there is no rain or wind recording yet — and the HUD says so out loud
rather than letting the gap disappear. Adding one is a file in `samples/` and a
line in `~samplePaths`.

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

Pads now get polyphony compensation (`1/√n`, so the layer grows as `√n`), the
per-layer trims set the balance around the drone as reference, and a single
`~trimMaster` sets the absolute level. Measured across a full arc at
`vol/amp 0.70`: `outPk` p90 **0.78**, `gr` median **1.00**.

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
