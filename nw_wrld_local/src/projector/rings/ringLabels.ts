// ringLabels.ts
// Text on the rings, as HTML over the canvas.
//
// A canvas-sprite label is a bitmap: legible at the distance it was drawn for
// and a blur of texels once the performer zooms onto a day tile. These are DOM
// text projected from world space each frame, so they are sharp at any zoom.
//
// Level of detail is by distance from the camera to the label's own point: a
// DOY tick label exists only when you are close enough to that day to want it,
// wherever on the dial you have zoomed to. What survives is then de-cluttered
// by priority, greedily, so the month names never lose to the minute ticks.

import * as THREE from "three";

export type LabelSpec = {
  id: string;
  pos: THREE.Vector3;
  text: string;
  sub?: string;
  /** Extra class: tick | month | head | orb | veiled | axis | clip | season. */
  cls?: string;
  color?: string;
  priority?: number;
  /** Shown only when the camera is nearer than this (world units). */
  maxDist?: number;
  /** Hidden when the camera is nearer than this. */
  minDist?: number;
  opacity?: number;
  anchor?: "c" | "l" | "r";
  dx?: number;
  dy?: number;
};

type PoolEl = { el: HTMLDivElement; main: HTMLSpanElement; sub: HTMLSpanElement; text: string; subText: string; cls: string };

const CHAR_W = 6.4;
const MAX_SHOWN = 180;
const _v = new THREE.Vector3();

export class RingLabels {
  private layer: HTMLDivElement;
  private pool = new Map<string, PoolEl>();
  private specs: LabelSpec[] = [];

  constructor(parent: HTMLElement) {
    this.layer = document.createElement("div");
    this.layer.className = "ring-labels";
    parent.appendChild(this.layer);
  }

  begin(): void { this.specs.length = 0; }

  add(spec: LabelSpec): void { this.specs.push(spec); }

  end(camera: THREE.PerspectiveCamera, w: number, h: number): void {
    type Cand = { s: LabelSpec; x: number; y: number; x0: number; x1: number; y0: number; y1: number; p: number };
    const cands: Cand[] = [];
    const camPos = camera.position;
    for (const s of this.specs) {
      const d = camPos.distanceTo(s.pos);
      if (s.maxDist !== undefined && d > s.maxDist) continue;
      if (s.minDist !== undefined && d < s.minDist) continue;
      _v.copy(s.pos).project(camera);
      if (_v.z > 1 || _v.z < -1) continue;
      const x = (_v.x * 0.5 + 0.5) * w + (s.dx ?? 0);
      const y = (-_v.y * 0.5 + 0.5) * h + (s.dy ?? 0);
      if (x < -80 || x > w + 80 || y < -30 || y > h + 30) continue;
      const tw = Math.max(s.text.length, s.sub ? s.sub.length * 0.85 : 0) * CHAR_W + 4;
      const th = s.sub ? 24 : 12;
      const x0 = s.anchor === "l" ? x : s.anchor === "r" ? x - tw : x - tw / 2;
      cands.push({ s, x, y, x0, x1: x0 + tw, y0: y - th / 2, y1: y + th / 2, p: s.priority ?? 0 });
    }
    cands.sort((a, b) => b.p - a.p);
    const shown: Cand[] = [];
    for (const c of cands) {
      if (shown.length >= MAX_SHOWN) break;
      let hit = false;
      for (const o of shown) {
        if (c.x0 < o.x1 + 2 && c.x1 > o.x0 - 2 && c.y0 < o.y1 + 1 && c.y1 > o.y0 - 1) { hit = true; break; }
      }
      if (!hit) shown.push(c);
    }

    const used = new Set<string>();
    for (const c of shown) {
      const s = c.s;
      let pe = this.pool.get(s.id);
      if (!pe) {
        const el = document.createElement("div");
        const main = document.createElement("span");
        const sub = document.createElement("span");
        main.className = "rl-main";
        sub.className = "rl-sub";
        el.appendChild(main);
        el.appendChild(sub);
        this.layer.appendChild(el);
        pe = { el, main, sub, text: "", subText: "", cls: "" };
        this.pool.set(s.id, pe);
      }
      if (pe.text !== s.text) { pe.main.textContent = s.text; pe.text = s.text; }
      const st = s.sub ?? "";
      if (pe.subText !== st) { pe.sub.textContent = st; pe.sub.style.display = st ? "" : "none"; pe.subText = st; }
      const cls = "ring-label" + (s.cls ? " " + s.cls : "") + (s.anchor === "l" ? " al" : s.anchor === "r" ? " ar" : "");
      if (pe.cls !== cls) { pe.el.className = cls; pe.cls = cls; }
      pe.el.style.color = s.color ?? "";
      pe.el.style.opacity = String(s.opacity ?? 1);
      const ax = s.anchor === "l" ? "0" : s.anchor === "r" ? "-100%" : "-50%";
      pe.el.style.transform = `translate(${c.x.toFixed(1)}px, ${c.y.toFixed(1)}px) translate(${ax}, -50%)`;
      pe.el.style.display = "";
      used.add(s.id);
    }
    for (const [id, pe] of this.pool) {
      if (!used.has(id) && pe.el.style.display !== "none") pe.el.style.display = "none";
    }
  }

  dispose(): void {
    this.layer.remove();
    this.pool.clear();
  }
}
