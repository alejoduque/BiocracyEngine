// visualizationSwitcher.ts
// Keyboard-driven center-stage visualization switcher.
// Keys 0–9 swap what renders inside #parliament-stage.
//   0 → ParliamentStage    (anillos fenológicos: year · day · now, nested)
//   1 → Shan Shui          (3-D sonogram landscape, ink after {Shan, Shui}*)
//   2 → LowEarthPoint      (Three.js point cloud + Bézier lines)
//   3–9 → reserved slots
// Letter slots: p f b e r c a, and the two other ring layouts —
//   o → Anillos · Referencia (one outer turn = one phenological day)
//   t → Anillos · Taxones    (every ring the year, one lane per taxon)
// Pressing the key of the slot already on screen resets that slot's view,
// which is how the ring stages come back out of a deep zoom.
//
// #parliament-stage is position:absolute;inset:0 inside #canvas-wrap
// (position:relative), so stageEl.offsetWidth/Height are always reliable.

import p5 from "p5";
import parliamentStore from "./parliament/parliamentStore";
import type { ParliamentState } from "./parliament/parliamentStore";
import {
  mountTimeTravel,
  mountDynamicGraphs,
  mountDynamicOptimality,
  mountGeometry,
  mountMemoryHierarchy,
  mountHashing
} from "./dataStructureVisuals";
import {
  mountPhenologyCalendar,
  destroyPhenologyCalendar,
} from "./phenology/breath";
import {
  mountDarkForest,
  destroyDarkForest,
} from "./darkforest/darkforest";
import {
  mountTransito,
  destroyTransito,
} from "./btransito/btransito";
import {
  mountEstratos,
  destroyEstratos,
} from "./estratos/estratos";
import {
  mountRegistro,
  destroyRegistro,
} from "./registro/registro";
import {
  mountCamara,
  destroyCamara,
} from "./camara/camara";
import {
  mountAntifonia,
  destroyAntifonia,
} from "./antifonia/antifonia";

// ─── Species roster for parliament consensus display ─────────────────────────
// Populated at runtime from IUCN Red List API (Colombian species).
// Fallback: hardcoded tropical dry forest + broader ecosystem species.
// Each entry: [short label (3–4 chars), full scientific name, IUCN status].
// Slots 1–9 draw from this roster and shuffle names reactively.

import type { RosterEntry } from "./speciesFetcher";
import { getVizMotion, readVoteFlash, isAlarm } from "./vizMotion";
import * as THREE from "three";
import { installDomeSeat } from "./dome/domeSeat";
import { mountDomeCard } from "./dome/domeCard";

// Hardcoded fallback roster (used when IUCN API is unreachable)
const FALLBACK_ROSTER: [string, string, string][] = [
  ["Tre", "Tremarctos ornatus", "VU"],
  ["Pan", "Panthera onca", "NT"],
  ["Tap", "Tapirus bairdii", "EN"],
  ["Pod", "Podocnemis lewyana", "CR"],
  ["Ate", "Atelopus nahumae", "CR"],
  ["Har", "Harpia harpyja", "NT"],
  ["Cer", "Ceroxylon quindiuense", "EN"],
  ["Cat", "Cattleya trianae", "EN"],
  ["Esp", "Espeletia grandiflora", "VU"],
  ["Alo", "Alouatta palliata", "VU"],
  ["Cro", "Crocodylus acutus", "VU"],
  ["Den", "Dendrobates auratus", "LC"],
  ["Bra", "Bradypus variegatus", "LC"],
  ["Sar", "Sarcoramphus papa", "LC"],
  ["Phr", "Pharomachrus mocinno", "NT"],
  ["Cei", "Ceiba pentandra", "LC"],
  ["Och", "Ochroma pyramidale", "LC"],
  ["Pas", "Passiflora ligularis", "LC"],
  ["Hel", "Heliconia latispatha", "LC"],
  ["Fic", "Ficus insipida", "LC"],
  ["Mor", "Morpho peleides", "LC"],
  ["Gua", "Gustavia superba", "LC"],
  ["Bro", "Brownea ariza", "NT"],
  ["Sag", "Saguinus oedipus", "CR"],
  ["Cai", "Caiman crocodilus", "LC"],
  ["Pec", "Pecari tajacu", "LC"],
  ["Ara", "Ara macao", "CR"],
  ["Cal", "Caligo memnon", "LC"],
  ["Que", "Quercus humboldtii", "VU"],
  ["Mag", "Magnolia hernandezii", "CR"],
];

// Mutable roster — replaced when live data arrives
export let SPECIES_ROSTER: [string, string, string][] = FALLBACK_ROSTER.slice();

// Called by speciesFetcher when live data is available
export function updateSpeciesRoster(newRoster: RosterEntry[]) {
  if (newRoster.length > 0) {
    SPECIES_ROSTER = newRoster;
    console.log(`[roster] Updated with ${newRoster.length} live species`);
  }
}

// Shuffle helper — Fisher-Yates
export function shuffleArray<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Pick N species from the roster, ensuring the first 5 always align 
// with the UI dashboard sliders (Ara, Atl, Cec, Alo, Tin).
export function pickSpecies(n: number): [string, string, string][] {
  const first5 = SPECIES_ROSTER.slice(0, 5);
  const rest = shuffleArray(SPECIES_ROSTER.slice(5));
  return [...first5, ...rest].slice(0, n);
}

// IUCN status → amber palette color
export function iucnColor(status: string): readonly [number, number, number] {
  switch (status) {
    case "CR": return [255, 51, 0];
    case "EN": return [255, 102, 0];
    case "NT": return [255, 170, 0];
    case "VU": return [255, 136, 0];
    default: return [136, 170, 0]; // LC
  }
}

// ─── Viz interface ───────────────────────────────────────────────────────────
export interface Viz {
  name: string;
  key: string;
  destroy: () => void;
  onState?: (state: ParliamentState) => void;
  /** Called when the slot's own key is pressed while it is on screen. */
  resetView?: () => void;
}

// ─── Module-level refs ───────────────────────────────────────────────────────
let currentViz: Viz | null = null;
let currentKey = "";           // empty = nothing mounted yet
let stageEl: HTMLElement | null = null;
let hudEl: HTMLElement | null = null;
let getLatestState: () => ParliamentState | null = () => null;
let _mountId = 0;  // monotonic mount generation; stale mounts abort

// Exposed for parliamentEntry label tracking + FFT feed
let _activeThreeStage: any = null;
export function getActiveThreeStage(): any { return _activeThreeStage; }
/** The slot key on stage ("" before the first mount) — for the session snapshot. */
export function getCurrentSlot(): string { return currentKey; }

// ─── HUD ─────────────────────────────────────────────────────────────────────
function updateHUD(name: string, key: string) {
  if (!hudEl) return;
  hudEl.textContent = `[${key}] ${name.toUpperCase()}`;
  hudEl.classList.add("flash");
  setTimeout(() => hudEl?.classList.remove("flash"), 600);
}

// ─── Show/hide helpers ───────────────────────────────────────────────────────
export function showStage(stageEl: HTMLElement | null) { if (stageEl) stageEl.style.visibility = "visible"; }
function hideStage(stageEl: HTMLElement | null) { if (stageEl) stageEl.style.visibility = "hidden"; }

// ─── Teardown ────────────────────────────────────────────────────────────────
function clearStage() {
  // Drop the WebGL-only slots' scalar probe. It is set by whichever of slots
  // 4-9 mounted last and captured that slot's objects in a closure; leaving it
  // behind means the next slot reports a frozen number from a dead scene,
  // which reads as "nothing is moving" — a stale probe is worse than no probe.
  try { (window as any).__vizProbe = null; } catch { /* ignore */ }

  _activeThreeStage = null;
  currentKey = "";
  if (currentViz) {
    try { currentViz.destroy(); } catch (e) {
      console.warn("[switcher] destroy error:", e);
    }
    currentViz = null;
  }
  if (stageEl) {
    while (stageEl.firstChild) stageEl.removeChild(stageEl.firstChild);
  }
  hideStage(stageEl);
}

// ─── Mount: the ring stages — slot 0 (Parliament), O and T ──────────────────
// All three extend RingStageBase and keep ParliamentStage's field contract, so
// each becomes _activeThreeStage: applySonethToViz, the consensus bypass and
// the Art. 47 floor reach whichever ring layout is on screen.
async function mountParliamentStage(): Promise<Viz> {
  const { default: ParliamentStage } = await import(
    "../main/starter_modules/ParliamentStage"
  );
  return mountRingStage(ParliamentStage, "Parliament of the Living", "0");
}

