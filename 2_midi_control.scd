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
// Los controles absolutos (faders, Send, EQ, Main C/D, joystick)
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
// Lo que hace una tecla: conmutar un parámetro 0/1, o el MUTE de un canal.
~lc2Conmutar = { |p| {
    var v = ((~controlValues[p] ? 0) > 0.5).if(0, 1);
    ~setParam.(p, v, \midi);
    "→ % %".format(p, v) } };
~lc2Silenciar = { |p| {
    { var st = ~mixerStrips !? { ~mixerStrips[p] };
      if(st.notNil) { st[\mute].valueAction_(1 - st[\mute].value) } }.defer;
    "→ mute %".format(p) } };
// Lo que no es un valor: una tecla que hace algo (el salto de DÍA del corpus).
~lc2Acciones = (
    dia: { { ~phenoNextRecorded !? { ~phenoNextRecorded.value } }.defer; "→ DÍA (siguiente día grabado)" }
);
// La función de una tecla según su destino: un parámetro 0/1 se conmuta,
// [\mute, canal] es el MUTE de ese canal, [\accion, nombre] una de arriba.
~lc2NotaFn = { |destino|
    case
    { destino.isKindOf(Array) and: { destino[0] == \mute } } { ~lc2Silenciar.(destino[1]) }
    { destino.isKindOf(Array) and: { destino[0] == \accion } } { ~lc2Acciones[destino[1]] }
    { ~lc2Conmutar.(destino) } };
