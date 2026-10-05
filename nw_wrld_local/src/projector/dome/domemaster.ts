// domemaster.ts — a slot's scene as a planetarium dome sees it
// ===========================================================================
// A dome is fed a DOMEMASTER: the whole hemisphere as one square image, the
// zenith at the centre, the horizon on the rim of an inscribed circle, and the
// radius linear in angle (equidistant fisheye). 4096 × 4096 is the usual 4K
// deliverable; 2048 is the fallback. The planetarium's own software warps and
// blends it across its projectors — the domemaster is all it asks for.
//
// Pipeline, all on the dome's own WebGLRenderer:
//
//   slot scene ──CubeCamera──► sceneCube ─┐
//                                          ├─ fisheye pass ─► domeRT (N × N)
//   overlay (text, 2-D panel) ─CubeCamera─► overlayCube ─┘        │
//                                                                  ├─► screen: domemaster (+ guides)
//                                                                  └─► screen: dome simulation
//
// The cube is rendered from the slot camera's position; the dome's
// orientation comes from the camera's orientation. What the slot camera LOOKS
// AT becomes the front of the dome, raised to `frontElevation` above the
// horizon — the height at which an audience in reclined seats actually looks.
//
// Domemaster convention: front at the BOTTOM of the circle, and the audience's
// right on the image's right (face the front, tip your head back: the front
// slides to the bottom of your view and right stays right).
//
// domeRT holds display-ready pixels — tone-mapped and sRGB-encoded in the
// fisheye pass — so what the screen shows is exactly what an exporter
// (Syphon, NDI, a recorder) would read back from it.

import * as THREE from "three";
import type { CapturedView } from "./domeCapture";
import { ignoreRenderer } from "./domeCapture";

const DEG = Math.PI / 180;

export type DomeParams = {
  /** Output size of the domemaster, px (square). */
  size: 2048 | 4096;
  /** Full fisheye aperture, degrees. 180 = a hemisphere. */
  aperture: number;
  /** Elevation above the horizon where the slot camera's forward lands. */
  frontElevation: number;
  /** Dome-native text: on/off, cap height in degrees, its elevation. */
  showText: boolean;
  textDeg: number;
  textElevation: number;
  /** Angular width of the flat panel used for 2-D slots. */
  panelDeg: number;
  /**
   * 0–0.95: how far the dome camera moves from the slot camera toward the
   * middle of the scene. A slot camera frames its world for a flat screen, so
   * from its own position the world fills a small patch of the dome; moving
   * in puts the audience inside it instead of in front of it.
   */
  immersion: number;
  /** Simulation only: forward tilt of the dome. */
  tilt: number;
};

export const DEFAULT_PARAMS: DomeParams = {
  size: 2048,
  aperture: 180,
  frontElevation: 30,
  showText: true,
  textDeg: 2.5,
  textElevation: 12,
  panelDeg: 90,
  immersion: 0.5,
  tilt: 0,
};

// ── Shaders ─────────────────────────────────────────────────────────────────

