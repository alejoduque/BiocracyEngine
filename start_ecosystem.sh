#!/bin/bash

# start_ecosystem.sh
# Orquestador Total: Ecosistema Biocracy (nw_wrld + SuperCollider Headless + eth_listener)

echo "=============================================="
echo "      BIOCRACY ECOSYSTEM LAUNCHER (V3 GUI)    "
echo "=============================================="

# ── Anclar al directorio del script ────────────────────────────────────────
# Usar rutas absolutas evita romperse si algún `cd` intermedio falla.
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
cd "$SCRIPT_DIR" || { echo "No se puede entrar a $SCRIPT_DIR"; exit 1; }

# ── (1) Verificación de dependencias antes de matar nada ───────────────────
# Si algo crítico falta, mejor avisar y salir limpio que matar procesos del
# usuario y dejarlo sin Node/Python solo para descubrir que falta sclang.
require() {
    command -v "$1" &>/dev/null || { echo "❌ Falta: $1 (instálalo y reintenta)"; exit 1; }
}
# ── (1b) Entorno del compositor de macOS ────────────────────────────────────
# scsynth es de UN SOLO HILO y tiene una fecha límite por bloque. No importa
# cuántos núcleos ni cuánta RAM tenga la máquina: lo único que cuenta es que
# nadie le quite ese núcleo mientras calcula. Medido en esta máquina, un cambio
# de escritorio le robaba ~19-35 ms a un bloque que dispone de 42.7 ms — con la
# carga de audio en apenas 35%. El núcleo no se llenaba, se lo llevaban.
#
# Stage Manager es el peor de los culpables porque redibuja miniaturas VIVAS de
# las aplicaciones recientes cada vez que se cambia de app o de escritorio. No
# depende de qué app sea, que es exactamente como se oía el fallo.
#
# Nada de esto detiene el arranque. Son ajustes del usuario y esta es su
# máquina; el guion sólo dice lo que ve, porque de otro modo es invisible y
# vuelve a costar una sesión entera de depuración en el sitio equivocado.
mac_env_check() {
    command -v defaults &>/dev/null || return 0
    local warned=0
    local sm; sm=$(defaults read com.apple.WindowManager GloballyEnabled 2>/dev/null || echo 0)
    if [ "$sm" = "1" ]; then
        echo "⚠  Stage Manager ACTIVO — redibuja miniaturas en cada cambio de app."
        echo "   Ajustes > Escritorio y Dock > Stage Manager (desactivar)."
        warned=1
    fi
    local rm; rm=$(defaults read com.apple.universalaccess reduceMotion 2>/dev/null || echo 0)
    if [ "$rm" != "1" ]; then
        echo "·  Reducir movimiento DESACTIVADO — la animación de cambio de espacio"
        echo "   es la parte cara. Accesibilidad > Pantalla > Reducir movimiento."
        warned=1
    fi
    local sp; sp=$(defaults read com.apple.spaces spans-displays 2>/dev/null || echo 0)
    if [ "$sp" != "1" ]; then
        echo "·  \"Las pantallas tienen espacios separados\" ACTIVADO — multiplica el"
        echo "   trabajo del compositor. Ajustes > Escritorio y Dock."
        warned=1
    fi
    [ "$warned" = "0" ] && echo "   entorno gráfico: sin ajustes conocidos que roben el núcleo de audio."
    return 0
}
echo ">> Verificando entorno de macOS (latencia de audio)..."
mac_env_check

echo ">> Verificando dependencias..."
require node
require npm
require python3
require lsof
require pkill

# ── Localizar sclang (macOS y Linux) ───────────────────────────────────────
# En macOS vive dentro del .app; en Linux es un binario normal en el PATH.
# $SCLANG permite forzar una ruta concreta (builds locales, varias versiones).
if [ -n "$SCLANG" ]; then
    :   # ruta dada por el usuario, se valida abajo
elif command -v sclang &>/dev/null; then
    SCLANG=$(command -v sclang)
