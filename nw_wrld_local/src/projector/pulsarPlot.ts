// pulsarPlot.ts
// Stacked ridgelines for the laser — the B1919+21 / Unknown Pleasures plot.
//
// Successive observations of the same object, drawn one above another, so that
// a pattern nobody can see in a single pass emerges from the stack. That is the
// pulsar image and it is also what this instrument does: the forest is not
// legible in one recording, the chain is not legible in one block.
//
// Publishes window.__laserFrame, which laserTap.ts already prefers outright
// over its year-ring default. Nothing else in the repo writes that global.
//
// ─── Why this is a path-length problem, not a point-count one ───────────────
//
// The galvos sweep a fixed number of degrees per second (OMEGA_MAX, derived in
// laser-bridge.js from the fixture's "30 kpps @ 8°" rating). Every point must be
// scanned FRAME_HZ times a second, so what a frame gets is not a number of
// points but a LENGTH OF TRAVEL:
//
//     ink per frame = OMEGA_MAX / FRAME_HZ / deg_per_unit
//                   = 10000 / 30 / 22.5  =  14.8 normalised units
//
// A full-width row is 1.7 units before it wiggles at all, and vertical
// excursion adds arc length — measured, ±0.06 amplitude costs 2.66 units, 1.56x
// its own width. The album's eighty rows would need about 420 units. We have
// fourteen. So six rows is not a stylistic choice, it is the ceiling, and the
// depth of the stack has to live in TIME: the plot scrolls, and the pattern
// emerges for a viewer who watches rather than glances. Which is what the
// pulsar plot was always about.
//
// Two consequences are load-bearing:
//
//   SERPENTINE.  Drawing every row left-to-right means retracing the full width
//                between them. Blanked or not, the mirror still travels it —
//                about 92 interpolated points per row, and sixteen rows
//                measured at 347% of budget, which the bridge's auto-blanking
//                turns into a dark forest. Alternating direction makes the only
//                inter-row move the row step itself, roughly five points.
//
//   SELF-BUDGETING.  This sheds rows until it fits BEFORE sending, rather than
//                relying on the bridge to catch it. Auto-blanking is a safety
//                net; content that lands in the net is content that is not
//                being projected.
//
// Hidden-line removal — the album's occlusion, where a near trace eats the one
// behind it — is done for the look and saves nothing. A blanked segment is
// still traversed, so the mirror pays for it either way.

type LaserPoint = { x: number; y: number; r?: number; g?: number; b?: number; blank?: boolean };

export type PulsarSource = "mix" | "corpus" | "ring" | "chain";

type Row = {
  /** Height at each sample across the row, 0-1. */
  data: number[];
  src: PulsarSource;
  /** performance.now()/1000 when pushed. */
  at: number;
};

// ─── Geometry ───────────────────────────────────────────────────────────────
// Measured against the worst case — a row wiggling at full amplitude across its
// whole width — rather than against a typical one, because the penalty for
// guessing high is that the bridge blanks the entire frame.
//
//   W=1.70 amp=0.085 -> 15.00 units, 101% of budget: blanked
//   W=1.60 amp=0.055 -> 12.63 units,  85%: fits, with room for a spikier frame
//
// HEIGHT is nearly free — the inter-row step is a few points either way — so it
// is set by how the image should LOOK rather than by the budget. Kept tight
// enough that tall pulses reach into the row above and get occluded by it,
// which is the whole visual idea; a stack whose rows never touch is a set of
// graphs, not the pulsar plot.
const WIDTH = 1.50;          // normalised units, the drawn width of a row
const HEIGHT = 0.70;         // total vertical span of the stack
const MAX_ROWS = 6;
const AMP = 0.050;           // vertical excursion of one row's pulses

// Must match laser-bridge.js. If the bridge is reconfigured these are the two
// numbers to change together — they are what the budget is computed from.
const OMEGA_MAX = 10000;     // deg/s, from RATED_ANGLE * RATED_PPS / TRAVERSE_PTS
const DEG_PER_UNIT = 22.5;   // SCAN_ANGLE / 2
const FRAME_HZ = 30;
const PPS = 24000;
// The step the scanner can take between two points at PPS. Sampling closer than
// this leaves interpolateJumps nothing to do, which is the goal: every point we
// send is a point we chose, not one the bridge had to invent.
const MAX_STEP = OMEGA_MAX / PPS / DEG_PER_UNIT;
const INK_BUDGET = OMEGA_MAX / FRAME_HZ / DEG_PER_UNIT;
// The POINT budget is the one that actually binds, and it is the same limit
// wearing a different hat: every point is scanned FRAME_HZ times a second, so
// at exactly MAX_STEP per point, points x FRAME_HZ = pps and path / MAX_STEP =
// the point count. Any safety margin on step size buys itself out of the point
// budget, which is why the two are checked together.
const PT_BUDGET = PPS / FRAME_HZ;
const PT_SAFE = PT_BUDGET * 0.88;
// Leave headroom so a momentarily spikier row cannot tip the frame over the
// edge — at 100% the bridge blanks the whole thing.
const INK_SAFE = INK_BUDGET * 0.88;
// Emit a point just UNDER the limit rather than just over it. `carried >=
// MAX_STEP` looks right and is not: it emits when the accumulated distance has
// already reached the limit, so every segment lands fractionally OVER and buys
// itself one interpolated point. Measured, that put 495 of 515 segments over
// the limit and took a 516-point frame to 1041 — past the point budget, and
// blanked, on content whose PATH was only 77% of the ink budget.
const STEP_TARGET = MAX_STEP * 0.86;

