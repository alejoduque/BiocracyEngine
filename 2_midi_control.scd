// SuperCollider Ethereum Sonification - MIDI Control System
// Current Date and Time (UTC): 2025-03-01 04:32:05
// Current User's Login: alejoduque

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

// Lawrence English ambient parameters - match ~globalParams from synthdefs
~soundParams = (
    // Row 1: Core Controls (Faderfox LC2 Row 1, CCs 0-4)
    masterVolume: 0.3,    // CC 0  - ACTUAL master volume control
    pitchShift: 0.0,      // CC 1  - Frequency shift in semitones (-24 to +24)
    timeDilation: 2.0,    // CC 2  - Stretch/compress time (decay multiplier)
    spectralShift: 1000,  // CC 3  - Filter frequency for spectral shaping
    spatialSpread: 0.0,   // CC 4  - Spatial positioning (-1 to 1)

    // Row 2: Ambient Processing (Faderfox LC2 Row 2, CCs 32-36)
    textureDepth: 0.2,    // CC 32 - Granular texture density
    atmosphereMix: 0.4,   // CC 33 - Reverb amount (ambient space)
    memoryFeed: 0.3,      // CC 34 - Delay feedback (memory/echo)
    harmonicRich: 1.0,    // CC 35 - FM ratio (harmonic complexity)
    resonantBody: 0.4,    // CC 36 - Filter resonance (body/formant)

    // Row 3: Drone/Noise Controls (Faderfox LC2 Row 3, CCs 5-9)
    masterAmp: 0.7,       // CC 5  - Master amplitude (legacy)
    filterCutoff: 0.6,    // CC 6  - Filter cutoff frequency
    noiseLevel: 0.1,      // CC 7  - Noise amount
    noiseFilt: 0.5,       // CC 8  - Noise filter
    droneDepth: 0.3,      // CC 9  - Drone intensity

    // Row 4: Additional Controls (Faderfox LC2 Row 4, CCs 37-41)
    droneFade: 0.5,       // CC 37 - Drone envelope time
    droneSpace: 0.5,      // CC 38 - Drone spatial positioning
    dronemix: 0.4,        // CC 39 - Drone blend amount (NOTE: lowercase in buses)
    delayFeedback: 0.3,   // CC 40 - Delay feedback control
    txInfluence: 0.5,     // CC 41 - Transaction influence on beat engine

    // Global flow controls
    flowRate: 0.8,        // Transaction playback rate
    sparsity: 0.2,        // Minimum gap between events
);

// Note: control buses are created by 3_synthdefs.scd which runs after this file.
// Do NOT create buses here — Bus.control().set() returns nil in SC 3.13, which would
// overwrite ~buses entries with nil and silently break all MIDI→synth routing.
// The MIDIdef handlers below reference ~buses[...] which will be valid by the time
// any MIDI event fires (after the full boot sequence completes).
~buses = ~buses ?? ();

// Lawrence English Ambient MIDI Mapping - Row 1 (Core Performance, CCs 0-4)
MIDIdef.cc(\ambientRow1, { |val, num, chan, src|
    var scaled;

    case
    {num == 0} {
        scaled = val.linlin(0, 127, 0.0, 1.0);
        ~buses[\masterVolume].set(scaled);
        "Master Volume: %".format(scaled.round(0.001)).postln;
        if(~visualsDest.notNil) { ~visualsDest.sendMsg("/soneth/volume", scaled); };
    }
    {num == 1} {
        scaled = val.linlin(0, 127, -24, 24);
        ~buses[\pitchShift].set(scaled);
        "Pitch Shift: % semitones".format(scaled.round(0.1)).postln;
        if(~visualsDest.notNil) { ~visualsDest.sendMsg("/soneth/pitchshift", scaled.linlin(-24, 24, 0, 1)); };
    }
    {num == 2} {
        scaled = val.linexp(0, 127, 0.5, 6.0);   // matches OSC/GUI ceiling of 6x
        ~buses[\timeDilation].set(scaled);
        "Time Dilation: %x".format(scaled.round(0.01)).postln;
        if(~visualsDest.notNil) { ~visualsDest.sendMsg("/soneth/timedilation", scaled.linexp(0.5, 6.0, 0, 1)); };
    }
    {num == 3} {
        scaled = val.linexp(0, 127, 60, 3000);   // Hz — ceiling 3000 to avoid filter silence
        ~buses[\spectralShift].set(scaled);
        "Spectral Shift: % Hz".format(scaled.round(1)).postln;
        if(~visualsDest.notNil) { ~visualsDest.sendMsg("/soneth/spectralshift", scaled.linexp(60, 3000, 0, 1)); };
    }
    {num == 4} {
        scaled = val.linlin(0, 127, -1.0, 1.0);
        ~buses[\spatialSpread].set(scaled);
        "Spatial Spread: %".format(scaled.round(0.01)).postln;
        if(~visualsDest.notNil) { ~visualsDest.sendMsg("/soneth/spatialspread", scaled.linlin(-1.0, 1.0, 0, 1)); };
    };
}, nil, nil);  // Listen on all channels

