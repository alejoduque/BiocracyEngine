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
    var statusView, topBar, knobRows;
    var mixerView;
    var sampleView, sampleControlView, sampleHeader, sampleButtonView, stopButton;
    var container, laserView;
    var mainTheme, accentColor, backgroundColor, textColor;
    
    "Creating enhanced GUI with oscilloscope styling...".postln;

    try {
        
        // ─── 1-bit palette (the chrome) ─────────────────────────────────────
        // The chrome — rows, bars, buttons that are not controls — is black
        // and white. The CONTROLS carry the colour of their family (see
        // ~guiFamily below); what follows is the history of the chrome.
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

        // ─── Colour says what a control DOES ────────────────────────────────
        // The 1-bit surface was legible but mute: every knob was the same white,
        // so nothing on it said which controls shape the timbre, which the
        // room, which the rhythm, and which belong to the forest or the chain.
        // Each control now carries the colour of its FAMILY — the indicator, a
        // faint tint of its cell, its caption — and the thin ring around a
        // knob still says which voices it reaches (~voiceColors). Colour for
        // what it does, ring for what it affects. An ACTIVE toggle is still the
        // inversion, now black on its family colour.
        //
        // Forest green and chain amber are the browser slots' own inks
        // (blend/blendLayer.ts INK.neuronal / INK.silicon), so the GUI and the
        // projection share one code: green is the AudioMoth forest everywhere,
        // amber is Ethereum everywhere.
        ~guiFamily = (
            salida:  Color.white,                      // level
            filtro:  Color(1.0, 0.86, 0.30),           // spectrum, filters, noise
            timbre:  Color(1.0, 0.55, 0.20),           // what the voices are made of
            espacio: Color(0.40, 0.70, 1.0),           // time, delay, room, field
            ritmo:   Color(1.0, 0.36, 0.36),           // how often, the tide
            cadena:  Color(1.0, 0.627, 0.251),         // the chain's reach
            bosque:  Color(0.498, 0.839, 0.690),       // the forest: Cámara, corpus
            viz:     Color.gray(0.55)                  // the projection only, no sound
        );
        ~paramFamily = ();
        [
            [\salida,  [\masterVolume, \masterAmp, \mixCarve]],
            [\filtro,  [\spectralShift, \filterCutoff, \noiseLevel, \noiseFilt]],
            [\espacio, [\timeDilation, \delayFeedback, \memoryFeed, \atmosphereMix, \spatialSpread,
                         \chamberMix, \chamberSize, \droneSpace]],
            [\timbre,  [\pitchShift, \harmonicRich, \resonantBody, \textureDepth, \bowlOn, \chinaOn,
                         \padPitch, \droneDepth, \droneFade, \droneMix, \padMotion]],
            [\ritmo,   [\beatTempo, \kickEvery, \percRate, \padEvery, \padVoices, \dustRate,
                         \tideShort, \tideMedia, \tideLarga, \tidePulse, \mixGolpe]],
            [\cadena,  [\transactionInfluence, \chainProcess, \bellEvery]],
            [\bosque,  [\activityThreshold, \windowWidth, \seasonalBias, \absenceWeight, \pulseGain,
                         \opacityFloor, \phenoRate, \corpusLevel, \corpusFx, \phenoSeek, \corpusCrudo, \bancada]],
            [\viz,     [\vizRotation, \vizConsensus, \camaraOpacity,
                         \laserSrcMix, \laserSrcCorpus, \laserSrcRing, \laserSrcChain]]
        ].do { |pair| pair[1].do { |k| ~paramFamily[k] = pair[0] } };
        ~famColor = { |key| ~guiFamily[~paramFamily[key] ? \salida] };
        // The cell's own tint: black leaning 7 % toward the family.
        ~famBg = { |key| Color.black.blend(~famColor.(key), 0.07) };
        // Captions in the family colour pulled toward white, so a value stays
        // readable on any hue.
        ~famText = { |key| ~famColor.(key).blend(Color.white, 0.4) };

        // One typeface everywhere. Menlo ships with macOS, so this never falls
        // back silently the way a missing face would.
        ~monoFont = "Menlo";

        // Captions — knob and toggle labels, mixer and group headings, the
        // title — in a monospace BITMAP face: Departure Mono (Helena Zhang,
        // SIL OFL 1.1; the font and its licence are in fonts/, and
        // start_ecosystem.sh installs it). A pixel face is only sharp on its
        // own grid, 11 px and its multiple 22, so captions go to exactly those
        // sizes and never bold: Qt fakes bold by smearing, which undoes the
        // pixel. Buttons stay in Menlo — their widths were set for it.
        // Without the font installed, everything falls back to Menlo at the
        // sizes it had.
        ~labelFont = if(Font.availableFonts.includesEqual("Departure Mono")) {
            "Departure Mono" } { ~monoFont };
        ~labelBitmap = (~labelFont != ~monoFont);
        ~labelPx = if(~labelBitmap) { 11 } { 10 };
        ~labelF = { |big = false|
            if(~labelBitmap) { Font(~labelFont, if(big) { 22 } { 11 }) }
                { Font(~monoFont, if(big) { 16 } { 10 }, big) }
        };

        backgroundColor = mainTheme.background;
        textColor = mainTheme.foreground;
        accentColor = mainTheme.accent;

        // Create and store window sized to the ACTUAL screen. The previous
        // fixed 1100x1380 rect landed partly off-screen on laptop displays
        // (Qt warned "outside any known screen" at boot). All content now
        // lives in a ScrollView canvas: small screens scroll vertically
        // instead of clipping the REC strip; knob/button sizes unchanged.
        ~guiScreen = Window.availableBounds;
        ~mainWindow = Window("BiocracyEngine", Rect(
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
        ~scrollCanvas.layout_(VLayout().margins_(4).spacing_(5));
        ~scrollView.canvas = ~scrollCanvas;
        ~mainWindow.layout.add(~scrollView, stretch: 1);

        // Create header
        // A row rather than a bare StaticText: the laser collapse button has to
        // live somewhere that does not vanish when the laser column does.
        ~headerText = StaticText()
            .string_("BiocracyEngine")
            .font_(~labelF.(true))
            .align_(\center)
            .stringColor_(mainTheme.yellow);

        // Create main container views for merged controls + samples.
        //
        // Every control row uses spacing 6, not a mix of 8 and 10. The pitch
        // between columns has to be identical or the rows do not form a grid,
        // and at 10 the eight-control Cadencia strip came to 1144 px against an
        // 1118 px surface — it overflowed on the spacing alone, which is the
        // thing my earlier width arithmetic kept leaving out.
        //
        // Chrome budget, second pass: margins 6→4 and horizontal spacing
        // 20→10 across every row. The first pass took the vertical padding
        // out; this one takes the horizontal air out, which is what let the
        // knobs come down from 80 px without the rows looking sparse. Fourteen
        // rows × (4 px of margin + ~50 px of shed knob height) is most of a
        // laptop screen, and the REC strip and preset row are what was falling
        // off the bottom of it.
        // The status lights and the four counters share one row now (they were
        // two of 46 px each); the knob rows are built from ~guiRows further
        // down, one View per row.
        statusView = View().background_(backgroundColor.blend(mainTheme.accent, 0.03))
            .layout_(HLayout().margins_(4).spacing_(10));
        statusView.fixedHeight = 40;

        // Strips packed close: each now carries its pan knob and AUTO beside
        // the fader, so the gaps between strips came down instead.
        mixerView = View().background_(Color.black)
            .layout_(HLayout().margins_(3).spacing_(2));

        // Create sample views
        sampleView = View().background_(backgroundColor.blend(mainTheme.accent, 0.04))
            .layout_(VLayout().margins_(4).spacing_(4));
        sampleControlView = View().background_(backgroundColor.blend(Color.black, 0.1))
            .layout_(HLayout().margins_(4).spacing_(8));

        mixerView.fixedHeight = 150;
        // sampleControlView is 52 px of knob + two label lines + margins.
        sampleControlView.fixedHeight = 92;
        // sampleView HOLDS sampleControlView: the 16 px bold header (~22), the
        // trigger buttons with their 10 px margins (~48), 92, two 4 px gaps and
        // 8 px of margins = 178. At 158 the knobs were squeezed by the header.
        sampleView.fixedHeight = 178;

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

        // ─── Lit when it acts, grey when it cannot ──────────────────────
        // A knob goes grey when everything it is known to reach is silent:
        // the voices on its ring, each through its own fader (~voiceLayer),
        // and the layers that read the knobs outside the ring (~layerReach:
        // GOLPE and the motors take ~controlValues and the buses in
        // language-side code, which SynthDescLib cannot see). A layer is
        // silent at fader 0 or muted. A key with no known reach — CÁMARA,
        // VIZ, the faders themselves — never greys. Purely a look: a grey
        // knob still works. While a GOLPE row or step is being tuned the five
        // knobs that tune it light up and everything else greys (focus).
        // Moving a layer's fader (GUI or MIDI) does the same for that layer:
        // the knobs that reach it light up, the rest grey, while the hand is
        // on it and ~mixFocusHold seconds after — where to reach next.
        //
        // ~layerReach is hand-kept: every ~motIn / ~motVal / k.(\…) read in
        // 18_motores.scd and 19_golpe.scd. Keep it in step with them.
        ~voiceLayer = (opalDrone: \mixDrone, elektronBell: \mixPad, opalPerc: \mixPerc,
            opalKick: \mixKick, opalDust: \mixDust, samplePlayerMono: \mixSample,
            corpusVoice: \mixCorpus, corpusUltrasonic: \mixUltra);
        ~layerReach = (
            mixGolpe: [\atmosphereMix, \beatTempo, \delayFeedback, \filterCutoff, \harmonicRich,
                \masterAmp, \masterVolume, \memoryFeed, \noiseFilt, \noiseLevel, \percRate,
                \pitchShift, \resonantBody, \spatialSpread, \spectralShift, \textureDepth,
                \timeDilation, \transactionInfluence],
            mixMotor: [\delayFeedback, \droneFade, \filterCutoff, \harmonicRich, \masterAmp,
                \masterVolume, \memoryFeed, \noiseFilt, \noiseLevel, \opacityFloor, \pitchShift,
                \pulseGain, \resonantBody, \spatialSpread, \spectralShift, \textureDepth,
                \timeDilation, \transactionInfluence],
            // 14_phenological_corpus.scd reads the Cámara in language
            // (~phenoVal), not through the voices' buses.
            mixCorpus: [\activityThreshold, \windowWidth, \seasonalBias, \pulseGain,
                \opacityFloor, \phenoRate, \phenoSeek, \bancada, \dia, \corpusFx, \corpusCrudo, \corpusLevel],
            mixUltra: [\activityThreshold, \windowWidth, \seasonalBias, \absenceWeight,
                \opacityFloor, \phenoRate, \phenoSeek, \bancada, \dia, \corpusLevel]
        );
        // GOLPE's bancada (19_golpe.scd, ~golpeBancada) is also a Cámara knob.
        ~layerReach[\mixGolpe] = ~layerReach[\mixGolpe] ++ [\bancada];
        // The five motor faders and SEQ under MOTOR share its reach.
        ~layerAlias = (mixRemuestreo: \mixMotor, mixEspectro: \mixMotor, mixCaos: \mixMotor,
            mixRuptura: \mixMotor, mixMasa: \mixMotor, mixSeq: \mixMotor);
        // The layers a control reaches: its ring voices through their faders,
        // and the hand-kept reach above.
        ~keyLayers = { |key|
            var w = (~paramVoices ? ())[key];
            var layers = Set.new;
            w !? { (w[\live] ++ w[\spawn]).do { |v| ~voiceLayer[v] !? { |m| layers.add(m) } } };
            ~layerReach.keysValuesDo { |m, keys| if(keys.includes(key)) { layers.add(m) } };
            layers
        };
        // The fader being moved, and when it last moved.
        ~mixFocus = nil;
        ~mixFocusHold = 3.0;
        ~mixFocusLayers = ~voiceLayer.values.asSet ++ ~layerReach.keys ++ ~layerAlias.keys;
        ~mixFocusOn = { |name|
            if(~mixFocusLayers.includes(name)) {
                var layer = ~layerAlias[name] ? name;
                var fresh = ~mixFocus.isNil or: { ~mixFocus[\layer] != layer }
                    or: { (Main.elapsedTime - ~mixFocus[\at]) > ~mixFocusHold };
                ~mixFocus = (layer: layer, at: Main.elapsedTime);
                // Restyle when the focus starts or changes; while the hand
                // stays on the same fader the 2 Hz refresh keeps it. Queued
                // after the event, never inside it (.defer runs at once from a
                // GUI action): the fader's own move goes first.
                if(fresh) { AppClock.sched(0, { ~guiLookRefresh !? { ~guiLookRefresh.value }; nil }) };
            };
        };
        ~layerSounds = { |mix|
            (((~controlValues ? ())[mix] ? 0) > 0.001) and: { (~mixerMuted ? ())[mix] != true }
        };
        // One control's look: \normal (its family), \dim (grey), \focus
        // (its family, caption white), \target (white, the caption inverted:
        // the control the LC2 is about to be assigned to, APRENDE). Restyled
        // only when it changes. A mixer fader keeps its layer's colour.
        ~knobLook = ();
        ~controlLook = { |key, mode|
            if((~knobLook[key] ? \normal) != mode) {
                var view = (~knobViews ? ())[key];
                var label = (~controlLabels ? ())[key];
                var fader = view.isKindOf(Slider);
                var fam = case { mode == \dim } { Color.gray(0.3) } { mode == \target } { Color.white }
                    { fader } { ~stripColor.(key) } { ~famColor.(key) };
                var famBg = ~famBg.(key);
                ~knobLook[key] = mode;
                if(view.notNil and: { view.isClosed.not }) {
                    case
                    { view.isKindOf(Knob) } {
                        view.color = [famBg, fam, fam.blend(Color.white, 0.35), fam.copy.alpha_(0.2)];
                    }
                    { view.isKindOf(Button) } {
                        var cap = view.states[0][0], v = view.value;
                        view.states = [[cap, fam, famBg], [cap, Color.black, fam]];
                        view.value = v;
                    }
                    { fader } { view.knobColor = fam };
                };
                if(label.notNil and: { label.isClosed.not }) {
                    label.stringColor = switch(mode,
                        \dim, { Color.gray(0.42) }, \focus, { Color.white }, \target, { Color.black },
                        { if(fader) { Color.gray(0.6) } { ~famText.(key) } });
                    label.background = if(mode == \target) { Color.white } { Color.clear };
                };
                (~knobRings ? ())[key] !? { |r| if(r.isClosed.not) { r.refresh } };
            };
        };
        // APRENDE (LC2) comes first: the control waiting for an LC2 control
        // is \target, the one just assigned \focus, and grey means no LC2
        // control reaches it — the map, on the surface itself.
        ~guiLookRefresh = {
            var edit = ~golpeEdit, ap = ~lc2Aprende;
            var mf = ~mixFocus !? { |f| if((Main.elapsedTime - f[\at]) <= ~mixFocusHold) { f[\layer] } };
            (~knobViews ? ()).keysValuesDo { |key, view|
                case
                { ap.notNil } {
                    ~controlLook.(key, case
                        { ap[\destino] == key } { \target }
                        { ap[\hecho] == key } { \focus }
                        { ~lc2Controles.(key).isEmpty } { \dim } { \normal });
                }
                { view.isKindOf(Knob) or: { view.isKindOf(Button) } } {
                    var layers = ~keyLayers.(key);
                    ~controlLook.(key, case
                        { edit.notNil } { if((~golpeEditKnobs ? ())[key].notNil) { \focus } { \dim } }
                        { mf.notNil } { if(layers.includes(mf)) { \focus } { \dim } }
                        { if(layers.isEmpty or: { layers.any { |m| ~layerSounds.(m) } }) { \normal } { \dim } });
                }
                { ~controlLook.(key, \normal) };
            };
        };

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
            ~ledLabels = ~ledLabels ?? ();
            ~ledLabels[label.asSymbol] = labelText;
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
            statusView.layout.add(~counters[key].parent);
        });

        // ─── Legend for the knob rings ──────────────────────────────────
        // Without it the ring is a decoration. With it, one glance says which
        // arc belongs to which voice, and the colours are the same ones the
        // projection uses for the same voices.
        // Two cells of the knob grid (the empty end of DRONE·PAD), four rows of
        // two: it sits among the knobs it explains instead of taking a row.
        ~voiceLegend = UserView()
            .fixedSize_(Size(200, 80))
            .background_(Color.black)
            .drawFunc_({ |uv|
                var order = ~voiceOrder ? [];
                order.do { |v, i|
                    var col = (~voiceColors[v] ? Color.gray(0.5));
                    var txt = (~voiceLabels[v] ? v.asString);
                    var x = 4 + ((i % 2) * 100), y = 4 + ((i div: 2) * 19);
                    // The swatch is drawn as the same wedge shape the rings
                    // use, at the same clock position, so the legend reads as
                    // a key to the geometry rather than a separate colour list.
                    Pen.width = 2.2;
                    Pen.strokeColor = col;
                    Pen.addAnnularWedge(Point(x + 8, y + 8), 5.5, 7.5,
                        (i / order.size.max(1) * 2pi) - (pi/2) - 0.35,
                        0.7);
                    Pen.stroke;
                    Pen.strokeColor = Color.gray(0.30);
                    Pen.addOval(Rect(x + 2, y + 2, 12, 12));
                    Pen.stroke;
                    Pen.stringAtPoint(txt, Point(x + 18, y + 2), Font(~monoFont, 8), col);
                };
            });

        // Control specs and values come from the canonical registry
        // (0_parameters.scd) — the duplicated literals that used to live here
        // had drifted from the MIDI and OSC copies of the same ranges.
        if(~controlSpecs.isNil or: { ~controlValues.isNil }) {
            "0_parameters.scd not loaded — GUI knobs have no specs!".error;
            ~controlSpecs = ~controlSpecs ?? ();
            ~controlValues = ~controlValues ?? ();
        };

        // ─── The knob grid: four rows, two halves of seven ──────────────
        // Every row is a head and seven cells, twice, so every column lines up
        // down the page: 2 × 58 + 14 × 98 px cells with 4 px spacing comes to
        // 1544 of the ~1550 px surface (laser column collapsed). The controls
        // are grouped by what they DO, and the families are the colours above:
        //
        //   SALIDA·FILTRO  level, then the spectrum and the noise bed, MEZCLA
        //   ESPACIO        time, delay, memory, room, field, the shared sala
        //   TIMBRE         what the voices are made of, the struck voice's halves
        //   DRONE·PAD      the bed and the pad (and the ring legend)
        //   RITMO          how often each layer speaks; STRIKE CHAIN is the
        //                  chain's own rate, so it wears the chain's amber
        //   MAREA·CADENA·VIZ  the tide arcs, the chain's reach, the projection
        //   CÁMARA         who the ring admits (Art. 43-47)
        //   CORPUS         the AudioMoth layer: level, fx, seek, CRUDO, the
        //                  bancadas and the jump to the next recorded day
        //
        // nil is an empty cell. \arcos, \bancada, \dia and \legend are built
        // by ~makeCell below; \legend spans two cells. Layout only: MIDI CCs,
        // OSC paths and preset keys map by name and are untouched.
        ~guiRows = [
            [["SALIDA·\nFILTRO", [\masterVolume, \masterAmp, \spectralShift, \filterCutoff,
                                  \noiseLevel, \noiseFilt, \mixCarve]],
             ["ESPACIO", [\timeDilation, \delayFeedback, \memoryFeed, \atmosphereMix,
                         \spatialSpread, \chamberMix, \chamberSize]]],
            [["TIMBRE", [\pitchShift, \harmonicRich, \resonantBody, \textureDepth,
                        \bowlOn, \chinaOn, \padPitch]],
             ["DRONE·\nPAD", [\droneDepth, \droneFade, \droneSpace, \droneMix,
                              \padMotion, \legend, nil]]],
            [["RITMO", [\beatTempo, \kickEvery, \percRate, \padEvery,
                       \padVoices, \bellEvery, \dustRate]],
             ["MAREA·\nCADENA\n·VIZ", [\arcos, \transactionInfluence, \chainProcess,
                                       \vizRotation, \vizConsensus, \camaraOpacity, nil]]],
            [["CÁMARA", [\activityThreshold, \windowWidth, \seasonalBias, \absenceWeight,
                        \pulseGain, \opacityFloor, \phenoRate]],
             ["CORPUS", [\corpusLevel, \corpusFx, \phenoSeek, \corpusCrudo,
                        \bancada, \dia, nil]]]
        ];

        // Enhanced knob function with oscilloscope aesthetics
        ~makeKnob = { |label, minVal, maxVal, defaultVal=0.5, mapping=\lin|
            var container, knobContainer, spec, knob, valueLabel, paramName, ring, fam, famBg;

            // The family colour (see ~guiFamily): the indicator, the caption
            // and a faint tint of the whole cell.
            fam = ~famColor.(label.asSymbol);
            famBg = ~famBg.(label.asSymbol);
            container = View().background_(famBg);
            container.layout_(VLayout().margins_(2).spacing_(2));
            // Every knob cell is the same width in every row. Without this the
            // cell width was whatever the row's HLayout had left to divide, so
            // the seven-knob Cámara row came out on a visibly different pitch
            // from the five- and six-knob rows above it and the surface read as
            // three different grids stacked. 132 is what seven cells plus their
            // gaps and margins fit into the 1100 px window; rows with fewer
            // knobs now leave trailing space instead of stretching.
            container.fixedWidth_(98);

            // No layout on this one: the ring has to sit under the knob at an
            // absolute position, and a layout would stack them instead. 72 px
            // holds a 60 px knob inset by 6, leaving the annulus for the ring.
            knobContainer = View().background_(famBg)
                .fixedWidth_(72).fixedHeight_(72);

            paramName = label.asSymbol;
            ring = UserView(knobContainer, Rect(0, 0, 72, 72))
                .background_(famBg)
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
                        var c;
                        // Lit: the voice reads this control live off a bus, so
                        // the knob changes a note already sounding. Hollow: it
                        // is applied when the note spawns, so the knob shapes
                        // the NEXT one. Nearly dark: no reach at all.
                        Pen.width = if(live) { 2.2 } { 1.2 };
                        c = case
                            { live }  { col }
                            // .copy: alpha_ changes a Color in place, and this
                            // faded the shared ~voiceColors entry for good.
                            { spawn } { col.copy.alpha_(0.38) }
                            { Color.gray(0.16) };
                        // A grey knob (~controlLook) keeps its ring, faintly.
                        if((~knobLook ? ())[paramName] == \dim) { c = c.copy.alpha_(c.alpha * 0.3) };
                        Pen.strokeColor = c;
                        Pen.addAnnularWedge(Point(36, 36), 32.5, 34.5, a0, a1 - a0);
                        Pen.stroke;
                    };
                });

            spec = ControlSpec(minVal, maxVal, mapping);
            knob = Knob(knobContainer, Rect(6, 6, 60, 60))
                .mode_(\vert)
                // [body, value, deviation, deviation background]. The last was
                // mainTheme.foreground.alpha_(0.2), which faded the shared
                // foreground — and every label drawn after the first knob — to
                // 20 % white for the whole session.
                .color_([famBg, fam, fam.blend(Color.white, 0.35), fam.copy.alpha_(0.2)])
                .value_(spec.unmap(defaultVal));

            // ALL CAPS throughout: camelCase parameter names read as two
            // words at a glance once the case is flattened, and caps hold
            // the monospace grid better than mixed case at 10px.
            // A few names do not survive being flattened to caps: PADEVERY and
            // PADVOICES read as one word and do not say which LAYER they act
            // on, which is the whole question when a rate row sits above a
            // level row for the same five layers. Overridden here rather than
            // by renaming the parameters, because the names are also the OSC
            // paths, the preset keys and the ~beatParams mirrors — renaming
            // them would break saved configs for a cosmetic gain. The
            // caption itself — ~knobLabels first, then ALL CAPS, name over
            // value — is built by ~knobText (0_parameters.scd), the one
            // format every writer of a caption shares.
            valueLabel = StaticText()
                .string_(~knobText.(label.asSymbol, defaultVal))
                .stringColor_(~famText.(label.asSymbol))
                .font_(~labelF.())
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
                        valueLabel.string = ~knobText.(paramName, mappedVal);
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

        // ── Factories, defined before anything calls them ────────────────
        // This file is one linear script: an environment variable holds nil
        // until its assignment line RUNS. ~inlineHead lived down beside the
        // scroll-canvas assembly, six hundred lines after the rows that use
        // it, so every one of those calls was nil.value(...) -> nil, and
        // layout.add(nil) is a silent no-op. NÚCLEO, AMBIENTE, DRONE, CÁMARA,
        // BOWL/CHINA and CADENCIA have never once been drawn.
        //
        // ~makeToggle had the same shape and cost the marea its toggles the
        // moment they moved up into the corpus strip: at their old position
        // they happened to sit after the definition, at the new one they sit
        // before it. Nothing about the move was wrong except the ordering,
        // and nothing reported it — no error, just four missing buttons.
        // A group marker INSIDE a row, for strips that carry two groups. The
        // separate-row version wastes the width: bowl and china are two knobs,
        // 264 px of an 1118 px surface, and a heading of their own above them
        // spent a further 14 px of height to say so.
        // 58 px, not 50: in the bitmap face a character is 7 px, and AMBIENTE
        // and CADENCIA are eight of them. 58 is also the ceiling — the core
        // strip is 14 knobs and two of these, 1552 of the 1562 px available
        // with the laser column collapsed. Longer captions break onto a second
        // line in the caption itself ("BOWL/\nCHINA").
        ~inlineHead = { |caption, color|
            StaticText().string_(caption)
                .stringColor_(color ? mainTheme.accent)
                .font_(if(~labelBitmap) { ~labelF.() } { Font(~monoFont, 9, true) })
                .align_(\right)
                // 52: the longest head line is seven bitmap characters (49 px).
                // At 58 a row of two heads and fourteen cells came to 1572 px
                // against a 1570 px window.
                .fixedWidth_(52)
        };

        ~sectionHead = { |caption|
            StaticText().string_(caption)
                .stringColor_(mainTheme.accent)
                .font_(~labelF.())
                .fixedHeight_(16)
        };

        // ─── Row 6: Marea — arco de densidad ──────────────────────────────
        // Toggles, not knobs. They register into ~knobViews / ~controlLabels
        // exactly like ~makeKnob does, so ~setParam's deferred GUI update
        // (0_parameters.scd step 4) drives them with no special-casing:
        // Button:value_ accepts the 0.0/1.0 that spec.unmap returns. That is
        // what makes the radio behaviour visible here when the browser or a
        // MIDI CC is the surface that moved.
        // compact: just the button, 17 px high, for cells that stack several
        // (the four tide arcs share one cell). It still registers, so
        // ~setParam drives it; with no value line it registers no label.
        ~makeToggle = { |key, caption, compact = false|
            var container, button, valueLabel, spec, fam, famBg;
            spec = ~controlSpecs[key];
            fam = ~famColor.(key);
            famBg = ~famBg.(key);
            // Off: the caption in its family colour. On: inverted, black on
            // the family colour — still the 1-bit state signal, now saying
            // whose state it is.
            button = Button()
                .states_([
                    [caption, fam, famBg],
                    [caption, Color.black, fam]
                ])
                .font_(Font(~monoFont, if(compact) { 9 } { 11 }, true))
                .value_((~controlValues[key] ? 0).asInteger);
            // Route through the single write path so exclusivity, the beat
            // mirror and the browser echo all happen; value_ from ~setParam
            // does not re-fire this action, so there is no feedback loop.
            button.action = { |b| ~setParam.(key, b.value, \gui) };
            ~knobViews = ~knobViews ?? ();
            ~knobViews[key] = button;
            if(compact) {
                button.fixedHeight_(17);
            } {
                container = View().background_(famBg);
                container.layout_(VLayout().margins_(3).spacing_(3));
                // One grid column wide, the same as ~makeKnob's container.
                container.fixedWidth_(98);
                button.maxHeight_(24);
                valueLabel = StaticText()
                    // ~knobLabels first, ~labelCase only as the fallback.
                    .string_(~knobText.(key, ~controlValues[key] ? 0))
                    .stringColor_(~famText.(key))
                    .font_(~labelF.())
                    .align_(\center);
                container.layout.add(button);
                container.layout.add(valueLabel);
                ~controlLabels = ~controlLabels ?? ();
                ~controlLabels[key] = valueLabel;
                container
            };
        };

        // ─── The rows, built from ~guiRows ──────────────────────────────
        ~knobs = ();
        ~tideCaptions = (tideShort: "CORTO", tideMedia: "MEDIO", tideLarga: "LARGO", tidePulse: "PULSO");
        // BANCADA · Article 43, as five seats you can press. A radio, not a
        // knob: a Knob cannot serve a stepped spec here (~makeKnob drops the
        // step, ~setParam re-quantises and writes back, and a \vert Knob drags
        // relative to its value, so it could never leave 0). Not relit by the
        // buttons themselves — the 2 Hz reconcile in ~guiRoutine reads the bus
        // and relights them for every source at once (GUI, MIDI CC 16, browser,
        // a preset load).
        ~bancadaCaptions = ["TODAS", "NOCTURNA", "INSECTOS", "CORO", "TRANSICIÓN"];
        ~bancadaButtons = Array.newClear(5);
        ~bancadaSet = { |idx|
            ~setParam.(\bancada, idx.asInteger.clip(0, 4), \gui);
            ~bancadaShown = nil;
        };
        ~makeCell = { |key|
            var fam = ~famColor.(key), famBg = ~famBg.(key);
            case
            { key.isNil } { View().background_(Color.black).fixedWidth_(98) }
            // The four tide arcs, stacked in one cell (ritmo red).
            { key == \arcos } {
                var v = View().background_(~famBg.(\tideShort)).fixedWidth_(98);
                v.layout_(VLayout().margins_(3).spacing_(3));
                [\tideShort, \tideMedia, \tideLarga, \tidePulse].do { |k|
                    ~knobs[k] = ~makeToggle.value(k, ~tideCaptions[k], true);
                    v.layout.add(~knobs[k]);
                };
                v
            }
            // The five bancadas, stacked (forest green).
            { key == \bancada } {
                var v = View().background_(famBg).fixedWidth_(98);
                v.layout_(VLayout().margins_(2).spacing_(2));
                5.do { |i|
                    var btn = Button()
                        .states_([
                            [~bancadaCaptions[i], fam, famBg],
                            [~bancadaCaptions[i], Color.black, fam]
                        ])
                        .font_(Font(~monoFont, 8, true))
                        .fixedHeight_(14)
                        .value_(((~controlValues[\bancada] ? 0).asInteger == i).binaryValue);
                    btn.action = { ~bancadaSet.(i) };
                    ~bancadaButtons[i] = btn;
                    v.layout.add(btn);
                };
                v
            }
            // Where the ring is, and the jump to the next day that has audio
            // (331 of 365 ring days have no recording).
            { key == \dia } {
                var v = View().background_(~famBg.(\phenoSeek)).fixedWidth_(98);
                v.layout_(VLayout().margins_(3).spacing_(4));
                // The ring's own reading of where it is, refreshed by 14_'s routine.
                ~phenoCursorLabel = StaticText()
                    .string_("doy — · —")
                    .font_(Font(~monoFont, 9, true))
                    .stringColor_(~famText.(\phenoSeek))
                    .align_(\center);
                ~phenoSkipButton = Button()
                    .states_([[">>  DÍA", ~famColor.(\phenoSeek), ~famBg.(\phenoSeek)]])
                    .font_(Font(~monoFont, 13, true))
                    .fixedHeight_(30)
                    .action_({
                        if(~phenoNextRecorded.notNil) { ~phenoNextRecorded.value }
                            { "[pheno] corpus layer not loaded".postln };
                    })
                    // APRENDE: DÍA is a destination for an LC2 key (LAUNCH).
                    .mouseDownAction_({ |v, x, y, mods, boton| ~lc2Tocar !? { ~lc2Tocar.([\accion, \dia], mods, boton) } })
                    .mouseUpAction_({ ~lc2Quieto !? { ~lc2Quieto.value } });
                v.layout.add(~phenoCursorLabel);
                v.layout.add(~phenoSkipButton);
                v.layout.add(nil);
                v
            }
            // The ring legend, two cells wide.
            { key == \legend } { ~voiceLegend }
            // Stepped 0/1 specs are toggles (CRUDO); the rest are knobs.
            { key == \corpusCrudo } {
                ~knobs[key] = ~makeToggle.value(key, "CRUDO");
                ~knobs[key]
            }
            {
                var sp = ~controlSpecs[key];
                if(sp.isNil) { View().background_(Color.black).fixedWidth_(98) } {
                    ~knobs[key] = ~makeKnob.value(key.asString, sp.minval, sp.maxval,
                        ~controlValues[key], sp.warp);
                    ~knobs[key]
                }
            };
        };
        knobRows = ~guiRows.collect { |halves|
            var row = View().background_(Color.black).fixedHeight_(88);
            row.layout_(HLayout().margins_(4).spacing_(4));
            halves.do { |half|
                var skip = false;
                // The head takes the colour of the half's first real control.
                var lead = half[1].detect { |k| k.notNil and: { ~paramFamily[k].notNil } };
                row.layout.add(~inlineHead.value(half[0], lead !? { ~famText.(lead) }));
                half[1].do { |key|
                    if(skip) { skip = false } {
                        row.layout.add(~makeCell.value(key));
                        if(key == \legend) { skip = true };
                    };
                };
            };
            // The slack goes to the end, never between cells, so the columns
            // of every row stay on one pitch.
            row.layout.add(View().background_(Color.black));
            row
        };

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
        // ─── Level meters: one per strip, fed by the stems ──────────────
        // Each layer has its own audio bus now (3_synthdefs.scd, ~stems), and
        // its \stemSum reports [peak, rms] on /stem twelve times a second.
        // The meter sits beside the fader it answers to. MOTOR shows the
        // loudest of the five motors under it.
        ~stripStems = (
            mixDrone: [\drone], mixPad: [\pad], mixKick: [\kick], mixPerc: [\perc],
            mixDust: [\dust], mixSample: [\sample], mixCorpus: [\corpus], mixUltra: [\ultra],
            mixGolpe: [\golpe],
            mixMotor: [\remuestreo, \seq, \espectro, \caos, \ruptura, \masa],
            mixRemuestreo: [\remuestreo], mixSeq: [\seq], mixEspectro: [\espectro], mixCaos: [\caos],
            mixRuptura: [\ruptura], mixMasa: [\masa]
        );
        ~stripMeters = ();
        ~stemPanViews = ();
        ~stemLevels = ();
        OSCdef(\stemLevel).free;
        OSCdef(\stemLevel, { |msg|
            var name = (~stemNames ? [])[msg[3].asInteger];
            if(name.notNil) { ~stemLevels[name] = [msg[4], msg[5]] };
        }, '/stem');
        // -60..0 dBFS across the meter's height.
        ~meterPos = { |amp| amp.max(1e-6).ampdb.linlin(-60, 0, 0, 1) };
        if(~stemMeterRoutine.notNil) { ~stemMeterRoutine.stop };
        ~stemMeterRoutine = Routine({
            loop {
                ~stripMeters.keysValuesDo { |param, meter|
                    if(meter.notNil and: { meter.isClosed.not }) {
                        var lv = (~stripStems[param] ? []).collect { |n| ~stemLevels[n] ? [0, 0] };
                        if(lv.size > 0) {
                            meter.value = ~meterPos.(lv.collect(_[1]).maxItem);
                            meter.peakLevel = ~meterPos.(lv.collect(_[0]).maxItem);
                        };
                    };
                };
                (1/12).wait;
            }
        }).play(AppClock);

        // Each strip in its LAYER's colour — the same hue as that voice's
        // slice on the knob rings and its screen in the projection. GOLPE in
        // rhythm red, the five motors in one violet, MOTOR (their master) and
        // anything unlisted in white.
        ~stripVoice = (mixDrone: \opalDrone, mixPad: \elektronBell, mixKick: \opalKick,
            mixPerc: \opalPerc, mixDust: \opalDust, mixSample: \samplePlayerMono,
            mixCorpus: \corpusVoice, mixUltra: \corpusUltrasonic);
        ~stripColor = { |p|
            case
            { ~stripVoice[p].notNil } { ~voiceColors[~stripVoice[p]] }
            { p == \mixGolpe } { ~guiFamily[\ritmo] }
            { [\mixRemuestreo, \mixSeq, \mixEspectro, \mixCaos, \mixRuptura, \mixMasa].includes(p) } {
                Color(0.72, 0.52, 1.0) }
            { Color.white }
        };
        ~makeMixStrip = { |paramName, caption|
            var strip, slider, valueLabel, muteButton, spec, meter;
            var col = ~stripColor.(paramName);

            spec = ~controlSpecs[paramName];
            strip = View().background_(Color.black.blend(col, 0.06));
            strip.layout_(VLayout().margins_(2).spacing_(2));

            strip.layout.add(
                StaticText()
                    .string_(caption)
                    .font_(~labelF.())
                    .stringColor_(col.blend(Color.white, 0.3))
                    .align_(\center)
                    .maxHeight_(14)
            );

            // Narrow and tall: Qt reads the bounds as a vertical fader, which
            // is more reliable across versions than asking for an orientation.
            slider = Slider()
                .maxWidth_(30)
                .background_(Color.black.blend(col, 0.18))
                .knobColor_(col)
                .value_(spec.unmap(~controlValues[paramName]));

            // The value alone: the layer's name is the caption at the top of
            // the strip. Registered so ~setParam's refresh keeps it that way.
            ~labelFormats[paramName] = ~valueOnly;
            valueLabel = StaticText()
                .string_(~knobText.(paramName, ~controlValues[paramName]))
                .font_(~labelF.())
                .stringColor_(Color.gray(0.6))
                .align_(\center)
                .maxHeight_(16);

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

            // Centred under its caption. The slider is maxWidth 30 inside a
            // VLayout, so it sat hard left while the label above and the value
            // below were both align_(\center) across the full strip — the
            // column read as if the fader belonged to the strip to its left.
            // HLayout(nil, …, nil) puts stretchable space on both sides.
            // RMS as the bar, peak as the line above it; amber from -6 dBFS,
            // red from -1.
            meter = LevelIndicator()
                .maxWidth_(8)
                .drawsPeak_(true)
                // The layer's colour to −6 dBFS, then amber, then red.
                .meterColor_(col)
                .warningColor_(Color(1.0, 0.70, 0.20))
                .criticalColor_(Color(1.0, 0.25, 0.20))
                .warning_(~meterPos.(0.5))
                .critical_(~meterPos.(0.89));
            ~stripMeters[paramName] = meter;
            // ── Pan, and AUTO — BESIDE the fader, never under it ─────────
            // Under it they shortened the fader and the meter. Only on strips
            // that are one layer (MOTOR is a master over five). AUTO off: the
            // knob is the position. AUTO on: the layer travels between both
            // sides at its own slow rate and the knob is how far — at centre
            // it stays still. State: ~stemPan (3_synthdefs.scd).
            if((~stripStems[paramName] ? []).size == 1) {
                var stemName = ~stripStems[paramName][0];
                var st = (~stemPan ? ())[stemName] ? (pan: 0, auto: 0);
                var panKnob = Knob()
                    .centered_(true)
                    .mode_(\vert)
                    .fixedSize_(Size(20, 20))
                    .value_(((st[\pan] ? 0) + 1) / 2)
                    .action_({ |k| ~stemPanSet.(stemName, (k.value * 2) - 1, nil) });
                var autoBtn = Button()
                    .states_([
                        ["A", mainTheme.dim, backgroundColor],
                        ["A", Color.black, Color.white]
                    ])
                    .font_(Font(~monoFont, 8, true))
                    .fixedSize_(Size(20, 14))
                    .value_((st[\auto] ? 0).round.asInteger)
                    .action_({ |b| ~stemPanSet.(stemName, nil, b.value) });
                autoBtn.toolTip_("AUTO: el canal viaja entre los dos lados; la perilla es cuánto");
                panKnob.toolTip_("PAN (con AUTO: el ancho del recorrido)");
                ~stemPanViews[stemName] = { |s|
                    panKnob.value = ((s[\pan] ? 0) + 1) / 2;
                    autoBtn.value = (s[\auto] ? 0).round.asInteger;
                };
                strip.layout.add(HLayout(nil, slider, meter,
                    VLayout(panKnob, autoBtn, nil).spacing_(2), nil).spacing_(2));
            } {
                strip.layout.add(HLayout(nil, slider, meter, nil).spacing_(2));
            };
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
                .string_("MATRIX\nMIXER\nLC2 F1-12\nCC 42-49")
                .font_(Font(~monoFont, 10, true))
                .stringColor_(Color.white)
                .align_(\left)
                .maxWidth_(96)
        );
        [
            [\mixDrone,  "DRONE"],  [\mixPad,    "PAD"],
            [\mixKick,   "KICK"],   [\mixPerc,   "PERC"],
            [\mixDust,   "DUST"],   [\mixSample, "SAMPLE"],
            [\mixCorpus, "CORPUS"], [\mixUltra,  "ULTRA"],
            // (GOLPE's strip lives in its own row, beside its rhythms and kits.)
            // MOTOR is the master of the five after it (18_motores.scd).
            [\mixMotor,  "MOTOR"],
            [\mixRemuestreo, "REMU"], [\mixSeq, "SEQ"], [\mixEspectro, "ESPEC"], [\mixCaos, "CAOS"],
            [\mixRuptura, "RUPT"], [\mixMasa, "MASA"]
        ].do { |pair|
            mixerView.layout.add(~makeMixStrip.value(pair[0], pair[1]));
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
                // The sample player's own violet (its ring colour).
                .color_([mainTheme.background, ~voiceColors[\samplePlayerMono],
                    ~voiceColors[\samplePlayerMono].blend(Color.white, 0.35),
                    ~voiceColors[\samplePlayerMono].copy.alpha_(0.2)])
                .value_(spec.unmap(defaultVal));

            // ALL CAPS throughout: camelCase parameter names read as two
            // words at a glance once the case is flattened, and caps hold
            // the monospace grid better than mixed case at 10px.
            // A few names do not survive being flattened to caps: PADEVERY and
            // PADVOICES read as one word and do not say which LAYER they act
            // on, which is the whole question when a rate row sits above a
            // level row for the same five layers. Overridden here rather than
            // by renaming the parameters, because the names are also the OSC
            // paths, the preset keys and the ~beatParams mirrors — renaming
            // them would break saved configs for a cosmetic gain.
            displayStr = ~knobLabels[label.asSymbol] ? label.asString.toUpper;

            // The value alone: functionLabel below already names the knob.
            ~labelFormats[label.asSymbol] = ~valueOnly;
            valueLabel = StaticText()
                .string_(~knobText.(label.asSymbol, defaultVal))
                .stringColor_(Color.white)
                .font_(~labelF.())
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
                .font_(~labelF.())
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
                    valueLabel.string = ~knobText.(paramName, mappedVal);
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
        
        // Recording status indicator
        // ─── How long this recording has been running ──────────────────
        // A 1-bit counter: every digit drawn pixel by pixel from a 5×7
        // bitmap, smoothing off — two colours, no antialiasing, no dither.
        // White on black at rest; INVERTED while recording, so the state reads
        // without a third colour. After STOP it holds the last time, so the
        // length of the session stays on screen.
        ~recGlyphs = Dictionary[
            $0 -> [" ### ", "#   #", "#  ##", "# # #", "##  #", "#   #", " ### "],
            $1 -> ["  #  ", " ##  ", "  #  ", "  #  ", "  #  ", "  #  ", " ### "],
            $2 -> [" ### ", "#   #", "    #", "   # ", "  #  ", " #   ", "#####"],
            $3 -> ["#####", "   # ", "  #  ", "   # ", "    #", "#   #", " ### "],
            $4 -> ["   # ", "  ## ", " # # ", "#  # ", "#####", "   # ", "   # "],
            $5 -> ["#####", "#    ", "#### ", "    #", "    #", "#   #", " ### "],
            $6 -> ["  ## ", " #   ", "#    ", "#### ", "#   #", "#   #", " ### "],
            $7 -> ["#####", "    #", "   # ", "  #  ", " #   ", " #   ", " #   "],
            $8 -> [" ### ", "#   #", "#   #", " ### ", "#   #", "#   #", " ### "],
            $9 -> [" ### ", "#   #", "#   #", " ####", "    #", "   # ", " ##  "],
            $: -> ["     ", "  #  ", "  #  ", "     ", "  #  ", "  #  ", "     "]
        ];
        ~recTimerHold = 0;
        ~recTimerText = { |secs|
            var t = secs.asInteger.max(0);
            "%:%:%".format((t div: 3600).asString.padLeft(2, "0"),
                ((t div: 60) % 60).asString.padLeft(2, "0"), (t % 60).asString.padLeft(2, "0"))
        };
        ~recTimerView = UserView()
            // 2 px per glyph pixel (it was 3): the same 1-bit counter, small
            // enough to sit in the top bar.
            .fixedSize_(Size(8 * 6 * 2 + 4, 7 * 2 + 4))
            .drawFunc_({ |v|
                var px = 2, rec = (~recordingParams !? { ~recordingParams.isRecording }) == true;
                var fg = if(rec, Color.black, Color.white), bg = if(rec, Color.white, Color.black);
                var text;
                if(rec) { ~recTimerHold = ~recordingParams.recordingDuration ? 0 };
                text = ~recTimerText.(~recTimerHold);
                Pen.smoothing = false;
                Pen.fillColor = bg;
                Pen.fillRect(Rect(0, 0, v.bounds.width, v.bounds.height));
                Pen.fillColor = fg;
                text.do { |ch, i|
                    (~recGlyphs[ch] ? []).do { |row, y|
                        row.do { |bit, x|
                            if(bit == $#) {
                                Pen.fillRect(Rect(2 + (((i * 6) + x) * px), 2 + (y * px), px, px));
                            };
                        };
                    };
                };
            });
        if(~recTimerRoutine.notNil) { ~recTimerRoutine.stop };
        ~recTimerRoutine = Routine({
            loop {
                if(~recTimerView.notNil and: { ~recTimerView.isClosed.not }) { ~recTimerView.refresh };
                0.25.wait;
            }
        }).play(AppClock);

        ~recordingStatus = StaticText()
            .string_("REC: READY")
            .stringColor_(mainTheme.green)
            .font_(Font(~monoFont, 9, true))
            .align_(\center)
            .fixedWidth_(92);
        
        // Record button
        ~recordButton = Button()
            .states_([
                ["● REC", Color(1.0, 0.36, 0.36), backgroundColor.blend(Color(1.0, 0.36, 0.36), 0.12)],
                ["■ STOP", backgroundColor, Color(1.0, 0.36, 0.36)]
            ])
            .font_(Font(~monoFont, 10, true))
            .fixedHeight_(22)
            .fixedWidth_(76)
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
            .states_([["▶ 30s", mainTheme.foreground, backgroundColor.blend(mainTheme.yellow, 0.15)]])
            .font_(Font(~monoFont, 9))
            .fixedHeight_(22)
            .fixedWidth_(56)
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
            .states_([["◇ 4ch", mainTheme.foreground, backgroundColor.blend(mainTheme.accent, 0.15)]])
            .font_(Font(~monoFont, 9))
            .fixedHeight_(22)
            .fixedWidth_(56)
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
        

        // ─── CONFIGS: save/load the full control state (presets/*.json) ────
        // Same files the browser CONFIGS block uses. Loading routes through
        // ~setParam, so knobs here AND HTML sliders both follow.

        ~presetNameField = TextField()
            .string_("")
            .background_(backgroundColor.blend(mainTheme.accent, 0.10))
            .stringColor_(mainTheme.yellow)
            .font_(Font(~monoFont, 11))
            .fixedWidth_(100);

        ~presetMenu = PopUpMenu()
            .items_([])
            .background_(backgroundColor.blend(mainTheme.accent, 0.10))
            .stringColor_(mainTheme.yellow)
            .font_(Font(~monoFont, 11))
            .fixedWidth_(190);

        ~refreshPresetMenu = {
            if(~listConfigs.notNil) {
                { ~presetMenu.items = ~listConfigs.value }.defer;
            };
        };

        ~presetSaveButton = Button()
            .states_([["◈ SAVE", mainTheme.foreground, backgroundColor.blend(mainTheme.accent, 0.15)]])
            .font_(Font(~monoFont, 9, true))
            .fixedHeight_(22)
            .fixedWidth_(64)
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
            .fixedHeight_(22)
            .fixedWidth_(64)
            .action_({
                var sel = ~presetMenu.item;
                if(sel.notNil and: { ~loadConfig.notNil }) {
                    ~loadConfig.(sel);
                } { "No config selected.".postln };
            });

        ~refreshPresetMenu.value;

        // ─── Escenas A·B: el crossfader del LC2 (0_parameters.scd) ──────────
        // Two buttons that also say what each side holds. Click: the config
        // picked in the menu becomes that scene. Each lights amber as far as
        // the crossfader leans its way. In APRENDE they are the destination
        // «ESCENA A·B», so any LC2 control can be given the crossfade. The
        // name field and the menu gave up 80 px for them (canvas ≤ 1568).
        ~escenaBotones = ();
        [\a, \b].do { |lado|
            ~escenaBotones[lado] = Button()
                .font_(Font(~monoFont, 9, true))
                .fixedHeight_(22)
                .fixedWidth_(88)
                .action_({
                    var sel = ~presetMenu.item;
                    if(sel.notNil and: { ~escenaPoner.notNil }) { ~escenaPoner.(lado, sel) };
                })
                .mouseDownAction_({ |v, x, y, mods, boton| ~lc2Tocar !? { ~lc2Tocar.(\escenaAB, mods, boton) } })
                .mouseUpAction_({ ~lc2Quieto !? { ~lc2Quieto.value } });
        };
        ~escenaAlCambiar = { {
            var x = (~escena ? ())[\x], amber = ~guiFamily[\cadena];
            [\a, \b].do { |lado|
                var b = (~escenaBotones ? ())[lado];
                if(b.notNil and: { b.isClosed.not }) {
                    var nombre = (~escena[lado] ? "—").asString;
                    var corto = nombre.replace("_", " ").split($ ).reject { |w| w.every(_.isDecDigit) }.join(" ").toUpper;
                    var w = if(x.isNil) { 0 } { if(lado == \a) { 1 - x } { x } };
                    b.states = [[lado.asString.toUpper ++ " " ++ corto.keep(12),
                        if(w > 0.5) { Color.black } { amber },
                        backgroundColor.blend(amber, 0.12 + (0.78 * w))]];
                    b.toolTip = "Escena %: %\nClic: la config elegida en el menú pasa a ser la escena %.\nEl crossfader del LC2 va de A a B."
                        .format(lado.asString.toUpper, nombre, lado.asString.toUpper);
                };
            };
        }.defer };
        ~escenaAlCambiar.value;
        
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

        // ─── Collapsing the laser column ──────────────────────────────────
        //
        // laserView is a fixed 452 px and the window is capped at 1570, so it
        // takes nearly a third of the surface permanently — for a column that
        // matters only when a projector is actually plugged in. Hidden, the
        // HLayout gives every one of those pixels to the control surface, and
        // rows that were reaching the horizontal scroller stop reaching it.
        //
        // The button lives OUTSIDE the collapsing view, in the header row, or
        // it would disappear along with the thing it collapses.
        // Collapsed by default: the column matters only with a projector
        // plugged in, and the surface is what the performer opens the window
        // for. LÁSER ▸ in the header brings it back; within a session the last
        // choice is kept (a GUI rebuild does not reopen it).
        ~laserCollapsed = ~laserCollapsed ? true;
        ~laserToggle = Button()
            .states_([
                ["LÁSER ▸", mainTheme.dim, backgroundColor],
                ["LÁSER ◂", backgroundColor, mainTheme.accent]
            ])
            .font_(Font(~monoFont, 9, true))
            .fixedWidth_(74).fixedHeight_(18)
            .value_(if(~laserCollapsed, 1, 0));
        ~laserToggle.action = { |b|
            ~laserCollapsed = (b.value > 0);
            laserView.visible = ~laserCollapsed.not;
        };
        laserView.visible = ~laserCollapsed.not;

        // ─── The top bar: title, CONFIGS, REC, laser ─────────────────────
        // CONFIGS and REC were two full-width bars at the bottom of the
        // surface, below the scroll fold on a laptop. They sit at the top now,
        // compact: pick a config and LOAD it, or name one and SAVE; record,
        // snapshot 30 s, open the 4-channel panel. The laser toggle stays in
        // this row, outside the column it collapses.
        topBar = View().background_(backgroundColor.blend(mainTheme.accent, 0.06))
            .layout_(HLayout().margins_(4).spacing_(6));
        topBar.fixedHeight_(34);
        ~headerText.align_(\left).fixedWidth_(if(~labelBitmap) { 214 } { 170 });
        [
            ~headerText,
            StaticText().string_("CONFIG").font_(Font(~monoFont, 9, true)).stringColor_(mainTheme.dim),
            ~presetMenu, ~presetLoadButton, ~presetNameField, ~presetSaveButton,
            ~escenaBotones[\a], ~escenaBotones[\b],
            View().fixedWidth_(14),
            ~recordingStatus, ~recTimerView, ~recordButton, ~quickRecButton, ~spatialGuiButton,
            View(), ~laserToggle
        ].do { |w| topBar.layout.add(w) };

        // The status lights and the counters, one row; the slack at the end.
        statusView.layout.add(View().background_(backgroundColor.blend(mainTheme.accent, 0.03)));

        ~scrollCanvas.layout.add(topBar);
        ~scrollCanvas.layout.add(statusView);
        // The four knob rows (~guiRows): one grid, two halves of seven.
        knobRows.do { |r| ~scrollCanvas.layout.add(r) };

        // ─── GOLPE · the 32-step grid (19_golpe.scd plays it) ────────────
        // One UserView, drawn 1-bit like the REC timer, rather than 160
        // Buttons: a box of the grid is grey, and lights white the moment it
        // is heard (framed when accented); a ghost or a chain hit on a box the
        // Marea let rest lights amber (ornaments only ever land on boxes that
        // are on); the playhead is a dim column. Click toggles a box;
        // dragging paints the value the first click gave, so a run of hits is
        // one gesture. The state is ~golpePattern (0_parameters.scd), written
        // only through ~golpeSet / ~golpeLoad, which refresh this view.
        // (No section heading: the row's own head says GOLPE.)
        {
            var golpeRow = View().background_(backgroundColor).fixedHeight_(116);
            // 29 px a step and a 4 px gap every beat: the grid and its head fit
            // the 1100 px surface on one line (at 30/6 the row ran to ~1280).
            var capW = 46, cellW = 27, cellH = 16, pitch = 29, gap = 4, rowPitch = 19, top = 8;
            var paint;
            var cellRect = { |r, i| Rect(capW + (i * pitch) + ((i div: 4) * gap), top + (r * rowPitch), cellW, cellH) };
            var hit = { |x, y|
                var found;
                ~golpeRows.do { |row, r|
                    ~golpeSteps.do { |i|
                        if(found.isNil and: { cellRect.(r, i).containsPoint(Point(x, y)) }) { found = [row, i] };
                    };
                };
                found
            };
            // The row's name, left of its boxes: where a row is picked for tuning.
            var nameHit = { |x, y|
                var found;
                if(x < (capW - 2)) {
                    ~golpeRows.do { |row, r|
                        var c = cellRect.(r, 0);
                        if(found.isNil and: { y >= (c.top - 1) } and: { y < (c.top + rowPitch - 1) }) { found = row };
                    };
                };
                found
            };
            var buttons = View();
            var info, rhythms, kits, rhythmBlock, kitBlock;
            ~golpeKitButtons = ();
            ~golpeGridView = UserView()
                .fixedSize_(Size(capW + (~golpeSteps * pitch) + ((~golpeSteps div: 4) * gap), top + (~golpeRows.size * rowPitch) + 4))
                .drawFunc_({ |v|
                    // What was HEARD on the current step (19_golpe.scd sets it
                    // s.latency after scheduling, so the light lands with the
                    // sound): row -> [velocity, kind].
                    var shown = ~golpeShown;
                    var now = shown !? { shown[\step] };
                    var lit = (shown !? { shown[\hits] }) ? ();
                    var amber = ~phenoAmber ? Color(1.0, 0.62, 0.10);
                    // What is being tuned (0_parameters.scd, ~golpeEdit).
                    var edit = ~golpeEdit;
                    var tuneCol = ~guiFamily[\timbre];
                    Pen.smoothing = false;
                    Pen.fillColor = Color.black;
                    Pen.fillRect(Rect(0, 0, v.bounds.width, v.bounds.height));
                    // A tick over every half bar, so the two bars read at a glance.
                    (0, 8 .. ~golpeSteps - 1).do { |i|
                        Pen.fillColor = mainTheme.dim;
                        Pen.fillRect(Rect(cellRect.(0, i).left, 2, cellW, 3));
                    };
                    // The playhead: a dim column behind the boxes.
                    now !? { |i|
                        var c = cellRect.(0, i);
                        Pen.fillColor = Color.gray(0.2);
                        Pen.fillRect(Rect(c.left - 2, top - 3, cellW + 4, ~golpeRows.size * rowPitch + 2));
                    };
                    ~golpeRows.do { |row, r|
                        // The row being tuned: its name lit in the timbre
                        // orange (the four knobs that tune it are orange too).
                        // A row whose tuning is not neutral gets a dot.
                        var tuned = ~golpeTuneKeys.notNil and: { ~golpeTuneKeys.any { |k| ((~golpeTune[row] ? ())[k] ? 0) != 0 } };
                        Pen.stringAtPoint(row.asString.toUpper ++ if(tuned) { "•" } { "" },
                            Point(2, cellRect.(r, 0).top + 2), Font(~monoFont, 9, true),
                            if(edit.notNil and: { edit[\row] == row }) { tuneCol } { mainTheme.accent });
                        ~golpeSteps.do { |i|
                            var rect = cellRect.(r, i);
                            var on = ((~golpePattern[row] ? [])[i] ? 0) > 0;
                            var hit = if(now == i) { lit[row] };
                            case
                            // Heard from the grid: lit white, a frame when accented.
                            { hit.notNil and: { hit[1] == \grid } } {
                                Pen.fillColor = Color.white;
                                Pen.fillRect(rect.insetBy(-2, -2));
                                if(hit[0] >= 0.95) {
                                    Pen.fillColor = Color.black; Pen.fillRect(rect.insetBy(2, 2));
                                    Pen.fillColor = Color.white; Pen.fillRect(rect.insetBy(4, 4));
                                };
                            }
                            // An ornament on a box whose own hit the Marea let
                            // rest: a ghost (STRIKE BEAT) or the chain (block
                            // fill, transaction flam, CORO), in amber.
                            { hit.notNil } {
                                if(on) { Pen.fillColor = Color.gray(0.5); Pen.fillRect(rect) } {
                                    Pen.strokeColor = mainTheme.dim; Pen.width = 1;
                                    Pen.strokeRect(rect.insetBy(0.5, 0.5));
                                };
                                Pen.fillColor = if(hit[1] == \ghost) { Color(amber.red, amber.green, amber.blue, 0.55) } { amber };
                                Pen.fillRect(rect.insetBy(7, 4));
                            }
                            // In the grid, resting (or the Marea let it rest).
                            { on } { Pen.fillColor = Color.gray(0.5); Pen.fillRect(rect) }
                            {
                                Pen.strokeColor = mainTheme.dim; Pen.width = 1;
                                Pen.strokeRect(rect.insetBy(0.5, 0.5));
                            };
                            // A step with its own tuning: an orange corner.
                            if(((~golpeLocks ? ())[row] ? ())[i].notNil) {
                                Pen.fillColor = tuneCol;
                                Pen.fillRect(Rect(rect.right - 7, rect.top, 7, 4));
                            };
                            // The step being tuned: framed in orange.
                            if(edit.notNil and: { edit[\row] == row } and: { edit[\step] == i }) {
                                Pen.strokeColor = tuneCol; Pen.width = 2;
                                Pen.strokeRect(rect.insetBy(-2, -2));
                            };
                        };
                    };
                })
                // Click a row's name: tune that row (again: leave); double-click
                // it: the row back to the kit. Right- or alt-click a box: tune
                // that step (again: leave); double: its lock cleared. Shift-
                // click (or shift-drag) a box: the step tuned last is stamped
                // there, lock and hit. A plain click still toggles the box.
                .mouseDownAction_({ |v, x, y, mods, button, clicks|
                    var alt = (button == 1) or: { mods.isAlt };
                    paint = nil;
                    case
                    { mods.isShift and: { hit.(x, y).notNil } and: { ~golpeLockLast.notNil } } {
                        var c = hit.(x, y);
                        if(~golpeLockPaste.(c[0], c[1])) { paint = \stamp } {
                            paint = if(((~golpePattern[c[0]] ? [])[c[1]] ? 0) > 0) { 0 } { 1 };
                            ~golpeSet.(c[0], c[1], paint);
                        };
                    }
                    { nameHit.(x, y).notNil } {
                        var row = nameHit.(x, y);
                        // The double's first click toggled; the reset keeps it open.
                        if(clicks >= 2) { ~golpeEdit = (row: row, step: nil); ~golpeTuneReset.(row, nil) } {
                            ~golpeEditSet.(row, nil) };
                    }
                    { alt } {
                        hit.(x, y) !? { |c|
                            if(clicks >= 2) { ~golpeEdit = (row: c[0], step: c[1]); ~golpeTuneReset.(c[0], c[1]) } {
                                ~golpeEditSet.(c[0], c[1]) };
                        };
                    }
                    {
                        hit.(x, y) !? { |c|
                            paint = if(((~golpePattern[c[0]] ? [])[c[1]] ? 0) > 0) { 0 } { 1 };
                            ~golpeSet.(c[0], c[1], paint);
                        };
                    };
                })
                .mouseMoveAction_({ |v, x, y|
                    if(paint.notNil) { hit.(x, y) !? { |c|
                        case
                        { paint == \stamp } {
                            var l = ~golpeLockLast;
                            var have = (~golpeLocks[c[0]] ? ())[c[1]];
                            var src = l !? { (~golpeLocks[l[\row]] ? ())[l[\step]] };
                            if(have != src or: { ((~golpePattern[c[0]] ? [])[c[1]] ? 0) == 0 }) {
                                ~golpeLockPaste.(c[0], c[1]) };
                        }
                        { ((~golpePattern[c[0]] ? [])[c[1]] ? 0) != paint } { ~golpeSet.(c[0], c[1], paint) };
                    } };
                });
            // ── Beside the grid: the fader and what it plays ────────────────
            // One row: the grid, the GOLPE strip (fader, meter, mute, pan,
            // AUTO), the rhythms and the kits. RITMO says WHEN (rhythm red),
            // KIT · ESCUCHA says WHAT is struck and in what room (timbre
            // orange) — each config picks a kit, these switch it live. The line
            // under them is the bancada and the marea as GOLPE hears them.
            info = StaticText().string_("")
                .font_(Font(~monoFont, 9, true)).stringColor_(mainTheme.dim);
            rhythms = [\maqsum, \baladi, \saidi, \malfuf, \ayoub, \clr].collect { |key|
                var red = ~guiFamily[\ritmo];
                Button().states_([[key.asString.toUpper, red, Color.black.blend(red, 0.07)]])
                    .font_(Font(~monoFont, 9, true)).fixedSize_(Size(70, 20))
                    .action_({
                        if(key == \clr) { ~golpeClear.value } { ~golpeLoad.(~golpeLibrary[key]) };
                    })
            };
            kits = ~golpeKitNames.collect { |key|
                var org = ~guiFamily[\timbre];
                // The kit that plays is drawn inverted. (Stored, then returned:
                // `dict[key] = b` answers the dict, not the button.)
                var b = Button()
                    .states_([[~golpeKitLabels[key], org, Color.black.blend(org, 0.07)],
                              [~golpeKitLabels[key], Color.black, org]])
                    .font_(Font(~monoFont, 9, true)).fixedSize_(Size(70, 20))
                    .value_(if(~golpeKit == key) { 1 } { 0 })
                    .action_({ ~golpeKitSet.(key) });
                ~golpeKitButtons[key] = b;
                b
            };
            rhythmBlock = View().layout_(VLayout(
                StaticText().string_("RITMO").font_(Font(~monoFont, 9, true))
                    .stringColor_(~guiFamily[\ritmo].blend(Color.white, 0.4)),
                GridLayout.rows(*rhythms.clump(2)).spacing_(3), nil
            ).margins_(0).spacing_(3));
            kitBlock = View().layout_(VLayout(
                StaticText().string_("KIT · ESCUCHA").font_(Font(~monoFont, 9, true))
                    .stringColor_(~guiFamily[\timbre].blend(Color.white, 0.4)),
                GridLayout.rows(*kits.clump(2)).spacing_(3), nil
            ).margins_(0).spacing_(3));
            buttons.layout = VLayout(HLayout(rhythmBlock, kitBlock).spacing_(10), info, nil)
                .margins_(0).spacing_(4);
            buttons.fixedWidth_(2 * 146 + 10);
            ~golpeKitRefresh = {
                ~golpeKitButtons.keysValuesDo { |key, b|
                    if(b.isClosed.not) { b.value = if(~golpeKit == key) { 1 } { 0 } };
                };
                // The bancada and the marea as GOLPE hears them, also while it
                // is silent: the bancada from the registry, the marea from the
                // beat engine's own reading.
                if(info.isClosed.not and: { ~golpeEdit.notNil }) {
                    var e = ~golpeEdit;
                    info.stringColor = ~guiFamily[\timbre].blend(Color.white, 0.3);
                    info.string = "AFINANDO % · %\nTIMBRE: AFINAR TONO CAÍDA MOD · PAD PITCH: OCTAVA".format(e[\row].asString.toUpper,
                        if(e[\step].isNil) { "FILA" } { "PASO " ++ (e[\step] + 1) });
                };
                if(info.isClosed.not and: { ~golpeEdit.isNil }) {
                    info.stringColor = mainTheme.dim;
                    info.string = "BANCADA % · MAREA %".format(
                        (~golpeBancadaNames ? [])[((~controlValues ? ())[\bancada] ? 0).round.asInteger] ? "-",
                        (((~beatParams !? { ~beatParams.tideValue }) ? 0.65)).round(0.01));
                };
            };
            golpeRow.layout = HLayout(~inlineHead.("GOLPE\nCC 65", ~famText.(\mixGolpe)),
                ~golpeGridView,
                ~makeMixStrip.value(\mixGolpe, "GOLPE").fixedWidth_(96),
                buttons,
                View().background_(backgroundColor)
            ).margins_(4).spacing_(8);
            ~scrollCanvas.layout.add(golpeRow);
        }.value;

        ~scrollCanvas.layout.add(mixerView);
        ~scrollCanvas.layout.add(sampleView);

        // Add footer
        ~footer = StaticText()
            .string_("BiocracyEngine — Spatial Audio + Samples")
            .font_(Font(~monoFont, 8))
            .align_(\right)
            // .copy: alpha_ would fade the shared dim for everything after.
            .stringColor_(mainTheme.dim.copy.alpha_(0.6));
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

        // ─── APRENDE · asignar el Faderfox LC2 desde aquí ────────────────
        // The MIDI light is the switch (no new widget): click it and every
        // control on the surface shows which LC2 control reaches it, grey
        // where none does. Then touch a knob, fader, toggle or MUTE and move
        // the LC2 control that should drive it — either order. Right-click
        // (or option-click) a control to take its LC2 controls away. Click
        // the light again to leave; shift-click goes back to the factory map.
        // The learning itself lives in 2_midi_control.scd (~lc2Destino …).
        //
        // While learning, touching a control must not move it, so its mouse
        // actions answer true (Qt's own handling is skipped). Otherwise they
        // answer nil and the control behaves as it always has — returning
        // false would skip Qt's handling too.
        ~lc2Tocar = { |destino, mods, boton|
            if(~lc2Aprende.notNil) {
                if(boton == 1 or: { mods.isAlt }) { ~lc2SoltarDestino.(destino) } { ~lc2Destino.(destino) };
                true
            };
        };
        ~lc2Quieto = { if(~lc2Aprende.notNil) { true } };
        (~knobViews ? ()).keysValuesDo { |key, view|
            view.mouseDownAction_({ |v, x, y, mods, boton| ~lc2Tocar.(key, mods, boton) })
                .mouseMoveAction_(~lc2Quieto).mouseUpAction_(~lc2Quieto);
        };
        ~mixerStrips.keysValuesDo { |p, st|
            st[\mute].mouseDownAction_({ |v, x, y, mods, boton| ~lc2Tocar.([\mute, p], mods, boton) })
                .mouseUpAction_(~lc2Quieto);
        };
        ~statusLights.midi.parent
            .toolTip_("Clic: APRENDE · toca un control y mueve el LC2.\n"
                ++ "Clic derecho en un control: quitarle el LC2.\n"
                ++ "Mayús+clic aquí: volver al mapa de fábrica.")
            .mouseDownAction_({ |v, x, y, mods|
                if(~lc2Aprender.notNil) {
                    if(mods.isShift) { ~lc2VolverFabrica.value } { ~lc2Aprender.(~lc2Aprende.isNil) };
                };
                true
            });
        // Called by 2_midi_control.scd on every learning step: the light's
        // caption, the header (the next step, in two short lines) and every
        // caption and look on the surface.
        ~lc2AlCambiar = { {
            var ap = ~lc2Aprende;
            if(~headerText.notNil and: { ~headerText.isClosed.not }) {
                ~ledLabels[\MIDI].string_(if(ap.notNil) { "APRENDE" } { "MIDI" })
                    .stringColor_(if(ap.notNil) { ~guiFamily[\cadena] } { textColor });
                if(ap.notNil) {
                    ~headerText.font_(~labelF.()).stringColor_(~guiFamily[\cadena])
                        .string_(~lc2AprendeAviso ? "");
                } {
                    ~headerText.font_(~labelF.(true)).stringColor_(mainTheme.yellow)
                        .string_("BiocracyEngine");
                };
                (~controlLabels ? ()).keysValuesDo { |key, label|
                    if(label.isClosed.not and: { ~golpeShows.isNil or: { ~golpeShows.(key).not } }) {
                        label.string = ~knobText.(key, ~controlValues[key]);
                    };
                };
                ~guiLookRefresh.value;
            };
        }.defer };
        // A GUI opened while learning picks the state up.
        if(~lc2Aprende.notNil) { ~lc2AlCambiar.value };

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
                    // Lit / grey, from the faders as they stand now.
                    ~guiLookRefresh !? { ~guiLookRefresh.value };
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
            ~ledLabels = nil;
            ~lc2AlCambiar = nil;
            ~escenaAlCambiar = nil;
            ~escenaBotones = nil;
            ~lc2Aprende = nil;
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
            ~golpeGridView = nil;
            ~golpeKitRefresh = nil;
            // Tuning hands the knobs back; nothing left to grey.
            ~golpeEdit = nil;
            ~guiLookRefresh = nil;
            ~knobLook = nil;
            ~mixFocus = nil;
            ~mixFocusOn = nil;
            ~golpeKitButtons = nil;
            ~mixerStrips = nil;
            ~recordingStatus = nil;
            ~recordButton = nil;
            ~quickRecButton = nil;
            ~spatialGuiButton = nil;
            ~ledAlive = nil;
            // The meters and the REC timer had their own routines and the
            // meters an OSCdef, all left running against closed views; and
            // 3_synthdefs.scd calls ~stemPanViews from a pan change.
            if(~stemMeterRoutine.notNil) { ~stemMeterRoutine.stop };
            ~stemMeterRoutine = nil;
            if(~recTimerRoutine.notNil) { ~recTimerRoutine.stop };
            ~recTimerRoutine = nil;
            OSCdef(\stemLevel).free;
            ~stemPanViews = nil;
            ~stripMeters = nil;
            ~recTimerView = nil;
            ~laserToggle = nil;
        };

        // ─── A second screen ───────────────────────────────────────────
        // Every hand-drawn view on this surface — the GOLPE grid, the REC
        // clock, the status lights and the laser lamps — is a UserView, and
        // SC's UserView paints into an offscreen pixmap that it allocates at
        // its size × the screen's pixel ratio, but ONLY on a resize
        // (QcCanvas::paintEvent, SC 3.14). Dragged from the Retina panel
        // (ratio 2) to a 1080p monitor (ratio 1), nothing resizes: the old
        // 2× pixmap is blitted with the new ratio, and each drawing shows a
        // quarter of itself blown up to fill the view — the grid's tiles
        // doubled and cut, the clock's digits cropped, the lights swollen.
        // Knobs and buttons are native Qt widgets and never had the problem.
        //
        // So when the window has moved and come to rest, every UserView in it
        // is resized by a pixel and straight back. Its geometry ends where it
        // was; the resize is flagged, and the next paint reallocates the
        // pixmap at the ratio of the screen the window is on now.
        ~dprUserViews = { |view|
            var out = List.new, walk;
            walk = { |v|
                if(v.isKindOf(UserView)) { out.add(v) };
                v.children.do { |c| walk.(c) };
            };
            walk.(view);
            out
        };
        // The grid, the clock and the lights have fixed (or maximum) sizes, and
        // Qt clamps a geometry to them: the +1 px never happened, no resize
        // event, and the old pixmap stayed (measured: a red fill drawn once
        // survived the nudge). So the limits are lifted for the nudge and put
        // back; the view ends at its size, within its limits, and re-lays out
        // to nothing new.
        ~dprNudge = { |win|
            if(win.notNil and: { win.isClosed.not }) {
                ~dprUserViews.(win.view).do { |v|
                    var b, mn, mx;
                    if(v.isClosed.not) {
                        b = v.bounds;
                        mn = v.getProperty(\minimumSize);
                        mx = v.getProperty(\maximumSize);
                        v.setProperty(\minimumSize, Size(0, 0));
                        v.setProperty(\maximumSize, Size(16777215, 16777215));
                        v.bounds = Rect(b.left, b.top, b.width + 1, b.height);
                        v.bounds = b;
                        v.setProperty(\minimumSize, mn);
                        v.setProperty(\maximumSize, mx);
                        v.refresh;
                    };
                };
            };
        };
        // Polled, at 4 Hz: Qt's screen-change signal is not reachable from
        // sclang. Half a second at rest is a drop, not a pause mid-drag.
        ~dprWatch = { |win|
            var last = win.bounds, still = 0, moved = false;
            Routine({
                while { win.isClosed.not } {
                    var b = win.bounds;
                    if(b.origin != last.origin) { moved = true; still = 0; last = b } {
                        if(moved) {
                            still = still + 1;
                            if(still >= 2) { moved = false; ~dprNudge.(win) };
                        };
                    };
                    0.25.wait;
                };
            }).play(AppClock);
        };
        ~dprWatch.(~mainWindow);

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