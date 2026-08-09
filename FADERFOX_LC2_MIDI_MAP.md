# Faderfox LC2 MicroModul — Complete MIDI Mapping
## BiocracyEngine / SuperCollider GUI Integration

This document outlines the full MIDI CC mapping for the **Faderfox LC2 MicroModul** (or any Faderfox controller setup) to control the **SuperCollider GUI**, synthesis engine, and web interface of `BiocracyEngine`.

---

## 🔌 Integration Setup

### Option A: Direct SuperCollider Connection (Standalone)
1. Connect your **Faderfox LC2** via USB/MIDI.
2. Boot SuperCollider (`start_sonification.scd`).
3. `2_midi_control.scd` automatically runs `MIDIClient.init` and `MIDIIn.connectAll`, capturing all CCs across all 16 MIDI channels.

### Option B: Routing via Ableton Live
1. Connect **Faderfox LC2** to your computer.
2. Open Ableton Live → Preferences → Link/MIDI. Enable **Track** and **Remote** for Faderfox LC2 and macOS **IAC Driver (Bus 1)**.
3. Create a MIDI Track in Ableton:
   - **MIDI From**: `Faderfox LC2` (All Channels)
   - **MIDI To**: `IAC Driver (Bus 1)` (Channel 1)
   - Set Monitor to **In**.
4. SuperCollider will automatically capture the IAC Driver stream.

---

## 🎛️ Page 1: Core Synthesis & Performance (Knobs 1 to 12)

| LC2 Control | MIDI CC | Parameter Name | Range / Spec | Function in SC GUI |
| :--- | :---: | :--- | :--- | :--- |
| **Knob 1** | `CC 0` | `masterVolume` | `0.01 .. 1.0` (lin) | Master Output Volume |
| **Knob 2** | `CC 1` | `pitchShift` | `-24 .. +24` (semitones) | Transposición global |
| **Knob 3** | `CC 2` | `timeDilation` | `0.5 .. 6.0` (exp) | Estiramiento temporal / Envolventes |
| **Knob 4** | `CC 3` | `spectralShift` | `80 .. 2400` Hz (exp) | Filtro paso bajo principal (LPF) |
| **Knob 5** | `CC 4` | `spatialSpread` | `-1.0 .. +1.0` (lin) | Paneo estéreo / Distribución Quad |
| **Knob 6** | `CC 5` | `masterAmp` | `0.0 .. 1.0` (lin) | Trim de nivel master |
| **Knob 7** | `CC 6` | `filterCutoff` | `0.0 .. 1.0` (lin) | Inclinación tímbrica relativa |
| **Knob 8** | `CC 7` | `noiseLevel` | `0.0 .. 0.5` (lin) | Nivel de ruido / aliento excita |
| **Knob 9** | `CC 8` | `noiseFilt` | `0.0 .. 1.0` (lin) | Filtro de banda de ruido excita |
| **Knob 10** | `CC 9` | `droneDepth` | `0.0 .. 1.0` (lin) | Profundidad del cuerpo sub-grave |
| **Knob 11** | `CC 32` | `textureDepth` | `0.0 .. 0.6` (lin) | Densidad granular / FM index |
| **Knob 12** | `CC 33` | `atmosphereMix` | `0.0 .. 0.9` (lin) | Mezcla de reverberación / espacio |

---

## 🎛️ Page 2: Ambient Processing & Drone Sculpting (Shift Page)

