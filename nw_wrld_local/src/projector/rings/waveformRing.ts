// waveformRing.ts
// The reference's innermost ring: the level of the bus drawn round the dial as
// an amber waveform, with a node where each voice of the engine struck and an
// arc bowing through the interior from one strike of a voice to its next.
//
// It turns with the same sweep as the spectrogram ring outside it, so a strike
// sits on the waveform exactly under the column of sound it produced. Nodes
// live one turn: the sweep overwrites the level under them, and they go with it.

import * as THREE from "three";
import { ArcBuffer } from "./ringPrims";
import { LiveFeeds } from "./liveFeeds";
import { VOICE_COLOR } from "./phenoData";
import { polar, TAU } from "./ringMath";

const VOICES = ["kick", "perc", "dust", "pad", "sample", "drone"];
const MAX_NODES = 120;

type Node = { voice: string; a: number; born: number; amp: number; pos: THREE.Vector3 };

export class WaveformRing {
  readonly group = new THREE.Group();
  private readonly n: number;
  private readonly env: Float32Array;
  private readonly band: THREE.Mesh;
  private readonly bandPos: Float32Array;
  private readonly bandCol: Float32Array;
  private readonly nodeMesh: THREE.InstancedMesh;
  private readonly arcs = new ArcBuffer(96, 24);
  private nodes: Node[] = [];
  private lastAt: Record<string, number> = {};
  private lastIdx = -1;
  private level = 0;
  private readonly tint = new THREE.Color(0xe8703a);
  private readonly tmpM = new THREE.Matrix4();
  private readonly tmpC = new THREE.Color();

