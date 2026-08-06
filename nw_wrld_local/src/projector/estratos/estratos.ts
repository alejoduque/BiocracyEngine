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
  setDensity?: (o?: EArg) => void;
  setRegions?: (v: number[]) => void;
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
let _unsubscribeStore: (() => void) | null = null;
let _ecoTimer: ReturnType<typeof setInterval> | null = null;
let _voteTimer: ReturnType<typeof setInterval> | null = null;
let _sonethTimer: ReturnType<typeof setInterval> | null = null;
let _phenoTimer: ReturnType<typeof setInterval> | null = null;
let _paletteRetry: ReturnType<typeof setTimeout> | null = null;
let _lastVoteTime = 0;
let _lastRegen = 0;
let _currentMode = "total";
let _lastPalette = "";
let _lastPaletteChange = 0;
let _pendingPalette: string | null = null;

// sonETH keys routed live into the module (see Estratos.applyControl):
// color (spectralshift), rotation (spatialspread + harmonicrich), and
// movement (timedilation, texturedepth, memoryfeed, noiselevel, dronedepth,
// atmospheremix). Values arrive normalized 0–1 from window.__sonethParams,
// which is fed by HTML sliders, MIDI CCs, SC GUI knobs AND preset loads.
const SONETH_CONTROL_KEYS = [
  "spectralshift", "spatialspread", "harmonicrich", "timedilation",
  "texturedepth", "memoryfeed", "noiselevel", "dronedepth", "atmospheremix",
];

// ─── Cámara Fenológica → Estratos (window.__phenoParams) ───────────────────
// Four couplings, three live and one that reseeds:
//   bancada           → setMode          the human chamber PINS the strata
//   activityThreshold → setDensity       how many species are seeded (debounced)
//   opacityFloor      → sprite opacity   the opacity clause, as landscape
//   seasonalWeight    → waves/fog/motes  the year passing (derived, not a knob)
const PHENO_LIVE_KEYS = ["opacityFloor", "seasonalWeight"];

// Bancada (Art. 43 §1) is a season-taxon grouping and `mode` is which strata
// are present — the semantics line up one-to-one, so this is a direct map.
// Index 0 ("todas") means "no pin": eco signals get the mode back.
const BANCADA_MODE = ["", "desierto", "pantano", "aire", "mar"];
// Set while a bancada other than "todas" is selected. An explicit human act
// outranks the ETH eco bias, which is why wireEcoFromStore checks it.
let _bancadaMode = "";
let _densityTimer: ReturnType<typeof setTimeout> | null = null;
let _lastDensitySent = -1;
// Reseeding is a full _buildScene, so the threshold slider is only acted on
// once it settles — dragging it must not rebuild on every input event.
const DENSITY_DEBOUNCE_MS = 600;

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

// `hooks` is accepted to match the sibling slot bridges' mount signature, but
// Estratos has no reverse path (see header): every coupling here is forward
// or surface-level, so there is nothing to route back through applyViz/sendOSC.
export async function mountEstratos(
  container: HTMLElement,
  _hooks: EstratosHooks
): Promise<EstratosInstance> {
  destroyEstratos();
  const Ctor = await ensureConstructor();
  _instance = new Ctor(container);

  wireEcoFromStore();
  wireConsensusFromStore();
  wireForwardVotes();
  wireSonethControls();
  wirePhenoControls();
  return _instance;
}

export function destroyEstratos() {
  if (_ecoTimer) { clearInterval(_ecoTimer); _ecoTimer = null; }
  if (_voteTimer) { clearInterval(_voteTimer); _voteTimer = null; }
  if (_sonethTimer) { clearInterval(_sonethTimer); _sonethTimer = null; }
  if (_phenoTimer) { clearInterval(_phenoTimer); _phenoTimer = null; }
  if (_paletteRetry) { clearTimeout(_paletteRetry); _paletteRetry = null; }
  if (_densityTimer) { clearTimeout(_densityTimer); _densityTimer = null; }
  if (_unsubscribeStore) { _unsubscribeStore(); _unsubscribeStore = null; }
  if (_instance) {
    try { _instance.destroy(); } catch { /* ignore */ }
    _instance = null;
  }
  _lastVoteTime = 0;
  _lastRegen = 0;
  _currentMode = "total";
  _lastPalette = "";
  _lastPaletteChange = 0;
  _pendingPalette = null;
  _bancadaMode = "";
  _lastDensitySent = -1;
}

// setMode rebuilds the scene, so it is only worth calling on a real change —
// both the eco poll and the vote poll can otherwise ask for the current mode.
function applyMode(mode: string) {
  if (!_instance || mode === _currentMode) return;
  _currentMode = mode;
  try { _instance.setMode?.({ mode }); } catch { /* ignore */ }
}

