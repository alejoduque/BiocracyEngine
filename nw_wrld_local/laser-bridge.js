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
//      LASER_MAX_STEP(0.25) LASER_DRYRUN(1) LASER_TEST(1) LASER_ILD_OUT=<path>
// ===========================================================================

const { WebSocketServer } = require("ws");
const fs = require("fs");
const osc = require("osc");

const WS_PORT      = parseInt(process.env.LASER_WS_PORT || "3337", 10);
// Derated from the datasheet maximum, not set to it. 30 kpps is the ceiling the
// scanner is rated to reach, and running a galvo at its ceiling continuously is
// how galvos die; 24 kpps is 80% and leaves the margin the word "conservative"
// is asking for. LASER_PPS can raise it, and it is clamped to RATED_PPS below.
const DEFAULT_PPS  = parseInt(process.env.LASER_PPS || "24000", 10);
const MAX_POINTS   = parseInt(process.env.LASER_MAX_POINTS || "1200", 10);
// ─── Scanner limits, derived from the fixture datasheet ────────────────────
// Unity RAW 1.7W (DMX+ILDA), Pangolin/Kvant: closed-loop galvos, "Scan Speed
// 30 kpps @ 8°", "Scan Angle 45°", ">1.7 W", "Divergence <1.1 mrad", beam
// 5 x 3 mm, "Modulation Linear Analog - 50 kHz".
//
// The important thing about "30 kpps @ 8°" is that it is a RATE-ANGLE PAIR,
// not a rate. A scanner that tracks 30,000 points per second across 8° cannot
// track 30,000 points per second across 45° — the mirror has five times as far
// to travel per point. The old limit ignored the angle completely: a step of
// 0.25 in the −1..1 field is 5.6° of optical travel, and at 30 kpps that
// commands 168,750°/s. A real 30K galvo peaks around 10,000-20,000°/s, so the
// guard was roughly ten times too permissive and was never actually
// constraining anything.
const RATED_PPS    = parseFloat(process.env.LASER_RATED_PPS   || "30000");
const RATED_ANGLE  = parseFloat(process.env.LASER_RATED_ANGLE || "8");   // deg
const SCAN_ANGLE   = parseFloat(process.env.LASER_SCAN_ANGLE  || "45");  // deg, full field
// The one modelling assumption, kept explicit and adjustable because the
// datasheet does not publish the ILDA test pattern's point count: treat the
// hardest move the scanner is rated for as traversing its rated angle in this
// many points. 24 is deliberately conservative — it yields 10,000°/s, the
// bottom of the range a 30K scanner is normally credited with rather than the
// top. Lower this number for more headroom, raise it for a sharper image.
const TRAVERSE_PTS = parseFloat(process.env.LASER_TRAVERSE_PTS || "24");
// deg per normalised unit: ±1 spans the full field, so one unit is half of it.
const DEG_PER_UNIT = SCAN_ANGLE / 2;
// The angular speed ceiling, and the step ceiling that follows from it at
// whatever rate we are actually running.
const OMEGA_MAX    = (RATED_ANGLE * RATED_PPS) / TRAVERSE_PTS;   // deg/s
function maxStepFor(pps) {
  return OMEGA_MAX / Math.max(pps, 1) / DEG_PER_UNIT;
}
// Kept as an override only. Unset, the limit is computed from the angle above.
const MAX_STEP_ENV = process.env.LASER_MAX_STEP
  ? parseFloat(process.env.LASER_MAX_STEP) : null;
let MAX_STEP = MAX_STEP_ENV !== null ? MAX_STEP_ENV : maxStepFor(DEFAULT_PPS);

