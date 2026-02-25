// visualizationSwitcher.ts
// Keyboard-driven center-stage visualization switcher.
// Keys 0–9 swap what renders inside #parliament-stage.
//   0 → ParliamentStage (Three.js ecological parliament)
//   1 → AsteroidWaves   (p5.js amber perlin wave graph)
//   2–9 → reserved (no-op with "coming soon" indicator)
//
// Left/right panels, spectrogram, and telemetry are NOT touched.
// The switcher just tears down the old viz and mounts the new one
// in the same #parliament-stage container.

import p5 from "p5";
import parliamentStore from "./parliament/parliamentStore";

// ─── Shared state feed from parliament ──────────────────────────────────────
// The switcher gives each viz a live state ref so they can react to OSC data
export interface VizContext {
  container: HTMLElement;
  getState: () => import("./parliament/parliamentStore").ParliamentState | null;
}

// ─── Viz interface ──────────────────────────────────────────────────────────
interface Viz {
  name: string;
  key: string;        // "0" – "9"
  destroy: () => void;
  // Optional: called each time parliament state updates
  onState?: (state: import("./parliament/parliamentStore").ParliamentState) => void;
}

// ─── Global state ────────────────────────────────────────────────────────────
let currentViz: Viz | null = null;
let currentKey  = "0";
let stageEl: HTMLElement | null = null;
let getLatestState: () => any = () => null;

// ─── HUD element ────────────────────────────────────────────────────────────
let hudEl: HTMLElement | null = null;

function updateHUD(name: string, key: string) {
  if (!hudEl) return;
  hudEl.textContent = `[${key}] ${name}`;
  hudEl.classList.add("flash");
  setTimeout(() => hudEl?.classList.remove("flash"), 600);
}

// ─── Stage clear helper ───────────────────────────────────────────────────────
function clearStage() {
  _activeThreeStage = null;
  if (currentViz) {
    try { currentViz.destroy(); } catch (e) { console.warn("[switcher] destroy error:", e); }
    currentViz = null;
  }
  // Remove any canvas/elements the viz may have left in the DOM
  if (stageEl) {
    while (stageEl.firstChild) stageEl.removeChild(stageEl.firstChild);
    stageEl.style.visibility = "hidden";
  }
}

// ─── Mount helpers ────────────────────────────────────────────────────────────
async function mountParliamentStage(): Promise<Viz> {
  const { default: ParliamentStage } = await import(
    "../main/starter_modules/ParliamentStage"
  );
  const stage = new ParliamentStage(stageEl!) as any;
  stageEl!.style.visibility = "visible";
  _activeThreeStage = stage;  // expose for label tracking + FFT bin feed

  return {
    name: "Parliament of All Things",
    key: "0",
    destroy: () => {
      _activeThreeStage = null;
      try { stage.destroy(); } catch {}
    },
    onState: (_s) => {
      // ParliamentStage subscribes to parliamentStore internally
    },
  };
}

