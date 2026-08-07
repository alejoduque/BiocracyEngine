/*
@nwWrld name: Antifonia
@nwWrld category: 3D
@nwWrld imports: BaseThreeJsModule, THREE, loadJson
*/

/* ════════════════════════════════════════════════════════════════════════
 * ANTIFONÍA — el parlamento acústico del bosque  ·  switch [A]
 * bosque seco tropical · Reserva Manakai (Planeta Rica, Córdoba, Colombia)
 * ------------------------------------------------------------------------
 * Antifonía: canto alternado entre dos grupos. Es un fenómeno bioacústico
 * real —el dueto, la respuesta de una pareja o de una bandada— y a la vez
 * la forma más antigua del parlamento: hablar por turnos. Aquí cada fuente
 * sonora es un miembro que toma la palabra, y la sesión dura un día.
 *
 * EL EJE VERTICAL ES LA ALTURA. Se reutilizan los mismos estratos de
 * Humboldt que ordenan DarkForest [F] y Estratos [E] —de la RED MICORRÍCICA
 * a la ATMÓSFERA— porque quien canta lo hace DESDE una altura: el aullador
 * desde las emergentes, la rana desde el sotobosque, el murciélago cruzando
 * el dosel. La altura no es decoración: es la posición del hablante.
 *
 * CADA LLAMADA ES UNA VELA JAPONESA, la del gráfico bursátil: mecha fina del
 * máximo al mínimo, cuerpo grueso donde vive la energía, lleno si cerró por
 * encima de la llamada anterior de esa especie y apagado si por debajo. El
 * "precio" es la frecuencia. No es un chiste gráfico: este motor ya sonifica
 * una cadena de bloques, y poner al bosque en el mismo instrumento con el que
 * se cotiza una divisa dice en voz alta lo que hace el aparato entero —
 * intentar medir la naturaleza en tiempo real, con la herramienta equivocada,
 * dejando la costura a la vista.
 *
 * Las velas van INMERSAS: cada animal canta desde una PERCHA real, un árbol
 * de este rodal cuya altura alcance su estrato. El aullador sólo puede estar
 * en la ceiba porque es la única emergente; el avión no tiene percha, está en
 * la atmósfera. Abajo corre la misma lectura como gráfico completo —tiempo en
 * x, frecuencia en y— donde se ve la hipótesis del nicho acústico: las
 * especies repartiéndose bandas y horas para no enmascararse.
 *
 * TRES BANCADAS, no una. Biofonía (aullador, aves, insectos, oropéndola,
 * rana, murciélago), geofonía (lluvia, viento) y antropofonía (el avión, la
 * cinta). La máquina no es un intruso en esta sala: es la tercera bancada,
 * y su ruido crece hasta volverse ambiente en las transiciones de escucha
 * profunda, en vez de quedarse al lado. Cuando la marea sube, el bosque
 * habla; cuando baja, queda la máquina sosteniendo el aire.
 *
 * SUENA DE VERDAD. Las llamadas disparan las siete grabaciones de campo que
 * ya viven en 10_sample_system.scd, cada una abierta en la banda de esa
 * llamada y ubicada por su altura. Las fuentes de geofonía se dibujan pero
 * no suenan —todavía no hay grabación de lluvia ni de viento— y ese silencio
 * queda A LA VISTA en el HUD en vez de faltar en silencio.
 *
 * Inspirado en AveRosetta™ (NeotropicalScience), visualizador de comunica-
 * ción forestal que cruza nube LiDAR con llamadas anotadas. Ninguna línea
 * de su código ni de sus datos se usa aquí; la deuda es conceptual y queda
 * dicha en pantalla.
 *
 * EL RODAL ES UN BARRIDO LiDAR SIMULADO, no un decorado. Una ceiba emergente
 * de fuste limpio y copa en bandejas horizontales, tres campanos en cúpula de
 * paraguas más ancha que alta, y una docena de palmas de vino de estípite
 * columnar y corona arqueada: las tres arquitecturas son distinguibles a
 * simple vista, que es lo que convierte una nube de puntos en un lugar. Se
 * simula un vuelo aéreo —el dosel devuelve mucho, el suelo bastante, los
 * fustes verticales poco— porque esa asimetría es la que hace que una nube
 * aérea se vea como se ve. Fósforo blanco sobre negro, aditivo.
 *
 * La nube RESPONDE POR ESTRATO: cada llamada enciende la altura desde la que
 * se emitió, así que el bosque es el cuerpo que habla y no el fondo delante
 * del cual se habla.
 *
 * Implementación: THREE core, materiales integrados. Seis THREE.Points (uno
 * por estrato) generados una vez con semilla fija y barajados, de modo que el
 * LOD adaptativo recorta el rango de dibujo y obtiene una submuestra uniforme
 * sin regenerar nada; dos InstancedMesh (cuerpos y mechas) para todas las
 * velas; y una franja 2-D detrás del lienzo WebGL (el patrón que ya usa
 * Registro.js). El viento mece cada estrato desplazando SEIS posiciones por
 * cuadro — ni un vértice se toca. Sin asignaciones por cuadro.
 * ════════════════════════════════════════════════════════════════════════ */

class Antifonia extends BaseThreeJsModule {

  static methods = [
    { name: "setMasterVol",     executeOnLoad: true,  options: [{ name: "level", defaultVal: 0.5, type: "number", min: 0, max: 1 }] },
    { name: "setTimeDilation",  executeOnLoad: true,  options: [{ name: "value", defaultVal: 0.3, type: "number", min: 0, max: 1 }] },
    { name: "setSpectralShift", executeOnLoad: true,  options: [{ name: "value", defaultVal: 0.4, type: "number", min: 0, max: 1 }] },
    { name: "setSpatialSpread", executeOnLoad: true,  options: [{ name: "value", defaultVal: 0.5, type: "number", min: 0, max: 1 }] },
    { name: "setCoherence",     executeOnLoad: false, options: [{ name: "value", defaultVal: 0.5, type: "number", min: 0, max: 1 }] },
    { name: "pulse",            executeOnLoad: false, options: [{ name: "intensity", defaultVal: 1.4, type: "number", min: 0.3, max: 4 }] },
    { name: "setHour",          executeOnLoad: false, options: [{ name: "hour", defaultVal: 6, type: "number", min: 0, max: 24 }] },
  ];

  // Fosforescente sobre casi-negro, en la misma familia que DarkForest.
  static PALETTE = {
    bg:        "#04070A",
    grid:      "#152B2E",
    gridHi:    "#2A585C",
    axis:      "#356A62",
    ivory:     "#C7D3CB",
    bio:       "#74B86A",   // biofonía — verde
    bioHi:     "#A6E08A",
    geo:       "#4F86C6",   // geofonía — azul
    geoHi:     "#7FB0E4",
    antro:     "#E8A22A",   // antropofonía — ámbar (la máquina)
    antroHi:   "#FFC24A",
    alert:     "#FF5A39",
    term:      "#86E6BE",
  };

  // Estratos de Humboldt — MISMAS alturas que DarkForest.STRATA, a propósito:
  // los tres slots deben estar mirando el mismo bosque. Cambiar una y aquí sin
  // cambiarla allá haría que la misma llamada cayera en pisos distintos según
  // qué tecla se pulsó, que es justo la clase de desacuerdo silencioso que
  // este proyecto ya pagó caro en otros sitios.
  static STRATA = [
    { key: "atmosfera",  label: "ATMÓSFERA",       sub: "advección · tráfico",   y:  7.2, mAGL: 60 },
    { key: "emergentes", label: "EMERGENTES",      sub: "copas · 30–45 m",       y:  5.0, mAGL: 38 },
    { key: "dosel",      label: "DOSEL",           sub: "canopy · 12–30 m",      y:  3.2, mAGL: 20 },
    { key: "sotobosque", label: "SOTOBOSQUE",      sub: "understory · 2–10 m",   y:  1.4, mAGL:  6 },
    { key: "suelo",      label: "SUELO·HOJARASCA", sub: "0–2 m",                 y: -0.3, mAGL:  1 },
    { key: "micorriza",  label: "RED MICORRÍCICA", sub: "subsuelo",              y: -2.3, mAGL: -1 },
  ];

  // ── Las bancadas ────────────────────────────────────────────────────────
  // smp es el índice en ~samplePaths (10_sample_system.scd):
  //   0 aullidos · 1 aveseinsectos · 2 bats_retimed · 3 dreamliner
  //   4 oropendola · 5 ranas · 6 tapesample
  // smp:-1 significa "no hay grabación": el glifo se dibuja y NO suena. La
  // geofonía está en ese estado hoy; el HUD lo dice en voz alta para que la
  // falta se vea en vez de desaparecer.
  //
  // win es la ventana circadiana en horas [desde, hasta], y puede envolver la
  // medianoche. No es adorno: la hipótesis del nicho acústico dice que las
  // especies se reparten hora y banda para no enmascararse, y esa repartición
  // es lo que la franja de abajo hace visible.
  static SOURCES = [
    { key: "aullador",   label: "AULLADOR",      sci: "Alouatta seniculus", smp: 0, cls: "biofonia",
      stratum: "emergentes", lo: 120,   hi: 1800,  win: [4.3, 8.0],   rate: 1.00 },
    { key: "oropendola", label: "OROPÉNDOLA",    sci: "Psarocolius decumanus", smp: 4, cls: "biofonia",
      stratum: "dosel",      lo: 700,   hi: 4200,  win: [5.2, 10.5],  rate: 1.00 },
    { key: "aves",       label: "AVES",          sci: "ensamble diurno",    smp: 1, cls: "biofonia",
      stratum: "dosel",      lo: 1500,  hi: 9000,  win: [5.0, 9.8],   rate: 1.00 },
    { key: "chicharra",  label: "CHICHARRA",     sci: "Cicadidae",          smp: 1, cls: "biofonia",
      stratum: "sotobosque", lo: 4000,  hi: 11000, win: [10.5, 16.5], rate: 1.35 },
    { key: "rana",       label: "RANA",          sci: "Anura",              smp: 5, cls: "biofonia",
      stratum: "sotobosque", lo: 300,   hi: 3500,  win: [17.6, 23.5], rate: 1.00 },
    // La grabación viene expandida en el tiempo (bats_retimed), por eso suena:
    // la ecolocalización real vive muy por encima de Nyquist.
    { key: "murcielago", label: "MURCIÉLAGO",    sci: "Chiroptera",         smp: 2, cls: "biofonia",
      stratum: "dosel",      lo: 12000, hi: 60000, win: [18.4, 23.9], rate: 1.00 },
    // Crax alberti — paujil piquiazul, endémico y en peligro crítico. Camina
    // por el suelo entre los fustes en vez de volar, así que da al estrato del
    // suelo su primer habitante en movimiento. Su canto es un BOOM grave y
    // resonante: la única voz de la biofonía que vive donde vive el bombo, de
    // ahí la banda baja. Se abre la grabación de aves en esa ventana, que es
    // lo que el motor hace con todas: la banda de la llamada filtra el
    // registro, no lo sustituye.
    { key: "paujil",     label: "PAUJIL",        sci: "Crax alberti",       smp: 1, cls: "biofonia",
      stratum: "suelo",      lo: 60,    hi: 320,   win: [5.0, 8.6],   rate: 0.72 },
    // Atta cephalotes — hormiga arriera. No es un individuo, es un CAMINO: una
    // fila que va del hormiguero al árbol. Estridulan al cortar, así que sí
    // tienen voz — agudísima, muy tenue y casi continua. Y como cultivan
    // hongo, el camino enciende el micelio por donde pasa: las dos cosas son
    // un solo sistema y no dos adornos.
    { key: "arriera",    label: "ARRIERA",       sci: "Atta cephalotes",    smp: 1, cls: "biofonia",
      stratum: "suelo",      lo: 6000,  hi: 15000, win: [18.0, 5.5],  rate: 1.85 },
    { key: "lluvia",     label: "LLUVIA",        sci: "precipitación",      smp: -1, cls: "geofonia",
      stratum: "atmosfera",  lo: 200,   hi: 8000,  win: [13.0, 18.0], rate: 1.00 },
    { key: "viento",     label: "VIENTO",        sci: "advección",          smp: -1, cls: "geofonia",
      stratum: "emergentes", lo: 30,    hi: 1200,  win: [10.0, 17.0], rate: 1.00 },
    { key: "avion",      label: "AVIÓN",         sci: "tráfico aéreo",      smp: 3, cls: "antropofonia",
      stratum: "atmosfera",  lo: 60,    hi: 900,   win: [6.0, 22.0],  rate: 1.00 },
    { key: "cinta",      label: "CINTA",         sci: "registro · máquina", smp: 6, cls: "antropofonia",
      stratum: "suelo",      lo: 40,    hi: 6000,  win: [0.0, 24.0],  rate: 1.00 },
  ];

  // Vocabulario de taxon de PhenologicalCalendar. Sólo biofonía aparece aquí:
  // las otras dos bancadas no son especies y no entran al censo.
  static TAXON = {
    aullador: "mammals", murcielago: "mammals",
    oropendola: "birds",  aves: "birds",
    rana: "amphibians",   chicharra: "reptiles",
    paujil: "birds",      arriera: "reptiles",   // el vocabulario no tiene insectos
  };

  // ── Presupuesto de la nube ──────────────────────────────────────────────
  // scale multiplica TODOS los conteos: es la perilla única para subir o bajar
  // el rodal entero. A 1.0 el barrido queda en ~62 000 puntos, que en esta
  // máquina se dibuja en un solo draw call por estrato y no mueve la aguja del
  // cuadro. El LOD adaptativo de más abajo puede recortar hasta el 35 % sin
  // regenerar nada, porque los puntos están barajados.
  // Deliberadamente ESCASA. Esto no es un levantamiento topográfico: es lo
  // que la máquina alcanza a ver del bosque seco — una presencia espectral,
  // no un modelo. Bajar densidad y tamaño de punto hasta que la forma se
  // insinúe en vez de describirse es la decisión estética central del slot,
  // y de paso deja el cuadro barato.
  // scale rige el follaje: escaso a propósito. El SUELO lleva su propio
  // presupuesto, mucho mayor, porque es lo único que debe leerse continuo —
  // es la superficie sobre la que se sostiene todo lo demás, y con la mezcla
  // aditiva un terreno ralo no se ve tenue, se ve AUSENTE: el rodal quedaba
  // flotando sobre nada.
  static CLOUD = { scale: 0.42, ground: 38000, shrub: 620 };

  // ── Metros → unidades de escena, en HORIZONTAL ──────────────────────────
  // La vertical ya la convierte _yFromAGL (metros sobre el suelo → y del
  // estrato). La horizontal no tenía conversión ninguna: los radios de copa
  // estaban escritos en metros y se usaban como unidades de escena, así que
  // un campano de 16 m de radio abarcaba 32 unidades sobre una parcela de 18.
  // Las copas se salían del mundo y formaban un cuenco que se comía la imagen.
  // La parcela son 100 m ↔ PLOT*2 unidades.
  static M = (9.0 * 2) / 100;

  static BIRDS = 3;             // aves en vuelo — ocupan el estrato de las velas
  // Dos monos aulladores rojos (Alouatta seniculus) en las ramas de la ceiba.
  // No son decorado: el aullador ya era una de las fuentes de la bancada de
  // biofonía —la de registro más grave, ventana 4.3-8.0 h— y hasta ahora sus
  // llamadas salían de una percha genérica. Ahora salen DE ELLOS, así que la
  // voz más reconocible del bosque seco tiene por fin un cuerpo que se mueve.
  // Y sólo pueden estar en la ceiba, porque es la única emergente del rodal:
  // el mismo confinamiento que ya regía sus llamadas, ahora visible.
  // UNO. Eran dos, y dos aulladores del mismo tamaño moviéndose en la misma
  // copa se leían como un par de adornos simétricos. Un solo animal en un
  // rodal de sesenta y un árboles es una presencia; dos son un patrón.
  static HOWLERS = 1;
  static PAUJILES = 2;         // Crax alberti — camina el suelo entre fustes
  static ANTS = 46;            // una fila de Atta, no cuarenta y seis bichos
  static GLYPH_POOL = 220;      // techo duro de velas vivas
  static NICHE_KEEP = 260;      // llamadas retenidas en la franja del nicho
  static PLOT = 9.0;            // media anchura de la parcela, en unidades de escena

