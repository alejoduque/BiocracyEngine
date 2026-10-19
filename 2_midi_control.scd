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
//
// Hot-plug. MIDIClient.init with no arguments opens one input port per source
// it sees at that moment, and connectAll connects only those: a USB-MIDI
// interface plugged in after boot (or one CoreMIDI had not registered yet —
// it happened with the LC2 through an E-MU XMidi1X1) was never heard, and the
// MIDI light stayed at «-». So the client always opens at least one port, and every
// 2 s the source list is re-read and any new source is connected to port 0.
~midiConectadas = ~midiConectadas ?? { Set.new };
~midiConectar = {
    MIDIClient.list;
    MIDIClient.sources.do { |src|
        if(~midiConectadas.includes(src.uid).not) {
            MIDIIn.connect(0, src);
            ~midiConectadas.add(src.uid);
            ("MIDI · entrada conectada: % · %".format(src.device, src.name)).postln;
        };
    };
};
s.doWhenBooted({
    if(MIDIClient.initialized.not) {
        // at least one port, so a source that arrives later has one to join
        MIDIClient.list;
        MIDIClient.init((MIDIClient.sources ? []).size.max(1));
    };
    ~midiConectar.value;
    if(MIDIClient.sources.isEmpty) {
        "MIDI · todavía no hay entradas: las busco cada 2 s (conecta la interfaz cuando quieras).".postln;
    };
    ~midiVigia.stop;
    ~midiVigia = Routine({ loop { 2.wait; ~midiConectar.value } }).play(AppClock);
    "MIDI initialized after server boot (port 57120 safe).".postln;
});

// ═══ Faderfox LC2 (micromodul) ════════════════════════════════════════════
// El LC2 no se programa: manda CC y notas FIJOS, y repite los mismos números
// en tres canales — setup 1 en los canales 10·11·12, setup 2 en 13·14·15
// (system mode: tecla azul izquierda o derecha). Mapear solo por número de CC,
// como hace la tabla general, hacía que los faders 1-6 (CC 0-5, canal 12)
// movieran masterVolume, pitchShift… y los encoders en Send (CC 40-51,
// canal 10) los faders de mezcla. Aquí se mapea por (canal, CC), siguiendo la
// GUI de SC. Los números vienen del manual (LC2 User manual V01, «Controller
// numbers»); ver FADERFOX_LC2_MIDI_MAP.md.
//
//   rol 0 = canal 10/13 · Send, joystick en Pan, Mute-group
//   rol 1 = canal 11/14 · EQ
//   rol 2 = canal 12/15 · faders, crossfader, Main, FX1/FX2, Clip/FX3-5
//
// Los controles absolutos (faders, crossfader, Send, EQ, Main C/D, joystick)
// hacen «soft takeover»: no mueven el valor hasta alcanzarlo (o cruzarlo), así
// cambiar de grupo de faders o cargar una config no produce saltos. Si otra
// superficie mueve el valor mientras el control está quieto (más de 1 s sin
// mensajes), el control vuelve a esperar. Mientras la mano lo mueve, la mano
// manda: el valor sigue al control aunque otro lo haya movido.
// Los encoders en Clip, FX3, FX4, FX5 y Main A son relativos (2's complement).
~lc2Activo = true;
~lc2Rol = { |chan| case { chan >= 9 and: { chan <= 11 } } { chan - 9 }
                        { chan >= 12 and: { chan <= 14 } } { chan - 12 } { nil } };
