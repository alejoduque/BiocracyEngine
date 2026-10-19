#!/usr/bin/env python3
"""Asistente de arranque · Biocracia en escucha.

Lo abre ./start_ecosystem.sh antes de lanzar nada, cuando corre en una terminal
(no desde el lanzador ni con WIZARD=0). Pregunta, una pantalla por decisión, con
qué flags arranca el motor, y escribe la respuesta como líneas CLAVE=valor en el
archivo que le pasa el script (--salida), que las carga con «set -a; . archivo».

  python3 asistente.py --salida /tmp/flags     sale con 0 si hay que lanzar, 1 si se canceló
  python3 asistente.py --mostrar               solo dibuja (para ensayar la pantalla)

Recuerda la última elección en .asistente.json, junto a este archivo. Con ella, Enter en la
portada va directo al resumen («como la última vez») y un segundo Enter lanza; p recorre las
preguntas. La portada queda siempre a la vista: a la izquierda de las preguntas, o arriba si la
terminal es angosta, y el lanzamiento cierra con ella a pantalla completa.
Solo la biblioteca estándar (curses).
"""
import argparse, curses, json, locale, math, os, random, subprocess, sys, textwrap, threading, time
from pathlib import Path

AQUI = Path(__file__).resolve().parent
MEMORIA = AQUI / ".asistente.json"
os.environ.setdefault("ESCDELAY", "25")
locale.setlocale(locale.LC_ALL, "")

# ── Lo que hay conectado (se mira mientras corre la portada) ─────────────────
equipo = {"motu": None, "camaras": [], "listo": False}

def mirar_equipo():
    def sp(tipo):
        try:
            return subprocess.run(["system_profiler", tipo], capture_output=True, text=True, timeout=8).stdout
        except Exception:
            return ""
    a = sp("SPAudioDataType")
    equipo["motu"] = "MOTU" in a.upper() if a else None
    cams = []
    for linea in sp("SPCameraDataType").splitlines():
        s = linea.strip()
        if s.endswith(":") and not s.startswith(("Camera", "Model ID", "Unique ID")) and linea.startswith("    ") and not linea.startswith("      "):
            cams.append(s[:-1])
    equipo["camaras"] = cams
    equipo["listo"] = True

# ── Las preguntas ────────────────────────────────────────────────────────────
ARTE = {
    "modo": None,   # se arma en caja(): los bordes tienen que coincidir
    "cupula": [
        "          ·   ✦   ·",
        "     .·´  *     ·   `·.",
        "   ·´   ✦    ·    *    `·",
        "  /   ·    ◯ ojo    ·    \\",
        " ;━━━━━━━━━━━━━━━━━━━━━━━━;",
        "   NDI ▸ BiocracyEngine Cúpula"],
    "syphon": [
        "   domemaster ━━▶ Syphon",
        "      ╭──────╮",
        "      │ ◯◯◯◯ │ ━━▶ MadMapper",
        "      │ ◯◯◯◯ │ ━━▶ OBS",
        "      ╰──────╯ ━━▶ Resolume"],
    "sonido": [
        "   L ◖               ◗ R",
        "         ·  ·  ·",
        "       ·    ◉    ·",
        "         ·  ·  ·",
        "  Ls ◖               ◗ Rs",
        "     MOTU · salidas 3–6"],
    "laser": [
        "            ╲   │   ╱",
        "             ╲  │  ╱",
        "              ╲ │ ╱",
        "               ╲│╱",
        "   ▲ ▲▲ ▲ ▲▲▲ ▲ ▼ ▲▲ ▲ ▲▲▲ ▲",
        "   el bosque real · ILDA"],
    "linternas": [
        "     ✦         ✦      ✦",
        "     ▯    ✦    ▯      ▯   ✦",
        "          ▯       ✦       ▯",
        "     ✦            ▯   ✦",
        "     ▯   ◉ cámara     ▯",
        "     luces contadas: —"],
    "decisiones": [
        "   ○━━┳┳        ○━━┳┳",
        "   LUCES        BOSQUE",
        "   mayoría   +  presencia",
        "",
        "   pasa · no pasa · abierta"],
    "inicio": [
        "      ▶   10 · 9 · 8 · 7 …",
        "",
        "      el bosque entra primero",
        "      la máquina escucha"],
    "grabar": [
        "    ● REC   00:00 → 30:00",
        "    ▁▃▅▇▅▃▁▂▃▅▇▆▅▃▁▃▅▇▅▃▁",
        "    recordings/ · .wav + .session.jsonl",
        "    ./start_ecosystem.sh render last"],
    "terminal": [
        "  === TX 17873 === Note:48",
        "  === TX 17874 === Note:47",
        "  === TX 17875 === Note:47",
        "  ▌"],
}

