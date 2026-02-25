// Parliament of All Things — Entry Point
// OSC control panel wired to parliament-synthesizer SC endpoints
// Spectrogram canvas + reactive FFT from live state data

import parliamentStore, { ParliamentState } from "./parliament/parliamentStore";
import * as THREE from "three";

// ─── Data constants ───
const SPECIES_NAMES  = ["Ara macao", "Atlapetes", "Cecropia", "Alouatta", "Tinamus"];
const SPECIES_IUCN   = ["CR", "VU", "LC", "VU", "LC"];
// IUCN multipliers for BioToken formula (CR=5, EN=3, VU=2, LC=1)
const IUCN_MULT      = [5, 2, 1, 2, 1];
const EDNA_IDS       = ["CHO", "AMZ", "COR", "CAR", "ORI", "PAC", "MAG", "GUA"];
const EDNA_ANGLES_DEG = Array.from({ length: 8 }, (_, i) => (i / 8) * 360);

// ─── OSC bridge WebSocket ───
let controlWS: WebSocket | null = null;
let controlWsReady = false;

function connectControlWS() {
  controlWS = new WebSocket("ws://localhost:3334");
  controlWS.onopen  = () => { controlWsReady = true; };
  controlWS.onclose = () => {
    controlWsReady = false;
    controlWS = null;
    setTimeout(connectControlWS, 2000);
  };
  controlWS.onerror = () => { controlWS?.close(); };
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
(window as any).sendParliamentAction = (address: string, args: number[]) => {
  if (controlWS && controlWsReady) {
    controlWS.send(JSON.stringify({ direction: "toSC", address, args }));
    console.log(`[ctrl] → SC ${address}`, args);
  }
};

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

// ─── Spectrogram canvas renderer ───
class SpectrogramRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  private lastPush = 0;

  constructor(canvasEl: HTMLCanvasElement) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext("2d")!;
    this.resize();
    this.ctx.fillStyle = "#000402";
    this.ctx.fillRect(0, 0, this.width, this.height);
    window.addEventListener("resize", () => this.resize());
  }

  resize() {
    this.width  = this.canvas.offsetWidth  || 800;
    this.height = this.canvas.offsetHeight || 72;
    this.canvas.width  = this.width;
    this.canvas.height = this.height;
  }

  // Push a column of FFT bins (0-1 each, length = arbitrary)
  // Called at ~20fps from main loop
  push(bins: Float32Array, now: number) {
    if (now - this.lastPush < 45) return; // ~22fps
    this.lastPush = now;

    const w = this.width;
    const h = this.height;
    const ctx = this.ctx;

    // Scroll left by 1px
    const imageData = ctx.getImageData(1, 0, w - 1, h);
    ctx.putImageData(imageData, 0, 0);

    // Write new right-edge column
    const rightX = w - 1;
    const numBins = bins.length;
    for (let y = 0; y < h; y++) {
      // Map canvas y (0=top) to bin index (0=low freq at bottom)
      const binIdx = Math.floor(((h - 1 - y) / h) * numBins);
      const v = Math.min(1, Math.max(0, bins[binIdx] || 0));
      // Amber colormap: black → dark amber → amber → bright
      const r = Math.floor(v * 255);
      const g = Math.floor(v * 0.53 * 255);
      ctx.fillStyle = `rgb(${r},${g},0)`;
      ctx.fillRect(rightX, y, 1, 1);
    }
  }
}

