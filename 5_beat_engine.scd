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
    transactionDensity: 0,

    // ── Marea · tidal rhythm state ──────────────────────────────────────
    // The rhythm is no longer a 16-step grid deciding what sounds; it is a
    // slow swell deciding how LIKELY anything is to sound. These four are
    // mirrored from the registry (\tideShort/\tideMedia/\tideLarga/
    // \tidePulse via beatParam:), so every surface — browser checkbox,
    // MIDI CC 17–20, SC GUI button — lands here through ~setParam.
    tideShort: 0,
    tideMedia: 1,
    tideLarga: 0,
    tidePulse: 1,
    // Derived each tick, read by the [MON] line. A toggle whose effect
    // cannot be observed is a toggle that cannot be debugged — that is the
    // lesson the seven removed rhythm toggles paid for.
    // nil, not 0: SystemClock.seconds is measured from sclang start, so 0 is a
    // perfectly legal epoch (it is the value during the first moments of a
    // session). Using 0 as the "unset" sentinel re-seeded the phase on every
    // tick until the clock had run a while, which held the tide at its trough
    // exactly when the piece is starting.
    tideEpoch: nil,
    tidePhase: 0,
    tideValue: 0.65,
    tideArc: \media,
    lastKickBlock: 0
);

// Note: control buses for beat params are allocated here but only after the server is running.
// Allocation happens inside the doWhenBooted block below to avoid allocating before server exists.
~controlBuses = ~controlBuses ?? ();

// ─── Helper: Compute pitch pool from live control values ───
// Drone register: fundamentals stay low (~35–740 Hz) so the Ringz percussion
// reads as struck-metal resonance INSIDE the drone rather than high pinging
// on top of it (basePitch was 200 with a 2.0 spread and a 200 Hz TX shift —
// pools reached ~1 kHz fundamentals, ~9 kHz partials).
// Degrees of a minor pentatonic, as ratios on the base pitch.
//
// The pool used to be INTEGER MULTIPLES — basePitch × 1, ×2, ×3, ×4, ×5, ×6 —
// which is a harmonic series. Walked in order (see poolIdx below) that is a
// rising scale run that resets at the top: measured at the live settings it
// played 50 · 99 · 149 · 199 · 248 · 298 Hz and repeated, forever. That is the
// "dumb progression, up then down". It was arithmetic, not a synth.
//
// Ratios instead of multiples: the pool spans about an octave and a half of a
// usable mode rather than six rungs of a ladder, so any order through it is
// musical rather than a run.
~pitchDegrees = #[1.0, 1.2, 1.3333, 1.5, 1.8, 2.0, 2.4];

~computePitchPool = { |harmRich=1.0, txInfluence=0.0, density=0.5|
    var basePitch = 70;
    var pitchShift = txInfluence * 50;   // TX activity nudges pitch gently
    // Range matched to the registry spec, which is now ControlSpec(0.1, 5):
    // the old 0.1–8.0 mapping could never reach its own top after that change.
    var spread = harmRich.linexp(0.1, 5.0, 0.5, 1.4);  // narrow→moderate spread
    var numSteps = (4 + (density * 3)).round.clip(4, 7);  // 4–7 notes

    // Clamped to 40–400 Hz: the struck-resonance register the drone sits in.
    Array.fill(numSteps, { |i|
        ((basePitch * spread * ~pitchDegrees[i]) + pitchShift).clip(40, 400);
    });
};

