// vmobject.ts — manim's vectorised mobjects, in three.js
// ===========================================================================
// A VMobject is a set of closed contours, each resampled to K points by arc
// length so that any two can be morphed point for point (manim's
// align_points). It is drawn twice:
//   stroke  fat line segments in WORLD units (LineMaterial worldUnits), so a
//           line keeps its weight on every face of the dome's cube camera
//   fill    the glyph's shapes, triangulated once
// Stroke and fill each have a style opacity and an animated alpha on top; the
// animations in animate.ts move only the alphas and the drawn fraction.
//
// TexMobject is a formula: one VMobject per glyph, so a formula can be written
// glyph by glyph and its \class parts picked out. DecimalNumber shows a live
// value from a pool of prebuilt digit glyphs — a number that changes every
// frame never goes back to MathJax.

import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { tex, type TexResult } from "./tex";

// three carries no type declarations in this project: THREE is `any`, and a
// class extending `any` gets no members at all. The base is declared as what
// three's own Object3D is to every other file here — an object of any shape.
interface AnyObject3D { [key: string]: any }
export const Group3D = THREE.Group as unknown as { new (): AnyObject3D };

/** Points per contour. */
export const K = 32;

/** A closed polyline resampled to k points evenly spaced along its length. */
export function resample(pts: ArrayLike<THREE.Vector2 | THREE.Vector3>, k = K): THREE.Vector3[] {
  const n = pts.length;
  const P = Array.from({ length: n }, (_, i) => {
    const p = pts[i] as any;
    return new THREE.Vector3(p.x, p.y, p.z ?? 0);
  });
  if (n === 0) return Array.from({ length: k }, () => new THREE.Vector3());
  if (n === 1) return Array.from({ length: k }, () => P[0].clone());
  const cum = [0];
  for (let i = 1; i <= n; i++) cum.push(cum[i - 1] + P[i % n].distanceTo(P[i - 1]));
  const L = cum[n] || 1;
  const out: THREE.Vector3[] = [];
  let j = 0;
  for (let s = 0; s < k; s++) {
    const d = (s / k) * L;
    while (j < n - 1 && cum[j + 1] < d) j++;
    const seg = cum[j + 1] - cum[j] || 1;
    out.push(P[j].clone().lerp(P[(j + 1) % n], (d - cum[j]) / seg));
  }
  return out;
}

export type StrokeStyle = { color?: THREE.ColorRepresentation; width?: number; opacity?: number };
export type FillStyle = { color?: THREE.ColorRepresentation; opacity?: number };

export class VMobject extends Group3D {
  contours: THREE.Vector3[][];
  part: string | null = null;
  readonly strokeMat: LineMaterial;
  readonly fillMat: THREE.MeshBasicMaterial;
  private strokeGeo: LineSegmentsGeometry;
  private strokeLine: LineSegments2;
  private fillMesh: THREE.Mesh | null = null;
  private segCount: number;
  strokeOpacity = 1;
  fillOpacity = 0;
  private strokeAlpha = 1;
  private fillAlpha = 1;

  constructor(contours: THREE.Vector3[][], shapes: THREE.Shape[] | null = null, opts: {
    stroke?: StrokeStyle; fill?: FillStyle; fillGeometry?: THREE.BufferGeometry;
  } = {}) {
    super();
    this.contours = contours.map((c) => (c.length === K ? c : resample(c)));
    this.segCount = this.contours.length * K;
    this.strokeGeo = new LineSegmentsGeometry();
    this.strokeGeo.setPositions(this.segmentArray(this.contours));
    this.strokeMat = new LineMaterial({
      color: 0xffffff, linewidth: 0.02, worldUnits: true,
      transparent: true, depthWrite: false,
    });
    this.strokeMat.resolution.set(1024, 1024);
    this.strokeLine = new LineSegments2(this.strokeGeo, this.strokeMat);
    this.strokeLine.frustumCulled = false;
    this.strokeLine.renderOrder = 2;
    this.add(this.strokeLine);

    this.fillMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    const fg = opts.fillGeometry ?? (shapes && shapes.length ? new THREE.ShapeGeometry(shapes, 4) : null);
    if (fg) {
      this.fillMesh = new THREE.Mesh(fg, this.fillMat);
      this.fillMesh.renderOrder = 1;
      this.add(this.fillMesh);
    }
    this.setStroke(opts.stroke ?? {});
    this.setFill(opts.fill ?? {});
  }

