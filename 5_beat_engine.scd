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
// Widened from #[1.0, 1.2, 1.3333, 1.5, 1.8, 2.0, 2.4], which spanned only 1.26
// octaves. Two octaves down that put the whole pool inside 26-61 Hz — a 36 Hz
// band at the bottom of the range, where pitch discrimination is poor and
// adjacent degrees are 3.2 semitones apart on a resonator whose fundamental is
// barely periodic. It measured as seven notes and heard as one, which is the
// "almost always the same note".
//
// This spans 3.6x — 1.85 octaves — with wider gaps low down where the ear needs
// them and closer steps up top. Same intervals in character, enough room
// between them to be heard as different notes in the register they now sit in.
~pitchDegrees = #[1.0, 1.25, 1.5, 1.8, 2.25, 2.7, 3.6];

// `root` is the DRONE's fundamental. The default of 35 doubles to the 70 this
// used to hardcode, so a caller that passes nothing behaves exactly as before.
//
// This was the deepest reason the percussion and the bed sounded like two
// unrelated pieces: the pool was built on a hardcoded 70 Hz while ~droneRoot
// walked 41–82 Hz every four bars. They were in two different keys, one of them
// fixed and one of them moving, and no amount of timbral or rhythmic work can
// make that sound like one instrument. At root 55 the bed sounded 55/110/165/220
// while the perc played 65/78/87/98/117/130/156 — almost none of which is a
// harmonic of anything sounding underneath it.
//
// Placed HALF the fundamental, which is two octaves below where this sat after
// the coupling work. The report was that the layer sings too high, and it did:
// at root 55 the pool ran 102-246 Hz and ~speciesBand then multiplied by up to
// 3.16, so the top seat struck at 778 Hz -- well out of the register a body
// this size should ring in, and above most of the bed.
//
// Two octaves down puts the pool at 25-61 Hz and the top seat at ~195 Hz, which
// is a chest register: struck bodies with weight, under the drone rather than
// over it. The degrees and the coupling to ~droneRoot are untouched.
~computePitchPool = { |harmRich=1.0, txInfluence=0.0, density=0.5, root=35|
    var basePitch = root * 0.5;
    var pitchShift = txInfluence * 50;   // TX activity nudges pitch gently
    // Range matched to the registry spec, which is now ControlSpec(0.1, 5):
    // the old 0.1–8.0 mapping could never reach its own top after that change.
    var spread = harmRich.linexp(0.1, 5.0, 0.5, 1.4);  // narrow→moderate spread
    var numSteps = (4 + (density * 3)).round.clip(4, 7);  // 4–7 notes

    // Clamped to 40–400 Hz: the struck-resonance register the drone sits in.
    Array.fill(numSteps, { |i|
        // Floor follows the register down: at 40 the bottom third of the new
        // pool would clip onto a single frequency and those degrees would stop
        // being distinct notes.
        ((basePitch * spread * ~pitchDegrees[i]) + pitchShift).clip(22, 400);
    });
};

