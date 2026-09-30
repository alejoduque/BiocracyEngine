// components.ts
// The rings themselves, each a clock with its own hand:
//
//   CoreDot   the consensus core at the centre of the dial.
//   NowRing   seconds. The master bus as a radar-swept spectrogram, one turn a
//             fixed period, with the warm playhead of the reference.
//   DayRing   the 24 hours of the day the ring stands on, with that day's
//             AudioMoth recordings as tiles at the minute they were made. A
//             tile fills with the corpus bus's spectrum while it is sounding.
//   YearRing  the 365 days. Each day's column is what the corpus bus sounded
//             like while the ring played that day, remembered across sessions.
//             The DOY cursor is the long amber hand.

import * as THREE from "three";
import { getYearMemory, PolarSpectrogram } from "./polarSpectrogram";
import { LiveFeeds, ROWS } from "./liveFeeds";
import { Clip, PhenoData, roleInfo } from "./phenoData";
import {
  AMBER, arcLine, bandGeometry, Band, circleLine, PLAYHEAD, playhead, radialTicks,
  RING_GREY, setPlayhead, TICK_GREY,
} from "./ringPrims";
import {
  civilMinute, doyAngle, FREQ_GUIDES, freqLabel, freqToV, hhmm, inSeason, minuteAngle,
  MONTH_START_DOY, MONTHS_ES, polar, SEASONS, seasonMidDoy, seasonSpan, TAU,
} from "./ringMath";
import type { LabelSpec } from "./ringLabels";

type Add = (s: LabelSpec) => void;
const ZEROS = new Float32Array(ROWS);
const DAY_HALF = TAU / 730;

/** Angle of the centre of a day's column. */
export function doyCentre(doy: number): number {
  return doyAngle(doy) + DAY_HALF;
}

// ─── Core ───────────────────────────────────────────────────────────────────
export class CoreDot {
  readonly group = new THREE.Group();
  private dot: THREE.Mesh;
  private halo: THREE.LineLoop;
  private mat: THREE.MeshBasicMaterial;
  constructor(y: number, private r = 0.2) {
    this.mat = new THREE.MeshBasicMaterial({ color: 0xf2fff4 });
    this.dot = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3), this.mat);
    this.dot.position.y = y;
    this.halo = circleLine(1, y, 0xf2fff4, 0.35, 128);
    this.group.add(this.dot, this.halo);
  }
  /** Consensus sets the core's size and the reach of its halo; a vote flashes it. */
  update(consensus: number, flash: number, alarm: boolean): void {
    const s = this.r * (0.75 + consensus * 0.6) * (1 + flash * 0.6);
    this.dot.scale.setScalar(s);
    this.halo.scale.setScalar(this.r * 1.6 + consensus * 0.5);
    (this.halo.material as THREE.LineBasicMaterial).opacity = 0.15 + consensus * 0.35;
    this.mat.color.setHex(0xf2fff4);
    if (flash > 0.01) this.mat.color.lerp(new THREE.Color(alarm ? 0xff5a39 : 0xffcc44), flash);
  }
}

// ─── NOW ────────────────────────────────────────────────────────────────────
export type NowOpts = {
  rIn: number; rOut: number; y: number;
  playR0: number; playR1: number;
  a0?: number; span?: number; cols?: number;
};

function niceStep(x: number): number {
  for (const s of [1, 2, 4, 5, 10, 15, 20, 30, 60, 120]) if (s >= x) return s;
  return 240;
}

export class NowRing {
  readonly group = new THREE.Group();
  readonly spec: PolarSpectrogram;
  private head: THREE.Group;
  private a0: number;
  private span: number;
  period = 30;
  frac = 0;
  private labelKey = "";
  private labelPos: { id: string; text: string; pos: THREE.Vector3; axis: boolean }[] = [];

