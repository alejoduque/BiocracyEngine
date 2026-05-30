# Propuesta de controles bidireccionales para el módulo p

**Documento de diseño — derivado de**
[`01_tiempo_del_bosque.md`](./01_tiempo_del_bosque.md)
*("El tiempo del bosque como derecho de voz")*

**Estado:** propuesta — no implementado.
**Alcance:** este documento define qué nuevos *bridges MIDI ↔ HTML ↔ SC* necesita el módulo p para encarnar los conceptos del articulado (Cámara Fenológica de lo Vivo, Arts. 41–48) sin romper la coherencia bidireccional ya existente.

---

## 0. Principio rector

El documento base hace una afirmación operativa, no metafórica:

> *"El bosque toca el sinte."*

El módulo p debe ofrecer, además del barrido del año, **controles que el intérprete humano pueda manipular para escuchar/ver qué le ocurre al instrumento cuando se alteran los parámetros del modelo fenológico mismo** — no sólo la cosmética visual. Cada control nuevo es un dial sobre **cómo el bosque enuncia**.

Cada control nuevo debe respetar las tres reglas heredadas:

1. **Bidireccional triple.** HTML slider ↔ SC bus/GUI ↔ MIDI CC del Faderfox LC2. Un cambio en cualquiera de las tres superficies se refleja en las otras dos.
2. **Modula, no anula.** Como dice el Art. 45 §2, el voto de la Cámara *modula*, no reemplaza. Igual aquí: los controles del módulo p alteran cómo se computa el *quórum sensible*, pero éste sigue siendo función del calendario y las especies — el intérprete no fuerza un valor.
3. **Coherente con el espíritu 1-bit.** Sin sliders continuos suaves cuando un step quantizado es más honesto (e.g. selección de bancada estacional → 4 posiciones discretas).

---

## 1. Mapeo conceptual: artículos → controles

Del articulado estatutario y de la sección 3 ("El módulo p: el bosque toca el sinte") del documento base se desprenden cinco áreas que hoy **no son alterables** desde la interface y que deberían serlo:

| # | Concepto del documento | Hoy | Propuesta |
|---|---|---|---|
| 1 | **Umbral de actividad** (especie cuenta como activa si `actividad > 0.5`, Art. 45) | Hardcodeado `0.5` | Slider `activityThreshold` — desplaza el umbral del quórum sensible |
| 2 | **Bancadas estacionales** (Art. 43 §1) — focusTaxon limitado a 5 taxones | Sólo 5 opciones taxonómicas | 4 botones discretos: Seca · Primeras lluvias · Medio seco · Segundas lluvias (+ "Todas") |
| 3 | **Calendario fenológico bimodal** (Art. 42) — peso seca/lluvia ya computado pero no expuesto | `seasonalWeight()` en `breath.ts`, no editable | Slider `seasonalBias` — desplaza qué tan "seca" o "lluvia" lee el día actual, para audicionar escenarios |
| 4 | **Protocolo de alerta por ausencia** (Art. 46) — la ausencia es voz | Inexistente | Slider `absenceWeight` — pondera el efecto auditivo/visual de las especies *bajo* umbral (silencio sonoro) |
| 5 | **Cláusula de opacidad** (Art. 47 §) — no todo debe hacerse transparente | Etiquetas visibles automáticamente al pasar `activity > 0.6` | Slider `opacityFloor` — fracción mínima de especies cuyas etiquetas permanecen ocultas por principio, sin importar su actividad |

A esto se suman dos controles de **ventana temporal** que el documento implica al insistir en "tiempo doble" (estacional + circadiano, sección 2 sobre Hernández):

| # | Concepto | Propuesta |
|---|---|---|
| 6 | **Ancho de la ventana de actividad** (`s.window` por especie) | Slider `windowWidth` — escala global del ancho gaussiano (estrecho = picos más definidos, ancho = solapamientos largos) |
| 7 | **Velocidad del barrido del año** | Ya existe (`parliament.rotation` → `daysPerSecond`) | Mantener; añadir botón "saltar a temporada" |

---

## 2. Tabla de controles propuestos (siete nuevos, una bancada)

