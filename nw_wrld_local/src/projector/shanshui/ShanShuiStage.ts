// ShanShuiStage.ts — slot 1 · Shan Shui · sonograma 3D
//
// A live sonogram laid into a landscape you can walk around. The brush and
// the mountain grammar are {Shan, Shui}* by Lingdong Huang (MIT, see
// inkLib.ts); what is painted is the engine:
//
//   FRONT       the master bus as it sounds, rebuilt every frame: frequency
//               runs along x (log, 40 Hz – 10 kHz), height is how loud each
//               band is. This is the live ridge.
//   RECESSION   every row interval the front is set down as a ridge and walks
//               back along −z into fog until it dissolves, minutes later. The
//               ranges behind are the sonogram's past. Each ridge stands on a
//               ground-coloured curtain, so a nearer range hides a farther one
//               from any angle — the occlusion of an ink landscape, in 3D.
//   WASH        the corpus bus, the forest's own voice, as a pale wash just
//               behind each ridge.
//   CUN, TREES  contour strokes under the tallest peaks; foliage where the
//               row's top bands were bright.
//   DATA NODES  each Ethereum mainnet transaction is staked onto the terrain of
//               the moment it arrived — x is its gas price, size its value —
//               and the nearest are labelled in the chain's own numbers.
//               Blocks set their ridge in vermilion with the block number.
//
// Two chamber controls reach it directly:
//   CONSENSUS → OPACITY      a chamber in agreement paints in firm ink; in
//                            dissent the ranges thin toward ghosts.
//   ROTATION  → REACTIVENESS how quickly the front follows the sound, how often
//                            a ridge is set down, and how fast they recede.
//
// Nothing is invented: a silent bus sets down a flat ridge, a plain; with no
// chain there are no nodes.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RingStageBase } from "../rings/RingStageBase";
import { ROWS } from "../rings/liveFeeds";
import type { LabelSpec } from "../rings/ringLabels";
import parliamentStore from "../parliament/parliamentStore";
import { getEthBlockLog, getEthTxLog, type EthBlockRaw, type EthTxRaw } from "../ethLive";
import { blobPoly, Perlin, Pt, strokePoly } from "./inkLib";
import { installDomeBend } from "../dome/domeBend";

const XW = 10;          // half-width of the frequency axis, world units
const HMAX = 4.5;       // tallest a ridge can stand
const DEPTH = 60;       // how far back the horizon is
const PTS = 96;         // ridge vertices
const BG = 0x000804;
// Transaction heads: half the size they were, and a little see-through, so
// the nodes mark the ranges without standing over them like trees.
const HEAD_MIN = 0.025;
const HEAD_RANGE = 0.06;
const HEAD_OPACITY = 0.72;
const INK = 0xd6d0c2;
const VERM = 0xc43e2c;
const WASH = 0x3c4c45;

type Node = { x: number; y: number; tx: EthTxRaw };
type Row = {
  group: THREE.Group;
  z: number;
  ink: THREE.MeshBasicMaterial;
  wash: THREE.MeshBasicMaterial | null;
  extras: THREE.MeshBasicMaterial | null;
  ridge: Pt[];
  block: EthBlockRaw | null;
  nodes: Node[];
};

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

function fmtEth(v: number): string {
  if (v >= 100) return v.toFixed(0);
  if (v >= 1) return v.toFixed(2);
  if (v >= 0.001) return v.toFixed(4);
  return v.toExponential(1);
}

/** The ink ribbon: the brush of {Shan, Shui}* swollen around the ridge, in the row's plane. */
function ribbonPositions(ridge: Pt[], wid: number, n0: number, N: Perlin, out?: Float32Array): Float32Array {
  const n = ridge.length;
  const pos = out ?? new Float32Array(n * 2 * 3);
  for (let i = 0; i < n; i++) {
    const a = ridge[Math.max(0, i - 1)], b = ridge[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    tx /= l; ty /= l;
    let w = wid * Math.pow(Math.sin((i / (n - 1)) * Math.PI), 0.35);
    w = w * 0.3 + w * 0.7 * N.noise(i * 0.5, n0) * 2;
    pos[i * 6] = ridge[i][0] - ty * w; pos[i * 6 + 1] = ridge[i][1] + tx * w; pos[i * 6 + 2] = 0.01;
    pos[i * 6 + 3] = ridge[i][0] + ty * w; pos[i * 6 + 4] = ridge[i][1] - tx * w; pos[i * 6 + 5] = 0.01;
  }
  return pos;
}

/** A vertical strip from the ridge down to the ground. */
function curtainPositions(ridge: Pt[], z: number, out?: Float32Array): Float32Array {
  const n = ridge.length;
  const pos = out ?? new Float32Array(n * 2 * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 6] = ridge[i][0]; pos[i * 6 + 1] = ridge[i][1]; pos[i * 6 + 2] = z;
    pos[i * 6 + 3] = ridge[i][0]; pos[i * 6 + 4] = -0.02; pos[i * 6 + 5] = z;
  }
  return pos;
}