  constructor(private o: NowOpts) {
    this.a0 = o.a0 ?? 0;
    this.span = o.span ?? TAU;
    this.spec = new PolarSpectrogram({
      rIn: o.rIn, rOut: o.rOut, y: o.y, cols: o.cols ?? 1024, a0: this.a0, span: this.span,
    });
    this.group.add(this.spec.mesh);
    if (this.span >= TAU - 1e-6) {
      this.group.add(circleLine(o.rIn, o.y, RING_GREY, 0.8), circleLine(o.rOut, o.y, RING_GREY, 0.9));
    } else {
      this.group.add(
        arcLine(o.rIn, this.a0, this.a0 + this.span, o.y, RING_GREY, 0.8, 256),
        arcLine(o.rOut, this.a0, this.a0 + this.span, o.y, RING_GREY, 0.9, 256),
        radialTicks([{ a: this.a0, r0: o.rIn, r1: o.rOut }, { a: this.a0 + this.span, r0: o.rIn, r1: o.rOut }], o.y, RING_GREY, 0.9)
      );
    }
    // Second ticks, outside the ring, like the reference's dial.
    this.head = playhead(o.playR0, o.playR1, o.y + 0.02, PLAYHEAD, 0.95);
    this.group.add(this.head);
  }

  angleOf(frac: number): number {
    return this.a0 + frac * this.span;
  }

  /**
   * Silence stays dark: when the bus is not live the sweep writes zeros.
   * frac, when given, places the hand explicitly (slot O aligns a turn with
   * the ring's day); otherwise the hand runs on the clock.
   */
  update(feeds: LiveFeeds, period: number, trail: number, frac?: number): void {
    this.period = period;
    this.frac = frac ?? (feeds.now % this.period) / this.period;
    this.spec.sweep(this.frac, feeds.masterLive ? feeds.master : ZEROS);
    this.spec.setTrail(trail);
    this.spec.commit();
    setPlayhead(this.head, this.angleOf(this.frac));
  }

  labels(add: Add, id: string, unit = "s"): void {
    const o = this.o;
    const key = `${id}|${this.period.toFixed(3)}`;
    if (key !== this.labelKey) {
      // Rebuilt only when the turn's length changes (slot O follows Ring Rate).
      this.labelKey = key;
      this.labelPos = [];
      const step = niceStep(this.period / 8);
      for (let s = 0; s < this.period - 1e-6; s += step) {
        this.labelPos.push({
          id: `${id}:t${s}`, text: `${Math.round(s)}${unit}`, axis: false,
          pos: polar(o.rOut + 0.32, this.angleOf(s / this.period), o.y),
        });
      }
      // The kHz axis on the twelve o'clock edge, as the reference puts it in its gap.
      for (const f of FREQ_GUIDES) {
        if (f < 1000) continue;
        const r = o.rIn + freqToV(f) * (o.rOut - o.rIn);
        this.labelPos.push({ id: `${id}:f${f}`, text: freqLabel(f), axis: true, pos: polar(r, this.a0 - 0.01, o.y) });
      }
    }
    for (const l of this.labelPos) {
      if (l.axis) add({ id: l.id, pos: l.pos, text: l.text, cls: "axis", priority: 7, maxDist: 18, anchor: "r", dx: -3 });
      else add({ id: l.id, pos: l.pos, text: l.text, cls: "tick", priority: 9 });
    }
  }
}

// ─── YEAR ───────────────────────────────────────────────────────────────────
export type YearOpts = {
  rIn: number; rOut: number; y: number;
  seasonR0: number; seasonR1: number;
  labelR: number;
  cursorR0: number; cursorR1: number;
  gain?: number;
};

const SEASON_COLOR: Record<string, number> = {
  seca: 0x9a7440,
  primeras_lluvias: 0x2f9d95,
  medio_seco: 0x6a6f6c,
  segundas_lluvias: 0x2f86a8,
};

export class YearRing {
  readonly group = new THREE.Group();
  readonly spec: PolarSpectrogram;
  private cursor: THREE.Group;
  private hoy: THREE.Group;
  private seasons: THREE.Mesh;
  private activeSeason = "";
  private marks: THREE.Group | null = null;
  private lastCorpusFrame = -1;
  /** Label anchors that never move, computed once rather than every frame. */
  private monthPos: THREE.Vector3[];
  private seasonPos: THREE.Vector3[];
  private dayPos: THREE.Vector3[];
  private curPos = new THREE.Vector3();
  private hoyPos = new THREE.Vector3();