// ─── The other end: the beam must not stand still ──────────────────────────
// A dwell threshold in bare microseconds was a guess. With the beam geometry
// published it becomes a physical criterion: the beam should clear its OWN
// width within the dwell window, or it is depositing successive points into
// the same spot.
const POWER_W      = parseFloat(process.env.LASER_POWER_W    || "1.7");
const BEAM_MM      = parseFloat(process.env.LASER_BEAM_MM    || "5");    // major axis
const DIVERGE_MRAD = parseFloat(process.env.LASER_DIVERGE    || "1.1");  // full angle
const THROW_M      = parseFloat(process.env.LASER_THROW_M    || "10");
const DWELL_MS     = parseFloat(process.env.LASER_DWELL_MS   || "1.0");
// Beam width at the projection distance, and what that subtends from the head.
const BEAM_MM_AT   = BEAM_MM + (DIVERGE_MRAD * THROW_M);      // mrad x m = mm
const BEAM_DEG     = (BEAM_MM_AT / (THROW_M * 1000)) * (180 / Math.PI);
// Minimum angular speed that still clears one beam width per window.
const OMEGA_MIN    = BEAM_DEG / (DWELL_MS / 1000);            // deg/s
function minStepFor(pps) {
  return OMEGA_MIN / Math.max(pps, 1) / DEG_PER_UNIT;
}
const DEADMAN_MS   = 500;
const FRAME_HZ     = 45;                 // output cadence
const ILD_OUT      = process.env.LASER_ILD_OUT || null;
// Where the SC GUI's galvo scope listens. sclang binds 57120.
const SC_OSC_HOST  = process.env.LASER_SC_HOST || "127.0.0.1";
const SC_OSC_PORT  = parseInt(process.env.LASER_SC_PORT || "57120", 10);
const SCOPE_HZ     = 12;    // scope refresh; the eye needs no more
const SCOPE_POINTS = 96;    // points sent per frame for drawing

// ─── internal point model ──────────────────────────────────────────────────
// {x,y in −1..1, r,g,b in 0..255, blank}. Frames are arrays of these.
let _frame = blankFrame();
let _frameSeq = 0;        // bumped whenever the frame CONTENT changes
let _deadman = false;
let _pps = DEFAULT_PPS;
let _lastFrameTime = 0;
let _ppsWarnAt = 0;
let _stats = { framesIn: 0, framesOut: 0, lastPoints: 0, startTime: Date.now() };

function blankFrame() { return [{ x: 0, y: 0, r: 0, g: 0, b: 0, blank: true }]; }
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// Galvo safety: insert blanked intermediate points where consecutive points
// jump farther than MAX_STEP, so the scanner travels the gap in bounded
// steps. Capped at MAX_POINTS total (tail points drop before safety does).
function interpolateJumps(points) {
  if (!(MAX_STEP > 0) || points.length < 2) return points.slice(0, MAX_POINTS);
  const out = [];
  let prev = null;
  for (const p of points) {
    if (prev) {
      const dx = p.x - prev.x, dy = p.y - prev.y;
      const dist = Math.hypot(dx, dy);
      if (dist > MAX_STEP) {
        // Cap raised from 32. At the old 0.25 step nothing ever needed more
        // than four inserted points, so 32 was unreachable headroom; at a
        // datasheet-derived step around 0.02 a corner-to-corner jump needs
        // about 90, and a cap of 32 would have silently left the residue
        // over-speed while looking like it had been handled. MAX_POINTS and
        // the scan budget are the real limits, and both are reported.
        const steps = Math.min(Math.ceil(dist / MAX_STEP) - 1, 512);
        for (let s = 1; s <= steps && out.length < MAX_POINTS; s++) {
          const t = s / (steps + 1);
          out.push({ x: prev.x + (dx * t), y: prev.y + (dy * t), r: 0, g: 0, b: 0, blank: true });
        }
      }
    }
    if (out.length >= MAX_POINTS) break;
    out.push(p);
    prev = p;
  }
  return out;
}

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
  return interpolateJumps(out);
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