def caja(lineas, ancho=28):
    return (["┌" + "─" * (ancho + 2) + "┐"] + ["│ " + l.ljust(ancho)[:ancho] + " │" for l in lineas]
            + ["└" + "─" * (ancho + 2) + "┘"])

ARTE["modo"] = caja(["00:00 " + "━" * 15 + "▶ 30:00", "▁▂▃▅▆▇▆▅▃▂▁▂▃▅▇█▇▅▃▂▁▂▁▂▃▅▆▇",
                     "convocar · escuchar", "la propuesta · deliberar", "adjudicar · el bosque"])

def opciones_camara(camaras):
    """Una opción por cámara (por nombre), y la de no abrir el contador."""
    utiles = [n for n in camaras if "Desk View" not in n]
    ops = []
    for n in utiles:
        logi = "C920" in n or "Logitech" in n
        ops.append((f"Contador · {n}"[:34],
                    "La USB Logitech: la que mira al público." if logi else "Otra cámara conectada.",
                    dict(PERF_CONTADOR="C920" if "C920" in n else n)))
    ops.append(("No abrir el contador", "La rutina dice que no pudo contar y sigue.", dict(PERF_CONTADOR="")))
    return ops

def defecto_camara(camaras):
    utiles = [n for n in camaras if "Desk View" not in n]
    return next((i for i, n in enumerate(utiles) if "C920" in n or "Logitech" in n), 0)