  constructor(container) {
    super(container);

    this.host = container;
    this._animationId = null;
    this._t0 = (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
    this._last = this._t0;

    // Reloj circadiano. Una sesión completa dura ~8 min de reloj de pared por
    // defecto; timeDilation la estira o la comprime.
    this.hour = 5.4;             // antes del amanecer: la sesión abre con el coro
    this.dayLenSec = 480;
    this._manualHour = null;

    // Controles vivos (leídos por cuadro de window.__sonethParams) y sus
    // objetivos suavizados. Dos objetos y no uno para que ningún salto de
    // slider llegue crudo a la imagen.
    // Nombres propios, NO los de los parámetros: lo que este slot lee y lo
    // que escribe son conjuntos disjuntos a propósito (ver _readControls).
    this.ctl = { vol: 0.5, time: 0.3, spectral: 0.4, spread: 0.5, dens: 0.4, body: 0.4, tx: 0.5 };
    this.tgt = { ...this.ctl };

    this.coherence = 0.5;
    this.vitality = 0.0;
    this.pulseEnergy = 0.0;

    // Peso por estrato desde las ocho regiones eDNA, igual que DarkForest.
    this.stratumW = new Array(Antifonia.STRATA.length).fill(0.5);
    this.tgtStratum = new Array(Antifonia.STRATA.length).fill(0.5);

    // Marea: la llenamos desde window.__sonethParams/__tide si existe; si no,
    // el módulo sigue funcionando con marea plana.
    this.tide = 0.65;

    this.calls = [];             // llamadas vivas (pool, sin allocación por cuadro)
    this.niche = [];             // historia para la franja
    this._pending = [];          // cola que drena el puente hacia SC
    this._fired = 0;
    this._silentFired = 0;       // llamadas sin grabación (la brecha de geofonía)
    this._score = null;          // partitura cargada, si existe

    this._dummy = null;
    this._bodies = null;
    this._wicks = null;
    this._srcByKey = new Map();
    Antifonia.SOURCES.forEach((s) => this._srcByKey.set(s.key, s));

    this.init();
  }

  // ══ ciclo de vida ══════════════════════════════════════════════════════

  init() {
    const P = Antifonia.PALETTE;
    this.scene.background = new THREE.Color(P.bg);
    this.scene.fog = new THREE.Fog(new THREE.Color(P.bg), 18, 52);

    // Encuadre: el rodal ocupa ±9 unidades en horizontal y de -1.3 a +5.2 en
    // vertical. A 24 unidades quedaba flotando en medio del viewport con la
    // mitad del cuadro vacío; a 15.5 y algo más bajo, el bosque llena la
    // ventana y la ceiba entra por arriba, que es como debe leerse una
    // emergente: saliéndose del dosel.
    this.camera.position.set(2.2, 2.2, 17.5);
    this.camera.near = 0.1;
    this.camera.far = 220;
    this.camera.updateProjectionMatrix();

    if (this.controls) {
      this.controls.enabled = true;
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.06;
      this.controls.minDistance = 5;
      this.controls.maxDistance = 46;
      this.controls.maxPolarAngle = Math.PI * 0.92;
      this.controls.target.set(0, 1.2, 0);
      this.controls.update();
    }

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xbfe6d2, 0.5);
    key.position.set(6, 12, 8);
    this.scene.add(key);

    this._buildCloud();
    this._buildBirds();
    // Después de _buildCloud: necesitan la ceiba, que se siembra allí.
    this._buildHowlers();
    this._buildGroundFauna(this._rnd0 || this._rng(7));
    this._buildStrata();
    this._buildGlyphs();
    this._buildNiche();
    this._buildHUD();

    this._loadScore();

    this.show();
    this._loop();
  }

  destroy() {
    if (this._animationId) {
      cancelAnimationFrame(this._animationId);
      this._animationId = null;
    }
    try {
      for (const spr of (this._howlerSprites || [])) {
        if (spr && spr.parent) spr.parent.remove(spr);
        if (spr && spr.geometry) spr.geometry.dispose();
        if (spr && spr.material) spr.material.dispose();
      }
      this._howlerSprites = null;
      for (const net of (this._mycoNets || [])) {
        if (net && net.line) {
          if (net.line.parent) net.line.parent.remove(net.line);
          if (net.line.geometry) net.line.geometry.dispose();
          if (net.mat) net.mat.dispose();
        }
      }
      this._mycoNets = null;
      for (const spr of (this._paujilSprites || [])) {
        if (spr && spr.parent) spr.parent.remove(spr);
        if (spr && spr.geometry) spr.geometry.dispose();
        if (spr && spr.material) spr.material.dispose();
      }
      this._paujilSprites = null;
      for (const el of [this._hud, this._legend, this._nicheCv, this._fontLink]) {
        if (el && el.parentNode) el.parentNode.removeChild(el);
      }
      if (this._nicheCx) this._nicheCx = null;
      if (this._labelTexes) {
        for (const t of this._labelTexes) { if (t) t.dispose(); }
        this._labelTexes = null;
      }
    } catch (e) { /* ignore */ }
    // Nunca dejar la cola apuntando a este módulo: el puente la drena por
    // temporizador y podría leerla un tick después de desmontar.
    this._pending = [];
    super.destroy();
  }

  // ══ construcción ═══════════════════════════════════════════════════════

  _buildStrata() {
    const P = Antifonia.PALETTE;
    const W = Antifonia.PLOT;
    this._strataGroup = new THREE.Group();
    this._labelTexes = [];

    for (let i = 0; i < Antifonia.STRATA.length; i++) {
      const st = Antifonia.STRATA[i];
      // Rejilla del piso: un rectángulo de líneas, no un plano sólido, para
      // que se vea a través de la pila entera.
      const pts = [];
      const step = W / 3;
      for (let x = -W; x <= W + 0.001; x += step) { pts.push(x, st.y, -W, x, st.y, W); }
      for (let z = -W; z <= W + 0.001; z += step) { pts.push(-W, st.y, z, W, st.y, z); }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      // Tenues a propósito: cuando sólo había líneas, la rejilla ERA la imagen.
      // Ahora el rodal es el cuerpo y esto vuelve a ser lo que debía ser, una
      // regla graduada detrás del bosque.
      const m = new THREE.LineBasicMaterial({
        color: new THREE.Color(i % 2 === 0 ? P.gridHi : P.grid),
        transparent: true, opacity: 0.16, depthWrite: false,
      });
      const grid = new THREE.LineSegments(g, m);
      grid.userData.stratum = i;
      this._strataGroup.add(grid);

      // A la IZQUIERDA del rodal y al frente, no al fondo. Colocadas en
      // z = -W quedaban proyectadas SOBRE las copas desde la vista por
      // defecto y no se podía leer ninguna de las seis. La escala vertical
      // sólo sirve si se puede leer sin girar la cámara.
      const spr = this._textSprite(st.label, st.sub, i);
      spr.position.set(-W - 3.1, st.y + 0.30, 0);
      this._strataGroup.add(spr);
    }

    // Eje vertical: la altura sobre el suelo, que es de lo que trata el slot.
    const axisPts = [-W - 1.5, Antifonia.STRATA[Antifonia.STRATA.length - 1].y - 1, 0,
                     -W - 1.5, Antifonia.STRATA[0].y + 1.2, 0];
    const ag = new THREE.BufferGeometry();
    ag.setAttribute("position", new THREE.Float32BufferAttribute(axisPts, 3));
    this._strataGroup.add(new THREE.Line(ag, new THREE.LineBasicMaterial({
      color: new THREE.Color(P.axis), transparent: true, opacity: 0.7,
    })));

    this.scene.add(this._strataGroup);
  }

  // ══ la nube ════════════════════════════════════════════════════════════
  //
  // Un barrido LiDAR SIMULADO de un rodal de bosque seco: una ceiba emergente,
  // tres campanos y una decena de palmas de vino. No es una nube genérica: las
  // tres arquitecturas son distinguibles a simple vista, que es el punto —
  // esto es un instrumento de lectura, y quien mira debe poder decir "esa es
  // la ceiba" antes de leer una sola etiqueta.
  //
  //   Ceiba pentandra   fuste limpio y larguísimo, contrafuertes en la base,
  //                     copa ancha y APLANADA en pisos horizontales, ~42 m.
  //   Albizia saman     campano: ramifica bajo, cúpula en PARAGUAS más ancha
  //                     que alta (~30 m de diámetro por ~25 de alto).
  //   Attalea butyracea palma de vino: estípite columnar delgadísimo y corona
  //                     de hojas que salen del ápice y se arquean hacia abajo.
  //
  // Se simula un vuelo aéreo, no un escáner terrestre: el dosel devuelve
  // mucho, el suelo bastante, y los fustes verticales POCO —un haz que baja
  // casi vertical apenas los roza—. Esa asimetría es la que hace que una nube
  // aérea se vea como se ve, y es gratis reproducirla.
  //
  // Semilla fija: el rodal debe ser el MISMO en cada arranque. Un bosque que
  // cambia de forma entre ensayo y función no es un lugar, es ruido.
  _rng(seed) {
    let s = (seed >>> 0) || 1;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  _buildCloud() {
    const rnd = this._rng(20221109);
    // Compartido con _buildGroundFauna: el hormiguero y el árbol al que va la
    // fila tienen que ser los MISMOS en cada arranque, igual que el rodal.
    this._rnd0 = rnd;           // fecha del barrido de referencia
    const W = Antifonia.PLOT;
    // Un cubo por estrato: cada uno acaba siendo su propio THREE.Points, de
    // modo que responder a la actividad por estrato cuesta SEIS cambios de
    // material por cuadro en vez de reescribir 60 000 colores.
    const buckets = Antifonia.STRATA.map(() => ({ pos: [], col: [] }));

    const put = (x, agl, z, intensity) => {
      const y = this._yFromAGL(agl);
      const si = this._stratumIndexFromAGL(agl);
      const b = buckets[si];
      b.pos.push(x, y, z);
      // Fósforo blanco: casi blanco con un sesgo verde-cian, modulado por la
      // intensidad de retorno. El follaje devuelve flojo, el suelo y la madera
      // devuelven fuerte — así la copa queda vaporosa y el suelo firme.
      const i = Math.max(0.16, Math.min(1, intensity));
      b.col.push(0.80 * i + 0.10, 0.97 * i + 0.06, 0.90 * i + 0.10);
    };
    // Los constructores de árbol son métodos (para que cada arquitectura se
    // lea por separado) y necesitan este emisor; se pasa por referencia en vez
    // de reconstruirlo tres veces.
    this._putRef = put;

    // ── suelo ────────────────────────────────────────────────────────────
    // Microrrelieve suave; el suelo es lo único que devuelve casi siempre.
    const groundAt = (x, z) =>
      Math.sin(x * 0.21) * 0.5 + Math.cos(z * 0.17) * 0.42 + Math.sin((x + z) * 0.09) * 0.3;
    // AMORFO. Muestreado en polares con el radio modulado por tres armónicos
    // del ángulo, no en un cuadrado: un rectángulo cartesiano perfecto
    // anunciaba que esto era una simulación con dominio rectangular, y el
    // borde recto era lo primero que veía el ojo. La densidad además decae
    // hacia el límite, así que el rodal se DESVANECE en vez de terminar —
    // ningún barrido real tiene una frontera.
    const lobe = (a) =>
      0.74 + 0.16 * Math.sin(a * 2 + 0.7) + 0.10 * Math.sin(a * 3 - 1.9)
           + 0.06 * Math.sin(a * 5 + 2.6);
    this._lobe = lobe;
    const nGround = Math.round(Antifonia.CLOUD.ground * Antifonia.CLOUD.scale);
    for (let i = 0; i < nGround; i++) {
      const a = rnd() * Math.PI * 2;
      const t = Math.sqrt(rnd());                 // uniforme en área
      if (rnd() < Math.pow(t, 3.4)) continue;     // ralea sólo el borde exterior
      // 1.55x reach. The stand read as an island: the ground stopped almost
      // exactly where the canopy did, so the eye found the edge of the plot
      // instead of a forest continuing past the frame. The rim thinning below
      // still fades it out — it just fades out further away now, and the
      // mycelium that already runs past the boundary has ground to run over.
      const r = t * W * lobe(a) * 1.55;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      // Intensidad baja: el suelo devuelve mucho pero no es lo que hay que
      // mirar. A 0.55-1.0 se comía las copas por brillo.
      put(x, 0.15 + groundAt(x, z) * 0.55 + rnd() * 0.25, z, 0.24 + rnd() * 0.20);
    }

    // ── árboles ──────────────────────────────────────────────────────────
    // SEMBRADO, no colocado. La lista a mano de veintiún árboles se leía como
    // una maqueta: separaciones parejas, la ceiba sola en el centro de un
    // claro que nadie plantó, y el ojo encontraba la retícula debajo. Un
    // bosque no se compone, se llena.
    //
    // Ahora crecen por reclutamiento: núcleos de regeneración repartidos en el
    // lóbulo, y alrededor de cada uno un grupo que se aprieta hacia el centro
    // (raíz cuadrada del radio → densidad mayor adentro, como un claro que se
    // cierra desde los bordes). Se rechazan las posiciones demasiado juntas —
    // exclusión mínima, que es lo que impide que dos copas ocupen el mismo
    // metro cúbico— y el resto queda irregular porque lo es.
    //
    // La ceiba NO va en el centro y NO va sola: entra desplazada y sus
    // vecinos se siembran encima de ella, tocándola. Una emergente vive
    // rodeada; el claro alrededor era el rasgo más artificial de todo esto.
    this._trees = [];
    const placed = [];
    const tooClose = (x, z, minD) => {
      for (const p of placed) {
        const dx = p[0] - x, dz = p[1] - z;
        if (dx * dx + dz * dz < minD * minD) return true;
      }
      return false;
    };
    const claim = (x, z, minD) => {
      if (Math.hypot(x, z) > W * lobe(Math.atan2(z, x)) * 1.02) return false;
      if (tooClose(x, z, minD)) return false;
      placed.push([x, z]);
      return true;
    };

    // la giganta, descentrada
    const ceibaX = -2.35, ceibaZ = 1.15;
    this._tree_ceiba(rnd, ceibaX, ceibaZ, 1.0);
    placed.push([ceibaX, ceibaZ]);

    // su cortejo inmediato: pegado, tocándola
    for (let i = 0; i < 7; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 0.75 + rnd() * 2.1;
      const x = ceibaX + Math.cos(a) * r, z = ceibaZ + Math.sin(a) * r;
      if (!claim(x, z, 0.62)) continue;
      this._tree_arbol(rnd, x, z, 0.5 + rnd() * 0.45);
    }

    // núcleos de regeneración por todo el lóbulo
    const nuclei = [];
    for (let k = 0; k < 7; k++) {
      const a = rnd() * Math.PI * 2;
      const r = (0.25 + rnd() * 0.68) * W;
      nuclei.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    for (const [nx, nz] of nuclei) {
      const n = 5 + ((rnd() * 7) | 0);
      // Un campano ancla la mayoría de los núcleos, y si el punto exacto está
      // ocupado busca al lado en vez de rendirse. Con un solo intento salían
      // dos campanos en todo el rodal —la exclusión mínima los rechazaba
      // contra árboles ya sembrados— y su cúpula en paraguas, una de las tres
      // siluetas que este slot existe para hacer legibles, no se veía.
      if (rnd() < 0.72) {
        for (let att = 0; att < 6; att++) {
          const jx = nx + (rnd() - 0.5) * att * 0.7;
          const jz = nz + (rnd() - 0.5) * att * 0.7;
          if (claim(jx, jz, 0.9)) {
            this._tree_campano(rnd, jx, jz, 0.62 + rnd() * 0.38);
            break;
          }
        }
      }
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2;
        const rr = Math.sqrt(rnd()) * (1.4 + rnd() * 2.4);
        const x = nx + Math.cos(a) * rr, z = nz + Math.sin(a) * rr;
        if (!claim(x, z, 0.58)) continue;
        this._tree_arbol(rnd, x, z, 0.42 + rnd() * 0.62);
      }
    }

    // ── Las palmas van ANTES del relleno ──────────────────────────────────
    // Iban al final y se quedaron sin sitio: subir los puntos del fuste de la
    // ceiba consumió miles de tiradas más del generador, todo el rodal se
    // resembró distinto, y los 60 intentos de colocación de las palmas
    // fallaron contra un bosque más lleno. El rodal salía SIN NINGUNA palma y
    // sólo se notó porque el conteo se publica.
    //
    // Se siembran ahora con las cohortes, cuando aún hay hueco. El relleno se
    // acomoda a ellas y no al revés.
    for (let k = 0, tries = 0; k < 2 && tries < 120; tries++) {
      const a = rnd() * Math.PI * 2;
      const r = (0.42 + rnd() * 0.5) * W;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!claim(x, z, 1.2)) continue;
      this._tree_palma(rnd, x, z, 0.88 + rnd() * 0.24);
      k++;
    }

    // relleno disperso: los que crecieron donde cupieron
    for (let i = 0; i < 46; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * W * lobe(a) * 0.97;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!claim(x, z, 0.66)) continue;
      this._tree_arbol(rnd, x, z, 0.34 + rnd() * 0.6);
    }



