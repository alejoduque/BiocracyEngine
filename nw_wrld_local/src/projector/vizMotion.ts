// vizMotion.ts
// Shared idle-driven motion + vote-flash for every visualization slot.
//
// Two controls were meant to reach all sixteen slots and reached almost none.
// ROTATION SPD (/parliament/rotation) landed in parliamentStore.state.rotation
// and exactly ONE slot read it — the phenological calendar, where it sets the
// year-sweep rate, not any rotation. And there was no idle detection anywhere
// in the projector: no pointerdown, no wheel, no OrbitControls "start"
// listener existed at all.
//
// This module is the single place both of those live, so a slot opts in by
// reading one global rather than by growing its own timer and its own
// listeners. It is the same shape as __ednaBio: one object, MUTATED IN PLACE,
// so a consumer can hold the reference and read it every frame for free.
//
//   window.__vizMotion = { rotation, idle, factor, speed, t }
//
// `speed` is the number a module multiplies by. Everything else is exposed so
// a module can be cleverer if its idiom calls for it (the calendar wants the
// raw `rotation` for its year rate as well as `speed` for its spin).

import { parliamentStore } from "./parliament/parliamentStore";

export type VizMotion = {
  /** 0.1–2.0, straight off the ROTATION SPD slider. */
  rotation: number;
  /** Seconds since the user last touched anything. */
  idle: number;
  /** 0→1, eased in once idle passes IDLE_AFTER. */
  factor: number;
  /** rotation × factor × BASE — radians/second for a slot's own spin. */
  speed: number;
  /**
   * Accumulated drift, in radians. Integrated here so a slot can simply write
   * `group.rotation.y = vm.angle * k` — most of the loops that need this are
   * frame-counter based and have no dt of their own to integrate with, and
   * every slot integrating separately would drift out of step with the rest.
   */
  angle: number;
  /** Monotonic seconds since mount, for slots that want a phase. */
  t: number;
};

// Idle is not "stopped moving the mouse" — it is "stopped operating the
// instrument". 8 s is long enough that adjusting three sliders in a row never
// trips it, short enough that stepping back from the desk starts the drift
// before anyone wonders if it is broken.
const IDLE_AFTER = 8.0;
// Eased in rather than switched on, or the scene visibly lurches into motion
// the moment the timer expires.
const RAMP = 4.0;
// At rotation = 1.0 and full idle this is one turn every ~3 minutes. The brief
// was "slow, very slow": the motion should be undetectable frame to frame and
// obvious if you look away and back.
// Measured, not assumed: at (2π)/180 the camera swung 20° in 5 s — a full turn
// every ~90 s, which reads as a slow pan rather than a drift. OrbitControls'
// autoRotate is also frame-rate dependent (it advances a fixed angle per
// frame), so on a fast display it runs faster still. Halved, which puts a turn
// at ~3 minutes on this machine.
const BASE = Math.PI / 180;

const motion: VizMotion = {
  rotation: 1.0,
  idle: 0,
  factor: 0,
  speed: 0,
  angle: 0,
  t: 0,
};

let lastInteraction = 0;
let t0 = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let listenersBound = false;

function now(): number {
  return (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
}

/** Any surface the performer can operate resets the idle clock. */
export function noteInteraction(): void {
  lastInteraction = now();
}

function bindListeners(): void {
  if (listenersBound || typeof document === "undefined") return;
  listenersBound = true;
  // Captured at the document, so BOTH the HTML control panel and a camera drag
  // inside the viewport reset the clock with no per-module wiring. Capture
  // phase because some handlers stop propagation; passive because none of this
  // ever wants to preventDefault.
  //
  // pointerdown rather than pointermove: a mouse crossing the window on its way
  // somewhere else is not someone operating the instrument, and treating it as
  // interaction would mean the drift never starts on a desk with a live mouse.
  for (const ev of ["pointerdown", "wheel", "keydown", "input"]) {
    document.addEventListener(ev, noteInteraction, { capture: true, passive: true });
  }
}

export function startVizMotion(): VizMotion {
  bindListeners();
  if (t0 === 0) t0 = now();
  if (lastInteraction === 0) lastInteraction = now();
  if (!timer) {
    // 10 Hz is ample: `factor` ramps over seconds and `speed` is applied by the
    // consumer per frame. Anything faster would just be a busier timer.
    timer = setInterval(tick, 100);
    tick();
  }
  try {
    (window as unknown as { __vizMotion?: VizMotion }).__vizMotion = motion;
  } catch { /* ignore */ }
  return motion;
}

export function stopVizMotion(): void {
  if (timer) { clearInterval(timer); timer = null; }
}

let lastTick = 0;

function tick(): void {
  const n = now();
  const dt = lastTick === 0 ? 0 : Math.min(0.5, n - lastTick);
  lastTick = n;
  motion.t = n - t0;
  motion.idle = n - lastInteraction;

  const r = parliamentStore.state?.rotation;
  if (typeof r === "number" && isFinite(r)) motion.rotation = r;

  const over = motion.idle - IDLE_AFTER;
  const raw = over <= 0 ? 0 : Math.min(1, over / RAMP);
  // smoothstep, so it neither starts nor settles with a visible corner
  motion.factor = raw * raw * (3 - 2 * raw);
  motion.speed = motion.rotation * motion.factor * BASE;
  motion.angle += motion.speed * dt;
}

/**
 * The __voteEvent poll with linear decay, factored out of slots 1 and 3 which
 * both open-coded it. `flash` is 1 → 0 over `windowMs`.
 *
 * Slots that want to fire once per vote should dedupe on `time` themselves;
 * slots that want a decaying visual just read `flash`.
 */
export type VoteFlash = {
  type: string;
  intensity: number;
  time: number;
  flash: number;
};

export function readVoteFlash(windowMs = 1500): VoteFlash | null {
  let ev: { type: string; intensity: number; time: number } | undefined;
  try {
    ev = (window as unknown as {
      __voteEvent?: { type: string; intensity: number; time: number };
    }).__voteEvent;
  } catch { return null; }
  if (!ev || typeof ev.time !== "number") return null;
  const age = (typeof performance !== "undefined" ? performance.now() : Date.now()) - ev.time;
  if (age < 0 || age > windowMs) return null;
  return {
    type: ev.type,
    intensity: typeof ev.intensity === "number" ? ev.intensity : 1,
    time: ev.time,
    flash: 1 - age / windowMs,
  };
}

/**
 * Whether a vote type reads as alarm rather than assent. `failed` was handled
 * in eight places and produced in none until the SC vote-result path was wired
 * up; it belongs on this side with `emergency`.
 */
export function isAlarm(type: string | undefined): boolean {
  return type === "failed" || type === "emergency" || type === "stop";
}

export function getVizMotion(): VizMotion {
  return motion;
}