// El mapa de fábrica. Una función, para que APRENDE pueda volver a él.
// Además del mapa, describe el aparato: el nombre de cada control
// (~lc2Nombres, ~lc2NotaNombres), si es absoluto o relativo (~lc2TipoFabrica)
// y qué claves son el mismo control (~lc2Grupo: Send A manda un CC por pista).
~lc2Fabrica = {
    ~lc2Abs = IdentityDictionary.new;   // clave -> [param, etiqueta]
    ~lc2Rel = IdentityDictionary.new;
    ~lc2Notas = IdentityDictionary.new; // clave -> [destino, etiqueta, función]
    ~lc2Nombres = IdentityDictionary.new;
    ~lc2NotaNombres = IdentityDictionary.new;
    ~lc2TipoFabrica = IdentityDictionary.new;
    ~lc2Grupo = IdentityDictionary.new;
    ~lc2NotaGrupo = IdentityDictionary.new;   // nota -> las notas de la misma tecla
    ~lc2Pick = IdentityDictionary.new;
    block {
        var control = { |tipo, rol, nums, etq|
            var ks = nums.asArray.collect { |n| ~lc2Clave.(rol, n) };
            ks.do { |k| ~lc2Nombres[k] = etq; ~lc2TipoFabrica[k] = tipo; ~lc2Grupo[k] = ks };
            ks };
        var abs = { |rol, nums, param, etq|
            control.(\abs, rol, nums, etq).do { |k| ~lc2Abs[k] = [param, etq] } };
        var rel = { |num, param, etq|
            control.(\rel, 2, num, etq).do { |k| ~lc2Rel[k] = [param, etq] } };
        var nota = { |rol, num, destino, etq, fn|
            var k = ~lc2Clave.(rol, num);
            ~lc2NotaNombres[k] = etq;
            fn !? { ~lc2Notas[k] = [destino, etq, fn] } };
        // una tecla que manda otra nota según la pista elegida: [[rol, nota], …]
        var tecla = { |pares, destino, etq|
            var ks = pares.collect { |p| ~lc2Clave.(p[0], p[1]) };
            ks.do { |k| ~lc2NotaNombres[k] = etq; ~lc2NotaGrupo[k] = ks;
                ~lc2Notas[k] = [destino, etq, ~lc2NotaFn.(destino)] } };
        var pista = { |base, master| (base..(base + 11)) ++ [master] };   // track 1-12 + master
        // El mapa de base es el que se armó con APRENDE el 2026-10-20, a mano,
        // con el LC2 delante; las líneas marcadas «(APRENDE)» cambiaron
        // respecto al mapa anterior.
        // FADERS · grupo 1-6 y 7-12 (MATRIX MIXER)
        [\mixDrone, \mixPad, \mixKick, \mixPerc,
         \mixSample, \mixCorpus,                                   // 5 y 6 (APRENDE)
         \mixCorpus, \mixUltra, \mixGolpe, \mixMotor, \masterAmp, \masterVolume].do { |p, i|
            abs.(2, i, p, "fader " ++ (i + 1)) };
        abs.(2, 18, \escenaAB, "crossfader");                       // escenas A·B (0_parameters.scd)
        // MAIN · C y D absolutos, A relativo
        abs.(2, 40, \beatTempo, "Main C");
        abs.(2, 17, \transactionInfluence, "Main D");
        rel.(41, \masterVolume, "Main A");                          // (APRENDE)
        // SEND (canal 10) · el volumen de la sala y dos capas, y la mezcla del drone
        abs.(0, pista.(40, 56),  \masterVolume, "Send A");          // (APRENDE)
        abs.(0, pista.(60, 76),  \mixSample,    "Send B");          // (APRENDE)
        abs.(0, pista.(80, 96),  \mixCorpus,    "Send C");          // (APRENDE)
        abs.(0, pista.(100, 116), \droneMix,    "Send D");
        // EQ (canal 11) · CÁMARA
        abs.(1, pista.(40, 56),  \activityThreshold, "EQ A");
        abs.(1, pista.(60, 76),  \windowWidth,       "EQ B");
        abs.(1, pista.(80, 96),  \absenceWeight,     "EQ C");
        abs.(1, pista.(100, 116), \pulseGain,        "EQ D");
        // JOYSTICK · X = espacio (spread), Y = la sala (chamberMix); en Pan y en FX1
        abs.(0, (20..31) ++ [36], \spatialSpread, "joy X");
        abs.(0, (0..11) ++ [16],  \chamberMix,    "joy Y");
        abs.(2, 38, \spatialSpread, "joy X·FX1");
        abs.(2, 36, \chamberMix,    "joy Y·FX1");
        control.(\abs, 2, 39, "joy X·FX2");                         // libres
        control.(\abs, 2, 37, "joy Y·FX2");
        // ENCODERS RELATIVOS · Clip = SALIDA·FILTRO · FX3 = ESPACIO · FX4 = TIMBRE · FX5 = MOTORES
        [\spectralShift, \filterCutoff, \noiseLevel, \noiseFilt].do { |p, i| rel.(20 + i, p, "Clip " ++ "ABCD"[i]) };
        [\timeDilation, \delayFeedback, \memoryFeed, \atmosphereMix].do { |p, i| rel.(24 + i, p, "FX3 " ++ "ABCD"[i]) };
        [\pitchShift, \harmonicRich, \resonantBody, \textureDepth].do { |p, i| rel.(28 + i, p, "FX4 " ++ "ABCD"[i]) };
        [\mixRemuestreo, \mixEspectro, \mixCaos, \mixRuptura].do { |p, i| rel.(32 + i, p, "FX5 " ++ "ABCD"[i]) };
        // TECLAS
        // Scene-launch (notas 8-13, canal 12): los seis ritmos de GOLPE, como en su fila
        [\maqsum, \baladi, \saidi, \malfuf, \ayoub, \clr].do { |k, i|
            nota.(2, 8 + i, nil, "scene " ++ (i + 1), {
                { if(k == \clr) { ~golpeClear !? { ~golpeClear.value } }
                    { if(~golpeLoad.notNil and: { ~golpeLibrary.notNil }) { ~golpeLoad.(~golpeLibrary[k]) } } }.defer;
                "→ GOLPE " ++ k.asString.toUpper }) };
        // FX-ctrl (notas 43-48, canal 12): arcos de marea, PULSE, BOWL, CHINA
        [\tideShort, \tideMedia, \tideLarga, \tidePulse, \bowlOn, \chinaOn].do { |p, i|
            nota.(2, 43 + i, p, "FX key " ++ (i + 1), ~lc2Conmutar.(p)) };
        // Mute-group (canal 10): el MUTE de cada canal, grupo 1-6 y 7-12 como los
        // faders; el 11 enciende/apaga CRUDO y el 12 queda libre
        [\mixDrone, \mixPad, \mixKick, \mixPerc, \mixDust, \mixSample,
         \mixCorpus, \mixUltra, \mixGolpe, \mixMotor, \corpusCrudo, nil].do { |p, i|
            var n = (i < 6).if({ 2 + (8 * i) }, { 50 + (8 * (i - 6)) });
            case
            { p.isNil } { nota.(0, n, nil, "mute " ++ (i + 1)) }
            { i == 10 } { nota.(0, n, p, "mute " ++ (i + 1), ~lc2Conmutar.(p)) }
            { nota.(0, n, [\mute, p], "mute " ++ (i + 1), ~lc2Silenciar.(p)) } };
        // Track-ctrl: LAUNCH salta al siguiente día grabado del corpus (DÍA) y
        // STOP silencia GOLPE (su MUTE: otra vez STOP lo devuelve a su nivel).
        // Mandan una nota por pista (canal 10, 8·pista y 8·pista + 1) y la 0/1
        // en el canal 12 con la pista master: todas hacen lo mismo. Son también
        // las notas del pulsador de los encoders A y B en Main.
        tecla.((0..11).collect { |t| [0, 8 * t] } ++ [[2, 0]], [\accion, \dia], "Launch");
        tecla.((0..11).collect { |t| [0, (8 * t) + 1] } ++ [[2, 1]], [\mute, \mixGolpe], "Stop");
    };
};
~lc2Nombre = { |k| ~lc2Nombres[k] ?? { "CC % · canal %".format(k % 128, (k div: 128) + 10) } };
~lc2NotaNombre = { |k| ~lc2NotaNombres[k] ?? { "nota % · canal %".format(k % 128, (k div: 128) + 10) } };

