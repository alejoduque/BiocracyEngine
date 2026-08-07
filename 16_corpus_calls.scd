// SuperCollider Ethereum Sonification — Corpus Calls
//
// Slot A (Antifonía) fires discrete calls at /sample/trigger, and until now
// every one of them landed on one of seven MP3s in samples/. Twelve species
// shared those seven files — four of them share the *aves* bed alone — and
// LLUVIA and VIENTO carried smp:-1, meaning geofonía was drawn on screen and
// never sounded at all.
//
// Meanwhile the corpus built from 12Gig_La_Luna_SN26 holds 261 clips of the
// actual forest, and slot A could not reach any of it. The ring in
// 14_phenological_corpus.scd plays that material on the 365-day calendar,
// which is a calendar and not a call: it decides what a DAY sounds like, not
// what a howler answering right now sounds like.
//
// This file lets a call reach the recordings. The 2-second grains are exactly
// the right shape for it — build_corpus.py already cuts them from the highest
// confidence events of each ring day — and the geophony stems finally give
// rain and wind a recording.
//
// ─── What picks the clip, and why it is here rather than in the browser ─────
//
// Antifonía's twelve sources are SPECIES. The corpus carries ecological ROLES
// and no taxonomy at all — the detector yields nocturnal_voice, insect_chorus,
// chorus_participant, community_shift, which is exactly why Article 43's
// bancadas are labelled by role. So the mapping is necessarily a class
// mapping, and it lives here because this is where the manifest already is:
// 14_ parses it into ~corpusClips, and shipping 264 KB of manifest to the
// browser to duplicate the role table a fourth time would be worse.
//
// A call therefore says WHO is speaking and WHEN; SuperCollider decides which
// recording answers.