// Lawrence English Ambient MIDI Mapping - Row 2 (Ambient Processing, CCs 32-36)
MIDIdef.cc(\ambientRow2, { |val, num, chan, src|
    var scaled;

    case
    {num == 32} {
        scaled = val.linlin(0, 127, 0.0, 1.0);
        ~buses[\textureDepth].set(scaled);
        "Texture Depth: %".format(scaled.round(0.001)).postln;
        if(~visualsDest.notNil) { ~visualsDest.sendMsg("/soneth/texturedepth", scaled); };
    }
    {num == 33} {
        scaled = val.linlin(0, 127, 0.0, 1.0);
        ~buses[\atmosphereMix].set(scaled);
        "Atmosphere Mix: %".format(scaled.round(0.001)).postln;
        if(~visualsDest.notNil) { ~visualsDest.sendMsg("/soneth/atmospheremix", scaled); };
    }
    {num == 34} {
        scaled = val.linlin(0, 127, 0.0, 0.8);   // matches OSC/GUI ceiling of 0.8
        ~buses[\memoryFeed].set(scaled);
        "Memory Feed: %".format(scaled.round(0.001)).postln;
        if(~visualsDest.notNil) { ~visualsDest.sendMsg("/soneth/memoryfeed", scaled.linlin(0, 0.8, 0, 1)); };
    }
    {num == 35} {
        scaled = val.linexp(0, 127, 0.1, 8.0);
        ~buses[\harmonicRich].set(scaled);
        "Harmonic Rich: %".format(scaled.round(0.01)).postln;
        if(~visualsDest.notNil) { ~visualsDest.sendMsg("/soneth/harmonicrich", scaled.linexp(0.1, 8.0, 0, 1)); };
    }
    {num == 36} {
        scaled = val.linlin(0, 127, 0.1, 0.8);   // matches OSC/GUI ceiling of 0.8
        ~buses[\resonantBody].set(scaled);
        "Resonant Body: %".format(scaled.round(0.01)).postln;
        if(~visualsDest.notNil) { ~visualsDest.sendMsg("/soneth/resonantbody", scaled.linlin(0.1, 0.8, 0, 1)); };
    };
}, nil, nil);  // Listen on all channels

// Lawrence English Ambient MIDI Mapping - Row 3 (Drone/Noise Controls, CCs 5-9)
MIDIdef.cc(\ambientRow3, { |val, num, chan, src|
    var scaled;

    case
    {num == 5} {
        scaled = val.linlin(0, 127, 0.0, 1.0);
        ~buses[\masterAmp].set(scaled);
        "Master Amp: %".format(scaled.round(0.001)).postln;
        if(~visualsDest.notNil) { ~visualsDest.sendMsg("/soneth/masteramp", scaled); };
    }
    {num == 6} {
        scaled = val.linlin(0, 127, 0.0, 1.0);
        ~buses[\filterCutoff].set(scaled);
        "Filter Cutoff: %".format(scaled.round(0.001)).postln;
        if(~visualsDest.notNil) { ~visualsDest.sendMsg("/soneth/filtercutoff", scaled); };
    }
    {num == 7} {
        scaled = val.linlin(0, 127, 0.0, 1.0);
        ~buses[\noiseLevel].set(scaled);
        "Noise Level: %".format(scaled.round(0.001)).postln;
        if(~visualsDest.notNil) { ~visualsDest.sendMsg("/soneth/noiselevel", scaled); };
    }
    {num == 8} {
        scaled = val.linlin(0, 127, 0.0, 1.0);
        ~buses[\noiseFilt].set(scaled);
        "Noise Filter: %".format(scaled.round(0.001)).postln;
        if(~visualsDest.notNil) { ~visualsDest.sendMsg("/soneth/noisefilt", scaled); };
    }
    {num == 9} {
        scaled = val.linlin(0, 127, 0.0, 1.0);
        ~buses[\droneDepth].set(scaled);
        "Drone Depth: %".format(scaled.round(0.001)).postln;
        if(~visualsDest.notNil) { ~visualsDest.sendMsg("/soneth/dronedepth", scaled); };
    };
}, nil, nil);  // Listen on all channels

