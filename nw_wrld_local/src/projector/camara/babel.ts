// babel.ts — slot C's dome world: the visual register as the Library of Babel
// ===========================================================================
// "El universo (que otros llaman la Biblioteca) se compone de un número
// indefinido, y tal vez infinito, de galerías hexagonales, con vastos pozos de
// ventilación en el medio, cercados por barandas bajísimas." — Borges.
//
// The dome is the bottom of one of those shafts. The audience sits at its
// foot; the zenith is the shaft going up for ever. Round it the hexagonal
// galleries stack upward and dim into fog — four walls of shelves each, two
// sides open onto the corridors, a low railing round the shaft, two lamps.
// The galleries sink past the seat without end (one every twelve seconds),
// so the library is always being climbed and never arrives.
//
// The books are the whole visual register, from two atlases cut by
// tools/build_babel.py: the 30 camera-trap captures, shelved again and again
// among the 612 AudioMoth spectrograms, each with its day and what it is
// printed under it — a finite register repeated into an indefinite one, which
// is the Library's own arithmetic. And down the shaft the loose ones fall, in
// the manner of Marc Lee's streams: small and dim at the zenith, turning as
// they come, large as they pass overhead, gone at the railing.
//
// EVERY GALLERY TURNS ON ITS OWN. Each ring has its own rate and its own
// sense, chosen at random, and reverses at random every half-minute to two
// minutes, easing through a stop as a heavy thing does — so neighbouring
// floors shear past each other and the shaft never repeats a configuration.
// What the room is doing sets how much:
//   ROTATION SPD and idle   the same gate every module drifts under: calm
//                           while someone is operating the instrument
//   the sound               the engine's level stirs the rings (normalised
//                           against its own recent peak, as every slot reads it)
//   inmersión (dome bar)    the deeper in, the closer the walls stand and the
//                           more they move
//   a vote                  the Chamber deciding reshuffles the Library: every
//                           ring reverses at once
//
// The footage itself is not here. It stays on the curved screen the dome lays
// along its rim (domemaster.ts, a "screen" layer drawn over this scene).
//
// Built once the dome runs, rendered only while it does: the canvas below is
// 2×2 and never seen — the render exists for domeCapture, which takes the
// scene and draws it six times into the dome's cube itself. Six draw calls in
// all: two shelves, two falls, the architecture, the lamps.

import * as THREE from "three";
import { getVizMotion, readVoteFlash } from "../vizMotion";
import { getScAudio, normLevel, slew } from "../scAudio";
import { domeParams } from "../dome/dome";

/** Gallery circumradius and height; rings in the stack (one below the seat). */
const R = 6;
const LEVEL_H = 2.4;
const RINGS = 28;
/** Seconds for one gallery to sink past. */
const SINK_S = 12;
/**
 * Fog density. At 0.034 the galleries stayed bright to the vanishing point
 * and the shaft read flat; at 0.05 a gallery 10 m up is a quarter gone, 20 m
 * two-thirds, 30 m nine-tenths — each one up visibly further than the last.
 */
const FOG = 0.05;
/** A ring's rate at ROTATION SPD 1.00x, idle, silent, default immersion. */
const RING_RATE = 1.2 * Math.PI / 180;
/** Books falling down the shaft at any moment, camera trap and spectrogram. */
const FALL_CT = 24, FALL_AM = 14;
/** Shelving: four books a row, three rows a wall, four walls a gallery. */
const PER_ROW = 4, SHELF_ROWS = 3;
const BOOK_W = 1.1;
/** Of every hundred books on the shelves, how many are camera traps. */
const CT_SHARE = 0.2;

type AtlasInfo = { image: string; cols: number; rows: number; cell: [number, number]; keys: string[]; felid: boolean[] };
type BabelIndex = { ct: AtlasInfo; am: AtlasInfo };

// The ring transform, shared by every shelved thing: widen, turn, lift.
const RING_GLSL = /* glsl */ `
uniform vec2 uRing[${RINGS}];
uniform float uWiden;
attribute float aRing;
vec3 ringed(vec3 p) {
  vec2 r = uRing[int(aRing + 0.5)];
  float c = cos(r.x), s = sin(r.x);
  return vec3(c * p.x + s * p.z, p.y + r.y, -s * p.x + c * p.z);
}`;

