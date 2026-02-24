// Parliament of All Things - With Working GUI
// Based on your working sonETH GUI patterns
// Current Date: 2025-08-27

(
{
    var success = true;
    var statusView, counterView, controlView, controlViewRow2;
    var mainTheme, backgroundColor, textColor, accentColor;

    try {
        "Loading Parliament of All Things with GUI...".postln;
        
        // Initialize parliament (like sonETH)
        ~parliament = ();
        
        // Control buses (like sonETH)
        ~controlBuses = ~controlBuses ?? (
            consensusLevel: Bus.control(s, 1).set(0.5),
            speciesPresence: Bus.control(s, 1).set(0.6),
            masterVolume: Bus.control(s, 1).set(0.7),
            rotationSpeed: Bus.control(s, 1).set(1.0),
            totalVotes: Bus.control(s, 1).set(26),
            grainDensity: Bus.control(s, 1).set(10),
            harmonicCount: Bus.control(s, 1).set(5)
        );
        
        // Local value storage to avoid getSynchronous calls
        ~localValues = ~localValues ?? (
            consensusLevel: 0.5,
            speciesPresence: 0.6,
            masterVolume: 0.7,
            rotationSpeed: 1.0,
            totalVotes: 26,
            grainDensity: 10,
            harmonicCount: 5
        );
        
        // Audio buses
        ~audioBuses = ~audioBuses ?? (
            main: Bus.audio(s, 2),
            species: Bus.audio(s, 2),
            consensus: Bus.audio(s, 2)
        );
        
        // Parliament theme (oceanic colors)
        mainTheme = (
            background: Color.fromHexString("#1E1E2E"),
            foreground: Color.fromHexString("#CDD6F4"),
            accent: Color.fromHexString("#89B4FA"),
            green: Color.fromHexString("#A6E3A1"),
            red: Color.fromHexString("#F38BA8"),
            yellow: Color.fromHexString("#F9E2AF"),
            purple: Color.fromHexString("#CBA6F7"),
            species: Color.fromHexString("#80ed99"),
            consensus: Color.fromHexString("#20b2aa")
        );

        backgroundColor = mainTheme.background;
        textColor = mainTheme.foreground;
        accentColor = mainTheme.accent;
        
        // Enhanced synthesis definitions
        SynthDef(\parliamentSpecies, {
            arg freq=220, amp=0.3, atk=0.01, dec=0.3, rel=0.5, 
            species=0, presence=0.6, activity=0.5, out=0;
            
            var env, sig, mod, carrier, grains, filter;
            
            // Get control values
            var masterVol = In.kr(~controlBuses.masterVolume, 1);
            var speciesControl = In.kr(~controlBuses.speciesPresence, 1);
            var grainDens = In.kr(~controlBuses.grainDensity, 1);
            
            // Complex granular synthesis for each species
            mod = SinOsc.ar(freq * (1.5 + (species * 0.1))) * 0.3 * freq;
            carrier = SinOsc.ar(freq + mod);
            
            // Granular texture
            grains = Mix.fill(4, { |i|
                var grainFreq = freq * (1 + (i * 0.02));
                var grainAmp = LFNoise1.kr(activity + 0.1).range(0.1, 1);
                SinOsc.ar(grainFreq, mul: grainAmp * (grainDens * 0.1))
            });
            
            // Species-specific filtering
            filter = switch(species,
                0, { BPF.ar(carrier + (grains * 0.3), freq * 2, 0.3) }, // Ara macao - bright
                1, { LPF.ar(carrier + (grains * 0.5), freq * 4) }, // Atlapetes - filtered
                2, { HPF.ar(carrier + (grains * 0.4), freq * 0.5) }, // Cecropia - high
                3, { BRF.ar(carrier + (grains * 0.6), freq * 1.5, 0.4) }, // Alouatta - notched
                4, { AllpassN.ar(carrier + (grains * 0.2), 0.2, 0.1, 2) } // Tinamus - delayed
            );
            
            // Envelope with species timing variation
            env = EnvGen.kr(
                Env.new(
                    [0, 1, 0.5, 0],
                    [atk, dec * (1 + (species * 0.2)), rel * (1 + (species * 0.3))],
                    [-4, -2, -4]
                ),
                doneAction: 2
            );
            
            sig = filter * env * amp * presence * speciesControl * masterVol;
            
            Out.ar(out, sig ! 2);
        }).add;
        
        SynthDef(\parliamentConsensus, {
            arg freq=110, amp=0.2, out=0;
            
            var sig, harmonics, modulation, envelope;
            var consensus = In.kr(~controlBuses.consensusLevel, 1);
            var rotation = In.kr(~controlBuses.rotationSpeed, 1);
            var harmCount = In.kr(~controlBuses.harmonicCount, 1);
            var masterVol = In.kr(~controlBuses.masterVolume, 1);
            
            // Democratic harmonics - more consensus = more stable harmony
            harmonics = Mix.fill(5, { |i|
                var harmFreq = freq * (i + 1);
                var harmAmp = consensus * (consensus * (i * 0.1 + 0.5)) * 0.15;
                var stability = consensus.linlin(0, 1, 0.02, 0.001);
                SinOsc.ar(harmFreq + LFNoise1.kr(stability).range(-2, 2), mul: harmAmp)
            });
            
            // Parliament rotation modulation
            modulation = LFTri.kr(rotation * 0.008).range(0.7, 1.0);
            envelope = LFSaw.kr(rotation * 0.02).range(0.8, 1.0);
            
            sig = harmonics * amp * modulation * envelope * masterVol;
            
            Out.ar(out, sig ! 2);
        }).add;
        
        // Wait for synths to compile, then create GUI (exactly like sonETH)
        Task({
            2.wait;
            
            // Create main window (exactly like sonETH)
            ~mainWindow = Window("Parliament of All Things Control", Rect(100, 100, 640, 500))
                .background_(backgroundColor);

            ~mainWindow.view.layout_(VLayout().margins_(15).spacing_(15));

            // Header (like sonETH)
            ~header = StaticText()
                .string_("Parliament of All Things")
                .font_(Font("Helvetica", 24, true))
                .align_(\center)
                .stringColor_(mainTheme.purple);

            // Status view (exactly like sonETH)
            statusView = View().background_(backgroundColor.blend(Color.black, 0.2))
                .layout_(HLayout().margins_(15).spacing_(20));
            counterView = View().background_(backgroundColor.blend(Color.black, 0.2))
                .layout_(HLayout().margins_(15).spacing_(20));
            controlView = View().background_(backgroundColor.blend(Color.black, 0.1))
                .layout_(HLayout().margins_(15).spacing_(20));
            controlViewRow2 = View().background_(backgroundColor.blend(Color.black, 0.1))
                .layout_(HLayout().margins_(15).spacing_(20));

            // Status light function (exactly from sonETH)
            ~makeStatusLight = { |label|
                var container, indicator, labelText;

                container = View().background_(backgroundColor);
                container.layout_(VLayout().margins_(5).spacing_(5));

                indicator = UserView(container)
                    .fixedSize_(20, 20)
                    .drawFunc_({ |uview|
                        var state = uview.getProperty(\status) ? 0;
                        Pen.fillColor = if(state == 1) { mainTheme.green } { mainTheme.red };
                        Pen.addOval(Rect(2, 2, 16, 16));
                        Pen.fill;
                    });

                labelText = StaticText()
                    .string_(label)
                    .stringColor_(textColor)
                    .font_(Font("Helvetica", 14))
                    .minWidth_(80);

                container.layout.add(labelText);
                container.layout.add(indicator);
                indicator.setProperty(\status, 0);
                indicator;
            };

            // Status indicators (adapted for Parliament)
            ~statusLights = (
                species: ~makeStatusLight.value("Species:"),
                consensus: ~makeStatusLight.value("Consensus:"),
                democracy: ~makeStatusLight.value("Democracy:")
            );

            ~statusLights.keysValuesDo({ |key, light|
                statusView.layout.add(light.parent);
            });

            // Counter function (exactly from sonETH)
            ~makeCounter = { |label|
                var container, counter, labelText;

                container = View().background_(backgroundColor);
                container.layout_(HLayout().margins_(5).spacing_(10));

                counter = NumberBox()
                    .enabled_(false)
                    .background_(mainTheme.background.blend(Color.black, 0.3))
                    .normalColor_(mainTheme.yellow)
                    .typingColor_(mainTheme.yellow)
                    .stringColor_(mainTheme.yellow)
                    .font_(Font("Helvetica", 14, true))
                    .align_(\center)
                    .minWidth_(60);

                labelText = StaticText()
                    .string_(label)
                    .stringColor_(textColor)
                    .font_(Font("Helvetica", 14))
                    .minWidth_(80);

                container.layout.add(labelText);
                container.layout.add(counter);
                counter;
            };

            // Parliament counters
            ~counters = (
                consensus: ~makeCounter.value("Consensus %:"),
                votes: ~makeCounter.value("Total Votes:"),
                species: ~makeCounter.value("Active Species:")
            );

            ~counters.keysValuesDo({ |key, counter|
                counterView.layout.add(counter.parent);
            });

            // Control sliders (like sonETH)
            ~makeSlider = { |label, spec, busKey, action|
                var container, slider, labelText, valueDisplay;
                
                container = View().background_(backgroundColor);
                container.layout_(VLayout().margins_(5).spacing_(5));
                
                labelText = StaticText()
                    .string_(label)
                    .stringColor_(textColor)
                    .font_(Font("Helvetica", 12))
                    .align_(\center);
                
                slider = Slider()
                    .orientation_(\horizontal)
                    .value_(spec.unmap(spec.default))
                    .background_(backgroundColor.blend(Color.black, 0.3))
                    .knobColor_(mainTheme.accent)
                    .action_({ |sl|
                        var val = spec.map(sl.value);
                        ~controlBuses[busKey].set(val);
                        action.value(val);
                    });
                
                valueDisplay = StaticText()
                    .string_(spec.default.asString)
                    .stringColor_(mainTheme.yellow)
                    .font_(Font("Helvetica", 10))
                    .align_(\center);
                
                container.layout.add(labelText);
                container.layout.add(slider);
                container.layout.add(valueDisplay);
                [container, slider, valueDisplay];
            };

            // Parliament controls
            ~sliders = (
                speciesPresence: ~makeSlider.value("Species Presence", 
                    ControlSpec(0.0, 1.0, \lin, 0.01, 0.6), \speciesPresence, 
                    { |val| ~sliders.speciesPresence[2].string_(val.round(0.01)) }),
                    
                consensusLevel: ~makeSlider.value("Consensus Level", 
                    ControlSpec(0.0, 1.0, \lin, 0.01, 0.5), \consensusLevel,
                    { |val| ~sliders.consensusLevel[2].string_(val.round(0.01)) }),
                    
                rotationSpeed: ~makeSlider.value("Parliament Rotation", 
                    ControlSpec(0.1, 3.0, \lin, 0.1, 1.0), \rotationSpeed,
                    { |val| ~sliders.rotationSpeed[2].string_(val.round(0.1)) }),
                    
                masterVolume: ~makeSlider.value("Master Volume", 
                    ControlSpec(0.0, 1.0, \lin, 0.01, 0.7), \masterVolume,
                    { |val| ~sliders.masterVolume[2].string_(val.round(0.01)) })
            );

            ~sliders.keysValuesDo({ |key, sliderArray|
                controlView.layout.add(sliderArray[0]);
            });

            // Control buttons (like sonETH)
            ~startButton = Button()
                .states_([
                    ["Start Parliament", mainTheme.foreground, mainTheme.green.alpha_(0.3)],
                    ["Stop Parliament", mainTheme.foreground, mainTheme.red.alpha_(0.3)]
                ])
                .font_(Font("Helvetica", 14, true))
                .action_({ |btn|
                    if(btn.value == 1) {
                        ~startParliament.value;
                    } {
                        ~stopParliament.value;
                    };
                });

            ~voteButton = Button()
                .states_([["Simulate Vote", mainTheme.foreground, mainTheme.accent.alpha_(0.3)]])
                .font_(Font("Helvetica", 14, true))
                .action_({ ~simulateVote.value; });

            controlViewRow2.layout.add(~startButton);
            controlViewRow2.layout.add(~voteButton);
            controlViewRow2.layout.addStretch();

            // Add all views (exactly like sonETH)
            ~mainWindow.layout.add(~header);
            ~mainWindow.layout.add(statusView);
            ~mainWindow.layout.add(counterView);
            ~mainWindow.layout.add(controlView);
            ~mainWindow.layout.add(controlViewRow2);

            // GUI update routine (like sonETH)
            ~guiRoutine = Routine({
                loop {
                    {
                        // Update status lights
                        ~statusLights.species.setProperty(\status, if(~speciesSynths.notNil, 1, 0));
                        ~statusLights.consensus.setProperty(\status, if(~consensusEngine.notNil, 1, 0));
                        ~statusLights.democracy.setProperty(\status, if(~parliament.voting == true, 1, 0));
                        
                        ~statusLights.keysValuesDo({ |key, light| light.refresh; });
                        
                        // Update counters
                        ~counters.consensus.value_((~localValues.consensusLevel * 100).round(1));
                        ~counters.votes.value_(~localValues.totalVotes);
                        ~counters.species.value_(if(~speciesSynths.notNil, ~speciesSynths.size, 0));
                        
                    }.defer;
                    0.1.wait;
                }
            }).play(AppClock);

            // Window cleanup
            ~mainWindow.onClose = {
                ~guiRoutine.stop;
                ~stopParliament.value;
                ~mainWindow = nil;
            };

            ~mainWindow.front;
            "Parliament GUI created successfully!".postln;
            
        }).start;
        
        // Parliament functions
        ~startParliament = {
            "🏛️ Starting Parliament of All Things...".postln;
            
            ~speciesSynths = [
                Synth(\parliamentSpecies, [\freq, 220, \amp, 0.15, \species, 0, \out, ~audioBuses.species.index]), // Ara macao
                Synth(\parliamentSpecies, [\freq, 330, \amp, 0.12, \species, 1, \out, ~audioBuses.species.index]), // Atlapetes  
                Synth(\parliamentSpecies, [\freq, 440, \amp, 0.10, \species, 2, \out, ~audioBuses.species.index]), // Cecropia
                Synth(\parliamentSpecies, [\freq, 165, \amp, 0.13, \species, 3, \out, ~audioBuses.species.index]), // Alouatta
                Synth(\parliamentSpecies, [\freq, 275, \amp, 0.11, \species, 4, \out, ~audioBuses.species.index])  // Tinamus
            ];
            
            ~consensusEngine = Synth(\parliamentConsensus, [\freq, 110, \amp, 0.25, \out, ~audioBuses.consensus.index]);
            
            // Mixer
            ~mixer = {
                var species = In.ar(~audioBuses.species.index, 2);
                var consensus = In.ar(~audioBuses.consensus.index, 2);
                var mix = (species * 0.6) + (consensus * 0.4);
                Out.ar(0, mix);
            }.play;
            
            "✓ Parliament active: 5 species + consensus engine".postln;
        };
        
        ~stopParliament = {
            "🏛️ Stopping Parliament...".postln;
            [~speciesSynths, ~consensusEngine, ~mixer].do({ |item|
                if(item.notNil) {
                    if(item.isKindOf(Array)) {
                        item.do(_.free);
                    } {
                        item.free;
                    };
                };
            });
            ~speciesSynths = nil; ~consensusEngine = nil; ~mixer = nil;
            "✓ Parliament stopped".postln;
        };
        
        ~simulateVote = {
            "🗳️ Democratic vote simulation...".postln;
            ~parliament.voting = true;
            ~controlBuses.consensusLevel.set(0.3 + 0.6.rand);
            Task({ 2.wait; ~parliament.voting = false; }).start;
        };
        
        "Parliament of All Things with GUI loaded!".postln;
        
    } {
        |error|
        ("Parliament loading error: " ++ error.errorString).warn;
        success = false;
    };
    
    success;
}.value;
)