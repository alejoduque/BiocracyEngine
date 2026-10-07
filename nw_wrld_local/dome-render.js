// dome-render.js — a recorded session, rendered as a 4096 domemaster
// ===========================================================================
// The high-resolution half of the dome show. While SC records, the bridge
// logs everything the visuals receive (parliament-bridge.js, "Session log");
// this replays that log into parliament.html in a hidden Electron window, on
// a virtual clock (src/projector/dome/renderMode.ts), and writes one
// domemaster per frame to ffmpeg — as fast as the machine can, which at 4096
// is slower than real time and does not matter: every frame lands exactly
// where it belongs against the recording.
//
//   recordings/eth_sonification_….wav             ← SC, 4 channels
//   recordings/eth_sonification_….session.jsonl   ← the bridge
//        │
//        ▼  npm run dome:render -- --session recordings/….session.jsonl
//   renders/<name>_4096/<name>_4096_hapq_30fps.mov (or frames)  +  <name>_4096_LRLsRs.wav  +  <name>_4096_5.1.wav
//
// The page must be served (npm run serve → http://localhost:9001); SC and the
// bridge need not be running.
//
// Options:
//   --session <file>     the .session.jsonl (required), or "last": the newest
//                        one in recordings/
//   --out <dir>          default renders/<session name>_<size>
//   --size 4096|2048     domemaster size (default 4096)
//   --fps <n>            default 30
//   --from <s> --to <s>  span to render, seconds into the recording (default: all)
//   --format png|prores|hapq  PNG sequence (default), one ProRes 4444 .mov, or
//                        one HAP Q .mov — the planetarium's format (needs the
//                        ffmpeg built by tools/ffmpeg-hap/build.sh)
//   --warmup <s>         virtual seconds the page runs before time zero (default 3)
//   --window <WxH>       page size, i.e. the resolution of the 2-D slots (default 1920x1080)
//   --audio-offset <ms>  shift the audio against the picture (default 0)
//   --lfe-hz <Hz>        crossover of the 5.1 file's LFE channel (default 100)
//   --no-upmix           a stereo take stays stereo (no quad, no 5.1)
//   --audio-only         only the WAVs (e.g. again, with other options); the
//                        page is not opened and no video is made
//   --stills <s>         also save one full-size PNG every <s> seconds: the
//                        domemaster (<clip>_stills/, from the .mov) and the
//                        whole page, flat, as performed — stage, side columns,
//                        controls — at the window size (<name>_pagina/)
//   --no-preview         skip the QuickTime preview (see below)
//   --flat [width]       also the PAGE as video, flat, as performed — stage,
//                        side columns, controls — frame by frame with the
//                        domemaster: <name>_pagina_<width>.mp4 (H.264, 1920
//                        wide unless given, with the take's audio as stereo)
//   --no-dome            with --flat: only the page, no domemaster (faster)
//   --embed-audio        also put the 5.1 inside the .mov (prores/hapq), for a
//                        player that wants picture and sound in one file
//
// Audio: two WAVs at 48 kHz / 24 bit beside the video — <name>_LRLsRs.wav
// (four channels, console order) and <name>_5.1.wav (L R C LFE Ls Rs, the
// centre silent, the LFE the low end of the mix) — see cutAudio(). A stereo
// take (recorded without the MOTU) is upmixed to the same two files.
//   --url <url>          default http://localhost:9001/parliament.html
//
// Run: npx electron dome-render.js --session …   (or npm run dome:render -- …)

const { app, BrowserWindow, ipcMain } = require("electron");
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");

// ── Arguments ───────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const k = a.slice(2);
    const v = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "1";
    out[k] = v;
  }
  return out;
}
const args = parseArgs(process.argv.slice(2));

function fail(msg) {
  console.error(`[dome-render] ${msg}`);
  app.exit(1);
  process.exit(1);
}

