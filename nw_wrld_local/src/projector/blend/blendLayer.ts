// blendLayer.ts — the blended space, inside each instrument's own world
// ===========================================================================
// Slots 4–9 keep everything they are — the structures, the trails, the
// constellations, the ticker. This adds a layer INTO the slot's scene (so the
// dome, NDI and the 4K render carry it, with the slot's own bloom) where the
// two input spaces of the engine meet, after Fauconnier & Turner's conceptual
// blending:
//
//   neuronal · bosque   the forest: the BOSQUE source (sources.ts), the species
//   silicio · cadena    Ethereum mainnet: blocks and transactions
//
// THE AUTOMATON. The six slots read, in key order, as the dossier's Fig. 3 —
// SENSED, PRESENT, OVERLAP, ADJUDICATED, then the two terminals INSCRIBED and
// OPAQUE. Each slot carries its stage as a line of type at the top of its
// world (formulas.json `header`).
//
// FORMULAS THAT SAY WHAT THEY COMPUTE. Each slot's two laws are not quoted,
// they are RUN (the models below): the leaky membrane of slot 4 integrates the
// forest's spectrum and its spike is what launches the neuronal formula; the
// fly's hash in slot 9 is computed on the forest's 96 bands. The number beside
// a formula is that law's live output, and a line under it (`computes`) says in
// plain Spanish what the number is. When a forest formula and a chain formula
// meet they transform into one another (manim's TransformMatchingParts) and
// become the blend, with its own number and, under it, one sentence of the
// slot's `lexicon` — the voice of Estratos and Registro — in turn.
//
// THE GROUND. Under slots 4, 5, 7 and 8, the blend surface is the source
// spectrogram itself (sources.ts): the band axis across, the last 6.4 s
// receding in depth, its height
//     h = (1 − λ) · bosque  +  λ · máquina (in terraces) + the transactions
// so the forest's spectrum is a membrane and the chain's percussion a ledger of
// steps, mixed by λ, the chain's share of what is happening now. Computed in
// the vertex shader from one shared texture. Slots 6 and 9 stand on the grove
// instead — dendrite and Merkle tree on one topology, morphing with λ.
//
// Scale comes from the slot's own camera distance, so the same layer sits
// right in all six worlds. The slot calls tick() once per frame from its own
// loop; nothing here runs a loop of its own or allocates per frame.

import * as THREE from "three";
import F from "../manim/formulas.json";
import { Animator, Write, Unwrite, TransformMatchingParts, FadeGlyphs, Flash } from "../manim/animate";
import { TexMobject, DecimalNumber } from "../manim/vmobject";
import { texText } from "../manim/tex";
import { getEthLive, getEthBlockLog } from "../ethLive";
import { getStem, normLevel, slew } from "../scAudio";
import { getSources, sourcesTexture, sourceRow, NB, ROWS } from "../sources";

type SlotKey = "s4" | "s5" | "s6" | "s7" | "s8" | "s9";
type Side = "neuronal" | "silicon";

const INK = { neuronal: 0x7fd6b0, silicon: 0xffa040, blend: 0xf2efe6, accent: 0xffe680 };
/** Source colours (bosque, máquina, lecho, aire) for the slot-specific layers. */
const SRC_INK = [0x7fd6b0, 0xffa040, 0x8a6cc8, 0x9cc8ff];

/** Which ground each slot stands on. */
const GROUND: Record<SlotKey, "surface" | "grove"> = {
  s4: "surface", s5: "surface", s6: "grove", s7: "surface", s8: "surface", s9: "grove",
};

type SlotText = {
  header: string;
  neuronal: { law: string };
  silicon: { law: string };
  generic: string;
  blend?: { mixed: string };
  computes: { neuronal: string; silicon: string; meet: string };
  lexicon: string[];
};
const TEXT = F as unknown as Record<SlotKey, SlotText>;

/** Which sentence of each slot's lexicon is next — kept across remounts. */
const lexNext: Record<SlotKey, number> = { s4: 0, s5: 0, s6: 0, s7: 0, s8: 0, s9: 0 };

const COOLDOWN = 5;

// ── The grove ────────────────────────────────────────────────────────────────
const TREE_DEPTH = 7;                         // 2^7 − 1 = 127 nodes, 126 branches
const NODES = (1 << TREE_DEPTH) - 1;

/** Deterministic pseudo-random, so a tree keeps its shape for the whole show. */
function rng(seed: number) {
  let x = seed >>> 0 || 1;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 1e6) / 1e6; };
}

/** Node positions of one tree in both forms, heap-indexed (children of i: 2i+1, 2i+2). */
function treeForms(height: number, seed: number) {
  const organic: THREE.Vector3[] = [];
  const merkle: THREE.Vector3[] = [];
  const r = rng(seed);
  const dirs: THREE.Vector3[] = [];
  const lens: number[] = [];
  for (let i = 0; i < NODES; i++) {
    const level = Math.floor(Math.log2(i + 1));
    const k = i + 1 - (1 << level);
    // Merkle: the root at the ground, each level a row, leaves in a line at the top
    const w = height * 0.9;
    merkle.push(new THREE.Vector3(((k + 0.5) / (1 << level) - 0.5) * w * (level === 0 ? 0 : 1), (level / (TREE_DEPTH - 1)) * height, 0));
    // Dendrite: grown from the root, each branch turned off its parent's line
    if (i === 0) { organic.push(new THREE.Vector3()); dirs.push(new THREE.Vector3(0, 1, 0)); lens.push(height * 0.24); continue; }
    const p = (i - 1) >> 1;
    const side = i % 2 === 1 ? 1 : -1;
    const turn = 0.35 + r() * 0.45;
    const d = dirs[p].clone()
      .applyAxisAngle(new THREE.Vector3(0, 0, 1), side * turn)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), (r() - 0.5) * 2.4)
      .normalize();
    const len = lens[p] * (0.68 + r() * 0.22);
    dirs.push(d); lens.push(len);
    organic.push(organic[p].clone().addScaledVector(d, len));
  }
  return { organic, merkle };
}

