// ReferenceRingsStage.ts — slot O · Anillos · Referencia
//
// The reference image, as close as the instrument can honestly draw it:
//
//   OUTER   the master bus as a radar-swept spectrogram, and one turn is ONE
//           PHENOLOGICAL DAY: the playhead leaves twelve o'clock when the SC
//           ring starts a day and comes back to it when the day ends. The
//           seconds round the dial are seconds of that day at the current Ring
//           Rate; a gap at the top carries the kHz axis. When the ring runs
//           faster than ten seconds a day, a turn holds several days and says so.
//   MIDDLE  the year as the corpus's recordings: every clip a white blob at its
//           day, set further in the later in the night it was made, over the
//           year's remembered spectrum; the season bands in teal and grey; the
//           clips sounding now in amber.
//   INNER   the waveform of the bus with its voice nodes and arcs, round the
//           consensus core.
//
// Today's species move in the lanes between, as on slot 0.

import * as THREE from "three";
import { RingStageBase } from "./RingStageBase";
import { CoreDot, doyCentre, NowRing } from "./components";
import { WaveformRing } from "./waveformRing";
import { Orbiters } from "./orbiters";
import { getYearMemory, PolarSpectrogram } from "./polarSpectrogram";
import type { PhenoData } from "./phenoData";
import { ROWS } from "./liveFeeds";
import { roleInfo } from "./phenoData";
import type { LabelSpec } from "./ringLabels";
import {
  AMBER, bandGeometry, Band, circleLine, PLAYHEAD, playhead, radialTicks, RING_GREY, setPlayhead, TICK_GREY,
} from "./ringPrims";
import {
  doyAngle, hhmm, inSeason, MONTH_START_DOY, MONTHS_ES, polar, SEASONS, seasonMidDoy, seasonSpan, TAU,
} from "./ringMath";

const GAP = 0.05;
const L = {
  core: { y: 0.5 },
  wave: { r: 1.5, amp: 0.42, y: 0.42 },
  voice: { rIn: 2.02, rOut: 2.35, y: 0.3 },
  calendar: { rIn: 2.45, rOut: 2.8, y: 0.2 },
  event: { rIn: 2.82, rOut: 2.92, y: 0.16 },
  year: { rIn: 3.0, rOut: 4.7, y: 0.1, bandR0: 4.74, bandR1: 4.84, labelR: 5.08 },
  outer: { rIn: 5.35, rOut: 9.1, y: 0.0 },
};
const SEASON_COLOR: Record<string, number> = {
  seca: 0x6a6f6c,
  primeras_lluvias: 0x2f9d95,
  medio_seco: 0x4a4f4c,
  segundas_lluvias: 0x2f9d95,
};

/** Night runs 18:00 → 06:00; a clip's radius is how far into it it was made. */
function nightFrac(minute: number): number {
  return (((minute - 18 * 60) % 1440 + 1440) % 1440) / (12 * 60);
}

export class ReferenceRingsStage extends RingStageBase {
  private core: CoreDot;
  private wave: WaveformRing;
  private outer: NowRing;
  private yearSpec: PolarSpectrogram;
  private blobs: THREE.InstancedMesh;
  private veiledBlobs: THREE.InstancedMesh;
  private blobIndex = new Map<string, { pos: THREE.Vector3; conf: number; opaque: boolean; bancada: number }>();
  private yearCursor: THREE.Group;
  private wavePlay: THREE.Group;
  private seasonMesh: THREE.Mesh;
  private activeSeason = "?";
  private orbiters: Orbiters;
  private daysPerTurn = 1;
  private turnFrac = 0;
  private lastCorpusFrame = -1;
  private col = new Float32Array(ROWS);
  private m4 = new THREE.Matrix4();
  private c3 = new THREE.Color();

