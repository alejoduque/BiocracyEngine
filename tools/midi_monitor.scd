// Monitor MIDI · ./start_ecosystem.sh midi
// Lista las entradas MIDI que ve macOS y escribe cada mensaje que llega, sin
// arrancar el motor. Sirve para saber si el LC2 llega al Mac antes de culpar al
// mapa: si aquí no aparece nada al mover un fader, el problema está en el
// cable, la interfaz o el LC2 (apagado, o su MIDI OUT en el IN equivocado).
// Las interfaces que se conecten mientras corre también se escuchan.
// MIDI_SEGUNDOS (60 por defecto) dice cuánto escucha.
(
var segundos = (("MIDI_SEGUNDOS".getenv ? "60").asInteger).max(5);
var conectadas = Set.new, n = 0, cuenta = Dictionary.new;
var lc2 = { |chan|
    // canales de SC 0-based: 9-11 setup 1, 12-14 setup 2
    if(chan.inclusivelyBetween(9, 14)) {
        " · LC2 setup % · %".format((chan < 12).if(1, 2),
            ["Send/Pan/Mute", "EQ", "faders/Main/FX"][(chan - 9) % 3])
    } { "" };
};
var conectar = {
    MIDIClient.list;
    MIDIClient.sources.do { |src|
        if(conectadas.includes(src.uid).not) {
            MIDIIn.connect(0, src); conectadas.add(src.uid);
            "  + entrada: % · %".format(src.device, src.name).postln;
        };
    };
};
MIDIClient.list;
MIDIClient.init((MIDIClient.sources ? []).size.max(1), 0, false);
"\n── MIDI · entradas que ve macOS:".postln;
if(MIDIClient.sources.isEmpty) { "  (ninguna: conecta la interfaz USB-MIDI)".postln };
conectar.value;
"\nMueve faders, encoders y teclas del LC2. Escucho % s; Ctrl+C para salir.\n".format(segundos).postln;
MIDIFunc.cc({ |val, num, chan| var c;
    n = n + 1;
    c = cuenta[[chan, num]] ?? { cuenta[[chan, num]] = [0, val, val] };
    c[0] = c[0] + 1; c[1] = c[1].min(val); c[2] = c[2].max(val);
    "  CC  % · canal % · valor %%".format(num.asString.padLeft(3), (chan + 1).asString.padLeft(2), val.asString.padLeft(3), lc2.(chan)).postln }, nil, nil);
MIDIFunc.noteOn({ |vel, num, chan| n = n + 1;
    "  nota % · canal % · on  %%".format(num.asString.padLeft(3), (chan + 1).asString.padLeft(2), vel.asString.padLeft(3), lc2.(chan)).postln }, nil, nil);
MIDIFunc.noteOff({ |vel, num, chan|
    "  nota % · canal % · off%".format(num.asString.padLeft(3), (chan + 1).asString.padLeft(2), lc2.(chan)).postln }, nil, nil);
MIDIFunc.program({ |val, chan| n = n + 1;
    "  program % · canal %%".format(val, chan + 1, lc2.(chan)).postln }, nil);
Routine({
    (segundos / 2).do { 2.wait; conectar.value };
    if(n == 0) {
        "\nNo llegó ningún mensaje. Revisa: el LC2 encendido (se apaga a los 10 min);\nsu MIDI OUT en el conector de entrada de la interfaz (si no llega nada,\nprueba el otro conector del cable); y que la interfaz aparezca arriba.".postln;
    } {
        "\n% mensajes. Por control (si uno que no tocaste aparece, tiembla:\npilas bajas o fader gastado):".format(n).postln;
        cuenta.keys.asArray.sort { |a, b| (a[0] * 128 + a[1]) < (b[0] * 128 + b[1]) }.do { |key|
            var c = cuenta[key];
            "  CC % · canal % · % mensajes · valores %–%%".format(key[1].asString.padLeft(3),
                (key[0] + 1).asString.padLeft(2), c[0], c[1], c[2], lc2.(key[0])).postln };
    };
    0.exit;
}).play(AppClock);
)
