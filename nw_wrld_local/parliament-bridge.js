#!/usr/bin/env node
// Parliament OSC → WebSocket Bridge  (v2 — bidirectional + SC path translation)
// SC sends to UDP:3333 with paths like /eco/co2, /soneth/volume, etc.
// nw_wrld InputManager only accepts /track/* and /ch/* paths.
// This bridge translates SC paths → /ch/<methodName> so nw_wrld triggers
// the correct method on the active module (BiocracyVisualizer, etc.).
//
// Browser → SC: messages with direction:"toSC" are relayed as OSC to sclang.

const osc = require("osc");
const { WebSocketServer } = require("ws");

const OSC_PORT = 3333;  // UDP: SC → bridge
const WS_PORT = 3334;  // WS:  bridge ↔ browser (nw_wrld)
const SC_PORT = 57120; // UDP: bridge → SC (for browser→SC echo)

const SC_TO_CH = {
  // V3 Core Visualizer Data Streams
  "/bio/nutrient": "updateNutrient",       // ETH Value -> PerlinBlob
  "/bio/consensus": "updateConsensus",     // Gas/Hash -> ZKProofVisualizer
  "/bio/density": "updateDensity",         // TxDensity -> LowEarthPoint

  // ── Row 1: Core Performance (SC ↔ browser sync) ────────────────────
  "/soneth/volume": "setVolume",
  "/soneth/pitchshift": "setPitchShift",
  "/soneth/timedilation": "setTimeDilation",
  "/soneth/spectralshift": "setSpectralShift",
  "/soneth/spatialspread": "setSpatialSpread",

  // ── Row 2: Ambient Processing ──────────────────────────────────────
  "/soneth/texturedepth": "setTextureDepth",
  "/soneth/atmospheremix": "setAtmosphereMix",
  "/soneth/memoryfeed": "setMemoryFeed",
  "/soneth/harmonicrich": "setHarmonicRich",
  "/soneth/resonantbody": "setResonantBody",

  // ── Row 3: Drone/Noise Controls (now echoed for visual sync) ───────
  "/soneth/masteramp": "setMasterAmp",
  "/soneth/filtercutoff": "setFilterCutoff",
  "/soneth/noiselevel": "setNoiseLevel",
  "/soneth/noisefilt": "setNoiseFilt",
  "/soneth/dronedepth": "setDroneDepth",

  // ── Row 4: Additional Controls ─────────────────────────────────────
  "/soneth/dronefade": "setDroneFade",
  "/soneth/dronespace": "setDroneSpace",
  "/soneth/dronemix": "setDroneMix",
  "/soneth/delayfeedback": "setDelayFeedback",
  "/soneth/txinfluence": "setTxInfluence",

  // ── Beat Engine ────────────────────────────────────────────────────
  "/soneth/beatTempo": "setBeatTempo",
  "/soneth/txInfluence": "setTxInfluence",

  // Legacy mappings (kept for compatibility)
  "/eco/co2": "triggerCO2",
  "/eco/mycoPulse": "triggerMycoPulse",
  "/eco/phosphorus": "triggerPhosphorus",
  "/eco/nitrogen": "triggerNitrogen",
  "/soneth/ethEvent": "triggerMycoPulse",
};

// WebSocket server (nw_wrld connects here)
const wss = new WebSocketServer({ port: WS_PORT });
const clients = new Set();

// Outgoing OSC port → SuperCollider
const scPort = new osc.UDPPort({
  localAddress: "0.0.0.0",
  localPort: 0,
  remoteAddress: "127.0.0.1",
  remotePort: SC_PORT,
  metadata: true,
});
scPort.open();

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log(`[bridge] ✅ WebSocket client connected (${clients.size} total)`);

  // Browser → SC: forward messages tagged direction:"toSC" as OSC
  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.direction === "toSC" && msg.address) {
        const oscArgs = (msg.args || []).map((v) => ({ type: "f", value: Number(v) }));
        scPort.send({ address: msg.address, args: oscArgs });
        console.log(`[bridge] browser→SC  ${msg.address}  ${JSON.stringify(msg.args)}`);
      }
    } catch (_) { }
  });

  ws.on("close", () => {
    clients.delete(ws);
    console.log(`[bridge] WebSocket client disconnected (${clients.size} total)`);
  });
});

// Helper: broadcast a JSON payload to all connected browser clients
function broadcast(payload) {
  const json = JSON.stringify(payload);
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(json);
  }
}

// UDP OSC receiver (from SC)
const udpPort = new osc.UDPPort({
  localAddress: "0.0.0.0",
  localPort: OSC_PORT,
  metadata: true,
});

