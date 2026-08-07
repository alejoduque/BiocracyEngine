// antifonia.ts
// Loader + bidirectional bridge for the Antifonía artist module (switch [A]).
//
// Mirrors darkforest/darkforest.ts: the artist authors a standalone ES-module
// .js under ecosystems/…/modules/. We fetch it, strip its top-level
// import/export (illegal inside `new Function`), evaluate it with THREE /
// BaseThreeJsModule / loadJson injected, and bridge it to the parliament.
//
// What is different here, and why:
//
//   Every other slot's reverse path is a slow 0–1 push — one number per key,
//   deduped by a deadband. Antifonía also emits DISCRETE events: a call is a
//   moment, not a level. Those cannot go through hooks.sendOSC, which sends a
//   single float; they go through window.sendParliamentAction, the multi-arg
//   path, to /sample/trigger (10_sample_system.scd). The module never speaks
//   OSC itself — it exposes a queue and this file drains it, which is the same
//   contract the other four slots keep.
//
//   forward  · consensus → coherence, votes → pulse, tide → chorus density
//   surface  · the module reads window.__sonethParams / __phenoParams /
//              __ednaBio itself, every frame, like DarkForest does
//   reverse  · chorus density → texturedepth, spread → spatialspread,
//              machine share → memoryfeed. NOT noiselevel: that belongs to the
//              Master Amp / Noise Level / Drone Depth block the performer has
//              called finished, and a slot writing into it is a regression
//              wearing the costume of a coupling.
//   events   · calls → /sample/trigger [idx, amp, rate, hpf, lpf, pan, dur]

import * as THREE from "three";
import { BaseThreeJsModule } from "../helpers/threeBase";
import { parliamentStore } from "../parliament/parliamentStore";

type AFArg = Record<string, unknown> | undefined;

type PendingCall = {
  smp: number; amp: number; rate: number;
  hpf: number; lpf: number; pan: number; dur: number;
};

type ActiveSpecies = {
  sci: string; common: string | null; taxon: string;
  family: string | null; peakDay: number | null; day: number;
  sensitive: boolean;
  ring: { ang: number; r: number; x: number; y: number; z: number };
  t: number;
};

type AntifoniaInstance = {
  setMasterVol?: (o?: AFArg) => void;
  setTimeDilation?: (o?: AFArg) => void;
  setSpectralShift?: (o?: AFArg) => void;
  setSpatialSpread?: (o?: AFArg) => void;
  setCoherence?: (o?: AFArg) => void;
  pulse?: (o?: AFArg) => void;
  setHour?: (o?: AFArg) => void;
  setTide?: (v: number) => void;
  getVitality?: () => number;
  getCoherence?: () => number;
  getChorusDensity?: () => number;
  getMachineShare?: () => number;
  getSpread?: () => number;
  getHour?: () => number;
  getPendingCalls?: (max?: number) => PendingCall[] | null;
  getActiveSpecies?: () => ActiveSpecies | null;
  renderer?: { setSize: (w: number, h: number) => void; getPixelRatio?: () => number };
  camera?: { aspect: number; updateProjectionMatrix: () => void };
  destroy: () => void;
};

type AntifoniaHooks = {
  applyViz: (key: string, val: number) => void;
  sendOSC: (address: string, value: number) => void;
};

let _ctor: { new (container: HTMLElement): AntifoniaInstance } | null = null;
let _instance: AntifoniaInstance | null = null;
let _hooks: AntifoniaHooks | null = null;
let _unsubscribeStore: (() => void) | null = null;
let _voteTimer: ReturnType<typeof setInterval> | null = null;
let _reverseTimer: ReturnType<typeof setInterval> | null = null;
let _callTimer: ReturnType<typeof setInterval> | null = null;
let _lastVoteTime = 0;
let _lastPush = { texture: -1, spatial: -1, memory: -1 };

// Calls per drain, and the floor between two triggers.
//
// The cap alone was not enough: 4 per 120 ms tick is up to 33 field recordings
// a second, each several seconds long, overlapping into a permanent wash that
// masked the drone, the pads and the beat engine underneath it. A recording is
// an EVENT — one bird, once — not a texture generator. The interval is what
// makes it read as a call, and it follows the tide, so the crest is a chorus
// and the trough is a single voice at a time.
const MAX_CALLS_PER_TICK = 2;
const GAP_CREST = 420;    // ms, tide high
const GAP_TROUGH = 2600;  // ms, tide low
let _lastSampleAt = 0;