const BOOK_VS = /* glsl */ `
attribute vec2 aCell;
attribute float aAlpha;
uniform vec2 uGrid;
uniform float uFog;
varying vec2 vUv;
varying float vAlpha;
varying float vFog;
#ifdef RING
${RING_GLSL}
#endif
void main() {
#ifdef RING
  // The book keeps its size; only where it stands moves out or in.
  vec3 t = instanceMatrix[3].xyz;
  t.xz *= uWiden;
  vec4 wp = modelMatrix * vec4(ringed(mat3(instanceMatrix) * position + t), 1.0);
#else
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
#endif
  vUv = vec2((aCell.x + uv.x) / uGrid.x, 1.0 - (aCell.y + 1.0 - uv.y) / uGrid.y);
  vAlpha = aAlpha;
  float d = distance(wp.xyz, cameraPosition) * uFog;
  vFog = 1.0 - exp(-d * d);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const BOOK_FS = /* glsl */ `
uniform sampler2D uAtlas;
varying vec2 vUv;
varying float vAlpha;
varying float vFog;
void main() {
  vec4 c = texture2D(uAtlas, vUv);
  gl_FragColor = vec4(c.rgb * (1.0 - vFog), vAlpha);
  #include <colorspace_fragment>
}`;

const LINE_VS = /* glsl */ `
uniform float uFog;
varying float vFog;
${RING_GLSL}
void main() {
  vec4 wp = modelMatrix * vec4(ringed(vec3(position.x * uWiden, position.y, position.z * uWiden)), 1.0);
  float d = distance(wp.xyz, cameraPosition) * uFog;
  vFog = 1.0 - exp(-d * d);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const LINE_FS = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vFog;
void main() {
  gl_FragColor = vec4(uColor * (1.0 - vFog), uOpacity);
  #include <colorspace_fragment>
}`;

const LAMP_VS = /* glsl */ `
uniform float uFog;
varying vec2 vUv;
varying float vFog;
${RING_GLSL}
void main() {
  vec3 t = instanceMatrix[3].xyz;
  t.xz *= uWiden;
  vec4 wp = modelMatrix * vec4(ringed(mat3(instanceMatrix) * position + t), 1.0);
  vUv = uv;
  float d = distance(wp.xyz, cameraPosition) * uFog;
  vFog = 1.0 - exp(-d * d);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const LAMP_FS = /* glsl */ `
uniform vec3 uColor;
varying vec2 vUv;
varying float vFog;
void main() {
  float g = smoothstep(0.5, 0.0, length(vUv - 0.5));
  gl_FragColor = vec4(uColor * g * (1.0 - vFog), g);
  #include <colorspace_fragment>
}`;

/** Small deterministic hash → [0, 1). */
function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export type Babel = { frame(now: number): void; dispose(): void };

export function createBabel(host: HTMLElement, assetBase: string): Babel {
  const canvas = document.createElement("canvas");
  canvas.width = 2; canvas.height = 2;
  canvas.style.cssText = "position:absolute;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;";
  canvas.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "low-power" });
  renderer.setPixelRatio(1);
  renderer.setSize(2, 2, false);
  renderer.setClearColor(0x000000, 1);

  const scene = new THREE.Scene();
  // A seated world, authored in dome coordinates: the eye at the shaft's
  // foot, +Y the zenith, -Z the front.
  scene.userData.domeEye = new THREE.Vector3(0, 0, 0);
  scene.userData.domeForward = new THREE.Vector3(0, 0, -1);
  scene.userData.domeUp = new THREE.Vector3(0, 1, 0);
  const camera = new THREE.PerspectiveCamera(90, 1, 0.05, 200);

  // ── The rings ──
  const ringU = Array.from({ length: RINGS }, () => new THREE.Vector2());
  const widenU = { value: 1 };
  type Ring = { a: number; w: number; dir: number; k: number; y: number; flipAt: number };
  let seed = 1;
  const rnd = () => hash(seed++);
  const rings: Ring[] = Array.from({ length: RINGS }, (_, i) => ({
    a: rnd() * Math.PI * 2, w: 0, dir: rnd() < 0.5 ? -1 : 1, k: 0.5 + rnd(),
    y: (i - 1) * LEVEL_H, flipAt: 20 + rnd() * 100,
  }));

  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };
  const fogU = { value: FOG };

  // ── The architecture (ring-local; every ring shares it) ──
  {
    const corner = (k: number, r: number, y: number) => {
      const a = (k * 60 + 30) * Math.PI / 180;
      return [Math.cos(a) * r, y, Math.sin(a) * r];
    };
    const pos: number[] = [], ring: number[] = [];
    for (let i = 0; i < RINGS; i++) {
      for (let k = 0; k < 6; k++) {
        const a = corner(k, R, 0), b = corner(k + 1, R, 0);
        const ra = corner(k, 2.3, 0.5), rb = corner(k + 1, 2.3, 0.5);
        pos.push(...a, ...b, ...a, a[0], LEVEL_H, a[2], ...ra, ...rb);
        for (let j = 0; j < 6; j++) ring.push(i);
      }
    }
    const geo = keep(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("aRing", new THREE.Float32BufferAttribute(ring, 1));
    const mat = keep(new THREE.ShaderMaterial({
      vertexShader: LINE_VS, fragmentShader: LINE_FS, transparent: true, depthWrite: false,
      uniforms: { uRing: { value: ringU }, uWiden: widenU, uFog: fogU,
        uColor: { value: new THREE.Color(0x8df0b4) }, uOpacity: { value: 0.22 } },
    }));
    const lines = new THREE.LineSegments(geo, mat);
    lines.frustumCulled = false;
    scene.add(lines);

    // Two lamps a gallery, on the corridor sides.
    const lampGeo = keep(new THREE.PlaneGeometry(0.38, 0.38));
    const lamp = new THREE.InstancedMesh(lampGeo, keep(new THREE.ShaderMaterial({
      vertexShader: LAMP_VS, fragmentShader: LAMP_FS, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uRing: { value: ringU }, uWiden: widenU, uFog: fogU, uColor: { value: new THREE.Color(0xffba5e) } },
    })), RINGS * 2);
    const lr = new Float32Array(RINGS * 2);
    const o = new THREE.Object3D();
    let n = 0;
    for (let i = 0; i < RINGS; i++) {
      for (const k of [1, 4]) {
        const a = corner(k, R - 0.3, 0), b = corner(k + 1, R - 0.3, 0);
        o.position.set((a[0] + b[0]) / 2, LEVEL_H - 0.3, (a[2] + b[2]) / 2);
        o.lookAt(0, o.position.y, 0);
        o.updateMatrix();
        lamp.setMatrixAt(n, o.matrix);
        lr[n++] = i;
      }
    }
    lampGeo.setAttribute("aRing", new THREE.InstancedBufferAttribute(lr, 1));
    lamp.frustumCulled = false;
    scene.add(lamp);
  }

  // ── The books (once the atlases arrive) ──
  type Fall = { mesh: THREE.InstancedMesh; cells: Float32Array; alpha: THREE.InstancedBufferAttribute; cellAttr: THREE.InstancedBufferAttribute; info: AtlasInfo; f: Faller[] };
  type Faller = { book: number; th: number; w: number; life: number; age: number; size: number };
  const falls: Fall[] = [];
  let alive = true;

  const atlasMaterial = (tex: THREE.Texture, info: AtlasInfo, ring: boolean) => keep(new THREE.ShaderMaterial({
    vertexShader: BOOK_VS, fragmentShader: BOOK_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    defines: ring ? { RING: "" } : {},
    uniforms: {
      uAtlas: { value: tex }, uGrid: { value: new THREE.Vector2(info.cols, info.rows) }, uFog: fogU,
      uRing: { value: ringU }, uWiden: widenU,
    },
  }));

  const shelve = (ct: { tex: THREE.Texture; info: AtlasInfo }, am: { tex: THREE.Texture; info: AtlasInfo }) => {
    const corner = (k: number, r: number) => {
      const a = (k * 60 + 30) * Math.PI / 180;
      return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
    };
    // Every shelf slot, then dealt between the two registers.
    const slots: { p: THREE.Vector3; ring: number; ct: boolean; book: number }[] = [];
    let s = 0;
    for (let i = 0; i < RINGS; i++) {
      for (let wall = 0; wall < 6; wall++) {
        if (wall === 1 || wall === 4) continue;   // the two sides onto the corridors
        const a = corner(wall, R - 0.06), b = corner(wall + 1, R - 0.06);
        for (let row = 0; row < SHELF_ROWS; row++) {
          for (let j = 0; j < PER_ROW; j++) {
            const p = a.clone().lerp(b, (j + 0.5) / PER_ROW);
            p.y = 0.42 + row * 0.76;
            const isCt = hash(s * 3.7 + 1) < CT_SHARE;
            const info = isCt ? ct.info : am.info;
            slots.push({ p, ring: i, ct: isCt, book: Math.floor(hash(s * 5.3 + 2) * info.keys.length) });
            s++;
          }
        }
      }
    }
    const o = new THREE.Object3D();
    for (const reg of [ct, am]) {
      const mine = slots.filter((x) => x.ct === (reg === ct));
      const [cw, chh] = reg.info.cell;
      const geo = keep(new THREE.PlaneGeometry(BOOK_W, BOOK_W * chh / cw));
      const cells = new Float32Array(mine.length * 2);
      const ringA = new Float32Array(mine.length);
      const mesh = new THREE.InstancedMesh(geo, atlasMaterial(reg.tex, reg.info, true), mine.length);
      mine.forEach((x, i) => {
        o.position.copy(x.p);
        o.lookAt(0, x.p.y, 0);   // facing the shaft
        o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
        cells[i * 2] = x.book % reg.info.cols;
        cells[i * 2 + 1] = Math.floor(x.book / reg.info.cols);
        ringA[i] = x.ring;
      });
      geo.setAttribute("aCell", new THREE.InstancedBufferAttribute(cells, 2));
      geo.setAttribute("aAlpha", new THREE.InstancedBufferAttribute(new Float32Array(mine.length).fill(1), 1));
      geo.setAttribute("aRing", new THREE.InstancedBufferAttribute(ringA, 1));
      mesh.frustumCulled = false;
      scene.add(mesh);
    }

    // The fall: camera traps mostly, spectrograms among them.
    for (const [reg, count] of [[ct, FALL_CT], [am, FALL_AM]] as const) {
      const [cw, chh] = reg.info.cell;
      const geo = keep(new THREE.PlaneGeometry(1.6, 1.6 * chh / cw));
      const cells = new Float32Array(count * 2);
      const cellAttr = new THREE.InstancedBufferAttribute(cells, 2);
      const alpha = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
      alpha.setUsage(THREE.DynamicDrawUsage);
      cellAttr.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute("aCell", cellAttr);
      geo.setAttribute("aAlpha", alpha);
      const mesh = new THREE.InstancedMesh(geo, atlasMaterial(reg.tex, reg.info, false), count);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.renderOrder = 1;
      scene.add(mesh);
      const f: Faller[] = Array.from({ length: count }, () => {
        const x = { book: 0, th: 0, w: 0, life: 1, age: 0, size: 1 };
        spawn(x, reg.info, true);
        return x;
      });
      falls.push({ mesh, cells, alpha, cellAttr, info: reg.info, f });
    }
  };

  function spawn(f: Faller, info: AtlasInfo, staggered: boolean) {
    f.book = Math.floor(rnd() * info.keys.length);
    f.th = rnd() * Math.PI * 2;
    f.w = 0.05 + rnd() * 0.12;
    f.life = 14 + rnd() * 14;
    f.age = staggered ? rnd() * f.life : 0;
    f.size = 0.85 + rnd() * 0.5;
  }

  // Two images, decoded off the page's thread, uploaded once each.
  const loadTex = (url: string) => fetch(url)
    .then((r) => { if (!r.ok) throw new Error(`${url} ${r.status}`); return r.blob(); })
    .then((b) => createImageBitmap(b, { imageOrientation: "flipY" }))
    .then((bmp) => {
      const t = keep(new THREE.Texture(bmp as unknown as HTMLImageElement));
      t.flipY = false;   // flipped at decode: ImageBitmap ignores UNPACK_FLIP_Y
      t.colorSpace = THREE.SRGBColorSpace;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.generateMipmaps = true;
      t.needsUpdate = true;
      disposables.push({ dispose: () => bmp.close() });
      return t;
    });
  fetch(assetBase + "visual/babel/babel.json")
    .then((r) => { if (!r.ok) throw new Error(`babel.json ${r.status}`); return r.json() as Promise<BabelIndex>; })
    .then((ix) => Promise.all([loadTex(assetBase + ix.ct.image), loadTex(assetBase + ix.am.image)])
      .then(([ctT, amT]) => { if (alive) shelve({ tex: ctT, info: ix.ct }, { tex: amT, info: ix.am }); }))
    .catch((e) => console.warn("[babel] no shelves — run tools/build_babel.py", e));

  const o = new THREE.Object3D();
  const eye = new THREE.Vector3();
  let last = 0, clock = 0, lastVote = 0;

  return {
    frame(now: number) {
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      clock += dt;
      const vm = getVizMotion();

      // The room's conditions.
      const imm = Math.max(0, Math.min(0.95, Number(domeParams().immersion ?? 0.5)));
      widenU.value = 1.3 - 0.65 * (imm / 0.95);
      const sound = slew("babel:sound", normLevel("babel:rms", getScAudio().rms, dt), 0.6, 3.0);
      const drive = Math.min(2, Math.abs(vm.rotation)) * (0.3 + 0.7 * vm.factor)
        * (1 + 1.5 * sound) * (0.6 + 0.8 * imm / 0.95);
      const vote = readVoteFlash(1500);
      const reshuffle = !!vote && vote.time !== lastVote;
      if (vote) lastVote = vote.time;

      const k = 1 - Math.exp(-dt / 5);
      for (let i = 0; i < RINGS; i++) {
        const r = rings[i];
        if (reshuffle || clock >= r.flipAt) {
          r.dir = -r.dir;
          r.flipAt = clock + 30 + rnd() * 90;
        }
        r.w += (r.dir * r.k * RING_RATE * drive - r.w) * k;
        r.a += r.w * dt;
        // Sinking for ever: the lowest ring, once under the seat, goes back
        // to the top of the stack, deep in the fog, still turning.
        r.y -= dt * LEVEL_H / SINK_S;
        if (r.y < -LEVEL_H) r.y += RINGS * LEVEL_H;
        ringU[i].set(r.a, r.y);
      }

      // The fall: a helix down the shaft, widening as it comes, turning the
      // way ROTATION SPD points.
      const dir = vm.rotation < 0 ? -1 : 1;
      for (const fl of falls) {
        for (let i = 0; i < fl.f.length; i++) {
          const f = fl.f[i];
          f.age += dt;
          if (f.age >= f.life) spawn(f, fl.info, false);
          const p = f.age / f.life;
          const e = p * p * (3 - 2 * p);
          const rad = (1.4 + 3.6 * Math.pow(p, 0.7)) * Math.min(1, widenU.value);
          const th = f.th + dir * f.w * f.age;
          o.position.set(Math.cos(th) * rad, 44 - 42.5 * e, Math.sin(th) * rad);
          o.lookAt(eye);
          o.scale.setScalar(f.size);
          o.updateMatrix();
          fl.mesh.setMatrixAt(i, o.matrix);
          fl.cells[i * 2] = f.book % fl.info.cols;
          fl.cells[i * 2 + 1] = Math.floor(f.book / fl.info.cols);
          fl.alpha.setX(i, Math.min(1, p / 0.15, (1 - p) / 0.12));
        }
        fl.mesh.instanceMatrix.needsUpdate = true;
        fl.cellAttr.needsUpdate = true;
        fl.alpha.needsUpdate = true;
      }

      renderer.render(scene, camera);
    },
    dispose() {
      alive = false;
      scene.traverse((x) => { if ((x as THREE.InstancedMesh).isInstancedMesh) (x as THREE.InstancedMesh).dispose(); });
      for (const d of disposables) d.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
