// session.ts — what only the page knows, for the session log
// ===========================================================================
// While SC records, parliament-bridge.js logs every message it sends the page
// (see its "Session log" block). That is all the DATA a slot reacts to, but
// not all of the PERFORMANCE: which keys were pressed, which slot was showing
// when the recording began, how the dome was set. Those happen here, so the
// page reports them to the bridge as {direction:"session", event} and the
// bridge writes them into the log when — and only when — a recording is on.
// The page never needs to know whether one is.
//
// dome-render.js replays these through renderMode.ts: keys are dispatched
// again as keyboard events, so every listener that reacted live (the slot
// switcher, constellation's own keys) reacts the same way in the render.

export type SessionEvent =
  | { key: string; code: string; up?: 1; shift?: 1; alt?: 1 }
  | { snapshot: { slot: string; dome: Record<string, unknown> } }
  | { dome: Record<string, unknown> };

let _sink: ((e: SessionEvent) => void) | null = null;
let _snapshot: (() => { slot: string; dome: Record<string, unknown> }) | null = null;

/** Where events go: parliamentEntry hands in its bridge socket. */
export function setSessionSink(send: (e: SessionEvent) => void) { _sink = send; }

/** What the page looks like right now, sent when a recording begins. */
export function setSessionSnapshot(fn: () => { slot: string; dome: Record<string, unknown> }) { _snapshot = fn; }

export function sessionEvent(e: SessionEvent) {
  try { _sink?.(e); } catch { /* a closed socket must not cost the caller anything */ }
}

/** Called when the bridge forwards SC's /rec/started. */
export function sessionRecordingStarted() {
  if (_snapshot) sessionEvent({ snapshot: _snapshot() });
}

// Keys that belong to the dome viewport itself (open/close, leave the clean
// feed) are not part of the performance: the renderer has its own dome.
const DOME_KEYS = new Set(["d", "Escape"]);

function onKey(e: KeyboardEvent, up: boolean) {
  const t = e.target;
  if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
  if (e.metaKey || e.ctrlKey || e.repeat || DOME_KEYS.has(e.key)) return;
  const ev: SessionEvent = { key: e.key, code: e.code };
  if (up) ev.up = 1;
  if (e.shiftKey) ev.shift = 1;
  if (e.altKey) ev.alt = 1;
  sessionEvent(ev);
}

export function initSession() {
  // Capture phase: seen before any listener can stop it.
  window.addEventListener("keydown", (e) => onKey(e, false), true);
  window.addEventListener("keyup", (e) => onKey(e, true), true);
}