function mountAsteroidWaves(): Viz {
  const container = stageEl!;
  container.style.visibility = "visible";

  // ── Amber palette matching parliament UI ─────────────────────────────────
  const AMBER         = [255, 136,   0] as const;
  const AMBER_BRIGHT  = [255, 204,  68] as const;
  const AMBER_DIM     = [102,  51,   0] as const;
  const AMBER_MID     = [180,  90,   0] as const;
  const BG            = [0,    8,    4] as const;

  let destroyed = false;
  let myp5: p5 | null = null;

  // Live state snapshot — updated by switcher's onState callback
  let liveState: any = getLatestState();

  const sketch = (p: p5) => {
    let noiseOffsetX = 0.0;
    let noiseOffsetY = 0.0;
    let meteors: Array<{ mass: number; label: string; color: readonly [number,number,number] }> = [];

    // Build meteor list from parliament species + eco state
    function buildMeteorsFromState(st: any) {
      if (!st) {
        // Fallback: 5 synthetic meteors
        meteors = Array.from({ length: 5 }, (_, i) => ({
          mass: 50 + i * 60,
          label: `SYN-${i}`,
          color: i % 2 === 0 ? AMBER : AMBER_MID,
        }));
        return;
      }
      // Map species to meteor waves
      const speciesColors = [AMBER_BRIGHT, AMBER, AMBER_MID, AMBER_DIM, AMBER] as const;
      meteors = st.species.map((sp: any, i: number) => ({
        mass: 20 + sp.presence * 200 + sp.activity * 150,
        label: [`Ara`, `Atl`, `Cec`, `Alo`, `Tin`][i],
        color: speciesColors[i % speciesColors.length],
      }));
    }

    p.setup = () => {
      const canvas = p.createCanvas(container.clientWidth, container.clientHeight);
      canvas.parent(container);
      p.textSize(9);
      p.textAlign(p.CENTER, p.CENTER);
      p.textFont("'SF Mono', 'Fira Code', 'Consolas', monospace");
      buildMeteorsFromState(liveState);
    };

    p.draw = () => {
      if (destroyed) return;

      // Background: near-black with slight amber tint
      p.background(BG[0], BG[1], BG[2], 245);

      const centerY    = p.height / 2;
      const maxDist    = (p.height / 2) * 0.88;
      const totalWaves = meteors.length;

      // ── Grid lines (horizontal, dim) ─────────────────────────────────────
      p.stroke(AMBER_DIM[0], AMBER_DIM[1], AMBER_DIM[2], 40);
      p.strokeWeight(0.5);
      const gridLines = 6;
      for (let g = 0; g <= gridLines; g++) {
        const gy = p.map(g, 0, gridLines, 0, p.height);
        p.line(0, gy, p.width, gy);
      }

      // ── Vertical scan lines (amber, very dim) ────────────────────────────
      for (let x = 0; x < p.width; x += 40) {
        p.stroke(AMBER_DIM[0], AMBER_DIM[1], AMBER_DIM[2], 15);
        p.line(x, 0, x, p.height);
      }

      // ── Center reference line ─────────────────────────────────────────────
      p.stroke(AMBER_DIM[0], AMBER_DIM[1], AMBER_DIM[2], 60);
      p.strokeWeight(1);
      p.line(0, centerY, p.width, centerY);

      // ── Meteor waves ──────────────────────────────────────────────────────
      meteors.forEach((meteor, index) => {
        const col = meteor.color;
        // Alpha: brighter waves for more active species
        const alpha = 120 + Math.floor((index / totalWaves) * 100);

        p.stroke(col[0], col[1], col[2], alpha);
        p.strokeWeight(1.2);
        p.noFill();
        p.beginShape();

        let highestDistortion = 0;
        let peakX = 0;
        let peakY = centerY;

        // Stagger Y so waves don't all overlap in the center
        const laneOffset = ((index - (totalWaves - 1) / 2) / totalWaves) * maxDist * 0.35;

        for (let x = 0; x < p.width; x += 3) {
          const distMag = Math.min(meteor.mass / 10, maxDist * 0.7);
          const noiseVal = p.noise(noiseOffsetX + x * 0.008, noiseOffsetY + index * 1.5);
          const distortion = (noiseVal - 0.5) * 2 * distMag;
          const y = centerY + laneOffset - distortion;
          p.vertex(x, y);

          if (Math.abs(distortion) > highestDistortion) {
            highestDistortion = Math.abs(distortion);
            peakX = x;
            peakY = y;
          }
        }
        p.endShape();

        // ── Peak glow dot ──────────────────────────────────────────────────
        p.noStroke();
        p.fill(col[0], col[1], col[2], 200);
        p.ellipse(peakX, peakY, 4, 4);

        // ── Label at peak (amber, monospace) ───────────────────────────────
        p.fill(col[0], col[1], col[2], 200);
        p.noStroke();
        p.textSize(8);
        p.text(meteor.label.toUpperCase(), peakX, peakY - 13);
      });

      // ── Corner label ─────────────────────────────────────────────────────
      p.fill(AMBER_DIM[0], AMBER_DIM[1], AMBER_DIM[2], 120);
      p.textSize(7);
      p.textAlign(p.LEFT, p.BOTTOM);
      p.text("ASTEROID WAVES · SPECIES ACTIVITY", 8, p.height - 5);
      p.textAlign(p.RIGHT, p.BOTTOM);
      const massTotal = meteors.reduce((s, m) => s + m.mass, 0);
      p.text(`Σmass ${massTotal.toFixed(0)}`, p.width - 8, p.height - 5);
      p.textAlign(p.CENTER, p.CENTER); // restore

      // ── Advance noise ────────────────────────────────────────────────────
      noiseOffsetX += 0.007;
      noiseOffsetY += 0.007;
    };

    // Rebuild meteor list when window signals a state update
    (container as any)._asteroidUpdateState = (st: any) => {
      liveState = st;
      buildMeteorsFromState(st);
    };
  };

  myp5 = new p5(sketch);

  return {
    name: "Asteroid Waves",
    key: "1",
    destroy: () => {
      destroyed = true;
      delete (container as any)._asteroidUpdateState;
      if (myp5) { myp5.remove(); myp5 = null; }
    },
    onState: (st) => {
      const fn = (container as any)._asteroidUpdateState;
      if (fn) fn(st);
    },
  };
}

