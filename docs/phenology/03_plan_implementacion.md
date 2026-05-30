# Plan de implementación: Cámara Fenológica (módulo p)

**Documento de implementación — sucede a**
[`02_propuesta_controles_modulo_p.md`](./02_propuesta_controles_modulo_p.md)

**Estado:** listo para implementar tras tus tres decisiones.
**Decisiones tomadas:**

1. **Reasignar controles muertos** existentes (no añadir filas nuevas).
2. **MIDI CC 10–16** en el Faderfox LC2 (reasignados desde botones libres).
3. **Sección 1-bit blanca** para los controles de fenología; el resto del panel se queda en amber.

---

## 1. Auditoría: lo que descubrimos

Una auditoría profunda del instrumento revela **5 controles DEAD reales** (no afectan ni audio ni video, no tienen handler OSC en SC):

| Sección HTML | Slider | OSC actual | Líneas en `parliament.html` | ¿Audio? | ¿Visual? |
|---|---|---|---|---|---|
| Fungi Chemical → SC | N.Mycorrhizal | `/agents/fungi/chemical#0` | 428–433 | ✗ | ✗ |
| Fungi Chemical → SC | C.Spore Net | `/agents/fungi/chemical#1` | 434–439 | ✗ | ✗ |
| Fungi Chemical → SC | S.Fungal Web | `/agents/fungi/chemical#2` | 440–445 | ✗ | ✗ |
| Fungi Chemical → SC | Coastal Grid | `/agents/fungi/chemical#3` | 446–451 | ✗ | ✗ |
| AI Gaia → SC | Consciousness | `/agents/ai/consciousness` | 457–462 | ✗ | ✗ |

Adicionalmente, todos los `/soneth/*` y `/parliament/*` están **vivos** (handlers presentes en `~oscToParamMap` línea 152, leídos por SynthDefs y/o slots de visualización). No tocamos ninguno.

**Verdict:** los 5 sliders muertos cubren exactamente las 5 ranuras visibles que necesitamos para los controles principales de la Cámara Fenológica. Los dos faltantes (un sexto slider continuo + los botones de salto a temporada) los añadimos como filas nuevas dentro de la sección reconvertida.

---

## 2. Mapeo final: control muerto → control fenológico

| HTML actual (DEAD) | Reemplaza por | OSC nuevo | Bus SC | CC LC2 | Rango | Default |
|---|---|---|---|---|---|---|
| N.Mycorrhizal | **Activity Thresh** | `/pheno/activityThreshold` | `~activityThresholdBus` | 10 | 0.20–0.85 | 0.50 |
| C.Spore Net | **Window Width** | `/pheno/windowWidth` | `~windowWidthBus` | 11 | 0.4–2.5 | 1.0 |
| S.Fungal Web | **Seasonal Bias** | `/pheno/seasonalBias` | `~seasonalBiasBus` | 12 | -1.0–+1.0 | 0.0 |
| Coastal Grid | **Absence Weight** | `/pheno/absenceWeight` | `~absenceWeightBus` | 13 | 0.0–1.0 | 0.3 |
| Consciousness | **Pulse Gain** | `/pheno/pulseGain` | `~pulsePhenoBus` | 14 | 0.0–2.0 | 1.0 |
| *(nuevo, añadido)* | **Opacity Floor** | `/pheno/opacityFloor` | `~opacityFloorBus` | 15 | 0.0–0.7 | 0.0 |
| *(nuevo, añadido)* | **Bancada** (radio) | `/pheno/bancada` | `~bancadaBus` (int) | 16 | 0–4 | 0 |

**Botones de temporada (4):** se renderizan como una fila de botones discretos al final de la sección. Envían `/pheno/jumpSeason` con string `"seca" | "primeras_lluvias" | "medio_seco" | "segundas_lluvias"`. No consumen CC; se disparan con clic del ratón o atajo de teclado opcional.

### 2.1 Re-bautizo de secciones HTML

- **"Fungi Chemical → SC"** → **"Cámara Fenológica · Bosque"** (4 sliders + 1 nuevo)
- **"AI Gaia → SC"** → **"Cámara Fenológica · Quórum"** (1 slider repurposed + 2 nuevos + botones)