// ─── Parameter locks, in the Octatrack sense ────────────────────────────────
// On an Octatrack any trig can carry its own value for any parameter, so a
// pattern is not one sound repeated at different pitches — it is a different
// sound on every step. That is precisely what this layer did not have. The
// chain chose WHICH note, and the knobs chose what it sounded like, identically
// for every hit forever. All the chain's detail arrived as pitch selection and
// nothing else.
//
// Every strike now carries a full parameter set derived from the transaction
// that fired it, and passes -1 for the matching bus so that hit ignores the
// knob. Six readings drive six parameters, deliberately taken from six
// DIFFERENT fields, so nothing moves in lockstep — a block that is busy but
// cheap sounds unlike one that is quiet and expensive.
//
// The knob remains the centre and the chain deviates around it, so the
// performer still voices the layer and the chain articulates it.
// transactionInfluence is the lock depth: at 0 every hit takes the knobs
// exactly as before, at 1 the chain swings each parameter most of its range.
~percLocks = { |rs, depth = 0.5|
    var d    = depth.clip(0, 1) * 0.85;
    var ent  = ((rs !? { rs[\entropy] }) ? 0).clip(0, 1);
    var cd   = ((((rs !? { rs[\calldataLen] }) ? 0) + 1).log2 / 12).clip(0, 1);
    var full = ((((rs !? { rs[\blockTxCount] }) ? 0) / 250.0)).clip(0, 1);
    var fee  = (((((rs !? { rs[\blockBaseFee] }) ? 0) + 1).log2 / 7.0)).clip(0, 1);
    var addr = ((((rs !? { rs[\addrSig] }) ? 0).abs % 251) / 251.0);
    var idx  = ((((rs !? { rs[\txIndex] }) ? 0).abs % 64) / 64.0);
    var lerp = { |knob, target, lo, hi| (knob + ((target - knob) * d)).clip(lo, hi) };
    [
        // How much each transaction SAYS -> how far the strike is torn into
        // sidebands. A bare transfer barely shapes it; a contract call with
        // kilobytes of input pushes the hit toward noise.
        \textureBus, -1, \texture,
            lerp.(~busVal.value(\textureDepth, 0.2), cd, 0, 1),
        // How irregular the chain's arrivals are -> how inharmonic the body is.
        \resonantBus, -1, \resonance,
            lerp.(~busVal.value(\resonantBody, 0.4), 0.1 + (ent * 0.7), 0.1, 0.8),
        // What the block costs -> the colour of the exciter.
        \noiseFiltBus, -1, \noiseF,
            lerp.(~busVal.value(\noiseFilt, 0.5), fee, 0, 1),
        // How full the block is -> how long the tail keeps folding back.
        \delayFeedbackBus, -1, \delayFb,
            lerp.(~busVal.value(\delayFeedback, 0.3), full * 0.8, 0, 0.8),
        // Who the counterparty is -> how much breath is in the strike, so the
        // same actor returning is recognisably the same touch.
        \noiseLevelBus, -1, \noiseL,
            lerp.(~busVal.value(\noiseLevel, 0.1), addr * 0.6, 0, 0.6),
        // Where it sat in the block -> how long it rings.
        \timeBus, -1, \timeStr,
            lerp.(~busVal.value(\timeDilation, 2.0), 0.6 + (idx * 4.5), 0.5, 6.0)
    ];
};