def preguntas():
    camaras = equipo["camaras"]
    lista_cam = "; ".join(f"{n}" for n in camaras) if camaras else "no veo ninguna (¿conectada por USB?)"
    motu = equipo["motu"]
    motu_txt = {True: "La MOTU está conectada.", False: "No veo la MOTU: conéctala antes de elegir el cuadrafónico.",
                None: "No pude mirar si la MOTU está conectada."}[motu]
    return [
        dict(id="modo", titulo="LA NOCHE",
             texto="«Biocracia en escucha» dura treinta minutos exactos. La rutina de SuperCollider lleva el reloj: "
                   "cambia los módulos de la cúpula, habla con la voz de la máquina, pide a la cámara que cuente las "
                   "luces del público y compone la base sonora: en cada bloque funde el motor de una configuración a "
                   "otra, sin saltos, con MEZCLA en 1, hasta el silencio de las 30:00. En el ensayo rápido todo pasa "
                   "cinco veces más rápido; las frases y las decisiones duran lo mismo.",
             opciones=[("Función · 30:00 reales", "La noche del domo. El reloj manda: la pieza termina a las 30:00 en punto.", dict(PERFORMANCE="1", PERF_ESCALA="1")),
                       ("Ensayo rápido · ~7:00", "Toda la pieza cinco veces más rápido, para revisar cada paso. Las frases y las decisiones no se acortan, así que el reloj del ensayo se corre con ellas: dura un poco más de seis minutos.", dict(PERFORMANCE="1", PERF_ESCALA="0.2")),
                       ("Solo el motor", "El instrumento sin la rutina ni la voz: para tocar a mano.", dict(PERFORMANCE="0"))]),
        dict(id="cupula", titulo="LA IMAGEN",
             texto="La consola parliament.html puede abrirse en la ventana de cúpula en vivo (Electron). Es la única "
                   "que envía NDI: el domo recibe «BiocracyEngine Cúpula», el domemaster circular, y «BiocracyEngine "
                   "Página», la consola plana. En la ventana de la cúpula el panel MÁQUINA no se ve, pero ejecuta lo que "
                   "pide la rutina. En el navegador normal no hay NDI: es la manera de trabajar en el estudio.",
             opciones=[("Ventana de cúpula · NDI", "La página se abre en Electron y sale por NDI.", dict(DOME_LIVE="1")),
                       ("Navegador", "La página se abre en el navegador, sin NDI.", dict(DOME_LIVE="0"))]),
        dict(id="syphon", titulo="SYPHON",
             texto="Además del NDI, el puente de la cúpula puede publicar el domemaster como servidor Syphon "
                   "«BiocracyEngine Cúpula», para MadMapper, OBS o Resolume en esta misma máquina. Sin node-syphon corre "
                   "en seco. Si los cuadros se cortan publica negro: la cúpula queda oscura, nunca congelada.",
             opciones=[("Sin Syphon", "Solo NDI.", dict(DOME="0")),
                       ("Con Syphon", "Lanza dome-bridge.js (WS 3338).", dict(DOME="1"))]),
        dict(id="sonido", titulo="EL SONIDO DE LA SALA",
             texto="Con la MOTU, las salidas analógicas 3 a 6 llevan el cuadrafónico limpio, L R Ls Rs, a la consola "
                   "del domo, sin la mezcla estéreo del estudio. MEZCLA arranca en 1: cada capa tiene su altura en el "
                   "espectro y su lugar en los cuatro canales; el bosque envuelve los lados y la espalda, GOLPE está en "
                   "el escenario y la voz de la máquina habla desde el frente. " + motu_txt,
             opciones=[("Cuadrafónico a la sala · MOTU", "1_server_config.scd abre las salidas 3–6.", dict(DOME_AUDIO="1")),
                       ("Estéreo del estudio", "La salida estéreo de siempre.", dict(DOME_AUDIO="0"))],
             defecto=0 if motu else 1),
        dict(id="laser", titulo="EL LÁSER",
             texto="El puente láser (ILDA, DAC Helios) proyecta la imagen sobre el bosque real. Sin DAC corre en seco "
                   "y solo escribe en el registro. La cláusula de opacidad vale también aquí: las especies sensibles "
                   "no se proyectan.",
             opciones=[("Sin láser", "No abre el WS 3337.", dict(LASER="0")),
                       ("Con láser", "Lanza laser-bridge.js.", dict(LASER="1"))]),
        dict(id="linternas", titulo="EL VOTO DE LAS LUCES", solo_funcion=True,
             texto="A los 24 minutos votan los humanos con la linterna del teléfono. contar_linternas.py mira al público "
                   "y cuenta las luces: la mediana de tres segundos, para que un reflejo suelto no vote. Los cuadros se "
                   "procesan en memoria; no se guarda ninguna imagen. Al abrirse su ventana, marca la zona del público "
                   "con r y calibra el umbral con + y − usando linternas reales. La cámara se abre por su nombre, no "
                   "por su número: en macOS el número cambia entre arranques. Cámaras conectadas: " + lista_cam + ".",
             opciones=opciones_camara(camaras), defecto=defecto_camara(camaras)),
        dict(id="decisiones", titulo="LAS DOS DECISIONES", solo_funcion=True,
             texto="Dos veces la rutina espera a la máquina: la lectura del quórum (minuto 4) y la llave del bosque "
                   "(minuto 26). Decide quien tenga el panel MÁQUINA de la consola: Claude in Chrome, o una persona. "
                   "Si nadie decide a tiempo, la rutina sigue con lo que el bosque dijo en la lectura. Regla de dos "
                   "llaves: la propuesta pasa solo con mayoría de luces y bosque presente; si el bosque calla, queda "
                   "abierta. Basta una vocalización y un lugar que la escuche.",
             opciones=[("Esperar 30 s a la máquina", "La espera de siempre.", dict(PERF_ESPERA="30")),
                       ("Esperar 60 s", "Más margen si Claude in Chrome tarda. En la función, la lectura del minuto 4 espera lo que quepa antes del minuto 5 (unos 29 s): el reloj no se corre.", dict(PERF_ESPERA="60")),
                       ("Sin espera · decide la lectura", "Dos segundos y sigue con el valor por defecto.", dict(PERF_ESPERA="2"))]),
        dict(id="inicio", titulo="EL COMIENZO", solo_funcion=True,
             texto="La rutina puede empezar sola: cuando la cúpula esté conectada al puente, esta terminal cuenta diez "
                   "segundos en grande y la pieza empieza en el bosque, módulo F. Mientras tanto suena la antesala: el "
                   "bosque bajo, sin nada más. O puede esperar el ▶ Iniciar rutina del panel MÁQUINA.",
             opciones=[("Empieza sola · cuenta de 10 s", "cuenta_regresiva.py envía /rutina/iniciar.", dict(PERF_AUTO="1")),
                       ("Espera el ▶ del panel", "Empieza cuando alguien la inicie.", dict(PERF_AUTO="0"))]),
        dict(id="grabar", titulo="LA GRABACIÓN", solo_funcion=True,
             texto="La función puede quedar grabada: REC al primer segundo y alto al llegar al silencio de las 30:00. "
                   "El WAV y su .session.jsonl quedan en recordings/; con ellos «./start_ecosystem.sh render last» hace "
                   "el video 4096 para el domo. El render no corre durante la función: compite con ella.",
             opciones=[("Grabar la función", "~startRecording al empezar, ~stopRecording a las 30:00.", dict(PERF_REC="1")),
                       ("No grabar", "", dict(PERF_REC="0"))]),
        dict(id="final", titulo="AL TERMINAR", solo_funcion=True,
             texto="Cuando la pieza llega al silencio de las 30:00, el ecosistema puede cerrarse solo: veinte segundos "
                   "después se cierran la cúpula, la consola, SuperCollider, el contador y su cámara, como un Ctrl+C en "
                   "esta terminal. O puede quedar todo abierto. En cualquier momento, Ctrl+C aquí cierra todo, y "
                   "«./start_ecosystem.sh apagar» lo cierra desde otra terminal.",
             opciones=[("Cerrar todo al terminar", "cuenta_regresiva.py espera el fin y cierra el grupo entero.", dict(PERF_CERRAR="1")),
                       ("Dejar todo abierto", "Para seguir tocando a mano después de la pieza.", dict(PERF_CERRAR="0"))]),
        dict(id="terminal", titulo="ESTA TERMINAL",
             texto="Mientras el motor despierta, esta terminal se puede proyectar en el domo (NDI Screen Capture o la "
                   "entrada de video) hasta que aparezca la cúpula. Puede mostrar cada transacción de Ethereum que entra "
                   "al motor: decenas de líneas por segundo, el flujo de la cadena como texto.",
             opciones=[("Solo los pasos del arranque", "", dict(ETH_VERBOSE="0")),
                       ("Mostrar las transacciones", "ETH_VERBOSE=1 en eth_sonify.py.", dict(ETH_VERBOSE="1"))]),
    ]

