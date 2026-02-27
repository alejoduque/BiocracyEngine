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
        // Core Performance
        "/soneth/volume", \masterVolume,
        "/soneth/pitchshift", \pitchShift,
        "/soneth/timedilation", \timeDilation,
        "/soneth/spectralshift", \spectralShift,
        "/soneth/spatialspread", \spatialSpread,
        // Ambient Processing
        "/soneth/texturedepth", \textureDepth,
        "/soneth/atmospheremix", \atmosphereMix,
        "/soneth/memoryfeed", \memoryFeed,
        "/soneth/harmonicrich", \harmonicRich,
        "/soneth/resonantbody", \resonantBody,
        // FX Chain backups/alternates
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

    "OSC Handlers initialized:".postln;
    "- Listening on port: %".format(NetAddr.langPort).postln;
    "- Transaction sonification & Front-End OSC mappings ready".postln;
    "- Use ~testSound.value; to test audio".postln;
    "- Use ~startOSCMonitor.value; to debug OSC".postln;
});
)