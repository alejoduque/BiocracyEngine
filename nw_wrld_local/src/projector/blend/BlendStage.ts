// BlendStage.ts — the blended space, built around the audience
// ===========================================================================
// Conceptual blending (Fauconnier & Turner): two INPUT spaces with a
// cross-space mapping between their counterparts, a GENERIC space holding the
// structure both share, and the BLEND, where the two are projected together
// and something neither has on its own appears. Here the inputs are the two
// halves of this engine:
//
//   neuronal · bosque   the forest corpus, the species, the phenological year
//   silicio · cadena    Ethereum mainnet, through eth_sonify.py → SC → bridge
//
// The world is laid out on the dome itself (manim/domeLayout.ts): the audience
// at the origin, scene.userData.domeEye set so the domemaster puts the dome's
// camera there and not at the flat camera. On the dome:
//
//            generic      el 72°, front, near the zenith
//   neuronal     ·     silicio    az ∓62°, el 26°
//              blend      el 32°, front — clear of the dome title at 12°
//
// The flat screen sees the same world from behind the audience, as a diagram.
//
// A stage supplies `build`, which receives the four space groups (each a panel
// facing the centre, content in its local XY plane, world units) and returns a
// per-frame tick. Formulas are manim's (manim/), written and transformed on
// the page's clock, so the offline renderer plays them in time.

import * as THREE from "three";
import { showStage, type Viz } from "../visualizationSwitcher";
import { Animator, Write, FadeIn } from "../manim/animate";
import { TexMobject, type TexOptions } from "../manim/vmobject";
import { Arrow, Segments, roundedRect } from "../manim/geometry";
import { placeOnDome, angularSize, domeDir } from "../manim/domeLayout";
import { getVizMotion } from "../vizMotion";

export type SpaceKey = "neuronal" | "silicon" | "generic" | "blend";

/** Radius of the sphere the panels sit on, world units. */
export const R = 10;
/** World units per em: a line of formula about 2.4° tall at R. */
export const EM = angularSize(2.4, R);

export const SPACES: Record<SpaceKey, { az: number; el: number; w: number; h: number }> = {
  neuronal: { az: -62, el: 26, w: angularSize(48, R), h: angularSize(32, R) },
  silicon:  { az:  62, el: 26, w: angularSize(48, R), h: angularSize(32, R) },
  generic:  { az:   0, el: 72, w: angularSize(46, R), h: angularSize(13, R) },
  blend:    { az:   0, el: 32, w: angularSize(58, R), h: angularSize(32, R) },
};

export const INK = {
  bg: 0x000804,
  neuronal: 0x7fd6b0,   // green: membrane, leaf
  silicon: 0xffa040,    // amber: the chain, as everywhere in this engine
  generic: 0xb8c4bc,
  blend: 0xf2efe6,
  accent: 0xffe680,
  dim: 0x4c5a52,
};

export type BlendContext = {
  scene: THREE.Scene;
  animator: Animator;
  spaces: Record<SpaceKey, THREE.Group>;
  /** Typeset and add to a space (not yet written: call write()). */
  tex: (space: SpaceKey, src: string, o?: TexOptions & { at?: [number, number] }) => Promise<TexMobject>;
  /** Write formulas in with manim's Write. */
  write: (...t: TexMobject[]) => Promise<void>;
  /** A point in a space's local coordinates, in world space. */
  toWorld: (space: SpaceKey, x: number, y: number) => THREE.Vector3;
};

export type BlendBuild = (ctx: BlendContext) => Promise<{
  tick: (dt: number, t: number) => void;
  destroy?: () => void;
}>;

