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
// Routes out ("salida"), read back asynchronously from the same domemaster
// the screen shows (Domemaster.beginOutput / collectOutput):
//   ndi     — the page runs in dome-live.js (Electron), whose preload sends
//             each frame as the NDI source "BiocracyEngine Cúpula". This is
//             the live feed for the planetarium (Digistar takes NDI).
//   syphon  — dome-bridge.js (DOME=1) over WebSocket, for MadMapper / OBS.
// While a route is on the dome keeps rendering with the viewport closed, so
// the performer can work the page while the dome receives the image. NEGRO
// sends black. The clean feed ("salida limpia") fills the window with the
// bare domemaster for screen capture — a preview route, not the deliverable.
//
// "ventana aparte" moves the viewport into a window of its own (window.open),
// to drag onto a second screen: the performer keeps parliament.html whole —
// the side columns, the controls — while the dome view watches beside it.
// Same renderer loop, driven from this page; keys pressed in the dome window
// are handed back to the page, so 0–9 P F B E R A C still switch slots.

import { installDomeCapture, currentView, currentPost, currentLayers, panelKind, setDomeEconomy } from "./domeCapture";
import { Domemaster, DEFAULT_PARAMS, type DomeParams } from "./domemaster";
import { RENDER_MODE } from "./renderMode";
import { sessionEvent } from "./session";

type ViewMode = "master" | "sim";
type Output = "none" | "syphon" | "ndi";

/** What dome-live-preload.js puts on the window (absent in a browser). */
type DomeOut = {
  name: string;
  frame: (data: Uint8Array, width: number, height: number, alpha?: boolean) => Promise<void>;
  black: (on: boolean) => void;
  connections: () => number;
};
const domeOut = (): DomeOut | null => (window as any).__domeOut ?? null;

type Settings = DomeParams & {
  mode: ViewMode;
  guides: boolean;
  /** Where the domemaster goes besides the screen. */
  output: Output;
  /**
   * The output with an alpha channel — black transparent — so the venue can
   * lay the live feed OVER a clip that is already playing (a layer in
   * Digistar) instead of replacing it.
   */
  outAlpha: boolean;
  maxFps: 30 | 60;
  simYaw: number;
  simPitch: number;
  simFov: number;
  /** The viewport in a window of its own instead of over the page. */
  floating: boolean;
};

const STORE_KEY = "biocracy.dome.v1";

const DEFAULTS: Settings = {
  ...DEFAULT_PARAMS,
  mode: "master",
  guides: true,
  output: "none",
  outAlpha: false,
  maxFps: 30,
  simYaw: 0,
  simPitch: 30,
  simFov: 100,
  floating: false,
};

let _stage: HTMLElement | null = null;
let _root: HTMLDivElement | null = null;
/** The dome's own window while it floats ("ventana aparte"); null when docked. */
let _popup: Window | null = null;
/** The window the viewport lives in: this page's, or the popup. */
const viewWin = (): Window => _popup ?? window;
let _canvas: HTMLCanvasElement | null = null;
let _dome: Domemaster | null = null;
let _open = false;        // the viewport is showing
let _running = false;     // the loop is on: viewport showing, or an output on
let _black = false;
let _clean = false;
let _raf = 0;
let _last = 0;
let _fpsT = 0;
let _fpsN = 0;
let _lastWarn = -Infinity;
let _presentTick = 0;
let _s: Settings = { ...DEFAULTS };
const _ui: Record<string, HTMLElement> = {};

// ── Out ─────────────────────────────────────────────────────────────────────
// Both routes take frames from the asynchronous readback, at most one in
// flight: under load frames are DROPPED, never queued, so the dome stays live
// and the output runs at whatever rate the machine carries.

// Syphon: dome-bridge.js over a WebSocket that retries quietly and never
// throws, so the dome works the same with or without the bridge running.
const OUT_URL = "ws://localhost:3338";
const OUT_HEADER = 16;
let _out: WebSocket | null = null;
let _outReady = false;
let _outRetry: ReturnType<typeof setTimeout> | null = null;
let _outBuf: ArrayBuffer | null = null;
let _outSent = 0;