    // ── sotobosque ───────────────────────────────────────────────────────
    const nShrub = Math.round(Antifonia.CLOUD.shrub * Antifonia.CLOUD.scale);
    for (let i = 0; i < nShrub; i++) {
      // Los arbustos siguen el mismo borde amorfo que el suelo.
      const sa = rnd() * Math.PI * 2;
      const sr = Math.sqrt(rnd()) * W * this._lobe(sa) * 0.96;
      const cx = Math.cos(sa) * sr, cz = Math.sin(sa) * sr;
      const h = 0.8 + rnd() * 3.4;
      const r = (0.5 + rnd() * 1.3) * Antifonia.M;
      const n = 6 + (rnd() * 10) | 0;
      for (let k = 0; k < n; k++) {
        const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * r;
        put(cx + Math.cos(a) * rr, rnd() * h + 0.2, cz + Math.sin(a) * rr, 0.22 + rnd() * 0.3);
      }
    }

    // ── a la GPU ─────────────────────────────────────────────────────────
    this._cloudPoints = [];
    this._cloudMats = [];
    this._cloudGroup = new THREE.Group();
    for (let si = 0; si < buckets.length; si++) {
      const b = buckets[si];
      if (b.pos.length === 0) { this._cloudPoints.push(null); this._cloudMats.push(null); continue; }
      // Barajado Fisher-Yates sobre las ternas. Esto es lo que hace que el LOD
      // adaptativo sea gratis más abajo: si los puntos están en orden
      // aleatorio, dibujar un PREFIJO del buffer es una submuestra uniforme
      // del rodal entero, no un trozo con forma.
      const n = b.pos.length / 3;
      for (let i = n - 1; i > 0; i--) {
        const j = (rnd() * (i + 1)) | 0;
        for (let k = 0; k < 3; k++) {
          let t = b.pos[i * 3 + k]; b.pos[i * 3 + k] = b.pos[j * 3 + k]; b.pos[j * 3 + k] = t;
          t = b.col[i * 3 + k]; b.col[i * 3 + k] = b.col[j * 3 + k]; b.col[j * 3 + k] = t;
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute("color", new THREE.Float32BufferAttribute(b.col, 3));
      // Punto mínimo. Con mezcla aditiva, muchos puntos diminutos leen como una
      // niebla que se condensa donde hay materia — la presencia fantasmal que
      // se busca. Puntos grandes leen como bolitas y vuelven diagrama el
      // bosque.
      const m = new THREE.PointsMaterial({
        size: 0.020, sizeAttenuation: true, vertexColors: true,
        transparent: true, opacity: 0.82, depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const pts = new THREE.Points(g, m);
      pts.frustumCulled = false;
      pts.userData.total = n;
      this._cloudGroup.add(pts);
      this._cloudPoints.push(pts);
      this._cloudMats.push(m);
    }
    this.scene.add(this._cloudGroup);
    this._buildMycelium(rnd, W);

    this._cloudTotal = this._cloudPoints.reduce((a, p) => a + (p ? p.userData.total : 0), 0);

    // Composición del rodal, publicada. Los árboles ya no se enumeran a mano
    // sino que se siembran en bucles, así que contar líneas del fuente dejó de
    // decir nada — lo que hay que poder mirar es lo que CRECIÓ. Se publica en
    // la misma forma en que btransito publica __transitoDrone, y sirve tanto
    // para las pruebas como para saber, en vivo, qué bosque se está mirando.
    try {
      const kinds = {};
      for (const t of this._trees) kinds[t.kind] = (kinds[t.kind] || 0) + 1;
      if (typeof window !== "undefined") {
        window.__antifoniaStand = {
          trees: kinds,
          treeTotal: this._trees.length,
          points: this._cloudTotal,
          mycoSegments: this._mycoSegs,
          birds: Antifonia.BIRDS,
          howlers: Antifonia.HOWLERS,
          paujiles: Antifonia.PAUJILES,
          ants: Antifonia.ANTS,
          seed: 20221109,
        };
      }
    } catch (e) { /* ignore */ }

    this._lod = 1.0;
  }

  // Ceiba pentandra — la emergente. Fuste limpio y largo, contrafuertes en la
  // base, y una copa ancha y APLANADA construida en pisos horizontales: es esa
  // silueta en bandejas la que la delata desde el aire.
  _tree_ceiba(rnd, cx, cz, scale) {
    const put = this._putRef;
    const M = Antifonia.M;
    // Alturas en METROS (la vertical las convierte); radios en UNIDADES.
    const H = 42 * scale, boleTop = 24 * scale, R = 13 * scale * M;
    const S = Antifonia.CLOUD.scale;

    // contrafuertes: aletas radiales que salen del fuste hasta ~3.5 m
    for (let f = 0; f < 7; f++) {
      const a = (f / 7) * Math.PI * 2 + rnd() * 0.2;
      const n = Math.round(90 * S);
      for (let i = 0; i < n; i++) {
        const t = rnd();
        const h = t * 3.4 * scale;
        const out = (1 - t) * 3.0 * scale * M * (0.5 + rnd() * 0.5);
        const wob = (rnd() - 0.5) * 0.25;
        put(cx + Math.cos(a + wob) * (0.9 * scale * M + out), h + 0.1,
            cz + Math.sin(a + wob) * (0.9 * scale * M + out), 0.75 + rnd() * 0.25);
      }
    }
    // ── El fuste, a propósito CONTRA el modelo ──────────────────────────
    // Aquí decía "pocos retornos: un haz casi vertical apenas roza una pared",
    // que es cierto de un barrido aéreo y daba 134 puntos de fuste contra 2604
    // de copa — el tronco era el 4,5 % del árbol y sencillamente no se veía.
    //
    // La ceiba es el único árbol de este rodal cuya ARQUITECTURA es el asunto:
    // el fuste limpio y larguísimo es la mitad de lo que la hace reconocible.
    // Un barrido que lo borra es físicamente honesto y compositivamente
    // inútil, así que aquí se abandona el modelo a sabiendas. Los demás
    // árboles conservan la asimetría aérea.
    const nBole = Math.round(1500 * S);
    for (let i = 0; i < nBole; i++) {
      const t = rnd();
      const h = 3.0 * scale + t * (boleTop - 3.0 * scale);
      const r = (1.05 - t * 0.35) * scale * M;
      const a = rnd() * Math.PI * 2;
      put(cx + Math.cos(a) * r, h, cz + Math.sin(a) * r, 0.62 + rnd() * 0.3);
    }
    // ── Copa en pisos, ASIMÉTRICA ────────────────────────────────────────
    // Las bandejas eran ruedas de radar: N ramas a paso angular exacto
    // (bi/branches)·2π, TODAS del mismo largo rr y todas centradas en el eje.
    // Desde arriba, un radio perfecto; de frente, cinco discos concéntricos.
    // Ninguna ceiba se parece a eso. Una emergente de cuarenta metros ha
    // perdido ramas, las que le quedan son de largos muy distintos, y cada
    // bandeja se recuesta hacia donde encontró luz.
    //
    // Ahora cada rama se DESCRIBE antes de sembrarle puntos —ángulo con paso
    // irregular, largo propio, caída propia, curvatura en planta— y los puntos
    // se reparten por LARGO, no por rama: si no, una rama corta acabaría tan
    // densa como una del doble de longitud, que es la simetría de nuevo pero
    // disimulada.
    const tiers = 5;
    // El eje de la copa no es una plomada. Se recuesta, y cada piso se
    // desplaza del anterior siguiendo esa inclinación.
    const leanA = rnd() * Math.PI * 2;
    const leanR = (0.5 + rnd() * 0.9) * scale * M;
    for (let ti = 0; ti < tiers; ti++) {
      const u = ti / (tiers - 1);
      const h = boleTop + u * (H - boleTop);
      // ancho máximo hacia abajo, estrechando arriba — de ahí lo aplanado
      const rr = R * Math.sin(Math.PI * (0.30 + u * 0.62)) * (1 - u * 0.22);
      // Copa MÁS RALA: 1500 -> 800 por bandeja. Las bandejas horizontales se
      // leen por su silueta, no por su densidad, y al aclararlas se ve el
      // fuste a través de ellas y el cielo entre piso y piso.
      const n = Math.round((800 - ti * 90) * S);
      const tcx = cx + Math.cos(leanA + ti * 0.7) * leanR * u * 1.4;
      const tcz = cz + Math.sin(leanA + ti * 0.7) * leanR * u * 1.4;

      const branches = 6 + ((rnd() * 5) | 0);
      const arms = [];
      let acc = rnd() * Math.PI * 2;
      let lenSum = 0;
      for (let b = 0; b < branches; b++) {
        // paso entre 0.45 y 1.75 veces el medio: se juntan por un lado y se
        // abren claros por el otro
        acc += (Math.PI * 2 / branches) * (0.45 + rnd() * 1.3);
        // una de cada seis se perdió. El hueco es parte del árbol, no un fallo
        // del barrido: así es como se ve el cielo a través de una emergente.
        if (rnd() < 0.16) continue;
        const len = rr * (0.42 + Math.pow(rnd(), 0.7) * 0.78);
        arms.push({
          a: acc,
          len,
          droop: (0.25 + rnd() * 0.75) * (len / rr),   // las largas se vencen
          curve: (rnd() - 0.5) * 0.5,                  // no es recta en planta
          thick: 0.10 + rnd() * 0.13,
        });
        lenSum += len;
      }
      if (arms.length === 0) continue;
      for (let i = 0; i < n; i++) {
        // reparto por largo: una rama del doble de largo recibe el doble
        let pick = rnd() * lenSum, k = 0;
        while (k < arms.length - 1 && (pick -= arms[k].len) > 0) k++;
        const br = arms[k];
        const t = Math.pow(rnd(), 0.62);            // más denso hacia la punta
        const r = t * br.len;
        // el follaje se abre a media rama y se cierra en la punta
        const spread = br.thick * Math.sin(Math.PI * Math.min(1, t * 1.15));
        const a = br.a + br.curve * t * t + (rnd() - 0.5) * spread * 2.4;
        // cada bandeja es una lámina delgada: poco espesor vertical, más la
        // caída de la rama, que es cuadrática y no lineal — se vence al final
        const dy = (rnd() - 0.5) * 1.9 * scale - t * t * br.droop * 3.2 * scale;
        put(tcx + Math.cos(a) * r + (rnd() - 0.5) * 0.09,
            h + dy,
            tcz + Math.sin(a) * r + (rnd() - 0.5) * 0.09,
            0.20 + rnd() * 0.34);
      }
    }
    this._trees.push({ kind: "ceiba", x: cx, z: cz, h: H, r: R });
  }

  // Albizia saman — el campano. Ramifica bajo y arma una cúpula en paraguas
  // MÁS ANCHA QUE ALTA; desde arriba es un disco casi perfecto.
  _tree_campano(rnd, cx, cz, scale) {
    const put = this._putRef;
    const M = Antifonia.M;
    const H = 25 * scale, fork = 6.5 * scale, R = 16 * scale * M;
    const S = Antifonia.CLOUD.scale;

    const nBole = Math.round(210 * S);
    for (let i = 0; i < nBole; i++) {
      const t = rnd();
      const h = t * fork;
      const r = (1.0 - t * 0.25) * scale * M;
      const a = rnd() * Math.PI * 2;
      put(cx + Math.cos(a) * r, h + 0.1, cz + Math.sin(a) * r, 0.66 + rnd() * 0.3);
    }
    // ramas primarias: salen del punto de horquilla y suben abriéndose
    const arms = 5 + ((rnd() * 3) | 0);
    for (let ai = 0; ai < arms; ai++) {
      const a0 = (ai / arms) * Math.PI * 2 + rnd() * 0.3;
      const n = Math.round(150 * S);
      for (let i = 0; i < n; i++) {
        const t = rnd();
        const r = t * R * 0.72;
        const h = fork + Math.sin(t * Math.PI * 0.5) * (H - fork) * 0.72;
        put(cx + Math.cos(a0) * r + (rnd() - 0.5) * 0.11, h + (rnd() - 0.5) * 0.5,
            cz + Math.sin(a0) * r + (rnd() - 0.5) * 0.11, 0.5 + rnd() * 0.3);
      }
    }
    // la cúpula: casquete achatado, denso arriba y hueco por debajo
    const n = Math.round(5200 * S);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const t = Math.sqrt(rnd());                  // uniforme en área
      const r = t * R;
      // perfil de paraguas: alto en el centro, cayendo a los bordes
      const top = H - Math.pow(t, 1.7) * (H - fork) * 0.78;
      // espesor de la lámina de follaje: delgado, por eso se ve como cáscara
      const depth = (1.6 + (1 - t) * 2.6) * scale;               // metros
      const h = top - rnd() * depth;
      put(cx + Math.cos(a) * r, h, cz + Math.sin(a) * r, 0.18 + rnd() * 0.30);
    }
    this._trees.push({ kind: "campano", x: cx, z: cz, h: H, r: R });
  }

  // ══ aves en vuelo ══════════════════════════════════════════════════════
  //
  // Las velas altas quedaban colgadas en el aire sin causa: un registro a 30 m
  // sobre un hueco entre copas no lo explica nada. Ahora ese estrato está
  // OCUPADO. Media docena de aves cruzan el rodal a altura de dosel y de
  // emergentes, y cuando una fuente de dosel canta, la vela sale PREFERENTE-
  // MENTE del ave que esté pasando: primero se ve al que habla, después se ve
  // lo que dijo. Eso es lo que justifica la capa.
  //
  // Cada ave son dos segmentos en V —las alas— que baten. No hace falta más:
  // a esta escala una V que se abre y se cierra mientras se desplaza se lee
  // como vuelo inequívocamente, y cuesta doce vértices por ave.
  _buildBirds() {
    const N = Antifonia.BIRDS;
    const pos = new Float32Array(N * 4 * 3);   // 2 segmentos = 4 vértices
    const col = new Float32Array(N * 4 * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this._birdGeo = g;
    this._birdMesh = new THREE.LineSegments(g, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.9,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this._birdMesh.frustumCulled = false;
    this.scene.add(this._birdMesh);

    this.birds = [];
    for (let i = 0; i < N; i++) this.birds.push(this._spawnBird(true));
  }

  _spawnBird(initial) {
    const W = Antifonia.PLOT;
    const a = Math.random() * Math.PI * 2;
    const R = W * (1.25 + Math.random() * 0.5);
    // entra por un lado y sale por el otro, con una desviación lateral
    const from = { x: Math.cos(a) * R, z: Math.sin(a) * R };
    const off = (Math.random() * 2 - 1) * W * 0.55;
    const to = { x: -from.x + Math.cos(a + Math.PI / 2) * off,
                 z: -from.z + Math.sin(a + Math.PI / 2) * off };
    const agl = 14 + Math.random() * 26;          // dosel a emergentes
    return {
      x: from.x, z: from.z, tx: to.x, tz: to.z,
      agl, y: this._yFromAGL(agl),
      t: initial ? Math.random() : 0,
      speed: 0.028 + Math.random() * 0.036,
      flap: Math.random() * 6.28,
      flapRate: 7 + Math.random() * 5,
      size: 0.16 + Math.random() * 0.13,
      lit: 0,
    };
  }

  _updateBirds(dt) {
    if (!this.birds || !this._birdGeo) return;
    const pos = this._birdGeo.attributes.position.array;
    const col = this._birdGeo.attributes.color.array;
    const P = Antifonia.PALETTE;
    const base = new THREE.Color(P.ivory);
    const hot = new THREE.Color(P.bioHi);
    const cam = this.camera;

    // Sólo vuelan cuando hay aves en su hora: al mediodía y de noche el cielo
    // se vacía, que es la mitad del sentido de tener un reloj circadiano.
    let birdHour = 0;
    for (const src of Antifonia.SOURCES) {
      if (src.cls !== "biofonia") continue;
      if (src.stratum !== "dosel" && src.stratum !== "emergentes") continue;
      birdHour = Math.max(birdHour, this._circadian(src, this.hour));
    }

    for (let i = 0; i < this.birds.length; i++) {
      const b = this.birds[i];
      b.t += dt * b.speed * (0.45 + birdHour * 1.1);
      b.flap += dt * b.flapRate;
      b.lit *= Math.exp(-dt * 2.2);
      if (b.t >= 1) { this.birds[i] = this._spawnBird(false); continue; }

      const x = b.x + (b.tx - b.x) * b.t;
      const z = b.z + (b.tz - b.z) * b.t;
      // sube y baja en el trayecto, como cualquier vuelo real
      const y = b.y + Math.sin(b.t * Math.PI) * 0.35 + Math.sin(b.flap * 0.31) * 0.06;
      b.px = x; b.pz = z; b.py = y;

      // las alas se abren y cierran; de canto a la cámara
      const yaw = Math.atan2(cam.position.x - x, cam.position.z - z);
      const ux = Math.cos(yaw), uz = -Math.sin(yaw);
      const beat = Math.sin(b.flap);
      const wx = b.size, wy = b.size * 0.72 * beat;

      const o = i * 12;
      // ala izquierda: punta → cuerpo
      pos[o + 0] = x - ux * wx; pos[o + 1] = y + wy; pos[o + 2] = z - uz * wx;
      pos[o + 3] = x;           pos[o + 4] = y;      pos[o + 5] = z;
      // ala derecha: cuerpo → punta
      pos[o + 6] = x;           pos[o + 7] = y;      pos[o + 8] = z;
      pos[o + 9] = x + ux * wx; pos[o + 10] = y + wy; pos[o + 11] = z + uz * wx;

      const vis = Math.sin(Math.min(1, b.t) * Math.PI) ** 0.35;   // entra y sale
      const c = base.clone().lerp(hot, Math.min(1, b.lit));
      const k = (0.62 + birdHour * 0.75 + b.lit * 1.5) * vis;
      for (let v = 0; v < 4; v++) {
        col[o + v * 3 + 0] = c.r * k;
        col[o + v * 3 + 1] = c.g * k;
        col[o + v * 3 + 2] = c.b * k;
      }
    }
    this._birdGeo.attributes.position.needsUpdate = true;
    this._birdGeo.attributes.color.needsUpdate = true;
  }

  // Un ave que esté cruzando y sea plausible para esta fuente. Es lo que hace
  // que la vela tenga de dónde salir en vez de aparecer en el vacío.
  _birdFor(src) {
    if (!this.birds || src.cls !== "biofonia") return null;
    if (src.stratum !== "dosel" && src.stratum !== "emergentes") return null;
    const cand = this.birds.filter((b) => b.px !== undefined && b.t > 0.12 && b.t < 0.88);
    if (cand.length === 0) return null;
    const b = cand[(Math.random() * cand.length) | 0];
    b.lit = 1;
    return b;
  }

  // ══ aulladores rojos ═══════════════════════════════════════════════════
  //
  // Alouatta seniculus, dos, en la copa de la ceiba. Se desplazan por las
  // ramas —arco de un punto a otro dentro de la copa, con pausas largas,
  // porque un aullador pasa la mayor parte del día quieto— y cuando la fuente
  // "aullador" canta, la vela sale del que esté más arriba.
  //
  // Se dibuja el cuerpo, la cabeza y la COLA PREHENSIL, que es lo que hace
  // reconocible a un mono del Nuevo Mundo a cualquier distancia: la curva de
  // la cola cuenta más que la silueta del cuerpo. Rojo apagado, como el
  // animal.
  // ── Silueta dibujada ────────────────────────────────────────────────────
  // Un THREE.Line NO puede ser una silueta. WebGL fija
  // ALIASED_LINE_WIDTH_RANGE en [1,1] en todos los destinos de escritorio, y
  // `linewidth` de LineBasicMaterial se ignora — por eso existen Line2 y
  // LineMaterial. El aullador anterior eran doce trazos rojos SUELTOS de un
  // píxel de ancho: agrandarlo de 0.055 a 0.17 sólo separó más los mismos
  // pelos, nunca hizo un cuerpo. Y la mezcla aditiva sobre una nube de puntos
  // blanca desteñía el rojo hacia el blanco, que es por qué hubo que subir el
  // brillo base a 1.25 sólo para que se notara algo.
  //
  // ── Fauna en puntos, como el resto del barrido ──────────────────────────
  // No una silueta rellena: un ANIMAL DE PUNTOS, en el mismo blanco fósforo
  // que los árboles. Todo lo que hay en esta escena es un retorno del mismo
  // escaneo, y un bicho pintado de rojo encima delataba que estaba puesto a
  // mano. Un animal cazado por el haz es una nube densa con forma de animal, y
  // eso es lo que se construye aquí.
  //
  // Se genera UNA VEZ en coordenadas locales y luego sólo se mueve el objeto:
  // ni un vértice se reescribe por cuadro, igual que el rodal.
  //
  // La escala está EXAGERADA a propósito. Un aullador mide ~0.6 m de cuerpo,
  // que a 0.18 unidades por metro son 0.11 unidades — invisible en un rodal de
  // ±9. Se dibuja a ~0.7 unidades (unos 4 m de equivalente) porque la
  // alternativa honesta es que no se vea, y un animal que no se ve no está.
  _faunaPoints(kind, rnd) {
    const pos = [];
    const col = [];
    const put = (x, y, z, intensity) => {
      pos.push(x, y, z);
      // Mismo fósforo que la nube: casi blanco con sesgo verde-cian.
      const i = Math.max(0.2, Math.min(1, intensity));
      col.push(0.80 * i + 0.10, 0.97 * i + 0.06, 0.90 * i + 0.10);
    };
    // nube elipsoidal: cáscara, no volumen — un haz roza la superficie
    const blob = (cx, cy, cz, rx, ry, rz, n, inten) => {
      for (let i = 0; i < n; i++) {
        const u = rnd() * Math.PI * 2;
        const v = Math.acos(2 * rnd() - 1);
        const t = 0.78 + rnd() * 0.22;
        put(cx + Math.cos(u) * Math.sin(v) * rx * t,
            cy + Math.cos(v) * ry * t,
            cz + Math.sin(u) * Math.sin(v) * rz * t,
            inten * (0.75 + rnd() * 0.35));
      }
    };
    // hilera de puntos a lo largo de una curva — colas, patas, cuello
    const limb = (fn, n, jitter, inten) => {
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const q = fn(t);
        put(q[0] + (rnd() - 0.5) * jitter,
            q[1] + (rnd() - 0.5) * jitter,
            q[2] + (rnd() - 0.5) * jitter,
            inten * (0.8 + rnd() * 0.3));
      }
    };

    if (kind === "howler") {
      // Alouatta seniculus, encorvado sobre la rama.
      blob(0, 0, 0, 0.20, 0.15, 0.14, 130, 0.62);          // cuerpo
      blob(0.24, 0.10, 0, 0.10, 0.10, 0.09, 60, 0.78);     // cabeza
      blob(0.30, 0.03, 0, 0.07, 0.06, 0.06, 34, 0.85);     // mandíbula (hioides)
      // COLA PREHENSIL enroscada — es lo que hace legible a un mono del Nuevo
      // Mundo a cualquier distancia, así que lleva el doble de puntos que una
      // pata y se enrosca de verdad.
      limb((t) => {
        const a = t * Math.PI * 1.7;
        const r = 0.26 * (1 - t * 0.45);
        return [-0.18 - t * 0.10, -0.02 + Math.sin(a) * r * 0.75, Math.cos(a) * r * 0.5 - 0.13];
      }, 80, 0.022, 0.72);
      // brazos agarrados a la rama
      limb((t) => [0.10 - t * 0.02, -0.13 - t * 0.16, 0.10], 22, 0.02, 0.6);
      limb((t) => [-0.02 - t * 0.02, -0.13 - t * 0.15, -0.10], 22, 0.02, 0.6);
    } else if (kind === "paujil") {
      // Crax alberti — cuerpo pesado, cuello erguido, cresta rizada.
      blob(0, 0, 0, 0.20, 0.14, 0.13, 110, 0.60);          // cuerpo
      limb((t) => [0.13 + t * 0.06, 0.10 + t * 0.20, 0], 26, 0.02, 0.68);  // cuello
      blob(0.20, 0.32, 0, 0.07, 0.06, 0.06, 40, 0.80);     // cabeza
      limb((t) => [0.26 + t * 0.09, 0.31, 0], 10, 0.012, 0.9);             // pico
      // cresta rizada, el rasgo que le da el nombre
      for (let k = 0; k < 5; k++) {
        limb((t) => [0.17 + k * 0.012 - t * 0.03,
                     0.38 + t * 0.10,
                     (k - 2) * 0.014 + Math.sin(t * 4) * 0.012], 9, 0.008, 0.85);
      }
      limb((t) => [-0.03, -0.13 - t * 0.16, 0.045], 18, 0.015, 0.62);      // patas
      limb((t) => [0.03, -0.13 - t * 0.16, -0.045], 18, 0.015, 0.62);
      limb((t) => [-0.20 - t * 0.20, 0.02 + t * 0.10, 0], 30, 0.025, 0.55); // cola
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({
      size: 0.030, sizeAttenuation: true, vertexColors: true,
      transparent: true, opacity: 0.95, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    // Un pelín más grande que el punto del rodal (0.020) para que el animal
    // lea como un retorno MÁS DENSO y no se disuelva en el follaje.
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    pts.renderOrder = 500;
    return pts;
  }

  _buildHowlers() {
    const N = Antifonia.HOWLERS;
    // La ceiba, para saber dónde están las ramas.
    this._ceiba = (this._trees || []).find((t) => t.kind === "ceiba") || null;
    this.howlers = [];
    this._howlerSprites = [];
    for (let i = 0; i < N; i++) {
      const h = this._spawnHowler(i);
      const spr = this._faunaPoints("howler", this._rnd0 || this._rng(11));
      this.scene.add(spr);
      this._howlerSprites.push(spr);
      this.howlers.push(h);
    }
  }

  _spawnHowler(i) {
    const c = this._ceiba;
    const cx = c ? c.x : 0, cz = c ? c.z : 0, cr = c ? c.r : 2;
    const pick = () => {
      const a = Math.random() * Math.PI * 2;
      const rr = (0.25 + Math.random() * 0.7) * cr;
      return {
        x: cx + Math.cos(a) * rr,
        z: cz + Math.sin(a) * rr,
        // dentro de la copa: entre el arranque de las bandejas y la cima
        agl: 24 + Math.random() * 15,
      };
    };
    const from = pick(), to = pick();
    return {
      from, to, t: Math.random(),
      // Lento. Un aullador se mueve poco y descansa mucho; esto es lo que
      // separa un mono de un pájaro a simple vista.
      speed: 0.018 + Math.random() * 0.022,
      pause: Math.random() * 6,
      lit: 0,
      px: cx, pz: cz, py: 0,
    };
  }

  _updateHowlers(dt) {
    if (!this.howlers || !this._howlerSprites) return;
    for (let i = 0; i < this.howlers.length; i++) {
      const h = this.howlers[i];
      const spr = this._howlerSprites[i];
      if (!spr) continue;
      h.lit *= Math.exp(-dt * 1.4);
      if (h.pause > 0) {
        h.pause -= dt;                       // quieto en la rama
      } else {
        h.t += dt * h.speed;
        if (h.t >= 1) {
          h.from = h.to;
          h.to = this._spawnHowler(i).to;
          h.t = 0;
          h.pause = 2 + Math.random() * 8;   // descansa al llegar
        }
      }
      const e = h.t * h.t * (3 - 2 * h.t);    // arranque y frenado suaves
      const agl = h.from.agl + (h.to.agl - h.from.agl) * e;
      const x = h.from.x + (h.to.x - h.from.x) * e;
      const z = h.from.z + (h.to.z - h.from.z) * e;
      // se descuelga entre rama y rama en vez de flotar en línea recta
      const sag = Math.sin(Math.PI * h.t) * 1.6;
      const y = this._yFromAGL(agl) - sag * 0.12;
      h.px = x; h.pz = z; h.py = y; h.agl = agl;

      spr.position.set(x, y, z);
      // Orientado según hacia dónde va: es un objeto 3-D en la escena, no un
      // cartel que mira a la cámara. Un animal de puntos puede girar.
      const dx = h.to.x - h.from.x, dz = h.to.z - h.from.z;
      if (dx * dx + dz * dz > 1e-6) spr.rotation.y = Math.atan2(dx, dz) - Math.PI / 2;
      // Al aullar los retornos se avivan y el punto engorda: el rugido de un
      // Alouatta se oye a 3 km, conviene ver quién lo está haciendo.
      // 0.85: un 15 % más pequeño. La escala del OBJETO no toca el tamaño del
      // punto (PointsMaterial atenúa por distancia, no por transform), así que
      // el animal encoge pero sus retornos siguen midiendo lo mismo que los del
      // rodal — que es justo como se comportaría un barrido real.
      const sc = 0.85 * (1 + h.lit * 0.22);
      spr.scale.set(sc, sc, sc);
      spr.material.opacity = 0.72 + h.lit * 0.28;
      spr.material.size = 0.030 + h.lit * 0.022;
    }
  }

  // El aullador que esté más alto canta. Devuelve su posición para que la vela
  // salga de él y no de una percha genérica.
  _howlerFor(src) {
    if (src.key !== "aullador" || !this.howlers || this.howlers.length === 0) return null;
    let best = null;
    for (const h of this.howlers) {
      if (h.py === undefined) continue;
      if (!best || h.py > best.py) best = h;
    }
    if (!best) return null;
    best.lit = 1;
    return best;
  }

  // ══ suelo: paujil y arrieras ═══════════════════════════════════════════
  //
  // El estrato del suelo tenía nombre y nada dentro. Estos dos lo habitan, y
  // se mueven de maneras opuestas a propósito: el paujil camina y se detiene,
  // la fila de arrieras no se detiene nunca. Entre los dos el suelo deja de
  // ser una superficie y pasa a ser un sitio donde ocurre algo.
  _buildGroundFauna(rnd) {
    const W = Antifonia.PLOT;
    // ── Paujil ────────────────────────────────────────────────────────────
    this.paujiles = [];
    this._paujilSprites = [];
    for (let i = 0; i < Antifonia.PAUJILES; i++) {
      const spr = this._faunaPoints("paujil", this._rnd0 || this._rng(23));
      this.scene.add(spr);
      this._paujilSprites.push(spr);
      this.paujiles.push(this._spawnPaujil());
    }

    // ── Camino de arrieras ────────────────────────────────────────────────
    // Del hormiguero a un árbol. Las hormigas son puntos que recorren el
    // camino a distinta fase, así que la fila se lee como un flujo continuo
    // y no como bichos sueltos.
    const trees = (this._trees || []).filter((t) => t.kind !== "palma");
    const target = trees.length ? trees[(rnd() * trees.length) | 0] : { x: 2, z: 2 };
    const na = rnd() * Math.PI * 2;
    const nr = (0.35 + rnd() * 0.4) * W;
    this._antNest = { x: Math.cos(na) * nr, z: Math.sin(na) * nr };
    this._antTarget = { x: target.x, z: target.z };
    // Camino con una comba, no una recta: las arrieras siguen el terreno.
    this._antBow = (rnd() - 0.5) * W * 0.35;

    const N = Antifonia.ANTS;
    const apos = new Float32Array(N * 3);
    const ageo = new THREE.BufferGeometry();
    ageo.setAttribute("position", new THREE.BufferAttribute(apos, 3));
    this._antGeo = ageo;
    this._antPoints = new THREE.Points(ageo, new THREE.PointsMaterial({
      // Fósforo, como todo lo demás: la fila es un retorno más del barrido.
      color: new THREE.Color("#DCEFE4"), size: 0.030, sizeAttenuation: true,
      transparent: true, opacity: 0.8, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    this._antPoints.frustumCulled = false;
    this.scene.add(this._antPoints);
    this.ants = [];
    for (let i = 0; i < N; i++) {
      this.ants.push({ t: i / N, dir: (i % 5 === 0) ? -1 : 1, sp: 0.028 + rnd() * 0.022 });
    }
  }

  _spawnPaujil() {
    const W = Antifonia.PLOT;
    const pick = () => {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * W * 0.75;
      return { x: Math.cos(a) * r, z: Math.sin(a) * r };
    };
    return {
      from: pick(), to: pick(), t: Math.random(),
      speed: 0.05 + Math.random() * 0.05,
      pause: Math.random() * 5, lit: 0,
      px: 0, pz: 0, py: 0,
    };
  }

  _antAt(t) {
    // Bézier cuadrática nido → árbol, con la comba en el punto de control.
    const n = this._antNest, g = this._antTarget, b = this._antBow;
    const mx = (n.x + g.x) * 0.5 - (g.z - n.z) * 0.001 * b * 40;
    const mz = (n.z + g.z) * 0.5 + (g.x - n.x) * 0.001 * b * 40;
    const u = 1 - t;
    return {
      x: u * u * n.x + 2 * u * t * mx + t * t * g.x,
      z: u * u * n.z + 2 * u * t * mz + t * t * g.z,
    };
  }

  _updateGroundFauna(dt) {
    // ── Paujil: camina y se para ──────────────────────────────────────────
    if (this.paujiles && this._paujilSprites) {
      for (let i = 0; i < this.paujiles.length; i++) {
        const p = this.paujiles[i], spr = this._paujilSprites[i];
        if (!spr) continue;
        p.lit *= Math.exp(-dt * 1.5);
        if (p.pause > 0) { p.pause -= dt; }
        else {
          p.t += dt * p.speed;
          if (p.t >= 1) {
            p.from = p.to; p.to = this._spawnPaujil().to;
            p.t = 0; p.pause = 1.5 + Math.random() * 5;
          }
        }
        const e = p.t * p.t * (3 - 2 * p.t);
        const x = p.from.x + (p.to.x - p.from.x) * e;
        const z = p.from.z + (p.to.z - p.from.z) * e;
        // paso: un ave que camina cabecea, no flota
        const bob = (p.pause > 0) ? 0 : Math.abs(Math.sin(p.t * 40)) * 0.05;
        const y = this._yFromAGL(1.1) + bob;
        p.px = x; p.pz = z; p.py = y;
        spr.position.set(x, y, z);
        const pdx = p.to.x - p.from.x, pdz = p.to.z - p.from.z;
        if (pdx * pdx + pdz * pdz > 1e-6) spr.rotation.y = Math.atan2(pdx, pdz) - Math.PI / 2;
        const sc = 1 + p.lit * 0.25;
        spr.scale.set(sc, sc, sc);
        spr.material.opacity = 0.66 + p.lit * 0.34;
        spr.material.size = 0.028 + p.lit * 0.020;
      }
    }

    // ── Arrieras: la fila nunca se detiene ────────────────────────────────
    if (this.ants && this._antGeo) {
      const arr = this._antGeo.attributes.position.array;
      const yGround = this._yFromAGL(0.35);
      let lead = 0;
      for (let i = 0; i < this.ants.length; i++) {
        const a = this.ants[i];
        a.t += dt * a.sp * a.dir;
        if (a.t > 1) a.t -= 1;
        if (a.t < 0) a.t += 1;
        const q = this._antAt(a.t);
        arr[i * 3 + 0] = q.x;
        arr[i * 3 + 1] = yGround + Math.sin(a.t * 60 + i) * 0.012;
        arr[i * 3 + 2] = q.z;
        if (i === 0) lead = a.t;
      }
      this._antGeo.attributes.position.needsUpdate = true;
      // Dónde va la cabeza de la fila — el micelio lo usa para encenderse por
      // donde pasan, que es literalmente lo que hacen: Atta cultiva hongo.
      const head = this._antAt(lead);
      this._antHead = head;
      this._antPoints.material.opacity =
        0.5 + 0.35 * Math.max(0, Math.min(1, (this.ctl.dens ?? 0.4)));
    }
  }

  // Percha de suelo: el paujil canta desde donde está caminando.
  _groundFor(src) {
    if (src.key === "paujil" && this.paujiles && this.paujiles.length) {
      const p = this.paujiles[(Math.random() * this.paujiles.length) | 0];
      p.lit = 1;
      return { px: p.px, pz: p.pz, py: p.py, agl: 1.1 };
    }
    if (src.key === "arriera" && this._antHead) {
      const h = this._antHead;
      return { px: h.x, pz: h.z, py: this._yFromAGL(0.35), agl: 0.35 };
    }
    return null;
  }

  // ══ micelio ════════════════════════════════════════════════════════════
  //
  // La RED MICORRÍCICA era el único estrato rotulado y vacío: un nombre
  // colgando bajo un suelo donde no pasaba nada. Ahora corre por debajo una
  // red de hifas que enlaza los árboles entre sí y SIGUE MÁS ALLÁ del rodal,
  // saliéndose del encuadre por los cuatro lados.
  //
  // Que se salga no es un descuido de composición: es la afirmación. El
  // micelio no reconoce el límite de la parcela ni el del viewport — la
  // unidad que el ojo cree estar mirando (este rodal, este cuadro) es un
  // recorte administrativo sobre algo continuo. El bosque de arriba se puede
  // enmarcar; el de abajo, no. Por eso los filamentos no se detienen en el
  // borde amorfo del suelo: lo atraviesan y se van.
  //
  // Se dibuja como LineSegments con mezcla aditiva: una sola geometría, un
  // draw call, y el pulso se hace moviendo la opacidad del material — nada
  // por vértice.
  _buildMycelium(rnd, W) {
    // Un par de arreglos por sub-red. Se agrupan las raíces de tres en tres,
    // que da ~7 sub-redes con la semilla actual: suficientes para que se vea
    // tráfico, pocas para que cada una siga siendo una red y no un hilo.
    const NETS = 7;
    const netPos = Array.from({ length: NETS }, () => []);
    const netCol = Array.from({ length: NETS }, () => []);
    const netCx = new Array(NETS).fill(0), netCz = new Array(NETS).fill(0);
    const netN = new Array(NETS).fill(0);
    let curNet = 0;
    const pos = [];
    const col = [];
    const yOf = (agl) => this._yFromAGL(agl);
    const P = Antifonia.PALETTE;
    const warm = new THREE.Color(P.fungal ?? "#B5733C");
    const cool = new THREE.Color(P.term);

    // Cada hifa parte de la base de un árbol —el simbionte tiene con quién
    // asociarse— o de un punto al azar, y camina con giro browniano,
    // ramificándose. Se le deja rebasar el radio del rodal a propósito.
    // Una de cada cuatro raíces, no todas. Con un árbol por hifa la red salía
    // tan tupida que se volvía el sujeto del cuadro y el bosque quedaba de
    // fondo — al revés de lo que debe leerse. Lo que importa del micelio aquí
    // es que ALCANCE, no que llene.
    const roots = [];
    for (let i = 0; i < this._trees.length; i += 4) {
      roots.push([this._trees[i].x, this._trees[i].z]);
    }
    for (let i = 0; i < 5; i++) {
      const a = rnd() * Math.PI * 2;
      roots.push([Math.cos(a) * rnd() * W * 0.7, Math.sin(a) * rnd() * W * 0.7]);
    }

    const walk = (x, z, ang, life, depth) => {
      let cx = x, cz = z, ca = ang;
      const step = 0.16 + rnd() * 0.13;
      for (let i = 0; i < life; i++) {
        // giro browniano con una leve deriva hacia afuera: la red se expande
        const outward = Math.atan2(cz, cx);
        ca += (rnd() - 0.5) * 0.85 + Math.sin(outward - ca) * 0.045;
        const nx = cx + Math.cos(ca) * step;
        const nz = cz + Math.sin(ca) * step;
        // profundidad: justo bajo la hojarasca, ondulando en el subsuelo
        const d0 = -0.25 - Math.sin(i * 0.31 + x) * 0.35;
        const d1 = -0.25 - Math.sin((i + 1) * 0.31 + x) * 0.35;
        netPos[curNet].push(cx, yOf(d0), cz, nx, yOf(d1), nz);
        netCx[curNet] += cx; netCz[curNet] += cz; netN[curNet] += 1;
        // Se apaga con la distancia al centro, PERO nunca del todo: el trozo
        // que sale del cuadro tiene que seguir visible al borde, o el efecto
        // se convierte en un disco recortado y se pierde el sentido.
        const rr = Math.hypot(nx, nz) / W;
        const fade = Math.max(0.10, 1 - rr * 0.68) * (depth === 0 ? 1 : 0.55);
        const c = warm.clone().lerp(cool, Math.min(1, rr * 0.5));
        netCol[curNet].push(c.r * fade, c.g * fade, c.b * fade,
                            c.r * fade, c.g * fade, c.b * fade);
        cx = nx; cz = nz;
        // ramificación
        if (depth < 2 && rnd() < 0.055) {
          walk(cx, cz, ca + (rnd() < 0.5 ? 1 : -1) * (0.5 + rnd() * 0.7),
               Math.round(life * 0.55), depth + 1);
        }
        // se deja correr bien más allá del rodal antes de rendirse
        if (Math.hypot(cx, cz) > W * 1.85) break;
      }
    };

    for (let ri = 0; ri < roots.length; ri++) {
      const [rx, rz] = roots[ri];
      curNet = Math.min(NETS - 1, (ri / Math.max(1, roots.length)) * NETS | 0);
      const n = 1 + ((rnd() * 2) | 0);
      for (let k = 0; k < n; k++) {
        walk(rx, rz, rnd() * Math.PI * 2, 40 + ((rnd() * 46) | 0), 0);
      }
    }

    // ── Sub-redes ─────────────────────────────────────────────────────────
    // Era UNA sola LineSegments con un material, así que sólo podía respirar
    // como un cuerpo entero, y el "pulso" que tenía era un seno libre atado a
    // nada. Ahora se parte por grupos de raíces: cada trozo lleva su propio
    // material y se enciende por su cuenta, de modo que la red se lee
    // TRANSPORTANDO algo en vez de latir toda a la vez.
    //
    // No se hace por color de vértice: reescribir ~9000 segmentos por cuadro
    // son ~200 KB de subida por frame, unas 350 veces el tráfico de los
    // pájaros y los monos juntos, y justo el gasto que haría al LOD adaptativo
    // empezar a comerse el bosque para pagarlo. N escrituras de opacidad no
    // cuestan nada; N draw calls se pagan una vez, no por cuadro.
    for (let k = 0; k < NETS; k++) {
      if (netN[k] > 0) { netCx[k] /= netN[k]; netCz[k] /= netN[k]; }
    }
    this._mycoNets = [];
    this._mycoSegs = 0;
    for (let k = 0; k < netPos.length; k++) {
      if (netPos[k].length === 0) continue;
      const gk = new THREE.BufferGeometry();
      gk.setAttribute("position", new THREE.Float32BufferAttribute(netPos[k], 3));
      gk.setAttribute("color", new THREE.Float32BufferAttribute(netCol[k], 3));
      const mk = new THREE.LineBasicMaterial({
        vertexColors: true, transparent: true, opacity: 0.15,
        depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const line = new THREE.LineSegments(gk, mk);
      line.frustumCulled = false;
      this.scene.add(line);
      // Cada sub-red escucha una banda distinta del espectro real, con peso
      // hacia lo GRAVE: el micelio está bajo tierra y lo que se oye ahí es el
      // drone y el bombo. Así distintos caminos se encienden con distintas
      // partes del sonido.
      const f = k / Math.max(1, netPos.length - 1);
      this._mycoNets.push({
        line, mat: mk,
        band: [f * 0.30, 0.14 + f * 0.42],   // 0-14% … 30-56% del espectro
        lit: 0,
        // centro aproximado, para que la fila de arrieras encienda la que pisa
        cx: netCx[k], cz: netCz[k],
      });
      this._mycoSegs += netPos[k].length / 6;
    }
  }

  // El árbol común del bosque seco: gusanero, indio desnudo, guayacán,
  // algarrobo. Sin firma arquitectónica propia —copa redondeada irregular,
  // 12–22 m— y por eso mismo indispensable: son ellos los que hacen la MASA
  // del dosel. Un rodal de puras siluetas famosas parece un catálogo; el
  // bosque es mayoritariamente esto, y la ceiba destaca porque ellos están.
  _tree_arbol(rnd, cx, cz, scale) {
    const put = this._putRef;
    const M = Antifonia.M;
    const H = (13 + rnd() * 9) * scale;
    const fork = H * (0.30 + rnd() * 0.16);
    const R = (5.5 + rnd() * 3.5) * scale * M;
    const S = Antifonia.CLOUD.scale;

    const nBole = Math.round(120 * S);
    for (let i = 0; i < nBole; i++) {
      const t = rnd();
      const r = (0.55 - t * 0.18) * scale * M;
      const a = rnd() * Math.PI * 2;
      put(cx + Math.cos(a) * r, t * fork + 0.1, cz + Math.sin(a) * r, 0.60 + rnd() * 0.30);
    }

    // Copa irregular: tres o cuatro lóbulos desplazados del eje, no una
    // esfera. La asimetría es lo que impide que se lean como clones.
    const lobes = 3 + ((rnd() * 2) | 0);
    const cxo = [], czo = [], cro = [], cyo = [];
    for (let l = 0; l < lobes; l++) {
      const a = rnd() * Math.PI * 2;
      const d = rnd() * R * 0.45;
      cxo.push(Math.cos(a) * d); czo.push(Math.sin(a) * d);
      cro.push(R * (0.55 + rnd() * 0.5));
      cyo.push(fork + (H - fork) * (0.35 + rnd() * 0.5));
    }
    const n = Math.round(1350 * S);
    for (let i = 0; i < n; i++) {
      const l = (rnd() * lobes) | 0;
      const a = rnd() * Math.PI * 2;
      // cáscara: el follaje vive en la superficie de la copa, no en su volumen
      const t = 0.72 + rnd() * 0.28;
      const rr = cro[l] * t;
      const ph = Math.acos(1 - rnd() * 1.25);           // sesgo hacia arriba
      put(cx + cxo[l] + Math.cos(a) * rr * Math.sin(ph),
          cyo[l] + Math.cos(ph) * (H - fork) * 0.42 * t,
          cz + czo[l] + Math.sin(a) * rr * Math.sin(ph),
          0.16 + rnd() * 0.26);
    }
    this._trees.push({ kind: "arbol", x: cx, z: cz, h: H, r: R });
  }

  // Attalea butyracea — palma de vino. Estípite columnar delgadísimo y una
  // corona de hojas que nacen todas del ápice y se arquean: un plumero. Es la
  // arquitectura más fácil de reconocer en una nube de puntos.
  _tree_palma(rnd, cx, cz, scale) {
    const put = this._putRef;
    const M = Antifonia.M;
    const H = 17 * scale, crown = 13.5 * scale;
    const S = Antifonia.CLOUD.scale;

    // estípite: columna regular, anillada
    const nStipe = Math.round(230 * S);
    for (let i = 0; i < nStipe; i++) {
      const h = rnd() * crown;
      const a = rnd() * Math.PI * 2;
      const r = 0.30 * scale * M * (1 + Math.sin(h * 3.1) * 0.07);   // anillos
      put(cx + Math.cos(a) * r, h + 0.1, cz + Math.sin(a) * r, 0.70 + rnd() * 0.28);
    }
    // corona: hojas pinnadas que salen del ápice, se elevan y luego caen
    const fronds = 15 + ((rnd() * 6) | 0);
    for (let f = 0; f < fronds; f++) {
      const a = (f / fronds) * Math.PI * 2 + rnd() * 0.22;
      // La hoja mide lo mismo en las dos direcciones, pero la horizontal va en
      // unidades y la vertical en metros — de ahí las dos variables.
      const lenM = (4.4 + rnd() * 2.4) * scale;
      const lenU = lenM * M;
      const lift = 0.55 + rnd() * 0.55;
      const n = Math.round(120 * S);
      for (let i = 0; i < n; i++) {
        const t = Math.pow(rnd(), 0.8);
        const r = t * lenU;
        // arco: sube al principio, cae al final
        const dy = lenM * (lift * Math.sin(t * Math.PI * 0.85) - 1.05 * t * t);
        // folíolos: dispersión perpendicular al raquis
        const spread = (rnd() - 0.5) * 0.95 * scale * M * (0.35 + t);
        const px = cx + Math.cos(a) * r - Math.sin(a) * spread;
        const pz = cz + Math.sin(a) * r + Math.cos(a) * spread;
        put(px, crown + dy + (H - crown) * 0.35, pz, 0.16 + rnd() * 0.28);
      }
    }
    this._trees.push({ kind: "palma", x: cx, z: cz, h: H, r: 5 * scale * M });
  }

  _textSprite(label, sub, idx) {
    const P = Antifonia.PALETTE;
    const cv = document.createElement("canvas");
    cv.width = 512; cv.height = 128;
    const g = cv.getContext("2d");
    g.clearRect(0, 0, 512, 128);
    g.font = "600 40px 'Share Tech Mono', ui-monospace, monospace";
    g.fillStyle = P.ivory;
    g.textAlign = "right";
    g.fillText(label, 500, 52);
    g.font = "300 26px 'Share Tech Mono', ui-monospace, monospace";
    g.fillStyle = P.gridHi;
    g.fillText(sub, 500, 92);
    const tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.LinearFilter;
    this._labelTexes.push(tex);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, opacity: 0.62, depthWrite: false,
    }));
    spr.scale.set(4.6, 1.15, 1);
    spr.userData.stratum = idx;
    return spr;
  }

  // Una sola InstancedMesh para TODOS los glifos. El presupuesto de ciclos de
  // máquina es explícito: el pool se reserva una vez, nada se crea por cuadro,
  // y las llamadas que exceden el pool simplemente no se dibujan (la más vieja
  // ya se estará apagando).
  // ── Velas ───────────────────────────────────────────────────────────────
  // Cada llamada se dibuja como una VELA JAPONESA, la del gráfico bursátil:
  // cuerpo grueso entre apertura y cierre, mechas finas hasta el máximo y el
  // mínimo. Aquí el "precio" es la frecuencia:
  //     mecha superior  → highHz, el armónico más alto que alcanzó
  //     cuerpo          → la banda donde vive la energía
  //     mecha inferior  → lowHz, el fundamental
  //     cuerpo lleno/hueco → si la llamada subió o bajó respecto a la
  //                          anterior de su especie (la "sesión" previa)
  //
  // No es un chiste gráfico. Este motor ya sonifica una cadena de bloques;
  // poner al bosque en el mismo instrumento con el que se cotiza una divisa
  // es decir en voz alta lo que hace el aparato entero: intentar medir la
  // naturaleza en tiempo real, con la herramienta equivocada, y dejar que se
  // vea la costura. Las velas van INMERSAS en el dosel, a la altura desde la
  // que se cantó, no en un panel aparte.
  //
  // Dos InstancedMesh (cuerpos y mechas) en vez de una: dos draw calls para
  // todo el parlamento, y el índice de instancia es el mismo en ambas.
  _buildGlyphs() {
    const geo = new THREE.PlaneGeometry(1, 1);
    const mkMat = () => new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.95,
      depthWrite: false, side: THREE.DoubleSide,
    });
    const mk = () => {
      const m = new THREE.InstancedMesh(geo, mkMat(), Antifonia.GLYPH_POOL);
      m.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(Antifonia.GLYPH_POOL * 3), 3
      );
      m.frustumCulled = false;
      return m;
    };
    this._bodies = mk();
    this._wicks = mk();

    this._dummy = new THREE.Object3D();
    // Todo fuera de cuadro hasta que exista una llamada que lo ocupe.
    this._dummy.position.set(0, -9999, 0);
    this._dummy.updateMatrix();
    for (let i = 0; i < Antifonia.GLYPH_POOL; i++) {
      this._bodies.setMatrixAt(i, this._dummy.matrix);
      this._wicks.setMatrixAt(i, this._dummy.matrix);
    }
    this._bodies.instanceMatrix.needsUpdate = true;
    this._wicks.instanceMatrix.needsUpdate = true;
    this.scene.add(this._bodies);
    this.scene.add(this._wicks);

    // Último cierre por especie, para saber si la vela sube o baja.
    this._lastClose = new Map();
  }

  // La franja del nicho: 2-D detrás del lienzo WebGL, como hace Registro.js.
  _buildNiche() {
    const host = this.host;
    if (!host) return;
    if (getComputedStyle(host).position === "static") host.style.position = "relative";
    if (this.renderer) {
      this.renderer.setClearColor(new THREE.Color(Antifonia.PALETTE.bg), 0);
      this.renderer.domElement.style.position = "absolute";
      this.renderer.domElement.style.inset = "0";
      this.renderer.domElement.style.zIndex = "1";
    }
    const cv = document.createElement("canvas");
    cv.style.cssText =
      "position:absolute;left:0;right:0;bottom:0;width:100%;height:26%;" +
      "z-index:2;display:block;background:transparent;pointer-events:none;";
    host.appendChild(cv);
    this._nicheCv = cv;
    this._nicheCx = cv.getContext("2d");
  }

  _buildHUD() {
    const host = this.host;
    if (!host) return;
    const P = Antifonia.PALETTE;

    if (!document.getElementById("antifonia-font")) {
      const link = document.createElement("link");
      link.id = "antifonia-font";
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap";
      document.head.appendChild(link);
      this._fontLink = link;
    }

    const base =
      "position:absolute;z-index:30;pointer-events:none;" +
      "font-family:'Share Tech Mono',ui-monospace,monospace;" +
      "text-shadow:0 0 6px rgba(0,0,0,0.9);";

    this._hud = document.createElement("div");
    this._hud.style.cssText = base +
      `left:1.4vmin;top:1.2vmin;color:${P.term};font-size:calc(3px + 1.02vmin);line-height:1.5;`;
    host.appendChild(this._hud);

    // La leyenda dice qué bancada es cada color Y qué fuentes no tienen
    // grabación. Una falta declarada es una falta; una falta silenciosa es
    // un módulo que parece funcionar.
    this._legend = document.createElement("div");
    this._legend.style.cssText = base +
      `right:1.4vmin;top:1.2vmin;color:${P.ivory};font-size:calc(2px + 0.92vmin);` +
      "line-height:1.6;text-align:right;opacity:0.92;";
    host.appendChild(this._legend);
  }

  // ══ partitura ══════════════════════════════════════════════════════════

  // Carga anotaciones reales si existen; si no, genera la sesión desde las
  // fuentes de arriba. El módulo monta y suena igual en ambos casos — el
  // mismo patrón que PhenologicalCalendar con manakai_species.json.
  async _loadScore() {
    let data = null;
    try {
      if (typeof loadJson === "function") data = await loadJson("json/antifonia_calls.json");
    } catch (e) { data = null; }
    if (data && Array.isArray(data.events) && data.events.length > 0) {
      this._score = this._normalizeScore(data);
      this._scoreLabel = (data.meta && data.meta.site) ? String(data.meta.site) : "partitura";
    } else {
      this._score = null;
      this._scoreLabel = "generada";
    }
  }

  // Acepta el esquema documentado y rellena lo que falte, de modo que una
  // tabla de selecciones de Raven convertida a JSON entre sin ceremonia.
  _normalizeScore(data) {
    const out = [];
    const dur = Math.max(1, Number(data.meta && data.meta.durationSec) || 600);
    for (const e of data.events) {
      const src = this._srcByKey.get(String(e.species || "").toLowerCase()) || null;
      const lo = Number(e.lowHz);
      const hi = Number(e.highHz);
      const begin = Number(e.begin);
      if (!isFinite(begin)) continue;
      out.push({
        key: String(e.species || (src && src.key) || "cinta"),
        cls: String(e.class || (src && src.cls) || "biofonia"),
        smp: Number.isFinite(Number(e.sample)) ? Number(e.sample) : (src ? src.smp : -1),
        lo: isFinite(lo) ? lo : (src ? src.lo : 500),
        hi: isFinite(hi) ? hi : (src ? src.hi : 4000),
        heightAGL: isFinite(Number(e.heightAGL)) ? Number(e.heightAGL)
          : (src ? this._stratumMeters(src.stratum) : 6),
        x: isFinite(Number(e.x)) ? Number(e.x) : (Math.random() * 2 - 1),
        z: isFinite(Number(e.y)) ? Number(e.y) : (Math.random() * 2 - 1),
        dur: Math.max(0.15, (Number(e.end) - begin) || 1.0),
        // hora del día en la que cae dentro de la sesión
        hour: (begin / dur) * 24,
      });
    }
    out.sort((a, b) => a.hour - b.hour);
    return out;
  }

  _stratumMeters(key) {
    for (const st of Antifonia.STRATA) if (st.key === key) return st.mAGL;
    return 6;
  }

  // ══ mapeos ═════════════════════════════════════════════════════════════

  // Altura sobre el suelo → y de escena, interpolando entre estratos. Es la
  // pieza que mantiene a Antifonía, DarkForest y Estratos mirando el mismo
  // bosque: una llamada a 20 m cae en el dosel en los tres.
  _yFromAGL(m) {
    const S = Antifonia.STRATA;
    if (m >= S[0].mAGL) return S[0].y;
    for (let i = 0; i < S.length - 1; i++) {
      const a = S[i], b = S[i + 1];
      if (m <= a.mAGL && m >= b.mAGL) {
        const t = (m - b.mAGL) / Math.max(0.001, a.mAGL - b.mAGL);
        return b.y + t * (a.y - b.y);
      }
    }
    return S[S.length - 1].y;
  }

  _stratumIndexFromAGL(m) {
    const S = Antifonia.STRATA;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < S.length; i++) {
      const d = Math.abs(S[i].mAGL - m);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  // Ventana circadiana con envoltura sobre medianoche. Devuelve 0..1: cuán
  // dentro de su hora está esta fuente.
  _circadian(src, hour) {
    let [a, b] = src.win;
    if (b >= 24 && a <= 0) return 1;
    let h = hour;
    if (b < a) { // envuelve la medianoche
      if (h < a) h += 24;
      b += 24;
    }
    if (h < a || h > b) {
      // fuera de ventana: una cola corta, no un corte. Nadie deja de existir
      // a las 9:00:01.
      const d = Math.min(Math.abs(h - a), Math.abs(h - b));
      return Math.max(0, 0.16 - d * 0.09);
    }
    const t = (h - a) / Math.max(0.001, b - a);
    return Math.sin(Math.PI * t) ** 0.7;   // entra y sale, con meseta
  }

  // Media de una franja del espectro, dada en fracciones del rango. Igual que
  // bandRange en scAudio.ts, pero aquí dentro porque el módulo se evalúa en un
  // sandbox y no puede importar nada.
  _bandMean(bands, from, to) {
    if (!bands || bands.length === 0) return 0;
    const n = bands.length;
    const a = Math.max(0, Math.floor(from * (n - 1)));
    const b = Math.min(n - 1, Math.ceil(to * (n - 1)));
    let sum = 0, c = 0;
    for (let i = a; i <= b; i++) { sum += bands[i]; c++; }
    return c ? sum / c : 0;
  }

  _classColor(cls, hot) {
    const P = Antifonia.PALETTE;
    if (cls === "geofonia") return new THREE.Color(hot ? P.geoHi : P.geo);
    if (cls === "antropofonia") return new THREE.Color(hot ? P.antroHi : P.antro);
    return new THREE.Color(hot ? P.bioHi : P.bio);
  }

  // ══ el bucle ═══════════════════════════════════════════════════════════

  _loop() {
    this._animationId = requestAnimationFrame(() => this._loop());
    if (this.destroyed) return;
    const now = (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
    let dt = now - this._last;
    this._last = now;
    if (!(dt > 0) || dt > 0.25) dt = 0.016;   // pestañas en segundo plano

    this._readControls();
    this._smooth(dt);
    this._advanceClock(dt);
    this._spawn(dt);
    this._updateBirds(dt);
    this._updateHowlers(dt);
    this._updateGroundFauna(dt);
    this._updateCalls(dt);
    this._updateCloud(dt);
    this._drawNiche();
    this._updateHUD();

    if (this.controls) this.controls.update();
    this.render();
  }

  _readControls() {
    let sp = null, pp = null, ed = null, tp = null;
    try { sp = window.__sonethParams; } catch (e) { sp = null; }
    try { pp = window.__phenoParams; } catch (e) { pp = null; }
    try { ed = window.__ednaBio; } catch (e) { ed = null; }
    try { tp = window.__tideState; } catch (e) { tp = null; }
    // El sonido REAL que sale del bus máster. Este módulo no lo leía nunca:
    // reaccionaba a valores de control, que es la intención, no el sonido.
    // Es seguro leerlo — la regla de "no leas lo que escribes" cubre
    // texturedepth, spatialspread y memoryfeed, y esto no es ninguno.
    //
    // NO se guarda en un campo. BaseThreeJsModule.destroy() recorre cada
    // propiedad de `this` y anula las propiedades de lo que encuentre, así que
    // cachear aquí el objeto global compartido hacía que al desmontar el slot
    // se vaciara __scAudio.voices para todo el mundo. Se lee suelto donde hace
    // falta y ya está.

    // ⚠ ESTE MÓDULO NO PUEDE LEER LO QUE ESCRIBE.
    // El puente publica texturedepth, spatialspread y noiselevel desde la
    // densidad del coro. La primera versión leía esos tres exactos: más coro
    // subía texturedepth, texturedepth subía la tasa de emisión, y eso subía
    // el coro. Un lazo cerrado de realimentación positiva en las tres vías a
    // la vez. No se disparó al infinito sólo porque la marea y la vida corta
    // de cada llamada lo tapaban, que es la peor forma de tener un error:
    // invisible mientras las condiciones ayuden.
    //
    // Se leen ahora parámetros que este slot NO escribe. DarkForest mantiene
    // la misma disciplina (escribe drone*/harmonicrich, lee volume/pitch/
    // time/spectral/spatial), y por eso nunca tuvo este problema.
    if (sp) {
      if (typeof sp.volume === "number") this.tgt.vol = sp.volume;
      if (typeof sp.timedilation === "number") this.tgt.time = sp.timedilation;
      if (typeof sp.spectralshift === "number") this.tgt.spectral = sp.spectralshift;
      // riqueza del coro — cuántas voces se levantan
      if (typeof sp.harmonicrich === "number") this.tgt.dens = sp.harmonicrich;
      // amplitud de la sala — cuán repartidas están las fuentes
      if (typeof sp.atmospheremix === "number") this.tgt.spread = sp.atmospheremix;
      // presión de la cadena — cuánto empuja la bancada de la máquina
      if (typeof sp.txInfluence === "number") this.tgt.tx = sp.txInfluence;
      if (typeof sp.resonantbody === "number") this.tgt.body = sp.resonantbody;
    }
    // La marea llega desde SC por /tide/state cuando existe; si no, plana.
    if (tp && typeof tp.value === "number") this.tide = tp.value;

    // Ocho regiones eDNA → seis estratos, con el mismo reparto que DarkForest
    // usa, para que las dos lecturas del bosque no se contradigan.
    if (ed && ed.length >= 8) {
      const map = [2, 3, 1, 0, 4, 2, 5, 4];
      const acc = new Array(Antifonia.STRATA.length).fill(0);
      const cnt = new Array(Antifonia.STRATA.length).fill(0);
      for (let i = 0; i < 8; i++) {
        const s = map[i];
        acc[s] += (typeof ed[i] === "number" ? ed[i] : 0.5);
        cnt[s] += 1;
      }
      for (let s = 0; s < acc.length; s++) {
        this.tgtStratum[s] = cnt[s] > 0 ? acc[s] / cnt[s] : 0.5;
      }
    }
    if (pp && typeof pp.activityThreshold === "number") {
      this._quorum = pp.activityThreshold;
    }
  }

  _smooth(dt) {
    const k = Math.min(1, dt * 3.2);
    for (const key of Object.keys(this.ctl)) {
      this.ctl[key] += (this.tgt[key] - this.ctl[key]) * k;
    }
    for (let i = 0; i < this.stratumW.length; i++) {
      this.stratumW[i] += (this.tgtStratum[i] - this.stratumW[i]) * Math.min(1, dt * 1.1);
    }
    this.pulseEnergy *= Math.exp(-dt * 1.6);
    // Vitalidad: cuánto está hablando la sala ahora mismo, suavizado.
    const live = this.calls.length / Math.max(1, Antifonia.GLYPH_POOL * 0.35);
    this.vitality += (Math.min(1, live) - this.vitality) * Math.min(1, dt * 0.9);
  }

  _advanceClock(dt) {
    if (this._manualHour !== null) { this.hour = this._manualHour; return; }
    // timeDilation estira el día: 0 → ~4 min, 1 → ~24 min.
    const len = this.dayLenSec * (0.5 + this.ctl.time * 2.5);
    this.hour = (this.hour + (24 * dt / len)) % 24;
  }

  _spawn(dt) {
    if (this.calls.length >= Antifonia.GLYPH_POOL) return;

    // La marea decide cuánto se habla; texturedepth es el control del
    // intérprete sobre lo mismo. Cresta → coro; valle → la máquina sola.
    const tideDens = 0.15 + this.tide * 0.85;
    const base = (0.9 + this.ctl.dens * 3.4) * tideDens;

    // CONSENSO → sincronía del coro. `coherence` llegaba por setCoherence y
    // moría ahí: ni el dibujo ni el reverse-breath la leían, así que el
    // deslizador de consenso no hacía absolutamente nada en este slot.
    //
    // Con acuerdo alto las fuentes cantan A LA VEZ, en ráfagas cerradas —
    // antifonía propiamente dicha, el turno respetado. Con acuerdo bajo cada
    // una emite por su cuenta y la sala se convierte en un murmullo. Es la
    // lectura parlamentaria del mismo número.
    const sync = this.coherence;
    // ventana de turno: a sincronía alta sólo se canta en fase
    const phase = (this._t0 !== undefined)
      ? (this._last - this._t0) * (0.6 + this.ctl.dens * 0.8) : 0;
    const turno = 0.5 + 0.5 * Math.sin(phase * 2 * Math.PI * 0.35);
    const gateSync = 1 - sync * 0.85 + sync * 0.85 * (turno * turno);

    for (const src of Antifonia.SOURCES) {
      const circ = this._circadian(src, this.hour);
      if (circ <= 0.001) continue;

      // La antropofonía se comporta al revés que el bosque: crece cuando la
      // marea baja y cuando la cadena empuja. Es la tercera bancada tomando
      // la palabra en el silencio, que es la transición que se pidió — el
      // ruido electrónico convertido en ambiente, no un añadido al lado.
      let w = circ;
      if (src.cls === "antropofonia") {
        w = circ * (0.35 + (1 - this.tide) * 1.15 + this.ctl.tx * 0.6);
      } else if (src.cls === "geofonia") {
        w = circ * (0.5 + this.ctl.spectral * 0.7);
      } else {
        const si = this._stratumIndexFromAGL(this._stratumMeters(src.stratum));
        w = circ * (0.55 + this.stratumW[si] * 0.9);
      }

      const p = base * w * dt * 0.9 * gateSync;
      if (Math.random() < p) this._emit(src);
    }
  }

  // ── ¿Desde dónde se canta? ──────────────────────────────────────────────
  // Un animal canta DESDE algo. Repartir las llamadas por x,z al azar las
  // dejaba flotando en aire vacío —un aullador a 38 m sobre un claro donde no
  // hay ningún árbol de 38 m— y por eso los registros se leían como barras
  // pegadas encima del bosque en vez de inmersas en él.
  //
  // Ahora cada fuente busca una PERCHA: un árbol cuya altura alcance su
  // estrato, y la llamada sale de su copa. El aullador sólo puede estar en la
  // ceiba, porque es la única emergente del rodal; las aves y la oropéndola
  // reparten campanos y árboles de dosel; la rana y la chicharra van al
  // sotobosque, bajo cualquier copa. El avión no tiene percha —está en la
  // atmósfera, es lo que es— y la cinta suena desde el suelo, en cualquier
  // parte. Que el aullador quede confinado a un solo árbol no es una
  // limitación: es el dato.
  _perchFor(src) {
    const wantM = this._stratumMeters(src.stratum);
    if (src.cls === "antropofonia" && src.stratum === "atmosfera") return null;  // el avión
    if (!this._trees || this._trees.length === 0) return null;
    const cand = [];
    for (const t of this._trees) {
      if (t.kind === "palma") continue;                    // no se canta desde una palma aquí
      if (t.h >= wantM * 0.78) cand.push(t);
    }
    if (cand.length === 0) return null;
    const t = cand[(Math.random() * cand.length) | 0];
    const a = Math.random() * Math.PI * 2;
    const rr = Math.sqrt(Math.random()) * t.r * 0.85;
    return {
      x: t.x + Math.cos(a) * rr,
      z: t.z + Math.sin(a) * rr,
      // dentro de la copa de ESE árbol, sin pasarse de su altura real
      agl: Math.min(t.h * (0.62 + Math.random() * 0.36), wantM * (0.8 + Math.random() * 0.45)),
    };
  }

  _emit(src, scored) {
    if (this.calls.length >= Antifonia.GLYPH_POOL) return;
    const S = Antifonia.STRATA;
    const spread = 0.35 + this.ctl.spread * 0.65;
    // Primero un ave en vuelo (si la fuente es de dosel y hay alguna cruzando),
    // luego una percha, y sólo si no hay ninguna de las dos, aire abierto.
    // Ese orden es el que hace que se vea primero quién habla.
    // Orden: aullador → un mono real; dosel → un ave que esté cruzando;
    // si no, una percha; y sólo entonces aire abierto.
    const howler = scored ? null : this._howlerFor(src);
    const ground = (scored || howler) ? null : this._groundFor(src);
    const bird = (scored || howler || ground) ? null : this._birdFor(src);
    const perch = (scored || howler || ground || bird) ? null : this._perchFor(src);
    const body = howler || ground;      // un cuerpo real, si lo hay
    const agl = scored ? scored.heightAGL
      : (body ? body.agl : (bird ? bird.agl : (perch ? perch.agl
        : this._stratumMeters(src.stratum) * (0.75 + Math.random() * 0.5))));
    const x = body ? body.px : (bird ? bird.px : (perch ? perch.x
      : (scored ? scored.x : (Math.random() * 2 - 1)) * Antifonia.PLOT * spread));
    const z = body ? body.pz : (bird ? bird.pz : (perch ? perch.z
      : (scored ? scored.z : (Math.random() * 2 - 1)) * Antifonia.PLOT * spread));
    const lo = scored ? scored.lo : src.lo;
    const hi = scored ? scored.hi : src.hi;
    const dur = scored ? scored.dur : (0.5 + Math.random() * 2.2);

    // ── Apertura y cierre de la vela ─────────────────────────────────────
    // El "precio" es la frecuencia central geométrica de la llamada, y la
    // sesión anterior es la última llamada de esa misma especie. Sube o baja
    // respecto a ella: eso es todo lo que hace falta para que la vela diga
    // algo cierto en vez de decorar. Sin sesión previa se abre alcista, como
    // hace cualquier gráfico con su primer dato.
    const close = Math.sqrt(Math.max(20, lo) * Math.max(40, hi));
    const prev = this._lastClose.get(src.key);
    const up = prev === undefined ? true : close >= prev;
    this._lastClose.set(src.key, close);
    // Qué fracción del rango ocupa el cuerpo: llamadas largas concentran la
    // energía (cuerpo grande), los chasquidos son casi toda mecha.
    const bodyFrac = Math.max(0.12, Math.min(0.9, dur / (dur + 1.1)));

    const call = {
      key: src.key, cls: src.cls, smp: src.smp,
      lo, hi, agl, x, z, dur,
      y: body ? body.py : (bird ? bird.py : this._yFromAGL(agl)),
      age: 0,
      life: Math.max(1.2, dur * 1.8),
      hour: this.hour,
      up, bodyFrac, close,
    };
    this.calls.push(call);

    // Historia para la franja del nicho, recortada por arriba.
    this.niche.push({ hour: this.hour, lo, hi, cls: src.cls, up, bodyFrac, close, t: 0 });
    if (this.niche.length > Antifonia.NICHE_KEEP) this.niche.shift();

    this._fired += 1;
    if (src.smp < 0) {
      // Geofonía sin grabación: se dibuja, no suena, y se cuenta aparte para
      // que el HUD pueda decirlo.
      this._silentFired += 1;
      return;
    }

    // A la cola para el puente. El módulo no habla OSC — expone y el puente
    // drena, igual que el resto de los slots.
    if (this._pending.length < 24) {
      this._pending.push({
        smp: src.smp,
        amp: 0.30 + this.ctl.vol * 0.45,
        rate: src.rate,
        // La banda de la llamada abre la grabación en esa ventana en vez de
        // reproducirla plana. spectralShift la desplaza como un formante.
        hpf: Math.max(20, Math.min(2000, lo * (0.6 + this.ctl.spectral * 0.9))),
        lpf: Math.max(200, Math.min(8000, hi * (0.6 + this.ctl.spectral * 0.9))),
        // La posición horizontal es el paneo: quien habla, habla desde un lado.
        pan: Math.max(-1, Math.min(1, x / Antifonia.PLOT)),
        dur: Math.min(6, Math.max(0.3, dur)),
      });
    }
  }

  _updateCalls(dt) {
    const bodies = this._bodies, wicks = this._wicks;
    if (!bodies || !wicks) return;
    const d = this._dummy;
    const cam = this.camera;
    let n = 0;

    for (let i = this.calls.length - 1; i >= 0; i--) {
      const c = this.calls[i];
      c.age += dt;
      if (c.age >= c.life) { this.calls.splice(i, 1); continue; }
      if (n >= Antifonia.GLYPH_POOL) continue;

      const t = c.age / c.life;
      const env = Math.sin(Math.PI * Math.min(1, t)) ** 0.6;   // ataque y caída

      // La vela se dibuja de canto a la cámara: el ancho es constante y la
      // altura es lo que informa, como en cualquier gráfico de velas.
      const yaw = Math.atan2(cam.position.x - c.x, cam.position.z - c.z);

      // Escala vertical: octavas sobre el fundamental. Una llamada de banda
      // ancha da una vela alta; una nota pura, una casi plana. Se mantiene
      // pequeña y LOCAL para quedar inmersa en el dosel, no atravesándolo.
      const octTot = Math.log2(Math.max(1.03, c.hi / Math.max(20, c.lo)));
      const total = Math.min(1.15, 0.16 + octTot * 0.20) * (0.55 + env * 0.7);
      const bodyH = total * (0.30 + c.bodyFrac * 0.42);
      // El cuerpo debe ser CLARAMENTE más ancho que la mecha o la vela se lee
      // como un palito: es esa relación, no el color, la que hace reconocible
      // la figura de un gráfico de velas.
      const wickW = 0.009 + c.dur * 0.004;
      const bodyW = 0.055 + Math.min(0.075, c.dur * 0.022);

      // Centro de la vela: la altura desde la que se cantó, con una deriva
      // mínima para que no quede clavada.
      const y0 = c.y + Math.sin(c.age * 1.6 + c.x) * 0.035;
      // Un pelo hacia la cámara: si la vela nace dentro de una copa, sin esto
      // queda sepultada bajo los puntos del follaje que la rodea.
      const nx = cam.position.x - c.x, nz = cam.position.z - c.z;
      const nl = Math.max(0.001, Math.hypot(nx, nz));

      // mecha: máximo a mínimo, el rango completo
      d.position.set(c.x + (nx / nl) * 0.10, y0, c.z + (nz / nl) * 0.10);
      d.rotation.set(0, yaw, 0);
      d.scale.set(wickW, total, 1);
      d.updateMatrix();
      wicks.setMatrixAt(n, d.matrix);

      // cuerpo: desplazado dentro del rango según si cerró arriba o abajo
      d.position.set(c.x + (nx / nl) * 0.12,
                     y0 + (c.up ? 1 : -1) * (total - bodyH) * 0.22,
                     c.z + (nz / nl) * 0.12);
      d.rotation.set(0, yaw, 0);
      d.scale.set(bodyW, bodyH, 1);
      d.updateMatrix();
      bodies.setMatrixAt(n, d.matrix);

      // Vela alcista: cuerpo lleno y brillante. Bajista: apagado, casi hueco
      // —no se puede vaciar de verdad una InstancedMesh, así que el "hueco"
      // se hace por luminancia, que a este tamaño lee igual.
      // pulseEnergy es la fuerza del último voto. Se fijaba en pulse() y se
      // decaía cada cuadro, y NINGUNA ruta la leía: los cinco tipos de voto se
      // calculaban en el puente para nada. Ahora enciende las velas — un voto
      // hace que la sesión entera cotice más fuerte durante unos segundos.
      const voto = Math.min(1, (this.pulseEnergy || 0) * 0.35);
      const col = this._classColor(c.cls, env > 0.7 || voto > 0.5);
      const bodyBoost = (c.up ? (0.55 + env * 0.95) : (0.16 + env * 0.28)) * (1 + voto * 0.9);
      const wickBoost = (0.34 + env * 0.6) * (1 + voto * 0.7);
      bodies.setColorAt(n, col.clone().multiplyScalar(bodyBoost));
      wicks.setColorAt(n, col.multiplyScalar(wickBoost));
      n += 1;
    }

    // Las ranuras no usadas se sacan de cuadro en vez de borrarse: mover una
    // matriz cuesta menos que reconstruir el atributo.
    d.position.set(0, -9999, 0);
    d.rotation.set(0, 0, 0);
    d.scale.set(1, 1, 1);
    d.updateMatrix();
    for (let i = n; i < Antifonia.GLYPH_POOL; i++) {
      bodies.setMatrixAt(i, d.matrix);
      wicks.setMatrixAt(i, d.matrix);
    }
    for (const m of [bodies, wicks]) {
      m.count = Antifonia.GLYPH_POOL;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    this._liveCandles = n;
  }

  // El rodal responde por ESTRATO, no por punto. Seis materiales cambian de
  // color y opacidad cada cuadro; los ~62 000 vértices no se tocan nunca
  // después de generarse. Esa es toda la razón de haber partido la nube en
  // seis objetos: la alternativa —reescribir el atributo de color -- cuesta
  // dos órdenes de magnitud más para el mismo efecto visible.
  //
  // Lo que se lee: el peso eDNA de ese estrato (window.__ednaBio, el mismo
  // reparto que usa DarkForest) y la actividad acústica reciente ahí. Una
  // llamada ENCIENDE la altura desde la que se emitió, de modo que el rodal
  // deja de ser un decorado y pasa a ser el cuerpo que habla.
  _updateCloud(dt) {
    if (!this._cloudMats) return;

    // decaimiento de la iluminación por estrato
    if (!this._stratumLit) this._stratumLit = new Array(Antifonia.STRATA.length).fill(0);
    const lit = this._stratumLit;
    for (let i = 0; i < lit.length; i++) lit[i] *= Math.exp(-dt * 1.25);
    for (const c of this.calls) {
      const si = this._stratumIndexFromAGL(c.agl);
      const env = Math.sin(Math.PI * Math.min(1, c.age / c.life));
      lit[si] = Math.min(2.2, lit[si] + env * dt * 2.6);
    }

    // Temperatura del fósforo: spectralShift lo lleva de verde-frío a un
    // blanco cálido. Es el único control del intérprete sobre el color, y no
    // toca la geometría.
    const warm = this.ctl.spectral;
    for (let si = 0; si < this._cloudMats.length; si++) {
      const m = this._cloudMats[si];
      if (!m) continue;
      const w = this.stratumW[si];                  // 0..1 desde eDNA
      const l = Math.min(1.6, lit[si]);
      const base = 0.42 + w * 0.5 + l * 0.55;
      m.color.setRGB(
        Math.min(1.6, base * (0.78 + warm * 0.34)),
        Math.min(1.6, base * (0.98 - warm * 0.06)),
        Math.min(1.6, base * (0.94 - warm * 0.24))
      );
      m.opacity = Math.min(1, 0.34 + w * 0.32 + l * 0.34);
      m.size = 0.016 + this.ctl.body * 0.012 + l * 0.006;
    }

    // ── Viento ───────────────────────────────────────────────────────────
    // El rodal se mece. Cada estrato se desplaza un poco, y MÁS ARRIBA MÁS:
    // el suelo no se mueve, las emergentes sí, que es como se comporta un
    // dosel real y lo que separa un bosque vivo de un modelo. Cuesta seis
    // escrituras de posición por cuadro — no se toca un solo vértice.
    //
    // La amplitud la manda la bancada de geofonía: cuando VIENTO está en su
    // ventana el bosque se agita, y cuando calla se queda quieto. Es la única
    // fuente sin grabación que aun así hace algo audible-por-la-vista, lo que
    // vuelve visible su ausencia sonora en vez de dejarla en nada.
    let windSrc = 0;
    for (const src of Antifonia.SOURCES) {
      if (src.cls !== "geofonia") continue;
      windSrc = Math.max(windSrc, this._circadian(src, this.hour));
    }
    this._wind = (this._wind ?? 0) + (windSrc - (this._wind ?? 0)) * Math.min(1, dt * 0.7);
    const tNow = this._last - this._t0;
    for (let si = 0; si < this._cloudPoints.length; si++) {
      const p = this._cloudPoints[si];
      if (!p) continue;
      // 0 abajo, 1 arriba
      const hf = 1 - si / Math.max(1, Antifonia.STRATA.length - 1);
      const amp = (0.012 + this._wind * 0.075) * hf * hf;
      p.position.x = Math.sin(tNow * 0.43 + si * 0.7) * amp
                   + Math.sin(tNow * 1.13 + si * 1.9) * amp * 0.35;
      p.position.z = Math.cos(tNow * 0.37 + si * 1.2) * amp * 0.8;
      p.position.y = Math.sin(tNow * 0.61 + si * 0.4) * amp * 0.22;
    }

    // El micelio respira con el peso del estrato micorrícico: una sola
    // escritura de opacidad, sin tocar sus miles de segmentos.
    // ── El micelio escucha ────────────────────────────────────────────────
    // El "pulso" que había aquí era un seno libre a 0.35 rad/s: atado a nada,
    // decorativo. Ahora cada sub-red se enciende con SU banda del espectro
    // real que sale del bus máster (window.__scAudio, 16 bandas a 20 Hz), más
    // un destello por ataque de bombo o de polvo. La red deja de respirar como
    // un solo cuerpo y pasa a transportar lo que llega.
    if (this._mycoNets && this._mycoNets.length) {
      // Leído aquí, no cacheado en un campo — ver la nota en _readControls.
      let au = null;
      try { au = window.__scAudio || null; } catch (e) { au = null; }
      const wMic = this.stratumW[Antifonia.STRATA.length - 1];
      const lit0 = this._stratumLit ? this._stratumLit[Antifonia.STRATA.length - 1] : 0;
      // Ataques: el bombo y el polvo son los que viven abajo. Se reparten
      // entre sub-redes por índice para que enciendan caminos distintos.
      // Guarda en DOS niveles. `au ? au.voices.kick : 0` sólo comprueba el
      // objeto exterior, así que un __scAudio a medio publicar —o un cuadro
      // pendiente de una instancia ya desmontada durante un cambio de slot—
      // reventaba el montaje entero con "reading 'kick' of null". Un módulo
      // que se cae al arrancar deja el slot en negro sin decir por qué.
      const V = (au && au.voices) ? au.voices : null;
      const kick = (V && V.kick) ? V.kick.env : 0;
      const dust = (V && V.dust) ? V.dust.env : 0;
      for (let k = 0; k < this._mycoNets.length; k++) {
        const net = this._mycoNets[k];
        const band = (au && au.bands) ? this._bandMean(au.bands, net.band[0], net.band[1]) : 0;
        // ataque asignado a esta sub-red
        const hit = (k % 2 === 0 ? kick : dust) * (0.5 + 0.5 * Math.cos(k));
        // Las arrieras cultivan hongo: la fila enciende la red que pisa.
        let ants = 0;
        if (this._antHead) {
          const d = Math.hypot(this._antHead.x - net.cx, this._antHead.z - net.cz);
          ants = Math.max(0, 1 - d / (Antifonia.PLOT * 0.55)) * 0.16;
        }
        net.lit += (band * 1.9 + hit * 0.9 - net.lit) * Math.min(1, dt * 5.5);
        net.mat.opacity = Math.min(0.62,
          0.055 + wMic * 0.10 + net.lit * 0.34 + lit0 * 0.10 + ants);
      }
    }

    // ── LOD adaptativo ───────────────────────────────────────────────────
    // Esto es un instrumento en vivo: si el cuadro se alarga, lo que hay que
    // ceder es densidad de nube, no latencia de audio ni respuesta de mando.
    // Como los puntos se barajaron al generarse, recortar el rango de dibujo
    // es una submuestra uniforme del rodal — se ve más ralo, no incompleto.
    this._ftAvg = this._ftAvg === undefined ? dt : this._ftAvg + (dt - this._ftAvg) * 0.05;
    const want = this._ftAvg > 0.024 ? -0.02 : (this._ftAvg < 0.016 ? 0.01 : 0);
    if (want !== 0) this._lod = Math.max(0.35, Math.min(1, this._lod + want));
    if (Math.abs(this._lod - (this._lodApplied ?? -1)) > 0.02) {
      this._lodApplied = this._lod;
      for (const p of this._cloudPoints) {
        if (p) p.geometry.setDrawRange(0, Math.floor(p.userData.total * this._lod));
      }
    }
  }

  // La franja: tiempo en x (24 h), frecuencia logarítmica en y. Es donde se ve
  // el reparto del nicho acústico — quién ocupa qué banda a qué hora — que en
  // el volumen 3-D queda escondido detrás de la posición.
  _drawNiche() {
    const cv = this._nicheCv, g = this._nicheCx;
    if (!cv || !g) return;
    const host = this.host;
    const w = Math.max(2, host.offsetWidth | 0);
    const h = Math.max(2, (host.offsetHeight * 0.26) | 0);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== (w * dpr | 0) || cv.height !== (h * dpr | 0)) {
      cv.width = w * dpr | 0; cv.height = h * dpr | 0;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    const P = Antifonia.PALETTE;
    g.clearRect(0, 0, w, h);

    g.fillStyle = "rgba(4,7,10,0.55)";
    g.fillRect(0, 0, w, h);

    const F_LO = 40, F_HI = 24000;
    const yOf = (f) => h - (Math.log2(Math.max(F_LO, Math.min(F_HI, f)) / F_LO) /
                            Math.log2(F_HI / F_LO)) * (h - 14) - 7;
    const xOf = (hr) => (hr / 24) * w;

    // rejilla de horas
    g.strokeStyle = "rgba(42,88,92,0.5)";
    g.lineWidth = 1;
    g.font = "10px 'Share Tech Mono', ui-monospace, monospace";
    g.fillStyle = "rgba(199,211,203,0.5)";
    for (let hr = 0; hr <= 24; hr += 3) {
      const x = xOf(hr);
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
      if (hr < 24) g.fillText(String(hr).padStart(2, "0") + "h", x + 3, h - 3);
    }
    for (const f of [100, 1000, 10000]) {
      const y = yOf(f);
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
      g.fillText(f >= 1000 ? (f / 1000) + "k" : String(f), 3, y - 3);
    }

    // cajas de nicho por fuente, tenues: el territorio declarado
    for (const src of Antifonia.SOURCES) {
      const a = xOf(src.win[0]);
      const b = xOf(src.win[1] > src.win[0] ? src.win[1] : 24);
      const y1 = yOf(src.hi), y2 = yOf(src.lo);
      const c = this._classColor(src.cls, false);
      g.fillStyle = `rgba(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0},0.07)`;
      g.fillRect(a, y1, Math.max(2, b - a), Math.max(2, y2 - y1));
    }

    // Las llamadas, como velas. Aquí el gráfico bursátil está en su hábitat
    // —tiempo en x, "precio" en y— y por eso la lectura es tan directa: la
    // sesión del bosque cotizada hora a hora. Mecha fina de máximo a mínimo,
    // cuerpo grueso donde vive la energía, lleno si cerró por encima de la
    // llamada anterior de esa especie y apagado si por debajo.
    for (const nq of this.niche) {
      const x = xOf(nq.hour);
      const yHi = yOf(nq.hi), yLo = yOf(nq.lo);
      const c = this._classColor(nq.cls, nq.up);
      const rgb = `${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0}`;
      const span = Math.max(2, yLo - yHi);
      const bodyH = Math.max(1.5, span * (nq.bodyFrac ?? 0.5));
      const bodyY = yHi + (span - bodyH) * (nq.up ? 0.12 : 0.55);

      g.fillStyle = `rgba(${rgb},0.34)`;                 // mecha
      g.fillRect(x - 0.5, yHi, 1, span);
      if (nq.up) {
        g.fillStyle = `rgba(${rgb},0.78)`;               // alcista: lleno
        g.fillRect(x - 2, bodyY, 4, bodyH);
      } else {
        g.strokeStyle = `rgba(${rgb},0.70)`;             // bajista: hueco
        g.lineWidth = 1;
        g.strokeRect(x - 2, bodyY, 4, bodyH);
      }
    }

    // aguja de la hora actual
    const nx = xOf(this.hour);
    g.strokeStyle = P.term;
    g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(nx, 0); g.lineTo(nx, h); g.stroke();
  }

  _updateHUD() {
    if (!this._hud) return;
    const now = (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
    if (this._hudAt && now - this._hudAt < 0.2) return;   // 5 Hz, no por cuadro
    this._hudAt = now;

    const hh = String(Math.floor(this.hour)).padStart(2, "0");
    const mm = String(Math.floor((this.hour % 1) * 60)).padStart(2, "0");
    const active = Antifonia.SOURCES
      .filter((s) => this._circadian(s, this.hour) > 0.25)
      .map((s) => s.label);

    this._hud.innerHTML =
      `ANTIFONÍA · PARLAMENTO ACÚSTICO<br>` +
      `${hh}:${mm} · marea ${this.tide.toFixed(2)} · ${this._scoreLabel || "…"}<br>` +
      `en pie: ${this.calls.length}/${Antifonia.GLYPH_POOL} · emitidas ${this._fired}<br>` +
      `<span style="opacity:.7">${active.length ? active.join(" · ") : "— sala en silencio —"}</span>`;

    if (this._legend) {
      const P = Antifonia.PALETTE;
      const gap = this._silentFired > 0
        ? `<br><span style="color:${P.geo};opacity:.85">geofonía sin grabación: ${this._silentFired} llamadas mudas</span>`
        : "";
      this._legend.innerHTML =
        `<span style="color:${P.bio}">■</span> biofonía &nbsp;` +
        `<span style="color:${P.geo}">■</span> geofonía &nbsp;` +
        `<span style="color:${P.antro}">■</span> antropofonía` +
        gap +
        // El rodal se nombra: quien mira debe poder decir qué árbol es cuál.
        // Tres líneas de texto a cambio de que la nube deje de ser "puntos".
        `<br><span style="opacity:.62">barrido · <i>Ceiba pentandra</i> · ` +
        `<i>Albizia saman</i> · <i>Attalea butyracea</i></span>` +
        `<br><span style="opacity:.55">inspirado en AveRosetta™ · NeotropicalScience</span>`;
    }
  }

  // ══ superficie para el puente ══════════════════════════════════════════

  setMasterVol(o) { this.tgt.vol = this._num(o, this.tgt.vol); }
  setTimeDilation(o) { this.tgt.time = this._num(o, this.tgt.time); }
  setSpectralShift(o) { this.tgt.spectral = this._num(o, this.tgt.spectral); }
  setSpatialSpread(o) { this.tgt.spread = this._num(o, this.tgt.spread); }
  setCoherence(o) { this.coherence = this._num(o, this.coherence); }
  pulse(o) {
    const i = (o && typeof o.intensity === "number") ? o.intensity : 1.4;
    this.pulseEnergy = Math.min(4, this.pulseEnergy + i);
    // Un voto empuja a la sala a hablar: tres llamadas de la bancada que esté
    // en su hora.
    const inHour = Antifonia.SOURCES.filter((s) => this._circadian(s, this.hour) > 0.2);
    for (let k = 0; k < 3 && inHour.length; k++) {
      this._emit(inHour[(Math.random() * inHour.length) | 0]);
    }
  }
  setHour(o) {
    const h = (o && typeof o.hour === "number") ? o.hour : null;
    this._manualHour = (h === null || h < 0) ? null : (h % 24);
  }
  setTide(v) { if (typeof v === "number" && isFinite(v)) this.tide = Math.max(0, Math.min(1, v)); }

  _num(o, dflt) {
    if (o && typeof o.value === "number") return Math.max(0, Math.min(1, o.value));
    if (o && typeof o.level === "number") return Math.max(0, Math.min(1, o.level));
    if (typeof o === "number") return Math.max(0, Math.min(1, o));
    return dflt;
  }

  // Getters que el puente sondea cada 280 ms (reverse breath).
  getVitality() { return Math.max(0, Math.min(1, this.vitality)); }
  getCoherence() { return Math.max(0, Math.min(1, this.coherence)); }
  getChorusDensity() {
    return Math.max(0, Math.min(1, this.calls.length / (Antifonia.GLYPH_POOL * 0.4)));
  }
  // Cuánto de lo que suena es máquina. Es lo que sube el ruido electrónico
  // hacia ambiente cuando el bosque calla.
  getMachineShare() {
    if (this.calls.length === 0) return 0;
    let m = 0;
    for (const c of this.calls) if (c.cls === "antropofonia") m += 1;
    return Math.max(0, Math.min(1, m / this.calls.length));
  }
  getSpread() { return Math.max(0, Math.min(1, this.ctl.spread)); }
  getHour() { return this.hour; }

  // Cola de llamadas para SC. Devuelve y VACÍA: el puente es el único
  // consumidor, y si nadie drena, _emit deja de encolar en 24 para que una
  // pestaña en segundo plano no acumule una avalancha.
  // `max` es cuántas va a poder mandar el puente. Antes se vaciaba la cola
  // ENTERA y el puente enviaba como mucho dos: el resto se descartaba en
  // silencio, así que la mayoría de las llamadas encoladas no sonaba nunca y
  // no había forma de notarlo. Ahora se entrega sólo lo que se va a usar y el
  // resto espera al siguiente tick.
  getPendingCalls(max = 2) {
    if (this._pending.length === 0) return null;
    const n = Math.max(1, max | 0);
    const out = this._pending.splice(0, n);
    return out.length ? out : null;
  }

  // Especie activa, en la MISMA forma que publica PhenologicalCalendar, para
  // que el laser y el Registro no tengan que aprender un segundo formato.
  //
  // SÓLO BIOFONÍA. La lluvia no es una especie y el avión tampoco, y este
  // campo alimenta el roster del parlamento y la cláusula de opacidad del
  // láser: publicar "registro · máquina" como taxón mammals mete a la máquina
  // en el censo de seres vivos, que es precisamente la confusión que este slot
  // existe para deshacer. Las otras dos bancadas se ven y se oyen; no se
  // cuentan como especies.
  // Mismo criterio que PhenologicalCalendar._isSensitive: anfibios, orquídeas
  // y zamias, más una fracción estable por hash del binomio. El hash es lo que
  // impide que "no sensible" sea deducible por eliminación — si sólo se
  // protegieran las categorías obvias, el resto quedaría confirmado como
  // localizable, que es la misma exposición por otra vía.
  _isSensitive(src, taxon) {
    if (!src) return false;
    if (taxon === "amphibians") return true;
    const fam = String(src.family || "").toLowerCase();
    if (fam === "orchidaceae" || fam === "zamiaceae") return true;
    // hash estable sobre el binomio, en [0,1)
    const str = String(src.sci || "") + "|sensitive";
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) / 4294967296) < 0.15;
  }

  getActiveSpecies() {
    for (let i = this.calls.length - 1; i >= 0; i--) {
      const c = this.calls[i];
      if (c.cls !== "biofonia") continue;
      const src = this._srcByKey.get(c.key);
      if (!src) continue;
      // ── CLÁUSULA DE OPACIDAD ─────────────────────────────────────────
      // Aquí decía `sensitive: false` a secas, para TODAS las fuentes. Ese
      // campo es exactamente lo que consulta laserTap.ts antes de proyectar
      // (`if (active && active.ring && !active.sensitive)`), y la rana entra
      // en este módulo con taxon "amphibians", que es una de las categorías
      // que PhenologicalCalendar._isSensitive protege. Resultado: montar el
      // slot A, esperar a que cante la rana, y el láser dibujaba sobre el
      // bosque real un anfibio sensible a la localidad CON SU BINOMIO —
      // justo lo que la cláusula existe para impedir.
      //
      // Se aplica ahora la MISMA regla, y el nombre se vela como allí. No se
      // comparte la función porque los dos módulos se evalúan por separado en
      // sandboxes distintos; se comparte el criterio, que es lo que importa.
      const taxon = Antifonia.TAXON[src.key] || "birds";
      const sensitive = this._isSensitive(src, taxon);
      return {
        sci: sensitive ? "Sp. * (Vulnerable)" : src.sci,
        common: sensitive ? "Protegida" : src.label,
        // El vocabulario de taxon lo fija PhenologicalCalendar; se elige el
        // más cercano por fuente en vez de un único valor para todo.
        taxon,
        family: null,
        peakDay: null,
        day: Math.floor(this.hour),
        sensitive,
        ring: {
          ang: (this.hour / 24) * Math.PI * 2, r: 0.7,
          x: c.x / Antifonia.PLOT, y: c.y / 8, z: c.z / Antifonia.PLOT,
        },
        t: Date.now() / 1000,
      };
    }
    return null;
  }
}

export default Antifonia;
