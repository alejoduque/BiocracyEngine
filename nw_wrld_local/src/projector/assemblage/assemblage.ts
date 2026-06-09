// assemblage.ts
// Loader + bidirectional bridge for the Sympoiesis artist module (switch [F]).
//
// Mirrors phenology/breath.ts: the artist authors a standalone ES-module .js
// under ecosystems/…/modules/. We fetch it, strip its top-level import/export
// (illegal inside `new Function`), evaluate it with THREE / BaseThreeJsModule /
// loadJson injected, and bridge it to the parliament data flow.
//
// Synesthetic coupling (the whole point of slot F):
//   forward  · ETH /eco/* + parliament consensus + vote events  → the assemblage
//   surface  · the 5 index.html controls (Master Vol, Pitch Shift, Time Dilat,
//              Spectral Sh, Spatial Sprd) are read by the module itself each
//              frame from window.__sonethParams — the same values that drive the
//              drone — so image and sound move as one.
//   reverse  · the assemblage's accumulated vitality (ETH throughput) and
//              coherence flow back into the drone (dronedepth / dronemix /
//              atmospheremix / harmonicrich), deepening the basic drone sounds.

import * as THREE from "three";
import { BaseThreeJsModule } from "../helpers/threeBase";
import { parliamentStore } from "../parliament/parliamentStore";

type AssemblageArg = Record<string, unknown> | undefined;
type AssemblageInstance = {
  setMasterVol?: (o?: AssemblageArg) => void;
  setPitchShift?: (o?: AssemblageArg) => void;
  setTimeDilation?: (o?: AssemblageArg) => void;
  setSpectralShift?: (o?: AssemblageArg) => void;
  setSpatialSpread?: (o?: AssemblageArg) => void;
  setCoherence?: (o?: AssemblageArg) => void;
  pulse?: (o?: AssemblageArg) => void;
  whisper?: (o?: AssemblageArg) => void;
  triggerCO2?: (o?: AssemblageArg) => void;
  triggerMycoPulse?: (o?: AssemblageArg) => void;
  triggerPhosphorus?: (o?: AssemblageArg) => void;
  triggerNitrogen?: (o?: AssemblageArg) => void;
  getVitality?: () => number;
  getCoherence?: () => number;
  renderer?: { setSize: (w: number, h: number) => void; getPixelRatio?: () => number };
  camera?: { aspect: number; updateProjectionMatrix: () => void };
  destroy: () => void;
};

type AssemblageHooks = {
  applyViz: (key: string, val: number) => void;
  sendOSC: (address: string, value: number) => void;
};

let _ctor: { new (container: HTMLElement): AssemblageInstance } | null = null;
let _instance: AssemblageInstance | null = null;
let _hooks: AssemblageHooks | null = null;
let _unsubscribeStore: (() => void) | null = null;
let _ecoTimer: ReturnType<typeof setInterval> | null = null;
let _voteTimer: ReturnType<typeof setInterval> | null = null;
let _reverseTimer: ReturnType<typeof setInterval> | null = null;
let _lastVoteTime = 0;
let _lastDrone = { depth: -1, mix: -1, atmos: -1, harm: -1 };

async function ensureConstructor() {
  if (_ctor) return _ctor;
  const res = await fetch(
    "/ecosystems/default_ecosystem/modules/Sympoiesis.js",
    { cache: "no-cache" }
  );
  if (!res.ok) throw new Error(`Sympoiesis fetch failed: ${res.status}`);
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
      `"use strict";\n${src}\n;return Sympoiesis;`
    );
  } catch (e) {
    console.error("[assemblage] SyntaxError in Sympoiesis.js:", e);
    throw e;
  }
  _ctor = factory(THREE, BaseThreeJsModule, loadJsonAtRuntime);
  if (!_ctor) throw new Error("[assemblage] Sympoiesis constructor came back undefined");
  return _ctor!;
}

export async function mountAssemblage(
  container: HTMLElement,
  hooks: AssemblageHooks
): Promise<AssemblageInstance> {
  destroyAssemblage();
  const Ctor = await ensureConstructor();
  _instance = new Ctor(container);
  _hooks = hooks;

  wireEcoFromStore();
  wireConsensusFromStore();
  wireForwardVotes();
  startReverseBreath();
  return _instance;
}

export function destroyAssemblage() {
  if (_ecoTimer) { clearInterval(_ecoTimer); _ecoTimer = null; }
  if (_voteTimer) { clearInterval(_voteTimer); _voteTimer = null; }
  if (_reverseTimer) { clearInterval(_reverseTimer); _reverseTimer = null; }
  if (_unsubscribeStore) { _unsubscribeStore(); _unsubscribeStore = null; }
  _lastDrone = { depth: -1, mix: -1, atmos: -1, harm: -1 };
  if (_instance) {
    try { _instance.destroy(); } catch { /* ignore */ }
    _instance = null;
  }
  _hooks = null;
}

// ─── ETH /eco/* → travelling affects (forward breath) ──────────────────────
// The eth_sonify pipeline writes /eco/co2 /eco/mycoPulse /eco/phosphorus
// /eco/nitrogen into parliamentStore — the very signals that grow the drone.
// We fire the assemblage's affect methods on threshold crossings so every
// transaction becomes a particle of nutrient/affect travelling the web.
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

// ─── Parliament consensus → web coherence ──────────────────────────────────
// High consensus draws the assemblage taut and synchronises its breath; low
// consensus lets it scatter. Subscribing keeps it locked to the same chamber
// state the audio already tracks.
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

// ─── Vote events → assemblage pulse ────────────────────────────────────────
// parliamentEntry publishes window.__voteEvent; we ripple it through the web.
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

// ─── Assemblage vitality → drone depth (reverse breath) ────────────────────
// The accumulated affect throughput (ETH inflow) and the web's coherence feed
// back into the basic drone sounds — deepening dronedepth / dronemix /
// atmospheremix and tilting harmonicrich. These are NOT among the five human
// controls, so the chamber and the network co-author the drone without fighting
// the knobs. Image and sound rise and settle together.
function startReverseBreath() {
  _reverseTimer = setInterval(() => {
    if (!_instance || !_hooks) return;
    const vit = clamp01(_instance.getVitality?.() ?? 0);
    const coh = clamp01(_instance.getCoherence?.() ?? 0.5);

    const depth = 0.22 + vit * 0.63;        // 0.22 still → 0.85 teeming
    const mix   = 0.30 + vit * 0.50;        // drone blends forward as life flows
    const atmos = 0.35 + vit * 0.45;        // space opens with throughput
    const harm  = 0.30 + coh * 0.45;        // coherence enriches the partials

    pushDrone("dronedepth", depth, "depth");
    pushDrone("dronemix", mix, "mix");
    pushDrone("atmospheremix", atmos, "atmos");
    pushDrone("harmonicrich", harm, "harm");
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
