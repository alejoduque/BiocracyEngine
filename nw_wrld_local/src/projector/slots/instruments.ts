// instruments.ts — the six voices of slots 4–9, and what they share
// ===========================================================================
// Which voice each slot plays and reads, the words on its bodies, its
// constellation backdrop, and the small helpers the six worlds have in common.

import type { ParliamentState } from "../parliament/parliamentStore";
import { getScAudio, bandRange, normLevel } from "../scAudio";
import {
    mountConstellationField,
    hueRotateFor,
    type ConstellationHandle,
    type ConstellationParams,
} from "../constellation/constellationField";
import { mountSlotTicker } from "../slotTicker";
import * as THREE from "three";

// ─── What each slot's bodies ARE ─────────────────────────────────────────────
//
// The six structures were legible only to someone who had read the source: a
// bucket, a layer, a cache level and a radar target were all just boxes, and
// nothing on screen said which. These are the captions, in each module's own
// vocabulary rather than in a shared abstract one — the point of six different
// structures is that they are six different things.
//
// Kept SHORT on purpose. A caption on a moving body is read in passing, and
// three or four characters can be; a sentence cannot.
export const SLOT_NOUNS: Record<string, { one: (i: number) => string; what: string }> = {
    // Time Travel · DRONE — each trace is one agent's history through the run.
    s4: { what: "traza", one: (i) => `T${i}` },
    // Dynamic Graphs · CAMPANAS — the bodies are the parties to a connection.
    // Dynamic Graphs · CAMPANAS — the bodies are the SIX FACTORS of the
    // BioToken, plus the product itself and the chain flux feeding it, so the
    // whole expression is on screen:
    //   value = presence · activity · ednaBio · fungiChem · aiOpt · iucn
    s5: { what: "factor", one: (i) => ["PRES", "ACTV", "eDNA", "FUNG", "AIOP", "IUCN",
                                       "TOKN", "FLUX"][i % 8] },
    // Dynamic Optimality · PERCUSIÓN — a splay tree: one root, the rest depth.
    // Dynamic Optimality · PERCUSIÓN — the tree's nodes carry the ECO SIGNALS
    // the panel already prints: CO₂, myco, phosphorus, nitrogen. Those four are
    // the ETH stream read as an ecology (parliamentStore maps /bio/* onto them),
    // and a splay tree reorganising under pressure is the right structure to
    // hang them on — the root is whichever signal is currently dominant.
    s6: { what: "señal", one: (i) => (i === 0 ? "RAÍZ" :
        ["CO₂", "MYCO", "PHOS", "NITR"][(i - 1) % 4]) },
    // Geometry · BOMBO — what the sweep has acquired.
    // Geometry · BOMBO — what the sweep acquires is a PARLIAMENTARY STATE.
    // The store carries consensus, its wave, the phase through the rotation and
    // the vote count; a radar that acquires targets is the right figure for a
    // chamber taking a reading of itself.
    s7: { what: "estado", one: (i) => ["CONS", "OLA", "FASE", "VOTO",
                                       "QUÓR", "TURN"][i % 6] },
    // Memory Hierarchy · POLVO — cache levels, nearest first.
    // Memory Hierarchy · POLVO — the levels are read as the ACOUSTIC SPACE
    // they sound in. Sala mix and RT60 are the one room every voice is heard
    // through, and a hierarchy of levels is the obvious place to print how deep
    // that room currently is: L1 nearest, RT60 growing with depth.
    s8: { what: "sala",  one: (i) => ["SALA", "RT60", "OCUP", "DIFU", "COLA",
                                      "PRE"][i % 6] },
    // Hashing · MUESTRAS — keys on the left, buckets on the right.
    // Hashing · MUESTRAS — the keys are the MIXER, one per layer, each named
    // for its own CC. A hash table maps keys to buckets; these keys are the
    // eight faders that map a layer to a level, which is the same shape of
    // statement and the one this slot can actually make about the instrument.
    s9: { what: "clave", one: (i) => ["DRONE", "PAD", "KICK", "PERC",
                                      "DUST", "SMPL", "CORP", "ULTRA"][i % 8] },
};

