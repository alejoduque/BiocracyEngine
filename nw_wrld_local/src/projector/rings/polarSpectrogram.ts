// polarSpectrogram.ts
// A spectrogram wrapped onto an annulus, as in the reference: time runs round
// the ring, frequency runs outward (log, 40 Hz at the inner edge, 10 kHz at the
// outer), and the level is phosphor white on black.
//
// The polar mapping is computed per fragment from the local position rather
// than baked into UVs, so the ring's edges are true circles at any zoom and the
// seam at twelve o'clock filters across cleanly (RepeatWrapping on u).
//
// Two ways to write, one texture:
//   sweep    a radar sweep: the column under the playhead is overwritten as it
//            passes, and older columns fade with their age (uTrail) so the
//            direction of time is legible. The NOW ring.
//   indexed  a column is a day or a minute, written when that day or minute is
//            heard. The YEAR and DAY rings.

import * as THREE from "three";
import { ROWS } from "./liveFeeds";
import { freqToV, FREQ_GUIDES, TAU } from "./ringMath";

const VERT = /* glsl */ `
varying vec3 vPos;
void main() {
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uTex;
uniform sampler2D uMask;
uniform float uRin;
uniform float uRout;
uniform float uA0;
uniform float uSpan;
uniform float uHead;
uniform float uTrail;
uniform float uOpacity;
uniform float uGain;
uniform float uFloor;
uniform float uHasMask;
uniform float uCrisp;
uniform float uCols;
uniform float uGuideN;
uniform float uGuideV[8];
uniform vec3 uTint;
uniform vec3 uGuideCol;
uniform vec3 uHatchCol;
varying vec3 vPos;
const float TAU = 6.28318530718;
void main() {
  float r = length(vPos.xz);
  if (r < uRin || r > uRout) discard;
  float ang = atan(vPos.x, -vPos.z);
  if (ang < 0.0) ang += TAU;
  float a = mod(ang - uA0 + TAU, TAU);
  if (a > uSpan) discard;
  float u = a / uSpan;
  float v = (r - uRin) / (uRout - uRin);
  // Crisp: nearest along time (a day is a day), linear along frequency.
  float us = uCrisp > 0.5 ? (floor(u * uCols) + 0.5) / uCols : u;
  float val = texture2D(uTex, vec2(us, v)).r;
  if (uTrail > 0.0) {
    float age = fract(uHead - u + 1.0);
    val *= 1.0 - uTrail * age;
  }
  // Display floor: the compression curve upstream lifts a quiet band to about
  // 0.2, which over a whole ring reads as grey haze. Subtracting a FIXED floor
  // puts the noise floor at black and lets events stand out, as a spectrogram
  // display does. Fixed, not adaptive: an empty bus still draws black.
  float lv = clamp((val - uFloor) / (1.0 - uFloor) * uGain, 0.0, 1.0);
  vec3 col = uTint * lv;
  // Pattern scale for hatching and dots: world-space, so it holds still while
  // the camera moves, but snapped to the octave that keeps it a few pixels
  // apart — otherwise a deep zoom turns it into a handful of wide stripes.
  float fw = max(fwidth(r), 1e-6);
  float lod = exp2(floor(log2(1.0 / (fw * 8.0))));
  if (uHasMask > 0.5) {
    // Absence is drawn, not left blank: diagonal hatching reads as a mark.
    float m = texture2D(uMask, vec2(us, 0.5)).r;
    float hatch = step(0.64, fract((vPos.x - vPos.z) * lod));
    col += uHatchCol * m * hatch * (1.0 - val);
  }
  // The kHz guides: dotted circles, spaced along the arc.
  float dots = step(0.55, fract(ang * r * lod * 0.8));
  for (int i = 0; i < 8; i++) {
    if (float(i) >= uGuideN) break;
    float gr = mix(uRin, uRout, uGuideV[i]);
    float line = 1.0 - smoothstep(fw * 0.6, fw * 1.6, abs(r - gr));
    col += uGuideCol * line * dots;
  }
  gl_FragColor = vec4(col * uOpacity, 1.0);
}
`;

export type SpectroOpts = {
  rIn: number;
  rOut: number;
  y: number;
  cols: number;
  /** Where u = 0 sits (ring angle) and how much of the turn the ring spans. */
  a0?: number;
  span?: number;
  crisp?: boolean;
  mask?: boolean;
  guides?: number[];
  tint?: number;
  gain?: number;
  /** Display floor on the 0..1 reading (see the fragment shader). */
  floor?: number;
  segments?: number;
};

export class PolarSpectrogram {
  readonly cols: number;
  readonly rows = ROWS;
  readonly rIn: number;
  readonly rOut: number;
  readonly a0: number;
  readonly span: number;
  readonly data: Uint8Array;
  readonly tex: THREE.DataTexture;
  readonly maskData: Uint8Array | null;
  readonly mask: THREE.DataTexture | null;
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  private dirty = false;
  private maskDirty = false;
  private lastSweepCol = -1;

