import * as THREE from "three";
import { BaseThreeJsModule } from "../helpers/threeBase";
import { parliamentStore } from "../parliament/parliamentStore";

type PhenoMethodArg = Record<string, unknown> | undefined;
type PhenoInstance = {
  day: number;
  species: Array<{ peakDay: number; window?: number; taxon: string }>;
  pulse: (opts?: PhenoMethodArg) => void;
  setDay: (opts?: PhenoMethodArg) => void;
  advance: (opts?: PhenoMethodArg) => void;
  autoplay: (opts?: PhenoMethodArg) => void;
  jumpToMonth: (opts?: PhenoMethodArg) => void;
  focusTaxon: (opts?: PhenoMethodArg) => void;
  setRotation?: (opts?: PhenoMethodArg) => void;
  triggerCO2?: (opts?: PhenoMethodArg) => void;
  triggerMycoPulse?: (opts?: PhenoMethodArg) => void;
  triggerPhosphorus?: (opts?: PhenoMethodArg) => void;
  triggerNitrogen?: (opts?: PhenoMethodArg) => void;
  destroy: () => void;
};

type BreathHooks = {
  applyViz: (key: string, val: number) => void;
  sendOSC: (address: string, value: number) => void;
};

let _ctor: { new (container: HTMLElement): PhenoInstance } | null = null;
let _instance: PhenoInstance | null = null;
let _hooks: BreathHooks | null = null;
let _voteListenerWired = false;
let _reverseTimer: ReturnType<typeof setInterval> | null = null;
let _lastSentHarmonic = -1;
let _lastSentTexture = -1;

async function ensureConstructor() {
  if (_ctor) return _ctor;
  const res = await fetch(
    "/ecosystems/default_ecosystem/modules/PhenologicalCalendar.js",
    { cache: "no-cache" }
  );
  if (!res.ok) throw new Error(`PhenoCalendar fetch failed: ${res.status}`);
  const rawSrc = await res.text();
  // The artist's .js ends with `export default PhenologicalCalendar;` (ES module
  // syntax), which is illegal inside `new Function(...)` and would throw
  // SyntaxError silently swallowing the whole mount. Strip all top-level
  // `export` and `import` statements before evaluating.
  const src = rawSrc
    .replace(/^\s*export\s+default\s+\w+\s*;?\s*$/gm, "")
    .replace(/^\s*export\s+/gm, "")
    .replace(/^\s*import\s+[^;]+;?\s*$/gm, "");

  const loadJsonAtRuntime = async (rel: unknown) => {
    const r = await fetch(
      `/ecosystems/default_ecosystem/assets/${String(rel || "")}`,
      { cache: "no-cache" }
    );
    if (!r.ok) return null;
    try { return await r.json(); } catch { return null; }
  };

  let factory: Function;
  try {
    factory = new Function(
      "THREE",
      "BaseThreeJsModule",
      "loadJson",
      `"use strict";\n${src}\n;return PhenologicalCalendar;`
    );
  } catch (e) {
    console.error("[phenology/breath] SyntaxError in PhenologicalCalendar.js:", e);
    throw e;
  }
  _ctor = factory(THREE, BaseThreeJsModule, loadJsonAtRuntime);
  if (!_ctor) {
    throw new Error("[phenology/breath] PhenologicalCalendar constructor came back undefined");
  }
  return _ctor!;
}

let _unsubscribeStore: (() => void) | null = null;

export async function mountPhenologyCalendar(
  container: HTMLElement,
  hooks: BreathHooks
): Promise<PhenoInstance> {
  destroyPhenologyCalendar();
  const Ctor = await ensureConstructor();
  _instance = new Ctor(container);
  _hooks = hooks;
  _instance.setDay({ day: dayOfYearToday() });
  // Slow scientific sweep — full year ~7.6 min. The rotation slider on the
  // parliament re-tunes this in real time via wireRotationFromStore.
  _instance.autoplay({ enabled: true, daysPerSecond: 0.8 });

  wireForwardBreath();
  wireRotationFromStore();
  wireBiogeochemFromStore();
  startReverseBreath();
  return _instance;
}

export function destroyPhenologyCalendar() {
  stopReverseBreath();
  if (_unsubscribeStore) { _unsubscribeStore(); _unsubscribeStore = null; }
  if (_instance) {
    try { _instance.destroy(); } catch { /* ignore */ }
    _instance = null;
  }
  _hooks = null;
}

// ─── Rotation slider → daysPerSecond ───────────────────────────────────────
// The /parliament/rotation slider (0.1..2.0) becomes the scientific sweep
// speed. Subscribing rather than polling keeps the calendar locked to the
// same control surface that already drives parliament rotation.
function wireRotationFromStore() {
  let lastSent = -1;
  _unsubscribeStore = parliamentStore.subscribe((state) => {
    if (!_instance || !_instance.setRotation) return;
    const r = state.rotation;
    if (Math.abs(r - lastSent) < 0.01) return;
    lastSent = r;
    try { _instance.setRotation!({ rotation: r }); } catch { /* ignore */ }
  });
}

