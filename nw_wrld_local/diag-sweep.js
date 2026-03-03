#!/usr/bin/env node
// Diagnostic sweep — sends all /soneth/* params through the bridge via UDP OSC
// No SuperCollider IDE needed. Run: node diag-sweep.js
//
// After sweep completes, check: curl http://localhost:3335/diag

const osc = require("osc");

const BRIDGE_PORT = 3333; // same port SC would send to

const udp = new osc.UDPPort({
  localAddress: "0.0.0.0",
  localPort: 0,
  remoteAddress: "127.0.0.1",
  remotePort: BRIDGE_PORT,
  metadata: true,
});

const PARAMS = [
  // Row 1
  "/soneth/volume", "/soneth/pitchshift", "/soneth/timedilation",
  "/soneth/spectralshift", "/soneth/spatialspread",
  // Row 2
  "/soneth/texturedepth", "/soneth/atmospheremix", "/soneth/memoryfeed",
  "/soneth/harmonicrich", "/soneth/resonantbody",
  // Row 3
  "/soneth/masteramp", "/soneth/filtercutoff", "/soneth/noiselevel",
  "/soneth/noisefilt", "/soneth/dronedepth",
  // Row 4
  "/soneth/dronefade", "/soneth/dronespace", "/soneth/dronemix",
  "/soneth/delayfeedback", "/soneth/txinfluence",
  // Beat Engine
  "/soneth/beatTempo", "/soneth/txInfluence",
];

udp.on("ready", async () => {
  console.log(`\n══════════════════════════════════════════`);
  console.log(`  DIAGNOSTIC SWEEP — ${PARAMS.length} params`);
  console.log(`  Target: UDP ${BRIDGE_PORT} (bridge)`);
  console.log(`══════════════════════════════════════════\n`);

  for (let i = 0; i < PARAMS.length; i++) {
    const path = PARAMS[i];

    // Send 0.0
    udp.send({ address: path, args: [{ type: "f", value: 0.0 }] });
    console.log(`  ${(i+1).toString().padStart(2)}/${PARAMS.length}  ${path.padEnd(28)}  → 0.00`);
    await sleep(200);

    // Send 1.0
    udp.send({ address: path, args: [{ type: "f", value: 1.0 }] });
    console.log(`  ${" ".repeat(2+String(PARAMS.length).length)}  ${"".padEnd(28)}  → 1.00`);
    await sleep(200);

    // Settle at 0.5
    udp.send({ address: path, args: [{ type: "f", value: 0.5 }] });
    console.log(`  ${" ".repeat(2+String(PARAMS.length).length)}  ${"".padEnd(28)}  → 0.50  ✓`);
    await sleep(100);
  }

  console.log(`\n══════════════════════════════════════════`);
  console.log(`  SWEEP COMPLETE — ${PARAMS.length} params × 3 values`);
  console.log(`  Now run:  curl http://localhost:3335/diag`);
  console.log(`  Browser:  press Shift+D for live overlay`);
  console.log(`══════════════════════════════════════════\n`);

  // Phase 2: continuous volume LFO so you can see visuals move
  console.log(`  Starting volume LFO (Ctrl+C to stop)...\n`);
  let t = 0;
  setInterval(() => {
    const val = 0.5 + 0.4 * Math.sin(t * 0.2 * 2 * Math.PI);
    udp.send({ address: "/soneth/volume", args: [{ type: "f", value: val }] });
    t += 0.05;
  }, 50);
});

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

udp.open();
