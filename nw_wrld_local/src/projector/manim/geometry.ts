// geometry.ts — manim's geometric mobjects: lines, arrows, axes, number lines
// ===========================================================================
// All drawn as fat line segments in world units (LineMaterial worldUnits), the
// same stroke as the glyphs, so a diagram and its formula share one weight on
// the dome. Everything lies in its group's local XY plane, facing +Z: placed
// with domeLayout.placeOnDome it faces the audience.
//
// Live shapes (a trace, a moving dot) write into their existing GPU buffer
// each frame; nothing here allocates per frame.

import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { Group3D } from "./vmobject";

export function lineMaterial(color: THREE.ColorRepresentation, width: number, opacity = 1, dashed = false): LineMaterial {
  const m = new LineMaterial({
    color, linewidth: width, worldUnits: true, transparent: true, opacity, depthWrite: false,
    dashed, dashSize: width * 6, gapSize: width * 5, dashScale: 1,
  });
  m.resolution.set(1024, 1024);
  return m;
}

/** Segments from a flat array of points [x,y,z, x,y,z, …] taken pairwise. */
export class Segments extends Group3D {
  readonly material: LineMaterial;
  private geo: LineSegmentsGeometry;
  private line: LineSegments2;
  private capacity: number;

  constructor(capacity: number, color: THREE.ColorRepresentation, width: number, opacity = 1, dashed = false) {
    super();
    this.capacity = capacity;
    this.geo = new LineSegmentsGeometry();
    this.geo.setPositions(new Float32Array(capacity * 6));
    this.geo.instanceCount = 0;
    this.material = lineMaterial(color, width, opacity, dashed);
    this.line = new LineSegments2(this.geo, this.material);
    this.line.frustumCulled = false;
    this.line.renderOrder = 2;
    this.add(this.line);
  }

  /** Set segment endpoints: `pts` holds 2 points per segment. */
  setSegments(pts: THREE.Vector3[]) {
    const attr = this.geo.getAttribute("instanceStart") as THREE.InterleavedBufferAttribute;
    const arr = attr.data.array as Float32Array;
    const n = Math.min(this.capacity, Math.floor(pts.length / 2));
    for (let i = 0; i < n * 2; i++) { arr[i * 3] = pts[i].x; arr[i * 3 + 1] = pts[i].y; arr[i * 3 + 2] = pts[i].z; }
    attr.data.needsUpdate = true;
    this.geo.instanceCount = n;
    if (this.material.dashed) this.line.computeLineDistances();
  }

  /** An open polyline through `pts`. */
  setPolyline(pts: THREE.Vector3[]) {
    const seg: THREE.Vector3[] = [];
    for (let i = 0; i + 1 < pts.length; i++) seg.push(pts[i], pts[i + 1]);
    this.setSegments(seg);
  }

  dispose() { this.geo.dispose(); this.material.dispose(); }
}

/** manim's Arrow: a shaft and a filled tip, from a to b (local coordinates, z = 0 plane or any). */
export class Arrow extends Group3D {
  readonly shaft: Segments;
  readonly tipMat: THREE.MeshBasicMaterial;
  private tip: THREE.Mesh;
  private tipSize: number;

  constructor(a: THREE.Vector3, b: THREE.Vector3, o: { color?: THREE.ColorRepresentation; width?: number; tip?: number; dashed?: boolean; opacity?: number } = {}) {
    super();
    const color = o.color ?? 0xffffff, width = o.width ?? 0.03, tip = o.tip ?? width * 7;
    this.tipSize = tip;
    this.shaft = new Segments(1, color, width, o.opacity ?? 1, o.dashed ?? false);
    this.add(this.shaft);
    const g = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(-tip, tip * 0.45, 0), new THREE.Vector3(-tip, -tip * 0.45, 0),
    ]);
    this.tipMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: o.opacity ?? 1, depthWrite: false, side: THREE.DoubleSide });
    this.tip = new THREE.Mesh(g, this.tipMat);
    this.tip.renderOrder = 2;
    this.add(this.tip);
    this.setEnds(a, b);
  }

  /**
   * Ends in the parent's space. The tip lies in the plane that contains the
   * shaft and faces the dome's centre (the origin of `faceFrom`'s space).
   */
  setEnds(a: THREE.Vector3, b: THREE.Vector3, faceFrom = new THREE.Vector3(0, 0, 1e4)) {
    const dir = b.clone().sub(a);
    const len = dir.length();
    const tipLen = Math.min(len * 0.4, this.tipSize);
    dir.normalize();
    this.shaft.setSegments([a, b.clone().addScaledVector(dir, -tipLen * 0.6)]);
    // orient the tip: x along the shaft, z toward the viewer
    const z = faceFrom.clone().sub(b).normalize();
    const y = new THREE.Vector3().crossVectors(z, dir).normalize();
    const zz = new THREE.Vector3().crossVectors(dir, y);
    this.tip.matrixAutoUpdate = false;
    this.tip.matrix.makeBasis(dir, y, zz).setPosition(b);
  }

  setOpacity(a: number) { this.shaft.material.opacity = a; this.tipMat.opacity = a; }
  dispose() { this.shaft.dispose(); this.tip.geometry.dispose(); this.tipMat.dispose(); }
}

