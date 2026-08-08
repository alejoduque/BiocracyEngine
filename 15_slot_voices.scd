// SuperCollider Ethereum Sonification — Slot Voices
//
// The six data-structure slots (4–9) were listeners. Each was bound to one SC
// voice, read that voice's band of the master spectrum and its /voice/* onset,
// and drew what it heard — "they react to the sound, not to the intention".
// This file is what lets them speak: each slot now also PLAYS the voice it
// visualises, from its own structural events. A hash collision sounds a field
// recording; a cache eviction sounds a grain; a tree rotation sounds a
// percussion hit. The screen plays the instrument.
//
//   slot 4  DRONE      \opalDrone      re-pitch (sustained, so not a trigger)
//   slot 5  CAMPANAS   \elektronBell   pads
//   slot 6  PERCUSIÓN  \opalPerc       pulse
//   slot 7  BOMBO      \opalKick       sub
//   slot 8  POLVO      \opalDust       granular
//   slot 9  MUESTRAS   samplePlayer*   field recordings
//
// ─── Why the scheduler lives here and not in the browser ────────────────────
//
// The beat engine ALREADY decides when kick, perc and dust speak, and the ETH
// handler decides when the bell does. A slot deciding the same thing is a
// second owner of one rule, which is the failure this codebase keeps having to
// undo — the seven /rhythm/ toggles that were removed for it, and the tide
// exclusivity that is enforced in exactly one place for the same reason.
//
// So a slot does not trigger. It REQUESTS, on /slot/voice, and this file
// decides. The beat engine remains the floor: it stamps ~lastVoiceAt when it
// fires, this scheduler reads the same table, and a request that lands inside
// a voice's minimum gap is dropped rather than layered. A slot can therefore
// only speak where the engine has left room, which is what keeps the pulse the
// engine's and the punctuation the slot's.
//
// The sample pool needs no cap here: 10_sample_system.scd already owns one
// (~sampleMaxVoices + ~sampleTrimVoices, oldest-first voice stealing).

