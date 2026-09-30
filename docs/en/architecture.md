← [README](../../README.en.md) · [Español](../es/arquitectura.md)

# Architecture and data flow

```
ETH Blockchain
     │
     ▼
eth_sonify.py  (web3 Python scraper)
     │  OSC → UDP:57120
     ▼
SuperCollider
  ├─ 1_server_config.scd   audio device auto-detect
  ├─ 2_midi_control.scd    Faderfox LC2 → ~buses (42 CC)
  ├─ 3_synthdefs.scd       SynthDefs (opalKick/Perc/Drone/Dust/Bell)
  ├─ 4_gui.scd             SC GUI (1-bit monospace) + matrix mixer
  ├─ 5_beat_engine.scd     Evolving beat engine (TX-driven melodic pool)
  ├─ 6_osc_handlers.scd    OSC in from HTML/bridge → ~buses
  ├─ 10_sample_system.scd  samples/ playback + paulstretch
  ├─ 14_phenological_corpus.scd  AudioMoth corpus on the 365-day ring
  ├─ 17_chain_processing.scd     the chain processes the forest recordings
  └─ audio out → MOTU 828x or the system default device, stereo
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
       ├─ Slot 0  ParliamentStage.js   (Three.js)  nested clocks         │
       ├─ Slot 1  AsteroidWaves        (p5.js)  → __slot1Soneth          │
       ├─ Slot 2  LowEarthPoint        (Three.js)                        │
       ├─ Slot 3  PerlinBlob           (p5.js)  → __slot3Soneth          │
       ├─ Slot 4  TimeTravel           (p5.js)  → __slot4Soneth          │
       ├─ Slot 5  DynamicGraphs        (p5.js)  → __slot5Soneth          │
       ├─ Slot 6  DynamicOptimality    (p5.js)  → __slot6Soneth          │
       ├─ Slot 7  Geometry             (p5.js)  → __slot7Soneth          │
       ├─ Slot 8  MemoryHierarchy      (p5.js)  → __slot8Soneth          │
       ├─ Slot 9  Hashing              (p5.js)  → __slot9Soneth          │
       ├─ Slot P  PhenologicalCalendar (Three.js · fetched module)       │
       ├─ Slot F  DarkForest           (Three.js · fetched module)       │
       ├─ Slot B  Transito             (Three.js · fetched module)       │
       │          └─ reverse: throughput → /soneth/drone* → bridge → SC  │
       ├─ Slot E  Estratos             (Three.js · fetched module)       │
       │          └─ forward: __phenoParams → bancada pins the strata,    │
       │             activityThreshold → population, opacityFloor +       │
       │             seasonalWeight → which species are present today     │
       ├─ Slot R  Registro     (canvas · pretext ASCII field × slot 6)    │
       │          └─ reverse: buffer → /soneth/memoryfeed, consensus →     │
       │             atmospheremix                                          │
       ├─ Slot O  Rings · Reference    (Three.js · rings/)               │
       │          └─ one turn = one phenological day (/pheno/cursor)     │
       ├─ Slot T  Rings · Taxa         (Three.js · rings/)               │
       │          └─ five year lanes, bus wedge on the cursor            │
       └─ Slot A  Antifonía            (Three.js · fetched module) ───────┘
                  ├─ forward: /tide/state → chorus density, votes → the room
                  │           speaks, __ednaBio → per-stratum weight
                  ├─ events:  calls → /antifonia/call → SC picks the recording
                  └─ reverse: chorus → /soneth/texturedepth, spread →
                              spatialspread, machine share → noiselevel

MIDI (Faderfox Micromodul LC2) ──► SC buses ──► OSC echo ──► bridge ──► browser
```

## Bidirectional Feedback Loop

Every parameter change is reflected across all three control surfaces:

```
HTML slider ──► SC bus ──► SC GUI knob (visual update)
                    └──► OSC echo ──► HTML slider (position sync)
                                └──► applySonethToViz (16 slots)

MIDI CC ────► SC bus ──► SC GUI knob (visual update)
                  └──► OSC echo ──► HTML slider (position sync)
                              └──► applySonethToViz (16 slots)

SC GUI knob ► SC bus ──► OSC echo ──► HTML slider (position sync)
                                 └──► applySonethToViz (16 slots)
```

## Process Ports & Roles

`start_ecosystem.sh` manages four processes, plus the optional laser bridge:

| App | Process | Ports | Role |
|---|---|---|---|
| **Python ETH** | `eth_sonify.py` (venv) | → UDP **57120** | web3 scraper; per-tx `/eth/note` + `/eth/tx_info`, per-block `/eth/block` |
| **SuperCollider** | `sclang start_sonification.scd` | in **57120** (OSC) + **MIDI**; out **3333**; scsynth **57110** | audio engine, GUI, beat engine, drone, master limiter |
| **Bridge** | `parliament-bridge.js` (Node) | in UDP **3333**; WS **3334**; out UDP **57120**; HTTP **3335** `/diag` | OSC ↔ WebSocket, path translation |
| **Browser** | webpack-dev-server + Electron | HTTP **9001**; WS **3334** | `parliament.html` GUI, store, visual slots |
| **Laser** _(opt)_ | `laser-bridge.js` (Node, `LASER=1`) | WS **3337** in; USB → Helios DAC | vector frames → ILDA / laser onto the forest |