async function mountRingStage(
  StageClass: new (el: HTMLElement) => unknown,
  name: string,
  key: string
): Promise<Viz> {
  // Create a disposable wrapper div inside stageEl.
  // ModuleBase.destroy() removes this.elem from the DOM — if we passed stageEl
  // directly, destroy would rip #parliament-stage out of the document tree,
  // leaving stageEl as a detached node with 0×0 dimensions on remount.
  const wrapper = document.createElement("div");
  wrapper.style.cssText = "position:absolute;inset:0;";
  stageEl!.appendChild(wrapper);

  showStage(stageEl);
  void wrapper.offsetWidth; // sync reflow

  const stage = new StageClass(wrapper) as any;

  // ModuleBase constructor hides elem — restore the wrapper immediately.
  wrapper.style.visibility = "visible";
  void wrapper.offsetWidth;

  // One RAF tick: let the browser paint, then fix up renderer size.
  await new Promise<void>((resolve) => requestAnimationFrame(() => {
    if (!stage || stage.destroyed) { resolve(); return; }
    const w = wrapper.offsetWidth || 800;
    const h = wrapper.offsetHeight || 600;
    if (w > 0 && h > 0) {
      if (stage.renderer) stage.renderer.setSize(w, h);
      if (stage.camera) { stage.camera.aspect = w / h; stage.camera.updateProjectionMatrix(); }
      if (stage._composer) stage._composer.setSize(w, h);
      // The dial is fitted to the aspect, which is only final now.
      stage.resetView?.(false);
    }
    resolve();
  }));

  _activeThreeStage = stage;
  console.log(`[switcher] ring stage [${key}] mounted, wrapper size:`, wrapper.offsetWidth, "×", wrapper.offsetHeight);

  return {
    // For slot 0 this is what the ticker prints. The page header is
    // "BiocracyEngine" now — the instrument — and this is the module: the
    // chamber the instrument convenes.
    name,
    key,
    resetView: () => { try { stage.resetView?.(true); } catch { /* ignore */ } },
    destroy: () => {
      _activeThreeStage = null;
      try { stage.destroy(); } catch { }
      // In case ModuleBase.destroy didn't remove it (e.g. elem was already nulled)
      if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
    },
    onState: (_s) => { /* ParliamentStage subscribes to parliamentStore internally */ },
  };
}

