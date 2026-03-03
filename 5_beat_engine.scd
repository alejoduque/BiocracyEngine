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

// Enhanced Beat Engine with transaction influence
~beatEngine = {
    if(~beatRoutine.notNil) { ~beatRoutine.stop };
    if(~opalDroneSynth.notNil) { ~opalDroneSynth.set(\gate, 0) };
    
    // Start the continuous ambient drone immediately
    // Safe bus index helper: returns bus index or -1 if bus missing
    ~bi = { |name| if(~buses.notNil and: { ~buses[name].notNil }, { ~buses[name].index }, { -1 }) };

    ~opalDroneSynth = Synth(\opalDrone, [
        \freq, 55, // Low ambient anchor
        \amp, ~beatParams.masterAmp * 0.8,
        \masterVolBus, ~bi.(\masterVolume),
        \pitchBus,     ~bi.(\pitchShift),
        \timeBus,      ~bi.(\timeDilation),
        \spectralBus,  ~bi.(\spectralShift),
        \spatialBus,   ~bi.(\spatialSpread),
        \textureBus,   ~bi.(\textureDepth),
        \atmosphereBus,~bi.(\atmosphereMix),
        \memoryBus,    ~bi.(\memoryFeed),
        \harmonicBus,  ~bi.(\harmonicRich),
        \resonantBus,  ~bi.(\resonantBody)
    ], target: if(~defaultGroup.notNil, { ~defaultGroup }, { s.defaultGroup }));
    
    ~beatRoutine = Routine({
        var step = 0;
        var bar = 0;           // bar counter for slow evolution
        var phrase = 0;        // phrase counter (every 4 bars)
        var transactionInfluence;
        // Evolving pattern seeds — mutate every phrase
        var kickPattern   = #[1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0];
        var percDivisor   = 3;    // polyrhythmic divisor — shifts each phrase
        var dustProb      = 0.3;  // base probability for dust hits
        var droneBaseFreq = 55;   // drone pitch — drifts over time
        // Pitch pool for percussion melodic variation
        var pitchPool     = #[200, 300, 400, 500, 600, 800];
        var poolIdx       = 0;

        loop {
            var now = SystemClock.seconds;
            var timeSinceLastTx = now - (~beatParams.lastTransactionTime ? now);
            var targetGrp = if(~defaultGroup.notNil, { ~defaultGroup }, { s.defaultGroup });
            var interval;
            var density;
            var bMVol, bPitch, bTime, bSpec, bSpat, bText, bAtmo, bMem, bHarm, bRes;
            var elapsed = now % 300; // 5-minute macro cycle

            // Calculate transaction influence
            transactionInfluence = (~beatParams.transactionInfluence *
                exp(timeSinceLastTx.neg * 0.5)).clip(0, 1);

            density = ~beatParams.transactionDensity ? 0;

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
                    // Shift polyrhythmic divisor: 3→5→7→4→3...
                    percDivisor = #[3, 5, 7, 4, 6].wrapAt(phrase);
                    // Evolve dust probability with density
                    dustProb = (0.15 + (density * 0.4) + (transactionInfluence * 0.2)).clip(0.05, 0.7);
                    // Drift drone pitch: cycle through harmonically-related notes
                    droneBaseFreq = #[55, 62, 73, 82, 49, 65, 55, 41].wrapAt(phrase);
                    // Update drone pitch live
                    if(~opalDroneSynth.notNil) {
                        ~opalDroneSynth.set(\freq, droneBaseFreq);
                    };
                };
            };

            // ── 1. KICK — evolving pattern instead of fixed 0,8 ──────────────────
            if(kickPattern.wrapAt(step) == 1) {
                // Subtle frequency drift: ±5Hz per bar for organic feel
                var kickFreq = 50 + ((bar % 7) - 3 * 1.5);
                Synth(\opalKick, [
                    \out,         0,
                    \freq,        kickFreq,
                    \amp,         ~beatParams.masterAmp * (0.7 + (density * 0.3)),
                    \dec,         0.3 + (transactionInfluence * 0.3),
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
            if((step % percDivisor == 0) or: {
                (step % 5 == 0) and: { transactionInfluence > 0.3 } and: { 0.6.coin }
            }) {
                // Pick from pitch pool with slow rotation
                var percFreq = pitchPool.wrapAt(poolIdx);
                poolIdx = (poolIdx + 1) % pitchPool.size;
                // Slight random detune for humanization
                percFreq = percFreq * rrand(0.95, 1.05);

                Synth(\opalPerc, [
                    \out,         0,
                    \freq,        percFreq,
                    \amp,         ~beatParams.masterAmp * (0.4 + (transactionInfluence * 0.35)),
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

            // ── 3. DUST — probability-based, not grid-locked ─────────────────────
            if(dustProb.coin) {
                Synth(\opalDust, [
                    \out,         0,
                    \amp,         ~beatParams.masterAmp * (0.3 + (density * 0.35)),
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
            step = (step + 1) % 16;

            // Interval with micro-swing: odd steps slightly delayed for groove
            interval = (1 / (~beatParams.beatTempo * 4)) *
                       (1 - (transactionInfluence * 0.1));
            if(step.odd) { interval = interval * rrand(1.0, 1.12) }; // swing
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