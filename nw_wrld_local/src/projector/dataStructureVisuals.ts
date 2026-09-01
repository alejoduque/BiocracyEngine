import * as THREE from "three";
import { EffectComposer }  from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass }      from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { AfterimagePass }  from "three/examples/jsm/postprocessing/AfterimagePass.js";
import { ShaderPass }      from "three/examples/jsm/postprocessing/ShaderPass.js";
import type { ParliamentState } from "./parliament/parliamentStore";
import { getVizMotion, readVoteFlash, isAlarm } from "./vizMotion";
import { getScAudio, bandRange, normLevel } from "./scAudio";
import { makeEventEmitter, makeExcursionEmitter } from "./slotVoice";
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
};
export const INSTRUMENTS: Record<string, Instrument> = {
    s4: { label: "DRONE",      sub: "opalDrone · sostenido",     voice: "drone",  band: [0.00, 0.34], hue: 0.09 },
    s5: { label: "CAMPANAS",   sub: "elektronBell · pads",       voice: "pad",    band: [0.18, 0.62], hue: 0.13 },
    s6: { label: "PERCUSIÓN",  sub: "opalPerc · pulso",          voice: "perc",   band: [0.30, 0.74], hue: 0.33 },
    s7: { label: "BOMBO",      sub: "opalKick · sub",            voice: "kick",   band: [0.00, 0.18], hue: 0.02 },
    s8: { label: "POLVO",      sub: "opalDust · granular",       voice: "dust",   band: [0.55, 1.00], hue: 0.52 },
    // [0.10, 0.95] was 85% of the spectrum — ~58 Hz to 8 kHz — and bandRange
    // is a plain mean, so this slot's level was dominated by the drone and
    // kick bands sitting near 0.15 while the field recordings it is supposed
    // to be showing sit near 0.004. It was measuring everything except itself.
    // The samples' actual register, after Antifonía's per-call hpf/lpf, is
    // bands 11-13 — roughly 2.3-4.8 kHz.
    s9: { label: "MUESTRAS",   sub: "samplePlayer · campo",      voice: "sample", band: [0.68, 0.88], hue: 0.75 },
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
    /** Call once per frame, after the slot has read its own state. */
    drive: (st: ParliamentState | null) => void;
    destroy: () => void;
};

