// btransito.ts
// Loader + bidirectional bridge for the Transito artist module (switch [B]).
//
// Mirrors darkforest/darkforest.ts: the artist authors a standalone ES-module
// .js under ecosystems/…/modules/Transito.js. We fetch it, strip its top-level
// import/export (illegal inside `new Function`), evaluate it with THREE /
// BaseThreeJsModule / loadJson injected, and bridge it to the parliament flow.
//
// Synesthetic coupling (the point of slot B — proving the shared drone):
//   forward  · ETH /eco/* + parliament consensus + vote events → Transito
//              (eco bursts spawn voices; consensus sets coherence; votes pulse)
//   surface  · the index.html sonETH controls are read by the module itself
//              each frame from window.__sonethParams (same values that drive
//              the audio), so the diagram and the sound move as one.
//   reverse  · the deliberative THROUGHPUT (how many voices reach INSCRIBED) +
//              coherence flow back into the drone family
//              (/soneth/dronedepth · dronemix · dronefade · dronespace) — the
//              very busses `\opalDrone` reads. The same opalDrone the ETH /tx
//              inflow drives now also deepens with the parliament's work, which
//              is exactly what slot B sets out to demonstrate. The pushed values
//              are mirrored to window.__transitoDrone so the module HUD can
//              print them ("DRONE ← tránsito → SC").

import * as THREE from "three";
import { BaseThreeJsModule } from "../helpers/threeBase";
import { parliamentStore } from "../parliament/parliamentStore";

type TArg = Record<string, unknown> | undefined;
type TransitoInstance = {
  setMasterVol?: (o?: TArg) => void;
  setPitchShift?: (o?: TArg) => void;
  setTimeDilation?: (o?: TArg) => void;
  setSpectralShift?: (o?: TArg) => void;
  setSpatialSpread?: (o?: TArg) => void;
  setCoherence?: (o?: TArg) => void;
  pulse?: (o?: TArg) => void;
  emitVoice?: (o?: TArg) => void;
  whisper?: (o?: TArg) => void;
  triggerCO2?: (o?: TArg) => void;
  triggerMycoPulse?: (o?: TArg) => void;
  triggerPhosphorus?: (o?: TArg) => void;
  triggerNitrogen?: (o?: TArg) => void;
  getThroughput?: () => number;
  getVitality?: () => number;
  getCoherence?: () => number;
  getOpacityLoad?: () => number;
  renderer?: { setSize: (w: number, h: number) => void; getPixelRatio?: () => number };
  camera?: { aspect: number; updateProjectionMatrix: () => void };
  destroy: () => void;
};

type TransitoHooks = {
  applyViz: (key: string, val: number) => void;
  sendOSC: (address: string, value: number) => void;
};

let _ctor: { new (container: HTMLElement): TransitoInstance } | null = null;
let _instance: TransitoInstance | null = null;
let _hooks: TransitoHooks | null = null;
let _unsubscribeStore: (() => void) | null = null;
let _ecoTimer: ReturnType<typeof setInterval> | null = null;
let _voteTimer: ReturnType<typeof setInterval> | null = null;
let _reverseTimer: ReturnType<typeof setInterval> | null = null;
let _lastVoteTime = 0;
let _lastDrone = { depth: -1, mix: -1, fade: -1, space: -1 };

async function ensureConstructor() {
  if (_ctor) return _ctor;
  const res = await fetch(
    "/ecosystems/default_ecosystem/modules/Transito.js",
    { cache: "no-cache" }
  );
  if (!res.ok) throw new Error(`Transito fetch failed: ${res.status}`);
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
      `"use strict";\n${src}\n;return Transito;`
    );
  } catch (e) {
    console.error("[transito] SyntaxError in Transito.js:", e);
    throw e;
  }
  _ctor = factory(THREE, BaseThreeJsModule, loadJsonAtRuntime);
  if (!_ctor) throw new Error("[transito] Transito constructor came back undefined");
  return _ctor!;
}

export async function mountTransito(
  container: HTMLElement,
  hooks: TransitoHooks
): Promise<TransitoInstance> {
  destroyTransito();
  const Ctor = await ensureConstructor();
  _instance = new Ctor(container);
  _hooks = hooks;

  wireEcoFromStore();
  wireConsensusFromStore();
  wireForwardVotes();
  startReverseBreath();
  return _instance;
}

export function destroyTransito() {
  if (_ecoTimer) { clearInterval(_ecoTimer); _ecoTimer = null; }
  if (_voteTimer) { clearInterval(_voteTimer); _voteTimer = null; }
  if (_reverseTimer) { clearInterval(_reverseTimer); _reverseTimer = null; }
  if (_unsubscribeStore) { _unsubscribeStore(); _unsubscribeStore = null; }
  _lastDrone = { depth: -1, mix: -1, fade: -1, space: -1 };
  if (_instance) {
    try { _instance.destroy(); } catch { /* ignore */ }
    _instance = null;
  }
  _hooks = null;
}

