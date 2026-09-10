import * as THREE from "three";
import { EffectComposer }  from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass }      from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { AfterimagePass }  from "three/examples/jsm/postprocessing/AfterimagePass.js";
import { ShaderPass }      from "three/examples/jsm/postprocessing/ShaderPass.js";
import type { ParliamentState } from "./parliament/parliamentStore";
import { getVizMotion, readVoteFlash, isAlarm } from "./vizMotion";
import { getScAudio, bandRange, normLevel, slew } from "./scAudio";
import { makeEventEmitter, makeExcursionEmitter } from "./slotVoice";
import { makeResonatorBank } from "./resonators";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
    mountConstellationField,
    hueRotateFor,
    type ConstellationHandle,
    type ConstellationParams,
} from "./constellation/constellationField";
import {
    Viz,
    pickSpecies,
    showStage,
    SPECIES_ROSTER,
} from "./visualizationSwitcher";
import { mountSlotTicker } from "./slotTicker";
import {
    makeNodeField,
    makeTubeLinks,
    makeDepthGrid,
    makeParticles,
    makeLabelField,
    makeCalm,
    attachPicker,
} from "./slotThree";

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
const SLOT_NOUNS: Record<string, { one: (i: number) => string; what: string }> = {
    // Time Travel · DRONE — each trace is one agent's history through the run.
    s4: { what: "traza", one: (i) => `T${i}` },
    // Dynamic Graphs · CAMPANAS — the bodies are the parties to a connection.
    s5: { what: "nodo",  one: (i) => `N${i}` },
    // Dynamic Optimality · PERCUSIÓN — a splay tree: one root, the rest depth.
    s6: { what: "rama",  one: (i) => (i === 0 ? "RAÍZ" : `R${i}`) },
    // Geometry · BOMBO — what the sweep has acquired.
    s7: { what: "blanco", one: (i) => `B${i}` },
    // Memory Hierarchy · POLVO — cache levels, nearest first.
    s8: { what: "nivel", one: (i) => `L${i + 1}` },
    // Hashing · MUESTRAS — keys on the left, buckets on the right.
    s9: { what: "clave", one: (i) => `K${i}` },
};

