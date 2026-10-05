// blendLayer.ts — the blended space, inside each instrument's own world
// ===========================================================================
// Slots 4–9 keep everything they are — the structures, the trails, the
// constellations, the ticker. This adds a layer INTO the slot's scene (so the
// dome, NDI and the 4K render carry it, with the slot's own bloom) where the
// two input spaces of the engine meet, after Fauconnier & Turner's conceptual
// blending:
//
//   neuronal · bosque   the forest: the CORPUS layer, the species
//   silicio · cadena    Ethereum mainnet: blocks and transactions
//
// Two things live here:
//
// FORMULAS IN FLIGHT. When the forest does something (a swell in the CORPUS
// layer) the slot's neuronal law is written in mid-air at one side and flies
// in; when the chain does (a block) the silicon law flies in from the other.
// When the two meet in front of the structure they TRANSFORM into one another
// (manim's TransformMatchingParts) and become the blend — or, for slots whose
// blend is not written yet, the generic structure both share — which rises and
// dissolves. A formula nobody meets flies on through and unwrites itself.
// Every formula carries a live number from the stream that launched it.
//
// THE BLEND SURFACE. Under the structure, a mesh whose shape is the blend
// itself, ManimGL-style (a surface morphing between two surfaces):
//     h(x, z) = (1 − λ) · membrane(x, z)  +  λ · lattice(x, z)
//   membrane  smooth gaussian swells at the species, breathing with the forest
//   lattice   flat terraces raised cell by cell by the transactions, falling
//             back slowly — the stepped, discrete shape of a ledger
// λ is the chain's share of what is happening now. The surface turns slowly.
//
// Scale comes from the slot's own camera distance, so the same layer sits
// right in all six worlds. Formulas are typeset once (manim/tex.ts, cached).

import * as THREE from "three";
import F from "../manim/formulas.json";
import { Animator, Write, Unwrite, TransformMatchingParts, Flash } from "../manim/animate";
import { TexMobject, DecimalNumber } from "../manim/vmobject";
import { getEthLive } from "../ethLive";
import { getStem, getScAudio, bandRange, normLevel, slew } from "../scAudio";
import parliamentStore from "../parliament/parliamentStore";

type SlotKey = "s4" | "s5" | "s6" | "s7" | "s8" | "s9";
type Side = "neuronal" | "silicon";

const INK = { neuronal: 0x7fd6b0, silicon: 0xffa040, blend: 0xf2efe6, accent: 0xffe680 };

/** The two laws and what they meet as, for each slot (manim/formulas.json). */
function lawsFor(slot: SlotKey): { neuronal: string; silicon: string; meet: string } {
  const f = (F as any)[slot];
  return {
    neuronal: f.neuronal.law,
    silicon: f.silicon.law,
    // The blend where one is written (4, 5); the shared structure otherwise.
    meet: f.blend?.mixed ?? f.generic,
  };
}

type Flight = {
  side: Side;
  tex: TexMobject;
  num: DecimalNumber;
  path: THREE.CubicBezierCurve3;
  t0: number;
  dur: number;
  /** Seconds at the meeting point before giving up and flying on. */
  wait: number;
  state: "in" | "waiting" | "out" | "meeting" | "gone";
  value: () => number;
};

export type BlendLayer = { destroy: () => void };

