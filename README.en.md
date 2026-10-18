<p align="center">
  <img src="BiocracyEngine_matrixlogo.png" alt="BiocracyEngine" width="800">
</p>

<p align="center"><em>cybernetic feedback → multispecies parliament</em></p>

[Español](README.md) · **English**

# BiocracyEngine

BiocracyEngine is a live audiovisual instrument. It connects three sources in one feedback loop:

- **The forest:** AudioMoth recordings from a tropical dry forest (Reserva Manakai, Planeta Rica, Córdoba, Colombia).
- **The blockchain:** live Ethereum transactions.
- **The assembly:** a multispecies parliament of species, people and machines.

Each parameter changes the sound (SuperCollider) and the image (browser) at the same time.

![Slot F · DarkForest: the forest of Reserva Manakai as a live data landscape.](BEngine.jpg)

## Principles

- **Opacity:** The system does not show some species names. Their sound stays.
- **Absence:** A day with no recording is not empty. It sounds as a weak signal.
- **Phenological time:** The calendar of the forest controls the synthesis.
- **BioToken:** A BioToken records presence and care. You cannot sell it.
- **Parliament:** The same sensors can watch or can give a voice. The structure of power decides which.

## How it works

```
Ethereum ─► eth_sonify.py ─OSC─► SuperCollider ─OSC─► parliament-bridge.js ─WS─► browser
AudioMoth corpus ────────────────►      │
Faderfox LC2 (MIDI) ─────────────►      └─► audio
```

SuperCollider keeps the value of each parameter. The browser, the SC GUI and MIDI send their changes on the same path. All of them get the same echo.

## The composition in the dome

For the dome of the Planetario de Bogotá, the engine starts in its dome mix (MEZCLA at 1).

- **The main layers fill the spectrum and the room.** Each one has its own height in the spectrum and its own place in the four channels:
  - the kick is the floor;
  - the drone is the ground, all round and leaning to the front;
  - the pad is an even sheet that breathes from front to back;
  - the dust is the air, behind and above.
- **The other layers each have a place.**
  - The forest (corpus) wraps the sides and the back, as a place wraps the one who listens.
  - ULTRA comes from behind.
  - GOLPE is on the stage.
  - Each motor has a home on the ring. When it swells, it comes to the front and then goes back.
- **PERC and KICK are a Burmese hsaing waing.**
  - BOWL is the tuned circle: gongs on a long strike and pat waing drums on a short one.
  - CHINA is the linkwin and si cymbals.
  - KICK is the pat ma, the great drum, with the bamboo wa.
  - The notes fall on a pentatonic scale over the root of the drone. Each strike sounds from the place on the ring that its pitch gives it, so a scale walks round the room.
- **Module C in the dome.** The camera traps show on a curved screen that follows the edge of the dome and turns slowly, so each seat sees them face on. Behind it is the Library of Babel: hexagonal galleries that rise without end, with the 30 captures and the 612 spectrograms as books, and each gallery turns on its own.
- **Modules 5 to 9 each turn in their own way.** ROTATION SPD goes from −2 to +2: the centre stops the turn and the left reverses it.

MEZCLA at 0 (the MEZCLA_0_Barro config) gives the old sound, all at the front.

## Start

You must have Node.js, Python 3 and SuperCollider (macOS or Linux).

1. Install the Python packages:
   ```bash
   python3 -m venv eth_listener/venv && source eth_listener/venv/bin/activate && pip install web3 python-osc
   ```
2. Start all the processes:
   ```bash
   ./start_ecosystem.sh
   ```
   For laser projection, use `LASER=1 ./start_ecosystem.sh`.
3. Wait for `=== CONTROL BUS SETUP COMPLETE ===` in `sclang_log.txt`. The engine is then ready.
4. The script opens `http://localhost:9001/parliament.html`. Push a key (0–9, letters) to change the visual module.

## Documentation

| Subject | Document |
|---|---|
| Theory and principles | [Foundations](docs/en/foundations.md) |
| How it listens: algorithms and the doctoral thesis (Spanish only) | [Escucha](docs/es/escucha.md) |
| Processes, ports, data flow | [Architecture](docs/en/architecture.md) |
| Visual modules and keys | [Modules](docs/en/modules.md) |
| Parameters, mixer, corpus | [Controls and sound](docs/en/controls.md) |
| Laser projection and safety | [Laser](docs/en/laser.md) |
| Planetarium dome and render | [Dome](docs/en/dome.md) |
| Requirements and monitor | [Diagnostics](docs/en/diagnostics.md) |
| Changes | [CHANGELOG](CHANGELOG.md) |

## License

MIT
