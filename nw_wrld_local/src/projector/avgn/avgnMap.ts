// avgnMap.ts — the corpus's calls as a place, after AVGN
// ===========================================================================
// Every call tools/build_avgn.py found in the corpus is a point where UMAP put
// it: calls that look alike in the spectrogram sit together, and HDBSCAN's
// clusters are the call types of this forest. AVGN draws a recording as a
// line through that space, call to call in time order; here those lines are
// the curves.
//
//   points   every call, in its role's colour (the cluster's commonest role)
//   web      each recording's sequence, faint (slot 2 only)
//   live     the clips SuperCollider is sounding (/pheno/clip): their calls
//            lit amber, and a head walking their sequence on the recording's
//            own clock (one second of map per second of recording, from the
//            moment the clip began) with the last transitions as a trail.
//            SC's grain voice may stretch or seek the file; the walk follows
//            the recording, not the grain.
//   labels   one per cluster, and one for the clip being walked. As planes
//            in the scene (slot 2) they are drawn by the dome's own cameras,
//            so they read on the dome as on the screen; slot O names them
//            through its own label layer instead.
//
// Two shapes: a cloud (the 3-D projection, slot 2) or a disc lying in the
// dial at a given height (the 2-D projection, slot O). Art. 47: a unit whose
// clip opacity is ≥ 1 − floor is not drawn, as SuperCollider withholds it.

import * as THREE from "three";
import type { AvgnData } from "./avgnData";
import { roleInfo } from "../rings/phenoData";
import { faceCamera, labelPlane } from "../dome/domeFacing";

export type AvgnPlace = { dims: 3; radius: number } | { dims: 2; radius: number; y: number };

export type AvgnFeeds = {
  now: number;
  sounding: Map<string, { start: number }>;
  opacityFloor: number;
  /** 0 = todas, 1..4 = a bancada (clip.bancada == bancada − 1). */
  bancada: number;
};

export type AvgnOpts = {
  /** Draw every recording's sequence faintly. */
  web?: boolean;
  /** Labels in the scene, at this scale (1 = the standard reading size). */
  labels?: number;
  pointSize?: number;
};

const AMBER = new THREE.Color(0xffaa44);
const UNCLUSTERED = new THREE.Color(0x3a3d3c);
const RECORDING_S = 60;
const TRAIL = 24;
const SEGS = 6;
const MAX_LIVE_CLIPS = 8;
const LIT_CAP = 1024;
const FONT = "'IBM Plex Mono', 'SF Mono', Menlo, Consolas, monospace";
/** Cluster names shown at rest (the commonest); a sounding cluster is always named. */
const RESTING_NAMES = 12;
/** A round point, shared by every map. */
let _dot: THREE.CanvasTexture | null = null;
let _dotUsers = 0;
function dotTexture(): THREE.CanvasTexture {
  if (!_dot) {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const g = c.getContext("2d")!;
    const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.45, "rgba(255,255,255,0.8)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 32, 32);
    _dot = new THREE.CanvasTexture(c);
  }
  _dotUsers++;
  return _dot;
}
function releaseDot() {
  if (--_dotUsers <= 0 && _dot) { _dot.dispose(); _dot = null; _dotUsers = 0; }
}

export function clusterLabel(cl: { id: number; role: string; hz: number; ms: number; n: number }): [string, string] {
  return [
    `C${cl.id} · ${roleInfo(cl.role).label}`,
    `${(cl.hz / 1000).toFixed(1)} kHz · ${cl.ms} ms · ${cl.n} llamadas`,
  ];
}

export class AvgnMap {
  readonly group = new THREE.Group();
  private data: AvgnData;
  private place: AvgnPlace;
  private pos: Float32Array;
  private base: Float32Array;
  private hidden: Uint8Array;
  private points: THREE.Points;
  private web: THREE.LineSegments | null = null;
  private webBase: Float32Array | null = null;
  private lit: THREE.Points;
  private heads: THREE.Points;
  private trail: THREE.LineSegments;
  private floorKey = "";
  private gain = -1;
  /** Units walked now, newest clip last: [clipKey, head unit, previous heads]. */
  private walking: { key: string; head: number; from: number }[] = [];
  private litClusters = new Set<number>();
  // Labels
  private atlas: THREE.CanvasTexture | null = null;
  private sprites: THREE.Mesh[] = [];
  private spriteCluster: number[] = [];
  private liveCanvas: HTMLCanvasElement | null = null;
  private liveTex: THREE.CanvasTexture | null = null;
  private liveSprite: THREE.Mesh | null = null;
  private labelGeo: THREE.PlaneGeometry | null = null;
  private liveGeo: THREE.PlaneGeometry | null = null;
  private leaders: THREE.LineSegments | null = null;
  private leadBase: Float32Array | null = null;
  private leadKey = "";
  private liveText = "";
  private liveAt = 0;
  private clusterVisible: number[] = [];
  private v = new THREE.Vector3();
  private c = new THREE.Color();