// ─── Cámara de las Especies: the five seats, as voices ──────────────────────
// The browser shows five species with a Presence and an Activity fader each,
// and until now both faders sent OSC that nothing in SuperCollider received.
// This is where they land.
//
// The corpus cannot carry them: it is indexed by ecological ROLE, not by
// taxon — 14_phenological_corpus.scd says so where it defines the bancadas.
// So a species becomes audible here instead, in the percussion layer, which
// already owns a pitch pool and a trigger.
//
// The division of labour is deliberate: the POOL still chooses the degree
// (that whole hop-selection design above survives untouched) and the SPECIES
// only chooses the register. One seat does not get to overwrite the melody;
// it gets to say which octave the chamber hears it in.
//
// Registers are ~5-semitone steps ordered low to high, which is also roughly
// descending body size across the default roster — a spectacled bear does not
// call where a cotton-top tamarin calls. When the roster changes the ordering
// stops meaning that, and the register is simply the seat's assigned range.
//
// They transpose UPWARD ONLY, and seat 0 is unity. Two reasons, both measured
// against the actual pool (~computePitchPool spans about 35–250 Hz depending
// on harmonicRich and transaction pressure):
//
//   · A symmetric set around 1.0 puts the lower seats under the 40 Hz floor
//     that \opalPerc enforces, and a clipped seat is not a seat — at the
//     bottom of the harmonicRich fader two or three of them collapsed onto
//     40 Hz and became the same voice. Measured: 21 clipped notes and an
//     adjacent-seat ratio of 1.00 (identical) for a symmetric set, against
//     0 clipped and a full 1.33 throughout for this one.
//   · Unity at seat 0 means the layer's original register is not lost, it is
//     simply assigned to the first seat. With the default presences the first
//     seat is also the most likely pick, so the percussion still sits where it
//     always sat and the other four open the register upward from it.
//
// Top of the range works out at ~780 Hz, inside \opalPerc's own 900 Hz ceiling.
~speciesBand     = #[1.0, 1.33, 1.78, 2.37, 3.16];
~speciesPresence = ~speciesPresence ?? { Array.fill(5, 0.5) };
~speciesActivity = ~speciesActivity ?? { Array.fill(5, 0.5) };
// A species votes by sounding. This is the count the browser's VOT column has
// been showing as a hardcoded 0 for its entire existence.
~speciesVotes    = ~speciesVotes    ?? { Array.fill(5, 0) };
~speciesFreq     = ~speciesFreq     ?? { Array.fill(5, 0.0) };