function outConnect() {
  if (_out || _s.output !== "syphon") return;
  try {
    const ws = new WebSocket(OUT_URL);
    ws.binaryType = "arraybuffer";
    _out = ws;
    ws.onopen = () => { _outReady = true; };
    ws.onclose = () => {
      _out = null; _outReady = false;
      if (_s.output === "syphon" && !_outRetry) {
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

// NDI: two buffers taking turns, so the one NDI is still sending is never
// the one the next readback is written into.
const _ndiBufs: Uint8Array[] = [];
let _ndiTurn = 0;
let _ndiBusy = false;

function outFrame() {
  if (!_dome || _s.output === "none" || _black) return;
  const N = _dome.params.size;
  if (_s.output === "ndi") {
    const out = domeOut();
    if (!out) return;
    if (!_ndiBusy) {
      if (!_ndiBufs[0] || _ndiBufs[0].length !== N * N * 4) {
        _ndiBufs[0] = new Uint8Array(N * N * 4);
        _ndiBufs[1] = new Uint8Array(N * N * 4);
      }
      const buf = _ndiBufs[_ndiTurn];
      if (_dome.collectOutput(buf)) {
        _ndiBusy = true;
        _ndiTurn ^= 1;
        _outSent++;
        out.frame(buf, N, N, _s.outAlpha).catch(() => { /* a dropped frame */ }).finally(() => { _ndiBusy = false; });
      }
    }
  } else {
    if (!_out || !_outReady) return;
    if (_out.bufferedAmount === 0) {
      const bytes = OUT_HEADER + N * N * 4;
      if (!_outBuf || _outBuf.byteLength !== bytes) {
        _outBuf = new ArrayBuffer(bytes);
        const h = new DataView(_outBuf);
        h.setUint8(0, 0x44); h.setUint8(1, 0x4f); h.setUint8(2, 0x4d); h.setUint8(3, 0x31); // "DOM1"
        h.setUint32(4, N, true); h.setUint32(8, N, true);
        h.setUint32(12, 0, true);                               // top row first (flipped on the GPU)
      }
      if (_dome.collectOutput(new Uint8Array(_outBuf, OUT_HEADER))) { _out.send(_outBuf); _outSent++; }
    }
  }
  _dome.beginOutput();
}

function setOutput(o: Output) {
  _s.output = o;
  if (o === "syphon") outConnect(); else outClose();
  if (o === "none") _dome?.disposeOutput();
  setBlack(false);
  syncLoop();
  syncEconomy();
  resize();
}

// ── Economy, while the dome is live ─────────────────────────────────────────
// With an output running, what the venue sees is the output: the flat page is
// the performer's surface, and the preview is a check. So the flat view runs
// at 30 fps and pixel ratio 1 (domeCapture.ts) — unless the page itself is on
// air: dome-live.js sets window.__domePageLive while a receiver watches the
// "Página" NDI source, which is this window's own paint, and then the page
// keeps its full quality. With the viewport docked over the page, the page is
// covered and economy is on either way. The dome's own render never changes.
const pageOnAir = (): boolean => !!(window as unknown as { __domePageLive?: boolean }).__domePageLive;
const outputLive = (): boolean => _s.output !== "none";
function syncEconomy() {
  setDomeEconomy((_open && !_popup) || (outputLive() && !pageOnAir()));
}

function setBlack(on: boolean) {
  _black = on;
  domeOut()?.black(on);
  _root?.classList.toggle("black", on);
  if (_ui.black) _ui.black.setAttribute("aria-pressed", String(on));
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      // older settings had `syphon: true` instead of an output route
      if (saved.output === undefined && saved.syphon) saved.output = "syphon";
      delete saved.syphon;
      const s: Settings = { ...DEFAULTS, ...saved };
      // NDI only exists inside dome-live.js; in a browser it falls back to none
      if (s.output === "ndi" && !domeOut()) s.output = "none";
      // a size saved before the live cap
      if (s.size > 2048) s.size = 2048;
      return s;
    }
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

// The cardinal points of the venue's orientation, around the domemaster view:
// south (front) at the bottom, north (back) at the top, east left, west right.
const _compass: HTMLSpanElement[] = [];
function placeCompass() {
  if (!_canvas || !_root) return;
  if (!_compass.length) {
    for (const t of ["S · FRENTE", "N · ESPALDA", "E", "O"]) {
      const c = el("span", { class: "compass" }, t) as HTMLSpanElement;
      _root.appendChild(c);
      _compass.push(c);
    }
  }
  const show = _s.guides && _s.mode === "master" && !_clean;
  const r = _canvas.getBoundingClientRect();
  const side = Math.min(r.width, r.height);
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const at: [number, number][] = [[cx, cy + side / 2 - 14], [cx, cy - side / 2 + 4], [cx - side / 2 + 10, cy], [cx + side / 2 - 10, cy]];
  _compass.forEach((c, i) => {
    c.hidden = !show;
    c.style.left = `${at[i][0]}px`;
    c.style.top = `${at[i][1]}px`;
  });
}

function resize() {
  if (!_canvas || !_dome) return;
  const r = _canvas.getBoundingClientRect();
  // The preview at density 1 while an output is live: it is a check of the
  // output, not the output (a quarter of the pixels on a Retina screen).
  _dome.renderer.setPixelRatio(outputLive() ? 1 : Math.min(viewWin().devicePixelRatio || 1, 2));
  _dome.renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
  placeCompass();
}

function frame(t: number) {
  _raf = requestAnimationFrame(frame);
  if (!_dome) return;
  if (t - _last < 1000 / _s.maxFps - 2) return;
  _last = t;

  const view = currentView();
  const panel = view ? null : panelCanvas();
  try {
    _dome.renderFrame(view, panel, slotTitle(), currentPost(), currentLayers());
  } catch (e) {
    // A slot's objects are not ours: one that breaks mid-switch costs this
    // frame, not the loop. Warn once per burst, not sixty times a second.
    if (t - _lastWarn > 5000) { console.warn("[dome] frame skipped:", e); _lastWarn = t; }
  }
  // Drawn to the screen only while the viewport shows; with it closed the
  // loop is here for the output alone. With an output live the preview is
  // drawn every other dome frame (15 fps): the canvas holds its last image
  // between, and the output itself is untouched.
  _presentTick ^= 1;
  if (_open && (!outputLive() || _presentTick === 0)) {
    if (_s.mode === "sim" && !_clean) _dome.presentSim(_s.simYaw, _s.simPitch, _s.simFov, _s.guides);
    else _dome.presentMaster(_s.guides && !_clean);
  }
  outFrame();

  _fpsN++;
  if (t - _fpsT >= 1000) {
    const secs = (t - _fpsT) / 1000;
    const fps = Math.round(_fpsN / secs);
    const status = outStatus(Math.round(_outSent / secs));
    if (_ui.out) _ui.out.textContent = status;
    if (_badge) { _badge.textContent = `CÚPULA · ${status}`; _badge.hidden = _open || _s.output === "none"; }
    _outSent = 0;
    _fpsT = t; _fpsN = 0;
    syncEconomy();   // follows the Página receivers, once a second
    if (_ui.fps) _ui.fps.textContent = `${fps} fps`;
    if (_ui.src) {
      _ui.src.textContent = view ? "escena 3D (fisheye)" : panel ? "panel 2D" : "sin imagen";
    }
  }
}

function outStatus(fps: number): string {
  if (_s.output === "none") return "";
  if (_black) return `${_s.output} · NEGRO`;
  if (_s.output === "ndi") {
    const out = domeOut();
    if (!out) return "ndi: solo en dome:live";
    const n = out.connections();
    return `ndi ${fps} fps · ${n} receptor${n === 1 ? "" : "es"}`;
  }
  return _outReady ? `syphon ${fps} fps` : "syphon: sin puente (DOME=1)";
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
#dome-view .compass { position:fixed; transform:translate(-50%,0); font:11px/1 ui-monospace, Menlo, monospace;
  color:rgba(255,136,0,.75); letter-spacing:.08em; pointer-events:none; }
#dome-view.black canvas { opacity:.15; }
#dome-bar button.negro[aria-pressed="true"] { background:#c00; border-color:#c00; color:#fff; }
body.dome-window { margin:0; background:#000; overflow:hidden; }
#dome-live-badge { position:fixed; right:12px; bottom:12px; z-index:8999; padding:4px 10px;
  font:11px/1.4 ui-monospace, Menlo, monospace; color:#000; background:rgba(255,136,0,.9);
  letter-spacing:.06em; pointer-events:none; }
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

// Sliders a gesture can also move (the tilt), so their thumb follows.
const _sliders = new Map<string, () => void>();

function slider(label: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void, unit = "°") {
  const l = el("label");
  const i = el("input", { type: "range", min: String(min), max: String(max), step: String(step) }) as HTMLInputElement;
  const o = el("span", { class: "ro" });
  i.value = String(get());
  o.textContent = `${get()}${unit}`;
  _sliders.set(label, () => { i.value = String(get()); o.textContent = `${Math.round(get())}${unit}`; });
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
    "D cerrar · 0–9 P F B E R A C cambiar módulo · simulación: dos dedos o arrastrar para mirar, pellizcar (o Alt + rueda) para acercar, Mayús + dos dedos inclina el domo · salida limpia: Esc para volver");

  const apply = () => _dome?.setParams(_s);

  bar.append(
    el("span", { class: "t" }, "CÚPULA"),
    segmented("vista", [["master", "Domemaster"], ["sim", "Simulación"]], () => _s.mode, (v) => { _s.mode = v as ViewMode; placeCompass(); }),
    segmented("ventana aparte: la cúpula en su propia ventana, para llevarla a otra pantalla; la página queda entera",
      [["dock", "sobre la página"], ["float", "ventana aparte"]],
      () => (_s.floating ? "float" : "dock"),
      (v) => { const f = v === "float"; if (f === _s.floating) return; _s.floating = f; if (_open) { close(); open(); } }),
    // Live, the dome is 2048. At 4096 it holds ~1.75 GB more of the memory the
    // M5's CPU and GPU share — measured, alongside a browser that has been
    // open for days, it is what takes the page down (Chromium's sad face) and
    // what reaches the sound card. 4096 is for dome-render.js, offline.
    segmented("resolución", [["1536", "1536"], ["2048", "2048"]], () => String(_s.size), (v) => { _s.size = +v as DomeParams["size"]; apply(); }),
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
    segmented("guías", [["on", "guías"], ["off", "sin guías"]], () => (_s.guides ? "on" : "off"), (v) => { _s.guides = v === "on"; placeCompass(); }),
    (() => {
      // The planetarium's grid (their "Dome Master 4k Pattern"), from a file:
      // shown over the domemaster on this screen to check orientation —
      // front/south at the bottom, east left, west right — never sent out.
      const b = el("button", { type: "button", "aria-pressed": "false", title: "superpone la grilla de la sala (JPG/PNG) sobre el domemaster, solo en pantalla" }, "grilla sala") as HTMLButtonElement;
      const input = el("input", { type: "file", accept: "image/*", style: "display:none" }) as HTMLInputElement;
      let on = false;
      b.addEventListener("click", () => {
        b.blur();
        if (on) { on = false; _pattern = null; _dome?.setPattern(null); b.setAttribute("aria-pressed", "false"); return; }
        input.click();
      });
      input.addEventListener("change", () => {
        const f = input.files?.[0];
        if (!f) return;
        const img = new Image();
        img.onload = () => { _pattern = img; _dome?.setPattern(img, 0.5); on = true; b.setAttribute("aria-pressed", "true"); };
        img.src = URL.createObjectURL(f);
        input.value = "";
      });
      const wrap = el("span");
      wrap.append(b, input);
      return wrap;
    })(),
    segmented("fps", [["30", "30 fps"], ["60", "60 fps"]], () => String(_s.maxFps), (v) => { _s.maxFps = +v as 30 | 60; }),
    segmented("salida: NDI (dome-live.js) o Syphon (dome-bridge.js); sigue con la vista cerrada",
      [["none", "sin salida"], ["ndi", "ndi"], ["syphon", "syphon"]],
      () => _s.output, (v) => setOutput(v as Output)),
    segmented("salida con alfa: el negro transparente, para ir como capa sobre un clip de la sala",
      [["off", "opaca"], ["on", "alfa"]],
      () => (_s.outAlpha ? "on" : "off"),
      (v) => { _s.outAlpha = v === "on"; _dome?.setOutputAlpha(_s.outAlpha); }),
    (() => {
      const b = el("button", { type: "button", class: "negro", "aria-pressed": "false",
        title: "envía negro a la salida, sin apagarla" }, "negro") as HTMLButtonElement;
      b.addEventListener("click", () => { b.blur(); setBlack(!_black); });
      _ui.black = b;
      return b;
    })(),
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
  wireCanvas(_canvas);
  wireWindow(window);
}

// Simulation: drag to look around, wheel to widen or narrow the view.
function wireCanvas(c: HTMLCanvasElement) {
  let drag: { x: number; y: number; yaw: number; pitch: number } | null = null;
  c.addEventListener("pointerdown", (e) => {
    if (_s.mode !== "sim") return;
    drag = { x: e.clientX, y: e.clientY, yaw: _s.simYaw, pitch: _s.simPitch };
    c.setPointerCapture(e.pointerId);
  });
  c.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const k = _s.simFov / Math.max(1, c.clientHeight);
    _s.simYaw = drag.yaw - (e.clientX - drag.x) * k;
    _s.simPitch = Math.max(-10, Math.min(90, drag.pitch + (e.clientY - drag.y) * k));
  });
  c.addEventListener("pointerup", () => { if (drag) { drag = null; save(); } });
  // Trackpad, in the simulation:
  //   two fingers           look around: sideways turns, up/down raises the gaze
  //   pinch                 zoom (field of view) — Chrome reports it as a
  //                         wheel with ctrlKey; Alt + wheel does it with a mouse
  //   Shift + two fingers   up/down tilts the dome itself (inclinación)
  // Directions follow the drag: the dome moves with the fingers.
  c.addEventListener("wheel", (e) => {
    if (_s.mode !== "sim") return;
    e.preventDefault();
    const px = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;   // lines / pages → px
    const dx = e.deltaX * px, dy = e.deltaY * px;
    if (e.ctrlKey || e.altKey) {
      _s.simFov = Math.max(30, Math.min(160, _s.simFov * Math.exp(dy * 0.01)));
    } else if (e.shiftKey) {
      // Shift turns a vertical scroll into deltaX on macOS: take whichever moved.
      const v = Math.abs(dy) >= Math.abs(dx) ? dy : dx;
      _s.tilt = Math.max(0, Math.min(30, _s.tilt - v * 0.05));
      _dome?.setParams(_s);
      _sliders.get("inclinación")?.();
    } else {
      const k = _s.simFov / Math.max(1, c.clientHeight);
      _s.simYaw += dx * k;
      _s.simPitch = Math.max(-10, Math.min(90, _s.simPitch - dy * k));
    }
    scheduleSave();
  }, { passive: false });
}

// Gestures arrive as dozens of events a second: settle, then save once.
let _saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => { _saveTimer = null; save(); }, 400);
}

