#!/usr/bin/env python3
"""extract_portfolio.py — saca las 20 láminas del portafolio a archivos.

El portafolio publicado en altred.xyz lleva las imágenes embebidas como data:
URIs en base64, que es por lo que esa página pesa 3.4 MB. Aquí se decodifican a
JPEG sueltos, se reescalan para web y se guardan con su pie de foto y la
sección a la que pertenecen, en media/laminas/ y laminas.json.

    python3 extract_portfolio.py                  # descarga y extrae
    python3 extract_portfolio.py port.html        # desde una copia local
"""
import base64
import html
import json
import pathlib
import re
import subprocess
import sys
import urllib.request

URL = "https://altred.xyz/Portafolio_ParlamentoDeLoVivo.html"
HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / "media" / "laminas"
MANIFEST = HERE / "media" / "laminas.json"
WIDTH = 1000  # ancho de destino; el original viene a 1100


def load() -> str:
    if len(sys.argv) > 1:
        return pathlib.Path(sys.argv[1]).read_text(encoding="utf-8", errors="replace")
    print(f"descargando {URL} …")
    with urllib.request.urlopen(URL, timeout=120) as f:
        return f.read().decode("utf-8", errors="replace")


def clean(s: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()


def main() -> int:
    src = load()
    OUT.mkdir(parents=True, exist_ok=True)

    # Las secciones romanas ordenan las láminas en el portafolio; conservarlas
    # es lo que evita que la galería quede como un montón de fotos sueltas.
    # Se registran con su posición en el documento para poder asignar después
    # cada lámina a la última sección que la precede.
    sections = [
        (m.start(), clean(m.group(1)), clean(m.group(2)))
        for m in re.finditer(
            r'<h2[^>]*>(.*?)</h2>\s*(?:<p[^>]*>(.*?)</p>)?', src, re.S)
    ]

    # El class de <figure> varía — "plate", "plate s2", "plate s3" — según el
    # tamaño con que la lámina se maqueta. Exigir class="plate" exacto
    # recuperaba 7 de 20 y las 13 restantes desaparecían sin ruido, que es el
    # peor modo de fallar: el resultado parece correcto, sólo que incompleto.
    plates = list(re.finditer(
        r'<figure[^>]*>\s*<img[^>]+src="data:image/(\w+);base64,([^"]+)"[^>]*>'
        r'\s*<figcaption>\s*<span class="idx">([^<]*)</span>\s*<span>(.*?)</span>',
        src, re.S))

    if not plates:
        print("✗ no encontré ninguna <figure class=\"plate\"> — ¿cambió el portafolio?")
        return 1

    have_ffmpeg = subprocess.run(["which", "ffmpeg"], capture_output=True).returncode == 0
    if not have_ffmpeg:
        print("⚠ sin ffmpeg: guardo los JPEG al tamaño original, sin reescalar")

    items = []
    for m in plates:
        ext, b64, idx, cap = m.group(1), m.group(2), clean(m.group(3)), clean(m.group(4))
        num = (idx.split("/")[0] or str(len(items) + 1)).zfill(2)

        sec = ""
        for pos, title, _ in sections:
            if pos < m.start():
                sec = title
        # "I El territorio" -> "El territorio"
        sec = re.sub(r"^[IVX]+\s+", "", sec)

        raw = base64.b64decode(b64)
        dst = OUT / f"lamina-{num}.jpg"
        if have_ffmpeg:
            tmp = OUT / f".tmp-{num}.{ext}"
            tmp.write_bytes(raw)
            subprocess.run(
                ["ffmpeg", "-v", "error", "-i", str(tmp),
                 "-vf", f"scale={WIDTH}:-2", "-q:v", "4", "-y", str(dst)],
                check=True)
            tmp.unlink()
        else:
            dst.write_bytes(raw)

        items.append({"n": num, "idx": idx, "seccion": sec,
                      "pie": cap, "src": f"media/laminas/lamina-{num}.jpg"})
        print(f"  + lamina-{num}.jpg  {dst.stat().st_size // 1024:>4}K  [{sec}]  {cap[:54]}…")

    MANIFEST.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    total = sum(f.stat().st_size for f in OUT.glob("*.jpg"))
    print(f"\n{len(items)} láminas · {total // 1024 // 1024} MB · manifiesto en {MANIFEST.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