elif [ -x /Applications/SuperCollider.app/Contents/MacOS/sclang ]; then
    SCLANG=/Applications/SuperCollider.app/Contents/MacOS/sclang
fi
if [ -z "$SCLANG" ] || [ ! -x "$SCLANG" ]; then
    echo "❌ Falta SuperCollider (no encuentro 'sclang')."
    echo "   macOS: instala desde https://supercollider.github.io/"
    echo "   Linux: p.ej. pacman -S supercollider | apt install supercollider"
    echo "   O apunta a tu binario:  SCLANG=/ruta/a/sclang ./start_ecosystem.sh"
    exit 1
fi
echo "   sclang: $SCLANG"
if [ ! -f eth_listener/venv/bin/activate ]; then
    echo "❌ Falta eth_listener/venv. Crea con:"
    echo "    python3 -m venv eth_listener/venv && source eth_listener/venv/bin/activate && pip install web3 python-osc"
    exit 1
fi
if [ ! -f nw_wrld_local/parliament-bridge.js ]; then
    echo "❌ Falta nw_wrld_local/parliament-bridge.js"
    exit 1
fi
# Fuente de las etiquetas del SC GUI: Departure Mono, monoespaciada de píxel
# (SIL OFL 1.1, en fonts/). SuperCollider sólo ve fuentes instaladas, así que se
# copia a ~/Library/Fonts la primera vez. Sin ella el GUI usa Menlo y funciona
# igual: por eso es un aviso y no un error.
if [ "$(uname)" = "Darwin" ] && [ ! -f "$HOME/Library/Fonts/DepartureMono-Regular.otf" ]; then
    if cp fonts/DepartureMono-Regular.otf "$HOME/Library/Fonts/" 2>/dev/null; then
        echo "   · Fuente Departure Mono instalada en ~/Library/Fonts (etiquetas del GUI)."
    else
        echo "   ⚠ No pude instalar fonts/DepartureMono-Regular.otf — el GUI usará Menlo."
    fi
fi
echo "   ✓ Todo en orden."
echo ""

# ── (10) Lock para impedir lanzar dos veces ────────────────────────────────
LOCKFILE=/tmp/biocracy.lock
if [ -f "$LOCKFILE" ] && kill -0 "$(cat "$LOCKFILE" 2>/dev/null)" 2>/dev/null; then
    echo "❌ Ecosistema ya corriendo (PID $(cat "$LOCKFILE")). Si está colgado, borra $LOCKFILE"
    exit 1
fi
echo $$ > "$LOCKFILE"

# ── (2) Teardown de instancias previas — acotado a este proyecto ───────────
# pkill node / pkill python3 son demasiado agresivos: matan VSCode extension
# hosts, otros dev servers, otros venv. Matamos solo lo que es nuestro.
echo ">> Limpiando procesos anteriores del ecosistema..."

# Cierre amable primero (SIGTERM)
pkill sclang 2>/dev/null
pkill scsynth 2>/dev/null
pkill -f "parliament-bridge\.js" 2>/dev/null
pkill -f "laser-bridge\.js" 2>/dev/null
pkill -f "dome-bridge\.js" 2>/dev/null
pkill -f "dome-live\.js" 2>/dev/null
pkill -f "webpack-dev-server" 2>/dev/null   # nw_wrld_local npm run serve
pkill -f "eth_sonify\.py" 2>/dev/null
sleep 0.5

# Forzar si siguen vivos
pkill -9 sclang 2>/dev/null
pkill -9 scsynth 2>/dev/null
pkill -9 -f "parliament-bridge\.js" 2>/dev/null
pkill -9 -f "laser-bridge\.js" 2>/dev/null
pkill -9 -f "dome-bridge\.js" 2>/dev/null
pkill -9 -f "dome-live\.js" 2>/dev/null
pkill -9 -f "webpack-dev-server" 2>/dev/null
pkill -9 -f "eth_sonify\.py" 2>/dev/null

