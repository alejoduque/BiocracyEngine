// redes.ts — slot 5 · Redes: weights that learn from what happens together
// ===========================================================================
// Two networks that strengthen the links their traffic uses:
//
//   neuronal · bosque   the mycorrhizal net between the five species of the
//                       parliament, Hebbian: Δw_ij = η · x_i · x_j, with x the
//                       species' presence × activity, and a slow forgetting
//   silicio · cadena    the transaction graph: eight address identities
//                       (EthLive.addr), each transaction strengthens the edge
//                       from the last one it came from by the value it moved
//
// The blend is a third network that neither has: the species linked to the
// addresses, each bond weighted by (1−λ)·η·x_i·y_b with y the value flowing
// through address b — bits and atoms in one graph. Its output is the BioToken
// the parliament already computes,
//   valor = pres · act · eDNA · hongos · IA · IUCN
// written with each factor's live value under it; the smallest factor, the one
// holding the product down, is indicated in turn. A bond forming plays the
// slot's own voice (the pad), as the edges of the old slot 5 did.

import * as THREE from "three";
import { mountBlendStage, INK, EM, SPACES } from "./BlendStage";
import type { Viz } from "../visualizationSwitcher";
import type { ParliamentState } from "../parliament/parliamentStore";
import { TransformMatchingParts, Indicate, Flash } from "../manim/animate";
import { DecimalNumber, type TexMobject } from "../manim/vmobject";
import { NumberLine, Segments } from "../manim/geometry";
import F from "../manim/formulas.json";
import { getEthLive } from "../ethLive";
import { getStem, normLevel, slew } from "../scAudio";
import { makeEventEmitter } from "../slotVoice";

const f = F.s5;

type Graph = {
  group: THREE.Group;
  nodes: THREE.Mesh[];
  edges: { a: number; b: number; seg: Segments }[];
};

/** Nodes on a ring (or two facing arcs for the blend) and a segment per pair. */
function makeGraph(points: THREE.Vector3[], colors: number[], pairs: [number, number][], edgeColor: number, r: number): Graph {
  const group = new THREE.Group();
  const nodes = points.map((p, i) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 28),
      new THREE.MeshBasicMaterial({ color: colors[i], transparent: true, depthWrite: false }));
    m.position.copy(p).setZ(0.02);
    m.renderOrder = 3;
    group.add(m);
    return m;
  });
  const edges = pairs.map(([a, b]) => {
    const seg = new Segments(1, edgeColor, EM * 0.05, 0);
    seg.setSegments([points[a], points[b]]);
    group.add(seg);
    return { a, b, seg };
  });
  return { group, nodes, edges };
}

const ring = (n: number, rx: number, ry: number, phase = -Math.PI / 2) =>
  Array.from({ length: n }, (_, i) => {
    const a = phase + (i / n) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a) * rx, Math.sin(a) * ry, 0);
  });

