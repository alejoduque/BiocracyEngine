// ─── Modal resonators ───────────────────────────────────────────────────────
//
// A shared primitive so slots 4-9 can move the way their own voice moves.
//
// THE PROBLEM THIS REPLACES
// Every one of the six read `level` and `env` and spent them on position.z,
// scale and opacity. So a kick and a bell produced the same gesture — a push
// and a brightening — and the screens read as charts with a tremble on them
// rather than as instruments. The information was there; the motion was
// generic.
//
// A struck body does not brighten. It rings: energy enters at one moment,
// distributes across modes, and each mode decays at its own rate. That is what
// `opalPerc` is (a Ringz bank), what `opalKick` is (a pitch envelope over a
// short body), and what the bell voices are. This gives the visual layer the
// same arithmetic, so a bell slot swings long and a kick slot thumps once.
//
//   x(t) = A · e^(-damp·t) · sin(2π·freq·t + φ)
//
// integrated per frame rather than solved, because these are driven from a
// loop with no reliable dt and the exact phase does not matter — the shape
// does. Cost is a sin and two multiplies per mode per frame; a bank of 24 is
// nothing next to the geometry it drives.
//
// STRIKING
// `strike(strength, tone)` excites the bank the way a mallet does: modes near
// `tone` take most of the energy, the rest take a little. So the SAME bank
// gives a different figure depending on where in its range the note landed,
// which is the point — au.tone stops being decoration and starts choosing
// which part of the structure moves.

export type ResonatorBank = {
  /** Excite the bank. `tone` 0-1 selects where the energy lands. */
  strike: (strength: number, tone: number) => void;
  /** Advance one frame. `speed` scales the rate, for timeDilation. */
  step: (speed?: number) => void;
  /** Current displacement of mode i, roughly -1..1 (decays to 0). */
  value: (i: number) => number;
  /** Current absolute energy across the bank, 0..1. Cheap to read. */
  energy: () => number;
  readonly size: number;
};

export type BankOpts = {
  /** How many modes. One per structural element that should move. */
  n: number;
  /** Cycles per frame of the lowest mode. 0.01 ≈ one swing per 100 frames. */
  baseFreq: number;
  /** Ratio between adjacent mode frequencies. >1 spreads the bank upward. */
  freqRatio?: number;
  /** Per-frame amplitude decay. 0.999 rings for seconds, 0.90 is a tick. */
  damp: number;
  /** How tightly a strike concentrates on `tone`. Small = focused mallet. */
  spread?: number;
};

export function makeResonatorBank(o: BankOpts): ResonatorBank {
  const n = Math.max(1, Math.round(o.n));
  const ratio = o.freqRatio ?? 1.06;
  const spread = o.spread ?? 0.35;
  const amp = new Float32Array(n);
  const phase = new Float32Array(n);
  const freq = new Float32Array(n);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    freq[i] = o.baseFreq * Math.pow(ratio, i);
    // Detuned by a fixed irrational-ish walk rather than randomly, so a slot
    // looks the same on every mount — a field that reshuffles its character
    // each time you switch to it cannot be learned by the performer.
    phase[i] = (i * 2.399963) % (Math.PI * 2);
  }

  return {
    size: n,
    strike(strength, tone) {
      const s = Math.max(0, Math.min(1, strength));
      if (s <= 0) return;
      const t = Math.max(0, Math.min(1, tone));
      for (let i = 0; i < n; i++) {
        const d = Math.abs(i / Math.max(1, n - 1) - t);
        // Gaussian-ish mallet: near the strike point takes the energy, the
        // rest of the bank still gets a little, so the whole body responds.
        const w = Math.exp(-(d * d) / (2 * spread * spread));
        amp[i] = Math.min(1.6, amp[i] + s * (0.12 + w * 0.88));
        // Start at MAXIMUM displacement, not at zero.
        //
        // Phase 0 means sin() starts at 0 and has to climb to pi/2 while the
        // envelope is already decaying, so the mode never reaches the
        // amplitude it was given. Measured, strength 1.0 actually peaked at:
        //
        //     pad 63.6%   perc 45.8%   kick 22.6%   dust 38.9%   sample 71.7%
        //
        // — worst exactly where it mattered most. The kick is the one visual
        // in the set that should hit you in the chest and it was arriving at
        // under a quarter strength, because the shorter the decay the more of
        // the rise it eats. That is a plucked string's initial condition
        // (x(0) = A), which is also the right one here: a struck thing is at
        // full displacement the moment it is struck, and everything after is
        // decay.
        //
        // Only modes that actually took energy are re-phased, so a fast roll
        // re-excites the contact point without resetting the whole body.
        if (w > 0.25) phase[i] = Math.PI / 2;
      }
    },
    step(speed = 1) {
      for (let i = 0; i < n; i++) {
        if (amp[i] < 1e-4) { amp[i] = 0; out[i] = 0; continue; }
        phase[i] += freq[i] * Math.PI * 2 * speed;
        amp[i] *= o.damp;
        out[i] = amp[i] * Math.sin(phase[i]);
      }
    },
    value(i) {
      return out[i % n] ?? 0;
    },
    energy() {
      let e = 0;
      for (let i = 0; i < n; i++) e += amp[i];
      return Math.min(1, e / n);
    },
  };
}
