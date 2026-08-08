// ═══════════════════════════════════════════════════════════════════════════
// 14 · CÁMARA FENOLÓGICA DE LO VIVO — the corpus layer
// ═══════════════════════════════════════════════════════════════════════════
//
// The fourth actor. SuperCollider synthesis, sonETH and parliament.html have
// been talking to each other; this is the forest they were talking about.
//
// 261 AudioMoth clips from La Luna / Planeta Rica, recorded at 384 kHz, are
// placed on the 365-day ring of Article 42 and played as the ring turns. Only
// 34 of those days carry a recording. The other 331 are silence, and under
// Article 44 that silence is the piece's dominant material — "una frase del
// territorio", not a gap to be filled. Nothing here interpolates between the
// two recorded arcs.
//
// WHAT DRIVES WHAT
//   phenoRate         how fast the ring turns (days per second)
//   corpusLevel       this layer against the synthesis
//   activityThreshold Art. 45 — a day sounds only above its threshold
//   windowWidth       Art. 43 — how far a recorded day reaches into the ring
//   seasonalBias      pulls selection toward Seca (-1) or lluvias (+1)
//   absenceWeight     Art. 44 — 0 leaves the gaps silent, 1 gives them the
//                     ultrasonic voice: what fills the silence is precisely
//                     what human hearing cannot reach
//   pulseGain         Art. 45 — how hard quórum sensible pushes back into
//                     harmonicRich / textureDepth / /bio/consensus
//   opacityFloor      Art. 47 — raising it withholds more of the corpus from
//                     analysis, tokenisation and projection
//   bancada           Art. 43 — filters by ecological role (0 = todas)
//
// RESOURCES
// A 60 s clip at 384 kHz is 92 MB as a server Buffer, so the raw corpus can
// never be resident: 261 of them would be 24 GB. Nothing here reads the
// originals at run time. Two derived tiers, both built by
// tools/build_corpus.py, carry the layer instead.
//   · corpus/audible/ (48 kHz) is read into a fixed pool of 16 RAM slots,
//     ~11.5 MB each, recycled by the ring's look-ahead. Nothing is ever
//     allocated at trigger time.
//   · corpus/expanded/ (48 kHz, x8 time-expanded) is streamed with DiskIn for
//     the absence voice — 4 cue buffers, ~2 MB total.
// Total resident cost ~230 MB. memSize does not bound buffer memory, so
// 1_server_config.scd needs no change.

