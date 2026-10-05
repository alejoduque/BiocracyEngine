// animate.ts — manim's animations, on the page's own clock
// ===========================================================================
// Time is performance.now(), read when the slot ticks the Animator once per
// frame. Under ?render=1 that clock is renderMode.ts's virtual one, so an
// offline render plays every Write and Transform exactly in time with the
// recorded session.
//
// The animations do what manim's do:
//   Write       the outline is drawn glyph by glyph, then the fill comes in
//               and the outline goes
//   FadeIn/Out  alpha, with an optional drift
//   Transform   one set of glyphs' contours morph into another's; their
//               counts are aligned first, as manim's align_points does
//   TransformMatchingParts   parts with the same \class key morph into each
//               other; the rest fade
//   Indicate    a swell in size and colour and back
//   Flash       lines bursting from a point
// Rate functions are ManimGL's.

import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { K, VMobject } from "./vmobject";

// ── Rate functions (manimlib/utils/rate_functions.py) ───────────────────────
export type Rate = (t: number) => number;
export const linear: Rate = (t) => t;
export const smooth: Rate = (t) => { const s = 1 - t; return t * t * t * (10 * s * s + 5 * s * t + t * t); };
export const rushInto: Rate = (t) => 2 * smooth(t / 2);
export const rushFrom: Rate = (t) => 2 * smooth(t / 2 + 0.5) - 1;
export const thereAndBack: Rate = (t) => smooth(t < 0.5 ? 2 * t : 2 * (1 - t));
export const doubleSmooth: Rate = (t) => (t < 0.5 ? 0.5 * smooth(2 * t) : 0.5 * (1 + smooth(2 * t - 1)));

export interface Animation {
  begin(): void;
  interpolate(alpha: number): void;
  finish(): void;
}

type Running = { anim: Animation; t0: number; dur: number; rate: Rate; resolve: () => void; begun: boolean };

/** The slot's clock: runs animations and per-frame updaters. Call tick() once per frame. */
export class Animator {
  private running: Running[] = [];
  private updaters = new Set<(dt: number, t: number) => void>();
  private last = -1;

  play(anim: Animation, runTime = 1, rate: Rate = smooth, delay = 0): Promise<void> {
    return new Promise((resolve) => {
      this.running.push({ anim, t0: performance.now() + delay * 1000, dur: Math.max(1e-3, runTime) * 1000, rate, resolve, begun: false });
    });
  }

  /** A function run every frame with (dt seconds, t seconds). Returns its remover. */
  addUpdater(fn: (dt: number, t: number) => void): () => void {
    this.updaters.add(fn);
    return () => { this.updaters.delete(fn); };
  }

  tick() {
    const now = performance.now();
    const dt = this.last < 0 ? 1 / 60 : Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    for (const u of this.updaters) u(dt, now / 1000);
    const still: Running[] = [];
    for (const r of this.running) {
      if (now < r.t0) { still.push(r); continue; }
      if (!r.begun) { r.anim.begin(); r.begun = true; }
      const a = Math.min(1, (now - r.t0) / r.dur);
      r.anim.interpolate(r.rate(a));
      if (a >= 1) { r.anim.finish(); r.resolve(); } else still.push(r);
    }
    this.running = still;
  }

