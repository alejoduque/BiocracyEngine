#!/bin/bash
# verify_deploy.sh — comprueba que lo desplegado coincide con lo local.
#
# Una subida a medias no se nota mirando la página: el HTML carga, hydra
# arranca, y lo único que pasa es que el video no aparece y algunos audios no
# suenan — que es indistinguible de un error de código. Esto compara archivo
# por archivo contra la URL real, sin ssh.
#
#   ./verify_deploy.sh                                  # usa la URL por defecto
#   ./verify_deploy.sh https://altred.xyz/BiocracyEngine
#
# Compara el CONTENIDO, no el tamaño. La primera versión miraba sólo
# Content-Length y daba por buenos cinco MP3 desactualizados: al tener todos la
# misma duración y el mismo bitrate, una versión nueva pesa exactamente lo
# mismo que la vieja. El tamaño detecta la falta de un archivo, nunca que esté
# obsoleto — que es el error más fácil de cometer al actualizar.
set -uo pipefail

BASE="${1:-https://altred.xyz/BiocracyEngine}"
BASE="${BASE%/}"
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

command -v curl >/dev/null || { echo "❌ falta curl"; exit 1; }

echo "verificando $BASE"
echo

command -v md5sum >/dev/null && HASH=md5sum || HASH="md5 -q"
TMP=$(mktemp); trap 'rm -f "$TMP"' EXIT

ok=0; bad=0
while IFS= read -r f; do
    rel="${f#./}"
    # Los .sh son fuente, no contenido servido, y se excluyen de la subida.
    case "$rel" in *.sh) continue;; esac

    local_size=$(stat -c%s "$HERE/$rel" 2>/dev/null || stat -f%z "$HERE/$rel" 2>/dev/null)
    code=$(curl -s -o "$TMP" -w "%{http_code}" --max-time 120 "$BASE/$rel")

    if [ "$code" != "200" ]; then
        printf "  ✗ %-34s HTTP %s  (no está en el servidor)\n" "$rel" "$code"
        bad=$((bad+1)); continue
    fi

    lh=$($HASH < "$HERE/$rel" | cut -d' ' -f1)
    rh=$($HASH < "$TMP"       | cut -d' ' -f1)
    remote_size=$(stat -c%s "$TMP" 2>/dev/null || stat -f%z "$TMP" 2>/dev/null)

    if [ "$lh" = "$rh" ]; then
        printf "  ✓ %-34s %8s b\n" "$rel" "$local_size"
        ok=$((ok+1))
    elif [ "$remote_size" != "$local_size" ]; then
        printf "  ✗ %-34s local %s b ≠ remoto %s b  (subida incompleta)\n" \
            "$rel" "$local_size" "$remote_size"
        bad=$((bad+1))
    else
        printf "  ✗ %-34s mismo tamaño, contenido distinto  (versión vieja)\n" "$rel"
        bad=$((bad+1))
    fi
done < <(cd "$HERE" && find . -type f | sort)

echo
if [ $bad -eq 0 ]; then
    echo "✓ $ok archivos, todos coinciden."
else
    echo "✗ $bad de $((ok+bad)) archivos mal. Vuelve a subir (ver README de despliegue)."
    exit 1
fi
