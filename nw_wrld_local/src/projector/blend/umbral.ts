// umbral.ts — slot 4 · Umbral: integrate to a threshold, then fire
// ===========================================================================
// Two machines that accumulate an input until a threshold and then emit an
// event and start again:
//
//   neuronal · bosque   a leaky integrate-and-fire membrane, driven by the
//                       forest's own voice (the CORPUS layer's level)
//                       τ dV/dt = −V + R·I(t);  V ≥ θ ⇒ spike
//   silicio · cadena    a block filling with transactions until it is sealed
//                       (EthLive.depth, EthLive.blockPulse)
//                       G_{n+1} = G_n + g_tx;   G ≥ G_max ⇒ seal
//
// The generic space is the shape both share. The blend is one accumulator U
// fed by both, and what separates them turns out to be a single term — the
// leak. A membrane forgets; a chain does not. λ, the share of activity that is
// the chain's, scales the leak away:
//
//   τ dU/dt = −(1−λ)·U + (1−λ)·I_bosque + λ·g_cadena
//
// As λ crosses a third or two thirds, the blend's formula transforms (manim's
// TransformMatchingParts) to the neuronal or the silicon form it is closest
// to. A crossing of θ flashes, indicates the rule, resets U and plays the
// slot's own voice (the drone) — the same voice this slot always had.

import * as THREE from "three";
import { mountBlendStage, INK, EM, SPACES } from "./BlendStage";
import type { Viz } from "../visualizationSwitcher";
import { TransformMatchingParts, Indicate, Flash } from "../manim/animate";
import { DecimalNumber, type TexMobject } from "../manim/vmobject";
import { Trace, NumberLine } from "../manim/geometry";
import F from "../manim/formulas.json";
import { getEthLive } from "../ethLive";
import { getScAudio, bandRange, normLevel, slew, getStem } from "../scAudio";
import { makeEventEmitter } from "../slotVoice";

const f = F.s4;