~lc2Clave = { |rol, num| rol * 128 + num };
~lc2Abs = IdentityDictionary.new;   // clave -> [param, etiqueta]
~lc2Rel = IdentityDictionary.new;
~lc2Notas = IdentityDictionary.new; // clave -> función
block {
    var abs = { |rol, nums, param, etq| nums.asArray.do { |n| ~lc2Abs[~lc2Clave.(rol, n)] = [param, etq] } };
    var rel = { |num, param, etq| ~lc2Rel[~lc2Clave.(2, num)] = [param, etq] };
    var pista = { |base, master| (base..(base + 11)) ++ [master] };   // track 1-12 + master
    // FADERS · grupo 1-6 y 7-12 (MATRIX MIXER, en el orden de la GUI)
    [\mixDrone, \mixPad, \mixKick, \mixPerc, \mixDust, \mixSample,
     \mixCorpus, \mixUltra, \mixGolpe, \mixMotor, \masterAmp, \masterVolume].do { |p, i|
        abs.(2, i, p, "fader " ++ (i + 1)) };
    abs.(2, 18, \mixCarve, "crossfader");                        // MEZCLA: barro ↔ limpia
    // MAIN · C y D absolutos, A relativo
    abs.(2, 40, \beatTempo, "Main C");
    abs.(2, 17, \transactionInfluence, "Main D");
    rel.(41, \mixMasa, "Main A");
    // SEND (canal 10) · DRONE·PAD
    abs.(0, pista.(40, 56),  \droneDepth, "Send A");
    abs.(0, pista.(60, 76),  \droneFade,  "Send B");
    abs.(0, pista.(80, 96),  \droneSpace, "Send C");
    abs.(0, pista.(100, 116), \droneMix,  "Send D");
    // EQ (canal 11) · CÁMARA
    abs.(1, pista.(40, 56),  \activityThreshold, "EQ A");
    abs.(1, pista.(60, 76),  \windowWidth,       "EQ B");
    abs.(1, pista.(80, 96),  \absenceWeight,     "EQ C");
    abs.(1, pista.(100, 116), \pulseGain,        "EQ D");
    // JOYSTICK · X = espacio, Y = sesgo estacional (seca ↓ · lluvias ↑); en Pan y en FX1
    abs.(0, (20..31) ++ [36], \spatialSpread, "joystick X");
    abs.(0, (0..11) ++ [16],  \seasonalBias,  "joystick Y");
    abs.(2, 38, \spatialSpread, "joystick X (FX1)");
    abs.(2, 36, \seasonalBias,  "joystick Y (FX1)");
    // ENCODERS RELATIVOS · Clip = SALIDA·FILTRO · FX3 = ESPACIO · FX4 = TIMBRE · FX5 = MOTORES
    [\spectralShift, \filterCutoff, \noiseLevel, \noiseFilt].do { |p, i| rel.(20 + i, p, "Clip " ++ "ABCD"[i]) };
    [\timeDilation, \delayFeedback, \memoryFeed, \atmosphereMix].do { |p, i| rel.(24 + i, p, "FX3 " ++ "ABCD"[i]) };
    [\pitchShift, \harmonicRich, \resonantBody, \textureDepth].do { |p, i| rel.(28 + i, p, "FX4 " ++ "ABCD"[i]) };
    [\mixRemuestreo, \mixEspectro, \mixCaos, \mixRuptura].do { |p, i| rel.(32 + i, p, "FX5 " ++ "ABCD"[i]) };
    // TECLAS
    // Scene-launch (notas 8-13, canal 12): los seis ritmos de GOLPE, como en su fila
    [\maqsum, \baladi, \saidi, \malfuf, \ayoub, \clr].do { |k, i|
        ~lc2Notas[~lc2Clave.(2, 8 + i)] = {
            { if(k == \clr) { ~golpeClear !? { ~golpeClear.value } }
                { if(~golpeLoad.notNil and: { ~golpeLibrary.notNil }) { ~golpeLoad.(~golpeLibrary[k]) } } }.defer;
            "LC2 · tecla " ++ (i + 1) ++ " → GOLPE " ++ k.asString.toUpper } };
    // FX-ctrl (notas 43-48, canal 12): arcos de marea, PULSE, BOWL, CHINA
    [\tideShort, \tideMedia, \tideLarga, \tidePulse, \bowlOn, \chinaOn].do { |p, i|
        ~lc2Notas[~lc2Clave.(2, 43 + i)] = {
            var v = ((~controlValues[p] ? 0) > 0.5).if(0, 1);
            ~setParam.(p, v, \midi);
            "LC2 · tecla " ++ (i + 1) ++ " → " ++ p ++ " " ++ v } };
    // Mute-group (canal 10): el MUTE de cada canal, grupo 1-6 y 7-12 como los faders
    [\mixDrone, \mixPad, \mixKick, \mixPerc, \mixDust, \mixSample,
     \mixCorpus, \mixUltra, \mixGolpe, \mixMotor].do { |p, i|
        var nota = (i < 6).if({ 2 + (8 * i) }, { 50 + (8 * (i - 6)) });
        ~lc2Notas[~lc2Clave.(0, nota)] = {
            { var st = ~mixerStrips !? { ~mixerStrips[p] };
              if(st.notNil) { st[\mute].valueAction_(1 - st[\mute].value) } }.defer;
            "LC2 · mute " ++ (i + 1) ++ " → " ++ p } };
    ~lc2Notas[~lc2Clave.(0, 82)] = {                               // mute 11: CRUDO
        var v = ((~controlValues[\corpusCrudo] ? 0) > 0.5).if(0, 1);
        ~setParam.(\corpusCrudo, v, \midi); "LC2 · mute 11 → corpusCrudo " ++ v };
};
~lc2Pick = IdentityDictionary.new;
~lc2Norm = { |p| var def = ~paramDefsByName[p];
    def[\spec].unmap(def[\spec].constrain(~controlValues[p] ? def[\default])) };