  constructor(
    private rBase: number,
    private amp: number,
    private y: number,
    samples = 720,
    private a0 = 0,
    private span = TAU
  ) {
    this.n = samples;
    this.env = new Float32Array(samples);

    // Two vertices per sample, closed by repeating the first.
    this.bandPos = new Float32Array((samples + 1) * 2 * 3);
    this.bandCol = new Float32Array((samples + 1) * 2 * 3);
    const idx: number[] = [];
    for (let i = 0; i < samples; i++) {
      const p = i * 2;
      idx.push(p, p + 1, p + 2, p + 1, p + 3, p + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.bandPos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("color", new THREE.BufferAttribute(this.bandCol, 3).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(idx);
    this.band = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    this.band.frustumCulled = false;
    this.group.add(this.band);

    this.nodeMesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      MAX_NODES
    );
    this.nodeMesh.count = 0;
    this.nodeMesh.frustumCulled = false;
    this.group.add(this.nodeMesh);
    this.group.add(this.arcs.lines);
    this.writeBand(0);
  }

  /** The most recent strike of a voice still on the ring, for orbiters' arcs. */
  latest(voice: string): THREE.Vector3 | null {
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      if (this.nodes[i].voice === voice) return this.nodes[i].pos;
    }
    return null;
  }

  /**
   * frac: where the sweep stands (0..1). period: seconds per turn.
   * bow: how deep the arcs dive toward the centre (harmonic richness).
   */
  update(feeds: LiveFeeds, frac: number, period: number, bow: number, gain: number): void {
    const now = feeds.now;
    const head = Math.min(this.n - 1, Math.floor(frac * this.n));

    // Level: quick rise, slower fall — the waveform should show the strike,
    // then let it go, not flicker at the 20 Hz rate of the analysis.
    const target = feeds.masterLive ? Math.min(1, feeds.rms * 1.2) : 0;
    this.level += (target - this.level) * (target > this.level ? 0.5 : 0.12);
    if (this.lastIdx < 0) this.env[head] = this.level;
    else {
      let k = (head - this.lastIdx + this.n) % this.n;
      if (k > this.n / 2) k = 1;
      for (let j = 1; j <= k; j++) this.env[(this.lastIdx + j) % this.n] = this.level;
    }
    this.lastIdx = head;

    // New strikes become nodes, at the angle the sweep stands on.
    const a = this.a0 + frac * this.span;
    for (const v of VOICES) {
      const at = feeds.voiceAt(v);
      if (this.lastAt[v] === undefined) { this.lastAt[v] = at; continue; }
      if (at > 0 && at !== this.lastAt[v]) {
        this.lastAt[v] = at;
        const amp = Math.max(0.15, feeds.voiceAmp(v));
        this.nodes.push({ voice: v, a, born: now, amp, pos: polar(this.rBase - 0.02, a, this.y + 0.01) });
        if (this.nodes.length > MAX_NODES) this.nodes.shift();
      }
    }
    // A node lives one turn: the sweep is about to paint over its moment.
    const life = period * 0.97;
    this.nodes = this.nodes.filter((nd) => now - nd.born < life);

    this.writeBand(frac, gain);

    // Nodes.
    let c = 0;
    for (const nd of this.nodes) {
      const age = (now - nd.born) / life;
      const s = (0.035 + nd.amp * 0.05) * (1 - age * 0.5);
      this.tmpM.makeScale(s, s, s).setPosition(nd.pos);
      this.nodeMesh.setMatrixAt(c, this.tmpM);
      this.tmpC.setHex(VOICE_COLOR[nd.voice] ?? 0xffffff).multiplyScalar((1 - age * 0.7) * gain);
      this.nodeMesh.setColorAt(c, this.tmpC);
      c++;
    }
    this.nodeMesh.count = c;
    this.nodeMesh.instanceMatrix.needsUpdate = true;
    if (this.nodeMesh.instanceColor) this.nodeMesh.instanceColor.needsUpdate = true;

    // Arcs between successive strikes of the same voice.
    this.arcs.begin();
    const lastOf: Record<string, Node> = {};
    for (const nd of this.nodes) {
      const prev = lastOf[nd.voice];
      if (prev) {
        const age = (now - prev.born) / life;
        const sep = Math.min(1, Math.abs(nd.a - prev.a) / Math.PI);
        this.tmpC.setHex(VOICE_COLOR[nd.voice] ?? 0xffffff);
        this.arcs.add(prev.pos, nd.pos, this.tmpC, (1 - age) * 0.8 * gain,
          Math.min(0.95, 0.25 + bow * 0.5 + sep * 0.3));
      }
      lastOf[nd.voice] = nd;
    }
    this.arcs.end();
  }

  private writeBand(frac: number, gain = 1): void {
    const p = this.bandPos, col = this.bandCol;
    const v = new THREE.Vector3();
    for (let i = 0; i <= this.n; i++) {
      const k = i % this.n;
      const a = this.a0 + (i / this.n) * this.span;
      const e = this.env[i === this.n && this.span < TAU - 1e-6 ? this.n - 1 : k];
      const r1 = this.rBase + 0.01 + e * this.amp;
      const r0 = this.rBase - 0.01 - e * this.amp * 0.25;
      polar(r0, a, this.y, v); p[i * 6] = v.x; p[i * 6 + 1] = v.y; p[i * 6 + 2] = v.z;
      polar(r1, a, this.y, v); p[i * 6 + 3] = v.x; p[i * 6 + 4] = v.y; p[i * 6 + 5] = v.z;
      // Older samples dim with their age, so the direction of time reads.
      const age = ((frac - i / this.n) % 1 + 1) % 1;
      // A trace, not a slab: the reference's waveform is a thin warm line.
      const b = (0.18 + 0.55 * (1 - age)) * gain;
      const r = this.tint.r * b, g = this.tint.g * b, bl = this.tint.b * b;
      col[i * 6] = r; col[i * 6 + 1] = g; col[i * 6 + 2] = bl;
      col[i * 6 + 3] = r; col[i * 6 + 4] = g; col[i * 6 + 5] = bl;
    }
    const g = this.band.geometry;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.band.geometry.dispose();
    (this.band.material as THREE.Material).dispose();
    this.nodeMesh.geometry.dispose();
    (this.nodeMesh.material as THREE.Material).dispose();
    this.arcs.dispose();
  }
}
