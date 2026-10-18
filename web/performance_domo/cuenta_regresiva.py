#!/usr/bin/env python3
"""Cuenta regresiva y comienzo de la rutina · Biocracia en escucha.

Lo lanza start_ecosystem.sh cuando el asistente eligió «la rutina empieza sola»
(PERF_AUTO=1). Espera a que SuperCollider haya cargado la partitura y a que la
página de la cúpula esté conectada al puente, cuenta hacia atrás en grande en
esta terminal y envía /rutina/iniciar a SuperCollider (57120).

  PERF_CUENTA   segundos de la cuenta (10 por defecto)
Solo la biblioteca estándar: el OSC se arma a mano (un mensaje sin argumentos).
"""
import json, os, socket, sys, time, urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
LOG = REPO / "sclang_log.txt"
CUENTA = max(3, int(os.environ.get("PERF_CUENTA", "10") or 10))
TTY = sys.stdout.isatty()

def c(code, s):
    return f"\033[{code}m{s}\033[0m" if TTY else s
AMBAR, VERDE, GRIS, BLANCO = "38;5;208", "38;5;71", "38;5;244", "1;97"

# Dígitos de 5 líneas, en bloques
DIG = {
    "0": ["█████", "█   █", "█   █", "█   █", "█████"],
    "1": ["  █  ", " ██  ", "  █  ", "  █  ", " ███ "],
    "2": ["█████", "    █", "█████", "█    ", "█████"],
    "3": ["█████", "    █", " ████", "    █", "█████"],
    "4": ["█   █", "█   █", "█████", "    █", "    █"],
    "5": ["█████", "█    ", "█████", "    █", "█████"],
    "6": ["█████", "█    ", "█████", "█   █", "█████"],
    "7": ["█████", "    █", "   █ ", "  █  ", "  █  "],
    "8": ["█████", "█   █", "█████", "█   █", "█████"],
    "9": ["█████", "█   █", "█████", "    █", "█████"],
}

def grande(n):
    filas = ["  ".join(DIG[d][i] for d in str(n)) for i in range(5)]
    return "\n".join("        " + f for f in filas)

def osc(direccion, puerto=57120):
    a = direccion.encode() + b"\0"
    a += b"\0" * (-len(a) % 4)
    msg = a + b",\0\0\0"
    socket.socket(socket.AF_INET, socket.SOCK_DGRAM).sendto(msg, ("127.0.0.1", puerto))

def rutina_cargada():
    try:
        return "[rutina] partitura de 30 minutos cargada" in LOG.read_text(errors="ignore")
    except OSError:
        return False

def clientes():
    try:
        with urllib.request.urlopen("http://localhost:3335/diag", timeout=1.5) as r:
            primera = r.read().decode(errors="ignore").splitlines()[0]
        return int(primera.split("—")[-1].split()[0])
    except Exception:
        return 0

def main():
    print(c(GRIS, "\n   [cuenta] esperando la partitura en SuperCollider y la cúpula en el puente…"), flush=True)
    t0 = time.time()
    while not (rutina_cargada() and clientes() >= 2):
        if time.time() - t0 > 300:
            print(c(AMBAR, "   [cuenta] ⚠ en 5 minutos no llegaron la partitura y la cúpula; empiezo igual."), flush=True)
            break
        time.sleep(1)
    time.sleep(8)   # que la página monte su primer módulo antes de pedirle el F
    for n in range(CUENTA, 0, -1):
        if TTY:
            sys.stdout.write("\033[2J\033[H")
        print("\n\n" + c(GRIS, "        BIOCRACIA EN ESCUCHA · Domo del Planetario de Bogotá") + "\n")
        print(c(AMBAR if n > 3 else BLANCO, grande(n)))
        print("\n" + c(VERDE, "        el bosque entra primero. la máquina escucha.") + "\n", flush=True)
        time.sleep(1)
    osc("/rutina/iniciar")
    if TTY:
        sys.stdout.write("\033[2J\033[H")
    print("\n\n" + c(BLANCO, "        ▶  COMIENZA") + "   " + c(GRIS, time.strftime("%H:%M:%S")))
    print(c(VERDE, "        30:00 · cinco bloques: convocar · escuchar · la propuesta · deliberar · adjudicar") + "\n", flush=True)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
