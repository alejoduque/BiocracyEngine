# About BiocracyEngine / SoNETH

**A live audiovisual instrument coupling blockchain, parliament, and ecology into one feedback loop.**

---

## Premise

BiocracyEngine treats three nominally-separate domains — a public blockchain, a deliberative parliament, and a tropical species inventory — as parts of the same instrument. They share control surfaces (Faderfox LC2 MIDI, an HTML slider GUI, a SuperCollider GUI), they share state (a single OSC/WebSocket bridge), and they feed each other in both directions.

The piece does not "visualize data." It performs a coupling.

- A live Ethereum stream (`eth_sonify.py`) drives beat density, melodic pool, biogeochemical overlays, and consensus modulation across every visual slot simultaneously.
- A parliamentary vote (pass / fail / emergency / trigger) pulses the visuals and shifts the consensus brightness propagated by `/bio/consensus` to all modules.
- The Phenological Calendar — built from 572 species recorded at Reserva Manakai in Planeta Rica, Córdoba, Colombia — runs a 365-day ring whose current position feeds `harmonicrich` and `texturedepth` back into the SuperCollider engine. The forest plays the synth.

The result is an instrument where the performer's gestures, the blockchain's activity, the parliament's decisions, and the tropical year all participate in a single shared timeline.

---

## Author

**alejoduque** — sound artist, researcher, instrument-builder.

---

## Aesthetic

The piece sits at the junction of two reference points:

- **Lawrence English / ambient performance** — slow gestures, exponential decays, no abrupt cuts, every parameter smoothed.
- **Elektron-style hardware performance** — knob-per-parameter, immediate physical control, tactile bidirectional feedback (MIDI ↔ SC bus ↔ browser slider).

Layered onto that is a **Parliament of All Things** framing (after Latour): species, biogeochemical cycles, and human voting events are all granted parliamentary standing inside the instrument. Activity in any one of them shows up across all the others.

### Slot P — 1-bit / 8-bit phenology

Slot P (the Phenological Calendar) deliberately departs from the rest of the instrument's warm/cool Steiner-inspired palette. It renders in pure 1-bit: black background, white wireframe geometry, monospace `Courier New` typography, antialiasing disabled, pixel-shadow month labels, `steps()`-quantized transitions. It looks like a vector terminal — a deliberate citation of the CRT/Vectrex lineage — so that the most ecologically grounded slot reads as the most computationally raw.

---

## What's inside

- **10 sonETH control parameters** (master volume, pitch, time dilation, spectral shift, spatial spread, texture depth, atmosphere mix, memory feed, harmonic richness, resonant body) routed identically to audio buses, GUI knobs, MIDI CCs, HTML sliders, and 11 visual slots.
- **A bidirectional OSC ↔ WebSocket bridge** (`parliament-bridge.js`) so every surface keeps every other surface in sync.
- **A SuperCollider beat engine** (`5_beat_engine.scd`) whose pitch pool, voicing mode, and harmonic count are derived live from the control matrix and ETH activity, with smooth exponential decay back to silence.
- **Slots 0–9** — Reactive Radar Grid, Asteroid, LowEarth point cloud, Perlin blob, TimeTravel, DynGraph, Splay, Geometry, MemHier, Hashing — all converted to Three.js with full 20-knob wiring.
- **Slot P** — the 1-bit Phenological Calendar described above, built from the Manakai species inventory and the IUCN Red List.
- **IUCN Red List integration** with a 3-tier fallback (local RLI cache → IUCN API → hardcoded), token via `.env` + webpack `DefinePlugin`.
- **A diagnostic monitor** (Shift+D) showing parameter freshness across all 10 slots in a scrollable table.
- **4-channel quadraphonic spatial audio** with MOTU 828x auto-detection and Core Audio stereo fallback.

---

## Status

Performance-ready. Active development on the slot P / phenology bridge and the beat-engine ↔ live ecology coupling. See [CHANGELOG.md](CHANGELOG.md) for the current `[Unreleased]` entries.

---

## See also

- [README.md](README.md) — full technical documentation, control matrix, architecture diagrams, install/run instructions.
- [CHANGELOG.md](CHANGELOG.md) — versioned change history.
- [nw_wrld_local/README.md](nw_wrld_local/README.md) — nw-wrld framework documentation (the visualizer host environment).
