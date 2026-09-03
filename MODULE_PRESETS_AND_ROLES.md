# Walkthrough · Presets de módulo y roles audiovisuales

Where every module sits between the audio engine and the screen, which preset
belongs to it, and — the part that matters for performance — **where the two
halves are still not joined.**

Written against the code, not from memory. Every claim below carries the
file:line that supports it, because several of the couplings this document
describes were *intended* and never wired.

---

## 1. Two preset families, not one

`presets/` holds 19 named configs plus `_autosave`. They are not the same kind
of object, and the naming hides it:

**Aesthetic modes (3)** — whole-engine dispositions, independent of what is on
screen. These are the ones to switch by hand.

| preset | disposition |
|---|---|
| `01_Lawrence_English` | Presión y masa sonora |
| `02_Deep_Listening` | Atención expandida (Oliveros) |
| `03_Acustemologia` | Ecosistema bosque seco |

**Module presets (16)** — one per visualisation slot, named after the slot.
`04_Parliament` is slot `0`, `19_Antifonia` is slot `a`. See §2.

`_autosave` is neither: machine-local session state, written every 30 s and
restored at boot (`start_sonification.scd:73`). It is gitignored. It is also
the file that muted six layers for a whole session, which is why `~loadConfig`
now names any muted layer it restores (`0_parameters.scd`).

---

## 2. The map — slot, module, preset, instrument

Numeric slots 4–9 are **the six voices of the engine, one each and no repeats**
(`dataStructureVisuals.ts:65-76`). `band` is the slice of the master spectrum
that slot listens to; `hue` colours its constellation field.

| key | module | preset | instrument | band | hue |
|---|---|---|---|---|---|
| `0` | Parliament stage | `04_Parliament` | — | — | — |
| `1` | Asteroid Waves | `05_Asteroid_Waves` | — | — | — |
| `2` | Low Earth Point | `06_Low_Earth_Point` | — | — | — |
| `3` | Perlin Blob | `07_Perlin_Blob` | — | — | — |
| `4` | Time Travel | `08_Time_Travel` | **DRONE** `opalDrone` | 0.00–0.34 | 0.09 |
| `5` | Dynamic Graphs | `09_Dynamic_Graphs` | **CAMPANAS** pad | 0.18–0.62 | 0.13 |
| `6` | Dynamic Optimality | `10_Dynamic_Optimality` | **PERCUSIÓN** perc | 0.30–0.74 | 0.33 |
| `7` | Geometry | `11_Geometry` | **BOMBO** kick | 0.00–0.18 | 0.02 |
| `8` | Memory Hierarchy | `12_Memory_Hierarchy` | **POLVO** dust | 0.55–1.00 | 0.52 |
| `9` | Hashing | `13_Hashing` | **MUESTRAS** sample | 0.68–0.88 | 0.75 |
| `p` | Cámara Fenológica | `14_Phenology` | corpus ring | — | — |
| `f` | Dark Forest | `15_Dark_Forest` | — | — | — |
| `b` | Tránsito | `16_Transito` | drone (drives it) | — | — |
| `e` | Estratos | `17_Estratos` | — | — | — |
| `r` | Registro | `18_Registro` | — | — | — |
| `a` | Antifonía | `19_Antifonia` | sample / corpus calls | — | — |
| `c` | **Cámara** | **— none —** | camera trap + spectrogram | — | — |

---

## 3. What is already joined

**Audio → visual.** Slots 4–9 read their own voice, not the mix:
`readInstrument()` (`dataStructureVisuals.ts:80`) normalises each band against
its *own* recent peak, so a treble slot does not look dead while it is working.
`/voice/*` onsets say what has just *begun*; the spectrum only says what is
sounding. Both feed the constellation field, whose density, reach, speed and
pulse are that instrument's (`dataStructureVisuals.ts`, `mountSlotField`).

**Visual → audio.** Five modules drive the engine back:

| module | writes |
|---|---|
| `b` Tránsito | `/soneth/*` — proves the shared drone is module-driven |
| `f` Dark Forest | `/soneth/*` |
| `r` Registro | `/soneth/*` |
| `e` Estratos | `/soneth/*` |
| `p` Fenología | `/soneth/harmonicrich`, `/soneth/texturedepth`, `/bio/species/*` |
| `c` Cámara | `/camara/doy`, `/camara/reveal`, `/camara/felid` |

---

## 4. Where the two halves are still apart

### 4.1 The module presets never load — the largest gap

`visualizationSwitcher.ts` contains **zero** references to presets. Sixteen
configs are named after the sixteen slots and **not one of them is loaded when
you switch to that slot.** The mapping in §2 exists only as a filename
convention.

The path is already there: `sendOSCString("/preset/load", name)`
(`parliamentEntry.ts:1934`) is how the CONFIGS dropdown loads one, and SC
answers it. Joining them is a call in `switchTo()`.

