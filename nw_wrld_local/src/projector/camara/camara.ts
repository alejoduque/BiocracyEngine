// ─── Slot C · Cámara ────────────────────────────────────────────────────────
//
// The Chamber's visual register, on key [C]. Two sources fold onto the one
// 365-day ring of Article 42:
//
//   cameratrap  Reserva MANAKAI, 22 captures, doy 222-234. Ocelote, puma,
//               aullador, mapache, garza — animals, seen.
//   audiomoth   the scrolling spectrogram rendered beside every corpus event.
//               Not new evidence: the same clip corpus/manifest.json already
//               schedules, seen instead of heard.
//
// Both are read from corpus/visual/index.json (tools/build_visual.py), which
// is why this module never touches the 3.8 GB of originals or the 20.5 GB of
// GIFs beside them.
//
// NOTHING IS VEILED HERE
// ----------------------
// There is no refusal list in this file and no species it will not draw. How
// much of the register reaches the screen is one control — /camara/opacity,
// CC 24, the Cámara Op fader in the right rail — and it boots at 1.0, every
// species projected, felids included.
//
// Turning it down does not blank the screen. Each clip carries a `sensitivity`
// from build_cameratrap.py, and the fader retires the register *in that
// order*: the two felids first, insects and rain last. Below its own threshold
// a clip still holds its place on the ring and still prints its record — date,
// station, taxon — with the picture replaced by phosphor noise and the word
// RETENIDO. The Chamber can therefore always see THAT it recorded something,
// even where it has decided not to show WHAT. Absence stays distinguishable
// from withholding, which is the only property that makes the fader honest.
//
// The picture is silent by construction: build_visual.py strips the audio
// track, because the corpus already sounds through SuperCollider and a second
// copy playing from a <video> element would double it.

import {
  CRT_DEFAULTS,
  CRT_BLACK,
  createCrtSurface,
  crtFont,
  setInk,
  type CrtOptions,
  type CrtSurface,
} from "./crt";

type Species = {
  taxon: string | null;
  rank: string;
  common: string;
  group: string;
  count: number;
  sensitivity: number;
};

type Clip = {
  key: string;
  register: "cameratrap" | "audiomoth";
  doy: number;
  date: string;
  temporada: string;
  duration_s: number;
  sensitivity: number;
  video: string;
  poster: string | null;
  diel?: string;
  species?: Species[];
  unlabelled?: boolean;
  role?: string;
  domain?: string;
};

type Index = {
  generated: string;
  registers: string[];
  counts: Record<string, number>;
  by_doy: Record<string, string[]>;
  clips: Clip[];
};

export type CamaraHooks = {
  applyViz?: (key: string, val: number) => void;
  sendOSC?: (address: string, value: number) => void;
};

const INDEX_URL = "/corpus/visual/index.json";
const ASSET_BASE = "/corpus/";

// How long one clip holds the screen when the ring is not driving.
//
// This was a flat 7 s for every clip, which meant an AudioMoth spectrogram —
// they run to 59.99 s — was cut off after the first eighth and never read as
// anything but a glimpse. The hold now comes from the clip's own duration_s,
// bounded at both ends: the floor stops the 0.62 s clips strobing the ring,
// and the ceiling stops a full-minute spectrogram stalling it.
const HOLD_MIN_MS = 6000;
const HOLD_MAX_MS = 20000;

/** How long this clip should hold the screen, from its own length. */
function holdMsFor(clip: Clip): number {
  const d = (clip.duration_s ?? 0) * 1000;
  if (!isFinite(d) || d <= 0) return HOLD_MIN_MS;
  return Math.max(HOLD_MIN_MS, Math.min(HOLD_MAX_MS, d));
}

// A /pheno/cursor older than this means SuperCollider is not running (or the
// ring is paused), and the module falls back to advancing itself.
const CURSOR_STALE_MS = 20000;

let _surface: CrtSurface | null = null;
let _raf = 0;
let _host: HTMLElement | null = null;
let _video: HTMLVideoElement | null = null;
let _ro: ResizeObserver | null = null;
let _hooks: CamaraHooks = {};