// ─── VIZ REGISTRY ────────────────────────────────────────────────────────────
// Keys "2"–"9" return a simple placeholder so pressing them doesn't crash
function mountPlaceholder(key: string): Viz {
  const container = stageEl!;
  container.style.visibility = "visible";

  // Simple canvas with amber "coming soon" text
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "width:100%;height:100%;display:block;";
  container.appendChild(canvas);

  const ctx = canvas.getContext("2d")!;
  function draw() {
    canvas.width  = container.clientWidth  || 800;
    canvas.height = container.clientHeight || 600;
    ctx.fillStyle = "#000804";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = "11px 'SF Mono','Fira Code','Consolas',monospace";
    ctx.fillStyle = "rgba(102,51,0,0.6)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`[${key}] — VISUALIZATION SLOT RESERVED`, canvas.width / 2, canvas.height / 2);
    ctx.fillStyle = "rgba(102,51,0,0.3)";
    ctx.fillText("add module to visualizationSwitcher.ts", canvas.width / 2, canvas.height / 2 + 18);
  }
  draw();
  const ro = new ResizeObserver(draw);
  ro.observe(container);

  return {
    name: `Slot ${key} — Reserved`,
    key,
    destroy: () => {
      ro.disconnect();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    },
  };
}

// ─── MAIN SWITCH FUNCTION ─────────────────────────────────────────────────────
async function switchTo(key: string) {
  if (key === currentKey && currentViz) return; // already there
  clearStage();
  currentKey = key;

  let viz: Viz;
  try {
    if (key === "0") {
      viz = await mountParliamentStage();
    } else if (key === "1") {
      viz = mountAsteroidWaves();
      // Feed current state immediately
      const st = getLatestState();
      if (st && viz.onState) viz.onState(st);
    } else {
      viz = mountPlaceholder(key);
    }
  } catch (e) {
    console.error("[switcher] mount failed:", e);
    return;
  }

  currentViz = viz;
  updateHUD(viz.name, viz.key);
}

// ─── KEYBOARD HANDLER ─────────────────────────────────────────────────────────
function onKeyDown(e: KeyboardEvent) {
  // Only digits 0–9, not if typing in an input
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  if (!/^[0-9]$/.test(e.key)) return;
  e.preventDefault();
  switchTo(e.key);
}

// ─── ACTIVE THREE.JS STAGE ACCESSOR ─────────────────────────────────────────
// Returns the live ParliamentStage instance when slot 0 is active, else null.
// Used by parliamentEntry.ts to feed FFT bins and project 3D labels.
let _activeThreeStage: any = null;

export function getActiveThreeStage(): any {
  return _activeThreeStage;
}

// ─── PUBLIC INIT ─────────────────────────────────────────────────────────────
export function initSwitcher(
  stage: HTMLElement,
  hud: HTMLElement,
  stateGetter: () => any
) {
  stageEl        = stage;
  hudEl          = hud;
  getLatestState = stateGetter;

  window.addEventListener("keydown", onKeyDown);

  // Subscribe to parliament state so active viz gets live data
  parliamentStore.subscribe((state) => {
    if (currentViz?.onState) currentViz.onState(state);
  });

  // Start with slot 0
  switchTo("0");
}

export function destroySwitcher() {
  window.removeEventListener("keydown", onKeyDown);
  clearStage();
}
