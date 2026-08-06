// SuperCollider Ethereum Sonification - Canonical Parameter Registry
// Loaded FIRST by start_sonification.scd — every other component reads this.
//
// Before this file existed the same parameter metadata lived in four places
// that had drifted apart: ~soundParams (2_midi_control), ~controlSpecs +
// ~controlValues (4_gui), the switch() denormalization table (6_osc_handlers)
// and the SC_TO_CH route table (parliament-bridge.js). Drift symptoms fixed
// by centralizing here:
//   - MIDI wrote to \dronemix / \txInfluence — buses that never existed
//     (they are \droneMix / \transactionInfluence).
//   - MIDI, GUI and OSC disagreed on ranges (spectralShift 60– vs 80–3000,
//     textureDepth 0–1 vs 0–0.6, droneFade 0–1 vs 0.1–5 s, …).
//   - The GUI echoed NATIVE units to the browser, which expects 0–1.
//
// Every control surface (MIDI CC, OSC/HTML slider, SC GUI knob) must call
// ~setParam / ~setParamNorm instead of touching ~buses directly. That single
// write path keeps bus, ~beatParams, ~controlValues, the GUI knob and the
// browser slider in sync — event-driven, no polling.

(
// ─── The registry ───────────────────────────────────────────────────────────
// One Event per parameter:
//   name      \symbol       — bus name in ~buses / key in ~controlValues
//   spec      ControlSpec   — canonical native range + warp (single copy)
//   default   Float         — boot value
//   path      String        — canonical OSC address (browser slider data-osc)
//   aliases   [String]      — extra OSC addresses accepted for compatibility
//   cc        Integer       — Faderfox LC2 MIDI CC (nil = no MIDI mapping)
//   hasBus    Boolean       — false = no control bus (e.g. beatTempo)
//   beatParam \symbol       — mirror writes into ~beatParams[beatParam]
~paramDefs = [
    // ── Row 1: Core Performance (Lawrence English ambient) ──────────────
    (name: \masterVolume,  spec: ControlSpec(0.01, 1, \lin),  default: 0.3,  path: "/soneth/volume",        cc: 0),
    (name: \pitchShift,    spec: ControlSpec(-24, 24, \lin),  default: 0.0,  path: "/soneth/pitchshift",    cc: 1),
    (name: \timeDilation,  spec: ControlSpec(0.5, 6, \exp),   default: 2.0,  path: "/soneth/timedilation",  cc: 2,
        aliases: ["/parliament/fx/delaytime"]),
    // Ceiling 3000 -> 2400 Hz. This bus is the LPF cutoff in EVERY voice
    // (bell, kick, perc, dust, drone), so its top end sets how bright the
    // whole engine can get. The synths now carry fixed backstops below this
    // anyway; lowering the knob means the useful range of the fader maps onto
    // the range that is actually audible instead of the top third doing nothing.
    (name: \spectralShift, spec: ControlSpec(80, 2400, \exp), default: 1000, path: "/soneth/spectralshift", cc: 3),
    (name: \spatialSpread, spec: ControlSpec(-1, 1, \lin),    default: 0.0,  path: "/soneth/spatialspread", cc: 4),

    // ── Row 2: Ambient Processing ────────────────────────────────────────
    (name: \textureDepth,  spec: ControlSpec(0, 0.6, \lin),   default: 0.2,  path: "/soneth/texturedepth",  cc: 32),
    (name: \atmosphereMix, spec: ControlSpec(0, 0.9, \lin),   default: 0.4,  path: "/soneth/atmospheremix", cc: 33,
        aliases: ["/parliament/fx/reverb"]),
    (name: \memoryFeed,    spec: ControlSpec(0, 0.8, \lin),   default: 0.3,  path: "/soneth/memoryfeed",    cc: 34),
    // Ceiling 8 -> 5. harmonicRich widens the percussion pitch pool AND sets
    // how many harmonics the triad voicing stacks, so its top end was the main
    // route to high metallic pings. It is also driven automatically by the
    // phenology reverse-breath loop, which could push it there unattended.
    (name: \harmonicRich,  spec: ControlSpec(0.1, 5, \exp),   default: 1.0,  path: "/soneth/harmonicrich",  cc: 35),
    (name: \resonantBody,  spec: ControlSpec(0.1, 0.8, \lin), default: 0.4,  path: "/soneth/resonantbody",  cc: 36),

    // ── Row 3: Drone/Noise Controls ──────────────────────────────────────
    // beatParam mirror added: the beat engine already multiplies
    // ~beatParams.masterAmp into every percussion \amp, but without this field
    // ~setParam never wrote it, so the slider only moved a bus. Now the one
    // control trims pad layer (\elektronBell), drone (\opalDrone) and beats.
    (name: \masterAmp,     spec: ControlSpec(0, 1, \lin),     default: 0.7,  path: "/soneth/masteramp",     cc: 5,
        beatParam: \masterAmp),
    (name: \filterCutoff,  spec: ControlSpec(0, 1, \lin),     default: 0.6,  path: "/soneth/filtercutoff",  cc: 6),
    (name: \noiseLevel,    spec: ControlSpec(0, 0.5, \lin),   default: 0.1,  path: "/soneth/noiselevel",    cc: 7),
    (name: \noiseFilt,     spec: ControlSpec(0, 1, \lin),     default: 0.5,  path: "/soneth/noisefilt",     cc: 8),
    (name: \droneDepth,    spec: ControlSpec(0, 1, \lin),     default: 0.3,  path: "/soneth/dronedepth",    cc: 9),

    // ── Row 4: Additional Controls ───────────────────────────────────────
    (name: \droneFade,     spec: ControlSpec(0.1, 5, \exp),   default: 2.0,  path: "/soneth/dronefade",     cc: 37),
    (name: \droneSpace,    spec: ControlSpec(0, 1, \lin),     default: 0.5,  path: "/soneth/dronespace",    cc: 38,
        aliases: ["/parliament/fx/room"]),
    (name: \droneMix,      spec: ControlSpec(0, 1, \lin),     default: 0.5,  path: "/soneth/dronemix",      cc: 39),
    (name: \delayFeedback, spec: ControlSpec(0, 0.95, \lin),  default: 0.3,  path: "/soneth/delayfeedback", cc: 40,
        aliases: ["/parliament/fx/decaytime"]),
    (name: \transactionInfluence, spec: ControlSpec(0, 1, \lin), default: 0.3, path: "/soneth/txInfluence", cc: 41,
        beatParam: \transactionInfluence),

    // ── Row 5: Cámara Fenológica de lo Vivo (Capítulo VI) ────────────────
    (name: \activityThreshold, spec: ControlSpec(0.20, 0.85, \lin), default: 0.50, path: "/pheno/activityThreshold", cc: 10),
    (name: \windowWidth,       spec: ControlSpec(0.4, 2.5, \lin),   default: 1.0,  path: "/pheno/windowWidth",       cc: 11),
    (name: \seasonalBias,      spec: ControlSpec(-1.0, 1.0, \lin),  default: 0.0,  path: "/pheno/seasonalBias",      cc: 12),
    (name: \absenceWeight,     spec: ControlSpec(0, 1, \lin),       default: 0.3,  path: "/pheno/absenceWeight",     cc: 13),
    (name: \pulseGain,         spec: ControlSpec(0.0, 2.0, \lin),   default: 1.0,  path: "/pheno/pulseGain",         cc: 14),
    (name: \opacityFloor,      spec: ControlSpec(0.0, 0.7, \lin),   default: 0.0,  path: "/pheno/opacityFloor",      cc: 15),
    (name: \bancada,           spec: ControlSpec(0, 4, \lin, 1),    default: 0,    path: "/pheno/bancada",           cc: 16),

    // ── Beat engine (no control bus — lives in ~beatParams) ─────────────
    (name: \beatTempo, spec: ControlSpec(0.5, 2.0, \exp), default: 1.0, path: "/soneth/beatTempo",
        hasBus: false, beatParam: \beatTempo),

    // ── Marea · arco de densidad (toggles 0/1) ──────────────────────────
    // The rhythm is tidal rather than gridded: onsets are probabilistic and
    // their likelihood follows a slow swell. These pick how long that swell
    // takes. The three arcs are MUTUALLY EXCLUSIVE — enforced in one place,
    // the /tide/ handler in 6_osc_handlers.scd, which unticks the others and
    // echoes all four back. The previous seven rhythm toggles were independent
    // booleans with undefined interactions and no single owner of the state,
    // which is a large part of why they had to be removed.
    // All three off = no arc, flat density.
    (name: \tideShort, exclusiveGroup: \tideArc, spec: ControlSpec(0, 1, \lin, 1), default: 0, path: "/tide/short",
        hasBus: false, beatParam: \tideShort, cc: 17),
    (name: \tideMedia, exclusiveGroup: \tideArc, spec: ControlSpec(0, 1, \lin, 1), default: 1, path: "/tide/media",
        hasBus: false, beatParam: \tideMedia, cc: 18),
    (name: \tideLarga, exclusiveGroup: \tideArc, spec: ControlSpec(0, 1, \lin, 1), default: 0, path: "/tide/larga",
        hasBus: false, beatParam: \tideLarga, cc: 19),
    // Independent axis: the sub-bass heartbeat, one per block, surviving the
    // troughs the tide would otherwise empty.
    (name: \tidePulse, spec: ControlSpec(0, 1, \lin, 1), default: 1, path: "/tide/pulse",
        hasBus: false, beatParam: \tidePulse, cc: 20)
];

// ─── Derived lookup tables ──────────────────────────────────────────────────
~paramDefsByName = ();
~paramDefs.do { |def| ~paramDefsByName[def[\name]] = def };

// cc → param name (one flat map instead of five case-ladder MIDIdefs)
~midiCCToParam = ();
~paramDefs.do { |def| if(def[\cc].notNil) { ~midiCCToParam[def[\cc]] = def[\name] } };

// OSC path → param name, canonical paths AND aliases (kept as a Dictionary of
// String keys — same shape 6_osc_handlers / 4_gui historically used)
~oscToParamMap = Dictionary.new;
~paramDefs.do { |def|
    if(def[\path].notNil) { ~oscToParamMap[def[\path]] = def[\name] };
    (def[\aliases] ? []).do { |a| ~oscToParamMap[a] = def[\name] };
};

// GUI-compatible views (4_gui reads these; previously duplicated literals)
~controlSpecs = ();
~controlValues = ();
~paramDefs.do { |def|
    ~controlSpecs[def[\name]] = def[\spec];
    ~controlValues[def[\name]] = def[\default];
};

// Upper-cases the first letter for GUI labels. Replaces String:capitalize,
// which SC 3.14 does not implement (it threw on every parameter write).
~labelCase = { |name|
    var s = name.asString;
    if(s.size > 0) { s[0].toUpper.asString ++ s[1..] } { s };
};

// ─── The single write path ──────────────────────────────────────────────────
// source: \midi | \osc | \gui | \code — used for the BRIDGE liveness light.
// Value is in NATIVE units (Hz, semitones, …); use ~setParamNorm for 0–1.
~setParam = { |name, value, source=\code|
    var def = ~paramDefsByName[name];
    if(def.isNil) {
        ("~setParam: unknown parameter '%'".format(name)).warn;
        nil
    } {
        var spec = def[\spec];
        var val = spec.constrain(value);

        // 1 · control bus (what the SynthDefs actually read)
        if((def[\hasBus] ? true) and: { ~buses.notNil } and: { ~buses[name].notNil }) {
            ~buses[name].set(val);
        };

        // 2 · beat-engine mirror (routine reads ~beatParams directly)
        if(def[\beatParam].notNil and: { ~beatParams.notNil }) {
            ~beatParams[def[\beatParam]] = val;
        };

        // 2b · exclusive group (radio behaviour)
        //     Enforced HERE rather than in the OSC handler because ~setParam is
        //     the one path every surface already shares — OSC from the browser,
        //     MIDI CC, and the SC GUI button all land here. Enforcing it in the
        //     handler would leave MIDI and the GUI able to tick two arcs at
        //     once. Turning one ON turns its siblings OFF (which recurses once,
        //     harmlessly: val is 0 there, so the branch is not re-entered) and
        //     each sibling echoes its own new state to the browser and the GUI.
        //     Turning one OFF is unconstrained — all-off is a legal state.
        if(def[\exclusiveGroup].notNil and: { val > 0.5 }) {
            ~paramDefs.do { |other|
                if(other[\exclusiveGroup] == def[\exclusiveGroup]
                    and: { other[\name] != name }
                    and: { (~controlValues[other[\name]] ? 0) > 0.5 }) {
                    ~setParam.(other[\name], 0, source);
                };
            };
        };

        // 3 · language-side cache
        if(~controlValues.notNil) { ~controlValues[name] = val };

        // 4 · GUI knob + label (event-driven — replaces the 50ms polling loop;
        //     knob.value = does NOT fire the knob's action, so no feedback loop)
        {
            var knob = if(~knobViews.notNil) { ~knobViews[name] };
            var label = if(~controlLabels.notNil) { ~controlLabels[name] };
            if(knob.notNil) { knob.value = spec.unmap(val) };
            if(label.notNil) {
                // String:capitalize does not exist in SC 3.14 — this threw on
                // EVERY ~setParam call (3419 times in one session log), so the
                // knob labels never updated and the flood buried every real
                // error in sclang_log.txt. ~labelCase does the same job.
                label.string = ~labelCase.(name) ++ ": " ++ val.round(0.001);
            };
        }.defer;

        // 5 · echo to browser — ALWAYS normalized 0–1 on the CANONICAL path
        //     (HTML sliders are 0–1; setting slider.value fires no input event,
        //     so browser-origin changes echo back harmlessly and keep every
        //     connected client in sync)
        if(~visualsDest.notNil and: { def[\path].notNil }) {
            ~visualsDest.sendMsg(def[\path], spec.unmap(val));
        };

        // 6 · bridge liveness (BRIDGE status light in the main GUI)
        if(source == \osc) { ~lastBrowserOscTime = SystemClock.seconds };

        // 7 · mark state dirty for the 30 s autosaver
        ~stateDirty = true;

        val
    };
};

// Normalized entry point: MIDI (val/127) and OSC/HTML sliders (0–1) call this.
~setParamNorm = { |name, norm, source=\code|
    var def = ~paramDefsByName[name];
    if(def.isNil) {
        ("~setParamNorm: unknown parameter '%'".format(name)).warn;
        nil
    } {
        ~setParam.(name, def[\spec].map(norm.clip(0, 1)), source);
    };
};

// ─── Config persistence ─────────────────────────────────────────────────────
// JSON files in presets/, written by SC (the state hub). Loading a config
// routes every value through ~setParam, which restores the control buses AND
// pushes the SC GUI knobs and the HTML sliders (normalized echo) in one pass.
// presets/_autosave.json is written every 30 s when state changed and is
// restored automatically at the next boot; named configs are saved/loaded
// from the SC GUI CONFIGS row, the browser CONFIGS block, or OSC
// (/preset/save, /preset/load, /preset/list — string argument).

~presetDir = thisProcess.nowExecutingPath.dirname +/+ "presets";
if(File.exists(~presetDir).not) { File.mkdir(~presetDir) };

// File-name safety: keep letters/digits/-/_ — everything else becomes _
~presetNameSafe = { |name|
    name.asString.collect { |c|
        if(c.isAlphaNum or: { "-_".includes(c) }, { c }, { $_ })
    };
};

~listConfigs = {
    (~presetDir +/+ "*.json").pathMatch.collect { |p|
        PathName(p).fileNameWithoutExtension
    }.reject { |n| n == "_autosave" }.sort;
};

~broadcastPresetList = {
    if(~visualsDest.notNil) {
        ~visualsDest.sendMsg("/preset/names", ~listConfigs.value.join(","));
    };
};

~saveConfig = { |name, quiet=false|
    var safe = ~presetNameSafe.(name ? "unnamed");
    var path = ~presetDir +/+ safe ++ ".json";
    var sections = List.new;
    var jsonSection = { |label, event|
        var body = event.asSortedArray.collect { |pair|
            "    \"%\": %".format(pair[0], pair[1].asFloat)
        }.join(",\n");
        "  \"%\": {\n%\n  }".format(label, body)
    };
    var params = ();
    ~paramDefs.do { |def| params[def[\name]] = ~controlValues[def[\name]] ? def[\default] };
    sections.add(jsonSection.(\params, params));
    if(~sampleControlValues.notNil) {
        sections.add(jsonSection.(\sample, ~sampleControlValues));
    };
    if(~buses.notNil) {
        var spatial = ();
        #[\spatialX, \spatialY, \roomSize, \distanceEffect].do { |k|
            if(~buses[k].notNil) { spatial[k] = ~buses[k].getSynchronous };
        };
        if(spatial.size > 0) { sections.add(jsonSection.(\spatial, spatial)) };
    };
    File.use(path, "w", { |f|
        f.write("{\n  \"meta\": { \"engine\": \"BiocracyEngine\", \"version\": 1, \"saved\": \"%\" },\n%\n}\n"
            .format(Date.getDate.format("%Y-%m-%d %H:%M:%S"), sections.join(",\n")));
    });
    if(quiet.not) {
        ("Config saved: " ++ path).postln;
        ~broadcastPresetList.value;
    };
    safe
};

