// garden.ts — the corpus as a self-playing garden (modules A and B)
// ===========================================================================
// After Humusmus (an iOS instrument: up to eight recordings, each a flower,
// and the flowers play each other). Here the recordings are the AudioMoth
// corpus and the flowers are drawn from the AVGN analysis (avgn/avgnData.ts),
// so what ties them is what the analysis found, not chance:
//
//   flowers  up to eight recordings: the ones sounding in SuperCollider
//            first (/pheno/clip), then the ones nearest the ring's day. A
//            flower's petals are its calls, each at the angle of its call
//            type, so two recordings that share a vocabulary look alike.
//   links    two flowers are tied by the call types they share (Jaccard over
//            their HDBSCAN clusters): the acoustic distributional hypothesis,
//            drawn.
//   voices   a small chaotic oscillator (two coupled logistic maps) picks
//            which frequency bands the garden listens for; the flowers whose
//            calls sit in those bands walk their recordings, the rest rest.
//   gates    a call in a listened flower fires something in a flower that
//            shares its call type. The gates are named as operations on a
//            recording — congelación, bucle, inversión, dispersión, freno de
//            cinta — never as verbs a creature performs: a flower does not
//            stammer, its recording loops. A call type always fires the same
//            gate.
//   vines    gates leave a vine between the two flowers; it grows, drifts and
//            is slowly eaten by both, which wears their petals down.
//   laser    now and then one flower takes the stage alone. Its beam sweeps
//            the garden, and every flower it touches freezes into ice; the
//            garden does not listen to it until it thaws.
//
// Article 47: a recording veiled by the opacity floor is never planted, and a
// planted one that becomes veiled wilts. Opaque clips are not in the AVGN file.
//
// Two looks over one garden: "lidar" (dots, additive, module A's scan) and
// "vector" (ink line segments on paper, module B's 1-bit drawing). The words
// are text planes that face whichever camera draws them (dome/domeFacing.ts),
// on the default layer, so they read on the screen, on the dome and on both
// NDI sources (Cúpula: the cube cameras; Página: the window).

import * as THREE from "three";
import type { AvgnData } from "../avgn/avgnData";
import type { LiveFeeds } from "../rings/liveFeeds";
import { faceCamera, labelPlane } from "../dome/domeFacing";

export type GardenStyle = "lidar" | "vector";

export type GardenPlace =
  /** On the ground, round a centre (module A): petals face out and up. */
  | { kind: "ring"; center: THREE.Vector3; radius: number; stem: number; head: number; status: THREE.Vector3 }
  /** A row in the XY plane (module B), drawn flat like the diagram. */
  | { kind: "row"; center: THREE.Vector3; width: number; stem: number; head: number; status: THREE.Vector3 };

const N = 8;
const RECORDING_S = 60;
const MAX_SEG = 3000;
const MAX_DOTS = 30000;
const MAX_VINES = 10;
const VINE_STEPS = 24;
const LISTEN = 3;
/** Width of B's ink strokes, world units. */
const STROKE = 0.034;

type Effect = "congelación" | "bucle" | "inversión" | "dispersión" | "freno de cinta";
const EFFECTS: Effect[] = ["congelación", "bucle", "inversión", "dispersión", "freno de cinta"];
const EFFECT_S: Record<Effect, number> = { "congelación": 2.5, bucle: 1.6, "inversión": 3, "dispersión": 2, "freno de cinta": 2.2 };

const ROLE_ES: Record<string, string> = {
  nocturnal_voice: "voz nocturna",
  insect_chorus: "coro de insectos",
  dusk_chorus_participant: "coro del atardecer",
  dawn_chorus_participant: "coro del amanecer",
  community_shift: "cambio de comunidad",
};

type Palette = {
  bg: THREE.Color; petal: Record<string, THREE.Color>; petalOther: THREE.Color;
  stem: THREE.Color; core: THREE.Color; link: THREE.Color; vine: THREE.Color;
  laser: THREE.Color; ice: THREE.Color; text: string; sub: string; plate: string; font: string;
};

const PAL: Record<GardenStyle, Palette> = {
  // Antifonía's own phosphor palette.
  lidar: {
    bg: new THREE.Color("#04070A"),
    petal: {
      nocturnal_voice: new THREE.Color("#86E6BE"),
      insect_chorus: new THREE.Color("#74B86A"),
      dusk_chorus_participant: new THREE.Color("#A6E08A"),
      dawn_chorus_participant: new THREE.Color("#A6E08A"),
      community_shift: new THREE.Color("#E8A22A"),
    },
    petalOther: new THREE.Color("#C7D3CB"),
    stem: new THREE.Color("#356A62"), core: new THREE.Color("#C7D3CB"),
    link: new THREE.Color("#7FB0E4"), vine: new THREE.Color("#74B86A"),
    laser: new THREE.Color("#FF5A39"), ice: new THREE.Color("#CFEFFF"),
    text: "#C7D3CB", sub: "#86E6BE", plate: "rgba(4,7,10,0.55)",
    font: "'Share Tech Mono', 'IBM Plex Mono', ui-monospace, monospace",
  },
  // Transito's ink on paper: tone, not hue.
  vector: {
    bg: new THREE.Color("#F5F5F1"),
    petal: {}, petalOther: new THREE.Color("#141414"),
    stem: new THREE.Color("#3A3A3A"), core: new THREE.Color("#141414"),
    link: new THREE.Color("#8C8C86"), vine: new THREE.Color("#3A3A3A"),
    laser: new THREE.Color("#141414"), ice: new THREE.Color("#7C7C76"),
    text: "#141414", sub: "#3A3A3A", plate: "rgba(245,245,241,0.8)",
    font: "'Helvetica Neue', Arial, sans-serif",
  },
};

