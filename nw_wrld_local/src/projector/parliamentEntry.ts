// Parliament of All Things — Entry Point
// OSC control panel wired to parliament-synthesizer SC endpoints
// Spectrogram canvas + reactive FFT from live state data
// Visualization switcher: keys 0–9 swap center stage

import parliamentStore, { ParliamentState } from "./parliament/parliamentStore";
import {
  notifyBeatTempo as notifyPhenoBeatTempo,
  applyPhenoControl,
  jumpToPhenoSeason,
} from "./phenology/breath";
import { initSwitcher, getActiveThreeStage, updateSpeciesRoster } from "./visualizationSwitcher";
import { initLaserTap } from "./laserTap";
import { startVizMotion } from "./vizMotion";
import { fetchSpeciesRoster, computeIUCNMults } from "./speciesFetcher";
import * as THREE from "three";

// ─── Data constants (mutable — updated from IUCN API at boot) ───
let SPECIES_NAMES = ["Tremarctos ornatus", "Panthera onca", "Ceroxylon quindiuense", "Atelopus nahumae", "Saguinus oedipus"];
let SPECIES_IUCN = ["VU", "NT", "EN", "CR", "CR"];
// IUCN multipliers for BioToken formula (CR=5, EN=3, VU=2, LC=1)
let IUCN_MULT = [2, 1, 3, 5, 5];
const EDNA_IDS = ["CHO", "AMZ", "COR", "CAR", "ORI", "PAC", "MAG", "GUA"];
const EDNA_ANGLES_DEG = Array.from({ length: 8 }, (_, i) => (i / 8) * 360);

// ─── Cámara Fenológica params — live values shared with visual switches ─────
// Same contract as __sonethParams below: keyed by the last segment of
// /pheno/<key>, mirrored here whenever SC echoes a knob, MIDI CC or HTML
// slider. Slot bridges poll this instead of each re-deriving calendar state.
//
// The last two are NOT sliders — they are the calendar's own reading of today,
// republished by the reverse-breath loop in phenology/breath.ts:
//   seasonalWeight · wet-vs-dry weight of the current day (0 dry → 1 rainy)
//   activeFraction · fraction of species currently past the activity threshold
// Defaults mirror the slider values in views/parliament.html.
const phenoParams: Record<string, number> = {
  activityThreshold: 0.46,
  windowWidth: 0.29,
  seasonalBias: 0.5,
  absenceWeight: 0.3,
  opacityFloor: 0.0,
  pulseGain: 0.5,
  bancada: 0,
  seasonalWeight: 0.5,
  activeFraction: 0,
};
(window as unknown as { __phenoParams?: Record<string, number> }).__phenoParams = phenoParams;

// ─── OSC bridge WebSocket ───
let controlWS: WebSocket | null = null;
let controlWsReady = false;

function connectControlWS() {
  controlWS = new WebSocket("ws://localhost:3334");
  controlWS.onopen = () => {
    controlWsReady = true;
    // Populate the CONFIGS dropdown: SC answers with /preset/names
    try { controlWS?.send(JSON.stringify({ direction: "toSC", address: "/preset/list", args: [] })); } catch { /* ignore */ }
  };
  controlWS.onclose = () => {
    controlWsReady = false;
    controlWS = null;
    setTimeout(connectControlWS, 2000);
  };
  controlWS.onerror = () => { controlWS?.close(); };

  // ── SC → browser echo handler ──────────────────────────────────────────
  // SC sends /soneth/* and /parliament/* back via ~visualsDest (port 3333)
  // → bridge forwards to WS 3334 → here.
  // We update: the HTML slider position, the display span, sonethParams, and
  // apply to active viz — completing the MIDI→SC→browser feedback loop.
  controlWS.onmessage = (evt) => {
    try {
      const { address, args } = JSON.parse(evt.data as string) as { address: string; args: number[] };
      if (!address || !Array.isArray(args)) return;

      // CONFIGS dropdown: SC broadcasts the preset list (comma-separated
      // string) after boot, saves, and /preset/list requests
      if (address === "/preset/names") {
        const names = String(args[0] ?? "").split(",").filter(Boolean);
        const sel = document.getElementById("preset-select") as HTMLSelectElement | null;
        if (sel) {
          const cur = sel.value;
          sel.innerHTML = "";
          names.forEach((n) => {
            const o = document.createElement("option");
            o.value = n;
            o.textContent = n;
            sel.appendChild(o);
          });
          if (names.includes(cur)) sel.value = cur;
        }
        return;
      }

      if (address.startsWith("/soneth/")) {
        const v = args[0];
        if (typeof v !== "number" || !isFinite(v)) return;
        const key = address.slice("/soneth/".length);

        // Update sonethParams live object
        const sp = (window as any).__sonethParams;
        if (sp && key in sp) sp[key] = v;

        // Apply to active visualization
        if (typeof (window as any).__applySonethToViz === "function") {
          (window as any).__applySonethToViz(key, v);
        }

        // Update HTML slider + display span
        const slider = document.querySelector<HTMLInputElement>(
          `input[type='range'][data-osc='${address}']`
        );
        if (slider) slider.value = String(v);

        const dispId = `disp-soneth-${key}`;
        const dispEl = document.getElementById(dispId);
        if (dispEl) dispEl.textContent = v.toFixed(2);
      }

      // Also handle /parliament/volume echo from SC master volume changes
      if (address === "/parliament/volume") {
        const v = args[0];
        const slider = document.querySelector<HTMLInputElement>(
          `input[type='range'][data-osc='/parliament/volume']`
        );
        if (slider) slider.value = String(v);
        const dispEl = document.getElementById("disp-master-vol");
        if (dispEl) dispEl.textContent = v.toFixed(2);
      }

      // ── Cámara Fenológica (Capítulo VI) ─────────────────────────────
      // SC echoes /pheno/<key> values back to the browser whenever a knob,
      // MIDI CC, or HTML slider moves. Three things happen here:
      //   1. The HTML slider/display syncs (bidirectional control surface)
      //   2. The calendar instance is updated via applyPhenoControl()
      //      (instance setters clamp + persist state)
      //   3. The reverse-breath loop in breath.ts picks up the new state
      //      on its next 320ms tick → harmonicrich/texturedepth follow
      // ── Marea · the swell itself (/tide/state) ──────────────────────
      // Distinct from the /tide/* toggles below: those are the four booleans
      // choosing an arc, this is the value that arc currently yields. SC owns
      // it — it is computed inside the beat engine and drives the audio — so
      // the browser reflects rather than recomputes. A module that derived its
      // own envelope would drift against the sound within one arc, and the
      // whole point of slot A's crossfade is that the two agree.
      if (address === "/tide/state") {
        const v = args[0];
        const ph = args[1];
        if (typeof v === "number" && isFinite(v)) {
          (window as unknown as { __tideState?: { value: number; phase: number; t: number } })
            .__tideState = {
              value: Math.max(0, Math.min(1, v)),
              phase: typeof ph === "number" && isFinite(ph) ? ph : 0,
              t: Date.now() / 1000,
            };
        }
        return;
      }

      // ── Marea · arco de densidad (/tide/*) ──────────────────────────
      // SC echoes the normalized value on the canonical path after ANY origin
      // changes it — MIDI CC 17–20, the SC GUI button, or a preset load — AND
      // after it enforces arc exclusivity, which emits a 0 for each sibling it
      // unticked. Ticking a box here is therefore what makes the other two
      // visibly clear themselves. Setting .checked fires no change event, so a
      // browser-origin toggle echoes back harmlessly.
      if (address.startsWith("/tide/")) {
        const v = args[0];
        if (typeof v === "number" && isFinite(v)) {
          const box = document.querySelector<HTMLInputElement>(
            `input[type='checkbox'][data-osc='${address}']`
          );
          if (box) box.checked = v >= 0.5;
        }
        return;
      }

      if (address.startsWith("/pheno/")) {
        const key = address.slice("/pheno/".length);

        // Special case: jumpSeason carries a string season name, not a number
        if (key === "jumpSeason") {
          const season = String((args as unknown as unknown[])[0] ?? "");
          if (season) jumpToPhenoSeason(season);
          return;
        }

        const v = args[0];
        if (typeof v !== "number" || !isFinite(v)) return;

        // 1. Sync HTML slider (bidirectional triple)
        const slider = document.querySelector<HTMLInputElement>(
          `input[type='range'][data-osc='${address}']`
        );
        if (slider) slider.value = String(v);
        const dispEl = document.getElementById(`disp-pheno-${key}`);
        if (dispEl) dispEl.textContent = v.toFixed(2);

        // 1a. Special case: bancada — also light the matching radio button
        if (key === "bancada") {
          const idx = Math.max(0, Math.min(4, Math.round(v * 4)));
          document.querySelectorAll<HTMLButtonElement>(".pheno-bancada-btn").forEach((b) => {
            b.classList.toggle("active", parseInt(b.dataset.bancada ?? "0", 10) === idx);
          });
        }

        // 1b. Mirror into window.__phenoParams so slot bridges can poll it
        //     (Estratos reads bancada / activityThreshold / opacityFloor).
        phenoParams[key] = v;

        // 2. Apply to the calendar instance (no-op if slot P not mounted)
        applyPhenoControl(key, v);
      }
    } catch (_) { }
  };
}

// Single-value OSC
function sendOSC(address: string, value: number) {
  if (controlWS && controlWsReady) {
    controlWS.send(JSON.stringify({ direction: "toSC", address, args: [value] }));
  }
}

// Expose for phenology breath bridge (reverse coupling: calendar day →
// harmonic/texture into SC audio).
(window as any).__sendOscToSC = sendOSC;

// Multi-arg OSC (agent id + value)
function sendOSCArgs(address: string, args: number[]) {
  if (controlWS && controlWsReady) {
    controlWS.send(JSON.stringify({ direction: "toSC", address, args }));
  }
}

// String-arg OSC (preset names — the bridge passes strings as OSC type 's')
function sendOSCString(address: string, value: string) {
  if (controlWS && controlWsReady) {
    controlWS.send(JSON.stringify({ direction: "toSC", address, args: [value] }));
  }
}