if (!args.session) fail("--session <file.session.jsonl> is required");
// "last": the newest session log in recordings/ — the take just recorded.
function lastSession() {
  const dir = path.join(__dirname, "..", "recordings");
  const logs = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".session.jsonl")) : [];
  if (!logs.length) fail(`no .session.jsonl in ${dir} — record in SC first (the bridge writes it beside the WAV)`);
  logs.sort((a, b) => fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs);
  return path.join(dir, logs[0]);
}
const SESSION = args.session === "last" ? lastSession() : path.resolve(args.session);
const SIZE = args.size === "2048" ? 2048 : 4096;
const FPS = Number(args.fps) || 30;
const FORMAT = ["prores", "hapq"].includes(args.format) ? args.format : "png";
// HAP needs an ffmpeg built with libsnappy; Homebrew's is not.
const HAP_FFMPEG = process.env.DOME_FFMPEG || path.join(__dirname, "..", "tools", "ffmpeg-hap", "bin", "ffmpeg");
const FFMPEG = FORMAT === "hapq" ? HAP_FFMPEG : "ffmpeg";
if (FORMAT === "hapq" && !fs.existsSync(FFMPEG)) {
  fail(`--format hapq needs ${FFMPEG} — build it once with tools/ffmpeg-hap/build.sh`);
}
const WARMUP_MS = (args.warmup !== undefined ? Number(args.warmup) : 3) * 1000;
const [WIN_W, WIN_H] = String(args.window || "1920x1080").split("x").map(Number);
const AUDIO_OFFSET_MS = Number(args["audio-offset"]) || 0;
const LFE_HZ = Number(args["lfe-hz"]) || 100;
const EMBED_AUDIO = args["embed-audio"] === "1";
const UPMIX = args["no-upmix"] !== "1";
const AUDIO_ONLY = args["audio-only"] === "1";
// The clips' WAVs are always leveled for the dome (levelAudio): −20 LUFS,
// never past −1 dBTP. No flag — one delivery level, the same every time.
const LOUDNESS = -20;
// HAP Q does not open in QuickTime or VLC: every .mov gets an H.264 preview
// beside it (dome-preview.js), unless --no-preview.
const PREVIEW = args["no-preview"] !== "1";
const STILLS = Number(args.stills) || 0;
// The page as video: "--flat" alone is 1920 wide; "--flat 3840" sets it.
const FLAT = args.flat === undefined ? 0 : (Number(args.flat) > 100 ? Math.round(Number(args.flat)) : 1920);
const NO_DOME = args["no-dome"] === "1" && FLAT > 0;
const URL_BASE = args.url || "http://localhost:9001/parliament.html";
const NAME = path.basename(SESSION).replace(/\.session\.jsonl$/, "");
const OUT = path.resolve(args.out || path.join(__dirname, "..", "renders", `${NAME}_${SIZE}`));

// ── The session ─────────────────────────────────────────────────────────────
let header = null;
const items = [];
{
  if (!fs.existsSync(SESSION)) fail(`no such file: ${SESSION}`);
  const lines = fs.readFileSync(SESSION, "utf8").split("\n");
  for (const line of lines) {
    if (!line) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }   // a log cut off mid-line by a crash
    if (o.h) header = o.h;
    else if (o.m !== undefined || o.s) items.push(o);
  }
  if (!header) fail("not a session log (no header line)");
  items.sort((a, b) => a.t - b.t);
}
const END_MS = items.length ? items[items.length - 1].t : 0;
const FROM_MS = Math.max(0, (Number(args.from) || 0) * 1000);
const TO_MS = Math.min(END_MS, args.to !== undefined ? Number(args.to) * 1000 : END_MS);
if (TO_MS <= FROM_MS) fail(`nothing to render: span ${FROM_MS / 1000}–${TO_MS / 1000} s of a ${(END_MS / 1000).toFixed(1)} s session`);
const EPOCH = Date.parse(header.started) || Date.now();
const N_FRAMES = Math.floor(((TO_MS - FROM_MS) / 1000) * FPS);

// ── ffmpeg ──────────────────────────────────────────────────────────────────
// Raw RGBA in, rows bottom-up as WebGL reads them (vflip).
let ff = null;
let ffDone = null;
let ffEnding = false;

