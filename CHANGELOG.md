# Changelog

All notable changes to the SoNETH BiocracyEngine project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Slot P — Phenological Calendar (Reserva Manakai)**: New visualization slot (key `p`) mounting a 365-day species ring built from `manakai_species.json` (572 species across flora, amphibians, reptiles, mammals, birds for Planeta Rica, Córdoba, Colombia). Lives in `nw_wrld_local/ecosystems/default_ecosystem/modules/PhenologicalCalendar.js`.
- **Phenology Bidirectional Breath Bridge** (`nw_wrld_local/src/projector/phenology/breath.ts`): Parliament votes pulse the calendar; `parliament.rotation` slider drives `daysPerSecond`; ETH biogeochem events (`eco.co2`, `mycoPulse`, `phosphorus`, `nitrogen`) trigger overlays anchored to currently-active flora positions. **Reverse coupling:** calendar day → seasonal weight + active-species fraction → `harmonicrich` + `texturedepth` OSC into SuperCollider audio.
- **Webpack devServer ecosystems mount**: `/ecosystems/` static path serves artist-authored modules at runtime so slot P can dynamically `fetch()` the PhenologicalCalendar module.
- **DIAG Monitor expanded to all 10 slots**: Diagnostic monitor (Shift+D) now displays parameter status for slots 0–9 in a horizontally scrollable 600px-wide table (previously only slots 0–3).
- **Data-Driven Melodic Progression**: Beat engine pitch pool, voicing mode, and harmonic count now read live from Faderfox LC2 knobs (`harmonicRich`, `resonantBody`, `textureDepth`) and ETH transaction influence with smooth exponential decay (no abrupt cuts).
- **MIDI/SC GUI Feedback Integration**: All 20 MIDI CC handlers now broadcast via OSC to keep browser sliders and SC GUI knobs in sync (bidirectional control: MIDI ↔ SC buses ↔ browser).
- **IUCN Red List API Integration**: `speciesFetcher.ts` with 3-tier fallback (RLI local → IUCN API direct → hardcoded), dynamic species sliders, IUCN API token via `.env` + webpack `DefinePlugin`.
- **Consensus Brightness Propagation**: The `/bio/consensus` stream now dynamically drives the visual energy (brightness/saturation/opacity) of all visualizer modules (`PerlinBlob`, `LowEarthPoint`, and `ParliamentStage`).
- **Unified Parameter Path Model**: Added a centralized remapping table in `6_osc_handlers.scd` to ensure HTML sliders, MIDI CCs, and SC GUI knobs all use identical real-world units (Hz, semitones, ratios).
- **Auto-Detection for MOTU 828x**: SuperCollider now detects the presence of MOTU 828x (Gen5) hardware and automatically configures 4-channel quadraphonic output, with a seamless fallback to macOS Core Audio stereo.
- **Graceful Ecosystem Shutdown**: Improved `start_ecosystem.sh` with a cleanup trap that ensures all child processes (Node.js, Python, SuperCollider) are terminated cleanly on exit.

### Changed
- **Slot P aesthetic — 1-bit wireframe / 8-bit**: Phenological Calendar converted from Steiner-inspired warm/cool palette (`#0B1418` teal-black + peach/gold/indigo/violet/olive/rust) to pure 1-bit (`#000000` background, `#ffffff` geometry only). All `TorusGeometry`/`SphereGeometry`/`TubeGeometry`/`MeshStandardMaterial` replaced with `LineLoop` / `OctahedronGeometry` wireframe / `LineBasicMaterial`. Biogeochem overlays now wireframe crosses (CO₂), expanding line circles (myco pulses), wireframe diamonds (P/N nutrient flows). Backdrop reduced to two wireframe icosahedra (parallax). Lighting collapsed from 4 directional+ambient lights to a single flat `AmbientLight`.
- **Slot P typography — 8-bit terminal**: HUD switches from sans-serif (`ui-sans-serif`) to `Courier New` monospace, uppercase, antialiasing disabled (`-webkit-font-smoothing: none`). Canvas month labels use pixel-shadow offset (no blur). Progress bars and active-label fades use `steps()` transitions for stepped/digital motion. Active-species labels get black background + `1px solid` outline (CRT terminal feel).
- **Trigger Vote always passes**: Boosted consensus and tightened 4s decay so the trigger-vote shortcut reliably crosses the pass threshold.
- **Left panel cosmetics**: -2pt font, invisible vertical scroll.
- **Slots 4–9 converted to Three.js**: All TimeTravel / DynGraph / Splay / Geometry / MemHier / Hashing slots ported from p5.js to Three.js with full 20-knob wiring.
- **Spectral Shift Safety**: Tightened filter frequency clamps and switched narrow Band-Pass Filters (BPF) to Low-Pass Filters (LPF) to prevent audio muting or digital artifacts at extreme "Spectral Sh" slider settings.
- **Improved GUI Contrast**: Changed SuperCollider GUI knob labels to white for better visibility against the amber performance theme.
- **Full Pan Range**: Re-mapped the spatialSpread parameter so the 0.0–1.0 HTML slider correctly covers the full -1.0 (Left) to +1.0 (Right) quadraphonic pan.
- **README Overhaul**: Expanded documentation with a complete control matrix, architecture diagrams, hardware configuration details, and the new Slot P section.

### Fixed
- **Slot 8 runtime error**: Removed `_` sink and wired `gx1` into drop-line start X.
- Fixed audio driver conflicts on macOS by ensuring the SuperCollider server doesn't attempt to claim 4 output channels when only a 2-channel stereo device is available.
- Resolved "Spectral Sh" silence issue by limiting the filter sweep range to a safe maximum of 3000Hz.
- Fixed an issue where the recording system would lose certain channels during long-form captures.

### Security
- **IUCN API token hardening**: Moved IUCN API token from hardcoded source to `.env`, injected at build time via webpack `DefinePlugin`. `.env.example` template added.

## [1.1.0] - 2025-03-01

### Added
- Evolving Beat Engine with probability-based phrase mutations and shifting polyrhythms.
- Multi-row amber SuperCollider GUI for performance monitoring.
- Transaction trend analysis system for the sonification engine.

### Changed
- Refactored control matrix to support 4 simultaneous visual slots in nw_wrld.
- Updated voting system logic to include dedicated "Emergency" and "Stop" modes with sonic/visual feedback.

## [1.0.0] - 2025-02-15

### Added
- Initial release of SoNETH BiocracyEngine.
- Core Ethereum sonification bridge.
- Basic nw_wrld visual module integration.
- 4-channel spatial audio support.