// Expose to HTML button onclick
// Also patches local state so visuals respond immediately (no SC round-trip required)
(window as any).sendParliamentAction = (address: string, args: number[]) => {
  if (controlWS && controlWsReady) {
    controlWS.send(JSON.stringify({ direction: "toSC", address, args }));
  }
  // Immediate local state patch for visible effect
  const st = parliamentStore.state;
  if (!st) return;
  if (address === "/parliament/emergency" && args.length > 0) {
    // Emergency: collapse consensus toward 0 — red alert state
    st.consensus = Math.max(0, st.consensus - 0.3 * args[0]);
    st.consensusWave = args[0];
    parliamentStore.notifyListeners();
    // Visual burst: slam brightness down, red shift across all slots
    triggerVoteVisualBurst("emergency", args[0]);
  } else if (address === "/parliament/vote") {
    // Vote: manual trigger always passes — performer tool, not a quorum check.
    // Boost consensus briefly to reflect the affirmative intent.
    const prevConsensus = st.consensus;
    st.consensus = Math.min(1.0, Math.max(st.consensus, 0.5) + 0.15);
    st.events.voteResult = {
      consensus: st.consensus,
      passed: true,
      yes: Math.round(st.votes * st.consensus),
      total: st.votes,
    };
    parliamentStore.notifyListeners();
    // Visual burst: bloom flash + color surge across all slots
    triggerVoteVisualBurst("passed", st.consensus);
    // Decay consensus back over 4 s
    const decayStart = st.consensus;
    const decayTarget = prevConsensus;
    const decaySteps = 40;
    let step = 0;
    const decayTimer = setInterval(() => {
      step++;
      const t = step / decaySteps;
      st.consensus = decayStart + (decayTarget - decayStart) * t;
      parliamentStore.notifyListeners();
      if (step >= decaySteps) { st.consensus = decayTarget; clearInterval(decayTimer); }
    }, 100);
  } else if (address === "/parliament/stop") {
    // Stop: silence all species activity
    st.species.forEach((sp) => { sp.activity = 0.0; sp.presence = 0.1; });
    parliamentStore.notifyListeners();
    // Visual: dim everything
    triggerVoteVisualBurst("stop", 0);
  } else if (address === "/parliament/start") {
    // Start: restore default activity
    st.species.forEach((sp) => { sp.activity = 0.5; sp.presence = 0.5; });
    parliamentStore.notifyListeners();
    // Visual: restore brightness
    triggerVoteVisualBurst("start", 0.5);
  }
};

// ─── Vote/Emergency visual burst across ALL 4 visualization slots ──────────
function triggerVoteVisualBurst(type: string, intensity: number) {
  // Publish the event FIRST, unconditionally. This used to sit at the bottom
  // of the function behind an early return on __applySonethToViz — so before
  // that global was assigned (it is set late, inside the DOM-ready init), a
  // vote silently reached no slot at all. The sonETH ramp below is a bonus;
  // __voteEvent is the actual channel every slot polls, and it must not be
  // hostage to an unrelated global.
  (window as any).__voteEvent = { type, intensity, time: performance.now() };

  const applyViz = (window as any).__applySonethToViz;
  if (typeof applyViz !== "function") return;

  if (type === "passed") {
    // Bloom flash + warm glow: spike volume/bloom, then decay over 3s
    applyViz("volume", 1.0);
    applyViz("atmospheremix", 0.95);
    applyViz("harmonicrich", 0.9);
    applyViz("memoryfeed", 0.8);
    setTimeout(() => {
      applyViz("volume", 0.5);
      applyViz("atmospheremix", 0.5);
      applyViz("harmonicrich", 0.5);
      applyViz("memoryfeed", 0.4);
    }, 3000);
  } else if (type === "failed") {
    // Red alert flash: spectral shift + resonant spike, then decay
    applyViz("spectralshift", 0.9);
    applyViz("resonantbody", 0.95);
    applyViz("texturedepth", 0.8);
    setTimeout(() => {
      applyViz("spectralshift", 0.4);
      applyViz("resonantbody", 0.4);
      applyViz("texturedepth", 0.3);
    }, 3000);
  } else if (type === "emergency") {
    // Emergency: max spectral + resonant + spatial collapse, slow recovery
    applyViz("spectralshift", 1.0);
    applyViz("resonantbody", 1.0);
    applyViz("spatialspread", 0.0);
    applyViz("volume", 0.15);
    applyViz("texturedepth", 0.9);
    setTimeout(() => {
      applyViz("spectralshift", 0.4);
      applyViz("resonantbody", 0.4);
      applyViz("spatialspread", 0.5);
      applyViz("volume", 0.5);
      applyViz("texturedepth", 0.3);
    }, 6000);
  } else if (type === "stop") {
    // Fade to minimum across all params
    ["volume", "atmospheremix", "harmonicrich", "memoryfeed", "texturedepth"].forEach(p => {
      applyViz(p, 0.05);
    });
  } else if (type === "start") {
    // Restore defaults
    applyViz("volume", 0.5);
    applyViz("pitchshift", 0.5);
    applyViz("timedilation", 0.3);
    applyViz("spectralshift", 0.4);
    applyViz("spatialspread", 0.5);
    applyViz("texturedepth", 0.3);
    applyViz("atmospheremix", 0.5);
    applyViz("memoryfeed", 0.4);
    applyViz("harmonicrich", 0.5);
    applyViz("resonantbody", 0.4);
  }

  // Broadcast event flag to p5.js slots for custom flash effects
}

// ─── Project 3D world pos to CSS px ───
function worldToCss(
  worldPos: THREE.Vector3,
  camera: THREE.Camera,
  canvas: HTMLElement
): { x: number; y: number } {
  const v = worldPos.clone().project(camera);
  const w = canvas.offsetWidth;
  const h = canvas.offsetHeight;
  return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h };
}

// ─── Flat polar → CSS (for eDNA static labels) ───
function radarToCss(
  angleDeg: number, radius: number, canvas: HTMLElement,
  fov = 50, camZ = 20
): { x: number; y: number } {
  const w = canvas.offsetWidth;
  const h = canvas.offsetHeight;
  const halfH = Math.tan((fov / 2) * Math.PI / 180) * camZ;
  const scale = (h / 2) / halfH;
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: w / 2 + Math.cos(rad) * radius * scale, y: h / 2 - Math.sin(rad) * radius * scale };
}

// ─── Spectrogram canvas renderer (enriched: 256-bin, sonETH-reactive color) ───
class SpectrogramRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  private lastPush = 0;
  private prevBins: Float32Array | null = null;
  // ImageData buffer for fast pixel writes (avoids per-pixel fillRect)
  private colData: ImageData | null = null;

  constructor(canvasEl: HTMLCanvasElement) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext("2d")!;
    this.resize();
    this.ctx.fillStyle = "#000402";
    this.ctx.fillRect(0, 0, this.width, this.height);
    window.addEventListener("resize", () => this.resize());
  }

  resize() {
    this.width = this.canvas.offsetWidth || 800;
    this.height = this.canvas.offsetHeight || 144;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.colData = this.ctx.createImageData(1, this.height);
  }

  // Push a column of FFT bins (0-1 each, length = arbitrary)
  // Called at ~30fps from main loop. sonETH params modulate color.
  push(bins: Float32Array, now: number) {
    if (now - this.lastPush < 33) return; // ~30fps
    this.lastPush = now;

    const w = this.width;
    const h = this.height;
    const ctx = this.ctx;

    // Temporal smoothing: blend with previous frame for less flickery look
    if (this.prevBins && this.prevBins.length === bins.length) {
      for (let i = 0; i < bins.length; i++) {
        bins[i] = bins[i] * 0.7 + this.prevBins[i] * 0.3;
      }
    }
    this.prevBins = new Float32Array(bins);

    // Scroll left by 2px for denser waterfall
    const imageData = ctx.getImageData(2, 0, w - 2, h);
    ctx.putImageData(imageData, 0, 0);

    // Read sonETH params for color modulation
    const sp = (window as any).__sonethParams || {};
    const spectral = sp.spectralshift ?? 0.4;   // hue shift: 0=pure amber, 1=cyan tint
    const texture = sp.texturedepth ?? 0.3;    // grain: adds noise to brightness
    const memory = sp.memoryfeed ?? 0.4;    // glow: brightens mid-range

    // Write 2 new right-edge columns using ImageData for speed
    const numBins = bins.length;
    const colBuf = this.colData!;
    const d = colBuf.data;

    for (let y = 0; y < h; y++) {
      // Map canvas y (0=top) to bin index (0=low freq at bottom) with cubic interpolation
      const t = (h - 1 - y) / h;
      const fIdx = t * (numBins - 1);
      const lo = Math.floor(fIdx);
      const hi = Math.min(lo + 1, numBins - 1);
      const frac = fIdx - lo;
      const raw = (bins[lo] || 0) * (1 - frac) + (bins[hi] || 0) * frac;
      let v = Math.min(1, Math.max(0, raw));

      // Memory/glow boost: lift mid-range values
      v = v + memory * 0.15 * v * (1 - v) * 4; // bell curve boost
      // Texture grain: micro-noise on brightness
      v = v + (Math.random() - 0.5) * texture * 0.08;
      v = Math.min(1, Math.max(0, v));

      // 4-stop amber colormap: black → dark red → amber → bright amber-white
      // Spectral param subtly shifts the mid-tones (not the whole palette)
      let r: number, g: number, b: number;
      if (v < 0.33) {
        // Black → dark red/brown
        const t2 = v / 0.33;
        r = Math.floor(120 * t2);
        g = Math.floor(20 * t2);
        b = 0;
      } else if (v < 0.66) {
        // Dark red → amber (with subtle spectral tint in green channel)
        const t2 = (v - 0.33) / 0.33;
        r = Math.floor(120 + 135 * t2);
        g = Math.floor(20 + (116 + spectral * 40) * t2);
        b = Math.floor(spectral * 30 * t2);
      } else {
        // Amber → bright white-amber
        const t2 = (v - 0.66) / 0.34;
        r = Math.floor(255);
        g = Math.floor(136 + 119 * t2);
        b = Math.floor(spectral * 30 + (180 - spectral * 30) * t2);
      }

      const off = y * 4;
      d[off] = r;
      d[off + 1] = g;
      d[off + 2] = b;
      d[off + 3] = 255;
    }

    // Write 2 pixel-wide columns for denser waterfall
    ctx.putImageData(colBuf, w - 2, 0);
    ctx.putImageData(colBuf, w - 1, 0);
  }
}

