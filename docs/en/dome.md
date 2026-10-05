← [README](../../README.en.md) · [Español](../es/cupula.md)

# Dome (fulldome / planetarium)

How to prepare and run BiocracyEngine in a planetarium dome. Written for the Bogotá dome: a **Digistar 7** system, two **Christie Griffyn 4K32-RGB** projectors, a dome over 23 m across, and **NDI** input.

A dome takes a **domemaster**: a square fisheye image with the zenith at the centre, the horizon on the rim of the circle and the front at the bottom. Digistar warps and blends it across its projectors. We only deliver the domemaster.

## The plan: hybrid

| Half | Resolution | How | Status |
|---|---|---|---|
| **Pre-rendered** | 4096 × 4096 | Recorded sessions rendered offline; Digistar plays the files | ✅ ready |
| **Live** | 2048 × 2048 | The instrument running, sent to Digistar over NDI at 30 fps | ✅ ready |
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
| salida: sin salida / ndi / syphon | where the domemaster goes besides the screen. **ndi** only works in the live window (section 4). The output keeps running with the view closed |
| negro | sends black to the output without turning it off |
| opaca / alfa | **alfa** sends the output with an alpha channel (RGBA, UYVA on the wire): black is transparent, so the venue can lay the live feed as a layer over a clip that is already playing |
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

Output in `renders/<name>_4096/`: the video (a PNG sequence, or the `.mov`) plus two WAVs of the same stretch of the recording, in sync with frame 0, both at 48 kHz / 24 bit:
- `<name>_4096_LRLsRs.wav`: 4 channels in console order;
- `<name>_4096_5.1.wav`: L R C LFE Ls Rs, with the centre silent and the LFE being the low end of the mix (the four channels summed, low-passed at 100 Hz, 24 dB/oct; `--lfe-hz` changes it). With this file the venue plays the whole show, subwoofers included, and our MOTU is not needed.

| Option | Default | |
|---|---|---|
| `--size 4096\|2048` | 4096 | domemaster size |
| `--fps <n>` | 30 | |
| `--from <s> --to <s>` | whole session | stretch to render, in seconds into the recording |
| `--format png\|prores\|hapq` | png | PNG sequence, one ProRes 4444 `.mov`, or one **HAP Q `.mov`**, the planetarium's format (build its ffmpeg once: `tools/ffmpeg-hap/build.sh`) |
| `--out <dir>` | `renders/<name>_<size>` | |
| `--warmup <s>` | 3 | time the page runs before time zero so slots can mount |
| `--window <WxH>` | 1920x1080 | page size, which sets the resolution of the 2-D panel slots |
| `--audio-offset <ms>` | 0 | nudge the audio against the picture |
| `--embed-audio` | off | also put the 5.1 inside the `.mov` (24-bit PCM), for a player that wants picture and sound in one file |

**Time on the M5:** about **3 fps at 4096** (≈10× real time: a 20-minute piece takes about 3 h 20 min unattended), and about 10 fps at 2048. Encoding is not the bottleneck; PNG and ProRes run at the same speed.

**Quick preview** before a long render:

```bash
npm run dome:render -- --session ../recordings/<name>.session.jsonl --size 2048 --to 30
```

How it works: the page runs on a virtual clock (`src/projector/dome/renderMode.ts`), and the log is played into it at its logged times. Every frame therefore lands exactly where it belongs against the WAV, however slowly it renders. `--from` plays everything before that point without rendering it, so the page arrives in the state the performance left it.

## Plan A and Plan B

- **Plan A (the show): pre-rendered clips.** HAP Q 4096 at 30 fps with their 5.1 WAV, played by Digistar and the venue console. Nothing of ours has to work live. The workflow:
  1. Record each piece in SC; the session log is written beside the WAV.
  2. Render one minute first (`--to 60 --format hapq`). Check it in the CÚPULA view over the venue's grid, then check its size and the WAVs.
  3. Render every piece in full.
  4. Copy the `.mov` files and their `_5.1.wav` / `_LRLsRs.wav` to the NTFS USB 3.0 drive.
  5. Send the venue a 30 s test clip with its WAV before the day, so they can check the codec and loading on Digistar.
- **Plan B (on top, optional): the live instrument as an NDI layer** over a playing clip, with the **alfa** output. It is used only if, on the day, the venue confirms that Digistar takes an NDI source as a layer over its media, and how it blends it (alpha, or additive/screen). It is picture only: the sound is already in the clip's WAV.

## 4. Live over NDI

The page runs in its own window (Electron) whose sender publishes the NDI source **BiocracyEngine Cúpula**. Only that window can send NDI; a browser cannot.

```bash
DOME_LIVE=1 DOME_AUDIO=1 ./start_ecosystem.sh    # everything, with the live window instead of the browser
# or, with the page already served:
cd nw_wrld_local && npm run dome:live
```

In the window:
1. **D** opens CÚPULA. Choose **2048** and **salida: ndi**.
2. **D** again closes the view. The dome keeps receiving, and a badge in the bottom-right corner shows `CÚPULA · ndi 30 fps · 1 receptor`.
3. **negro** sends black without stopping the output. **sin salida** stops it.

