// ─── Constellation Field ────────────────────────────────────────────────────
//
// The drifting figure-field behind slots 5-9.
//
// WHAT CHANGED, AND WHY
// ---------------------
// This began as a port of the @designcodeio/threeui `ConstellationField` (MIT,
// https://threeui.com): drifting points with a line drawn between any pair
// closer than LINK. That is a handsome background and it says nothing. The
// same graph appears over any data, it appeared identically on all five slots,
// and a link existed because two dots happened to be 160 px apart.
//
// It now draws CONSTELLATIONS — nine animals of the bosque seco tropical, the
// forest this engine listens to (see animals.ts). The pointer is a survey
// instrument: sweep it across the field and the figures nearest it resolve out
// of the scatter, name themselves, and lean toward the cursor before fading
// back. Away from the pointer they are just stars, which is the point — the
// forest is full of animals you do not see until you look directly at them.
//
// The reference's knobs survive, remapped onto the thing they now describe:
//
//   length      → how far the pointer reaches to resolve a figure (was LINK)
//   density     → how many figures share the field (was MAX_NODES)
//   size        → figure scale and star radius
//   strokeWidth → ctx.lineWidth on the figure's bones
//   speed       → drift
//   mode        → dark #E6C879 / light #8B6914
//   hue/saturation/brightness/opacity → CSS filter on the canvas, which is
//                where the reference puts them too rather than in the paint.
//
// drive()  live parameters, so the field is the slot's own voice.
// pulse()  an onset — the engine's attacks brighten the stars and widen the
//          reach, so the whole field gathers on a note.

import { ANIMALS, type Animal } from "./animals";

export type ConstellationMode = "dark" | "light";

export type ConstellationParams = {
  mode: ConstellationMode;
  speed: number;
  size: number;
  strokeWidth: number;
  length: number;
  density: number;
  opacity: number;
  /** Degrees of CSS hue-rotate away from the reference gold. */
  hue: number;
  saturation: number;
  brightness: number;
};

export const CONSTELLATION_DEFAULTS: ConstellationParams = {
  mode: "dark",
  speed: 1.0,
  size: 1.0,
  strokeWidth: 1.0,
  length: 1.0,
  density: 1.0,
  opacity: 1.0,
  hue: 0,
  saturation: 1.0,
  brightness: 1.0,
};

/** The reference palette. Gold sits at ~43.5° hue, which `hue` rotates from. */
const INK = { dark: "#E6C879", light: "#8B6914" } as const;

/** Hue of #E6C879 in degrees — the origin for a slot's hue-rotate. */
export const CONSTELLATION_BASE_HUE_DEG = 43.5;

/**
 * Degrees of hue-rotate that carry the reference gold to `hue01`.
 * The instrument table stores hue as a 0-1 fraction, so this is the bridge
 * between a slot's voice and its field's colour.
 */
export function hueRotateFor(hue01: number): number {
  return hue01 * 360 - CONSTELLATION_BASE_HUE_DEG;
}

export type ConstellationHandle = {
  drive: (p: Partial<ConstellationParams>) => void;
  /** Register an attack. `strength` 0-1; decays on its own. */
  pulse: (strength: number) => void;
  /**
   * A ripple leaving a point in the SLOT'S OWN geometry, host px.
   *
   * This is the coupling the field was missing. The star layer sat on top of
   * the chart and the two never touched: the chart had events — a node struck,
   * a target acquired, a cache line spilled — and the figures above it went on
   * drifting as though nothing had happened. Now the chart's events cross the
   * sky as a wave and the animals move when it reaches them, which is also the
   * honest picture: one forest, disturbed from below.
   */
  strike: (x: number, y: number, strength: number) => void;
  /**
   * Force one species to resolve without the pointer, 0-1, decaying.
   * `index` is into the roster in animals.ts.
   */
  spotlight: (index: number, strength: number) => void;
  /** Enter/leave sky navigation: wheel zooms, drag turns the figures. */
  setNav: (on: boolean) => void;
  /** Whether sky navigation is currently on. */
  navigating: () => boolean;
  resize: () => void;
  destroy: () => void;
  canvas: HTMLCanvasElement;
};

// ─── Depth ──────────────────────────────────────────────────────────────────
//
// animals.ts authors each figure in 2-D, which is the honest way to author a
// constellation: a constellation is a DRAWING, true only from here. The stars
// it joins are at wildly different distances and the animal exists only in
// projection from this one vantage.
//
// So depth is not authored, it is assigned — deterministically, from the
// animal's id and the star's index, so a given star sits at the same distance
// every mount and the figure is stable to learn. Turn the sky and the animal
// comes apart into the unrelated points it always was. That is the whole idea,
// and it is why rotation is worth having rather than being a camera trick.
const FOCAL = 2.4;
function starDepth(id: string, i: number): number {
  // xorshift on a cheap string hash — stable across sessions, no allocation.
  let h = 2166136261;
  for (let k = 0; k < id.length; k++) h = Math.imul(h ^ id.charCodeAt(k), 16777619);
  h = Math.imul(h ^ (i * 2654435761), 2246822519);
  h ^= h >>> 15;
  return (((h >>> 0) / 4294967295) - 0.5) * 0.9;
}

/** One animal placed in the field. */
type Instance = {
  animal: Animal;
  /** Centre, px. */
  cx: number;
  cy: number;
  vx: number;
  vy: number;
  /** Radians. Small — a figure upside down is not recognisable. */
  rot: number;
  /** Slow spin, rad/frame. A constellation that never turns reads as a decal. */
  rotVel: number;
  /** Epicycle: the arc a figure traces on top of its linear drift. */
  orbA: number;
  orbR: number;
  orbW: number;
  /** Eased elongation, 0 = at rest. Driven by how fast the crosshair sweeps. */
  elong: number;
  /** Forced reveal from spotlight(), decays on its own. */
  spot: number;
  /** Per-instance size variation, so a field does not look stamped. */
  sizeVar: number;
  /** 0-1, eased toward the pointer's proximity. */
  reveal: number;
  /** Phase offset so stars do not twinkle in unison. */
  phase: number;
};

