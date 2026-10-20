# Faderfox LC2 (micromodul) · mapa MIDI

Cómo el **Faderfox micromodul LC2** controla el BiocracyEngine, en el orden de la GUI de SuperCollider.
El código está en `2_midi_control.scd` (bloque «Faderfox LC2»).

## Conexión

- El LC2 **no tiene USB**: sale por **MIDI DIN** (5 pines) y funciona con 3 pilas AA o con un adaptador de 4,5–6 V.
- Para llegar al Mac necesita una **interfaz MIDI**: la entrada MIDI de la MOTU o un cable USB-MIDI. Conecta el MIDI OUT del LC2 al MIDI IN de la interfaz.
- Con la interfaz USB-MIDI **E-MU XMidi1X1 Tab**, el conector de entrada del cable va al MIDI OUT del LC2.
- SuperCollider escucha **todas** las entradas MIDI. Cada 2 s vuelve a mirar si hay entradas nuevas, así que la interfaz se puede conectar con el motor ya andando. Al conectarla aparece en `sclang_log.txt` la línea `MIDI · entrada conectada: E-MU XMidi1X1 Tab · In`.
- Si el LC2 está bien conectado, al mover un fader aparece en `sclang_log.txt` la línea `LC2 · fader 1 → mixDrone: …`, y la luz MIDI de la GUI se enciende.
- Hay que encender el LC2. Se apaga solo tras 10 minutos sin movimiento.

### Probar sin arrancar el motor

`./start_ecosystem.sh midi` lista las entradas MIDI y escribe cada mensaje que llega durante 60 s (`MIDI_SEGUNDOS=120` para más). Cada línea dice el CC o la nota, el canal y qué parte del LC2 es:

```
  CC    0 · canal 12 · valor  87 · LC2 setup 1 · faders/Main/FX
```

Si ahí no aparece nada al mover un fader, el problema está antes del mapa: el LC2 apagado, el cable en el conector equivocado o la interfaz sin conectar.

## Por qué un mapa propio

El LC2 **no se programa**: manda números de CC y de nota **fijos**, y los repite en tres canales:

| Setup (system mode) | Canales |
|---|---|
| Setup 1 (tecla azul izquierda) | 10 · 11 · 12 |
| Setup 2 (tecla azul derecha) | 13 · 14 · 15 |

La tabla general del registro (`cc:` en `0_parameters.scd`) mapea **solo por número de CC**. Con el LC2 eso no sirve:

- los faders 1–6 mandan CC 0–5, que en la tabla son `masterVolume`, `pitchShift`…;
- los encoders en Send mandan CC 40–51, que en la tabla son los faders de mezcla.

Por eso el LC2 se mapea **por canal y CC**. Lo que llega por los canales 10–15 va al perfil del LC2; cualquier otro controlador sigue usando la tabla general. `~lc2Activo = false` apaga el perfil.

