#!/usr/bin/env python3
"""build_composiciones.py — las composiciones del motor para la web.

Lee web/composiciones.json (a mano: qué sesión, qué corte, qué texto), y por
cada entrada:

  1. construye media/audio/<id>.mp3 desde la grabación de recordings/, si está;
  2. mide el corte en la grabación original: nivel medio y centroide;
  3. perfila el mp3 terminado —nivel y centroide cada PASO segundos— para la
     línea de tiempo del escenario.

y escribe media/audio/composiciones.json, que es lo único que lee la página:
botones, tabla y línea de tiempo salen de ahí.

    ./build_composiciones.py                 # construye lo que falte
    ./build_composiciones.py --force         # reconstruye los mp3
    ./build_composiciones.py --proponer recordings/eth_sonification_….wav
                                             # propone un corte para una sesión nueva

Si la grabación de una entrada ya no está (las del 22/09 no existen más en
ninguna máquina), su mp3 se deja como está y sus cifras salen de "cifras" en
el manifiesto: medirlas sobre el mp3 daría el nivel ya normalizado, que no es
el dato.
"""
import argparse, datetime, json, math, re, statistics as st, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REC = HERE.parent / "recordings"
OUT = HERE / "media" / "audio"
MANIFIESTO = HERE / "composiciones.json"
SALIDA = OUT / "composiciones.json"

# El mismo criterio que build_media.sh ha usado siempre para las cinco:
# sonoridad común ENTRE pistas, dinámica intacta DENTRO de cada una. LRA 20 en
# vez de 11: con cortes de cuatro y cinco minutos el rango de sonoridad supera
# 11 LU, y ahí loudnorm abandona el modo lineal y empieza a comprimir —justo
# lo que no se quiere: el arco de la pieza ES su rango.
LUFS, TP, LRA = -16, -1.5, 20
PASO = 2            # segundos por punto del perfil de la línea de tiempo
UMBRAL_SILENCIO = -50.0


def ffmpeg(*args, capture=False):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", *args],
                       capture_output=True, text=True)
    if r.returncode != 0 and not capture:
        sys.exit("ffmpeg falló:\n" + r.stderr[-2000:])
    return r


def canales(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0",
                        "-show_entries", "stream=channels", "-of", "csv=p=0",
                        str(path)], capture_output=True, text=True)
    return int(r.stdout.strip() or 2)


def a_estereo(path):
    """Las sesiones cuadrafónicas salen de PanAz(4): 0 adelante-izquierda,
    1 adelante-derecha, 2 atrás-derecha, 3 atrás-izquierda. -ac 2 no sabe eso
    y trata el cuarto canal como centro trasero; aquí se suma por lado."""
    if canales(path) >= 4:
        return "pan=stereo|c0=c0+c3|c1=c1+c2"
    return "aformat=channel_layouts=stereo"