// ─── Mount: slot 2 — LowEarthPoint (Three.js point cloud + Bézier lines) ────
async function mountLowEarthPoint(): Promise<Viz> {
  const { default: LowEarthPointModule } = await import(
    "../main/starter_modules/LowEarthPointModule"
  );

  // Same disposable-wrapper pattern as slot 0: ModuleBase.destroy() removes
  // this.elem from DOM, so we give it a throwaway child div.
  const wrapper = document.createElement("div");
  wrapper.style.cssText = "position:absolute;inset:0;";
  stageEl!.appendChild(wrapper);

  showStage(stageEl);
  void wrapper.offsetWidth;

  const stage = new LowEarthPointModule(wrapper) as any;
  // Expose to parliamentEntry's applySonethToViz() so sonETH sliders can poke it directly
  (window as any).__activeVizStage2 = stage;

  // ── ZKProofVisualizer overlay ──────────────────────────────────────────────
  // White phosphor text layer rendered on top of the Three.js point cloud.
  // Uses mix-blend-mode:screen so the dark background becomes transparent and
  // white/yellow text from ZKP shows through the 3D scene additively.
  //
  // Inlined as a plain class (no ModuleBase/dynamic-import) to avoid the
  // webpack circular-reference crash (__WEBPACK_DEFAULT_EXPORT__ TDZ error).
  const zkWrapper = document.createElement("div");
  zkWrapper.style.cssText = [
    "position:absolute;inset:0;",
    "pointer-events:none;",
    "mix-blend-mode:screen;",
    "opacity:0.55;",
    "z-index:2;",
    "filter:sepia(0.6) hue-rotate(10deg) brightness(1.2);",
    "overflow:hidden;",
    "font-family:monospace;font-size:8px;color:#fff;",
  ].join("");
  stageEl!.appendChild(zkWrapper);

  // Inner scroll column — no background anywhere so mix-blend-mode:screen
  // only composites the text glyphs, not any box backgrounds
  const zkColumn = document.createElement("div");
  zkColumn.style.cssText = [
    "width:100%;height:100%;overflow:hidden;",
    "position:relative;",
    "padding:0;box-sizing:border-box;",
    "background:transparent;",
  ].join("");
  zkWrapper.appendChild(zkColumn);

  const ZKP_PAIRS: [string, string][] = [
    ["Ψ(x₁, t₀) = Σe^(-x₁²)", "Ξ(x₁, t₀) = √π/(2t₀)"],
    ["ℤₙ = ⌊Φ(k)²/Ψ(k)⌋", "Λₙ = ⌊(Φ(k)² − Ψ(k))⌋"],
    ["F₀(x) = ∫₀ⁿ e^(-kx) dx", "H₀(x) = (1 − e^(-kx))/k"],
    ["Σ{𝔼[X]} = Nμ", "Σ{𝔼[Y]} = Nμ"],
    ["f'(x) = lim(h→0)(f(x+h)−f(x))/h", "∂f/∂x = (f(x+h)−f(x))/h as h→0"],
    ["|A| = det(A)", "|B| = det(B) where B ≡ Aᵀ"],
    ["P(A ∩ B) = P(A)P(B)", "P(A|B)P(B) = P(A ∩ B)"],
    ["H(X) = -Σp(x)log₂p(x)", "H(Y) = -Σq(y)log₂q(y)"],
    ["Σf(i) = i(i+1)/2", "Σg(j) = j(j+1)/2"],
    ["aₙ = rⁿ/(1 − r)", "Sₙ = rⁿ/(1 − r) for |r| < 1"],
    ["∂²u/∂t² = c²∇²u", "u(x, t) = sin(kx−ωt) satisfies"],
    ["λ₁ = 1/n Σ(x−x̄)²", "σ² = λ₁ for unbiased estimator"],
    ["E[X] = ∫x f(x)dx", "⟨X⟩ = ∫x f(x)dx"],
    ["p(x) = (e^(-λ)λ^x)/x!", "P(X=x) = (e^(-λ)λ^x)/x!"],
    ["e^(ix) = cos(x) + i sin(x)", "cis(x) = cos(x) + i sin(x)"],
  ];
  const zkPairMap = new Map<string, string>();
  ZKP_PAIRS.forEach(([a, b]) => { zkPairMap.set(a, b); zkPairMap.set(b, a); });
  const allZkWords = Array.from(zkPairMap.keys());

  // Populate 60 word rows
  for (let i = 0; i < 60; i++) {
    const row = document.createElement("div");
    row.style.cssText = "width:100%;display:block;padding:0;margin:0;line-height:1.35;background:transparent;";
    const span = document.createElement("div");
    span.textContent = allZkWords[Math.floor(Math.random() * allZkWords.length)];
    span.style.cssText = "color:#fff;display:inline;background:transparent;";
    row.appendChild(span);
    zkColumn.appendChild(row);
  }

  // Rapid shuffle animation (20ms cadence via RAF)
  let zkAnimating = true;
  let zkLastSwap = 0;
  const zkSwap = () => {
    if (!zkAnimating) return;
    const now = performance.now();
    if (now - zkLastSwap >= 20) {
      const words = Array.from(zkColumn.children) as HTMLElement[];
      for (let i = 0; i < 5; i++) {
        const i1 = Math.floor(Math.random() * words.length);
        const i2 = Math.floor(Math.random() * words.length);
        if (i1 !== i2) {
          const w1 = words[i1], w2 = words[i2];
          if (i1 < i2) {
            zkColumn.insertBefore(w2, w1);
            zkColumn.insertBefore(w1, words[i2 + 1] ?? null);
          } else {
            zkColumn.insertBefore(w1, w2);
            zkColumn.insertBefore(w2, words[i1 + 1] ?? null);
          }
        }
      }
      zkLastSwap = now;
    }
    requestAnimationFrame(zkSwap);
  };
  requestAnimationFrame(zkSwap);

  // match() — flash yellow/red highlights on paired words
  const zkRecent: string[] = [];
  const zkStage = {
    destroyed: false,
    match({ matchCount = 6 }: { matchCount?: number } = {}) {
      if (this.destroyed) return;
      const spans = Array.from(zkColumn.querySelectorAll("div > div")) as HTMLElement[];
      const safe = Math.max(0, Math.min(Math.floor(matchCount), Math.floor(spans.length / 2)));
      const used = new Set<string>();
      const matches: [HTMLElement, HTMLElement][] = [];
      for (const span of spans) {
        if (matches.length >= safe) break;
        const txt = span.textContent ?? "";
        if (used.has(txt)) continue;
        const pairTxt = zkPairMap.get(txt);
        if (!pairTxt) continue;
        const pairEl = spans.find(s => s.textContent === pairTxt && !used.has(pairTxt));
        if (pairEl) {
          matches.push([span, pairEl]);
          used.add(txt); used.add(pairTxt);
        }
      }
      matches.forEach(([a, b]) => { a.style.background = "yellow"; b.style.background = "red"; });
      // What was verified, kept long enough to read on the dome (the page
      // flashes each pair for 75 ms among sixty shuffling rows).
      for (const [a, b] of matches) {
        const line = `${a.textContent ?? ""}  ⇄  ${b.textContent ?? ""}`;
        const i = zkRecent.indexOf(line);
        if (i >= 0) zkRecent.splice(i, 1);
        zkRecent.push(line);
      }
      if (zkRecent.length > 9) zkRecent.splice(0, zkRecent.length - 9);
      setTimeout(() => {
        matches.forEach(([a, b]) => { a.style.background = "transparent"; b.style.background = "transparent"; });
      }, 75);
    },
  };

  wrapper.style.visibility = "visible";
  void wrapper.offsetWidth;

  await new Promise<void>((resolve) => requestAnimationFrame(() => {
    if (!stage || stage.destroyed) { resolve(); return; }
    const w = wrapper.offsetWidth || 800;
    const h = wrapper.offsetHeight || 600;
    if (w > 0 && h > 0) {
      if (stage.renderer) stage.renderer.setSize(w, h);
      if (stage.camera) { stage.camera.aspect = w / h; stage.camera.updateProjectionMatrix(); }
    }
    resolve();
  }));

  console.log("[switcher] LowEarthPoint mounted, wrapper size:", wrapper.offsetWidth, "×", wrapper.offsetHeight);

  // Apply state once at mount with whatever data is already in the store
  function applyState(st: ParliamentState | null) {
    if (!st || !Array.isArray(st.species) || stage.destroyed) return;

    const avgActivity = st.species.reduce((s: number, sp: any) => s + sp.activity, 0) / st.species.length;
    const avgPresence = st.species.reduce((s: number, sp: any) => s + sp.presence, 0) / st.species.length;
    const consensus = typeof st.consensus === "number" ? st.consensus : 0.5;

    // Rotation speed — activity drives the white cloud; consensus inverts the red cloud
    // cameraSettings is the object animateLoop reads for cameraSpeed
    if (!stage.cameraSettings) stage.cameraSettings = {};
    // Base speed 1.0; activity multiplies up to 8×; consensus above 0.7 triggers counter-spin on red
    //
    // cameraSpeed had TWO writers stomping each other — this line (species
    // activity) and parliamentEntry's timedilation handler. Whichever fired
    // last won, so neither control behaved predictably. Activity stays the
    // base and the idle drift is added, rather than either replacing the
    // other.
    const vm2 = getVizMotion();
    stage.cameraSettings.cameraSpeed = 0.1 + avgActivity * 7.9 + vm2.speed * 6;

    // White point cloud: presence → scale (0.4 → 1.8), opacity
    if (stage.pointCloud?.material) {
      // × the live vote boost. Without this factor applyState stomps the vote
      // ripple flat: a vote triggers a 4 s / 40-step consensus decay, each
      // step notifying the store, each notify landing here and re-writing the
      // size from presence alone. The reaction was being overwritten ~10×/s by
      // the very event that caused it.
      stage.pointCloud.material.size = (0.02 + avgPresence * 0.14) * (stage._voteBoost ?? 1);
      stage.pointCloud.material.opacity = 0.2 + avgPresence * 0.80;
      stage.pointCloud.material.transparent = true;
    }
    if (stage.pointCloud) {
      const s = 0.4 + avgPresence * 1.4;
      stage.pointCloud.scale.setScalar(s);
    }

    // Red point cloud: activity → scale (0.3 → 2.2), opacity — more dramatic range
    if (stage.redPointCloud?.material) {
      stage.redPointCloud.material.size = 0.015 + avgActivity * 0.16;
      stage.redPointCloud.material.opacity = 0.1 + avgActivity * 0.90;
      stage.redPointCloud.material.transparent = true;
    }
    if (stage.redPointCloud) {
      const s = 0.3 + avgActivity * 1.9;
      stage.redPointCloud.scale.setScalar(s);
    }

    // White Bézier lines: presence → opacity, consensus → tightness (scale)
    if (stage.linesGroup) {
      stage.linesGroup.children.forEach((child: any) => {
        if (child.material) {
          child.material.opacity = 0.02 + avgPresence * 0.35;
          child.material.transparent = true;
        }
      });
      const ls = 0.5 + consensus * 0.8;
      stage.linesGroup.scale.setScalar(ls);
    }

    // Red Bézier lines: activity → opacity — visible only when active
    if (stage.redLinesGroup) {
      stage.redLinesGroup.children.forEach((child: any) => {
        if (child.material) {
          child.material.opacity = 0.0 + avgActivity * 0.45;
          child.material.transparent = true;
        }
      });
      const rls = 0.3 + avgActivity * 1.0;
      stage.redLinesGroup.scale.setScalar(rls);
    }
  }

  applyState(getLatestState());

  // ── Species parliament overlay — bottom-left, shuffling names with vote indicators ──
  const spOverlay2 = document.createElement("div");
  spOverlay2.style.cssText = [
    "position:absolute;bottom:8px;left:8px;",
    "pointer-events:none;z-index:3;",
    "font-family:'SF Mono','Fira Code','Consolas',monospace;",
    "font-size:8px;line-height:1.5;",
    "mix-blend-mode:screen;",
  ].join("");
  stageEl!.appendChild(spOverlay2);

  let s2Roster = pickSpecies(8);
  let s2ShuffleTick = 0;
  const s2Rows: HTMLElement[] = [];
  for (let i = 0; i < 8; i++) {
    const row = document.createElement("div");
    row.style.cssText = "background:transparent;white-space:nowrap;transition:opacity 0.3s;";
    row.textContent = `${s2Roster[i][0]} ${s2Roster[i][1]}`;
    row.style.color = `rgb(${iucnColor(s2Roster[i][2]).join(",")})`;
    row.style.opacity = "0.5";
    spOverlay2.appendChild(row);
    s2Rows.push(row);
  }

  // RAF loop: shuffle species, simulate voting with opacity/flash
  let s2Animating = true;
  let s2LastTick = 0;
  function s2Raf(ts: number) {
    if (!s2Animating) return;
    requestAnimationFrame(s2Raf);
    if (ts - s2LastTick < 80) return;
    s2LastTick = ts;

    const st = getLatestState();
    const avgAct = st?.species
      ? st.species.reduce((s, sp) => s + sp.activity, 0) / st.species.length
      : 0.3;

    s2ShuffleTick++;
    // Swap frequency: higher activity = faster reshuffling
    const swapEvery = Math.max(15, Math.round(60 - avgAct * 45));
    if (s2ShuffleTick % swapEvery === 0) {
      const available = SPECIES_ROSTER.filter(r => !s2Roster.some(a => a[1] === r[1]));
      if (available.length > 0) {
        const newSp = available[Math.floor(Math.random() * available.length)];
        const replaceIdx = Math.floor(Math.random() * s2Roster.length);
        s2Roster[replaceIdx] = newSp;
        const row = s2Rows[replaceIdx];
        row.textContent = `${newSp[0]} ${newSp[1]}`;
        row.style.color = `rgb(${iucnColor(newSp[2]).join(",")})`;
        // Flash on replacement — "vote in"
        row.style.opacity = "1.0";
        row.style.textShadow = "0 0 6px currentColor";
        setTimeout(() => {
          row.style.opacity = "0.5";
          row.style.textShadow = "";
        }, 400);
      }
    }

    // Pulse random row to simulate voting activity
    if (Math.random() < avgAct * 0.3) {
      const ri = Math.floor(Math.random() * s2Rows.length);
      const row = s2Rows[ri];
      const voteSymbol = Math.random() > 0.3 ? " +" : " -";
      const origText = row.textContent ?? "";
      row.textContent = origText.replace(/ [+-]$/, "") + voteSymbol;
      row.style.opacity = "0.9";
      setTimeout(() => {
        row.style.opacity = "0.5";
        row.textContent = origText.replace(/ [+-]$/, "");
      }, 250);
    }
  }
  requestAnimationFrame(s2Raf);

  // ZKP match() pulse driven by txInfluence sonETH param — fires periodically
  let zkMatchInterval: ReturnType<typeof setInterval> | null = null;
  function scheduleZkMatch() {
    if (zkMatchInterval) clearInterval(zkMatchInterval);
    const sp = (window as any).__slot2Soneth ?? {};
    const txInf = sp.txInfluence ?? 0.5;
    const harmRi = sp.harmonicrich ?? 0.5;
    // txInfluence: high = frequent flashes (300ms), low = rare (4000ms)
    const intervalMs = Math.round(4000 - txInf * 3700);
    // harmonicrich → matchCount (2–12 pairs highlighted per flash)
    const matchCount = Math.round(2 + harmRi * 10);
    zkMatchInterval = setInterval(() => {
      if (zkStage && !zkStage.destroyed) {
        try { zkStage.match({ matchCount }); } catch { }
      }
    }, intervalMs);
  }
  scheduleZkMatch();
  // Re-schedule when sonETH params change (called from parliamentEntry via window event)
  window.addEventListener("soneth-param-change", scheduleZkMatch);

  // ── Votes, slot 2 ──────────────────────────────────────────────────────
  // This slot had no vote channel of any kind — no __voteEvent read, no event
  // hook. Its only coupling was the incidental sonETH ramp a vote also fires.
  // Now a vote RIPPLES the cloud: point size swells and the shell pulses
  // outward, which is the vocabulary this slot already speaks.
  const _slot2Vote = setInterval(() => {
    if (stage.destroyed) return;
    const vf = readVoteFlash(1600);
    const k = vf ? vf.flash * (isAlarm(vf.type) ? 1.6 : 1.0) : 0;
    // A multiplier rather than an absolute, so presence and the vote compose
    // instead of racing. applyState reads it above.
    (stage as any)._voteBoost = 1 + k * 1.8;
    const pc = (stage as any).pointCloud;
    // X and Z only. setScalar wrote Y as well, and parliamentEntry's
    // pitchshift handler owns pointCloud.scale.y — so the ripple erased that
    // coupling within one 60 ms tick and the PITCH SHIFT fader was dead for as
    // long as slot 2 was mounted. (The line that used to sit here assigned
    // material.size to itself and did nothing at all.)
    if (pc) {
        const base = pc.__baseScaleXZ ?? (pc.__baseScaleXZ = pc.scale.x);
        const r = base * (1 + k * 0.25);
        pc.scale.x = r;
        pc.scale.z = r;
    }
  }, 60);

  // ── In the dome ────────────────────────────────────────────────────────
  // The audience sits just under the cloud (the cube spans ±5, scaled by
  // presence up to ~1.8×), which hangs overhead as the sky: points and their
  // curves from the zenith down to ~30°. Seated at its very centre the
  // curves cross in every direction at once and the dome washed out white
  // (measured: 100 % lit, mean 163 of 255). The proof's exchange — which
  // statement was verified against which equivalent — is a card in front,
  // below the cloud, where it can be read.
  if (stage.scene) {
    installDomeSeat(stage.scene, null, {
      eye: new THREE.Vector3(0, -9, 0), up: new THREE.Vector3(0, 1, 0), forward: new THREE.Vector3(0, 0, -1),
    });
  }
  const zkCardOff = mountDomeCard(wrapper, {
    az: 0, el: 20, w: 58, cols: 54, rows: 9, color: "#f2e6b8",
    title: "prueba · conocimiento cero · pares verificados",
    text: () => (zkRecent.length ? zkRecent : ["…"]),
  });

  return {
    name: "Low Earth Point",
    key: "2",
    destroy: () => {
      zkCardOff();
      clearInterval(_slot2Vote);
      (window as any).__activeVizStage2 = null;
      if (zkMatchInterval) clearInterval(zkMatchInterval);
      window.removeEventListener("soneth-param-change", scheduleZkMatch);
      zkAnimating = false;
      s2Animating = false;
      zkStage.destroyed = true;
      if (zkWrapper.parentNode) zkWrapper.parentNode.removeChild(zkWrapper);
      if (spOverlay2.parentNode) spOverlay2.parentNode.removeChild(spOverlay2);
      try { stage.destroy(); } catch { }
      if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
    },
    onState: (st) => { applyState(st); },
  };
}