// Lawrence English Ambient MIDI Mapping - Row 4 (Additional Controls, CCs 37-41)
MIDIdef.cc(\ambientRow4, { |val, num, chan, src|
    var scaled;

    case
    {num == 37} {
        scaled = val.linlin(0, 127, 0.0, 1.0);
        ~buses[\droneFade].set(scaled);
        "Drone Fade: %".format(scaled.round(0.001)).postln;
        if(~visualsDest.notNil) { ~visualsDest.sendMsg("/soneth/dronefade", scaled); };
    }
    {num == 38} {
        scaled = val.linlin(0, 127, 0.0, 1.0);
        ~buses[\droneSpace].set(scaled);
        "Drone Space: %".format(scaled.round(0.001)).postln;
        if(~visualsDest.notNil) { ~visualsDest.sendMsg("/soneth/dronespace", scaled); };
    }
    {num == 39} {
        scaled = val.linlin(0, 127, 0.0, 1.0);
        ~buses[\dronemix].set(scaled);
        "Drone Mix: %".format(scaled.round(0.001)).postln;
        if(~visualsDest.notNil) { ~visualsDest.sendMsg("/soneth/dronemix", scaled); };
    }
    {num == 40} {
        scaled = val.linlin(0, 127, 0.0, 1.0);
        ~buses[\delayFeedback].set(scaled);
        "Delay Feedback: %".format(scaled.round(0.001)).postln;
        if(~visualsDest.notNil) { ~visualsDest.sendMsg("/soneth/delayfeedback", scaled); };
    }
    {num == 41} {
        scaled = val.linlin(0, 127, 0.0, 1.0);
        ~buses[\txInfluence].set(scaled);
        "TX Influence: %".format(scaled.round(0.001)).postln;
        if(~visualsDest.notNil) { ~visualsDest.sendMsg("/soneth/txinfluence", scaled); };
    };
}, nil, nil);  // Listen on all channels

"MIDI Control System loaded - Lawrence English Ambient Style.".postln;
"".postln;
"AMBIENT CONTROL MAPPING:".postln;
"Row 1 - Core Performance:".postln;
"  CC 0  -> Master Volume (actual volume!)".postln;
"  CC 1  -> Pitch Shift (±2 octaves for freq blending)".postln;
"  CC 2  -> Time Dilation (envelope stretch)".postln;
"  CC 3  -> Spectral Shift (filter sweep)".postln;
"  CC 4  -> Spatial Spread (quad positioning)".postln;
"".postln;
"Row 2 - Ambient Processing:".postln;
"  CC 32 -> Texture Depth (granular density)".postln;
"  CC 33 -> Atmosphere Mix (reverb space)".postln;
"  CC 34 -> Memory Feed (delay feedback)".postln;
"  CC 35 -> Harmonic Rich (FM complexity)".postln;
"  CC 36 -> Resonant Body (filter resonance)".postln;
"".postln;
"Row 3 - Drone/Noise Controls:".postln;
"  CC 5  -> Master Amp (amplitude control)".postln;
"  CC 6  -> Filter Cutoff (frequency sweep)".postln;
"  CC 7  -> Noise Level (noise amount)".postln;
"  CC 8  -> Noise Filter (noise filtering)".postln;
"  CC 9  -> Drone Depth (drone intensity)".postln;
"".postln;
"Row 4 - Additional Controls:".postln;
"  CC 37 -> Drone Fade (envelope time)".postln;
"  CC 38 -> Drone Space (spatial positioning)".postln;
"  CC 39 -> Drone Mix (blend amount)".postln;
"  CC 40 -> Delay Feedback (delay control)".postln;
"  CC 41 -> TX Influence (transaction influence)".postln;