  constructor(private o: YearOpts) {
    this.monthPos = MONTHS_ES.map((_, i) => {
      const mid = MONTH_START_DOY[i] + ((MONTH_START_DOY[i + 1] ?? 366) - MONTH_START_DOY[i]) / 2;
      return polar(o.labelR, doyAngle(mid), o.y);
    });
    this.seasonPos = SEASONS.map((sn) => polar(o.labelR + 0.55, doyAngle(seasonMidDoy(sn)), o.y));
    this.dayPos = Array.from({ length: 365 }, (_, i) => polar(o.rOut + 0.22, doyCentre(i + 1), o.y));
    this.spec = new PolarSpectrogram({
      rIn: o.rIn, rOut: o.rOut, y: o.y, cols: 365, crisp: true, mask: true, gain: o.gain ?? 1.15,
    });
    // What this machine has heard before, on every day it has heard.
    this.spec.load(getYearMemory().data);

    this.group.add(this.spec.mesh);
    this.group.add(circleLine(o.rIn, o.y, RING_GREY, 0.8), circleLine(o.rOut, o.y, RING_GREY, 0.9));

    // Day ticks on the outer edge: every day a hair, every five a little
    // longer, every month across the season band.
    const ticks: { a: number; r0: number; r1: number }[] = [];
    for (let d = 1; d <= 365; d++) {
      const len = d % 5 === 0 ? 0.1 : 0.04;
      ticks.push({ a: doyAngle(d), r0: o.rOut, r1: o.rOut + len });
    }
    this.group.add(radialTicks(ticks, o.y, TICK_GREY, 0.45));
    this.group.add(radialTicks(
      MONTH_START_DOY.map((d) => ({ a: doyAngle(d), r0: o.rIn - 0.08, r1: o.seasonR1 + 0.1 })),
      o.y, TICK_GREY, 0.7
    ));

    this.seasons = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    this.group.add(this.seasons);
    this.buildSeasons("");

    this.cursor = playhead(o.cursorR0, o.cursorR1, o.y + 0.03, AMBER, 0.95);
    this.cursor.visible = false;
    this.hoy = playhead(o.rOut + 0.12, o.seasonR0 - 0.02, o.y + 0.02, 0x8df0b4, 0.8);
    this.group.add(this.cursor, this.hoy);
  }

  private column(src: Uint8Array, c: number): Float32Array {
    const out = new Float32Array(ROWS);
    for (let r = 0; r < ROWS; r++) out[r] = src[r * 365 + c] / 255;
    return out;
  }

  private buildSeasons(active: string): void {
    const bands: Band[] = SEASONS.map((sn) => ({
      r0: this.o.seasonR0, r1: this.o.seasonR1,
      a0: doyAngle(sn.d0), a1: doyAngle(sn.d0) + (seasonSpan(sn) + 1) / 365 * TAU,
      color: new THREE.Color(SEASON_COLOR[sn.key] ?? 0x6a6f6c),
      alpha: sn.key === active ? 0.95 : 0.3,
    }));
    this.seasons.geometry.dispose();
    this.seasons.geometry = bandGeometry(bands, this.o.y);
  }

  /** Recorded days, absence and camera-trap days, once the manifest is in. */
  onData(data: PhenoData): void {
    const o = this.o;
    for (let d = 1; d <= 365; d++) {
      const gap = data.gapDepth[d] ?? 365;
      // Absence is hatched, deeper for a day further from any recording.
      this.spec.setMask(d - 1, data.recordedDays.has(d) ? 0 : 0.35 + Math.min(1, gap / 90) * 0.45);
    }
    this.spec.commit();
    if (this.marks) {
      this.group.remove(this.marks);
      this.marks.traverse((m: THREE.Object3D) => {
        const o = m as THREE.LineSegments;
        o.geometry?.dispose?.();
        (o.material as THREE.Material | undefined)?.dispose?.();
      });
    }
    this.marks = new THREE.Group();
    const rec: { a: number; r0: number; r1: number }[] = [];
    for (const d of data.recordedDays) {
      const info = data.dayInfo.get(d);
      const len = 0.08 + (info ? info.biophony : 0.5) * 0.22;
      rec.push({ a: doyCentre(d), r0: o.rOut + 0.02, r1: o.rOut + 0.02 + len });
    }
    this.marks.add(radialTicks(rec, o.y + 0.01, 0xf2fff4, 0.9));
    const cam: { a: number; r0: number; r1: number }[] = [];
    for (const d of data.cameraDays.keys()) cam.push({ a: doyCentre(d), r0: o.rIn - 0.2, r1: o.rIn - 0.04 });
    // Slot C's green: the camera trap's register, as it is everywhere else.
    this.marks.add(radialTicks(cam, o.y + 0.01, 0x8df0b4, 0.9));
    this.group.add(this.marks);
  }

