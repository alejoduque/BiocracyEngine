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
 * LA FRECUENCIA NO PELEA POR ESE EJE. Cada llamada se dibuja como un glifo
 * cuya longitud es su ancho de banda y cuyo color es su centro espectral,
 * de modo que el espectro se lee en la MORFOLOGÍA y no roba la vertical.
 * Abajo corre una franja aparte —EL NICHO— con tiempo en x y frecuencia en
 * y: ahí se ve la hipótesis del nicho acústico, las especies repartiéndose
 * bandas y horas para no enmascararse. Es la partitura de la sesión.
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
 * Implementación: THREE core, materiales integrados, una sola InstancedMesh
 * para todos los glifos y una franja 2-D detrás del lienzo WebGL (el patrón
 * que ya usa Registro.js). Sin asignaciones por cuadro.
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
  };

  static GLYPH_POOL = 220;      // techo duro de glifos vivos
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
    this.ctl = { vol: 0.5, time: 0.3, spectral: 0.4, spatial: 0.5, texture: 0.3, noise: 0.2, tx: 0.5 };
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
    this._glyphs = null;
    this._srcByKey = new Map();
    Antifonia.SOURCES.forEach((s) => this._srcByKey.set(s.key, s));

    this.init();
  }

  // ══ ciclo de vida ══════════════════════════════════════════════════════

  init() {
    const P = Antifonia.PALETTE;
    this.scene.background = new THREE.Color(P.bg);
    this.scene.fog = new THREE.Fog(new THREE.Color(P.bg), 26, 78);

    this.camera.position.set(0, 5.2, 24);
    this.camera.near = 0.1;
    this.camera.far = 220;
    this.camera.updateProjectionMatrix();

    if (this.controls) {
      this.controls.enabled = true;
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.06;
      this.controls.minDistance = 9;
      this.controls.maxDistance = 64;
      this.controls.maxPolarAngle = Math.PI * 0.92;
      this.controls.target.set(0, 2.0, 0);
      this.controls.update();
    }

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xbfe6d2, 0.5);
    key.position.set(6, 12, 8);
    this.scene.add(key);

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
      const m = new THREE.LineBasicMaterial({
        color: new THREE.Color(i % 2 === 0 ? P.gridHi : P.grid),
        transparent: true, opacity: 0.34, depthWrite: false,
      });
      const grid = new THREE.LineSegments(g, m);
      grid.userData.stratum = i;
      this._strataGroup.add(grid);

      const spr = this._textSprite(st.label, st.sub, i);
      spr.position.set(-W - 1.4, st.y + 0.42, -W);
      this._strataGroup.add(spr);
    }

    // Eje vertical: la altura sobre el suelo, que es de lo que trata el slot.
    const axisPts = [0, Antifonia.STRATA[Antifonia.STRATA.length - 1].y - 1, -W,
                     0, Antifonia.STRATA[0].y + 1.2, -W];
    const ag = new THREE.BufferGeometry();
    ag.setAttribute("position", new THREE.Float32BufferAttribute(axisPts, 3));
    this._strataGroup.add(new THREE.Line(ag, new THREE.LineBasicMaterial({
      color: new THREE.Color(P.axis), transparent: true, opacity: 0.7,
    })));

    this.scene.add(this._strataGroup);
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
      map: tex, transparent: true, opacity: 0.85, depthWrite: false,
    }));
    spr.scale.set(6.4, 1.6, 1);
    spr.userData.stratum = idx;
    return spr;
  }

  // Una sola InstancedMesh para TODOS los glifos. El presupuesto de ciclos de
  // máquina es explícito: el pool se reserva una vez, nada se crea por cuadro,
  // y las llamadas que exceden el pool simplemente no se dibujan (la más vieja
  // ya se estará apagando).
  _buildGlyphs() {
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.9,
      depthWrite: false, side: THREE.DoubleSide,
    });
    this._glyphs = new THREE.InstancedMesh(geo, mat, Antifonia.GLYPH_POOL);
    this._glyphs.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(Antifonia.GLYPH_POOL * 3), 3
    );
    this._glyphs.frustumCulled = false;
    this._dummy = new THREE.Object3D();
    // Todo fuera de cuadro hasta que exista una llamada que lo ocupe.
    this._dummy.position.set(0, -9999, 0);
    this._dummy.updateMatrix();
    for (let i = 0; i < Antifonia.GLYPH_POOL; i++) {
      this._glyphs.setMatrixAt(i, this._dummy.matrix);
    }
    this._glyphs.instanceMatrix.needsUpdate = true;
    this.scene.add(this._glyphs);
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
    this._updateCalls(dt);
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

    if (sp) {
      if (typeof sp.volume === "number") this.tgt.vol = sp.volume;
      if (typeof sp.timedilation === "number") this.tgt.time = sp.timedilation;
      if (typeof sp.spectralshift === "number") this.tgt.spectral = sp.spectralshift;
      if (typeof sp.spatialspread === "number") this.tgt.spatial = sp.spatialspread;
      if (typeof sp.texturedepth === "number") this.tgt.texture = sp.texturedepth;
      if (typeof sp.noiselevel === "number") this.tgt.noise = sp.noiselevel;
      if (typeof sp.txInfluence === "number") this.tgt.tx = sp.txInfluence;
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
    const base = (0.9 + this.ctl.texture * 3.4) * tideDens;

    for (const src of Antifonia.SOURCES) {
      const circ = this._circadian(src, this.hour);
      if (circ <= 0.001) continue;

      // La antropofonía se comporta al revés que el bosque: crece cuando la
      // marea baja y cuando la cadena empuja. Es la tercera bancada tomando
      // la palabra en el silencio, que es la transición que se pidió — el
      // ruido electrónico convertido en ambiente, no un añadido al lado.
      let w = circ;
      if (src.cls === "antropofonia") {
        w = circ * (0.35 + (1 - this.tide) * 0.9 + this.ctl.tx * 0.5 + this.ctl.noise * 0.8);
      } else if (src.cls === "geofonia") {
        w = circ * (0.5 + this.ctl.spectral * 0.7);
      } else {
        const si = this._stratumIndexFromAGL(this._stratumMeters(src.stratum));
        w = circ * (0.55 + this.stratumW[si] * 0.9);
      }

      const p = base * w * dt * 0.9;
      if (Math.random() < p) this._emit(src);
    }
  }

  _emit(src, scored) {
    if (this.calls.length >= Antifonia.GLYPH_POOL) return;
    const S = Antifonia.STRATA;
    const spread = 0.35 + this.ctl.spatial * 0.65;
    const agl = scored ? scored.heightAGL : this._stratumMeters(src.stratum) * (0.75 + Math.random() * 0.5);
    const x = (scored ? scored.x : (Math.random() * 2 - 1)) * Antifonia.PLOT * spread;
    const z = (scored ? scored.z : (Math.random() * 2 - 1)) * Antifonia.PLOT * spread;
    const lo = scored ? scored.lo : src.lo;
    const hi = scored ? scored.hi : src.hi;
    const dur = scored ? scored.dur : (0.5 + Math.random() * 2.2);

    const call = {
      key: src.key, cls: src.cls, smp: src.smp,
      lo, hi, agl, x, z, dur,
      y: this._yFromAGL(agl),
      age: 0,
      life: Math.max(1.2, dur * 1.8),
      hour: this.hour,
    };
    this.calls.push(call);

    // Historia para la franja del nicho, recortada por arriba.
    this.niche.push({ hour: this.hour, lo, hi, cls: src.cls, t: 0 });
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
    const glyphs = this._glyphs;
    if (!glyphs) return;
    const d = this._dummy;
    let n = 0;

    for (let i = this.calls.length - 1; i >= 0; i--) {
      const c = this.calls[i];
      c.age += dt;
      if (c.age >= c.life) { this.calls.splice(i, 1); continue; }
      if (n >= Antifonia.GLYPH_POOL) continue;

      const t = c.age / c.life;
      const env = Math.sin(Math.PI * Math.min(1, t)) ** 0.6;   // ataque y caída

      // El glifo: su LONGITUD es el ancho de banda en octavas, su grosor la
      // duración. Así el espectro se lee en la forma y la vertical queda
      // libre para lo único que debe significar, la altura.
      const oct = Math.log2(Math.max(1.02, c.hi / Math.max(20, c.lo)));
      const len = 0.30 + oct * 0.42;
      const thick = 0.05 + Math.min(0.5, c.dur * 0.09);

      d.position.set(c.x, c.y + Math.sin(c.age * 1.7) * 0.05, c.z);
      d.rotation.set(0, Math.atan2(this.camera.position.x - c.x, this.camera.position.z - c.z), 0);
      d.scale.set(thick, len * (0.55 + env * 0.75), 1);
      d.updateMatrix();
      glyphs.setMatrixAt(n, d.matrix);

      const col = this._classColor(c.cls, env > 0.72);
      const boost = 0.45 + env * 0.75;
      glyphs.setColorAt(n, col.multiplyScalar(boost));
      n += 1;
    }

    // Las ranuras no usadas se sacan de cuadro en vez de borrarse: mover una
    // matriz cuesta menos que reconstruir el atributo.
    d.position.set(0, -9999, 0);
    d.rotation.set(0, 0, 0);
    d.scale.set(1, 1, 1);
    d.updateMatrix();
    for (let i = n; i < Antifonia.GLYPH_POOL; i++) glyphs.setMatrixAt(i, d.matrix);

    glyphs.count = Antifonia.GLYPH_POOL;
    glyphs.instanceMatrix.needsUpdate = true;
    if (glyphs.instanceColor) glyphs.instanceColor.needsUpdate = true;
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

    // llamadas ocurridas
    for (const nq of this.niche) {
      const x = xOf(nq.hour);
      const y1 = yOf(nq.hi), y2 = yOf(nq.lo);
      const c = this._classColor(nq.cls, true);
      g.fillStyle = `rgba(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0},0.55)`;
      g.fillRect(x - 1, y1, 2.5, Math.max(1.5, y2 - y1));
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
        `<br><span style="opacity:.55">inspirado en AveRosetta™ · NeotropicalScience</span>`;
    }
  }

  // ══ superficie para el puente ══════════════════════════════════════════

  setMasterVol(o) { this.tgt.vol = this._num(o, this.tgt.vol); }
  setTimeDilation(o) { this.tgt.time = this._num(o, this.tgt.time); }
  setSpectralShift(o) { this.tgt.spectral = this._num(o, this.tgt.spectral); }
  setSpatialSpread(o) { this.tgt.spatial = this._num(o, this.tgt.spatial); }
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
  getSpread() { return Math.max(0, Math.min(1, this.ctl.spatial)); }
  getHour() { return this.hour; }

  // Cola de llamadas para SC. Devuelve y VACÍA: el puente es el único
  // consumidor, y si nadie drena, _emit deja de encolar en 24 para que una
  // pestaña en segundo plano no acumule una avalancha.
  getPendingCalls() {
    if (this._pending.length === 0) return null;
    const out = this._pending;
    this._pending = [];
    return out;
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
  getActiveSpecies() {
    for (let i = this.calls.length - 1; i >= 0; i--) {
      const c = this.calls[i];
      if (c.cls !== "biofonia") continue;
      const src = this._srcByKey.get(c.key);
      if (!src) continue;
      return {
        sci: src.sci,
        common: src.label,
        // El vocabulario de taxon lo fija PhenologicalCalendar; se elige el
        // más cercano por fuente en vez de un único valor para todo.
        taxon: Antifonia.TAXON[src.key] || "birds",
        family: null,
        peakDay: null,
        day: Math.floor(this.hour),
        sensitive: false,
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
