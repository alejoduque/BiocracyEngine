// sources.ts — the master spectrum split into the engine's own sources
// ===========================================================================
// Demucs (HTDemucs) separates a mix into sources — drums, bass, other, vocals —
// with a waveform branch and a spectrogram branch, and refines its estimate
// with a Wiener soft mask: each source keeps the share of every frequency bin
// that its estimated power claims. We need none of the separation. SC already
// reports how loud every layer is (/stems), so the "waveform branch" is free;
// what was missing is the spectrogram per source. This borrows Demucs'
// representation and its mask, not its network.
//
//   BOSQUE   corpus, sample, ultra          the forest's own voice
//   MÁQUINA  kick, perc, golpe, ruptura, seq   the chain's percussion
//   LECHO    drone, masa                     the bed
//   AIRE     pad, dust, remuestreo, espectro, caos
//
// For each band f of the 96-band /spectrum (40 Hz – 10 kHz, 3_synthdefs.scd):
//   P_s(f) = level_s² · T_s(f)          level from /stems, T a spectral template
//   M_s(f) = P_s(f) / Σ_s P_s(f)         the Wiener mask
//   X_s(f) = M_s(f) · X(f)               the source's spectrum
// and the hard mask argmax_s M_s(f) — which source each band is adjudicated
// to — beside it, as Demucs' raw output sits beside its Wiener refinement.
//
// The templates start from where each layer's voices sit and then LEARN: when
// one source holds most of the stem energy, the master spectrum at that moment
// is mostly that source, and its template moves toward it. The split sharpens
// over a show the way NMF converges, without ever being trained offline.
//
// History is one RGBA DataTexture, 96 bands × 128 frames (6.4 s at 20 Hz):
// R bosque, G máquina, B lecho, A aire. A byte upload, not a canvas — the dome
// leak (CanvasTexture re-uploads) does not apply — and nothing here allocates
// per frame.

import * as THREE from "three";
import { getStem } from "./scAudio";

export const SOURCE_NAMES = ["bosque", "maquina", "lecho", "aire"] as const;
export type SourceName = (typeof SOURCE_NAMES)[number];
export const NS = 4;
export const NB = 96;
export const ROWS = 128;

const STEMS: string[][] = [
  ["corpus", "sample", "ultra"],
  ["kick", "perc", "golpe", "ruptura", "seq"],
  ["drone", "masa"],
  ["pad", "dust", "remuestreo", "espectro", "caos"],
];

/** Centre frequency of band i, as \masterScope lays them out. */
export function bandHz(i: number): number {
  return 40 * Math.pow(10000 / 40, i / (NB - 1));
}

/** Gaussian bump in octaves around `hz`. */
function bump(i: number, hz: number, octaves: number): number {
  const d = Math.log2(bandHz(i) / hz) / octaves;
  return Math.exp(-0.5 * d * d);
}

// Priors from the voices' own registers: the corpus after Antifonía's filters
// sits around 2–5 kHz over a broadband floor; the kick under 80 Hz and the
// struck voices in the upper mids; the bed under 400 Hz; pads and grains wide.
const PRIOR: ((i: number) => number)[] = [
  (i) => 0.25 + bump(i, 3200, 1.3),
  (i) => 0.12 + bump(i, 60, 0.8) + 0.8 * bump(i, 2000, 1.2),
  (i) => 0.05 + bump(i, 150, 1.4),
  (i) => 0.2 + bump(i, 1000, 2.0),
];

export type Sources = {
  /** Each source's spectrum this frame, 0–1 per band (display-compressed). */
  spec: Float32Array[];
  /** Wiener masks, Σ_s mask[s][f] = 1. */
  mask: Float32Array[];
  /** Hard mask: the source each band is adjudicated to. */
  win: Uint8Array;
  /** Stem RMS of each source (linear, as SC measures it). */
  level: Float32Array;
  /** Mean of the source's spectrum, 0–1. */
  energy: Float32Array;
  /** Spectral centroid of each source, 0–1 along the band axis. */
  centroid: Float32Array;
  /** Rising spectral change of each source, 0–1. */
  flux: Float32Array;
  /** Energy-weighted share of the spectrum each source wins, Σ = 1. */
  share: Float32Array;
  /** Where forest and machine sound in the same bands, 0–1. */
  overlap: number;
  /** The newest history row (0..ROWS-1). */
  row: number;
  /** Frames received. */
  frames: number;
  at: number;
  live: boolean;
};

