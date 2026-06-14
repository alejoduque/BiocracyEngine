// registro.ts
// Loader + bridge for the Registro artist module (switch [R]).
// Mirrors btransito/darkforest: fetch the standalone Registro.js, strip its
// import/export, evaluate with THREE / BaseThreeJsModule / loadJson injected,
// and bridge it to the parliament flow.
//
//   forward  · ETH /eco/* + parliament consensus + vote events → Registro
//              (eco → utterances; consensus → setCoherence (justification);
//              votes → pulse). Registro also reads window.__activeSpecies (slot P)
//              and window.__sonethParams itself each frame.
//   reverse  · the record's BUFFER depth → /soneth/memoryfeed (the textual buffer
//              IS the audio delay-memory — see BiocracyVisualizer annotations) and
//              consensus → /soneth/atmospheremix. A modest, on-thesis coupling.

import * as THREE from "three";
import { BaseThreeJsModule } from "../helpers/threeBase";
import { parliamentStore } from "../parliament/parliamentStore";

type RArg = Record<string, unknown> | undefined;
type RegistroInstance = {
  setMasterVol?: (o?: RArg) => void;
  setPitchShift?: (o?: RArg) => void;
  setTimeDilation?: (o?: RArg) => void;
  setSpectralShift?: (o?: RArg) => void;
  setSpatialSpread?: (o?: RArg) => void;
  setCoherence?: (o?: RArg) => void;
  pulse?: (o?: RArg) => void;
  whisper?: (o?: RArg) => void;
  triggerCO2?: (o?: RArg) => void;
  triggerMycoPulse?: (o?: RArg) => void;
  triggerPhosphorus?: (o?: RArg) => void;
  triggerNitrogen?: (o?: RArg) => void;
  getCoherence?: () => number;
  getBufferLoad?: () => number;
  renderer?: { setSize: (w: number, h: number) => void };
  camera?: { aspect: number; updateProjectionMatrix: () => void };
  destroy: () => void;
};

type RegistroHooks = {
  applyViz: (key: string, val: number) => void;
  sendOSC: (address: string, value: number) => void;
};

let _ctor: { new (container: HTMLElement): RegistroInstance } | null = null;
let _instance: RegistroInstance | null = null;
let _hooks: RegistroHooks | null = null;
let _unsubscribeStore: (() => void) | null = null;
let _ecoTimer: ReturnType<typeof setInterval> | null = null;
let _voteTimer: ReturnType<typeof setInterval> | null = null;
let _reverseTimer: ReturnType<typeof setInterval> | null = null;
let _lastVoteTime = 0;
let _lastDrone = { mem: -1, atmos: -1 };

async function ensureConstructor() {
  if (_ctor) return _ctor;
  const res = await fetch("/ecosystems/default_ecosystem/modules/Registro.js", { cache: "no-cache" });
  if (!res.ok) throw new Error(`Registro fetch failed: ${res.status}`);
  const rawSrc = await res.text();
  const src = rawSrc
    .replace(/^\s*export\s+default\s+\w+\s*;?\s*$/gm, "")
    .replace(/^\s*export\s+/gm, "")
    .replace(/^\s*import\s+[^;]+;?\s*$/gm, "");

  const loadJsonAtRuntime = async (rel: unknown) => {
    const r = await fetch(`/ecosystems/default_ecosystem/assets/${String(rel || "")}`, { cache: "no-cache" });
    if (!r.ok) return null;
    try { return await r.json(); } catch { return null; }
  };

  let factory: Function;
  try {
    factory = new Function(
      "THREE", "BaseThreeJsModule", "loadJson",
      `"use strict";\n${src}\n;return Registro;`
    );
  } catch (e) {
    console.error("[registro] SyntaxError in Registro.js:", e);
    throw e;
  }
  _ctor = factory(THREE, BaseThreeJsModule, loadJsonAtRuntime);
  if (!_ctor) throw new Error("[registro] Registro constructor came back undefined");
  return _ctor!;
}