// ─── Galvo-safety scope telemetry ───────────────────────────────────────────
// What the SC GUI draws is the WAVEFORM this frame becomes once it reaches the
// DAC: at _pps points per second each point is one sample, X on the left
// channel and Y on the right, which is exactly the .wav a galvo pair is driven
// by. Sending it here rather than reconstructing it in SuperCollider means the
// scope shows the real post-sanitisation signal — after interpolateJumps has
// inserted its blanked intermediate points — instead of an idealisation of it.
//
// Two compliance measures travel with it, and they are the two opposite ways a
// galvo signal becomes unsafe:
//
//   overspeed  consecutive samples farther apart than MAX_STEP. The mirrors
//              cannot accelerate that hard; they overshoot and ring, which
//              draws streaks and mechanically stresses the scanner. After
//              interpolateJumps this should read 0, and the scope showing 0 is
//              what makes the interpolation verifiable rather than assumed.
//
//   dwell      the longest run of samples that barely move while UNBLANKED,
//              reported in microseconds. This is the one that burns: a
//              stationary beam deposits its entire power into one spot. A
//              frame can be perfectly within the speed limit and still be
//              dangerous by standing still, so speed alone is not compliance.
let _oscOut = null;
let _scopeAt = 0;
try {
  _oscOut = new osc.UDPPort({ localAddress: "0.0.0.0", localPort: 0, metadata: true });
  _oscOut.open();
} catch (e) {
  console.log(`[laser] OSC scope disabled (${e.message})`);
  _oscOut = null;
}

