#!/usr/bin/env node
// laser-bridge.js — Biocracy Engine → laser projector (ILDA / Helios DAC)
// ===========================================================================
// Projects the engine's vector geometry onto a real-world forest with a laser.
//
//   browser laserTap  ──WS:3337──►  laser-bridge  ──►  Helios DAC (USB)  ──► laser
//                                          └─────────►  .ild file (ILDA fmt 5)
//
// The browser sends NORMALISED frames (the active module's laser-friendly
// vector scene — sparse bright strokes, not a rasterised image):
//
//   { "type":"laserFrame", "pps":30000,
//     "points":[ {"x":-1..1,"y":-1..1,"r":0..255,"g":..,"b":..,"blank":false}, … ] }
//
// x,y are −1..1 with (0,0) at centre. We convert to the Helios 12-bit field
// (0..4095) and to ILDA signed-16 coordinates, then stream.
//
// Lasers are dangerous and CPU-real-time. Three safety/robustness rules here:
//   1. DEAD-MAN BLANKING — if no frame arrives for DEADMAN_MS, emit a blank
//      frame so the laser never parks a static bright dot (burn/eye hazard).
//   2. CLAMP — every coordinate/colour is clamped into range before output.
//   3. GRACEFUL — with no DAC and no native lib we run DRY (log only), so the
//      bridge is safe to launch on any machine.
//
// Output backends (independent, both optional):
//   • Helios DAC  — guarded `require("helios-dac")`. If the binding/device is
//     absent we fall back to DRY RUN. The HeliosPoint / WriteFrame mapping is
//     isolated in heliosWrite() — adjust there for your exact binding.
//   • ILDA file   — set LASER_ILD_OUT=/path/frames.ild to capture frames as a
//     standard ILDA Format-5 (2D true-colour) file, playable by any laser SW.
//
// Env: LASER_WS_PORT(3337) LASER_PPS(30000) LASER_MAX_POINTS(1200)
//      LASER_DRYRUN(1) LASER_TEST(1) LASER_ILD_OUT=<path>
// ===========================================================================

const { WebSocketServer } = require("ws");
const fs = require("fs");

const WS_PORT      = parseInt(process.env.LASER_WS_PORT || "3337", 10);
const DEFAULT_PPS  = parseInt(process.env.LASER_PPS || "30000", 10);
const MAX_POINTS   = parseInt(process.env.LASER_MAX_POINTS || "1200", 10);
const DEADMAN_MS   = 500;
const FRAME_HZ     = 45;                 // output cadence
const ILD_OUT      = process.env.LASER_ILD_OUT || null;

// ─── internal point model ──────────────────────────────────────────────────
// {x,y in −1..1, r,g,b in 0..255, blank}. Frames are arrays of these.
let _frame = blankFrame();
let _pps = DEFAULT_PPS;
let _lastFrameTime = 0;
let _stats = { framesIn: 0, framesOut: 0, lastPoints: 0, startTime: Date.now() };

function blankFrame() { return [{ x: 0, y: 0, r: 0, g: 0, b: 0, blank: true }]; }
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function sanitize(points) {
  if (!Array.isArray(points) || points.length === 0) return blankFrame();
  const out = [];
  const n = Math.min(points.length, MAX_POINTS);
  for (let i = 0; i < n; i++) {
    const p = points[i] || {};
    const blank = !!p.blank;
    out.push({
      x: clamp(Number(p.x) || 0, -1, 1),
      y: clamp(Number(p.y) || 0, -1, 1),
      r: blank ? 0 : clamp(Math.round(Number(p.r) || 0), 0, 255),
      g: blank ? 0 : clamp(Math.round(Number(p.g) || 0), 0, 255),
      b: blank ? 0 : clamp(Math.round(Number(p.b) || 0), 0, 255),
      blank,
    });
  }
  return out;
}

// ─── Helios DAC backend — Grix/helios_dac C API via koffi FFI ────────────────
// The official SDK (https://github.com/Grix/helios_dac) is C/C++ with a flat C
// wrapper "HeliosDacAPI". We call that shared library directly with koffi (no
// node-gyp). Setup (macOS):
//   brew install libusb
//   # build the C API lib from the repo → libHeliosDacAPI.dylib  (see README)
//   npm install koffi
//   LASER=1 HELIOS_LIB=/abs/path/libHeliosDacAPI.dylib ./start_ecosystem.sh
// Missing koffi or lib or device → DRY RUN (safe).
let helios = null;        // { status(), write(buf,n,pps), stop(), close() } | null
let heliosReady = false;