# Liberar puertos específicos del ecosistema por si quedaron huérfanos
#   3335 = endpoint DIAG del bridge; 3337 = laser-bridge WS in; 3338 = dome-bridge. Un proceso
#   colgado que retenga el puerto impide re-bindear al relanzar.
for PORT in 57110 57120 3333 3334 3335 3337 3338 9001; do
    lsof -ti:"$PORT" | xargs kill -9 2>/dev/null
done
echo "   Listo. Esperando que los puertos se liberen..."
sleep 1
echo ""

# ── Wrapper de unbuffering compatible con macOS y Linux ────────────────────
# stdbuf es GNU-only: en Linux está de serie, en macOS no existe.
# Buscamos: unbuffer (brew install expect) > stdbuf/gstdbuf (coreutils) > directo
run_unbuffered() {
    if command -v unbuffer &>/dev/null; then
        unbuffer "$@"
    elif command -v stdbuf &>/dev/null; then
        stdbuf -oL "$@"
    elif command -v gstdbuf &>/dev/null; then
        gstdbuf -oL "$@"
    else
        # Sin herramienta de unbuffering: ejecutar directo.
        # Los postln llegarán al log pero con posible delay de buffer.
        # Para instalarlo: brew install expect   (da 'unbuffer')
        #              o:  brew install coreutils (da 'gstdbuf')
        "$@"
    fi
}

# ── (3) Cleanup unificado: trackea TODOS los PIDs lanzados ─────────────────
NW_PID=""
BRIDGE_PID=""
SC_PID=""
LASER_PID=""
DOME_PID=""
DOME_LIVE_PID=""