  constructor(container: HTMLElement) {
    super(container);
    this.defaultView = { fitRadius: 10.0, polarDeg: 8, azimuthDeg: 0 };

    this.core = new CoreDot(L.core.y, 0.2);
    this.outer = new NowRing({
      rIn: L.outer.rIn, rOut: L.outer.rOut, y: L.outer.y,
      playR0: L.outer.rIn - 0.12, playR1: L.outer.rOut + 0.18,
      a0: GAP, span: TAU - 2 * GAP, cols: 1440,
    });
    this.wave = new WaveformRing(L.wave.r, L.wave.amp, L.wave.y, 720, GAP, TAU - 2 * GAP);
    this.wavePlay = playhead(L.wave.r - 0.3, L.wave.r + 0.5, L.wave.y + 0.02, PLAYHEAD, 0.8);

    // The year: remembered spectrum, faint, under the recordings.
    this.yearSpec = new PolarSpectrogram({
      rIn: L.year.rIn, rOut: L.year.rOut, y: L.year.y, cols: 365, crisp: true, gain: 0.6, guides: [],
    });
    this.yearSpec.load(getYearMemory().data);
    const disc = new THREE.CircleGeometry(1, 20);
    disc.rotateX(-Math.PI / 2);
    this.blobs = new THREE.InstancedMesh(disc, new THREE.MeshBasicMaterial({ color: 0xffffff }), 400);
    const ring = new THREE.RingGeometry(0.7, 1, 20);
    ring.rotateX(-Math.PI / 2);
    this.veiledBlobs = new THREE.InstancedMesh(ring, new THREE.MeshBasicMaterial({ color: 0xffffff }), 64);
    this.blobs.count = 0;
    this.veiledBlobs.count = 0;
    this.blobs.frustumCulled = false;
    this.veiledBlobs.frustumCulled = false;
    this.yearCursor = playhead(L.year.rIn - 0.08, L.year.bandR1 + 0.1, L.year.y + 0.03, AMBER, 0.95);
    this.seasonMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));

    const yearGroup = new THREE.Group();
    yearGroup.add(
      this.yearSpec.mesh, this.blobs, this.veiledBlobs, this.seasonMesh, this.yearCursor,
      circleLine(L.year.rIn, L.year.y, RING_GREY, 0.8), circleLine(L.year.rOut, L.year.y, RING_GREY, 0.8),
      radialTicks(MONTH_START_DOY.map((d) => ({ a: doyAngle(d), r0: L.year.rIn, r1: L.year.bandR1 })), L.year.y, TICK_GREY, 0.55)
    );

    this.orbiters = new Orbiters({
      laneFor: (state) => (state === "voice" ? L.voice : state === "event" ? L.event : L.calendar),
      homeAngle: (s) => doyCentre(s.peakDay),
      eventTarget: (key) => this.blobIndex.get(key)?.pos ?? null,
      voiceTarget: (voice) => this.wave.latest(voice),
    }, 36);

    this.scene.add(
      this.outer.group, yearGroup, this.wave.group, this.wavePlay, this.core.group, this.orbiters.group,
      circleLine(L.wave.r + 0.62, L.wave.y, RING_GREY, 0.5)
    );
    this.start();
  }

  onPhenoData(data: PhenoData): void {
    // Place every recording once: its day, spread across the day by order,
    // and inward by the hour of the night it was made.
    this.blobIndex.clear();
    for (const [doy, clips] of data.clipsByDoy) {
      clips.forEach((c, i) => {
        const spread = clips.length > 1 ? (i / (clips.length - 1) - 0.5) * 0.8 : 0;
        const a = doyAngle(doy) + (0.5 + spread) * (TAU / 365);
        const r = L.year.rOut - 0.1 - nightFrac(c.minute) * (L.year.rOut - L.year.rIn - 0.2);
        this.blobIndex.set(c.key, {
          pos: polar(r, a, L.year.y + 0.02), conf: c.confidence, opaque: c.opaque, bancada: c.bancada,
        });
      });
    }
  }

  private buildSeasons(active: string): void {
    const bands: Band[] = SEASONS.map((sn) => ({
      r0: L.year.bandR0, r1: L.year.bandR1,
      a0: doyAngle(sn.d0), a1: doyAngle(sn.d0) + ((seasonSpan(sn) + 1) / 365) * TAU,
      color: new THREE.Color(SEASON_COLOR[sn.key] ?? 0x4a4f4c), alpha: sn.key === active ? 1 : 0.45,
    }));
    this.seasonMesh.geometry.dispose();
    this.seasonMesh.geometry = bandGeometry(bands, L.year.y);
  }

  updateRings(dt: number, t: number, data: PhenoData | null): void {
    const f = this.feeds;
    const p = this.orbParams();

    // One turn = one ring day, aligned to the day's start. A ring faster than
    // ten seconds a day would spin the dial into a blur, so a turn then holds
    // several days; slower than two minutes, the dial keeps two-minute turns.
    let period = 30;
    let frac: number;
    if (f.cursorLive) {
      const spd = f.secsPerDay;
      this.daysPerTurn = spd < 10 ? Math.ceil(10 / spd) : 1;
      period = spd * this.daysPerTurn;
      if (period > 120) {
        period = 120;
        frac = ((f.dayProgress * spd) % 120) / 120;
      } else {
        frac = (((f.doy - 1) % this.daysPerTurn) + f.dayProgress) / this.daysPerTurn;
      }
    } else {
      this.daysPerTurn = 0;
      frac = (f.now % period) / period;
    }
    this.turnFrac = frac;
    const trail = 0.6 - f.soneth("memoryfeed", 0.4) * 0.4;
    this.outer.update(f, period, trail, frac);

    this.wave.update(f, frac, period, p.bow, Math.min(1.3, p.level));
    setPlayhead(this.wavePlay, GAP + frac * (TAU - 2 * GAP));

    // The year's remembered spectrum grows here too (the same memory as slot 0).
    if (f.cursorLive && f.corpusLive && f.corpusFrame !== this.lastCorpusFrame) {
      this.lastCorpusFrame = f.corpusFrame;
      const mem = getYearMemory();
      mem.accumulate(f.doy, f.corpus);
      const col = this.col;
      for (let r = 0; r < col.length; r++) col[r] = mem.data[r * 365 + f.doy - 1] / 255;
      this.yearSpec.writeColumn(f.doy - 1, col, 1);
    }
    this.yearSpec.commit();

    // Blobs: every recording; the sounding ones in amber, those outside the
    // chosen bancada dimmed, the opaque ones as empty rings.
    const m = this.m4;
    const c = this.c3;
    let nb = 0, nv = 0;
    for (const [key, b] of this.blobIndex) {
      const live = f.sounding.has(key);
      const inBench = f.bancada === 0 || b.bancada === f.bancada - 1;
      const s = (0.028 + b.conf * 0.03) * (live ? 2.2 + Math.sin(t * 5) * 0.2 : 1);
      m.makeScale(s, s, s).setPosition(b.pos);
      if (b.opaque) {
        c.setHex(0x6a6f6c);
        this.veiledBlobs.setMatrixAt(nv, m);
        this.veiledBlobs.setColorAt(nv, c);
        nv++;
      } else {
        c.setHex(live ? 0xffaa44 : 0xf2fff4).multiplyScalar(inBench ? (live ? 1.2 : 0.85) : 0.2);
        this.blobs.setMatrixAt(nb, m);
        this.blobs.setColorAt(nb, c);
        nb++;
      }
    }
    this.blobs.count = nb;
    this.veiledBlobs.count = nv;
    this.blobs.instanceMatrix.needsUpdate = true;
    this.veiledBlobs.instanceMatrix.needsUpdate = true;
    if (this.blobs.instanceColor) this.blobs.instanceColor.needsUpdate = true;
    if (this.veiledBlobs.instanceColor) this.veiledBlobs.instanceColor.needsUpdate = true;

    this.yearCursor.visible = f.cursorLive;
    if (f.cursorLive) setPlayhead(this.yearCursor, doyCentre(f.doy));
    const sn = SEASONS.find((s) => f.cursorLive && inSeason(s, f.doy));
    const key = sn ? sn.key : "";
    if (key !== this.activeSeason) { this.activeSeason = key; this.buildSeasons(key); }

    this.orbiters.update(f, data, dt, t, p);
    this.core.update(this._smoothConsensus, this.voteFlash, this.voteAlarm);
  }

  collectLabels(add: (s: LabelSpec) => void, data: PhenoData | null): void {
    const f = this.feeds;
    this.outer.labels(add, "o-out");
    add({
      id: "o-turn", pos: polar(L.outer.rOut + 0.75, 0, 0),
      text: this.daysPerTurn === 0 ? "30 s · anillo SC sin señal"
        : this.daysPerTurn === 1 ? "1 vuelta = 1 día fenológico" : `${this.daysPerTurn} días / vuelta`,
      cls: "head small", priority: 30,
    });
    MONTHS_ES.forEach((mo, i) => {
      const mid = MONTH_START_DOY[i] + ((MONTH_START_DOY[i + 1] ?? 366) - MONTH_START_DOY[i]) / 2;
      add({ id: `o-m${i}`, pos: polar(L.year.labelR, doyAngle(mid), L.year.y), text: mo, cls: "month", priority: 14 });
    });
    for (const sn of SEASONS) {
      add({
        id: `o-s${sn.key}`, pos: polar(L.year.rIn - 0.25, doyAngle(seasonMidDoy(sn)), L.year.y),
        text: sn.label, cls: "season" + (sn.key === this.activeSeason ? " on" : ""), priority: 10, maxDist: 30,
      });
    }
    if (f.cursorLive) {
      add({
        id: "o-cur", pos: polar(L.year.labelR + 0.05, doyCentre(f.doy), L.year.y), text: `DOY ${f.doy}`,
        cls: "head", priority: 40, dx: 0, dy: -12,
      });
    }
    // The recordings, named by role and hour, when you come close to them.
    if (data) {
      for (const [key, b] of this.blobIndex) {
        const clip = data.clipByKey.get(key);
        if (!clip) continue;
        const live = f.sounding.has(key);
        const info = roleInfo(clip.role);
        add({
          id: `o-c${key}`, pos: b.pos,
          text: clip.opaque ? "·" : `${info.letter} ${hhmm(clip.minute)}`,
          sub: clip.opaque ? "reservado" : live ? `${info.label} · doy ${clip.doy}` : undefined,
          cls: "clip" + (live ? " live" : ""), priority: live ? 30 : 3, maxDist: live ? undefined : 2.2,
          anchor: "l", dx: 6,
        });
      }
    }
    this.orbiters.labels(add, f.opacityFloor);
  }

  statusExtra(): string {
    const c = this.orbiters.census();
    return `${c.calendar + c.voice + c.event} especies en sesión · ${f2(this.turnFrac * 100)}% de la vuelta`;
  }

  disposeRings(): void {
    this.outer?.spec.dispose();
    this.yearSpec?.dispose();
    this.wave?.dispose();
    this.orbiters?.dispose();
  }
}

function f2(x: number): string {
  return String(Math.round(x));
}

export default ReferenceRingsStage;