function heliosLibCandidates() {
  if (process.env.HELIOS_LIB) return [process.env.HELIOS_LIB];
  if (process.platform === "darwin") return ["libHeliosDacAPI.dylib", "./libHeliosDacAPI.dylib"];
  if (process.platform === "win32")  return ["HeliosDacAPI.dll", "HeliosLaserDAC.dll"];
  return ["libHeliosDacAPI.so", "./libHeliosDacAPI.so"];
}

function initHelios() {
  if (process.env.LASER_DRYRUN === "1") { console.log("[laser] LASER_DRYRUN=1 → dry run (no DAC output)"); return; }

  let koffi;
  try { koffi = require("koffi"); }
  catch { console.log("[laser] koffi not installed → dry run  (npm install koffi)"); return; }

  let lib = null, used = null;
  for (const c of heliosLibCandidates()) {
    try { lib = koffi.load(c); used = c; break; } catch { /* try next */ }
  }
  if (!lib) {
    console.log("[laser] HeliosDacAPI lib not found → dry run  (build it from Grix/helios_dac, set HELIOS_LIB=/abs/path/libHeliosDacAPI.dylib)");
    return;
  }

  try {
    // Flat C API (HeliosDacAPI.h). points passed as void* → a packed Buffer of
    // HeliosPoint { uint16 x; uint16 y; uint8 r,g,b,i; } = 8 bytes/point, LE.
    const OpenDevices   = lib.func("int OpenDevices()");
    const GetStatus     = lib.func("int GetStatus(int)");
    const WriteFrame    = lib.func("int WriteFrame(int, int, uint8, void*, int)");
    const Stop          = lib.func("int Stop(int)");
    const SetShutter    = lib.func("int SetShutter(int, int)");   // bool as int (0/1)
    const CloseDevices  = lib.func("int CloseDevices()");

    const n = OpenDevices();
    if (n <= 0) { console.log("[laser] OpenDevices() found 0 Helios devices → dry run"); try { CloseDevices(); } catch { /* */ } return; }
    try { SetShutter(0, 1); } catch { /* shutter optional */ }
    helios = {
      status: () => { try { return GetStatus(0); } catch { return -1; } },
      write:  (buf, num, pps) => WriteFrame(0, pps, 0, buf, num),  // flags 0 = default
      stop:   () => { try { Stop(0); } catch { /* */ } },
      close:  () => { try { SetShutter(0, 0); Stop(0); CloseDevices(); } catch { /* */ } },
    };
    heliosReady = true;
    console.log(`[laser] Helios DAC ready — ${n} device(s) via ${used} ✅`);
  } catch (e) {
    console.log(`[laser] Helios C API bind failed → dry run  (${e.message})`);
    helios = null;
  }
}

// Convert a sanitized frame to the Helios 12-bit field and write it, gated on
// GetStatus (1 = ready). HeliosPoint: x,y ∈ [0,4095], r,g,b,i ∈ [0,255].
function heliosWrite(frame, pps) {
  if (!helios || !heliosReady) return;
  if (helios.status() !== 1) return;   // DAC still scanning previous frame → skip
  const n = frame.length;
  const buf = Buffer.allocUnsafe(8 * n);
  for (let i = 0; i < n; i++) {
    const p = frame[i];
    const o = i * 8;
    buf.writeUInt16LE(clamp(Math.round((p.x * 0.5 + 0.5) * 4095), 0, 4095), o);
    buf.writeUInt16LE(clamp(Math.round((p.y * 0.5 + 0.5) * 4095), 0, 4095), o + 2);
    buf.writeUInt8(p.r, o + 4);
    buf.writeUInt8(p.g, o + 5);
    buf.writeUInt8(p.b, o + 6);
    buf.writeUInt8(p.blank ? 0 : 255, o + 7);
  }
  try { helios.write(buf, n, pps); }
  catch (e) { heliosReady = false; console.error("[laser] WriteFrame failed → dry run:", e.message); }
}

