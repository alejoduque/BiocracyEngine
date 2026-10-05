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
//   --session <file>     the .session.jsonl (required)
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
//
// Audio: two WAVs at 48 kHz / 24 bit beside the video — <name>_LRLsRs.wav
// (four channels, console order) and <name>_5.1.wav (L R C LFE Ls Rs, the
// centre silent, the LFE the low end of the mix) — see cutAudio().
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
const SESSION = path.resolve(args.session);
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

  if (chans !== 4) {
    // a stereo session (no MOTU when it was recorded): passed on as it is
    const f = `${base}_${chans}ch.wav`;
    if (spawnSync("ffmpeg", [...cut, ...out24, f], { stdio: "inherit" }).status === 0) say(f, `${chans} ch`);
    return;
  }

  // The planetarium plays WAV at 48 kHz / 24 bit. Two files per clip:
  //
  //   _LRLsRs.wav  the four channels in console order, L R Ls Rs. SC records
  //                the quad ring in PanAz order (0 FL, 1 FR, 2 RR, 3 RL), so
  //                the rears are swapped — channelmap, not pan: pan between
  //                these layouts remixes instead of reordering (measured).
  //   _5.1.wav     the same four plus a silent centre and an LFE: the four
  //                summed, low-passed at 100 Hz (24 dB/oct). Their native
  //                5.1 track — the room's six subwoofers get their own channel
  //                and the show needs no interface of ours at all.
  const quad = `${base}_LRLsRs.wav`;
  if (spawnSync("ffmpeg", [...cut, "-af", "channelmap=map=0|1|3|2:channel_layout=quad", ...out24, quad], { stdio: "inherit" }).status === 0) {
    say(quad, "L R Ls Rs");
  }
  const five = `${base}_5.1.wav`;
  const graph = "[0:a]aresample=48000,asplit=2[m][s];" +
    "[m]channelmap=map=0|1|3|2:channel_layout=quad,channelsplit=channel_layout=quad[L][R][Ls][Rs];" +
    `[s]pan=mono|c0=0.25*c0+0.25*c1+0.25*c2+0.25*c3,lowpass=f=${LFE_HZ},lowpass=f=${LFE_HZ}[lfe];` +
    "anullsrc=channel_layout=mono:sample_rate=48000[c];" +
    "[L][R][c][lfe][Ls][Rs]join=inputs=6:channel_layout=5.1:map=0.0-FL|1.0-FR|2.0-FC|3.0-LFE|4.0-BL|5.0-BR[out]";
  if (spawnSync("ffmpeg", [...cut, "-filter_complex", graph, "-map", "[out]", "-t", dur.toFixed(4), "-c:a", "pcm_s24le", five],
    { stdio: "inherit" }).status === 0) {
    say(five, `5.1 · L R C LFE Ls Rs · LFE < ${LFE_HZ} Hz`);
  }
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

  const dt = 1000 / FPS;
  const step = (to, batch) => wc.executeJavaScript(`window.__render.step(${to}, ${JSON.stringify(batch)})`);

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
    await step(tSession + WARMUP_MS, batch);
    if (tSession + 1e-6 < FROM_MS) continue;
    await wc.executeJavaScript("window.__render.frame()");
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
  win.destroy();
  cutAudio();
  console.log(`[dome-render] done in ${fmt((Date.now() - t0) / 1000)} → ${OUT}`);
  app.exit(0);
}

app.whenReady().then(() => run().catch((e) => fail(e.stack || String(e))));