// ─── APRENDE: asignar el LC2 desde la GUI ─────────────────────────────────
// Clic en la luz MIDI de la GUI de SC (4_gui.scd) → modo APRENDE. Se toca una
// perilla, un fader, un botón o un MUTE de la GUI y se mueve un control del
// LC2, en cualquier orden: ese control pasa a mover ese destino. Se pueden
// asignar varios seguidos; otro clic en la luz sale. Mientras APRENDE está
// encendido el LC2 no mueve nada, y tocar la GUI no cambia valores.
//
// - Los CC van a perillas, faders y botones; las teclas (notas) a botones y
//   MUTE. Send A en la pista 3 es el mismo control que en la pista 1: se
//   asigna el grupo entero (~lc2Grupo).
// - Absoluto o relativo: lo dice el manual para los controles conocidos;
//   para uno desconocido, lo que manda mientras la mano lo gira (un encoder
//   relativo repite 1 o 127).
// - Clic derecho (u opción+clic) en un control de la GUI le quita sus
//   controles del LC2, también los de fábrica.
// - Mayús+clic en la luz MIDI vuelve al mapa de fábrica (guarda una copia
//   del aprendido en lc2_aprendido.anterior.scd).
//
// Lo aprendido se guarda en presets/lc2_aprendido.scd, encima del mapa de
// fábrica: lo que no se tocó sigue el código, así que un cambio de fábrica en
// este archivo sigue llegando a los controles que nadie reasignó.
~lc2AprendidoArchivo = ~presetDir +/+ "lc2_aprendido.scd";
~lc2Aprende = nil;   // nil = apagado; si no, (destino:, captado:, rastro:, hecho:)
~lc2Clase = { |k| (~lc2Grupo[k] ? [k])[0] };   // una clave por control físico
~lc2PonerCC = { |k, tipo, p|
    (~lc2Grupo[k] ? [k]).do { |c|
        ~lc2Abs.removeAt(c); ~lc2Rel.removeAt(c); ~lc2Pick.removeAt(c);
        (if(tipo == \rel) { ~lc2Rel } { ~lc2Abs })[c] = [p, ~lc2Nombre.(c)] } };
