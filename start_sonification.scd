// SuperCollider Ethereum Sonification - Main Loader
// Current Date and Time (UTC): 2025-03-01 22:23:45
// Current User's Login: alejoduque

(
// Function to load all components
~loadEthereumSonification = Routine({
    var basePath = thisProcess.nowExecutingPath.dirname;
    
    // First, quit server if running
    if(Server.default.serverRunning) {
        "Stopping server...".postln;
        Server.default.quit;
        2.wait;
    };
    
    // Load components in sequence
    [
        "1_server_config.scd",      // Server config and buses
        "2_midi_control.scd",       // MIDI setup
        "3_synthdefs.scd",          // SynthDefs with real-time control
        "4_gui.scd",                // Enhanced GUI with Lawrence English controls
        "5_beat_engine.scd",        // Beat engine with bus connections
        "6_osc_handlers.scd",       // OSC handlers for transactions
        "7_trend_analysis.scd",     // Analysis
        "8_transaction_buffer.scd", // Transaction management
        "9_spatial_headphone_sim.scd", // 4-channel headphone simulation
        "10_sample_system.scd",     // Sample playback system with paulstretch
        "11_recording_system.scd"   // Multichannel recording system
    ].do { |file|
        var path = basePath +/+ file;
        ("Loading " ++ file ++ "...").postln;

        try {
            if(File.exists(path)) {
                path.load;
                ("Loaded at: " ++ Date.getDate.format("%Y-%m-%d %H:%M:%S")).postln;
                // Server config needs time to boot; synthdefs need time for async compilation
                if(file.contains("server_config") or: { file.contains("synthdefs") }) {
                    3.wait;
                } {
                    1.wait;
                };
            } {
                ("File not found: " ++ path).warn;
            };
        } { |error|
            ("Error loading " ++ file ++ ": " ++ error.errorString).error;
        };
    };
    
    // Final system check
    2.wait;
    if(~checkServerStatus.notNil) {
        ~checkServerStatus.value;
    };
    
    if(~testTransaction.notNil) {
        "Testing transaction system...".postln;
        ~testTransaction.value;
    };
    
    // Launch Python Ethereum data fetcher
    "".postln;
    "=== Python Ethereum Data Fetcher Setup ===".postln;
    "To start receiving live Ethereum transaction data:".postln;
    "".postln;
    "1. Open Terminal and navigate to project directory:".postln;
    ("   cd \"" ++ basePath.dirname.dirname ++ "\"").postln;
    "".postln;
    "2. Activate Python virtual environment:".postln;
    "   source venv/bin/activate".postln;
    "".postln;
    "3. Run the Ethereum data fetcher:".postln;
    "   python eth_sonification/eth_sonify.py".postln;
    "".postln;
    "=== Sample Playback Setup ===".postln;
    "Sample trigger functions available:".postln;
    "   ~triggerSample.(index) - Play sample by index (0-6)".postln;
    "   ~stopSample.() - Stop current sample".postln;
    "   ~listSamples.() - List available samples".postln;
    "".postln;
    "=== Recording Setup ===".postln;
    "Recording functions available:".postln;
    "   ~startRecording.() - Start 4-channel recording".postln;
    "   ~stopRecording.() - Stop recording".postln;
    "   ~quickRecord.() - Record 30 seconds".postln;
    "   ~getRecordingStatus.() - Check recording status".postln;
    "".postln;
    "=== Spatial Control Setup ===".postln;
    "Spatial GUI: Use 'SPATIAL GUI' button in main interface".postln;
    "Manual loading: (thisProcess.nowExecutingPath.dirname +/+ \"12_spatial_gui.scd\").load".postln;
    "".postln;
    "=== Spatial Audio Setup ===".postln;
    "For headphone development (simulates 4-channel monitors):".postln;
    "   ~setSpatialMode.(\\headphones);".postln;
    "".postln;
    "For direct 4-channel monitor output:".postln;
    "   ~setSpatialMode.(\\quad);".postln;
    "".postln;
    "Test spatial positioning:".postln;
    "   ~testSpatial.value;".postln;
    "".postln;
    "The Python script will send OSC messages to this SuperCollider system.".postln;
    "==========================================".postln;
});

// Start the system
SystemClock.play(~loadEthereumSonification);
)