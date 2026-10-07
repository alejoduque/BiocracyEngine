// ═══════════════════════════════════════════════════════════════════════════
// 18_motores.scd — Motores: cinco capas de síntesis, cada una con su fader
// ═══════════════════════════════════════════════════════════════════════════
//
// Una config era, hasta aquí, sólo un conjunto de valores de perilla: podía
// mover el motor dentro de lo que ya sabía hacer, pero no sacarlo de ahí. Toda
// config sonaba a este mismo instrumento con otra mezcla. Estos cinco motores
// son otras maneras de producir sonido, cada una en un extremo distinto de lo
// que SuperCollider permite, y cada una es una capa más de la mezcla:
//
//   remuestreo  el motor se graba a sí mismo, lo transpone (PitchShift 4/5 y
//               5/4), lo filtra (Resonz) y lo vuelve a tocar desde un búfer
//               con cuatro secuencias de velocidad — la técnica de JITLib de
//               RecordBuf/PlayBuf redisparado con Pbind, sobre la sala misma.
//   espectro    FFT del motor en vivo: cada transacción congela el espectro
//               (PV_MagFreeze), baraja sus bandas (PV_BinScramble), lo estira
//               (PV_MagShift) y lo emborrona (PV_MagSmear).
//   caos        seis mapas caóticos (Lorenz, Hénon, Gumowski-Mira, Standard,
//               Latoocarfian, FBSine) cuyos parámetros empuja la cadena.
//   ruptura     digital: bytebeat cuya fórmula reescribe el hash de cada
//               transacción, FM con realimentación, decimación, reducción de
//               bits y tartamudeo de búfer.
//   masa        sub y aditiva: 64 parciales estirados en torno a 20-40 Hz,
//               cada uno con su propio respiro, y un cuerpo resonante.
//
// ── Cómo entra al resto ────────────────────────────────────────────────────
// Son CAPAS, no mundos aparte. Cada motor tiene su fader en la matriz, después
// de MOTOR (REMU, ESPEC, CAOS, RUPT, MASA — CC 58-62), y suena encima de la
// config que esté cargada, la que sea: Lawrence English con la masa debajo,
// Deep Listening con el espectro congelándolo. Subir el fader lo enciende;
// 20 s en cero lo apagan (un fundido, y se sueltan sus nodos y búferes).
// Pueden sonar los cinco a la vez. MOTOR es el maestro de los cinco.
//
// Las configs EXT1-EXT5 son complementos: sólo traen el fader de su motor, así
// que cargar una SUMA ese motor a lo que ya suena y no cambia nada más. Y como
// los motores leen las perillas de la config de base, cada combinación suena
// distinta: el motor toma su color de lo que tiene debajo.
//
// Cada transacción pasa por ~motorTx (desde ~handleTransaction), así que la
// cadena toca también estas capas. Y todas leen las perillas que ya existen
// — textureDepth, resonantBody, spectralShift, timeDilation, pitchShift,
// filterCutoff, noiseLevel, noiseFilt, harmonicRich, memoryFeed,
// delayFeedback, droneFade — cada motor a su manera, de modo que el LC2 sigue
// siendo el instrumento. Los mapeos están junto a cada SynthDef.
//
// ── Nivel ──────────────────────────────────────────────────────────────────
// Salida × masterVolume × masterAmp × MOTOR² × su fader² × trim. Las del
// maestro van en el mismo sitio y sin atajos: nada de lo que suena aquí puede
// escapar del master (ver la nota de los envíos a la sala en \opalPerc).
// Los trims se midieron en NRT para que, con todo en su valor por defecto,
// los cinco motores queden al MISMO nivel (-26 dBFS RMS con el fader MOTOR a
// 8, fuera de su rango); ~motCeiling pone después el nivel absoluto, que se
// fijó de oído en el motor completo.
//
// Remuestreo y espectro PROCESAN el motor, así que su entrada pasa por un
// control automático de ganancia: bajar DRONE o PERC no los deja sin materia,
// y MASTER VOL no se aplica dos veces (una a la fuente y otra a la salida).

