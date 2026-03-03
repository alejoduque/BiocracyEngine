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

    // Shared function: sonify a transaction and broadcast to visuals
    ~handleTransaction = { |noteNum, velocity, value, gasPrice, txHash, time|
        var baseFreq, synthArgs, nutrient, consensus;

        baseFreq = noteNum.midicps;
        // Add hash-based micro-variation
        if(txHash.notNil) {
            baseFreq = baseFreq * (1 + (txHash.hash.fold(-0.05, 0.05)));
        };

        // Calculate abstract values for visuals
        nutrient = value.linlin(0.001, 10, 0, 1);
        consensus = gasPrice.linlin(1, 200, 0, 1);

        // Update global state
        ~globalState.transactionCount = ~globalState.transactionCount + 1;
        ~globalState.lastValue = value;
        ~globalState.lastHash = txHash ? "";
        ~globalState.lastGasPrice = gasPrice;

        // Calculate density (EMA of inter-TX timing)
        if(~lastTxTime.isNil) { ~lastTxTime = time };
        ~txInterval = time - ~lastTxTime;
        ~lastTxTime = time;
        if(~currentDensity.isNil) { ~currentDensity = 0.5 };
        ~currentDensity = (~currentDensity * 0.9) + ((~txInterval.linlin(0.1, 10, 1.0, 0.0)) * 0.1);

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
        synthArgs = [
            \freq, baseFreq,
            \amp, velocity.linlin(30, 120, 0.12, 0.28),
            \atk, value.linlin(0.001, 10, 2.5, 0.8),
            \dec, gasPrice.linlin(1, 200, 1.5, 0.5),
            \rel, value.linlin(0.001, 10, 1.2, 2.5),
            \pan, if(txHash.notNil, { txHash.hash.fold(-1.0, 1.0) }, { 0 })
        ];

        // Connect ALL control buses
        if(~buses.notNil) {
            ~buses.keysValuesDo { |paramName, bus|
                synthArgs = synthArgs ++ [(paramName.asString ++ "Bus").asSymbol, bus.index];
            };
        };

        // Time-gate: min 0.15s between pad spawns — prevents block-burst pile-up.
        // Also cap at 16 concurrent pads (leaving room for drone + beat synths).
        if(~lastPadTime.isNil) { ~lastPadTime = 0 };
        if((time - ~lastPadTime > 0.15) and: { s.numSynths < 16 }) {
            Synth(\elektronBell, synthArgs);
            ~lastPadTime = time;
        } {
            // silently skip — the sonic texture is already covered by active pads
        };

        // Update GUI
        {
            if(~transactionCount.notNil) {
                ~transactionCount.string = "Transactions: %".format(~globalState.transactionCount);
            };
            if(~valueDisplay.notNil) {
                ~valueDisplay.string = "Last Value: % ETH".format(value.round(0.001));
            };
            if(~activityMeter.notNil) { ~activityMeter.refresh };
        }.defer;

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

    // Handler for Python's /eth/tx_info [hash, value, gasPrice, toAddr]
    // This arrives just after /eth/note — store the real values for the next note
    OSCdef(\ethTxInfoHandler, {|msg, time, addr, port|
        var txHash = msg[1].asString;
        var value = msg[2].asFloat;
        var gasPrice = msg[3].asFloat;

        // Store for the next /eth/note to use
        ~globalState.lastValue = value;
        ~globalState.lastGasPrice = gasPrice;
        ~globalState.lastHash = txHash;
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
    ~oscToParamMap = Dictionary.newFrom([
        // ── Core Performance (Row 1) ─────────────────────────────────────
        "/soneth/volume", \masterVolume,
        "/soneth/pitchshift", \pitchShift,
        "/soneth/timedilation", \timeDilation,
        "/soneth/spectralshift", \spectralShift,
        "/soneth/spatialspread", \spatialSpread,
        // ── Ambient Processing (Row 2) ───────────────────────────────────
        "/soneth/texturedepth", \textureDepth,
        "/soneth/atmospheremix", \atmosphereMix,
        "/soneth/memoryfeed", \memoryFeed,
        "/soneth/harmonicrich", \harmonicRich,
        "/soneth/resonantbody", \resonantBody,
        // ── Drone/Noise Controls (Row 3) — echo to browser for visual sync
        "/soneth/masteramp", \masterAmp,
        "/soneth/filtercutoff", \filterCutoff,
        "/soneth/noiselevel", \noiseLevel,
        "/soneth/noisefilt", \noiseFilt,
        "/soneth/dronedepth", \droneDepth,
        // ── Additional Controls (Row 4) ──────────────────────────────────
        "/soneth/dronefade", \droneFade,
        "/soneth/dronespace", \droneSpace,
        "/soneth/dronemix", \droneMix,
        "/soneth/delayfeedback", \delayFeedback,
        "/soneth/txinfluence", \transactionInfluence,
        // ── FX Chain backups/alternates ───────────────────────────────────
        "/parliament/fx/reverb", \atmosphereMix,
        "/parliament/fx/room", \droneSpace,
        "/parliament/fx/delaytime", \timeDilation,
        "/parliament/fx/decaytime", \delayFeedback
    ]);

    ~oscToParamMap.keysValuesDo { |oscPath, paramName|
        OSCdef(paramName, { |msg|
            var val = msg[1].asFloat;
            
            // 1. Update the control bus if it exists
            if(~buses.notNil and: { ~buses[paramName].notNil }) {
                ~buses[paramName].set(val);
            };
            
            // 2. Update the internal state value
            if(~controlValues.notNil) {
                ~controlValues[paramName] = val;
            };
            
            // 3. Update the UI Knob visually (MUST be deferred to AppClock)
            {
                if(~knobViews.notNil and: { ~knobViews[paramName].notNil }) {
                    var spec = ~controlSpecs[paramName];
                    if(spec.notNil) {
                        ~knobViews[paramName].value = spec.unmap(val);
                    };
                };
                if(~controlLabels.notNil and: { ~controlLabels[paramName].notNil }) {
                    // Get string case by looking at knob names
                    var displayStr = paramName.asString;
                    displayStr = displayStr[0].toUpper ++ displayStr[1..];
                    ~controlLabels[paramName].string = displayStr ++ ": " ++ val.round(0.001);
                };
            }.defer;
            
        }, oscPath);
    };

    // ── Beat engine params (stored in ~beatParams, not ~buses) ─────────
    // These come from the HTML sonETH sliders but need special routing.
    OSCdef(\beatTempoOSC, { |msg|
        var val = msg[1].asFloat;
        // HTML slider sends 0–1; map to 0.5–2.0 tempo
        var tempo = val.linexp(0.001, 1, 0.5, 2.0);
        if(~beatParams.notNil) { ~beatParams.beatTempo = tempo };
        "Beat Tempo set to % (raw %)".format(tempo.round(0.01), val.round(0.01)).postln;
    }, "/soneth/beatTempo");

    OSCdef(\txInfluenceOSC, { |msg|
        var val = msg[1].asFloat;
        if(~beatParams.notNil) { ~beatParams.transactionInfluence = val };
        // Also update the control bus if it exists
        if(~buses.notNil and: { ~buses[\transactionInfluence].notNil }) {
            ~buses[\transactionInfluence].set(val);
        };
    }, "/soneth/txInfluence");

    // ── Parliament Vote / Emergency / Start / Stop handlers ────────────
    // These arrive from the browser buttons via the bridge.
    // They affect the beat engine, drone, and echo back to visuals.

    OSCdef(\voteHandler, { |msg|
        var consensus, passed;
        // Vote triggers a sonic event: tempo burst + harmonic bell chord
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
        "Parliament START — restoring beat engine".postln;
        // Re-engage beat engine at normal tempo
        if(~beatParams.notNil) {
            ~beatParams.beatTempo = 1.0;
            ~beatParams.masterAmp = 0.7;
        };
        if(~opalDroneSynth.notNil) {
            ~opalDroneSynth.set(\freq, 55, \amp, 0.4);
        };
    }, "/parliament/start");

    OSCdef(\stopHandler, { |msg|
        "Parliament STOP — fading out".postln;
        // Fade beat engine to near silence
        if(~beatParams.notNil) {
            ~beatParams.masterAmp = 0.05;
        };
        if(~opalDroneSynth.notNil) {
            ~opalDroneSynth.set(\amp, 0.02);
        };
    }, "/parliament/stop");

    "OSC Handlers initialized:".postln;
    "- Listening on port: %".format(NetAddr.langPort).postln;
    "- Transaction sonification & Front-End OSC mappings ready".postln;
    "- Parliament vote/emergency/start/stop handlers active".postln;
    "- Use ~testSound.value; to test audio".postln;
    "- Use ~startOSCMonitor.value; to debug OSC".postln;
});
)