// One hue per source, so a stack carrying several stays legible instead of
// becoming a single tangle. Colour is free: the fixture does analog modulation
// at 50 kHz, far above the point rate.
const HUES: Record<PulsarSource, [number, number, number]> = {
  mix:    [0, 200, 90],     // green, the engine as a whole
  corpus: [255, 170, 40],   // amber, the forest's own voice
  ring:   [120, 120, 255],  // blue, the calendar
  chain:  [255, 60, 90],    // red, the chain
};

const rows: Row[] = [];
let _enabled: Record<PulsarSource, boolean> = {
  mix: true, corpus: false, ring: false, chain: false,
};
let _timer: ReturnType<typeof setInterval> | null = null;
let _started = false;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const nowS = () => (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;

/** Which sources are ticked. Driven by /laser/src/* from the SC GUI. */
export function setPulsarSource(src: PulsarSource, on: boolean): void {
  if (src in _enabled) _enabled[src] = on;
}
export function pulsarSources(): Record<PulsarSource, boolean> {
  return { ..._enabled };
}

const ROW_MIN_GAP: Record<PulsarSource, number> = {
  // SC sends 20 spectra a second and the stack is six deep: unthrottled, the
  // whole plot would turn over three times a second, which reads as flicker
  // rather than as successive observations. Half a second gives a stack that
  // spans about three seconds and visibly scrolls.
  mix: 0.5, corpus: 0.5,
  // These are already event-paced — one clip, one block-burst — so they are
  // only guarded against a pathological flood.
  ring: 0.2, chain: 0.2,
};
const _lastPush: Record<PulsarSource, number> = { mix: 0, corpus: 0, ring: 0, chain: 0 };

/**
 * Push one observation onto the stack. `data` is a row of heights 0-1; it is
 * resampled to whatever the point budget allows, so callers may pass any length
 * — 48 spectrum bands, 24 hours of a day, however many transactions a block had.
 */
export function pushRow(src: PulsarSource, data: number[]): void {
  if (!_enabled[src] || !data || data.length < 2) return;
  const t = nowS();
  if (t - _lastPush[src] < ROW_MIN_GAP[src]) return;
  _lastPush[src] = t;
  rows.push({ data: data.slice(), src, at: t });
  while (rows.length > MAX_ROWS) rows.shift();
}

/** Sampled arc length of a point list, in normalised units. */
export function estimatePath(pts: LaserPoint[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return len;
}

function sampleRow(data: number[], t: number): number {
  const pos = clamp(t, 0, 1) * (data.length - 1);
  const lo = Math.floor(pos), hi = Math.min(data.length - 1, lo + 1);
  return data[lo] + (data[hi] - data[lo]) * (pos - lo);
}

/**
 * Build the frame. Rows are drawn front (newest, lowest, brightest) to back,
 * alternating direction so the beam never retraces.
 *
 * `silhouette` carries the running maximum height seen so far from the front,
 * which is what produces the album's occlusion: a segment of a far row that
 * falls below the skyline already drawn in front of it is blanked.
 */
export function buildFrame(): LaserPoint[] {
  const pts: LaserPoint[] = [];
  if (rows.length === 0) return pts;

  // ─── Sampled by ARC LENGTH, not by x ────────────────────────────────────
  // Spacing points evenly in x and sizing that spacing to the step limit leaves
  // nothing for the vertical component: the moment a row slopes, the real step
  // is hypot(dx, dy) and it exceeds the limit, so interpolateJumps inserts
  // points to cover it. Measured end to end, that turned a 528-point frame into
  // 1026 and put a 12-unit path — comfortably inside the INK budget — at 128%
  // of the POINT budget, which the bridge blanks.
  //
  // Both limits are real and they are the same limit seen twice: at exactly
  // MAX_STEP per point, points x FRAME_HZ = pps and path / MAX_STEP = the point
  // count. Walking the curve by arc length satisfies both at once, leaves
  // interpolateJumps nothing to do, and means every point we send is one we
  // chose rather than one the bridge had to invent.
  // Probe finely enough that the overshoot past STEP_TARGET cannot itself
  // cross MAX_STEP — the walk can only stop on a probe sample, so the probe
  // spacing is the error bar on every emitted step.
  const probe = Math.max(64, Math.ceil(WIDTH / MAX_STEP) * 8);
  const rowGap = rows.length > 1 ? HEIGHT / (rows.length - 1) : 0;
  // Silhouette is sampled on a fixed grid so rows compare against each other
  // even though each is walked independently.
  const SIL_N = 256;
  const silhouette = new Array(SIL_N).fill(-Infinity);

  // Newest last in `rows`, and the newest is drawn at the FRONT (bottom).
  const ordered = rows.slice().reverse();

  for (let r = 0; r < ordered.length; r++) {
    const row = ordered[r];
    const baseY = -HEIGHT / 2 + (r * rowGap);
    const [cr, cg, cb] = HUES[row.src];
    // Depth: rows further back are dimmer. This is the only cue that says which
    // observation is recent, and it costs nothing to draw.
    const depth = 1 - (r / Math.max(1, MAX_ROWS - 1)) * 0.72;
    const serpentine = (r % 2) === 1;

    // Walk the row, emitting a point every MAX_STEP of travelled distance.
    let carried = STEP_TARGET;   // force a point at the start of the row
    let px = 0, py = 0, first = true;
    for (let i = 0; i <= probe; i++) {
      const u = i / probe;
      const t = serpentine ? (1 - u) : u;
      const x = -WIDTH / 2 + t * WIDTH;
      const y = baseY + sampleRow(row.data, t) * AMP;

      if (!first) carried += Math.hypot(x - px, y - py);
      px = x; py = y;

      if (carried >= STEP_TARGET || i === probe) {
        carried = 0;
        const si = Math.min(SIL_N - 1, Math.max(0, Math.round(t * (SIL_N - 1))));
        const hidden = y < silhouette[si];
        if (!hidden) silhouette[si] = y;
        // The first point of each row travels in dark from wherever the
        // previous row ended. With serpentine that is only the row step.
        pts.push({
          x, y,
          r: Math.round(cr * depth), g: Math.round(cg * depth), b: Math.round(cb * depth),
          blank: first || hidden,
        });
        first = false;
      } else if (first) {
        first = false;
      }
    }
  }
  return pts;
}

/**
 * Fit the frame to the ink budget by dropping the OLDEST rows until it fits.
 * Oldest first because the newest observation is the one worth keeping, and
 * because dropping from the back shortens the stack without moving the front.
 */
function fitToBudget(): LaserPoint[] {
  let frame = buildFrame();
  let guard = MAX_ROWS + 1;
  while (rows.length > 1 && guard-- > 0
    && (frame.length > PT_SAFE || estimatePath(frame) > INK_SAFE)) {
    rows.shift();
    frame = buildFrame();
  }
  return frame;
}

function publish(): void {
  try {
    const w = window as unknown as { __laserFrame?: { points: LaserPoint[]; pps: number } | null };
    const anyOn = (Object.keys(_enabled) as PulsarSource[]).some((k) => _enabled[k]);
    // Nothing ticked, or nothing pushed yet: clear the override and let
    // laserTap fall back to the year ring. That is how the ring stays reachable
    // without needing a control of its own.
    if (!anyOn || rows.length === 0) { w.__laserFrame = null; return; }
    const points = fitToBudget();
    w.__laserFrame = points.length ? { points, pps: PPS } : null;
  } catch { /* the laser is never worth breaking the projector for */ }
}

export function initPulsarPlot(): void {
  if (_started) return;
  _started = true;
  // 30 Hz, matching the bridge's output cadence. laserTap dedupes unchanged
  // payloads on its own, so a static stack costs nothing downstream.
  _timer = setInterval(publish, 33);
}

export function stopPulsarPlot(): void {
  if (_timer) { clearInterval(_timer); _timer = null; }
  _started = false;
  rows.length = 0;
  try {
    (window as unknown as { __laserFrame?: unknown }).__laserFrame = null;
  } catch { /* ignore */ }
}

/** Test seam: the constants the budget arithmetic depends on. */
export const __budget = { WIDTH, HEIGHT, MAX_ROWS, AMP, MAX_STEP, STEP_TARGET,
  INK_BUDGET, INK_SAFE, PT_BUDGET, PT_SAFE };
