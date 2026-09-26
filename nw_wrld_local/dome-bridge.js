// dome-bridge.js — the fulldome domemaster → Syphon
// ===========================================================================
// Sibling of laser-bridge.js, for the dome instead of the forest:
//
//   parliament.html (key D, "syphon" on) ──WS:3338──► dome-bridge ──Syphon──► MadMapper / OBS / Resolume
//
// Syphon is macOS's zero-copy GPU texture sharing. MadMapper, OBS (Syphon
// Client source), Resolume and TouchDesigner all read it natively,
// and from there the dome feed can go on as NDI (MadMapper, or OBS with its
// NDI plugin) or straight to a projector — whatever the planetarium takes.
//
// Frame contract (binary WebSocket message):
//   bytes 0–3   "DOM1"
//   bytes 4–7   width   (uint32 LE)
//   bytes 8–11  height  (uint32 LE)
//   bytes 12–15 flags   (uint32 LE; bit 0 = rows are bottom-up, as WebGL reads them)
//   bytes 16…   RGBA8, width × height × 4
//
// Safety, as with the laser's dead-man blanking: if no frame arrives for
// DOME_DEADMAN_MS the bridge publishes one black frame, so a closed dome, a
// crashed page or a pulled cable leaves the dome DARK rather than frozen on
// the last image in front of an audience.
//
// Without node-syphon (npm i node-syphon — prebuilt, macOS only) it runs as a
// DRY RUN: frames are received and counted, nothing is published.
//
// Env: DOME_WS_PORT(3338) DOME_SYPHON_NAME("BiocracyEngine Cúpula")
//      DOME_DEADMAN_MS(1000) DOME_DRYRUN(1) DOME_FLIP(0|1 — override the
//      bottom-up flag if a receiver shows the image upside down)

const { WebSocketServer } = require("ws");

const WS_PORT     = parseInt(process.env.DOME_WS_PORT || "3338", 10);
const NAME        = process.env.DOME_SYPHON_NAME || "BiocracyEngine Cúpula";
const DEADMAN_MS  = parseInt(process.env.DOME_DEADMAN_MS || "1000", 10);
const FLIP_ENV    = process.env.DOME_FLIP;
const HEADER      = 16;

// ── Syphon ──────────────────────────────────────────────────────────────────
let server = null;
if (process.env.DOME_DRYRUN === "1") {
  console.log("[dome] DOME_DRYRUN=1 → dry run (nothing published)");
} else {
  try {
    const { SyphonMetalServer } = require("node-syphon");
    server = new SyphonMetalServer(NAME);
    console.log(`[dome] Syphon server "${NAME}" up (Metal)`);
  } catch (e) {
    console.log(`[dome] node-syphon not available (${e.message.split("\n")[0]}) → dry run`);
    console.log("[dome]   install with:  cd nw_wrld_local && npm i node-syphon");
  }
}

function publish(data, w, h, bottomUp) {
  if (!server) return;
  const flipped = FLIP_ENV === undefined ? bottomUp : FLIP_ENV === "1";
  server.publishImageData(data, { x: 0, y: 0, width: w, height: h }, { width: w, height: h }, flipped);
}

// ── Dead-man: go dark when nobody is sending ────────────────────────────────
let lastAt = 0;
let lastW = 0, lastH = 0;
let dark = true;
const deadman = setInterval(() => {
  if (dark || !lastW || Date.now() - lastAt < DEADMAN_MS) return;
  dark = true;
  publish(new Uint8ClampedArray(lastW * lastH * 4), lastW, lastH, false);  // zeros = black
  console.log("[dome] no frames → published black (dead-man)");
}, 100);

// ── Stats ───────────────────────────────────────────────────────────────────
let nFrames = 0, nBytes = 0, pubMs = 0;
const stats = setInterval(() => {
  if (nFrames) {
    console.log(`[dome] ${(nFrames / 5).toFixed(1)} fps  ${lastW}×${lastH}  ` +
      `${(nBytes / 5 / 1e6).toFixed(0)} MB/s  publish ${(pubMs / nFrames).toFixed(1)} ms` +
      (server ? "" : "  (dry run)"));
  }
  nFrames = 0; nBytes = 0; pubMs = 0;
}, 5000);

// ── WebSocket in ────────────────────────────────────────────────────────────
const wss = new WebSocketServer({ port: WS_PORT, maxPayload: 4096 * 4096 * 4 + HEADER });
wss.on("connection", (ws) => {
  console.log("[dome] page connected");
  ws.on("message", (buf, isBinary) => {
    if (!isBinary || buf.length < HEADER || buf.toString("latin1", 0, 4) !== "DOM1") return;
    const w = buf.readUInt32LE(4), h = buf.readUInt32LE(8), flags = buf.readUInt32LE(12);
    if (buf.length !== HEADER + w * h * 4) return;
    const data = new Uint8ClampedArray(buf.buffer, buf.byteOffset + HEADER, w * h * 4);
    const t = process.hrtime.bigint();
    try { publish(data, w, h, (flags & 1) === 1); }
    catch (e) { console.warn("[dome] publish failed:", e.message); }
    pubMs += Number(process.hrtime.bigint() - t) / 1e6;
    nFrames++; nBytes += buf.length;
    lastAt = Date.now(); lastW = w; lastH = h; dark = false;
  });
  ws.on("close", () => console.log("[dome] page disconnected"));
});
console.log(`[dome] WS in  ws://localhost:${WS_PORT}   (binary "DOM1" frames, RGBA8)`);

function shutdown() {
  clearInterval(deadman); clearInterval(stats);
  try { if (lastW) publish(new Uint8ClampedArray(lastW * lastH * 4), lastW, lastH, false); } catch { /* ignore */ }
  try { server && server.dispose(); } catch { /* ignore */ }
  wss.close();
  console.log("[dome] dark + closed");
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