Mantener dos sub-secciones es útil: la primera agrupa los controles que afectan **cómo lee el calendario** (umbral, ventana, sesgo estacional, ausencia, opacidad); la segunda agrupa los que afectan **cómo enuncia el calendario hacia el resto del instrumento** (pulse gain, bancada, salto de temporada).

---

## 3. Mapeo control ↔ efecto audio/visual (la regla "nada inerte")

Cada control nuevo modifica **al menos un parámetro de audio y un parámetro visual** — no hay sliders cosméticos:

| Control | Efecto en `PhenologicalCalendar.js` (visual slot P) | Efecto en SC audio (en buses ya vivos) |
|---|---|---|
| **Activity Thresh** | Sustituye el `0.5` en `_updateSpeciesLuminance`; recomputa `_activeCounts`; recalcula etiquetas activas | Multiplica `~txInfluenceBus` en `5_beat_engine.scd` línea ~125 (más quórum → más densidad de pool) |
| **Window Width** | Multiplica `s.window * 0.6` en la gaussiana → halos más/menos definidos | Multiplica `~memoryFeedBus` (ventanas anchas suman ecos largos) |
| **Seasonal Bias** | Suma offset al `seasonalWeight(day)` en `breath.ts`; recolorea el indicador de temporada en el HUD | Reescala `harmonicrich` enviado por reverseBreath (audicionar "qué se oye si la temporada se desplaza") |
| **Absence Weight** | Aplica brillo de dither (parpadeo 1-bit) a especies bajo umbral; cuando alto, las especies ausentes son visibles como puntos parpadeantes | Multiplica `(1 - absenceWeight) * ~atmosphereMixBus` → cuanto más pesa la ausencia, más silencio audible (Art. 44 §) |
| **Pulse Gain** | Multiplica `intensity` que entra a `pulse()` en `wireForwardBreath` | Multiplica la modulación que el calendario aporta a `/bio/consensus` |
| **Opacity Floor** | Filtra etiquetas activas: oculta una fracción aleatoria pero determinista (seed por día) | Ninguno directo — es la única excepción a la regla. Justificación: la cláusula de opacidad del Art. 47 § es estructuralmente *anti-traducción*; convertirla en audio la traicionaría |
| **Bancada** | Mapea `focusTaxon` a la bancada estacional correspondiente del Art. 43 §1; los otros taxones bajan a luminancia 0.16 | Cuando bancada != "todas", aplica un filtro de paso bajo suave (LPF cutoff = 0.7) sobre `~spectralShiftBus` → la voz de la bancada activa "destaca" sobre el fondo |
| **Salto a temporada** | `setDay()` al primer día de la temporada elegida | Trigger inmediato del beat engine: drop + relleno (`Pdef(\beatRelay).reset` + pulso 1.6) |

> **Excepción documentada:** `Opacity Floor` es el único sin efecto auditivo directo. Esto es intencional: representa el Art. 47 § (cláusula de opacidad). Convertirlo en audio sería *traducir lo que el estatuto declara intraducible*. Hacerlo visible-solamente es la postura coherente.

---

## 4. Cambios archivo por archivo (diffs concretos)

### 4.1 `2_midi_control.scd` (+ ~45 líneas)

Añadir al final de la sección Row 4 (después de línea 175):

```supercollider
// Lawrence English Ambient MIDI Mapping - Row 5 (Phenology Chamber, CCs 10-16)
MIDIdef.cc(\phenoRow, { |val, num, chan, src|
    var normalized = val / 127;
    case
        { num == 10 } {  // Activity Threshold (0.20 to 0.85)
            ~activityThresholdBus.set(normalized.linlin(0, 1, 0.20, 0.85));
            ~oscEchoToBrowser.value("/pheno/activityThreshold", normalized);
        }
        { num == 11 } {  // Window Width (0.4x to 2.5x)
            ~windowWidthBus.set(normalized.linlin(0, 1, 0.4, 2.5));
            ~oscEchoToBrowser.value("/pheno/windowWidth", normalized);
        }
        { num == 12 } {  // Seasonal Bias (-1.0 to +1.0)
            ~seasonalBiasBus.set(normalized.linlin(0, 1, -1.0, 1.0));
            ~oscEchoToBrowser.value("/pheno/seasonalBias", normalized);
        }
        { num == 13 } {  // Absence Weight (0.0 to 1.0)
            ~absenceWeightBus.set(normalized);
            ~oscEchoToBrowser.value("/pheno/absenceWeight", normalized);
        }
        { num == 14 } {  // Pulse Gain (0.0 to 2.0)
            ~pulsePhenoBus.set(normalized.linlin(0, 1, 0.0, 2.0));
            ~oscEchoToBrowser.value("/pheno/pulseGain", normalized);
        }
        { num == 15 } {  // Opacity Floor (0.0 to 0.7)
            ~opacityFloorBus.set(normalized.linlin(0, 1, 0.0, 0.7));
            ~oscEchoToBrowser.value("/pheno/opacityFloor", normalized);
        }
        { num == 16 } {  // Bancada (0-4 discrete, snap to int)
            var bancadaIdx = (normalized * 4).round.asInteger;
            ~bancadaBus.set(bancadaIdx);
            ~oscEchoToBrowser.value("/pheno/bancada", bancadaIdx / 4);
        };
}, ccNum: nil, chan: 0).permanent_(true);
```

