// inkLib.ts
// Brush primitives ported from {Shan, Shui}* — procedural Chinese landscape
// by Lingdong Huang (2018), https://github.com/LingDong-/shan-shui-inf, MIT
// License, Copyright (c) 2018 Lingdong Huang.
//
// The original builds SVG strings for an infinite handscroll. Here the same
// geometry is kept — the noise, the brush `stroke`, the `blob`, the contour
// `texture` and the `tree02` foliage — but it draws to a Canvas 2D context,
// because slot 1 repaints in real time from the sound and an SVG DOM of a few
// thousand polylines per mountain cannot keep up. Behaviour is otherwise
// followed closely; where it differs it says so.

export type Pt = [number, number];

// ─── Perlin noise (p5.js via the original, with its seeded LCG) ──────────────
export class Perlin {
  private p = new Float64Array(4096);
  private octaves = 4;
  private falloff = 0.5;

  constructor(seed = Math.random() * 4294967296) {
    this.seed(seed);
  }

  seed(val: number): void {
    const m = 4294967296, a = 1664525, c = 1013904223;
    let z = val >>> 0;
    for (let i = 0; i < 4096; i++) {
      z = (a * z + c) % m;
      this.p[i] = z / m;
    }
  }

  noise(x: number, y = 0, z = 0): number {
    const YB = 4, YW = 1 << YB, ZB = 8, ZW = 1 << ZB, SIZE = 4095;
    const sc = (i: number) => 0.5 * (1.0 - Math.cos(i * Math.PI));
    const p = this.p;
    x = Math.abs(x); y = Math.abs(y); z = Math.abs(z);
    let xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    let xf = x - xi, yf = y - yi, zf = z - zi;
    let r = 0, ampl = 0.5;
    for (let o = 0; o < this.octaves; o++) {
      let of = xi + (yi << YB) + (zi << ZB);
      const rxf = sc(xf), ryf = sc(yf);
      let n1 = p[of & SIZE];
      n1 += rxf * (p[(of + 1) & SIZE] - n1);
      let n2 = p[(of + YW) & SIZE];
      n2 += rxf * (p[(of + YW + 1) & SIZE] - n2);
      n1 += ryf * (n2 - n1);
      of += ZW;
      n2 = p[of & SIZE];
      n2 += rxf * (p[(of + 1) & SIZE] - n2);
      let n3 = p[(of + YW) & SIZE];
      n3 += rxf * (p[(of + YW + 1) & SIZE] - n3);
      n2 += ryf * (n3 - n2);
      n1 += sc(zf) * (n2 - n1);
      r += n1 * ampl;
      ampl *= this.falloff;
      xi <<= 1; xf *= 2; yi <<= 1; yf *= 2; zi <<= 1; zf *= 2;
      if (xf >= 1.0) { xi++; xf--; }
      if (yf >= 1.0) { yi++; yf--; }
      if (zf >= 1.0) { zi++; zf--; }
    }
    return r;
  }
}

// ─── Small helpers (as in the original) ─────────────────────────────────────
export function mapval(v: number, a: number, b: number, c: number, d: number): number {
  return c + (d - c) * ((v - a) / (b - a));
}

export function randChoice<T>(arr: T[]): T {
  return arr[Math.floor(arr.length * Math.random())];
}

export function normRand(m: number, M: number): number {
  return mapval(Math.random(), 0, 1, m, M);
}

function wtrand(func: (x: number) => number): number {
  // Iterative rather than the original's recursion; same distribution.
  for (;;) {
    const x = Math.random(), y = Math.random();
    if (y < func(x)) return x;
  }
}

export function randGaussian(): number {
  return wtrand((x) => Math.pow(Math.E, -24 * Math.pow(x - 0.5, 2))) * 2 - 1;
}

export function loopNoise(ns: number[]): void {
  const dif = ns[ns.length - 1] - ns[0];
  const bds = [100, -100];
  for (let i = 0; i < ns.length; i++) {
    ns[i] += (dif * (ns.length - 1 - i)) / (ns.length - 1);
    if (ns[i] < bds[0]) bds[0] = ns[i];
    if (ns[i] > bds[1]) bds[1] = ns[i];
  }
  for (let i = 0; i < ns.length; i++) ns[i] = mapval(ns[i], bds[0], bds[1], 0, 1);
}

// ─── Drawing ────────────────────────────────────────────────────────────────
export function drawPoly(
  ctx: CanvasRenderingContext2D, pts: Pt[], fill: string | null, stroke: string | null = null, lw = 0
): void {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke && lw > 0) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}

export type StrokeOpts = { wid?: number; noi?: number; out?: number; fun?: (x: number) => number };

/** The brush: a polyline swollen into a tapered, noise-edged polygon. */
export function strokePoly(pts: Pt[], o: StrokeOpts, N: Perlin, n0 = Math.random() * 10): Pt[] {
  const wid = o.wid ?? 2;
  const noi = o.noi ?? 0.5;
  const fun = o.fun ?? ((x: number) => Math.sin(x * Math.PI));
  if (pts.length < 3) return pts.slice();
  const v0: Pt[] = [], v1: Pt[] = [];
  // n0 seeds the width noise. Passing the same one each frame keeps a brush
  // that is re-stroked live from shimmering (the original stroked once).
  for (let i = 1; i < pts.length - 1; i++) {
    let w = wid * fun(i / pts.length);
    w = w * (1 - noi) + w * noi * N.noise(i * 0.5, n0);
    const a1 = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]);
    const a2 = Math.atan2(pts[i][1] - pts[i + 1][1], pts[i][0] - pts[i + 1][0]);
    let a = (a1 + a2) / 2;
    if (a < a2) a += Math.PI;
    v0.push([pts[i][0] + w * Math.cos(a), pts[i][1] + w * Math.sin(a)]);
    v1.push([pts[i][0] - w * Math.cos(a), pts[i][1] - w * Math.sin(a)]);
  }
  const last = pts[pts.length - 1];
  return [pts[0], ...v0, last, ...v1.reverse(), pts[0]];
}

