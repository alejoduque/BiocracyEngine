// domeRingLabels.ts — the ring stages' labels, for the dome
// ===========================================================================
// RingLabels writes the rings' words as HTML over the canvas (sharp at any
// zoom on the screen), and the dome's cube cameras never see HTML: on the
// dome, slots 0, O and T had no words at all. This draws the same labels a
// second time, as text planes in the scene (dome/domeFacing.ts) on the dome's
// own layer (DOME_LAYER), so the slot's camera never sees them and the
// screen stays exactly as it was.
//
// The choice is the dome's own, from the seat: a label's maxDist/minDist
// level of detail is measured from the seat rather than the performer's
// camera, the highest priorities win, and a label is dropped when it would
// start within GAP of one already placed. Each plane has its own small canvas,
// redrawn and uploaded only when its words or colour change; positions move
// every frame for free. Nothing runs while the dome is not rendering.

import * as THREE from "three";
import type { LabelSpec } from "./ringLabels";
import { DOME_LAYER } from "../dome/domeCapture";
import { faceCamera, labelPlane } from "../dome/domeFacing";

const MAX = 64;
const W = 512, H = 64;
const GAP = Math.cos(2.6 * Math.PI / 180);
const FONT = "'IBM Plex Mono', 'SF Mono', Menlo, Consolas, monospace";

/** The page's label colours (parliament.html .ring-label), by class. */
function inkFor(cls: string): string {
  const c = " " + cls + " ";
  if (c.includes(" head ")) return c.includes(" small ") ? "#ffaa5a" : "#ffc266";
  if (c.includes(" clip ")) return c.includes(" live ") ? "#ffb35c" : "#c8d2cd";
  if (c.includes(" season ")) return c.includes(" on ") ? "#f2fff4" : "#8c9691";
  if (c.includes(" month ")) return "#d6ded9";
  if (c.includes(" civil ")) return "#8df0b4";
  if (c.includes(" tick ") || c.includes(" axis ")) return "#969e99";
  if (c.includes(" note ") || c.includes(" veiled ")) return "#8c8f8d";
  return "#e6e6dc";
}

type Slot = {
  mesh: THREE.Mesh;
  canvas: HTMLCanvasElement;
  tex: THREE.CanvasTexture;
  id: string;
  key: string;
};

export class DomeRingLabels {
  private group = new THREE.Group();
  private geo = labelPlane();
  private slots: Slot[] = [];
  private byId = new Map<string, Slot>();
  private dirs: THREE.Vector3[] = [];
  private v = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.group.layers.set(DOME_LAYER);
    scene.add(this.group);
  }

  private newSlot(): Slot {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    const mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    }));
    mesh.layers.set(DOME_LAYER);
    mesh.renderOrder = 20;
    faceCamera(mesh, 0.75);
    this.group.add(mesh);
    const s = { mesh, canvas, tex, id: "", key: "" };
    this.slots.push(s);
    return s;
  }

  private draw(s: Slot, spec: LabelSpec): void {
    const g = s.canvas.getContext("2d")!;
    g.clearRect(0, 0, W, H);
    const sub = spec.sub ?? "";
    const main = spec.text;
    g.font = `600 ${sub ? 26 : 30}px ${FONT}`;
    const w1 = g.measureText(main).width;
    g.font = `19px ${FONT}`;
    const w2 = sub ? g.measureText(sub).width : 0;
    const tw = Math.min(W, Math.ceil(Math.max(w1, w2)) + 16);
    // A dark plate: the dome under a label is never guaranteed to be dark.
    g.fillStyle = "rgba(0,0,0,0.55)";
    g.fillRect(0, 2, tw, H - 4);
    g.textBaseline = "middle";
    g.fillStyle = spec.color || inkFor(spec.cls ?? "");
    g.font = `600 ${sub ? 26 : 30}px ${FONT}`;
    g.fillText(main, 8, sub ? 21 : H / 2);
    if (sub) {
      g.font = `19px ${FONT}`;
      g.fillStyle = "rgba(220,226,222,0.8)";
      g.fillText(sub, 8, 47);
    }
    s.tex.repeat.set(tw / W, 1);
    s.tex.needsUpdate = true;
    const u = s.mesh.userData;
    u.aspect = (tw / W) * (W / H);
    u.ax = spec.anchor === "l" ? 0 : spec.anchor === "r" ? -1 : -0.5;
  }

  /** Place this frame's labels, as the dome sees them from `eye`. */
  update(specs: readonly LabelSpec[], eye: THREE.Vector3): void {
    this.group.visible = true;
    const cand: { s: LabelSpec; d: number }[] = [];
    for (const s of specs) {
      if (!s.text) continue;
      const d = eye.distanceTo(s.pos);
      if (s.maxDist !== undefined && d > s.maxDist) continue;
      if (s.minDist !== undefined && d < s.minDist) continue;
      cand.push({ s, d });
    }
    cand.sort((a, b) => (b.s.priority ?? 0) - (a.s.priority ?? 0));
    const chosen: LabelSpec[] = [];
    let nd = 0;
    for (const c of cand) {
      if (chosen.length >= MAX) break;
      const dir = (this.dirs[nd] ??= new THREE.Vector3()).subVectors(c.s.pos, eye).normalize();
      let clash = false;
      for (let i = 0; i < nd; i++) if (this.dirs[i].dot(dir) > GAP) { clash = true; break; }
      if (clash) continue;
      nd++;
      chosen.push(c.s);
    }

    // Keep each label on the plane it already has; free the rest.
    const keep = new Set(chosen.map((s) => s.id));
    for (const [id, slot] of this.byId) {
      if (!keep.has(id)) { this.byId.delete(id); slot.id = ""; slot.mesh.visible = false; }
    }
    const free = this.slots.filter((s) => !s.id);
    for (const spec of chosen) {
      let slot = this.byId.get(spec.id);
      if (!slot) {
        slot = free.pop() ?? this.newSlot();
        slot.id = spec.id;
        slot.key = "";
        this.byId.set(spec.id, slot);
      }
      const key = `${spec.text}|${spec.sub ?? ""}|${spec.color ?? ""}|${spec.cls ?? ""}|${spec.anchor ?? ""}`;
      if (key !== slot.key) { slot.key = key; this.draw(slot, spec); }
      slot.mesh.position.copy(spec.pos);
      (slot.mesh.material as THREE.MeshBasicMaterial).opacity = spec.opacity ?? 1;
      slot.mesh.visible = true;
    }
  }

  hide(): void {
    this.group.visible = false;
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const s of this.slots) { s.tex.dispose(); (s.mesh.material as THREE.Material).dispose(); }
    this.geo.dispose();
    this.slots = [];
    this.byId.clear();
  }
}