// ═══ THE SIX INSTRUMENTS ═════════════════════════════════════════════════
//
// Slots 4-9 were six flat diagrams on orthographic cameras, reading control
// VALUES and never the sound. They are now the six voices of the engine, one
// each and no repeats — the whole instrument laid out across six screens.
//
//   band  is the slice of the master spectrum this voice occupies, as
//         fractions of the 96-band range. A kick visual must not brighten
//         because a bell rang, so each slot reads its own register rather
//         than the mix.
//   voice is the /voice/* onset SC now broadcasts at the moment the note
//         starts. The spectrum says what is sounding; this says what has just
//         begun, and without it every reaction is late and smeared.
export type Instrument = {
    label: string; sub: string; voice: string;
    band: [number, number]; hue: number;
    // What the STRUCTURE has to do for this voice to speak, in one line.
    // `sub` names the SynthDef, which tells a reader of the code what is
    // making the sound and tells a viewer of the screen nothing. This says
    // which structural event is the trigger — the thing the excursion emitter
    // is actually watching — so the screen explains its own behaviour instead
    // of needing this file open beside it.
    hint: string;
};
export const INSTRUMENTS: Record<string, Instrument> = {
    s4: { label: "DRONE",      sub: "opalDrone · sostenido",     voice: "drone",  band: [0.00, 0.34], hue: 0.09,
        hint: "la estructura sostiene · no golpea"
    },
    s5: { label: "CAMPANAS",   sub: "elektronBell · pads",       voice: "pad",    band: [0.18, 0.62], hue: 0.13,
        hint: "cada arista tensada tañe"
    },
    s6: { label: "PERCUSIÓN",  sub: "opalPerc · pulso",          voice: "perc",   band: [0.30, 0.74], hue: 0.33,
        hint: "cada nodo que llega golpea"
    },
    s7: { label: "BOMBO",      sub: "opalKick · sub",            voice: "kick",   band: [0.00, 0.18], hue: 0.02,
        hint: "cada blanco adquirido pesa"
    },
    s8: { label: "POLVO",      sub: "opalDust · granular",       voice: "dust",   band: [0.55, 1.00], hue: 0.52,
        hint: "cada derrame se dispersa"
    },
    // [0.10, 0.95] was 85% of the spectrum — ~58 Hz to 8 kHz — and bandRange
    // is a plain mean, so this slot's level was dominated by the drone and
    // kick bands sitting near 0.15 while the field recordings it is supposed
    // to be showing sit near 0.004. It was measuring everything except itself.
    // The samples' actual register, after Antifonía's per-call hpf/lpf, is
    // bands 11-13 — roughly 2.3-4.8 kHz.
    s9: { label: "MUESTRAS",   sub: "samplePlayer · campo",      voice: "sample", band: [0.68, 0.88], hue: 0.75,
        hint: "cada colisión llama al bosque"
    },
};

// ─── The constellation backdrop, slots 5-9 ──────────────────────────────────
//
// One field per slot, mounted behind the WebGL canvas and driven by that
// slot's own voice. The point is that it is NOT wallpaper: five slots running
// the same generic starfield would be five copies of a decoration. Each field
// takes its colour from its instrument's hue and its behaviour from that
// instrument's live band, so slot 7 (BOMBO, sub) throbs red and sparse while
// slot 8 (POLVO, granular) shimmers cyan and dense.
//
// The knob mapping follows what each control already means elsewhere in the
// engine rather than inventing a second vocabulary:
//
//   textureDepth  → density        (it is the granular-density control)
//   filterCutoff  → length         (reach; slot 5 already sizes restLength by it)
//   timeDilation  → speed          (with the instrument's level on top)
//   resonantBody  → strokeWidth
//   atmosphereMix → opacity        (the same term that opens the clear alpha)
//   masterAmp     → brightness
//   voice onset   → pulse()
type SlotField = {
    field: ConstellationHandle;
    /**
     * Call once per frame, after the slot has read its own state.
     * Returns the ONSET strength for this frame, 0 when the voice did not
     * attack. The onset was already being detected here to drive pulse(); it
     * is handed back now so the slot can spend the same event on its own
     * geometry instead of each slot re-deriving it from a different threshold.
     */
    drive: (st: ParliamentState | null) => number;
    destroy: () => void;
};


