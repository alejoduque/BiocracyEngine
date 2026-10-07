← [README](../../README.md) · [English](../en/controls.md)

# Controles y sonido

> **Cuaderno de Mandos** — referencia interactiva de los controles: <https://claude.ai/code/artifact/785cc1af-01a5-48a5-b915-272e957e80e2>. A diferencia de la tabla estática de abajo, da las **dos** incidencias de cada mando — qué bus/SynthDef mueve en el sonido y qué liga visual toca, módulo por módulo — con búsqueda y filtro por familia. Se regenera del registro cuando cambia; la tabla siguiente es el snapshot que vive en el repositorio.

**71 parámetros**, todos generados desde una sola entrada de registro cada uno (`~paramDefs` en `0_parameters.scd`): **64 CC MIDI** y **75 rutas OSC**. Cada slider, perilla o CC acciona a la vez los buses de audio de SC y las visualizaciones. Las diez primeras filas cruzan los slots visuales, dando 10 parámetros × 10 slots = 100 vinculaciones sólo en esa capa.

Las cifras las reporta el propio motor al arrancar (ver [Comprobación de arranque](diagnostico.md#comprobación-de-arranque)); si este documento y el banner discrepan, manda el banner.

## Filas 1–2: rendimiento central + procesamiento ambiental (todos los slots)

| Parámetro | CC MIDI | Audio SC | Slot 0 Parliament | Slot 1 Asteroid | Slot 2 LowEarth | Slot 3 Perlin |
|---|---|---|---|---|---|---|
| **volume** | CC 0 | volumen maestro | intensidad de luz puntual | alfa del trazo de onda | opacidad de nube blanca | opacidad del trazo |
| **pitchShift** | CC 1 | freq ±2 oct | amplitud Z de especies | desplazamiento X de carril | estiramiento Y de nube | intensidad de ruido |
| **timeDilation** | CC 2 | estirado de envolvente ×0.5–6 | velocidad orbital | zoom X del ruido | amortiguación de rotación | cuadros por ciclo |
| **spectralShift** | CC 3 | barrido LPF 80–2400 Hz | umbral de bloom | tinte ámbar-cian | desplazamiento de tono de línea | compresión de capas |
| **spatialSpread** | CC 4 | paneo cuadrafónico I↔D | distancia de cámara | separación de carriles | dispersión XY de líneas | desplazamiento X/Y del blob |
| **textureDepth** | CC 32 | densidad granular | grano de película | densidad de líneas de rejilla | tamaño de punto | grosor de trazo |
| **atmosphereMix** | CC 33 | reverb 0–0.9 | amortiguación de estela | fantasmeo del fondo | opacidad de nube roja | número de capas |
| **memoryFeed** | CC 34 | realimentación de delay 0–0.8 | fuerza del bloom | alfa de la estela fantasma | opacidad de líneas rojas | alfa fantasma |
| **harmonicRich** | CC 35 | razón FM 0.1–5 | complejidad de Lissajous | superposición armónica | escala Z de Bézier | deriva de tono |
| **resonantBody** | CC 36 | Q del filtro 0.1–0.8 | aberración cromática | brillo del punto de pico | escala de nube roja | peso interior |

## Filas 3–4: drone y ruido

| Parámetro | CC MIDI | Audio SC |
|---|---|---|
| **masterAmp** | CC 5 | recorte de capa — pads, drone **y** motor de beat desde un solo control |
| **filterCutoff** | CC 6 | inclinación tonal amplia, por debajo del ajuste absoluto de `spectralShift` |
| **noiseLevel** | CC 7 | aliento de ruido rosa bajo el pad |
| **noiseFilt** | CC 8 | LPF del ruido 200–2000 Hz |
| **droneDepth** | CC 9 | cuánto se hunde el cuerpo del sub |
| **droneFade** | CC 37 | tiempo de glissando en los controles propios del drone — **incluida su altura** (ver abajo) |
| **droneSpace** | CC 38 | tamaño de sala de la reverb |
| **droneMix** | CC 39 | drone seco ↔ plenamente florecido (lavado + sub) |
| **delayFeedback** | CC 40 | realimentación del delay de peine |
| **transactionInfluence** | CC 41 | cuánto dobla la actividad de la cadena al motor |

> Seis de estos (CC 5, 6, 9, 37, 38, 39) escribían antes en buses de control que **ningún UGen leía** — `\opalDrone` no los declaraba y `\elektronBell` los leía hacia variables que descartaba. Ahora dan forma al drone.

> **El drone se desliza entre alturas.** Cada cuatro compases el motor de beat recorre `#[55, 62, 73, 82, 49, 65, 55, 41]` Hz según el contador de frases —más o menos cada 45 a 50 segundos al tempo habitual— y lo hacía con un `.set(\freq, …)` pelado. `freq` era el único parámetro de `\opalDrone` sin lag, así que una voz que llevaba casi un minuto sosteniendo una nota saltaba una quinta o una sexta al instante, lo que en un drone continuo se lee como avería y no como cambio. Ahora cabalga sobre `droneFade` como todos los demás controles continuos de ese SynthDef, al doble — un movimiento de altura necesita bastante más tiempo que uno de filtro para dejar de sonar a edición. Con el valor por defecto de 2 s eso da un portamento de 4 s; arriba del todo el fader lo lleva a 10.

## Fila 5: Cámara Fenológica de lo Vivo — el corpus sobre el anillo de 365 días

`14_phenological_corpus.scd` reproduce 261 clips AudioMoth de La Luna / Planeta Rica a lo largo del anillo fenológico del Artículo 42. Sólo **34 de 365 días llevan grabación**; los otros 331 son silencio, y bajo el Artículo 44 ese silencio es el material dominante de la pieza, jamás interpolado.

| Parámetro | CC MIDI | Audio SC |
|---|---|---|
| **activityThreshold** | CC 10 | Art. 45 — una presencia por encima de 0.5 enciende el escaño; por debajo, la especie está en el territorio pero callada en la Cámara |
| **windowWidth** | CC 11 | Art. 43 — alcance gaussiano en días del anillo. 0.4 deja las grabaciones como puntos aislados en el silencio; 2.5 permite que un día real se oiga desde el otro lado de un hueco (nunca inventa uno) |
| **seasonalBias** | CC 12 | inclina la selección hacia Seca (−1) o lluvias (+1) con independencia del cursor |
| **absenceWeight** | CC 13 | Art. 44 — en 0 deja los días sin grabación verdaderamente mudos; por encima suenan la capa ultrasónica ×8, así que lo que llena el silencio es lo que el oído humano no alcanza |
| **pulseGain** | CC 14 | Art. 45 — con cuánta fuerza el *quórum sensible* empuja de vuelta hacia `harmonicRich`, `textureDepth` y `/bio/consensus` |
| **opacityFloor** | CC 15 | Art. 47 — subirlo retiene más del corpus frente al análisis, la proyección y el láser |
| **bancada** | CC 16 | Art. 43 — 0 = todas, luego los cuatro roles ecológicos del detector |
| **phenoRate** | CC 21 | velocidad del anillo en días/segundo. Por defecto 0.0167 = un día por minuto = un año de 6 h 05 m; rango completo 91 s → 48 h |
| **corpusLevel** | CC 22 | las grabaciones de campo frente a la síntesis |

> Antes de esta capa, cinco de estos buses (`windowWidth`, `seasonalBias`, `absenceWeight`, `pulseGain`, `opacityFloor`) estaban asignados y eran alcanzables por MIDI y OSC pero tenían **cero lectores en SuperCollider**. El corpus es aquello para lo que se construyeron.

**El anillo responde mientras el día todavía corre.** Cada control de esta fila se consulta en un solo lugar — `~phenoPool`, llamado una vez por día fenológico — y el anillo solía dormir el día entero en un único `wait`. Al ritmo por defecto eso son sesenta segundos entre girar una perilla y oírlo, y ocho minutos en el extremo lento, así que toda la bancada se leía como no cableada. El mismo fallo golpeaba al transporte por el otro lado: **NEXT REC. DAY ▶** fijaba el cursor correctamente y la rutina se lo dormía encima (el log muestra dos `skip -> doy 211` con pocos segundos de diferencia y el día en sí llegando mucho más tarde).

El anillo sigue girando a `phenoRate`. Lo que cambió es que la espera está troceada (0.25 s), y en cada trozo la Cámara vuelve a preguntar quién está admitido *hoy*:

* **las solicitudes de salto se atienden de inmediato** — `/pheno/next`, `/pheno/goto` y el botón despiertan al anillo y liberan lo que esté sonando, así que el salto es audible en lugar de quedar sepultado bajo un clip al que le faltan cincuenta segundos;
* **la selección se vuelve a decidir dos veces por segundo**, comparada por clave de clip, así que un barrido de perilla arranca sólo lo que acaba de cruzar el umbral de verdad y detiene sólo lo que ha caído por debajo — nada se redispara mientras arrastras;
* **`pulseGain` se recoge sobre una banda muerta** en lugar de una vez al día, así que el aliento inverso sigue al fader sin pelearse con el `harmonicRich` de quien toca.

> **Liberar una voz del corpus exige una compuerta negativa.** Ambas envolventes del corpus son `Env.new([0,1,1,0], …)` —longitud fija, sin nodo de liberación— y para esas EnvGen trata `gate` como disparo puro: `.set(\gate, 0)` no hace absolutamente nada y el clip se reproduce entero con su atk+hold+rel. La liberación forzada es `gate < 0`, a lo largo de `-1.0 - gate` segundos. `~phenoPanic` siempre había usado una compuerta en cero, que es la razón por la que `/pheno/stop` detenía el reloj del anillo y dejaba todas las voces sonando.

**Dos rutas de reproducción, porque 384 kHz no es opcional.** Un clip AudioMoth de 60 s son 92 MB como Buffer de servidor — el corpus serían 24 GB residentes. Nada lee los originales en tiempo de ejecución; dos niveles derivados sostienen la capa:

* `corpus/audible/` (48 kHz) alimenta un pool fijo de 16 ranuras en RAM recicladas por la anticipación del anillo. No se asigna nada en el momento del disparo.
* `corpus/expanded/` (expandido ×8 en el tiempo) se transmite con `DiskIn` para la voz de ausencia — 4 buffers de cue, ~2 MB.

Coste residente ≈ 230 MB, de modo que `memSize` y `numBuffers` quedan sin cambios.

> **Por qué la expansión se hornea fuera de línea.** `DiskIn` no realiza conversión de frecuencia de muestreo, así que apuntarlo a un archivo crudo de 384 kHz en un servidor a 48 kHz expande ×8 gratis — un truco tentador, y equivocado. Baja *todo* tres octavas, así que la banda audible fuerte aterriza en 125 Hz–2.5 kHz y sepulta el ultrasonido que pretendía revelar. El renderizador aplica un pasa-altos a 38 kHz (24 dB/oct) **antes** de expandir, así que sólo llega lo que era genuinamente inaudible, a 4.75–24 kHz.

**Escalonado de ganancia.** `~trimCorpus = 2.60 × ~trimMaster`, medido y no adivinado. Los siete MP3 de `samples/` promedian −22.2 dB de media; `corpus/audible/` promedia −21.3 dB tras la ganancia global única — dentro de ~1 dB, así que paridad de trim es paridad de sonoridad. Como `corpusLevel` se sitúa en la ruta de esta capa y por defecto vale 0.5, el trim compensa: la capa aterriza a ~1 dB de la capa de samples con el fader en su valor por defecto y ~6 dB por debajo de la cama del drone, dejando la mitad superior del fader como margen real.

La compilación aplica **una ganancia global sobre todo el corpus**, nunca normalización por clip — una noche seca y callada tiene que seguir callada frente a un coro de insectos en lluvias, ya que `activity` y `richness` son exactamente la señal que la normalización por clip aplanaría.

Construye la biblioteca derivada (~4.2 GB, una sola vez) con:

```bash
python3 tools/build_corpus.py --dry-run   # cuentas y tamaños proyectados
python3 tools/build_corpus.py             # renderiza + escribe corpus/manifest.json
```

Transporte del anillo: `/pheno/goto <doy>`, `/pheno/next`, `/pheno/stop`, `/pheno/start`.

> **El anillo abre en un día grabado.** Sólo 34 de 365 días llevan audio y el primero es el doy 9, así que arrancar el cursor en el doy 1 significaba que el instrumento empezaba con ocho minutos de nada — y como los dos arcos están separados por huecos de 178 y 131 días, puede después quedarse en silencio hasta **tres horas** al ritmo por defecto. La ausencia es el material (Art. 44), pero hay que llegar a ella, no arrancar dentro. `/pheno/next` y el botón **NEXT REC. DAY ▶** saltan al siguiente día que efectivamente tiene audio.

## Cámara de las Especies — los cinco escaños, como voces

Sliders sólo de navegador (sin CC MIDI), cinco especies × dos controles, tomados del padrón UICN en vivo. Durante todo el tiempo que existieron emitían `/agents/species/*` hacia UDP 57120 donde **ningún OSCdef los recibía** — el `/diag` del puente mostraba 30 mensajes enviados y nada de vuelta — así que `FREQ` leía un `440Hz` fijo y `VOT` un `0` fijo en cada sesión.

| Control | Emite | Efecto en SC |
|---|---|---|
| **Species Activity** (×5) | `/agents/species/activity [id, v]` | pondera cada cuánto se elige ese escaño para un golpe de percusión |
| **Species Presence** (×5) | `/agents/species/presence [id, v]` | con cuánta fuerza habla el escaño, y le corresponde un registro |
| **eDNA Biodiversity** | `/agents/edna/biodiversity [id, v]` | lectura del sitio; devuelta con una validación que decae |

El corpus no puede cargar taxonomía — está indexado por *rol* ecológico, que es la razón por la que las bancadas del Artículo 43 se etiquetan por rol. Así que una especie se vuelve audible en la capa de percusión, donde ya existen un pool de alturas y un disparo. La división del trabajo es deliberada: el **pool** sigue eligiendo el grado y el **escaño** sólo elige el registro. Una especie no puede sobrescribir la melodía; puede decir en qué octava la oye la cámara.

`~speciesBand` es `[1.0, 1.33, 1.78, 2.37, 3.16]` — pasos de ~5 semitonos, sólo hacia arriba, escaño 0 al unísono. Medido contra el pool real en vez de adivinado: un conjunto simétrico alrededor de 1.0 dejaba los escaños bajos por debajo del suelo de 40 Hz que impone `\opalPerc`, y en la parte baja del fader `harmonicRich` dos o tres de ellos colapsaban sobre 40 Hz y se volvían la misma voz (21 notas recortadas, razón entre escaños adyacentes 1.00 — idénticos). Sólo hacia arriba no recorta nada y mantiene un 1.33 completo entre escaños en todo el rango del fader, rematando cerca de 780 Hz. El unísono en el escaño 0 significa que el registro original de la capa no se pierde, sólo queda asignado al primer escaño — que, con las presencias por defecto, es además la elección más probable.

**Una especie vota sonando.** `~speciesVotes[i]` se incrementa en el momento del golpe, y el escaño informa de vuelta en `/agent/species/state [id, presence, activity, votes, freq]` desde la emisión regulada que el motor ya tenía. `parliamentStore.ts` ha parseado ese mensaje, en exactamente ese orden de argumentos, desde que se escribió — simplemente no tenía emisor.

## BioToken V3 — la fórmula muestra sus propios términos

La fórmula del panel era texto estático y contradecía al código que describía: decía `Presencia × Duración` donde `bioTokenTerms()` siempre ha multiplicado por *actividad*, e imprimía UICN como el multiplicador crudo `×5` cuando el factor aplicado es ese entre 5. Dos de sus seis factores eran constantes congeladas que quedaron atrás cuando se retiraron los paneles Fungi Networks y Gaia AI Core. Cada término lleva ahora su valor vivo al lado:

| Término | Origen |
|---|---|
| Presencia | media de `species[].presence` |
| **Actividad** | media de `species[].activity` — reetiquetado desde "Duración" para coincidir con el código |
| eDNA.biodiv | media sólo sobre los sitios **expuestos** — promediaba los ocho cuando sólo Córdoba tiene fader, así que siete 0.5 congelados amortiguaban el token permanentemente |
| Fungi.chem | ← `/bio/nutrient`, el pulso micelial que el panel Eco ya muestra |
| AI.optim | ← `/bio/density`, densidad de transacciones |
| IUCN.weight | `max(IUCN_MULT) / 5`, mostrado normalizado |

## Fila 7: la cadena como proceso — `chainProcess`

| Parámetro | CC MIDI | Audio SC |
|---|---|---|
| **chainProcess** | CC 23 | 0 es el corpus intacto; 1 es el corpus plenamente procesado por lo que la cadena está haciendo |

Hasta aquí el acoplamiento corría: cadena → voces de síntesis. Llegaba una transacción, su valor se mapeaba logarítmicamente a una nota MIDI, su gas a una velocidad, su prioridad a una envolvente, y sonaba una campana. Tres escalares por transacción. Mientras tanto el corpus —261 grabaciones del sitio real— estaba en una capa aparte, meramente planificado por un calendario, sin que la cadena lo tocara.

Eso desperdiciaba los datos: una auditoría de lo que envía `eth_sonify.py` encontró que `blockHash`, `calldataLen` y `nonce` se parseaban y no los leía nadie, mientras `entropy`, `blockNum` y `blockTxCount` se computaban y sólo se imprimían en la línea del monitor. Y apuntaba la pieza al revés. La afirmación de la obra es que la cadena actúa SOBRE un territorio; hacer que la cadena toque junto al bosque, sobre un conjunto separado de instrumentos sintetizados, afirma lo contrario: dos partes tocando juntas.

Así que el corpus es el material y la cadena es lo que se le hace. Tres dimensiones, y ninguna de ellas es una nota — todas son condiciones:

| Lectura de la cadena | Fija |
|---|---|
| `entropy` | **DIFUSIÓN** — una cadena que llega de forma pareja deja la grabación legible; una a ráfagas la emborrona hasta que el bosque es un lavado de donde solía estar |
| `calldataLen` | **VENTANA DE EMBORRONADO** — cuánto sangran las magnitudes a lo ancho del espectro, de modo que un acto que sólo mueve dinero apenas roza la grabación y uno que ejecuta algo la arrastra de lado |
| `congestion` | **DRIVE y filtro** — llenado del bloque contra la tarifa base: la presión sobre la cadena se vuelve presión sobre la grabación |

Las dos voces del corpus se enrutan a `~corpusProcBus` para poder procesarse como **grupo**; antes escribían directo a la salida principal (`Out.ar(0, …)` cableado en ambas), que es exactamente la razón por la que nada podía colocarse a lo ancho de la capa. `~corpusOutBus` vale 0 por defecto, así que si este archivo no llega a cargar el corpus sale directo como siempre.

## Fila 8: mezclador matricial — los únicos controles que cambian la sonoridad

| Parámetro | CC MIDI | Capa |
|---|---|---|
| **mixDrone** | CC 42 | `\opalDrone` — la cama continua |
| **mixPad** | CC 43 | `\elektronBell` |
| **mixKick** | CC 44 | `\opalKick` |
| **mixPerc** | CC 45 | `\opalPerc` |
| **mixDust** | CC 46 | `\opalDust` |
| **mixSample** | CC 47 | `samples/` vía `\samplePlayer*` |
| **mixCorpus** | CC 48 | la capa audible de AudioMoth |
| **mixUltra** | CC 49 | la voz de ausencia ×8 |

Todos los demás controles de la superficie dan forma al **timbre**. Antes de esta fila, el balance entre capas vivía sólo en el presupuesto de ganancia cableado de `3_synthdefs.scd` (`~trimDrone`, `~trimPad`, …), fijo en tiempo de carga e inalcanzable mientras se toca — de modo que el instrumento no podía mezclarse.

El unísono es **1.0 a media carrera**: al arrancar estos multiplican por exactamente 1 y el motor suena como antes. `0` es un mute verdadero, `2.0` es +6 dB. Multiplican los trims en lugar de reemplazarlos, así que el presupuesto de ganancia documentado sigue teniendo sentido. Medido sobre la capa del drone: unísono 0.0262 RMS, 0.5 → 0.0132 (−6 dB), 2.0 → 0.0531 (+6 dB), 0 → silencio.

Las tiras de la GUI de SC llevan un **MUTE** que recuerda la posición del fader, así que quitar el mute restaura el nivel exacto. Los faders del mezclador aparecen en ambas superficies y siguen a MIDI, navegador y cargas de preset por la misma ruta `~setParam` que cualquier otro control.

## MEZCLA — una banda, un dueño (`mixCarve`)

Un solo control, de 0 a 1, en la fila de la Marea y la sala (GUI de SC; ruta `/mix/carve`). **0 es el motor exactamente como siempre sonó**, con su barro incluido, que es también el camino hacia una pieza de ruido. **1 es la mezcla profesional**: cada capa en su banda, sin que se tapen. Todo lo que hace se cruza con este número (`LinXFade2`), así que cualquier valor intermedio es una mezcla entre las dos. Medido: a 0 la salida es idéntica bit a bit a la entrada.

Se carga desde la lista de configs, como los EXT, con tres complementos que sólo tocan este valor y dejan el mundo que esté sonando: **MEZCLA_1_Limpia** (1.0), **MEZCLA_2_Media** (0.5) y **MEZCLA_0_Barro** (0.0). Las configs base no lo traen, así que no lo cambian.

Qué hace, en el camino de cada capa hacia la mezcla (`\stemSum`, perfiles en `~stemCarveProfiles`):

| Capa | Mezcla |
|---|---|
| **kick** | dueño de 40–90 Hz y del sub: su seno de 12–22 Hz se corta a 28 Hz; los picos quedan a 12 dB de su propio nivel |
| **drone** | sobre el bombo (corte a 45 Hz), cede 4 dB bajo 150 Hz cuando golpea el bombo, −2 dB a 400 Hz donde se amontonan los medios bajos |
| **pad** | corte a 60 Hz (su pulso una octava abajo vivía en 8–37 Hz), cede bajo el bombo, −3 dB a 300 Hz; sube de registro hasta ×1.6 |
| **perc** | picos contenidos; devuelve su estante de aire |
| **dust** | corte a 250 Hz y techo de 1.2 kHz abierto hasta 6 kHz: el polvo pasa de cuerpo a detalle |
| **corpus** | −3 dB bajo 200 Hz: el bosque se sienta sobre la cama |
| **sample, motores** | corte a 40 / 30 Hz; masa a 25 Hz |

Y en todo el motor:
- **Sin graves en las reverbs:** la entrada de cada FreeVerb pierde lo que está bajo 180 Hz, y la sala (`\resonantChamber`, hasta 28 s) lo que está bajo 150 Hz. Ahí estaba el lavado grave.
- **Master:** un corte real a 24 Hz (4º orden; antes sólo había el LeakDC), los graves en mono bajo 120 Hz (Linkwitz-Riley: el domo y sus seis subwoofers quieren una sola señal) y el compresor con su llave filtrada a 100 Hz, para que el sub deje de bombear al resto.

**Medirlo:** `python3 tools/mixcheck.py recordings/<toma>.wav` da LUFS, rango, true peak, cresta, bandas por octava, ancho por banda y lo que hay bajo 30 Hz, con un ✔/✘ por criterio. `--ref <archivo>` compara contra una referencia. La toma del 2026-10-05, sin carve, falla los cinco: medios bajos al nivel del bajo, presencia −18.6 dB, lado a −3.3 dB bajo 120 Hz, rumble, cresta 25.7 dB.

**Nivel de entrega para el domo:** los WAV de los clips se nivelan en post a −20 LUFS, nunca por encima de −1 dBTP, con una sola ganancia para todos y sin limitar (`dome-render.js`, siempre, sin opción).

## Marea — el arco de densidad

El ritmo no es una rejilla. No hay patrón de pasos decidiendo qué suena; un oleaje lento decide qué tan *probable* es cualquier onset, y los eventos se colocan por probabilidad con ±45 % de un tick de jitter para que nada caiga sobre un pulso audible. El bombo sólo puede ocurrir donde la cadena misma tiene una costura —un bloque nuevo— e incluso ahí sólo con probabilidad `tide²`, de modo que el extremo grave está presente en la cresta y ausente en el valle.

El arco se mide en **bloques**, no en segundos, así que queda enganchado a la cadencia propia de la cadena en lugar de derivar contra ella cuando la red se acelera o se atasca.

| Control | OSC | CC MIDI | Efecto |
|---|---|---|---|
| **ARCO CORTO** | `/tide/short` | CC 17 | ~3.5 bloques (40–50 s) |
| **ARCO MEDIO** | `/tide/media` | CC 18 | ~8 bloques (1.5–2 min) — por defecto |
| **ARCO LARGO** | `/tide/larga` | CC 19 | ~25 bloques (4–6 min) |
| **PULSO** | `/tide/pulse` | CC 20 | latido de sub-graves, uno por bloque, atraviesa los valles |

Los tres arcos son **mutuamente excluyentes, y SC es quien aplica esa regla** — se impone una sola vez en `~setParam` (`exclusiveGroup`), la única ruta de escritura que todas las superficies ya comparten, así que marcar uno en el navegador también desmarca los otros en la GUI de SC y bajo MIDI. El navegador sólo refleja el eco; nunca impone. Los tres apagados es un estado legal: densidad plana, sin oleaje.

Obsérvalo en `[MON]`: `tide:<arco>/<fase>=<oleaje>` y `puls:`.

## Escalonado de ganancia

El bus maestro corría antes a `outPk` 3–6 contra una escala completa de 1.0 con el limitador conteniendo el 90–98 % de forma *continua* — un compresor, no un limitador, que es la razón por la que el nivel apenas respondía a `masterVolume` o `masterAmp`. La causa era una sola: la capa de pads sumaba **linealmente** con la concurrencia (20 pads = 1.96) mientras cualquier otra capa estaba en ≤ 0.17.

Los pads reciben compensación de polifonía (`1/√n`, así que la capa crece como `√n`), y un único `~trimMaster` fija el nivel absoluto.

El balance estaba entonces mal de una segunda manera, que las mediciones de pico no podían ver. Calibrar sobre la **cresta** dejaba sin nada que sostuviera el **suelo**: medida a lo largo de un arco de marea completo, la mezcla estaba por debajo de 0.05 —inaudible— en el **48 % de las ventanas**, con un factor de cresta de 340:1. Media pieza era silencio puntuado por picos. El drone es ahora la **cama** en lugar de una referencia callada, el valle de marea adelgaza hasta 0.42 en vez de 0.15, y las grabaciones de campo sostienen y se funden entre sí en lugar de puntuar. Resultado: **inaudible 48 % → 16 %**, cresta 340:1 → **37:1**, nivel mediano ×1.8, `outPk` p90 0.745.

Estos trims siguen siendo la *estructura* del balance. Lo que la Fila 8 añade es un multiplicador en vivo sobre cada uno, para que la estructura pueda ajustarse mientras se toca sin editar constantes y reiniciar.

## La GUI de SC es monoespaciada de 1 bit, con dos excepciones

Sólo blanco y negro, una sola tipografía (Menlo), etiquetas en mayúsculas. El esquema ámbar anterior llevaba cinco tonos que codificaban cada uno un estado —verde ok, rojo alto, amarillo armado— ninguno de los cuales sobrevivía a un proyector o a una fotografía, y que hacían que el tono hiciera el trabajo que debería hacer el estado. Cada control es blanco sobre negro y un control **accionado** se invierte a negro sobre blanco.

Dos cosas no son de 1 bit deliberadamente, porque la inversión necesita un cuerpo que invertir y ninguna de las dos lo tiene.

**Las luces de estado son rojas cuando hay señal, oscuras cuando no.** Un control tiene una forma que se puede leer; una luz no tiene más que su propio estado. Cuando la paleta pasó a 1 bit, `mainTheme.green` y `mainTheme.red` se volvieron ambos `Color.white` — y el drawFunc del LED seguía eligiendo entre esos dos nombres como su *única* señal de estado, así que las cinco luces eran discos blancos idénticos en cualquier condición. Ahora llevan dos colores literales propios; una luz apagada conserva su aro, así que sólo se apaga el filamento. Nada más en la ventana es rojo, así que la fila de estado es lo único que puede llamarte la atención desde el otro lado de un escenario.

Tres de ellas además respondían a la pregunta equivocada — comprobaban si algo se había *registrado* en vez de si estaba *corriendo*, lo que se vuelve cierto al arrancar y sigue cierto a través de un feed muerto:

| Luz | Era | Es |
|---|---|---|
| **SERVER** | `Server.default.serverRunning` | sin cambios |
| **BEAT** | `~beatRoutine.notNil` — nunca se ponía en nil tras `.stop`, así que un motor detenido se leía como corriendo | `~lastBeatTime` dentro de 3 s, estampado una vez por paso |
| **OSC** | `OSCdef(\txHandler).notNil` — registro, no tráfico | `~lastOscTime` dentro de 5 s |
| **ETH** | *(no existía)* | `~lastEthTime` dentro de 30 s — el feed que la luz OSC decía representar, y nunca vigiló |
| **MIDI** | hay un dispositivo enumerado — sigue encendida con el cable muerto | `~lastMidiTime` dentro de 5 s, cualquier CC |
| **BRIDGE RX** | `~lastBrowserOscTime` dentro de 5 s | sin cambios — la única que estuvo viva desde siempre |

**La rejilla de perillas es de siete de ancho.** Cuatro filas de rendimiento de 5/5/5/6 pasaron a tres de siete —la fila de la Cámara ya había probado que siete caben (7 × celdas de 132 px + huecos + márgenes = 992 px dentro de 1100)— y `phenoRate` se unió a la fila de la Cámara para hacerla también de siete. Siete filas pasaron a seis.

**`bancada` es una fila de botones, no una perilla.** Es la última especificación escalonada que seguía siendo un Knob, y un Knob no puede servir aquí: `~makeKnob` reconstruye el `ControlSpec` a partir de `(min, max, warp)` y **descarta el paso**, `~setParam` recuantiza contra la especificación real y escribe el valor redondeado de vuelta en el widget, y un Knob en modo `\vert` arrastra *relativo a su valor actual*. Así que la reescritura reiniciaba el acumulador en cada evento de ratón, y cruzar a la posición 1 requería 0.125 normalizado en un solo evento — unos 16 px entre dos movimientos consecutivos de Qt. La perilla no estaba enviando nada; estaba enviando 0, repetidamente. El CC MIDI 16 y los cinco botones del navegador siempre estuvieron bien. Ahora son cinco botones de radio, reconciliados desde el bus a 2 Hz para que cualquier fuente los reencienda.

**La fila 5, la Cámara Fenológica, va tintada en ámbar.** Es la única bancada cuyos controles cambian *quién habla* en lugar de cómo suena el motor. El tinte marca la fila; no reinstaura el hábito de tono-como-estado que la reescritura eliminó.
