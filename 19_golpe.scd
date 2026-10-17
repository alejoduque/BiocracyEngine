// ═══════════════════════════════════════════════════════════════════════════
// 19_golpe.scd — GOLPE: percusión de mano, en una rejilla de 32, con kits que
// son estados de escucha
// ═══════════════════════════════════════════════════════════════════════════
//
// Cinco filas (DUM TEK KA TABLA RIQ) y 32 semicorcheas (dos compases), que se
// tocan desde la rejilla del GUI de SC (4_gui.scd). El estado — ~golpePattern,
// los ritmos, el kit, su guardado en las configs — vive en 0_parameters.scd.
//
// ── El kit dice QUÉ se golpea y en qué sala ────────────────────────────────
// El patrón dice cuándo. El kit (~golpeKits, abajo) dice, fila por fila, qué
// material suena — membrana, anillo, ruido, sonajas o un grano del bosque —
// con qué afinación, caída y golpes alternos, y por qué cadena pasa. Cada
// config elige su kit (sección "golpe": "kit"), así el mismo MAQSUM es una
// darbuka al rojo en Hashing, una cisterna en Deep Listening y madera y agua
// entre los pájaros en Acustemología.
//
//   muslimgauze    darbuka, borde, palma, tabla, riq; saturación, crush, dub
//   deep           Oliveros: membrana blanda, tic, aliento, cuenco, campanitas
//   acustemologia  Feld: tambor de tronco, bambú, GRANO del bosque, gota, semillas
//   campo          Lawrence English: todo apagado y lejos; RIQ = GRANO del bosque
//   ceremonia      zikr y gnawa: bendir con bordón, qraqeb, palmas, marco, riq
//   maquina        bombo de seno, clic digital, ruido de banda, ping FM, hat
//
// Ningún golpe es igual al anterior: cada fila alterna sus golpes (mano
// izquierda y derecha, abierto y apagado), cada golpe varía un poco su tono y
// su caída, y un grano del bosque nunca es la misma tajada.
//
// ── Los granos del bosque ──────────────────────────────────────────────────
// Los clips del AudioMoth ya están en memoria (16_corpus_calls.scd los añade
// a ~sampleBuffers con su papel en ~sampleMeta). Una fila de grano corta 20 a
// 120 ms de un clip del papel que la BANCADA convoca. Los clips opacos (Art.
// 47) no se cortan nunca.
//
// ── La bancada y la marea, sobre el golpe ──────────────────────────────────
//   BANCADA 0 TODAS      neutra; granos de todos los papeles
//           1 NOCTURNA   −3 semitonos, más oscuro, dub más largo y realimentado
//           2 INSECTOS   sonajas más agudas, caídas cortas, más fantasmas
//           3 CORO       la TABLA contesta cuando la Cámara abre una voz
//           4 TRANSICIÓN menos contratiempos; con cada bloque el acento cambia de fila
//   MAREA   densidad de los contratiempos y fantasmas (como antes), y además
//           abre el dub y la sala en la cresta y trae al frente los granos
//
// ── Es una capa de VOZ, no un motor ────────────────────────────────────────
// Usa el ciclo de vida de los motores (~motWatcher la enciende al subir su
// fader y la apaga tras 20 s en cero; su stem queda en pausa mientras tanto),
// pero su nivel no pasa por MOTOR ni por el cuadrado: es lineal como PERC.
//   nivel = masterVolume × masterAmp (SYNTH TRIM) × mixGolpe × ~trimGolpe × kit
//
// ── Las perillas que ya estaban, sobre el golpe ────────────────────────────
//   beatTempo      tempo: 92 × beatTempo BPM (46-184)
//   textureDepth   saturación, ×1.5 a ×24 (× el drive del kit)
//   filterCutoff   frecuencia de muestreo efectiva, 2-48 kHz (como RUPTURA)
//   noiseFilt      bits, 4-16
//   spectralShift  paso bajo después del crush, 1.2-14 kHz (× el del kit)
//   delayFeedback  realimentación del dub (hasta 0.92)
//   timeDilation   tiempo del dub: 1 a 6 semicorcheas (+ el del kit)
//   memoryFeed     cuánto va al dub
//   atmosphereMix  cuánto va a la cámara
//   pitchShift     afinación, ±6 semitonos (p / 4), más "afinar" de la config
//   resonantBody   cuánto suena cada golpe
//   harmonicRich   estiramiento de los parciales de tabla y sonajas
//   noiseLevel     mano humana: 0-12 ms de desfase y velocidad dispersa
//   percRate       fantasmas: un golpe suave medio paso después de TEK/KA
//   OPACIDAD/CINTA ~tapeDrift estira y encoge cada paso
//
// ── La afinación, por fila y por paso (0_parameters.scd) ───────────────────
// Clic en el nombre de una fila de la rejilla: las cuatro primeras perillas de
// TIMBRE (PITCH, HARM, BODY, TEXTURE) y PAD PITCH pasan a afinar esa fila —
// AFINAR, TONO, CAÍDA, MOD, OCTAVA — y el resto de la superficie se apaga en gris hasta el siguiente
// clic. Clic derecho (o alt) en una casilla: lo mismo para ese paso, que guarda
// sólo lo que se tocó (esquina naranja). Doble clic: vuelve al kit. Al soltar
// la perilla suena un golpe de prueba. Todo se guarda en la config.
//   AFINAR  ±12 semitonos (en el RIQ, las sonajas)
//   OCTAVA  ±2 octavas enteras, sumadas a AFINAR
//   TONO    dónde está el brillo (~golpeShape traduce a cada material)
//   MOD     cuánto se mueve: caída del dum, FM y glissando de la tabla, anillo
//           del tek, palmas del ka, doble del riq, saturación del grano
//   CAÍDA   ×0.25 a ×4
// TONO y MOD compensan su nivel: brillo y movimiento, no volumen (medido en
// cada fila sintética de cada kit: las 16 esquinas a +8 dB como máximo).
//
// ── La cadena ──────────────────────────────────────────────────────────────
// Una transacción (como mucho una cada 0.25 s, con probabilidad
// transactionInfluence) mete un floreo de TEK, RIQ o TABLA en la siguiente
// casilla encendida. Un bloque nuevo dobla en redoble las casillas encendidas
// de los últimos cuatro pasos y acentúa el siguiente tiempo fuerte. La rejilla
// del intérprete nunca se reescribe: la cadena toca sobre sus casillas
// encendidas y una casilla vacía no suena — con la rejilla en blanco, GOLPE
// calla.

