// liveFeeds.ts
// One snapshot per frame of everything the ring stages read from the engine.
//
// Every value here is already published by parliamentEntry.ts as a window
// global; this only reads them, in one place, with one staleness rule each, so
// three stages cannot disagree about whether SuperCollider is running.
//
//   _fftBinsExternal/_fftSourceExternal  the master bus (or the room mic),
//                          256 log-spaced bins, written onto the active stage
//                          every frame by the entry's animLoop.
//   __scCorpus             the corpus bus alone — the forest's own voice —
//                          raw \corpusScope bands, 20 Hz.
//   __scAudio.voices       per-voice onsets (kick/perc/dust/pad/sample/drone).
//   __phenoCursor          the ring's day, pushed once per ring day.
//   __phenoClipBus         /pheno/clip events: which recording just began.
//   __phenoParams          the Cámara Fenológica faders, normalised 0..1.
//   __sonethParams         the sonETH faders, normalised 0..1.
//
// Nothing is invented when a feed is absent. A synthetic spectrum is never
// painted, a stale cursor is reported as stale, and silence stays dark: the
// compression below is a fixed curve rather than an auto-gain, because an
// auto-gain turns an empty bus into a bright one.

import parliamentStore from "../parliament/parliamentStore";
import { F_HI, F_LO, civilDoy, clamp01 } from "./ringMath";
import {
  opacityFloorFromNorm, thresholdFromNorm, windowScaleFromNorm,
} from "./phenoData";

/** Frequency rows in every spectrogram texture. */
export const ROWS = 128;

export type MasterSource = "sc" | "mic" | "synthetic" | null;

export type ClipEvent = {
  seq: number;
  key: string;
  role: string;
  temporada: string;
  habitat: string;
  doy: number;
  ultrasonic: number;
  confidence: number;
  /** performance.now() at arrival, ms. */
  at: number;
};

type CursorGlobal = {
  doy: number; temporada: string; clips: number; gap: number; quorum: number;
  at: number; secsPerDay?: number;
};

type Win = {
  __scAudio?: { live?: boolean; voices?: Record<string, { env: number; at: number; amp: number }> };
  __scCorpus?: { bands: number[]; at: number };
  __phenoCursor?: CursorGlobal;
  __phenoClipBus?: { seq: number; events: ClipEvent[] };
  __phenoParams?: Record<string, number>;
  __sonethParams?: Record<string, number>;
  __vizMotion?: { speed?: number };
};

function win(): Win {
  return (typeof window !== "undefined" ? window : {}) as unknown as Win;
}

/** The entry's scBins curve: Amplitude.kr is linear and sits low. */
export function compress(v: number): number {
  return Math.min(1, Math.pow(Math.max(0, v) * 8.0, 0.45));
}

/**
 * Resample log-spaced source bins (srcLo..srcHi) onto the rings' own axis
 * (F_LO..F_HI, ROWS rows). Rows outside the source's range stay 0 — the mic
 * stops at 8 kHz and must not smear its top bin up to 10.
 */
export function resampleLog(
  src: ArrayLike<number>, srcLo: number, srcHi: number, out: Float32Array, curve = false
): void {
  const n = src.length;
  const k = Math.log(srcHi / srcLo);
  for (let r = 0; r < out.length; r++) {
    const f = F_LO * Math.pow(F_HI / F_LO, r / (out.length - 1));
    const p = (Math.log(f / srcLo) / k) * (n - 1);
    if (p < -0.5 || p > n - 0.5 || n === 0) { out[r] = 0; continue; }
    const lo = Math.max(0, Math.min(n - 1, Math.floor(p)));
    const hi = Math.min(n - 1, lo + 1);
    const t = Math.max(0, Math.min(1, p - lo));
    const v = (src[lo] ?? 0) * (1 - t) + (src[hi] ?? 0) * t;
    out[r] = curve ? compress(v) : clamp01(v);
  }
}

export class LiveFeeds {
  /** Seconds, performance clock. */
  now = 0;