  update(feeds: LiveFeeds): void {
    // A day's column accumulates while the ring is on it and the corpus is
    // sounding. Only then: a day the ring has not reached stays black.
    if (feeds.cursorLive && feeds.corpusLive && feeds.corpusFrame !== this.lastCorpusFrame) {
      this.lastCorpusFrame = feeds.corpusFrame;
      const mem = getYearMemory();
      mem.accumulate(feeds.doy, feeds.corpus);
      this.spec.writeColumn(feeds.doy - 1, this.column(mem.data, feeds.doy - 1), 1);
    }
    this.spec.commit();

    this.cursor.visible = feeds.cursorLive;
    if (feeds.cursorLive) setPlayhead(this.cursor, doyCentre(feeds.doy));
    setPlayhead(this.hoy, doyCentre(feeds.civil));

    const sn = SEASONS.find((s) => feeds.cursorLive && inSeason(s, feeds.doy));
    const key = sn ? sn.key : "";
    if (key !== this.activeSeason) { this.activeSeason = key; this.buildSeasons(key); }
  }

  labels(add: Add, feeds: LiveFeeds, id: string): void {
    const o = this.o;
    MONTHS_ES.forEach((m, i) => {
      add({ id: `${id}:m${i}`, pos: this.monthPos[i], text: m, cls: "month", priority: 14 });
    });
    SEASONS.forEach((sn, i) => {
      add({
        id: `${id}:s${sn.key}`, pos: this.seasonPos[i],
        text: sn.label, sub: sn.taxa, cls: "season" + (sn.key === this.activeSeason ? " on" : ""),
        priority: 12, maxDist: 60,
      });
    });
    // Day numbers when you are close to them.
    for (let d = 1; d <= 365; d++) {
      const every5 = d % 5 === 0 || d === 1;
      add({
        id: `${id}:d${d}`, pos: this.dayPos[d - 1], text: String(d),
        cls: "tick", priority: every5 ? 5 : 3, maxDist: every5 ? 6 : 2.6,
      });
    }
    if (feeds.cursorLive) {
      add({
        id: `${id}:cur`, pos: polar(o.cursorR1 + 0.3, doyCentre(feeds.doy), o.y, this.curPos),
        text: `DOY ${feeds.doy}`, sub: feeds.temporada.replace(/_/g, " "), cls: "head", priority: 40,
      });
    }
    add({
      id: `${id}:hoy`, pos: polar(o.seasonR0 - 0.2, doyCentre(feeds.civil), o.y, this.hoyPos),
      text: `hoy ${feeds.civil}`, cls: "civil", priority: 11, maxDist: 30,
    });
  }

  dispose(): void {
    this.spec.dispose();
  }
}

// ─── DAY ────────────────────────────────────────────────────────────────────
export type DayOpts = {
  rIn: number; rOut: number; y: number;
  bandR0: number; bandR1: number;
  progressR: number;
};

/** Tile width in minutes. A 60 s recording is 1/1440 of the day, a hair; it is
 *  drawn twelve minutes wide so it can be read, and said so here. */
const TILE = 12;

/** What each clip's tile looked like when it was heard, kept for the session. */
const tileMemory = new Map<string, Uint8Array>();

type Tile = { clip: Clip; col0: number };

export class DayRing {
  readonly group = new THREE.Group();
  readonly spec: PolarSpectrogram;
  private bands: THREE.Mesh;
  private progress: THREE.Line;
  private progressCount: number;
  private now: THREE.Group;
  private doy = -1;
  private bancada = -1;
  private tiles = new Map<string, Tile>();
  private recordedHours = new Set<number>();
  private lastCorpusFrame = -1;
  private tmp = new Float32Array(ROWS);
  private hourPos: THREE.Vector3[];
  private quarterPos: THREE.Vector3[];
  private clipPos = new Map<string, THREE.Vector3>();
  private offPos: THREE.Vector3;
  private nowPos = new THREE.Vector3();
  private progPos: THREE.Vector3;