// ─── Mount: slot 3 — PerlinBlob (p5 white-phosphor) + ZKP ETH live overlay ───
function mountPerlinBlob(): Viz {
  const container = stageEl!;
  showStage(stageEl);

  // ── p5 sketch canvas ───────────────────────────────────────────────────────
  const canvasWrap = document.createElement("div");
  canvasWrap.style.cssText = "position:absolute;inset:0;background:#000;";
  container.appendChild(canvasWrap);

  // Live params — written by onState / sonETH window global; read each draw frame
  let blobParams = {
    intensity: 15,   // noise offset amplitude; sonETH pitchshift → 5–80
    noiseSpeed: 0.005,// per-frame noise offset increment; grainsize → 0.001–0.025
    cycleFrames: 480,  // frames per data cycle; timedilation → 120–900
    layerCount: 8,    // number of concentric blob layers; atmospheremix → 2–12
    strokeOpacity: 0.85, // overall stroke alpha; volume → 0.2–1.0
    strokeWeightLo: 0.15, // min stroke weight; fmdepth → 0.05–0.5
    strokeWeightHi: 1.2,  // max stroke weight; noiselevel → 0.4–3.5
    ghostAlpha: 12,   // bg overlay alpha (0=solid, 255=no ghosting); memoryfeed
    compressionP: 0.5,  // probability of applying layer compression; spectralshift
    hueDrift: 200,  // base hue for hsb stroke; fmratio → 0–360
  };

  // Live ETH ticker lines — written by onState; read by ZKP RAF
  // Each entry: [label, valueStr]
  // Species labels rotate from the roster on each state update
  let s3Roster = pickSpecies(5);
  let s3RotateCounter = 0;
  const ethRows: [string, string][] = [
    ["consensus", "0.500"],
    [s3Roster[0][0] + ".pres", "0.500"],
    [s3Roster[0][0] + ".act", "0.500"],
    [s3Roster[1][0] + ".pres", "0.500"],
    [s3Roster[1][0] + ".act", "0.500"],
    [s3Roster[2][0] + ".pres", "0.500"],
    [s3Roster[2][0] + ".act", "0.500"],
    [s3Roster[3][0] + ".pres", "0.500"],
    [s3Roster[3][0] + ".act", "0.500"],
    [s3Roster[4][0] + ".pres", "0.500"],
    [s3Roster[4][0] + ".act", "0.500"],
    ["edna[0].bio", "0.500"],
    ["edna[1].bio", "0.500"],
    ["edna[2].bio", "0.500"],
    ["fungi[0].chem", "0.500"],
    ["fungi[1].chem", "0.500"],
    ["ai.conscious", "0.500"],
    ["ai.optimize", "64.0"],
    ["eco.co2", "0.000"],
    ["eco.myco", "0.000"],
    ["eco.phosph", "0.000"],
    ["eco.nitro", "0.000"],
    ["votes", "26"],
    ["phase", "0.000"],
    ["rotation", "1.000"],
  ];

  // ── p5 inline sketch ──────────────────────────────────────────────────────
  let myp5: p5 | null = null;
  let blobDestroyed = false;

  // Fallback sine series if no real data
  const fallbackValues: number[] = Array.from({ length: 80 }, (_, i) =>
    Math.sin(i * 0.18) * 30 + 50
  );

  let values = fallbackValues;
  let dataIndex = 0;
  let prevVal = values[0];
  let nextVal = values[0];
  let displayVal = values[0];
  let frameCounter = 0;

  const sketch = (p: p5) => {
    let noiseOffsets: number[] = [];

    p.setup = () => {
      const w = canvasWrap.clientWidth || 800;
      const h = canvasWrap.clientHeight || 600;
      const cnv = p.createCanvas(w, h);
      cnv.parent(canvasWrap);
      p.noFill();
      p.angleMode(p.DEGREES);
      p.colorMode(p.HSB, 360, 100, 100, 100);
      for (let i = 0; i < 12; i++) noiseOffsets.push(p.random(1000));
    };

    p.draw = () => {
      if (blobDestroyed) return;

      // Pull sonETH params from window global each frame — all 10 unified controls
      const sp3 = (window as any).__slot3Soneth ?? {};
      const vol = sp3.volume ?? sp3.masteramp ?? 0.7;
      const pitSh = sp3.pitchshift ?? 0.5;
      const timeDil = sp3.timedilation ?? 0.3;
      const specSh = sp3.spectralshift ?? 0.5;
      const spatSp = sp3.spatialspread ?? 0.5;
      const texDep = sp3.texturedepth ?? 0.3;
      const atmMix = sp3.atmospheremix ?? sp3.reverbmix ?? 0.5;
      const memFd = sp3.memoryfeed ?? sp3.delaymix ?? 0.4;
      const harmR = sp3.harmonicrich ?? sp3.fmratio ?? sp3.dronedepth ?? 0.5;
      const resB = sp3.resonantbody ?? 0.4;

      blobParams.intensity = 5 + pitSh * 75;              // pitchshift → noise amplitude
      blobParams.noiseSpeed = 0.001 + texDep * 0.024;     // texturedepth → morph speed (was grainsize)
      blobParams.cycleFrames = Math.round(120 + (1 - timeDil) * 780); // timedilation → data cycle
      blobParams.layerCount = Math.round(2 + atmMix * 10); // atmospheremix → layer count
      blobParams.strokeOpacity = 0.2 + vol * 0.80;        // volume → stroke opacity
      blobParams.strokeWeightLo = 0.05 + resB * 0.50;     // resonantbody → inner layer weight
      blobParams.strokeWeightHi = 0.4 + resB * 3.0;       // resonantbody → outer layer weight
      blobParams.ghostAlpha = Math.round(5 + (1 - memFd) * 60); // memoryfeed → ghost trail
      blobParams.compressionP = specSh;                    // spectralshift → layer compression
      blobParams.hueDrift = (harmR * 360) % 360;           // harmonicrich → hue drift

      // spatialspread → blob center X/Y offset (panning the visual field)
      const blobOffX = (spatSp - 0.5) * p.width * 0.3;    // ±15% of width
      const blobOffY = (spatSp - 0.5) * p.height * 0.15;  // ±7.5% of height

      const numLayers = blobParams.layerCount;
      const cycleFrames = blobParams.cycleFrames;

      // Advance data cycle
      if (p.frameCount % cycleFrames === 0) {
        dataIndex = (dataIndex + 1) % values.length;
        prevVal = nextVal;
        nextVal = values[dataIndex] ?? prevVal;
        frameCounter = 0;
      }
      const lf = Math.min(1, frameCounter / cycleFrames);
      displayVal = p.lerp(prevVal, nextVal, lf);
      frameCounter = Math.min(cycleFrames, frameCounter + 1);

      const adjusted = Math.min(200, Math.abs(displayVal) * blobParams.intensity + 5);
      const maxRadius = (Math.min(p.width, p.height) * 0.8) / 2;

      // Vote event flash for Slot 3
      const vf3 = readVoteFlash(2000);
      const voteEvt3 = vf3;
      const voteFlash3 = vf3 ? vf3.flash : 0;
      const vm3 = getVizMotion();

      // Ghost overlay (creates motion trail; fully black = no ghost)
      p.push();
      p.noStroke();
      if (voteFlash3 > 0 && voteEvt3) {
        const isRed3 = isAlarm(voteEvt3.type);
        // The assent tint used to be rgb(0, <=40, <=20) against a black
        // ghost — technically present, invisible in the room. Lifted so a
        // carried motion actually registers.
        const r3 = isRed3 ? Math.floor(voteFlash3 * 140) : Math.floor(voteFlash3 * 25);
        const g3 = isRed3 ? 0 : Math.floor(voteFlash3 * 110);
        const b3 = isRed3 ? 0 : Math.floor(voteFlash3 * 70);
        p.fill(r3, g3, b3, blobParams.ghostAlpha);
      } else {
        p.fill(0, 0, 0, blobParams.ghostAlpha);
      }
      p.rect(0, 0, p.width, p.height);
      p.pop();

      p.push();
      p.translate(p.width / 2 + blobOffX, p.height / 2 + blobOffY);

      // Ensure noiseOffsets has enough entries
      while (noiseOffsets.length < numLayers) noiseOffsets.push(p.random(1000));

      let previousLayerRadii: number[] = [];

      for (let i = 0; i < numLayers; i++) {
        const radius = maxRadius - (i * maxRadius) / numLayers;

        // White phosphor: pure white, brightness modulated by layer depth & volume
        const brightness = p.map(i, 0, numLayers - 1, 95, 40) * blobParams.strokeOpacity;
        const hue = (blobParams.hueDrift + i * 8) % 360;
        // Use very low saturation → near-white with subtle hue tint
        const sat = p.map(i, 0, numLayers - 1, 0, 18);
        p.stroke(hue, sat, brightness, blobParams.strokeOpacity * 100);

        const sw = p.map(i, 0, numLayers - 1, blobParams.strokeWeightLo, blobParams.strokeWeightHi);
        p.strokeWeight(sw);

        const applyCompression = p.random() < blobParams.compressionP;
        let compressionAngle = 0;
        let minCompression = 1;
        if (applyCompression) {
          compressionAngle = p.random(0, 360);
          minCompression = 0.5;
        }

        const currentLayerRadii: number[] = [];
        p.beginShape();
        for (let angle = 0; angle <= 360; angle += 5) {
          const xoff = p.map(p.cos(angle), -1, 1, 0, 1);
          const yoff = p.map(p.sin(angle), -1, 1, 0, 1);
          const n = p.noise(
            (xoff + noiseOffsets[i]) * 0.5,
            (yoff + noiseOffsets[i]) * 0.5
          );
          const maxOffset = adjusted * ((numLayers - i) / numLayers);
          const offset = p.map(n, 0.4, 0.6, -maxOffset, maxOffset, true);
          let currentRadius = radius + offset;

          if (applyCompression) {
            let diff = angle - compressionAngle;
            diff = ((diff + 180) % 360) - 180;
            const cf = p.map(p.cos(p.radians(diff)), -1, 1, 1, minCompression);
            currentRadius *= cf;
          }

          if (i > 0) {
            const prevR = previousLayerRadii[angle] ?? radius;
            if (currentRadius > prevR - 1) currentRadius = prevR - 1;
          } else if (currentRadius > maxRadius) {
            currentRadius = maxRadius;
          }

          currentLayerRadii[angle] = currentRadius;
          p.curveVertex(currentRadius * p.cos(angle), currentRadius * p.sin(angle));
        }
        p.endShape(p.CLOSE);
        previousLayerRadii = currentLayerRadii;
        noiseOffsets[i] += blobParams.noiseSpeed;
      }

      p.pop();
    };
  };

  myp5 = new p5(sketch);

  // Resize canvas when container resizes
  const ro = new ResizeObserver(() => {
    if (!myp5 || blobDestroyed) return;
    const w = canvasWrap.clientWidth || 800;
    const h = canvasWrap.clientHeight || 600;
    myp5.resizeCanvas(w, h);
  });
  ro.observe(canvasWrap);

  // ── ZKP overlay — ETH live values (white phosphor, mix-blend-mode:screen) ──
  // Two-column layout: left column = ZKP equation formulas (shuffling);
  // right column = live ETH values (updated by onState).
  // Both use mix-blend-mode:screen so only bright text composites over blob.
  const zkWrapper = document.createElement("div");
  zkWrapper.style.cssText = [
    "position:absolute;inset:0;",
    "pointer-events:none;",
    "mix-blend-mode:screen;",
    "opacity:0.70;",
    "z-index:2;",
    "overflow:hidden;",
    "display:flex;",
    "flex-direction:row;",
    "align-items:stretch;",
  ].join("");
  container.appendChild(zkWrapper);

  // Left column: ZKP shuffling formulas (white, narrow, monospace)
  const zkLeft = document.createElement("div");
  zkLeft.style.cssText = [
    "flex:1;overflow:hidden;",
    // +3pt. Both columns of this HUD were sized for a display standing on the
    // desk; read off a projection at performance distance 7.5px is a texture,
    // not text. The column widths below grow with them.
    "font-family:monospace;font-size:10.5px;color:#eee;",
    "padding:0;margin:0;background:transparent;",
    "display:flex;flex-direction:column;",
  ].join("");
  zkWrapper.appendChild(zkLeft);

  // Right column: ETH live values (slightly brighter, amber-white)
  const zkRight = document.createElement("div");
  zkRight.style.cssText = [
    "width:240px;min-width:215px;overflow:hidden;",
    "font-family:monospace;font-size:11px;",
    "padding:4px 6px;margin:0;background:transparent;",
    "display:flex;flex-direction:column;gap:1px;",
  ].join("");
  zkWrapper.appendChild(zkRight);

  // Populate ZKP formulas (same pairs as slot 2)
  const ZKP_PAIRS3: [string, string][] = [
    ["Ψ(x₁,t₀)=Σe^(-x₁²)", "Ξ(x₁,t₀)=√π/(2t₀)"],
    ["ℤₙ=⌊Φ(k)²/Ψ(k)⌋", "Λₙ=⌊(Φ(k)²−Ψ(k))⌋"],
    ["F₀(x)=∫₀ⁿe^(-kx)dx", "H₀(x)=(1−e^(-kx))/k"],
    ["Σ{𝔼[X]}=Nμ", "Σ{𝔼[Y]}=Nμ"],
    ["f'(x)=lim(h→0)Δf/h", "∂f/∂x=(f(x+h)−f(x))/h"],
    ["|A|=det(A)", "|B|=det(Aᵀ)"],
    ["P(A∩B)=P(A)P(B)", "P(A|B)P(B)=P(A∩B)"],
    ["H(X)=-Σp(x)log₂p(x)", "H(Y)=-Σq(y)log₂q(y)"],
    ["Σf(i)=i(i+1)/2", "Σg(j)=j(j+1)/2"],
    ["aₙ=rⁿ/(1−r)", "Sₙ=rⁿ/(1−r),|r|<1"],
    ["∂²u/∂t²=c²∇²u", "u(x,t)=sin(kx−ωt)"],
    ["λ₁=1/n Σ(x−x̄)²", "σ²=λ₁ unbiased"],
    ["E[X]=∫xf(x)dx", "⟨X⟩=∫xf(x)dx"],
    ["p(x)=e^(-λ)λˣ/x!", "P(X=x)=Poisson(λ)"],
    ["e^(ix)=cos(x)+i·sin(x)", "cis(x)=e^(ix)"],
  ];
  const zkPairMap3 = new Map<string, string>();
  ZKP_PAIRS3.forEach(([a, b]) => { zkPairMap3.set(a, b); zkPairMap3.set(b, a); });
  const allZkWords3 = Array.from(zkPairMap3.keys());

  // 50 shuffling formula rows in left column
  const zkLeftRows: HTMLElement[] = [];
  for (let i = 0; i < 50; i++) {
    const row = document.createElement("div");
    row.style.cssText = "width:100%;padding:0;margin:0;line-height:1.35;background:transparent;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
    row.textContent = allZkWords3[Math.floor(Math.random() * allZkWords3.length)];
    zkLeft.appendChild(row);
    zkLeftRows.push(row);
  }

  // ETH value rows in right column (one per ethRows entry)
  // Each row: label dim-white | value bright-white (updated in onState)
  const ethValueEls: HTMLElement[] = [];
  const ethLabelEls: HTMLElement[] = [];
  ethRows.forEach(([label]) => {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;justify-content:space-between;padding:0;margin:0;line-height:1.3;background:transparent;";

    const lbl = document.createElement("span");
    lbl.style.cssText = "color:rgba(220,220,220,0.55);padding-right:4px;";
    lbl.textContent = label;

    const val = document.createElement("span");
    val.style.cssText = "color:#fff;font-weight:bold;";
    val.textContent = "---";

    row.appendChild(lbl);
    row.appendChild(val);
    zkRight.appendChild(row);
    ethValueEls.push(val);
    ethLabelEls.push(lbl);
  });

  // RAF — shuffle left column formulas at ~20ms cadence
  let zkBlobAnimating = true;
  let lastZkShuffle = 0;
  function zkBlobRaf(ts: number) {
    if (!zkBlobAnimating) return;
    requestAnimationFrame(zkBlobRaf);
    if (ts - lastZkShuffle < 22) return;
    lastZkShuffle = ts;
    // Swap two random rows in left column
    const i1 = Math.floor(Math.random() * zkLeftRows.length);
    const i2 = Math.floor(Math.random() * zkLeftRows.length);
    if (i1 !== i2) {
      const tmp = zkLeftRows[i1].textContent;
      zkLeftRows[i1].textContent = zkLeftRows[i2].textContent;
      zkLeftRows[i2].textContent = tmp;
    }
    // Occasionally flash a matched pair (white-phosphor highlight)
    if (Math.random() < 0.035) {
      const sp3 = (window as any).__slot3Soneth ?? {};
      const txInf = sp3.txInfluence ?? 0.5;
      const harmRi = sp3.harmonicrich ?? 0.5;
      const count = Math.round(1 + harmRi * 6);
      for (let k = 0; k < count; k++) {
        const ri = Math.floor(Math.random() * zkLeftRows.length);
        const rowEl = zkLeftRows[ri];
        const formula = rowEl.textContent ?? "";
        const paired = zkPairMap3.get(formula);
        if (paired) {
          rowEl.style.color = "#fff";
          rowEl.style.textShadow = "0 0 6px #fff";
          const matchEl = zkLeftRows.find(r => r.textContent === paired);
          if (matchEl) {
            matchEl.style.color = "#fff";
            matchEl.style.textShadow = "0 0 6px #fff";
            const dur = 180 + txInf * 400;
            setTimeout(() => {
              rowEl.style.color = "#eee";
              rowEl.style.textShadow = "";
              matchEl.style.color = "#eee";
              matchEl.style.textShadow = "";
            }, dur);
          }
        }
      }
    }
  }
  requestAnimationFrame(zkBlobRaf);

  // ── Species parliament strip — bottom, scrolling species names with vote pulses ──
  const spStrip3 = document.createElement("div");
  spStrip3.style.cssText = [
    "position:absolute;bottom:6px;left:0;right:0;",
    "pointer-events:none;z-index:3;",
    "font-family:'SF Mono','Fira Code','Consolas',monospace;",
    "font-size:7px;line-height:1.4;",
    "mix-blend-mode:screen;",
    "display:flex;flex-wrap:wrap;gap:2px 10px;",
    "padding:0 8px;",
  ].join("");
  container.appendChild(spStrip3);

  let s3StripRoster = pickSpecies(12);
  const s3StripEls: HTMLElement[] = [];
  for (let i = 0; i < 12; i++) {
    const el = document.createElement("span");
    el.style.cssText = "transition:opacity 0.3s,color 0.3s;opacity:0.4;white-space:nowrap;";
    el.textContent = s3StripRoster[i][1];
    el.style.color = `rgb(${iucnColor(s3StripRoster[i][2]).join(",")})`;
    spStrip3.appendChild(el);
    s3StripEls.push(el);
  }

  // Periodic species replacement + vote pulse via RAF
  let s3StripAnimating = true;
  let s3StripTick = 0;
  function s3StripRaf() {
    if (!s3StripAnimating) return;
    requestAnimationFrame(s3StripRaf);
    s3StripTick++;
    if (s3StripTick % 90 === 0) { // ~1.5s at 60fps
      const st = getLatestState();
      const avgAct = st?.species
        ? st.species.reduce((s, sp) => s + sp.activity, 0) / st.species.length
        : 0.3;
      // Replace 1–3 species based on activity
      const swapCount = Math.ceil(avgAct * 3);
      const available = SPECIES_ROSTER.filter(r => !s3StripRoster.some(a => a[1] === r[1]));
      const replacements = shuffleArray(available).slice(0, swapCount);
      for (let s = 0; s < replacements.length; s++) {
        const idx = Math.floor(Math.random() * s3StripRoster.length);
        s3StripRoster[idx] = replacements[s];
        const el = s3StripEls[idx];
        el.textContent = replacements[s][1];
        el.style.color = `rgb(${iucnColor(replacements[s][2]).join(",")})`;
        el.style.opacity = "1.0";
        el.style.textShadow = "0 0 4px currentColor";
        setTimeout(() => {
          el.style.opacity = "0.4";
          el.style.textShadow = "";
        }, 500);
      }
    }
    // Random vote pulse
    if (s3StripTick % 20 === 0 && Math.random() < 0.4) {
      const ri = Math.floor(Math.random() * s3StripEls.length);
      const el = s3StripEls[ri];
      const vote = Math.random() > 0.25 ? " +" : " -";
      const orig = el.textContent ?? "";
      el.textContent = orig.replace(/ [+-]$/, "") + vote;
      el.style.opacity = "0.85";
      setTimeout(() => {
        el.textContent = orig.replace(/ [+-]$/, "");
        el.style.opacity = "0.4";
      }, 300);
    }
  }
  requestAnimationFrame(s3StripRaf);

  // ── onState — update ETH live values + blob intensity from parliament data ─
  function onState(st: ParliamentState) {
    if (blobDestroyed) return;

    // Rotate species names in the ETH ticker — swap one species per N state updates
    const sp = st.species;
    const fn = st.fungi;
    const ed = st.edna;

    s3RotateCounter++;
    const avgAct3 = sp.length
      ? sp.reduce((s: number, x: any) => s + x.activity, 0) / sp.length
      : 0.3;
    const rotateEvery = Math.max(8, Math.round(40 - avgAct3 * 30));
    if (s3RotateCounter % rotateEvery === 0) {
      const available = SPECIES_ROSTER.filter(r => !s3Roster.some(a => a[1] === r[1]));
      if (available.length > 0) {
        const newSp = available[Math.floor(Math.random() * available.length)];
        const replaceIdx = Math.floor(Math.random() * s3Roster.length);
        s3Roster[replaceIdx] = newSp;
        // Update label elements (indices 1–10: pairs of pres/act for 5 species)
        for (let si = 0; si < 5; si++) {
          const presIdx = 1 + si * 2;
          const actIdx = 2 + si * 2;
          if (ethLabelEls[presIdx]) ethLabelEls[presIdx].textContent = s3Roster[si][0] + ".pres";
          if (ethLabelEls[actIdx]) ethLabelEls[actIdx].textContent = s3Roster[si][0] + ".act";
        }
        // Flash the replaced labels
        const pIdx = 1 + replaceIdx * 2;
        const aIdx = 2 + replaceIdx * 2;
        [pIdx, aIdx].forEach(idx => {
          if (ethLabelEls[idx]) {
            ethLabelEls[idx].style.color = `rgb(${iucnColor(newSp[2]).join(",")})`;
            setTimeout(() => {
              if (ethLabelEls[idx]) ethLabelEls[idx].style.color = "rgba(220,220,220,0.55)";
            }, 600);
          }
        });
      }
    }

    const updates: string[] = [
      st.consensus.toFixed(3),
      sp[0]?.presence.toFixed(3) ?? "---",
      sp[0]?.activity.toFixed(3) ?? "---",
      sp[1]?.presence.toFixed(3) ?? "---",
      sp[1]?.activity.toFixed(3) ?? "---",
      sp[2]?.presence.toFixed(3) ?? "---",
      sp[2]?.activity.toFixed(3) ?? "---",
      sp[3]?.presence.toFixed(3) ?? "---",
      sp[3]?.activity.toFixed(3) ?? "---",
      sp[4]?.presence.toFixed(3) ?? "---",
      sp[4]?.activity.toFixed(3) ?? "---",
      ed[0]?.biodiversity.toFixed(3) ?? "---",
      ed[1]?.biodiversity.toFixed(3) ?? "---",
      ed[2]?.biodiversity.toFixed(3) ?? "---",
      fn[0]?.chemical.toFixed(3) ?? "---",
      fn[1]?.chemical.toFixed(3) ?? "---",
      st.ai.consciousness.toFixed(3),
      st.ai.optimization.toFixed(1),
      st.eco.co2.toFixed(3),
      st.eco.mycoPulse.toFixed(3),
      st.eco.phosphorus.toFixed(3),
      st.eco.nitrogen.toFixed(3),
      String(st.votes),
      st.phase.toFixed(3),
      st.rotation.toFixed(3),
    ];
    updates.forEach((v, i) => {
      if (ethValueEls[i]) ethValueEls[i].textContent = v;
    });

    // Drive blob displayVal from consensus × avg-species-activity so data is live
    const avgAct = sp.length
      ? sp.reduce((s: number, x: any) => s + x.activity, 0) / sp.length
      : 0.5;
    // Map consensus (0–1) and activity (0–1) into blob value range used for intensity
    // Original values were radiation ~5–80, so we scale similarly
    values = [st.consensus * 60 + 5, avgAct * 70 + 8, st.ai.consciousness * 50 + 10];
    dataIndex = 0;
    prevVal = displayVal;
    nextVal = values[0];
    frameCounter = 0;
  }

  // Initialize with current state
  const initSt = getLatestState();
  if (initSt) onState(initSt);

  return {
    name: "Perlin Blob",
    key: "3",
    destroy: () => {
      blobDestroyed = true;
      zkBlobAnimating = false;
      s3StripAnimating = false;
      ro.disconnect();
      if (myp5) { try { myp5.remove(); } catch { } myp5 = null; }
      if (zkWrapper.parentNode) zkWrapper.parentNode.removeChild(zkWrapper);
      if (spStrip3.parentNode) spStrip3.parentNode.removeChild(spStrip3);
      if (canvasWrap.parentNode) canvasWrap.parentNode.removeChild(canvasWrap);
    },
    onState,
  };
}