(
~corpusCallReady = false;
// corpus: answered from a recording · fallback: the MP3 stood in · silent: no
// answer at all, which today means geofonía before a bed has finished loading.
// No `withheld` counter: a dead field that never moves is the thing this
// codebase keeps having to delete.
~corpusCallStats = ~corpusCallStats ?? { (corpus: 0, fallback: 0, silent: 0) };

// How many geophony beds to hold resident. Each is a 60 s mono 48 kHz buffer,
// ~11.5 MB — the grains are 384 KB apiece, so the beds cost more than all 116
// of them together and there is no reason to hold ninety-three.
~corpusGeoBeds = 6;

// Antifonía's source order, from Antifonia.SOURCES. Kept as a list rather than
// read from the browser because the call carries an index, and an index needs
// something to mean.
~antifoniaSources = [
    \aullador, \oropendola, \aves, \chicharra, \rana, \murcielago,
    \paujil, \arriera, \lluvia, \viento, \avion, \cinta
];

// Species → the ecological role(s) the corpus can honestly answer with.
//
// AVIÓN and CINTA are deliberately absent: the corpus has no anthropophony to
// offer (its domains are biophony and transition), so those two keep their
// MP3s. Naming them here with an empty list would suggest the corpus had
// something to say about aircraft and simply failed to find it.
~antifoniaRoles = (
    aullador:   (roles: [\nocturnal_voice]),
    oropendola: (roles: [\dusk_chorus_participant, \dawn_chorus_participant]),
    aves:       (roles: [\dawn_chorus_participant, \dusk_chorus_participant]),
    chicharra:  (roles: [\insect_chorus]),
    rana:       (roles: [\nocturnal_voice]),
    // The bat is a nocturnal voice like the others, but weighted toward the
    // clips that actually carry ultrasound — otherwise it answers with a frog.
    murcielago: (roles: [\nocturnal_voice], prefer: \ultrasonic),
    paujil:     (roles: [\dusk_chorus_participant, \dawn_chorus_participant, \community_shift]),
    arriera:    (roles: [\insect_chorus]),
    lluvia:     (roles: [\geophony]),
    viento:     (roles: [\geophony])
);

// ─── Building the bank ──────────────────────────────────────────────────────
// Appended to ~sampleBuffers / ~sampleNames so the existing index-addressed
// ~triggerSample reaches them with no change at all, plus ~sampleMeta running
// alongside at the same indices. The seven MP3s keep meta nil, which is what
// tells ~triggerSample not to apply an opacity it does not have: the artist's
// own material is not withheld from itself.
~buildCorpusCallBank = {
    var clips, geoCandidates, pending = 0, done = 0;

    // Re-entrancy guard. The builder appends to ~sampleBuffers, so running it
    // twice would double the bank and leave ~sampleMeta describing the wrong
    // indices — which is exactly what a manual re-load of this file would do.
    if(~corpusCallReady == true) {
        "[calls] bank already built — not appending twice".postln;
    } {
    if(~corpusClips.isNil or: { ~corpusClips.size == 0 }) {
        "[calls] no corpus — slot A keeps the seven recordings".postln;
    } {
        if(~sampleBuffers.isNil or: { ~triggerSample.isNil }) {
            "[calls] sample system not ready — retrying in 3 s".postln;
            AppClock.sched(3.0, { ~buildCorpusCallBank.value; nil });
        } {
            // Meta runs the full length of the bank from the start, so an
            // index into the seven MP3s reads nil rather than running off the
            // end of a shorter array.
            ~sampleMeta = Array.newClear(~sampleBuffers.size);

            clips = ~corpusClips.select { |c| c[\grain].notNil };
            // Highest-confidence clips that actually have a geophony stem on
            // disk. 14_ does not parse the stems tier, so the path is rebuilt
            // from the key and checked rather than assumed.
            geoCandidates = ~corpusClips
                .select { |c|
                    File.exists(~corpusDir +/+ "stems/geophony" +/+ (c[\key].asString ++ ".flac"))
                }
                .sort { |a, b| (a[\confidence] ? 0) > (b[\confidence] ? 0) }
                .keep(~corpusGeoBeds);

            pending = clips.size + geoCandidates.size;
            ("[calls] loading % grains + % geophony beds".format(
                clips.size, geoCandidates.size)).postln;

            ~corpusBankAdd = { |path, name, clip, role|
                var buf = Buffer.read(s, path, action: {
                    done = done + 1;
                    if(done >= pending) {
                        ~corpusCallReady = true;
                        ("[calls] bank ready — % entries, % of them corpus".format(
                            ~sampleBuffers.size, pending)).postln;
                    };
                });
                ~sampleBuffers = ~sampleBuffers.add(buf);
                ~sampleNames   = ~sampleNames.add(name);
                ~sampleMeta    = ~sampleMeta.add((
                    key:        clip[\key],
                    role:       role,
                    hour:       (clip[\hour] ? 12).asInteger,
                    doy:        (clip[\doy] ? 1).asInteger,
                    opacity:    (clip[\opacity] ? 0.0).asFloat,
                    opaque:     (clip[\opaque] == true),
                    confidence: (clip[\confidence] ? 0.5).asFloat,
                    ultrasonic: (clip[\ultrasonic] ? 0.0).asFloat
                ));
            };

            clips.do { |c|
                ~corpusBankAdd.(c[\grain], "g:" ++ c[\key].asString, c, c[\role].asSymbol);
            };
            geoCandidates.do { |c|
                ~corpusBankAdd.(
                    ~corpusDir +/+ "stems/geophony" +/+ (c[\key].asString ++ ".flac"),
                    "geo:" ++ c[\key].asString, c, \geophony);
            };
        };
    };
    };
};

// ─── Selection ──────────────────────────────────────────────────────────────
// Returns a bank index, or nil to mean "the corpus has nothing to answer with
// here" — which the caller reads as: use the MP3.
~pickCorpusCall = { |srcIdx, hour = 12|
    var spec, roles, pool, floorVal, weights, prefer;

    if(~corpusCallReady.not or: { ~sampleMeta.isNil }) { nil } {
        spec = ~antifoniaRoles[~antifoniaSources[srcIdx.asInteger.clip(0, 11)]];
        if(spec.isNil) { nil } {
            roles  = spec[\roles];
            prefer = spec[\prefer];
            // Article 47, the same test the ring applies before it admits a
            // clip: raising the floor withdraws material from the Chamber
            // rather than merely quietening it. The DSP veil in samplePlayer*
            // is the backstop; this is the eligibility filter, and a withheld
            // clip should not be chosen in the first place.
            floorVal = if(~buses.notNil and: { ~buses[\opacityFloor].notNil },
                { ~buses[\opacityFloor].getSynchronous }, { 0.0 });

            pool = [];
            ~sampleMeta.do { |m, i|
                if(m.notNil
                    and: { roles.includesEqual(m[\role]) }
                    and: { m[\opacity] < (1.0 - floorVal) }) {
                    pool = pool.add(i);
                };
            };

            if(pool.size == 0) { nil } {
                weights = pool.collect { |i|
                    var m = ~sampleMeta[i];
                    // Ring distance on a 24-hour clock, through a Gaussian of
                    // sigma 3 h — about the width of a dawn chorus.
                    //
                    // A LINEAR falloff was tried first and does not work here:
                    // it spans only 5x from same-hour to opposite-hour, and the
                    // corpus is so heavily nocturnal (41 of the nocturnal_voice
                    // grains cluster around 00-05h) that the mass of far clips
                    // simply outvoted the near ones — measured, a call at 20h
                    // still drew a median grain from 03h. The Gaussian gives
                    // ~8x at one hour against seven, which is the difference
                    // between a preference and a rounding error.
                    var dh = (m[\hour] - hour).abs;
                    var ring = dh.min(24 - dh);
                    var near = exp(ring.squared.neg / 18.0);
                    // The 0.05 floor is deliberate: an hour with no recording
                    // near it should still be answerable, just rarely. Zero
                    // here would mean a call at noon in a nocturnal corpus had
                    // nothing at all to say.
                    var w = (0.15 + (m[\confidence] * 0.85)) * (0.05 + (near * 0.95));
                    if(prefer == \ultrasonic) { w = w * (0.15 + (m[\ultrasonic] * 2.2)) };
                    w.max(1e-6);
                };
                pool[weights.normalizeSum.windex];
            };
        };
    };
};

// ─── OSC ────────────────────────────────────────────────────────────────────
// /antifonia/call [srcIdx, fallbackSmp, amp, rate, hpf, lpf, pan, dur, hour]
//
// Its own verb rather than an eighth argument on /sample/trigger: that address
// is shared with the SC GUI's seven buttons and with slot 9, and overloading
// it would give one verb two meanings depending on who sent it.
s.doWhenBooted({
    OSCdef(\antifoniaCall).free;
    OSCdef(\antifoniaCall, { |msg|
        var srcIdx   = (msg[1] ? 0).asInteger;
        var fallback = (msg[2] ? -1).asInteger;
        var hour     = (msg[9] ? 12).asFloat;
        var idx      = ~pickCorpusCall.(srcIdx, hour);
        var ov = ();

        if(idx.isNil) {
            // No corpus answer. The MP3 stands in, unless this is geofonía,
            // which has no MP3 at all — that is the case the browser used to
            // handle by never sending, and it now sends so that a geophony bed
            // can answer when one is loaded.
            idx = fallback;
            ~corpusCallStats[\fallback] = (~corpusCallStats[\fallback] ? 0) + 1;
        } {
            ~corpusCallStats[\corpus] = (~corpusCallStats[\corpus] ? 0) + 1;
        };

        if(idx < 0) {
            ~corpusCallStats[\silent] = (~corpusCallStats[\silent] ? 0) + 1;
        } {
            if(~triggerSample.notNil) {
                if(msg[3].notNil) { ov[\sampleAmp]  = msg[3].asFloat.clip(0, 1) };
                if(msg[4].notNil) { ov[\sampleRate] = msg[4].asFloat.clip(0.1, 4.0) };
                if(msg[5].notNil) { ov[\highPass]   = msg[5].asFloat.clip(20, 2000) };
                if(msg[6].notNil) { ov[\lowPass]    = msg[6].asFloat.clip(200, 8000) };
                if(msg[7].notNil) {
                    ov[\samplePan]      = msg[7].asFloat.clip(-1, 1);
                    ov[\sampleSpatialX] = msg[7].asFloat.clip(-1, 1);
                };
                ~triggerSample.(idx,
                    if(msg[8].notNil, { msg[8].asFloat.clip(0.05, 30) }, nil), ov);
                if(~sampleTrimVoices.notNil) { ~sampleTrimVoices.value };
            };
        };
        ~lastBrowserOscTime = SystemClock.seconds;
    }, '/antifonia/call');

    // Built late: it needs 10_'s buffers and ~triggerSample, and 14_'s parsed
    // manifest. Both are themselves deferred behind doWhenBooted, so this
    // waits rather than racing them, and retries if the sample system is slow.
    AppClock.sched(7.0, { ~buildCorpusCallBank.value; nil });
});

"═══ 16 · Corpus calls loaded — slot A can answer with the forest ═══".postln;
)
