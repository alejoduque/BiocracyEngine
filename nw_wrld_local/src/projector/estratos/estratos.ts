// estratos.ts
// Loader + bidirectional bridge for the Estratos artist module (switch [E]).
//
// Mirrors btransito/btransito.ts: the artist authors a standalone ES-module
// .js under ecosystems/…/modules/estratos.js. We fetch it, strip its
// top-level import/export (illegal inside `new Function`), evaluate it with
// THREE / BaseThreeJsModule injected, and bridge it to the parliament flow.
//
// Synesthetic coupling:
//   forward  · ETH /eco/* signals → mode changes (high co2 = tectonic shifts,
//              myco = forest, etc.); consensus → palette mood; vote events →
//              regenerate with new seed.
//   surface  · the index.html sonETH controls (window.__sonethParams) set the
//              same values that drive the audio — the generative strata and
//              the drone move as one.
//   reverse  · No reverse drone breath here: Estratos is a poetic cartography
//              without throughput metrics. Eco signals modulate the generative
//              seeding and visual mood only.
//
// Audit compliance (SLOT_B_AND_INDEX_AUDIT.md):
//   §A KEEP — all forward data uses the proven browser → bridge(:3334) →
//     SC(:57120) path via hooks.sendOSC when routing sonETH-visible values.
//   §B ★ VIZ — any viz-only slider values that reach Estratos are labeled
//     correctly (→ VIZ, not → SC).
//   §D — viz-hint updated to include E key slot.

import * as THREE from "three";
import { BaseThreeJsModule } from "../helpers/threeBase";
import { parliamentStore } from "../parliament/parliamentStore";

type EArg = Record<string, unknown> | undefined;
type EstratosInstance = {
  setSeed?: (o?: EArg) => void;
  setMode?: (o?: EArg) => void;
  setPalette?: (o?: EArg) => void;
  regenerate?: () => void;
  toggleAnim?: (o?: EArg) => void;
  setNocturno?: (o?: EArg) => void;
  applyControl?: (key: string, v: number) => void;
  renderer?: { setSize: (w: number, h: number) => void; getPixelRatio?: () => number };
  camera?: { aspect: number; updateProjectionMatrix: () => void };
  destroy: () => void;
};

type EstratosHooks = {
  applyViz: (key: string, val: number) => void;
  sendOSC: (address: string, value: number) => void;
};

let _ctor: { new (container: HTMLElement): EstratosInstance } | null = null;
let _instance: EstratosInstance | null = null;
let _hooks: EstratosHooks | null = null;
let _unsubscribeStore: (() => void) | null = null;
let _ecoTimer: ReturnType<typeof setInterval> | null = null;
let _voteTimer: ReturnType<typeof setInterval> | null = null;
let _sonethTimer: ReturnType<typeof setInterval> | null = null;
let _lastVoteTime = 0;

// sonETH keys routed live into the module (see Estratos.applyControl):
// color (spectralshift), rotation (spatialspread + harmonicrich), and
// movement (timedilation, texturedepth, memoryfeed, noiselevel, dronedepth,
// atmospheremix). Values arrive normalized 0–1 from window.__sonethParams,
// which is fed by HTML sliders, MIDI CCs, SC GUI knobs AND preset loads.
const SONETH_CONTROL_KEYS = [
  "spectralshift", "spatialspread", "harmonicrich", "timedilation",
  "texturedepth", "memoryfeed", "noiselevel", "dronedepth", "atmospheremix",
];

// ─── Mode-biome mapping: eco signals bias which zone-mode the strata show ──
const ECO_MODE_MAP: Record<string, string> = {
  co2: "tectonica",       // high CO2 → deep tectonic/abyss layers
  mycoPulse: "total",     // myco network → full cross-stratum view
  phosphorus: "mar",      // phosphorus runoff → marine strata
  nitrogen: "aire",       // nitrogen cycling → sky/mountain/forest
};

// ─── Palette-mood mapping: consensus level → palette key ───────────────────
function consensusToPalette(c: number): string {
  if (c > 0.80) return "riso";        // high consensus = classical clarity
  if (c > 0.60) return "tierra";      // moderate = earth tones
  if (c > 0.40) return "mineral";     // neutral = cool mineral
  if (c > 0.20) return "neon";        // low = anxious neon
  return "abismo";                     // very low = deep abyss palette
}

async function ensureConstructor() {
  if (_ctor) return _ctor;
  const res = await fetch(
    "/ecosystems/default_ecosystem/modules/estratos.js",
    { cache: "no-cache" }
  );
  if (!res.ok) throw new Error(`Estratos fetch failed: ${res.status}`);
  const rawSrc = await res.text();
  const src = rawSrc
    .replace(/^\s*export\s+default\s+\w+\s*;?\s*$/gm, "")
    .replace(/^\s*export\s+/gm, "")
    .replace(/^\s*import\s+[^;]+;?\s*$/gm, "");

  let factory: Function;
  try {
    factory = new Function(
      "THREE",
      "BaseThreeJsModule",
      `"use strict";\n${src}\n;return Estratos;`
    );
  } catch (e) {
    console.error("[estratos] SyntaxError in estratos.js:", e);
    throw e;
  }
  _ctor = factory(THREE, BaseThreeJsModule);
  if (!_ctor) throw new Error("[estratos] Estratos constructor came back undefined");
  return _ctor!;
}