export function attachBlendLayer(slot: SlotKey, scene: THREE.Scene, camera: THREE.Camera, dist: number): BlendLayer {
  const laws = lawsFor(slot);
  const root = new THREE.Group();
  root.name = `blend-${slot}`;
  scene.add(root);
  const animator = new Animator();
  const EM = dist * 0.03;
  let destroyed = false;

  // ── The blend surface ────────────────────────────────────────────────────
  const N = 48;                                 // grid cells per side
  const SIZE = dist * 1.5;
  const FLOOR = -dist * 0.36;
  const verts = (N + 1) * (N + 1);
  const pos = new Float32Array(verts * 3);
  const col = new Float32Array(verts * 3);
  const idx: number[] = [];
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const k = j * (N + 1) + i;
    pos[k * 3] = (i / N - 0.5) * SIZE;
    pos[k * 3 + 2] = (j / N - 0.5) * SIZE;
    if (i < N) idx.push(k, k + 1);
    if (j < N) idx.push(k, k + N + 1);
  }
  const surfGeo = new THREE.BufferGeometry();
  surfGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  surfGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  surfGeo.setIndex(idx);
  const surfMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false });
  const surface = new THREE.LineSegments(surfGeo, surfMat);
  surface.frustumCulled = false;
  surface.position.y = FLOOR;
  root.add(surface);

  // the lattice: 8 × 8 terraces, each transaction raises one
  const LAT = 8;
  const terrace = new Float32Array(LAT * LAT);
  // species positions on the membrane (fixed, a loose ring)
  const speciesAt = Array.from({ length: 5 }, (_, i) => {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    return [Math.cos(a) * SIZE * 0.25, Math.sin(a) * SIZE * 0.25];
  });
  const cN = new THREE.Color(INK.neuronal), cS = new THREE.Color(INK.silicon), cTmp = new THREE.Color();

  function updateSurface(lam: number, t: number, forest: number, act: number[]) {
    const amp = dist * 0.16;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const k = j * (N + 1) + i;
      const x = pos[k * 3], z = pos[k * 3 + 2];
      // membrane: swells at the species, breathing with the forest
      let m = 0;
      for (let s = 0; s < 5; s++) {
        const dx = x - speciesAt[s][0], dz = z - speciesAt[s][1];
        const r2 = (dx * dx + dz * dz) / (SIZE * SIZE * 0.012);
        m += act[s] * Math.exp(-r2) * (0.75 + 0.25 * Math.sin(t * 0.6 + s * 1.7));
      }
      m *= 0.5 + forest;
      // lattice: the terrace this point stands on — flat, stepped
      const ci = Math.min(LAT - 1, Math.floor((i / (N + 1)) * LAT));
      const cj = Math.min(LAT - 1, Math.floor((j / (N + 1)) * LAT));
      const l = terrace[cj * LAT + ci];
      const h = (1 - lam) * m + lam * l;
      pos[k * 3 + 1] = h * amp;
      // colour leans to whichever world is raising this point
      const w = m + l > 1e-4 ? (lam * l) / ((1 - lam) * m + lam * l + 1e-4) : lam;
      cTmp.copy(cN).lerp(cS, w).multiplyScalar(0.35 + Math.min(0.65, h));
      col[k * 3] = cTmp.r; col[k * 3 + 1] = cTmp.g; col[k * 3 + 2] = cTmp.b;
    }
    surfGeo.attributes.position.needsUpdate = true;
    surfGeo.attributes.color.needsUpdate = true;
  }

  // ── Formulas in flight ───────────────────────────────────────────────────
  const flights: Flight[] = [];
  const meetAt = new THREE.Vector3(0, dist * 0.18, dist * 0.32);

  function flightPath(side: Side): THREE.CubicBezierCurve3 {
    const s = side === "neuronal" ? -1 : 1;
    const y = dist * (0.05 + Math.random() * 0.3);
    return new THREE.CubicBezierCurve3(
      new THREE.Vector3(s * dist * 0.95, y, -dist * (0.2 + Math.random() * 0.4)),
      new THREE.Vector3(s * dist * 0.75, y + dist * 0.25, dist * 0.1),
      new THREE.Vector3(s * dist * 0.35, meetAt.y + dist * 0.12, meetAt.z + dist * 0.1),
      meetAt.clone().add(new THREE.Vector3(s * EM * 6, 0, 0)),
    );
  }

  async function launch(side: Side, value: () => number) {
    if (destroyed || flights.filter((f) => f.side === side && f.state !== "gone").length >= 2) return;
    const [tex, num] = await Promise.all([
      TexMobject.create(laws[side], { size: EM, color: INK[side], stroke: EM * 0.04 }),
      DecimalNumber.create({ size: EM * 0.7, color: INK[side] }),
    ]);
    if (destroyed) { tex.dispose(); num.dispose(); return; }
    for (const g of tex.glyphs) g.setAlpha(0, 0);
    num.position.set(tex.width / 2 + EM * 0.4, -EM * 0.2, 0);
    tex.add(num);
    root.add(tex);
    const f: Flight = { side, tex, num, path: flightPath(side), t0: performance.now() / 1000, dur: 6 + Math.random() * 2,
                        wait: 7, state: "in", value };
    flights.push(f);
    void animator.play(new Write(tex.glyphs), 2.2);
  }

  async function meet(a: Flight, b: Flight) {
    a.state = b.state = "meeting";
    const blend = await TexMobject.create(laws.meet, {
      size: EM * 1.05, color: INK.blend, stroke: EM * 0.04,
      parts: { I: INK.neuronal, x: INK.neuronal, eta: INK.neuronal, g: INK.silicon, v: INK.silicon, lam: INK.accent },
    });
    if (destroyed) { blend.dispose(); return; }
    blend.position.copy(meetAt);
    blend.quaternion.copy(camera.quaternion);
    for (const g of blend.glyphs) { g.visible = false; g.setAlpha(0, 0); }
    root.add(blend);
    root.updateMatrixWorld(true);
    animator.play(new Flash(root, meetAt.clone(), INK.accent, EM * 3, 16, EM * 0.06), 0.9);
    a.num.visible = b.num.visible = false;
    await animator.play(new TransformMatchingParts([...a.tex.glyphs, ...b.tex.glyphs], blend.glyphs, root), 1.8);
    for (const f of [a, b]) { root.remove(f.tex); f.tex.dispose(); f.num.dispose(); f.state = "gone"; }
    // the blend rises and dissolves
    const y0 = blend.position.y;
    const rise = animator.addUpdater((dt) => { blend.position.y += dt * dist * 0.03; blend.quaternion.copy(camera.quaternion); });
    await new Promise<void>((r) => animator.play({ begin() {}, interpolate() {}, finish() { r(); } }, 4.5));
    await animator.play(new Unwrite(blend.glyphs), 1.6);
    rise();
    root.remove(blend);
    blend.dispose();
    void y0;
  }

  // ── Data → events ────────────────────────────────────────────────────────
  let lastBlockPulse = 0, forestArmed = true, lastForestLaunch = -99, lastChainLaunch = -99;
  let lam = 0.5;

  function tick() {
    const now = performance.now() / 1000;
    const eth = getEthLive();
    const audio = getScAudio();
    const corpus = getStem("corpus");
    const rawForest = corpus > 0 ? corpus : bandRange(0.6, 1.0);
    const forest = audio.live || corpus > 0 ? slew(`blend:${slot}:f`, normLevel(`blend:${slot}:forest`, rawForest), 0.2, 0.8) : 0;
    const st = parliamentStore.state;
    const sp = st?.species ?? [];
    const act = Array.from({ length: 5 }, (_, i) => (sp[i] ? sp[i].presence * (0.4 + sp[i].activity) : 0.3));
    const chain = slew(`blend:${slot}:c`, eth.live ? 0.25 + eth.pulse * 0.75 : 0, 0.3, 2.0);
    lam = slew(`blend:${slot}:lam`, chain + forest > 0.02 ? chain / (chain + forest) : 0.5, 0.8, 0.8);

    // transactions raise terraces; terraces settle
    if (eth.live && eth.pulse > 0.95) terrace[Math.min(LAT * LAT - 1, Math.floor(eth.addr * LAT * LAT))] += 0.25 * (0.3 + eth.value);
    for (let i = 0; i < terrace.length; i++) terrace[i] = Math.min(1.4, terrace[i] * (1 - 0.06 / 60));
    updateSurface(lam, now, forest, act);
    surfMat.opacity = Math.min(0.3, surfMat.opacity + 0.004);   // under the structure, never over it
    surface.rotation.y += 0.0009;

    // launches: a swell in the forest, a block on the chain
    if (forest > 0.72 && forestArmed && now - lastForestLaunch > 5) {
      forestArmed = false; lastForestLaunch = now;
      void launch("neuronal", () => forest);
    } else if (forest < 0.5) forestArmed = true;
    if (eth.blockPulse > 0.95 && lastBlockPulse <= 0.95 && now - lastChainLaunch > 5) {
      lastChainLaunch = now;
      void launch("silicon", () => eth.depth);
    }
    lastBlockPulse = eth.blockPulse;

    // flights
    for (const f of flights) {
      if (f.state === "gone" || f.state === "meeting") continue;
      const u = Math.min(1, (now - f.t0) / f.dur);
      if (f.state === "in") {
        f.path.getPoint(smoothstep(u), f.tex.position);
        if (u >= 1) { f.state = "waiting"; f.t0 = now; }
      } else if (f.state === "waiting") {
        f.tex.position.y += Math.sin(now * 1.3) * EM * 0.004;
        if (now - f.t0 > f.wait) {
          f.state = "out"; f.t0 = now;
          void animator.play(new Unwrite(f.tex.glyphs), 2.4).then(() => {
            root.remove(f.tex); f.tex.dispose(); f.num.dispose(); f.state = "gone";
          });
        }
      } else if (f.state === "out") {
        // on through, the way it was going
        const dir = f.side === "neuronal" ? 1 : -1;
        f.tex.position.x += dir * dist * 0.004;
        f.tex.position.z += dist * 0.002;
      }
      f.tex.quaternion.copy(camera.quaternion);
      f.num.setValue(f.value());
    }
    // a neuronal and a silicon both at the meeting point → the blend
    const nw = flights.find((f) => f.side === "neuronal" && f.state === "waiting");
    const sw = flights.find((f) => f.side === "silicon" && f.state === "waiting");
    if (nw && sw) void meet(nw, sw);
    for (let i = flights.length - 1; i >= 0; i--) if (flights[i].state === "gone") flights.splice(i, 1);

    animator.tick();
  }

  let raf = 0;
  const loop = () => {
    if (destroyed) return;
    raf = requestAnimationFrame(loop);
    try { tick(); } catch (e) { console.warn(`[blend ${slot}]`, e); }
  };
  raf = requestAnimationFrame(loop);

  return {
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      animator.clear();
      scene.remove(root);
      root.traverse((n: any) => {
        if (n.isMesh || n.isLine || n.isLineSegments) { n.geometry?.dispose?.(); const m = n.material; for (const x of Array.isArray(m) ? m : [m]) x?.dispose?.(); }
      });
      for (const f of flights) { f.tex.dispose(); f.num.dispose(); }
    },
  };
}

function smoothstep(t: number) { return t * t * (3 - 2 * t); }
