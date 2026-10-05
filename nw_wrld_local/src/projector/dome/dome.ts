// dome.ts — the fulldome viewport (key D)
// ===========================================================================
// A second viewport over the whole page that shows the active slot the way a
// planetarium dome will: as a DOMEMASTER (the fisheye square the dome's own
// software warps across its projectors) or as a SIMULATION (the domemaster on
// the inside of a hemisphere, seen from the seats). See domemaster.ts for the
// rendering and domeCapture.ts for how the slot's scene is found.
//
// The slots keep running underneath exactly as before — switching with 0–9,
// P F B E R A C works with the dome open — so this is a view of the
// instrument, not a second instrument.
//
// Routes out of the browser (Syphon, MadMapper, OBS, NDI) read the same
// pixels the screen shows: Domemaster.readPixels(), exposed below as
// window.__domeFrame for a bridge. The clean feed ("salida limpia") is the
// capture route that needs nothing installed: it fills the window with the
// bare domemaster for OBS / MadMapper screen capture — at screen resolution,
// which is why it is a preview route, not the 4096 deliverable.

import { installDomeCapture, currentView, panelKind } from "./domeCapture";
import { Domemaster, DEFAULT_PARAMS, type DomeParams } from "./domemaster";
import { RENDER_MODE } from "./renderMode";
import { sessionEvent } from "./session";

type ViewMode = "master" | "sim";

type Settings = DomeParams & {
  mode: ViewMode;
  guides: boolean;
  /** Send the domemaster to dome-bridge.js → Syphon. */
  syphon: boolean;
  maxFps: 30 | 60;
  simYaw: number;
  simPitch: number;
  simFov: number;
};

const STORE_KEY = "biocracy.dome.v1";

const DEFAULTS: Settings = {
  ...DEFAULT_PARAMS,
  mode: "master",
  guides: true,
  syphon: false,
  maxFps: 30,
  simYaw: 0,
  simPitch: 30,
  simFov: 100,
};

let _stage: HTMLElement | null = null;
let _root: HTMLDivElement | null = null;
let _canvas: HTMLCanvasElement | null = null;
let _dome: Domemaster | null = null;
let _open = false;
let _clean = false;
let _raf = 0;
let _last = 0;
let _fpsT = 0;
let _fpsN = 0;
let _lastWarn = -Infinity;
let _s: Settings = { ...DEFAULTS };
const _ui: Record<string, HTMLElement> = {};

// ── Out: the domemaster to dome-bridge.js (Syphon) ─────────────────────────
// Same shape as laserTap: a WebSocket that retries quietly and never throws,
// so the dome works identically with or without the bridge running. A frame
// is only sent when the previous one has left the socket — under load frames
// are DROPPED, never queued, so the dome stays live and the output simply runs
// at whatever rate the machine can carry.
const OUT_URL = "ws://localhost:3338";
const OUT_HEADER = 16;
let _out: WebSocket | null = null;
let _outReady = false;
let _outRetry: ReturnType<typeof setTimeout> | null = null;
let _outBuf: ArrayBuffer | null = null;
let _outSent = 0;

function outConnect() {
  if (_out || !_s.syphon || !_open) return;
  try {
    const ws = new WebSocket(OUT_URL);
    ws.binaryType = "arraybuffer";
    _out = ws;
    ws.onopen = () => { _outReady = true; };
    ws.onclose = () => {
      _out = null; _outReady = false;
      if (_s.syphon && _open && !_outRetry) {
        _outRetry = setTimeout(() => { _outRetry = null; outConnect(); }, 2000);
      }
    };
    ws.onerror = () => { /* onclose follows; retry there */ };
  } catch { _out = null; }
}

function outClose() {
  if (_outRetry) { clearTimeout(_outRetry); _outRetry = null; }
  if (_out) { try { _out.close(); } catch { /* ignore */ } }
  _out = null; _outReady = false;
}

function outSend() {
  if (!_dome || !_out || !_outReady || _out.bufferedAmount > 0) return;
  const N = _dome.params.size;
  const bytes = OUT_HEADER + N * N * 4;
  if (!_outBuf || _outBuf.byteLength !== bytes) {
    _outBuf = new ArrayBuffer(bytes);
    const h = new DataView(_outBuf);
    h.setUint8(0, 0x44); h.setUint8(1, 0x4f); h.setUint8(2, 0x4d); h.setUint8(3, 0x31); // "DOM1"
    h.setUint32(4, N, true); h.setUint32(8, N, true);
    h.setUint32(12, 1, true);                                   // bottom-up rows (WebGL)
  }
  _dome.readPixelsInto(new Uint8Array(_outBuf, OUT_HEADER));
  _out.send(_outBuf);
  _outSent++;
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* private window, blocked storage */ }
  return { ...DEFAULTS };
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(_s)); } catch { /* ignore */ }
  // Every settled change is part of the performance: a recording's render
  // should frame the dome the way it was framed live.
  sessionEvent({ dome: domeParams() });
}

