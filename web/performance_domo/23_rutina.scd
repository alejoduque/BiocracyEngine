// 23_rutina.scd · La partitura de 30 minutos · Biocracia en escucha
// Requiere 22_voz_maquina.scd cargado antes (usa ~vozDecir, ~frase, ~numero, ~votos, ~consola).
//
// La rutina lleva el reloj. Cambia los módulos de la cúpula, dice las frases, pide al contador
// que cuente y ejecuta las acciones de la consola. Hay dos momentos en que espera a la máquina
// (Claude in Chrome): la lectura del quórum (min 4) y la llave del bosque (min 26). Si nadie
// decide en 30 s, sigue con un valor por defecto y lo anota en el log.
//
//   desde el guion en vivo o el panel:  /rutina/iniciar   /rutina/pausa   /rutina/detener   /maq/modulo k
//   hacia las páginas (puente 3333 → todas las ventanas, incluida la cúpula):
//     /viz/slot k        cambia de módulo (la tecla del proyector)
//     /maq/accion a      acción de consola: iniciar · temporada:<t> · opacidad · seca · restaurar · consenso:<v> · votar
//     /rutina/estado t   texto de estado       /rutina/espera k   «lectura» · «bosque» · «» (nada)
//     /rutina/reloj s    segundos transcurridos
(
var at = { |m, s = 0| m * 60 + s };

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
~escala   = ~escala ? 1;                    // 1 = tiempo real. Para un ensayo rápido: ~escala = 0.2 (6 min)
~lectura  = nil;

OSCdef(\maqLectura, { |m| ~lectura = [m[1].asInteger, (m[2] ? 0).asInteger];
	("[rutina] lectura de la máquina: " ++ ~lectura).postln }, '/maq/lectura');

~partitura = [
	// ── 1 · CONVOCAR (0–5) ─────────────────────────────────────────────
	[at.(0, 0),  { ~estado.("1 · convocar · solo bosque"); ~modulo.("f") }],
	[at.(2, 30), { ~accion.("iniciar"); ~accion.("temporada:segundas_lluvias"); ~modulo.("0") }],
	[at.(4, 0),  {
		~dice.([1, 2, 3, 4, 5, 6]).wait;
		~lectura = nil; ~espera.("lectura"); ~estado.("esperando a la máquina · lectura del quórum");
		if (~hasta.({ ~lectura.notNil }, 30).not) { ~lectura = [1, 0]; "[rutina] lectura por defecto: hay voces".postln };
		~espera.("");
		if (~lectura[0] > 0) {
			~dice.([7]).wait;
			if (~lectura[1] > 0) { ~dice.([9]).wait; ~vozDecir.([~numero.(~lectura[1])]) };
		} { ~dice.([8]).wait };
	}],
	// ── 2 · ESCUCHAR (5–11) ────────────────────────────────────────────
	[at.(5, 0),  { ~estado.("2 · escuchar"); ~modulo.("p") }],
	[at.(7, 0),  { ~modulo.("o") }],
	[at.(8, 0),  { ~dice.([80, 81, 82]) }],
	[at.(8, 40), { ~dice.([83, 84, 85]) }],
	[at.(9, 0),  { ~modulo.("2") }],
	[at.(9, 40), { ~dice.([86, 87, 88]) }],
	// ── 3 · LA PROPUESTA (11–17) ───────────────────────────────────────
	[at.(11, 0), { ~estado.("3 · la propuesta"); ~modulo.("c") }],
	[at.(11, 30),{ ~dice.([10, 16, 17, 11, 18, 19]) }],
	[at.(13, 30),{ ~modulo.("a") }],
	[at.(15, 0), { ~dice.([12, 13, 14, 15]) }],
	// ── 4 · DELIBERAR (17–24) ──────────────────────────────────────────
	[at.(17, 0), { ~estado.("4 · deliberar · simular antes de ejecutar"); ~modulo.("b") }],
	[at.(17, 10),{ ~accion.("opacidad"); ~dice.([20, 21]) }],
	[at.(17, 50),{ ~dice.([22, 23]) }],
	[at.(19, 30),{ ~modulo.("6"); ~accion.("seca"); ~dice.([24]) }],
	[at.(20, 10),{ ~dice.([25, 26]) }],
	[at.(21, 0), { ~accion.("restaurar"); ~dice.([27, 28]) }],
	[at.(22, 0), { ~modulo.("9") }],
	[at.(22, 20),{ ~dice.([29, 30, 31, 32]) }],
	[at.(23, 10),{ ~dice.([90, 91, 92, 93]) }],
	// ── 5 · ADJUDICAR O RETENER (24–30) ────────────────────────────────
	[at.(24, 0), {
		var f, c, tot, frac;
		~estado.("5 · adjudicar · votan los humanos"); ~modulo.("e");
		~votos = (favor: nil, contra: nil, bosque: nil);
		~dice.([40, 56, 57, 58]).wait;
		~dice.([41, 42, 47]).wait; 5.wait;
		~contador.sendMsg('/contar', "favor"); ~estado.("contando luces a favor");
		if (~hasta.({ ~votos.favor.notNil }, 12).not) { ~dice.([63]).wait };
		5.wait;
		~dice.([46, 42]).wait; 5.wait;
		~contador.sendMsg('/contar', "contra"); ~estado.("contando luces en contra");
		if (~hasta.({ ~votos.contra.notNil }, 12).not) { ~dice.([63]).wait };
		5.wait;
		~dice.([48]).wait;
		~espera.("bosque"); ~estado.("esperando a la máquina · llave del bosque");
		if (~hasta.({ ~votos.bosque.notNil }, 30).not) {
			~votos.bosque = (~lectura ? [1, 0])[0].clip(0, 1);
			("[rutina] llave del bosque por defecto (según la lectura): " ++ ~votos.bosque).postln };
		~espera.("");
		if (~votos.bosque == 0) { ~dice.([61, 62, 52, 53]).wait } {
			f = ~votos.favor ? 0; c = ~votos.contra ? 0; tot = f + c;
			~dice.([60]).wait;
			if (tot == 0) { ~dice.([52, 53]).wait } {
				frac = (f / tot).round(0.01);
				~accion.("consenso:" ++ frac);
				~dice.([49]).wait; 2.wait;
				~accion.("votar"); 3.wait;
				~dice.(if(frac >= 0.5, { [50, 53] }, { [51, 53] })).wait;
				("[rutina] dos llaves: bosque presente · a favor " ++ f ++ "/" ++ tot ++ " = " ++ frac).postln;
			};
		};
	}],
	[at.(27, 30),{ ~modulo.("r") }],
	[at.(28, 0), { ~dice.([54, 55]) }],
	[at.(28, 30),{ ~dice.([89]) }],
	[at.(29, 0), { ~dice.([70, 71]) }],
	[at.(29, 30),{ ~modulo.("f"); ~estado.("el bosque continúa") }],
	[at.(30, 0), { ~estado.("fin · 30:00") }]
];

~rutinaParar = { ~rutinaR !? { ~rutinaR.stop }; ~relojR !? { ~relojR.stop }; ~rutinaR = nil; ~enPausa = false };
~rutinaIniciar = {
	var t0 = Main.elapsedTime, pausado = 0;
	~rutinaParar.(); ~enPausa = false;
	~relojR = Routine { loop {
		~pagina.('/rutina/reloj', ((Main.elapsedTime - t0 - pausado) / ~escala).round(1)); 1.wait } }.play(SystemClock);
	~rutinaR = Routine {
		~partitura.do { |ev|
			var falta;
			while { ~enPausa } { 0.2.wait; pausado = pausado + 0.2 };
			falta = (ev[0] * ~escala) - (Main.elapsedTime - t0 - pausado);
			if (falta > 0) { falta.wait };
			while { ~enPausa } { 0.2.wait; pausado = pausado + 0.2 };
			ev[1].value;
		};
		~relojR !? { ~relojR.stop };
	}.play(SystemClock);
	~estado.("rutina en marcha");
};
OSCdef(\rutinaIniciar, { ~rutinaIniciar.() }, '/rutina/iniciar');
OSCdef(\rutinaPausa,   { ~enPausa = ~enPausa.not; ~estado.(~enPausa.if("en pausa", "sigue")) }, '/rutina/pausa');
OSCdef(\rutinaDetener, { ~rutinaParar.(); ~estado.("rutina detenida") }, '/rutina/detener');
// Cambio de módulo a mano, desde el guion en vivo: /maq/modulo "f"
OSCdef(\maqModulo, { |m| ~modulo.(m[1].asString) }, '/maq/modulo');
"[rutina] partitura de 30 minutos cargada · espera /rutina/iniciar".postln;
)