function scopeSend(frame, safety) {
  const now = Date.now();
  if (!_oscOut || now - _scopeAt < 1000 / SCOPE_HZ) return;
  _scopeAt = now;

  const minStep = minStepFor(_pps);
  let overspeed = 0, maxStep = 0, dwellRun = 0, dwellWorst = 0;
  let usedX = 0, usedY = 0;
  for (let i = 1; i < frame.length; i++) {
    const a = frame[i - 1], b = frame[i];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (d > maxStep) maxStep = d;
    if (d > MAX_STEP) overspeed++;
    // Only an UNBLANKED stationary beam is a hazard; a blanked one is dark.
    // The threshold is no longer a guessed epsilon: minStep is the step that
    // just clears one beam width per dwell window at this distance.
    if (d < minStep && !b.blank) {
      dwellRun++;
      if (dwellRun > dwellWorst) dwellWorst = dwellRun;
    } else dwellRun = 0;
    usedX = Math.max(usedX, Math.abs(b.x));
    usedY = Math.max(usedY, Math.abs(b.y));
  }
  const dwellUs = (dwellWorst / Math.max(_pps, 1)) * 1e6;
  // How much of the field the frame actually uses, in optical degrees. This is
  // the number that decides whether 30 kpps @ 8° is even the right rating to be
  // holding the scanner to: a frame drawn across 40° is a far harder job.
  const usedDeg = Math.max(usedX, usedY) * 2 * DEG_PER_UNIT;
  // Scan budget: every point must be scanned FRAME_HZ times a second.
  // Taken from the safety pass when there was one, because by the time a frame
  // has been blanked for exceeding the budget it is a single dark point and
  // recomputing here would report the budget of the blanking, not of the frame
  // that caused it — which read as "needs 45 pps" for a frame needing 54,000.
  const budget = (safety && safety.budget !== undefined)
    ? safety.budget
    : (frame.length * FRAME_HZ) / Math.max(_pps, 1);
  const shownPoints = (safety && safety.origPoints) || frame.length;

  // Decimated for drawing only; the measures above used every sample.
  // Each bucket also carries the WORST step inside it, not the step between the
  // two surviving points — decimation would otherwise hide exactly the
  // violations this is meant to show, and a compliance display computed from
  // thinned data is worse than none.
  const step = Math.max(1, Math.floor(frame.length / SCOPE_POINTS));
  const pts = [];
  for (let i = 0; i < frame.length; i += step) {
    const p = frame[i];
    let worst = 0;
    for (let j = Math.max(i, 1); j < Math.min(i + step, frame.length); j++) {
      const d = Math.hypot(frame[j].x - frame[j - 1].x, frame[j].y - frame[j - 1].y);
      if (d > worst) worst = d;
    }
    pts.push({ type: "f", value: p.x }, { type: "f", value: p.y },
             { type: "f", value: p.blank ? 1 : 0 },
             { type: "f", value: worst });
  }

  try {
    _oscOut.send({
      address: "/laser/scope",
      args: [
        { type: "i", value: heliosReady ? 1 : 0 },
        { type: "i", value: _pps },
        { type: "i", value: shownPoints },
        { type: "f", value: MAX_STEP },
        { type: "f", value: maxStep },
        { type: "i", value: overspeed },
        { type: "f", value: dwellUs },
        { type: "f", value: OMEGA_MAX },
        { type: "f", value: maxStep * DEG_PER_UNIT * _pps },   // deg/s commanded
        { type: "f", value: usedDeg },
        { type: "f", value: RATED_ANGLE },
        { type: "f", value: budget },
        // What auto-blanking DID, kept separate from what was measured. A
        // dwell reading of 0 after the beam was switched off is not the same
        // fact as a dwell reading of 0 because nothing ever stopped moving,
        // and an operator has to be able to tell those apart.
        { type: "i", value: (safety && safety.osBlanked) || 0 },
        { type: "i", value: (safety && safety.dwellBlanked) || 0 },
        { type: "i", value: (safety && safety.frameBlanked) ? 1 : 0 },
        // Hold-aware, so the GUI lamp reflects the state the beam is actually
        // in rather than only the instant a fault was seen. A blanking that
        // lasts 250 ms but is reported for one 12 Hz frame would blink a lamp
        // for 80 ms and be missed.
        { type: "i", value: (Date.now() < _blankUntil) ? 1 : 0 },
        { type: "i", value: pts.length / 4 },
        ...pts,
      ],
    }, SC_OSC_HOST, SC_OSC_PORT);
  } catch { /* the scope is never worth killing the laser path for */ }
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


// ─── Auto-blanking: the beam goes off wherever it cannot be projected safely ─
// Interpolation makes most jumps survivable, but it cannot make every frame
// compliant — MAX_POINTS and the scan budget are hard ceilings, and past them a
// frame arrives at the scanner with moves the mirrors cannot track. Reporting
// that and projecting it anyway is the wrong default for a Class 4 fixture, so
// the beam is switched off wherever the signal is outside the envelope.
//
// Blanking is TARGETED, not global, wherever targeting is meaningful:
//
//   over-speed  the point being jumped to is blanked. The mirrors still travel
//               the gap — nothing can stop that once the geometry is asked for
//               — but they travel it dark. This does not repair the mechanical
//               over-command, and the scope goes on reporting the raw count
//               separately from what was blanked, because a blanked over-speed
//               is still a scanner being asked for an acceleration it lacks.
//
//   dwell       once a stationary unblanked run reaches the dwell window, the
//               rest of it is blanked. This is exactly what a scan-fail circuit
//               does, and it is the one case where blanking removes the hazard
//               outright rather than merely hiding it.
//
//   budget      cannot be targeted: if the frame needs more points per second
//               than the DAC can scan, no subset of it is being drawn at the
//               rate it was authored for. The whole frame goes dark. Blanking
//               a frame is visible and recoverable; scanning a frame the galvos
//               cannot finish is neither.
//
// Held for BLANK_HOLD_MS after the last violation. Without hysteresis a frame
// sitting on the threshold toggles the beam at the frame rate, which is both
// ugly and its own kind of hazard.
const SAFE_BLANK    = process.env.LASER_SAFE_BLANK !== "0";   // on unless disabled
const BLANK_HOLD_MS = parseFloat(process.env.LASER_BLANK_HOLD_MS || "250");
let _blankUntil = 0;
let _blankWarnAt = 0;

function enforceGalvoSafety(frame, now) {
  const minStep   = minStepFor(_pps);
  const dwellPts  = Math.max(2, Math.round((DWELL_MS / 1000) * _pps));
  const budget    = (frame.length * FRAME_HZ) / Math.max(_pps, 1);
  const stats     = { osRaw: 0, osBlanked: 0, dwellBlanked: 0,
                      frameBlanked: false, budget, origPoints: frame.length,
                      reason: "" };
  let out = frame;

  if (!SAFE_BLANK) return { frame: out, stats };

  // Whole-frame: more points than the scanner can complete at this rate.
  if (budget > 1.0) {
    stats.frameBlanked = true;
    stats.reason = "budget";
    _blankUntil = now + BLANK_HOLD_MS;
    if (now - _blankWarnAt > 5000) {
      _blankWarnAt = now;
      console.warn(`[laser] BLANKED — ${frame.length} pts x ${FRAME_HZ}Hz = ` +
        `${Math.round(frame.length * FRAME_HZ)} pps needed > ${_pps} pps available`);
    }
    return { frame: blankFrame(), stats };
  }

  // Per-point. Slots are REPLACED with clones rather than mutated: the array
  // handed in is often _frame itself, retained between ticks, and blanking it
  // in place would darken that content permanently.
  let dwellRun = 0;
  for (let i = 1; i < frame.length; i++) {
    const a = frame[i - 1], b = frame[i];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    let kill = false;

    if (d > MAX_STEP) { stats.osRaw++; if (!b.blank) { kill = true; stats.osBlanked++; } }

    if (d < minStep && !b.blank) {
      dwellRun++;
      if (dwellRun >= dwellPts) { kill = true; stats.dwellBlanked++; }
    } else if (d >= minStep) dwellRun = 0;

    if (kill) {
      if (out === frame) out = frame.slice();
      out[i] = { ...b, r: 0, g: 0, b: 0, blank: true };
    }
  }

  if (stats.osBlanked > 0 || stats.dwellBlanked > 0) {
    _blankUntil = now + BLANK_HOLD_MS;
    stats.reason = stats.dwellBlanked > 0 ? "dwell" : "over-speed";
  }
  // Hysteresis: keep the beam down for the hold window after the last fault,
  // so a frame hovering on the threshold cannot strobe.
  if (now < _blankUntil && !stats.frameBlanked && stats.reason === "") {
    stats.reason = "hold";
  }
  return { frame: out, stats };
}

// ─── output loop ─────────────────────────────────────────────────────────────
let _ildLastSeq = -1;
function outputLoop() {
  const now = Date.now();
  let frame;
  if (process.env.LASER_TEST === "1") {
    frame = sanitize(testFrame());
    _frameSeq++;                           // test pattern animates every tick
  } else if (now - _lastFrameTime > DEADMAN_MS) {
    if (!_deadman) { _deadman = true; _frameSeq++; }
    frame = blankFrame();                  // dead-man: nobody is driving → go dark
  } else {
    _deadman = false;                      // fresh frames bump _frameSeq on arrival
    frame = _frame;
  }

  // Scan budget: FRAME_HZ repaints/s x points must fit in the DAC point rate,
  // or the scanner can't finish each frame (dim/flickery image). Throttled.
  if (frame.length * FRAME_HZ > _pps && now - _ppsWarnAt > 5000) {
    _ppsWarnAt = now;
    console.warn(`[laser] ${frame.length} pts x ${FRAME_HZ}Hz needs ${frame.length * FRAME_HZ} pps > ${_pps} pps — reduce points or raise pps`);
  }

  // Everything below sees only the SAFE frame — the scope, the DAC and the
  // .ild capture alike, so what is recorded is what was projected.
  const safe = enforceGalvoSafety(frame, now);
  frame = safe.frame;

  scopeSend(frame, safe.stats);
  heliosWrite(frame, _pps);
  // The Helios needs the frame re-sent continuously, but the .ild capture
  // only wants NEW content — the old unconditional write duplicated every
  // frame at 45Hz for as long as it stayed on screen.
  if (_frameSeq !== _ildLastSeq) {
    ildWriteFrame(frame);
    _ildLastSeq = _frameSeq;
  }
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
        _frameSeq++;
        // Clamped to the fixture's rated ceiling, not to an arbitrary 65000.
        // A browser asking for more than the scanner is rated for is asking for
        // a damaged scanner, and the step limit is derived from the rate, so it
        // is recomputed here rather than left at whatever the boot rate implied.
        if (Number.isFinite(msg.pps)) {
          _pps = clamp(msg.pps | 0, 1000, RATED_PPS);
          if (MAX_STEP_ENV === null) MAX_STEP = maxStepFor(_pps);
        }
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