(
// ─── State ──────────────────────────────────────────────────────────────────

// Shared onset table. Written by BOTH this file and 5_beat_engine.scd, which
// is the whole point — arbitration only works if both owners write the same
// clock. Keys are the /voice/* names the visuals already subscribe to.
~lastVoiceAt = ~lastVoiceAt ?? { () };

// Index → voice, in slot order. Slot 4 is index 0.
~slotVoiceNames = [\drone, \pad, \perc, \kick, \dust, \sample];

// Minimum seconds between onsets of a voice FROM ANY SOURCE. These are the
// arbitration, so they are set by what the voice is for rather than by taste:
// the drone is a sustained bed and a re-pitch is a structural event, the dust
// is granular and wants to be able to swarm, the sample layer is 30-second
// field recordings and two a second would be a collage rather than a chamber.
//
// perc and dust were 0.14 and 0.07, and both were wrong in a way only a live
// listen exposed: the browser's structural counts jitter every frame, so "has
// it risen since last time" was true whenever the gate reopened, and the gate
// stopped being a limit and became the metronome. Every slot fired at exactly
// its minimum gap — slot 6 at eight per second, which is a vibration, and slot
// 7 at a dead-steady ~83 BPM, which is a drum machine. The browser triggers on
// genuine excursions now, and these are back to being limits.
~slotVoiceGap = (
    drone:  6.0,
    pad:    0.90,
    perc:   0.55,
    kick:   0.80,
    dust:   0.40,
    sample: 1.60
);

// Master switch, so the six screens can be put back to listening without
// unmounting them. /slot/voices/enable 0|1, and the browser stops emitting on
// its own side too — belt and braces, because a stale emitter is worse than a
// silent one.
~slotVoicesEnabled = ~slotVoicesEnabled ?? { true };

~slotVoiceStats = ~slotVoiceStats ?? { (fired: 0, dropped: 0, lastAt: 0.0) };

// Safe bus index. Local rather than 5_beat_engine's ~bi, which only exists
// once ~beatEngine has been called — this file must work before that.
~sbi = { |name|
    if(~buses.notNil and: { ~buses[name].notNil }, { ~buses[name].index }, { -1 });
};

// One argument list for every voice. The five SynthDefs declare overlapping
// but not identical bus args, and scsynth ignores control names a SynthDef
// does not have — the same superset idiom ~phenoBusArgs already relies on in
// 14_phenological_corpus.scd, where ~42 names are passed to a def that
// declares nine. Passing the union once beats maintaining five lists that
// drift apart, which is exactly how six drone buses ended up with no readers.
// Synchronous language-side bus READ. ~sbi gives an index for a SynthDef arg;
// this gives the number, which the pitch pool needs at spawn time.
~sbv = { |name, default = 0|
    if(~buses.notNil and: { ~buses[name].notNil },
        { ~buses[name].getSynchronous }, { default });
};

~slotBusArgs = {
    // The union list now lives in 3_synthdefs.scd as ~voiceBusArgs, so the
    // spawn sites cannot drift apart from each other. Kept as a wrapper rather
    // than replaced at every call site, and falling back to the local list if
    // 3_ has not defined it.
    if(~voiceBusArgs.notNil) { ~voiceBusArgs.value } {
    [
        \masterVolBus,  ~sbi.(\masterVolume),
        \pitchBus,      ~sbi.(\pitchShift),
        \timeBus,       ~sbi.(\timeDilation),
        \spectralBus,   ~sbi.(\spectralShift),
        \spatialBus,    ~sbi.(\spatialSpread),
        \textureBus,    ~sbi.(\textureDepth),
        \atmosphereBus, ~sbi.(\atmosphereMix),
        \memoryBus,     ~sbi.(\memoryFeed),
        \harmonicBus,   ~sbi.(\harmonicRich),
        \resonantBus,   ~sbi.(\resonantBody)
    ]; };
};

// ─── The scheduler ──────────────────────────────────────────────────────────

// Returns true when this voice may sound now. Also stamps, so a caller that
// gets true has already taken the slot — there is no window between asking
// and firing for a second request to slip through.
~slotVoiceClaim = { |voice|
    var now = SystemClock.seconds;
    var gap = ~slotVoiceGap[voice] ? 0.5;
    var last = ~lastVoiceAt[voice] ? -1e9;
    if((now - last) >= gap) {
        ~lastVoiceAt[voice] = now;
        true
    } {
        false
    };
};

// ─── Slot 4's own partial ───────────────────────────────────────────────────
// This slot used to call ~opalDroneSynth.set(\freq, ...), and that was a second
// owner of the bed. The beat engine walks the drone's pitch every four bars
// through a composed phrase (55 62 73 82 49 65 55 41); slot 4 indexed the same
// pitches SORTED ASCENDING by its own tone, so a slot write could yank the bed
// an octave mid-phrase and the engine's next write would yank it back. There
// was no arbitration at all: \drone is the one voice the engine never stamps
// into ~lastVoiceAt, so the 6 s gap here arbitrated against nothing.
//
// And \opalDrone lags freq by droneFade * 2 — four seconds at the default. Two
// writers on a four-second glide means the bed spends most of its life in
// transit and never arrives, which is exactly what was reported: a note that
// remains stuck, sometimes increasing or decreasing.
//
// So the bed belongs to the engine, and slot 4 adds a PARTIAL over it: its own
// low \opalDrone voice, released after a few seconds. Additive, one owner each.
~slotDronePartials = ~slotDronePartials ?? { [] };
~slotDroneMax = 2;

~slotDroneAdd = { |a = 0.5, t = 0.5|
    var grp = if(~defaultGroup.notNil, { ~defaultGroup }, { s.defaultGroup });
    // A fifth and an octave above the bed's own register, so the partial reads
    // as an overtone of the drone rather than as a second drone disagreeing
    // with it.
    var f = #[82.5, 110.0, 123.5, 165.0].wrapAt((t * 3).round.asInteger);

    // Retire the oldest rather than accumulate. \opalDrone is Env.asr, so a
    // zero gate releases it properly over the asr's own 6 s tail.
    ~slotDronePartials = ~slotDronePartials.select { |sy| sy.notNil };
    while({ ~slotDronePartials.size >= ~slotDroneMax }, {
        var oldest = ~slotDronePartials.removeAt(0);
        try { oldest.set(\gate, 0) };
    });

    s.makeBundle(s.latency, {
        var syn = Synth(\opalDrone, [
            \freq, f,
            // Quiet: this is a partial over the bed, not a rival to it. The
            // engine's own drone runs amp 0.8.
            \amp,  0.14 + (a * 0.12),
            \masterVolBus,    ~sbi.(\masterVolume),
            \pitchBus,        ~sbi.(\pitchShift),
            \timeBus,         ~sbi.(\timeDilation),
            \spectralBus,     ~sbi.(\spectralShift),
            \spatialBus,      ~sbi.(\spatialSpread),
            \textureBus,      ~sbi.(\textureDepth),
            \atmosphereBus,   ~sbi.(\atmosphereMix),
            \memoryBus,       ~sbi.(\memoryFeed),
            \harmonicBus,     ~sbi.(\harmonicRich),
            \resonantBus,     ~sbi.(\resonantBody),
            \masterAmpBus,    ~sbi.(\masterAmp),
            \filterCutoffBus, ~sbi.(\filterCutoff),
            \droneDepthBus,   ~sbi.(\droneDepth),
            \droneFadeBus,    ~sbi.(\droneFade),
            \droneSpaceBus,   ~sbi.(\droneSpace),
            \droneMixBus,     ~sbi.(\droneMix),
            \delayFeedbackBus, ~sbi.(\delayFeedback),
            \mixDroneBus,     ~sbi.(\mixDrone)
        ], grp);
        ~slotDronePartials = ~slotDronePartials.add(syn);
        // Let go on its own schedule. 9 s of hold, then the asr's 6 s release.
        AppClock.sched(9.0, { try { syn.set(\gate, 0) }; nil });
    });
};

~slotVoicePlay = { |voice, amp = 0.5, tone = 0.5|
    var grp = if(~defaultGroup.notNil, { ~defaultGroup }, { s.defaultGroup });
    var a = amp.clip(0, 1);
    var t = tone.clip(0, 1);
    var busArgs = ~slotBusArgs.value;
    var trims = (~beatParams !? { ~beatParams.masterAmp } ? 0.7)
        * ((~beatParams !? { ~beatParams.transportGain }) ? 1);

    // ── Everything spawns in a bundle ──────────────────────────────────────
    // Every voice the engine fires goes through s.makeBundle(s.latency + …).
    // These did not: they spawned on raw OSC arrival with no latency
    // compensation, so a slot hit landed at whatever moment the packet was
    // dispatched while every engine hit landed on the server's own clock.
    // That is the "jumpy and sketchy" directly, and it is one wrapper.
    var fire = { |func| s.makeBundle(s.latency, func) };

    switch(voice,

        // The persistent-structure slot adds a PARTIAL over the bed; it does
        // not re-pitch the bed. See ~slotDroneAdd below for why.
        \drone, { ~slotDroneAdd.(a, t) },

        \pad, {
            var midi, f, args;
            // The engine's pitch treatment, which this did not have: snap to
            // the semitone grid and then OCTAVE-FOLD below 160 Hz, so the pad
            // lands in the drone's register as a pitch class rather than as a
            // ping on top of it (6_osc_handlers.scd:355-370).
            //
            // Without the fold this was not merely out of tune, it was ONE
            // NOTE: \elektronBell clamps its fundamental to 28-180 Hz
            // (3_synthdefs.scd:241), and the old linear map to MIDI 48-84
            // crossed 180 Hz at tone 0.153 — so 85% of the range played an
            // identical 180 Hz. That is the "primitive bell that does not
            // blend": it was a fixed tone sitting a whole tone above the
            // engine's own fold ceiling.
            midi = t.linlin(0, 1, 36, 84).round(1);
            f = midi.midicps;
            while({ f > 160 }, { f = f * 0.5 });

            // Five envelope stages, derived, as the engine derives them from
            // the transaction. This passed three literals and omitted sus and
            // susLvl entirely, so every slot pad had a byte-identical shape.
            args = [
                \freq,   f,
                \amp,    0.10 + (a * 0.16),
                \atk,    a.linlin(0, 1, 0.35, 2.2),
                \dec,    a.linlin(0, 1, 1.3, 0.35),
                \sus,    a.linlin(0, 1, 0.4, 1.6),
                \susLvl, 0.55 + (t * 0.2),
                \rel,    a.linlin(0, 1, 0.7, 2.8),
                // Deterministic from the structure's own reading rather than
                // re-randomised per event: the same state returns to the same
                // place in the image instead of flickering across it.
                \pan,    t.linlin(0, 1, -0.8, 0.8)
            ];
            // The bus sweep the engine uses for its own bells, verbatim. The
            // ten short-named buses this file wires for the struck voices are
            // NOT what \elektronBell declares; it takes the long names, and
            // going through the queue below means slot pads and engine pads
            // are wired identically rather than nearly.
            if(~buses.notNil) {
                ~buses.keysValuesDo { |paramName, bus|
                    args = args ++ [(paramName.asString ++ "Bus").asSymbol, bus.index];
                };
            };

            // Into the engine's OWN queue, not Synth directly. The drain
            // (6_osc_handlers.scd:107-155) supplies \polyComp — the 1/sqrt(n)
            // law — and registers the voice in ~padLive. Spawning directly
            // meant a slot pad was up to 4.9x louder than a concurrent engine
            // pad, and worse: invisible to ~padLive, so the engine
            // under-counted and under-compensated its own pads too. It also
            // gets the block-subdivision scheduling for free.
            if(~padQueue.notNil and: { ~padQueue.size < (~padQueueMax ? 24) }) {
                ~padQueue.add(args);
            } {
                fire.({ Synth(\elektronBell, args, grp) });
            };
        },

        \perc, {
            // The engine's material, not a parallel invention. ~computePitchPool
            // builds a seven-degree mode from live harmonicRich / txInfluence /
            // density (5_beat_engine.scd:89-101) and ~speciesBand transposes it
            // into one of the five seats' registers. The old
            // t.linexp(0, 1, 60, 780) was a continuous sweep that touched those
            // notes only by coincidence — the engine's perc is a mode, this was
            // a slider, and that is most of why they did not sit together.
            var pool = ~computePitchPool.value(
                ~sbv.(\harmonicRich, 1.0),
                ~sbv.(\transactionInfluence, 0.3),
                ((~beatParams !? { ~beatParams.transactionDensity }) ? 0.5),
                // Same fundamental as the bed and as the engine's own perc.
                (~droneRoot ? 55));
            var band = (~speciesBand ? #[1.0]).wrapAt((t * 4).round.asInteger);
            var f = (pool.wrapAt((t * (pool.size - 1)).round.asInteger) * band
                * rrand(0.95, 1.05)).clip(40, 900);
            fire.({
                Synth(\opalPerc, [
                    \out,  0,
                    \freq, f,
                    // Slot 6's own body: derived from the same tone the
                    // structure reported, so a rebalance high in the tree
                    // strikes a different object than one near the leaves.
                    \bodySeed, t,
                    \amp,  trims * (0.16 + (a * 0.18)),
                    \mixPercBus, ~sbi.(\mixPerc)
                ] ++ busArgs, grp);
            });
        },

        \kick, {
            // The engine walks seven discrete steps, 45.5-54.5 Hz in 1.5 Hz
            // increments (5_beat_engine.scd:500, ((bar % 7) - 3) * 1.5 + 50).
            // The old linlin(0, 1, 38, 68) reached 13.5 Hz above the engine's
            // top — a different drum — and at the bottom drove \opalKick's
            // pitch envelope down to an inaudible thump.
            var f = #[45.5, 47.0, 48.5, 50.0, 51.5, 53.0, 54.5]
                .wrapAt((t * 6).round.asInteger);
            fire.({
                Synth(\opalKick, [
                    \out,  0,
                    \freq, f,
                    \amp,  trims * (0.5 + (a * 0.2)),
                    // dec is multiplied by timeDilation inside the envelope, so
                    // the engine's 0.9-1.3 rings 1.8-2.6 s. The old 0.28-0.53
                    // was a click where the engine has a swell.
                    \dec,  0.9 + (a * 0.4),
                    \mixKickBus, ~sbi.(\mixKick)
                ] ++ busArgs, grp);
            });
        },

        \dust, {
            // \opalDust has no freq at all — its density comes from textureBus.
            // Only the level and the bundle differed; matched to the engine's
            // 0.3 + density*0.35, which this was running ~39% under.
            fire.({
                Synth(\opalDust, [
                    \out, 0,
                    \amp, trims * (0.3 + (a * 0.35)),
                    \mixDustBus, ~sbi.(\mixDust)
                ] ++ busArgs, grp);
            });
        },

        // Straight through the system that already owns the pool, rather than
        // spawning samplePlayer directly: ~triggerSample carries the buffer
        // lookup, the per-sample overrides and the voice stealing.
        \sample, {
            if(~triggerSample.notNil) {
                var idx = (t * ((~sampleNames ? []).size - 1).max(0)).round.asInteger;
                ~triggerSample.(idx.max(0), nil, (sampleAmp: (0.25 + (a * 0.5)).clip(0, 1)));
                if(~sampleTrimVoices.notNil) { ~sampleTrimVoices.value };
            };
        }
    );

    // Tell the visuals the note happened, on the same address SC already
    // broadcasts for engine-fired notes. Without this the slot that just
    // played would be the one slot that cannot see its own onset — it reads
    // /voice/* like every other, and the source should make no difference.
    //
    // Not for \pad: the pad drain emits its own /voice/pad when the queued
    // voice actually spawns, and announcing it here as well would report one
    // onset twice.
    if(~visualsDest.notNil and: { voice != \pad }) {
        ~visualsDest.sendMsg(("/voice/" ++ voice.asString).asSymbol, a, t);
    };
};

// ─── OSC ────────────────────────────────────────────────────────────────────
// /slot/voice [voiceIdx, amp, tone]
//   voiceIdx  0-5  → drone pad perc kick dust sample (slots 4-9)
//   amp       0-1  how hard the structure's event was
//   tone      0-1  where in that voice's own range it lands
s.doWhenBooted({
    OSCdef(\slotVoice).free;
    OSCdef(\slotVoice, { |msg|
        var idx = (msg[1] ? 0).asInteger;
        var voice;
        if((~slotVoicesEnabled == true) and: { idx >= 0 } and: { idx < 6 }) {
            voice = ~slotVoiceNames[idx];
            // The claim IS the arbitration. Requests that land inside the gap
            // are counted rather than queued: a dropped onset is information
            // (the engine was already speaking there), while a queued one
            // would arrive late and read as a flam.
            if(~slotVoiceClaim.(voice)) {
                ~slotVoicePlay.(voice, (msg[2] ? 0.5).asFloat, (msg[3] ? 0.5).asFloat);
                ~slotVoiceStats[\fired] = (~slotVoiceStats[\fired] ? 0) + 1;
                ~slotVoiceStats[\lastAt] = SystemClock.seconds;
            } {
                ~slotVoiceStats[\dropped] = (~slotVoiceStats[\dropped] ? 0) + 1;
            };
        };
        ~lastBrowserOscTime = Main.elapsedTime;
    }, '/slot/voice');

    OSCdef(\slotVoicesEnable).free;
    OSCdef(\slotVoicesEnable, { |msg|
        ~slotVoicesEnabled = (msg[1] ? 1).asFloat > 0.5;
        ("[slot] voices " ++ if(~slotVoicesEnabled, "ENABLED", "MUTED")).postln;
        ~lastBrowserOscTime = Main.elapsedTime;
    }, '/slot/voices/enable');
});

"═══ 15 · Slot voices loaded — the six screens can speak ═══".postln;
)
