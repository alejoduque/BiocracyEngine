// slotVoice.ts
// The six data-structure slots (4–9) asking to sound the voice each one
// visualises. See 15_slot_voices.scd for the other half.
//
// These slots were listeners: each read its own band of the master spectrum and
// its own /voice/* onset and drew what it heard — "they react to the sound, not
// to the intention". They now also play, from their own structural events: a
// hash collision sounds a field recording, a cache eviction sounds a grain, a
// tree rotation sounds a percussion hit.
//
// ─── What this file deliberately does NOT do ────────────────────────────────
//
// It does not decide whether the note happens. The beat engine already owns
// when kick, perc and dust speak and the ETH handler owns the bell; a slot
// deciding the same thing would be a second owner of one rule, which is the
// failure this codebase keeps undoing. A slot REQUESTS on /slot/voice and
// 15_slot_voices.scd arbitrates against ~lastVoiceAt, the onset clock the
// engine stamps too. Requests landing inside a voice's minimum gap are dropped,
// so a slot can only speak where the engine has left room.
//
// The local gate below is therefore not the rule — SC's is. It exists so a
// runaway animation loop cannot flood the bridge with requests that were always
// going to be refused; it is set slightly tighter than SC's so the wire stays
// quiet, and it is the only reason this file holds any timing state at all.
//
// ─── The trigger must never come from audio ─────────────────────────────────
//
// A slot reading its own band energy and firing its own voice from it is a
// feedback loop: it would play because it is playing. Every emitter here is
// driven by the slot's own simulation — a structural event — which is also the
// whole idea. The screen plays the instrument; it does not echo it.

/** Slot 4–9 in order, matching ~slotVoiceNames in 15_slot_voices.scd. */
export type SlotVoice = "drone" | "pad" | "perc" | "kick" | "dust" | "sample";

const VOICE_INDEX: Record<SlotVoice, number> = {
  drone: 0, pad: 1, perc: 2, kick: 3, dust: 4, sample: 5,
};

// Slightly tighter than ~slotVoiceGap in SC (seconds → ms), so the wire carries
// requests that stand a chance rather than ones SC will certainly refuse.
// perc and dust were 120 ms and 60 ms. Those were set as safety limits on the
// assumption that the structural events would be sparse — and they are not, so
// the limit became the clock and the two fastest voices became a vibration
// rather than a punctuation. Raised to musical spacing: with the excursion
// trigger in front of them the density now comes from the structure, and these
// only stop a burst from turning into a buzz.
const LOCAL_GAP_MS: Record<SlotVoice, number> = {
  drone: 5400, pad: 820, perc: 520, kick: 720, dust: 380, sample: 1450,
};

// -Infinity, not 0: performance.now() starts at 0 at page load, so a zero here
// makes "never sent" indistinguishable from "sent at t=0" and swallows the
// first request of every voice in the first frames after a reload.
const lastSentAt: Record<SlotVoice, number> = {
  drone: -Infinity, pad: -Infinity, perc: -Infinity,
  kick: -Infinity, dust: -Infinity, sample: -Infinity,
};

let enabled = true;

/** Turn the six screens back into listeners without unmounting them. */
export function setSlotVoicesEnabled(on: boolean) {
  enabled = on;
  const send = (window as unknown as {
    sendParliamentAction?: (address: string, args: number[]) => void;
  }).sendParliamentAction;
  try { send?.("/slot/voices/enable", [on ? 1 : 0]); } catch { /* ignore */ }
}

export function slotVoicesEnabled(): boolean {
  return enabled;
}

/**
 * Ask SC to sound this voice.
 *
 * @param voice which of the six
 * @param amp   0–1, how hard the structural event was
 * @param tone  0–1, where in that voice's own range it lands
 * @returns true if the request was actually put on the wire
 */
export function emitSlotVoice(voice: SlotVoice, amp: number, tone: number): boolean {
  if (!enabled) return false;
  const now = performance.now();
  if (now - lastSentAt[voice] < LOCAL_GAP_MS[voice]) return false;

  const send = (window as unknown as {
    sendParliamentAction?: (address: string, args: number[]) => void;
  }).sendParliamentAction;
  if (typeof send !== "function") return false;

  lastSentAt[voice] = now;
  const a = Math.max(0, Math.min(1, amp));
  const t = Math.max(0, Math.min(1, tone));
  try {
    send("/slot/voice", [VOICE_INDEX[voice], a, t]);
  } catch {
    return false;
  }
  return true;
}

/**
 * Edge detector for a MONOTONIC counter — something that only ever goes up,
 * like a completed revolution. Fires once per increment.
 *
 * Do not use this for a measurement that jitters frame to frame. See
 * makeExcursionEmitter below for why.
 */
export function makeEventEmitter(voice: SlotVoice) {
  let prev: number | null = null;
  return (count: number, amp: number, tone: number): boolean => {
    const first = prev === null;
    const rose = !first && count > (prev as number);
    prev = count;
    // The first observation establishes a baseline rather than firing: a slot
    // mounting mid-performance should not announce itself with a note for a
    // structure that was already in that state.
    if (!rose) return false;
    return emitSlotVoice(voice, amp, tone);
  };
}

/**
 * Trigger for a measurement that MOVES — edges in a graph, nodes at their
 * target, targets acquired, hash collisions. Fires when the measure makes a
 * genuine excursion above its own running normal, and will not fire again
 * until it has come back down.
 *
 * ─── Why the naive "did it go up?" test was wrong ───────────────────────────
 *
 * These counts jitter every single frame — slot 6 adds `Math.random()` to node
 * positions on the line after it counts which nodes have arrived, so "arrived"
 * is frame noise by construction. At 60 fps a count like that has risen since
 * the last look essentially always. So `count > prev` was true every time the
 * rate gate reopened, and the gate — which exists as a safety limit — became
 * the clock instead.
 *
 * The result was that every slot fired at exactly its minimum gap: slot 6 at
 * 8 per second, which reads as vibration, and slot 7 at a metronomic ~83 BPM,
 * which reads as a drum machine. Neither was the structure speaking; both were
 * the rate limiter speaking.
 *
 * A Schmitt trigger on a slow baseline fixes it. The structure has to actually
 * do something unusual — rise `rise` above what it has lately been doing — and
 * then return to normal before it can speak again. Quiet structures stay quiet,
 * and a burst is a burst.
 */
export function makeExcursionEmitter(
  voice: SlotVoice,
  opts?: { rise?: number; fall?: number; smooth?: number },
) {
  const rise = opts?.rise ?? 1.35;    // how far above normal counts as an event
  const fall = opts?.fall ?? 1.05;    // must come back to about normal to re-arm
  const smooth = opts?.smooth ?? 0.012; // EMA weight — ~80 frames of memory
  let baseline: number | null = null;
  let armed = true;

  return (count: number, amp: number, tone: number): boolean => {
    if (baseline === null) {
      baseline = count;
      return false;
    }
    // The +0.5 floors both thresholds so a structure hovering near zero needs a
    // real change rather than a rounding one — without it, 0 -> 1 on a baseline
    // of 0 is an infinite proportional rise and fires constantly.
    const hi = baseline * rise + 0.5;
    const lo = baseline * fall + 0.5;
    baseline = baseline * (1 - smooth) + count * smooth;

    if (!armed) {
      if (count <= lo) armed = true;
      return false;
    }
    if (count > hi) {
      armed = false;
      return emitSlotVoice(voice, amp, tone);
    }
    return false;
  };
}
