/*
@nwWrld name: DarkForest
@nwWrld category: 3D
@nwWrld imports: BaseThreeJsModule, THREE, loadJson
*/

/* ════════════════════════════════════════════════════════════════════════
 * DARKFOREST — interfaz al mundo carbono/bio/natural  ·  switch [F]
 * bosque seco tropical · Reserva Manakai (Planeta Rica, Córdoba, Colombia)
 * ------------------------------------------------------------------------
 * No es un cuadro decorativo: es un INSTRUMENTO de lectura. El bosque se
 * presenta como una PILA OSCURA (dark stack) de estratos legibles, al modo
 * del "Naturgemälde" de Alexander von Humboldt (su corte del Chimborazo,
 * 1807): un eje vertical donde cada banda de altura aloja una comunidad y
 * sus intercambios. Aquí los estratos van de la RED MICORRÍCICA (subsuelo)
 * a la ATMÓSFERA (intercambio de carbono), y cada nivel se rotula para que
 * el ojo entienda dónde está parado.
 *
 * Sobre ese corte topográfico corren VECTORES DE FLUJO —flechas de datos que
 * aparecen y se desvanecen— nombrando interacciones concretas: fotosíntesis,
 * micorriza (C↔N,P), polinización, dispersión, herbivoría, descomposición,
 * respiración del suelo, depredación. Las especies son glifos vectorizados
 * (línea, no esfera) con su nombre científico, ubicadas en su estrato.
 *
 * Dos superficies de texto, al modo de las fachadas de datos del New York
 * Times (la instalación "Moveable Type" en el lobby + el zipper de titulares
 * de Times Square): (1) una REJILLA tipo Moveable Type que parpadea cifras,
 * hashes y fragmentos de nombres y que aparece/desaparece según el pulso de
 * la red, y (2) un TICKER que repta abajo. Más una TERMINAL que teclea en
 * vivo el registro del bosque. Tipografía monoespaciada/8-bit, sin brillos.
 *
 * Sinestesia: los 5 controles de index.html (Master Vol, Pitch Shift, Time
 * Dilat, Spectral Sh, Spatial Sprd) y el ingreso ETH (txInfluence + /eco/*)
 * mueven a la vez el drone y la imagen. La vitalidad acumulada vuelve al
 * drone (reverse-breath). El espectador puede rotar y hacer zoom: la cámara
 * es suya; los datos son del bosque.
 *
 * Implementación: THREE core, sólo materiales integrados (Line/Sprite/Points,
 * sin ShaderMaterial crudo → sin fog-crash). El brillo se reserva a pocos
 * elementos activos (cabezas de flujo, pulsos de carbono).
 * ════════════════════════════════════════════════════════════════════════ */

class DarkForest extends BaseThreeJsModule {

  // ── controls (mirror index.html) + ETH affects ──────────────────────────
  static methods = [
    { name: "setMasterVol",     executeOnLoad: true,  options: [{ name: "level", defaultVal: 0.5, type: "number", min: 0, max: 1 }] },
    { name: "setPitchShift",    executeOnLoad: true,  options: [{ name: "value", defaultVal: 0.5, type: "number", min: 0, max: 1 }] },
    { name: "setTimeDilation",  executeOnLoad: true,  options: [{ name: "value", defaultVal: 0.3, type: "number", min: 0, max: 1 }] },
    { name: "setSpectralShift", executeOnLoad: true,  options: [{ name: "value", defaultVal: 0.4, type: "number", min: 0, max: 1 }] },
    { name: "setSpatialSpread", executeOnLoad: true,  options: [{ name: "value", defaultVal: 0.5, type: "number", min: 0, max: 1 }] },
    { name: "setCoherence",     executeOnLoad: false, options: [{ name: "value", defaultVal: 0.5, type: "number", min: 0, max: 1 }] },
    { name: "pulse",            executeOnLoad: false, options: [{ name: "intensity", defaultVal: 1.4, type: "number", min: 0.3, max: 4 }] },
    { name: "triggerCO2",        executeOnLoad: false, options: [{ name: "amount", defaultVal: 50, type: "number", min: 10, max: 200 }] },
    { name: "triggerMycoPulse",  executeOnLoad: false, options: [{ name: "intensity", defaultVal: 1, type: "number", min: 0.1, max: 5 }] },
    { name: "triggerPhosphorus", executeOnLoad: false, options: [{ name: "amount", defaultVal: 30, type: "number", min: 10, max: 100 }] },
    { name: "triggerNitrogen",   executeOnLoad: false, options: [{ name: "amount", defaultVal: 30, type: "number", min: 10, max: 100 }] },
    { name: "whisper",           executeOnLoad: false, options: [{ name: "text", defaultVal: "", type: "string" }] },
  ];

  // Dark, technical palette — phosphor on near-black, naturalist accents.
  static PALETTE = {
    bg:         "#05080B",
    fog:        "#05080B",
    grid:       "#16302F",   // dim structural teal
    gridHi:     "#2C5E5C",
    axis:       "#3A6E5E",
    ivory:      "#C7D3CB",
    carbon:     "#E8A22A",   // C flux — amber
    carbonHot:  "#FFC24A",
    bios:       "#74B86A",   // photosynthesis / biotic — green
    biosHi:     "#A6E08A",
    nutrient:   "#4F86C6",   // N · P · water — blue
    fungal:     "#B5733C",   // mycorrhiza / decomposition — rust
    predation:  "#FF5A39",   // predation / alert — signal red
    term:       "#86E6BE",   // terminal text — phosphor green
  };

  // Humboldt stack — top (atmosphere) to bottom (mycorrhizal net).
  static STRATA = [
    { key: "atmosfera",  label: "ATMÓSFERA",        sub: "intercambio de carbono", y:  7.2, accent: "carbon"   },
    { key: "emergentes", label: "EMERGENTES",       sub: "copas · 30–45 m",        y:  5.0, accent: "bios"     },
    { key: "dosel",      label: "DOSEL",            sub: "canopy · fotosíntesis",  y:  3.2, accent: "bios"     },
    { key: "sotobosque", label: "SOTOBOSQUE",       sub: "understory · 2–10 m",    y:  1.4, accent: "bios"     },
    { key: "suelo",      label: "SUELO·HOJARASCA",  sub: "descomposición",         y: -0.3, accent: "fungal"   },
    { key: "micorriza",  label: "RED MICORRÍCICA",  sub: "C ↔ N · P (subsuelo)",   y: -2.3, accent: "fungal"   },
  ];

  // ── eDNA regional → estrato ────────────────────────────────────────────
  // window.__ednaBio carries eight Colombian biogeographic regions in
  // EDNA_IDS order (CHO AMZ COR CAR ORI PAC MAG GUA). There are six strata, so
  // the last two wrap; a stratum fed by two regions takes their mean. The
  // weight modulates how strongly that stratum's exchanges read — it shifts
  // which flows feel active, it does not add or remove anything drawn.
  // Until now these eight sliders reached no module at all: they merely took
  // turns overwriting one shared spectralShift.
  static REGION_STRATUM = [2, 3, 1, 0, 4, 2, 5, 4];