function startFfmpeg(w, h) {
  fs.mkdirSync(OUT, { recursive: true });
  const input = ["-hide_banner", "-loglevel", "error", "-y",
    "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${w}x${h}`, "-framerate", String(FPS), "-i", "-",
    "-vf", "vflip"];
  const output = FORMAT === "prores"
    ? ["-c:v", "prores_ks", "-profile:v", "4", "-pix_fmt", "yuv444p10le", "-vendor", "apl0",
       path.join(OUT, `${NAME}_${SIZE}.mov`)]
    : FORMAT === "hapq"
    // HAP Q: the planetarium's playback codec (.MOV, 30 or 60 fps). Q keeps
    // the dark gradients these scenes live in from banding.
    ? ["-c:v", "hap", "-format", "hap_q", path.join(OUT, `${NAME}_${SIZE}_hapq_${FPS}fps.mov`)]
    : ["-c:v", "png", "-compression_level", "3", "-pix_fmt", "rgb24", "-start_number", "0",
       path.join(OUT, "frame_%05d.png")];
  ff = spawn(FFMPEG, [...input, ...output], { stdio: ["pipe", "inherit", "inherit"] });
  ffDone = new Promise((res) => ff.on("close", res));
  // ffmpeg gone before we closed its input is a failure, not a slow encoder:
  // without this the render waits on a pipe nobody reads, forever.
  ff.on("close", (code) => { if (!ffEnding) fail(`ffmpeg stopped early (exit ${code}) — see its message above`); });
  ff.stdin.on("error", () => { /* reported by the close handler */ });
  ff.on("error", (e) => fail(`ffmpeg: ${e.message} (is it installed? brew install ffmpeg)`));
}

ipcMain.handle("dome-frame", (_e, data, w, h) => {
  if (!ff) startFfmpeg(w, h);
  const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  return new Promise((res) => {
    if (ff.stdin.write(buf)) res(true);
    else ff.stdin.once("drain", () => res(true));
  });
});

// ── The page as video (--flat) ──────────────────────────────────────────────
// The window's own paint, taken after each stepped frame (capturePage), so the
// page video and the domemaster are the same frames of the same performance.
// NativeImage bitmaps are BGRA, top row first. Written silent, then muxed with
// the take's audio once the WAVs exist (flatMux).
let flatFF = null, flatDone = null, flatSize = null;
const flatTmp = () => path.join(OUT, `${NAME}_pagina_${FLAT}.video.tmp.mp4`);
const flatOut = () => path.join(OUT, `${NAME}_pagina_${FLAT}.mp4`);

const FLAT_WAIT_MS = Number(process.env.FLAT_WAIT_MS ?? 20);
async function flatFrame(win) {
  // The page's own clock is virtual, but its compositor runs on real time:
  // captured straight after a step, about one frame in five was still the
  // previous one (measured). A short real wait lets the new frame land.
  if (FLAT_WAIT_MS > 0) await new Promise((r) => setTimeout(r, FLAT_WAIT_MS));
  let img = await win.webContents.capturePage();
  if (img.isEmpty()) return;
  if (img.getSize().width !== FLAT) img = img.resize({ width: FLAT, quality: "good" });
  let { width: w, height: h } = img.getSize();
  if (!flatFF) {
    h -= h % 2;                                   // yuv420p wants even sizes
    flatSize = { w, h };
    fs.mkdirSync(OUT, { recursive: true });
    flatFF = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y",
      "-f", "rawvideo", "-pix_fmt", "bgra", "-s", `${w}x${h}`, "-framerate", String(FPS), "-i", "-",
      "-c:v", "h264_videotoolbox", "-b:v", "16M", "-pix_fmt", "yuv420p", "-tag:v", "avc1", flatTmp()],
      { stdio: ["pipe", "inherit", "inherit"] });
    flatDone = new Promise((res) => flatFF.on("close", res));
    flatFF.stdin.on("error", () => { /* reported at the end */ });
  }
  const bmp = img.toBitmap();
  const need = flatSize.w * flatSize.h * 4;
  const buf = bmp.length === need ? bmp : bmp.subarray(0, need);   // an odd height: drop the last row
  if (!flatFF.stdin.write(buf)) await new Promise((r) => flatFF.stdin.once("drain", r));
}

