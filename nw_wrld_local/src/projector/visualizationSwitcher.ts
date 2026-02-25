// visualizationSwitcher.ts
// Keyboard-driven center-stage visualization switcher.
// Keys 0–9 swap what renders inside #parliament-stage.
//   0 → ParliamentStage (Three.js ecological parliament)
//   1 → AsteroidWaves   (p5.js amber perlin wave graph)
//   2–9 → reserved slots

import p5 from "p5";
import parliamentStore from "./parliament/parliamentStore";
import type { ParliamentState } from "./parliament/parliamentStore";

// ─── Viz interface ───────────────────────────────────────────────────────────
interface Viz {
  name: string;
  key: string;
  destroy: () => void;
  onState?: (state: ParliamentState) => void;
}

// ─── Module-level refs ───────────────────────────────────────────────────────
let currentViz: Viz | null = null;
let currentKey = "";           // empty = nothing mounted yet
let stageEl: HTMLElement | null = null;
let hudEl: HTMLElement | null = null;
let getLatestState: () => ParliamentState | null = () => null;

// Exposed for parliamentEntry label tracking + FFT feed
let _activeThreeStage: any = null;
export function getActiveThreeStage(): any { return _activeThreeStage; }

// ─── HUD ─────────────────────────────────────────────────────────────────────
function updateHUD(name: string, key: string) {
  if (!hudEl) return;
  hudEl.textContent = `[${key}] ${name.toUpperCase()}`;
  hudEl.classList.add("flash");
  setTimeout(() => hudEl?.classList.remove("flash"), 600);
}

// ─── Ensure element is visible and layout is committed ──────────────────────
// Returns the element's current pixel dimensions.
function forceVisible(el: HTMLElement): { w: number; h: number } {
  el.style.visibility = "visible";
  el.style.display    = "block";         // ensure it participates in layout
  void el.offsetWidth;                   // sync layout flush (reflow)
  const w = el.offsetWidth  || el.clientWidth  || 800;
  const h = el.offsetHeight || el.clientHeight || 600;
  return { w, h };
}

// ─── Teardown ────────────────────────────────────────────────────────────────
function clearStage() {
  _activeThreeStage = null;
  currentKey = "";   // always reset so switchTo() can remount
  if (currentViz) {
    try { currentViz.destroy(); } catch (e) {
      console.warn("[switcher] destroy error:", e);
    }
    currentViz = null;
  }
  if (stageEl) {
    // Remove all children left by the previous viz
    while (stageEl.firstChild) stageEl.removeChild(stageEl.firstChild);
    stageEl.style.display = "";   // let CSS take over again
  }
}

// ─── Mount: slot 0 — Three.js Parliament ────────────────────────────────────
async function mountParliamentStage(): Promise<Viz> {
  const { default: ParliamentStage } = await import(
    "../main/starter_modules/ParliamentStage"
  );

  // ① Force the container visible BEFORE construction so that the renderer's
  //    setSize() inside BaseThreeJsModule reads the real pixel dimensions.
  //    Note: ModuleBase.constructor() runs FIRST (via super()), setting
  //    visibility:hidden; then BaseThreeJsModule calls setSize() — so we
  //    must pre-set visibility on the container *before* new ParliamentStage()
  //    AND we must also call show() afterward because ModuleBase hides it.
  const el = stageEl!;
  el.style.visibility = "visible";
  el.style.display    = "block";
  void el.offsetWidth; // sync reflow

  const stage = new ParliamentStage(el) as any;

  // ② ModuleBase constructor hides the element — call show() to restore it.
  if (typeof stage.show === "function") stage.show({});
  else el.style.visibility = "visible";

  // ③ Defer one RAF tick so the browser fully commits the visible layout,
  //    then resize the renderer + composer to the actual pixel dimensions.
  await new Promise<void>((resolve) => requestAnimationFrame(() => {
    const w = el.offsetWidth  || el.clientWidth  || 800;
    const h = el.offsetHeight || el.clientHeight || 600;
    if (stage.renderer && !stage.destroyed) {
      stage.renderer.setSize(w, h);
      stage.camera.aspect = w / h;
      stage.camera.updateProjectionMatrix();
    }
    if (stage._composer && !stage.destroyed) {
      stage._composer.setSize(w, h);
    }
    resolve();
  }));

  _activeThreeStage = stage;

  return {
    name: "Parliament of All Things",
    key: "0",
    destroy: () => {
      _activeThreeStage = null;
      try { stage.destroy(); } catch {}
    },
    onState: (_s) => { /* ParliamentStage subscribes to parliamentStore internally */ },
  };
}

