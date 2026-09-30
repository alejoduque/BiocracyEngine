// TaxonLanesStage.ts — slot T · Anillos · Taxones
//
// Every ring is the year. Five lanes, flora innermost to birds outermost — the
// order the Cámara Fenológica stacks them — and all 442 species of the Manakai
// roster sit in their own lane at their own peak day, lit by how present they
// are on the day the ring stands on. Today's most active move in their lane
// as on slot 0, and a lane brightens when its taxon's voice strikes.
//
// Outside the lanes, the year's remembered corpus spectrum (the same memory
// slot 0 keeps). On the DOY cursor, a wedge crossing all five lanes carries
// the master bus as a short radar sweep, frequency running outward from flora
// to birds: the sound of now, laid across the forest of today.

import * as THREE from "three";
import { RingStageBase } from "./RingStageBase";
import { CoreDot, doyCentre, YearRing } from "./components";
import { WaveformRing } from "./waveformRing";
import { Orbiters } from "./orbiters";
import { PolarSpectrogram } from "./polarSpectrogram";
import { ROWS } from "./liveFeeds";
import {
  activityOn, hash01, PhenoData, Species, Taxon, TAXA, TAXON_COLOR, TAXON_VOICE,
} from "./phenoData";
import type { LabelSpec } from "./ringLabels";
import { circleLine, lineMat, PLAYHEAD, playhead, setPlayhead } from "./ringPrims";
import { freqLabel, freqToV, polar, TAU } from "./ringMath";

const LANE0 = 2.0;
const LANE_W = 0.9;
const LANE_GAP = 0.1;
const WEDGE = 0.16;
const WEDGE_PERIOD = 8;

type LaneGeo = { rIn: number; rOut: number; y: number; ring: THREE.LineLoop };

export class TaxonLanesStage extends RingStageBase {
  private core: CoreDot;
  private wave: WaveformRing;
  private wavePlay: THREE.Group;
  private year: YearRing;
  private wedge: PolarSpectrogram;
  private wedgeEdges: THREE.Group;
  private lanes = new Map<Taxon, LaneGeo>();
  private points: THREE.Points | null = null;
  private pointSpecies: Species[] = [];
  private pointPos: THREE.Vector3[] = [];
  private zeros = new Float32Array(ROWS);
  private pointKey = "";
  private orbiters: Orbiters;
  private laneEnv: Record<string, number> = {};
  private target = new THREE.Vector3();

  constructor(container: HTMLElement) {
    super(container);
    this.defaultView = { fitRadius: 9.6, polarDeg: 10, azimuthDeg: 0 };

    this.core = new CoreDot(0.5, 0.18);
    this.wave = new WaveformRing(1.2, 0.35, 0.42, 540);
    this.wavePlay = playhead(0.95, 1.7, 0.44, PLAYHEAD, 0.8);

    TAXA.forEach((t, i) => {
      const rIn = LANE0 + i * (LANE_W + LANE_GAP);
      const rOut = rIn + LANE_W;
      const y = 0.06 * (TAXA.length - 1 - i);
      const ring = circleLine(rOut, y, t.color, 0.3);
      this.scene.add(circleLine(rIn, y, 0x3a403c, 0.7), ring);
      this.lanes.set(t.key, { rIn, rOut, y, ring });
    });
    const lanesOut = LANE0 + TAXA.length * (LANE_W + LANE_GAP) - LANE_GAP;

    this.year = new YearRing({
      rIn: lanesOut + 0.2, rOut: lanesOut + 1.4, y: -0.02,
      seasonR0: lanesOut + 1.7, seasonR1: lanesOut + 1.86, labelR: lanesOut + 2.2,
      cursorR0: LANE0 - 0.1, cursorR1: lanesOut + 1.95,
    });

    // The wedge: the master bus across all five lanes, following the cursor.
    this.wedge = new PolarSpectrogram({
      rIn: LANE0, rOut: lanesOut, y: 0.32, cols: 256, a0: 0, span: WEDGE, guides: [], gain: 1.1,
    });
    this.wedgeEdges = new THREE.Group();
    for (const a of [0, WEDGE]) {
      const g = new THREE.BufferGeometry().setFromPoints([
        polar(LANE0, a, 0.33), polar(lanesOut, a, 0.33),
      ]);
      this.wedgeEdges.add(new THREE.Line(g, lineMat(0xff8800, 0.6)));
    }

    this.orbiters = new Orbiters({
      laneFor: (state, taxon) => {
        const l = this.lanes.get(taxon)!;
        if (state === "voice") return { rIn: l.rIn + 0.1, rOut: l.rOut - 0.1, y: l.y + 0.3 };
        if (state === "event") return { rIn: l.rIn + 0.25, rOut: l.rOut - 0.25, y: l.y + 0.18 };
        return { rIn: l.rIn + 0.15, rOut: l.rOut - 0.15, y: l.y + 0.04 };
      },
      homeAngle: (s) => doyCentre(s.peakDay),
      eventTarget: () => polar(lanesOut + 0.2, doyCentre(this.feeds.doy), 0.0, this.target),
      voiceTarget: (voice) => this.wave.latest(voice),
    }, 36);

    this.scene.add(
      this.year.group, this.wedge.mesh, this.wedgeEdges, this.wave.group, this.wavePlay,
      this.core.group, this.orbiters.group
    );
    this.start();
  }