export function mountSlotField(
    stageEl: HTMLElement,
    inst: Instrument,
    slotKey: string,
    tune: Partial<ConstellationParams> = {},
    reactive = true,
): SlotField {
    const field = mountConstellationField(stageEl, {
        hue: hueRotateFor(inst.hue),
        ...tune,
    }, { label: inst.label, hint: inst.hint, reactive });

    // Onsets are detected as a rising edge on the voice envelope, the same way
    // the slots detect their own flashes. Held here so the field does not
    // depend on the slot threading a value through.
    let lastEnv = 0;

    // The field prints the ticker inside its own canvas on the flat screen.
    // On the dome that would be a scrap of text at the rim of the star chart,
    // so a ticker of its own, out of sight on the flat screen, becomes the
    // dome's rings of text like on slots 6-8 (slotTicker.ts, domemaster.ts).
    const domeTicker = mountSlotTicker(stageEl,
        `${inst.label} · ${inst.sub} · ${inst.hint.toUpperCase()}`, undefined, { domeOnly: true });

    const onResize = () => { field.resize(); domeTicker.resize(); };
    window.addEventListener("resize", onResize);

    return {
        field,
        drive(st: ParliamentState | null) {
            const sp = (window as unknown as Record<string, Record<string, number>>)[slotKey] ?? {};
            const r = readInstrument(inst);

            const texDep = sp.texturedepth ?? 0.5;
            const filtC = sp.filtercutoff ?? 0.5;
            const tDil = sp.timedilation ?? 0.5;
            const resBody = sp.resonantbody ?? 0.4;
            const atmMix = sp.atmospheremix ?? 0.5;
            const masterA = sp.masteramp ?? 0.7;
            const consensus = st?.consensus ?? 0.5;

            // ── The controls that reached the sound and stopped there ──────
            //
            // /mix, /cadence and the bowl/china toggles were audible and
            // invisible: twenty controls with no consequence on these five
            // screens. They are read here, ONCE, so all five inherit them
            // rather than five slots each growing their own version.
            //
            // Keyed off inst.voice, so a slot answers to ITS OWN fader and no
            // other — slot 6 is perc and reads mix:perc; moving mix:kick must
            // do nothing here. That asymmetry is the whole point of the
            // one-slot-one-voice arrangement in INSTRUMENTS, and a global
            // response would quietly undo it.
            //
            // Echoed values arrive normalised 0-1 whatever the parameter's own
            // spec — /cadence/perc is exp 0.02-4.0 in SC and still 0-1 on the
            // wire — so they can be used directly without knowing each range.
            const mixOwn = sp[`mix:${inst.voice}`] ?? 0.5;
            const cadOwn = sp[`cadence:${inst.voice}`];
            // The room. chamberMix and chamberSize are /soneth/ paths, so they
            // already arrive through the existing fan-out; they were simply
            // never read. Every screen shows the same room because there is
            // only one — that is the point of it.
            const chMix = sp.chambermix ?? 0.18;
            const chSize = sp.chambersize ?? 0.45;
            // Bowl and china say which halves of the struck voice exist, so
            // they belong to the perc slot and nowhere else. They are STATE
            // rather than events, which is why they are read here and not
            // expressed through crack/splash — those are onsets, and on a
            // silent field they never fire.
            //
            // The two halves are drawn as what they are. A bowl rings long and
            // fills the room, so it lengthens the reach. A china is bright and
            // short, so it sharpens the line and adds light. Both on is the
            // fusion the voice actually is; both off leaves the sky as it was.
            const isPerc = inst.voice === "perc";
            const bowlOn = isPerc ? (sp["voice:bowl"] ?? 1) : 0;
            const chinaOn = isPerc ? (sp["voice:china"] ?? 1) : 0;
            // La marea. Sent by 5_beat_engine.scd:1455 as /tide/state with the
            // value and the phase, captured by parliamentEntry, and until now
            // read only by slot A. It is a GLOBAL arc, so unlike everything
            // above it is deliberately not per-voice: all five screens swell
            // together on one phase or it is not an arc, it is five drifts.
            const tideV = readTide();

            // A silent field takes its parameters from the CONTROLS only. The
            // level term is what made the drift quicken and the colour lift on
            // every note, and that is the reactivity being removed — leaving it
            // in while suppressing pulse() would have taken the flinch and kept
            // the fidget.
            const lvl = reactive ? r.level : 0.35;

            field.drive({
                // Level rides on top of the control so the field breathes with
                // the note rather than only with the knob.
                // Cadence is how often the voice speaks, so it becomes how
                // fast the sky moves. Absent for drone and sample, which have
                // no /cadence control — those keep the tide alone.
                speed: (0.25 + tDil * 1.6) * (0.6 + lvl * 1.8)
                    * (cadOwn === undefined ? 1 : (0.55 + cadOwn * 0.9))
                    * (0.75 + tideV * 0.5),
                density: 0.35 + texDep * 1.15,
                // The chamber's reach. A larger room associates further, which
                // is what `length` already means here.
                length: (0.55 + filtC * 0.9) * (0.85 + chSize * 0.5)
                    * (1 + bowlOn * 0.22),
                strokeWidth: (0.5 + resBody * 1.6) * (1 - chinaOn * 0.28),
                // atmosphereMix is the reverb space, so it reads as how much
                // room there is around the voice — the field is that room.
                // Floored well above zero because a screen-blended layer at
                // 0.2 over a near-black scene is already almost invisible.
                // The voice's own fader is how present it is in the room, so
                // it is how present its sky is. Floored well above zero: a
                // layer pulled down should recede, not disappear — it still
                // holds a seat.
                opacity: (0.24 + atmMix * 0.44) * (0.6 + consensus * 0.4)
                    * (0.45 + mixOwn * 0.75) * (0.72 + tideV * 0.42),
                // More of the engine heard through the common room reads as
                // more light shared across the field.
                brightness: (0.7 + masterA * 0.7) * (0.9 + chMix * 0.45)
                    * (1 + chinaOn * 0.18),
                saturation: 0.8 + lvl * 0.6,
            });

            const onset = r.env > lastEnv + 0.06 ? Math.min(1, r.env * 0.9) : 0;
            if (onset > 0) field.pulse(onset);
            lastEnv = r.env;
            // Still RETURNED even when silent: the slot's own chart uses this
            // for its resonators and its own flashes, which are not what was
            // being removed. Only the sky stops answering — field.pulse and
            // field.strike are no-ops on a non-reactive field, guarded inside
            // the field itself.
            domeTicker.draw(1);
            return onset;
        },
        destroy() {
            window.removeEventListener("resize", onResize);
            field.destroy();
            domeTicker.destroy();
        },
    };
}