  private segmentArray(contours: THREE.Vector3[][]): Float32Array {
    const a = new Float32Array(contours.length * K * 6);
    let o = 0;
    for (const c of contours) {
      for (let i = 0; i < K; i++) {
        const p = c[i], q = c[(i + 1) % K];
        a[o++] = p.x; a[o++] = p.y; a[o++] = p.z;
        a[o++] = q.x; a[o++] = q.y; a[o++] = q.z;
      }
    }
    return a;
  }

  /** Replace the contours in place (same count): the morph in Transform. */
  setContours(contours: THREE.Vector3[][]) {
    this.contours = contours;
    const attr = this.strokeGeo.getAttribute("instanceStart") as THREE.InterleavedBufferAttribute;
    const arr = attr.data.array as Float32Array;
    arr.set(this.segmentArray(contours));
    attr.data.needsUpdate = true;
  }

  setStroke(s: StrokeStyle) {
    if (s.color !== undefined) this.strokeMat.color.set(s.color);
    if (s.width !== undefined) this.strokeMat.linewidth = s.width;
    if (s.opacity !== undefined) this.strokeOpacity = s.opacity;
    this.applyAlpha();
    return this;
  }

  setFill(f: FillStyle) {
    if (f.color !== undefined) this.fillMat.color.set(f.color);
    if (f.opacity !== undefined) this.fillOpacity = f.opacity;
    this.applyAlpha();
    return this;
  }

  /** Animated multipliers on the style opacities (0–1). */
  setAlpha(stroke: number, fill: number) {
    this.strokeAlpha = stroke;
    this.fillAlpha = fill;
    this.applyAlpha();
  }
  get alphas() { return { stroke: this.strokeAlpha, fill: this.fillAlpha }; }

  private applyAlpha() {
    const so = this.strokeOpacity * this.strokeAlpha;
    const fo = this.fillOpacity * this.fillAlpha;
    this.strokeMat.opacity = so;
    this.strokeLine.visible = so > 0.002;
    this.fillMat.opacity = fo;
    if (this.fillMesh) this.fillMesh.visible = fo > 0.002;
  }

  /** Fraction of the stroke drawn, 0–1 — Write's pen. */
  setDrawn(frac: number) {
    this.strokeGeo.instanceCount = Math.round(THREE.MathUtils.clamp(frac, 0, 1) * this.segCount);
  }

  /** Contours in world space (for Transform across parents). */
  worldContours(): THREE.Vector3[][] {
    this.updateWorldMatrix(true, false);
    return this.contours.map((c) => c.map((p) => p.clone().applyMatrix4(this.matrixWorld)));
  }

  /** Centre of the contours, local. */
  centre(): THREE.Vector3 {
    const b = new THREE.Box3();
    for (const c of this.contours) for (const p of c) b.expandByPoint(p);
    return b.isEmpty() ? new THREE.Vector3() : b.getCenter(new THREE.Vector3());
  }

  dispose() {
    this.strokeGeo.dispose();
    this.strokeMat.dispose();
    this.fillMesh?.geometry.dispose();
    this.fillMat.dispose();
  }
}

// ── Formulas ─────────────────────────────────────────────────────────────────

export type TexOptions = {
  /** World units per em. */
  size?: number;
  color?: THREE.ColorRepresentation;
  /** Stroke width in world units. */
  stroke?: number;
  /** Where x = 0 sits: the formula's centre (default) or its left end. */
  align?: "center" | "left";
  /** Colours for \class parts, by key. */
  parts?: Record<string, THREE.ColorRepresentation>;
};

export class TexMobject extends Group3D {
  readonly glyphs: VMobject[] = [];
  readonly result: TexResult;
  readonly width: number;
  readonly height: number;

  private constructor(result: TexResult, o: TexOptions) {
    super();
    this.result = result;
    const size = o.size ?? 1;
    const dx = o.align === "left" ? -result.min.x : -(result.min.x + result.max.x) / 2;
    const dy = -(result.min.y + result.max.y) / 2;
    this.width = (result.max.x - result.min.x) * size;
    this.height = (result.max.y - result.min.y) * size;
    for (const g of result.glyphs) {
      const map = (p: THREE.Vector2) => new THREE.Vector3((p.x + dx) * size, (p.y + dy) * size, 0);
      const contours = g.outlines.map((c) => resample(c.map(map)));
      const shapes = g.shapes.map((s) => {
        const sh = new THREE.Shape(s.getPoints(4).map((p) => new THREE.Vector2((p.x + dx) * size, (p.y + dy) * size)));
        sh.holes = s.holes.map((h) => new THREE.Path(h.getPoints(4).map((p) => new THREE.Vector2((p.x + dx) * size, (p.y + dy) * size))));
        return sh;
      });
      const color = (g.part && o.parts?.[g.part]) ?? o.color ?? 0xffffff;
      const vm = new VMobject(contours, shapes, {
        stroke: { color, width: o.stroke ?? size * 0.02, opacity: 1 },
        fill: { color, opacity: 1 },
      });
      vm.part = g.part;
      this.glyphs.push(vm);
      this.add(vm);
    }
  }

