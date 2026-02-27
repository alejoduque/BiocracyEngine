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

  // SC echoes MIDI/browser control back to sliders (normalized 0-1)
  // Which also double as unified set methods for the visual modules:
  "/soneth/volume": "setVolume",
  "/soneth/pitchshift": "setPitchShift",
  "/soneth/timedilation": "setTimeDilation",
  "/soneth/spectralshift": "setSpectralShift",
  "/soneth/spatialspread": "setSpatialSpread",
  "/soneth/texturedepth": "setTextureDepth",
  "/soneth/atmospheremix": "setAtmosphereMix",
  "/soneth/memoryfeed": "setMemoryFeed",
  "/soneth/harmonicrich": "setHarmonicRich",
  "/soneth/resonantbody": "setResonantBody",

  // Legacy mappings for tests (optional, kept for compatibility)
  "/eco/co2": "triggerCO2",
  "/eco/mycoPulse": "triggerMycoPulse",
  "/eco/phosphorus": "triggerPhosphorus",
  "/eco/nitrogen": "triggerNitrogen",
  "/soneth/ethEvent": "triggerMycoPulse",   // ETH events → myco pulse visual
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

udpPort.on("ready", () => {
  console.log(`[bridge] OSC  listening UDP:${OSC_PORT}`);
  console.log(`[bridge] WS   serving  WS:${WS_PORT}`);
  console.log(`[bridge] SC   target   UDP:${SC_PORT}`);
  console.log(`[bridge] Path table: ${Object.keys(SC_TO_CH).length} routes registered`);
});

udpPort.on("error", (err) => {
  console.error(`[bridge] OSC error:`, err.message);
});

udpPort.open();