// ─── Pseudo-FFT from state (maps to physical frequency space) ───
function buildFftBins(state: ParliamentState | null, elapsed: number, numBins = 128): Float32Array {
  const bins = new Float32Array(numBins);

  if (!state) {
    for (let i = 0; i < numBins; i++) {
      bins[i] = Math.max(0, Math.sin(elapsed * 1.8 + i * 0.35) * 0.25 + Math.random() * 0.04);
    }
    return bins;
  }

  // Each species contributes a gaussian peak at its audio frequency
  for (const sp of state.species) {
    const freq   = sp.freq || 440;
    // Log-scale mapping: 20Hz..8000Hz → 0..numBins
    const logMin = Math.log2(20);
    const logMax = Math.log2(8000);
    const logF   = Math.log2(Math.max(20, Math.min(8000, freq)));
    const binIdx = Math.floor(((logF - logMin) / (logMax - logMin)) * (numBins - 1));
    const amp    = sp.presence * 0.8 + sp.activity * 0.6;
    const width  = 6 + sp.presence * 8; // broader peak = more present
    for (let i = 0; i < numBins; i++) {
      const dist = Math.abs(i - binIdx);
      bins[i] += amp * Math.exp(-(dist * dist) / (2 * width * width));
    }
  }

  // eDNA: adds harmonic overtone bands
  for (let s = 0; s < state.edna.length; s++) {
    const ed     = state.edna[s];
    const baseHz = 55 + s * 7;
    for (let h = 1; h <= 8; h++) {
      const hz = baseHz * h * ed.biodiversity;
      const logMin = Math.log2(20), logMax = Math.log2(8000);
      const logF = Math.log2(Math.max(20, Math.min(8000, hz)));
      const b = Math.floor(((logF - logMin) / (logMax - logMin)) * (numBins - 1));
      const amp = ed.validation * (1 / Math.sqrt(h)) * 0.12;
      if (b >= 0 && b < numBins) bins[b] += amp;
    }
  }

  // Fungi: sub-bass rumble (low bins 0-10)
  const avgFungi = state.fungi.reduce((s, f) => s + f.chemical, 0) / state.fungi.length;
  for (let i = 0; i < 10; i++) bins[i] += avgFungi * 0.4 * (1 - i / 10);

  // Eco: CO2 broadband noise floor
  const co2norm = state.eco.co2 / 127;
  for (let i = 0; i < numBins; i++) bins[i] += co2norm * 0.08 * Math.random();

  // Normalize
  let mx = 0;
  for (let i = 0; i < numBins; i++) if (bins[i] > mx) mx = bins[i];
  if (mx > 0.01) for (let i = 0; i < numBins; i++) bins[i] = Math.min(1, bins[i] / mx);

  return bins;
}

// ─── BioToken V3 calculation ───
function calcBioToken(state: ParliamentState): number {
  if (!state) return 0;
  const avgPresence  = state.species.reduce((s, sp) => s + sp.presence, 0) / 5;
  const avgActivity  = state.species.reduce((s, sp) => s + sp.activity, 0) / 5;
  const avgEdnaBio   = state.edna.reduce((s, e) => s + e.biodiversity, 0) / 8;
  const avgFungiChem = state.fungi.reduce((s, f) => s + f.chemical, 0) / 4;
  const aiOpt        = state.ai.optimization / 127;
  // IUCN weight: highest urgency species dominates
  const maxIucnMult  = Math.max(...IUCN_MULT) / 5; // normalize to 0-1
  return avgPresence * avgActivity * avgEdnaBio * avgFungiChem * aiOpt * maxIucnMult;
}

