// SuperCollider Ethereum Sonification - Server Configuration
// Current Date and Time (UTC): 2025-03-01 22:36:00
// Current User's Login: alejoduque
// Initialization Sequence: 2 of 9
// Depends on: 0_init.scd
// Required by: all other components

(
// Force sclang OSC receive port to 57120 BEFORE anything else claims the port.
thisProcess.openUDPPort(57120);

// --- DYNAMIC DEVICE DETECTION ---
// MOTU 828x → 4-channel spatial mode at 48000 Hz (native MOTU rate)
// No MOTU → Apple Core Audio built-in → 2-channel stereo fallback
//
// ROOT CAUSE OF SILENT AUDIO WITH MOTU:
// scsynth defaults to 44100 Hz. MOTU runs at 48000 Hz. Core Audio silently
// discards audio when rates mismatch — no error, no warning, just silence.
~detectAudioDevice = {
    // ── All vars first — SC requires var declarations before any executable ──
    var outDevices = ServerOptions.outDevices ? [];
    var inDevices  = ServerOptions.inDevices  ? [];
    // Broad match: "MOTU 828x", "MOTU AVB", "828mk3", etc.
    // asString.toUpper guard handles nil entries PortAudio occasionally returns.
    var motu = outDevices.select({ |d|
        var ds = d.asString.toUpper;
        ds.contains("MOTU") or: { ds.contains("828") } or: { ds.contains("GEN5") }
    }).first;

    // Print every PortAudio device name — makes name-mismatch failures visible.
    "=== SC AUDIO DEVICES (PortAudio) ===".postln;
    "Output devices:".postln;
    outDevices.do { |d, i| "  out[%]: %".format(i, d).postln };
    "Input devices:".postln;
    inDevices.do  { |d, i| "  in [%]: %".format(i, d).postln };
    "=====================================".postln;

    if(motu.notNil) {
        "✓ MOTU detected: % — 8-ch out, 48000 Hz".format(motu).postln;
        Server.default.options.device               = motu;
        Server.default.options.sampleRate           = 48000;
        // 8 outputs exposes all back-panel analog outs 1-8 (PortAudio ch 0-7).
        // Speakers on analog out 3-4 = PortAudio ch 4-5 = SC bus 4-5.
        Server.default.options.numOutputBusChannels = 8;
        Server.default.options.numInputBusChannels  = 2;
        // The router synth in 3_synthdefs.scd uses this offset to copy
        // SC's master bus 0-1 → the correct physical outputs.
        ~motuOutOffset = 4;
        "  Speaker offset: Out.ar(%) → MOTU analog 3-4".format(~motuOutOffset).postln;
    } {
        // System default = MOTU (confirmed by system_profiler).
        // Same channel config as explicit detection path.
        "⚠ MOTU not in PortAudio list — using system default at 48000 Hz.".postln;
        "  Channels 0-7 exposed; speaker offset ~motuOutOffset = 4.".postln;
        Server.default.options.device               = nil;
        Server.default.options.sampleRate           = 48000;
        Server.default.options.numOutputBusChannels = 8;
        Server.default.options.numInputBusChannels  = 2;
        ~motuOutOffset = 4;
    };
};

~detectAudioDevice.value;

// Server performance configuration
Server.default.options.numBuffers = 1024 * 16;
Server.default.options.memSize = 8192 * 64; 
Server.default.options.maxNodes = 1024 * 32;
Server.default.options.numInputBusChannels = 2;

// ── How long the server has to finish a block ───────────────────────────────
//
// This was never set, so scsynth used its default of 512 frames: at 48 kHz the
// audio callback has 10.7 ms to produce 10.7 ms of sound. Miss that deadline by
// a microsecond and the driver gets an unfinished buffer — which is heard as a
// tick, and on macOS the commonest way to miss it is not the audio at all.
// Switching Spaces makes WindowServer recomposite every window on the machine,
// and that spike lands on the same cores scsynth is running on.
//
//     512 frames  = 10.7 ms      1024 = 21.3 ms      2048 = 42.7 ms
//
// 1024 doubles the cushion. It costs LATENCY and nothing else — no level, no
// polyphony, no CPU. That matters here because this instrument has no
// keyboard: the performer turns knobs and the answer is a swell, so 21 ms is
// invisible. It would be the wrong trade for something played by hand.
//
// Note this is a different clock from s.latency, which is the scheduling
// margin on OSC bundles. That one already has slack; this one had none.
//
// IF SPACE SWITCHES STILL TICK, this is the first number to raise. 2048 is
// still imperceptible for this material and gives 43 ms — enough to sit
// through a fairly brutal compositing spike. Past that the problem is not
// the buffer.
Server.default.options.hardwareBufferSize = 1024;

// Create initialization routine
~serverInitRoutine = Routine({
    // Boot server if not already running
    if(Server.default.serverRunning.not) {
        "Booting server...".postln;
        Server.default.boot;
        Server.default.waitForBoot;
        2.wait;
    };
    
    "Server booted, initializing components...".postln;
    
    // Define audio parameters first
    ~audioParams = (
        masterVolume: 0.5,
        transactionVolume: 0.3,
        beatVolume: 0.6
    );
    
    // Create server status check function.
    // avgCPU/peakCPU are nil until the server reports status — calling
    // .round on them threw nil.round at the end of every boot.
    ~checkServerStatus = {
        (
            "\nServer Status:".postln;
            "- Running: %".format(Server.default.serverRunning).postln;
            if(Server.default.serverRunning and: { Server.default.avgCPU.notNil }) {
                "- Average CPU: % %".format(Server.default.avgCPU.round(0.1), "%").postln;
                "- Peak CPU: % %".format(Server.default.peakCPU.round(0.1), "%").postln;
                "- Active Synths: %".format(Server.default.numSynths).postln;
            } {
                "- (CPU/synth stats unavailable — no status report yet)".postln;
            };
        )
    };
    
    // Wait until server is truly running before creating groups/buses
    while({ s.serverRunning.not }, { 0.1.wait });
    s.sync;

    // Create default group
    ~defaultGroup = Group.new(s, \addToHead);
    s.sync;
    
    // Setup audio buses
    ~audioBuses = (
        main: Bus.audio(s, 2),
        effects: Bus.audio(s, 2),
        transactions: Bus.audio(s, 2)
    );
    
    // Setup control buses — alloc and set must be separate (SC 3.13: .set returns nil)
    ~controlBuses = (
        volume: Bus.control(s, 1),
        transactionVolume: Bus.control(s, 1),
        beatVolume: Bus.control(s, 1)
    );
    ~controlBuses.volume.set(~audioParams.masterVolume);
    ~controlBuses.transactionVolume.set(~audioParams.transactionVolume);
    ~controlBuses.beatVolume.set(~audioParams.beatVolume);
    
    // Setup OSC
    ~visualsDest = NetAddr("127.0.0.1", 3333);
    "sclang OSC receive port: %".format(NetAddr.langPort).postln;
    if(NetAddr.langPort != 57120) {
        "WARNING: sclang is on port % not 57120 — Python ETH data will NOT arrive!".format(NetAddr.langPort).warn;
        // Try to open 57120 if it isn't the active port
        thisProcess.openUDPPort(57120);
        "Attempted to open port 57120 as fallback.".postln;
    } {
        "✓ sclang on port 57120 — Python OSC will reach SC correctly.".postln;
    };
    
    // Test sound function
    ~testSound = {
        {
            var env = EnvGen.kr(Env.perc(0.01, 0.5), doneAction: 2);
            var sig = SinOsc.ar(440) * env * 0.1;
            Out.ar(0, sig ! 2);
        }.play;
    };
    
    // Test control responsiveness with sustained synth
    ~testControlBuses = {
        "Testing control bus connections...".postln;
        if(~buses.notNil) {
            // Create a sustained synth for testing controls
            ~testSynth = {
                var freq = 220;  // Low frequency base
                var sig, env, mod;
                
                // Read control buses directly
                var masterVol = In.kr(~buses[\masterVolume].index, 1);
                var pitchOffset = In.kr(~buses[\pitchShift].index, 1);
                var harmonicRich = In.kr(~buses[\harmonicRich].index, 1);
                var spectralShift = In.kr(~buses[\spectralShift].index, 1);
                
                // Apply pitch shift
                freq = freq * (pitchOffset / 12).midiratio;
                
                // Simple FM synthesis
                mod = SinOsc.ar(freq * harmonicRich) * (harmonicRich * 0.2) * freq;
                sig = SinOsc.ar(freq + mod);
                
                // Filter
                sig = RLPF.ar(sig, spectralShift.clip(80, 8000), 0.3);
                
                // Sustain envelope
                env = EnvGen.kr(Env.asr(0.1, 1, 0.5), gate: 1);
                sig = sig * env * masterVol.squared * 0.2;
                
                Out.ar(0, sig ! 2);
            }.play;
            
            "Sustained test synth created - move controls and hear changes!".postln;
            "Use ~testSynth.free; to stop".postln;
        } {
            "Control buses not initialized yet!".warn;
        };
    };
    
    // Debug function to check bus status - check all possible bus variables
    ~checkBuses = {
        "=== DEBUGGING CONTROL BUSES ===".postln;
        "~buses exists: %".format(~buses.notNil).postln;
        "~controlBuses exists: %".format(~controlBuses.notNil).postln;
        "~soundParams exists: %".format(~soundParams.notNil).postln;
        
        // Check each possible bus container
        if(~buses.notNil) {
            "~buses contains % items:".format(~buses.size).postln;
            ~buses.keysValuesDo { |name, bus|
                try {
                    var value = bus.getSynchronous;
                    "  % -> Bus[%] = %".format(name, bus.index, value.round(0.001)).postln;
                } { |error|
                    "  % -> ERROR: %".format(name, error.errorString).postln;
                };
            };
        };
        
        if(~controlBuses.notNil) {
            "~controlBuses contains % items:".format(~controlBuses.size).postln;
            ~controlBuses.keysValuesDo { |name, bus|
                try {
                    var value = bus.getSynchronous;
                    "  % -> Bus[%] = %".format(name, bus.index, value.round(0.001)).postln;
                } { |error|
                    "  % -> ERROR: %".format(name, error.errorString).postln;
                };
            };
        };
        
        "Active synths: %".format(s.numSynths).postln;
        "================================".postln;
    };
    
    // Create a test synth that explicitly shows bus changes
    ~testBusConnection = {
        "Creating test synth with visible bus response...".postln;
        "Checking ~buses: %".format(~buses.notNil).postln;
        
        if(~buses.notNil and: { ~buses.size > 0 }) {
            "Found buses, creating test synth...".postln;
            ~debugSynth = {
                var masterVol = In.kr(~buses[\masterVolume].index, 1);
                var pitchShift = In.kr(~buses[\pitchShift].index, 1);
                var spectralShift = In.kr(~buses[\spectralShift].index, 1);
                
                // Create obvious test sound that clearly shows parameter changes
                var freq = 440 * (pitchShift / 12).midiratio;  // Pitch shift effect
                var sig = SinOsc.ar(freq) * masterVol.squared * 0.3;  // Volume effect
                sig = LPF.ar(sig, spectralShift.clip(200, 4000));  // Filter effect
                
                // Send to both speakers
                Out.ar(0, sig ! 2);
                
                // Print bus values every second for debugging
                Impulse.kr(1).poll(0, masterVol, "masterVolume");
                Impulse.kr(1).poll(0, pitchShift, "pitchShift");
                Impulse.kr(1).poll(0, spectralShift, "spectralShift");
            }.play;
            "Test synth running - move GUI knobs to hear CLEAR changes!".postln;
            "Use ~debugSynth.free; to stop".postln;
        } {
            "ERROR: Buses not available! ~buses = %".format(~buses).error;
            "This means buses aren't created yet when this function runs".postln;
        };
    };
    
    // Server cleanup on shutdown
    ServerQuit.add({ 
        "Cleaning up server resources...".postln;
        ~audioBuses.do(_.free);
        ~controlBuses.do(_.free);
    });
    
    "Server configuration loaded and ready.".postln;
    ~checkServerStatus.value;
});

// Run the initialization routine
SystemClock.play(~serverInitRoutine);
)