// Resize and full screen, for whichever window holds the viewport.
function wireWindow(w: Window) {
  w.addEventListener("resize", resize);
  w.document.addEventListener("fullscreenchange", () => {
    if (!w.document.fullscreenElement && _clean) setClean(false);
    requestAnimationFrame(resize);
  });
}

function setClean(on: boolean) {
  if (!_root) return;
  _clean = on;
  _root.classList.toggle("clean", on);
  placeCompass();
  const doc = _root.ownerDocument;
  if (on) { _root.requestFullscreen?.().catch(() => { /* not allowed: still clean in-window */ }); }
  else if (doc.fullscreenElement) { doc.exitFullscreen().catch(() => {}); }
  requestAnimationFrame(resize);
}

let _badge: HTMLDivElement | null = null;

let _pattern: HTMLImageElement | null = null;

function makeDome() {
  _dome = new Domemaster(_canvas!, _s);
  _dome.setOutputAlpha(_s.outAlpha);
  if (_pattern) _dome.setPattern(_pattern, 0.5);
}

function ensureBuilt() {
  if (!_root) build();
  if (!_dome) makeDome();
  if (!_badge) {
    _badge = el("div", { id: "dome-live-badge" }) as HTMLDivElement;
    _badge.hidden = true;
    document.body.appendChild(_badge);
  }
}