~lc2PonerNota = { |k, destino|
    (~lc2NotaGrupo[k] ? [k]).do { |c|
        ~lc2Notas[c] = [destino, ~lc2NotaNombre.(c), ~lc2NotaFn.(destino)] } };
// Quita todo lo que llega a un destino (un parámetro, o [\mute, canal]).
~lc2Quitar = { |destino|
    [~lc2Abs, ~lc2Rel].do { |d| d.keys.do { |c|
        if(d[c][0] == destino) { d.removeAt(c); ~lc2Pick.removeAt(c) } } };
    ~lc2Notas.keys.do { |c| if(~lc2Notas[c][0] == destino) { ~lc2Notas.removeAt(c) } } };
~lc2Leer = {
    var d = if(File.exists(~lc2AprendidoArchivo)) {
        try { File.readAllString(~lc2AprendidoArchivo).interpret }
            { |e| ("LC2 · no pude leer " ++ ~lc2AprendidoArchivo ++ ": " ++ e.errorString).warn; nil } };
    ~lc2AprendidoCC = IdentityDictionary.new;    // clave -> [\abs | \rel, param]
    ~lc2AprendidoNotas = IdentityDictionary.new; // clave -> destino
    ~lc2Soltados = List.new;                     // destinos sin sus controles de fábrica
    if(d.notNil) {
        (d[\soltar] ? []).do { |x| ~lc2Soltados.add(x) };
        (d[\asignar] ? []).do { |a|
            var k = ~lc2Clave.(a[1], a[2]);
            if(a[0] == \nota) { ~lc2AprendidoNotas[(~lc2NotaGrupo[k] ? [k])[0]] = a[3] }
                { ~lc2AprendidoCC[~lc2Clase.(k)] = [a[0], a[3]] } };
        "LC2 · lo aprendido: % controles, % destinos sin los de fábrica (presets/lc2_aprendido.scd)"
            .format(~lc2AprendidoCC.size + ~lc2AprendidoNotas.size, ~lc2Soltados.size).postln;
    };
};
~lc2Aplicar = {
    ~lc2Soltados.do { |d| ~lc2Quitar.(d) };
    ~lc2AprendidoCC.keysValuesDo { |k, e| ~lc2PonerCC.(k, e[0], e[1]) };
    ~lc2AprendidoNotas.keysValuesDo { |k, d| ~lc2PonerNota.(k, d) };
};
~lc2Guardar = {
    var filas = ~lc2AprendidoCC.keys.asArray.sort.collect { |k|
            var e = ~lc2AprendidoCC[k]; [e[0], k div: 128, k % 128, e[1]] }
        ++ ~lc2AprendidoNotas.keys.asArray.sort.collect { |k|
            [\nota, k div: 128, k % 128, ~lc2AprendidoNotas[k]] };
    File.use(~lc2AprendidoArchivo, "w", { |f|
        f.write("// Faderfox LC2 · lo aprendido en la GUI de SC (clic en la luz MIDI → APRENDE).\n");
        f.write("// Va encima del mapa de fábrica de 2_midi_control.scd.\n");
        f.write("// asignar: [tipo, rol, CC o nota, destino] · tipo abs, rel o nota\n");
        f.write("//          rol 0 = canal 10/13 · 1 = canal 11/14 · 2 = canal 12/15\n");
        f.write("// soltar: destinos que perdieron sus controles de fábrica\n");
        f.write("(\n    soltar: " ++ ~lc2Soltados.asArray.asCompileString ++ ",\n    asignar: [\n");
        f.write(filas.collect { |a| "        " ++ a.asCompileString }.join(",\n"));
        f.write("\n    ]\n)\n");
    });
};
// Absoluto o relativo. Un encoder relativo (2's complement) repite pasos
// pequeños, 1 o 127; un control absoluto nunca manda dos veces el mismo valor.
~lc2TipoDe = { |k, vals|
    ~lc2TipoFabrica[k] ?? {
        if(vals.size >= 3 and: { vals.every { |v| (v >= 1 and: { v <= 15 }) or: { v >= 113 } } }
            and: { vals.differentiate.drop(1).includes(0) }) { \rel } { \abs } } };
