// SuperCollider Ethereum Sonification - OSC Handlers
// Current Date and Time (UTC): 2025-03-01 22:26:45
// Current User's Login: alejoduque

(
// Initialize global state if not already done
~globalState = ~globalState ?? {
    (
        transactionCount: 0,
        lastValue: 0,
        lastHash: "",
        lastGasPrice: 0
    )
};

// Create default group if not exists
s.doWhenBooted({
    if(Group.basicNew(s, 1).isPlaying.not) {
        Group(s, \addToHead);
    };
    
    // Free any existing OSC definitions to prevent duplicates
    OSCdef(\txHandler).free;
    OSCdef(\ethNoteHandler).free;
    OSCdef(\ethTxInfoHandler).free;
    OSCdef(\ethBlockHandler).free;

    // ── Chain temporal state ────────────────────────────────────────────
    // Populated from the enriched eth_sonify.py payload. Drives the pad
    // scheduler (block period), the gas accent (priorityRatio) and the
    // monitor. Every field carries a sane default, so a stale or absent
    // Python is never fatal — the engine simply runs on its own clock.
    ~rhythmState = ~rhythmState ?? {
        (
            blockNum: 0, blockHash: "",
            blockTxCount: 0, blockBaseFee: 0.0, blockAt: 0.0,
            blockPeriod: 12.0,      // Ethereum's nominal cadence, refined live
            txIndex: 0, txSinceBlock: 0,
            priorityRatio: 0.5,     // 0–1: how far over base fee this TX bid
            addrSig: 0, nonce: 0, calldataLen: 0,
            txIntervals: [],        // ring of the last N inter-arrival gaps
            entropy: 0.0,           // 0–1 coefficient of variation of the above
            lastTxAt: 0.0
        )
    };
    ~rhythmIntervalMax = 24;

    // ── Live monitor: what SC is ACTUALLY receiving and doing ────────────
    // `tail -f sclang_log.txt | grep MON` gives one line every 2 s answering,
    // without guesswork, the questions that are otherwise invisible:
    //   · are pads sounding, or being gated — and by which gate? (bells field)
    //   · is the beat engine alive and firing?                (kick/perc/err)
    //   · is the enriched eth_sonify payload arriving?        (blk/prio fields)
    //   · is the engine getting live values or frozen ones?   (prio/ent/dens)
    //   · is the output being squashed by the limiter?        (outPk/gr)
    ~bellStats = ~bellStats ?? {
        (spawned: 0, skipGate: 0, skipCap: 0, skipBar: 0, queued: 0,
         lastAtk: 0, lastDec: 0, lastAmp: 0)
    };

    // ── Pad scheduler ───────────────────────────────────────────────────
    // eth_sonify fetches a block and then transmits its qualifying
    // transactions ~0.05 s apart, so a whole block arrives as a ~2 s burst
    // inside a ~12 s period. FILTERING on arrival time therefore can only ever
    // reach the first two or three of sixteen slots, then nothing sounds for
    // ten seconds — measured as 1–3 pads per block against hundreds of
    // bar-skips. A burst cannot be spread by a filter; it has to be SCHEDULED.
    //
    // Transactions are queued on arrival and released one per 1/16 of the
    // block period, so the block's own transactions fill the block's own bar.
    // Bounded queue: a heavy block drops its OLDEST pending pads rather than
    // growing without limit or lagging into the next bar.
    ~padQueue = ~padQueue ?? { List.new };
    ~padQueueMax = 24;
    ~padSynthMax = 24;   // 16 -> 48 -> 24. At 48 the pad layer alone reached
                         // 2-3x full scale (it sums LINEARLY with concurrency),
                         // which is what pinned the limiter at 90-98% reduction.

    // Live pad count, for polyphony compensation. Each spawn records when its
    // envelope will have finished (atk+dec+sus+rel are all known here); expired
    // entries are dropped before counting. No NodeWatcher, no server round-trip.
    ~padLive = ~padLive ?? { List.new };
    ~padPolyComp = {
        var now = SystemClock.seconds, n;
        // Filtrar la lista entera, no sacar de la cabeza. Las envolventes
        // duran cosas distintas (life va de ~1.75 s a ~8.6 s antes del x2.2),
        // así que ~padLive NO está ordenada por vencimiento: un pad largo
        // encolado primero se quedaba en el índice 0 bloqueando la salida de
        // todos los cortos posteriores, n crecía sin parar y 1/sqrt(n) dejaba
        // cada pad nuevo más flojo que el anterior — exactamente el fallo de
        // "los pads no se oyen" que la compensación existe para arreglar.
        // .as(List) is not cosmetic: List:reject returns an ARRAY, and
        // ArrayedCollection:add only mutates in place while there is spare
        // capacity — past that it returns a new array and the caller's
        // reference is unchanged. Line ~124 does a bare `~padLive.add(...)`
        // with no reassignment, so once the array filled, every subsequent
        // pad was silently untracked: ~padLive.size under-counted, the
        // polyphony compensation went too high and the cap stopped applying.
        ~padLive = ~padLive.reject { |t| t <= now }.as(List);
        n = ~padLive.size.max(1);
        // 1/sqrt(n): the correct law for uncorrelated sources. Bounds the sum
        // as voices pile up without making one pad as loud as thirty together.
        1 / n.sqrt
    };

    if(~padDrainRoutine.notNil) { ~padDrainRoutine.stop };
    ~padDrainRoutine = Routine({
        loop {
            var wait = 0.75, args;
            if(~rhythmState.notNil) {
                wait = (~rhythmState[\blockPeriod] / 16).clip(0.15, 2.0);
            };
            if(~padQueue.notNil and: { ~padQueue.size > 0 }) {
                args = ~padQueue.removeAt(0);
                // Cuenta PADS, no todos los nodos del servidor. s.numSynths
                // incluye el limitador, el osciloscopio, el drone, el bombo,
                // la percusión, el polvo y —desde el slot A— hasta doce voces
                // de grabación de campo. En un coro del amanecer eso suma 22-23
                // por sí solo, así que el tope de 24 se alcanzaba sin un solo
                // pad vivo y la capa entera enmudecía justo cuando más pasa.
                // Los dos topes se dimensionaron por separado y su suma excedía
                // el presupuesto compartido.
                if(~padLive.size < ~padSynthMax) {
                    var pc = ~padPolyComp.value;
                    var life = 0;
                    // Envelope end time, so the voice expires from ~padLive on
                    // its own schedule rather than being guessed at.
                    args.pairsDo { |k, v|
                        if(#[\atk, \dec, \sus, \rel].includes(k)) { life = life + v };
                    };
                    ~padLive.add(SystemClock.seconds + (life * 2.2).clip(0.5, 20));
                    Synth(\elektronBell, args ++ [\polyComp, pc]);
        // Onset del pad hacia los visuales (slot 5 es el instrumento de esta
        // voz). Se manda la amplitud efectiva y la frecuencia normalizada.
        if(~visualsDest.notNil) {
            var bf = 440, ba = 0.3;
            args.pairsDo { |k, v|
                if(k == \freq) { bf = v };
                if(k == \amp)  { ba = v };
            };
            ~visualsDest.sendMsg('/voice/pad', (ba * pc).clip(0, 1), (bf / 900).clip(0, 1));
        };
                    ~bellStats[\spawned] = ~bellStats[\spawned] + 1;
                    ~bellStats[\lastPoly] = pc;
                } {
                    ~bellStats[\skipCap] = ~bellStats[\skipCap] + 1;
                };
            };
            wait.wait;
        };
    });
    ~padDrainRoutine.play(SystemClock);

    // ── Sample system OSC ───────────────────────────────────────────────
    // /sample/trigger · /sample/param · /sample/stop · /sample/stopall are
    // registered in 10_sample_system.scd, not here: they close over
    // ~triggerSample and ~sampleBuses, which that file defines four files
    // AFTER this one. Registering them here would capture nils. Pointer left
    // so the canonical OSC list still leads to them.

    ~monitorLine = {
        var rs = ~rhythmState, b = ~bellStats;
        ("[MON] bells:" ++ b[\spawned] ++ "/gate:" ++ b[\skipGate]
                ++ "/cap:" ++ b[\skipCap] ++ "/drop:" ++ b[\skipBar]
                ++ "  q:" ++ (~padQueue !? { ~padQueue.size } ? 0)
                ++ "/" ++ (b[\queued] ? 0)
            ++ "  env(atk/dec/amp):" ++ b[\lastAtk].round(0.01) ++ "/"
                ++ b[\lastDec].round(0.01) ++ "/" ++ b[\lastAmp].round(0.001)
            ++ "  prio:" ++ rs[\priorityRatio].round(0.001)
            ++ " ent:" ++ rs[\entropy].round(0.001)
            ++ " dens:" ++ (~currentDensity ? 0).round(0.001)
            ++ "  blk:" ++ rs[\blockNum] ++ " txN:" ++ rs[\blockTxCount]
                ++ " idx:" ++ rs[\txIndex] ++ " base:" ++ rs[\blockBaseFee].round(0.001)
            ++ "  synths:" ++ s.numSynths
            // Beat engine: was entirely absent from this line, so "the beats
            // are gone" could only be answered by guesswork. kick/perc are
            // cumulative spawns; tg is the transport gain (0.05 after
            // /parliament/stop — the "▶ Stop Parliament" button — until
            // /parliament/start restores it); amp is the performer's level.
            ++ "  kick:" ++ (~beatParams !? { ~beatParams.kickCount } ? 0)
            ++ " perc:" ++ (~beatParams !? { ~beatParams.percCount } ? 0)
            ++ " tg:" ++ (~beatParams !? { ~beatParams.transportGain } ? 1)
            ++ " amp:" ++ ((~beatParams !? { ~beatParams.masterAmp } ? 0)).round(0.01)
            // Non-zero means the beat loop threw and recovered. Previously such
            // an error killed the Routine outright and the only visible symptom
            // was kick:/perc: frozen at whatever they had reached.
            ++ " err:" ++ (~beatParams !? { ~beatParams.beatErrors } ? 0)
            // int: the EFFECTIVE step interval in seconds. The bar now follows
            // the measured block period, so this is how you check the tempo is
            // actually tracking the chain rather than assuming it. It should
            // move with block cadence and density, and sit at the fixed-grid
            // value when the feed stops.
            ++ " int:" ++ (~beatParams !? { ~beatParams.lastInterval } ? 0).round(0.001)
            // tide: which arc is running, its phase 0->1, and the swell value
            // it currently yields; puls: the sub-bass heartbeat switch. Four
            // toggles were added with the tidal rhythm and every one of them
            // is legible here — the seven rhythm toggles removed earlier in
            // this session failed largely because their effect could not be
            // checked, which turned every question into rounds of guessing.
            // If ticking an arc does not change tide: here, the control did
            // not reach the engine and nothing about the sound will tell you.
            ++ "  tide:" ++ (~beatParams !? { ~beatParams.tideArc } ? \none)
                ++ "/" ++ (~beatParams !? { ~beatParams.tidePhase } ? 0).round(0.01)
                ++ "=" ++ (~beatParams !? { ~beatParams.tideValue } ? 0).round(0.01)
            ++ " puls:" ++ if((~beatParams !? { ~beatParams.tidePulse } ? 0) > 0.5, "on", "off")
            // smp: field recordings — cumulative triggers / live voices / cap.
            // The seven samples were previously reachable only from a GUI
            // button and appeared nowhere on this line, so "the forest is not
            // speaking" had no reading. live is the number that matters: if it
            // pins at the cap the chorus is being culled, and if it stays 0
            // while fired climbs the buffers never loaded.
            ++ "  smp:" ++ (~sampleStats !? { ~sampleStats[\fired] } ? 0)
                ++ "/" ++ (~activeSampleSynths !? { ~activeSampleSynths.size } ? 0)
                ++ "/" ++ (~sampleMaxVoices ? 0)
            ++ " padPoly:" ++ (~bellStats !? { ~bellStats[\lastPoly] } ? 1).round(0.01)
            // srv: is the AUDIO SERVER alive. Everything else on this line is
            // counted in sclang and keeps incrementing whether or not scsynth
            // exists — bells, kicks and perc all climbed happily through a
            // session that produced no sound at all, because those counters
            // only record that a Synth message was SENT. Without this field
            // "no audio" and "engine fine, server dead" look identical.
            ++ "  srv:" ++ if(s.serverRunning, "up", "DOWN")
            ++ " outPk:" ++ (~limiterPeak ? 0).round(0.001)
            ++ " gr:" ++ (~limiterGR ? 1).round(0.01)).postln;
        // reset the hold window so each line describes the last 2 s only
        ~limiterPeak = 0;
        ~limiterGR = 1;
    };

    if(~monitorRoutine.notNil) { ~monitorRoutine.stop };
    // try-wrapped: an uncaught error inside a Routine kills it silently, and a
    // diagnostic that dies the moment something goes wrong is worse than none.
    ~monitorRoutine = Routine({
        loop {
            try { ~monitorLine.value } { |e| ("[MON] monitor error: " ++ e.errorString).postln };
            2.0.wait;
        };
    });
    ~monitorEnabled = ~monitorEnabled ? true;
    if(~monitorEnabled) { ~monitorRoutine.play(AppClock) };

    // /diag/monitor 0|1  — silence or resume the monitor line
    // /diag/osctrace 0|1 — OSCFunc.trace: post EVERY inbound OSC message, the
    //                      definitive test of whether a control reaches SC
    // /diag/reset        — zero the pad counters to measure a fresh window
    // Limiter telemetry: msg is [\/limiterGR, nodeID, replyID, pre, post].
    // ~limiterGR is the ratio the limiter is holding the signal back by —
    // 1.0 = untouched, 0.5 = pulling 6 dB off everything.
    // Peak-HOLD between monitor prints. Reporting the instantaneous value was
    // useless: SendReply fires at 4 Hz and the monitor samples every 2 s, so
    // each line showed one arbitrary moment — readings swung from 0.0 to 1.057
    // on a signal that was audibly steady. The monitor is only worth having if
    // its numbers can be trusted.
    ~limiterPeak = 0; ~limiterGR = 1;
    OSCdef(\limiterGR).free;
    OSCdef(\limiterGR, { |msg|
        var pre = msg[3].asFloat;
        ~limiterPeak = max(~limiterPeak ? 0, pre);
        if(pre > 0.02) {   // ratios below this are measurement noise, not limiting
            ~limiterGR = min(~limiterGR ? 1, (msg[4].asFloat / pre).clip(0, 1));
        };
    }, '/limiterGR');

    // Real master-bus spectrum → bridge → browser spectrogram.
    OSCdef(\masterScope).free;
    OSCdef(\masterScope, { |msg|
        if(~visualsDest.notNil) {
            ~visualsDest.sendMsg('/spectrum', *msg[3..].collect(_.asFloat));
        };
    }, '/spectrum');

    OSCdef(\diagMonitor).free;
    OSCdef(\diagMonitor, { |msg|
        var on = msg[1].asFloat > 0.5;
        ~monitorEnabled = on;
        if(on) { ~monitorRoutine.reset.play(AppClock) } { ~monitorRoutine.stop };
        ("[MON] monitor " ++ if(on, "ON", "OFF")).postln;
    }, "/diag/monitor");

    OSCdef(\diagTrace).free;
    OSCdef(\diagTrace, { |msg|
        var on = msg[1].asFloat > 0.5;
        OSCFunc.trace(on);
        ("[MON] OSC trace " ++ if(on, "ON — every inbound message will post", "OFF")).postln;
    }, "/diag/osctrace");

    OSCdef(\diagReset).free;
    OSCdef(\diagReset, { |msg|
        [\spawned, \skipGate, \skipCap, \skipBar].do { |k| ~bellStats[k] = 0 };
        "[MON] bell counters reset".postln;
    }, "/diag/reset");

    // Inter-arrival ENTROPY, not density. Density says how much is arriving;
    // entropy says in what SHAPE — regular ticking vs bursty clustering — and
    // shape is what keeps a rhythm from settling into repetition.
    // Coefficient of variation (sd/mean), normalized: 0 = metronomic arrivals,
    // 1 = heavily clustered.
    // Measured in LOG time, not linear. A window mixing 0.05 s intra-block
    // arrivals with ~12 s block gaps gives a raw coefficient of variation of
    // 2–3 on every single sample, so the previous (sd/mean) form clipped to
    // 1.0 permanently and the control was a constant — the live monitor read
    // ent:1.0 flat. The same spread is ~2–4 octaves in log space, which sits
    // inside the usable range and actually discriminates shapes.
    // 3.5 octaves of spread = fully bursty.
    ~rhythmEntropy = {
        var iv = ~rhythmState[\txIntervals];
        var n = iv.size, logs, mean, sd, r = 0.0;
        if(n >= 4) {
            logs = iv.collect { |x| x.clip(0.001, 120).log2 };
            mean = logs.sum / n;
            sd = (logs.collect { |x| (x - mean).squared }.sum / n).sqrt;
            r = (sd / 3.5).clip(0, 1);
        };
        r
    };

    // Deterministic per-block pattern seed. Same block always yields the same
    // rhythmic cell, so a session is reproducible while never repeating —
    // the same trick the Estratos module uses for its layout.
    // (~rhythmSeededRand vivía aquí: un hash-PRNG de cinco líneas sin un solo
    //  sitio de llamada, resto de los siete tickers de ritmo que se quitaron.
    //  Los campos blockSeed / blockPulse / lastBarSlot que alimentaba corren
    //  la misma suerte más abajo por la misma razón: escritos, nunca leídos.)

    // Handler for Python's /eth/block [number, hash, txCount, baseFeeGwei, ts].
    // Blocks land on a ~12 s cadence that is given from outside the instrument:
    // the one clock in this system that is neither a metronome nor a knob.
    OSCdef(\ethBlockHandler, {|msg, time, addr, port|
        var now = SystemClock.seconds;
        var prevAt = ~rhythmState[\blockAt];
        var hash = msg[2].asString;
        if(prevAt > 0) {
            // Measured cadence, smoothed — tracks reality rather than assuming 12 s
            ~rhythmState[\blockPeriod] =
                ((~rhythmState[\blockPeriod] * 0.7) + ((now - prevAt).clip(4, 30) * 0.3));
        };
        ~rhythmState[\blockNum]     = msg[1].asInteger;
        ~rhythmState[\blockHash]    = hash;
        ~rhythmState[\blockTxCount] = msg[3].asInteger.max(1);
        ~rhythmState[\blockBaseFee] = msg[4].asFloat;
        ~rhythmState[\blockAt]      = now;
        ~rhythmState[\txSinceBlock] = 0;
        // Let the beat engine know a bar boundary just happened
    }, '/eth/block');

    // Shared function: sonify a transaction and broadcast to visuals
    ~handleTransaction = { |noteNum, velocity, value, gasPrice, txHash, time|
        var baseFreq, synthArgs, nutrient, consensus;
        var valLog, priorityRatio, accent, minGap, queued;

        baseFreq = noteNum.midicps;
        // Add hash-based micro-variation
        if(txHash.notNil) {
            baseFreq = baseFreq * (1 + (txHash.hash.fold(-0.05, 0.05)));
        };
        // Octave-fold into the drone register: Python maps TX value to MIDI
        // 36–84 (fundamentals up to ~1 kHz). Folding anything above the
        // ceiling down by octaves keeps the pitch class (value still audible
        // as pitch) but lets transactions thicken the drone bed instead of
        // pinging on top of it.
        //
        // Ceiling dropped 320 → 160 Hz: a full octave lower, so the pads sit
        // in the same register as the sub of \opalDrone and the kick. They
        // beat against the drone rather than floating above it, and sustained
        // overlapping pads read as harmonic thickening instead of bells.
        while({ baseFreq > 160 }, { baseFreq = baseFreq * 0.5 });


        // Gas deviation -> accent. priorityRatio is skewed toward zero (most
        // transactions bid at or near base fee), so the baseline sits near
        // unity and a genuine high bid punches above it.
        accent = if(~rhythmState.notNil) {
            0.85 + (~rhythmState[\priorityRatio] * 0.9)
        } { 1.0 };

        // Calculate abstract values for visuals.
        // consensus was gasPrice.linlin(1, 200, 0, 1) — at post-Dencun gas that
        // clips to 0 on every single transaction, which is why the bridge log
        // showed a constant /bio/consensus 0. The priority ratio carries the
        // same intent ("how contested is this block") and stays alive.
        nutrient = value.linlin(0.001, 10, 0, 1);
        consensus = if(~rhythmState.notNil and: { ~rhythmState[\blockBaseFee] > 0 }) {
            ~rhythmState[\priorityRatio]
        } {
            gasPrice.linlin(1, 200, 0, 1)
        };

        // Update global state
        // ~lastEthTime / ~ethNoteCount feed the GUI's ETH light and Notes
        // counter. Stamped here rather than in each of the three entry points
        // (/eth/note, /tx, and the block handler) because this is the one
        // funnel they all pass through.
        ~lastEthTime = SystemClock.seconds;
        ~ethNoteCount = (~ethNoteCount ? 0) + 1;
        ~globalState.transactionCount = ~globalState.transactionCount + 1;
        ~globalState.lastValue = value;
        ~globalState.lastHash = txHash ? "";
        ~globalState.lastGasPrice = gasPrice;

        // Calculate density (EMA of inter-TX timing)
        if(~lastTxTime.isNil) { ~lastTxTime = time };
        ~txInterval = time - ~lastTxTime;
        ~lastTxTime = time;
        if(~currentDensity.isNil) { ~currentDensity = 0.5 };
        // The old map was linlin(0.1, 10, 1.0, 0.0): eth_sonify.py spaces
        // intra-block transactions 0.05 s apart, BELOW that 0.1 floor, so every
        // sample clipped to 1.0 and the EMA pinned at ~0.99997 — the constant
        // the bridge log showed. A log map over 0.01–30 s keeps sub-0.1 s
        // bursts distinguishable from each other and from the block gaps.
        ~currentDensity = (~currentDensity * 0.9) +
            ((1 - ((~txInterval.clip(0.01, 30) / 0.01).log2 / 11.5507)).clip(0, 1) * 0.1);

        // Broadcast to visuals bridge
        if(~visualsDest.notNil) {
            ~visualsDest.sendMsg('/bio/nutrient', nutrient);
            ~visualsDest.sendMsg('/bio/consensus', consensus);
            ~visualsDest.sendMsg('/bio/density', ~currentDensity);

            if(~beatParams.notNil) {
                ~beatParams.transactionDensity = ~currentDensity;
                ~beatParams.lastTransactionTime = SystemClock.seconds;
            };
        };

        // Debug output
        "\n=== TX % === Note:% Freq:% Val:% Gas:%".format(
            ~globalState.transactionCount, noteNum, baseFreq.round(1), value.round(0.001), gasPrice.round(1)
        ).postln;

        // Build synth args — tuned for pad/drone behaviour:
        // atk: larger value = slower fade-in (more contemplative)
        // dec: gas price drives the settle time (high gas = busier network = faster)
        // rel: ETH value drives the tail length (bigger TX = longer resonance)
        // ── envelope: was frozen, now actually reads the transaction ──────
        // Every one of these three was effectively constant:
        //   atk = value.linlin(0.001, 10, 3.0, 1.2) — LINEAR over 0.001–10 ETH
        //     while real values are log-distributed and cluster in the bottom
        //     0.1% of that range, so it returned ~3.0 for every transaction.
        //   dec = gasPrice.linlin(1, 200, 1.8, 0.7) — the same dead absolute-gas
        //     map that made /bio/consensus read 0; clips to 1.8 forever.
        //   rel = value.linlin(0.001, 10, 2.5, 5.0) — same problem as atk, ~2.5.
        // So every bell was an identical slow swell. Combined with a 0.15 s
        // spawn gate and a ~13 s life once timeStretch multiplied it, the pads
        // never cleared: 16 sustained tones summing constantly, which is both
        // the "pulsing bell" and the distortion (that many overlapping partials
        // clip the output stage).
        //
        // valLog uses the SAME normalization as eth_sonify.map_value_to_note
        // (log10 over 0.0001–100 ETH), so the envelope moves with the register.
        valLog = (((value.max(0.000001).log10) + 4.0) / 6.0).clip(0, 1);
        priorityRatio = if(~rhythmState.notNil) { ~rhythmState[\priorityRatio] } { 0.5 };

        synthArgs = [
            \freq, baseFreq,
            // Level history: originally 0.12–0.28, which clipped (16 pads at
            // 0.28 with masterVolume 0.3 summed past full scale and NOTHING
            // limited the master bus). I cut it to 0.05–0.12 to fix that — then
            // added the master limiter in the next commit and never restored
            // the level. The monitor showed amp pinned at 0.05, the floor of
            // that range, on essentially every transaction: an octave lower
            // than before, ~1 s attack, under a sustained drone. Inaudible,
            // which is why only the drone was left. With the limiter now doing
            // the protecting, the pads can sit where they belong.
            \amp, velocity.linlin(30, 120, 0.10, 0.26) * accent,
            // small transfer = quick articulation, large = slow swell
            \atk, valLog.linlin(0, 1, 0.35, 2.2),
            // urgency settles fast; a patient bid rings on
            \dec, priorityRatio.linlin(0, 1, 1.3, 0.35),
            // Sustain HOLD: a large transfer holds its body longer, a small one
            // passes through. This is the stage the old three-segment envelope
            // did not have — every pad decayed straight into its release.
            \sus, valLog.linlin(0, 1, 0.4, 1.6),
            \susLvl, 0.55 + (priorityRatio * 0.2),
            // tails shortened so silence can open between bursts instead of
            // the pads fusing into one continuous wash
            \rel, valLog.linlin(0, 1, 0.7, 2.8),
            \pan, if(txHash.notNil, { txHash.hash.fold(-1.0, 1.0) }, { 0 })
        ];

        // Connect ALL control buses
        if(~buses.notNil) {
            ~buses.keysValuesDo { |paramName, bus|
                synthArgs = synthArgs ++ [(paramName.asString ++ "Bus").asSymbol, bus.index];
            };
        };

        // Time-gate. 0.15 s was far too tight for a pad whose life runs several
        // seconds once timeStretch multiplies the envelope: the layer saturated
        // and stayed saturated, which is why it read as one continuous tone
        // rather than a sequence of transactions. 0.45 s lets each pad be heard
        // as an event, and the cap counts ALL synths so it also stops the pads
        // starving the beat engine.
        minGap = 0.45;
        queued = false;

        // Instead of firing on raw arrival, only transactions whose position in
        // the block lands on one of the bar's 16 divisions sound. Blocks are
        // ordered by priority fee, so the head of the bar is dense and urgent
        // and the tail thins — the bar's shape is read from the block.
        // Quantize by POSITION IN TIME inside the block, not by transaction
        // index. eth_sonify enumerates every transaction in a block but only
        // transmits those above min_value_threshold, so the indices that
        // actually arrive are sparse and non-contiguous — (idx % stride) then
        // landed far less often than 1-in-stride and the layer collapsed to a
        // trickle (measured: 608 bar-skips against 55 pads). Worse, the old
        // guard needed blockTxCount > 16, so before the first /eth/block the
        // filter was inactive and pads flowed freely, then fell off a cliff
        // the moment a block landed — the "loud for ten seconds, then silence".
        //
        // Time slots give a real 16-onset bar however much upstream filtering
        // happens, and degrade gracefully: no block yet = no quantization.
        // Pads are always QUEUED, never fired on arrival: ~padDrainRoutine
        // releases one per 1/16 of the block period. eth_sonify transmits a
        // whole block as a ~2 s burst inside a ~12 s period, so firing on
        // arrival clumps the layer and then leaves ten seconds empty.
        if(~rhythmState.notNil and: { ~rhythmState[\blockAt] > 0 }) {
            if(~padQueue.size >= ~padQueueMax) {
                ~padQueue.removeAt(0);              // drop oldest, keep current
                ~bellStats[\skipBar] = ~bellStats[\skipBar] + 1;
            };
            ~padQueue.add(synthArgs);
            ~bellStats[\lastAtk] = valLog.linlin(0, 1, 0.35, 2.2);
            ~bellStats[\lastDec] = priorityRatio.linlin(0, 1, 1.3, 0.35);
            ~bellStats[\lastAmp] = velocity.linlin(30, 120, 0.10, 0.26) * accent;
            ~bellStats[\queued] = (~bellStats[\queued] ? 0) + 1;
            queued = true;   // the drain routine owns this pad now
        };

        // ⚠ This nil-guard MUST stay above every arithmetic use of
        // ~lastPadTime. It previously sat below the starvation guard, so the
        // very first transaction evaluated `time - nil`, threw, and aborted
        // ~handleTransaction before ~lastPadTime was ever assigned — which
        // made every later transaction throw at the same point. The pad layer
        // went permanently silent while /eth/tx_info kept updating the rhythm
        // state, so the monitor showed live chain data next to bells:0 and all
        // four skip counters at zero.
        if(~lastPadTime.isNil) { ~lastPadTime = 0 };

        // Starvation guard. Any combination of the seven toggles must still
        // produce sound while the chain is flowing: if a transaction has been
        // received but nothing has sounded for 6 s, force this one through.
        // Without it, a filter combination nobody tested could mute the pad
        // layer for the rest of a set with no way to tell it apart from a
        // dead feed.
        // (Skipped when the pad was queued — the drain routine will sound it,
        // and forcing an immediate spawn as well would double it.)
        // Guardia de inanición: si nada se ha encolado y hace más de 6 s que
        // no suena un pad, se fuerza el paso. (`sounds` se quitó: se ponía en
        // true y nunca en false, así que la rama { sounds.not } del case era
        // inalcanzable y `relScale` era un 1.0 que sólo multiplicaba por uno.)
        if(queued.not and: { (time - ~lastPadTime) > 6.0 }) { minGap = 0 };
        // Every branch is counted so the monitor can say WHY a pad did or did
        // not sound — "it seems random" is otherwise impossible to check.
        case
        { queued } {
            // already handed to ~padDrainRoutine — not a skip, not a spawn
        }
        { (time - ~lastPadTime) <= minGap } {
            ~bellStats[\skipGate] = ~bellStats[\skipGate] + 1;
        }
        { ~padLive.size >= ~padSynthMax } {
            ~bellStats[\skipCap] = ~bellStats[\skipCap] + 1;
        }
        {
            Synth(\elektronBell, synthArgs);
            ~lastPadTime = time;
            ~bellStats[\spawned] = ~bellStats[\spawned] + 1;
            ~bellStats[\lastAtk] = valLog.linlin(0, 1, 0.35, 2.2);
            ~bellStats[\lastDec] = priorityRatio.linlin(0, 1, 1.3, 0.35);
            ~bellStats[\lastAmp] = velocity.linlin(30, 120, 0.10, 0.26) * accent;
        };

        // The GUI refresh that used to live here drove ~transactionCount,
        // ~valueDisplay and ~activityMeter — three views belonging to
        // ~addBeatControls, a second control window in 5_beat_engine.scd that
        // was never called from anywhere. The globals were therefore never
        // assigned, every branch was a .notNil that failed, and the whole
        // block was a deferred no-op on every transaction. Both are gone now;
        // the live counters are in 4_gui.scd, fed from ~globalState.

        if(~addTrendValue.notNil) { ~addTrendValue.value(value) };
    };

    // Handler for Python's /eth/note [note, velocity, instrument, duration]
    OSCdef(\ethNoteHandler, {|msg, time, addr, port|
        var noteNum = msg[1].asInteger;
        var velocity = msg[2].asInteger;
        // instrument = msg[3], duration = msg[4] — not used yet
        var value = if(~globalState.lastValue > 0, { ~globalState.lastValue }, { 0.1 });
        // ? operator only catches nil — use explicit > 0 to also catch 0.0 (EIP-1559 TXs have gasPrice=0)
        var gasPrice = if(~globalState.lastGasPrice > 0, { ~globalState.lastGasPrice }, { 20 });

        ~handleTransaction.(noteNum, velocity, value, gasPrice, ~globalState.lastHash, time);
    }, '/eth/note');

    // Handler for Python's /eth/tx_info
    //   [hash, value, gasPrice, toAddr]                        ← original
    //   + [txIndex, priorityGwei, baseGwei, addrSig, nonce, calldataLen]
    // This arrives just after /eth/note — store the real values for the next note.
    // The tail is optional: an older eth_sonify.py sends only args 1–4 and the
    // rhythm state simply keeps its defaults.
    OSCdef(\ethTxInfoHandler, {|msg, time, addr, port|
        var txHash = msg[1].asString;
        var value = msg[2].asFloat;
        var gasPrice = msg[3].asFloat;
        var now = SystemClock.seconds;
        var iv, gap, priorityGwei, baseGwei;

        // Store for the next /eth/note to use
        ~lastEthTime = now;
        ~globalState.lastValue = value;
        ~globalState.lastGasPrice = gasPrice;
        ~globalState.lastHash = txHash;

        // ── enriched fields → rhythm state ──
        if(msg.size >= 11) {
            priorityGwei = msg[6].asFloat;
            baseGwei = msg[7].asFloat;
            ~rhythmState[\txIndex]      = msg[5].asInteger;
            ~rhythmState[\addrSig]      = msg[8].asInteger;
            ~rhythmState[\nonce]        = msg[9].asInteger;
            ~rhythmState[\calldataLen]  = msg[10].asInteger;
            // How far over base fee this actor bid, log-compressed 1x–8x → 0–1.
            // Self-calibrating: unlike the old absolute gasPrice.linlin(1,200,…)
            // (which read 0 at every modern gas price) this cannot go flat.
            ~rhythmState[\priorityRatio] = if(baseGwei > 0) {
                ((priorityGwei / baseGwei).max(1.0).log2 / 3.0).clip(0, 1)
            } { 0.5 };
        };
        ~rhythmState[\txSinceBlock] = ~rhythmState[\txSinceBlock] + 1;

        // ── inter-arrival ring → entropy ──
        if(~rhythmState[\lastTxAt] > 0) {
            gap = (now - ~rhythmState[\lastTxAt]).clip(0.001, 60);
            iv = ~rhythmState[\txIntervals] ++ [gap];
            if(iv.size > ~rhythmIntervalMax) { iv = iv.drop(iv.size - ~rhythmIntervalMax) };
            ~rhythmState[\txIntervals] = iv;
            ~rhythmState[\entropy] = ~rhythmEntropy.value;
        };
        ~rhythmState[\lastTxAt] = now;
    }, '/eth/tx_info');

    // Legacy handler for /tx [hash, value, gasPrice] — kept for backwards compat
    OSCdef(\txHandler, {|msg, time, addr, port|
        var txHash = msg[1].asString;
        var value = msg[2].asFloat;
        var gasPrice = msg[3].asFloat;
        var noteNum = value.linlin(0.001, 10, 24, 96).round(1);
        var velocity = gasPrice.linlin(1, 200, 30, 120).round(1);

        ~handleTransaction.(noteNum, velocity, value, gasPrice, txHash, time);
    }, '/tx');

    // --- Web GUI Bidirectional OSC Mappings ---
    // ~oscToParamMap (path -> param, canonical + aliases) comes from the
    // canonical registry in 0_parameters.scd — the range table that used to
    // live here (and had drifted from the GUI/MIDI copies) lives there too.
    //
    // One OSCdef per PATH, keyed by the path itself: the old code keyed each
    // OSCdef by the param symbol, so alias paths (/parliament/fx/*) silently
    // overwrote the canonical /soneth/* handler for the same parameter —
    // whichever iterated last won and the other path went dead.
    if(~oscToParamMap.notNil and: { ~setParamNorm.notNil }) {
        ~oscToParamMap.keysValuesDo { |oscPath, paramName|
            OSCdef(("param" ++ oscPath).asSymbol, { |msg|
                // Browser sliders send normalized 0–1. ~setParamNorm maps to
                // native units via the registry spec, sets the bus, mirrors
                // ~beatParams (beatTempo/txInfluence), syncs the GUI knob and
                // echoes 0–1 back on the canonical path.
                ~lastOscTime = SystemClock.seconds;
                ~setParamNorm.(paramName, msg[1].asFloat, \osc);
            }, oscPath);
        };
    } {
        "0_parameters.scd not loaded — no slider OSC handlers created!".error;
    };

    // ── Phenology Chamber: season jump trigger (Art. 42 §) ─────────────
    // Discrete trigger (string arg) — moves the calendar cursor to the
    // first day of the named season. Echoes to browser so other UIs stay
    // in sync, and triggers a beat-engine drop+fill pulse.
    OSCdef(\phenoJumpSeason, { |msg|
        var season = msg[1].asString;
        ~lastBrowserOscTime = SystemClock.seconds;
        ("Phenology jump: " ++ season).postln;
        if(~visualsDest.notNil) {
            ~visualsDest.sendMsg("/pheno/jumpSeason", season)
        };
        // Pulse the beat engine via existing txInfluence boost (smooth decay)
        if(~beatParams.notNil) {
            ~beatParams.transactionInfluence = (~beatParams.transactionInfluence ? 0.0) + 0.6;
        };
    }, "/pheno/jumpSeason");

    // ── Cámara de las Especies: the five seats the browser actually shows ──
    // These three addresses were reaching this port and being dropped on the
    // floor. They cannot go through the registry loop above: that one is built
    // from ~paramDefs and every handler it makes reads a single float at
    // msg[1], while these carry [agentId, value] — one message per seat. So
    // they get their own defs, and the arrays they write are read by the
    // percussion trigger in 5_beat_engine.scd, which is where a species
    // becomes audible.
    //
    // ~lastBrowserOscTime is stamped for the same reason every other
    // browser-origin handler stamps it: the Bridge RX light is the only
    // confirmation that HTML→bridge→SC is alive, and a surface that moves five
    // faders without lighting it would be lying about the path.
    ~speciesPresence   = ~speciesPresence   ?? { Array.fill(5, 0.5) };
    ~speciesActivity   = ~speciesActivity   ?? { Array.fill(5, 0.5) };
    ~ednaBiodiversity  = ~ednaBiodiversity  ?? { Array.fill(8, 0.5) };
    ~ednaTouchedAt     = ~ednaTouchedAt     ?? { Array.fill(8, 0.0) };

    OSCdef(\speciesPresence).free;
    OSCdef(\speciesPresence, { |msg|
        // Values arrive from a browser, so clamp rather than trust: an out of
        // range index here would throw inside the beat routine, and an error
        // in a Routine stops it permanently (see 5_beat_engine.scd:260).
        var id = msg[1].asInteger.clip(0, 4);
        ~speciesPresence[id] = msg[2].asFloat.clip(0, 1);
        ~lastBrowserOscTime = SystemClock.seconds;
    }, "/agents/species/presence");

    OSCdef(\speciesActivity).free;
    OSCdef(\speciesActivity, { |msg|
        var id = msg[1].asInteger.clip(0, 4);
        ~speciesActivity[id] = msg[2].asFloat.clip(0, 1);
        ~lastBrowserOscTime = SystemClock.seconds;
    }, "/agents/species/activity");

    OSCdef(\ednaBiodiv).free;
    OSCdef(\ednaBiodiv, { |msg|
        var id = msg[1].asInteger.clip(0, 7);
        ~ednaBiodiversity[id] = msg[2].asFloat.clip(0, 1);
        // When the site was last attested. The browser reports this back as
        // "validation": a reading nobody has touched in a while is not a
        // validated one.
        ~ednaTouchedAt[id] = SystemClock.seconds;
        ~lastBrowserOscTime = SystemClock.seconds;
    }, "/agents/edna/biodiversity");

    // NOTE: /soneth/beatTempo and /soneth/txInfluence are handled by the
    // registry-generated OSCdefs above — their entries carry a beatParam
    // mirror, so ~setParam writes ~beatParams AND (for txInfluence) the bus.
    // The old dedicated OSCdefs here double-handled /soneth/txInfluence.

    // ── Parliament Vote / Emergency / Start / Stop handlers ────────────
    // These arrive from the browser buttons via the bridge.
    // They affect the beat engine, drone, and echo back to visuals.

    OSCdef(\voteHandler, { |msg|
        var consensus, passed;
        // Vote triggers a sonic event: tempo burst + harmonic bell chord
        ~lastBrowserOscTime = SystemClock.seconds;
        "VOTE triggered — consensus surge".postln;

        // Temporarily accelerate beat tempo for 4 seconds
        if(~beatParams.notNil) {
            var origTempo = ~beatParams.beatTempo;
            ~beatParams.beatTempo = origTempo * 1.6;
            AppClock.sched(4.0, {
                if(~beatParams.notNil) { ~beatParams.beatTempo = origTempo };
                nil;
            });
        };

        // Spawn a chord of bells (root + 5th + octave) as "vote chime"
        if(~buses.notNil) {
            var bi = { |name| if(~buses[name].notNil, { ~buses[name].index }, { -1 }) };
            var targetGrp = if(~defaultGroup.notNil, { ~defaultGroup }, { s.defaultGroup });
            #[60, 67, 72].do { |note, i|
                Synth(\elektronBell, [
                    \freq, note.midicps,
                    \amp, 0.22 - (i * 0.04),
                    \atk, 0.8, \dec, 0.6, \rel, 2.5,
                    \pan, (i - 1) * 0.5,
                    \masterVolBus, bi.(\masterVolume),
                    \atmosphereBus, bi.(\atmosphereMix),
                    \memoryBus, bi.(\memoryFeed),
                    \harmonicBus, bi.(\harmonicRich),
                    \resonantBus, bi.(\resonantBody),
                    \spectralBus, bi.(\spectralShift),
                    \timeBus, bi.(\timeDilation),
                    \textureBus, bi.(\textureDepth),
                    \spatialBus, bi.(\spatialSpread)
                ], targetGrp);
            };
        };

        // Echo vote event to visuals bridge
        if(~visualsDest.notNil) {
            ~visualsDest.sendMsg('/parliament/vote/sonic', 1.0);
        };
    }, "/parliament/vote");

    OSCdef(\emergencyHandler, { |msg|
        var intensity = msg[1].asFloat;
        ~lastBrowserOscTime = SystemClock.seconds;
        "EMERGENCY consensus override — intensity %".format(intensity.round(0.01)).postln;

        // Drop drone pitch to sub-bass, increase noise
        if(~opalDroneSynth.notNil) {
            ~opalDroneSynth.set(\freq, 35);
        };
        if(~buses.notNil and: { ~buses[\noiseLevel].notNil }) {
            var origNoise = ~buses[\noiseLevel].getSynchronous;
            ~buses[\noiseLevel].set((origNoise + 0.15).clip(0, 0.3));
            // Restore after 6 seconds
            AppClock.sched(6.0, {
                if(~buses.notNil and: { ~buses[\noiseLevel].notNil }) {
                    ~buses[\noiseLevel].set(origNoise);
                };
                if(~opalDroneSynth.notNil) {
                    ~opalDroneSynth.set(\freq, 55);
                };
                nil;
            });
        };

        // Echo to visuals
        if(~visualsDest.notNil) {
            ~visualsDest.sendMsg('/parliament/emergency/sonic', intensity);
        };
    }, "/parliament/emergency");

    OSCdef(\startHandler, { |msg|
        ~lastBrowserOscTime = SystemClock.seconds;
        "Parliament START — restoring beat engine".postln;
        // Re-engage beat engine at normal tempo
        if(~beatParams.notNil) {
            ~beatParams.beatTempo = 1.0;
            // Restores the transport, leaving the performer's masterAmp alone.
            ~beatParams.transportGain = 1.0;
        };
        if(~opalDroneSynth.notNil) {
            ~opalDroneSynth.set(\freq, 55, \amp, 0.4);
        };
    }, "/parliament/start");

    OSCdef(\stopHandler, { |msg|
        ~lastBrowserOscTime = SystemClock.seconds;
        "Parliament STOP — fading out".postln;
        // Transport gain, NOT masterAmp. This used to write
        // ~beatParams.masterAmp = 0.05 directly, bypassing ~setParam — so the
        // registry, the HTML slider, the SC GUI knob and the preset file all
        // still read the performer's value (e.g. 0.62) while the engine ran at
        // 0.05. Nothing but /parliament/start could restore it, and no slider
        // showed anything wrong: the beats were simply gone and stayed gone.
        // Exactly the four-way drift the canonical registry exists to prevent,
        // made reachable by giving \masterAmp a beatParam mirror.
        // A transport action must never clobber a performer's level control.
        if(~beatParams.notNil) {
            ~beatParams.transportGain = 0.05;
        };
        if(~opalDroneSynth.notNil) {
            ~opalDroneSynth.set(\amp, 0.02);
        };
    }, "/parliament/stop");

    // ── Config save/load from the browser (CONFIGS block in parliament.html)
    // String argument — parliament-bridge passes string args as OSC type 's'.
    OSCdef(\presetSave, { |msg|
        ~lastBrowserOscTime = SystemClock.seconds;
        ~saveConfig.(msg[1].asString);
        { if(~refreshPresetMenu.notNil) { ~refreshPresetMenu.value } }.defer;
    }, "/preset/save");

    OSCdef(\presetLoad, { |msg|
        ~lastBrowserOscTime = SystemClock.seconds;
        ~loadConfig.(msg[1].asString);
    }, "/preset/load");

    OSCdef(\presetList, {
        ~lastBrowserOscTime = SystemClock.seconds;
        ~broadcastPresetList.value;
    }, "/preset/list");

    "OSC Handlers initialized:".postln;
    "- Listening on port: %".format(NetAddr.langPort).postln;
    "- Transaction sonification & Front-End OSC mappings ready".postln;
    "- Parliament vote/emergency/start/stop handlers active".postln;
    "- Use ~testSound.value; to test audio".postln;
    "- Use ~startOSCMonitor.value; to debug OSC".postln;
});
)