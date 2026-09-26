// SuperCollider Ethereum Sonification - Multichannel Recording System
// Current Date and Time (UTC): 2025-09-01 08:30:00
// Current User's Login: alejoduque
// Purpose: Record the final mix — 4 channels on the MOTU quad rig, stereo on Core Audio

(
s.doWhenBooted({
    
    // Recording system parameters
    //
    // channels: as many as the MIX has, which is ~limiterChans (3_synthdefs):
    // 4 on the MOTU's quad rig, 2 on Core Audio stereo (1_server_config picks
    // which). This was a fixed 4, so a session on the laptop's own output was
    // written as a 4-track file whose rear pair was either silence or, on a
    // 2-output server where buses 2-3 are the hardware INPUTS, the microphone.
    ~recordingParams = (
        isRecording: false,
        recordingPath: nil,
        recordingFile: nil,
        recordingBuffer: nil,
        recordingDuration: 0,
        maxRecordingMinutes: 60,  // Maximum recording length
        channels: (~limiterChans ? s.options.numOutputBusChannels).clip(1, 4),
        sampleRate: s.sampleRate,
        bitDepth: 24
    );
    ~recChanLabel = { |n| if(n >= 4, "quadraphonic", if(n == 2, "stereo", "mono")) };

    // Recording bus setup - tap final output
    ~recordingBus = Bus.audio(s, ~recordingParams.channels);
    
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
    
    // Simple recording synth - direct to file. The channel count is fixed
    // into the def when it is built, which is fine: it only changes when the
    // server is rebooted on another device, and this file runs again then.
    SynthDef(\simpleRecorder, {
        arg recordBuf, gate=1;
        var sig;

        // Read the main output: the mix's own channels, no more
        sig = In.ar(0, ~recordingParams.channels);
        
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
                "Starting %-channel (%) recording...".format(
                    ~recordingParams.channels, ~recChanLabel.(~recordingParams.channels)).postln;
                "File: %".format(recordingPath).postln;
                "Duration limit: % minutes".format(~recordingParams.maxRecordingMinutes).postln;
                
                // Create buffer for DiskOut and prepare file
                ~recordingBuffer = Buffer.alloc(s, 65536, ~recordingParams.channels);
                ~recordingBuffer.write(recordingPath, "wav", "int24", 0, 0, true);
                
                // Wait for buffer creation with defer
                {
                    // Start simple recording synth
                    ~recordingSynth = Synth(\simpleRecorder, [
                        \recordBuf, ~recordingBuffer.bufnum,
                        \gate, 1
                    ], ~defaultGroup, \addToTail);
                    
                    "✓ %-channel recording started successfully".format(~recordingParams.channels).postln;
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
            "Channels: % (%)".format(~recordingParams.channels,
                ~recChanLabel.(~recordingParams.channels)).postln;
            
            // Reset state
            ~recordingParams.isRecording = false;
            ~recordingParams.recordingPath = nil;
            ~recordingParams.recordingDuration = 0;

            // And reset the surface that claims to show it. Two of the three
            // ways a recording ends do not go through the STOP button — the
            // 30 s snapshot schedules this on SystemClock, and the maximum
            // duration timer calls it directly — so the GUI was left reading
            // "REC: RECORDING" with ■ STOP REC still latched over a recording
            // that had already been written and closed. Deferred because this
            // can arrive from SystemClock, and guarded because 4_gui.scd loads
            // before this file and its window can be closed at any time.
            {
                if(~recordingStatus.notNil) {
                    ~recordingStatus.string_("REC: READY");
                };
                if(~recordButton.notNil) { ~recordButton.value = 0 };
            }.defer;
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
            "Channels: %".format(~recordingParams.channels).postln;
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