/** Run the loop while there is something to draw for: the viewport, or an output. */
function syncLoop() {
  const want = _open || _s.output !== "none";
  if (want && !_running) {
    ensureBuilt();
    _running = true;
    _last = 0; _fpsT = performance.now(); _fpsN = 0;
    _raf = requestAnimationFrame(frame);
  } else if (!want && _running) {
    _running = false;
    cancelAnimationFrame(_raf);
  }
  if (_badge && (_open || _s.output === "none")) _badge.hidden = true;
}

function open() {
  if (_open) return;
  ensureBuilt();
  _open = true;
  if (_s.floating && float()) { _root!.classList.add("open"); resize(); syncLoop(); syncEconomy(); return; }
  _root!.classList.add("open");
  resize();
  syncLoop();
  syncEconomy();       // the page is covered: its flat view at 30 fps, density 1
}

// ── Ventana aparte ──────────────────────────────────────────────────────────
// The viewport's DOM moves into the popup whole (its buttons keep their
// listeners). The canvas does not: a WebGL context belongs to the document
// its canvas was made in, so the dome gets a new canvas there and a new
// renderer, and the same again when it comes back. The popup has no code of
// its own — this page draws into it.

const POPUP_NAME = "biocracy-dome";

function moveRoot(to: Document) {
  const fresh = to.createElement("canvas");
  _root!.replaceChild(fresh, _canvas!);
  _canvas = fresh;
  to.body.appendChild(to.adoptNode(_root!));
  if (_dome) {
    _dome.dispose();
    _dome.renderer.forceContextLoss();    // free its GPU memory now, not at GC
    _dome = null;
  }
  makeDome();
  wireCanvas(fresh);
}

