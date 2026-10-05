// domeCapture.ts — which 3-D scene is the stage showing right now?
// ===========================================================================
// The dome renders each slot's OWN scene through a fisheye camera. It cannot
// ask the slots for their scenes: there are sixteen of them, written over two
// years in three idioms (ModuleBase classes, mount functions, p5 sketches),
// each creating its own WebGLRenderer inside its own mount. Threading a
// "give me your scene" API through all of them would touch every slot.
//
// So it watches instead. Every three.js slot, whatever its idiom, ends up
// calling WebGLRenderer.prototype.render(scene, camera) with a
// PerspectiveCamera — directly, or through an EffectComposer's RenderPass.
// This wraps that one method, and when the renderer doing the call is drawing
// into a canvas inside #parliament-stage, it notes the scene and the camera.
// The call itself is passed through untouched: the slot renders exactly as it
// did, and the dome reads the same scene graph from its own renderer.
//
// What is noted alongside the scene is what the dome needs to look like the
// slot: its clear colour (most slots paint their background with
// setClearColor, not scene.background) and its tone mapping.

import * as THREE from "three";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { AfterimagePass } from "three/examples/jsm/postprocessing/AfterimagePass.js";

export type CapturedView = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  clearColor: THREE.Color;
  clearAlpha: number;
  toneMapping: THREE.ToneMapping;
  exposure: number;
  /** Whether the slot's renderer encodes its output as sRGB (the default). */
  outputSRGB: boolean;
  /**
   * The scene was drawn into a render target, i.e. through an EffectComposer.
   * Every composer slot here ends on a pass straight to the screen with no
   * OutputPass, so what the audience sees is linear light shown as display
   * values — no sRGB encoding. The dome must do the same or it reads washed out.
   */
  intoTarget: boolean;
  /** The canvas it was drawn into: once that leaves the stage, the slot is gone. */
  canvas: HTMLCanvasElement;
  /** performance.now() of the last render call seen for this scene. */
  at: number;
};

/** A capture older than this means the slot stopped rendering (or is 2-D). */
export const CAPTURE_STALE_MS = 500;

let _installed = false;
let _stage: HTMLElement | null = null;
const _ignore = new WeakSet<THREE.WebGLRenderer>();
// Several scenes can be rendered per frame (a background pass, an overlay);
// keep each one's latest sighting and pick the most substantial at read time.
const _seen = new Map<THREE.Scene, CapturedView>();

// Which context each canvas was given, as the page asked for it. The dome
// needs to know which stage canvases are 2-D (or raw WebGL, like the camera's
// CRT) to show them as a flat panel, and it must not find out by asking:
// getContext("2d") on a canvas nobody has claimed yet CLAIMS it, and the slot
// that created it then gets null for its own "webgl" (that broke slot C
// whenever the dome was open while it mounted).
const _ctxType = new WeakMap<HTMLCanvasElement, "2d" | "webgl">();
// three.js canvases are shown through their scene, never as a panel.
const _threeCanvases = new WeakSet<HTMLCanvasElement>();

/**
 * How a stage canvas can feed the dome's flat panel: "2d" or "webgl" for a
 * canvas drawn by hand (p5, a 2-D sketch, a raw WebGL pass), null for a
 * three.js canvas or one that has no context yet.
 */
export function panelKind(c: HTMLCanvasElement): "2d" | "webgl" | null {
  if (_threeCanvases.has(c)) return null;
  return _ctxType.get(c) ?? null;
}

/** Renderers that must never be captured — the dome's own. */
export function ignoreRenderer(r: THREE.WebGLRenderer) { _ignore.add(r); }

function note(renderer: any, scene: any, camera: any) {
    try {
      if (camera && camera.isPerspectiveCamera && scene && scene.isScene
          && !_ignore.has(renderer) && _stage && _stage.contains(renderer.domElement)) {
        const prev = _seen.get(scene);
        const v: CapturedView = prev ?? {
          scene, camera, clearColor: new THREE.Color(), clearAlpha: 1,
          toneMapping: THREE.NoToneMapping, exposure: 1, outputSRGB: true, intoTarget: false, at: 0,
          canvas: renderer.domElement,
        };
        v.canvas = renderer.domElement;
        v.camera = camera;
        renderer.getClearColor(v.clearColor);
        v.clearAlpha = renderer.getClearAlpha();
        v.toneMapping = renderer.toneMapping;
        v.exposure = renderer.toneMappingExposure;
        v.outputSRGB = renderer.outputColorSpace === THREE.SRGBColorSpace;
        v.intoTarget = renderer.getRenderTarget() !== null;
        v.at = performance.now();
        if (!prev) _seen.set(scene, v);
      }
    } catch { /* capture must never break a slot's own render */ }
}

// ── The slot's post-processing ─────────────────────────────────────────────
// Bloom and afterimage are passes of the slot's own EffectComposer, applied to
// its flat frame: the dome's cube camera never sees them. Their settings are
// read here, as the slot's composer runs them, and the domemaster applies the
// same two passes to the fisheye. Chromatic aberration and film grain are
// screen-space effects of a flat lens and are deliberately not carried over.
export type CapturedPost = {
  bloom: { strength: number; radius: number; threshold: number; at: number } | null;
  afterimage: { damp: number; at: number } | null;
};
const _post: CapturedPost = { bloom: null, afterimage: null };

function onStage(renderer: any): boolean {
  return !!(_stage && renderer && !_ignore.has(renderer) && _stage.contains(renderer.domElement));
}

