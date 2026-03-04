// SuperCollider Ethereum Sonification - Synth Definitions
// Current Date and Time (UTC): 2025-03-01 20:58:06
// Current User's Login: alejoduque

(
// Wait for server to be ready — use doWhenBooted (does NOT re-trigger boot)
// s.waitForBoot triggers a boot which collides with the boot from 1_server_config.scd
s.doWhenBooted({
    // Ensure default group exists
    if(~defaultGroup.isNil or: { ~defaultGroup.isPlaying.not }) {
        ~defaultGroup = Group.new(s, \addToHead);
    };
    s.sync;

    // MERGED CONTROL PARAMETERS - Lawrence English ambient + existing drone/noise controls
    ~globalParams = (
        // === Lawrence English Ambient Controls (Row 1) ===
        masterVolume: 0.3,    // CC 0  - ACTUAL master volume control
        pitchShift: 0.0,      // CC 1  - Frequency shift in semitones (-24 to +24)
        timeDilation: 2.0,    // CC 2  - Stretch/compress time (decay multiplier)
        spectralShift: 1000,  // CC 3  - Filter frequency for spectral shaping (200–4500 Hz)
        spatialSpread: 0.0,   // CC 4  - Spatial positioning (-1 to 1)

        // === Ambient Processing (Row 2) ===
        textureDepth: 0.2,    // CC 32 - Granular texture density
        atmosphereMix: 0.4,   // CC 33 - Reverb amount (ambient space)
        memoryFeed: 0.3,      // CC 34 - Delay feedback (memory/echo)
        harmonicRich: 1.0,    // CC 35 - FM ratio (harmonic complexity)
        resonantBody: 0.4,    // CC 36 - Filter resonance (body/formant)

        // === Existing Drone/Noise Controls (Row 3) ===
        masterAmp: 0.7,       // CC 64 - Legacy master amp
        filterCutoff: 0.6,    // CC 65 - Legacy filter
        noiseLevel: 0.1,      // CC 66 - Noise amount
        noiseFilt: 0.5,       // CC 67 - Noise filtering
        droneDepth: 0.3,      // CC 68 - Drone intensity
        droneFade: 2.0,       // CC 69 - Drone envelope
        droneSpace: 0.5,      // CC 70 - Drone spatial
        droneMix: 0.5,        // CC 71 - Drone blend

        // === Flow Controls ===
        flowRate: 0.8,        // Transaction playback rate
        sparsity: 0.2,        // Minimum gap between events
        delayFeedback: 0.3,   // Additional delay control
        transactionInfluence: 0.3  // How much transactions affect parameters
    );

    // Main transaction bell with MIDI control
    SynthDef(\elektronBell, {
        arg freq=440, amp=0.3,
        atk=2.0, dec=1.0, rel=1.5,
        tone=0.3, res=0.4, pan=0,
        // Bus indices for real-time MIDI control (merged parameter set)
        masterVolBus=(-1), pitchBus=(-1), timeBus=(-1), spectralBus=(-1), spatialBus=(-1),
        textureBus=(-1), atmosphereBus=(-1), memoryBus=(-1), harmonicBus=(-1), resonantBus=(-1),
        // Additional drone/noise control buses
        masterAmpBus=(-1), filterCutoffBus=(-1), noiseLevelBus=(-1), noiseFiltBus=(-1),
        droneDepthBus=(-1), droneFadeBus=(-1), droneSpaceBus=(-1), droneMixBus=(-1),
        // Spatial positioning buses
        spatialXBus=(-1), spatialYBus=(-1), roomSizeBus=(-1), distanceEffectBus=(-1);

        var env, sig, mod, carrier, grains, wet, noise, distance, distanceAmp, quadSig;
        // MIDI bus inputs - Lawrence English ambient style with bus parameter fallbacks
        var masterVol = Select.kr(masterVolBus >= 0, [0.3, In.kr(masterVolBus, 1)]);
        var pitchOffset = Select.kr(pitchBus >= 0, [0.0, In.kr(pitchBus, 1)]);
        var timeStretch = Select.kr(timeBus >= 0, [2.0, In.kr(timeBus, 1)]);
        var spectralFreq = Select.kr(spectralBus >= 0, [1000, In.kr(spectralBus, 1)]);
        var spatialPos = Select.kr(spatialBus >= 0, [0.0, In.kr(spatialBus, 1)]);
        var textureDensity = Select.kr(textureBus >= 0, [0.2, In.kr(textureBus, 1)]);
        var atmosphereLevel = Select.kr(atmosphereBus >= 0, [0.4, In.kr(atmosphereBus, 1)]);
        var memoryFeedback = Select.kr(memoryBus >= 0, [0.3, In.kr(memoryBus, 1)]);
        var harmonicComplexity = Select.kr(harmonicBus >= 0, [1.0, In.kr(harmonicBus, 1)]);
        var filterResonance = Select.kr(resonantBus >= 0, [0.4, In.kr(resonantBus, 1)]);
        
        // Additional drone/noise parameters
        var legacyAmp = Select.kr(masterAmpBus >= 0, [0.7, In.kr(masterAmpBus, 1)]);
        var legacyFilter = Select.kr(filterCutoffBus >= 0, [0.6, In.kr(filterCutoffBus, 1)]);
        var noiseAmount = Select.kr(noiseLevelBus >= 0, [0.1, In.kr(noiseLevelBus, 1)]);
        var noiseFilter = Select.kr(noiseFiltBus >= 0, [0.5, In.kr(noiseFiltBus, 1)]);
        var droneIntensity = Select.kr(droneDepthBus >= 0, [0.3, In.kr(droneDepthBus, 1)]);
        var droneEnvelope = Select.kr(droneFadeBus >= 0, [2.0, In.kr(droneFadeBus, 1)]);
        var droneMix = Select.kr(droneMixBus >= 0, [0.5, In.kr(droneMixBus, 1)]);
        
        // Spatial positioning parameters from spatial GUI
        var spatialX = Select.kr(spatialXBus >= 0, [0.0, In.kr(spatialXBus, 1)]);
        var spatialY = Select.kr(spatialYBus >= 0, [0.0, In.kr(spatialYBus, 1)]);
        var roomSizeParam = Select.kr(roomSizeBus >= 0, [0.8, In.kr(roomSizeBus, 1)]);
        var distanceParam = Select.kr(distanceEffectBus >= 0, [0.5, In.kr(distanceEffectBus, 1)]);
        
        // Apply pitch shift
        freq = freq * (pitchOffset.clip(-24, 24) / 12).midiratio;

        // --- Sustained pad tone (replaces the old percussive cowbell) ---
        // Gentle FM with near-unison ratios (1.0-1.5x) — warm, not metallic
        mod = SinOsc.ar(freq * harmonicComplexity.linexp(0.1, 8, 1.0, 1.5)) *
              (harmonicComplexity.linlin(0.1, 8, 0.0, 0.3)) * freq;
        carrier = SinOsc.ar(freq + mod);

        // Blend in a soft sub octave and a quiet 5th for body
        sig = carrier * 0.5
            + (SinOsc.ar(freq * 0.5) * 0.3)
            + (SinOsc.ar(freq * 1.5) * 0.1 * harmonicComplexity.linlin(0.1, 8, 0.0, 1.0));

        // Slow attack / sustained body / slow release — drone shape, not hit shape.
        // Total life ≤ atk(2) + dec(1) + rel(1.5) = 4.5s max — manageable at 24-synth cap.
        env = EnvGen.kr(
            Env.new(
                [0, 1, 0.6, 0],
                [
                    atk  * timeStretch.clip(0.5, 3.0),   // slow fade-in
                    dec  * timeStretch.clip(0.5, 2.0),   // settle
                    rel  * timeStretch.clip(0.5, 1.5)    // gentle tail
                ],
                [\sine, \sine, -3]
            ),
            doneAction: 2
        );

        sig = sig * env;

        // Soft low-pass (not resonant) — no ringing, just warmth
        // Clamp 200–3000Hz: above 3000 LPF is transparent on these pads
        sig = LPF.ar(sig, spectralFreq.clip(200, 3000));

        // Slow shimmer via gentle pitch modulation
        grains = PitchShift.ar(sig, 0.3, LFNoise2.kr(0.2).range(0.98, 1.02), textureDensity * 0.3);
        sig = XFade2.ar(sig, grains, textureDensity.linlin(0, 1, -1, 0.5));

        // Long wash reverb — pads need space
        wet = DelayC.ar(sig, 2.0, LFNoise2.kr(0.05).range(0.3, 1.2), memoryFeedback * 0.7);
        sig = sig + wet;
        sig = FreeVerb2.ar(sig, sig,
            atmosphereLevel.clip(0.3, 0.95),
            roomSizeParam.clip(0.3, 0.99),
            0.5
        );

        // Soft noise breath underneath
        noise = PinkNoise.ar() * noiseAmount * 0.15;
        noise = LPF.ar(noise, noiseFilter.linexp(0, 1, 200, 2000));
        sig = sig + noise;
        
        // Calculate distance-based amplitude scaling
        distance = (spatialX.squared + spatialY.squared).sqrt;
        distanceAmp = 1 - (distance * distanceParam * 0.5);
        
        // Volume: masterVol linear (not squared) so pads aren't buried at mid-knob settings
        sig = sig * (amp * masterVol.clip(0.01, 1) * distanceAmp.clip(0.1, 1));
        
        // Quadraphonic spatial positioning
        quadSig = PanAz.ar(
            4,                    // 4 channels for quad
            sig.sum,              // Mono sum for panning
            spatialX.atan2(spatialY) / pi,  // Angle from X,Y coordinates
            1,                    // Amplitude
            2,                    // Speaker array radius
            0.5                   // Orientation
        );
        
        Out.ar(0, quadSig);
    }).add;

    // --- Fors Opal Emulation Synths ---
    
    // opalKick: Deep FM/Distortion kick (Gem style)
    SynthDef(\opalKick, {
        arg out=0, freq=50, amp=0.5, atk=0.001, dec=0.4,
        masterVolBus=(-1), timeBus=(-1), harmonicBus=(-1), textureBus=(-1), spectralBus=(-1), atmosphereBus=(-1), spatialBus=(-1);

        var vol   = Select.kr(masterVolBus >= 0, [0.3, In.kr(masterVolBus, 1)]);
        var tStretch= Select.kr(timeBus >= 0, [2.0, In.kr(timeBus, 1)]);
        var fmR   = Select.kr(harmonicBus >= 0, [1.0, In.kr(harmonicBus, 1)]);
        var fmD   = Select.kr(textureBus >= 0, [0.2, In.kr(textureBus, 1)]);
        var filt  = Select.kr(spectralBus >= 0, [1000, In.kr(spectralBus, 1)]);
        var revM  = Select.kr(atmosphereBus >= 0, [0.4, In.kr(atmosphereBus, 1)]);
        var spatialX= Select.kr(spatialBus >= 0, [0.0, In.kr(spatialBus, 1)]);

        var env, pitchEnv, sig, mod, quadSig;
        
        env = EnvGen.ar(Env.perc(atk, dec * tStretch, 1, -4), doneAction: 2);
        pitchEnv = EnvGen.ar(Env([freq * 8, freq, freq * 0.5], [0.02, dec * tStretch], \exp));
        
        mod = SinOsc.ar(pitchEnv * fmR.linexp(0.1, 8, 0.5, 4.0)) * (fmD * 0.4) * pitchEnv;
        sig = SinOsc.ar(pitchEnv + mod);
        
        // Distortion & Filter (Opal drive)
        sig = (sig * (1 + (fmD * 5))).tanh;
        // Kick LPF: cap at 3000Hz
        sig = LPF.ar(sig, filt.clip(100, 3000));
        
        // Reverb tail
        sig = sig + FreeVerb.ar(sig, revM * 0.5, 0.7, 0.2);

        sig = sig * env * amp * vol;
        
        // Quadraphonic spatial positioning
        quadSig = PanAz.ar(4, sig, spatialX.atan2(0) / pi, 1, 2, 0.5);
        Out.ar(out, quadSig);
    }).add;

    // opalPerc: Physical modeling metallic/woody perc (Mass style)
    SynthDef(\opalPerc, {
        arg out=0, freq=400, amp=0.3, 
        masterVolBus=(-1), harmonicBus=(-1), textureBus=(-1), resonantBus=(-1), spectralBus=(-1), timeBus=(-1),
        memoryBus=(-1), atmosphereBus=(-1), spatialBus=(-1);

        var vol   = Select.kr(masterVolBus >= 0, [0.3, In.kr(masterVolBus, 1)]);
        var tStretch= Select.kr(timeBus >= 0, [2.0, In.kr(timeBus, 1)]);
        var filt  = Select.kr(spectralBus >= 0, [1000, In.kr(spectralBus, 1)]);
        var res   = Select.kr(resonantBus >= 0, [0.4, In.kr(resonantBus, 1)]);
        var fmD   = Select.kr(textureBus >= 0, [0.2, In.kr(textureBus, 1)]);
        var dMix  = Select.kr(memoryBus >= 0, [0.3, In.kr(memoryBus, 1)]);
        var revM  = Select.kr(atmosphereBus >= 0, [0.4, In.kr(atmosphereBus, 1)]);
        var spatialX= Select.kr(spatialBus >= 0, [0.0, In.kr(spatialBus, 1)]);

        var exciter, sig, wet, quadSig;
        
        // Short burst of noise/fm as exciter
        exciter = Mix([
            WhiteNoise.ar * EnvGen.ar(Env.perc(0.001, 0.05)),
            SinOsc.ar(freq * (1 + fmD)) * EnvGen.ar(Env.perc(0.001, 0.02))
        ]);

        // Resonator (Klank for metallic resonance)
        sig = Ringz.ar(
            exciter, 
            freq * [1, 2.32, 4.25, 6.63, 9.38] * (1 + (res * 0.5)), 
            [1, 0.8, 0.5, 0.3, 0.1] * (tStretch * 0.5)
        ).sum;
        
        // Changed from BPF to LPF: BPF at high freq passes almost nothing (silence);
        // LPF at high freq is transparent — sound always passes through.
        sig = LPF.ar(sig, filt.clip(300, 3000));
        sig = sig * EnvGen.ar(Env.perc(0.001, 1.5 * tStretch), doneAction: 2);

        // Ping-pong delay
        wet = CombC.ar(sig, 0.5, 0.1, 1.5) * dMix;
        sig = sig + wet;
        sig = sig + FreeVerb.ar(sig, revM, 0.8, 0.5);

        sig = sig * amp * vol;
        
        quadSig = PanAz.ar(4, sig, spatialX.atan2(0) / pi, 1, 2, 0.5);
        Out.ar(out, quadSig);
    }).add;

    // opalDrone: Continuous evolving ambient pad
    SynthDef(\opalDrone, {
        arg out=0, freq=55, amp=0.5, gate=1,
        masterVolBus=(-1), pitchBus=(-1), timeBus=(-1), spectralBus=(-1), spatialBus=(-1),
        textureBus=(-1), atmosphereBus=(-1), memoryBus=(-1), harmonicBus=(-1), resonantBus=(-1);

        var vol   = Select.kr(masterVolBus >= 0, [0.3, In.kr(masterVolBus, 1)]);
        var pShift= Select.kr(pitchBus >= 0, [0.0, In.kr(pitchBus, 1)]);
        var tStretch= Select.kr(timeBus >= 0, [2.0, In.kr(timeBus, 1)]);
        var filt  = Select.kr(spectralBus >= 0, [1000, In.kr(spectralBus, 1)]);
        var spatialX= Select.kr(spatialBus >= 0, [0.0, In.kr(spatialBus, 1)]);
        var texD  = Select.kr(textureBus >= 0, [0.2, In.kr(textureBus, 1)]);
        var revM  = Select.kr(atmosphereBus >= 0, [0.4, In.kr(atmosphereBus, 1)]);
        var dMix  = Select.kr(memoryBus >= 0, [0.3, In.kr(memoryBus, 1)]);
        var fmR   = Select.kr(harmonicBus >= 0, [1.0, In.kr(harmonicBus, 1)]);
        var res   = Select.kr(resonantBus >= 0, [0.4, In.kr(resonantBus, 1)]);

        var env, sig, mod, sub, grains, delay, quadSig, baseFreq;
        
        env = EnvGen.kr(Env.asr(4.0, 1.0, 6.0), gate, doneAction: 2);
        
        // Pitch mapping
        baseFreq = freq * (pShift.clip(-24, 24) / 12).midiratio;
        
        // Complex oscillator using native UGens instead of SuperSaw to avoid plugin dependency
        mod = LFNoise2.kr(0.1 + (tStretch * 0.5)).range(0.9, 1.1) * fmR * 2.0;
        sig = Mix([
            // Simulate a supersaw with multiple detuned Saw oscillators
            Mix.fill(5, { |i| 
                Saw.ar(baseFreq * (1 + (texD * 0.05 * (i - 2)))) * 0.2
            }),
            SinOsc.ar(baseFreq * 0.5 + mod),
            VarSaw.ar(baseFreq * 1.5, 0, width: LFNoise1.kr(0.2).range(0.1, 0.9))
        ]) * 0.3;
        
        // Drone RLPF: clamp filt BEFORE applying LFNoise multiplier, ceiling 3000Hz
        sig = RLPF.ar(
            sig, 
            LFNoise2.kr(0.05).exprange(filt.clip(80, 3000) * 0.5, filt.clip(80, 3000) * 1.5).clip(80, 4500), 
            res.linexp(0, 1, 0.9, 0.15)  // rq floor raised to 0.15 — prevents instability at high Q
        );
        
        // Granular texturizer
        grains = PitchShift.ar(sig, 0.2, 1.0, texD * 0.5, texD * 0.5);
        sig = XFade2.ar(sig, grains, texD.linlin(0, 1, -1, 1));
        
        // Wash effects
        delay = CombC.ar(sig, 1.0, LFNoise1.kr(0.1).range(0.2, 0.6), dMix * 4.0) * dMix;
        sig = sig + delay;
        sig = FreeVerb.ar(sig, revM, 0.9, 0.1);
        
        // Sub low end anchor
        sub = SinOsc.ar(baseFreq * 0.25) * 0.5 * LPF.ar(sig, 200, mul: 0.5);
        sig = sig + sub;
        
        sig = sig * env * amp * vol * 0.4;
        
        quadSig = PanAz.ar(4, sig, spatialX.atan2(0) / pi + LFNoise1.kr(0.05).range(-0.2, 0.2), 1, 2, 0.5);
        Out.ar(out, quadSig);
    }).add;

    // opalDust: Crackly granular noise (Dust style)
    SynthDef(\opalDust, {
        arg out=0, amp=0.2,
        masterVolBus=(-1), textureBus=(-1), spectralBus=(-1), timeBus=(-1), pitchBus=(-1),
        memoryBus=(-1), atmosphereBus=(-1), spatialBus=(-1);

        var vol   = Select.kr(masterVolBus >= 0, [0.3, In.kr(masterVolBus, 1)]);
        var dens  = Select.kr(textureBus >= 0, [0.2, In.kr(textureBus, 1)]);
        var filt  = Select.kr(spectralBus >= 0, [1000, In.kr(spectralBus, 1)]);
        var tStretch= Select.kr(timeBus >= 0, [2.0, In.kr(timeBus, 1)]);
        var pitch = Select.kr(pitchBus >= 0, [0.0, In.kr(pitchBus, 1)]);
        var revM  = Select.kr(atmosphereBus >= 0, [0.4, In.kr(atmosphereBus, 1)]);
        var dMix  = Select.kr(memoryBus >= 0, [0.3, In.kr(memoryBus, 1)]);
        var spatialX= Select.kr(spatialBus >= 0, [0.0, In.kr(spatialBus, 1)]);

        var env, sig, grains, wet, quadSig;
        
        env = EnvGen.ar(Env.perc(0.01, tStretch * 0.8), doneAction: 2);
        
        // Crackle / Dust generator
        grains = Dust2.ar(dens.linexp(0, 1, 10, 500));
        // Changed from BPF to LPF: BPF at high freq silences the signal entirely;
        // LPF at high freq is open — dust crackle always comes through.
        sig = LPF.ar(grains, filt.clip(200, 3000));
        
        // Delay + Reverb wash
        wet = CombC.ar(sig, 0.5, 0.15, 2.0) * dMix;
        sig = sig + wet;
        sig = sig + FreeVerb.ar(sig, revM, 0.8, 0.5);

        sig = sig * env * amp * vol * 2.0; // Volume compensation
        
        quadSig = PanAz.ar(4, sig, spatialX.atan2(0) / pi, 1, 2, 0.5);
        Out.ar(out, quadSig);
    }).add;
    // -----------------------

    // Create control buses for MIDI - ensure proper initialization order
    ~buses = ();  // Reset buses to avoid conflicts
    
    "Creating control buses...".postln;
    ~globalParams.keysValuesDo { |param, val|
        ~buses[param] = Bus.control(s, 1);
        ~buses[param].set(val);
        "Bus created: % = % (index: %)".format(param, val, ~buses[param].index).postln;
    };
    
    // Add spatial control buses for ambient sounds — alloc and set must be separate (SC 3.13: .set returns nil)
    ~buses.spatialX = Bus.control(s, 1);
    ~buses.spatialX.set(0.0);
    ~buses.spatialY = Bus.control(s, 1);
    ~buses.spatialY.set(0.0);
    ~buses.roomSize = Bus.control(s, 1);
    ~buses.roomSize.set(0.8);
    ~buses.distanceEffect = Bus.control(s, 1);
    ~buses.distanceEffect.set(0.5);
    
    // Wait for all bus .set() messages to be processed before readback
    s.sync;

    // Print final bus setup for debugging
    "".postln;
    "=== CONTROL BUS SETUP COMPLETE ===".postln;
    "Total buses created: %".format(~buses.size).postln;
    ~buses.keysValuesDo { |name, bus|
        "  % -> Bus[%] = %".format(name, bus.index, bus.getSynchronous.round(0.001)).postln;
    };
    "================================".postln;

    // Wait for SynthDefs to be added to server
    s.sync;

    // Note: OSC handlers are defined in 6_osc_handlers.scd to avoid conflicts

    "Synth Definitions loaded - Lawrence English ambient style".postln;
    
    // Print ambient control map
    "LAWRENCE ENGLISH AMBIENT CONTROL MAP:".postln;
    "Row 1 - Core Performance:".postln;
    "  CC 0  -> Master Volume (actual volume!)".postln;
    "  CC 1  -> Pitch Shift (±2 octaves for freq blending)".postln;
    "  CC 2  -> Time Dilation (envelope stretch)".postln;
    "  CC 3  -> Spectral Shift (filter sweep)".postln;
    "  CC 4  -> Spatial Spread (quad positioning)".postln;
    "\nRow 2 - Ambient Processing:".postln;
    "  CC 32 -> Texture Depth (granular density)".postln;
    "  CC 33 -> Atmosphere Mix (reverb space)".postln;
    "  CC 34 -> Memory Feed (delay feedback)".postln;
    "  CC 35 -> Harmonic Rich (FM complexity)".postln;
    "  CC 36 -> Resonant Body (filter resonance)".postln;
});
)