  static async create(src: string, o: TexOptions = {}): Promise<TexMobject> {
    return new TexMobject(await tex(src), o);
  }

  /** The glyphs of one \class part. */
  part(key: string): VMobject[] { return this.glyphs.filter((g) => g.part === key); }

  /** The steady look of typeset text: filled, no outline (manim's Tex after Write). */
  settle() { for (const g of this.glyphs) g.setAlpha(0, 1); return this; }

  dispose() { for (const g of this.glyphs) g.dispose(); }
}

// ── Live numbers ─────────────────────────────────────────────────────────────

const NUM_CHARS = "0123456789.-";
type DigitSet = { geo: Map<string, THREE.ShapeGeometry>; adv: Map<string, number> };
let digitSet: Promise<DigitSet> | null = null;

function loadDigits(): Promise<DigitSet> {
  return (digitSet ??= Promise.all([...NUM_CHARS].map(async (ch) => {
    const r = await tex(ch === "-" ? "-" : ch);
    const shapes: THREE.Shape[] = [];
    for (const g of r.glyphs) shapes.push(...g.shapes);
    return { ch, geo: new THREE.ShapeGeometry(shapes, 4), adv: Math.max(0.28, r.max.x - Math.min(0, r.min.x)) };
  })).then((list) => {
    const geo = new Map<string, THREE.ShapeGeometry>();
    const adv = new Map<string, number>();
    for (const d of list) { geo.set(d.ch, d.geo); adv.set(d.ch, d.ch >= "0" && d.ch <= "9" ? 0.5 : d.adv + 0.06); }
    return { geo, adv };
  }));
}

/** A number on screen that follows a value every frame (manim's DecimalNumber). */
export class DecimalNumber extends Group3D {
  readonly material: THREE.MeshBasicMaterial;
  private slots: Map<string, THREE.Mesh>[] = [];
  private set: DigitSet;
  private digits: number;
  private size: number;
  private shown = "";
  value = 0;

  private constructor(set: DigitSet, o: { digits: number; size: number; color: THREE.ColorRepresentation; maxChars: number }) {
    super();
    this.set = set;
    this.digits = o.digits;
    this.size = o.size;
    this.material = new THREE.MeshBasicMaterial({ color: o.color, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    for (let i = 0; i < o.maxChars; i++) {
      const m = new Map<string, THREE.Mesh>();
      for (const ch of NUM_CHARS) {
        const mesh = new THREE.Mesh(set.geo.get(ch)!, this.material);
        mesh.scale.setScalar(o.size);
        mesh.visible = false;
        mesh.renderOrder = 1;
        this.add(mesh);
        m.set(ch, mesh);
      }
      this.slots.push(m);
    }
  }

  static async create(o: { digits?: number; size?: number; color?: THREE.ColorRepresentation; maxChars?: number } = {}) {
    const set = await loadDigits();
    return new DecimalNumber(set, { digits: o.digits ?? 2, size: o.size ?? 1, color: o.color ?? 0xffffff, maxChars: o.maxChars ?? 8 });
  }

  /** Width in world units of what is shown. */
  width = 0;

  setValue(v: number) {
    this.value = v;
    const s = (Number.isFinite(v) ? v : 0).toFixed(this.digits).slice(0, this.slots.length);
    if (s === this.shown) return;
    this.shown = s;
    let x = 0;
    for (let i = 0; i < this.slots.length; i++) {
      for (const mesh of this.slots[i].values()) mesh.visible = false;
      const ch = s[i];
      if (ch === undefined) continue;
      const mesh = this.slots[i].get(ch);
      if (!mesh) continue;
      mesh.visible = true;
      mesh.position.set(x, -0.35 * this.size, 0);
      x += (this.set.adv.get(ch) ?? 0.5) * this.size;
    }
    this.width = x;
  }

  dispose() { this.material.dispose(); }
}