Crear los 7 buses al inicio de `3_synthdefs.scd` (no en MIDI control — siguiendo el patrón existente).

### 4.2 `3_synthdefs.scd` (+ ~12 líneas)

Añadir, junto a los buses ya existentes:

```supercollider
~activityThresholdBus = Bus.control(s, 1).set(0.50);
~windowWidthBus       = Bus.control(s, 1).set(1.0);
~seasonalBiasBus      = Bus.control(s, 1).set(0.0);
~absenceWeightBus     = Bus.control(s, 1).set(0.3);
~pulsePhenoBus        = Bus.control(s, 1).set(1.0);
~opacityFloorBus      = Bus.control(s, 1).set(0.0);
~bancadaBus           = Bus.control(s, 1).set(0);
```

### 4.3 `6_osc_handlers.scd` (+ 8 líneas en `~oscToParamMap`, + 15 líneas de remap)

En el dictionary línea 152, añadir:

```supercollider
// ── Cámara Fenológica (Phenology Chamber, CCs 10–16) ─────────────
"/pheno/activityThreshold", \activityThreshold,
"/pheno/windowWidth",       \windowWidth,
"/pheno/seasonalBias",      \seasonalBias,
"/pheno/absenceWeight",     \absenceWeight,
"/pheno/pulseGain",         \pulseGain,
"/pheno/opacityFloor",      \opacityFloor,
"/pheno/bancada",           \bancada,
```

En el switch de remapeo línea 193, añadir cada uno con su rango (mismo patrón que `~oscToParamMap`).

OSCdef adicional para `/pheno/jumpSeason` (string-args, no continuo):

```supercollider
OSCdef(\phenoJumpSeason, { |msg|
    var season = msg[1].asString;
    // Echo to browser so all UIs sync; the calendar receives this via
    // parliamentEntry.ts dispatcher and calls _instance.jumpSeason()
    if(~visualsDest.notNil) { ~visualsDest.sendMsg("/pheno/jumpSeason", season) };
    // Trigger drop + fill on beat engine
    if(~beatEngineDrop.notNil) { ~beatEngineDrop.value };
}, "/pheno/jumpSeason");
```

### 4.4 `4_gui.scd` (+ ~50 líneas)

Añadir una **Row 5 GUI** con 7 knobs blancos puros (no amber):

```supercollider
// ── Row 5: Phenology Chamber (1-bit white palette) ────────────────
// Visual cite of the slot P aesthetic — these knobs belong to the
// "escaño del tiempo" (Cámara Fenológica), not to sonETH performance.
~phenoColor = Color.white;
~phenoLabelColor = Color.gray(0.8);
```

(7 `EZKnob` o `Slider` definitions con esa paleta, colocados debajo de Row 4.)

### 4.5 `5_beat_engine.scd` (+ ~10 líneas)

En el `Routine` (alrededor de línea 120 donde ya se lee `harmonicRich`), añadir lecturas:

```supercollider
activityThresh = ~activityThresholdBus.getSynchronous;
pulseGain      = ~pulsePhenoBus.getSynchronous;
bancada        = ~bancadaBus.getSynchronous.asInteger;

// Pool density modulada por umbral: más quórum → más densidad
poolDensity = poolDensity * activityThresh.linlin(0.20, 0.85, 1.5, 0.6);

// Filtro de bancada: si bancada != 0, suavizar spectralShift
if(bancada > 0) {
    spectralShift = spectralShift * 0.7;
};
```