~loadConfig = { |name, retried=false|
    var safe = ~presetNameSafe.(name ? "_autosave");
    var path = ~presetDir +/+ safe ++ ".json";
    if(File.exists(path).not) {
        ("Config not found: " ++ path).warn;
    } {
        // parseJSON THROWS on malformed JSON (it does not return nil) — a
        // hand-edited or truncated preset file must not take the engine down
        var dict = try {
            File.use(path, "r", { |f| f.readAllString }).parseJSON
        } { |err| nil };
        if(dict.isNil) {
            ("Config unreadable (bad JSON): " ++ path).warn;
        } {
            // Early-boot guard: buses may not exist yet — retry once in 2 s
            if((~buses.isNil or: { ~buses.size == 0 }) and: { retried.not }) {
                ("Config '%' deferred 2s (buses not ready)".format(safe)).postln;
                AppClock.sched(2.0, { ~loadConfig.(safe, true); nil });
            } {
                (dict["params"] ?? ()).keysValuesDo { |k, v|
                    ~setParam.(k.asSymbol, v.asFloat, \preset);
                };
                (dict["sample"] ?? ()).keysValuesDo { |k, v|
                    var key = k.asSymbol, val = v.asFloat;
                    if(~sampleBuses.notNil and: { ~sampleBuses[key].notNil }) {
                        ~sampleBuses[key].set(val);
                    };
                    if(~sampleControlValues.notNil) { ~sampleControlValues[key] = val };
                    {
                        if(~sampleKnobViews.notNil and: { ~sampleKnobViews[key].notNil }
                            and: { ~sampleControlSpecs.notNil } and: { ~sampleControlSpecs[key].notNil }) {
                            ~sampleKnobViews[key].value = ~sampleControlSpecs[key].unmap(val);
                        };
                        if(~sampleControlLabels.notNil and: { ~sampleControlLabels[key].notNil }) {
                            ~sampleControlLabels[key].string =
                                ~labelCase.(key) ++ ": " ++ val.round(0.001);
                        };
                    }.defer;
                };
                (dict["spatial"] ?? ()).keysValuesDo { |k, v|
                    if(~buses.notNil and: { ~buses[k.asSymbol].notNil }) {
                        ~buses[k.asSymbol].set(v.asFloat);
                    };
                };
                ("Config loaded: " ++ safe).postln;
            };
        };
    };
};

// Autosave: every 30 s persist to presets/_autosave.json if anything changed
// since the last save (marked by ~setParam). Restored at next boot by
// start_sonification.scd.
~stateDirty = false;
SystemClock.sched(30, {
    if(~stateDirty == true) {
        ~saveConfig.(\_autosave, quiet: true);
        ~stateDirty = false;
    };
    30
});

"Parameter registry loaded: % parameters, % OSC routes, % MIDI CCs.".format(
    ~paramDefs.size, ~oscToParamMap.size, ~midiCCToParam.size
).postln;
"Config persistence ready: % (%).".format(~presetDir, ~listConfigs.value.join(", ")).postln;
)
