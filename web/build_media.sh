#!/bin/bash
# build_media.sh — deriva los medios web desde las fuentes originales.
#
# Las fuentes no viven en este repositorio: las grabaciones son WAV de 4
# canales a 24 bits (220 MB cada una) y los videos son capturas 1080p de
# cámara trampa. Aquí se produce sólo lo que la página sirve, y se produce de
# forma reproducible: borrar web/media/ y volver a correr este script debe dar
# exactamente los mismos archivos.
#
#   ./build_media.sh            # construye lo que falte
#   ./build_media.sh --force    # reconstruye todo
set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
OUT="$HERE/media"
REC="$HERE/../recordings"
CAM="${CAM_DIR:-$HOME/Desktop/CAM 1 Ago 2025}"

FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1

command -v ffmpeg >/dev/null || { echo "❌ falta ffmpeg"; exit 1; }
mkdir -p "$OUT/audio" "$OUT/video"

# ── Audio ───────────────────────────────────────────────────────────────────
# Cinco composiciones, y los cortes no son arbitrarios: salen de medir RMS,
# centroide espectral y flujo segundo a segundo sobre las dos grabaciones. Cada
# una aísla un comportamiento distinto del motor (ver web/index.html, sección
# "Cinco composiciones", donde se publican las cifras).
#
# Normalizadas a una sonoridad común, y aquí sí conviene explicar por qué NO se
# sigue el criterio del corpus.
#
# tools/build_corpus.py aplica una ganancia global y nunca normaliza por clip,
# porque en el archivo el nivel ES el dato: una noche seca callada tiene que
# sonar callada frente a un coro de lluvias. Eso no se traslada a estas cinco.
# Son fragmentos elegidos por quien edita, y su diferencia de nivel no dice nada
# del bosque ni del motor: dice qué minuto se cortó. Medido, esa diferencia era
# de 9 dB (-21.3 LUFS en ascenso contra -30.2 en meseta y retorno), y a -30 LUFS
# una composición sencillamente no se oye en el altavoz de un portátil.
#
# Se normaliza entonces la sonoridad ENTRE pistas y no dentro de ellas: el rango
# dinámico interno —la subida de centroide de ascenso, el flujo de enjambre— es
# justo lo que hay que escuchar y queda intacto.
LOUDNESS_LUFS=-16     # referencia habitual de reproducción web
TRUE_PEAK_DBTP=-1.5   # margen para que el códec con pérdida no rebase 0 dBFS
A="$REC/eth_sonification_20260922_111301.wav"
B="$REC/eth_sonification_20260922_112003.wav"

# nombre : archivo : inicio(s) : duración(s)
AUDIO_SEGMENTS=(
  "lecho:$A:95:60"
  "enjambre:$A:160:60"
  "ascenso:$A:285:60"
  "meseta:$B:165:60"
  "retorno:$B:260:60"
)

for seg in "${AUDIO_SEGMENTS[@]}"; do
  IFS=: read -r name src ss dur <<< "$seg"
  dst="$OUT/audio/$name.mp3"
  if [ -f "$dst" ] && [ $FORCE -eq 0 ]; then echo "  = $name.mp3"; continue; fi
  [ -f "$src" ] || { echo "⚠  falta $(basename "$src") — omito $name"; continue; }
  # -ac 2 baja la mezcla cuadrafónica a estéreo; el modo espacial de 4 canales
  # no sobrevive a un navegador de todos modos.
  #
  # loudnorm en dos pasadas. En una sola pasada el filtro va adivinando la
  # ganancia sobre la marcha y el primer par de segundos queda mal nivelado —
  # que en un fragmento de 60 s es justo la entrada. La primera pasada mide, la
  # segunda aplica las cifras medidas.
  # -hide_banner y NO -v error: loudnorm imprime su JSON a nivel info, así que
  # bajar el log a error lo silencia y la medición sale vacía. Con `set -e` eso
  # además mata el script sin decir nada, que es exactamente lo que pasó.
  meas=$(ffmpeg -hide_banner -ss "$ss" -t "$dur" -i "$src" -ac 2 \
      -af "loudnorm=I=${LOUDNESS_LUFS}:TP=${TRUE_PEAK_DBTP}:LRA=11:print_format=json" \
      -f null /dev/null 2>&1 | tr -d '\n\t ' | grep -o '{"input_i".*}' || true)
  if [ -z "$meas" ]; then echo "⚠  no pude medir $name — lo omito"; continue; fi
  get() { echo "$meas" | grep -o "\"$1\":\"[^\"]*\"" | cut -d'"' -f4; }
  ffmpeg -v error -ss "$ss" -t "$dur" -i "$src" -ac 2 \
    -af "loudnorm=I=${LOUDNESS_LUFS}:TP=${TRUE_PEAK_DBTP}:LRA=11:measured_I=$(get input_i):measured_TP=$(get input_tp):measured_LRA=$(get input_lra):measured_thresh=$(get input_thresh):offset=$(get target_offset):linear=true" \
    -ar 48000 -c:a libmp3lame -b:a 128k -y "$dst"
  echo "  + $name.mp3  ($(du -h "$dst" | cut -f1))"
done