| Slider HTML | OSC path | SC bus | MIDI CC | Rango | Default | Efecto visual (módulo p) | Efecto auditivo (SC) |
|---|---|---|---|---|---|---|---|
| **Activity Thresh** | `/pheno/activityThreshold` | `~activityThresholdBus` | CC 10 | 0.20–0.85 | 0.50 | Más/menos nodos brillan; densidad del quórum sensible | `txInfluence` ganancia (más quórum → más densidad de beat) |
| **Window Width** | `/pheno/windowWidth` | `~windowWidthBus` | CC 11 | 0.4–2.5× | 1.0 | Halo gaussiano más/menos definido por nodo | `memoryFeed` (delay) — ventanas anchas suman ecos |
| **Seasonal Bias** | `/pheno/seasonalBias` | `~seasonalBiasBus` | CC 12 | -1.0–+1.0 | 0.0 | Offset al `seasonalWeight` → calibra qué tan "wet" lee el día | Reescala `harmonicrich` enviado por reverseBreath |
| **Absence Weight** | `/pheno/absenceWeight` | `~absenceWeightBus` | CC 13 | 0.0–1.0 | 0.3 | Especies bajo umbral parpadean tenuemente (1-bit dither) | `atmosphereMix` baja → silencio audible de la ausencia (Art. 44 §) |
| **Opacity Floor** | `/pheno/opacityFloor` | `~opacityFloorBus` | CC 14 | 0.0–0.7 | 0.0 | Fracción de etiquetas que quedan ocultas | Sin efecto auditivo directo (cláusula simbólica) |
| **Bancada** (radio) | `/pheno/bancada` | `~bancadaBus` (int) | CC 15 | 0–4 (steps) | 0 (todas) | `focusTaxon` mapeado a bancada estacional | Ducks the SC voicing complementaria |
| **Phen. Pulse Gain** | `/pheno/pulseGain` | `~pulsePhenoBus` | CC 16 | 0.0–2.0 | 1.0 | Cuánto puede pulsar el calendario por voto | Magnitud de la modulación de consenso `/bio/consensus` |
| **Salto a temporada** (4 botones) | `/pheno/jumpSeason` | — | — | discreto | — | `setDay()` al inicio de cada estación | Trigger único, no continuo |

**Nota sobre CCs:** los CCs 10–16 están libres en el Faderfox LC2 (Row 1: 0–4, Row 2: 32–36, Row 3: 5–9, Row 4: 37–41 ya están todos ocupados). Esto sugiere mapear los nuevos sliders a una **Row 5 lógica** del LC2 (físicamente las teclas/botones superiores del controlador, o un segundo controlador), o reasignar a un grupo de CCs alto (e.g. 42–48) para mantener la lógica del Faderfox por filas.

---

## 3. Flujo de datos bidireccional (todos los caminos)

```
                  ┌───────────────────────────────────────┐
                  │   Faderfox LC2 (físico) — CC 10–16    │
                  └─────────────┬─────────────────────────┘
                                │ MIDIdef.cc (en 2_midi_control.scd)
                                ▼
                  ┌───────────────────────────────────────┐
                  │   SuperCollider (bus + GUI knob)      │
                  │   ~activityThresholdBus, etc.         │
                  └─────────┬───────────────┬─────────────┘
                            │               │
        OSC echo            │               │ aplicado en
        /pheno/* ───────────┘               │ 5_beat_engine.scd
        ↓                                   │ (modula tx/atm/etc.)
        ↓                                   │
parliament-bridge.js (UDP↔WS)               │
        ↓                                   │
WebSocket /soneth/* /pheno/*                │
        ↓                                   │
parliamentEntry.ts                          │
        ├── HTML slider position sync       │
        ├── applyPhenoControl(key, val)     │
        │       │                           │
        │       ▼                           │
        │   PhenologicalCalendar.js         │
        │   (umbral, ventana, opacityFloor) │
        │                                   │
        └── reverseBreath ──────────────────┘
            (calendario → harmonicrich/texturedepth)
```

**Punto clave:** cuando el intérprete mueve el slider HTML `Activity Thresh`, el flujo es:

1. `oninput` envía `/pheno/activityThreshold` por WebSocket → parliament-bridge → UDP → SC.
2. SC recibe en `OSCdef(\activityThreshold)`, escribe `~activityThresholdBus`, actualiza la perilla GUI.
3. SC reenvía `/pheno/activityThreshold` como echo de vuelta al bridge → todas las superficies se sincronizan.
4. `parliamentEntry.ts` capta el echo, llama `applyPhenoControl("activityThreshold", val)` que invoca `_instance.setActivityThreshold({value: val})` en el calendario.
5. El módulo p re-renderiza el luminance loop con el nuevo umbral.
6. `reverseBreath` recomputa `activeSpeciesFraction()` con el nuevo umbral → `harmonicrich`/`texturedepth` se actualizan en SC → realimenta el audio.

El mismo flujo opera *en sentido inverso* si quien mueve es el knob físico del LC2 o el knob del GUI de SC. Esto es la regla bidireccional triple ya establecida en la Session 6 (MIDI/SC GUI Feedback Integration).

---

## 4. Cambios concretos por archivo (resumen para implementación futura)

### 4.1 `2_midi_control.scd`
Añadir una nueva sección `\phenoRow` con `MIDIdef.cc` para CC 10–16. Patrón existente (línea 65 onwards) sirve de plantilla. Crear los 7 buses de control nuevos.

### 4.2 `6_osc_handlers.scd`
Extender `~oscToParamMap` con las 7 entradas `/pheno/*`. El loop existente (línea 184) ya genera automáticamente OSCdefs por cada entrada, así que el código nuevo es sólo declarativo.

### 4.3 `4_gui.scd`
Añadir una **Row 5** al GUI (8 knobs visuales) con paleta blanca pura (cita explícita del módulo p 1-bit), distinta de la paleta amber del resto del GUI. Esto marca visualmente que estos controles pertenecen al "escaño del tiempo" y no a la performance sonETH clásica.

### 4.4 `5_beat_engine.scd`
Leer los nuevos buses en el `Routine` del beat engine para que el quórum sensible afecte directamente la complejidad del pool melódico (Art. 45 §1: decisiones que afectan al territorio requieren quórum favorable → audición: pool más rico cuando el quórum es alto).

### 4.5 `parliament.html`
Añadir una sección `<div class="tele-section">` titulada **"Cámara Fenológica · Phenology Chamber"** con los 7 sliders y los 4 botones de salto a temporada. Posicionarla inmediatamente después del bloque sonETH/Beat Engine para reforzar la jerarquía: las decisiones más-que-humanas modulan, no preceden, la performance.

Estilísticamente este bloque debería tener:
- Borde superior en blanco puro (no amber) — cita visual del 1-bit del slot P
- Etiquetas en mayúsculas, monoespaciadas
- Los 4 botones de temporada con outline de píxel (1px solid white)

### 4.6 `nw_wrld_local/src/projector/parliamentEntry.ts`
Extender el switch que dispatcha `/soneth/*` y `/parliament/*` para incluir `/pheno/*` → `applyPhenoControl(key, val)`. Hook nuevo expuesto al breath bridge.

### 4.7 `nw_wrld_local/src/projector/phenology/breath.ts`
- Exportar `applyPhenoControl(key: string, val: number)` que llama métodos nuevos del módulo.
- Modificar `activeSpeciesFraction()` para leer `activityThreshold` y `windowWidth` actuales.
- Modificar `seasonalWeight()` para sumar `seasonalBias`.
- Multiplicar el `intensity` que entra a `pulse()` por `pulseGain`.

### 4.8 `nw_wrld_local/ecosystems/default_ecosystem/modules/PhenologicalCalendar.js`
Añadir nuevos métodos públicos al schema (lo cual también los hace accesibles al panel nw-wrld):