def perfil(path, ini=None, dur=None, paso=1.0):
    """Nivel (dBFS, RMS) y centroide (Hz) cada `paso` segundos, en mono."""
    sel = []
    if ini is not None:
        sel = ["-ss", str(ini), "-t", str(dur)]
    n = int(48000 * paso)
    af = (f"{a_estereo(path)},pan=mono|c0=0.5*c0+0.5*c1,aresample=48000,"
          f"asetnsamples=n={n}:p=0,"
          "astats=metadata=1:reset=1:measure_overall=RMS_level:measure_perchannel=none,"
          "aspectralstats=win_size=4096:measure=centroid+flux,"
          "ametadata=mode=print:file=-")
    out = ffmpeg(*sel, "-i", str(path), "-af", af, "-f", "null", "-",
                 capture=True).stdout
    filas, cur = [], None
    for line in out.splitlines():
        m = re.match(r"frame:\d+\s+pts:\d+\s+pts_time:([\d.]+)", line)
        if m:
            if cur: filas.append(cur)
            cur = {"t": float(m.group(1)), "rms": -120.0, "cent": 0.0, "flux": 0.0}
            continue
        k, _, v = line.strip().partition("=")
        if cur is None: continue
        if "RMS_level" in k: cur["rms"] = float(v) if "inf" not in v else -120.0
        elif k.endswith(".centroid"): cur["cent"] = float(v)
        elif k.endswith(".flux"): cur["flux"] = float(v)
    if cur: filas.append(cur)
    # aspectralstats re-enmarca a su propia ventana (2048 muestras de salto),
    # así que las filas llegan cada ~43 ms y no cada `paso`: se agrupan aquí
    # por su tiempo. Nivel por potencia media, centroide por mediana.
    cubos = {}
    for x in filas:
        cubos.setdefault(int(x["t"] // paso), []).append(x)
    res = []
    for k in sorted(cubos):
        g = cubos[k]
        p = sum(10 ** (x["rms"] / 10) for x in g) / len(g)
        res.append({"t": k * paso,
                    "rms": 10 * math.log10(p) if p > 0 else -120.0,
                    "cent": st.median(x["cent"] for x in g),
                    "flux": st.mean(x["flux"] for x in g)})
    return res


def potencia_media(filas):
    p = sum(10 ** (f["rms"] / 10) for f in filas) / max(len(filas), 1)
    return 10 * math.log10(p) if p > 0 else -120.0


def cifras_de(filas):
    """Nivel medio y rango de centroide (p10–p90 de ventanas de 10 s que
    suenan: en el silencio el centroide es el del ruido de fondo)."""
    vent = []
    for i in range(0, len(filas), 10):
        s = filas[i:i + 10]
        if potencia_media(s) > -45:
            vent.append(st.median(f["cent"] for f in s))
    vent.sort()
    if vent:
        lo = vent[int(0.1 * (len(vent) - 1))]
        hi = vent[int(0.9 * (len(vent) - 1))]
        cen = f"{round(lo, -1):.0f}–{round(hi, -1):.0f} Hz"
    else:
        cen = "—"
    return {"nivel_dbfs": round(potencia_media(filas), 1), "centroide": cen}


def construir(c, src, dst):
    ini, dur = c["inicio"], c["duracion"]
    fin_in, fin_out = c.get("fundido", [2, 4])
    pre = a_estereo(src)
    fades = []
    if fin_in: fades.append(f"afade=t=in:st=0:d={fin_in}")
    if fin_out: fades.append(f"afade=t=out:st={dur - fin_out}:d={fin_out}")
    cadena = ",".join([pre, "aresample=48000", *fades])
    # Dos pasadas: la primera mide, la segunda aplica las cifras medidas (una
    # sola pasada nivela mal la entrada, ver build_media.sh).
    r = ffmpeg("-ss", str(ini), "-t", str(dur), "-i", str(src), "-af",
               f"{cadena},loudnorm=I={LUFS}:TP={TP}:LRA={LRA}:print_format=json",
               "-f", "null", "-", capture=True)
    m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", r.stderr, re.S)
    if not m:
        sys.exit(f"no pude medir {c['id']}")
    j = json.loads(m.group(0))
    # UNA ganancia para todo el corte, y un limitador que sólo toca los picos.
    #
    # loudnorm en modo lineal exige que la ganancia no empuje los picos sobre
    # TP; con sesiones a -35 LUFS y golpes de bombo cerca de 0 dBFS eso no se
    # cumple, y en cortes largos loudnorm cae en silencio a su modo dinámico
    # —un compresor que aplana justamente el arco de cuatro minutos que se
    # quería mostrar—. Aquí la ganancia es fija y el limitador (ataque 5 ms)
    # recorta sólo los transitorios que la ganancia pasa del techo: la
    # diferencia entre el minuto quieto y el denso queda como se grabó.
    # level=false: sin él, alimiter sube el nivel por su cuenta.
    gan = LUFS - float(j["input_i"])
    techo = 10 ** ((TP - 0.5) / 20)          # medio dB de margen para el mp3
    r = ffmpeg("-ss", str(ini), "-t", str(dur), "-i", str(src), "-af",
               f"{cadena},volume={gan:.2f}dB,"
               f"alimiter=limit={techo:.4f}:attack=5:release=80:level=false",
               "-ar", "48000", "-c:a", "libmp3lame", "-b:a", "128k", "-y", str(dst))
    sobre = float(j["input_tp"]) + gan - (TP - 0.5)
    return f"+{gan:.1f} dB, limitador {max(0, sobre):.1f} dB en picos"


def mmss(s):
    return f"{int(s) // 60}:{int(s) % 60:02d}"


def sesion_de(nombre):
    m = re.search(r"(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})", nombre)
    if not m:
        return {"fecha": "", "hora": ""}
    y, mo, d, h, mi = m.groups()
    return {"fecha": f"{y}-{mo}-{d}", "hora": f"{h}:{mi}"}


def construir_todo(force):
    man = json.loads(MANIFIESTO.read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    salida = []
    for c in man["composiciones"]:
        cid = c["id"]
        src = REC / c["sesion"]
        dst = OUT / f"{cid}.mp3"
        if src.exists() and (force or not dst.exists()):
            modo = construir(c, src, dst)
            print(f"  + {cid}.mp3  {mmss(c['duracion'])}  {modo}")
        elif dst.exists():
            print(f"  = {cid}.mp3")
        else:
            print(f"⚠  falta {c['sesion']} y no hay {cid}.mp3 — la omito")
            continue

        if "cifras" in c:
            cifras = c["cifras"]
        elif src.exists():
            cifras = cifras_de(perfil(src, c["inicio"], c["duracion"]))
        else:
            cifras = {"nivel_dbfs": None, "centroide": "—"}

        p = perfil(dst, paso=PASO)
        dur_real = round(p[-1]["t"] + PASO, 1) if p else c["duracion"]
        s = sesion_de(c["sesion"])
        salida.append({
            "id": cid,
            "label": c.get("label", cid),
            "boton": c.get("boton", True),
            "archivo": f"media/audio/{cid}.mp3",
            "duracion": min(dur_real, c["duracion"]),
            "sesion": {"archivo": c["sesion"], **s},
            "corte": [c["inicio"], c["inicio"] + c["duracion"]],
            "nivel_dbfs": cifras["nivel_dbfs"],
            "centroide": cifras["centroide"],
            "breve": c.get("breve", ""),
            "hace": c.get("hace", ""),
            # Perfil del mp3 TERMINADO, para dibujar: el nivel ya normalizado
            # es lo que se oye, que es lo que la línea de tiempo tiene que
            # mostrar. Enteros, para que el json pese poco.
            "perfil": {
                "paso": PASO,
                "nivel": [max(-90, round(f["rms"])) for f in p],
                "centroide": [round(f["cent"]) for f in p],
            },
        })
        print(f"    {s['fecha']} {s['hora']} · {c['inicio']}–{c['inicio'] + c['duracion']} s"
              f" · {cifras['nivel_dbfs']} dBFS · {cifras['centroide']}")

    SALIDA.write_text(json.dumps({
        "generado": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        "composiciones": salida,
    }, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"{SALIDA.relative_to(HERE)} — {sum(1 for c in salida if c['boton'])} botones")


# ── Proponer un corte ───────────────────────────────────────────────────────
def proponer(path, dmin, dmax):
    """Busca el arco más rico de una sesión, entre dmin y dmax segundos.

    Candidatos cada 5 s. Puntaje: cuánto se mueve el brillo (rango de
    centroide en octavas), cuánto cambia (flujo medio) y que los bordes caigan
    en momentos quietos —un corte en plena subida se oye como corte—. Si la
    sesión se apaga sola, el final natural gana un premio: un final que el
    motor hizo vale más que un fundido puesto encima."""
    f = perfil(Path(path))
    if not f:
        sys.exit("no pude leer la sesión")
    T = len(f)
    suena = [i for i, x in enumerate(f) if x["rms"] > UMBRAL_SILENCIO]
    if not suena:
        sys.exit("la sesión es silencio")
    fin_nat = min(T, suena[-1] + 3)
    med = st.median(x["rms"] for x in f[:fin_nat])

    def borde(i):  # qué tan quieto es el segundo i respecto de la mediana
        s = f[max(0, i - 2):i + 3]
        return max(0.0, (st.mean(x["rms"] for x in s) - med) / 6)

    cands = []
    for L in range(dmin, dmax + 1, 5):
        for a in range(0, max(1, fin_nat - L + 1), 5):
            b = min(a + L, fin_nat)
            seg = f[a:b]
            vent = [st.median(x["cent"] for x in seg[i:i + 10])
                    for i in range(0, len(seg), 10) if potencia_media(seg[i:i + 10]) > -45]
            if len(vent) < 3:
                continue
            octavas = math.log2(max(vent) / max(min(vent), 20))
            flujo = st.mean(x["flux"] for x in seg) * 200
            natural = 0.6 if b >= fin_nat - 1 else 0.0
            score = octavas + flujo + natural - borde(a) - (0 if natural else borde(b))
            cands.append((score, a, b, octavas, flujo, natural))
    if not cands:
        sys.exit(f"la sesión suena {fin_nat} s; no cabe un corte de {dmin} s")
    cands.sort(reverse=True)
    elegidos = []
    for c in cands:  # los tres mejores que no se pisen de más
        if all(abs(c[1] - e[1]) > 30 or abs(c[2] - e[2]) > 30 for e in elegidos):
            elegidos.append(c)
        if len(elegidos) == 3:
            break
    nombre = Path(path).name
    print(f"{nombre}: {T} s, suena hasta {fin_nat} s, nivel mediano {med:.1f} dBFS\n")
    for score, a, b, octv, flujo, nat in elegidos:
        cif = cifras_de(f[a:b])
        print(f"  {a:4d}–{b:4d} s  ({mmss(b - a)})  puntaje {score:.2f}  ·  "
              f"{octv:.1f} oct de brillo  ·  flujo {flujo:.2f}"
              f"{'  ·  final natural' if nat else ''}")
        print(f"             {cif['nivel_dbfs']} dBFS · centroide {cif['centroide']}")
    s, a, b = elegidos[0][:3]
    print("\nentrada para composiciones.json (falta el texto):\n")
    print(json.dumps({"id": "NOMBRE", "sesion": nombre, "inicio": a,
                      "duracion": b - a,
                      "fundido": [2, 0 if b >= fin_nat - 1 else 4],
                      "breve": "", "hace": ""}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--proponer", metavar="SESION.wav")
    ap.add_argument("--min", type=int, default=240)
    ap.add_argument("--max", type=int, default=300)
    a = ap.parse_args()
    if a.proponer:
        proponer(a.proponer, a.min, a.max)
    else:
        construir_todo(a.force)
