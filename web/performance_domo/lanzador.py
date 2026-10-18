#!/usr/bin/env python3
"""Lanzador visual del ecosistema BiocracyEngine para el domo.

Abre una página (http://localhost:8790) con un botón que corre ./start_ecosystem.sh
y muestra su salida en grande, para proyectarla mientras el motor despierta.
Arranca la cúpula en vivo (DOME_LIVE=1) y carga la voz y la rutina en SuperCollider
(PERFORMANCE=1, ver el bloque para start_sonification.scd en performance.html).

Uso:  python3 web/performance_domo/lanzador.py           (desde la raíz del repositorio)
      python3 lanzador.py --sin-cupula --no-abrir
Solo usa la biblioteca estándar de Python.
"""
import argparse, json, os, signal, subprocess, threading, time, webbrowser
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path

AQUI = Path(__file__).resolve().parent
ap = argparse.ArgumentParser()
ap.add_argument("--repo", default=str(AQUI.parent.parent), help="raíz del repositorio BiocracyEngine")
ap.add_argument("--puerto", type=int, default=8790)
ap.add_argument("--sin-cupula", action="store_true", help="no abrir la ventana de cúpula (DOME_LIVE=0)")
ap.add_argument("--no-abrir", action="store_true", help="no abrir el navegador al empezar")
args = ap.parse_args()
REPO = Path(args.repo).resolve()
SCRIPT = REPO / "start_ecosystem.sh"

lineas, cond = [], threading.Condition()
proc = {"p": None, "inicio": None, "fin": None}

def emitir(txt):
    with cond:
        lineas.append(txt.rstrip("\n")); cond.notify_all()

def correr():
    env = dict(os.environ, DOME_LIVE="0" if args.sin_cupula else "1", PERFORMANCE="1", PYTHONUNBUFFERED="1")
    emitir(f"$ ./start_ecosystem.sh   (DOME_LIVE={env['DOME_LIVE']} PERFORMANCE=1)")
    # Grupo propio: al cerrar, el lanzador le manda Ctrl+C a todo el grupo (ver apagar()).
    p = subprocess.Popen(["bash", str(SCRIPT)], cwd=str(REPO), env=env, start_new_session=True,
                         stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
    proc["p"], proc["inicio"] = p, time.time()
    for l in p.stdout: emitir(l)
    p.wait(); proc["fin"] = p.returncode
    emitir(f"·· el ecosistema terminó (código {p.returncode})")

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _json(self, obj, code=200):
        b = json.dumps(obj).encode(); self.send_response(code)
        self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        if self.path in ("/", "/arranque.html", "/guion", "/guion/", "/performance.html"):
            nombre = "arranque.html" if self.path in ("/", "/arranque.html") else "performance.html"
            b = (AQUI / nombre).read_bytes(); self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8"); self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
        elif self.path == "/estado":
            p = proc["p"]; self._json({"corriendo": bool(p and p.poll() is None), "lineas": len(lineas),
                                       "script": SCRIPT.exists(), "repo": str(REPO)})
        elif self.path.startswith("/log"):
            self.send_response(200); self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache"); self.end_headers()
            i = 0
            try:
                while True:
                    with cond:
                        while i >= len(lineas): cond.wait(15)
                        nuevas = lineas[i:]; i = len(lineas)
                    for l in nuevas:
                        self.wfile.write(("data: " + json.dumps(l) + "\n\n").encode())
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                return
        else:
            self.send_error(404)
    def do_POST(self):
        if self.path == "/iniciar":
            if not SCRIPT.exists(): return self._json({"ok": False, "error": f"no encuentro {SCRIPT}"}, 404)
            if proc["p"] and proc["p"].poll() is None: return self._json({"ok": True, "ya": True})
            threading.Thread(target=correr, daemon=True).start(); return self._json({"ok": True})
        self.send_error(404)

def ya_hay_lanzador(puerto):
    """True si en ese puerto responde otro lanzador (no otro programa)."""
    import urllib.request
    try:
        with urllib.request.urlopen(f"http://localhost:{puerto}/estado", timeout=1.5) as r:
            return "corriendo" in json.loads(r.read().decode())
    except Exception:
        return False

srv, puerto = None, args.puerto
for intento in range(10):
    try:
        srv = ThreadingHTTPServer(("127.0.0.1", puerto), H); break
    except OSError:
        if ya_hay_lanzador(puerto):
            url = f"http://localhost:{puerto}/"
            print(f"[lanzador] ya hay un lanzador corriendo en {url} — lo abro en el navegador.")
            if not args.no_abrir: webbrowser.open(url)
            raise SystemExit(0)
        print(f"[lanzador] el puerto {puerto} está ocupado por otro programa; pruebo {puerto + 1}")
        puerto += 1
if srv is None:
    raise SystemExit("[lanzador] no encontré un puerto libre entre "
                     f"{args.puerto} y {puerto}. Usa --puerto con otro número.")
url = f"http://localhost:{puerto}/"
print(f"[lanzador] {url}   repo: {REPO}")
print(f"[lanzador] guion en vivo: {url}guion")
if not args.no_abrir:
    threading.Timer(0.6, lambda: webbrowser.open(url)).start()
def apagar(*_):
    """Cierra el ecosistema como Ctrl+C en su terminal: SIGINT a todo el grupo.
    Un SIGTERM solo a bash no basta: bash espera a eth_sonify.py en primer plano
    antes de correr su cleanup, y si el lanzador se va antes, el cleanup muere
    al escribir en la tubería cerrada (SIGPIPE) y deja vivos sclang, scsynth,
    webpack y el puente. Por eso el lanzador sigue leyendo hasta que el script acaba."""
    p = proc["p"]
    if p and p.poll() is None:
        print("[lanzador] cerrando el ecosistema…", flush=True)
        try: os.killpg(p.pid, signal.SIGINT)
        except ProcessLookupError: pass
        try: p.wait(20)
        except subprocess.TimeoutExpired:
            print("[lanzador] no cerró en 20 s; lo termino", flush=True)
            try: os.killpg(p.pid, signal.SIGTERM)
            except ProcessLookupError: pass
    raise SystemExit(0)

signal.signal(signal.SIGTERM, apagar)
signal.signal(signal.SIGHUP, apagar)        # cerrar la ventana de la terminal
try:
    srv.serve_forever()
except KeyboardInterrupt:
    apagar()
