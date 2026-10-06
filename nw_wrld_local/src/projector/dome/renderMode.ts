// renderMode.ts — the page as an offline renderer (?render=1)
// ===========================================================================
// dome-render.js opens parliament.html?render=1 in a hidden Electron window
// and plays a recorded session into it, frame by frame, to render the dome at
// 4096 — slower than real time, and exactly in time with the recording.
//
// That only works if the page has no clock of its own. So, imported before
// anything else, this module replaces every source of time a slot can read:
//
//   performance.now, Date.now, new Date()     → virtual time
//   setTimeout / setInterval (+ clear)        → a virtual timer queue
//   requestAnimationFrame (+ cancel)          → one call per rendered frame
//   <video> playback                          → seeked frame by frame
//
// and the bridge socket (ws://…:3334) with a replay socket that delivers the
// logged messages at their logged times. Other sockets (laser, dome bridge)
// never connect, quietly. Nothing in any slot changes: they ask for the time
// and get the session's.
//
// The renderer drives it through window.__render:
//   ready()                 the page is up and the dome is open
//   step(toMs, items)       deliver items with t ≤ toMs, run timers, run one
//                           animation frame; resolves when videos have seeked
//   frame()                 render the dome and hand the pixels to the
//                           renderer (window.__renderOut, from its preload)
//
// Outside ?render this module does nothing at all.

export const RENDER_MODE = new URLSearchParams(location.search).has("render");

type Item = { t: number; m?: unknown; s?: Record<string, any> };

type DomeHooks = {
  ready: () => boolean;
  renderOnce: () => void;
  read: () => { width: number; height: number; data: Uint8Array };
  apply: (settings: Record<string, unknown>) => void;
};

if (RENDER_MODE) install();

