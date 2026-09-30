// ringPrims.ts
// Line and band geometry for the ring stages. Lines are drawn as GL lines on
// purpose: they stay one pixel wide at any zoom, which is what keeps a ring
// edge or a tick reading as a hairline when the performer is a few
// centimetres from it, and what the reference's thin grey rings are.

import * as THREE from "three";
import { polar, TAU } from "./ringMath";

export const RING_GREY = 0x3a403c;
export const TICK_GREY = 0x6d736f;
export const AMBER = 0xff8800;
export const PLAYHEAD = 0xe8643a;

const _v = new THREE.Vector3();

export function lineMat(color: number, opacity: number, additive = false): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color, transparent: true, opacity, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

export function circleLine(r: number, y: number, color = RING_GREY, opacity = 0.7, segs = 512): THREE.LineLoop {
  const pts: number[] = [];
  for (let i = 0; i < segs; i++) {
    polar(r, (i / segs) * TAU, y, _v);
    pts.push(_v.x, _v.y, _v.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineLoop(g, lineMat(color, opacity));
}

export function arcLine(
  r: number, a0: number, a1: number, y: number, color = RING_GREY, opacity = 0.7, segs = 64
): THREE.Line {
  const pts: number[] = [];
  for (let i = 0; i <= segs; i++) {
    polar(r, a0 + ((a1 - a0) * i) / segs, y, _v);
    pts.push(_v.x, _v.y, _v.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.Line(g, lineMat(color, opacity));
}

/** Radial tick marks: each {a, r0, r1}. */
export function radialTicks(
  ticks: { a: number; r0: number; r1: number }[], y: number, color = TICK_GREY, opacity = 0.6
): THREE.LineSegments {
  const pts: number[] = [];
  for (const t of ticks) {
    polar(t.r0, t.a, y, _v); pts.push(_v.x, _v.y, _v.z);
    polar(t.r1, t.a, y, _v); pts.push(_v.x, _v.y, _v.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(g, lineMat(color, opacity));
}

/**
 * A radial playhead: a line from r0 to r1 at angle 0, inside a group whose
 * rotation.y carries the angle (see setPlayhead). One draw, no rebuild.
 */
export function playhead(r0: number, r1: number, y: number, color = PLAYHEAD, opacity = 0.95): THREE.Group {
  const g = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, y, -r0), new THREE.Vector3(0, y, -r1),
  ]);
  const grp = new THREE.Group();
  grp.add(new THREE.Line(g, lineMat(color, opacity)));
  return grp;
}

/** Point a playhead group at ring angle a (rotation about Y by −a). */
export function setPlayhead(grp: THREE.Object3D, a: number): void {
  grp.rotation.y = -a;
}

export type Band = { r0: number; r1: number; a0: number; a1: number; color: THREE.Color; alpha?: number };

/**
 * Many annular sectors in one mesh, with vertex colours. Used for the season
 * arcs and the clip role bands: the reference's teal and grey detection
 * stripes. Alpha is folded into the colour because the material is additive.
 */
export function bandGeometry(bands: Band[], y: number, segsPerRad = 48): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const a = new THREE.Vector3();
  for (const b of bands) {
    const span = b.a1 - b.a0;
    const segs = Math.max(2, Math.ceil(Math.abs(span) * segsPerRad));
    const base = pos.length / 3;
    const k = b.alpha ?? 1;
    for (let i = 0; i <= segs; i++) {
      const ang = b.a0 + (span * i) / segs;
      polar(b.r0, ang, y, a); pos.push(a.x, a.y, a.z);
      polar(b.r1, ang, y, a); pos.push(a.x, a.y, a.z);
      col.push(b.color.r * k, b.color.g * k, b.color.b * k, b.color.r * k, b.color.g * k, b.color.b * k);
    }
    for (let i = 0; i < segs; i++) {
      const p = base + i * 2;
      idx.push(p, p + 1, p + 2, p + 1, p + 3, p + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

export function bandMesh(bands: Band[], y: number): THREE.Mesh {
  return new THREE.Mesh(
    bandGeometry(bands, y),
    new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    })
  );
}

/**
 * A dynamic buffer of quadratic Bézier arcs, as in the reference's interior:
 * each arc bows toward the centre of the dial. Colours carry the fade, since
 * the material is additive.
 */
export class ArcBuffer {
  readonly lines: THREE.LineSegments;
  private pos: Float32Array;
  private col: Float32Array;
  private n = 0;
  constructor(private maxArcs: number, private segs = 20) {
    this.pos = new Float32Array(maxArcs * segs * 2 * 3);
    this.col = new Float32Array(maxArcs * segs * 2 * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("color", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.lines.frustumCulled = false;
  }
  begin(): void { this.n = 0; }
  /** bow: 0 = straight, 1 = the control point at the centre of the dial. */
  add(p0: THREE.Vector3, p1: THREE.Vector3, color: THREE.Color, k: number, bow = 0.6, lift = 0): void {
    if (this.n >= this.maxArcs || k <= 0.003) return;
    const cx = (p0.x + p1.x) * 0.5 * (1 - bow);
    const cy = (p0.y + p1.y) * 0.5 + lift;
    const cz = (p0.z + p1.z) * 0.5 * (1 - bow);
    const base = this.n * this.segs * 6;
    let px = p0.x, py = p0.y, pz = p0.z;
    for (let i = 1; i <= this.segs; i++) {
      const t = i / this.segs, u = 1 - t;
      const x = u * u * p0.x + 2 * u * t * cx + t * t * p1.x;
      const y = u * u * p0.y + 2 * u * t * cy + t * t * p1.y;
      const z = u * u * p0.z + 2 * u * t * cz + t * t * p1.z;
      const o = base + (i - 1) * 6;
      this.pos[o] = px; this.pos[o + 1] = py; this.pos[o + 2] = pz;
      this.pos[o + 3] = x; this.pos[o + 4] = y; this.pos[o + 5] = z;
      // Brighter at the ends, where the arc attaches to something.
      const e0 = k * (0.45 + 0.55 * Math.abs(1 - 2 * ((i - 1) / this.segs)));
      const e1 = k * (0.45 + 0.55 * Math.abs(1 - 2 * t));
      this.col[o] = color.r * e0; this.col[o + 1] = color.g * e0; this.col[o + 2] = color.b * e0;
      this.col[o + 3] = color.r * e1; this.col[o + 4] = color.g * e1; this.col[o + 5] = color.b * e1;
      px = x; py = y; pz = z;
    }
    this.n++;
  }
  end(): void {
    const g = this.lines.geometry;
    g.setDrawRange(0, this.n * this.segs * 2);
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }
  dispose(): void {
    this.lines.geometry.dispose();
    (this.lines.material as THREE.Material).dispose();
  }
}