/**
 * The onset edge on its own, with no constellation attached.
 *
 * The five slots all reached their voice's attack through cfield.drive, which
 * is fine while every slot carries a field and wrong the moment one does not:
 * the sky is a backdrop, and needing it in order to know that a note started
 * makes the backdrop load-bearing. Slots 7, 8 and 9 use this instead.
 *
 * Same rising-edge test and the same 0.06 threshold mountSlotField uses, so a
 * slot with a field and a slot without one flash on exactly the same frame.
 */
export function makeOnsetEdge(inst: Instrument): (st: ParliamentState | null) => number {
    let lastEnv = 0;
    return function drive(_st: ParliamentState | null) {
        const r = readInstrument(inst);
        const onset = r.env > lastEnv + 0.06 ? Math.min(1, r.env * 0.9) : 0;
        lastEnv = r.env;
        return onset;
    };
}

/** The tide's value (5_beat_engine.scd /tide/state), 0.65 when flat or stale. */
function readTide(): number {
    try {
        const t = (window as unknown as {
            __tideState?: { value?: number; t?: number };
        }).__tideState;
        if (!t || typeof t.value !== "number") return 0.65;
        // Stale means SuperCollider stopped; hold the flat value
        // rather than freezing at whatever the last swell was.
        if (t.t && (Date.now() / 1000 - t.t) > 8) return 0.65;
        return Math.max(0, Math.min(1, t.value));
    } catch { return 0.65; }
}

export type InstrumentReading = {
    level: number; env: number; amp: number; tone: number;
    live: boolean; flux: number; rms: number;
};
/** One reading object per voice, rewritten in place: this is read every frame. */
const readings: Record<string, InstrumentReading> = {};

/** Live reading for one instrument: its register, and its last attack. */
export function readInstrument(inst: Instrument): InstrumentReading {
    const a = getScAudio();
    const r = (readings[inst.voice] ??= { level: 0, env: 0, amp: 0, tone: 0, live: false, flux: 0, rms: 0 });
    // Normalised against this instrument's own recent peak, not used raw: the
    // low band runs ~40x hotter than the high one on a live engine, so a raw
    // reading makes the treble slots look dead while they are working.
    r.level = normLevel(inst.voice, bandRange(inst.band[0], inst.band[1]));
    const v = a.voices[inst.voice];
    r.env = v ? v.env : 0; r.amp = v ? v.amp : 0; r.tone = v ? v.tone : 0;
    r.live = a.live; r.flux = a.flux; r.rms = a.rms;
    return r;
}

/** A flat circle of line segments, used by the reticules and the radar arcs. */
export function makeCircle(radius: number, segments: number, color: number, opacity: number): THREE.Line {
    const pts = new Float32Array((segments + 1) * 3);
    for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        pts[i * 3] = Math.cos(a) * radius; pts[i * 3 + 1] = Math.sin(a) * radius;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pts, 3));
    return new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
}

// ─── lerp helper ─────────────────────────────────────────────────────────────
export function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

/**
 * Two decimals, clamped so the printed field can never grow.
 *
 * A caption carrying a live value must not change WIDTH — see `anchorLeft` in
 * LabelStyle for why. Clamping to two digits plus two decimals bounds the
 * string, and NaN (which prints as "NaN" and is three characters wide) is
 * caught here rather than becoming a caption that flickers between widths
 * whenever a divisor happens to be zero.
 */
export function fixed2(v: number): string {
    const x = Number.isFinite(v) ? v : 0;
    return Math.max(-99.99, Math.min(99.99, x)).toFixed(2);
}

// ─── Deterministic noise (simplex-like via sin hash) ─────────────────────────
export function snoise(x: number, y: number): number {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return n - Math.floor(n);
}