function mountSlotField(
    stageEl: HTMLElement,
    inst: Instrument,
    slotKey: string,
    tune: Partial<ConstellationParams> = {},
): SlotField {
    const field = mountConstellationField(stageEl, {
        hue: hueRotateFor(inst.hue),
        ...tune,
    });

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

            field.drive({
                // Level rides on top of the control so the field breathes with
                // the note rather than only with the knob.
                speed: (0.25 + tDil * 1.6) * (0.6 + r.level * 1.8),
                density: 0.35 + texDep * 1.15,
                length: 0.55 + filtC * 0.9,
                strokeWidth: 0.5 + resBody * 1.6,
                // atmosphereMix is the reverb space, so it reads as how much
                // room there is around the voice — the field is that room.
                // Floored well above zero because a screen-blended layer at
                // 0.2 over a near-black scene is already almost invisible.
                opacity: (0.24 + atmMix * 0.44) * (0.6 + consensus * 0.4),
                brightness: 0.7 + masterA * 0.7,
                saturation: 0.8 + r.level * 0.6,
            });

            if (r.env > lastEnv + 0.06) field.pulse(Math.min(1, r.env * 0.9));
            lastEnv = r.env;
        },
        destroy() {
            window.removeEventListener("resize", onResize);
            field.destroy();
        },
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

    // ── Marker quads (one per species) ───────────────────────────────────────
    const markerMeshes = activeRoster.map(() => {
        const g = new THREE.BufferGeometry();
        const verts = new Float32Array([
            0, 8, 0,   8, 0, 0,   0, -8, 0,   -8, 0, 0,
        ]);
        g.setAttribute("position", new THREE.BufferAttribute(verts, 3));
        g.setIndex([0, 1, 2, 2, 3, 0]);
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true }));
        root4.add(m);
        return m;
    });

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

            // Marker at right edge
            const glow = 3 + activity * 8 + resBody * 12;
            const mk = markerMeshes[i];
            mk.position.set(W / 2 - 10, br.y, 1);
            mk.scale.setScalar(glow / 8);
            (mk.material as THREE.MeshBasicMaterial).opacity = vol * masterA;

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
        root4.rotation.x = -0.06 + au4.level * 0.05;

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
        camera.left = -w / 2; camera.right = w / 2; camera.top = h / 2; camera.bottom = -h / 2;
        camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    return {
        name: "Time Travel", key: "4",
        destroy: () => {
            destroyed = true;
            cancelAnimationFrame(rafId);
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
    const camera = make3D(stageEl, 620);
    const controls = attachOrbit(camera, renderer.domElement, 620);
    // Instrumental identity. Six slots, six voices of the engine, no
    // repeats — this one is mountDynamicGraphs. The name was drawn into the scene as
    // a sprite; it is gone. The binding it announced is the real one and
    // survives: this slot reads inst5's band and its voice's onsets.
    const inst5 = INSTRUMENTS.s5;
    // The constellation backdrop for this slot, coloured by inst5's hue
    // and driven by its band. See mountSlotField.
    const cfield = mountSlotField(stageEl, inst5, "__slot5Soneth");
    const emitEdge5 = makeExcursionEmitter("pad");

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.6, 0.4, 0.6);
    composer.addPass(bloom);
    const afterimage = new AfterimagePass(0.85);
    composer.addPass(afterimage);
    const chromatic = new ShaderPass(ChromaticAberrationShader);
    composer.addPass(chromatic);

    // Nodes
    const nodes: { x: number; y: number; z: number; vx: number; vy: number; vz: number; mesh: THREE.Mesh }[] = [];
    activeRoster.forEach(_sp => {
        const geo = new THREE.SphereGeometry(8, 8, 8);
        const mat = new THREE.MeshBasicMaterial({ color: 0xffaa00, wireframe: true, transparent: true });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set((Math.random() - 0.5) * W * 0.6, (Math.random() - 0.5) * H * 0.6, (Math.random() - 0.5) * 100);
        root5.add(mesh);
        nodes.push({ x: mesh.position.x, y: mesh.position.y, z: mesh.position.z, vx: 0, vy: 0, vz: 0, mesh });
    });

    // Glow rings (one per node)
    const glowRings = nodes.map(() => {
        const ring = makeCircle(18, 32, 0xffaa00, 0.2);
        root5.add(ring);
        return ring;
    });

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

    // Radar arc background
    const radarGroup = new THREE.Group();
    root5.add(radarGroup);
    const radarArcs: THREE.Line[] = [];
    for (let i = 0; i < 6; i++) {
        const arc = makeCircle(80 + i * 60, 64, 0x663300, 0.08 + i * 0.01);
        radarGroup.add(arc);
        radarArcs.push(arc);
    }

    // Edge geometry (max edges = N*(N-1)/2)
    const N = nodes.length;
    const maxEdges = N * (N - 1) / 2;
    const edgePositions = new Float32Array(maxEdges * 2 * 3);
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute("position", new THREE.BufferAttribute(edgePositions, 3));
    edgeGeo.setDrawRange(0, 0);
    const edgeMat = new THREE.LineBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.4 });
    const edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
    root5.add(edgeLines);

    let rafId: number;
    let frame = 0;

    function animate() {
        if (destroyed) return;
        rafId = requestAnimationFrame(animate);
        frame++;

        const st = getLatestState();
        cfield.drive(st);
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
        bloom.strength = lerp(0.3, 1.0, consensus * masterA);
        // Idle: the whole graph precesses slowly. A vote is an EDGE CASCADE —
        // the bloom surges and every edge is briefly forced, so the network
        // flashes fully connected and settles back.
        radarGroup.rotation.z = vm5.angle * 0.6;
        if (vf5) bloom.strength += vf5.flash * (isAlarm(vf5.type) ? 0.5 : 1.1);
        renderer.setClearColor(0x000804, lerp(0.5, 0.95, 1 - atmMix));

        // Connection distance controlled by filtercutoff
        const restLength = 80 + filtC * 250 + (st?.eco?.mycoPulse ?? 0) * 80;

        // Gravity center
        const cx = 0, cy = (pitchSh - 0.5) * H * 0.4;

        // Physics
        const edgePos = edgeGeo.attributes.position.array as Float32Array;
        let edgeCount = 0;

        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const dx = nodes[j].x - nodes[i].x;
                const dy = nodes[j].y - nodes[i].y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;

                if (dist < restLength * 2) {
                    // Connection noise probability
                    const noise = snoise(i * 17 + j, frame * 0.05 * (1 + tDil));
                    if (noise < consensus + (vf5 ? vf5.flash * 0.9 : 0)) {
                        const baseIdx = edgeCount * 6;
                        let ax = nodes[i].x, ay = nodes[i].y;
                        let bx = nodes[j].x, by = nodes[j].y;
                        // txInfluence glitch
                        if (Math.random() < txInf * 0.5) {
                            bx += (Math.random() - 0.5) * 80 * specS;
                            by += (Math.random() - 0.5) * 80 * specS;
                        }
                        edgePos[baseIdx]     = ax; edgePos[baseIdx + 1] = ay; edgePos[baseIdx + 2] = 0;
                        edgePos[baseIdx + 3] = bx; edgePos[baseIdx + 4] = by; edgePos[baseIdx + 5] = 0;
                        edgeCount++;
                    }
                    const force = (dist - restLength) * (0.004 + txInf * 0.015) * (0.5 + specS);
                    nodes[i].vx += (dx / dist) * force;
                    nodes[i].vy += (dy / dist) * force;
                    nodes[j].vx -= (dx / dist) * force;
                    nodes[j].vy -= (dy / dist) * force;
                }
            }
        }
        edgeGeo.setDrawRange(0, edgeCount * 2);
        // ── CAMPANAS speak ────────────────────────────────────────────────
        // An edge forming is the graph's own event: two nodes that were not
        // connected now are. The bell rings for the connection, and how full
        // the graph already is chooses the pitch.
        emitEdge5(edgeCount, 0.35 + Math.min(1, edgeCount / 24) * 0.5,
            Math.min(1, edgeCount / 32));
        edgeGeo.attributes.position.needsUpdate = true;
        edgeMat.opacity = (0.3 + vol * 0.5) * masterA;
        edgeMat.linewidth = 0.5 + noiseF * 1.5;

        // droneFade edge color warmth
        const edgeR = Math.floor(lerp(200, 255, dronFd));
        const edgeG = Math.floor(lerp(170, 200, dronFd));
        edgeMat.color.setRGB(edgeR / 255, edgeG / 255, 0);

        nodes.forEach((n, i) => {
            // Center gravity
            n.vx += (cx - n.x) * (0.001 + specS * 0.005);
            n.vy += (cy - n.y) * (0.001 + specS * 0.005);

            const act  = st?.species?.[i % (st?.species?.length || 1)]?.activity ?? 0.5;
            const pres = st?.species?.[i % (st?.species?.length || 1)]?.presence ?? 0.5;

            // Noise jitter — noiseLevel controls amplitude
            n.vx += (snoise(i, frame * 0.02) - 0.5) * noiseL * 4;
            n.vy += (snoise(i + 100, frame * 0.02) - 0.5) * noiseL * 4;

            // txInfluence aggressive jitter
            if (Math.random() < act * 0.2) { n.vx += (Math.random() - 0.5) * 8 * txInf; n.vy += (Math.random() - 0.5) * 8 * txInf; }

            n.x += n.vx * (1 + tDil); n.y += n.vy * (1 + tDil);
            // droneSpace adds Z spread
            n.z = (snoise(i * 3, frame * 0.003) - 0.5) * droneSpace * 80;
            n.vx *= 0.88; n.vy *= 0.88;

            // Node size: textureDepth + presence; droneDepth adds segments (handled by scale)
            const rad = 5 + pres * 12 + texDep * 8;
            const spreadR = rad * (0.6 + spatSp * 0.8);
            n.mesh.scale.setScalar(spreadR / 8);
            n.mesh.position.set(n.x, n.y, n.z);

            // harmonicRich: node color white→amber
            const nr = lerp(0.78, 1.0, harmR);
            const ng = lerp(1.0, 0.67, harmR);
            const nb = lerp(0.9, 0.0, harmR);
            (n.mesh.material as THREE.MeshBasicMaterial).color.setRGB(nr, ng, nb);
            (n.mesh.material as THREE.MeshBasicMaterial).opacity = (0.5 + vol * 0.5) * masterA;

            // dronedepth: detail level via geometry segments (proxy: wireframe density via scale noise)
            n.mesh.rotation.z += 0.005 + droneD * 0.02 + vm5.speed * 0.02;
            // CAMPANAS. The graph is no longer a flat sheet: each node sits at
            // a depth given by its index, and the whole lattice breathes on Z
            // with the pad register. A pad ATTACK snaps every node forward and
            // it settles back — the bell being struck, not merely ringing.
            n.mesh.position.z = Math.sin(i * 1.7) * 120 * (0.25 + au5.level * 1.6)
                + au5.env * 90 * au5.amp;
            const sc5 = 1 + au5.env * au5.amp * 0.9;
            n.mesh.scale.setScalar(sc5);

            // Glow ring
            const gr = glowRings[i];
            gr.position.set(n.x, n.y, n.z - 0.1);
            gr.scale.setScalar(spreadR * (1.8 + resBody * 1.5) / 18);
            (gr.material as THREE.LineBasicMaterial).opacity = resBody * 0.4 * (0.5 + act * 0.5) * masterA;
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
    const cfield = mountSlotField(stageEl, inst6, "__slot6Soneth");
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

    // Node meshes (wireframe boxes)
    const nodeData: { x: number; y: number; tx: number; ty: number; mesh: THREE.Mesh; innerMesh: THREE.Mesh }[] = [];
    activeRoster.forEach((_sp, _i) => {
        const outerGeo = new THREE.BoxGeometry(20, 20, 1);
        const outerMat = new THREE.MeshBasicMaterial({ color: 0xc8ffe6, wireframe: true, transparent: true });
        const outer = new THREE.Mesh(outerGeo, outerMat);
        root6.add(outer);

        const innerGeo = new THREE.BoxGeometry(10, 10, 1);
        const innerMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, wireframe: true, transparent: true });
        const inner = new THREE.Mesh(innerGeo, innerMat);
        root6.add(inner);

        nodeData.push({ x: 0, y: 0, tx: 0, ty: 0, mesh: outer, innerMesh: inner });
    });

    // Edge line pool
    const MAX_EDGES = activeRoster.length * 2;
    const edgePosArr = new Float32Array(MAX_EDGES * 2 * 3);
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute("position", new THREE.BufferAttribute(edgePosArr, 3));
    edgeGeo.setDrawRange(0, 0);
    const edgeMat = new THREE.LineBasicMaterial({ color: 0xffaa00, transparent: true });
    const edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
    root6.add(edgeLines);

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
        cfield.drive(st);
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
        // Which instrument is on screen, published like __antifoniaStand.
        // A label baked into a canvas sprite cannot be read back, so
        // without this the identity is unverifiable from outside.
        try { (window as any).__vizInstrument = inst6; } catch { /* ignore */ }

        // Observability: these six render to WebGL only, so no pixel probe can
        // read them back (a canvas without preserveDrawingBuffer returns blank
        // through drawImage). Publishing one representative scalar is the only
        // way "is this slot actually moving?" can be answered from outside.
        try { (window as any).__vizProbe = () => (nodeData[0] ? nodeData[0].mesh.rotation.z : 0); } catch { /* ignore */ }

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

        afterimage.uniforms["damp"].value = lerp(0.73, 0.93, delayFb * 0.7 + memFeed * 0.3);
        bloom.strength = lerp(0.2, 0.7, harmR * masterA);
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
                // be silly.
                (n as any).layer = layer;
                const countInLayer = Math.pow(2, layer);
                const posInLayer = (childIdx + 2) - countInLayer;
                const breathe = Math.sin(frame * 0.05 * (1 + tDil) + layer) * (30 + specS * 50) * (1.1 - consensus);
                const lx = lerp(-W / 2 * treeWidth, W / 2 * treeWidth, (posInLayer + 0.5) / countInLayer) + breathe;
                const ly = rootY - layer * layerSpacing + (snoise(i, frame * (0.02 + specS * 0.05)) - 0.5) * 40 * noiseL * 3;
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
            if (consensus < 0.8) {
                n.x += (Math.random() - 0.5) * 10 * (1 - consensus);
                n.y += (Math.random() - 0.5) * 10 * (1 - consensus);
            }

            const act = st?.species?.[n.mesh ? i : i % (st?.species?.length || 1)]?.activity ?? 0;
            const glW = 10 + resBody * 25 + act * 15;

            // Outer box
            // PERCUSIÓN. The tree had layers in Y and nothing in Z; each layer
            // now stands at its own depth, so the hierarchy is a solid rather
            // than a diagram. A strike drives that layer forward, and tone —
            // the pitch SC sends with the onset — decides which depth it hits.
            // Written INSIDE the position.set that used to hard-zero z.
            const lay6 = (n as any).layer ?? 0;
            const z6 = lay6 * -70 * (0.4 + au6.level * 1.6)
                + au6.env * 130 * au6.amp * (1 - Math.min(1, Math.abs(au6.tone - lay6 / 4)));
            n.mesh.position.set(n.x, n.y, z6);
            n.mesh.scale.setScalar(glW / 20);
            // Drift folded in, and the vote's rebalance shows in the boxes
            // as well as in the snap rate above.
            n.mesh.rotation.z += 0.005 + texDep * 0.04 * (1 + act * 8) + vm6.speed * 0.02
              + (vf6 ? vf6.flash * 0.10 * (isAlarm(vf6.type) ? -1 : 1) : 0);
            (n.mesh.material as THREE.MeshBasicMaterial).color.setRGB(
                lerp(0.78, 1.0, harmR), lerp(1.0, 0.67, harmR), lerp(0.9, 0.0, harmR)
            );
            (n.mesh.material as THREE.MeshBasicMaterial).opacity = (0.4 + vol * 0.6) * masterA;

            // Inner box — droneDepth pulses inner scale
            const innerPulse = 0.5 + 0.5 * Math.sin(frame * 0.1 * (1 + tDil) + i) * droneD;
            n.innerMesh.position.set(n.x, n.y, 0.1);
            n.innerMesh.scale.setScalar((glW * innerPulse) / 10);
            (n.innerMesh.material as THREE.MeshBasicMaterial).opacity = (0.3 + vol * 0.5) * masterA;
        });
        // How high in the tree the arrival happened chooses the register: a
        // rebalance near the leaves is a lighter hit than one at the root.
        emitArrive6(arrived6, 0.3 + Math.min(1, arrived6 / 10) * 0.55,
            1 - Math.min(1, arrived6 / 14));

        // Edges from all non-root nodes to root
        const rootNode = nodeData[maxIdx];
        let eIdx = 0;
        nodeData.forEach((n, i) => {
            if (i === maxIdx || eIdx >= MAX_EDGES) return;
            let ex = n.x, ey = n.y, rx = rootNode.x, ry = rootNode.y;
            if (Math.random() < txInf * 0.6) {
                ex += (Math.random() - 0.5) * 60 * specS;
                ey += (Math.random() - 0.5) * 60 * specS;
            }
            edgePosArr[eIdx * 6]     = ex;  edgePosArr[eIdx * 6 + 1] = ey;  edgePosArr[eIdx * 6 + 2] = 0;
            edgePosArr[eIdx * 6 + 3] = rx;  edgePosArr[eIdx * 6 + 4] = ry;  edgePosArr[eIdx * 6 + 5] = 0;
            eIdx++;
        });
        edgeGeo.setDrawRange(0, eIdx * 2);
        edgeGeo.attributes.position.needsUpdate = true;
        edgeMat.opacity = (0.4 + vol * 0.6) * masterA;

        // droneFade: background color warmth
        const bgWarmth = Math.floor(dronFd * 6);
        renderer.setClearColor((bgWarmth << 8) | 0x000804, 1);

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
        camera.left = -w / 2; camera.right = w / 2; camera.top = h / 2; camera.bottom = -h / 2;
        camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    return {
        name: "Dynamic Optimality", key: "6",
        destroy: () => {
            cfield.destroy();
            destroyed = true; cancelAnimationFrame(rafId);
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
    const cfield = mountSlotField(stageEl, inst7, "__slot7Soneth");
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
    const rays: { y: number; angle: number }[] = activeRoster.map(() => ({
        y: (Math.random() - 0.5) * H * 0.7,
        angle: (Math.random() - 0.5) * Math.PI / 4,
    }));

    const MAX_RAYS = 10;
    const rayPositions = new Float32Array(MAX_RAYS * 2 * 3);
    const rayGeo = new THREE.BufferGeometry();
    rayGeo.setAttribute("position", new THREE.BufferAttribute(rayPositions, 3));
    rayGeo.setDrawRange(0, 0);
    const rayMat = new THREE.LineBasicMaterial({ color: 0xc8ffe6, transparent: true });
    root7.add(new THREE.LineSegments(rayGeo, rayMat));

    // Sweep vertical lines (max 4 eco values)
    const sweepPositions = new Float32Array(4 * 2 * 3);
    const sweepGeo = new THREE.BufferGeometry();
    sweepGeo.setAttribute("position", new THREE.BufferAttribute(sweepPositions, 3));
    sweepGeo.setDrawRange(0, 0);
    const sweepMat = new THREE.LineBasicMaterial({ color: 0xffaa00, transparent: true });
    root7.add(new THREE.LineSegments(sweepGeo, sweepMat));

    // Target circles pool (ray × sweep)
    const targetGroup = new THREE.Group();
    root7.add(targetGroup);

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

    function makeTargetCircle(r: number): THREE.Line {
        return makeRetCircle(r, 32, 0xffaa00, 0.6);
    }

    // Pre-allocate target circles
    const maxTargets = MAX_RAYS * 4;
    const targetCircles: THREE.Line[] = [];
    for (let i = 0; i < maxTargets; i++) {
        const tc = makeTargetCircle(12);
        tc.visible = false;
        targetGroup.add(tc);
        targetCircles.push(tc);
    }

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
        cfield.drive(st);
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
        bloom.strength = lerp(0.2, 0.8, (resBody + harmR * 0.3) * masterA);
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
        reticuleGroup.position.z = au7.env * 220 * au7.amp;
        reticuleGroup.scale.setScalar(1 + au7.env * au7.amp * 0.35 + au7.level * 0.25);
        root7.rotation.x = -0.07 - au7.level * 0.06;
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
        for (let i = 0; i < Math.min(rays.length, rayCount); i++) {
            const r = rays[i];
            const presence = st?.species?.[i]?.presence ?? 0.5;
            const act      = st?.species?.[i]?.activity ?? 0.5;

            r.y += (act - 0.5) * (3 + tDil * 4);
            if (r.y < yMin) r.y = yMax; if (r.y > yMax) r.y = yMin;

            const angleRange = Math.PI / 4 * (0.3 + pitchSh * 1.4);
            r.angle += (snoise(i, frame * (0.005 + tDil * 0.015)) - 0.5) * (0.06 + (1 - consensus) * 0.04);
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
            rayPositions[rIdx * 6]     = Math.cos(dirA) * rNear;
            rayPositions[rIdx * 6 + 1] = Math.sin(dirA) * rNear + r.y * 0.06;
            rayPositions[rIdx * 6 + 2] = W * 0.10;
            rayPositions[rIdx * 6 + 3] = Math.cos(dirA) * rFar;
            rayPositions[rIdx * 6 + 4] = Math.sin(dirA) * rFar + r.y * 0.30;
            rayPositions[rIdx * 6 + 5] = -W * 0.55 * front7;
            rIdx++;
        }
        rayGeo.setDrawRange(0, rIdx * 2);
        rayGeo.attributes.position.needsUpdate = true;
        // average presence across active species modulates ray brightness
        const avgPresence = rays.reduce((s, _, i) => s + (st?.species?.[i]?.presence ?? 0.5), 0) / Math.max(rays.length, 1);
        rayMat.opacity = (0.3 + avgPresence * 0.3 + vol * 0.4) * masterA;

        // Target circles at ray × sweep intersections
        let tcIdx = 0;
        for (let ri = 0; ri < Math.min(rays.length, rayCount); ri++) {
            const r = rays[ri];
            const act = st?.species?.[ri]?.activity ?? 0.5;
            ecoVals.slice(0, maxSweeps).forEach(v => {
                if (tcIdx >= maxTargets) return;
                const sx = (v % 1.0) * W - W / 2;
                const iy = r.y + Math.tan(r.angle) * (sx + W / 2);
                if (iy > yMin && iy < yMax) {
                    const tc = targetCircles[tcIdx];
                    tc.visible = true;
                    tc.position.set(sx, iy, 1);
                    const targetSize = 10 + act * 20 + resBody * 12;
                    tc.scale.setScalar(targetSize / 12);
                    (tc.material as THREE.LineBasicMaterial).color.setRGB(swR, swG, swB);
                    (tc.material as THREE.LineBasicMaterial).opacity = (0.7 + vol * 0.3) * masterA;
                    tcIdx++;
                }
            });
        }
        // Hide unused target circles
        for (let i = tcIdx; i < maxTargets; i++) targetCircles[i].visible = false;
        // ── BOMBO speaks ──────────────────────────────────────────────────
        // A target acquisition — a ray crossing a sweep — is this slot's
        // discrete event, and the sub is the register that can carry it. The
        // count of simultaneous acquisitions sets how hard, and how low.
        emitTarget7(tcIdx, 0.4 + Math.min(1, tcIdx / 12) * 0.5,
            1 - Math.min(1, tcIdx / 16));

        // Glitch rects from txInfluence
        let grIdx = 0;
        for (let ri = 0; ri < rays.length && grIdx < 20; ri++) {
            if (txInf > 0.25 && Math.random() < txInf * 0.15) {
                const gx = (Math.random() - 0.5) * W;
                const gy = rays[ri].y + (Math.random() - 0.5) * 40;
                const gr = glitchRects[grIdx];
                gr.visible = true;
                gr.scale.set(Math.random() * 80 * txInf + 20, 1, 1);
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
        camera.left = -w / 2; camera.right = w / 2; camera.top = h / 2; camera.bottom = -h / 2;
        camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    return {
        name: "Geometry", key: "7",
        destroy: () => {
            cfield.destroy();
            destroyed = true; cancelAnimationFrame(rafId);
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
    const cfield = mountSlotField(stageEl, inst8, "__slot8Soneth");
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

    // Block wireframe meshes — activeRoster × LAYERS
    const blockMeshes: THREE.Mesh[][] = [];
    for (let j = 0; j < LAYERS; j++) {
        const row: THREE.Mesh[] = [];
        for (let i = 0; i < activeRoster.length; i++) {
            const g = new THREE.BoxGeometry(1, 1, 1);
            const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xc8ffe6, wireframe: true, transparent: true }));
            root8.add(m);
            row.push(m);
        }
        blockMeshes.push(row);
    }

    // Drop lines between layers
    const MAX_DROPS = 24;
    const dropPositions = new Float32Array(MAX_DROPS * 2 * 3);
    const dropGeo = new THREE.BufferGeometry();
    dropGeo.setAttribute("position", new THREE.BufferAttribute(dropPositions, 3));
    dropGeo.setDrawRange(0, 0);
    const dropMat = new THREE.LineBasicMaterial({ color: 0xc8ffe6, transparent: true });
    root8.add(new THREE.LineSegments(dropGeo, dropMat));

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
    for (let i = 0; i < 120; i++) hexData.push(Math.floor(Math.random() * 65535).toString(16).padStart(4, "0").toUpperCase());

    let rafId: number;
    let frame = 0;

    function animate() {
        if (destroyed) return;
        rafId = requestAnimationFrame(animate);
        frame++;

        const st = getLatestState();
        cfield.drive(st);
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
        bloom.strength = lerp(0.2, 0.7, resBody * masterA);

        // Hex noise — beatTempo speeds churn (stored in sp8.beatTempo if present, else tDil proxy)
        const beatT = sp8.beatTempo ?? 0.5;
        const hexRefresh = Math.max(1, Math.floor(8 - tDil * 4 - beatT * 5));
        if (frame % hexRefresh === 0) {
            const idx = Math.floor(Math.random() * hexData.length);
            hexData[idx] = Math.floor(Math.random() * 65535).toString(16).padStart(4, "0").toUpperCase();
        }
        // Redraw hex canvas
        hexCtx.clearRect(0, 0, 512, 512);
        const wR = Math.floor(lerp(102, 220, dronFd));
        const wG = Math.floor(lerp(51, 130, dronFd));
        hexCtx.fillStyle = `rgba(${wR},${wG},0,${0.3 + texDep * 0.4 + filtC * 0.2})`;
        hexCtx.font = `${7 + Math.floor(texDep * 4)}px monospace`;
        const hexCount = Math.floor(20 + texDep * 50);
        for (let i = 0; i < hexCount; i++) {
            hexCtx.fillText(hexData[i % hexData.length], Math.random() * 512, Math.random() * 512);
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
            let bw = W * wRatio * (0.8 + (snoise(j, frame * (0.005 + tDil * 0.01)) - 0.5) * 0.4);
            let bx = -bw / 2;

            // Glitch displacement — txInfluence + noiseLevel
            const glitchProb = 0.1 + txInf * 0.2;
            if (aiOpt < 50 && Math.random() < glitchProb) {
                bx += (Math.random() - 0.5) * 80 * noiseL * (1 - aiOpt100) * (1 + txInf);
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
            border.rotation.z = Math.sin(vm8.angle * 0.5) * 0.035;
            // POLVO. The hierarchy stood in a plane; each level now sits at
            // its own depth so the cache reads as a stack you could walk into.
            // The high band —where granular dust lives— scatters the levels
            // apart, and a grain firing pushes its level forward.
            border.position.z = -j * 90 * (0.3 + au8.level * 1.8) + au8.env * 60 * au8.amp;

            // Species blocks inside layer
            let blockCX = bx + 10;
            for (let i = 0; i < activeRoster.length; i++) {
                const pres = st?.species?.[i]?.presence ?? 0.5;
                const act  = st?.species?.[i]?.activity ?? 0.5;
                const cw = (bw - 20) * (pres / LAYERS) * (0.5 + (snoise(i, j + frame * (0.005 + tDil * 0.01)) - 0.5) * 0.5);
                const bm = blockMeshes[j][i];
                bm.scale.set(Math.max(cw, 5), baseH - 20, 1);
                bm.position.set(blockCX + cw / 2, cy + baseH / 2, 1);
                (bm.material as THREE.MeshBasicMaterial).color.setRGB(
                    lerp(0.78, 1.0, harmR), lerp(1.0, 0.67, harmR), lerp(0.9, 0.0, harmR)
                );
                (bm.material as THREE.MeshBasicMaterial).opacity = (0.4 + vol * 0.6) * masterA;
                bm.rotation.z = act * (snoise(i + j * 10, frame * 0.01) - 0.5) * 0.15 * txInf;
                blockCX += cw + 5;
            }
            // Past the right edge of its own level: this layer has spilled.
            if (blockCX > (bx + bw)) overflow8++;

            // Drop lines to next layer
            if (j < LAYERS - 1) {
                for (let k = 0; k < dropCount && dIdx < MAX_DROPS; k++) {
                    const dropX = bx + Math.random() * bw;
                    const gx1 = (Math.random() - 0.5) * 30 * txInf;
                    const gx2 = (Math.random() - 0.5) * 30 * txInf;
                    dropPositions[dIdx * 6]     = dropX + gx1; dropPositions[dIdx * 6 + 1] = cy + baseH;        dropPositions[dIdx * 6 + 2] = 2;
                    dropPositions[dIdx * 6 + 3] = dropX + gx2; dropPositions[dIdx * 6 + 4] = cy + baseH + layerGap - 2; dropPositions[dIdx * 6 + 5] = 2;
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
        dropGeo.setDrawRange(0, dIdx * 2);
        dropGeo.attributes.position.needsUpdate = true;
        const dmR = lerp(0.78, 1.0, droneMix); const dmG = lerp(1.0, 0.67, droneMix);
        dropMat.color.setRGB(dmR, dmG, 0);
        dropMat.opacity = (0.5 + memFeed * 0.5) * (0.4 + vol * 0.6) * masterA;

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
        camera.left = -w / 2; camera.right = w / 2; camera.top = h / 2; camera.bottom = -h / 2;
        camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    return {
        name: "Memory Hierarchy", key: "8",
        destroy: () => {
            cfield.destroy();
            destroyed = true; cancelAnimationFrame(rafId);
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
    const cfield = mountSlotField(stageEl, inst9, "__slot9Soneth");
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

    // Key boxes (left column)
    const keyBoxes: THREE.Mesh[] = [];
    for (let i = 0; i < NUM_KEYS; i++) {
        const g = new THREE.BoxGeometry(20, 20, 1);
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xc8ffe6, wireframe: true, transparent: true }));
        root9.add(m);
        keyBoxes.push(m);
    }

    // Bucket boxes (right column)
    const bucketBoxes: THREE.Mesh[] = [];
    for (let j = 0; j < NUM_BUCKETS; j++) {
        const g = new THREE.BoxGeometry(30, 30, 1);
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xc8ffe6, wireframe: true, transparent: true }));
        root9.add(m);
        bucketBoxes.push(m);
    }

    // Path lines — bezier sampled at 12 points per path
    const PATH_SEGS = 12;
    const pathPositions = new Float32Array(NUM_KEYS * PATH_SEGS * 3);
    const pathGeo = new THREE.BufferGeometry();
    pathGeo.setAttribute("position", new THREE.BufferAttribute(pathPositions, 3));
    pathGeo.setDrawRange(0, 0);
    const pathMat = new THREE.LineBasicMaterial({ color: 0xc8ffe6, transparent: true, vertexColors: false });
    root9.add(new THREE.Line(pathGeo, pathMat));

    // Collision path highlight (drawn over normal paths)
    const collPositions = new Float32Array(NUM_KEYS * PATH_SEGS * 3);
    const collGeo = new THREE.BufferGeometry();
    collGeo.setAttribute("position", new THREE.BufferAttribute(collPositions, 3));
    collGeo.setDrawRange(0, 0);
    const collMat = new THREE.LineBasicMaterial({ color: 0xffaa00, transparent: true });
    root9.add(new THREE.Line(collGeo, collMat));

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
        cfield.drive(st);
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
        // Which instrument is on screen, published like __antifoniaStand.
        // A label baked into a canvas sprite cannot be read back, so
        // without this the identity is unverifiable from outside.
        try { (window as any).__vizInstrument = inst9; } catch { /* ignore */ }

        // Observability: these six render to WebGL only, so no pixel probe can
        // read them back (a canvas without preserveDrawingBuffer returns blank
        // through drawImage). Publishing one representative scalar is the only
        // way "is this slot actually moving?" can be answered from outside.
        try { (window as any).__vizProbe = () => (keyBoxes[0] ? keyBoxes[0].rotation.z : 0); } catch { /* ignore */ }

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
        bloom.strength = lerp(0.3, 1.0, masterA);

        // Column positions — spatialSpread controls separation
        const colA_X = -W / 2 + W * lerp(0.3, 0.12, spatSp);
        const colB_X = -W / 2 + W * lerp(0.7, 0.88, spatSp);
        const spacingA = H / (NUM_KEYS + 1);
        const spacingB = H / (NUM_BUCKETS + 1);
        const bucketYOff = (pShift - 0.5) * 100 + (droneSpace - 0.5) * 60;

        // Compute hashes — beatTempo drives mutation speed
        const bucketHits = new Array(NUM_BUCKETS).fill(0);
        const mapTargets: number[] = [];
        for (let i = 0; i < NUM_KEYS; i++) {
            const hash = Math.floor(snoise(i, frame * 0.005 * (1.1 - consensus) * (1 + tDil * 2 + beatT * 3)) * NUM_BUCKETS);
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
        for (let i = 0; i < NUM_KEYS; i++) {
            const yA = -H / 2 + (i + 1) * spacingA;
            const mapped = mapTargets[i];
            const yB = -H / 2 + (mapped + 1) * spacingB + bucketYOff;
            const isCollision = bucketHits[mapped] > 1;
            const spAct = st?.species?.[i % (st?.species?.length || 1)]?.activity ?? 0.5;

            // Key box position + rotation (droneDepth controls spin speed)
            const kbSize = 20 * (1 + noiseL * (snoise(i, frame * 0.01) - 0.3));
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
                keyBoxes[i].position.z = Math.cos(ang9) * rad9
                    + au9.env * 150 * au9.amp * (1 - Math.abs(au9.tone - i / Math.max(1, keyBoxes.length)));
            }
            keyBoxes[i].rotation.z += 0.005 + droneD * 0.02 + vm9.speed * 0.02
              + (vf9 ? vf9.flash * 0.14 * (isAlarm(vf9.type) ? -1 : 1) : 0);
            (keyBoxes[i].material as THREE.MeshBasicMaterial).color.setRGB(0.78, 1.0, 0.9);
            (keyBoxes[i].material as THREE.MeshBasicMaterial).opacity = (0.8 + vol * 0.2) * masterA;

            // Path line (bezier sampled)
            const cx0 = colA_X + 20, cx1 = colB_X - 20;
            const midX = (cx0 + cx1) / 2;
            const jitterRange = noiseF * 40;
            for (let s = 0; s <= PATH_SEGS; s++) {
                const t = s / PATH_SEGS;
                const gj = (snoise(i + s, frame * 0.03) - 0.5) * jitterRange * (isCollision ? (1 - consensus) * (1 + specS * 3 + txInf * 2) : 0);
                // Quadratic bezier: P = (1-t)²·A + 2(1-t)t·M + t²·B
                const tt = t * t; const mt = 1 - t; const mt2 = mt * mt;
                const px = mt2 * cx0 + 2 * mt * t * midX + tt * cx1;
                const py = mt2 * yA  + 2 * mt * t * lerp(yA, yB, 0.5) + tt * yB + gj;
                if (isCollision) {
                    collPositions[collIdx * 3]     = px;
                    collPositions[collIdx * 3 + 1] = py;
                    collPositions[collIdx * 3 + 2] = 0;
                    collIdx++;
                } else {
                    pathPositions[pathIdx * 3]     = px;
                    pathPositions[pathIdx * 3 + 1] = py;
                    pathPositions[pathIdx * 3 + 2] = 0;
                    pathIdx++;
                }
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
                if (txInf > 0.3 && Math.random() < txInf * 0.25) {
                    const tearX = lerp(colA_X, colB_X, Math.random());
                    const tearY = lerp(yA, yB, Math.random());
                    const tr = tearRects[trIdx];
                    tr.visible = true;
                    tr.scale.set(Math.random() * 80 * txInf + 20, 1 + Math.random() * 3, 1);
                    tr.position.set(tearX, tearY, 2);
                    (tr.material as THREE.MeshBasicMaterial).opacity = 0.5 * txInf * masterA;
                    trIdx++;
                }
            }
        }
        for (let i = trIdx; i < 16; i++) tearRects[i].visible = false;

        pathGeo.setDrawRange(0, pathIdx);
        pathGeo.attributes.position.needsUpdate = true;
        pathMat.opacity = (0.5 + vol * 0.5) * masterA;

        collGeo.setDrawRange(0, collIdx);
        collGeo.attributes.position.needsUpdate = true;
        collMat.opacity = (0.6 + vol * 0.4) * masterA;
        collMat.linewidth = 1 + harmR * 1.5;

        // Bucket boxes
        for (let j = 0; j < NUM_BUCKETS; j++) {
            const yB = -H / 2 + (j + 1) * spacingB + bucketYOff;
            const isCollision = bucketHits[j] > 1;
            const bm = bucketBoxes[j];
            let bx = colB_X, by = yB;
            if (isCollision) {
                bx += (snoise(j * 3, frame * 0.05) - 0.5) * 10 * (1 - consensus) * (1 + specS);
                by += (snoise(j * 7, frame * 0.05) - 0.5) * 10 * (1 - consensus);
            }
            bm.position.set(bx, by, 0);
            bm.scale.setScalar(1 + resBody * 0.5);
            const dR = lerp(0.78, 1.0, dronFd); const dG = lerp(1.0, 0.67, dronFd);
            (bm.material as THREE.MeshBasicMaterial).color.setRGB(
                isCollision ? 1.0 : dR,
                isCollision ? 0.67 : dG,
                0
            );
            (bm.material as THREE.MeshBasicMaterial).opacity = (isCollision ? 0.9 : 0.5) * (0.4 + vol * 0.6) * masterA;
        }

        // Scanlines — textureDepth controls density, filtercutoff brightness
        const scanStep = Math.floor(lerp(10, 3, texDep));
        let scIdx = 0;
        for (let y = -H / 2; y < H / 2 && scIdx < MAX_SCAN_LINES; y += scanStep + Math.floor(Math.random() * 7)) {
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
        camera.left = -w / 2; camera.right = w / 2; camera.top = h / 2; camera.bottom = -h / 2;
        camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    return {
        name: "Hashing", key: "9",
        destroy: () => {
            cfield.destroy();
            destroyed = true; cancelAnimationFrame(rafId);
            try { controls.dispose(); } catch { /* ignore */ }
            window.removeEventListener("resize", onResize);
            composer.dispose(); renderer.dispose(); renderer.domElement.remove();
        }
    };
}