// ─── Shared chromatic-aberration shader (reused across slots) ────────────────
const ChromaticAberrationShader = {
    uniforms: { tDiffuse: { value: null }, amount: { value: 0.0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
        uniform sampler2D tDiffuse; uniform float amount; varying vec2 vUv;
        void main(){
            vec2 dir=vUv-0.5; float d=length(dir); vec2 off=normalize(dir)*amount*d;
            float r=texture2D(tDiffuse,vUv+off).r; float g=texture2D(tDiffuse,vUv).g; float b=texture2D(tDiffuse,vUv-off).b;
            gl_FragColor=vec4(r,g,b,1.0);
        }`,
};

// ─── Shared helper: make a WebGLRenderer fitted to container ────────────────
// Deliberately still opaque, and the constellation field for slots 5-9 does
// NOT sit behind it.
//
// The obvious design was to open an alpha buffer here and let the field show
// through — slots 5, 6 and 7 even end their frame with
// `setClearColor(0x000804, lerp(0.5, 0.95, 1 - atmMix))`, an alpha that has
// never done anything because the context had none. Measured, it still does
// nothing: with `alpha: true` and that same clear, a screenshot amplified 6x
// shows a flat background and no field at all. The scene goes through an
// EffectComposer, and UnrealBloom/Afterimage/ShaderPass write an opaque alpha
// into the final pass regardless of what the clear asked for. Chasing alpha
// through four post passes to reveal a backdrop is not worth it.
//
// So the field is composited ON TOP with `mix-blend-mode: screen` instead —
// see constellation/constellationField.ts. Screen only ever adds light, so on
// these dark scenes it reads as atmosphere in the room rather than as a sheet
// over the geometry, and it is independent of whatever the composer does.
function makeRenderer(container: HTMLElement): THREE.WebGLRenderer {
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    r.setClearColor(0x000804, 1);
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.setSize(container.offsetWidth || 800, container.offsetHeight || 600);
    container.appendChild(r.domElement);
    return r;
}

// ─── Shared helper: orthographic camera for 2.5D overlays ───────────────────
function makeOrthoCamera(w: number, h: number): THREE.OrthographicCamera {
    return new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 0.1, 1000);
}

// ═══ THE SIX INSTRUMENTS ═════════════════════════════════════════════════
//
// Slots 4-9 were six flat diagrams on orthographic cameras, reading control
// VALUES and never the sound. They are now the six voices of the engine, one
// each and no repeats — the whole instrument laid out across six screens.
//
//   band  is the slice of the master spectrum this voice occupies, as
//         fractions of the 16-band range. A kick visual must not brighten
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

function mountSlotField(
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

    const onResize = () => field.resize();
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
            const tideV = (() => {
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
            })();

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
            return onset;
        },
        destroy() {
            window.removeEventListener("resize", onResize);
            field.destroy();
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
function makeOnsetEdge(inst: Instrument): (st: ParliamentState | null) => number {
    let lastEnv = 0;
    return function drive(_st: ParliamentState | null) {
        const r = readInstrument(inst);
        const onset = r.env > lastEnv + 0.06 ? Math.min(1, r.env * 0.9) : 0;
        lastEnv = r.env;
        return onset;
    };
}

/** Live reading for one instrument: its register, and its last attack. */
function readInstrument(inst: Instrument) {
    const a = getScAudio();
    // Normalised against this instrument's own recent peak, not used raw: the
    // low band runs ~40x hotter than the high one on a live engine, so a raw
    // reading makes the treble slots look dead while they are working.
    const level = normLevel(inst.voice, bandRange(inst.band[0], inst.band[1]));
    const v = a.voices[inst.voice] ?? { at: 0, amp: 0, tone: 0, env: 0 };
    return { level, env: v.env, amp: v.amp, tone: v.tone, live: a.live, flux: a.flux, rms: a.rms };
}

// ─── Shared helper: perspective camera + orbit, for the 3-D rebuild ────────
// These six had fixed cameras and no controls at all — nothing to look around
// with, and nothing for ROTATION SPD to turn. They get a real camera now, and
// the same idle drift as everything else.
function make3D(container: HTMLElement, dist: number) {
    const w = container.offsetWidth || 800, h = container.offsetHeight || 600;
    const camera = new THREE.PerspectiveCamera(52, w / h, 1, 8000);
    // Barely elevated. At 0.22 the flat-authored geometry in these six was
    // seen from above and raked into a wedge; the depth should read as
    // depth, not as a bird's-eye view of a diagram.
    camera.position.set(0, dist * 0.07, dist);
    camera.lookAt(0, 0, 0);
    return camera;
}

function attachOrbit(camera: THREE.Camera, dom: HTMLElement, dist: number): OrbitControls {
    const c = new OrbitControls(camera, dom as HTMLCanvasElement);
    c.enableDamping = true;
    c.dampingFactor = 0.06;
    c.minDistance = dist * 0.35;
    c.maxDistance = dist * 2.6;
    c.target.set(0, 0, 0);
    // Fed from window.__vizMotion by the caller's loop, like every other slot.
    c.autoRotate = true;
    c.autoRotateSpeed = 0;
    c.update();
    return c;
}

/** Push autoRotateSpeed from the shared idle drift. Call once per frame. */
function driveOrbit(c: OrbitControls | null) {
    if (!c) return;
    const vm = getVizMotion();
    c.autoRotateSpeed = vm.speed * (30 / Math.PI);
    c.update();
}

// ─── lerp helper ─────────────────────────────────────────────────────────────
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

// ─── Deterministic noise (simplex-like via sin hash) ─────────────────────────
function snoise(x: number, y: number): number {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return n - Math.floor(n);
}

// ─── Slot 4: Time Travel (Persistent Structures) ─────────────────────────────
// Concept preserved: phosphor traces scroll right→left, radar reticule rotates,
//   species markers show at right edge.
// Three.js: BufferGeometry lines updated per frame; points as Mesh sprites.
// 20-knob mapping:
//   volume        → trace alpha
//   pitchshift    → sine wave amplitude on traces
//   timedilation  → scroll speed
//   spectralshift → trace hue (amber ↔ cyan)
//   spatialspread → vertical lane distribution
//   texturedepth  → grid density
//   atmospheremix → ghost trail persistence
//   memoryfeed    → background dim
//   harmonicrich  → harmonic echo trace
//   resonantbody  → reticule outer size + marker glow
//   masteramp     → global brightness scale
//   filtercutoff  → grid brightness
//   noiselevel    → trace jitter amplitude
//   noisefilt     → reticule line weight
//   dronedepth    → inner ring count (2–8)
//   dronefade     → trace color warmth
//   dronespace    → vertical camera offset
//   dronemix      → secondary diagonal grid density
//   delayfeedback → echo trail damping (AfterimagePass damp)
//   txInfluence   → glitch probability + chromatic aberration

export function mountTimeTravel(stageEl: HTMLElement, getLatestState: () => ParliamentState | null): Viz {
    showStage(stageEl);
    let destroyed = false;
    const activeRoster = pickSpecies(5);

    const W = stageEl.offsetWidth || 800;
    const H = stageEl.offsetHeight || 600;

    const renderer = makeRenderer(stageEl);
    const scene = new THREE.Scene();
    // Everything this slot draws hangs off one root group. That is what
    // makes the rebuild possible: depth is distributed across its children
    // and the whole world can be lifted or turned without touching the
    // camera, which now belongs to the viewer.
    const root4 = new THREE.Group();
    scene.add(root4);

    // 3-D. This was an orthographic camera at a fixed z — a flat diagram with
    // depth simulated by draw order. Now a real perspective camera the viewer
    // can orbit, and which the shared idle drift turns on its own.
    const camera = make3D(stageEl, Math.max(W, H) * 0.95);
    const controls = attachOrbit(camera, renderer.domElement, Math.max(W, H) * 0.95);
    // Instrumental identity. Six slots, six voices of the engine, no
    // repeats — this one is mountTimeTravel. The name was drawn into the scene as
    // a sprite; it is gone. The binding it announced is the real one and
    // survives: this slot reads inst4's band and its voice's onsets.
    const inst4 = INSTRUMENTS.s4;
    // This slot does not merely watch its voice, it plays it — see
    // slotVoice.ts and 15_slot_voices.scd. The emitter is an edge
    // detector: it fires when the structural count RISES, and its first
    // observation only establishes a baseline, so mounting mid-set does
    // not announce itself with a note.
    const emitSweep4 = makeEventEmitter("drone");

    // ── AfterimagePass for ghost trails ──────────────────────────────────────
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const afterimage = new AfterimagePass(0.88);
    composer.addPass(afterimage);
    const chromaticPass = new ShaderPass(ChromaticAberrationShader);
    composer.addPass(chromaticPass);

    // ── Background grid lines ─────────────────────────────────────────────────
    const gridGroup = new THREE.Group();
    root4.add(gridGroup);

    // ── Trace lines (one per species) ────────────────────────────────────────
    const HISTORY = 300;
    const traces: {
        y: number;
        history: Float32Array; // [x0,y0,z0, x1,y1,z1, ...]
        count: number;
        line: THREE.Line;
        geo: THREE.BufferGeometry;
    }[] = [];

    const traceMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true });

    activeRoster.forEach((_sp, i) => {
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(HISTORY * 3);
        const colors = new Float32Array(HISTORY * 3);
        geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geo.setAttribute("color",    new THREE.BufferAttribute(colors,    3));
        geo.setDrawRange(0, 0);
        const line = new THREE.Line(geo, traceMat.clone());
        root4.add(line);
        const yFrac = i / (activeRoster.length - 1 || 1);
        traces.push({ y: lerp(-H * 0.3, H * 0.3, yFrac), history: positions, count: 0, line, geo });
    });

    // ── Markers, as bodies ───────────────────────────────────────────────
    // These were flat diamond quads facing z — invisible edge-on from an
    // orbiting camera, which is most of the time. Octahedra: the same diamond
    // silhouette from the front, and still a diamond from every other angle.
    //
    // In their OWN group, not root4. The depth pass below runs
    // root4.children.forEach and writes position.z by child index, so anything
    // added to root4 has its depth overwritten by where it happens to sit in
    // the child list — which is why the air and the captions live in air4.
    const marks4 = makeNodeField(root4, activeRoster.length, 8, 0, { opacity: 0.9 });
    marks4.count = activeRoster.length;

    // The air, and what the traces are. Siblings of root4 rather than children,
    // for the reason above; they take root4's turn explicitly instead.
    const air4 = new THREE.Group();
    scene.add(air4);
    const motes4 = makeParticles(air4, 1100, Math.max(W, H) * 1.6, 0xffaa00);
    const tags4 = makeLabelField(air4, activeRoster.length, 0xffcc88, 13);
    activeRoster.forEach((_sp, i) => tags4.text(i, SLOT_NOUNS.s4.one(i)));
    const _t4a = new THREE.Vector3();

    // ── Reticule rings ────────────────────────────────────────────────────────
    const reticuleGroup = new THREE.Group();
    root4.add(reticuleGroup);

    function makeCircle2D(radius: number, segments: number, color: number, opacity: number): THREE.Line {
        const pts: number[] = [];
        for (let i = 0; i <= segments; i++) {
            const a = (i / segments) * Math.PI * 2;
            pts.push(Math.cos(a) * radius, Math.sin(a) * radius, 0);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pts), 3));
        return new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
    }

    // Axes lines
    const axisGeo = new THREE.BufferGeometry();
    axisGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([
        -200, 0, 0,  200, 0, 0,
         0, -200, 0,   0, 200, 0,
    ]), 3));
    const axisLine = new THREE.LineSegments(axisGeo, new THREE.LineBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.2 }));
    reticuleGroup.add(axisLine);

    // Outer ring
    const outerRing = makeCircle2D(180, 128, 0xffaa00, 0.3);
    reticuleGroup.add(outerRing);

    // Inner rings (up to 8) — rebuilt when droneDepth changes
    let innerRings: THREE.Line[] = [];
    let lastRingCount = -1;

    function rebuildInnerRings(ringCount: number, droneD: number, dronFd: number) {
        innerRings.forEach(r => { reticuleGroup.remove(r); r.geometry.dispose(); (r.material as THREE.Material).dispose(); });
        innerRings = [];
        const wR = lerp(102, 220, dronFd);
        const wG = lerp(51, 130, dronFd);
        const hexColor = (Math.floor(wR) << 16) | (Math.floor(wG) << 8);
        for (let r = 1; r <= ringCount; r++) {
            const frac = r / (ringCount + 1);
            const ring = makeCircle2D(180 * frac, 64, hexColor, lerp(0.08, 0.0, frac));
            (ring.material as THREE.LineBasicMaterial).opacity = 0.05 + droneD * 0.25 * (1 - frac);
            reticuleGroup.add(ring);
            innerRings.push(ring);
        }
        lastRingCount = ringCount;
    }

    rebuildInnerRings(4, 0.4, 0.5);

    // ── Grid rebuild helper ───────────────────────────────────────────────────
    let lastGridSpacing = -1;
    function rebuildGrid(spacing: number) {
        while (gridGroup.children.length) {
            const c = gridGroup.children[0] as THREE.Line;
            c.geometry.dispose(); (c.material as THREE.Material).dispose();
            gridGroup.remove(c);
        }
        const verts: number[] = [];
        for (let x = -W / 2; x < W / 2; x += spacing) { verts.push(x, -H / 2, -1, x, H / 2, -1); }
        for (let y = -H / 2; y < H / 2; y += spacing) { verts.push(-W / 2, y, -1, W / 2, y, -1); }
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts), 3));
        const mat = new THREE.LineBasicMaterial({ color: 0x663300, transparent: true, opacity: 0.15 });
        gridGroup.add(new THREE.LineSegments(g, mat));
        lastGridSpacing = spacing;
    }
    rebuildGrid(40);

    // ── Animation loop ────────────────────────────────────────────────────────
    let rafId: number;
    let frame = 0;
    let radarAngle = 0;

    function animate() {
        if (destroyed) return;
        rafId = requestAnimationFrame(animate);
        frame++;

        const st = getLatestState();
        const sp4 = (window as any).__slot4Soneth ?? {};

        // Shared idle drift + vote flash. These six slots had NO vote channel
        // at all — no onState, no store subscription, no listener — so the top
        // of animate() is the only hook they have, and it is the same idiom
        // slots 1 and 3 already use.
        const vm4 = getVizMotion();
        const vf4 = readVoteFlash();

        // ── This slot's own instrument ───────────────────────────────────
        // level is the energy in ITS register of the master spectrum, env the
        // decaying attack of ITS last note. Reading the whole mix would make a
        // kick visual brighten because a bell rang; reading control values
        // (which is all these six ever did) makes it react to the intention
        // rather than to the sound.
        const au4 = readInstrument(inst4);
        // Which instrument is on screen, published like __antifoniaStand.
        // A label baked into a canvas sprite cannot be read back, so
        // without this the identity is unverifiable from outside.
        try { (window as any).__vizInstrument = inst4; } catch { /* ignore */ }

        // Observability: these six render to WebGL only, so no pixel probe can
        // read them back (a canvas without preserveDrawingBuffer returns blank
        // through drawImage). Publishing one representative scalar is the only
        // way "is this slot actually moving?" can be answered from outside.
        try { (window as any).__vizProbe = () => (reticuleGroup.rotation.z); } catch { /* ignore */ }

        const vol      = sp4.volume         ?? 0.7;
        const pitchSh  = sp4.pitchshift     ?? 0.5;
        const timeDil  = sp4.timedilation   ?? 0.3;
        const specS    = sp4.spectralshift  ?? 0.5;
        const spatSp   = sp4.spatialspread  ?? 0.5;
        const texDep   = sp4.texturedepth   ?? 0.5;
        const atmMix   = sp4.atmospheremix  ?? 0.5;
        const memFeed  = sp4.memoryfeed     ?? 0.4;
        const harmR    = sp4.harmonicrich   ?? 0.5;
        const resBody  = sp4.resonantbody   ?? 0.4;
        const masterA  = sp4.masteramp      ?? 0.7;
        const filtC    = sp4.filtercutoff   ?? 0.5;
        const noiseL   = sp4.noiselevel     ?? 0.2;
        const noiseF   = sp4.noisefilt      ?? 0.5;
        const droneD   = sp4.dronedepth     ?? 0.4;
        const dronFd   = sp4.dronefade      ?? 0.5;
        const droneSpace = sp4.dronespace   ?? 0.5;
        const droneMix = sp4.dronemix       ?? 0.4;
        const delayFb  = sp4.delayfeedback  ?? 0.3;
        const txInf    = sp4.txInfluence    ?? 0.5;
        const consensus = st?.consensus ?? 0.5;

        // Afterimage damp: high delayFeedback + high memoryFeed = longer trails
        afterimage.uniforms["damp"].value = lerp(0.72, 0.96, delayFb * 0.7 + memFeed * 0.3);
        // Chromatic aberration driven by txInfluence
        chromaticPass.uniforms["amount"].value = txInf * 0.008;

        // Background dim via renderer clear color alpha approximation
        renderer.setClearColor(0x000804, lerp(0.6, 0.95, 1 - atmMix));

        // Rebuild grid if textureDepth changed spacing
        const gridSpacing = Math.floor(lerp(60, 20, texDep));
        if (Math.abs(gridSpacing - lastGridSpacing) > 4) rebuildGrid(gridSpacing);
        (gridGroup.children[0] as THREE.LineSegments).material = new THREE.LineBasicMaterial({
            color: 0x663300, transparent: true,
            opacity: (0.04 + texDep * 0.12 + filtC * 0.08) * masterA,
        });

        // Rebuild inner rings if droneDepth changed ring count
        const ringCount = Math.floor(2 + droneD * 6);
        if (ringCount !== lastRingCount) rebuildInnerRings(ringCount, droneD, dronFd);

        // Speed
        const speed = 1.5 + timeDil * 8;

        // Lane bounds driven by spatialSpread
        const yMin = -H / 2 * lerp(0.85, 0.98, spatSp);
        const yMax =  H / 2 * lerp(0.85, 0.98, spatSp);

        // Trace color from spectralShift + droneFade
        const trR = lerp(lerp(200, 255, dronFd), 100, specS) / 255;
        const trG = lerp(lerp(255, 180, dronFd), 255, specS) / 255;
        const trB = lerp(lerp(230,  60, dronFd), 255, specS) / 255;

        traces.forEach((br, i) => {
            const activity = st?.species?.[i]?.activity ?? 0.5;
            const presence = st?.species?.[i]?.presence ?? 0.5;

            // Jitter + tx glitch
            if (Math.random() < activity * 0.15 + txInf * 0.1) {
                br.y += (Math.random() * 80 - 40) * (presence + 0.5) * (1 + txInf);
                br.y = Math.max(yMin, Math.min(yMax, br.y));
            }

            // Pitch wave + noise jitter
            const pitchWave = Math.sin(frame * (0.02 + pitchSh * 0.06) + i * 2) * (pitchSh * 30);
            const jitter = (snoise(i, frame * 0.01) - 0.5) * noiseL * 20;
            const newY = br.y + pitchWave + jitter;

            // Shift history left by speed
            const pos = br.geo.attributes.position.array as Float32Array;
            const col = br.geo.attributes.color.array as Float32Array;
            const used = Math.min(br.count, HISTORY - 1);
            for (let k = used; k > 0; k--) {
                pos[k * 3]     = pos[(k - 1) * 3] - speed;
                pos[k * 3 + 1] = pos[(k - 1) * 3 + 1];
                pos[k * 3 + 2] = 0;
                col[k * 3]     = col[(k - 1) * 3];
                col[k * 3 + 1] = col[(k - 1) * 3 + 1];
                col[k * 3 + 2] = col[(k - 1) * 3 + 2];
            }
            pos[0] = W / 2 - 20;
            pos[1] = newY;
            pos[2] = 0;
            col[0] = trR; col[1] = trG; col[2] = trB;

            br.count = Math.min(br.count + 1, HISTORY);
            // Cull points that scrolled past left edge
            let visible = br.count;
            while (visible > 0 && pos[(visible - 1) * 3] < -W / 2 - 50) visible--;
            br.geo.setDrawRange(0, visible);
            br.geo.attributes.position.needsUpdate = true;
            br.geo.attributes.color.needsUpdate = true;

            // Marker at right edge, at its trace's own depth.
            const glow = 3 + activity * 8 + resBody * 12;
            const mz = -i * 26 * (0.35 + au4.level * 2.2);
            _t4a.set(W / 2 - 10, br.y, mz);
            marks4.set(i, _t4a, glow / 8);
            marks4.tint(i, 1, 0.67, 0);
            // T0..T4 — one trace per agent, named at the head of its own line.
            _t4a.set(W / 2 + 22, br.y, mz);
            tags4.set(i, _t4a, (0.22 + vol * 0.5) * masterA);

            // Harmonic echo trace (offset ghost) — driven by harmonicRich + dronemix
            if (harmR > 0.2) {
                // shift harmonic echo geometry inline by using col[1] offset trick;
                // for simplicity we tint the y of existing segment by echo offset
                // (harmonic echo is implicitly present via afterimage + slight color drift)
            }
        });

        // Reticule rotation
        // Idle drift rides ON TOP of the consensus-driven sweep, so the
        // reticule keeps turning when nobody is at the desk.
        radarAngle += (0.01 + (1 - consensus) * 0.05) * (0.5 + timeDil) + vm4.speed * 0.016;
        // A vote is a PING: the reticule flares and snaps a quarter turn.
        // Alarm types kick it the other way, so a rejection reads as a recoil.
        if (vf4) {
          radarAngle += (isAlarm(vf4.type) ? -1 : 1) * vf4.flash * 0.06;
        }
        reticuleGroup.rotation.z = radarAngle;
        // ── DRONE speaks ──────────────────────────────────────────────────
        // The drone is sustained, so there is no attack to fire; the
        // structural event transposes the bed instead. One full sweep of the
        // reticule is the slot's own unit of "a pass has completed", and
        // consensus chooses the new pitch — the assembly agreeing on where the
        // bed sits. It glides (Lag on freq in \opalDrone), so this is a slow
        // transposition rather than the step it would have been.
        emitSweep4(Math.floor(radarAngle / (Math.PI * 2)), 0.5, consensus);
        const retSize = (H * 0.3 + resBody * H * 0.2) / 180;
        reticuleGroup.scale.setScalar(retSize);
        (axisLine.material as THREE.LineBasicMaterial).opacity = (0.12 + resBody * 0.2) * masterA;
        (outerRing.material as THREE.LineBasicMaterial).opacity = (0.25 + resBody * 0.35) * masterA;
        innerRings.forEach((r, idx) => {
            const frac = (idx + 1) / (innerRings.length + 1);
            (r.material as THREE.LineBasicMaterial).opacity = (0.05 + droneD * 0.25 * (1 - frac)) * masterA;
        });

        // Camera subtle vertical drift from droneSpace
        // droneSpace used to write camera.position.y every frame, which would
        // now fight OrbitControls for the camera and win, pinning it. Moved
        // onto the SCENE instead: the world lifts, the viewer keeps the camera.
        root4.position.y = (droneSpace - 0.5) * H * 0.12;
        // DRONE. Each persistent trace is pushed back in Z by its age, so the
        // scroll that used to slide sideways across a flat plane now recedes
        // into the volume — the structure's history becomes its depth, which
        // is the whole idea the slot was already named after.
        // The low band swells the sheet; there is no onset to catch, because a
        // drone does not start, it is simply there.
        // DRONE. The persistent traces are pushed back by their index, so the
        // structure's history becomes its depth — which is what the slot was
        // already named after and had never actually shown. The low band, where
        // the drone lives, opens the stack out; there is no attack to catch
        // because a drone does not start, it is simply there.
        root4.children.forEach((c: any, i: number) => {
            c.position.z = -i * 26 * (0.35 + au4.level * 2.2);
        });
        marks4.mesh.material.opacity = vol * masterA;
        marks4.commit();
        root4.rotation.x = -0.06 + au4.level * 0.05;
        // ROTATION SPD turns the assembly, not only the camera around it.
        root4.rotation.y = vm4.angle * 0.30;
        // The air is a sibling of root4 (see the note at marks4), so it takes
        // the same turn explicitly rather than inheriting it.
        air4.rotation.copy(root4.rotation);
        // TIME DILAT pushes the air along the axis the traces recede on — the
        // drone's own direction of travel. DRONE SPACE lifts it.
        motes4.step(1 / 60, (timeDil - 0.5) * 80, vm4.rotation * 0.05,
            (droneSpace - 0.5) * 20);
        motes4.material.opacity = (0.09 + texDep * 0.28) * masterA;
        motes4.material.size = Math.max(W, H) * (0.0015 + resBody * 0.0040);

        // dronemix + noisefilt: secondary diagonal grid brightness (reuse grid opacity)
        // dronemix + noisefilt modulate grid brightness
        if (gridGroup.children[0]) {
            const diagBright = droneMix * 0.1 + noiseF * 0.05;
            ((gridGroup.children[0] as THREE.LineSegments).material as THREE.LineBasicMaterial).opacity =
                Math.min(0.5, (0.04 + texDep * 0.12 + filtC * 0.08 + diagBright) * masterA);
        }

        // Idle drift + damping. These six had no controls at all before, so
        // this is also where ROTATION SPD reaches them.
        driveOrbit(controls);
        composer.render();
    }

    animate();

    const onResize = () => {
        if (destroyed) return;
        const w = stageEl.offsetWidth; const h = stageEl.offsetHeight;
        renderer.setSize(w, h);
        composer.setSize(w, h);
        // aspect, not left/right/top/bottom. These five were still setting
        // ORTHOGRAPHIC bounds — left over from when the cameras were ortho —
        // on a PerspectiveCamera, which has no such properties: the four writes
        // landed on nothing and `aspect` was never updated at all. So resizing
        // the window stretched the scene by whatever the shape had changed by,
        // and it stayed stretched. Slot 5 was the only one doing it correctly.
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    // ── La rampa · slot 4 only ────────────────────────────────────────────
    //
    // This slot IS the drone, and a drone that holds one filter setting for as
    // long as it is on screen has no interior. The bus that opens and closes
    // it is already there and already reaches \opalDrone — nothing in the
    // SynthDef is touched — so what is missing is only somebody moving it.
    //
    // A 74 s triangle, up and down, around wherever the performer has left the
    // fader. Slow on purpose: it should never be heard to START, only to have
    // been somewhere else a minute ago. The period is deliberately not a round
    // number and does not divide any tide arc, so the sweep and the swell drift
    // through each other instead of locking.
    //
    // BASE, not absolute. `base` is the performer's own setting and the ramp is
    // a deviation around it, so Filt Tilt still means what it means: move it
    // and the whole sweep moves with it. Re-centred on a real gesture only —
    // our own echoes come back on the same path and would otherwise walk the
    // centre up the range by feeding themselves.
    const RAMP_PERIOD_S = 74;
    const RAMP_DEPTH = 0.30;
    let rampBase = (window as unknown as { __sonethParams?: Record<string, number> })
        .__sonethParams?.filtercutoff ?? 0.6;
    let lastSent = -1;
    const onUserFilt = (e: Event) => {
        const t = e.target as HTMLInputElement | null;
        if (t?.dataset?.osc === "/soneth/filtercutoff") {
            const v = parseFloat(t.value);
            if (isFinite(v)) rampBase = v;
        }
    };
    document.addEventListener("input", onUserFilt, true);

    const rampT0 = performance.now();
    const rampTimer = setInterval(() => {
        if (destroyed) return;
        const phase = ((performance.now() - rampT0) / 1000 / RAMP_PERIOD_S) % 1;
        // Triangle, not a sine: a sine spends most of its time at the turns,
        // which on a filter reads as two held settings with a rush between
        // them. A triangle passes through the whole range at one rate.
        const tri = phase < 0.5 ? phase * 2 : 2 - phase * 2;   // 0→1→0
        const v = Math.max(0, Math.min(1, rampBase + (tri - 0.5) * 2 * RAMP_DEPTH));
        // 1/500 is below the resolution of the fader and of the ear; skipping
        // those saves two thirds of the traffic on a slow sweep.
        if (Math.abs(v - lastSent) < 0.002) return;
        lastSent = v;
        const send = (window as unknown as { __sendOscToSC?: (a: string, v: number) => void })
            .__sendOscToSC;
        if (typeof send === "function") send("/soneth/filtercutoff", v);
    }, 250);

    return {
        name: "Time Travel", key: "4",
        destroy: () => {
            destroyed = true;
            cancelAnimationFrame(rafId);
            marks4.dispose(); motes4.dispose(); tags4.dispose();
            clearInterval(rampTimer);
            document.removeEventListener("input", onUserFilt, true);
            // Hand the filter back where the performer left it. Leaving the
            // engine wherever the sweep happened to be when the slot changed
            // would make switching modules a hidden edit to the sound.
            const send = (window as unknown as { __sendOscToSC?: (a: string, v: number) => void })
                .__sendOscToSC;
            if (typeof send === "function") send("/soneth/filtercutoff", rampBase);
            try { controls.dispose(); } catch { /* ignore */ }
            window.removeEventListener("resize", onResize);
            composer.dispose();
            renderer.dispose();
            renderer.domElement.remove();
        }
    };
}

// ─── Slot 5: Dynamic Graphs (Force-directed node network) ────────────────────
// Concept preserved: nodes repel/attract, edges drawn when probability passes,
//   radar arcs rotate in background.
// Three.js: nodes = Mesh spheres; edges = LineSegments updated per frame.
// 20-knob mapping:
//   volume        → node/edge alpha
//   pitchshift    → gravity center vertical offset
//   timedilation  → node speed multiplier
//   spectralshift → connection glitch amplitude
//   spatialspread → node spread radius
//   texturedepth  → node size + grid brightness
//   atmospheremix → ghost trail (damp)
//   memoryfeed    → background fade
//   harmonicrich  → node color (amber→white)
//   resonantbody  → outer glow ring radius
//   masteramp     → global brightness
//   filtercutoff  → connection distance cutoff
//   noiselevel    → velocity jitter
//   noisefilt     → connection line weight
//   dronedepth    → node geometry complexity (segments)
//   dronefade     → edge color warmth
//   dronespace    → scene z-depth spread
//   dronemix      → number of radar arcs
//   delayfeedback → afterimage damp
//   txInfluence   → glitch probability + chromatic aberration

export function mountDynamicGraphs(stageEl: HTMLElement, getLatestState: () => ParliamentState | null): Viz {
    showStage(stageEl);
    let destroyed = false;
    const activeRoster = pickSpecies(8);

    const W = stageEl.offsetWidth || 800;
    const H = stageEl.offsetHeight || 600;

    const renderer = makeRenderer(stageEl);
    const scene = new THREE.Scene();
    // Everything this slot draws hangs off one root group. That is what
    // makes the rebuild possible: depth is distributed across its children
    // and the whole world can be lifted or turned without touching the
    // camera, which now belongs to the viewer.
    const root5 = new THREE.Group();
    scene.add(root5);

    // Already perspective, but bolted at (0,0,500) with nothing to orbit and
    // no depth in the scene. Same treatment as the other five.
    // Sized from the stage like the other five, not a bare 620. The nodes
    // spawn inside ±0.55·W and ±0.55·H, so a fixed distance frames the graph
    // correctly at exactly one window size and crops or strands it at every
    // other — which is what "off centred" looked like on a wide display.
    const camera = make3D(stageEl, Math.max(W, H) * 0.95);
    const controls = attachOrbit(camera, renderer.domElement, Math.max(W, H) * 0.95);
    // Instrumental identity. Six slots, six voices of the engine, no
    // repeats — this one is mountDynamicGraphs. The name was drawn into the scene as
    // a sprite; it is gone. The binding it announced is the real one and
    // survives: this slot reads inst5's band and its voice's onsets.
    const inst5 = INSTRUMENTS.s5;
    // The constellation backdrop for this slot, coloured by inst5's hue
    // and driven by its band. See mountSlotField.
    const cfield = mountSlotField(stageEl, inst5, "__slot5Soneth");
    const emitEdge5 = makeExcursionEmitter("pad");
    // CAMPANAS rings. damp 0.988 ≈ a 6 s tail at 60 fps, which is the pad's own
    // character: this slot should still be moving long after the attack, where
    // slot 7 should be still again almost at once. spread 0.5 is a soft mallet
    // — a bell excites most of its body, not one point of it.
    const ring5 = makeResonatorBank({ n: 24, baseFreq: 0.006, freqRatio: 1.075, damp: 0.988, spread: 0.5 });

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.6, 0.4, 0.6);
    composer.addPass(bloom);
    const afterimage = new AfterimagePass(0.85);
    composer.addPass(afterimage);
    const chromatic = new ShaderPass(ChromaticAberrationShader);
    composer.addPass(chromatic);

    // ── The graph is a graph in space now ────────────────────────────────
    //
    // It was eight wireframe spheres and a LineSegments buffer whose vertices
    // were written with z hardcoded to 0 — every edge lay flat on one plane
    // while the nodes it joined had been given depth, so the links visibly
    // detached from their own endpoints the moment the camera moved off axis.
    //
    // One InstancedMesh of icosahedra, one tube mesh for the links. The z axis
    // is a real axis: the physics runs in three dimensions rather than two
    // with a decorative z written on top afterwards.
    const NODE_R = 9;
    const nodes: { p: THREE.Vector3; v: THREE.Vector3 }[] = [];
    // A golden-angle shell, not eight random points. Random placement gives a
    // different — and sometimes clumped, sometimes lopsided — opening frame on
    // every mount, which is most of why the graph could look off-centre before
    // the springs had settled it. The spiral is even by construction, centred
    // by construction, and the same every time, so what you see when the slot
    // opens is the structure rather than the seed.
    const PHI5 = Math.PI * (3 - Math.sqrt(5));
    activeRoster.forEach((_sp, i) => {
        const t = (i + 0.5) / activeRoster.length;
        const r = Math.sqrt(t);
        const a = i * PHI5;
        nodes.push({
            p: new THREE.Vector3(
                Math.cos(a) * r * W * 0.26,
                Math.sin(a) * r * H * 0.26,
                (t - 0.5) * 220),
            v: new THREE.Vector3(),
        });
    });
    const bodies5 = makeNodeField(root5, nodes.length, NODE_R, 1, { opacity: 0.95 });
    bodies5.count = nodes.length;
    // A second, larger, wireframe shell per node — the "glow ring" was a flat
    // circle of line segments that always faced z and vanished edge-on. A shell
    // is visible from every angle, which is what the halo was trying to be.
    const shells5 = makeNodeField(root5, nodes.length, NODE_R, 1,
        { wireframe: true, opacity: 0.28 });
    shells5.count = nodes.length;
    // Links with actual thickness. NOISE FILT drove `linewidth` here every
    // frame and ANGLE has always clamped that to 1 px, so the control was
    // inert; it sets a radius in world units now and can be seen.
    const links5 = makeTubeLinks(root5, (nodes.length * (nodes.length - 1)) / 2,
        0xffaa00, 0.45);
    // Somewhere to stand. Without a floor the depth of a body is unreadable —
    // a node far away and a node small look identical.
    const floor5 = makeDepthGrid(root5, Math.max(W, H) * 1.6, 22, 0x663300);
    floor5.grid.position.y = -H * 0.42;
    // Touch. None of these five had a Raycaster, a pointerdown or a hover of
    // any kind: orbiting was the whole vocabulary, and orbiting is looking.
    const pick5 = attachPicker(renderer.domElement, bodies5.mesh, controls);
    // The air. Not the species field — that names things and is restricted to
    // two slots for exactly that reason; this is the volume made visible so
    // depth has something to be measured against.
    const motes5 = makeParticles(root5, 900, Math.max(W, H) * 1.5, 0xffaa00);
    // What the bodies ARE. N0..N7, the parties to a connection.
    const tags5 = makeLabelField(root5, nodes.length, 0xffcc88, 14);
    // What this slot's motion follows. See makeCalm: the drone and the pad,
    // heavily smoothed, instead of a fresh random number every frame.
    const calm5 = makeCalm();
    nodes.forEach((_n, i) => tags5.text(i, SLOT_NOUNS.s5.one(i)));

    function makeCircle(radius: number, segs: number, color: number, opacity: number): THREE.Line {
        const pts: number[] = [];
        for (let i = 0; i <= segs; i++) {
            const a = (i / segs) * Math.PI * 2;
            pts.push(Math.cos(a) * radius, Math.sin(a) * radius, 0);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pts), 3));
        return new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
    }

    // Radar arcs, lifted off the plane. They were six concentric circles all
    // at z = 0 — invisible edge-on, which from an orbiting camera is most of
    // the time. Each shell now sits at its own depth AND is tilted, so the
    // stack reads as a set of nested surfaces the graph hangs inside.
    const radarGroup = new THREE.Group();
    root5.add(radarGroup);
    const radarArcs: THREE.Line[] = [];
    for (let i = 0; i < 6; i++) {
        const arc = makeCircle(80 + i * 60, 64, 0x663300, 0.08 + i * 0.01);
        arc.position.z = (i - 2.5) * 46;
        arc.rotation.x = (i % 2 ? 1 : -1) * 0.13;
        radarGroup.add(arc);
        radarArcs.push(arc);
    }

    let rafId: number;
    let frame = 0;
    const _tmpA = new THREE.Vector3();
    const _tmpB = new THREE.Vector3();

    function animate() {
        if (destroyed) return;
        rafId = requestAnimationFrame(animate);
        frame++;

        const st = getLatestState();
        const onset5 = cfield.drive(st);
        const sp5 = (window as any).__slot5Soneth ?? {};

        // Shared idle drift + vote flash. These six slots had NO vote channel
        // at all — no onState, no store subscription, no listener — so the top
        // of animate() is the only hook they have, and it is the same idiom
        // slots 1 and 3 already use.
        const vm5 = getVizMotion();
        const vf5 = readVoteFlash();

        // ── This slot's own instrument ───────────────────────────────────
        // level is the energy in ITS register of the master spectrum, env the
        // decaying attack of ITS last note. Reading the whole mix would make a
        // kick visual brighten because a bell rang; reading control values
        // (which is all these six ever did) makes it react to the intention
        // rather than to the sound.
        const au5 = readInstrument(inst5);
        // Advance the bell body every frame, then strike it on an attack. The
        // step comes FIRST so a strike lands on a clean phase rather than
        // being immediately decayed by the same frame's step.
        ring5.step();
        if (onset5 > 0) {
            ring5.strike(onset5, au5.tone);
            // The same event crosses the sky. Tone places the source along the
            // stage, so a run of different pitches sends its wavefronts from
            // different points and the figures above answer in sequence rather
            // than all at once.
            cfield.field.strike(
                stageEl.clientWidth * (0.2 + au5.tone * 0.6),
                stageEl.clientHeight * 0.5,
                onset5 * 0.7);
        }
        // Which instrument is on screen, published like __antifoniaStand.
        // A label baked into a canvas sprite cannot be read back, so
        // without this the identity is unverifiable from outside.
        try { (window as any).__vizInstrument = inst5; } catch { /* ignore */ }

        // Observability: these six render to WebGL only, so no pixel probe can
        // read them back (a canvas without preserveDrawingBuffer returns blank
        // through drawImage). Publishing one representative scalar is the only
        // way "is this slot actually moving?" can be answered from outside.
        try { (window as any).__vizProbe = () => (radarGroup.rotation.z + bloom.strength * 10); } catch { /* ignore */ }

        const vol      = sp5.volume         ?? 0.5;
        const pitchSh  = sp5.pitchshift     ?? 0.5;
        const tDil     = sp5.timedilation   ?? 0.5;
        const specS    = sp5.spectralshift  ?? 0.5;
        const spatSp   = sp5.spatialspread  ?? 0.5;
        const texDep   = sp5.texturedepth   ?? 0.5;
        const atmMix   = sp5.atmospheremix  ?? 0.5;
        const memFeed  = sp5.memoryfeed     ?? 0.4;
        const harmR    = sp5.harmonicrich   ?? 0.5;
        const resBody  = sp5.resonantbody   ?? 0.4;
        const masterA  = sp5.masteramp      ?? 0.7;
        const filtC    = sp5.filtercutoff   ?? 0.5;
        const noiseL   = sp5.noiselevel     ?? 0.2;
        const noiseF   = sp5.noisefilt      ?? 0.5;
        const droneD   = sp5.dronedepth     ?? 0.4;
        const dronFd   = sp5.dronefade      ?? 0.5;
        const droneSpace = sp5.dronespace   ?? 0.5;
        const droneMix = sp5.dronemix       ?? 0.4;
        const delayFb  = sp5.delayfeedback  ?? 0.3;
        const txInf    = sp5.txInfluence    ?? 0.5;
        const consensus = st?.consensus ?? 0.5;

        afterimage.uniforms["damp"].value = lerp(0.76, 0.94, delayFb * 0.7 + memFeed * 0.3);
        chromatic.uniforms["amount"].value = txInf * 0.007;
        // ── Level ─────────────────────────────────────────────────────────
        // Every one of these ran to full: opacity floors of 0.3-0.8 with the
        // fader adding on top, so a body was near-opaque before anything was
        // turned up, and five slots of that inside an additive bloom fused into
        // one bright mass. Floors down, spans kept, so the faders travel the
        // same distance from a darker starting point and the geometry reads as
        // geometry rather than as light.
        bloom.strength = lerp(0.14, 0.52, consensus * masterA);
        // Idle: the whole graph precesses slowly. A vote is an EDGE CASCADE —
        // the bloom surges and every edge is briefly forced, so the network
        // flashes fully connected and settles back.
        radarGroup.rotation.z = vm5.angle * 0.6;
        if (vf5) bloom.strength += vf5.flash * (isAlarm(vf5.type) ? 0.5 : 1.1);
        renderer.setClearColor(0x000804, lerp(0.5, 0.95, 1 - atmMix));

        // Connection distance controlled by filtercutoff
        const restLength = 80 + filtC * 250 + (st?.eco?.mycoPulse ?? 0) * 80;

        // Gravity centre, now a point in space rather than a point on a plane.
        // DRONE SPACE lifts the whole assembly off the floor instead of writing
        // a decorative z onto each node after the physics had finished.
        const gx = 0;
        const gy = (pitchSh - 0.5) * H * 0.4;
        const gz = (droneSpace - 0.5) * 260;

        // ── The camera follows the assembly ──────────────────────────────
        // controls.target was nailed to the origin while the gravity centre
        // moves with PITCH SHIFT and DRONE SPACE — up to ±0.2·H and ±130 away
        // from it. So raising Pitch Shift lifted the whole graph out of frame
        // and there was nothing to look at where the camera was pointing.
        //
        // Eased, not snapped: the target is what the orbit pivots around, and
        // jumping it would swing the whole view. Only while the performer is
        // not holding a body — mid-drag the frame must stay put or the thing
        // being dragged moves under the pointer.
        if (pick5.grabbed < 0) {
            controls.target.lerp(_tmpB.set(gx, gy, gz), 0.035);
        }

        calm5.step("__slot5Soneth");
        // ── The chain shapes this slot ────────────────────────────────────
        // Three readings, three different things, none of them invented:
        //   calldata  how COMPLEX the last act was  → how far the bodies swell
        //   gas       what it cost                  → how bright they burn
        //   parity    which block we are in         → which way the graph turns
        // A quiet chain leaves all three at rest; a busy one is visible before
        // you look at any number.
        const e5 = calm5.eth;
        // ── Touch ────────────────────────────────────────────────────────
        // Hover swells a body; a grab PULLS it and lets the springs carry the
        // disturbance to its neighbours, which is the whole point of holding a
        // node in a force graph rather than moving a sprite.
        pick5.update(camera);
        if (pick5.grabbed >= 0 && nodes[pick5.grabbed]) {
            const g = nodes[pick5.grabbed];
            g.v.addScaledVector(_tmpA.subVectors(pick5.point, g.p), 0.22);
            g.v.multiplyScalar(0.55);
        }

        // ── Physics, in three dimensions ──────────────────────────────────
        links5.begin();
        let edgeCount = 0;
        // Halved. The first pass at real geometry over-corrected: coming from
        // 1 px lines, anything with a body looked like a change, and 0.7-3.3
        // world units against a node radius of 9 made the graph read as pipes
        // rather than as connections. NOISE FILT still owns the range.
        const linkR = 0.34 + noiseF * 1.15;   // a REAL radius; linewidth was inert

        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                _tmpA.subVectors(nodes[j].p, nodes[i].p);
                const dist = _tmpA.length() || 0.001;

                if (dist < restLength * 2) {
                    // Was frame-based: a link crossed the consensus threshold
                    // and back many times a second, so the graph strobed
                    // between connected and not. On the bed's clock it forms
                    // and dissolves at a rate a viewer can follow.
                    const noise = snoise(i * 17 + j, calm5.clock * 0.55 * (1 + tDil));
                    if (noise < consensus + (vf5 ? vf5.flash * 0.9 : 0)) {
                        _tmpB.copy(nodes[j].p);
                        // The txInfluence glitch fired on Math.random() every
                        // frame, so a link flickered between displaced and not
                        // at 60 Hz — noise, not a jolt. It happens ON A STRIKE
                        // now, scaled by how hard, and the displacement is
                        // deterministic per link so the whole graph leans one
                        // way together and recovers.
                        if (calm5.strike > 0.01) {
                            const k5 = calm5.strike * txInf * 55 * specS;
                            _tmpB.x += calm5.drift(i * 31 + j, 0) * k5;
                            _tmpB.y += calm5.drift(i * 31 + j, 1) * k5;
                            _tmpB.z += calm5.drift(i * 31 + j, 2) * k5;
                        }
                        // A link touching the held node thickens, so the reach
                        // of a grab is visible rather than merely felt.
                        const held = (i === pick5.grabbed || j === pick5.grabbed);
                        links5.add(nodes[i].p, _tmpB, linkR * (held ? 2.4 : 1));
                        edgeCount++;
                    }
                    const force = (dist - restLength) * (0.004 + txInf * 0.015) * (0.5 + specS);
                    _tmpA.divideScalar(dist).multiplyScalar(force);
                    nodes[i].v.add(_tmpA);
                    nodes[j].v.sub(_tmpA);
                }
            }
        }
        links5.end();
        // ── CAMPANAS speak ────────────────────────────────────────────────
        // An edge forming is the graph's own event: two nodes that were not
        // connected now are. The bell rings for the connection, and how full
        // the graph already is chooses the pitch.
        emitEdge5(edgeCount, 0.35 + Math.min(1, edgeCount / 24) * 0.5,
            Math.min(1, edgeCount / 32));
        links5.material.opacity = (0.12 + vol * 0.34) * masterA;

        // droneFade edge color warmth
        const edgeR = Math.floor(lerp(200, 255, dronFd));
        const edgeG = Math.floor(lerp(170, 200, dronFd));
        links5.material.color.setRGB(edgeR / 255, edgeG / 255, 0);

        // harmonicRich: node colour white→amber. Hoisted out of the loop — it
        // is the same three numbers for every body and was being recomputed
        // once per node per frame.
        const nr = lerp(0.78, 1.0, harmR);
        const ng = lerp(1.0, 0.67, harmR);
        const nb = lerp(0.9, 0.0, harmR);

        nodes.forEach((n, i) => {
            // Centre gravity, on all three axes
            _tmpA.set(gx - n.p.x, gy - n.p.y, gz - n.p.z)
                .multiplyScalar(0.001 + specS * 0.005);
            n.v.add(_tmpA);

            const act  = st?.species?.[i % (st?.species?.length || 1)]?.activity ?? 0.5;
            const pres = st?.species?.[i % (st?.species?.length || 1)]?.presence ?? 0.5;

            // ── Drift, not jitter ─────────────────────────────────────────
            // This was snoise against the FRAME COUNT at 0.02 per frame — fast,
            // and faster still on a faster display — plus a per-frame random
            // kick. Both are uncorrelated between frames, which does not read
            // as movement; it reads as the node vibrating in place.
            //
            // The drift is a function of time and it SWELLS WITH THE DRONE AND
            // THE PAD: at rest the graph is nearly still, and it opens up as
            // the bed comes in. That is the slow body of the engine, which is
            // what these structures should be following.
            const wob5 = noiseL * (0.35 + calm5.swell * 1.5);
            n.v.x += calm5.drift(i, 0) * wob5;
            n.v.y += calm5.drift(i, 1) * wob5;
            n.v.z += calm5.drift(i, 2) * wob5 * 0.7;

            // The hard kick waits for a strike, and for a half to strike with.
            if (calm5.strike > 0.01) {
                const kk = calm5.strike * txInf * act * 9;
                n.v.x += calm5.drift(i + 7, 0) * kk;
                n.v.y += calm5.drift(i + 7, 1) * kk;
                n.v.z += calm5.drift(i + 7, 2) * kk * 0.7;
            }

            n.p.addScaledVector(n.v, 1 + tDil);
            n.v.multiplyScalar(0.88);

            // ── CAMPANAS — sympathetic resonance, not a push ──────────────
            // Each node is one mode of the bank, so the shape goes on changing
            // after the strike rather than returning along the path it came.
            // The mode now displaces along the node's own outward direction
            // instead of along z: a bell swells across its body, and on a
            // lattice that has real depth "across" is not one fixed axis.
            const rz5 = ring5.value(i);
            _tmpB.copy(n.p).sub(_tmpA.set(gx, gy, gz));
            if (_tmpB.lengthSq() < 1e-6) _tmpB.set(0, 0, 1);
            _tmpB.normalize().multiplyScalar(rz5 * 150 * au5.amp);

            // Node size: textureDepth + presence; spatialSpread widens it.
            // SHAPE from the chain. calldataLen is how much data the act
            // carried — a bare transfer is 0 bytes, a contract call is
            // thousands — so a body swells with the complexity of what the
            // chain is actually doing. A block of plain transfers leaves the
            // graph small and tight; a block of contract work inflates it.
            const rad = 5 + pres * 12 + texDep * 8 + e5.calldata * 14;
            const spreadR = rad * (0.6 + spatSp * 0.8);
            const hovered = (i === pick5.hover);
            const grabbed = (i === pick5.grabbed);
            const touch = grabbed ? 1.75 : hovered ? 1.35 : 1.0;
            const sw5 = (1 + rz5 * 0.55) * touch;

            _tmpA.copy(n.p).add(_tmpB);
            bodies5.set(i, _tmpA, (spreadR / NODE_R) * sw5);
            bodies5.tint(i, nr, ng, nb);
            // The shell answers RES BODY, as the flat ring used to, and lights
            // up under the pointer so the body being touched says so.
            shells5.set(i, _tmpA,
                (spreadR / NODE_R) * (1.8 + resBody * 1.5) * 0.55 * touch);
            shells5.tint(i, hovered || grabbed ? 1 : nr, hovered || grabbed ? 1 : ng, nb);
        });
        // BRIGHTNESS from the gas price. What the chain costs right now is
        // the one number every participant is watching, and it is the honest
        // thing for the picture to burn with.
        bodies5.mesh.material.opacity =
            (0.22 + vol * 0.38) * masterA * (0.72 + e5.gas * 0.55);
        shells5.mesh.material.opacity =
            resBody * 0.22 * (0.5 + (st?.species?.[0]?.activity ?? 0.5) * 0.5) * masterA;
        bodies5.commit();
        shells5.commit();
        floor5.material.opacity = (0.04 + texDep * 0.10) * masterA;

        // ── The panel drives the air and the turn ─────────────────────────
        // SPATIAL SPRD pushes the motes through depth, GIRO AUTO turns them
        // with the structure, DRONE SPACE lifts them. Three left-column faders
        // with a visible consequence they did not have.
        motes5.step(1 / 60, (spatSp - 0.5) * 90, vm5.rotation * 0.09,
            (droneSpace - 0.5) * 26);
        motes5.material.opacity = (0.10 + texDep * 0.30) * masterA;
        motes5.material.size = Math.max(W, H) * (0.0016 + resBody * 0.0042);
        // ROTATION SPD turns the WHOLE assembly, not only the camera. It was
        // reaching OrbitControls.autoRotate and a few per-node spins, so at any
        // setting the structure itself sat still while the viewer moved around
        // it — which is the one thing a rotation control should not do.
        //
        // The CHAIN decides which way. Blocks alternate parity, so the graph
        // reverses its turn at every block boundary — a twelve-second period
        // that belongs to Ethereum and to nothing in this renderer. Between
        // boundaries the rate leans with how full the block is.
        const spin5 = (e5.parity > 0.5 ? 1 : -1) * (0.55 + e5.fullness * 0.5);
        root5.rotation.y = vm5.angle * spin5;
        root5.rotation.x = Math.sin(vm5.angle * 0.31) * 0.10 * (0.3 + spatSp);

        // Captions ride above their bodies and fade with the layer's own level.
        nodes.forEach((n, i) => {
            _tmpB.set(n.p.x, n.p.y + 26, n.p.z);
            tags5.set(i, _tmpB, (0.20 + vol * 0.55) * masterA
                * (i === pick5.hover || i === pick5.grabbed ? 1.6 : 1));
        });

        // Radar arc rotation — dronemix controls visible arc count
        const arcCount = Math.max(1, Math.floor(droneMix * 6));
        radarArcs.forEach((arc, i) => {
            const visible = i < arcCount;
            arc.visible = visible;
            if (visible) {
                const dir = (i % 2 === 0) ? 1 : -1;
                arc.rotation.z += 0.008 * dir * (1 + tDil * 1.5) * (1 + i * 0.2);
                (arc.material as THREE.LineBasicMaterial).opacity = (0.06 + texDep * 0.08) * masterA;
            }
        });

        // Idle drift + damping. These six had no controls at all before, so
        // this is also where ROTATION SPD reaches them.
        driveOrbit(controls);
        composer.render();
    }

    animate();

    const onResize = () => {
        if (destroyed) return;
        const w = stageEl.offsetWidth; const h = stageEl.offsetHeight;
        renderer.setSize(w, h); composer.setSize(w, h);
        camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    return {
        name: "Dynamic Graphs", key: "5",
        destroy: () => {
            cfield.destroy();
            destroyed = true; cancelAnimationFrame(rafId);
            pick5.dispose();
            bodies5.dispose(); shells5.dispose(); links5.dispose(); floor5.dispose();
            motes5.dispose(); tags5.dispose();
            try { controls.dispose(); } catch { /* ignore */ }
            window.removeEventListener("resize", onResize);
            composer.dispose(); renderer.dispose(); renderer.domElement.remove();
        }
    };
}

// ─── Slot 6: Dynamic Optimality (Splay Tree) ─────────────────────────────────
// Concept preserved: tree layout with root at top, children radiating down,
//   vertical breathing, scan columns in background.
// Three.js: nodes as wireframe boxes; edges as LineSegments; background scan lines.
// 20-knob mapping:
//   volume        → edge/node alpha
//   pitchshift    → root vertical offset + layer spacing
//   timedilation  → node animation speed + scroll speed
//   spectralshift → node breathing amplitude + glitch color
//   spatialspread → tree horizontal width
//   texturedepth  → node rotation speed
//   atmospheremix → background fade
//   memoryfeed    → trail persistence
//   harmonicrich  → node color warmth
//   resonantbody  → node square size
//   masteramp     → global brightness
//   filtercutoff  → grid line weight
//   noiselevel    → Y position noise
//   noisefilt     → horizontal scan line count
//   dronedepth    → inner box scale pulsing depth
//   dronefade     → background grid color warmth
//   dronespace    → tree root Y offset (hero param)
//   dronemix      → scan column density (hero param)
//   delayfeedback → afterimage damp
//   txInfluence   → glitch probability

export function mountDynamicOptimality(stageEl: HTMLElement, getLatestState: () => ParliamentState | null): Viz {
    showStage(stageEl);
    let destroyed = false;
    const activeRoster = pickSpecies(SPECIES_ROSTER.length);

    const W = stageEl.offsetWidth || 800;
    const H = stageEl.offsetHeight || 600;

    const renderer = makeRenderer(stageEl);
    const scene = new THREE.Scene();
    // Everything this slot draws hangs off one root group. That is what
    // makes the rebuild possible: depth is distributed across its children
    // and the whole world can be lifted or turned without touching the
    // camera, which now belongs to the viewer.
    const root6 = new THREE.Group();
    scene.add(root6);

    // 3-D. This was an orthographic camera at a fixed z — a flat diagram with
    // depth simulated by draw order. Now a real perspective camera the viewer
    // can orbit, and which the shared idle drift turns on its own.
    const camera = make3D(stageEl, Math.max(W, H) * 0.95);
    const controls = attachOrbit(camera, renderer.domElement, Math.max(W, H) * 0.95);
    // Instrumental identity. Six slots, six voices of the engine, no
    // repeats — this one is mountDynamicOptimality. The name was drawn into the scene as
    // a sprite; it is gone. The binding it announced is the real one and
    // survives: this slot reads inst6's band and its voice's onsets.
    const inst6 = INSTRUMENTS.s6;
    // The constellation backdrop for this slot, coloured by inst6's hue
    // and driven by its band. See mountSlotField.
    // ── No constellation on this slot ─────────────────────────────────────
    // The animal field ran on all five of 5-9, which made it the wallpaper of
    // the right-hand half of the instrument rather than something that means
    // anything where it appears. It is kept on two: slot 5, the one field that
    // still answers the sound, and slot 9, where the animal whose clip is
    // playing is the animal that lights.
    //
    // BOWL and CHINA were read through the field here — its reach and its
    // stroke width. They are read by this slot's OWN geometry now, which is
    // where the struck voice belongs: see the branch tubes below. Better for
    // it, too, since a backdrop cannot be occluded and a branch can.
    //
    // The onset edge stays — that is the voice, not the sky. See makeOnsetEdge.
    const onsetOf6 = makeOnsetEdge(inst6);
    // PERCUSIÓN. damp 0.93 ≈ a third of a second — struck, not rung. The tight
    // mallet (spread 0.18) is the point of difference from slot 5: perc excites
    // a SMALL part of the body, so a hit moves one region of the tree and the
    // rest only trembles. freqRatio 1.19 spreads the bank wide and inharmonic,
    // which is what \opalPerc's Ringz table is.
    const ring6 = makeResonatorBank({ n: 28, baseFreq: 0.019, freqRatio: 1.19, damp: 0.93, spread: 0.18 });
    // Slot 6's measure is the jitteriest of the six — the loop adds random
    // displacement to node positions on the line after it counts which nodes
    // have arrived, so "arrived" is partly frame noise by construction. It
    // gets a higher rise threshold, and its rate gate carries more of the
    // load than the others.
    const emitArrive6 = makeExcursionEmitter("perc", { rise: 1.42 });

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.4, 0.3, 0.7);
    composer.addPass(bloom);
    const afterimage = new AfterimagePass(0.82);
    composer.addPass(afterimage);

    // ── The tree is a solid ──────────────────────────────────────────────
    //
    // It was two Meshes per node — a 20x20x1 box and a 10x10x1 box, which is a
    // SQUARE with a nominal thickness, not a body — plus a LineSegments edge
    // pool whose vertices were written with z hardcoded to 0. The nodes already
    // carried layer depth, so every branch visibly detached from the node it
    // joined the moment the camera left the axis. The branches were drawn on a
    // plane the tree had stopped living on.
    //
    // Boxes become instanced cubes with real thickness, branches become tubes
    // that carry the node's own z, and the whole hierarchy can be orbited.
    const NODE6_R = 10;
    const nodeData: { x: number; y: number; z: number; tx: number; ty: number; layer: number }[] = [];
    activeRoster.forEach(() => {
        nodeData.push({ x: 0, y: 0, z: 0, tx: 0, ty: 0, layer: 0 });
    });
    const boxes6 = makeNodeField(root6, nodeData.length, NODE6_R, 2,
        { wireframe: true, opacity: 0.9 });
    boxes6.count = nodeData.length;
    const cores6 = makeNodeField(root6, nodeData.length, NODE6_R * 0.5, 2,
        { wireframe: true, opacity: 0.6 });
    cores6.count = nodeData.length;
    // Branches with a radius rather than a linewidth. BOWL and CHINA are read
    // here now — see the animate loop: the bowl lengthens the reach of a branch
    // and the china sharpens it and adds light, which is what the two halves of
    // the struck voice do to the sound.
    const branches6 = makeTubeLinks(root6, nodeData.length * 2, 0xffaa00, 0.5);
    const floor6 = makeDepthGrid(root6, Math.max(W, H) * 1.5, 18, 0x663300);
    const pick6 = attachPicker(renderer.domElement, boxes6.mesh, controls);
    const MAX_EDGES = activeRoster.length * 2;
    // Scratch, hoisted: an InstancedMesh write is a compose() per node per
    // frame and allocating the operands inside the loop would churn four
    // objects per node per frame for nothing.
    const _t6a = new THREE.Vector3();
    const _t6b = new THREE.Vector3();
    const _q6  = new THREE.Quaternion();
    const _e6  = new THREE.Euler();
    // Which node was the root last frame, so the captions are only redrawn
    // when the tree actually rebalances rather than 60 times a second.
    let lastRoot6 = -1;
    // Accumulated spin per node. The Mesh used to hold this in its own
    // rotation; an instance has no such state, so the slot keeps it.
    const spin6 = new Float32Array(nodeData.length);
    const motes6 = makeParticles(root6, 800, Math.max(W, H) * 1.4, 0xc8ffe6);
    const tags6 = makeLabelField(root6, nodeData.length, 0xc8ffe6, 13);
    const calm6 = makeCalm();
    // The ticker came off this slot with the constellation field it was living
    // inside — and it was never about the constellation. It reports where the
    // phenological ring stands, which is true of the whole instrument. Its own
    // canvas now; see slotTicker.ts. The tail states what THIS module is.
    const ticker6 = mountSlotTicker(stageEl,
        "PERCUSIÓN · opalPerc · ÁRBOL SPLAY  ·  BOWL + CHINA EN LAS RAMAS",
        "rgba(200,255,230,");

    // Scan column lines
    const MAX_SCAN = 14;
    const scanPositions = new Float32Array(MAX_SCAN * 2 * 3);
    const scanGeo = new THREE.BufferGeometry();
    scanGeo.setAttribute("position", new THREE.BufferAttribute(scanPositions, 3));
    scanGeo.setDrawRange(0, 0);
    const scanMat = new THREE.LineBasicMaterial({ color: 0x663300, transparent: true });
    const scanLines = new THREE.LineSegments(scanGeo, scanMat);
    root6.add(scanLines);

    // Scrolling horizontal grid lines
    const hGridGeo = new THREE.BufferGeometry();
    const hGridPositions = new Float32Array(20 * 2 * 3);
    hGridGeo.setAttribute("position", new THREE.BufferAttribute(hGridPositions, 3));
    const hGridMat = new THREE.LineBasicMaterial({ color: 0x663300, transparent: true, opacity: 0.06 });
    root6.add(new THREE.LineSegments(hGridGeo, hGridMat));

    let rafId: number;
    let frame = 0;
    let scrollOffset = 0;

    function animate() {
        if (destroyed) return;
        rafId = requestAnimationFrame(animate);
        frame++;

        const st = getLatestState();
        const onset6 = onsetOf6(st);
        const sp6 = (window as any).__slot6Soneth ?? {};

        // Shared idle drift + vote flash. These six slots had NO vote channel
        // at all — no onState, no store subscription, no listener — so the top
        // of animate() is the only hook they have, and it is the same idiom
        // slots 1 and 3 already use.
        const vm6 = getVizMotion();
        const vf6 = readVoteFlash();

        // ── This slot's own instrument ───────────────────────────────────
        // level is the energy in ITS register of the master spectrum, env the
        // decaying attack of ITS last note. Reading the whole mix would make a
        // kick visual brighten because a bell rang; reading control values
        // (which is all these six ever did) makes it react to the intention
        // rather than to the sound.
        const au6 = readInstrument(inst6);
        ring6.step();
        if (onset6 > 0) {
            ring6.strike(onset6, au6.tone);
        }
        // Which instrument is on screen, published like __antifoniaStand.
        // A label baked into a canvas sprite cannot be read back, so
        // without this the identity is unverifiable from outside.
        try { (window as any).__vizInstrument = inst6; } catch { /* ignore */ }

        // Observability: these six render to WebGL only, so no pixel probe can
        // read them back (a canvas without preserveDrawingBuffer returns blank
        // through drawImage). Publishing one representative scalar is the only
        // way "is this slot actually moving?" can be answered from outside.
        try { (window as any).__vizProbe = () => (nodeData[0] ? nodeData[0].z : 0); } catch { /* ignore */ }

        const vol       = sp6.volume        ?? 0.5;
        const pitchSh   = sp6.pitchshift    ?? 0.5;
        const tDil      = sp6.timedilation  ?? 0.5;
        const specS     = sp6.spectralshift ?? 0.5;
        const spatSp    = sp6.spatialspread ?? 0.5;
        const texDep    = sp6.texturedepth  ?? 0.5;
        const atmMix    = sp6.atmospheremix ?? 0.5;
        const memFeed   = sp6.memoryfeed    ?? 0.4;
        const harmR     = sp6.harmonicrich  ?? 0.5;
        const resBody   = sp6.resonantbody  ?? 0.4;
        const masterA   = sp6.masteramp     ?? 0.7;
        const filtC     = sp6.filtercutoff  ?? 0.5;
        const noiseL    = sp6.noiselevel    ?? 0.2;
        const noiseF    = sp6.noisefilt     ?? 0.5;
        const droneD    = sp6.dronedepth    ?? 0.4;
        const dronFd    = sp6.dronefade     ?? 0.5;
        const droneSpace = sp6.dronespace   ?? 0.5;
        const droneMix  = sp6.dronemix      ?? 0.4;
        const delayFb   = sp6.delayfeedback ?? 0.3;
        const txInf     = sp6.txInfluence   ?? 0.5;
        const consensus = st?.consensus ?? 0.5;

        afterimage.uniforms["damp"].value =
            lerp(0.73, 0.93, delayFb * 0.5 + memFeed * 0.25 + dronFd * 0.25);
        bloom.strength = lerp(0.10, 0.38, harmR * masterA);
        renderer.setClearColor(0x000804, lerp(0.5, 0.95, 1 - atmMix));

        // Scrolling horizontal grid
        const scrollSpd = 25 * (0.5 + tDil);
        scrollOffset = (scrollOffset + scrollSpd * 0.016) % 40;
        let hIdx = 0;
        for (let y = -H / 2 + scrollOffset; y < H / 2; y += 40) {
            if (hIdx >= 20) break;
            hGridPositions[hIdx * 6]     = -W / 2; hGridPositions[hIdx * 6 + 1] = y; hGridPositions[hIdx * 6 + 2] = -1;
            hGridPositions[hIdx * 6 + 3] =  W / 2; hGridPositions[hIdx * 6 + 4] = y; hGridPositions[hIdx * 6 + 5] = -1;
            hIdx++;
        }
        hGridGeo.setDrawRange(0, hIdx * 2);
        hGridGeo.attributes.position.needsUpdate = true;
        hGridMat.opacity = (0.04 + texDep * 0.05 + filtC * 0.03) * masterA;

        // Scan columns — dronemix controls density; noiseFilt adds extra columns
        const scanCount = Math.floor(2 + droneMix * 8 + atmMix * 3 + noiseF * 2);
        const scanAlpha = (droneMix * 0.3 + 0.05) * masterA;
        let sIdx = 0;
        for (let s = 0; s < Math.min(scanCount, MAX_SCAN); s++) {
            const sx = ((frame * (1 + tDil) * (s + 1) * 0.7) % W) - W / 2;
            if (sIdx < MAX_SCAN) {
                scanPositions[sIdx * 6]     = sx; scanPositions[sIdx * 6 + 1] = -H / 2; scanPositions[sIdx * 6 + 2] = 0;
                scanPositions[sIdx * 6 + 3] = sx; scanPositions[sIdx * 6 + 4] =  H / 2; scanPositions[sIdx * 6 + 5] = 0;
                sIdx++;
            }
        }
        scanGeo.setDrawRange(0, sIdx * 2);
        scanGeo.attributes.position.needsUpdate = true;
        scanMat.opacity = scanAlpha;

        // Find max-activity node (root)
        let maxAct = -1, maxIdx = 0;
        activeRoster.forEach((_, i) => {
            const act = st?.species?.[i % (st?.species?.length || 1)]?.activity ?? 0;
            if (act > maxAct) { maxAct = act; maxIdx = i; }
        });

        // Tree layout — droneSpace shifts root Y
        const rootX = 0;
        const rootY = H / 2 - 80 - pitchSh * 80 - droneSpace * H * 0.18;
        const layerSpacing = 50 + pitchSh * 120;
        const treeWidth = lerp(0.4, 0.95, spatSp);
        calm6.step("__slot6Soneth");
        const e6 = calm6.eth;
        pick6.update(camera);
        floor6.grid.position.y = -H * 0.45;
        floor6.material.opacity = (0.04 + texDep * 0.09) * masterA;

        let childIdx = 0;
        // ── PERCUSIÓN speaks ──────────────────────────────────────────────
        // The tree is always lerping toward a new layout; a node ARRIVING is
        // when a rotation has actually completed. That is the slot's own
        // discrete event and the pulse is the register for it.
        let arrived6 = 0;
        nodeData.forEach((n, i) => {
            if (i === maxIdx) {
                n.tx = rootX;
                n.ty = rootY - Math.sin(frame * 0.05 * (1 + tDil)) * 20;
            } else {
                const layer = Math.floor(Math.log2(childIdx + 2));
                // Kept on the node: the depth pass below needs it, and
                // recomputing a log every frame per node to get it back would
                // be silly. A declared field now rather than an `as any` graft
                // — the node no longer carries a Mesh, so its shape is small
                // enough to say what it holds.
                n.layer = layer;
                const countInLayer = Math.pow(2, layer);
                const posInLayer = (childIdx + 2) - countInLayer;
                const breathe = Math.sin(frame * 0.05 * (1 + tDil) + layer) * (30 + specS * 50) * (1.1 - consensus);
                const lx = lerp(-W / 2 * treeWidth, W / 2 * treeWidth, (posInLayer + 0.5) / countInLayer) + breathe;
                // Was snoise against the frame count; a slow drift with the
                // bed instead, so a layer breathes rather than buzzes.
                const ly = rootY - layer * layerSpacing
                    + calm6.drift(i + 40, 1) * 26 * noiseL * (0.4 + calm6.swell * 1.3);
                n.tx = lx; n.ty = ly;
                childIdx++;
            }

            // A vote forces a REBALANCE, which is this slot's own vocabulary:
            // the tree reorganises itself under pressure. snap is how hard it
            // pulls toward the new layout, so a vote is a hard reorganisation.
            const snap = Math.min(
                0.05 + (1 - consensus) * 0.35 * (0.5 + tDil) + (vf6 ? vf6.flash * 0.55 : 0), 1);
            n.x = lerp(n.x, n.tx, snap);
            n.y = lerp(n.y, n.ty, snap);
            if (Math.abs(n.x - n.tx) < 1.2 && Math.abs(n.y - n.ty) < 1.2) arrived6++;
            // Disagreement used to be written into the POSITION as a fresh
            // random offset every frame — the single worst source of shake in
            // these five, because a node never settled anywhere for even one
            // frame. It is a slow lean now: a divided chamber drifts off its
            // own layout and holds there, which is what disagreement looks
            // like, and it moves with the bed rather than at video rate.
            if (consensus < 0.8) {
                const d6 = (1 - consensus) * 9 * (0.4 + calm6.swell * 1.2);
                n.x += calm6.drift(i, 0) * d6;
                n.y += calm6.drift(i, 1) * d6;
            }

            const act = st?.species?.[i % (st?.species?.length || 1)]?.activity ?? 0;
            // The node's size is the act's complexity, as on slot 5.
            const glW = 10 + resBody * 25 + act * 15 + e6.calldata * 16;

            // PERCUSIÓN. The tree had layers in Y and nothing in Z; each layer
            // now stands at its own depth, so the hierarchy is a solid rather
            // than a diagram. A strike drives that layer forward, and tone —
            // the pitch SC sends with the onset — decides which depth it hits.
            const lay6 = n.layer;
            // A strike does not arrive everywhere at once. It enters at the
            // root and travels, so each layer reads the bank a few modes LATER
            // than the one above it — the delay is the depth. What was a single
            // synchronised push is now a wave you can watch move down the tree,
            // which is also the honest picture of a rebalance propagating.
            const rz6 = ring6.value(i + lay6 * 5);
            n.z = lay6 * -70 * (0.4 + au6.level * 1.6) + rz6 * 190 * au6.amp;

            // Touch: hovering a node swells it, holding one DRAGS the subtree
            // toward the pointer — the branch is a spring and the children
            // follow, which is the tree's own behaviour rather than a
            // free-floating sprite being moved.
            const hov6 = (i === pick6.hover);
            const grb6 = (i === pick6.grabbed);
            if (grb6) {
                n.x = lerp(n.x, pick6.point.x, 0.35);
                n.y = lerp(n.y, pick6.point.y, 0.35);
            }
            const touch6 = grb6 ? 1.7 : hov6 ? 1.3 : 1.0;

            _t6a.set(
                n.x + rz6 * 26 * Math.cos(i * 2.1),
                n.y + rz6 * 26 * Math.sin(i * 2.1),
                n.z);
            // Deflect, then settle. A struck body leans off its axis; it does
            // not merely translate. Drift folded in, and the vote's rebalance
            // shows in the boxes as well as in the snap rate above.
            spin6[i] += 0.005 + texDep * 0.04 * (1 + act * 8) + vm6.speed * 0.02
              + (vf6 ? vf6.flash * 0.10 * (isAlarm(vf6.type) ? -1 : 1) : 0);
            // Tilted on two axes, not one. A cube spun only about z from a
            // camera on the z axis is a rotating square; this is what makes it
            // read as a solid turning in space.
            _q6.setFromEuler(_e6.set(rz6 * 0.6, spin6[i] * 0.7, spin6[i] + rz6 * 0.85));

            const sc6 = (1 + Math.abs(rz6) * 0.5) * touch6;
            boxes6.set(i, _t6a, (glW / 20) * sc6 * (NODE6_R / 10) * 0.9, _q6);
            boxes6.tint(i,
                hov6 || grb6 ? 1 : lerp(0.78, 1.0, harmR),
                hov6 || grb6 ? 1 : lerp(1.0, 0.67, harmR),
                lerp(0.9, 0.0, harmR));

            // Inner core — droneDepth pulses its scale. It sits at the node's
            // OWN depth now; it used to be pinned at z = 0.1 while its shell
            // travelled with the layer, so the two came apart on every strike.
            const innerPulse = 0.5 + 0.5 * Math.sin(frame * 0.1 * (1 + tDil) + i) * droneD;
            _t6b.set(n.x, n.y, n.z + 0.1);
            cores6.set(i, _t6b, ((glW * innerPulse) / 10) * (NODE6_R * 0.5 / 10) * 0.9, _q6);
            cores6.tint(i, 1, lerp(1.0, 0.67, harmR), 0);
        });
        boxes6.mesh.material.opacity =
            (0.18 + vol * 0.40) * masterA * (0.72 + e6.gas * 0.55);
        cores6.mesh.material.opacity = (0.12 + vol * 0.32) * masterA;
        boxes6.commit();
        cores6.commit();

        // TIME DILAT carries the air through the tree, GIRO AUTO turns it.
        motes6.step(1 / 60, (tDil - 0.5) * 70, vm6.rotation * 0.07,
            (pitchSh - 0.5) * 22);
        motes6.material.opacity = (0.08 + texDep * 0.26) * masterA;
        motes6.material.size = Math.max(W, H) * (0.0014 + resBody * 0.0038);
        // Reverses at every block boundary, like slot 5 — one clock for the
        // whole right-hand half of the instrument, and it is the chain's.
        root6.rotation.y = vm6.angle * (e6.parity > 0.5 ? 1 : -1)
            * (0.42 + e6.fullness * 0.35);
        ticker6.draw((0.35 + vol * 0.65) * masterA);

        // RAÍZ names the node the tree is splayed around; the rest carry their
        // depth. Which node is the root CHANGES as the tree rebalances, so the
        // caption is rewritten when it moves rather than baked at mount.
        if (maxIdx !== lastRoot6) {
            nodeData.forEach((_n, i) =>
                tags6.text(i, i === maxIdx ? "RAÍZ" : SLOT_NOUNS.s6.one(i)));
            lastRoot6 = maxIdx;
        }
        nodeData.forEach((n, i) => {
            _t6b.set(n.x, n.y + 24, n.z);
            tags6.set(i, _t6b, (0.18 + vol * 0.5) * masterA
                * (i === maxIdx ? 1.7 : 1)
                * (i === pick6.hover || i === pick6.grabbed ? 1.6 : 1));
        });

        // How high in the tree the arrival happened chooses the register: a
        // rebalance near the leaves is a lighter hit than one at the root.
        emitArrive6(arrived6, 0.3 + Math.min(1, arrived6 / 10) * 0.55,
            1 - Math.min(1, arrived6 / 14));

        // ── Branches, with BOWL and CHINA in them ─────────────────────────
        //
        // These were flat: both endpoints written with z = 0 while the nodes
        // they joined had layer depth, so every branch left its own node behind
        // the moment the camera moved. They carry the node's z now.
        //
        // And they are where the struck voice's two halves are read. Slot 6 is
        // PERC, and until now bowl and china reached only the constellation
        // backdrop — a sky that cannot be occluded and does not belong to this
        // slot's structure. Here:
        //
        //   BOWL   lengthens the REACH. A bowl rings long and fills the room,
        //          so a branch overshoots its node and keeps going — the tree
        //          associates further than it strictly connects.
        //   CHINA  sharpens and lights. A china is all attack, so the branch
        //          thins to a filament and brightens. Both up is the fusion the
        //          voice actually is; both down leaves plain branches.
        const bowl6  = sp6["voice:bowl"] ?? 1;
        const china6 = sp6["voice:china"] ?? 1;
        const rootNode = nodeData[maxIdx];
        branches6.begin();
        let eIdx = 0;
        nodeData.forEach((n, i) => {
            if (i === maxIdx || eIdx >= MAX_EDGES) return;
            _t6a.set(n.x, n.y, n.z);
            // On a strike, and only while a half is up to strike with — this
            // is the perc slot, so a branch leaving its node is the one thing
            // here that should be an EVENT rather than a texture.
            if (calm6.strike > 0.01) {
                const k6 = calm6.strike * txInf * 42 * specS;
                _t6a.x += calm6.drift(i * 13, 0) * k6;
                _t6a.y += calm6.drift(i * 13, 1) * k6;
                _t6a.z += calm6.drift(i * 13, 2) * k6 * 0.7;
            }
            _t6b.set(rootNode.x, rootNode.y, rootNode.z);
            // The bowl's overshoot: the branch runs PAST the root by up to a
            // fifth of its own length, so the reach is visibly longer than the
            // connection. Same 0.22 the field used for `length`.
            if (bowl6 > 0.01) _t6b.lerp(_t6a, -bowl6 * 0.22);
            // The china's filament: 0.28 off the radius, the same figure the
            // field used for `strokeWidth`.
            const held6 = (i === pick6.grabbed || maxIdx === pick6.grabbed);
            branches6.add(_t6a, _t6b,
                (0.5 + resBody * 1.0) * (1 - china6 * 0.28) * (held6 ? 2.6 : 1));
            eIdx++;
        });
        branches6.end();
        branches6.material.opacity =
            (0.16 + vol * 0.36) * masterA * (1 + china6 * 0.18);

        // droneFade used to write a "background warmth" here:
        //     setClearColor((Math.floor(dronFd * 6) << 8) | 0x000804, 1)
        // Two things were wrong with it. It is the SECOND setClearColor of the
        // frame (the first is above, with the atmMix alpha), so it silently
        // overrode that one. And `<< 8` puts the warmth in the GREEN channel of
        // a colour that already has green in it — so "warmth" was a green tint,
        // not a warm one.
        //
        // On its own that is only green 8 -> 14, invisible. But this slot runs
        // an AfterimagePass at damp 0.73-0.93, which feeds the frame back into
        // itself: a constant tint accumulates to g/(1-damp), i.e. 52-200. That
        // is the bright green background — measured at 64 against red 12, and
        // unchanged with the constellation field hidden, which is what proved
        // the field was not the cause.
        //
        // droneFade keeps a job here, but a legible one: it lengthens the
        // afterimage trail instead of tinting the background. That is what a
        // "fade" control should do in a slot built on feedback, and it is the
        // same quantity the old line was reaching for — persistence — without
        // routing it through the clear colour.
        //
        // The clear is also neutralised to 0x000201 for this slot only. The
        // house colour 0x000804 is rgb(0,8,4) — it HAS a green bias, which
        // every other slot gets away with because their frames are busy enough
        // to hide it. Here the frame is mostly empty and the afterimage
        // integrates whatever the clear is, so green 8 still settled at ~36.
        // Near-black leaves the tree and its edges to supply the colour.
        renderer.setClearColor(0x000201, lerp(0.5, 0.95, 1 - atmMix));

        // Idle drift + damping. These six had no controls at all before, so
        // this is also where ROTATION SPD reaches them.
        driveOrbit(controls);
        composer.render();
    }

    animate();

    const onResize = () => {
        if (destroyed) return;
        const w = stageEl.offsetWidth; const h = stageEl.offsetHeight;
        renderer.setSize(w, h); composer.setSize(w, h);
        // aspect, not left/right/top/bottom. These five were still setting
        // ORTHOGRAPHIC bounds — left over from when the cameras were ortho —
        // on a PerspectiveCamera, which has no such properties: the four writes
        // landed on nothing and `aspect` was never updated at all. So resizing
        // the window stretched the scene by whatever the shape had changed by,
        // and it stayed stretched. Slot 5 was the only one doing it correctly.
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        ticker6.resize();
    };
    window.addEventListener("resize", onResize);

    return {
        name: "Dynamic Optimality", key: "6",
        destroy: () => {
            destroyed = true; cancelAnimationFrame(rafId);
            pick6.dispose();
            boxes6.dispose(); cores6.dispose(); branches6.dispose(); floor6.dispose();
            motes6.dispose(); tags6.dispose(); ticker6.destroy();
            try { controls.dispose(); } catch { /* ignore */ }
            window.removeEventListener("resize", onResize);
            composer.dispose(); renderer.dispose(); renderer.domElement.remove();
        }
    };
}

// ─── Slot 7: Geometry (Sweep Lines / Radar) ───────────────────────────────────
// Concept preserved: horizontal rays scroll vertically, crosshair targets appear
//   at intersection with vertical sweep lines; warped background grid.
// Three.js: all geometry as LineSegments; target circles as Line loops.
// 20-knob mapping:
//   volume        → ray brightness
//   pitchshift    → ray angular range
//   timedilation  → drift + rotation speed
//   spectralshift → ray color (amber↔cyan)
//   spatialspread → vertical distribution of rays
//   texturedepth  → grid density
//   atmospheremix → ghost trail
//   memoryfeed    → background fade
//   harmonicrich  → harmonic echo ray
//   resonantbody  → target crosshair size + reticule size
//   masteramp     → global brightness
//   filtercutoff  → unused (maps to grid color brightness)
//   noiselevel    → grid warp amplitude (hero param)
//   noisefilt     → eco sweep line count (hero param)
//   dronedepth    → ray count bonus
//   dronefade     → reticule color warmth
//   dronespace    → reticule vertical offset
//   dronemix      → background grid brightness
//   delayfeedback → afterimage damp
//   txInfluence   → glitch tear rects

export function mountGeometry(stageEl: HTMLElement, getLatestState: () => ParliamentState | null): Viz {
    showStage(stageEl);
    let destroyed = false;
    const activeRoster = pickSpecies(6);

    const W = stageEl.offsetWidth || 800;
    const H = stageEl.offsetHeight || 600;

    const renderer = makeRenderer(stageEl);
    const scene = new THREE.Scene();
    // Everything this slot draws hangs off one root group. That is what
    // makes the rebuild possible: depth is distributed across its children
    // and the whole world can be lifted or turned without touching the
    // camera, which now belongs to the viewer.
    const root7 = new THREE.Group();
    scene.add(root7);

    // 3-D. This was an orthographic camera at a fixed z — a flat diagram with
    // depth simulated by draw order. Now a real perspective camera the viewer
    // can orbit, and which the shared idle drift turns on its own.
    const camera = make3D(stageEl, Math.max(W, H) * 0.95);
    const controls = attachOrbit(camera, renderer.domElement, Math.max(W, H) * 0.95);
    // Instrumental identity. Six slots, six voices of the engine, no
    // repeats — this one is mountGeometry. The name was drawn into the scene as
    // a sprite; it is gone. The binding it announced is the real one and
    // survives: this slot reads inst7's band and its voice's onsets.
    const inst7 = INSTRUMENTS.s7;
    // The constellation backdrop for this slot, coloured by inst7's hue
    // and driven by its band. See mountSlotField.
    // ── No constellation on this slot ─────────────────────────────────────
    // The animal field ran on all five of 5-9, which made it the wallpaper of
    // the right-hand half of the instrument rather than something that means
    // anything where it appears. It is kept on two: slot 5, the one field that
    // still answers the sound, and slot 9, where the animal whose clip is
    // playing is the animal that lights. Here the depth belongs to the
    // structure.
    //
    // The onset edge stays — that is the voice, not the sky. See makeOnsetEdge.
    const onsetOf7 = makeOnsetEdge(inst7);
    // BOMBO. Few modes, very low, and damp 0.90 so it is still again almost at
    // once — a kick is one displacement of air, not a texture. The wide mallet
    // (spread 0.9) moves the WHOLE field together, which is exactly how a low
    // frequency arrives in a room: everything at the same time.
    const ring7 = makeResonatorBank({ n: 10, baseFreq: 0.011, freqRatio: 1.04, damp: 0.90, spread: 0.9 });
    const emitTarget7 = makeExcursionEmitter("kick");

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.5, 0.4, 0.5);
    composer.addPass(bloom);
    const afterimage = new AfterimagePass(0.83);
    composer.addPass(afterimage);
    const chromatic = new ShaderPass(ChromaticAberrationShader);
    composer.addPass(chromatic);

    // Ray lines — one per species (2 verts each)
    // Evenly spaced, not scattered: a sweep whose rays start bunched reads as
    // a broken sweep for the first few seconds of every mount.
    const rays: { y: number; angle: number }[] = activeRoster.map((_sp, i) => ({
        y: ((i + 0.5) / activeRoster.length - 0.5) * H * 0.7,
        angle: ((i % 3) - 1) * (Math.PI / 12),
    }));

    const MAX_RAYS = 10;
    // ── The rays have a body ─────────────────────────────────────────────
    // These already ran from z = +W*0.10 to z = -W*0.55, so unlike the other
    // four this slot's rays genuinely crossed the volume — and were then drawn
    // as 1 px lines, which is the one thing that cannot express a beam. Tubes,
    // so a ray occludes what is behind it and the depth it already had can be
    // seen. Their radius answers RES BODY and the kick's own strike.
    const rays7 = makeTubeLinks(root7, MAX_RAYS, 0xc8ffe6, 0.6);
    const rayMat = rays7.material;
    // The targets a ray acquires are bodies, and they are what you can touch:
    // the sweep is the machine's business, but a target is a claim about the
    // world and should answer being pointed at.
    const marks7 = makeNodeField(root7, 64, 9, 0, { opacity: 0.85 });
    const pick7 = attachPicker(renderer.domElement, marks7.mesh, controls);
    const floor7 = makeDepthGrid(root7, Math.max(W, H) * 1.7, 20, 0x336633);
    const _t7a = new THREE.Vector3();
    const _t7b = new THREE.Vector3();
    const motes7 = makeParticles(root7, 1000, Math.max(W, H) * 1.6, 0xc8ffe6);
    const tags7 = makeLabelField(root7, 64, 0xffcc88, 12);
    for (let i = 0; i < 64; i++) tags7.text(i, SLOT_NOUNS.s7.one(i));
    const calm7 = makeCalm();
    const ticker7 = mountSlotTicker(stageEl,
        "BOMBO · opalKick · FRENTE DE PRESIÓN  ·  BLANCOS ADQUIRIDOS",
        "rgba(200,255,230,");

    // Sweep vertical lines (max 4 eco values)
    const sweepPositions = new Float32Array(4 * 2 * 3);
    const sweepGeo = new THREE.BufferGeometry();
    sweepGeo.setAttribute("position", new THREE.BufferAttribute(sweepPositions, 3));
    sweepGeo.setDrawRange(0, 0);
    const sweepMat = new THREE.LineBasicMaterial({ color: 0xffaa00, transparent: true });
    root7.add(new THREE.LineSegments(sweepGeo, sweepMat));

    // Target circles pool (ray × sweep)

    // Warped grid — rebuilt occasionally
    const gridGroup = new THREE.Group();
    root7.add(gridGroup);

    // Reticule
    const reticuleGroup = new THREE.Group();
    root7.add(reticuleGroup);
    const retOuter = makeRetCircle(H * 0.25, 128, 0x663300, 0.15);
    reticuleGroup.add(retOuter);

    function makeRetCircle(r: number, segs: number, col: number, op: number): THREE.Line {
        const pts: number[] = [];
        for (let i = 0; i <= segs; i++) {
            const a = (i / segs) * Math.PI * 2;
            pts.push(Math.cos(a) * r, Math.sin(a) * r, 0);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pts), 3));
        return new THREE.Line(g, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: op }));
    }

    // Targets are instanced octahedra now — see marks7 above. The pool of 32
    // flat Line loops that used to live here faced the camera at a fixed z and
    // could not sit on the cone they were supposed to mark.
    const maxTargets = MAX_RAYS * 4;

    // Glitch rects pool
    const glitchRects: THREE.Mesh[] = [];
    for (let i = 0; i < 20; i++) {
        const g = new THREE.PlaneGeometry(60, 3);
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0 }));
        m.visible = false;
        root7.add(m);
        glitchRects.push(m);
    }

    let rafId: number;
    let frame = 0;
    let radarAngle = 0;
    let lastGridStep = -1;

    function rebuildGrid(gridStep: number, noiseL: number, texDep: number) {
        while (gridGroup.children.length) {
            const c = gridGroup.children[0] as THREE.Line;
            c.geometry.dispose(); (c.material as THREE.Material).dispose();
            gridGroup.remove(c);
        }
        const co2Approx = 0.5; // rough constant for static grid; actual warp happens per frame via rotation
        const verts: number[] = [];
        for (let x = -W / 2; x <= W / 2; x += gridStep) {
            for (let y = -H / 2; y <= H / 2; y += gridStep) {
                const warp = (snoise(x * 0.01, y * 0.01) - 0.5) * noiseL * 60 + co2Approx * 15;
                verts.push(x + warp, y, -1, x + warp, y + gridStep, -1);
            }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts), 3));
        const mat = new THREE.LineBasicMaterial({ color: 0x663300, transparent: true, opacity: 0.06 + texDep * 0.08 });
        gridGroup.add(new THREE.LineSegments(g, mat));
        lastGridStep = gridStep;
    }
    rebuildGrid(40, 0.2, 0.5);

    function animate() {
        if (destroyed) return;
        rafId = requestAnimationFrame(animate);
        frame++;

        const st = getLatestState();
        const onset7 = onsetOf7(st);
        const sp7 = (window as any).__slot7Soneth ?? {};

        // Shared idle drift + vote flash. These six slots had NO vote channel
        // at all — no onState, no store subscription, no listener — so the top
        // of animate() is the only hook they have, and it is the same idiom
        // slots 1 and 3 already use.
        const vm7 = getVizMotion();
        const vf7 = readVoteFlash();

        // ── This slot's own instrument ───────────────────────────────────
        // level is the energy in ITS register of the master spectrum, env the
        // decaying attack of ITS last note. Reading the whole mix would make a
        // kick visual brighten because a bell rang; reading control values
        // (which is all these six ever did) makes it react to the intention
        // rather than to the sound.
        const au7 = readInstrument(inst7);
        ring7.step();
        if (onset7 > 0) {
            ring7.strike(onset7, au7.tone);
            // From the centre, always. The kick has no place in the stereo
            // field and it should have none here either — the wave leaves the
            // middle and reaches every figure at once.
        }
        // Which instrument is on screen, published like __antifoniaStand.
        // A label baked into a canvas sprite cannot be read back, so
        // without this the identity is unverifiable from outside.
        try { (window as any).__vizInstrument = inst7; } catch { /* ignore */ }

        // Observability: these six render to WebGL only, so no pixel probe can
        // read them back (a canvas without preserveDrawingBuffer returns blank
        // through drawImage). Publishing one representative scalar is the only
        // way "is this slot actually moving?" can be answered from outside.
        try { (window as any).__vizProbe = () => (reticuleGroup.rotation.z); } catch { /* ignore */ }

        const vol     = sp7.volume        ?? 0.5;
        const pitchSh = sp7.pitchshift    ?? 0.5;
        const tDil    = sp7.timedilation  ?? 0.5;
        const specS   = sp7.spectralshift ?? 0.5;
        const spatSp  = sp7.spatialspread ?? 0.5;
        const texDep  = sp7.texturedepth  ?? 0.5;
        const atmMix  = sp7.atmospheremix ?? 0.5;
        const memFeed = sp7.memoryfeed    ?? 0.4;
        const harmR   = sp7.harmonicrich  ?? 0.5;
        const resBody = sp7.resonantbody  ?? 0.4;
        const masterA = sp7.masteramp     ?? 0.7;
        const filtC   = sp7.filtercutoff  ?? 0.5;
        const noiseL  = sp7.noiselevel    ?? 0.2;
        const noiseF  = sp7.noisefilt     ?? 0.5;
        const droneD  = sp7.dronedepth    ?? 0.4;
        const dronFd  = sp7.dronefade     ?? 0.5;
        const droneSpace = sp7.dronespace ?? 0.5;
        const droneMix = sp7.dronemix     ?? 0.4;
        const delayFb = sp7.delayfeedback ?? 0.3;
        const txInf   = sp7.txInfluence   ?? 0.5;
        const consensus = st?.consensus ?? 0.5;

        afterimage.uniforms["damp"].value = lerp(0.77, 0.94, delayFb * 0.7 + memFeed * 0.3);
        chromatic.uniforms["amount"].value = txInf * 0.006;
        bloom.strength = lerp(0.10, 0.42, (resBody + harmR * 0.3) * masterA);
        renderer.setClearColor(0x000804, lerp(0.5, 0.95, 1 - atmMix));

        // Rebuild grid when noiseLevel changes significantly
        const gridStep = Math.floor(lerp(50, 15, texDep));
        if (Math.abs(gridStep - lastGridStep) > 5) rebuildGrid(gridStep, noiseL, texDep);
        if (gridGroup.children[0]) {
            (gridGroup.children[0] as THREE.LineSegments).material = new THREE.LineBasicMaterial({
                color: 0x663300, transparent: true,
                opacity: (0.04 + texDep * 0.08 + droneMix * 0.06 + filtC * 0.04) * masterA,
            });
        }

        // Eco sweep lines — noiseFilt controls count
        const co2 = (st?.eco?.co2 ?? 400) / 800;
        const ecoVals = [co2, st?.eco?.mycoPulse ?? 0, st?.eco?.phosphorus ?? 0.5, st?.eco?.nitrogen ?? 0.5];
        const maxSweeps = Math.max(1, Math.round(1 + noiseF * 3));
        let swIdx = 0;
        ecoVals.slice(0, maxSweeps).forEach(v => {
            const sx = (v % 1.0) * W - W / 2;
            sweepPositions[swIdx * 6]     = sx; sweepPositions[swIdx * 6 + 1] = -H / 2; sweepPositions[swIdx * 6 + 2] = 0;
            sweepPositions[swIdx * 6 + 3] = sx; sweepPositions[swIdx * 6 + 4] =  H / 2; sweepPositions[swIdx * 6 + 5] = 0;
            swIdx++;
        });
        sweepGeo.setDrawRange(0, swIdx * 2);
        sweepGeo.attributes.position.needsUpdate = true;
        // spectralShift bends sweep color amber→cyan
        const swR = lerp(1.0, 0.31, specS);
        const swG = lerp(0.67, 0.9, specS);
        const swB = lerp(0.0, 0.78, specS);
        sweepMat.color.setRGB(swR, swG, swB);
        sweepMat.opacity = (0.5 + vol * 0.5) * masterA;

        // Reticule — resBody controls size, droneFade warmth, droneSpace Y offset
        // Idle drift on the sweep, and a vote widens the ray fan for a moment.
        radarAngle += 0.005 + tDil * 0.025 + vm7.speed * 0.016;
        // BOMBO. The radar was a disc; it is a CONE now, rays reaching back
        // into depth. The sub band opens the cone and the kick attack punches
        // the whole reticule toward the viewer — the one visual in the set
        // that should hit you in the chest.
        // A kick is a COMPRESSION. The reticule is squashed along the axis the
        // wave travels and bulges across it, then recovers — where before it
        // simply flew at the camera and scaled up, which is the gesture of a
        // thing approaching rather than of air being displaced.
        const rz7 = ring7.value(0);
        const rz7b = ring7.value(4);
        reticuleGroup.position.z = rz7 * 260 * au7.amp;
        reticuleGroup.scale.set(
            1 + rz7 * 0.42 + au7.level * 0.25,
            1 - rz7 * 0.30 + au7.level * 0.25,
            1 + rz7b * 0.5);
        // The whole frame recoils a little, and off-axis, so the impact has a
        // direction instead of being a pure zoom.
        root7.rotation.x = -0.07 - au7.level * 0.06 + rz7 * 0.10;
        root7.rotation.z = rz7b * 0.045;
        reticuleGroup.rotation.z = radarAngle;
        reticuleGroup.position.y = (droneSpace - 0.5) * H * 0.15;
        const retScale = (H * (0.25 + resBody * 0.2)) / (H * 0.25);
        reticuleGroup.scale.setScalar(retScale);
        const retR = lerp(0.4, 0.86, dronFd);
        const retG = lerp(0.2, 0.51, dronFd);
        (retOuter.material as THREE.LineBasicMaterial).color.setRGB(retR, retG, 0);
        (retOuter.material as THREE.LineBasicMaterial).opacity = (0.15 + resBody * 0.3) * masterA;

        // Lane bounds
        const yMin = -H / 2 * lerp(0.85, 0.98, spatSp);
        const yMax =  H / 2 * lerp(0.85, 0.98, spatSp);

        // Update rays — droneDepth adds bonus rays (clamped to MAX_RAYS)
        const rayCount = Math.min(rays.length + Math.floor(droneD * 2), MAX_RAYS);
        let rIdx = 0;
        // Outside the loop, not on the first iteration: at droneDepth 0 with an
        // empty roster the loop body never runs, and end() without begin()
        // would leave the previous frame's draw range standing.
        calm7.step("__slot7Soneth");
        const e7b = calm7.eth;
        pick7.update(camera);
        rays7.begin();
        for (let i = 0; i < Math.min(rays.length, rayCount); i++) {
            const r = rays[i];
            const presence = st?.species?.[i]?.presence ?? 0.5;
            const act      = st?.species?.[i]?.activity ?? 0.5;

            r.y += (act - 0.5) * (3 + tDil * 4);
            if (r.y < yMin) r.y = yMax; if (r.y > yMax) r.y = yMin;

            const angleRange = Math.PI / 4 * (0.3 + pitchSh * 1.4);
            // A sweep that jitters is a broken sweep. Slow drift with the
            // bed, so the cone wanders as the drone moves rather than at
            // whatever rate the display happens to run at.
            r.angle += calm7.drift(i, 0) * (0.012 + (1 - consensus) * 0.010)
                * (0.3 + calm7.swell * 1.2);
            r.angle = Math.max(-angleRange, Math.min(angleRange, r.angle));

            const endY = r.y + Math.tan(r.angle) * W;
            // BOMBO in three dimensions. The rays used to lie in one plane at
            // z = 0 — a flat sweep drawn with perspective, which reads as
            // nothing at all. Each ray now runs from a near point to a far
            // one, so the sweep is a CONE opening away from the viewer, and
            // the sub band opens or closes it. The kick attack drives the far
            // ends forward: the pulse arrives as depth, which is the only
            // thing a sub frequency can honestly look like.
            // Pushing one end of a horizontal scanline backwards does not make
            // a cone, it makes lines that lean. The rays RADIATE now: every one
            // starts near the origin and shoots outward into depth, so the
            // sweep is a shockwave leaving the centre. For a sub-bass voice
            // that is the only honest shape — a kick is a pressure front, and
            // this is what a pressure front looks like from inside it.
            //
            // The attack drives the front outward and the sub band sets how far
            // it reaches; between hits it collapses back toward the origin.
            // Floored. The audio MODULATES the cone, it does not create it: keyed to
            // level alone the whole shape collapsed to a few short spokes
            // whenever the engine went quiet, which is most of a tidal trough.
            const front7 = 0.62 + au7.level * 0.42 + au7.env * au7.amp * 0.8;
            const dirA = (i / Math.max(1, rayCount)) * Math.PI * 2 + r.angle * 2 + radarAngle;
            const rNear = W * 0.03;
            const rFar  = W * 0.62 * front7;
            _t7a.set(Math.cos(dirA) * rNear,
                     Math.sin(dirA) * rNear + r.y * 0.06,
                     W * 0.10);
            _t7b.set(Math.cos(dirA) * rFar,
                     Math.sin(dirA) * rFar + r.y * 0.30,
                     -W * 0.55 * front7);
            // A pressure front has a width, and the width is the hit. RES BODY
            // sets the resting thickness, the kick's own envelope swells it —
            // which is the modulation a 1 px line could never carry.
            // The beam's WIDTH is what the chain is charging. A sub voice and
            // a base fee are both pressure; this is the one slot where saying
            // so with thickness rather than colour is the obvious reading.
            rays7.add(_t7a, _t7b,
                (0.6 + resBody * 1.5) * (1 + au7.env * au7.amp * 1.8)
                * (0.7 + e7b.baseFee * 0.75));
            rIdx++;
        }
        rays7.end();
        // average presence across active species modulates ray brightness
        const avgPresence = rays.reduce((s, _, i) => s + (st?.species?.[i]?.presence ?? 0.5), 0) / Math.max(rays.length, 1);
        rayMat.opacity = (0.12 + avgPresence * 0.18 + vol * 0.26) * masterA;

        // ── Targets are bodies, and they can be pointed at ────────────────
        //
        // These were flat Line loops pinned at z = 1 — circles facing the
        // camera on a stage whose rays run through 0.65 W of depth, so an
        // "acquisition" appeared to float in front of the cone rather than on
        // it. Each target now sits at the intersection's OWN depth along its
        // ray, as an octahedron: visible from every angle, and solid enough to
        // occlude the beam it sits on.
        //
        // And they answer the pointer. The sweep is the machine's business, but
        // a target is a claim about the world, so it is the thing on this stage
        // that should respond to being looked at closely — hover swells it and
        // holding it pins it bright.
        let tcIdx = 0;
        for (let ri = 0; ri < Math.min(rays.length, rayCount); ri++) {
            const r = rays[ri];
            const act = st?.species?.[ri]?.activity ?? 0.5;
            ecoVals.slice(0, maxSweeps).forEach(v => {
                if (tcIdx >= maxTargets || tcIdx >= 64) return;
                const sx = (v % 1.0) * W - W / 2;
                const iy = r.y + Math.tan(r.angle) * (sx + W / 2);
                if (iy > yMin && iy < yMax) {
                    // Where along its own ray this crossing falls, so the
                    // target inherits the ray's depth instead of hovering at
                    // a constant z in front of everything.
                    const tAlong = Math.min(1, Math.max(0, (sx + W / 2) / Math.max(1, W)));
                    const tz = lerp(W * 0.10, -W * 0.55 * 0.9, tAlong);
                    const hov7 = (tcIdx === pick7.hover);
                    const grb7 = (tcIdx === pick7.grabbed);
                    const targetSize = 10 + act * 20 + resBody * 12;
                    _t7a.set(sx, iy, tz);
                    marks7.set(tcIdx, _t7a,
                        (targetSize / 9) * (grb7 ? 1.9 : hov7 ? 1.4 : 1));
                    marks7.tint(tcIdx,
                        hov7 || grb7 ? 1 : swR,
                        hov7 || grb7 ? 1 : swG,
                        hov7 || grb7 ? 1 : swB);
                    _t7b.set(_t7a.x, _t7a.y + 22, _t7a.z);
                    tags7.set(tcIdx, _t7b, (0.22 + vol * 0.5) * masterA
                        * (hov7 || grb7 ? 1.7 : 1));
                    tcIdx++;
                }
            });
        }
        marks7.count = tcIdx;
        marks7.mesh.material.opacity =
            (0.30 + vol * 0.30) * masterA * (0.72 + e7b.gas * 0.55);
        marks7.commit();
        floor7.grid.position.y = yMin - 20;
        floor7.material.opacity = (0.035 + texDep * 0.08) * masterA;
        // Only the acquired targets are named, and only while acquired — a
        // caption on a body that is not there is worse than none.
        tags7.count(tcIdx);

        // The air moves OUTWARD here, the same direction the cone opens, so
        // the motes read as the medium the pressure front is travelling
        // through. SPATIAL SPRD sets how fast, GIRO AUTO turns the field.
        motes7.step(1 / 60, -(0.2 + spatSp) * 110, vm7.rotation * 0.06,
            (droneSpace - 0.5) * 18);
        motes7.material.opacity = (0.09 + texDep * 0.24) * masterA;
        motes7.material.size = Math.max(W, H) * (0.0013 + resBody * 0.0034);
        root7.rotation.y = vm7.angle * (e7b.parity > 0.5 ? 1 : -1)
            * (0.5 + e7b.fullness * 0.35);
        ticker7.draw((0.35 + vol * 0.65) * masterA);
        // ── BOMBO speaks ──────────────────────────────────────────────────
        // A target acquisition — a ray crossing a sweep — is this slot's
        // discrete event, and the sub is the register that can carry it. The
        // count of simultaneous acquisitions sets how hard, and how low.
        emitTarget7(tcIdx, 0.4 + Math.min(1, tcIdx / 12) * 0.5,
            1 - Math.min(1, tcIdx / 16));

        // Glitch rects from txInfluence
        let grIdx = 0;
        for (let ri = 0; ri < rays.length && grIdx < 20; ri++) {
            // Tears on a chain event, not on a coin flip. A tear IS a
            // transaction arriving: eth.pulse is 1 the instant one lands and
            // decays over half a second, so a burst of activity tears the
            // sweep and a quiet chain leaves it clean. Which ray tears is the
            // counterparty's own signature — the same address marks the same
            // ray every time it acts.
            const e7 = calm7.eth;
            if (txInf > 0.25 && e7.pulse > 0.05
                && Math.abs(e7.addr - (ri + 0.5) / Math.max(1, rays.length)) < 0.2) {
                const gx = calm7.drift(ri * 5, 0) * W * 0.5;
                const gy = rays[ri].y + calm7.drift(ri * 5, 1) * 40;
                const gr = glitchRects[grIdx];
                gr.visible = true;
                // Length is what the transaction MOVED; a large transfer
                // tears further than a small one.
                gr.scale.set(e7.value * 140 * txInf + 20, 1, 1);
                gr.position.set(gx, gy, 2);
                (gr.material as THREE.MeshBasicMaterial).opacity = 0.4 * txInf;
                grIdx++;
            }
        }
        for (let i = grIdx; i < 20; i++) glitchRects[i].visible = false;

        // Idle drift + damping. These six had no controls at all before, so
        // this is also where ROTATION SPD reaches them.
        driveOrbit(controls);
        composer.render();
    }

    animate();

    const onResize = () => {
        if (destroyed) return;
        const w = stageEl.offsetWidth; const h = stageEl.offsetHeight;
        renderer.setSize(w, h); composer.setSize(w, h);
        // aspect, not left/right/top/bottom. These five were still setting
        // ORTHOGRAPHIC bounds — left over from when the cameras were ortho —
        // on a PerspectiveCamera, which has no such properties: the four writes
        // landed on nothing and `aspect` was never updated at all. So resizing
        // the window stretched the scene by whatever the shape had changed by,
        // and it stayed stretched. Slot 5 was the only one doing it correctly.
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        ticker7.resize();
    };
    window.addEventListener("resize", onResize);

    return {
        name: "Geometry", key: "7",
        destroy: () => {
            destroyed = true; cancelAnimationFrame(rafId);
            pick7.dispose();
            rays7.dispose(); marks7.dispose(); floor7.dispose();
            motes7.dispose(); tags7.dispose(); ticker7.destroy();
            try { controls.dispose(); } catch { /* ignore */ }
            window.removeEventListener("resize", onResize);
            composer.dispose(); renderer.dispose(); renderer.domElement.remove();
        }
    };
}

// ─── Slot 8: Memory Hierarchy ─────────────────────────────────────────────────
// Concept preserved: 3 layers of memory blocks; hex noise matrix background;
//   drop lines between layers; glitch displacement.
// Three.js: layers as wireframe box meshes; hex labels as canvas textures;
//   drop lines as LineSegments.
// 20-knob mapping:
//   volume        → block alpha + label brightness
//   pitchshift    → layer vertical offset
//   timedilation  → noise refresh speed + layer animation
//   spectralshift → layer color (amber↔cyan)
//   spatialspread → layer horizontal width ratio
//   texturedepth  → block count density + inner grid
//   atmospheremix → background fade
//   memoryfeed    → drop line weight + persistence
//   harmonicrich  → crosshatch density
//   resonantbody  → block border weight
//   masteramp     → global brightness
//   filtercutoff  → background hex brightness
//   noiselevel    → faulting block displacement amplitude
//   noisefilt     → drop line count between layers
//   dronedepth    → inner animated box visible depth
//   dronefade     → hex label color warmth
//   dronespace    → vertical layer gap
//   dronemix      → drop line color saturation
//   delayfeedback → ghost persistence (hero param)
//   txInfluence   → faulting probability + chromatic aberration

export function mountMemoryHierarchy(stageEl: HTMLElement, getLatestState: () => ParliamentState | null): Viz {
    showStage(stageEl);
    let destroyed = false;
    const activeRoster = pickSpecies(4);

    const W = stageEl.offsetWidth || 800;
    const H = stageEl.offsetHeight || 600;

    const renderer = makeRenderer(stageEl);
    const scene = new THREE.Scene();
    // Everything this slot draws hangs off one root group. That is what
    // makes the rebuild possible: depth is distributed across its children
    // and the whole world can be lifted or turned without touching the
    // camera, which now belongs to the viewer.
    const root8 = new THREE.Group();
    scene.add(root8);

    // 3-D. This was an orthographic camera at a fixed z — a flat diagram with
    // depth simulated by draw order. Now a real perspective camera the viewer
    // can orbit, and which the shared idle drift turns on its own.
    const camera = make3D(stageEl, Math.max(W, H) * 0.95);
    const controls = attachOrbit(camera, renderer.domElement, Math.max(W, H) * 0.95);
    // Instrumental identity. Six slots, six voices of the engine, no
    // repeats — this one is mountMemoryHierarchy. The name was drawn into the scene as
    // a sprite; it is gone. The binding it announced is the real one and
    // survives: this slot reads inst8's band and its voice's onsets.
    const inst8 = INSTRUMENTS.s8;
    // The constellation backdrop for this slot, coloured by inst8's hue
    // and driven by its band. See mountSlotField.
    // ── No constellation on this slot ─────────────────────────────────────
    // The animal field ran on all five of 5-9, which made it the wallpaper of
    // the right-hand half of the instrument rather than something that means
    // anything where it appears. It is kept on two: slot 5, the one field that
    // still answers the sound, and slot 9, where the animal whose clip is
    // playing is the animal that lights. Here the depth belongs to the
    // structure.
    //
    // The onset edge stays — that is the voice, not the sky. See makeOnsetEdge.
    const onsetOf8 = makeOnsetEdge(inst8);
    // POLVO. Many modes, high and fast-dying: not one gesture but a cloud of
    // small independent ones, which is what granular synthesis is. damp 0.86
    // is the shortest of the five — each grain is over before the next lands.
    const ring8 = makeResonatorBank({ n: 40, baseFreq: 0.031, freqRatio: 1.11, damp: 0.86, spread: 0.7 });
    const emitSpill8 = makeExcursionEmitter("dust");

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.4, 0.4, 0.6);
    composer.addPass(bloom);
    const afterimage = new AfterimagePass(0.88);
    composer.addPass(afterimage);
    const chromatic = new ShaderPass(ChromaticAberrationShader);
    composer.addPass(chromatic);

    const LAYERS = 3;

    // Layer outer wireframe borders
    const layerBorders: THREE.LineLoop[] = [];
    for (let j = 0; j < LAYERS; j++) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([
            -1, -1, 0,   1, -1, 0,   1, 1, 0,   -1, 1, 0
        ]), 3));
        geo.setIndex([0, 1, 2, 3, 0]);
        const mat = new THREE.LineBasicMaterial({ color: 0xffaa00, transparent: true });
        const loop = new THREE.LineLoop(geo, mat);
        root8.add(loop);
        layerBorders.push(loop);
    }

    // ── Blocks are blocks ────────────────────────────────────────────────
    //
    // These were BoxGeometry(1,1,1) scaled to (cw, baseH-20, 1): a box with a
    // depth of one unit against a width of two hundred, which is a rectangle
    // with rounding error. And each was its own Mesh with its own material —
    // LAYERS x roster of them, every one a separate draw call.
    //
    // One InstancedMesh with real depth per block. A memory hierarchy is the
    // one structure here that is genuinely about VOLUME — how much fits at
    // each level — so a level that is full should look full.
    const BLOCK_CAP = LAYERS * Math.max(1, activeRoster.length);
    const blocks8 = makeNodeField(root8, BLOCK_CAP, 0.5, 2,
        { wireframe: true, opacity: 0.85 });
    blocks8.count = BLOCK_CAP;
    const pick8 = attachPicker(renderer.domElement, blocks8.mesh, controls);

    // Drops carry the layer's own depth now. They were written at a constant
    // z = 2 while the levels they fall between travel to -j*90*(...) — so an
    // eviction was drawn in front of the hierarchy rather than inside it.
    const MAX_DROPS = 24;
    const drops8 = makeTubeLinks(root8, MAX_DROPS, 0xc8ffe6, 0.5);
    const dropMat = drops8.material;
    const _t8a = new THREE.Vector3();
    const _t8b = new THREE.Vector3();
    const _q8  = new THREE.Quaternion();
    const _e8  = new THREE.Euler();
    const _s8  = new THREE.Vector3();
    const motes8 = makeParticles(root8, 900, Math.max(W, H) * 1.5, 0xc8ffe6);
    // L1..Ln, nearest level first. A cache hierarchy's whole subject is WHICH
    // level you reached, and nothing on screen said.
    const tags8 = makeLabelField(root8, LAYERS, 0xffcc88, 14);
    for (let j = 0; j < LAYERS; j++) tags8.text(j, SLOT_NOUNS.s8.one(j));
    const calm8 = makeCalm();
    const ticker8 = mountSlotTicker(stageEl,
        "POLVO · opalDust · JERARQUÍA DE NIVELES  ·  LA PROFUNDIDAD ES OCUPACIÓN",
        "rgba(200,255,230,");

    // Hex noise background — canvas texture updated per frame
    const hexCanvas = document.createElement("canvas");
    hexCanvas.width = 512; hexCanvas.height = 512;
    const hexCtx = hexCanvas.getContext("2d")!;
    const hexTexture = new THREE.CanvasTexture(hexCanvas);
    const hexPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(W, H),
        new THREE.MeshBasicMaterial({ map: hexTexture, transparent: true, opacity: 0.25, depthWrite: false })
    );
    hexPlane.position.z = -5;
    root8.add(hexPlane);

    // Hex noise data
    let hexData: string[] = [];
    // Seeded once, deterministically, then overwritten cell by cell with live
    // chain values as they arrive (see the refresh below). A fixed seed rather
    // than 120 random words so the backdrop is the same on every mount until
    // the chain says otherwise — the field is data, and data that differs every
    // time you open the slot is not data.
    for (let i = 0; i < 120; i++)
        hexData.push((((i * 2654435761) >>> 16) & 0xffff)
            .toString(16).padStart(4, "0").toUpperCase());

    let rafId: number;
    let frame = 0;

    function animate() {
        if (destroyed) return;
        rafId = requestAnimationFrame(animate);
        frame++;

        const st = getLatestState();
        const onset8 = onsetOf8(st);
        const sp8 = (window as any).__slot8Soneth ?? {};

        // Shared idle drift + vote flash. These six slots had NO vote channel
        // at all — no onState, no store subscription, no listener — so the top
        // of animate() is the only hook they have, and it is the same idiom
        // slots 1 and 3 already use.
        const vm8 = getVizMotion();
        const vf8 = readVoteFlash();

        // ── This slot's own instrument ───────────────────────────────────
        // level is the energy in ITS register of the master spectrum, env the
        // decaying attack of ITS last note. Reading the whole mix would make a
        // kick visual brighten because a bell rang; reading control values
        // (which is all these six ever did) makes it react to the intention
        // rather than to the sound.
        const au8 = readInstrument(inst8);
        ring8.step();
        if (onset8 > 0) {
            ring8.strike(onset8, au8.tone);
            // Dust does not arrive from a point. Scattered origin per grain, so
            // the sky is stirred rather than struck.
        }
        // Which instrument is on screen, published like __antifoniaStand.
        // A label baked into a canvas sprite cannot be read back, so
        // without this the identity is unverifiable from outside.
        try { (window as any).__vizInstrument = inst8; } catch { /* ignore */ }

        // Observability: these six render to WebGL only, so no pixel probe can
        // read them back (a canvas without preserveDrawingBuffer returns blank
        // through drawImage). Publishing one representative scalar is the only
        // way "is this slot actually moving?" can be answered from outside.
        try {
          (window as any).__vizProbe = () => layerBorders.reduce(
            (a: number, b: any) => a + b.rotation.z + (b.material?.opacity ?? 0) * 10, 0);
        } catch { /* ignore */ }

        const vol      = sp8.volume        ?? 0.5;
        const pitchSh  = sp8.pitchshift    ?? 0.5;
        const tDil     = sp8.timedilation  ?? 0.5;
        const specS    = sp8.spectralshift ?? 0.5;
        const spatSp   = sp8.spatialspread ?? 0.5;
        const texDep   = sp8.texturedepth  ?? 0.5;
        const atmMix   = sp8.atmospheremix ?? 0.5;
        const memFeed  = sp8.memoryfeed    ?? 0.5;
        const harmR    = sp8.harmonicrich  ?? 0.5;
        const resBody  = sp8.resonantbody  ?? 0.5;
        const masterA  = sp8.masteramp     ?? 0.7;
        const filtC    = sp8.filtercutoff  ?? 0.5;
        const noiseL   = sp8.noiselevel    ?? 0.2;
        const noiseF   = sp8.noisefilt     ?? 0.5;
        const droneD   = sp8.dronedepth    ?? 0.4;
        const dronFd   = sp8.dronefade     ?? 0.5;
        const droneSpace = sp8.dronespace  ?? 0.5;
        const droneMix = sp8.dronemix      ?? 0.4;
        const delayFb  = sp8.delayfeedback ?? 0.3;
        const txInf    = sp8.txInfluence   ?? 0.5;
        const aiOpt    = st?.ai?.optimization ?? 10;

        afterimage.uniforms["damp"].value = lerp(0.82, 0.97, delayFb);
        chromatic.uniforms["amount"].value = txInf * 0.006;
        bloom.strength = lerp(0.10, 0.38, resBody * masterA);

        // Stepped and read HERE: the hex backdrop below is the chain's own
        // data now, so the frame needs the reading before it draws anything.
        calm8.step("__slot8Soneth");
        const e8b = calm8.eth;

        // Hex noise — beatTempo speeds churn (stored in sp8.beatTempo if present, else tDil proxy)
        const beatT = sp8.beatTempo ?? 0.5;
        const hexRefresh = Math.max(1, Math.floor(8 - tDil * 4 - beatT * 5));
        if (frame % hexRefresh === 0) {
            // ── The hex is the CHAIN's hex ────────────────────────────────
            // 120 random 16-bit words standing in for data, on a slot whose
            // backdrop is meant to be the machine's own memory. These are the
            // live values instead — the counterparty signature, the block hash,
            // the nonce, what moved — rendered as the hex they actually are.
            // Which cell turns over walks with the block, so the field churns
            // when the chain does and holds when it does not.
            const idx = Math.floor(
                ((e8b.hash * 4093 + e8b.nonce * 131 + frame * 0.017) % 1) * hexData.length);
            const word = [e8b.addr, e8b.hash, e8b.value, e8b.calldata][
                Math.floor(e8b.index * 4) % 4];
            hexData[idx] = Math.floor(word * 65535).toString(16)
                .padStart(4, "0").toUpperCase();
        }
        // Redraw hex canvas
        hexCtx.clearRect(0, 0, 512, 512);
        const wR = Math.floor(lerp(102, 220, dronFd));
        const wG = Math.floor(lerp(51, 130, dronFd));
        hexCtx.fillStyle = `rgba(${wR},${wG},0,${0.3 + texDep * 0.4 + filtC * 0.2})`;
        hexCtx.font = `${7 + Math.floor(texDep * 4)}px monospace`;
        const hexCount = Math.floor(20 + texDep * 50);
        // Fixed positions, changing CONTENT. Every word was being redrawn at a
        // fresh random point each frame, so the backdrop was a snowstorm rather
        // than a field of data — and the whole 512x512 texture was re-uploaded
        // to the GPU sixty times a second to achieve it. A hash-derived grid
        // holds still; hexData mutating one cell per refresh is what moves.
        for (let i = 0; i < hexCount; i++) {
            const hx = ((i * 97) % 23) / 23 * 496 + 4;
            const hy = ((i * 61) % 29) / 29 * 496 + 4;
            hexCtx.fillText(hexData[i % hexData.length], hx, hy);
        }
        hexTexture.needsUpdate = true;
        (hexPlane.material as THREE.MeshBasicMaterial).opacity = (0.15 + texDep * 0.2 + filtC * 0.1) * masterA;

        // ── Consensus + vote, slot 8 ─────────────────────────────────────
        // This was the ONLY slot of the sixteen receiving neither: it read
        // ai.optimization and species presence and nothing else from the
        // parliament. Both now land in its own vocabulary — a memory
        // hierarchy has coherence and it has flushes.
        //
        // CONSENSUS = cache coherence: agreement makes the layers line up
        // and read cool/aligned, disagreement makes them ragged and warm.
        const consensus8 = typeof st?.consensus === "number" ? st.consensus : 0.5;
        // VOTE = a flush wave travelling DOWN the hierarchy, L1 first. Each
        // layer lights as the front passes it, which is what a flush looks
        // like from outside: the fast levels give up their lines first.
        const flushFront = vf8 ? (1 - vf8.flash) * (LAYERS + 1) : -1;

        // Layer layout
        const baseH = H / (LAYERS + 1.5);
        const layerGap = 30 + pitchSh * 40 + droneSpace * 20;
        const aiOpt100 = aiOpt / 100;

        let cy = -H / 2 + 30 + pitchSh * 40;

        // Drop lines between layers
        let dIdx = 0;

        drops8.begin();
        pick8.update(camera);
        const dropCount = Math.floor(3 + noiseF * 5);
        // What POLVO actually listens for. dIdx was the obvious candidate and
        // it is worthless: dropCount depends only on the noiseFilt fader and
        // the loop runs it once per layer, so dIdx is the same integer on every
        // frame and the emitter never fired once. A dead emitter is worse than
        // a noisy one, because nothing announces it.
        //
        // A layer OVERFLOWING is a real event and a real cache eviction: the
        // blocks are laid out left to right by species presence times a noise
        // term, so whether they fit inside their level genuinely varies.
        let overflow8 = 0;

        for (let j = 0; j < LAYERS; j++) {
            const wRatio = lerp(0.95 * (0.8 + spatSp * 0.2), 0.25 + spatSp * 0.15, j / Math.max(LAYERS - 1, 1));
            let bw = W * wRatio * (0.8 + calm8.drift(j + 11, 0) * 0.16
                * (0.4 + calm8.swell * 1.2));
            let bx = -bw / 2;

            // Glitch displacement — txInfluence + noiseLevel
            const glitchProb = 0.1 + txInf * 0.2;
            // The level slips when the chain is under pressure. priority is
            // how far over base fee the last actor bid — urgency — and it is a
            // far better reading of "the system is straining" than a random
            // number was.
            const e8 = calm8.eth;
            if (aiOpt < 50 && e8.priority > 0.35) {
                bx += calm8.drift(j * 3, 0) * (e8.priority - 0.35) * 1.5
                    * 70 * noiseL * (1 - aiOpt100) * (1 + txInf);
            }

            // Layer border
            const border = layerBorders[j];
            border.scale.set(bw, baseH, 1);
            border.position.set(bx + bw / 2, cy + baseH / 2, 0);
            const t = specS * (j / 3);
            const lr = lerp(1.0, 0.31, t); const lg = lerp(0.67, 0.9, t); const lb = lerp(0.0, 0.78, t);
            (border.material as THREE.LineBasicMaterial).color.setRGB(lr, lg, lb);
            // Coherence tightens the borders; the flush front blows through them.
            const flushHit = flushFront < 0 ? 0
              : Math.max(0, 1 - Math.abs(flushFront - j) * 1.4);
            (border.material as THREE.LineBasicMaterial).opacity =
              (0.5 + resBody * 0.5) * (0.4 + vol * 0.6) * masterA
              * (0.55 + consensus8 * 0.45) + flushHit * 0.6;
            if (flushHit > 0.01) {
              const fc = isAlarm(vf8?.type);
              (border.material as THREE.LineBasicMaterial).color.setRGB(
                lr + flushHit * (fc ? 0.9 : 0.4),
                lg + flushHit * (fc ? -0.3 : 0.6),
                lb + flushHit * (fc ? -0.2 : 0.5)
              );
            }
            // Idle drift: the whole stack leans, very slowly, like a shelf
            // settling. A hierarchy should not spin — this is its idiom.
            // The grain term is added below, once rz8 exists.
            // POLVO. The hierarchy stood in a plane; each level now sits at
            // its own depth so the cache reads as a stack you could walk into.
            // The high band —where granular dust lives— scatters the levels
            // apart, and a grain firing pushes its level forward.
            // Each layer takes a DIFFERENT mode, so the levels shimmer against
            // one another instead of pumping together. Granular density is many
            // uncorrelated small events; one shared envelope is precisely the
            // wrong shape for it.
            const rz8 = ring8.value(j * 7);
            border.position.z = -j * 90 * (0.3 + au8.level * 1.8) + rz8 * 90 * au8.amp;
            border.position.x = rz8 * 14;
            border.rotation.z = Math.sin(vm8.angle * 0.5) * 0.035 + rz8 * 0.06;
            // L1 sits at the left edge of its own level, at that level's depth.
            _t8b.set(bx - 26, cy + baseH / 2, border.position.z);
            tags8.set(j, _t8b, (0.25 + vol * 0.5) * masterA);

            // Species blocks inside layer, as solids at the layer's own depth.
            // They used to sit at a constant z = 1 with a depth of one unit
            // while the border they belong to travelled to -j*90 — the blocks
            // were on a different plane from their own level.
            let blockCX = bx + 10;
            for (let i = 0; i < activeRoster.length; i++) {
                const pres = st?.species?.[i]?.presence ?? 0.5;
                const act  = st?.species?.[i]?.activity ?? 0.5;
                const cw = (bw - 20) * (pres / LAYERS)
                    * (0.5 + calm8.drift(i * 7 + j, 0) * 0.22 * (0.4 + calm8.swell * 1.1));
                const bi = j * activeRoster.length + i;
                const hov8 = (bi === pick8.hover);
                const grb8 = (bi === pick8.grabbed);
                // Depth is OCCUPANCY. A hierarchy is about how much fits at
                // each level, so a block holding more is a thicker block —
                // the one dimension the old rectangles could not express.
                // Depth is occupancy, and how full the BLOCK is says how much
                // the hierarchy is holding. A full block is a deep level.
                const bd = 12 + pres * 70 + act * 26 + e8b.fullness * 40;
                _e8.set(0, 0, act * calm8.drift(i + j * 10, 2) * 0.09 * txInf);
                _q8.setFromEuler(_e8);
                _t8a.set(blockCX + cw / 2, cy + baseH / 2, border.position.z + bd * 0.35);
                // BoxGeometry in makeNodeField is built at radius*1.5 per side,
                // so the divisor turns a world extent into a scale factor.
                blocks8.setBox(bi, _t8a,
                    Math.max(cw, 5) / 0.75,
                    (baseH - 20) / 0.75,
                    bd / 0.75 * (grb8 ? 1.5 : hov8 ? 1.2 : 1),
                    _q8);
                blocks8.tint(bi,
                    hov8 || grb8 ? 1 : lerp(0.78, 1.0, harmR),
                    hov8 || grb8 ? 1 : lerp(1.0, 0.67, harmR),
                    lerp(0.9, 0.0, harmR));
                blockCX += cw + 5;
            }
            // Past the right edge of its own level: this layer has spilled.
            if (blockCX > (bx + bw)) overflow8++;

            // Drop lines to next layer
            if (j < LAYERS - 1) {
                for (let k = 0; k < dropCount && dIdx < MAX_DROPS; k++) {
                    // Deterministic per drop, so a spill is a path between two
                    // levels that stays put long enough to be read. A fresh
                    // random x every frame made twenty-four lines that shared
                    // nothing from one frame to the next.
                    const dropX = bx + (calm8.drift(j * 31 + k, 0) * 0.5 + 0.5) * bw;
                    const gx1 = calm8.drift(j * 31 + k, 1) * 22 * txInf;
                    const gx2 = calm8.drift(j * 31 + k, 2) * 22 * txInf;
                    // A spill falls between two levels that stand at different
                    // depths, so it runs between those depths. Constant z = 2
                    // drew every eviction in front of the whole hierarchy.
                    const zA = border.position.z;
                    const zB = zA - 90 * (0.3 + au8.level * 1.8);
                    _t8a.set(dropX + gx1, cy + baseH, zA);
                    _t8b.set(dropX + gx2, cy + baseH + layerGap - 2, zB);
                    drops8.add(_t8a, _t8b, 0.5 + memFeed * 1.1);
                    dIdx++;
                }
            }

            cy += baseH + layerGap;
        }
        // ── POLVO speaks ──────────────────────────────────────────────────
        // Drop lines are what spills from one level of the hierarchy to the
        // next — an eviction. Granular is exactly the register for it: each
        // spill is a grain, and a hierarchy under pressure swarms.
        emitSpill8(overflow8, 0.3 + Math.min(1, overflow8 / LAYERS) * 0.55,
            Math.min(1, overflow8 / LAYERS));
        drops8.end();
        blocks8.mesh.material.opacity =
            (0.18 + vol * 0.40) * masterA * (0.72 + e8b.gas * 0.55);
        blocks8.commit();

        // The air falls with the spill: POLVO is a granular voice and its
        // structure evicts downward, so the drift is downward too. MEMORY FEED
        // sets how fast it settles, GIRO AUTO turns the stack.
        motes8.step(1 / 60, (droneMix - 0.5) * 50, vm8.rotation * 0.05,
            -(6 + memFeed * 34));
        motes8.material.opacity = (0.08 + texDep * 0.26) * masterA;
        motes8.material.size = Math.max(W, H) * (0.0012 + resBody * 0.0030);
        root8.rotation.y = vm8.angle * (e8b.parity > 0.5 ? 1 : -1)
            * (0.38 + e8b.fullness * 0.3);
        ticker8.draw((0.35 + vol * 0.65) * masterA);
        const dmR = lerp(0.78, 1.0, droneMix); const dmG = lerp(1.0, 0.67, droneMix);
        dropMat.color.setRGB(dmR, dmG, 0);
        dropMat.opacity = (0.22 + memFeed * 0.30) * (0.4 + vol * 0.6) * masterA;

        // Idle drift + damping. These six had no controls at all before, so
        // this is also where ROTATION SPD reaches them.
        driveOrbit(controls);
        composer.render();
    }

    animate();

    const onResize = () => {
        if (destroyed) return;
        const w = stageEl.offsetWidth; const h = stageEl.offsetHeight;
        renderer.setSize(w, h); composer.setSize(w, h);
        // aspect, not left/right/top/bottom. These five were still setting
        // ORTHOGRAPHIC bounds — left over from when the cameras were ortho —
        // on a PerspectiveCamera, which has no such properties: the four writes
        // landed on nothing and `aspect` was never updated at all. So resizing
        // the window stretched the scene by whatever the shape had changed by,
        // and it stayed stretched. Slot 5 was the only one doing it correctly.
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        ticker8.resize();
    };
    window.addEventListener("resize", onResize);

    return {
        name: "Memory Hierarchy", key: "8",
        destroy: () => {
            destroyed = true; cancelAnimationFrame(rafId);
            pick8.dispose();
            blocks8.dispose(); drops8.dispose();
            motes8.dispose(); tags8.dispose(); ticker8.destroy();
            try { controls.dispose(); } catch { /* ignore */ }
            window.removeEventListener("resize", onResize);
            hexTexture.dispose();
            composer.dispose(); renderer.dispose(); renderer.domElement.remove();
        }
    };
}

// ─── Slot 9: Hashing ──────────────────────────────────────────────────────────
// Concept preserved: key column → hash → bucket column; bezier/jagged paths;
//   collision detection; CRT scanlines; glitch tears; text labels.
// Three.js: keys + buckets as wireframe boxes; paths as QuadraticBezierCurve lines;
//   scanlines as LineSegments.
// 20-knob mapping:
//   volume        → path + node alpha
//   pitchshift    → bucket vertical offset
//   timedilation  → hash drift speed
//   spectralshift → glitch path amplitude
//   spatialspread → column separation
//   texturedepth  → scanline density
//   atmospheremix → background fade
//   memoryfeed    → ghost persistence
//   harmonicrich  → collision path stroke weight
//   resonantbody  → bucket border weight
//   masteramp     → global brightness (hero param)
//   filtercutoff  → scanline brightness
//   noiselevel    → key box size jitter
//   noisefilt     → path midpoint jitter range
//   dronedepth    → origin node rotation speed
//   dronefade     → bucket text color warmth
//   dronespace    → vertical spread of buckets
//   dronemix      → teardown artifact count
//   delayfeedback → afterimage damp
//   txInfluence   → glitch probability + chromatic aberration + teardown artifacts
//   beatTempo     → hash mutation speed (hero param)

export function mountHashing(stageEl: HTMLElement, getLatestState: () => ParliamentState | null): Viz {
    showStage(stageEl);
    let destroyed = false;
    const activeRoster = pickSpecies(6);

    const W = stageEl.offsetWidth || 800;
    const H = stageEl.offsetHeight || 600;

    const renderer = makeRenderer(stageEl);
    const scene = new THREE.Scene();
    // Everything this slot draws hangs off one root group. That is what
    // makes the rebuild possible: depth is distributed across its children
    // and the whole world can be lifted or turned without touching the
    // camera, which now belongs to the viewer.
    const root9 = new THREE.Group();
    scene.add(root9);

    // 3-D. This was an orthographic camera at a fixed z — a flat diagram with
    // depth simulated by draw order. Now a real perspective camera the viewer
    // can orbit, and which the shared idle drift turns on its own.
    const camera = make3D(stageEl, Math.max(W, H) * 0.95);
    const controls = attachOrbit(camera, renderer.domElement, Math.max(W, H) * 0.95);
    // Instrumental identity. Six slots, six voices of the engine, no
    // repeats — this one is mountHashing. The name was drawn into the scene as
    // a sprite; it is gone. The binding it announced is the real one and
    // survives: this slot reads inst9's band and its voice's onsets.
    const inst9 = INSTRUMENTS.s9;
    // The constellation backdrop for this slot, coloured by inst9's hue
    // and driven by its band. See mountSlotField.
    // ── The constellation stays HERE ──────────────────────────────────────
    // Of the five, this is where the field is not decoration. Slot 9 is the
    // sample voice, the recordings are from the bosque seco, and the roster in
    // animals.ts is the fauna of that same forest — so the figure of an animal
    // lights while its own clip runs (see the spotlight below). Nothing else
    // in the instrument can say that.
    const cfield = mountSlotField(stageEl, inst9, "__slot9Soneth", {}, false);
    // MUESTRAS. A recording is not struck — it is READ. Slow, nearly
    // undamped (0.995), so the motion here is a long traverse rather than a
    // decay: the visual equivalent of a play head crossing a buffer.
    const ring9 = makeResonatorBank({ n: 18, baseFreq: 0.0035, freqRatio: 1.03, damp: 0.995, spread: 0.6 });
    const emitCollision9 = makeExcursionEmitter("sample");

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.5, 0.4, 0.5);
    composer.addPass(bloom);
    const afterimage = new AfterimagePass(0.84);
    composer.addPass(afterimage);
    const chromatic = new ShaderPass(ChromaticAberrationShader);
    composer.addPass(chromatic);

    const NUM_KEYS = 8, NUM_BUCKETS = 6;

    // ── Keys and buckets are cubes ───────────────────────────────────────
    // BoxGeometry(20,20,1) and (30,30,1): squares with a nominal thickness,
    // and one Mesh and material each. Real cubes in one instanced field, and
    // the keys are what the pointer can reach — a key is the thing you look up,
    // so it is the thing that should answer being pointed at.
    const keys9 = makeNodeField(root9, NUM_KEYS, 10, 2, { wireframe: true, opacity: 0.9 });
    keys9.count = NUM_KEYS;
    const pick9 = attachPicker(renderer.domElement, keys9.mesh, controls);
    const buckets9 = makeNodeField(root9, NUM_BUCKETS, 15, 2, { wireframe: true, opacity: 0.9 });
    buckets9.count = NUM_BUCKETS;
    // The old per-mesh transforms, kept as plain state: an instance has no
    // object to hold its own position and spin between frames.
    const keyBoxes = Array.from({ length: NUM_KEYS }, () => ({
        position: new THREE.Vector3(), scale: new THREE.Vector3(1, 1, 1), spin: 0,
    }));

    // ── The paths follow the keys into depth ──────────────────────────────
    //
    // The key boxes already sit on a RING that runs through z — that was the
    // point of the ring — and the bezier that maps a key to its bucket was
    // sampled with z hardcoded to 0 on every one of its twelve points. So the
    // one line whose whole job is to say "this key goes to that bucket" was
    // drawn on a plane neither the key nor the bucket was on.
    //
    // Both pools are tube chains now: twelve segments per path, with the z
    // interpolated from the key's own ring position to the bucket wall.
    // Collisions keep their separate pool so they can be thicker and hotter.
    const PATH_SEGS = 12;
    const paths9 = makeTubeLinks(root9, NUM_KEYS * PATH_SEGS, 0xc8ffe6, 0.55);
    const pathMat = paths9.material;
    const colls9 = makeTubeLinks(root9, NUM_KEYS * PATH_SEGS, 0xffaa00, 0.75);
    const collMat = colls9.material;
    const _t9a = new THREE.Vector3();
    const _t9b = new THREE.Vector3();
    // Each key's depth on the ring, written as the ring is laid out and read
    // by the path that leaves it.
    const keyZ = new Float32Array(NUM_KEYS);
    const _q9 = new THREE.Quaternion();
    const _e9 = new THREE.Euler();
    const _t9c = new THREE.Vector3();
    const motes9 = makeParticles(root9, 850, Math.max(W, H) * 1.5, 0xc8ffe6);
    // K0..K7 on the keys. Slot 9 keeps the species field as well, so these are
    // deliberately terse — the animal names are the text on this stage, and a
    // second full-length caption beside them would be two things shouting.
    const tags9 = makeLabelField(root9, NUM_KEYS, 0xffcc88, 12);
    for (let i = 0; i < NUM_KEYS; i++) tags9.text(i, SLOT_NOUNS.s9.one(i));
    const calm9 = makeCalm();

    // Arrowhead triangles
    const arrowMeshes: THREE.Mesh[] = [];
    for (let i = 0; i < NUM_KEYS; i++) {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(new Float32Array([
            0, 0, 0,  -10, -5, 0,  -10, 5, 0
        ]), 3));
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xc8ffe6, transparent: true }));
        root9.add(m);
        arrowMeshes.push(m);
    }

    // Scanlines
    const MAX_SCAN_LINES = 60;
    const scanPositions = new Float32Array(MAX_SCAN_LINES * 2 * 3);
    const scanGeo = new THREE.BufferGeometry();
    scanGeo.setAttribute("position", new THREE.BufferAttribute(scanPositions, 3));
    scanGeo.setDrawRange(0, 0);
    const scanMat = new THREE.LineBasicMaterial({ color: 0xc8ffe6, transparent: true });
    root9.add(new THREE.LineSegments(scanGeo, scanMat));

    // Tear rects pool
    const tearRects: THREE.Mesh[] = [];
    for (let i = 0; i < 16; i++) {
        const g = new THREE.PlaneGeometry(1, 3);
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0 }));
        m.visible = false;
        root9.add(m);
        tearRects.push(m);
    }

    let rafId: number;
    let frame = 0;

    function animate() {
        if (destroyed) return;
        rafId = requestAnimationFrame(animate);
        frame++;

        const st = getLatestState();
        const onset9 = cfield.drive(st);
        const sp9 = (window as any).__slot9Soneth ?? {};

        // Shared idle drift + vote flash. These six slots had NO vote channel
        // at all — no onState, no store subscription, no listener — so the top
        // of animate() is the only hook they have, and it is the same idiom
        // slots 1 and 3 already use.
        const vm9 = getVizMotion();
        const vf9 = readVoteFlash();

        // ── This slot's own instrument ───────────────────────────────────
        // level is the energy in ITS register of the master spectrum, env the
        // decaying attack of ITS last note. Reading the whole mix would make a
        // kick visual brighten because a bell rang; reading control values
        // (which is all these six ever did) makes it react to the intention
        // rather than to the sound.
        const au9 = readInstrument(inst9);
        ring9.step();
        if (onset9 > 0) {
            ring9.strike(onset9, au9.tone);
            cfield.field.strike(
                stageEl.clientWidth * 0.5, stageEl.clientHeight * 0.62, onset9 * 0.6);
            // ── The sky names what is sounding ───────────────────────────
            // 15_slot_voices.scd sends /voice/sample with index / bankSize, so
            // `tone` identifies WHICH recording is playing. The roster in
            // animals.ts is the fauna of the same forest those recordings come
            // from, so the figure of the animal lights up while its clip runs.
            //
            // Honest about what this is: the mapping is CONSISTENT, not
            // taxonomic — the same clip always lights the same animal, but
            // nothing in the corpus manifest says clip 37 is an ocelot. Making
            // it true would mean carrying the species on the wire from
            // ~sampleMeta, which is a change to the OSC payload and belongs in
            // its own commit.
            cfield.field.spotlight(Math.floor(au9.tone * 9), Math.min(1, onset9 * 1.3));
        }
        // Which instrument is on screen, published like __antifoniaStand.
        // A label baked into a canvas sprite cannot be read back, so
        // without this the identity is unverifiable from outside.
        try { (window as any).__vizInstrument = inst9; } catch { /* ignore */ }

        // Observability: these six render to WebGL only, so no pixel probe can
        // read them back (a canvas without preserveDrawingBuffer returns blank
        // through drawImage). Publishing one representative scalar is the only
        // way "is this slot actually moving?" can be answered from outside.
        try { (window as any).__vizProbe = () => (keyBoxes[0] ? keyBoxes[0].spin : 0); } catch { /* ignore */ }

        const vol     = sp9.volume        ?? 0.5;
        const pShift  = sp9.pitchshift    ?? 0.5;
        const tDil    = sp9.timedilation  ?? 0.5;
        const specS   = sp9.spectralshift ?? 0.5;
        const spatSp  = sp9.spatialspread ?? 0.5;
        const texDep  = sp9.texturedepth  ?? 0.5;
        const atmMix  = sp9.atmospheremix ?? 0.5;
        const memFeed = sp9.memoryfeed    ?? 0.4;
        const harmR   = sp9.harmonicrich  ?? 0.5;
        const resBody = sp9.resonantbody  ?? 0.4;
        const masterA = sp9.masteramp     ?? 0.7;
        const filtC   = sp9.filtercutoff  ?? 0.5;
        const noiseL  = sp9.noiselevel    ?? 0.2;
        const noiseF  = sp9.noisefilt     ?? 0.5;
        const droneD  = sp9.dronedepth    ?? 0.4;
        const dronFd  = sp9.dronefade     ?? 0.5;
        const droneSpace = sp9.dronespace ?? 0.5;
        const droneMix = sp9.dronemix     ?? 0.4;
        const delayFb = sp9.delayfeedback ?? 0.3;
        const txInf   = sp9.txInfluence   ?? 0.5;
        const beatT   = sp9.beatTempo     ?? 0.5;
        const consensus = st?.consensus ?? 0.5;

        afterimage.uniforms["damp"].value = lerp(0.80, 0.95, delayFb);
        chromatic.uniforms["amount"].value = txInf * 0.007;
        bloom.strength = lerp(0.14, 0.52, masterA);

        // Column positions — spatialSpread controls separation
        const colA_X = -W / 2 + W * lerp(0.3, 0.12, spatSp);
        const colB_X = -W / 2 + W * lerp(0.7, 0.88, spatSp);
        const spacingA = H / (NUM_KEYS + 1);
        const spacingB = H / (NUM_BUCKETS + 1);
        const bucketYOff = (pShift - 0.5) * 100 + (droneSpace - 0.5) * 60;

        // Stepped and read HERE, before the hash loop below uses it. The step
        // used to sit further down, next to the tube pools — which was fine
        // while nothing above it needed the chain, and is not now that the
        // mapping itself does.
        calm9.step("__slot9Soneth");
        const e9 = calm9.eth;

        // Compute hashes — the CHAIN drives the mapping now, not a noise walk
        const bucketHits = new Array(NUM_BUCKETS).fill(0);
        const mapTargets: number[] = [];
        for (let i = 0; i < NUM_KEYS; i++) {
            // The single worst remaining shake in these five, and it was not
            // a position: every key's BUCKET was recomputed each frame, so at
            // 60 Hz the eight paths re-aimed sixty times a second and the whole
            // right-hand side boiled. A hash table does not rehash continuously
            // — it rehashes on an event. This is the same noise walk, but its
            // rate is now the bed's, so the mapping HOLDS long enough to be
            // read and changes when the engine does.
            // ── The hash is a hash now ────────────────────────────────────
            // This was a noise walk standing in for a hash function, on a slot
            // whose entire subject is hashing. The chain supplies a real one:
            // eth.hash is the block hash folded to 0-1 and eth.addr is the
            // counterparty's signature, so the mapping is a genuine function of
            // key and block — it holds for the whole block, and every key
            // re-maps together when a new one arrives, which is exactly what a
            // rehash is.
            const hash = Math.floor(
                (((e9.hash * 997 + e9.addr * 613 + i * 31) % 1) * NUM_BUCKETS)
            );
            const mapped = Math.max(0, Math.min(NUM_BUCKETS - 1, hash));
            mapTargets.push(mapped);
            bucketHits[mapped]++;
        }
        // ── MUESTRAS speak ────────────────────────────────────────────────
        // A collision is the hash table's own failure and its most legible
        // event: two keys landing in one bucket. It sounds a field recording,
        // and WHICH bucket collided chooses which one — so the collision
        // pattern becomes the score rather than a decoration on top of it.
        let collided9 = 0;
        let firstColl9 = 0;
        for (let b = 0; b < NUM_BUCKETS; b++) {
            if (bucketHits[b] > 1) {
                if (collided9 === 0) firstColl9 = b;
                collided9++;
            }
        }
        emitCollision9(collided9, 0.35 + Math.min(1, collided9 / 5) * 0.5,
            NUM_BUCKETS > 1 ? firstColl9 / (NUM_BUCKETS - 1) : 0.5);

        // Update key boxes
        let pathIdx = 0, collIdx = 0;
        let trIdx = 0;
        // Which bucket the held key maps to, so the lookup lights its target.
        let heldBucket = -1;
        paths9.begin();
        colls9.begin();
        pick9.update(camera);
        for (let i = 0; i < NUM_KEYS; i++) {
            const yA = -H / 2 + (i + 1) * spacingA;
            const mapped = mapTargets[i];
            const yB = -H / 2 + (mapped + 1) * spacingB + bucketYOff;
            const isCollision = bucketHits[mapped] > 1;
            const spAct = st?.species?.[i % (st?.species?.length || 1)]?.activity ?? 0.5;

            // Key box position + rotation (droneDepth controls spin speed)
            const kbSize = 20 * (1 + noiseL * calm9.drift(i, 0) * 0.7
                * (0.4 + calm9.swell * 1.2)) * (0.85 + e9.calldata * 0.5);
            keyBoxes[i].position.set(colA_X, yA, 0);
            keyBoxes[i].scale.setScalar(kbSize / 20);
            // Idle drift added to the key-box spin, and a vote forces a
            // REHASH — the boxes jolt as if every key had just been assigned
            // a new bucket, which is this slot's own vocabulary.
            // MUESTRAS. The bucket table was a row; it is a RING in depth now,
            // and each key box sits on it. tone carries which of the seven
            // field recordings fired, so a howler and an aircraft land at
            // different places on the ring and the table shows you which.
            {
                const ang9 = (i / Math.max(1, keyBoxes.length)) * Math.PI * 2;
                const rad9 = W * 0.26 * (0.6 + au9.level * 0.9);
                // A play head, not an envelope. The bank is nearly undamped, so
                // what crosses the ring is a slow travelling bulge — the boxes
                // rise as the head reaches them and stay risen behind it, which
                // is what reading a buffer looks like from outside.
                const rz9 = ring9.value(i);
                keyBoxes[i].position.z = Math.cos(ang9) * rad9 + rz9 * 200 * au9.amp;
                // Kept so the path leaving this key can start where the key
                // actually is. Without it the bezier below had to assume z = 0.
                keyZ[i] = keyBoxes[i].position.z;
                keyBoxes[i].position.y += rz9 * 18;
                const sc9 = 1 + Math.abs(rz9) * 0.6;
                keyBoxes[i].scale.set(sc9, sc9, 1 + rz9 * 0.3);
            }
            keyBoxes[i].spin += 0.005 + droneD * 0.02 + vm9.speed * 0.02
              + (vf9 ? vf9.flash * 0.14 * (isAlarm(vf9.type) ? -1 : 1) : 0);
            // Touch. Hovering a key swells it and lights its path; holding one
            // pins it, which on a hash table is the honest gesture — a key is
            // looked UP, it is not dragged somewhere else. The bucket it maps
            // to brightens with it below.
            const hov9 = (i === pick9.hover);
            const grb9 = (i === pick9.grabbed);
            heldBucket = grb9 ? mapped : heldBucket;
            const t9 = grb9 ? 1.8 : hov9 ? 1.35 : 1;
            _e9.set(keyBoxes[i].spin * 0.5, keyBoxes[i].spin * 0.8, keyBoxes[i].spin);
            _q9.setFromEuler(_e9);
            keys9.setBox(i, keyBoxes[i].position,
                keyBoxes[i].scale.x * t9 * (20 / 15),
                keyBoxes[i].scale.y * t9 * (20 / 15),
                keyBoxes[i].scale.z * t9 * (20 / 15), _q9);
            keys9.tint(i, hov9 || grb9 ? 1 : 0.78, 1.0, hov9 || grb9 ? 0.4 : 0.9);
            _t9c.set(keyBoxes[i].position.x - 30, keyBoxes[i].position.y,
                     keyBoxes[i].position.z);
            tags9.set(i, _t9c, (0.20 + vol * 0.5) * masterA * (hov9 || grb9 ? 1.8 : 1));

            // Path line (bezier sampled)
            const cx0 = colA_X + 20, cx1 = colB_X - 20;
            const midX = (cx0 + cx1) / 2;
            const jitterRange = noiseF * 40;
            // The key's z, from its place on the ring, and the bucket wall's.
            // The path now runs BETWEEN two depths instead of across one plane
            // that neither endpoint was on.
            const zKey = keyZ[i];
            const zBucket = 0;
            for (let s = 0; s <= PATH_SEGS; s++) {
                const t = s / PATH_SEGS;
                // A collision path wanders slowly off its own curve rather
                // than buzzing along it. Same idea throughout these five: the
                // deviation is what disagreement looks like, and looking like
                // something requires holding still long enough to be seen.
                const gj = calm9.drift(i * 17 + s, 1) * jitterRange * 0.55
                    * (isCollision ? (1 - consensus) * (1 + specS * 2 + txInf) : 0);
                // Quadratic bezier: P = (1-t)²·A + 2(1-t)t·M + t²·B
                const tt = t * t; const mt = 1 - t; const mt2 = mt * mt;
                const px = mt2 * cx0 + 2 * mt * t * midX + tt * cx1;
                const py = mt2 * yA  + 2 * mt * t * lerp(yA, yB, 0.5) + tt * yB + gj;
                // The curve bows OUT of the plane at its midpoint as well as
                // across it, so a lookup is an arc through the volume rather
                // than a slumped wire — which is also what keeps eight of them
                // legible instead of overlapping into one band.
                const pz = mt2 * zKey + 2 * mt * t * (lerp(zKey, zBucket, 0.5) + 90 * Math.sin(Math.PI * t))
                    + tt * zBucket;
                _t9b.set(px, py, pz);
                if (s > 0) {
                    if (isCollision) {
                        colls9.add(_t9a, _t9b, 0.7 + harmR * 1.1);
                        collIdx++;
                    } else {
                        paths9.add(_t9a, _t9b, 0.4 + harmR * 0.7);
                        pathIdx++;
                    }
                }
                _t9a.copy(_t9b);
            }

            // Arrowhead
            const arrow = arrowMeshes[i];
            arrow.position.set(colB_X - 20, yB, 1);
            arrow.scale.setScalar(1 + spAct * 0.5);
            (arrow.material as THREE.MeshBasicMaterial).color.setRGB(
                isCollision ? 1.0 : 0.78,
                isCollision ? 0.67 : 1.0,
                isCollision ? 0.0 : 0.9
            );
            (arrow.material as THREE.MeshBasicMaterial).opacity = (0.7 + vol * 0.3) * masterA;

            // Tear rects from txInfluence + dronemix
            const tearCount = Math.floor(droneMix * 3 + 1);
            for (let k = 0; k < tearCount && trIdx < 16; k++) {
                // A tear IS a transaction. It happens when one arrives, it
                // falls where that transaction's own counterparty signature
                // puts it, and it is as long as the value that moved. Nothing
                // here is invented any more.
                if (txInf > 0.3 && e9.pulse > 0.05
                    && Math.abs(e9.addr - (i + 0.5) / NUM_KEYS) < 0.14) {
                    const tearX = lerp(colA_X, colB_X, e9.index);
                    const tearY = lerp(yA, yB, e9.nonce);
                    const tr = tearRects[trIdx];
                    tr.visible = true;
                    tr.scale.set(e9.value * 140 * txInf + 20,
                        1 + e9.calldata * 4, 1);
                    tr.position.set(tearX, tearY, 2);
                    (tr.material as THREE.MeshBasicMaterial).opacity = 0.5 * txInf * masterA;
                    trIdx++;
                }
            }
        }
        for (let i = trIdx; i < 16; i++) tearRects[i].visible = false;

        paths9.end();
        pathMat.opacity = (0.20 + vol * 0.34) * masterA;

        colls9.end();
        collMat.opacity = (0.26 + vol * 0.30) * masterA;
        // HARMONICS used to set collMat.linewidth here, which ANGLE clamps to
        // 1 px — the control was inert. It is the tube RADIUS now, above.

        // Bucket boxes
        for (let j = 0; j < NUM_BUCKETS; j++) {
            const yB = -H / 2 + (j + 1) * spacingB + bucketYOff;
            const isCollision = bucketHits[j] > 1;
            let bx = colB_X, by = yB;
            if (isCollision) {
                bx += calm9.drift(j * 3, 0) * 7 * (1 - consensus) * (1 + specS * 0.6);
                by += calm9.drift(j * 7, 1) * 7 * (1 - consensus);
            }
            // A bucket holding more is DEEPER. That is the one thing the flat
            // squares could not say, and it is the whole subject of a hash
            // table: how many keys landed here.
            const fill = Math.min(1, bucketHits[j] / 3);
            const lit9 = (j === heldBucket);
            _t9c.set(bx, by, -fill * 40);
            buckets9.setBox(j,
                _t9c,
                (1 + resBody * 0.5) * (lit9 ? 1.3 : 1),
                (1 + resBody * 0.5) * (lit9 ? 1.3 : 1),
                (1 + resBody * 0.5) * (1 + fill * 2.4),
                undefined);
            const dR = lerp(0.78, 1.0, dronFd); const dG = lerp(1.0, 0.67, dronFd);
            buckets9.tint(j,
                isCollision || lit9 ? 1.0 : dR,
                isCollision ? 0.67 : lit9 ? 1.0 : dG,
                lit9 ? 0.6 : 0);
        }
        buckets9.mesh.material.opacity = (0.18 + vol * 0.40) * masterA * 0.75;
        buckets9.commit();

        // The air runs along the ring the keys sit on. DRONE MIX sets the
        // flow, GIRO AUTO the swirl, PITCH SHIFT the lift.
        motes9.step(1 / 60, (droneMix - 0.5) * 60, vm9.rotation * 0.08,
            (pShift - 0.5) * 24);
        motes9.material.opacity = (0.08 + texDep * 0.24) * masterA;
        motes9.material.size = Math.max(W, H) * (0.0012 + resBody * 0.0032);
        root9.rotation.y = vm9.angle * (e9.parity > 0.5 ? 1 : -1)
            * (0.45 + e9.fullness * 0.35);
        keys9.mesh.material.opacity =
            (0.32 + vol * 0.26) * masterA * (0.72 + e9.gas * 0.55);
        keys9.commit();

        // Scanlines — textureDepth controls density, filtercutoff brightness
        const scanStep = Math.floor(lerp(10, 3, texDep));
        let scIdx = 0;
        // Deterministic spacing: a new random gap every frame made the scan
        // lines jump rather than scroll.
        for (let y = -H / 2; y < H / 2 && scIdx < MAX_SCAN_LINES;
             y += scanStep + 3 + calm9.drift(scIdx, 0) * 3) {
            scanPositions[scIdx * 6]     = -W / 2; scanPositions[scIdx * 6 + 1] = y; scanPositions[scIdx * 6 + 2] = -2;
            scanPositions[scIdx * 6 + 3] =  W / 2; scanPositions[scIdx * 6 + 4] = y; scanPositions[scIdx * 6 + 5] = -2;
            scIdx++;
        }
        scanGeo.setDrawRange(0, scIdx * 2);
        scanGeo.attributes.position.needsUpdate = true;
        scanMat.opacity = (vol * 0.08 + texDep * 0.12 + filtC * 0.06) * masterA;

        // Idle drift + damping. These six had no controls at all before, so
        // this is also where ROTATION SPD reaches them.
        driveOrbit(controls);
        composer.render();
    }

    animate();

    const onResize = () => {
        if (destroyed) return;
        const w = stageEl.offsetWidth; const h = stageEl.offsetHeight;
        renderer.setSize(w, h); composer.setSize(w, h);
        // aspect, not left/right/top/bottom. These five were still setting
        // ORTHOGRAPHIC bounds — left over from when the cameras were ortho —
        // on a PerspectiveCamera, which has no such properties: the four writes
        // landed on nothing and `aspect` was never updated at all. So resizing
        // the window stretched the scene by whatever the shape had changed by,
        // and it stayed stretched. Slot 5 was the only one doing it correctly.
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    return {
        name: "Hashing", key: "9",
        destroy: () => {
            cfield.destroy();
            destroyed = true; cancelAnimationFrame(rafId);
            pick9.dispose();
            keys9.dispose(); buckets9.dispose();
            paths9.dispose(); colls9.dispose();
            motes9.dispose(); tags9.dispose();
            try { controls.dispose(); } catch { /* ignore */ }
            window.removeEventListener("resize", onResize);
            composer.dispose(); renderer.dispose(); renderer.domElement.remove();
        }
    };
}