// ─── Mount: slot "p" — PhenologicalCalendar (Finca Manakai species ring) ───
// Loads the artist-authored ecosystems/.../PhenologicalCalendar.js at runtime,
// wires bidirectional breath via phenology/breath.ts:
//   parliament votes → calendar.pulse
//   beatTempo        → calendar.daysPerSecond
//   current day      → harmonicrich + texturedepth (visual + SC audio)
async function mountPhenologyCalendarSlot(): Promise<Viz> {
  const container = stageEl!;
  showStage(stageEl);

  const host = document.createElement("div");
  host.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";
  container.appendChild(host);
  void host.offsetWidth; // sync reflow before ModuleBase reads dims

  const w = window as unknown as {
    __applySonethToViz?: (key: string, val: number) => void;
    __sendOscToSC?: (address: string, value: number) => void;
  };
  const applyViz = w.__applySonethToViz ?? (() => { /* not ready */ });
  const sendOSC = w.__sendOscToSC ?? (() => { /* WS not ready */ });

  let instance: unknown = null;
  try {
    instance = await mountPhenologyCalendar(host, { applyViz, sendOSC });
  } catch (e) {
    console.error("[switcher] PhenologicalCalendar mount failed:", e);
  }

  // ModuleBase constructor sets elem.style.visibility = "hidden". The module's
  // own init() calls show() — but only once we hand control back. Force-restore
  // here to cover the race where data still loads asynchronously.
  host.style.visibility = "visible";
  void host.offsetWidth;

  // One RAF tick: let the browser paint, then fix renderer size — the calendar
  // was constructed with offsetWidth=0 if the stage was just made visible.
  await new Promise<void>((resolve) => requestAnimationFrame(() => {
    const inst = instance as { renderer?: { setSize: (w: number, h: number) => void }; camera?: { aspect: number; updateProjectionMatrix: () => void } } | null;
    if (inst && inst.renderer && inst.camera) {
      const wpx = host.offsetWidth || 800;
      const hpx = host.offsetHeight || 600;
      inst.renderer.setSize(wpx, hpx);
      inst.camera.aspect = wpx / hpx;
      inst.camera.updateProjectionMatrix();
    }
    resolve();
  }));

  const ro = new ResizeObserver(() => {
    const inst = instance as { renderer?: { setSize: (w: number, h: number) => void }; camera?: { aspect: number; updateProjectionMatrix: () => void } } | null;
    if (!inst || !inst.renderer || !inst.camera) return;
    const wpx = host.offsetWidth || 800;
    const hpx = host.offsetHeight || 600;
    inst.renderer.setSize(wpx, hpx);
    inst.camera.aspect = wpx / hpx;
    inst.camera.updateProjectionMatrix();
  });
  ro.observe(container);

  return {
    name: "Phenological Calendar",
    key: "p",
    destroy: () => {
      ro.disconnect();
      destroyPhenologyCalendar();
      if (host.parentNode) host.parentNode.removeChild(host);
    },
  };
}

