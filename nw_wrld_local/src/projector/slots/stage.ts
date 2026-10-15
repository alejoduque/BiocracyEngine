// stage.ts — what every one of slots 4–9 stands on
// ===========================================================================
// The six instruments were six copies of the same scaffolding: a renderer, a
// perspective camera and an orbit, the same post stack, the blend layer, the
// twenty knobs read one line each, the resize and the teardown. It lives here
// once; a slot file holds only its own world.

import * as THREE from "three";
import { EffectComposer }  from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass }      from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { AfterimagePass }  from "three/examples/jsm/postprocessing/AfterimagePass.js";
import { ShaderPass }      from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OrbitControls }   from "three/examples/jsm/controls/OrbitControls.js";
import { getVizMotion } from "../vizMotion";
import { attachBlendLayer, type BlendLayer } from "../blend/blendLayer";
import type { Instrument } from "./instruments";

// ─── Chromatic aberration (slots 4, 5, 7, 8, 9) ──────────────────────────────
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

/** The geometry three.js shares among every Sprite (see destroy below). */
const SPRITE_GEOMETRY = new THREE.Sprite().geometry;

// ─── Renderer ────────────────────────────────────────────────────────────────
// Deliberately still opaque, and the constellation field for slots 5 and 9
// does NOT sit behind it.
//
// The obvious design was to open an alpha buffer here and let the field show
// through. Measured, it does nothing: the scene goes through an
// EffectComposer, and UnrealBloom/Afterimage/ShaderPass write an opaque alpha
// into the final pass regardless of what the clear asked for. So the field is
// composited ON TOP with `mix-blend-mode: screen` instead — see
// constellation/constellationField.ts.
function makeRenderer(container: HTMLElement): THREE.WebGLRenderer {
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    r.setClearColor(0x000804, 1);
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.setSize(container.offsetWidth || 800, container.offsetHeight || 600);
    container.appendChild(r.domElement);
    return r;
}

// ─── Camera + orbit ──────────────────────────────────────────────────────────
// These six had fixed cameras and no controls at all — nothing to look around
// with, and nothing for ROTATION SPD to turn. They have a real camera, and the
// same idle drift as everything else.
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
    // Fed from window.__vizMotion by the slot's loop, like every other slot.
    c.autoRotate = true;
    c.autoRotateSpeed = 0;
    c.update();
    return c;
}

// ─── The twenty knobs ────────────────────────────────────────────────────────
// Read from the slot's mirror (window.__slotNSoneth) into one object that is
// reused every frame. Defaults are the house's; a slot overrides the few it
// has always started elsewhere.
export type Knobs = {
    vol: number; pitchSh: number; tDil: number; specS: number; spatSp: number;
    texDep: number; atmMix: number; memFeed: number; harmR: number; resBody: number;
    masterA: number; filtC: number; noiseL: number; noiseF: number; droneD: number;
    dronFd: number; droneSpace: number; droneMix: number; delayFb: number; txInf: number;
    beatT: number;
};
const KNOBS: [keyof Knobs, string, number][] = [
    ["vol", "volume", 0.5], ["pitchSh", "pitchshift", 0.5], ["tDil", "timedilation", 0.5],
    ["specS", "spectralshift", 0.5], ["spatSp", "spatialspread", 0.5], ["texDep", "texturedepth", 0.5],
    ["atmMix", "atmospheremix", 0.5], ["memFeed", "memoryfeed", 0.4], ["harmR", "harmonicrich", 0.5],
    ["resBody", "resonantbody", 0.4], ["masterA", "masteramp", 0.7], ["filtC", "filtercutoff", 0.5],
    ["noiseL", "noiselevel", 0.2], ["noiseF", "noisefilt", 0.5], ["droneD", "dronedepth", 0.4],
    ["dronFd", "dronefade", 0.5], ["droneSpace", "dronespace", 0.5], ["droneMix", "dronemix", 0.4],
    ["delayFb", "delayfeedback", 0.3], ["txInf", "txInfluence", 0.5], ["beatT", "beatTempo", 0.5],
];

export function makeKnobs(defaults: Partial<Knobs> = {}) {
    const k = {} as Knobs;
    const def = KNOBS.map(([name, , d]) => defaults[name] ?? d);
    return {
        k,
        read(sp: Record<string, number>): Knobs {
            for (let i = 0; i < KNOBS.length; i++) k[KNOBS[i][0]] = sp[KNOBS[i][1]] ?? def[i];
            return k;
        },
    };
}