function stripIndex(n: number): number[] {
  const idx: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const p = i * 2;
    idx.push(p, p + 1, p + 2, p + 1, p + 3, p + 2);
  }
  return idx;
}

function stripGeometry(pos: Float32Array, n: number, dynamic = false): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const attr = new THREE.BufferAttribute(pos, 3);
  if (dynamic) attr.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute("position", attr);
  g.setIndex(stripIndex(n));
  return g;
}

/** A flat polygon (a leaf, a cun stroke) as a mesh in the row's plane. */
function polyGeometry(poly: Pt[], z: number): THREE.BufferGeometry | null {
  if (poly.length < 3) return null;
  try {
    const g = new THREE.ShapeGeometry(new THREE.Shape(poly.map((p) => new THREE.Vector2(p[0], p[1]))));
    g.translate(0, 0, z);
    return g;
  } catch {
    return null;
  }
}

export class ShanShuiStage extends RingStageBase {
  private N = new Perlin(Math.floor(Math.random() * 1e9));
  private rows: Row[] = [];
  private live = new Float32Array(PTS);
  private accum = new Float32Array(PTS);
  private accumN = 0;
  private corpusAccum = new Float32Array(PTS);
  private corpusN = 0;
  private lastCorpusFrame = -1;
  private sinceEmit = 0;
  private txSeen = getEthTxLog().seq;
  private blockSeen = getEthBlockLog().seq;
  private pendingTx: EthTxRaw[] = [];
  private pendingBlock: EthBlockRaw | null = null;

  // The live front, rebuilt in place every frame.
  private liveRidge: Pt[] = [];
  private liveRibbon!: THREE.Mesh;
  private liveCurtain!: THREE.Mesh;
  private liveInk!: THREE.MeshBasicMaterial;
  private liveN0 = Math.random() * 10;

  // Shared, reused every frame: node heads and stems for every row.
  private heads!: THREE.InstancedMesh;
  private stems!: THREE.LineSegments;
  private stemPos = new Float32Array(2000 * 6);

  // Shared materials for the curtains (opaque, ground-coloured).
  private curtainMat = new THREE.MeshBasicMaterial({
    color: BG, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });

  private ledgerEl: HTMLDivElement | null = null;
  private sealEl: HTMLDivElement | null = null;
  private uiAt = 0;
  private consensus = 0.5;
  private rotation = 1;

