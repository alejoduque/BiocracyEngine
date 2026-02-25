# Changelog

All notable changes to the Biocracy Engine are documented here.

---

## [0.4.0] — 2026-02-25

### Added — Visual Layer (nw_wrld_local) now tracked in repository
- **`nw_wrld_local/` removed from `.gitignore`**: full visual layer source committed. `dist/`, `node_modules/`, `build/` excluded via scoped `.gitignore`. Clone + `npm install` + `npx webpack` to rebuild.
- **3D Parliament Stage** (`ParliamentStage.js`): complete overhaul of the visual scene.
  - 5 distinct species geometries (Icosahedron, Octahedron, Tetrahedron, TorusKnot, Dodecahedron) independently orbiting with Z-axis oscillation and particle halos
  - 8 eDNA orbital nodes (Box, Cone, Capsule, Low-poly sphere, Flat box, Octahedron, Hexagonal prism, Torus) each at different orbital speeds
  - FFT ring: 64 radial bars at inner radius (r=2), driven by log-scale (20–8kHz) pseudo-FFT synthesized from species audio frequencies
  - Bloom (UnrealBloomPass 0.7 strength) + AfterimagePass (0.88 damp) post-processing pipeline
  - Consensus core: wireframe IcosahedronGeometry + solid emissive sphere + 3D Lissajous AI figure
  - Fungi lines: LineSegments connecting species to 2 nearest eDNA nodes in 3D world space
  - Camera: perspective auto-orbit (OrbitControls), speed modulated by consensus level
- **HTML Spectrogram** (`#spectrogram-bar`): dedicated `<canvas>` pinned to bottom of center column, full width, 72px. Scrolling amber waterfall at ~22fps. Frequency axis log-scale, amber colormap (black → amber → bright). Separate from Three.js render loop.
- **3-column layout** (`parliament.html`): left OSC controls (200px), center 3D + spectrogram, right telemetry (220px).
- **OSC sliders correctly wired to SC endpoints** (`7_osc_handlers.scd`):
  - Master volume → `/parliament/volume`
  - Rotation speed → `/parliament/rotation`
  - Consensus → `/parliament/consensus`
  - Species activity ×5 → `/agents/species/activity [id, value]`
  - Species presence ×5 → `/agents/species/presence [id, value]`
  - eDNA biodiversity ×8 → `/agents/edna/biodiversity [id, value]`
  - Fungi chemical ×4 → `/agents/fungi/chemical [id, value]`
  - AI consciousness → `/agents/ai/consciousness`
  - FX chain (reverb mix, reverb room, delay time, delay decay)
- **BioToken V3 live readout**: formula `BT = Presence × Activity × eDNA.biodiv × Fungi.chem × AI.optim × IUCN.weight` computed every 100ms from OSC state
- **UICN status badges** (CR/VU/LC) color-coded per species row
- **Colombia biome map**: text-art display, highlights active eDNA sites from live biodiversity data
- **Democratic action buttons**: Trigger Vote, Start Parliament, Stop Parliament, Emergency Consensus (all send correct OSC to SC)
- **Vote result bar**: animated fill + color on `/parliament/vote/result` OSC event
- **`buildFftBins()`** (`parliamentEntry.ts`): log-scale frequency mapping from species freqs, eDNA harmonic overtones, fungi sub-bass, eco CO₂ noise floor. External bins shared with Three.js FFT ring via `stage._fftBinsExternal`.
- **3D label projection**: species labels tracked in 3D world space via `Vector3.project(camera)` → CSS px. eDNA labels at static polar positions.

### Changed
- `ParliamentStage.js`: internal `SpectrogramTexture` class removed (replaced by HTML canvas renderer in entry point)
- `parliamentEntry.ts`: `sendOSC()` for single-value messages; `sendOSCArgs()` for agent-id + value messages; `window.sendParliamentAction()` exposed for HTML button `onclick`
- `.gitignore`: `nw_wrld_local/` unblocked; root `node_modules/` and `sclang_log.txt` added

---

## [0.3.0] — 2026-02-24

### Added — Vectrex Telemetry Console (intermediate, superseded by 0.4.0)
- `ParliamentStage.js`: full rewrite as single-color amber vector scene — radar scope, rotating sweep arm, species blips, eDNA reticules, Lissajous AI, scrolling eco waveforms
- `parliament.html`: telemetry panel layout (header + canvas + right panel + footer)
- `parliamentEntry.ts`: OSC sender, canvas label projection via `radarToCss()`, throttled telemetry updates
- `parliament-bridge.js`: extended to bidirectional — added outgoing UDP port targeting SC port 57120; WebSocket messages with `direction:"toSC"` relayed as OSC

### Fixed
- `sonETH/1_server_config.scd`: `Bus.control(s,1).set(val)` returns nil in SC 3.13 — separated Bus allocation from `.set()` into two steps
- `parliament.html`: script path corrected to `/parliament.js` (root-relative, matches webpack-dev-server static root)
- `ParliamentStage` container: `BaseThreeJsModule` sets `visibility:hidden` in constructor; added `container.style.visibility = "visible"` in entry point

---

## [0.2.0] — 2026-02-20

### Added
- **Parliament visual broadcast** (`parliament-synthesizer/3_temporal_engine.scd`): 10Hz OSC stream sending per-agent state — species presence/activity, eDNA biodiversity/validation, fungi chemical/connectivity, AI consciousness, parliament phase, consensus wave, vote results, rotation events
- **OSC→WebSocket bridge** (`nw_wrld_local/parliament-bridge.js`): Node.js bridge receiving UDP OSC on port 3333, forwarding to browser via WebSocket on port 3334
- **Parliament state store** (`parliamentStore.ts`): browser-side reactive store, auto-reconnecting WebSocket, typed `ParliamentState`, subscription notifications
- **ParliamentStage module** (first version): Three.js scene with particle clouds, platonic solids, basic lighting for the 21 ecological agents
- **`parliament.html`**: standalone fullscreen page at `/parliament.html`
- **Webpack `parliament` entry point**: separate build target
- **`start_ecosystem.sh`**: launches OSC bridge (step 1.5) and parliament-synthesizer (step 2.5) alongside sonETH and eth_listener

### Fixed
- **SuperCollider Group 1001 error** (`sonETH/2_synthdefs.scd`): `Server.default.quit` in synth loader was destroying node groups. Groups now created via `ServerTree` callback, all `Synth()` calls target `~mainGroup` with safe fallback

---

## [0.1.0] — 2026-02-15

### Added
- **Biocracy Engine (SiC)** initial architecture: Ethereum listener (Python/Infura), SuperCollider headless engine (sonETH), nw_wrld visual dashboard
- `sonETH`: granular synthesis, PM/FM drones, consensus engine, parliament agents (5 acoustic species, 8 eDNA sites, 4 fungi networks, 1 AI core)
- `eth_listener/eth_sonify.py`: Ethereum mainnet listener via Infura, logarithmic gas price → MIDI conversion
- `start_ecosystem.sh`: single-command ecosystem launcher
- `parliament-synthesizer/`: full SuperCollider parliament with temporal engine, agent SynthDefs, democratic voting simulation
