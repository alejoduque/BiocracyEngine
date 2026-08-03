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

    // Control parameters (name/spec/default) live in the canonical registry:
    // see 0_parameters.scd (~paramDefs). Buses are created from it below.

    // ── Master limiter ──────────────────────────────────────────────────
    // Nothing in this graph protected the output: every synth writes straight
    // to Out.ar(0, …) and they sum unbounded. 16 concurrent pads at the old
    // amp with masterVolume 0.3 already reached 1.34 full-scale before the
    // drone and beat layers were added — that is the distortion, and on a
    // busy chain it was the normal operating state, not an edge case.
    //
    // Placed at the TAIL of the root node so it sees the summed bus. Failure
    // mode is deliberately benign: if this synth is missing or mis-ordered it
    // reads silence and ReplaceOut writes zeros BEFORE the sources add their
    // output, so the worst case is "no limiting", never "no sound".
    //
    // LeakDC first — accumulated DC from many one-shot envelopes eats headroom
    // that the limiter would otherwise spend on real signal.
    // The channel count is captured HERE, when the graph is built — In.ar
    // needs a literal integer; passing it as a SynthDef arg makes it an
    // OutputProxy and the def fails to compile ("numChannels must be a
    // nonzero positive integer"). Read once from the booted server.
    ~limiterChans = s.options.numOutputBusChannels;
    SynthDef(\masterLimiter, { |ceiling = 0.92|
        var sig = In.ar(0, ~limiterChans);
        var clean = LeakDC.ar(sig);
        var lim = Limiter.ar(clean, ceiling, 0.01);
        var mono = Mix(clean) / ~limiterChans.max(1);
        // Report pre-limiter level and how much the limiter is pulling back.
        // A sustained drone that sits near the ceiling makes the limiter squash
        // every transient on top of it — kicks and pads lose their attack and
        // the mix collapses to "just the drone". That is inaudible from the
        // outside and invisible in a synth count, so it is measured here and
        // surfaced on the [MON] line.
        SendReply.kr(Impulse.kr(4), '/limiterGR',
            [Amplitude.kr(mono), Amplitude.kr(Mix(lim) / ~limiterChans.max(1))]);
        ReplaceOut.ar(0, lim);
    }).add;

    // Real spectrum of the master bus, in 16 log-spaced bands. The browser's
    // spectrogram has always synthesised its bins from parliament state, so it
    // could never disagree with the engine; and a microphone only works if the
    // room can hear the speakers, which is false on headphones or an interface.
    // Analysing the bus itself is the only source that is actually the sound.
    SynthDef(\masterScope, {
        var sig = Mix(In.ar(0, ~limiterChans)) / ~limiterChans.max(1);
        var bands = Array.geom(16, 40, (10000 / 40) ** (1 / 15));
        SendReply.kr(Impulse.kr(20), '/spectrum',
            bands.collect { |f| Amplitude.kr(BPF.ar(sig, f, 0.4), 0.01, 0.12) });
    }).add;

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
        // masterAmp + filterCutoff are applied further down (they used to be
        // read into variables this SynthDef then threw away). The drone*
        // buses are NOT read here — they belong to \opalDrone, which now
        // declares and uses them itself.
        var legacyAmp = Select.kr(masterAmpBus >= 0, [0.7, In.kr(masterAmpBus, 1)]);
        var legacyFilter = Select.kr(filterCutoffBus >= 0, [0.6, In.kr(filterCutoffBus, 1)]);
        var noiseAmount = Select.kr(noiseLevelBus >= 0, [0.1, In.kr(noiseLevelBus, 1)]);
        var noiseFilter = Select.kr(noiseFiltBus >= 0, [0.5, In.kr(noiseFiltBus, 1)]);

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

        // filterCutoff: broad tone tilt over the whole pad (was read and dropped)
        sig = LPF.ar(sig, Lag.kr(legacyFilter, 0.3).linexp(0, 1, 300, 12000));
        
        // Calculate distance-based amplitude scaling
        distance = (spatialX.squared + spatialY.squared).sqrt;
        distanceAmp = 1 - (distance * distanceParam * 0.5);
        
        // Volume: masterVol linear (not squared) so pads aren't buried at mid-knob
        // settings. masterAmp rides on top as the pad-layer trim (also previously
        // read and dropped) — it is the same control the beat engine scales its
        // percussion with, so the two layers now balance from one slider.
        sig = sig * (amp * masterVol.clip(0.01, 1) * distanceAmp.clip(0.1, 1)
            * Lag.kr(legacyAmp, 0.3).linlin(0, 1, 0.05, 1.4));
        
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

        // Softened exciter: the old 1 ms attack read as a hard metallic "ping".
        // 10 ms attacks + longer noise burst bow the resonator instead of
        // striking it — same Ringz body, drone-compatible onset.
        exciter = Mix([
            WhiteNoise.ar * EnvGen.ar(Env.perc(0.01, 0.08)),
            SinOsc.ar(freq * (1 + fmD)) * EnvGen.ar(Env.perc(0.01, 0.04))
        ]);

        // Resonator (Klank for metallic resonance) — upper partials darkened
        // (were [1, 0.8, 0.5, 0.3, 0.1]) so the 4–9x partials shimmer instead
        // of dominating
        sig = Ringz.ar(
            exciter,
            freq * [1, 2.32, 4.25, 6.63, 9.38] * (1 + (res * 0.5)),
            [1, 0.55, 0.3, 0.15, 0.06] * (tStretch * 0.5)
        ).sum;

        // Changed from BPF to LPF: BPF at high freq passes almost nothing (silence);
        // LPF at high freq is transparent — sound always passes through.
        sig = LPF.ar(sig, filt.clip(300, 3000));
        // 50 ms swell + longer tail (was 1 ms / 1.5x) — resonance blooms out
        // of the drone bed rather than popping over it
        sig = sig * EnvGen.ar(Env.perc(0.05, 2.5 * tStretch), doneAction: 2);

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
        textureBus=(-1), atmosphereBus=(-1), memoryBus=(-1), harmonicBus=(-1), resonantBus=(-1),
        // Drone/level buses. These existed in the registry and on the control
        // surface but NOTHING read them: \opalDrone did not declare them at all
        // and \elektronBell read them into variables it then discarded, so six
        // sliders (Master Amp, Filter Cutoff, Drone Depth/Fade/Space/Mix) moved
        // a bus that reached no UGen. They shape the drone here.
        masterAmpBus=(-1), filterCutoffBus=(-1),
        droneDepthBus=(-1), droneFadeBus=(-1), droneSpaceBus=(-1), droneMixBus=(-1);

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
        var mAmp  = Select.kr(masterAmpBus >= 0, [0.7, In.kr(masterAmpBus, 1)]);
        var cutoff= Select.kr(filterCutoffBus >= 0, [0.6, In.kr(filterCutoffBus, 1)]);
        var dDepth= Select.kr(droneDepthBus >= 0, [0.3, In.kr(droneDepthBus, 1)]);
        var dFade = Select.kr(droneFadeBus >= 0, [2.0, In.kr(droneFadeBus, 1)]);
        var dSpace= Select.kr(droneSpaceBus >= 0, [0.5, In.kr(droneSpaceBus, 1)]);
        var dLayer= Select.kr(droneMixBus >= 0, [0.5, In.kr(droneMixBus, 1)]);

        var env, sig, mod, sub, grains, delay, quadSig, baseFreq, dry;
        
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
        
        // Drone RLPF: clamp filt BEFORE applying LFNoise multiplier, ceiling 3000Hz.
        // filterCutoff (0–1) now scales the sweep window a further ±1 octave, so
        // it works as a broad tone tilt UNDER spectralShift's absolute setting.
        // Lagged by droneFade so the slider glides instead of stepping.
        sig = RLPF.ar(
            sig,
            LFNoise2.kr(0.05).exprange(filt.clip(80, 3000) * 0.5, filt.clip(80, 3000) * 1.5).clip(80, 4500)
                * Lag.kr(cutoff, dFade).linexp(0, 1, 0.5, 2.0),
            res.linexp(0, 1, 0.9, 0.15)  // rq floor raised to 0.15 — prevents instability at high Q
        );

        // Granular texturizer
        grains = PitchShift.ar(sig, 0.2, 1.0, texD * 0.5, texD * 0.5);
        sig = XFade2.ar(sig, grains, texD.linlin(0, 1, -1, 1));
        dry = sig;

        // Wash effects. droneSpace sizes the room (was hardcoded 0.9).
        delay = CombC.ar(sig, 1.0, LFNoise1.kr(0.1).range(0.2, 0.6), dMix * 4.0) * dMix;
        sig = sig + delay;
        sig = FreeVerb.ar(sig, revM, Lag.kr(dSpace, dFade).linlin(0, 1, 0.15, 0.99), 0.1);

        // Sub low end anchor — droneDepth sets how far the body sinks.
        sub = SinOsc.ar(baseFreq * 0.25) * 0.5 * LPF.ar(sig, 200, mul: 0.5);
        sig = sig + (sub * Lag.kr(dDepth, dFade).linlin(0, 1, 0.15, 2.2));

        // droneMix crossfades the washed/sub layer against the bare oscillator
        // bed, so the slider moves between a dry drone and a fully bloomed one.
        sig = XFade2.ar(dry, sig, Lag.kr(dLayer, dFade).linlin(0, 1, -1, 1));

        sig = sig * env * amp * vol * Lag.kr(mAmp, dFade).linlin(0, 1, 0.05, 1.4) * 0.4;
        
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

    // Create control buses from the canonical registry (0_parameters.scd).
    // Covers all performance rows AND the Cámara Fenológica (CCs 10–16).
    // Alloc and set must stay separate calls (SC 3.13: .set returns nil).
    ~buses = ();  // Reset buses to avoid conflicts

    "Creating control buses...".postln;
    if(~paramDefs.isNil) {
        "0_parameters.scd not loaded — no control buses created!".error;
    } {
        ~paramDefs.do { |def|
            var name = def[\name];
            if(def[\hasBus] ? true) {
                ~buses[name] = Bus.control(s, 1);
                ~buses[name].set(def[\default]);
                "Bus created: % = % (index: %)".format(name, def[\default], ~buses[name].index).postln;
            };
        };
    };

    // Spatial control buses (driven by 12_spatial_gui.scd, not by the
    // MIDI/OSC/HTML surfaces — deliberately outside the registry)
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

    // ── Spawn the master limiter at the tail of the root node ───────────
    // addToTail on RootNode puts it after ~defaultGroup, so it sees everything
    // already summed on the output bus. Freed first so re-running this file
    // during a soundcheck cannot stack limiters.
    if(~masterLimiterSynth.notNil) {
        try { ~masterLimiterSynth.free };
        ~masterLimiterSynth = nil;
    };
    ~masterLimiterSynth = Synth.tail(RootNode(s), \masterLimiter, [\ceiling, 0.92]);
    // Scope sits AFTER the limiter so it reports what actually leaves the box.
    if(~masterScopeSynth.notNil) { try { ~masterScopeSynth.free }; ~masterScopeSynth = nil };
    ~masterScopeSynth = Synth.tail(RootNode(s), \masterScope);
    s.sync;
    "Master limiter active (% ch, ceiling 0.92) — output can no longer clip."
        .format(~limiterChans).postln;

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