# ── Dibujo ───────────────────────────────────────────────────────────────────
C = {}

def colores():
    curses.start_color()
    try: curses.use_default_colors(); fondo = -1
    except curses.error: fondo = curses.COLOR_BLACK
    rico = curses.COLORS >= 256
    def par(n, fg256, fg8, bg=None):
        curses.init_pair(n, fg256 if rico else fg8, fondo if bg is None else bg)
        return curses.color_pair(n)
    C["ambar"] = par(1, 208, curses.COLOR_YELLOW)
    C["verde"] = par(2, 71, curses.COLOR_GREEN)
    C["hoja"]  = par(3, 22, curses.COLOR_GREEN)
    C["cian"]  = par(4, 109, curses.COLOR_CYAN)
    C["gris"]  = par(5, 244, curses.COLOR_WHITE)
    C["blanco"] = par(6, 255, curses.COLOR_WHITE) | curses.A_BOLD
    C["rojo"]  = par(7, 167, curses.COLOR_RED)
    C["barra"] = par(8, 16, curses.COLOR_BLACK, 208 if rico else curses.COLOR_YELLOW)
    C["sel"]   = par(9, 16, curses.COLOR_BLACK, 71 if rico else curses.COLOR_GREEN)
    C["tenue"] = par(10, 238, curses.COLOR_WHITE)

def pon(w, y, x, s, a=0):
    h, ww = w.getmaxyx()
    if y < 0 or y >= h or x >= ww: return
    if x < 0: s, x = s[-x:], 0
    s = s[: max(0, ww - x - (1 if y == h - 1 else 0))]
    try: w.addstr(y, x, s, a)
    except curses.error: pass

TITULO = [
    "█▄▄ █ █▀█ █▀▀ █▀█ ▄▀█ █▀▀ █ ▄▀█",
    "█▄█ █ █▄█ █▄▄ █▀▄ █▀█ █▄▄ █ █▀█",
    "",
    "█▀▀ █▄ █   █▀▀ █▀ █▀▀ █ █ █▀▀ █ █ ▄▀█",
    "██▄ █ ▀█   ██▄ ▄█ █▄▄ █▄█ █▄▄ █▀█ █▀█",
]

def bosque(ancho, semilla=7):
    r = random.Random(semilla)
    return "".join(r.choice("▲▲▲▴▴^ ▲▲") for _ in range(ancho))

def onda(ancho, fase):
    bloques = "▁▂▃▄▅▆▇█"
    return "".join(bloques[int((math.sin(i * 0.23 + fase) * 0.5 + 0.5) * (0.4 + 0.6 * abs(math.sin(i * 0.051 + fase * 0.3))) * 7.99)] for i in range(ancho))

class Cielo:
    """Estrellas dentro de la cúpula que titilan."""
    def __init__(self, n=90):
        self.e = [(random.random(), random.random(), random.random()) for _ in range(n)]
    def dibujar(self, w, y0, alto, x0, ancho, t, hueco=None):
        cx = x0 + ancho / 2
        for fy, fx, f in self.e:
            fila = int(fy * alto)
            mitad = ancho / 2 * math.sqrt(max(0.0, 1 - (1 - fila / max(1, alto)) ** 2))
            x = int(cx + (fx * 2 - 1) * mitad)
            if hueco and hueco[0] <= y0 + fila <= hueco[1] and hueco[2] <= x <= hueco[3]:
                continue   # el título queda limpio, como proyectado en la cúpula
            b = math.sin(t * (1.5 + f * 3) + f * 40)
            ch, a = ("✦", C["blanco"]) if b > 0.92 else ("*", C["ambar"]) if b > 0.6 else ("·", C["gris"]) if b > -0.2 else ("·", C["tenue"])
            pon(w, y0 + fila, x, ch, a)
        # el borde de la cúpula
        for fila in range(alto + 1):
            mitad = ancho / 2 * math.sqrt(max(0.0, 1 - (1 - fila / max(1, alto)) ** 2))
            pon(w, y0 + fila, int(cx - mitad) - 1, "(" if fila > alto * 0.6 else "·", C["cian"])
            pon(w, y0 + fila, int(cx + mitad) + 1, ")" if fila > alto * 0.6 else "·", C["cian"])