// ─── Mount: slot F — DarkForest (data-viz interface to the carbon/bio world) ─
async function mountDarkForestSlot(): Promise<Viz> {
  const container = stageEl!;
  showStage(stageEl);

  const host = document.createElement("div");
  host.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";
  container.appendChild(host);
  void host.offsetWidth; // sync reflow before ModuleBase reads dims

  const w = window as unknown as {
    __applySonethToViz?: (key: string, val: number) => void;
    __sendOscToSC?: (address: string, value: number) => void;
  };
  const applyViz = w.__applySonethToViz ?? (() => { /* not ready */ });
  const sendOSC = w.__sendOscToSC ?? (() => { /* WS not ready */ });

  let instance: unknown = null;
  try {
    instance = await mountDarkForest(host, { applyViz, sendOSC });
  } catch (e) {
    console.error("[switcher] DarkForest mount failed:", e);
  }

  // ModuleBase hides elem in its ctor; the module's init() calls show(). Force
  // visibility here too, covering the race where data/shaders settle async.
  host.style.visibility = "visible";
  void host.offsetWidth;

  // One RAF tick: paint, then fix renderer size (constructed at offsetWidth=0
  // if the stage was just revealed).
  await new Promise<void>((resolve) => requestAnimationFrame(() => {
    const inst = instance as { renderer?: { setSize: (w: number, h: number) => void }; camera?: { aspect: number; updateProjectionMatrix: () => void } } | null;
    if (inst && inst.renderer && inst.camera) {
      const wpx = host.offsetWidth || 800;
      const hpx = host.offsetHeight || 600;
      inst.renderer.setSize(wpx, hpx);
      inst.camera.aspect = wpx / hpx;
      inst.camera.updateProjectionMatrix();
    }
    resolve();
  }));

  const ro = new ResizeObserver(() => {
    const inst = instance as { renderer?: { setSize: (w: number, h: number) => void }; camera?: { aspect: number; updateProjectionMatrix: () => void } } | null;
    if (!inst || !inst.renderer || !inst.camera) return;
    const wpx = host.offsetWidth || 800;
    const hpx = host.offsetHeight || 600;
    inst.renderer.setSize(wpx, hpx);
    inst.camera.aspect = wpx / hpx;
    inst.camera.updateProjectionMatrix();
  });
  ro.observe(container);

  return {
    name: "DarkForest",
    key: "f",
    destroy: () => {
      ro.disconnect();
      destroyDarkForest();
      if (host.parentNode) host.parentNode.removeChild(host);
    },
  };
}

