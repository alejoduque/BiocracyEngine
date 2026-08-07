# Changelog

All notable changes to the SoNETH BiocracyEngine project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Cámara Fenológica · corpus layer, matrix mixer, 1-bit GUI (2026-08-07)

#### Added
- **The AudioMoth corpus as a fourth actor** (`14_phenological_corpus.scd`): 261 field recordings from La Luna / Planeta Rica (Córdoba) placed on the 365-day phenological ring of Article 42 and played as the ring turns. Independent `Routine` (not a branch of `~beatRoutine`, whose 0.06–2.0 s tick is the wrong grain for material measured in minutes), a 16-slot LRU RAM pool with asynchronous look-ahead, and 4 `DiskIn` cue buffers. Resident cost ≈ 230 MB, so `memSize`/`numBuffers` are unchanged. New OSC: `/pheno/goto <doy>`, `/pheno/next`, `/pheno/stop`, `/pheno/start`, plus `/pheno/cursor` and `/pheno/clip` outbound.
- **`tools/build_corpus.py`**: one-off preprocessing of the 384 kHz originals (which are opened read-only and never modified) into four derived tiers — `audible/` 261 clips at 48 kHz, `expanded/` 69 ×8 time-expansions, `stems/` 93 clips × 3 bands, `grains/` 116 cuts — plus `corpus/manifest.json` merging all 248 `events.json` with `phenological_series.csv`. 725 files, 4.21 GB. `--dry-run` reports counts and projected sizes first.
- **Five orphan phenology buses finally have readers.** `windowWidth`, `seasonalBias`, `absenceWeight`, `pulseGain` and `opacityFloor` were allocated and reachable by MIDI and OSC but read by nothing in SuperCollider. `activityThreshold`'s default of 0.50 is Article 45's threshold verbatim.
- **Matrix mixer (Row 8, CC 42–49, `/mix/*`)**: one live fader per audible layer — drone, pad, kick, perc, dust, sample, corpus, ultra — wired through all nine SynthDefs and all six spawn sites. Every other control on the surface shapes timbre; before this the balance between layers lived only in the hardcoded gain budget of `3_synthdefs.scd`, fixed at load, so the instrument could not be mixed while playing. Unity is 1.0 at mid-throw, so an untouched boot is unchanged; 0 is a true mute, 2.0 is +6 dB. SC strips carry a MUTE that remembers the fader position. Measured on the drone: unity 0.0262 RMS, 0.5 → 0.0132, 2.0 → 0.0531, 0 → silence.
- **`phenoRate` (CC 21) and `corpusLevel` (CC 22)** on both control surfaces. `phenoRate` default 0.0167 day/s is one ring day per minute — a 6 h 05 m year in which one recorded day lasts exactly as long as one AudioMoth clip; full range spans 91 s to 48 h.
- **NEXT REC. DAY ▶** button and `/pheno/next`: 331 of 365 ring days have no recording, so at the default rate the corpus can be silent for up to three hours at a stretch. Auditioning or performing it needs a way to reach the next day that has audio.

#### Fixed
- **Corpus fader appeared dead.** Nothing was playing for it to act on: the cursor started at doy 1, the first recorded day is doy 9, and only 9.3 % of the ring carries audio. The ring now opens on a recorded day (doy 10, 33 clips) instead of doy 1 with zero.
- **Row 7 read "0 clip(s)" permanently.** Zero is the *normal* reading for 331 of 365 days, but naming it that way made a working layer look broken. Gaps now report `AUSENCIA · <depth>d`, matching the HTML.
- **Corpus knobs were clipped out of existence.** Appending them to GUI row 5 made nine knobs needing ~1340 px in a window capped at 1100 with `hasHorizontalScroller_(false)`. They now have their own captioned row.
- **The absence voice revealed nothing.** It streamed the raw 384 kHz files through `DiskIn`, which performs no sample-rate conversion and so expands ×8 for free — a tempting trick and the wrong one: it drops *everything* three octaves, so the loud audible band lands at 125 Hz–2.5 kHz and buries the ultrasound it was meant to expose. It now streams `corpus/expanded/`, where the renderer high-passes at 38 kHz (24 dB/oct) *before* expanding.
- **Corpus layer was ~9 dB too quiet.** Measured: `samples/*.mp3` average −22.2 dB mean, `corpus/audible/` −21.3 dB — within ~1 dB, so parity of trim is parity of loudness. `~trimCorpus` 1.10 → **2.60 × ~trimMaster**, which lands the layer within ~1 dB of the sample layer at `corpusLevel`'s 0.5 default and ~6 dB below the drone bed.
- **`bancada` had an unreachable position.** With 0 = "todas", a 0–4 spec left the fifth ecological role out of range. Dawn and dusk chorus now share a seat (dawn alone is 6 events in 261), giving four roles plus "todas" — 135/42/44/38.