// ─── ILDA Format-5 (2D true colour) writer ───────────────────────────────────
// Captures the frames we emit to a standard .ild file (big-endian).
let _ildFd = null;
let _ildFrameNo = 0;
function ildOpen() {
  if (!ILD_OUT) return;
  try { _ildFd = fs.openSync(ILD_OUT, "w"); console.log(`[laser] ILDA capture → ${ILD_OUT}`); }
  catch (e) { console.error("[laser] cannot open ILD_OUT:", e.message); _ildFd = null; }
}
function ildWriteFrame(frame) {
  if (_ildFd === null) return;
  const n = frame.length;
  const header = Buffer.alloc(32);
  header.write("ILDA", 0, "ascii");
  header.writeUInt8(5, 7);                 // format 5: 2D true colour
  header.write("BIOCRACY", 8, "ascii");    // frame name (8)
  header.write("MANAKAI", 16, "ascii");    // company  (8)
  header.writeUInt16BE(n, 24);             // records in this frame
  header.writeUInt16BE(_ildFrameNo & 0xffff, 26);
  header.writeUInt16BE(0, 28);             // total frames (0 = unknown/stream)
  header.writeUInt8(0, 30);                // projector #
  fs.writeSync(_ildFd, header);
  const rec = Buffer.alloc(8 * n);
  for (let i = 0; i < n; i++) {
    const p = frame[i];
    const X = clamp(Math.round(p.x * 32767), -32768, 32767);
    const Y = clamp(Math.round(p.y * 32767), -32768, 32767);
    const o = i * 8;
    rec.writeInt16BE(X, o);
    rec.writeInt16BE(Y, o + 2);
    let status = 0;
    if (i === n - 1) status |= 0x80;        // last point of frame
    if (p.blank) status |= 0x40;            // blanking
    rec.writeUInt8(status, o + 4);
    rec.writeUInt8(p.b, o + 5);             // ILDA order is B,G,R
    rec.writeUInt8(p.g, o + 6);
    rec.writeUInt8(p.r, o + 7);
  }
  fs.writeSync(_ildFd, rec);
  _ildFrameNo++;
}
function ildClose() {
  if (_ildFd === null) return;
  // ILDA end-of-file: a format-5 header with 0 records.
  const eof = Buffer.alloc(32);
  eof.write("ILDA", 0, "ascii"); eof.writeUInt8(5, 7);
  eof.write("BIOCRACY", 8, "ascii"); eof.write("MANAKAI", 16, "ascii");
  try { fs.writeSync(_ildFd, eof); fs.closeSync(_ildFd); } catch { /* ignore */ }
  _ildFd = null;
}

// ─── test pattern (hardware bring-up without the browser) ────────────────────
let _testT = 0;
function testFrame() {
  const pts = [];
  const N = 64;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2 + _testT;
    pts.push({ x: Math.cos(a) * 0.7, y: Math.sin(a) * 0.7, r: 0, g: 255, b: 80, blank: i === 0 });
  }
  _testT += 0.04;
  return pts;
}

// ─── output loop ─────────────────────────────────────────────────────────────
function outputLoop() {
  const now = Date.now();
  let frame;
  if (process.env.LASER_TEST === "1") {
    frame = sanitize(testFrame());
  } else if (now - _lastFrameTime > DEADMAN_MS) {
    frame = blankFrame();                  // dead-man: nobody is driving → go dark
  } else {
    frame = _frame;
  }
  heliosWrite(frame, _pps);
  ildWriteFrame(frame);
  _stats.framesOut++;
  _stats.lastPoints = frame.length;
}

// ─── WebSocket input (from the browser laserTap) ─────────────────────────────
const wss = new WebSocketServer({ port: WS_PORT });
wss.on("connection", (ws) => {
  console.log("[laser] laserTap connected");
  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === "laserFrame") {
        _frame = sanitize(msg.points);
        if (Number.isFinite(msg.pps)) _pps = clamp(msg.pps | 0, 1000, 65000);
        _lastFrameTime = Date.now();
        _stats.framesIn++;
      }
    } catch { /* ignore malformed */ }
  });
  ws.on("close", () => console.log("[laser] laserTap disconnected"));
});

// ─── boot ────────────────────────────────────────────────────────────────────
initHelios();
ildOpen();
const _loop = setInterval(outputLoop, Math.round(1000 / FRAME_HZ));

setInterval(() => {
  const up = ((Date.now() - _stats.startTime) / 1000).toFixed(0);
  const mode = heliosReady ? "HELIOS" : "DRY";
  console.log(`[laser] ${mode} up=${up}s in=${_stats.framesIn} out=${_stats.framesOut} pts=${_stats.lastPoints} pps=${_pps}`);
}, 5000);

console.log(`[laser] WS in  ws://localhost:${WS_PORT}   (frame contract: {type:"laserFrame",pps,points:[{x,y,r,g,b,blank}]})`);
if (process.env.LASER_TEST === "1") console.log("[laser] LASER_TEST=1 → emitting test circle");

function shutdown() {
  clearInterval(_loop);
  try { heliosWrite(blankFrame(), _pps); } catch { /* ignore */ }   // go dark
  if (helios) { try { helios.close(); } catch { /* ignore */ } }
  ildClose();
  console.log("\n[laser] blanked + closed. Adiós.");
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
