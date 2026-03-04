# Changelog

All notable changes to the SoNETH BiocracyEngine project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Consensus Brightness Propagation**: The `/bio/consensus` stream now dynamically drives the visual energy (brightness/saturation/opacity) of all visualizer modules (`PerlinBlob`, `LowEarthPoint`, and `ParliamentStage`).
- **Unified Parameter Path Model**: Added a centralized remapping table in `6_osc_handlers.scd` to ensure HTML sliders, MIDI CCs, and SC GUI knobs all use identical real-world units (Hz, semitones, ratios).
- **Auto-Detection for MOTU 828x**: SuperCollider now detects the presence of MOTU 828x (Gen5) hardware and automatically configures 4-channel quadraphonic output, with a seamless fallback to macOS Core Audio stereo.
- **Graceful Ecosystem Shutdown**: Improved `start_ecosystem.sh` with a cleanup trap that ensures all child processes (Node.js, Python, SuperCollider) are terminated cleanly on exit.

### Changed
- **Spectral Shift Safety**: Tightened filter frequency clamps and switched narrow Band-Pass Filters (BPF) to Low-Pass Filters (LPF) to prevent audio muting or digital artifacts at extreme "Spectral Sh" slider settings.
- **Improved GUI Contrast**: Changed SuperCollider GUI knob labels to white for better visibility against the amber performance theme.
- **Full Pan Range**: Re-mapped the spatialSpread parameter so the 0.0–1.0 HTML slider correctly covers the full -1.0 (Left) to +1.0 (Right) quadraphonic pan.
- **README Overhaul**: Expanded documentation with a complete control matrix, architecture diagrams, and hardware configuration details.

### Fixed
- Fixed audio driver conflicts on macOS by ensuring the SuperCollider server doesn't attempt to claim 4 output channels when only a 2-channel stereo device is available.
- Resolved "Spectral Sh" silence issue by limiting the filter sweep range to a safe maximum of 3000Hz.
- Fixed an issue where the recording system would lose certain channels during long-form captures.

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
