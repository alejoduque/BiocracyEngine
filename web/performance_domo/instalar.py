#!/usr/bin/env python3
"""Instala la performance en el motor: dos inserciones, con copia de seguridad.

  1. start_sonification.scd  ← bloque_start_sonification.scd  (antes de «// Final system check»)
  2. nw_wrld_local/src/projector/views/parliament.html  ← panel_voz_parliament.html
     (antes de <script src="/parliament.js">)

Se puede correr varias veces: si ya está instalado, reemplaza el bloque por la versión nueva.
  python3 instalar.py            instala o actualiza
  python3 instalar.py --quitar   quita los dos bloques
  python3 instalar.py --ver      solo dice qué está instalado
Después de instalar o quitar, reinicia el ecosistema (el lanzador).
"""
import re, shutil, sys, time
from pathlib import Path

AQUI = Path(__file__).resolve().parent
REPO = AQUI.parent.parent
SC   = REPO / "start_sonification.scd"
HTML = REPO / "nw_wrld_local/src/projector/views/parliament.html"
OBJ = [
    dict(nombre="SuperCollider", archivo=SC, bloque=AQUI / "bloque_start_sonification.scd",
         ini="// MAQUINA:INICIO", fin="// MAQUINA:FIN", ancla="    // Final system check"),
    dict(nombre="consola", archivo=HTML, bloque=AQUI / "panel_voz_parliament.html",
         ini="<!-- MAQUINA-PANEL:INICIO -->", fin="<!-- MAQUINA-PANEL:FIN -->", ancla='<script src="/parliament.js"></script>'),
]

def patron(o):
    # el bloque completo, desde el comienzo de la línea del marcador inicial hasta el final de la línea del final
    return re.compile(r"[ \t]*" + re.escape(o["ini"]) + r".*?" + re.escape(o["fin"]) + r"[^\n]*\n?", re.S)

def respaldo(f):
    b = f.with_name(f.name + ".antes-performance")
    if not b.exists(): shutil.copy2(f, b)
    return b

def main():
    modo = sys.argv[1] if len(sys.argv) > 1 else "--instalar"
    ok = True
    for o in OBJ:
        f = o["archivo"]
        if not f.exists():
            print(f"✗ {o['nombre']}: no encuentro {f}"); ok = False; continue
        txt = f.read_text(encoding="utf-8")
        hay = bool(patron(o).search(txt))
        if modo == "--ver":
            print(f"{'✓' if hay else '·'} {o['nombre']}: {'instalado' if hay else 'sin instalar'}  ({f.relative_to(REPO)})"); continue
        if modo == "--quitar":
            if hay:
                f.write_text(patron(o).sub("", txt), encoding="utf-8"); print(f"✓ {o['nombre']}: bloque quitado")
            else: print(f"· {o['nombre']}: no había nada que quitar")
            continue
        bloque = o["bloque"].read_text(encoding="utf-8").rstrip("\n") + "\n"
        if hay:
            nuevo = patron(o).sub(lambda m: bloque, txt, count=1); que = "actualizado"
        else:
            if txt.count(o["ancla"]) != 1:
                print(f"✗ {o['nombre']}: no encuentro una sola vez «{o['ancla']}» en {f.name}; no toco nada."); ok = False; continue
            nuevo = txt.replace(o["ancla"], bloque + o["ancla"], 1); que = "instalado"
        if nuevo != txt:
            b = respaldo(f); f.write_text(nuevo, encoding="utf-8")
            print(f"✓ {o['nombre']}: {que}  (copia original: {b.name})")
        else:
            print(f"✓ {o['nombre']}: ya estaba al día")
    if modo in ("--instalar", "--quitar") and ok:
        print("\nListo. Reinicia el ecosistema con el lanzador para que tome los cambios.")
    sys.exit(0 if ok else 1)

if __name__ == "__main__":
    main()
