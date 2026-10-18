#!/bin/zsh
# Genera las voces de la máquina con las voces del Mac (say) → WAV mono 48 kHz.
# Uso:  ./generar_voces.sh            (voz por defecto: Paulina)
#       VOZ="Mónica" ./generar_voces.sh
#       ./generar_voces.sh --listar  (muestra las voces en español instaladas)
cd "$(dirname "$0")"
if [[ "$1" == "--listar" ]]; then say -v '?' | grep -E 'es_|es-'; exit 0; fi
VOZ="${VOZ:-Paulina}"; RATE="${RATE:-165}"; OUT="voz"
mkdir -p "$OUT"
render() {   # $1 = nombre de archivo, $2 = texto
  say -v "$VOZ" -r "$RATE" -o "$OUT/$1.aiff" "$2" && \
  afconvert -f WAVE -d LEI16@48000 -c 1 "$OUT/$1.aiff" "$OUT/$1.wav" && rm "$OUT/$1.aiff"
}
grep -v '^#' frases.tsv | while IFS=$'\t' read -r id bloque texto; do
  [[ -z "$id" ]] && continue
  printf -v f "v%02d" "$id"; render "$f" "$texto"; echo "$f  $texto"
done
for n in {0..200}; do render "n$n" "$n"; done   # números para el conteo
echo "Listo: $(ls $OUT/*.wav | wc -l | tr -d ' ') archivos en $OUT/ con la voz $VOZ"