  master = new Float32Array(ROWS);
  masterSource: MasterSource = null;
  /** True when `master` is a real reading (SC bus or mic), not the fallback. */
  masterLive = false;
  /** Mean level of the live master rows, 0..1. 0 when not live. */
  rms = 0;

  corpus = new Float32Array(ROWS);
  corpusLive = false;
  /** Bumps each time a new corpus frame arrived — one accumulation per frame. */
  corpusFrame = 0;
  private corpusAt = 0;

  // ── The ring's day ──────────────────────────────────────────────────────
  cursorLive = false;
  /** The day the rings stand on: the SC ring's when live, the civil date otherwise. */
  doy = civilDoy();
  civil = civilDoy();
  temporada = "";
  quorum = 0.5;
  dayClips = 0;
  gap = 0;
  /** Seconds one ring day lasts. From /pheno/cursor's 6th argument, else measured. */
  secsPerDay = 60;
  /** 0..1 through the current ring day. */
  dayProgress = 0;
  private dayStartedAt = 0;
  private lastCursorAt = -1;
  private cursorIntervals: number[] = [];

  // ── Events ──────────────────────────────────────────────────────────────
  /** Clip events that arrived since the previous update. */
  newClips: ClipEvent[] = [];
  /** Clips sounding now (SC holds each for ~0.9 of a ring day). */
  sounding = new Map<string, { ev: ClipEvent; start: number; hold: number }>();
  private lastSeq = -1;

  // ── Faders ──────────────────────────────────────────────────────────────
  consensus = 0.5;
  opacityFloor = 0;
  windowScale = windowScaleFromNorm(0.29);
  threshold = thresholdFromNorm(0.46);
  /** 0 = todas, 1..4 = the role bancadas (clip.bancada == bancada − 1). */
  bancada = 0;
  vizDrift = 0;

  soneth(key: string, def: number): number {
    const sp = win().__sonethParams;
    const v = sp ? sp[key] : undefined;
    return typeof v === "number" && Number.isFinite(v) ? v : def;
  }

  voiceEnv(name: string): number {
    const v = win().__scAudio?.voices?.[name];
    return v ? v.env || 0 : 0;
  }

  voiceAt(name: string): number {
    const v = win().__scAudio?.voices?.[name];
    return v ? v.at || 0 : 0;
  }

  voiceAmp(name: string): number {
    const v = win().__scAudio?.voices?.[name];
    return v ? v.amp || 0 : 0;
  }

