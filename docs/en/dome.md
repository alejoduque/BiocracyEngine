← [README](../../README.en.md) · [Español](../es/cupula.md)

# Dome (fulldome / planetarium)

How to prepare and run BiocracyEngine in a planetarium dome. Written for the Bogotá dome: a **Digistar 7** system, two **Christie Griffyn 4K32-RGB** projectors, a dome over 23 m across, and **NDI** input.

A dome takes a **domemaster**: a square fisheye image with the zenith at the centre, the horizon on the rim of the circle and the front at the bottom. Digistar warps and blends it across its projectors. We only deliver the domemaster.

## The plan: hybrid

| Half | Resolution | How | Status |
|---|---|---|---|
| **Pre-rendered** | 4096 × 4096 | Recorded sessions rendered offline; Digistar plays the files | ✅ ready |
| **Live** | ~2048 × 2048 | The instrument running, sent to Digistar over NDI | ⏳ to do |
| **Sound** | 4 channels | The MOTU goes to the venue console: L R Ls Rs | ✅ ready |

The 4K half is rendered offline so the M5 is never pushed to 4K in real time.

## 1. The dome viewport (key D)

In `parliament.html`, **D** opens **CÚPULA** over the page. The slots keep running underneath, and 0–9 / P F B E R A C O T still switch slots.

| Control | What it does |
|---|---|
| Domemaster / Simulación | the flat fisheye, or the dome seen from the seats (drag to look around, wheel for the field of view) |
| 2048 / 4096 | domemaster size |
| frente | how high above the horizon the slot's "forward" lands (reclined seats: ~30°) |
| inmersión | moves the dome camera into the scene. At 0 the world is a patch in front; at 80%+ it surrounds the audience |
| apertura | 180° = hemisphere |
| inclinación | dome tilt, simulation only |
| texto · letra · altura texto | the slot title drawn natively on the dome (size and height in degrees) |
| guías | elevation rings every 15° and a front tick |
| salida limpia | the bare domemaster full screen (Esc to return). For screen capture only, not the 4K deliverable |

Each slot reaches the dome one of two ways:
- **three.js slots:** rendered through a fisheye camera. The status bar says *escena 3D*.
- **2-D and raw-WebGL slots** (1, 3, R, C): shown as a flat panel in front. The status bar says *panel 2D*.

The dome settings are part of the performance: they are saved into the session (below).

## 2. Recording a session

Nothing extra to do. **Record in SC as usual** (REC in the SC GUI). When the recorder starts, the bridge writes a session log next to the WAV:

```
recordings/eth_sonification_20261004_200000.wav             ← SC, 4 channels
recordings/eth_sonification_20261004_200000.session.jsonl   ← the bridge
```

The log holds everything the visuals receive from SC, the keys pressed in the page, the slot on screen when recording started, and every change to the dome settings. It closes when the recording stops.

- The session log is only written while SC is recording.
- Mouse interaction with a slot (orbit drags) is **not** recorded. Frame each slot with keys and dome settings, not the mouse.
- Logs and renders are not committed to git (they are data, and large).

## 3. Rendering it at 4K

The page must be served. SC and the bridge do **not** need to be running.

```bash
cd nw_wrld_local
npm run serve                      # in one terminal: http://localhost:9001
npm run dome:render -- --session ../recordings/<name>.session.jsonl
```

Output in `renders/<name>_4096/`: `frame_00000.png …` plus `audio.wav`. The audio is the same stretch of the recording, 4 channels, in sync with frame 0.

| Option | Default | |
|---|---|---|
| `--size 4096\|2048` | 4096 | domemaster size |
| `--fps <n>` | 30 | |
| `--from <s> --to <s>` | whole session | stretch to render, in seconds into the recording |
| `--format png\|prores` | png | PNG sequence, or one ProRes 4444 `.mov` |
| `--out <dir>` | `renders/<name>_<size>` | |
| `--warmup <s>` | 3 | time the page runs before time zero so slots can mount |
| `--window <WxH>` | 1920x1080 | page size, which sets the resolution of the 2-D panel slots |
| `--audio-offset <ms>` | 0 | nudge the audio against the picture |

