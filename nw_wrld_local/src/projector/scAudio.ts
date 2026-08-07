// scAudio.ts
// The sound the engine is actually making, published for the visuals.
//
// Two channels, because they answer different questions:
//
//   bands / low / mid / high  — CONTINUOUS. What is being heard right now.
//     SC's \masterScope analyses the master bus AFTER the limiter and sends 16
//     log-spaced amplitudes at 20 Hz, so this is the signal leaving the
//     machine, not a guess assembled from control values. (It had been
//     arriving all along with nothing listening: the receiver existed and was
//     never called, so the spectrogram ran on its synthetic fallback.)
//
//   voices[]                  — DISCRETE. What has just begun.
//     Energy in a band tells you a bell is ringing; it does not tell you it was
//     struck. Without the attack every visual reacts late and smeared, which is
//     the difference between a meter and an instrument.
//
// Six voices, six slots (4-9), one each and no repeats — see INSTRUMENTS in
// dataStructureVisuals.ts.

export type Voice = {
  /** Seconds (performance clock) when this voice last fired. */
  at: number;
  /** Attack amplitude of that onset, 0-1. */
  amp: number;
  /** Normalised pitch/index of that onset where the voice has one, else 0. */
  tone: number;
  /** 1 at the instant of onset, decaying to 0 — read this per frame. */
  env: number;
};

export type ScAudio = {
  /** 16 log-spaced band amplitudes, 0-1, straight off the master bus. */
  bands: number[];
  /** Mean level. */
  rms: number;
  /** Coarse registers, 0-1. */
  low: number;
  mid: number;
  high: number;
  /** Spectral flux — how fast the picture is changing. Onset-ish, cheap. */
  flux: number;
  /** performance.now()/1000 of the last spectrum frame. 0 = never. */
  at: number;
  /** True while spectrum frames are arriving. */
  live: boolean;
  voices: Record<string, Voice>;
};

const VOICE_NAMES = ["kick", "perc", "dust", "pad", "sample", "drone"];

const audio: ScAudio = {
  bands: new Array(16).fill(0),
  rms: 0, low: 0, mid: 0, high: 0, flux: 0,
  at: 0, live: false,
  voices: Object.fromEntries(
    VOICE_NAMES.map((n) => [n, { at: 0, amp: 0, tone: 0, env: 0 } as Voice])
  ),
};

let prevBands: number[] = new Array(16).fill(0);

function nowS(): number {
  return (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
}

export function publishScAudio(bands: number[]): void {
  const n = bands.length;
  let sum = 0, lo = 0, mi = 0, hi = 0, flux = 0;
  for (let i = 0; i < n; i++) {
    // Amplitude.kr is linear and the interesting detail lives near the floor;
    // the same compression the spectrogram uses, so both read alike.
    const v = Math.min(1, Math.pow(Math.max(0, bands[i]) * 3.2, 0.6));
    audio.bands[i] = v;
    sum += v;
    const f = i / Math.max(1, n - 1);
    if (f < 0.28) lo += v; else if (f < 0.62) mi += v; else hi += v;
    const d = v - (prevBands[i] ?? 0);
    if (d > 0) flux += d;          // rising edges only — falls are not onsets
    prevBands[i] = v;
  }
  audio.rms = sum / n;
  audio.low = Math.min(1, lo / Math.max(1, n * 0.28));
  audio.mid = Math.min(1, mi / Math.max(1, n * 0.34));
  audio.high = Math.min(1, hi / Math.max(1, n * 0.38));
  audio.flux = Math.min(1, flux);
  audio.at = nowS();
  audio.live = true;
  try {
    (window as unknown as { __scAudio?: ScAudio }).__scAudio = audio;
  } catch { /* ignore */ }
}

export function noteVoiceOnset(name: string, amp: number, tone: number): void {
  const v = audio.voices[name];
  if (!v) return;
  v.at = nowS();
  v.amp = Math.max(0, Math.min(1, amp));
  v.tone = Math.max(0, Math.min(1, tone));
  v.env = 1;
  try {
    (window as unknown as { __scAudio?: ScAudio }).__scAudio = audio;
  } catch { /* ignore */ }
}

/**
 * Decay the onset envelopes and expire the whole feed if SC has gone quiet.
 * Called from the entry's animation loop; keeping the decay in ONE place means
 * six slots do not each integrate their own and drift apart.
 */
export function tickScAudio(dt: number): void {
  for (const k of VOICE_NAMES) {
    const v = audio.voices[k];
    if (v.env > 0) v.env = Math.max(0, v.env - dt * 3.2);
  }
  // A stopped engine must not leave the last frame frozen on screen looking
  // like sound — the same 1 s staleness rule the spectrogram already used.
  if (audio.at > 0 && nowS() - audio.at > 1.0) {
    audio.live = false;
    audio.rms = audio.low = audio.mid = audio.high = audio.flux = 0;
    for (let i = 0; i < audio.bands.length; i++) audio.bands[i] *= 0.9;
  }
}

// ── Per-instrument auto-gain ────────────────────────────────────────────────
// Absolute band levels are useless as a visual input: measured on a live
// engine the low band sits near 0.15 and the high band near 0.004, so a slot
// keyed to `high` multiplied its geometry by roughly nothing and looked
// broken while the sound was perfectly fine.
//
// Each instrument therefore normalises against its OWN recent peak — fast to
// rise so a hit registers immediately, slow to fall so quiet passages open up
// rather than going black. The floor stops a silent engine from dividing by
// nothing and slamming everything to full.
const peaks: Record<string, number> = {};

export function normLevel(key: string, raw: number, dt = 0.016): number {
  const p = peaks[key] ?? 0.02;
  const next = raw > p ? raw : p + (raw - p) * Math.min(1, dt * 0.35);
  peaks[key] = Math.max(0.02, next);
  return Math.max(0, Math.min(1, raw / peaks[key]));
}

export function getScAudio(): ScAudio {
  return audio;
}

/**
 * Mean level over a slice of the spectrum, given as fractions of the range.
 * This is how each instrument slot reads ITS OWN register rather than the
 * whole mix — a kick visual should not brighten because a bell rang.
 */
export function bandRange(from: number, to: number): number {
  const n = audio.bands.length;
  const a = Math.max(0, Math.floor(from * (n - 1)));
  const b = Math.min(n - 1, Math.ceil(to * (n - 1)));
  let s = 0, c = 0;
  for (let i = a; i <= b; i++) { s += audio.bands[i]; c++; }
  return c ? s / c : 0;
}
