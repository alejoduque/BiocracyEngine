// dome-live-preload.js — the NDI sender, living in the page itself
// ===========================================================================
// dome-live.js loads parliament.html with this preload and context isolation
// OFF, so the preload and the page share one window. That is the point: the
// page's readback (dome.ts → window.__domeOut.frame) hands its Uint8Array
// straight to the NDI sender, with no copy and no IPC. Measured at 2048 on
// the M5, IPC alone cost ~35 ms a frame; NDI's own send costs ~10.
//
// Frames go out as RGBX (no alpha) — NDI then compresses to UYVY, without the
// alpha plane RGBA would make it carry. With the page's "alfa" output they go
// as RGBA (UYVA on the wire): black transparent, for a layer over the venue's
// own clips (the alpha is made on the GPU, domemaster.ts FLIP_FS).
//
// Dead-man, as with the laser and Syphon: if the page stops sending (output
// off, a crash, a frozen loop) receivers get black after DEADMAN_MS, and keep
// getting it, so the dome goes dark instead of holding the last frame.
//
// Env: DOME_NDI_NAME ("BiocracyEngine Cúpula")  DOME_DEADMAN_MS (1000)

const NAME = process.env.DOME_NDI_NAME || "BiocracyEngine Cúpula";
const DEADMAN_MS = parseInt(process.env.DOME_DEADMAN_MS || "1000", 10);
const RGBX = 1480738642;   // NDIlib_FourCC_video_type_RGBX
const RGBA = 1094862674;   // NDIlib_FourCC_video_type_RGBA — with the page's "alfa" output

// The dome's own window ("ventana aparte", opened by the page) inherits this
// preload: it must not be a second sender of the same name.
const IS_POPUP = !!window.opener;

let grandiose = null;
if (!IS_POPUP) try {
  grandiose = require("@stagetimerio/grandiose");
} catch (e) {
  console.warn(`[dome-live] NDI not available (${String(e.message).split("\n")[0]}) — cd nw_wrld_local && npm i`);
}

let sender = null;
// A reload keeps the renderer process, and the old page's sender with it until
// it is destroyed: the new one cannot take the name while it lives. So it is
// released on the way out, and creating it retries for a few seconds.
function startSender(tries = 10) {
  grandiose.send({ name: NAME, clockVideo: false })
    .then((s) => { sender = s; console.log(`[dome-live] NDI source "${s.sourcename()}" up`); })
    .catch((e) => {
      if (tries > 1) setTimeout(() => startSender(tries - 1), 500);
      else console.warn(`[dome-live] NDI sender failed: ${e.message}`);
    });
}
if (grandiose) {
  startSender();
  window.addEventListener("pagehide", () => { const s = sender; sender = null; s?.destroy().catch(() => {}); });
}

let lastAt = 0;
let lastW = 0, lastH = 0;
let blackOn = false;
let blackBuf = null;
let sending = false;

function videoFrame(buf, w, h, alpha = false) {
  return {
    xres: w, yres: h, frameRateN: 30000, frameRateD: 1000,
    fourCC: alpha ? RGBA : RGBX, pictureAspectRatio: 1, frameFormatType: 1,   // progressive
    lineStrideBytes: w * 4, data: buf,
  };
}

let dark = false;

async function sendBlack() {
  if (!sender || !lastW || sending) return;
  if (!dark) { dark = true; console.log(`[dome-live] ${blackOn ? "NEGRO" : "no frames → black (dead-man)"}`); }
  if (!blackBuf || blackBuf.length !== lastW * lastH * 4) blackBuf = Buffer.alloc(lastW * lastH * 4);
  sending = true;
  try { await sender.video(videoFrame(blackBuf, lastW, lastH)); } catch { /* the next tick tries again */ }
  sending = false;
}

if (!IS_POPUP) window.__domeOut = {
  name: NAME,
  async frame(data, w, h, alpha = false) {
    lastAt = Date.now();
    lastW = w; lastH = h;
    if (dark && !blackOn) { dark = false; console.log("[dome-live] frames again"); }
    if (!sender || blackOn || sending) return;
    sending = true;
    try { await sender.video(videoFrame(Buffer.from(data.buffer, data.byteOffset, data.byteLength), w, h, alpha)); }
    finally { sending = false; }
  },
  black(on) {
    blackOn = !!on;
    if (blackOn) sendBlack();
  },
  connections() { return sender ? sender.connections() : 0; },
};

if (!IS_POPUP) setInterval(() => {
  if (blackOn || (lastW && Date.now() - lastAt > DEADMAN_MS)) sendBlack();
}, 500);