// ─── ETH biogeochem (/eco/*) → on-ring effects ─────────────────────────────
// The eth_sonify pipeline writes /eco/co2 /eco/mycoPulse /eco/phosphorus
// /eco/nitrogen into parliamentStore. We poll those four fields and fire the
// calendar's triggerXxx methods on threshold crossings. This is the
// biogeochem layer that used to live in BiocracyVisualizer — now anchored
// to live phenology positions on the same ring.
function wireBiogeochemFromStore() {
  let last = { co2: 0, mycoPulse: 0, phosphorus: 0, nitrogen: 0 };
  setInterval(() => {
    if (!_instance) return;
    const eco = parliamentStore.state?.eco;
    if (!eco) return;
    if (eco.co2 > last.co2 + 0.05) {
      const amount = Math.max(10, Math.min(200, eco.co2 * 200));
      try { _instance.triggerCO2?.({ amount }); } catch { /* ignore */ }
    }
    if (eco.mycoPulse > last.mycoPulse + 0.05) {
      const intensity = Math.max(0.4, Math.min(5, eco.mycoPulse * 4));
      try { _instance.triggerMycoPulse?.({ intensity }); } catch { /* ignore */ }
    }
    if (eco.phosphorus > last.phosphorus + 0.05) {
      const amount = Math.max(10, Math.min(100, eco.phosphorus * 100));
      try { _instance.triggerPhosphorus?.({ amount }); } catch { /* ignore */ }
    }
    if (eco.nitrogen > last.nitrogen + 0.05) {
      const amount = Math.max(10, Math.min(100, eco.nitrogen * 100));
      try { _instance.triggerNitrogen?.({ amount }); } catch { /* ignore */ }
    }
    last = {
      co2: eco.co2 * 0.92,
      mycoPulse: eco.mycoPulse * 0.92,
      phosphorus: eco.phosphorus * 0.92,
      nitrogen: eco.nitrogen * 0.92,
    };
  }, 140);
}

// ─── Parliament → Calendar (forward breath) ───────────────────────────────
// Vote events already publish to window.__voteEvent. We listen on the same
// channel so the calendar pulses in time with the chamber, no extra plumbing.
function wireForwardBreath() {
  if (_voteListenerWired) return;
  _voteListenerWired = true;
  let lastVoteTime = 0;
  setInterval(() => {
    if (!_instance) return;
    const ev = (window as unknown as {
      __voteEvent?: { type: string; intensity: number; time: number };
    }).__voteEvent;
    if (!ev || ev.time === lastVoteTime) return;
    lastVoteTime = ev.time;
    let intensity = 1.0;
    if (ev.type === "passed") intensity = 1.0 + Math.max(0, Math.min(1, ev.intensity)) * 1.5;
    else if (ev.type === "failed") intensity = 1.2;
    else if (ev.type === "emergency") intensity = 3.4;
    else if (ev.type === "start") intensity = 1.6;
    else if (ev.type === "stop") intensity = 0.6;
    try { _instance.pulse({ intensity }); } catch { /* ignore */ }
  }, 80);
}

// Kept for compatibility — beat tempo no longer drives the calendar sweep
// (rotation slider does). The beat now expresses itself as a subtle pulse
// every downbeat, not a year-speed override.
export function notifyBeatTempo(beatTempo01: number) {
  if (!_instance) return;
  const intensity = 0.7 + Math.max(0, Math.min(1, beatTempo01)) * 0.5;
  try { _instance.pulse({ intensity }); } catch { /* ignore */ }
}

// ─── Calendar → Parliament (reverse breath) ───────────────────────────────
// Today's seasonal weight (rainy-vs-dry) and the fraction of species in peak
// modulate the parliament's harmonic richness and textural density — both
// visually (applyViz writes to __slotNSoneth) and audibly (sendOSC to SC).
//
// Córdoba bimodal rainfall, peaks ~ day 115 (late Apr) and day 270 (late Sep).
export function seasonalWeight(day: number): number {
  const a = Math.cos((2 * Math.PI * (day - 115)) / 365);
  const b = Math.cos((2 * Math.PI * (day - 270)) / 365);
  return ((a + b) / 2 + 1) / 2;
}

function activeSpeciesFraction(day: number): number {
  if (!_instance || !_instance.species?.length) return 0;
  let n = 0;
  for (const s of _instance.species) {
    let d = Math.abs(s.peakDay - day);
    if (d > 182) d = 365 - d;
    if (d <= (s.window ?? 30)) n++;
  }
  return n / _instance.species.length;
}

function startReverseBreath() {
  stopReverseBreath();
  // ~3 Hz update — slow enough that the parliament feels the season as a
  // gentle drift, fast enough to track day-jumps without lag.
  _reverseTimer = setInterval(() => {
    if (!_instance || !_hooks) return;
    const day = _instance.day;
    const wet = seasonalWeight(day);
    const dense = activeSpeciesFraction(day);

    // Map wet/dense → existing sonETH params. Bias toward the central 0.5 so
    // the season is a *modulation* on top of any human knob position rather
    // than a hard override.
    const harmonic = 0.35 + wet * 0.45;     // 0.35 dry → 0.80 rainy
    const texture = 0.25 + dense * 0.55;    // 0.25 sparse → 0.80 dense

    if (Math.abs(harmonic - _lastSentHarmonic) > 0.01) {
      _lastSentHarmonic = harmonic;
      _hooks.applyViz("harmonicrich", harmonic);
      _hooks.sendOSC("/control/harmonicrich", harmonic);
    }
    if (Math.abs(texture - _lastSentTexture) > 0.01) {
      _lastSentTexture = texture;
      _hooks.applyViz("texturedepth", texture);
      _hooks.sendOSC("/control/texturedepth", texture);
    }
  }, 320);
}

function stopReverseBreath() {
  if (_reverseTimer) {
    clearInterval(_reverseTimer);
    _reverseTimer = null;
  }
  _lastSentHarmonic = -1;
  _lastSentTexture = -1;
}

function dayOfYearToday(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  return Math.max(1, Math.min(365, Math.floor(diff / 86_400_000)));
}
