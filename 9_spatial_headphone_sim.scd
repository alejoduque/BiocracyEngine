// SuperCollider Ethereum Sonification - 4-Channel Headphone Simulation
// Current Date and Time (UTC): 2025-08-31 21:29:00
// Current User's Login: alejoduque
// Initialization Sequence: 9 of 10
// Depends on: 1_server_config.scd, 3_synthdefs.scd
// Purpose: Simulate 4-channel monitor setup on stereo headphones

(
// 4-Channel to Binaural Conversion for Headphones
// Simulates quadraphonic speaker setup: FL, FR, RL, RR

~spatialHeadphoneSetup = {
    
    // Create 4-channel input buses for quad simulation
    ~quadBuses = (
        frontLeft: Bus.audio(s, 1),   // FL
        frontRight: Bus.audio(s, 1),  // FR
        rearLeft: Bus.audio(s, 1),    // RL
        rearRight: Bus.audio(s, 1)    // RR
    );
    
    // Binaural rendering parameters
    ~binauralParams = (
        // Speaker positions (azimuth in degrees)
        speakerPositions: [
            -45,  // Front Left
            45,   // Front Right
            -135, // Rear Left
            135   // Rear Right
        ],
        
        // Distance simulation (meters)
        speakerDistance: 2.5,
        
        // Room simulation
        roomSize: 0.3,
        damping: 0.5,
        
        // Head model parameters
        headWidth: 0.18,  // Average head width in meters
        speedOfSound: 343 // m/s at 20°C
    );
    
    // Calculate ITD (Interaural Time Difference) for each speaker.
    // s.sampleRate stays nil until the server's first status reply — the
    // bare multiply crashed this whole file at boot ("binary op '*' failed").
    ~calculateITD = { |azimuth|
        var azimuthRad = azimuth * pi / 180;
        var itd = (~binauralParams.headWidth / ~binauralParams.speedOfSound) *
                  sin(azimuthRad) * (s.sampleRate ? 48000);
        itd.clip(-20, 20); // Limit to reasonable sample delays
    };
    
    // Calculate ILD (Interaural Level Difference) for each speaker
    ~calculateILD = { |azimuth|
        var azimuthRad = azimuth * pi / 180;
        var shadowFactor = (cos(azimuthRad) + 1) / 2; // 0 to 1
        [shadowFactor, 1 - shadowFactor]; // [left gain, right gain]
    };
    
    // Binaural processor SynthDef
    SynthDef(\quadToBinaural, {
        var fl, fr, rl, rr;
        var leftOut, rightOut;
        var leftDelays, rightDelays;
        var leftGains, rightGains;
        var itds, ilds;
        
        // Read from quad buses
        fl = In.ar(~quadBuses.frontLeft.index, 1);
        fr = In.ar(~quadBuses.frontRight.index, 1);
        rl = In.ar(~quadBuses.rearLeft.index, 1);
        rr = In.ar(~quadBuses.rearRight.index, 1);
        
        // Calculate ITDs and ILDs for each speaker
        itds = ~binauralParams.speakerPositions.collect(~calculateITD);
        ilds = ~binauralParams.speakerPositions.collect(~calculateILD);
        
        // Apply binaural processing for each channel
        leftDelays = [
            DelayC.ar(fl, 0.002, itds[0].abs / s.sampleRate) * ilds[0][0],
            DelayC.ar(fr, 0.002, itds[1].abs / s.sampleRate) * ilds[1][0],
            DelayC.ar(rl, 0.002, itds[2].abs / s.sampleRate) * ilds[2][0],
            DelayC.ar(rr, 0.002, itds[3].abs / s.sampleRate) * ilds[3][0]
        ];
        
        rightDelays = [
            DelayC.ar(fl, 0.002, itds[0].abs / s.sampleRate) * ilds[0][1],
            DelayC.ar(fr, 0.002, itds[1].abs / s.sampleRate) * ilds[1][1],
            DelayC.ar(rl, 0.002, itds[2].abs / s.sampleRate) * ilds[2][1],
            DelayC.ar(rr, 0.002, itds[3].abs / s.sampleRate) * ilds[3][1]
        ];
        
        // Mix down to stereo with distance and room simulation
        leftOut = Mix(leftDelays);
        rightOut = Mix(rightDelays);
        
        // Add subtle room ambience
        leftOut = leftOut + (FreeVerb.ar(leftOut, ~binauralParams.roomSize, ~binauralParams.damping) * 0.2);
        rightOut = rightOut + (FreeVerb.ar(rightOut, ~binauralParams.roomSize, ~binauralParams.damping) * 0.2);
        
        // Final stereo output
        Out.ar(0, [leftOut, rightOut]);
    }).add;
    
    // Spatial panning function for placing sounds in the quad field
    ~panToQuad = { |signal, x=0, y=0, amp=1|
        // x: -1 (left) to 1 (right)
        // y: -1 (rear) to 1 (front)
        var frontGain = (y + 1) / 2;
        var rearGain = 1 - frontGain;
        var leftGain = (1 - x) / 2;
        var rightGain = 1 - leftGain;
        
        var fl = signal * frontGain * leftGain * amp;
        var fr = signal * frontGain * rightGain * amp;
        var rl = signal * rearGain * leftGain * amp;
        var rr = signal * rearGain * rightGain * amp;
        
        [fl, fr, rl, rr]
    };
    
    // Enhanced spatial synth that outputs to quad buses
    SynthDef(\spatialElektronBell, {
        arg freq=440, amp=0.3, 
        atk=0.01, dec=0.3, rel=0.5,
        tone=0.3, res=0.4, 
        spatialX=0, spatialY=0, // Spatial position
        // Bus parameters for real-time control
        masterVolBus=(-1), pitchBus=(-1), harmonicBus=(-1), spectralBus=(-1), timeBus=(-1);
        
        var env, sig, mod, carrier, quadSig;
        // Use our actual bus system with safety checks
        var midiAmp = Select.kr(masterVolBus >= 0, [0.3, In.kr(masterVolBus, 1)]);
        var harmonicRich = Select.kr(harmonicBus >= 0, [1.0, In.kr(harmonicBus, 1)]);
        var spectralShift = Select.kr(spectralBus >= 0, [1000, In.kr(spectralBus, 1)]);
        var pitchOffset = Select.kr(pitchBus >= 0, [0.0, In.kr(pitchBus, 1)]);
        var timeStretch = Select.kr(timeBus >= 0, [2.0, In.kr(timeBus, 1)]);
        
        // Apply MIDI-controlled pitch offset
        freq = freq * (pitchOffset / 12).midiratio;
        
        // FM Synthesis
        mod = SinOsc.ar(freq * harmonicRich) * (harmonicRich * 0.2) * freq;
        carrier = SinOsc.ar(freq + mod);
        
        // Envelope with time stretch
        env = EnvGen.kr(
            Env.new(
                [0, 1, 0.5, 0],
                [atk, dec * timeStretch, rel * timeStretch],
                [-4, -2, -4]
            ),
            doneAction: 2
        );
        
        sig = carrier * env * amp * midiAmp;
        
        // Filter with spectral control
        sig = RLPF.ar(
            sig,
            spectralShift.clip(200, 5000),
            res
        );
        
        // Pan to quadraphonic field
        quadSig = ~panToQuad.(sig, spatialX, spatialY);
        
        // Output to quad buses
        Out.ar(~quadBuses.frontLeft.index, quadSig[0]);
        Out.ar(~quadBuses.frontRight.index, quadSig[1]);
        Out.ar(~quadBuses.rearLeft.index, quadSig[2]);
        Out.ar(~quadBuses.rearRight.index, quadSig[3]);
    }).add;
    
    // Wait for SynthDefs to be added
    s.sync;
    
    // Start the binaural processor
    ~binauralProcessor = Synth(\quadToBinaural);
    
    // Spatial test function
    ~testSpatial = {
        // Test each corner of the quad field
        fork {
            "Testing spatial positions...".postln;
            
            // Front Left
            "Front Left".postln;
            Synth(\spatialElektronBell, [\freq, 440, \spatialX, -1, \spatialY, 1]);
            1.wait;
            
            // Front Right
            "Front Right".postln;
            Synth(\spatialElektronBell, [\freq, 550, \spatialX, 1, \spatialY, 1]);
            1.wait;
            
            // Rear Left
            "Rear Left".postln;
            Synth(\spatialElektronBell, [\freq, 330, \spatialX, -1, \spatialY, -1]);
            1.wait;
            
            // Rear Right
            "Rear Right".postln;
            Synth(\spatialElektronBell, [\freq, 660, \spatialX, 1, \spatialY, -1]);
            1.wait;
            
            // Center
            "Center".postln;
            Synth(\spatialElektronBell, [\freq, 880, \spatialX, 0, \spatialY, 0]);
            
            "Spatial test complete.".postln;
        };
    };
    
    // Function to switch between headphone simulation and direct quad output
    ~setSpatialMode = { |mode|
        switch(mode,
            \headphones, {
                "Switching to headphone simulation mode...".postln;
                ~binauralProcessor = ~binauralProcessor ?? { Synth(\quadToBinaural) };
                "Use ~testSpatial.value to test positioning.".postln;
            },
            \quad, {
                "Switching to direct quad output mode...".postln;
                ~binauralProcessor.free;
                ~binauralProcessor = nil;
                "Direct 4-channel output enabled.".postln;
            }
        );
    };
    
    "4-Channel spatial simulation loaded.".postln;
    "Use ~setSpatialMode.(\\headphones) for headphone simulation".postln;
    "Use ~setSpatialMode.(\\quad) for direct 4-channel output".postln;
    "Use ~testSpatial.value to test spatial positioning".postln;
};

// Initialize spatial system once the server is confirmed up (audio buses +
// SynthDef build both need a live server)
s.doWhenBooted({ ~spatialHeadphoneSetup.value });
)