const S: Sources = {
  spec: Array.from({ length: NS }, () => new Float32Array(NB)),
  mask: Array.from({ length: NS }, () => new Float32Array(NB).fill(1 / NS)),
  win: new Uint8Array(NB),
  level: new Float32Array(NS),
  energy: new Float32Array(NS),
  centroid: new Float32Array(NS).fill(0.5),
  flux: new Float32Array(NS),
  share: new Float32Array(NS).fill(1 / NS),
  overlap: 0,
  row: 0,
  frames: 0,
  at: 0,
  live: false,
};

/** The priors, normalised to mean 1 — kept, so learning can be pulled back to them. */
const T0: Float32Array[] = PRIOR.map((p) => {
  const t = new Float32Array(NB);
  let m = 0;
  for (let i = 0; i < NB; i++) { t[i] = p(i); m += t[i]; }
  m /= NB;
  for (let i = 0; i < NB; i++) t[i] /= m;
  return t;
});
const T: Float32Array[] = T0.map((t) => new Float32Array(t));

const X = new Float32Array(NB);        // compressed master, this frame
const P = new Float32Array(NS);
const NUM = new Float32Array(NS);      // centroid numerators
const hist = new Uint8Array(NB * ROWS * 4);
let tex: THREE.DataTexture | null = null;
let lastAt = 0;

function nowS(): number { return performance.now() / 1000; }