let _index: Index | null = null;
let _order: Clip[] = [];
let _cursor = 0;
let _lastAdvance = 0;
/** Hold for the clip currently on screen, set by show(). */
let _holdMs = HOLD_MIN_MS;
/** Per-register cursor, so alternating advances each one independently. */
const _regSeen = new Map<string, number>();
/** Visit count per ring day, so a multi-clip day rotates instead of pinning. */
const _doySeen = new Map<number, number>();
let _lastDoy = -1;
let _loadFailed: string | null = null;
let _pendingKey: string | null = null;
let _lastReported = "";

const _opts: CrtOptions = { ...CRT_DEFAULTS };

function w() {
  return window as unknown as {
    __camaraParams?: Record<string, number>;
    __phenoCursor?: { doy: number; temporada: string; at: number };
    __applyCamaraToViz?: (k: string, v: number) => void;
  };
}

/** The Chamber's projection amount. 1.0 = everything, which is the default. */
function opacityControl(): number {
  const v = w().__camaraParams?.opacity;
  return typeof v === "number" && isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
}

/**
 * How much of THIS clip the control currently lets through.
 *
 * At control 1.0 every clip returns 1.0 regardless of what it contains — the
 * felids are projected exactly like the crickets. As the control falls, a
 * clip fades in proportion to its own sensitivity, so the register recedes in
 * a deliberate order instead of dimming uniformly. sensitivity 0 (insects,
 * rain) never fades at all.
 */
function reveal(clip: Clip): number {
  const s = Math.max(0, Math.min(1, clip.sensitivity ?? 0));
  return Math.max(0, Math.min(1, 1 - s * (1 - opacityControl())));
}

/** Below this the picture is withheld and the record is printed instead. */
const RETAIN_AT = 0.12;

