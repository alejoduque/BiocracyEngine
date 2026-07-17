# Changelog

All notable changes to the SoNETH BiocracyEngine project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Refactor branch `refactor/control-bridges-ilda` (2026-07-17)

#### Added
- **Canonical parameter registry (`0_parameters.scd`)**: one entry per parameter (ControlSpec, default, canonical OSC path, aliases, MIDI CC, beat-param mirror) loaded before everything else. `~setParam`/`~setParamNorm` is now the single write path for **every** control surface: bus → `~beatParams` mirror → `~controlValues` → GUI knob/label (deferred) → normalized 0–1 echo to the browser on the canonical path. Control buses in `3_synthdefs.scd` are created from the registry.
- **Bridge RX status light (SC GUI)**: green while browser-origin OSC (HTML sliders / parliament buttons) arrived within the last 5 s — live confirmation of the HTML→bridge→SC path.
- **Laser galvo-jump interpolation** (`laser-bridge.js`): consecutive points farther apart than `LASER_MAX_STEP` (default 0.25 of the −1..1 field) get blanked intermediate points so the mirrors sweep instead of slamming. Plus a throttled warning when `points × 45 Hz` exceeds the DAC point rate.
- **Env-overridable ETH listener config**: `ETH_NODE_URL`, `ETH_OSC_IP`, `ETH_OSC_PORT` (defaults unchanged).

#### Fixed
- **Beat engine never loaded**: `5_beat_engine.scd` had a fatal parse error (undefined `txInfluence` at line 143) — the whole file silently failed at every boot. Also replaced language-side `Select.kr`/`In.kr` misuse (returns UGens, not numbers, in Routine code) with synchronous bus reads, and fixed `density` being used before assignment.
- **Dead MIDI CCs 39/41**: wrote to `\dronemix`/`\txInfluence` — buses that never existed (`\droneMix`/`\transactionInfluence`).
- **OSC alias collision**: OSCdefs were keyed by param symbol, so `/parliament/fx/*` alias paths silently overwrote the canonical `/soneth/*` handler for the same parameter (one of the pair was always dead). Now keyed by path. `/soneth/txInfluence` was additionally double-handled.
- **SC GUI echoed native units** (Hz, semitones) to HTML sliders that expect 0–1, desyncing the browser; `findKeyForValue` could also pick an alias path the browser doesn't map.
- **Boot-time crashes visible at every launch**: `nil.notEmpty` in the GUI status loop (MIDIClient queried before deferred init), `nil.round` in `~checkServerStatus` (avgCPU before first status reply), and `9_spatial_headphone_sim.scd` failing entirely (`s.sampleRate` nil at load — setup now deferred to `doWhenBooted`).
- **ILDA capture duplication**: the 45 Hz output loop wrote the same frame to the `.ild` file for as long as it stayed on screen; capture now writes only on new frame content.