| LC2 Control | MIDI CC | Parameter Name | Range / Spec | Function in SC GUI |
| :--- | :---: | :--- | :--- | :--- |
| **Knob 1 (Shift)** | `CC 34` | `memoryFeed` | `0.0 .. 0.8` (lin) | Envío a delay / memoria |
| **Knob 2 (Shift)** | `CC 35` | `harmonicRich` | `0.1 .. 5.0` (exp) | Riqueza armónica / Parciales |
| **Knob 3 (Shift)** | `CC 36` | `resonantBody` | `0.1 .. 0.8` (lin) | Resonancia del cuerpo / Inharmonicidad |
| **Knob 4 (Shift)** | `CC 37` | `droneFade` | `0.1 .. 5.0` s (exp) | Tiempo de suavizado / Glide del drone |
| **Knob 5 (Shift)** | `CC 38` | `droneSpace` | `0.0 .. 1.0` (lin) | Tamaño de sala reverb del drone |
| **Knob 6 (Shift)** | `CC 39` | `droneMix` | `0.0 .. 1.0` (lin) | Mezcla seca ↔ procesada drone |
| **Knob 7 (Shift)** | `CC 40` | `delayFeedback` | `0.0 .. 0.95` (lin) | Retroalimentación comb-delay |
| **Knob 8 (Shift)** | `CC 41` | `transactionInfluence` | `0.0 .. 1.0` (lin) | Influencia datos transaccionales ETH |
| **Knob 9 (Shift)** | `CC 10` | `activityThreshold` | `0.20 .. 0.85` (lin) | Umbral de actividad fenológica |
| **Knob 10 (Shift)** | `CC 11` | `windowWidth` | `0.4 .. 2.5` (lin) | Ancho de ventana en días |
| **Knob 11 (Shift)** | `CC 12` | `seasonalBias` | `-1.0 .. +1.0` (lin) | Sesgo estacional (Seca -1 ↔ Lluvias +1) |
| **Knob 12 (Shift)** | `CC 13` | `absenceWeight` | `0.0 .. 1.0` (lin) | Peso de ausencia (Voz ultrasónica) |

---

## 🎚️ Page 3: Layer Matrix Mixer (8-Fader / Mix Mode)

| LC2 Fader / Knob | MIDI CC | Parameter Name | Layer Name | Description |
| :--- | :---: | :--- | :--- | :--- |
| **Fader 1** | `CC 42` | `mixDrone` | `\opalDrone` | Capa Sub-grave sostenido |
| **Fader 2** | `CC 43` | `mixPad` | `\elektronBell` | Capa Pads y Campanas |
| **Fader 3** | `CC 44` | `mixKick` | `\opalKick` | Capa Bombo sub |
| **Fader 4** | `CC 45` | `mixPerc` | `\opalPerc` | Capa Percusión resonante |
| **Fader 5** | `CC 46` | `mixDust` | `\opalDust` | Capa Polvo granular / Hojarasca |
| **Fader 6** | `CC 47` | `mixSample` | `\samplePlayer` | Muestras de campo estiradas |
| **Fader 7** | `CC 48` | `mixCorpus` | `\corpusVoice` | Grabaciones de campo AudioMoth |
| **Fader 8** | `CC 49` | `mixUltra` | `\corpusUltrasonic` | Capa Ultrasónica de murciélagos (×8) |

---

## 🔘 Buttons & Switches: Arcos de Marea (Tides) & Capas

| LC2 Button | MIDI CC | Parameter Name | Mode / Behavior |
| :--- | :---: | :--- | :--- |
| **Button 1** | `CC 17` | `tideShort` | Toggle Arco Corto (~40s) |
| **Button 2** | `CC 18` | `tideMedia` | Toggle Arco Medio (~1.5-2 min) — Default |
| **Button 3** | `CC 19` | `tideLarga` | Toggle Arco Largo (~4-6 min) |
| **Button 4** | `CC 20` | `tidePulse` | Toggle Sub-bass Heartbeat (0/1) |
| **Button 5** | `CC 14` | `pulseGain` | Ganancia de pulso fenológico |
| **Button 6** | `CC 15` | `opacityFloor` | Piso de opacidad (Art. 47) |
| **Button 7** | `CC 16` | `bancada` | Selector de bancada biocrática (0-4) |
| **Button 8** | `CC 21` | `phenoRate` | Velocidad del anillo fenológico |

---

*Note: All incoming MIDI CC values are processed by `~setParamNorm` in `0_parameters.scd` to update SuperCollider control buses, the SC GUI controls, and the HTML browser interface in real time.*