// ─── Pseudo-FFT from state (256 bins, sonETH-reactive, log-frequency) ───
function buildFftBins(state: ParliamentState | null, elapsed: number, numBins = 256): Float32Array {
  const bins = new Float32Array(numBins);
  const sp = (window as any).__sonethParams || {};
  const volume = sp.volume ?? 0.5;
  const pitch = sp.pitchshift ?? 0.5;
  const timeDil = sp.timedilation ?? 0.3;
  const harmonic = sp.harmonicrich ?? 0.5;
  const resonant = sp.resonantbody ?? 0.4;
  const atmosphere = sp.atmospheremix ?? 0.5;
  const spatial = sp.spatialspread ?? 0.5;

  // Slow-breathing base layer (always visible, reacts to time dilation)
  const breathRate = 0.4 + timeDil * 1.2;
  for (let i = 0; i < numBins; i++) {
    const normI = i / numBins;
    bins[i] = Math.max(0,
      Math.sin(elapsed * breathRate + normI * 2.5) * 0.12 +
      Math.sin(elapsed * breathRate * 0.37 + normI * 7) * 0.06 +
      Math.random() * 0.02
    ) * volume;
  }

  if (!state || !Array.isArray(state.species) || !Array.isArray(state.edna) || !Array.isArray(state.fungi)) {
    // Still produce a living spectrogram even without state
    for (let i = 0; i < numBins; i++) {
      bins[i] += Math.max(0,
        Math.sin(elapsed * 1.8 + i * 0.35) * 0.25 * volume +
        Math.sin(elapsed * 0.7 + i * 0.12) * 0.15 * harmonic
      );
    }
    return bins;
  }

  const logMin = Math.log2(20);
  const logMax = Math.log2(12000); // extended range to 12kHz

  // Species: gaussian peaks at audio frequencies, with harmonic overtones
  for (const spc of state.species) {
    const freq = (spc.freq || 440) * (0.5 + pitch);  // pitch-shifted
    const amp = (spc.presence * 0.8 + spc.activity * 0.6) * volume;
    const width = 4 + spc.presence * 10 + resonant * 6; // resonance widens peaks

    // Fundamental + harmonics (harmonic richness controls overtone count)
    const maxH = 1 + Math.floor(harmonic * 5);
    for (let h = 1; h <= maxH; h++) {
      const hz = freq * h;
      if (hz > 12000) break;
      const logF = Math.log2(Math.max(20, Math.min(12000, hz)));
      const binIdx = Math.floor(((logF - logMin) / (logMax - logMin)) * (numBins - 1));
      const hAmp = amp * (1 / Math.pow(h, 0.8 + resonant * 0.5));
      for (let i = Math.max(0, binIdx - 20); i < Math.min(numBins, binIdx + 20); i++) {
        const dist = Math.abs(i - binIdx);
        bins[i] += hAmp * Math.exp(-(dist * dist) / (2 * width * width));
      }
    }
  }

  // eDNA: harmonic overtone combs (wider spread with atmosphere)
  for (let s = 0; s < state.edna.length; s++) {
    const ed = state.edna[s];
    const baseHz = 55 + s * 7;
    for (let h = 1; h <= 12; h++) {
      const hz = baseHz * h * ed.biodiversity * (0.8 + pitch * 0.4);
      const logF = Math.log2(Math.max(20, Math.min(12000, hz)));
      const b = Math.floor(((logF - logMin) / (logMax - logMin)) * (numBins - 1));
      const hAmp = ed.validation * (1 / Math.sqrt(h)) * 0.15 * volume;
      // Spread each overtone by atmosphere amount
      const spread = 1 + Math.floor(atmosphere * 3);
      for (let j = -spread; j <= spread; j++) {
        const idx = b + j;
        if (idx >= 0 && idx < numBins) {
          bins[idx] += hAmp * (1 - Math.abs(j) / (spread + 1));
        }
      }
    }
  }

  // Fungi: sub-bass rumble (low bins) + spatial-modulated resonance
  const avgFungi = state.fungi.reduce((s, f) => s + f.chemical, 0) / state.fungi.length;
  const bassWidth = 10 + Math.floor(spatial * 15);
  for (let i = 0; i < bassWidth; i++) {
    bins[i] += avgFungi * 0.5 * (1 - i / bassWidth) * volume;
  }

  // Eco: CO2 broadband noise floor + atmosphere-scaled pink noise
  const co2norm = (state.eco?.co2 || 0) / 127;
  for (let i = 0; i < numBins; i++) {
    // Pink noise: amplitude decreases with frequency
    const pink = 1 / Math.sqrt(1 + i * 0.1);
    bins[i] += co2norm * 0.1 * Math.random() * pink;
    bins[i] += atmosphere * 0.04 * Math.random() * pink;
  }

  // Resonant peaks: Q-scaled narrow peaks at resonant frequencies
  if (resonant > 0.2) {
    const resFreqs = [120, 280, 560, 1100, 2200, 4400];
    for (const rf of resFreqs) {
      const logF = Math.log2(Math.max(20, rf));
      const b = Math.floor(((logF - logMin) / (logMax - logMin)) * (numBins - 1));
      const q = resonant * 0.35;
      const rw = Math.max(1, Math.floor(3 - resonant * 2));
      for (let j = -rw; j <= rw; j++) {
        const idx = b + j;
        if (idx >= 0 && idx < numBins) bins[idx] += q * (1 - Math.abs(j) / (rw + 1));
      }
    }
  }

  // Normalize with soft knee (preserves dynamics better than hard clamp)
  let mx = 0;
  for (let i = 0; i < numBins; i++) if (bins[i] > mx) mx = bins[i];
  if (mx > 0.01) {
    const scale = 1 / mx;
    for (let i = 0; i < numBins; i++) {
      bins[i] = Math.min(1, bins[i] * scale);
      // Soft gamma curve: lifts quiet details without clipping peaks
      bins[i] = Math.pow(bins[i], 0.75);
    }
  }

  return bins;
}

// ─── BioToken V3 calculation ───
function calcBioToken(state: ParliamentState): number {
  if (!state || !Array.isArray(state.species) || !Array.isArray(state.edna) || !Array.isArray(state.fungi)) return 0;
  const avgPresence = state.species.reduce((s, sp) => s + sp.presence, 0) / 5;
  const avgActivity = state.species.reduce((s, sp) => s + sp.activity, 0) / 5;
  const avgEdnaBio = state.edna.reduce((s, e) => s + e.biodiversity, 0) / 8;
  const avgFungiChem = state.fungi.reduce((s, f) => s + f.chemical, 0) / 4;
  const aiOpt = state.ai?.optimization / 127 || 0;
  // IUCN weight: highest urgency species dominates
  const maxIucnMult = Math.max(...IUCN_MULT) / 5; // normalize to 0-1
  return avgPresence * avgActivity * avgEdnaBio * avgFungiChem * aiOpt * maxIucnMult;
}

