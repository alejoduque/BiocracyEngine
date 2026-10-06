// domeCard.ts — text a slot exchanges, made readable on the dome
// ===========================================================================
// A slot's words often live in the page's HTML — a terminal log, a census
// column, the pairs a proof verifies — over its WebGL canvas, where the
// dome's cube camera never sees them. A card draws that same text into a
// small 2-D canvas of its own and registers it with the dome as a "card"
// layer (domeCapture.ts): a flat page at a set azimuth and elevation, sized
// in degrees, so it reads like a page held in front of the audience rather
// than lettering smeared round the fisheye.
//
// The text is read from the slot (a function), redrawn only when it changes
// and at most a few times a second; the canvas is never shown in the page.
// Lines are cut, not wrapped: a dome card is a fixed page, and a line that
// reflows every update is unreadable at the back of a 23 m room.

import { registerDomeLayer, type DomeCardPlace } from "./domeCapture";

export type DomeCardOpts = DomeCardPlace & {
  /** The text, read each update: a string (split on newlines) or lines. */
  text: () => string | string[];
  /** Characters per line and lines per page; the canvas is sized from them. */
  cols?: number;
  rows?: number;
  /** Optional heading, drawn brighter on the first line. */
  title?: string;
  /** Ink. */
  color?: string;
  /** Updates per second, at most. */
  hz?: number;
  /** Which end of a long text to keep: "end" for a log (default), "start" for a report. */
  keep?: "start" | "end";
};

const FONT = "'IBM Plex Mono', 'SF Mono', Menlo, Consolas, monospace";
const PX = 30;                 // glyph height on the canvas
const LH = Math.round(PX * 1.32);
const PAD = 22;

/** Mount a card inside `host` (which must sit on the stage). Returns its destroy(). */
export function mountDomeCard(host: HTMLElement, o: DomeCardOpts): () => void {
  const cols = o.cols ?? 46;
  const rows = o.rows ?? 12;
  const canvas = document.createElement("canvas");
  canvas.style.display = "none";
  canvas.setAttribute("aria-hidden", "true");
  const ctx = canvas.getContext("2d")!;
  ctx.font = `${PX}px ${FONT}`;
  const cw = Math.ceil(ctx.measureText("M").width);
  canvas.width = PAD * 2 + cols * cw;
  canvas.height = PAD * 2 + (rows + (o.title ? 1 : 0)) * LH;
  host.appendChild(canvas);
  const ink = o.color ?? "#e6e6dc";

  let last = "";
  const draw = () => {
    const raw = o.text();
    const lines = (Array.isArray(raw) ? raw : String(raw ?? "").split("\n"))
      .map((l) => l.replace(/\s+$/, ""))
      .filter((l, i, a) => l.length > 0 || (i > 0 && a[i - 1].length > 0));   // no runs of blank lines
    const page = (o.keep === "start" ? lines.slice(0, rows) : lines.slice(-rows)).map((l) => (l.length > cols ? l.slice(0, cols - 1) + "…" : l));
    const key = page.join("\n");
    if (key === last) return;
    last = key;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    // A dark plate behind the words: the dome image under a card is never
    // guaranteed to be dark, and text has to win against it.
    ctx.fillStyle = "rgba(0,0,0,0.62)";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);
    ctx.font = `${PX}px ${FONT}`;
    ctx.textBaseline = "top";
    let y = PAD;
    if (o.title) {
      ctx.fillStyle = "#ffffff";
      ctx.fillText(o.title.toUpperCase().slice(0, cols), PAD, y);
      y += LH;
    }
    ctx.fillStyle = ink;
    for (const l of page) { ctx.fillText(l, PAD, y); y += LH; }
  };

  draw();
  const timer = setInterval(draw, 1000 / (o.hz ?? 4));
  const unregister = registerDomeLayer(canvas, { mode: "card", place: { az: o.az, el: o.el, w: o.w }, blend: "over" });
  return () => {
    clearInterval(timer);
    unregister();
    canvas.remove();
  };
}

/**
 * A crawl of text as the dome's "band" layer — the rings of text round the
 * dome (domemaster.ts). For a slot whose ticker is HTML.
 */
export function mountDomeBand(host: HTMLElement, text: () => string, color = "#e6a648"): () => void {
  const canvas = document.createElement("canvas");
  canvas.style.display = "none";
  canvas.setAttribute("aria-hidden", "true");
  canvas.width = 2048; canvas.height = 48;
  const ctx = canvas.getContext("2d")!;
  host.appendChild(canvas);
  let last = "";
  const draw = () => {
    // The latest part of a long crawl: the strip holds ~110 characters.
    let t = (text() || "").replace(/\s+/g, " ").trim();
    if (t.length > 120) { t = t.slice(-120); t = t.slice(Math.max(0, t.indexOf(" ") + 1)); }
    if (t === last) return;
    last = t;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = `30px ${FONT}`;
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    // Repeat to fill the strip: the band is a ring, it has no end.
    const unit = t + "   ▸   ";
    const w = Math.max(1, ctx.measureText(unit).width);
    for (let x = 8; x < canvas.width; x += w) ctx.fillText(unit, x, canvas.height / 2);
  };
  draw();
  const timer = setInterval(draw, 500);
  const unregister = registerDomeLayer(canvas, { mode: "band" });
  return () => { clearInterval(timer); unregister(); canvas.remove(); };
}