  constructor(private o: DayOpts) {
    this.hourPos = Array.from({ length: 24 }, (_, h) => polar(o.rOut + 0.34, minuteAngle(h * 60), o.y));
    this.quarterPos = Array.from({ length: 96 }, (_, q) => polar(o.rOut + 0.2, minuteAngle(q * 15), o.y));
    this.offPos = polar((o.rIn + o.rOut) / 2, minuteAngle(12 * 60), o.y + 0.02);
    this.progPos = polar(o.progressR - 0.15, 0, o.y);
    this.spec = new PolarSpectrogram({ rIn: o.rIn, rOut: o.rOut, y: o.y, cols: 1440, crisp: true, mask: true, gain: 1.2 });
    this.group.add(this.spec.mesh);
    this.group.add(circleLine(o.rIn, o.y, RING_GREY, 0.8), circleLine(o.rOut, o.y, RING_GREY, 0.9));
    const ticks: { a: number; r0: number; r1: number }[] = [];
    for (let q = 0; q < 96; q++) {
      const hour = q % 4 === 0;
      ticks.push({ a: minuteAngle(q * 15), r0: o.rOut, r1: o.rOut + (hour ? 0.14 : 0.05) });
    }
    this.group.add(radialTicks(ticks, o.y, TICK_GREY, 0.6));

    this.bands = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    this.group.add(this.bands);

    // How far the ring's day has run. Not an hour hand: the SC ring plays a
    // day's recordings together, not in the order of their hours.
    this.progressCount = 361;
    this.progress = arcLine(o.progressR, 0, TAU, o.y + 0.02, AMBER, 0.75, 360);
    this.progress.geometry.setDrawRange(0, 0);
    this.group.add(this.progress);

    this.now = playhead(o.rOut + 0.02, o.rOut + 0.3, o.y + 0.02, 0x8df0b4, 0.85);
    this.group.add(this.now);
  }

  onData(data: PhenoData): void {
    this.recordedHours = new Set(data.clips.map((c) => c.hour));
    this.doy = -1; // rebuild on the next update
  }

  private rebuild(doy: number, data: PhenoData, bancada: number): void {
    this.doy = doy;
    this.bancada = bancada;
    this.tiles.clear();
    this.clipPos.clear();
    this.spec.clear();
    const clips = data.clipsByDoy.get(doy) || [];
    let lastEnd = -1;
    for (const clip of clips) {
      let col0 = Math.floor(clip.minute);
      if (col0 < lastEnd) col0 = lastEnd; // same minute: set side by side
      lastEnd = col0 + TILE;
      this.tiles.set(clip.key, { clip, col0 });
      this.clipPos.set(clip.key, polar((this.o.bandR0 + this.o.bandR1) / 2 - 0.12, minuteAngle(col0 + TILE / 2), this.o.y));
      const mem = tileMemory.get(clip.key);
      if (mem) this.spec.blitColumns(col0, mem, TILE);
    }
    // Hours the AudioMoth never records are hatched as outside its schedule —
    // not silence, which would be a claim about the forest.
    for (let c = 0; c < 1440; c++) {
      this.spec.setMask(c, this.recordedHours.size && !this.recordedHours.has(Math.floor(c / 60)) ? 0.55 : 0);
    }
    const bands: Band[] = [];
    for (const t of this.tiles.values()) {
      const info = roleInfo(t.clip.role);
      const inBench = bancada === 0 || t.clip.bancada === bancada - 1;
      // a1 from a0, not from minuteAngle(col0 + TILE): a tile that starts in
      // the last twelve minutes of the day would wrap to just after midnight
      // and its band would be drawn the long way round, as a full circle.
      const a0 = minuteAngle(t.col0), a1 = a0 + (TILE / 1440) * TAU;
      if (t.clip.opaque) {
        // Art. 47: heard and not shown. The seat of the recording is marked;
        // it is never painted.
        for (let c = 0; c < TILE; c++) this.spec.setMask(t.col0 + c, 0.95);
        bands.push({ r0: this.o.bandR0, r1: this.o.bandR1, a0, a1, color: new THREE.Color(0x5a5e5c), alpha: 0.5 });
      } else {
        bands.push({
          r0: this.o.bandR0, r1: this.o.bandR1, a0, a1,
          color: new THREE.Color(info.color), alpha: inBench ? 0.95 : 0.18,
        });
      }
    }
    this.bands.geometry.dispose();
    this.bands.geometry = bandGeometry(bands, this.o.y);
    this.spec.commit();
  }