// ─── Mount: slot 1 — AsteroidWaves (p5) ─────────────────────────────────────
function mountAsteroidWaves(): Promise<Viz> {
  // Return a promise so switchTo() can await it (matches slot 0 pattern).
  return new Promise((resolve) => {
    const container = stageEl!;

    // Amber palette
    const AMBER        = [255, 136,   0] as const;
    const AMBER_BRIGHT = [255, 204,  68] as const;
    const AMBER_DIM    = [102,  51,   0] as const;
    const AMBER_MID    = [180,  90,   0] as const;
    const BG           = [  0,   8,   4] as const;
    const SPECIES_COLS = [AMBER_BRIGHT, AMBER, AMBER_MID, AMBER_DIM, AMBER] as const;
    const SPECIES_LBLS = ["Ara", "Atl", "Cec", "Alo", "Tin"] as const;

    let destroyed = false;
    let myp5: p5 | null = null;
    let meteors: Array<{ mass: number; label: string; color: readonly [number, number, number] }> = [];

    function buildMeteors(st: ParliamentState | null) {
      if (!st || !Array.isArray(st.species)) {
        meteors = Array.from({ length: 5 }, (_, i) => ({
          mass: 50 + i * 60,
          label: SPECIES_LBLS[i],
          color: SPECIES_COLS[i % SPECIES_COLS.length],
        }));
        return;
      }
      meteors = st.species.map((sp, i) => ({
        mass: 20 + sp.presence * 200 + sp.activity * 150,
        label: SPECIES_LBLS[i] ?? `S${i}`,
        color: SPECIES_COLS[i % SPECIES_COLS.length],
      }));
    }

    // Prime meteors immediately from whatever state we have
    buildMeteors(getLatestState());

    const sketch = (p: p5) => {
      let noiseX = 0.0;
      let noiseY = 0.0;

      p.setup = () => {
        const w = container.offsetWidth  || container.clientWidth  || 800;
        const h = container.offsetHeight || container.clientHeight || 600;
        const cvs = p.createCanvas(w, h);
        cvs.parent(container);
        p.textFont("'SF Mono','Fira Code','Consolas',monospace");
      };

      p.windowResized = () => {
        if (destroyed) return;
        const w = container.offsetWidth  || container.clientWidth;
        const h = container.offsetHeight || container.clientHeight;
        if (w > 0 && h > 0) p.resizeCanvas(w, h);
      };

      p.draw = () => {
        if (destroyed) { p.noLoop(); return; }

        // Guard: if canvas was created with 0 size, resize now
        if (p.width < 10 || p.height < 10) {
          const w = container.offsetWidth  || container.clientWidth;
          const h = container.offsetHeight || container.clientHeight;
          if (w > 10 && h > 10) p.resizeCanvas(w, h);
          return;
        }

        p.background(BG[0], BG[1], BG[2], 245);

        const centerY = p.height / 2;
        const maxDist = (p.height / 2) * 0.85;
        const n = meteors.length || 1;

        // ── Dim grid ──────────────────────────────────────────────────────────
        p.strokeWeight(0.5);
        for (let g = 0; g <= 6; g++) {
          p.stroke(AMBER_DIM[0], AMBER_DIM[1], AMBER_DIM[2], 35);
          const gy = p.map(g, 0, 6, 0, p.height);
          p.line(0, gy, p.width, gy);
        }
        for (let x = 0; x < p.width; x += 40) {
          p.stroke(AMBER_DIM[0], AMBER_DIM[1], AMBER_DIM[2], 12);
          p.line(x, 0, x, p.height);
        }

        // ── Center axis ───────────────────────────────────────────────────────
        p.stroke(AMBER_DIM[0], AMBER_DIM[1], AMBER_DIM[2], 55);
        p.strokeWeight(1);
        p.line(0, centerY, p.width, centerY);

        // ── Waves ─────────────────────────────────────────────────────────────
        meteors.forEach((m, idx) => {
          const col   = m.color;
          const alpha = 100 + Math.floor((idx / n) * 120);
          const laneY = centerY + ((idx - (n - 1) / 2) / n) * maxDist * 0.4;

          p.stroke(col[0], col[1], col[2], alpha);
          p.strokeWeight(1.3);
          p.noFill();
          p.beginShape();

          let peakDist = 0, peakX = p.width / 2, peakY = laneY;
          const distMag = Math.min(m.mass / 10, maxDist * 0.72);

          for (let x = 0; x < p.width; x += 3) {
            const nv   = p.noise(noiseX + x * 0.008, noiseY + idx * 1.5);
            const dist = (nv - 0.5) * 2 * distMag;
            const y    = laneY - dist;
            p.vertex(x, y);
            if (Math.abs(dist) > peakDist) { peakDist = Math.abs(dist); peakX = x; peakY = y; }
          }
          p.endShape();

          // Peak dot
          p.noStroke();
          p.fill(col[0], col[1], col[2], 210);
          p.ellipse(peakX, peakY, 5, 5);

          // Peak label
          p.textSize(8);
          p.textAlign(p.CENTER, p.BOTTOM);
          p.fill(col[0], col[1], col[2], 190);
          p.text(m.label, peakX, peakY - 5);

          // Right-edge mass readout
          p.textAlign(p.RIGHT, p.CENTER);
          p.fill(col[0], col[1], col[2], 100);
          p.textSize(7);
          p.text(`${m.mass.toFixed(0)}`, p.width - 6, laneY);
        });

        // ── Footer labels ──────────────────────────────────────────────────────
        p.fill(AMBER_DIM[0], AMBER_DIM[1], AMBER_DIM[2], 100);
        p.textSize(7);
        p.textAlign(p.LEFT, p.BOTTOM);
        p.text("ASTEROID WAVES · SPECIES ACTIVITY + PRESENCE", 8, p.height - 4);
        p.textAlign(p.RIGHT, p.BOTTOM);
        const totalMass = meteors.reduce((s, m) => s + m.mass, 0);
        p.text(`Σ ${totalMass.toFixed(0)}`, p.width - 6, p.height - 4);

        noiseX += 0.007;
        noiseY += 0.007;
      };
    };

    // ④ Show container first, then defer p5 creation one RAF tick so the
    //    browser paints the layout before p5 reads container dimensions.
    forceVisible(container);
    requestAnimationFrame(() => {
      if (destroyed) { resolve({ name: "Asteroid Waves", key: "1", destroy: () => {} }); return; }
      myp5 = new p5(sketch);

      const viz: Viz = {
        name: "Asteroid Waves",
        key: "1",
        destroy: () => {
          destroyed = true;
          if (myp5) { myp5.remove(); myp5 = null; }
          container.style.visibility = "hidden";
        },
        onState: (st) => {
          buildMeteors(st);
        },
      };

      resolve(viz);
    });
  });
}