  constructor(data: AvgnData, place: AvgnPlace, opts: AvgnOpts = {}) {
    this.data = data;
    this.place = place;
    const n = data.count;
    this.pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) this.unitPos(i, this.v).toArray(this.pos, i * 3);
    this.hidden = new Uint8Array(n);

    // Colours: the cluster's commonest role; unclustered calls in grey.
    this.base = new Float32Array(n * 3);
    const roleCol = data.clusters.map((cl) => new THREE.Color(roleInfo(cl.role).color));
    for (let i = 0; i < n; i++) {
      const k = data.c[i];
      (k > 0 ? roleCol[k - 1] : UNCLUSTERED).toArray(this.base, i * 3);
    }

    const dot = dotTexture();
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({
      size: opts.pointSize ?? 0.07, map: dot, vertexColors: true, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false;
    this.group.add(this.points);

    if (opts.web) this.buildWeb();

    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(LIT_CAP * 3), 3));
    lg.setDrawRange(0, 0);
    this.lit = new THREE.Points(lg, new THREE.PointsMaterial({
      size: (opts.pointSize ?? 0.07) * 1.8, map: dot, color: AMBER, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.lit.frustumCulled = false;

    const hg = new THREE.BufferGeometry();
    hg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAX_LIVE_CLIPS * 3), 3));
    hg.setDrawRange(0, 0);
    this.heads = new THREE.Points(hg, new THREE.PointsMaterial({
      size: (opts.pointSize ?? 0.07) * 5, map: dot, color: 0xfff2d8, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.heads.frustumCulled = false;

    const tv = MAX_LIVE_CLIPS * TRAIL * SEGS * 2;
    const tg = new THREE.BufferGeometry();
    tg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(tv * 3), 3));
    tg.setAttribute("color", new THREE.BufferAttribute(new Float32Array(tv * 3), 3));
    tg.setDrawRange(0, 0);
    this.trail = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.trail.frustumCulled = false;
    this.group.add(this.lit, this.trail, this.heads);

    if (opts.labels) this.buildLabels(opts.labels);
  }

  /** Where unit i sits, in the group's coordinates. */
  private unitPos(i: number, out: THREE.Vector3): THREE.Vector3 {
    const d = this.data;
    const R = this.place.radius;
    if (this.place.dims === 3) return out.set(d.p3[i * 3] * R, d.p3[i * 3 + 1] * R, d.p3[i * 3 + 2] * R);
    return out.set(d.p2[i * 2] * R, this.place.y, d.p2[i * 2 + 1] * R);
  }

  /** Where a cluster's label goes, in the group's coordinates. */
  clusterPos(k: number, out: THREE.Vector3): THREE.Vector3 {
    const cl = this.data.clusters[k];
    const R = this.place.radius;
    if (this.place.dims === 3) return out.set(cl.c3[0] * R, cl.c3[1] * R, cl.c3[2] * R);
    return out.set(cl.c2[0] * R, this.place.y + 0.02, cl.c2[1] * R);
  }

  /** The curve between two calls, written as SEGS segments from `at`. */
  private curve(a: number, b: number, arr: Float32Array, at: number): number {
    const p = this.pos;
    const ax = p[a * 3], ay = p[a * 3 + 1], az = p[a * 3 + 2];
    const bx = p[b * 3], by = p[b * 3 + 1], bz = p[b * 3 + 2];
    let mx = (ax + bx) / 2, my = (ay + by) / 2, mz = (az + bz) / 2;
    const dist = Math.hypot(bx - ax, by - ay, bz - az);
    // A cloud bows its curves toward the centre, as slot 2's own Bézier
    // web does; a disc lifts them into arches over the dial.
    if (this.place.dims === 3) { mx *= 0.55; my *= 0.55; mz *= 0.55; }
    else my += dist * 0.35;
    let px = ax, py = ay, pz = az;
    for (let s = 1; s <= SEGS; s++) {
      const t = s / SEGS, it = 1 - t;
      const qa = it * it, qb = 2 * it * t, qc = t * t;
      const cx = qa * ax + qb * mx + qc * bx;
      const cy = qa * ay + qb * my + qc * by;
      const cz = qa * az + qb * mz + qc * bz;
      arr[at++] = px; arr[at++] = py; arr[at++] = pz;
      arr[at++] = cx; arr[at++] = cy; arr[at++] = cz;
      px = cx; py = cy; pz = cz;
    }
    return at;
  }

