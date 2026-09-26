#!/bin/bash
# deploy.sh — sube web/ a altred.xyz y comprueba que llegó.
#
#   ./deploy.sh              # sube y verifica
#   ./deploy.sh -n           # ensayo: dice qué subiría y no sube nada
#
# El comando que hay debajo se escribía a mano cada vez, y a mano tiene un modo
# de fallar que no avisa: la ruta de origen era relativa («web/»), así que
# lanzarlo desde cualquier sitio que no fuera la raíz del repositorio no subía
# nada. rsync se queja del origen que falta y termina —con --delete NO borra el
# destino cuando el origen no existe, que es la única razón por la que esto
# nunca acabó en desastre—, pero el mensaje se pierde entre la salida y uno se
# queda pensando que ya está desplegado. Aquí el origen se resuelve desde la
# ubicación del propio script, así que da igual desde dónde se llame.
set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
DEST="root@altred.xyz:/var/www/altred.xyz/BiocracyEngine/"
PORT=8888

DRY=()
case "${1:-}" in
    -n|--dry-run) DRY=(--dry-run); echo "— ensayo: no se sube nada —"; echo;;
    -h|--help)    sed -n '2,5p' "$0" | sed 's/^# \?//'; exit 0;;
    "")           ;;
    *)            echo "opción desconocida: $1 (ver -h)"; exit 1;;
esac

# --delete para que un archivo retirado del repositorio desaparezca también del
# servidor; si no, las láminas y los clips viejos se quedan ahí para siempre.
# Los .sh y los .py son las herramientas que construyen el sitio, no el sitio:
# no se publican. Como están excluidos, --delete tampoco los toca en el destino.
#
# ${DRY[@]+"${DRY[@]}"} y no "${DRY[@]}": el bash de macOS es el 3.2, y con
# set -u un arreglo VACÍO cuenta como variable sin definir —«DRY[@]: unbound
# variable»—, así que el script moría justo en la subida real, la que no
# lleva -n.
rsync -avz --delete ${DRY[@]+"${DRY[@]}"} -e "ssh -p $PORT" \
    --exclude='*.sh' --exclude='*.py' \
    "$HERE/" "$DEST"

[ ${#DRY[@]} -gt 0 ] && exit 0

# Subir y no comprobar es la mitad del trabajo: una transferencia cortada deja
# la página cargando y el video ausente, que se parece mucho a un error de
# código y se busca en el sitio equivocado durante media hora.
echo
exec "$HERE/verify_deploy.sh"