async function init() {
  const container = document.getElementById("parliament-stage");
  if (!container) return;
  const hudEl = document.getElementById("viz-hud");

  // ─── Visualization switcher ───────────────────────────────────────────────
  // Keys 0–9 swap center stage. Left/right panels + spectrogram stay.
  // getActiveThreeStage() returns the live ParliamentStage when slot 0 is active.
  initSwitcher(container, hudEl!, () => currentState);

  // Idle-driven auto-rotation + the shared vote-flash reader. Publishes
  // window.__vizMotion, which every slot reads for its own drift.
  startVizMotion();

  // ── "failed" votes, at last ────────────────────────────────────────────
  // Eight places across the slots branch on type === "failed" and nothing has
  // ever produced one: the four buttons emit passed/start/stop/emergency only.
  // But SC does report real outcomes on /parliament/vote/result with a passed
  // flag, and parliamentStore already ingests it — the result simply never
  // reached __voteEvent. Bridging it here makes every one of those dead
  // branches live, and makes a rejected motion look different from a carried
  // one for the first time.
  {
    let lastResultAt = 0;
    parliamentStore.subscribe((st) => {
      const vr = st.events?.voteResult;
      if (!vr) return;
      const stamp = vr.consensus * 1e6 + vr.yes * 1e3 + vr.total;
      if (stamp === lastResultAt) return;
      lastResultAt = stamp;
      if (!vr.passed) triggerVoteVisualBurst("failed", 1 - (vr.consensus ?? 0.5));
    });
  }

  // ─── Laser projection feed (ILDA / Helios DAC via laser-bridge:3337) ──────
  // Streams the active module's vector scene (default: slot-P year-ring +
  // active-species marker) to the forest laser. No-op + quiet retry if the
  // laser-bridge isn't running, so it's safe to always start.
  initLaserTap();

  // ─── Build eDNA control rows ───
  const ednaCtrlRows = document.getElementById("edna-ctrl-rows");
  const ednaShortNames = ["Chocó", "Amazon", "E.Cord", "Caribb", "Orinoc", "Pacific", "Magdal", "Guayan"];
  if (ednaCtrlRows) {
    ednaCtrlRows.innerHTML = EDNA_IDS.map((id, i) => `
      <div class="ctrl-row">
        <label>${ednaShortNames[i]}</label>
        <input type="range" min="0" max="1" step="0.01" value="0.85"
          data-osc="/agents/edna/biodiversity" data-agent-id="${i}">
        <span class="ctrl-val" id="disp-edna-bio-${i}">0.85</span>
      </div>
    `).join("");
    // eDNA slider wiring happens below, after wireSlider() is defined.
  }

  // ─── Build species control rows (left panel) ───
  function renderSpeciesSliders() {
    const actCtrl = document.getElementById("species-activity-ctrl");
    const presCtrl = document.getElementById("species-presence-ctrl");
    if (actCtrl) {
      actCtrl.innerHTML = SPECIES_NAMES.map((name, i) => {
        const shortName = name.length > 14 ? name.slice(0, 13) + "…" : name;
        return `<div class="ctrl-row">
          <label title="${name}">${shortName}</label>
          <input type="range" min="0" max="1" step="0.01" value="0.50"
            data-osc="/agents/species/activity" data-agent-id="${i}">
          <span class="ctrl-val" id="disp-sp-act-${i}">0.50</span>
        </div>`;
      }).join("");
    }
    if (presCtrl) {
      presCtrl.innerHTML = SPECIES_NAMES.map((name, i) => {
        const shortName = name.length > 14 ? name.slice(0, 13) + "…" : name;
        const defVal = [0.95, 0.80, 0.90, 0.70, 0.50][i] ?? 0.50;
        return `<div class="ctrl-row">
          <label title="${name}">${shortName}</label>
          <input type="range" min="0" max="1" step="0.01" value="${defVal.toFixed(2)}"
            data-osc="/agents/species/presence" data-agent-id="${i}">
          <span class="ctrl-val" id="disp-sp-pres-${i}">${defVal.toFixed(2)}</span>
        </div>`;
      }).join("");
    }
  }
  renderSpeciesSliders();

  // ─── Build right-panel telemetry rows ───
  const speciesTele = document.getElementById("species-tele");
  if (speciesTele) {
    speciesTele.innerHTML = SPECIES_NAMES.map((name, i) => `
      <div style="margin-bottom:5px">
        <div class="tele-row">
          <span class="lbl" style="min-width:58px;font-size:9px">${name}</span>
          <span class="uicn-badge uicn-${SPECIES_IUCN[i]}">${SPECIES_IUCN[i]}</span>
          <div class="tele-bar-wrap"><div class="tele-bar" id="sp-bar-pres-${i}" style="width:50%"></div></div>
          <span class="val" id="sp-val-${i}">—</span>
        </div>
        <div style="display:flex;gap:6px;margin-bottom:1px;padding-left:2px">
          <span class="label">ACT</span><span class="value-sm" id="sp-act-${i}">—</span>
          <span class="label">FREQ</span><span class="value-sm" id="sp-frq-${i}">—</span>
          <span class="label">VOT</span><span class="value-sm" id="sp-vot-${i}">—</span>
        </div>
      </div>
    `).join("");
  }

  const ednaTele = document.getElementById("edna-tele");
  if (ednaTele) {
    ednaTele.innerHTML = EDNA_IDS.map((id, i) => `
      <div class="tele-row" style="margin-bottom:2px">
        <span class="lbl" style="min-width:28px">${id}</span>
        <div class="tele-bar-wrap"><div class="tele-bar" id="ed-bar-${i}" style="width:85%"></div></div>
        <span class="val" id="ed-bio-${i}" style="min-width:32px">—</span>
        <span class="val" id="ed-val-${i}" style="min-width:32px;color:var(--text-dim)">—</span>
      </div>
    `).join("");
  }

  const fungiTele = document.getElementById("fungi-tele");
  const fungiNames = ["N.Myco", "C.Spore", "S.Web", "Coastal"];
  if (fungiTele) {
    fungiTele.innerHTML = fungiNames.map((name, i) => `
      <div class="tele-row" style="margin-bottom:2px">
        <span class="lbl" style="min-width:40px">${name}</span>
        <div class="tele-bar-wrap"><div class="tele-bar" id="fg-bar-${i}" style="width:60%"></div></div>
        <span class="val" id="fg-chem-${i}">—</span>
        <span class="val" id="fg-conn-${i}" style="color:var(--text-dim)">—</span>
      </div>
    `).join("");
  }

  // ─── Canvas labels ───
  const overlay = document.getElementById("canvas-overlay");
  const canvasWrap = document.getElementById("canvas-wrap");
  const speciesLabelEls: HTMLElement[] = [];

  if (overlay && canvasWrap) {
    for (let i = 0; i < 5; i++) {
      const el = document.createElement("div");
      el.className = "species-label";
      el.id = `sp-label-${i}`;
      el.textContent = SPECIES_NAMES[i].toUpperCase();
      overlay.appendChild(el);
      speciesLabelEls.push(el);
    }
    EDNA_ANGLES_DEG.forEach((deg, i) => {
      const pos = radarToCss(deg, 9.5, canvasWrap);
      const el = document.createElement("div");
      el.className = "edna-label";
      el.style.left = pos.x + "px";
      el.style.top = pos.y + "px";
      el.textContent = EDNA_IDS[i];
      overlay.appendChild(el);
    });
  }

  // Label tracking loop — only active when slot 0 (Three.js parliament) is live
  function updateLabels() {
    const s = getActiveThreeStage();
    // Hide species + eDNA labels when not on slot 0
    if (!canvasWrap || !s?.speciesGroups || !s?.camera) {
      if (overlay) overlay.style.visibility = "hidden";
      return;
    }
    if (overlay) overlay.style.visibility = "visible";
    for (let i = 0; i < 5; i++) {
      const grp = s.speciesGroups[i];
      if (!grp) continue;
      const pos = worldToCss(grp.position, s.camera, canvasWrap);
      const el = speciesLabelEls[i];
      el.style.left = pos.x + "px";
      el.style.top = (pos.y - 20) + "px";
    }
  }
  (function labelLoop() { updateLabels(); requestAnimationFrame(labelLoop); })();

  // ─── Spectrogram renderer (external canvas, not Three.js) ───
  const spectroCanvas = document.getElementById("spectrogram-canvas") as HTMLCanvasElement;
  let spectroRenderer: SpectrogramRenderer | null = null;
  if (spectroCanvas) {
    spectroRenderer = new SpectrogramRenderer(spectroCanvas);
  }

  // ─── OSC SLIDER WIRING ───
  // Each slider:
  //   1. Sends OSC to SC over WebSocket (round-trip visual via broadcast)
  //   2. Also patches parliamentStore state IMMEDIATELY so visuals respond
  //      without needing SC to echo the value back.
  //
  // Slider addr → store mutation mapping:
  //   /parliament/consensus         → state.consensus
  //   /parliament/rotation          → state.rotation
  //   /agents/species/activity [id] → state.species[id].activity
  //   /agents/species/presence [id] → state.species[id].presence
  //   /agents/edna/biodiversity [id]→ state.edna[id].biodiversity
  //   /agents/fungi/chemical [id]   → state.fungi[id].chemical
  //   /agents/ai/consciousness      → state.ai.consciousness
  //   /parliament/vote              → trigger vote event
  //   /parliament/emergency [v]     → state.consensus = v (emergency override)
  //   FX paths (/parliament/fx/*)   → SC only (no local state equivalent)

  // ─── sonETH ambient params — live values shared with visual switches ────────
  // Keyed by the last OSC path segment (e.g. "/soneth/pitchshift" → "pitchshift").
  // visualizationSwitcher reads this via getSonethParams() exported below.
  const sonethParams: Record<string, number> = {
    volume: 0.5,
    pitchshift: 0.5,
    timedilation: 0.3,
    spectralshift: 0.4,
    spatialspread: 0.5,
    texturedepth: 0.3,
    atmospheremix: 0.5,
    memoryfeed: 0.4,
    harmonicrich: 0.5,
    resonantbody: 0.4,
    masteramp: 0.7,
    filtercutoff: 0.5,
    noiselevel: 0.2,
    noisefilt: 0.5,
    dronedepth: 0.4,
    dronefade: 0.5,
    dronespace: 0.5,
    dronemix: 0.4,
    delayfeedback: 0.3,
    txInfluence: 0.5,
    beatTempo: 0.5,
  };
  // Expose so visualizationSwitcher.ts can reach it at runtime via window
  (window as any).__sonethParams = sonethParams;

  function patchStoreFromSlider(addr: string, id: number | null, v: number) {
    const st = parliamentStore.state;
    if (!st) return;
    if (addr === "/parliament/consensus") { st.consensus = v; }
    else if (addr === "/parliament/rotation") { st.rotation = v; }
    else if (addr === "/agents/species/activity" && id !== null && st.species?.[id]) { st.species[id].activity = v; }
    else if (addr === "/agents/species/presence" && id !== null && st.species?.[id]) { st.species[id].presence = v; }
    else if (addr === "/agents/edna/biodiversity" && id !== null && st.edna?.[id]) { st.edna[id].biodiversity = v; }
    else if (addr === "/agents/fungi/chemical" && id !== null && st.fungi?.[id]) { st.fungi[id].chemical = v; }
    else if (addr === "/agents/ai/consciousness") { st.ai?.consciousness !== undefined && (st.ai.consciousness = v); }
    else if (addr === "/parliament/emergency") { st.consensus = Math.max(0, 1 - v); }
    else if (addr.startsWith("/soneth/")) {
      // sonETH ambient param — update live object, then apply to active viz
      const key = addr.slice("/soneth/".length);
      sonethParams[key] = v;
      // Use window.__applySonethToViz so DIAG trackedApply wrapper records the timestamp
      ((window as any).__applySonethToViz ?? applySonethToViz)(key, v);
      // Notify slot 2 ZKP interval scheduler about txInfluence/harmonicrich changes
      if (key === "txInfluence" || key === "harmonicrich") {
        window.dispatchEvent(new Event("soneth-param-change"));
      }
      // Phenology calendar: lock its year-sweep tempo to the beat engine.
      // No-op when the calendar slot isn't mounted.
      if (key === "beatTempo") notifyPhenoBeatTempo(v);
      // SC is notified via sendOSC() in wireSlider — no store notify needed here
      return;
    }
    // volume / fx paths: no local state equivalent, SC handles them
    else return;

    // For atmosphere-driving values, bypass lerp smoothing on the active Three.js stage
    // so slider movement is immediately visible rather than taking ~1s to converge.
    const s = getActiveThreeStage();
    if (s) {
      if (addr === "/parliament/consensus") {
        const turbulence = Math.pow(1.0 - Math.min(1, v), 2.0);
        s._smoothConsensus = v;
        s._smoothTurbulence = turbulence;
        s._smoothWarmth = 0.25 + v * 0.75;
        s._smoothEmergency = Math.max(0, (1 - v) * Math.min(1, (st.votes || 0) / 10) - 0.2);
      }
    }

    // Notify all subscribers (ParliamentStage, AsteroidWaves, telemetry panel)
    parliamentStore.notifyListeners();
  }

  // ─── Apply a single sonETH param change to ALL visualizations ──────────────
  // This is the central instrument control matrix. Every sonETH parameter drives
  // both SuperCollider audio (via OSC) AND visual parameters in all 4 slots.
  // When a slot is not mounted its window.__slotNSoneth still updates, so the
  // values are ready when the user switches to that slot.
  //
  // CONTROL MATRIX (10 params × 4 slots = 40 visual bindings):
  //
  //   PARAM            │ SLOT 0 Parliament      │ SLOT 1 AsteroidWaves   │ SLOT 2 LowEarthPoint    │ SLOT 3 PerlinBlob
  //   ─────────────────┼────────────────────────┼────────────────────────┼─────────────────────────┼─────────────────────
  //   volume           │ point light intensity  │ wave stroke alpha      │ white cloud opacity     │ stroke opacity
  //   pitchShift       │ species Z amplitude    │ lane X offset          │ white cloud Y-stretch   │ noise intensity
  //   timeDilation     │ orbit speed multiplier │ noise X zoom           │ rotation damping         │ cycle frames
  //   spectralShift    │ bloom threshold        │ amber→cyan tint        │ line hue shift           │ layer compression
  //   spatialSpread    │ camera distance        │ lane spread override   │ white lines XY spread    │ blob X/Y offset
  //   textureDepth     │ film grain intensity   │ grid line density      │ white point size         │ stroke weight range
  //   atmosphereMix    │ afterimage damp        │ background ghosting    │ red cloud opacity        │ layer count
  //   memoryFeed       │ bloom strength offset  │ ghost trail alpha      │ red lines opacity        │ ghost alpha
  //   harmonicRich     │ lissajous complexity   │ wave harmonic overlay  │ red Bézier Z-scale       │ hue drift
  //   resonantBody     │ chroma aberration      │ peak dot glow size     │ red cloud scale          │ inner layer weight

  function applySonethToViz(key: string, v: number) {

    // ── SLOT 0 — ParliamentStage (Three.js post-processing + scene) ──────────
    const s = getActiveThreeStage();
    if (s && !s.destroyed) {
      switch (key) {
        case "volume":
          // Volume → point light intensity (scene brightness, 0.5→2.5)
          if (s._ptLight) s._ptLight.intensity = 0.5 + v * 2.0;
          break;
        case "pitchshift":
          // Pitch → species Z oscillation amplitude factor (stored, read in updateStage)
          s._sonethPitchZ = v; // 0→0 Z swing, 1→full Z swing
          break;
        case "timedilation":
          // Time dilation → orbit speed multiplier (high = slower orbits)
          s._sonethTimeScale = v; // read in updateStage orbit calc
          break;
        case "spectralshift":
          // Spectral → bloom threshold (low cutoff=more glow, high=selective)
          if (s._bloom) s._bloom.threshold = 0.35 - v * 0.30;
          break;
        case "spatialspread":
          // Spatial → camera distance offset (wide=far, narrow=close)
          if (s.controls) {
            s.controls.minDistance = 8 + v * 8;   // 8→16
            s.controls.maxDistance = 40 - v * 15;  // 40→25
          }
          break;
        case "texturedepth":
          // Texture → film grain intensity (granular = noisy image)
          if (s._filmPass) s._filmPass.uniforms.intensity.value = v * 0.40;
          break;
        case "atmospheremix":
          // Atmosphere → afterimage persistence (reverb = visual trails)
          if (s._afterimage?.uniforms?.damp) s._afterimage.uniforms.damp.value = 0.80 + v * 0.17;
          break;
        case "memoryfeed":
          // Memory → bloom strength offset (delay feedback = lingering glow)
          if (s._bloom) s._bloom.strength = Math.min(2.0, (s._bloom.strength || 0.6) + (v - 0.4) * 0.4);
          break;
        case "harmonicrich":
          // Harmonic → Lissajous curve complexity (FM ratio = more lobes)
          s._sonethHarmonicLiss = v; // read in updateStage lissajous calc
          break;
        case "resonantbody":
          // Resonant → chromatic aberration (filter Q = RGB split)
          if (s._chromaPass?.uniforms?.amount) s._chromaPass.uniforms.amount.value = v * 0.012;
          break;

        // ── Row 3: Drone/Noise — visual bindings for Slot 0 ──────────────────
        case "masteramp":
          // Master amp → bloom strength (overall glow intensity)
          if (s._bloom) s._bloom.strength = Math.min(2.5, 0.2 + v * 1.5);
          break;
        case "filtercutoff":
          // Filter cutoff → bloom radius (tight = sharp halo, wide = diffuse)
          if (s._bloom) s._bloom.radius = 0.1 + v * 0.9;
          break;
        case "noiselevel":
          // Noise level → film grain noise intensity
          if (s._filmPass?.uniforms?.nIntensity) s._filmPass.uniforms.nIntensity.value = v * 0.8;
          break;
        case "noisefilt":
          // Noise filter → film scanline density (texture grain size)
          if (s._filmPass?.uniforms?.sCount) s._filmPass.uniforms.sCount.value = Math.round(64 + v * 192);
          break;
        case "dronedepth":
          // Drone depth → radar grid breath scale + point light reach
          s._sonethDroneDepth = v;
          if (s._ptLight) s._ptLight.distance = 10 + v * 40;
          break;

        // ── Row 4: Additional Controls — visual bindings for Slot 0 ──────────
        case "dronefade":
          // Drone fade → point light color warmth (slow = warm amber, fast = cool white)
          if (s._ptLight) s._ptLight.color.setRGB(1.0, 0.6 + v * 0.4, 0.2 + v * 0.3);
          break;
        case "dronespace":
          // Drone space → camera look-at elevation (vertical scene reframing)
          if (s.controls?.target) s.controls.target.y = (v - 0.5) * 6;
          break;
        case "dronemix":
          // Drone mix → scanline intensity (analog warmth blend)
          if (s._filmPass?.uniforms?.sIntensity) s._filmPass.uniforms.sIntensity.value = v * 0.4;
          break;
        case "delayfeedback":
          // Delay feedback → afterimage trail persistence (echo = visual repetition)
          if (s._afterimage?.uniforms?.damp) s._afterimage.uniforms.damp.value = 0.79 + v * 0.18;
          break;
        case "txInfluence":
        case "txinfluence":
          // TX influence → stored ETH activity intensity (modulates bloom bursts on ETH events)
          s._sonethTxInfluence = v;
          break;
      }
      // ETH-derived event params (kept for beat engine broadcasts)
      if (key === "ethActivity") {
        if (s._bloom) s._bloom.strength = 0.4 + v * 0.8;
        s._sonethTimeScale = 1.0 - v * 0.5; // faster orbits with ETH activity
      }
      if (key === "txDensity") {
        if (s._afterimage?.uniforms?.damp) s._afterimage.uniforms.damp.value = 0.82 + v * 0.15;
      }
      if (key === "ethEvent" && s._bloom) {
        const base = s._bloom.strength;
        s._bloom.strength = Math.min(2.5, base + 0.6);
        setTimeout(() => { if (s._bloom) s._bloom.strength = base; }, 300);
      }
    }

    // ── SLOT 1 — AsteroidWaves (p5.js): write to window global, draw() reads ─
    if (!(window as any).__slot1Soneth) (window as any).__slot1Soneth = {};
    (window as any).__slot1Soneth[key] = v;

    // ── SLOT 2 — LowEarthPoint (Three.js): write global + poke stage directly ─
    if (!(window as any).__slot2Soneth) (window as any).__slot2Soneth = {};
    (window as any).__slot2Soneth[key] = v;

    const activeViz = (window as any).__activeVizStage2;
    if (activeViz && !activeViz.destroyed) {
      switch (key) {
        case "volume":
          // Volume → white cloud opacity (presence)
          if (activeViz.pointCloud?.material) {
            activeViz.pointCloud.material.opacity = 0.15 + v * 0.85;
          }
          break;
        case "pitchshift":
          // Pitch → white cloud Y-axis stretch
          if (activeViz.pointCloud) activeViz.pointCloud.scale.y = 0.4 + v * 2.2;
          break;
        case "timedilation":
          // Time dilation → rotation damping (high = slow, inverted)
          if (activeViz.cameraSettings) {
            const base = (window as any).__slot2Soneth?.txInfluence ?? 0.5;
            activeViz.cameraSettings.cameraSpeed = (0.1 + base * 7.9) * (1.1 - v * 0.9);
          }
          break;
        case "spectralshift":
          // Spectral → line color hue shift (rebuild with new color)
          activeViz._sonethHue = v; // read in next line rebuild cycle
          break;
        case "spatialspread":
          // Spatial → white lines XY spread
          if (activeViz.linesGroup) {
            const ss = 0.4 + v * 1.2;
            activeViz.linesGroup.scale.x = ss;
            activeViz.linesGroup.scale.y = ss;
          }
          break;
        case "texturedepth":
          // Texture → white point size (grain detail)
          if (activeViz.pointCloud?.material) activeViz.pointCloud.material.size = 0.02 + v * 0.18;
          break;
        case "atmospheremix":
          // Atmosphere → red cloud opacity (reverb = red haze presence)
          if (activeViz.redPointCloud?.material) {
            activeViz.redPointCloud.material.opacity = 0.05 + v * 0.90;
          }
          break;
        case "memoryfeed":
          // Memory → red Bézier lines opacity (delay = lingering connections)
          if (activeViz.redLinesGroup) {
            activeViz.redLinesGroup.children.forEach((child: any) => {
              if (child.material) { child.material.opacity = v * 0.50; child.material.transparent = true; }
            });
          }
          break;
        case "harmonicrich":
          // Harmonic → red Bézier midZ scale (FM = complex curves)
          if (activeViz.redLinesGroup) activeViz.redLinesGroup.scale.z = 0.5 + v * 3.0;
          break;
        case "resonantbody":
          // Resonant → red cloud scale (filter Q = red mass expansion)
          if (activeViz.redPointCloud) {
            const rs = 0.3 + v * 2.0;
            activeViz.redPointCloud.scale.setScalar(rs);
          }
          break;
      }
      // ETH event params for slot 2
      if (key === "ethActivity" && activeViz.pointCloud?.material) {
        activeViz.pointCloud.material.opacity = 0.3 + v * 0.7;
        activeViz.pointCloud.material.size = 0.03 + v * 0.12;
      }
      if (key === "ethEvent" && activeViz.pointCloud) {
        const origScale = activeViz.pointCloud.scale.x;
        activeViz.pointCloud.scale.set(origScale * 1.15, origScale * 1.15, origScale * 1.15);
        setTimeout(() => {
          if (activeViz.pointCloud) activeViz.pointCloud.scale.set(origScale, origScale, origScale);
        }, 200);
      }
    }

    // ── SLOT 3 — PerlinBlob (p5.js): write global, draw() reads each frame ───
    if (!(window as any).__slot3Soneth) (window as any).__slot3Soneth = {};
    (window as any).__slot3Soneth[key] = v;

    // ── SLOTS 4-9: Forward to new visualizer modules ───
    for (let i = 4; i <= 9; i++) {
      const slotKey = `__slot${i}Soneth`;
      if (!(window as any)[slotKey]) (window as any)[slotKey] = {};
      (window as any)[slotKey][key] = v;
    }
  }

  // Expose so the SC→browser echo handler in connectControlWS() can call it
  (window as any).__applySonethToViz = applySonethToViz;

  // ─── Diagnostic Monitor Overlay (toggle with Shift+D) ───────────────────────
  // Shows live param values, last-update timestamps, and slot write confirmations.
  // Green = received in last 2s, amber = stale (>2s), grey = never received.
  (function initDiagMonitor() {
    const CORE_PARAMS = [
      "volume", "pitchshift", "timedilation", "spectralshift", "spatialspread",
      "texturedepth", "atmospheremix", "memoryfeed", "harmonicrich", "resonantbody",
    ];
    const EXTRA_PARAMS = [
      "masteramp", "filtercutoff", "noiselevel", "noisefilt", "dronedepth",
      "dronefade", "dronespace", "dronemix", "delayfeedback",
      "beatTempo", "txInfluence",
    ];
    const ALL_PARAMS = [...CORE_PARAMS, ...EXTRA_PARAMS];
    const SLOTS = ["S0:Parliament", "S1:Asteroid", "S2:LowEarth", "S3:Perlin", "S4:Module", "S5:Module", "S6:Module", "S7:Module", "S8:Module", "S9:Module"];

    const lastSeen: Record<string, number> = {};
    let overlay: HTMLDivElement | null = null;
    let visible = false;

    function createOverlay() {
      overlay = document.createElement("div");
      overlay.id = "diag-monitor";
      overlay.style.cssText = `
        position:fixed; top:8px; right:8px; z-index:99999;
        background:rgba(0,4,2,0.94); border:1px solid #1a3a1a;
        border-radius:6px; padding:12px 14px; font:14px/1.5 monospace;
        color:#88aa88; max-height:90vh; width:600px; overflow-y:auto; overflow-x:auto; pointer-events:auto;
        min-width:600px;
      `;
      overlay.innerHTML = `
        <div style="color:#44ff66;font-weight:bold;margin-bottom:6px;font-size:16px;">
          DIAG MONITOR <span style="color:#666;font-weight:normal;font-size:12px;">(Shift+D to hide)</span>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:6px;font-size:13px;">
          <span style="color:#0f0;">●</span> &lt;2s
          <span style="color:#fa0;">●</span> stale
          <span style="color:#444;">●</span> never
        </div>
        <table id="diag-table" style="border-collapse:collapse;width:100%;font-size:13px;"></table>
        <div id="diag-ws-status" style="margin-top:8px;color:#666;font-size:13px;">WS: —</div>
        <div id="diag-msg-count" style="color:#666;font-size:13px;">msgs: 0</div>
      `;
      document.body.appendChild(overlay);

      const table = document.getElementById("diag-table") as HTMLTableElement;
      // Header row
      const hdr = table.insertRow();
      hdr.innerHTML = `<th style="text-align:left;color:#44ff66;padding:2px 4px;">Param</th>
        <th style="color:#44ff66;padding:2px 4px;">Val</th>
        ${SLOTS.map(s => `<th style="color:#44ff66;padding:2px 4px;font-size:11px;">${s}</th>`).join("")}
        <th style="color:#44ff66;padding:2px 4px;">Age</th>`;

      ALL_PARAMS.forEach(p => {
        const row = table.insertRow();
        row.id = `diag-row-${p}`;
        const slotDots = Array.from({length: 10}, (_, i) =>
          `<td id="ds${i}-${p}" style="text-align:center;padding:2px 4px;">●</td>`
        ).join("");
        row.innerHTML = `
          <td style="padding:2px 6px;">${p}</td>
          <td id="dv-${p}" style="text-align:center;color:#666;padding:2px 4px;">—</td>
          ${slotDots}
          <td id="da-${p}" style="text-align:right;color:#666;padding:2px 4px;">—</td>
        `;
      });
    }

    // Hook into applySonethToViz to track arrivals
    const origApply = applySonethToViz;
    function trackedApply(key: string, v: number) {
      lastSeen[key] = performance.now();
      origApply(key, v);
    }
    (window as any).__applySonethToViz = trackedApply;

    // patchStoreFromSlider now routes through window.__applySonethToViz so DIAG tracks HTML slider moves too

    let msgCount = 0;
    // Intercept WS messages for counting
    const origOnMessage = controlWS?.onmessage;
    function patchWSCounting() {
      if (!controlWS) return;
      const prevHandler = controlWS.onmessage;
      controlWS.onmessage = (evt) => {
        msgCount++;
        if (prevHandler) prevHandler.call(controlWS, evt);
      };
    }
    // Re-patch after reconnect
    const origConnect = connectControlWS;

    // Update loop
    setInterval(() => {
      if (!visible || !overlay) return;
      const now = performance.now();
      const sp = (window as any).__sonethParams || {};
      const slotGlobals = [
        sp, // S0: main soneth params
        (window as any).__slot1Soneth || {},
        (window as any).__slot2Soneth || {},
        (window as any).__slot3Soneth || {},
        (window as any).__slot4Soneth || {},
        (window as any).__slot5Soneth || {},
        (window as any).__slot6Soneth || {},
        (window as any).__slot7Soneth || {},
        (window as any).__slot8Soneth || {},
        (window as any).__slot9Soneth || {},
      ];

      ALL_PARAMS.forEach(p => {
        const valEl = document.getElementById(`dv-${p}`);
        const ageEl = document.getElementById(`da-${p}`);
        const val = sp[p];
        if (valEl) valEl.textContent = typeof val === "number" ? val.toFixed(3) : "—";

        const age = lastSeen[p] ? (now - lastSeen[p]) / 1000 : -1;
        const color = age < 0 ? "#444" : age < 2 ? "#0f0" : "#fa0";
        if (ageEl) {
          ageEl.textContent = age < 0 ? "—" : age.toFixed(1) + "s";
          ageEl.style.color = color;
        }

        // Slot dots: green if the slot global has this param set
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(si => {
          const dot = document.getElementById(`ds${si}-${p}`);
          if (dot) {
            const has = typeof slotGlobals[si][p] === "number";
            dot.style.color = has ? (age >= 0 && age < 2 ? "#0f0" : "#fa0") : "#444";
          }
        });
      });

      // WS status
      const wsEl = document.getElementById("diag-ws-status");
      if (wsEl) wsEl.textContent = `WS: ${controlWsReady ? "CONNECTED" : "DISCONNECTED"}`;
      const msgEl = document.getElementById("diag-msg-count");
      if (msgEl) msgEl.textContent = `msgs: ${msgCount}`;
    }, 200);

    // Toggle with Shift+D
    document.addEventListener("keydown", (e) => {
      if (e.shiftKey && e.key === "D") {
        visible = !visible;
        if (visible && !overlay) createOverlay();
        if (overlay) overlay.style.display = visible ? "block" : "none";
      }
    });
  })();

  // ─── Slider display ID map (addr → id prefix used in HTML) ───────────────
  // Must match the actual element IDs in parliament.html and the edna rows injected above.
  const SLIDER_DISP_PREFIX: Record<string, string> = {
    "/agents/species/activity": "disp-sp-act-",
    "/agents/species/presence": "disp-sp-pres-",
    "/agents/edna/biodiversity": "disp-edna-bio-",
    "/parliament/consensus": "disp-consensus",
    "/parliament/rotation": "disp-rotation",
    "/parliament/fx/reverb": "disp-reverb",
    "/parliament/fx/room": "disp-room",
    "/parliament/fx/delaytime": "disp-delaytime",
    "/parliament/fx/decaytime": "disp-decaytime",
    // sonETH ambient controls — id suffix is the param key (no agent-id)
    "/soneth/volume": "disp-soneth-volume",
    "/soneth/pitchshift": "disp-soneth-pitchshift",
    "/soneth/timedilation": "disp-soneth-timedilation",
    "/soneth/spectralshift": "disp-soneth-spectralshift",
    "/soneth/spatialspread": "disp-soneth-spatialspread",
    "/soneth/texturedepth": "disp-soneth-texturedepth",
    "/soneth/atmospheremix": "disp-soneth-atmospheremix",
    "/soneth/memoryfeed": "disp-soneth-memoryfeed",
    "/soneth/harmonicrich": "disp-soneth-harmonicrich",
    "/soneth/resonantbody": "disp-soneth-resonantbody",
    "/soneth/beatTempo": "disp-soneth-beatTempo",
    "/soneth/txInfluence": "disp-soneth-txInfluence",
    // Drone / Noise + delay — these reach SC (\opalDrone etc.) but were absent
    // from this map, so their HTML readout never updated on drag (only on a SC
    // echo). Mapped now so every sound-altering slider shows its live value.
    "/soneth/masteramp": "disp-soneth-masteramp",
    "/soneth/filtercutoff": "disp-soneth-filtercutoff",
    "/soneth/noiselevel": "disp-soneth-noiselevel",
    "/soneth/noisefilt": "disp-soneth-noisefilt",
    "/soneth/dronedepth": "disp-soneth-dronedepth",
    "/soneth/dronefade": "disp-soneth-dronefade",
    "/soneth/dronespace": "disp-soneth-dronespace",
    "/soneth/dronemix": "disp-soneth-dronemix",
    "/soneth/delayfeedback": "disp-soneth-delayfeedback",
    // Cámara Fenológica (Capítulo VI) — id suffix is the param key (no agent-id)
    "/pheno/activityThreshold": "disp-pheno-activityThreshold",
    "/pheno/windowWidth":       "disp-pheno-windowWidth",
    "/pheno/seasonalBias":      "disp-pheno-seasonalBias",
    "/pheno/absenceWeight":     "disp-pheno-absenceWeight",
    "/pheno/pulseGain":         "disp-pheno-pulseGain",
    "/pheno/opacityFloor":      "disp-pheno-opacityFloor",
    "/pheno/bancada":           "disp-pheno-bancada",
  };

  // ─── Replica → instrument macros ───────────────────────────────────────────
  // The Parliament/Species/eDNA sliders have NO direct SC handler (see
  // SLOT_B_AND_INDEX_AUDIT.md). Rather than leave them VIZ-only, each one biases
  // the SC instrument by *driving the conceptually-matching /soneth slider*,
  // which already reaches SC through the proven browser→bridge→SC path. The
  // fine-tune /soneth slider visibly moves too, so the macro stays legible — a
  // parliament-level control sitting above the raw synth knobs.
  function driveSonethSlider(key: string, v01: number) {
    const v = Math.max(0, Math.min(1, v01));
    const target = document.querySelector<HTMLInputElement>(
      `input[type='range'][data-osc='/soneth/${key}']`
    );
    if (!target) return;
    target.value = String(v);
    // Reuse the target's own wired handler: sends OSC→SC, updates display,
    // patches the store, applies to the active viz. No new code path.
    target.dispatchEvent(new Event("input"));
  }

  // ─── Regional eDNA vector — live values shared with visual modules ────────
  // Eight Colombian biogeographic regions, in EDNA_IDS order:
  //   CHO Chocó · AMZ Amazonas · COR Cordillera Oriental · CAR Caribe
  //   ORI Orinoquía · PAC Pacífico · MAG Magdalena · GUA Guayana
  //
  // Published on the same contract the modules already poll (__sonethParams,
  // __phenoParams, __activeSpecies, __transitoDrone). Until now these eight
  // sliders reached nothing regional anywhere: a binary >0.7 class on the
  // biome map and three numbers in a diag readout. No 3-D module saw them.
  const ednaBio: number[] = new Array(8).fill(0.5);
  (window as unknown as { __ednaBio?: number[] }).__ednaBio = ednaBio;

  function publishEdna() {
    const arr = parliamentStore.state?.edna;
    if (!Array.isArray(arr)) return;
    for (let i = 0; i < ednaBio.length; i++) {
      const v = arr[i]?.biodiversity;
      if (typeof v === "number" && isFinite(v)) ednaBio[i] = v;
    }
  }

  // Mean of one field across an agent group in the live store. Returns the
  // field's own value when the group is empty or unreadable, so a macro can
  // never drive its target from NaN.
  function groupMean(group: "species" | "edna", field: string): number {
    const arr = (parliamentStore.state as unknown as Record<string, Record<string, number>[]>)?.[group];
    if (!Array.isArray(arr) || arr.length === 0) return 0.5;
    let sum = 0, n = 0;
    for (const a of arr) {
      const x = a?.[field];
      if (typeof x === "number" && isFinite(x)) { sum += x; n++; }
    }
    return n > 0 ? sum / n : 0.5;
  }

  const REPLICA_MACROS: Record<string, (v: number) => void> = {
    // Rotation of the assembly = the cyclical cadence → beat tempo.
    // (slider range is 0.1–2.0; normalise to 0–1 for the beatTempo fader)
    "/parliament/rotation": (v) => driveSonethSlider("beatTempo", (v - 0.1) / 1.9),
    // Consensus = harmonic resolution: fuller harmonics + a quieter noise floor.
    "/parliament/consensus": (v) => {
      driveSonethSlider("harmonicrich", 0.35 + v * 0.5);
      driveSonethSlider("noiselevel", 0.45 * (1 - v));
    },
    // ── The three GROUP macros drive their target from the group MEAN ──────
    // Each of these addresses is shared by several sliders — 5 species, 5
    // presence, 8 eDNA regions — and each used to pass only the value of the
    // slider that had just moved. Eight controls fighting over one parameter,
    // each ignoring the other seven: region 3 at 0.95 put spectralShift at
    // 0.82, then touching region 5 at 0.78 teleported it to 0.72. That is the
    // jumping. wireSlider calls patchStoreFromSlider BEFORE the macro, so the
    // store already holds the new value here and the mean is current.
    // One slider now moves the target by ~1/5 or ~1/8 of its range.
    "/agents/species/activity": () =>
      driveSonethSlider("texturedepth", groupMean("species", "activity")),
    "/agents/species/presence": () =>
      driveSonethSlider("atmospheremix", 0.2 + groupMean("species", "presence") * 0.6),
    "/agents/edna/biodiversity": () => {
      publishEdna();   // regions reach Estratos + DarkForest via __ednaBio
      driveSonethSlider("spectralshift", 0.25 + groupMean("edna", "biodiversity") * 0.6);
    },
  };

  function wireSlider(slider: HTMLInputElement) {
    if ((slider as any)._sliderWired) return; // already wired
    (slider as any)._sliderWired = true;

    const addr = slider.dataset.osc!;
    const agentId = slider.dataset.agentId;
    const prefix = SLIDER_DISP_PREFIX[addr] ?? `disp-${addr.split("/").pop()}-`;

    // Derive display element — agent sliders use prefix+id, global sliders use prefix alone
    const dispId = agentId !== undefined ? `${prefix}${agentId}` : prefix;
    const dispEl = document.getElementById(dispId);

    slider.addEventListener("input", () => {
      const v = parseFloat(slider.value);
      const id = agentId !== undefined ? parseInt(agentId) : null;
      if (dispEl) dispEl.textContent = v.toFixed(2);

      // 1. Send to SC
      if (id !== null) sendOSCArgs(addr, [id, v]);
      else sendOSC(addr, v);

      // 2. Patch local store immediately for instant visual feedback
      patchStoreFromSlider(addr, id, v);

      // 3. If this is a parliament/agent replica (no direct SC handler), bias
      //    the instrument via its conceptually-matching /soneth slider.
      const macro = REPLICA_MACROS[addr];
      if (macro) macro(v);
    });
  }

  // ── Marea · arco de densidad: tide toggles (/tide/*) ────────────────────
  // Same contract as wireSlider, but the value is 0/1. SC's registry entries
  // use a stepped ControlSpec(0,1,\lin,1), so ~setParamNorm snaps whatever it
  // receives — MIDI CC, preset load or this checkbox — to one of two states.
  //
  // Note what this deliberately does NOT do: it does not untick the sibling
  // arcs. Mutual exclusion is SC's rule, enforced once in ~setParam, and the
  // browser only reflects the echo. Implementing it here as well would give
  // the same rule two owners that could disagree — which is precisely the
  // failure the seven removed /rhythm/ toggles had.
  function wireToggle(el: HTMLInputElement) {
    const addr = el.dataset.osc;
    if (!addr) return;
    el.addEventListener("change", () => {
      sendOSC(addr, el.checked ? 1 : 0);
    });
  }

  // Wire all currently-present range sliders (includes static HTML ones)
  document.querySelectorAll<HTMLInputElement>("input[type='range'][data-osc]").forEach(wireSlider);
  document.querySelectorAll<HTMLInputElement>("input[type='checkbox'][data-osc]").forEach(wireToggle);

  // ── CONFIGS: save/load the full control state ──────────────────────────
  // SC owns the preset files (presets/*.json); loading routes every value
  // through ~setParam so the SC GUI knobs AND these sliders follow via echo.
  {
    const nameInput = document.getElementById("preset-name") as HTMLInputElement | null;
    const select = document.getElementById("preset-select") as HTMLSelectElement | null;
    document.getElementById("preset-save-btn")?.addEventListener("click", () => {
      const name = (nameInput?.value || "").trim() || `config_${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`;
      sendOSCString("/preset/save", name);
    });
    document.getElementById("preset-load-btn")?.addEventListener("click", () => {
      if (select?.value) sendOSCString("/preset/load", select.value);
    });
  }

  // Wire eDNA sliders that were dynamically injected above (they're in the DOM now)
  if (ednaCtrlRows) {
    ednaCtrlRows.querySelectorAll<HTMLInputElement>("input[type='range'][data-osc]").forEach(wireSlider);
  }

  // Wire species sliders that were dynamically injected above
  ["species-activity-ctrl", "species-presence-ctrl"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.querySelectorAll<HTMLInputElement>("input[type='range'][data-osc]").forEach(wireSlider);
  });

  // ─── Cámara Fenológica button wiring (Capítulo VI) ──────────────────────
  // The bancada row + jump-season row are not range sliders, so they need
  // their own click handlers. Both send OSC to SC, which echoes back so
  // every other surface (MIDI knob, SC GUI, HTML slider) stays in sync.

  // Bancada radio group: 5 buttons → CC 16 / OSC /pheno/bancada (0..4 → 0..1)
  document.querySelectorAll<HTMLButtonElement>(".pheno-bancada-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.bancada ?? "0", 10);
      const val = idx / 4; // 0..1 normalized

      // Toggle visual active state
      document.querySelectorAll<HTMLButtonElement>(".pheno-bancada-btn").forEach((b) => {
        b.classList.toggle("active", b === btn);
      });

      // Sync the (now-hidden but functional) range slider
      const slider = document.querySelector<HTMLInputElement>(
        `input[type='range'][data-osc='/pheno/bancada']`
      );
      if (slider) slider.value = String(val);
      const disp = document.getElementById("disp-pheno-bancada");
      if (disp) disp.textContent = val.toFixed(2);

      // 1. Send to SC (which echoes back via /pheno/bancada → applyPhenoControl)
      sendOSC("/pheno/bancada", val);
    });
  });

  // Season-jump buttons: 4 buttons → /pheno/jumpSeason (string arg)
  document.querySelectorAll<HTMLButtonElement>(".pheno-btn[data-season]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const season = btn.dataset.season ?? "seca";

      // Brief visual pulse on the button
      btn.classList.add("active");
      setTimeout(() => btn.classList.remove("active"), 180);

      // Send to SC with string arg (handled by OSCdef(\phenoJumpSeason))
      if (controlWS && controlWsReady) {
        controlWS.send(JSON.stringify({
          direction: "toSC",
          address: "/pheno/jumpSeason",
          args: [season],
        }));
      }

      // Also call the local breath bridge directly (in case SC echo is slow)
      jumpToPhenoSeason(season);
    });
  });

  // ─── State subscription ───
  const statusDot = document.getElementById("status-dot");
  const statusTxt = document.getElementById("status-txt");
  const hdrConsensus = document.getElementById("hdr-consensus");
  const hdrPhase = document.getElementById("hdr-phase");
  const hdrVotes = document.getElementById("hdr-votes");
  const hdrBiotoken = document.getElementById("hdr-biotoken");
  const hdrIucnMult = document.getElementById("hdr-iucn-mult");
  const footerClock = document.getElementById("footer-clock");
  const footerEvent = document.getElementById("footer-event");
  const voteResultFill = document.getElementById("vote-result-fill") as HTMLElement;
  const voteResultTxt = document.getElementById("vote-result-txt");

  let lastUpdate = 0;
  let eventFlash = 0;
  let elapsed = 0;
  let currentState: ParliamentState | null = null;

  // ── Live audio source for the spectrogram ───────────────────────────────
  // buildFftBins synthesises its bins from parliament state — it has never
  // touched real audio, so the display could not disagree with the engine even
  // when the engine was silent. Routing the machine's microphone through an
  // AnalyserNode makes it a genuine monitor: what you see is what is actually
  // leaving the speakers, which is exactly what a performance needs.
  //
  // Opt-in by click: getUserMedia and AudioContext both require a user gesture,
  // and a performance machine should not open its mic unasked. Any failure
  // (denied, no device, insecure origin) falls back to the synthetic bins, so
  // the panel never goes blank.
  let micAnalyser: AnalyserNode | null = null;
  // Explicit ArrayBuffer backing: getByteFrequencyData's lib.dom signature
  // requires Uint8Array<ArrayBuffer>, not the ArrayBufferLike default.
  let micBuf: Uint8Array<ArrayBuffer> | null = null;
  {
    const btn = document.getElementById("spectro-src-btn");
    btn?.addEventListener("click", async () => {
      if (micAnalyser) {   // already live — revert to the synthetic source
        micAnalyser = null;
        micBuf = null;
        btn.textContent = "SPECTRUM ▸ MIC";
        btn.className = "";
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AC();
        if (ctx.state === "suspended") await ctx.resume();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.72;
        ctx.createMediaStreamSource(stream).connect(analyser);
        micAnalyser = analyser;
        micBuf = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
        btn.textContent = "SPECTRUM ◉ LIVE";
        btn.className = "live";
      } catch (e) {
        console.warn("[spectrogram] mic unavailable, staying on synthetic bins:", e);
        btn.textContent = "SPECTRUM ▸ MIC ✕";
        btn.className = "denied";
      }
    });
  }

  // Resample the analyser's linear bins onto the renderer's bin count, on a
  // LOG frequency axis so the display matches the 20Hz–8kHz labels underneath.
  function micBins(count: number): Float32Array | null {
    if (!micAnalyser || !micBuf) return null;
    micAnalyser.getByteFrequencyData(micBuf);
    const out = new Float32Array(count);
    const nyquist = 22050;
    const binHz = nyquist / micBuf.length;
    for (let i = 0; i < count; i++) {
      const f = 20 * Math.pow(8000 / 20, i / (count - 1));
      const idx = Math.min(micBuf.length - 1, Math.max(0, Math.round(f / binHz)));
      out[i] = micBuf[idx] / 255;
    }
    return out;
  }

  // ── /spectrum from SuperCollider: the master bus itself ─────────────────
  // The preferred source. A microphone only reflects the engine if the room
  // can hear the speakers — on headphones or an audio interface it hears
  // nothing, which is why the panel looked dead to itself. SC analyses its own
  // output bus after the limiter and sends 16 log-spaced band amplitudes, so
  // this is the sound that is actually leaving the machine.
  let scSpectrum: number[] | null = null;
  let scSpectrumAt = 0;
  (window as unknown as { __onScSpectrum?: (v: number[]) => void }).__onScSpectrum = (v) => {
    scSpectrum = v;
    scSpectrumAt = performance.now();
  };

  // Interpolate 16 bands up to the renderer's bin count, in log-frequency
  // space to match the axis labels. Goes stale after 1 s so a stopped engine
  // falls back rather than freezing the last frame on screen.
  function scBins(count: number): Float32Array | null {
    if (!scSpectrum || performance.now() - scSpectrumAt > 1000) return null;
    const src = scSpectrum;
    const out = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const pos = (i / (count - 1)) * (src.length - 1);
      const lo = Math.floor(pos), hi = Math.min(src.length - 1, lo + 1);
      const v = src[lo] + (src[hi] - src[lo]) * (pos - lo);
      // Amplitude.kr is linear; compress so quiet detail stays visible
      out[i] = Math.min(1, Math.pow(v * 3.2, 0.6));
    }
    return out;
  }

  // Animate loop: push spectrogram + update stage FFT exposure
  (function animLoop() {
    elapsed += 0.016;
    // Source priority: real engine output > microphone > synthetic fallback.
    // Same bin count as buildFftBins' default, so the renderer sees one shape.
    const bins = scBins(256) ?? micBins(256) ?? buildFftBins(currentState, elapsed);
    if (spectroRenderer) spectroRenderer.push(bins, performance.now());
    // Expose bins to active Three.js stage for FFT ring animation
    const s = getActiveThreeStage();
    if (s && s._fftBinsExternal !== undefined) s._fftBinsExternal = bins;
    requestAnimationFrame(animLoop);
  })();

  parliamentStore.subscribe((state) => {
    if (!state || !Array.isArray(state.species)) return;
    currentState = state;

    // Keep __ednaBio current for values that arrive over OSC (/agent/edna/state)
    // rather than from a slider — the macro only fires on local slider moves.
    publishEdna();

    // Connection
    if (statusDot) statusDot.className = state.connected ? "on" : "";
    if (statusTxt) statusTxt.textContent = state.connected ? "ONLINE" : "OFFLINE";

    // Header
    if (hdrConsensus) hdrConsensus.textContent = state.consensus.toFixed(3);
    if (hdrPhase) hdrPhase.textContent = (state.phase * 360).toFixed(1) + "°";
    if (hdrVotes) hdrVotes.textContent = String(state.votes);

    // BioToken live
    const bt = calcBioToken(state);
    if (hdrBiotoken) hdrBiotoken.textContent = bt.toFixed(3);
    const iucnMult = Math.max(...IUCN_MULT);
    if (hdrIucnMult) hdrIucnMult.textContent = `×${iucnMult}`;

    // Footer clock
    if (footerClock) {
      const rem = ((1 - state.phase) * 120).toFixed(1);
      footerClock.textContent = `${rem}s / ${(state.phase * 360).toFixed(1)}°`;
    }

    // Throttle panel to ~10fps
    const now = performance.now();
    if (now - lastUpdate < 100) return;
    lastUpdate = now;

    const setBar = (id: string, v: number) => {
      const el = document.getElementById(id);
      if (el) el.style.width = (v * 100).toFixed(1) + "%";
    };
    const setVal = (id: string, t: string) => {
      const el = document.getElementById(id);
      if (el) el.textContent = t;
    };

    // Parliament state bars
    setBar("bar-consensus", state.consensus); setVal("val-consensus", state.consensus.toFixed(3));
    setBar("bar-wave", state.consensusWave); setVal("val-wave", state.consensusWave.toFixed(3));
    setBar("bar-rotation", Math.min(state.rotation / 2, 1)); setVal("val-rotation", state.rotation.toFixed(3));
    setBar("bar-votes", state.votes / 26); setVal("val-votes", String(state.votes));

    // BioToken breakdown
    const avgEdna = state.edna.reduce((s, e) => s + e.biodiversity, 0) / 8;
    const avgFungi = state.fungi.reduce((s, f) => s + f.chemical, 0) / 4;
    const btVal = calcBioToken(state);
    setVal("biotoken-value", btVal.toFixed(4));
    setVal("bt-iucn", String(iucnMult));
    setVal("bt-edna", avgEdna.toFixed(2));
    setVal("bt-fungi", avgFungi.toFixed(2));

    // Species
    state.species.forEach((sp, i) => {
      setBar(`sp-bar-pres-${i}`, sp.presence);
      setVal(`sp-val-${i}`, sp.presence.toFixed(2));
      setVal(`sp-act-${i}`, sp.activity.toFixed(2));
      setVal(`sp-frq-${i}`, sp.freq.toFixed(0) + "Hz");
      setVal(`sp-vot-${i}`, String(sp.votes));
    });

    // eDNA
    state.edna.forEach((ed, i) => {
      setBar(`ed-bar-${i}`, ed.biodiversity);
      setVal(`ed-bio-${i}`, ed.biodiversity.toFixed(3));
      setVal(`ed-val-${i}`, ed.validation.toFixed(3));
      // Highlight biome map row
      const bm = document.getElementById(`bm-${EDNA_IDS[i]}`);
      if (bm) bm.className = ed.biodiversity > 0.7 ? "biome-active" : "";
    });

    // Fungi
    state.fungi.forEach((fg, i) => {
      setBar(`fg-bar-${i}`, fg.chemical);
      setVal(`fg-chem-${i}`, fg.chemical.toFixed(2));
      setVal(`fg-conn-${i}`, fg.connectivity.toFixed(2));
    });

    // AI
    setBar("bar-ai-c", state.ai.consciousness);
    setVal("val-ai-c", state.ai.consciousness.toFixed(3));
    setBar("bar-ai-o", state.ai.optimization / 127);
    setVal("val-ai-o", String(Math.round(state.ai.optimization)));

    // Eco
    setBar("bar-co2", state.eco.co2 / 127); setVal("val-co2", state.eco.co2.toFixed(0));
    setBar("bar-myco", state.eco.mycoPulse / 5); setVal("val-myco", state.eco.mycoPulse.toFixed(2));
    setBar("bar-phos", state.eco.phosphorus / 127); setVal("val-phos", state.eco.phosphorus.toFixed(0));
    setBar("bar-nitr", state.eco.nitrogen / 127); setVal("val-nitr", state.eco.nitrogen.toFixed(0));

    // Vote result flash
    if (state.events.voteResult && footerEvent) {
      const vr = state.events.voteResult;
      const pct = (vr.consensus * 100).toFixed(1);
      footerEvent.textContent = vr.passed
        ? `VOTE PASSED — ${pct}% (${vr.yes}/${vr.total})`
        : `VOTE FAILED — ${pct}% (${vr.yes}/${vr.total})`;
      footerEvent.style.color = vr.passed ? "var(--amber-bright)" : "var(--red-alert)";
      if (voteResultFill) {
        voteResultFill.style.width = pct + "%";
        voteResultFill.style.background = vr.passed ? "var(--amber-bright)" : "rgba(255,60,0,0.7)";
      }
      if (voteResultTxt) voteResultTxt.textContent = vr.passed ? "PASSED" : "FAILED";
      eventFlash = Date.now();
    }
    if (footerEvent && Date.now() - eventFlash > 8000) {
      footerEvent.textContent = "—";
      footerEvent.style.color = "var(--text-dim)";
    }
  });

  connectControlWS();

  // Fetch live Colombian species from IUCN Red List API
  fetchSpeciesRoster(30).then(({ roster, source }) => {
    if (source === "fallback" || roster.length === 0) {
      console.log("[parliament] Using fallback species roster");
      return;
    }
    console.log(`[parliament] Live species loaded from ${source}: ${roster.length} species`);

    // Update the global visualization roster
    updateSpeciesRoster(roster);

    // Update the dashboard species (first 5)
    const dash5 = roster.slice(0, 5);
    SPECIES_NAMES = dash5.map(([, name]) => name);
    SPECIES_IUCN = dash5.map(([, , cat]) => cat);
    IUCN_MULT = computeIUCNMults(dash5);

    // Re-render dashboard telemetry labels if DOM is ready
    const speciesTeleEl = document.getElementById("species-tele");
    if (speciesTeleEl) {
      speciesTeleEl.innerHTML = SPECIES_NAMES.map((name, i) => `
        <div style="margin-bottom:5px">
          <div class="tele-row">
            <span class="lbl" style="min-width:58px;font-size:9px">${name}</span>
            <span class="uicn-badge uicn-${SPECIES_IUCN[i]}">${SPECIES_IUCN[i]}</span>
            <div class="tele-bar-wrap"><div class="tele-bar" id="sp-bar-pres-${i}" style="width:50%"></div></div>
            <span class="val" id="sp-val-${i}">—</span>
          </div>
          <div style="display:flex;gap:6px;margin-bottom:1px;padding-left:2px">
            <span class="label">ACT</span><span class="value-sm" id="sp-act-${i}">—</span>
            <span class="label">FREQ</span><span class="value-sm" id="sp-frq-${i}">—</span>
            <span class="label">VOT</span><span class="value-sm" id="sp-vot-${i}">—</span>
          </div>
        </div>
      `).join("");
    }

    // Re-render left-panel species sliders with live names
    renderSpeciesSliders();
    // Re-wire the newly injected sliders
    ["species-activity-ctrl", "species-presence-ctrl"].forEach(cid => {
      const el = document.getElementById(cid);
      if (el) el.querySelectorAll<HTMLInputElement>("input[type='range'][data-osc]").forEach(wireSlider);
    });

    // Update canvas overlay labels
    for (let i = 0; i < 5; i++) {
      const el = document.getElementById(`sp-label-${i}`);
      if (el) el.textContent = SPECIES_NAMES[i].toUpperCase();
    }
  }).catch(e => {
    console.warn("[parliament] Species fetch failed, using fallback:", e);
  });

  // Fullscreen on double-click
  document.getElementById("canvas-wrap")?.addEventListener("dblclick", () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => { });
    } else {
      document.exitFullscreen().catch(() => { });
    }
  });
}

init();
