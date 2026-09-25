#!/bin/bash
# add_audio.sh — prepara audio propio para la página.
#
# Recodifica cualquier grabación al formato que la página necesita y deja el
# resultado en media/audio/. build_media.sh fija los cinco cortes del motor de
# sonificación (los que se documentan en index.html, sección «Cinco
# composiciones»); este script es para lo nuevo: otro corte del motor, otra
# sesión, cualquier archivo que no esté ya en esa lista fija.
#
#   ./add_audio.sh retorno-2 ~/Desktop/sesion3.wav
#   ./add_audio.sh retorno-2 ~/Desktop/sesion3.wav 95 60   # recorta 95s, dura 60s
#
# Mismo tratamiento que build_media.sh y por las mismas razones (ver ahí el
# porqué de cada número):
#   loudnorm en dos pasadas a -16 LUFS / -1.5 dBTP — referencia habitual de
#     reproducción web, con margen para que el mp3 no rebase 0 dBFS al
#     decodificar. Dos pasadas porque en una sola el filtro va adivinando la
#     ganancia sobre la marcha y el primer par de segundos queda mal nivelado.
#   -ac 2   baja cualquier mezcla multicanal a estéreo.
#   128k    mp3 a 48 kHz, el mismo bitrate que las cinco composiciones
#           publicadas — para que una pista nueva no destaque por peso ni por
#           calidad frente a esas cinco.
set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
OUT="$HERE/media/audio"
LOUDNESS_LUFS=-16
TRUE_PEAK_DBTP=-1.5

usage() {
    echo "uso: ./add_audio.sh <nombre> <archivo> [inicio_s] [duración_s]"
    echo
    echo "  nombre     id de la composición (minúsculas, sin espacios: 'retorno-2')"
    echo "  archivo    wav/mp3/lo que sea — ffmpeg decide si puede leerlo"
    echo "  inicio_s   segundo donde empieza el corte (por defecto: 0)"
    echo "  duración_s cuánto dura el corte (por defecto: hasta el final)"
    exit 1
}

[ $# -ge 2 ] || usage
NAME="$1"; SRC="$2"; SS="${3:-0}"; DUR="${4:-}"

command -v ffmpeg >/dev/null || { echo "❌ falta ffmpeg"; exit 1; }
[ -f "$SRC" ] || { echo "❌ no existe: $SRC"; exit 1; }
mkdir -p "$OUT"

DST="$OUT/$NAME.mp3"
TCUT=()
[ -n "$DUR" ] && TCUT=(-t "$DUR")

echo "midiendo sonoridad de $(basename "$SRC")…"
# -hide_banner y NO -v error: loudnorm imprime su JSON a nivel info, así que
# bajar el log a error lo silencia y la medición sale vacía (con set -e eso
# además mata el script sin decir nada).
meas=$(ffmpeg -hide_banner -ss "$SS" "${TCUT[@]}" -i "$SRC" -ac 2 \
    -af "loudnorm=I=${LOUDNESS_LUFS}:TP=${TRUE_PEAK_DBTP}:LRA=11:print_format=json" \
    -f null /dev/null 2>&1 | tr -d '\n\t ' | grep -o '{"input_i".*}' || true)
[ -n "$meas" ] || { echo "❌ no pude medir $SRC"; exit 1; }
get() { echo "$meas" | grep -o "\"$1\":\"[^\"]*\"" | cut -d'"' -f4; }

ffmpeg -v error -ss "$SS" "${TCUT[@]}" -i "$SRC" -ac 2 \
    -af "loudnorm=I=${LOUDNESS_LUFS}:TP=${TRUE_PEAK_DBTP}:LRA=11:measured_I=$(get input_i):measured_TP=$(get input_tp):measured_LRA=$(get input_lra):measured_thresh=$(get input_thresh):offset=$(get target_offset):linear=true" \
    -ar 48000 -c:a libmp3lame -b:a 128k -y "$DST"

dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$DST" 2>/dev/null | cut -d. -f1)
echo "+ $NAME.mp3  ($(du -h "$DST" | cut -f1), ${dur}s)"

echo
echo "─────────────────────────────────────────────────────────────────"
echo "Añade esto al arreglo COMPS de index.html (búscalo: 'id:'lecho''):"
echo
echo "    { id:'$NAME', label:'$NAME', nota:'…' },"
echo
echo "Y si corresponde, una fila a la tabla de la sección «Cinco"
echo "composiciones» con el nivel y el centroide medidos."
echo "─────────────────────────────────────────────────────────────────"
echo
echo "Después:  ./verify_deploy.sh   para confirmar que todo llegó al servidor."