function float(): boolean {
  const w = window.open("", POPUP_NAME, "popup,width=1100,height=1000");
  if (!w) { console.warn("[dome] el navegador no dejó abrir la ventana aparte; la cúpula queda sobre la página"); return false; }
  _popup = w;
  const d = w.document;
  d.head.replaceChildren(); d.body.replaceChildren();   // a window of that name left from before
  d.title = "CÚPULA — Parlamento de lo vivo";
  d.body.className = "dome-window";
  const style = d.createElement("style");
  style.textContent = CSS;
  d.head.appendChild(style);
  moveRoot(d);
  wireWindow(w);
  // Keys pressed in the dome window: D and Esc are the viewport's own; the
  // rest go back to the page, where the slot switcher and the session log
  // listen, as if they had been pressed there.
  const pass = (e: KeyboardEvent) => {
    const tag = (e.target as Element | null)?.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    if (e.type === "keydown" && onViewKey(e)) return;
    document.body.dispatchEvent(new KeyboardEvent(e.type, {
      key: e.key, code: e.code, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey,
      ctrlKey: e.ctrlKey, repeat: e.repeat, bubbles: true, cancelable: true,
    }));
  };
  w.addEventListener("keydown", pass);
  w.addEventListener("keyup", pass);
  // Closed from its own title bar: the viewport comes home, closed.
  w.addEventListener("pagehide", () => { if (_popup === w) { dock(); _open = false; _clean = false; _root!.classList.remove("open", "clean"); syncLoop(); syncEconomy(); } });
  w.focus();
  return true;
}

