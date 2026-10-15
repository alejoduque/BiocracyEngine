// tex.ts — a TeX formula as glyph outlines, the way manim's Tex sees it
// ===========================================================================
// MathJax (mathjaxCore.ts, its own chunk) writes the formula as SVG; three's
// SVGLoader reads the paths back as shapes. Each glyph keeps:
//   shapes    for its fill (ShapeGeometry)
//   outlines  its contours as closed polylines, for the stroke and for
//             Transform, which morphs one formula's contours into another's
//   part      the \class{key}{…} it sits in — what manim calls an isolated
//             substring, and what TransformMatchingParts matches on
// Units are ems; +y up; the formula's left end on x = 0, baseline on y = 0.
//
// Parsing costs milliseconds per formula, so results are cached by source and
// a slot typesets everything it will show when it mounts, never per frame.

import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";

export type TexGlyph = {
  shapes: THREE.Shape[];
  outlines: THREE.Vector2[][];
  part: string | null;
  /** Bounds in ems. */
  min: THREE.Vector2;
  max: THREE.Vector2;
};

export type TexResult = {
  tex: string;
  glyphs: TexGlyph[];
  /** Bounds of the whole formula, ems. */
  min: THREE.Vector2;
  max: THREE.Vector2;
};

type Core = typeof import("./mathjaxCore");
let core: Promise<Core> | null = null;
const loadCore = () => (core ??= import(/* webpackChunkName: "mathjax" */ "./mathjaxCore"));

const cache = new Map<string, Promise<TexResult>>();

/** Points per curved segment when contours are flattened. */
const CURVE_DIVISIONS = 6;

function partOf(node: Element | null): string | null {
  for (let n: Element | null = node; n && n.tagName.toLowerCase() !== "svg"; n = n.parentElement) {
    const cls = (n.getAttribute("class") || "").trim();
    if (cls) return cls.split(/\s+/)[0];
  }
  return null;
}

function parse(tex: string, svg: string): TexResult {
  // MathJax's own size and placement (width/height in ex, a vertical-align
  // style, the viewBox) would rescale the paths; dropped, the coordinates
  // stay in MathJax's units: 1000 to the em, y down.
  const clean = svg
    .replace(/^<svg[^>]*>/, '<svg xmlns="http://www.w3.org/2000/svg">')
    .replace(/currentColor/g, "#000");
  const data = new SVGLoader().parse(clean);
  const glyphs: TexGlyph[] = [];
  const fmin = new THREE.Vector2(Infinity, Infinity);
  const fmax = new THREE.Vector2(-Infinity, -Infinity);
  const flip = (v: THREE.Vector2) => v.set(v.x / 1000, -v.y / 1000);

  for (const path of data.paths) {
    const shapes = SVGLoader.createShapes(path);
    if (shapes.length === 0) continue;
    const outlines: THREE.Vector2[][] = [];
    const min = new THREE.Vector2(Infinity, Infinity);
    const max = new THREE.Vector2(-Infinity, -Infinity);
    const flipped: THREE.Shape[] = [];
    for (const shape of shapes) {
      const contours = [shape.getPoints(CURVE_DIVISIONS), ...shape.holes.map((h) => h.getPoints(CURVE_DIVISIONS))];
      const out: THREE.Vector2[][] = [];
      for (const c of contours) {
        const pts = c.map((p) => flip(p.clone()));
        for (const p of pts) { min.min(p); max.max(p); }
        out.push(pts);
      }
      outlines.push(...out);
      // The fill shape, rebuilt in ems with +y up. Flipping y reverses the
      // winding, which ShapeGeometry does not mind.
      const s = new THREE.Shape(out[0]);
      for (let i = 1; i < out.length; i++) s.holes.push(new THREE.Path(out[i]));
      flipped.push(s);
    }
    fmin.min(min); fmax.max(max);
    glyphs.push({ shapes: flipped, outlines, part: partOf((path.userData as any)?.node ?? null), min, max });
  }
  if (glyphs.length === 0) { fmin.set(0, 0); fmax.set(0, 0); }
  return { tex, glyphs, min: fmin, max: fmax };
}

/**
 * Typeset `tex` (display mode). Cached by default; the same source resolves to
 * the same result. `keep = false` for long one-off lines (the blended slots'
 * hints and sentences): their outlines run to megabytes, and kept they stayed
 * for the session after their slot was gone.
 */
export function tex(src: string, keep = true): Promise<TexResult> {
  if (!keep) return cache.get(src) ?? loadCore().then((c) => parse(src, c.texToSvg(src)));
  let hit = cache.get(src);
  if (!hit) {
    hit = loadCore().then((c) => parse(src, c.texToSvg(src)));
    cache.set(src, hit);
  }
  return hit;
}

// ── Plain Spanish as TeX ─────────────────────────────────────────────────────
// The hints and sentences on the blended slots are written in formulas.json as
// ordinary Spanish. MathJax draws a non-ASCII letter inside \text{} as an SVG
// <text> node, which SVGLoader drops, so every accent, tilde and symbol leaves
// the \text run and is typeset as math: á → \acute{\mathrm{a}}, θ → \theta.
const MATH: Record<string, string> = {
  "á": "\\acute{\\mathrm{a}}", "é": "\\acute{\\mathrm{e}}", "í": "\\acute{\\mathrm{\\imath}}",
  "ó": "\\acute{\\mathrm{o}}", "ú": "\\acute{\\mathrm{u}}", "ü": "\\ddot{\\mathrm{u}}",
  "ñ": "\\tilde{\\mathrm{n}}", "Á": "\\acute{\\mathrm{A}}", "É": "\\acute{\\mathrm{E}}",
  "Í": "\\acute{\\mathrm{I}}", "Ó": "\\acute{\\mathrm{O}}", "Ú": "\\acute{\\mathrm{U}}",
  "Ñ": "\\tilde{\\mathrm{N}}", "ĉ": "\\hat{c}",
  "θ": "\\theta", "λ": "\\lambda", "η": "\\eta", "γ": "\\gamma", "τ": "\\tau",
  "σ": "\\sigma", "ε": "\\varepsilon", "Δ": "\\Delta", "Σ": "\\Sigma",
  "≥": "\\geq", "≤": "\\leq", "→": "\\to", "·": "\\cdot", "×": "\\times",
  "¬": "\\neg", "↑": "\\uparrow", "↓": "\\downarrow", "≈": "\\approx", "~": "\\sim",
  "|": "\\mid", "—": "\\text{-}", "–": "\\text{-}", "%": "\\%", "#": "\\#", "&": "\\&",
  "_": "\\_", "$": "\\$",
};
const DROP = new Set(["¿", "¡", "«", "»", "{", "}", "\\", "^", "“", "”"]);

/** A line of plain Spanish as display TeX that SVGLoader can read in full. */
export function texText(line: string): string {
  let out = "", run = "";
  const flush = () => { if (run) { out += `\\text{${run}}`; run = ""; } };
  for (const ch of line) {
    if (DROP.has(ch)) continue;
    const m = MATH[ch];
    if (m !== undefined) { flush(); out += m; continue; }
    run += ch;
  }
  flush();
  return out;
}