type Flower = {
  key: string;
  clip: number;
  a: number; b: number;          // unit range in the AVGN arrays
  set: Set<number>;              // call types (clusters) it holds
  hz: number;                    // log-mean frequency of its calls
  role: string; hour: number; doy: number;
  grow: number;                  // 0..1, planted → full
  dying: boolean;
  tau: number;                   // its own clock in the recording, s
  rate: number;
  lit: Uint8Array;               // per unit, lit last frame
  fan: Float32Array;             // per unit, its offset inside its call type's fan, rad
  listen: number;                // 0..1 eased
  sounding: boolean;
  effect: Effect | null; effectT: number; stutterT: number;
  ice: number;                   // 0..1
  iceUntil: number;
  wear: number;
  size: number;                  // head radius: grows with its calls, varies
  lastGate: number;
  base: THREE.Vector3; head: THREE.Vector3; u: THREE.Vector3; v: THREE.Vector3;
  label: Label;
};

type Vine = { i: number; j: number; born: number; seed: number; eaten: number };
type Pulse = { i: number; j: number; t: number };

// ── Labels: text planes, one canvas each, redrawn only when the words change ─
const LW = 512, LH = 64;

type Label = { mesh: THREE.Mesh; canvas: HTMLCanvasElement; tex: THREE.CanvasTexture; key: string };

function makeLabel(group: THREE.Group, geo: THREE.PlaneGeometry, scale: number, center: boolean): Label {
  const canvas = document.createElement("canvas");
  canvas.width = LW; canvas.height = LH;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, fog: false,
  }));
  mesh.renderOrder = 12;
  mesh.visible = false;
  faceCamera(mesh, scale);
  if (center) mesh.userData.ax = -0.5;
  group.add(mesh);
  return { mesh, canvas, tex, key: "" };
}

function drawLabel(l: Label, P: Palette, main: string, sub: string, color?: string): void {
  const key = main + "|" + sub + "|" + (color ?? "");
  if (key === l.key) return;
  l.key = key;
  const g = l.canvas.getContext("2d")!;
  g.clearRect(0, 0, LW, LH);
  g.font = `600 ${sub ? 25 : 29}px ${P.font}`;
  const w1 = g.measureText(main).width;
  g.font = `18px ${P.font}`;
  const w2 = sub ? g.measureText(sub).width : 0;
  const tw = Math.min(LW, Math.ceil(Math.max(w1, w2)) + 16);
  g.fillStyle = P.plate;
  g.fillRect(0, 2, tw, LH - 4);
  g.textBaseline = "middle";
  g.fillStyle = color ?? P.text;
  g.font = `600 ${sub ? 25 : 29}px ${P.font}`;
  g.fillText(main, 8, sub ? 21 : LH / 2);
  if (sub) {
    g.font = `18px ${P.font}`;
    g.fillStyle = P.sub;
    g.fillText(sub, 8, 47);
  }
  l.tex.repeat.set(tw / LW, 1);
  l.tex.needsUpdate = true;
  l.mesh.userData.aspect = (tw / LW) * (LW / LH);
}

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function doyOfKey(key: string): number {
  const m = /^(\d{4})(\d{2})(\d{2})_/.exec(key);
  if (!m) return 1;
  const d = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return Math.floor((d - Date.UTC(+m[1], 0, 1)) / 86400000) + 1;
}

function ringDist(a: number, b: number): number {
  const d = Math.abs(a - b) % 365;
  return Math.min(d, 365 - d);
}

export class Garden {
  readonly group = new THREE.Group();
  private P: Palette;
  private flowers: (Flower | null)[] = new Array(N).fill(null);
  private vines: Vine[] = [];
  private pulses: Pulse[] = [];
  private geoLabel = labelPlane();
  private labels: Label[] = [];
  private flash: { l: Label; until: number; i: number }[] = [];
  private status: Label;
  private stageLabel: Label;
  // segments, filled each frame
  private sa = new Float32Array(MAX_SEG * 3);
  private sb = new Float32Array(MAX_SEG * 3);
  private sc = new Float32Array(MAX_SEG * 3);
  private ns = 0;
  private lines: THREE.Mesh | null = null;
  private dots: THREE.Points | null = null;
  // the chaotic listener
  private cx = 0.37; private cy = 0.71; private chaosT = 0;
  private bands: [number, number] = [4000, 9000];
  // the laser
  private laserNext = 0; private laserStart = -1; private stage = -1; private laserPhi0 = 0; private laserSpan = 1.6;
  private replaceT = 0;
  private recent: string[] = [];
  private t0 = -1;
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private v0 = new THREE.Vector3();
  private v1 = new THREE.Vector3();
  private vMid = new THREE.Vector3();
  private vUp = new THREE.Vector3();
  private col = new THREE.Color();