#### Changed
- **SC GUI is 1-bit monospace, all caps.** One typeface (Menlo, 31 call sites unified from Helvetica/Monaco/Courier New), black and white only. The amber scheme encoded state in *hue* — green ok, red stop, yellow armed — none of which survives a projector or a photograph, and which made hue do the work that state should. Engaged controls now invert to black-on-white; that is the only state signal.
- **Slot 0 is no longer entirely amber.** The outermost radar ring and Alouatta (the howler, Article 46's alert protocol) burn white phosphorous `#f2fff4`. The howler keeps the same three-step activity ramp as the other species, in phosphor rather than amber.
- **Bancada buttons name what the bus selects.** They were labelled by temporada, which duplicated the jump-season row below them and named something `bancada` does not select. Article 43 defines the bancadas taxonomically, but the corpus carries no taxonomy — the detector yields ecological roles, so those are the labels.
- **The biome panel names the site that exists.** "Biome Network · Colombia" listed eight regions — Chocó, Amazonia, Orinoquía and five more — that the AudioMoth has never recorded and has no way to reach. The Reserva is one biome in one place: bosque seco tropical of the Sinú valley, Córdoba. That space now carries the corpus transport and fader. `state.edna` stays eight wide on purpose, because the BioToken formula and the consensus average over all eight; narrowing the formula is a separate decision about the token, not about the panel.

#### Notes
- **libsoxr is not compiled into the Homebrew ffmpeg here, and is not needed.** Measured against a 60 kHz tone (which folds to 12 kHz under 8:1 decimation, floor −153.8 dB): ffmpeg's native swr rejects 112 dB by default and **130 dB** at `filter_size=256` — beyond what 24-bit output can represent. Explicit biquad pre-filters reach the measurement floor but roll off real 15–22 kHz content, so they are not used.
- The build applies **one global gain across the whole corpus**, never per-clip normalisation: a quiet dry-season night has to stay quiet against a rainy insect chorus, since `activity` and `richness` are exactly the signal per-clip normalisation would flatten.

### Refactor branch `refactor/control-bridges-ilda` (2026-07-17)

#### Added
- **Config save/load (state persistence)**: full control state (all registry parameters + sample knobs + spatial buses) saves to JSON in `presets/`. Save/load from the new **CONFIGS row in the SC GUI** (name field + dropdown), the new **Configs block in parliament.html**, or OSC (`/preset/save`, `/preset/load`, `/preset/list` with a string argument — the bridge now passes string args as OSC type `s`, which also fixes the pre-existing `/pheno/jumpSeason` NaN). Loading routes through `~setParam`, so control buses, SC knobs, and HTML sliders all restore in one pass. A dirty-flag autosaver writes `presets/_autosave.json` every 30 s and the state is restored automatically at the next boot (`_autosave` is gitignored and hidden from the preset list; corrupt/missing files warn instead of crashing).
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
- **SC GUI failed to open on this branch**: `Window.availBounds` is not a method in SC 3.13 (`availableBounds`); the GUI try/catch swallowed the error and closed the window. Qt API names used by the GUI are now covered by a runtime respondsTo check during verification.

#### Changed
- **Drone retune of the ETH sonification** (user feedback: transactions sounded high-pitched and metallic — this was the beat engine being audible for the first time after the parse-error fix). Beat-engine pitch pool moved to drone register (basePitch 200→70 Hz, TX shift 200→50 Hz, spread cap 2.0→1.4); step grid halved (16-step bar = 8 s, phrase = 32 s); percussion sparser (divisors 6–12, extra hits gated at txInfluence > 0.6) and quieter; dust crackle probability roughly halved; `\opalPerc` exciter softened (1 ms strike → 10 ms bow, upper Ringz partials darkened, 50 ms swell + longer tail); ETH transaction pads octave-fold above 320 Hz into the drone bed and got slower envelopes (atk up to 3 s, rel up to 5 s).
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