/** Called with every /spectrum frame (parliamentEntry), after publishScAudio. */
export function publishSources(bands: number[]): void {
  const n = Math.min(NB, bands.length);
  if (n < NB) return;                  // an older 16/48-band SC: nothing to split
  const now = nowS();
  const dt = lastAt ? Math.min(0.5, now - lastAt) : 0.05;
  lastAt = now;

  // Stem levels. Without /stems every source is equally loud and the masks
  // fall back to the templates alone — a guess, but the right shape of one.
  let lsum = 0;
  for (let s = 0; s < NS; s++) {
    let e = 0;
    for (const name of STEMS[s]) { const v = getStem(name); e += v * v; }
    S.level[s] = Math.sqrt(e);
    lsum += e;
  }
  const noStems = lsum <= 1e-12;
  let xsum = 0;
  for (let i = 0; i < NB; i++) {
    // The same compression publishScAudio uses, so these read like audio.bands.
    X[i] = Math.min(1, Math.pow(Math.max(0, bands[i]) * 3.2, 0.6));
    xsum += X[i];
  }
  const xmean = xsum / NB || 1e-6;

  // ── Learning the templates ───────────────────────────────────────────────
  // When one source holds 80 % of the stem energy, this frame is mostly that
  // source: move its template toward the frame (τ ≈ 20 s), floored so a mask
  // can never die out entirely.
  //
  // And every template relaxes toward its prior (τ ≈ 5 min). Measured on a
  // test feed, the bed — which dominates whenever the forest is quiet — had
  // learned the whole broadband floor within a minute and claimed half of the
  // forest's 3 kHz band between its swells; left alone over a two-hour show
  // that drift only grows. The pull keeps what each source was learned to be
  // without letting the loudest one become everything.
  {
    const kp = 1 - Math.exp(-dt / 300);
    for (let s = 0; s < NS; s++) {
      const t = T[s], t0 = T0[s];
      for (let i = 0; i < NB; i++) t[i] += (t0[i] - t[i]) * kp;
    }
  }
  if (!noStems && xsum > 0.5) {
    const k = 1 - Math.exp(-dt / 20);
    for (let s = 0; s < NS; s++) {
      if ((S.level[s] * S.level[s]) / lsum < 0.8) continue;
      const t = T[s];
      let m = 0;
      for (let i = 0; i < NB; i++) { t[i] += (X[i] / xmean - t[i]) * k; if (t[i] < 0.05) t[i] = 0.05; m += t[i]; }
      m /= NB;
      for (let i = 0; i < NB; i++) t[i] /= m;
    }
  }

  // ── Masks, spectra, adjudication ─────────────────────────────────────────
  for (let s = 0; s < NS; s++) { S.energy[s] = 0; S.flux[s] = 0; S.share[s] = 0; }
  NUM.fill(0);
  let ov = 0;
  for (let i = 0; i < NB; i++) {
    let psum = 0, best = 0, bi = 0;
    for (let s = 0; s < NS; s++) {
      const l = noStems ? 1 : S.level[s];
      P[s] = l * l * T[s][i] + 1e-12;
      psum += P[s];
    }
    for (let s = 0; s < NS; s++) {
      const m = P[s] / psum;
      S.mask[s][i] = m;
      const v = m * X[i];
      const d = v - S.spec[s][i];
      if (d > 0) S.flux[s] += d;
      S.spec[s][i] = v;
      S.energy[s] += v;
      if (m > best) { best = m; bi = s; }
    }
    S.win[i] = bi;
    S.share[bi] += X[i];
    // forest × machine in the same band: min of the two masks, ×2 so a band
    // split evenly between them reads 1
    ov += Math.min(S.mask[0][i], S.mask[1][i]) * 2 * X[i];
    for (let s = 0; s < NS; s++) NUM[s] += i * S.spec[s][i];
  }
  for (let s = 0; s < NS; s++) {
    const e = S.energy[s];
    S.centroid[s] = e > 1e-6 ? NUM[s] / e / (NB - 1) : S.centroid[s];
    S.energy[s] = e / NB;
    S.flux[s] = Math.min(1, S.flux[s]);
    S.share[s] = xsum > 1e-6 ? S.share[s] / xsum : 1 / NS;
  }
  S.overlap = xsum > 1e-6 ? Math.min(1, ov / xsum) : 0;

  // ── History row ──────────────────────────────────────────────────────────
  S.row = (S.row + 1) % ROWS;
  const o = S.row * NB * 4;
  for (let i = 0; i < NB; i++) {
    hist[o + i * 4]     = Math.round(S.spec[0][i] * 255);
    hist[o + i * 4 + 1] = Math.round(S.spec[1][i] * 255);
    hist[o + i * 4 + 2] = Math.round(S.spec[2][i] * 255);
    hist[o + i * 4 + 3] = Math.round(S.spec[3][i] * 255);
  }
  if (tex) tex.needsUpdate = true;

  S.frames++;
  S.at = now;
  S.live = true;
  try { (window as unknown as { __scSources?: Sources }).__scSources = S; } catch { /* ignore */ }
}

/** Expire a stopped engine (called from the entry's loop, like tickScAudio). */
export function tickSources(): void {
  if (S.live && nowS() - S.at > 1.0) {
    S.live = false;
    S.overlap = 0;
    for (let s = 0; s < NS; s++) {
      S.energy[s] = 0; S.flux[s] = 0;
      for (let i = 0; i < NB; i++) S.spec[s][i] *= 0.9;
    }
  }
}

export function getSources(): Sources { return S; }

/** The shared history texture (created on first use, kept for the session). */
export function sourcesTexture(): THREE.DataTexture {
  if (!tex) {
    tex = new THREE.DataTexture(hist, NB, ROWS, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
  }
  return tex;
}

/** Mean of one source's spectrum over a slice of the band axis (fractions). */
export function sourceBand(s: number, from: number, to: number): number {
  const a = Math.max(0, Math.floor(from * (NB - 1)));
  const b = Math.min(NB - 1, Math.ceil(to * (NB - 1)));
  const sp = S.spec[s];
  let v = 0;
  for (let i = a; i <= b; i++) v += sp[i];
  return v / (b - a + 1);
}

/** A past row of one source (age 0 = newest), copied into `out` (length NB). */
export function sourceRow(s: number, age: number, out: Float32Array): Float32Array {
  const r = ((S.row - age) % ROWS + ROWS) % ROWS;
  const o = r * NB * 4 + s;
  for (let i = 0; i < NB; i++) out[i] = hist[o + i * 4] / 255;
  return out;
}
