#!/usr/bin/env python3
"""Cuenta las linternas de los teléfonos en la oscuridad del domo y envía el número a SuperCollider.

Instalar una vez:   pip3 install opencv-python python-osc   (y ffmpeg: brew install ffmpeg)
Usar:               python3 contar_linternas.py                    (la Logitech C920, por nombre)
                    python3 contar_linternas.py --camara "MacBook"  (otra, por parte de su nombre)
                    python3 contar_linternas.py --camara 1          (un índice de OpenCV)
                    python3 contar_linternas.py --listar            (las cámaras que hay)

La cámara se elige por NOMBRE: en macOS el número de cada cámara cambia entre
arranques (y OpenCV y ffmpeg no las cuentan en el mismo orden), así que «la 0»
fue a veces la Logitech y a veces la del MacBook. Por nombre, los cuadros llegan
por ffmpeg (avfoundation), que abre el dispositivo que se llama así.

La rutina (23_rutina.scd) le pide contar por OSC: /contar "favor" o "contra" al puerto 57140.
También puedes contar a mano con las teclas.

Teclas en la ventana:
  r  marcar la zona del público (arrastra un rectángulo y pulsa Enter)
  f  contar A FAVOR  (cuenta durante 3 s y envía /votos/favor n)
  c  contar EN CONTRA (cuenta durante 3 s y envía /votos/contra n)
  + / -  subir o bajar el umbral de brillo
  q  salir

Opacidad: los cuadros se procesan en memoria. Nada se graba ni se guarda en disco.
"""
import argparse, re, subprocess, sys, time, statistics, threading
import cv2
import numpy as np
from pythonosc.udp_client import SimpleUDPClient
from pythonosc.dispatcher import Dispatcher
from pythonosc.osc_server import ThreadingOSCUDPServer

ap = argparse.ArgumentParser()
ap.add_argument("--camara", default="C920", help="nombre (o parte) de la cámara, o un índice de OpenCV")
ap.add_argument("--listar", action="store_true", help="muestra las cámaras y sale")
ap.add_argument("--umbral", type=int, default=225, help="brillo mínimo de una linterna (0–255)")
ap.add_argument("--area-min", type=int, default=4)
ap.add_argument("--area-max", type=int, default=4000)
ap.add_argument("--host", default="127.0.0.1")
ap.add_argument("--puerto", type=int, default=57120)
ap.add_argument("--escucha", type=int, default=57140, help="puerto donde la rutina pide contar")
args = ap.parse_args()

def camaras():
    """Las cámaras de video que ve avfoundation, por nombre."""
    r = subprocess.run(["ffmpeg", "-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""],
                       capture_output=True, text=True)
    nombres, en_video = [], False
    for l in r.stderr.splitlines():
        if "video devices" in l: en_video = True; continue
        if "audio devices" in l: break
        m = re.search(r"\[(\d+)\] (.+)$", l)
        if en_video and m and not m.group(2).startswith("Capture screen"):
            nombres.append(m.group(2).strip())
    return nombres

class CamaraFFmpeg:
    """Cuadros BGR de la cámara que se llama así, por un tubo de ffmpeg."""
    def __init__(self, nombre, w=1280, h=720, fps=30):
        self.w, self.h = w, h
        self.p = subprocess.Popen(["ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "avfoundation",
                                   "-framerate", str(fps), "-video_size", f"{w}x{h}", "-pixel_format", "uyvy422",
                                   "-i", nombre, "-f", "rawvideo", "-pix_fmt", "bgr24", "-"],
                                  stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=w * h * 3)
    def read(self):
        n = self.w * self.h * 3
        b = self.p.stdout.read(n)
        if not b or len(b) < n: return False, None
        return True, np.frombuffer(b, np.uint8).reshape(self.h, self.w, 3)
    def release(self):
        self.p.terminate()

if args.listar:
    for n in camaras(): print("  ·", n)
    sys.exit(0)
if str(args.camara).isdigit():
    nombre_cam = f"índice {args.camara} de OpenCV"
    cap = cv2.VideoCapture(int(args.camara))
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280); cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
else:
    hay = camaras()
    elegida = next((n for n in hay if args.camara.lower() in n.lower()), None)
    if elegida is None:
        sys.exit(f"[linternas] no encuentro una cámara que se llame «{args.camara}». Hay: " + "; ".join(hay))
    nombre_cam = elegida
    cap = CamaraFFmpeg(elegida)