  constructor(container: HTMLElement) {
    super(container);
    // Framed so the front range runs off both edges of the screen and the
    // recession fills it upward — at fitRadius 13 the landscape sat in the
    // middle 60% with empty sky above.
    this.defaultView = { fitRadius: 9.2, polarDeg: 52, azimuthDeg: 0 };
    this.viewTarget = new THREE.Vector3(0, 1.2, -9);
    this.scene.fog = new THREE.Fog(BG, 20, 78);

    for (let i = 0; i < PTS; i++) this.liveRidge.push([-XW + (i / (PTS - 1)) * 2 * XW, 0]);
    this.liveInk = new THREE.MeshBasicMaterial({ color: INK, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    this.liveRibbon = new THREE.Mesh(stripGeometry(ribbonPositions(this.liveRidge, 0.05, this.liveN0, this.N), PTS, true), this.liveInk);
    this.liveCurtain = new THREE.Mesh(stripGeometry(curtainPositions(this.liveRidge, 0), PTS, true), this.curtainMat);
    this.liveRibbon.frustumCulled = false;
    this.liveCurtain.frustumCulled = false;
    this.scene.add(this.liveCurtain, this.liveRibbon);

    this.heads = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: HEAD_OPACITY, depthWrite: false }), 2000);
    this.heads.count = 0;
    this.heads.frustumCulled = false;
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(this.stemPos, 3).setUsage(THREE.DynamicDrawUsage));
    sg.setDrawRange(0, 0);
    this.stems = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.35 }));
    this.stems.frustumCulled = false;
    this.scene.add(this.heads, this.stems);

    // On the dome the landscape surrounds the audience: frequency goes all the
    // way round, the live range at the horizon, the past rising toward the
    // zenith into the fog (dome/domeBend.ts). The flat screen is untouched.
    installDomeBend(this.scene, this.renderer, { halfWidth: XW, depth: DEPTH, r0: 10, rGrowth: 0.9, baseDeg: 3, topDeg: 80, degPerY: 4.5 });

    // The ledger and the seal live in the overlay, as DOM text.
    if (this.overlayEl) {
      this.ledgerEl = document.createElement("div");
      this.ledgerEl.style.cssText =
        "position:absolute;left:12px;top:10px;font:10px 'SF Mono','Fira Code',monospace;white-space:pre;" +
        "line-height:1.35;color:rgba(214,208,194,0.6);pointer-events:none;text-shadow:0 0 3px #000;";
      this.sealEl = document.createElement("div");
      this.sealEl.style.cssText =
        "position:absolute;right:16px;bottom:34px;width:46px;height:46px;background:rgba(178,44,34,0.8);" +
        "outline:2px solid rgba(0,8,4,1);outline-offset:-6px;color:#000804;display:flex;flex-direction:column;" +
        "align-items:center;justify-content:center;font:13px 'SF Mono',monospace;line-height:1.2;pointer-events:none;";
      this.overlayEl.append(this.ledgerEl, this.sealEl);
    }
    this.start();
  }

  // ── The sound ───────────────────────────────────────────────────────────
  private sampleSound(dt: number) {
    const f = this.feeds;
    // Rotation is reactiveness: how fast the front follows the bus.
    const rot = Math.max(0.1, Math.min(2, this.rotation));
    const up = 1 - Math.exp(-dt / (0.18 / rot));
    const down = 1 - Math.exp(-dt / (0.9 / rot));
    for (let i = 0; i < PTS; i++) {
      const r = Math.min(ROWS - 1, Math.round((i / (PTS - 1)) * (ROWS - 1)));
      // The same fixed display floor the ring spectrograms use: an empty bus
      // is flat, never lifted.
      const v = f.masterLive ? Math.pow(Math.max(0, f.master[r] - 0.22) / 0.78, 1.15) : 0;
      this.live[i] += (v - this.live[i]) * (v > this.live[i] ? up : down);
      this.accum[i] += this.live[i];
    }
    this.accumN++;
    if (f.corpusLive && f.corpusFrame !== this.lastCorpusFrame) {
      this.lastCorpusFrame = f.corpusFrame;
      for (let i = 0; i < PTS; i++) {
        const r = Math.min(ROWS - 1, Math.round((i / (PTS - 1)) * (ROWS - 1)));
        this.corpusAccum[i] += Math.max(0, f.corpus[r] - 0.22) / 0.78;
      }
      this.corpusN++;
    }
  }

  private collectChain() {
    const tl = getEthTxLog();
    if (tl.seq > this.txSeen) {
      const fresh = Math.min(tl.items.length, tl.seq - this.txSeen);
      this.pendingTx.push(...tl.items.slice(tl.items.length - fresh));
      if (this.pendingTx.length > 40) this.pendingTx = this.pendingTx.slice(-40);
      this.txSeen = tl.seq;
    }
    const bl = getEthBlockLog();
    if (bl.seq > this.blockSeen) {
      this.pendingBlock = bl.items[bl.items.length - 1] ?? null;
      this.blockSeen = bl.seq;
    }
  }

  private heightAt(ridge: Pt[], x: number): number {
    const u = ((x + XW) / (2 * XW)) * (PTS - 1);
    const i = Math.max(0, Math.min(PTS - 2, Math.floor(u)));
    const t = u - i;
    return ridge[i][1] * (1 - t) + ridge[i + 1][1] * t;
  }

  private gain(): number {
    return 0.6 + this.feeds.soneth("volume", 0.5) * 0.8;
  }

  // ── Setting a ridge down ────────────────────────────────────────────────
  private emitRow() {
    const g = this.gain();
    const n = Math.max(1, this.accumN);
    const ridge: Pt[] = [];
    for (let i = 0; i < PTS; i++) ridge.push([-XW + (i / (PTS - 1)) * 2 * XW, (this.accum[i] / n) * HMAX * g]);
    const corpus: Pt[] | null = this.corpusN > 0
      ? Array.from({ length: PTS }, (_, i) => [-XW + (i / (PTS - 1)) * 2 * XW, (this.corpusAccum[i] / this.corpusN) * HMAX * 0.85] as Pt)
      : null;
    this.accum.fill(0); this.accumN = 0; this.corpusAccum.fill(0); this.corpusN = 0;

    const group = new THREE.Group();
    group.position.z = -0.08;
    const block = this.pendingBlock;
    const ink = new THREE.MeshBasicMaterial({
      color: block ? VERM : INK, transparent: true, side: THREE.DoubleSide, depthWrite: false,
    });
    group.add(new THREE.Mesh(stripGeometry(curtainPositions(ridge, 0), PTS), this.curtainMat));
    group.add(new THREE.Mesh(stripGeometry(ribbonPositions(ridge, 0.045, Math.random() * 10, this.N), PTS), ink));

    let wash: THREE.MeshBasicMaterial | null = null;
    if (corpus) {
      wash = new THREE.MeshBasicMaterial({ color: WASH, transparent: true, side: THREE.DoubleSide, depthWrite: false });
      group.add(new THREE.Mesh(stripGeometry(curtainPositions(corpus, -0.25), PTS), wash));
    }

    // Cun under the tallest peaks, foliage where the top bands were bright —
    // brushed once with the original's strokes, merged into one mesh.
    const parts: THREE.BufferGeometry[] = [];
    const peaks = ridge.map((p, i) => [p[1], i] as [number, number])
      .filter(([h, i]) => h > 0.6 && i > 0 && i < PTS - 1 && h >= ridge[i - 1][1] && h >= ridge[i + 1][1])
      .sort((a, b) => b[0] - a[0]).slice(0, 3);
    const cun = Math.round(2 + this.feeds.soneth("texturedepth", 0.3) * 8);
    for (const [h, i] of peaks) {
      for (let k = 0; k < cun; k++) {
        const drop = 0.2 + Math.random() * 0.6;
        const span = 3 + Math.floor(Math.random() * 6);
        const line: Pt[] = [];
        for (let j = Math.max(0, i - span); j <= Math.min(PTS - 1, i + span); j++) {
          line.push([ridge[j][0] + (Math.random() - 0.5) * 0.12, ridge[j][1] * (1 - drop) + (Math.random() - 0.5) * h * 0.04]);
        }
        const gg = line.length > 2 ? polyGeometry(strokePoly(line, { wid: 0.018 }, this.N), 0.005) : null;
        if (gg) parts.push(gg);
      }
    }
    let hiE = 0;
    for (let i = Math.floor(PTS * 0.7); i < PTS; i++) hiE += ridge[i][1];
    hiE /= PTS * 0.3 * HMAX;
    const trees = Math.floor(hiE * 20 * (0.4 + this.feeds.soneth("harmonicrich", 0.5) * 1.2));
    for (let k = 0; k < Math.min(8, trees); k++) {
      const p = ridge[Math.min(PTS - 1, Math.floor(PTS * (0.55 + Math.random() * 0.45)))];
      if (p[1] < 0.2) continue;
      for (let c = 0; c < 3; c++) {
        const gg = polyGeometry(blobPoly(p[0] + (Math.random() - 0.5) * 0.2, p[1] + 0.08 + Math.random() * 0.15, {
          ang: Math.PI / 2, len: 0.15 + Math.random() * 0.15, wid: 0.08 + Math.random() * 0.06,
        }, this.N), 0.006);
        if (gg) parts.push(gg);
      }
    }
    let extras: THREE.MeshBasicMaterial | null = null;
    if (parts.length) {
      const merged = mergeGeometries(parts.map((p) => p.toNonIndexed()), false);
      parts.forEach((p) => p.dispose());
      if (merged) {
        extras = new THREE.MeshBasicMaterial({ color: INK, transparent: true, side: THREE.DoubleSide, depthWrite: false });
        group.add(new THREE.Mesh(merged, extras));
      }
    }

    const nodes: Node[] = this.pendingTx.map((tx) => {
      const x = -XW + Math.max(0, Math.min(1, tx.gasNorm)) * 2 * XW;
      return { x, y: this.heightAt(ridge, x), tx };
    });
    this.pendingTx = [];
    this.pendingBlock = null;

    this.scene.add(group);
    this.rows.push({ group, z: -0.08, ink, wash, extras, ridge, block, nodes });
  }

  // ── Per frame ───────────────────────────────────────────────────────────
  updateRings(dt: number): void {
    const f = this.feeds;
    const st = parliamentStore.state;
    this.consensus = f.consensus;
    this.rotation = st && Number.isFinite(st.rotation) ? st.rotation : 1;
    const rot = Math.max(0.1, Math.min(2, this.rotation));

    this.sampleSound(dt);
    this.collectChain();

    // Rotation also sets the cadence: a quicker chamber sets ridges down
    // more often and sends them away sooner.
    this.sinceEmit += dt;
    const rowDt = 1.6 / Math.max(0.4, rot);
    if (this.sinceEmit >= rowDt) { this.sinceEmit = 0; this.emitRow(); }
    const life = (110 + f.soneth("timedilation", 0.3) * 300) / Math.sqrt(Math.max(0.5, rot));
    // Atmosphere is distance: more of it, and the far ranges go under sooner.
    if (this.scene.fog instanceof THREE.Fog) this.scene.fog.far = 45 + (1 - f.soneth("atmospheremix", 0.5)) * 70;
    const speed = DEPTH / life;

    // Consensus is opacity: agreement paints in firm ink, dissent in ghosts.
    const inkA = 0.22 + 0.73 * this.consensus;
    const washA = 0.12 + 0.3 * this.consensus;

    let nh = 0, ns = 0;
    const m = new THREE.Matrix4(), c = new THREE.Color();
    for (let k = this.rows.length - 1; k >= 0; k--) {
      const r = this.rows[k];
      r.z -= speed * dt;
      if (r.z < -DEPTH) {
        this.scene.remove(r.group);
        r.group.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
        });
        r.ink.dispose(); r.wash?.dispose(); r.extras?.dispose();
        this.rows.splice(k, 1);
        continue;
      }
      r.group.position.z = r.z;
      const u = -r.z / DEPTH;                          // 0 front → 1 horizon
      const fade = smooth(1, 0.72, u) * smooth(0, 0.004, u + 0.004);
      r.ink.opacity = (r.block ? Math.min(1, inkA + 0.2) : inkA) * fade;
      if (r.wash) r.wash.opacity = washA * fade;
      if (r.extras) r.extras.opacity = inkA * 0.45 * fade;
      for (const nd of r.nodes) {
        if (nh >= 2000) break;
        const stem = 0.35 + nd.tx.valueNorm * 0.3;
        const s = HEAD_MIN + nd.tx.valueNorm * HEAD_RANGE;
        m.makeScale(s, s, s).setPosition(nd.x, nd.y + stem, r.z);
        this.heads.setMatrixAt(nh, m);
        c.setHex(INK).multiplyScalar(Math.max(0.05, inkA * fade + 0.1));
        this.heads.setColorAt(nh, c);
        nh++;
        const o = ns * 6;
        this.stemPos[o] = nd.x; this.stemPos[o + 1] = nd.y; this.stemPos[o + 2] = r.z;
        this.stemPos[o + 3] = nd.x; this.stemPos[o + 4] = nd.y + stem; this.stemPos[o + 5] = r.z;
        ns++;
      }
    }

    // The live front.
    const g = this.gain();
    for (let i = 0; i < PTS; i++) this.liveRidge[i][1] = this.live[i] * HMAX * g;
    const rp = this.liveRibbon.geometry.attributes.position as THREE.BufferAttribute;
    ribbonPositions(this.liveRidge, 0.055, this.liveN0, this.N, rp.array as Float32Array);
    rp.needsUpdate = true;
    const cp = this.liveCurtain.geometry.attributes.position as THREE.BufferAttribute;
    curtainPositions(this.liveRidge, 0, cp.array as Float32Array);
    cp.needsUpdate = true;
    this.liveRibbon.geometry.computeBoundingSphere();
    this.liveInk.color.setHex(this.pendingBlock ? VERM : INK);
    this.liveInk.opacity = Math.min(1, inkA + 0.15);
    for (const tx of this.pendingTx) {
      if (nh >= 2000) break;
      const x = -XW + Math.max(0, Math.min(1, tx.gasNorm)) * 2 * XW;
      const y = this.heightAt(this.liveRidge, x);
      const stem = 0.35 + tx.valueNorm * 0.3;
      const s = HEAD_MIN + tx.valueNorm * HEAD_RANGE;
      m.makeScale(s, s, s).setPosition(x, y + stem, 0);
      this.heads.setMatrixAt(nh, m);
      this.heads.setColorAt(nh, c.setHex(INK));
      nh++;
      const o = ns * 6;
      this.stemPos[o] = x; this.stemPos[o + 1] = y; this.stemPos[o + 2] = 0;
      this.stemPos[o + 3] = x; this.stemPos[o + 4] = y + stem; this.stemPos[o + 5] = 0;
      ns++;
    }
    this.heads.count = nh;
    this.heads.instanceMatrix.needsUpdate = true;
    if (this.heads.instanceColor) this.heads.instanceColor.needsUpdate = true;
    this.stems.geometry.setDrawRange(0, ns * 2);
    (this.stems.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.stems.material as THREE.LineBasicMaterial).opacity = 0.15 + 0.3 * this.consensus;

    this.updateUi();
  }

  private updateUi() {
    const now = performance.now();
    if (now - this.uiAt < 250) return;
    this.uiAt = now;
    if (this.ledgerEl) {
      const tl = getEthTxLog().items;
      const bl = getEthBlockLog().items;
      const lines: string[] = [];
      const b = bl[bl.length - 1];
      if (b) {
        lines.push(`#${b.number !== null ? b.number.toLocaleString("en-US") : "—"}  ${b.txCount ?? "—"} tx  base ${b.baseFee !== null ? b.baseFee.toFixed(2) : "—"} gwei`);
      }
      for (let i = tl.length - 1, k = 0; i >= 0 && k < 7; i--, k++) {
        const tx = tl[i];
        lines.push(`${fmtEth(tx.eth).padStart(9)} ETH  ${tx.gwei.toFixed(2).padStart(7)} gwei` +
          `${tx.nonce !== null ? "  n" + tx.nonce : ""}${tx.calldata !== null ? "  " + tx.calldata + " B" : ""}${tx.hash ? "  " + tx.hash : ""}`);
      }
      this.ledgerEl.textContent = lines.join("\n");
    }
    if (this.sealEl) {
      const f = this.feeds;
      this.sealEl.innerHTML = "";
      const a = document.createElement("div"); a.textContent = "山水";
      const d = document.createElement("div"); d.textContent = f.cursorLive ? String(f.doy) : "—";
      d.style.fontSize = "11px";
      this.sealEl.append(a, d);
    }
  }

  collectLabels(add: (s: LabelSpec) => void): void {
    // Frequency along the front edge.
    for (const [hz, lab] of [[40, "40"], [160, "160"], [640, "640"], [2500, "2.5k"], [10000, "10k Hz"]] as [number, string][]) {
      const u = Math.log(hz / 40) / Math.log(10000 / 40);
      add({ id: `ss:f${hz}`, pos: new THREE.Vector3(-XW + u * 2 * XW, -0.1, 0.6), text: lab, cls: "axis", priority: 6 });
    }
    // The ten newest transactions, named in the chain's own numbers, while
    // they are still near; blocks by number.
    const recent = new Set(getEthTxLog().items.slice(-10));
    for (const r of this.rows) {
      const u = -r.z / DEPTH;
      if (r.block && u < 0.45) {
        const b = r.block;
        add({
          id: `ss:b${b.number ?? b.at}`, pos: new THREE.Vector3(-XW, 0.15, r.z),
          text: `bloque ${b.number !== null ? "#" + b.number.toLocaleString("en-US") : "—"}` +
            `${b.txCount !== null ? " · " + b.txCount + " tx" : ""}${b.baseFee !== null ? " · base " + b.baseFee.toFixed(2) + " gwei" : ""}`,
          cls: "head small", priority: 20, anchor: "l", opacity: 1 - u * 1.8,
        });
      }
      for (const nd of r.nodes) {
        if (!recent.has(nd.tx) || u > 0.3) continue;
        const stem = 0.35 + nd.tx.valueNorm * 0.3;
        add({
          id: `ss:t${nd.tx.at}`, pos: new THREE.Vector3(nd.x, nd.y + stem, r.z),
          text: `${fmtEth(nd.tx.eth)} ETH · ${nd.tx.gwei.toFixed(nd.tx.gwei < 10 ? 2 : 1)} gwei${nd.tx.hash ? " · " + nd.tx.hash : ""}`,
          cls: "clip live", priority: 25 - u * 20, anchor: "l", dx: 8, opacity: 1 - u * 2.5,
        });
      }
    }
  }

  statusExtra(): string {
    return `SHAN SHUI · sonograma 3D — consenso ${this.consensus.toFixed(2)} → opacidad · rotación ${this.rotation.toFixed(2)} → reactividad\n` +
      "gramática de {Shan, Shui}* · Lingdong Huang · MIT";
  }

  disposeRings(): void {
    for (const r of this.rows) { r.ink.dispose(); r.wash?.dispose(); r.extras?.dispose(); }
    this.rows = [];
    this.curtainMat.dispose();
  }
}

export default ShanShuiStage;