/** The settings that shape the image (not the viewer's own: view mode, sim camera, output route). */
export function domeParams(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(DEFAULT_PARAMS) as (keyof DomeParams)[]) out[k] = _s[k];
  return out;
}

// ── What feeds the dome ─────────────────────────────────────────────────────

/**
 * The slot's largest hand-drawn canvas — 2-D (p5, text) or raw WebGL (the
 * camera's CRT) — for slots with no three.js scene. Never probed with
 * getContext: see panelKind in domeCapture.ts.
 */
function panelCanvas(): HTMLCanvasElement | null {
  if (!_stage) return null;
  let best: HTMLCanvasElement | null = null;
  let area = 0;
  _stage.querySelectorAll("canvas").forEach((c) => {
    const cv = c as HTMLCanvasElement;
    const a = cv.width * cv.height;
    if (a > area && panelKind(cv)) { best = cv; area = a; }
  });
  return best;
}

function slotTitle(): string {
  const hud = document.getElementById("viz-hud");
  return (hud?.textContent || "").trim();
}

// ── Loop ────────────────────────────────────────────────────────────────────

function resize() {
  if (!_canvas || !_dome) return;
  const r = _canvas.getBoundingClientRect();
  _dome.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  _dome.renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
}

function frame(t: number) {
  _raf = requestAnimationFrame(frame);
  if (!_dome) return;
  if (t - _last < 1000 / _s.maxFps - 2) return;
  _last = t;

  const view = currentView();
  const panel = view ? null : panelCanvas();
  try {
    _dome.renderFrame(view, panel, slotTitle());
  } catch (e) {
    // A slot's objects are not ours: one that breaks mid-switch costs this
    // frame, not the loop. Warn once per burst, not sixty times a second.
    if (t - _lastWarn > 5000) { console.warn("[dome] frame skipped:", e); _lastWarn = t; }
  }
  if (_s.mode === "sim" && !_clean) _dome.presentSim(_s.simYaw, _s.simPitch, _s.simFov);
  else _dome.presentMaster(_s.guides && !_clean);
  if (_s.syphon) outSend();

  _fpsN++;
  if (t - _fpsT >= 1000) {
    const secs = (t - _fpsT) / 1000;
    const fps = Math.round(_fpsN / secs);
    if (_ui.out) {
      _ui.out.textContent = !_s.syphon ? "" : _outReady
        ? `syphon ${Math.round(_outSent / secs)} fps` : "syphon: sin puente (DOME=1)";
    }
    _outSent = 0;
    _fpsT = t; _fpsN = 0;
    if (_ui.fps) _ui.fps.textContent = `${fps} fps`;
    if (_ui.src) {
      _ui.src.textContent = view ? "escena 3D (fisheye)" : panel ? "panel 2D" : "sin imagen";
    }
  }
}

// ── UI ──────────────────────────────────────────────────────────────────────