  private buildWeb(): void {
    const d = this.data;
    let pairs = 0;
    for (let i = 1; i < d.count; i++) if (d.clip[i] === d.clip[i - 1]) pairs++;
    const verts = pairs * SEGS * 2;
    const pos = new Float32Array(verts * 3);
    this.webBase = new Float32Array(verts * 3);
    let at = 0;
    for (let i = 1; i < d.count; i++) {
      if (d.clip[i] !== d.clip[i - 1]) continue;
      const from = at;
      at = this.curve(i - 1, i, pos, at);
      // Coloured by the call the transition leaves from.
      for (let v = from; v < at; v += 3) {
        this.webBase[v] = this.base[(i - 1) * 3];
        this.webBase[v + 1] = this.base[(i - 1) * 3 + 1];
        this.webBase[v + 2] = this.base[(i - 1) * 3 + 2];
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
    this.web = new THREE.LineSegments(g, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.web.frustumCulled = false;
    this.group.add(this.web);
  }

  // ── Labels in the scene ───────────────────────────────────────────────
  // One atlas for the cluster names (drawn once, uploaded once; each label
  // shows its cell), and one small canvas for the walked clip, redrawn only
  // when its words change. Nothing here is uploaded per frame.
  //
  // Planes that turn to whichever camera draws them, the dome's included
  // (dome/domeFacing.ts); not THREE.Sprite, which the dome turns 180°.
  private buildLabels(h: number): void {
    const k = this.data.clusters.length;
    const CW = 512, CH = 64;
    const cols = 2, rows = Math.ceil(k / cols);
    const canvas = document.createElement("canvas");
    canvas.width = CW * cols;
    canvas.height = THREE.MathUtils.ceilPowerOfTwo(Math.max(CH, rows * CH));
    const g = canvas.getContext("2d")!;
    g.textBaseline = "top";
    this.data.clusters.forEach((cl, i) => {
      const x = (i % cols) * CW, y = Math.floor(i / cols) * CH;
      const [l1, l2] = clusterLabel(cl);
      g.font = `600 27px ${FONT}`;
      const w1 = g.measureText(l1).width;
      g.font = `20px ${FONT}`;
      const w2 = g.measureText(l2).width;
      g.fillStyle = "rgba(0,0,0,0.55)";
      g.fillRect(x, y + 2, Math.min(CW - 4, 18 + Math.max(w1, w2)), CH - 4);
      g.font = `600 27px ${FONT}`;
      g.fillStyle = "#" + new THREE.Color(roleInfo(cl.role).color).lerp(new THREE.Color(0xffffff), 0.45).getHexString();
      g.fillText(l1, x + 8, y + 5);
      g.font = `20px ${FONT}`;
      g.fillStyle = "rgba(230,230,220,0.85)";
      g.fillText(l2, x + 8, y + 36);
    });
    this.atlas = new THREE.CanvasTexture(canvas);
    this.atlas.colorSpace = THREE.SRGBColorSpace;
    this.atlas.minFilter = THREE.LinearFilter;
    this.atlas.generateMipmaps = false;
    // Anchored at the left edge, centred vertically: the name starts at its leader.
    this.labelGeo = labelPlane();
    // As in AVGN's figures, the names sit round the outside of the cloud and
    // a leader runs to each cluster: inside, they were lost in its core.
    const at = this.labelPlaces();
    const lead = new Float32Array(k * 6);
    const leadCol = new Float32Array(k * 6);
    for (let i = 0; i < k; i++) {
      this.clusterPos(i, this.v).toArray(lead, i * 6);
      at[i].toArray(lead, i * 6 + 3);
      this.c.setHex(roleInfo(this.data.clusters[i].role).color).multiplyScalar(0.6);
      this.c.toArray(leadCol, i * 6);
      this.c.toArray(leadCol, i * 6 + 3);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.BufferAttribute(lead, 3));
    lg.setAttribute("color", new THREE.BufferAttribute(new Float32Array(k * 6), 3));
    this.leadBase = leadCol;
    this.leaders = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.leaders.frustumCulled = false;
    this.group.add(this.leaders);
    for (let i = 0; i < k; i++) {
      const tex = this.atlas.clone();   // shares the atlas's image: one upload
      tex.repeat.set(CW / canvas.width, CH / canvas.height);
      tex.offset.set(((i % cols) * CW) / canvas.width, 1 - ((Math.floor(i / cols) + 1) * CH) / canvas.height);
      const sp = new THREE.Mesh(this.labelGeo, new THREE.MeshBasicMaterial({
        map: tex, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
      }));
      sp.userData.aspect = CW / CH;
      faceCamera(sp, h);
      sp.renderOrder = 10;
      sp.position.copy(at[i]);
      this.group.add(sp);
      this.sprites.push(sp);
      this.spriteCluster.push(i + 1);
    }

    this.liveCanvas = document.createElement("canvas");
    this.liveCanvas.width = 1024;
    this.liveCanvas.height = 64;
    this.liveTex = new THREE.CanvasTexture(this.liveCanvas);
    this.liveTex.colorSpace = THREE.SRGBColorSpace;
    this.liveTex.minFilter = THREE.LinearFilter;
    this.liveTex.generateMipmaps = false;
    // Anchored just above and right of the head it names.
    this.liveGeo = labelPlane();
    this.liveSprite = new THREE.Mesh(this.liveGeo, new THREE.MeshBasicMaterial({
      map: this.liveTex, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.liveSprite.userData.aspect = 16;
    this.liveSprite.userData.ay = 0.7;
    faceCamera(this.liveSprite, h * 1.15);
    this.liveSprite.renderOrder = 11;
    this.liveSprite.visible = false;
    this.group.add(this.liveSprite);
  }

  /**
   * Where each cluster's name goes: out along its centroid's direction, past
   * the cloud, the directions pushed apart until no two names start closer
   * than ~16°.
   */
  private labelPlaces(): THREE.Vector3[] {
    const k = this.data.clusters.length;
    const R = this.place.radius * 1.12;
    const dirs = this.data.clusters.map((_, i) => {
      const v = this.clusterPos(i, new THREE.Vector3());
      if (this.place.dims === 2) v.y = 0;
      return v.lengthSq() > 1e-6 ? v.normalize() : new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), i);
    });
    const minCos = Math.cos(16 * Math.PI / 180);
    const push = new THREE.Vector3();
    for (let it = 0; it < 80; it++) {
      let moved = false;
      for (let a = 0; a < k; a++) {
        for (let b = a + 1; b < k; b++) {
          if (dirs[a].dot(dirs[b]) < minCos) continue;
          push.subVectors(dirs[a], dirs[b]);
          if (push.lengthSq() < 1e-8) push.set(0.01 * (a - b), 0.01, 0);
          push.normalize().multiplyScalar(0.03);
          dirs[a].add(push).normalize();
          dirs[b].sub(push).normalize();
          if (this.place.dims === 2) { dirs[a].y = 0; dirs[a].normalize(); dirs[b].y = 0; dirs[b].normalize(); }
          moved = true;
        }
      }
      if (!moved) break;
    }
    return dirs.map((d) => {
      const v = d.multiplyScalar(R);
      if (this.place.dims === 2) v.y = this.place.y + 0.02;
      return v;
    });
  }

  private drawLive(text: string): void {
    const c = this.liveCanvas!;
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, c.width, c.height);
    g.font = `600 30px ${FONT}`;
    const w = Math.min(c.width, g.measureText(text).width + 20);
    g.fillStyle = "rgba(0,0,0,0.6)";
    g.fillRect(0, 6, w, 52);
    g.fillStyle = "#ffcf8a";
    g.textBaseline = "middle";
    g.fillText(text, 10, 33);
    this.liveTex!.needsUpdate = true;
  }

  /** The words for the clip being walked. */
  liveLine(): string {
    const w = this.walking[this.walking.length - 1];
    if (!w) return "";
    const d = this.data;
    const ci = d.clip[w.head];
    const key = d.clipKeys[ci];
    const hhmm = /^\d{8}_(\d{2})(\d{2})/.exec(key);
    const seq: string[] = [];
    for (let i = Math.max(w.from, w.head - 4); i <= w.head; i++) seq.push(d.c[i] > 0 ? `C${d.c[i]}` : "–");
    return `▶ ${hhmm ? `${hhmm[1]}:${hhmm[2]}` : key} · ${roleInfo(d.clipRole[ci]).label} · ${seq.join(" → ")}`;
  }

  /** The head being walked, in the group's coordinates (null when nothing sounds). */
  liveHead(out: THREE.Vector3): THREE.Vector3 | null {
    const w = this.walking[this.walking.length - 1];
    return w ? out.fromArray(this.pos, w.head * 3) : null;
  }

  /** The clusters, in id order (id = index + 1). */
  clusters(): AvgnData["clusters"] {
    return this.data.clusters;
  }

  /** The clips being walked now, oldest first: their key and the call at the head. */
  walkingNow(): readonly { key: string; head: number }[] {
    return this.walking;
  }

  /** Where call i sits, in the group's coordinates. */
  headPos(i: number, out: THREE.Vector3): THREE.Vector3 {
    return out.fromArray(this.pos, i * 3);
  }

  /** Clusters with a sounding call. */
  isLit(clusterId: number): boolean {
    return this.litClusters.has(clusterId);
  }

  /** Units of a cluster that the floor leaves visible. */
  visibleIn(clusterId: number): number {
    return this.clusterVisible[clusterId - 1] ?? 0;
  }

  // ── Per frame ─────────────────────────────────────────────────────────
  /** `gain` scales the resting map (presence, consensus); the live layer stays bright. */
  update(f: AvgnFeeds, t: number, gain = 1): void {
    const d = this.data;
    const n = d.count;

    // Resting colours: only when the floor, the bancada or the gain moved.
    const key = `${(1 - f.opacityFloor).toFixed(3)}|${f.bancada}`;
    if (key !== this.floorKey || Math.abs(gain - this.gain) > 0.01) {
      const ceil = 1 - f.opacityFloor;
      const keyChanged = key !== this.floorKey;
      this.floorKey = key;
      this.gain = gain;
      const col = this.points.geometry.getAttribute("color") as THREE.BufferAttribute;
      const arr = col.array as Float32Array;
      if (keyChanged) this.clusterVisible = d.clusters.map(() => 0);
      for (let i = 0; i < n; i++) {
        const ci = d.clip[i];
        const hide = d.clipOpacity[ci] >= ceil;
        this.hidden[i] = hide ? 1 : 0;
        const inBench = f.bancada === 0 || d.clipBancada[ci] === f.bancada - 1;
        const k = hide ? 0 : gain * (inBench ? 0.55 : 0.12);
        arr[i * 3] = this.base[i * 3] * k;
        arr[i * 3 + 1] = this.base[i * 3 + 1] * k;
        arr[i * 3 + 2] = this.base[i * 3 + 2] * k;
        if (keyChanged && !hide && d.c[i] > 0) this.clusterVisible[d.c[i] - 1]++;
      }
      col.needsUpdate = true;
      if (this.web && this.webBase) {
        const wc = this.web.geometry.getAttribute("color") as THREE.BufferAttribute;
        const wa = wc.array as Float32Array;
        let at = 0;
        for (let i = 1; i < n; i++) {
          if (d.clip[i] !== d.clip[i - 1]) continue;
          const ci = d.clip[i];
          const inBench = f.bancada === 0 || d.clipBancada[ci] === f.bancada - 1;
          const k = this.hidden[i] ? 0 : gain * (inBench ? 0.16 : 0.03);
          for (let v = 0; v < SEGS * 2 * 3; v++, at++) wa[at] = this.webBase[at] * k;
        }
        wc.needsUpdate = true;
      }
    }

    // The clips sounding now, oldest first, that the map knows and may show.
    this.walking.length = 0;
    this.litClusters.clear();
    const live: { key: string; start: number }[] = [];
    for (const [k, s] of f.sounding) {
      const rg = d.range.get(k);
      if (!rg || this.hidden[rg[0]]) continue;
      live.push({ key: k, start: s.start });
    }
    live.sort((a, b) => a.start - b.start);
    if (live.length > MAX_LIVE_CLIPS) live.splice(0, live.length - MAX_LIVE_CLIPS);

    const lp = this.lit.geometry.getAttribute("position") as THREE.BufferAttribute;
    const la = lp.array as Float32Array;
    const hp = this.heads.geometry.getAttribute("position") as THREE.BufferAttribute;
    const ha = hp.array as Float32Array;
    const tp = this.trail.geometry.getAttribute("position") as THREE.BufferAttribute;
    const ta = tp.array as Float32Array;
    const tc = this.trail.geometry.getAttribute("color") as THREE.BufferAttribute;
    const tca = tc.array as Float32Array;
    let nl = 0, nh = 0, nt = 0;
    for (const L of live) {
      const [a, b] = d.range.get(L.key)!;
      // The recording's own clock, looped while the clip holds.
      const at = ((f.now - L.start) % RECORDING_S + RECORDING_S) % RECORDING_S;
      let head = a;
      for (let i = a; i < b; i++) {
        if (d.t[i] <= at) head = i;
        if (nl < LIT_CAP) {
          la[nl * 3] = this.pos[i * 3]; la[nl * 3 + 1] = this.pos[i * 3 + 1]; la[nl * 3 + 2] = this.pos[i * 3 + 2];
          nl++;
        }
        if (d.c[i] > 0) this.litClusters.add(d.c[i]);
      }
      this.walking.push({ key: L.key, head, from: a });
      ha[nh * 3] = this.pos[head * 3]; ha[nh * 3 + 1] = this.pos[head * 3 + 1]; ha[nh * 3 + 2] = this.pos[head * 3 + 2];
      nh++;
      // The trail: the last TRAIL transitions up to the head, fading behind it.
      const first = Math.max(a + 1, head - TRAIL + 1);
      for (let i = first; i <= head; i++) {
        const from = nt * 3;
        this.curve(i - 1, i, ta, from);
        const age = (head - i) / TRAIL;
        const k = (1 - age) * (1 - age);
        this.c.copy(AMBER).multiplyScalar(k);
        for (let v = 0; v < SEGS * 2; v++) {
          tca[from + v * 3] = this.c.r; tca[from + v * 3 + 1] = this.c.g; tca[from + v * 3 + 2] = this.c.b;
        }
        nt += SEGS * 2;
      }
    }
    this.lit.geometry.setDrawRange(0, nl);
    this.heads.geometry.setDrawRange(0, nh);
    this.trail.geometry.setDrawRange(0, nt);
    if (nl) lp.needsUpdate = true;
    if (nh) hp.needsUpdate = true;
    if (nt) { tp.needsUpdate = true; tc.needsUpdate = true; }
    (this.heads.material as THREE.PointsMaterial).opacity = 0.75 + Math.sin(t * 6) * 0.25;

    // Labels: the sounding clusters brighter; the walked clip named at its head.
    for (let s = 0; s < this.sprites.length; s++) {
      const lit = this.litClusters.has(this.spriteCluster[s]);
      (this.sprites[s].material as THREE.MeshBasicMaterial).opacity = lit ? 1 : 0.8 * Math.min(1, gain + 0.3);
      // At rest only the commonest call types are named, smaller; a type
      // that sounds is named whatever its size.
      this.sprites[s].userData.k = lit ? 1 : 0.72;
      this.sprites[s].visible = this.clusterVisible[s] > 0 && (lit || s < RESTING_NAMES);
    }
    // A leader shows with its name, brighter while its cluster sounds.
    if (this.leaders && this.leadBase) {
      let key = "";
      for (let s = 0; s < this.sprites.length; s++) key += this.sprites[s].visible ? (this.litClusters.has(s + 1) ? "2" : "1") : "0";
      if (key !== this.leadKey) {
        this.leadKey = key;
        const col = this.leaders.geometry.getAttribute("color") as THREE.BufferAttribute;
        const arr = col.array as Float32Array;
        for (let s = 0; s < this.sprites.length; s++) {
          const k = key[s] === "2" ? 1.6 : key[s] === "1" ? 0.7 : 0;
          for (let j = 0; j < 6; j++) arr[s * 6 + j] = this.leadBase[s * 6 + j] * k;
        }
        col.needsUpdate = true;
      }
    }
    if (this.liveSprite) {
      const w = this.walking[this.walking.length - 1];
      this.liveSprite.visible = !!w;
      if (w) {
        this.liveSprite.position.fromArray(this.pos, w.head * 3);
        const nowMs = performance.now();
        if (nowMs - this.liveAt > 250) {
          const txt = this.liveLine();
          if (txt !== this.liveText) { this.liveText = txt; this.liveAt = nowMs; this.drawLive(txt); }
        }
      }
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const o of [this.points, this.web, this.lit, this.heads, this.trail, this.leaders]) {
      if (!o) continue;
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
    for (const sp of this.sprites) { const m = sp.material as THREE.MeshBasicMaterial; m.map?.dispose(); m.dispose(); }
    this.atlas?.dispose();
    if (this.liveSprite) { (this.liveSprite.material as THREE.Material).dispose(); this.liveTex?.dispose(); }
    this.labelGeo?.dispose();
    this.liveGeo?.dispose();
    this.sprites = [];
    releaseDot();
  }
}