  /** Finish everything at once (a slot leaving). */
  clear() {
    for (const r of this.running) { if (!r.begun) r.anim.begin(); r.anim.finish(); r.resolve(); }
    this.running = [];
    this.updaters.clear();
  }
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

// ── Write ────────────────────────────────────────────────────────────────────
/** Glyph by glyph: the pen draws each outline, the fill follows, the outline lifts. */
export class Write implements Animation {
  constructor(private vms: VMobject[], private lag = 0.6, private keepStroke = 0) {}
  private local(i: number, a: number) {
    const n = this.vms.length;
    const span = 1 / (1 + this.lag * (n - 1) / Math.max(1, n));
    const start = n > 1 ? (i / (n - 1)) * (1 - span) : 0;
    return clamp01((a - start) / span);
  }
  begin() { for (const v of this.vms) { v.visible = true; v.setDrawn(0); v.setAlpha(1, 0); } }
  interpolate(a: number) {
    this.vms.forEach((v, i) => {
      const t = this.local(i, a);
      v.setDrawn(clamp01(t / 0.6));
      const f = smooth(clamp01((t - 0.5) / 0.5));
      v.setAlpha(1 - f * (1 - this.keepStroke), f);
    });
  }
  finish() { for (const v of this.vms) { v.setDrawn(1); v.setAlpha(this.keepStroke, 1); } }
}

/** Write, played backwards: the fill goes and the pen un-draws. */
export class Unwrite extends Write {
  interpolate(a: number) { super.interpolate(1 - a); }
  finish() { super.interpolate(0); }
}

// ── Fades ────────────────────────────────────────────────────────────────────
export class FadeIn implements Animation {
  private base: THREE.Vector3[] = [];
  constructor(private objs: THREE.Object3D[], private shift = new THREE.Vector3()) {}
  begin() {
    this.base = this.objs.map((o) => o.position.clone());
    for (const o of this.objs) o.visible = true;
  }
  interpolate(a: number) {
    this.objs.forEach((o, i) => {
      o.position.copy(this.base[i]).addScaledVector(this.shift, a - 1);
      setOpacity(o, a);
    });
  }
  finish() { this.interpolate(1); }
}

export class FadeOut implements Animation {
  private base: THREE.Vector3[] = [];
  constructor(private objs: THREE.Object3D[], private shift = new THREE.Vector3(), private hide = true) {}
  begin() { this.base = this.objs.map((o) => o.position.clone()); }
  interpolate(a: number) {
    this.objs.forEach((o, i) => {
      o.position.copy(this.base[i]).addScaledVector(this.shift, a);
      setOpacity(o, 1 - a);
    });
  }
  finish() {
    this.objs.forEach((o, i) => { o.position.copy(this.base[i]); if (this.hide) o.visible = false; setOpacity(o, this.hide ? 1 : 0); });
  }
}

/** Alpha for anything: VMobjects keep their outline/fill balance, other meshes their material opacity. */
export function setOpacity(o: THREE.Object3D, a: number) {
  o.traverse((n) => {
    if (n instanceof VMobject) {
      const k = (n.userData.__restAlpha ??= n.alphas);
      n.setAlpha(k.stroke * a, k.fill * a);
    } else if ((n as any).isMesh || (n as any).isLine || (n as any).isPoints) {
      const m = (n as any).material;
      for (const mat of Array.isArray(m) ? m : [m]) {
        if (!mat) continue;
        mat.transparent = true;
        mat.userData.__restOpacity ??= mat.opacity;
        mat.opacity = mat.userData.__restOpacity * a;
      }
    }
  });
}

// ── Transform ────────────────────────────────────────────────────────────────
function centroid(c: THREE.Vector3[]) {
  const p = new THREE.Vector3();
  for (const q of c) p.add(q);
  return p.multiplyScalar(1 / Math.max(1, c.length));
}

/**
 * Give two contour lists the same length. The shorter one's contours are
 * reused in proportion, so every contour of the longer one has a partner
 * near where it ought to come from (manim duplicates submobjects the same way).
 */
function align(a: THREE.Vector3[][], b: THREE.Vector3[][]): [THREE.Vector3[][], THREE.Vector3[][]] {
  const n = Math.max(a.length, b.length);
  const pick = (src: THREE.Vector3[][], i: number) =>
    src.length === 0 ? Array.from({ length: K }, () => new THREE.Vector3())
      : src[Math.min(src.length - 1, Math.floor((i * src.length) / n))].map((p) => p.clone());
  return [Array.from({ length: n }, (_, i) => pick(a, i)), Array.from({ length: n }, (_, i) => pick(b, i))];
}

/**
 * Morph one set of glyphs into another. A temporary outline does the moving
 * (in `parent`'s space); the source's fill fades through the first half, the
 * target's comes in through the second, and the target is left in place.
 */
export class Transform implements Animation {
  private morph: VMobject | null = null;
  private A: THREE.Vector3[][] = [];
  private B: THREE.Vector3[][] = [];
  constructor(private from: VMobject[], private to: VMobject[], private parent: THREE.Object3D,
              private color?: THREE.ColorRepresentation, private width = 0.02) {}
  begin() {
    const inv = new THREE.Matrix4().copy(this.parent.matrixWorld).invert();
    const toLocal = (cs: THREE.Vector3[][]) => cs.map((c) => c.map((p) => p.applyMatrix4(inv)));
    const a = toLocal(this.from.flatMap((v) => v.worldContours()));
    const b = toLocal(this.to.flatMap((v) => v.worldContours()));
    [this.A, this.B] = align(a, b);
    this.morph = new VMobject(this.A.map((c) => c.map((p) => p.clone())), null, {
      stroke: {
        color: this.color ?? (this.to[0]?.strokeMat.color ?? 0xffffff),
        width: this.to[0]?.strokeMat.linewidth ?? this.width, opacity: 1,
      },
    });
    this.parent.add(this.morph);
    for (const v of this.to) { v.visible = true; v.setAlpha(0, 0); }
  }
  interpolate(a: number) {
    if (!this.morph) return;
    this.morph.setContours(this.A.map((c, i) => c.map((p, j) => p.clone().lerp(this.B[i][j], a))));
    const out = clamp01(1 - a * 2), inn = clamp01(a * 2 - 1);
    for (const v of this.from) v.setAlpha(0, out);
    for (const v of this.to) v.setAlpha(0, inn);
  }
  finish() {
    if (this.morph) { this.parent.remove(this.morph); this.morph.dispose(); this.morph = null; }
    for (const v of this.from) { v.visible = false; v.setAlpha(0, 1); }
    for (const v of this.to) { v.visible = true; v.setDrawn(1); v.setAlpha(0, 1); }
  }
}

/** Parts with the same \class key morph into each other; the rest fade out and in. */
export class TransformMatchingParts implements Animation {
  private parts: Animation[] = [];
  constructor(from: VMobject[], to: VMobject[], parent: THREE.Object3D) {
    const keys = new Set(from.map((v) => v.part).filter((k): k is string => !!k));
    const matched = [...keys].filter((k) => to.some((v) => v.part === k));
    for (const k of matched) {
      this.parts.push(new Transform(from.filter((v) => v.part === k), to.filter((v) => v.part === k), parent));
    }
    const fOut = from.filter((v) => !v.part || !matched.includes(v.part));
    const fIn = to.filter((v) => !v.part || !matched.includes(v.part));
    // The rest are not forced into each other (that is what Transform would
    // do): they fade, through the fill, as manim's matching transforms do.
    if (fOut.length) this.parts.push(new FadeGlyphs(fOut, false));
    if (fIn.length) this.parts.push(new FadeGlyphs(fIn, true));
  }
  begin() { for (const p of this.parts) p.begin(); }
  interpolate(a: number) { for (const p of this.parts) p.interpolate(a); }
  finish() { for (const p of this.parts) p.finish(); }
}

/** Glyphs in or out through their fill alone (outline lifted), leaving them settled. */
export class FadeGlyphs implements Animation {
  constructor(private vms: VMobject[], private into: boolean) {}
  begin() { for (const v of this.vms) { v.visible = true; v.setDrawn(1); v.setAlpha(0, this.into ? 0 : 1); } }
  interpolate(a: number) { for (const v of this.vms) v.setAlpha(0, this.into ? a : 1 - a); }
  finish() {
    for (const v of this.vms) { v.setAlpha(0, 1); if (!this.into) v.visible = false; }
  }
}

// ── Emphasis ─────────────────────────────────────────────────────────────────
/** A swell: scale up and toward `color`, then back (thereAndBack is built in). */
export class Indicate implements Animation {
  private s0: THREE.Vector3[] = [];
  private c0: THREE.Color[][] = [];
  private target: THREE.Color;
  constructor(private vms: VMobject[], color: THREE.ColorRepresentation = 0xffe680, private scale = 1.2) {
    this.target = new THREE.Color(color);
  }
  begin() {
    this.s0 = this.vms.map((v) => v.scale.clone());
    this.c0 = this.vms.map((v) => [v.fillMat.color.clone(), v.strokeMat.color.clone()]);
  }
  interpolate(a: number) {
    const k = thereAndBack(a);
    this.vms.forEach((v, i) => {
      v.scale.copy(this.s0[i]).multiplyScalar(1 + (this.scale - 1) * k);
      v.fillMat.color.copy(this.c0[i][0]).lerp(this.target, k);
      v.strokeMat.color.copy(this.c0[i][1]).lerp(this.target, k);
    });
  }
  finish() { this.interpolate(1); }
}

/** Lines bursting outward from a point, in `parent`'s space, facing +Z. */
export class Flash implements Animation {
  private line: LineSegments2 | null = null;
  private mat: LineMaterial | null = null;
  private geo: LineSegmentsGeometry | null = null;
  constructor(private parent: THREE.Object3D, private at: THREE.Vector3,
              private color: THREE.ColorRepresentation = 0xffe680, private radius = 0.6,
              private lines = 12, private width = 0.02) {}
  begin() {
    this.geo = new LineSegmentsGeometry();
    this.geo.setPositions(new Float32Array(this.lines * 6));
    this.mat = new LineMaterial({ color: this.color, linewidth: this.width, worldUnits: true, transparent: true, depthWrite: false });
    this.mat.resolution.set(1024, 1024);
    this.line = new LineSegments2(this.geo, this.mat);
    this.line.frustumCulled = false;
    this.line.position.copy(this.at);
    this.parent.add(this.line);
  }
  interpolate(a: number) {
    if (!this.geo || !this.mat) return;
    // the burst leaves the centre and thins out as it goes (manim's Flash)
    const r1 = this.radius * (0.25 + 0.75 * a), r0 = this.radius * Math.max(0.25, a * 1.1 - 0.1);
    // written into the existing buffer: setPositions would allocate a new one every frame
    const attr = this.geo.getAttribute("instanceStart") as THREE.InterleavedBufferAttribute;
    const arr = attr.data.array as Float32Array;
    for (let i = 0; i < this.lines; i++) {
      const th = (i / this.lines) * Math.PI * 2;
      const c = Math.cos(th), s = Math.sin(th);
      arr.set([c * Math.min(r0, r1), s * Math.min(r0, r1), 0, c * r1, s * r1, 0], i * 6);
    }
    attr.data.needsUpdate = true;
    this.mat.opacity = 1 - a;
  }
  finish() {
    if (this.line) { this.parent.remove(this.line); this.geo!.dispose(); this.mat!.dispose(); this.line = null; }
  }
}