// ─── ETH /eco/* → voices entering the machine (forward) ────────────────────
function wireEcoFromStore() {
  let last = { co2: 0, mycoPulse: 0, phosphorus: 0, nitrogen: 0 };
  _ecoTimer = setInterval(() => {
    if (!_instance) return;
    const eco = parliamentStore.state?.eco;
    if (!eco) return;
    if (eco.co2 > last.co2 + 0.05) {
      _instance.triggerCO2?.({ amount: Math.max(10, Math.min(200, eco.co2 * 200)) });
    }
    if (eco.mycoPulse > last.mycoPulse + 0.05) {
      _instance.triggerMycoPulse?.({ intensity: Math.max(0.4, Math.min(5, eco.mycoPulse * 4)) });
    }
    if (eco.phosphorus > last.phosphorus + 0.05) {
      _instance.triggerPhosphorus?.({ amount: Math.max(10, Math.min(100, eco.phosphorus * 100)) });
    }
    if (eco.nitrogen > last.nitrogen + 0.05) {
      _instance.triggerNitrogen?.({ amount: Math.max(10, Math.min(100, eco.nitrogen * 100)) });
    }
    last = {
      co2: eco.co2 * 0.92,
      mycoPulse: eco.mycoPulse * 0.92,
      phosphorus: eco.phosphorus * 0.92,
      nitrogen: eco.nitrogen * 0.92,
    };
  }, 140);
}

// ─── Parliament consensus → coherence (drives the opacity-clause probability) ─
function wireConsensusFromStore() {
  let lastSent = -1;
  _unsubscribeStore = parliamentStore.subscribe((state) => {
    if (!_instance || !_instance.setCoherence) return;
    const c = state.consensusWave ?? state.consensus;
    if (typeof c !== "number" || Math.abs(c - lastSent) < 0.01) return;
    lastSent = c;
    try { _instance.setCoherence!({ value: c }); } catch { /* ignore */ }
  });
}

// ─── Vote events → pulse + voice burst (forward) ───────────────────────────
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

// ─── Throughput → drone family (reverse breath — THE PROOF) ────────────────
// Routed through the Overlap-Buffer logic: simulate the proposed drone, apply
// the opacity clause (the retained fraction must not fully inscribe to sound),
// and HOLD a large change while consensus is low (simulate-before-execute). The
// committed values + veil + held flag are mirrored to window.__transitoDrone so
// the module HUD shows the gate working.
let _lastProposed = { depth: 0, mix: 0, fade: 0, space: 0 };
function startReverseBreath() {
  _reverseTimer = setInterval(() => {
    if (!_instance || !_hooks) return;
    const thr = clamp01(_instance.getThroughput?.() ?? _instance.getVitality?.() ?? 0);
    const coh = clamp01(_instance.getCoherence?.() ?? 0.5);
    const opacityLoad = clamp01(_instance.getOpacityLoad?.() ?? 0);
    let spread = 0.5;
    try {
      const sp = (window as unknown as { __sonethParams?: { spatialspread?: number } }).__sonethParams;
      if (sp && typeof sp.spatialspread === "number") spread = clamp01(sp.spatialspread);
    } catch { /* ignore */ }

    // 1 · simulate the proposed drone from the machine's state
    const proposed = {
      depth: 0.22 + thr * 0.63,
      mix: 0.30 + thr * 0.50,
      fade: 0.30 + coh * 0.45,
      space: 0.30 + spread * 0.45,
    };

    // 2 · opacity clause on output — the veiled/retained fraction does not sound
    const veil = 1 - opacityLoad * 0.6; // up to −60% when fully retained

    // 3 · deliberation gate — a large jump without consensus is held this tick
    //     (the event waits in the buffer instead of being executed unilaterally)
    const jump = Math.max(
      Math.abs(proposed.depth - _lastProposed.depth),
      Math.abs(proposed.mix - _lastProposed.mix),
    );
    const held = jump > 0.25 && coh < 0.30;
    _lastProposed = proposed;

    if (!held) {
      pushDrone("dronedepth", proposed.depth * veil, "depth");
      pushDrone("dronemix", proposed.mix * veil, "mix");
      pushDrone("dronefade", proposed.fade, "fade");
      pushDrone("dronespace", proposed.space, "space");
    }

    // Mirror committed values + gate state for the HUD proof.
    (window as unknown as { __transitoDrone?: Record<string, number | boolean> }).__transitoDrone = {
      depth: proposed.depth * veil, mix: proposed.mix * veil,
      fade: proposed.fade, space: proposed.space, veil, held,
    };
  }, 280);
}

function pushDrone(key: string, value: number, slot: keyof typeof _lastDrone) {
  if (!_hooks) return;
  if (Math.abs(value - _lastDrone[slot]) < 0.01) return;
  _lastDrone[slot] = value;
  try { _hooks.applyViz(key, value); } catch { /* ignore */ }
  try { _hooks.sendOSC(`/soneth/${key}`, value); } catch { /* ignore */ }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
}
