// SuperCollider Ethereum Sonification - Multichannel Recording System
// Current Date and Time (UTC): 2025-09-01 08:30:00
// Current User's Login: alejoduque
// Purpose: Record final spatialized mix as 4-channel audio files

(
s.doWhenBooted({
    
    // Recording system parameters
    ~recordingParams = (
        isRecording: false,
        recordingPath: nil,
        recordingFile: nil,
        recordingBuffer: nil,
        recordingDuration: 0,
        maxRecordingMinutes: 60,  // Maximum recording length
        channels: 4,              // Quadraphonic output
        sampleRate: 44100,
        bitDepth: 24
    );
    
    // Recording bus setup - tap final output
    ~recordingBus = Bus.audio(s, 4);  // 4-channel recording bus
    
    // Create recording directory if needed
    ~recordingDir = thisProcess.nowExecutingPath.dirname +/+ "recordings";
    ~createRecordingDir = {
        var dirPath = ~recordingDir;
        if(File.exists(dirPath).not) {
            ("mkdir -p \"" ++ dirPath ++ "\"").systemCmd;
            "Created recordings directory: %".format(dirPath).postln;
        };
    };
    
    // Generate timestamped filename
    ~generateRecordingFilename = {
        var timestamp = Date.getDate.format("%Y%m%d_%H%M%S");
        var filename = "eth_sonification_" ++ timestamp ++ ".wav";
        ~recordingDir +/+ filename;
    };
    
    // Simple recording synth - direct to file
    SynthDef(\simpleRecorder, {
        arg recordBuf, gate=1;
        var sig;
        
        // Read the main output (4-channel)
        sig = In.ar(0, 4);
        
        // Direct to disk recording
        DiskOut.ar(recordBuf, sig);
        
        // Auto-free when gate closes
        FreeSelf.kr(gate <= 0);
    }).add;
    
    s.sync;
    
    // Recording management functions
    ~startRecording = { |customPath=nil|
        var recordingPath;
        
        if(~recordingParams.isRecording) {
            "Already recording! Stop current recording first.".warn;
        } {
            // Setup recording path
            ~createRecordingDir.value;
            recordingPath = customPath ?? { ~generateRecordingFilename.value };
            
            try {
                "Starting 4-channel recording...".postln;
                "File: %".format(recordingPath).postln;
                "Duration limit: % minutes".format(~recordingParams.maxRecordingMinutes).postln;
                
                // Create buffer for DiskOut and prepare file
                ~recordingBuffer = Buffer.alloc(s, 65536, 4);
                ~recordingBuffer.write(recordingPath, "wav", "int24", 0, 0, true);
                
                // Wait for buffer creation with defer
                {
                    // Start simple recording synth
                    ~recordingSynth = Synth(\simpleRecorder, [
                        \recordBuf, ~recordingBuffer.bufnum,
                        \gate, 1
                    ], ~defaultGroup, \addToTail);
                    
                    "✓ 4-channel recording started successfully".postln;
                }.defer(0.1);
                
                // Update recording state
                ~recordingParams.isRecording = true;
                ~recordingParams.recordingPath = recordingPath;
                ~recordingParams.recordingDuration = 0;
                
                // Start duration counter
                ~recordingTimer = Routine({
                    while { ~recordingParams.isRecording } {
                        ~recordingParams.recordingDuration = ~recordingParams.recordingDuration + 1;
                        
                        // Auto-stop at maximum duration
                        if(~recordingParams.recordingDuration >= (~recordingParams.maxRecordingMinutes * 60)) {
                            "Maximum recording duration reached. Stopping...".postln;
                            ~stopRecording.value;
                        };
                        
                        1.wait;
                    };
                }).play(SystemClock);
                
            } { |error|
                "Recording initialization failed: %".format(error.errorString).error;
            };
        };
    };
    
    // Stop recording function
    ~stopRecording = {
        var duration, path;
        if(~recordingParams.isRecording.not) {
            "No recording in progress".postln;
        } {
            "Stopping recording...".postln;
            
            // Stop timer
            if(~recordingTimer.notNil) {
                ~recordingTimer.stop;
                ~recordingTimer = nil;
            };
            
            // Stop recording synth and close buffer
            if(~recordingSynth.notNil) {
                ~recordingSynth.set(\gate, 0);  // Signal synth to close
                ~recordingSynth.free;
                ~recordingSynth = nil;
            };
            
            // Close buffer and finalize file
            if(~recordingBuffer.notNil) {
                ~recordingBuffer.close;
                ~recordingBuffer.free;
                ~recordingBuffer = nil;
            };
            
            // Report results
            duration = ~recordingParams.recordingDuration;
            path = ~recordingParams.recordingPath;
            
            "✓ Recording stopped".postln;
            "Duration: %:%:%".format(
                (duration / 3600).floor,
                ((duration % 3600) / 60).floor,
                (duration % 60).floor
            ).postln;
            "File saved: %".format(path).postln;
            "Channels: 4 (quadraphonic)".postln;
            
            // Reset state
            ~recordingParams.isRecording = false;
            ~recordingParams.recordingPath = nil;
            ~recordingParams.recordingDuration = 0;
        };
    };
    
    // Recording status function
    ~getRecordingStatus = {
        if(~recordingParams.isRecording) {
            var duration = ~recordingParams.recordingDuration;
            "=== RECORDING STATUS ===".postln;
            "Status: RECORDING".postln;
            "Duration: %:%:%".format(
                (duration / 3600).floor,
                ((duration % 3600) / 60).floor,
                (duration % 60).floor
            ).postln;
            "File: %".format(~recordingParams.recordingPath.basename).postln;
            "Channels: 4".postln;
            "=======================".postln;
        } {
            "Status: NOT RECORDING".postln;
        };
    };
    
    // Emergency cleanup function
    ~cleanupRecording = {
        "Cleaning up recording system...".postln;
        
        if(~recordingParams.isRecording) {
            ~stopRecording.value;
        };
        
        // Free any remaining resources
        [~diskRecorder, ~recordingSynth, ~recordingTimer].do { |resource|
            if(resource.notNil) {
                try { resource.free } { |error| 
                    "Warning during cleanup: %".format(error.errorString).warn;
                };
            };
        };
        
        // Free recording bus
        if(~recordingBus.notNil) {
            ~recordingBus.free;
        };
        
        "Recording system cleaned up".postln;
    };
    
    // List recordings function
    ~listRecordings = {
        var recordings = [];
        if(File.exists(~recordingDir)) {
            ("find \"" ++ ~recordingDir ++ "\" -name '*.wav' -o -name '*.aiff' -o -name '*.caf'").systemCmd;
        } {
            "No recordings directory found".postln;
        };
    };
    
    // Quick record function (30 seconds)
    ~quickRecord = {
        "Starting 30-second quick recording...".postln;
        ~startRecording.value;
        
        // Auto-stop after 30 seconds
        SystemClock.sched(30, {
            ~stopRecording.value;
            "Quick recording complete".postln;
        });
    };
    
    "Recording System initialized".postln;
    "Available functions:".postln;
    "  ~startRecording.() - Start multichannel recording".postln;
    "  ~stopRecording.() - Stop recording".postln;
    "  ~getRecordingStatus.() - Check recording status".postln;
    "  ~quickRecord.() - Record 30 seconds".postln;
    "  ~listRecordings.() - List saved recordings".postln;
    "  ~cleanupRecording.() - Emergency cleanup".postln;
});
)