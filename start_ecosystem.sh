#!/bin/bash

# start_ecosystem.sh
# Orquestador Total: Ecosistema Biocracy (nw_wrld + SuperCollider Headless + eth_listener)

echo "=============================================="
echo "      BIOCRACY ECOSYSTEM LAUNCHER (V3 GUI)    "
echo "=============================================="

# ── Teardown de instancias previas ──────────────────────────────────────────
# Mata cualquier instancia anterior antes de arrancar para liberar puertos
# y evitar que MIDIClient / scsynth / node retengan 57120, 3333, 3334, 9001.
echo ">> Limpiando procesos anteriores..."

# Intentar cierre amable primero (SIGTERM)
pkill sclang 2>/dev/null
pkill scsynth 2>/dev/null
pkill node 2>/dev/null
pkill python3 2>/dev/null
sleep 0.5

# Forzar si siguen vivos
pkill -9 sclang 2>/dev/null
pkill -9 scsynth 2>/dev/null
pkill -9 node 2>/dev/null
pkill -9 python3 2>/dev/null

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

# Configurar función de limpieza al salir (Ctrl+C)
cleanup() {
    echo ""
    echo "=============================================="
    echo "    CERRANDO ECOSISTEMA TRES-PARTES..."
    echo "=============================================="
    echo "Matando servidor nw_wrld..."
    kill $NW_PID 2>/dev/null

    echo "Matando puente OSC-WebSocket..."
    kill $BRIDGE_PID 2>/dev/null

    echo "Matando Parliament Synthesizer..."
    kill $PARLIAMENT_PID 2>/dev/null

    echo "Buscando procesos huérfanos de sclang..."
    pkill sclang 2>/dev/null

    echo "Adiós."
    exit 0
}
trap cleanup SIGINT SIGTERM

# 1. Levantar nw_wrld local
echo ">> Paso 1: Iniciando nw_wrld (Servidor Web y Servidor OSC interno)..."
cd nw_wrld_local || { echo "Directorio nw_wrld_local no encontrado. Falla."; exit 1; }
npm run serve --silent &
NW_PID=$!
echo "   nw_wrld corriendo en Background (PID: $NW_PID). Parliament en http://localhost:9001/parliament.html"

# 1.5 Levantar puente OSC→WebSocket para el parlamento visual
echo ">> Paso 1.5: Iniciando puente Parliament OSC→WebSocket..."
node parliament-bridge.js &
BRIDGE_PID=$!
echo "   Puente OSC (UDP:3333) → WebSocket (WS:3334) activo (PID: $BRIDGE_PID)"
cd ..

# Darle unos segundos a la app web para levantar sus osc servers
sleep 3

# 2. Levantar Motor SuperCollider (Con GUI de Control)
echo ""
echo ">> Paso 2: Iniciando Motor SuperCollider (V3 GUI)..."
run_unbuffered /Applications/SuperCollider.app/Contents/MacOS/sclang start_sonification.scd > sclang_log.txt 2>&1 &
SC_PID=$!
echo "   sclang corriendo en Background (PID: $SC_PID). Log: sclang_log.txt"

# 2.5 OPCIONAL: Parliament Synthesizer. 
# NOTA: No lanzar una segunda instancia de sclang aquí, causaría colisión.
# Si se desea integrar, debe hacerse dentro de sonETH/0_loader.scd.
# echo ""
# echo ">> Paso 2.5: Cargando Parliament Synthesizer..."
# run_unbuffered /Applications/SuperCollider.app/Contents/MacOS/sclang parliament-synthesizer/0_parliament_loader.scd >> sclang_log.txt 2>&1 &
# PARLIAMENT_PID=$!
# echo "   Parliament Synthesizer cargado (PID: $PARLIAMENT_PID)"

echo "   Abriendo Parliament en http://localhost:9001/parliament.html ..."
open http://localhost:9001/parliament.html

# 3. Levantar el Scraper Python de Ethereum (En Foreground)
echo ""
echo ">> Paso 3: Inicializando Scraper de Ethereum Vía Infura..."
cd eth_listener || { echo "Directorio eth_listener no encontrado"; exit 1; }

source venv/bin/activate
echo "=============================================="
echo "    ESCUCHANDO A LA BLOCKCHAIN...             "
echo "    (Presiona Ctrl+C para apagar todo)        "
echo "=============================================="
python3 ../eth_sonify.py
