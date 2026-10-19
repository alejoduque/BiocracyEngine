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
- Si otra superficie (la GUI, el navegador, la rutina) mueve el valor, el control vuelve a esperar.

Los encoders en **Clip, FX3, FX4, FX5** y **Main A** son relativos: suman o restan desde donde esté el valor, y nunca saltan.

## Faders y crossfader · MATRIX MIXER

| Control | CC (canal 12/15) | Parámetro | GUI |
|---|---|---|---|
| Fader 1 · grupo 1–6 | 0 | `mixDrone` | DRONE |
| Fader 2 | 1 | `mixPad` | PAD |
| Fader 3 | 2 | `mixKick` | KICK |
| Fader 4 | 3 | `mixPerc` | PERC |
| Fader 5 | 4 | `mixDust` | DUST |
| Fader 6 | 5 | `mixSample` | SAMPLE |
| Fader 1 · grupo 7–12 | 6 | `mixCorpus` | CORPUS |
| Fader 2 | 7 | `mixUltra` | ULTRA |
| Fader 3 | 8 | `mixGolpe` | GOLPE |
| Fader 4 | 9 | `mixMotor` | MOTOR (maestro de los cinco motores) |
| Fader 5 | 10 | `masterAmp` | SYNTH TRIM |
| Fader 6 | 11 | `masterVolume` | MASTER VOL |
| Crossfader | 18 | `mixCarve` | MEZCLA: barro (izquierda) ↔ limpia (derecha) |

## Encoders

Los cuatro encoders (A B C D) cambian de función con las teclas **Pot-ctrl**.

| Grupo (Pot-ctrl) | Canal · CC | Tipo | A | B | C | D | Fila de la GUI |
|---|---|---|---|---|---|---|---|
| **Main** | 12 · A 41, C 40, D 17 | A rel · C, D abs | `mixMasa` | — (selección de pista) | `beatTempo` | `transactionInfluence` | MASA · RITMO · CADENA |
| **Send** | 10 · 40+, 60+, 80+, 100+ | abs | `droneDepth` | `droneFade` | `droneSpace` | `droneMix` | DRONE·PAD |
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
| Pan · Y | 10 · 0–11, 16 | `seasonalBias` (abajo: seca · arriba: lluvias) |
| FX1 · X / Y | 12 · 38 / 36 | `spatialSpread` / `seasonalBias` |
| FX2 · X / Y | 12 · 39 / 37 | libres |

## Teclas

Las seis teclas cambian de función según el keymode del LC2.

| Keymode | Notas | Teclas 1–6 |
|---|---|---|
| **Scene-launch** | canal 12 · 8–13 | Ritmos de GOLPE: MAQSUM · BALADI · SAIDI · MALFUF · AYOUB · CLR |
| **FX-ctrl** | canal 12 · 43–48 | Encender/apagar: arco CORTO · MEDIO · LARGO · PULSE · BOWL · CHINA |
| **Mute-group** 1–6 | canal 10 · 2, 10, 18, 26, 34, 42 | MUTE de DRONE · PAD · KICK · PERC · DUST · SAMPLE (como el botón de cada canal) |
| **Mute-group** 7–12 | canal 10 · 50, 58, 66, 74, 82, 90 | MUTE de CORPUS · ULTRA · GOLPE · MOTOR · (11) CRUDO encender/apagar · (12) libre |

Las notas que no están en la tabla aparecen en el log como `LC2 · nota … sin asignar`, y los CC como `LC2 · CC … sin asignar`. Así se puede averiguar qué manda cualquier control.

## Lo que no pasa por el LC2

Sin control en el LC2, pero siguen en la GUI y en la tabla general (CC para otros controladores):

- `mixSeq`;
- la sala (`chamberMix`, `chamberSize`);
- las cadencias (`kickEvery`, `percRate`, `padEvery`…);
- los VIZ (`vizRotation`, `vizConsensus`, `camaraOpacity`);
- `bancada`, `opacityFloor`, `phenoRate`.

`vizConsensus` queda fuera a propósito: lo mueve el voto de la performance.

## Tabla general (otros controladores, cualquier canal salvo 10–15)

Sigue igual: cada parámetro con `cc:` en `0_parameters.scd`. Al arrancar, `2_midi_control.scd` imprime la lista completa en `sclang_log.txt` (`CONTROL MAPPING (CC -> parameter)`).