  // Bosque seco tropical, Colombia — real assemblage, placed by stratum.
  // [sci, common, taxon(glyph), stratum]
  static SPECIES = [
    ["Ceiba pentandra",          "ceiba",            "tree",   "emergentes"],
    ["Cavanillesia platanifolia","macondo",          "tree",   "emergentes"],
    ["Enterolobium cyclocarpum", "orejero",          "tree",   "emergentes"],
    ["Hymenaea courbaril",       "algarrobo",        "tree",   "dosel"],
    ["Astronium graveolens",     "gusanero",         "tree",   "dosel"],
    ["Handroanthus billbergii",  "guayacán",         "tree",   "dosel"],
    ["Bursera simaruba",         "indio desnudo",    "tree",   "dosel"],
    ["Pseudobombax septenatum",  "ceibo verde",      "tree",   "dosel"],
    ["Crax alberti",             "paujil piquiazul", "bird",   "dosel"],
    ["Ortalis garrula",          "guacharaca",       "bird",   "dosel"],
    ["Amazilia saucerottei",     "colibrí",          "bird",   "sotobosque"],
    ["Melanerpes rubricapillus", "carpintero",       "bird",   "dosel"],
    ["Saguinus oedipus",         "tití cabeciblanco","primate","dosel"],
    ["Alouatta seniculus",       "mono aullador",    "primate","dosel"],
    ["Leopardus pardalis",       "ocelote",          "cat",    "sotobosque"],
    ["Cattleya trianae",         "orquídea",         "orchid", "sotobosque"],
    ["Stenocereus griseus",      "cardón",           "cactus", "sotobosque"],
    ["Bromelia chrysantha",      "piñuela",          "bromel", "sotobosque"],
    ["Iguana iguana",            "iguana",           "reptile","sotobosque"],
    ["Boa constrictor",          "boa",              "snake",  "suelo"],
    ["Crocodylus acutus",        "caimán aguja",     "croc",   "suelo"],
    ["Atta cephalotes",          "hormiga arriera",  "ant",    "suelo"],
    ["Dichotomius",              "escarabajo",       "beetle", "suelo"],
    ["Rhizophagus irregularis",  "micorriza",        "fungus", "micorriza"],
    ["Glomus",                   "hongo MA",         "fungus", "micorriza"],
  ];

  // Interaction templates — concrete ecological vectors (from → to, type).
  // resolve() picks real anchors (species key or stratum key) at spawn time.
  static INTERACTIONS = [
    { type: "carbon",    label: "fotosíntesis CO₂→C", from: "@atmosfera", to: "Ceiba pentandra" },
    { type: "carbon",    label: "fijación de carbono", from: "@atmosfera", to: "Handroanthus billbergii" },
    { type: "fungal",    label: "micorriza C→hongo",   from: "Ceiba pentandra", to: "Rhizophagus irregularis" },
    { type: "nutrient",  label: "micorriza N·P→raíz",  from: "Rhizophagus irregularis", to: "Hymenaea courbaril" },
    { type: "nutrient",  label: "fijación N (legumin.)", from: "@micorriza", to: "Enterolobium cyclocarpum" },
    { type: "bios",      label: "polinización",        from: "Amazilia saucerottei", to: "Handroanthus billbergii" },
    { type: "bios",      label: "dispersión semillas", from: "Saguinus oedipus", to: "Cattleya trianae" },
    { type: "bios",      label: "dispersión semillas", from: "Crax alberti", to: "@suelo" },
    { type: "bios",      label: "herbivoría · corte",  from: "Atta cephalotes", to: "Astronium graveolens" },
    { type: "fungal",    label: "cultivo de hongo",    from: "Atta cephalotes", to: "Glomus" },
    { type: "fungal",    label: "descomposición C→suelo", from: "@suelo", to: "Dichotomius" },
    { type: "carbon",    label: "respiración suelo C→atm", from: "@suelo", to: "@atmosfera" },
    { type: "predation", label: "depredación",         from: "Leopardus pardalis", to: "Saguinus oedipus" },
    { type: "predation", label: "depredación",         from: "Boa constrictor", to: "Iguana iguana" },
  ];

  static GLYPH_OF = {
    carbon: "carbon", nutrient: "nutrient", bios: "bios", fungal: "fungal", predation: "predation",
  };

  // ───────────────────────────────────────────────────────────────────────
  constructor(container) {
    super(container);

    this._t = 0;
    this._last = performance.now();
    this._animationId = null;

    this.ctl = { vol: 0.5, pitch: 0.5, time: 0.3, spectral: 0.4, spatial: 0.5 };
    this.tgt = { vol: 0.5, pitch: 0.5, time: 0.3, spectral: 0.4, spatial: 0.5 };
    this.coherence = 0.5; this.coherenceTgt = 0.5;
    this.vitality = 0.0; this.ethPressure = 0.0; this.ethPressureTgt = 0.0;
    this.pulseAmt = 0.0;
    this.focusY = 1.0;

    this.species = [];       // {sci, common, taxon, stratum, pos, sprite, mark}
    this.strata = [];        // {def, y, group, labelSprite, lines}
    this.flows = [];         // active data-flow vectors
    // Per-stratum weight from the eDNA regions. 0.5 = neutral, so the scene
    // starts exactly as it did before the regions reached it.
    this.stratumW = new Array(DarkForest.STRATA.length).fill(0.5);
    this.tgtStratum = new Array(DarkForest.STRATA.length).fill(0.5);
    this._flowSpawnBudget = 0;
    this._carbon = [];       // carbon field arrows
    this._co2ppm = 416;      // simulated atmospheric reading, drifts

    // HUD / text
    this._logQueue = [];
    this._logHistory = [];
    this._typing = { target: "", shown: 0 };
    this._crawl = { text: "", x: 0 };
    this._facadeVisible = 0;     // 0..1 eased
    this._facadeWant = 0;
    this._facadeCells = null;
    this._facadeTick = 0;
    this._cursorBlink = 0;

    this.init();
  }

  // ───────────────────────────────────────────────────────────────────────
  init() {
    if (!THREE) return;
    const P = DarkForest.PALETTE;

    this.scene.background = new THREE.Color(P.bg);
    // subtle linear fog for depth — built-in materials only, safe.
    this.scene.fog = new THREE.Fog(new THREE.Color(P.fog), 16, 52);

    // Camera owned by the viewer (OrbitControls). Frame the whole stack.
    this.camera.fov = 52;
    this.camera.near = 0.1;
    this.camera.far = 200;
    this.camera.position.set(11, 4.5, 18);
    this.camera.updateProjectionMatrix();

    if (this.controls) {
      this.controls.enabled = true;
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.06;
      this.controls.enablePan = true;
      this.controls.enableZoom = true;
      this.controls.enableRotate = true;
      this.controls.minDistance = 7;
      this.controls.maxDistance = 70;
      this.controls.maxPolarAngle = Math.PI * 0.92;
      this.controls.target.set(0, 2.2, 0);
      this.controls.update();
    }

    // minimal unlit scene — almost everything is line/sprite, so light is faint.
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    this.world = new THREE.Group();
    this.scene.add(this.world);

    this._buildTerrain();
    this._buildAxisAndStrata();
    this._buildSpecies();
    this._buildCarbonField();
    this._haloTex = this._radialTexture();
    this._buildHUD();

    // seed the terminal
    this._pushLog("DARKFOREST · bosque seco tropical");
    this._pushLog("Reserva Manakai — Planeta Rica, Córdoba, CO");
    this._pushLog("sistema en línea ▸ esperando flujo ETH…");

    this.show();
    this._animate = this._animate.bind(this);
    this._animationId = requestAnimationFrame(this._animate);
  }

