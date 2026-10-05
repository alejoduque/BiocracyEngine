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
// Run:  npm run dome:live        (needs npm run serve; start_ecosystem.sh
//                                 does both with DOME_LIVE=1)
// Env:  DOME_LIVE_URL (http://localhost:9001/parliament.html)
//       DOME_NDI_NAME ("BiocracyEngine Cúpula")

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
  win.webContents.on("console-message", (e) => {
    if (String(e.message).startsWith("[dome-live]") || e.level === "error") console.log(`  page: ${e.message}`);
  });
  win.webContents.on("render-process-gone", (_e, d) => {
    console.error(`[dome-live] page died (${d.reason}) — reloading`);
    win.reload();
  });
  await win.loadURL(URL);
  console.log("[dome-live] up — in the page: D → CÚPULA → salida: ndi");
}

app.whenReady().then(run);
app.on("window-all-closed", () => app.quit());