async function init() {
  const container = document.getElementById("parliament-stage");
  if (!container) return;

  const { default: ParliamentStage } = await import(
    "../main/starter_modules/ParliamentStage"
  );

  const stage = new ParliamentStage(container) as any;
  container.style.visibility = "visible";

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
  const fungiNames = ["N.Myco","C.Spore","S.Web","Coastal"];
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
  const overlay    = document.getElementById("canvas-overlay");
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
      const el  = document.createElement("div");
      el.className  = "edna-label";
      el.style.left = pos.x + "px";
      el.style.top  = pos.y + "px";
      el.textContent = EDNA_IDS[i];
      overlay.appendChild(el);
    });
  }

  // Label tracking loop
  function updateLabels() {
    if (!canvasWrap || !stage.speciesGroups || !stage.camera) return;
    for (let i = 0; i < 5; i++) {
      const grp = stage.speciesGroups[i];
      if (!grp) continue;
      const pos = worldToCss(grp.position, stage.camera, canvasWrap);
      const el  = speciesLabelEls[i];
      el.style.left = pos.x + "px";
      el.style.top  = (pos.y - 20) + "px";
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
  // Sliders come in 3 flavors:
  //  1. Single value: data-osc="/parliament/volume"   → sendOSC(addr, value)
  //  2. Agent+value:  data-osc="/agents/..."  data-agent-id="N" → sendOSCArgs(addr, [N, value])
  //  3. FX param:     data-osc="/parliament/fx/..." → sendOSC(addr, value) (bridge logs for now)

  document.querySelectorAll<HTMLInputElement>("input[type='range'][data-osc]").forEach((slider) => {
    const addr    = slider.dataset.osc!;
    const agentId = slider.dataset.agentId;

    // Derive display element id from addr + agentId
    let dispId: string;
    if (agentId !== undefined) {
      // e.g. /agents/species/activity → sp-act, /agents/edna/biodiversity → edna-bio
      const key = addr.replace("/agents/","").replace(/\//g,"-");
      dispId = `disp-${key}-${agentId}`;
    } else {
      // e.g. /parliament/volume → volume, /parliament/fx/reverb → reverb
      const key = addr.split("/").pop()!;
      dispId = `disp-${key}`;
    }
    const dispEl = document.getElementById(dispId);

    slider.addEventListener("input", () => {
      const v = parseFloat(slider.value);
      if (dispEl) dispEl.textContent = v.toFixed(2);

      if (agentId !== undefined) {
        sendOSCArgs(addr, [parseInt(agentId), v]);
      } else {
        sendOSC(addr, v);
      }
    });
  });

  // ─── State subscription ───
  const statusDot    = document.getElementById("status-dot");
  const statusTxt    = document.getElementById("status-txt");
  const hdrConsensus = document.getElementById("hdr-consensus");
  const hdrPhase     = document.getElementById("hdr-phase");
  const hdrVotes     = document.getElementById("hdr-votes");
  const hdrBiotoken  = document.getElementById("hdr-biotoken");
  const hdrIucnMult  = document.getElementById("hdr-iucn-mult");
  const footerClock  = document.getElementById("footer-clock");
  const footerEvent  = document.getElementById("footer-event");
  const voteResultFill = document.getElementById("vote-result-fill") as HTMLElement;
  const voteResultTxt  = document.getElementById("vote-result-txt");

  let lastUpdate = 0;
  let eventFlash = 0;
  let elapsed    = 0;
  let currentState: ParliamentState | null = null;

  // Animate loop: push spectrogram + update stage FFT exposure
  (function animLoop() {
    elapsed += 0.016;
    const bins = buildFftBins(currentState, elapsed);
    if (spectroRenderer) spectroRenderer.push(bins, performance.now());
    // Expose bins to stage for FFT ring animation
    if (stage._fftBinsExternal !== undefined) stage._fftBinsExternal = bins;
    requestAnimationFrame(animLoop);
  })();

  parliamentStore.subscribe((state) => {
    currentState = state;

    // Connection
    if (statusDot) statusDot.className = state.connected ? "on" : "";
    if (statusTxt)  statusTxt.textContent  = state.connected ? "ONLINE" : "OFFLINE";

    // Header
    if (hdrConsensus) hdrConsensus.textContent = state.consensus.toFixed(3);
    if (hdrPhase)     hdrPhase.textContent     = (state.phase * 360).toFixed(1) + "°";
    if (hdrVotes)     hdrVotes.textContent     = String(state.votes);

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
    setBar("bar-consensus", state.consensus);    setVal("val-consensus", state.consensus.toFixed(3));
    setBar("bar-wave", state.consensusWave);      setVal("val-wave", state.consensusWave.toFixed(3));
    setBar("bar-rotation", Math.min(state.rotation / 2, 1)); setVal("val-rotation", state.rotation.toFixed(3));
    setBar("bar-votes", state.votes / 26);        setVal("val-votes", String(state.votes));

    // BioToken breakdown
    const avgEdna  = state.edna.reduce((s, e) => s + e.biodiversity, 0) / 8;
    const avgFungi = state.fungi.reduce((s, f) => s + f.chemical, 0) / 4;
    const btVal = calcBioToken(state);
    setVal("biotoken-value", btVal.toFixed(4));
    setVal("bt-iucn",  String(iucnMult));
    setVal("bt-edna",  avgEdna.toFixed(2));
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
    setBar("bar-co2",  state.eco.co2 / 127);        setVal("val-co2",  state.eco.co2.toFixed(0));
    setBar("bar-myco", state.eco.mycoPulse / 5);     setVal("val-myco", state.eco.mycoPulse.toFixed(2));
    setBar("bar-phos", state.eco.phosphorus / 127);  setVal("val-phos", state.eco.phosphorus.toFixed(0));
    setBar("bar-nitr", state.eco.nitrogen / 127);    setVal("val-nitr", state.eco.nitrogen.toFixed(0));

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

  // Fullscreen on double-click
  document.getElementById("canvas-wrap")?.addEventListener("dblclick", () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });
}

init();