udpPort.on("message", (oscMsg) => {
  const address = oscMsg.address;
  const args = (oscMsg.args || []).map((a) => a.value);

  // ── Route 1: known SC paths → translate to /ch/methodName ────────────────
  const methodName = SC_TO_CH[address];
  if (methodName) {
    broadcast({
      type: "method-trigger",
      data: {
        channelName: `/ch/${methodName}`,
        address: `/ch/${methodName}`,
        velocity: args.length > 0 ? Number(args[0]) : 1,
        source: "osc",
        timestamp: Date.now() / 1000,
      },
    });
    // Also send raw for parliament.html / custom subscribers
    broadcast({ address, args });
    console.log(`[bridge] SC→browser  ${address} → /ch/${methodName}  args=${args}`);
    return;
  }

  // ── Route 2: /parliament/* and /agent/* → pass raw for parliament.html ────
  if (address.startsWith("/parliament/") || address.startsWith("/agent/")) {
    broadcast({ address, args });
    return;
  }

  // ── Route 3: unknown paths → pass raw (let browser decide) ───────────────
  broadcast({ address, args });
  console.log(`[bridge] SC→browser (raw)  ${address}  args=${args}`);
});

// ─── Diagnostic Tracking ────────────────────────────────────────────────────
// Tracks message counts per path and direction for the /diag HTTP endpoint.
const diagStats = {
  startTime: Date.now(),
  scToBrowser: {},    // { "/soneth/volume": { count: 0, lastVal: 0, lastTime: 0 } }
  browserToSc: {},
};

function trackMsg(dir, address, val) {
  const bucket = dir === "sc2b" ? diagStats.scToBrowser : diagStats.browserToSc;
  if (!bucket[address]) bucket[address] = { count: 0, lastVal: null, lastTime: 0 };
  bucket[address].count++;
  bucket[address].lastVal = val;
  bucket[address].lastTime = Date.now();
}

// Patch into OSC message handler
const origOscHandler = udpPort.listeners("message")[0];
udpPort.removeListener("message", origOscHandler);
udpPort.on("message", (oscMsg) => {
  const address = oscMsg.address;
  const args = (oscMsg.args || []).map((a) => a.value);
  trackMsg("sc2b", address, args[0] ?? null);
  // Re-emit to original handler by re-dispatching the same logic
  origOscHandler(oscMsg);
});

// HTTP diagnostic endpoint — curl http://localhost:3335/diag
const http = require("http");
const DIAG_PORT = 3335;

http.createServer((req, res) => {
  if (req.url === "/diag" || req.url === "/diag/") {
    const uptime = ((Date.now() - diagStats.startTime) / 1000).toFixed(0);
    const now = Date.now();

    // Build report
    const lines = [];
    lines.push(`Bridge Diagnostic — uptime ${uptime}s — ${clients.size} WS clients`);
    lines.push(`Routes registered: ${Object.keys(SC_TO_CH).length}`);
    lines.push("");
    lines.push("SC → Browser (OSC in):");
    lines.push("  PATH                          COUNT  LAST_VAL   AGE(s)");
    for (const [path, info] of Object.entries(diagStats.scToBrowser).sort()) {
      const age = info.lastTime ? ((now - info.lastTime) / 1000).toFixed(1) : "—";
      const val = info.lastVal !== null ? Number(info.lastVal).toFixed(3) : "—";
      lines.push(`  ${path.padEnd(30)} ${String(info.count).padStart(5)}  ${val.padStart(9)}  ${age.padStart(7)}`);
    }
    lines.push("");
    lines.push("Browser → SC (WS in):");
    lines.push("  PATH                          COUNT  LAST_VAL   AGE(s)");
    for (const [path, info] of Object.entries(diagStats.browserToSc).sort()) {
      const age = info.lastTime ? ((now - info.lastTime) / 1000).toFixed(1) : "—";
      const val = info.lastVal !== null ? Number(info.lastVal).toFixed(3) : "—";
      lines.push(`  ${path.padEnd(30)} ${String(info.count).padStart(5)}  ${val.padStart(9)}  ${age.padStart(7)}`);
    }

    // Check coverage: which SC_TO_CH paths have been seen?
    lines.push("");
    lines.push("Coverage (SC_TO_CH routes):");
    const seen = new Set(Object.keys(diagStats.scToBrowser));
    let hit = 0, miss = 0;
    for (const path of Object.keys(SC_TO_CH)) {
      const ok = seen.has(path);
      if (ok) hit++; else miss++;
      lines.push(`  ${ok ? "✓" : "✗"} ${path} → ${SC_TO_CH[path]}`);
    }
    lines.push(`  ${hit}/${hit + miss} routes active`);

    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(lines.join("\n") + "\n");
  } else {
    res.writeHead(404);
    res.end("Not found. Try /diag\n");
  }
}).listen(DIAG_PORT);

// Also track browser→SC messages
wss.on("connection", (ws) => {
  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.direction === "toSC" && msg.address) {
        trackMsg("b2sc", msg.address, msg.args?.[0] ?? null);
      }
    } catch (_) {}
  });
});

udpPort.on("ready", () => {
  console.log(`[bridge] OSC  listening UDP:${OSC_PORT}`);
  console.log(`[bridge] WS   serving  WS:${WS_PORT}`);
  console.log(`[bridge] SC   target   UDP:${SC_PORT}`);
  console.log(`[bridge] DIAG endpoint  http://localhost:${DIAG_PORT}/diag`);
  console.log(`[bridge] Path table: ${Object.keys(SC_TO_CH).length} routes registered`);
});

udpPort.on("error", (err) => {
  console.error(`[bridge] OSC error:`, err.message);
});

udpPort.open();
