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
    // ── Gain budget ─────────────────────────────────────────────────────
    // Measured before this: the master bus ran at outPk 3-6 against a full
    // scale of 1.0, with the limiter holding back 90-98% continuously (gr
    // 0.02-0.11) — compressing constantly instead of catching peaks, which is
    // why the mix read squashed however the layers were balanced.
    //
    // The cause was singular: the pad layer sums LINEARLY with concurrency
    // (20 pads = 1.96, 30 = 2.93) while every other layer was <= 0.17. Pads
    // now get polyphony compensation in sclang (1/sqrt(n), so the layer grows
    // as sqrt(n) instead of n) and the trim below finishes the job.
    //
    // These are MULTIPLIERS on layers that already had a level, not target
    // levels — the distinction matters and the first attempt got it wrong.
    // Writing 0.18 beside a kick measured at 0.10 gives 0.018, which is
    // inaudible under a drone at 0.10; the whole mix came to 0.224 and only
    // the pads could be heard. Each value here is therefore
    // allowance / measured_peak:
    //
    //   drone  0.10 measured -> 1.00  the REFERENCE. The performer has said
    //                                 this layer sounds right, so it is the
    //                                 one thing that must not move; unity is
    //                                 deliberate, not a placeholder.
    //   pads   1.96/20 each  -> 0.30  0.098 * sqrt(24) * 0.30 = 0.144 at the
    //                                 cap, i.e. just above the drone
    //   kick   0.10 measured -> 1.00  unchanged; it now fires once per block,
    //                                 so it has to land when it does
    //   perc   0.17 measured -> 0.45  sits under the drone
    //   dust   0.085 measured-> 0.60  texture, under everything
    //
    // Those ratios set the BALANCE. ~trimMaster sets the absolute level, and
    // it is a separate number because the two were measured separately and
    // fail separately: a wrong ratio makes a layer inaudible, a wrong master
    // makes the limiter a compressor.
    //
    // Measured live, sweeping both performer controls:
    //     vol/amp 0.376  outPk max 1.79      vol/amp 0.70   max 24.3
    //     vol/amp 0.50   outPk max 5.98      vol 1.0/0.85   max 25.8
    // with gr at 0.00-0.04 throughout, i.e. the limiter holding back 96-100%
    // continuously. That is why the level barely responded to the controls:
    // everything above the ceiling was flattened to the same output, so
    // masterVolume and masterAmp had almost no audible range to work in.
    //
    // Calibrated against the CREST, not the average. With a tidal rhythm most
    // samples sit in a trough where little is playing, so the median describes
    // the quiet part of the arc and says nothing about whether the loud part
    // clips — an average-based calibration reads "fine" while the crests are
    // still 4x over. Measured across a full medio arc at vol/amp 0.70:
    //     trimMaster 0.15 -> p90 1.64, max 3.55, gr >= 0.9 only 33% of the time
    // p90 scales linearly with this constant, so 0.15 * (0.8 / 1.64) = 0.073.
    //
    // The absolute output drops relative to what was previously heard — that
    // was a clamped signal pinned near full scale — and the performer takes it
    // back with the level controls, which now actually do something.
    // 0.07 -> 0.055. With the bed raised, the whole mix sat above the ceiling
    // (p90 1.10) and the limiter rode at gr 0.12 — back in the compressor
    // regime this budget exists to avoid. This drops everything ~20% together,
    // which preserves the balance that was just fixed and gives the limiter
    // its headroom back.
    ~trimMaster = 0.055;

    // 1.00 -> 2.40. Measured over a full tidal arc at vol/amp 0.70, the mix was
    // below 0.05 — effectively inaudible — in 48% of windows, with a 340:1
    // crest factor (min 0.005, max 1.72). The calibration had been done on the
    // CREST, which is brief; nothing was holding the floor, so half the piece
    // was silence punctuated by peaks. That is exactly "I cannot hear the
    // synths, drones or bells".
    //
    // The drone is the one continuously-present voice, so it is what the bed
    // has to be made of. Raising it lifts the floor without touching the
    // crest, which is the only move that reduces crest factor rather than
    // just moving the whole thing up into the limiter.
    // 8.0. The arithmetic: the drone measures 0.10 raw, so at ratio 3.10 it
    // reached 3.10 * 0.07 * 0.10 = 0.022 — 40x below the 0.92 ceiling, i.e. a
    // "bed" nobody can hear. At 8.0 it sits near 0.056, about -24 dB from the
    // ceiling, which is a bed you notice is there without it being in front.
    ~trimDrone = 8.00 * ~trimMaster;   // the BED — continuous, holds the floor
    // 0.30 -> 0.20 -> 0.45. The 0.20 pass was a mistake: it optimised the crest
    // factor, and the pads ARE the bells — so lowering them worked directly
    // against "I cannot hear the bells". The crest is the limiter's problem,
    // not the mix's; gr dipping on a pad burst is a limiter doing its job,
    // whereas an inaudible bell layer is a broken instrument.
    ~trimPad   = 0.45 * ~trimMaster;
    ~trimKick  = 1.00 * ~trimMaster;
    ~trimPerc  = 0.45 * ~trimMaster;
    ~trimDust  = 0.60 * ~trimMaster;
    // Field recordings (10_sample_system.scd). Kept in this table rather than
    // beside the sample SynthDef so the whole budget stays readable in one
    // place — a layer that sets its own level somewhere else is exactly how
    // the pad explosion went unnoticed.
    //
    // Derived from MEASUREMENT, not from the nominal amp. The first attempt
    // reasoned from \samplePlayer*'s amp default of 0.7 and set 0.25, on the
    // assumption that a recording at amp 0.7 arrives at 0.7. It does not: a
    // field recording has far lower RMS than a synth voice at the same amp,
    // and the chain then costs it more (HPF, RLPF, FreeVerb2, distance). With
    // the engine ducked and 12 voices held at amp 1.0, the whole layer read
    // outPk 0.005 — under the drone's 0.007, so a call was quieter than the
    // bed it was supposed to speak over.
    //
    // Measured per voice at amp 1.0: ~0.0014 (they sum incoherently, so the
    // layer grows as sqrt(n)). A working chorus is ~5 voices at amp ~0.5, and
    // should sit just above the drone at ~0.012:
    //     0.0014 * sqrt(5) * 0.5 * k = 0.012  ->  k ~ 7.5
    // so 0.25 * 7.5 ~ 1.9. Higher than every other ratio in this table, which
    // is the correct answer for a source that arrives quiet.
    // 1.90 -> 1.55. The ratio was calibrated when a call was cut dead at 1.5 s,
    // so ~5 voices overlapped. With the envelope owning the lifetime a call
    // now sustains its full hold plus release, and the measured concurrency
    // went to 9 — the layer grows as sqrt(n) for incoherent sources, so
    // sqrt(9/5) = 1.34x more energy from the same trim. Measured with slot A
    // live at vol/amp 0.70: outPk p90 0.933, just over the 0.5-0.9 band.
    ~trimSample = 1.55 * ~trimMaster;

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
        // ADSR: sus is the HOLD TIME at susLvl, not a level — the level is
        // susLvl. Defaults keep any caller that does not pass them sounding
        // close to the previous three-stage shape.
        atk=2.0, dec=1.0, sus=0.8, susLvl=0.6, rel=1.5,
        tone=0.3, res=0.4, pan=0, polyComp=1.0,
        // Bus indices for real-time MIDI control (merged parameter set)
        masterVolBus=(-1), pitchBus=(-1), timeBus=(-1), spectralBus=(-1), spatialBus=(-1),
        textureBus=(-1), atmosphereBus=(-1), memoryBus=(-1), harmonicBus=(-1), resonantBus=(-1),
        // Additional drone/noise control buses
        masterAmpBus=(-1), filterCutoffBus=(-1), noiseLevelBus=(-1), noiseFiltBus=(-1),
        droneDepthBus=(-1), droneFadeBus=(-1), droneSpaceBus=(-1), droneMixBus=(-1),
        // Spatial positioning buses
        spatialXBus=(-1), spatialYBus=(-1), roomSizeBus=(-1), distanceEffectBus=(-1),
        // Matrix mixer: this layer's live level (0 = mute, 1 = unity). Named
        // to match the \mixPad bus, so the generic wiring in 6_osc_handlers
        // connects it without the spawn site listing it.
        mixPadBus=(-1);

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
        
        // Apply pitch shift, then HARD-CLAMP the fundamental.
        // ~handleTransaction folds the value-derived pitch below 160 Hz so the
        // pads sit with the drone's sub. The clamp is a backstop placed HERE
        // rather than in sclang, so no control path — MIDI CC 1, the HTML
        // slider, a preset load — can lift the layer out of that register.
        //
        // NOTE on the shift itself: `(x / 12).midiratio` divides by twelve
        // TWICE, because midiratio is already 2**(n/12). pitchShift is
        // documented and specced as ±2 octaves but currently delivers ±1.12x
        // (about two semitones). Left as-is deliberately — correcting it makes
        // the control 12x stronger, which is a musical change, not a fix to
        // make silently mid-session. The clamp above makes it safe to correct
        // whenever wanted. Same pattern exists in \opalDrone.
        freq = (freq * (pitchOffset.clip(-24, 24) / 12).midiratio).clip(28, 180);

        // --- Sustained pad tone (replaces the old percussive cowbell) ---
        // Gentle FM with near-unison ratios (1.0-1.5x) — warm, not metallic.
        // Modulation index halved (0.3 → 0.15): the index scales WITH freq, so
        // at harmonicRich=8 the deviation was ±0.3·freq and the sidebands ran
        // several multiples above the fundamental. Halving keeps the timbre
        // without letting harmonicRich brighten the layer into a bell again.
        mod = SinOsc.ar(freq * harmonicComplexity.linexp(0.1, 8, 1.0, 1.5)) *
              (harmonicComplexity.linlin(0.1, 8, 0.0, 0.15)) * freq;
        carrier = SinOsc.ar(freq + mod);

        // Blend in a soft sub octave and a quiet 5th for body
        sig = carrier * 0.5
            + (SinOsc.ar(freq * 0.5) * 0.3)
            + (SinOsc.ar(freq * 1.5) * 0.1 * harmonicComplexity.linlin(0.1, 8, 0.0, 1.0));

        // ── ADSR ─────────────────────────────────────────────────────────
        // A true four-stage envelope with a HELD sustain, not the previous
        // three-segment ramp ([0,1,0.6,0]) which decayed straight into its
        // release and so had no steady portion at all — every pad was a swell
        // that immediately began dying, which is part of why the layer read as
        // a wash of bells rather than sustained tone.
        //
        //   A  atk        slow fade-in, sine curve
        //   D  dec        settle to the sustain level, exponential-ish
        //   S  sus/susLvl HELD — the body of the pad
        //   R  rel        gentle tail
        //
        // timeStretch (timeDilation) still scales every stage, clamped per
        // stage so a high setting cannot stretch one pad across several bars.
        env = EnvGen.kr(
            Env.new(
                [0, 1, susLvl, susLvl, 0],
                [
                    atk * timeStretch.clip(0.5, 3.0),   // A
                    dec * timeStretch.clip(0.5, 2.0),   // D
                    sus * timeStretch.clip(0.5, 2.0),   // S — held
                    rel * timeStretch.clip(0.5, 1.5)    // R
                ],
                [\sine, -2, 0, -3]
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

        // filterCutoff: broad tone tilt over the whole pad (was read and dropped).
        // Ceiling 12000 → 2600 Hz. At 12 kHz this filter was effectively open
        // and undid the 200–3000 Hz clamp applied earlier in the chain, so FM
        // sidebands and the grain shimmer passed straight through. The pads are
        // a drone bed; nothing in them needs to reach beyond ~2.6 kHz.
        sig = LPF.ar(sig, Lag.kr(legacyFilter, 0.3).linexp(0, 1, 300, 2600));
        // Final safety net, independent of every control: whatever the buses
        // say, this layer does not emit above 3 kHz.
        sig = LPF.ar(sig, 3000);
        
        // Calculate distance-based amplitude scaling
        distance = (spatialX.squared + spatialY.squared).sqrt;
        distanceAmp = 1 - (distance * distanceParam * 0.5);
        
        // Volume: masterVol linear (not squared) so pads aren't buried at mid-knob
        // settings. masterAmp rides on top as the pad-layer trim (also previously
        // read and dropped) — it is the same control the beat engine scales its
        // percussion with, so the two layers now balance from one slider.
        // polyComp is 1/sqrt(live pad count), computed in sclang at spawn —
        // pads are the one layer that sums linearly with concurrency, and at
        // 20-30 voices they alone reached 2-3x full scale while every other
        // layer sat under 0.17.
        sig = sig * (amp * masterVol.clip(0.01, 1) * distanceAmp.clip(0.1, 1)
            * Lag.kr(legacyAmp, 0.3).linlin(0, 1, 0.05, 1.4)) * polyComp * ~trimPad
            * Lag.kr(Select.kr(mixPadBus >= 0, [1.0, In.kr(mixPadBus, 1)]), 0.08);
        
        // Quadraphonic spatial positioning
        // Panner chosen from the REAL output channel count, at graph-build time
        // — see the note on the other voices. This one additionally has a Y
        // coordinate when the spatial GUI (12_spatial_gui.scd) is open, so the
        // quad branch keeps the 2-D angle; no spawn passes spatialYBus, so in
        // normal operation Y is 0 and only spatialX matters.
        quadSig = if(~limiterChans >= 4) {
            PanAz.ar(4, sig.sum,
                Select.kr(spatialYBus >= 0,
                    [spatialX.clip(-1, 1) * 0.5, spatialX.atan2(spatialY) / pi]),
                1, 2, 0.5)
        } {
            Pan2.ar(sig.sum, spatialX.clip(-1, 1))
        };
        
        Out.ar(0, quadSig);
    }).add;

    // --- Fors Opal Emulation Synths ---
    
    // opalKick: Deep FM/Distortion kick (Gem style)
    SynthDef(\opalKick, {
        arg out=0, freq=50, amp=0.5, atk=0.001, dec=0.4,
        masterVolBus=(-1), timeBus=(-1), harmonicBus=(-1), textureBus=(-1), spectralBus=(-1), atmosphereBus=(-1), spatialBus=(-1),
        // Matrix mixer: this layer's live level (0 = mute, 1 = unity).
        mixKickBus=(-1);

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

        sig = sig * env * amp * vol * ~trimKick
            * Lag.kr(Select.kr(mixKickBus >= 0, [1.0, In.kr(mixKickBus, 1)]), 0.08);
        
        // Quadraphonic spatial positioning
        // PanAz's position is already a -1..1 traversal of the ring, which is
        // exactly the range spatialSpread has. The old atan2(x, 0) collapsed
        // to -pi/2, 0 or +pi/2 — three discrete values — so the balance
        // control could only jump hard-left / centre / hard-right and could
        // never fade. Use the value directly.
        // Panner chosen from the REAL output channel count, at graph-build time.
        // The server runs 2-channel; PanAz.ar(4, ...) sent half the ring to
        // channels 2-3, which do not exist, so the sound vanished for half the
        // knob's travel. And PanAz's position is cyclic over 2.0, so pos -1 and
        // +1 both land where pos 0 started — the sweep restarted before either
        // extreme. Pan2 gives a true left/right balance on stereo; on a genuine
        // quad rig PanAz is kept but scaled to half the ring so its two ends
        // are opposite points rather than the same one.
        quadSig = if(~limiterChans >= 4) {
            PanAz.ar(4, sig, spatialX.clip(-1, 1) * 0.5, 1, 2, 0.5)
        } {
            Pan2.ar(sig, spatialX.clip(-1, 1))
        };
        Out.ar(out, quadSig);
    }).add;

    // opalPerc: Physical modeling metallic/woody perc (Mass style)
    SynthDef(\opalPerc, {
        arg out=0, freq=400, amp=0.3, 
        masterVolBus=(-1), harmonicBus=(-1), textureBus=(-1), resonantBus=(-1), spectralBus=(-1), timeBus=(-1),
        memoryBus=(-1), atmosphereBus=(-1), spatialBus=(-1),
        // Matrix mixer: this layer's live level (0 = mute, 1 = unity).
        mixPercBus=(-1);

        var vol   = Select.kr(masterVolBus >= 0, [0.3, In.kr(masterVolBus, 1)]);
        var tStretch= Select.kr(timeBus >= 0, [2.0, In.kr(timeBus, 1)]);
        var filt  = Select.kr(spectralBus >= 0, [1000, In.kr(spectralBus, 1)]);
        var res   = Select.kr(resonantBus >= 0, [0.4, In.kr(resonantBus, 1)]);
        var fmD   = Select.kr(textureBus >= 0, [0.2, In.kr(textureBus, 1)]);
        var dMix  = Select.kr(memoryBus >= 0, [0.3, In.kr(memoryBus, 1)]);
        var revM  = Select.kr(atmosphereBus >= 0, [0.4, In.kr(atmosphereBus, 1)]);
        var spatialX= Select.kr(spatialBus >= 0, [0.0, In.kr(spatialBus, 1)]);

        var exciter, sig, wet, quadSig;

        // HARD-CLAMP the struck frequency, like \elektronBell's fundamental.
        // The caller can ask for almost anything: ~computePitchPool tops out at
        // basePitch(70) x spread(<=1.4) x step(<=7) = 686 Hz, and the TRIAD
        // voicing then multiplies that by (h+1) up to 5 — 3.8 kHz at
        // harmonicRich 8, which is where the high metallic pings came from.
        // Clamped here so every voicing path and every knob position is caught,
        // not just the ones that were thought of at the call site.
        freq = freq.clip(40, 900);

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
        // Fixed backstop, independent of spectralShift: the Ringz body plus the
        // WhiteNoise exciter put energy well above the fundamental, and this
        // layer has no business up there.
        sig = LPF.ar(sig, 2600);
        // 50 ms swell + longer tail (was 1 ms / 1.5x) — resonance blooms out
        // of the drone bed rather than popping over it
        sig = sig * EnvGen.ar(Env.perc(0.05, 2.5 * tStretch), doneAction: 2);

        // Ping-pong delay
        wet = CombC.ar(sig, 0.5, 0.1, 1.5) * dMix;
        sig = sig + wet;
        sig = sig + FreeVerb.ar(sig, revM, 0.8, 0.5);

        sig = sig * amp * vol * ~trimPerc
            * Lag.kr(Select.kr(mixPercBus >= 0, [1.0, In.kr(mixPercBus, 1)]), 0.08);
        
        // PanAz's position is already a -1..1 traversal of the ring, which is
        // exactly the range spatialSpread has. The old atan2(x, 0) collapsed
        // to -pi/2, 0 or +pi/2 — three discrete values — so the balance
        // control could only jump hard-left / centre / hard-right and could
        // never fade. Use the value directly.
        // Panner chosen from the REAL output channel count, at graph-build time.
        // The server runs 2-channel; PanAz.ar(4, ...) sent half the ring to
        // channels 2-3, which do not exist, so the sound vanished for half the
        // knob's travel. And PanAz's position is cyclic over 2.0, so pos -1 and
        // +1 both land where pos 0 started — the sweep restarted before either
        // extreme. Pan2 gives a true left/right balance on stereo; on a genuine
        // quad rig PanAz is kept but scaled to half the ring so its two ends
        // are opposite points rather than the same one.
        quadSig = if(~limiterChans >= 4) {
            PanAz.ar(4, sig, spatialX.clip(-1, 1) * 0.5, 1, 2, 0.5)
        } {
            Pan2.ar(sig, spatialX.clip(-1, 1))
        };
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
        droneDepthBus=(-1), droneFadeBus=(-1), droneSpaceBus=(-1), droneMixBus=(-1),
        delayFeedbackBus=(-1),
        // Matrix mixer: this layer's live level (0 = mute, 1 = unity).
        mixDroneBus=(-1);

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
        var dFeed = Select.kr(delayFeedbackBus >= 0, [0.3, In.kr(delayFeedbackBus, 1)]);

        var env, sig, mod, sub, grains, delay, quadSig, baseFreq, dry;
        
        env = EnvGen.kr(Env.asr(4.0, 1.0, 6.0), gate, doneAction: 2);
        
        // Pitch mapping.
        //
        // freq is LAGGED. The beat engine re-pitches this drone every four bars
        // (5_beat_engine.scd walks #[55, 62, 73, 82, 49, 65, 55, 41] on the
        // phrase counter), which at the usual tempo lands about every 45–50 s,
        // and it did it with a bare .set — so a drone that had been holding one
        // note for the better part of a minute stepped a fifth or a sixth
        // instantly. On a continuous voice that reads as a fault rather than a
        // change. Now it glides.
        //
        // The glide time rides droneFade, like every other continuous control
        // in this SynthDef, so the same fader that sets how the filter and the
        // space breathe also sets how far the pitch slides — 0.1 s is nearly
        // the old step, 5 s is a portamento that takes a tenth of the phrase.
        // Doubled because a pitch move wants noticeably longer than a filter
        // move to stop sounding like an edit.
        baseFreq = Lag.kr(freq, (dFade * 2.0).clip(0.2, 10.0))
            * (pShift.clip(-24, 24) / 12).midiratio;
        
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
        // delayFeedback now owns the CombC decay time. It had ZERO references
        // in any SynthDef — the one genuinely dead control on the surface. The
        // decay was hard-wired to dMix*4, so memoryFeed set both the send level
        // AND the tail; memoryFeed keeps the level, delayFeedback gets the tail.
        // 0.2 s to 9 s: at the top the comb sings and the drone grows a rhythm
        // of its own, which is what makes the control audible on its own.
        delay = CombC.ar(sig, 1.0, LFNoise1.kr(0.1).range(0.2, 0.6),
            Lag.kr(dFeed, 0.2).linexp(0, 1, 0.2, 9.0)) * dMix;
        sig = sig + delay;
        // droneSpace: room AND width. Room alone (0.15-0.99) moved one FreeVerb
        // coefficient and was nearly inaudible; widening the image is what the
        // control reads as. Room floor lifted so the top of the range is a
        // genuinely large space.
        sig = FreeVerb.ar(sig, revM, Lag.kr(dSpace, dFade).linlin(0, 1, 0.30, 0.99), 0.1);

        // Sub low end anchor — droneDepth sets how far the body sinks.
        sub = SinOsc.ar(baseFreq * 0.25) * 0.5 * LPF.ar(sig, 200, mul: 0.5);
        sig = sig + (sub * Lag.kr(dDepth, dFade).linlin(0, 1, 0.15, 2.2));

        // droneMix crossfades the washed/sub layer against the bare oscillator
        // bed, so the slider moves between a dry drone and a fully bloomed one.
        // droneMix: full traverse dry <-> bloomed. XFade2's -1..1 was already
        // the full range, but the two ends were too alike to hear because the
        // "wet" side had only the delay and reverb on it; the sub now rides the
        // wet side too (see above), so the ends genuinely differ.
        sig = XFade2.ar(dry, sig, Lag.kr(dLayer, dFade).linlin(0, 1, -1, 1));

        // droneFade: an audible slow swell, not only a glide time. It still
        // sets the Lag of every other drone control above, but on its own it
        // was the one knob on the surface that could not be heard at all —
        // moving it changed how fast OTHER knobs took effect and nothing else.
        // Longer fade = slower, deeper breathing of the whole drone body.
        sig = sig * SinOsc.kr(
            Lag.kr(dFade, 0.5).linexp(0.1, 5.0, 0.6, 0.045),   // 0.6 Hz -> 0.045 Hz
            0,
            dFade.linlin(0.1, 5.0, 0.04, 0.30),                // depth grows with fade
            1
        );

        sig = sig * env * amp * vol * Lag.kr(mAmp, dFade).linlin(0, 1, 0.05, 1.4) * ~trimDrone
            * Lag.kr(Select.kr(mixDroneBus >= 0, [1.0, In.kr(mixDroneBus, 1)]), 0.08);
        
        // Same fix as the other voices; the slow LFNoise wander stays on top.
        // Panner chosen from the REAL output channel count, at graph-build time.
        // The server runs 2-channel; PanAz.ar(4, ...) sent half the ring to
        // channels 2-3, which do not exist, so the sound vanished for half the
        // knob's travel. And PanAz's position is cyclic over 2.0, so pos -1 and
        // +1 both land where pos 0 started — the sweep restarted before either
        // extreme. Pan2 gives a true left/right balance on stereo; on a genuine
        // quad rig PanAz is kept but scaled to half the ring so its two ends
        // are opposite points rather than the same one.
        quadSig = if(~limiterChans >= 4) {
            PanAz.ar(4, sig, (spatialX.clip(-1, 1) * 0.5)
                + LFNoise1.kr(0.05).range(-0.2, 0.2), 1, 2, 0.5)
        } {
            Pan2.ar(sig, (spatialX.clip(-1, 1) + LFNoise1.kr(0.05).range(-0.15, 0.15)).clip(-1, 1))
        };
        Out.ar(out, quadSig);
    }).add;

    // opalDust: Crackly granular noise (Dust style)
    SynthDef(\opalDust, {
        arg out=0, amp=0.2,
        masterVolBus=(-1), textureBus=(-1), spectralBus=(-1), timeBus=(-1), pitchBus=(-1),
        memoryBus=(-1), atmosphereBus=(-1), spatialBus=(-1),
        // Matrix mixer: this layer's live level (0 = mute, 1 = unity).
        mixDustBus=(-1);

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
        // Dust2 is broadband by construction — this is the sparkle/hiss at the
        // top of the mix. Fixed backstop so no knob position can open it up.
        sig = LPF.ar(sig, 2200);
        
        // Delay + Reverb wash
        wet = CombC.ar(sig, 0.5, 0.15, 2.0) * dMix;
        sig = sig + wet;
        sig = sig + FreeVerb.ar(sig, revM, 0.8, 0.5);

        // The "* 2.0 volume compensation" is gone. Dust is the brightest layer
        // in the mix and this doubled it on the way out, against a master bus
        // that was already running 3-6x over full scale. Gain budget for this
        // layer is 0.08 — crackle as occasional texture, not a constant rain.
        sig = sig * env * amp * vol * ~trimDust
            * Lag.kr(Select.kr(mixDustBus >= 0, [1.0, In.kr(mixDustBus, 1)]), 0.08);
        
        // PanAz's position is already a -1..1 traversal of the ring, which is
        // exactly the range spatialSpread has. The old atan2(x, 0) collapsed
        // to -pi/2, 0 or +pi/2 — three discrete values — so the balance
        // control could only jump hard-left / centre / hard-right and could
        // never fade. Use the value directly.
        // Panner chosen from the REAL output channel count, at graph-build time.
        // The server runs 2-channel; PanAz.ar(4, ...) sent half the ring to
        // channels 2-3, which do not exist, so the sound vanished for half the
        // knob's travel. And PanAz's position is cyclic over 2.0, so pos -1 and
        // +1 both land where pos 0 started — the sweep restarted before either
        // extreme. Pan2 gives a true left/right balance on stereo; on a genuine
        // quad rig PanAz is kept but scaled to half the ring so its two ends
        // are opposite points rather than the same one.
        quadSig = if(~limiterChans >= 4) {
            PanAz.ar(4, sig, spatialX.clip(-1, 1) * 0.5, 1, 2, 0.5)
        } {
            Pan2.ar(sig, spatialX.clip(-1, 1))
        };
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