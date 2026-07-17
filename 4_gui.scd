// SuperCollider Ethereum Sonification - GUI System (Enhanced)
// Current Date and Time (UTC): 2025-08-31 21:50:00
// Current User's Login: alejoduque

// Capture the path to this script's directory NOW, at file-load time.
// thisProcess.nowExecutingPath returns nil inside a button action (no
// file is being interpreted at click time), so reading it later inside
// .action_ raises "Message 'dirname' not understood. RECEIVER: nil".
// Storing it in a global makes it available to any closure that needs
// to load a sibling .scd at runtime — currently used by the Spatial GUI
// button below.
~biocracyScriptDir = thisProcess.nowExecutingPath.dirname;
("Biocracy script dir captured at load: " ++ ~biocracyScriptDir).postln;

(
// Defer all GUI creation to AppClock to avoid Qt threading issues
{
    var statusView, counterView, controlView, controlViewRow2, controlViewRow3, controlViewRow4, controlViewRow5;
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

        // Create and store window with enhanced styling.
        // Sized to fit ALL sections without scrolling: 5 control rows
        // (Row 5 = Cámara Fenológica) + status/counter + samples + REC.
        // Previous 1120px was for 4 rows; we grew to 5 and the REC strip
        // dropped off-screen. 1380px restores it while keeping the rest.
        ~mainWindow = Window("SøNETH — BiocracyEngine Control", Rect(100, 100, 1100, 1380))
            .background_(backgroundColor);

        // Compact the outer chrome so button/text sizes are preserved but
        // dead air between rows shrinks: margins 15→10, spacing 15→8.
        ~mainWindow.view.layout_(VLayout().margins_(10).spacing_(8));

        // Create header
        ~header = StaticText()
            .string_("SøNETH — BIOCRACY ENGINE")
            .font_(Font("Helvetica", 22, true))
            .align_(\center)
            .stringColor_(mainTheme.yellow);

        // Create main container views for merged controls + samples.
        // Inner margins reduced 15→6 (vertical padding inside each row was
        // eating ~18px per section; with 8 sections that's ~144px of dead
        // vertical air — which is exactly what was pushing the REC strip
        // off-screen). Horizontal knob spacing kept at 20 so knobs don't
        // touch each other.
        statusView = View().background_(backgroundColor.blend(mainTheme.accent, 0.03))
            .layout_(HLayout().margins_(6).spacing_(20));
        counterView = View().background_(backgroundColor.blend(mainTheme.accent, 0.03))
            .layout_(HLayout().margins_(6).spacing_(20));
        controlView = View().background_(backgroundColor.blend(mainTheme.accent, 0.05))
            .layout_(HLayout().margins_(6).spacing_(20));
        controlViewRow2 = View().background_(backgroundColor.blend(mainTheme.accent, 0.05))
            .layout_(HLayout().margins_(6).spacing_(20));
        controlViewRow3 = View().background_(backgroundColor.blend(mainTheme.accent, 0.04))
            .layout_(HLayout().margins_(6).spacing_(20));
        controlViewRow4 = View().background_(backgroundColor.blend(mainTheme.accent, 0.04))
            .layout_(HLayout().margins_(6).spacing_(20));
        // Row 5: Cámara Fenológica — 1-bit aesthetic. Pure black background,
        // white knobs (cite of slot P visual style). Marks these controls as
        // belonging to the "escaño del tiempo" (phenological chamber), not to
        // sonETH performance.
        controlViewRow5 = View().background_(Color.black)
            .layout_(HLayout().margins_(6).spacing_(20));

        // Create sample views
        sampleView = View().background_(backgroundColor.blend(mainTheme.accent, 0.04))
            .layout_(VLayout().margins_(6).spacing_(6));
        sampleControlView = View().background_(backgroundColor.blend(Color.black, 0.1))
            .layout_(HLayout().margins_(8).spacing_(15));

        // Set fixed heights for sections
        [statusView, counterView].do { |view| view.fixedHeight = 80; };
        [controlView, controlViewRow2, controlViewRow3, controlViewRow4].do { |view|
            view.fixedHeight = 120;
        };
        controlViewRow5.fixedHeight = 120;
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

        // Control specs and values come from the canonical registry
        // (0_parameters.scd) — the duplicated literals that used to live here
        // had drifted from the MIDI and OSC copies of the same ranges.
        if(~controlSpecs.isNil or: { ~controlValues.isNil }) {
            "0_parameters.scd not loaded — GUI knobs have no specs!".error;
            ~controlSpecs = ~controlSpecs ?? ();
            ~controlValues = ~controlValues ?? ();
        };

        // Knob parameters layout - MERGED ambient + drone/noise controls
        ~knobParameters = [
            // Row 1: Core Performance Controls (Lawrence English Ambient)
            [\masterVolume, \pitchShift, \timeDilation, \spectralShift, \spatialSpread],
            // Row 2: Ambient Processing
            [\textureDepth, \atmosphereMix, \memoryFeed, \harmonicRich, \resonantBody],
            // Row 3: Drone/Noise Controls (Existing System)
            [\masterAmp, \filterCutoff, \noiseLevel, \noiseFilt, \droneDepth],
            // Row 4: Additional Drone Controls
            [\droneFade, \droneSpace, \droneMix, \delayFeedback, \transactionInfluence],
            // Row 5: Cámara Fenológica de lo Vivo (1-bit white palette)
            [\activityThreshold, \windowWidth, \seasonalBias, \absenceWeight, \pulseGain, \opacityFloor, \bancada]
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
                .stringColor_(Color.white)
                .font_(Font("Monaco", 10))  // 2px smaller
                .align_(\center);

            knobContainer.layout.add(knob);
            container.layout.add(knobContainer);
            container.layout.add(valueLabel);

            // Define parameter name for both action and storage
            paramName = label.asSymbol;  // Use exact parameter name (already camelCase)
            
            // Knob action — route through the single write path (0_parameters.scd).
            // ~setParam sets the bus, caches the value, mirrors ~beatParams and
            // echoes NORMALIZED 0–1 to the browser on the canonical path. The
            // old inline echo sent native units (Hz, semitones) that garbled the
            // HTML sliders, and findKeyForValue could pick an alias path the
            // browser doesn't map. Label update comes back via ~setParam's defer.
            knob.action = { |k|
                var mappedVal = spec.map(k.value);
                if(~setParam.notNil) {
                    ~setParam.(paramName, mappedVal, \gui);
                } {
                    // Registry missing (standalone GUI use) — set the bus directly
                    if(~buses.notNil and: {~buses[paramName].notNil}) {
                        ~buses[paramName].set(mappedVal);
                        valueLabel.string = displayStr ++ ": " ++ mappedVal.round(0.001);
                    };
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

        // ─── Row 5: Cámara Fenológica — 1-bit white palette ───────────────
        // The phenology chamber knobs cite the slot P visual style: black
        // background, white knob, monospace label. Same ~makeKnob factory
        // is used (it reads ~buses[paramName] and echoes via ~oscToParamMap
        // — including the new /pheno/* paths). The visual distinction is
        // applied here by overriding knob.color_ and label.stringColor_
        // after construction.
        ~knobParameters[4].do { |key|
            var knobContainer;
            ~knobs[key] = ~makeKnob.value(
                key.asString,
                ~controlSpecs[key].minval,
                ~controlSpecs[key].maxval,
                ~controlValues[key],
                ~controlSpecs[key].warp
            );
            knobContainer = ~knobs[key];
            knobContainer.background_(Color.black);
            // Override the knob's color so its arc + ring read as white-on-black
            if(~knobViews[key].notNil) {
                ~knobViews[key].color_([Color.black, Color.white, Color.white, Color.gray(0.4)]);
            };
            if(~controlLabels[key].notNil) {
                ~controlLabels[key].stringColor_(Color.white);
                ~controlLabels[key].font_(Font("Courier New", 10, true));
            };
            controlViewRow5.layout.add(knobContainer);
        };

        // ─── MIDI → GUI Feedback: Poll bus values and update knob displays ───
        // This keeps the GUI knobs synchronized when MIDI faders move
        // Uses stored references (~knobViews, ~controlLabels) to update displays
        // Running on AppClock ensures thread-safe GUI updates
        AppClock.sched(0.0, {
            ~knobParameters.flatten.do { |paramName|
                if(~knobs[paramName].notNil and: {~buses[paramName].notNil}) {
                    var spec = ~controlSpecs[paramName];
                    var busVal = ~buses[paramName].getSynchronous;
                    var knob = ~knobViews[paramName];
                    var label = ~controlLabels[paramName];

                    if(knob.notNil and: {label.notNil}) {
                        {
                            knob.value = spec.unmap(busVal);
                            label.string = paramName.asString.capitalize ++ ": " ++ busVal.round(0.001);
                        }.defer;
                    };
                };
            };
            0.05;  // poll every 50ms (imperceptible latency, low CPU)
        });

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
                .stringColor_(Color.white)
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
                .stringColor_(Color.white)
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
                    valueLabel.stringColor = Color.white;  // Keep white on updates
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
        // Margins compacted 15→8 so REC strip is visually denser; height
        // kept at 80 so the buttons retain their full target area.
        recordingView = View().background_(backgroundColor.blend(mainTheme.red, 0.06))
            .layout_(HLayout().margins_(8).spacing_(12));
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
        
        // ── Quick record button (30-second auto-stop) ─────────────────────
        // Triggers ~startRecording then schedules ~stopRecording 30s later.
        // Useful for quick captures (sound checks, documentation snippets,
        // sampler material for a phrase) without having to remember to
        // press STOP manually. Defined in 11_recording_system.scd:219.
        ~quickRecButton = Button()
            .states_([["▶ 30s SNAPSHOT", mainTheme.foreground, backgroundColor.blend(mainTheme.yellow, 0.2)]])
            .font_(Font("Helvetica", 10))
            .action_({
                if(~quickRecord.notNil) {
                    "Quick record: 30s auto-stop. Saves to recordings/ dir.".postln;
                    ~quickRecord.();
                    ~recordingStatus.string_("REC: 30s AUTO").stringColor_(mainTheme.yellow);
                } { "Recording system not loaded!".warn; };
            });
        
        // ── Spatial GUI button ────────────────────────────────────────────
        // Opens the 4-channel quadraphonic spatial control window.
        // Previously pointed at the *old* user-specific path inside the
        // TADEO 2024 doctorate folder, which doesn't exist on every
        // machine — silently no-op. Now resolved relative to the script
        // directory (same idiom as start_sonification.scd).
        // Also brings the window to front in case it opened off-screen
        // (12_spatial_gui.scd default position is Rect(1200,100,600,650)
        // which is invisible on displays narrower than ~1800px).
        ~spatialGuiButton = Button()
            .states_([["◇ SPATIAL 4ch", mainTheme.foreground, backgroundColor.blend(mainTheme.accent, 0.15)]])
            .font_(Font("Helvetica", 10))
            .action_({
                // Use the path captured at file-load time (see top of script).
                // thisProcess.nowExecutingPath is nil inside a button action,
                // so we can't compute the path lazily here.
                var spatialPath = ~biocracyScriptDir +/+ "12_spatial_gui.scd";
                if(File.exists(spatialPath)) {
                    ("Loading spatial GUI from: " ++ spatialPath).postln;
                    spatialPath.load;
                    // Pin the spatial window directly on top of the main sonETH
                    // window (same origin). User asked for overlap rather than
                    // a side-by-side layout that could push it off-screen.
                    AppClock.sched(0.4, {
                        if(~spatialWindow.notNil and: { ~spatialWindow.isClosed.not }) {
                            var mainBounds = if(~mainWindow.notNil) {
                                ~mainWindow.bounds
                            } { Rect(100, 100, 1100, 1380) };
                            ~spatialWindow.bounds_(Rect(
                                mainBounds.left, mainBounds.top, 600, 650
                            ));
                            ~spatialWindow.front;
                            ~spatialWindow.alwaysOnTop_(true);
                            "Spatial GUI on top of main window.".postln;
                        } { "Spatial GUI loaded but ~spatialWindow not registered.".warn; };
                        nil
                    });
                } {
                    ("Spatial GUI script not found at: " ++ spatialPath).error;
                };
            });
        
        recordingView.layout.add(~recordingStatus);
        recordingView.layout.add(~recordButton);
        recordingView.layout.add(~quickRecButton);
        recordingView.layout.add(~spatialGuiButton);
        
        // Add all views to main window (5 control rows + samples + recording)
        ~mainWindow.layout.add(~header);
        ~mainWindow.layout.add(statusView);
        ~mainWindow.layout.add(counterView);
        ~mainWindow.layout.add(controlView);
        ~mainWindow.layout.add(controlViewRow2);
        ~mainWindow.layout.add(controlViewRow3);
        ~mainWindow.layout.add(controlViewRow4);
        ~mainWindow.layout.add(controlViewRow5);
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