// SuperCollider Ethereum Sonification — Chain Processing
//
// The chain stops playing notes and starts acting on the forest.
//
// ─── Why this inverts the previous architecture ─────────────────────────────
//
// Until now the coupling ran: chain → synth voices. A transaction arrived, its
// value was log-mapped to a MIDI note, its gas to a velocity, its priority to
// an envelope, and a bell rang. Three scalars per transaction. Meanwhile the
// corpus — 261 recordings of the actual site — sat in a separate layer being
// merely scheduled by a calendar, untouched by the chain at all.
//
// Two things were wrong with that, and they are the same thing.
//
// The first is that it wasted the data. An audit of what eth_sonify.py sends:
// blockHash, calldataLen and nonce were parsed and never read by anything;
// entropy, blockNum and blockTxCount were computed and only ever printed in
// the monitor line. The chain's own behaviour — how irregular its arrivals
// are, how much each transaction actually says, how contested the block space
// is — reached the sound nowhere.
//
// The second is that it pointed the piece backwards. The work's claim is that
// the chain acts UPON a territory. Having the chain perform alongside the
// forest, on a separate set of synthesised instruments, states the opposite:
// two parties playing together. Making the chain the PROCESSING applied to the
// recordings puts the signal flow and the argument in the same direction, and
// it is also the practice the ambient reference actually describes — field
// recordings and heavy studio processing rather than generative patches.
//
// So: the corpus is the material. The chain is what is done to it.
//
// ─── The three dimensions, and what each one does ───────────────────────────
//
//   entropy      how irregular the chain's arrivals are, already computed in
//                6_osc_handlers.scd from a rolling ring of inter-arrival times
//                and until now only displayed. It sets DIFFUSION: a chain
//                arriving evenly leaves the recording legible, a bursty one
//                smears it until the forest is a wash of where it used to be.
//
//   calldataLen  how much each transaction says. A bare transfer carries
//                almost no calldata; a contract call carries kilobytes. It
//                sets the SMEAR WINDOW — how far across the spectrum the
//                magnitudes bleed — so an act that merely moves money barely
//                touches the recording and one that executes something drags
//                it sideways.
//
//   congestion   block fullness against base fee: how contested the space is.
//                It sets DRIVE and the filter — pressure on the chain becomes
//                pressure on the recording.
//
// None of these is a note. They are all conditions.

