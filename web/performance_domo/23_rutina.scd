// 23_rutina.scd · La partitura de 30 minutos · Biocracia en escucha
// Requiere 22_voz_maquina.scd cargado antes (usa ~vozDecir, ~frase, ~numero, ~votos, ~consola).
//
// La rutina lleva el reloj y toda la pieza: cambia los módulos de la cúpula, dice las frases,
// pide al contador que cuente, ejecuta las acciones de la consola Y compone la base sonora:
// cada bloque funde el motor hacia una configuración de presets/ (sin saltos: cada valor viaja
// de donde está a donde va). MEZCLA queda en 1 toda la pieza. Termina en silencio a las 30:00.
//
// Hay dos momentos en que espera a la máquina (Claude in Chrome o el guion): la lectura del
// quórum (min 4) y la llave del bosque (min 26). Si nadie decide en ~esperaMax s, sigue con un
// valor por defecto y lo anota en el log.
//
//   desde el guion en vivo o el panel:  /rutina/iniciar   /rutina/pausa   /rutina/detener   /maq/modulo k
//   hacia las páginas (puente 3333 → todas las ventanas, incluida la cúpula):
//     /viz/slot k        cambia de módulo (la tecla del proyector)
//     /maq/accion a      acción de consola: iniciar · temporada:<t> · opacidad · seca · restaurar · consenso:<v> · votar
//     /rutina/estado t   texto de estado       /rutina/espera k   «lectura» · «bosque» · «» (nada)
//     /rutina/reloj s    segundos transcurridos
//
// Lo que elige el asistente de arranque (web/performance_domo/asistente.py) llega por el entorno:
//   PERF_ESCALA  1 = función (30:00) · 0.2 = ensayo rápido (6:00). Escala el reloj y los fundidos.
//   PERF_ESPERA  segundos que espera cada decisión antes de seguir con el valor por defecto (30).
//   PERF_REC     1 = graba la función: REC al empezar, se detiene al llegar al silencio de las 30:00.
(
var at = { |m, s = 0| m * 60 + s };
var env = { |k, def| var v = k.getenv; (v.isNil or: { v.isEmpty }).if({ def }, { v }) };

~pagina   = { |...msg| ~consola.sendMsg(*msg) };
~modulo   = { |k| ~pagina.('/viz/slot', k.asString); ("[rutina] módulo " ++ k).postln };
~accion   = { |a| ~pagina.('/maq/accion', a.asString); ("[rutina] acción " ++ a).postln };
~estado   = { |t| ~pagina.('/rutina/estado', t.asString); ("[rutina] " ++ t).postln };
~espera   = { |k| ~pagina.('/rutina/espera', k.asString) };
~durDe    = { |ids| ids.sum { |i| var b = ~vozBufs[~frase.(i)];
	b.notNil.if({ b.duration / ~vozPitch.max(0.5) + 0.15 }, { 0 }) } };
~dice     = { |ids| ~vozDecir.(ids.collect { |i| ~frase.(i) }); ~durDe.(ids) };   // devuelve la duración
~hasta    = { |cond, limite| var t = 0;
	while { cond.value.not and: { t < limite } } { 0.25.wait; t = t + 0.25 }; cond.value };
~contador = NetAddr("127.0.0.1", 57140);   // contar_linternas.py escucha aquí
~escala   = env.("PERF_ESCALA", "1").asFloat;   // 1 = tiempo real · 0.2 = ensayo rápido (6 min)
if (~escala <= 0) { ~escala = 1 };
~esperaMax = env.("PERF_ESPERA", "30").asFloat.max(1);
~grabar   = env.("PERF_REC", "0") == "1";
~lectura  = nil;
// Tiempo de la pieza, en segundos de partitura (30:00 = 1800, también en el ensayo)
~ahora    = { (~rutinaT0.notNil).if({ (Main.elapsedTime - ~rutinaT0 - ~pausado) / ~escala }, { 0 }) };
// Cuánto espera una decisión. En la función, lo que quepa sin empujar el evento siguiente
// (que empieza en `antes`): así la pieza termina a las 30:00. En el ensayo, la espera entera,
// para probar a quien decide; el reloj elástico del ensayo la absorbe.
~cabe     = { |antes, margen = 12| (~escala < 1).if({ ~esperaMax },
	{ ~esperaMax.min(antes - ~ahora.() - margen).max(2) }) };
// Esperas fijas (conteos, respiros): en el ensayo se acortan con la escala
~e        = { |s, minimo = 1| (s * ~escala).max(minimo) };

OSCdef(\maqLectura, { |m| ~lectura = [m[1].asInteger, (m[2] ? 0).asInteger];
	("[rutina] lectura de la máquina: " ++ ~lectura).postln }, '/maq/lectura');

// ═════════════════════════════════════════════════════════════════════════
// BASE SONORA · fundidos entre configuraciones
// ═════════════════════════════════════════════════════════════════════════
// ~loadConfig salta: pone los 73 valores de golpe. En una pieza de 30 minutos un salto así se
// oye como un corte, así que aquí cada valor viaja (en su escala normalizada, con una curva
// suave) desde donde está hasta donde lo pide la config. Los valores con paso (BANCADA, CRUDO,
// marea) cambian a mitad del fundido; también ahí cambian el kit de GOLPE, los paneos de los
// stems y los mandos de las muestras.
//
// No se funden nunca: el volumen de la sala (masterVolume, es del operador), el consenso (lo
// mueve el voto), el giro de la imagen, la opacidad (la mueve la acción «opacidad») ni el láser.
// Cada fundido es dueño de sus valores: si empieza otro que toca el mismo valor, el nuevo manda
// desde donde lo dejó el anterior. Se detienen con la pausa y la escala los acorta en el ensayo.
~noFundir = [\masterVolume, \vizConsensus, \vizRotation, \opacityFloor];
~fundidos = ~fundidos ? List.new;
~dueno    = IdentityDictionary.new;

// La mano manda: ~setParam llama a esto cuando la GUI o el MIDI tocan un valor, y el fundido
// lo suelta (ya no lo escribe). El fundido siguiente lo toma desde donde lo dejó la mano.
~soltarFundido = { |k| ~dueno.removeAt(k) };

~fijar = { |k, v| var ahora = ~controlValues[k];
	if (ahora.isNil or: { (ahora - v).abs > 1e-4 }) { ~setParam.(k, v, \preset) } };

~fundirParams = { |destino, segs = 30, alMedio|
	var yo = Object.new, lista = [], r;
	destino.keysValuesDo { |k, v|
		var key = k.asSymbol, def = ~paramDefsByName[key];
		if (def.notNil and: { ~noFundir.includes(key).not } and: { key.asString.beginsWith("laser").not }) {
			var sp = def[\spec];
			lista = lista.add([key, sp,
				sp.unmap(sp.constrain(~controlValues[key] ? def[\default])),
				sp.unmap(sp.constrain(v.asFloat))]);
			~dueno[key] = yo;
		};
	};
	segs = (segs * ~escala).max(0.05);
	r = Routine {
		var t = 0, paso = 0.25, medio = false;
		while { t < segs } {
			if (~enPausa != true) {
				var x = (t / segs).clip(0, 1);
				x = x * x * (3 - (2 * x));   // curva suave: entra y sale despacio
				if (medio.not and: { x >= 0.5 }) { medio = true; alMedio.value };
				lista.do { |e|
					if (~dueno[e[0]] === yo) {
						if (e[1].step > 0) { if (x >= 0.5) { ~fijar.(e[0], e[1].map(e[3])) } }
						{ ~fijar.(e[0], e[1].map(e[2].blend(e[3], x))) };
					};
				};
				t = t + paso;
			};
			paso.wait;
		};
		if (medio.not) { alMedio.value };
		lista.do { |e| if (~dueno[e[0]] === yo) { ~fijar.(e[0], e[1].map(e[3])); ~dueno.removeAt(e[0]) } };
		~fundidos.remove(r);
	};
	~fundidos.add(r);
	r.play(AppClock);   // AppClock: ~golpeLoad y los paneos tocan la GUI
	r
};

~cfgLeer = { |nombre| var path = ~presetDir +/+ nombre ++ ".json";
	if (File.exists(path)) { try { File.use(path, "r", { |f| f.readAllString }).parseJSON } { nil } } { nil } };

~fundirConfig = { |nombre, segs = 45, ajustes|
	var d = ~cfgLeer.(nombre), destino = ();
	if (d.isNil) { ("[base] no encuentro la config " ++ nombre).warn } {
		(d["params"] ?? ()).keysValuesDo { |k, v| destino[k.asSymbol] = v.asFloat };
		destino[\mixCarve] = 1.0;   // la cúpula: MEZCLA en 1 toda la pieza
		(ajustes ? ()).keysValuesDo { |k, v| destino[k.asSymbol] = v };
		("[base] → " ++ nombre ++ " · " ++ (segs * ~escala).round(0.1) ++ " s").postln;
		~fundirParams.(destino, segs, {
			if (d["golpe"].notNil and: { ~golpeLoad.notNil }) { ~golpeLoad.(d["golpe"]) };
			if (~stemPanSet.notNil) {
				(d["stems"] ?? ()).keysValuesDo { |k, v| var p = k.asString.split($_);
					if (p.size == 2) {
						if (p[1] == "pan")  { ~stemPanSet.(p[0].asSymbol, v.asFloat, nil) };
						if (p[1] == "auto") { ~stemPanSet.(p[0].asSymbol, nil, v.asFloat) };
					};
				};
			};
			(d["sample"] ?? ()).keysValuesDo { |k, v|
				if (~sampleBuses.notNil and: { ~sampleBuses[k.asSymbol].notNil }) { ~sampleBuses[k.asSymbol].set(v.asFloat) };
				if (~sampleControlValues.notNil) { ~sampleControlValues[k.asSymbol] = v.asFloat };
			};
			~pagina.('/preset/loaded', nombre);   // la lista de configs de la consola lo muestra
		});
	};
};

// Las capas de la mezcla (todas las mix*, salvo MEZCLA, que no es una capa)
~mezclas = { ~paramDefs.collect { |d| d[\name] }.select { |n|
	n.asString.beginsWith("mix") and: { n != \mixCarve } } };
// Solo el bosque: el corpus crudo y el ULTRA; todo lo demás calla
~soloBosque = { |segs = 40, nivel = 1.3| var d = ();
	~mezclas.().do { |n| d[n] = 0 };
	d[\mixCorpus] = nivel; d[\mixUltra] = 0.5; d[\corpusCrudo] = 1; d[\mixCarve] = 1;
	"[base] → solo bosque".postln;
	~fundirParams.(d, segs) };
// Silencio: todas las capas a 0 (el volumen de la sala no se toca)
~silencio = { |segs = 20| var d = (); ~mezclas.().do { |n| d[n] = 0 };
	"[base] → silencio".postln;
	~fundirParams.(d, segs) };
// Antesala: mientras la sala entra, un bosque bajo. Reemplaza lo que dejó el autosave.
~antesala = { var d = (); ~mezclas.().do { |n| d[n] = 0 };
	d[\mixCorpus] = 0.55; d[\corpusCrudo] = 1; d[\mixCarve] = 1;
	"[base] → antesala: el bosque bajo, mientras la sala entra".postln;
	~fundirParams.(d, 8 / ~escala) };   // 8 s siempre, también en el ensayo
~pararFundidos = { ~fundidos.copy.do(_.stop); ~fundidos.clear; ~dueno.clear };

// ═════════════════════════════════════════════════════════════════════════
// LA PARTITURA · [momento, acción]
// ═════════════════════════════════════════════════════════════════════════
~partitura = [
	// ── 1 · CONVOCAR (0–5) ─────────────────────────────────────────────
	[at.(0, 0),  { ~estado.("1 · convocar · solo bosque"); ~modulo.("f"); ~soloBosque.(40) }],
	[at.(2, 30), { ~accion.("iniciar"); ~accion.("temporada:segundas_lluvias"); ~modulo.("0");
		~fundirConfig.("02_Deep_Listening", 90) }],                       // Oliveros: la escucha convoca
	[at.(4, 0),  {
		~dice.([1, 2, 3, 4, 5, 6]).wait;
		~lectura = nil; ~espera.("lectura"); ~estado.("esperando a la máquina · lectura del quórum");
		if (~hasta.({ ~lectura.notNil }, ~cabe.(at.(5, 0))).not) { ~lectura = [1, 0]; "[rutina] lectura por defecto: hay voces".postln };
		~espera.("");
		if (~lectura[0] > 0) {
			~dice.([7]).wait;
			if (~lectura[1] > 0) { ~dice.([9]).wait; ~vozDecir.([~numero.(~lectura[1])]) };
		} { ~dice.([8]).wait };
	}],
	// ── 2 · ESCUCHAR (5–11) ────────────────────────────────────────────
	[at.(5, 0),  { ~estado.("2 · escuchar"); ~modulo.("p"); ~fundirConfig.("14_Phenology", 60) }],
	[at.(7, 0),  { ~modulo.("o"); ~fundirConfig.("03_Acustemologia", 60) }],   // Feld: madera y agua
	[at.(8, 0),  { ~dice.([80, 81, 82]) }],
	[at.(8, 40), { ~dice.([83, 84, 85]) }],
	[at.(9, 0),  { ~modulo.("2"); ~fundirConfig.("06_Low_Earth_Point", 60) }], // la máquina empieza a contar
	[at.(9, 40), { ~dice.([86, 87, 88]) }],
	// ── 3 · LA PROPUESTA (11–17) ───────────────────────────────────────
	[at.(11, 0), { ~estado.("3 · la propuesta"); ~modulo.("c"); ~fundirConfig.("FOGATA_3_Marea", 60) }],
	[at.(11, 30),{ ~dice.([10, 16, 17, 11, 18, 19]) }],
	[at.(13, 30),{ ~modulo.("a"); ~fundirConfig.("19_Antifonia", 60) }],      // el bosque responde
	[at.(15, 0), { ~dice.([12, 13, 14, 15]); ~fundirParams.((mixEspectro: 0.7), 30) }],   // el conflicto: ESPECTRO sube
	// ── 4 · DELIBERAR (17–24) ──────────────────────────────────────────
	[at.(17, 0), { ~estado.("4 · deliberar · simular antes de ejecutar"); ~modulo.("b");
		~fundirConfig.("16_Transito", 45) }],
	[at.(17, 10),{ ~accion.("opacidad"); ~dice.([20, 21]) }],                 // la opacidad trae la CINTA
	[at.(17, 50),{ ~dice.([22, 23]) }],
	[at.(19, 30),{ ~modulo.("6"); ~accion.("seca"); ~dice.([24]);
		~fundirConfig.("10_Dynamic_Optimality", 40, (mixCaos: 1.0, mixRuptura: 0.6)) }],   // la sequía simulada
	[at.(20, 10),{ ~dice.([25, 26]) }],
	[at.(21, 0), { ~accion.("restaurar"); ~dice.([27, 28]);
		~fundirParams.((mixCaos: 0, mixRuptura: 0), 30) }],
	[at.(22, 0), { ~modulo.("9"); ~fundirConfig.("13_Hashing", 45) }],          // la máquina ejecuta: el pico
	[at.(22, 20),{ ~dice.([29, 30, 31, 32]) }],
	[at.(23, 10),{ ~dice.([90, 91, 92, 93]); ~fundirConfig.("17_Estratos", 50) }],
	// ── 5 · ADJUDICAR O RETENER (24–30) ────────────────────────────────
	[at.(24, 0), {
		var f, c, tot, frac;
		~estado.("5 · adjudicar · votan los humanos"); ~modulo.("e");
		~fundirConfig.("FOGATA_2_Coro", 60);                                // sin bombo: el coro mientras votan las luces
		~votos = (favor: nil, contra: nil, bosque: nil);
		~dice.([40, 56, 57, 58]).wait;
		~dice.([41, 42, 47]).wait; ~e.(5).wait;
		~contador.sendMsg('/contar', "favor"); ~estado.("contando luces a favor");
		if (~hasta.({ ~votos.favor.notNil }, ~e.(12, 5)).not) { ~dice.([63]).wait };   // el contador mira 3 s
		~e.(5).wait;
		~dice.([46, 42]).wait; ~e.(5).wait;
		~contador.sendMsg('/contar', "contra"); ~estado.("contando luces en contra");
		if (~hasta.({ ~votos.contra.notNil }, ~e.(12, 5)).not) { ~dice.([63]).wait };
		~e.(5).wait;
		~dice.([48]).wait;
		~espera.("bosque"); ~estado.("esperando a la máquina · llave del bosque");
		if (~hasta.({ ~votos.bosque.notNil }, ~cabe.(at.(27, 30), 30)).not) {
			~votos.bosque = (~lectura ? [1, 0])[0].clip(0, 1);
			("[rutina] llave del bosque por defecto (según la lectura): " ++ ~votos.bosque).postln };
		~espera.("");
		if (~votos.bosque == 0) {
			~fundirConfig.("FOGATA_1_Brasas", 40);                          // queda abierta: brasas
			~dice.([61, 62, 52, 53]).wait } {
			f = ~votos.favor ? 0; c = ~votos.contra ? 0; tot = f + c;
			~dice.([60]).wait;
			if (tot == 0) { ~fundirConfig.("FOGATA_1_Brasas", 40); ~dice.([52, 53]).wait } {
				frac = (f / tot).round(0.01);
				~accion.("consenso:" ++ frac);
				~dice.([49]).wait; ~e.(2).wait;
				~accion.("votar"); ~e.(3).wait;
				// pasa: la ceremonia · no pasa: los estratos hondos
				~fundirConfig.(if(frac >= 0.5, "04_Parliament", "17_Estratos"), 40);
				~dice.(if(frac >= 0.5, { [50, 53] }, { [51, 53] })).wait;
				("[rutina] dos llaves: bosque presente · a favor " ++ f ++ "/" ++ tot ++ " = " ++ frac).postln;
			};
		};
	}],
	[at.(27, 30),{ ~modulo.("r"); ~fundirConfig.("18_Registro", 45) }],        // la máquina levanta el acta
	[at.(28, 0), { ~dice.([54, 55]) }],
	[at.(28, 30),{ ~dice.([89]); ~fundirConfig.("FOGATA_4_Ceniza", 45) }],
	[at.(29, 0), { ~dice.([70, 71]) }],
	[at.(29, 30),{ ~modulo.("f"); ~estado.("el bosque continúa"); ~soloBosque.(10) }],
	[at.(29, 40),{ ~silencio.(20) }],                                          // llega a 0 a las 30:00
	[at.(30, 0), { ~estado.("fin · 30:00") }]
];

~rutinaParar = {
	~rutinaR !? { ~rutinaR.stop }; ~relojR !? { ~relojR.stop }; ~rutinaR = nil; ~enPausa = false;
	~rutinaT0 = nil; ~pausado = 0;
	~pararFundidos.();
	if (~rutinaGraba == true) { ~rutinaGraba = false; { ~stopRecording !? { ~stopRecording.() } }.defer };
};
~rutinaIniciar = {
	~rutinaParar.(); ~enPausa = false; ~pausado = 0;
	~setParam.(\mixCarve, 1.0, \preset);
	if (~grabar) { ~rutinaGraba = true; { ~startRecording !? { ~startRecording.() } }.defer;
		"[rutina] grabando la función".postln };
	~rutinaT0 = Main.elapsedTime;
	~relojR = Routine { loop { ~pagina.('/rutina/reloj', ~ahora.().round(1)); 1.wait } }.play(SystemClock);
	~rutinaR = Routine {
		~partitura.do { |ev|
			var falta;
			while { ~enPausa } { 0.2.wait; ~pausado = ~pausado + 0.2 };
			falta = (ev[0] * ~escala) - (Main.elapsedTime - ~rutinaT0 - ~pausado);
			// En la función el reloj manda: un evento atrasado sale en seguida y la pieza
			// termina a las 30:00. En el ensayo las frases no se acortan, así que el reloj
			// se corre con ellas: cada momento se oye en su orden, sin amontonarse.
			if (falta < 0 and: { ~escala < 1 }) { ~pausado = ~pausado + falta.neg; falta = 0 };
			if (falta > 0) { falta.wait };
			while { ~enPausa } { 0.2.wait; ~pausado = ~pausado + 0.2 };
			ev[1].value;
		};
		~relojR !? { ~relojR.stop };
		~pagina.('/rutina/reloj', 30 * 60);
		if (~rutinaGraba == true) { 1.5.wait; ~rutinaGraba = false;
			{ ~stopRecording !? { ~stopRecording.() } }.defer; "[rutina] grabación detenida".postln };
	}.play(SystemClock);
	~estado.("rutina en marcha" ++ (~escala != 1).if(" · ensayo ×" ++ ~escala, ""));
};
OSCdef(\rutinaIniciar, { ~rutinaIniciar.() }, '/rutina/iniciar');
OSCdef(\rutinaPausa,   { ~enPausa = ~enPausa.not; ~estado.(~enPausa.if("en pausa", "sigue")) }, '/rutina/pausa');
OSCdef(\rutinaDetener, { ~rutinaParar.(); ~estado.("rutina detenida") }, '/rutina/detener');
// Cambio de módulo a mano, desde el guion en vivo: /maq/modulo "f"
OSCdef(\maqModulo, { |m| ~modulo.(m[1].asString) }, '/maq/modulo');

// La antesala entra cuando el arranque terminó de restaurar el autosave (que viene después
// de este archivo en start_sonification.scd), y solo si la rutina no empezó ya.
fork { 12.wait; if (~rutinaR.isNil) { ~antesala.() } };

("[rutina] partitura de 30 minutos cargada · con su base sonora · escala " ++ ~escala
	++ " · espera " ++ ~esperaMax ++ " s" ++ ~grabar.if(" · graba la función", "")
	++ " · espera /rutina/iniciar").postln;
)