// ── The spectrogram ground ───────────────────────────────────────────────────
const SURFACE_VS = /* glsl */ `
uniform sampler2D uHist;
uniform sampler2D uTerr;
uniform float uRow;
uniform float uLam;
uniform float uAmp;
uniform float uSize;
uniform float uForest;
uniform vec3 uN;
uniform vec3 uS;
varying vec3 vCol;
varying float vFade;
void main() {
  vec3 p = position;
  float u = clamp(p.x / uSize + 0.5, 0.0, 1.0);
  float v = clamp(p.z / uSize + 0.5, 0.0, 1.0);
  // the front edge (toward the viewer) is now; depth is the last 6.4 s
  float age = (1.0 - v) * ${(ROWS - 2).toFixed(1)};
  vec4 h = texture2D(uHist, vec2(u, (uRow - age + 0.5) / ${ROWS.toFixed(1)}));
  float mem = h.r * (0.6 + uForest);
  float lat = floor(h.g * 6.0 + 0.5) / 6.0 + texture2D(uTerr, vec2(u, v)).r * 1.4;
  float hgt = (1.0 - uLam) * mem + uLam * lat;
  p.y = hgt * uAmp;
  float w = (uLam * lat) / ((1.0 - uLam) * mem + uLam * lat + 1e-4);
  vCol = mix(uN, uS, w) * (0.35 + min(0.65, hgt));
  vFade = 0.3 + 0.7 * v;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const SURFACE_FS = /* glsl */ `