function flatMux() {
  if (!fs.existsSync(flatTmp())) return;
  const wav = ["_2ch.wav", "_LRLsRs.wav", "_1ch.wav"].map((s) => path.join(OUT, `${NAME}_${SIZE}${s}`)).find((f) => fs.existsSync(f));
  const args = ["-hide_banner", "-loglevel", "error", "-y", "-i", flatTmp(),
    ...(wav ? ["-i", wav, "-map", "0:v", "-map", "1:a", "-ac", "2", "-c:a", "aac", "-b:a", "256k", "-shortest"] : []),
    "-c:v", "copy", "-movflags", "+faststart", flatOut()];
  if (spawnSync("ffmpeg", args, { stdio: "inherit" }).status === 0) {
    fs.unlinkSync(flatTmp());
    console.log(`[dome-render] ${path.basename(flatOut())}  ${flatSize.w}×${flatSize.h} · la página, plana${wav ? " · con audio" : ""}`);
  } else console.log(`[dome-render] (the page video is at ${flatTmp()}; adding its audio failed)`);
}

// ── Audio: the same span of the recording ───────────────────────────────────
function cutAudio() {
  const wav = header.wav && path.resolve(path.dirname(SESSION), header.wav);
  const src = [header.wav, wav].find((p) => p && fs.existsSync(p));
  if (!src) { console.log(`[dome-render] (no audio: ${header.wav} not found)`); return; }
  const start = Math.max(0, (FROM_MS + AUDIO_OFFSET_MS) / 1000);
  const dur = N_FRAMES / FPS;
  const base = path.join(OUT, `${NAME}_${SIZE}`);
  const chans = Number(spawnSync("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries",
    "stream=channels", "-of", "csv=p=0", src]).stdout.toString().trim()) || 0;
  const cut = ["-hide_banner", "-loglevel", "error", "-y", "-ss", start.toFixed(4), "-t", dur.toFixed(4), "-i", src];
  const out24 = ["-ar", "48000", "-c:a", "pcm_s24le"];
  const say = (file, what) => console.log(`[dome-render] ${path.basename(file)}  ${dur.toFixed(2)} s from ${start.toFixed(2)} s of ${path.basename(src)} · 48 kHz / 24 bit · ${what}`);

  const stereo = chans === 1 || chans === 2;
  if (chans !== 4 && !(stereo && UPMIX)) {
    // passed on as it is: --no-upmix, or a channel count we do not place
    const f = `${base}_${chans}ch.wav`;
    if (spawnSync("ffmpeg", [...cut, ...out24, f], { stdio: "inherit" }).status === 0) say(f, `${chans} ch`);
    return;
  }

  // The planetarium plays WAV at 48 kHz / 24 bit. Two files per clip, from
  // one quad in console order, L R Ls Rs (ffmpeg's FL FR BL BR):
  //
  //   _LRLsRs.wav  the quad. SC records the ring in PanAz order (0 FL, 1 FR,
  //                2 RR, 3 RL), so the rears are swapped — channelmap, not
  //                pan: pan between these layouts remixes instead of
  //                reordering (measured).
  //   _5.1.wav     the quad plus a silent centre and an LFE: the four
  //                summed, low-passed at 100 Hz (24 dB/oct). Their native
  //                5.1 track — the room's six subwoofers get their own channel
  //                and the show needs no interface of ours at all.
  //
  // A stereo take (no MOTU) becomes a quad by a passive upmix:
  //   L R    the take itself, untouched: the image stays in front.
  //   Ls Rs  each side minus half the other — the stereo difference, the
  //          room and the width, with less of what sits in the middle —
  //          low-passed at 7 kHz and delayed 12 / 15 ms. The delay keeps
  //          localisation on the fronts (precedence); two different delays
  //          decorrelate the rears, so they surround instead of forming a
  //          phantom behind. Their level is set by the 0.7 / −0.35 mix.
  //   LFE    as for a MOTU take: the four summed, under 100 Hz.
  // The original stereo is kept beside them as _2ch.wav.
  let quadGraph;
  if (chans === 4) {
    quadGraph = "[0:a]aresample=48000,channelmap=map=0|1|3|2:channel_layout=quad[q]";
  } else {
    const st = chans === 1 ? "pan=stereo|c0=c0|c1=c0" : "aformat=channel_layouts=stereo";
    quadGraph = `[0:a]aresample=48000,${st},asplit=3[f][a][b];` +
      "[f]channelsplit=channel_layout=stereo[L][R];" +
      "[a]pan=mono|c0=0.7*c0-0.35*c1,lowpass=f=7000,adelay=12[Ls];" +
      "[b]pan=mono|c0=0.7*c1-0.35*c0,lowpass=f=7000,adelay=15[Rs];" +
      "[L][R][Ls][Rs]join=inputs=4:channel_layout=quad:map=0.0-FL|1.0-FR|2.0-BL|3.0-BR[q]";
    const f = `${base}_${chans}ch.wav`;
    if (spawnSync("ffmpeg", [...cut, ...out24, f], { stdio: "inherit" }).status === 0) say(f, `${chans} ch, the take as recorded`);
  }
  const how = chans === 4 ? "" : ` · upmix from ${chans === 1 ? "mono" : "stereo"}`;
  const t = ["-t", dur.toFixed(4)];

  const quad = `${base}_LRLsRs.wav`;
  if (spawnSync("ffmpeg", [...cut, "-filter_complex", quadGraph, "-map", "[q]", ...t, "-c:a", "pcm_s24le", quad], { stdio: "inherit" }).status === 0) {
    say(quad, `L R Ls Rs${how}`);
  }
  const five = `${base}_5.1.wav`;
  const graph = `${quadGraph};[q]asplit=2[m][s];` +
    "[m]channelsplit=channel_layout=quad[qL][qR][qLs][qRs];" +
    `[s]pan=mono|c0=0.25*c0+0.25*c1+0.25*c2+0.25*c3,lowpass=f=${LFE_HZ},lowpass=f=${LFE_HZ}[lfe];` +
    "anullsrc=channel_layout=mono:sample_rate=48000[c];" +
    "[qL][qR][c][lfe][qLs][qRs]join=inputs=6:channel_layout=5.1:map=0.0-FL|1.0-FR|2.0-FC|3.0-LFE|4.0-BL|5.0-BR[out]";
  if (spawnSync("ffmpeg", [...cut, "-filter_complex", graph, "-map", "[out]", ...t, "-c:a", "pcm_s24le", five],
    { stdio: "inherit" }).status === 0) {
    say(five, `5.1 · L R C LFE Ls Rs · LFE < ${LFE_HZ} Hz${how}`);
    // embedding waits for the loudness pass (levelAudio), below
  }
}

