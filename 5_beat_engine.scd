// SuperCollider Ethereum Sonification - Beat Engine
// Current Date and Time (UTC): 2025-03-01 21:48:06
// Current User's Login: alejoduque

(
// Initialize default values with expanded parameter set
~beatParams = (
    // Rhythm parameters
    beatTempo: 1.0,
    
    // Drone parameters
    droneFade: 2.0,
    droneSpace: 0.5,
    droneMix: 0.5,
    droneRes: 0.4,
    droneDepth: 0.3,
    
    // Noise parameters
    noiseLevel: 0.1,
    noiseFilt: 0.5,
    
    // Global parameters
    masterAmp: 0.7,
    // Transport gain: 1.0 running, 0.05 after /parliament/stop, restored by
    // /parliament/start. Kept SEPARATE from masterAmp so a transport action
    // cannot silently overwrite the performer's level — see the note in the
    // stop handler in 6_osc_handlers.scd.
    transportGain: 1.0,
    // Layer counters, read by the [MON] line. The monitor described the pad
    // layer in detail while saying nothing at all about kick or percussion,
    // so "the beats are gone" could only ever be answered by guesswork.
    kickCount: 0,
    percCount: 0,
    delayFeedback: 0.3,
    filterCutoff: 0.6,
    
    // Transaction-influenced parameters
    transactionInfluence: 0.3,
    lastTransactionTime: 0,
    transactionDensity: 0
);

// Note: control buses for beat params are allocated here but only after the server is running.
// Allocation happens inside the doWhenBooted block below to avoid allocating before server exists.
~controlBuses = ~controlBuses ?? ();

// ─── Helper: Compute pitch pool from live control values ───
// Drone register: fundamentals stay low (~35–740 Hz) so the Ringz percussion
// reads as struck-metal resonance INSIDE the drone rather than high pinging
// on top of it (basePitch was 200 with a 2.0 spread and a 200 Hz TX shift —
// pools reached ~1 kHz fundamentals, ~9 kHz partials).
~computePitchPool = { |harmRich=1.0, txInfluence=0.0, density=0.5|
    var basePitch = 70;
    var pitchShift = txInfluence * 50;   // TX activity nudges pitch gently
    var spread = harmRich.linexp(0.1, 8.0, 0.5, 1.4);  // narrow→moderate spread
    var numSteps = (4 + (density * 3)).round.clip(4, 7);  // 4–7 notes

    Array.fill(numSteps, { |i|
        (basePitch * spread * (i + 1)) + pitchShift;
    });
};

// ─── Helper: Select voicing strategy from control values ───
~selectVoicing = { |resBdy=0.4, texDep=0.2|
    case
    { texDep < 0.2 } { \single }                      // sparse
    { (resBdy > 0.6) and: { texDep < 0.5 } } { \dyad }   // pairs
    { texDep > 0.6 } { \triad }                       // full chords
    { \dyad };                                        // default
};

// ─── Helper: Get harmonic count from control ───
~getHarmonicCount = { |harmRich=1.0|
    (harmRich.linexp(0.1, 8.0, 1, 8)).round.clip(1, 8);
};

// Enhanced Beat Engine with transaction influence
~beatEngine = {
    if(~beatRoutine.notNil) { ~beatRoutine.stop };
    if(~opalDroneSynth.notNil) { ~opalDroneSynth.set(\gate, 0) };
    
    // Start the continuous ambient drone immediately
    // Safe bus index helper: returns bus index or -1 if bus missing
    ~bi = { |name| if(~buses.notNil and: { ~buses[name].notNil }, { ~buses[name].index }, { -1 }) };
    // Safe synchronous bus READ for routine (language-side) code.
    // In.kr/Select.kr are server-side UGens: used in a Routine they return
    // UGen objects, not numbers. getSynchronous is the language-side read.
    ~busVal = { |name, default=0|
        if(~buses.notNil and: { ~buses[name].notNil },
            { ~buses[name].getSynchronous }, { default });
    };

    ~opalDroneSynth = Synth(\opalDrone, [
        \freq, 55, // Low ambient anchor
        \amp, ~beatParams.masterAmp * (~beatParams.transportGain ? 1) *0.8,
        \masterVolBus, ~bi.(\masterVolume),
        \pitchBus,     ~bi.(\pitchShift),
        \timeBus,      ~bi.(\timeDilation),
        \spectralBus,  ~bi.(\spectralShift),
        \spatialBus,   ~bi.(\spatialSpread),
        \textureBus,   ~bi.(\textureDepth),
        \atmosphereBus,~bi.(\atmosphereMix),
        \memoryBus,    ~bi.(\memoryFeed),
        \harmonicBus,  ~bi.(\harmonicRich),
        \resonantBus,  ~bi.(\resonantBody),
        // Drone/level buses — \opalDrone now reads these (see 3_synthdefs.scd).
        // Without them the six matching sliders moved a bus no UGen listened to.
        \masterAmpBus,    ~bi.(\masterAmp),
        \filterCutoffBus, ~bi.(\filterCutoff),
        \droneDepthBus,   ~bi.(\droneDepth),
        \droneFadeBus,    ~bi.(\droneFade),
        \droneSpaceBus,   ~bi.(\droneSpace),
        \droneMixBus,     ~bi.(\droneMix)
    ], target: if(~defaultGroup.notNil, { ~defaultGroup }, { s.defaultGroup }));
    
    ~beatRoutine = Routine({
        var step = 0;
        var bar = 0;           // bar counter for slow evolution
        var phrase = 0;        // phrase counter (every 4 bars)
        var transactionInfluence;
        // Evolving pattern seeds — mutate every phrase
        // 4 per bar, not 2. With Bloque = Compás the bar IS the ~12 s block, so
        // the old two-hit pattern fired the kick once every 6 seconds — audible
        // as "no deep pulsation". Four gives a low pulse you can actually lean
        // on while staying far from beat-machine motion.
        var kickPattern   = #[1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0];
        var percDivisor   = 8;    // polyrhythmic divisor — shifts each phrase
        var dustProb      = 0.12; // base probability for dust hits
        var droneBaseFreq = 55;   // drone pitch — drifts over time
        // Pitch pool for percussion melodic variation
        var pitchPool     = #[200, 300, 400, 500, 600, 800];
        var poolIdx       = 0;

        // Live control values (read each beat)
        var harmRich, resBdy, atmMix, memFeed, texDep, dronFade, txInf;
        var voicingMode;
        var harmCount;
        // ── Cámara Fenológica state (Capítulo VI) ──
        // Read synchronously each beat: poolDensity scales with quórum sensible
        // (Art. 45), bancada applies a soft LPF emphasis when active (Art. 43 §1).
        var activityThr, bancadaIdx, phenoMult;

        loop {
            var now = SystemClock.seconds;
            var timeSinceLastTx = now - (~beatParams.lastTransactionTime ? now);
            var targetGrp = if(~defaultGroup.notNil, { ~defaultGroup }, { s.defaultGroup });
            var interval;
            var density;
            var bMVol, bPitch, bTime, bSpec, bSpat, bText, bAtmo, bMem, bHarm, bRes;
            var elapsed = now % 300; // 5-minute macro cycle
            // ── Ritmo · escucha profunda ──
            var rBlockBar, rGasAccent, rEntropy, rVoices, rHashSeed, rPolyclock, rSilence;
            var rs, blockAge, blockPhase, chainEntropy, priorityRatio, accent, voiceIdx;
            var quiet = false;

            // ⚠ An uncaught error inside a Routine STOPS IT, permanently and
            // silently. That is how a single nil read killed the kick and
            // percussion for the rest of a session while the pad layer — which
            // lives in a different code path — carried on as if nothing were
            // wrong. For a performance instrument that failure mode is
            // unacceptable: one bad frame must cost one frame, not the set.
            // The body is guarded and the wait is kept OUTSIDE the guard, so an
            // error can never spin the loop either.
            interval = 0.5;   // safe default: the wait below always has a value
            try {

            // ─── Read live GUI control values every beat (synchronous reads) ───
            // The bus is named \transactionInfluence (see 0_parameters.scd) —
            // the old \txInfluence lookup always missed and fell back to default.
            harmRich = ~busVal.(\harmonicRich, 1.0);
            resBdy   = ~busVal.(\resonantBody, 0.4);
            atmMix   = ~busVal.(\atmosphereMix, 0.4);
            memFeed  = ~busVal.(\memoryFeed, 0.3);
            texDep   = ~busVal.(\textureDepth, 0.2);
            dronFade = ~busVal.(\droneFade, 0.5);
            txInf    = ~busVal.(\transactionInfluence, 0.5);

            // ─── Phenology Chamber: read synchronously (~3 Hz beat rate) ──
            // Falls back to defaults if buses don't exist yet (boot ordering).
            activityThr = if(~buses.notNil and: { ~buses[\activityThreshold].notNil }) {
                ~buses[\activityThreshold].getSynchronous
            } { 0.50 };
            bancadaIdx = if(~buses.notNil and: { ~buses[\bancada].notNil }) {
                ~buses[\bancada].getSynchronous.asInteger
            } { 0 };

            // ─── Ritmo: read the seven scheme toggles (0/1) ───────────────
            // ~beatParams mirrors are written by ~setParam via the registry.
            // Every flag defaults to 0, and each branch below is additive, so
            // all-off reproduces the previous engine behaviour exactly.
            rBlockBar  = (~beatParams.rhythmBlockBar  ? 0) > 0.5;
            rGasAccent = (~beatParams.rhythmGasAccent ? 0) > 0.5;
            rEntropy   = (~beatParams.rhythmEntropy   ? 0) > 0.5;
            rVoices    = (~beatParams.rhythmVoices    ? 0) > 0.5;
            rHashSeed  = (~beatParams.rhythmHashSeed  ? 0) > 0.5;
            rPolyclock = (~beatParams.rhythmPolyclock ? 0) > 0.5;
            rSilence   = (~beatParams.rhythmSilence   ? 0) > 0.5;

            rs = ~rhythmState;
            blockAge      = if(rs.notNil and: { rs[\blockAt] > 0 }) { now - rs[\blockAt] } { 0 };
            // 0–1 position within the current block: the bar phase, given by
            // the chain rather than by a counter we increment ourselves.
            blockPhase    = if(rs.notNil) { (blockAge / rs[\blockPeriod].max(1)).clip(0, 1) } { 0 };
            chainEntropy  = if(rs.notNil) { rs[\entropy] } { 0 };
            priorityRatio = if(rs.notNil) { rs[\priorityRatio] } { 0.5 };

            // ── (7) Silence as material ──
            // Deep listening needs the floor to drop out. The rest must be
            // RELATIVE to the chain's own recent rate: the previous absolute
            // "8 s with no transaction" never occurred at 290 tx/block, so the
            // control was inert on any busy chain (confirmed on the monitor).
            //
            // Performance safety — two hard bounds, both deliberate:
            //   · restAfter is clipped to 0.5–4 s, so a density spike can
            //     never make the threshold so small that everything rests.
            //   · above SILENCE_DEADLINE the grid RESUMES. A dead feed (network
            //     drop, Infura outage, python crash) must not silence the piece
            //     for the rest of a set — long silence then means "the source
            //     is gone", which is a failure, not a musical rest.
            // (evaluated further down, once `density` has been assigned —
            //  reading it here threw and killed the whole Routine)

            // NOTE: the two schemes that depend on `density` (hash seed, three
            // clocks) run further down, right after density is assigned — up
            // here it is still nil.

            // Quórum sensible → pool density multiplier (Art. 45):
            //   threshold 0.20 → mult 1.5 (loose quórum → dense pool)
            //   threshold 0.85 → mult 0.6 (strict quórum → sparse pool)
            phenoMult = activityThr.linlin(0.20, 0.85, 1.5, 0.6);

            // Calculate transaction influence + density FIRST — the melodic
            // parameters below depend on both (density was read after use,
            // and `txInfluence` was an undefined variable: parse error that
            // killed this whole file at load).
            transactionInfluence = (~beatParams.transactionInfluence *
                exp(timeSinceLastTx.neg * 0.5)).clip(0, 1);

            density = ~beatParams.transactionDensity ? 0;

            // ── (7) Silence as material ──  [needs `density`, hence its place]
            // Deep listening needs the floor to drop out. The rest is RELATIVE
            // to the chain's own recent rate: an absolute "8 s with no
            // transaction" never occurs at ~300 tx/block, so the control was
            // inert on any busy chain.
            //
            // Performance safety — two deliberate bounds:
            //   · restAfter clipped to 0.5–4 s, so a density spike can never
            //     make the threshold so small that everything rests.
            //   · above 20 s the grid RESUMES. A dead feed (network drop,
            //     Infura outage, python crash) must not silence the piece for
            //     the rest of a set — long silence means the source is gone,
            //     which is a failure, not a musical rest.
            if(rSilence) {
                var restAfter = (0.6 / density.max(0.05)).clip(0.5, 4.0);
                quiet = (timeSinceLastTx > restAfter) and: { timeSinceLastTx < 20.0 };
            };

            // ── (5) Block hash as pattern seed ──
            // Each block deterministically reseeds this bar's cell: different
            // every block, reproducible for a recorded session. Must sit after
            // `density` is assigned — it scales the kick fill probability.
            // (~rhythmSeededRand lives in 6_osc_handlers.scd, which loads AFTER
            // this file — guard so an early beat can never hit a nil function.)
            if(rHashSeed and: { rs.notNil } and: { rs[\blockSeed] > 0 }
                and: { ~rhythmSeededRand.notNil }) {
                var sd = rs[\blockSeed];
                kickPattern = Array.fill(16, { |i|
                    if(~rhythmSeededRand.(sd, i) < (0.16 + (density * 0.22)), 1, 0)
                });
                // Guarantee a downbeat so the bar stays legible
                kickPattern[0] = 1;
                percDivisor = 3 + (~rhythmSeededRand.(sd, 101) * 6).floor;
                dustProb    = 0.06 + (~rhythmSeededRand.(sd, 202) * 0.22);
            };

            // ── (6) Three clocks instead of one ──
            // Block cadence (~12 s) moves the drone's harmonic centre while the
            // percussion keeps its own irregular surface time. The two have no
            // integer relationship, so the composite never closes a loop.
            if(rPolyclock and: { rs.notNil } and: { rs[\blockNum] > 0 }) {
                droneBaseFreq = 55 * (((rs[\blockNum] % 7) - 3) / 12).midiratio;
                if(~opalDroneSynth.notNil) {
                    ~opalDroneSynth.set(\freq, droneBaseFreq.clip(28, 90));
                };
            };

            // ─── Compute melodic parameters from control matrix ───
            pitchPool = ~computePitchPool.(harmRich, txInf, density * phenoMult);
            voicingMode = ~selectVoicing.(resBdy, texDep);
            harmCount = ~getHarmonicCount.(harmRich);

            // Bus indices
            bMVol  = ~bi.(\masterVolume);
            bPitch = ~bi.(\pitchShift);
            bTime  = ~bi.(\timeDilation);
            bSpec  = ~bi.(\spectralShift);
            bSpat  = ~bi.(\spatialSpread);
            bText  = ~bi.(\textureDepth);
            bAtmo  = ~bi.(\atmosphereMix);
            bMem   = ~bi.(\memoryFeed);
            bHarm  = ~bi.(\harmonicRich);
            bRes   = ~bi.(\resonantBody);

            // ── PHRASE EVOLUTION: every 4 bars (64 steps) mutate the pattern ──────
            if(step == 0) {
                bar = bar + 1;
                if(bar % 4 == 0) {
                    phrase = phrase + 1;
                    // Rotate kick pattern: shift downbeat, add/remove ghost hits
                    kickPattern = Array.fill(16, { |i|
                        if(i == 0, { 1 }, {          // downbeat always
                        if(i == (8 + (phrase % 5)),   // moving secondary hit
                            { 1 },
                            { if((density > 0.4) and: { (i % (3 + (phrase % 3))) == 0 },
                                { 0.6.coin.asInteger },  // density-gated fills
                                { 0 })
                            })
                        })
                    });
                    // Shift polyrhythmic divisor — sparse, drone-friendly cadence
                    percDivisor = #[6, 8, 12, 7, 10].wrapAt(phrase);
                    // Evolve dust probability with density (kept low: crackle
                    // as occasional texture, not a constant rain)
                    dustProb = (0.06 + (density * 0.2) + (transactionInfluence * 0.1)).clip(0.03, 0.35);
                    // Drift drone pitch: cycle through harmonically-related notes
                    droneBaseFreq = #[55, 62, 73, 82, 49, 65, 55, 41].wrapAt(phrase);
                    // Update drone pitch live
                    if(~opalDroneSynth.notNil) {
                        ~opalDroneSynth.set(\freq, droneBaseFreq);
                    };
                };
            };

            // ── (2) Gas deviation → accent ───────────────────────────────
            // Not the absolute gas price (which reads ~0 at modern fees and made
            // velocity a constant 30) but how far this actor bid OVER base fee:
            // the audible trace of urgency. 0.55x–1.75x on every layer's amp.
            // Baseline 0.85, not 0.55 — see the note in 6_osc_handlers.scd:
            // priorityRatio is skewed to zero, so a 0.55 floor made this
            // control an attenuator rather than an accent.
            accent = if(rGasAccent) { 0.85 + (priorityRatio * 0.9) } { 1.0 };

            // ── (4) Address as voice ─────────────────────────────────────
            // The same counterparty returns as the same voice, so over a long
            // listen you begin to recognise recurring actors — an exchange, a
            // bot loop, a whale — instead of undifferentiated events.
            voiceIdx = if(rVoices and: { rs.notNil }) { rs[\addrSig] % 7 } { -1 };

            // ── 1. KICK — evolving pattern instead of fixed 0,8 ──────────────────
            if(quiet.not and: { kickPattern.wrapAt(step) == 1 }) {
                // Subtle frequency drift: ±5Hz per bar for organic feel
                var kickFreq = 50 + ((bar % 7) - 3 * 1.5);
                ~beatParams.kickCount = (~beatParams.kickCount ? 0) + 1;
                Synth(\opalKick, [
                    \out,         0,
                    \freq,        kickFreq,
                    \amp,         ~beatParams.masterAmp * (~beatParams.transportGain ? 1) *(0.5 + (density * 0.2)) * accent,
                    \dec,         0.9 + (transactionInfluence * 0.4),
                    \masterVolBus, bMVol,
                    \timeBus,      bTime,
                    \harmonicBus,  bHarm,
                    \textureBus,   bText,
                    \spectralBus,  bSpec,
                    \atmosphereBus, bAtmo,
                    \spatialBus,   bSpat
                ], targetGrp);
            };

            // ── 2. PERC — shifting polyrhythm + melodic variation ────────────────
            if(quiet.not and: { (step % percDivisor == 0) or: {
                (step % 10 == 0) and: { transactionInfluence > 0.6 } and: { 0.3.coin }
            } }) {
                // With rhythmVoices on, the counterparty picks the degree
                // instead of walking the pool in order — a returning address
                // returns on its own pitch.
                var baseFreq = if(voiceIdx >= 0) {
                    pitchPool.wrapAt(voiceIdx)
                } {
                    pitchPool.wrapAt(poolIdx)
                };
                poolIdx = (poolIdx + 1) % pitchPool.size;
                ~beatParams.percCount = (~beatParams.percCount ? 0) + 1;

                // ─ Voicing: single note, dyad, or triad based on texture control ─
                case
                { voicingMode == \single } {
                    // Single pitched note
                    var percFreq = baseFreq * rrand(0.95, 1.05);
                    Synth(\opalPerc, [
                        \out,          0,
                        \freq,         percFreq,
                        \amp,          ~beatParams.masterAmp * (~beatParams.transportGain ? 1) *(0.2 + (transactionInfluence * 0.15)) * accent,
                        \masterVolBus, bMVol,
                        \harmonicBus,  bHarm,
                        \textureBus,   bText,
                        \resonantBus,  bRes,
                        \spectralBus,  bSpec,
                        \timeBus,      bTime,
                        \memoryBus,    bMem,
                        \atmosphereBus, bAtmo,
                        \spatialBus,   bSpat
                    ], targetGrp);
                }
                { voicingMode == \dyad } {
                    // Two-note interval
                    2.do { |voice|
                        var harmFreq = baseFreq * ([1.0, 1.5][voice]) * rrand(0.98, 1.02);
                        Synth(\opalPerc, [
                            \out,          0,
                            \freq,         harmFreq,
                            \amp,          ~beatParams.masterAmp * (~beatParams.transportGain ? 1) *(0.2 + (transactionInfluence * 0.15)) * accent * [1.0, 0.6][voice],
                            \masterVolBus, bMVol,
                            \harmonicBus,  bHarm,
                            \textureBus,   bText,
                            \resonantBus,  bRes,
                            \spectralBus,  bSpec,
                            \timeBus,      bTime,
                            \memoryBus,    bMem,
                            \atmosphereBus, bAtmo,
                            \spatialBus,   bSpat
                        ], targetGrp);
                    };
                }
                { voicingMode == \triad } {
                    // Full harmonic series (up to harmCount)
                    (harmCount.clip(2, 5)).do { |h|
                        var harmFreq = baseFreq * (h + 1) * resBdy.linexp(0.1, 0.8, 0.95, 1.15);
                        Synth(\opalPerc, [
                            \out,          0,
                            \freq,         harmFreq,
                            \amp,          ~beatParams.masterAmp * (~beatParams.transportGain ? 1) *(0.2 + (transactionInfluence * 0.15)) * accent * (1.0 / (h + 1.5)),
                            \masterVolBus, bMVol,
                            \harmonicBus,  bHarm,
                            \textureBus,   bText,
                            \resonantBus,  bRes,
                            \spectralBus,  bSpec,
                            \timeBus,      bTime,
                            \memoryBus,    bMem,
                            \atmosphereBus, bAtmo,
                            \spatialBus,   bSpat
                        ], targetGrp);
                    };
                };
            };

            // ── 3. DUST — probability-based, not grid-locked ─────────────────────
            if(quiet.not and: { dustProb.coin }) {
                Synth(\opalDust, [
                    \out,         0,
                    \amp,         ~beatParams.masterAmp * (~beatParams.transportGain ? 1) *(0.3 + (density * 0.35)) * accent,
                    \masterVolBus, bMVol,
                    \textureBus,   bText,
                    \spectralBus,  bSpec,
                    \timeBus,      bTime,
                    \pitchBus,     bPitch,
                    \memoryBus,    bMem,
                    \atmosphereBus, bAtmo,
                    \spatialBus,   bSpat
                ], targetGrp);
            };

            // Broadcast current state to visuals bridge
            if(~visualsDest.notNil and: { (step % 4) == 0 }) {
                ~visualsDest.sendMsg('/bio/nutrient', transactionInfluence.linlin(0, 1, 0.1, 0.9));
                ~visualsDest.sendMsg('/bio/consensus', density.linlin(0, 1, 0.2, 0.8));
                ~visualsDest.sendMsg('/bio/density', density);
            };

            // Step + interval
            // ── (1) Block as the bar ─────────────────────────────────────
            // Normally `step` is a counter we increment: a metronome the chain
            // merely decorates. With rhythmBlockBar on, the step is READ from
            // where we are inside the real ~12 s block, so the bar is the
            // chain's own period and its 16 positions are a genuine phase.
            // beatTempo still governs the pulse rate: it sets how many 16-step
            // bars fit inside one block. At tempo 1.0 the bar IS the block; at
            // 2.0 two bars pass per block. Without this the performer lost
            // tempo control entirely whenever Bloque = Compás was engaged.
            if(rBlockBar and: { rs.notNil } and: { rs[\blockAt] > 0 }) {
                step = (blockPhase * 16 * ~beatParams.beatTempo).floor.asInteger % 16;
            } {
                step = (step + 1) % 16;
            };

            // Interval with micro-swing: odd steps slightly delayed for groove.
            // Half the old grid rate (was tempo*4): at tempo 1.0 a step is
            // 0.5 s, a 16-step bar 8 s, a phrase 32 s — evolution you can
            // hear as slow drift rather than beat-machine motion.
            interval = (1 / (~beatParams.beatTempo * 2)) *
                       (1 - (transactionInfluence * 0.1));

            // ── (1 cont.) lay the bar's onsets across the real block period ──
            // Denser blocks subdivide finer; the bar always closes with the
            // block rather than drifting against it.
            if(rBlockBar and: { rs.notNil } and: { rs[\blockAt] > 0 }) {
                interval = (rs[\blockPeriod] / (16 * ~beatParams.beatTempo.max(0.25)))
                    .clip(0.08, 2.0);
                // Blocks ordered by priority fee put the urgent transactions
                // first, so the head of the bar rushes and the tail thins —
                // each block arrives with its own internal shape.
                interval = interval * (0.72 + (blockPhase * 0.55));
            };

            // ── (3) Inter-arrival entropy → swing ────────────────────────
            // Regular arrivals keep the old gentle groove; bursty, clustered
            // ones push the offbeats further out. Shape, not amount.
            if(rEntropy) {
                if(step.odd) {
                    interval = interval * rrand(1.0, 1.12 + (chainEntropy * 0.65));
                } {
                    interval = interval * (1 - (chainEntropy * 0.18));
                };
            } {
                if(step.odd) { interval = interval * rrand(1.0, 1.12) }; // swing
            };
            } { |e|
                ~beatParams.beatErrors = (~beatParams.beatErrors ? 0) + 1;
                ("[BEAT] " ++ e.errorString ++ " — engine continues").postln;
            };
            interval.max(0.05).wait;
        };
    });
    
    ~beatRoutine.play;
};

// Enhanced Beat Controls with fixed GUI
~addBeatControls = {
    var controls = ();
    var values = ~beatParams.copy;
    
    if(~beatWindow.notNil and: { ~beatWindow.isClosed.not }) {
        ~beatWindow.close;
    };

    ~beatWindow = Window("Ethereum Beat Controls", Rect(500, 100, 400, 700));
    ~beatWindow.view.decorator = FlowLayout(~beatWindow.bounds, Point(10, 10), Point(10, 5));

    // Parameter groups
    [
        // Group 1: Rhythm
        ["RHYTHM", [
            [\beatTempo, [0.5, 2.0, \exp], "Tempo"],
            [\transactionInfluence, [0.0, 1.0, \lin], "TX Influence"]
        ]],
        
        // Group 2: Drone
        ["DRONE", [
            [\droneFade, [0.5, 4.0, \exp], "Fade Time"],
            [\droneSpace, [0.0, 1.0, \lin], "Space"],
            [\droneMix, [0.0, 1.0, \lin], "Layer Mix"],
            [\droneRes, [0.1, 0.9, \lin], "Resonance"],
            [\droneDepth, [0.0, 1.0, \lin], "Depth"]
        ]],
        
        // Group 3: Effects
        ["EFFECTS", [
            [\noiseLevel, [0.0, 0.3, \lin], "Noise Level"],
            [\noiseFilt, [0.1, 0.8, \lin], "Noise Filter"],
            [\delayFeedback, [0.0, 0.8, \lin], "Delay Feedback"],
            [\filterCutoff, [0.1, 1.0, \exp], "Filter Cutoff"]
        ]],
        
        // Group 4: Master
        ["MASTER", [
            [\masterAmp, [0.0, 1.0, \lin], "Master Level"]
        ]]
    ].do { |group|
        var groupName = group[0];
        var params = group[1];
        
        // Add group header
        StaticText(~beatWindow, 380@25)
            .string_(groupName)
            .align_(\center)
            .background_(Color.grey(0.9));
            
        params.do { |spec|
            var name = spec[0];
            var range = spec[1];
            var label = spec[2];
            
            StaticText(~beatWindow, 380@20)
                .string_(label)
                .align_(\left);
            
            controls[name] = Slider(~beatWindow, 380@20)
                .value_(values[name].linlin(range[0], range[1], 0, 1))
                .action_({ |sl|
                    var mappedValue = sl.value.linlin(0, 1, range[0], range[1]);
                    values[name] = mappedValue;
                    ~beatParams[name] = mappedValue;
                    ~controlBuses[name].set(mappedValue);
                    if(name == \beatTempo) {
                        ~beatEngine.value;
                    };
                });
        };
        
        // Add spacing between groups
        StaticText(~beatWindow, 380@10);
    };

    // Transaction Monitor
    StaticText(~beatWindow, 380@30)
        .string_("TRANSACTION MONITOR")
        .align_(\center)
        .background_(Color.grey(0.9));

    ~transactionCount = StaticText(~beatWindow, 380@20)
        .string_("Transactions: 0")
        .align_(\center);
        
    ~valueDisplay = StaticText(~beatWindow, 380@20)
        .string_("Last Value: 0 ETH")
        .align_(\center);
        
    ~activityMeter = UserView(~beatWindow, 380@20)
        .drawFunc_({ |view|
            var activity = ~beatParams.transactionDensity;
            Pen.fillColor = Color.blue(0.6, 0.5);
            Pen.fillRect(Rect(0, 0, view.bounds.width * activity, view.bounds.height));
        })
        .animate_(true);

    ~beatWindow.front;
};

// Initialize beat engine only after server is booted and SynthDefs are registered.
// s.doWhenBooted fires after the server is confirmed running. Adding s.sync + 0.5s extra
// ensures 3_synthdefs.scd's own doWhenBooted callback has had time to finish adding
// SynthDefs and populating ~buses before we try to instantiate \opalDrone.
s.doWhenBooted({
    // Allocate beat-params control buses now that the server is actually up
    ~beatParams.keysValuesDo { |key, value|
        if(~controlBuses[key].isNil) {
            ~controlBuses[key] = Bus.control(s, 1);
            ~controlBuses[key].set(value);
        };
    };

    // Wait for 3_synthdefs.scd's doWhenBooted to fully complete:
    // SynthDef registration + ~buses population needs two s.sync round-trips.
    // 1.5s on AppClock gives the server enough time even under load.
    AppClock.sched(1.5, {
        if(~buses.notNil and: { ~buses[\masterVolume].notNil }) {
            ~beatEngine.value;
            "Beat engine started — ~buses ready (% entries).".format(~buses.size).postln;
        } {
            // Buses not ready yet — retry once more after another second
            AppClock.sched(1.0, {
                ~beatEngine.value;
                "Beat engine started (delayed retry — buses: %).".format(~buses.notNil).postln;
                nil;
            });
        };
        nil;
    });
});

"Beat engine loaded with transaction influence.".postln;
)