const QUAD_VS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FISHEYE_FS = /* glsl */ `
uniform samplerCube tScene;
uniform samplerCube tOver;
uniform float hasScene;
uniform vec3 uZen;
uniform vec3 uFront;
uniform vec3 uRight;
uniform float uHalfAperture;   // radians, centre → rim
uniform int uTone;             // three.js ToneMapping enum
uniform float uExposure;
uniform float uSRGB;
uniform float uSize;
varying vec2 vUv;

vec3 RRTAndODTFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 acesFilmic(vec3 c) {
  const mat3 IN = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 OUT = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  c *= uExposure / 0.6;
  return clamp(OUT * RRTAndODTFit(IN * c), 0.0, 1.0);
}
vec3 toneMap(vec3 c) {
  if (uTone == 1) return clamp(c * uExposure, 0.0, 1.0);                  // Linear
  if (uTone == 2) { c *= uExposure; return clamp(c / (vec3(1.0) + c), 0.0, 1.0); } // Reinhard
  if (uTone == 4) return acesFilmic(c);                                   // ACESFilmic
  return c;                                                               // None (and the rest)
}
vec3 linearToSRGB(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(pow(c, vec3(1.0 / 2.4)) * 1.055 - 0.055, c * 12.92, step(c, vec3(0.0031308)));
}

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  float phi = r * uHalfAperture;          // angle from the zenith
  float a = atan(p.x, -p.y);              // 0 = front (bottom), +pi/2 = right
  vec3 hor = cos(a) * uFront + sin(a) * uRight;
  vec3 dir = normalize(cos(phi) * uZen + sin(phi) * hor);

  vec3 col = hasScene > 0.5 ? toneMap(textureCube(tScene, dir).rgb) : vec3(0.0);
  // The overlay cube holds PREMULTIPLIED colour: three's normal blending onto a
  // transparent clear writes rgb·a into the buffer. Composite it as such, or
  // every text edge gets a dark fringe.
  vec4 ov = textureCube(tOver, dir);
  col = col * (1.0 - clamp(ov.a, 0.0, 1.0)) + ov.rgb;
  if (uSRGB > 0.5) col = linearToSRGB(col);
  // Anti-aliased rim: one output pixel of fade instead of a stair-stepped edge.
  col *= 1.0 - smoothstep(1.0 - 2.0 / uSize, 1.0, r);
  gl_FragColor = vec4(col, 1.0);
}
`;

// Draws domeRT into the screen viewport, letterboxed to a centred square,
// with optional guides: elevation rings every 15° and a front tick.
const DISPLAY_FS = /* glsl */ `
uniform sampler2D tDome;
uniform vec2 uView;            // viewport px
uniform float uGuides;
uniform float uHalfAperture;
varying vec2 vUv;
void main() {
  vec2 px = vUv * uView;
  float side = min(uView.x, uView.y);
  vec2 o = (uView - vec2(side)) * 0.5;
  vec2 q = (px - o) / side;                 // 0..1 inside the square
  if (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  vec3 col = texture2D(tDome, q).rgb;
  if (uGuides > 0.5) {
    vec2 p = q * 2.0 - 1.0;
    float r = length(p);
    float w = 1.5 / side;                   // ~1.5 px line
    float g = 0.0;
    for (int k = 0; k <= 6; k++) {          // elevation 0, 15 … 90 (zenith)
      float el = float(k) * 15.0;
      float rk = (90.0 - el) * 0.017453292 / uHalfAperture;
      g = max(g, 1.0 - smoothstep(0.0, w * 2.0, abs(r - rk)));
    }
    // front tick: a short radial line at the bottom of the rim
    if (abs(p.x) < w * 1.5 && p.y < -0.9 && r <= 1.0) g = 1.0;
    col = mix(col, vec3(1.0, 0.533, 0.0), g * 0.55);
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

// The live output's copy of the domemaster, flipped so that a readback (which
// WebGL returns bottom row first) comes out top row first, as NDI wants it.
const FLIP_FS = /* glsl */ `
uniform sampler2D tDome;
varying vec2 vUv;
void main() { gl_FragColor = vec4(texture2D(tDome, vec2(vUv.x, 1.0 - vUv.y)).rgb, 1.0); }
`;

// The inside of the dome, textured with the domemaster. The hemisphere is in
// dome-local coordinates: +Y the zenith, -Z the front, +X the right.
const SIM_VS = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const SIM_FS = /* glsl */ `
uniform sampler2D tDome;
uniform float uHalfAperture;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float phi = acos(clamp(d.y, -1.0, 1.0));
  if (phi > uHalfAperture) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  float a = atan(d.x, -d.z);
  float r = phi / uHalfAperture;
  vec2 uv = 0.5 + 0.5 * vec2(r * sin(a), -r * cos(a));
  vec3 col = texture2D(tDome, uv).rgb;
  // the spring line, faintly, so the edge of the dome reads in the preview
  col = mix(col, vec3(0.4, 0.2, 0.0), 1.0 - smoothstep(0.0, 0.004, uHalfAperture - phi));
  gl_FragColor = vec4(col, 1.0);
}
`;

// ── Helpers ─────────────────────────────────────────────────────────────────

function quad(material: THREE.ShaderMaterial): THREE.Scene {
  const s = new THREE.Scene();
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  m.frustumCulled = false;
  s.add(m);
  return s;
}

/** Text on a transparent canvas: bold, white, with a dark outline so it holds on any image. */
function drawTextCanvas(canvas: HTMLCanvasElement, text: string, fontPx: number) {
  const ctx = canvas.getContext("2d")!;
  const font = `600 ${fontPx}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  ctx.font = font;
  const w = Math.max(8, Math.ceil(ctx.measureText(text).width + fontPx));
  const h = Math.ceil(fontPx * 1.6);
  canvas.width = w; canvas.height = h;
  ctx.font = font;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(2, fontPx * 0.14);
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.strokeText(text, w / 2, h / 2);
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.fillText(text, w / 2, h / 2);
}