/**
 * Delivery level, in post: every WAV of the clip gets the SAME plain gain, so
 * the 5.1, the quad and the stereo stay identical to each other, and nothing
 * is limited or compressed — the take's dynamics are the piece's. The gain
 * brings the integrated loudness (EBU R128, measured on the quad or the
 * stereo) to LOUDNESS, unless that would push the true peak past −1 dBTP, in
 * which case it stops there. Then the 5.1 is embedded if asked.
 */
function levelAudio() {
  const base = path.join(OUT, `${NAME}_${SIZE}`);
  const wavs = ["_5.1.wav", "_LRLsRs.wav", "_2ch.wav", "_1ch.wav"].map((x) => base + x).filter((f) => fs.existsSync(f));
  const ref = [base + "_LRLsRs.wav", base + "_2ch.wav", base + "_1ch.wav", base + "_5.1.wav"].find((f) => fs.existsSync(f));
  if (ref) {
    const m = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", ref, "-af", "ebur128=peak=true", "-f", "null", "-"], { encoding: "utf8" }).stderr;
    const sum = m.slice(m.lastIndexOf("Summary"));
    const I = Number((sum.match(/I:\s+(-?[\d.]+) LUFS/) || [])[1]);
    const TP = Number((sum.match(/Peak:\s+(-?[\d.]+) dBFS/) || [])[1]);
    if (Number.isFinite(I) && Number.isFinite(TP) && I > -70) {
      const gain = Math.min(LOUDNESS - I, -1 - TP);
      for (const f of wavs) {
        const tmp = f.replace(/\.wav$/, ".lvl.tmp.wav");
        const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", f, "-af", `volume=${gain.toFixed(2)}dB`, "-c:a", "pcm_s24le", tmp], { stdio: "inherit" });
        if (r.status === 0) fs.renameSync(tmp, f); else { try { fs.unlinkSync(tmp); } catch { /* none */ } }
      }
      const capped = gain < LOUDNESS - I - 0.05;
      console.log(`[dome-render] level: ${I.toFixed(1)} LUFS, true peak ${TP.toFixed(1)} dBTP → ${(I + gain).toFixed(1)} LUFS, ${(TP + gain).toFixed(1)} dBTP (${gain >= 0 ? "+" : ""}${gain.toFixed(1)} dB${capped ? ", held by the −1 dBTP ceiling" : ""})`);
    } else {
      console.log(`[dome-render] (level: could not measure ${path.basename(ref)}; WAVs left as cut)`);
    }
  }
  const five = base + "_5.1.wav";
  if (EMBED_AUDIO && fs.existsSync(five)) embedAudio(five);
}