/** The slot's bloom and afterimage, if its composer ran them recently. */
export function currentPost(): CapturedPost {
  const now = performance.now();
  return {
    bloom: _post.bloom && now - _post.bloom.at < CAPTURE_STALE_MS ? _post.bloom : null,
    afterimage: _post.afterimage && now - _post.afterimage.at < CAPTURE_STALE_MS ? _post.afterimage : null,
  };
}

// ── 2-D layers a slot puts over its WebGL canvas ───────────────────────────
// A canvas composited over the scene in the page (the constellation field,
// the ticker) is invisible to the cube camera. Such a canvas registers itself
// with how it belongs on a dome:
//   "sky"   the whole hemisphere — laid over the domemaster like a star chart
//   "band"  a strip low around the front, where a reader's eye rests
// and the domemaster composites it as the page does ("screen", or "over").
export type DomeLayerMode = "sky" | "band";
export type DomeLayer = { canvas: HTMLCanvasElement; mode: DomeLayerMode; blend: "screen" | "over" };
const _layers = new Set<DomeLayer>();

/** Declare a 2-D canvas as part of the slot's image on the dome. Returns an unregister function. */
export function registerDomeLayer(canvas: HTMLCanvasElement, opts: { mode: DomeLayerMode; blend?: "screen" | "over" }): () => void {
  const layer: DomeLayer = { canvas, mode: opts.mode, blend: opts.blend ?? "screen" };
  _layers.add(layer);
  return () => { _layers.delete(layer); };
}

/** The registered layers still on the stage. */
export function currentLayers(): DomeLayer[] {
  const out: DomeLayer[] = [];
  for (const l of _layers) {
    if (!l.canvas.isConnected) { _layers.delete(l); continue; }
    if (_stage && _stage.contains(l.canvas) && l.canvas.width > 0 && l.canvas.height > 0) out.push(l);
  }
  return out;
}

export function installDomeCapture(stage: HTMLElement) {
  _stage = stage;
  if (_installed) return;
  _installed = true;

  // Post passes are ordinary prototype methods, so a plain wrapper does.
  const bloomRender = UnrealBloomPass.prototype.render;
  UnrealBloomPass.prototype.render = function (this: UnrealBloomPass, renderer: any, ...rest: any[]) {
    try {
      if (onStage(renderer) && this.enabled) {
        _post.bloom = { strength: this.strength, radius: this.radius, threshold: this.threshold, at: performance.now() };
      }
    } catch { /* never cost the slot its frame */ }
    return (bloomRender as any).call(this, renderer, ...rest);
  };
  const afterRender = AfterimagePass.prototype.render;
  AfterimagePass.prototype.render = function (this: AfterimagePass, renderer: any, ...rest: any[]) {
    try {
      if (onStage(renderer) && this.enabled) {
        _post.afterimage = { damp: (this as any).uniforms?.damp?.value ?? 0.96, at: performance.now() };
      }
    } catch { /* never cost the slot its frame */ }
    return (afterRender as any).call(this, renderer, ...rest);
  };

  // three r159 does NOT put render() on the prototype: the constructor
  // assigns it, `this.render = function (scene, camera) {…}`, so wrapping
  // WebGLRenderer.prototype.render catches nothing (tried; every slot read
  // "sin imagen"). An accessor on the prototype turns that assignment into a
  // hook instead — assigning to an inherited setter calls the setter — and
  // the setter installs a wrapped render() as the renderer's own property.
  // Every renderer constructed after this point is covered, whatever module
  // made it; nothing already built is touched.
  const canvasProto = HTMLCanvasElement.prototype as any;
  const getContext = canvasProto.getContext;
  canvasProto.getContext = function (this: HTMLCanvasElement, type: string, ...rest: any[]) {
    const ctx = getContext.call(this, type, ...rest);
    if (ctx && !_ctxType.has(this)) _ctxType.set(this, type === "2d" ? "2d" : "webgl");
    return ctx;
  };

  const proto = THREE.WebGLRenderer.prototype as any;
  Object.defineProperty(proto, "render", {
    configurable: true,
    get() { return undefined; },
    set(fn: (scene: any, camera: any) => void) {
      const renderer = this;
      // domElement is assigned at the top of the constructor, render() far below.
      if (renderer.domElement) _threeCanvases.add(renderer.domElement);
      Object.defineProperty(renderer, "render", {
        configurable: true, writable: true,
        value: function (scene: any, camera: any) {
          note(renderer, scene, camera);
          return fn.call(this, scene, camera);
        },
      });
    },
  });
}

/**
 * The scene the stage is showing, or null if no 3-D scene rendered recently
 * (a p5 or 2-D canvas slot, or a switch in progress). Among fresh scenes the
 * one with the most objects wins — a slot's world, not its HUD overlay.
 */
export function currentView(): CapturedView | null {
  const now = performance.now();
  let best: CapturedView | null = null;
  let bestN = -1;
  for (const [scene, v] of _seen) {
    // A slot being switched away is torn down within the same tick its
    // canvas leaves the stage — and a torn-down slot may already have
    // dismantled its camera. Drop it at once rather than after the staleness
    // window, which is exactly long enough to render a half-destroyed scene.
    if (!_stage || !_stage.contains(v.canvas)) { _seen.delete(scene); continue; }
    if (now - v.at > CAPTURE_STALE_MS) {
      // Forget scenes of slots that were switched away: holding them would
      // keep a destroyed slot's whole graph alive.
      if (now - v.at > 5000) _seen.delete(scene);
      continue;
    }
    let n = 0;
    scene.traverse(() => { n++; });
    if (n > bestN) { best = v; bestN = n; }
  }
  return best;
}
