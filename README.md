```
  ____  _                                 _____             _
 | __ )(_) ___   ___ _ __ __ _  ___ _   _| ____|_ __   __ _(_)_ __   ___
 |  _ \| |/ _ \ / __| '__/ _` |/ __| | | |  _| | '_ \ / _` | | '_ \ / _ \
 | |_) | | (_) | (__| | | (_| | (__| |_| | |___| | | | (_| | | | | |  __/
 |____/|_|\___/ \___|_|  \__,_|\___|\__, |_____|_| |_|\__, |_|_| |_|\___|
                                    |___/             |___/
```

# BiocracyEngine

A live audiovisual instrument and a deployable public artifact that couples three registers into a single feedback loop: a public blockchain, a deliberative assembly (the multispecies parliament), and the phenology of a tropical dry forest. Every control parameter simultaneously drives SuperCollider audio synthesis and visual modules (slots 0–9, P, F, B, E, and R) via a bidirectional OSC/WebSocket bridge.

Rather than "visualizing data," the engine performs a cybernetic coupling where the forest, blockchain protocols, and human actions hold equal standing as political agents.

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
       └─ Slot R  Registro     (canvas · pretext ASCII field × slot 6) ──┘
                  └─ reverse: buffer → /soneth/memoryfeed, consensus → atmospheremix

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
| **Python ETH** | `eth_sonify.py` (venv) | → UDP **57120** | web3 scraper; maps each tx value→note/velocity |
| **SuperCollider** | `sclang start_sonification.scd` | in **57120** (OSC) + **MIDI**; out **3333**; scsynth **57110** | audio engine, GUI, beat engine, drone |
| **Bridge** | `parliament-bridge.js` (Node) | in UDP **3333**; WS **3334**; out UDP **57120**; HTTP **3335** `/diag` | OSC ↔ WebSocket, path translation |
| **Browser** | webpack-dev-server + Electron | HTTP **9001**; WS **3334** | `parliament.html` GUI, store, visual slots |
| **Laser** _(opt)_ | `laser-bridge.js` (Node, `LASER=1`) | WS **3337** in; USB → Helios DAC | vector frames → ILDA / laser onto the forest |

---

## 4. Control Matrix

10 core parameters × 10 visual slots = 100 bindings. Every slider/knob/CC drives both SC audio buses and all visualizations simultaneously.

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

---

## License

MIT License