async function loadIndex(): Promise<void> {
  try {
    const res = await fetch(INDEX_URL, { cache: "no-cache" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const data = (await res.json()) as Index;
    _index = data;

    // Ring order: by day, camera trap ahead of spectrogram on days that hold
    // both, so an animal is seen before the machine's reading of the night.
    _order = [...(data.clips ?? [])].sort((a, b) =>
      a.doy - b.doy ||
      (a.register === b.register ? 0 : a.register === "cameratrap" ? -1 : 1) ||
      a.key.localeCompare(b.key)
    );
    if (!_order.length) _loadFailed = "index holds no clips";
  } catch (e) {
    _loadFailed = e instanceof Error ? e.message : String(e);
    console.error("[camara] index load failed:", _loadFailed);
  }
}

function show(i: number): void {
  if (!_order.length || !_video) return;
  _cursor = ((i % _order.length) + _order.length) % _order.length;
  const clip = _order[_cursor];
  if (!clip || _pendingKey === clip.key) return;
  _pendingKey = clip.key;
  _lastAdvance = performance.now();
  _holdMs = holdMsFor(clip);
  // Which clip is on screen and for how long, published for the DIAG monitor
  // (Shift+D) and for headless checks. Read-only telemetry.
  (window as unknown as { __camaraNow?: string }).__camaraNow = clip.key;
  (window as unknown as { __camaraHoldMs?: number }).__camaraHoldMs = _holdMs;

  const v = _video;
  v.src = ASSET_BASE + clip.video;
  // Silent by construction; muted as well as trackless so no autoplay policy
  // can block the element on audio grounds.
  v.muted = true;
  v.loop = true;
  const p = v.play();
  if (p && typeof p.catch === "function") p.catch(() => { /* poster stands in */ });

  report(clip);
}

/**
 * Publish what the window is showing. The reverse direction every slot in this
 * project carries: the module is a source, not only a sink.
 *
 *   /camara/doy       where the visual register stands on the ring
 *   /camara/reveal    how much of the current clip is reaching the screen
 *   /camara/felid     1 while a felid is on screen, 0 otherwise
 */
function report(clip: Clip): void {
  const send = _hooks.sendOSC;
  if (!send) return;
  const sig = `${clip.key}|${reveal(clip).toFixed(2)}`;
  if (sig === _lastReported) return;
  _lastReported = sig;
  send("/camara/doy", clip.doy);
  send("/camara/reveal", reveal(clip));
  send(
    "/camara/felid",
    (clip.species ?? []).some((s) => s.group === "felid") ? 1 : 0
  );
}

/**
 * Index into _order of the clip to show for a ring day, or -1 if that day
 * holds nothing.
 *
 * This deliberately does NOT read by_doy's ordering. That array is written by
 * tools/build_visual.py, which sorts on (doy, register, key) — and
 * "audiomoth" sorts before "cameratrap", so taking by_doy[0] handed back the
 * spectrogram on every day that holds both. The four overlapping days
 * (224, 228, 229, 234) are exactly the days a camera trap exists to show, and
 * they were the four it could never be seen on. _order already sorts camera
 * trap first for precisely this reason; that intent was written and then
 * bypassed by the lookup, so the lookup is what changes.
 *
 * Repeat visits to the same day rotate through its clips rather than pinning
 * the first, so a day holding six AudioMoth events is not one frozen frame.
 */
function pickForDoy(doy: number): number {
  const idx: number[] = [];
  for (let i = 0; i < _order.length; i++) {
    if (_order[i].doy === doy) idx.push(i);
  }
  if (!idx.length) return -1;

  // Camera trap leads on a shared day: the animal is the rarer event and the
  // one a viewer can actually read, where a spectrogram is the machine's own
  // account of the same night.
  const ct = idx.filter((i) => _order[i].register === "cameratrap");
  const pool = ct.length ? ct : idx;

  const seen = (_doySeen.get(doy) ?? 0) % pool.length;
  _doySeen.set(doy, seen + 1);
  return pool[seen];
}

/**
 * The next clip for the self-advancing ring — NOT simply _cursor + 1.
 *
 * _order is chronological, and the camera trap all falls on doys 222-234,
 * which lands it at positions 240-279 of 283. Stepping +1 from zero therefore
 * spends about eighty minutes on AudioMoth spectrograms before the first
 * animal appears, which reads as "the camera trap is missing" because in any
 * realistic session it is.
 *
 * So the traversal alternates registers instead: each step moves forward
 * within one register and then hands over to the other. The ring stays
 * chronological within each register — the order is not shuffled — but both
 * registers are always in view. When SuperCollider is driving /pheno/cursor
 * this is bypassed entirely and the day decides, as before.
 */
function nextIndex(): number {
  const cur = _order[_cursor];
  const want: Clip["register"] =
    cur && cur.register === "cameratrap" ? "audiomoth" : "cameratrap";

  // Each register keeps its OWN position, so alternating does not restart the
  // walk every time. Searching forward from _cursor instead would wrap back to
  // the first camera trap after only a handful of steps — the 22 captures are
  // contiguous in the chronological order, so a forward search from an
  // AudioMoth clip in July always lands on the same one.
  const pool: number[] = [];
  for (let i = 0; i < _order.length; i++) {
    if (_order[i].register === want) pool.push(i);
  }
  // Only one register present in the index — fall back to plain succession.
  if (!pool.length) return (_cursor + 1) % _order.length;

  // Seed from where this register currently stands rather than from -1, so the
  // very first hand-back does not replay the clip that is already on screen.
  let seen = _regSeen.get(want);
  if (seen === undefined) {
    const at = pool.indexOf(_cursor);
    seen = at >= 0 ? at : pool.findIndex((i) => i > _cursor);
    if (seen < 0) seen = -1;
  }
  seen += 1;
  _regSeen.set(want, seen);
  return pool[seen % pool.length];
}

function advance(now: number): void {
  if (!_order.length) return;

  // Follow the audio ring when it is live: the picture belongs to the day the
  // corpus is sounding. Falls back to self-advancing when SC is not running,
  // so slot C is legible on its own.
  const cur = w().__phenoCursor;
  if (cur && now - cur.at < CURSOR_STALE_MS) {
    if (cur.doy !== _lastDoy) {
      _lastDoy = cur.doy;
      const i = pickForDoy(cur.doy);
      if (i >= 0) {
        show(i);
      } else {
        // Nothing recorded on this ring day. Hold the last picture rather
        // than blanking — the corpus cursor above already says "ausencia",
        // and two readouts saying it is one too many.
        _lastAdvance = now;
      }
    }
    return;
  }

  if (now - _lastAdvance > _holdMs) show(nextIndex());
}

// ─── Painting ───────────────────────────────────────────────────────────────

function fit(vw: number, vh: number, bw: number, bh: number) {
  const s = Math.min(bw / vw, bh / vh);
  const dw = vw * s;
  const dh = vh * s;
  return { dw, dh, dx: (bw - dw) / 2, dy: (bh - dh) / 2 };
}

/** Phosphor snow, for a clip the Chamber has decided to hold back. */
function noise(ctx: CanvasRenderingContext2D, x: number, y: number, bw: number, bh: number, t: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, bw, bh);
  ctx.clip();
  ctx.shadowBlur = 0;
  // fract(sin(dot(p)) * 43758.5453) — the standard hash, and the order matters:
  // folding the large multiplier inside the sin() instead of after it makes the
  // argument alias against the loop stride and the field comes out as a moiré
  // of diagonal stripes rather than snow.
  const step = 3;
  for (let iy = 0; iy < bh; iy += step) {
    for (let ix = 0; ix < bw; ix += step) {
      const s = Math.sin(ix * 12.9898 + iy * 78.233 + t * 5.3) * 43758.5453;
      const n = s - Math.floor(s);
      if (n > 0.86) {
        ctx.fillStyle = `rgba(141,240,180,${(n - 0.86) * 1.6})`;
        ctx.fillRect(x + ix, y + iy, step, step);
      }
    }
  }
  ctx.restore();
}

function paint(ctx: CanvasRenderingContext2D, W: number, H: number, now: number): void {
  advance(now);

  // Curve-safe margins. The CRT shader bends the texture outward before it is
  // sampled, so pixels near an edge are stretched and the last few are thrown
  // away entirely by the `inside` mask. Text laid out to the true edge comes
  // back ghosted and clipped. The reference renderer solves this by starting
  // its script 13.5% down and using only the middle 74% of the height; these
  // insets are that same budget, and the horizontal one is wider because the
  // barrel term is stronger on x (0.115) than the vertical mask allows for.
  const pad = Math.round(W * 0.075);
  const padY = Math.round(H * 0.115);
  const type = Math.max(8, Math.min(15, W * 0.0165));
  const line = type * 1.62;
  ctx.textBaseline = "top";
  ctx.font = crtFont(type);

  let y = padY;

  // ── Header ──
  setInk(ctx, "h", type);
  ctx.fillText("CÁMARA FENOLÓGICA", pad, y);
  setInk(ctx, "d", type);
  const hw = ctx.measureText("CÁMARA FENOLÓGICA ").width;
  ctx.fillText("· registro visual", pad + hw, y);
  y += line;

  setInk(ctx, "d", type);
  ctx.fillText("Reserva MANAKAI · bosque seco tropical · Córdoba", pad, y);
  y += line * 1.25;

  if (_loadFailed) {
    setInk(ctx, "a", type);
    ctx.fillText("SIN REGISTRO", pad, y);
    y += line;
    setInk(ctx, "d", type);
    ctx.fillText(_loadFailed.slice(0, 52), pad, y);
    y += line * 1.4;
    setInk(ctx, "d", type);
    ctx.fillText("construir con:", pad, y);
    y += line;
    setInk(ctx, "p", type);
    ctx.fillText("python3 tools/build_cameratrap.py", pad, y);
    y += line;
    ctx.fillText("python3 tools/build_visual.py", pad, y);
    return;
  }

  const clip = _order[_cursor];
  if (!clip) {
    setInk(ctx, "d", type);
    ctx.fillText("cargando registro…", pad, y);
    return;
  }

  const rev = reveal(clip);
  const held = rev < RETAIN_AT;

  // ── The picture ──
  // The pane takes the FOOTAGE's shape, not the panel's.
  //
  // It used to span the full width and take whatever height was left over,
  // which on the real surface (561x408) came to 477x113 — a 4.21:1 slot for
  // material that is 16:9 in both registers. fit() then letterboxed correctly
  // into 42% of the width, and the wide empty side margins read as a broken
  // crop. Deriving width from height instead makes the box 365x205, the video
  // fills it exactly, and the picture is ~3.3x larger.
  //
  // Height is still bounded by what the header and the record leave behind —
  // the record is four lines now, not seven, which is what buys the room.
  const maxW = W - pad * 2;
  const avail = H - padY * 2 - y - line * 4;
  const bh = Math.max(Math.round(H * 0.22), Math.min(Math.round(maxW * 9 / 16), avail));
  const bw = Math.min(maxW, Math.round(bh * 16 / 9));
  const bx = pad + Math.round((maxW - bw) / 2);
  const by = y;
  // Pane geometry, published alongside __camaraNow so the aspect match can be
  // checked without measuring pixels in a screenshot.
  (window as unknown as { __camaraGeom?: Record<string, number> }).__camaraGeom = {
    bw, bh, aspect: +(bw / bh).toFixed(3),
    vw: _video?.videoWidth ?? 0, vh: _video?.videoHeight ?? 0,
  };

  ctx.save();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#04160d";
  ctx.fillRect(bx, by, bw, bh);

  if (held) {
    noise(ctx, bx, by, bw, bh, now * 0.001);
    ctx.font = crtFont(type * 1.15, 700);
    setInk(ctx, "a", type);
    const label = "RETENIDO";
    const lw = ctx.measureText(label).width;
    ctx.fillText(label, bx + (bw - lw) / 2, by + bh / 2 - type * 0.6);
    ctx.font = crtFont(type);
  } else if (_video && _video.readyState >= 2 && _video.videoWidth > 0) {
    const { dw, dh, dx, dy } = fit(_video.videoWidth, _video.videoHeight, bw, bh);
    ctx.globalAlpha = rev;
    ctx.drawImage(_video, bx + dx, by + dy, dw, dh);
    ctx.globalAlpha = 1;
  } else {
    setInk(ctx, "d", type);
    ctx.fillText("···", bx + bw / 2 - type, by + bh / 2 - type * 0.5);
  }

  // Frame the pane so the picture reads as something on the screen rather
  // than a hole cut through it.
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(141,240,180,0.30)";
  ctx.lineWidth = 1;
  ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
  ctx.restore();

  y = by + bh + line * 0.7;

  // ── The record ──
  // Printed whether or not the picture is shown. This is what keeps
  // withholding distinguishable from absence.
  //
  // Condensed from seven lines to four so the picture can have the height:
  // identity and provenance now share one line each, and the species list is
  // capped at two. Nothing was dropped — doy, date, temporada, register and
  // the opacity readout are all still here, just set tighter.
  const reg = clip.register === "cameratrap" ? "CT" : "AM";
  setInk(ctx, "p", type);
  const doyStr = `doy ${String(clip.doy).padStart(3, "0")}`;
  ctx.fillText(doyStr, pad, y);
  setInk(ctx, "d", type);
  ctx.fillText(
    `${clip.date} · ${clip.temporada}`,
    pad + ctx.measureText(`${doyStr}  `).width, y,
  );
  y += line;

  // Register, and what this clip is: diel + length for a capture, ecological
  // role for a spectrogram.
  setInk(ctx, "d", type);
  ctx.fillText(
    `${reg} · ${clip.register === "cameratrap"
      ? `${clip.diel ?? "—"} · ${clip.duration_s.toFixed(1)}s`
      : `${clip.role || clip.domain || "—"}`}`,
    pad, y,
  );
  y += line;

  // ── What is in frame ──
  const sp = clip.species ?? [];
  if (sp.length) {
    for (const s of sp.slice(0, 2)) {
      setInk(ctx, s.group === "felid" ? "a" : "p", type);
      const name = s.count > 1 ? `${s.common} ×${s.count}` : s.common;
      ctx.fillText(name, pad, y);
      if (s.taxon) {
        setInk(ctx, "d", type);
        ctx.fillText(`  ${s.taxon}`, pad + ctx.measureText(name).width, y);
      }
      y += line;
    }
  } else if (clip.register === "cameratrap") {
    setInk(ctx, "d", type);
    ctx.fillText("sin etiqueta — captura sin identificar", pad, y);
    y += line;
  }

  // ── The fader, stated ──
  // The one number that explains the screen. Printed always, so a dark pane is
  // never mistaken for a broken one.
  y += line * 0.35;
  const ctrl = opacityControl();
  setInk(ctx, "d", type);
  ctx.fillText("opacidad", pad, y);

  const barX = pad + ctx.measureText("opacidad  ").width;
  const barW = W - barX - pad;
  const barH = Math.max(3, Math.round(type * 0.34));
  const barY = y + type * 0.42;
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(141,240,180,0.16)";
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = held ? "#ffba5e" : "#8df0b4";
  ctx.fillRect(barX, barY, Math.max(1, barW * ctrl), barH);
  y += line;

  setInk(ctx, held ? "a" : "d", type);
  ctx.fillText(
    held
      ? `retenido por la Cámara · ${(ctrl * 100).toFixed(0)}%`
      : `proyectando ${(rev * 100).toFixed(0)}% · ${(ctrl * 100).toFixed(0)}% cámara`,
    pad, y,
  );

  // ── Ring position ──
  // Held inside the same curve-safe band as the text: at H-pad it lands in the
  // stretched zone and reads as a bowed wire rather than a scale.
  const rx = pad;
  const ry = H - padY;
  const rw = W - pad * 2;
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(141,240,180,0.12)";
  ctx.fillRect(rx, ry, rw, 2);
  for (const c of _order) {
    ctx.fillStyle = c.register === "cameratrap"
      ? "rgba(255,186,94,0.55)"
      : "rgba(141,240,180,0.30)";
    ctx.fillRect(rx + (rw * (c.doy - 1)) / 365, ry, 1, 2);
  }
  ctx.fillStyle = "#eafff3";
  ctx.fillRect(rx + (rw * (clip.doy - 1)) / 365 - 1, ry - 3, 3, 8);
}

// ─── Mount / destroy ────────────────────────────────────────────────────────

export async function mountCamara(host: HTMLElement, hooks: CamaraHooks = {}) {
  _hooks = hooks;
  _host = host;
  _loadFailed = null;
  _cursor = 0;
  _lastDoy = -1;
  _pendingKey = null;
  _lastReported = "";

  host.style.background = CRT_BLACK;

  const canvas = document.createElement("canvas");
  canvas.style.cssText = "display:block;width:100%;height:100%;";
  host.appendChild(canvas);

  // Kept out of the document: this element is a frame source for the CRT
  // texture, never something the user sees directly. crossOrigin is not set
  // because it is served same-origin, and drawImage would taint the 2D canvas
  // otherwise — which would break the texture upload, not just the pixel read.
  const video = document.createElement("video");
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "auto";
  _video = video;

  await loadIndex();

  _surface = createCrtSurface(host, canvas, () => _opts, paint);
  _surface.resize();

  if (_order.length) show(0);

  _ro = new ResizeObserver(() => _surface?.resize());
  _ro.observe(host);

  const loop = (now: number) => {
    _surface?.render(now);
    _raf = requestAnimationFrame(loop);
  };
  _raf = requestAnimationFrame(loop);

  // Slot C's end of the control. parliamentEntry calls this on every
  // /camara/* change, from the fader or from SC's echo.
  // The value itself is read back through __camaraParams by reveal(), so this
  // only needs to know that something moved.
  // Manual advance for the ▶ in the right rail. Steps the same interleaved
  // traversal the self-advance uses, so a click behaves exactly like waiting.
  (window as unknown as { __camaraNext?: () => void }).__camaraNext = () => {
    if (_order.length) show(nextIndex());
  };

  w().__applyCamaraToViz = (key: string, _v: number) => {
    if (key === "opacity" && _order[_cursor]) {
      // Re-announce immediately so the fader's effect is audible in the same
      // gesture that produced it, rather than at the next clip change.
      _lastReported = "";
      report(_order[_cursor]);
    }
  };

  return {
    name: "Cámara",
    clips: () => _order.length,
    resize: () => _surface?.resize(),
  };
}

export function destroyCamara(): void {
  if (_raf) cancelAnimationFrame(_raf);
  _raf = 0;
  _ro?.disconnect();
  _ro = null;
  _surface?.dispose();
  _surface = null;

  if (_video) {
    _video.pause();
    // Release the decoder rather than leaving a detached element holding a
    // buffered h264 stream: slots are switched by keypress and this would
    // otherwise accumulate one live decode per visit.
    _video.removeAttribute("src");
    _video.load();
    _video = null;
  }

  if (_host) {
    while (_host.firstChild) _host.removeChild(_host.firstChild);
    _host = null;
  }

  if (w().__applyCamaraToViz) delete w().__applyCamaraToViz;
  // Drop the telemetry too, so a dead slot does not leave a stale clip key
  // behind for the DIAG monitor to report as live.
  {
    const g = window as unknown as Record<string, unknown>;
    delete g.__camaraNext;
    delete g.__camaraNow;
    delete g.__camaraHoldMs;
    delete g.__camaraGeom;
  }
  _doySeen.clear();
  _regSeen.clear();
  _index = null;
  _order = [];
  _hooks = {};
}