  update(stage: { _fftBinsExternal?: Float32Array | null; _fftSourceExternal?: string | null }): void {
    const w = win();
    const nowMs = performance.now();
    this.now = nowMs / 1000;

    // ── Master ────────────────────────────────────────────────────────────
    const bins = stage._fftBinsExternal;
    let src = (stage._fftSourceExternal as MasterSource) ?? null;
    if (!src && bins) src = w.__scAudio?.live ? "sc" : "synthetic";
    this.masterSource = bins ? src : null;
    this.masterLive = !!bins && (src === "sc" || src === "mic");
    if (this.masterLive && bins) {
      // Already compressed by the entry (scBins / micBins); only the axis differs.
      if (src === "mic") resampleLog(bins, 20, 8000, this.master);
      else resampleLog(bins, F_LO, F_HI, this.master);
      let s = 0;
      for (let i = 0; i < ROWS; i++) s += this.master[i];
      this.rms = s / ROWS;
    } else {
      this.master.fill(0);
      this.rms = 0;
    }

    // ── Corpus ────────────────────────────────────────────────────────────
    const c = w.__scCorpus;
    this.corpusLive = !!c && Array.isArray(c.bands) && nowMs - (c.at || 0) < 1000;
    if (this.corpusLive && c && c.at !== this.corpusAt) {
      this.corpusAt = c.at;
      resampleLog(c.bands, F_LO, F_HI, this.corpus, true);
      this.corpusFrame++;
    } else if (!this.corpusLive) {
      this.corpus.fill(0);
    }

    // ── Cursor ────────────────────────────────────────────────────────────
    this.civil = civilDoy();
    const cur = w.__phenoCursor;
    if (cur && typeof cur.at === "number" && cur.at !== this.lastCursorAt) {
      if (this.lastCursorAt > 0) {
        const iv = (cur.at - this.lastCursorAt) / 1000;
        if (iv > 0.1 && iv < 3600) {
          this.cursorIntervals.push(iv);
          if (this.cursorIntervals.length > 5) this.cursorIntervals.shift();
        }
      }
      this.lastCursorAt = cur.at;
      this.dayStartedAt = cur.at / 1000;
    }
    if (cur && typeof cur.secsPerDay === "number" && cur.secsPerDay > 0) {
      this.secsPerDay = cur.secsPerDay;
    } else if (this.cursorIntervals.length) {
      const s = this.cursorIntervals.slice().sort((a, b) => a - b);
      this.secsPerDay = s[Math.floor(s.length / 2)];
    }
    // A cursor is pushed once per ring day, so a slow ring is not a dead one:
    // stale means SC has missed a day and a half, and never less than 20 s —
    // the rule slot 0 has always used.
    const staleMs = Math.max(20000, this.secsPerDay * 1500);
    this.cursorLive = !!cur && nowMs - (cur.at || 0) < staleMs;
    if (this.cursorLive && cur) {
      this.doy = Math.max(1, Math.min(365, Math.round(Number(cur.doy) || 1)));
      this.temporada = String(cur.temporada || "");
      this.quorum = clamp01(Number(cur.quorum) || 0);
      this.dayClips = Number(cur.clips) || 0;
      this.gap = Number(cur.gap) || 0;
      this.dayProgress = clamp01((this.now - this.dayStartedAt) / Math.max(0.1, this.secsPerDay));
    } else {
      // The civil date, and said so by the stage. A cursor frozen at the last
      // day SC reported would be a lie, not a default.
      this.doy = this.civil;
      this.temporada = "";
      this.quorum = 0.5;
      this.dayClips = 0;
      this.gap = 0;
      this.dayProgress = 0;
    }

    // ── Clip events ───────────────────────────────────────────────────────
    this.newClips.length = 0;
    const bus = w.__phenoClipBus;
    if (bus && Array.isArray(bus.events)) {
      const holdMs = Math.max(2000, this.secsPerDay * 900);
      for (const ev of bus.events) {
        if (ev.seq <= this.lastSeq) continue;
        // On the first read, replay only what is still sounding, so a stage
        // mounted mid-day shows the day's clips rather than the session's.
        if (this.lastSeq < 0 && nowMs - ev.at > holdMs) continue;
        this.newClips.push(ev);
        this.sounding.set(ev.key, { ev, start: ev.at / 1000, hold: holdMs / 1000 });
      }
      this.lastSeq = Math.max(this.lastSeq, bus.seq ?? -1);
    }
    for (const [k, s] of this.sounding) {
      if (this.now - s.start > s.hold || (this.cursorLive && s.ev.doy !== this.doy)) {
        this.sounding.delete(k);
      }
    }

    // ── Faders ────────────────────────────────────────────────────────────
    const st = parliamentStore.state;
    this.consensus = st && Number.isFinite(st.consensus) ? clamp01(st.consensus) : 0.5;
    const pp = w.__phenoParams || {};
    this.opacityFloor = opacityFloorFromNorm(Number(pp.opacityFloor ?? 0));
    this.windowScale = windowScaleFromNorm(Number(pp.windowWidth ?? 0.29));
    this.threshold = thresholdFromNorm(Number(pp.activityThreshold ?? 0.46));
    this.bancada = Math.max(0, Math.min(4, Math.round(Number(pp.bancada ?? 0) * 4)));
    const vm = w.__vizMotion;
    this.vizDrift = vm && typeof vm.speed === "number" ? vm.speed : 0;
  }

  /** How far into its hold a sounding clip is, 0..1, or −1 if it is not sounding. */
  clipProgress(key: string): number {
    const s = this.sounding.get(key);
    if (!s) return -1;
    return clamp01((this.now - s.start) / Math.max(0.1, s.hold));
  }
}
