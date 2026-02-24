#!/bin/bash

# start_ecosystem.sh
# Orquestador Total: Ecosistema Biocracy (nw_wrld + SuperCollider Headless + eth_listener)

echo "=============================================="
echo "    BIOCRACY ECOSYSTEM LAUNCHER (HEADLESS)    "
echo "=============================================="

# Configurar función de limpieza al salir (Ctrl+C)
cleanup() {
    echo ""
    echo "=============================================="
    echo "    CERRANDO ECOSISTEMA TRES-PARTES..."
    echo "=============================================="
    echo "Matando servidor nw_wrld..."
    kill $NW_PID 2>/dev/null
    
    echo "Buscando procesos huérfanos de sclang..."
    pkill sclang 2>/dev/null
    
    echo "Adiós."
    exit 0
}
trap cleanup SIGINT SIGTERM

# 1. Levantar nw_wrld local
echo ">> Paso 1: Iniciando nw_wrld (Servidor Web y Servidor OSC interno)..."
cd nw_wrld_local || { echo "Directorio nw_wrld_local no encontrado. Falla."; exit 1; }
npm run dev --silent &
NW_PID=$!
echo "   nw_wrld corriendo en Background (PID: $NW_PID). Dashboard en http://localhost:8080"
cd ..

# Darle unos segundos a la app web para levantar sus osc servers
sleep 3

# 2. Levantar SuperCollider Headless
echo ""
echo ">> Paso 2: Iniciando Motor SuperCollider (Headless)..."
sclang sonETH/0_loader.scd > /dev/null 2>&1 &
SC_PID=$!
echo "   sclang corriendo en Background (PID: $SC_PID)."

# 3. Levantar el Scraper Python de Ethereum (En Foreground)
echo ""
echo ">> Paso 3: Inicializando Scraper de Ethereum Vía Infura..."
cd eth_listener || { echo "Directorio eth_listener no encontrado"; exit 1; }

source venv/bin/activate
echo "=============================================="
echo "    ESCUCHANDO A LA BLOCKCHAIN...             "
echo "    (Presiona Ctrl+C para apagar todo)        "
echo "=============================================="
python3 eth_sonify.py