#### Changed
- **SC GUI event-driven**: removed the 50 ms polling loop (~27 blocking `getSynchronous` × 20 Hz ≈ 540 server queries/s) — `~setParam` pushes knob/label updates. Status lights 20 Hz → 2 Hz.
- **SC GUI fits the screen**: window sized from `Window.availBounds` with content in a ScrollView (the fixed 1100×1380 rect was partly off-screen on laptops); knob/button sizes unchanged.
- **Range unification** (canonical = former GUI spec): spectralShift 80–3000 Hz, textureDepth 0–0.6, noiseLevel 0–0.5, droneFade 0.1–5 s exp, delayFeedback 0–0.95, masterVolume floor 0.01 — MIDI and HTML surfaces previously used drifted variants of these.
- **`parliament-bridge.js` diagnostics folded** into the primary OSC/WS handlers (removed the listener remove/re-dispatch monkey-patch and the duplicate `wss` connection handler). Ports, route table, `/diag` format unchanged.
- **`laserTap.ts` change-detection**: unchanged frames are re-sent at most every 250 ms (below the bridge's 500 ms dead-man) instead of 30×/s.
- **`eth_sonify.py` dedupe eviction** is now oldest-first (deque) instead of slicing an unordered set. OSC contract byte-identical.

### Added
- **Cámara Fenológica de lo Vivo (Capítulo VI)**: Seven new bidirectional controls + four season-jump triggers materializing the proposed phenological chamber statutes (Articles 41–48). Each control wired across **HTML slider ↔ SC bus/GUI knob ↔ Faderfox LC2 CC 10–16** with full visual + audio coupling. New OSC paths: `/pheno/activityThreshold`, `/pheno/windowWidth`, `/pheno/seasonalBias`, `/pheno/absenceWeight`, `/pheno/pulseGain`, `/pheno/opacityFloor`, `/pheno/bancada`, `/pheno/jumpSeason`. Replaces the previously-dead Fungi Chemical (4 sliders) + AI Consciousness sections that had no SC handlers.
- **Slot P full 3D navigation**: OrbitControls now allow rotate (left-click drag), pan (right-click drag), zoom (wheel, no limits), and full polar range (0–180°). `R` key resets camera to default position.
- **Slot P common-name labels**: Vernacular (Spanish) species name is the primary visible line on each ring node, scientific name follows dimmer underneath. Falls back to scientific name when no common name exists in the inventory.
- **SC GUI Row 5 (Phenology Chamber)**: New control row below Row 4 with pure white-on-black 1-bit palette (visual citation of slot P aesthetic). Holds the seven Cámara Fenológica knobs.
- **Spatial GUI script-dir capture**: New `~biocracyScriptDir` global captured at file-load time in `4_gui.scd` for sibling-script loading from button actions (workaround for `thisProcess.nowExecutingPath` returning `nil` inside button closures).
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
- **`start_ecosystem.sh` hardening**: Dependency check before killing processes; scoped kills (`pkill -f "parliament-bridge\.js"` etc.) instead of global `pkill node`/`pkill python3`; unified `cleanup()` that tracks all PIDs (NW, BRIDGE, SC); health-polling of port 9001 + tail of `sclang_log.txt` for `CONTROL BUS SETUP COMPLETE` before opening the browser; log truncation on startup; `venv` import validation; absolute paths via `$SCRIPT_DIR`; PID lockfile at `/tmp/biocracy.lock`.
- **SC GUI recording labels self-documenting**: `QUICK 30s` → `▶ 30s SNAPSHOT` with explanatory postln; `SPATIAL GUI` → `◇ SPATIAL 4ch` to signal quadraphonic.
- **Spatial 4ch window pinned to main GUI origin**: Opens directly over the sonETH main window (no longer at off-screen `x=1200` default). `alwaysOnTop_(true)` forced after load. Standalone load also defaults to `(100, 100)`.
- **Slot P right-info column readability**: Base font bumped `calc(2px+0.75vmin)` → `calc(4px+1.05vmin)`, line-height tightened 1.4 → 1.1, all sub-elements scaled up proportionally so projector readability improves without losing density.

### Fixed
- **SPATIAL 4ch button was a no-op**: `thisProcess.nowExecutingPath` returns `nil` inside a Button action (it's only valid while a .scd file is being interpreted top-level). Fixed by capturing the script directory at file-load into `~biocracyScriptDir` global; the button now reads that. Also: replaced a hardcoded path (`/Users/a/Documents/p r o y e c t o s/D O C T O R A D O - TADEO 2024/...`) that pointed to the previous project location.
- **SMP spatial control had no audible effect**: Compounded bugs (a) `~sampleParams` used keys `spatialX`/`spatialY` whose `+ "Bus"` suffix produced wrong SynthDef arg names — `samplePlayerMono/Stereo` expects `sampleSpatialXBus`/`sampleSpatialYBus`. Keys renamed. (b) `12_spatial_gui.scd` used `Bus.control(s,1).set(0.0)` which returns `nil` in SC 3.13; split into alloc + `.set` on separate lines (matching project idiom documented in `2_midi_control.scd:58`).
- **Slot P species labels collapsed into bottom-left corner**: Variable shadowing bug — `_updateHtmlOverlays` declared `const w = canvas.clientWidth` at the top, then inner loop shadowed it with `const w = s.window * windowScale`. Screen-x projection multiplied NDC by gaussian sigma (~30) instead of canvas width (~1800). Renamed inner variable to `sigma`.
- **Slot P labels were invisible against the wireframe ring**: `.pheno-label-layer` had `mix-blend-mode: screen` which made the black plaque background transparent. Removed.
- **REC button dropped off-screen after Row 5 added**: SC GUI window grew past its 1120px fixed height when Cámara Fenológica row landed. Window resized 1120→1380; inner margins/spacing compacted (15→6/10→8) without shrinking any button or text size.
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
