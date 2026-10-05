```text
∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿

██████╗ ██╗ ██████╗  ██████╗██████╗  █████╗  ██████╗██╗   ██╗
██╔══██╗██║██╔═══██╗██╔════╝██╔══██╗██╔══██╗██╔════╝╚██╗ ██╔╝
██████╔╝██║██║   ██║██║     ██████╔╝███████║██║      ╚████╔╝ 
██╔══██╗██║██║   ██║██║     ██╔══██╗██╔══██║██║       ╚██╔╝  
██████╔╝██║╚██████╔╝╚██████╗██║  ██║██║  ██║╚██████╗   ██║   
╚═════╝ ╚═╝ ╚═════╝  ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝   ╚═╝   
                                                             
             ███████╗███╗   ██╗ ██████╗ ██╗███╗   ██╗███████╗
             ██╔════╝████╗  ██║██╔════╝ ██║████╗  ██║██╔════╝
             █████╗  ██╔██╗ ██║██║  ███╗██║██╔██╗ ██║█████╗  
             ██╔══╝  ██║╚██╗██║██║   ██║██║██║╚██╗██║██╔══╝  
             ███████╗██║ ╚████║╚██████╔╝██║██║ ╚████║███████╗
             ╚══════╝╚═╝  ╚═══╝ ╚═════╝ ╚═╝╚═╝  ╚═══╝╚══════╝
                                                             
        cybernetic feedback → multispecies parliament        
∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿
```

[Español](README.md) · **English**

# BiocracyEngine

A live audiovisual instrument that opens a channel between machine intelligence and the ecosystem. It listens to a tropical dry forest (Reserva Manakai, Planeta Rica, Córdoba), a public blockchain and a multispecies assembly, and couples them in one feedback loop: every parameter moves both the sound in SuperCollider and the image in the browser.

It does not aim to *represent* nature but to give it a place to speak from: the forest, the protocols, people and machines take part as agents of the same room, and what cannot be measured still counts.

![Slot F · DarkForest — the tropical dry forest of Reserva Manakai as a live stratigraphic data-scape, with species binomials, ecological flows and the incoming Ethereum stream.](BEngine.jpg)

*Slot F · DarkForest — the forest reading itself while the chain flows.*

## Principles

- **Opacity (Glissant):** a fraction of species names is never projected; the body stays, the name is withheld.
- **Absence is voice:** what falls below the detection threshold is not erased; it persists as a faint signal.
- **Phenological time:** the forest's own calendar — not a global taxonomy — governs the synthesis.
- **BioToken:** an inscription of presence and care, not a tradable asset.
- **Parliament, not surveillance:** the same sensing is one or the other depending on the architecture of power around it.

→ [Foundations](docs/en/foundations.md)

## How it works

```
Ethereum ─► eth_sonify.py ─OSC─► SuperCollider ─OSC echo─► parliament-bridge.js ─WS─► browser
                                   ▲    │                                             (parliament.html)
AudioMoth (corpus) ────────────────┘    └─► audio          MIDI Faderfox LC2 ─► SuperCollider
```

SuperCollider is the source of truth for every parameter; the browser, the SC GUI and MIDI write through the same path and receive the same echo. → [Architecture and data flow](docs/en/architecture.md)

## Visual modules

One key switches the module at the centre of `parliament.html`.

| Key | Module | What it shows |
|---|---|---|
| **0** | Phenological rings | a live calendar: year · day · now · wave, with today's species |
| **O** | Rings · Reference | one turn = one phenological day; the year as recordings |
| **T** | Rings · Taxa | five year lanes, one per taxon |
| **1–3** | AsteroidWaves · LowEarthPoint · PerlinBlob | wave fields, point cloud, blob |
| **4–9** | The six instruments | drone · bells · perc · kick · dust · samples |
| **P** | Phenological calendar | the Cámara Fenológica's 365-day ring |
| **F** | DarkForest | the forest's strata after Humboldt |
| **B** | Tránsito | chain events as crossing voices; their flow returns to the drone |
| **E** | Estratos | a generative map in strata |
| **R** | Registro | ASCII field: the chain and the consensus as utterances |
| **C** | Cámara | camera trap and spectral register |
| **A** | Antifonía | the forest's acoustic parliament, in simulated LiDAR |

<p align="center"><img src="docs/rings/slot0.jpg" width="32%" alt="Slot 0 · nested clocks"> <img src="docs/rings/slotO.jpg" width="32%" alt="Slot O · reference"> <img src="docs/rings/slotT.jpg" width="32%" alt="Slot T · taxa"></p>

*Slots 0 · O · T (captured with a test OSC feed).* → [Visual modules](docs/en/modules.md)

## Controls

71 parameters (64 MIDI CCs, 75 OSC routes), each defined once in `0_parameters.scd` and reachable from MIDI, OSC, HTML sliders and the SC GUI. They include the Cámara Fenológica (the AudioMoth corpus on the 365-day ring), the matrix mixer and the density tide.

→ [Controls and sound](docs/en/controls.md) · [Interactive control notebook](https://claude.ai/code/artifact/785cc1af-01a5-48a5-b915-272e957e80e2)

## Quick start

Requires Node.js, Python 3 and SuperCollider (Linux or macOS).

```bash
python3 -m venv eth_listener/venv && source eth_listener/venv/bin/activate && pip install web3 python-osc
./start_ecosystem.sh            # LASER=1 adds laser projection
```

The engine is ready when `sclang_log.txt` shows `=== CONTROL BUS SETUP COMPLETE ===`. → [Setup and diagnostics](docs/en/diagnostics.md)

## Documentation

- [Foundations](docs/en/foundations.md) — theory, the acoustic Chamber, public artifacts
- [Architecture and data flow](docs/en/architecture.md) — processes, ports, bidirectional loop
- [Visual modules](docs/en/modules.md) — instruments 4–9, Antifonía, phenological rings
- [Controls and sound](docs/en/controls.md) — control matrix, corpus, mixing, SC GUI
- [Laser projection](docs/en/laser.md) — pulsar plot, scanner limits, safety
- [Dome](docs/en/dome.md) — planetarium dome: key D, record and render at 4096, 4-channel sound
- [Setup and diagnostics](docs/en/diagnostics.md) — requirements, live monitor
- [CHANGELOG](CHANGELOG.md)

## Ecosystem

- **BiocracyEngine** — this engine: synthesis, projection and the MIDI/OSC bridge.
- **bioacoustic-scripts** — acoustic feature extraction and web3 parser.
- **dIAP** — decentralized participatory action research and on-chain assemblies.
- **Biomap SoundWalk** — listening walks that log ecological presence in Reserva Manakai.

## License

MIT