### 4.2 Slot `c` (Cámara) has no preset

Sixteen slots, fifteen presets plus one missing. The module was added late and
never given one, so switching to it leaves whatever the previous module set.

### 4.3 Slots 4–9 listen but cannot speak

The six instrument slots are **read-only**. They take their voice's band and
onsets and render them; none writes back. The letter slots all do (§3). So the
half of the system that is explicitly *about* the six voices is the half with
no hand on them.

### 4.4 Two control rows exist but are not rendered

`~knobParameters` has 8 rows; only indices 0–5 have render loops
(`4_gui.scd:619-939`). Rows **6** (`kickEvery percRate padEvery padVoices
bellEvery dustRate`) and **7** (`bowlOn chinaOn`) are never drawn — the whole
Cadencia row and the BOWL/CHINA toggles **do not exist in the SC GUI.** They
work only from `parliament.html`.

Row 7 is stepped, so it must go through `~makeToggle` (`4_gui.scd:894`), not
`~makeKnob` — that file documents that a Knob cannot serve a stepped spec.

### 4.5 The named presets carry levels but not rates — and it is not a schema limit

Every named preset stores the eight `mix*` faders. **None** stores the Cadencia
rates (CC 25–30) or the BOWL/CHINA toggles. So recalling a module restores *how
loud* its layers are but not *how often* they speak — and rate is the half that
changes the music.

The schema is not the problem. `_autosave.json` carries all eight
(`percRate kickEvery dustRate padEvery padVoices bellEvery bowlOn chinaOn`),
including the two toggles added days ago — so `~saveConfig` already persists
params with `hasBus: false`. The sixteen named presets simply **predate those
parameters** and have never been re-saved.

That makes this a data refresh, not a code change.

---

## 5. Proposed improvements — ranked by control gained per unit of risk

**1 · Auto-load the module preset on slot switch, with an opt-out.**
The single biggest win, and nearly free: the presets, the names and the OSC
path all already exist. One call in `switchTo()`.
*Must be opt-out* — a performer mid-set does not want a slot change to stomp a
live mix. A `LINK A/V` toggle in the right rail, defaulting **off** for an
existing session and **on** for a fresh boot, keeps the gesture available
without making it compulsory.

**2 · Write a `20_Camara.json` for slot `c`.** Closes §4.2. Derive it from the
Cámara's own material: corpus and ultra forward, percussion sparse.

**3 · Render GUI rows 6 and 7.** Closes §4.4. The controls exist, are wired,
and reach SC — they are simply invisible on the surface the performer uses at
the machine. Row 7 through `~makeToggle`.

**4 · Backfill the Cadencia keys into the 16 named presets.** Closes §4.5. No
code: `~saveConfig` already writes them (`_autosave` proves it). Either re-save
each preset from a good state, or add the eight keys to the JSON directly with
per-module values — a sparse module wants a low `percRate`, a dense one a high
`dustRate`. A missing key keeps the current value, so this is backwards
compatible either way.

**5 · Give slots 4–9 one reverse binding each.** Closes §4.3, and it is the
change that would most deepen the piece rather than merely tidy it. Each slot
already knows its instrument; let it push *one* parameter back, chosen to suit
what the visual is doing — e.g. slot 8 (POLVO / dust) driving `dustRate` from
its particle density, slot 6 (PERCUSIÓN) driving `bowlOn`/`chinaOn` from which
half of its tree is active. Small per slot, and it makes the six screens
instruments rather than meters.

**6 · Show the binding on screen.** Each slot's HUD names the module (`[6]
DYNAMIC OPTIMALITY`) but not the voice it is bound to. Adding
`· PERCUSIÓN · perc` makes §2 legible without this document.

---

## 6. Verification

- **Preset auto-load:** switch slots with `LINK A/V` on and confirm the CONFIGS
  dropdown follows and the mix changes; with it off, confirm nothing moves.
- **GUI rows:** boot and confirm the Cadencia row and BOWL/CHINA toggles are
  visible in the SC window, and that flipping each toggle audibly removes that
  half of the struck voice.
- **Backfill:** move a Cadencia knob, save a preset, reload it, confirm the rate
  returns — this verifies the path already works before touching the sixteen.
  Then load a not-yet-backfilled preset and confirm it still loads with no error
  and leaves the rates alone.
- `tools/check_scd.sh` after any `.scd` edit — it uses
  `thisProcess.interpreter.compileFile`, which catches the var/statement-order
  error class that `String.compile` silently accepts.

---

## 7. Note on scope

§4.4 overlaps the audio-saturation work planned separately; doing it once
serves both. Nothing here proposes touching DRONE or PAD synthesis, or the
corpus and sample voices.
