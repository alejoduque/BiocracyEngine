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
    var statusView, counterView, controlView, controlViewRow2, controlViewRow3, controlViewRow5, controlViewRow6, controlViewRow7;
    var mixerView;
    var sampleView, sampleControlView, sampleHeader, sampleButtonView, stopButton;
    var container, recordingView, presetView, laserView;
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
        // The semantic keys that are still REFERENCED are kept, so the calls
        // to mainTheme.red, .green, .yellow and .dim elsewhere in this file
        // keep resolving; they simply all resolve to white now, and the
        // .blend() calls that used them produce the grey steps. .purple and
        // .border were carried along too and neither was ever read — audited
        // at 0 uses each — so they are gone rather than sitting here implying
        // a palette this interface does not have.
        mainTheme = (
            background: Color.black,
            foreground: Color.white,
            accent: Color.white,
            green: Color.white,
            red: Color.white,
            yellow: Color.white,
            dim: Color.gray(0.42)
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
            // +470 for the laser column, which lives OUTSIDE the scroll area
            // and so has to be paid for in window width rather than taken from
            // the control surface. Clamped to the screen: on a narrower display
            // the fixed column wins and the surface takes the horizontal
            // scroller it already has, rather than the scope being squeezed to
            // nothing — a scope too small to read is the same as no scope.
            min(1570, ~guiScreen.width - 40),
            min(1380, ~guiScreen.height - 60)
        )).background_(backgroundColor);

        // HLayout, not VLayout: the control surface scrolls, and anything added
        // to it as another row can only be reached by scrolling to the bottom.
        // The laser scope has to be readable WHILE the hands are on the knobs —
        // a galvo-safety readout you have to go looking for is not a readout —
        // so it sits in a fixed column beside the scroll area instead of in it.
        ~mainWindow.view.layout_(HLayout().margins_(0).spacing_(0));
        // The horizontal scroller is ON. With it off, a row wider than the
        // window was not clipped with a warning — it was silently deleted from
        // the surface, which is how two knobs vanished out of row 5 and stayed
        // vanished (see the note on ~knobParameters row 7). A control that does
        // not fit must be reachable, not invisible.
        ~scrollView = ScrollView().hasHorizontalScroller_(true)
            .background_(backgroundColor);
        ~scrollCanvas = View().background_(backgroundColor);
        ~scrollCanvas.layout_(VLayout().margins_(6).spacing_(5));
        ~scrollView.canvas = ~scrollCanvas;
        ~mainWindow.layout.add(~scrollView, stretch: 1);

        // Create header
        ~header = StaticText()
            .string_("SøNETH — BIOCRACY ENGINE")
            .font_(Font(~monoFont, 16, true))
            .align_(\center)
            .stringColor_(mainTheme.yellow);

        // Create main container views for merged controls + samples.
        //
        // Chrome budget, second pass: margins 6→4 and horizontal spacing
        // 20→10 across every row. The first pass took the vertical padding
        // out; this one takes the horizontal air out, which is what let the
        // knobs come down from 80 px without the rows looking sparse. Fourteen
        // rows × (4 px of margin + ~50 px of shed knob height) is most of a
        // laptop screen, and the REC strip and preset row are what was falling
        // off the bottom of it.
        statusView = View().background_(backgroundColor.blend(mainTheme.accent, 0.03))
            .layout_(HLayout().margins_(4).spacing_(10));
        counterView = View().background_(backgroundColor.blend(mainTheme.accent, 0.03))
            .layout_(HLayout().margins_(4).spacing_(10));
        controlView = View().background_(backgroundColor.blend(mainTheme.accent, 0.05))
            .layout_(HLayout().margins_(4).spacing_(10));
        controlViewRow2 = View().background_(backgroundColor.blend(mainTheme.accent, 0.05))
            .layout_(HLayout().margins_(4).spacing_(10));
        controlViewRow3 = View().background_(backgroundColor.blend(mainTheme.accent, 0.04))
            .layout_(HLayout().margins_(4).spacing_(10));
        // Row 5: Cámara Fenológica — 1-bit aesthetic. Pure black background,
        // white knobs (cite of slot P visual style). Marks these controls as
        // belonging to the "escaño del tiempo" (phenological chamber), not to
        // sonETH performance.
        controlViewRow5 = View().background_(Color.black)
            .layout_(HLayout().margins_(4).spacing_(10));
        // Row 6: Marea. Booleans, so these are toggle buttons rather than
        // knobs — a Knob on a stepped 0/1 spec is unreadable at a glance and
        // this row has to be checkable mid-performance.
        controlViewRow6 = View().background_(backgroundColor.blend(mainTheme.accent, 0.06))
            .layout_(HLayout().margins_(4).spacing_(8));
        // Row 7: the field-recording layer's own transport and fader. Same
        // 1-bit black-and-white palette as row 5 so it reads as belonging to
        // the Cámara, but a separate row with its own caption so the corpus
        // fader is findable rather than the eighth knob along.
        controlViewRow7 = View().background_(Color.black)
            .layout_(HLayout().margins_(4).spacing_(10));
        // The matrix mixer: the only row on this surface whose controls change
        // loudness rather than timbre.
        mixerView = View().background_(Color.black)
            .layout_(HLayout().margins_(4).spacing_(6));

        // Create sample views
        sampleView = View().background_(backgroundColor.blend(mainTheme.accent, 0.04))
            .layout_(VLayout().margins_(4).spacing_(4));
        sampleControlView = View().background_(backgroundColor.blend(Color.black, 0.1))
            .layout_(HLayout().margins_(4).spacing_(8));

        // Set fixed heights for sections. A knob row is now 60 px of knob +
        // ~14 px of label + 8 px of margin = 82.
        [statusView, counterView].do { |view| view.fixedHeight = 46; };
        [controlView, controlViewRow2, controlViewRow3].do { |view|
            view.fixedHeight = 88;
        };
        controlViewRow5.fixedHeight = 88;
        controlViewRow6.fixedHeight = 58;
        controlViewRow7.fixedHeight = 88;
        mixerView.fixedHeight = 150;
        // sampleControlView is 52 px of knob + two label lines + margins.
        sampleControlView.fixedHeight = 92;
        // sampleView HOLDS sampleControlView, so its height is not a free
        // choice: header (~18) + 28 px trigger buttons + 92 + two 4 px gaps +
        // 8 px of margins = 158. The old pair was 180 containing 224 — the
        // sample knobs were being squeezed by 44 px they never had.
        sampleView.fixedHeight = 158;

        // ─── Status lights: the one place that is not 1-bit ─────────────────
        // Everywhere else on this surface an ACTIVE control is white-on-black
        // inverted, and that works because a control has a body you can see.
        // A light has nothing but its own state, so when the palette rewrite
        // collapsed mainTheme.green and mainTheme.red to the same white, all
        // five of these became identical discs that could not change — hue was
        // the only state signal they had, and it was gone.
        //
        // Red is live, dark is dead. An unlit light still reads as a light
        // because it keeps its rim; only the filament goes out. Nothing else
        // on the window is red, so the status row is the only thing that can
        // catch your eye across a stage.
        ~ledOn  = Color(1.0, 0.18, 0.12);
        ~ledOff = Color(0.10, 0.10, 0.10);
        ~ledRim = Color.gray(0.35);

        // ─── The wiring ring ────────────────────────────────────────────
        // A hairline circle around every knob saying WHICH SuperCollider voices
        // that control actually reaches. The point is to be able to see, across
        // the whole surface at once, what is shapeable and what is not — a knob
        // with two lit slices out of eight is a knob that cannot sculpt much,
        // and that is information the surface never carried.
        //
        // Two things make it readable rather than decorative:
        //
        //  · The slices are at FIXED positions. Every voice owns the same arc
        //    of the circle on every knob, so PERC is always at the same clock
        //    position and you learn the layout once instead of decoding each
        //    ring. Unwired slices are drawn very faint rather than omitted, so
        //    the gap is as legible as the fill.
        //
        //  · The colours are the SLOT hues from dataStructureVisuals.ts. A ring
        //    segment is the same colour as the screen that visualises that
        //    voice, so the GUI and the projection share one code.
        //
        // The map itself is DERIVED, from SynthDescLib, rather than written
        // down here. A hand-kept table of what reads what is exactly the kind
        // of thing this repo keeps finding out of date; this one cannot drift,
        // because it is read from the compiled SynthDefs themselves.
        ~voiceOrder = [\opalDrone, \elektronBell, \opalPerc, \opalKick,
                       \opalDust, \samplePlayerMono, \corpusVoice, \corpusUltrasonic];
        ~voiceLabels = (
            opalDrone: "DRONE", elektronBell: "CAMPANAS", opalPerc: "PERC",
            opalKick: "BOMBO", opalDust: "POLVO", samplePlayerMono: "MUESTRAS",
            corpusVoice: "CORPUS", corpusUltrasonic: "ULTRA"
        );
        ~voiceColors = (
            opalDrone:        Color.hsv(0.09, 0.85, 1.00),
            elektronBell:     Color.hsv(0.13, 0.85, 1.00),
            opalPerc:         Color.hsv(0.33, 0.75, 0.95),
            opalKick:         Color.hsv(0.02, 0.85, 1.00),
            opalDust:         Color.hsv(0.52, 0.75, 1.00),
            samplePlayerMono: Color.hsv(0.75, 0.70, 1.00),
            corpusVoice:      Color.hsv(0.60, 0.75, 1.00),
            corpusUltrasonic: Color.hsv(0.68, 0.60, 1.00)
        );

        // param -> the SynthDef arg spellings it can arrive as. The ten core
        // controls are declared under short names in the voices and long names
        // in the registry, which is the only reason this table is needed at all.
        ~voiceArgAlias = (
            masterVolume: [\masterVolBus], pitchShift: [\pitchBus, \samplePitchBus],
            timeDilation: [\timeBus], spectralShift: [\spectralBus],
            spatialSpread: [\spatialBus], textureDepth: [\textureBus],
            atmosphereMix: [\atmosphereBus], memoryFeed: [\memoryBus],
            harmonicRich: [\harmonicBus], resonantBody: [\resonantBus]
        );

        // Controls that reach a voice WITHOUT a bus, because the spawning code
        // multiplies them in at note time. They are real reaches and belong on
        // the ring, but they are not live: moving the knob changes the next
        // note, not the one sounding. Drawn hollow for that reason.
        //
        // This one IS hand-kept, because it lives in language-side arithmetic
        // that cannot be read back off a SynthDef. Keep it in step with the amp
        // expressions in 5_beat_engine.scd.
        ~voiceSpawnReach = (
            masterAmp: [\opalPerc, \opalKick, \opalDust],
            transactionInfluence: [\opalPerc, \opalKick],
            beatTempo: [\opalPerc, \opalKick, \opalDust]
        );

        // Derived once the server has the defs. Returns nil until then, which
        // the ring reads as "not known yet" and draws as a plain dim circle.
        ~computeParamVoices = {
            var out = ();
            var known = ~voiceOrder.select { |v| SynthDescLib.global[v].notNil };
            if(known.size == 0) { nil } {
                (~paramDefs ? []).do { |d|
                    var p = d[\name];
                    var names = (~voiceArgAlias[p] ? []) ++ [(p.asString ++ "Bus").asSymbol];
                    var live = ~voiceOrder.select { |v|
                        var desc = SynthDescLib.global[v];
                        // samplePlayerStereo is the same voice as Mono; only the
                        // channel count differs, so it does not get its own slice.
                        if(v == \samplePlayerMono) {
                            desc = desc ?? { SynthDescLib.global[\samplePlayerStereo] };
                        };
                        desc.notNil and: { names.any { |n| desc.controlNames.includes(n) } };
                    };
                    out[p] = (live: live, spawn: (~voiceSpawnReach[p] ? []));
                };
                out;
            };
        };

        ~makeStatusLight = { |label|
            var container, indicator, labelText, ageText;

            container = View().background_(backgroundColor);
            container.layout_(HLayout().margins_(3).spacing_(5));

            indicator = UserView(container)
                .maxHeight_(16)
                .maxWidth_(16)
                .drawFunc_({ |uview|
                    var lit = (uview.getProperty(\status) ? 0) == 1;
                    Pen.fillColor = if(lit) { ~ledOn } { ~ledOff };
                    Pen.addOval(Rect(1, 1, 14, 14));
                    Pen.fill;

                    Pen.strokeColor = if(lit) { ~ledOn } { ~ledRim };
                    Pen.width = 1;
                    Pen.addOval(Rect(1, 1, 14, 14));
                    Pen.stroke;

                    // The specular highlight is part of being lit. On a dead
                    // light it did the opposite of its job: it made an unlit
                    // disc look glossy, which is to say alive.
                    if(lit) {
                        Pen.fillColor = Color.white.alpha_(0.45);
                        Pen.addOval(Rect(4, 3, 5, 4));
                        Pen.fill;
                    };
                });

            labelText = StaticText()
                .string_(label)
                .stringColor_(textColor)
                .font_(Font(~monoFont, 10))
                .minWidth_(56);

            // Seconds since this feed was last heard from. A light is a yes/no
            // over exactly this number, and when a light disagrees with what
            // you believe is arriving there is no way to tell from the disc
            // alone which side is wrong. "-" means never seen this session,
            // which is a different fault from "seen, but a long time ago" and
            // should not look the same.
            ~ledAges = ~ledAges ?? ();
            ageText = StaticText()
                .string_("-")
                .stringColor_(Color.gray(0.45))
                .font_(Font(~monoFont, 9))
                .align_(\right)
                .minWidth_(34);

            container.layout.add(labelText);
            container.layout.add(indicator);
            container.layout.add(ageText);
            indicator.setProperty(\status, 0);
            ~ledAges[label.asSymbol] = ageText;
            indicator;
        };

        // Six lights, in a fixed order. They used to be added by iterating an
        // Event, which is hash order rather than source order — the row came
        // out arranged differently between launches, so you could not learn
        // where a light lived. ~statusOrder is what the update loop and the
        // layout both read.
        //
        // ETH is new. The OSC light claimed to watch the chain feed but tested
        // OSCdef(\txHandler).notNil — registration of the LEGACY /tx handler,
        // not traffic, and not the /eth/tx_info path eth_sonify.py actually
        // uses. So it was lit from boot regardless of whether Ethereum was
        // reaching the instrument. OSC now means browser+registry traffic;
        // ETH means the chain.
        ~statusOrder = [\server, \beat, \osc, \eth, \midi, \bridge];
        ~statusLights = (
            server: ~makeStatusLight.value("SERVER"),
            beat:   ~makeStatusLight.value("BEAT"),
            osc:    ~makeStatusLight.value("OSC"),
            eth:    ~makeStatusLight.value("ETH"),
            midi:   ~makeStatusLight.value("MIDI"),
            bridge: ~makeStatusLight.value("BRIDGE RX")
        );

        ~statusOrder.do({ |key|
            statusView.layout.add(~statusLights[key].parent);
        });

        // Counter function with oscilloscope styling
        ~makeCounter = { |label|
            var container, counter, labelText;

            container = View().background_(backgroundColor);
            container.layout_(HLayout().margins_(3).spacing_(6));

            counter = NumberBox()
                .enabled_(false)
                .background_(backgroundColor.blend(mainTheme.accent, 0.08))
                .normalColor_(mainTheme.yellow)
                .stringColor_(mainTheme.yellow)
                .font_(Font(~monoFont, 12, true))
                .align_(\center)
                .minWidth_(52);

            labelText = StaticText()
                .string_(label)
                .stringColor_(textColor)
                .font_(Font(~monoFont, 10))
                .minWidth_(48);

            container.layout.add(labelText);
            container.layout.add(counter);
            counter;
        };

        // Same fixed-order treatment as the lights, and for the same reason.
        // Three of these four were dead: nothing in the repo ever wrote notes,
        // beats or midi, so they sat at 0 for every session while trans alone
        // moved. Their feeds are stamped now — ~ethNoteCount by the /eth/note
        // and /midi/note handlers, ~beatStepCount by the beat routine,
        // ~midiCCCount by the single MIDIdef.
        ~counterOrder = [\notes, \beats, \trans, \midi];
        ~counters = (
            notes: ~makeCounter.value("NOTES"),
            beats: ~makeCounter.value("BEATS"),
            trans: ~makeCounter.value("TRANS"),
            midi:  ~makeCounter.value("CC")
        );

        ~counterOrder.do({ |key|
            counterView.layout.add(~counters[key].parent);
        });

        // ─── Legend for the knob rings ──────────────────────────────────
        // Without it the ring is a decoration. With it, one glance says which
        // arc belongs to which voice, and the colours are the same ones the
        // projection uses for the same voices.
        ~voiceLegend = UserView()
            .fixedHeight_(26)
            .background_(backgroundColor)
            .drawFunc_({ |uv|
                var x = 4, order = ~voiceOrder ? [];
                Pen.font = Font(~monoFont, 8);
                order.do { |v, i|
                    var col = (~voiceColors[v] ? Color.gray(0.5));
                    var txt = (~voiceLabels[v] ? v.asString);
                    // The swatch is drawn as the same wedge shape the rings
                    // use, at the same clock position, so the legend reads as
                    // a key to the geometry rather than a separate colour list.
                    Pen.width = 2.2;
                    Pen.strokeColor = col;
                    Pen.addAnnularWedge(Point(x + 9, 13), 6.5, 8.5,
                        (i / order.size.max(1) * 2pi) - (pi/2) - 0.35,
                        0.7);
                    Pen.stroke;
                    Pen.strokeColor = Color.gray(0.30);
                    Pen.addOval(Rect(x + 2.5, 6.5, 13, 13));
                    Pen.stroke;
                    Pen.stringAtPoint(txt, Point(x + 20, 7), Font(~monoFont, 8), col);
                    x = x + 20 + (txt.size * 5.6) + 10;
                };
            });
        counterView.layout.add(~voiceLegend);

        // Control specs and values come from the canonical registry
        // (0_parameters.scd) — the duplicated literals that used to live here
        // had drifted from the MIDI and OSC copies of the same ranges.
        if(~controlSpecs.isNil or: { ~controlValues.isNil }) {
            "0_parameters.scd not loaded — GUI knobs have no specs!".error;
            ~controlSpecs = ~controlSpecs ?? ();
            ~controlValues = ~controlValues ?? ();
        };

        // ─── Knob rows, seven across ────────────────────────────────────
        // Four performance rows of 5/5/5/6 became three of seven. The Cámara
        // row already proved seven fits — 7 x 132 px cells + 6 x 10 spacing +
        // 8 margins = 992 px inside a 1100 px window — and the surface was one
        // row taller than it needed to be.
        //
        // The old row captions named four groups (Core Performance, Ambient
        // Processing, Drone/Noise, Additional Drone) that are no longer one row
        // each. They are not preserved here as decoration: the grouping below
        // is by what the control DOES, and where a boundary falls mid-row it is
        // said so rather than implied by a comment that has stopped being true.
        ~knobParameters = [
            // Core performance, then the first two of ambient processing.
            [\masterVolume, \pitchShift, \timeDilation, \spectralShift, \spatialSpread,
             \textureDepth, \atmosphereMix],
            // The rest of ambient processing, then the noise bed.
            [\memoryFeed, \harmonicRich, \resonantBody,
             \masterAmp, \filterCutoff, \noiseLevel, \noiseFilt],
            // The drone and what bends it. beatTempo sits here because it is the
            // only other control that changes the engine's motion rather than
            // its timbre.
            [\droneDepth, \droneFade, \droneSpace, \droneMix, \delayFeedback,
             \transactionInfluence, \beatTempo],
            // Cámara Fenológica de lo Vivo — the amber bench. phenoRate joins it
            // to make seven, and belongs here anyway: the ring's speed is a
            // reading of the calendar, not a fader on the corpus.
            //
            // \bancada has LEFT this row. It is the last stepped spec that was
            // still a Knob, and a Knob cannot serve one: ~makeKnob rebuilds the
            // spec without its step, ~setParam re-quantises against the real
            // spec and writes the rounded value back into the widget, and a
            // \vert-mode Knob drags RELATIVE to its current value — so the
            // write-back reset the accumulator on every mouse event and the
            // control could never leave position 0. It is a button row now, the
            // same answer the four Marea toggles already got.
            [\activityThreshold, \windowWidth, \seasonalBias, \absenceWeight,
             \pulseGain, \opacityFloor, \phenoRate],
            // Marea — the density arc. Stepped specs, so these are toggle
            // buttons rather than knobs, for the reason spelled out above.
            [\tideShort, \tideMedia, \tideLarga, \tidePulse],
            // Cámara Fenológica · Corpus: the field-recording layer's own fader,
            // with the bancada selector and the transport button beside it.
            // camaraOpacity is the visual register's share of the same room —
            // how much of the camera trap slot C projects. It sits here rather
            // than in a row of its own because the performer reaches for it in
            // the same gesture as corpusLevel: one decides how loud the forest
            // is, the other how much of it is seen.
            [\corpusLevel, \chainProcess, \camaraOpacity],
            // Cadencia — how OFTEN, not how loud. The matrix mixer row below
            // sets each layer's level; these set its rate. They are the other
            // half of the same question and the reason the mix faders felt
            // inert: at one kick per 96 s there was no second hit to hear a
            // level change on. CC 25/26/27.
            [\kickEvery, \percRate, \dustRate]
        ];

        // Enhanced knob function with oscilloscope aesthetics
        ~makeKnob = { |label, minVal, maxVal, defaultVal=0.5, mapping=\lin|
            var container, knobContainer, spec, knob, displayStr, valueLabel, paramName, ring;

            container = View().background_(backgroundColor);
            container.layout_(VLayout().margins_(2).spacing_(2));
            // Every knob cell is the same width in every row. Without this the
            // cell width was whatever the row's HLayout had left to divide, so
            // the seven-knob Cámara row came out on a visibly different pitch
            // from the five- and six-knob rows above it and the surface read as
            // three different grids stacked. 132 is what seven cells plus their
            // gaps and margins fit into the 1100 px window; rows with fewer
            // knobs now leave trailing space instead of stretching.
            container.fixedWidth_(132);

            // No layout on this one: the ring has to sit under the knob at an
            // absolute position, and a layout would stack them instead. 72 px
            // holds a 60 px knob inset by 6, leaving the annulus for the ring.
            knobContainer = View().background_(backgroundColor)
                .fixedWidth_(72).fixedHeight_(72);

            paramName = label.asSymbol;
            ring = UserView(knobContainer, Rect(0, 0, 72, 72))
                .background_(backgroundColor)
                .drawFunc_({ |uv|
                    var wiring = if(~paramVoices.notNil) { ~paramVoices[paramName] };
                    var order = ~voiceOrder ? [];
                    var n = order.size.max(1);
                    var gap = 0.16;   // radians of dark between slices
                    order.do { |v, i|
                        var a0 = (i / n * 2pi) - (pi/2) + (gap/2);
                        var a1 = ((i + 1) / n * 2pi) - (pi/2) - (gap/2);
                        var live  = wiring.notNil and: { wiring[\live].includes(v) };
                        var spawn = wiring.notNil and: { wiring[\spawn].includes(v) };
                        var col = (~voiceColors[v] ? Color.gray(0.5));
                        // Lit: the voice reads this control live off a bus, so
                        // the knob changes a note already sounding. Hollow: it
                        // is applied when the note spawns, so the knob shapes
                        // the NEXT one. Nearly dark: no reach at all.
                        Pen.width = if(live) { 2.2 } { 1.2 };
                        Pen.strokeColor = case
                            { live }  { col }
                            { spawn } { col.alpha_(0.38) }
                            { Color.gray(0.16) };
                        Pen.addAnnularWedge(Point(36, 36), 32.5, 34.5, a0, a1 - a0);
                        Pen.stroke;
                    };
                });

            spec = ControlSpec(minVal, maxVal, mapping);
            knob = Knob(knobContainer, Rect(6, 6, 60, 60))
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

            container.layout.add(knobContainer);
            container.layout.add(valueLabel);
            ~knobRings = ~knobRings ?? ();
            ~knobRings[paramName] = ring;

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

        // Trailing stretch. The knob cells are a fixed width now, so a row with
        // five of them would otherwise have its spare space shared out as wider
        // gaps and the columns would stop lining up with the seven-knob Cámara
        // row below. An empty View at the end absorbs the remainder instead.
        controlView.layout.add(View().background_(backgroundColor.blend(mainTheme.accent, 0.05)));

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
        controlViewRow2.layout.add(View().background_(backgroundColor.blend(mainTheme.accent, 0.05)));

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
        controlViewRow3.layout.add(View().background_(backgroundColor.blend(mainTheme.accent, 0.04)));

        // Fourth row knobs (additional controls)

        // ─── Row 5: Cámara Fenológica — amber ─────────────────────────────
        // Seven knobs, and until now the row behaved as though none of them
        // were wired: every one of activityThreshold, windowWidth,
        // seasonalBias, absenceWeight, opacityFloor and bancada is read in
        // exactly one place — ~phenoPool, called once per phenological day —
        // so at the default rate a knob move took up to a minute to become
        // audible, and at the slow end eight. They are live now (the ring's
        // wait is sliced in 14_phenological_corpus.scd and the Chamber
        // re-decides who is admitted twice a second), and the row is tinted to
        // say so: this is the one bench whose controls change WHO speaks
        // rather than how the engine sounds.
        //
        // Amber rather than white, but only just — the surface is still 1-bit
        // and an ACTIVE control still reads by inversion. The tint marks the
        // row, it does not restart the hue-as-state habit the palette rewrite
        // removed.
        ~phenoAmber    = Color(1.0, 0.62, 0.10);
        ~phenoAmberDim = Color(1.0, 0.76, 0.45);
        ~phenoAmberBg  = Color.black.blend(~phenoAmber, 0.06);
        controlViewRow5.background_(~phenoAmberBg);
        ~knobParameters[3].do { |key|
            var knobContainer;
            ~knobs[key] = ~makeKnob.value(
                key.asString,
                ~controlSpecs[key].minval,
                ~controlSpecs[key].maxval,
                ~controlValues[key],
                ~controlSpecs[key].warp
            );
            knobContainer = ~knobs[key];
            knobContainer.background_(~phenoAmberBg);
            if(~knobViews[key].notNil) {
                ~knobViews[key].color_([
                    ~phenoAmberBg, ~phenoAmber, ~phenoAmber, ~phenoAmber.alpha_(0.22)
                ]);
            };
            if(~controlLabels[key].notNil) {
                ~controlLabels[key].stringColor_(~phenoAmberDim);
                ~controlLabels[key].font_(Font(~monoFont, 10, true));
            };
            controlViewRow5.layout.add(knobContainer);
        };
        controlViewRow5.layout.add(View().background_(~phenoAmberBg));

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
        ~knobParameters[5].do { |key|
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

        controlViewRow7.layout.add(View().background_(Color.black));
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
            .maxHeight_(22)
            .maxWidth_(128)
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
                .maxHeight_(16)
                .maxWidth_(40)
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
                .maxHeight_(24)
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
        ~knobParameters[4].do { |key|
            ~knobs[key] = ~makeToggle.value(key, ~tideCaptions[key] ? key.asString);
            controlViewRow6.layout.add(~knobs[key]);
        };

        // ─── BANCADA · Article 43, as five seats you can press ────────────
        // This was a Knob until it was found to be unusable. A Knob cannot
        // serve a stepped spec here: ~makeKnob rebuilds the ControlSpec from
        // (min, max, warp) and DROPS the step, ~setParam then re-quantises
        // against the real spec and writes the rounded value back into the
        // widget, and a \vert-mode Knob drags relative to its current value.
        // So every mouse event reset the accumulator, and crossing into
        // position 1 needed 0.125 normalised in one single event — about 16 px
        // between two consecutive Qt moves. The knob was not sending nothing;
        // it was sending 0, over and over.
        //
        // The four Marea toggles were made buttons for exactly this reason.
        // This is the last stepped spec that was still a knob.
        //
        // Radio, not toggle: the positions are exclusive by definition — 0 is
        // "todas" and 1-4 are the four ecological roles the detector yields.
        // Article 43 defines the bancadas taxonomically, but the corpus carries
        // no taxonomy, so roles are what this filter can honestly act on.
        //
        // It sits in the Marea row rather than the Corpus row because this
        // is the row of stepped, discrete selectors — which is what row 6
        // already is — and because the Corpus row has to keep width for the
        // ring cursor readout, which is a full sentence.
        ~bancadaCaptions = ["TODAS", "NOCTURNA", "INSECTOS", "CORO", "TRANSICIÓN"];
        ~bancadaButtons = Array.newClear(5);
        ~bancadaSet = { |idx|
            var i = idx.asInteger.clip(0, 4);
            ~setParam.(\bancada, i, \gui);
            // Not relit here — the 2 Hz reconcile below reads the bus and does
            // it for every source at once. Two relighters would be two owners
            // of one appearance, and they would disagree the moment ~setParam
            // clamped a value this function had not.
            ~bancadaShown = nil;
        };
        controlViewRow6.layout.add(
            StaticText().string_("BANCADA")
                .font_(Font(~monoFont, 9, true))
                .stringColor_(Color.gray(0.75))
                .align_(\right).maxWidth_(58)
        );
        5.do { |i|
            var btn = Button()
                .states_([
                    [~bancadaCaptions[i], mainTheme.dim,   backgroundColor],
                    [~bancadaCaptions[i], backgroundColor, mainTheme.accent]
                ])
                .font_(Font(~monoFont, 9, true))
                .maxHeight_(22)
                .maxWidth_(84)
                .value_(((~controlValues[\bancada] ? 0).asInteger == i).binaryValue);
            // The button's own value is not the state — ~bancadaSet relights the
            // whole row from the value that ~setParam actually accepted, so a
            // MIDI CC or a browser click lands here identically.
            btn.action = { ~bancadaSet.(i) };
            ~bancadaButtons[i] = btn;
            controlViewRow6.layout.add(btn);
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
                .maxHeight_(28)
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
            .maxHeight_(28)
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
            container.layout_(VLayout().margins_(2).spacing_(1));

            knobContainer = View().background_(backgroundColor);
            knobContainer.layout_(HLayout().margins_(0).spacing_(0));

            spec = ControlSpec(minVal, maxVal, mapping);
            knob = Knob()
                .maxHeight_(52)
                .maxWidth_(52)
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

        // Create sample parameter knobs, in the order the functionLabel switch
        // above so plainly intends. Iterating ~sampleControlSpecs directly gave
        // hash order, so the six knobs came out arranged arbitrarily and the
        // careful TIME STRETCH → PITCH → REVERB → DELAY → DELAY TIME → GRAIN
        // reading never actually appeared on screen.
        ~sampleKnobs = ();
        ~sampleKnobOrder = [
            \timeStretch, \samplePitch, \sampleReverb,
            \sampleDelay, \delayTime, \grainSize
        ];
        ~sampleKnobOrder.do { |key|
            var spec = ~sampleControlSpecs[key];
            if(spec.notNil) {
                ~sampleKnobs[key] = ~makeSampleKnob.value(
                    key.asString,
                    spec.minval,
                    spec.maxval,
                    ~sampleControlValues[key],
                    spec.warp
                );
                sampleControlView.layout.add(~sampleKnobs[key]);
            };
        };
        
        // Add sample control knobs to sample view
        sampleView.layout.add(sampleControlView);


        // Create recording controls section
        // Margins compacted 15→8 so REC strip is visually denser; height
        // kept at 80 so the buttons retain their full target area.
        recordingView = View().background_(backgroundColor.blend(mainTheme.red, 0.06))
            .layout_(HLayout().margins_(4).spacing_(8));
        recordingView.fixedHeight = 38;
        
        // Recording status indicator
        ~recordingStatus = StaticText()
            .string_("REC: READY")
            .stringColor_(mainTheme.green)
            .font_(Font(~monoFont, 11, true))
            .align_(\center)
            .minWidth_(104);
        
        // Record button
        ~recordButton = Button()
            .states_([
                ["● START REC", mainTheme.foreground, backgroundColor.blend(mainTheme.red, 0.2)],
                ["■ STOP REC", backgroundColor, mainTheme.red]
            ])
            .font_(Font(~monoFont, 10, true))
            .maxHeight_(24)
            .maxWidth_(124)
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
            .font_(Font(~monoFont, 9))
            .maxHeight_(24)
            .maxWidth_(124)
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
            .font_(Font(~monoFont, 9))
            .maxHeight_(24)
            .maxWidth_(112)
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
            .layout_(HLayout().margins_(4).spacing_(8));
        presetView.fixedHeight = 40;

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
            .font_(Font(~monoFont, 9, true))
            .maxHeight_(24)
            .maxWidth_(116)
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
            .font_(Font(~monoFont, 9, true))
            .maxHeight_(24)
            .maxWidth_(72)
            .action_({
                var sel = ~presetMenu.item;
                if(sel.notNil and: { ~loadConfig.notNil }) {
                    ~loadConfig.(sel);
                } { "No config selected.".postln };
            });

        presetView.layout.add(
            StaticText().string_("CONFIGS:").stringColor_(mainTheme.yellow)
                .font_(Font(~monoFont, 10, true)).minWidth_(56)
        );
        presetView.layout.add(~presetNameField);
        presetView.layout.add(~presetSaveButton);
        presetView.layout.add(~presetMenu);
        presetView.layout.add(~presetLoadButton);
        ~refreshPresetMenu.value;
        
        // ─── LASER · galvo-safety scope ─────────────────────────────────────
        // What a laser projector is driven by IS a waveform: at the DAC's point
        // rate each point is one sample, X on the left channel and Y on the
        // right. That is a .wav in every respect, and this draws it — the real
        // post-sanitisation signal the Helios receives, streamed from
        // laser-bridge.js, not a reconstruction of what it ought to be.
        //
        // The row is a status block on the left and the scope filling the
        // horizontal space to its right.
        laserView = View().background_(backgroundColor.blend(mainTheme.accent, 0.05))
            .layout_(VLayout().margins_(6).spacing_(6));
        laserView.fixedWidth = 452;

        laserView.layout.add(
            StaticText().string_("LASER · GALVO SAFETY")
                .stringColor_(mainTheme.accent)
                .font_(Font(~monoFont, 10, true))
                .fixedHeight_(14)
        );

        // ─── Two lamps ──────────────────────────────────────────────────────
        // Same visual language as the feed lights at the top of the surface,
        // without their age column: neither of these is a feed whose silence
        // means anything, so a "seconds since" reading beside them would be
        // noise dressed as information.
        //
        // DAC is a fact about the hardware — lit only when the bridge has bound
        // a real Helios. Dry run and no-bridge both read dark, which is correct:
        // in neither case is anything reaching a laser.
        //
        // BLANK is a fact about right now. It follows the bridge's own hold
        // window rather than the frame that tripped it, because a 250 ms
        // blanking reported for one 12 Hz frame would flash the lamp for 80 ms
        // and be missed by the person it is for.
        ~laserLeds = ~laserLeds ?? ();
        ~makeLaserLed = { |label|
            var row = View().background_(backgroundColor);
            var dot;
            row.layout_(HLayout().margins_(2).spacing_(6));
            dot = UserView(row).maxHeight_(16).maxWidth_(16)
                .drawFunc_({ |uview|
                    var lit = (uview.getProperty(\status) ? 0) == 1;
                    Pen.fillColor = if(lit) { ~ledOn } { ~ledOff };
                    Pen.addOval(Rect(1, 1, 14, 14)); Pen.fill;
                    Pen.strokeColor = if(lit) { ~ledOn } { ~ledRim };
                    Pen.width = 1;
                    Pen.addOval(Rect(1, 1, 14, 14)); Pen.stroke;
                    if(lit) {
                        Pen.fillColor = Color.white.alpha_(0.45);
                        Pen.addOval(Rect(4, 3, 5, 4)); Pen.fill;
                    };
                });
            dot.setProperty(\status, 0);
            row.layout.add(dot);
            row.layout.add(StaticText().string_(label)
                .stringColor_(mainTheme.dim).font_(Font(~monoFont, 9)));
            ~laserLeds[label.asSymbol] = dot;
            row;
        };
        ~laserLampRow = View().background_(backgroundColor)
            .layout_(HLayout().margins_(0).spacing_(10));
        ~laserLampRow.fixedHeight = 24;
        ~laserLampRow.layout.add(~makeLaserLed.value("DAC"));
        ~laserLampRow.layout.add(~makeLaserLed.value("BLANK"));
        ~laserLampRow.layout.add(nil);
        laserView.layout.add(~laserLampRow);

        // ─── Which source feeds the plot ────────────────────────────────────
        // Ticks, not a selector: the stack can carry several at once and each
        // source draws in its own hue, so a mixed stack stays legible. With
        // none ticked the browser falls back to the year ring, which is how
        // that pattern stays reachable without a control of its own.
        ~laserSrcRow = View().background_(backgroundColor)
            .layout_(HLayout().margins_(0).spacing_(4));
        ~laserSrcRow.fixedHeight = 46;
        [[\laserSrcMix, "MIX"], [\laserSrcCorpus, "CORPUS"],
         [\laserSrcRing, "DÍA"], [\laserSrcChain, "CHAIN"]].do { |pair|
            ~laserSrcRow.layout.add(~makeToggle.value(pair[0], pair[1]));
        };
        laserView.layout.add(~laserSrcRow);

        ~laserStatusText = StaticText()
            .string_("LASER: no bridge")
            .stringColor_(mainTheme.dim)
            .font_(Font(~monoFont, 9))
            .fixedHeight_(96);
        laserView.layout.add(~laserStatusText);

        ~laserScopeView = UserView()
            .background_(Color.black)
            // drawFunc_, not drawFunc. The bare name is the GETTER: calling it
            // with a function returns the view's current (nil) draw function,
            // so the whole builder chain evaluated to nil and ~laserScopeView
            // was never a view at all — the row laid out an empty stretch and
            // the scope simply did not exist, without erroring.
            .drawFunc_({ |uv|
                var b = uv.bounds;
                var w = b.width, h = b.height;
                var sc = ~laserScope;
                var live = sc.notNil and: { (Main.elapsedTime - sc[\at]) < 2.0 };
                // Three lanes: X, Y, and the thing that actually decides galvo
                // safety — the step between consecutive samples. A step limit
                // is a limit on SLOPE, and the first version drew it as a pair
                // of amplitude rails across the X trace, which is a different
                // quantity entirely and could never have shown a violation.
                var laneX = h * 0.18, laneY = h * 0.45, laneS = h * 0.94;

                Pen.width = 1;
                Pen.strokeColor = Color.gray(0.22);
                [laneX, laneY].do { |y|
                    Pen.moveTo(0 @ y); Pen.lineTo(w @ y); Pen.stroke;
                };

                if(live.not) {
                    Pen.stringAtPoint(
                        if(sc.isNil) { "no laser bridge — start with LASER=1" }
                            { "bridge silent > 2 s" },
                        8 @ (h * 0.45),
                        Font(~monoFont, 9), Color.gray(0.45));
                } {
                    var pts = sc[\xy] ? [];
                    var n = pts.size.max(1);
                    var amp = h * 0.14;
                    var lim = sc[\maxStep].max(1e-9);
                    [[0, laneX], [1, laneY]].do { |ch|
                        var idx = ch[0], zero = ch[1];
                        pts.do { |p, i|
                            var x0 = i / n * w;
                            var y0 = zero - (p[idx].clip(-1, 1) * amp);
                            Pen.strokeColor = if(p[2] > 0.5)
                                { Color.gray(0.30) } { mainTheme.accent };
                            if(i == 0) { Pen.moveTo(x0 @ y0) } { Pen.lineTo(x0 @ y0) };
                            Pen.stroke; Pen.moveTo(x0 @ y0);
                        };
                    };
                    // The speed lane, scaled so the limit sits at half height:
                    // anything reaching the marked line is at the scanner's
                    // rated angular velocity, and anything above it is asking
                    // the mirrors for an acceleration they do not have.
                    Pen.strokeColor = Color.gray(0.40);
                    Pen.moveTo(0 @ (laneS - (h * 0.13)));
                    Pen.lineTo(w @ (laneS - (h * 0.13))); Pen.stroke;
                    // Named, now the column is wide enough to carry them. Three
                    // unlabelled traces are three mysteries, and the third one
                    // is not the same KIND of quantity as the first two — it is
                    // a rate, not a position, and nothing on screen said so.
                    [["X", laneX], ["Y", laneY]].do { |l|
                        Pen.stringAtPoint(l[0], 3 @ (l[1] - (h * 0.115)),
                            Font(~monoFont, 8), Color.gray(0.5));
                    };
                    Pen.stringAtPoint("STEP / LIMIT", 3 @ (laneS - (h * 0.155)),
                        Font(~monoFont, 8), Color.gray(0.5));
                    pts.do { |p, i|
                        var x0 = i / n * w;
                        var frac = (p[3] / lim).clip(0, 2.2);
                        var y0 = laneS - (frac * h * 0.13);
                        Pen.strokeColor = if(frac > 1.0)
                            { Color.white } { mainTheme.accent };
                        Pen.moveTo(x0 @ laneS); Pen.lineTo(x0 @ y0); Pen.stroke;
                    };
                    if((sc[\overspeed] > 0) or: { sc[\dwellUs] > 1000 }
                        or: { sc[\budget] > 1.0 } or: { sc[\frameBlanked] > 0 }
                        or: { sc[\osBlanked] > 0 } or: { sc[\dwellBlanked] > 0 }) {
                        Pen.strokeColor = Color.white;
                        Pen.width = 2;
                        Pen.moveTo(0 @ 1); Pen.lineTo(w @ 1); Pen.stroke;
                        Pen.moveTo(0 @ (h - 1)); Pen.lineTo(w @ (h - 1)); Pen.stroke;
                    };
                };
            });
        laserView.layout.add(~laserScopeView, stretch: 1);
        laserView.layout.add(
            StaticText()
                .string_("Not a safety system. Class 4: the interlock, E-stop,"
                    " key, aperture mask and Scan Guard are what protect people."
                    " This only keeps the engine inside the scanner's published"
                    " mechanical envelope.")
                .stringColor_(mainTheme.dim)
                .font_(Font(~monoFont, 8))
                .fixedHeight_(52)
        );

        // Attached here rather than beside the ScrollView at the top of the
        // file, because HLayout adds left to right and laserView does not exist
        // until now. The scroll area was added first, so this lands to its
        // right and stays put while the surface scrolls under it.
        ~mainWindow.layout.add(laserView);

        // Add all views to the scroll canvas (5 control rows + samples + REC)
        ~scrollCanvas.layout.add(~header);
        ~scrollCanvas.layout.add(statusView);
        ~scrollCanvas.layout.add(counterView);
        ~scrollCanvas.layout.add(controlView);
        ~scrollCanvas.layout.add(controlViewRow2);
        ~scrollCanvas.layout.add(controlViewRow3);
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

        // Was this feed heard from recently? Every light except SERVER now
        // answers the same question against its own timestamp, instead of four
        // different questions of four different kinds. Three of them used to
        // test whether something had been REGISTERED — an OSCdef that exists, a
        // Routine variable that is non-nil, a MIDI device that is enumerated —
        // all of which become true at boot and stay true through a dead feed.
        // Main.elapsedTime on BOTH sides. The stamps are written from OSC and
        // MIDI callbacks on the interpreter thread; this reads them from an
        // AppClock routine. SystemClock.seconds is not wall clock — Clock's
        // *seconds returns thisThread.seconds (Clock.sc:6) and SystemClock does
        // not override it — so the two sides were nominally comparing clocks
        // that are only equal by convention.
        //
        // Measured, they did NOT drift: over 16 s with a SystemClock routine
        // churning, reader-minus-writer held at 0.20-0.21 s and matched
        // Main.elapsedTime exactly. So this is not the cause of the dark ETH
        // light and is not claimed to be. It is here because a liveness test
        // should not rest on two threads happening to agree, and because
        // Main.elapsedTime costs nothing — the repo already uses it in
        // 8_transaction_buffer.scd.
        ~ledAlive = { |stamp, window = 5.0|
            (stamp.notNil and: { (Main.elapsedTime - stamp) < window }).binaryValue;
        };

        // Create update routine
        ~guiRoutine = Routine({
            loop {
                {
                    ~statusLights.server.setProperty(\status,
                        Server.default.serverRunning.binaryValue);
                    // ~lastBeatTime is stamped once per step by the beat
                    // routine. ~beatRoutine.notNil, which this used to test,
                    // stayed true forever because ~beatEngine only ever called
                    // .stop on it — a stopped engine reported as running.
                    // Window is 3 s: the slowest tempo still steps well inside it.
                    ~statusLights.beat.setProperty(\status, ~ledAlive.(~lastBeatTime, 3.0));
                    ~statusLights.osc.setProperty(\status, ~ledAlive.(~lastOscTime));
                    ~statusLights.eth.setProperty(\status, ~ledAlive.(~lastEthTime, 30.0));
                    ~statusLights.midi.setProperty(\status, ~ledAlive.(~lastMidiTime));
                    ~statusLights.bridge.setProperty(\status, ~ledAlive.(~lastBrowserOscTime));

                    // ── Galvo-safety scope ─────────────────────────────────
                    // The verdict is stated in words as well as drawn, because
                    // "the trace looks fine" is not a safety judgement. dwell
                    // is reported in microseconds against a 2 ms threshold: a
                    // beam standing still is the hazard the speed limit does
                    // not catch, and a frame can sit inside every step limit
                    // and still be dangerous by not moving.
                    if(~laserStatusText.notNil) {
                        var sc = ~laserScope;
                        var live = sc.notNil and: { (Main.elapsedTime - sc[\at]) < 2.0 };
                        if(live.not) {
                            ~laserStatusText.string = "LASER: no bridge";
                            ~laserStatusText.stringColor = mainTheme.dim;
                        } {
                            var bad = (sc[\overspeed] > 0)
                                or: { sc[\dwellUs] > 1000 } or: { sc[\budget] > 1.0 }
                                or: { sc[\frameBlanked] > 0 }
                                or: { sc[\osBlanked] > 0 } or: { sc[\dwellBlanked] > 0 };
                            // Angular, because the datasheet is angular. "30 kpps
                            // @ 8 deg" is a rate-ANGLE pair, so deg/s against the
                            // rated ceiling is the number that says whether this
                            // frame is inside the scanner's specification, and
                            // the field width says whether 8 deg is even the
                            // right rating to be holding it to.
                            ~laserStatusText.string =
                                (if(sc[\dac] > 0) { "HELIOS DAC" } { "DRY RUN (no DAC)" })
                                ++ "\n" ++ sc[\pps] ++ " pps · " ++ sc[\points] ++ " pts"
                                ++ "\n" ++ sc[\omegaNow].round(1) ++ " / "
                                    ++ sc[\omegaMax].round(1) ++ " deg/s"
                                ++ "\nfield " ++ sc[\usedDeg].round(0.1) ++ " deg"
                                    ++ " (rated " ++ sc[\ratedDeg].round(0.1) ++ ")"
                                ++ "\nscan budget " ++ (sc[\budget] * 100).round(1) ++ "%"
                                ++ "\ndwell " ++ sc[\dwellUs].round(1) ++ " us"
                                // Says what was DONE, not only what was seen.
                                // A dwell of 0 because the beam was switched
                                // off is a different fact from a dwell of 0
                                // because nothing ever stopped moving.
                                ++ "\n" ++ case
                                    { sc[\frameBlanked] > 0 } {
                                        "BLANKED — frame needs "
                                            ++ (sc[\budget] * sc[\pps]).round(1) ++ " pps"
                                    }
                                    { sc[\dwellBlanked] > 0 } {
                                        "BLANKED " ++ sc[\dwellBlanked] ++ " parked pts"
                                    }
                                    { sc[\osBlanked] > 0 } {
                                        "BLANKED " ++ sc[\osBlanked] ++ " over-speed pts"
                                    }
                                    { sc[\overspeed] > 0 } {
                                        "OVER-SPEED x" ++ sc[\overspeed]
                                    }
                                    { sc[\dwellUs] > 1000 } {
                                        "BEAM PARKED "
                                            ++ (sc[\dwellUs] / 1000).round(0.1) ++ " ms"
                                    }
                                    { sc[\usedDeg] > (sc[\ratedDeg] * 1.05) } {
                                        "wide field — beyond the 30k rating"
                                    }
                                    { true } { "within scanner spec" };
                            ~laserStatusText.stringColor = mainTheme.dim;
                        } {
                            var bad = (sc[\overspeed] > 0) or: { sc[\dwellUs] > 2000 };
                            ~laserStatusText.string =
                                (if(sc[\dac] > 0) { "HELIOS DAC" } { "DRY RUN (no DAC)" })
                                ++ "\n" ++ sc[\pps] ++ " pps · " ++ sc[\points] ++ " pts"
                                ++ "\npeak step " ++ sc[\peakStep].round(0.001)
                                ++ " / " ++ sc[\maxStep].round(0.001)
                                ++ "\ndwell " ++ sc[\dwellUs].round(1) ++ " us"
                                // Name the fault that actually occurred. The
                                // first draft always reported over-speed, so a
                                // parked beam read "UNSAFE: 0 over-speed" —
                                // which points the operator at the one measure
                                // that was fine.
                                ++ "\n" ++ case
                                    { (sc[\overspeed] > 0) and: { sc[\dwellUs] > 2000 } } {
                                        "UNSAFE: " ++ sc[\overspeed] ++ " over-speed + parked"
                                    }
                                    { sc[\overspeed] > 0 } {
                                        "UNSAFE: " ++ sc[\overspeed] ++ " over-speed"
                                    }
                                    { sc[\dwellUs] > 2000 } {
                                        "UNSAFE: beam parked "
                                            ++ (sc[\dwellUs] / 1000).round(0.1) ++ " ms"
                                    }
                                    { true } { "galvo-safe" };
                            ~laserStatusText.stringColor =
                                if(bad) { Color.white } { mainTheme.dim };
                        };
                        // The lamps. Both dark when there is no bridge — an
                        // unlit BLANK must not be readable as "not blanking"
                        // when in truth nothing is being projected at all.
                        if(~laserLeds.notNil) {
                            ~laserLeds[\DAC].setProperty(\status,
                                if(live and: { sc[\dac] > 0 }) { 1 } { 0 });
                            ~laserLeds[\BLANK].setProperty(\status,
                                if(live and: { sc[\blanking] > 0 }) { 1 } { 0 });
                            ~laserLeds[\DAC].refresh;
                            ~laserLeds[\BLANK].refresh;
                        };
                        if(~laserScopeView.notNil) { ~laserScopeView.refresh };
                    };

                    // The number under each light. Same stamps, same clock —
                    // so a dark light with a small age means the light is
                    // wrong, and a dark light with a large age or a dash means
                    // the feed is. That distinction could not be made from the
                    // window at all before, which is why a dark ETH light cost
                    // three rounds of guessing.
                    if(~ledAges.notNil) {
                        [["SERVER", nil], ["BEAT", ~lastBeatTime], ["OSC", ~lastOscTime],
                         ["ETH", ~lastEthTime], ["MIDI", ~lastMidiTime],
                         ["BRIDGE RX", ~lastBrowserOscTime]].do { |pair|
                            var el = ~ledAges[pair[0].asSymbol];
                            var stamp = pair[1];
                            if(el.notNil) {
                                el.string = if(pair[0] == "SERVER") { "" } {
                                    if(stamp.isNil) { "-" } {
                                        (Main.elapsedTime - stamp).round(0.1).asString
                                    };
                                };
                            };
                        };
                    };

                    // Bancada is a button row, so ~setParam's knob write-back
                    // (which only knows how to set a widget's .value) cannot
                    // relight it. Reconciled from the bus instead, which covers
                    // every source at once — the GUI's own buttons, MIDI CC 16,
                    // the browser's five buttons and a preset load.
                    if(~bancadaButtons.notNil and: { ~buses.notNil }
                        and: { ~buses[\bancada].notNil }) {
                        var bsel = ~buses[\bancada].getSynchronous.round.asInteger.clip(0, 4);
                        if(bsel != ~bancadaShown) {
                            ~bancadaShown = bsel;
                            ~bancadaButtons.do { |b, j|
                                if(b.notNil) { b.value = (j == bsel).binaryValue };
                            };
                        };
                    };

                    // The wiring map is derived from the compiled SynthDefs, and
                    // 3_synthdefs.scd adds them inside waitForBoot — so at the
                    // moment this GUI is built SynthDescLib is usually still
                    // empty. Computed on the first tick that finds them, then
                    // left alone; the rings redraw once and stay.
                    if(~paramVoices.isNil and: { ~computeParamVoices.notNil }) {
                        ~paramVoices = ~computeParamVoices.value;
                        if(~paramVoices.notNil) {
                            (~knobRings ? ()).do { |r| if(r.notNil) { r.refresh } };
                            if(~voiceLegend.notNil) { ~voiceLegend.refresh };
                            ("[gui] wiring map: "
                                ++ ~paramVoices.keys.size ++ " params over "
                                ++ ~voiceOrder.size ++ " voices").postln;
                        };
                    };

                    if(~globalState.notNil) {
                        ~counters.trans.string = (~globalState.transactionCount ? 0).asString;
                    };
                    ~counters.notes.string = (~ethNoteCount  ? 0).asString;
                    ~counters.beats.string = (~beatStepCount ? 0).asString;
                    ~counters.midi.string  = (~midiCCCount   ? 0).asString;

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
            // These were created here and left dangling. ~phenoCursorLabel is
            // the one that hurt: 14_phenological_corpus.scd pushes the ring
            // cursor into it once per phenological day behind a .notNil guard,
            // so after closing this window that guard kept passing and the
            // corpus routine called .string_ on a destroyed Qt view — an error
            // per ring-day, forever, from a routine with its own try/catch that
            // simply logged it and carried on. The rest are the same class of
            // leak with quieter consequences.
            ~ledAges = nil;
            ~knobRings = nil;
            ~voiceLegend = nil;
            ~paramVoices = nil;
            ~bancadaButtons = nil;
            ~bancadaSet = nil;
            ~bancadaShown = nil;
            ~phenoCursorLabel = nil;
            ~phenoSkipButton = nil;
            ~mixerStrips = nil;
            ~recordingStatus = nil;
            ~recordButton = nil;
            ~quickRecButton = nil;
            ~spatialGuiButton = nil;
            ~ledAlive = nil;
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