// Como lo dice la GUI: los canales del mezclador sin «mix», los arcos de marea
// por su botón.
~lc2DestinoNombre = { |d|
    var s = d.asString;
    case
    { d.isKindOf(Array) and: { d[0] == \accion } } { if(d[1] == \dia) { "DÍA" } { d[1].asString.toUpper } }
    { d.isKindOf(Array) } { "MUTE " ++ ~lc2DestinoNombre.(d[1]) }
    { d == \escenaAB } { "ESCENA A·B" }
    { ~knobLabels[d].notNil } { ~knobLabels[d].replace("\n", " ") }
    { (~tideCaptions ? ())[d].notNil } { "MAREA " ++ ~tideCaptions[d] }
    { s.beginsWith("mix") } { s.drop(3).toUpper }
    { ~labelCase.(d) } };
// Los controles del LC2 que llegan a un destino, como los dice la GUI.
~lc2Controles = { |destino|
    var out = Set.new;
    [~lc2Abs, ~lc2Rel, ~lc2Notas].do { |d| d.do { |e| if(e[0] == destino) { out.add(e[1].toUpper) } } };
    out.asArray.sort };
~lc2Etiqueta = { |destino|
    var cs = ~lc2Controles.(destino);
    case { cs.isEmpty } { "—" } { cs.size == 1 } { cs[0] } { cs[0] ++ " +" ++ (cs.size - 1) } };
~lc2EsInterruptor = { |p|
    var d = ~paramDefsByName[p];
    (~knobViews ? ())[p].isKindOf(Button)
        or: { d.notNil and: { d[\spec].step == 1 } and: { d[\spec].maxval == 1 } } };
// Avisos: una línea corta para la cabecera de la GUI, y el log.
~lc2Aviso = { |txt|
    ~lc2AprendeAviso = txt;
    ("LC2 · APRENDE · " ++ txt.replace("\n", " ")).postln;
    ~lc2AlCambiar !? { ~lc2AlCambiar.value } };
~lc2Aprender = { |on|
    if(on) {
        ~lc2Aprende = (destino: nil, captado: nil, rastro: nil, hecho: nil);
        ~lc2Aviso.("toca un control\ny mueve el LC2");
    } {
        ~lc2Aprende = nil;
        "LC2 · APRENDE apagado".postln;
        ~lc2Mapa.value;
        ~lc2AlCambiar !? { ~lc2AlCambiar.value };
    } };
// Desde la GUI: el destino del próximo control del LC2.
~lc2Destino = { |destino|
    var ap = ~lc2Aprende;
    if(ap.notNil) {
        ap[\destino] = destino;
        if(ap[\captado].notNil) { ~lc2Asignar.value }
            { ~lc2Aviso.(~lc2DestinoNombre.(destino) ++ " ←\nmueve el LC2") } } };
// Desde el MIDI, con APRENDE encendido. tipo: \cc o \nota.
~lc2Captar = { |tipo, k, val|
    var ap = ~lc2Aprende, r = ap[\rastro], c = ap[\captado], ahora = Main.elapsedTime;
    var mismo = { |x| x.notNil and: { x[\tipo] == tipo } and: { (~lc2Grupo[x[\k]] ? [x[\k]]).includes(k) } };
    case
    // la mano sigue en el control que acaba de asignarse: no asigna otra vez,
    // pero lo que manda dice si es relativo
    { mismo.(r) and: { (ahora - r[\at]) < 0.6 } } {
        r[\at] = ahora;
        if(tipo == \cc) {
            var kk = ~lc2Clase.(k), antes = ~lc2AprendidoCC[kk], nuevo;
            r[\vals] = (r[\vals] ++ [val]).keep(-8);
            nuevo = ~lc2TipoDe.(kk, r[\vals]);
            if(antes.notNil and: { antes[0] != nuevo }) {
                ~lc2AprendidoCC[kk] = [nuevo, antes[1]];
                ~lc2PonerCC.(kk, nuevo, antes[1]);
                ~lc2Guardar.value;
                "LC2 · APRENDE · % es %".format(~lc2Nombre.(kk), if(nuevo == \rel) { "relativo" } { "absoluto" }).postln;
            };
        } }
    { mismo.(c) } { c[\vals] = (c[\vals] ++ [val]).keep(-8) }
    // Un CC suelto no basta: un fader gastado tiembla ±1 o se arrastra con
    // el vecino, y APRENDE lo tomaba por el control que se quería mover.
    // Cuenta cuando se movió de verdad (3 pasos), o repite un paso de
    // encoder relativo (1…15 o 113…127 dos veces).
    { tipo == \cc and: { ~lc2Deliberado.(ap, k, val).not } } { }
    {
        ap[\captado] = (tipo: tipo, k: k, vals: [val]);
        if(ap[\destino].notNil) { ~lc2Asignar.value } {
            ~lc2Aviso.((if(tipo == \cc) { ~lc2Nombre.(k) } { ~lc2NotaNombre.(k) }).toUpper
                ++ " →\ntoca un control") } } };