// ── The domemaster ──────────────────────────────────────────────────────────

export class Domemaster {
  readonly renderer: THREE.WebGLRenderer;
  params: DomeParams;

  private sceneCube!: THREE.WebGLCubeRenderTarget;
  private overCube!: THREE.WebGLCubeRenderTarget;
  private sceneCam!: THREE.CubeCamera;
  private overCam!: THREE.CubeCamera;
  private domeRT!: THREE.WebGLRenderTarget;
  private builtSize = 0;

  private fisheyeMat: THREE.ShaderMaterial;
  private fisheyeScene: THREE.Scene;
  private displayMat: THREE.ShaderMaterial;
  private displayScene: THREE.Scene;
  private simMat: THREE.ShaderMaterial;
  private simScene: THREE.Scene;
  private simDome: THREE.Mesh;
  readonly simCamera: THREE.PerspectiveCamera;
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // live output: flipped copy + pixel-pack buffers read back a frame or two late
  private outRT: THREE.WebGLRenderTarget | null = null;
  private flipMat: THREE.ShaderMaterial;
  private flipScene: THREE.Scene;
  private pbos: { buf: WebGLBuffer; fence: WebGLSync | null; size: number }[] = [];
  private pboNext = 0;

  // overlay: dome-native text + a flat panel for 2-D slots
  private overScene = new THREE.Scene();
  private textCanvas = document.createElement("canvas");
  private textTex: THREE.CanvasTexture;
  private textMesh: THREE.Mesh;
  private textValue = "";
  private textFontPx = 0;
  private panelTex: THREE.CanvasTexture | null = null;
  private panelMesh: THREE.Mesh;
  private panelSource: HTMLCanvasElement | null = null;
  private panelKey = "";

  // dome basis in world space (from the slot camera, or a default)
  private zen = new THREE.Vector3(0, 1, 0);
  private front = new THREE.Vector3(0, 0, -1);
  private right = new THREE.Vector3(1, 0, 0);