export function mountUmbral(stageEl: HTMLElement): Viz {
  return mountBlendStage(stageEl, {
    key: "4",
    name: "Umbral · neurona / bloque",
    labels: { neuronal: f.neuronal.label, silicon: f.silicon.label, generic: "ESPACIO GENERICO", blend: f.blend.label },
    async build(ctx) {
      const S = SPACES;
      // ── Formulas ─────────────────────────────────────────────────────────
      const [nLaw, nRule, sLaw, sRule, gen, bNeu, bMix, bSil, bRule, lamTex, uTex] = await Promise.all([
        ctx.tex("neuronal", f.neuronal.law, { color: INK.neuronal, at: [0, S.neuronal.h / 2 - EM * 2.1], parts: { th: INK.accent } }),
        ctx.tex("neuronal", f.neuronal.rule, { size: EM * 0.8, color: INK.neuronal, at: [0, -S.neuronal.h / 2 + EM * 0.9], parts: { th: INK.accent } }),
        ctx.tex("silicon", f.silicon.law, { color: INK.silicon, at: [0, S.silicon.h / 2 - EM * 2.1], parts: { th: INK.accent } }),
        ctx.tex("silicon", f.silicon.rule, { size: EM * 0.8, color: INK.silicon, at: [0, -S.silicon.h / 2 + EM * 0.9], parts: { th: INK.accent } }),
        ctx.tex("generic", f.generic, { size: EM * 0.9, color: INK.generic, at: [0, -EM * 0.3] }),
        ctx.tex("blend", f.blend.neuronal, { at: [0, S.blend.h / 2 - EM * 2.2], parts: { I: INK.neuronal, lam: INK.accent } }),
        ctx.tex("blend", f.blend.mixed, { size: EM * 0.92, at: [0, S.blend.h / 2 - EM * 2.2], parts: { I: INK.neuronal, g: INK.silicon, lam: INK.accent } }),
        ctx.tex("blend", f.blend.silicon, { at: [0, S.blend.h / 2 - EM * 2.2], parts: { g: INK.silicon } }),
        ctx.tex("blend", f.blend.rule, { size: EM * 0.8, at: [0, -S.blend.h / 2 + EM * 0.9], parts: { th: INK.accent } }),
        ctx.tex("blend", "\\lambda =", { size: EM * 0.8, color: INK.accent, align: "left", at: [-S.blend.w / 2 + EM * 0.8, -S.blend.h / 2 + EM * 2.4] }),
        ctx.tex("blend", "U =", { size: EM * 0.8, color: INK.blend, align: "left", at: [S.blend.w / 2 - EM * 5.2, -S.blend.h / 2 + EM * 2.4] }),
      ]);

      // ── Live pictures ────────────────────────────────────────────────────
      // Neuronal: the membrane over the last ~8 s, threshold dashed.
      const vTrace = new Trace({ w: S.neuronal.w * 0.82, h: S.neuronal.h * 0.42, samples: 240, max: 1.15, threshold: 1, color: INK.neuronal });
      vTrace.position.set(0, -EM * 0.2, 0.01);
      ctx.spaces.neuronal.add(vTrace);
      // Silicon: the block as a column of cells that fills, and the chain of
      // sealed blocks behind it.
      const CELLS = 20;
      const cellW = EM * 1.6, cellH = (S.silicon.h * 0.42) / CELLS;
      const block = new THREE.Group();
      block.position.set(S.silicon.w * 0.22, -EM * 0.2 - S.silicon.h * 0.21, 0.01);
      ctx.spaces.silicon.add(block);
      const cellMat = new THREE.MeshBasicMaterial({ color: INK.silicon, transparent: true, opacity: 0.85, depthWrite: false });
      const cells: THREE.Mesh[] = [];
      for (let i = 0; i < CELLS; i++) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(cellW, cellH * 0.78), cellMat);
        m.position.set(0, (i + 0.5) * cellH, 0);
        m.visible = false;
        block.add(m);
        cells.push(m);
      }
      const chain = new THREE.Group();
      chain.position.set(-EM * 1.8, 0, 0);
      block.add(chain);
      const sealedMat = new THREE.MeshBasicMaterial({ color: INK.silicon, transparent: true, opacity: 0.45, depthWrite: false });
      const sealed: THREE.Mesh[] = [];
      // Blend: U over time, and λ on its number line between the two worlds.
      const uTrace = new Trace({ w: S.blend.w * 0.62, h: S.blend.h * 0.36, samples: 300, max: 1.15, threshold: 1, color: INK.blend });
      uTrace.position.set(0, EM * 0.1, 0.01);
      ctx.spaces.blend.add(uTrace);
      const lamLine = new NumberLine(EM * 6, { dot: INK.accent });
      lamLine.position.set(-S.blend.w / 2 + EM * 7.0, -S.blend.h / 2 + EM * 2.4, 0.01);
      ctx.spaces.blend.add(lamLine);
      const [lamNum, uNum, bosqueT, cadenaT] = await Promise.all([
        DecimalNumber.create({ size: EM * 0.8, color: INK.accent }),
        DecimalNumber.create({ size: EM * 0.8, color: INK.blend }),
        ctx.tex("blend", "\\text{bosque}", { size: EM * 0.5, color: INK.neuronal, at: [-S.blend.w / 2 + EM * 3.2, -S.blend.h / 2 + EM * 1.65] }),
        ctx.tex("blend", "\\text{cadena}", { size: EM * 0.5, color: INK.silicon, at: [-S.blend.w / 2 + EM * 9.2, -S.blend.h / 2 + EM * 1.65] }),
      ]);
      lamNum.position.set(-S.blend.w / 2 + EM * 2.2, -S.blend.h / 2 + EM * 2.4, 0.01);
      uNum.position.set(S.blend.w / 2 - EM * 3.6, -S.blend.h / 2 + EM * 2.4, 0.01);
      ctx.spaces.blend.add(lamNum, uNum);

      // Write everything in, the inputs first, the blend last — the order of
      // the argument: two worlds, what they share, what they make together.
      for (const m of [bNeu, bSil]) for (const g of m.glyphs) g.visible = false;
      await ctx.write(nLaw, sLaw);
      await ctx.write(nRule, sRule, gen);
      await ctx.write(bMix, bRule, lamTex, uTex, bosqueT, cadenaT);
      let shown: TexMobject = bMix;
      let form: "neuronal" | "mixed" | "silicon" = "mixed";
      let morphing = false;

      // ── State ────────────────────────────────────────────────────────────
      const TAU_V = 1.2, R_IN = 1.6, TAU_U = 1.6;
      let V = 0, U = 0, spikes = 0, lastDepth = 0, lastBlockPulse = 0;
      const emit = makeEventEmitter("drone");
      const pulseAt = (space: "neuronal" | "silicon" | "blend", p: THREE.Vector3, color: number) =>
        ctx.animator.play(new Flash(ctx.spaces[space], p.setZ(0.02), color, EM * 1.6, 14, EM * 0.05), 0.7);

      const setForm = (next: typeof form) => {
        if (next === form || morphing) return;
        const target = next === "neuronal" ? bNeu : next === "silicon" ? bSil : bMix;
        morphing = true;
        void ctx.animator.play(new TransformMatchingParts(shown.glyphs, target.glyphs, ctx.spaces.blend), 1.4).then(() => {
          shown = target; form = next; morphing = false;
        });
      };

      return {
        tick(dt) {
          const eth = getEthLive();
          const audio = getScAudio();
          // The forest's voice: the CORPUS layer when SC reports layers; else
          // the top of the spectrum, where the field recordings sit.
          const corpus = getStem("corpus");
          const rawForest = corpus > 0 ? corpus : bandRange(0.6, 1.0);
          const I = audio.live || corpus > 0 ? slew("umbral:I", normLevel("umbral:forest", rawForest), 0.15, 0.6) : 0;
          // The chain's input: the block's own count of transactions, and the
          // arrival of each one.
          const depth = eth.depth;
          const g = eth.live ? Math.max(0, depth - lastDepth) * 6 + eth.pulse * 0.35 : 0;
          lastDepth = depth;
          const chainAct = slew("umbral:chain", eth.live ? 0.25 + eth.pulse * 0.75 : 0, 0.3, 2.0);
          const lam = slew("umbral:lam", chainAct + I > 0.02 ? chainAct / (chainAct + I) : 0.5, 0.8, 0.8);

          // Neuronal membrane.
          V += ((-V + R_IN * I) / TAU_V) * dt;
          if (V >= 1) {
            V = 0;
            pulseAt("neuronal", vTrace.headPoint().add(vTrace.position), INK.neuronal);
            ctx.animator.play(new Indicate(nRule.part("th"), INK.accent, 1.25), 0.6);
          }
          vTrace.push(V);

          // The block.
          const filled = Math.round(Math.min(1, depth) * CELLS);
          for (let i = 0; i < CELLS; i++) cells[i].visible = i < filled;
          if (eth.blockPulse > 0.95 && lastBlockPulse <= 0.95) {
            const m = new THREE.Mesh(new THREE.PlaneGeometry(cellW * 0.6, cellH * CELLS * 0.55), sealedMat);
            chain.add(m);
            sealed.push(m);
            if (sealed.length > 6) { const old = sealed.shift()!; chain.remove(old); old.geometry.dispose(); }
            sealed.forEach((s, i) => s.position.set(-(sealed.length - 1 - i) * cellW * 0.9, cellH * CELLS * 0.3, 0));
            pulseAt("silicon", block.position.clone().add(new THREE.Vector3(0, cellH * CELLS, 0)), INK.silicon);
            ctx.animator.play(new Indicate(sRule.part("th"), INK.accent, 1.25), 0.6);
          }
          lastBlockPulse = eth.blockPulse;

          // The blend: the leak scaled away by λ.
          U += ((-(1 - lam) * U + (1 - lam) * R_IN * I + lam * g * 4) / TAU_U) * dt;
          if (U >= 1) {
            U = 0;
            spikes++;
            pulseAt("blend", uTrace.headPoint().add(uTrace.position), INK.accent);
            ctx.animator.play(new Indicate(bRule.part("th"), INK.accent, 1.3), 0.7);
            emit(spikes, 0.55, lam);
          }
          uTrace.push(U);
          lamLine.setValue(lam);
          lamNum.setValue(lam);
          uNum.setValue(U);

          // Which form of the law the blend is nearest, with hysteresis.
          if (form !== "neuronal" && lam < 0.28) setForm("neuronal");
          else if (form !== "silicon" && lam > 0.72) setForm("silicon");
          else if (form !== "mixed" && lam > 0.36 && lam < 0.64) setForm("mixed");
        },
        destroy() {
          cellMat.dispose(); sealedMat.dispose();
          lamNum.dispose(); uNum.dispose();
        },
      };
    },
  });
}