FRASES = [("Domo del Planetario de Bogotá · 21 de octubre de 2026 · treinta minutos sin palabras humanas", "blanco"),
          ("Un Parlamento de lo Vivo decide si se instalan más AudioMoth y cámaras en la Reserva Manakai.", "gris"),
          ("Votan las especies con su presencia. Votan los humanos con la luz. La máquina no vota: lee, simula y ejecuta.", "gris")]

def dibujar_portada(w, cielo, t, pie=()):
    """La portada en la ventana (o el panel) w: la cúpula con estrellas, el título, el bosque, la onda
    y, si caben, las frases y el pie (líneas (texto, color)). Se adapta al alto y al ancho que tenga."""
    h, ancho = w.getmaxyx()
    anchura = max(10, min(ancho - 6, 96))
    x0 = (ancho - anchura) // 2
    frases = [(l, C[a]) for f, a in FRASES for l in textwrap.wrap(f, anchura)]
    pies = [(l, C[a] if isinstance(a, str) else a) for f, a in pie for l in (textwrap.wrap(f, anchura) or [""])]
    # filas fuera de la cúpula: título que asoma (2), bosque, onda, hueco, frases, hueco, pie
    fijo = 4 + (len(frases) + 1 if frases else 0) + (len(pies) + 1 if pies else 0)
    if h - fijo < 6:
        frases, fijo = [], 4 + (len(pies) + 1 if pies else 0)
    alto_cupula = max(4, min(16, h - fijo - 1))
    y0 = max(0, (h - (1 + alto_cupula + fijo)) // 2)
    y = y0 + 1 + alto_cupula - 4
    tw = max(len(l) for l in TITULO)
    cielo.dibujar(w, y0 + 1, alto_cupula, x0, anchura, t,
                  hueco=(y - 1, y + len(TITULO), (ancho - tw) // 2 - 3, (ancho + tw) // 2 + 3))
    for i, linea in enumerate(TITULO):
        pon(w, y + i, (ancho - len(linea)) // 2, linea, C["ambar"] | curses.A_BOLD if i < 2 else C["blanco"])
    y += len(TITULO) + 1
    pon(w, y, x0, bosque(anchura), C["verde"]); y += 1
    pon(w, y, x0, onda(anchura, t * 2.2), C["hoja"]); y += 2
    for s, a in frases:
        pon(w, y, max(0, (ancho - len(s)) // 2), s, a); y += 1
    if frases: y += 1
    for s, a in pies:
        pon(w, min(h - 1, y), max(0, (ancho - len(s)) // 2), s, a); y += 1

def paneles(w):
    """La pantalla partida: la portada siempre a la vista, las preguntas al lado (o debajo si la
    terminal es angosta). Devuelve (portada, preguntas); portada es None si no cabe."""
    h, ancho = w.getmaxyx()
    if ancho >= 112:
        izq = ancho // 2
        for y in range(h):
            pon(w, y, izq, "│", C["tenue"])
        return w.derwin(h, izq, 0, 0), w.derwin(h, ancho - izq - 1, 0, izq + 1)
    if h >= 40:
        arriba = 14
        pon(w, arriba, 0, "─" * ancho, C["tenue"])
        return w.derwin(arriba, ancho, 0, 0), w.derwin(h - arriba - 1, ancho, arriba + 1, 0)
    return None, w

def cuadro(w, cielo, t, dibujar):
    """Un cuadro de la pantalla partida: la portada a un lado y dibujar(panel) al otro."""
    w.erase()
    izq, der = paneles(w)
    if izq is not None:
        dibujar_portada(izq, cielo, t)
    dibujar(der)
    w.touchwin(); w.refresh()

def ultima_vez(recordado):
    cuando = recordado.get("_cuando")
    if not cuando:
        return ""
    try:
        return time.strftime("%d·%m %H:%M", time.strptime(cuando, "%Y-%m-%d %H:%M"))
    except ValueError:
        return cuando

def portada(w, cielo, recordado):
    """La portada a pantalla completa. Devuelve "rapido" (como la última vez), "pasos" o None (salir)."""
    t0 = time.time()
    hay = bool(ultima_vez(recordado))
    w.nodelay(True)
    while True:
        t = time.time() - t0
        w.erase()
        if equipo["listo"]:
            if hay:
                pie = [(f"[ Enter ] como la última vez · {ultima_vez(recordado)}     [ p ] paso a paso     [ q ] salir", "cian")]
            else:
                pie = [("[ Enter ] preparar el arranque     [ q ] salir", "cian")]
        else:
            pie = [("revisando el equipo conectado" + "." * (int(t * 3) % 4), "gris")]
        dibujar_portada(w, cielo, t, pie)
        w.refresh()
        k = tecla(w); w.nodelay(True)
        if equipo["listo"]:
            if k in (10, 13, curses.KEY_ENTER, ord(" ")):
                w.nodelay(False); return "rapido" if hay else "pasos"
            if k in (ord("p"), curses.KEY_RIGHT):
                w.nodelay(False); return "pasos"
        if k in (ord("q"), 27):
            w.nodelay(False); return None
        time.sleep(0.06)

def es_funcion(qs, eleccion):
    modo = next(q for q in qs if q["id"] == "modo")
    return modo["opciones"][eleccion["modo"]][2]["PERFORMANCE"] == "1"

def visibles(qs, eleccion):
    funcion = es_funcion(qs, eleccion)
    return [q for q in qs if funcion or not q.get("solo_funcion")]

def flags_de(qs, eleccion):
    """Los flags de las preguntas que se ven: «solo el motor» no lleva los de la rutina."""
    env = {}
    for q in visibles(qs, eleccion):
        env.update(q["opciones"][eleccion[q["id"]]][2])
    if env.get("PERFORMANCE") == "0":
        env.pop("PERF_ESCALA", None)
    return env

def cabecera(w, texto, derecha=""):
    h, ancho = w.getmaxyx()
    pon(w, 0, 0, " " * ancho, C["barra"])
    pon(w, 0, 2, texto, C["barra"] | curses.A_BOLD)
    pon(w, 0, ancho - len(derecha) - 2, derecha, C["barra"])

def pantalla(w, q, n, total, actual, t):
    h, ancho = w.getmaxyx()
    cabecera(w, "ASISTENTE DE ARRANQUE", f"paso {n} de {total}")
    # barra de pasos
    pon(w, 2, 2, "".join("●" if i < n else "○" for i in range(total)), C["ambar"])
    pon(w, 2, 4 + total * 1, q["titulo"], C["blanco"])
    arte = ARTE.get(q["id"], [])
    lado = ancho >= 104
    ancho_txt = (ancho - 44) if lado else ancho - 6
    texto = textwrap.wrap(q["texto"], max(30, ancho_txt))
    det = q["opciones"][actual][1]
    ancho_det = max(20, ancho - 10)
    angosto = ancho < 84   # las flags no caben junto a cada opción: van con el detalle de la elegida
    alto_det = len(textwrap.wrap(det, ancho_det)) + (1 if angosto else 0)
    # el dibujo solo si cabe: el texto y las opciones van primero
    if not lado and 4 + len(arte) + 1 + len(texto) + 1 + len(q["opciones"]) + 1 + alto_det + 1 > h:
        arte = []
    y = 4
    if not lado:
        for i, l in enumerate(arte):
            pon(w, y + i, 4, l, C["verde"] if i % 2 else C["cian"])
        if arte: y += len(arte) + 1
    else:
        for i, l in enumerate(arte):
            pon(w, 4 + i, ancho - 38, l, C["verde"] if i % 2 else C["cian"])
        pon(w, 4 + len(arte), ancho - 38, onda(32, t * 2), C["hoja"])
    for linea in texto:
        pon(w, y, 4, linea, C["gris"]); y += 1
    y += 1
    def flags(vals):
        return "  ".join(f"{k}={v}" if v != "" else f"{k}=—" for k, v in vals.items())
    for i, (etq, _, vals) in enumerate(q["opciones"]):
        sel = i == actual
        pon(w, y, 4, (" ▸ " if sel else "   ") + f"{i + 1}  {etq}".ljust(36), C["sel"] | curses.A_BOLD if sel else C["blanco"])
        if not angosto:
            pon(w, y, 42, flags(vals), C["ambar"] if sel else C["tenue"])
        y += 1
    y += 1
    for linea in textwrap.wrap(det, ancho_det):
        pon(w, y, 6, linea, C["cian"]); y += 1
    if angosto:
        pon(w, y, 6, flags(q["opciones"][actual][2]), C["ambar"])
    pon(w, h - 1, 2, "↑ ↓ elegir   Enter confirmar   ← volver   q salir", C["gris"])

def resumen(w, qs, eleccion, t, rapido="", cambios=()):
    h, ancho = w.getmaxyx()
    cabecera(w, "LISTO PARA LANZAR", f"como la última vez · {rapido}" if rapido else "")
    env = flags_de(qs, eleccion)
    y = 2
    pon(w, y, 4, "Así arranca el motor:", C["blanco"]); y += 2
    for q in visibles(qs, eleccion):
        etq = q["opciones"][eleccion[q["id"]]][0]
        pon(w, y, 6, q["titulo"].ljust(24), C["gris"])
        pon(w, y, 31, etq, (C["ambar"] | curses.A_BOLD) if q["id"] in cambios else C["verde"]); y += 1
    ids = {q["id"] for q in visibles(qs, eleccion)}
    for txt in (v for k, v in cambios.items() if k in ids):
        for l in textwrap.wrap("⚠ " + txt, ancho - 10):
            pon(w, y, 6, l, C["ambar"]); y += 1
    y += 1
    linea = " ".join(f"{k}={v}" if " " not in v else f"{k}='{v}'" for k, v in env.items() if v != "") + " WIZARD=0 ./start_ecosystem.sh"
    pon(w, y, 4, "Lo mismo, sin el asistente:", C["gris"]); y += 1
    for l in textwrap.wrap(linea, ancho - 8):
        pon(w, y, 6, l, C["ambar"]); y += 1
    y += 1
    pasos = ["nw_wrld · servidor web en 9001", "puente OSC → WebSocket · 3333 → 3334",
             "SuperCollider · motor, voz de la máquina y partitura" if env.get("PERFORMANCE") == "1" else "SuperCollider · el motor",
             "ventana de cúpula · NDI" if env.get("DOME_LIVE") == "1" else "consola en el navegador",
             "Ethereum · la cadena en vivo"]
    if env.get("PERF_CONTADOR"): pasos.insert(4, f"contador de linternas · cámara {env['PERF_CONTADOR']}")
    if env.get("PERF_AUTO") == "1" and env.get("PERFORMANCE") == "1": pasos.append("cuenta regresiva → la rutina empieza sola")
    if env.get("PERF_CERRAR") == "1" and env.get("PERFORMANCE") == "1": pasos.append("al silencio de las 30:00 → todo se cierra solo")
    for i, p in enumerate(pasos):
        pon(w, y, 6, f"{i + 1}. {p}", C["cian"]); y += 1
    pon(w, min(h - 3, y + 1), 4, onda(min(ancho - 8, 80), t * 2), C["hoja"])
    pon(w, h - 1, 2, "Enter lanzar   ← revisar paso a paso   q salir" if rapido else "Enter lanzar   ← volver   q salir", C["blanco"])

def despegue(w, cielo, t0):
    """Cierra con la portada a pantalla completa y la barra de lanzamiento debajo."""
    for n in (3, 2, 1):
        for k in range(10):
            w.erase()
            ancho = w.getmaxyx()[1]
            barra = int((3 - n + k / 10) / 3 * min(ancho - 6, 96))
            dibujar_portada(w, cielo, time.time() - t0,
                            [(f"lanzando en {n}", C["ambar"] | curses.A_BOLD), ("━" * barra or "·", "verde")])
            w.refresh(); time.sleep(0.1)

def tecla(w):
    """getch que entiende las flechas en sus dos formas (ESC [ B y ESC O B):
    solo un Esc suelto cuenta como Esc."""
    k = w.getch()
    if k != 27:
        return k
    w.nodelay(True)
    try:
        k2 = w.getch()
        if k2 in (ord("["), ord("O")):
            k3 = w.getch()
            return {ord("A"): curses.KEY_UP, ord("B"): curses.KEY_DOWN,
                    ord("C"): curses.KEY_RIGHT, ord("D"): curses.KEY_LEFT}.get(k3, -1)
        return 27 if k2 == -1 else k2
    finally:
        w.nodelay(False); w.timeout(120)

def asistente(w, recordado):
    curses.curs_set(0)
    colores()
    w.keypad(True)
    cielo = Cielo()
    modo = portada(w, cielo, recordado)
    if modo is None:
        return None
    qs = preguntas()
    cambios = {}
    def recordar(q):
        # Se recuerda el valor elegido, no su posición: la lista de cámaras cambia con lo que esté
        # conectado, y la posición 0 de ayer puede ser hoy otra cámara.
        r = recordado.get(q["id"])
        if isinstance(r, dict):
            i = next((i for i, o in enumerate(q["opciones"]) if o[2] == r), None)
            if i is not None:
                return i
            d = q.get("defecto", 0)
            if q["id"] == "linternas":
                cambios[q["id"]] = (f"La cámara de la última vez ({r.get('PERF_CONTADOR') or '—'}) no está conectada: "
                                    f"elijo «{q['opciones'][d][0]}».")
            return d
        if isinstance(r, int) and q["id"] != "linternas":
            return min(r, len(q["opciones"]) - 1)
        return q.get("defecto", 0)
    eleccion = {q["id"]: recordar(q) for q in qs}
    rapido = ultima_vez(recordado) if modo == "rapido" else ""
    i = len(visibles(qs, eleccion)) if rapido else 0
    t0 = time.time()
    w.timeout(120)
    while True:
        vis = visibles(qs, eleccion)
        t = time.time() - t0
        if i >= len(vis):
            cuadro(w, cielo, t, lambda p: resumen(p, qs, eleccion, t, rapido, cambios if rapido else {}))
            k = tecla(w)
            if k in (10, 13, curses.KEY_ENTER):
                despegue(w, cielo, t0)
                return {q["id"]: q["opciones"][eleccion[q["id"]]][2] for q in qs}, flags_de(qs, eleccion)
            if k in (curses.KEY_LEFT, curses.KEY_BACKSPACE, 127, 8, ord("b")):
                i = 0 if rapido else len(vis) - 1
                rapido = ""
            if k in (ord("q"), 27): return None
            continue
        q = vis[i]
        cuadro(w, cielo, t, lambda p: pantalla(p, q, i + 1, len(vis), eleccion[q["id"]], t))
        k = tecla(w)
        n = len(q["opciones"])
        if k in (curses.KEY_UP, ord("k")): eleccion[q["id"]] = (eleccion[q["id"]] - 1) % n
        elif k in (curses.KEY_DOWN, ord("j")): eleccion[q["id"]] = (eleccion[q["id"]] + 1) % n
        elif ord("1") <= k <= ord(str(min(9, n))): eleccion[q["id"]] = k - ord("1")
        elif k in (10, 13, curses.KEY_ENTER, curses.KEY_RIGHT): i += 1
        elif k in (curses.KEY_LEFT, curses.KEY_BACKSPACE, 127, 8, ord("b")): i = max(0, i - 1)
        elif k in (ord("q"), 27): return None

def portada_fija():
    """La portada quieta, impresa en la terminal al salir de curses: queda arriba de los pasos
    del arranque mientras el motor despierta."""
    A, V, H, G, B, Cy, R = ("\033[1;38;5;208m", "\033[38;5;71m", "\033[38;5;22m", "\033[38;5;244m",
                            "\033[1;97m", "\033[38;5;109m", "\033[0m")
    try: cols = os.get_terminal_size().columns
    except OSError: cols = 80
    ancho = max(40, min(cols - 4, 72))
    rnd = random.Random(3)
    print()
    estrella = {"·": G, "*": "\033[38;5;208m", "✦": B}
    for fila in range(1, 7):
        mitad = int(ancho / 2 * math.sqrt(1 - (1 - fila / 7) ** 2))
        cielo = "".join((estrella[ch] + ch + R) if ch != " " else " " for ch in (rnd.choice(" " * 16 + "···*✦") for _ in range(2 * mitad)))
        borde = ("(", ")") if fila > 4 else ("·", "·")
        print(" " * (2 + ancho // 2 - mitad - 1) + Cy + borde[0] + R + cielo + Cy + borde[1] + R)
    tw = max(len(l) for l in TITULO)
    for i, l in enumerate(TITULO):
        print(" " * (2 + (ancho - tw) // 2) + (A if i < 2 else B) + l + R)
    print("  " + V + bosque(ancho) + R)
    print("  " + H + onda(ancho, 0.0) + R + "\n")

def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--salida", help="archivo donde escribir las líneas CLAVE=valor")
    ap.add_argument("--mostrar", action="store_true", help="solo dibujar; no escribe nada")
    a = ap.parse_args()
    try:
        recordado = json.loads(MEMORIA.read_text())
        # memorias de antes del atajo: la fecha del archivo
        recordado.setdefault("_cuando", time.strftime("%Y-%m-%d %H:%M", time.localtime(MEMORIA.stat().st_mtime)))
    except Exception: recordado = {}
    threading.Thread(target=mirar_equipo, daemon=True).start()
    r = curses.wrapper(asistente, recordado)
    if r is None:
        print("\033[38;5;244m   Arranque cancelado. Nada se lanzó.\033[0m")
        sys.exit(1)
    eleccion, env = r
    if a.mostrar:
        sys.exit(0)
    try: MEMORIA.write_text(json.dumps({**eleccion, "_cuando": time.strftime("%Y-%m-%d %H:%M")}, indent=1))
    except OSError: pass
    if a.salida:
        # entre comillas simples: un nombre de cámara lleva espacios
        Path(a.salida).write_text("".join(f"{k}='{v}'\n" for k, v in env.items()))
    A, V, G, B, R = "\033[38;5;208m", "\033[38;5;71m", "\033[38;5;244m", "\033[1;97m", "\033[0m"
    if os.environ.get("BIOCRACY_MARCO") == "1":
        sys.exit(0)   # marco.py toma la terminal: la portada queda fija arriba, con los flags
    portada_fija()
    print(f"{A}  ━━━ BIOCRACIA EN ESCUCHA ━━━{R}  {G}{time.strftime('%d·%m·%Y %H:%M')}{R}")
    for k, v in env.items():
        print(f"   {V}{k:<14}{R} {B}{v if v != '' else '—'}{R}")
    print(f"{G}   El motor despierta. Cada paso aparece aquí abajo.{R}\n")
    sys.exit(0)

if __name__ == "__main__":
    main()
