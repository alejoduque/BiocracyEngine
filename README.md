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

A live audiovisual instrument that transforms Ethereum blockchain transactions into evolving ambient soundscapes and reactive visualizations. Every control parameter simultaneously drives both SuperCollider audio synthesis and 4 visual modules via a bidirectional OSC/WebSocket bridge.

### Architecture

```
ETH Blockchain ──► Python (web3) ──► OSC ──► SuperCollider (audio)
                                       │            │
                                       │       OSC echo (port 3333)
                                       │            │
                                       ▼            ▼
                               parliament-bridge.js (OSC ↔ WS)
                                       │
                                    WS:3334
                                       │
                                       ▼
                            nw_wrld Browser (10 visual slots)
                                       │
              ┌────────┬────────┬──────┼──────┬────────┬────────┐
              ▼        ▼        ▼      ▼      ▼        ▼        ▼
          Slot 0   Slot 1   Slot 2  Slot 3  Slot 4  Slot 5   Slot 6
         Parliament Asteroid LowEarth Perlin TimeTravel DynGraph Splay
          (Three)   (p5)    (Three)  (p5)    (p5)     (p5)     (p5)
              ┌────────┬────────┐
              ▼        ▼        ▼
          Slot 7   Slot 8   Slot 9
         Geometry MemHier  Hashing
          (p5)     (p5)     (p5)
```

### Control Surfaces

- **SC GUI** (`4_gui.scd`) — 20 knobs, amber palette, white labels
- **HTML GUI** (`parliament.html`) — 34 sliders + vote/emergency buttons
- **MIDI CC** (Faderfox LC2) — hardware performance control
- **ETH data** — live transaction values drive sound + visuals autonomously

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

---

## Control Matrix

10 core sonETH parameters × 10 visual slots = 100 bindings. Every slider/knob/MIDI CC drives both SC audio buses and all visualizations simultaneously.

### Slots 0–3 (Three.js + p5.js core modules)

| Param | SC Audio | Slot 0 Parliament | Slot 1 AsteroidWaves | Slot 2 LowEarthPoint | Slot 3 PerlinBlob |
|---|---|---|---|---|---|
| **volume** | master volume | point light intensity | wave stroke alpha | white cloud opacity | stroke opacity |
| **pitchShift** | freq ±2 oct | species Z amplitude | lane X offset | cloud Y-stretch | noise intensity |
| **timeDilation** | env stretch × 0.5–6 | orbit speed | noise X zoom | rotation damping | cycle frames |
| **spectralShift** | LPF sweep 80–3000 Hz | bloom threshold | amber-cyan tint | line hue shift | layer compression |
| **spatialSpread** | quad pan L↔R | camera distance | lane spread | lines XY spread | blob X/Y offset |
| **textureDepth** | granular density 0–0.6 | film grain | grid line density | point size | stroke weight |
| **atmosphereMix** | reverb 0–0.9 | afterimage damp | background ghosting | red cloud opacity | layer count |
| **memoryFeed** | delay feedback 0–0.8 | bloom strength | ghost trail alpha | red lines opacity | ghost alpha |
| **harmonicRich** | FM ratio 0.1–8 | lissajous complexity | harmonic overlay | Bezier Z-scale | hue drift |
| **resonantBody** | filter Q 0.1–0.8 | chroma aberration | peak dot glow | red cloud scale | inner weight |

### Slots 4–6 (p5.js data structure visualizations)

| Param | Slot 4 TimeTravel | Slot 5 DynamicGraphs | Slot 6 DynamicOptimality |
|---|---|---|---|
| **volume** | trace + marker alpha | connection + node alpha, label brightness | beam + node alpha, label size |
| **pitchShift** | sinusoidal trace modulation | vertical gravity center bias | root Y position + layer spacing |
| **timeDilation** | scroll speed, radar spin | system overdrive speed | root float, scroll speed, snap force |
| **spectralShift** | trace color phosphor→cyan | center pull magnetism, glitch scale | breathing amplitude, vibration freq |
| **spatialSpread** | vertical lane range | spring rest length | tree horizontal width |
| **textureDepth** | grid density/weight, radar rings | radar arc opacity, node size | grid opacity/weight, node rotation |
| **atmosphereMix** | ghosting depth | afterimage depth | sonar scan columns |
| **memoryFeed** | background trail alpha | background trail alpha | background trail alpha |
| **harmonicRich** | echo traces, diagonal sub-grid | node color amber↔white | beam color intensity |
| **resonantBody** | marker glow size, resonance rings | outer glow rings on nodes | node wireframe size |
| **txInfluence** | glitch probability, chromatic tears | jitter intensity, glitch lines | beam distortion tears |

### Slots 7–9 (p5.js data structure visualizations)

