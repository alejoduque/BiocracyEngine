// dome-preview.js — a dome clip you can open on any Mac, and stills to check
// ===========================================================================
// The planetarium's format, HAP Q, is a playback codec for media servers
// (Digistar, Resolume, TouchDesigner): QuickTime and VLC do not open it. This
// makes, beside each clip:
//
//   <clip>_preview_2048.mp4   H.264 (VideoToolbox), 2048², 30 fps, with the
//                             clip's audio as stereo AAC — opens in QuickTime
//   <clip>_stills/…png        one full-size frame every N seconds (--stills N)
//
// HAP is decoded by the ffmpeg built with snappy (tools/ffmpeg-hap); the
// system's ffmpeg encodes the H.264. Run on its own, or dome-render.js calls
// it when a clip is done.
//
//   node dome-preview.js <clip.mov> [--stills 10] [--size 2048]

const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const HAP_FFMPEG = process.env.DOME_FFMPEG || path.join(__dirname, "..", "tools", "ffmpeg-hap", "bin", "ffmpeg");

/** Make the preview (and stills) for one clip. Resolves to the files written. */
function makePreview(mov, { size = 2048, stills = 0 } = {}) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(mov)) return reject(new Error(`no such file: ${mov}`));
    const decoder = fs.existsSync(HAP_FFMPEG) ? HAP_FFMPEG : "ffmpeg";
    const dir = path.dirname(mov);
    const stem = path.basename(mov).replace(/_hapq_\d+fps\.mov$|\.mov$/i, "");
    const out = path.join(dir, `${stem}_preview_${size}.mp4`);
    // the clip's own audio, if a WAV of the same stem is beside it
    const wav = ["_5.1.wav", "_LRLsRs.wav", "_2ch.wav", "_1ch.wav"]
      .map((s) => path.join(dir, stem + s)).find((f) => fs.existsSync(f));
    const fps = spawnSync(decoder, ["-hide_banner", "-i", mov], { encoding: "utf8" }).stderr.match(/(\d+(?:\.\d+)?) fps/)?.[1] || "30";

    // decode → raw RGBA at preview size → H.264
    const dec = spawn(decoder, ["-hide_banner", "-loglevel", "error", "-i", mov,
      "-vf", `scale=${size}:${size}`, "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { stdio: ["ignore", "pipe", "inherit"] });
    const enc = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y",
      "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${size}x${size}`, "-r", fps, "-i", "-",
      ...(wav ? ["-i", wav, "-map", "0:v", "-map", "1:a", "-ac", "2", "-c:a", "aac", "-b:a", "256k"] : []),
      "-c:v", "h264_videotoolbox", "-b:v", "24M", "-pix_fmt", "yuv420p", "-tag:v", "avc1",
      "-shortest", "-movflags", "+faststart", out], { stdio: ["pipe", "inherit", "inherit"] });
    dec.stdout.pipe(enc.stdin);
    enc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`preview encode failed (exit ${code})`));
      const files = [out];
      if (stills > 0) {
        const sdir = path.join(dir, `${stem}_stills`);
        fs.mkdirSync(sdir, { recursive: true });
        const r = spawnSync(decoder, ["-hide_banner", "-loglevel", "error", "-y", "-i", mov,
          "-vf", `fps=1/${stills}`, path.join(sdir, "still_%04d.png")], { stdio: "inherit" });   // needs the fps filter (build.sh)
        if (r.status === 0) files.push(sdir);
      }
      resolve(files);
    });
  });
}

module.exports = { makePreview };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const mov = argv.find((a) => !a.startsWith("--"));
  const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? Number(argv[i + 1]) : d; };
  if (!mov) { console.error("usage: node dome-preview.js <clip.mov> [--stills 10] [--size 2048]"); process.exit(1); }
  const t0 = Date.now();
  makePreview(path.resolve(mov), { size: opt("size", 2048), stills: opt("stills", 0) })
    .then((files) => { for (const f of files) console.log(`[dome-preview] ${f}`); console.log(`[dome-preview] done in ${((Date.now() - t0) / 1000).toFixed(0)} s`); })
    .catch((e) => { console.error(`[dome-preview] ${e.message}`); process.exit(1); });
}