// ─── Retrig ─────────────────────────────────────────────────────────────────
// The other half of the Octatrack idiom: one trig becomes a burst, at a rate
// and length set per event rather than by the sequencer.
//
// What earns a retrig is the one chain field that actually means "something
// complicated happened": calldata. A bare value transfer carries none and
// strikes once. A contract call carries 68 bytes or more, a swap several
// hundred — those burst. So the layer's most emphatic gesture is reserved for
// the transactions that DO something, which is the distinction the piece is
// about, and it costs no extra data to make.
~percRetrig = { |rs, freq, bodySeed, lockArgs, amp, depth|
    var cd   = ((((rs !? { rs[\calldataLen] }) ? 0) + 1).log2 / 12).clip(0, 1);
    var idx  = (((rs !? { rs[\txIndex] }) ? 0).abs % 16);
    var count, interval, glide;
    if(rs.notNil and: { cd > 0.40 } and: { (depth * 1.4).coin }) {
        // 3–7 repeats: enough to read as a burst, short of a machine gun.
        count    = (2 + (cd * 6)).round.clip(3, 7);
        // Rate off the position in the block, so consecutive transactions in
        // the same block do not all stutter identically.
        interval = ((0.17 - (cd * 0.10)) / (1 + (idx % 3))).clip(0.028, 0.17);
        // Retrigs that rise, fall or hold, chosen by block position.
        glide    = #[1.0, 1.0, 2.0, 0.5, 1.5, 0.75].wrapAt(idx);
        count.do { |i|
            var f = (freq * (glide ** ((i + 1) / count))).clip(22, 900);
            s.makeBundle(s.latency + ((i + 1) * interval), {
                Synth(\opalPerc, [
                    \out, 0, \freq, f, \bodySeed, bodySeed,
                    // Falls away rather than repeating flat.
                    \amp, amp * ((1 - ((i + 1) / (count + 1))) ** 1.3) * 0.85
                ] ++ (~voiceBusArgs.value ? []) ++ lockArgs);
            });
        };
    };
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

// ─── The drone bed as an ensemble ───────────────────────────────────────────
// Partials arrive, hold, and leave. Nothing glides. The harmony changes because
// old partials die at the old fundamental while new ones are born at the new
// one — which is how drone music has always changed harmony, and it is the
// answer to a bed whose only event was a ramp between two pitches.
//
// Ratios are a harmonic series with two just intervals folded in, weighted so
// the low partials are common and the high ones are occasional. That weighting
// is what makes it a bed rather than a chord: the fundamental and its octave
// are almost always present, the fifth often, the seventh partial rarely and
// briefly, so the top of the bed keeps changing while the bottom holds.
~droneRatios  = #[0.5, 1.0, 1.0, 1.5, 2.0, 2.0, 2.5, 3.0, 4.0, 5.0, 6.0];
// Bottom octave weighted up now that nothing else supplies it: 0.10 -> 0.22 on
// the 0.5 ratio, so the bed reliably keeps a sub partial alive.
~droneWeights = #[0.22, 0.16, 0.14, 0.11, 0.09, 0.09, 0.06, 0.05, 0.04, 0.02, 0.02];
~droneVoices  = ~droneVoices ?? { [] };
~droneMaxVoices = 7;
~droneRoot = ~droneRoot ?? { 55 };

// What each live partial is actually sounding, so the percussion can strike a
// tone the bed is already holding rather than a tone that merely belongs to the
// same scale. Keyed by the Synth itself and cleared in its onFree, so it cannot
// outlive the voice it describes.
~droneVoiceHz = ~droneVoiceHz ?? { IdentityDictionary.new };
// The amplitude each partial was born with, so the transport and the emergency
// can scale the bed and put it back without losing the per-partial balance.
~droneVoiceAmp = ~droneVoiceAmp ?? { IdentityDictionary.new };

// ─── Acting on the bed ──────────────────────────────────────────────────────
// Everything that used to be done to \opalDrone is done here instead. Those
// call sites went on compiling and running after the supersaw was removed —
// ~opalDroneSynth was nil and every one of them was .notNil-guarded, so they
// silently became no-ops. Reading them, the emergency handler still looks like
// it drops the drone to sub-bass and the stop handler still looks like it fades
// the bed out. Neither did anything at all. That is exactly the kind of code
// that misleads, so it is routed to the live ensemble here and deleted there.
//
// scale is applied against each partial's ORIGINAL amplitude rather than its
// current one, so repeated calls do not compound and a restore is exact.
~droneBedSet = { |scale = 1.0, root|
    (~droneVoices ? []).do { |v|
        if(v.notNil) {
            var a0 = (~droneVoiceAmp ? ())[v];
            if(a0.notNil) { v.set(\amp, a0 * scale) };
            // SinOsc holds phase across a frequency change, so this is a pitch
            // move rather than a click, even applied to seven sustained voices.
            if(root.notNil) {
                var hz = (~droneVoiceHz ? ())[v];
                if(hz.notNil and: { (~droneRoot ? 55) > 0 }) {
                    v.set(\freq, root);
                };
            };
        };
    };
    if(root.notNil) { ~droneRoot = root };
};

// The percussion layer's excitement, published for the bed to read. It is
// already computed every tick to shape the rhythm; this just makes it audible
// to something other than itself.
~droneStrikeBus = ~droneStrikeBus ?? { Bus.control(s, 1).set(0) };

~droneEnsemble = {
    if(~droneRoutine.notNil) { ~droneRoutine.stop; ~droneRoutine = nil };
    ~droneRoutine = Routine({
        4.0.wait;   // let the server settle before the bed starts filling
        loop {
            var wait = 4.0;
            try {
                var live = (~droneVoices ? []).select { |v| v.notNil };
                var harm = ~busVal.value(\harmonicRich, 1.0);
                var tDil = ~busVal.value(\timeDilation, 2.0);
                // The chain's own conditions, read at the moment a partial is
                // born. The bed is slow, so these arrive as the weather the
                // voice grows up in rather than as a modulation of it.
                var crs  = ~rhythmState;
                var chainEnt = ((crs !? { crs[\entropy] }) ? 0).clip(0, 1);
                var chainCd  = ((((crs !? { crs[\calldataLen] }) ? 0) + 1).log2 / 12).clip(0, 1);
                var chainFull= ((((crs !? { crs[\blockTxCount] }) ? 0) / 250.0)).clip(0, 1);
                ~droneVoices = live;
                if(live.size < ~droneMaxVoices) {
                    var i = ~droneWeights.normalizeSum.windex;
                    var ratio = ~droneRatios[i];
                    // Lives are long and unequal. timeDilation scales them, so
                    // the same fader that stretches every envelope in the
                    // engine also decides how slowly the bed turns over.
                    // A contested block makes the bed turn over faster: lives
                    // shorten by up to 40%, so partials arrive and leave more
                    // often and the drone becomes visibly restless under load.
                    var churn = 1.0 - (chainFull * 0.4);
                    var atk  = rrand(9.0, 26.0) * tDil.linlin(0.5, 6, 0.6, 1.8) * churn;
                    var hold = rrand(14.0, 48.0) * tDil.linlin(0.5, 6, 0.6, 1.8) * churn;
                    var rel  = rrand(12.0, 34.0) * tDil.linlin(0.5, 6, 0.6, 1.8) * churn;
                    var syn = Synth(\dronePartial, [
                        \out,    0,
                        \freq,   ~droneRoot,
                        \ratio,  ratio,
                        // Higher partials quieter, or the bed turns into a
                        // chord standing on its own overtones.
                        \amp,    (0.16 / (1 + (ratio * 0.55)))
                            * harm.linexp(0.1, 5.0, 0.7, 1.35)
                            // The bed was the one layer a transport stop never
                            // reached, because the stop acted on \opalDrone.
                            * (~beatParams.transportGain ? 1),
                        \atk, atk, \hold, hold, \rel, rel,
                        \pan,    1.0.rand2 * 0.7,
                        // How much the chain is SAYING widens the partial.
                        \detune, rrand(0.002, 0.009) * (1 + (chainCd * 2.2)),
                        \seed,   1.0.rand,
                        // Which REGIME this partial inhabits is the chain's
                        // call, not the dice's. Entropy — how irregular the
                        // chain's arrivals have been lately — pushes the bed
                        // from resonant noise toward feedback and FM, so a
                        // bursty chain audibly destabilises the drone while an
                        // even one lets it settle into bands. Still squared and
                        // still jittered, so the distribution stays uneven and
                        // two partials born together are not twins.
                        \character, ((chainEnt * 0.75) + (1.0.rand * 0.45))
                            .clip(0, 1).squared,
                        // The percussion's excitement reaches the bed here.
                        \strikeBus, ~droneStrikeBus.index
                    ] ++ (~voiceBusArgs.value ? []),
                        target: if(~defaultGroup.notNil, { ~defaultGroup }, { s.defaultGroup }));
                    ~droneVoices = ~droneVoices.add(syn);
                    ~droneVoiceHz[syn] = ~droneRoot * ratio;
                    ~droneVoiceAmp[syn] = (0.16 / (1 + (ratio * 0.55)))
                        * harm.linexp(0.1, 5.0, 0.7, 1.35)
                        * (~beatParams.transportGain ? 1);
                    syn.onFree({
                        ~droneVoices.remove(syn);
                        ~droneVoiceHz.removeAt(syn);
                        ~droneVoiceAmp.removeAt(syn);
                    });
                };
                // Uneven spacing. A fixed interval would make the bed pulse at
                // that period, which is the ramp problem in another costume.
                wait = rrand(5.0, 17.0);
            } { |e|
                ("[drone] ensemble frame: " ++ e.errorString).postln;
                wait = 6.0;
            };
            wait.wait;
        };
    }).play(AppClock);
    "[drone] ensemble running".postln;
};

~beatEngine = {
    // .stop AND nil. The GUI's Beat Engine light used to test ~beatRoutine.notNil,
    // which stayed true forever because this line only stopped it — so the light
    // reported a dead engine as running. The light now watches ~lastBeatTime
    // (stamped once per step below), and this keeps the two in agreement.
    if(~beatRoutine.notNil) { ~beatRoutine.stop; ~beatRoutine = nil };
    
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

    // ─── The propeller is gone ──────────────────────────────────────────────
    // \opalDrone — five detuned Saws through a lowpass — was still being
    // spawned here as a "sub anchor" AFTER the bed was rebuilt around it, and
    // its level made that a fiction. Measured from the live node tree against
    // the trims: amp 0.8 x trimDrone gave it an effective 0.2944, while one
    // \dronePartial ran at 0.0235 and five of them summed to about 0.0526. The
    // old voice was 15 dB louder than the ENTIRE new bed.
    //
    // So every measurement of the rebuild was of a layer buried 15 dB under the
    // exact sound the rebuild was meant to remove, and the drone went on
    // sounding like a propeller because a propeller was still the loudest thing
    // in it. That is why three rounds of work changed nothing audible.
    //
    // The bed does not need a separate anchor: ~droneRatios already contains
    // 0.5, so the ensemble grows its own bottom octave out of the same voice as
    // everything else. Nothing here spawns \opalDrone any more. The SynthDef
    // stays defined because the slot voices still spawn their own, and
    // everything that used to be done TO the bed here now goes through
    // ~droneBedSet, which acts on the live ensemble.
    // Nothing spawns \opalDrone in the bed any more.

    
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
            pitchPool = ~computePitchPool.(harmRich, txInf, density * phenoMult,
                (~droneRoot ? 55));
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
                    // The root moves and NOTHING GLIDES. Partials born after
                    // this line arrive at the new fundamental while the ones
                    // already sounding live out their lives at the old one, so
                    // the harmony changes by crossfade between two populations
                    // rather than by sliding a single voice. That slide — a 4 s
                    // Lag applied to one perpetual synth every four bars — was
                    // the whole of the bed's motion, and it is what read as a
                    // small plane changing gear.
                    // The phrase walk moves the ROOT and nothing else. There
                    // is no separate anchor to keep in step any more, and no
                    // synth here to set: partials born after this line arrive
                    // at the new fundamental while the ones already sounding
                    // live out their lives at the old one.
                    ~droneRoot = droneBaseFreq;
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
                // Stamped outside the ~visualsDest guard on purpose: this is
                // not telemetry, it is the arbitration clock 15_slot_voices.scd
                // reads to decide whether a slot may speak here. It has to be
                // true whether or not anything is watching.
                if(~lastVoiceAt.notNil) { ~lastVoiceAt[\kick] = now };
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
                ] ++ (~voiceBusArgs.value ? []), targetGrp) });
            };

            // ── 2. PERC — tidal probability, not a polyrhythmic divisor ──────────
            // percDivisor survives as the BASE RATE (it is still rotated each
            // phrase, so the average spacing keeps moving) but it no longer
            // picks the moment: 1.6/divisor is the crest probability per tick,
            // scaled by the tide. At divisor 8 that runs ~0.20 at the crest and
            // ~0.03 in the trough, which is the swell-and-thin the arcs exist
            // to produce. The transaction clause is kept — a burst of chain
            // activity should still be able to push through a trough.
            // ── Self-exciting, not uniform ─────────────────────────────────
            // This was a fixed-probability coin per tick, and a Bernoulli
            // process at constant p is the most PREDICTABLE thing a rhythm can
            // be: statistically uniform, evenly sprinkled, no clusters and no
            // gaps. It never surprises because there is nothing in it that
            // could — every tick is independent of every other.
            //
            // ~percExcite is raised by a hit and decays back, so one strike
            // makes the next few more likely and a silence deepens itself. The
            // layer plays in gestures with real gaps between them instead of at
            // an even density, and the phrase lengths are never the same twice
            // because nothing sets them — they fall out of the process.
            ~percExcite = (~percExcite ? 0) * 0.86;
            // Publish it to the bed. Every live partial reads this bus and
            // answers by its own amount — see \dronePartial — so a cluster of
            // strikes brightens and swells the drone instead of sounding on top
            // of an indifferent one.
            if(~droneStrikeBus.notNil) { ~droneStrikeBus.set(~percExcite) };
            // 1.6 -> 0.9. Self-excitation doubles the density on its own, and
            // the ask was for a different SHAPE, not more notes. Measured over
            // 2000 ticks: 198 hits against the uniform version's 212, with
            // twice the clusters (40 runs of two or more against 21) and longer
            // silences (147 ticks against 114). Same amount of material,
            // arranged in gestures instead of sprinkled evenly.
            percProb = (((0.9 / percDivisor) * tideDensity)
                * (1 + (~percExcite * 1.9))
                // Deepens the troughs: the floor is what makes a gap a gap.
                * tideDensity.linlin(0, 1, 0.35, 1.0)
                // …and the bed pushes back. A full ensemble thins the
                // percussion; a sparse one invites it. The two layers TRADE
                // rather than accumulate, which is most of what makes a pair of
                // parts sound like they are listening to each other — and it
                // costs nothing, because the density is already being tracked.
                * ((~droneVoices ? []).size / (~droneMaxVoices ? 7))
                    .clip(0, 1).linlin(0, 1, 1.30, 0.70)
            ).clip(0.0, 0.92);
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
                // About one hit in three lands on a tone the bed is actually
                // HOLDING — not merely a note from the same scale, but the
                // exact frequency of a partial currently sounding, folded up
                // into the struck register. This is the strongest form of the
                // coupling and the one that should be audible immediately: the
                // strike excites something already there, so the resonance and
                // the bed ring as one body instead of two.
                //
                // The other two hits in three come from the pool, which is now
                // built on the same fundamental anyway — so the layer keeps its
                // own melodic motion rather than becoming a bed follower.
                var bedHz = if(0.34.coin) { (~droneVoiceHz ? ()).values.choose } { nil };
                var baseFreq = (if(bedHz.notNil) {
                        // Folded into the pool's OWN register. This used to
                        // fold to 70 Hz and stop, which was written when the
                        // perc lived an octave above the root; after the drop
                        // it put every bed-struck hit above the entire pool, so
                        // a third of the layer sat in a different band from the
                        // rest — two registers alternating rather than one
                        // instrument, and neither of them the one asked for.
                        var f = bedHz;
                        while({ f < 26 }, { f = f * 2 });
                        while({ f > 105 }, { f = f * 0.5 });
                        f
                    } {
                        pitchPool.wrapAt(poolIdx)
                    } * ~speciesBand[speciesIdx]).clip(22, 900);
                // Which BODY is struck, as opposed to which note. The seat
                // decides it — so the five species are five instruments and not
                // one instrument at five registers — and the counterparty's
                // address signature nudges it, so the same seat answering a
                // different actor is not quite the same object.
                var bodySeed = ((speciesIdx / 4.0)
                    + (((rs !? { rs[\addrSig] } ? 0) % 97) / 97.0 * 0.35)).wrap(0, 1);
                // The p-locks for THIS strike. Appended after the bus arguments
                // at every spawn site below, so the -1s override the buses —
                // /s_new applies arguments in order, last one wins.
                var lockArgs = ~percLocks.value(rs, transactionInfluence);
                // A hit makes the next few more likely; the decay above lets
                // the excitement fall away again. This is what turns an evenly
                // sprinkled layer into one that plays in gestures.
                ~percExcite = ((~percExcite ? 0) + 0.55).clip(0, 1.6);
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
                if(~lastVoiceAt.notNil) { ~lastVoiceAt[\perc] = now };
                if(~visualsDest.notNil) {
                    // freq normalizada además del ataque: la percusión cambia
                    // de registro con la melodía y el visual debe seguirla.
                    ~visualsDest.sendMsg('/voice/perc',
                        (0.2 + (transactionInfluence * 0.15)).clip(0, 1),
                        (baseFreq / 900).clip(0, 1));
                };

                // One trig can become a burst — see ~percRetrig. Fired before
                // the voicing bundle so the first repeat lands one interval
                // after the main strike, not after the whole chord is placed.
                ~percRetrig.value(rs, baseFreq, bodySeed, lockArgs,
                    ~beatParams.masterAmp * (~beatParams.transportGain ? 1)
                        * (0.2 + (transactionInfluence * 0.15)) * accent * speciesGain,
                    transactionInfluence);

                // ─ Voicing: single note, dyad, or triad based on texture control ─
                // ONE bundle for the whole case: every voice of a dyad or triad
                // must share the same jitter, or the chord arpeggiates itself.
                s.makeBundle(s.latency + jitTick, {
                case
                { voicingMode == \single } {
                    // Single pitched note
                    var percFreq = (baseFreq * rrand(0.95, 1.05)).clip(22, 900);
                    Synth(\opalPerc, [
                        \out,          0,
                        \freq,         percFreq,
                        \bodySeed,     bodySeed,
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
                    ] ++ (~voiceBusArgs.value ? []) ++ lockArgs, targetGrp);
                }
                { voicingMode == \dyad } {
                    // Two-note interval
                    2.do { |voice|
                        var harmFreq = (baseFreq * ([1.0, 1.5][voice]) * rrand(0.98, 1.02)).clip(22, 900);
                        Synth(\opalPerc, [
                            \out,          0,
                            \freq,         harmFreq,
                            \bodySeed,     bodySeed,
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
                        ] ++ (~voiceBusArgs.value ? []) ++ lockArgs, targetGrp);
                    };
                }
                { voicingMode == \triad } {
                    // Full harmonic series (up to harmCount)
                    (harmCount.clip(2, 5)).do { |h|
                        // (h+1) reached 5x on top of a 686 Hz pool note. Clamped
                        // to the same ceiling \opalPerc enforces internally, so the
                        // harmonics thin toward the top instead of climbing away.
                        var harmFreq = (baseFreq * (h + 1)
                            * resBdy.linexp(0.1, 0.8, 0.95, 1.15)).clip(22, 900);
                        Synth(\opalPerc, [
                            \out,          0,
                            \freq,         harmFreq,
                            \bodySeed,     bodySeed,
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
                        ] ++ (~voiceBusArgs.value ? []) ++ lockArgs, targetGrp);
                    };
                };
                });
            };

            // ── 3. DUST — probability-based, not grid-locked ─────────────────────
            if((dustProb * tideDensity).coin) {
                if(~lastVoiceAt.notNil) { ~lastVoiceAt[\dust] = now };
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
                ] ++ (~voiceBusArgs.value ? []), targetGrp) });
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
    if(~droneEnsemble.notNil) { ~droneEnsemble.value };
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