~lc2Deliberado = { |ap, k, val|
    var ahora = Main.elapsedTime, cs = ap[\candidatos] ?? { ap[\candidatos] = IdentityDictionary.new };
    var c = cs[k];
    if(c.isNil or: { (ahora - c[\at]) > 1.0 }) { c = (desde: val, previo: nil); cs[k] = c };
    c[\at] = ahora;
    ((val - c[\desde]).abs >= 3) or: {
        var paso = (val >= 1 and: { val <= 15 }) or: { val >= 113 };
        var r = paso and: { c[\previo] == val };
        c[\previo] = val;
        r } };
~lc2Asignar = {
    var ap = ~lc2Aprende, c = ap[\captado], d = ap[\destino];
    var k = if(c[\tipo] == \cc) { ~lc2Clase.(c[\k]) } { (~lc2NotaGrupo[c[\k]] ? [c[\k]])[0] };
    var quien = (if(c[\tipo] == \cc) { ~lc2Nombre.(k) } { ~lc2NotaNombre.(k) }).toUpper;
    ap[\captado] = nil; ap[\destino] = nil;
    case
    { c[\tipo] == \cc and: { d.isKindOf(Array) } } {
        ~lc2Aviso.(~lc2DestinoNombre.(d) ++ " va a una tecla,\nno a " ++ quien) }
    { c[\tipo] == \nota and: { d.isKindOf(Symbol) } and: { ~lc2EsInterruptor.(d).not } } {
        ~lc2Aviso.("una tecla va a un botón,\nno a " ++ ~lc2DestinoNombre.(d)) }
    {
        if(c[\tipo] == \cc) {
            var tipo = ~lc2TipoDe.(k, c[\vals]);
            ~lc2AprendidoCC[k] = [tipo, d];
            ~lc2PonerCC.(k, tipo, d);
        } {
            ~lc2AprendidoNotas[k] = d;
            ~lc2PonerNota.(k, d);
        };
        ~lc2Guardar.value;
        c[\k] = k; c[\at] = Main.elapsedTime;
        ap[\rastro] = c; ap[\hecho] = d;
        ~lc2Aviso.(quien ++ " →\n" ++ ~lc2DestinoNombre.(d));
    } };
// Desde la GUI (clic derecho): el destino pierde sus controles del LC2.
~lc2SoltarDestino = { |d|
    ~lc2Quitar.(d);
    ~lc2AprendidoCC.keys.do { |k| if(~lc2AprendidoCC[k][1] == d) { ~lc2AprendidoCC.removeAt(k) } };
    ~lc2AprendidoNotas.keys.do { |k| if(~lc2AprendidoNotas[k] == d) { ~lc2AprendidoNotas.removeAt(k) } };
    if(~lc2Soltados.includesEqual(d).not) { ~lc2Soltados.add(d) };
    ~lc2Guardar.value;
    if(~lc2Aprende.notNil) { ~lc2Aprende[\destino] = nil; ~lc2Aprende[\hecho] = d };
    ~lc2Aviso.(~lc2DestinoNombre.(d) ++ "\nsin LC2") };