async function ensureConstructor() {
  if (_ctor) return _ctor;
  const res = await fetch(
    "/ecosystems/default_ecosystem/modules/Antifonia.js",
    { cache: "no-cache" }
  );
  if (!res.ok) throw new Error(`Antifonia fetch failed: ${res.status}`);
  const rawSrc = await res.text();
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
      `"use strict";\n${src}\n;return Antifonia;`
    );
  } catch (e) {
    console.error("[antifonia] SyntaxError in Antifonia.js:", e);
    throw e;
  }
  _ctor = factory(THREE, BaseThreeJsModule, loadJsonAtRuntime);
  if (!_ctor) throw new Error("[antifonia] Antifonia constructor came back undefined");
  return _ctor!;
}

export async function mountAntifonia(
  container: HTMLElement,
  hooks: AntifoniaHooks
): Promise<AntifoniaInstance> {
  destroyAntifonia();
  const Ctor = await ensureConstructor();
  _instance = new Ctor(container);
  _hooks = hooks;

  wireConsensusFromStore();
  wireForwardVotes();
  startCallDrain();
  startReverseBreath();
  return _instance;
}

export function destroyAntifonia() {
  if (_voteTimer) { clearInterval(_voteTimer); _voteTimer = null; }
  if (_reverseTimer) { clearInterval(_reverseTimer); _reverseTimer = null; }
  if (_callTimer) { clearInterval(_callTimer); _callTimer = null; }
  _lastSampleAt = 0;
  if (_unsubscribeStore) { _unsubscribeStore(); _unsubscribeStore = null; }
  _lastPush = { texture: -1, spatial: -1, memory: -1 };
  if (_instance) {
    try { _instance.destroy(); } catch { /* ignore */ }
    _instance = null;
  }
  // Leave no stale reading behind: a module that is gone should not still be
  // publishing an active species for the laser to project.
  try {
    const w = window as unknown as { __activeSpecies?: unknown; __antifoniaStrata?: unknown };
    if (w.__antifoniaStrata) w.__antifoniaStrata = undefined;
    // __activeSpecies too — the comment above said exactly this and the code
    // only cleared the strata. A torn-down slot kept its last species
    // published forever, so laserTap went on drawing that ring marker with no
    // slot producing it.
    w.__activeSpecies = undefined;
  } catch { /* ignore */ }
  _hooks = null;
}

// ─── Parliament consensus → chorus coherence ───────────────────────────────
function wireConsensusFromStore() {
  let lastSent = -1;
  _unsubscribeStore = parliamentStore.subscribe((state) => {
    if (!_instance || !_instance.setCoherence) return;
    const c = state.consensus ?? state.consensusWave;
    if (typeof c !== "number" || Math.abs(c - lastSent) < 0.01) return;
    lastSent = c;
    try { _instance.setCoherence!({ value: c }); } catch { /* ignore */ }
  });
}

// ─── Vote events → the room speaks ─────────────────────────────────────────
function wireForwardVotes() {
  _voteTimer = setInterval(() => {
    if (!_instance || !_instance.pulse) return;
    const ev = (window as unknown as {
      __voteEvent?: { type: string; intensity: number; time: number };
    }).__voteEvent;
    if (!ev || ev.time === _lastVoteTime) return;
    _lastVoteTime = ev.time;
    let intensity = 1.0;
    if (ev.type === "passed") intensity = 1.0 + Math.max(0, Math.min(1, ev.intensity)) * 1.5;
    else if (ev.type === "failed") intensity = 1.2;
    else if (ev.type === "emergency") intensity = 3.2;
    else if (ev.type === "start") intensity = 1.6;
    else if (ev.type === "stop") intensity = 0.6;
    try { _instance.pulse!({ intensity }); } catch { /* ignore */ }
  }, 90);
}