const CSS = `
#dome-view { position:fixed; inset:0; z-index:9000; background:#000; display:none;
  font:12px/1.4 ui-monospace, Menlo, monospace; color:rgba(255,136,0,.85); }
#dome-view.open { display:block; }
#dome-view canvas { position:absolute; left:0; right:0; bottom:0; top:40px; width:100%; height:calc(100% - 40px); display:block; }
#dome-view.clean canvas { top:0; height:100%; }
#dome-bar { position:absolute; top:0; left:0; right:0; height:40px; display:flex; align-items:center;
  gap:14px; padding:0 12px; border-bottom:1px solid rgba(255,136,0,.25); background:#000804;
  white-space:nowrap; overflow-x:auto; }
#dome-view.clean #dome-bar, #dome-view.clean #dome-help { display:none; }
#dome-bar .t { color:#ffcc44; letter-spacing:.1em; }
#dome-bar button { background:#000; color:rgba(255,136,0,.85); border:1px solid rgba(255,136,0,.35);
  font:inherit; padding:3px 8px; cursor:pointer; }
#dome-bar button[aria-pressed="true"] { background:rgba(255,136,0,.85); color:#000; }
#dome-bar label { display:flex; align-items:center; gap:5px; }
#dome-bar input[type=range] { width:80px; accent-color:#ff8800; }
#dome-bar select { background:#000; color:inherit; border:1px solid rgba(255,136,0,.35); font:inherit; }
#dome-bar .ro { color:rgba(255,136,0,.5); }
#dome-help { position:absolute; left:12px; bottom:8px; color:rgba(255,136,0,.45); pointer-events:none; }
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text = "") {
  const e = document.createElement(tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (text) e.textContent = text;
  return e;
}

function segmented(name: string, options: [string, string][], get: () => string, set: (v: string) => void) {
  const wrap = el("span");
  const buttons: HTMLButtonElement[] = [];
  const sync = () => buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === get())));
  for (const [v, label] of options) {
    const b = el("button", { type: "button", "data-v": v, title: name }, label) as HTMLButtonElement;
    b.addEventListener("click", () => { set(v); sync(); save(); b.blur(); });
    buttons.push(b);
    wrap.appendChild(b);
  }
  sync();
  return wrap;
}

function slider(label: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void, unit = "°") {
  const l = el("label");
  const i = el("input", { type: "range", min: String(min), max: String(max), step: String(step) }) as HTMLInputElement;
  const o = el("span", { class: "ro" });
  i.value = String(get());
  o.textContent = `${get()}${unit}`;
  i.addEventListener("input", () => { set(+i.value); o.textContent = `${i.value}${unit}`; });
  // Leave focus on the page, not the slider: with focus on an <input> the
  // slot switcher ignores the number keys.
  i.addEventListener("change", () => { save(); i.blur(); });
  l.append(label, i, o);
  return l;
}

function build() {
  const style = el("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  _root = el("div", { id: "dome-view" }) as HTMLDivElement;
  const bar = el("div", { id: "dome-bar" });
  _canvas = el("canvas") as HTMLCanvasElement;
  const help = el("div", { id: "dome-help" },
    "D cerrar · 0–9 P F B E R A C cambiar ranura · simulación: arrastrar para mirar, rueda para el campo visual · salida limpia: Esc para volver");

  const apply = () => _dome?.setParams(_s);

  bar.append(
    el("span", { class: "t" }, "CÚPULA"),
    segmented("vista", [["master", "Domemaster"], ["sim", "Simulación"]], () => _s.mode, (v) => { _s.mode = v as ViewMode; }),
    segmented("resolución", [["2048", "2048"], ["4096", "4096"]], () => String(_s.size), (v) => { _s.size = +v as 2048 | 4096; apply(); }),
    slider("frente", 0, 90, 1, () => _s.frontElevation, (v) => { _s.frontElevation = v; apply(); }),
    slider("inmersión", 0, 95, 5, () => Math.round(_s.immersion * 100), (v) => { _s.immersion = v / 100; apply(); }, "%"),
    (() => {
      const l = el("label", {}, "apertura");
      const s = el("select") as HTMLSelectElement;
      for (const a of [180, 190, 200, 210, 220, 230]) s.appendChild(el("option", { value: String(a) }, `${a}°`));
      s.value = String(_s.aperture);
      s.addEventListener("change", () => { _s.aperture = +s.value; apply(); save(); s.blur(); });
      l.appendChild(s);
      return l;
    })(),
    slider("inclinación", 0, 30, 1, () => _s.tilt, (v) => { _s.tilt = v; apply(); }),
    segmented("texto", [["on", "texto"], ["off", "sin texto"]], () => (_s.showText ? "on" : "off"), (v) => { _s.showText = v === "on"; apply(); }),
    slider("letra", 1, 6, 0.5, () => _s.textDeg, (v) => { _s.textDeg = v; apply(); }),
    slider("altura texto", 0, 60, 1, () => _s.textElevation, (v) => { _s.textElevation = v; apply(); }),
    segmented("guías", [["on", "guías"], ["off", "sin guías"]], () => (_s.guides ? "on" : "off"), (v) => { _s.guides = v === "on"; }),
    segmented("fps", [["30", "30 fps"], ["60", "60 fps"]], () => String(_s.maxFps), (v) => { _s.maxFps = +v as 30 | 60; }),
    segmented("salida Syphon (dome-bridge.js)", [["on", "syphon"], ["off", "sin syphon"]],
      () => (_s.syphon ? "on" : "off"),
      (v) => { _s.syphon = v === "on"; if (_s.syphon) outConnect(); else outClose(); }),
    (_ui.out = el("span", { class: "ro" }, "")),
    (() => {
      const b = el("button", { type: "button" }, "salida limpia") as HTMLButtonElement;
      b.addEventListener("click", () => { b.blur(); setClean(true); });
      return b;
    })(),
    (_ui.src = el("span", { class: "ro" }, "—")),
    (_ui.fps = el("span", { class: "ro" }, "— fps")),
  );

  _root.append(_canvas, bar, help);
  document.body.appendChild(_root);

  // Simulation: drag to look around, wheel to widen or narrow the view.
  let drag: { x: number; y: number; yaw: number; pitch: number } | null = null;
  _canvas.addEventListener("pointerdown", (e) => {
    if (_s.mode !== "sim") return;
    drag = { x: e.clientX, y: e.clientY, yaw: _s.simYaw, pitch: _s.simPitch };
    _canvas!.setPointerCapture(e.pointerId);
  });
  _canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const k = _s.simFov / Math.max(1, _canvas!.clientHeight);
    _s.simYaw = drag.yaw - (e.clientX - drag.x) * k;
    _s.simPitch = Math.max(-10, Math.min(90, drag.pitch + (e.clientY - drag.y) * k));
  });
  _canvas.addEventListener("pointerup", () => { if (drag) { drag = null; save(); } });
  _canvas.addEventListener("wheel", (e) => {
    if (_s.mode !== "sim") return;
    e.preventDefault();
    _s.simFov = Math.max(40, Math.min(160, _s.simFov + e.deltaY * 0.05));
  }, { passive: false });

  window.addEventListener("resize", resize);
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && _clean) setClean(false);
    requestAnimationFrame(resize);
  });
}

function setClean(on: boolean) {
  if (!_root) return;
  _clean = on;
  _root.classList.toggle("clean", on);
  if (on) { _root.requestFullscreen?.().catch(() => { /* not allowed: still clean in-window */ }); }
  else if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); }
  requestAnimationFrame(resize);
}

function open() {
  if (_open) return;
  if (!_root) build();
  if (!_dome) _dome = new Domemaster(_canvas!, _s);
  _open = true;
  _root!.classList.add("open");
  resize();
  _last = 0; _fpsT = performance.now(); _fpsN = 0;
  _raf = requestAnimationFrame(frame);
  if (_s.syphon) outConnect();
}

function close() {
  if (!_open) return;
  _open = false;
  // Closing the dome stops the feed; the bridge's dead-man then publishes
  // black, so the dome goes dark instead of holding the last frame.
  outClose();
  setClean(false);
  cancelAnimationFrame(_raf);
  _root!.classList.remove("open");
}

// ── Public ──────────────────────────────────────────────────────────────────

export function initDome(stage: HTMLElement) {
  _stage = stage;
  installDomeCapture(stage);
  if (RENDER_MODE) { initRender(); return; }
  _s = load();

  window.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
        || e.target instanceof HTMLSelectElement) return;
    if (e.key === "Escape" && _clean) { setClean(false); return; }
    if ((e.key === "d") && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      if (_open) close(); else open();
    }
  });

  // For output bridges (Syphon / NDI / recorder): the last rendered
  // domemaster as RGBA8, bottom-up rows. null while the dome is closed.
  (window as any).__domeFrame = () => (_open && _dome ? _dome.readPixels() : null);
}

// ── Offline render (renderMode.ts, dome-render.js) ─────────────────────────
// The renderer has no screen and no loop: renderMode calls renderOnce() after
// each stepped frame and reads the domemaster straight back. Settings start
// from the defaults — not this profile's localStorage — and follow the
// session's snapshot and logged changes; only the size is the renderer's own.
function initRender() {
  const q = new URLSearchParams(location.search);
  const size = (q.get("dome") === "2048" ? 2048 : 4096) as 2048 | 4096;
  _s = { ...DEFAULTS, size, syphon: false };
  build();
  _dome = new Domemaster(_canvas!, _s);
  _dome.renderer.setPixelRatio(1);
  _dome.renderer.setSize(64, 64, false);   // nothing is shown; the domemaster is a render target
  _open = true;
  _root!.classList.add("open", "clean");
  _clean = true;
  let buf: Uint8Array | null = null;

  (window as any).__domeRender = {
    ready: () => !!_dome,
    renderOnce() {
      if (!_dome) return;
      const view = currentView();
      _dome.renderFrame(view, view ? null : panelCanvas(), slotTitle());
    },
    read() {
      const N = _dome!.params.size;
      if (!buf || buf.length !== N * N * 4) buf = new Uint8Array(N * N * 4);
      _dome!.readPixelsInto(buf);
      return { width: N, height: N, data: buf };
    },
    apply(settings: Record<string, unknown>) {
      for (const k of Object.keys(DEFAULT_PARAMS) as (keyof DomeParams)[]) {
        if (k !== "size" && k in settings) (_s as any)[k] = settings[k];
      }
      _dome?.setParams(_s);
    },
  };
}