// ─── Mount: slot A — Antifonía (the forest's acoustic parliament) ───────────
// Same shape as mountDarkForestSlot. The one thing to notice is that this slot
// makes SOUND of its own — it fires the field recordings through
// /sample/trigger — so leaving it mounted is not visually idle the way the
// others are. destroy() therefore has to stop the drain, which
// destroyAntifonia does by clearing its timers.
async function mountAntifoniaSlot(): Promise<Viz> {
  const container = stageEl!;
  showStage(stageEl);

  const host = document.createElement("div");
  host.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";
  container.appendChild(host);
  void host.offsetWidth; // sync reflow before ModuleBase reads dims

  const w = window as unknown as {
    __applySonethToViz?: (key: string, val: number) => void;
    __sendOscToSC?: (address: string, value: number) => void;
  };
  const applyViz = w.__applySonethToViz ?? (() => { /* not ready */ });
  const sendOSC = w.__sendOscToSC ?? (() => { /* WS not ready */ });

  let instance: unknown = null;
  try {
    instance = await mountAntifonia(host, { applyViz, sendOSC });
  } catch (e) {
    console.error("[switcher] Antifonia mount failed:", e);
  }

  host.style.visibility = "visible";
  void host.offsetWidth;

  await new Promise<void>((resolve) => requestAnimationFrame(() => {
    const inst = instance as { renderer?: { setSize: (w: number, h: number) => void }; camera?: { aspect: number; updateProjectionMatrix: () => void } } | null;
    if (inst && inst.renderer && inst.camera) {
      const wpx = host.offsetWidth || 800;
      const hpx = host.offsetHeight || 600;
      inst.renderer.setSize(wpx, hpx);
      inst.camera.aspect = wpx / hpx;
      inst.camera.updateProjectionMatrix();
    }
    resolve();
  }));

  const ro = new ResizeObserver(() => {
    const inst = instance as { renderer?: { setSize: (w: number, h: number) => void }; camera?: { aspect: number; updateProjectionMatrix: () => void } } | null;
    if (!inst || !inst.renderer || !inst.camera) return;
    const wpx = host.offsetWidth || 800;
    const hpx = host.offsetHeight || 600;
    inst.renderer.setSize(wpx, hpx);
    inst.camera.aspect = wpx / hpx;
    inst.camera.updateProjectionMatrix();
  });
  ro.observe(container);

  return {
    name: "Antifonia",
    key: "a",
    destroy: () => {
      ro.disconnect();
      destroyAntifonia();
      if (host.parentNode) host.parentNode.removeChild(host);
    },
  };
}

// ─── Mount: slot B — Transito (the dossier's flow machine; proves the drone) ─
async function mountTransitoSlot(): Promise<Viz> {
  const container = stageEl!;
  showStage(stageEl);

  const host = document.createElement("div");
  host.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";
  container.appendChild(host);
  void host.offsetWidth; // sync reflow before ModuleBase reads dims

  const w = window as unknown as {
    __applySonethToViz?: (key: string, val: number) => void;
    __sendOscToSC?: (address: string, value: number) => void;
  };
  const applyViz = w.__applySonethToViz ?? (() => { /* not ready */ });
  const sendOSC = w.__sendOscToSC ?? (() => { /* WS not ready */ });

  let instance: unknown = null;
  try {
    instance = await mountTransito(host, { applyViz, sendOSC });
  } catch (e) {
    console.error("[switcher] Transito mount failed:", e);
  }

  host.style.visibility = "visible";
  void host.offsetWidth;

  await new Promise<void>((resolve) => requestAnimationFrame(() => {
    const inst = instance as { renderer?: { setSize: (w: number, h: number) => void }; camera?: { aspect: number; updateProjectionMatrix: () => void } } | null;
    if (inst && inst.renderer && inst.camera) {
      const wpx = host.offsetWidth || 800;
      const hpx = host.offsetHeight || 600;
      inst.renderer.setSize(wpx, hpx);
      inst.camera.aspect = wpx / hpx;
      inst.camera.updateProjectionMatrix();
    }
    resolve();
  }));

  const ro = new ResizeObserver(() => {
    const inst = instance as { renderer?: { setSize: (w: number, h: number) => void }; camera?: { aspect: number; updateProjectionMatrix: () => void } } | null;
    if (!inst || !inst.renderer || !inst.camera) return;
    const wpx = host.offsetWidth || 800;
    const hpx = host.offsetHeight || 600;
    inst.renderer.setSize(wpx, hpx);
    inst.camera.aspect = wpx / hpx;
    inst.camera.updateProjectionMatrix();
  });
  ro.observe(container);

  return {
    name: "Transito",
    key: "b",
    destroy: () => {
      ro.disconnect();
      destroyTransito();
      if (host.parentNode) host.parentNode.removeChild(host);
    },
  };
}

// ─── Mount: slot E — Estratos (cartografía poética generativa, key [E]) ─────
async function mountEstratosSlot(): Promise<Viz> {
  const container = stageEl!;
  showStage(stageEl);

  const host = document.createElement("div");
  host.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";
  container.appendChild(host);
  void host.offsetWidth; // sync reflow before ModuleBase reads dims

  const w = window as unknown as {
    __applySonethToViz?: (key: string, val: number) => void;
    __sendOscToSC?: (address: string, value: number) => void;
  };
  const applyViz = w.__applySonethToViz ?? (() => { /* not ready */ });
  const sendOSC = w.__sendOscToSC ?? (() => { /* WS not ready */ });

  let instance: unknown = null;
  try {
    instance = await mountEstratos(host, { applyViz, sendOSC });
  } catch (e) {
    console.error("[switcher] Estratos mount failed:", e);
  }

  host.style.visibility = "visible";
  void host.offsetWidth;

  await new Promise<void>((resolve) => requestAnimationFrame(() => {
    const inst = instance as { renderer?: { setSize: (w: number, h: number) => void }; camera?: { aspect: number; updateProjectionMatrix: () => void } } | null;
    if (inst && inst.renderer && inst.camera) {
      const wpx = host.offsetWidth || 800;
      const hpx = host.offsetHeight || 600;
      inst.renderer.setSize(wpx, hpx);
      inst.camera.aspect = wpx / hpx;
      inst.camera.updateProjectionMatrix();
    }
    resolve();
  }));

  const ro = new ResizeObserver(() => {
    const inst = instance as { renderer?: { setSize: (w: number, h: number) => void }; camera?: { aspect: number; updateProjectionMatrix: () => void } } | null;
    if (!inst || !inst.renderer || !inst.camera) return;
    const wpx = host.offsetWidth || 800;
    const hpx = host.offsetHeight || 600;
    inst.renderer.setSize(wpx, hpx);
    inst.camera.aspect = wpx / hpx;
    inst.camera.updateProjectionMatrix();
  });
  ro.observe(container);

  return {
    name: "Estratos",
    key: "e",
    destroy: () => {
      ro.disconnect();
      destroyEstratos();
      if (host.parentNode) host.parentNode.removeChild(host);
    },
  };
}