export function mountBlendStage(stageEl: HTMLElement, o: {
  key: string; name: string;
  labels: Record<SpaceKey, string>;
  build: BlendBuild;
}): Viz {
  showStage(stageEl);
  let destroyed = false;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setClearColor(INK.bg, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  stageEl.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // The dome's seat: see dome/domemaster.ts, renderFrame.
  scene.userData.domeEye = new THREE.Vector3(0, 0, 0);
  scene.userData.domeForward = new THREE.Vector3(0, 0, -1);

  // The flat view: from behind and a little above the audience, wide enough
  // to hold both inputs, the generic space above and the blend below.
  const camera = new THREE.PerspectiveCamera(56, 16 / 9, 0.1, 200);
  const home = new THREE.Vector3(0, 4.6, 14.5);
  const aim = new THREE.Vector3(0, 5.6, -6);
  camera.position.copy(home);
  camera.lookAt(aim);

  const resize = () => {
    const w = stageEl.offsetWidth || 800, h = stageEl.offsetHeight || 450;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener("resize", resize);

  // ── The four spaces ──────────────────────────────────────────────────────
  const spaces = {} as Record<SpaceKey, THREE.Group>;
  const frames: Segments[] = [];
  for (const k of Object.keys(SPACES) as SpaceKey[]) {
    const s = SPACES[k];
    const g = new THREE.Group();
    placeOnDome(g, s.az, s.el, R);
    scene.add(g);
    spaces[k] = g;
    const frame = roundedRect(s.w, s.h, EM * 0.6, k === "blend" ? INK.blend : INK.dim, EM * 0.035, k === "blend" ? 0.55 : 0.45);
    frame.visible = false;
    g.add(frame);
    frames.push(frame);
  }
  scene.updateMatrixWorld(true);

  const animator = new Animator();
  const toWorld = (space: SpaceKey, x: number, y: number) =>
    spaces[space].localToWorld(new THREE.Vector3(x, y, 0));

  const ctx: BlendContext = {
    scene, animator, spaces, toWorld,
    async tex(space, src, opt = {}) {
      const m = await TexMobject.create(src, { size: EM, color: INK.blend, stroke: EM * 0.03, ...opt });
      if (opt.at) m.position.set(opt.at[0], opt.at[1], 0.01);
      for (const g of m.glyphs) g.setAlpha(0, 0);
      spaces[space].add(m);
      return m;
    },
    write(...t) {
      return animator.play(new Write(t.flatMap((m) => m.glyphs)), 0.9 + 0.022 * t.reduce((n, m) => n + m.glyphs.length, 0));
    },
  };

  // ── Titles, and the diagram's own arrows ─────────────────────────────────
  // Projection: each input sends its counterparts down into the blend, and
  // shares its structure up with the generic space — straight 3-D chords, which
  // from the centre are seen along great circles. Cross-space mapping: a dashed
  // arc at constant elevation between the two inputs, above the blend and
  // below the generic space.
  const arrows: Arrow[] = [];
  const edge = (k: SpaceKey, sx: number, sy: number) =>
    toWorld(k, (SPACES[k].w / 2) * sx, (SPACES[k].h / 2) * sy);
  const diagram: Array<[THREE.Vector3, THREE.Vector3, number, boolean]> = [
    [edge("neuronal", 0.6, -0.55), edge("blend", -0.92, 0.2), INK.neuronal, false],
    [edge("silicon", -0.6, -0.55), edge("blend", 0.92, 0.2), INK.silicon, false],
    [edge("neuronal", 0.4, 1.0), edge("generic", -1.0, -0.2), INK.generic, false],
    [edge("silicon", -0.4, 1.0), edge("generic", 1.0, -0.2), INK.generic, false],
  ];
  const mapping = new Segments(48, INK.generic, EM * 0.035, 0, true);
  {
    const pts: THREE.Vector3[] = [];
    const az0 = SPACES.neuronal.az + 25, az1 = SPACES.silicon.az - 25;
    for (let i = 0; i <= 48; i++) pts.push(domeDir(az0 + (i / 48) * (az1 - az0), 50).multiplyScalar(R * 0.98));
    mapping.setPolyline(pts);
  }
  scene.add(mapping);
  for (const [a, b, color, dashed] of diagram) {
    const ar = new Arrow(a, b, { color, width: EM * 0.04, dashed, opacity: 0 });
    ar.setEnds(a, b, new THREE.Vector3());
    scene.add(ar);
    arrows.push(ar);
  }

  let tick: ((dt: number, t: number) => void) | null = null;
  let stageDestroy: (() => void) | undefined;

  (async () => {
    const titles = await Promise.all((Object.keys(o.labels) as SpaceKey[]).map((k) =>
      ctx.tex(k, `\\text{${o.labels[k]}}`.replace(/\\text\{([^}]*)\\cdot([^}]*)\}/, "\\text{$1}\\;\\cdot\\;\\text{$2}"), {
        size: EM * 0.62,
        color: k === "neuronal" ? INK.neuronal : k === "silicon" ? INK.silicon : k === "blend" ? INK.blend : INK.generic,
        at: [0, SPACES[k].h / 2 - EM * 0.65],
      })));
    if (destroyed) return;
    for (const f of frames) f.visible = true;
    animator.play(new FadeIn(frames), 1.0);
    void ctx.write(...titles);
    animator.play({
      begin() { /* */ },
      interpolate(a: number) { for (const ar of arrows) ar.setOpacity(a * 0.7); mapping.material.opacity = a * 0.6; },
      finish() { for (const ar of arrows) ar.setOpacity(0.7); mapping.material.opacity = 0.6; },
    }, 1.6, undefined, 0.8);
    const built = await o.build(ctx);
    if (destroyed) { built.destroy?.(); return; }
    tick = built.tick;
    stageDestroy = built.destroy;
  })().catch((e) => console.error(`[blend ${o.key}] build failed:`, e));

  // ── Loop ─────────────────────────────────────────────────────────────────
  let raf = 0;
  let last = performance.now();
  const frame = () => {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    animator.tick();
    try { tick?.(dt, now / 1000); } catch (e) { console.warn(`[blend ${o.key}] tick:`, e); }
    // The shared idle drift, as a slow sway of the flat view only — the dome's
    // seat never moves.
    const vm = getVizMotion();
    const sway = Math.sin(now / 1000 * 0.07) * 0.9 * Math.min(1, vm.speed * 40 + 0.2);
    camera.position.set(home.x + sway, home.y, home.z);
    camera.lookAt(aim);
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);

  return {
    name: o.name,
    key: o.key,
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      animator.clear();
      try { stageDestroy?.(); } catch { /* ignore */ }
      window.removeEventListener("resize", resize);
      scene.traverse((n: any) => {
        if (typeof n.dispose === "function" && n !== scene) { try { n.dispose(); } catch { /* ignore */ } }
        n.geometry?.dispose?.();
        const m = n.material;
        for (const mat of Array.isArray(m) ? m : m ? [m] : []) mat.dispose?.();
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
