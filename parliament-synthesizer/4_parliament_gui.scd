// Parliament of All Things - Native SuperCollider GUI
// Interactive Parliament Control Interface  
// Based on sonETH GUI architecture patterns
// Current Date: 2025-08-27

(
{
    var success = true;
    var statusView, agentView, consensusView, controlView;
    var mainTheme;
    
    try {
        "Loading Parliament GUI...".postln;
        
        // Parliament color theme (oceanic like SVG)
        mainTheme = (
            background: Color.fromHexString("#0f2027"),
            foreground: Color.fromHexString("#fff"), 
            accent: Color.fromHexString("#8ecae6"),
            species: Color.fromHexString("#3b82f6"),
            edna: Color.fromHexString("#ade8f4"),
            fungi: Color.fromHexString("#80ed99"),
            ai: Color.fromHexString("#56cfe1"),
            consensus: Color.fromHexString("#20b2aa")
        );

        // Create GUI in deferred execution (proper AppClock scheduling)
        {
            // Create main parliament window
            ~parliament.mainWindow = Window("Parliament of All Things - Synthesizer", 
                Rect(50, 50, 1200, 800))
                .background_(mainTheme.background);

            ~parliament.mainWindow.view.layout_(VLayout().margins_(20).spacing_(15));

            // Header
            ~parliament.header = StaticText()
                .string_("PARLIAMENT OF ALL THINGS")
                .font_(Font("Arial", 28, true))
                .align_(\center)
                .stringColor_(mainTheme.foreground);

            ~parliament.subtitle = StaticText()
                .string_("Multi-Modal Ecological Democracy Synthesizer")
                .font_(Font("Arial", 14))
                .align_(\center)
                .stringColor_(mainTheme.accent);

            // Status indicators section
            statusView = View().background_(mainTheme.background.blend(Color.black, 0.2))
                .layout_(HLayout().margins_(15).spacing_(20));
            statusView.fixedHeight = 100;

            // Agent status lights function
            ~makeParliamentStatusLight = { |label, color|
                var container, indicator, labelText;
                
                container = View().background_(mainTheme.background);
                container.layout_(VLayout().margins_(5).spacing_(5));
                
                indicator = UserView(container)
                    .fixedSize_(30, 30)
                    .drawFunc_({ |uview|
                        var state = uview.getProperty(\status) ? 0;
                        Pen.fillColor = if(state == 1) { color } { Color.red };
                        Pen.addOval(Rect(2, 2, 26, 26));
                        Pen.fill;
                        
                        // Glow effect
                        Pen.fillColor = Color.white.alpha_(0.4);
                        Pen.addOval(Rect(8, 6, 12, 8));
                        Pen.fill;
                    });
                
                labelText = StaticText()
                    .string_(label)
                    .stringColor_(mainTheme.foreground)
                    .font_(Font("Arial", 11))
                    .align_(\center);
                
                container.layout.add(indicator);
                container.layout.add(labelText);
                indicator.setProperty(\status, 0);
                [container, indicator];
            };

            // Create status lights
            ~parliament.statusLights = (
                species: ~makeParliamentStatusLight.value("Acoustic\nSpecies", mainTheme.species),
                edna: ~makeParliamentStatusLight.value("eDNA\nSites", mainTheme.edna),
                fungi: ~makeParliamentStatusLight.value("Fungi\nNetworks", mainTheme.fungi),
                ai: ~makeParliamentStatusLight.value("AI\nCore", mainTheme.ai),
                consensus: ~makeParliamentStatusLight.value("Consensus\nEngine", mainTheme.consensus)
            );

            // Add status lights to view
            ~parliament.statusLights.keysValuesDo({ |key, lightArray|
                statusView.layout.add(lightArray[0]);
            });

            // Agent control matrix
            agentView = View().background_(mainTheme.background.blend(Color.black, 0.1))
                .layout_(VLayout().margins_(15).spacing_(10));
            agentView.fixedHeight = 300;

            // Function to create agent control row
            ~makeAgentControlRow = { |agentName, color, controlSpecs|
                var container, nameLabel, controls;
                
                container = View().background_(color.blend(Color.white, 0.9))
                    .layout_(HLayout().margins_(10).spacing_(10));
                container.fixedHeight = 40;
                
                nameLabel = StaticText()
                    .string_(agentName)
                    .stringColor_(color)
                    .font_(Font("Arial", 12, true))
                    .fixedWidth_(120)
                    .align_(\left);
                
                controls = ();
                controlSpecs.keysValuesDo({ |param, spec|
                    var slider = Slider()
                        .fixedWidth_(80)
                        .fixedHeight_(25)
                        .value_(spec.unmap(spec.default))
                        .background_(mainTheme.background)
                        .knobColor_(color)
                        .action_({ |sl|
                            var mappedVal = spec.map(sl.value);
                            // Update control bus
                            if(~parliament.controlBuses[param].notNil) {
                                ~parliament.controlBuses[param].set(mappedVal);
                            };
                        });
                    
                    controls[param] = slider;
                    container.layout.add(slider);
                });
                
                container.layout.add(nameLabel);
                container.layout.addSpacing(10);
                [container, controls];
            };

            // Agent control specifications
            ~parliament.agentControlSpecs = (
                "Acoustic Species": (
                    acousticPresence: ControlSpec(0.0, 1.0, \lin, 0.01, 0.6)
                ),
                "eDNA Sites": (
                    ednaValidation: ControlSpec(0.0, 1.0, \lin, 0.01, 0.88)
                ),
                "Fungi Networks": (
                    fungiChemical: ControlSpec(0.0, 1.0, \lin, 0.01, 0.5)
                ),
                "AI Core": (
                    aiConsciousness: ControlSpec(0.0, 1.0, \lin, 0.01, 0.8)
                )
            );

            // Create agent control rows
            ~parliament.agentControls = ();
            [
                ["Acoustic Species", mainTheme.species],
                ["eDNA Sites", mainTheme.edna], 
                ["Fungi Networks", mainTheme.fungi],
                ["AI Core", mainTheme.ai]
            ].do({ |agentInfo|
                var agentName = agentInfo[0];
                var color = agentInfo[1];
                var specs = ~parliament.agentControlSpecs[agentName];
                var rowData = ~makeAgentControlRow.value(agentName, color, specs);
                
                ~parliament.agentControls[agentName] = rowData[1];
                agentView.layout.add(rowData[0]);
            });

            // Consensus control section
            consensusView = View().background_(mainTheme.consensus.blend(Color.black, 0.9))
                .layout_(HLayout().margins_(15).spacing_(20));
            consensusView.fixedHeight = 120;

            // Consensus level display
            ~parliament.consensusDisplay = UserView()
                .fixedWidth_(200)
                .drawFunc_({ |uview|
                    var consensus = uview.getProperty(\consensus) ? 0.5;
                    
                    // Background circle
                    Pen.fillColor = mainTheme.background;
                    Pen.addOval(Rect(10, 10, 180, 100));
                    Pen.fill;
                    
                    // Consensus arc
                    Pen.strokeColor = mainTheme.consensus;
                    Pen.width = 8;
                    Pen.addArc(Point(100, 60), 70, 0, consensus * 2 * pi);
                    Pen.stroke;
                    
                    // Consensus text
                    Pen.stringCenteredIn(
                        "Consensus\n" ++ (consensus * 100).round ++ "%",
                        Rect(30, 40, 140, 40),
                        Font("Arial", 14, true),
                        mainTheme.foreground
                    );
                });
            
            ~parliament.consensusDisplay.setProperty(\consensus, 0.5);

            // Parliament rotation control
            ~parliament.rotationSlider = Slider()
                .orientation_(\vertical)
                .fixedWidth_(30)
                .value_(0.5)
                .background_(mainTheme.background)
                .knobColor_(mainTheme.consensus)
                .action_({ |sl|
                    var rotSpeed = sl.value * 1.9 + 0.1;
                    ~parliament.controlBuses.rotationSpeed.set(rotSpeed);
                    if(~updateRotationSpeed.notNil) {
                        ~updateRotationSpeed.value(rotSpeed);
                    };
                });

            // Vote counter
            ~parliament.voteCounter = NumberBox()
                .fixedWidth_(100)
                .background_(mainTheme.background)
                .normalColor_(mainTheme.foreground)
                .font_(Font("Arial", 18, true))
                .align_(\center)
                .enabled_(false);

            consensusView.layout.add(~parliament.consensusDisplay);
            consensusView.layout.add(
                VLayout().add(
                    StaticText().string_("Rotation\nSpeed").stringColor_(mainTheme.foreground).align_(\center)
                ).add(~parliament.rotationSlider)
            );
            consensusView.layout.add(
                VLayout().add(
                    StaticText().string_("Total\nVotes").stringColor_(mainTheme.foreground).align_(\center)
                ).add(~parliament.voteCounter)
            );

            // Master controls
            controlView = View().background_(mainTheme.background.blend(Color.black, 0.2))
                .layout_(HLayout().margins_(15).spacing_(20));
            controlView.fixedHeight = 80;

            // Master volume
            ~parliament.masterVolume = Slider()
                .orientation_(\horizontal)
                .fixedWidth_(150)
                .value_(0.7)
                .background_(mainTheme.background)
                .knobColor_(mainTheme.accent)
                .action_({ |sl|
                    ~parliament.controlBuses.masterVolume.set(sl.value);
                });

            // Start/Stop buttons
            ~parliament.startButton = Button()
                .states_([
                    ["Start Parliament", mainTheme.foreground, Color.green.blend(Color.black, 0.7)],
                    ["Stop Parliament", mainTheme.foreground, Color.red.blend(Color.black, 0.7)]
                ])
                .fixedWidth_(120)
                .action_({ |btn|
                    if(btn.value == 1) {
                        if(~startParliament.notNil) { ~startParliament.value };
                    } {
                        if(~stopParliament.notNil) { ~stopParliament.value };
                    };
                });

            controlView.layout.add(
                VLayout().add(
                    StaticText().string_("Master Volume").stringColor_(mainTheme.foreground).align_(\center)
                ).add(~parliament.masterVolume)
            );
            controlView.layout.add(~parliament.startButton);
            controlView.layout.addStretch();

            // Add all views to main window
            ~parliament.mainWindow.layout.add(~parliament.header);
            ~parliament.mainWindow.layout.add(~parliament.subtitle);
            ~parliament.mainWindow.layout.add(statusView);
            ~parliament.mainWindow.layout.add(agentView);
            ~parliament.mainWindow.layout.add(consensusView);
            ~parliament.mainWindow.layout.add(controlView);

            // GUI update routine
            ~parliament.guiRoutine = Routine({
                loop {
                    {
                        // Update status lights
                        ~parliament.statusLights.keysValuesDo({ |key, lightArray|
                            var indicator = lightArray[1];
                            var status = switch(key,
                                \species, { (~parliament.agents.acousticSpecies.any({ |agent| agent.synth.notNil })).binaryValue },
                                \edna, { (~parliament.agents.ednaSites.any({ |agent| agent.synth.notNil })).binaryValue },
                                \fungi, { (~parliament.agents.fungiNetworks.any({ |agent| agent.synth.notNil })).binaryValue },
                                \ai, { (~parliament.agents.aiCore[0].synth.notNil).binaryValue },
                                \consensus, { (~parliament.consensusEngine.notNil).binaryValue }
                            );
                            indicator.setProperty(\status, status);
                            indicator.refresh;
                        });
                        
                        // Update consensus display
                        ~parliament.consensusDisplay.setProperty(\consensus, 
                            ~parliament.localValues.consensusLevel);
                        ~parliament.consensusDisplay.refresh;
                        
                        // Update vote counter
                        ~parliament.voteCounter.value_(~parliament.localValues.totalVotes);
                        
                    }.defer;
                    0.05.wait; // 20Hz refresh rate
                }
            }).play(AppClock);

            // Window cleanup
            ~parliament.mainWindow.onClose = {
                ~parliament.guiRoutine.stop;
                if(~stopParliament.notNil) { ~stopParliament.value };
                ~parliament.guiRoutine = nil;
                ~parliament.mainWindow = nil;
            };

            ~parliament.mainWindow.front;
            ~parliament.status.gui = true;
            "Parliament GUI loaded successfully.".postln;
            
        }.defer; // Proper AppClock scheduling
        
    } {
        |error|
        ~handleParliamentError.value(error, "gui");
        success = false;
    };
    
    success;
}.value;
)