```js
static methods = [
  ...,
  { name: "setActivityThreshold", options: [{name:"value", defaultVal:0.5, type:"number", min:0.20, max:0.85}] },
  { name: "setWindowWidth",      options: [{name:"value", defaultVal:1.0, type:"number", min:0.4, max:2.5}] },
  { name: "setOpacityFloor",     options: [{name:"value", defaultVal:0.0, type:"number", min:0.0, max:0.7}] },
  { name: "setAbsenceWeight",    options: [{name:"value", defaultVal:0.3, type:"number", min:0.0, max:1.0}] },
  { name: "setBancada",          options: [{name:"value", defaultVal:"todas", type:"select",
                                            values:["todas","seca","primeras_lluvias","medio_seco","segundas_lluvias"]}] },
  { name: "jumpSeason",          options: [{name:"season", defaultVal:"seca", type:"select",
                                            values:["seca","primeras_lluvias","medio_seco","segundas_lluvias"]}] },
];
```

Tres cambios algorítmicos importantes:

- **`_updateSpeciesLuminance()`**: usar `this._activityThreshold` en lugar del 0.5 hardcodeado al sumar `activeCounts`, y multiplicar el ancho gaussiano por `this._windowWidth`.
- **`_updateHtmlOverlays()`**: filtrar etiquetas según `opacityFloor` (cláusula Art. 47).
- **Nodos bajo umbral**: aplicar dither/parpadeo proporcional a `absenceWeight` para que la ausencia sea visible (Art. 44 §).

---

## 5. Mapeo articulado ↔ control (justificación filosófica)

| Artículo estatutario | Control técnico | Por qué |
|---|---|---|
| Art. 41 §: presencia/ausencia como enunciación | `Absence Weight` | Hace audible/visible la ausencia, no sólo la presencia |
| Art. 42: calendario bimodal de cuatro temporadas | Botones de salto a temporada + `Seasonal Bias` | El usuario puede audicionar cómo se oye cada temporada |
| Art. 43 §1: bancadas fenológicas | Selector `Bancada` | Activa una bancada estacional como `focusTaxon` ampliado |
| Art. 43 §2: voz/voto estacionales de migratorias | `Activity Thresh` (al subirlo, las migratorias quedan fuera más tiempo) | Materializa el "escaño que se suspende en ausencia" |
| Art. 44: voz por presencia fenológica | `Window Width` | Controla qué tan amplia es la "ventana de presencia" enunciativa de cada especie |
| Art. 45: quórum sensible (umbral 0.5 explícito) | `Activity Thresh` | **El único valor del artículo que es numérico explícito.** Hacerlo control es honrar la letra del estatuto |
| Art. 45 §2: voto modula, no anula | `Phen. Pulse Gain` | Establece cuán fuerte el calendario puede pulsar el consenso humano (0 = silenciado, 2.0 = dominante) |
| Art. 47 §: cláusula de opacidad | `Opacity Floor` | Permite al guardián del territorio ocultar parte del inventario por principio, no por falla |
| Art. 48: salvaguarda contra captura | (ningún slider) | Estructural — los buses `/pheno/*` quedan dentro de soberanía local, no exponen a APIs externas |

---

## 6. Lo que **no** propone esta fase

Para mantener la propuesta focalizada, deliberadamente queda fuera:

- **Tokenización del quórum sensible.** El Art. 48 lo prohíbe; no implementaremos BioTokens en esta fase.
- **Persistencia del acta fenológica anual.** El Art. 42 § la exige pero corresponde a una segunda fase (almacenamiento JSON del recorrido del año).
- **Edición manual del día pico de cada especie.** El modelo determinista por hash es parte del rigor del slot P (estable across reloads); abrirlo a edición rompería el principio.
- **Triple controlador (Faderfox + segundo + teclado).** Asumimos que los CCs 10–16 se accederán por reasignación del LC2 o por el GUI hasta que haya hardware adicional.

---

## 7. Próximo paso recomendado

Antes de tocar código:

1. **Validar el mapeo con el documento base** — ¿coincide la selección de 7+1 controles con la lectura del articulado?
2. **Decidir reasignación física de CCs** — ¿Row 5 lógica del LC2, o segundo controlador?
3. **Acordar la paleta de la sección HTML** — ¿blanco puro como el slot P, o mantener amber para coherencia con la fila sonETH?

Una vez validado este documento, una segunda iteración (`03_implementacion_controles.md`) detallará los diffs concretos archivo por archivo.
