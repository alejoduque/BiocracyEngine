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
  resize: () => void;
  destroy: () => void;
  canvas: HTMLCanvasElement;
};

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
  /** Per-instance size variation, so a field does not look stamped. */
  sizeVar: number;
  /** 0-1, eased toward the pointer's proximity. */
  reveal: number;
  /** Phase offset so stars do not twinkle in unison. */
  phase: number;
};

/** Faint background scatter. Not linked to anything — these are just stars. */
type Dust = { x: number; y: number; vx: number; vy: number; r: number };

export function mountConstellationField(
  host: HTMLElement,
  init: Partial<ConstellationParams> = {},
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
    "pointer-events:none;mix-blend-mode:screen;";
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
  const pointer = { x: -1e5, y: -1e5, vx: 0, vy: 0 };

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
  function cacheRect() {
    const r = host.getBoundingClientRect();
    hostLeft = r.left;
    hostTop = r.top;
  }
  host.addEventListener("mousemove", onMove);
  host.addEventListener("mouseleave", onLeave);
  window.addEventListener("scroll", cacheRect, true);

  function frame() {
    if (dead) return;
    const c = ctx!;
    c.clearRect(0, 0, width, height);
    c.lineCap = "round";
    c.lineJoin = "round";

    // An attack widens the reach and brightens the stars, so the field gathers
    // on the note and lets go after it. Decay is per-frame and frame-rate
    // naive, the same way the reference's own pulse term is.
    pulseAmt *= 0.94;
    const ink = INK[p.mode];
    const now = Date.now();
    const scale = figureScale(instances.length);
    // The sweep decays here rather than in onMove, because mousemove simply
    // stops firing when the pointer halts — without this the field would stay
    // elongated forever at the last velocity it saw.
    pointer.vx *= 0.88;
    pointer.vy *= 0.88;
    const sweep = Math.hypot(pointer.vx, pointer.vy);
    // ~26 px between smoothed samples is a brisk sweep; past that it saturates.
    const sweepN = Math.min(1, sweep / 26);
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
      c.arc(d.x, d.y, d.r * p.size, 0, Math.PI * 2);
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

      const dx = pointer.x - px0;
      const dy = pointer.y - py0;
      const dist = Math.hypot(dx, dy);
      // Smoothstep so a figure neither snaps on nor has a visible corner as it
      // resolves. 1 at the centre of the pointer, 0 at the edge of its reach.
      const t = Math.max(0, Math.min(1, 1 - dist / reach));
      const target = t * t * (3 - 2 * t);
      // Asymmetric easing: resolves quickly under the cursor, releases slowly,
      // so sweeping across the field leaves a wake rather than a hard edge.
      const k = target > inst.reveal ? 0.16 : 0.045;
      inst.reveal += (target - inst.reveal) * k;
      const rev = inst.reveal;

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
      const pts = inst.animal.stars.map(([sx, sy]) => {
        // rotate into the figure's own orientation first
        const rx = (sx * cos - sy * sin) * s;
        const ry = (sx * sin + sy * cos) * s;
        // then decompose against the stretch axis and rescale each component
        const par = rx * ux + ry * uy;
        const per = -rx * uy + ry * ux;
        const pa = par * along;
        const pe = per * across;
        return [
          ox + pa * ux - pe * uy,
          oy + pa * uy + pe * ux,
        ] as [number, number];
      });

      // Bones first, so stars sit crisp on top — the reference's ordering.
      if (rev > 0.004) {
        c.strokeStyle = ink;
        c.lineWidth = Math.max(0.3, p.strokeWidth * (0.55 + rev * 0.75));
        c.globalAlpha = rev * (0.30 + rev * 0.45) * (1 + pulseAmt * 0.5);
        c.beginPath();
        for (const [a, b] of inst.animal.edges) {
          c.moveTo(pts[a][0], pts[a][1]);
          c.lineTo(pts[b][0], pts[b][1]);
        }
        c.stroke();
      }

      // Stars. Visible even at reveal 0 — the animal is always there; the
      // pointer only decides whether you can read it.
      c.fillStyle = ink;
      for (let i = 0; i < pts.length; i++) {
        const tw = 0.78 + Math.sin(now * 0.0012 + inst.phase + i * 0.7) * 0.22;
        const r = (1.1 + rev * 1.5) * p.size * tw;
        const a = (0.20 + rev * 0.68) * tw * (1 + pulseAmt * 0.5);
        c.globalAlpha = Math.min(1, a * 0.30);
        c.beginPath();
        c.arc(pts[i][0], pts[i][1], r * 2.6, 0, Math.PI * 2);
        c.fill();
        c.globalAlpha = Math.min(1, a);
        c.beginPath();
        c.arc(pts[i][0], pts[i][1], r, 0, Math.PI * 2);
        c.fill();
      }

      // The name, once the figure is legible enough to deserve one.
      if (rev > 0.34) {
        const la = Math.min(1, (rev - 0.34) / 0.34);
        let maxY = -Infinity;
        for (const pt of pts) maxY = Math.max(maxY, pt[1]);
        c.textAlign = "center";
        c.textBaseline = "top";
        c.fillStyle = ink;
        c.globalAlpha = la * 0.92;
        c.font = `600 ${Math.round(11 + s * 0.045)}px ui-monospace, "SF Mono", Menlo, monospace`;
        c.fillText(inst.animal.common.toUpperCase(), ox, maxY + s * 0.16);
        c.globalAlpha = la * 0.55;
        c.font = `italic ${Math.round(9 + s * 0.035)}px ui-monospace, "SF Mono", Menlo, monospace`;
        c.fillText(inst.animal.latin, ox, maxY + s * 0.16 + Math.round(14 + s * 0.05));
      }
    }

    c.globalAlpha = 1;
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
      pulseAmt = Math.min(1.5, pulseAmt + Math.max(0, strength));
    },
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
      window.removeEventListener("scroll", cacheRect, true);
      host.style.cursor = prevCursor;
      canvas.remove();
    },
  };
}
