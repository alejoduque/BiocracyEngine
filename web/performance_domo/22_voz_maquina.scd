// La voz de la máquina y el voto de dos llaves · BiocracyEngine · Domo del Planetario
// Vive en web/performance_domo/. Carga voz/*.wav (generados con generar_voces.sh).
//   /voz/play n …       → dice las frases n (frases.tsv), en secuencia.
//   /voz/numero n       → dice un número (0–200).
//   /votos/favor n      → guarda y dice «Conté n luces.»   (desde contar_linternas.py)
//   /votos/contra n     → guarda y dice «Conté n luces.»
//   /bosque/presente b  → llave del bosque: 1 = se escuchó al menos una voz, 0 = silencio.
//   /votos/resolver     → dos llaves. Bosque en silencio → «queda abierta».
//                         Bosque presente → la consola lleva la fracción a favor a su fader de
//                         consenso; luego se pulsa Trigger Vote. (La rutina 23 hace esto sola.)
//   /votos/reiniciar    → borra votos y llave del bosque (para ensayar).
// Llega desde la consola (sendParliamentAction → puente → 57120) o desde contar_linternas.py.
(
// La carpeta voz/ junto a este archivo. Si ejecutas el bloque por partes, fija la ruta a mano.
~vozDir   = (thisProcess.nowExecutingPath !? { |p| p.dirname +/+ "voz" })
            ?? "~/code/BiocracyEngine/web/performance_domo/voz".standardizePath;
~consola  = ~visualsDest ?? NetAddr("127.0.0.1", 3333);   // mismo destino que usa el motor hacia la consola
~vozOut   = 0;      // bus de salida (0 = estéreo principal; cámbialo al bus del domo)
~vozAmp   = 0.25;   // ≈ −11 dB respecto de 0.9: la voz queda unos dB sobre la mezcla, no encima de ella
~vozPitch = 0.93;   // velocidad de lectura: 0.93 ≈ un semitono más grave y 7 % más lenta. 1.0 = tal cual
~vozSala  = 0.12;   // sala propia de la voz (FreeVerb, 0–1). La sala del motor ya no la toca
~votos    = (favor: nil, contra: nil, bosque: nil);

s.waitForBoot {
	~vozBufs = Dictionary.new;
	PathName(~vozDir).files.select { |f| f.extension == "wav" }.do { |f|
		~vozBufs[f.fileNameWithoutExtension.asSymbol] = Buffer.read(s, f.fullPath) };
	// El pitch baja por velocidad de lectura y no con PitchShift: sin granos ni
	// coro, que en la cúpula sonaban como más reverb. La sala es corta y propia;
	// la voz entra DESPUÉS de la sala del motor (ver ~vozDecir), así que la
	// \resonantChamber y la CINTA no la tocan. Sí pasa por el limitador.
	SynthDef(\vozMaquina, { |out = 0, buf, amp = 0.25, rate = 0.93, sala = 0.12|
		var sig = PlayBuf.ar(1, buf, BufRateScale.kr(buf) * rate);
		Line.kr(0, 0, BufDur.kr(buf) / rate + 0.8, doneAction: 2);   // deja sonar la cola de la sala
		sig = HPF.ar(sig, 110);
		sig = FreeVerb.ar(sig, sala, 0.28, 0.6);
		Out.ar(out, sig.dup * amp) }).add;
	s.sync;
	("[voz] " ++ ~vozBufs.size ++ " archivos cargados desde " ++ ~vozDir).postln;

	~vozDecir = { |nombres|
		Routine {
			nombres.do { |n|
				var b = ~vozBufs[n.asSymbol];
				if (b.notNil) {
					var args = [\out, ~vozOut, \buf, b, \amp, ~vozAmp, \rate, ~vozPitch.max(0.5), \sala, ~vozSala];
					// Después de la sala del motor y antes del limitador y la grabación.
					if (~chamberSynth.notNil) { Synth.after(~chamberSynth, \vozMaquina, args) }
						{ Synth(\vozMaquina, args) };
					(b.duration / ~vozPitch.max(0.5) + 0.15).wait;
				} { ("[voz] falta " ++ n).postln };
			};
		}.play(AppClock);
	};
	~frase  = { |id| ("v" ++ id.asInteger.asString.padLeft(2, "0")).asSymbol };
	~numero = { |n| ("n" ++ n.asInteger.clip(0, 200)).asSymbol };

	OSCdef(\vozPlay,   { |m| ~vozDecir.(m[1..].collect { |id| ~frase.(id) }) }, '/voz/play');
	OSCdef(\vozNumero, { |m| ~vozDecir.([~numero.(m[1])]) }, '/voz/numero');
	OSCdef(\votoFavor, { |m|
		~votos.favor = m[1].asInteger;
		~vozDecir.([~frase.(44), ~numero.(~votos.favor), ~frase.(45)]);
		("[votos] a favor: " ++ ~votos.favor).postln }, '/votos/favor');
	OSCdef(\votoContra, { |m|
		var tot;
		~votos.contra = m[1].asInteger;
		~vozDecir.([~frase.(44), ~numero.(~votos.contra), ~frase.(45)]);
		tot = (~votos.favor ? 0) + ~votos.contra;
		if (tot > 0) { ("[votos] fracción a favor: " ++ ((~votos.favor ? 0) / tot).round(0.01)).postln };
	}, '/votos/contra');
	OSCdef(\bosqueLlave, { |m| ~votos.bosque = m[1].asInteger;
		("[votos] llave del bosque: " ++ (~votos.bosque > 0).if("presente", "silencio")).postln }, '/bosque/presente');
	OSCdef(\votosResolver, { |m|
		var f = ~votos.favor ? 0, c = ~votos.contra ? 0, tot = f + c, frac;
		case
		{ ~votos.bosque.isNil } { "[votos] falta la llave del bosque".postln }
		{ ~votos.bosque == 0 }  { ~vozDecir.([~frase.(52), ~frase.(53)]);
			"[votos] dos llaves: el bosque calla → la propuesta queda abierta".postln }
		{ tot == 0 }            { "[votos] no hay luces contadas".postln }
		{ frac = (f / tot).round(0.01);
			~consola.sendMsg('/maq/accion', "consenso:" ++ frac);   // la consola mueve su fader de consenso
			~vozDecir.([~frase.(49)]);
			("[votos] dos llaves: bosque presente · a favor " ++ f ++ " / " ++ tot ++ " = " ++ frac
				++ (frac >= 0.5).if(" → pasará al pulsar Trigger Vote", " → no pasará")).postln };
	}, '/votos/resolver');
	OSCdef(\votosReiniciar, { ~votos = (favor: nil, contra: nil, bosque: nil); "[votos] reiniciados".postln }, '/votos/reiniciar');

	// Sin ventana propia: la voz la lleva la rutina (23_rutina.scd). A mano, desde el guion
	// en vivo o el panel de la consola (/voz/play n …).
};
)