export function stroke(ctx: CanvasRenderingContext2D, pts: Pt[], col: string, o: StrokeOpts, N: Perlin): void {
  drawPoly(ctx, strokePoly(pts, o, N), col, col, o.out ?? 1);
}

export type BlobOpts = { len?: number; wid?: number; ang?: number; noi?: number; fun?: (x: number) => number };

/** A leaf, a dab of ink: a noise-edged lens. */
export function blobPoly(x: number, y: number, o: BlobOpts, N: Perlin): Pt[] {
  const len = o.len ?? 20, wid = o.wid ?? 5, ang = o.ang ?? 0, noi = o.noi ?? 0.5;
  const fun = o.fun ?? ((t: number) => (t <= 1
    ? Math.pow(Math.sin(t * Math.PI), 0.5)
    : -Math.pow(Math.sin((t + 1) * Math.PI), 0.5)));
  const reso = 20;
  const la: [number, number][] = [];
  for (let i = 0; i < reso + 1; i++) {
    const p = (i / reso) * 2;
    const xo = len / 2 - Math.abs(p - 1) * len;
    const yo = (fun(p) * wid) / 2;
    la.push([Math.sqrt(xo * xo + yo * yo), Math.atan2(yo, xo)]);
  }
  const ns: number[] = [];
  const n0 = Math.random() * 10;
  for (let i = 0; i < reso + 1; i++) ns.push(N.noise(i * 0.05, n0));
  loopNoise(ns);
  const out: Pt[] = [];
  for (let i = 0; i < la.length; i++) {
    const k = ns[i] * noi + (1 - noi);
    out.push([x + Math.cos(la[i][1] + ang) * la[i][0] * k, y + Math.sin(la[i][1] + ang) * la[i][0] * k]);
  }
  return out;
}

export type TextureOpts = { tex?: number; len?: number; noi?: (x: number) => number; dis?: () => number };

/** The contour strokes (cun) that model a mountain's body between its layers. */
export function texture(ptlist: Pt[][], o: TextureOpts, N: Perlin): Pt[][] {
  const tex = o.tex ?? 400;
  const len = o.len ?? 0.2;
  const noi = o.noi ?? ((x: number) => 30 / x);
  const dis = o.dis ?? (() => (Math.random() > 0.5 ? (1 / 3) * Math.random() : 2 / 3 + (1 / 3) * Math.random()));
  const reso = [ptlist.length, ptlist[0].length];
  const out: Pt[][] = [];
  for (let i = 0; i < tex; i++) {
    const mid = (dis() * reso[1]) | 0;
    const hlen = Math.floor(Math.random() * (reso[1] * len));
    const start = Math.min(Math.max(mid - hlen, 0), reso[1]);
    const end = Math.min(Math.max(mid + hlen, 0), reso[1]);
    const layer = (i / tex) * (reso[0] - 1);
    const line: Pt[] = [];
    for (let j = start; j < end; j++) {
      const p = layer - Math.floor(layer);
      const a = ptlist[Math.floor(layer)][j], b = ptlist[Math.ceil(layer)][j];
      const x = a[0] * p + b[0] * (1 - p);
      const y = a[1] * p + b[1] * (1 - p);
      const k = noi(layer + 1);
      line.push([x + k * (N.noise(x, j * 0.5) - 0.5), y + k * (N.noise(y, j * 0.5) - 0.5)]);
    }
    out.push(line);
  }
  return out;
}

/** Foliage clusters (tree02): ink dabs gathered about a point. */
export function tree02(
  ctx: CanvasRenderingContext2D, x: number, y: number,
  o: { hei?: number; wid?: number; clu?: number; col: string }, N: Perlin
): void {
  const hei = o.hei ?? 16, wid = o.wid ?? 8, clu = o.clu ?? 5;
  for (let i = 0; i < clu; i++) {
    const pts = blobPoly(x + randGaussian() * clu * 4, y + randGaussian() * clu * 4, {
      ang: Math.PI / 2,
      fun: (t: number) => (t <= 1
        ? Math.pow(Math.sin(t * Math.PI) * t, 0.5)
        : -Math.pow(Math.sin((t - 2) * Math.PI * (t - 2)), 0.5)),
      wid: Math.random() * wid * 0.75 + wid * 0.5,
      len: Math.random() * hei * 0.75 + hei * 0.5,
    }, N);
    drawPoly(ctx, pts, o.col);
  }
}

/** Water: a cluster of long, shallow ripple strokes. */
export function waterLines(len: number, hei: number, clu: number, N: Perlin): Pt[][] {
  const out: Pt[][] = [];
  let yk = 0;
  for (let i = 0; i < clu; i++) {
    const line: Pt[] = [];
    const xk = (Math.random() - 0.5) * (len / 8);
    yk += Math.random() * 5;
    const lk = len / 4 + Math.random() * (len / 4);
    for (let j = -lk; j < lk; j += 5) {
      line.push([j + xk, Math.sin(j * 0.2) * hei * N.noise(j * 0.1) - 20 + yk]);
    }
    out.push(line);
  }
  return out;
}