// Un CC del LC2. Devuelve true si lo atendió.
~lc2CC = { |val, num, chan|
    var rol = ~lc2Rol.(chan), k, a, r;
    if(rol.isNil or: { ~lc2Activo != true }) { false } {
        k = ~lc2Clave.(rol, num); a = ~lc2Abs[k]; r = ~lc2Rel[k];
        case
        { a.notNil and: { ~paramDefsByName[a[0]].notNil } } {
            var p = a[0], n = val / 127, cur = ~lc2Norm.(p);
            var st = ~lc2Pick[k];
            // (no `dict[k] = e` como valor: esa asignación devuelve el diccionario)
            if(st.isNil) { st = (en: false); ~lc2Pick[k] = st };
            // otra superficie movió el valor con el control quieto: volver a esperar
            if(st[\en] and: { st[\enviado].notNil } and: { (cur - st[\enviado]).abs > 0.02 }
                and: { (Main.elapsedTime - (st[\cuando] ? 0)) > 1.0 }) { st[\en] = false };
            if(st[\en].not and: { ((n - cur).abs < 0.03) or: {
                st[\ultimo].notNil and: { (st[\ultimo] - cur).sign != (n - cur).sign } } }) { st[\en] = true };
            st[\ultimo] = n;
            if(st[\en]) {
                var v = ~setParamNorm.(p, n, \midi);
                st[\enviado] = ~lc2Norm.(p); st[\cuando] = Main.elapsedTime;
                "LC2 · % → %: %".format(a[1], p, v.round(0.001)).postln;
            } {
                ~lc2Espera = ~lc2Espera ?? { () };
                if((Main.elapsedTime - (~lc2Espera[k] ? 0)) > 1.0) { ~lc2Espera[k] = Main.elapsedTime;
                    "LC2 · % espera: está en %, % está en % — llévalo hasta ahí"
                        .format(a[1], n.round(0.01), p, cur.round(0.01)).postln };
            };
            true }
        { r.notNil and: { ~paramDefsByName[r[0]].notNil } } {
            var p = r[0], d = (val < 64).if(val, val - 128);
            var v = ~setParamNorm.(p, (~lc2Norm.(p) + (d / 100)).clip(0, 1), \midi);
            "LC2 · % → %: %".format(r[1], p, v.round(0.001)).postln;
            true }
        { false };
    };
};
MIDIdef.noteOn(\lc2Teclas, { |vel, num, chan|
    var rol = ~lc2Rol.(chan), f;
    ~lastMidiTime = Main.elapsedTime;
    if(rol.notNil and: { ~lc2Activo == true } and: { vel > 0 }) {
        f = ~lc2Notas[~lc2Clave.(rol, num)];
        if(f.notNil) { f.value.postln } {
            ("LC2 · nota % (canal %) sin asignar".format(num, chan + 1)).postln };
    };
}, nil, nil);

// One handler for every mapped CC, on all channels. The LC2's channels (10-15)
// go to ~lc2CC first; everything else uses the registry table.
MIDIdef.cc(\paramControl, { |val, num, chan, src|
    var lc2 = ~lc2Rol.(chan).notNil and: { ~lc2Activo == true };
    var paramName = if(lc2) { \lc2 } { if(~midiCCToParam.notNil) { ~midiCCToParam[num] } };
    // Proof of traffic for the GUI's MIDI light and CC counter. Stamped for
    // EVERY incoming CC, mapped or not: the question the light answers is
    // "is the controller talking to me", and an unmapped knob is still the
    // controller talking. The old light only tested whether a device was
    // enumerated, which stayed lit through a dead cable.
    ~lastMidiTime = Main.elapsedTime;
    ~midiCCCount = (~midiCCCount ? 0) + 1;
    if(paramName == \lc2) {
        if(~lc2CC.(val, num, chan).not) {
            ~lastUnmappedCC = ~lastUnmappedCC ?? { () };
            if((Main.elapsedTime - (~lastUnmappedCC[num + (chan * 128)] ? 0)) > 1.0) {
                ~lastUnmappedCC[num + (chan * 128)] = Main.elapsedTime;
                "LC2 · CC % (canal %) sin asignar — libre en 2_midi_control.scd".format(num, chan + 1).postln };
        };
    } { if(paramName.notNil) {
        var newVal = ~setParamNorm.(paramName, val / 127, \midi);
        if(newVal.notNil) {
            "MIDI CC % -> %: %".format(num, paramName, newVal.round(0.001)).postln;
        };
    } {
        // An UNMAPPED CC said nothing at all, which made a controller
        // impossible to explore: the only way to learn what a knob sends was
        // to already know. Now every unrecognised CC names itself, so any
        // control on the device can be identified by turning it and reading
        // the log.
        //
        // Throttled per CC number rather than per message — a knob sends a
        // continuous stream and one line per turn is the useful amount.
        ~lastUnmappedCC = ~lastUnmappedCC ?? { () };
        if((Main.elapsedTime - (~lastUnmappedCC[num] ? 0)) > 1.0) {
            ~lastUnmappedCC[num] = Main.elapsedTime;
            "MIDI CC % is UNMAPPED (value %) — free to assign in 0_parameters.scd"
                .format(num, val).postln;
        };
    } };
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
