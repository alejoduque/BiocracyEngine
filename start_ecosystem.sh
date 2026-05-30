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
echo ">> Verificando dependencias..."
require node
require npm
require python3
require lsof
require pkill
if [ ! -x /Applications/SuperCollider.app/Contents/MacOS/sclang ]; then
    echo "❌ Falta SuperCollider en /Applications/SuperCollider.app — instala desde https://supercollider.github.io/"
    exit 1
fi
if [ ! -f eth_listener/venv/bin/activate ]; then
    echo "❌ Falta eth_listener/venv. Crea con:"
    echo "    python3 -m venv eth_listener/venv && source eth_listener/venv/bin/activate && pip install web3 python-osc"
    exit 1
fi
if [ ! -f nw_wrld_local/parliament-bridge.js ]; then
    echo "❌ Falta nw_wrld_local/parliament-bridge.js"
    exit 1
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
pkill -f "webpack-dev-server" 2>/dev/null   # nw_wrld_local npm run serve
pkill -f "eth_sonify\.py" 2>/dev/null
sleep 0.5

# Forzar si siguen vivos
pkill -9 sclang 2>/dev/null
pkill -9 scsynth 2>/dev/null
pkill -9 -f "parliament-bridge\.js" 2>/dev/null
pkill -9 -f "webpack-dev-server" 2>/dev/null
pkill -9 -f "eth_sonify\.py" 2>/dev/null

# Liberar puertos específicos del ecosistema por si quedaron huérfanos
for PORT in 57110 57120 3333 3334 9001; do
    lsof -ti:"$PORT" | xargs kill -9 2>/dev/null
done
echo "   Listo. Esperando que los puertos se liberen..."
sleep 1
echo ""

# ── Wrapper de unbuffering compatible con macOS ────────────────────────────
# stdbuf es GNU-only y no existe en macOS por defecto.
# Buscamos: unbuffer (brew install expect) > gstdbuf (brew install coreutils) > directo
run_unbuffered() {
    if command -v unbuffer &>/dev/null; then
        unbuffer "$@"
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

cleanup() {
    echo ""
    echo "=============================================="
    echo "    CERRANDO ECOSISTEMA TRES-PARTES..."
    echo "=============================================="
    for pid in $NW_PID $BRIDGE_PID $SC_PID; do
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null
        fi
    done
    sleep 0.5
    # Limpieza de procesos huérfanos (por si algún hijo no respondió a SIGTERM)
    pkill sclang 2>/dev/null
    pkill scsynth 2>/dev/null
    pkill -f "parliament-bridge\.js" 2>/dev/null
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

# Darle un instante al bridge para abrir sus puertos
sleep 1

# 2. Levantar Motor SuperCollider (Con GUI de Control)
echo ""
echo ">> Paso 2: Iniciando Motor SuperCollider (V3 GUI)..."
run_unbuffered /Applications/SuperCollider.app/Contents/MacOS/sclang start_sonification.scd > sclang_log.txt 2>&1 &
SC_PID=$!
echo "   sclang corriendo en Background (PID: $SC_PID). Log: sclang_log.txt"

# ── (6) Esperar a que SC complete el boot antes de abrir la UI ─────────────
# Sin esto, el navegador abre la HTML mientras SC todavía está cargando
# SynthDefs y los sliders se sienten muertos durante ~5 segundos.
echo "   Esperando boot completo de SC (CONTROL BUS SETUP COMPLETE)..."
SC_READY=0
for i in {1..40}; do
    if grep -q "CONTROL BUS SETUP COMPLETE" sclang_log.txt 2>/dev/null; then
        SC_READY=1
        echo "   ✓ SC listo (después de $((i * 5))00ms)."
        break
    fi
    sleep 0.5
done
if [ "$SC_READY" -eq 0 ]; then
    echo "   ⚠ SC no señaló CONTROL BUS SETUP COMPLETE en 20s — abro UI igual; revisa sclang_log.txt"
fi

# 2.5 OPCIONAL: Parliament Synthesizer.
# NOTA: No lanzar una segunda instancia de sclang aquí, causaría colisión.
# Si se desea integrar, debe hacerse dentro de sonETH/0_loader.scd.

echo ""
echo "   Abriendo Parliament en http://localhost:9001/parliament.html ..."
open http://localhost:9001/parliament.html

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