print(f"[linternas] cámara: {nombre_cam}")

import signal
def _salir(*_):
    """Al cerrar el ecosistema (SIGINT o SIGTERM), soltar la cámara: si no, el
    ffmpeg que la lee seguiría con la Logitech encendida."""
    try: cap.release()
    except Exception: pass
    try: cv2.destroyAllWindows()
    except Exception: pass
    sys.exit(0)
signal.signal(signal.SIGTERM, _salir)
signal.signal(signal.SIGINT, _salir)
osc = SimpleUDPClient(args.host, args.puerto)
umbral, roi = args.umbral, None
kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))

def contar(frame):
    """Devuelve (n, centros) de manchas brillantes dentro de la zona del público."""
    g = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    if roi is not None:
        x, y, w, h = roi; mask = np.zeros_like(g); mask[y:y+h, x:x+w] = 255; g = cv2.bitwise_and(g, mask)
    g = cv2.GaussianBlur(g, (3, 3), 0)
    _, b = cv2.threshold(g, umbral, 255, cv2.THRESH_BINARY)
    b = cv2.morphologyEx(b, cv2.MORPH_OPEN, kernel)
    n, _, stats, cents = cv2.connectedComponentsWithStats(b)
    ok = [i for i in range(1, n) if args.area_min <= stats[i, cv2.CC_STAT_AREA] <= args.area_max]
    return len(ok), [tuple(map(int, cents[i])) for i in ok]

def conteo_estable(segundos=3.0):
    """Mediana de los conteos durante unos segundos: ignora parpadeos y reflejos sueltos."""
    vals, t0 = [], time.time()
    while time.time() - t0 < segundos:
        ok, fr = cap.read()
        if not ok: break
        vals.append(contar(fr)[0])
    return int(statistics.median(vals)) if vals else 0

# La rutina pide contar: /contar "favor" | "contra"
pedido = {"lado": None}
def _contar(addr, lado="favor", *a):
    pedido["lado"] = "contra" if str(lado).startswith("contra") else "favor"
disp = Dispatcher(); disp.map("/contar", _contar)
srv = ThreadingOSCUDPServer(("127.0.0.1", args.escucha), disp)
threading.Thread(target=srv.serve_forever, daemon=True).start()
print(f"[linternas] escuchando pedidos de la rutina en el puerto {args.escucha}")

ultimo = ""
while True:
    ok, frame = cap.read()
    if not ok:
        print("No hay imagen de la cámara."); break
    n, cents = contar(frame)
    vista = frame.copy()                       # solo para la pantalla del operador
    for c in cents: cv2.circle(vista, c, 10, (0, 160, 255), 2)
    if roi is not None:
        x, y, w, h = roi; cv2.rectangle(vista, (x, y), (x+w, y+h), (255, 255, 255), 1)
    cv2.putText(vista, f"luces ahora: {n}   umbral: {umbral}   {ultimo}", (16, 34),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
    cv2.putText(vista, f"camara: {nombre_cam}", (16, 66), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (160, 160, 160), 1)
    cv2.imshow("Linternas · voto humano", vista)
    k = cv2.waitKey(1) & 0xFF
    if k == ord('q'): break
    elif k == ord('+'): umbral = min(254, umbral + 3)
    elif k == ord('-'): umbral = max(120, umbral - 3)
    elif k == ord('r'):
        r = cv2.selectROI("Linternas · voto humano", frame, False, False)
        roi = tuple(int(v) for v in r) if r[2] > 0 and r[3] > 0 else None
    elif k in (ord('f'), ord('c')) or pedido["lado"]:
        lado = pedido["lado"] or ("favor" if k == ord('f') else "contra")
        pedido["lado"] = None
        m = conteo_estable()
        osc.send_message(f"/votos/{lado}", m)
        ultimo = f"| enviado {lado}: {m}"
        print(f"[votos] {lado}: {m}")
cap.release(); cv2.destroyAllWindows()