/** Back into this page (still showing or not: the caller decides). */
function dock() {
  const w = _popup;
  if (!w) return;
  _popup = null;
  moveRoot(document);
  if (!w.closed) w.close();
}

// Closing the viewport no longer stops an output: the performer closes it to
// reach the page while the dome keeps receiving. Turning the output to
// "sin salida" stops it, and then the receivers go dark — NDI by the preload's
// black frame, Syphon by dome-bridge.js's dead-man.
function close() {
  if (!_open) return;
  _open = false;
  setClean(false);
  _root!.classList.remove("open");
  if (_popup) dock();
  syncLoop();
  syncEconomy();       // still on while an output runs and the page is not on air
}

// ── Public ──────────────────────────────────────────────────────────────────

/** D and Esc, the viewport's own keys, from the page or the dome window. True if taken. */
function onViewKey(e: KeyboardEvent): boolean {
  if (e.key === "Escape" && _clean) { setClean(false); return true; }
  if (e.key === "d" && !e.metaKey && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    if (_open) close(); else open();
    return true;
  }
  return false;
}

export function initDome(stage: HTMLElement) {
  _stage = stage;
  installDomeCapture(stage);
  if (RENDER_MODE) { initRender(); return; }
  _s = load();
  // Inside dome-live.js an NDI output left on comes back on by itself: a
  // window reopened mid-show resumes the feed without anyone touching it.
  if (_s.output === "ndi") { syncLoop(); syncEconomy(); }

  window.addEventListener("keydown", (e) => {
    const tag = (e.target as Element | null)?.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    onViewKey(e);
  });
  // A reload of the page leaves the dome window orphaned (and black): close it.
  window.addEventListener("pagehide", () => { if (_popup && !_popup.closed) _popup.close(); });

  // For output bridges (Syphon / NDI / recorder): the last rendered
  // domemaster as RGBA8, bottom-up rows. null while the dome is closed.
  (window as any).__domeFrame = () => (_open && _dome ? _dome.readPixels() : null);
}

