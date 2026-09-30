#!/usr/bin/env python3
"""Masteriza las pistas del disco de Bandcamp a WAV y escribe sus metadatos.

    ./build_bandcamp.py            construye las que falten
    ./build_bandcamp.py --force    las reconstruye todas

Lee album.json (orden, títulos, textos del disco) y toma cada corte de
web/composiciones.json por su id, para que el disco y la web no puedan
disentir sobre dónde empieza y termina una pieza. Una pista que no está en la
web lleva su corte en album.json («sesion», «inicio», «duracion», «hace»).

Pistas con el mismo «grupo» son partes contiguas de una sola sesión: se les
aplica UNA ganancia, medida sobre el tramo entero, para que suenen seguidas
sin salto de nivel en la unión. Con una ganancia por pista la parte quieta
subiría más que la fuerte y la costura se oiría. Las fuentes son los WAV
originales de recordings/, no los mp3 de la web.

Salida, en wav/ (no se versiona, ver .gitignore):
  NN - titulo.wav   24 bit · 48 kHz · estéreo, con título, artista, disco,
                    número de pista, fecha, género y copyright en el bloque
                    INFO del WAV.
Y, versionado, METADATOS.md: lo que hay que pegar en el formulario de
Bandcamp, pista por pista.

La cadena es la de la web (build_composiciones.construir): UNA ganancia fija
hasta -16 LUFS integrados y un limitador que sólo toca picos, para que el
arco de cada sesión llegue como se grabó. Lo único que cambia es el techo:
-1.0 dBTP, sin el medio dB de margen que la web deja para el mp3.
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "web"))
import build_composiciones as bc  # noqa: E402

ALBUM = HERE / "album.json"
OUT = HERE / "wav"
MD = HERE / "METADATOS.md"
TP = -1.0


def nombre_archivo(n, titulo):
    return f"{n:02d} - {titulo}.wav"


def medir_tramo(src, ini, dur):
    """Integrado y pico verdadero de un tramo de la sesión, ya en estéreo."""
    r = bc.ffmpeg("-ss", str(ini), "-t", str(dur), "-i", str(src), "-af",
                  f"{bc.a_estereo(src)},aresample=48000,"
                  f"loudnorm=I={bc.LUFS}:TP={TP}:LRA={bc.LRA}:print_format=json",
                  "-f", "null", "-", capture=True)
    m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", r.stderr, re.S)
    if not m:
        sys.exit(f"no pude medir {src.name} {ini}+{dur}")
    return json.loads(m.group(0))


def masterizar(c, src, dst, tags, gan=None):
    ini, dur = c["inicio"], c["duracion"]
    fin_in, fin_out = c.get("fundido", [2, 4])
    fades = []
    if fin_in: fades.append(f"afade=t=in:st=0:d={fin_in}")
    if fin_out: fades.append(f"afade=t=out:st={dur - fin_out}:d={fin_out}")
    cadena = ",".join([bc.a_estereo(src), "aresample=48000", *fades])
    j = medir_tramo(src, ini, dur)
    if gan is None:
        gan = bc.LUFS - float(j["input_i"])
    techo = 10 ** (TP / 20)
    meta = []
    for k, v in tags.items():
        if v:
            meta += ["-metadata", f"{k}={v}"]
    # -map_metadata -1: sin él el WAV hereda las etiquetas de la sesión
    # (encoder de SuperCollider, fecha de grabación) por encima de las del disco.
    bc.ffmpeg("-ss", str(ini), "-t", str(dur), "-i", str(src), "-af",
              f"{cadena},volume={gan:.2f}dB,"
              f"alimiter=limit={techo:.4f}:attack=5:release=80:level=false",
              "-map_metadata", "-1", *meta,
              "-ar", "48000", "-c:a", "pcm_s24le", "-y", str(dst))
    sobre = float(j["input_tp"]) + gan - TP
    return gan, max(0.0, sobre)


def medir(path):
    """Duración, integrado y pico verdadero del archivo terminado."""
    dur = float(subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(path)], capture_output=True, text=True).stdout)
    r = bc.ffmpeg("-i", str(path), "-af", "ebur128=peak=true", "-f", "null", "-",
                  capture=True)
    i = re.findall(r"I:\s+(-?[\d.]+) LUFS", r.stderr)
    p = re.findall(r"Peak:\s+(-?[\d.]+) dBFS", r.stderr)
    return dur, float(i[-1]) if i else None, float(p[-1]) if p else None


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()

    disco = json.loads(ALBUM.read_text())
    al = disco["album"]
    comps = {c["id"]: c for c in
             json.loads(bc.MANIFIESTO.read_text())["composiciones"]}
    total = len(disco["pistas"])
    OUT.mkdir(exist_ok=True)

    def corte(p):
        if p.get("sesion"):
            return {"id": p.get("titulo", f"pista{p['n']}"), **p}
        # El disco puede cambiar el fundido y el texto de una pieza de la web:
        # «crecida» entra con fundido en la web y sin él aquí, donde sigue a
        # «vigilia» sin costura.
        return {**comps[p["composicion"]],
                **{k: p[k] for k in ("fundido", "hace") if k in p}}

    # Una ganancia por grupo, medida sobre el tramo que cubren sus partes.
    grupos = {}
    for p in disco["pistas"]:
        if p.get("grupo"):
            grupos.setdefault(p["grupo"], []).append(corte(p))
    gan_grupo = {}
    for g, cs in grupos.items():
        t0 = min(c["inicio"] for c in cs)
        t1 = max(c["inicio"] + c["duracion"] for c in cs)
        gan_grupo[g] = bc.LUFS - float(medir_tramo(bc.REC / cs[0]["sesion"], t0, t1 - t0)["input_i"])
        print(f"  grupo {g}: {t0}–{t1} s, una ganancia de +{gan_grupo[g]:.1f} dB")

    filas = []
    for p in disco["pistas"]:
        n, cid = p["n"], p.get("composicion") or p.get("sesion")
        if not cid:
            filas.append({"n": n, "pendiente": True, **p})
            print(f"  · {n:02d}  pendiente")
            continue
        c = corte(p)
        titulo = p.get("titulo", c.get("label", cid))
        src = bc.REC / c["sesion"]
        dst = OUT / nombre_archivo(n, titulo)
        s = bc.sesion_de(c["sesion"])
        tags = {
            "title": titulo,
            "artist": al["artista"],
            "album_artist": al["artista"],
            "album": al["titulo"],
            "track": f"{n}/{total}",
            "date": al.get("fecha_lanzamiento") or s["fecha"][:4],
            "genre": al.get("genero", ""),
            "copyright": al.get("copyright", ""),
            "comment": f"Sesión del {s['fecha']} {s['hora']} · {c['sesion']}",
        }
        if src.exists() and (a.force or not dst.exists()):
            gan, lim = masterizar(c, src, dst, tags, gan_grupo.get(p.get("grupo")))
            print(f"  + {dst.name}  +{gan:.1f} dB, limitador {lim:.1f} dB en picos")
        elif dst.exists():
            print(f"  = {dst.name}")
        else:
            print(f"⚠  falta {c['sesion']} y no hay {dst.name}")
            filas.append({"n": n, "pendiente": True, "titulo": titulo,
                          "nota": f"falta la sesión {c['sesion']}"})
            continue
        dur, lufs, pico = medir(dst)
        filas.append({"n": n, "titulo": titulo, "archivo": dst.name,
                      "dur": dur, "lufs": lufs, "pico": pico,
                      "tamano": dst.stat().st_size, "comp": c, "sesion": s})

    escribir_md(al, filas)
    print(f"{MD.name} — {sum(1 for f in filas if not f.get('pendiente'))} de {total} pistas listas")


def escribir_md(al, filas):
    L = [
        "# BiocracyEngine en Bandcamp",
        "",
        "Generado por `build_bandcamp.py` desde `album.json` y `web/composiciones.json`;",
        "no se edita a mano. Los WAV están en `bandcamp/wav/` (fuera del repositorio).",
        "",
        "## Disco",
        "",
        "| Campo en Bandcamp | Valor |",
        "|---|---|",
        f"| album name | {al['titulo']} |",
        f"| artist | {al['artista']} |",
        f"| release date | {al.get('fecha_lanzamiento') or '— (por decidir)'} |",
        f"| tags | {', '.join(al.get('etiquetas', []))} |",
        f"| cover | `{al.get('portada', '')}` (1400×1400, el mínimo de Bandcamp) |",
        f"| license | {al.get('licencia') or '— (por decidir: all rights reserved o Creative Commons)'} |",
        "| UPC / catalog number | — (opcionales) |",
        "",
        "**about this album**",
        "",
        al.get("acerca", ""),
        "",
        "**album credits**",
        "",
        al.get("creditos", "").replace("\n", "  \n"),
        "",
        "## Pistas",
        "",
        "| # | Título | Duración | Archivo | Nivel | Pico |",
        "|---|---|---|---|---|---|",
    ]
    for f in filas:
        if f.get("pendiente"):
            L.append(f"| {f['n']} | {f.get('titulo', '(pendiente)')} | — | — | — | {f.get('nota', '')} |")
        else:
            L.append(f"| {f['n']} | {f['titulo']} | {bc.mmss(round(f['dur']))} | `{f['archivo']}` "
                     f"({f['tamano'] / 1e6:.0f} MB) | {f['lufs']} LUFS | {f['pico']} dBFS |")
    L += ["", "Formato de todas: WAV PCM 24 bit, 48 kHz, estéreo. Bandcamp acepta hasta",
          "291 MB por pista.", ""]
    for f in filas:
        L.append(f"### {f['n']:02d} · {f.get('titulo', '(pendiente)')}")
        L.append("")
        if f.get("pendiente"):
            L += [f"Pendiente — {f.get('nota', '')}.", ""]
            continue
        c, s = f["comp"], f["sesion"]
        L += [
            "| Campo en Bandcamp | Valor |",
            "|---|---|",
            f"| track name | {f['titulo']} |",
            f"| track number | {f['n']} |",
            f"| artist | {al['artista']} |",
            "| lyrics | — (instrumental) |",
            "| ISRC | — (opcional) |",
            "",
            "**about this track**",
            "",
            c.get("hace", ""),
            "",
            "**track credits**",
            "",
            f"Sesión del motor BiocracyEngine grabada el {s['fecha']} a las {s['hora']}, "
            f"corte {c['inicio']}–{c['inicio'] + c['duracion']} s "
            f"(`{c['sesion']}`).",
            "",
        ]
    MD.write_text("\n".join(L))


if __name__ == "__main__":
    main()