cleanup() {
    echo ""
    echo "=============================================="
    echo "    CERRANDO ECOSISTEMA TRES-PARTES..."
    echo "=============================================="
    for pid in $NW_PID $BRIDGE_PID $SC_PID $LASER_PID $DOME_PID $DOME_LIVE_PID; do
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null
        fi
    done
    sleep 0.5
    # Limpieza de procesos huérfanos (por si algún hijo no respondió a SIGTERM)
    pkill sclang 2>/dev/null
    pkill scsynth 2>/dev/null
    pkill -f "parliament-bridge\.js" 2>/dev/null
    pkill -f "laser-bridge\.js" 2>/dev/null
    pkill -f "dome-bridge\.js" 2>/dev/null
    pkill -f "dome-live\.js" 2>/dev/null
    pkill -f "webpack-dev-server" 2>/dev/null
    pkill -f "eth_sonify\.py" 2>/dev/null
    rm -f "$LOCKFILE"
    echo "Adiós."
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# ── (7) Purgar log de SC al arrancar (evita crecimiento sin límite) ────────
> sclang_log.txt

# 1. Levantar nw_wrld local
echo ">> Paso 1: Iniciando nw_wrld (Servidor Web y Servidor OSC interno)..."
( cd "$SCRIPT_DIR/nw_wrld_local" && npm run serve --silent ) &
NW_PID=$!
echo "   nw_wrld corriendo en Background (PID: $NW_PID). Parliament en http://localhost:9001/parliament.html"

# ── (4) Health check: esperar a que webpack-dev-server responda ────────────
# En vez de sleep ciego, polleamos el puerto 9001 hasta 10 segundos.
echo "   Esperando webpack-dev-server (puerto 9001)..."
WAIT_OK=0
for i in {1..20}; do
    if curl -sf -o /dev/null http://localhost:9001 2>/dev/null; then
        WAIT_OK=1
        echo "   ✓ webpack-dev-server listo (después de $((i * 5))00ms)."
        break
    fi
    sleep 0.5
done
if [ "$WAIT_OK" -eq 0 ]; then
    echo "   ⚠ webpack-dev-server no respondió en 10s — continúo igual, pero la UI puede tardar."
fi

# 1.5 Levantar puente OSC→WebSocket para el parlamento visual
echo ""
echo ">> Paso 1.5: Iniciando puente Parliament OSC→WebSocket..."
( cd "$SCRIPT_DIR/nw_wrld_local" && node parliament-bridge.js ) &
BRIDGE_PID=$!
echo "   Puente OSC (UDP:3333) → WebSocket (WS:3334) activo (PID: $BRIDGE_PID)"

# ── Health check del bridge: pollear el endpoint DIAG (puerto 3335) ─────────
# Si el bridge no levanta (p.ej. puerto ocupado), TODO slider→SC y la telemetría
# SC→browser se caen en silencio. Mejor detectarlo aquí que descubrir "los
# sliders no suenan" más tarde.
echo "   Esperando bridge (endpoint DIAG http://localhost:3335/diag)..."
BRIDGE_OK=0
for i in {1..20}; do
    if curl -sf -o /dev/null http://localhost:3335/diag 2>/dev/null; then
        BRIDGE_OK=1
        echo "   ✓ bridge respondiendo (después de $((i * 5))00ms)."
        break
    fi
    sleep 0.5
done
if [ "$BRIDGE_OK" -eq 0 ]; then
    echo "   ⚠ bridge no respondió en :3335 — los sliders pueden no llegar a SC."
    echo "     Revisa que el puerto 3334/3335 estén libres y mira la consola del bridge."
fi

# 1.6 OPCIONAL: puente láser (ILDA / Helios DAC) — solo si LASER=1.
# Sin DAC ni binding nativo corre en DRY RUN (sólo logs), así que es inofensivo;
# por defecto NO se lanza para no abrir el WS:3337 si no hay láser en uso.
#   LASER=1            → lanza el puente
#   LASER_TEST=1       → emite un círculo de prueba (bring-up sin navegador)
#   LASER_ILD_OUT=...  → captura frames a un archivo ILDA .ild
if [ "$LASER" = "1" ]; then
    echo ""
    echo ">> Paso 1.6: Iniciando puente láser (ILDA / Helios DAC)..."
    ( cd "$SCRIPT_DIR/nw_wrld_local" && node laser-bridge.js ) &
    LASER_PID=$!
    echo "   laser-bridge WS:3337 (PID: $LASER_PID). DAC: Helios si está presente, si no DRY RUN."
fi

# 1.7 OPCIONAL: puente de la cúpula (domemaster → Syphon) — solo si DOME=1.
# En parliament.html: tecla D abre la cúpula, y el botón «syphon» envía el
# domemaster a este puente, que lo publica como servidor Syphon
# «BiocracyEngine Cúpula» para MadMapper, OBS (fuente Syphon Client),
# Resolume… Sin node-syphon corre en DRY RUN. Si los frames se cortan, publica
# negro: la cúpula queda oscura, no congelada.
#   DOME=1             → lanza el puente
#   DOME_FLIP=1|0      → invierte la imagen si un receptor la ve de cabeza
#   DOME_LIVE=1        → la página abre en la ventana de cúpula en vivo
#                        (Electron) con salida NDI, en vez del navegador.
#   DOME_AUDIO=1       → sonido para la consola de la sala: con la MOTU, las
#                        salidas analógicas 3-6 llevan el cuadrafónico en
#                        cuatro canales limpios, L R Ls Rs (sin la mezcla
#                        estéreo del estudio). Lo lee 1_server_config.scd.
#
# Cada grabación de SC deja además un .session.jsonl junto al WAV (lo escribe
# el bridge): con él, `npm run dome:render -- --session <archivo>` renderiza
# esa sesión a 4096 (ver nw_wrld_local/dome-render.js).
if [ "$DOME" = "1" ]; then
    echo ""
    echo ">> Paso 1.7: Iniciando puente de la cúpula (domemaster → Syphon)..."
    ( cd "$SCRIPT_DIR/nw_wrld_local" && node dome-bridge.js ) &
    DOME_PID=$!
    echo "   dome-bridge WS:3338 (PID: $DOME_PID). Syphon: «BiocracyEngine Cúpula»."
fi

# 2. Levantar Motor SuperCollider (Con GUI de Control)
echo ""
echo ">> Paso 2: Iniciando Motor SuperCollider (V3 GUI)..."
run_unbuffered "$SCLANG" start_sonification.scd > sclang_log.txt 2>&1 &
SC_PID=$!
echo "   sclang corriendo en Background (PID: $SC_PID). Log: sclang_log.txt"

# ── (6) Esperar a que SC complete el boot antes de abrir la UI ─────────────
# Sin esto, el navegador abre la HTML mientras SC todavía está cargando
# SynthDefs y los sliders se sienten muertos durante ~5 segundos.
# 20s no alcanzaban: en un arranque en frío sclang compila la class library
# antes de leer una sola línea nuestra, y encima el corpus fenológico carga
# ~230 MB de buffers. Medido en Linux el boot pasa de 20s con holgura, así que
# el aviso saltaba en cada arranque sano y dejaba de significar algo.
echo "   Esperando boot completo de SC (CONTROL BUS SETUP COMPLETE)..."
SC_READY=0
for i in {1..120}; do
    if grep -q "CONTROL BUS SETUP COMPLETE" sclang_log.txt 2>/dev/null; then
        SC_READY=1
        echo "   ✓ SC listo (después de $((i * 5))00ms)."
        break
    fi
    # Si sclang murió, no tiene sentido esperar el minuto entero.
    if ! kill -0 "$SC_PID" 2>/dev/null; then
        echo "   ❌ sclang terminó durante el boot — mira sclang_log.txt"
        break
    fi
    sleep 0.5
done
if [ "$SC_READY" -eq 0 ]; then
    echo "   ⚠ SC no señaló CONTROL BUS SETUP COMPLETE en 60s — abro UI igual; revisa sclang_log.txt"
fi

# 2.5 OPCIONAL: Parliament Synthesizer.
# NOTA: No lanzar una segunda instancia de sclang aquí, causaría colisión.
# Si se desea integrar, debe hacerse dentro de sonETH/0_loader.scd.

echo ""
# DOME_LIVE=1: la página se abre en la ventana de la cúpula en vivo (Electron,
# nw_wrld_local/dome-live.js) en vez del navegador: es la única que puede
# enviar NDI. En la página: D → CÚPULA → salida «ndi».
if [ "$DOME_LIVE" = "1" ]; then
    echo "   Abriendo Parliament en la ventana de cúpula en vivo (NDI «BiocracyEngine Cúpula»)..."
    ( cd "$SCRIPT_DIR/nw_wrld_local" && npx electron dome-live.js ) &
    DOME_LIVE_PID=$!
else
echo "   Abriendo Parliament en http://localhost:9001/parliament.html ..."
# `open` es de macOS; en Linux el equivalente es xdg-open. Si no hay ninguno
# (sesión headless / SSH), no es fatal: la URL ya está impresa arriba.
if command -v xdg-open &>/dev/null; then
    xdg-open http://localhost:9001/parliament.html >/dev/null 2>&1 &
elif command -v open &>/dev/null; then
    open http://localhost:9001/parliament.html
else
    echo "   (sin xdg-open/open — ábrela a mano)"
fi
fi

# 3. Levantar el Scraper Python de Ethereum (En Foreground)
echo ""
echo ">> Paso 3: Inicializando Scraper de Ethereum Vía Infura..."

# ── (8) Validar venv antes de activarlo ────────────────────────────────────
# Si activar falla, no queremos seguir con un python3 sin web3.
if ! source eth_listener/venv/bin/activate; then
    echo "❌ No pude activar eth_listener/venv — abortando"
    exit 1
fi

# Comprobar que web3 + python-osc están instalados en este venv
if ! python3 -c "import web3, pythonosc" 2>/dev/null; then
    echo "⚠ eth_listener/venv no tiene web3 o python-osc instalados."
    echo "   pip install web3 python-osc dentro del venv."
    echo "   Continúo igual por si el usuario está depurando."
fi

echo "=============================================="
echo "    ESCUCHANDO A LA BLOCKCHAIN...             "
echo "    (Presiona Ctrl+C para apagar todo)        "
echo "=============================================="
python3 "$SCRIPT_DIR/eth_sonify.py"
