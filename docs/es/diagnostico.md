← [README](../../README.md) · [English](../en/diagnostics.md)

# Arranque y diagnóstico

## Requisitos

Node.js + npm, Python 3, `lsof`, `pkill`, y **SuperCollider**. El lanzador corre en **Linux y macOS**:

* localiza `sclang` en el `PATH` (Linux: `pacman -S supercollider`, `apt install supercollider`) o, en macOS, dentro de `/Applications/SuperCollider.app`;
* `SCLANG=/ruta/a/sclang ./start_ecosystem.sh` fuerza una ruta concreta — builds locales o varias versiones en paralelo;
* abre el navegador con `xdg-open` o `open`, lo que haya; sin ninguno imprime la URL y sigue.

> **En Linux no se pueden enumerar los dispositivos de audio.** `ServerOptions.outDevices` pasa por un primitivo que sólo existe en macOS y Windows; scsynth llega a la tarjeta por JACK/ALSA y no hay nada que enumerar. La detección es por tanto de mejor esfuerzo: sin lista se usa el dispositivo por defecto del sistema en estéreo, y el modo espacial de 4 canales de la MOTU 828x hay que pedirlo explícitamente enrutando por JACK. No es un error — pero no capturarlo sí lo era, porque abortaba `1_server_config.scd` entero y se llevaba por delante los `numBuffers`/`memSize`/`maxNodes` que están justo debajo, que es la memoria en la que carga el corpus.

El scraper de Ethereum necesita su propio venv:

```bash
python3 -m venv eth_listener/venv
source eth_listener/venv/bin/activate
pip install web3 python-osc
```

## Correr el ecosistema

```bash
./start_ecosystem.sh
```

Levanta todos los servicios: nw_wrld, parliament-bridge, SuperCollider y el scraper de Ethereum en Python. `LASER=1` añade el puente láser (ver [Proyección láser](laser.md)).

## Prueba de barrido diagnóstico

```bash
cd nw_wrld_local && node diag-sweep.js
```

Envía los 22 parámetros de las filas 1–4 a través del puente (0 → 1 → 0.5), y después corre un LFO continuo de volumen. No cubre el registro completo de 71 parámetros: es una prueba de que la ruta navegador→puente→SC está viva, no un barrido exhaustivo.

## Monitor del motor en vivo

La herramienta más útil cuando algo "suena mal". SuperCollider publica una línea cada 2 s describiendo qué está recibiendo y haciendo realmente:

```bash
tail -f sclang_log.txt | grep MON
```

```
[MON] flags:B-E---S  bells:47/gate:310/cap:12/bar:88  env(atk/dec/amp):0.81/0.83/0.071
      prio:0.264 ent:0.517 dens:0.312  blk:25670857 txN:290 idx:289 base:0.051  synths:9
```

| Campo | Responde |
|---|---|
| `bells` | pads lanzados, y saltados *por qué compuerta*: `gate` compuerta temporal, `cap` techo de synths, `drop` desborde de cola; `q:` muestra pendientes/total encolados |
| `kick` `perc` `err` | lanzamientos del motor de beat, y cualquier error que el bucle protegido atrapó y del que se recuperó |
| `tg` `amp` | ganancia de transporte (`0.05` = Stop Parliament enganchado) y el nivel maestro de quien toca |
| `outPk` `gr` | nivel de pico llegando al limitador, y con cuánta fuerza está conteniendo |
| `env` | atk/dec/amp del último pad — si dejan de ser idénticos, la envolvente está respondiendo a la transacción |
| `prio` `ent` `dens` | valores vivos derivados de la cadena; una constante aquí significa que un mapeo se saturó |
| `blk` `txN` `idx` `base` | si el payload enriquecido de `eth_sonify.py` está llegando siquiera |

Tres controles OSC, desde cualquier cosa que alcance a SC en el **57120**:

| Dirección | Efecto |
|---|---|
| `/diag/osctrace 1` | `OSCFunc.trace` — publica **todos** los mensajes OSC entrantes; la prueba definitiva de si un control llega a SC |
| `/diag/monitor 0` | silencia la línea `[MON]` |
| `/diag/reset` | pone a cero los contadores de pads para medir una ventana nueva |

## Comprobación de arranque

El banner del registro en `sclang_log.txt` confirma que el motor cargó las fuentes actuales — lo primero que conviene mirar cuando un cambio parece no tener efecto, ya que `start_sonification.scd` lee los dieciséis archivos `.scd` desde disco **en el arranque**:

```
Parameter registry loaded: 71 parameters, 75 OSC routes, 64 MIDI CCs.
Master limiter active (2 ch, ceiling 0.92) — output can no longer clip.
=== CONTROL BUS SETUP COMPLETE ===
```

El lanzador espera esa última línea hasta 60 s antes de abrir la interfaz. Un arranque en frío compila primero la class library de SuperCollider y después carga los buffers del corpus, así que tardar bastante es normal; lo que no es normal es que `sclang` muera durante el proceso, y en ese caso el lanzador lo dice y deja de esperar.
