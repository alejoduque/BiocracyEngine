← [README](../../README.md) · [English](../en/laser.md)

# Proyección láser (ILDA / DAC Helios)

Proyecta la geometría **vectorial** del motor sobre un bosque real. Los láseres dibujan trazos brillantes y escasos (no imágenes rasterizadas), así que el navegador envía una escena pequeña apta para láser — no el framebuffer 3-D.

```
laserTap del navegador ──WS:3337──► laser-bridge.js ──USB──► DAC Helios ──► láser
                                          └──────────────► frames.ild (ILDA fmt 5)
```

**Activar:** `LASER=1 ./start_ecosystem.sh` (apagado por defecto). Sin DAC y sin binding nativo corre en **SECO** (sólo logs) — seguro de arrancar en cualquier parte.

**Contrato de cuadro** (navegador → puente): normalizado, centro `(0,0)`, `x,y ∈ −1..1`.

```json
{ "type":"laserFrame", "pps":30000,
  "points":[ {"x":-0.8,"y":0.0,"r":0,"g":200,"b":90,"blank":false}, … ] }
```

**Origen del cuadro** (`src/projector/laserTap.ts`, iniciado por `parliamentEntry.init`):

1. `window.__laserFrame` — cualquier módulo puede publicar su propia escena vectorial.
2. **por defecto, el slot P** — el **anillo del año** fenológico + un marcador en las especies activas de hoy (`window.__activeSpecies`). Una especie **sensible** *no* se dibuja: la cláusula de opacidad (Glissant) extendida al espacio físico — el ser vulnerable nunca se proyecta sobre el bosque real.

## Qué se proyecta: el gráfico de púlsar

Crestas apiladas — la imagen de *Unknown Pleasures* / B1919+21. Observaciones sucesivas del mismo objeto dibujadas una sobre otra, de modo que un patrón invisible en una sola pasada emerge de la pila. `pulsarPlot.ts` publica `window.__laserFrame`, que `laserTap.ts` ya prefiere sobre su anillo del año por defecto.

**Cuatro fuentes**, marcables de forma independiente desde la GUI de SC (`/laser/src/*`, respaldadas por el registro para que los presets las lleven). Cada una dibuja en su propio tono para que una pila mixta siga siendo legible. **Sin ninguna marcada vuelve el anillo del año** — así es como el anillo sigue siendo alcanzable sin un control propio.

| Marca | OSC | Una fila es | Tono |
|---|---|---|---|
| `MIX` | `/laser/src/mix` | una instantánea del espectro de todo lo que suena | verde |
| `CORPUS` | `/laser/src/corpus` | lo mismo, sólo sobre el bus del corpus — la voz propia del bosque | ámbar |
| `DÍA` | `/laser/src/ring` | el espectro del corpus medido mientras suena un día `/pheno/clip` | azul |
| `CHAIN` | `/laser/src/chain` | las transacciones de un bloque; x es orden de llegada, altura es la puja | rojo |

El Artículo 47 se lleva consigo, no se vuelve a litigar: un clip opaco nunca se anuncia, y una especie **sensible** no aporta fila alguna — la misma negativa que `laserTap.ts` ya hace para el anillo.

### Por qué seis filas, y por qué serpentina

Los límites del galvo hacen de esto un problema de **longitud de trayecto**. Cada punto se escanea `FRAME_HZ` veces por segundo, así que un cuadro recibe una cantidad fija de tinta:

```
tinta por cuadro = OMEGA_MAX / FRAME_HZ / grados_por_unidad
                 = 10000 / 30 / 22.5  =  14.8 unidades normalizadas
```

Una fila de ancho completo cuesta ~1.5 unidades antes de ondularse. **Las 80 filas del álbum necesitarían ~420 unidades.** Seis es el techo, así que la profundidad de la pila vive en el *tiempo*: el gráfico se desplaza, y el patrón emerge para quien mira en vez de echar un vistazo.

Dos cosas son estructurales antes que estilísticas:

