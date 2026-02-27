// SuperCollider Ethereum Sonification - Sample Playback System
// Current Date and Time (UTC): 2025-09-01 08:30:00
// Current User's Login: alejoduque
// Purpose: Load and control MP3 samples with paulstretch-style time manipulation

(
s.doWhenBooted({
    
    // Sample file paths (relative to project directory)
    ~samplePaths = [
        "samples/aullidos.mp3",
        "samples/aveseinsectos.mp3", 
        "samples/bats_retimed.mp3",
        "samples/dreamlinerCosminreturn.mp3",
        "samples/oropendola.mp3",
        "samples/ranas.mp3",
        "samples/tapesample.mp3"
    ];
    
    // Sample names for GUI
    ~sampleNames = [
        "Aullidos", "Aves/Insectos", "Bats", "Dreamliner", 
        "Oropendola", "Ranas", "Tape"
    ];
    
    // Sample control parameters for paulstretch-style manipulation
    ~sampleParams = (
        // Playback controls
        sampleRate: 1.0,        // Playback speed (0.1 - 4.0)
        samplePitch: 0.0,       // Pitch shift in semitones (-24 to +24)
        sampleLoop: 0,          // Loop mode (0=off, 1=on)
        sampleAmp: 0.7,         // Sample volume (0-1)
        
        // Paulstretch-style time manipulation
        timeStretch: 1.0,       // Time stretch factor (0.25 - 8.0)
        grainSize: 0.2,         // Grain size for time stretch (0.05 - 1.0)
        overlap: 4,             // Grain overlap factor (2 - 16)
        
        // Effects processing
        sampleReverb: 0.3,      // Reverb amount (0-1)
        sampleDelay: 0.2,       // Delay amount (0-1)
        delayTime: 0.5,         // Delay time in seconds (0.1 - 2.0)
        delayFeedback: 0.3,     // Delay feedback (0-0.95)
        
        // Filtering
        lowPass: 8000,          // Low pass frequency (200-8000)
        highPass: 20,           // High pass frequency (20-2000)
        filterRes: 0.1,         // Filter resonance (0.1-0.8)
        
        // Spatial
        samplePan: 0.0,         // Stereo pan (-1 to +1)
        spatialX: 0.0,          // Quad X position (-1 to +1)
        spatialY: 0.0           // Quad Y position (-1 to +1)
    );
    
    // Create control buses for sample parameters — alloc and set must be separate (SC 3.13: .set returns nil)
    ~sampleBuses = ();
    ~sampleParams.keysValuesDo { |param, val|
        ~sampleBuses[param] = Bus.control(s, 1);
        ~sampleBuses[param].set(val);
    };
    
    // Sample loading and buffer management
    ~sampleBuffers = Array.newClear(~samplePaths.size);
    ~loadedSamples = 0;
    
    // Load samples asynchronously
    ~loadSamples = {
        "Loading sample files...".postln;
        ~samplePaths.do { |path, i|
            var fullPath = thisProcess.nowExecutingPath.dirname +/+ path;
            "Loading sample %: %".format(i + 1, ~sampleNames[i]).postln;
            
            ~sampleBuffers[i] = Buffer.read(s, fullPath, action: { |buf|
                if(buf.notNil) {
                    ~loadedSamples = ~loadedSamples + 1;
                    "✓ Loaded %: % frames, % channels".format(
                        ~sampleNames[i], buf.numFrames, buf.numChannels
                    ).postln;
                    
                    if(~loadedSamples == ~samplePaths.size) {
                        "All samples loaded successfully!".postln;
                        ~createSampleSynths.value;
                        "Sample trigger functions are now available.".postln;
                    };
                } {
                    "✗ Failed to load %".format(path).error;
                };
            });
        };
    };
    
    // Shared SynthDef builder for sample playback (mono and stereo variants)
    // Using two SynthDefs avoids the "Buffer UGen channel mismatch" and halves memory per instance
    [1, 2].do { |numCh|
        var defName = if(numCh == 1, \samplePlayerMono, \samplePlayerStereo);

        SynthDef(defName, {
            arg buf=0, amp=0.7,
            rate=1, pitch=0, loop=0,
            timeStretch=1.0, grainSize=0.2, overlap=4,
            reverbAmt=0.3, delayAmt=0.2, delayTime=0.5, delayFB=0.3,
            lpf=8000, hpf=20, filterRes=0.1,
            pan=0, spatialX=0, spatialY=0,
            sampleRateBus=(-1), samplePitchBus=(-1), timeStretchBus=(-1),
            grainSizeBus=(-1), sampleAmpBus=(-1), sampleReverbBus=(-1),
            sampleDelayBus=(-1), delayTimeBus=(-1), delayFeedbackBus=(-1),
            lowPassBus=(-1), highPassBus=(-1), filterResBus=(-1),
            samplePanBus=(-1), sampleSpatialXBus=(-1), sampleSpatialYBus=(-1),
            roomSizeBus=(-1), distanceEffectBus=(-1);

            var sig, grains, wet, stretchAmount, distance, distanceAmp, quadSig;

            var controlRate = Select.kr(sampleRateBus >= 0, [rate, In.kr(sampleRateBus, 1)]);
            var controlPitch = Select.kr(samplePitchBus >= 0, [pitch, In.kr(samplePitchBus, 1)]);
            var controlTimeStretch = Select.kr(timeStretchBus >= 0, [timeStretch, In.kr(timeStretchBus, 1)]);
            var controlGrainSize = Select.kr(grainSizeBus >= 0, [grainSize, In.kr(grainSizeBus, 1)]);
            var controlAmp = Select.kr(sampleAmpBus >= 0, [amp, In.kr(sampleAmpBus, 1)]);
            var controlReverb = Select.kr(sampleReverbBus >= 0, [reverbAmt, In.kr(sampleReverbBus, 1)]);
            var controlDelay = Select.kr(sampleDelayBus >= 0, [delayAmt, In.kr(sampleDelayBus, 1)]);
            var controlDelayTime = Select.kr(delayTimeBus >= 0, [delayTime, In.kr(delayTimeBus, 1)]);
            var controlDelayFB = Select.kr(delayFeedbackBus >= 0, [delayFB, In.kr(delayFeedbackBus, 1)]);
            var controlLPF = Select.kr(lowPassBus >= 0, [lpf, In.kr(lowPassBus, 1)]);
            var controlHPF = Select.kr(highPassBus >= 0, [hpf, In.kr(highPassBus, 1)]);
            var controlFilterRes = Select.kr(filterResBus >= 0, [filterRes, In.kr(filterResBus, 1)]);
            var controlPan = Select.kr(samplePanBus >= 0, [pan, In.kr(samplePanBus, 1)]);
            var sampleSpatialX = Select.kr(sampleSpatialXBus >= 0, [spatialX, In.kr(sampleSpatialXBus, 1)]);
            var sampleSpatialY = Select.kr(sampleSpatialYBus >= 0, [spatialY, In.kr(sampleSpatialYBus, 1)]);
            var roomSizeParam = Select.kr(roomSizeBus >= 0, [0.8, In.kr(roomSizeBus, 1)]);
            var distanceParam = Select.kr(distanceEffectBus >= 0, [0.5, In.kr(distanceEffectBus, 1)]);
            var finalRate = controlRate * controlTimeStretch.reciprocal * (controlPitch / 12).midiratio;

            // PlayBuf with correct channel count — no mismatch
            sig = PlayBuf.ar(numCh, buf, finalRate, loop: loop, doneAction: if(loop == 0, 2, 0));
            // Ensure stereo
            sig = if(numCh == 1, { [sig, sig] }, { sig });

            // Granular path (stereo output)
            grains = GrainBuf.ar(
                2,
                Dust.kr(overlap / controlGrainSize),
                controlGrainSize.clip(0.05, 1.0),
                buf, finalRate,
                LFNoise2.kr(0.1).range(0, 1),
                2, pan: controlPan
            );

            // Crossfade normal ↔ granular
            stretchAmount = (controlTimeStretch - 1).abs.clip(0, 1);
            sig = XFade2.ar(sig, grains, stretchAmount.linlin(0, 1, -1, 1));

            // Filtering
            sig = HPF.ar(sig, controlHPF.clip(20, 2000));
            sig = RLPF.ar(sig, controlLPF.clip(200, 8000), controlFilterRes.clip(0.1, 0.8));

            // Delay
            wet = DelayC.ar(sig, 2.0, controlDelayTime.clip(0.1, 2.0), controlDelayFB.clip(0, 0.95));
            sig = sig + (wet * controlDelay);

            // Reverb
            sig = FreeVerb2.ar(sig[0], sig[1], controlReverb, roomSizeParam.clip(0.1, 0.99), 0.3);

            // Distance attenuation
            distance = (sampleSpatialX.squared + sampleSpatialY.squared).sqrt;
            distanceAmp = 1 - (distance * distanceParam * 0.5);
            sig = sig * controlAmp.clip(0, 1) * distanceAmp.clip(0.1, 1);

            // Quad panning
            quadSig = PanAz.ar(4, sig.sum, sampleSpatialX.atan2(sampleSpatialY) / pi, 1, 2, 0.5);
            Out.ar(0, quadSig);
        }).add;
    };
    
    s.sync;
    
    // Sample management functions
    ~createSampleSynths = {
        "Sample SynthDefs created successfully.".postln;
        "Creating sample trigger functions...".postln;
        
        // Sample synth tracking for multiple simultaneous playback
        ~activeSampleSynths = [];
        
        // Create sample trigger functions
        ~triggerSample = { |index, duration=nil|
            var sampleName, synthArgs, newSynth, defName, buf;
            if(index < ~sampleBuffers.size and: { ~sampleBuffers[index].notNil }) {
                buf = ~sampleBuffers[index];
                sampleName = ~sampleNames[index];
                // Pick the right SynthDef for the buffer's channel count
                defName = if(buf.numChannels <= 1, \samplePlayerMono, \samplePlayerStereo);
                synthArgs = [
                    \buf, buf,
                    \loop, if(duration.isNil, 0, 1)
                ];

                // Connect all sample control buses if they exist
                if(~sampleBuses.notNil) {
                    ~sampleBuses.keysValuesDo { |paramName, bus|
                        var busParamName = (paramName.asString ++ "Bus").asSymbol;
                        synthArgs = synthArgs ++ [busParamName, bus.index];
                    };
                } {
                    "Sample buses not initialized yet".warn;
                };

                "Triggering sample: % (%, % ch)".format(sampleName, defName, buf.numChannels).postln;
                newSynth = Synth(defName, synthArgs, ~defaultGroup);
                
                // Add to active synths list for tracking
                ~activeSampleSynths = ~activeSampleSynths.add(newSynth);
                
                // Auto-cleanup when synth ends (for non-looping samples)
                if(duration.notNil) {
                    SystemClock.sched(duration, {
                        if(newSynth.notNil) {
                            newSynth.free;
                            ~activeSampleSynths.remove(newSynth);
                        };
                    });
                } {
                    // For looping or long samples, add cleanup when synth naturally ends
                    newSynth.onFree({
                        ~activeSampleSynths.remove(newSynth);
                    });
                };
                
                // Keep track for individual stopping (last triggered)
                ~currentSampleSynth = newSynth;
            } {
                "Sample index % not available".format(index).warn;
            };
        };
        
        // Stop current sample
        ~stopSample = {
            if(~currentSampleSynth.notNil) {
                ~currentSampleSynth.free;
                ~currentSampleSynth = nil;
                "Sample stopped".postln;
            } {
                "No sample currently playing".postln;
            };
        };
        
        // Stop all samples (more aggressive)
        ~stopAllSamples = {
            "Stopping all active samples...".postln;
            
            // Free all tracked sample synths
            if(~activeSampleSynths.notNil) {
                ~activeSampleSynths.do({ |synth|
                    if(synth.notNil) {
                        synth.free;
                    };
                });
                ~activeSampleSynths = [];
                "Freed % tracked sample synths".format(~activeSampleSynths.size).postln;
            };
            
            // Also free current sample reference
            if(~currentSampleSynth.notNil) {
                ~currentSampleSynth.free;
                ~currentSampleSynth = nil;
            };
            
            // Clean up any remaining synths more gently
            if(~defaultGroup.notNil and: { ~defaultGroup.isPlaying }) {
                // Only free if group exists
                s.sendMsg("/g_freeAll", ~defaultGroup.nodeID);
            };
            
            "All samples stopped".postln;
        };
        
        // Sample browser function
        ~listSamples = {
            "Available samples:".postln;
            ~sampleNames.do { |name, i|
                var frames = if(~sampleBuffers[i].notNil, ~sampleBuffers[i].numFrames, 0);
                var duration = if(frames > 0, frames / s.sampleRate, 0);
                "  %: % (%.1f seconds)".format(i, name, duration).postln;
            };
        };
        
        // Debug function
        ~checkSampleSystem = {
            "=== SAMPLE SYSTEM STATUS ===".postln;
            "~triggerSample function exists: %".format(~triggerSample.notNil).postln;
            "~stopSample function exists: %".format(~stopSample.notNil).postln;
            "~sampleBuses exists: %".format(~sampleBuses.notNil).postln;
            "Sample buffers loaded: %/%".format(~loadedSamples ? 0, ~samplePaths.size).postln;
            "Active sample synths: %".format(~activeSampleSynths.size).postln;
            "Current sample synth: %".format(~currentSampleSynth.notNil).postln;
            "==========================".postln;
        };
        
        // Show what's currently playing
        ~showActiveSamples = {
            "=== ACTIVE SAMPLES ===".postln;
            if(~activeSampleSynths.size > 0) {
                "Currently playing % samples:".format(~activeSampleSynths.size).postln;
                ~activeSampleSynths.do({ |synth, i|
                    "  Sample synth %: %".format(i + 1, synth).postln;
                });
            } {
                "No samples currently playing".postln;
            };
            "=====================".postln;
        };
    };
    
    // Start sample loading
    ~loadSamples.value;
    
    "Sample System initialized.".postln;
    "Use ~triggerSample.(index) to play samples (layered)".postln;
    "Use ~listSamples.value to see available samples".postln;
    "Use ~stopSample.value to stop last triggered sample".postln;
    "Use ~stopAllSamples.value to stop all playing samples".postln;
    "Use ~showActiveSamples.value to see what's playing".postln;
    "Use ~checkSampleSystem.value to debug sample status".postln;
});
)