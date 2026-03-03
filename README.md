```
  ____         _   _ _____ _____ _   _
 / ___|  ____ | \ | | ____|_   _| | | |
 \___ \ / _//\|  \| |  _|   | | | |_| |
  ___) | (//) | |\  | |___  | | |  _  |
 |____/ \//__/|_| \_|_____| |_| |_| |_|
```

# SoNETH BiocracyEngine
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
                            nw_wrld Browser (4 visual slots)
                                       │
                            ┌──────────┼──────────┐──────────┐
                            ▼          ▼          ▼          ▼
                        Slot 0     Slot 1     Slot 2     Slot 3
                      Parliament  Asteroid   LowEarth   Perlin
                       (Three.js)  (p5.js)   (Three.js)  (p5.js)
```

### Control Surfaces

- **SC GUI** (4_gui.scd) — 20 knobs, amber palette
- **HTML GUI** (parliament.html) — 34 sliders + vote/emergency buttons
- **MIDI CC** (Faderfox LC2) — hardware performance control
- **ETH data** — live transaction values drive sound + visuals autonomously

---

## Quick Start

```bash
./start_ecosystem.sh
```

This launches all services: nw_wrld, parliament-bridge, SuperCollider, Python ETH scraper.

### Manual Start

1. **SuperCollider**: Open SC IDE, run `start_sonification.scd`
2. **Python ETH**: `cd eth_sonification && source venv/bin/activate && python eth_sonify.py`
3. **Bridge**: `cd nw_wrld_local && node parliament-bridge.js`
4. **nw_wrld**: `cd nw_wrld_local && npx electron .`

---

## Control Matrix

10 core sonETH parameters x 4 visual slots = 40 bindings. Every slider/knob/MIDI CC drives both SC audio buses and all visualizations simultaneously.

| Param | SC Audio | Slot 0 Parliament | Slot 1 AsteroidWaves | Slot 2 LowEarthPoint | Slot 3 PerlinBlob |
|---|---|---|---|---|---|
| **volume** | master volume | point light intensity | wave stroke alpha | white cloud opacity | stroke opacity |
| **pitchShift** | freq +-2 oct | species Z amplitude | lane X offset | cloud Y-stretch | noise intensity |
| **timeDilation** | env stretch | orbit speed | noise X zoom | rotation damping | cycle frames |
| **spectralShift** | filter sweep | bloom threshold | amber-cyan tint | line hue shift | layer compression |
| **spatialSpread** | quad pan | camera distance | lane spread | lines XY spread | blob X/Y offset |
| **textureDepth** | granular density | film grain | grid line density | point size | stroke weight |
| **atmosphereMix** | reverb amount | afterimage damp | background ghosting | red cloud opacity | layer count |
| **memoryFeed** | delay feedback | bloom strength | ghost trail alpha | red lines opacity | ghost alpha |
| **harmonicRich** | FM complexity | lissajous complexity | harmonic overlay | Bezier Z-scale | hue drift |
| **resonantBody** | filter resonance | chroma aberration | peak dot glow | red cloud scale | inner weight |

### Additional Control Rows (Rows 3-4)

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
| beatTempo | Beat engine tempo (0.5-2x) |

---

## Voting System

Parliament vote actions trigger both sonic events and visual bursts across all 4 slots.

| Action | Sound Effect | Visual Effect |
|---|---|---|
| **Vote (passed)** | Tempo burst x1.6 for 4s + bell chord (root+5th+octave) | Bloom flash, warm glow, atmosphere spike across all slots |
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
- **Micro-swing**: odd steps delayed 0-12% for groove

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

Sends all 22 params through the bridge (0 to 1 to 0.5), then runs a continuous volume LFO.

---

## File Structure

```
BiocracyEngine/
├── start_ecosystem.sh              # Full system launcher
├── start_sonification.scd          # SC-only launcher
├── 1_server_config.scd             # Server config and control buses
├── 2_midi_control.scd              # Faderfox LC2 MIDI mapping
├── 3_synthdefs.scd                 # SynthDefs (elektronBell, opalKick/Perc/Drone/Dust)
├── 4_gui.scd                       # SC GUI (amber palette, 4 rows of knobs)
├── 5_beat_engine.scd               # Evolving beat engine with TX influence
├── 6_osc_handlers.scd              # OSC handlers + vote/emergency routing
├── 7_trend_analysis.scd            # Transaction trend analysis
├── 8_transaction_buffer.scd        # Transaction management
├── 9_spatial_headphone_sim.scd     # 4-channel spatial audio
├── 10_sample_system.scd            # Sample playback (field recordings)
├── 11_recording_system.scd         # Multichannel recording
├── 12_spatial_gui.scd              # Spatial positioning GUI
├── 13_diagnostic_sweep.scd         # SC-side diagnostic sweep
├── eth_sonify.py                   # Python Ethereum connector
└── nw_wrld_local/
    ├── parliament-bridge.js        # OSC<->WebSocket bridge + diagnostics
    ├── diag-sweep.js               # Node.js diagnostic sweep
    ├── src/projector/
    │   ├── parliamentEntry.ts      # Central control hub (applySonethToViz)
    │   ├── visualizationSwitcher.ts # 4 visual slots mount/unmount
    │   ├── parliament/
    │   │   └── parliamentStore.ts  # Reactive state store
    │   └── views/
    │       └── parliament.html     # HTML GUI (34 sliders + vote panel)
    └── src/main/starter_modules/
        ├── ParliamentStage.js      # Slot 0: Three.js 3D scene
        ├── LowEarthPointModule.js  # Slot 2: Three.js point cloud
        ├── PerlinBlob.js           # Slot 3: p5.js Perlin noise blob
        └── ZKProofVisualizer.js    # ZK proof overlay
```

---

## Dependencies

- SuperCollider 3.13.0+
- Node.js 18+ with npm
- Python 3.8+ with web3, python-osc
- Faderfox LC2 MIDI Controller (optional)
- 4-channel audio interface (optional, for quad setup)

## License

MIT License

## Contact

- GitHub: [@alejoduque](https://github.com/alejoduque)
