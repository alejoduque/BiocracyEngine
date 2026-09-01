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
    // 0.055 -> 0.115. That 0.055 was calibrated when the master chain was a
    // limiter and nothing else, where the only way to keep the limiter out of
    // the compressor regime was to run the whole mix far beneath it. Measured
    // consequence: the full mix sat at an RMS median of 0.024, which is -32 dB
    // from the ceiling. That is the "thin, small, no weight" directly — and it
    // also meant any master processing set for a normal level did nothing at
    // all, because the signal never reached its threshold.
    //
    // There is a proper glue compressor in front of the limiter now, which is
    // the stage that is supposed to handle peaks, so the mix can sit where a
    // mix belongs and the limiter goes back to being a safety net rather than
    // the thing setting the level.
    ~trimMaster = 0.115;

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
    ~trimDrone = 3.20 * ~trimMaster;   // the BED — continuous, holds the floor
    ~trimPad   = 0.65 * ~trimMaster;   // PADS / BELLS — harmonic resonance over the bed
    ~trimKick  = 0.35 * ~trimMaster;   // KICK — calibrated so 0.040 is ~80% of peak level
    // PERCUSSION — china/trash cymbal. Cut from 0.08 because the voice moved
    // its energy from under 850 Hz up into 5-13 kHz, which is the ear's most
    // sensitive band: the same acoustic power there is perceived roughly 8-10
    // dB louder. At the old trim the china buried the mix. This matters beyond
    // the layer itself — the glue compressor (see ~masterLimiter) keys off the
    // SUMMED signal, so an over-loud china pumps the drone and pad too.
    // 0.08 -> 0.032 -> 0.075. The cut to 0.032 was made on an ESTIMATE that
    // moving the china's energy into 5-13 kHz would gain 8-10 dB of perceived
    // loudness. Measured by ear it did not: at 0.032 the layer sat ~26 dB under
    // the pad and was simply inaudible. Back to roughly the old value, a touch
    // under it to acknowledge the china really is brighter than the wooden
    // voice it replaced. Set by listening, not by arithmetic.
    ~trimPerc  = 0.075 * ~trimMaster;
    // The bed is the ensemble now, so the ONE continuous voice steps back from
    // 8.0 to 3.2 and the partials carry the rest. Its job is the sub anchor
    // under them rather than the whole bed on its own.
    // Raised 3.4 -> 13.0 because the bed now carries the bottom on its own.
    // \opalDrone contributed an effective 0.2944 and the five-partial bed
    // 0.0526; removing the former without this would drop the drone layer by
    // about 15 dB and leave the mix with no floor at all.
    ~trimDronePartial = 13.0 * ~trimMaster;
    // DUST — granular crackle / hojarasca texture. Raised 0.75 -> 1.05: the
    // grains are short and broadband, which is the easiest thing in the mix for
    // a sustained voice to mask, and they were disappearing under the pad bed.
    // The pad fix removes most of that masking; this makes the layer legible
    // on its own terms rather than depending on it.
    ~trimDust  = 1.05 * ~trimMaster;
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
    // ─── Master chain: glue, then weight, then safety ────────────────────
    // This was sum -> LeakDC -> Limiter and nothing else. A limiter is a safety
    // net: it can stop a mix being too loud and can do nothing whatever about a
    // mix being thin. With the measured 340:1 crest factor the peaks set the
    // ceiling and everything sustained sat far beneath them — the bed measures
    // about -24 dB from the ceiling — which is the definition of small.
    //
    // Two stages in front of it, in the order a mastering chain uses them:
    //
    //  · GLUE. A slow bus compressor keyed off the mono sum, so the layers duck
    //    each other rather than each being ridden alone. This raises the
    //    AVERAGE without touching the crest, and average is what is heard as
    //    weight. Slow on purpose (0.6 s release) so it breathes with the tidal
    //    arc rather than pumping against it.
    //
    //  · SATURATION. tanh, mixed rather than replacing. Low-order harmonics
    //    read as body, and a soft curve rounds the leading edge of the supersaw
    //    and the Dust crackle — which is most of where "buzzy and digital"
    //    lives. A limiter squares those edges; this does not.
    //
    // Both default modest rather than off, so an untouched boot is warmer and
    // fuller rather than differently balanced. drive 0 is the clean path
    // exactly, so the stage can be removed entirely.
    SynthDef(\masterLimiter, { |ceiling = 0.92, glue = 0.55, drive = 0.40|
        var sig = In.ar(0, ~limiterChans);
        var clean = LeakDC.ar(sig);
        var key = Mix(clean) / ~limiterChans.max(1);
        var comped, sat, lim, mono;

        // slopeAbove 1.0 is no compression, 0.35 is about 3:1; glue rides
        // between them so the amount is one number. Makeup is derived from that
        // same number rather than given its own control, because the two only
        // ever move together and a second knob is a way for them to disagree.
        comped = Compander.ar(clean, key,
            // Where the signal ACTUALLY sits, measured, not where a mix is
            // conventionally assumed to sit: at p90 the mix reaches about 0.5
            // and its median is an order of magnitude below that, so a 0.22
            // threshold was never crossed by anything but the crest.
            thresh: 0.10,
            slopeBelow: 1.0,
            slopeAbove: glue.linlin(0, 1, 1.0, 0.35),
            clampTime: 0.02,
            relaxTime: 0.6
        ) * glue.linlin(0, 1, 1.0, 1.9);

        sat = (comped * (1 + (drive * 2.2))).tanh / (1 + (drive * 0.9));
        sig = XFade2.ar(comped, sat, drive.linlin(0, 1, -1, 1));

        lim = Limiter.ar(sig, ceiling, 0.01);
        mono = Mix(clean) / ~limiterChans.max(1);
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
    // ─── Spectrum analysis, at a resolution you can draw with ──────────────
    // 16 bands was enough to tint a spectrogram and is not enough to draw a
    // LINE with: a ridgeline needs enough points across its width to wiggle,
    // and sixteen gives a shape with fifteen corners. 48 log-spaced bands over
    // the same 40 Hz - 10 kHz span.
    //
    // Safe to widen: every consumer reads the array's own length rather than
    // assuming 16 — publishScAudio and bandRange in scAudio.ts both use
    // bands.length, and the spectrogram's scBins interpolates from src.length,
    // so it simply gets a better source to resample.
    ~scopeBands = 48;
    SynthDef(\masterScope, {
        var sig = Mix(In.ar(0, ~limiterChans)) / ~limiterChans.max(1);
        var bands = Array.geom(~scopeBands, 40, (10000 / 40) ** (1 / (~scopeBands - 1)));
        SendReply.kr(Impulse.kr(20), '/spectrum',
            bands.collect { |f| Amplitude.kr(BPF.ar(sig, f, 0.4), 0.01, 0.12) });
    }).add;

    // The same analysis over the CORPUS bus alone, so the laser can draw the
    // forest's own voice rather than the whole engine's. Takes its input bus as
    // an argument because ~corpusProcBus does not exist until
    // 17_chain_processing.scd has loaded, which is long after this file.
    // chans is captured at BUILD time, not taken as an argument: In.ar needs its
    // channel count as a literal when the graph is compiled, and passing a
    // Control gives "numChannels must be a nonzero positive integer, but
    // received (an OutputProxy)". That error aborted the rest of this block, so
    // \dronePartial and \opalPerc were never defined either — one bad def took
    // the engine's voices with it.
    SynthDef(\corpusScope, { |in = 0|
        var chans = (~limiterChans ? 2);
        var sig = Mix(In.ar(in, chans)) / chans.max(1);
        var bands = Array.geom(~scopeBands, 40, (10000 / 40) ** (1 / (~scopeBands - 1)));
        SendReply.kr(Impulse.kr(20), '/spectrum/corpus',
            bands.collect { |f| Amplitude.kr(BPF.ar(sig, f, 0.4), 0.01, 0.12) });
    }).add;

    // Main transaction bell with MIDI control
    SynthDef(\elektronBell, {
        // out: the only voice on the surface that hard-wired Out.ar(0, ...).
        // Every other SynthDef takes an out bus, and without one this layer
        // could not be routed, metered or rendered anywhere except the main
        // output — which is how it went unmeasured while it was the layer that
        // sounded wrong. Defaults to 0, so nothing about the running instrument
        // changes.
        arg out=0, freq=440, amp=0.3,
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

        var env, sig, mod, carrier, grains, wet, noise, distance, distanceAmp, quadSig, innerMod;
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

        // --- Sustained pad tone ---
        // NESTED FM, three deep, after the single near-unison modulator this
        // had was judged dull. One modulator at 1.0-1.5x the carrier can only
        // produce a narrow, static sideband pair — warm, and the same warmth
        // every time. Nesting a second modulator inside the first makes the
        // sideband structure itself move, and putting a slow LFNoise on the
        // innermost frequency means it never settles: the spectrum drifts over
        // tens of seconds while the pitch stays exactly where it was put.
        //
        // The register is unchanged. freq is still folded to 28-180 Hz above,
        // so this is a low sustained tone with a moving spectrum, not a bell —
        // harmonicRich still opens it and the modulation index is still scaled
        // so the top of that fader cannot brighten the layer into one.
        innerMod = SinOsc.ar(
            LFNoise2.kr(0.05).exprange(freq * 0.5, freq * 3.2),
            0,
            harmonicComplexity.linlin(0.1, 8, 0.5, 6.0)
        );
        mod = SinOsc.ar(
            freq * harmonicComplexity.linexp(0.1, 8, 1.0, 1.5) * (1 + (innerMod * 0.03)),
            innerMod * 0.4
        ) * (harmonicComplexity.linlin(0.1, 8, 0.0, 0.15)) * freq;
        carrier = SinOsc.ar(freq + mod);

        // Blend in a soft sub octave and a quiet 5th for body. The 5th gets a
        // slow detune so two pads a few seconds apart beat against each other
        // instead of stacking into one motionless chord.
        sig = carrier * 0.5
            + (SinOsc.ar(freq * 0.5) * 0.3)
            + (SinOsc.ar(freq * 1.5 * LFNoise2.kr(0.04).range(0.997, 1.003))
                * 0.1 * harmonicComplexity.linlin(0.1, 8, 0.0, 1.0));

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
        
        Out.ar(out, quadSig);
    }).add;

    // --- Fors Opal Emulation Synths ---
    
    // opalKick: Deep FM/Distortion kick (Gem style)
    SynthDef(\opalKick, {
        arg out=0, freq=50, amp=0.5, atk=0.001, dec=0.4,
        masterVolBus=(-1), timeBus=(-1), harmonicBus=(-1), textureBus=(-1), spectralBus=(-1), atmosphereBus=(-1), spatialBus=(-1),
        // Reach added so this voice can be sculpted rather than only triggered.
        // Every one of these had a fader on the surface that stopped at the
        // drone and the pad; a struck voice with three shaping controls is a
        // sample, not an instrument.
        pitchBus=(-1), memoryBus=(-1), resonantBus=(-1),
        filterCutoffBus=(-1), noiseLevelBus=(-1), noiseFiltBus=(-1),
        droneDepthBus=(-1), droneFadeBus=(-1),
        // Matrix mixer: this layer's live level (0 = mute, 1 = unity, 2 = max) + cross-layer modulation
        mixKickBus=(-1), mixPercBus=(-1), mixDustBus=(-1);

        var vol   = Select.kr(masterVolBus >= 0, [0.3, In.kr(masterVolBus, 1)]);
        var tStretch= Select.kr(timeBus >= 0, [2.0, In.kr(timeBus, 1)]);
        var fmR   = Select.kr(harmonicBus >= 0, [1.0, In.kr(harmonicBus, 1)]);
        var fmD   = Select.kr(textureBus >= 0, [0.2, In.kr(textureBus, 1)]);
        var filt  = Select.kr(spectralBus >= 0, [1000, In.kr(spectralBus, 1)]);
        var revM  = Select.kr(atmosphereBus >= 0, [0.4, In.kr(atmosphereBus, 1)]);
        var spatialX= Select.kr(spatialBus >= 0, [0.0, In.kr(spatialBus, 1)]);
        var pShift= Select.kr(pitchBus >= 0, [0.0, In.kr(pitchBus, 1)]);
        var dMix  = Select.kr(memoryBus >= 0, [0.3, In.kr(memoryBus, 1)]);
        var res   = Select.kr(resonantBus >= 0, [0.4, In.kr(resonantBus, 1)]);
        var cutoff= Select.kr(filterCutoffBus >= 0, [0.6, In.kr(filterCutoffBus, 1)]);
        var nLevel= Select.kr(noiseLevelBus >= 0, [0.1, In.kr(noiseLevelBus, 1)]);
        var nFilt = Select.kr(noiseFiltBus  >= 0, [0.5, In.kr(noiseFiltBus, 1)]);
        var dDepth= Select.kr(droneDepthBus >= 0, [0.3, In.kr(droneDepthBus, 1)]);
        var dFade = Select.kr(droneFadeBus  >= 0, [2.0, In.kr(droneFadeBus, 1)]);

        // ─── Cross-layer acoustic modulation ──────────────────────────────
        // Perc and Dust dynamically influence the kick's beater attack and decay
        var percLvl = Select.kr(mixPercBus >= 0, [1.0, In.kr(mixPercBus, 1)]);
        var dustLvl = Select.kr(mixDustBus >= 0, [1.0, In.kr(mixDustBus, 1)]);

        var env, pitchEnv, sig, mod, quadSig, click, sub;

        // Dust adds granular micro-texture to kick beater attack
        nLevel = (nLevel * dustLvl.linlin(0, 2, 0.6, 1.4)).clip(0, 1);
        fmD    = (fmD * dustLvl.linlin(0, 2, 0.7, 1.3)).clip(0, 1);
        // Perc fader tightens kick decay so kick stays punchy when perc is active
        dec    = dec * percLvl.linlin(0, 2, 1.15, 0.8);
        
        env = EnvGen.ar(Env.perc(atk, dec * tStretch, 1, -4), doneAction: 2);
        // Grounded sub-bass pitch envelope: drops smoothly from punchy low-mid (2.2x) to fundamental
        // Never climbs into high frequencies or laser pitch drops
        pitchEnv = EnvGen.ar(Env(
            [freq * 2.2, freq * 1.05, freq * 0.8] * (pShift.clip(-12, 12) / 12).midiratio,
            [0.025, dec * tStretch], \exp)).clip(25, 180);

        mod = SinOsc.ar(pitchEnv * fmR.linexp(0.1, 8, 0.5, 2.0)) * (fmD * 0.25) * pitchEnv;
        sig = SinOsc.ar(pitchEnv + mod);

        // Soft acoustic beater transient — bandpassed pink noise, no high hiss
        click = BPF.ar(
            PinkNoise.ar * EnvGen.ar(Env.perc(0.001, 0.015 + (nFilt * 0.02), 1, -6)),
            (110 + (nFilt * 350)).clip(80, 500), 0.7);
        sig = sig + (click * nLevel.linlin(0, 0.5, 0.0, 0.75));

        // Distortion & Filter (Warm low-end drive)
        sig = (sig * (1 + (fmD * 2.5))).tanh;
        // Kick LPF: strictly capped at 280 Hz so kick remains a warm sub anchor
        sig = RLPF.ar(sig,
            (filt.clip(80, 240) * Lag.kr(cutoff, dFade.clip(0.1, 5)).linexp(0, 1, 0.7, 1.3))
                .clip(50, 280),
            res.linexp(0, 1, 0.85, 0.4));

        // droneDepth reaches the kick's own body: a sine an octave under the
        // drop, which is the difference between a click and something you feel.
        sub = SinOsc.ar(pitchEnv * 0.5) * dDepth.linlin(0, 1, 0.0, 0.85);
        sig = sig + sub;

        // Reverb tail and slap
        sig = sig + DelayC.ar(sig, 0.25, 0.055 + (dMix * 0.08), dMix * 0.35);
        sig = sig + FreeVerb.ar(sig, revM * 0.35, 0.6, 0.2);

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
        // bodySeed 0-1: which body is being struck. Supplied by the caller,
        // not by a knob — see the note at the partials below.
        arg out=0, freq=400, amp=0.3, bodySeed=0.0, 
        masterVolBus=(-1), harmonicBus=(-1), textureBus=(-1), resonantBus=(-1), spectralBus=(-1), timeBus=(-1),
        memoryBus=(-1), atmosphereBus=(-1), spatialBus=(-1),
        // Reach added: pitch so the struck body tunes with the engine, the two
        // noise controls so the exciter can be shaped, filterCutoff as a tilt
        // under spectralShift, delayFeedback for the comb tail, droneFade as
        // the smoothing time. Six faders that stopped at the drone.
        pitchBus=(-1), filterCutoffBus=(-1), noiseLevelBus=(-1), noiseFiltBus=(-1),
        delayFeedbackBus=(-1), droneFadeBus=(-1),
        // Matrix mixer: this layer's live level (0 = mute, 1 = unity).
        mixPercBus=(-1), mixDustBus=(-1), mixPadBus=(-1), mixKickBus=(-1), mixSampleBus=(-1),
        // ─── Parameter locks ────────────────────────────────────────────────
        // These were CONSTANTS inside the Select.kr fallbacks below, which meant
        // a trig had no way to carry its own values: every hit read the same
        // knobs and therefore sounded like every other hit, whatever the chain
        // had chosen for its pitch. As arguments they become p-locks in the
        // Octatrack sense — the beat engine hands each strike a full parameter
        // set and passes -1 for the matching bus, so that one hit ignores the
        // knob and takes the chain's value instead.
        texture = 0.2, resonance = 0.4, noiseF = 0.5, noiseL = 0.1,
        delayFb = 0.3, timeStr = 2.0, memory = 0.3;

        var vol   = Select.kr(masterVolBus >= 0, [0.3, In.kr(masterVolBus, 1)]);
        var tStretch= Select.kr(timeBus >= 0, [timeStr, In.kr(timeBus, 1)]);
        var filt  = Select.kr(spectralBus >= 0, [1000, In.kr(spectralBus, 1)]);
        var res   = Select.kr(resonantBus >= 0, [resonance, In.kr(resonantBus, 1)]);
        var fmD   = Select.kr(textureBus >= 0, [texture, In.kr(textureBus, 1)]);
        var dMix  = Select.kr(memoryBus >= 0, [memory, In.kr(memoryBus, 1)]);
        var revM  = Select.kr(atmosphereBus >= 0, [0.4, In.kr(atmosphereBus, 1)]);
        var spatialX= Select.kr(spatialBus >= 0, [0.0, In.kr(spatialBus, 1)]);
        var pShift= Select.kr(pitchBus >= 0, [0.0, In.kr(pitchBus, 1)]);
        var cutoff= Select.kr(filterCutoffBus >= 0, [0.6, In.kr(filterCutoffBus, 1)]);
        var nLevel= Select.kr(noiseLevelBus >= 0, [noiseL, In.kr(noiseLevelBus, 1)]);
        var nFilt = Select.kr(noiseFiltBus  >= 0, [noiseF, In.kr(noiseFiltBus, 1)]);
        var dFeed = Select.kr(delayFeedbackBus >= 0, [delayFb, In.kr(delayFeedbackBus, 1)]);
        var dFade = Select.kr(droneFadeBus  >= 0, [2.0, In.kr(droneFadeBus, 1)]);
        // harmonicBus was DECLARED on this SynthDef and never read into
        // anything — a dead argument. It drives the decay tilt below now.
        var fmR   = Select.kr(harmonicBus >= 0, [1.0, In.kr(harmonicBus, 1)]);

        // ─── Cross-layer acoustic modulation ──────────────────────────────
        // Percussion dynamically reacts to Dust, Pad, Kick and Sample levels across full fader travel (0..2)
        var dustLvl   = Select.kr(mixDustBus   >= 0, [1.0, In.kr(mixDustBus, 1)]);
        var padLvl    = Select.kr(mixPadBus    >= 0, [1.0, In.kr(mixPadBus, 1)]);
        var kickLvl   = Select.kr(mixKickBus   >= 0, [1.0, In.kr(mixKickBus, 1)]);
        var sampleLvl = Select.kr(mixSampleBus >= 0, [1.0, In.kr(mixSampleBus, 1)]);

        var exciter, sig, wet, quadSig, partials, decays, inharm, damp, spread;
        var shimmer, bend, shaped;

        // Clamped fundamental in the warm wooden/gong range (35..320 Hz)
        // China/trash cymbals speak from a much higher plate than the wooden
        // body this used to be. The caller still pre-clips to 260-340
        // (5_beat_engine.scd), which becomes the STRUCK size; the ceiling here
        // only has to stop slot 6 (clips to 900) being re-clamped.
        freq = (freq * (pShift.clip(-12, 12) / 12).midiratio).clip(60, 950);

        // Acoustic wood/mallet exciter with subtle granular micro-variation
        // Stick on thin bronze: a very fast, very bright contact. The old
        // exciter was a soft mallet — 3 ms of low Dust plus a 200-1800 Hz
        // noise burst — which cannot start a china no matter what resonates
        // after it. This is broadband and high, and it is what makes the
        // attack read as metal being hit rather than wood being tapped.
        exciter = Mix([
            Dust2.ar(3000 + (nLevel * 12000))
                * EnvGen.ar(Env.perc(0.0002, 0.010 + (nFilt * 0.02))) * 1.2,
            HPF.ar(WhiteNoise.ar, 2500 + (nFilt * 4000))
                * EnvGen.ar(Env.perc(0.0002, 0.006 + (nFilt * 0.012)))
                * nLevel.linlin(0, 0.5, 0.5, 1.6),
            BPF.ar(PinkNoise.ar, (900 + (nFilt * 3500)).clip(400, 6000), 0.6)
                * EnvGen.ar(Env.perc(0.002, 0.05 + (nFilt * 0.09)))
                * nLevel.linlin(0, 0.5, 0.4, 1.3)
        ]);

        // Resonator modes with warm inharmonic stiffness
        inharm = res.linexp(0.1, 0.8, 0.004, 0.20);
        damp = fmR.linexp(0.1, 5.0, 3.5, 1.2);
        spread = fmD.linlin(0, 0.6, 0.0, 0.10);

        // A china is a CROWDED plate: many closely-spaced, strongly inharmonic
        // modes whose beating against each other is the trash. The old set was
        // five widely-spaced stiff-bar partials (n*sqrt(1+B n^2)) — the formula
        // for a xylophone bar, which is exactly why it read as wood.
        //
        // 14 modes on an irregular ladder, deliberately NOT integer-related:
        // each step is an irrational-ish stride so no two modes ever lock into
        // a harmonic interval and the sum never resolves into a pitch.
        partials = Array.fill(14, { |i|
            var n = i + 1;
            var dev = 1 + ((bodySeed * (n + 3) * 7.13).sin * spread * (1 + (i * 0.15)));
            // 1.0, 1.51, 2.09, 2.73, 3.42 ... widening as it climbs.
            var ratio = 1.0 + (n.pow(1.32) * 0.51) + (inharm * n * n * 0.06);
            (ratio * dev).clip(1.0, 26.0);
        });
        // Trash decay: short, and the top of the plate dies first, so the
        // stroke collapses from a splash into a rattle rather than ringing on.
        decays = Array.fill(14, { |i|
            var n = i + 1;
            ((damp.neg * n.log).exp * (tStretch * 0.20)).clip(0.02, 2.4);
        });

        // 16 kHz, not 1400 Hz — with a 260 Hz strike the 14th mode lands near
        // 6 kHz, and that top octave IS the china. Normalised by mode count so
        // widening the bank does not simply make it louder.
        sig = Ringz.ar(exciter, (freq * partials).clip(40, 16000), decays).sum
            * 14.sqrt.reciprocal * 2.4;

        // The trash. A china's signature is a wide, unstable band of noise
        // sitting ON TOP of the modes, sweeping as the plate wobbles. The
        // previous version deliberately caged this at 650 Hz to kill a "9 kHz
        // scream"; for a china that band is not a defect, it is the instrument.
        // Two detuned bands beating against one another so it never sits still.
        shimmer = Mix([
            BPF.ar(exciter, (freq * 7.0 * LFNoise1.kr(5.5).range(0.86, 1.18))
                .clip(600, 13000), 0.09),
            BPF.ar(exciter, (freq * 11.5 * LFNoise1.kr(3.1).range(0.90, 1.12))
                .clip(900, 15000), 0.07)
        ]) * 5 * res.linlin(0.1, 0.8, 0.5, 1.4);
        sig = sig + (shimmer * fmD.linlin(0, 1, 0.35, 1.05));

        // Doppler comb tail
        bend = CombC.ar(sig * 0.35, 0.35,
            LFNoise1.kr(0.4 + (bodySeed * 2)).range(0.01, 0.15).clip(0.005, 0.25),
            dFeed.linlin(0, 0.8, 0.2, 2.0));
        sig = sig + (LeakDC.ar(bend.tanh) * dMix.linlin(0, 1, 0.3, 0.8));

        // Saturation. tanh across the whole band for the metallic bite, plus a
        // SMALL sine fold on a band-limited copy for the clangour.
        //
        // The fold is deliberately fed from a 5 kHz lowpass: SinOsc-as-
        // waveshaper folds, and folding this much 10 kHz+ energy at 48 kHz
        // would alias straight back down as an inharmonic whistle. Lowpassing
        // first keeps every fold product under Nyquist.
        shaped = (sig * fmD.linlin(0, 1, 1.4, 4.2)).tanh
            / (1 + (fmD * 0.3));
        sig = XFade2.ar(sig, shaped, fmD.linlin(0, 1, -0.4, 0.9));
        sig = sig + (SinOsc.ar(0, LPF.ar(sig, 5000) * fmD.linlin(0, 1, 0.7, 2.6))
            * fmD.linlin(0, 1, 0.08, 0.34));
        sig = LeakDC.ar(sig);

        // Brightness as a TILT, not a wall. The old pair of lowpasses capped
        // this voice at 850 Hz by two independent mechanisms — the second one
        // fixed and unreachable by any control — which is what made a bank of
        // metal resonators come out sounding like a wood block. A china lives
        // almost entirely above that line.
        sig = LPF.ar(sig,
            (filt.clip(400, 11000)
                * Lag.kr(cutoff, dFade.clip(0.1, 5)).linexp(0, 1, 0.55, 1.9))
                .clip(700, 17000));
        // High shelf instead of a backstop: tames the very top without
        // removing it, so the plate stays bronze rather than turning to glass.
        sig = BHiShelf.ar(sig, 7000, 1.0, -3.5);
        // The plate has no fundamental down here; this only stops the comb and
        // reverb accumulating sub-bass that the master compressor would key on.
        sig = HPF.ar(sig, 180);

        // 1 ms attack — 30 ms is a mallet on wood. Curve -4.5 so it collapses
        // fast then rattles out, which is the china's shape. Clipped so a large
        // timeDilation cannot produce a synth that never frees.
        sig = sig * EnvGen.ar(
            Env.perc(0.001, (0.9 * tStretch).clip(0.25, 5.0), 1, -4.5),
            doneAction: 2);

        // Ping-pong delay + Reverb
        wet = CombC.ar(sig, 0.4, 0.08, 1.0) * dMix * 0.7;
        sig = sig + wet;
        sig = sig + FreeVerb.ar(sig, revM * 0.6, 0.7, 0.4);

        sig = sig * amp * vol * ~trimPerc
            * Lag.kr(Select.kr(mixPercBus >= 0, [1.0, In.kr(mixPercBus, 1)]), 0.08);

        quadSig = if(~limiterChans >= 4) {
            PanAz.ar(4, sig, spatialX.clip(-1, 1) * 0.5, 1, 2, 0.5)
        } {
            Pan2.ar(sig, spatialX.clip(-1, 1))
        };
        Out.ar(out, quadSig);
    }).add;


    // opalDrone: Continuous evolving ambient pad
    // ─── One partial of the drone bed ───────────────────────────────────
    // The bed was ONE synth, spawned once when the engine started and held for
    // the whole session, and its only motion was a 4 s Lag between eight fixed
    // pitches. That is why it read as a small plane changing gear: a constant
    // buzzing tone whose sole event was a ramp up or a ramp down. No partial
    // ever arrived, none ever left, and five detuned Saws through a lowpass is
    // an engine note by construction.
    //
    // A drone bed is not one voice. It is many sustained partials with
    // independent lives, entering and leaving on their own schedules and
    // beating against each other — and harmony changes by REPLACEMENT, old
    // partials dying at the old fundamental while new ones arrive at the new
    // one. That removes the ramp entirely: nothing glides, things appear.
    //
    // Sines, not saws. The buzz was the sawtooth; body comes from the partial
    // ratios in the ensemble above it and from a quiet odd harmonic here, not
    // from a bright waveform being filtered back down.

    // ─── Autonomous Warm Analog Pad ───────────────────────────────────────────
    // Spawned by ~padBedEnsemble on its own clock, always present regardless
    // of ETH transaction rate. Style: Lawrence English / Stars of the Lid —
    // long slow envelopes, detuned analog oscillators, Formant vocal colour,
    // RLPF with slow wobble LFOs, tanh tape saturation, Dust crackle texture,
    // Balance2 slow stereo drift, Compander+LeakDC output chain.
    SynthDef(\biocratiaPad, {
        arg out=0, gate=1, freq=110, amp=0.18, tempo=1.0, ratio=1.0, pan=0,
            masterVolBus=(-1), pitchBus=(-1), timeBus=(-1), spectralBus=(-1),
            spatialBus=(-1), textureBus=(-1), atmosphereBus=(-1), memoryBus=(-1),
            harmonicBus=(-1), resonantBus=(-1),
            masterAmpBus=(-1), filterCutoffBus=(-1), noiseLevelBus=(-1),
            noiseFiltBus=(-1), droneDepthBus=(-1), droneFadeBus=(-1),
            // Matrix mixer: this layer's live level (0=mute, 1=unity, 2=max)
            mixPadBus=(-1);

        var masterVol  = Select.kr(masterVolBus  >= 0, [0.28, In.kr(masterVolBus, 1)]);
        var pShift     = Select.kr(pitchBus      >= 0, [0.0,  In.kr(pitchBus, 1)]);
        var tDil       = Select.kr(timeBus       >= 0, [2.0,  In.kr(timeBus, 1)]);
        var filt       = Select.kr(spectralBus   >= 0, [1000, In.kr(spectralBus, 1)]);
        var texDep     = Select.kr(textureBus    >= 0, [0.3,  In.kr(textureBus, 1)]);
        var atmMix     = Select.kr(atmosphereBus >= 0, [0.4,  In.kr(atmosphereBus, 1)]);
        var memFeed    = Select.kr(memoryBus     >= 0, [0.3,  In.kr(memoryBus, 1)]);
        var harmRich   = Select.kr(harmonicBus   >= 0, [0.8,  In.kr(harmonicBus, 1)]);
        var res        = Select.kr(resonantBus   >= 0, [0.4,  In.kr(resonantBus, 1)]);
        var cutoff     = Select.kr(filterCutoffBus >= 0, [0.55, In.kr(filterCutoffBus, 1)]);
        var nLevel     = Select.kr(noiseLevelBus >= 0, [0.05, In.kr(noiseLevelBus, 1)]);
        var dFade      = Select.kr(droneFadeBus  >= 0, [3.0,  In.kr(droneFadeBus, 1)]);

        // Apply pitch shift (same transposition path as other voices)
        var baseFreq = (freq * ratio * (pShift.clip(-24, 24) / 12).midiratio).clip(22, 900);

        // ── Long evolving envelope (8s atk / 28s sustain / 18s release)
        // tDil stretches all stages so the timeDilation knob makes this
        // voice breathe faster or slower in sync with the whole engine.
        var tScale = tDil.linlin(0.5, 6.0, 0.6, 1.8);
        var env = EnvGen.kr(
            Env([0, 0.65, 1.0, 0.80, 0],
                [8, 28, 35, 18] * tScale / tempo.max(0.1),
                [2, -2, 3, -4]),
            gate, doneAction: 2);

        // Slow time reference for filter and formant drift
        var time   = SinOsc.kr(0.018 * tempo);
        var time2  = SinOsc.kr(0.007 * tempo + 0.31);

        // ── Warm analog oscillator body ──────────────────────────────────────
        // Four detuned Saws + two Pulses with slowly wandering pulse-width
        // mix to the same bandwidth a dense unison string section would fill.
        var warmOsc = Mix.ar([
            Saw.ar(baseFreq * [0.992, 1.0, 1.008, 1.502]) * 0.35,
            Pulse.ar(baseFreq * [0.499, 0.751],
                LFNoise1.kr([0.22, 0.17]).range(0.3, 0.7)) * 0.25
        ]);

        // ── Formant vocal colour ──────────────────────────────────────────────
        // Two formant layers with independent slow pitch drift and formant
        // centre wander — the signature of a children's choir or of wind
        // through a reed structure, not an electric instrument.
        // harmRich pushes the upper formant centre upward so the knob opens
        // from intimate vowel to bright open-mouth resonance.
        var vocalSim = Formant.ar(
            baseFreq * [0.70, 0.93]
                + LFNoise1.kr([1.8, 2.3]).range(-7, 7),
            [780, 1150 + (harmRich.linlin(0.1, 5, 0, 400))]
                + (time * 180),
            [90, 140],
            LFNoise1.kr([0.09, 0.14]).range(0.04, 0.14));

        // ── RLPF with dual slow-rate wobble LFOs ─────────────────────────────
        // cutoff fader sets the global tilt; wobble oscillates it so the
        // filter is always in gentle motion rather than clamped to a value.
        var wobbleCut = SinOsc.kr([0.063, 0.041] * tempo).range(0.85, 1.18);
        var wobbleRes = SinOsc.kr([0.037, 0.027] * tempo).range(0.30, 0.65);
        var fCutHz = (filt.clip(200, 3500)
            * Lag.kr(cutoff, dFade.clip(0.5, 6)).linexp(0, 1, 0.42, 2.0)
            + (time * 480)
            + LFNoise1.kr(0.28).range(0, 240));
        var filtered = RLPF.ar(
            (warmOsc + vocalSim),
            (fCutHz * wobbleCut).clip(60, 6000),
            wobbleRes);

        // ── Tape saturation ───────────────────────────────────────────────────
        // 2.2× into tanh: subtle drive that rounds peaks, not a harsh clip.
        var tapeSat = (filtered * 2.2).tanh * 0.56;

        // ── Dust crackle texture ──────────────────────────────────────────────
        // nLevel controls crackle density — near-zero at default, audible
        // as fine rice-paper surface texture when pushed.
        var crackle = Dust.ar([0.4, 0.55] * tempo)
            * Decay.ar(Dust.ar([0.8, 1.1] * tempo), 0.04)
            * nLevel.linlin(0, 0.5, 0.015, 0.06);

        // ── Slow stereo drift ─────────────────────────────────────────────────
        // Balance2 with a 0.03 Hz SinOsc slowly rotates the image rather than
        // placing the voice statically.  pan arg biases the centre position.
        var panOsc = SinOsc.kr(0.031 * tempo) * 0.4 + pan.clip(-0.5, 0.5);
        var sig = Balance2.ar(
            tapeSat + crackle[0],
            tapeSat + crackle[1],
            panOsc);

        // ── Reverb tail ───────────────────────────────────────────────────────
        // atmMix feeds the same FreeVerb used on every other voice, so the
        // space setting is consistent across the ensemble.
        sig = sig + (FreeVerb2.ar(sig[0], sig[1], atmMix, 0.85, 0.5) * 0.38);

        // ── Output chain ──────────────────────────────────────────────────────
        // HPF removes subsonic energy from the detuned Saws; Compander applies
        // gentle LA-2A-style gain riding; LeakDC removes any DC before Out.
        sig = HPF.ar(sig, 28);
        sig = Compander.ar(sig, sig, 0.28, 1.0, 0.30, 0.012, 0.32);
        sig = LeakDC.ar(sig);

        // Level: masterVol × ~trimPad × mixPadBus (same chain as elektronBell)
        sig = sig * amp * masterVol * env * ~trimPad
            * Lag.kr(Select.kr(mixPadBus >= 0, [1.0, In.kr(mixPadBus, 1)]), 0.12);

        Out.ar(out, sig);
    }).add;
    // ─── End \biocratiaPad ────────────────────────────────────────────────────

    SynthDef(\dronePartial, {
        arg out = 0, freq = 110, amp = 0.10, ratio = 1.0,
            atk = 20, hold = 30, rel = 25, pan = 0, detune = 0.004, seed = 0,
            // Where this partial sits across the three synthesis regimes. The
            // ensemble spreads it across the bed so no two voices are made of
            // the same thing at the same moment.
            character = 0.5,
            masterVolBus=(-1), pitchBus=(-1), spectralBus=(-1), spatialBus=(-1),
            textureBus=(-1), atmosphereBus=(-1), harmonicBus=(-1), resonantBus=(-1),
            masterAmpBus=(-1), filterCutoffBus=(-1), droneFadeBus=(-1),
            droneSpaceBus=(-1), mixDroneBus=(-1), strikeBus=(-1);

        var vol   = Select.kr(masterVolBus >= 0, [0.3, In.kr(masterVolBus, 1)]);
        var pShift= Select.kr(pitchBus >= 0, [0.0, In.kr(pitchBus, 1)]);
        var filt  = Select.kr(spectralBus >= 0, [1000, In.kr(spectralBus, 1)]);
        var spatialX= Select.kr(spatialBus >= 0, [0.0, In.kr(spatialBus, 1)]);
        var texD  = Select.kr(textureBus >= 0, [0.2, In.kr(textureBus, 1)]);
        var revM  = Select.kr(atmosphereBus >= 0, [0.4, In.kr(atmosphereBus, 1)]);
        var fmR   = Select.kr(harmonicBus >= 0, [1.0, In.kr(harmonicBus, 1)]);
        var res   = Select.kr(resonantBus >= 0, [0.4, In.kr(resonantBus, 1)]);
        var mAmp  = Select.kr(masterAmpBus >= 0, [0.7, In.kr(masterAmpBus, 1)]);
        var cutoff= Select.kr(filterCutoffBus >= 0, [0.6, In.kr(filterCutoffBus, 1)]);
        var dSpace= Select.kr(droneSpaceBus >= 0, [0.5, In.kr(droneSpaceBus, 1)]);
        // How excited the PERCUSSION layer is, right now. The beat engine
        // already computes this to shape its own rhythm; writing it to a bus
        // lets the bed feel it too. Lagged slowly, because the bed should seem
        // to be resonating with the strikes rather than following them.
        // Lagged HARD and compressed, not followed. ~percExcite is a
        // self-exciting process: a hit raises the odds of the next, then it
        // decays, so it has a characteristic period. Tracking it closely made
        // the bed inherit that period — the drone rose and fell on the
        // percussion's cycle and the whole texture became predictable within a
        // minute or two, which is the opposite of a bed.
        //
        // sqrt compresses the top of the range so a saturated cluster is not
        // dramatically more than a moderate one, and the 2.2 s lag is far
        // longer than the excitation's own decay, so the bed reads the
        // AVERAGE pressure of a passage rather than its individual gestures.
        var strike = Lag.kr(
            Select.kr(strikeBus >= 0, [0.0, In.kr(strikeBus, 1)]).clip(0, 1.2).sqrt,
            2.2).clip(0, 1.1);
        var f, sig, env, quadSig, trem, respond;
        var bands, fbk, fm, mode, r1, r2, r3, grit;

        f = (freq * ratio * (pShift.clip(-24, 24) / 12).midiratio).clip(20, 6000);

        // ─── Why the previous version could only ever be a propeller ────────
        //
        // It was three sines a few cents apart, plus a 3rd and a 5th harmonic,
        // under a slow sine tremolo. Detuned sines beat at a FIXED rate — at
        // f=110 and detune 0.005 they throb at about half a hertz — and a
        // harmonic series throbbing at a steady low rate is precisely how one
        // synthesises an engine. Seven of them at once is a propeller. The
        // report was not a matter of taste; the patch was built out of the
        // ingredients of the sound it was accused of making.
        //
        // Nothing periodic survives here. Every modulator below is noise-driven
        // at a rate that shares no factor with any other, so the voice never
        // returns to a state it has already been in.
        r1 = LFNoise1.kr(0.031 + (seed * 0.043));
        r2 = LFNoise2.kr(0.017 + (seed * 0.071));
        r3 = LFNoise1.kr(0.0083 + (seed * 0.029));

        // ── REGIME 1 · resonant noise bands ────────────────────────────────
        // "blizzard" and "hedge trimmer": the pitch is a RESONANCE, not an
        // oscillator. Noise forced through very narrow bandpasses sings at f,
        // but it hisses and wanders while it does, because what is resonating
        // is random. It can never lock into a beat with itself.
        bands = Mix.fill(4, { |i|
            var bf = f * (i + 1)
                * (1 + (LFNoise1.kr(0.019 + (i * 0.013) + (seed * 0.031)) * 0.02));
            BPF.ar(PinkNoise.ar(1.0), bf.clip(20, 14000),
                (0.003 + (i * 0.0025) + r1.range(0.0, 0.008)).clip(0.001, 0.05))
                * (i + 1).reciprocal
        }) * 14;   // narrow bandpasses throw away most of the level

        // ── REGIME 2 · modulated feedback ──────────────────────────────────
        // "shifty feedback" and "saw scratching": a comb whose delay time
        // moves is a doppler shift, so the feedback path glissandos against
        // itself continuously and never settles. Fed from the bands, this is
        // the layer that produces drifting, half-pitched smears — the thing
        // the old drone tried to get from a 4-second Lag and could not.
        // Tanh'd and LeakDC'd: a comb with a decay this long accumulates, and
        // sustained input into it would otherwise run away.
        fbk = LeakDC.ar(CombC.ar(bands * 0.22, 2.0,
            LFTri.kr(0.037 + (seed * 0.13), seed * 4).range(0.03, 1.7),
            (6 + r3.range(0, 22)).clip(1, 30)).tanh);

        // ── REGIME 3 · nested FM ───────────────────────────────────────────
        // "FM curio": a sine modulated by a sine modulated by a sine, with
        // both indices on independent noise. The spectrum is inharmonic and
        // reshuffles constantly, which is the opposite of a harmonic series.
        fm = SinOsc.ar(f,
            SinOsc.ar(f * (0.5 + (seed * 2.5)),
                SinOsc.ar(f * 0.25, 0, r2.range(0.5, 9)),
                r1.range(0.3, 7) * fmR.linlin(0.1, 5, 0.4, 2.2)),
            0.30);

        // ── and the change happens in between ──────────────────────────────
        // The partial does not pick a regime, it MOVES through them: character
        // places it and a slow drift carries it across the boundaries, so most
        // of the time it is sounding something that is neither one thing nor
        // the other. SelectX crossfades, so there are no seams to hear.
        mode = (character + (LFNoise1.kr(0.0091 + (seed * 0.021)) * 0.45)).clip(0, 1);
        sig = SelectX.ar(mode * 2, [bands, fbk, fm]);

        // Internal incident. A drone with no events inside it is a held note
        // however rich its spectrum — this is what stops it being constant.
        // Dust fires rarely and unpredictably; each hit surges the voice and
        // opens it, so the bed keeps producing things that were not announced.
        grit = Decay2.kr(Dust.kr(0.04 + (seed * 0.22)), 0.4, 5.0).clip(0, 1);
        sig = sig * (1 + (grit * 1.6));

        // Aperiodic, replacing a fixed-rate sine. Same reason as everything
        // else here: a steady tremolo is the propeller's amplitude signature.
        trem = LFNoise2.kr(0.021 + (seed * 0.05)).range(0.55, 1.0);

        // Each partial answers the percussion by a DIFFERENT amount — some
        // barely at all, some strongly — so a busy passage lights parts of the
        // bed rather than pumping the whole thing as one block, which would
        // just be ducking with the sign flipped.
        // Each partial answers by its own amount AND on its own slow clock.
        // Without the second term every partial moved in lockstep with the
        // same strike signal — different depths, identical timing — which is
        // what made a cluster read as one block pumping rather than as a bed
        // being rung.
        respond = (0.10 + (seed * 0.45))
            * LFNoise2.kr(0.03 + (seed * 0.05)).range(0.45, 1.25);

        sig = LPF.ar(sig, (filt.clip(80, 4000) * cutoff.linexp(0, 1, 0.6, 2.2)
            // Percussive energy opens the partial: the bed brightens under a
            // cluster of strikes and darkens again in the silences.
            // 0.75 -> 0.34. At the old depth a saturated cluster opened the
            // brightest partials by 1.9x, which is not "resonating with the
            // strikes", it is the percussion playing the drone.
            * (1 + (strike * respond * 0.34))
            // …and so does the voice's own internal incident.
            * (1 + (grit * 1.8))).clip(90, 13000));
        sig = sig + (FreeVerb.ar(sig, revM * 0.7, dSpace.linlin(0, 1, 0.4, 0.95), 0.15) * 0.5);

        // Sine curves on both ends: a partial should arrive and leave without
        // ever being heard to start or stop.
        env = EnvGen.kr(
            Env.new([0, 1, 1, 0],
                [atk.clip(2, 90), hold.clip(1, 300), rel.clip(2, 90)],
                [\sine, 0, \sine]),
            doneAction: 2);

        sig = sig * env * trem * amp * vol
            // …and swells it. Small: this is the bed being rung by the strikes,
            // not a second percussion layer.
            * (1 + (strike * respond * 0.14))
            * Lag.kr(mAmp, 2.0).linlin(0, 1, 0.05, 1.4) * (~trimDronePartial ? 0.10)
            * Lag.kr(Select.kr(mixDroneBus >= 0, [1.0, In.kr(mixDroneBus, 1)]), 0.08);

        quadSig = if(~limiterChans >= 4) {
            PanAz.ar(4, sig, (pan + (spatialX.clip(-1, 1) * 0.5)).clip(-1, 1), 1, 2, 0.5)
        } {
            Pan2.ar(sig, (pan + (spatialX.clip(-1, 1) * 0.5)).clip(-1, 1))
        };
        Out.ar(out, quadSig);
    }).add;

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
        // Noise Level / Noise Filt reach the drone now as well as the pad. On
        // the pad they are a plain LPF'd pink hiss; here they are a bank of
        // drifting band-passes, which is the difference between a noise floor
        // and a texture.
        noiseLevelBus=(-1), noiseFiltBus=(-1),
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
        var nLevel= Select.kr(noiseLevelBus >= 0, [0.1, In.kr(noiseLevelBus, 1)]);
        var nFilt = Select.kr(noiseFiltBus  >= 0, [0.5, In.kr(noiseFiltBus, 1)]);

        var env, sig, mod, sub, grains, delay, quadSig, baseFreq, dry, reson, noiseBed;
        
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

        // ── Resonator bank: the bed grows its own partials ─────────────────
        // Three combs whose delay times drift independently over roughly a
        // minute. The delay times sit in the PITCHED range — 1/240 to 1/55 s —
        // so each comb is a resonance rather than an echo, and because they
        // drift at different rates the spectrum is never twice the same. This
        // is what the bed was missing: five detuned saws through a fixed filter
        // are static by construction, and no amount of reverb on top of a
        // static thing makes it move.
        //
        // Input scaled to 0.18 and the output LeakDC'd: a comb with a 9 s decay
        // and a moving delay time is a resonator with enormous gain at its
        // peaks, and it will accumulate DC and run away if fed at unity.
        reson = LeakDC.ar(Mix.fill(3, { |i|
            CombC.ar(
                sig * 0.18,
                0.03,
                LFNoise1.kr(0.014 + (i * 0.009)).exprange(1/240, 1/55),
                Lag.kr(dFeed, 0.5).linexp(0, 1, 1.2, 7.0)
            )
        }));
        // Kept under the dry bed rather than replacing it — textureDepth opens
        // the resonators the way it opens the granular stage above.
        sig = sig + (reson * texD.linlin(0, 1, 0.10, 0.55));

        // ── Band-filtered noise bed ────────────────────────────────────────
        // Six band-passes over pink noise with independently drifting centres
        // and widths. Noise Level sets how much of it there is and Noise Filt
        // how far up the spectrum the bands are allowed to wander, so the two
        // faders together are a weather system rather than a hiss.
        noiseBed = Mix.fill(6, { |i|
            BPF.ar(
                PinkNoise.ar(1.0),
                LFNoise1.kr(0.02 + (i * 0.007))
                    .exprange(90, (120 + (nFilt * 3800)).clip(150, 4000)),
                LFNoise1.kr(0.03 + (i * 0.004)).range(0.05, 0.32)
            )
        }) * 0.42;
        sig = sig + (noiseBed * nLevel.linlin(0, 0.5, 0.0, 1.1));

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
        // Reach added: harmonicRich to give the crackle a resonant pitch,
        // resonantBody to sharpen it, the two noise controls for the bed under
        // it, filterCutoff as the tilt and delayFeedback for the comb.
        harmonicBus=(-1), resonantBus=(-1), filterCutoffBus=(-1),
        noiseLevelBus=(-1), noiseFiltBus=(-1), delayFeedbackBus=(-1), droneFadeBus=(-1),
        // Matrix mixer: this layer's live level (0 = mute, 1 = unity, 2 = max).
        mixDustBus=(-1), mixSampleBus=(-1), mixPadBus=(-1), mixKickBus=(-1), mixPercBus=(-1);

        var vol   = Select.kr(masterVolBus >= 0, [0.3, In.kr(masterVolBus, 1)]);
        var dens  = Select.kr(textureBus >= 0, [0.25, In.kr(textureBus, 1)]);
        var filt  = Select.kr(spectralBus >= 0, [600, In.kr(spectralBus, 1)]);
        var tStretch= Select.kr(timeBus >= 0, [2.0, In.kr(timeBus, 1)]);
        var pitch = Select.kr(pitchBus >= 0, [0.0, In.kr(pitchBus, 1)]);
        var revM  = Select.kr(atmosphereBus >= 0, [0.4, In.kr(atmosphereBus, 1)]);
        var dMix  = Select.kr(memoryBus >= 0, [0.3, In.kr(memoryBus, 1)]);
        var spatialX= Select.kr(spatialBus >= 0, [0.0, In.kr(spatialBus, 1)]);
        var fmR   = Select.kr(harmonicBus >= 0, [1.0, In.kr(harmonicBus, 1)]);
        var res   = Select.kr(resonantBus >= 0, [0.4, In.kr(resonantBus, 1)]);
        var cutoff= Select.kr(filterCutoffBus >= 0, [0.55, In.kr(filterCutoffBus, 1)]);
        var nLevel= Select.kr(noiseLevelBus >= 0, [0.1, In.kr(noiseLevelBus, 1)]);
        var nFilt = Select.kr(noiseFiltBus  >= 0, [0.5, In.kr(noiseFiltBus, 1)]);
        var dFeed = Select.kr(delayFeedbackBus >= 0, [0.3, In.kr(delayFeedbackBus, 1)]);
        var dFade = Select.kr(droneFadeBus  >= 0, [2.0, In.kr(droneFadeBus, 1)]);

        // ─── Cross-layer acoustic modulation ──────────────────────────────
        var kickLvl   = Select.kr(mixKickBus   >= 0, [1.0, In.kr(mixKickBus, 1)]);
        var percLvl   = Select.kr(mixPercBus   >= 0, [1.0, In.kr(mixPercBus, 1)]);
        var sampleLvl = Select.kr(mixSampleBus >= 0, [1.0, In.kr(mixSampleBus, 1)]);
        var padLvl    = Select.kr(mixPadBus    >= 0, [1.0, In.kr(mixPadBus, 1)]);
        var env, sig, grains, grain1, grain2, grainEnv, wet, quadSig, ring, bed, tunedPitch;

        // 1. Kick level: ducks low rumble and excites metallic particle ring
        filt  = (filt * kickLvl.linlin(0, 2, 1.1, 0.85)).clip(100, 1200);
        fmR   = (fmR  * kickLvl.linlin(0, 2, 0.85, 1.3)).clip(0.1, 4.0);
        // 2. Perc level: increases grain scatter density
        dens  = (dens * percLvl.linlin(0, 2, 0.7, 1.4)).clip(0, 1);
        // 3. Sample & Pad modulation
        dens  = (dens * sampleLvl.linlin(0, 2, 0.8, 1.25)).clip(0, 1);
        nFilt = (nFilt * padLvl.linlin(0, 2, 0.8, 1.25)).clip(0, 1);
        
        env = EnvGen.ar(Env.perc(0.015, tStretch * 0.9), doneAction: 2);
        
        // ── Multi-rate granular dust cloud (richer granularity & organic texture)
        grain1 = Dust2.ar(dens.linexp(0, 1, 25, 700));
        grain2 = Dust.ar(dens.linexp(0, 1, 15, 350));
        grainEnv = Decay2.ar(grain1 + grain2, 0.001, 0.018 + (tStretch * 0.015));
        grains = (grain1 + (grain2 * 0.6)) * grainEnv;

        // ── Tuned musical pitch (harmonic series anchored to drone fundamental)
        tunedPitch = (110 * fmR.linexp(0.1, 5, 0.5, 2.5)
            * (pitch.clip(-12, 12) / 12).midiratio).clip(45, 650);

        ring = Ringz.ar(grains, tunedPitch, res.linlin(0, 1, 0.04, 0.30) * tStretch);
        ring = ring + (Resonz.ar(grains, tunedPitch * 1.5, 0.18) * 0.6);
        sig = grains + (ring * fmR.linexp(0.1, 5, 0.1, 0.8));

        // Soft pink noise bed under the grains
        bed = BPF.ar(PinkNoise.ar,
            (180 + (nFilt * 800)).clip(120, 1200),
            0.4 + (nFilt * 0.5)) * nLevel.linlin(0, 0.5, 0.0, 0.4);
        sig = sig + bed;

        // ── Warm Analog High-Cut Filter (cutting all harsh high freqs)
        sig = LPF.ar(sig,
            (filt.clip(180, 1100)
                * Lag.kr(cutoff, dFade.clip(0.1, 5)).linexp(0, 1, 0.6, 1.4)).clip(120, 1200));
        sig = LPF.ar(sig, 1200); // Fixed backstop: strictly eliminates high hiss
        sig = (sig * 1.3).tanh;  // Tape saturation warmth

        // Delay + Reverb wash
        wet = CombC.ar(sig, 0.5, 0.12, Lag.kr(dFeed, 0.2).linexp(0, 1, 0.2, 4.0)) * dMix * 0.8;
        sig = sig + wet;
        sig = sig + FreeVerb.ar(sig, revM * 0.7, 0.75, 0.4);

        sig = sig * env * amp * vol * ~trimDust
            * Lag.kr(Select.kr(mixDustBus >= 0, [1.0, In.kr(mixDustBus, 1)]), 0.08);
        
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

    // ─── One argument list for every voice ──────────────────────────────
    // The voices declare their buses under two spellings: the ten core
    // controls use short names (masterVolBus, harmonicBus, textureBus …) while
    // everything else uses the registry name plus "Bus". Three separate spawn
    // sites were each maintaining their own partial list, which is how eight
    // controls ended up reaching the drone and the pad and nothing else — the
    // SynthDefs would have read them, but nobody was passing them.
    //
    // scsynth ignores control names a SynthDef does not declare, so passing the
    // union to every voice is safe and is what ~phenoBusArgs already relies on.
    // One list, one place, no drift.
    ~voiceBusArgs = {
        var args = [
            \masterVolBus,  ~bidx.(\masterVolume),
            \pitchBus,      ~bidx.(\pitchShift),
            \timeBus,       ~bidx.(\timeDilation),
            \spectralBus,   ~bidx.(\spectralShift),
            \spatialBus,    ~bidx.(\spatialSpread),
            \textureBus,    ~bidx.(\textureDepth),
            \atmosphereBus, ~bidx.(\atmosphereMix),
            \memoryBus,     ~bidx.(\memoryFeed),
            \harmonicBus,   ~bidx.(\harmonicRich),
            \resonantBus,   ~bidx.(\resonantBody)
        ];
        if(~buses.notNil) {
            ~buses.keysValuesDo { |name, bus|
                args = args ++ [(name.asString ++ "Bus").asSymbol, bus.index];
            };
        };
        args;
    };
    ~bidx = { |name|
        if(~buses.notNil and: { ~buses[name].notNil }, { ~buses[name].index }, { -1 });
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

    // ── MOTU channel router ─────────────────────────────────────────────────
    // All synths write to Out.ar(0, ...) which maps to PortAudio channels 0..3
    // (MOTU Main Out / Line 1-2). On this setup the speakers are wired to MOTU
    // analog out 3-4 = PortAudio channels 4-5 = SC bus indices 4-5.
    //
    // InFeedback.ar reads from the hardware output bus AFTER the limiter has
    // already written its result.
    // NOTE: InFeedback numChannels MUST be an integer literal at SynthDef build time.
    SynthDef(\motuRouter, {
        arg inBus = 0, outBus = 4;
        var quad = InFeedback.ar(inBus, 4);
        // Fold down 4-channel quad into stereo so no panned energy is lost on 2 speakers:
        // Left = FrontLeft (ch0) + 0.707 * RearLeft (ch3)
        // Right = FrontRight (ch1) + 0.707 * RearRight (ch2)
        var left = quad[0] + (quad[3] * 0.707);
        var right = quad[1] + (quad[2] * 0.707);
        // Primary stereo pair out to outBus (buses 4 & 5 -> MOTU Analog 3 & 4)
        Out.ar(outBus, [left, right]);
        // Also send rear quad channels to outBus + 2 (buses 6 & 7 -> MOTU Analog 5 & 6)
        Out.ar(outBus + 2, [quad[2], quad[3]]);
    }).add;
    s.sync;
    if(~motuRouterSynth.notNil) { try { ~motuRouterSynth.free }; ~motuRouterSynth = nil };
    if((~motuOutOffset ? 0) > 0) {
        ~motuRouterSynth = Synth.tail(RootNode(s), \motuRouter, [
            \inBus,  0,
            \outBus, ~motuOutOffset
        ]);
        "MOTU router active: SC bus 0..3 → bus % (analog out 3-4 stereo folddown + analog 5-6 rears)."
            .format(~motuOutOffset).postln;
    } {
        "MOTU router inactive (motuOutOffset = 0 — speakers on Main Out).".postln;
    };

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