### 4.6 `parliament.html` (~50 líneas modificadas)

**Reemplazar** la sección "Fungi Chemical → SC" (líneas 425–452) y "AI Gaia → SC" (líneas 454–463) con un único bloque "Cámara Fenológica · Bosque + Quórum" que tiene:

- 7 sliders nuevos (5 reasignan los muertos por OSC path + 2 nuevos)
- 1 fila de selector de bancada (5 botones radio: TODAS · SECA · 1as LLUVIAS · MEDIO SECO · 2as LLUVIAS)
- 1 fila de 4 botones de salto a temporada
- CSS class adicional `.tele-section--pheno` con borde superior `1px solid #fff`, fondo negro, etiquetas mayúsculas monoespaciadas

**Estilo 1-bit propuesto** (añadido a `<style>`):

```css
.tele-section--pheno {
    background: #000;
    border-top: 1px solid #fff;
    border-bottom: 1px solid #fff;
    font-family: 'Courier New', monospace;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    -webkit-font-smoothing: none;
}
.tele-section--pheno .tele-section-title { color: #fff; }
.tele-section--pheno .ctrl-row label { color: rgba(255,255,255,0.7); }
.tele-section--pheno input[type="range"]::-webkit-slider-thumb {
    background: #fff;
    border-radius: 0;  /* pixel-square, no rounding */
}
.tele-section--pheno .pheno-btn {
    background: #000;
    color: #fff;
    border: 1px solid #fff;
    font-family: 'Courier New', monospace;
    text-transform: uppercase;
    padding: 4px 8px;
    cursor: pointer;
}
.tele-section--pheno .pheno-btn.active { background: #fff; color: #000; }
```

### 4.7 `parliamentEntry.ts` (+ ~30 líneas)

En el dispatcher OSC ya existente (la función que recibe mensajes del WS bridge), añadir un caso para `/pheno/*`:

```typescript
if (address.startsWith("/pheno/")) {
  const key = address.replace("/pheno/", "");
  applyPhenoControl(key, value);  // exportado por breath.ts
  return;
}
```

### 4.8 `nw_wrld_local/src/projector/phenology/breath.ts` (+ ~80 líneas)

Añadir estado interno mutable:

```typescript
const _phenoState = {
  activityThreshold: 0.5,
  windowWidth: 1.0,
  seasonalBias: 0.0,
  absenceWeight: 0.3,
  pulseGain: 1.0,
  opacityFloor: 0.0,
  bancada: 0, // 0=todas, 1=seca, 2=1as, 3=medio, 4=2as
};

export function applyPhenoControl(key: string, val: number) {
  if (key in _phenoState) {
    (_phenoState as any)[key] = val;
    // Push to the calendar instance via its public methods
    switch (key) {
      case "activityThreshold": _instance?.setActivityThreshold?.({ value: val }); break;
      case "windowWidth":       _instance?.setWindowWidth?.({ value: val }); break;
      case "opacityFloor":      _instance?.setOpacityFloor?.({ value: val }); break;
      case "absenceWeight":     _instance?.setAbsenceWeight?.({ value: val }); break;
      case "bancada":           _instance?.setBancada?.({ value: bancadaIdxToKey(val) }); break;
    }
  }
}

export function jumpToPhenoSeason(season: string) {
  _instance?.jumpSeason?.({ season });
}
```

Modificar `seasonalWeight()` para sumar `_phenoState.seasonalBias`.
Modificar `activeSpeciesFraction()` para usar `_phenoState.activityThreshold` y `_phenoState.windowWidth`.
Modificar `wireForwardBreath()` para multiplicar `intensity *= _phenoState.pulseGain`.

### 4.9 `nw_wrld_local/ecosystems/default_ecosystem/modules/PhenologicalCalendar.js` (+ ~120 líneas)

Añadir al schema de `static methods` los 6 métodos nuevos listados en sección 4.8 del doc 02.

Añadir 6 propiedades en `constructor`:

```js
this._activityThreshold = 0.5;
this._windowWidth = 1.0;
this._opacityFloor = 0.0;
this._absenceWeight = 0.3;
this._bancada = "todas";
```

