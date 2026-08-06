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
//              machine share → noiselevel. None of these three are claimed by
//              F, B, R or P, so no slot fights another over the same address.
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
  getPendingCalls?: () => PendingCall[] | null;
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
let _lastPush = { texture: -1, spatial: -1, noise: -1 };

// Calls per drain. A dawn chorus at the tide crest can outrun any transport;
// SC caps concurrent voices at ~sampleMaxVoices anyway, so flooding the socket
// only adds latency to the ones that do sound.
const MAX_CALLS_PER_TICK = 4;

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
  if (_unsubscribeStore) { _unsubscribeStore(); _unsubscribeStore = null; }
  _lastPush = { texture: -1, spatial: -1, noise: -1 };
  if (_instance) {
    try { _instance.destroy(); } catch { /* ignore */ }
    _instance = null;
  }
  // Leave no stale reading behind: a module that is gone should not still be
  // publishing an active species for the laser to project.
  try {
    const w = window as unknown as { __activeSpecies?: unknown; __antifoniaStrata?: unknown };
    if (w.__antifoniaStrata) w.__antifoniaStrata = undefined;
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

    const queued = _instance.getPendingCalls?.() ?? null;
    if (queued && queued.length && typeof send === "function") {
      const n = Math.min(MAX_CALLS_PER_TICK, queued.length);
      for (let i = 0; i < n; i++) {
        const c = queued[i];
        if (!c || c.smp < 0) continue;   // geophony has no recording yet
        try {
          send("/sample/trigger", [c.smp, c.amp, c.rate, c.hpf, c.lpf, c.pan, c.dur]);
        } catch { /* ignore */ }
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
    // spread; and the share of the mix that is machine raises the noise bed —
    // the electronic voice growing into ambient rather than sitting beside it.
    push("texturedepth", 0.18 + dens * 0.62, "texture");
    push("spatialspread", 0.20 + spread * 0.60, "spatial");
    push("noiselevel", 0.05 + machine * 0.45, "noise");
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
