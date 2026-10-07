// SuperCollider Ethereum Sonification - Synth Definitions
// Current Date and Time (UTC): 2025-03-01 20:58:06
// Current User's Login: alejoduque

(
// Wait for server to be ready — use doWhenBooted (does NOT re-trigger boot)
// s.waitForBoot triggers a boot which collides with the boot from 1_server_config.scd
s.doWhenBooted({
    // Every filter is held under 0.45 × the sample rate (".min(SampleRate.ir
    // * 0.45)"): at 16 kHz — a Bluetooth headset in hands-free mode — the ones
    // tuned to 9-18 kHz went past Nyquist and the output ran to +165 dB
    // (measured offline, 2026-10-07). The instrument now survives it, but
    // sounds dull up there; say so.
    if(s.sampleRate.notNil and: { s.sampleRate < 32000 }) {
        ("⚠ AUDIO A % Hz — audífonos Bluetooth en modo manos libres (otra app usa su micrófono)."
         ++ " El motor no se rompe, pero suena apagado: cierra esa app o usa otra salida.").format(s.sampleRate.asInteger).warn;
    };
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
    // ─── THE MIX ────────────────────────────────────────────────────────────
    // Rebalanced as one table rather than layer by layer.
    //
    // The previous set had drifted 58.8 dB apart: corpus sat at +14.8 dB —
    // ABOVE unity, 55x the glue compressor's 0.10 threshold — while perc sat
    // at -44 dB. The compressor keys off the SUMMED mix, so corpus and sample
    // pinned the gain reduction and everything else was ducked underneath
    // them. That is why raising an individual trim kept not working: the
    // problem was never one layer's level, it was the spread.
    //
    // Every ratio below is now within 27.5 dB, with the bed on top and the
    // struck voices close enough together that the matrix mixer (CC 42-49)
    // can actually balance them from the surface. That is the point: these
    // constants set the STARTING POINT, the faders do the mixing.
    // the BED — continuous, holds the floor. This is the REFERENCE: every
    // ratio below is chosen as a distance beneath it. Raising four layers
    // toward it last round cost it 6-21 dB of headroom over each and is
    // why the drone read as lost without its own number ever changing.
    ~trimDrone = 3.20 * ~trimMaster;
    // PADS / BELLS — 0.65 -> 1.30 -> 0.95 -> 0.60. Reported too loud with
    // Audio Gain and Volume Out at 1.0, which is ~9 dB hotter than the 0.35
    // masterVolume every earlier calibration in this series was made against.
    // 0.60 -> 0.45 with the pad's band cut and sidechained (\biocratiaPad,
    // "Making room"): it was sitting on top of every other layer.
    ~trimPad   = 0.45 * ~trimMaster;
    ~trimKick  = 0.75 * ~trimMaster;   // KICK — pulled back from 1.10, still 6.6 dB over its old level
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
    // 0.075 -> 0.055. The voice is now three summed layers (a 56-mode bank at
    // ~2x the energy of the 14-mode one, plus the noise wash, plus the Pulse
    // chug) with an envelope twice as long, so the same trim would be
    // noticeably hotter than what was just calibrated by ear. This is a
    // structural compensation, not a taste judgement — if it now sits wrong,
    // this is the one number to move.
    // PERC — 0.55 -> 0.055, set by ear rather than by arithmetic.
    //
    // Reported loud with the /mix/perc fader at 0.20x, so 0.20x becomes the
    // fader's TOP instead of a tenth of its travel:
    //
    //     level now at mixPerc 0.20 = 0.55 * 0.20 = 0.110
    //     same level at mixPerc 2.0 (fader max) => 0.110 / 2.0 = 0.055
    //
    // The fader keeps its 0-2 range and its unity-at-1.0 meaning; only this
    // constant moves, so the whole travel now spans silence to what used to
    // be a tenth of the way up — which is where the useful range actually is.
    //
    // This is the same number the trim held before the bells were routed into
    // \opalPerc, and it is NOT a return to that state: this voice is now
    // struck by the tide AND the chain, at ~38 concurrent, so ~38 copies sum
    // where one used to. Per-voice trim and perceived level stopped being the
    // same question when the concurrency changed.
    //
    // Halved, 0.055 -> 0.0275 (-6 dB), after listening: BOWL and CHINA were
    // still the loudest thing in the room at every preset. Two changes land
    // together and both lower it — this trim, and the family factor inside
    // \opalPerc (DUST/KICK faders and the three cadences), which at the
    // default settings is 1.0 and in a sparse config well under it.
    ~trimPerc  = 0.0275 * ~trimMaster;
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
    // 0.75 -> 1.05 -> 1.60. Dust is short broadband grains, the easiest thing
    // in the mix for any sustained voice to mask, and it was still sitting
    // under the bed at 1.05. This puts it above the pad (0.65) — appropriate,
    // because the hojarasca is meant to be the floor of the piece rather than
    // an occasional detail on top of it.
    // 1.05 -> 1.60 -> 2.60. Reported still too quiet at 1.60, and there is a
    // second attenuation the trim alone cannot reach: the beat engine spawns
    // dust at amp (0.3 + density*0.35), which on an idle chain is 0.3. So the
    // layer was running at 30% of whatever this constant says. Both are raised
    // together — see 5_beat_engine.scd.
    ~trimDust  = 1.20 * ~trimMaster;   // DUST — pulled back from 1.90, still 4 dB over its old level
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
    ~trimSample= 0.55 * ~trimMaster;   // SAMPLE — 1.55 -> 0.55; it was covering the synthesised voices

    // THE MIX IS FOUR CHANNELS WIDE. This was numOutputBusChannels — 8 — which
    // is how many channels the HARDWARE exposes, not how many the mix occupies.
    // Eight are opened because the MOTU router needs somewhere to put its
    // fold-down; the music itself is quad and lives on buses 0-3. Every voice
    // agrees: `quadSig = if(~limiterChans >= 4)`.
    //
    // Conflating the two put three faults in the master chain at once.
    //
    // The nodes run limiter -> scope -> router, all Synth.tail. So when the
    // limiter read In.ar(0, 8) it was reading buses 4-7 as well — and 4-7 hold
    // the ROUTER'S OUTPUT from the previous block, which is a delayed copy of
    // buses 0-3 folded to stereo. The detector was therefore keyed on the mix
    // plus a delayed copy of itself: a feedback path in the sidechain.
    //
    // Then it divided that by 8 while only 4 channels carried the music, so
    // the key read about half the true level and the 0.10 threshold behaved
    // like 0.20 — the compressor engaged far less than the chain's makeup
    // (x1.495, unconditional) assumes it has. That is most of the missing
    // headroom, and it is why pulling the master amp down restores stability:
    // it is doing by hand what the compressor was not doing by itself.
    //
    // And ReplaceOut.ar(0, lim) then wrote all 8, overwriting 4-7 with limited
    // nonsense that the router immediately overwrote again — work done to be
    // discarded.
    //
    // \masterScope reads the same way, so /spectrum — the visuals' only real
    // measurement of the engine — was also looking at the mix plus its own
    // fold-down. min() so a stereo rig still works.
    ~limiterChans = min(4, s.options.numOutputBusChannels);

    // ─── Stems: one audio bus per layer ─────────────────────────────────
    // Every voice used to write straight to bus 0, so the mix was the only
    // thing that existed: no layer could be measured on its own. Now each
    // layer writes to its own stem and a \stemSum per stem adds it to the
    // mix — the SAME sum as before, so nothing is heard differently — and
    // reports its level on /stem for the GUI's meters.
    //
    // ~stemOut falls back to bus 0 for an unknown name, so a voice can never
    // go silent by being pointed at a stem nobody reads.
    ~stemNames = [\drone, \pad, \kick, \perc, \dust, \sample, \corpus, \ultra,
                  \remuestreo, \espectro, \caos, \ruptura, \masa, \seq];
    ~stems = ~stems ?? { () };
    ~stemNames.do { |n| if(~stems[n].isNil) { ~stems[n] = Bus.audio(s, ~limiterChans) } };
    ~stemOut = { |name| (~stems !? { ~stems[name] } !? { |b| b.index }) ? 0 };
    // pan / auto: each strip's own place in the stereo field (4_gui.scd).
    // AUTO off: pan is the position. AUTO on: the layer travels between both
    // sides at its own slow rate, and |pan| is how far it reaches — at centre
    // it stays still. A BALANCE law, not equal-power: at pan 0 both sides are
    // exactly unity, so adding this changed nothing until a knob moves (Pan2
    // or Balance2 would have dropped every layer 3 dB at centre).
    // MEZCLA (mixCarve, 0_parameters.scd): each stem is carved here, on its
    // way into the mix, by a profile of its own (~stemCarveArgs below) — a low
    // cut, a dip where it treads on another layer, shelves, the drone and pad
    // ducked under the kick below 150 Hz, and the peaks held at `tame` dB over
    // the layer's own running level. The carved stem is CROSSFADED against the
    // untouched one by mixCarve (LinXFade2: at 0 the output IS the input, the
    // filters only run), so the engine at 0 sounds exactly as it always has.
    SynthDef(\stemSum, { |in = 0, out = 0, id = 0, pan = 0, auto = 0, rate = 0.012, phase = 0,
            carveBus = (-1), hpf = 0, dipF = 300, dipDb = 0, lsF = 200, lsDb = 0,
            hsF = 9500, hsDb = 0, duckIn = (-1), duckDb = 0, tame = 0|
        var dry = In.ar(in, ~limiterChans).asArray;
        var c = Lag.kr(Select.kr(carveBus >= 0, [0, In.kr(carveBus.max(0), 1)]).clip(0, 1), 0.25);
        var key, keyEnv, keyRef, duckG, sum, env, lvl, tameG, x, peak, rms, pos, gl, gr;
        // The kick's own stem, low-passed: how hard it is hitting NOW against
        // how hard it has been hitting lately, 0..1.
        key = LPF.ar(Mix(In.ar(duckIn.max(0), ~limiterChans)), 150) * (duckIn >= 0);
        keyEnv = Amplitude.kr(key, 0.005, 0.18);
        keyRef = Amplitude.kr(key, 0.001, 3.0).max(1e-5);
        duckG = (1 - ((keyEnv / keyRef).clip(0, 1) * (1 - duckDb.neg.dbamp))).clip(0, 1);
        // Peaks over the layer's own level: a fast envelope against a slow RMS.
        sum = Mix(dry) / dry.size;
        env = Amplitude.ar(sum, 0.0005, 0.08);
        lvl = Lag.ar(sum.squared, 0.4).sqrt;
        tameG = Select.ar(tame > 0, [DC.ar(1), ((lvl * tame.dbamp) / env.max(1e-6)).clip(0, 1)]);
        x = dry.collect { |ch|
            var y = ch, lo;
            // 4th-order low cut (two 2nd-order HPFs); bypassed when hpf is 0.
            y = Select.ar(hpf > 0, [y, HPF.ar(HPF.ar(y, hpf.max(10)), (hpf.max(10)).min(SampleRate.ir * 0.45))]);
            y = BPeakEQ.ar(y, dipF.min(SampleRate.ir * 0.42), 1, dipDb);
            y = BLowShelf.ar(y, lsF.min(SampleRate.ir * 0.42), 1, lsDb);
            // Kept under Nyquist: a shelf above it turns the filter unstable
            // (a 16 kHz device put 9.5 kHz past it and the stem ran away).
            y = BHiShelf.ar(y, hsF.min(SampleRate.ir * 0.42), 1, hsDb);
            // Duck the band under 150 Hz only: the rest of the layer is
            // untouched, so the kick takes the floor without the bed pumping.
            lo = LPF.ar(LPF.ar(y, 150), 150);
            y = (y - lo) + (lo * Lag.kr(duckG, 0.01));
            LinXFade2.ar(ch, y * tameG, c * 2 - 1)
        };
        // A NaN or inf in one layer (an unstable filter, a voice gone bad)
        // stops here, as silence on that layer, instead of reaching bus 0 and
        // silencing the whole engine at the limiter.
        x = x.collect { |ch| Sanitize.ar(ch) };
        peak = x.collect(_.abs).reduce(\max);
        rms = (Lag.ar(x.collect(_.squared).sum / x.size, 0.3)).sqrt;
        pos = Lag.kr(Select.kr(auto > 0.5, [pan, SinOsc.kr(rate, phase) * pan.abs]), 0.6).clip(-1, 1);
        gl = (1 - pos).clip(0, 1); gr = (1 + pos).clip(0, 1);
        SendReply.kr(Impulse.kr(12), '/stem', [id, Amplitude.kr(peak, 0.001, 0.4), rms]);
        // PanAz(4) order: 0 front-left, 1 front-right, 2 rear-right, 3 rear-left.
        x = case
            { x.size >= 4 } { [x[0] * gl, x[1] * gr, x[2] * gr, x[3] * gl] }
            { x.size == 2 } { [x[0] * gl, x[1] * gr] }
            { x };
        Out.ar(out, x);
    }).add;
    // The same levels, for the visuals. The GUI's meters listen to /stem in
    // 4_gui.scd; the projector needs them too — the blended slots read the
    // CORPUS layer as the forest's own voice, apart from the chain's. One
    // message at 10 Hz carrying name/rms pairs for every layer, rather than
    // forwarding fourteen streams at 12 Hz each.
    ~stemRms = ~stemRms ?? { () };
    OSCdef(\stemToVisuals).free;
    OSCdef(\stemToVisuals, { |msg|
        var name = (~stemNames ? [])[msg[3].asInteger];
        if(name.notNil) { ~stemRms[name] = msg[5] };
    }, '/stem');
    if(~stemVisualsRoutine.notNil) { ~stemVisualsRoutine.stop };
    ~stemVisualsRoutine = Routine({
        loop {
            if(~visualsDest.notNil and: { ~stemRms.size > 0 }) {
                ~visualsDest.sendMsg('/stems', *(~stemNames.collect { |n|
                    [n.asString, (~stemRms[n] ? 0).asFloat] }.flatten));
            };
            0.1.wait;
        }
    }).play(SystemClock);

    // Where each stem's \stemSum lives, and its pan state — kept here so the
    // three places that create them (below, 17_ and 18_) and the GUI agree.
    ~stemNodes = ();
    ~stemPan = ~stemPan ?? { () };
    // A crossing every 20-60 s, different and fixed for each layer (from its
    // name), so moving layers never travel together.
    ~stemPanArgs = { |name|
        var st = ~stemPan[name] ? (pan: 0, auto: 0);
        var h = name.asString.hash.abs;
        [\pan, st[\pan] ? 0, \auto, st[\auto] ? 0,
         \rate, 1 / (40 + ((h % 1000) / 1000 * 80)), \phase, (h % 628) / 100]
    };
    // MEZCLA profiles: what carving means for each layer. Only these numbers
    // differ; the processing is \stemSum's, and all of it scales with mixCarve.
    //   kick    owns 40-90 Hz and the sub: its 12-22 Hz sine cut at 28 Hz,
    //           peaks held 12 dB over its level
    //   drone   above the kick (cut 45 Hz), ducked 4 dB under it below 150 Hz,
    //           a 2 dB dip at 400 where the low mids pile up
    //   pad     cut 60 Hz (its Pulse an octave down lived at 8-37 Hz), ducked,
    //           a 3 dB dip at 300 where kick and drone overlap
    //   perc    peaks held; its −2 dB air shelf given back
    //   dust    cut 250 Hz: dust is detail, not body
    //   corpus  −3 dB below 200 Hz so the forest sits above the bed
    //   sample  cut 40; motors cut 30, masa 25 (its 10-20 Hz sine)
    ~stemCarveProfiles = (
        kick:   [\hpf, 28, \tame, 12],
        drone:  [\hpf, 45, \dipF, 400, \dipDb, -2, \duckDb, -4],
        pad:    [\hpf, 60, \dipF, 300, \dipDb, -3, \duckDb, -4],
        perc:   [\tame, 12, \hsDb, 2],
        dust:   [\hpf, 250],
        sample: [\hpf, 40],
        corpus: [\lsF, 200, \lsDb, -3],
        masa:   [\hpf, 25],
        remuestreo: [\hpf, 30], espectro: [\hpf, 30], caos: [\hpf, 30],
        ruptura: [\hpf, 30], seq: [\hpf, 30]
    );
    ~stemCarveArgs = { |name|
        var prof = ~stemCarveProfiles[name] ? [];
        var duck = if((prof.indexOf(\duckDb)).notNil and: { ~stems[\kick].notNil },
            { [\duckIn, ~stems[\kick].index] }, { [] });
        [\carveBus, ((~buses !? { ~buses[\mixCarve] } !? { |b| b.index }) ? -1)] ++ prof ++ duck
    };
    ~stemPanSet = { |name, pan, auto|
        var st = ~stemPan[name] ?? { (pan: 0, auto: 0) };
        if(pan.notNil) { st[\pan] = pan.clip(-1, 1) };
        if(auto.notNil) { st[\auto] = auto.clip(0, 1) };
        ~stemPan[name] = st;
        ~stemNodes[name] !? { |n| n.set(\pan, st[\pan], \auto, st[\auto]) };
        ~stateDirty = true;
        // Every surface that shows it follows (the GUI strip, after a config).
        { ~stemPanViews !? { |v| v[name] !? { |pv| pv.(st) } } }.defer;
    };
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
    // makeup: the whole mix into the glue compressor. The trims above keep
    // the limiter out of the compressor regime by running every layer low,
    // and they did their job — gr sat at 1.0 — but the cost was a quiet
    // instrument: a full session measured -19.7 LUFS with peaks at -2 dBFS,
    // MASTER VOL at the top. Measured on a real pre-limiter mix through this
    // def: x1.0 -17.0 LUFS (LRA 5.6), x1.5 -14.2 (LRA 4.6), x2.0 -12.5 (LRA
    // 4.0). 1.5 reaches streaming level for one LU of dynamics; above 2 the
    // compressor starts flattening the arcs the piece is made of.
    SynthDef(\masterLimiter, { |ceiling = 0.92, glue = 0.55, drive = 0.40, makeup = 1.5, carveBus = (-1)|
        // Sanitize: anything not summed through a stem (the room, the tape,
        // CRUDO) can still carry a NaN; one would turn the limiter's output to
        // silence for good, since its envelope never recovers from it.
        var sig = Sanitize.ar(In.ar(0, ~limiterChans)) * makeup;
        var clean = LeakDC.ar(sig);
        // MEZCLA (mixCarve): at 0 all three of these are bypassed exactly.
        var carve = Lag.kr(Select.kr(carveBus >= 0, [0, In.kr(carveBus.max(0), 1)]).clip(0, 1), 0.25);
        var key, comped, sat, lim, mono, lows, monoLow;
        // 1 · A real low cut, 4th order at 24 Hz. LeakDC alone was the only
        //     one: 6 dB/oct around 38 Hz, so 12-20 Hz from the kick's sub,
        //     the drone's 0.5 ratio, the pad and masa reached the speakers.
        // 2 · The lows in mono: below 120 Hz (Linkwitz-Riley, 4th order, so
        //     lows + highs sum back flat) the channels are summed and sent to
        //     every speaker alike. Wide bass cancels between speakers on a
        //     dome — measured on a take, side was only 3 dB under mid below
        //     80 Hz — and the room's six subwoofers want one signal.
        clean = clean.asArray.collect { |ch|
            LinXFade2.ar(ch, HPF.ar(HPF.ar(ch, 24), 24), carve * 2 - 1)
        };
        lows = clean.collect { |ch| LPF.ar(LPF.ar(ch, 120), 120) };
        monoLow = Mix(lows) / ~limiterChans.max(1);
        clean = clean.collect { |ch, i|
            LinXFade2.ar(ch, (ch - lows[i]) + monoLow, carve * 2 - 1)
        };
        // 3 · The compressor's key high-passed at 100 Hz, as on a mix bus:
        //     keyed full-band, the sub's energy pumped every layer.
        key = Mix(clean) / ~limiterChans.max(1);
        //     ×1.6 (+4 dB) puts the filtered key back near the level the
        //     threshold (0.10) was measured against, so carving takes the
        //     sub OUT of the gain riding without simply compressing less.
        key = LinXFade2.ar(key, HPF.ar(HPF.ar(key, 100), 100) * 1.6, carve * 2 - 1);

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
    //
    // 48 -> 96 for the ring stages (slots 0, O, T), which wrap this analysis
    // round a dial and let the performer zoom onto it: at 48 bands with
    // rq 0.4 each filter was ~0.57 octave wide against a 0.17-octave spacing,
    // so neighbouring bands overlapped three deep and the picture was a smear.
    // 96 bands are 1/12 octave apart; rq 0.12 makes each one about that wide.
    // A narrower filter passes less noise energy, so the reading is lifted by
    // sqrt(0.4 / rq) to keep broadband material — the forest, the noise beds —
    // at the level every consumer was calibrated on (scBins' curve,
    // publishScAudio, normLevel). A pure tone sits inside one band either way,
    // so it now reads up to that factor (~1.8x) higher; the consumers' curves
    // compress the top, and a partial standing out of the bed is the point.
    ~scopeBands = 96;
    ~scopeRq = 0.12;
    SynthDef(\masterScope, {
        var sig = Mix(In.ar(0, ~limiterChans)) / ~limiterChans.max(1);
        var bands = Array.geom(~scopeBands, 40, (10000 / 40) ** (1 / (~scopeBands - 1)));
        var makeup = (0.4 / ~scopeRq).sqrt;
        SendReply.kr(Impulse.kr(20), '/spectrum',
            bands.collect { |f| Amplitude.kr(BPF.ar(sig, (f).min(SampleRate.ir * 0.45), ~scopeRq), 0.01, 0.12) * makeup });
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
        var makeup = (0.4 / ~scopeRq).sqrt;
        SendReply.kr(Impulse.kr(20), '/spectrum/corpus',
            bands.collect { |f| Amplitude.kr(BPF.ar(sig, (f).min(SampleRate.ir * 0.45), ~scopeRq), 0.01, 0.12) * makeup });
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
        // LAGGED, like the mix buses beneath it — 0.08 is their figure too.
        //
        // This read was raw at all SEVEN sites, and the value multiplies the
        // signal directly: drone, pad, kick, perc, dust and both bell paths.
        // So any change to masterVolume stepped the amplitude of every
        // SUSTAINED voice inside one control block, and a step in a signal
        // that is already sounding is a click by definition.
        //
        // Loading a config is where it bit: ~loadConfig applies every stored
        // parameter in a single pass, masterVolume among them, so changing
        // preset from the SC GUI clicked every time. The mix faders had been
        // given exactly this treatment and the master had been left out.
        var masterVol = Lag.kr(Select.kr(masterVolBus >= 0, [0.3, In.kr(masterVolBus, 1)]), 0.08);
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
        sig = LPF.ar(sig, (spectralFreq.clip(200, 3000)).min(SampleRate.ir * 0.45));

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
        noise = LPF.ar(noise, (noiseFilter.linexp(0, 1, 200, 2000)).min(SampleRate.ir * 0.45));
        sig = sig + noise;

        // filterCutoff: broad tone tilt over the whole pad (was read and dropped).
        // Ceiling 12000 → 2600 Hz. At 12 kHz this filter was effectively open
        // and undid the 200–3000 Hz clamp applied earlier in the chain, so FM
        // sidebands and the grain shimmer passed straight through. The pads are
        // a drone bed; nothing in them needs to reach beyond ~2.6 kHz.
        sig = LPF.ar(sig, (Lag.kr(legacyFilter, 0.3).linexp(0, 1, 300, 2600)).min(SampleRate.ir * 0.45));
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
        //
        // spatialPos is SPREAD. It was read at the top of this SynthDef and
        // then never used, and no spawn passes spatialXBus either — so the
        // pads and bells, one of the loudest layers, sat dead centre whatever
        // SPREAD said. It now moves them like every other voice; the spatial
        // GUI's X still adds on top when that window is open.
        spatialX = (spatialX + spatialPos).clip(-1, 1);
        quadSig = if(~limiterChans >= 4) {
            PanAz.ar(4, sig.sum,
                Select.kr(spatialYBus >= 0,
                    [spatialX * 0.5, spatialX.atan2(spatialY) / pi]),
                1, 2, 0.5)
        } {
            Pan2.ar(sig.sum, spatialX)
        };
        
        Out.ar(out, quadSig);
    }).add;

    // --- Fors Opal Emulation Synths ---
    
    // opalKick: Deep FM/Distortion kick (Gem style)
    SynthDef(\opalKick, {
        arg mixCarveBus=(-1), out=0, freq=50, amp=0.5, atk=0.001, dec=0.4,
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

        var vol   = Lag.kr(Select.kr(masterVolBus >= 0, [0.3, In.kr(masterVolBus, 1)]), 0.08);
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
            ((110 + (nFilt * 350)).clip(80, 500)).min(SampleRate.ir * 0.45), 0.7);
        sig = sig + (click * nLevel.linlin(0, 0.5, 0.0, 0.75));

        // Distortion & Filter (Warm low-end drive)
        sig = (sig * (1 + (fmD * 2.5))).tanh;
        // Kick LPF: strictly capped at 280 Hz so kick remains a warm sub anchor
        sig = RLPF.ar(sig,
            ((filt.clip(80, 240) * Lag.kr(cutoff, dFade.clip(0.1, 5)).linexp(0, 1, 0.7, 1.3))
                .clip(50, 280)).min(SampleRate.ir * 0.45),
            res.linexp(0, 1, 0.85, 0.4));

        // droneDepth reaches the kick's own body: a sine an octave under the
        // drop, which is the difference between a click and something you feel.
        sub = SinOsc.ar(pitchEnv * 0.5) * dDepth.linlin(0, 1, 0.0, 0.85);
        sig = sig + sub;

        // Reverb tail and slap
        sig = sig + DelayC.ar(sig, 0.25, 0.055 + (dMix * 0.08), dMix * 0.35);
        // MEZCLA: the reverb's input loses its lows as mixCarve rises (none at 0).
        sig = sig + FreeVerb.ar(LinXFade2.ar(sig, HPF.ar(sig, 180), Lag.kr(Select.kr(mixCarveBus >= 0, [0, In.kr(mixCarveBus.max(0), 1)]).clip(0, 1), 0.25) * 2 - 1), revM * 0.35, 0.6, 0.2);

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
        arg mixCarveBus=(-1), out=0, freq=400, amp=0.3, bodySeed=0.0, 
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
        // The two halves of this voice, switchable independently. Buses so
        // the toggles reach every voice already sounding, not just the next
        // one struck; literals as a fallback when unwired.
        bowlOnBus=(-1), chinaOnBus=(-1), bowlOn=1, chinaOn=1,
        // Where the bowl's share of the room goes, and how much of it.
        chamberAux=(-1), bowlSend=0.6, bowlLevel=0.02, chinaLevel=4.0,
        // How present the percussion family is right now — DUST, PERC and
        // KICK cadences — computed per strike by ~percSpawn (5_beat_engine).
        // 1.0 at their default rates; a sparse config strikes the metals
        // quieter as well as rarer. See "The family" below.
        famPresence=1.0,
        // Per-strike envelope scale. timeDilation sets how long this voice
        // rings GLOBALLY; this scales one strike against that, so the same
        // instrument can be a 30 s bowl when the tide strikes it and a short
        // punctuation when the chain does. Without it every bell rang the full
        // length and, at one every 6 s, five of them overlapped permanently —
        // 32 resonators and a room-0.94 reverb each. That was the saturation.
        envScale=1.0,
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

        var vol   = Lag.kr(Select.kr(masterVolBus >= 0, [0.3, In.kr(masterVolBus, 1)]), 0.08);
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

        // ─── The family ───────────────────────────────────────────────────
        // dustLvl and kickLvl above were declared under "cross-layer
        // modulation" and then never read: the bowl and the china followed
        // MIX PERC and nothing else, so with DUST and KICK pulled down the
        // metals still rang out over a room that had gone quiet. They are one
        // family — the grains, the strikes, the pulse — and the metals now
        // answer to all three: the DUST and KICK faders here (MIX PERC still
        // scales the whole voice at the output), and the three cadences via
        // famPresence. Lagged so a fader move is a swell, not a step, on a
        // bowl that rings for half a minute.
        var family = Lag.kr(((dustLvl + kickLvl) * 0.5).clip(0, 2), 0.3)
            * famPresence.clip(0, 1.5);
        // ── The master reaches the room too ─────────────────────────────
        // The two chamber sends below (bowl and simpatía) used to leave this
        // voice BEFORE amp, masterVolume and MIX PERC were applied — those sat
        // on the dry path alone, at the very end. The dry path also carries
        // ~trimPerc (0.003) and the sends did not, so the send was ~70 dB above
        // the dry bowl: what was heard as BOWL was almost entirely the room,
        // and the room ignored MASTER VOL and MASTER AMP. At 0/0 the dry voice
        // was silent and the bowl still rang through the chamber at full level.
        //
        // The sends now ride the same three gains, normalised to the level
        // they had at the registry defaults (masterAmp 0.7 x a typical strike
        // 0.245, masterVolume 0.3, MIX PERC 1) so the calibrated room is
        // unchanged there and follows the master everywhere else.
        var mixPerc  = Lag.kr(Select.kr(mixPercBus >= 0, [1.0, In.kr(mixPercBus, 1)]), 0.08);
        var sendGain = amp * vol * mixPerc / (0.7 * 0.245 * 0.3);
        var exciter, sig, wet, quadSig, partials, decays, inharm, damp, spread;
        var shimmer, wash, chug, modeAmps, bend, shaped, bowlFreq, bowlGate, chinaGate;
        var symp, symPresence, symDecay;
        var bowl, trash, trashRatios, trashDecays, beats;

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
        // Two parts, and the second is the one that was missing.
        //
        // CONTACT — the instant of stick on bronze. Very fast, very bright,
        // gone in tens of ms. This is what the exciter already was.
        //
        // BODY — a SUSTAINED noise bed underneath it, decaying over hundreds
        // of ms. A cymbal is not struck-then-free like a bar: the plate keeps
        // feeding its own resonances as it flexes, so the filter bank has to
        // stay excited long after contact. Without it, 56 Ringz all decay from
        // a single 10 ms impulse and the result is a click with a tail rather
        // than a wash of metal. This is the "huge burst of white and pink
        // noise" a real china delivers.
        exciter = Mix([
            // Contact
            Dust2.ar(3000 + (nLevel * 12000))
                * EnvGen.ar(Env.perc(0.0002, 0.010 + (nFilt * 0.02))) * 1.2,
            HPF.ar(WhiteNoise.ar, (2500 + (nFilt * 4000)).min(SampleRate.ir * 0.45))
                * EnvGen.ar(Env.perc(0.0002, 0.006 + (nFilt * 0.012)))
                * nLevel.linlin(0, 0.5, 0.5, 1.6),
            BPF.ar(PinkNoise.ar, ((900 + (nFilt * 3500)).clip(400, 6000)).min(SampleRate.ir * 0.45), 0.6)
                * EnvGen.ar(Env.perc(0.002, 0.05 + (nFilt * 0.09)))
                * nLevel.linlin(0, 0.5, 0.4, 1.3),
            // Body — white over pink, the plate continuing to drive itself.
            // Curve -3 so it falls away steadily instead of hanging.
            (WhiteNoise.ar(0.55) + PinkNoise.ar(0.85))
                * EnvGen.ar(Env.perc(0.004, (0.45 * tStretch).clip(0.15, 1.6), 1, -3))
                * nLevel.linlin(0, 0.5, 0.5, 1.4)
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
        // A hardcoded CLUSTERED mode table, not a formula.
        //
        // The previous ladder was 1.0 + n^1.32 * 0.51, whose gaps grow smoothly
        // (0.76, 0.90, 1.00, 1.09, 1.16 ...). A monotone progression like that
        // is exactly what an FM bell partial series looks like, which is why it
        // read as electric rather than as metal: nothing in it beats, because
        // no two modes are ever close together.
        //
        // Real hammered bronze is CLUMPY. Modes crowd into groups with near
        // coincidences inside each group — 4.11/4.29, 6.22/6.51, 9.05/9.44 —
        // and wide gaps between groups. Those near-unisons beat against each
        // other at a few Hz, and that beating IS the trash. The set below is
        // irregular by construction and cannot be generated by any smooth
        // function, which is the point.
        // ── Two banks: a bowl that rings, and a cymbal that strikes ─────────
        //
        // The 56-mode china never came through. A dense bank of short modes is
        // a WASH — it has no centre, so at the sparse rates this layer runs at
        // each hit read as a burst of noise rather than as an event. What was
        // missing is a tone that stays in the room after the strike.
        //
        // So the voice is now a fusion, which is also how the two instruments
        // actually differ: a china is all attack and no sustain, a Tibetan
        // bowl is all sustain and almost no attack. Put the cymbal in the
        // first second and the bowl underneath it for the next thirty, and the
        // strike announces a tone instead of replacing it.
        //
        //   BOWL   7 shell modes, each with a detuned twin, ringing 4-30 s.
        //   TRASH  18 dense high modes on a short envelope — the mallet
        //          hitting the rim, gone in under a second.

        // Singing-bowl shell modes. Strongly inharmonic and SPARSE, which is
        // the opposite of the cymbal ladder: a bowl has a clear centre and a
        // handful of overtones, and that is why it reads as a pitch you can
        // hold on to rather than as metal noise.
        partials = #[1.00, 2.74, 5.12, 8.06, 11.53, 15.44, 19.78];

        // The wobble. Every bowl is slightly out of round, so each mode is
        // really a PAIR a few Hz apart, and the beating between them is the
        // slow pulse that makes a singing bowl recognisable. Offsets are in
        // absolute Hz, not ratios, because the beat rate of a real bowl barely
        // moves with pitch — and they come off bodySeed so each strike is a
        // different casting with its own wobble.
        beats = Array.fill(7, { |i|
            0.7 + ((bodySeed * (i + 1) * 5.73).sin.abs * 4.6);
        });

        // Long, and longer at the bottom. Mode 1 rings ~16 s at the default
        // timeDilation; the top of the shell fades in ~5 s. Clipped at 34 s so
        // a large timeDilation cannot leave a node alive indefinitely.
        // ── Bowl, not bell ───────────────────────────────────────────────
        //
        // The partial RATIOS were already right — 1, 2.74, 5.12, 8.06 is close
        // to a real singing bowl. The two ROLLOFFS made it a bell:
        //
        //   amp   (i+1)^-0.62   mode 6 at 0.299, sitting at 3956 Hz
        //   decay (i+1)^-0.42   mode 6 still ringing after 7.1 s
        //
        // A bell is defined by loud, long-lived upper partials. A bowl is
        // defined by the opposite: its energy sits in the first two or three
        // modes and everything above dies inside a second, which is why a
        // struck bowl settles into a hum instead of staying a chime.
        //
        //   amp   -0.62 -> -1.45   mode 6 down to 0.086, about 11 dB quieter
        //   decay -0.42 -> -1.15   mode 6 down to roughly 1.7 s
        //
        // The fundamental keeps its long ring — that is the bowl's whole
        // character. What goes is the bright tail sitting on top of it.
        decays = Array.fill(7, { |i|
            (((i + 1) ** -1.15) * (tStretch * 8.0) * envScale.clip(0.1, 2.0)
                * damp.linlin(1.2, 3.5, 1.25, 0.7)).clip(0.4, 34.0);
        });

        // The fundamental carries the tone; the overtones colour it.
        modeAmps = Array.fill(7, { |i| ((i + 1) ** -1.45) });

        // AN OCTAVE DOWN, and only the bowl. The beat engine hands this voice
        // 100-300 Hz, which for a bowl is a small one struck near the rim; a
        // large Tibetan bowl sings around 70-150. The china half keeps the
        // original register — a china cymbal is supposed to be bright, and
        // dropping both would only make the whole voice dull.
        bowlFreq = (freq * 0.5).clip(35, 480);

        bowl = Mix([
            (Ringz.ar(exciter, ((bowlFreq * partials).clip(30, 16000)).min(SampleRate.ir * 0.45), decays)
                * modeAmps).sum,
            // The twin bank, half a hair sharp and slightly quieter.
            (Ringz.ar(exciter,
                (((bowlFreq * partials) + beats).clip(30, 16000)).min(SampleRate.ir * 0.45), decays)
                * modeAmps).sum * 0.85
        ]) * 7.sqrt.reciprocal * 2.9;

        // The strike. Eighteen crowded, irregular, fast-dying modes — the
        // china reduced to what it is good at, which is the first moment.
        // Same hashed ladder as before so the spacing has no smooth function
        // under it, but spanning higher and decaying in well under a second.
        trashRatios = Array.fill(18, { |i|
            var t   = i / 17.0;
            var h   = ((i + 1) * 12.9898 + (bodySeed * 78.233)).sin * 43758.5453;
            var jit = h - h.floor;
            (6.0 * (5.6 ** t) * (1 + ((jit - 0.5) * 0.34))).clip(2.0, 62.0);
        });
        trashDecays = Array.fill(18, { |i|
            (((i + 1) ** -0.5) * (tStretch * 0.16)).clip(0.03, 0.6);
        });
        trash = Ringz.ar(exciter, ((freq * trashRatios).clip(200, 17000)).min(SampleRate.ir * 0.45), trashDecays)
            .sum * 18.sqrt.reciprocal * 3.4;
        // Confined to the attack. Without this envelope the dense bank runs
        // the whole length of the note and buries the bowl underneath it.
        trash = trash * EnvGen.ar(
            Env.perc(0.0005, (0.55 * tStretch).clip(0.15, 1.6), 1, -5));

        // textureDepth is now the BOWL <-> TRASH morph, which is the most
        // useful thing that knob can do on this voice: at 0 it is almost a
        // pure singing bowl, at 1 the china rim is fully present on the
        // attack. The bowl is always underneath either way — it is what makes
        // the hit an event rather than a noise burst.
        // ── BOWL and CHINA, switchable ──────────────────────────────────────
        // Each half can be taken out entirely. Lagged rather than hard-gated
        // so flipping a toggle while the layer is ringing is a fade, not a
        // click — a 32 s bowl cut dead mid-tail would be worse than the
        // problem the toggle solves.
        //
        // textureDepth still morphs between them when both are on; the
        // toggles decide whether each is in the sum at all.
        //
        // SQUARED: an audio taper, not a linear one. These are amplitude
        // faders, and a linear fader spends its whole bottom half inside the
        // first few dB — 0.1 was only -20 dB, and after the chamber's tanh loop
        // and the master glue compressor (3:1 above 0.10, x1.5 makeup) that
        // came out sounding like 0.5. Squared, 0.1 is -40 dB going in, 0.5 is
        // -12 dB, and 1.0 is exactly what it was.
        bowlGate = Lag.kr(
            Select.kr(bowlOnBus >= 0, [bowlOn, In.kr(bowlOnBus, 1)]).clip(0, 1).squared, 0.4);

        // ── The bowl rings the room ──────────────────────────────────────
        // Sent into the chamber's aux ON TOP of the dry path, and only while
        // the bowl half is active. A struck bowl in a stone room is mostly
        // room: the direct sound is brief and what is heard for the next half
        // minute is the building answering. Gated by bowlGate, so switching
        // BOWL off takes the resonance with it rather than leaving the room
        // lit by a voice that is no longer there.
        //
        // Pre-envelope on purpose — the send carries the bowl's own long modal
        // decay into a space that decays again on its own terms, which is what
        // makes the tail belong to the room rather than to the note.
        // .max(0) on the index and the (>= 0) factor on the signal: an unset
        // aux would otherwise be Out.ar(-1, ...), which is not a bus. With the
        // guard an unset aux writes silence to bus 0, and Out.ar ADDS, so that
        // is exactly a no-op rather than a leak into the main mix.
        // bowlLevel applies here too: the room should hear the bowl at the
        // level the bowl is actually being played at, not at the one it had
        // before it was balanced against the china.
        Out.ar(chamberAux.max(0),
            bowl * bowlGate * bowlLevel.clip(0, 2)
                * bowlSend.clip(0, 1) * 0.55 * family * sendGain * (chamberAux >= 0));

        chinaGate = Lag.kr(
            Select.kr(chinaOnBus >= 0, [chinaOn, In.kr(chinaOnBus, 1)]).clip(0, 1).squared, 0.4);

        // ── Balance ──────────────────────────────────────────────────────
        // The china is scaled by fmD.linlin(0.10, 1.05) and the bowl by
        // nothing at all — it went out at unity while the china was attenuated
        // by up to ten times. On top of that the trash is confined to the
        // attack while the bowl rings for sixteen seconds, so even at equal
        // peak the bowl delivers far more energy and reads far louder.
        //
        // MEASURED this time, not estimated. Ringz output scales with DECAY
        // TIME, and that is the whole imbalance — the bowl's fundamental rings
        // 20 s against the trash's 0.32 s:
        //
        //   bowl   sum(decay x modeAmp) x 2 banks   = 51.23
        //   trash  sum(decay) / sqrt(18) x 3.4      =  1.83
        //                                     ratio = 28 : 1
        //
        // My previous 0.4 left it at 19.5 : 1, which is why 0.05 on the fader
        // was already too loud: 0.05 was doing the job 1.0 should do.
        //
        //   bowl  51.23 x 0.04          = 2.05
        //   china  1.83 x 0.575 x 2.0   = 2.10     parity at fader 1.0
        //
        // 0.04 was still 2x too loud, and the ear had already given the number:
        // "the BOWL slider at 0.05 is already too loud" means slider 0.05 is
        // the loudness the bowl should have at FULL THROW. At the old 0.4 that
        // is 0.4 x 0.05 x 51.23 = 1.02, so bowlLevel is 0.02, not 0.04 —
        // 0.02 x 51.23 = 1.02, the same figure, now reached at the top of the
        // fader instead of at one twentieth of it. The whole throw is usable.
        //
        //   bowl  51.23 x 0.02          = 1.02
        //   china  1.83 x 0.575 x 4.0   = 4.21     4.1 : 1 to the china on
        //                                          peak, against 50 : 1 to the
        //                                          bowl on sustain.
        //
        // chinaLevel 2.0 -> 4.0, ceiling 4 -> 8. Parity was the wrong target:
        // measured they matched, but the bowl SUSTAINS for sixteen seconds
        // while the trash is confined to the attack, and a long tone reads far
        // louder than a short one at the same peak. So the bowl was "loud
        // enough" at a fader of 0.04 while the china at 0.99 was still thin.
        //
        // The china carries the presence now, which is the right way round: it
        // is the half that announces the strike. Nothing about either voice's
        // TIMBRE is touched — this is two multipliers.
        //
        // ── Simpatía: the two voices ringing one another ─────────────────
        // Two metals in one room do not simply sum. The china's strike is a
        // broadband transient, and a bowl standing nearby answers it — the
        // plate excites the bowl's modes without anybody touching the bowl.
        // That sympathetic ring is the drone: not a third voice added on top,
        // but what the pair produce BETWEEN them, sustained where each of them
        // alone is an event.
        //
        // symPresence is the PRODUCT of the two gates, so this layer exists
        // only in the overlap. Either fader at zero and it is exactly zero:
        // BOWL alone and CHINA alone are bit-identical to what they were, and
        // neither voice's own timbre is touched. It is presence together that
        // makes it — which is the same rule the chamber runs on, where a
        // quorum of voices is what gives the room its reverberation time.
        //
        // Driven by the china's own trash, high-passed so it is the strike
        // and not the body doing the exciting, into the bowl's lowest three
        // modes at 1.7x their decay. Normalised by 4/symDecay because Ringz
        // output scales with decay time — without it timeDilation would turn
        // the coupling into a runaway, which is the mistake this file has
        // already made once.
        symDecay = (decays[0] * 1.7).clip(0.6, 40.0);
        symp = Ringz.ar(
            HPF.ar(trash, 900) * 0.25,
            ((bowlFreq * [1.0, 2.74, 5.12]).clip(30, 12000)).min(SampleRate.ir * 0.45),
            [symDecay, symDecay * 0.55, symDecay * 0.3]
        );
        symp = (symp * [1.0, 0.5, 0.24]).sum * 3.sqrt.reciprocal
            * (4.0 / symDecay.max(0.6));
        symPresence = bowlGate * chinaGate;
        symp = LeakDC.ar(symp) * symPresence
            * bowlLevel.clip(0, 2) * chinaLevel.clip(0, 8) * 4.0;

        // Mostly into the room, a little in the dry path. A sympathetic ring
        // heard dry is an effect; heard through the chamber it is the building
        // holding a note the players never struck. Out.ar ADDS, so this is a
        // second send to the same aux the bowl already feeds.
        Out.ar(chamberAux.max(0),
            symp * bowlSend.clip(0, 1) * 0.9 * family * sendGain * (chamberAux >= 0));

        // mixPerc is still the fader for the struck voice as a whole.
        sig = (symp * 0.45)
            + (bowl * bowlGate * bowlLevel.clip(0, 2))
            + (trash * fmD.linlin(0, 1, 0.10, 1.05) * chinaGate
                * chinaLevel.clip(0, 8));

        // The trash. A china's signature is a wide, unstable band of noise
        // sitting ON TOP of the modes, sweeping as the plate wobbles. The
        // previous version deliberately caged this at 650 Hz to kill a "9 kHz
        // scream"; for a china that band is not a defect, it is the instrument.
        // Two detuned bands beating against one another so it never sits still.
        shimmer = Mix([
            BPF.ar(exciter, ((freq * 7.0 * LFNoise1.kr(5.5).range(0.86, 1.18))
                .clip(600, 13000)).min(SampleRate.ir * 0.45), 0.09),
            BPF.ar(exciter, ((freq * 11.5 * LFNoise1.kr(3.1).range(0.90, 1.12))
                .clip(900, 15000)).min(SampleRate.ir * 0.45), 0.07)
        ]) * 5 * res.linlin(0.1, 0.8, 0.5, 1.4);
        // All three noise layers below are now the STRIKE, not the voice. The
        // bowl is what should be left in the room after half a second, so
        // these come down hard — at their old levels they simply buried it.
        // ── The bright layers belong to the CHINA ────────────────────────
        // shimmer, wash and chug were added AFTER the two-half gate, so neither
        // toggle touched them. With BOWL on and CHINA off the modal bank played
        // at 35-150 Hz and all three of these played on top of it — two
        // band-passes at freq x7 and x11.5, band-passed noise at x6.5, and
        // eight saturated pulses high-passed at 400-5000 Hz. That is the bell
        // that would not go away, and it is why steepening the modal rolloffs
        // changed so little: it darkened the half that was already dark.
        //
        // They are attack colour, which is the china's whole character — the
        // two-bank note above says it outright: "a china is all attack and no
        // sustain, a Tibetan bowl is all sustain and almost no attack." They
        // were ungated by omission, not by design.
        sig = sig + (shimmer * fmD.linlin(0, 1, 0.12, 0.38) * chinaGate);

        // ── The wash between the modes ──────────────────────────────────────
        // A resonator bank alone is always a little synthetic: it is discrete
        // pitches and nothing in between, which the ear reads as an FM bell no
        // matter how inharmonic the ratios are. Real bronze has a continuous
        // noise floor across its whole range — the sheet itself vibrating,
        // unresolved into modes — and it decays alongside them.
        //
        // Bandpassed noise, sharply excited and decaying faster than the modes,
        // so it is heard as part of the strike rather than as a layer added
        // underneath. This is what carries the "trash".
        wash = BPF.ar(
            WhiteNoise.ar,
            ((freq * 6.5 * LFNoise1.kr(0.8).range(0.75, 1.35)).clip(500, 14000)).min(SampleRate.ir * 0.45),
            1.6
        ) * EnvGen.ar(Env.perc(0.001, (0.30 * tStretch).clip(0.10, 1.4), 1, -5))
          * res.linlin(0.1, 0.8, 0.35, 1.1) * 0.22;
        sig = sig + (wash * chinaGate);

        // ── The chug: inharmonic square-wave cluster ────────────────────────
        // The third layer of the standard china model. Eight Pulse oscillators
        // on deliberately UNharmonised fractional ratios collide into each
        // other before the noise takes over — that collision is the metallic
        // "weight" a filtered-noise cymbal always lacks, because noise alone
        // has no partials to beat.
        //
        // Highpassed hard: the point is the interference between them up in
        // the plate's register, not their fundamentals. Very short envelope so
        // it is part of the ATTACK — a china's chug is gone in ~100 ms, and
        // leaving it longer would turn the voice into a drone.
        chug = Mix(
            #[1.34, 1.79, 2.11, 2.67, 3.41, 4.23, 5.19, 6.44].collect { |r, i|
                Pulse.ar(
                    (freq * r * (1 + ((bodySeed * (i + 2) * 3.1).sin * 0.02)))
                        .clip(60, 9000),
                    // Width varies per oscillator; a cluster of identical
                    // squares sounds like one square, not like metal.
                    0.28 + ((i % 3) * 0.13),
                    1.0 / 8
                )
            }
        );
        chug = HPF.ar(chug, ((freq * 3.2).clip(400, 5000)).min(SampleRate.ir * 0.45));
        chug = (chug * (1 + (fmD * 2.2))).tanh;
        sig = sig + (chug
            * EnvGen.ar(Env.perc(0.0008, (0.10 * tStretch).clip(0.04, 0.35), 1, -6))
            * res.linlin(0.1, 0.8, 0.12, 0.34) * chinaGate);

        // Doppler comb tail
        bend = CombC.ar(sig * 0.35, 0.35,
            LFNoise1.kr(0.4 + (bodySeed * 2)).range(0.01, 0.15).clip(0.005, 0.25),
            dFeed.linlin(0, 0.8, 0.2, 2.0));
        // The comb IS the echo. A CombC at 10-150 ms with up to 2 s of decay
        // repeats rather than resonates, and short comb delays are pitched, so
        // it was also half of the "metallic". Gated: with CHINA off the bowl's
        // tail is its own modal decay plus the chamber, which is a room and
        // not a repeat — resonance rather than echo.
        sig = sig + (LeakDC.ar(bend.tanh) * dMix.linlin(0, 1, 0.3, 0.8) * chinaGate);

        // Saturation. tanh across the whole band for the metallic bite, plus a
        // SMALL sine fold on a band-limited copy for the clangour.
        //
        // The fold is deliberately fed from a 5 kHz lowpass: SinOsc-as-
        // waveshaper folds, and folding this much 10 kHz+ energy at 48 kHz
        // would alias straight back down as an inharmonic whistle. Lowpassing
        // first keeps every fold product under Nyquist.
        shaped = (sig * fmD.linlin(0, 1, 1.4, 4.2)).tanh
            / (1 + (fmD * 0.3));
        // These two stages are described in the comment above as "the metallic
        // bite" and "the clangour" — they are china character by their own
        // account, and they were being applied to everything.
        //
        // The china gate blends LINEARLY between fully dry and the full-throw
        // crossfade. It used to move XFade2's pan instead, and XFade2 is
        // equal-power: at a gate of 0.1 the wet side was already at 0.21, and
        // the wet side is a tanh — its level does not depend on the fader at
        // all. So CHINA at 0.1 brought in a fifth of a fully saturated copy of
        // the whole voice. Identical at gate 1, fully dry at gate 0, and
        // proportional in between.
        sig = (sig * (1 - chinaGate))
            + (XFade2.ar(sig, shaped, fmD.linlin(0, 1, -0.4, 0.9)) * chinaGate);
        sig = sig + (SinOsc.ar(0, LPF.ar(sig, 5000) * fmD.linlin(0, 1, 0.7, 2.6))
            * fmD.linlin(0, 1, 0.08, 0.34) * chinaGate);
        sig = LeakDC.ar(sig);

        // Brightness as a TILT, not a wall. The old pair of lowpasses capped
        // this voice at 850 Hz by two independent mechanisms — the second one
        // fixed and unreachable by any control — which is what made a bank of
        // metal resonators come out sounding like a wood block. A china lives
        // almost entirely above that line.
        sig = LPF.ar(sig,
            ((filt.clip(400, 11000)
                * Lag.kr(cutoff, dFade.clip(0.1, 5)).linexp(0, 1, 0.55, 1.9))
                .clip(700, 17000)).min(SampleRate.ir * 0.45));
        // High shelf instead of a backstop: tames the very top without
        // removing it, so the plate stays bronze rather than turning to glass.
        // Shelf moved up and eased: 7 kHz/-3.5 dB was shaving the top of a
        // 56-mode bank whose highest resonances are the point. A china is a
        // bright, harsh instrument; this only takes the edge off the very top.
        sig = BHiShelf.ar(sig, (9500).min(SampleRate.ir * 0.45), 1.0, -2.0);
        // The plate has no fundamental down here; this only stops the comb and
        // reverb accumulating sub-bass that the master compressor would key on.
        sig = HPF.ar(sig, 180);

        // 1 ms attack — 30 ms is a mallet on wood. Curve -4.5 so it collapses
        // fast then rattles out, which is the china's shape. Clipped so a large
        // timeDilation cannot produce a synth that never frees.
        sig = sig * EnvGen.ar(
            // 0.9 -> 1.8 * tStretch. The bank now sustains — 56 resonators
            // fed by a 450 ms noise body — and a 0.9 s amp envelope was
            // cutting the wash off while it was still developing. A 24" china
            // rings for seconds; curve -4.5 keeps the fast initial collapse so
            // it still reads as a trash hit rather than a pad.
            // 1.8 -> 4.2 * tStretch. Rare events have to be LONG or they read
            // as clicks in a gap; now that percRate defaults to a few hits a
            // minute, each one is allowed to ring out and fill the space it
            // was given. Curve -4.5 keeps the fast initial collapse so it is
            // still a struck plate, not a swell.
            // 4.2 -> 16.0 * tStretch. The bowl's fundamental rings ~16 s and
            // the amp envelope was cutting the whole voice at 8.4 s, so the
            // tail was being removed before it could develop. Curve -3.2
            // rather than -4.5: a bowl decays gently, it does not collapse.
            // Clipped at 40 s so a large timeDilation cannot strand a node.
            Env.perc(0.002, (16.0 * tStretch * envScale.clip(0.1, 2.0)).clip(0.6, 40.0), 1, -3.2),
            doneAction: 2);

        // Ping-pong delay + Reverb
        //
        // The SECOND comb in this voice, and the other half of the echo. 80 ms
        // with a 1 s decay is a slapback: it REPEATS, where the complaint was
        // that the bowl echoes instead of resonating. Gated with the china
        // like the rest of this colouring — the comment below says what the
        // whole block is for, "a 24 inch china in a hall is mostly its own
        // reflections", and that is a statement about the cymbal.
        //
        // With CHINA off the bowl's ambience is the per-voice FreeVerb beneath
        // this plus the shared chamber it sends into. A reverb is resonance; a
        // comb is a repeat. The bowl keeps the first and loses the second.
        wet = CombC.ar(sig, 0.4, 0.08, 1.0) * dMix * 0.7 * chinaGate;
        sig = sig + wet;
        // The room. A 24" china in a hall is mostly its own reflections, and
        // this is the layer that makes a rare strike feel like it happened
        // somewhere rather than in the mix. Room size 0.7 -> 0.94 and damping
        // 0.4 -> 0.15, so the tail is long and stays bright instead of going
        // muddy — bronze reflections keep their top end.
        // MEZCLA: the reverb's input loses its lows as mixCarve rises (none at 0).
        sig = sig + FreeVerb.ar(LinXFade2.ar(sig, HPF.ar(sig, 180), Lag.kr(Select.kr(mixCarveBus >= 0, [0, In.kr(mixCarveBus.max(0), 1)]).clip(0, 1), 0.25) * 2 - 1), revM * 0.85, 0.94, 0.15);

        sig = sig * amp * vol * ~trimPerc * family * mixPerc;

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
        // envScale multiplies the whole envelope. It exists because the pad's
        // envelope was hardcoded at [8,28,35,18] (~89 s at tScale 1.0) with no
        // way to shorten it, which made the /cadence/pad rate knob inert below
        // about 45 s: the routine would spawn, hit padMax, and then skip every
        // cycle until a voice finally freed itself ~89 s later. The knob set
        // the spacing but padMax was what actually gated the layer, so only
        // the level fader appeared to do anything.
        // motion, NOT tempo, for the LFOs.
        //
        // padMotion was passed as \tempo, and tempo DIVIDES this voice's
        // envelope — [8,28,35,18] / tempo. So the knob labelled PAD MOTION was
        // silently also the knob for the fades:
        //
        //   padMotion 0.5  ->  173 s envelope, 15.5 s attack
        //   padMotion 1.0  ->   86 s            7.8 s   (what it was tuned to)
        //   padMotion 4.0  ->   22 s            1.9 s   a bed pecking
        //
        // The spawn site's own comment says a bed must not track the beat and
        // that its only time control is timeDilation — and then handed the
        // envelope to a second knob anyway. They are two arguments now: tempo
        // stays at 1.0 and owns the envelope, motion owns every LFO. The fades
        // are exactly what they were at any motion setting.
        arg mixCarveBus=(-1), out=0, gate=1, freq=110, amp=0.18, tempo=1.0, motion=1.0, ratio=1.0, pan=0,
            envScale=1.0,
            masterVolBus=(-1), pitchBus=(-1), timeBus=(-1), spectralBus=(-1),
            spatialBus=(-1), textureBus=(-1), atmosphereBus=(-1), memoryBus=(-1),
            harmonicBus=(-1), resonantBus=(-1),
            masterAmpBus=(-1), filterCutoffBus=(-1), noiseLevelBus=(-1),
            noiseFiltBus=(-1), droneDepthBus=(-1), droneFadeBus=(-1),
            // Matrix mixer: this layer's live level (0=mute, 1=unity, 2=max)
            mixPadBus=(-1),
            // Register, live. Read here rather than folded into \freq at the
            // spawn so it reaches voices that are ALREADY SOUNDING — a pad
            // voice lives 43-94 s and a spawn-time pitch made the control look
            // broken for a minute and a half.
            padPitchBus=(-1),
            // The sidechain, from ~padDuckBus (5_beat_engine): 0 = nothing
            // else speaking, 1 = a strike, a sample or the corpus is.
            duckBus=(-1);

        var masterVol  = Lag.kr(Select.kr(masterVolBus >= 0, [0.28, In.kr(masterVolBus, 1)]), 0.08);
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
        // Lag 4 s: the bed GLIDES to a new register rather than jumping. On a
        // voice whose attack alone is 7-14 s a step would be the only sudden
        // thing in the layer, and the point of the control is where the pad
        // sits, not that it can be made to lurch.
        var padPitch = Lag.kr(
            Select.kr(padPitchBus >= 0, [0.6, In.kr(padPitchBus, 1)]).clip(0.40, 1.0), 4.0);
        // MEASURED, and the answer was the spec, not the floor.
        //
        // baseFreq is freq(55) x ratio x padPitch, and the ratio set spans
        // 0.5..2.25. At padPitch 0.125 the root alone is 6.9 Hz, so EVERY voice
        // landed on the clip and the entire bottom of the fader produced one
        // identical sound. 14 of the 45 ratio/position combinations were pinned:
        //
        //   padPitch 0.125   every ratio pinned
        //   padPitch 0.25    5 of 9 pinned
        //   padPitch 0.50    1 of 9 pinned
        //
        // Lowering the floor further does not help — 7 Hz is not a quieter
        // note, it is no note. The spec now starts at 0.40 (root 22 Hz, and
        // 11 Hz on the lowest ratio, which fades into the sub rather than
        // sitting on a clip) and the floor comes down to 14 to meet it. The
        // whole travel of the fader now moves the sound.
        // MEZCLA: carved, the pad climbs up to x1.6 (none at 0) so it lives
        // above the kick instead of on it; \stemSum cuts it at 60 Hz.
        var baseFreq = (freq * ratio * padPitch * (1 + (Lag.kr(Select.kr(mixCarveBus >= 0, [0, In.kr(mixCarveBus.max(0), 1)]).clip(0, 1), 0.25) * 0.6))
            * (pShift.clip(-24, 24) / 12).midiratio).clip(14, 900);

        // ── Long evolving envelope (8s atk / 28s sustain / 18s release)
        // tDil stretches all stages so the timeDilation knob makes this
        // voice breathe faster or slower in sync with the whole engine.
        var tScale = tDil.linlin(0.5, 6.0, 0.6, 1.8);
        var env = EnvGen.kr(
            Env([0, 0.65, 1.0, 0.80, 0],
                [8, 28, 35, 18] * tScale * envScale.clip(0.12, 2.5) / tempo.max(0.1),
                // Curve 2 on the attack is strongly CONVEX — it rises fast and
                // then flattens, so most of the level arrives in the first
                // fifth of the stage. At a full-length envelope that is only
                // slightly abrupt; once envScale shortens the swell it becomes
                // an audible chirp, because an 8 s attack at 0.29x is 2.3 s of
                // which the first half-second does most of the work.
                //
                // \sin on the way in and out instead: a bed should arrive and
                // leave without ever being heard to start.
                [\sin, -2, 3, \sin]),
            gate, doneAction: 2);

        // Slow time reference for filter and formant drift
        var time   = SinOsc.kr(0.018 * motion);
        var time2  = SinOsc.kr(0.007 * motion + 0.31);

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
        var wobbleCut = SinOsc.kr([0.063, 0.041] * motion).range(0.85, 1.18);
        var wobbleRes = SinOsc.kr([0.037, 0.027] * motion).range(0.30, 0.65);
        var fCutHz = (filt.clip(200, 3500)
            * Lag.kr(cutoff, dFade.clip(0.5, 6)).linexp(0, 1, 0.42, 2.0)
            + (time * 480)
            + LFNoise1.kr(0.28).range(0, 240));
        var filtered = RLPF.ar(
            (warmOsc + vocalSim),
            ((fCutHz * wobbleCut).clip(60, 6000)).min(SampleRate.ir * 0.45),
            wobbleRes);

        // ── Tape saturation ───────────────────────────────────────────────────
        // 2.2× into tanh: subtle drive that rounds peaks, not a harsh clip.
        var tapeSat = (filtered * 2.2).tanh * 0.56;

        // ── Dust crackle texture ──────────────────────────────────────────────
        // nLevel controls crackle density — near-zero at default, audible
        // as fine rice-paper surface texture when pushed.
        var crackle = Dust.ar([0.4, 0.55] * motion)
            * Decay.ar(Dust.ar([0.8, 1.1] * motion), 0.04)
            * nLevel.linlin(0, 0.5, 0.015, 0.06);

        // ── Slow stereo drift ─────────────────────────────────────────────────
        // Balance2 with a 0.03 Hz SinOsc slowly rotates the image rather than
        // placing the voice statically.  pan arg biases the centre position.
        //
        // And SPREAD moves the centre. spatialBus was declared on this
        // SynthDef and never read, so the pad — the widest, most sustained
        // layer — ignored SPREAD entirely while the struck voices obeyed it.
        var spreadPos = Lag.kr(Select.kr(spatialBus >= 0, [0.0, In.kr(spatialBus, 1)]), 0.2);
        var panOsc = (SinOsc.kr(0.031 * motion) * 0.4 + pan.clip(-0.5, 0.5)
            + spreadPos).clip(-1, 1);
        var sig = Balance2.ar(
            tapeSat + crackle[0],
            tapeSat + crackle[1],
            panOsc);

        // ── Reverb tail ───────────────────────────────────────────────────────
        // atmMix feeds the same FreeVerb used on every other voice, so the
        // space setting is consistent across the ensemble.
        // MEZCLA: the reverb's input loses its lows as mixCarve rises (none at 0).
        sig = sig + (FreeVerb2.ar(*(LinXFade2.ar(sig, HPF.ar(sig, 180), Lag.kr(Select.kr(mixCarveBus >= 0, [0, In.kr(mixCarveBus.max(0), 1)]).clip(0, 1), 0.25) * 2 - 1).asArray.keep(2) ++ [atmMix, 0.85, 0.5])) * 0.38);

        // ── Output chain ──────────────────────────────────────────────────────
        // HPF removes subsonic energy from the detuned Saws; Compander applies
        // gentle LA-2A-style gain riding; LeakDC removes any DC before Out.
        sig = HPF.ar(sig, 28);
        sig = Compander.ar(sig, sig, 0.28, 1.0, 0.30, 0.012, 0.32);
        sig = LeakDC.ar(sig);

        // ── Making room ───────────────────────────────────────────────────
        // What a mixing engineer would do to a pad that swallows the mix,
        // done inside the voice so it holds at every preset.
        //
        // 1. A static cut where the voice's signature lives: the two formant
        //    bands of vocalSim (780 Hz, ~1.1-1.5 kHz) and the saturated saw
        //    harmonics over them. -4 dB, wide. This is the band that masked
        //    the bowl, the china and the corpus even when nothing moved.
        // 2. A sidechain that splits the pad at 250 Hz. The low band — the
        //    warmth under everything — ducks only 3 dB; the band above it
        //    ducks up to 12 dB whenever the family, a sample or the corpus
        //    is speaking. Fast in (40 ms), slow out (1.4 s), so it breathes
        //    back after each strike instead of pumping.
        // 3. The trim, 0.60 -> 0.45 (-2.5 dB): with the band cleared it no
        //    longer needs the level to be heard.
        sig = BPeakEQ.ar(sig, 1100, 1.4, -4.0);
        sig = {
            var duck = LagUD.kr(Select.kr(duckBus >= 0, [0.0, In.kr(duckBus, 1)]).clip(0, 1), 0.04, 1.4);
            var low  = LPF.ar(LPF.ar(sig, 250), 250);
            (low * (1 - (duck * 0.29))) + ((sig - low) * (1 - (duck * 0.75)));
        }.value;

        // Level: masterVol × ~trimPad × mixPadBus (same chain as elektronBell)
        sig = sig * amp * masterVol * env * ~trimPad
            * Lag.kr(Select.kr(mixPadBus >= 0, [1.0, In.kr(mixPadBus, 1)]), 0.12);

        Out.ar(out, sig);
    }).add;
    // ─── End \biocratiaPad ────────────────────────────────────────────────────

    SynthDef(\dronePartial, {
        arg mixCarveBus=(-1), out = 0, freq = 110, amp = 0.10, ratio = 1.0,
            atk = 20, hold = 30, rel = 25, pan = 0, detune = 0.004, seed = 0,
            // Where this partial sits across the three synthesis regimes. The
            // ensemble spreads it across the bed so no two voices are made of
            // the same thing at the same moment.
            character = 0.5,
            masterVolBus=(-1), pitchBus=(-1), spectralBus=(-1), spatialBus=(-1),
            textureBus=(-1), atmosphereBus=(-1), harmonicBus=(-1), resonantBus=(-1),
            masterAmpBus=(-1), filterCutoffBus=(-1), droneFadeBus=(-1),
            droneSpaceBus=(-1), mixDroneBus=(-1), strikeBus=(-1);

        var vol   = Lag.kr(Select.kr(masterVolBus >= 0, [0.3, In.kr(masterVolBus, 1)]), 0.08);
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
            BPF.ar(PinkNoise.ar(1.0), (bf.clip(20, 14000)).min(SampleRate.ir * 0.45),
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

        sig = LPF.ar(sig, ((filt.clip(80, 4000) * cutoff.linexp(0, 1, 0.6, 2.2)
            // Percussive energy opens the partial: the bed brightens under a
            // cluster of strikes and darkens again in the silences.
            // 0.75 -> 0.34. At the old depth a saturated cluster opened the
            // brightest partials by 1.9x, which is not "resonating with the
            // strikes", it is the percussion playing the drone.
            * (1 + (strike * respond * 0.34))
            // …and so does the voice's own internal incident.
            * (1 + (grit * 1.8))).clip(90, 13000)).min(SampleRate.ir * 0.45));
        // MEZCLA: the reverb's input loses its lows as mixCarve rises (none at 0).
        sig = sig + (FreeVerb.ar(LinXFade2.ar(sig, HPF.ar(sig, 180), Lag.kr(Select.kr(mixCarveBus >= 0, [0, In.kr(mixCarveBus.max(0), 1)]).clip(0, 1), 0.25) * 2 - 1), revM * 0.7, dSpace.linlin(0, 1, 0.4, 0.95), 0.15) * 0.5);

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
            // Guarded again, with the RIGHT number this time (13.0 * 0.115).
            //
            // Removing the guard was a mistake and it is worth saying why: in
            // sclang `sig * nil` inside a SynthDef body THROWS at build time,
            // and a SynthDef that throws is simply never added — the error
            // prints once to the post window and the piece carries on without
            // that voice. So the failure mode I removed the guard to avoid,
            // a silently missing layer, is exactly the one removing it causes.
            // A wrong fallback is audible and fixable; a missing SynthDef is
            // just silence.
            * Lag.kr(mAmp, 2.0).linlin(0, 1, 0.05, 1.4) * (~trimDronePartial ? 1.495)
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

        var vol   = Lag.kr(Select.kr(masterVolBus >= 0, [0.3, In.kr(masterVolBus, 1)]), 0.08);
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
            (LFNoise2.kr(0.05).exprange(filt.clip(80, 3000) * 0.5, filt.clip(80, 3000) * 1.5).clip(80, 4500)
                * Lag.kr(cutoff, dFade).linexp(0, 1, 0.5, 2.0)).min(SampleRate.ir * 0.45),
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
                (LFNoise1.kr(0.02 + (i * 0.007))
                    .exprange(90, (120 + (nFilt * 3800)).clip(150, 4000))).min(SampleRate.ir * 0.45),
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
        arg mixCarveBus=(-1), out=0, amp=0.2,
        masterVolBus=(-1), textureBus=(-1), spectralBus=(-1), timeBus=(-1), pitchBus=(-1),
        memoryBus=(-1), atmosphereBus=(-1), spatialBus=(-1),
        // Reach added: harmonicRich to give the crackle a resonant pitch,
        // resonantBody to sharpen it, the two noise controls for the bed under
        // it, filterCutoff as the tilt and delayFeedback for the comb.
        harmonicBus=(-1), resonantBus=(-1), filterCutoffBus=(-1),
        noiseLevelBus=(-1), noiseFiltBus=(-1), delayFeedbackBus=(-1), droneFadeBus=(-1),
        // Matrix mixer: this layer's live level (0 = mute, 1 = unity, 2 = max).
        mixDustBus=(-1), mixSampleBus=(-1), mixPadBus=(-1), mixKickBus=(-1), mixPercBus=(-1);

        var vol   = Lag.kr(Select.kr(masterVolBus >= 0, [0.3, In.kr(masterVolBus, 1)]), 0.08);
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

        ring = Ringz.ar(grains, (tunedPitch).min(SampleRate.ir * 0.45), res.linlin(0, 1, 0.04, 0.30) * tStretch);
        ring = ring + (Resonz.ar(grains, (tunedPitch * 1.5).min(SampleRate.ir * 0.45), 0.18) * 0.6);
        sig = grains + (ring * fmR.linexp(0.1, 5, 0.1, 0.8));

        // Soft pink noise bed under the grains
        bed = BPF.ar(PinkNoise.ar,
            ((180 + (nFilt * 800)).clip(120, 1200)).min(SampleRate.ir * 0.45),
            0.4 + (nFilt * 0.5)) * nLevel.linlin(0, 0.5, 0.0, 0.4);
        sig = sig + bed;

        // ── Warm Analog High-Cut Filter (cutting all harsh high freqs)
        // MEZCLA: the 1.2 kHz ceiling held dust in the low mids, adding mud
        // instead of detail. With mixCarve it opens toward 6 kHz (exactly
        // 1.2 kHz at 0), and \stemSum cuts dust below 250 Hz: dust carries
        // the presence of the rhythm instead of its body.
        sig = LPF.ar(sig,
            ((filt.clip(180, Lag.kr(Select.kr(mixCarveBus >= 0, [0, In.kr(mixCarveBus.max(0), 1)]).clip(0, 1), 0.25).linexp(0, 1, 1100, 5000))
                * Lag.kr(cutoff, dFade.clip(0.1, 5)).linexp(0, 1, 0.6, 1.4)).clip(120, Lag.kr(Select.kr(mixCarveBus >= 0, [0, In.kr(mixCarveBus.max(0), 1)]).clip(0, 1), 0.25).linexp(0, 1, 1200, 6000))).min(SampleRate.ir * 0.45));
        sig = LPF.ar(sig, (Lag.kr(Select.kr(mixCarveBus >= 0, [0, In.kr(mixCarveBus.max(0), 1)]).clip(0, 1), 0.25).linexp(0, 1, 1200, 6000)).min(SampleRate.ir * 0.45)); // backstop: 1.2 kHz, or up to 6 kHz carved
        sig = (sig * 1.3).tanh;  // Tape saturation warmth

        // Delay + Reverb wash
        wet = CombC.ar(sig, 0.5, 0.12, Lag.kr(dFeed, 0.2).linexp(0, 1, 0.2, 4.0)) * dMix * 0.8;
        sig = sig + wet;
        // MEZCLA: the reverb's input loses its lows as mixCarve rises (none at 0).
        sig = sig + FreeVerb.ar(LinXFade2.ar(sig, HPF.ar(sig, 180), Lag.kr(Select.kr(mixCarveBus >= 0, [0, In.kr(mixCarveBus.max(0), 1)]).clip(0, 1), 0.25) * 2 - 1), revM * 0.7, 0.75, 0.4);

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

    // ─── La cámara · the shared resonant chamber ─────────────────────────
    //
    // A feedback delay network, not another FreeVerb. FreeVerb is a Schroeder
    // box with a fixed short character — fine as a per-voice ambience, wrong as
    // a room, and there are already about forty of them running privately
    // inside the voices. This is ONE space that everything is heard through.
    //
    // Four delay lines with mutual feedback, fed from a diffused mono sum, each
    // damped in the loop. Feedback is DERIVED from the delay length and the
    // wanted RT60 rather than dialled by ear:
    //
    //     g = 10 ^ (-3 * delayTime / RT60)
    //
    // so every line decays at the same RATE regardless of its length, which is
    // what stops an FDN ringing on one pitch. Times are mutually prime-ish so
    // the echo pattern does not collapse into a comb.
    //
    // RT60 spans 2 s to 28 s. At the top it stops being reverb and becomes a
    // body that the material excites — the drone keeps it lit and everything
    // else arrives inside something already sounding. That is why it is a live
    // control and not a mastering setting.
    //
    // Reads bus 0 with In.ar and adds back to bus 0, sitting AFTER the voice
    // group and BEFORE the limiter. In.ar rather than InFeedback: it must see
    // this block's voices, and its own output must not re-enter. The only
    // recirculation is the one inside the network, bounded by g < 1 by
    // construction.
    // ── Who is in the room ───────────────────────────────────────────────
    //
    // ~phenoQuorum is the fraction of the beings eligible today whose presence
    // clears the threshold (14_phenological_corpus.scd:568) — a quorum in the
    // literal sense, and the Cámara already computes it once per phenological
    // day. It lived only in sclang, so the room could not hear it. Now it has a
    // bus.
    //
    // Default 0.0, and that is a position rather than a placeholder: before the
    // ring is running there is no assembly, and the room should say so.
    ~chamberOccupancyBus = ~chamberOccupancyBus ?? { Bus.control(s, 1) };
    ~chamberOccupancyBus.set(0.0);
    // ── An aux into the room ─────────────────────────────────────────────
    // The chamber hears bus 0, so every voice already reaches it in proportion
    // to how loud it is. This is a way for a voice to excite the room BEYOND
    // its own level — to leave something behind in the space rather than only
    // pass through it.
    //
    // The bowl is the reason it exists. A struck singing bowl in a stone room
    // is mostly room: the direct sound is brief and what you actually hear for
    // the next half minute is the building answering. Mono, because the
    // chamber sums to mono at its input anyway.
    ~chamberAuxBus = ~chamberAuxBus ?? { Bus.audio(s, 1) };

    SynthDef(\resonantChamber, {
        arg in = 0, aux = (-1), mixBus = (-1), sizeBus = (-1), occBus = (-1),
            damp = 0.42, carveBus = (-1);
        var chans = ~limiterChans;
        var src   = In.ar(in, chans);
        // Long lags: this is architecture, and a room that changes shape in
        // 80 ms is a glitch rather than a gesture.
        var mix   = Lag.kr(Select.kr(mixBus  >= 0, [0.18, In.kr(mixBus, 1)]), 0.8);
        var size  = Lag.kr(Select.kr(sizeBus >= 0, [0.45, In.kr(sizeBus, 1)]), 1.5);
        // ── Sabine, and the politics that follow from it ─────────────────
        //
        //     RT60 = 0.161 V / A
        //
        // Reverberation time falls as total ABSORPTION rises, and an occupant
        // is absorption. This is ordinary room acoustics: an empty hall rings
        // and a full one is dead. It is also, read the other way, the piece's
        // own argument — the chamber of a parliament sounds different according
        // to who is in it, and an empty chamber is not silent, it is
        // RESONANT. Article 44 says an unrecorded day is not filled in; here
        // that day is heard as a room with nobody in it.
        //
        // So the mapping is not decorative and it is not inverted for effect:
        //
        //   quorum 0.0   nobody present    A small    RT60 long    voices alone
        //   quorum 1.0   full assembly     A large    RT60 short   voices close
        //
        // The naive expectation is that more voices should make a bigger sound.
        // Acoustically the opposite is true, and the truth is the more
        // interesting statement: an assembly does not enlarge the room, it
        // absorbs it. Presence is what makes the space intimate.
        var occ   = Lag.kr(Select.kr(occBus >= 0, [0.0, In.kr(occBus, 1)]), 4.0);
        // Bodies absorb the top first, which is why a full room sounds warmer
        // as well as shorter.
        var absorb = occ.clip(0, 1);
        var rt60  = size.linexp(0, 1, 2.0, 28.0) * absorb.linlin(0, 1, 1.0, 0.45);
        var times = [0.0431, 0.0567, 0.0713, 0.0895];
        var mono, diff, fb, lines, mixed, wet;

        // The mix, plus whatever any voice has deliberately sent into the room.
        // Read with In.ar and not InFeedback: the aux is written by voices in
        // ~defaultGroup, which runs before this node, so the current block's
        // sends are already there.
        // Sanitize first: this is a feedback network, and a single NaN let in
        // would circulate in it for good and, summed back onto bus 0, silence
        // everything after it.
        mono = Sanitize.ar((Mix(src) / chans.max(1))
            + Select.ar(aux >= 0, [DC.ar(0), In.ar(aux.max(0), 1)]));
        // MEZCLA: no bass into a room that rings up to 28 s — it came back as
        // low-end wash under everything. This also covers the bowl, which
        // perc sends to the aux before its own 180 Hz cut.
        mono = LinXFade2.ar(mono, HPF.ar(HPF.ar(mono, 150), 150),
            Lag.kr(Select.kr(carveBus >= 0, [0, In.kr(carveBus.max(0), 1)]).clip(0, 1), 0.25) * 2 - 1);
        // Input diffusion, so a transient arrives as a wash rather than as
        // four discrete echoes.
        diff = mono;
        [0.0043, 0.0071, 0.0113, 0.0173].do { |t|
            diff = AllpassC.ar(diff, 0.02, t, 0.09);
        };

        fb = LocalIn.ar(4);
        lines = 4.collect { |i|
            var t = times[i] * size.linlin(0, 1, 0.7, 1.8);
            var g = (10 ** (-3 * t / rt60)).clip(0, 0.97);
            DelayC.ar(diff + (fb[i] * g), 0.25, t)
        };
        // Damped in the loop, so the tail darkens as it decays the way a room
        // does rather than hissing on forever.
        lines = LPF.ar(lines,
            (damp.linexp(0, 1, 900, 7000) * absorb.linlin(0, 1, 1.0, 0.55)).min(SampleRate.ir * 0.45));

        // Householder mixing: every line feeds every other, which is what makes
        // the network dense instead of four parallel echoes.
        mixed = [
            lines[0] + lines[1] + lines[2] - lines[3],
            lines[0] + lines[1] - lines[2] + lines[3],
            lines[0] - lines[1] + lines[2] + lines[3],
            lines[1] + lines[2] + lines[3] - lines[0]
        ] * 0.5;
        // Belt and braces on a feedback loop: LeakDC stops offset accumulating
        // and the soft clip means no control value can make the network run
        // away into the output.
        LocalOut.ar(LeakDC.ar(mixed).tanh);

        // The share heard through the common room rises with the quorum. A
        // full assembly is CONSTITUTED by being in one space; an empty one is
        // a few voices each in their own acoustic, which is what the per-voice
        // reverbs still provide. The performer's chamberMix sets the ceiling of
        // that, not a fixed amount — the room decides how much of it is used.
        wet = mixed * mix * absorb.linlin(0, 1, 0.45, 1.0);
        Out.ar(in, wet);
    }).add;
    s.sync;
    // The stems of the voices, summed into the mix right after the group the
    // voices live in — before the motors' tap, the room and the limiter. The
    // corpus and ultra stems are NOT here: they feed the chain processor, and
    // 17_chain_processing.scd places their \stemSum just before it.
    if(~stemGroupA.notNil) { try { ~stemGroupA.free } };
    ~stemGroupA = Group.after(~defaultGroup ? s.defaultGroup);
    [\drone, \pad, \kick, \perc, \dust, \sample].do { |n|
        ~stemNodes[n] = Synth.tail(~stemGroupA, \stemSum,
            [\in, ~stems[n].index, \out, 0, \id, ~stemNames.indexOf(n)] ++ ~stemPanArgs.(n)
            ++ ~stemCarveArgs.(n));
    };
    if(~chamberSynth.notNil) { try { ~chamberSynth.free }; ~chamberSynth = nil };
    ~chamberSynth = Synth.tail(RootNode(s), \resonantChamber, [
        \in, 0,
        \mixBus,  ((~buses !? { ~buses[\chamberMix]  } !? { |b| b.index }) ? -1),
        \sizeBus, ((~buses !? { ~buses[\chamberSize] } !? { |b| b.index }) ? -1),
        \occBus,  (~chamberOccupancyBus !? { |b| b.index } ? -1),
        \aux,     (~chamberAuxBus !? { |b| b.index } ? -1),
        \carveBus, ((~buses !? { ~buses[\mixCarve] } !? { |b| b.index }) ? -1)
    ]);
    "La cámara active — one shared room, RT60 2-28 s.".postln;

    // ── Spawn the master limiter at the tail of the root node ───────────
    // addToTail on RootNode puts it after ~defaultGroup, so it sees everything
    // already summed on the output bus. Freed first so re-running this file
    // during a soundcheck cannot stack limiters.
    if(~masterLimiterSynth.notNil) {
        try { ~masterLimiterSynth.free };
        ~masterLimiterSynth = nil;
    };
    ~masterMakeup = ~masterMakeup ? 1.5;
    ~masterLimiterSynth = Synth.tail(RootNode(s), \masterLimiter,
        [\ceiling, 0.92, \makeup, ~masterMakeup,
         \carveBus, ((~buses !? { ~buses[\mixCarve] } !? { |b| b.index }) ? -1)]);
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
        // LIMITED AGAIN AFTER THE FOLD, and it has to be.
        //
        // The master limiter guarantees each channel <= ceiling, and the boot
        // log says so out loud: "output can no longer clip". That is true of
        // buses 0-3 and false of the pair that actually reaches the speakers,
        // because this sum is taken AFTER it:
        //
        //     0.92 + 0.92 * 0.707 = 1.571
        //
        // +3.9 dB over full scale, with nothing between it and the interface.
        // Whenever front and rear on the same side are loud together the fold
        // clips in the driver, and no meter in the engine shows it — the scope
        // sits on buses 0-3 and reports the mix as clean.
        //
        // Limiting rather than scaling by 1/1.707 on purpose: a fixed scale
        // would cost 4.6 dB on every quiet passage to protect against a peak
        // that is rare, and this engine is already quiet. The limiter only
        // acts on the peaks that would have clipped.
        //
        // Same ceiling as the master, so the two agree about what full scale
        // means.
        Out.ar(outBus, Limiter.ar([left, right], 0.92, 0.01));
        // Also send rear quad channels to outBus + 2 (buses 6 & 7 -> MOTU Analog 5 & 6)
        Out.ar(outBus + 2, [quad[2], quad[3]]);
    }).add;

    // The dome (DOME_AUDIO=1, 1_server_config.scd): the venue's console takes
    // the quad mix as four discrete channels and does its own spatialisation,
    // so nothing is folded. The ring is put in console order — L R Ls Rs —
    // from PanAz's 0 FL, 1 FR, 2 RR, 3 RL. The master limiter has already
    // capped every channel, and with no sum there is nothing to limit again.
    SynthDef(\motuRouterDome, {
        arg inBus = 0, outBus = 4;
        var quad = InFeedback.ar(inBus, 4);
        Out.ar(outBus, [quad[0], quad[1], quad[3], quad[2]]);
    }).add;
    s.sync;
    if(~motuRouterSynth.notNil) { try { ~motuRouterSynth.free }; ~motuRouterSynth = nil };
    if((~motuOutOffset ? 0) > 0) {
        ~motuRouterSynth = Synth.tail(RootNode(s),
            if(~domeAudio == true) { \motuRouterDome } { \motuRouter }, [
            \inBus,  0,
            \outBus, ~motuOutOffset
        ]);
        if(~domeAudio == true) {
            "MOTU router active (DOME): SC bus 0..3 → bus %..% = analog out 3-6 as L R Ls Rs, no fold-down."
                .format(~motuOutOffset, ~motuOutOffset + 3).postln;
        } {
            "MOTU router active: SC bus 0..3 → bus % (analog out 3-4 stereo folddown + analog 5-6 rears)."
                .format(~motuOutOffset).postln;
        };
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