uniform float uOpacity;
varying vec3 vCol;
varying float vFade;
void main() { gl_FragColor = vec4(vCol, uOpacity * vFade); }`;

// ── What each slot computes ──────────────────────────────────────────────────
type Readings = {
  dt: number;
  now: number;
  /** BOSQUE, auto-gained and slewed, 0–1. */
  forest: number;
  /** MÁQUINA, the same way. */
  machine: number;
  /** The chain's share of what is happening, 0–1. */
  lam: number;
  /** A /spectrum frame arrived since the last tick. */
  frame: boolean;
  block: boolean;
  tx: boolean;
};
type Model = {
  step(r: Readings): void;
  /** Values shown beside the neuronal law, the silicon law, and the blend. */
  n: number; s: number; m: number;
  fireN: boolean; fireS: boolean;
  /** Called when a neuronal flight launches (so a model can take a snapshot). */
  onLaunchN?(): void;
};

function pheno(key: string, fallback: number): number {
  try {
    const v = (window as unknown as { __phenoParams?: Record<string, number> }).__phenoParams?.[key];
    return typeof v === "number" && Number.isFinite(v) ? v : fallback;
  } catch { return fallback; }
}

/** A swell detector: fires on the way up through `hi`, re-arms below `lo`. */
function swell(hi: number, lo: number) {
  let armed = true;
  return (x: number) => {
    if (armed && x > hi) { armed = false; return true; }
    if (x < lo) armed = true;
    return false;
  };
}

function makeModel(slot: SlotKey): Model {
  const src = getSources();
  const eth = getEthLive();
  switch (slot) {
    // SENSED — leaky integrate-and-fire on the forest. τ dV/dt = −V + R·I.
    case "s4": {
      const TAU = 1.2, R = 1.6;
      let V = 0;
      const m: Model = { n: 0, s: 0, m: 0, fireN: false, fireS: false, step(r) {
        V += (r.dt / TAU) * (-V + R * r.forest);
        m.fireN = false;
        if (V >= 1) { V = 0; m.fireN = true; }
        m.n = V;
        m.s = eth.depth;
        m.fireS = r.block;
        m.m = r.lam;
      } };
      return m;
    }
    // PRESENT — Hebb over six sub-bands of the forest; presence cedes in 3 s.
    case "s5": {
      const K = 6, ETA = 1.5, DECAY = Math.LN2 / 3;
      const x = new Float32Array(K), w = new Float32Array(K * K);
      const keys = Array.from({ length: K }, (_, i) => `blend:s5:x${i}`);
      const up = swell(0.6, 0.4);
      const m: Model = { n: 0, s: 0, m: 0, fireN: false, fireS: false, step(r) {
        if (r.frame) {
          const per = NB / K, sp = src.spec[0];
          for (let i = 0; i < K; i++) {
            let v = 0;
            for (let j = i * per; j < (i + 1) * per; j++) v += sp[j];
            x[i] = normLevel(keys[i], v / per, 0.05);
          }
        }
        const k = Math.exp(-r.dt * DECAY);
        let best = 0;
        for (let i = 0; i < K; i++) for (let j = i + 1; j < K; j++) {
          const o = i * K + j;
          w[o] = Math.min(1, w[o] * k + ETA * x[i] * x[j] * r.dt);
          if (w[o] > best) best = w[o];
        }
        m.n = best;
        m.fireN = up(best);
        m.s = eth.value;
        m.fireS = r.block;
        const bt = (window as unknown as { __bioToken?: { value: number } }).__bioToken;
        m.m = bt ? bt.value : 0;
      } };
      return m;
    }
    // OVERLAP — a dendrite that strengthens where forest and machine sound
    // together, and a self-adjusting list of the four sources (move-to-front,
    // the list form of a splay tree): accessing the dominant source costs its
    // depth, and the accessed one rises to the root.
    case "s6": {
      const ETA = 2.2, GAMMA = 0.5;
      let w = 0, cost = 1;
      const order = [0, 1, 2, 3];
      const up = swell(0.35, 0.2);
      const m: Model = { n: 0, s: 1, m: 0, fireN: false, fireS: false, step(r) {
        w += (ETA * r.forest * r.machine * src.overlap - GAMMA * w) * r.dt;
        m.n = w;
        m.fireN = up(src.overlap);
        m.fireS = false;
        if (r.frame) {
          let best = 0;
          for (let s = 1; s < 4; s++) if (src.share[s] > src.share[best]) best = s;
          const pos = order.indexOf(best);
          cost += (pos + 1 - cost) * (1 - Math.exp(-0.05 / 3));
          if (pos > 0) {
            for (let i = pos; i > 0; i--) order[i] = order[i - 1];
            order[0] = best;
            m.fireS = true;           // a new root: the structure splayed
          }
        }
        m.s = cost;
        m.m = src.overlap;
      } };
      return m;
    }
    // ADJUDICATED — a receptive field swept round the band circle, tuned to the
    // forest's centroid; Voronoi adjudication is the hard mask.
    case "s7": {
      const SIG = 0.35;
      let th = 0;
      const up = swell(0.9, 0.5);
      const m: Model & { theta: number } = { theta: 0, n: 0, s: 0, m: 0, fireN: false, fireS: false, step(r) {
        th = (th + r.dt * 0.35) % (Math.PI * 2);
        m.theta = th;
        let d = th - src.centroid[0] * Math.PI * 2;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        const g = Math.exp(-(d * d) / (2 * SIG * SIG));
        m.n = (0.3 + 0.7 * r.forest) * g;
        m.fireN = up(g) && r.forest > 0.15;
        m.s = src.share[1];
        m.fireS = r.block;
        m.m = src.share[0];
      } };
      return m;
    }
    // INSCRIBED — the forest forgets (R = e^{−t/S}); the ledger is a cache
    // hierarchy over the spectrogram, L1 the last 0.4 s, L2 to 2 s, L3 to 6 s.
    case "s8": {
      const S = 8, T_HIT = [1, 4, 16], T_MISS = 64;
      const LEVELS: [number, number, number][] = [[1, 8, 1], [9, 40, 2], [41, ROWS - 1, 4]];
      const row = new Float32Array(NB);
      let tLast = -1e9, amat = 1;
      const up = swell(0.72, 0.5);
      const m: Model = { n: 0, s: 1, m: 0, fireN: false, fireS: false, step(r) {
        m.fireN = up(r.forest);
        if (m.fireN) tLast = r.now;
        m.n = Math.exp(-(r.now - tLast) / S);
        if (r.frame) {
          const cur = src.spec[0];
          let cn = 0;
          for (let i = 0; i < NB; i++) cn += cur[i] * cur[i];
          let t = T_MISS;
          if (cn < 1e-4) t = T_HIT[0];
          else {
            search: for (let L = 0; L < 3; L++) {
              const [a, b, step] = LEVELS[L];
              for (let age = a; age <= b; age += step) {
                sourceRow(0, age, row);
                let dot = 0, rn = 0;
                for (let i = 0; i < NB; i++) { dot += cur[i] * row[i]; rn += row[i] * row[i]; }
                if (rn > 1e-6 && dot / Math.sqrt(cn * rn) > 0.93) { t = T_HIT[L]; break search; }
              }
            }
          }
          amat += (t - amat) * (1 - Math.exp(-0.05 / 2));
        }
        m.s = amat;
        m.fireS = r.block;
        m.m = r.lam;
      } };
      return m;
    }
    // OPAQUE — the fly's olfactory hash on the forest (Dasgupta et al. 2017):
    // 256 Kenyon cells, each summing 6 random bands; the 12 most active win.
    // Beside it, the block's keccak256 as bits. A fraction of both, set by the
    // opacity clause, is never shown.
    default: {
      const KC = 256, FAN = 6, WIN = 12;
      const r0 = rng(9091);
      const M = new Uint8Array(KC * FAN);
      for (let i = 0; i < M.length; i++) M[i] = Math.floor(r0() * NB);
      const y = new Float32Array(KC), cut = new Float32Array(KC);
      const fly = new Uint8Array(KC), flyAt = new Uint8Array(KC);
      const kec = new Uint8Array(256), kecPrev = new Uint8Array(256);
      let blockSeq = -1;
      const up = swell(0.72, 0.5);
      const m: Model & { fly: Uint8Array; kec: Uint8Array; withheld: number; changed: boolean } = {
        fly, kec, withheld: 0, changed: true,
        n: 0, s: 0.5, m: 0, fireN: false, fireS: false,
        onLaunchN() { flyAt.set(fly); },
        step(r) {
          if (r.frame) {
            const sp = src.spec[0];
            for (let k = 0; k < KC; k++) {
              let v = 0;
              for (let j = 0; j < FAN; j++) v += sp[M[k * FAN + j]];
              y[k] = v; cut[k] = v;
            }
            // the WIN-th largest activity is the threshold (partial selection)
            cut.sort();
            const th = cut[KC - WIN];
            let won = 0;
            for (let k = 0; k < KC; k++) { const b = y[k] >= th && th > 0 && won < WIN ? 1 : 0; won += b; fly[k] = b; }
            let inter = 0, uni = 0;
            for (let k = 0; k < KC; k++) { inter += fly[k] & flyAt[k]; uni += fly[k] | flyAt[k]; }
            m.n = uni ? inter / uni : 0;
            m.changed = true;
          }
          m.fireN = up(r.forest);
          const log = getEthBlockLog();
          m.fireS = false;
          if (log.seq !== blockSeq && log.items.length) {
            blockSeq = log.seq;
            const h = log.items[log.items.length - 1].hash;
            if (h) {
              kecPrev.set(kec);
              const hex = h.replace(/^0x/, "");
              for (let i = 0; i < 64; i++) {
                const nib = parseInt(hex[i] ?? "0", 16) || 0;
                for (let b = 0; b < 4; b++) kec[i * 4 + b] = (nib >> (3 - b)) & 1;
              }
              let diff = 0;
              for (let i = 0; i < 256; i++) diff += kec[i] ^ kecPrev[i];
              m.s = diff / 256;
              m.fireS = true;
              m.changed = true;
            }
          }
          const w = pheno("opacityFloor", 0) * 0.7;
          if (Math.abs(w - m.withheld) > 0.004) { m.withheld = w; m.changed = true; }
          m.m = m.withheld;
        },
      };
      return m;
    }
  }
}

// ── The layer ────────────────────────────────────────────────────────────────
type Flight = {
  side: Side;
  tex: TexMobject;
  hint: TexMobject;
  num: DecimalNumber;
  path: THREE.CubicBezierCurve3;
  t0: number;
  dur: number;
  /** Seconds at the meeting point before giving up and flying on. */
  wait: number;
  state: "idle" | "in" | "waiting" | "out" | "meeting";
};

export type BlendLayer = { tick: () => void; destroy: () => void };

export function attachBlendLayer(slot: SlotKey, scene: THREE.Scene, camera: THREE.PerspectiveCamera, dist: number): BlendLayer {
  const text = TEXT[slot];
  const root = new THREE.Group();
  root.name = `blend-${slot}`;
  scene.add(root);
  const animator = new Animator();
  const EM = dist * 0.03;
  const FLOOR = -dist * 0.36;
  let destroyed = false;
  const model = makeModel(slot);
  const src = getSources();
  const eth = getEthLive();

  // ── The spectrogram ground ───────────────────────────────────────────────
  const SIZE = dist * 1.5;
  const N = 48;
  let surface: THREE.LineSegments | null = null;
  let surfMat: THREE.ShaderMaterial | null = null;
  const terrData = new Uint8Array(8 * 8 * 4);
  const terrace = new Float32Array(64);
  let terrTex: THREE.DataTexture | null = null;
  if (GROUND[slot] === "surface") {
    const pos = new Float32Array((N + 1) * (N + 1) * 3);
    const idx: number[] = [];
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const k = j * (N + 1) + i;
      pos[k * 3] = (i / N - 0.5) * SIZE;
      pos[k * 3 + 2] = (j / N - 0.5) * SIZE;
      if (i < N) idx.push(k, k + 1);
      if (j < N) idx.push(k, k + N + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    terrTex = new THREE.DataTexture(terrData, 8, 8, THREE.RGBAFormat);
    terrTex.needsUpdate = true;
    surfMat = new THREE.ShaderMaterial({
      vertexShader: SURFACE_VS, fragmentShader: SURFACE_FS,
      transparent: true, depthWrite: false,
      uniforms: {
        uHist: { value: sourcesTexture() }, uTerr: { value: terrTex },
        uRow: { value: 0 }, uLam: { value: 0.5 }, uAmp: { value: dist * 0.16 }, uSize: { value: SIZE },
        uForest: { value: 0 }, uOpacity: { value: 0 },
        uN: { value: new THREE.Color(INK.neuronal) }, uS: { value: new THREE.Color(INK.silicon) },
      },
    });
    surface = new THREE.LineSegments(geo, surfMat);
    surface.frustumCulled = false;
    surface.position.y = FLOOR;
    root.add(surface);
  }

  // ── The grove ────────────────────────────────────────────────────────────
  const TREES = GROUND[slot] === "grove" ? 4 : 0;
  const groveForms = Array.from({ length: TREES }, (_, t) => treeForms(dist * 0.4, 1009 * (t + 1) + slot.charCodeAt(1)));
  const grovePos = new Float32Array(TREES * (NODES - 1) * 2 * 3);
  const groveCol = new Float32Array(TREES * (NODES - 1) * 2 * 3);
  const groveGeo = new THREE.BufferGeometry();
  groveGeo.setAttribute("position", new THREE.BufferAttribute(grovePos, 3));
  groveGeo.setAttribute("color", new THREE.BufferAttribute(groveCol, 3));
  const groveMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false });
  const grove = new THREE.LineSegments(groveGeo, groveMat);
  grove.frustumCulled = false;
  grove.position.y = FLOOR;
  grove.visible = TREES > 0;
  root.add(grove);
  const treeAt = Array.from({ length: TREES }, (_, t) => {
    // round the structure's flanks and behind it, never in front of it
    const a = Math.PI * (0.05 + (t / Math.max(1, TREES - 1)) * 0.9) + Math.PI;
    return new THREE.Vector3(Math.cos(a) * dist * 0.72, 0, Math.sin(a) * dist * 0.5 - dist * 0.15);
  });
  /** Pulses running from a tip to the root, pooled: which tree, which leaf, when, which colour. */
  const PULSES = 24;
  const pulseTree = new Int16Array(PULSES), pulseLeaf = new Int16Array(PULSES);
  const pulseT0 = new Float64Array(PULSES).fill(-1e9);
  const pulseCol = Array.from({ length: PULSES }, () => new THREE.Color());
  let pulseNext = 0;
  const firstLeaf = (1 << (TREE_DEPTH - 1)) - 1;
  const PULSE_S = 1.6;                       // tip to root
  const lit = new Float32Array(NODES);

  // scratch objects: nothing is allocated per frame (garbage reaches the audio)
  const gBase = new THREE.Color(), gTint = new THREE.Color(), gC = new THREE.Color();
  const gN = new THREE.Color(INK.neuronal), gS = new THREE.Color(INK.silicon);
  const gA = new THREE.Vector3(), gB = new THREE.Vector3();

  function nodeAt(tr: number, n: number, lamNow: number, t: number, out: THREE.Vector3) {
    const { organic, merkle } = groveForms[tr];
    out.copy(organic[n]).lerp(merkle[n], lamNow);
    // the dendrite sways a little; the ledger does not
    if (n > 0) out.x += Math.sin(t * 0.7 + n * 0.37) * dist * 0.004 * (1 - lamNow);
    return out.add(treeAt[tr]);
  }

  function updateGrove(lamNow: number, t: number, forest: number, chain: number) {
    let o = 0;
    gBase.copy(gN).lerp(gS, lamNow);
    const glow = 0.25 + 0.35 * Math.max(forest, chain);
    for (let tr = 0; tr < TREES; tr++) {
      // which nodes a pulse is passing now (leaf first, root last)
      lit.fill(0);
      gTint.setRGB(0, 0, 0);
      for (let p = 0; p < PULSES; p++) {
        if (pulseTree[p] !== tr) continue;
        const u = (t - pulseT0[p]) / PULSE_S;
        if (u < 0 || u > 1.15) continue;
        let n = pulseLeaf[p];
        for (let L = TREE_DEPTH - 1; L >= 0 && n >= 0; L--) {
          const k = Math.max(0, 1 - Math.abs(u - (1 - L / (TREE_DEPTH - 1))) * 5);
          if (k > lit[n]) lit[n] = k;
          n = (n - 1) >> 1;
        }
        gTint.copy(pulseCol[p]);
      }
      for (let i = 1; i < NODES; i++) {
        const p = (i - 1) >> 1;
        nodeAt(tr, p, lamNow, t, gA);
        nodeAt(tr, i, lamNow, t, gB);
        const j = o * 6;
        grovePos[j] = gA.x; grovePos[j + 1] = gA.y; grovePos[j + 2] = gA.z;
        grovePos[j + 3] = gB.x; grovePos[j + 4] = gB.y; grovePos[j + 5] = gB.z;
        const level = Math.floor(Math.log2(i + 1));
        const fade = glow * (0.55 + 0.45 * (1 - level / TREE_DEPTH));
        gC.copy(gBase).multiplyScalar(fade).lerp(gTint, Math.min(1, lit[p]));
        groveCol[j] = gC.r; groveCol[j + 1] = gC.g; groveCol[j + 2] = gC.b;
        gC.copy(gBase).multiplyScalar(fade).lerp(gTint, Math.min(1, lit[i]));
        groveCol[j + 3] = gC.r; groveCol[j + 4] = gC.g; groveCol[j + 5] = gC.b;
        o++;
      }
    }
    groveGeo.attributes.position.needsUpdate = true;
    groveGeo.attributes.color.needsUpdate = true;
  }

  function pulse(color: number) {
    if (!TREES) return;
    const p = pulseNext; pulseNext = (pulseNext + 1) % PULSES;
    pulseTree[p] = Math.floor(Math.random() * TREES);
    pulseLeaf[p] = firstLeaf + Math.floor(Math.random() * (NODES - firstLeaf));
    pulseT0[p] = performance.now() / 1000;
    pulseCol[p].set(color);
  }

  // ── Slot 7: the source-split spectrum round the radar ────────────────────
  // 96 bands laid round a circle, each at its source's colour — the hard mask
  // drawn as territory — and the receptive field's sweep as one spoke.
  let polar: THREE.LineLoop | null = null, spoke: THREE.Line | null = null;
  const polarPos = new Float32Array(NB * 3), polarCol = new Float32Array(NB * 3);
  const srcCol = SRC_INK.map((c) => new THREE.Color(c));
  if (slot === "s7") {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(polarPos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(polarCol, 3));
    polar = new THREE.LineLoop(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.75, depthWrite: false }));
    polar.frustumCulled = false;
    root.add(polar);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
    spoke = new THREE.Line(sg, new THREE.LineBasicMaterial({ color: INK.accent, transparent: true, opacity: 0.6, depthWrite: false }));
    spoke.frustumCulled = false;
    root.add(spoke);
  }
  function updatePolar(theta: number) {
    if (!polar || !spoke) return;
    const R0 = dist * 0.2, A = dist * 0.16;
    for (let i = 0; i < NB; i++) {
      const a = (i / NB) * Math.PI * 2;
      let v = 0;
      for (let s = 0; s < 4; s++) v += src.spec[s][i];
      const rr = R0 + Math.min(1.2, v) * A;
      polarPos[i * 3] = Math.cos(a) * rr; polarPos[i * 3 + 1] = Math.sin(a) * rr; polarPos[i * 3 + 2] = 0;
      const c = srcCol[src.win[i]];
      const k = 0.35 + 0.65 * Math.min(1, v * 1.6);
      polarCol[i * 3] = c.r * k; polarCol[i * 3 + 1] = c.g * k; polarCol[i * 3 + 2] = c.b * k;
    }
    polar.geometry.attributes.position.needsUpdate = true;
    polar.geometry.attributes.color.needsUpdate = true;
    const sp = spoke.geometry.attributes.position.array as Float32Array;
    sp[3] = Math.cos(theta) * (R0 + A * 1.3); sp[4] = Math.sin(theta) * (R0 + A * 1.3);
    spoke.geometry.attributes.position.needsUpdate = true;
  }

  // ── Slot 9: the two fingerprints as bit grids ────────────────────────────
  // 16 × 16 cells each. Lit = a 1; dark = a 0; a grey block = a bit withheld
  // by the opacity clause — the same cells on both, chosen by a fixed shuffle,
  // so turning OPAC up blanks the same part of the forest's print and the
  // chain's.
  let grids: THREE.InstancedMesh[] = [];
  const gridAt = [new THREE.Vector3(-dist * 0.46, dist * 0.08, dist * 0.05), new THREE.Vector3(dist * 0.46, dist * 0.08, dist * 0.05)];
  const veil = new Uint16Array(256);
  {
    const r = rng(4243);
    for (let i = 0; i < 256; i++) veil[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = veil[i]; veil[i] = veil[j]; veil[j] = t; }
  }
  const veilRank = new Uint16Array(256);
  for (let i = 0; i < 256; i++) veilRank[veil[i]] = i;
  if (slot === "s9") {
    const cell = dist * 0.0085;
    const geo = new THREE.PlaneGeometry(cell * 0.82, cell * 0.82);
    const mtx = new THREE.Matrix4();
    grids = [0, 1].map((g) => {
      const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
      const im = new THREE.InstancedMesh(geo, mat, 256);
      for (let i = 0; i < 256; i++) {
        mtx.makeTranslation(((i % 16) - 7.5) * cell, (7.5 - Math.floor(i / 16)) * cell, 0);
        im.setMatrixAt(i, mtx);
        im.setColorAt(i, gC.set(0x111111));
      }
      im.position.copy(gridAt[g]);
      im.frustumCulled = false;
      root.add(im);
      return im;
    });
  }
  const cOn = [new THREE.Color(INK.neuronal), new THREE.Color(INK.silicon)];
  const cOff = new THREE.Color(0x14181a), cVeil = new THREE.Color(0x3a3a3a);
  function updateGrids() {
    const mm = model as unknown as { fly: Uint8Array; kec: Uint8Array; withheld: number; changed: boolean };
    if (!grids.length || !mm.changed) return;
    mm.changed = false;
    const hidden = Math.round(mm.withheld * 256);
    for (let g = 0; g < 2; g++) {
      const bits = g === 0 ? mm.fly : mm.kec;
      for (let i = 0; i < 256; i++) {
        grids[g].setColorAt(i, veilRank[i] < hidden ? cVeil : bits[i] ? cOn[g] : cOff);
      }
      grids[g].instanceColor!.needsUpdate = true;
    }
  }

  // ── Formulas in flight, built once and reused ────────────────────────────
  const flights: Partial<Record<Side, Flight>> = {};
  let blend: TexMobject | null = null, meetHint: TexMobject | null = null, meetNum: DecimalNumber | null = null;
  const meetGroup = new THREE.Group();
  meetGroup.visible = false;
  root.add(meetGroup);
  let header: TexMobject | null = null;
  let meeting = false;
  const meetAt = new THREE.Vector3(0, dist * 0.18, dist * 0.32);

  async function build() {
    const law = (side: Side) => TexMobject.create(text[side].law, { size: EM, color: INK[side], stroke: EM * 0.04 });
    const hint = (side: Side | "blend", line: string) =>
      TexMobject.create(texText(line), { size: EM * 0.42, color: INK[side], stroke: EM * 0.02, cache: false });
    const [hd, nL, sL, nH, sH, bl, bH, nN, sN, bN] = await Promise.all([
      TexMobject.create(text.header, { size: EM * 0.5, color: INK.blend, stroke: EM * 0.02, cache: false }),
      law("neuronal"), law("silicon"),
      hint("neuronal", text.computes.neuronal), hint("silicon", text.computes.silicon),
      TexMobject.create(text.blend?.mixed ?? text.generic, {
        size: EM * 1.05, color: INK.blend, stroke: EM * 0.04,
        parts: { I: INK.neuronal, x: INK.neuronal, eta: INK.neuronal, g: INK.silicon, v: INK.silicon, lam: INK.accent },
      }),
      hint("blend", text.computes.meet),
      DecimalNumber.create({ size: EM * 0.7, color: INK.neuronal }),
      DecimalNumber.create({ size: EM * 0.7, color: INK.silicon }),
      DecimalNumber.create({ size: EM * 0.8, color: INK.accent }),
    ]);
    const all = [hd, nL, sL, nH, sH, bl, bH];
    if (destroyed) { for (const t of all) t.dispose(); nN.dispose(); sN.dispose(); bN.dispose(); return; }

    // The header: the stage, written once, then held at the top of the view.
    header = hd;
    for (const g of hd.glyphs) {
      g.setFill({ opacity: 0.78 });
      g.fillMat.depthTest = false; g.strokeMat.depthTest = false;
      g.setAlpha(0, 0);
    }
    root.add(hd);
    void animator.play(new Write(hd.glyphs, 0.4), 2.6);

    const mk = (side: Side, tex: TexMobject, hint: TexMobject, num: DecimalNumber): Flight => {
      for (const g of tex.glyphs) { g.visible = false; g.setAlpha(0, 0); }
      for (const g of hint.glyphs) { g.visible = false; g.setAlpha(0, 0); }
      num.position.set(tex.width / 2 + EM * 0.4, -EM * 0.2, 0);
      num.visible = false;
      hint.position.set(0, -(tex.height / 2 + EM * 0.75), 0);
      tex.add(num); tex.add(hint);
      return {
        side, tex, hint, num, path: new THREE.CubicBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()),
        t0: 0, dur: 7, wait: 7, state: "idle",
      };
    };
    flights.neuronal = mk("neuronal", nL, nH, nN);
    flights.silicon = mk("silicon", sL, sH, sN);

    blend = bl; meetHint = bH; meetNum = bN;
    for (const g of bl.glyphs) { g.visible = false; g.setAlpha(0, 0); }
    for (const g of bH.glyphs) { g.visible = false; g.setAlpha(0, 0); }
    bH.position.set(0, -(bl.height / 2 + EM * 0.8), 0);
    bN.position.set(bl.width / 2 + EM * 0.5, -EM * 0.2, 0);
    bN.visible = false;
    meetGroup.add(bl, bH, bN);
  }
  void build();

  function launch(side: Side) {
    const f = flights[side];
    if (!f || f.state !== "idle" || destroyed) return;
    const s = side === "neuronal" ? -1 : 1;
    const y = dist * (0.05 + Math.random() * 0.3);
    f.path.v0.set(s * dist * 0.95, y, -dist * (0.2 + Math.random() * 0.4));
    f.path.v1.set(s * dist * 0.75, y + dist * 0.25, dist * 0.1);
    f.path.v2.set(s * dist * 0.35, meetAt.y + dist * 0.12, meetAt.z + dist * 0.1);
    f.path.v3.copy(meetAt).x += s * EM * 6;
    f.path.getPoint(0, f.tex.position);
    f.t0 = performance.now() / 1000;
    f.dur = 6 + Math.random() * 2;
    f.state = "in";
    f.num.visible = true;
    root.add(f.tex);
    void animator.play(new Write(f.tex.glyphs), 2.2);
    void animator.play(new Write(f.hint.glyphs, 0.3), 2.6, undefined, 0.8);
    if (side === "neuronal") model.onLaunchN?.();
  }

  function land(f: Flight) {
    root.remove(f.tex);
    for (const g of f.tex.glyphs) g.visible = false;
    for (const g of f.hint.glyphs) g.visible = false;
    f.num.visible = false;
    f.state = "idle";
  }

  async function meet(a: Flight, b: Flight) {
    if (!blend || !meetHint || !meetNum) return;
    meeting = true;
    a.state = b.state = "meeting";
    meetGroup.position.copy(meetAt);
    meetGroup.quaternion.copy(camera.quaternion);
    meetGroup.visible = true;
    root.updateMatrixWorld(true);
    animator.play(new Flash(root, meetAt.clone(), INK.accent, EM * 3, 16, EM * 0.06), 0.9);
    a.num.visible = b.num.visible = false;
    void animator.play(new FadeGlyphs([...a.hint.glyphs, ...b.hint.glyphs], false), 0.8);
    await animator.play(new TransformMatchingParts([...a.tex.glyphs, ...b.tex.glyphs], blend.glyphs, root), 1.8);
    if (destroyed) return;
    land(a); land(b);
    meetNum.visible = true;
    await animator.play(new Write(meetHint.glyphs, 0.3), 1.8);
    // One sentence of the lexicon under it, in turn, so all of them are seen.
    const lines = text.lexicon;
    const line = lines[lexNext[slot] % lines.length];
    lexNext[slot]++;
    const lex = await TexMobject.create(texText(line), { size: EM * 0.55, color: INK.accent, stroke: EM * 0.025, cache: false });
    if (destroyed) { lex.dispose(); return; }
    for (const g of lex.glyphs) g.setAlpha(0, 0);
    lex.position.set(0, meetHint.position.y - EM * 1.3, 0);
    meetGroup.add(lex);
    // the blend rises and dissolves
    // Slowly: about 0.09·dist over its life. At 0.022 it climbed through the
    // stage line at the top of the view (seen on slot 9).
    const rise = animator.addUpdater((dt) => { meetGroup.position.y += dt * dist * 0.008; });
    await animator.play(new Write(lex.glyphs, 0.25), 3.2);
    await animator.play({ begin() {}, interpolate() {}, finish() {} }, 4.5);
    if (destroyed) { lex.dispose(); return; }
    meetNum.visible = false;
    await animator.play(new Unwrite([...blend.glyphs, ...meetHint.glyphs, ...lex.glyphs]), 1.8);
    rise();
    meetGroup.remove(lex);
    lex.dispose();
    for (const g of blend.glyphs) g.visible = false;
    for (const g of meetHint.glyphs) g.visible = false;
    meetGroup.visible = false;
    meeting = false;
  }

  // ── Data → events ────────────────────────────────────────────────────────
  let lastBlockPulse = 0, lastTxPulse = 0, lastFrames = -1;
  let lastN = -99, lastS = -99, lastT = performance.now() / 1000;
  const R: Readings = { dt: 0, now: 0, forest: 0, machine: 0, lam: 0.5, frame: false, block: false, tx: false };
  const kForest = `blend:${slot}:forest`, kForestS = `blend:${slot}:f`;
  const kMach = `blend:${slot}:mach`, kMachS = `blend:${slot}:m`;
  const kChain = `blend:${slot}:c`, kLam = `blend:${slot}:lam`;
  const _fwd = new THREE.Vector3(), _up = new THREE.Vector3();
  const tanHalf = Math.tan(THREE.MathUtils.degToRad((camera.fov ?? 52) / 2));

  function tick() {
    if (destroyed) return;
    const now = performance.now() / 1000;
    const dt = Math.min(0.1, Math.max(0, now - lastT));
    lastT = now;
    const live = src.live;
    const rawForest = live ? src.energy[0] : getStem("corpus");
    R.forest = live || rawForest > 0 ? slew(kForestS, normLevel(kForest, rawForest, dt), 0.2, 0.8) : 0;
    R.machine = live ? slew(kMachS, normLevel(kMach, src.energy[1], dt), 0.2, 0.8) : 0;
    const chain = slew(kChain, eth.live ? 0.25 + eth.pulse * 0.75 : 0, 0.3, 2.0);
    R.lam = slew(kLam, chain + R.forest > 0.02 ? chain / (chain + R.forest) : 0.5, 0.8, 0.8);
    R.dt = dt; R.now = now;
    R.frame = src.frames !== lastFrames; lastFrames = src.frames;
    R.block = eth.blockPulse > 0.95 && lastBlockPulse <= 0.95; lastBlockPulse = eth.blockPulse;
    R.tx = eth.live && eth.pulse > 0.95 && lastTxPulse <= 0.95; lastTxPulse = eth.pulse;
    model.step(R);

    // the ground
    if (surface && surfMat && terrTex) {
      if (R.tx) terrace[Math.min(63, Math.floor(eth.addr * 64))] += 0.25 * (0.3 + eth.value);
      const decay = 1 - 0.06 * dt;
      for (let i = 0; i < 64; i++) {
        terrace[i] = Math.min(1, terrace[i] * decay);
        terrData[i * 4] = Math.round(terrace[i] * 255);
      }
      terrTex.needsUpdate = true;
      const u = surfMat.uniforms;
      // the newest row plus how far into the next 50 ms we are: a smooth scroll
      u.uRow.value = src.row + Math.min(1, (now - src.at) / 0.05);
      u.uLam.value = R.lam;
      u.uForest.value = R.forest;
      u.uOpacity.value = Math.min(0.42, u.uOpacity.value + 0.004);   // under the structure, never over it
      surface.rotation.y += 0.0009 * dt * 60;
    } else if (TREES) {
      updateGrove(R.lam, now, R.forest, chain);
      groveMat.opacity = Math.min(0.55, groveMat.opacity + 0.006);   // beside the structure, not over it
      grove.rotation.y += 0.0006 * dt * 60;
      // the forest's small events reach the trees too, not only the launches
      if (Math.random() < R.forest * 0.02) pulse(INK.neuronal);
      if (R.tx && Math.random() < 0.15) pulse(INK.silicon);
    }
    if (polar) updatePolar((model as unknown as { theta: number }).theta);
    if (grids.length) {
      updateGrids();
      for (const g of grids) g.quaternion.copy(camera.quaternion);
    }

    // launches: when the slot's own law says so, at most one per side per 5 s
    if (model.fireN && now - lastN > COOLDOWN) { lastN = now; launch("neuronal"); pulse(INK.neuronal); }
    if (model.fireS && now - lastS > COOLDOWN) { lastS = now; launch("silicon"); pulse(INK.silicon); pulse(INK.silicon); }

    // flights
    for (let k = 0; k < 2; k++) {
      const f = k === 0 ? flights.neuronal : flights.silicon;
      if (!f || f.state === "idle" || f.state === "meeting") continue;
      const u = Math.min(1, (now - f.t0) / f.dur);
      if (f.state === "in") {
        f.path.getPoint(smoothstep(u), f.tex.position);
        if (u >= 1) { f.state = "waiting"; f.t0 = now; }
      } else if (f.state === "waiting") {
        f.tex.position.y += Math.sin(now * 1.3) * EM * 0.004;
        if (now - f.t0 > f.wait) {
          f.state = "out"; f.t0 = now;
          const ff = f;
          void animator.play(new Unwrite([...f.tex.glyphs, ...f.hint.glyphs]), 2.4).then(() => land(ff));
        }
      } else if (f.state === "out") {
        // on through, the way it was going
        f.tex.position.x += (f.side === "neuronal" ? 1 : -1) * dist * 0.24 * dt;
        f.tex.position.z += dist * 0.12 * dt;
      }
      f.tex.quaternion.copy(camera.quaternion);
      f.num.setValue(f.side === "neuronal" ? model.n : model.s);
    }
    if (meetNum && meetNum.visible) meetNum.setValue(model.m);
    if (meeting) meetGroup.quaternion.copy(camera.quaternion);
    // a neuronal and a silicon both at the meeting point → the blend
    const nf = flights.neuronal, sf = flights.silicon;
    if (!meeting && nf && sf && nf.state === "waiting" && sf.state === "waiting") void meet(nf, sf);

    // the header rides with the view, at the top edge
    if (header) {
      const d = dist * 0.5;
      camera.getWorldDirection(_fwd);
      _up.set(0, 1, 0).applyQuaternion(camera.quaternion);
      header.position.copy(camera.position).addScaledVector(_fwd, d).addScaledVector(_up, tanHalf * d * 0.86);
      header.quaternion.copy(camera.quaternion);
    }

    animator.tick();
  }

  return {
    tick() { try { tick(); } catch (e) { console.warn(`[blend ${slot}]`, e); } },
    destroy() {
      destroyed = true;
      animator.clear();
      scene.remove(root);
      for (const f of [flights.neuronal, flights.silicon]) {
        if (!f) continue;
        // The number's digit shapes are shared by every slot (manim/vmobject
        // loadDigits); disposing them releases this renderer's listeners on
        // them — see the Sprite note in slots/stage.ts. They re-upload on use.
        f.tex.traverse((n: THREE.Object3D) => { (n as THREE.Mesh).geometry?.dispose?.(); });
        f.tex.dispose(); f.hint.dispose(); f.num.dispose();
      }
      blend?.dispose(); meetHint?.dispose(); meetNum?.dispose(); header?.dispose();
      root.traverse((n: any) => {
        if (n.isMesh || n.isLine || n.isLineSegments) { n.geometry?.dispose?.(); const m = n.material; for (const x of Array.isArray(m) ? m : [m]) x?.dispose?.(); }
      });
      terrTex?.dispose();
      // The spectrogram texture is shared by every slot (sources.ts); each
      // renderer that sampled it left a dispose listener on it, which kept
      // that renderer alive. Disposing runs and removes them; the next slot's
      // renderer uploads it again.
      if (surfMat) sourcesTexture().dispose();
    },
  };
}

function smoothstep(t: number) { return t * t * (3 - 2 * t); }