function install() {
  const W = window as any;
  const params = new URLSearchParams(location.search);
  // The real setTimeout, for the few waits that are about the renderer, not
  // the page. Taken before it is replaced below: timers live on the window
  // itself, not its prototype, so there is no getting it back afterwards.
  const realSetTimeout: (fn: () => void, ms: number) => unknown = window.setTimeout.bind(window);

  // ── Virtual time ──────────────────────────────────────────────────────────
  // vt is milliseconds since the page loaded; the wall clock is the
  // session's own (?epoch=ms), so date-driven slots — the phenological
  // calendar above all — show the day the session was played, not the day it
  // was rendered.
  let vt = 0;
  const epoch = Number(params.get("epoch")) || Date.now();
  const RealDate = Date;

  performance.now = () => vt;
  class VirtualDate extends RealDate {
    constructor(...a: any[]) {
      if (a.length === 0) super(epoch + vt);
      else super(...(a as [any]));
    }
    static now() { return epoch + vt; }
  }
  W.Date = VirtualDate;

  // ── Virtual timers ────────────────────────────────────────────────────────
  type Timer = { id: number; due: number; fn: (...a: any[]) => void; args: any[]; every: number };
  const timers = new Map<number, Timer>();
  let nextId = 1;

  function schedule(fn: any, ms: any, args: any[], repeat: boolean): number {
    if (typeof fn !== "function") return 0;
    const id = nextId++;
    // At least 1 ms: a setTimeout(f, 0) chain then walks forward in time
    // instead of spinning forever inside one advance().
    const d = Math.max(1, Number(ms) || 0);
    timers.set(id, { id, due: vt + d, fn, args, every: repeat ? d : 0 });
    return id;
  }
  W.setTimeout = (fn: any, ms?: any, ...args: any[]) => schedule(fn, ms, args, false);
  W.setInterval = (fn: any, ms?: any, ...args: any[]) => schedule(fn, ms, args, true);
  W.clearTimeout = W.clearInterval = (id: number) => { timers.delete(id); };

  /** Run every timer due up to `to`, in order, with the clock at each one's time. */
  function advance(to: number) {
    for (let guard = 0; guard < 100000; guard++) {
      let next: Timer | null = null;
      for (const tm of timers.values()) if (tm.due <= to && (!next || tm.due < next.due)) next = tm;
      if (!next) break;
      vt = Math.max(vt, next.due);
      if (next.every) next.due += next.every; else timers.delete(next.id);
      try { next.fn(...next.args); } catch (e) { console.error("[render] timer threw:", e); }
    }
    vt = Math.max(vt, to);
  }

  // ── Virtual animation frames ──────────────────────────────────────────────
  let frameCbs = new Map<number, FrameRequestCallback>();
  W.requestAnimationFrame = (cb: FrameRequestCallback) => { const id = nextId++; frameCbs.set(id, cb); return id; };
  W.cancelAnimationFrame = (id: number) => { frameCbs.delete(id); };

  function runFrame() {
    const cbs = frameCbs;
    frameCbs = new Map();
    for (const cb of cbs.values()) {
      try { cb(vt); } catch (e) { console.error("[render] frame callback threw:", e); }
    }
  }

  // ── Video: no playback, a seek per frame ──────────────────────────────────
  // play() only marks the element as running; each step moves its
  // currentTime by the frame's duration and waits for the seek, so a clip
  // shows the frame it would have shown at that moment of the session.
  const MP = HTMLMediaElement.prototype as any;
  const running = new Set<HTMLMediaElement>();
  const realPaused = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "paused")!;
  MP.play = function (this: HTMLMediaElement) {
    (this as any).__vplay = true;
    this.autoplay = false;
    running.add(this);
    return Promise.resolve();
  };
  MP.pause = function (this: HTMLMediaElement) {
    (this as any).__vplay = false;
    running.delete(this);
  };
  Object.defineProperty(MP, "paused", {
    configurable: true,
    get(this: any) { return "__vplay" in this ? !this.__vplay : realPaused.get!.call(this); },
  });

  function seeked(v: HTMLMediaElement): Promise<void> {
    return new Promise((res) => {
      const done = () => { v.removeEventListener("seeked", done); res(); };
      v.addEventListener("seeked", done);
      // A seek that never reports (no data yet, src swapped) must not stall
      // the render; the real clock is the right one for this wait.
      realSetTimeout(done, 2000);
    });
  }

  /** A clip still loading holds the render: the session's time must not run on without its picture. */
  function loaded(v: HTMLMediaElement): Promise<void> {
    if (v.readyState >= 2) return Promise.resolve();
    return new Promise((res) => {
      const done = () => { v.removeEventListener("loadeddata", done); v.removeEventListener("error", done); res(); };
      v.addEventListener("loadeddata", done);
      v.addEventListener("error", done);
      // a clip that never loads (missing file) costs ten real seconds, once
      realSetTimeout(done, 10000);
    });
  }

  async function stepVideos(dtSec: number) {
    const waits: Promise<void>[] = [];
    const ended: HTMLMediaElement[] = [];
    // Before moving time on, wait for every playing clip to have a picture.
    // Without this the camera slot (C) rendered black for ~45 s of a session:
    // its clip loads in real time while the virtual clock runs far ahead.
    await Promise.all([...running].filter((v) => v.readyState < 2 && (v.src || v.currentSrc)).map(loaded));
    for (const v of running) {
      if (!v.isConnected && !v.src && !v.currentSrc) { running.delete(v); continue; }
      const dur = v.duration;
      if (!Number.isFinite(dur) || dur <= 0 || v.readyState < 1) continue;   // failed to load: holds
      let t = v.currentTime + dtSec;
      if (t >= dur) {
        if (v.loop) t %= dur;
        else { t = dur; (v as any).__vplay = false; running.delete(v); ended.push(v); }
      }
      waits.push(seeked(v));
      v.currentTime = t;
    }
    await Promise.all(waits);
    for (const v of ended) v.dispatchEvent(new Event("ended"));
  }

  // ── Loading, held ─────────────────────────────────────────────────────────
  // A slot loads its code and its data (clip index, assets) in real time. The
  // session's clock must not run ahead while it does, or the render shows
  // black for however long the loading took. Every step waits — up to 8 real
  // seconds — for slot mounts and the page's own fetches to settle.
  let inflight = 0;
  const realFetch = window.fetch.bind(window);
  W.fetch = (...a: Parameters<typeof fetch>) => {
    inflight++;
    return realFetch(...a).finally(() => { inflight--; });
  };
  async function settled() {
    const t0 = RealDate.now();
    while ((inflight > 0 || (W.__slotMounting ?? 0) > 0) && RealDate.now() - t0 < 8000) {
      await new Promise<void>((r) => realSetTimeout(r, 25));
    }
  }

  // ── The bridge socket, replayed ───────────────────────────────────────────
  const BRIDGE = /:3334(\/|$)/;
  const bridgeSockets = new Set<ReplaySocket>();

  class ReplaySocket extends EventTarget {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;
    readonly CONNECTING = 0;
    readonly OPEN = 1;
    readonly CLOSING = 2;
    readonly CLOSED = 3;
    readyState = 0;
    binaryType: BinaryType = "blob";
    bufferedAmount = 0;
    extensions = "";
    protocol = "";
    url: string;
    onopen: ((e: Event) => void) | null = null;
    onmessage: ((e: MessageEvent) => void) | null = null;
    onclose: ((e: CloseEvent) => void) | null = null;
    onerror: ((e: Event) => void) | null = null;

    constructor(url: string | URL) {
      super();
      this.url = String(url);
      // Anything but the bridge stays CONNECTING for good: no open, no close,
      // so nothing retries. The laser and the dome bridge are live outputs.
      if (BRIDGE.test(this.url)) {
        bridgeSockets.add(this);
        schedule(() => {
          if (this.readyState !== 0) return;
          this.readyState = 1;
          this.emit("open", new Event("open"));
        }, 0, [], false);
      }
    }
    send() { /* SC is not listening: its answers are already in the log */ }
    close() {
      if (this.readyState >= 2) return;
      this.readyState = 3;
      bridgeSockets.delete(this);
      schedule(() => this.emit("close", new CloseEvent("close", { wasClean: true, code: 1000 })), 0, [], false);
    }
    emit(type: string, ev: Event) {
      this.dispatchEvent(ev);
      const h = (this as any)["on" + type];
      if (typeof h === "function") {
        try { h.call(this, ev); } catch (e) { console.error("[render] socket handler threw:", e); }
      }
    }
  }
  W.WebSocket = ReplaySocket;

  function deliver(m: unknown) {
    const data = JSON.stringify(m);
    for (const s of bridgeSockets) {
      if (s.readyState === 1) s.emit("message", new MessageEvent("message", { data }));
    }
  }

  // ── Page events from the log ──────────────────────────────────────────────
  function dome(): DomeHooks | null { return W.__domeRender ?? null; }

  function pageEvent(s: Record<string, any>) {
    if (typeof s.key === "string") {
      const ev = new KeyboardEvent(s.up ? "keyup" : "keydown", {
        key: s.key, code: s.code || "", shiftKey: !!s.shift, altKey: !!s.alt,
        bubbles: true, cancelable: true,
      });
      document.body.dispatchEvent(ev);
    } else if (s.snapshot) {
      const slot = String(s.snapshot.slot || "");
      if (slot) document.body.dispatchEvent(new KeyboardEvent("keydown", { key: slot, bubbles: true, cancelable: true }));
      if (s.snapshot.dome) dome()?.apply(s.snapshot.dome);
    } else if (s.dome) {
      dome()?.apply(s.dome);
    }
  }

  // ── The renderer's handle ─────────────────────────────────────────────────
  let renderedInStep = false;
  W.__render = {
    ready(): boolean {
      return !!dome()?.ready() && !!document.getElementById("viz-hud");
    },
    now(): number { return vt; },
    /**
     * `render`: this frame will be captured — draw the dome right after the
     * slots, in the same task. A slot drawn on a raw WebGL canvas (the camera's
     * CRT) only holds its picture until the task ends; copied any later, the
     * dome's panel came out black.
     */
    async step(toMs: number, items: Item[], render = false) {
      const dt = Math.max(0, toMs - vt);
      for (const it of items) {
        advance(Math.min(it.t, toMs));
        if (it.m !== undefined) deliver(it.m);
        else if (it.s) pageEvent(it.s);
      }
      advance(toMs);
      await settled();
      await stepVideos(dt / 1000);
      runFrame();
      if (render) { dome()?.renderOnce(); renderedInStep = true; }
    },
    async frame(): Promise<{ width: number; height: number } | null> {
      const d = dome();
      if (!d) return null;
      if (!renderedInStep) d.renderOnce();
      renderedInStep = false;
      const px = d.read();
      await W.__renderOut?.frame(px.data, px.width, px.height);
      return { width: px.width, height: px.height };
    },
  };
  console.log(`[render] virtual clock installed (epoch ${new RealDate(epoch).toISOString()})`);
}
