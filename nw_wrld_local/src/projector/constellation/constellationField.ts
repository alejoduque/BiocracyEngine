// ─── Constellation Field ────────────────────────────────────────────────────
//
// The drifting-node backdrop behind slots 5-9. Ported from the
// @designcodeio/threeui `ConstellationField` (MIT, https://threeui.com) —
// specifically its `constellation-field` variant, whose source really is the
// plain canvas script the component ships as a string and rewrites with a
// handful of literal replacements before mounting it in a frame.
//
// WHAT THIS IS NOT
// ----------------
// Despite the name and the `constellationCanvas` id it carries, the effect is
// not a shader and not three.js. It is Canvas2D: drifting points, a link drawn
// between any pair closer than LINK, and a soft halo under each node. Nothing
// in the reference imports three, which is the whole reason this could be
// ported instead of depended on — see camara/crt.ts for the same finding about
// the CRT, and for why 54.5 MB and two extra copies of three.js are not worth
// paying for a file like this one.
//
// The reference's `patch()` reaches into its own source with string
// replacement to bind the knobs. Those exact patch points are parameters here:
//
//   length      → LINK           (160 * length)
//   density     → MAX_NODES      (85, or 40 when narrow, * density)
//   size        → node radius    ((rand*2.4+1.8) * size)
//   strokeWidth → ctx.lineWidth
//   speed       → per-frame velocity multiplier
//   mode        → dark #E6C879 / light #8B6914
//   hue/saturation/brightness/opacity → CSS filter on the canvas, which is
//                where the reference puts them too rather than in the paint.
//
// WHAT IS ADDED
// -------------
// Two things the reference has no notion of, because it is a landing-page
// background and this is an instrument:
//
//   drive()  live parameters, so the field is the slot's own voice rather
//            than decoration running beside it.
//   pulse()  an onset. The engine's attacks reach the field as a brief
//            widening of LINK and a brightening of the nodes, so the network
//            visibly gathers on a note and relaxes after it.
//
// It also sizes to its host element rather than to the window: the reference
// is a full-page fixed background, and slots live inside a stage.

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

type Node = { x: number; y: number; vx: number; vy: number; radius: number };

export type ConstellationHandle = {
  drive: (p: Partial<ConstellationParams>) => void;
  /** Register an attack. `strength` 0-1; decays on its own. */
  pulse: (strength: number) => void;
  resize: () => void;
  destroy: () => void;
  canvas: HTMLCanvasElement;
};

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

  const ctx = canvas.getContext("2d");
  if (!ctx) {
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
  let nodes: Node[] = [];
  let raf = 0;
  let dead = false;
  let pulseAmt = 0;
  const pointer = { x: -1000, y: -1000 };

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function applyFilter() {
    canvas.style.opacity = String(p.opacity);
    canvas.style.filter =
      `hue-rotate(${p.hue}deg) saturate(${p.saturation}) brightness(${p.brightness})`;
  }

  function maxNodes(): number {
    // Reference: 40 under 768px, else 85 — but measured on the host, since a
    // slot can be narrow on a wide display.
    const base = width < 768 ? 40 : 85;
    return Math.max(6, Math.round(base * p.density));
  }

  function resize() {
    const r = host.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, Math.round(r.width));
    height = Math.max(1, Math.round(r.height));
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.imageSmoothingEnabled = false;
  }

  function initNodes() {
    const n = maxNodes();
    nodes = [];
    for (let i = 0; i < n; i++) {
      nodes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        radius: (Math.random() * 2.4 + 1.8) * p.size,
      });
    }
  }

  const onMove = (e: MouseEvent) => {
    const r = host.getBoundingClientRect();
    pointer.x = e.clientX - r.left;
    pointer.y = e.clientY - r.top;
  };
  const onLeave = () => {
    pointer.x = -1000;
    pointer.y = -1000;
  };
  host.addEventListener("mousemove", onMove);
  host.addEventListener("mouseleave", onLeave);

  function frame() {
    if (dead) return;
    const c = ctx!;
    c.clearRect(0, 0, width, height);
    c.lineCap = "butt";
    c.lineJoin = "miter";

    // An attack widens the reach of every node, so the network gathers on the
    // note and lets go after it. Decay is per-frame and frame-rate naive, the
    // same way the reference's own pulse term is.
    pulseAmt *= 0.94;
    const link = 160 * p.length * (1 + pulseAmt * 0.5);
    const ink = INK[p.mode];

    // Links first, so nodes sit crisp on top — the reference's ordering.
    c.strokeStyle = ink;
    c.lineWidth = Math.max(0.25, p.strokeWidth);
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
        if (d < link) {
          c.globalAlpha = (0.22 + (1 - d / link) * 0.55) * (1 + pulseAmt * 0.6);
          c.beginPath();
          c.moveTo(nodes[i].x, nodes[i].y);
          c.lineTo(nodes[j].x, nodes[j].y);
          c.stroke();
        }
      }
    }

    const now = Date.now();
    for (const node of nodes) {
      node.x += node.vx * p.speed;
      node.y += node.vy * p.speed;

      if (node.x < 0 || node.x > width) node.vx *= -1;
      if (node.y < 0 || node.y > height) node.vy *= -1;

      const pd = Math.hypot(node.x - pointer.x, node.y - pointer.y);
      if (pd < 220) {
        node.x -= (node.x - pointer.x) * 0.005;
        node.y -= (node.y - pointer.y) * 0.005;
      }

      // Core plus soft halo, so a node still reads at retina scale.
      const pulse = (0.78 + Math.sin(now * 0.001 + node.x) * 0.22) * (1 + pulseAmt * 0.5);
      c.fillStyle = ink;
      c.globalAlpha = Math.min(1, pulse * 0.28);
      c.beginPath();
      c.arc(node.x, node.y, node.radius * 2.4, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = Math.min(1, pulse);
      c.beginPath();
      c.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      c.fill();
    }

    c.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  }

  applyFilter();
  resize();
  initNodes();
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
      const prevSize = p.size;
      const densityChanged =
        next.density !== undefined && Math.abs(next.density - p.density) > 0.02;
      const sizeChanged = next.size !== undefined && Math.abs(next.size - p.size) > 0.02;
      Object.assign(p, next);
      applyFilter();
      // Node count and radius are baked at spawn, so a real change to either
      // has to respawn. Thresholded because these are driven from live audio
      // and rebuilding the field every frame would strobe it.
      if (densityChanged) initNodes();
      else if (sizeChanged) {
        // Rescale in place rather than respawn, so a size move does not
        // teleport the whole field. Must divide by the size the radii were
        // baked at, not the one just assigned.
        const k = p.size / Math.max(0.01, prevSize);
        for (const n of nodes) n.radius *= k;
      }
    },
    pulse(strength: number) {
      pulseAmt = Math.min(1.5, pulseAmt + Math.max(0, strength));
    },
    resize() {
      resize();
      initNodes();
    },
    destroy() {
      dead = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      host.removeEventListener("mousemove", onMove);
      host.removeEventListener("mouseleave", onLeave);
      canvas.remove();
    },
  };
}
