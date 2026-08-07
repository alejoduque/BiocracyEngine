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
~slotVoiceGap = (
    drone:  6.0,
    pad:    0.90,
    perc:   0.14,
    kick:   0.80,
    dust:   0.07,
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
~slotBusArgs = {
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
    ];
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

~slotVoicePlay = { |voice, amp = 0.5, tone = 0.5|
    var grp = if(~defaultGroup.notNil, { ~defaultGroup }, { s.defaultGroup });
    var a = amp.clip(0, 1);
    var t = tone.clip(0, 1);
    var busArgs = ~slotBusArgs.value;
    var trims = (~beatParams !? { ~beatParams.masterAmp } ? 0.7)
        * ((~beatParams !? { ~beatParams.transportGain }) ? 1);

    switch(voice,

        // Sustained, so there is nothing to trigger — the structural event
        // moves it instead. It glides now (Lag on freq in \opalDrone), so a
        // slot re-pitching the bed is a slow transposition rather than a step.
        \drone, {
            if(~opalDroneSynth.notNil) {
                ~opalDroneSynth.set(\freq, #[41, 49, 55, 62, 65, 73, 82].at(
                    (t * 6).round.asInteger.clip(0, 6)));
            };
        },

        \pad, {
            Synth(\elektronBell, [
                \freq, (t.linlin(0, 1, 48, 84)).midicps,
                \amp,  0.10 + (a * 0.16),
                \atk,  0.8, \dec, 0.6, \rel, 2.5,
                \pan,  1.0.rand2 * 0.6,
                \mixPadBus, ~sbi.(\mixPad)
            ] ++ busArgs, grp);
        },

        \perc, {
            Synth(\opalPerc, [
                \out,  0,
                \freq, t.linexp(0, 1, 60, 780),
                \amp,  trims * (0.16 + (a * 0.18)),
                \mixPercBus, ~sbi.(\mixPerc)
            ] ++ busArgs, grp);
        },

        \kick, {
            Synth(\opalKick, [
                \out,  0,
                \freq, t.linlin(0, 1, 38, 68),
                \amp,  trims * (0.28 + (a * 0.30)),
                \atk,  0.001, \dec, 0.28 + (a * 0.25),
                \mixKickBus, ~sbi.(\mixKick)
            ] ++ busArgs, grp);
        },

        \dust, {
            Synth(\opalDust, [
                \out, 0,
                \amp, trims * (0.16 + (a * 0.26)),
                \mixDustBus, ~sbi.(\mixDust)
            ] ++ busArgs, grp);
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
    if(~visualsDest.notNil) {
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
        ~lastBrowserOscTime = SystemClock.seconds;
    }, '/slot/voice');

    OSCdef(\slotVoicesEnable).free;
    OSCdef(\slotVoicesEnable, { |msg|
        ~slotVoicesEnabled = (msg[1] ? 1).asFloat > 0.5;
        ("[slot] voices " ++ if(~slotVoicesEnabled, "ENABLED", "MUTED")).postln;
        ~lastBrowserOscTime = SystemClock.seconds;
    }, '/slot/voices/enable');
});

"═══ 15 · Slot voices loaded — the six screens can speak ═══".postln;
)