/** Faint background scatter. Not linked to anything — these are just stars. */
type Dust = { x: number; y: number; vx: number; vy: number; r: number };

/** What this slot IS, for the corner readout. Not driven; set once at mount. */
export type ConstellationMeta = { label?: string; hint?: string };

export function mountConstellationField(
  host: HTMLElement,
  init: Partial<ConstellationParams> = {},
  meta: ConstellationMeta = {},
): ConstellationHandle {
  const p: ConstellationParams = { ...CONSTELLATION_DEFAULTS, ...init };

  const canvas = document.createElement("canvas");
  // ON TOP of the slot's WebGL canvas, screen-blended — not behind it.
  //
  // Behind was the first design and it does not work: these slots render
  // through an EffectComposer whose final pass writes an opaque alpha, so a
  // transparent clear reveals nothing (measured — see makeRenderer in
  // dataStructureVisuals.ts). `screen` only ever lightens, so over scenes this
  // dark the field reads as light in the room rather than as a veil across the
  // geometry, and it does not care what the composer does with alpha.
  //
  // pointer-events stay off so OrbitControls on the canvas below keeps every
  // drag despite this layer sitting above it.
  canvas.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;z-index:2;" +
    "pointer-events:auto;mix-blend-mode:screen;";
  host.appendChild(canvas);

  // The pointer is the survey instrument, so it reads as one. Set on the host
  // rather than the canvas because the canvas takes no pointer events at all.
  const prevCursor = host.style.cursor;
  host.style.cursor = "crosshair";

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    host.style.cursor = prevCursor;
    return {
      drive: () => { /* no 2d context */ },
      pulse: () => { /* no 2d context */ },
      strike: () => { /* no 2d context */ },
      spotlight: () => { /* no 2d context */ },
      setNav: () => { /* no 2d context */ },
      navigating: () => false,
      resize: () => { /* no 2d context */ },
      destroy: () => canvas.remove(),
      canvas,
    };
  }

  let width = 1;
  let height = 1;
  let instances: Instance[] = [];
  let dust: Dust[] = [];
  let raf = 0;
  let dead = false;
  let pulseAmt = 0;
  // ─── The strike ───────────────────────────────────────────────────────────
  //
  // Every voice used to produce the same gesture here: pulseAmt swelled the
  // reach and the brightness, so a bell, a kick and a china cymbal all made the
  // field enlarge and retract. One shape for every sound is the same flatness
  // as one brightness for every sound.
  //
  // A china is not a swell. It is a fast bright crack followed by a long
  // inharmonic shimmer that takes seconds to die — so it is drawn as one:
  //
  //   crack   0.86/frame  ~0.2 s   the transient. Shatters the bones into
  //                                dashes and spikes the beam.
  //   splash  0.985/frame ~4 s     the wash. Scatters each star along its own
  //                                fixed bearing, modulated by its own
  //                                frequency, so the figure SHIMMERS rather
  //                                than breathing in and out together.
  //
  // Both are zero at rest, so a quiet field is exactly the field as authored.
  let crack = 0;
  let splash = 0;
  const pointer = { x: -1e5, y: -1e5, vx: 0, vy: 0 };
  /** Expanding wavefronts from strike(). Bounded — see the push in strike(). */
  const ripples: { x: number; y: number; r: number; amp: number }[] = [];

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ─── The view ─────────────────────────────────────────────────────────────
  // A camera over the field: `zoom` magnifies about (cx, cy), which is the
  // WORLD point held at the centre of the viewport. yaw/pitch turn every figure
  // about its own centre rather than orbiting the sky, because the ask is to
  // look at a constellation from another angle, not to fly around the room.
  const view = { zoom: 1, yaw: 0, pitch: 0, cx: 0, cy: 0 };
  // Always navigable. The toggle was a mode, and a mode is a thing to remember
  // being in — on an instrument the performer should be able to reach into the
  // sky at any moment without arming anything first. The canvas therefore takes
  // pointer events for the whole life of the field.
  const nav = true;
  let dragging = false;
  let dragX = 0;
  let dragY = 0;
  const toWorldX = (sx: number) => (sx - width / 2) / view.zoom + view.cx;
  const toWorldY = (sy: number) => (sy - height / 2) / view.zoom + view.cy;

  // Style writes are throttled to real changes rather than to frames — see the
  // commit that introduced this. /spectrum arrives at 20 Hz while this loop
  // runs at display rate, so most per-frame writes could never have changed
  // anything, and each one invalidated the style of a full-viewport canvas.
  let lastFilter = "";
  let lastOpacity = "";
  const q = (v: number, step: number, dp: number) =>
    (Math.round(v / step) * step).toFixed(dp);

  function applyFilter() {
    // Opacity is its own write: it is a compositor property rather than part
    // of the filter string, and it moves on different inputs, so folding the
    // two together would make each one rewrite the other.
    const opacity = q(p.opacity, 0.004, 3);
    if (opacity !== lastOpacity) {
      canvas.style.opacity = opacity;
      lastOpacity = opacity;
    }
    const filter =
      `hue-rotate(${q(p.hue, 0.5, 1)}deg) saturate(${q(p.saturation, 0.02, 2)})` +
      ` brightness(${q(p.brightness, 0.02, 2)})`;
    if (filter !== lastFilter) {
      canvas.style.filter = filter;
      lastFilter = filter;
    }
  }

  /** Figures on screen at once.
   *
   *  The first mapping was `round(6 * density)`, and `density` arrives from
   *  mountSlotField as 0.35 + textureDepth * 1.15 — so with the texture knob
   *  down it evaluated to 2.1 and the field showed TWO animals. The knob was
   *  silently deciding whether the piece had a cast at all.
   *
   *  Five is now the floor and the whole roster the ceiling: density chooses
   *  how crowded the sky is, never whether there is one. */
  function figureCount(): number {
    return Math.max(5, Math.min(ANIMALS.length, Math.round(4 + p.density * 3.2)));
  }

  /** Base figure radius in px, before per-instance variation.
   *  Eases down as the cast grows so nine figures do not overlap into mush. */
  function figureScale(n: number): number {
    const crowd = 1 - Math.max(0, n - 5) * 0.035;
    return Math.min(width, height) * 0.15 * p.size * crowd;
  }

  function resize() {
    const r = host.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, Math.round(r.width));
    height = Math.max(1, Math.round(r.height));
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function layout() {
    // Hold the middle of the field unless the performer has moved the view.
    if (view.cx === 0 && view.cy === 0) { view.cx = width / 2; view.cy = height / 2; }
    const n = figureCount();
    // Walk the roster from a random offset rather than picking at random, so
    // a field never shows the same animal twice while others go unseen.
    const start = Math.floor(Math.random() * ANIMALS.length);
    instances = [];
    for (let i = 0; i < n; i++) {
      const animal = ANIMALS[(start + i) % ANIMALS.length];
      instances.push({
        animal,
        cx: (0.12 + Math.random() * 0.76) * width,
        cy: (0.12 + Math.random() * 0.76) * height,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        // ±11°: enough that the field is not a grid, little enough that every
        // animal still reads the way it was drawn.
        rot: (Math.random() - 0.5) * 0.38,
        // ~1 turn in 3-9 minutes at 60 fps, and either way round. Slow enough
        // to be invisible frame to frame, obvious if you look away and back —
        // the same discipline as the idle camera drift in vizMotion.ts.
        rotVel: (Math.random() - 0.5) * 0.00035,
        orbA: Math.random() * Math.PI * 2,
        orbR: 6 + Math.random() * 22,
        orbW: (Math.random() - 0.5) * 0.006,
        elong: 0,
        spot: 0,
        sizeVar: 0.82 + Math.random() * 0.42,
        reveal: 0,
        phase: Math.random() * Math.PI * 2,
      });
    }
    const dustN = Math.max(10, Math.round(34 * p.density));
    dust = [];
    for (let i = 0; i < dustN; i++) {
      dust.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 1.1 + 0.5,
      });
    }
  }

  const onMove = (e: MouseEvent) => {
    // The rect is cached on resize rather than read here: reading geometry on
    // every pointer event forces a synchronous layout, and at pointer rate
    // that is the expensive half of a drag.
    const nx = e.clientX - hostLeft;
    const ny = e.clientY - hostTop;
    // Sweep velocity, smoothed. This is what the figures elongate along, so it
    // is taken per EVENT rather than per frame — a fast flick can deliver
    // several moves inside one frame, and averaging them into the frame would
    // throw away exactly the gesture we want to render.
    if (pointer.x > -1e4) {
      pointer.vx += ((nx - pointer.x) - pointer.vx) * 0.4;
      pointer.vy += ((ny - pointer.y) - pointer.vy) * 0.4;
    }
    pointer.x = nx;
    pointer.y = ny;
  };
  const onLeave = () => {
    pointer.x = -1e5;
    pointer.y = -1e5;
  };
  let hostLeft = 0;
  let hostTop = 0;
  let rectAt = -Infinity;
  function cacheRect() {
    const r = host.getBoundingClientRect();
    hostLeft = r.left;
    hostTop = r.top;
    rectAt = performance.now();
  }
  // Refreshed on a timer from inside the frame loop, NOT on scroll.
  //
  // This listened on window scroll with capture: true, which fires for a
  // scroll ANYWHERE in the document — including the parliament.html left
  // column — and every one of those called getBoundingClientRect, forcing a
  // synchronous layout of a page carrying a full-viewport canvas with
  // mix-blend-mode: screen and a CSS filter. During a scroll drag that is
  // 60-120 forced layouts a second, for a rect that in this layout does not
  // move at all: the stage is not inside the scrolling column.
  //
  // Once every 400 ms is far more than enough to survive a window move or a
  // panel resize, and it costs one layout read per 24 frames instead of one
  // per scroll event.
  const RECT_TTL_MS = 400;

  // ─── Article 47, the opacity clause ───────────────────────────────────────
  //
  // This field names nine beings on screen, in Spanish and in Latin. Slot P
  // already decides, from live IUCN data, which being is in deepest peak today
  // and whether it is opacity-shielded, and publishes that on
  // window.__activeSpecies — the same object laserTap.ts reads before deciding
  // whether to cast a marker onto the real forest (laserTap.ts:70).
  //
  // The laser honours the clause. This field did not: it drew and NAMED every
  // animal in the roster regardless, which is the one thing the piece says it
  // will not do to a vulnerable being.
  //
  // Veiled does NOT mean absent. The clause is about exposure, not erasure —
  // Glissant's right to opacity is a right to be present without being made
  // legible. So a shielded animal keeps its stars, and loses its bones and its
  // name: you can see that something is there and you are not told what.
  // The laser does the same thing, drawing the year ring while withholding the
  // marker.
  //
  // The status is never hardcoded here. Inventing conservation statuses in a
  // constellation file would be exactly the wrong place for them to live, and
  // they would rot the moment the Red List moved. This asks the calendar.
  //
  // MATCHED ON GENUS, not on the full binomial, and that is deliberate. Slot P's
  // roster and this one share no exact name: it carries Alouatta palliata (VU,
  // the mantled howler) and this field draws Alouatta seniculus (the red
  // howler). Exact matching would compile, pass, and never once fire — a rule
  // that is really an ornament.
  //
  // A constellation is a drawing of a KIND. The figure labelled "mono aullador"
  // is every howler, and if the calendar says a howler is shielded today then
  // the howler in the sky is the being it is talking about. Genus is the right
  // grain for what is actually on screen.
  //
  // It can over-veil — a shielded Puma yagouaroundi would veil the puma figure
  // too. For a clause about withholding, that is the correct direction to err.
  const SPECIES_TTL_MS = 500;
  /** Genus = the first token of a binomial, lowercased. */
  const genusOf = (sci: string) => sci.trim().split(/\s+/)[0].toLowerCase();
  let speciesAt = -Infinity;
  /** Binomial of a shielded being, or null. Matched against Animal.latin. */
  let veiledSci: string | null = null;
  /** Binomial of today's being when it is NOT shielded. */
  let favouredSci: string | null = null;
  function readSpecies() {
    speciesAt = performance.now();
    try {
      const a = (window as unknown as {
        __activeSpecies?: { sci?: string; sensitive?: boolean };
      }).__activeSpecies;
      const sci = a && typeof a.sci === "string" && a.sci.trim() !== ""
        ? genusOf(a.sci) : null;
      veiledSci = sci && a?.sensitive === true ? sci : null;
      favouredSci = sci && a?.sensitive !== true ? sci : null;
    } catch {
      // Slot P may not be mounted. Absence of the calendar is not licence to
      // expose anything, but it is also not evidence of shielding: leave both
      // null and the field behaves as it always has.
      veiledSci = null;
      favouredSci = null;
    }
  }
  // Sky navigation takes pointer events on the canvas itself. That is the whole
  // arbitration: this layer sits above the WebGL canvas, so while it accepts
  // events OrbitControls below receives none and the two cannot fight over the
  // same drag. Turn it off and events fall through exactly as before.

  const onWheel = (e: WheelEvent) => {
    if (!nav) return;
    e.preventDefault();
    // Zoom about the pointer: the world point under the cursor stays under it,
    // so you magnify what you are looking at rather than the middle of the
    // screen and then have to chase it.
    const wx = toWorldX(e.clientX - hostLeft);
    const wy = toWorldY(e.clientY - hostTop);
    const next = Math.max(0.4, Math.min(14, view.zoom * Math.exp(-e.deltaY * 0.0016)));
    const k = 1 - view.zoom / next;
    view.cx += (wx - view.cx) * k;
    view.cy += (wy - view.cy) * k;
    view.zoom = next;
  };
  const onDown = (e: MouseEvent) => {
    dragging = true;
    dragX = e.clientX;
    dragY = e.clientY;
    // Cursor deliberately NOT changed to grab/grabbing. A hand says "this is a
    // surface you are sliding about"; the crosshair says "this is an instrument
    // you are aiming", which is what the field is and how the reveal reads it.
  };
  const onUp = () => { dragging = false; };
  const onDrag = (e: MouseEvent) => {
    if (!dragging) return;
    view.yaw += (e.clientX - dragX) * 0.006;
    // Pitch is clamped just short of a right angle. Past it every figure is
    // edge-on and the sky is a row of lines: reachable, but not somewhere to
    // get stuck with no way back but the reset.
    view.pitch = Math.max(-1.45, Math.min(1.45, view.pitch + (e.clientY - dragY) * 0.006));
    dragX = e.clientX;
    dragY = e.clientY;
  };
  // ─── Reaching the camera again ────────────────────────────────────────────
  //
  // Making the sky always-navigable cost OrbitControls: this canvas sits above
  // the WebGL one, so while it accepts pointer events the camera below receives
  // none. Rather than bring back a mode, the field YIELDS while Alt is held —
  // pointer-events go to none and the drag lands on the renderer exactly as it
  // did before the sky existed.
  //
  // Alt and not Shift: OrbitControls reads a shift-drag as a pan, so Shift
  // would have handed back the camera minus its rotation, which is the half
  // that was actually missed.
  let yielding = false;
  function setYield(on: boolean) {
    if (yielding === on) return;
    yielding = on;
    canvas.style.pointerEvents = on ? "none" : "auto";
    // Drop any drag in progress: the pointer is about to belong to something
    // else, and a drag that survives the handover keeps turning the sky from
    // under the camera.
    if (on) dragging = false;
  }
  const onAltDown = (e: KeyboardEvent) => { if (e.altKey) setYield(true); };
  const onAltUp = (e: KeyboardEvent) => { if (!e.altKey) setYield(false); };
  // Alt+Tab leaves the key logically down with no keyup ever arriving, which
  // would strand the field yielding and make it look dead.
  const onBlur = () => setYield(false);

  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    // Never steal a keystroke from a field the performer is typing into.
    if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    if (e.key === "x" || e.key === "X" || e.key === "Escape") {
      // Home. NOT "0": the switcher binds every digit to a slot
      // (visualizationSwitcher.ts:1991), so a reset on 0 would have reset the
      // view and jumped to the Parliament stage in the same keystroke —
      // destroying the thing it was meant to recover. x is unbound.
      view.zoom = 1; view.yaw = 0; view.pitch = 0;
      view.cx = width / 2; view.cy = height / 2;
    }
  };

  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("mousedown", onDown);
  window.addEventListener("mousemove", onDrag);
  window.addEventListener("mouseup", onUp);
  window.addEventListener("keydown", onKey);
  window.addEventListener("keydown", onAltDown);
  window.addEventListener("keyup", onAltUp);
  window.addEventListener("blur", onBlur);
  host.addEventListener("mousemove", onMove);
  host.addEventListener("mouseleave", onLeave);

  function frame() {
    if (dead) return;
    const c = ctx!;
    c.clearRect(0, 0, width, height);
    c.lineCap = "round";
    c.lineJoin = "round";
    // ─── Vector display ───────────────────────────────────────────────────
    // A Vectrex has no pixels and no fills: a beam is steered along the shape
    // and the phosphor keeps glowing behind it. Two consequences drawn here.
    //
    // "lighter" is additive, so where strokes cross they BLOOM instead of
    // painting over one another — the way overlapping beam passes actually
    // behave on a phosphor screen, and the reason a vector display's corners
    // are brighter than its edges. It also composes correctly with the
    // mix-blend-mode: screen this canvas already sits under, since both only
    // ever add light.
    c.globalCompositeOperation = "lighter";

    // An attack widens the reach and brightens the stars, so the field gathers
    // on the note and lets go after it. Decay is per-frame and frame-rate
    // naive, the same way the reference's own pulse term is.
    pulseAmt *= 0.94;
    crack *= 0.86;
    splash *= 0.985;
    const ink = INK[p.mode];
    const now = Date.now();
    const scale = figureScale(instances.length);
    // The sweep decays here rather than in onMove, because mousemove simply
    // stops firing when the pointer halts — without this the field would stay
    // elongated forever at the last velocity it saw.
    pointer.vx *= 0.88;
    pointer.vy *= 0.88;
    // performance.now(), NOT the Date.now() above: rectAt is stamped from the
    // monotonic clock, and comparing it against epoch milliseconds makes the
    // condition true on every single frame — which would force a layout per
    // frame, worse than the scroll listener this replaced.
    if (performance.now() - rectAt > RECT_TTL_MS) cacheRect();
    if (performance.now() - speciesAt > SPECIES_TTL_MS) readSpecies();
    // Wavefronts travel outward and thin as they go. Retired once spent so
    // the array cannot grow — a slot that strikes every frame would otherwise
    // accumulate one record per frame forever.
    for (let i = ripples.length - 1; i >= 0; i--) {
      const w = ripples[i];
      w.r += 9 * p.speed;
      w.amp *= 0.965;
      if (w.amp < 0.01 || w.r > Math.hypot(width, height) * 1.1) ripples.splice(i, 1);
    }
    const sweep = Math.hypot(pointer.vx, pointer.vy);
    // ~26 px between smoothed samples is a brisk sweep; past that it saturates.
    // A rotation drag is not a sweep. Without this, turning the sky smears
    // every figure along the drag at full stretch, which reads as the shapes
    // melting rather than as the sky turning.
    const sweepN = dragging ? 0 : Math.min(1, sweep / 26);
    // The pointer's reach. Same 160 px unit the reference used for LINK, so a
    // slot's `length` still means "how far this field associates".
    const reach = (150 * p.length + scale) * (1 + pulseAmt * 0.4);

    // ── Background scatter ────────────────────────────────────────────────
    // Deliberately unlinked. The old mesh drew a line between any two of these
    // and that line was the lie: it asserted a relationship that the data
    // never had.
    c.fillStyle = ink;
    for (const d of dust) {
      d.x += d.vx * p.speed;
      d.y += d.vy * p.speed;
      if (d.x < 0 || d.x > width) d.vx *= -1;
      if (d.y < 0 || d.y > height) d.vy *= -1;
      c.globalAlpha = 0.10 + pulseAmt * 0.10;
      c.beginPath();
      c.arc(
        (d.x - view.cx) * view.zoom + width / 2,
        (d.y - view.cy) * view.zoom + height / 2,
        d.r * p.size * Math.sqrt(view.zoom), 0, Math.PI * 2,
      );
      c.fill();
    }

    // ── The figures ───────────────────────────────────────────────────────
    for (const inst of instances) {
      // Linear drift carries the figure; the epicycle bends it. Straight lines
      // with a wall bounce read as a screensaver — an arc reads as an orbit,
      // which is what a thing in a sky is meant to be doing.
      inst.cx += inst.vx * p.speed;
      inst.cy += inst.vy * p.speed;
      inst.orbA += inst.orbW * p.speed;
      inst.rot += inst.rotVel * p.speed;
      const s = scale * inst.sizeVar;
      const margin = s * 1.15 + inst.orbR;
      if (inst.cx < margin || inst.cx > width - margin) inst.vx *= -1;
      if (inst.cy < margin || inst.cy > height - margin) inst.vy *= -1;
      inst.cx = Math.max(margin, Math.min(width - margin, inst.cx));
      inst.cy = Math.max(margin, Math.min(height - margin, inst.cy));
      // The drawn centre, orbit included. Bounds are tested on the guiding
      // centre above so the epicycle can never walk a figure off the edge.
      const px0 = inst.cx + Math.cos(inst.orbA) * inst.orbR;
      const py0 = inst.cy + Math.sin(inst.orbA) * inst.orbR * 0.6;

      // Compared in WORLD space: once `zoom` is not 1 a pointer's screen
      // position and a figure's world position are different quantities, and
      // subtracting them would make the crosshair miss by further the further
      // in you go.
      const dx = toWorldX(pointer.x) - px0;
      const dy = toWorldY(pointer.y) - py0;
      const dist = Math.hypot(dx, dy);
      // Smoothstep so a figure neither snaps on nor has a visible corner as it
      // resolves. 1 at the centre of the pointer, 0 at the edge of its reach.
      const t = Math.max(0, Math.min(1, 1 - dist / reach));
      const target = t * t * (3 - 2 * t);
      // Asymmetric easing: resolves quickly under the cursor, releases slowly,
      // so sweeping across the field leaves a wake rather than a hard edge.
      const k = target > inst.reveal ? 0.16 : 0.045;
      inst.reveal += (target - inst.reveal) * k;
      // A spotlit species resolves whether or not the crosshair found it —
      // slot 9 uses this to name the animal whose recording is sounding, so
      // the sky agrees with what you are hearing rather than with where the
      // mouse happens to be.
      inst.spot *= 0.965;
      // Today's being, when it is not shielded, sits a little way out of the
      // scatter whether or not the crosshair has found it — so the sky agrees
      // with the calendar rather than being a separate random draw. Well under
      // the 0.34 the name appears at: legible as a figure, still asking to be
      // looked at directly before it says what it is.
      const favoured = favouredSci !== null && genusOf(inst.animal.latin) === favouredSci;
      const rev = Math.max(inst.reveal, inst.spot, favoured ? 0.22 : 0);

      // Lean toward the pointer — "they follow the mouse". Proportional to
      // reveal and hard-capped, so the figure inclines rather than chases and
      // never leaves its own patch of sky.
      let leanX = 0;
      let leanY = 0;
      if (rev > 0.001 && dist > 1) {
        const lean = Math.min(s * 0.22, dist * 0.16) * rev;
        leanX = (dx / dist) * lean;
        leanY = (dy / dist) * lean;
      }

      // ── Elongation ────────────────────────────────────────────────────
      // The figure stretches ALONG the crosshair's sweep, like a body of light
      // smeared by the motion that found it. Eased in and out rather than
      // applied raw, so a flick leaves the figure still relaxing after the
      // pointer has gone — the "flexible" half of the gesture.
      //
      // Target is the product of three things, so it only happens where all
      // three are true: the figure is resolved (rev), the pointer is actually
      // moving (sweepN), and it is close enough to be affected (proximity).
      const near = Math.max(0, Math.min(1, 1 - dist / (reach * 0.85)));
      const eTarget = rev * sweepN * near * 0.55;
      inst.elong += (eTarget - inst.elong) * (eTarget > inst.elong ? 0.22 : 0.06);
      const el = inst.elong;

      // Direction of the stretch: the sweep itself while it is moving, falling
      // back to the axis toward the pointer as it slows, so a figure never
      // snaps orientation at the moment the sweep dies.
      let ux = 1;
      let uy = 0;
      if (sweep > 0.05 || dist > 1) {
        const bx = pointer.vx * 3 + (dist > 1 ? (dx / dist) * (1 - sweepN) * 6 : 0);
        const by = pointer.vy * 3 + (dist > 1 ? (dy / dist) * (1 - sweepN) * 6 : 0);
        const bl = Math.hypot(bx, by);
        if (bl > 0.0001) { ux = bx / bl; uy = by / bl; }
      }
      // The perpendicular gives back SOME of what the long axis gains — not
      // all of it. det = along * across = sqrt(1 + el), so at full stretch the
      // long axis grows 55% while the area grows 25%: the figure reads as
      // smeared rather than merely nearer. True area preservation (across =
      // 1/along) pinches the waist 35% and looks rubbery on the wide figures
      // like the bat and the macaw, which is why this is a half measure on
      // purpose rather than by oversight.
      const along = 1 + el;
      const across = 1 / Math.sqrt(along);

      const cos = Math.cos(inst.rot);
      const sin = Math.sin(inst.rot);
      const ox = px0 + leanX;
      const oy = py0 + leanY;
      // ─── 3-D ──────────────────────────────────────────────────────────
      // The authored 2-D point is treated as ALREADY PROJECTED, and the model
      // coordinate is recovered by multiplying the perspective divide back out
      // for that star's depth. At yaw = pitch = 0 the projection then returns
      // the authored point EXACTLY — algebraically, not nearly:
      //
      //     X = x·(F+z)/F      then      x' = X·F/(F+z) = x
      //
      // That property is the reason it is written this way round. The
      // silhouettes in animals.ts were checked against real animals, and a
      // depth model that quietly bent them at rest would be a regression
      // dressed as a feature. Turning the sky is the only thing that moves a
      // figure now.
      const cyw = Math.cos(view.yaw), syw = Math.sin(view.yaw);
      const cpt = Math.cos(view.pitch), spt = Math.sin(view.pitch);
      const depths: number[] = [];
      const pts = inst.animal.stars.map(([sx, sy], si) => {
        const z0 = starDepth(inst.animal.id, si);
        const m = (FOCAL + z0) / FOCAL;
        // roll in the figure's own plane, as before
        let X = (sx * cos - sy * sin) * m;
        let Y = (sx * sin + sy * cos) * m;
        let Z = z0;
        const X1 = X * cyw + Z * syw;          // yaw about the vertical
        Z = -X * syw + Z * cyw;
        X = X1;
        const Y1 = Y * cpt - Z * spt;          // pitch about the horizontal
        Z = Y * spt + Z * cpt;
        Y = Y1;
        depths.push(Z);
        // Each star has a fixed bearing and its own shimmer rate, both derived
        // from the same stable hash as its depth — so the wash is inharmonic
        // across the figure and identical every time the animal is drawn.
        if (splash > 0.001) {
          const bearing = starDepth(inst.animal.id, si + 977) * 7.0;
          const rate = 0.020 + Math.abs(starDepth(inst.animal.id, si + 313)) * 0.055;
          const sh = Math.sin(now * rate + si * 1.7);
          const mag = splash * sh * 0.16;
          X += Math.cos(bearing) * mag;
          Y += Math.sin(bearing) * mag;
        }
        const f = FOCAL / (FOCAL + Z);
        const rx = X * f * s;
        const ry = Y * f * s;
        // then decompose against the stretch axis and rescale each component
        const par = rx * ux + ry * uy;
        const per = -rx * uy + ry * ux;
        const pa = par * along;
        const pe = per * across;
        let wx = ox + pa * ux - pe * uy;
        let wy = oy + pa * uy + pe * ux;
        // Each wavefront pushes a star radially as its shell passes over it.
        // Per STAR rather than per figure, so the wave visibly travels through
        // the animal — the bones flex in sequence instead of the whole shape
        // sliding, which is the difference between a ripple and a nudge.
        for (const w of ripples) {
          const rdx = wx - w.x;
          const rdy = wy - w.y;
          const rd = Math.hypot(rdx, rdy);
          if (rd < 0.001) continue;
          const band = Math.abs(rd - w.r);
          if (band > 90) continue;
          const shell = Math.cos((band / 90) * Math.PI * 0.5);
          const push = w.amp * shell * shell * 26;
          wx += (rdx / rd) * push;
          wy += (rdy / rd) * push;
        }
        // World to screen, at the one place a star position is finished.
        // Everything above — orbit, lean, elongation, ripples — stays in world
        // units so a strike travels the same distance whatever the zoom, and
        // only the view maps it onto the canvas.
        return [
          (wx - view.cx) * view.zoom + width / 2,
          (wy - view.cy) * view.zoom + height / 2,
        ] as [number, number];
      });

      // The veil is tested HERE, at the point of drawing, and not folded into
      // `rev` above. reveal and spot are two different routes to legibility —
      // the crosshair and slot 9's spotlight — and a rule that lives in only
      // one of them is a rule with a way around it. A shielded being cannot be
      // exposed by hovering it, by the sample player naming it, or by both.
      const veiled = veiledSci !== null && genusOf(inst.animal.latin) === veiledSci;

      // Bones first, so stars sit crisp on top — the reference's ordering.
      if (rev > 0.004 && !veiled) {
        // The crack shatters the trace. A struck cymbal does not move a shape,
        // it breaks the sound into noise before it settles — so the beam skips,
        // and the gaps close as the transient dies. Solid again within ~0.2 s.
        if (crack > 0.02) {
          const on = 3 + (1 - crack) * 60;
          c.setLineDash([on, 2 + crack * 9]);
          c.lineDashOffset = -(now * 0.06) % 1000;
        } else {
          c.setLineDash([]);
        }
        c.strokeStyle = ink;
        const wBase = Math.max(0.3, p.strokeWidth * (0.55 + rev * 0.75) * Math.sqrt(view.zoom));
        const aBase = rev * (0.30 + rev * 0.45) * (1 + pulseAmt * 0.5 + crack * 1.2);
        c.beginPath();
        for (const [a, b] of inst.animal.edges) {
          c.moveTo(pts[a][0], pts[a][1]);
          c.lineTo(pts[b][0], pts[b][1]);
        }
        // Two passes over one path: a wide dim halo, then a narrow bright core.
        // That IS the look — phosphor bleeds around the beam, and the beam
        // itself is close to white however the tube is tinted. Cheaper and
        // steadier than shadowBlur, which re-rasterises per stroke.
        c.lineWidth = wBase * 3.2;
        c.globalAlpha = Math.min(1, aBase * 0.22);
        c.stroke();
        c.lineWidth = wBase;
        c.globalAlpha = Math.min(1, aBase);
        c.stroke();
        c.setLineDash([]);
      }

      // Stars. Visible even at reveal 0 — the animal is always there; the
      // pointer only decides whether you can read it.
      c.fillStyle = ink;
      for (let i = 0; i < pts.length; i++) {
        const tw = 0.78 + Math.sin(now * 0.0012 + inst.phase + i * 0.7) * 0.22;
        // sqrt, not linear: at 14x a linear scale turns every star into a disc
        // and the figure into a blob. Depth reads on top of it — a star nearer
        // the viewer is drawn slightly larger, which is what makes a rotation
        // legible as rotation rather than as a shape that wobbles.
        const near = 1 + (0.35 - depths[i]) * 0.30;
        const r = (1.1 + rev * 1.5) * p.size * tw * Math.sqrt(view.zoom) * near;
        const a = (0.20 + rev * 0.68) * tw * (1 + pulseAmt * 0.5);
        // A vertex is where the beam DWELLS — it lingers turning a corner, so
        // it burns brighter and blooms wider there than along a stroke. Halo in
        // the tube's own colour, core pushed toward white, which is what a
        // phosphor does when it saturates.
        c.fillStyle = ink;
        c.globalAlpha = Math.min(1, a * 0.26);
        c.beginPath();
        c.arc(pts[i][0], pts[i][1], r * 3.0, 0, Math.PI * 2);
        c.fill();
        c.globalAlpha = Math.min(1, a * 0.85);
        c.beginPath();
        c.arc(pts[i][0], pts[i][1], r * 1.5, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = "#fff";
        c.globalAlpha = Math.min(1, a * (0.30 + rev * 0.35 + crack * 0.5));
        c.beginPath();
        c.arc(pts[i][0], pts[i][1], r * 0.62, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = ink;
      }

      // The name, once the figure is legible enough to deserve one.
      if (rev > 0.34 && !veiled) {
        const la = Math.min(1, (rev - 0.34) / 0.34);
        let maxY = -Infinity;
        for (const pt of pts) maxY = Math.max(maxY, pt[1]);
        c.textAlign = "center";
        c.textBaseline = "top";
        c.fillStyle = ink;
        c.globalAlpha = la * 0.92;
        c.font = `600 ${Math.round(11 + s * 0.045)}px ui-monospace, "SF Mono", Menlo, monospace`;
        // ox is WORLD, maxY comes from pts and is SCREEN. Mixing them put the
        // name in the right place at zoom 1 and nowhere near the figure at any
        // other zoom. Both ends on the screen side now, and the offsets scale
        // with the view so the caption keeps its distance from the animal.
        const lx = (ox - view.cx) * view.zoom + width / 2;
        const gap = s * 0.16 * view.zoom;
        c.fillText(inst.animal.common.toUpperCase(), lx, maxY + gap);
        c.globalAlpha = la * 0.55;
        c.font = `italic ${Math.round(9 + s * 0.035)}px ui-monospace, "SF Mono", Menlo, monospace`;
        c.fillText(inst.animal.latin, lx, maxY + gap + Math.round(14 + s * 0.05));
      }
    }

    // A mode nobody can find is a mode that is not there. Drawn last so it
    // sits over the sky, and only while navigating — nothing is added to the
    // picture the rest of the time.
    // ─── Corner readout ───────────────────────────────────────────────────
    // Drawn as the tube would draw it: brackets are strokes, the text sits at
    // low alpha, and it is deliberately small. It should be readable when
    // looked at and invisible when not — the module explaining itself to
    // someone standing at the machine, not a caption over the work.
    if (meta.label) {
      const bx = 14;
      const by = height - 34;
      c.globalAlpha = 0.34;
      c.strokeStyle = ink;
      c.lineWidth = 1;
      c.setLineDash([]);
      // Two corner brackets rather than a box: a closed rectangle reads as a
      // panel sitting on top of the picture, an open one as an instrument
      // marking a place in it.
      c.beginPath();
      c.moveTo(bx - 6, by - 4); c.lineTo(bx - 6, by + 22); c.lineTo(bx + 2, by + 22);
      c.stroke();
      c.globalAlpha = 0.78;
      c.fillStyle = ink;
      c.textAlign = "left";
      c.textBaseline = "top";
      c.font = '600 11px ui-monospace, "SF Mono", Menlo, monospace';
      c.fillText(meta.label, bx + 2, by - 3);
      if (meta.hint) {
        c.globalAlpha = 0.40;
        c.font = '10px ui-monospace, "SF Mono", Menlo, monospace';
        c.fillText(meta.hint, bx + 2, by + 11);
      }
    }

    const offOrigin = Math.abs(view.zoom - 1) > 0.01
      || Math.abs(view.yaw) > 0.005 || Math.abs(view.pitch) > 0.005;
    if (offOrigin || yielding) {
      c.globalAlpha = 0.72;
      c.fillStyle = ink;
      c.textAlign = "left";
      c.textBaseline = "top";
      c.font = '600 11px ui-monospace, "SF Mono", Menlo, monospace';
      c.fillText(
        `CIELO  ·  ${view.zoom.toFixed(1)}x  ·  ` +
        `${Math.round((view.yaw * 180) / Math.PI)}° / ${Math.round((view.pitch * 180) / Math.PI)}°`,
        14, 14,
      );
      c.globalAlpha = 0.42;
      c.font = '10px ui-monospace, "SF Mono", Menlo, monospace';
      c.fillText(
        yielding
          ? "alt · cámara del módulo"
          : "arrastrar: girar   rueda: acercar   x/esc: origen   alt: cámara",
        14, 30,
      );
    }

    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
    raf = requestAnimationFrame(frame);
  }

  applyFilter();
  cacheRect();
  resize();
  layout();
  // Reduced motion still gets the field, drawn once and left still — the
  // reference simply never starts its loop, which leaves a blank rectangle
  // where the background should be. frame() schedules its own successor, so
  // the one it queues is cancelled straight back out.
  if (reduced) {
    frame();
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  } else {
    raf = requestAnimationFrame(frame);
  }

  return {
    canvas,
    drive(next: Partial<ConstellationParams>) {
      const densityChanged =
        next.density !== undefined && Math.abs(next.density - p.density) > 0.05;
      Object.assign(p, next);
      applyFilter();
      // Figure count is baked at layout, so a real change to density has to
      // re-place. Thresholded because these are driven from live audio and
      // rebuilding every frame would strobe the field. `size` is read live in
      // frame(), so it needs no rebuild at all.
      if (densityChanged) layout();
    },
    pulse(strength: number) {
      const v = Math.max(0, strength);
      // pulseAmt survives at a fraction of its old weight: the reach should
      // still breathe a little with the music, it just should not BE the
      // gesture any more.
      pulseAmt = Math.min(1.5, pulseAmt + v * 0.35);
      crack = Math.min(1, crack + v);
      splash = Math.min(1.4, splash + v * 0.9);
    },
    strike(x: number, y: number, strength: number) {
      const a = Math.max(0, Math.min(1, strength));
      if (a < 0.02) return;
      // Hard ceiling on concurrent fronts. A slot firing faster than they
      // retire would otherwise turn the per-star loop into a cost that grows
      // without bound — the same failure the sample layer had in SC, and the
      // reason that one saturated.
      if (ripples.length >= 5) ripples.shift();
      ripples.push({ x, y, r: 0, amp: a });
    },
    spotlight(index: number, strength: number) {
      const a = Math.max(0, Math.min(1, strength));
      const animal = ANIMALS[((index % ANIMALS.length) + ANIMALS.length) % ANIMALS.length];
      for (const inst of instances) {
        if (inst.animal === animal) inst.spot = Math.max(inst.spot, a);
      }
    },
    setNav: () => { /* always on — kept so the handle type stays stable */ },
    navigating: () => true,
    resize() {
      cacheRect();
      resize();
      layout();
    },
    destroy() {
      dead = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      host.removeEventListener("mousemove", onMove);
      host.removeEventListener("mouseleave", onLeave);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onDrag);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keydown", onAltDown);
      window.removeEventListener("keyup", onAltUp);
      window.removeEventListener("blur", onBlur);
      host.style.cursor = prevCursor;
      canvas.remove();
    },
  };
}