# ── Video ───────────────────────────────────────────────────────────────────
# Seleccionados mirando los 56 clips uno por uno. Dos quedaron fuera a
# propósito: IMAG0001 e IMAG0055 muestran personas reconocibles, y este
# proyecto sostiene que el derecho a no quedar registrado es una función del
# sistema y no un descuido suyo. Aplicarlo sólo al bosque y no a la gente del
# territorio sería exactamente la contradicción que la obra denuncia.
#
# Sin audio (-an): el sonido de la página son las composiciones, y la pista
# AAC de la cámara trampa sólo añadiría peso.
# Sólo DOS de cámara trampa: hydra crea cuatro fuentes (numSources = 4) y las
# otras dos son espectrogramas, más abajo. El ciclo queda alternando lo que la
# cámara vio con lo que el micrófono oyó, en el mismo encuadre.
HERO=(
  "hero-1-pareja:IMAG0030.AVI.mp4"   # dos ocelotes a plena luz, 29/08 06:35
  "hero-3-perfil:IMAG0019.AVI.mp4"   # rosetas de perfil, IR, 18/08 01:33
)
# Los dos del par: misma cámara, mismo día, con 2 minutos de diferencia. Si es
# el mismo individuo es justamente lo que ID_indv se niega a decidir solo.
STRIP=(
  "strip-1-1809:IMAG0038.AVI.mp4"    # 29/08 18:09:50
  "strip-2-1811:IMAG0042.AVI.mp4"    # 29/08 18:11:55
)

encode_video() {
  local name="$1" file="$2" width="$3"
  local dst="$OUT/video/$name.mp4"
  if [ -f "$dst" ] && [ $FORCE -eq 0 ]; then echo "  = $name.mp4"; return; fi
  if [ ! -f "$CAM/$file" ]; then echo "⚠  falta $file — omito $name"; return; fi
  ffmpeg -v error -i "$CAM/$file" -an \
    -vf "scale=$width:-2" -c:v libx264 -preset slow -crf 26 \
    -pix_fmt yuv420p -movflags +faststart -y "$dst"
  echo "  + $name.mp4  ($(du -h "$dst" | cut -f1))"
}

for v in "${HERO[@]}";  do IFS=: read -r n f <<< "$v"; encode_video "$n" "$f" 960; done
for v in "${STRIP[@]}"; do IFS=: read -r n f <<< "$v"; encode_video "$n" "$f" 640; done

# ── Espectrogramas ──────────────────────────────────────────────────────────
# De la galería publicada en etc.altred.xyz, generada por bioacustic-scripts
# desde las grabaciones AudioMoth a 192 kHz.
#
# Se descargan y se guardan AQUÍ en vez de enlazarlos allá por una razón dura:
# etc.altred.xyz no envía cabecera Access-Control-Allow-Origin, y altred.xyz es
# otro origen. WebGL rechaza una textura de origen cruzado sin CORS, así que
# hydra no podría dibujarlos — no es una preferencia, es que no funcionaría.
#
# Los dos elegidos son los extremos del archivo: el coro de insectos del
# atardecer (una pared continua de 2.7 a 9.5 kHz) y el amanecer de dos días
# después (bandas separadas, voces distinguibles).
SPEC_BASE="https://etc.altred.xyz/staticbioacustics"
SPEC=(
  "hero-2-atardecer:20250626_180500"   # 26 jun 2025, 18:05 — coro de insectos
  "hero-4-amanecer:20250628_065900"    # 28 jun 2025, 06:59 — voces individuales
)

for s in "${SPEC[@]}"; do
  IFS=: read -r name stem <<< "$s"
  dst="$OUT/video/$name.mp4"
  if [ -f "$dst" ] && [ $FORCE -eq 0 ]; then echo "  = $name.mp4"; continue; fi
  command -v curl >/dev/null || { echo "⚠  falta curl — omito $name"; continue; }
  tmp=$(mktemp --suffix=.mp4)
  echo "  ↓ $stem.mp4 (~23 MB)…"
  if ! curl -sfL --max-time 300 -o "$tmp" "$SPEC_BASE/$stem.mp4"; then
    echo "⚠  no pude bajar $stem.mp4 — omito $name"; rm -f "$tmp"; continue
  fi
  # El original viene a 1310x720 y 162 fps, que para un espectrograma que se
  # desplaza es absurdo: a 24 fps se ve igual y pesa una fracción. -an quita la
  # pista de audio, que aquí competiría con las composiciones.
  #
  # Y se recorta a 30 de los 55 s. El ciclo de hydra sostiene cada clip 9 s más
  # 2.5 de fundido, así que nunca se ve un clip entero de una vez; los 55 s
  # completos duplicarían el peso de la página sin que nadie los viera. Esto
  # importa: buena parte de quienes deberían poder abrirla están en el
  # territorio, no en una oficina con fibra.
  ffmpeg -v error -t 30 -i "$tmp" -an -r 24 \
    -vf "scale=960:-2" -c:v libx264 -preset slow -crf 30 \
    -pix_fmt yuv420p -movflags +faststart -y "$dst"
  rm -f "$tmp"
  echo "  + $name.mp4  ($(du -h "$dst" | cut -f1))"
done

echo
echo "medios en $OUT — $(du -sh "$OUT" | cut -f1) en total"
