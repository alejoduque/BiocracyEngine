// dome-live.js — the instrument in its own window, with the dome on NDI
// ===========================================================================
// The live half of the dome show. Opens parliament.html in an Electron window
// — the same page as in the browser, the performer's surface — whose preload
// (dome-live-preload.js) is an NDI sender. In the page: D opens CÚPULA, set
// the size (2048 for live) and choose "ndi" as the output. The output keeps
// running with the viewport closed, and comes back on by itself if this
// window is reopened mid-show.
//
//   parliament.html ──readback──► window.__domeOut ──NDI──► Digistar 7
//
// Only this window can send NDI; the page opened in a browser offers it but
// has no sender behind it.
//
// A second NDI source, "BiocracyEngine Página", is the page itself, flat and
// whole — the side columns, the controls, the stage — exactly as the
// performer sees it, 16:9. Nothing extra is rendered: it is the window's own
// paint, taken as it is composited (webContents.beginFrameSubscription), and
// only while a receiver is connected. The dome takes one NDI source at a
// time; the VJ chooses between Cúpula (the fisheye) and Página (a flat panel
// on the dome). With the CÚPULA viewport floated to another window ("ventana
// aparte") the page underneath stays clean.
//
// Run:  npm run dome:live        (needs npm run serve; start_ecosystem.sh
//                                 does both with DOME_LIVE=1)
// Env:  DOME_LIVE_URL (http://localhost:9001/parliament.html)
//       DOME_NDI_NAME ("BiocracyEngine Cúpula")
//       DOME_PAGE_NAME ("BiocracyEngine Página")   DOME_PAGE=0 turns it off
//       DOME_PAGE_WIDTH (1920: the page is scaled to this width)  DOME_PAGE_FPS (30)

const { app, BrowserWindow, screen } = require("electron");
const path = require("path");
const http = require("http");

const URL = process.env.DOME_LIVE_URL || "http://localhost:9001/parliament.html";

// The dome must keep its frame rate when this window is covered by another
// (SC's GUI, a terminal) or on a second screen nobody looks at.
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");

function reachable(url) {
  return new Promise((res) => {
    const req = http.get(url, (r) => { r.resume(); res(r.statusCode < 500); });
    req.on("error", () => res(false));
    req.setTimeout(2000, () => { req.destroy(); res(false); });
  });
}

// ── Página: the window as painted, as its own NDI source ───────────────────

function pageSource(win) {
  if (process.env.DOME_PAGE === "0") return;
  let grandiose;
  try { grandiose = require("@stagetimerio/grandiose"); } catch { return; }   // the preload already warned
  const name = process.env.DOME_PAGE_NAME || "BiocracyEngine Página";
  const width = parseInt(process.env.DOME_PAGE_WIDTH || "1920", 10);
  const minGap = 1000 / parseInt(process.env.DOME_PAGE_FPS || "30", 10) - 2;
  let sender = null, on = false, busy = false, last = 0, sent = 0;

  grandiose.send({ name, clockVideo: false })
    .then((s) => { sender = s; console.log(`[dome-live] NDI source "${s.sourcename()}" up (the page, flat)`); })
    .catch((e) => console.warn(`[dome-live] page NDI sender failed: ${e.message}`));

  const onFrame = (image) => {
    const now = Date.now();
    if (busy || now - last < minGap || !sender) return;
    last = now;
    let img = image;
    const sz = img.getSize();
    if (sz.width > width) img = img.resize({ width, quality: "good" });
    const { width: w, height: h } = img.getSize();
    const data = img.toBitmap();   // BGRA, hence BGRX on the wire
    busy = true;
    sender.video({
      xres: w, yres: h, frameRateN: 30000, frameRateD: 1000,
      fourCC: grandiose.FOURCC_BGRX, pictureAspectRatio: w / h, frameFormatType: 1,
      lineStrideBytes: w * 4, data,
    }).then(() => { sent++; }).catch(() => { /* a dropped frame */ }).finally(() => { busy = false; });
  };

  // Paid for only while someone watches: subscribe when a receiver connects.
  // The page is told too (window.__domePageLive, again after a reload): while
  // it is on air its flat view keeps full quality instead of the dome's
  // economy (src/projector/dome/dome.ts).
  let told = null;
  win.webContents.on("did-finish-load", () => { told = null; });
  setInterval(() => {
    if (!sender || win.isDestroyed()) return;
    const n = sender.connections();
    if (n > 0 && !on) { on = true; sent = 0; win.webContents.beginFrameSubscription(false, onFrame); console.log(`[dome-live] página: ${n} receptor(es) — enviando`); }
    else if (n === 0 && on) { on = false; win.webContents.endFrameSubscription(); console.log("[dome-live] página: sin receptores — en pausa"); }
    if (told !== on) {
      told = on;
      win.webContents.executeJavaScript(`window.__domePageLive = ${on}`).catch(() => { told = null; });
    }
  }, 1000);
}

async function run() {
  // start_ecosystem.sh starts webpack at the same moment: wait for it.
  for (let i = 0; !(await reachable(URL)); i++) {
    if (i === 0) console.log(`[dome-live] waiting for ${URL} …`);
    if (i > 120) { console.error(`[dome-live] ${URL} never answered — is npm run serve running?`); app.exit(1); return; }
    await new Promise((r) => setTimeout(r, 1000));
  }

  const { workArea } = screen.getPrimaryDisplay();
  const win = new BrowserWindow({
    x: workArea.x, y: workArea.y, width: workArea.width, height: workArea.height,
    title: "Parlamento de lo vivo — cúpula en vivo",
    backgroundColor: "#000000",
    webPreferences: {
      preload: path.join(__dirname, "dome-live-preload.js"),
      // Shared world, so the page's pixels reach the sender without a copy.
      // The page is our own, served from localhost; it loads no remote code.
      contextIsolation: false,
      sandbox: false,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  // The dev server reloads its pages when the code changes. A reload here
  // would throw away a render in progress (or the dome mid-show): its
  // live-reload socket is refused for this window.
  win.webContents.session.webRequest.onBeforeRequest(
    { urls: ["ws://localhost:9001/*", "ws://127.0.0.1:9001/*"] },
    (_d, cb) => cb({ cancel: true }));
  // The page's "ventana aparte": the CÚPULA viewport in a window of its own,
  // to drag to a second screen. Nothing else may open windows.
  win.webContents.setWindowOpenHandler(({ frameName }) => (frameName === "biocracy-dome"
    ? { action: "allow", overrideBrowserWindowOptions: { backgroundColor: "#000000", title: "CÚPULA", autoHideMenuBar: true } }
    : { action: "deny" }));
  win.webContents.on("console-message", (e) => {
    if (String(e.message).startsWith("[dome-live]") || e.level === "error") console.log(`  page: ${e.message}`);
  });
  win.webContents.on("render-process-gone", (_e, d) => {
    console.error(`[dome-live] page died (${d.reason}) — reloading`);
    win.reload();
  });
  await win.loadURL(URL);
  pageSource(win);
  console.log("[dome-live] up — in the page: D → CÚPULA → salida: ndi (ventana aparte: la cúpula a otra pantalla)");
}

app.whenReady().then(run);
app.on("window-all-closed", () => app.quit());