  constructor(o: SpectroOpts) {
    this.cols = o.cols;
    this.rIn = o.rIn;
    this.rOut = o.rOut;
    this.a0 = o.a0 ?? 0;
    this.span = o.span ?? TAU;

    this.data = new Uint8Array(this.cols * this.rows);
    this.tex = new THREE.DataTexture(this.data, this.cols, this.rows, THREE.RedFormat, THREE.UnsignedByteType);
    // One byte per texel: rows of 365 or 1440 are not multiples of four, and
    // WebGL's default unpack alignment would shear every row.
    this.tex.unpackAlignment = 1;
    this.tex.wrapS = THREE.RepeatWrapping;
    this.tex.wrapT = THREE.ClampToEdgeWrapping;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.generateMipmaps = false;
    this.tex.needsUpdate = true;

    if (o.mask) {
      this.maskData = new Uint8Array(this.cols);
      this.mask = new THREE.DataTexture(this.maskData, this.cols, 1, THREE.RedFormat, THREE.UnsignedByteType);
      this.mask.unpackAlignment = 1;
      this.mask.minFilter = THREE.NearestFilter;
      this.mask.magFilter = THREE.NearestFilter;
      this.mask.generateMipmaps = false;
      this.mask.needsUpdate = true;
    } else {
      this.maskData = null;
      this.mask = null;
    }

    const guides = (o.guides ?? FREQ_GUIDES).slice(0, 8);
    const gv = new Array(8).fill(0);
    guides.forEach((f, i) => { gv[i] = freqToV(f); });

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTex: { value: this.tex },
        uMask: { value: this.mask ?? this.tex },
        uRin: { value: o.rIn },
        uRout: { value: o.rOut },
        uA0: { value: this.a0 },
        uSpan: { value: this.span },
        uHead: { value: 0 },
        uTrail: { value: 0 },
        uOpacity: { value: 1 },
        uGain: { value: o.gain ?? 1 },
        uFloor: { value: o.floor ?? 0.22 },
        uHasMask: { value: o.mask ? 1 : 0 },
        uCrisp: { value: o.crisp ? 1 : 0 },
        uCols: { value: this.cols },
        uGuideN: { value: guides.length },
        uGuideV: { value: gv },
        uTint: { value: new THREE.Color(o.tint ?? 0xf2fff4) },
        uGuideCol: { value: new THREE.Color(0x2a2f2c) },
        uHatchCol: { value: new THREE.Color(0x3a3f3c) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      extensions: { derivatives: true } as unknown as THREE.ShaderMaterial["extensions"],
    });

    // A flat annulus a hair wider than the ring; the fragment shader discards
    // outside the true radii, so the edges are circles rather than chords.
    const segs = o.segments ?? 720;
    const r0 = o.rIn * 0.995, r1 = o.rOut * 1.005;
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * TAU;
      const s = Math.sin(a) / Math.cos(Math.PI / segs), c = Math.cos(a) / Math.cos(Math.PI / segs);
      pos.push(s * r0, o.y, -c * r0, s * r1, o.y, -c * r1);
    }
    for (let i = 0; i < segs; i++) {
      const p = i * 2;
      idx.push(p, p + 1, p + 2, p + 1, p + 3, p + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
  }

  /** Column index of a turn fraction. */
  colOf(frac: number): number {
    return Math.min(this.cols - 1, Math.max(0, Math.floor((((frac % 1) + 1) % 1) * this.cols)));
  }

  /** Overwrite (blend = 1) or blend one column with 0..1 values per row. */
  writeColumn(col: number, vals: Float32Array, blend = 1): void {
    const c = ((col % this.cols) + this.cols) % this.cols;
    const d = this.data;
    for (let r = 0; r < this.rows; r++) {
      const i = r * this.cols + c;
      const nv = Math.max(0, Math.min(1, vals[r])) * 255;
      d[i] = blend >= 1 ? nv : d[i] + (nv - d[i]) * blend;
    }
    this.dirty = true;
  }

  /** Copy a column block from a row-major source of the same row count,
   *  wrapping round the ring (a day tile can run past midnight). */
  blitColumns(col0: number, src: Uint8Array, srcCols: number): void {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < srcCols; c++) {
        const dc = (((col0 + c) % this.cols) + this.cols) % this.cols;
        this.data[r * this.cols + dc] = src[r * srcCols + c];
      }
    }
    this.dirty = true;
  }

  clear(): void {
    this.data.fill(0);
    this.dirty = true;
  }

  /** Replace the whole image from a row-major source of the same shape. */
  load(src: Uint8Array): void {
    if (src.length === this.data.length) this.data.set(src);
    this.dirty = true;
  }

  /** Move the ring's start angle (the T wedge follows the DOY cursor). */
  setA0(a: number): void {
    this.material.uniforms.uA0.value = ((a % TAU) + TAU) % TAU;
  }

  /**
   * Radar sweep: write every column the playhead crossed since the last call,
   * so the image has no gaps at a low frame rate or a fast turn.
   */
  sweep(frac: number, vals: Float32Array): void {
    const cur = this.colOf(frac);
    const prev = this.lastSweepCol;
    this.lastSweepCol = cur;
    this.setHead(frac);
    if (prev < 0) { this.writeColumn(cur, vals); return; }
    let n = (cur - prev + this.cols) % this.cols;
    if (n > this.cols / 2) n = 1; // a stall or a jump: do not smear half the ring
    for (let k = 1; k <= n; k++) this.writeColumn(prev + k, vals);
  }

  setMask(col: number, v: number): void {
    if (!this.maskData) return;
    const c = ((col % this.cols) + this.cols) % this.cols;
    this.maskData[c] = Math.max(0, Math.min(255, Math.round(v * 255)));
    this.maskDirty = true;
  }

  setHead(frac: number): void { this.material.uniforms.uHead.value = ((frac % 1) + 1) % 1; }
  setTrail(k: number): void { this.material.uniforms.uTrail.value = Math.max(0, Math.min(0.95, k)); }
  setOpacity(k: number): void { this.material.uniforms.uOpacity.value = k; }
  setGain(k: number): void { this.material.uniforms.uGain.value = k; }

  commit(): void {
    if (this.dirty) { this.tex.needsUpdate = true; this.dirty = false; }
    if (this.maskDirty && this.mask) { this.mask.needsUpdate = true; this.maskDirty = false; }
  }

  dispose(): void {
    this.tex.dispose();
    this.mask?.dispose();
    this.material.dispose();
    this.mesh.geometry.dispose();
  }
}