(
var manifestPath, manifestFile, raw;

~corpusDir = (~biocracyScriptDir ? thisProcess.nowExecutingPath.dirname) +/+ "corpus";
manifestPath = ~corpusDir +/+ "manifest.json";

// ─── Manifest ───────────────────────────────────────────────────────────────
if(File.exists(manifestPath).not) {
    ("[pheno] no manifest at " ++ manifestPath).warn;
    "[pheno] run:  python3 tools/build_corpus.py".postln;
    ~corpusReady = false;
} {
    manifestFile = File(manifestPath, "r");
    raw = manifestFile.readAllString;
    manifestFile.close;
    ~corpusManifest = raw.parseJSON;
    ~corpusReady = ~corpusManifest.notNil and: { ~corpusManifest["clips"].notNil };
};

if(~corpusReady == true) {
    var clips, ring, gapDepth;

    clips = ~corpusManifest["clips"];
    ring = ~corpusManifest["ring"];

    // parseJSON hands back everything as strings. Coerce once, here, rather
    // than at every read inside the routine.
    ~corpusClips = clips.collect { |c|
        (
            key:        c["key"],
            doy:        c["doy"].asInteger,
            date:       c["date"],
            temporada:  c["temporada"],
            habitat:    c["habitat"],
            role:       c["role"],
            bancada:    c["bancada"].asInteger,
            hour:       c["hour"].asInteger,
            confidence: c["confidence"].asFloat,
            centroid:   c["centroid"].asFloat,
            onset:      c["onset_s"].asFloat,
            duration:   c["duration_s"].asFloat,
            ultrasonic: c["ultrasonic_share"].asFloat,
            opacity:    c["opacity"].asFloat,
            opaque:     (c["opaque"].asString == "true"),
            activity:   c["cv_activity"].asFloat,
            richness:   c["cv_richness"].asFloat,
            // Absolute paths, resolved once. nil when that tier was not built.
            audible:    if(c["audible"].notNil,  { ~corpusDir +/+ c["audible"] }),
            grain:      if(c["grain"].notNil,    { ~corpusDir +/+ c["grain"] }),
            // The absence voice. Only the 69 ultrasonic-rich clips have one.
            expanded:   if(c["expanded"].notNil, { ~corpusDir +/+ c["expanded"] }),
            source:     c["source"]
        )
    };

    // 365 slots. Most are empty, and that is the point.
    ~phenoRing = Array.fill(366, { [] });
    ~corpusClips.do { |c| ~phenoRing[c[\doy]] = ~phenoRing[c[\doy]].add(c) };

    // Distance from each ring position to the nearest recorded day, measured
    // around the ring. Precomputed by build_corpus.py; this is what gives
    // absence its shape and what absenceWeight scales.
    gapDepth = ring["gap_depth"];
    ~phenoGapDepth = Array.fill(366, { |i|
        if(i == 0) { 0 } { (gapDepth[i - 1] ? 0).asInteger }
    });
    ~phenoRecordedDays = (ring["recorded_days"] ? []).collect(_.asInteger);

    ("[pheno] manifest: % clips over % recorded days of 365"
        .format(~corpusClips.size, ~phenoRecordedDays.size)).postln;
} {
    ~corpusClips = [];
    ~phenoRing = Array.fill(366, { [] });
    ~phenoGapDepth = Array.fill(366, { 365 });
    ~phenoRecordedDays = [];
};

// ─── SynthDefs ──────────────────────────────────────────────────────────────
s.waitForBoot {

    // The audible voice. Reads corpus/audible/*.flac out of a resident buffer.
    //
    // Every parameter follows the house idiom — Select.kr(bus >= 0, [literal,
    // In.kr(bus)]) — and every bus arg is named <busname>Bus so the auto-wiring
    // at 6_osc_handlers.scd:474 connects it without being told.
    SynthDef(\corpusVoice, {
        // out: routed to the chain-processing bus when 17_ is running, and
        // straight to the main output when it is not. Hard-wired to 0 before,
        // like \elektronBell was, which is why nothing could be placed across
        // this layer as a group.
        arg out = 0, buf = 0, amp = 0.7, gate = 1,
            atk = 2.0, hold = 55.0, rel = 6.0,
            rate = 1, startPos = 0, pan = 0,
            // literals used when a bus is absent
            spectralShift = 8000, atmosphereMix = 0.4, resonantBody = 0.4,
            corpusLevel = 0.5, opacityFloor = 0.0, spatialSpread = 0.0,
            // opacity of THIS clip (Art. 47): compared against the floor
            opacity = 0.0,
            corpusLevelBus = -1, opacityFloorBus = -1,
            spectralShiftBus = -1, atmosphereMixBus = -1, resonantBodyBus = -1,
            spatialSpreadBus = -1, masterVolumeBus = -1,
            // Matrix mixer: this layer's live level. Auto-wired by
            // ~phenoBusArgs, which passes every entry of ~buses.
            mixCorpusBus = -1;

        var sig, env, wet, quadSig, level, floorVal, veil, lpf, res, room, spread, master;

        level    = Select.kr(corpusLevelBus    >= 0, [corpusLevel,   In.kr(corpusLevelBus, 1)]);
        floorVal = Select.kr(opacityFloorBus   >= 0, [opacityFloor,  In.kr(opacityFloorBus, 1)]);
        lpf      = Select.kr(spectralShiftBus  >= 0, [spectralShift, In.kr(spectralShiftBus, 1)]);
        room     = Select.kr(atmosphereMixBus  >= 0, [atmosphereMix, In.kr(atmosphereMixBus, 1)]);
        res      = Select.kr(resonantBodyBus   >= 0, [resonantBody,  In.kr(resonantBodyBus, 1)]);
        spread   = Select.kr(spatialSpreadBus  >= 0, [spatialSpread, In.kr(spatialSpreadBus, 1)]);
        master   = Select.kr(masterVolumeBus   >= 0, [1.0,           In.kr(masterVolumeBus, 1)]);

        // Article 47 as an audible limit rather than a declaration. A clip
        // whose opacity exceeds (1 - floor) is withdrawn — it does not fade
        // out expressively, it simply stops being available to the Chamber.
        // The 0.02 lag is anti-click only.
        veil = Lag.kr((opacity < (1.0 - floorVal)).max(0), 0.02);

        sig = PlayBuf.ar(1, buf, rate * BufRateScale.kr(buf),
            startPos: startPos.clip(0, 0.999) * BufFrames.kr(buf),
            loop: 0, doneAction: 0);

        sig = HPF.ar(sig, 25);
        sig = RLPF.ar(sig, lpf.clip(200, 18000), res.clip(0.1, 0.8));

        // A long, slow envelope. hold clips to 600 s so a whole clip can sit
        // inside one node at any ring rate; the OSC path in 10_sample_system
        // caps duration at 30 s, which is why this layer does not go through it.
        env = EnvGen.kr(
            Env.new([0, 1, 1, 0],
                [atk.clip(0.005, 30.0), hold.clip(0.05, 600), rel.clip(0.02, 30.0)],
                [\sine, 0, -3]),
            gate, doneAction: 2);

        sig = sig * env * amp.clip(0, 1) * level.clip(0, 1) * veil
            * (~trimCorpus ? 0.143)
            * Lag.kr(Select.kr(mixCorpusBus >= 0, [1.0, In.kr(mixCorpusBus, 1)]), 0.08);

        wet = FreeVerb.ar(sig, room.clip(0, 0.9), 0.85, 0.25);
        sig = XFade2.ar(sig, wet, room.linlin(0, 0.9, -1, 0.4));
        sig = sig * master.clip(0, 1);

        quadSig = if((~limiterChans ? s.options.numOutputBusChannels) >= 4) {
            PanAz.ar(4, sig, pan + (spread * 0.5), 1, 2, 0.5)
        } {
            Pan2.ar(sig, (pan + (spread * 0.5)).clip(-1, 1))
        };
        Out.ar(out, quadSig);
    }).add;

    // The absence voice: what sounds on days the forest was not recorded, in
    // proportion to absenceWeight (Art. 44).
    //
    // It streams corpus/expanded/, where the x8 time expansion has already been
    // done offline. Doing it here instead — DiskIn on the raw 384 kHz file,
    // which performs no sample-rate conversion and so expands x8 for free — is
    // a tempting trick and it is wrong: it drops EVERYTHING three octaves, so
    // the loud audible band lands at 125 Hz-2.5 kHz and buries the ultrasound
    // it was supposed to reveal. The renderer high-passes at 38 kHz (24 dB/oct)
    // BEFORE expanding, so only what was genuinely inaudible arrives, at
    // 4.75-24 kHz. 160 s per file, which is also the right length for a gap.
    SynthDef(\corpusUltrasonic, {
        arg out = 0, buf = 0, amp = 0.5, gate = 1,
            atk = 8.0, hold = 240.0, rel = 12.0, pan = 0,
            absenceWeight = 0.3, corpusLevel = 0.5, opacityFloor = 0.0,
            spectralShift = 8000, atmosphereMix = 0.4, opacity = 0.0,
            absenceWeightBus = -1, corpusLevelBus = -1, opacityFloorBus = -1,
            spectralShiftBus = -1, atmosphereMixBus = -1, masterVolumeBus = -1,
            // Matrix mixer. The absence voice gets its own fader rather than
            // sharing mixCorpus: it is the layer most likely to want muting
            // outright, being the one that plays when nothing was recorded.
            mixUltraBus = -1;

        var sig, env, quadSig, weight, level, floorVal, veil, lpf, room, master;

        weight   = Select.kr(absenceWeightBus  >= 0, [absenceWeight, In.kr(absenceWeightBus, 1)]);
        level    = Select.kr(corpusLevelBus    >= 0, [corpusLevel,   In.kr(corpusLevelBus, 1)]);
        floorVal = Select.kr(opacityFloorBus   >= 0, [opacityFloor,  In.kr(opacityFloorBus, 1)]);
        lpf      = Select.kr(spectralShiftBus  >= 0, [spectralShift, In.kr(spectralShiftBus, 1)]);
        room     = Select.kr(atmosphereMixBus  >= 0, [atmosphereMix, In.kr(atmosphereMixBus, 1)]);
        master   = Select.kr(masterVolumeBus   >= 0, [1.0,           In.kr(masterVolumeBus, 1)]);

        veil = Lag.kr((opacity < (1.0 - floorVal)).max(0), 0.02);

        // Natural rate: the expansion is baked into the file, so this is a
        // plain 48 kHz stream.
        sig = DiskIn.ar(1, buf, loop: 1);

        sig = HPF.ar(sig, 80);
        sig = LPF.ar(sig, lpf.clip(200, 18000));

        env = EnvGen.kr(
            Env.new([0, 1, 1, 0],
                [atk.clip(0.005, 60.0), hold.clip(0.05, 600), rel.clip(0.02, 60.0)],
                [\sine, 0, -3]),
            gate, doneAction: 2);

        // Lag on the weight so moving the fader is a tide, not a switch.
        sig = sig * env * amp.clip(0, 1) * Lag.kr(weight.clip(0, 1), 4.0)
            * level.clip(0, 1) * veil * (~trimCorpus ? 0.143)
            * Lag.kr(Select.kr(mixUltraBus >= 0, [1.0, In.kr(mixUltraBus, 1)]), 0.08);

        sig = sig + (FreeVerb.ar(sig, room.clip(0, 0.9), 0.95, 0.4) * room);
        sig = sig * master.clip(0, 1);

        quadSig = if((~limiterChans ? s.options.numOutputBusChannels) >= 4) {
            PanAz.ar(4, sig, pan, 1, 2, 0.5)
        } {
            Pan2.ar(sig, pan.clip(-1, 1))
        };
        Out.ar(out, quadSig);
    }).add;

    s.sync;

    // ─── Gain budget ────────────────────────────────────────────────────────
    // Its own trim rather than ~trimSample, and measured rather than guessed.
    //
    // Mean level of the seven MP3s in samples/ (what ~trimSample = 1.55 was
    // calibrated against):  -28.3 .. -13.2 dB, average -22.2 dB.
    // Mean level of corpus/audible/ after the single global gain: -26.3 ..
    // -16.9 dB, average -21.3 dB. The two bodies of material are within ~1 dB
    // of each other, so parity of trim is parity of loudness.
    //
    // But corpusLevel sits in this layer's signal path and defaults to 0.5,
    // halving it again, and the earlier 1.10 was already ~3 dB under
    // ~trimSample. Net effect was roughly 9 dB too quiet against the rest of
    // the engine. 2.6 puts the layer within ~1 dB of the sample layer when the
    // fader is at its 0.5 default, ~6 dB below the drone bed (the reference
    // continuous voice, effective 0.10), and leaves the top half of the fader
    // as genuine headroom rather than make-up gain.
    ~trimCorpus = 2.60 * (~trimMaster ? 0.055);

    // ─── Voice pools, allocated once ────────────────────────────────────────
    // Allocating buffers at trigger time fragments server memory and drops
    // audio. Everything the layer will ever need is claimed here and recycled.
    ~corpusRamSlots = 16;
    ~corpusDiskSlots = 4;

    ~corpusRam = Array.fill(~corpusRamSlots, { () });   // slot: (buf:, key:, used:)
    ~corpusDisk = Array.fill(~corpusDiskSlots, { () });
    ~corpusVoices = [];
    ~corpusClock = 0;

    // DiskIn needs a cue buffer per stream. 65536 frames is four times the
    // default and keeps the 384 kHz reads comfortably ahead of the server.
    ~corpusDisk.do { |slot|
        slot[\buf] = Buffer.alloc(s, 65536, 1);
        slot[\key] = nil;
        slot[\synth] = nil;
    };

    s.sync;
    ("[pheno] pools ready: % RAM slots, % disk streams, trimCorpus %"
        .format(~corpusRamSlots, ~corpusDiskSlots, ~trimCorpus.round(0.0001))).postln;
};

// ─── Ring clock ─────────────────────────────────────────────────────────────
// Where on the 365-ring we are. Float, so the cursor moves continuously and
// the day is its floor.
// Open on a day that was actually recorded, not on doy 1. Only 34 of 365 days
// carry audio and the first is doy 9, so starting at 1 meant the instrument
// began with eight minutes of nothing and read as broken. Absence is the
// piece's material (Art. 44) but it should be arrived at, not booted into.
~phenoCursor = ~phenoCursor ?? {
    if(~phenoRecordedDays.size > 0) { ~phenoRecordedDays.first.asFloat } { 1.0 };
};
~phenoLastDay = -1;

~phenoSeason = { |doy|
    case
    { (doy >= 335) or: { doy <= 90 } } { "Seca" }
    { doy <= 151 } { "Primeras lluvias" }
    { doy <= 243 } { "Medio seco" }
    { "Segundas lluvias" }
};

// Bus reads, language side. ~busVal comes from 5_beat_engine.scd; this is a
// local fallback so 14_ can be loaded on its own.
~phenoVal = { |name, default = 0|
    if(~buses.notNil and: { ~buses[name].notNil },
        { ~buses[name].getSynchronous }, { default });
};

// ─── Buffer pool management ─────────────────────────────────────────────────
// Least-recently-used. Loading is always asynchronous with an action:, so the
// ring clock is never blocked waiting on disk.
~corpusAcquire = { |clip, onReady|
    var slot, existing, victim;

    existing = ~corpusRam.detect { |sl| sl[\key] == clip[\key] and: { sl[\buf].notNil } };
    if(existing.notNil) {
        existing[\used] = ~corpusClock = ~corpusClock + 1;
        onReady.value(existing[\buf]);
    } {
        slot = ~corpusRam.detect { |sl| sl[\buf].isNil };
        if(slot.isNil) {
            // Evict the coldest slot that no live voice is still reading.
            victim = ~corpusRam.reject { |sl|
                ~corpusVoices.any { |v| v[\slot] === sl }
            }.sort { |a, b| (a[\used] ? 0) < (b[\used] ? 0) }.first;
            if(victim.isNil) { onReady.value(nil); nil } {
                victim[\buf].free;
                victim[\buf] = nil;
                victim[\key] = nil;
                slot = victim;
            };
        };
        if(slot.notNil and: { clip[\audible].notNil }) {
            slot[\key] = clip[\key];
            slot[\used] = ~corpusClock = ~corpusClock + 1;
            slot[\buf] = Buffer.read(s, clip[\audible], action: { |b|
                onReady.value(b);
            });
        };
    };
    slot;
};

// ─── Selection ──────────────────────────────────────────────────────────────
// Everything reachable from this ring position, scored 0-1, before the
// threshold is applied. Eligibility filters (Art. 47 opacity, Art. 43 bancada)
// belong here — a withheld clip is not a seat that failed to light, it is not
// a seat at all — while the threshold is applied by ~phenoSelect on top.
~phenoPool = { |doy|
    var pool, width, bias, bancadaSel, floorVal, reach, sigma;

    width      = ~phenoVal.(\windowWidth, 1.0);
    bias       = ~phenoVal.(\seasonalBias, 0.0);
    bancadaSel = ~phenoVal.(\bancada, 0).round.asInteger;
    floorVal   = ~phenoVal.(\opacityFloor, 0.0);

    // windowWidth is the Gaussian reach of Art. 43: how many ring days either
    // side of a recording it can still be heard from. It never invents audio
    // for an unrecorded day — it only lets a real one be heard from further
    // away. At 0.4 days are isolated points in silence; at 2.5 they bleed
    // across the gaps.
    sigma = (width * 3).max(0.01);
    reach = (width * 6).round.asInteger.max(0);

    pool = [];
    (doy - reach .. doy + reach).do { |d|
        var wrapped = ((d - 1) % 365) + 1;
        var dist = (d - doy).abs;
        var falloff = exp(dist.squared.neg / (2 * sigma.squared));
        ~phenoRing[wrapped].do { |clip|
            // Presence, in the sense of Art. 45. Distance around the ring is
            // the dominant term; the detector's own confidence and the day's
            // activity modulate it. Deliberately NOT cv_activity alone: that
            // column normalises events-per-recording across only 34 days and
            // sits near zero for most of them, which would silence recorded
            // days outright and leave the threshold knob nothing to bite on.
            var presence = falloff
                * (0.45 + (0.35 * clip[\confidence].clip(0, 1))
                        + (0.20 * clip[\activity].clip(0, 1)));
            // Scaled by 0.45 rather than applied whole: at full weight the
            // bias saturated by half travel — everything not of the favoured
            // temporada fell under the threshold at +/-0.5 — leaving the outer
            // half of the knob dead. This spreads the crossover over the whole
            // range instead.
            var tilt = bias * 0.45;
            var seasonal = if(clip[\temporada] == "seca",
                { 1.0 - tilt }, { 1.0 + tilt });
            if((clip[\opacity] < (1.0 - floorVal))
                and: { (bancadaSel == 0) or: { clip[\bancada] == (bancadaSel - 1) } }) {
                pool = pool.add(clip -> (presence * seasonal).clip(0, 1));
            };
        };
    };
    pool.sort { |a, b| a.value > b.value };
};

// Article 45: above the threshold the seat is lit and counts; below it the
// species is present in the territory but silent in the Chamber.
~phenoSelect = { |doy|
    var threshold = ~phenoVal.(\activityThreshold, 0.5);
    ~phenoPool.(doy).select { |assoc| assoc.value >= threshold }.collect(_.key);
};

// Article 45. Quórum sensible: the fraction of the seats this ring position
// convenes that are actually lit. Not a fraction of the whole corpus — "no
// existe una Cámara en pleno permanente; existe la Cámara que cada día la
// temporada convoca." In a gap no seats are convened and the quórum is 0.
~phenoQuorum = { |doy|
    var pool = ~phenoPool.(doy);
    var threshold = ~phenoVal.(\activityThreshold, 0.5);
    if(pool.size == 0) { 0.0 } {
        (pool.count { |assoc| assoc.value >= threshold } / pool.size).clip(0, 1);
    };
};

// ─── Voices ─────────────────────────────────────────────────────────────────
~phenoBusArgs = {
    var args = [];
    if(~buses.notNil) {
        ~buses.keysValuesDo { |name, bus|
            args = args ++ [(name.asString ++ "Bus").asSymbol, bus.index];
        };
    };
    args;
};

~phenoPlayClip = { |clip, holdSecs|
    ~corpusAcquire.(clip, { |buf|
        if(buf.notNil) {
            var slot = ~corpusRam.detect { |sl| sl[\buf] === buf };
            var dur = buf.numFrames / buf.sampleRate.max(1);
            var synth = Synth(\corpusVoice, [
                \buf, buf,
                \amp, 0.55 + (clip[\confidence] * 0.35),
                \atk, (holdSecs * 0.12).clip(0.5, 12),
                \hold, holdSecs.clip(1, 560),
                \rel, (holdSecs * 0.2).clip(1, 20),
                \startPos, 0,
                \pan, 1.0.rand2 * 0.6,
                \opacity, clip[\opacity],
                \out, (~corpusOutBus ? 0)
            ] ++ ~phenoBusArgs.value,
                target: if(~defaultGroup.notNil, { ~defaultGroup }, { s.defaultGroup }));

            // ringDay is which position on the 365-ring admitted this voice —
            // not clip[\doy], which is when the recording was made. The
            // mid-day re-selection below needs to know which voices belong to
            // the day it is re-deciding, so that a clip still decaying from
            // the previous day is left alone rather than retired as though the
            // knob had just excluded it.
            ~corpusVoices = ~corpusVoices.add((
                synth: synth, slot: slot, key: clip[\key],
                ringDay: ~phenoCursor.floor.asInteger
            ));

            // Article 47 again, this time outward: an opaque clip is not
            // announced to the visuals or the laser at all. It is heard and
            // not seen — no label, no token, nothing to project.
            if(clip[\opaque].not and: { ~visualsDest.notNil }) {
                ~visualsDest.sendMsg('/pheno/clip',
                    clip[\key].asString, clip[\role].asString,
                    clip[\temporada].asString, clip[\habitat].asString,
                    clip[\doy], clip[\ultrasonic].asFloat, clip[\confidence].asFloat);
            };
        };
    });
};

~phenoPlayUltrasonic = { |clip, holdSecs|
    var slot = ~corpusDisk.detect { |sl| sl[\synth].isNil };
    if(slot.notNil and: { clip[\expanded].notNil } and: { File.exists(clip[\expanded]) }) {
        slot[\key] = clip[\key];
        slot[\buf].cueSoundFile(clip[\expanded], 0, 1);
        slot[\synth] = Synth(\corpusUltrasonic, [
            \buf, slot[\buf],
            // The renderer already lifted this tier +12 dB to make an
            // inaudible band mixable, so the voice starts lower than the
            // audible one rather than at parity.
            \amp, 0.32,
            \atk, (holdSecs * 0.25).clip(2, 30),
            \hold, holdSecs.clip(1, 560),
            \rel, (holdSecs * 0.3).clip(2, 30),
            \pan, 1.0.rand2 * 0.8,
            \opacity, clip[\opacity],
            \out, (~corpusOutBus ? 0)
        ] ++ ~phenoBusArgs.value,
            target: if(~defaultGroup.notNil, { ~defaultGroup }, { s.defaultGroup }));
        slot[\synth].onFree({ slot[\synth] = nil; slot[\key] = nil });
    };
};

~phenoReleaseVoices = {
    ~corpusVoices = ~corpusVoices.select { |v|
        if(v[\synth].isNil) { false } { true }
    };
};

// Let go of what is sounding, on a stated release rather than the clip's own.
// A corpus voice is built with rel up to 20 s, which is right when a day ends
// of its own accord and wrong when the performer has just asked to be
// somewhere else.
//
// It must be a NEGATIVE gate. Both corpus envelopes are Env.new([0,1,1,0], …)
// — fixed length, no release node — and for those EnvGen treats gate purely as
// a trigger: setting it to 0 does nothing at all and the clip plays out its
// full atk+hold+rel regardless. gate < 0 is the forced release, over
// -1.0 - gate seconds (EnvGen helpfile, "Forced release"). This is also why
// ~phenoPanic below has never actually silenced anything.
~phenoGateOff = { |synth, rel = 1.2|
    try { synth.set(\gate, -1.0 - rel.clip(0.02, 30)) };
};

~phenoFadeVoices = { |rel = 1.2, onlyRingDay = nil|
    ~corpusVoices.do { |v|
        if(onlyRingDay.isNil or: { v[\ringDay] == onlyRingDay }) {
            ~phenoGateOff.(v[\synth], rel);
        };
    };
    ~corpusVoices = ~corpusVoices.select { |v|
        onlyRingDay.notNil and: { v[\ringDay] != onlyRingDay }
    };
};

// ─── Making the Chamber answer while a day is still running ─────────────────
// Every control in the Cámara — the threshold, the window, the seasonal bias,
// the bancada filter, the opacity floor — was consulted in exactly one place:
// ~phenoPool, called once per phenological day. At the default rate that is
// once every sixty seconds, and at the slow end once every eight minutes. So
// the whole row read as dead: you turned a knob, nothing happened, and by the
// time it did happen you had stopped connecting the two. The NEXT REC. DAY
// button had the same fault from the other side — it set the cursor correctly
// and then the routine slept through it (visible in the log as two `skip ->
// doy 211` a few seconds apart and the day itself arriving much later).
//
// The ring still turns at its own rate. What changed is that the wait is now
// sliced, and on each slice the Chamber re-asks who is admitted TODAY.
~phenoTick = 0.25;
~phenoSkipNow = false;

// Bring the sounding voices into line with what the current settings admit for
// this ring day: retire the ones that no longer qualify, start the ones that
// newly do, and leave everything already correct alone. Diffing by clip key
// rather than re-triggering wholesale is what keeps a knob sweep from
// machine-gunning the same clip — nothing restarts unless it genuinely just
// crossed the threshold.
~phenoSyncVoices = { |doy, holdSecs|
    var desired = ~phenoSelect.(doy);
    var wantKeys, changed = false;

    if(desired.size > 2) { desired = desired[..1] };
    wantKeys = desired.collect { |c| c[\key] };

    // includesEqual, not includes: Collection.includes compares with === , so
    // on Strings it is object identity. Two clip keys reading "SN26_0208_0530"
    // are not the same object unless they came from the same ~corpusClips
    // entry — which here they happen to, but relying on that would mean a
    // clip that IS still admitted gets retired and immediately retriggered
    // the moment anything reconstructs a key.
    ~corpusVoices.do { |v|
        if((v[\ringDay] == doy) and: { wantKeys.includesEqual(v[\key]).not }) {
            ~phenoGateOff.(v[\synth], 1.2);
            v[\retired] = true;
            changed = true;
        };
    };
    ~corpusVoices = ~corpusVoices.reject { |v| v[\retired] == true };

    desired.do { |clip|
        if(~corpusVoices.any { |v| v[\key] == clip[\key] }.not) {
            ~phenoPlayClip.(clip, holdSecs);
            changed = true;
        };
    };
    changed;
};

// Article 45's reverse breath, factored out so it can be re-applied when
// pulseGain moves instead of only at a day boundary.
~phenoBreath = { |quorum, pulse|
    if(pulse > 0.01 and: { ~setParam.notNil }) {
        var richSpec = ~controlSpecs[\harmonicRich];
        var texSpec = ~controlSpecs[\textureDepth];
        if(richSpec.notNil) {
            ~setParam.(\harmonicRich,
                richSpec.map((quorum * pulse * 0.5).clip(0, 1)), \pheno);
        };
        if(texSpec.notNil) {
            ~setParam.(\textureDepth,
                texSpec.map((quorum * pulse * 0.6).clip(0, 1)), \pheno);
        };
    };
};

// Wait out the rest of the day in slices, answering the Chamber as we go.
// Returns true if the dwell was cut short by a skip request.
~phenoDwell = { |secs, doy, holdSecs|
    var tick = (~phenoTick ? 0.25).clip(0.05, 1.0);
    var waited = 0.0;
    var sinceSync = 0.0;
    var pulseWas = ~phenoVal.(\pulseGain, 1.0);
    var jumped = false;
    var pulseNow;

    while { (waited < secs) and: { jumped.not } } {
        tick.wait;
        waited = waited + tick;
        sinceSync = sinceSync + tick;

        if(~phenoSkipNow == true) {
            ~phenoSkipNow = false;
            jumped = true;
        } {
            // Re-decide who is in the Chamber. Twice a second is far finer
            // than the ear needs and far coarser than a knob drag, so a sweep
            // produces a handful of decisions rather than hundreds.
            if(sinceSync >= 0.5) {
                sinceSync = 0.0;
                // What is left of the day, floored so a clip admitted near a
                // boundary still gets long enough to be a clip.
                ~phenoSyncVoices.(doy, ((secs - waited) * 0.9).max(3.0));
            };
            // pulseGain scales how hard the forest plays the synthesiser. It
            // was also once-a-day; deadbanded here so holding still does not
            // fight the performer's own harmonicRich knob.
            pulseNow = ~phenoVal.(\pulseGain, 1.0);
            if((pulseNow - pulseWas).abs > 0.02) {
                pulseWas = pulseNow;
                ~phenoBreath.(~phenoQuorum.(doy), pulseNow);
            };
        };
    };
    jumped;
};

~phenoPanic = {
    // Negative gate, per ~phenoGateOff above. With .set(\gate, 0) this
    // function printed its confirmation and left every voice sounding: both
    // corpus envelopes are fixed-length, so a zero gate is not a release.
    // /pheno/stop stopped the ring clock and nothing else.
    ~corpusVoices.do { |v| ~phenoGateOff.(v[\synth], 0.6) };
    ~corpusVoices = [];
    ~corpusDisk.do { |sl|
        if(sl[\synth].notNil) { ~phenoGateOff.(sl[\synth], 0.6); sl[\synth] = nil; sl[\key] = nil };
    };
    "[pheno] all corpus voices released".postln;
};

// ─── The routine ────────────────────────────────────────────────────────────
// Its own Routine, not a branch of ~beatRoutine. The beat engine ticks every
// 0.06-2.0 s, which is the wrong grain entirely for material measured in
// minutes; this one wakes once per ring day and sleeps in between.
~phenoEngine = {
    ~phenoRoutine.stop;
    ~phenoRoutine = Routine({
        var settleWait = 2.0;
        settleWait.wait;

        loop {
            var rate, secsPerDay, doy, gap, admitted, quorum, absence, pulse;

            try {
                rate = ~phenoVal.(\phenoRate, 0.0167).clip(0.002, 4.0);
                secsPerDay = 1.0 / rate;

                ~phenoCursor = ~phenoCursor + 1;
                if(~phenoCursor > 365) { ~phenoCursor = 1 };
                doy = ~phenoCursor.floor.asInteger.clip(1, 365);

                gap = ~phenoGapDepth[doy] ? 365;
                absence = ~phenoVal.(\absenceWeight, 0.3);
                admitted = ~phenoSelect.(doy);

                ~phenoReleaseVoices.value;

                if(admitted.size > 0) {
                    // A recorded day. Up to two clips sound at once — enough
                    // for the dawn chorus to overlap, few enough that no clip
                    // becomes an accompaniment to another.
                    admitted[..1].do { |clip, i|
                        ~phenoPlayClip.(clip, secsPerDay * 0.9);
                    };
                    // Bats are present on recorded days too, whenever the
                    // clip actually carries ultrasound.
                    if((absence > 0.15) and: { admitted.first[\ultrasonic] > 0.35 }) {
                        ~phenoPlayUltrasonic.(admitted.first, secsPerDay * 0.8);
                    };
                } {
                    // Article 44. An unrecorded day. Nothing is interpolated:
                    // at absenceWeight 0 this is silence and stays silence.
                    // Above it, the nearest real recording is heard as
                    // ultrasound only — the forest is there, just not legible
                    // to human hearing. The deeper into the gap, the rarer.
                    if(absence > 0.05) {
                        var chance = absence * (1.0 - (gap / 120).clip(0, 0.85));
                        if(chance.coin and: { ~corpusClips.size > 0 }) {
                            var near = ~corpusClips.select { |c| c[\ultrasonic] > 0.3 };
                            if(near.size > 0) {
                                var pick = near.wchoose(
                                    near.collect { |c| c[\ultrasonic] }.normalizeSum);
                                if(pick[\opacity] < (1.0 - ~phenoVal.(\opacityFloor, 0.0))) {
                                    ~phenoPlayUltrasonic.(pick, secsPerDay * 1.6);
                                };
                            };
                        };
                    };
                };

                // ── Article 45: the reverse breath ──────────────────────────
                // "El bosque toca el sintetizador, y la mano que afina es la
                // temporada." Quórum sensible pushes back into the engine's
                // own harmonic richness and texture depth, scaled by pulseGain,
                // and out to every visual module as /bio/consensus.
                quorum = ~phenoQuorum.(doy);
                pulse = ~phenoVal.(\pulseGain, 1.0);
                ~phenoBreath.(quorum, pulse);

                if(~visualsDest.notNil) {
                    ~visualsDest.sendMsg('/bio/consensus', quorum);
                    ~visualsDest.sendMsg('/pheno/cursor',
                        doy, ~phenoSeason.(doy), admitted.size, gap, quorum);
                };

                if(doy != ~phenoLastDay) {
                    ~phenoLastDay = doy;
                    // The SC GUI's row 7 readout, if 4_gui built it. A gap
                    // reports as AUSENCIA with its depth rather than "0 clips":
                    // 331 of 365 days have no recording, so zero is the normal
                    // reading and naming it that way made the layer look dead.
                    if(~phenoCursorLabel.notNil) {
                        var body = if(admitted.size > 0,
                            { "% CLIP(S)".format(admitted.size) },
                            { "AUSENCIA · %d".format(gap) });
                        { ~phenoCursorLabel.string_("DOY %  ·  %  ·  %  ·  QUÓRUM %"
                            .format(doy, ~phenoSeason.(doy).toUpper, body,
                                quorum.round(0.01))) }.defer;
                    };
                    if(admitted.size > 0) {
                        ("[pheno] doy % · % · % clip(s) · quórum %"
                            .format(doy, ~phenoSeason.(doy), admitted.size,
                                quorum.round(0.01))).postln;
                    };
                };

                // Not a single long sleep any more. ~phenoDwell waits out the
                // day in slices and answers the Cámara's controls while it
                // does, returning early when NEXT REC. DAY has been pressed.
                ~phenoDwell.(secsPerDay.max(0.25), doy, secsPerDay * 0.9);
            } {
                |err|
                ("[pheno] frame error: " ++ err.errorString).postln;
                1.0.wait;
            };
        };
    });
    ~phenoRoutine.play;
    "[pheno] ring clock running".postln;
};

// Boot last, after 3_synthdefs has made the buses and the pools exist.
s.doWhenBooted {
    AppClock.sched(3.0, {
        if(~corpusReady == true and: { ~corpusClips.size > 0 }) {
            if(~buses.notNil and: { ~buses[\phenoRate].notNil }) {
                ~phenoEngine.value;
            } {
                "[pheno] buses not ready — retrying in 2 s".postln;
                AppClock.sched(2.0, { ~phenoEngine.value; nil });
            };
        } {
            "[pheno] corpus not built — ring clock idle. Run tools/build_corpus.py".postln;
        };
        nil;
    });
};

// ─── OSC ────────────────────────────────────────────────────────────────────
// /pheno/jumpSeason already exists in 6_osc_handlers.scd and moves the season;
// these move the cursor itself and stop/start the layer.
OSCdef(\phenoGoto, { |msg|
    // -1 for the same reason ~phenoNextRecorded subtracts one: the routine's
    // own increment is what lands on the day. Waking and fading for the same
    // reason too — without them this set a variable and nothing else.
    var doy = (msg[1] ? 1).asInteger.clip(1, 365);
    ~phenoCursor = (doy - 1).max(0).asFloat;
    ~phenoSkipNow = true;
    ~phenoFadeVoices.(1.0);
    ("[pheno] cursor -> doy % (%)".format(doy, ~phenoSeason.(doy))).postln;
}, '/pheno/goto');

// Skip the silence. Three of every four hours at the default rate are gap, so
// auditioning the corpus — or performing it — needs a way to reach the next
// day that actually has audio without waiting out an absence of up to 178 days.
~phenoNextRecorded = {
    var here, next;
    if(~phenoRecordedDays.size == 0) { nil } {
        here = ~phenoCursor.floor.asInteger;
        next = ~phenoRecordedDays.detect { |d| d > here } ? ~phenoRecordedDays.first;
        // -1 so the routine's own increment lands exactly on it.
        ~phenoCursor = (next - 1).max(0).asFloat;
        // Moving the cursor was all this used to do, and the routine was
        // asleep in a whole-day wait, so nothing happened until that wait ran
        // out — up to a minute at the default rate, eight at the slow end.
        // Pressing the button again in the meantime just recomputed the same
        // destination. These two lines are the difference between setting a
        // destination and arriving at it: wake the ring, and let go of what is
        // currently sounding so the jump is audible rather than buried under a
        // clip with fifty seconds left to run.
        ~phenoSkipNow = true;
        ~phenoFadeVoices.(1.0);
        ("[pheno] skip -> doy % (%)".format(next, ~phenoSeason.(next))).postln;
        next;
    };
};

OSCdef(\phenoNext, { |msg| ~phenoNextRecorded.value }, '/pheno/next');

OSCdef(\phenoStop, { |msg|
    ~phenoRoutine.stop;
    ~phenoPanic.value;
}, '/pheno/stop');

OSCdef(\phenoStart, { |msg|
    if(~phenoEngine.notNil) { ~phenoEngine.value };
}, '/pheno/start');

"═══ 14 · Cámara Fenológica de lo Vivo loaded ═══".postln;
"    /pheno/goto <doy>   /pheno/next   /pheno/stop   /pheno/start".postln;
)