// ─── Calls → the field recordings (discrete events) ────────────────────────
function startCallDrain() {
  _callTimer = setInterval(() => {
    if (!_instance) return;

    // Tide in, so the module can thin its chorus through the trough. SC echoes
    // it on /tide/state; absent that, the module holds a flat 0.65 and still
    // works — the same "never stall waiting on the chain" rule the beat engine
    // follows.
    const tide = (window as unknown as { __tideState?: { value?: number } }).__tideState;
    if (tide && typeof tide.value === "number") {
      try { _instance.setTide?.(tide.value); } catch { /* ignore */ }
    }

    const send = (window as unknown as {
      sendParliamentAction?: (address: string, args: number[]) => void;
    }).sendParliamentAction;

    // Ask for exactly what this tick can send; the rest stays queued.
    const queued = _instance.getPendingCalls?.(MAX_CALLS_PER_TICK) ?? null;
    if (queued && queued.length && typeof send === "function") {
      const tv = tide && typeof tide.value === "number" ? clamp01(tide.value) : 0.65;
      const gap = GAP_TROUGH + (GAP_CREST - GAP_TROUGH) * tv;
      const now = Date.now();
      let fired = 0;
      // `now` is sampled once, and _lastSampleAt was being set to that same
      // value — so the gap test tripped on the second iteration and
      // MAX_CALLS_PER_TICK could never be reached. The measured rate was right
      // by accident; the constant was a lie. Stagger the stamps so a crest can
      // genuinely fire two.
      for (let i = 0; i < queued.length && fired < MAX_CALLS_PER_TICK; i++) {
        const c = queued[i];
        if (!c || c.smp < 0) continue;         // geophony has no recording yet
        if (now + fired * gap - _lastSampleAt < gap) break;
        _lastSampleAt = now + fired * gap;
        try {
          send("/sample/trigger", [c.smp, c.amp, c.rate, c.hpf, c.lpf, c.pan, c.dur]);
        } catch { /* ignore */ }
        fired++;
      }
    }

    // Publish what the room is saying, in the shapes the rest of the parliament
    // already reads. __activeSpecies keeps PhenologicalCalendar's exact shape so
    // laserTap.ts and Registro need no second format.
    try {
      const sp = _instance.getActiveSpecies?.();
      if (sp) (window as unknown as { __activeSpecies?: unknown }).__activeSpecies = sp;
    } catch { /* ignore */ }
  }, 120);
}

// ─── Chorus → texture / spread / machine noise (reverse breath) ────────────
function startReverseBreath() {
  _reverseTimer = setInterval(() => {
    if (!_instance || !_hooks) return;
    const dens = clamp01(_instance.getChorusDensity?.() ?? 0);
    const spread = clamp01(_instance.getSpread?.() ?? 0.5);
    const machine = clamp01(_instance.getMachineShare?.() ?? 0);

    // A fuller chorus thickens the grain; the room's width becomes the spatial
    // spread; the machine's share of the room feeds the delay, so the
    // electronic voice grows into ambient by SMEARING rather than by adding a
    // separate noise bed.
    //
    // ⚠ THIS SLOT MUST NOT WRITE noiselevel. It did, pinning it to 0.05
    // whenever no aircraft or tape was sounding — and noiselevel belongs to
    // the Master Amp / Filt Cutoff / Noise Level / Noise Filt / Drone Depth
    // block that the performer has explicitly called finished. A visualization
    // reaching into a block that is already right is not a coupling, it is a
    // regression with an alibi. That is most of where the richness went.
    //
    // The floors are deliberately generous. A reverse-breath value does not
    // modulate the performer's setting, it REPLACES it, so a range starting at
    // 0.18 means an idle chorus drags the whole timbre down to near nothing
    // and holds it there. These start where the sound is already alive.
    push("texturedepth", 0.30 + dens * 0.48, "texture");
    push("spatialspread", 0.28 + spread * 0.50, "spatial");
    push("memoryfeed", 0.24 + machine * 0.40, "memory");
  }, 280);
}

function push(key: string, value: number, slot: keyof typeof _lastPush) {
  if (!_hooks) return;
  if (Math.abs(value - _lastPush[slot]) < 0.01) return;
  _lastPush[slot] = value;
  try { _hooks.applyViz(key, value); } catch { /* ignore */ }
  try { _hooks.sendOSC(`/soneth/${key}`, value); } catch { /* ignore */ }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
}