| Param | Slot 7 Geometry | Slot 8 MemoryHierarchy | Slot 9 Hashing |
|---|---|---|---|
| **volume** | ray brightness, sweep alpha | block/text visibility | scanline visibility |
| **pitchShift** | ray angular amplitude | layer vertical spacing | bucket vertical offset |
| **timeDilation** | grid animation, drift speed, radar spin | hex refresh rate, block noise speed | hash mutation speed |
| **spectralShift** | sweep color amber↔cyan | per-layer color amber↔cyan | glitch tears, text rotation |
| **spatialSpread** | ray Y lane distribution | layer width distribution | key↔bucket column spread |
| **textureDepth** | grid density/weight, radar sub-rings | inner grid density, hex count/size | scanline intensity/weight |
| **atmosphereMix** | ghosting depth | afterimage depth | afterimage depth |
| **memoryFeed** | background trail alpha | background trail alpha | background trail alpha |
| **harmonicRich** | harmonic echo rays | crosshatch density, cross-hatch | collision line weight |
| **resonantBody** | target crosshair glow, outer rings | CRT border opacity/weight | bucket border stroke |
| **txInfluence** | glitch distortion tears | block displacement glitches | collision path amplitude, tears |

### Consensus → Brightness (all modules)

The `/bio/consensus` stream (derived from Ethereum gas price via SC) now drives **visual brightness across all active modules**, not just Parliament:

| Module | Consensus effect |
|---|---|
| **ParliamentStage** (Slot 0) | Already wired — ambient light intensity |
| **PerlinBlob** (Slot 3) | Saturation 30→100%, brightness 40→100% |
| **LowEarthPoint** (Slot 2) | Line lightness 0.15→0.75, opacity 0.05→0.4 |
| **ZKProofVisualizer** | Match rate and swap speed |

### Unified Parameter Ranges (all input paths)

All three control paths (HTML sliders, MIDI CC, SC GUI knobs) now agree on the same real-world units via per-parameter remapping in `6_osc_handlers.scd`:

| Param | HTML slider | OSC remap → bus | MIDI CC | SC GUI spec |
|---|---|---|---|---|
| masterVolume | 0–1 | linlin → 0.01–1 | CC 0: linlin → 0–1 | ControlSpec(0.01, 1) |
| pitchShift | 0–1 | linlin → −24,+24 | CC 1: linlin → −24,+24 | ControlSpec(−24, 24) |
| timeDilation | 0–1 | linexp → 0.5–**6** | CC 2: linexp → 0.5–**6** | ControlSpec(0.5, 6, exp) |
| spectralShift | 0–1 | linexp → 80–**3000 Hz** | CC 3: linexp → 60–**3000 Hz** | ControlSpec(80, 3000, exp) |
| spatialSpread | 0–1 | linlin → **−1,+1** | CC 4: linlin → −1,+1 | ControlSpec(−1, 1) |
| textureDepth | 0–1 | linlin → 0–**0.6** | CC 32: linlin → 0–1 | ControlSpec(0, 0.6) |
| atmosphereMix | 0–1 | linlin → 0–**0.9** | CC 33: linlin → 0–1 | ControlSpec(0, 0.9) |
| memoryFeed | 0–1 | linlin → 0–**0.8** | CC 34: linlin → 0–**0.8** | ControlSpec(0, 0.8) |
| harmonicRich | 0–1 | linexp → 0.1–8 | CC 35: linexp → 0.1–8 | ControlSpec(0.1, 8, exp) |
| resonantBody | 0–1 | linlin → 0.1–**0.8** | CC 36: linlin → 0.1–**0.8** | ControlSpec(0.1, 0.8) |

> **SpectralShift safety**: all SynthDefs use LPF (not BPF) so the filter at maximum is transparent, never silent. Ceiling hard-clamped at 3000 Hz in synthdefs as a final safety net.

### Additional Control Rows (Rows 3–4)

| Param | Function |
|---|---|
| masterAmp | Legacy master amplitude |
| filterCutoff | Legacy filter control |
| noiseLevel | Noise amount |
| noiseFilt | Noise filtering |
| droneDepth | Drone intensity |
| droneFade | Drone envelope time |
| droneSpace | Drone spatial positioning |
| droneMix | Drone blend amount |
| delayFeedback | Additional delay control |
| txInfluence | Transaction influence on beat engine |
| beatTempo | Beat engine tempo (0.5–2×) |

---

## Voting System

Parliament vote actions trigger both sonic events and visual bursts across all 4 slots.

