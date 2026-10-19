#!/usr/bin/env python3
"""La portada fija arriba de la terminal mientras corre el ecosistema · Biocracia en escucha.

Lo lanza start_ecosystem.sh después del asistente (en una terminal; MARCO=0 lo
apaga). Reserva las primeras filas con una región de desplazamiento (DECSTBM):
la cúpula con sus estrellas, el título, el bosque, la onda y una línea de estado
con el reloj de la rutina. Todo lo demás (puente, ETH, cuenta regresiva) corre
debajo sin taparla.

Cada cuadro sale en una sola escritura, entre guardar y restaurar el cursor, para
no mezclarse con lo que escriben los otros procesos. Al recibir SIGTERM, SIGINT o
SIGHUP sale; la región la devuelve el cleanup del script después del «Adiós», así
la portada queda entera arriba. Ctrl+C no lo cierra: espera al cleanup. Si el
script que lo lanzó desaparece, devuelve la región él mismo y sale.

  python3 marco.py            dibuja hasta que lo cierren
  python3 marco.py --filas    escribe cuántas filas reserva para esta terminal
"""
import math, os, random, shutil, signal, sys, time
from pathlib import Path

AQUI = Path(__file__).resolve().parent
LOG = AQUI.parents[1] / "sclang_log.txt"
sys.path.insert(0, str(AQUI))
from asistente import TITULO, bosque, onda   # noqa: E402  (las mismas piezas que la portada)

AMBAR, BLANCO, GRIS, TENUE = "\033[1;38;5;208m", "\033[1;97m", "\033[38;5;244m", "\033[38;5;238m"
VERDE, HOJA, CIAN, ESTRELLA, R = "\033[38;5;71m", "\033[38;5;22m", "\033[38;5;109m", "\033[38;5;208m", "\033[0m"
FLAGS = ["PERFORMANCE", "PERF_ESCALA", "DOME_LIVE", "DOME", "DOME_AUDIO", "LASER", "PERF_CONTADOR",
         "PERF_ESPERA", "PERF_AUTO", "PERF_REC", "PERF_CERRAR", "ETH_VERBOSE"]
CUPULA = 6   # filas de cielo

def filas(alto):
    """Filas reservadas: completa (cielo, título, bosque, onda, estado, línea), compacta o nada."""
    if alto >= 34:
        return CUPULA + len(TITULO) + 4
    if alto >= 20:
        return len(TITULO) + 3
    return 0