Los números vienen del manual: [LC2 User manual V01](http://www.faderfox.de/PDF/LC2_User_manual_V01.PDF), capítulo «Controller numbers».

## Soft takeover

Los controles **absolutos** del LC2 (faders, crossfader, encoders en Send, EQ y Main C/D, y el joystick) no mueven un valor hasta **alcanzarlo o cruzarlo**.

- Cambiar de grupo de faders (1–6 ↔ 7–12), cargar una configuración o que la rutina funda el motor no producen saltos.
- Mientras un control espera, el log dice dónde está y dónde está el valor: `LC2 · fader 3 espera: está en 0.20, mixKick está en 0.55 — llévalo hasta ahí`.
- La mano manda. Mientras mueves un control, el valor lo sigue, aunque otra superficie lo haya movido.
- Si otra superficie (la GUI, el navegador, la rutina) mueve el valor con el control quieto más de 1 s, el control vuelve a esperar.
- Si un fundido de la rutina está llevando ese valor, lo suelta en cuanto lo tocas (LC2 o GUI). El fundido siguiente lo toma desde donde lo dejaste.

**Temblor.** Un LC2 con faders gastados o pilas bajas manda valores sin que nadie lo toque: un fader quieto oscila ±1 o se arrastra con el vecino que se mueve. Por eso los controles absolutos ignoran un paso de 1 que vuelve sobre sí mismo o que llega estando quietos: desde quieto hacen falta 2 pasos, y en movimiento cuenta cada paso. APRENDE solo toma un control que se movió de verdad (3 pasos, o dos pasos iguales de un encoder relativo). `./start_ecosystem.sh midi` termina con un resumen por control: si aparece uno que no tocaste, es temblor.

Los encoders en **Clip, FX3, FX4, FX5** y **Main A** son relativos: suman o restan desde donde esté el valor, y nunca saltan.

## APRENDE · asignar el LC2 desde la GUI

Las tablas de abajo son el **mapa de base** (el «mapa de fábrica» del código), armado con APRENDE el 20·10·2026 con el LC2 delante. Cualquier control se puede reasignar desde la GUI de SuperCollider, sin tocar código:

1. **Clic en la luz MIDI** de la fila de luces. Dice **APRENDE** en ámbar.
   - Cada perilla, fader y botón muestra qué control del LC2 le llega: `SEND A`, `FADER 3`, `FX4 A +1` (dos controles).
   - Los que no tienen ninguno se ven en gris con `—`.
   - Mientras APRENDE está encendido, ni el LC2 ni la GUI cambian valores.
2. **Toca un control de la GUI y mueve un control del LC2**, en cualquier orden.
   - El control de la GUI queda en blanco mientras espera. La cabecera dice el paso siguiente, y luego `FADER 1 → DRONE SUB`.
   - Puedes asignar varios seguidos.
3. **Otro clic en la luz MIDI** sale de APRENDE. El mapa completo queda en `sclang_log.txt` (`LC2 · el mapa`).

Reglas:

- **Qué va con qué:** los CC (faders, encoders, joystick, crossfader) van a perillas, faders y botones. Las teclas van a botones (BOWL, CHINA, arcos de marea, CRUDO) y a los **MUTE** del mezclador.
- **Un control a la vez:** asignar un control del LC2 le quita su función anterior. El destino conserva los demás controles que ya tenía.
- **Quitar:** con APRENDE encendido, **clic derecho** (u opción+clic) en un control de la GUI le quita todos sus controles del LC2, también los de fábrica.
- **Pistas:** Send y EQ mandan un CC distinto según la pista elegida. Al asignar uno se asigna en todas las pistas.
- **Absoluto o relativo:**
  - Para los controles del manual, lo decide el manual.
  - Para un control desconocido, lo decide lo que manda mientras lo giras. Un encoder relativo repite 1 o 127.
- **Volver a fábrica:** **mayús+clic en la luz MIDI**. Lo aprendido se guarda antes en `presets/lc2_aprendido.anterior.scd`.

Lo aprendido se guarda en **`presets/lc2_aprendido.scd`** y se carga al arrancar, encima del mapa de fábrica. El archivo se puede leer y editar a mano: `[tipo, rol, CC o nota, destino]`.

## Faders y crossfader · MATRIX MIXER

| Control | CC (canal 12/15) | Parámetro | GUI |
|---|---|---|---|
| Fader 1 · grupo 1–6 | 0 | `mixDrone` | DRONE |
| Fader 2 | 1 | `mixPad` | PAD |
| Fader 3 | 2 | `mixKick` | KICK |
| Fader 4 | 3 | `mixPerc` | PERC |
| Fader 5 | 4 | `mixSample` | SAMPLE |
| Fader 6 | 5 | `mixCorpus` | CORPUS |
| Fader 1 · grupo 7–12 | 6 | `mixCorpus` | CORPUS |
| Fader 2 | 7 | `mixUltra` | ULTRA |
| Fader 3 | 8 | `mixGolpe` | GOLPE |
| Fader 4 | 9 | `mixMotor` | MOTOR (maestro de los cinco motores) |
| Fader 5 | 10 | `masterAmp` | SYNTH TRIM |
| Fader 6 | 11 | `masterVolume` | MASTER VOL |
| Crossfader | 18 | escenas A·B | de la config A (izquierda) a la B (derecha); ver abajo |

## Crossfader · escenas A·B (como en el Octatrack)

El crossfader va de una **config A** a una **config B**. Por defecto, A es `01_Lawrence_English` y B es `GOLPE_5_Barro` (GOLPE 1 maqsum con la MEZCLA en barro).

- **Qué viaja:** cada valor que A y B tienen distinto viaja en su escala, como en los fundidos de la rutina. Con estas dos son 52 valores.
- **Qué queda libre:** los valores que A y B tienen iguales no se tocan, así que siguen en manos de las perillas.
- **Qué cambia en el medio:** los valores con paso (BANCADA, CRUDO, marea) y lo que no es un parámetro (el ritmo y el kit de GOLPE, los paneos, las muestras). Cambian a mitad del recorrido hacia A o hacia B.
- **Lo que una config no nombra** vale su valor por defecto. Por eso una config de añadido (MEZCLA_*, EXT*) como escena deja el resto en el valor por defecto.
- **Nunca viajan:** el volumen de la sala (`masterVolume`), el consenso, el giro de la imagen, la opacidad ni el láser.
- **Sin saltos:** al tocar el crossfader (tras 1 s quieto) nada cambia. Lo que suena es el punto de partida: hacia la derecha los valores van hacia B, hacia la izquierda hacia A, y en el extremo llegan exactos a la config. Así los niveles que bajaste a mano no vuelven de golpe a los de la config.
- **Rampas suaves:** los valores no saltan con el fader, se deslizan (medio segundo para recorrer casi dos tercios del camino). Un tirón rápido del fader se oye como una rampa.
- **Niveles en el medio:** en los niveles de capa (mix*, SYNTH TRIM), la capa que sube entra tarde y la que baja sale pronto, para que a mitad de camino no suenen las dos llenas.
- **La mano:** si mueves una perilla mientras el crossfader la está llevando, la perilla manda hasta el próximo movimiento del crossfader.
- **La rutina:** si un fundido de la rutina está llevando un valor, lo suelta en cuanto mueves el crossfader.

**Elegir A y B:** en la GUI de SC, elige una config en el menú CONFIG y haz clic en el botón **A** o **B** que está al lado. Los botones dicen qué config tiene cada lado y se encienden en ámbar hacia el lado al que se inclina el crossfader. La elección queda en `presets/escenas_ab.scd`.

**Otro control para las escenas:** con APRENDE, toca el botón A o B (el destino es «ESCENA A·B») y mueve el control del LC2 que quieras.

## Encoders

Los cuatro encoders (A B C D) cambian de función con las teclas **Pot-ctrl**.

| Grupo (Pot-ctrl) | Canal · CC | Tipo | A | B | C | D | Fila de la GUI |
|---|---|---|---|---|---|---|---|
| **Main** | 12 · A 41, C 40, D 17 | A rel · C, D abs | `masterVolume` | — (selección de pista) | `beatTempo` | `transactionInfluence` | MASTER VOL · RITMO · CADENA |
| **Send** | 10 · 40+, 60+, 80+, 100+ | abs | `masterVolume` | `mixSample` | `mixCorpus` | `droneMix` | MASTER VOL · SAMPLE · CORPUS · DRONE LAYER |
| **EQ** | 11 · 40+, 60+, 80+, 100+ | abs | `activityThreshold` | `windowWidth` | `absenceWeight` | `pulseGain` | CÁMARA |
| **Clip** | 12 · 20–23 | rel | `spectralShift` | `filterCutoff` | `noiseLevel` | `noiseFilt` | SALIDA·FILTRO |
| **FX3** | 12 · 24–27 | rel | `timeDilation` | `delayFeedback` | `memoryFeed` | `atmosphereMix` | ESPACIO |
| **FX4** | 12 · 28–31 | rel | `pitchShift` | `harmonicRich` | `resonantBody` | `textureDepth` | TIMBRE |
| **FX5** | 12 · 32–35 | rel | `mixRemuestreo` | `mixEspectro` | `mixCaos` | `mixRuptura` | MOTORES (REMU · ESPEC · CAOS · RUPT) |

En Send y EQ el LC2 suma al CC el número de la pista elegida (40–51, más 56 para la pista master). El perfil acepta todas: el encoder hace lo mismo con cualquier pista seleccionada.

## Joystick

| Modo | Canal · CC | Parámetro |
|---|---|---|
| Pan · X | 10 · 20–31, 36 | `spatialSpread` (espacio: izquierda ↔ derecha) |
| Pan · Y | 10 · 0–11, 16 | `chamberMix` (la sala: abajo seca · arriba mojada) |
| FX1 · X / Y | 12 · 38 / 36 | `spatialSpread` / `chamberMix` |
| FX2 · X / Y | 12 · 39 / 37 | libres |

## Teclas

Las seis teclas cambian de función según el keymode del LC2.

| Keymode | Notas | Teclas 1–6 |
|---|---|---|
| **Scene-launch** | canal 12 · 8–13 | Ritmos de GOLPE: MAQSUM · BALADI · SAIDI · MALFUF · AYOUB · CLR |
| **FX-ctrl** | canal 12 · 43–48 | Encender/apagar: arco CORTO · MEDIO · LARGO · PULSE · BOWL · CHINA |
| **Mute-group** 1–6 | canal 10 · 2, 10, 18, 26, 34, 42 | MUTE de DRONE · PAD · KICK · PERC · DUST · SAMPLE (como el botón de cada canal) |
| **Mute-group** 7–12 | canal 10 · 50, 58, 66, 74, 82, 90 | MUTE de CORPUS · ULTRA · GOLPE · MOTOR · (11) CRUDO encender/apagar · (12) libre |
| **Track-ctrl** · tecla 1 **Launch** | canal 10 · 0, 8, 16 … 88 (una por pista) · canal 12 · 0 (master) | **DÍA**: salta al siguiente día grabado del corpus |
| **Track-ctrl** · tecla 2 **Stop** | canal 10 · 1, 9, 17 … 89 · canal 12 · 1 (master) | **GOLPE a 0** (su MUTE; otro Stop lo devuelve a su nivel) |

Launch y Stop funcionan con cualquier pista elegida. Mandan las mismas notas que el pulsador de los encoders A y B en Main, así que esos pulsadores hacen lo mismo. Las teclas 3–6 de Track-ctrl (Mute, Solo, Mon, Rec) quedan como están: Mute coincide con las notas de Mute-group, y las demás están libres para APRENDE.

Las notas que no están en la tabla aparecen en el log como `LC2 · nota … sin asignar`, y los CC como `LC2 · CC … sin asignar`. Así se puede averiguar qué manda cualquier control.

## Lo que no pasa por el LC2

Sin control en el LC2 de base (se les puede dar uno con APRENDE), pero siguen en la GUI y en la tabla general (CC para otros controladores):

- `mixDust`, `mixMasa`, `droneDepth`, `droneFade`, `droneSpace`, `seasonalBias`;
- `mixCarve` (MEZCLA): solo lo mueven las escenas A·B del crossfader;

- `mixSeq`;
- `chamberSize`;
- las cadencias (`kickEvery`, `percRate`, `padEvery`…);
- los VIZ (`vizRotation`, `vizConsensus`, `camaraOpacity`);
- `bancada`, `opacityFloor`, `phenoRate`.

`vizConsensus` queda fuera a propósito: lo mueve el voto de la performance.

## Tabla general (otros controladores, cualquier canal salvo 10–15)

Sigue igual: cada parámetro con `cc:` en `0_parameters.scd`. Al arrancar, `2_midi_control.scd` imprime la lista completa en `sclang_log.txt` (`CONTROL MAPPING (CC -> parameter)`).