export function mountRedes(stageEl: HTMLElement, getState: () => ParliamentState | null): Viz {
  return mountBlendStage(stageEl, {
    key: "5",
    name: "Redes · micorriza / transacciones",
    labels: { neuronal: f.neuronal.label, silicon: f.silicon.label, generic: "ESPACIO GENERICO", blend: f.blend.label },
    async build(ctx) {
      const S = SPACES;
      const top = (k: keyof typeof SPACES) => S[k].h / 2 - EM * 2.0;
      const [nLaw, nRule, sLaw, sRule, gen, bNeu, bMix, bSil, bRule, lamTex] = await Promise.all([
        ctx.tex("neuronal", f.neuronal.law, { color: INK.neuronal, at: [0, top("neuronal")] }),
        ctx.tex("neuronal", f.neuronal.rule, { size: EM * 0.62, color: INK.neuronal, at: [0, -S.neuronal.h / 2 + EM * 0.8] }),
        ctx.tex("silicon", f.silicon.law, { color: INK.silicon, at: [0, top("silicon")] }),
        ctx.tex("silicon", f.silicon.rule, { size: EM * 0.62, color: INK.silicon, at: [0, -S.silicon.h / 2 + EM * 0.8] }),
        ctx.tex("generic", f.generic, { size: EM * 0.9, color: INK.generic, at: [0, -EM * 0.3] }),
        ctx.tex("blend", f.blend.neuronal, { at: [0, top("blend")], parts: { x: INK.neuronal, eta: INK.neuronal } }),
        ctx.tex("blend", f.blend.mixed, { size: EM * 0.92, at: [0, top("blend")], parts: { x: INK.neuronal, eta: INK.neuronal, v: INK.silicon, lam: INK.accent } }),
        ctx.tex("blend", f.blend.silicon, { at: [0, top("blend")], parts: { v: INK.silicon } }),
        ctx.tex("blend", f.blend.rule, { size: EM * 0.78, at: [0, -S.blend.h / 2 + EM * 2.1] }),
        ctx.tex("blend", "\\lambda =", { size: EM * 0.7, color: INK.accent, align: "left", at: [-S.blend.w / 2 + EM * 0.8, S.blend.h / 2 - EM * 3.6] }),
      ]);

      // ── The three graphs ─────────────────────────────────────────────────
      const allPairs = (n: number) => {
        const p: [number, number][] = [];
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) p.push([i, j]);
        return p;
      };
      const nGraph = makeGraph(ring(5, S.neuronal.w * 0.26, S.neuronal.h * 0.24), Array(5).fill(INK.neuronal),
        allPairs(5), INK.neuronal, EM * 0.32);
      nGraph.group.position.set(0, -EM * 0.4, 0.01);
      ctx.spaces.neuronal.add(nGraph.group);
      const sGraph = makeGraph(ring(8, S.silicon.w * 0.27, S.silicon.h * 0.25, -Math.PI / 2 + Math.PI / 8),
        Array(8).fill(INK.silicon), allPairs(8), INK.silicon, EM * 0.26);
      sGraph.group.position.set(0, -EM * 0.4, 0.01);
      ctx.spaces.silicon.add(sGraph.group);
      // The blend: species on the left arc, addresses on the right, a bond
      // possible between every species and every address.
      const bw = S.blend.w * 0.3, bh = S.blend.h * 0.19;
      const bPts = [
        ...Array.from({ length: 5 }, (_, i) => new THREE.Vector3(-bw, bh * (1 - (2 * i) / 4), 0)),
        ...Array.from({ length: 8 }, (_, i) => new THREE.Vector3(bw, bh * (1 - (2 * i) / 7), 0)),
      ];
      const crossPairs: [number, number][] = [];
      for (let i = 0; i < 5; i++) for (let b = 0; b < 8; b++) crossPairs.push([i, 5 + b]);
      const bGraph = makeGraph(bPts, [...Array(5).fill(INK.neuronal), ...Array(8).fill(INK.silicon)],
        crossPairs, INK.blend, EM * 0.24);
      bGraph.group.position.set(0, -EM * 0.5, 0.01);
      ctx.spaces.blend.add(bGraph.group);

      const lamLine = new NumberLine(EM * 5, { dot: INK.accent });
      lamLine.position.set(-S.blend.w / 2 + EM * 6.2, S.blend.h / 2 - EM * 3.6, 0.01);
      ctx.spaces.blend.add(lamLine);
      const lamNum = await DecimalNumber.create({ size: EM * 0.7, color: INK.accent });
      lamNum.position.set(-S.blend.w / 2 + EM * 2.0, S.blend.h / 2 - EM * 3.6, 0.01);
      ctx.spaces.blend.add(lamNum);

      // The six factors' live values, each under its own name in the rule.
      bRule.updateMatrixWorld(true);
      const factorNums = await Promise.all(Array.from({ length: 6 }, () => DecimalNumber.create({ size: EM * 0.5, color: INK.generic })));
      factorNums.forEach((n, i) => {
        const gl = bRule.part(`f${i}`);
        const cx = gl.length ? gl.reduce((s, g) => s + g.centre().x, 0) / gl.length : 0;
        n.position.set(bRule.position.x + cx - EM * 0.45, bRule.position.y - EM * 0.85, 0.01);
        ctx.spaces.blend.add(n);
      });

      for (const m of [bNeu, bSil]) for (const g of m.glyphs) g.visible = false;
      await ctx.write(nLaw, sLaw);
      await ctx.write(nRule, sRule, gen);
      await ctx.write(bMix, bRule, lamTex);
      let shown: TexMobject = bMix;
      let form: "neuronal" | "mixed" | "silicon" = "mixed";
      let morphing = false;
      const setForm = (next: typeof form) => {
        if (next === form || morphing) return;
        const target = next === "neuronal" ? bNeu : next === "silicon" ? bSil : bMix;
        morphing = true;
        void ctx.animator.play(new TransformMatchingParts(shown.glyphs, target.glyphs, ctx.spaces.blend), 1.4).then(() => {
          shown = target; form = next; morphing = false;
        });
      };

      // ── State ────────────────────────────────────────────────────────────
      const ETA = 0.6, FORGET = 0.12;
      const wN = new Float32Array(10);          // species pairs
      const wS = new Float32Array(28);          // address pairs
      const y = new Float32Array(8);            // value through each address, decaying
      const wB = new Float32Array(40);          // species × address bonds
      const bondOn = new Uint8Array(40);
      let lastAddr = -1, lastPulse = 0, bonds = 0, bottleneckAt = 0;
      const emit = makeEventEmitter("pad");

      return {
        tick(dt, t) {
          const st = getState();
          const eth = getEthLive();
          const sl = st?.species ?? [];
          const x = Array.from({ length: 5 }, (_, i) => sl[i] ? sl[i].presence * sl[i].activity : 0.25);

          // Hebb in the forest.
          nGraph.edges.forEach((e, k) => {
            wN[k] += (ETA * x[e.a] * x[e.b] - FORGET * wN[k]) * dt;
            e.seg.material.opacity = Math.min(1, wN[k] * 1.6);
          });
          nGraph.nodes.forEach((n, i) => n.scale.setScalar(0.6 + x[i] * 1.2));

          // Value moved between addresses.
          if (eth.live && eth.pulse > 0.95 && lastPulse <= 0.95) {
            const b = Math.min(7, Math.floor(eth.addr * 8));
            y[b] += eth.value;
            if (lastAddr >= 0 && lastAddr !== b) {
              const k = sGraph.edges.findIndex((e) => (e.a === Math.min(lastAddr, b) && e.b === Math.max(lastAddr, b)));
              if (k >= 0) wS[k] += eth.value;
            }
            lastAddr = b;
          }
          lastPulse = eth.pulse;
          sGraph.edges.forEach((e, k) => {
            wS[k] -= FORGET * wS[k] * dt;
            e.seg.material.opacity = Math.min(1, wS[k] * 1.4);
          });
          for (let b = 0; b < 8; b++) {
            y[b] -= 0.35 * y[b] * dt;
            sGraph.nodes[b].scale.setScalar(0.6 + Math.min(1.4, y[b] * 1.5));
          }

          // λ: the chain's share of what is happening.
          const forest = Math.max(x.reduce((a, v) => a + v, 0) / 5, normLevel("redes:corpus", getStem("corpus")) * 0.6);
          const chain = slew("redes:chain", eth.live ? 0.2 + eth.pulse * 0.6 : 0, 0.3, 2.0);
          const lam = slew("redes:lam", chain + forest > 0.02 ? chain / (chain + forest) : 0.5, 0.8, 0.8);
          lamLine.setValue(lam); lamNum.setValue(lam);

          // The blend's bonds.
          const ymax = Math.max(0.05, ...y);
          bGraph.edges.forEach((e, k) => {
            const i = e.a, b = e.b - 5;
            const drive = (1 - lam) * ETA * x[i] + lam * (y[b] / ymax);
            // Only a species that is active AND an address that is carrying
            // value can bond; the gain is low so bonds stand out from the mesh.
            wB[k] += (drive * (y[b] / ymax) * x[i] * 0.9 - FORGET * 1.5 * wB[k]) * dt;
            // squared, so a bond reads as a bond and the rest of the mesh recedes
            e.seg.material.opacity = Math.min(1, (wB[k] * 1.5) ** 2);
            if (!bondOn[k] && wB[k] > 0.6) {
              bondOn[k] = 1;
              bonds++;
              emit(bonds, 0.45, lam);
              const mid = bPts[e.a].clone().add(bPts[e.b]).multiplyScalar(0.5).add(bGraph.group.position);
              ctx.animator.play(new Flash(ctx.spaces.blend, mid.setZ(0.03), INK.accent, EM * 1.1, 10, EM * 0.04), 0.6);
            } else if (bondOn[k] && wB[k] < 0.4) bondOn[k] = 0;
          });

          // The BioToken's factors, as the parliament computes them.
          const ed = st?.edna, fu = st?.fungi;
          const factors = [
            sl.length ? sl.reduce((a, s) => a + s.presence, 0) / sl.length : 0.5,
            sl.length ? sl.reduce((a, s) => a + s.activity, 0) / sl.length : 0.5,
            ed?.length ? ed.reduce((a, e) => a + (e.biodiversity ?? 0), 0) / ed.length : 0.5,
            fu?.length ? fu.reduce((a, g) => a + (g.chemical ?? 0), 0) / fu.length : 0.5,
            (st?.ai?.optimization ?? 64) / 127,
            0.6,
          ];
          factors.forEach((v, i) => factorNums[i].setValue(v));
          // Every few seconds, point at what is holding the product down.
          if (t - bottleneckAt > 6) {
            bottleneckAt = t;
            const lo = factors.indexOf(Math.min(...factors));
            ctx.animator.play(new Indicate(bRule.part(`f${lo}`), INK.accent, 1.25), 1.0);
          }

          if (form !== "neuronal" && lam < 0.28) setForm("neuronal");
          else if (form !== "silicon" && lam > 0.72) setForm("silicon");
          else if (form !== "mixed" && lam > 0.36 && lam < 0.64) setForm("mixed");
        },
        destroy() {
          lamNum.dispose();
          for (const n of factorNums) n.dispose();
        },
      };
    },
  });
}
