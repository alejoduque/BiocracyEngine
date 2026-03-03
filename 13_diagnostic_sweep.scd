// BiocracyEngine Diagnostic — sonETH Parameter Sweep Test
// Sends every /soneth/* param through the bridge and monitors round-trip
// Run AFTER start_ecosystem.sh is up and 6_osc_handlers.scd is loaded.
//
// Usage:  Open in SC IDE → Cmd+Enter on the outer ( ) block
//         Watch bridge console + browser overlay for arrivals.

(
var bridgeDest = NetAddr("127.0.0.1", 3333);  // OSC → bridge UDP port
var paths, sweepDelay, currentIdx;

paths = [
	// Row 1: Core Performance
	"/soneth/volume",
	"/soneth/pitchshift",
	"/soneth/timedilation",
	"/soneth/spectralshift",
	"/soneth/spatialspread",
	// Row 2: Ambient Processing
	"/soneth/texturedepth",
	"/soneth/atmospheremix",
	"/soneth/memoryfeed",
	"/soneth/harmonicrich",
	"/soneth/resonantbody",
	// Row 3: Drone/Noise Controls
	"/soneth/masteramp",
	"/soneth/filtercutoff",
	"/soneth/noiselevel",
	"/soneth/noisefilt",
	"/soneth/dronedepth",
	// Row 4: Additional Controls
	"/soneth/dronefade",
	"/soneth/dronespace",
	"/soneth/dronemix",
	"/soneth/delayfeedback",
	"/soneth/txinfluence",
	// Beat Engine
	"/soneth/beatTempo",
	"/soneth/txInfluence",
];

sweepDelay = 0.25;  // seconds between each param
currentIdx = 0;

"\n════════════════════════════════════════════════".postln;
"  DIAGNOSTIC SWEEP — % params to test".format(paths.size).postln;
"  Bridge target: 127.0.0.1:%".format(3333).postln;
"════════════════════════════════════════════════".postln;

// Phase 1: Pulse each param from 0→1→0.5 so both edges are visible
Routine({
	paths.do { |path, idx|
		// Send 0.0
		bridgeDest.sendMsg(path, 0.0);
		"[sweep] %-of-% ▶ %  = 0.00".format(idx+1, paths.size, path).postln;
		sweepDelay.wait;

		// Send 1.0
		bridgeDest.sendMsg(path, 1.0);
		"[sweep] %-of-% ▶ %  = 1.00".format(idx+1, paths.size, path).postln;
		sweepDelay.wait;

		// Settle at 0.5
		bridgeDest.sendMsg(path, 0.5);
		"[sweep] %-of-% ▶ %  = 0.50  ✓".format(idx+1, paths.size, path).postln;
		(sweepDelay * 0.5).wait;
	};

	"\n════════════════════════════════════════════════".postln;
	"  SWEEP COMPLETE — % params sent ×3 each".format(paths.size).postln;
	"  Check bridge log + browser monitor overlay".postln;
	"════════════════════════════════════════════════\n".postln;

	// Phase 2: Continuous slow LFO on volume for live visual monitoring
	"[diag] Starting continuous volume LFO (0.2Hz) — Cmd+. to stop".postln;
	inf.do { |i|
		var t = i * 0.05;
		var val = (t * 0.2 * 2pi).sin.linlin(-1, 1, 0.1, 0.9);
		bridgeDest.sendMsg("/soneth/volume", val);
		0.05.wait;
	};
}).play;
)
