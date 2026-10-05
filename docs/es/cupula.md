← [README](../../README.md) · [English](../en/dome.md)

# Cúpula (fulldome / planetario)

Cómo preparar y presentar BiocracyEngine en un domo de planetario. Escrito para el domo de Bogotá: sistema **Digistar 7**, dos proyectores **Christie Griffyn 4K32-RGB**, un domo de más de 23 m de diámetro y entrada **NDI**.

Un domo recibe un **domemaster**: una imagen cuadrada en ojo de pez, con el cenit en el centro, el horizonte en el borde del círculo y el frente abajo. Digistar la deforma y la reparte entre sus proyectores. Nosotros solo entregamos el domemaster.

## El plan: híbrido

| Mitad | Resolución | Cómo | Estado |
|---|---|---|---|
| **Pre-renderizada** | 4096 × 4096 | Sesiones grabadas, renderizadas fuera de tiempo real; Digistar reproduce los archivos | ✅ lista |
| **En vivo** | 2048 × 2048 | El instrumento corriendo, enviado a Digistar por NDI a 30 fps | ✅ lista |
| **Sonido** | 4 canales | La MOTU va a la consola de la sala: L R Ls Rs | ✅ listo |

La mitad 4K se renderiza fuera de tiempo real para no exigirle al M5 4K en vivo.

## 1. La vista de cúpula (tecla D)

En `parliament.html`, la **D** abre **CÚPULA** sobre la página. Las ranuras siguen corriendo debajo, y 0–9 / P F B E R A C O T siguen cambiando de ranura.

| Control | Qué hace |
|---|---|
| Domemaster / Simulación | el ojo de pez plano, o el domo visto desde las butacas (arrastrar para mirar, rueda para el campo visual) |
| 2048 / 4096 | tamaño del domemaster |
| frente | a qué altura sobre el horizonte cae el "adelante" de la ranura (butacas reclinadas: ~30°) |
| inmersión | mete la cámara de la cúpula en la escena. En 0 el mundo es una mancha al frente; desde 80% rodea al público |
| apertura | 180° = hemisferio |
| inclinación | inclinación del domo, solo en la simulación |
| texto · letra · altura texto | el título de la ranura dibujado en la cúpula (tamaño y altura en grados) |
| guías | anillos de elevación cada 15° y una marca al frente |
| salida: sin salida / ndi / syphon | adónde va el domemaster además de la pantalla. **ndi** solo funciona en la ventana en vivo (sección 4). La salida sigue con la vista cerrada |
| negro | envía negro a la salida sin apagarla |
| salida limpia | el domemaster solo, a pantalla completa (Esc para volver). Sirve solo para captura de pantalla, no es la entrega 4K |

Cada ranura llega a la cúpula por una de dos vías:
- **Ranuras three.js:** se renderizan con una cámara ojo de pez. La barra dice *escena 3D*.
- **Ranuras 2D y WebGL directo** (1, 3, R, C): aparecen como un panel plano al frente. La barra dice *panel 2D*.

Los ajustes de la cúpula son parte de la función: se guardan en la sesión (abajo).

## 2. Grabar una sesión

No hay nada extra que hacer. **Graba en SC como siempre** (REC en la GUI de SC). Cuando arranca la grabadora, el bridge escribe un log de sesión junto al WAV:

```
recordings/eth_sonification_20261004_200000.wav             ← SC, 4 canales
recordings/eth_sonification_20261004_200000.session.jsonl   ← el bridge
```

El log guarda todo lo que los visuales reciben de SC, las teclas pulsadas en la página, la ranura en escena al empezar y cada cambio en los ajustes de la cúpula. Se cierra cuando para la grabación.

- El log de sesión solo se escribe mientras SC graba.
- La interacción con el ratón dentro de una ranura (arrastrar la órbita) **no** se graba. Encuadra cada ranura con teclas y ajustes de la cúpula, no con el ratón.
- Los logs y los renders no se versionan en git (son datos, y pesan).

## 3. Renderizar a 4K

