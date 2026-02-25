#!/usr/bin/env node
// Parliament OSC → WebSocket Bridge
// Receives UDP OSC from SuperCollider on port 3333
// Forwards to browser clients via WebSocket on port 3334

const osc = require("osc");
const { WebSocketServer } = require("ws");

const OSC_PORT = 3333;
const WS_PORT = 3334;

// WebSocket server
const wss = new WebSocketServer({ port: WS_PORT });
const clients = new Set();

// Outgoing OSC port → SuperCollider (port 57120)
const scPort = new osc.UDPPort({
  localAddress: "0.0.0.0",
  localPort: 0, // OS picks an ephemeral port
  remoteAddress: "127.0.0.1",
  remotePort: 57120,
  metadata: true,
});
scPort.open();

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log(`[bridge] WebSocket client connected (${clients.size} total)`);

  // Browser → SC: messages with direction:"toSC" are relayed as OSC
  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.direction === "toSC" && msg.address) {
        const oscArgs = (msg.args || []).map((v) => ({ type: "f", value: Number(v) }));
        scPort.send({ address: msg.address, args: oscArgs });
        console.log(`[bridge] → SC ${msg.address} ${msg.args}`);
      }
    } catch (_) {}
  });

  ws.on("close", () => {
    clients.delete(ws);
    console.log(`[bridge] WebSocket client disconnected (${clients.size} total)`);
  });
});

// UDP OSC receiver
const udpPort = new osc.UDPPort({
  localAddress: "0.0.0.0",
  localPort: OSC_PORT,
  metadata: true,
});

udpPort.on("message", (oscMsg) => {
  const address = oscMsg.address;
  const args = (oscMsg.args || []).map((a) => a.value);
  const json = JSON.stringify({ address, args });

  for (const ws of clients) {
    if (ws.readyState === 1) {
      ws.send(json);
    }
  }
});

udpPort.on("ready", () => {
  console.log(`[bridge] OSC listening on UDP port ${OSC_PORT}`);
  console.log(`[bridge] WebSocket serving on port ${WS_PORT}`);
  console.log(`[bridge] Ready to bridge SuperCollider → Browser`);
});

udpPort.on("error", (err) => {
  console.error(`[bridge] OSC error:`, err.message);
});

udpPort.open();