// ─── Mount: slot R — Registro (the living record, pretext-style typesetter) ──
async function mountRegistroSlot(): Promise<Viz> {
  const container = stageEl!;
  showStage(stageEl);

  const host = document.createElement("div");
  host.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";
  container.appendChild(host);
  void host.offsetWidth;

  const w = window as unknown as {
    __applySonethToViz?: (key: string, val: number) => void;
    __sendOscToSC?: (address: string, value: number) => void;
  };
  const applyViz = w.__applySonethToViz ?? (() => { /* not ready */ });
  const sendOSC = w.__sendOscToSC ?? (() => { /* WS not ready */ });

  let instance: unknown = null;
  try {
    instance = await mountRegistro(host, { applyViz, sendOSC });
  } catch (e) {
    console.error("[switcher] Registro mount failed:", e);
  }

  host.style.visibility = "visible";
  void host.offsetWidth;

  await new Promise<void>((resolve) => requestAnimationFrame(() => {
    const inst = instance as { renderer?: { setSize: (w: number, h: number) => void }; camera?: { aspect: number; updateProjectionMatrix: () => void } } | null;
    if (inst && inst.renderer && inst.camera) {
      const wpx = host.offsetWidth || 800;
      const hpx = host.offsetHeight || 600;
      inst.renderer.setSize(wpx, hpx);
      inst.camera.aspect = wpx / hpx;
      inst.camera.updateProjectionMatrix();
    }
    resolve();
  }));

  const ro = new ResizeObserver(() => {
    const inst = instance as { renderer?: { setSize: (w: number, h: number) => void }; camera?: { aspect: number; updateProjectionMatrix: () => void } } | null;
    if (!inst || !inst.renderer || !inst.camera) return;
    const wpx = host.offsetWidth || 800;
    const hpx = host.offsetHeight || 600;
    inst.renderer.setSize(wpx, hpx);
    inst.camera.aspect = wpx / hpx;
    inst.camera.updateProjectionMatrix();
  });
  ro.observe(container);

  return {
    name: "Registro",
    key: "r",
    destroy: () => {
      ro.disconnect();
      destroyRegistro();
      if (host.parentNode) host.parentNode.removeChild(host);
    },
  };
}

// ─── Mount: slot C — Cámara (the visual register, on a CRT) ─────────────────
// Simpler than its neighbours because it owns no three.js scene: the module is
// raw WebGL1 (one fullscreen triangle over a 2D canvas — see camara/crt.ts),
// so there is no renderer/camera pair to resize and the module exposes its own
// resize() instead.
async function mountCamaraSlot(): Promise<Viz> {
  const container = stageEl!;
  showStage(stageEl);

  const host = document.createElement("div");
  host.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";
  container.appendChild(host);
  void host.offsetWidth;

  const w = window as unknown as {
    __applySonethToViz?: (key: string, val: number) => void;
    __sendOscToSC?: (address: string, value: number) => void;
  };
  const applyViz = w.__applySonethToViz ?? (() => { /* not ready */ });
  const sendOSC = w.__sendOscToSC ?? (() => { /* WS not ready */ });

  let instance: { resize?: () => void } | null = null;
  try {
    instance = await mountCamara(host, { applyViz, sendOSC });
  } catch (e) {
    console.error("[switcher] Cámara mount failed:", e);
  }

  host.style.visibility = "visible";
  void host.offsetWidth;

  await new Promise<void>((resolve) => requestAnimationFrame(() => {
    instance?.resize?.();
    resolve();
  }));

  const ro = new ResizeObserver(() => instance?.resize?.());
  ro.observe(container);

  return {
    name: "Cámara",
    key: "c",
    destroy: () => {
      ro.disconnect();
      destroyCamara();
      if (host.parentNode) host.parentNode.removeChild(host);
    },
  };
}

// ─── Mount: slots 4–9 — placeholder ─────────────────────────────────────────
function mountPlaceholder(key: string): Viz {
  const container = stageEl!;
  showStage(stageEl);

  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";
  container.appendChild(canvas);

  const ctx = canvas.getContext("2d")!;
  function draw() {
    canvas.width = container.offsetWidth || 800;
    canvas.height = container.offsetHeight || 600;
    ctx.fillStyle = "#000804";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = "10px 'SF Mono','Fira Code','Consolas',monospace";
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
    destroy: () => { ro.disconnect(); canvas.remove(); },
  };
}

// ─── Switch ──────────────────────────────────────────────────────────────────
// How many slot switches are still mounting. The offline renderer
// (dome/renderMode.ts) waits for zero before moving the session's clock on,
// so a slot that loads its code or data in real time is not rendered black.
let _mounting = 0;
async function switchTo(key: string) {
  _mounting++;
  (window as any).__slotMounting = _mounting;
  try { await switchToNow(key); }
  finally { _mounting--; (window as any).__slotMounting = _mounting; }
}

async function switchToNow(key: string) {
  if (key === currentKey && currentViz) {
    currentViz.resetView?.();
    return;
  }

  // Bump generation — any in-flight async mount with an older gen will be discarded
  const gen = ++_mountId;

  clearStage();
  console.log(`[switcher] switchTo("${key}") gen=${gen}`);

  let viz: Viz;
  try {
    if (key === "0") viz = await mountParliamentStage();
    else if (key === "1") {
      // Shan Shui · sonograma 3D — a ring stage in all but shape, so it gets
      // the same camera, overlay and sonETH contract (shanshui/ShanShuiStage.ts).
      const { default: Stage } = await import("./shanshui/ShanShuiStage");
      viz = await mountRingStage(Stage, "Shan Shui · sonograma 3D", "1");
    }
    else if (key === "2") viz = await mountLowEarthPoint();
    else if (key === "3") viz = mountPerlinBlob();
    else if (key === "4") viz = mountTimeTravel(stageEl!, getLatestState);
    else if (key === "5") viz = mountDynamicGraphs(stageEl!, getLatestState);
    else if (key === "6") viz = mountDynamicOptimality(stageEl!, getLatestState);
    else if (key === "7") viz = mountGeometry(stageEl!, getLatestState);
    else if (key === "8") viz = mountMemoryHierarchy(stageEl!, getLatestState);
    else if (key === "9") viz = mountHashing(stageEl!, getLatestState);
    else if (key === "p") viz = await mountPhenologyCalendarSlot();
    else if (key === "f") viz = await mountDarkForestSlot();
    else if (key === "b") viz = await mountTransitoSlot();
    else if (key === "e") viz = await mountEstratosSlot();
    else if (key === "r") viz = await mountRegistroSlot();
    else if (key === "c") viz = await mountCamaraSlot();
    else if (key === "a") viz = await mountAntifoniaSlot();
    else if (key === "o") {
      const { default: Stage } = await import("./rings/ReferenceRingsStage");
      viz = await mountRingStage(Stage, "Anillos · Referencia", "o");
    }
    else if (key === "t") {
      const { default: Stage } = await import("./rings/TaxonLanesStage");
      viz = await mountRingStage(Stage, "Anillos · Taxones", "t");
    }
    else viz = mountPlaceholder(key);
  } catch (e) {
    console.error("[switcher] mount failed:", e);
    return;
  }

  // If another switchTo() ran while we awaited, discard this result
  if (gen !== _mountId) {
    console.log(`[switcher] stale mount gen=${gen}, current=${_mountId} — discarding`);
    try { viz.destroy(); } catch { }
    return;
  }

  currentKey = key;
  currentViz = viz;

  updateHUD(viz.name, viz.key);

  const st = getLatestState();
  if (st && viz.onState) viz.onState(st);
}

// ─── Keyboard ────────────────────────────────────────────────────────────────
function onKeyDown(e: KeyboardEvent) {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  // 'a' added with slot A (Antifonía), 'c' with slot C (Cámara), 'o' and 't'
  // with the two other ring layouts. This regex is the real gate: adding a
  // mount function without widening it produces a slot that exists, compiles,
  // and can never be reached.
  if (!/^[0-9pfbreacot]$/.test(e.key)) return;
  e.preventDefault();
  switchTo(e.key);

  // Send mode switch OSC message to SuperCollider (numeric slots only —
  // 'p' (phenology), 'f' (DarkForest), 'b' (Transito), 'e' (Estratos),
  // 'r' (Registro), 'a' (Antifonía) and 'c' (Cámara) are parliament-side
  // overlay slots not known to SC).
  if (/^[0-9]$/.test(e.key)) {
    const modeVal = parseInt(e.key, 10);
    if (typeof (window as any).sendParliamentAction === "function") {
      (window as any).sendParliamentAction("/parliament/mode", [modeVal]);
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────
export function initSwitcher(
  stage: HTMLElement,
  hud: HTMLElement,
  stateGetter: () => ParliamentState | null
) {
  stageEl = stage;
  hudEl = hud;
  getLatestState = stateGetter;

  window.addEventListener("keydown", onKeyDown);

  parliamentStore.subscribe((state) => {
    if (currentViz?.onState) currentViz.onState(state);
  });

  switchTo("0");
}

export function destroySwitcher() {
  window.removeEventListener("keydown", onKeyDown);
  clearStage();
}
