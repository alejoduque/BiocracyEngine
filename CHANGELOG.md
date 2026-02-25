# Changelog

## [Unreleased]

### Fixed
- **SuperCollider Group 1001 error**: `2_synthdefs.scd` was killing the server on load (`Server.default.quit`), destroying node groups created by `1_server_config.scd`. All synth spawns failed with `FAILURE IN SERVER /s_new Group 1001 not found`. Groups are now created via `ServerTree` callback (survive server restarts) and all `Synth()` calls target `~mainGroup` with safe fallback.

### Added
- **Parliament visual broadcast** (`parliament-synthesizer/3_temporal_engine.scd`): 10Hz OSC stream sending per-agent state to the visual layer — species presence/activity, eDNA biodiversity/validation, fungi chemical/connectivity, AI consciousness, parliament phase, consensus wave, vote results, rotation events.
- **OSC→WebSocket bridge** (`nw_wrld_local/parliament-bridge.js`): Node.js bridge receiving UDP OSC on port 3333 and forwarding to browser clients via WebSocket on port 3334.
- **Parliament state store** (`nw_wrld_local/src/projector/parliament/parliamentStore.ts`): Browser-side reactive store with auto-reconnecting WebSocket client. Parses all OSC addresses into typed `ParliamentState` with subscription-based notification.
- **ParliamentStage module** (`nw_wrld_local/src/main/starter_modules/ParliamentStage.js`): Three.js choreographic stage for the 21 ecological agents. Consensus Engine (center, gravitational field), 5 Acoustic Species (particle clouds, IUCN-colored), 8 eDNA Sites (mutating octahedra), 4 Fungi Networks (pulsing tube connections), AI Core (orbiting icosahedron). Autonomous camera, phase rings, vote event flashes.
- **Fullscreen projector** (`parliament.html`): Standalone page at `/parliament.html` — no UI, no dashboard, fully autonomous choreography driven by the parliament engine.
- **Webpack `parliament` entry point**: Standalone build target for the parliament visualizer.
- **`start_ecosystem.sh`**: Now launches the OSC→WebSocket bridge alongside the other three components.
- **`DEVELOPMENT_PLAN.md`**: Phased roadmap for closing the gap between the sonic and visual layers.

### Changed
- **README**: Clarified that nw_wrld is the choreographic stage (not a user input interface). Added "the metaphor is not a metaphor" framing. Updated install instructions with correct port and parliament.html URL.
