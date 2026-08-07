// SuperCollider Ethereum Sonification - MIDI Control System
// Table-driven from the canonical registry (0_parameters.scd).
//
// Previously five hand-written MIDIdef case-ladders duplicated every
// parameter's range (and had drifted: CC 39 wrote to \dronemix and CC 41 to
// \txInfluence — buses that never existed; the real names are \droneMix and
// \transactionInfluence). Now one MIDIdef looks the CC up in ~midiCCToParam
// and routes through ~setParamNorm, which owns scaling, bus write, GUI sync
// and the normalized browser echo.

// Clear existing MIDI definitions
MIDIdef.freeAll;

// Defer MIDIClient.init until after the server is booted.
// On macOS / SC 3.13, MIDIClient.init called at parse time steals UDP port 57120
// before sclang can bind it, pushing sclang to 57121 and silently dropping all
// incoming OSC (Python ETH data, parliament bridge, etc.).
// Deferring to doWhenBooted lets 1_server_config.scd's openUDPPort(57120) claim
// the port first during the boot sequence.
s.doWhenBooted({
    if(MIDIClient.initialized.not) {
        MIDIClient.init;
        MIDIIn.connectAll;
    };
    "MIDI initialized after server boot (port 57120 safe).".postln;
});

// One handler for every mapped CC, on all channels (Faderfox LC2).
MIDIdef.cc(\paramControl, { |val, num, chan, src|
    var paramName = if(~midiCCToParam.notNil) { ~midiCCToParam[num] };
    // Proof of traffic for the GUI's MIDI light and CC counter. Stamped for
    // EVERY incoming CC, mapped or not: the question the light answers is
    // "is the controller talking to me", and an unmapped knob is still the
    // controller talking. The old light only tested whether a device was
    // enumerated, which stayed lit through a dead cable.
    ~lastMidiTime = SystemClock.seconds;
    ~midiCCCount = (~midiCCCount ? 0) + 1;
    if(paramName.notNil) {
        var newVal = ~setParamNorm.(paramName, val / 127, \midi);
        if(newVal.notNil) {
            "MIDI CC % -> %: %".format(num, paramName, newVal.round(0.001)).postln;
        };
    };
}, nil, nil);  // Listen on all channels

"MIDI Control System loaded — table-driven from 0_parameters.scd.".postln;
"CONTROL MAPPING (CC -> parameter):".postln;
if(~paramDefs.notNil) {
    ~paramDefs.do { |def|
        if(def[\cc].notNil) {
            "  CC % -> %  [% .. %]".format(
                def[\cc].asString.padLeft(2), def[\name],
                def[\spec].minval, def[\spec].maxval
            ).postln;
        };
    };
} {
    "  (registry not loaded — no CC map!)".warn;
};