  constructor(private data: AvgnData, private style: GardenStyle, private place: GardenPlace, private labelScale = 1) {
    this.P = PAL[style];
    if (style === "vector") {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAX_SEG * 18), 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(MAX_SEG * 18), 3).setUsage(THREE.DynamicDrawUsage));
      g.setDrawRange(0, 0);
      this.lines = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
      this.lines.frustumCulled = false;
      this.group.add(this.lines);
    } else {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAX_DOTS * 3), 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(MAX_DOTS * 3), 3).setUsage(THREE.DynamicDrawUsage));
      g.setDrawRange(0, 0);
      this.dots = new THREE.Points(g, new THREE.PointsMaterial({
        size: 0.055, sizeAttenuation: true, vertexColors: true, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      }));
      this.dots.frustumCulled = false;
      this.group.add(this.dots);
    }
    for (let i = 0; i < N; i++) this.labels.push(makeLabel(this.group, this.geoLabel, labelScale, true));
    for (let i = 0; i < 6; i++) this.flash.push({ l: makeLabel(this.group, this.geoLabel, labelScale * 0.9, true), until: 0, i: -1 });
    this.status = makeLabel(this.group, this.geoLabel, labelScale, true);
    this.stageLabel = makeLabel(this.group, this.geoLabel, labelScale * 1.05, true);
  }

  // ── Layout ────────────────────────────────────────────────────────────────
  private slotFrame(i: number, f: Flower): void {
    // No forest is a ring of equal spacings. Each slot has its own place,
    // height and lean, fixed per slot (a replanted flower grows where the old
    // one stood), from a hash of the slot.
    const p = this.place;
    const h = 0.45 + 0.9 * hash(i + 3);
    if (p.kind === "ring") {
      // 300° round the stand, open toward the viewer (+z): a flower there
      // stood in front of the stand on screen and right at the seat on the dome.
      const gap = Math.PI / 3, step = (Math.PI * 2 - gap) / (N - 1);
      const ang = Math.PI / 2 + gap / 2 + i * step + (hash(i + 11) - 0.5) * step * 0.8;
      const rad = p.radius * (0.58 + 0.55 * hash(i + 23));
      const o = this.tmp.set(Math.cos(ang), 0, Math.sin(ang));
      f.base.copy(p.center).addScaledVector(o, rad);
      f.head.copy(f.base).add(this.tmp2.set((hash(i + 31) - 0.5) * 0.5, p.stem * h, (hash(i + 37) - 0.5) * 0.5));
      f.u.set(-Math.sin(ang), 0, Math.cos(ang)).add(this.tmp2.set(0, (hash(i + 41) - 0.5) * 0.5, 0)).normalize();
      f.v.set(0, 0.35 + 0.5 * hash(i + 43), 0).addScaledVector(o, 0.8)
        .addScaledVector(this.tmp2.set(-Math.sin(ang), 0, Math.cos(ang)), (hash(i + 47) - 0.5) * 0.7).normalize();
      f.u.addScaledVector(f.v, -f.u.dot(f.v)).normalize();
    } else {
      const x = (i - (N - 1) / 2) / ((N - 1) / 2) + (hash(i + 11) - 0.5) * 0.18;
      f.base.set(p.center.x + x * p.width / 2, p.center.y - 0.35 * x * x + (hash(i + 23) - 0.5) * 0.5, p.center.z);
      f.head.copy(f.base).add(this.tmp2.set((hash(i + 31) - 0.5) * 0.4, p.stem * (0.7 + 0.6 * hash(i + 3)), 0));
      const lean = (hash(i + 41) - 0.5) * 0.35;
      f.u.set(Math.cos(lean), Math.sin(lean), 0);
      f.v.set(-Math.sin(lean), Math.cos(lean), 0);
    }
  }

  private plant(i: number, key: string, now: number): void {
    const d = this.data;
    const r = d.range.get(key);
    if (!r) return;
    const ci = d.clipKeys.indexOf(key);
    const set = new Set<number>();
    let lhz = 0, n = 0;
    for (let k = r[0]; k < r[1]; k++) {
      if (d.c[k] > 0) set.add(d.c[k]);
      if (d.hz[k] > 0) { lhz += Math.log(d.hz[k]); n++; }
    }
    // Petals of one call type open as a fan round that type's angle, so a
    // recording made mostly of one call still reads as a flower.
    const byC = new Map<number, number[]>();
    for (let k = r[0]; k < r[1]; k++) {
      const c = d.c[k];
      if (!byC.has(c)) byC.set(c, []);
      byC.get(c)!.push(k);
    }
    const fan = new Float32Array(r[1] - r[0]);
    for (const [c, ks] of byC) {
      const width = c > 0 ? Math.min(2.2, 0.16 * ks.length) : 0;
      ks.forEach((k, q) => { fan[k - r[0]] = ks.length > 1 ? (q / (ks.length - 1) - 0.5) * width : 0; });
    }
    const old = this.flowers[i];
    const f: Flower = {
      key, clip: ci, a: r[0], b: r[1], set,
      hz: n ? Math.exp(lhz / n) : 5000,
      role: d.clipRole[ci] ?? "", hour: d.clipHour[ci] ?? 0, doy: doyOfKey(key),
      grow: 0, dying: false,
      tau: hash(ci) * RECORDING_S, rate: 1, lit: new Uint8Array(r[1] - r[0]), fan,
      listen: 0, sounding: false,
      effect: null, effectT: 0, stutterT: 0, ice: 0, iceUntil: 0, wear: 0, lastGate: 0,
      size: this.place.head * (0.6 + 0.5 * Math.sqrt((r[1] - r[0]) / 40)) * (0.85 + 0.3 * hash(ci + 0.5)),
      base: new THREE.Vector3(), head: new THREE.Vector3(), u: new THREE.Vector3(), v: new THREE.Vector3(),
      label: old?.label ?? this.labels[i],
    };
    this.slotFrame(i, f);
    this.flowers[i] = f;
    void now;
  }

  // ── Which recordings are planted ─────────────────────────────────────────
  private wanted(f: LiveFeeds): string[] {
    const d = this.data;
    const floor = f.opacityFloor;
    const ok = (key: string) => {
      const ci = d.clipKeys.indexOf(key);
      if (ci < 0 || !d.range.has(key)) return false;
      if (d.clipOpacity[ci] >= 1 - floor) return false;
      if (f.bancada > 0 && d.clipBancada[ci] !== f.bancada - 1) return false;
      return true;
    };
    const out: string[] = [];
    const sounding = [...f.sounding.values()].sort((a, b) => b.start - a.start).map((s) => s.ev.key);
    for (const k of [...sounding, ...this.recent]) if (out.length < N && !out.includes(k) && ok(k)) out.push(k);
    if (out.length < N) {
      const near = d.clipKeys
        .map((k) => ({ k, dd: ringDist(doyOfKey(k), f.doy) + hash(d.clipKeys.indexOf(k)) * 0.5 }))
        .filter((x) => ok(x.k) && !out.includes(x.k))
        .sort((a, b) => a.dd - b.dd);
      for (const x of near) { if (out.length >= N) break; out.push(x.k); }
    }
    return out;
  }

  private tend(f: LiveFeeds, now: number): void {
    for (const ev of f.newClips) {
      this.recent = [ev.key, ...this.recent.filter((k) => k !== ev.key)].slice(0, N);
    }
    if (now < this.replaceT) return;
    this.replaceT = now + 2;
    const want = this.wanted(f);
    const have = this.flowers.map((x) => x?.key ?? null);
    // Mark the unwanted to wilt; plant one new recording at a time, so the
    // garden changes slowly, the way the rest of the instrument hands over.
    for (const fl of this.flowers) if (fl && !want.includes(fl.key)) fl.dying = true;
    const missing = want.filter((k) => !have.includes(k));
    if (!missing.length) return;
    let slot = this.flowers.findIndex((x) => x === null);
    if (slot < 0) slot = this.flowers.findIndex((x) => x !== null && x.dying && x.grow <= 0.02);
    if (slot >= 0) { this.plant(slot, missing[0], now); this.replaceT = now + 3; }
  }

  // ── The chaotic listener ─────────────────────────────────────────────────
  private listen(f: LiveFeeds, now: number, dt: number): void {
    if (now >= this.chaosT) {
      this.chaosT = now + 0.9;
      const r = 3.82 + 0.15 * f.consensus;
      const x = r * this.cx * (1 - this.cx);
      const y = r * this.cy * (1 - this.cy) + 0.06 * (this.cx - this.cy);
      this.cx = Math.min(0.999, Math.max(0.001, x));
      this.cy = Math.min(0.999, Math.max(0.001, y));
      // 500 Hz – 24 kHz, log: the corpus's audible tier.
      this.bands = [500 * Math.pow(48, this.cx), 500 * Math.pow(48, this.cy)];
    }
    const w = this.flowers.map((fl) => {
      if (!fl || fl.dying || fl.ice > 0.05) return -1;
      let best = 0;
      for (const b of this.bands) {
        const o = Math.log2(fl.hz / b);
        best = Math.max(best, Math.exp(-(o * o) / (2 * 0.6 * 0.6)));
      }
      return best + (fl.sounding ? 1 : 0);
    });
    const order = w.map((x, i) => [x, i]).sort((a, b) => b[0] - a[0]).slice(0, LISTEN).filter((x) => x[0] > 0.15).map((x) => x[1]);
    const k = 1 - Math.exp(-dt / 0.8);
    this.flowers.forEach((fl, i) => { if (fl) fl.listen += ((order.includes(i) ? 1 : 0) - fl.listen) * k; });
  }

  // ── Gates ────────────────────────────────────────────────────────────────
  private jaccard(a: Flower, b: Flower): number {
    let inter = 0;
    for (const c of a.set) if (b.set.has(c)) inter++;
    const uni = a.set.size + b.set.size - inter;
    return uni ? inter / uni : 0;
  }

  private gate(i: number, c: number, now: number): void {
    const src = this.flowers[i]!;
    let best = -1, bj = 0;
    this.flowers.forEach((fl, j) => {
      if (!fl || j === i || fl.dying || fl.ice > 0.05 || !fl.set.has(c) || now - fl.lastGate < 1.8) return;
      const jj = this.jaccard(src, fl);
      if (jj > bj) { bj = jj; best = j; }
    });
    if (best < 0) return;
    const t = this.flowers[best]!;
    t.effect = EFFECTS[c % EFFECTS.length];
    t.effectT = EFFECT_S[t.effect];
    t.lastGate = now;
    this.pulses.push({ i, j: best, t: 0 });
    if (this.pulses.length > 24) this.pulses.shift();
    const fl = this.flash.find((x) => x.until < now) ?? this.flash[0];
    fl.until = now + 2.6; fl.i = best;
    drawLabel(fl.l, this.P, t.effect, `← ${String(src.hour).padStart(2, "0")}h · tipo ${c}`, this.style === "lidar" ? "#FFC24A" : undefined);
    if (this.vines.length < MAX_VINES && hash(now * 13.7 + c) < 0.35) {
      this.vines.push({ i, j: best, born: now, seed: hash(now + i * 7 + best), eaten: 0 });
    }
  }

  // ── Per frame ────────────────────────────────────────────────────────────
  update(f: LiveFeeds, dt: number, gain: number): void {
    const now = f.now;
    if (this.t0 < 0) { this.t0 = now; this.laserNext = now + 25; }
    dt = Math.min(0.1, Math.max(0, dt));
    this.tend(f, now);
    this.listen(f, now, dt);
    const d = this.data;

    // flowers: growth, sounding, clocks, effects, ice
    this.flowers.forEach((fl, i) => {
      if (!fl) return;
      fl.grow += ((fl.dying ? 0 : 1) - fl.grow) * (1 - Math.exp(-dt / (fl.dying ? 2.5 : 3.2)));
      if (fl.dying && fl.grow < 0.01) { fl.label.mesh.visible = false; this.flowers[i] = null; return; }
      const s = f.sounding.get(fl.key);
      if (s && !fl.sounding) fl.tau = now - s.start;
      fl.sounding = !!s;
      let rate = fl.listen > 0.1 ? 1 : 0;
      if (fl.effect) {
        fl.effectT -= dt;
        const p = 1 - fl.effectT / EFFECT_S[fl.effect];
        if (fl.effect === "congelación") rate = 0;
        else if (fl.effect === "inversión") rate = -1;
        else if (fl.effect === "freno de cinta") rate = Math.max(0, 1 - p * 1.6);
        else if (fl.effect === "bucle") {
          fl.stutterT -= dt;
          if (fl.stutterT <= 0) { fl.tau -= 0.18; fl.stutterT = 0.14; }
        }
        if (fl.effectT <= 0) fl.effect = null;
      }
      if (fl.ice > 0) rate = 0;
      fl.rate += (rate - fl.rate) * (1 - Math.exp(-dt / 0.15));
      fl.tau += fl.rate * dt;
      if (now < fl.iceUntil) fl.ice = Math.min(1, fl.ice + dt / 0.4);
      else fl.ice = Math.max(0, fl.ice - dt / 8);
      fl.wear = Math.max(0, fl.wear - dt * 0.004);

      // onsets in a listened flower fire gates
      const pos = ((fl.tau % RECORDING_S) + RECORDING_S) % RECORDING_S;
      for (let k = fl.a; k < fl.b; k++) {
        const on = pos >= d.t[k] && pos < d.t[k] + Math.max(0.12, d.d[k]) ? 1 : 0;
        const li = k - fl.a;
        if (on && !fl.lit[li] && fl.listen > 0.5 && fl.rate > 0.3 && d.c[k] > 0 && fl.grow > 0.6) this.gate(i, d.c[k], now);
        fl.lit[li] = on;
      }
    });

    // vines: grow, drift, eaten
    for (const v of this.vines) {
      const age = now - v.born;
      if (age > 12) {
        v.eaten = Math.min(0.5, v.eaten + dt / 70);
        for (const k of [v.i, v.j]) { const fl = this.flowers[k]; if (fl) fl.wear = Math.min(0.6, fl.wear + dt * 0.006); }
      }
    }
    this.vines = this.vines.filter((v) => v.eaten < 0.5 && this.flowers[v.i] && this.flowers[v.j]);
    for (const p of this.pulses) p.t += dt / 0.7;
    this.pulses = this.pulses.filter((p) => p.t < 1 && this.flowers[p.i] && this.flowers[p.j]);

    // the laser
    let phi = 0, laserOn = false, stageDim = 1;
    if (this.laserStart < 0 && now >= this.laserNext) {
      const cand = this.flowers.map((x, i) => (x && !x.dying && x.grow > 0.8 && x.ice < 0.05 ? i : -1)).filter((i) => i >= 0);
      if (cand.length >= 2) {
        this.stage = cand.reduce((a, b) => (this.flowers[b]!.lastGate > this.flowers[a]!.lastGate ? b : a), cand[0]);
        this.laserStart = now;
        // An arc across the garden, not a full turn: a full turn touches
        // every flower and the whole garden froze at once.
        const st = this.flowers[this.stage]!;
        const toward = this.place.kind === "ring"
          ? Math.atan2(this.place.center.z - st.head.z, this.place.center.x - st.head.x)
          : Math.atan2(this.place.center.y + this.place.stem - st.head.y, this.place.center.x - st.head.x);
        this.laserSpan = ((70 + 60 * hash(now * 1.7)) * Math.PI) / 180;
        this.laserPhi0 = toward - this.laserSpan / 2;
      } else this.laserNext = now + 10;
    }
    if (this.laserStart >= 0) {
      const lt = now - this.laserStart;
      const st = this.flowers[this.stage];
      if (!st || lt > 14) {
        this.laserStart = -1; this.stage = -1;
        this.laserNext = now + 50 + hash(now * 3.1) * 60;
      } else {
        stageDim = lt < 2 ? 1 - 0.65 * (lt / 2) : lt > 12 ? 0.35 + 0.65 * ((lt - 12) / 2) : 0.35;
        if (lt >= 2 && lt <= 12) {
          laserOn = true;
          phi = this.laserPhi0 + ((lt - 2) / 10) * this.laserSpan;
          this.flowers.forEach((fl, j) => {
            if (!fl || j === this.stage) return;
            const a = this.beamAngle(st, fl);
            let dd = Math.abs(((a - phi) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
            if (dd < (4 * Math.PI) / 180) { fl.iceUntil = now + 16; }
          });
        }
      }
    }

    // ── Draw ──────────────────────────────────────────────────────────────
    this.ns = 0;
    const P = this.P;
    const head = this.place.head;
    const c = this.col;
    this.flowers.forEach((fl, i) => {
      if (!fl) return;
      const dim = (this.stage >= 0 && i !== this.stage ? stageDim : 1) * gain * fl.grow;
      const lv = 0.55 + 0.45 * fl.listen;
      // stem
      this.seg(fl.base, fl.head, P.stem, 0.8 * dim);
      // core: a ring; doubled while SuperCollider is sounding this recording
      this.ring(fl.head, fl.u, fl.v, fl.size * 0.12, 10, P.core, 0.9 * dim);
      if (fl.sounding) this.ring(fl.head, fl.u, fl.v, fl.size * 0.2, 12, P.core, 0.7 * dim);
      // calyx: the flower's outline, faint, so its shape reads at rest
      this.ring(fl.head, fl.u, fl.v, fl.size * 1.05, 28, P.stem, 0.45 * dim);
      // petals: one per call, at the angle of its call type
      const K = Math.max(1, d.clusters.length);
      const scatter = fl.effect === "dispersión" ? Math.sin((fl.effectT / EFFECT_S["dispersión"]) * Math.PI) : 0;
      for (let k = fl.a; k < fl.b; k++) {
        const cl = d.c[k];
        const th = cl > 0
          ? ((cl - 1) / K) * Math.PI * 2 + fl.fan[k - fl.a]
          : (Math.log(Math.max(300, d.hz[k]) / 300) / Math.log(80)) * Math.PI * 2 + 0.07;
        const lit = fl.lit[k - fl.a] ? 1 : 0;
        const len = fl.size * (0.45 + 0.55 * Math.min(1, d.d[k] / 0.17)) * (1 - fl.wear * 0.5) * (1 + 0.25 * lit) * (1 + 0.6 * scatter * hash(k + 9));
        const r0 = fl.size * 0.16;
        const thx = th + scatter * (hash(k + 5) - 0.5) * 0.8;
        const dx = Math.cos(thx), dy = Math.sin(thx);
        const a = this.tmp.copy(fl.head).addScaledVector(fl.u, dx * r0).addScaledVector(fl.v, dy * r0);
        const b = this.tmp2.copy(fl.head).addScaledVector(fl.u, dx * (r0 + len)).addScaledVector(fl.v, dy * (r0 + len));
        // a petal has width: two edges from base to tip through its widest point
        const wd = len * 0.16, mr = r0 + len * 0.45;
        const m1 = this.vMid.copy(fl.head).addScaledVector(fl.u, dx * mr - dy * wd).addScaledVector(fl.v, dy * mr + dx * wd);
        const m2 = this.vUp.copy(fl.head).addScaledVector(fl.u, dx * mr + dy * wd).addScaledVector(fl.v, dy * mr - dx * wd);
        c.copy(cl > 0 ? (P.petal[this.data.clusters[cl - 1]?.role ?? ""] ?? P.petalOther) : P.petalOther);
        if (fl.ice > 0) c.lerp(P.ice, fl.ice);
        if (fl.effect === "congelación") c.lerp(P.ice, 0.6);
        const alpha = (cl > 0 ? 1 : 0.5) * (lit ? 1 : 0.6 * lv) * dim;
        this.seg(a, m1, c, alpha); this.seg(m1, b, c, alpha);
        this.seg(a, m2, c, alpha); this.seg(m2, b, c, alpha);
      }
      // ice: a hexagonal crystal round the head
      if (fl.ice > 0.02) {
        const R = fl.size * 1.2;
        for (let s = 0; s < 6; s++) {
          const a0 = (s / 6) * Math.PI * 2, a1 = ((s + 1) / 6) * Math.PI * 2;
          const p0 = this.tmp.copy(fl.head).addScaledVector(fl.u, Math.cos(a0) * R).addScaledVector(fl.v, Math.sin(a0) * R);
          const p1 = this.tmp2.copy(fl.head).addScaledVector(fl.u, Math.cos(a1) * R).addScaledVector(fl.v, Math.sin(a1) * R);
          this.seg(p0, p1, P.ice, 0.4 * fl.ice * gain * fl.grow);
          this.seg(fl.head, p0, P.ice, 0.18 * fl.ice * gain * fl.grow);
        }
      }
    });

    // links: shared call types
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const a = this.flowers[i], b = this.flowers[j];
      if (!a || !b) continue;
      const jj = this.jaccard(a, b);
      if (jj < 0.12) continue;
      this.seg(a.head, b.head, P.link, Math.min(1, jj * 1.6) * 0.45 * gain * Math.min(a.grow, b.grow));
    }
    for (const p of this.pulses) {
      const a = this.flowers[p.i]!, b = this.flowers[p.j]!;
      const t0 = Math.max(0, p.t - 0.12), t1 = Math.min(1, p.t + 0.04);
      this.seg(this.tmp.lerpVectors(a.head, b.head, t0), this.tmp2.lerpVectors(a.head, b.head, t1), P.core, gain);
    }

    // vines: a quadratic curve between two heads, lifted and drifting
    for (const v of this.vines) {
      const a = this.flowers[v.i]!, b = this.flowers[v.j]!;
      const age = now - v.born;
      const grown = Math.min(1, age / 5);
      const ring = this.place.kind === "ring";
      const lift = head * (2 + 2 * v.seed) * (ring ? 1 : 0.6);
      // The control point drifts: a vine is never still.
      const ctrl = this.vMid.lerpVectors(a.head, b.head, 0.5)
        .addScaledVector(this.vUp.set(0, ring || v.seed > 0.5 ? 1 : -1, 0), lift);
      if (ring) ctrl.add(this.vUp.set(Math.sin(now * 0.21 + v.seed * 9), 0, Math.cos(now * 0.17 + v.seed * 5)).multiplyScalar(head * 0.8));
      else ctrl.x += Math.sin(now * 0.19 + v.seed * 7) * head * 0.8;
      const s0 = v.eaten, s1 = Math.min(grown, 1 - v.eaten);
      if (s1 <= s0) continue;
      for (let s = 0; s <= VINE_STEPS; s++) {
        const t = s0 + (s1 - s0) * (s / VINE_STEPS);
        const q = this.v1
          .copy(a.head).multiplyScalar((1 - t) * (1 - t))
          .addScaledVector(ctrl, 2 * (1 - t) * t)
          .addScaledVector(b.head, t * t);
        if (s > 0) this.seg(this.v0, q, P.vine, 0.55 * gain);
        this.v0.copy(q);
      }
    }

    // the laser beam
    if (laserOn && this.stage >= 0) {
      const st = this.flowers[this.stage]!;
      const L = this.place.kind === "ring" ? this.place.radius * 2.3 : this.place.width * 0.6;
      const dir = this.beamDir(phi);
      const end = this.tmp2.copy(st.head).addScaledVector(dir, L);
      this.seg(st.head, end, P.laser, gain);
      if (this.style === "vector") {
        const off = new THREE.Vector3(-dir.y, dir.x, 0).multiplyScalar(0.04);
        this.seg(this.tmp.copy(st.head).add(off), end.clone().add(off), P.laser, gain);
      }
    }

    this.flush();
    this.drawLabels(now, laserOn || this.stage >= 0);
  }

  private beamDir(phi: number): THREE.Vector3 {
    return this.place.kind === "ring"
      ? new THREE.Vector3(Math.cos(phi), 0, Math.sin(phi))
      : new THREE.Vector3(Math.cos(phi), Math.sin(phi), 0);
  }

  private beamAngle(from: Flower, to: Flower): number {
    const d = this.tmp.subVectors(to.head, from.head);
    return this.place.kind === "ring" ? Math.atan2(d.z, d.x) : Math.atan2(d.y, d.x);
  }

  private seg(a: THREE.Vector3, b: THREE.Vector3, col: THREE.Color, alpha: number): void {
    if (alpha <= 0.01 || this.ns >= MAX_SEG) return;
    const n = this.ns++ * 3;
    this.sa[n] = a.x; this.sa[n + 1] = a.y; this.sa[n + 2] = a.z;
    this.sb[n] = b.x; this.sb[n + 1] = b.y; this.sb[n + 2] = b.z;
    // On paper a faint grey vanishes: the vector look runs darker.
    const al = Math.min(1, this.style === "vector" ? alpha * 1.7 : alpha);
    if (this.style === "vector") {
      // Ink on paper: tone, by mixing toward the paper rather than alpha.
      const bg = this.P.bg;
      this.sc[n] = bg.r + (col.r - bg.r) * al;
      this.sc[n + 1] = bg.g + (col.g - bg.g) * al;
      this.sc[n + 2] = bg.b + (col.b - bg.b) * al;
    } else {
      this.sc[n] = col.r * al; this.sc[n + 1] = col.g * al; this.sc[n + 2] = col.b * al;
    }
  }

  private ring(c: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3, r: number, n: number, col: THREE.Color, alpha: number): void {
    const p0 = this.v0, p1 = this.v1;
    for (let s = 0; s < n; s++) {
      const a0 = (s / n) * Math.PI * 2, a1 = ((s + 1) / n) * Math.PI * 2;
      p0.copy(c).addScaledVector(u, Math.cos(a0) * r).addScaledVector(v, Math.sin(a0) * r);
      p1.copy(c).addScaledVector(u, Math.cos(a1) * r).addScaledVector(v, Math.sin(a1) * r);
      this.seg(p0, p1, col, alpha);
    }
  }

  private flush(): void {
    if (this.lines) {
      // Ink strokes with a width (WebGL draws lines one pixel wide, which on
      // B's paper read as nothing): each segment is a quad in the drawing's
      // plane (XY), STROKE wide, the weight of Transito's own hairlines.
      const g = this.lines.geometry;
      const pos = g.getAttribute("position") as THREE.BufferAttribute;
      const col = g.getAttribute("color") as THREE.BufferAttribute;
      const P = pos.array as Float32Array, C = col.array as Float32Array;
      const w = STROKE / 2;
      for (let s = 0; s < this.ns; s++) {
        const n = s * 3, m = s * 18;
        const ax = this.sa[n], ay = this.sa[n + 1], az = this.sa[n + 2];
        const bx = this.sb[n], by = this.sb[n + 1], bz = this.sb[n + 2];
        let px = -(by - ay), py = bx - ax;
        const L = Math.hypot(px, py) || 1;
        px = (px / L) * w; py = (py / L) * w;
        const v = [ax - px, ay - py, az, bx - px, by - py, bz, bx + px, by + py, bz,
                   ax - px, ay - py, az, bx + px, by + py, bz, ax + px, ay + py, az];
        for (let q = 0; q < 18; q++) P[m + q] = v[q];
        for (let q = 0; q < 6; q++) { C[m + q * 3] = this.sc[n]; C[m + q * 3 + 1] = this.sc[n + 1]; C[m + q * 3 + 2] = this.sc[n + 2]; }
      }
      pos.needsUpdate = true; col.needsUpdate = true;
      g.setDrawRange(0, this.ns * 6);
    } else if (this.dots) {
      // A scan, not a stroke: each segment becomes dots at a fixed pitch,
      // the way the LiDAR returns of Antifonía's stand are drawn.
      const g = this.dots.geometry;
      const pos = g.getAttribute("position") as THREE.BufferAttribute;
      const col = g.getAttribute("color") as THREE.BufferAttribute;
      const P = pos.array as Float32Array, C = col.array as Float32Array;
      // Returns, not ink: each dot is nudged off the line, about a fifth are
      // missing, and each returns at its own strength — a plant seen by the
      // same aerial scan as the stand, not drawn with a ruler. The noise is a
      // hash of the dot's place in its segment, so a still plant is still.
      const pitch = 0.05, jit = 0.022;
      let m = 0;
      for (let s = 0; s < this.ns && m < MAX_DOTS; s++) {
        const n = s * 3;
        const dx = this.sb[n] - this.sa[n], dy = this.sb[n + 1] - this.sa[n + 1], dz = this.sb[n + 2] - this.sa[n + 2];
        const k = Math.max(1, Math.min(60, Math.ceil(Math.sqrt(dx * dx + dy * dy + dz * dz) / pitch)));
        for (let q = 0; q <= k && m < MAX_DOTS; q++) {
          const hs = s * 131 + q * 7.13;
          if (hash(hs) < 0.22) continue;
          const t = q / k, o = m * 3, e = 0.5 + 0.5 * hash(hs + 1.7);
          P[o] = this.sa[n] + dx * t + (hash(hs + 2.1) - 0.5) * jit;
          P[o + 1] = this.sa[n + 1] + dy * t + (hash(hs + 3.3) - 0.5) * jit;
          P[o + 2] = this.sa[n + 2] + dz * t + (hash(hs + 4.7) - 0.5) * jit;
          C[o] = this.sc[n] * e; C[o + 1] = this.sc[n + 1] * e; C[o + 2] = this.sc[n + 2] * e;
          m++;
        }
      }
      pos.needsUpdate = true; col.needsUpdate = true;
      g.setDrawRange(0, m);
    }
  }

  private drawLabels(now: number, laser: boolean): void {
    const P = this.P;
    const headR = this.place.head;
    this.flowers.forEach((fl, i) => {
      const l = this.labels[i];
      if (!fl) { l.mesh.visible = false; return; }
      fl.label = l;
      const main = `${String(fl.hour).padStart(2, "0")}:00 · ${ROLE_ES[fl.role] ?? fl.role}`;
      // The garden listens; the flower is listened to. Nothing here says a
      // plant does what a person does.
      const sub = fl.ice > 0.05 ? "hielo"
        : fl.sounding ? `suena · ${fl.b - fl.a} llamados`
        : fl.listen > 0.5 ? `en escucha · ${fl.b - fl.a} llamados`
        : `día ${fl.doy} · ${fl.b - fl.a} llamados`;
      drawLabel(l, P, main, sub, fl.ice > 0.05 ? "#" + P.ice.getHexString() : undefined);
      l.mesh.position.copy(fl.head).addScaledVector(fl.v, fl.size * 1.6);
      if (this.place.kind === "ring") l.mesh.position.y += fl.size * 0.6;
      (l.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, fl.grow) * (this.stage >= 0 && i !== this.stage ? 0.5 : 1);
      // Only the flowers doing something carry a name: eight at once
      // crowded the stand. Sounding, listening or on the stage; ice shows
      // in the drawing, and a frozen flower is not listening.
      l.mesh.visible = fl.grow > 0.05 && (fl.sounding || fl.listen > 0.5 || i === this.stage);
    });
    for (const fx of this.flash) {
      const fl = fx.i >= 0 ? this.flowers[fx.i] : null;
      if (!fl || now > fx.until) { fx.l.mesh.visible = false; continue; }
      fx.l.mesh.position.copy(fl.head).addScaledVector(fl.v, -fl.size * 1.3);
      (fx.l.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, (fx.until - now) / 0.8);
      fx.l.mesh.visible = true;
    }
    const kHz = (f: number) => (f >= 1000 ? (f / 1000).toFixed(1).replace(".", ",") + " kHz" : Math.round(f) + " Hz");
    drawLabel(this.status, P, "JARDÍN", `escucha ${kHz(Math.min(...this.bands))} · ${kHz(Math.max(...this.bands))}`);
    this.status.mesh.position.copy(this.place.status);
    this.status.mesh.visible = this.flowers.some((x) => x);
    const st = this.stage >= 0 ? this.flowers[this.stage] : null;
    if (laser && st) {
      drawLabel(this.stageLabel, P, "ESCENA · LÁSER", `${String(st.hour).padStart(2, "0")}:00 · ${ROLE_ES[st.role] ?? st.role}`, "#" + P.laser.getHexString());
      this.stageLabel.mesh.position.copy(st.head).addScaledVector(st.v, st.size * 3.0);
      this.stageLabel.mesh.visible = true;
    } else this.stageLabel.mesh.visible = false;
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const l of [...this.labels, ...this.flash.map((x) => x.l), this.status, this.stageLabel]) {
      l.tex.dispose();
      (l.mesh.material as THREE.Material).dispose();
    }
    this.geoLabel.dispose();
    if (this.lines) { this.lines.geometry.dispose(); (this.lines.material as THREE.Material).dispose(); }
    if (this.dots) { this.dots.geometry.dispose(); (this.dots.material as THREE.Material).dispose(); }
    this.flowers.fill(null);
    this.vines = [];
  }
}