class Marco:
    def __init__(self):
        self.redibujar = True
        self.n = 0
        self.inicio = None      # cuándo empezó la rutina (reloj de pared)
        self.fin = None
        self.estado = "el motor despierta"
        self.pos = 0            # hasta dónde se leyó el log
        self.t0 = time.time()
        self.funcion = os.environ.get("PERFORMANCE") == "1"
        self.padre = os.getppid()

    # ── geometría ──
    def medir(self):
        self.cols, self.alto = shutil.get_terminal_size((100, 40))
        self.n = filas(self.alto)
        self.ancho = max(30, min(self.cols - 4, 72))
        self.x0 = (self.cols - self.ancho) // 2 + 1
        self.completa = self.n == CUPULA + len(TITULO) + 4
        rnd = random.Random(3)
        self.estrellas = []
        if self.completa:
            for fila in range(1, CUPULA + 1):
                mitad = int(self.ancho / 2 * math.sqrt(1 - (1 - fila / (CUPULA + 1)) ** 2))
                izq = self.x0 + self.ancho // 2 - mitad
                for x in range(izq + 1, izq + 2 * mitad):
                    if rnd.random() < 0.16:
                        self.estrellas.append((fila, x, rnd.random(), None))

    def ir(self, fila, col=1):
        return f"\033[{fila};{col}H"

    def estrella(self, t, f):
        b = math.sin(t * (1.2 + f * 2.5) + f * 40)
        return ("✦", BLANCO) if b > 0.93 else ("*", ESTRELLA) if b > 0.6 else ("·", GRIS) if b > -0.3 else ("·", TENUE)

    def entero(self, t):
        """La portada completa en sus filas."""
        s = []
        for fila in range(1, self.n + 1):
            s.append(self.ir(fila) + "\033[2K")
        y = 1
        if self.completa:
            for fila in range(1, CUPULA + 1):
                mitad = int(self.ancho / 2 * math.sqrt(1 - (1 - fila / (CUPULA + 1)) ** 2))
                izq = self.x0 + self.ancho // 2 - mitad
                borde = ("(", ")") if fila > CUPULA - 2 else ("·", "·")
                s.append(self.ir(fila, izq) + CIAN + borde[0] + self.ir(fila, izq + 2 * mitad) + borde[1] + R)
            self.estrellas = [(f, x, ph, None) for f, x, ph, _ in self.estrellas]
            y = CUPULA + 1
        tw = max(len(l) for l in TITULO)
        for i, l in enumerate(TITULO):
            s.append(self.ir(y + i, self.x0 + (self.ancho - tw) // 2) + (AMBAR if i < 2 else BLANCO) + l + R)
        y += len(TITULO)
        if self.completa:
            s.append(self.ir(y, self.x0) + VERDE + bosque(self.ancho) + R)
            y += 1
        self.fila_onda, self.fila_estado = y, y + 1
        s.append(self.ir(y + 2) + TENUE + "─" * self.cols + R)
        return "".join(s)

    def cuadro(self, t):
        """Lo que cambia: estrellas que titilan, la onda y la línea de estado."""
        s = []
        nuevas = []
        for f, x, ph, antes in self.estrellas:
            ch = self.estrella(t, ph)
            if ch != antes:
                s.append(self.ir(f, x) + ch[1] + ch[0])
            nuevas.append((f, x, ph, ch))
        self.estrellas = nuevas
        s.append(self.ir(self.fila_onda, self.x0) + HOJA + onda(self.ancho, t * 1.6) + R)
        s.append(self.ir(self.fila_estado) + "\033[2K" + self.ir(self.fila_estado, self.x0) + self.linea_estado() + R)
        return "".join(s)

    # ── estado de la rutina, del log de SC ──
    def leer_log(self):
        try:
            tam = LOG.stat().st_size
            if tam < self.pos:
                self.pos = 0
            if tam == self.pos:
                return
            with LOG.open("rb") as f:
                f.seek(self.pos)
                nuevo = f.read().decode(errors="ignore")
                self.pos = tam
        except OSError:
            return
        for linea in nuevo.splitlines():
            if "[rutina] " not in linea:
                if "CONTROL BUS SETUP COMPLETE" in linea and not self.funcion:
                    self.estado = "el motor suena · para tocar a mano"
                continue
            txt = linea.split("[rutina] ", 1)[1].strip()
            if txt.startswith(("módulo", "acción")):
                continue
            if txt.startswith("partitura"):
                txt = "antesala · el bosque bajo · espera el comienzo"
            if txt.startswith("rutina en marcha"):
                self.inicio, self.fin = time.time(), None
            if txt.startswith("fin · 30:00"):
                self.fin = time.time()
            self.estado = txt

    def linea_estado(self):
        hora = time.strftime("%H:%M:%S")
        if self.inicio:
            seg = int((self.fin or time.time()) - self.inicio)
            reloj = f"{'■' if self.fin else '▶'} {seg // 60:02d}:{seg % 60:02d} / 30:00"
        else:
            seg = int(time.time() - self.t0)
            reloj = f"○ {seg // 60:02d}:{seg % 60:02d}"
        izq = f"{reloj}  ·  {self.estado}"
        hueco = self.ancho - len(izq) - len(hora)
        if hueco < 2:
            izq = izq[: self.ancho - len(hora) - 3] + "…"
            hueco = 2
        return AMBAR + reloj + R + GRIS + izq[len(reloj):] + " " * hueco + TENUE + hora

    def flags(self):
        partes = [f"{k}={os.environ[k]}" for k in FLAGS if os.environ.get(k)]
        return (GRIS + "  " + "  ".join(partes) + R + "\n") if partes else ""

    # ── terminal ──
    def escribir(self, s):
        try:
            os.write(1, s.encode())
        except OSError:
            self.salir()

    def montar(self, primera):
        self.medir()
        if self.n == 0:
            self.escribir("\0337\033[r\0338")
            return
        t = time.time() - self.t0
        if primera:
            # pantalla limpia, la portada arriba, la región debajo y el cursor en ella
            self.escribir("\033[2J" + self.entero(t) + self.cuadro(t)
                          + f"\033[{self.n + 1};{self.alto}r" + self.ir(self.n + 1) + "\n" + self.flags())
        else:
            self.escribir("\0337" + f"\033[{self.n + 1};{self.alto}r" + self.entero(t) + self.cuadro(t) + "\0338")

    def salir(self, *_):
        # Con el script vivo, la región la devuelve su cleanup después del «Adiós»:
        # así los mensajes del cierre corren debajo y la portada queda entera arriba.
        # Huérfano o con la terminal cerrada, la devuelve él.
        if os.getppid() != self.padre:
            try:
                os.write(1, b"\0337\033[r\0338")
            except OSError:
                pass
        os._exit(0)

    def correr(self):
        # Ctrl+C llega a todo el grupo: el marco sigue hasta que el cleanup lo cierre
        signal.signal(signal.SIGINT, signal.SIG_IGN)
        for sig in (signal.SIGTERM, signal.SIGHUP):
            signal.signal(sig, self.salir)
        signal.signal(signal.SIGWINCH, lambda *_: setattr(self, "redibujar", True))
        self.montar(True)
        self.redibujar = False
        while True:
            time.sleep(0.5)
            if os.getppid() != self.padre:
                self.salir()
            if self.redibujar:
                self.redibujar = False
                self.montar(False)
                continue
            if self.n == 0:
                continue
            self.leer_log()
            self.escribir("\0337" + self.cuadro(time.time() - self.t0) + "\0338")

if __name__ == "__main__":
    if "--filas" in sys.argv:
        print(filas(shutil.get_terminal_size((100, 40)).lines))
        sys.exit(0)
    if not sys.stdout.isatty():
        sys.exit(0)
    Marco().correr()
