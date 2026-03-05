// Parliament of All Things — Entry Point
// OSC control panel wired to parliament-synthesizer SC endpoints
// Spectrogram canvas + reactive FFT from live state data
// Visualization switcher: keys 0–9 swap center stage

import parliamentStore, { ParliamentState } from "./parliament/parliamentStore";
import { initSwitcher, getActiveThreeStage, updateSpeciesRoster } from "./visualizationSwitcher";
import { fetchSpeciesRoster, computeIUCNMults } from "./speciesFetcher";
import * as THREE from "three";

// ─── Data constants (mutable — updated from IUCN API at boot) ───
let SPECIES_NAMES = ["Tremarctos ornatus", "Panthera onca", "Ceroxylon quindiuense", "Atelopus nahumae", "Saguinus oedipus"];
let SPECIES_IUCN = ["VU", "NT", "EN", "CR", "CR"];
// IUCN multipliers for BioToken formula (CR=5, EN=3, VU=2, LC=1)
let IUCN_MULT = [2, 1, 3, 5, 5];
const EDNA_IDS = ["CHO", "AMZ", "COR", "CAR", "ORI", "PAC", "MAG", "GUA"];
const EDNA_ANGLES_DEG = Array.from({ length: 8 }, (_, i) => (i / 8) * 360);

// ─── Live species fetch (IUCN Red List API for Colombia) ───
function initLiveSpecies() {
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

    // Update canvas overlay labels
    for (let i = 0; i < 5; i++) {
      const el = document.getElementById(`sp-label-${i}`);
      if (el) el.textContent = SPECIES_NAMES[i].toUpperCase();
    }
  }).catch(e => {
    console.warn("[parliament] Species fetch failed, using fallback:", e);
  });
}

// ─── OSC bridge WebSocket ───
let controlWS: WebSocket | null = null;
let controlWsReady = false;

function connectControlWS() {
  controlWS = new WebSocket("ws://localhost:3334");
  controlWS.onopen = () => { controlWsReady = true; };
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
    } catch (_) { }
  };
}

// Single-value OSC
function sendOSC(address: string, value: number) {
  if (controlWS && controlWsReady) {
    controlWS.send(JSON.stringify({ direction: "toSC", address, args: [value] }));
  }
}

// Multi-arg OSC (agent id + value)
function sendOSCArgs(address: string, args: number[]) {
  if (controlWS && controlWsReady) {
    controlWS.send(JSON.stringify({ direction: "toSC", address, args }));
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
    // Vote: trigger a synthetic vote result event for visual flash
    const passed = st.consensus > 0.5;
    st.events.voteResult = {
      consensus: st.consensus,
      passed,
      yes: Math.round(st.votes * st.consensus),
      total: st.votes,
    };
    parliamentStore.notifyListeners();
    // Visual burst: bloom flash + color surge across all slots
    triggerVoteVisualBurst(passed ? "passed" : "failed", st.consensus);
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
  (window as any).__voteEvent = { type, intensity, time: performance.now() };
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
    txinfluence: 0.5,
    beatTempo: 0.5,
    txInfluence: 0.5,
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
      applySonethToViz(key, v);
      // Notify slot 2 ZKP interval scheduler about txinfluence/harmonicrich changes
      if (key === "txinfluence" || key === "harmonicrich") {
        window.dispatchEvent(new Event("soneth-param-change"));
      }
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
            const base = (window as any).__slot2Soneth?.txinfluence ?? 0.5;
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
      "dronefade", "dronespace", "dronemix", "delayfeedback", "txinfluence",
      "beatTempo", "txInfluence",
    ];
    const ALL_PARAMS = [...CORE_PARAMS, ...EXTRA_PARAMS];
    const SLOTS = ["S0:Parliament", "S1:Asteroid", "S2:LowEarth", "S3:Perlin"];

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
        color:#88aa88; max-height:90vh; overflow-y:auto; pointer-events:auto;
        min-width:480px;
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
        row.innerHTML = `
          <td style="padding:2px 6px;">${p}</td>
          <td id="dv-${p}" style="text-align:center;color:#666;padding:2px 4px;">—</td>
          <td id="ds0-${p}" style="text-align:center;padding:2px 4px;">●</td>
          <td id="ds1-${p}" style="text-align:center;padding:2px 4px;">●</td>
          <td id="ds2-${p}" style="text-align:center;padding:2px 4px;">●</td>
          <td id="ds3-${p}" style="text-align:center;padding:2px 4px;">●</td>
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

    // Also track in patchStoreFromSlider path (re-wrap not needed — it calls applySonethToViz internally)

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
      const s1 = (window as any).__slot1Soneth || {};
      const s2 = (window as any).__slot2Soneth || {};
      const s3 = (window as any).__slot3Soneth || {};

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
        const slotVals = [sp[p], s1[p], s2[p], s3[p]];
        [0, 1, 2, 3].forEach(si => {
          const dot = document.getElementById(`ds${si}-${p}`);
          if (dot) {
            const has = typeof slotVals[si] === "number";
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
    "/agents/fungi/chemical": "disp-fg-chem-",
    "/agents/ai/consciousness": "disp-ai-consciousness",
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
    });
  }

  // Wire all currently-present range sliders (includes static HTML ones)
  document.querySelectorAll<HTMLInputElement>("input[type='range'][data-osc]").forEach(wireSlider);

  // Wire eDNA sliders that were dynamically injected above (they're in the DOM now)
  if (ednaCtrlRows) {
    ednaCtrlRows.querySelectorAll<HTMLInputElement>("input[type='range'][data-osc]").forEach(wireSlider);
  }

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

  // Animate loop: push spectrogram + update stage FFT exposure
  (function animLoop() {
    elapsed += 0.016;
    const bins = buildFftBins(currentState, elapsed);
    if (spectroRenderer) spectroRenderer.push(bins, performance.now());
    // Expose bins to active Three.js stage for FFT ring animation
    const s = getActiveThreeStage();
    if (s && s._fftBinsExternal !== undefined) s._fftBinsExternal = bins;
    requestAnimationFrame(animLoop);
  })();

  parliamentStore.subscribe((state) => {
    if (!state || !Array.isArray(state.species)) return;
    currentState = state;

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
  initLiveSpecies();

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
