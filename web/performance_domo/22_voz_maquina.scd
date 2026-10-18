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
~vozAmp   = 0.9;
~vozPitch = 1.0;    // 1.0 = voz tal cual; 0.92–0.96 la vuelve más grave y andrógina
~votos    = (favor: nil, contra: nil, bosque: nil);

s.waitForBoot {
	~vozBufs = Dictionary.new;
	PathName(~vozDir).files.select { |f| f.extension == "wav" }.do { |f|
		~vozBufs[f.fileNameWithoutExtension.asSymbol] = Buffer.read(s, f.fullPath) };
	SynthDef(\vozMaquina, { |out = 0, buf, amp = 0.9|
		var sig = PlayBuf.ar(1, buf, BufRateScale.kr(buf), doneAction: 2);
		Out.ar(out, sig.dup * amp) }).add;
	SynthDef(\vozMaquinaPS, { |out = 0, buf, amp = 0.9, pitch = 0.95|
		var sig = PlayBuf.ar(1, buf, BufRateScale.kr(buf));
		sig = PitchShift.ar(sig, 0.06, pitch, 0, 0.003);
		DetectSilence.ar(sig, 0.0005, 0.3, doneAction: 2);
		Out.ar(out, sig.dup * amp) }).add;
	s.sync;
	("[voz] " ++ ~vozBufs.size ++ " archivos cargados desde " ++ ~vozDir).postln;

	~vozDecir = { |nombres|
		Routine {
			nombres.do { |n|
				var b = ~vozBufs[n.asSymbol];
				if (b.notNil) {
					if (~vozPitch == 1.0) {
						Synth(\vozMaquina, [\out, ~vozOut, \buf, b, \amp, ~vozAmp]) } {
						Synth(\vozMaquinaPS, [\out, ~vozOut, \buf, b, \amp, ~vozAmp, \pitch, ~vozPitch]) };
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

	// Ventana: un botón por frase, por bloque. Tu respaldo si Chrome se demora.
	{
		var w = Window("Voz de la máquina", Rect(40, 40, 760, 520)).front;
		var bloques = [
			["Convocar",  [1,2,3,4,5,6,7,8]],
			["Propuesta", [10,11,12,13,14,15]],
			["Deliberar", [20,21,22,23,24,25,26,27,28,29,30,31,32]],
			["Adjudicar", [40,41,42,43,46,47,48,49,50,51,52,53,54,55]],
			["Bosque",    [60,61,62]],
			["Cierre",    [70,71]] ];
		w.view.decorator = FlowLayout(w.view.bounds, 8@8, 4@4);
		bloques.do { |b|
			StaticText(w, 740@18).string_(b[0]).stringColor_(Color.grey(0.6));
			b[1].do { |id| Button(w, 56@26).states_([[id.asString]]).action_({ ~vozDecir.([~frase.(id)]) }) };
			w.view.decorator.nextLine;
		};
		StaticText(w, 120@24).string_("Número (0–200):");
		NumberBox(w, 60@24).clipLo_(0).clipHi_(200).action_({ |nb| ~vozDecir.([~numero.(nb.value)]) });
	}.defer;
};
)
