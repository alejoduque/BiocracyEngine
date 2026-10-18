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
// Every formula is set in TeX's sans-serif (sans() below). Plain lines — the
// stage header, the hints, the lexicon — are not TeX at all: monoText() takes
// their outlines from JetBrains Mono, the open face in slot E's font stack,
// so the blended slots and Estratos read as one typography. Both come out as
// the same TexResult, and Write, Unwrite and Transform treat them alike.
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
  /** Advance per character, ems — monoText only. */
  advance?: number;
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
 * The whole formula in TeX's sans-serif. \mathsf carries into fractions,
 * scripts and \class parts; \text and \mathrm name their own face, so
 * they are swapped for the sans one. Lowercase Greek has no sans form in
 * MathJax's fonts and stays as it was.
 */
function sans(src: string): string {
  return `\\mathsf{${src.replace(/\\text\{/g, "\\textsf{").replace(/\\mathrm\{/g, "\\mathsf{")}}`;
}

/**
 * Typeset `tex` (display mode). Cached by default; the same source resolves to
 * the same result. `keep = false` for long one-off lines (the blended slots'
 * hints and sentences): their outlines run to megabytes, and kept they stayed
 * for the session after their slot was gone.
 */
export function tex(src: string, keep = true): Promise<TexResult> {
  const run = () => loadCore().then((c) => parse(src, c.texToSvg(sans(src))));
  if (!keep) return cache.get(src) ?? run();
  let hit = cache.get(src);
  if (!hit) {
    hit = run();
    cache.set(src, hit);
  }
  return hit;
}

// ── Plain lines in slot E's monospace ────────────────────────────────────────
// Estratos writes its sentences in ui-monospace (SF Mono on the show's Mac) at
// weight 600, onto a canvas. These lines must be outlines instead, to be
// written and unwritten like the formulas, so the face is a file: JetBrains
// Mono SemiBold (OFL, next to it in the assets), the open member of the same
// stack. Each character becomes one <path> at 1000 units to the em, y down —
// MathJax's own units — and goes through parse() like a formula.
const MONO_URL = "/ecosystems/default_ecosystem/assets/fonts/JetBrainsMonoNL-SemiBold.ttf";
let mono: Promise<any> | null = null;
const loadMono = () => (mono ??= Promise.all([
  fetch(MONO_URL).then((r) => {
    if (!r.ok) throw new Error(`mono font ${r.status}`);
    return r.arrayBuffer();
  }),
  import(/* webpackChunkName: "opentype" */ "three/examples/jsm/libs/opentype.module.js"),
]).then(([buf, ot]) => (ot as any).parse(buf)));

/**
 * A line of plain text as outlines in slot E's monospace. Not cached: these
 * are the long one-off lines. If the font cannot be had, the line is set in
 * TeX's sans instead, so a slot never comes up without its text.
 */
export function monoText(line: string): Promise<TexResult> {
  return loadMono().then((font) => {
    const k = 1000 / font.unitsPerEm;
    let x = 0, svg = '<svg xmlns="http://www.w3.org/2000/svg">';
    for (const ch of line) {
      const g = font.charToGlyph(ch);
      const d = g.getPath(x, 0, 1000).toPathData(1);
      if (d) svg += `<path d="${d}"/>`;
      x += (g.advanceWidth ?? font.unitsPerEm * 0.6) * k;
    }
    const r = parse(line, svg + "</svg>");
    r.advance = (font.charToGlyph("0").advanceWidth ?? 600) / font.unitsPerEm;
    return r;
  }, (e) => {
    console.warn("[tex] monospace unavailable, setting the line in TeX", e);
    return tex(texText(line), false);
  });
}

// ── Plain Spanish as TeX ─────────────────────────────────────────────────────
// monoText's fallback when the font cannot be loaded. MathJax draws a
// non-ASCII letter inside \text{} as an SVG <text> node, which SVGLoader
// drops, so every accent, tilde and symbol leaves the \text run and is
// typeset as math: á → \acute{\mathrm{a}}, θ → \theta.
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