/**
 * Plant a garden in a module's scene and keep it running on its own frame
 * loop, with its own LiveFeeds. Returns the function that removes it. Does
 * nothing when corpus/avgn.json is absent (tools/build_avgn.py not run): the
 * module is then exactly as it was.
 */
export function plantGarden(
  getScene: () => THREE.Scene | null | undefined,
  style: GardenStyle,
  place: GardenPlace,
): () => void {
  let garden: Garden | null = null;
  let raf = 0;
  let stopped = false;
  let last = performance.now();
  void (async () => {
    const [{ loadAvgn }, { LiveFeeds }] = await Promise.all([
      import("../avgn/avgnData"), import("../rings/liveFeeds"),
    ]);
    const data = await loadAvgn();
    const scene = getScene();
    if (stopped || !data || !scene) return;
    garden = new Garden(data, style, place);
    scene.add(garden.group);
    const feeds = new LiveFeeds();
    const tick = (ms: number) => {
      if (stopped || !garden) return;
      raf = requestAnimationFrame(tick);
      const dt = (ms - last) / 1000;
      last = ms;
      feeds.update({});
      garden.update(feeds, dt, 0.55 + 0.45 * feeds.consensus);
    };
    raf = requestAnimationFrame(tick);
  })();
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    garden?.dispose();
    garden = null;
  };
}