// ─── The year's memory ──────────────────────────────────────────────────────
//
// What the corpus bus sounded like on each day of the ring, accumulated while
// the ring plays that day and kept across sessions. Nothing is painted that
// was not heard: an unplayed day stays black until the ring reaches it, and a
// day that played silence is a dark column, which is what it was.
//
// Per viewer, in localStorage. It is a convenience of this machine's memory of
// its own performances, not a record anyone else relies on; every access is
// guarded because storage can be missing, full or blocked.

const YEAR_KEY = "biocracy.rings.yearSpectrum.v1";
/** Cap on the running mean's count, so a day heard many times still moves. */
const MEAN_CAP = 48;

export class YearMemory {
  readonly data = new Uint8Array(365 * ROWS); // row-major, 365 columns
  readonly counts = new Uint8Array(365);
  private dirtyAt = 0;
  private savedAt = 0;

  constructor() { this.load(); }

  private load(): void {
    try {
      const raw = window.localStorage.getItem(YEAR_KEY);
      if (!raw) return;
      const j = JSON.parse(raw);
      const d = b64ToBytes(String(j.d || ""));
      const c = b64ToBytes(String(j.c || ""));
      if (d.length === this.data.length) this.data.set(d);
      if (c.length === this.counts.length) this.counts.set(c);
    } catch { /* storage unavailable: start empty */ }
  }

  /** Running mean of one corpus frame into day doy (1..365). */
  accumulate(doy: number, vals: Float32Array): void {
    const c = Math.max(0, Math.min(364, doy - 1));
    const n = Math.min(MEAN_CAP, this.counts[c] + 1);
    this.counts[c] = Math.min(255, this.counts[c] + 1);
    for (let r = 0; r < ROWS; r++) {
      const i = r * 365 + c;
      const nv = Math.max(0, Math.min(1, vals[r])) * 255;
      this.data[i] = this.data[i] + (nv - this.data[i]) / n;
    }
    this.dirtyAt = performance.now();
  }

  heard(doy: number): boolean {
    return this.counts[Math.max(0, Math.min(364, doy - 1))] > 0;
  }

  /** Throttled: at most every 10 s, and only when something changed. */
  maybeSave(force = false): void {
    if (!this.dirtyAt || this.dirtyAt <= this.savedAt) return;
    const now = performance.now();
    if (!force && now - this.savedAt < 10000) return;
    this.savedAt = now;
    try {
      window.localStorage.setItem(YEAR_KEY, JSON.stringify({
        v: 1, rows: ROWS, d: bytesToB64(this.data), c: bytesToB64(this.counts),
      }));
    } catch { /* full or blocked: keep it for this session only */ }
  }
}

let _year: YearMemory | null = null;
/** One memory per page, shared by slot 0 and slot T. */
export function getYearMemory(): YearMemory {
  if (!_year) _year = new YearMemory();
  return _year;
}

function bytesToB64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, Array.from(b.subarray(i, i + 0x8000)));
  }
  return btoa(s);
}

function b64ToBytes(s: string): Uint8Array {
  if (!s) return new Uint8Array(0);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
