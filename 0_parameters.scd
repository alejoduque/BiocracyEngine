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
    (name: \spectralShift, spec: ControlSpec(80, 3000, \exp), default: 1000, path: "/soneth/spectralshift", cc: 3),
    (name: \spatialSpread, spec: ControlSpec(-1, 1, \lin),    default: 0.0,  path: "/soneth/spatialspread", cc: 4),

    // ── Row 2: Ambient Processing ────────────────────────────────────────
    (name: \textureDepth,  spec: ControlSpec(0, 0.6, \lin),   default: 0.2,  path: "/soneth/texturedepth",  cc: 32),
    (name: \atmosphereMix, spec: ControlSpec(0, 0.9, \lin),   default: 0.4,  path: "/soneth/atmospheremix", cc: 33,
        aliases: ["/parliament/fx/reverb"]),
    (name: \memoryFeed,    spec: ControlSpec(0, 0.8, \lin),   default: 0.3,  path: "/soneth/memoryfeed",    cc: 34),
    (name: \harmonicRich,  spec: ControlSpec(0.1, 8, \exp),   default: 1.0,  path: "/soneth/harmonicrich",  cc: 35),
    (name: \resonantBody,  spec: ControlSpec(0.1, 0.8, \lin), default: 0.4,  path: "/soneth/resonantbody",  cc: 36),

    // ── Row 3: Drone/Noise Controls ──────────────────────────────────────
    (name: \masterAmp,     spec: ControlSpec(0, 1, \lin),     default: 0.7,  path: "/soneth/masteramp",     cc: 5),
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
        hasBus: false, beatParam: \beatTempo)
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

        // 3 · language-side cache
        if(~controlValues.notNil) { ~controlValues[name] = val };

        // 4 · GUI knob + label (event-driven — replaces the 50ms polling loop;
        //     knob.value = does NOT fire the knob's action, so no feedback loop)
        {
            var knob = if(~knobViews.notNil) { ~knobViews[name] };
            var label = if(~controlLabels.notNil) { ~controlLabels[name] };
            if(knob.notNil) { knob.value = spec.unmap(val) };
            if(label.notNil) {
                label.string = name.asString.capitalize ++ ": " ++ val.round(0.001);
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

"Parameter registry loaded: % parameters, % OSC routes, % MIDI CCs.".format(
    ~paramDefs.size, ~oscToParamMap.size, ~midiCCToParam.size
).postln;
)