| Action | Sound Effect | Visual Effect |
|---|---|---|
| **Vote (passed)** | Tempo burst ×1.6 for 4s + bell chord (root+5th+octave) | Bloom flash, warm glow, atmosphere spike across all slots |
| **Vote (failed)** | Same sonic burst | Red shift: spectral/resonant/texture spike, 3s decay |
| **Emergency** | Drone drops to 35Hz sub-bass, noise surge, 6s recovery | Spatial collapse, brightness drop, red overlay, 6s recovery |
| **Stop** | masterAmp to 0.05, drone to 0.02 | All visual params dimmed to 0.05 |
| **Start** | masterAmp to 0.7, drone restored to 55Hz | All params restored to defaults |

---

## Beat Engine Evolution

The beat engine evolves over time rather than repeating:

- **Phrase mutation** every 4 bars: kick pattern shifts, ghost fills appear/disappear
- **Shifting polyrhythm**: percussion divisor cycles 3-5-7-4-6
- **Probability-based dust**: not grid-locked, influenced by TX density
- **Drone pitch drift**: cycles through harmonic series (55, 62, 73, 82, 49, 65, 41 Hz)
- **Melodic percussion**: rotating pitch pool with random detune
- **Micro-swing**: odd steps delayed 0–12% for groove

---

## Audio Hardware

BiocracyEngine auto-detects audio hardware at boot:

- **MOTU 828x (Gen5) present** → 4-channel quadraphonic output, 2 inputs
- **No MOTU detected** → falls back to macOS Core Audio stereo (2 ch out / 2 ch in)

`1_server_config.scd` handles detection and configures SuperCollider server options accordingly.

---

## Diagnostics

### Bridge Diagnostic Endpoint

```bash
curl http://localhost:3335/diag
```

Shows message counts per path, direction, coverage report of all SC_TO_CH routes.

### Browser Debug Overlay

Press **Shift+D** in parliament browser window. Shows live param values, per-slot status dots, WebSocket state.

### Sweep Test

```bash
cd nw_wrld_local && node diag-sweep.js
```

Sends all 22 params through the bridge (0 → 1 → 0.5), then runs a continuous volume LFO.

---

## File Structure

```
BiocracyEngine/
├── start_ecosystem.sh              # Full system launcher (graceful kill + restart)
├── start_sonification.scd          # SC-only launcher
├── 1_server_config.scd             # Server config, MOTU/Core Audio auto-detect
├── 2_midi_control.scd              # Faderfox LC2 MIDI mapping (aligned ranges)
├── 3_synthdefs.scd                 # SynthDefs (elektronBell, opalKick/Perc/Drone/Dust)
├── 4_gui.scd                       # SC GUI (amber palette, white knob labels)
├── 5_beat_engine.scd               # Evolving beat engine with TX influence
├── 6_osc_handlers.scd              # OSC handlers + unified param remapping table
├── 7_trend_analysis.scd            # Transaction trend analysis
├── 8_transaction_buffer.scd        # Transaction management
├── 9_spatial_headphone_sim.scd     # 4-channel spatial audio
├── 10_sample_system.scd            # Sample playback (field recordings)
├── 11_recording_system.scd         # Multichannel recording
├── 12_spatial_gui.scd              # Spatial positioning GUI
├── 13_diagnostic_sweep.scd         # SC-side diagnostic sweep
├── eth_sonify.py                   # Python Ethereum connector
└── nw_wrld_local/
    ├── parliament-bridge.js        # OSC↔WebSocket bridge + diagnostics
    ├── diag-sweep.js               # Node.js diagnostic sweep
    ├── src/projector/
    │   ├── parliamentEntry.ts      # Central control hub (applySonethToViz)
    │   ├── visualizationSwitcher.ts # Slots 0–3 mount/unmount + shared utils
    │   ├── dataStructureVisuals.ts  # Slots 4–9 (TimeTravel, DynGraph, Splay, Geometry, MemHier, Hashing)
    │   ├── parliament/
    │   │   └── parliamentStore.ts  # Reactive state store
    │   └── views/
    │       └── parliament.html     # HTML GUI (34 sliders + vote panel)
    └── src/main/starter_modules/
        ├── ParliamentStage.js      # Slot 0: Three.js 3D scene
        ├── LowEarthPointModule.js  # Slot 2: Three.js point cloud (consensus brightness)
        ├── PerlinBlob.js           # Slot 3: p5.js Perlin noise blob (consensus brightness)
        └── ZKProofVisualizer.js    # ZK proof overlay (consensus match rate)
```

---

## Dependencies

- SuperCollider 3.13.0+
- Node.js 18+ with npm
- Python 3.8+ with web3, python-osc
- Faderfox LC2 MIDI Controller (optional)
- MOTU 828x Gen5 audio interface (optional — falls back to Core Audio stereo)

## License

MIT License

## Contact

- GitHub: [@alejoduque](https://github.com/alejoduque)