Safety: if the page stops sending (output off, a frozen page), receivers get **black within 1 s** and keep getting it, so the dome goes dark rather than freezing on the last image. If the window crashes, it reloads, and an NDI output that was on comes back on by itself.

Measured on the M5 with a separate NDI receiver: **2048 × 2048 at 30 fps**, arriving as UYVY with no alpha, image the right way round (front at the bottom).

- The first `npm install` in `nw_wrld_local` downloads the NDI 6 SDK and builds the sender (`@stagetimerio/grandiose`, an optional dependency). It needs the Xcode Command Line Tools.
- Use a wired gigabit network to Digistar. A 2048 NDI feed is a few hundred Mbit/s.
- To check the feed before the venue: *NDI Studio Monitor* (free NDI Tools) on any machine on the same network should list **BiocracyEngine Cúpula**.
- Keep the live feed at 2048. 4096 is for the pre-rendered clips.

## 5. Sound for the venue console

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

The pre-rendered clips' `audio.wav` comes out as the venue asks: WAV at 48 kHz / 24 bit, 4 channels in console order **L R Ls Rs**.

## 6. What the venue confirmed

| | |
|---|---|
| **Domemaster** | 4096 × 4096, 1:1, inscribed circle, equidistant 180°. Bottom = south (front), left = east, right = west, top = north (back). Our domemaster already uses this orientation. |
| **Their grid** | "Dome Master 4k Pattern v3.jpg": load it with **grilla sala** in the CÚPULA view to check alignment. It shows on screen only, never in the output. |
| **Clips** | `.MOV` with **HAP** at 30 or 60 fps, or DDS image sequences (stating the fps). We deliver **HAP Q at 30 fps**: `npm run dome:render -- --session … --format hapq`. |
| **Delivery** | USB 3.0 hard drive or stick, formatted **NTFS**. macOS cannot write NTFS on its own, so a driver is needed (Paragon NTFS / Tuxera, or macFUSE + ntfs-3g), or format and copy on a Windows machine. |
| **Size** | HAP Q at 4096, 30 fps: measured ~3 GB per minute on a dark scene (1.7 MB per frame). Busier scenes compress less; render one minute first and check. Rendering runs at ~2.7 fps at 4096. |
| **NDI** | Sender with a dedicated GPU and **RJ45 at ≥1 Gb/s**. The M5 needs a USB-C/Thunderbolt Ethernet adapter. Live goes at 2048: a 4096 NDI feed does not fit in 1 Gb/s, and Digistar scales it. |
| **Audio** | 7.1 / 5.1 system. Our **4 discrete lines (L R Ls Rs)** are confirmed; they map them at the console. Native files: WAV 48 kHz / 24 bit. Ring C is gone; there are now 6 subwoofers (bass management at their console). |
| **Schedule** | **21 October, 2:00–8:00 p.m. only**: setup, tests, rehearsal and show in the same window. No earlier access. |
| **Table** | A wide table with power. Station position, HDMI and XLR runs to be agreed beforehand. |

Bring: the M5, a USB-C → RJ45 gigabit adapter, the MOTU and its cables (4 × balanced line, XLR), HDMI, and the HAP Q clips with their WAVs on an NTFS USB 3.0 drive.

## Design notes for a 23 m dome

- **Avoid white or bright backgrounds.** Light bounces across the dome and washes out the contrast. Slot **B (Transito)** is white and needs a dark version for the dome. Dark slots (F DarkForest, the rings) suit it well.
- **Slow camera motion.** Fast moves over the whole field of view cause motion sickness.
- **Text** reads best low in the front band and large (2–4°). Near the zenith it bends.
- **The laser (slot P)** is for the forest, not the dome.

## Pending

- **Live NDI on Digistar itself:** tested here against an NDI receiver on the same Mac, not yet against Digistar. It will be tested on the day, within the 2–8 p.m. window.

## Files

| File | Role |
|---|---|
| `src/projector/dome/dome.ts` | the CÚPULA viewport (key D) and its render-mode hooks |
| `src/projector/dome/domemaster.ts` | cube camera → fisheye → domemaster |
| `src/projector/dome/domeCapture.ts` | finds each slot's scene and canvas without touching the slots |
| `src/projector/dome/session.ts` | keys, slot and dome settings → the session log |
| `src/projector/dome/renderMode.ts` | the virtual clock and replay, under `?render=1` |
| `nw_wrld_local/dome-live.js` | the live window (Electron) |
| `nw_wrld_local/dome-live-preload.js` | the NDI sender and its black dead-man |
| `nw_wrld_local/dome-render.js` | the offline renderer (Electron + ffmpeg) |
| `nw_wrld_local/parliament-bridge.js` | writes the `.session.jsonl` while SC records |
| `11_recording_system.scd` | sends `/rec/started` and `/rec/stopped` |
| `1_server_config.scd`, `3_synthdefs.scd` | `DOME_AUDIO` and the `\motuRouterDome` router |
