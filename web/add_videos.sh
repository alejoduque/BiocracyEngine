#!/bin/bash
# add_videos.sh — prepara videos propios para la página.
#
# Recodifica cualquier video al formato que la página necesita y deja el
# archivo en media/video/. Al terminar imprime la línea exacta que hay que
# pegar en index.html.
#
#   ./add_videos.sh hero  ~/Desktop/mis_videos/*.mp4
#   ./add_videos.sh strip ~/Desktop/otros/IMAG0031.AVI.mp4
#
#   hero   → entra al ciclo de hydra en el escenario grande (960 px de ancho),
#            antes del archivo (build_archivo.py). Cada uno se sostiene al
#            menos 18 segundos, así que conviene que sean pocos.
#   strip  → va en la tira de abajo, con su propio pie de foto (640 px).
#
# Lo que hace a cada archivo y por qué:
#   -an              quita el audio. El sonido de la página son las
#                    composiciones; la pista de la cámara sólo añadiría peso y
#                    se pisaría con ellas.
#   yuv420p          sin esto Safari y algunos Android no decodifican nada.
#   +faststart       mueve el índice al principio, para que empiece a verse
#                    mientras baja en vez de al terminar.
#   crf 26           compromiso tamaño/calidad. Baja el número si quieres más
#                    calidad (23 es visiblemente mejor y pesa ~1.6×).
set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
OUT="$HERE/media/video"
CRF="${CRF:-26}"

usage() {
    echo "uso: ./add_videos.sh <hero|strip> archivo1 [archivo2 ...]"
    echo
    echo "  hero   clips grandes, entran al ciclo de hydra"
    echo "  strip  clips de la tira inferior, con pie de foto"
    exit 1
}

[ $# -ge 2 ] || usage
KIND="$1"; shift
case "$KIND" in
    hero)  WIDTH=960 ;;
    strip) WIDTH=640 ;;
    *) echo "❌ el primer argumento debe ser 'hero' o 'strip'"; echo; usage ;;
esac

command -v ffmpeg >/dev/null || { echo "❌ falta ffmpeg"; exit 1; }
mkdir -p "$OUT"

echo "recodificando $# archivo(s) como '$KIND' a ${WIDTH}px de ancho"
echo

added=()
for src in "$@"; do
    if [ ! -f "$src" ]; then echo "  ⚠  no existe: $src"; continue; fi

    base=$(basename "$src")
    # Un nombre de archivo apto para URL: sin espacios, acentos ni mayúsculas.
    # "CAM 1 Ago.AVI.mp4" servido tal cual obliga a escapar en el HTML y se
    # rompe distinto en cada servidor.
    slug=$(echo "${base%%.*}" \
        | iconv -f utf8 -t ascii//TRANSLIT 2>/dev/null || echo "${base%%.*}")
    slug=$(echo "$slug" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' \
        | sed 's/^-//; s/-$//')
    [ -n "$slug" ] || slug="clip"
    name="$KIND-$slug"
    dst="$OUT/$name.mp4"

    # Fecha y hora que la cámara trampa graba EN la imagen no se pueden leer
    # desde aquí, pero la fecha de modificación del archivo suele acercarse y
    # sirve de punto de partida para el pie de foto.
    stamp=$(date -r "$src" "+%d/%m/%Y %H:%M" 2>/dev/null || echo "")

    ffmpeg -v error -i "$src" -an \
        -vf "scale=$WIDTH:-2" -c:v libx264 -preset slow -crf "$CRF" \
        -pix_fmt yuv420p -movflags +faststart -y "$dst"

    dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$dst" 2>/dev/null | cut -d. -f1)
    echo "  + $name.mp4  ($(du -h "$dst" | cut -f1), ${dur}s)  ← $base"
    added+=("$name|$stamp")
done

[ ${#added[@]} -gt 0 ] || { echo; echo "no se añadió nada."; exit 0; }

# ── Qué pegar en index.html ─────────────────────────────────────────────────
echo
echo "─────────────────────────────────────────────────────────────────"
if [ "$KIND" = "hero" ]; then
    echo "Añade estas líneas al arreglo HERO_CLIPS de index.html"
    echo "(búscalo: 'var HERO_CLIPS'):"
    echo
    for a in "${added[@]}"; do
        n="${a%%|*}"; s="${a##*|}"
        echo "    { src:'media/video/$n.mp4', camara:true, pie:'${s:-CAM01 · fecha · lo que se ve}' },"
    done
    echo
    echo "camara:true si es cámara trampa (lleva la trama de puntos), false si"
    echo "es un espectrograma. El ciclo ya no tiene tope de cuatro: el escenario"
    echo "carga los clips por turno. Estos se sostienen 18 s y los más largos"
    echo "se ven enteros; mira HOLD_MS en index.html."
else
    echo "Añade estos bloques dentro de <div class=\"strip\"> en index.html:"
    echo
    for a in "${added[@]}"; do
        n="${a%%|*}"; s="${a##*|}"
        echo "  <figure>"
        echo "    <video class=\"clip\" src=\"media/video/$n.mp4\" muted loop playsinline preload=\"metadata\"></video>"
        echo "    <figcaption>${s:-CAM01 · fecha · temperatura}</figcaption>"
        echo "  </figure>"
    done
    echo
    echo "El pie de foto sale de la fecha del archivo y probablemente NO sea"
    echo "la de la captura. Corrígelo con lo que la cámara grabó en la imagen."
fi
echo "─────────────────────────────────────────────────────────────────"
echo
echo "Antes de subir, mira cada clip completo. Dos de los 56 originales"
echo "quedaron fuera por mostrar personas reconocibles: este proyecto"
echo "sostiene que el derecho a no quedar registrado es una función del"
echo "sistema, y aplicarlo sólo al bosque sería la contradicción que la"
echo "obra denuncia."
echo
echo "Después:  ./verify_deploy.sh   para confirmar que todo llegó al servidor."
