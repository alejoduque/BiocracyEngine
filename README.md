```
  ____  _                                 _____             _
 | __ )(_) ___   ___ _ __ __ _  ___ _   _| ____|_ __   __ _(_)_ __   ___
 |  _ \| |/ _ \ / __| '__/ _` |/ __| | | |  _| | '_ \ / _` | | '_ \ / _ \
 | |_) | | (_) | (__| | | (_| | (__| |_| | |___| | | | (_| | | | | |  __/
 |____/|_|\___/ \___|_|  \__,_|\___|\__, |_____|_| |_|\__, |_|_| |_|\___|
                                    |___/             |___/
```
### SoNETH
## Ethereum Blockchain Sonification + Visualization Instrument

**Author:** alejoduque
**Aesthetic:** Lawrence English Ambient / Elektron-style Performance + Parliament of All Things

---

## Overview

A live audiovisual instrument that transforms Ethereum blockchain transactions into evolving ambient soundscapes and reactive visualizations. Every control parameter simultaneously drives SuperCollider audio synthesis and 10 visual modules via a bidirectional OSC/WebSocket bridge.

---

## Architecture & Data Flow

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
       └─ Slot 9  Hashing              (p5.js)  → __slot9Soneth ─────────┘

MIDI (Faderfox LC2) ──► SC buses ──► OSC echo ──► bridge ──► browser
```

### Bidirectional Feedback Loop

Every parameter change is reflected across all three control surfaces:

```
HTML slider ──► SC bus ──► SC GUI knob (visual update)
                    └──► OSC echo ──► HTML slider (position sync)
                                └──► applySonethToViz (10 slots)

MIDI CC ────► SC bus ──► SC GUI knob (visual update)
                  └──► OSC echo ──► HTML slider (position sync)
                              └──► applySonethToViz (10 slots)

SC GUI knob ► SC bus ──► OSC echo ──► HTML slider (position sync)
                                 └──► applySonethToViz (10 slots)
```

---

## Control Surfaces

| Surface | File | Params | Notes |
|---|---|---|---|
| **SC GUI** | `4_gui.scd` | 20 knobs | Amber palette, sends echo to bridge on change |
| **HTML GUI** | `parliament.html` | 34 sliders + vote buttons | 4 rows sonETH + Beat Engine + Parliament/Species/eDNA/Fungi |
| **MIDI CC** | `2_midi_control.scd` | 20 CC (Faderfox LC2) | Rows 1–4, CCs 0–9 and 37–41 |
| **ETH data** | `eth_sonify.py` | live blockchain | TX density, gas price, CO₂ proxy — drives beat + visuals autonomously |

---

## Control Matrix

10 core sonETH parameters × 10 visual slots = 100 bindings. Every slider/knob/CC drives both SC audio buses and all visualizations simultaneously.

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

### Row 1–2: Core Performance (Slots 4–9)

| Param | Slot 4 TimeTravel | Slot 5 DynGraphs | Slot 6 Splay | Slot 7 Geometry | Slot 8 MemHier | Slot 9 Hashing |
|---|---|---|---|---|---|---|
| **volume** | trace + marker alpha | connection + node alpha | beam + node alpha | ray brightness | block/text visibility | scanline visibility |
| **pitchShift** | sinusoidal trace modulation | vertical gravity center | root Y + layer spacing | ray angular amplitude | layer vertical spacing | bucket vertical offset |
| **timeDilation** | scroll speed, radar spin | overdrive speed | root float, snap force | grid anim + drift speed | hex refresh rate | hash mutation speed |
| **spectralShift** | trace color phosphor→cyan | center pull, glitch scale | breathing amplitude | sweep color amber→cyan | per-layer color shift | glitch tears + text rotation |
| **spatialSpread** | vertical lane range | spring rest length | tree horizontal width | ray Y lane distribution | layer width distribution | key↔bucket column spread |
| **textureDepth** | grid density, radar rings | radar arc opacity | grid weight, node rotation | grid density, radar sub-rings | inner grid density | scanline intensity |
| **atmosphereMix** | ghosting depth | afterimage depth | scan column opacity | ghosting depth | afterimage depth | afterimage depth |
| **memoryFeed** | background trail alpha | background trail alpha | background trail alpha | background trail alpha | background trail alpha | background trail alpha |
| **harmonicRich** | echo traces, diagonal grid | node color white→amber | beam color intensity | harmonic echo rays | crosshatch density | collision line weight |
| **resonantBody** | marker glow + resonance rings | outer glow rings | node wireframe size | target crosshair + outer rings | CRT border opacity | bucket border stroke |
| **txInfluence** | glitch probability, chromatic tears | jitter + glitch lines | beam distortion tears | glitch distortion tears | block displacement glitches | collision amplitude + tears |

### Row 3–4: Drone/Noise + Additional Controls (varied per slot)

Each Row 3–4 parameter is assigned a distinct "hero" role in a specific slot while still updating all slot globals:

| Param | MIDI CC | SC Audio | Hero Slot | Visual Effect |
|---|---|---|---|---|
| **masterAmp** | CC 5 | master amplitude | Slot 5 DynGraphs | node box size + glow brightness multiplier |
| **filterCutoff** | CC 6 | filter cutoff | Slot 5 DynGraphs | connection distance range (low=only close nodes link) |
| **noiseLevel** | CC 7 | noise amount | Slot 7 Geometry | background grid warp distortion amplitude |
| **noiseFilt** | CC 8 | noise filter | Slot 7 Geometry | number of eco sweep lines visible (1→4) |
| **droneDepth** | CC 9 | drone intensity | Slot 0 Parliament | radar grid breath scale; Slot 4: inner ring count (2→8) |
| **droneFade** | CC 37 | drone envelope | Slot 4 TimeTravel | trace color warmth (cool phosphor → deep amber) |
| **droneSpace** | CC 38 | drone spatial | Slot 6 Splay | vertical tree root offset (pushes tree down the frame) |
| **droneMix** | CC 39 | drone blend | Slot 6 Splay | scan column density + brightness |
| **delayFeedback** | CC 40 | delay feedback | Slot 8 MemHier | ghost trail persistence (reduces wipe → lingering layers) |
| **beatTempo** | CC — | beat engine ×0.5–2 | Slot 8 MemHier | hex matrix mutation rate; Slot 9: hash reassignment speed |
| **txInfluence** | CC 41 | TX→beat weight | All slots | ETH event glitch probability across all visualizations |

### Slot 0 — Reactive Radar Grid

The Parliament Stage concentric rings are no longer static. They live in a `_radarGroup` that:

- **Rotates** slowly counter-clockwise, speed driven by `timeDilation` + `txInfluence` bursts
- **Breathes** in scale: `droneDepth` expands/contracts the ring plane
- **Pulses opacity** per ring: outer ring brightens with consensus, inner rings shimmer with consensus wave phase
- **Tick marks** flash intensity with ETH CO₂ activity
- **Axes** darken at low consensus, open at high consensus

### Beat Engine — Data-Driven Melodic Pool

The beat engine reads live from SC buses each cycle:

| SC Bus | Beat Engine Effect |
|---|---|
| `harmonicRich` | pitch pool size + spread (FM ratio → harmonic series) |
| `resonantBody` | voicing mode: single / dyad / triad / 1–8 partials |
| `textureDepth` | harmonic count (number of simultaneous percussion synths) |
| `atmosphereMix` | pitch pool vertical spread |
| `memoryFeed` | ghost hit probability (secondary echo percussions) |
| `droneFade` | melodic envelope time |
| `txInfluence` | ETH activity → pitch pool intensity (smooth exponential decay, no hard cuts) |

---

## Unified Parameter Ranges

All three control paths (HTML sliders, MIDI CC, SC GUI) agree on the same real-world units via `6_osc_handlers.scd` remapping:

| Param | HTML 0–1 | OSC remap → bus | MIDI CC | SC GUI spec |
|---|---|---|---|---|
| masterVolume | 0–1 | linlin → 0.01–1 | CC 0 | ControlSpec(0.01, 1) |
| pitchShift | 0–1 | linlin → −24,+24 | CC 1 | ControlSpec(−24, 24) |
| timeDilation | 0–1 | linexp → 0.5–6 | CC 2 | ControlSpec(0.5, 6, exp) |
| spectralShift | 0–1 | linexp → 80–3000 Hz | CC 3 | ControlSpec(80, 3000, exp) |
| spatialSpread | 0–1 | linlin → −1,+1 | CC 4 | ControlSpec(−1, 1) |
| textureDepth | 0–1 | linlin → 0–0.6 | CC 32 | ControlSpec(0, 0.6) |
| atmosphereMix | 0–1 | linlin → 0–0.9 | CC 33 | ControlSpec(0, 0.9) |
| memoryFeed | 0–1 | linlin → 0–0.8 | CC 34 | ControlSpec(0, 0.8) |
| harmonicRich | 0–1 | linexp → 0.1–8 | CC 35 | ControlSpec(0.1, 8, exp) |
| resonantBody | 0–1 | linlin → 0.1–0.8 | CC 36 | ControlSpec(0.1, 0.8) |
| droneDepth | 0–1 | linlin → 0–1 | CC 9 | ControlSpec(0, 1) |
| delayFeedback | 0–1 | linlin → 0–0.95 | CC 40 | ControlSpec(0, 0.95) |
| txInfluence | 0–1 | linlin → 0–1 | CC 41 | ControlSpec(0, 1) |

> **SpectralShift safety**: all SynthDefs use LPF (not BPF) so the filter at maximum is transparent, never silent. Ceiling hard-clamped at 3000 Hz.

---

## Voting System

Parliament vote actions trigger sonic events and visual bursts across all 10 slots.

| Action | Sound | Visual |
|---|---|---|
| **Vote passed** | Tempo burst ×1.6 for 4s + bell chord (root+5th+oct) | Bloom flash, warm glow, atmosphere spike |
| **Vote failed** | Same sonic burst | Red shift: spectral/resonant/texture spike, 3s decay |
| **Emergency** | Drone drops to 35 Hz sub-bass, noise surge, 6s recovery | Spatial collapse, brightness drop, 6s recovery |
| **Stop** | masterAmp → 0.05, drone → 0.02 | All visual params dimmed to 0.05 |
| **Start** | masterAmp → 0.7, drone restored | All params restored to defaults |

---

## Beat Engine

The beat engine (`5_beat_engine.scd`) evolves continuously rather than repeating:

- **Data-driven pitch pool**: reads `harmonicRich`, `txInfluence`, `textureDepth` from live buses each cycle
- **Voicing modes**: `resonantBody` selects single / dyad / triad / 1–8 simultaneous partials
- **Smooth ETH decay**: `exp(-timeSinceLastTx × 0.5)` envelope prevents hard cuts on quiet blocks
- **Phrase mutation** every 4 bars: kick pattern shifts, ghost fills appear/disappear
- **Shifting polyrhythm**: percussion divisor cycles 3-5-7-4-6
- **Drone pitch drift**: cycles through harmonic series (55, 62, 73, 82, 49, 65, 41 Hz)
- **Micro-swing**: odd steps delayed 0–12% for groove

---

## Quick Start

```bash
./start_ecosystem.sh
```

Launches all services: nw_wrld, parliament-bridge, SuperCollider, Python ETH scraper.

### Manual Start

1. **SuperCollider**: Open SC IDE, run `start_sonification.scd`
2. **Python ETH**: `cd eth_sonification && source venv/bin/activate && python eth_sonify.py`
3. **Bridge**: `cd nw_wrld_local && node parliament-bridge.js`
4. **nw_wrld**: `cd nw_wrld_local && npx electron .`

### IUCN Red List API Setup

Species data is fetched live from the IUCN Red List API v4 (Colombian endangered species including plants). The token is injected at build time via webpack DefinePlugin — never committed to the repo.

```bash
cp nw_wrld_local/.env.example nw_wrld_local/.env
# Edit .env and add your IUCN API token (get one at https://api.iucnredlist.org/)
```

Data flow: **RLI local server** (localhost:3001, CORS-friendly) → **IUCN API direct** → **hardcoded fallback roster**.

---

## Diagnostics

### Bridge Diagnostic Endpoint

```bash
curl http://localhost:3335/diag
```

Shows message counts per path, direction, coverage report of all SC_TO_CH routes (35 paths registered).

### Browser Debug Overlay

Press **Shift+D** in parliament browser window. Shows:
- Live param values for all 21 params (Row 1–4 + Beat Engine)
- Per-slot status dots (10 slots, green = updated in last 2s, amber = stale, grey = never)
- WebSocket connection state and message count

### Sweep Test

```bash
cd nw_wrld_local && node diag-sweep.js
```

Sends all 22 params through the bridge (0 → 1 → 0.5), then runs a continuous volume LFO.

---

## Audio Hardware

BiocracyEngine auto-detects audio hardware at boot:

- **MOTU 828x (Gen5) present** → 4-channel quadraphonic output, 2 inputs
- **No MOTU detected** → falls back to macOS Core Audio stereo (2 ch out / 2 ch in)

---

## File Structure

```
BiocracyEngine/
├── start_ecosystem.sh              # Full system launcher (graceful kill + restart)
├── start_sonification.scd          # SC-only launcher
├── 1_server_config.scd             # Server config, MOTU/Core Audio auto-detect
├── 2_midi_control.scd              # Faderfox LC2 MIDI mapping (20 CCs, 4 rows)
├── 3_synthdefs.scd                 # SynthDefs (elektronBell, opalKick/Perc/Drone/Dust)
├── 4_gui.scd                       # SC GUI (amber palette, 20 knobs, echo on change)
├── 5_beat_engine.scd               # Evolving beat engine (data-driven pitch pool)
├── 6_osc_handlers.scd              # OSC in + ~oscToParamMap + beatTempo/txInfluence echo
├── 7_trend_analysis.scd            # Transaction trend analysis
├── 8_transaction_buffer.scd        # Transaction management
├── 9_spatial_headphone_sim.scd     # 4-channel spatial audio
├── 10_sample_system.scd            # Sample playback (field recordings)
├── 11_recording_system.scd         # Multichannel recording
├── 12_spatial_gui.scd              # Spatial positioning GUI
├── 13_diagnostic_sweep.scd         # SC-side diagnostic sweep
├── eth_sonify.py                   # Python Ethereum connector (web3)
└── nw_wrld_local/
    ├── parliament-bridge.js        # OSC↔WebSocket bridge (UDP:3333↔WS:3334, /diag HTTP:3335)
    ├── diag-sweep.js               # Node.js diagnostic sweep (22 params)
    ├── .env.example                 # Template for IUCN API token
    ├── webpack.config.js            # Webpack (DefinePlugin injects .env tokens)
    ├── src/projector/
    │   ├── parliamentEntry.ts      # Hub: applySonethToViz (all 10 slots), DIAG monitor, WS bridge
    │   ├── visualizationSwitcher.ts # Slots 0–3 mount/unmount, species roster, IUCN helpers
    │   ├── dataStructureVisuals.ts  # Slots 4–9 (TimeTravel/DynGraph/Splay/Geometry/MemHier/Hashing)
    │   ├── speciesFetcher.ts        # IUCN Red List API integration (3-tier fallback)
    │   ├── parliament/
    │   │   └── parliamentStore.ts  # Reactive state store (consensus, species, eDNA, eco)
    │   └── views/
    │       └── parliament.html     # HTML GUI: 34 sliders (Rows 1–4 + Beat Engine) + vote panel
    └── src/main/starter_modules/
        ├── ParliamentStage.js      # Slot 0: Three.js 3D scene + reactive radar grid
        ├── LowEarthPointModule.js  # Slot 2: Three.js point cloud (consensus brightness)
        ├── PerlinBlob.js           # Slot 3: p5.js Perlin noise blob
        └── ZKProofVisualizer.js    # ZK proof overlay
```

---

## Dependencies

- SuperCollider 3.13.0+
- Node.js 20+ with npm
- Python 3.8+ with web3, python-osc
- Electron 39+
- Faderfox LC2 MIDI Controller (optional)
- MOTU 828x Gen5 audio interface (optional — falls back to Core Audio stereo)

## License

MIT License

## Contact

- GitHub: [@alejoduque](https://github.com/alejoduque)
