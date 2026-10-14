// ═══════════════════════════════════════════════════════════════════════════
// 19_golpe.scd — GOLPE: percusión de mano distorsionada, en una rejilla de 32
// ═══════════════════════════════════════════════════════════════════════════
//
// Darbuka, tabla y riq como los usaba Muslimgauze: golpes secos de mano
// pasados por saturación, reducción de bits y un eco dub que los devuelve
// degradados. Cinco filas, 32 semicorcheas (dos compases), que se tocan desde
// la rejilla del GUI de SC (4_gui.scd). El estado — ~golpePattern, la
// biblioteca de ritmos y su guardado en las configs — vive en 0_parameters.scd.
//
//   DUM    darbuka grave: membrana con caída de tono y dos modos
//   TEK    borde: ráfaga de ruido en 2-4 kHz y el anillo del parche
//   KA     palmada apagada
//   TABLA  anillo afinado con glissando
//   RIQ    sonajas (banco de Ringz agudos) y un golpe de marco pequeño
//
// ── Es una capa de VOZ, no un motor ────────────────────────────────────────
// Usa el ciclo de vida de los motores (~motWatcher la enciende al subir su
// fader y la apaga tras 20 s en cero; su stem queda en pausa mientras tanto),
// pero su nivel no pasa por MOTOR ni por el cuadrado: es lineal como PERC.
//   nivel = masterVolume × masterAmp (SYNTH TRIM) × mixGolpe × ~trimGolpe
//
// ── Las perillas que ya estaban, sobre el golpe ────────────────────────────
//   beatTempo      tempo: 92 × beatTempo BPM (46-184)
//   textureDepth   saturación, ×1.5 a ×24
//   filterCutoff   frecuencia de muestreo efectiva, 2-48 kHz (como RUPTURA)
//   noiseFilt      bits, 4-16
//   spectralShift  paso bajo después del crush, 1.2-14 kHz
//   delayFeedback  realimentación del dub (hasta 0.92)
//   timeDilation   tiempo del dub: 1 a 6 semicorcheas (3 = corchea con puntillo)
//   memoryFeed     cuánto va al dub
//   atmosphereMix  cuánto va a la cámara
//   pitchShift     afinación, ±6 semitonos (p / 4)
//   resonantBody   cuánto suena el parche
//   harmonicRich   estiramiento de los parciales de tabla y riq
//   noiseLevel     mano humana: 0-12 ms de desfase y velocidad dispersa
//   percRate       fantasmas: golpes suaves de TEK/KA en los pasos vacíos
//   Marea          probabilidad de los pasos fuera del pulso (los pulsos siempre)
//   OPACIDAD/CINTA ~tapeDrift estira y encoge cada paso
//
// ── La cadena ──────────────────────────────────────────────────────────────
// Una transacción (como mucho una cada 0.25 s, con probabilidad
// transactionInfluence) mete un floreo de TEK, RIQ o TABLA en el paso
// siguiente. Un bloque nuevo convierte los últimos cuatro pasos de la vuelta
// en un redoble y acentúa el siguiente tiempo fuerte. La rejilla del
// intérprete nunca se reescribe: la cadena toca encima de ella, y sólo sobre
// las filas que tienen golpes — con la rejilla en blanco, GOLPE calla.