(
// ─── Utilidades de construcción (se llaman DENTRO de las SynthDefs) ──────
// Un bus de control por nombre, o su valor por defecto si no existe.
~motIn = { |name, default|
    var i = ~sbi.(name);
    if(i >= 0) { In.kr(i, 1) } { DC.kr(default) }
};

// Maestro: las tres ganancias que gobiernan cualquier otra capa.
//
// ~motCeiling: el nivel con MOTOR y el fader del motor los dos arriba (2 y 2).
// Primero se fijó de oído en lo que daba el MOTOR solo a 0.25 (de 2); después
// resultó demasiado presente y se bajó a la MITAD de eso (-6 dB).
//
// Y los faders son de AUDIO, no lineales: se elevan al cuadrado. Lineales,
// "casi nada" ya se oía mucho — 0.2 de 2 era sólo -20 dB, y encima de una
// config entera eso es presencia plena. Al cuadrado, 0.2 es -40 dB, la mitad
// del recorrido (1.0) -12 dB por fader, y el tope es exactamente el techo.
~motCeiling = 0.25 * 0.5;
~motTaper = { |x| (x * 0.5).clip(0, 1).squared };

// Qué fader gobierna a cada motor. Por defecto en 0: ningún motor suena hasta
// que alguien lo sube.
~motFaders = (
    remuestreo: \mixRemuestreo, espectro: \mixEspectro, caos: \mixCaos,
    ruptura: \mixRuptura, masa: \mixMasa
);
// Los faders que encienden cada motor. El remuestreo responde a dos: REMU (su
// lecho) y SEQ (sus secuencias); con cualquiera arriba, corre.
~motWakers = (remuestreo: [\mixRemuestreo, \mixSeq]);

// ─── Fogata (Burial · Beachfires) ───────────────────────────────────────
// Tres capas sin fader propio, colgadas de controles que ya existían:
//   ARCO   el drone tectónico dentro de MASA, cuya forma es el arco de la
//          Marea (LARGA / MEDIA / CORTA) — ~tideBus.
//   CORO   la mitad alta de PULSO GAIN (1.0 → 2.0): coro fantasma de las
//          grabaciones del bosque. Todas las configs guardadas tienen ≤ 1.0.
//   CINTA  OPACIDAD desde 0.1: la mezcla entera en una cinta que pierde
//          tensión, y el tempo del beat con ella (~tapeDrift).
// El coro responde a una regla propia, no a "fader > 0".
~motFaders[\coro] = \pulseGain;
~motWakeIf = (coro: { ((~controlValues ? ())[\pulseGain] ? 1.0) > 1.001 });
~tideBus = ~tideBus ?? { Bus.control(s, 1).set(0.65) };
// Cuánto pesa el drone de Beachfires dentro de masa (textura; el arco en sí
// lo hace la Marea sobre masa entera, después de la saturación).
~arcoGain = 0.8;
~coroAmt = { |pg| ((pg ? 1.0) - 1.0).clip(0, 1) };
~cintaAmt = { |op| (op ? 0).linlin(0.1, 0.7, 0, 1) };
~tapeDriftStream = Pbrown(0.85, 1.15, 0.01, inf).asStream;
~tapeDrift = 1.0;
~tapeAmt = 0.0;

// fader: el que gobierna esta salida si no es el del motor — las secuencias
// del remuestreo van con SEQ (\mixSeq), su lecho con REMU.
~motGain = { |key, fader|
    Lag.kr(~motIn.(\masterVolume, 0.3) * ~motIn.(\masterAmp, 0.7)
        * ~motTaper.(~motIn.(\mixMotor, 1.0))
        * ~motTaper.(~motIn.(fader ? ~motFaders[key], 0.0))
        * ~motCeiling, 0.1) * ~motTrim[key]
};

// El motor tal como suena hasta aquí, en estéreo, con ganancia automática.
// PanAz(4) numera 0 adelante-izq, 1 adelante-der, 2 atrás-der, 3 atrás-izq.
//
// Lee de ~motTapBus, NO del bus 0. Dentro del grupo de motores los golpes y
// los otros motores se añaden a la cabeza y escriben en el bus 0 antes de que
// el remuestreo o el espectro lo lean, así que leyendo el 0 se grababan a sí
// mismos y unos a otros: un bucle que el control de ganancia empujaba, y el
// nivel del remuestreo saltaba 20 dB de una corrida a otra. \motTap copia el
// bus 0 justo ANTES del grupo — el motor principal, sin ningún motor.
~motTapBus = ~motTapBus ?? { Bus.audio(s, ~limiterChans ? 2) };
~motInput = {
    var ch = ~limiterChans ? 2;
    var x = In.ar(~motTapBus.index, ch);
    var st = case
        { ch >= 4 } { [x[0] + x[3], x[1] + x[2]] * 0.5 }
        { ch == 1 } { [x, x] }
        { x };
    var lvl = Amplitude.kr(Mix(st) * 0.5, 0.05, 2.0);
    st * Lag.kr((0.1 / lvl.max(0.0167)).clip(0, 6), 1.5)
};

// Ruptura: menos muestras y menos bits. El Latch SÓLO cuando de verdad baja la
// frecuencia de muestreo: un Impulse a la frecuencia del servidor da un pulso
// en cada muestra, el Latch no ve ningún flanco nuevo, retiene el primer valor
// para siempre y la señal entera se vuelve una constante que LeakDC borra. Así
// estuvieron mudos todos los golpes del remuestreo hasta que se vio.
~motCrush = { |sig, srate, bits|
    var down = Latch.ar(sig, Impulse.ar(srate.clip(500, 48000)));
    Select.ar(srate < (SampleRate.ir * 0.95), [sig, down]).round(2 ** (1 - bits))
};

// Salida estéreo → 2 ó 4 canales, con el envolvente del motor (gate).
// SPREAD mueve también a los motores: Balance2 sobre su par estéreo, igual
// que Pan2 mueve a las voces. Sin esto las cinco capas quedaban fijas en el
// centro y, con ellas arriba, SPREAD casi no cambiaba la mezcla.
~motSpread = { |st|
    var pos = Lag.kr(~motIn.(\spatialSpread, 0.0), 0.2).clip(-1, 1);
    Balance2.ar(st[0], st[1], pos)
};

~motOut = { |out, sig, gate, key, fadeIn = 3, fadeOut = 6|
    var env = EnvGen.kr(Env.asr(fadeIn, 1, fadeOut, [2, -3]), gate, doneAction: 2);
    var st = ~motSpread.(Sanitize.ar(LeakDC.ar(sig))) * env * ~motGain.(key);
    // Its stem (3_synthdefs.scd), summed into the mix by ~stemGroupB.
    Out.ar(~stemOut.(key), if((~limiterChans ? 2) >= 4) { [st[0], st[1], st[1], st[0]] } { st });
};
// Lo mismo sin gate, para voces cortas que se liberan solas.
~motSend = { |out, sig, key, fader, stem|
    var st = ~motSpread.(Sanitize.ar(sig)) * ~motGain.(key, fader);
    Out.ar(~stemOut.(stem ? key), if((~limiterChans ? 2) >= 4) { [st[0], st[1], st[1], st[0]] } { st });
};

// Trims medidos (ver cabecera). Un valor por motor. Medidos en NRT con los
// buses en su valor por defecto, 30 s con una transacción por segundo y, para
// los dos que procesan, una mezcla de prueba a -24.6 dBFS RMS. Sin trim
// salían a: remuestreo -50.1, espectro -41.5, caos -19.1, ruptura -24.4,
// masa -21.4 dBFS RMS — un abanico de 31 dB que el fader no habría podido
// cubrir. Con estos cinco números todos quedan en -26.
~motTrim = (
    remuestreo: 22.0, espectro: 6.0, caos: 0.44, ruptura: 0.83, masa: 0.75,
    coro: 0.6
);

// ═════════════════════════════════════════════════════════════════════════
// 1 · REMUESTREO
// ═════════════════════════════════════════════════════════════════════════
// El boceto de JITLib, sobre la sala en vez de sobre un micrófono:
//   ~ps   PitchShift del motor, 4/5 a la izquierda y 5/4 a la derecha
//   ~rec  RecordBuf en un búfer de 2-6 s (b), sobregrabando
//   ~play PlayBuf de b a 0.8
//   ~filt Resonz sobre ~play
//   ~recc RecordBuf de ~filt en un búfer de 1 s (c) — aquí lo abre cada
//         transacción, en vez de la tableta
//   ~plc…~plc4  cuatro lectores de c, cada uno con su secuencia
//
// Perillas:
//   textureDepth   dispersión de tono del PitchShift (0 → limpio, 0.3)
//   memoryFeed     cuánto de lo anterior sobrevive en b (preLevel 0.2-0.92)
//   spectralShift  centro del Resonz, 300-4500 Hz (el keyVal del boceto)
//   resonantBody   ancho del Resonz: más cuerpo, más estrecho (rq 0.2-0.02)
//   delayFeedback  cuánto de c sobrevive a cada grabación nueva
//   timeDilation   escala todos los tiempos de las secuencias y del ~recc
//   pitchShift     transpone todas las lecturas
SynthDef(\motRemRec, { |out = 0, gate = 1, bufA, bufC, bufM, t_rec = 1, bedAmp = 1|
    var in    = ~motInput.value;
    var disp  = ~motIn.(\textureDepth, 0.2).linlin(0, 0.6, 0.0, 0.3);
    var ps    = PitchShift.ar(in, 0.2, [4/5, 5/4], disp, 0.2);
    var pre   = ~motIn.(\memoryFeed, 0.3).linlin(0, 0.8, 0.2, 0.92);
    // Lo mismo que ~remShape hace con cada golpe, aquí de forma continua: los
    // otros cuatro faders EXT y las perillas llegan al lecho por sus buses.
    var ext   = { |name| (~motIn.(name, 0) * 0.5).clip(0, 1) };
    var espec = ext.(\mixEspectro), caos = ext.(\mixCaos);
    var rupt  = ext.(\mixRuptura),  masa = ext.(\mixMasa);
    var tex   = (~motIn.(\textureDepth, 0.2) / 0.6).clip(0, 1);
    var jit   = (~motIn.(\noiseLevel, 0.1) / 0.5).clip(0, 1);
    var hr    = ~motIn.(\harmonicRich, 1.0);
    var infl  = ~motIn.(\transactionInfluence, 0.3);
    var rate, play, cf, rq, filt, open, preC, bed, grains, grainAmt;
    RecordBuf.ar(ps, bufA, 0, 1, pre, loop: 1);
    // El bucle ya no da vueltas idénticas: su velocidad deriva (más con
    // transactionInfluence), CAOS la vuelve errática, MASA la baja hasta dos
    // octavas.
    rate = 0.8 * ~motIn.(\pitchShift, 0).midiratio
        * LFNoise1.kr(0.07 + (infl * 0.6)).range(1 - (0.12 * infl), 1 + (0.12 * infl))
        * (2 ** (masa * -2))
        * (LFNoise0.kr(3) * caos * 12).midiratio;
    play = PlayBuf.ar(2, bufA, rate * BufRateScale.kr(bufA), loop: 1) * 2;
    // El filtro que hacía sonar las campanadas: también deriva, y
    // harmonicRich le añade una segunda banda a un intervalo.
    cf   = ~motIn.(\spectralShift, 1000).explin(80, 2400, 300, 4500)
        * LFNoise1.kr(0.05 + (infl * 0.5)).exprange(0.6, 1.6);
    rq   = ~motIn.(\resonantBody, 0.4).linexp(0.1, 0.8, 0.2, 0.02);
    filt = Resonz.ar(play, (cf).min(SampleRate.ir * 0.45), rq, 16)
        + Resonz.ar(play, ((cf * hr.explin(0.1, 5, 1.0, 3.0)).clip(40, 16000)).min(SampleRate.ir * 0.45), rq,
            16 * hr.explin(0.1, 5, 0.0, 0.8));
    filt = filt.tanh;
    // La memoria entra siempre al mismo nivel. Sin esto, con spectralShift
    // abajo el Resonz ×16 caía donde la mezcla tiene más energía, el búfer se
    // llenaba de señal saturada y todo lo que lo lee — el lecho y los golpes —
    // subía 16 dB con sólo girar esa perilla. Lento (1 s), para que siga
    // habiendo respiración dentro de cada frase.
    filt = filt * Lag.kr((0.25 / Amplitude.kr(Mix(filt) * 0.5, 0.05, 1).max(0.01)).clip(0, 4), 1);
    // ~recc: la cadena escribe en la memoria corta. Cada transacción abre la
    // grabación un rato (más largo con timeDilation); si la cadena calla,
    // un respiro cada ~10 s evita que c quede congelado para siempre.
    open = Trig1.kr(t_rec + Dust.kr(0.1),
        ~motIn.(\timeDilation, 2.0).linlin(0.5, 6, 0.25, 1.5));
    preC = ~motIn.(\delayFeedback, 0.3).linlin(0, 0.95, 0, 0.9);
    RecordBuf.ar(filt, bufC, 0, 1, preC, open, loop: 1);
    // La misma memoria en mono, para los granos (GrainBuf sólo lee mono).
    RecordBuf.ar(Mix(filt) * 0.5, bufM, 0, 1, preC, open, loop: 1);
    // Lo que se oye de esta etapa: la lectura lenta y su filtro, con la
    // misma cadena de forma que los golpes — granos, paso bajo, ruptura.
    bed = (play * 0.15) + (filt * 0.4);
    grainAmt = max(tex, espec) * 0.8;
    grains = GrainBuf.ar(2, Impulse.ar(8 + (espec * 80) + (tex * 20)),
        ~motIn.(\noiseFilt, 0.5).linexp(0, 1, 0.25, 0.015), bufM, rate,
        LFNoise1.kr(0.3).range(0, 1), 2, LFNoise1.kr(5) * jit);
    bed = (bed * (1 - grainAmt)) + (grains * 2.5 * grainAmt);
    bed = LPF.ar(bed, (~motIn.(\filterCutoff, 0.6).linexp(0, 1, 500, 18000)).min(SampleRate.ir * 0.45));
    // spectralShift abajo pone el Resonz ×16 donde la mezcla tiene más
    // energía, y el lecho subía 16 dB con sólo girar esa perilla. 4:1 sobre
    // 0.012, justo encima de su nivel normal: el filtro sigue cambiando el
    // color, no decide el volumen.
    bed = Compander.ar(bed, bed, 0.012, 1, 1/4, 0.01, 0.4);
    bed = ~motCrush.(bed, rupt.linexp(0, 1, 48000, 1500), rupt.linlin(0, 1, 24, 3));
    ~motOut.(out, bed * bedAmp, gate, \remuestreo);
}).add;

// Un golpe de ~plc. Era un PlayBuf desnudo con envolvente, y por eso sonaba
// igual con cualquier perilla: nada de su timbre estaba conectado a nada. Ahora
// cada golpe lleva su forma entera como argumentos, calculados por ~remShape
// en el momento de sonar a partir de las perillas y de los otros faders EXT:
//
//   rate, ratio2, mix2   altura, y una segunda voz a un intervalo
//   grain, gdens, gsize,
//   jit                  de lectura lisa a nube de granos
//   cf, rq, lpf          tono: filtro resonante y paso bajo
//   bits, srate          ruptura digital
//   echo, echoT          eco
//   atk, curve, dur      forma del golpe
SynthDef(\motRemPlay, { |out = 0, buf, bufM, rate = 1, amp = 1, dur = 1, pan = 0,
        atk = 0.005, curve = -4, ratio2 = 1.5, mix2 = 0,
        grain = 0, gdens = 20, gsize = 0.08, jit = 0.1,
        cf = 2000, rq = 0.7, lpf = 14000, bits = 24, srate = 48000,
        echo = 0, echoT = 0.125|
    var frames = BufFrames.kr(buf);
    var start  = Rand(0, frames);
    var env    = EnvGen.kr(Env.perc(atk, 1, 1, curve), timeScale: dur, doneAction: 2);
    var smooth = PlayBuf.ar(2, buf, rate * BufRateScale.kr(buf), startPos: start, loop: 1);
    var second = PlayBuf.ar(2, buf, rate * ratio2 * BufRateScale.kr(buf), startPos: start, loop: 1);
    var trig   = Impulse.ar(gdens * LFNoise1.kr(3).range(0.7, 1.3));
    var gpos   = ((start / frames) + (LFNoise1.ar(gdens) * jit)).wrap(0, 1);
    var grains = GrainBuf.ar(2, trig, gsize, bufM, rate, gpos, 2,
        TRand.ar(jit.neg, jit, trig).clip2(0.9));
    var sig = ((smooth + (second * mix2)) * (1 - grain)) + (grains * 2.5 * grain);
    // El pico de un RLPF gana 1/rq — hasta ×12 aquí —, así que el mismo golpe
    // salía 25 dB más fuerte o más débil según hubiera o no energía en el
    // búfer justo en cf. Compensado con √rq, y con un techo suave por golpe,
    // la resonancia sigue cambiando el COLOR sin decidir el volumen.
    sig = RLPF.ar(sig, (cf.clip(60, 16000)).min(SampleRate.ir * 0.45), rq.clip(0.05, 1.5)) * rq.clip(0.05, 1.5).sqrt;
    sig = LPF.ar(sig, (lpf.clip(200, 20000)).min(SampleRate.ir * 0.45));
    sig = (sig * 2).tanh * 0.5;
    sig = ~motCrush.(sig, srate, bits);
    sig = sig + (CombC.ar(sig, 1.0, echoT.clip(0.01, 1.0), echo * 4) * echo);
    sig = LeakDC.ar(sig) * env;
    // Fader SEQ y stem propio: las secuencias se suben y se miden aparte del lecho.
    ~motSend.(out, Balance2.ar(sig[0], sig[1], pan) * amp, \remuestreo, \mixSeq, \seq);
}).add;

// ═════════════════════════════════════════════════════════════════════════
// 2 · ESPECTRO
// ═════════════════════════════════════════════════════════════════════════
// Cada transacción congela el espectro de la sala durante timeDilation
// segundos; al soltarse, la siguiente toma otra foto. Con la cadena fluyendo
// es una sucesión de acordes hechos del propio motor.
//
//   textureDepth   cuánto se barajan las bandas (PV_BinScramble wipe 0-0.9)
//   noiseLevel     cuán lejos viaja cada banda al barajar (width 0.05-1)
//   harmonicRich   estira el espectro, 0.5-2x (PV_MagShift stretch)
//   pitchShift     lo desplaza, ±48 bandas
//   resonantBody   lo emborrona en frecuencia, 0-24 bandas (PV_MagSmear)
//   timeDilation   cuánto dura cada congelación
//   delayFeedback  cola: un eco largo de la imagen congelada
SynthDef(\motSpec, { |out = 0, gate = 1, t_freeze = 0, t_scr = 0|
    var in      = ~motInput.value;
    var frz     = Trig1.kr(t_freeze, ~motIn.(\timeDilation, 2.0));
    var wipe    = ~motIn.(\textureDepth, 0.2).linlin(0, 0.6, 0, 0.9);
    var width   = ~motIn.(\noiseLevel, 0.1).linlin(0, 0.5, 0.05, 1);
    var stretch = ~motIn.(\harmonicRich, 1.0).explin(0.1, 5, 0.5, 2.0);
    var shift   = ~motIn.(\pitchShift, 0).linlin(-24, 24, -48, 48);
    var smear   = ~motIn.(\resonantBody, 0.4).linlin(0.1, 0.8, 0, 24);
    var fb      = ~motIn.(\delayFeedback, 0.3).linlin(0, 0.95, 0.5, 9);
    var sig = in.collect { |ch|
        var c = FFT(LocalBuf(2048), ch, 0.25);
        c = PV_MagFreeze(c, frz);
        c = PV_BinScramble(c, wipe, width, t_scr);
        c = PV_MagShift(c, stretch, shift);
        c = PV_MagSmear(c, smear);
        IFFT(c)
    };
    sig = sig + (CombL.ar(sig, 0.8, [0.53, 0.71], fb) * 0.3);
    ~motOut.(out, sig, gate, \espectro, 4, 8);
}).add;

// ═════════════════════════════════════════════════════════════════════════
// 3 · CAOS
// ═════════════════════════════════════════════════════════════════════════
// Seis mapas caóticos, cada uno en su banda y con su propia respiración, por
// un filtro y un banco resonante afinado a la última transacción. La cadena
// no dispara notas aquí: MUEVE los parámetros de los mapas, y un mapa caótico
// responde a un empujón pequeño con un comportamiento distinto.
//
//   spectralShift  velocidad de iteración de los mapas (su registro)
//   textureDepth   profundidad del caos: cuánto se alejan de su régimen
//   noiseLevel     densidad: cuántos mapas suenan a la vez
//   filterCutoff   paso bajo, 300 Hz - 16 kHz
//   resonantBody   cuánto del banco resonante se oye
//   timeDilation   cuánto tardan los parámetros en volver tras un empujón
SynthDef(\motCaos, { |out = 0, gate = 1, lr = 28, ha = 1.3, gk = 1.2, fbk = 1.1,
        txf = 110, t_kick = 0|
    var rate  = ~motIn.(\spectralShift, 1000).explin(80, 2400, 900, 30000);
    var depth = ~motIn.(\textureDepth, 0.2).linlin(0, 0.6, 0.1, 1.0);
    var dens  = ~motIn.(\noiseLevel, 0.1).linlin(0, 0.5, 0.25, 1.0);
    var cut   = ~motIn.(\filterCutoff, 0.6).linexp(0, 1, 300, 16000);
    var body  = ~motIn.(\resonantBody, 0.4).linlin(0.1, 0.8, 0, 1);
    var back  = ~motIn.(\timeDilation, 2.0);
    var kick  = EnvGen.kr(Env.perc(0.01, back * 0.5, 1, -4), t_kick);
    var lag   = { |x| Lag.kr(x, 0.25) };
    var voices, gates, sig, rez;
    voices = [
        LorenzL.ar(rate, 10, lag.(lr), 2.667, 0.01 + (depth * 0.04)) * 0.05,
        HenonN.ar(rate * 0.25, lag.(ha).clip(1.0, 1.42), 0.3) * 0.6,
        GbmanN.ar(rate * 0.125) * 0.15,
        StandardN.ar(rate * 0.5, lag.(gk) * (1 + depth)) * 0.3,
        LatoocarfianC.ar(rate * 0.33, 1 + depth, 3, 0.5 + (depth * 0.5), 0.5) * 0.3,
        FBSineC.ar(rate * 0.2, 1 + (depth * 2), lag.(fbk), 1.1, 0.5) * 0.7
    ].collect { |v| LeakDC.ar(Sanitize.ar(v)).clip2(1) };
    // Cada mapa entra y sale por su cuenta; la densidad decide cuántos a la vez.
    gates = voices.collect { |v, i|
        (LFNoise1.kr(0.05 + (i * 0.031)).range(-0.6, 1) + (dens - 0.5)).clip(0, 1)
            .max(kick * 0.8)
    };
    sig = voices.collect { |v, i|
        Pan2.ar(v * gates[i], (i / 5 * 2 - 1) * 0.8)
    }.sum;
    sig = RLPF.ar(sig, (cut).min(SampleRate.ir * 0.45), 0.5);
    rez = Ringz.ar(sig * 0.05, (Lag.kr(txf, 0.05) * [1, 2.76, 5.4]).min(SampleRate.ir * 0.45), [1.2, 0.8, 0.5]).sum;
    sig = (sig + (rez * body)) * (1 + (kick * 1.5));
    ~motOut.(out, sig.tanh, gate, \caos);
}).add;

// ═════════════════════════════════════════════════════════════════════════
// 4 · RUPTURA
// ═════════════════════════════════════════════════════════════════════════
// Bytebeat: t * ((t>>a | t>>b) & m & t>>c), la fórmula clásica, con a, b, c y
// m reescritos por el hash de cada transacción — cada una es una pieza de
// ocho bits distinta. Encima FM con realimentación a la frecuencia de la
// transacción, y todo por decimación, reducción de bits y un tartamudeo que
// la cadena dispara.
//
//   spectralShift  reloj del bytebeat, 2-16 kHz
//   filterCutoff   frecuencia de muestreo efectiva, 600 Hz - 24 kHz
//   noiseFilt      bits, 2-12
//   textureDepth   realimentación de la FM (limpia → ruido)
//   timeDilation   duración de cada tartamudeo
SynthDef(\motRup, { |out = 0, gate = 1, a = 12, b = 8, c = 4, m = 63, txf = 220,
        t_st = 0, stLen = 0.125|
    var clock = ~motIn.(\spectralShift, 1000).explin(80, 2400, 2000, 16000);
    var srate = ~motIn.(\filterCutoff, 0.6).linexp(0, 1, 600, 24000);
    var bits  = ~motIn.(\noiseFilt, 0.5).linlin(0, 1, 2, 12);
    var fbAmt = ~motIn.(\textureDepth, 0.2).linlin(0, 0.6, 0.2, 2.2);
    var stDur = ~motIn.(\timeDilation, 2.0).linlin(0.5, 6, 0.15, 1.2);
    var t, x, bb, fm, sig, q, buf, wpos, held, len, rd, st;
    // t ≤ 65535 y la máscara ≤ 127: el producto cabe exacto en un float.
    t  = Phasor.ar(0, clock / SampleRate.ir, 0, 65536).floor;
    x  = t.rightShift(a).bitOr(t.rightShift(b)).bitAnd(m).bitAnd(t.rightShift(c));
    bb = ((t * x).bitAnd(255) / 127.5) - 1;
    fm = SinOscFB.ar(Lag.kr(txf, 0.02) * [1, 1.007], fbAmt);
    sig = [bb * 0.6 + (fm[0] * 0.35), (bb * 0.35) + (fm[1] * 0.6)];
    // Decimación y bits.
    sig = Latch.ar(sig, Impulse.ar(srate));
    q = 2 ** bits.neg;
    sig = sig.round(q);
    // Tartamudeo: un segundo circular; cada disparo repite los últimos stLen
    // segundos mientras dura stDur.
    buf  = LocalBuf(48000, 2);
    wpos = Phasor.ar(0, 1, 0, 48000);
    BufWr.ar(sig, buf, wpos);
    held = Latch.ar(wpos, T2A.ar(t_st));
    len  = (Lag.kr(stLen, 0) * SampleRate.ir).clip(64, 24000);
    rd   = BufRd.ar(2, buf,
        (held - len + Phasor.ar(T2A.ar(t_st), 1, 0, len)).wrap(0, 48000), 1, 1);
    st   = Lag.kr(Trig1.kr(t_st, stDur), 0.004);
    sig  = (sig * (1 - st)) + (rd * st);
    ~motOut.(out, LPF.ar(sig, (16000).min(SampleRate.ir * 0.45)) * 0.8, gate, \ruptura, 1, 4);
}).add;

// ═════════════════════════════════════════════════════════════════════════
// 5 · MASA
// ═════════════════════════════════════════════════════════════════════════
// Una fundamental de 20-40 Hz y 32 parciales estirados sobre ella, cada uno
// en par desafinado (el batido) y con su propio respiro de un minuto. Un
// cuerpo modal debajo, excitado por ruido marrón. La cadena mueve la
// fundamental despacio y cada transacción hace florecer los parciales altos.
//
//   harmonicRich   estiramiento: parciales i^0.85 (comprimido) a i^1.25
//   textureDepth   batido entre pares, 0.1-3 Hz
//   filterCutoff   inclinación: cuánto pesan los parciales altos
//   pitchShift     transpone la masa entera
//   droneFade      cuánto tarda la fundamental en llegar a una nota nueva
//   timeDilation   cuánto dura la floración y cuánto resuena el cuerpo
SynthDef(\motMasa, { |out = 0, gate = 1, f0 = 30, t_bloom = 0|
    var fade    = ~motIn.(\droneFade, 2.0) * 3;
    var fund    = Lag.kr(f0, fade) * ~motIn.(\pitchShift, 0).midiratio;
    var stretch = ~motIn.(\harmonicRich, 1.0).explin(0.1, 5, 0.85, 1.25);
    var beat    = ~motIn.(\textureDepth, 0.2).linlin(0, 0.6, 0.1, 3.0);
    var tilt    = ~motIn.(\filterCutoff, 0.6).linlin(0, 1, -1.8, -0.5);
    var tStr    = ~motIn.(\timeDilation, 2.0);
    var bloom   = EnvGen.kr(Env.perc(tStr, tStr * 4, 1, -2), t_bloom);
    var parts, sub, body, sig, tide, deep;
    parts = 32.collect { |i|
        var n = i + 1;
        var f = (fund * (n ** stretch)).clip(18, 12000);
        var a = (n ** tilt) * (LFNoise1.kr(Rand(0.008, 0.06)).range(0, 1) ** 2)
            * (1 + (bloom * (n / 32) * 4));
        var pair = SinOsc.ar([f, f + (beat * Rand(0.3, 1.0))], Rand(0, 2pi)) * a;
        Pan2.ar(pair.sum * 0.5, Rand(-0.7, 0.7))
    }.sum;
    sub  = SinOsc.ar(fund * [0.5, 0.502]) * 0.6;
    sub  = sub + (RLPF.ar(Saw.ar(fund * [1, 1.003]), (fund * 4).min(SampleRate.ir * 0.45), 0.3) * 0.25);
    body = DynKlank.ar(`[[1, 2.01, 3.03, 4.98, 7.1], nil, [4, 3, 2.5, 2, 1.5] * tStr],
        BrownNoise.ar([0.002, 0.002]), fund);
    // ── ARCO: el drone de Beachfires, con la forma de la Marea ─────────
    // Cluster de sierras desafinadas (35 / 35.5 / 70 / 71.2 respecto de
    // 35) + su sub, rumor de ruido marrón, saturación de cinta, y un MoogFF
    // cuyo corte y nivel siguen el arco de la Marea: el sonido sale del
    // fondo en la cresta y se sumerge en el valle. Con LARGA el arco dura
    // minutos; con CORTA es una respiración. Plana: un nivel medio fijo.
    tide = Lag.kr(In.kr(~tideBus.index, 1), 2.0);
    deep = Mix(Saw.ar(fund * [1, 1.0143, 2, 2.0343]) * [0.4, 0.4, 0.2, 0.2])
        + Mix(SinOsc.ar(fund * 0.5 * [1, 1.0143]) * 0.6)
        + BrownNoise.ar(0.1);
    deep = MoogFF.ar((deep * 1.5).tanh,
        ((tide.linexp(0, 1, 50, 400) * (fund / 35).clip(0.5, 3)
            * LFNoise2.kr(0.05).exprange(0.8, 1.25)).clip(30, 4000)).min(SampleRate.ir * 0.45), 2.5);
    deep = deep * tide.linlin(0, 1, 0.12, 1.0);
    deep = [deep, DelayC.ar(deep, 0.02, 0.015)];
    sig  = HPF.ar(parts * 0.35 + sub + (body * 0.5) + (deep * ~arcoGain), 16);
    sig  = (sig * 1.2).tanh;
    // El arco actúa DESPUÉS de la saturación: antes, la tanh se comía la
    // diferencia y masa sonaba igual en la cresta que en el valle. Ahora la
    // Marea abre y cierra el paso bajo (300 Hz → 6 kHz) y el nivel (-9 dB en
    // el valle): masa entera sale del fondo y vuelve a hundirse.
    sig  = LPF.ar(sig, (tide.linexp(0, 1, 300, 6000)).min(SampleRate.ir * 0.45)) * tide.linlin(0, 1, 0.35, 1.0);
    ~motOut.(out, sig, gate, \masa, 8, 12);
}).add;

s.sync;

// ═════════════════════════════════════════════════════════════════════════
// CORO — el bosque como coro fantasma (mitad alta de PULSO GAIN)
// ═════════════════════════════════════════════════════════════════════════
// Una frase: Warp1 sobre una grabación real del bosque, con el puntero
// arrastrándose ~100 s a lo largo del clip, la altura bajada (0.5-0.7 ×
// pitchShift) sin cambiar la velocidad, ventanas grandes y superpuestas
// (8) con un poco de azar: la textura de coro de Beachfires, hecha de
// insectos y aves. Wow y arrastre de cinta en la altura; oscura (LPF 2500,
// +3 dB a 400 Hz) y mandada fuerte a la sala, la catedral.
//
// Sale por el stem del CORPUS: pasa por \chainProcessor (CADENA y la Cámara
// le afectan) y se mide en la tira CORPUS. Su nivel: la mitad alta de PULSO
// GAIN, en ley de audio, por MASTER y por el fader CORPUS.
SynthDef(\motCoro, { |buf, atk = 2, sus = 2, rel = 4, ratio = 0.6, amp = 1|
    var env  = EnvGen.kr(Env.linen(atk, sus, rel, 1, \sine), doneAction: 2);
    var wow  = LFNoise2.kr(0.3).range(0.97, 1.02);
    var drag = (1 - (Decay2.kr(Dust.kr(0.08), 0.6, 3.0) * 0.35)).clip(0.5, 1);
    var ptr  = LFSaw.kr(Rand(0.008, 0.012), Rand(0, 2)).range(0.1, 0.9);
    var sig  = Warp1.ar(1, buf, ptr,
        ratio * wow * drag * ~motIn.(\pitchShift, 0).midiratio,
        0.2, -1, 8, 0.15, 4);
    var lvl  = Lag.kr(~motIn.(\masterVolume, 0.3) * ~motIn.(\masterAmp, 0.7)
        * (~motIn.(\pulseGain, 1.0) - 1).clip(0, 1).squared
        * ~motIn.(\mixCorpus, 1.0), 0.2) * ~motTrim[\coro];
    var st;
    sig = BPeakEQ.ar(LPF.ar(sig, 2500), 400, 1, 3);
    st  = ~motSpread.([sig, DelayC.ar(sig, 0.03, LFNoise1.kr(0.2).range(0.011, 0.021))])
        * env * lvl * amp;
    Out.ar(~stemOut.(\corpus), if((~limiterChans ? 2) >= 4) { [st[0], st[1], st[1], st[0]] } { st });
    Out.ar(~chamberAuxBus.index, Mix(st) * 0.6);
}).add;

// ═════════════════════════════════════════════════════════════════════════
// CINTA — la mezcla entera en una cinta que pierde tensión (OPACIDAD ≥ 0.1)
// ═════════════════════════════════════════════════════════════════════════
// Un inserto sobre el bus 0, después de todas las capas y los motores y antes
// de la sala. DelayC con tiempo modulado: wow (0.3 Hz), flutter (6-9 Hz,
// leve) y arrastre (de vez en cuando la cinta se frena y se recupera); un
// poco de saturación; el paso bajo cerrándose despacio; crackle, polvo y
// soplido de cinta; y cortes. En 0 la salida es la mezcla seca, sin retardo:
// el paso de seco a cinta ocurre en el primer décimo de la cantidad.
SynthDef(\cinta, {
    var chans = ~limiterChans ? 2;
    var amt  = Lag.kr(~motIn.(\opacityFloor, 0.0).linlin(0.1, 0.7, 0, 1), 0.3);
    var dry  = In.ar(0, chans);
    var wow  = LFNoise2.kr(0.3) * 0.004;
    var flut = SinOsc.kr(LFNoise1.kr(0.2).range(6, 9)) * 0.0004;
    var drag = Decay2.kr(Dust.kr(0.1), 1.0, 4.0) * 0.02;
    var wet  = DelayC.ar(dry, 0.15, (0.03 + ((wow + flut + drag) * amt)).clip(0.005, 0.12));
    var crack, drop;
    wet  = (wet * 1.2).tanh * 0.85;
    wet  = LPF.ar(wet, (amt.linexp(0, 1, 18000, 3500)).min(SampleRate.ir * 0.45));
    crack = Dust2.ar(LFNoise1.kr(0.5).range(2, 10)) + Crackle.ar(1.95, 0.1) + PinkNoise.ar(0.05);
    crack = LPF.ar(HPF.ar(crack, 800), 6000) * 0.012 * amt;
    drop = 1 - ((1 - LFNoise0.kr(0.2).range(0.2, 1.0)) * amt * 0.7);
    wet  = (wet * Lag.kr(drop, 0.05)) + (crack ! chans);
    ReplaceOut.ar(0, XFade2.ar(dry, wet, amt.linlin(0, 0.1, -1, 1)));
}).add;

SynthDef(\motTap, { Out.ar(~motTapBus.index, In.ar(0, ~limiterChans ? 2)) }).add;
s.sync;

// ─── Dónde suenan ────────────────────────────────────────────────────────
// Después de todas las voces (el remuestreo y el espectro tienen que oírlas)
// y antes de la sala y el limitador, que están al final del árbol.
if(~motorGroup.notNil) { try { ~motorGroup.free } };
// Right after the stem sum (3_synthdefs.scd, ~stemGroupA): the voices now
// write to stems, and only once those are summed does bus 0 hold the mix that
// the tap copies for remuestreo and espectro. The old rule — before the room
// if ~chamberSynth.isPlaying — never held: isPlaying is false for any node
// without a NodeWatcher, so the group always fell back to "after the voices"
// and, with stems, would have sat before the sum and heard only the corpus.
~motorGroup = Group.after(~stemGroupA ? ~defaultGroup ? s.defaultGroup);
// La derivación, justo antes del grupo: oye todas las voces y ningún motor.
if(~motTapNode.notNil) { try { ~motTapNode.free } };
~motTapNode = Synth.before(~motorGroup, \motTap);
// Cada motor escribe en su stem; aquí, después del grupo, se suman a la mezcla
// y se miden. Antes de la sala y el limitador, como siempre.
if(~stemGroupB.notNil) { try { ~stemGroupB.free } };
~stemGroupB = Group.after(~motorGroup);
// La cinta, después de que todo se sumó y antes de la sala.
if(~cintaNode.notNil) { try { ~cintaNode.free } };
fork { s.sync; ~cintaNode = Synth.after(~stemGroupB, \cinta) };
if(~stems.notNil) {
    [\remuestreo, \espectro, \caos, \ruptura, \masa, \seq].do { |n|
        ~stemNodes[n] = Synth.tail(~stemGroupB, \stemSum,
            [\in, ~stems[n].index, \out, 0, \id, ~stemNames.indexOf(n)] ++ ~stemPanArgs.(n)
            ++ (~stemCarveArgs !? { ~stemCarveArgs.(n) } ? []));
    };
};

// ─── Los cinco, como encender / transacción ──────────────────────────────
// st es el estado de un motor encendido: nodos, rutinas y búferes que su
// apagado tiene que soltar.
// Lectura del lado del lenguaje: el valor que ~setParam dejó en
// ~controlValues. No le pregunta al servidor (getSynchronous sólo funciona con
// un servidor local y bloquea), y es el mismo número que muestra la perilla.
~motVal = { |name, default| (~controlValues ? ())[name] ? default };
~motTempo = { (~motVal.(\timeDilation, 2.0) / 2.0).clip(0.25, 3) };
// Nivel de las cuatro secuencias del remuestreo frente a su propio lecho.
~remPlayAmp = 0.22;
~remRates = [1, 4/5, 5/4, 2];
~motBundle = { |f| s.makeBundle(s.latency, f) };

// ─── La forma de cada golpe del remuestreo ──────────────────────────────
// Se calcula cuando el golpe suena, así que cualquier perilla o fader que se
// mueva cambia el siguiente golpe — no hay que esperar a nada.
//
// Perillas del GUI:
//   pitchShift     transpone
//   harmonicRich   segunda voz: del unísono a una duodécima, y cuánta
//   textureDepth   de lectura lisa a granos, y ataque más blando
//   noiseFilt      tamaño del grano: 250 ms a 15 ms
//   noiseLevel     dispersión: posición y panorama de los granos, y swing
//   spectralShift  centro del filtro resonante, 250 Hz - 12 kHz
//   resonantBody   resonancia del filtro
//   filterCutoff   paso bajo, 500 Hz - 18 kHz
//   delayFeedback  eco
//   timeDilation   tempo y duración de cada golpe
//   transactionInfluence  cuánto varían las amplitudes y cuántos golpes callan
// Los otros motores, por su fader (con el suyo encendido o no):
//   ESPEC  más nube de granos, y más densa
//   CAOS   altura errática, hasta ±12 semitonos por golpe
//   RUPT   menos bits y menos muestras: el golpe se rompe
//   MASA   hasta dos octavas abajo, y golpes más largos
~remArgs = [\rate, \amp, \dur, \pan, \atk, \curve, \ratio2, \mix2, \grain, \gdens,
    \gsize, \jit, \cf, \rq, \lpf, \bits, \srate, \echo, \echoT];
~remShape = { |e|
    var k     = ~motVal;
    var ext   = { |name| (k.(name, 0) * 0.5).clip(0, 1) };
    var espec = ext.(\mixEspectro), caos = ext.(\mixCaos);
    var rupt  = ext.(\mixRuptura),  masa = ext.(\mixMasa);
    var tex   = (k.(\textureDepth, 0.2) / 0.6).clip(0, 1);
    var jit   = (k.(\noiseLevel, 0.1) / 0.5).clip(0, 1);
    var hr    = k.(\harmonicRich, 1.0).clip(0.1, 5);
    var infl  = k.(\transactionInfluence, 0.3);
    var tempo = ~motTempo.value;
    e[\rate] = (~remRates ? [1, 4/5, 5/4, 2]).wrapAt(e[\slot] ? 0) * (e[\mult] ? 1)
        * k.(\pitchShift, 0).midiratio
        * (2 ** (masa * -2))
        * (rrand(-1.0, 1.0) * caos * 12).midiratio;
    e[\ratio2] = hr.explin(0.1, 5, 1.0, 3.0);
    e[\mix2]   = hr.explin(0.1, 5, 0.0, 0.8);
    e[\grain]  = max(tex, espec);
    e[\gdens]  = 8 + (espec * 80) + (tex * 20);
    e[\gsize]  = k.(\noiseFilt, 0.5).linexp(0, 1, 0.25, 0.015);
    e[\jit]    = jit;
    e[\cf]     = k.(\spectralShift, 1000).explin(80, 2400, 250, 12000);
    e[\rq]     = k.(\resonantBody, 0.4).linexp(0.1, 0.8, 1.0, 0.08);
    e[\lpf]    = k.(\filterCutoff, 0.6).linexp(0, 1, 500, 18000);
    e[\bits]   = rupt.linlin(0, 1, 24, 3);
    e[\srate]  = rupt.linexp(0, 1, 48000, 1500);
    e[\echo]   = (k.(\delayFeedback, 0.3) / 0.95 * 0.7).clip(0, 0.7);
    e[\echoT]  = [1/16, 1/8, 3/16, 1/4].choose * tempo;
    e[\atk]    = tex.linexp(0, 1, 0.003, 0.25);
    e[\curve]  = -4 + (tex * 2.5);
    e[\dur]    = (e[\dur] ? 1) * tempo * (1 + (masa * 2));
    e[\delta]  = (e[\delta] ? 1) * tempo * (1 + (rrand(-0.25, 0.25) * jit));
    // Las secuencias tocan la memoria a ×4, ×8, hasta ×18: con spectralShift
    // alto casi todo cae por encima del paso bajo y se pierde; con
    // spectralShift bajo todo cae en lo audible y los golpes se vuelven
    // campanas plenas, 15 dB más de energía. Se compensa hasta -9 dB para que
    // la perilla cambie el carácter sin cambiar tanto la presencia.
    e[\amp]    = (e[\amp] ? 1) * ~remPlayAmp * (1 - rrand(0, infl * 0.7))
        * k.(\spectralShift, 1000).explin(80, 1000, 0.35, 1.0);
    e[\pan]    = ((e[\pan0] ? 0) + rrand(jit.neg, jit)).clip(-1, 1);
    // Con más influencia de la cadena, más huecos: la secuencia deja de ser
    // un reloj.
    if((infl * 0.3).coin) { e[\type] = \rest };
    e
};

~motores = (
    remuestreo: (
        start: { |st|
            var bufA = Buffer.alloc(s, (s.sampleRate * rrand(2, 6)).asInteger, 2);
            var bufC = Buffer.alloc(s, s.sampleRate.asInteger, 2);
            var bufM = Buffer.alloc(s, s.sampleRate.asInteger, 1);
            var slots = [0, 1, 2, 3], deltas = [2, 1, 1, 0.25], amps = [2, 1, 2, 3];
            // Los cuatro ~plc del boceto, con su estructura intacta: las mismas
            // secuencias de tiempo, amplitud y multiplicador. Lo único que cambia
            // es que la altura ya no es la lista fija [1, 4/5, 5/4, 2] sino
            // cuatro CASILLAS (~remRates) que la cadena va reescribiendo. Las
            // amplitudes van escaladas por ~remPlayAmp: juntas disparan ~13
            // golpes por segundo que se solapan.
            var seqs = [
                Pbind(\slot, Pseq(slots, inf), \mult, 1,
                      \delta, Pseq(deltas, inf) / 2, \amp, Pseq(amps, inf) * 0.5, \dur, 1),
                Pbind(\slot, Pn(Pshuf(slots, 4), inf), \mult, 4,
                      \delta, Pn(Pshuf(deltas, 4), inf) / 4,
                      \amp, Pn(Pshuf(amps, 4), inf) * 0.25, \dur, 0.5),
                Pbind(\slot, Pn(Pshuf(slots, 4), inf), \mult, Pdup(4, Pseq([8, 7, 9, 8], inf)),
                      \delta, Pn(Pshuf(deltas, 4), inf) / 8,
                      \amp, Pn(Pshuf(amps, 4), inf) * 0.12, \dur, 0.5),
                Pbind(\slot, Pn(Pshuf(slots, 8), inf), \mult, 0.5,
                      \delta, Pn(Pshuf(deltas, 4), inf) * 2,
                      \amp, Pn(Pshuf(amps, 4), inf) * 0.7, \dur, 2)
            ];
            ~remRates = [1, 4/5, 5/4, 2];
            st[\bufs] = [bufA, bufC, bufM];
            st[\bufC] = bufC;
            st[\bufM] = bufM;
            s.sync;
            st[\rec] = Synth(\motRemRec, [\bufA, bufA, \bufC, bufC, \bufM, bufM], ~motorGroup);
            st[\nodes] = [st[\rec]];
            st[\players] = seqs.collect { |p, i|
                (Pbind(\instrument, \motRemPlay, \group, ~motorGroup,
                    \buf, bufC, \bufM, bufM, \pan0, (i / 3 * 1.6) - 0.8) <> p)
                    .collect { |e| ~remShape.(e) }
                    .play(quant: 0)
            };
        },
        stop: { |st| st[\players].do(_.stop) },
        tx: { |st, ev|
            var infl = ~motVal.(\transactionInfluence, 0.3);
            ~motBundle.({ st[\rec].set(\t_rec, 1) });
            // La cadena reescribe la altura: con probabilidad
            // transactionInfluence una casilla toma la clase de altura de la
            // transacción (dentro de una octava, 1-2). La estructura del
            // boceto sigue; lo que canta cambia con lo que pasa en la cadena.
            if(infl.coin) {
                ~remRates[4.rand] = 2 ** ((ev[\note] % 12) / 12);
            };
            // Y la cadena toca la memoria: un golpe a la altura de la
            // transacción, con la misma forma que los de las secuencias.
            ~motBundle.({
                var e = ~remShape.((slot: 0, mult: (ev[\freq] / 110).clip(0.25, 4),
                    amp: ev[\accent] * 1.6, dur: 1.5, delta: 0, pan0: ev[\valLog] * 1.6 - 0.8));
                Synth(\motRemPlay, [\buf, st[\bufC], \bufM, st[\bufM]]
                    ++ ~remArgs.collect { |k| [k, e[k]] }.flatten,
                    ~motorGroup);
            });
        }
    ),

    espectro: (
        start: { |st|
            st[\syn] = Synth(\motSpec, nil, ~motorGroup);
            st[\nodes] = [st[\syn]];
        },
        tx: { |st, ev|
            // La barajada no cambia en cada transacción: sólo cuando la
            // cadena empuja más que su media (accent), si no sería un ruido
            // parejo y no una sucesión de imágenes.
            ~motBundle.({
                st[\syn].set(\t_freeze, 1);
                if(ev[\accent] > 1.05) { st[\syn].set(\t_scr, 1) };
            });
        }
    ),

    caos: (
        start: { |st|
            st[\syn] = Synth(\motCaos, nil, ~motorGroup);
            st[\nodes] = [st[\syn]];
        },
        tx: { |st, ev|
            var h = (ev[\hash] ? "").hash.abs;
            ~motBundle.({
                st[\syn].set(
                    // Lorenz r: 24 (casi periódico) a 90 (turbulencia plena)
                    \lr,  ev[\valLog].linlin(0, 1, 24, 90),
                    // Hénon a: alrededor de la frontera del caos (1.06-1.42)
                    \ha,  1.06 + ((h % 1000) / 1000 * 0.36),
                    \gk,  ev[\accent].linlin(0.85, 1.75, 0.6, 3.5),
                    \fbk, ((h >> 10) % 1000 / 1000).linlin(0, 1, 0.3, 1.9),
                    \txf, ev[\freq] * 2,
                    \t_kick, 1);
            });
        }
    ),

    ruptura: (
        start: { |st|
            st[\syn] = Synth(\motRup, nil, ~motorGroup);
            st[\nodes] = [st[\syn]];
        },
        tx: { |st, ev|
            var h = (ev[\hash] ? "").hash.abs;
            var infl = ~motVal.(\transactionInfluence, 0.3);
            ~motBundle.({
                // La fórmula cambia sólo con probabilidad transactionInfluence:
                // a 0 la pieza de ocho bits se queda, a 1 cada transacción es
                // una pieza nueva.
                if(infl.coin) {
                    st[\syn].set(\a, 4 + (h % 9), \b, 6 + ((h >> 4) % 9),
                        \c, 3 + ((h >> 8) % 6), \m, [15, 31, 63, 127].wrapAt(h >> 12));
                };
                st[\syn].set(\txf, ev[\freq] * [2, 4, 8].wrapAt(h >> 14),
                    \stLen, [1/32, 1/16, 1/8, 1/4].wrapAt(h >> 16) * ~motTempo.value,
                    \t_st, 1);
            });
        }
    ),

    coro: (
        // El secuenciador que respira: la espera entre frases vaga con
        // Pbrown entre 4 y 9 s (× timeDilation/2), y cada frase dura más de lo
        // que espera — atk 0.4, rel 0.8 de la espera —, así que se solapan.
        // Cada una lee su propio búfer: una grabación del día si la Cámara
        // admite alguna, si no una cualquiera del corpus.
        start: { |st|
            st[\nodes] = [];
            st[\loop] = Routine({
                var waits = Pbrown(4.0, 9.0, 0.5, inf).asStream;
                loop {
                    var wait = waits.next * ~motTempo.value;
                    var pool = if(~phenoSelect.notNil and: { ~phenoCursor.notNil }) {
                        try { ~phenoSelect.(~phenoCursor.floor.asInteger.clip(1, 365)) } { [] }
                    } { [] };
                    var clip = (pool.size > 0).if({ pool.choose }, { (~corpusClips ? []).choose });
                    if(clip.notNil and: { clip[\audible].notNil } and: { (st[\live] ? 0) < 3 }) {
                        Buffer.read(s, clip[\audible], action: { |b|
                            var syn;
                            st[\live] = (st[\live] ? 0) + 1;
                            syn = Synth(\motCoro, [\buf, b, \atk, wait * 0.4,
                                \sus, wait * 0.6, \rel, wait * 0.8,
                                \ratio, rrand(0.5, 0.7)],
                                // Con las voces, no con los motores: escribe en el
                                // stem del corpus, que se lee ANTES del procesador.
                                ~defaultGroup ? s.defaultGroup);
                            syn.onFree({ b.free; st[\live] = (st[\live] ? 1) - 1 });
                        });
                    };
                    wait.wait;
                };
            }).play(SystemClock);
        },
        stop: { |st| st[\loop].stop }
    ),

    masa: (
        start: { |st|
            st[\syn] = Synth(\motMasa, nil, ~motorGroup);
            st[\nodes] = [st[\syn]];
        },
        tx: { |st, ev|
            var infl = ~motVal.(\transactionInfluence, 0.3);
            ~motBundle.({
                // La fundamental se mueve poco: sólo con probabilidad
                // transactionInfluence/3, y siempre hacia 20-40 Hz. La masa es
                // un lugar, no una melodía.
                if((infl / 3).coin) {
                    var f = ev[\freq];
                    while({ f > 40 }, { f = f * 0.5 });
                    while({ f < 20 }, { f = f * 2 });
                    st[\syn].set(\f0, f);
                };
                st[\syn].set(\t_bloom, 1);
            });
        }
    )
);

// ─── Encender, apagar, transacción ───────────────────────────────────────
// ~motLive[key] es el estado del motor encendido (nodos, rutinas, búferes).
// Ningún motor se enciende a mano: el vigilante mira los faders cuatro veces
// por segundo, así que da igual si el fader lo movió el GUI, el navegador, un
// CC o una config — todos pasan por ~setParam y dejan su valor en
// ~controlValues.
~motLive = ~motLive ? ();
~motZeroSince = ();
~motOffAfter = 20;       // segundos en cero antes de apagar del todo

~motStart = { |key|
    var st = ();
    ~motLive[key] = st;
    ~motores[key][\start].(st);        // puede esperar al servidor: se llama en rutina
    ("Motor encendido: " ++ key).postln;
};

~motStop = { |key|
    var st = ~motLive[key];
    if(st.notNil) {
        var def = ~motores[key];
        if(def[\stop].notNil) { def[\stop].(st) };
        (st[\nodes] ? []).do { |n| try { n.set(\gate, 0) } };
        // Los búferes se sueltan cuando el fundido ya terminó.
        if(st[\bufs].notNil) {
            SystemClock.sched(16, { st[\bufs].do { |b| try { b.free } }; nil });
        };
        ~motLive[key] = nil;
        ("Motor apagado: " ++ key).postln;
    };
};

// Volver a evaluar este archivo no puede dejar dos vigilantes ni motores
// huérfanos sonando con SynthDefs viejas.
if(~motWatcher.notNil) { ~motWatcher.stop };
~motLive.keys.asArray.do { |k| ~motStop.(k) };

~motWatcher = Routine({
    loop {
        var now = Main.elapsedTime;
        var cv = ~controlValues ? ();
        // La Marea para el ARCO de masa, y la cinta para el tempo del beat.
        ~tideBus.set((~beatParams !? { ~beatParams.tideValue }) ? 0.65);
        ~tapeAmt = ~cintaAmt.(cv[\opacityFloor]);
        ~tapeDrift = 1 + ((~tapeDriftStream.next - 1) * ~tapeAmt);
        ~motFaders.keysValuesDo { |key, fader|
            var up = if(~motWakeIf[key].notNil) { ~motWakeIf[key].value } {
                (~motWakers[key] ? [fader]).any { |f| (cv[f] ? 0) > 0.0005 } };
            case
            { up and: { ~motLive[key].isNil } } {
                ~motZeroSince[key] = nil;
                // Un error al arrancar no puede matar al vigilante (los otros
                // cuatro dependen de él). El motor queda marcado como vivo
                // para no reintentarlo cuatro veces por segundo; bajar su
                // fader 20 s lo limpia y permite otro intento.
                try { ~motStart.(key) } { |e|
                    ("Motor " ++ key ++ " no arrancó: " ++ e.errorString).warn;
                };
            }
            { up } { ~motZeroSince[key] = nil }
            { ~motLive[key].notNil } {
                // En cero ya no se oye (la ganancia lo multiplica); el apagado
                // sólo libera CPU, y espera por si el fader vuelve a subir.
                if(~motZeroSince[key].isNil) { ~motZeroSince[key] = now };
                if((now - ~motZeroSince[key]) > ~motOffAfter) {
                    ~motZeroSince[key] = nil;
                    ~motStop.(key);
                };
            };
        };
        0.25.wait;
    }
}).play(SystemClock);

// Como mucho una transacción cada ~motTxGap segundos por motor. eth_sonify.py
// manda cada bloque como una ráfaga de hasta 20 notas por segundo (50 ms entre
// ellas); sin este límite el tartamudeo de ruptura no pararía nunca y el
// remuestreo apilaría veinte golpes en un segundo. Las demás capas siguen
// oyendo todas: esto sólo espacia lo que llega a cada motor.
~motTxGap = 0.25;
~motTxLast = ();

~motorTx = { |ev|
    var now = Main.elapsedTime;
    ~motLive.keysValuesDo { |key, st|
        var def = ~motores[key];
        if(def[\tx].notNil and: { st[\nodes].notNil }
            and: { (now - (~motTxLast[key] ? 0)) >= ~motTxGap }) {
            ~motTxLast[key] = now;
            try { def[\tx].(st, ev) } { |e| ("motor tx " ++ key ++ ": " ++ e.errorString).warn };
        };
    };
};

"Motores listos: % (faders REMU ESPEC CAOS RUPT MASA, CC 58-62).".format(
    ~motores.keys.asArray.sort.join(", ")).postln;
)
