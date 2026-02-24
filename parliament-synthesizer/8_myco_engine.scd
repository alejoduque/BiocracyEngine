/*
  Parliarment of All Things: Mycorrhizal Engine
  Integrates Deep Ecology & Biocracy into Sonification + nw_wrld Visuals
*/

(
~initMycoEngine = {
    "Inicializando Motor Micorrícico y Conexión OSC a nw_wrld...".postln;

    // Configizar dirección de puerto para nw_wrld (default port for external OSC)
    ~visualsDest = NetAddr("127.0.0.1", 3333); 
    
    // SynthDefs
    SynthDef(\co2_capture, { |out=0, amp=0.5, pan=0, sustain=2|
        var env, sig;
        env = EnvGen.kr(Env.perc(0.1, sustain), doneAction: 2);
        sig = BPF.ar(WhiteNoise.ar, XLine.kr(8000, 400, sustain), 0.5);
        sig = sig * env * amp;
        Out.ar(out, Pan2.ar(sig, pan));
    }).add;

    SynthDef(\myco_pulse, { |out=0, amp=0.3, pan=0, freq=40|
        var env, sig;
        env = EnvGen.kr(Env.perc(0.01, 0.3), doneAction: 2);
        sig = Saw.ar(freq) * LPF.ar(BrownNoise.ar, 1000);
        sig = RLPF.ar(sig, Line.kr(freq*10, freq, 0.3), 0.1);
        sig = sig * env * amp;
        Out.ar(out, Pan2.ar(sig, pan));
    }).add;

    SynthDef(\nutrient_fm, { |out=0, freq=440, mRatio=2, cRatio=1, index=1, iScale=5, amp=0.5, sustain=1|
        var env, iEnv, mod, indexMod, car;
        env = EnvGen.kr(Env.perc(0.01, sustain), doneAction: 2);
        iEnv = EnvGen.kr(Env.perc(0.01, sustain*0.5));
        indexMod = iEnv * iScale * index;
        mod = SinOsc.ar(freq * mRatio) * indexMod;
        car = SinOsc.ar((freq * cRatio) + (mod * freq));
        Out.ar(out, Pan2.ar(car * env * amp, 0));
    }).add;

    SynthDef(\nitrogen_bell, { |out=0, freq=200, amp=0.5|
        var env, sig;
        env = EnvGen.kr(Env.perc(0.05, 1.5), doneAction: 2);
        sig = SinOsc.ar(freq) * 0.5 + SinOsc.ar(freq * 1.5) * 0.3 + SinOsc.ar(freq * 2.5) * 0.2;
        Out.ar(out, Pan2.ar(sig * env * amp, 0));
    }).add;

    // Routine de Ciclo Biocrático
    ~biocracyRoutine = Routine({
        loop {
            // 1. Árbol captura CO2
            "-> Árbol: Captura CO2".postln;
            Synth(\co2_capture, [\amp, 0.6, \sustain, 3]);
            ~visualsDest.sendMsg('/eco/co2', 50);
            3.wait;

            // 2. Transmisión a red micorrícica
            "-> Hongo: Pulso Micorrícico Múltiple".postln;
            5.do { |i|
                Synth(\myco_pulse, [\freq, rrand(30, 80), \pan, rrand(-0.8, 0.8)]);
                ~visualsDest.sendMsg('/eco/mycoPulse', rrand(1.0, 3.0));
                0.15.wait;
            };
            1.wait;

            // 3. Intercambio Nutrientes (Nitrógeno)
            "-> Planta A: Recibe Fósforo".postln;
            Synth(\nutrient_fm, [\freq, 800, \sustain, 1.5]);
            ~visualsDest.sendMsg('/eco/phosphorus', 40);
            1.5.wait;

            // 4. Intercambio Nutrientes (Fósforo)
            "-> Planta B: Recibe Nitrógeno".postln;
            Synth(\nitrogen_bell, [\freq, 300, \amp, 0.7]);
            ~visualsDest.sendMsg('/eco/nitrogen', 60);
            2.wait;
            
            // Respiración del sistema
            2.wait;
        }
    });

    "Motor Biocrático Inicializado. Ejecuta ~biocracyRoutine.play; para iniciar el ecosistema.".postln;
};
)
