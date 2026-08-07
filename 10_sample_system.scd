// SuperCollider Ethereum Sonification - Sample Playback System
// Current Date and Time (UTC): 2025-09-01 08:30:00
// Current User's Login: alejoduque
// Purpose: Load and control MP3 samples with paulstretch-style time manipulation

(
s.doWhenBooted({
    
    // Sample file paths (relative to project directory)
    ~samplePaths = [
        "samples/aullidos.mp3",
        "samples/aveseinsectos.mp3", 
        "samples/bats_retimed.mp3",
        "samples/dreamlinerCosminreturn.mp3",
        "samples/oropendola.mp3",
        "samples/ranas.mp3",
        "samples/tapesample.mp3"
    ];
    
    // Sample names for GUI
    ~sampleNames = [
        "Aullidos", "Aves/Insectos", "Bats", "Dreamliner", 
        "Oropendola", "Ranas", "Tape"
    ];
    
    // Sample control parameters for paulstretch-style manipulation
    ~sampleParams = (
        // Playback controls
        sampleRate: 1.0,        // Playback speed (0.1 - 4.0)
        samplePitch: 0.0,       // Pitch shift in semitones (-24 to +24)
        sampleLoop: 0,          // Loop mode (0=off, 1=on)
        sampleAmp: 0.7,         // Sample volume (0-1)
        
        // Paulstretch-style time manipulation
        timeStretch: 1.0,       // Time stretch factor (0.25 - 8.0)
        grainSize: 0.2,         // Grain size for time stretch (0.05 - 1.0)
        overlap: 4,             // Grain overlap factor (2 - 16)
        
        // Effects processing
        sampleReverb: 0.3,      // Reverb amount (0-1)
        sampleDelay: 0.2,       // Delay amount (0-1)
        delayTime: 0.5,         // Delay time in seconds (0.1 - 2.0)
        delayFeedback: 0.3,     // Delay feedback (0-0.95)
        
        // Filtering
        lowPass: 8000,          // Low pass frequency (200-8000)
        highPass: 20,           // High pass frequency (20-2000)
        filterRes: 0.1,         // Filter resonance (0.1-0.8)
        
        // Spatial — key names MUST match SynthDef arg suffixes. The
        // samplePlayerMono/Stereo SynthDefs expect samplePanBus,
        // sampleSpatialXBus, sampleSpatialYBus. Since ~triggerSample
        // builds arg names as `paramName ++ "Bus"`, the keys here must
        // be samplePan, sampleSpatialX, sampleSpatialY (not spatialX /
        // spatialY — those produced wrong arg names and the SynthDef
        // ignored them, so the SMP node in the Spatial GUI had no
        // audible effect).
        samplePan: 0.0,         // Stereo pan (-1 to +1)
        sampleSpatialX: 0.0,    // Quad X position (-1 to +1)
        sampleSpatialY: 0.0     // Quad Y position (-1 to +1)
    );
    
    // Create control buses for sample parameters — alloc and set must be separate (SC 3.13: .set returns nil)
    ~sampleBuses = ();
    ~sampleParams.keysValuesDo { |param, val|
        ~sampleBuses[param] = Bus.control(s, 1);
        ~sampleBuses[param].set(val);
    };
    
    // Sample loading and buffer management
    ~sampleBuffers = Array.newClear(~samplePaths.size);
    ~loadedSamples = 0;
    
    // Load samples asynchronously
    ~loadSamples = {
        "Loading sample files...".postln;
        ~samplePaths.do { |path, i|
            var fullPath = thisProcess.nowExecutingPath.dirname +/+ path;
            "Loading sample %: %".format(i + 1, ~sampleNames[i]).postln;
            
            ~sampleBuffers[i] = Buffer.read(s, fullPath, action: { |buf|
                if(buf.notNil) {
                    ~loadedSamples = ~loadedSamples + 1;
                    "✓ Loaded %: % frames, % channels".format(
                        ~sampleNames[i], buf.numFrames, buf.numChannels
                    ).postln;
                    
                    if(~loadedSamples == ~samplePaths.size) {
                        "All samples loaded successfully!".postln;
                        ~createSampleSynths.value;
                        "Sample trigger functions are now available.".postln;
                    };
                } {
                    "✗ Failed to load %".format(path).error;
                };
            });
        };
    };
    
    // Shared SynthDef builder for sample playback (mono and stereo variants)
    // Using two SynthDefs avoids the "Buffer UGen channel mismatch" and halves memory per instance
    [1, 2].do { |numCh|
        var defName = if(numCh == 1, \samplePlayerMono, \samplePlayerStereo);

        SynthDef(defName, {
            arg buf=0, amp=0.7,
            rate=1, pitch=0, loop=0,
            // ── Envolvente ──────────────────────────────────────────────
            // Esta voz era la ÚNICA del motor sin envolvente: PlayBuf iba
            // directo a la salida por una ganancia estática, y quien la
            // terminaba era un `.free` programado desde sclang. Un .free es un
            // salto del valor instantáneo de la onda a cero — un clic de banda
            // ancha en CADA llamada— y además se llevaba por delante la cola
            // de reverb y el delay, que viven DENTRO de la voz: el sonido no
            // decaía, desaparecía junto con el espacio en el que sonaba.
            //
            // Ahora la envolvente es dueña de la vida del nodo (doneAction 2).
            // `hold` viene de la duración de la llamada, así que `dur` da forma
            // a un gesto en vez de guillotinar una forma de onda.
            atk=0.04, hold=1.2, rel=0.5,
            // Puerta de liberación: 1 mientras suena, 0 para soltar. Es lo que
            // permite que ~sampleTrimVoices desaloje la voz más vieja con un
            // fundido en lugar de un corte.
            gate=1,
            // Posición de arranque, 0-1 del búfer. Sin esto PlayBuf empezaba
            // siempre en el frame 0, de modo que una grabación de 51 s se oía
            // siempre por el mismo fragmento inicial.
            startPos=0,
            timeStretch=1.0, grainSize=0.2, overlap=4,
            reverbAmt=0.3, delayAmt=0.2, delayTime=0.5, delayFB=0.3,
            lpf=8000, hpf=20, filterRes=0.1,
            pan=0, spatialX=0, spatialY=0,
            sampleRateBus=(-1), samplePitchBus=(-1), timeStretchBus=(-1),
            grainSizeBus=(-1), sampleAmpBus=(-1), sampleReverbBus=(-1),
            sampleDelayBus=(-1), delayTimeBus=(-1), delayFeedbackBus=(-1),
            lowPassBus=(-1), highPassBus=(-1), filterResBus=(-1),
            samplePanBus=(-1), sampleSpatialXBus=(-1), sampleSpatialYBus=(-1),
            roomSizeBus=(-1), distanceEffectBus=(-1),
            // Matrix mixer: this layer's live level (0 = mute, 1 = unity).
            // Passed explicitly at the spawn site — ~triggerSample auto-wires
            // ~sampleBuses, which is a different collection from ~buses.
            mixSampleBus=(-1);

            var sig, grains, wet, stretchAmount, distance, distanceAmp, quadSig, env;

            var controlRate = Select.kr(sampleRateBus >= 0, [rate, In.kr(sampleRateBus, 1)]);
            var controlPitch = Select.kr(samplePitchBus >= 0, [pitch, In.kr(samplePitchBus, 1)]);
            var controlTimeStretch = Select.kr(timeStretchBus >= 0, [timeStretch, In.kr(timeStretchBus, 1)]);
            var controlGrainSize = Select.kr(grainSizeBus >= 0, [grainSize, In.kr(grainSizeBus, 1)]);
            var controlAmp = Select.kr(sampleAmpBus >= 0, [amp, In.kr(sampleAmpBus, 1)]);
            var controlReverb = Select.kr(sampleReverbBus >= 0, [reverbAmt, In.kr(sampleReverbBus, 1)]);
            var controlDelay = Select.kr(sampleDelayBus >= 0, [delayAmt, In.kr(sampleDelayBus, 1)]);
            var controlDelayTime = Select.kr(delayTimeBus >= 0, [delayTime, In.kr(delayTimeBus, 1)]);
            var controlDelayFB = Select.kr(delayFeedbackBus >= 0, [delayFB, In.kr(delayFeedbackBus, 1)]);
            var controlLPF = Select.kr(lowPassBus >= 0, [lpf, In.kr(lowPassBus, 1)]);
            var controlHPF = Select.kr(highPassBus >= 0, [hpf, In.kr(highPassBus, 1)]);
            var controlFilterRes = Select.kr(filterResBus >= 0, [filterRes, In.kr(filterResBus, 1)]);
            var controlPan = Select.kr(samplePanBus >= 0, [pan, In.kr(samplePanBus, 1)]);
            var sampleSpatialX = Select.kr(sampleSpatialXBus >= 0, [spatialX, In.kr(sampleSpatialXBus, 1)]);
            var sampleSpatialY = Select.kr(sampleSpatialYBus >= 0, [spatialY, In.kr(sampleSpatialYBus, 1)]);
            var roomSizeParam = Select.kr(roomSizeBus >= 0, [0.8, In.kr(roomSizeBus, 1)]);
            var distanceParam = Select.kr(distanceEffectBus >= 0, [0.5, In.kr(distanceEffectBus, 1)]);
            var finalRate = controlRate * controlTimeStretch.reciprocal * (controlPitch / 12).midiratio;

            // PlayBuf with correct channel count — no mismatch.
            //
            // doneAction 0, A PROPÓSITO: la envolvente termina el nodo. Antes
            // decía `doneAction: if(loop == 0, 2, 0)`, que compilaba SIEMPRE a
            // 0 sin avisar — `loop` es un control (OutputProxy) y `==` no es
            // perezoso en sclang, así que caía en la identidad de Object y
            // devolvía false en tiempo de construcción del grafo. Verificado.
            // Consecuencia: PlayBuf no se liberaba nunca, y por eso las
            // muestras disparadas desde los botones de la GUI —que no pasan
            // duración— quedaban como nodos vivos y mudos consumiendo CPU
            // hasta un STOP ALL.
            sig = PlayBuf.ar(numCh, buf, finalRate,
                startPos: startPos.clip(0, 0.999) * BufFrames.kr(buf),
                loop: loop, doneAction: 0);
            // Ensure stereo
            sig = if(numCh == 1, { [sig, sig] }, { sig });

            // Granular path (stereo output)
            grains = GrainBuf.ar(
                2,
                Dust.kr(overlap / controlGrainSize),
                controlGrainSize.clip(0.05, 1.0),
                buf, finalRate,
                LFNoise2.kr(0.1).range(0, 1),
                2, pan: controlPan
            );

            // Crossfade normal ↔ granular
            stretchAmount = (controlTimeStretch - 1).abs.clip(0, 1);
            sig = XFade2.ar(sig, grains, stretchAmount.linlin(0, 1, -1, 1));

            // Filtering
            sig = HPF.ar(sig, controlHPF.clip(20, 2000));
            sig = RLPF.ar(sig, controlLPF.clip(200, 8000), controlFilterRes.clip(0.1, 0.8));

            // Delay
            wet = DelayC.ar(sig, 2.0, controlDelayTime.clip(0.1, 2.0), controlDelayFB.clip(0, 0.95));
            sig = sig + (wet * controlDelay);

            // Reverb
            sig = FreeVerb2.ar(sig[0], sig[1], controlReverb, roomSizeParam.clip(0.1, 0.99), 0.3);

            // Distance attenuation
            distance = (sampleSpatialX.squared + sampleSpatialY.squared).sqrt;
            distanceAmp = 1 - (distance * distanceParam * 0.5);
            // ~trimSample places this layer in the gain budget defined in
            // 3_synthdefs.scd. Without it the samples were the one voice
            // outside the budget entirely: amp 0.7 against a drone reference
            // of 0.10, straight past a limiter calibrated for everything else.
            // Falls back to the same number if 10_ is loaded standalone —
            // keep the two in step (1.55 * 0.055), or a standalone load is
            // silently at a different level than the ecosystem it mirrors.
            // This drifted once already when ~trimMaster moved and only the
            // table was updated — hence the check that compares them.
            // La envolvente, con la misma forma de cuatro tramos que usa
            // \elektronBell (3_synthdefs.scd). Su doneAction es lo único que
            // libera el nodo, así que la cola de reverb alcanza a sonar.
            env = EnvGen.kr(
                Env.new(
                    [0, 1, 1, 0],
                    [atk.clip(0.005, 2.0), hold.clip(0.05, 600), rel.clip(0.02, 8.0)],
                    [\sine, 0, -3]
                ),
                gate,
                doneAction: 2
            );

            sig = sig * env * controlAmp.clip(0, 1) * distanceAmp.clip(0.1, 1)
                * (~trimSample ? 0.0853)
                * Lag.kr(Select.kr(mixSampleBus >= 0, [1.0, In.kr(mixSampleBus, 1)]), 0.08);

            // Panner chosen from the REAL output channel count, at graph-build
            // time — same fix as the five voices in 3_synthdefs.scd. PanAz(4)
            // on 2-channel hardware writes two of its four channels to buses
            // that do not exist, so half of every field recording was being
            // thrown away and the survivors moved in steps rather than
            // sweeping. On a genuine quad rig the 2-D angle is kept.
            quadSig = if((~limiterChans ? s.options.numOutputBusChannels) >= 4) {
                PanAz.ar(4, sig.sum, sampleSpatialX.atan2(sampleSpatialY) / pi, 1, 2, 0.5)
            } {
                // Stereo: keep the recording's own stereo image rather than
                // collapsing it with sig.sum, and place it with the X coord.
                Balance2.ar(sig[0], sig[1], sampleSpatialX.clip(-1, 1))
            };
            Out.ar(0, quadSig);
        }).add;
    };
    
    s.sync;
    
    // Sample management functions
    ~createSampleSynths = {
        "Sample SynthDefs created successfully.".postln;
        "Creating sample trigger functions...".postln;
        
        // Sample synth tracking for multiple simultaneous playback
        ~activeSampleSynths = [];
        
        // ── Per-event overrides ─────────────────────────────────────────────
        // Bus key -> the SynthDef arg it shadows. A bus wins whenever it is
        // connected (`Select.kr(xBus >= 0, [arg, In.kr(xBus)])`), and
        // ~triggerSample connects ALL of them — so before this table a
        // per-event argument could not have any effect at all. To honour one,
        // its bus is deliberately LEFT DISCONNECTED for that synth and the
        // literal is passed instead; every other parameter still follows the
        // GUI buses live. This is what lets a call event carry its own
        // frequency band and position (Antifonía) while the performer keeps
        // hold of everything else.
        ~sampleArgForBus = (
            sampleRate: \rate,          samplePitch: \pitch,
            timeStretch: \timeStretch,  grainSize: \grainSize,
            sampleAmp: \amp,            sampleReverb: \reverbAmt,
            sampleDelay: \delayAmt,     delayTime: \delayTime,
            delayFeedback: \delayFB,    lowPass: \lpf,
            highPass: \hpf,             filterRes: \filterRes,
            samplePan: \pan,            sampleSpatialX: \spatialX,
            sampleSpatialY: \spatialY
        );

        // Create sample trigger functions
        // `overrides` is an Event of BUS KEYS (e.g. (lowPass: 4000, samplePan: -0.3)).
        ~triggerSample = { |index, duration=nil, overrides=nil|
            var sampleName, synthArgs, newSynth, defName, buf, ov;
            var bufSecs, holdSecs, startFrac;
            ov = overrides ? ();
            if(index < ~sampleBuffers.size and: { ~sampleBuffers[index].notNil }) {
                buf = ~sampleBuffers[index];
                sampleName = ~sampleNames[index];
                // Pick the right SynthDef for the buffer's channel count
                defName = if(buf.numChannels <= 1, \samplePlayerMono, \samplePlayerStereo);
                // ── Duración → forma, no guillotina ─────────────────────
                // `duration` viene de Antifonía y es la vida del GLIFO visual
                // (0.5-2.7 s), no una medida del material: cinco de las siete
                // grabaciones duran entre 51 y 360 segundos. Usarla como punto
                // de corte hacía que una grabación de 51 s se oyera un 3 % de
                // sí misma y muriera de un tajo.
                //
                // Ahora abre una VENTANA dentro de la grabación: entra, se
                // sostiene ese tiempo y sale. Sin duración (los botones de la
                // GUI) se sostiene el búfer entero, que es lo que esos botones
                // siempre debieron hacer.
                bufSecs = buf.numFrames / s.sampleRate.max(1);
                // Minimum 5 s. The call duration is 0.5-2.7 s, which reads as a
                // blip against material this long and gives the layer nothing
                // to sustain — the samples announced themselves and vanished
                // instead of becoming part of the air.
                holdSecs = if(duration.notNil, { duration.max(5.0) }, { bufSecs });
                // El arranque varía por disparo, salvo que quepa entera: las
                // dos grabaciones cortas (ranas, oropéndola) se oyen completas,
                // las largas se abren por un sitio distinto cada vez.
                startFrac = if(holdSecs >= (bufSecs * 0.9), { 0 },
                    { rrand(0.0, (1 - ((holdSecs + 0.6) / bufSecs)).max(0.0)) });
                synthArgs = [
                    \buf, buf,
                    \loop, ((ov[\sampleLoop] ? 0).asInteger),
                    \startPos, startFrac,
                    // Long attack and a release longer than the hold: the point
                    // is for one call to still be fading while the next is
                    // rising, so the layer cross-fades with itself and with the
                    // engine instead of punctuating it. Short envelopes made
                    // each sample a separate event sitting on top of the mix.
                    \atk,  (holdSecs * 0.35).clip(0.15, 3.0),
                    \hold, (holdSecs * 0.70).clip(0.05, 600),
                    \rel,  (holdSecs * 1.10).clip(1.2, 12.0)
                ];

                // Connect all sample control buses if they exist
                if(~sampleBuses.notNil) {
                    ~sampleBuses.keysValuesDo { |paramName, bus|
                        var busParamName = (paramName.asString ++ "Bus").asSymbol;
                        var argName = ~sampleArgForBus[paramName];
                        if(argName.notNil and: { ov[paramName].notNil }) {
                            // overridden for this event only — bus left off
                            synthArgs = synthArgs ++ [argName, ov[paramName].asFloat];
                        } {
                            synthArgs = synthArgs ++ [busParamName, bus.index];
                        };
                    };
                } {
                    "Sample buses not initialized yet".warn;
                };

                // The matrix-mixer level for this layer lives in ~buses, not
                // ~sampleBuses, so the loop above does not reach it.
                if(~buses.notNil and: { ~buses[\mixSample].notNil }) {
                    synthArgs = synthArgs ++ [\mixSampleBus, ~buses[\mixSample].index];
                };

                "Triggering sample: % (%, % ch)".format(sampleName, defName, buf.numChannels).postln;
                // Onset de muestra hacia los visuales — slot 9 es el
                // instrumento de esta voz. Se manda el índice para que el
                // visual pueda distinguir aullador de avión.
                if(~visualsDest.notNil) {
                    ~visualsDest.sendMsg('/voice/sample',
                        (ov[\sampleAmp] ? 0.7).asFloat.clip(0, 1),
                        index.asFloat / 7);
                };
                newSynth = Synth(defName, synthArgs, ~defaultGroup);
                
                // Add to active synths list for tracking
                ~activeSampleSynths = ~activeSampleSynths.add(newSynth);
                
                // Auto-cleanup when synth ends (for non-looping samples)
                // Nada programa un .free aquí. La envolvente (doneAction 2)
                // termina el nodo, así que la cola de reverb suena hasta el
                // final y no hay clic. La lista viva se limpia con onFree, que
                // ahora SÍ se dispara — antes no lo hacía nunca, porque el
                // doneAction de PlayBuf compilaba a 0 en silencio.
                newSynth.onFree({
                    ~activeSampleSynths.remove(newSynth);
                });
                
                // Keep track for individual stopping (last triggered)
                ~currentSampleSynth = newSynth;
            } {
                "Sample index % not available".format(index).warn;
            };
        };
        
        // Stop current sample
        ~stopSample = {
            if(~currentSampleSynth.notNil) {
                ~currentSampleSynth.free;
                ~currentSampleSynth = nil;
                "Sample stopped".postln;
            } {
                "No sample currently playing".postln;
            };
        };
        
        // ── OSC surface for the sample system ───────────────────────────────
        // Until now these seven field recordings could ONLY be played by
        // clicking a button in the SC GUI (4_gui.scd:473) — there was no OSC
        // path, so the browser, MIDI and every module were unable to reach
        // them. Slot A (Antifonía) plays them from call events, so they need
        // an address.
        //
        // Registered HERE rather than in 6_osc_handlers.scd because that file
        // loads four files earlier, and a handler closing over a ~triggerSample
        // that does not exist yet is a nil waiting to happen. 6_osc_handlers
        // carries a pointer to this block so the canonical list still leads
        // here.
        //
        //   /sample/trigger idx [amp] [rate] [lowHz] [highHz] [pan] [durSec]
        //   /sample/param   name value            (native units, clipped)
        //   /sample/stop                          (last triggered)
        //   /sample/stopall                       (panic)
        //
        // lowHz/highHz are a CALL'S BAND, mapped onto the voice's own high-pass
        // and low-pass — a call that occupies 1800-4900 Hz opens the recording
        // in that window instead of playing it flat. Everything not supplied
        // keeps following the performer's GUI buses.

        // Concurrency cap. Field recordings are seconds long, so a dawn chorus
        // can stack them faster than they end; the pad layer taught this lesson
        // expensively. Oldest voice is freed rather than refusing the newest,
        // so the texture stays live instead of freezing at the cap.
        ~sampleMaxVoices = 12;
        ~sampleTrimVoices = {
            while({ (~activeSampleSynths ? []).size > ~sampleMaxVoices }, {
                var oldest = ~activeSampleSynths[0];
                ~activeSampleSynths.removeAt(0);
                // Soltar la puerta, no matar el nodo: el desalojo por tope se
                // oía como un clic igual que el corte por duración. Con
                // gate 0 la envolvente hace su release y el nodo se libera
                // solo al terminarlo.
                if(oldest.notNil) { try { oldest.set(\gate, 0) } };
            });
        };

        ~sampleParamSpecs = (
            sampleRate:     ControlSpec(0.1, 4.0),   samplePitch:  ControlSpec(-24, 24),
            timeStretch:    ControlSpec(0.25, 8.0),  grainSize:    ControlSpec(0.05, 1.0),
            sampleAmp:      ControlSpec(0, 1),       sampleReverb: ControlSpec(0, 1),
            sampleDelay:    ControlSpec(0, 1),       delayTime:    ControlSpec(0.1, 2.0),
            delayFeedback:  ControlSpec(0, 0.95),    lowPass:      ControlSpec(200, 8000),
            highPass:       ControlSpec(20, 2000),   filterRes:    ControlSpec(0.1, 0.8),
            samplePan:      ControlSpec(-1, 1),      sampleSpatialX: ControlSpec(-1, 1),
            sampleSpatialY: ControlSpec(-1, 1)
        );

        OSCdef(\sampleTrigger, { |msg|
            var idx = (msg[1] ? 0).asInteger;
            var ov = ();
            var dur = msg[7];
            if(~triggerSample.isNil) {
                "[sample] /sample/trigger before the sample system was ready".warn;
            } {
                // Positional and all-optional. nil means "leave this one on the
                // performer's bus", which is why each is tested rather than
                // defaulted — a default would silently seize the control.
                if(msg[2].notNil) { ov[\sampleAmp]  = msg[2].asFloat.clip(0, 1) };
                if(msg[3].notNil) { ov[\sampleRate] = msg[3].asFloat.clip(0.1, 4.0) };
                if(msg[4].notNil) { ov[\highPass]   = msg[4].asFloat.clip(20, 2000) };
                if(msg[5].notNil) { ov[\lowPass]    = msg[5].asFloat.clip(200, 8000) };
                if(msg[6].notNil) {
                    ov[\samplePan]      = msg[6].asFloat.clip(-1, 1);
                    ov[\sampleSpatialX] = msg[6].asFloat.clip(-1, 1);
                };
                ~triggerSample.(idx, if(dur.notNil, { dur.asFloat.clip(0.05, 30) }, nil), ov);
                ~sampleTrimVoices.value;
                ~sampleStats = ~sampleStats ? ();
                ~sampleStats[\fired] = (~sampleStats[\fired] ? 0) + 1;
                ~sampleStats[\lastIdx] = idx;
                ~sampleStats[\lastAt] = SystemClock.seconds;
            };
        }, '/sample/trigger');

        OSCdef(\sampleParam, { |msg|
            var name = (msg[1] ? \none).asSymbol;
            var spec = ~sampleParamSpecs[name];
            var bus = if(~sampleBuses.notNil) { ~sampleBuses[name] };
            if(bus.notNil and: { msg[2].notNil }) {
                var v = msg[2].asFloat;
                if(spec.notNil) { v = spec.constrain(v) };
                bus.set(v);
                if(~sampleParams.notNil) { ~sampleParams[name] = v };
            } {
                ("[sample] unknown /sample/param '" ++ name ++ "'").warn;
            };
        }, '/sample/param');

        OSCdef(\sampleStop, { if(~stopSample.notNil) { ~stopSample.value } }, '/sample/stop');
        OSCdef(\sampleStopAll, { if(~stopAllSamples.notNil) { ~stopAllSamples.value } }, '/sample/stopall');

        "Sample OSC ready: /sample/trigger · /sample/param · /sample/stop · /sample/stopall".postln;

        // Stop all samples (more aggressive)
        ~stopAllSamples = {
            "Stopping all active samples...".postln;
            
            // Free all tracked sample synths
            if(~activeSampleSynths.notNil) {
                ~activeSampleSynths.do({ |synth|
                    if(synth.notNil) {
                        synth.free;
                    };
                });
                // Counted BEFORE the list is emptied — this line reported 0
                // every time, which made "stop did nothing" and "stop freed
                // twelve voices" look identical in the log.
                ("Freed " ++ ~activeSampleSynths.size ++ " tracked sample synths").postln;
                ~activeSampleSynths = [];
            };
            
            // Also free current sample reference
            if(~currentSampleSynth.notNil) {
                ~currentSampleSynth.free;
                ~currentSampleSynth = nil;
            };
            
            // NO /g_freeAll here. Samples share ~defaultGroup with the drone,
            // the pads and the whole beat engine, so freeing the group emptied
            // the entire piece — every voice, not just the samples. That was
            // survivable while this was a GUI-only escape hatch; it is not now
            // that /sample/stopall is reachable from the browser, where it is
            // the obvious thing to call when the chorus gets too thick. The
            // tracked-synth loop above is the whole job: anything it does not
            // know about is not a sample.

            "All samples stopped".postln;
        };
        
        // Sample browser function
        ~listSamples = {
            "Available samples:".postln;
            ~sampleNames.do { |name, i|
                var frames = if(~sampleBuffers[i].notNil, ~sampleBuffers[i].numFrames, 0);
                var duration = if(frames > 0, frames / s.sampleRate, 0);
                "  %: % (%.1f seconds)".format(i, name, duration).postln;
            };
        };
        
        // Debug function
        ~checkSampleSystem = {
            "=== SAMPLE SYSTEM STATUS ===".postln;
            "~triggerSample function exists: %".format(~triggerSample.notNil).postln;
            "~stopSample function exists: %".format(~stopSample.notNil).postln;
            "~sampleBuses exists: %".format(~sampleBuses.notNil).postln;
            "Sample buffers loaded: %/%".format(~loadedSamples ? 0, ~samplePaths.size).postln;
            "Active sample synths: %".format(~activeSampleSynths.size).postln;
            "Current sample synth: %".format(~currentSampleSynth.notNil).postln;
            "==========================".postln;
        };
        
        // Show what's currently playing
        ~showActiveSamples = {
            "=== ACTIVE SAMPLES ===".postln;
            if(~activeSampleSynths.size > 0) {
                "Currently playing % samples:".format(~activeSampleSynths.size).postln;
                ~activeSampleSynths.do({ |synth, i|
                    "  Sample synth %: %".format(i + 1, synth).postln;
                });
            } {
                "No samples currently playing".postln;
            };
            "=====================".postln;
        };
    };
    
    // Start sample loading
    ~loadSamples.value;
    
    "Sample System initialized.".postln;
    "Use ~triggerSample.(index) to play samples (layered)".postln;
    "Use ~listSamples.value to see available samples".postln;
    "Use ~stopSample.value to stop last triggered sample".postln;
    "Use ~stopAllSamples.value to stop all playing samples".postln;
    "Use ~showActiveSamples.value to see what's playing".postln;
    "Use ~checkSampleSystem.value to debug sample status".postln;
});
)