export async function mountEstratos(
  container: HTMLElement,
  hooks: EstratosHooks
): Promise<EstratosInstance> {
  destroyEstratos();
  const Ctor = await ensureConstructor();
  _instance = new Ctor(container);
  _hooks = hooks;

  wireEcoFromStore();
  wireConsensusFromStore();
  wireForwardVotes();
  wireSonethControls();
  return _instance;
}

export function destroyEstratos() {
  if (_ecoTimer) { clearInterval(_ecoTimer); _ecoTimer = null; }
  if (_voteTimer) { clearInterval(_voteTimer); _voteTimer = null; }
  if (_sonethTimer) { clearInterval(_sonethTimer); _sonethTimer = null; }
  if (_unsubscribeStore) { _unsubscribeStore(); _unsubscribeStore = null; }
  if (_instance) {
    try { _instance.destroy(); } catch { /* ignore */ }
    _instance = null;
  }
  _hooks = null;
}

// ─── ETH /eco/* → mode changes (forward) ───────────────────────────────────
// When eco signals cross a threshold, bias the stratum mode toward the
// matching biome. This is purely VIZ — no SC handler for this address.
function wireEcoFromStore() {
  let last = { co2: 0, mycoPulse: 0, phosphorus: 0, nitrogen: 0 };
  let lastSetMode = "";

  _ecoTimer = setInterval(() => {
    if (!_instance) return;
    const eco = parliamentStore.state?.eco;
    if (!eco) return;

    // Find the strongest eco signal that crossed its threshold
    let strongest = "";
    let strongestDelta = 0;
    for (const [key, modeKey] of Object.entries(ECO_MODE_MAP)) {
      const ecoVal = (eco as Record<string, number>)[key] ?? 0;
      const lastVal = (last as Record<string, number>)[key] ?? 0;
      const delta = ecoVal - lastVal;
      if (delta > 0.08 && delta > strongestDelta) {
        strongest = modeKey;
        strongestDelta = delta;
      }
    }

    if (strongest && strongest !== lastSetMode) {
      lastSetMode = strongest;
      try { _instance!.setMode?.({ mode: strongest }); } catch { /* ignore */ }
      console.log(`[estratos] eco → setMode("${strongest}")`);
    }

    last = {
      co2: (eco.co2 ?? 0) * 0.92,
      mycoPulse: (eco.mycoPulse ?? 0) * 0.92,
      phosphorus: (eco.phosphorus ?? 0) * 0.92,
      nitrogen: (eco.nitrogen ?? 0) * 0.92,
    };
  }, 300);
}

// ─── Parliament consensus → palette mood (VIZ coupling) ────────────────────
// Min-dwell: the consensus wave oscillates across the palette thresholds
// several times a minute — without a dwell every crossing forced a full
// scene rebuild (visible hitch + the old light-paper palettes made the
// background flash to white; palettes are now nocturno-inverted in the
// module, and rebuilds are limited to one per dwell window here).
const PALETTE_DWELL_MS = 12000;
function wireConsensusFromStore() {
  let lastPalette = "";
  let lastChange = 0;
  _unsubscribeStore = parliamentStore.subscribe((state) => {
    if (!_instance || !_instance.setPalette) return;
    const c = state.consensus ?? state.consensusWave;
    if (typeof c !== "number") return;
    const pal = consensusToPalette(c);
    if (pal === lastPalette) return;
    if (Date.now() - lastChange < PALETTE_DWELL_MS) return;
    lastPalette = pal;
    lastChange = Date.now();
    try { _instance!.setPalette!({ palette: pal }); } catch { /* ignore */ }
  });
}

// ─── sonETH sliders → live module controls (color/rotation/movement) ───────
// Polls window.__sonethParams (~7 Hz) and pushes CHANGED values into
// Estratos.applyControl — no scene rebuild, everything animates in place.
function wireSonethControls() {
  const lastSent: Record<string, number> = {};
  _sonethTimer = setInterval(() => {
    if (!_instance || !_instance.applyControl) return;
    const sp = (window as unknown as { __sonethParams?: Record<string, number> }).__sonethParams;
    if (!sp) return;
    for (const key of SONETH_CONTROL_KEYS) {
      const v = sp[key];
      if (typeof v !== "number" || !isFinite(v)) continue;
      if (lastSent[key] !== undefined && Math.abs(lastSent[key] - v) < 0.002) continue;
      lastSent[key] = v;
      try { _instance!.applyControl!(key, v); } catch { /* ignore */ }
    }
  }, 140);
}

// ─── Vote events → regenerate with new seed (forward) ──────────────────────
// Each vote event triggers a full regeneration — the strata reseed themselves,
// as if the landscape itself is responding to each political act.
function wireForwardVotes() {
  _voteTimer = setInterval(() => {
    if (!_instance || !_instance.regenerate) return;
    const ev = (window as unknown as {
      __voteEvent?: { type: string; intensity: number; time: number };
    }).__voteEvent;
    if (!ev || ev.time === _lastVoteTime) return;
    _lastVoteTime = ev.time;

    // Passed votes regenerate landscape; emergency votes shift to tectonica
    if (ev.type === "emergency") {
      try { _instance!.setMode?.({ mode: "tectonica" }); } catch { /* ignore */ }
    }
    try { _instance!.regenerate!(); } catch { /* ignore */ }
    console.log(`[estratos] vote "${ev.type}" → regenerate`);
  }, 90);
}
