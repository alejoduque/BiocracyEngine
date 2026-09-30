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
            chainProcessBus = -1,
            umbralBus = -1, ventanaBus = -1, sesgoBus = -1, opacidadBus = -1;

        var dry = In.ar(in, ~chainBusChans);
        var ent  = Lag.kr(Select.kr(entropyBus    >= 0, [0.0, In.kr(entropyBus, 1)]),    2.0);
        var cd   = Lag.kr(Select.kr(calldataBus   >= 0, [0.0, In.kr(calldataBus, 1)]),   1.5);
        var cong = Lag.kr(Select.kr(congestionBus >= 0, [0.0, In.kr(congestionBus, 1)]), 3.0);
        var wetAmt = Lag.kr(Select.kr(chainProcessBus >= 0, [amount, In.kr(chainProcessBus, 1)]), 0.5);
        var sig, diffused, smeared, chainFFT, sum;
        var umbral, ventana, sesgo, opacidad, key, bleed, bleedMix;

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
        // One FFT PER CHANNEL. This used to sum to mono, smear once and
        // .dup the result back out — which put the same mono signal in every
        // channel. With the chain full of contract calls (calldata high, the
        // normal case) up to 85% of the corpus came out mono, so SPREAD had
        // nothing left to move and the forest lost its place in the room.
        // Two FFTs cost little; the image is the point.
        smeared = sig.collect { |ch|
            chainFFT = FFT(LocalBuf(2048), ch);
            chainFFT = PV_MagSmear(chainFFT, (cd * 24).round.clip(0, 24));
            IFFT(chainFFT)
        };
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

        // ── LA CÁMARA SOBRE EL BUS ─────────────────────────────────────────
        // UMBRAL, VENTANA, SESGO y OPACIDAD sólo decidían QUÉ grabación del
        // día suena. Con un calendario todavía incompleto (331 de 365 días sin
        // grabación) eso dejaba las cuatro perillas sin nada que tocar la
        // mayor parte del tiempo. Ahora también actúan sobre el corpus entero,
        // cada una haciendo al sonido lo que ya significa en la selección.
        // Van DESPUÉS del fundido de CADENA: son del performer, no de la
        // cadena, y actúan aunque CADENA esté en cero.
        umbral   = Lag.kr(Select.kr(umbralBus   >= 0, [0.5, In.kr(umbralBus, 1)]), 0.3);
        ventana  = Lag.kr(Select.kr(ventanaBus  >= 0, [1.0, In.kr(ventanaBus, 1)]), 0.3);
        sesgo    = Lag.kr(Select.kr(sesgoBus    >= 0, [0.0, In.kr(sesgoBus, 1)]), 0.3);
        opacidad = Lag.kr(Select.kr(opacidadBus >= 0, [0.0, In.kr(opacidadBus, 1)]), 0.3);

        // UMBRAL — "por encima del umbral el escaño se enciende". Una compuerta
        // suave (expansión 4:1 por debajo) RELATIVA al nivel reciente del
        // propio corpus: un umbral absoluto dependía de CORPUS, de MASTER VOL
        // y de la grabación, y casi nunca mordía. Así, en 0.20 pasa todo lo
        // que supere un tercio del ambiente (casi todo); en 0.85 sólo lo que
        // sobresale tres veces de él — los eventos, no el fondo.
        key = Mix(sig) / ~chainBusChans.max(1);
        sig = Compander.ar(sig, key,
            (Amplitude.kr(key, 0.5, 4.0) * umbral.linexp(0.2, 0.85, 0.33, 3.0)).max(0.0005),
            4.0, 1.0, 0.01, 0.25);

        // VENTANA — el alcance en el tiempo. En 0.4 cada sonido es un punto
        // aislado en el silencio; en 2.5 sangra sobre los huecos, como un
        // registro oído desde varios días de distancia.
        bleedMix = ventana.linlin(0.4, 2.5, 0.0, 0.55);
        bleed = CombC.ar(sig, 2.0, [0.37, 0.53] * ventana.clip(0.4, 2.5),
            ventana.linlin(0.4, 2.5, 0.5, 7.0));
        4.do { |i|
            bleed = AllpassC.ar(bleed, 0.1, [0.013, 0.021, 0.034, 0.047][i], 0.8);
        };
        // × 0.2: a 0.5 la cola acumulada subía el corpus 12 dB en el tope de
        // la perilla. Ventana es alcance, no volumen.
        sig = sig + (LeakDC.ar(bleed) * bleedMix * 0.2);

        // SESGO — la temporada inclina el espectro. Hacia la seca (-1) más
        // brillante y delgado; hacia la lluvia (+1) más oscuro y lleno.
        sig = BLowShelf.ar(sig, 250, 1, sesgo * 6);
        sig = BHiShelf.ar(sig, 4000, 1, sesgo.neg * 6);

        // OPACIDAD — lo opaco se retira. Un velo: el paso bajo cae de 20 kHz a
        // 800 Hz y el nivel baja un tercio en el tope de la perilla.
        sig = LPF.ar(sig, opacidad.linexp(0, 0.7, 20000, 800)) * opacidad.linlin(0, 0.7, 1.0, 0.67);

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
        ] ++ [
            // La Cámara sobre el bus (ver el final de \chainProcessor).
            [\umbralBus, \activityThreshold], [\ventanaBus, \windowWidth],
            [\sesgoBus, \seasonalBias], [\opacidadBus, \opacityFloor]
        ].collect { |pair|
            [pair[0], if(~buses.notNil and: { ~buses[pair[1]].notNil },
                { ~buses[pair[1]].index }, { -1 })]
        }.flatten
    );
    // The corpus and the ultrasound each write to their own stem, and these two
    // feeders carry both into the processor's bus — metered on the way, which
    // is the only point where the two can still be told apart. Placed right
    // BEFORE the processor, so they run after every voice and before it reads.
    if(~corpusFeeders.notNil) { ~corpusFeeders.do { |n| try { n.free } } };
    if(~stems.notNil) {
        ~corpusFeeders = [\corpus, \ultra].collect { |n|
            Synth.before(~chainProcSynth, \stemSum,
                [\in, ~stems[n].index, \out, ~corpusProcBus.index, \id, ~stemNames.indexOf(n)])
        };
        ~corpusIn = (corpus: ~stemOut.(\corpus), ultra: ~stemOut.(\ultra));
    };
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
