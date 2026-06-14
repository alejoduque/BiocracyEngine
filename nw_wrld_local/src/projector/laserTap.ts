// laserTap.ts — browser → laser-bridge feed (ILDA / Helios DAC)
// ===========================================================================
// Streams a NORMALISED vector frame to laser-bridge.js (ws://localhost:3337),
// which converts it to Helios 12-bit points / ILDA and projects onto the forest.
//
// Lasers draw sparse bright strokes, not rasterised images — so we send a few
// laser-friendly vectors, not the whole 3-D scene. Frame source, in priority:
//
//   1. window.__laserFrame  — any module may publish its own vector scene
//      ({ points:[{x,y,r,g,b,blank}], pps }); x,y normalised −1..1, centre 0,0.
//   2. slot-P default — the phenological year-ring + a marker at today's active
//      species (window.__activeSpecies). A *sensitive* species is NOT drawn:
//      the opacity clause (Glissant) extended into physical space — the
//      vulnerable being is never cast onto the real forest.
//
// Safe to run always: if the bridge is down it retries quietly and never throws.
// laser-bridge's dead-man blanking covers the case where we stop sending.

type LaserPoint = { x: number; y: number; r?: number; g?: number; b?: number; blank?: boolean };

const WS_URL = "ws://localhost:3337";
const SEND_MS = 33; // ~30 fps frame feed

let _ws: WebSocket | null = null;
let _ready = false;
let _timer: ReturnType<typeof setInterval> | null = null;
let _retry: ReturnType<typeof setTimeout> | null = null;
let _started = false;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

function connect() {
  try {
    _ws = new WebSocket(WS_URL);
    _ws.onopen = () => { _ready = true; };
    _ws.onclose = () => {
      _ready = false; _ws = null;
      if (!_retry) _retry = setTimeout(() => { _retry = null; connect(); }, 3000);
    };
    _ws.onerror = () => { try { _ws?.close(); } catch { /* ignore */ } };
  } catch {
    if (!_retry) _retry = setTimeout(() => { _retry = null; connect(); }, 3000);
  }
}

function buildFrame(): { points: LaserPoint[]; pps: number } {
  const w = window as unknown as {
    __laserFrame?: { points?: LaserPoint[]; pps?: number };
    __activeSpecies?: { ring?: { x: number; y: number }; sensitive?: boolean };
  };

  // 1 · explicit module-published scene wins
  if (w.__laserFrame && Array.isArray(w.__laserFrame.points) && w.__laserFrame.points.length) {
    return { points: w.__laserFrame.points, pps: w.__laserFrame.pps || 30000 };
  }

  // 2 · slot-P default: the year ring (vegetal green) + active-species marker
  const pts: LaserPoint[] = [];
  const R = 0.82, N = 90;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    pts.push({ x: Math.cos(a) * R, y: Math.sin(a) * R, r: 0, g: 200, b: 90, blank: i === 0 });
  }
  const active = w.__activeSpecies;
  if (active && active.ring && !active.sensitive) {
    // opacity clause in physical space: a sensitive species is intentionally
    // NOT cast onto the forest — only non-shielded beings get a bright marker.
    const mx = clamp(active.ring.x, -0.95, 0.95);
    const my = clamp(active.ring.y, -0.95, 0.95);
    const s = 0.05;
    pts.push({ x: mx - s, y: my, blank: true });
    pts.push({ x: mx + s, y: my, r: 255, g: 255, b: 255 });
    pts.push({ x: mx, y: my - s, blank: true });
    pts.push({ x: mx, y: my + s, r: 255, g: 255, b: 255 });
  }
  return { points: pts, pps: 30000 };
}

/** Start streaming laser frames to laser-bridge. Idempotent; safe if no bridge. */
export function initLaserTap(): void {
  if (_started) return;
  _started = true;
  connect();
  _timer = setInterval(() => {
    if (!_ws || !_ready || _ws.readyState !== WebSocket.OPEN) return;
    const { points, pps } = buildFrame();
    try { _ws.send(JSON.stringify({ type: "laserFrame", pps, points })); } catch { /* ignore */ }
  }, SEND_MS);
}

/** Stop the laser feed (the bridge will dead-man blank). */
export function stopLaserTap(): void {
  if (_timer) { clearInterval(_timer); _timer = null; }
  if (_retry) { clearTimeout(_retry); _retry = null; }
  try { _ws?.close(); } catch { /* ignore */ }
  _ws = null; _ready = false; _started = false;
}