// ─── The stage ───────────────────────────────────────────────────────────────
export type SlotStage = {
    W: number; H: number; dist: number;
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    composer: EffectComposer;
    bloom: UnrealBloomPass | null;
    afterimage: AfterimagePass;
    chromatic: ShaderPass | null;
    blend: BlendLayer;
    /** The blend layer, the idle drift, and the frame. Call last in the loop. */
    render(): void;
    /** Extra work on resize (tickers). */
    onResize(fn: () => void): void;
    destroy(): void;
};

export function makeSlotStage(stageEl: HTMLElement, slot: "s4" | "s5" | "s6" | "s7" | "s8" | "s9", o: {
    /** UnrealBloom strength, radius, threshold; omitted = no bloom. */
    bloom?: [number, number, number];
    afterimage: number;
    chromatic: boolean;
    inst: Instrument;
    /** One representative scalar, so "is this slot moving?" can be answered from outside. */
    probe: () => number;
}): SlotStage {
    const W = stageEl.offsetWidth || 800;
    const H = stageEl.offsetHeight || 600;
    const dist = Math.max(W, H) * 0.95;
    const renderer = makeRenderer(stageEl);
    const scene = new THREE.Scene();
    const camera = make3D(stageEl, dist);
    // The blended space (blend/blendLayer.ts): the stage of the automaton,
    // formulas from the forest and the chain flying in and blending, over the
    // source spectrogram — in this scene, so the dome and NDI carry it.
    const blend = attachBlendLayer(slot, scene, camera, dist);
    const controls = attachOrbit(camera, renderer.domElement, dist);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = o.bloom ? new UnrealBloomPass(new THREE.Vector2(W, H), o.bloom[0], o.bloom[1], o.bloom[2]) : null;
    if (bloom) composer.addPass(bloom);
    const afterimage = new AfterimagePass(o.afterimage);
    composer.addPass(afterimage);
    const chromatic = o.chromatic ? new ShaderPass(ChromaticAberrationShader) : null;
    if (chromatic) composer.addPass(chromatic);

    // Which instrument is on screen, and a probe of its motion. These six
    // render to WebGL only, so no pixel probe can read them back; set once
    // here rather than re-created in every frame as they were.
    try {
        const w = window as unknown as { __vizInstrument?: Instrument; __vizProbe?: () => number };
        w.__vizInstrument = o.inst;
        w.__vizProbe = o.probe;
    } catch { /* ignore */ }

    const extra: (() => void)[] = [];
    let destroyed = false;
    const onResize = () => {
        if (destroyed) return;
        const w = stageEl.offsetWidth; const h = stageEl.offsetHeight;
        renderer.setSize(w, h);
        composer.setSize(w, h);
        // aspect, not left/right/top/bottom: these are perspective cameras.
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        for (const fn of extra) fn();
    };
    window.addEventListener("resize", onResize);

    return {
        W, H, dist, renderer, scene, camera, controls, composer, bloom, afterimage, chromatic, blend,
        render() {
            blend.tick();
            // Idle drift + damping; this is also where ROTATION SPD reaches them.
            controls.autoRotateSpeed = getVizMotion().speed * (30 / Math.PI);
            controls.update();
            composer.render();
        },
        onResize(fn) { extra.push(fn); },
        destroy() {
            destroyed = true;
            blend.destroy();
            try { controls.dispose(); } catch { /* ignore */ }
            window.removeEventListener("resize", onResize);
            // three.js shares ONE geometry among all Sprites (the captions), and
            // every renderer that draws it hangs a dispose listener on it. That
            // geometry is never disposed, so each slot's renderer — its shader
            // programs, its buffers — stayed reachable through the listener:
            // about a renderer per slot change, measured over 40 switches.
            // Disposing the shared geometry runs the listeners, which remove
            // themselves; the next renderer simply uploads it again.
            SPRITE_GEOMETRY.dispose();
            composer.dispose();
            renderer.dispose();
            // Each slot opens its own WebGL context; without this a switch
            // left the old one alive until the browser reclaimed it.
            renderer.forceContextLoss();
            renderer.domElement.remove();
        },
    };
}