(
// ─── Where the corpus goes ──────────────────────────────────────────────────
// Its own bus, so the two corpus voices can be processed as a GROUP. They wrote
// straight to the main output before — both hard-wired Out.ar(0, …) — which is
// exactly why nothing could be placed across the layer.
//
// ~corpusOutBus is read by 14_phenological_corpus.scd at spawn time and
// defaults to 0, so if this file never loads the corpus goes straight out as
// it always did.
~chainBusChans = (~limiterChans ? 2);
~corpusProcBus = ~corpusProcBus ?? { Bus.audio(s, ~chainBusChans) };
~corpusOutBus  = ~corpusProcBus.index;

// The three chain readings, as control buses so the processor reads them live
// rather than being respawned. All three are normalised 0–1 here, at the one
// place that knows their native units.
~chainBuses = ~chainBuses ?? {
    (
        entropy:    Bus.control(s, 1).set(0),
        calldata:   Bus.control(s, 1).set(0),
        congestion: Bus.control(s, 1).set(0)
    )
};

s.waitForBoot {

    SynthDef(\chainProcessor, {
        arg out = 0, in = 0, amount = 0.45,
            entropyBus = -1, calldataBus = -1, congestionBus = -1,
            chainProcessBus = -1;

        var dry = In.ar(in, ~chainBusChans);
        var ent  = Lag.kr(Select.kr(entropyBus    >= 0, [0.0, In.kr(entropyBus, 1)]),    2.0);
        var cd   = Lag.kr(Select.kr(calldataBus   >= 0, [0.0, In.kr(calldataBus, 1)]),   1.5);
        var cong = Lag.kr(Select.kr(congestionBus >= 0, [0.0, In.kr(congestionBus, 1)]), 3.0);
        var wetAmt = Lag.kr(Select.kr(chainProcessBus >= 0, [amount, In.kr(chainProcessBus, 1)]), 0.5);
        var sig, diffused, smeared, chainFFT, sum;

        sig = dry;

        // ── ENTROPY → diffusion ────────────────────────────────────────────
        // Four allpasses in series with independently drifting delay times.
        // An allpass does not colour the spectrum, it disperses the phase — the
        // recording keeps its content and loses its position in time, which is
        // what smearing a field recording should mean. Decay rides entropy, so
        // an even chain leaves it nearly untouched.
        // Decay capped at 1.2 s, and LeakDC'd. Measured at 3.5 s: four of these
        // in series build a tail that outlasts a seven-second settle, which
        // made three test conditions read as one loud one — whichever ran last
        // inherited everything before it. A smear should blur the recording,
        // not accumulate into a reverb that never empties.
        diffused = sig;
        4.do { |i|
            diffused = AllpassC.ar(diffused, 0.12,
                LFNoise1.kr(0.05 + (i * 0.031)).range(0.004, 0.09),
                ent.linexp(0, 1, 0.06, 1.2));
        };
        diffused = LeakDC.ar(diffused);
        sig = XFade2.ar(sig, diffused, ent.linlin(0, 1, -1, 0.7));

        // ── CALLDATA → spectral smear ──────────────────────────────────────
        // PV_MagSmear averages each bin against its neighbours, so magnitudes
        // bleed sideways across the spectrum. At zero calldata the FFT path is
        // a null operation and the recording passes intact; a contract call
        // with kilobytes of input drags it into a band of itself.
        //
        // Mono-summed for the transform and re-spread afterwards: one FFT
        // rather than one per channel, and the diffusion above is what carries
        // the image anyway.
        sum = Mix(sig) / ~chainBusChans.max(1);
        chainFFT = FFT(LocalBuf(2048), sum);
        chainFFT = PV_MagSmear(chainFFT, (cd * 24).round.clip(0, 24));
        smeared = IFFT(chainFFT).dup(~chainBusChans);
        sig = XFade2.ar(sig, smeared, cd.linlin(0, 1, -1, 0.85));

        // ── CONGESTION → pressure ──────────────────────────────────────────
        // Contested block space becomes drive and a closing filter. This is the
        // one stage that is meant to be unpleasant when the chain is: a busy,
        // expensive block should audibly squeeze the forest.
        // Measured before this was tamed: at congestion 0.9 the stage came out
        // 14x louder than at rest — the drive's makeup and the filter's
        // resonance compounding. "The chain squeezes the forest" has to mean a
        // change in CHARACTER, not a shove into the limiter, or congestion
        // simply becomes a volume control with extra steps.
        sig = (sig * (1 + (cong * 2.6))).tanh / (1 + (cong * 2.3));
        sig = RLPF.ar(sig,
            cong.linexp(0, 1, 12000, 900).clip(300, 16000),
            cong.linlin(0, 1, 0.9, 0.62));
        // Level-matched against the dry path, so what congestion changes is the
        // sound and not the loudness.
        sig = sig * cong.linlin(0, 1, 1.0, 0.72);

        // The performer's own fader decides how much of any of this is allowed
        // to happen. At 0 the corpus passes exactly as it was recorded, which
        // has to remain reachable — the recordings are evidence before they are
        // material.
        sig = XFade2.ar(dry, sig, wetAmt.linlin(0, 1, -1, 1));
        Out.ar(out, sig);
    }).add;

    s.sync;

    // Placed at the tail of the default group so it runs after every corpus
    // voice has written, and before the master limiter, which lives at the tail
    // of the RootNode.
    if(~chainProcSynth.notNil) { try { ~chainProcSynth.free } };
    ~chainProcSynth = Synth.tail(
        if(~defaultGroup.notNil, { ~defaultGroup }, { s.defaultGroup }),
        \chainProcessor,
        [
            \out, 0,
            \in,  ~corpusProcBus.index,
            \entropyBus,      ~chainBuses[\entropy].index,
            \calldataBus,     ~chainBuses[\calldata].index,
            \congestionBus,   ~chainBuses[\congestion].index,
            \chainProcessBus, if(~buses.notNil and: { ~buses[\chainProcess].notNil },
                { ~buses[\chainProcess].index }, { -1 })
        ]
    );
    // The corpus analyser sits on the same bus, at the TAIL so it hears the
    // chain processing rather than the dry recordings — what the laser draws
    // should be what the room hears, not what the file contains.
    if(~corpusScopeSynth.notNil) { try { ~corpusScopeSynth.free } };
    ~corpusScopeSynth = Synth.tail(
        if(~defaultGroup.notNil, { ~defaultGroup }, { s.defaultGroup }),
        \corpusScope, [\in, ~corpusProcBus.index]);

    ("[chain] processor across the corpus bus (" ++ ~corpusProcBus.index ++ ")").postln;
};

// ─── Reading the chain ──────────────────────────────────────────────────────
// A routine rather than a hook in the OSC handlers: these are CONDITIONS, not
// events. Their value is "how the chain has been lately", which is a thing to
// sample, and sampling it here keeps the normalisation — the one part that
// needs to know gwei from bytes — in a single place instead of scattered
// through the handlers.
~chainReadRoutine = {
    if(~chainRoutine.notNil) { ~chainRoutine.stop };
    ~chainRoutine = Routine({
        loop {
            var rs = ~rhythmState;
            if(rs.notNil and: { ~chainBuses.notNil }) {
                // Already 0–1 where it is computed (sd of log intervals / 3.5).
                var ent = (rs[\entropy] ? 0).clip(0, 1);
                // Bytes, log-scaled: a bare transfer is 0, an ERC-20 transfer
                // is 68, a swap runs to several hundred. Linear would leave
                // everything below a swap indistinguishable from silence.
                var cd  = ((rs[\calldataLen] ? 0) + 1).log2 / 12.0;
                // Fullness against price. Neither alone is congestion: a full
                // block of cheap transactions is not contested, and an
                // expensive quiet one is a different condition again.
                var full = ((rs[\blockTxCount] ? 0) / 250.0).clip(0, 1);
                var fee  = (((rs[\blockBaseFee] ? 0) + 1).log2 / 7.0).clip(0, 1);
                ~chainBuses[\entropy].set(ent);
                ~chainBuses[\calldata].set(cd.clip(0, 1));
                ~chainBuses[\congestion].set(((full * 0.55) + (fee * 0.45)).clip(0, 1));
            };
            0.5.wait;
        };
    }).play(AppClock);
};

s.doWhenBooted({ AppClock.sched(8.0, { ~chainReadRoutine.value; nil }) });

// What the chain is doing to the forest, in one line, for the post window.
~chainReport = {
    var rs = ~rhythmState ? ();
    ("[chain] entropy " ++ (~chainBuses !? { ~chainBuses[\entropy].getSynchronous } ? 0).round(0.001)
        ++ "  calldata " ++ (~chainBuses !? { ~chainBuses[\calldata].getSynchronous } ? 0).round(0.001)
        ++ "  congestion " ++ (~chainBuses !? { ~chainBuses[\congestion].getSynchronous } ? 0).round(0.001)
        ++ "   <- raw: calldataLen " ++ (rs[\calldataLen] ? "-")
        ++ ", txCount " ++ (rs[\blockTxCount] ? "-")
        ++ ", baseFee " ++ (rs[\blockBaseFee] ? "-")).postln;
};

"═══ 17 · Chain processing — the chain acts on the forest ═══".postln;
)