// ── Offline render (renderMode.ts, dome-render.js) ─────────────────────────
// The renderer has no screen and no loop: renderMode calls renderOnce() after
// each stepped frame and reads the domemaster straight back. Settings start
// from the defaults — not this profile's localStorage — and follow the
// session's snapshot and logged changes; only the size is the renderer's own.
// The module's name is never written on a render: the clips and stills are
// the image alone, whatever the "texto" toggle was live.
function initRender() {
  const q = new URLSearchParams(location.search);
  const size = (q.get("dome") === "2048" ? 2048 : 4096) as 2048 | 4096;
  _s = { ...DEFAULTS, size, output: "none", showText: false };
  build();
  _dome = new Domemaster(_canvas!, _s);
  _dome.renderer.setPixelRatio(1);
  _dome.renderer.setSize(64, 64, false);   // nothing is shown; the domemaster is a render target
  // The viewport stays hidden: the domemaster is read from its render target,
  // and the page underneath stays in view for the flat stills
  // (dome-render.js --stills captures the window itself).
  _open = true;
  _clean = true;
  let buf: Uint8Array | null = null;

  (window as any).__domeRender = {
    ready: () => !!_dome,
    renderOnce() {
      if (!_dome) return;
      const view = currentView();
      _dome.renderFrame(view, view ? null : panelCanvas(), slotTitle(), currentPost(), currentLayers());
    },
    read() {
      const N = _dome!.params.size;
      if (!buf || buf.length !== N * N * 4) buf = new Uint8Array(N * N * 4);
      _dome!.readPixelsInto(buf);
      return { width: N, height: N, data: buf };
    },
    apply(settings: Record<string, unknown>) {
      for (const k of Object.keys(DEFAULT_PARAMS) as (keyof DomeParams)[]) {
        if (k !== "size" && k !== "showText" && k in settings) (_s as any)[k] = settings[k];
      }
      _dome?.setParams(_s);
    },
  };
}