/**
 * The 5.1 inside the .mov as well, as 24-bit PCM: one file, picture and sound
 * locked. The video is copied, not re-encoded (any ffmpeg can copy HAP), and
 * the .mov is replaced only once the new one is complete.
 */
function embedAudio(five) {
  const mov = fs.readdirSync(OUT).find((f) => f.endsWith(".mov"));
  if (!mov) { console.log("[dome-render] (--embed-audio: no .mov — use --format hapq or prores)"); return; }
  const src = path.join(OUT, mov), tmp = src.replace(/\.mov$/, ".audio.tmp.mov");
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", src, "-i", five,
    "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "pcm_s24le", "-shortest", tmp], { stdio: "inherit" });
  if (r.status === 0) { fs.renameSync(tmp, src); console.log(`[dome-render] ${mov}  + 5.1 PCM embedded`); }
  else { try { fs.unlinkSync(tmp); } catch { /* none */ } console.log("[dome-render] embedding the audio failed; the .mov and the WAVs are as they were"); }
}

// ── The page ────────────────────────────────────────────────────────────────
function reachable(url) {
  return new Promise((res) => {
    const req = http.get(url, (r) => { r.resume(); res(r.statusCode < 500); });
    req.on("error", () => res(false));
    req.setTimeout(3000, () => { req.destroy(); res(false); });
  });
}