  constructor(canvas: HTMLCanvasElement, params: DomeParams) {
    this.params = { ...params };
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
    this.renderer.autoClear = true;
    ignoreRenderer(this.renderer);

    this.fisheyeMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VS, fragmentShader: FISHEYE_FS, depthTest: false, depthWrite: false,
      uniforms: {
        tScene: { value: null }, tOver: { value: null }, hasScene: { value: 0 },
        uZen: { value: this.zen }, uFront: { value: this.front }, uRight: { value: this.right },
        uHalfAperture: { value: 90 * DEG }, uTone: { value: 0 }, uExposure: { value: 1 },
        uSRGB: { value: 1 }, uSize: { value: 2048 },
      },
    });
    this.fisheyeScene = quad(this.fisheyeMat);

    this.displayMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VS, fragmentShader: DISPLAY_FS, depthTest: false, depthWrite: false,
      uniforms: {
        tDome: { value: null }, uView: { value: new THREE.Vector2(1, 1) },
        uGuides: { value: 1 }, uHalfAperture: { value: 90 * DEG },
      },
    });
    this.displayScene = quad(this.displayMat);

    this.flipMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VS, fragmentShader: FLIP_FS, depthTest: false, depthWrite: false,
      uniforms: { tDome: { value: null } },
    });
    this.flipScene = quad(this.flipMat);

    this.simMat = new THREE.ShaderMaterial({
      vertexShader: SIM_VS, fragmentShader: SIM_FS, side: THREE.BackSide,
      uniforms: { tDome: { value: null }, uHalfAperture: { value: 90 * DEG } },
    });
    this.simScene = new THREE.Scene();
    this.simDome = new THREE.Mesh(new THREE.SphereGeometry(10, 128, 64), this.simMat);
    this.simScene.add(this.simDome);
    this.simCamera = new THREE.PerspectiveCamera(100, 1, 0.1, 100);

    this.textTex = new THREE.CanvasTexture(this.textCanvas);
    this.textTex.colorSpace = THREE.SRGBColorSpace;
    this.textMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: this.textTex, transparent: true, depthTest: false, depthWrite: false }),
    );
    this.panelMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ transparent: false, depthTest: false, depthWrite: false }),
    );
    this.panelMesh.renderOrder = 0;
    this.textMesh.renderOrder = 1;
    this.overScene.add(this.panelMesh, this.textMesh);

    this.build();
  }

  /** (Re)allocate the targets for the current output size. */
  private build() {
    const N = this.params.size;
    if (this.builtSize === N) return;
    this.sceneCube?.dispose(); this.overCube?.dispose(); this.domeRT?.dispose();
    // A cube face spans 90°; the domemaster spends N/2 px on 90° of radius.
    const face = N / 2;
    this.sceneCube = new THREE.WebGLCubeRenderTarget(face, {
      type: THREE.HalfFloatType, generateMipmaps: false, minFilter: THREE.LinearFilter,
    });
    this.overCube = new THREE.WebGLCubeRenderTarget(face, {
      type: THREE.UnsignedByteType, generateMipmaps: false, minFilter: THREE.LinearFilter,
    });
    this.sceneCam = new THREE.CubeCamera(0.1, 1000, this.sceneCube);
    this.overCam = new THREE.CubeCamera(0.1, 100, this.overCube);
    this.domeRT = new THREE.WebGLRenderTarget(N, N, {
      type: THREE.UnsignedByteType, generateMipmaps: false, minFilter: THREE.LinearFilter,
      depthBuffer: false,
    });
    this.fisheyeMat.uniforms.tScene.value = this.sceneCube.texture;
    this.fisheyeMat.uniforms.tOver.value = this.overCube.texture;
    this.fisheyeMat.uniforms.uSize.value = N;
    this.displayMat.uniforms.tDome.value = this.domeRT.texture;
    this.simMat.uniforms.tDome.value = this.domeRT.texture;
    this.flipMat.uniforms.tDome.value = this.domeRT.texture;
    this.disposeOutput();   // sized to the domemaster; rebuilt on the next readback
    this.builtSize = N;
  }

  setParams(p: Partial<DomeParams>) {
    this.params = { ...this.params, ...p };
    this.build();
  }

  /** Direction in world space for an azimuth / elevation on the dome, degrees. */
  private dirAt(azDeg: number, elDeg: number, out: THREE.Vector3) {
    const az = azDeg * DEG, el = elDeg * DEG;
    return out.copy(this.front).multiplyScalar(Math.cos(az))
      .addScaledVector(this.right, Math.sin(az))
      .multiplyScalar(Math.cos(el))
      .addScaledVector(this.zen, Math.sin(el))
      .normalize();
  }

  /** Point `mesh` at the dome origin from azimuth/elevation, sized by angles. */
  private place(mesh: THREE.Mesh, azDeg: number, elDeg: number, wDeg: number, aspect: number) {
    const R = 10;
    const pos = this.dirAt(azDeg, elDeg, new THREE.Vector3()).multiplyScalar(R);
    const w = 2 * R * Math.tan(Math.min(170, wDeg) * DEG / 2);
    mesh.position.copy(pos);
    mesh.scale.set(w, w / Math.max(0.01, aspect), 1);
    mesh.up.copy(this.zen);
    mesh.lookAt(0, 0, 0);
    mesh.updateMatrixWorld();
  }

  // Camera pose is read from matrixWorld as the slot's own last render left
  // it — never recomputed here. Recomputing (updateMatrixWorld,
  // getWorldQuaternion) walks the slot's scene graph, and a slot mid-teardown
  // may already have dismantled it: that threw on every frame of a switch.
  private _pos = new THREE.Vector3();
  private _quat = new THREE.Quaternion();
  private _scl = new THREE.Vector3();

  // Middle of each scene, for immersion. Bounds walk the whole graph, so they
  // are refreshed at most every 2 s per scene — worlds drift, they don't jump.
  private centres = new WeakMap<THREE.Scene, { c: THREE.Vector3; at: number }>();
  private sceneCentre(scene: THREE.Scene): THREE.Vector3 | null {
    const now = performance.now();
    const hit = this.centres.get(scene);
    if (hit && now - hit.at < 2000) return hit.c;
    try {
      const box = new THREE.Box3().setFromObject(scene);
      if (box.isEmpty()) return null;
      const c = box.getCenter(new THREE.Vector3());
      if (![c.x, c.y, c.z].every(Number.isFinite)) return null;
      this.centres.set(scene, { c, at: now });
      return c;
    } catch { return null; }
  }

  private setBasisFrom(camera: THREE.PerspectiveCamera | null) {
    const f = new THREE.Vector3(0, 0, -1), u = new THREE.Vector3(0, 1, 0), r = new THREE.Vector3(1, 0, 0);
    if (camera) {
      camera.matrixWorld.decompose(this._pos, this._quat, this._scl);
      f.applyQuaternion(this._quat); u.applyQuaternion(this._quat); r.applyQuaternion(this._quat);
    }
    // The camera's forward lands at frontElevation: the zenith is forward
    // tipped back by (90° − e) toward the camera's up.
    const e = this.params.frontElevation * DEG;
    const t = Math.PI / 2 - e;
    this.zen.copy(f).multiplyScalar(Math.cos(t)).addScaledVector(u, Math.sin(t)).normalize();
    this.front.copy(f).multiplyScalar(Math.cos(e)).addScaledVector(u, -Math.sin(e)).normalize();
    this.right.copy(r).normalize();
  }

  /**
   * Render one domemaster frame into domeRT.
   * `view`: the slot's captured 3-D scene, or null for a 2-D slot.
   * `panel`: the slot's 2-D canvas when there is no 3-D scene.
   * `title`: the dome-native text line.
   */
  renderFrame(view: CapturedView | null, panel: HTMLCanvasElement | null, title: string) {
    const R = this.renderer;
    const P = this.params;
    this.setBasisFrom(view ? view.camera : null);

    // 1. the slot's scene into the cube, from the slot camera's position
    if (view) {
      const cam = view.camera;
      this.sceneCam.position.copy(this._pos);          // from setBasisFrom's decompose
      // Immersion: slide along the camera's line of sight toward the scene's
      // middle — only forward, and never past it.
      const centre = P.immersion > 0 ? this.sceneCentre(view.scene) : null;
      if (centre) {
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this._quat);
        const d = centre.clone().sub(this._pos).dot(fwd);
        if (d > 0) this.sceneCam.position.addScaledVector(fwd, d * Math.min(0.95, P.immersion));
      }
      for (const c of this.sceneCam.children as THREE.PerspectiveCamera[]) {
        if (c.near !== cam.near || c.far !== cam.far) { c.near = cam.near; c.far = cam.far; c.updateProjectionMatrix(); }
        c.layers.mask = cam.layers.mask;
      }
      this.sceneCam.updateMatrixWorld();
      R.setClearColor(view.clearColor, 1);
      this.sceneCam.update(R, view.scene);
    }

    // 2. the overlay: text, and the panel when there is no 3-D scene
    if (P.showText && title) {
      const fontPx = Math.round(this.params.size / 32);
      if (title !== this.textValue || fontPx !== this.textFontPx) {
        drawTextCanvas(this.textCanvas, title, fontPx);
        this.textTex.dispose();                         // new canvas size → new GPU texture
        this.textTex.needsUpdate = true;
        this.textValue = title; this.textFontPx = fontPx;
      }
      // The canvas is 1.6 × the font size tall and cap height is ~0.72 of it:
      // scale so the capitals subtend textDeg degrees.
      const aspect = this.textCanvas.width / this.textCanvas.height;
      const hDeg = P.textDeg * (this.textCanvas.height / (0.72 * fontPx));
      this.place(this.textMesh, 0, P.textElevation, hDeg * aspect, aspect);
      this.textMesh.visible = true;
    } else {
      this.textMesh.visible = false;
    }

    if (!view && panel && panel.width > 0 && panel.height > 0) {
      // A new canvas, or the same one resized (p5 does on window resize):
      // three allocates texture storage once, so a size change needs a new one.
      const key = `${panel.width}x${panel.height}`;
      if (this.panelSource !== panel || this.panelKey !== key) {
        this.panelKey = key;
        this.panelTex?.dispose();
        this.panelTex = new THREE.CanvasTexture(panel);
        this.panelTex.colorSpace = THREE.SRGBColorSpace;
        (this.panelMesh.material as THREE.MeshBasicMaterial).map = this.panelTex;
        (this.panelMesh.material as THREE.MeshBasicMaterial).needsUpdate = true;
        this.panelSource = panel;
      }
      this.panelTex!.needsUpdate = true;
      this.place(this.panelMesh, 0, P.frontElevation, P.panelDeg, panel.width / panel.height);
      this.panelMesh.visible = true;
    } else {
      this.panelMesh.visible = false;
    }

    R.setClearColor(0x000000, 0);
    this.overCam.position.set(0, 0, 0);
    this.overCam.updateMatrixWorld();
    this.overCam.update(R, this.overScene);

    // 3. fisheye into the domemaster
    const u = this.fisheyeMat.uniforms;
    u.hasScene.value = view ? 1 : 0;
    u.uHalfAperture.value = (P.aperture / 2) * DEG;
    u.uTone.value = view ? view.toneMapping : 0;
    u.uExposure.value = view ? view.exposure : 1;
    u.uSRGB.value = !view || view.outputSRGB ? 1 : 0;
    R.setRenderTarget(this.domeRT);
    R.setClearColor(0x000000, 1);
    R.render(this.fisheyeScene, this.quadCam);
    R.setRenderTarget(null);
  }

  /** Show the domemaster in the screen canvas (letterboxed square). */
  presentMaster(guides: boolean) {
    const R = this.renderer;
    const sz = R.getDrawingBufferSize(new THREE.Vector2());
    this.displayMat.uniforms.uView.value.copy(sz);
    this.displayMat.uniforms.uGuides.value = guides ? 1 : 0;
    this.displayMat.uniforms.uHalfAperture.value = (this.params.aperture / 2) * DEG;
    R.setRenderTarget(null);
    R.render(this.displayScene, this.quadCam);
  }

  /** Show the dome from inside, looking along yaw/pitch (degrees). */
  presentSim(yawDeg: number, pitchDeg: number, fovDeg: number) {
    const R = this.renderer;
    const sz = R.getSize(new THREE.Vector2());
    this.simMat.uniforms.uHalfAperture.value = (this.params.aperture / 2) * DEG;
    // Tilt: the dome leans forward, lowering its front edge toward the audience.
    this.simDome.rotation.set(-this.params.tilt * DEG, 0, 0);
    const cam = this.simCamera;
    cam.aspect = sz.x / Math.max(1, sz.y);
    cam.fov = fovDeg;
    cam.updateProjectionMatrix();
    cam.position.set(0, 0, 0);
    cam.rotation.set(0, 0, 0, "YXZ");
    cam.rotation.y = -yawDeg * DEG;
    cam.rotation.x = pitchDeg * DEG;
    R.setRenderTarget(null);
    R.setClearColor(0x000000, 1);
    R.render(this.simScene, cam);
  }

  /** Read the current domemaster back (RGBA8, bottom-up rows) — for exporters. */
  readPixels(): { width: number; height: number; data: Uint8Array } {
    const N = this.params.size;
    const data = new Uint8Array(N * N * 4);
    this.renderer.readRenderTargetPixels(this.domeRT, 0, 0, N, N, data);
    return { width: N, height: N, data };
  }

  /** Same, into a caller's buffer (length N·N·4) — no allocation per frame. */
  readPixelsInto(data: Uint8Array) {
    const N = this.params.size;
    this.renderer.readRenderTargetPixels(this.domeRT, 0, 0, N, N, data);
  }

  // ── Live output (NDI) ───────────────────────────────────────────────────
  // readPixels straight from domeRT stalls the page until the GPU has drawn
  // the frame and copied it back: ~50 ms at 2048 on the M5, the whole frame
  // budget. Instead each frame is flipped into outRT and read into one of
  // three pixel-pack buffers with a fence; collectOutput() takes the oldest
  // one once its fence has passed. The GPU works while the page goes on, and
  // the output runs a frame or two behind the screen.

  private gl2(): WebGL2RenderingContext | null {
    const gl = this.renderer.getContext();
    return typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext ? gl : null;
  }

  /** Queue the current domemaster for readback. False if every buffer is still in flight. */
  beginOutput(): boolean {
    const gl = this.gl2();
    if (!gl) return false;
    const N = this.params.size;
    const bytes = N * N * 4;
    if (!this.outRT) {
      this.outRT = new THREE.WebGLRenderTarget(N, N, {
        type: THREE.UnsignedByteType, generateMipmaps: false, depthBuffer: false,
      });
    }
    if (this.pbos.length === 0) {
      for (let i = 0; i < 3; i++) {
        const buf = gl.createBuffer()!;
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buf);
        gl.bufferData(gl.PIXEL_PACK_BUFFER, bytes, gl.STREAM_READ);
        this.pbos.push({ buf, fence: null, size: bytes });
      }
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    }
    const slot = this.pbos[this.pboNext];
    if (slot.fence) return false;              // the oldest has not been collected: drop this frame

    const R = this.renderer;
    R.setRenderTarget(this.outRT);
    R.render(this.flipScene, this.quadCam);    // leaves outRT bound for the read
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, slot.buf);
    gl.readPixels(0, 0, N, N, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    R.setRenderTarget(null);
    slot.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    this.pboNext = (this.pboNext + 1) % this.pbos.length;
    return true;
  }

  /**
   * Copy the oldest finished readback into `dst` (N·N·4 bytes, RGBA, top row
   * first). False when none is ready yet — never waits.
   */
  collectOutput(dst: Uint8Array): boolean {
    const gl = this.gl2();
    if (!gl || this.pbos.length === 0) return false;
    // the oldest in flight is the one after the newest, going round
    for (let k = 0; k < this.pbos.length; k++) {
      const slot = this.pbos[(this.pboNext + k) % this.pbos.length];
      if (!slot.fence) continue;
      const st = gl.clientWaitSync(slot.fence, 0, 0);
      if (st === gl.TIMEOUT_EXPIRED) return false;
      gl.deleteSync(slot.fence);
      slot.fence = null;
      if (st === gl.WAIT_FAILED || dst.length !== slot.size) return false;
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, slot.buf);
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, dst);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      return true;
    }
    return false;
  }

  /** Free the output targets (size change, output off). */
  disposeOutput() {
    const gl = this.gl2();
    if (gl) {
      for (const p of this.pbos) { if (p.fence) gl.deleteSync(p.fence); gl.deleteBuffer(p.buf); }
    }
    this.pbos = [];
    this.pboNext = 0;
    this.outRT?.dispose();
    this.outRT = null;
  }

  dispose() {
    this.disposeOutput();
    this.flipMat.dispose();
    this.sceneCube.dispose(); this.overCube.dispose(); this.domeRT.dispose();
    this.textTex.dispose(); this.panelTex?.dispose();
    this.fisheyeMat.dispose(); this.displayMat.dispose(); this.simMat.dispose();
    this.renderer.dispose();
  }
}