// Weighted pick over presence × activity: a species that is present but silent
// rarely speaks, and one that is absent does not speak at all. Falls back to a
// uniform pick when every weight is ~0, so an empty chamber thins the layer's
// register spread rather than stopping it — an error here would be raised
// inside the beat Routine, and an error in a Routine stops it for the session.
~pickSpecies = {
    var w = Array.fill(5, { |i|
        (~speciesPresence[i] ? 0.5).clip(0, 1) * (~speciesActivity[i] ? 0.5).clip(0, 1)
    });
    if(w.sum < 1e-6) { 5.rand } { w.normalizeSum.windex.clip(0, 4) };
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
// ─── Marea: the density arc ──────────────────────────────────────────────
// Which arc is active, and how many BLOCKS it spans. Blocks rather than
// seconds because the whole engine is already locked to the chain's measured
// cadence (~rhythmState[\blockPeriod]) — an arc counted in wall-clock seconds
// would drift against the bar the moment the chain sped up or stalled.
//   corto ~3.5 blocks ~ 40-50 s   ·   medio ~8 ~ 1.5-2 min
//   largo ~25 blocks ~ 4-6 min
// Exclusivity is guaranteed upstream by ~setParam's \exclusiveGroup, so at
// most one of the three is ever set; the ordering here is only a tiebreak for
// a hand-edited state.
~tideArc = {
    var p = ~beatParams;
    case
    { (p.tideShort ? 0) > 0.5 } { [\corto, 3.5]  }
    { (p.tideMedia ? 0) > 0.5 } { [\medio, 8.0]  }
    { (p.tideLarga ? 0) > 0.5 } { [\largo, 25.0] }
    { [\plano, 0] };            // all off - flat, no swell
};

// Phase 0->1 over one arc, and the swell itself. A raised cosine is used
// rather than a ramp so the crest and the trough are both plateaus and the
// motion between them is gradual - the difference between weather and a
// sawtooth. Flat mode holds a constant mid-high value so "no arc" still
// plays steadily instead of going quiet.
~tideCompute = { |blockPeriod = 12.0|
    var arc = ~tideArc.value, span, phase, tide, now;
    if(arc[1] <= 0) {
        ~beatParams.tidePhase = 0;
        ~beatParams.tideValue = 0.65;
        ~beatParams.tideArc = arc[0];
        0.65
    } {
        now = SystemClock.seconds;
        if(~beatParams.tideEpoch.isNil) { ~beatParams.tideEpoch = now };
        // blockPeriod is clamped because a single late or duplicated block
        // timestamp must not stretch the arc to something that never
        // completes inside a set, nor collapse it into a tremolo.
        span  = arc[1] * blockPeriod.clip(4.0, 30.0);
        phase = ((now - ~beatParams.tideEpoch) / span).mod(1.0);
        tide  = (1 - cos(2pi * phase)) * 0.5;
        ~beatParams.tidePhase = phase;
        ~beatParams.tideValue = tide;
        ~beatParams.tideArc = arc[0];
        tide
    };
};

// Per-event timing jitter, +/-45% of a tick, delivered as a timestamped
// bundle so it displaces the EVENT without displacing the clock. Nothing
// lands on an audible grid even though the scheduler still ticks regularly.
// The base offset is half a tick, which keeps the jittered time strictly
// positive - a negative bundle time is in the past and plays immediately,
// which is exactly the grid we are trying to leave.
~tideJitter = { |interval = 0.5|
    (interval * 0.5) + rrand(interval.neg * 0.45, interval * 0.45)
};

~beatEngine = {
    // .stop AND nil. The GUI's Beat Engine light used to test ~beatRoutine.notNil,
    // which stayed true forever because this line only stopped it — so the light
    // reported a dead engine as running. The light now watches ~lastBeatTime
    // (stamped once per step below), and this keeps the two in agreement.
    if(~beatRoutine.notNil) { ~beatRoutine.stop; ~beatRoutine = nil };
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
        // masterAmp NO va aquí: \opalDrone lo lee en vivo por masterAmpBus más
        // abajo. Estaba en los dos sitios, así que el drone respondía al mando
        // aproximadamente al cuadrado y —peor— con la mitad del producto
        // congelada en el valor que tuviera al arrancar el motor: mover el
        // fader a mitad de sesión sólo bajaba el factor del bus, y reiniciar
        // con el mismo fader daba otro nivel. Todas las demás capas lo aplican
        // una sola vez.
        \amp, (~beatParams.transportGain ? 1) * 0.8,
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
        \droneMixBus,     ~bi.(\droneMix),
        // delayFeedback had no reader at all until now.
        \delayFeedbackBus, ~bi.(\delayFeedback),
        // Matrix mixer: this layer's live level.
        \mixDroneBus, ~bi.(\mixDrone)
    ], target: if(~defaultGroup.notNil, { ~defaultGroup }, { s.defaultGroup }));
    
    ~beatRoutine = Routine({
        var step = 0;
        var bar = 0;           // bar counter for slow evolution
        var phrase = 0;        // phrase counter (every 4 bars)
        var transactionInfluence;
        // Evolving pattern seeds — mutate every phrase
        // 4 per bar, not 2: the old two-hit pattern was too sparse to read as
        // a pulse. Four gives a low beat you can lean on while staying far
        // from beat-machine motion.
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
            var rs, priorityRatio, accent;
            var tide, tideDensity, jitTick, blockEdge, percProb;

            // Proof of life for the GUI's Beat Engine light, stamped before the
            // guarded body so it reflects the loop turning rather than the loop
            // succeeding — a run of bad frames should still read as "running".
            ~lastBeatTime = now;
            ~beatStepCount = (~beatStepCount ? 0) + 1;

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

            rs = ~rhythmState;
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

            // ── Marea ── the swell that replaces the grid.
            // Everything below asks "how likely is an onset right now" rather
            // than "which step are we on". tideDensity never reaches zero: a
            // trough thins the texture to a trickle, it does not mute it, so
            // the piece cannot arrive at a silence it has no way out of.
            tide = ~tideCompute.(if(rs.notNil and: { rs[\blockPeriod] > 0 }) {
                rs[\blockPeriod]
            } { 12.0 });
            // Floor 0.15 -> 0.42. A trough at 0.15 thinned percussion and dust to
            // near nothing, and combined with the pads only firing on chain
            // activity the whole piece went silent for half of every arc. The
            // tide should THIN the texture, not empty it — the swell reads just
            // as well between 0.42 and 1.0, and there is always something in
            // the room.
            tideDensity = tide.linlin(0, 1, 0.42, 1.0);
            // The previous tick's interval is the tick length; jitter is scaled
            // to it so it stays musical whether the chain is fast or slow.
            jitTick = ~tideJitter.(~beatParams.lastInterval ? 0.5);
            // A block boundary is the only place the kick may land. blockAt is
            // the arrival timestamp maintained by the /eth/block handler, so
            // this is true exactly once per block regardless of tick rate.
            blockEdge = rs.notNil and: { rs[\blockAt] > 0 }
                and: { rs[\blockAt] != (~beatParams.lastKickBlock ? 0) };
            if(blockEdge) { ~beatParams.lastKickBlock = rs[\blockAt] };

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
                    // (the 16-step kickPattern that used to be rotated here is
                    //  gone with the grid — the kick now follows block seams)
                    // Shift the percussion base rate — sparse, drone-friendly
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

            // Gas deviation → accent: how far this actor bid over base fee.
            accent = if(priorityRatio > 0) { 0.85 + (priorityRatio * 0.9) } { 1.0 };

            // ── 1. KICK — one per block at most, gated by the tide ───────────────
            // The 16-step kickPattern is gone. A kick on a grid is the single
            // loudest tell that a machine is counting, and it is the opposite
            // of the register asked for. Now the low end can only occur where
            // the chain itself has a seam — a new block — and even there it is
            // probabilistic: tide.squared, so it is near-certain at the crest
            // and effectively absent through the trough.
            //
            // PULSO overrides that: one hit per block regardless of phase, a
            // heartbeat that survives the troughs. It is the anchor to switch
            // on when the tide alone leaves the piece too unmoored.
            // ⚠ PARÉNTESIS OBLIGATORIOS. En sclang todos los selectores binarios
            // tienen la MISMA precedencia y se evalúan de izquierda a derecha,
            // así que `A and: {B} or: {C}` es `(A and: B) or: C`, no
            // `A and: (B or: C)`. Sin ellos, con PULSO apagado el bombo dejaba
            // de mirar blockEdge por completo y disparaba con la moneda de la
            // marea en CADA tick —uno cada ~0.5 s en vez de uno por bloque de
            // ~12 s— y toda la regla "el bombo sólo ocurre donde la cadena
            // tiene una costura" quedaba anulada.
            //
            // No se detectó en vivo porque la prueba se hizo con PULSO
            // ENCENDIDO, que es justo el caso donde la rama izquierda es
            // verdadera y el paréntesis no cambia nada.
            if(blockEdge and: { ((~beatParams.tidePulse ? 0) > 0.5) or: { tide.squared.coin } }) {
                // Subtle frequency drift: ±5Hz per bar for organic feel
                var kickFreq = 50 + ((bar % 7) - 3 * 1.5);
                ~beatParams.kickCount = (~beatParams.kickCount ? 0) + 1;
                // ── Onset → visuals ──────────────────────────────────────
                // Los slots 4-9 son ahora los seis instrumentos del motor, uno
                // cada uno, y necesitan saber CUÁNDO suena el suyo — no sólo
                // cuánta energía hay en su banda. El espectro dice qué se está
                // oyendo; esto dice qué acaba de empezar. Sin el ataque, un
                // visual reacciona siempre tarde y difuso.
                if(~visualsDest.notNil) {
                    ~visualsDest.sendMsg('/voice/kick',
                        (~beatParams.masterAmp * (0.5 + (density * 0.2)) * accent).clip(0, 1));
                };
                s.makeBundle(s.latency + jitTick, { Synth(\opalKick, [
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
                    \spatialBus,   bSpat,
                    // Matrix mixer: this layer's live level.
                    \mixKickBus, ~bi.(\mixKick)
                ], targetGrp) });
            };

            // ── 2. PERC — tidal probability, not a polyrhythmic divisor ──────────
            // percDivisor survives as the BASE RATE (it is still rotated each
            // phrase, so the average spacing keeps moving) but it no longer
            // picks the moment: 1.6/divisor is the crest probability per tick,
            // scaled by the tide. At divisor 8 that runs ~0.20 at the crest and
            // ~0.03 in the trough, which is the swell-and-thin the arcs exist
            // to produce. The transaction clause is kept — a burst of chain
            // activity should still be able to push through a trough.
            percProb = ((1.6 / percDivisor) * tideDensity).clip(0.0, 0.9);
            if(percProb.coin or: {
                (transactionInfluence > 0.6) and: { (0.12 * tideDensity).coin }
            }) {
                // Degree selection. Stepping +1 through an ordered pool is a
                // scale run whatever the pool contains — that was the other
                // half of the "up then down".
                //
                // A FIXED hop does not fix it either: any hop sharing a factor
                // with the pool size cycles a subset (hop 3 on a 6-note pool is
                // a two-note ostinato), and hop = size-1 is a descending run.
                // Measured over 60 hits: hop 2 → 3/6 notes, hop 3 → 2/6,
                // hop 5 → all six but strictly descending.
                //
                // So: take the degree from the transaction itself when the
                // chain is flowing — its counterparty and its position in the
                // block. The same actor tends to return around the same degree
                // while the block position keeps consecutive hits apart, which
                // is motion that follows the chain rather than counting.
                // With no chain data, hop by a VARYING amount in 2..size-1:
                // never repeats a note, never steps to a neighbour, and has no
                // fixed cycle to lock into (verified full pool coverage at
                // every size 4–7).
                //
                // Which seat speaks, and therefore in which register. The pool
                // still supplies the degree; ~speciesBand only transposes it.
                var speciesIdx = ~pickSpecies.value;
                // Presence as prominence, not as a gate — absence is already
                // handled upstream, where a weight of 0 simply stops that seat
                // being picked. Centred so the 0.5 default is unity gain and
                // the layer sounds exactly as it did before any of this.
                var speciesGain = 0.55
                    + ((~speciesPresence[speciesIdx] ? 0.5).clip(0, 1) * 0.9);
                var baseFreq = (pitchPool.wrapAt(poolIdx)
                    * ~speciesBand[speciesIdx]).clip(40, 900);
                poolIdx = if(rs.notNil and: { rs[\addrSig] > 0 }) {
                    ((rs[\addrSig] >> 2) + rs[\txIndex]) % pitchPool.size
                } {
                    (poolIdx + rrand(2, pitchPool.size - 1)) % pitchPool.size
                };
                ~beatParams.percCount = (~beatParams.percCount ? 0) + 1;
                // The vote is cast at the moment of sounding, and the register
                // it sounded in is what the browser's FREQ column reports.
                ~speciesVotes[speciesIdx] = ~speciesVotes[speciesIdx] + 1;
                ~speciesFreq[speciesIdx]  = baseFreq;
                if(~visualsDest.notNil) {
                    // freq normalizada además del ataque: la percusión cambia
                    // de registro con la melodía y el visual debe seguirla.
                    ~visualsDest.sendMsg('/voice/perc',
                        (0.2 + (transactionInfluence * 0.15)).clip(0, 1),
                        (baseFreq / 900).clip(0, 1));
                };

                // ─ Voicing: single note, dyad, or triad based on texture control ─
                // ONE bundle for the whole case: every voice of a dyad or triad
                // must share the same jitter, or the chord arpeggiates itself.
                s.makeBundle(s.latency + jitTick, {
                case
                { voicingMode == \single } {
                    // Single pitched note
                    var percFreq = (baseFreq * rrand(0.95, 1.05)).clip(40, 900);
                    Synth(\opalPerc, [
                        \out,          0,
                        \freq,         percFreq,
                        \amp,          ~beatParams.masterAmp * (~beatParams.transportGain ? 1) *(0.2 + (transactionInfluence * 0.15)) * accent * speciesGain,
                        \masterVolBus, bMVol,
                        \harmonicBus,  bHarm,
                        \textureBus,   bText,
                        \resonantBus,  bRes,
                        \spectralBus,  bSpec,
                        \timeBus,      bTime,
                        \memoryBus,    bMem,
                        \atmosphereBus, bAtmo,
                        \spatialBus,   bSpat,
                        // Matrix mixer: this layer's live level.
                        \mixPercBus, ~bi.(\mixPerc)
                    ], targetGrp);
                }
                { voicingMode == \dyad } {
                    // Two-note interval
                    2.do { |voice|
                        var harmFreq = (baseFreq * ([1.0, 1.5][voice]) * rrand(0.98, 1.02)).clip(40, 900);
                        Synth(\opalPerc, [
                            \out,          0,
                            \freq,         harmFreq,
                            \amp,          ~beatParams.masterAmp * (~beatParams.transportGain ? 1) *(0.2 + (transactionInfluence * 0.15)) * accent * speciesGain * [1.0, 0.6][voice],
                            \masterVolBus, bMVol,
                            \harmonicBus,  bHarm,
                            \textureBus,   bText,
                            \resonantBus,  bRes,
                            \spectralBus,  bSpec,
                            \timeBus,      bTime,
                            \memoryBus,    bMem,
                            \atmosphereBus, bAtmo,
                            \spatialBus,   bSpat,
                            // Matrix mixer: this layer's live level.
                            \mixPercBus, ~bi.(\mixPerc)
                        ], targetGrp);
                    };
                }
                { voicingMode == \triad } {
                    // Full harmonic series (up to harmCount)
                    (harmCount.clip(2, 5)).do { |h|
                        // (h+1) reached 5x on top of a 686 Hz pool note. Clamped
                        // to the same ceiling \opalPerc enforces internally, so the
                        // harmonics thin toward the top instead of climbing away.
                        var harmFreq = (baseFreq * (h + 1)
                            * resBdy.linexp(0.1, 0.8, 0.95, 1.15)).clip(40, 900);
                        Synth(\opalPerc, [
                            \out,          0,
                            \freq,         harmFreq,
                            \amp,          ~beatParams.masterAmp * (~beatParams.transportGain ? 1) *(0.2 + (transactionInfluence * 0.15)) * accent * speciesGain * (1.0 / (h + 1.5)),
                            \masterVolBus, bMVol,
                            \harmonicBus,  bHarm,
                            \textureBus,   bText,
                            \resonantBus,  bRes,
                            \spectralBus,  bSpec,
                            \timeBus,      bTime,
                            \memoryBus,    bMem,
                            \atmosphereBus, bAtmo,
                            \spatialBus,   bSpat,
                            // Matrix mixer: this layer's live level.
                            \mixPercBus, ~bi.(\mixPerc)
                        ], targetGrp);
                    };
                };
                });
            };

            // ── 3. DUST — probability-based, not grid-locked ─────────────────────
            if((dustProb * tideDensity).coin) {
                if(~visualsDest.notNil) {
                    ~visualsDest.sendMsg('/voice/dust',
                        (0.3 + (density * 0.35)).clip(0, 1));
                };
                s.makeBundle(s.latency + jitTick, { Synth(\opalDust, [
                    \out,         0,
                    \amp,         ~beatParams.masterAmp * (~beatParams.transportGain ? 1) *(0.3 + (density * 0.35)) * accent,
                    \masterVolBus, bMVol,
                    \textureBus,   bText,
                    \spectralBus,  bSpec,
                    \timeBus,      bTime,
                    \pitchBus,     bPitch,
                    \memoryBus,    bMem,
                    \atmosphereBus, bAtmo,
                    \spatialBus,   bSpat,
                    // Matrix mixer: this layer's live level.
                    \mixDustBus, ~bi.(\mixDust)
                ], targetGrp) });
            };

            // Broadcast current state to visuals bridge
            if(~visualsDest.notNil and: { (step % 4) == 0 }) {
                ~visualsDest.sendMsg('/bio/nutrient', transactionInfluence.linlin(0, 1, 0.1, 0.9));
                ~visualsDest.sendMsg('/bio/consensus', density.linlin(0, 1, 0.2, 0.8));
                ~visualsDest.sendMsg('/bio/density', density);
                // The tide itself, so the browser can follow the same swell the
                // audio is following. Slot A thins its chorus through the
                // trough and lets the machine bench carry the crest-to-trough
                // transition; without this it would have to guess, or invent a
                // second envelope that drifts against this one. Arc periods are
                // 40 s to 6 min, so a ~1.5 s update is ample resolution.
                ~visualsDest.sendMsg('/tide/state', tide, ~beatParams.tidePhase ? 0);

                // ── The chamber reports back ────────────────────────────────
                // /agent/species/state and /agent/edna/state have been parsed
                // by parliamentStore.ts since it was written, in exactly this
                // argument order, with nothing on the other end sending them.
                // That is why the browser's ACOUSTIC SPECIES panel showed a
                // hardcoded 440 Hz and 0 votes for every session. These are
                // the emitters.
                5.do { |i|
                    ~visualsDest.sendMsg('/agent/species/state',
                        i,
                        (~speciesPresence[i] ? 0.5),
                        (~speciesActivity[i] ? 0.5),
                        (~speciesVotes[i] ? 0),
                        (~speciesFreq[i] ? 0.0));
                };
                // Validation is how recently the site was last attested: a
                // reading nobody has touched for two minutes is no longer a
                // validated one. Decays rather than dropping, so the bar reads
                // as confidence draining rather than a feed going down.
                if(~ednaBiodiversity.notNil and: { ~ednaTouchedAt.notNil }) {
                    8.do { |i|
                        var since = SystemClock.seconds - (~ednaTouchedAt[i] ? 0);
                        ~visualsDest.sendMsg('/agent/edna/state',
                            i,
                            (~ednaBiodiversity[i] ? 0.5),
                            (1.0 - (since / 120.0)).clip(0, 1));
                    };
                };
            };

            // Step + interval
            step = (step + 1) % 16;

            // ── Tempo: the BAR follows the chain ──────────────────────────
            // Transactions used to bend this by ±10% only
            //     (1 / (beatTempo*2)) * (1 - transactionInfluence*0.1)
            // so the pulse was a fixed grid the ETH inflow merely decorated —
            // which is why so little of what arrives was audible in the beat.
            //
            // Now a 16-step bar spans the MEASURED block period (maintained by
            // the /eth/block handler and already proven driving ~padDrainRoutine),
            // transactionDensity scales the subdivision so a busy chain
            // subdivides finer, and beatTempo stays the performer's master
            // multiplier over the result.
            //
            // Two guards, straight from the rhythm toggles that had to be
            // removed: fall back to the fixed grid whenever no block has been
            // seen (cold start, or the Python feed died) so the engine never
            // stalls waiting on the chain, and clamp the result so a bad
            // blockPeriod can neither freeze the beat nor machine-gun it.
            if(rs.notNil and: { rs[\blockAt] > 0 }) {
                var subdiv = 16 * (0.75 + (density * 0.75));   // 12–24 steps/bar
                interval = (rs[\blockPeriod] / subdiv) / ~beatParams.beatTempo.max(0.25);
            } {
                interval = (1 / (~beatParams.beatTempo * 2)) *
                           (1 - (transactionInfluence * 0.1));
            };
            interval = interval.clip(0.06, 2.0);
            ~beatParams.lastInterval = interval;   // surfaced on [MON] as int:

            if(step.odd) { interval = interval * rrand(1.0, 1.12) }; // swing
            } { |e|
                ~beatParams.beatErrors = (~beatParams.beatErrors ? 0) + 1;
                ("[BEAT] " ++ e.errorString ++ " — engine continues").postln;
            };
            interval.max(0.05).wait;
        };
    });
    
    ~beatRoutine.play;
};

// The 'Enhanced Beat Controls' window that used to live here is gone.
// ~addBeatControls was never called from anywhere in the repo: it built a
// second control surface with twelve 380-px sliders whose ranges contradicted
// the canonical registry (droneFade 0.5-4.0 against 0.1-5 exp, filterCutoff
// 0.1-1.0 exp against 0-1 lin, noiseLevel 0-0.3 against 0-0.5), and it wrote
// through ~controlBuses[name].set() -- the pre-registry path that bypasses
// ~setParam, so nothing it touched would have reached the GUI knob, the MIDI
// mirror or the browser slider. Its three readouts (~transactionCount,
// ~valueDisplay, ~activityMeter) were the only reason the deferred GUI-refresh
// block in 6_osc_handlers.scd existed; that is deleted too.

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