export async function mountRegistro(
  container: HTMLElement,
  hooks: RegistroHooks
): Promise<RegistroInstance> {
  destroyRegistro();
  const Ctor = await ensureConstructor();
  _instance = new Ctor(container);
  _hooks = hooks;

  wireEcoFromStore();
  wireConsensusFromStore();
  wireForwardVotes();
  startReverseBreath();
  return _instance;
}

export function destroyRegistro() {
  if (_ecoTimer) { clearInterval(_ecoTimer); _ecoTimer = null; }
  if (_voteTimer) { clearInterval(_voteTimer); _voteTimer = null; }
  if (_reverseTimer) { clearInterval(_reverseTimer); _reverseTimer = null; }
  if (_unsubscribeStore) { _unsubscribeStore(); _unsubscribeStore = null; }
  _lastDrone = { mem: -1, atmos: -1 };
  if (_instance) {
    try { _instance.destroy(); } catch { /* ignore */ }
    _instance = null;
  }
  _hooks = null;
}

// ETH /eco/* → utterances entering the record
function wireEcoFromStore() {
  let last = { co2: 0, mycoPulse: 0, phosphorus: 0, nitrogen: 0 };
  _ecoTimer = setInterval(() => {
    if (!_instance) return;
    const eco = parliamentStore.state?.eco;
    if (!eco) return;
    if (eco.co2 > last.co2 + 0.05) _instance.triggerCO2?.({ amount: Math.max(10, Math.min(200, eco.co2 * 200)) });
    if (eco.mycoPulse > last.mycoPulse + 0.05) _instance.triggerMycoPulse?.({ intensity: Math.max(0.4, Math.min(5, eco.mycoPulse * 4)) });
    if (eco.phosphorus > last.phosphorus + 0.05) _instance.triggerPhosphorus?.({ amount: Math.max(10, Math.min(100, eco.phosphorus * 100)) });
    if (eco.nitrogen > last.nitrogen + 0.05) _instance.triggerNitrogen?.({ amount: Math.max(10, Math.min(100, eco.nitrogen * 100)) });
    last = { co2: eco.co2 * 0.92, mycoPulse: eco.mycoPulse * 0.92, phosphorus: eco.phosphorus * 0.92, nitrogen: eco.nitrogen * 0.92 };
  }, 160);
}

// Parliament consensus → justification of the acta
function wireConsensusFromStore() {
  let lastSent = -1;
  _unsubscribeStore = parliamentStore.subscribe((state) => {
    if (!_instance || !_instance.setCoherence) return;
    // state.consensus is what the index.html slider + votes drive; consensusWave
    // is only fed by SC /bio/consensus. Prefer consensus so the slider is live.
    const c = state.consensus ?? state.consensusWave;
    if (typeof c !== "number" || Math.abs(c - lastSent) < 0.01) return;
    lastSent = c;
    try { _instance.setCoherence!({ value: c }); } catch { /* ignore */ }
  });
}

// Vote events → a deliberation entry in the record
function wireForwardVotes() {
  _voteTimer = setInterval(() => {
    if (!_instance || !_instance.pulse) return;
    const ev = (window as unknown as { __voteEvent?: { type: string; intensity: number; time: number } }).__voteEvent;
    if (!ev || ev.time === _lastVoteTime) return;
    _lastVoteTime = ev.time;
    try { _instance.pulse!({ intensity: 1.0 }); } catch { /* ignore */ }
  }, 90);
}

// Buffer depth → audio memory/delay; consensus → atmosphere (reverse breath)
function startReverseBreath() {
  _reverseTimer = setInterval(() => {
    if (!_instance || !_hooks) return;
    const buf = clamp01(_instance.getBufferLoad?.() ?? 0);
    const coh = clamp01(_instance.getCoherence?.() ?? 0.5);
    pushDrone("memoryfeed", 0.20 + buf * 0.6, "mem");
    pushDrone("atmospheremix", 0.30 + coh * 0.4, "atmos");
  }, 300);
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
