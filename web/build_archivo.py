#!/usr/bin/env python3
"""build_archivo.py — el corpus entra al escenario: entero, liviano y sonando.

Dos registros pasan a media/archivo/ y a media/archivo.json, que la página lee
para seguir el ciclo de hydra más allá de los cuatro clips fijos:

  cámara   la cámara trampa CAM_02 de la Reserva Manakai, agosto de 2026. La
           fuente es UNA película de 209.6 s (1080p, 10 Mbps, 272 MB) que monta
           las 22 capturas una tras otra. Se corta en sus 22 capturas —todas,
           sin descartar un cuadro— y cada una conserva el sonido que grabó la
           propia cámara.

  bosque   36 grabaciones AudioMoth de 60 s, tres por hora de 18:00 a 05:00: una
           noche entera. El espectrograma que ya existe en corpus/visual/ se
           copia tal cual (no se recodifica) y se le une su propio audio desde
           corpus/audible/, en un solo mp4: imagen y sonido no pueden
           desincronizarse porque viajan en el mismo archivo.

Nada se recorta a fragmentos cortos: cada captura dura lo que duró (7.9–10.7 s)
y cada grabación sus 60 s. Lo que mantiene liviana la página es que ningún
archivo pasa de ~1.5 MB y que la página sólo baja el que va a mostrar.

    python3 build_archivo.py --dry-run
    python3 build_archivo.py
    python3 build_archivo.py --force
    python3 build_archivo.py --corpus OTRO/corpus   # si ../corpus no es el real

Las fuentes se abren sólo para leer. .py no se publica (ver deploy.sh).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import statistics
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "media" / "archivo"
INDEX = HERE / "media" / "archivo.json"

REEL = Path.home() / "Movies" / "camaratrampaAgosto2026.mp4"

# ── Nivel ───────────────────────────────────────────────────────────────────
# UNA ganancia por registro, nunca por clip, y por la misma razón que da
# tools/build_corpus.py: en un archivo de campo el nivel ES el dato. Una noche
# seca callada tiene que sonar callada frente a un coro de lluvia, y la
# captura en que tres pumas pasan junto a la cámara tiene que sonar más fuerte
# que la del mediodía vacío. Normalizar clip a clip borraría justo eso.
#
# Lo que sí hace falta es subir el conjunto: la película de la cámara trampa
# mide −37 LUFS y la mediana de sus capturas −40, y a ese nivel el espectro de
# la página ni se mueve. La ganancia lleva la MEDIANA de cada registro a −23
# LUFS: 7 dB por debajo de las cinco composiciones (−16), que es lo justo para
# un registro de campo al lado de una pieza mezclada. (Medida después de
# publicar, la mediana de la cámara da −25.7 y no −23: no es la ganancia, que
# cae exacta en 20 de 22, sino la lluvia de la captura 2 bajando de la mitad
# alta a la baja por el limitador —ver abajo—.)
#
# Con esa ganancia los picos de algunas piezas rebasan el techo y el limitador
# los recorta. level=0 porque el alimiter, por defecto, renormaliza la salida:
# eso sería otra ganancia por clip entrando por la puerta de atrás.
#
# En casi todas sólo toca picos y el nivel no se mueve (medido: menos de 0.3 dB
# en 20 de las 22 capturas). Hay una excepción que conviene saber: la captura 2,
# lluvia sobre el micrófono de la cámara, ya viene saturada en el original
# (+3.9 dBTP en mono) y ahí las gotas SON el nivel. El limitador le quita 12 dB
# de sonoridad —queda en −30 LUFS en vez de −17.5— y acortar el release no lo
# cambia (probado de 60 a 3 ms: −29.9 a −29.5). La otra salida sería una
# ganancia de registro limitada por esas gotas, unos −6 dB, que dejaría toda la
# cámara en −46 LUFS: muda y con el espectro plano. Los tres pumas (18) pierden
# 2.5 dB por lo mismo, más leve.
#
# El limitador corre a 192 kHz. A 48 kHz sólo ve muestras y deja pasar los
# picos que caen entre ellas: con el techo en −2 dBFS la captura 2 llegaba a
# −0.1 dBTP antes de codificar, y el primer build publicó archivos a +2.5 dBTP.
# Sobremuestreado, antes del AAC todo queda en −2.3 dBTP o menos. El AAC a
# 80 kbps suma hasta 2.2 dB en los coros de insectos más densos, así que lo
# publicado llega como mucho a −0.3 dBTP: por debajo de 0, que es lo que importa
# a un navegador que decodifica en coma flotante. Bajarlo a −1.5 costaría
# 128 kbps (+50 % de peso en audio) o limitar veinte grabaciones más.
TARGET_LUFS = -23.0
CEILING_DBFS = -2.5


def limiter() -> str:
    lim = 10 ** (CEILING_DBFS / 20)
    return (f"aresample=192000,alimiter=limit={lim:.4f}:level=0:latency=1:attack=1:release=60,"
            f"aresample=48000")


# ── La película de la cámara trampa ─────────────────────────────────────────
# Dónde empieza cada captura, en cuadros a 30 fps. No hay forma fiable de
# detectarlo solo: la cámara no se mueve, así que dos capturas nocturnas
# seguidas son casi el mismo cuadro, y el montaje las une con un fundido de uno
# a tres cuadros que ningún detector de escena (scdet) marca por encima del
# ruido. Se encontraron así:
#   1. diferencia cuadro a cuadro sobre la imagen sin la barra inferior;
#   2. cada candidato se confirmó leyendo la barra de la Bushnell —fecha, hora,
#      temperatura— a ambos lados del corte: dentro de una captura el reloj
#      avanza de a un segundo, entre capturas salta horas;
#   3. dos cortes que la diferencia no veía (85.5 s y 123.5 s) salieron de leer
#      la barra cada 0.25 s, y cuatro picos que sí veía (81.1, 89.1, 107.8 y
#      116.1 s) resultaron ser movimiento dentro de una captura —una hoja
#      tapando el lente— y se descartaron.
# Salen 22 capturas, las mismas 22 de corpus/cameratrap.json y en el mismo
# orden: la fecha y la hora leídas en la barra coinciden, minuto a minuto,
# con las de cada clave.
#
#   clave, cuadro inicial, hora en la barra, °C en la barra
REEL_FPS = 30
CAPTURAS = [
    ("ct_08100020_sonidosnoche",               0,    "00:09:21", 25),
    ("ct_08110021_lluviaYaulladores",           300,  "05:53:17", 25),
    ("ct_08120022_pasoavesonidogrillonoche",    579,  "18:46:39", 28),
    ("ct_08140023_ocelote",                     867,  "19:05:56", 27),
    ("ct_08150024_insectos",                    1155, "18:35:27", 28),
    ("ct_08160025_puma",                        1440, "14:56:10", 31),
    ("ct_08160026_puma",                        1725, "14:56:24", 31),
    ("ct_08170027_avegarza",                    2010, "15:14:09", 26),
    ("ct_08180028_mapache",                     2281, "02:32:51", 23),
    ("ct_08180029_ocelote_aulladoresdefondo",   2566, "05:30:46", 23),
    ("ct_08180030",                             2865, "12:40:50", 28),
    ("ct_08180032_aves",                        3150, "12:42:43", 29),
    ("ct_08180035_avequecanta",                 3434, "18:28:34", 27),
    ("ct_08180036_avequecanta2",                3706, "18:29:53", 27),
    ("ct_08190037",                             4005, "05:38:11", 25),
    ("ct_08190038",                             4289, "05:58:53", 25),
    ("ct_08190040",                             4608, "18:34:55", 27),
    ("ct_08200041_3pumas",                      4929, "04:39:20", 25),
    ("ct_08200042_3pumassec",                   5166, "04:39:30", 25),
    ("ct_08200044_sonidosAulladores",           5429, "05:49:21", 25),
    ("ct_08200045_avenegrapasa",                5705, "18:28:35", 27),
    ("ct_08220046_sonidomosca",                 6000, "17:16:22", 25),
]

# El mismo ancho y el mismo CRF de referencia que los clips del escenario
# (build_media.sh, encode_video): estos entran al mismo ciclo de hydra y no
# deben verse peor que los cuatro que ya están. CRF 28 y no 26 porque el ruido
# del infrarrojo nocturno es caro de codificar y no es información.
CAM_WIDTH = 960
CAM_CRF = 28
CAM_AUDIO = ["-c:a", "aac", "-b:a", "80k", "-ac", "1", "-ar", "48000"]
POSTER_WIDTH = 320

# ── La noche del AudioMoth ──────────────────────────────────────────────────
# Las horas en que el corpus tiene grabaciones con audio: de 18:00 a 05:00.
# No es una elección de quien edita, es la programación de la grabadora —y la
# página ya dice por qué eso importa.
NOCHE = [18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5]
POR_HORA = 3

ROL = {
    "nocturnal_voice": "voz nocturna",
    "insect_chorus": "coro de insectos",
    "dusk_chorus_participant": "coro del atardecer",
    "dawn_chorus_participant": "coro del amanecer",
    "community_shift": "cambio de turno",
    "territorial_announcement": "anuncio territorial",
    "activity_to_silence": "de la actividad al silencio",
    "silence_to_activity": "del silencio a la actividad",
}
TEMPORADA = {"seca": "seca", "medio_seco": "medio seco",
             "primeras_lluvias": "primeras lluvias",
             "segundas_lluvias": "segundas lluvias"}


# ── utilidades ──────────────────────────────────────────────────────────────
def run(cmd: list) -> str:
    p = subprocess.run([str(c) for c in cmd], capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"falló: {' '.join(map(str, cmd[:8]))} …\n{p.stderr[-1200:]}")
    return p.stderr


def duration(path: Path) -> float:
    p = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                        "-of", "csv=p=0", str(path)], capture_output=True, text=True)
    return float(p.stdout.strip() or 0)


def frames(path: Path) -> int:
    p = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_packets",
                        "-show_entries", "stream=nb_read_packets", "-of", "csv=p=0", str(path)],
                       capture_output=True, text=True)
    return int(p.stdout.strip())


def loudness(src: Path, ss: float | None = None, t: float | None = None) -> dict:
    """LUFS integrados y pico verdadero, con el mismo loudnorm que build_media.sh.

    -hide_banner y NO -v error: loudnorm imprime su JSON a nivel info.

    Se mide en MONO, que es lo que se publica. La bajada a mono va dentro del
    filtro y no como -ac 1: -ac es una opción de salida y se aplica DESPUÉS de
    loudnorm, así que medía la película estéreo —que suma los dos canales y
    marca unos 3 dB más— y la cámara salía 2.5 dB por debajo del objetivo.
    """
    cmd = ["ffmpeg", "-hide_banner", "-nostdin"]
    if ss is not None:
        cmd += ["-ss", f"{ss:.6f}", "-t", f"{t:.6f}"]
    cmd += ["-i", src, "-vn",
            "-af", "aformat=channel_layouts=mono,loudnorm=print_format=json", "-f", "null", "-"]
    err = run(cmd)
    m = re.search(r'\{[^{}]*"input_i"[^{}]*\}', err)
    if not m:
        raise RuntimeError(f"no pude medir {src}")
    j = json.loads(m.group(0))
    return {"i": float(j["input_i"]), "tp": float(j["input_tp"])}


def gain_for(levels: list) -> float:
    return round(TARGET_LUFS - statistics.median(l["i"] for l in levels), 2)


def report(levels: list, g: float, names: list, what: str) -> None:
    over = [(n, l["tp"] + g - CEILING_DBFS) for n, l in zip(names, levels)
            if l["tp"] + g > CEILING_DBFS]
    print(f"  mediana {statistics.median(l['i'] for l in levels):.1f} LUFS → "
          f"ganancia {g:+.2f} dB; el limitador toca {len(over)} {what}"
          + (f", a lo sumo {max(o for _, o in over):.1f} dB: {[n for n, _ in over]}" if over else ""))


def poster(src: Path, dst: Path, at: float) -> None:
    run(["ffmpeg", "-nostdin", "-y", "-loglevel", "error", "-ss", f"{at:.3f}", "-i", src,
         "-frames:v", "1", "-vf", f"scale={POSTER_WIDTH}:-2", "-q:v", "5", dst])


def rel(p: Path) -> str:
    return p.relative_to(HERE).as_posix()


def resolve_corpus(arg: str | None) -> Path:
    """El corpus real, no los marcadores vacíos que origin/main lleva en corpus/.

    En main, corpus/audible/*.flac son archivos de cero bytes (ver
    corpus/PLACEHOLDERS.md). Leerlos daría 36 grabaciones mudas sin ningún
    error, así que se comprueba y se dice dónde buscar. En la rama de trabajo,
    ../corpus es el real y no hace falta pasar nada.
    """
    for cand in [arg, os.environ.get("BIOCRACY_CORPUS"), HERE.parent / "corpus"]:
        if not cand:
            continue
        c = Path(cand).expanduser().resolve()
        flacs = list((c / "audible").glob("*.flac"))
        if (c / "visual" / "index.json").exists() and flacs and all(f.stat().st_size for f in flacs[:20]):
            return c
    sys.exit("❌ no encuentro un corpus con audio real (corpus/audible vacío o sin visual/).\n"
             "   Pasa --corpus RUTA o BIOCRACY_CORPUS=RUTA — el directorio del repositorio\n"
             "   donde corriste tools/build_corpus.py y tools/build_visual.py.")


# ── cámara ──────────────────────────────────────────────────────────────────
def camara_items(corpus: Path, reel_len: float) -> list:
    meta = {}
    ct = corpus / "cameratrap.json"
    if ct.exists():
        meta = {c["key"]: c for c in json.loads(ct.read_text())["clips"]}
    items = []
    for n, (key, f0, hora, temp) in enumerate(CAPTURAS):
        start = f0 / REEL_FPS
        end = CAPTURAS[n + 1][1] / REEL_FPS if n + 1 < len(CAPTURAS) else reel_len
        c = meta.get(key, {})
        esp = []
        for s in c.get("species", []):
            if s.get("rank") == "geophony":
                esp.append(s["common"])
            elif s.get("count", 1) > 1:
                nombre = s["common"] if s["common"].endswith("s") else s["common"] + "s"
                esp.append(f"{s['count']} {nombre}")
            else:
                esp.append(s["common"])
        mm, dd = key[3:5], key[5:7]
        pie = f"CAM_02 · {dd}/{mm}/2026 {hora} · {temp} °C"
        items.append({
            "key": key, "n": n + 1, "inicio_s": round(start, 3), "fin_s": round(end, 3),
            "fecha": f"2026-{mm}-{dd}", "hora": hora, "temp_c": temp,
            "diel": c.get("diel", ""), "especies": esp,
            "pie": pie + (" · " + ", ".join(esp) if esp else ""),
            "video": OUT / "camara" / f"{key}.mp4",
            "poster": OUT / "camara" / f"{key}.jpg",
        })
    return items


def build_camara(reel: Path, items: list, force: bool, dry: bool) -> float | None:
    todo = force or not all(i["video"].exists() for i in items)
    print(f"\ncámara · {reel.name} → {len(items)} capturas"
          f"{'' if todo else ' (ya están; --force para rehacer)'}")
    for i in items:
        print(f"  {i['n']:2d}  {i['inicio_s']:7.3f}–{i['fin_s']:7.3f}  "
              f"{i['fin_s'] - i['inicio_s']:5.2f} s  {i['pie']}")
    print(f"  suma {sum(i['fin_s'] - i['inicio_s'] for i in items):.3f} s de {items[-1]['fin_s']:.3f}")
    if not todo:
        prev = json.loads(INDEX.read_text()) if INDEX.exists() else {}
        return prev.get("nivel", {}).get("camara_db")
    print("  midiendo sonoridad por captura …")
    with ThreadPoolExecutor(6) as ex:
        levels = list(ex.map(lambda i: loudness(reel, i["inicio_s"], i["fin_s"] - i["inicio_s"]), items))
    g = gain_for(levels)
    report(levels, g, [i["n"] for i in items], "capturas")
    if dry:
        return g

    (OUT / "camara").mkdir(parents=True, exist_ok=True)
    total = frames(reel)

    # Una captura por proceso, contando CUADROS y no segundos: cada pieza
    # empieza en su cuadro de la tabla y lleva exactamente los cuadros hasta
    # el siguiente, así que juntas son la película entera, sin hueco ni
    # solape. El primer intento fue un solo pase con el segmentador de ffmpeg
    # (-f segment + -force_key_frames en los mismos instantes) y cortó donde
    # quiso: piezas de 18 s con dos capturas dentro y otras de medio segundo.
    #
    # -ss va medio cuadro antes del cuadro de corte: con la búsqueda exacta
    # ffmpeg descarta todo lo anterior al instante pedido, y pedir justo
    # f/30 deja la decisión a un redondeo de coma flotante. El video se acota
    # sólo por número de cuadros y el audio sólo con su propio atrim, que
    # descuenta ese medio cuadro: un -t global, además de los cuadros, se
    # comía el último cuadro de catorce de las veintidós piezas, porque el
    # muxer desplaza el primero y el último cae justo sobre el límite.
    def one(n: int) -> None:
        i, f0 = items[n], CAPTURAS[n][1]
        f1 = CAPTURAS[n + 1][1] if n + 1 < len(CAPTURAS) else total
        ss = max(0.0, (f0 - 0.5) / REEL_FPS)
        lead = f0 / REEL_FPS - ss
        # La última pieza lleva el audio hasta el final del archivo: la pista
        # de sonido de la película dura 0.12 s más que su último cuadro.
        # Ahí no se acota el video: termina solo con el archivo, y -frames:v
        # cerraría la salida entera con el último cuadro, cola de audio incluida.
        last = n + 1 == len(CAPTURAS)
        t = i["fin_s"] - f0 / REEL_FPS if last else (f1 - f0) / REEL_FPS
        run(["ffmpeg", "-nostdin", "-y", "-loglevel", "error", "-ss", f"{ss:.6f}", "-i", reel,
             "-map", "0:v:0", "-map", "0:a:0", *([] if last else ["-frames:v", str(f1 - f0)]),
             "-vf", f"scale={CAM_WIDTH}:-2", "-c:v", "libx264", "-preset", "slow",
             "-crf", str(CAM_CRF), "-pix_fmt", "yuv420p",
             "-af", f"atrim=start={lead:.6f}:duration={t:.6f},asetpts=PTS-STARTPTS,"
                    f"aformat=channel_layouts=mono,volume={g}dB,{limiter()}", *CAM_AUDIO,
             "-movflags", "+faststart", i["video"]])
        poster(i["video"], i["poster"], (f1 - f0) / REEL_FPS / 3)

    with ThreadPoolExecutor(4) as ex:
        list(ex.map(one, range(len(items))))
    return g


# ── bosque ──────────────────────────────────────────────────────────────────
def pick_night(corpus: Path) -> list:
    """36 grabaciones, tres por hora, elegidas siempre igual.

    Una misma grabación da a veces dos eventos con la misma ventana de 60 s
    (20250111_222400_001 y _003): son el mismo minuto y se oirían dos veces,
    así que de cada grabación entra uno solo. Entre las demás se prefiere, en
    este orden: la estación que todavía no está en esa hora (así cada hora
    suena en seca y en medio seco), el rol que todavía no está en esa hora, la
    noche menos usada (si no, cinco de las seis horas secas salían del 11 de
    enero), el rol menos usado en toda la noche (así entran los raros: el coro
    del amanecer, los dos cambios de actividad) y la confianza del detector.
    Sin azar: correrlo dos veces da la misma noche.
    """
    clips = json.loads((corpus / "manifest.json").read_text())["clips"]
    ok = [c for c in clips
          if (corpus / "audible" / f"{c['key']}.flac").exists()
          and (corpus / "visual" / "audiomoth" / f"{c['key']}.mp4").exists()]
    used_roles: dict = {}
    used_dates: dict = {}
    used_recs: set = set()
    night = []
    for h in NOCHE:
        pool = sorted((c for c in ok if c["hour"] == h), key=lambda c: c["key"])
        chosen: list = []
        while len(chosen) < POR_HORA:
            pool = [c for c in pool if c["key"][:15] not in used_recs]
            if not pool:
                break
            seasons = {c["temporada"] for c in chosen}
            roles = {c["role"] for c in chosen}
            best = min(pool, key=lambda c: (c["temporada"] in seasons, c["role"] in roles,
                                            used_dates.get(c["key"][:8], 0),
                                            used_roles.get(c["role"], 0),
                                            -(c.get("confidence") or 0), c["key"]))
            pool.remove(best)
            chosen.append(best)
            used_recs.add(best["key"][:15])
            used_dates[best["key"][:8]] = used_dates.get(best["key"][:8], 0) + 1
            used_roles[best["role"]] = used_roles.get(best["role"], 0) + 1
        chosen.sort(key=lambda c: (c["key"][9:15], c["key"][:8]))   # hora del reloj
        night += chosen
    return night


def bosque_items(corpus: Path) -> list:
    items = []
    for c in pick_night(corpus):
        k = c["key"]
        hora = f"{k[9:11]}:{k[11:13]}"
        d = datetime.strptime(k[:8], "%Y%m%d")
        items.append({
            "key": k, "fecha": d.strftime("%Y-%m-%d"), "hora": hora, "h": c["hour"],
            "temporada": TEMPORADA.get(c["temporada"], c["temporada"]),
            "rol": ROL.get(c["role"], c["role"].replace("_", " ")),
            "dominio": c.get("domain", ""),
            "temp_c": c.get("temperature_c"),
            "pie": f"AudioMoth · {d.strftime('%d/%m/%Y')} {hora} · "
                   f"{TEMPORADA.get(c['temporada'], c['temporada'])} · "
                   f"{ROL.get(c['role'], c['role'])}"
                   + (f" · {c['temperature_c']:.0f} °C" if c.get("temperature_c") is not None else ""),
            "flac": corpus / "audible" / f"{k}.flac",
            "spec": corpus / "visual" / "audiomoth" / f"{k}.mp4",
            "spec_jpg": corpus / "visual" / "audiomoth" / f"{k}.jpg",
            "video": OUT / "bosque" / f"{k}.mp4",
            "poster": OUT / "bosque" / f"{k}.jpg",
        })
    return items


def build_bosque(items: list, force: bool, dry: bool) -> float | None:
    todo = force or not all(i["video"].exists() for i in items)
    print(f"\nbosque · {len(items)} grabaciones de 60 s, {POR_HORA} por hora"
          f"{'' if todo else ' (ya están; --force para rehacer)'}")
    for i in items:
        print(f"  {i['hora']}  {i['fecha']}  {i['temporada']:<10}  {i['rol']}")
    if not todo:
        prev = json.loads(INDEX.read_text()) if INDEX.exists() else {}
        return prev.get("nivel", {}).get("bosque_db")
    print("  midiendo sonoridad …")
    with ThreadPoolExecutor(6) as ex:
        levels = list(ex.map(lambda i: loudness(i["flac"]), items))
    g = gain_for(levels)
    report(levels, g, [i["hora"] for i in items], "grabaciones")
    if dry:
        return g

    (OUT / "bosque").mkdir(parents=True, exist_ok=True)

    def one(i: dict) -> None:
        # -c:v copy: el espectrograma de corpus/visual ya está a 480 px y
        # CRF 30; recodificarlo sólo perdería calidad. Se le suma su propio
        # audio y nada más.
        run(["ffmpeg", "-nostdin", "-y", "-loglevel", "error",
             "-i", i["spec"], "-i", i["flac"],
             "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy",
             "-af", f"aformat=channel_layouts=mono,volume={g}dB,{limiter()}", *CAM_AUDIO,
             "-movflags", "+faststart", i["video"]])
        shutil.copyfile(i["spec_jpg"], i["poster"])

    with ThreadPoolExecutor(6) as ex:
        list(ex.map(one, items))
    return g


# ── índice ──────────────────────────────────────────────────────────────────
def write_index(cam: list, bos: list, g_cam, g_bos, reel: Path) -> None:
    def clean(i: dict, drop: tuple) -> dict:
        o = {k: v for k, v in i.items() if k not in drop}
        o["video"], o["poster"] = rel(i["video"]), rel(i["poster"])
        o["duration_s"] = round(duration(i["video"]), 3)
        o["bytes"] = i["video"].stat().st_size
        return o

    cam = [clean(i, ()) for i in cam if i["video"].exists()]
    bos = [clean(i, ("flac", "spec", "spec_jpg", "h")) for i in bos if i["video"].exists()]
    doc = {
        "generated": datetime.now().astimezone().isoformat(timespec="seconds"),
        "fuentes": {"camara": reel.name, "bosque": "corpus/visual/audiomoth + corpus/audible"},
        "nivel": {"mediana_lufs": TARGET_LUFS, "techo_dbfs": CEILING_DBFS,
                  "camara_db": g_cam, "bosque_db": g_bos},
        "camara": cam,
        "bosque": bos,
    }
    INDEX.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    total = sum(i["bytes"] for i in cam + bos)
    print(f"\n{rel(INDEX)} — {len(cam)} capturas + {len(bos)} grabaciones, "
          f"{total / 1e6:.1f} MB en video")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--dry-run", action="store_true", help="dice qué haría, no escribe nada")
    ap.add_argument("--force", action="store_true", help="rehace todo")
    ap.add_argument("--corpus", help="directorio corpus/ con audio real (o BIOCRACY_CORPUS)")
    ap.add_argument("--reel", default=str(REEL), help=f"película de la cámara trampa ({REEL})")
    args = ap.parse_args()

    for tool in ("ffmpeg", "ffprobe"):
        if not shutil.which(tool):
            sys.exit(f"❌ falta {tool}")
    corpus = resolve_corpus(args.corpus)
    reel = Path(args.reel).expanduser()
    print(f"corpus  {corpus}\npelícula {reel}")

    cam, g_cam = [], None
    if reel.exists():
        cam = camara_items(corpus, duration(reel))
        g_cam = build_camara(reel, cam, args.force, args.dry_run)
    else:
        print(f"⚠  falta {reel} — omito la cámara")

    bos = bosque_items(corpus)
    g_bos = build_bosque(bos, args.force, args.dry_run)

    if args.dry_run:
        print("\n--dry-run: no se escribió nada.")
        return 0
    write_index(cam, bos, g_cam, g_bos, reel)
    return 0


if __name__ == "__main__":
    sys.exit(main())