// ─── Mount: slots 2–9 — placeholder ─────────────────────────────────────────
function mountPlaceholder(key: string): Viz {
  const container = stageEl!;
  forceVisible(container);

  const canvas = document.createElement("canvas");
  canvas.style.cssText = "width:100%;height:100%;display:block;";
  container.appendChild(canvas);

  const ctx = canvas.getContext("2d")!;
  function draw() {
    canvas.width  = container.clientWidth  || 800;
    canvas.height = container.clientHeight || 600;
    ctx.fillStyle = "#000804";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font      = "10px 'SF Mono','Fira Code','Consolas',monospace";
    ctx.fillStyle = "rgba(102,51,0,0.55)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`[${key}]  VISUALIZATION SLOT RESERVED`, canvas.width / 2, canvas.height / 2);
    ctx.fillStyle = "rgba(102,51,0,0.25)";
    ctx.fillText("add module to visualizationSwitcher.ts", canvas.width / 2, canvas.height / 2 + 18);
  }
  draw();
  const ro = new ResizeObserver(draw);
  ro.observe(container);

  return {
    name: `Slot ${key}`,
    key,
    destroy: () => {
      ro.disconnect();
      canvas.remove();
      container.style.visibility = "hidden";
    },
  };
}

// ─── Switch ──────────────────────────────────────────────────────────────────
let _switching = false;  // prevent concurrent switchTo calls

async function switchTo(key: string) {
  if (key === currentKey && currentViz) return;
  if (_switching) return;  // debounce rapid key presses
  _switching = true;

  clearStage();   // resets currentKey to ""

  let viz: Viz;
  try {
    if (key === "0")      viz = await mountParliamentStage();
    else if (key === "1") viz = await mountAsteroidWaves();
    else                  viz = mountPlaceholder(key);
  } catch (e) {
    console.error("[switcher] mount failed:", e);
    _switching = false;
    return;
  }

  currentKey = key;
  currentViz = viz;
  _switching = false;

  updateHUD(viz.name, viz.key);

  // Feed current state immediately to the new viz
  const st = getLatestState();
  if (st && viz.onState) viz.onState(st);
}

// ─── Keyboard ────────────────────────────────────────────────────────────────
function onKeyDown(e: KeyboardEvent) {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  if (!/^[0-9]$/.test(e.key)) return;
  e.preventDefault();
  switchTo(e.key);
}

// ─── Public API ───────────────────────────────────────────────────────────────
export function initSwitcher(
  stage: HTMLElement,
  hud: HTMLElement,
  stateGetter: () => ParliamentState | null
) {
  stageEl        = stage;
  hudEl          = hud;
  getLatestState = stateGetter;

  window.addEventListener("keydown", onKeyDown);

  // Forward every parliament state update to the active viz
  parliamentStore.subscribe((state) => {
    if (currentViz?.onState) currentViz.onState(state);
  });

  // Default to slot 0
  switchTo("0");
}

export function destroySwitcher() {
  window.removeEventListener("keydown", onKeyDown);
  clearStage();
}