Modificar `_updateSpeciesLuminance()` para:

- Usar `this._activityThreshold` en `if (activity > X) activeCounts[entry.taxon]++;`
- Multiplicar `w * 0.6` por `this._windowWidth`
- Aplicar `lift *= dither(seed, t)` cuando `activity < threshold && this._absenceWeight > 0`

Modificar `_updateHtmlOverlays()`:

- Filtrar por `this._opacityFloor`: hash determinista por `sci` decide si la etiqueta queda oculta
- Si `this._bancada != "todas"`: aplicar luminance 0.16 a especies fuera de la bancada estacional

Añadir `jumpSeason({ season })` que mapea string → MONTH_STARTS[season] → `setDay()`.

---

## 5. Validación post-implementación

Una vez todo esté en código, los tests manuales (golden path):

1. **Bidireccionalidad MIDI ↔ HTML ↔ SC.** Mover CC 10 en el LC2 → la perilla blanca del SC GUI se mueve → el slider HTML "Activity Thresh" se mueve. Mover el slider HTML → CC 10 efectivo se ve en SC. Mover la perilla SC → ambos otros se mueven.
2. **Quórum sensible audible.** Subir `Activity Thresh` a 0.85 con día = 115 (pico de lluvias) → el beat se vuelve más denso. Bajarlo a 0.20 → silencio del beat (sólo drone).
3. **Bancada estacional.** Seleccionar "PRIMERAS LLUVIAS" en día 115 → en el slot P, sólo anfibios y aves residentes brillan; el resto se atenúa. En SC, el `spectralShift` se suaviza (LPF activo).
4. **Cláusula de opacidad visible.** Subir `Opacity Floor` a 0.5 → la mitad de las etiquetas activas desaparecen. El conteo numérico sigue mostrando el total real (transparente sobre la ocultación). Sin efecto en audio.
5. **Salto de temporada.** Pulsar "2as LLUVIAS" → el cursor del calendario salta al día 244, el beat hace drop+fill, el `harmonicrich` reverso se reactiva con el nuevo `seasonalWeight`.
6. **Decay suave.** Mover `Pulse Gain` a 0 → los votos del parlamento ya no pulsan el calendario, pero el calendario sigue corriendo. El audio no se silencia (sólo se desacopla del Parliament). Subirlo a 2.0 → cada voto inunda el HUD con pulso intenso.

---

## 6. Estimación de esfuerzo

| Archivo | Inserciones | Modificaciones | Riesgo |
|---|---|---|---|
| `2_midi_control.scd` | +45 | 0 | Bajo (handler nuevo aislado) |
| `3_synthdefs.scd` | +12 | 0 | Mínimo (sólo buses) |
| `6_osc_handlers.scd` | +25 | 0 | Bajo |
| `4_gui.scd` | +50 | 0 | Bajo |
| `5_beat_engine.scd` | +10 | +5 | Medio (toca routine activa) |
| `parliament.html` | +90 | −30 | Bajo (sustitución limpia de secciones DEAD) |
| `parliamentEntry.ts` | +30 | +5 | Bajo |
| `phenology/breath.ts` | +80 | +20 | Medio (reescritura parcial) |
| `PhenologicalCalendar.js` | +120 | +35 | Medio (algoritmos de luminancia + overlay) |
| **Total** | **~462 líneas nuevas** | **~95 modificadas** | — |

Una sola sesión de implementación (~2 horas si los tests pasan al primer intento).

---

## 7. Siguiente paso

Cuando confirmes este plan, procedemos con la implementación en este orden (que minimiza el blast radius si algo falla):

1. SC backend (`3_synthdefs.scd` → `2_midi_control.scd` → `6_osc_handlers.scd` → `4_gui.scd`) — testeable en aislamiento con SC sin que el browser corra.
2. Visualizer backend (`PhenologicalCalendar.js` → `breath.ts` → `parliamentEntry.ts`) — testeable refrescando el browser sin reiniciar SC.
3. HTML interface (`parliament.html`) — el último paso, una vez los dos extremos del puente ya responden.
4. `5_beat_engine.scd` — el último porque toca un Routine vivo; lo dejamos para asegurar que todo lo demás funciona antes de tocar el beat.

Tests inmediatos después de cada paso para evitar acumulación de bugs.