  onPhenoData(data: PhenoData): void {
    this.year.onData(data);
    // All species, in their lane at their day. Radius and a hair of angle from
    // the name's own hash, so the lane has depth and the layout never moves.
    const n = data.species.length;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    this.pointPos = data.species.map((s, i) => {
      const l = this.lanes.get(s.taxon)!;
      const r = l.rIn + 0.08 + hash01(s.sci + "|lane") * (LANE_W - 0.16);
      const a = doyCentre(s.peakDay) + (hash01(s.sci + "|jit") - 0.5) * 0.006;
      const v = polar(r, a, l.y + 0.01);
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
      return v;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    if (this.points) { this.scene.remove(this.points); this.points.geometry.dispose(); (this.points.material as THREE.Material).dispose(); }
    this.points = new THREE.Points(g, new THREE.PointsMaterial({
      size: 0.1, vertexColors: true, sizeAttenuation: true, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false;
    this.pointSpecies = data.species;
    this.pointKey = "";
    this.scene.add(this.points);
  }

  private recolour(): void {
    if (!this.points) return;
    const f = this.feeds;
    const key = `${f.doy}|${f.windowScale.toFixed(3)}`;
    if (key === this.pointKey) return;
    this.pointKey = key;
    const col = this.points.geometry.attributes.color as THREE.BufferAttribute;
    const c = new THREE.Color();
    this.pointSpecies.forEach((s, i) => {
      const act = activityOn(s, f.doy, f.windowScale);
      // A floor, so the lane's whole year stays legible as a shape.
      c.setHex(TAXON_COLOR[s.taxon]).multiplyScalar(0.28 + 0.72 * act);
      col.setXYZ(i, c.r, c.g, c.b);
    });
    col.needsUpdate = true;
  }

  updateRings(dt: number, t: number, data: PhenoData | null): void {
    const f = this.feeds;
    const p = this.orbParams();
    const frac = (f.now % 30) / 30;
    this.wave.update(f, frac, 30, p.bow, Math.min(1.3, p.level));
    setPlayhead(this.wavePlay, frac * TAU);
    this.year.update(f);
    this.recolour();

    // The wedge sits centred on the ring's day; dim and still when SC is not
    // driving it, since the civil date is not what is being played.
    const ca = doyCentre(f.doy) - WEDGE / 2;
    this.wedge.setA0(ca);
    this.wedgeEdges.rotation.y = -ca;
    const wf = (f.now % WEDGE_PERIOD) / WEDGE_PERIOD;
    this.wedge.sweep(wf, f.masterLive ? f.master : this.zeros);
    this.wedge.setTrail(0.5);
    this.wedge.setOpacity(f.cursorLive ? 1 : 0.35);
    this.wedge.commit();

    // A lane lifts when its taxon's voice strikes.
    for (const tx of TAXA) {
      const env = f.voiceEnv(TAXON_VOICE[tx.key]);
      const prev = this.laneEnv[tx.key] ?? 0;
      const e = env > prev ? env : prev * Math.exp(-dt / 0.5);
      this.laneEnv[tx.key] = e;
      const l = this.lanes.get(tx.key)!;
      (l.ring.material as THREE.LineBasicMaterial).opacity = 0.3 + e * 0.65;
    }

    this.orbiters.update(f, data, dt, t, p);
    this.core.update(this._smoothConsensus, this.voteFlash, this.voteAlarm);
  }

  collectLabels(add: (s: LabelSpec) => void, data: PhenoData | null): void {
    const f = this.feeds;
    for (const tx of TAXA) {
      const l = this.lanes.get(tx.key)!;
      add({
        id: `t-lane-${tx.key}`, pos: polar((l.rIn + l.rOut) / 2, -0.03, l.y),
        text: tx.label, cls: "lane", color: "#" + new THREE.Color(tx.color).getHexString(),
        priority: 16, anchor: "r",
      });
    }
    this.year.labels(add, f, "t-year");
    // The wedge's own frequency axis, on its leading edge, when close.
    const a = doyCentre(f.doy) + WEDGE / 2 + 0.01;
    const r0 = LANE0, r1 = LANE0 + TAXA.length * (LANE_W + LANE_GAP) - LANE_GAP;
    for (const fr of [500, 1000, 2000, 4000, 8000]) {
      add({
        id: `t-wf${fr}`, pos: polar(r0 + freqToV(fr) * (r1 - r0), a, 0.33), text: freqLabel(fr),
        cls: "axis", priority: 6, maxDist: 9, anchor: "l",
      });
    }
    // Every species in the roster has a name — close enough to read it.
    if (data && this.pointPos.length === data.species.length) {
      const seated = new Set(this.orbiters.orbs.map((o) => o.s.sci));
      for (const s of data.species) {
        if (seated.has(s.sci)) continue;
        add({
          id: `t-sp-${s.idx}`, pos: this.pointPos[s.idx], text: s.sci,
          cls: "tick sp", priority: 1 + activityOn(s, f.doy, f.windowScale), maxDist: 1.6, anchor: "l", dx: 4,
        });
      }
    }
    this.orbiters.labels(add, f.opacityFloor);
  }

  statusExtra(): string {
    const c = this.orbiters.census();
    return `${this.pointSpecies.length} especies en cinco carriles · ${c.calendar + c.voice + c.event} en sesión`;
  }

  disposeRings(): void {
    this.year?.dispose();
    this.wedge?.dispose();
    this.wave?.dispose();
    this.orbiters?.dispose();
  }
}

export default TaxonLanesStage;