La página tiene que estar servida. SC y el bridge **no** necesitan estar corriendo.

```bash
cd nw_wrld_local
npm run serve                      # en una terminal: http://localhost:9001
npm run dome:render -- --session ../recordings/<nombre>.session.jsonl
```

Sale en `renders/<nombre>_4096/`: `frame_00000.png …` y `audio.wav`. El audio es el mismo tramo de la grabación, 4 canales, en sincronía con el cuadro 0.

| Opción | Por defecto | |
|---|---|---|
| `--size 4096\|2048` | 4096 | tamaño del domemaster |
| `--fps <n>` | 30 | |
| `--from <s> --to <s>` | toda la sesión | tramo a renderizar, en segundos desde el inicio de la grabación |
| `--format png\|prores` | png | secuencia PNG, o un solo `.mov` ProRes 4444 |
| `--out <dir>` | `renders/<nombre>_<size>` | |
| `--warmup <s>` | 3 | tiempo que corre la página antes del cero, para que las ranuras monten |
| `--window <AxA>` | 1920x1080 | tamaño de la página, que fija la resolución de las ranuras en panel 2D |
| `--audio-offset <ms>` | 0 | mover el audio respecto a la imagen |

**Tiempo en el M5:** unos **3 fps a 4096** (≈10× el tiempo real: una pieza de 20 minutos tarda unas 3 h 20 min, sin supervisión), y unos 10 fps a 2048. La codificación no es el cuello de botella; PNG y ProRes van a la misma velocidad.

**Vista previa rápida** antes de un render largo:

```bash
npm run dome:render -- --session ../recordings/<nombre>.session.jsonl --size 2048 --to 30
```

Cómo funciona: la página corre con un reloj virtual (`src/projector/dome/renderMode.ts`) y el log se le entrega en sus tiempos. Así cada cuadro cae exactamente donde le corresponde frente al WAV, por lento que se renderice. `--from` reproduce todo lo anterior sin renderizarlo, para que la página llegue a ese punto en el estado en que la dejó la función.

## 4. En vivo por NDI

La página corre en su propia ventana (Electron), cuyo emisor publica la fuente NDI **BiocracyEngine Cúpula**. Solo esa ventana puede enviar NDI; un navegador no.

```bash
DOME_LIVE=1 DOME_AUDIO=1 ./start_ecosystem.sh    # todo, con la ventana en vivo en vez del navegador
# o, con la página ya servida:
cd nw_wrld_local && npm run dome:live
```

En la ventana:
1. **D** abre CÚPULA. Elige **2048** y **salida: ndi**.
2. **D** otra vez cierra la vista. El domo sigue recibiendo, y una etiqueta abajo a la derecha muestra `CÚPULA · ndi 30 fps · 1 receptor`.
3. **negro** envía negro sin detener la salida. **sin salida** la detiene.

Seguridad: si la página deja de enviar (salida apagada, página congelada), los receptores reciben **negro en menos de 1 s** y lo siguen recibiendo, así que el domo queda oscuro en vez de congelado en la última imagen. Si la ventana se cae, se recarga, y una salida NDI que estaba encendida vuelve sola.

Medido en el M5 con un receptor NDI aparte: **2048 × 2048 a 30 fps**, llega en UYVY sin alfa, con la imagen al derecho (el frente abajo).

- La primera vez, `npm install` en `nw_wrld_local` descarga el SDK de NDI 6 y compila el emisor (`@stagetimerio/grandiose`, dependencia opcional). Necesita las Command Line Tools de Xcode.
- Usa red cableada gigabit hacia Digistar. Una señal NDI de 2048 ocupa unos cientos de Mbit/s.
- Para revisar la señal antes de llegar a la sala: *NDI Studio Monitor* (NDI Tools, gratis) en cualquier equipo de la misma red debería mostrar **BiocracyEngine Cúpula**.
- Deja la señal en vivo en 2048. El 4096 es para los clips pre-renderizados.

## 5. Sonido para la consola de la sala

Lleva la **MOTU** y arranca con:

```bash
DOME_AUDIO=1 ./start_ecosystem.sh
```

| Salida MOTU | Canal |
|---|---|
| analógica 3 | L (frontal izquierdo) |
| analógica 4 | R (frontal derecho) |
| analógica 5 | Ls (trasero izquierdo) |
| analógica 6 | Rs (trasero derecho) |

El motor ya mueve todo alrededor de cuatro parlantes. Una línea estéreo doblaría la mitad trasera sobre izquierda/derecha, y la sala solo podría simular el envolvente a partir de ella.

El log de arranque de SC confirma el modo: `MOTU router active (DOME): … L R Ls Rs`.

**Respaldo, si la consola solo recibe estéreo:** arranca **sin** `DOME_AUDIO=1`. Las analógicas 3-4 llevan entonces la mezcla estéreo del estudio (frente + traseros doblados).

El `audio.wav` de los clips pre-renderizados es de 4 canales en el orden del anillo del motor: FL, FR, RR, RL. Avísale a la sala, o reordénalo a L R Ls Rs al preparar los archivos.

## 6. Lista de entrega

Preguntar a la sala:
1. ¿Qué formato de archivo quieren: secuencia PNG/TIFF, ProRes, HAP? ¿A cuántos fps?
2. Entrada NDI en vivo: ¿qué resolución y fps? ¿La red es cableada, gigabit?
3. ¿El domo es **plano o inclinado**? ¿Dónde queda el "frente" para las butacas? (Ajustar *frente* e *inclinación* según eso.)
4. Entradas de audio en la consola: ¿hay 4 entradas de línea? ¿Analógicas, Dante, MADI?
5. ¿Cuánto tiempo de ensayo técnico hay en el domo?

Llevar: el M5, la MOTU y sus cables (4 × línea balanceada), los renders en un disco rápido y su audio.

## Notas de diseño para un domo de 23 m

- **Evitar fondos blancos o muy claros.** La luz rebota por todo el domo y lava el contraste. La ranura **B (Tránsito)** es blanca y necesita una versión oscura para la cúpula. Las ranuras oscuras (F DarkForest, los anillos) le van bien.
- **Movimiento de cámara lento.** Los movimientos rápidos sobre todo el campo visual marean.
- **El texto** se lee mejor bajo, en la franja del frente, y grande (2–4°). Cerca del cenit se curva.
- **El láser (ranura P)** es para el bosque, no para el domo.

## Pendiente

- **NDI en vivo en el propio Digistar:** probado aquí contra un receptor NDI en el mismo Mac, todavía no contra Digistar. Confirmar con la sala resolución, fps y red (lista de entrega, pregunta 2).
- **El bloom/brillo** de las ranuras que lo usan todavía no pasa a la cúpula.

## Archivos

| Archivo | Papel |
|---|---|
| `src/projector/dome/dome.ts` | la vista CÚPULA (tecla D) y sus enganches para el render |
| `src/projector/dome/domemaster.ts` | cámara cúbica → ojo de pez → domemaster |
| `src/projector/dome/domeCapture.ts` | encuentra la escena y el canvas de cada ranura sin tocar las ranuras |
| `src/projector/dome/session.ts` | teclas, ranura y ajustes de la cúpula → el log de sesión |
| `src/projector/dome/renderMode.ts` | el reloj virtual y la reproducción, bajo `?render=1` |
| `nw_wrld_local/dome-live.js` | la ventana en vivo (Electron) |
| `nw_wrld_local/dome-live-preload.js` | el emisor NDI y su negro de seguridad |
| `nw_wrld_local/dome-render.js` | el renderizador fuera de tiempo real (Electron + ffmpeg) |
| `nw_wrld_local/parliament-bridge.js` | escribe el `.session.jsonl` mientras SC graba |
| `11_recording_system.scd` | envía `/rec/started` y `/rec/stopped` |
| `1_server_config.scd`, `3_synthdefs.scd` | `DOME_AUDIO` y el router `\motuRouterDome` |