(
~golpeBus = ~golpeBus ?? { Bus.audio(s, 2) };

// Un golpe libera su nodo cuando su cola terminó.
~golpeEnd = { |len| Line.kr(0, 0, len, doneAction: 2) };
~golpeNyq = { |f| f.min(SampleRate.ir * 0.45) };

SynthDef(\golpeDum, { |out = 0, amp = 0.5, pan = 0, freq = 96, dec = 0.4, bend = 2.2|
    var pEnv = EnvGen.ar(Env([bend, 1], [0.035], -6));
    var body = SinOsc.ar(freq * pEnv, 0.5pi) * EnvGen.ar(Env.perc(0.001, dec, 1, -5));
    var exc  = Decay2.ar(Impulse.ar(0), 0.0005, 0.004) * PinkNoise.ar;
    var modes = Ringz.ar(exc, ~golpeNyq.(freq * [1.59, 2.14]), dec * [0.4, 0.25]) * [0.08, 0.04];
    var slap = HPF.ar(WhiteNoise.ar, 1500) * EnvGen.ar(Env.perc(0.0005, 0.012)) * 0.25;
    var sig = body + modes.sum + slap;
    ~golpeEnd.(dec * 1.3 + 0.1);
    Out.ar(out, Pan2.ar(sig * amp, pan));
}).add;

SynthDef(\golpeTek, { |out = 0, amp = 0.5, pan = 0, freq = 760, dec = 0.08|
    var exc = WhiteNoise.ar * EnvGen.ar(Env.perc(0.0003, 0.02));
    var crack = BPF.ar(exc, ~golpeNyq.(3200), 0.6) * 1.5;
    var ring = Ringz.ar(exc * 0.2, ~golpeNyq.(freq * [1, 1.53]), dec * [1, 0.6]).sum * 0.3;
    var knock = SinOsc.ar(freq * 0.5 * EnvGen.ar(Env([1.6, 1], [0.01]))) * EnvGen.ar(Env.perc(0.001, 0.05)) * 0.3;
    var sig = crack + ring + knock;
    ~golpeEnd.(dec * 1.5 + 0.08);
    Out.ar(out, Pan2.ar(sig * amp, pan));
}).add;

SynthDef(\golpeKa, { |out = 0, amp = 0.5, pan = 0, freq = 240, dec = 0.04|
    var exc = WhiteNoise.ar * EnvGen.ar(Env.perc(0.0005, 0.015));
    var palm = LPF.ar(BPF.ar(exc, ~golpeNyq.(1200), 1.0), ~golpeNyq.(4000)) * 1.6;
    var thud = SinOsc.ar(freq) * EnvGen.ar(Env.perc(0.001, dec)) * 0.35;
    var sig = palm + thud;
    ~golpeEnd.(dec * 2 + 0.06);
    Out.ar(out, Pan2.ar(sig * amp, pan));
}).add;

SynthDef(\golpeTabla, { |out = 0, amp = 0.5, pan = 0, freq = 340, dec = 0.55, bend = 0.92, stretch = 1|
    var glide = EnvGen.ar(Env([bend, 1], [0.15], 2));
    var exc = Decay2.ar(Impulse.ar(0), 0.0003, 0.003) * (1 + PinkNoise.ar(0.3));
    var parts = ~golpeNyq.(freq * glide * [1, 2, 3 * stretch, 4.1 * stretch]);
    var sig = Ringz.ar(exc, parts, dec * [1, 0.7, 0.4, 0.25]) * [0.5, 0.3, 0.18, 0.1];
    var click = HPF.ar(exc, 2500) * 0.4;
    ~golpeEnd.(dec * 1.3 + 0.1);
    Out.ar(out, Pan2.ar((sig.sum + click) * amp, pan));
}).add;

SynthDef(\golpeRiq, { |out = 0, amp = 0.5, pan = 0, dec = 0.12, stretch = 1|
    var exc = WhiteNoise.ar * EnvGen.ar(Env.perc(0.001, 0.03));
    var jf = ~golpeNyq.([5200, 6900, 8100, 9700, 11300] * stretch);
    var jing = Ringz.ar(exc * 0.05, jf, dec * [1, 0.8, 0.9, 0.7, 0.6]).sum;
    var hiss = HPF.ar(exc, ~golpeNyq.(6000)) * 0.4;
    // La sacudida: las sonajas golpean dos veces, la segunda más suave.
    var shake = jing + hiss;
    var sig = shake + (DelayN.ar(shake, 0.02, 0.012) * 0.45)
        + (SinOsc.ar(180) * EnvGen.ar(Env.perc(0.001, 0.06)) * 0.3);
    ~golpeEnd.(dec * 1.5 + 0.08);
    Out.ar(out, Pan2.ar(sig * amp, pan));
}).add;

// La cadena de Muslimgauze, una sola para las cinco filas.
SynthDef(\golpeFx, { |in = 0, gate = 1, stepDur = 0.163, dubSteps = 3|
    var drive = ~motIn.(\textureDepth, 0.2).linexp(0, 0.6, 1.5, 24);
    var srate = ~motIn.(\filterCutoff, 0.6).linexp(0, 1, 2000, 48000);
    var bits  = ~motIn.(\noiseFilt, 0.5).linlin(0, 1, 4, 16);
    var lpf   = ~golpeNyq.(Lag.kr(~motIn.(\spectralShift, 1000).explin(80, 2400, 1200, 14000), 0.1));
    var send  = ~motIn.(\memoryFeed, 0.3).linlin(0, 0.8, 0.1, 0.9);
    var fb    = ~motIn.(\delayFeedback, 0.3).linlin(0, 0.95, 0, 0.92);
    var atm   = ~motIn.(\atmosphereMix, 0.4);
    var level = Lag.kr(~motIn.(\masterVolume, 0.3) * ~motIn.(\masterAmp, 0.7)
        * ~motIn.(\mixGolpe, 0.0), 0.1) * ~trimGolpe;
    var env = EnvGen.kr(Env.asr(0.05, 1, 4, [2, -3]), gate, doneAction: 2);
    var sig, loop, dub, st;
    sig = HPF.ar(In.ar(in, 2), 40);
    // Asimétrica: el desplazamiento antes del tanh da armónicos pares, el
    // sonido de una consola llevada al rojo; se resta para no dejar DC.
    sig = ((sig * drive) + 0.08).tanh - 0.08.tanh;
    sig = sig * drive.reciprocal.sqrt.max(0.35);
    sig = ~motCrush.(sig, srate, bits);
    sig = LPF.ar(sig, lpf);
    // Dub: ping-pong con la cinta degradándose en cada vuelta.
    loop = LocalIn.ar(2);
    dub = DelayC.ar((sig * send) + (loop * fb), 2.0,
        Lag.kr((stepDur * dubSteps).clip(0.02, 1.9), 0.3));
    dub = (LPF.ar(HPF.ar(dub, 300), ~golpeNyq.(3000)) * 1.2).tanh / 1.2;
    LocalOut.ar(dub.reverse);
    sig = sig + (dub * 0.8);
    sig = Sanitize.ar(LeakDC.ar(sig)) * env * level;
    Out.ar(~chamberAuxBus.index, Mix(sig) * atm * 0.3);
    st = Balance2.ar(sig[0], sig[1], Lag.kr(~motIn.(\spatialSpread, 0.0), 0.2).clip(-1, 1));
    Out.ar(~stemOut.(\golpe), if((~limiterChans ? 2) >= 4) { [st[0], st[1], st[1], st[0]] } { st });
}).add;

s.sync;

// Justo antes de la suma de stems (~stemGroupA, 3_synthdefs.scd): los golpes
// a la cabeza, la cadena a la cola.
if(~golpeGroup.notNil) { try { ~golpeGroup.free } };
~golpeGroup = Group.before(~stemGroupA ? ~motorGroup);

// ─── Cada golpe, desde las perillas en el momento en que suena ───────────
~golpeVoices = (
    dum:   (def: \golpeDum,   lvl: 1.0,  pan: 0.0),
    tek:   (def: \golpeTek,   lvl: 0.7,  pan: 0.25),
    ka:    (def: \golpeKa,    lvl: 0.5,  pan: -0.2),
    tabla: (def: \golpeTabla, lvl: 0.6,  pan: -0.35),
    riq:   (def: \golpeRiq,   lvl: 0.35, pan: 0.4)
);
~golpeArgs = { |row, vel|
    var k = ~motVal;
    var tune = (k.(\pitchShift, 0) / 4).midiratio;
    var body = k.(\resonantBody, 0.4).linlin(0.1, 0.8, 0.6, 1.8);
    var stretch = k.(\harmonicRich, 1.0).explin(0.1, 5, 0.85, 1.3);
    var v = ~golpeVoices[row];
    var args = [\out, ~golpeBus.index, \amp, v[\lvl] * vel,
        \pan, (v[\pan] + 0.08.rand2).clip(-1, 1)];
    args ++ switch(row,
        \dum,   { [\freq, 96 * tune * rrand(0.98, 1.02), \dec, 0.38 * body, \bend, 1.8 + vel] },
        \tek,   { [\freq, 760 * tune, \dec, 0.07 * body] },
        \ka,    { [\freq, 240 * tune, \dec, 0.04 * body] },
        \tabla, { [\freq, 340 * tune, \dec, 0.55 * body, \bend, [0.92, 1, 1.06].choose, \stretch, stretch] },
        \riq,   { [\dec, 0.12 * body, \stretch, stretch] }
    )
};
// kind: \grid (a box of the grid), \ghost (STRIKE BEAT on an empty step of a
// row that plays), \chain (a block's fill or a transaction's flam). The grid
// lights each one when it is heard (~golpeShown, drawn by 4_gui.scd).
~golpeHit = { |row, vel, delay = 0, hits, kind = \grid|
    var nl = ~motVal.(\noiseLevel, 0.1);
    var v = (vel * (1 + (nl * 0.6).rand2)).clip(0.05, 1.3);
    var jit = (nl * 0.024).rand + delay;
    s.makeBundle(s.latency + jit, {
        Synth(~golpeVoices[row][\def], ~golpeArgs.(row, v), ~golpeGroup, \addToHead);
    });
    if(hits.notNil and: { hits[row].isNil or: { kind == \grid } }) { hits[row] = [v, kind] };
};

// 92 BPM a beatTempo 1; la cinta lo estira como estira el beat.
~golpeStepDur = { 60 / (92 * ((~beatParams !? { ~beatParams.beatTempo }) ? 1.0) * 4) * (~tapeDrift ? 1) };

// Una fila suena si la rejilla le da al menos un golpe. Los fantasmas, el
// redoble del bloque y el floreo de una transacción ADORNAN las filas que
// suenan; nunca tocan una fila vacía. Con la rejilla en blanco (CLR) GOLPE
// calla, salvo la cola del dub.
~golpeRowOn = { |row| (~golpePattern[row] ? []).includes(1) };

~golpeRun = { |st|
    Routine({
        var step = 0;
        loop {
            var dur = ~golpeStepDur.value;
            var k = ~motVal;
            var dens = ((~beatParams !? { ~beatParams.tideValue }) ? 0.65).linlin(0, 1, 0.42, 1.0);
            var offP = dens.linlin(0.42, 1.0, 0.55, 1.0);
            var ghostP = k.(\percRate, 0.45).explin(0.02, 4, 0, 0.3) * dens;
            var blockAt = (~rhythmState ? ())[\blockAt] ? 0;
            var accent = 1.0;
            var hits = ();
            var shownStep = step;
            // Un bloque nuevo: redoble al final de esta vuelta y acento después.
            if(blockAt != (st[\lastBlock] ? blockAt)) { st[\fill] = true; st[\accentNext] = true };
            st[\lastBlock] = blockAt;
            if(step == 0 and: { st[\accentNext] == true }) { accent = 1.15; st[\accentNext] = false };
            ~golpeRows.do { |row|
                var on = (~golpePattern[row] ? [])[step] ? 0;
                var vel = case
                    { step == 0 } { 1.0 * accent }
                    { step % 4 == 0 } { 0.9 }
                    { 0.75 };
                if(on > 0) {
                    // Los pulsos siempre; fuera del pulso, según la Marea.
                    if(step % 4 == 0 or: { offP.coin }) { ~golpeHit.(row, vel, 0, hits, \grid) };
                } {
                    if([\tek, \ka].includes(row) and: { ~golpeRowOn.(row) } and: { ghostP.coin }) {
                        ~golpeHit.(row, 0.25, 0, hits, \ghost)
                    };
                };
            };
            // El redoble del bloque: TEK en cada semicorchea y fusa de RIQ.
            if(st[\fill] == true and: { step >= 28 }) {
                if(~golpeRowOn.(\tek)) { ~golpeHit.(\tek, 0.6 + ((step - 28) * 0.1), 0, hits, \chain) };
                if(~golpeRowOn.(\riq)) { ~golpeHit.(\riq, 0.5, dur * 0.5, hits, \chain) };
                if(step == 31) { st[\fill] = false };
            };
            // El floreo de una transacción, en este paso, sobre una fila que suena.
            st[\txHit] !? { |h|
                var row = ([h[\row]] ++ [\tek, \riq, \tabla] ++ ~golpeRows).detect { |r| ~golpeRowOn.(r) };
                st[\txHit] = nil;
                if(row.notNil) {
                    ~golpeHit.(row, h[\vel], 0, hits, \chain);
                    ~golpeHit.(row, h[\vel] * 0.6, dur * 0.25);
                    if(row == \riq) { ~golpeHit.(\riq, h[\vel] * 0.45, dur * 0.5) };
                };
            };
            st[\fx] !? { |fx|
                var td = k.(\timeDilation, 2.0).explin(0.5, 6, 1, 6).round;
                s.makeBundle(s.latency, { fx.set(\stepDur, dur, \dubSteps, td) });
            };
            // La rejilla se enciende cuando el golpe SE OYE: los golpes salen
            // con s.latency de retraso, la luz también.
            AppClock.sched(s.latency ? 0.2, {
                if(~motLive[\golpe].notNil) {
                    ~golpeStep = shownStep;
                    ~golpeShown = (step: shownStep, hits: hits, at: Main.elapsedTime, dur: dur);
                    ~golpeRefresh !? { ~golpeRefresh.value };
                };
                nil
            });
            step = (step + 1) % ~golpeSteps;
            dur.wait;
        }
    }).play(SystemClock)
};

~motores[\golpe] = (
    start: { |st|
        st[\fx] = Synth(\golpeFx, [\in, ~golpeBus.index, \stepDur, ~golpeStepDur.value],
            ~golpeGroup, \addToTail);
        st[\nodes] = [st[\fx]];
        st[\routine] = ~golpeRun.(st);
    },
    stop: { |st|
        st[\routine] !? { |r| r.stop };
        ~golpeStep = nil;
        ~golpeShown = nil;
        ~golpeRefresh !? { ~golpeRefresh.value };
    },
    tx: { |st, ev|
        var h = (ev[\hash] ? "").hash.abs;
        if(~motVal.(\transactionInfluence, 0.3).coin) {
            st[\txHit] = (row: [\tek, \riq, \tabla].wrapAt(h >> 4),
                vel: ((ev[\accent] ? 1) * 0.8).clip(0.3, 1.2));
        };
    }
);
~motFaders[\golpe] = \mixGolpe;
~motStems[\golpe] = [\golpe];
fork { s.sync; if(~motLive[\golpe].isNil) { ~motStemsRun.(\golpe, false) } };

"GOLPE listo: % filas × % pasos (fader mixGolpe, CC 65).".format(~golpeRows.size, ~golpeSteps).postln;
)
