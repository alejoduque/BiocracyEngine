// SuperCollider Ethereum Sonification - GUI System (Enhanced)
// Current Date and Time (UTC): 2025-08-31 21:50:00
// Current User's Login: alejoduque

(
// Defer all GUI creation to AppClock to avoid Qt threading issues
{
    var statusView, counterView, controlView, controlViewRow2, controlViewRow3, controlViewRow4;
    var sampleView, sampleControlView, sampleHeader, sampleButtonView, stopButton;
    var container, recordingView;
    var mainTheme, accentColor, backgroundColor, textColor;
    
    "Creating enhanced GUI with oscilloscope styling...".postln;

    try {
        
        // Define theme colors — matched to nw_wrld parliament.html amber palette
        mainTheme = (
            background: Color.fromHexString("#000804"),     // --bg
            foreground: Color(1, 0.533, 0, 0.85),          // --text (amber rgba)
            accent: Color.fromHexString("#ff8800"),         // --amber
            green: Color.fromHexString("#44ff66"),          // parliament green indicators
            red: Color(1, 0.235, 0, 0.85),                 // --red-alert
            yellow: Color.fromHexString("#ffcc44"),         // --amber-bright
            purple: Color.fromHexString("#ffcc44"),         // headers use amber-bright (was purple)
            dim: Color.fromHexString("#663300"),            // --amber-dim
            border: Color(1, 0.533, 0, 0.25)               // --border
        );

        backgroundColor = mainTheme.background;
        textColor = mainTheme.foreground;
        accentColor = mainTheme.accent;

        // Create and store window with enhanced styling (larger for merged controls + samples + recording)
        ~mainWindow = Window("SøNETH — BiocracyEngine Control", Rect(100, 100, 1100, 1120))
            .background_(backgroundColor);

        ~mainWindow.view.layout_(VLayout().margins_(15).spacing_(15));

        // Create header
        ~header = StaticText()
            .string_("SøNETH — BIOCRACY ENGINE")
            .font_(Font("Helvetica", 22, true))
            .align_(\center)
            .stringColor_(mainTheme.yellow);

        // Create main container views for merged controls + samples
        statusView = View().background_(backgroundColor.blend(mainTheme.accent, 0.03))
            .layout_(HLayout().margins_(15).spacing_(20));
        counterView = View().background_(backgroundColor.blend(mainTheme.accent, 0.03))
            .layout_(HLayout().margins_(15).spacing_(20));
        controlView = View().background_(backgroundColor.blend(mainTheme.accent, 0.05))
            .layout_(HLayout().margins_(15).spacing_(20));
        controlViewRow2 = View().background_(backgroundColor.blend(mainTheme.accent, 0.05))
            .layout_(HLayout().margins_(15).spacing_(20));
        controlViewRow3 = View().background_(backgroundColor.blend(mainTheme.accent, 0.04))
            .layout_(HLayout().margins_(15).spacing_(20));
        controlViewRow4 = View().background_(backgroundColor.blend(mainTheme.accent, 0.04))
            .layout_(HLayout().margins_(15).spacing_(20));
        
        // Create sample views
        sampleView = View().background_(backgroundColor.blend(mainTheme.accent, 0.04))
            .layout_(VLayout().margins_(15).spacing_(10));
        sampleControlView = View().background_(backgroundColor.blend(Color.black, 0.1))
            .layout_(HLayout().margins_(15).spacing_(15));

        // Set fixed heights for sections
        [statusView, counterView].do { |view| view.fixedHeight = 80; };
        [controlView, controlViewRow2, controlViewRow3, controlViewRow4].do { |view| 
            view.fixedHeight = 120; 
        };
        sampleView.fixedHeight = 180;
        sampleControlView.fixedHeight = 120;

        // Status indicator function with oscilloscope styling
        ~makeStatusLight = { |label|
            var container, indicator, labelText;

            container = View().background_(backgroundColor);
            container.layout_(HLayout().margins_(5).spacing_(10));

            indicator = UserView(container)
                .maxHeight_(18)
                .maxWidth_(18)
                .drawFunc_({ |uview|
                    var state = uview.getProperty(\status) ? 0;
                    Pen.fillColor = if(state == 1) { mainTheme.green } { mainTheme.red };
                    Pen.addOval(Rect(1, 1, 16, 16));
                    Pen.fill;

                    // Add oscilloscope-style glow effect
                    Pen.fillColor = Color.white.alpha_(0.3);
                    Pen.addOval(Rect(4, 3, 6, 5));
                    Pen.fill;
                });

            labelText = StaticText()
                .string_(label)
                .stringColor_(textColor)
                .font_(Font("Helvetica", 12))  // 2px smaller
                .minWidth_(80);

            container.layout.add(labelText);
            container.layout.add(indicator);
            indicator.setProperty(\status, 0);
            indicator;
        };

        // Create status indicators
        ~statusLights = (
            server: ~makeStatusLight.value("Server:"),
            beat: ~makeStatusLight.value("Beat Engine:"),
            osc: ~makeStatusLight.value("OSC:"),
            midi: ~makeStatusLight.value("MIDI:")
        );

        // Add status lights
        ~statusLights.keysValuesDo({ |key, light|
            statusView.layout.add(light.parent);
        });

        // Counter function with oscilloscope styling
        ~makeCounter = { |label|
            var container, counter, labelText;

            container = View().background_(backgroundColor);
            container.layout_(HLayout().margins_(5).spacing_(10));

            counter = NumberBox()
                .enabled_(false)
                .background_(backgroundColor.blend(mainTheme.accent, 0.08))
                .normalColor_(mainTheme.yellow)
                .stringColor_(mainTheme.yellow)
                .font_(Font("Monaco", 14, true))
                .align_(\center)
                .minWidth_(60);

            labelText = StaticText()
                .string_(label)
                .stringColor_(textColor)
                .font_(Font("Helvetica", 12))  // 2px smaller
                .minWidth_(80);

            container.layout.add(labelText);
            container.layout.add(counter);
            counter;
        };

        // Create counters
        ~counters = (
            notes: ~makeCounter.value("Notes:"),
            beats: ~makeCounter.value("Beats:"),
            trans: ~makeCounter.value("Trans:"),
            midi: ~makeCounter.value("MIDI:")
        );

        // Add counters
        ~counters.keysValuesDo({ |key, counter|
            counterView.layout.add(counter.parent);
        });

        // Control specs for MERGED ambient + drone/noise controls - EXPANDED RANGES
        ~controlSpecs = ~controlSpecs ?? (
            // Lawrence English Ambient Controls (expanded for real-time performance)
            masterVolume: ControlSpec(0.01, 1, \lin),   // Allow near-silence but not complete mute
            pitchShift: ControlSpec(-24, 24, \lin),     // ±2 octaves for dramatic pitch blending
            timeDilation: ControlSpec(0.5, 6, \exp),    // More dramatic time stretching
            spectralShift: ControlSpec(80, 8000, \exp), // Full audible filter range
            spatialSpread: ControlSpec(-1, 1, \lin),
            textureDepth: ControlSpec(0, 0.6, \lin),    // More texture range for performance
            atmosphereMix: ControlSpec(0, 0.9, \lin),   // More reverb range
            memoryFeed: ControlSpec(0, 0.8, \lin),      // More delay feedback range
            harmonicRich: ControlSpec(0.1, 8, \exp),    // Wider FM ratio range for performance
            resonantBody: ControlSpec(0.1, 0.8, \lin),  // More filter resonance range
            
            // Existing Drone/Noise Controls
            masterAmp: ControlSpec(0, 1, \lin),
            filterCutoff: ControlSpec(0, 1, \lin),
            noiseLevel: ControlSpec(0, 0.5, \lin),
            noiseFilt: ControlSpec(0, 1, \lin),
            droneDepth: ControlSpec(0, 1, \lin),
            droneFade: ControlSpec(0.1, 5, \exp),
            droneSpace: ControlSpec(0, 1, \lin),
            droneMix: ControlSpec(0, 1, \lin),
            delayFeedback: ControlSpec(0, 0.95, \lin),
            transactionInfluence: ControlSpec(0, 1, \lin)
        );

        // Initialize control values for MERGED ambient + drone/noise controls
        ~controlValues = ~controlValues ?? (
            // Lawrence English Ambient Controls
            masterVolume: 0.3,
            pitchShift: 0.0,     // Start at original pitch
            timeDilation: 2.0,
            spectralShift: 1000,
            spatialSpread: 0.0,
            textureDepth: 0.2,
            atmosphereMix: 0.4,
            memoryFeed: 0.3,
            harmonicRich: 1.0,
            resonantBody: 0.4,
            
            // Existing Drone/Noise Controls
            masterAmp: 0.7,
            filterCutoff: 0.6,
            noiseLevel: 0.1,
            noiseFilt: 0.5,
            droneDepth: 0.3,
            droneFade: 2.0,
            droneSpace: 0.5,
            droneMix: 0.5,
            delayFeedback: 0.3,
            transactionInfluence: 0.3
        );

        // Knob parameters layout - MERGED ambient + drone/noise controls
        ~knobParameters = [
            // Row 1: Core Performance Controls (Lawrence English Ambient)
            [\masterVolume, \pitchShift, \timeDilation, \spectralShift, \spatialSpread],
            // Row 2: Ambient Processing  
            [\textureDepth, \atmosphereMix, \memoryFeed, \harmonicRich, \resonantBody],
            // Row 3: Drone/Noise Controls (Existing System)
            [\masterAmp, \filterCutoff, \noiseLevel, \noiseFilt, \droneDepth],
            // Row 4: Additional Drone Controls
            [\droneFade, \droneSpace, \droneMix, \delayFeedback, \transactionInfluence]
        ];

        // Enhanced knob function with oscilloscope aesthetics
        ~makeKnob = { |label, minVal, maxVal, defaultVal=0.5, mapping=\lin|
            var container, knobContainer, spec, knob, displayStr, valueLabel, paramName;

            container = View().background_(backgroundColor);
            container.layout_(VLayout().margins_(5).spacing_(5));

            knobContainer = View().background_(backgroundColor);
            knobContainer.layout_(HLayout().margins_(0).spacing_(0));

            spec = ControlSpec(minVal, maxVal, mapping);
            knob = Knob()
                .maxHeight_(80)
                .maxWidth_(80)
                .mode_(\vert)
                .color_([mainTheme.background, accentColor, mainTheme.foreground, mainTheme.foreground.alpha_(0.2)])
                .value_(spec.unmap(defaultVal));

            displayStr = label.asString;
            displayStr = displayStr[0].toUpper ++ displayStr[1..];

            valueLabel = StaticText()
                .string_(displayStr ++ ": " ++ defaultVal.round(0.001))
                .stringColor_(textColor)
                .font_(Font("Monaco", 10))  // 2px smaller
                .align_(\center);

            knobContainer.layout.add(knob);
            container.layout.add(knobContainer);
            container.layout.add(valueLabel);

            // Define parameter name for both action and storage
            paramName = label.asSymbol;  // Use exact parameter name (already camelCase)
            
            // Knob action with bus updates
            knob.action = { |k|
                var mappedVal = spec.map(k.value);
                "GUI Knob % moved: value=%, bus exists: %".format(
                    paramName, mappedVal.round(0.001), 
                    (~buses.notNil and: {~buses[paramName].notNil})
                ).postln;
                if(~buses.notNil and: {~buses[paramName].notNil}) {
                    ~buses[paramName].set(mappedVal);
                    ~controlValues[paramName] = mappedVal;
                    valueLabel.string = displayStr ++ ": " ++ mappedVal.round(0.001);
                    
                    // Echo back to HTML GUI if bridge is connected
                    if(~visualsDest.notNil and: { ~oscToParamMap.notNil }) {
                        var oscPath = ~oscToParamMap.findKeyForValue(paramName);
                        if(oscPath.notNil) {
                            ~visualsDest.sendMsg(oscPath, mappedVal);
                        };
                    };
                    
                    "Bus % set to %".format(paramName, mappedVal.round(0.001)).postln;
                } {
                    "WARNING: Bus % not found!".format(paramName).warn;
                };
            };

            // Store references
            ~controlLabels = ~controlLabels ?? ();
            ~controlLabels[paramName] = valueLabel;
            ~knobViews = ~knobViews ?? ();
            ~knobViews[paramName] = knob;

            container;
        };

        // Create control knobs
        ~knobs = ();
        
        // First row knobs
        ~knobParameters[0].do { |key|
            ~knobs[key] = ~makeKnob.value(
                key.asString,
                ~controlSpecs[key].minval,
                ~controlSpecs[key].maxval,
                ~controlValues[key],
                ~controlSpecs[key].warp
            );
            controlView.layout.add(~knobs[key]);
        };

        // Second row knobs
        ~knobParameters[1].do { |key|
            ~knobs[key] = ~makeKnob.value(
                key.asString,
                ~controlSpecs[key].minval,
                ~controlSpecs[key].maxval,
                ~controlValues[key],
                ~controlSpecs[key].warp
            );
            controlViewRow2.layout.add(~knobs[key]);
        };

        // Third row knobs (drone/noise controls)
        ~knobParameters[2].do { |key|
            ~knobs[key] = ~makeKnob.value(
                key.asString,
                ~controlSpecs[key].minval,
                ~controlSpecs[key].maxval,
                ~controlValues[key],
                ~controlSpecs[key].warp
            );
            controlViewRow3.layout.add(~knobs[key]);
        };

        // Fourth row knobs (additional controls)
        ~knobParameters[3].do { |key|
            ~knobs[key] = ~makeKnob.value(
                key.asString,
                ~controlSpecs[key].minval,
                ~controlSpecs[key].maxval,
                ~controlValues[key],
                ~controlSpecs[key].warp
            );
            controlViewRow4.layout.add(~knobs[key]);
        };

        // Create sample trigger buttons
        ~sampleNames = [
            "Aullidos", "Aves/Insectos", "Bats", "Dreamliner", 
            "Oropendola", "Ranas", "Tape"
        ];
        
        // Sample section header
        sampleHeader = StaticText()
            .string_("SAMPLE TRIGGERS")
            .font_(Font("Helvetica", 16, true))
            .align_(\center)
            .stringColor_(mainTheme.yellow);
        
        // Create sample button container
        sampleButtonView = View().background_(backgroundColor)
            .layout_(HLayout().margins_(10).spacing_(8));
        
        // Create sample buttons
        ~sampleButtons = [];
        ~sampleNames.do { |name, i|
            var button = Button()
                .states_([
                    [name, textColor, backgroundColor.blend(mainTheme.accent, 0.12)],
                    [name, backgroundColor, mainTheme.accent]
                ])
                .font_(Font("Helvetica", 10))
                .maxHeight_(40)
                .action_({ |btn|
                    if(btn.value == 1) {
                        "Triggering sample: %".format(name).postln;
                        if(~triggerSample.notNil) {
                            ~triggerSample.(i);
                        } {
                            "Sample system not loaded yet!".warn;
                        };
                        // Auto-release button after trigger
                        { btn.value = 0; }.defer(0.1);
                    };
                });
            
            ~sampleButtons = ~sampleButtons.add(button);
            sampleButtonView.layout.add(button);
        };
        
        // Add stop button
        stopButton = Button()
            .states_([["STOP ALL", textColor, backgroundColor.blend(mainTheme.red, 0.2)]])
            .font_(Font("Helvetica", 10, true))
            .maxHeight_(40)
            .action_({
                "Stopping all samples".postln;
                if(~stopAllSamples.notNil) {
                    ~stopAllSamples.();
                } {
                    if(~stopSample.notNil) {
                        ~stopSample.();
                    };
                };
            });
        sampleButtonView.layout.add(stopButton);
        
        sampleView.layout.add(sampleHeader);
        sampleView.layout.add(sampleButtonView);


        // Create sample control knobs
        ~sampleControlSpecs = (
            timeStretch: ControlSpec(0.25, 8.0, \exp),
            samplePitch: ControlSpec(-24, 24, \lin),
            sampleReverb: ControlSpec(0, 1, \lin),
            sampleDelay: ControlSpec(0, 1, \lin),
            delayTime: ControlSpec(0.1, 2.0, \exp),
            grainSize: ControlSpec(0.05, 1.0, \exp)
        );

        ~sampleControlValues = (
            timeStretch: 1.0,
            samplePitch: 0.0,
            sampleReverb: 0.3,
            sampleDelay: 0.2,
            delayTime: 0.5,
            grainSize: 0.2
        );

        // Enhanced sample knob function with bus connections
        ~makeSampleKnob = { |label, minVal, maxVal, defaultVal=0.5, mapping=\lin|
            var container, knobContainer, spec, knob, displayStr, valueLabel, functionLabel, paramName;

            container = View().background_(backgroundColor);
            container.layout_(VLayout().margins_(5).spacing_(3));

            knobContainer = View().background_(backgroundColor);
            knobContainer.layout_(HLayout().margins_(0).spacing_(0));

            spec = ControlSpec(minVal, maxVal, mapping);
            knob = Knob()
                .maxHeight_(70)
                .maxWidth_(70)
                .mode_(\vert)
                .color_([mainTheme.background, mainTheme.dim, mainTheme.foreground, mainTheme.foreground.alpha_(0.2)])
                .value_(spec.unmap(defaultVal));

            displayStr = label.asString;
            displayStr = displayStr[0].toUpper ++ displayStr[1..];

            valueLabel = StaticText()
                .string_(displayStr ++ ": " ++ defaultVal.round(0.001))
                .stringColor_(mainTheme.dim)  // Amber-dim for sample knob labels
                .font_(Font("Monaco", 9))
                .align_(\center);

            // Add function description label
            functionLabel = StaticText()
                .string_(switch(label.asSymbol,
                    \timeStretch, "TIME STRETCH",
                    \samplePitch, "PITCH SHIFT", 
                    \sampleReverb, "REVERB",
                    \sampleDelay, "DELAY",
                    \delayTime, "DELAY TIME",
                    \grainSize, "GRAIN SIZE",
                    displayStr.toUpper
                ))
                .stringColor_(mainTheme.dim.alpha_(0.8))
                .font_(Font("Helvetica", 8, true))
                .align_(\center);

            knobContainer.layout.add(knob);
            container.layout.add(knobContainer);
            container.layout.add(valueLabel);
            container.layout.add(functionLabel);

            // Define parameter name for sample bus connection
            paramName = label.asSymbol;
            
            // Sample knob action with sample bus updates
            knob.action = { |k|
                var mappedVal = spec.map(k.value);
                "Sample Knob % moved: value=%".format(paramName, mappedVal.round(0.001)).postln;
                if(~sampleBuses.notNil and: {~sampleBuses[paramName].notNil}) {
                    ~sampleBuses[paramName].set(mappedVal);
                    ~sampleControlValues[paramName] = mappedVal;
                    valueLabel.string = displayStr ++ ": " ++ mappedVal.round(0.001);
                    valueLabel.stringColor = mainTheme.dim;  // Keep amber-dim on updates
                    "Sample Bus % set to %".format(paramName, mappedVal.round(0.001)).postln;
                } {
                    "WARNING: Sample Bus % not found!".format(paramName).warn;
                };
            };

            container;
        };

        // Create sample parameter knobs
        ~sampleKnobs = ();
        ~sampleControlSpecs.keysValuesDo { |key, spec|
            ~sampleKnobs[key] = ~makeSampleKnob.value(
                key.asString,
                spec.minval,
                spec.maxval,
                ~sampleControlValues[key],
                spec.warp
            );
            sampleControlView.layout.add(~sampleKnobs[key]);
        };
        
        // Add sample control knobs to sample view
        sampleView.layout.add(sampleControlView);


        // Create recording controls section
        recordingView = View().background_(backgroundColor.blend(mainTheme.red, 0.06))
            .layout_(HLayout().margins_(15).spacing_(15));
        recordingView.fixedHeight = 80;
        
        // Recording status indicator
        ~recordingStatus = StaticText()
            .string_("REC: READY")
            .stringColor_(mainTheme.green)
            .font_(Font("Monaco", 12, true))
            .align_(\center)
            .minWidth_(120);
        
        // Record button
        ~recordButton = Button()
            .states_([
                ["● START REC", mainTheme.foreground, backgroundColor.blend(mainTheme.red, 0.2)],
                ["■ STOP REC", backgroundColor, mainTheme.red]
            ])
            .font_(Font("Helvetica", 11, true))
            .action_({ |btn|
                if(btn.value == 1) {
                    if(~startRecording.notNil) {
                        ~startRecording.();
                        ~recordingStatus.string_("REC: RECORDING").stringColor_(mainTheme.red);
                    } { "Recording system not loaded!".warn; btn.value = 0; };
                } {
                    if(~stopRecording.notNil) {
                        ~stopRecording.();
                        ~recordingStatus.string_("REC: READY").stringColor_(mainTheme.green);
                    };
                };
            });
        
        // Quick record button (30 seconds)
        ~quickRecButton = Button()
            .states_([["QUICK 30s", mainTheme.foreground, backgroundColor.blend(mainTheme.yellow, 0.2)]])
            .font_(Font("Helvetica", 10))
            .action_({
                if(~quickRecord.notNil) {
                    ~quickRecord.();
                    ~recordingStatus.string_("REC: 30s AUTO").stringColor_(mainTheme.yellow);
                } { "Recording system not loaded!".warn; };
            });
        
        // Spatial GUI button
        ~spatialGuiButton = Button()
            .states_([["SPATIAL GUI", mainTheme.foreground, backgroundColor.blend(mainTheme.accent, 0.15)]])
            .font_(Font("Helvetica", 10))
            .action_({
                var spatialPath = "/Users/a/Documents/p r o y e c t o s/D O C T O R A D O - TADEO 2024/Sonificando ETH/eth_sonification/SøNeth/12_spatial_gui.scd";
                spatialPath.load;
            });
        
        recordingView.layout.add(~recordingStatus);
        recordingView.layout.add(~recordButton);
        recordingView.layout.add(~quickRecButton);
        recordingView.layout.add(~spatialGuiButton);
        
        // Add all views to main window (all 4 control rows + samples + recording)
        ~mainWindow.layout.add(~header);
        ~mainWindow.layout.add(statusView);
        ~mainWindow.layout.add(counterView);
        ~mainWindow.layout.add(controlView);
        ~mainWindow.layout.add(controlViewRow2);
        ~mainWindow.layout.add(controlViewRow3);
        ~mainWindow.layout.add(controlViewRow4);
        ~mainWindow.layout.add(sampleView);
        ~mainWindow.layout.add(recordingView);

        // Add footer
        ~footer = StaticText()
            .string_("SøNETH BiocracyEngine — Spatial Audio + Samples")
            .font_(Font("Monaco", 8))
            .align_(\right)
            .stringColor_(mainTheme.dim.alpha_(0.6));
        ~mainWindow.layout.add(~footer);

        // Create update routine
        ~guiRoutine = Routine({
            loop {
                {
                    // Update status indicators
                    ~statusLights.server.setProperty(\status, Server.default.serverRunning.binaryValue);
                    ~statusLights.beat.setProperty(\status, (~beatEngine.notNil).binaryValue);
                    ~statusLights.osc.setProperty(\status, (OSCdef(\txHandler).notNil).binaryValue);
                    ~statusLights.midi.setProperty(\status, MIDIClient.sources.notEmpty.binaryValue);

                    // Update counters
                    if(~globalState.notNil) {
                        ~counters.trans.string = (~globalState.transactionCount ? 0).asString;
                    };

                    // Refresh status lights
                    ~statusLights.do(_.refresh);
                }.defer;
                0.05.wait;  // 20Hz refresh rate
            }
        }).play(AppClock);

        // Window cleanup
        ~mainWindow.onClose = {
            "Enhanced GUI window closed.".postln;
            if(~guiRoutine.notNil) { ~guiRoutine.stop };
            ~guiRoutine = nil;
            ~mainWindow = nil;
            ~statusLights = nil;
            ~counters = nil;
            ~knobs = nil;
            ~controlLabels = nil;
            ~knobViews = nil;
            ~sampleButtons = nil;
            ~sampleKnobs = nil;
        };

        ~mainWindow.front;
        "Enhanced GUI System loaded successfully.".postln;
        "GUI includes: Status lights, Counters, MIDI-synced knobs, Sample triggers".postln;
        
    } { |error|
        "GUI initialization failed: %".format(error.errorString).error;
        if(~guiRoutine.notNil) { ~guiRoutine.stop };
        if(~mainWindow.notNil) { ~mainWindow.close };
    }
}.defer;
)