**Time on the M5:** about **3 fps at 4096** (≈10× real time: a 20-minute piece takes about 3 h 20 min unattended), and about 10 fps at 2048. Encoding is not the bottleneck; PNG and ProRes run at the same speed.

**Quick preview** before a long render:

```bash
npm run dome:render -- --session ../recordings/<name>.session.jsonl --size 2048 --to 30
```

How it works: the page runs on a virtual clock (`src/projector/dome/renderMode.ts`), and the log is played into it at its logged times. Every frame therefore lands exactly where it belongs against the WAV, however slowly it renders. `--from` plays everything before that point without rendering it, so the page arrives in the state the performance left it.

## 4. Sound for the venue console

Bring the **MOTU** and start with:

```bash
DOME_AUDIO=1 ./start_ecosystem.sh
```

| MOTU output | Channel |
|---|---|
| analog 3 | L (front left) |
| analog 4 | R (front right) |
| analog 5 | Ls (rear left) |
| analog 6 | Rs (rear right) |

The engine already pans everything around four speakers. A stereo line would fold the rear half into left/right, and the venue could only fake surround from it.

The SC boot log confirms the mode: `MOTU router active (DOME): … L R Ls Rs`.

**Fallback, if the console only takes stereo:** start **without** `DOME_AUDIO=1`. Analog 3-4 then carry the studio stereo mix (front + rear folded in).

The pre-rendered clips' `audio.wav` is 4 channels in the engine's own ring order: FL, FR, RR, RL. Tell the venue, or reorder it to L R Ls Rs when you prepare the files.

## 5. Delivery checklist

Ask the venue:
1. Which file format do they want: PNG/TIFF sequence, ProRes, HAP? At what fps?
2. NDI live input: what resolution and frame rate? Is the network wired, gigabit?
3. Is the dome **flat or tilted**? Where is the "front" for the seating? (Set *frente* and *inclinación* accordingly.)
4. Audio inputs at the console: 4 line inputs available? Analog, Dante, MADI?
5. How much technical rehearsal time is there in the dome?

Bring: the M5, the MOTU and its cables (4 × balanced line), the renders on a fast drive, and their audio files.

## Design notes for a 23 m dome

- **Avoid white or bright backgrounds.** Light bounces across the dome and washes out the contrast. Slot **B (Transito)** is white and needs a dark version for the dome. Dark slots (F DarkForest, the rings) suit it well.
- **Slow camera motion.** Fast moves over the whole field of view cause motion sickness.
- **Text** reads best low in the front band and large (2–4°). Near the zenith it bends.
- **The laser (slot P)** is for the forest, not the dome.

## Pending

- **Live NDI:** needs the NDI SDK and a Node binding installed on the M5. The current browser → WebSocket → Syphon route (`DOME=1`, `dome-bridge.js`) works but measured only about 8 fps at 2048.
- **Bloom/glow** from slots that use it is not carried into the dome yet.

## Files

| File | Role |
|---|---|
| `src/projector/dome/dome.ts` | the CÚPULA viewport (key D) and its render-mode hooks |
| `src/projector/dome/domemaster.ts` | cube camera → fisheye → domemaster |
| `src/projector/dome/domeCapture.ts` | finds each slot's scene and canvas without touching the slots |
| `src/projector/dome/session.ts` | keys, slot and dome settings → the session log |
| `src/projector/dome/renderMode.ts` | the virtual clock and replay, under `?render=1` |
| `nw_wrld_local/dome-render.js` | the offline renderer (Electron + ffmpeg) |
| `nw_wrld_local/parliament-bridge.js` | writes the `.session.jsonl` while SC records |
| `11_recording_system.scd` | sends `/rec/started` and `/rec/stopped` |
| `1_server_config.scd`, `3_synthdefs.scd` | `DOME_AUDIO` and the `\motuRouterDome` router |