// ─── ETH /eco/* → mode changes (forward) ───────────────────────────────────
// When eco signals cross a threshold, bias the stratum mode toward the
// matching biome. This is purely VIZ — no SC handler for this address.
function wireEcoFromStore() {
  let last = { co2: 0, mycoPulse: 0, phosphorus: 0, nitrogen: 0 };

  _ecoTimer = setInterval(() => {
    if (!_instance) return;
    // A selected bancada pins the strata: the human chamber outranks the
    // ETH eco bias. Released ("todas") and eco gets the mode back.
    if (_bancadaMode) return;
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

    if (strongest && strongest !== _currentMode) {
      applyMode(strongest);
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
// several times a minute. setPalette no longer rebuilds the scene (the module
// recolors in place), but it still re-bakes every species and text canvas, so
// a dwell keeps the piece from strobing through moods.
//
// performance.now(), not Date.now(): a backward NTP step made the elapsed
// check go negative and swallowed every palette change until it caught up.
const PALETTE_DWELL_MS = 12000;

function applyPalette(pal: string) {
  if (!_instance?.setPalette || pal === _lastPalette) return;
  const wait = PALETTE_DWELL_MS - (performance.now() - _lastPaletteChange);
  if (wait > 0) {
    // Re-evaluate when the window expires instead of waiting for the next
    // store notification — if the bridge WS drops right after a suppressed
    // change, nothing else would ever come to unstick the palette.
    _pendingPalette = pal;
    if (!_paletteRetry) {
      _paletteRetry = setTimeout(() => {
        _paletteRetry = null;
        const next = _pendingPalette;
        _pendingPalette = null;
        if (next) applyPalette(next);
      }, wait);
    }
    return;
  }
  _lastPalette = pal;
  _lastPaletteChange = performance.now();
  try { _instance.setPalette({ palette: pal }); } catch { /* ignore */ }
}

function wireConsensusFromStore() {
  _unsubscribeStore = parliamentStore.subscribe((state) => {
    const c = state.consensus ?? state.consensusWave;
    if (typeof c !== "number") return;
    applyPalette(consensusToPalette(c));
  });
}

// ─── sonETH sliders → live module controls (color/rotation/movement) ───────
// Polls window.__sonethParams (~7 Hz) and pushes CHANGED values into
// Estratos.applyControl — no scene rebuild, everything animates in place.
// applyControl only sets targets: the module's own animate loop chases them
// with a frame-rate-independent filter (see _ctrl/_view there), so this poll
// rate is invisible rather than showing up as ~7 steps per second.
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

// ─── Cámara Fenológica → live module state ─────────────────────────────────
// Polls window.__phenoParams on the same cadence as the sonETH poll. Live
// values go through applyControl (targets the module smooths per frame);
// bancada and activityThreshold are discrete/expensive and handled separately.
function wirePhenoControls() {
  const lastSent: Record<string, number> = {};
  let lastBancada = -1;

  _phenoTimer = setInterval(() => {
    if (!_instance) return;
    const pp = (window as unknown as { __phenoParams?: Record<string, number> }).__phenoParams;
    if (!pp) return;

    // ── live: opacityFloor + seasonalWeight ──
    if (_instance.applyControl) {
      for (const key of PHENO_LIVE_KEYS) {
        const v = pp[key];
        if (typeof v !== "number" || !isFinite(v)) continue;
        if (lastSent[key] !== undefined && Math.abs(lastSent[key] - v) < 0.002) continue;
        lastSent[key] = v;
        try { _instance.applyControl(key, v); } catch { /* ignore */ }
      }
    }

    // ── discrete: bancada → mode ──
    const b = pp.bancada;
    if (typeof b === "number" && isFinite(b)) {
      const idx = Math.max(0, Math.min(4, Math.round(b * 4)));
      if (idx !== lastBancada) {
        lastBancada = idx;
        _bancadaMode = BANCADA_MODE[idx];
        // Releasing to "todas" hands the strata back to the eco poll, which
        // re-asserts a mode on its next tick; until then keep the full view.
        applyMode(_bancadaMode || "total");
        console.log(`[estratos] bancada ${idx} → mode "${_bancadaMode || "total (eco released)"}"`);
      }
    }

    // ── regional eDNA → per-stratum presence ──
    // The eight biogeographic regions weight the strata they belong to. Pushed
    // on the same tick as the phenology values; the module smooths and applies
    // them as a live opacity multiplier, so there is no rebuild.
    const eb = (window as unknown as { __ednaBio?: number[] }).__ednaBio;
    if (Array.isArray(eb) && _instance.setRegions) {
      try { _instance.setRegions(eb); } catch { /* ignore */ }
    }

    // ── expensive: activityThreshold → population density (debounced) ──
    const thr = pp.activityThreshold;
    if (typeof thr === "number" && isFinite(thr) && Math.abs(thr - _lastDensitySent) >= 0.01) {
      _lastDensitySent = thr;
      if (_densityTimer) clearTimeout(_densityTimer);
      _densityTimer = setTimeout(() => {
        _densityTimer = null;
        try { _instance?.setDensity?.({ value: thr }); } catch { /* ignore */ }
      }, DENSITY_DEBOUNCE_MS);
    }
  }, 140);
}

// ─── Vote events → regenerate with new seed (forward) ──────────────────────
// Each vote event triggers a full regeneration — the strata reseed themselves,
// as if the landscape itself is responding to each political act.
//
// This is the hot path, not the palette one: votes arrive in bursts of several
// per second and regenerate() IS a full _buildScene (~110 canvas allocations,
// texture uploads, geometry rebuilds and disposals). Bursts are coalesced to
// one reseed per dwell — the landscape answers the burst, not each ballot.
const REGEN_DWELL_MS = 1500;
function wireForwardVotes() {
  _voteTimer = setInterval(() => {
    if (!_instance || !_instance.regenerate) return;
    const ev = (window as unknown as {
      __voteEvent?: { type: string; intensity: number; time: number };
    }).__voteEvent;
    if (!ev || ev.time === _lastVoteTime) return;
    _lastVoteTime = ev.time;

    // Passed votes regenerate landscape; emergency votes shift to tectonica
    if (ev.type === "emergency") applyMode("tectonica");

    const now = performance.now();
    if (now - _lastRegen < REGEN_DWELL_MS) return;
    _lastRegen = now;
    try { _instance!.regenerate!(); } catch { /* ignore */ }
    console.log(`[estratos] vote "${ev.type}" → regenerate`);
  }, 90);
}