- **Escaneo serpentina.** Dibujar cada fila de izquierda a derecha implica retrazar el ancho completo entre ellas, y el espejo recorre eso esté el haz encendido o no. Medido: 19.36 unidades, **131 % del presupuesto → cuadro entero en blanco**. Alternar la dirección hace que el único movimiento entre filas sea el paso de fila. Serpentina: 12.03 unidades, 81 %.
- **Muestreo por longitud de arco.** Espaciar los puntos de forma pareja en *x* y dimensionar ese espaciado al límite de paso no deja nada para la componente vertical, así que cada segmento inclinado excede el límite y acaba interpolado. Medido: un cuadro de 516 puntos se volvía **1041**, y una trayectoria que usaba sólo el 77 % del presupuesto de tinta alcanzaba el **128 %** del presupuesto de puntos y se apagaba.

El generador se **autopresupuesta** — descarta la fila más antigua hasta que el cuadro cabe, *antes* de enviarlo. El apagado automático es una red de seguridad, y el contenido que cae en la red es contenido que no se está proyectando. Medido de extremo a extremo: 646 puntos, **81 % del presupuesto de escaneo, 0 excesos de velocidad, nada apagado**.

## Límites del escáner (Unity RAW 1.7 W, DMX + ILDA)

Un proyector láser se acciona **con una forma de onda**: a la tasa de puntos del DAC cada punto es una muestra, X en el canal izquierdo e Y en el derecho. Los límites de abajo vienen de la hoja de datos del equipo, y cada uno es una variable de entorno.

`Scan Speed 30 kpps @ 8°` es un **par tasa–ángulo, no una tasa**. Un escáner que sigue 30 000 puntos/s a lo largo de 8° no puede seguir 30 000 puntos/s a lo largo de 45° — el espejo tiene cinco veces más camino que recorrer por punto. Así que el límite de paso se deriva de un techo de velocidad angular en lugar de elegirse:

```
OMEGA_MAX  = ÁNGULO_NOMINAL × PPS_NOMINAL / TRAVERSE_PTS  =  8° × 30000 / 24  =  10 000 °/s
MAX_STEP   = OMEGA_MAX / pps / (SCAN_ANGLE / 2)           ≈  0.0185 a 24 kpps
```

`TRAVERSE_PTS` es la única cifra que la hoja de datos no publica (el número de puntos del patrón de prueba ILDA) y se fija deliberadamente baja, poniendo el techo en el **fondo** del rango que se le atribuye a un escáner de 30 K.

| Variable | Por defecto | Origen |
|---|---|---|
| `LASER_PPS` | `24000` | derateado al 80 % de la especificación; limitado a `LASER_RATED_PPS` |
| `LASER_RATED_PPS` | `30000` | *Scan Speed 30 kpps @ 8°* |
| `LASER_RATED_ANGLE` | `8` | el ángulo al que se cita esa especificación |
| `LASER_SCAN_ANGLE` | `45` | *Scan Angle 45°*, campo completo |
| `LASER_TRAVERSE_PTS` | `24` | constante de modelado — más bajo = más margen |
| `LASER_POWER_W` | `1.7` | *Power > 1.7 W* |
| `LASER_BEAM_MM` / `LASER_DIVERGE` | `5` / `1.1` | *Beam 5 × 3 mm*, *< 1.1 mrad* |
| `LASER_THROW_M` / `LASER_DWELL_MS` | `10` / `1.0` | distancia de proyección; ventana de permanencia |
| `LASER_MAX_STEP` | *(sin fijar)* | sólo para forzar — sin fijar, se computa arriba |

**La permanencia** es física, no un épsilon adivinado: el haz debe despejar **su propio ancho** a la distancia de proyección dentro de `LASER_DWELL_MS`, o puntos sucesivos están aterrizando en el mismo sitio.

## Apagado automático

La interpolación hace sobrevivible la mayoría de los saltos pero no puede hacer conforme *cada* cuadro — `LASER_MAX_POINTS` y el presupuesto de escaneo son techos duros. Pasados esos, el haz se **apaga** en lugar de proyectarse, dirigido allí donde dirigirlo tenga sentido:

| Fallo | Respuesta |
|---|---|
| **exceso de velocidad** | apagar el punto al que se salta — los espejos siguen recorriendo el hueco, pero a oscuras. *No* repara la sobreorden mecánica, así que el conteo crudo se sigue reportando aparte. |
| **permanencia** | una vez que una tirada estacionaria sin apagar alcanza `LASER_DWELL_MS`, el resto se apaga. El único caso en que apagar elimina el riesgo del todo. |
| **presupuesto > 100 %** | no se puede dirigir — ningún subconjunto se está dibujando a la tasa para la que fue creado. **El cuadro entero se apaga.** |

Se sostiene durante `LASER_BLANK_HOLD_MS` (250 ms) tras el último fallo, para que un cuadro sentado en el umbral no pueda estroboscopiar el haz a la frecuencia de cuadro. Desactivar con `LASER_SAFE_BLANK=0`.

El osciloscopio reporta lo que se **hizo** por separado de lo que se **midió** — una permanencia de 0 porque el haz estaba apagado es un hecho distinto de una permanencia de 0 porque nada dejó nunca de moverse. Verificado:

```
suave    300 pts   679/10000 grados/s   campo 2.7 grados   presup.  56%   dentro de especificación
parado   400 pts     0/10000 grados/s   permanencia 958 us               APAGADO 376 pts parados
denso   1200 pts   presupuesto 225%                                      APAGADO — necesita 54000 pps
```

## Osciloscopio de seguridad del galvo (GUI de SC, columna derecha)

`laser-bridge.js` envía `/laser/scope` a sclang a 12 Hz llevando el cuadro **después** del saneamiento — la señal que el DAC recibe realmente. La GUI de SC lo dibuja en una columna fija de **452 px junto al área de scroll** (ventana de 1570 px), para que siga siendo legible con las manos en las perillas; el osciloscopio en sí es de 440 × 847. Tres carriles etiquetados: **X**, **Y** y **PASO / LÍMITE** — un límite de paso es un límite sobre la *pendiente*, así que la velocidad es lo que el osciloscopio tiene que mostrar, y no es el mismo tipo de magnitud que las dos de arriba. Los buckets diezmados llevan el **peor** paso dentro de ellos, nunca el paso entre los puntos supervivientes.

Dos lámparas, en el mismo lenguaje visual que las luces de feed pero sin su columna de edad (ninguna de las dos es un feed cuyo silencio signifique algo):

| Lámpara | Encendida cuando |
|---|---|
| **DAC** | el puente ha enlazado un Helios real. La corrida en seco *y* la ausencia de puente se leen ambas como apagado — en ninguno de los dos casos llega nada a un láser. |
| **BLANK** | el haz está caído ahora mismo. Sigue la ventana `LASER_BLANK_HOLD_MS` del propio puente, no el cuadro que lo disparó: un apagado de 250 ms reportado en un cuadro a 12 Hz destellaría 80 ms y pasaría desapercibido. |

Ambas se apagan cuando el puente deja de hablar — un BLANK apagado no debe jamás poder leerse como *no está apagando* cuando en realidad no se está proyectando nada en absoluto.

Cuatro estados, todos alcanzables:

| Condición | Se lee |
|---|---|
| Dentro de especificación | `9274 / 10000 grados/s`, presupuesto de escaneo `48 %` |
| Cuadro más ancho que la especificación | `field 31.5 deg (rated 8.0)` → *campo ancho* |
| El haz dejó de moverse | `BEAM PARKED 13.3 ms` |
| Demasiado denso para escanear | `budget 180 %`, residual `OVER-SPEED ×460` |
| Puente ausente | `no bridge` — nunca "conforme" |

> **No es un sistema de seguridad.** Este es un equipo de **Clase 4** (> 1.7 W RGB). A las personas las protegen el enclavamiento, la parada de emergencia, la llave, la máscara de apertura, el Scan Guard propio del equipo, el diseño del trayecto del haz y la operación entrenada. El osciloscopio mantiene al motor dentro de la envolvente *mecánica* publicada del escáner y hace visible la pérdida de movimiento del haz. No vuelve nada seguro para la vista.