/** A rectangle outline with rounded corners (manim's RoundedRectangle / SurroundingRectangle). */
export function roundedRect(w: number, h: number, r: number, color: THREE.ColorRepresentation, width: number, opacity = 1): Segments {
  const pts: THREE.Vector3[] = [];
  const corner = (cx: number, cy: number, a0: number) => {
    for (let i = 0; i <= 6; i++) {
      const a = a0 + (i / 6) * (Math.PI / 2);
      pts.push(new THREE.Vector3(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0));
    }
  };
  const x = w / 2 - r, y = h / 2 - r;
  corner(x, y, 0); corner(-x, y, Math.PI / 2); corner(-x, -y, Math.PI); corner(x, -y, Math.PI * 1.5);
  pts.push(pts[0].clone());
  const s = new Segments(pts.length, color, width, opacity);
  s.setPolyline(pts);
  return s;
}

/**
 * A live trace on manim-style axes: the last `samples` values of a signal,
 * scrolling left, with an optional threshold line.
 */
export class Trace extends Group3D {
  readonly w: number;
  readonly h: number;
  private buf: Float32Array;
  private head = 0;
  private curve: Segments;
  private axes: Segments;
  private thresh: Segments | null = null;
  readonly min: number;
  readonly max: number;

  constructor(o: { w: number; h: number; samples?: number; min?: number; max?: number;
                   color: THREE.ColorRepresentation; axisColor?: THREE.ColorRepresentation; width?: number; threshold?: number }) {
    super();
    this.w = o.w; this.h = o.h;
    this.min = o.min ?? 0; this.max = o.max ?? 1;
    const n = o.samples ?? 240;
    this.buf = new Float32Array(n).fill(this.min);
    const lw = o.width ?? 0.025;
    this.axes = new Segments(2, o.axisColor ?? 0x6b7a72, lw * 0.6, 0.9);
    const x0 = -o.w / 2, y0 = -o.h / 2;
    this.axes.setSegments([
      new THREE.Vector3(x0, y0, 0), new THREE.Vector3(x0 + o.w, y0, 0),
      new THREE.Vector3(x0, y0, 0), new THREE.Vector3(x0, y0 + o.h, 0),
    ]);
    this.add(this.axes);
    if (o.threshold !== undefined) {
      this.thresh = new Segments(1, 0xffe680, lw * 0.7, 0.8, true);
      const ty = this.yOf(o.threshold);
      this.thresh.setSegments([new THREE.Vector3(x0, ty, 0), new THREE.Vector3(x0 + o.w, ty, 0)]);
      this.add(this.thresh);
    }
    this.curve = new Segments(n - 1, o.color, lw, 1);
    this.add(this.curve);
  }

  yOf(v: number) {
    const t = (v - this.min) / (this.max - this.min || 1);
    return -this.h / 2 + Math.max(0, Math.min(1.08, t)) * this.h;
  }

  /** The point where the newest sample is drawn. */
  headPoint(): THREE.Vector3 {
    return new THREE.Vector3(this.w / 2, this.yOf(this.buf[(this.head - 1 + this.buf.length) % this.buf.length]), 0);
  }

  push(v: number) {
    this.buf[this.head] = v;
    this.head = (this.head + 1) % this.buf.length;
    const n = this.buf.length;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) {
      const v2 = this.buf[(this.head + i) % n];
      pts.push(new THREE.Vector3(-this.w / 2 + (i / (n - 1)) * this.w, this.yOf(v2), 0));
    }
    this.curve.setPolyline(pts);
  }

  dispose() { this.curve.dispose(); this.axes.dispose(); this.thresh?.dispose(); }
}

/** manim's NumberLine with a dot riding on it: a value between two ends. */
export class NumberLine extends Group3D {
  private dot: THREE.Mesh;
  readonly length: number;
  constructor(length: number, o: { color?: THREE.ColorRepresentation; ticks?: number; width?: number; dot?: THREE.ColorRepresentation } = {}) {
    super();
    this.length = length;
    const lw = o.width ?? 0.025;
    const ticks = o.ticks ?? 4;
    const seg = new Segments(1 + ticks + 1, o.color ?? 0xb8c4bc, lw, 0.9);
    const pts = [new THREE.Vector3(-length / 2, 0, 0), new THREE.Vector3(length / 2, 0, 0)];
    for (let i = 0; i <= ticks; i++) {
      const x = -length / 2 + (i / ticks) * length;
      pts.push(new THREE.Vector3(x, -lw * 3, 0), new THREE.Vector3(x, lw * 3, 0));
    }
    seg.setSegments(pts);
    this.add(seg);
    this.dot = new THREE.Mesh(new THREE.CircleGeometry(lw * 3.2, 24),
      new THREE.MeshBasicMaterial({ color: o.dot ?? 0xffe680, transparent: true, depthWrite: false }));
    this.dot.renderOrder = 3;
    this.add(this.dot);
  }
  /** v in 0..1, left to right. */
  setValue(v: number) { this.dot.position.x = -this.length / 2 + Math.max(0, Math.min(1, v)) * this.length; }
  pointAt(v: number) { return new THREE.Vector3(-this.length / 2 + v * this.length, 0, 0); }
}