  // ── TERRAIN — Humboldt topographic cross-section (height-coloured wire) ──
  _buildTerrain() {
    const P = DarkForest.PALETTE;
    const W = 30, D = 22, SX = 60, SZ = 44;
    const plane = new THREE.PlaneGeometry(W, D, SX, SZ);
    const pos = plane.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      pos.setZ(i, this._terrainHeight(x, y));
    }
    plane.computeVertexNormals();
    plane.rotateX(-Math.PI / 2);   // lie flat → Z height becomes world Y
    const wire = new THREE.WireframeGeometry(plane);
    const wp = wire.attributes.position;
    const colors = new Float32Array(wp.count * 3);
    const cLow = new THREE.Color(P.grid), cHi = new THREE.Color(P.gridHi);
    const tmp = new THREE.Color();
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < wp.count; i++) { const y = wp.getY(i); if (y < minY) minY = y; if (y > maxY) maxY = y; }
    for (let i = 0; i < wp.count; i++) {
      const t = (wp.getY(i) - minY) / Math.max(0.001, maxY - minY);
      tmp.copy(cLow).lerp(cHi, t * t);
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    wire.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.45 });
    this.terrain = new THREE.LineSegments(wire, mat);
    this.terrain.position.y = DarkForest.STRATA[DarkForest.STRATA.length - 1].y - 1.4;
    this.world.add(this.terrain);
    this._terrainMat = mat;
  }

  _terrainHeight(x, z) {
    let h = 0;
    h += Math.sin(x * 0.34) * Math.cos(z * 0.4) * 0.62;
    h += Math.sin(x * 0.9 + 1.3) * Math.cos(z * 0.72 + 0.5) * 0.26;
    h += Math.sin(x * 1.7 + z * 0.6) * 0.12;
    h += Math.exp(-Math.pow(x * 0.17, 2)) * 0.9;      // central cordillera
    h += Math.exp(-Math.pow((x - 9) * 0.3, 2)) * 0.5; // a second ridge
    return h;
  }

  // ── AXIS + STRATA — the legible dark stack (tableau physique) ────────────
  _buildAxisAndStrata() {
    const P = DarkForest.PALETTE;
    const strata = DarkForest.STRATA;
    const xL = -7.6;   // left axis x
    const halfW = 7.0; // stratum plane half-width

    // vertical axis line + elevation ticks
    const axPts = [new THREE.Vector3(xL, strata[strata.length - 1].y - 0.6, 0),
                   new THREE.Vector3(xL, strata[0].y + 0.8, 0)];
    const axGeo = new THREE.BufferGeometry().setFromPoints(axPts);
    this.world.add(new THREE.Line(axGeo, new THREE.LineBasicMaterial({ color: new THREE.Color(P.axis), transparent: true, opacity: 0.7 })));

    this.strata = [];
    for (let s = 0; s < strata.length; s++) {
      const def = strata[s];
      const grp = new THREE.Group();
      grp.position.y = def.y;
      this.world.add(grp);

      const accent = new THREE.Color(P[def.accent]);
      // a thin framed grid for the stratum (so each level reads as a shelf)
      const lines = [];
      const z0 = -5, z1 = 5;
      // frame
      lines.push(new THREE.Vector3(xL, 0, z0), new THREE.Vector3(halfW, 0, z0));
      lines.push(new THREE.Vector3(halfW, 0, z0), new THREE.Vector3(halfW, 0, z1));
      lines.push(new THREE.Vector3(halfW, 0, z1), new THREE.Vector3(xL, 0, z1));
      lines.push(new THREE.Vector3(xL, 0, z1), new THREE.Vector3(xL, 0, z0));
      // a few interior rules
      for (let g = 1; g < 4; g++) {
        const zz = z0 + (z1 - z0) * (g / 4);
        lines.push(new THREE.Vector3(xL, 0, zz), new THREE.Vector3(halfW, 0, zz));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(lines);
      const mat = new THREE.LineBasicMaterial({ color: accent.clone(), transparent: true, opacity: 0.18 });
      const grid = new THREE.LineSegments(geo, mat);
      grp.add(grid);

      // axis tick
      const tickGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(xL - 0.35, 0, 0), new THREE.Vector3(xL, 0, 0)]);
      grp.add(new THREE.Line(tickGeo, new THREE.LineBasicMaterial({ color: accent.clone(), transparent: true, opacity: 0.8 })));

      // label sprite (8-bit canvas)
      const label = this._makeLabelSprite(def.label, def.sub, P[def.accent]);
      label.position.set(xL - 0.6, 0, 0);
      label.center.set(1, 0.5);  // right-align to the axis
      grp.add(label);

      this.strata.push({ def, y: def.y, group: grp, gridMat: mat, labelMat: label.material, accent });
    }
  }

  _strataByKey(key) { return this.strata.find((s) => s.def.key === key); }

  // ── SPECIES — vectorized Humboldt glyphs placed in their stratum ─────────
  _buildSpecies() {
    const P = DarkForest.PALETTE;
    const list = DarkForest.SPECIES;
    // distribute within each stratum band
    const byStratum = {};
    for (const r of list) (byStratum[r[3]] = byStratum[r[3]] || []).push(r);

    for (const key in byStratum) {
      const st = this._strataByKey(key);
      if (!st) continue;
      const rows = byStratum[key];
      const n = rows.length;
      for (let i = 0; i < n; i++) {
        const [sci, common, taxon] = rows[i];
        const accent = this._taxonColor(taxon, st.def.accent);
        const sprite = this._makeSpeciesSprite(sci, common, taxon, accent);
        const fx = (n === 1) ? 0 : (i / (n - 1) - 0.5);
        const x = fx * 11.0 + (Math.random() - 0.5) * 0.6;
        const z = (Math.random() - 0.5) * 7.0;
        const baseY = st.y + 0.55 + (Math.random() - 0.5) * 0.3;
        sprite.position.set(x, baseY, z);
        this.world.add(sprite);

        // a small vectorized "stem" dropping the glyph to its stratum line
        const stemGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(x, st.y + 0.02, z), new THREE.Vector3(x, baseY - 0.35, z)]);
        const stem = new THREE.Line(stemGeo, new THREE.LineBasicMaterial({
          color: new THREE.Color(accent), transparent: true, opacity: 0.35 }));
        this.world.add(stem);

        // a node mark at the stratum line (anchor for flows)
        const anchor = new THREE.Vector3(x, st.y + 0.02, z);
        this.species.push({ sci, common, taxon, stratum: key, pos: anchor, glyphPos: sprite.position.clone(),
          sprite, stem, accent, baseY, phase: Math.random() * Math.PI * 2 });
      }
    }
  }

  _taxonColor(taxon, accentKey) {
    const P = DarkForest.PALETTE;
    switch (taxon) {
      case "tree": case "orchid": case "cactus": case "bromel": return P.bios;
      case "bird": case "primate": return P.biosHi;
      case "cat": case "snake": case "croc": case "reptile": return P.predation;
      case "ant": case "beetle": return P.fungal;
      case "fungus": return P.fungal;
      default: return P[accentKey] || P.ivory;
    }
  }

  _speciesByKey(sci) { return this.species.find((s) => s.sci === sci); }

  // ── CARBON FIELD — vertical flux arrows, appear/disappear ────────────────
  _buildCarbonField() {
    const P = DarkForest.PALETTE;
    this.carbonGroup = new THREE.Group();
    this.world.add(this.carbonGroup);
    const atm = this._strataByKey("atmosfera").y;
    const soil = this._strataByKey("suelo").y;
    for (let i = 0; i < 22; i++) {
      const x = (Math.random() - 0.5) * 12;
      const z = (Math.random() - 0.5) * 8;
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.0, 0)]);
      const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(P.carbon), transparent: true, opacity: 0, blending: THREE.AdditiveBlending });
      const line = new THREE.Line(geo, mat);
      line.position.set(x, soil, z);
      this.carbonGroup.add(line);
      this._carbon.push({ line, mat, x, z, atm, soil, phase: Math.random() * Math.PI * 2, dir: Math.random() < 0.5 ? 1 : -1, life: 0 });
    }
  }

  // ── DATA-FLOW VECTORS — arrows that draw on, hold, and fade ──────────────
  _spawnInteraction(tpl) {
    const from = this._resolveAnchor(tpl.from);
    const to = this._resolveAnchor(tpl.to);
    if (!from || !to) return;
    this._spawnFlow(from, to, tpl.type, tpl.label);
  }

  _resolveAnchor(ref) {
    if (typeof ref === "string" && ref[0] === "@") {
      const st = this._strataByKey(ref.slice(1));
      if (!st) return null;
      return new THREE.Vector3((Math.random() - 0.5) * 9, st.y + 0.1, (Math.random() - 0.5) * 6);
    }
    const sp = this._speciesByKey(ref);
    return sp ? sp.pos.clone() : null;
  }

  _spawnFlow(from, to, type, label) {
    if (this.flows.length > 26) return; // keep the field readable
    const P = DarkForest.PALETTE;
    const colHex = P[type] || P.ivory;
    // arc path (quadratic bezier), bowed perpendicular for legibility
    const mid = from.clone().add(to).multiplyScalar(0.5);
    const dir = to.clone().sub(from);
    const perp = new THREE.Vector3(-dir.z, dir.length() * 0.18, dir.x).normalize();
    const ctrl = mid.add(perp.multiplyScalar(0.6 + Math.random() * 0.8));
    const N = 24;
    const pts = [];
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1), it = 1 - t;
      pts.push(from.clone().multiplyScalar(it * it).addScaledVector(ctrl, 2 * it * t).addScaledVector(to, t * t));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    geo.setDrawRange(0, 1);
    const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(colHex), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending });
    const line = new THREE.Line(geo, mat);
    this.world.add(line);

    // arrowhead cone
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.07, 0.22, 6),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(colHex), transparent: true, opacity: 0, blending: THREE.AdditiveBlending }));
    this.world.add(cone);

    // glow head (one of the few glowing elements)
    const head = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._haloTex, color: new THREE.Color(colHex), transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: false }));
    head.scale.setScalar(0.5);
    this.world.add(head);

    // typed label
    const lbl = this._makeFlowLabel(label, colHex);
    lbl.position.copy(ctrl);
    this.world.add(lbl);

    // Nearest stratum to the flow's control point — lets the regional weight
    // find the flow without changing any spawn call site.
    let sIdx = 0, sBest = Infinity;
    for (let j = 0; j < DarkForest.STRATA.length; j++) {
      const d = Math.abs(DarkForest.STRATA[j].y - ctrl.y);
      if (d < sBest) { sBest = d; sIdx = j; }
    }
    this.flows.push({ line, mat, geo, cone, head, lbl, pts, N, type, sIdx,
      t: 0, draw: 0, life: 3.4 + Math.random() * 2.2, age: 0, label, colHex });

    // also log it to the terminal + crawl
    this._pushLog(`▸ ${label}`);
  }

  // ───────────────────────────────────────────────────────────────────────
  // HUD — three text surfaces (DOM overlays over the WebGL canvas)
  // ───────────────────────────────────────────────────────────────────────
  _buildHUD() {
    const P = DarkForest.PALETTE;
    // try to pull a pixel/mono webfont; silently falls back to system mono.
    try {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=VT323&family=Share+Tech+Mono&display=swap";
      document.head.appendChild(link);
      this._fontLink = link;
    } catch (e) { /* offline / CSP — fall back to monospace */ }
    const MONO = "'VT323','Share Tech Mono','Courier New',monospace";

    // 1 · TERMINAL (top-left) — live typing log
    this._term = document.createElement("div");
    this._term.style.cssText = [
      "position:absolute", "left:16px", "top:14px", "width:42%", "max-width:520px",
      "font-family:" + MONO, "font-size:16px", "line-height:1.35", "color:" + P.term,
      "letter-spacing:0.6px", "text-transform:uppercase", "white-space:pre-wrap",
      "pointer-events:none", "z-index:30", "text-shadow:0 0 1px rgba(0,0,0,.9)",
      "border-left:2px solid " + P.term + "55", "padding-left:10px", "opacity:0.92",
    ].join(";");
    this.elem.appendChild(this._term);

    // 2 · MOVEABLE TYPE FACADE (right) — flickering data grid, appears/disappears
    this._facade = document.createElement("div");
    this._facade.style.cssText = [
      "position:absolute", "right:16px", "top:14px", "width:34%", "max-width:420px",
      "font-family:" + MONO, "font-size:13px", "line-height:1.15", "color:" + P.ivory,
      "letter-spacing:1px", "white-space:pre", "pointer-events:none", "z-index:30",
      "text-align:right", "opacity:0",
      "text-shadow:0 0 1px rgba(0,0,0,.9)",
    ].join(";");
    this.elem.appendChild(this._facade);
    this._facadeCols = 26; this._facadeRows = 16;
    this._facadeCells = [];
    for (let r = 0; r < this._facadeRows; r++) {
      const row = [];
      for (let c = 0; c < this._facadeCols; c++) row.push(this._facadeChar());
      this._facadeCells.push(row);
    }

    // 3 · TICKER CRAWL (bottom) — horizontal headline zipper
    this._ticker = document.createElement("div");
    this._ticker.style.cssText = [
      "position:absolute", "left:0", "right:0", "bottom:10px", "height:22px",
      "font-family:" + MONO, "font-size:15px", "line-height:22px", "color:" + P.carbonHot,
      "letter-spacing:1.5px", "text-transform:uppercase", "white-space:nowrap",
      "pointer-events:none", "z-index:30", "overflow:hidden",
      "border-top:1px solid " + P.carbon + "44", "border-bottom:1px solid " + P.carbon + "44",
      "padding-top:1px", "text-shadow:0 0 2px rgba(0,0,0,.9)",
    ].join(";");
    this._tickerInner = document.createElement("span");
    this._tickerInner.style.cssText = "display:inline-block;padding-left:100%;will-change:transform;";
    this._ticker.appendChild(this._tickerInner);
    this.elem.appendChild(this._ticker);
    this._crawlText = "DARKFOREST ▸ bosque seco tropical ▸ Reserva Manakai ▸ ";
    this._crawlX = 0;
  }

  _facadeChar() {
    const r = Math.random();
    if (r < 0.62) return "0123456789ABCDEF"[(Math.random() * 16) | 0];
    if (r < 0.74) return ".";
    if (r < 0.82) return "·";
    if (r < 0.9) return "▸";
    if (r < 0.96) return "+";
    return " ";
  }

  // ── controls ─────────────────────────────────────────────────────────────
  setMasterVol({ level = 0.5 } = {})     { this.tgt.vol = this._c01(level); }
  setPitchShift({ value = 0.5 } = {})    { this.tgt.pitch = this._c01(value); }
  setTimeDilation({ value = 0.3 } = {})  { this.tgt.time = this._c01(value); }
  setSpectralShift({ value = 0.4 } = {}) { this.tgt.spectral = this._c01(value); }
  setSpatialSpread({ value = 0.5 } = {}) { this.tgt.spatial = this._c01(value); }
  setCoherence({ value = 0.5 } = {})     { this.coherenceTgt = this._c01(value); }
  _c01(v) { v = Number(v); return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.5; }

  // ── ETH affects ──────────────────────────────────────────────────────────
  pulse({ intensity = 1.4 } = {}) {
    this.pulseAmt = Math.min(4, this.pulseAmt + intensity);
    for (const f of this.flows) f.life += 0.6;
    this._facadeWant = 1;
    this._pushLog(`■ PARLAMENTO · pulso ${intensity.toFixed(1)}`);
  }
  triggerCO2({ amount = 50 } = {}) {
    this._spawnInteraction(DarkForest.INTERACTIONS[(Math.random() < 0.5) ? 0 : 11]);
    this._co2ppm = Math.min(520, this._co2ppm + amount * 0.04);
    this.vitality = Math.min(1, this.vitality + amount / 320);
    this._pulseCarbon(Math.max(3, (amount / 200) * 10), 1);
    this._facadeWant = 1;
    this._pushLog(`CO₂ ${this._co2ppm.toFixed(0)}ppm ▸ fotosíntesis +${(amount / 200).toFixed(2)}`);
  }
  triggerMycoPulse({ intensity = 1 } = {}) {
    this._spawnInteraction(DarkForest.INTERACTIONS[2]);
    this._spawnInteraction(DarkForest.INTERACTIONS[3]);
    this.vitality = Math.min(1, this.vitality + 0.08 * intensity);
    const st = this._strataByKey("micorriza"); if (st) st._flash = 1.0;
    this._facadeWant = 1;
    this._pushLog(`RED MICORRÍCICA ▸ señal ${intensity.toFixed(2)}`);
  }
  triggerPhosphorus({ amount = 30 } = {}) {
    this._spawnInteraction(DarkForest.INTERACTIONS[3]);
    this.vitality = Math.min(1, this.vitality + amount / 360);
    this._pushLog(`P +${(amount / 100).toFixed(2)} ▸ micorriza → raíz`);
  }
  triggerNitrogen({ amount = 30 } = {}) {
    this._spawnInteraction(DarkForest.INTERACTIONS[4]);
    this.vitality = Math.min(1, this.vitality + amount / 360);
    this._pushLog(`N +${(amount / 100).toFixed(2)} ▸ fijación (leguminosas)`);
  }
  whisper({ text = "" } = {}) { if (text) this._pushLog(`· ${text}`); }

  getVitality() { return this.vitality; }
  getCoherence() { return this.coherence; }

  _pulseCarbon(count, dir) {
    let lit = 0;
    for (const c of this._carbon) {
      if (c.life > 0.1) continue;
      c.life = 1.0; c.dir = dir;
      if (++lit >= count) break;
    }
  }

  // ── terminal log queue ────────────────────────────────────────────────────
  _pushLog(line) {
    this._logQueue.push(String(line).slice(0, 64));
    if (this._logQueue.length > 30) this._logQueue.shift();
    // feed the crawl too
    this._crawlText += String(line).replace(/\n/g, " ") + "   ▸   ";
    if (this._crawlText.length > 1600) this._crawlText = this._crawlText.slice(-1200);
  }

  // ───────────────────────────────────────────────────────────────────────
  // LOOP
  // ───────────────────────────────────────────────────────────────────────
  _animate() {
    this._animationId = requestAnimationFrame(this._animate);
    if (this.destroyed || !this.renderer || !this.scene || !this.camera) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;
    this._t += dt;

    this._readControls();
    this._updateControls(dt);
    if (this.controls) this.controls.update();

    this._updateStrata(dt);
    this._updateSpecies(dt);
    this._updateSpawning(dt);
    this._updateFlows(dt);
    this._updateCarbon(dt);
    this._updateTerrain(dt);
    this._updateText(dt);

    this.pulseAmt = Math.max(0, this.pulseAmt - dt * 1.2);
    this.vitality = Math.max(0, this.vitality - dt * 0.12);
    this._co2ppm += (416 - this._co2ppm) * dt * 0.05; // slow relax to baseline

    this.renderer.render(this.scene, this.camera);
  }

  _readControls() {
    let sp = null;
    try { sp = (typeof window !== "undefined") ? window.__sonethParams : null; } catch (e) { sp = null; }
    if (!sp) return;
    if (typeof sp.volume === "number") this.tgt.vol = sp.volume;
    if (typeof sp.pitchshift === "number") this.tgt.pitch = sp.pitchshift;
    if (typeof sp.timedilation === "number") this.tgt.time = sp.timedilation;
    if (typeof sp.spectralshift === "number") this.tgt.spectral = sp.spectralshift;
    if (typeof sp.spatialspread === "number") this.tgt.spatial = sp.spatialspread;
    if (typeof sp.txInfluence === "number") this.ethPressureTgt = sp.txInfluence;

    // Regional eDNA — same contract, same smoothing as everything above.
    let eb = null;
    try { eb = (typeof window !== "undefined") ? window.__ednaBio : null; } catch (e) { eb = null; }
    if (Array.isArray(eb)) {
      const sum = new Array(DarkForest.STRATA.length).fill(0);
      const n = new Array(DarkForest.STRATA.length).fill(0);
      for (let i = 0; i < eb.length && i < DarkForest.REGION_STRATUM.length; i++) {
        const v = eb[i];
        if (typeof v === "number" && isFinite(v)) {
          const j = DarkForest.REGION_STRATUM[i];
          sum[j] += v; n[j]++;
        }
      }
      for (let j = 0; j < sum.length; j++) {
        if (n[j] > 0) this.tgtStratum[j] = sum[j] / n[j];
      }
    }
  }

  _updateControls(dt) {
    const k = 1 - Math.pow(0.0015, dt);
    this.ctl.vol += (this.tgt.vol - this.ctl.vol) * k;
    this.ctl.pitch += (this.tgt.pitch - this.ctl.pitch) * k;
    this.ctl.time += (this.tgt.time - this.ctl.time) * k;
    this.ctl.spectral += (this.tgt.spectral - this.ctl.spectral) * k;
    this.ctl.spatial += (this.tgt.spatial - this.ctl.spatial) * k;
    this.coherence += (this.coherenceTgt - this.coherence) * k;
    this.ethPressure += (this.ethPressureTgt - this.ethPressure) * k;
    for (let j = 0; j < this.stratumW.length; j++) {
      this.stratumW[j] += (this.tgtStratum[j] - this.stratumW[j]) * k;
    }

    // Spatial Sprd → horizontal scale of the whole stack (tight ↔ diffuse)
    if (this.world) {
      const sx = THREE.MathUtils.lerp(0.8, 1.4, this.ctl.spatial);
      this.world.scale.x += (sx - this.world.scale.x) * k;
      this.world.scale.z += (sx - this.world.scale.z) * k;
    }
    // Pitch Shift → which stratum is "in focus" (top↔bottom of the stack)
    const topY = DarkForest.STRATA[0].y, botY = DarkForest.STRATA[DarkForest.STRATA.length - 1].y;
    this.focusY = THREE.MathUtils.lerp(botY, topY, this.ctl.pitch);
    // ETH inflow → vitality (feeds reverse-breath drone)
    this.vitality = Math.min(1, this.vitality + this.ethPressure * dt * 0.16);
    // Consenso → rectitud de los vectores de flujo. Acuerdo alto: los
    // intercambios van derecho de un estrato a otro. Acuerdo bajo: serpentean.
    this.flowJitter = (1 - this.coherence) * 0.5;
  }

  // Spectral Shift → palette temperature on structural lines (cool↔warm)
  _structureColor() {
    const P = DarkForest.PALETTE;
    const cool = new THREE.Color(P.gridHi), warm = new THREE.Color(P.carbon);
    const c = cool.lerp(warm, Math.max(0, Math.min(1, (this.ctl.spectral - 0.4) * 1.6 + 0.1)));
    // CONSENSO. Hasta ahora `coherence` entraba por setCoherence, se suavizaba
    // en _updateControls y no la leía NINGUNA ruta de dibujo: el deslizador de
    // consenso llegaba a este slot y moría en un campo. Sólo salía otra vez
    // como harmonicrich hacia SC, es decir, cambiaba el sonido y otros slots
    // pero nunca esta imagen.
    //
    // Ahora la estructura se ORDENA con el acuerdo: a consenso alto las
    // líneas del estrato se afirman y enfrían; a consenso bajo se apagan y
    // se enturbian, que es lo que un bosque desacordado debería parecer.
    return c.multiplyScalar(0.55 + this.coherence * 0.65);
  }

  _updateStrata(dt) {
    const vol = this.ctl.vol;
    const struct = this._structureColor();
    for (const s of this.strata) {
      // focus: nearest stratum to focusY brightens, others dim (legible level)
      const d = Math.abs(s.y - this.focusY);
      const focus = Math.max(0, 1 - d / 2.2);
      if (s.def._flash === undefined) s.def._flash = 0;
      const flash = s.def._flash || 0;
      s.gridMat.opacity = 0.1 + focus * 0.32 * (0.5 + vol) + flash * 0.4;
      s.gridMat.color.copy(s.accent).lerp(struct, 0.25);
      if (s.labelMat) s.labelMat.opacity = 0.45 + focus * 0.55 * (0.5 + 0.5 * vol);
      s.def._flash = Math.max(0, flash - dt * 1.4);
    }
  }

  _updateSpecies(dt) {
    const vol = this.ctl.vol;
    for (const sp of this.species) {
      // a faint living bob; legibility preserved (sprites face camera)
      sp.sprite.position.y = sp.baseY + Math.sin(this._t * 0.6 + sp.phase) * 0.06;
      const d = Math.abs((sp.pos.y) - this.focusY);
      const focus = Math.max(0.35, 1 - d / 3.0);
      if (sp.sprite.material) sp.sprite.material.opacity = (0.55 + 0.45 * focus) * (0.6 + 0.4 * vol);
      if (sp.stem && sp.stem.material) sp.stem.material.opacity = 0.18 + 0.25 * focus;
    }
  }

  _updateSpawning(dt) {
    // continuous data flow: rate rises with ETH pressure + master vol + pulses
    const td = this.ctl.time;
    const speedScale = THREE.MathUtils.lerp(1.5, 0.4, td);
    const rate = (0.35 + this.ethPressure * 4.5 + this.pulseAmt * 0.4) * (0.5 + this.ctl.vol * 0.9) * speedScale;
    this._flowSpawnBudget += dt * rate;
    let guard = 0;
    while (this._flowSpawnBudget >= 1 && guard < 6) {
      this._flowSpawnBudget -= 1; guard++;
      const tpl = DarkForest.INTERACTIONS[(Math.random() * DarkForest.INTERACTIONS.length) | 0];
      this._spawnInteraction(tpl);
      if (this.ethPressure > 0.15) this._facadeWant = 1;
    }
    // occasional ambient carbon flux even when quiet
    if (Math.random() < dt * (0.6 + this.ethPressure * 2)) this._pulseCarbon(1 + ((Math.random() * 3) | 0), Math.random() < 0.6 ? 1 : -1);
    // facade fade target relaxes when network is quiet
    this._facadeWant *= (1 - dt * 0.25);
    if (this.ethPressure > 0.2 || this.pulseAmt > 0.3) this._facadeWant = 1;
  }

  _updateFlows(dt) {
    const td = this.ctl.time;
    const drawSpeed = THREE.MathUtils.lerp(2.4, 0.7, td);
    const up = new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion();
    const tmpDir = new THREE.Vector3();
    for (let i = this.flows.length - 1; i >= 0; i--) {
      const f = this.flows[i];
      f.age += dt;
      f.draw = Math.min(1, f.draw + dt * drawSpeed);
      const drawn = Math.max(1, Math.floor(f.draw * f.N));
      f.geo.setDrawRange(0, drawn);
      const headPt = f.pts[Math.min(f.N - 1, drawn - 1)];
      const glowBase = 0.4 + this.ctl.vol * 0.6;

      // fade in then out across life
      let env;
      if (f.draw < 1) env = f.draw;
      else { const rem = f.life - (f.age); env = Math.max(0, Math.min(1, rem / 1.2)); }
      // Regional weight as a gentle multiplier (0.6–1.0): raising a region
      // brings its stratum's exchanges forward without erasing the others.
      const rw = 0.6 + (this.stratumW[f.sIdx !== undefined ? f.sIdx : 0] * 0.4);
      f.mat.opacity = (0.25 + 0.6 * env) * glowBase * rw;

      // Consenso → rectitud. La cabeza del flujo serpentea cuando la sala no
      // está de acuerdo y va derecha cuando sí. Es el mismo campo que ya
      // entraba por setCoherence y que hasta ahora no leía nada.
      const jit = this.flowJitter || 0;
      if (jit > 0.001) {
        headPt.x += Math.sin(this._t * 3.1 + i * 1.7) * jit * 0.22;
        headPt.y += Math.sin(this._t * 2.3 + i * 2.9) * jit * 0.16;
      }
      f.head.position.copy(headPt);
      f.head.material.opacity = env * 0.9 * glowBase;
      f.head.scale.setScalar(0.35 + 0.25 * Math.sin(this._t * 6 + i) * env + 0.25 * env);

      // arrowhead at the tip, oriented along the path
      if (drawn >= 2) {
        tmpDir.copy(headPt).sub(f.pts[drawn - 2]);
        if (tmpDir.lengthSq() > 1e-6) { tmpDir.normalize(); q.setFromUnitVectors(up, tmpDir); f.cone.quaternion.copy(q); }
        f.cone.position.copy(headPt);
        f.cone.material.opacity = env * glowBase;
      }
      if (f.lbl && f.lbl.material) f.lbl.material.opacity = env * (0.55 + 0.4 * this.ctl.vol);

      if (f.draw >= 1 && f.age > f.life) {
        this.world.remove(f.line); this.world.remove(f.cone); this.world.remove(f.head); this.world.remove(f.lbl);
        f.geo.dispose(); f.mat.dispose();
        if (f.cone.geometry) f.cone.geometry.dispose(); if (f.cone.material) f.cone.material.dispose();
        if (f.head.material) { if (f.head.material.map) {/* shared halo tex */} f.head.material.dispose(); }
        if (f.lbl.material) { if (f.lbl.material.map) f.lbl.material.map.dispose(); f.lbl.material.dispose(); }
        this.flows.splice(i, 1);
      }
    }
  }

  _updateCarbon(dt) {
    const td = this.ctl.time;
    const rise = THREE.MathUtils.lerp(2.2, 0.7, td);
    for (const c of this._carbon) {
      if (c.life <= 0) { if (c.mat.opacity !== 0) c.mat.opacity = 0; continue; }
      c.life = Math.max(0, c.life - dt * rise * 0.5);
      const span = (c.atm - c.soil);
      const prog = 1 - c.life;             // 0..1
      const len = span * 0.9;
      const y0 = c.dir > 0 ? 0 : span;     // start
      const tip = c.dir > 0 ? prog * len : span - prog * len;
      const arr = c.line.geometry.attributes.position.array;
      arr[0] = 0; arr[1] = c.dir > 0 ? Math.max(0, tip - 0.6) : Math.min(span, tip + 0.6); arr[2] = 0;
      arr[3] = 0; arr[4] = tip; arr[5] = 0;
      c.line.geometry.attributes.position.needsUpdate = true;
      c.mat.opacity = Math.sin(c.life * Math.PI) * 0.6 * (0.5 + this.ctl.vol);
      c.mat.color.set((c.dir > 0) ? DarkForest.PALETTE.carbon : DarkForest.PALETTE.bios);
    }
  }

  _updateTerrain(dt) {
    if (!this._terrainMat) return;
    // breath the topographic wire faintly; brighten slightly with vitality
    this._terrainMat.opacity = 0.32 + 0.18 * (0.5 + 0.5 * Math.sin(this._t * 0.4)) + this.vitality * 0.15;
  }

  // ───────────────────────────────────────────────────────────────────────
  // TEXT — terminal typing · facade grid · ticker crawl
  // ───────────────────────────────────────────────────────────────────────
  _updateText(dt) {
    this._updateTyping(dt);
    this._updateFacade(dt);
    this._updateCrawl(dt);
  }

  _updateTyping(dt) {
    if (!this._term) return;
    const cps = THREE.MathUtils.lerp(48, 12, this.ctl.time); // chars/sec
    if (!this._typing.target) {
      if (this._logQueue.length) { this._typing.target = this._logQueue.shift(); this._typing.shown = 0; }
    }
    if (this._typing.target) {
      this._typing.shown += dt * cps;
      if (this._typing.shown >= this._typing.target.length) {
        this._logHistory.push(this._typing.target);
        if (this._logHistory.length > 9) this._logHistory.shift();
        this._typing.target = ""; this._typing.shown = 0;
      }
    }
    this._cursorBlink += dt;
    const cursor = (Math.floor(this._cursorBlink * 2) % 2 === 0) ? "█" : " ";
    const cur = this._typing.target ? this._typing.target.slice(0, Math.floor(this._typing.shown)) : "";
    const head = "DARKFOREST://manakai$ ";
    const body = this._logHistory.join("\n");
    this._term.textContent = (body ? body + "\n" : "") + head + cur + cursor;
  }

  _updateFacade(dt) {
    if (!this._facade) return;
    // appear/disappear: eased toward want
    this._facadeWant = Math.max(0, Math.min(1, this._facadeWant));
    this._facadeVisible += ((this._facadeWant > 0.2 ? 1 : 0) - this._facadeVisible) * (1 - Math.pow(0.02, dt));
    this._facade.style.opacity = (this._facadeVisible * 0.85).toFixed(3);
    if (this._facadeVisible < 0.02) return;

    this._facadeTick += dt;
    const period = THREE.MathUtils.lerp(0.05, 0.22, this.ctl.time);
    if (this._facadeTick < period) return;
    this._facadeTick = 0;

    // mutate a fraction of cells (flicker) — Moveable Type
    const cells = this._facadeCells;
    const mutate = Math.floor(this._facadeCols * this._facadeRows * (0.06 + this.ethPressure * 0.12));
    for (let m = 0; m < mutate; m++) {
      const r = (Math.random() * this._facadeRows) | 0;
      const c = (Math.random() * this._facadeCols) | 0;
      cells[r][c] = this._facadeChar();
    }
    // occasionally stamp a live word/number horizontally
    if (Math.random() < 0.5) {
      const words = this._facadeWords();
      const w = words[(Math.random() * words.length) | 0];
      const r = (Math.random() * this._facadeRows) | 0;
      const start = Math.max(0, this._facadeCols - w.length - ((Math.random() * 4) | 0));
      for (let i = 0; i < w.length && start + i < this._facadeCols; i++) cells[r][start + i] = w[i];
    }
    let out = "";
    for (let r = 0; r < this._facadeRows; r++) out += cells[r].join("") + "\n";
    this._facade.textContent = out;
  }

  _facadeWords() {
    const sp = this.species[(Math.random() * this.species.length) | 0];
    const name = (sp ? sp.sci.toUpperCase().replace(/[^A-Z]/g, "") : "CEIBA").slice(0, 12);
    return [
      name,
      "0X" + this._hex(6),
      this._co2ppm.toFixed(0) + "PPM",
      "C+" + (this.vitality).toFixed(2),
      "TX" + this._hex(4),
      "N+" + (Math.random()).toFixed(2),
      "DOSEL", "MICORRIZA", "SUELO", "ATMOSFERA",
      "FLUX" + ((Math.random() * 99) | 0),
    ];
  }

  _hex(n) { let s = ""; for (let i = 0; i < n; i++) s += "0123456789ABCDEF"[(Math.random() * 16) | 0]; return s; }

  _updateCrawl(dt) {
    if (!this._tickerInner) return;
    const speed = THREE.MathUtils.lerp(90, 24, this.ctl.time); // px/sec
    this._crawlX -= dt * speed;
    // reset when scrolled a chunk; keep text fresh
    if (this._tickerInner.textContent !== this._crawlText) this._tickerInner.textContent = this._crawlText;
    const w = this._tickerInner.scrollWidth || 2000;
    if (-this._crawlX > w) this._crawlX = 0;
    this._tickerInner.style.transform = `translateX(${this._crawlX}px)`;
  }

  // ───────────────────────────────────────────────────────────────────────
  // CANVAS SPRITES (8-bit · NearestFilter)
  // ───────────────────────────────────────────────────────────────────────
  _texFromCanvas(canvas) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }

  _makeLabelSprite(label, sub, colHex) {
    const cw = 256, ch = 96;
    const c = document.createElement("canvas"); c.width = cw; c.height = ch;
    const g = c.getContext("2d");
    g.clearRect(0, 0, cw, ch);
    g.textAlign = "right"; g.textBaseline = "middle";
    g.font = "700 30px 'Courier New',monospace";
    g.fillStyle = colHex;
    g.fillText(label, cw - 8, 34);
    g.font = "400 17px 'Courier New',monospace";
    g.fillStyle = "#8aa39a";
    g.fillText(sub, cw - 8, 64);
    const tex = this._texFromCanvas(c);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.8, fog: false });
    const s = new THREE.Sprite(mat);
    s.scale.set(3.2, 1.2, 1);
    return s;
  }

  _makeFlowLabel(text, colHex) {
    const cw = 256, ch = 48;
    const c = document.createElement("canvas"); c.width = cw; c.height = ch;
    const g = c.getContext("2d");
    g.clearRect(0, 0, cw, ch);
    g.textAlign = "center"; g.textBaseline = "middle";
    g.font = "700 22px 'Courier New',monospace";
    g.fillStyle = colHex;
    g.fillText(text.toUpperCase(), cw / 2, ch / 2);
    const tex = this._texFromCanvas(c);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, fog: false, blending: THREE.AdditiveBlending });
    const s = new THREE.Sprite(mat);
    s.scale.set(2.4, 0.45, 1);
    return s;
  }

  _makeSpeciesSprite(sci, common, taxon, colHex) {
    const cw = 320, ch = 200;
    const c = document.createElement("canvas"); c.width = cw; c.height = ch;
    const g = c.getContext("2d");
    g.clearRect(0, 0, cw, ch);
    // glyph (line art, Humboldt-ish)
    g.save();
    g.strokeStyle = colHex; g.fillStyle = colHex; g.lineWidth = 3; g.lineJoin = "round"; g.lineCap = "round";
    this._drawGlyph(g, taxon, cw / 2, 78, 56);
    g.restore();
    // name plate
    g.textAlign = "center"; g.textBaseline = "middle";
    g.font = "italic 700 24px 'Courier New',monospace";
    g.fillStyle = "#D7E0D6";
    g.fillText(sci, cw / 2, 150);
    g.font = "400 18px 'Courier New',monospace";
    g.fillStyle = colHex;
    g.fillText(common, cw / 2, 176);
    // baseline rule
    g.strokeStyle = colHex; g.globalAlpha = 0.5; g.lineWidth = 1;
    g.beginPath(); g.moveTo(40, 132); g.lineTo(cw - 40, 132); g.stroke(); g.globalAlpha = 1;
    const tex = this._texFromCanvas(c);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.85, fog: true });
    const s = new THREE.Sprite(mat);
    s.scale.set(2.5, 1.56, 1);
    return s;
  }

  // minimal naturalist line glyphs — recognizable, not naive blobs
  _drawGlyph(g, taxon, cx, cy, s) {
    const L = (x1, y1, x2, y2) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
    const arc = (x, y, r, a0, a1) => { g.beginPath(); g.arc(x, y, r, a0, a1); g.stroke(); };
    switch (taxon) {
      case "tree":
        L(cx, cy + s * 0.5, cx, cy - s * 0.1);
        L(cx, cy - s * 0.1, cx - s * 0.35, cy - s * 0.45); L(cx, cy - s * 0.1, cx + s * 0.35, cy - s * 0.45);
        L(cx, cy + s * 0.15, cx - s * 0.28, cy - s * 0.12); L(cx, cy + s * 0.15, cx + s * 0.28, cy - s * 0.12);
        arc(cx, cy - s * 0.42, s * 0.42, Math.PI, 2 * Math.PI); break;
      case "cactus":
        L(cx, cy + s * 0.5, cx, cy - s * 0.5);
        L(cx, cy, cx - s * 0.3, cy); L(cx - s * 0.3, cy, cx - s * 0.3, cy - s * 0.3);
        L(cx, cy + s * 0.1, cx + s * 0.3, cy + s * 0.1); L(cx + s * 0.3, cy + s * 0.1, cx + s * 0.3, cy - s * 0.2); break;
      case "orchid":
        L(cx, cy + s * 0.5, cx, cy - s * 0.1);
        for (let a = 0; a < 5; a++) { const an = -Math.PI / 2 + (a - 2) * 0.5; arc(cx + Math.cos(an) * s * 0.2, cy - s * 0.2 + Math.sin(an) * s * 0.2, s * 0.16, 0, 2 * Math.PI); } break;
      case "bromel":
        for (let a = 0; a < 7; a++) { const an = -Math.PI + a * (Math.PI / 6); L(cx, cy + s * 0.3, cx + Math.cos(an) * s * 0.5, cy + s * 0.3 + Math.sin(an) * s * 0.5); } break;
      case "bird":
        arc(cx, cy, s * 0.3, 0, 2 * Math.PI);
        L(cx + s * 0.28, cy - s * 0.05, cx + s * 0.5, cy - s * 0.12); // beak
        L(cx - s * 0.1, cy, cx - s * 0.45, cy - s * 0.28);            // wing
        L(cx - s * 0.05, cy + s * 0.3, cx - s * 0.05, cy + s * 0.5); break;
      case "primate":
        arc(cx, cy - s * 0.1, s * 0.22, 0, 2 * Math.PI);
        arc(cx, cy + s * 0.2, s * 0.3, 0, 2 * Math.PI);
        g.beginPath(); g.arc(cx + s * 0.4, cy + s * 0.25, s * 0.3, Math.PI, 2.4 * Math.PI); g.stroke(); break; // tail
      case "cat":
        g.beginPath(); g.ellipse(cx, cy, s * 0.42, s * 0.22, 0, 0, 2 * Math.PI); g.stroke();
        L(cx - s * 0.3, cy + s * 0.2, cx - s * 0.3, cy + s * 0.5); L(cx + s * 0.3, cy + s * 0.2, cx + s * 0.3, cy + s * 0.5);
        L(cx + s * 0.42, cy, cx + s * 0.7, cy - s * 0.2); break;
      case "snake":
        g.beginPath(); g.moveTo(cx - s * 0.5, cy); g.bezierCurveTo(cx - s * 0.2, cy - s * 0.5, cx + s * 0.2, cy + s * 0.5, cx + s * 0.5, cy); g.stroke(); break;
      case "croc":
        L(cx - s * 0.55, cy, cx + s * 0.55, cy);
        for (let i = -2; i <= 2; i++) L(cx + i * s * 0.18, cy, cx + i * s * 0.18, cy - s * 0.14);
        L(cx + s * 0.55, cy, cx + s * 0.7, cy - s * 0.08); break;
      case "reptile":
        g.beginPath(); g.ellipse(cx, cy, s * 0.4, s * 0.18, 0, 0, 2 * Math.PI); g.stroke();
        L(cx - s * 0.4, cy, cx - s * 0.6, cy); L(cx + s * 0.4, cy, cx + s * 0.6, cy - s * 0.1); break;
      case "ant":
        arc(cx - s * 0.3, cy, s * 0.14, 0, 2 * Math.PI); arc(cx, cy, s * 0.16, 0, 2 * Math.PI); arc(cx + s * 0.32, cy, s * 0.18, 0, 2 * Math.PI);
        for (let i = -1; i <= 1; i++) { L(cx, cy, cx - s * 0.18, cy + s * 0.35 * (i + 2) / 2); L(cx, cy, cx + s * 0.18, cy + s * 0.35); } break;
      case "beetle":
        g.beginPath(); g.ellipse(cx, cy, s * 0.3, s * 0.4, 0, 0, 2 * Math.PI); g.stroke();
        L(cx, cy - s * 0.4, cx, cy + s * 0.4);
        L(cx - s * 0.3, cy - s * 0.2, cx - s * 0.5, cy - s * 0.3); L(cx + s * 0.3, cy - s * 0.2, cx + s * 0.5, cy - s * 0.3); break;
      case "fungus":
        L(cx, cy + s * 0.5, cx, cy - s * 0.1);
        g.beginPath(); g.arc(cx, cy - s * 0.1, s * 0.35, Math.PI, 2 * Math.PI); g.stroke();
        for (let i = -2; i <= 2; i++) L(cx, cy + s * 0.5, cx + i * s * 0.18, cy + s * 0.62); break;
      default:
        arc(cx, cy, s * 0.3, 0, 2 * Math.PI);
    }
  }

  _radialTexture() {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,255,255,0.95)");
    grd.addColorStop(0.3, "rgba(255,255,255,0.4)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c); tex.needsUpdate = true; return tex;
  }

  // ───────────────────────────────────────────────────────────────────────
  destroy() {
    if (this._animationId) { cancelAnimationFrame(this._animationId); this._animationId = null; }
    try {
      for (const el of [this._term, this._facade, this._ticker, this._fontLink]) {
        if (el && el.parentNode) el.parentNode.removeChild(el);
      }
      if (this._haloTex) this._haloTex.dispose();
    } catch (e) { /* ignore */ }
    super.destroy();
  }
}

export default DarkForest;