async function waitFor(wc, expr, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (await wc.executeJavaScript(expr)) return true; } catch { /* page still loading */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

function fmt(s) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

// The page itself, flat, the way the performer saw it: the window's own
// paint, taken once the stepped frame has reached the screen.
async function pageStill(win, tSession) {
  const dir = path.join(OUT, `${NAME}_pagina`);
  fs.mkdirSync(dir, { recursive: true });
  // (the page's own timers run on the virtual clock: the wait is out here)
  await new Promise((r) => setTimeout(r, 60));
  const img = await win.webContents.capturePage();
  if (img.isEmpty()) return;
  const s = Math.round(tSession / 1000);
  fs.writeFileSync(path.join(dir, `pagina_${String(Math.floor(s / 60)).padStart(2, "0")}m${String(s % 60).padStart(2, "0")}s.png`), img.toPNG());
}

async function run() {
  if (!(await reachable(URL_BASE))) fail(`${URL_BASE} is not answering — start it with: npm run serve`);

  const win = new BrowserWindow({
    show: false,
    width: WIN_W, height: WIN_H, useContentSize: true,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      preload: path.join(__dirname, "dome-render-preload.js"),
      backgroundThrottling: false,
      contextIsolation: true,
    },
  });
  const wc = win.webContents;
  // The dev server reloads its pages when the code changes. A reload here
  // would throw away a render in progress (or the dome mid-show): its
  // live-reload socket is refused for this window.
  win.webContents.session.webRequest.onBeforeRequest(
    { urls: ["ws://localhost:9001/*", "ws://127.0.0.1:9001/*"] },
    (_d, cb) => cb({ cancel: true }));
  wc.on("console-message", (e) => {
    if (e.level === "error" || String(e.message).startsWith("[render]")) console.log(`  page: ${e.message}`);
  });
  wc.on("render-process-gone", (_e, d) => fail(`the page died (${d.reason})`));

  const url = `${URL_BASE}?render=1&dome=${SIZE}&epoch=${EPOCH}`;
  await win.loadURL(url);
  if (!(await waitFor(wc, "!!(window.__render && window.__render.ready())", 60000))) {
    fail("the page never became ready (is this branch's build being served?)");
  }

  console.log(`[dome-render] ${NAME}`);
  console.log(`[dome-render] ${SIZE}² @ ${FPS} fps · ${(FROM_MS / 1000).toFixed(1)}–${(TO_MS / 1000).toFixed(1)} s · ${N_FRAMES} frames · ${FORMAT} → ${OUT}`);
  if (FLAT) console.log(`[dome-render] + la página, plana, a ${FLAT} de ancho${NO_DOME ? " — sin domemaster" : ""}`);

  const dt = 1000 / FPS;
  const step = (to, batch, render = false) =>
    wc.executeJavaScript(`window.__render.step(${to}, ${JSON.stringify(batch)}, ${render})`);

  // Warm-up: the page runs before time zero with nothing arriving, so slots
  // mount and settle before the first message.
  for (let t = dt; t <= WARMUP_MS; t += dt) await step(t, []);

  // Then the session. Frame k shows time FROM + k/FPS; everything up to FROM
  // is played through without rendering, so the page arrives there in the
  // state the performance left it in.
  let next = 0;
  let frames = 0;
  const t0 = Date.now();
  let lastLog = t0;
  const total = Math.ceil(FROM_MS / dt) + N_FRAMES;
  for (let k = 0; k < total; k++) {
    const tSession = k * dt;
    const batch = [];
    while (next < items.length && items[next].t <= tSession) {
      const it = items[next++];
      batch.push(it.m !== undefined ? { t: it.t + WARMUP_MS, m: it.m } : { t: it.t + WARMUP_MS, s: it.s });
    }
    const capture = tSession + 1e-6 >= FROM_MS;
    await step(tSession + WARMUP_MS, batch, capture && !NO_DOME);
    if (!capture) continue;
    if (!NO_DOME) await wc.executeJavaScript("window.__render.frame()");
    if (FLAT) await flatFrame(win);
    if (STILLS && frames % Math.max(1, Math.round(STILLS * FPS)) === 0) await pageStill(win, tSession);
    frames++;
    const now = Date.now();
    if (now - lastLog > 2000 || frames === N_FRAMES) {
      lastLog = now;
      const rate = frames / ((now - t0) / 1000);
      const eta = (N_FRAMES - frames) / Math.max(rate, 1e-6);
      process.stdout.write(`\r[dome-render] ${frames}/${N_FRAMES}  ${rate.toFixed(2)} fps  session ${fmt(tSession / 1000)}  eta ${fmt(eta)}   `);
    }
  }
  process.stdout.write("\n");

  if (ff) { ffEnding = true; ff.stdin.end(); await ffDone; }
  if (flatFF) { flatFF.stdin.end(); await flatDone; }
  win.destroy();
  cutAudio();
  levelAudio();
  if (FLAT) flatMux();
  if (FORMAT !== "png" && (PREVIEW || STILLS)) {
    const mov = fs.readdirSync(OUT).find((f) => f.endsWith(".mov") && !f.includes(".tmp."));
    if (mov) {
      console.log("[dome-render] preview…");
      try {
        const files = await require("./dome-preview").makePreview(path.join(OUT, mov), { stills: STILLS });
        for (const f of files) console.log(`[dome-render] ${path.basename(f)}`);
      } catch (e) { console.log(`[dome-render] (preview failed: ${e.message} — the clip itself is fine)`); }
    }
  }
  console.log(`[dome-render] done in ${fmt((Date.now() - t0) / 1000)} → ${OUT}`);
  app.exit(0);
}

// The window is closed before the audio and the preview are made: without
// this, Electron's default quits the app the moment it closes.
app.on("window-all-closed", () => { /* run() exits when it is done */ });
app.whenReady().then(() => {
  if (AUDIO_ONLY) {
    fs.mkdirSync(OUT, { recursive: true });
    cutAudio();
    levelAudio();
    app.exit(0);
    return;
  }
  run().catch((e) => fail(e.stack || String(e)));
});
