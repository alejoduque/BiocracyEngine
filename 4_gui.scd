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
    var statusView, counterView, controlView, controlViewRow2, controlViewRow3, controlViewRow4, controlViewRow5, controlViewRow6, controlViewRow7;
    var mixerView;
    var sampleView, sampleControlView, sampleHeader, sampleButtonView, stopButton;
    var container, recordingView, presetView;
    var mainTheme, accentColor, backgroundColor, textColor;
    
    "Creating enhanced GUI with oscilloscope styling...".postln;

    try {
        
        // ─── 1-bit palette ──────────────────────────────────────────────────
        // Black and white only, the way the Cámara Fenológica row already
        // read. The amber scheme carried five hues that each meant something
        // different (green = ok, red = stop, yellow = armed) and none of it
        // survived a projector or a photograph; worse, hue was doing the work
        // that state should do. Here every control is white on black and an
        // ACTIVE control is inverted — black on white. That is the only state
        // signal, and it is legible at any size and in any reproduction.
        //
        // The semantic keys are kept so the ~300 references to mainTheme.red,
        // .green, .yellow and .purple elsewhere in this file keep resolving;
        // they simply all resolve to white now, and the .blend() calls that
        // used them produce the grey steps.
        mainTheme = (
            background: Color.black,
            foreground: Color.white,
            accent: Color.white,
            green: Color.white,
            red: Color.white,
            yellow: Color.white,
            purple: Color.white,
            dim: Color.gray(0.42),
            border: Color.gray(0.30)
        );

        // One typeface everywhere. Menlo ships with macOS, so this never falls
        // back silently the way a missing face would.
        ~monoFont = "Menlo";

        backgroundColor = mainTheme.background;
        textColor = mainTheme.foreground;
        accentColor = mainTheme.accent;

        // Create and store window sized to the ACTUAL screen. The previous
        // fixed 1100x1380 rect landed partly off-screen on laptop displays
        // (Qt warned "outside any known screen" at boot). All content now
        // lives in a ScrollView canvas: small screens scroll vertically
        // instead of clipping the REC strip; knob/button sizes unchanged.
        ~guiScreen = Window.availableBounds;
        ~mainWindow = Window("SøNETH — BiocracyEngine Control", Rect(
            60, 40,
            min(1100, ~guiScreen.width - 80),
            min(1380, ~guiScreen.height - 60)
        )).background_(backgroundColor);

        ~mainWindow.view.layout_(VLayout().margins_(0).spacing_(0));
        ~scrollView = ScrollView().hasHorizontalScroller_(false)
            .background_(backgroundColor);
        ~scrollCanvas = View().background_(backgroundColor);
        // Compact chrome: margins 10, spacing 8 (button/text sizes preserved).
        ~scrollCanvas.layout_(VLayout().margins_(10).spacing_(8));
        ~scrollView.canvas = ~scrollCanvas;
        ~mainWindow.layout.add(~scrollView);

        // Create header
        ~header = StaticText()
            .string_("SøNETH — BIOCRACY ENGINE")
            .font_(Font(~monoFont, 22, true))
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
        // Row 6: Marea. Booleans, so these are toggle buttons rather than
        // knobs — a Knob on a stepped 0/1 spec is unreadable at a glance and
        // this row has to be checkable mid-performance.
        controlViewRow6 = View().background_(backgroundColor.blend(mainTheme.accent, 0.06))
            .layout_(HLayout().margins_(6).spacing_(14));
        // Row 7: the field-recording layer's own transport and fader. Same
        // 1-bit black-and-white palette as row 5 so it reads as belonging to
        // the Cámara, but a separate row with its own caption so the corpus
        // fader is findable rather than the eighth knob along.
        controlViewRow7 = View().background_(Color.black)
            .layout_(HLayout().margins_(6).spacing_(20));
        // The matrix mixer: the only row on this surface whose controls change
        // loudness rather than timbre.
        mixerView = View().background_(Color.black)
            .layout_(HLayout().margins_(6).spacing_(10));

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
        controlViewRow6.fixedHeight = 62;
        controlViewRow7.fixedHeight = 120;
        mixerView.fixedHeight = 176;
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
                .font_(Font(~monoFont, 12))  // 2px smaller
                .minWidth_(80);

            container.layout.add(labelText);
            container.layout.add(indicator);
            indicator.setProperty(\status, 0);
            indicator;
        };

        // Create status indicators. "Bridge RX" is green while browser-origin
        // OSC (HTML sliders / parliament buttons) has arrived within the last
        // 5 s — live confirmation that the HTML→bridge→SC path works.
        ~statusLights = (
            server: ~makeStatusLight.value("Server:"),
            beat: ~makeStatusLight.value("Beat Engine:"),
            osc: ~makeStatusLight.value("OSC:"),
            midi: ~makeStatusLight.value("MIDI:"),
            bridge: ~makeStatusLight.value("Bridge RX:")
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
                .font_(Font(~monoFont, 14, true))
                .align_(\center)
                .minWidth_(60);

            labelText = StaticText()
                .string_(label)
                .stringColor_(textColor)
                .font_(Font(~monoFont, 12))  // 2px smaller
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
            // \beatTempo added — it was the ONLY parameter present in
            // parliament.html but missing from this surface, so the two control
            // surfaces were not at parity. Everything else appears on both.
            [\droneFade, \droneSpace, \droneMix, \delayFeedback, \transactionInfluence, \beatTempo],
            // Row 5: Cámara Fenológica de lo Vivo (1-bit white palette)
            [\activityThreshold, \windowWidth, \seasonalBias, \absenceWeight, \pulseGain, \opacityFloor, \bancada],
            // Row 6: Marea — the density arc. Stepped specs, so the knobs snap
            // 0/1; the browser checkboxes are the comfortable surface and these
            // mirror them so both control surfaces stay at parity.
            [\tideShort, \tideMedia, \tideLarga, \tidePulse],
            // Row 7: Cámara Fenológica · Corpus. Its own row, not appended to
            // row 5: nine knobs overflowed the 1100px window, and ~scrollView
            // has no horizontal scroller, so the last two were simply clipped
            // out of existence. These two also deserve separating — they are
            // the transport and the fader of the field-recording layer, not
            // two more readings of the calendar.
            [\phenoRate, \corpusLevel]
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

            // ALL CAPS throughout: camelCase parameter names read as two
            // words at a glance once the case is flattened, and caps hold
            // the monospace grid better than mixed case at 10px.
            displayStr = label.asString.toUpper;

            valueLabel = StaticText()
                .string_(displayStr ++ ": " ++ defaultVal.round(0.001))
                .stringColor_(Color.white)
                .font_(Font(~monoFont, 10))  // 2px smaller
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
                ~controlLabels[key].font_(Font(~monoFont, 10, true));
            };
            controlViewRow5.layout.add(knobContainer);
        };

        // ─── Row 7: Cámara Fenológica · Corpus ────────────────────────────
        // The AudioMoth layer's transport and fader, same 1-bit palette as
        // row 5 but captioned, because "where is the corpus fader" has to have
        // an answer you can see. The caption is a plain StaticText added to the
        // row's HLayout ahead of the knobs.
        controlViewRow7.layout.add(
            StaticText()
                .string_("CÁMARA\nFENOLÓGICA\n· CORPUS ·")
                .font_(Font(~monoFont, 10, true))
                .stringColor_(Color.white)
                .align_(\left)
                .maxWidth_(110)
        );
        ~knobParameters[6].do { |key|
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
            if(~knobViews[key].notNil) {
                ~knobViews[key].color_([Color.black, Color.white, Color.white, Color.gray(0.4)]);
            };
            if(~controlLabels[key].notNil) {
                ~controlLabels[key].stringColor_(Color.white);
                ~controlLabels[key].font_(Font(~monoFont, 10, true));
            };
            controlViewRow7.layout.add(knobContainer);
        };
        // The ring's own reading of where it is, refreshed by 14_'s routine.
        ~phenoCursorLabel = StaticText()
            .string_("doy — · —")
            .font_(Font(~monoFont, 11, true))
            .stringColor_(Color.gray(0.75))
            .align_(\left);
        controlViewRow7.layout.add(~phenoCursorLabel);

        // Skip the silence. 331 of 365 ring days have no recording, so at the
        // default rate the corpus is inaudible for up to three hours at a
        // stretch. Auditioning or performing it needs a way to reach the next
        // day that actually has audio.
        ~phenoSkipButton = Button()
            .states_([["NEXT REC. DAY ▶", mainTheme.foreground, backgroundColor]])
            .font_(Font(~monoFont, 10, true))
            .maxHeight_(26)
            .maxWidth_(150)
            .action_({
                if(~phenoNextRecorded.notNil) { ~phenoNextRecorded.value }
                    { "[pheno] corpus layer not loaded".postln };
            });
        controlViewRow7.layout.add(~phenoSkipButton);

        // ─── MATRIX MIXER ─────────────────────────────────────────────────
        // One fader per audible layer, plus a mute. Until now the balance
        // between voices lived only in the hardcoded gain budget of
        // 3_synthdefs.scd, fixed at load: every knob on this surface shaped
        // timbre and none of them changed how loud one layer sat against
        // another, so the instrument could not be mixed while it played.
        //
        // Unity is 1.0 and sits mid-throw, so a boot with these untouched
        // sounds exactly as before. They multiply the trims rather than
        // replacing them, which keeps the documented gain budget meaningful.
        //
        // Strips register into ~knobViews / ~controlLabels like every other
        // control, so ~setParam's deferred update drives them from MIDI CC
        // 42–49, the browser and preset loads with no special-casing.
        ~mixerStrips = ();
        ~mixerMuted = ();
        ~makeMixStrip = { |paramName, caption|
            var strip, slider, valueLabel, muteButton, spec;

            spec = ~controlSpecs[paramName];
            strip = View().background_(Color.black);
            strip.layout_(VLayout().margins_(4).spacing_(3));

            strip.layout.add(
                StaticText()
                    .string_(caption)
                    .font_(Font(~monoFont, 10, true))
                    .stringColor_(Color.white)
                    .align_(\center)
                    .maxHeight_(14)
            );

            // Narrow and tall: Qt reads the bounds as a vertical fader, which
            // is more reliable across versions than asking for an orientation.
            slider = Slider()
                .maxWidth_(30)
                .background_(Color.gray(0.12))
                .knobColor_(Color.white)
                .value_(spec.unmap(~controlValues[paramName]));

            valueLabel = StaticText()
                .string_(~labelCase.(paramName) ++ ": " ++ ~controlValues[paramName].round(0.001))
                .font_(Font(~monoFont, 8))
                .stringColor_(Color.gray(0.6))
                .align_(\center)
                .maxHeight_(12);

            slider.action = { |sl|
                var mapped = spec.map(sl.value);
                // Touching a fader lifts its own mute — otherwise the strip
                // would look live while the bus stayed at zero.
                if(~mixerMuted[paramName] == true) {
                    ~mixerMuted[paramName] = false;
                    muteButton.value_(0);
                };
                if(~setParam.notNil) { ~setParam.(paramName, mapped, \gui) } {
                    if(~buses.notNil and: { ~buses[paramName].notNil }) {
                        ~buses[paramName].set(mapped);
                    };
                };
            };

            // 1-bit state: an engaged mute inverts to black-on-white.
            muteButton = Button()
                .states_([
                    ["MUTE", mainTheme.dim, backgroundColor],
                    ["MUTE", Color.black, Color.white]
                ])
                .font_(Font(~monoFont, 9, true))
                .maxHeight_(20)
                .maxWidth_(46)
                .action_({ |b|
                    var muted = b.value > 0;
                    ~mixerMuted[paramName] = muted;
                    if(muted) {
                        // Remember where the fader was so unmute is exact.
                        // ~busVal comes from 5_beat_engine, which loads after
                        // this file — it exists by click time, but not if the
                        // GUI is opened standalone, hence the fallback.
                        ~mixerStrips[paramName][\held] = if(~busVal.notNil,
                            { ~busVal.(paramName, 1.0) },
                            { spec.map(slider.value) });
                        if(~setParam.notNil) { ~setParam.(paramName, 0.0, \gui) };
                    } {
                        if(~setParam.notNil) {
                            ~setParam.(paramName,
                                (~mixerStrips[paramName][\held] ? 1.0), \gui);
                        };
                    };
                });

            strip.layout.add(slider);
            strip.layout.add(valueLabel);
            strip.layout.add(muteButton);

            ~controlLabels = ~controlLabels ?? ();
            ~knobViews = ~knobViews ?? ();
            ~controlLabels[paramName] = valueLabel;
            ~knobViews[paramName] = slider;
            ~mixerStrips[paramName] = (strip: strip, slider: slider,
                mute: muteButton, held: 1.0);
            strip;
        };

        mixerView.layout.add(
            StaticText()
                .string_("MATRIX\nMIXER\nCC 42-49")
                .font_(Font(~monoFont, 10, true))
                .stringColor_(Color.white)
                .align_(\left)
                .maxWidth_(96)
        );
        [
            [\mixDrone,  "DRONE"],  [\mixPad,    "PAD"],
            [\mixKick,   "KICK"],   [\mixPerc,   "PERC"],
            [\mixDust,   "DUST"],   [\mixSample, "SAMPLE"],
            [\mixCorpus, "CORPUS"], [\mixUltra,  "ULTRA"]
        ].do { |pair|
            mixerView.layout.add(~makeMixStrip.value(pair[0], pair[1]));
        };

        // ─── Row 6: Marea — arco de densidad ──────────────────────────────
        // Toggles, not knobs. They register into ~knobViews / ~controlLabels
        // exactly like ~makeKnob does, so ~setParam's deferred GUI update
        // (0_parameters.scd step 4) drives them with no special-casing:
        // Button:value_ accepts the 0.0/1.0 that spec.unmap returns. That is
        // what makes the radio behaviour visible here when the browser or a
        // MIDI CC is the surface that moved.
        ~makeToggle = { |key, caption|
            var container, button, valueLabel, spec;
            spec = ~controlSpecs[key];
            container = View().background_(backgroundColor);
            container.layout_(VLayout().margins_(3).spacing_(3));

            button = Button()
                .states_([
                    [caption, mainTheme.dim,    backgroundColor],
                    [caption, backgroundColor, mainTheme.accent]
                ])
                .font_(Font(~monoFont, 11, true))
                .maxHeight_(28)
                .value_((~controlValues[key] ? 0).asInteger);

            valueLabel = StaticText()
                .string_(~labelCase.(key) ++ ": " ++ (~controlValues[key] ? 0))
                .stringColor_(mainTheme.foreground)
                .font_(Font(~monoFont, 9))
                .align_(\center);

            // Route through the single write path so exclusivity, the beat
            // mirror and the browser echo all happen; value_ from ~setParam
            // does not re-fire this action, so there is no feedback loop.
            button.action = { |b| ~setParam.(key, b.value, \gui) };

            container.layout.add(button);
            container.layout.add(valueLabel);

            ~knobViews = ~knobViews ?? ();
            ~knobViews[key] = button;
            ~controlLabels = ~controlLabels ?? ();
            ~controlLabels[key] = valueLabel;
            container;
        };

        // The button carries the caption; the StaticText under it is the same
        // value readout every other row has (~setParam rewrites it as
        // "TideShort: 1.0"). Captions are Spanish, matching the HTML surface.
        ~tideCaptions = (
            tideShort: "ARCO CORTO",
            tideMedia: "ARCO MEDIO",
            tideLarga: "ARCO LARGO",
            tidePulse: "PULSO"
        );
        ~knobParameters[5].do { |key|
            ~knobs[key] = ~makeToggle.value(key, ~tideCaptions[key] ? key.asString);
            controlViewRow6.layout.add(~knobs[key]);
        };

        // MIDI/OSC → GUI sync is event-driven: every surface goes through
        // ~setParam (0_parameters.scd), which defers the knob+label update.
        // The old 50 ms polling loop here issued a blocking getSynchronous
        // per knob per tick (~27 buses x 20 Hz ≈ 540 server queries/s) and
        // could fight the knob mid-drag. Deleted — nothing to poll anymore.

        // Create sample trigger buttons
        ~sampleNames = [
            "Aullidos", "Aves/Insectos", "Bats", "Dreamliner", 
            "Oropendola", "Ranas", "Tape"
        ];
        
        // Sample section header
        sampleHeader = StaticText()
            .string_("SAMPLE TRIGGERS")
            .font_(Font(~monoFont, 16, true))
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
                .font_(Font(~monoFont, 10))
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
            .font_(Font(~monoFont, 10, true))
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

            // ALL CAPS throughout: camelCase parameter names read as two
            // words at a glance once the case is flattened, and caps hold
            // the monospace grid better than mixed case at 10px.
            displayStr = label.asString.toUpper;

            valueLabel = StaticText()
                .string_(displayStr ++ ": " ++ defaultVal.round(0.001))
                .stringColor_(Color.white)
                .font_(Font(~monoFont, 9))
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
                .font_(Font(~monoFont, 8, true))
                .align_(\center);

            knobContainer.layout.add(knob);
            container.layout.add(knobContainer);
            container.layout.add(valueLabel);
            container.layout.add(functionLabel);

            // Define parameter name for sample bus connection
            paramName = label.asSymbol;

            // Register views so ~loadConfig can sync sample knobs from presets
            ~sampleKnobViews = ~sampleKnobViews ?? ();
            ~sampleKnobViews[paramName] = knob;
            ~sampleControlLabels = ~sampleControlLabels ?? ();
            ~sampleControlLabels[paramName] = valueLabel;

            // Sample knob action with sample bus updates (no per-move postln —
            // knob drags used to flood the log at two lines per pixel)
            knob.action = { |k|
                var mappedVal = spec.map(k.value);
                if(~sampleBuses.notNil and: {~sampleBuses[paramName].notNil}) {
                    ~sampleBuses[paramName].set(mappedVal);
                    ~sampleControlValues[paramName] = mappedVal;
                    valueLabel.string = displayStr ++ ": " ++ mappedVal.round(0.001);
                    valueLabel.stringColor = Color.white;  // Keep white on updates
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
            .font_(Font(~monoFont, 12, true))
            .align_(\center)
            .minWidth_(120);
        
        // Record button
        ~recordButton = Button()
            .states_([
                ["● START REC", mainTheme.foreground, backgroundColor.blend(mainTheme.red, 0.2)],
                ["■ STOP REC", backgroundColor, mainTheme.red]
            ])
            .font_(Font(~monoFont, 11, true))
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
            .font_(Font(~monoFont, 10))
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
            .font_(Font(~monoFont, 10))
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

        // ─── CONFIGS: save/load the full control state (presets/*.json) ────
        // Same files the browser CONFIGS block uses. Loading routes through
        // ~setParam, so knobs here AND HTML sliders both follow.
        presetView = View().background_(backgroundColor.blend(mainTheme.accent, 0.06))
            .layout_(HLayout().margins_(8).spacing_(12));
        presetView.fixedHeight = 60;

        ~presetNameField = TextField()
            .string_("")
            .background_(backgroundColor.blend(mainTheme.accent, 0.10))
            .stringColor_(mainTheme.yellow)
            .font_(Font(~monoFont, 11));

        ~presetMenu = PopUpMenu()
            .items_([])
            .background_(backgroundColor.blend(mainTheme.accent, 0.10))
            .stringColor_(mainTheme.yellow)
            .font_(Font(~monoFont, 11));

        ~refreshPresetMenu = {
            if(~listConfigs.notNil) {
                { ~presetMenu.items = ~listConfigs.value }.defer;
            };
        };

        ~presetSaveButton = Button()
            .states_([["◈ SAVE CONFIG", mainTheme.foreground, backgroundColor.blend(mainTheme.accent, 0.15)]])
            .font_(Font(~monoFont, 10, true))
            .action_({
                var name = ~presetNameField.string;
                if(name.isEmpty) { name = "config_" ++ Date.getDate.format("%y%m%d_%H%M%S") };
                if(~saveConfig.notNil) {
                    ~saveConfig.(name);
                    ~refreshPresetMenu.value;
                } { "Config system not loaded (0_parameters.scd)!".warn };
            });

        ~presetLoadButton = Button()
            .states_([["◈ LOAD", mainTheme.foreground, backgroundColor.blend(mainTheme.green, 0.15)]])
            .font_(Font(~monoFont, 10, true))
            .action_({
                var sel = ~presetMenu.item;
                if(sel.notNil and: { ~loadConfig.notNil }) {
                    ~loadConfig.(sel);
                } { "No config selected.".postln };
            });

        presetView.layout.add(
            StaticText().string_("CONFIGS:").stringColor_(mainTheme.yellow)
                .font_(Font(~monoFont, 11, true)).minWidth_(60)
        );
        presetView.layout.add(~presetNameField);
        presetView.layout.add(~presetSaveButton);
        presetView.layout.add(~presetMenu);
        presetView.layout.add(~presetLoadButton);
        ~refreshPresetMenu.value;
        
        // Add all views to the scroll canvas (5 control rows + samples + REC)
        ~scrollCanvas.layout.add(~header);
        ~scrollCanvas.layout.add(statusView);
        ~scrollCanvas.layout.add(counterView);
        ~scrollCanvas.layout.add(controlView);
        ~scrollCanvas.layout.add(controlViewRow2);
        ~scrollCanvas.layout.add(controlViewRow3);
        ~scrollCanvas.layout.add(controlViewRow4);
        ~scrollCanvas.layout.add(controlViewRow5);
        ~scrollCanvas.layout.add(controlViewRow7);
        ~scrollCanvas.layout.add(mixerView);
        ~scrollCanvas.layout.add(controlViewRow6);
        ~scrollCanvas.layout.add(sampleView);
        ~scrollCanvas.layout.add(recordingView);
        ~scrollCanvas.layout.add(presetView);

        // Add footer
        ~footer = StaticText()
            .string_("SøNETH BiocracyEngine — Spatial Audio + Samples")
            .font_(Font(~monoFont, 8))
            .align_(\right)
            .stringColor_(mainTheme.dim.alpha_(0.6));
        ~scrollCanvas.layout.add(~footer);

        // Create update routine
        ~guiRoutine = Routine({
            loop {
                {
                    var bridgeAlive = ~lastBrowserOscTime.notNil and: {
                        (SystemClock.seconds - ~lastBrowserOscTime) < 5
                    };
                    // Update status indicators
                    ~statusLights.server.setProperty(\status, Server.default.serverRunning.binaryValue);
                    // \beatRoutine is the actually-running loop; ~beatEngine is
                    // just the launcher function and is non-nil even when dead
                    ~statusLights.beat.setProperty(\status, (~beatRoutine.notNil).binaryValue);
                    ~statusLights.osc.setProperty(\status, (OSCdef(\txHandler).notNil).binaryValue);
                    // MIDIClient.sources is nil before the deferred MIDI init —
                    // the old direct .notEmpty call threw at boot and could
                    // kill this routine (seen as nil.notEmpty in sclang_log)
                    ~statusLights.midi.setProperty(\status,
                        (MIDIClient.initialized and: { (MIDIClient.sources ? []).notEmpty }).binaryValue);
                    ~statusLights.bridge.setProperty(\status, bridgeAlive.binaryValue);

                    // Update counters
                    if(~globalState.notNil) {
                        ~counters.trans.string = (~globalState.transactionCount ? 0).asString;
                    };

                    // Refresh status lights
                    ~statusLights.do(_.refresh);
                }.defer;
                0.5.wait;  // 2 Hz — status lights don't need the old 20 Hz
            }
        }).play(AppClock);

        // Window cleanup
        ~mainWindow.onClose = {
            "Enhanced GUI window closed.".postln;
            if(~guiRoutine.notNil) { ~guiRoutine.stop };
            ~guiRoutine = nil;
            ~mainWindow = nil;
            ~scrollView = nil;
            ~scrollCanvas = nil;
            ~statusLights = nil;
            ~counters = nil;
            ~knobs = nil;
            ~controlLabels = nil;
            ~knobViews = nil;
            ~sampleButtons = nil;
            ~sampleKnobs = nil;
            ~sampleKnobViews = nil;
            ~sampleControlLabels = nil;
            ~presetNameField = nil;
            ~presetMenu = nil;
            ~presetSaveButton = nil;
            ~presetLoadButton = nil;
            ~refreshPresetMenu = nil;
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