(
~golpeBus = ~golpeBus ?? { Bus.audio(s, 2) };

// Un golpe libera su nodo cuando su cola terminó.
~golpeEnd = { |len| Line.kr(0, 0, len, doneAction: 2) };
~golpeNyq = { |f| f.min(SampleRate.ir * 0.45) };

// ─── Los cinco materiales ────────────────────────────────────────────────
// Con sus valores por omisión suenan como sonaba GOLPE antes de los kits.

// Membrana: darbuka, bendir con bordón, tambor de tronco, membrana blanda.
SynthDef(\golpeDum, { |out = 0, amp = 0.5, pan = 0, freq = 96, dec = 0.4, bend = 2.2, bendT = 0.035,
        bodyAmp = 1, m1 = 1.59, m2 = 2.14, modeAmp = 1, modeDec = 1, slap = 0.25, snare = 0|
    var pEnv = EnvGen.ar(Env([bend, 1], [bendT], -6));
    var body = SinOsc.ar(freq * pEnv, 0.5pi) * EnvGen.ar(Env.perc(0.001, dec, 1, -5)) * bodyAmp;
    var exc  = Decay2.ar(Impulse.ar(0), 0.0005, 0.004) * PinkNoise.ar;
    var modes = Ringz.ar(exc, ~golpeNyq.(freq * [m1, m2]), dec * modeDec * [0.4, 0.25]) * [0.08, 0.04] * modeAmp;
    var hit = HPF.ar(WhiteNoise.ar, 1500) * EnvGen.ar(Env.perc(0.0005, 0.012)) * slap;
    // El bordón del bendir: cuerdas contra el parche, un zumbido corto.
    var buzz = BPF.ar(WhiteNoise.ar, ~golpeNyq.(4200), 0.7)
        * EnvGen.ar(Env.perc(0.002, (dec * 0.5).max(0.03))) * snare;
    var sig = body + modes.sum + hit + buzz;
    ~golpeEnd.(dec * modeDec.max(1) * 1.3 + 0.1);
    Out.ar(out, Pan2.ar(sig * amp, pan));
}).add;

// Borde y metal: el canto de la darbuka, bambú, qraqeb, tic, clic digital.
SynthDef(\golpeTek, { |out = 0, amp = 0.5, pan = 0, freq = 760, dec = 0.08, excDec = 0.02,
        crackF = 3200, crackQ = 0.6, crackAmp = 1.5, ringAmp = 0.3, ringRatio = 1.53,
        knockAmp = 0.3, clack = 0.018, clackAmp = 0|
    var exc = WhiteNoise.ar * EnvGen.ar(Env.perc(0.0003, excDec));
    var crack = BPF.ar(exc, ~golpeNyq.(crackF), crackQ) * crackAmp;
    var ring = Ringz.ar(exc * 0.2, ~golpeNyq.(freq * [1, ringRatio]), dec * [1, 0.6]).sum * ringAmp;
    var knock = SinOsc.ar(freq * 0.5 * EnvGen.ar(Env([1.6, 1], [0.01]))) * EnvGen.ar(Env.perc(0.001, 0.05)) * knockAmp;
    var sig = crack + ring + knock;
    // Las qraqeb son dos platos: el segundo choca unos milisegundos después.
    sig = sig + (DelayN.ar(sig, 0.05, clack.clip(0.001, 0.05)) * clackAmp);
    ~golpeEnd.(dec * 1.5 + 0.08 + clack);
    Out.ar(out, Pan2.ar(sig * amp, pan));
}).add;

// Ruido de mano: palma apagada, escobilla, aliento, palmas, ruido de banda.
SynthDef(\golpeKa, { |out = 0, amp = 0.5, pan = 0, freq = 240, dec = 0.04, excDec = 0.015,
        palmF = 1200, palmQ = 1.0, palmLpf = 4000, palmAmp = 1.6, thudAmp = 0.35, clap = 0|
    var exc = WhiteNoise.ar * EnvGen.ar(Env.perc(0.0005, excDec));
    var palm = LPF.ar(BPF.ar(exc, ~golpeNyq.(palmF), palmQ), ~golpeNyq.(palmLpf)) * palmAmp;
    var thud = SinOsc.ar(freq) * EnvGen.ar(Env.perc(0.001, dec)) * thudAmp;
    var sig = palm + thud;
    // Palmas: varias manos que no caen juntas.
    sig = sig + ((DelayN.ar(sig, 0.04, 0.011) + (DelayN.ar(sig, 0.04, 0.024) * 0.7)) * clap);
    ~golpeEnd.(dec * 2 + excDec + 0.08);
    Out.ar(out, Pan2.ar(sig * amp, pan));
}).add;

// Anillo afinado: tabla, cuenco, gota de agua, marco agudo, ping FM.
SynthDef(\golpeTabla, { |out = 0, amp = 0.5, pan = 0, freq = 340, dec = 0.55, bend = 0.92, glideT = 0.15,
        stretch = 1, r2 = 2, r3 = 3, r4 = 4.1, pa2 = 1, pa3 = 1, pa4 = 1, click = 0.4,
        fmAmp = 0, fm = 2, fmRatio = 1.41|
    var glide = EnvGen.ar(Env([bend, 1], [glideT], 2));
    var exc = Decay2.ar(Impulse.ar(0), 0.0003, 0.003) * (1 + PinkNoise.ar(0.3));
    var parts = ~golpeNyq.(freq * glide * [1, r2, r3 * stretch, r4 * stretch]);
    var sig = Ringz.ar(exc, parts, dec * [1, 0.7, 0.4, 0.25]) * [0.5, 0.3 * pa2, 0.18 * pa3, 0.1 * pa4];
    var hit = HPF.ar(exc, 2500) * click;
    // El ping de la máquina: una portadora modulada, que se apaga sola.
    var ping = SinOsc.ar(~golpeNyq.(freq * glide), SinOsc.ar(~golpeNyq.(freq * fmRatio)) * fm
        * EnvGen.ar(Env.perc(0.001, dec * 0.4))) * EnvGen.ar(Env.perc(0.001, dec * 0.6)) * fmAmp;
    ~golpeEnd.(dec * 1.3 + 0.1);
    Out.ar(out, Pan2.ar((sig.sum + hit + ping) * amp, pan));
}).add;

// Sonajas: riq, semillas en la banda de la chicharra, campanitas, hat.
SynthDef(\golpeRiq, { |out = 0, amp = 0.5, pan = 0, dec = 0.12, stretch = 1, jScale = 1, jAmp = 0.05,
        hissAmp = 0.4, dbl = 0.012, dblAmp = 0.45, thumpF = 180, thumpAmp = 0.3|
    var exc = WhiteNoise.ar * EnvGen.ar(Env.perc(0.001, 0.03));
    var jf = ~golpeNyq.([5200, 6900, 8100, 9700, 11300] * stretch * jScale);
    var jing = Ringz.ar(exc * jAmp, jf, dec * [1, 0.8, 0.9, 0.7, 0.6]).sum;
    var hiss = HPF.ar(exc, ~golpeNyq.(6000 * jScale.min(1))) * hissAmp;
    // La sacudida: las sonajas golpean dos veces, la segunda más suave.
    var shake = jing + hiss;
    var sig = shake + (DelayN.ar(shake, 0.05, dbl.clip(0.001, 0.05)) * dblAmp)
        + (SinOsc.ar(thumpF) * EnvGen.ar(Env.perc(0.001, 0.06)) * thumpAmp);
    ~golpeEnd.(dec * 1.5 + 0.08 + dbl);
    Out.ar(out, Pan2.ar(sig * amp, pan));
}).add;

// Grano del bosque: una tajada corta de un clip del AudioMoth, con forma de golpe.
SynthDef(\golpeGrain, { |out = 0, amp = 0.5, pan = 0, buf = 0, start = 0, dur = 0.06, rate = 1,
        atk = 0.002, hp = 200, lp = 12000, gain = 3|
    var env = EnvGen.ar(Env([0, 1, 0], [atk, dur], [0, -4]));
    var sig = PlayBuf.ar(1, buf, rate * BufRateScale.kr(buf), startPos: start) * env * gain;
    sig = LPF.ar(HPF.ar(sig, ~golpeNyq.(hp)), ~golpeNyq.(lp));
    sig = Sanitize.ar(sig).tanh;
    ~golpeEnd.(atk + dur + 0.02);
    Out.ar(out, Pan2.ar(sig * amp, pan));
}).add;

// La cadena, una sola para las cinco filas. Las perillas fijan la base; el
// kit, la bancada y la marea la mueven (argumentos que el secuenciador
// actualiza en cada paso, suavizados con Lag).
SynthDef(\golpeFx, { |in = 0, gate = 1, stepDur = 0.163, dubSteps = 3, tide = 0.65,
        driveMul = 1, crushMix = 1, crushRate = 1, lpfMul = 1, fbAdd = 0, roomAdd = 0,
        sendAdd = 0, far = 0, trim = 1|
    var td    = Lag.kr(tide, 0.5);
    var drive = (~motIn.(\textureDepth, 0.2).linexp(0, 0.6, 1.5, 24) * Lag.kr(driveMul, 0.5)).max(1);
    var srate = (~motIn.(\filterCutoff, 0.6).linexp(0, 1, 2000, 48000) * Lag.kr(crushRate, 0.5)).clip(500, 48000);
    var bits  = ~motIn.(\noiseFilt, 0.5).linlin(0, 1, 4, 16);
    var lpf   = ~golpeNyq.(Lag.kr(~motIn.(\spectralShift, 1000).explin(80, 2400, 1200, 14000)
        * lpfMul * (1 - (far * 0.55)), 0.3).clip(200, 20000));
    var send  = (~motIn.(\memoryFeed, 0.3).linlin(0, 0.8, 0.1, 0.9) + Lag.kr(sendAdd, 0.5) + (td * 0.3)).clip(0, 1);
    var fb    = (~motIn.(\delayFeedback, 0.3).linlin(0, 0.95, 0, 0.92) + Lag.kr(fbAdd, 0.5) + (td * 0.1)).clip(0, 0.92);
    var atm   = (~motIn.(\atmosphereMix, 0.4) + Lag.kr(roomAdd, 0.5) + (td * 0.25)).clip(0, 1);
    var level = Lag.kr(~motIn.(\masterVolume, 0.3) * ~motIn.(\masterAmp, 0.7)
        * ~motIn.(\mixGolpe, 0.0) * trim, 0.1) * ~trimGolpe;
    var env = EnvGen.kr(Env.asr(0.05, 1, 4, [2, -3]), gate, doneAction: 2);
    var sig, loop, dub, st, crushed;
    sig = HPF.ar(In.ar(in, 2), 40);
    // Lejos: un poco de demora antes de todo, como llega lo que está lejos.
    sig = DelayL.ar(sig, 0.05, Lag.kr(far, 0.5) * 0.035);
    // Asimétrica: el desplazamiento antes del tanh da armónicos pares, el
    // sonido de una consola llevada al rojo; se resta para no dejar DC.
    sig = ((sig * drive) + 0.08).tanh - 0.08.tanh;
    sig = sig * drive.reciprocal.sqrt.max(0.35);
    crushed = ~motCrush.(sig, srate, bits);
    sig = XFade2.ar(sig, crushed, Lag.kr(crushMix, 0.5).clip(0, 1) * 2 - 1);
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

// ─── Los kits ────────────────────────────────────────────────────────────
// Por fila: def (material), lvl, pan, freq, dec, fix (argumentos del
// material), strokes (golpes que alternan; \fmul y \dmul multiplican tono y
// caída), y para DUM bend + bendVel × velocidad, para TABLA bends.
// Una fila con def \golpeGrain corta el bosque: gdur, hp, lp, gain.
// fx: drive ×, crush (mezcla 0-1) y su tasa ×, lpf ×, fb +, dub + pasos,
// room +, send +, far (lejanía 0-1), trim (nivel del kit: medido en el stem
// con MAQSUM, para que todos queden a ±1 dB de MUSLIMGAUZE).
~golpeKits = (
    muslimgauze: (
        rows: (
            dum:   (def: \golpeDum, lvl: 1.0, pan: 0.0, freq: 96, dec: 0.38, bend: 1.8, bendVel: 1,
                strokes: [[], [\slap, 0.5, \modeAmp, 1.6, \dmul, 0.8]]),
            tek:   (def: \golpeTek, lvl: 0.7, pan: 0.25, freq: 760, dec: 0.07,
                strokes: [[], [\crackF, 2600, \knockAmp, 0.15]]),
            ka:    (def: \golpeKa, lvl: 0.5, pan: -0.2, freq: 240, dec: 0.04,
                strokes: [[], [\palmF, 1500]]),
            tabla: (def: \golpeTabla, lvl: 0.6, pan: -0.35, freq: 340, dec: 0.55, bends: [0.92, 1, 1.06],
                strokes: [[], [\pa3, 0.4, \pa4, 0.3, \dmul, 0.45]]),
            riq:   (def: \golpeRiq, lvl: 0.35, pan: 0.4, dec: 0.12,
                strokes: [[], [\dbl, 0.02, \thumpAmp, 0.5]])
        ),
        fx: (drive: 1, crush: 1, crushRate: 1, lpf: 1, fb: 0, dub: 0, room: 0, send: 0, far: 0, trim: 1)
    ),
    deep: (
        rows: (
            dum:   (def: \golpeDum, lvl: 0.6, pan: 0.0, freq: 62, dec: 2.2, bend: 1.15, bendVel: 0.1,
                fix: [\slap, 0.03, \modeAmp, 2.5, \m1, 2.3, \m2, 3.9, \modeDec, 3, \bodyAmp, 0.8],
                strokes: [[], [\m1, 2.17, \fmul, 0.94]]),
            tek:   (def: \golpeTek, lvl: 0.32, pan: 0.3, freq: 1900, dec: 0.9,
                fix: [\crackAmp, 0.25, \crackF, 5200, \ringAmp, 0.9, \ringRatio, 2.76, \knockAmp, 0],
                strokes: [[], [\fmul, 1.122]]),
            ka:    (def: \golpeKa, lvl: 0.3, pan: -0.3, freq: 180, dec: 0.3,
                fix: [\palmF, 700, \palmQ, 3, \palmLpf, 2000, \palmAmp, 0.8, \thudAmp, 0.05, \excDec, 0.12]),
            tabla: (def: \golpeTabla, lvl: 0.45, pan: -0.25, freq: 220, dec: 5, bends: [1, 1, 0.995],
                fix: [\r2, 2.76, \r3, 5.4, \r4, 8.93, \click, 0.05, \pa2, 0.9, \pa3, 0.7, \pa4, 0.5, \glideT, 0.4],
                strokes: [[], [\fmul, 1.335], [\fmul, 0.749]]),
            riq:   (def: \golpeRiq, lvl: 0.25, pan: 0.45, dec: 1.6,
                fix: [\jScale, 0.42, \hissAmp, 0.02, \thumpAmp, 0, \dblAmp, 0.25, \jAmp, 0.12])
        ),
        fx: (drive: 0.15, crush: 0, crushRate: 1, lpf: 0.55, fb: 0.15, dub: 2, room: 0.5, send: 0.2, far: 0, trim: 0.42)
    ),
    acustemologia: (
        rows: (
            dum:   (def: \golpeDum, lvl: 0.8, pan: -0.1, freq: 140, dec: 0.5, bend: 1.05, bendVel: 0.05,
                fix: [\bodyAmp, 0.35, \modeAmp, 6, \m1, 2.4, \m2, 4.1, \modeDec, 1.4, \slap, 0.12],
                strokes: [[], [\fmul, 1.335], [\fmul, 0.89]]),
            tek:   (def: \golpeTek, lvl: 0.55, pan: 0.3, freq: 1180, dec: 0.12,
                fix: [\crackF, 1800, \crackQ, 1.5, \crackAmp, 0.6, \ringAmp, 1.0, \ringRatio, 2.92, \knockAmp, 0.1],
                strokes: [[], [\fmul, 1.19]]),
            ka:    (def: \golpeGrain, lvl: 0.9, pan: -0.35, gdur: 0.07, hp: 300, lp: 12000, gain: 4),
            tabla: (def: \golpeTabla, lvl: 0.4, pan: 0.15, freq: 700, dec: 0.18, bends: [0.55, 0.6, 0.5],
                fix: [\pa2, 0.2, \pa3, 0, \pa4, 0, \click, 0.05, \glideT, 0.05],
                strokes: [[], [\fmul, 1.26], [\fmul, 0.84]]),
            riq:   (def: \golpeRiq, lvl: 0.3, pan: 0.5, dec: 0.07,
                fix: [\jScale, 0.62, \hissAmp, 0.7, \jAmp, 0.03, \dbl, 0.025, \dblAmp, 0.7, \thumpAmp, 0])
        ),
        fx: (drive: 0.35, crush: 0.2, crushRate: 1, lpf: 0.9, fb: -0.1, dub: 0, room: 0.2, send: -0.1, far: 0, trim: 1)
    ),
    campo: (
        rows: (
            dum:   (def: \golpeDum, lvl: 0.9, pan: 0.0, freq: 70, dec: 0.6, bend: 1.3, bendVel: 0.3,
                fix: [\slap, 0.02, \modeAmp, 0.5]),
            tek:   (def: \golpeTek, lvl: 0.5, pan: 0.2, freq: 520, dec: 0.05,
                fix: [\crackF, 1400, \crackAmp, 0.5, \knockAmp, 0.4],
                strokes: [[], [\fmul, 0.9]]),
            ka:    (def: \golpeKa, lvl: 0.4, pan: -0.25, freq: 200, dec: 0.03,
                fix: [\palmF, 2500, \palmQ, 2.5, \palmLpf, 6000, \excDec, 0.09, \palmAmp, 0.9, \thudAmp, 0.05]),
            tabla: (def: \golpeTabla, lvl: 0.45, pan: -0.3, freq: 210, dec: 0.22, bends: [0.97, 1],
                fix: [\pa3, 0.3, \pa4, 0.15, \click, 0.1],
                strokes: [[], [\fmul, 1.12, \dmul, 0.7]]),
            riq:   (def: \golpeGrain, lvl: 0.8, pan: 0.4, gdur: 0.12, hp: 1500, lp: 14000, gain: 4, geo: true)
        ),
        fx: (drive: 0.5, crush: 0, crushRate: 1, lpf: 0.4, fb: 0.05, dub: 1, room: 0.35, send: 0, far: 1, trim: 1.38)
    ),
    ceremonia: (
        rows: (
            dum:   (def: \golpeDum, lvl: 1.0, pan: 0.0, freq: 78, dec: 0.7, bend: 1.4, bendVel: 0.4,
                fix: [\snare, 0.35, \slap, 0.15],
                strokes: [[], [\snare, 0.15, \dmul, 0.5]]),
            tek:   (def: \golpeTek, lvl: 0.55, pan: 0.3, freq: 2400, dec: 0.05,
                fix: [\crackF, 4200, \crackQ, 2, \ringAmp, 0.8, \ringRatio, 1.41, \clackAmp, 0.8, \clack, 0.018, \knockAmp, 0],
                strokes: [[], [\clack, 0.026, \fmul, 1.06]]),
            ka:    (def: \golpeKa, lvl: 0.55, pan: -0.2, freq: 300, dec: 0.03,
                fix: [\palmF, 1100, \clap, 0.8]),
            tabla: (def: \golpeTabla, lvl: 0.5, pan: -0.35, freq: 260, dec: 0.3, bends: [1.02, 1],
                fix: [\r2, 1.6, \r3, 2.3, \r4, 3.1, \click, 0.5, \pa3, 0.6],
                strokes: [[], [\dmul, 0.5, \click, 0.8]]),
            riq:   (def: \golpeRiq, lvl: 0.4, pan: 0.4, dec: 0.12,
                strokes: [[], [\dbl, 0.02]])
        ),
        fx: (drive: 0.6, crush: 0.3, crushRate: 1, lpf: 0.8, fb: -0.05, dub: 0, room: 0.3, send: 0, far: 0, trim: 0.86)
    ),
    maquina: (
        rows: (
            dum:   (def: \golpeDum, lvl: 0.9, pan: 0.0, freq: 50, dec: 0.25, bend: 3, bendVel: 1,
                fix: [\bendT, 0.05, \modeAmp, 0, \slap, 0.05]),
            tek:   (def: \golpeTek, lvl: 0.5, pan: 0.3, freq: 3000, dec: 0.01,
                fix: [\crackF, 6000, \crackQ, 0.2, \crackAmp, 2, \excDec, 0.002, \ringAmp, 0, \knockAmp, 0],
                strokes: [[], [\crackF, 8000]]),
            ka:    (def: \golpeKa, lvl: 0.45, pan: -0.3, freq: 400, dec: 0.02,
                fix: [\palmF, 900, \palmQ, 0.3, \palmLpf, 9000, \excDec, 0.03]),
            tabla: (def: \golpeTabla, lvl: 0.4, pan: -0.2, freq: 520, dec: 0.25, bends: [1],
                fix: [\fmAmp, 0.6, \fm, 2.5, \fmRatio, 1.414, \pa2, 0.2, \pa3, 0.1, \pa4, 0.1, \click, 0.2],
                strokes: [[], [\fmRatio, 2.01], [\fmRatio, 3.5, \fmul, 1.5]]),
            riq:   (def: \golpeRiq, lvl: 0.3, pan: 0.45, dec: 0.05,
                fix: [\jScale, 1.1, \hissAmp, 1.2, \jAmp, 0.02, \dblAmp, 0, \thumpAmp, 0])
        ),
        fx: (drive: 1.2, crush: 1, crushRate: 0.5, lpf: 1, fb: -0.15, dub: -1, room: -0.1, send: 0, far: 0, trim: 1.78)
    )
);
~golpeKitNow = { ~golpeKits[~golpeKit ? \muslimgauze] ? ~golpeKits[\muslimgauze] };

// ─── La bancada: qué papel del bosque convoca, y cómo tiñe el golpe ──────
// Leída del lado del lenguaje (~controlValues): el bus sólo se lee
// síncrono en un servidor local.
~golpeBancada = { ((~controlValues ? ())[\bancada] ? 0).round.asInteger.clip(0, 4) };
~golpeBancadaRoles = [
    nil,                                                    // TODAS
    [\nocturnal_voice],                                     // NOCTURNA
    [\insect_chorus],                                       // INSECTOS
    [\dawn_chorus_participant, \dusk_chorus_participant],   // CORO
    [\community_shift]                                      // CAMBIO
];
~golpeBancadaNames = ["TODAS", "NOCTURNA", "INSECTOS", "CORO", "TRANSICIÓN"];
~golpeTint = { |b|
    switch(b,
        1, { (tune: -3, lpf: 0.6, fb: 0.1, dub: 1, ghost: 1, jing: 1, dec: 1.1, off: 1) },
        2, { (tune: 0, lpf: 1, fb: 0, dub: 0, ghost: 1.6, jing: 1.25, dec: 0.8, off: 1) },
        3, { (tune: 0, lpf: 1, fb: 0, dub: 0, ghost: 1, jing: 1, dec: 1, off: 1) },
        4, { (tune: 0, lpf: 1, fb: 0, dub: 0, ghost: 1, jing: 1, dec: 1, off: 0.6) },
        { (tune: 0, lpf: 1, fb: 0, dub: 0, ghost: 1, jing: 1, dec: 1, off: 1) }
    )
};

// ─── Los granos ──────────────────────────────────────────────────────────
// Índices del banco por papel, recalculados cuando cambia la bancada o el
// banco crece; los opacos fuera siempre.
~golpeGrainCache = ();
~golpeGrainPool = { |b, geo = false|
    var key = "%-%-%".format(b, geo, (~sampleBuffers ? []).size).asSymbol;
    ~golpeGrainCache[key] ?? {
        var roles = ~golpeBancadaRoles[b];
        var pool = (~sampleMeta ? []).collect { |m, i|
            if(m.notNil and: { m[\opaque] != true }
                and: { (~sampleBuffers ? [])[i].notNil }
                and: { if(roles.isNil) { (m[\role] != \geophony) or: { geo } } { roles.includes(m[\role]) } }) { i }
        }.reject(_.isNil);
        ~golpeGrainCache[key] = pool;
        pool
    };
};

// ─── TONO y MOD sobre cada material ─────────────────────────────────────
// Los dos controles de la afinación por fila y por paso (0_parameters.scd)
// dicen lo mismo en las seis voces — dónde está el brillo, cuánto se mueve —
// y cada voz lo traduce a sus propios parámetros. MOD hacia arriba agrega
// movimiento aunque el kit no tenga ninguno (el "piso"); hacia abajo lo quita.
// Lo que el kit no fija se lee del default del SynthDef. Ninguna frecuencia
// sale de aquí sin pasar por ~golpeNyq dentro del SynthDef.
~golpeShape = { |def, args, tn|
    var t = tn[\tono] ? 0, m = tn[\mod] ? 0, af = ~golpeSemis.(tn);
    if(t == 0 and: { m == 0 } and: { af == 0 }) { args } {
        var ev = ().putPairs(args);
        var at = { |key| ev[key] ?? {
            ((SynthDescLib.global[def] !? { |d| d.controlDict[key] }) !? { |c| c.defaultValue }) ? 0 } };
        var more = { |key, floor, hi = 1| ev[key] = ((at.(key) * (1 + m)) + (m.max(0) * floor)).clip(0, hi) };
        var swing = { |key| ev[key] = 1 + ((at.(key) - 1) * (1 + m)) };
        // Brighter and busier are louder, and the membranes and rings get
        // louder going down (more of the strike's energy lands in the ring).
        // Compensated here so that tuning is about colour, not level:
        // measured over every synthetic row of every kit, one control at a
        // time at its extremes and all sixteen corners together. With
        // OCTAVA the pitch reaches ±36 st: the drop for going down stops at
        // one octave (past it the dum fell 20 dB), the tabla is lifted going
        // up (it lost 7-17 dB two octaves up) and the riq held back (+9).
        var comp = 1;
        switch(def,
            \golpeDum, {
                ev[\slap] = (at.(\slap) * (2 ** (1.5 * t))).clip(0, 2);
                ev[\modeAmp] = at.(\modeAmp) * (2 ** t);
                swing.(\bend);
                comp = (2 ** (-0.7 * t.max(0))) * (2 ** (af.min(0).max(-12) / 12));
            },
            \golpeTek, {
                ev[\crackF] = at.(\crackF) * (2 ** t);
                more.(\ringAmp, 0.3, 1.0);
                comp = (2 ** (-0.6 * m.max(0))) * (2 ** (-0.3 * t.max(0)));
            },
            \golpeKa, {
                ev[\palmF] = at.(\palmF) * (2 ** t);
                ev[\palmLpf] = at.(\palmLpf) * (2 ** t);
                more.(\clap, 0.6, 1.2);
            },
            \golpeTabla, {
                [\pa2, \pa3, \pa4].do { |key| ev[key] = (at.(key) * (2 ** t)).clip(0, 3) };
                ev[\click] = (at.(\click) * (2 ** (1.5 * t))).clip(0, 2);
                more.(\fmAmp, 0.5, 1);
                swing.(\bend);
                comp = (2 ** (-0.4 * t.max(0))) * (2 ** (-0.4 * m.max(0))) * (2 ** (af.min(0).max(-12) / 18))
                    * (2 ** (af.max(0) / 16));
            },
            \golpeRiq, {
                ev[\hissAmp] = (at.(\hissAmp) * (2 ** (1.5 * t))).clip(0, 2);
                more.(\dblAmp, 0.4, 1);
                ev[\dbl] = (at.(\dbl) * (1 + (m * 0.5))).clip(0.001, 0.05);
                comp = (2 ** (-0.7 * t.max(0))) * (2 ** (af.max(0).neg / 36));
            },
            \golpeGrain, {
                ev[\hp] = (at.(\hp) * (2 ** t)).clip(20, 8000);
                ev[\lp] = (at.(\lp) * (2 ** t)).clip(400, 20000);
                ev[\gain] = at.(\gain) * (2 ** (2 * m));
            }
        );
        ev[\amp] = at.(\amp) * comp;
        ev.asPairs
    }
};

// ─── Cada golpe, desde el kit y las perillas en el momento en que suena ──
~golpeStrokeN = ();
~golpeArgs = { |row, vel, tint, tide = 0.65, step|
    var k = ~motVal;
    var kit = ~golpeKitNow.value;
    var v = kit[\rows][row];
    // The row's tuning, and the step's lock over it (0_parameters.scd).
    var tn = ~golpeTuneAt.(row, step);
    var tune = ((k.(\pitchShift, 0) / 4) + (~golpeAfinar ? 0) + tint[\tune] + ~golpeSemis.(tn)).midiratio;
    var body = k.(\resonantBody, 0.4).linlin(0.1, 0.8, 0.6, 1.8) * tint[\dec] * (2 ** (2 * tn[\caida]));
    var stretch = k.(\harmonicRich, 1.0).explin(0.1, 5, 0.85, 1.3);
    var lvl = v[\lvl] * ((~golpePeso ? ())[row] ? 1);
    var n = (~golpeStrokeN[row] ? 0);
    var strokes = v[\strokes] ? [[]];
    var stroke, fmul = 1, dmul = 1, extra = [], args;
    // Las manos alternan; una de cada cuatro veces, la que no se espera.
    n = if(0.25.coin) { strokes.size.rand } { n + 1 };
    ~golpeStrokeN[row] = n;
    stroke = strokes.wrapAt(n);
    stroke.pairsDo { |key, val|
        switch(key, \fmul, { fmul = val }, \dmul, { dmul = val }, { extra = extra ++ [key, val] });
    };
    args = [\out, ~golpeBus.index, \pan, (v[\pan] + 0.08.rand2).clip(-1, 1)];
    if(v[\def] == \golpeGrain) {
        var pool = ~golpeGrainPool.(~golpeBancada.value, v[\geo] ? false);
        var i = pool.choose;
        var buf = i !? { ~sampleBuffers[i] };
        // nil = no bank yet; ~golpeHit falls back to the synthetic voice.
        if(buf.isNil) { nil } {
            ~golpeShape.(\golpeGrain, args ++ [\amp, lvl * vel * (0.4 + (tide * 0.8)), \buf, buf.bufnum,
                \start, rrand(0, (buf.numFrames ? 96000) * 0.75).asInteger,
                \dur, v[\gdur] * rrand(0.7, 1.4) * dmul * (2 ** (2 * tn[\caida])),
                \rate, rrand(0.92, 1.08) * fmul * ~golpeSemis.(tn).midiratio,
                \hp, v[\hp] ? 200, \lp, v[\lp] ? 12000, \gain, v[\gain] ? 3], tn)
        }
    } {
        var f = (v[\freq] ? 1) * tune * fmul * rrand(0.985, 1.015);
        var d = (v[\dec] ? 0.1) * body * dmul * rrand(0.88, 1.12);
        args = args ++ [\amp, lvl * vel] ++ (v[\fix] ? []) ++ extra;
        ~golpeShape.(v[\def], switch(v[\def],
            \golpeDum,   { args ++ [\freq, f, \dec, d, \bend, (v[\bend] ? 1.8) + (vel * (v[\bendVel] ? 1))] },
            \golpeTabla, { args ++ [\freq, f, \dec, d, \bend, (v[\bends] ? [1]).choose, \stretch, stretch] },
            // The riq has no fundamental: AFINAR moves its jingles.
            \golpeRiq,   { args ++ [\dec, d, \stretch, stretch * tint[\jing] * ~golpeSemis.(tn).midiratio] },
            { args ++ [\freq, f, \dec, d] }
        ), tn)
    }
};
// kind: \grid (a box of the grid), \ghost (STRIKE BEAT: a grace note after a
// TEK or KA box), \chain (a block's fill, a transaction's flam, the CORO
// answer). Every kind lands on a box that is on, never on an empty one. The grid
// lights each one when it is heard (~golpeShown, drawn by 4_gui.scd).
~golpeHit = { |row, vel, delay = 0, hits, kind = \grid, tint, tide = 0.65, step|
    var nl = ~motVal.(\noiseLevel, 0.1);
    var v = (vel * (1 + (nl * 0.6).rand2)).clip(0.05, 1.3);
    var jit = (nl * 0.024).rand + delay;
    var def = ~golpeKitNow.value[\rows][row][\def];
    var args = ~golpeArgs.(row, v, tint ?? { ~golpeTint.(~golpeBancada.value) }, tide, step);
    // Un grano sin banco todavía (el corpus carga después) no suena; la
    // fila no queda muda por eso: toca su material sintético de siempre.
    if(args.isNil) {
        def = ~golpeKits[\muslimgauze][\rows][row][\def];
        args = [\out, ~golpeBus.index, \amp, 0.5 * v, \pan, 0];
    };
    s.makeBundle(s.latency + jit, {
        Synth(def, args, ~golpeGroup, \addToHead);
    });
    if(hits.notNil and: { hits[row].isNil or: { kind == \grid } }) { hits[row] = [v, kind] };
};

// La prueba de la afinación: un golpe de la fila (con el candado del paso, si
// se afina un paso) cuando la mano se detiene sobre la perilla. Sólo mientras
// GOLPE suena: sin su cadena, ~golpeBus no llega a ninguna parte.
~golpePreview = { |row, step|
    if(~motLive.notNil and: { ~motLive[\golpe].notNil }) {
        ~golpeHit.(row, 0.9, 0, nil, \grid, nil, (~beatParams !? { ~beatParams.tideValue }) ? 0.65, step);
    };
};

// 92 BPM a beatTempo 1; la cinta lo estira como estira el beat.
~golpeStepDur = { 60 / (92 * ((~beatParams !? { ~beatParams.beatTempo }) ? 1.0) * 4) * (~tapeDrift ? 1) };

// Una fila suena si la rejilla le da al menos un golpe. Los fantasmas, el
// redoble del bloque, el floreo de una transacción y la respuesta del CORO
// ADORNAN las casillas encendidas; una casilla vacía no suena nunca. Antes
// caían en pasos vacíos de filas que sonaban, y en la rejilla se veía una
// casilla gris encenderse en ámbar y sonar. Con la rejilla en blanco (CLR)
// GOLPE calla, salvo la cola del dub.
~golpeRowOn = { |row| (~golpePattern[row] ? []).includes(1) };
~golpeAnyOn = { ~golpeRows.any { |r| ~golpeRowOn.(r) } };

// CORO: cuando la Cámara abre una voz del bosque (14_phenological_corpus.scd),
// la tabla contesta en el siguiente contratiempo.
~golpeAnswer = { |clip|
    var st = ~golpeState;
    if(st.notNil and: { ~motLive[\golpe].notNil } and: { ~golpeBancada.value == 3 }) {
        st[\answer] = true;
    };
};

// Lo que el GUI muestra bajo los kits: la bancada y la marea, como suenan.
~golpeInfo = "";

~golpeRun = { |st|
    Routine({
        var step = 0;
        loop {
            var dur = ~golpeStepDur.value;
            var k = ~motVal;
            var kit = ~golpeKitNow.value;
            var fxk = kit[\fx];
            var b = ~golpeBancada.value;
            var tint = ~golpeTint.(b);
            var tide = ((~beatParams !? { ~beatParams.tideValue }) ? 0.65);
            var dens = tide.linlin(0, 1, 0.42, 1.0);
            var offP = dens.linlin(0.42, 1.0, 0.55, 1.0) * tint[\off];
            var ghostP = (k.(\percRate, 0.45).explin(0.02, 4, 0, 0.3) * dens * tint[\ghost]).min(0.6);
            var blockAt = (~rhythmState ? ())[\blockAt] ? 0;
            var accent = 1.0;
            var hits = ();
            var shownStep = step;
            var emph = st[\emph] ? 0;
            var onAt = { |r| ((~golpePattern[r] ? [])[step] ? 0) > 0 };
            // Un bloque nuevo: redoble al final de esta vuelta y acento
            // después; en CAMBIO, además, el acento pasa a otra fila.
            if(blockAt != (st[\lastBlock] ? blockAt)) {
                st[\fill] = true; st[\accentNext] = true;
                if(b == 4) { st[\emph] = (emph + 1) % ~golpeRows.size };
            };
            st[\lastBlock] = blockAt;
            if(step == 0 and: { st[\accentNext] == true }) { accent = 1.15; st[\accentNext] = false };
            ~golpeRows.do { |row, ri|
                var on = (~golpePattern[row] ? [])[step] ? 0;
                var vel = case
                    { step == 0 } { 1.0 * accent }
                    { step % 4 == 0 } { 0.9 }
                    { 0.75 };
                if(b == 4) { vel = vel * if(ri == (st[\emph] ? 0)) { 1.35 } { 0.85 } };
                if(on > 0) {
                    // Los pulsos siempre; fuera del pulso, según la Marea.
                    if(step % 4 == 0 or: { offP.coin }) {
                        ~golpeHit.(row, vel, 0, hits, \grid, tint, tide, step);
                        // El fantasma: un golpe leve medio paso después de un
                        // TEK o un KA que sonó, dentro de su propia casilla.
                        if([\tek, \ka].includes(row) and: { ghostP.coin }) {
                            ~golpeHit.(row, 0.25, dur * 0.5, hits, \ghost, tint, tide, step)
                        };
                    };
                };
            };
            // CORO: la tabla contesta en su siguiente casilla encendida, un
            // cuarto de paso después de su golpe. Sin tabla en la rejilla, no.
            if(st[\answer] == true) {
                if(~golpeRowOn.(\tabla).not) { st[\answer] = false } {
                    if(onAt.(\tabla)) {
                        st[\answer] = false;
                        ~golpeHit.(\tabla, 0.45, dur * 0.25, hits, \chain, tint, tide, step);
                    };
                };
            };
            // El redoble del bloque, en la última negra: las casillas
            // encendidas de TEK se doblan en fusas que crecen; las de RIQ, también.
            if(st[\fill] == true and: { step >= 28 }) {
                if(onAt.(\tek)) { ~golpeHit.(\tek, 0.6 + ((step - 28) * 0.1), dur * 0.5, hits, \chain, tint, tide, step) };
                if(onAt.(\riq)) { ~golpeHit.(\riq, 0.5, dur * 0.5, hits, \chain, tint, tide, step) };
                if(step == 31) { st[\fill] = false };
            };
            // El floreo de una transacción: espera la siguiente casilla
            // encendida de su fila, o de TEK, RIQ o TABLA; pasado medio
            // compás, la de cualquier fila. La adorna detrás de su golpe. Con
            // la rejilla en blanco, se pierde.
            st[\txHit] !? { |h|
                var waited = (h[\waited] ? 0) + 1;
                var row = ([h[\row], \tek, \riq, \tabla] ++ if(waited > 8) { ~golpeRows } { [] })
                    .detect { |r| onAt.(r) };
                h[\waited] = waited;
                if(row.notNil) {
                    st[\txHit] = nil;
                    ~golpeHit.(row, h[\vel], dur * 0.25, hits, \chain, tint, tide, step);
                    ~golpeHit.(row, h[\vel] * 0.6, dur * 0.5, nil, \chain, tint, tide, step);
                    if(row == \riq) { ~golpeHit.(\riq, h[\vel] * 0.45, dur * 0.75, nil, \chain, tint, tide, step) };
                } {
                    if(~golpeAnyOn.value.not) { st[\txHit] = nil };
                };
            };
            // La cadena: el kit, la bancada y la marea, en cada paso.
            st[\fx] !? { |fx|
                var td = k.(\timeDilation, 2.0).explin(0.5, 6, 1, 6).round;
                s.makeBundle(s.latency, {
                    fx.set(\stepDur, dur, \dubSteps, (td + fxk[\dub] + tint[\dub]).clip(1, 8), \tide, tide,
                        \driveMul, fxk[\drive], \crushMix, fxk[\crush], \crushRate, fxk[\crushRate],
                        \lpfMul, fxk[\lpf] * tint[\lpf], \fbAdd, fxk[\fb] + tint[\fb],
                        \roomAdd, fxk[\room], \sendAdd, fxk[\send], \far, fxk[\far], \trim, fxk[\trim])
                });
            };
            if(step % 8 == 0) {
                ~golpeInfo = "% · marea %".format(~golpeBancadaNames[b], tide.round(0.01));
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
        ~golpeState = st;
        st[\routine] = ~golpeRun.(st);
    },
    stop: { |st|
        st[\routine] !? { |r| r.stop };
        ~golpeState = nil;
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

"GOLPE listo: % filas × % pasos, % kits (fader mixGolpe, CC 65).".format(
    ~golpeRows.size, ~golpeSteps, ~golpeKits.size).postln;
)