  update(feeds: LiveFeeds, data: PhenoData | null): void {
    if (data && (feeds.doy !== this.doy || feeds.bancada !== this.bancada)) this.rebuild(feeds.doy, data, feeds.bancada);

    // Paint the tiles that are sounding, column by column as they play.
    if (feeds.corpusLive && feeds.corpusFrame !== this.lastCorpusFrame) {
      this.lastCorpusFrame = feeds.corpusFrame;
      for (const [key] of feeds.sounding) {
        const t = this.tiles.get(key);
        if (!t || t.clip.opaque) continue;
        const p = feeds.clipProgress(key);
        if (p < 0) continue;
        const c = Math.min(TILE - 1, Math.floor(p * TILE));
        let mem = tileMemory.get(key);
        if (!mem) { mem = new Uint8Array(TILE * ROWS); tileMemory.set(key, mem); }
        for (let r = 0; r < ROWS; r++) {
          const i = r * TILE + c;
          // Two clips can sound at once, and the corpus bus is their mix: both
          // tiles take what was heard while they played.
          mem[i] = mem[i] + (feeds.corpus[r] * 255 - mem[i]) * 0.35;
          this.tmp[r] = mem[i] / 255;
        }
        this.spec.writeColumn(t.col0 + c, this.tmp, 1);
      }
    }
    this.spec.commit();

    const n = feeds.cursorLive ? Math.round(feeds.dayProgress * (this.progressCount - 1)) + 1 : 0;
    this.progress.geometry.setDrawRange(0, n);
    setPlayhead(this.now, minuteAngle(civilMinute()));
  }

  /** Centre of a clip's tile, for arcs and event orbiters. */
  tilePos(key: string, out = new THREE.Vector3()): THREE.Vector3 | null {
    const t = this.tiles.get(key);
    if (!t) return null;
    return polar((this.o.rIn + this.o.rOut) / 2, minuteAngle(t.col0 + TILE / 2), this.o.y + 0.02, out);
  }

  labels(add: Add, feeds: LiveFeeds, id: string): void {
    const o = this.o;
    for (let h = 0; h < 24; h++) {
      add({
        id: `${id}:h${h}`, pos: this.hourPos[h],
        text: `${String(h).padStart(2, "0")}h`, cls: "tick", priority: 8, maxDist: 40,
      });
    }
    for (let q = 0; q < 96; q++) {
      if (q % 4 === 0) continue;
      add({
        id: `${id}:q${q}`, pos: this.quarterPos[q],
        text: hhmm(q * 15), cls: "tick", priority: 2, maxDist: 2.4,
      });
    }
    for (const t of this.tiles.values()) {
      const info = roleInfo(t.clip.role);
      const sounding = feeds.sounding.has(t.clip.key);
      add({
        id: `${id}:c${t.clip.key}`,
        pos: this.clipPos.get(t.clip.key)!,
        text: t.clip.opaque ? "·" : `${info.letter} ${hhmm(t.clip.minute)}`,
        sub: t.clip.opaque ? "reservado" : (sounding ? info.label : undefined),
        cls: "clip" + (sounding ? " live" : ""),
        priority: sounding ? 30 : 6,
        maxDist: sounding ? undefined : 7,
      });
    }
    if (this.recordedHours.size) {
      add({
        id: `${id}:off`, pos: this.offPos,
        text: "fuera de horario", sub: "la grabadora no escucha de día", cls: "note", priority: 4, maxDist: 9,
      });
    }
    add({
      id: `${id}:now`, pos: polar(o.rOut + 0.5, minuteAngle(civilMinute()), o.y, this.nowPos),
      text: `ahora ${hhmm(civilMinute())}`, cls: "civil", priority: 10, maxDist: 14,
    });
    if (feeds.cursorLive) {
      add({
        id: `${id}:prog`, pos: this.progPos,
        text: `día ${Math.round(feeds.dayProgress * 100)}%`, cls: "head small", priority: 13, maxDist: 16, anchor: "l", dx: 4,
      });
    }
  }

  dispose(): void {
    this.spec.dispose();
  }
}

