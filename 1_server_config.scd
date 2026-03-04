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
// MOTU 828x Gen5 → 4-channel spatial mode
// No MOTU → Apple Core Audio built-in → 2-channel stereo fallback
~detectAudioDevice = {
    var devices = ServerOptions.outDevices;
    var motu = devices.select({ |d|
        d.contains("MOTU") or: { d.contains("828") } or: { d.contains("Gen5") }
    }).first;

    if(motu.notNil) {
        "✓ MOTU 828x detected: % — enabling 4-channel spatial mode.".format(motu).postln;
        Server.default.options.device = motu;
        Server.default.options.numOutputBusChannels = 4;
        Server.default.options.numInputBusChannels = 2;
    } {
        "i MOTU not found — falling back to Apple Core Audio (2-channel stereo).".postln;
        Server.default.options.device = nil; // Let macOS pick the default (built-in speakers)
        Server.default.options.numOutputBusChannels = 2; // Stereo only
        Server.default.options.numInputBusChannels = 2;
    };
};

~detectAudioDevice.value;

// Server performance configuration
Server.default.options.numBuffers = 1024 * 16;
Server.default.options.memSize = 8192 * 64; 
Server.default.options.maxNodes = 1024 * 32;
Server.default.options.numInputBusChannels = 2;

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
    
    // Create server status check function
    ~checkServerStatus = {
        (
            "\nServer Status:".postln;
            "- Running: %".format(Server.default.serverRunning).postln;
            "- Average CPU: % %".format(Server.default.avgCPU.round(0.1), "%").postln;
            "- Peak CPU: % %".format(Server.default.peakCPU.round(0.1), "%").postln;
            "- Active Synths: %".format(Server.default.numSynths).postln;
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