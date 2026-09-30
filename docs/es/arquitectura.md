← [README](../../README.md) · [English](../en/architecture.md)

# Arquitectura y flujo de datos

```
Blockchain ETH
     │
     ▼
eth_sonify.py  (scraper web3 en Python)
     │  OSC → UDP:57120
     ▼
SuperCollider
  ├─ 1_server_config.scd   autodetección de dispositivo de audio
  ├─ 2_midi_control.scd    Faderfox LC2 → ~buses (42 CC)
  ├─ 3_synthdefs.scd       SynthDefs (opalKick/Perc/Drone/Dust/Bell)
  ├─ 4_gui.scd             GUI de SC (monoespaciada 1 bit) + mezclador matricial
  ├─ 5_beat_engine.scd     motor de beat evolutivo (pool melódico guiado por TX)
  ├─ 6_osc_handlers.scd    OSC entrante desde HTML/puente → ~buses
  ├─ 10_sample_system.scd  reproducción de samples/ + paulstretch
  ├─ 14_phenological_corpus.scd  corpus AudioMoth sobre el anillo de 365 días
  ├─ 17_chain_processing.scd     la cadena procesa las grabaciones del bosque
  └─ salida de audio → MOTU 828x o estéreo por defecto del sistema
     │
     │  eco OSC → UDP:3333  (~visualsDest)
     ▼
parliament-bridge.js  (Node.js, OSC↔WebSocket)
  │  UDP:3333  ← eco de SC / MIDI
  │  WS:3334   ↔ navegador
  │  HTTP:3335 /diag
  │
  │  traducción de rutas SC_TO_CH:
  │    /soneth/* → /ch/setXxx  (disparo de método)
  │    /parliament/* y /agent/* → paso directo sin traducir
  │
  ▼
navegador Electron nw_wrld  (parliament.html)
  │
  ├─ sliders HTML (34 sliders, 4 filas + Beat Engine)
  │    └─ input → sendOSC → WS → puente → bus de SC
  │           └─ patchStoreFromSlider → __applySonethToViz (rastreado por DIAG)
  │
  ├─ eco de SC → onmessage → __applySonethToViz (rastreado por DIAG)
  │
  └─ applySonethToViz(key, v)  ─────────────────────────────────────────┐
       │                                                                  │
       ├─ Slot 0  ParliamentStage.js   (Three.js)  relojes anidados       │
       ├─ Slot 1  AsteroidWaves        (p5.js)  → __slot1Soneth          │
       ├─ Slot 2  LowEarthPoint        (Three.js)                        │
       ├─ Slot 3  PerlinBlob           (p5.js)  → __slot3Soneth          │
       ├─ Slot 4  TimeTravel           (p5.js)  → __slot4Soneth          │
       ├─ Slot 5  DynamicGraphs        (p5.js)  → __slot5Soneth          │
       ├─ Slot 6  DynamicOptimality    (p5.js)  → __slot6Soneth          │
       ├─ Slot 7  Geometry             (p5.js)  → __slot7Soneth          │
       ├─ Slot 8  MemoryHierarchy      (p5.js)  → __slot8Soneth          │
       ├─ Slot 9  Hashing              (p5.js)  → __slot9Soneth          │
       ├─ Slot P  PhenologicalCalendar (Three.js · módulo cargado aparte) │
       ├─ Slot F  DarkForest           (Three.js · módulo cargado aparte) │
       ├─ Slot B  Transito             (Three.js · módulo cargado aparte) │
       │          └─ inverso: caudal → /soneth/drone* → puente → SC       │
       ├─ Slot E  Estratos             (Three.js · módulo cargado aparte) │
       │          └─ directo: __phenoParams → bancada fija los estratos,  │
       │             activityThreshold → población, opacityFloor +        │
       │             seasonalWeight → qué especies están presentes hoy    │
       ├─ Slot R  Registro     (canvas · campo ASCII pretext × slot 6)    │
       │          └─ inverso: buffer → /soneth/memoryfeed, consenso →     │
       │             atmospheremix                                        │
       ├─ Slot O  Anillos · Referencia (Three.js · rings/)                │
       │          └─ una vuelta = un día fenológico (/pheno/cursor)       │
       ├─ Slot T  Anillos · Taxones    (Three.js · rings/)                │
       │          └─ cinco carriles del año, cuña del bus en el cursor    │
       └─ Slot A  Antifonía            (Three.js · módulo cargado aparte)─┘
                  ├─ directo: /tide/state → densidad del coro, votos → la
                  │           sala habla, __ednaBio → peso por estrato
                  ├─ eventos: llamados → /antifonia/call → SC elige la grabación
                  └─ inverso: coro → /soneth/texturedepth, dispersión →
                              spatialspread, cuota máquina → noiselevel

MIDI (Faderfox Micromodul LC2) ──► buses SC ──► eco OSC ──► puente ──► navegador
```

## Bucle de retroalimentación bidireccional

Cada cambio de parámetro se refleja en las tres superficies de control:

```
slider HTML ──► bus SC ──► perilla GUI de SC (actualización visual)
                    └──► eco OSC ──► slider HTML (sincronía de posición)
                                └──► applySonethToViz (16 slots)

CC MIDI ────► bus SC ──► perilla GUI de SC (actualización visual)
                  └──► eco OSC ──► slider HTML (sincronía de posición)
                              └──► applySonethToViz (16 slots)

perilla GUI ► bus SC ──► eco OSC ──► slider HTML (sincronía de posición)
                                 └──► applySonethToViz (16 slots)
```

## Procesos, puertos y roles

`start_ecosystem.sh` gestiona cuatro procesos, más el puente láser opcional:

| App | Proceso | Puertos | Rol |
|---|---|---|---|
| **Python ETH** | `eth_sonify.py` (venv) | → UDP **57120** | scraper web3; `/eth/note` + `/eth/tx_info` por tx, `/eth/block` por bloque |
| **SuperCollider** | `sclang start_sonification.scd` | entra **57120** (OSC) + **MIDI**; sale **3333**; scsynth **57110** | motor de audio, GUI, motor de beat, drone, limitador maestro |
| **Puente** | `parliament-bridge.js` (Node) | entra UDP **3333**; WS **3334**; sale UDP **57120**; HTTP **3335** `/diag` | OSC ↔ WebSocket, traducción de rutas |
| **Navegador** | webpack-dev-server + Electron | HTTP **9001**; WS **3334** | GUI `parliament.html`, store, slots visuales |
| **Láser** _(opc.)_ | `laser-bridge.js` (Node, `LASER=1`) | WS **3337** entrada; USB → DAC Helios | cuadros vectoriales → ILDA / láser sobre el bosque |