~lc2VolverFabrica = {
    var copia = ~lc2AprendidoArchivo.splitext[0] ++ ".anterior.scd";
    if(File.exists(~lc2AprendidoArchivo)) {
        if(File.exists(copia)) { File.delete(copia) };
        File.copy(~lc2AprendidoArchivo, copia);
        File.delete(~lc2AprendidoArchivo);
    };
    ~lc2Fabrica.value;
    ~lc2Leer.value;
    "LC2 · mapa de fábrica (lo aprendido quedó en %)".format(copia.basename).postln;
    if(~lc2Aprende.notNil) { ~lc2Aprende[\destino] = nil; ~lc2Aprende[\captado] = nil; ~lc2Aprende[\hecho] = nil };
    ~lc2Aviso.("mapa de fábrica") };
// El mapa entero en el log, por destino.
~lc2Mapa = {
    var por = ();
    [~lc2Abs, ~lc2Rel, ~lc2Notas].do { |d| d.do { |e| e[0] !? {
        var nom = ~lc2DestinoNombre.(e[0]);
        por[nom.asSymbol] = (por[nom.asSymbol] ? Set.new).add(e[1]) } } };
    "LC2 · el mapa (destino ← controles):".postln;
    por.keys.asArray.sort.do { |n| "  % ← %".format(n, por[n].asArray.sort.join(", ")).postln };
};
~lc2Fabrica.value;
~lc2Leer.value;
~lc2Aplicar.value;

~lc2Norm = { |p| var def = ~paramDefsByName[p];
    def[\spec].unmap(def[\spec].constrain(~controlValues[p] ? def[\default])) };
~lc2Pulso = IdentityDictionary.new;   // clave -> (v: último valor aceptado, dir:, at:)
~lc2Tiembla = { |k, val|
    var j = ~lc2Pulso[k], ahora = Main.elapsedTime, d;
    if(j.isNil) { ~lc2Pulso[k] = (v: val, dir: 0, at: ahora); true } {
        d = val - j[\v];
        if((d.abs >= 2) or: { d.abs == 1 and: { d.sign == j[\dir] } and: { (ahora - j[\at]) < 0.3 } }) {
            j[\dir] = d.sign; j[\v] = val; j[\at] = ahora; false
        } { true } } };
// Un CC del LC2. Devuelve true si lo atendió.
~lc2CC = { |val, num, chan|
    var rol = ~lc2Rol.(chan), k, a, r;
    if(rol.isNil or: { ~lc2Activo != true }) { false } {
        k = ~lc2Clave.(rol, num); a = ~lc2Abs[k]; r = ~lc2Rel[k];
        case
        { ~lc2Aprende.notNil } { ~lc2Captar.(\cc, k, val); true }
        // Temblor: un control absoluto que vuelve ±1 sobre sí mismo, o da un
        // paso de 1 estando quieto, no es la mano (faders gastados, pilas
        // bajas, el fader vecino que arrastra). Desde quieto hacen falta 2
        // pasos; en movimiento, cada paso en la misma dirección cuenta.
        { a.notNil and: { ~lc2Tiembla.(k, val) } } { true }
        // El crossfader de escenas A·B: sin soft takeover, como en el
        // Octatrack la posición del fader es la mezcla.
        { a.notNil and: { a[0] == \escenaAB } } {
            ~escenaMover !? { ~escenaMover.(val / 127) };
            true }
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
    var rol = ~lc2Rol.(chan), k, f;
    ~lastMidiTime = Main.elapsedTime;
    if(rol.notNil and: { ~lc2Activo == true } and: { vel > 0 }) {
        k = ~lc2Clave.(rol, num);
        f = ~lc2Notas[k];
        case
        { ~lc2Aprende.notNil } { ~lc2Captar.(\nota, k, vel) }
        { f.notNil } { ("LC2 · " ++ f[1] ++ " " ++ f[2].value).postln }
        { ("LC2 · nota % (canal %) sin asignar".format(num, chan + 1)).postln };
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
