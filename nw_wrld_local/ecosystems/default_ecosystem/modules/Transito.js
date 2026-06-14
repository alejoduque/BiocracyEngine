/*
@nwWrld name: Transito
@nwWrld category: 3D
@nwWrld imports: BaseThreeJsModule, THREE, loadJson
*/

/*
 * Transito — "El tránsito de una voz"  ·  Módulo B · Corporación Manakai
 * ---------------------------------------------------------------------------
 * A rotatable, zoomable 3-D realisation of BiocracyEngine_dossier.tex. The four
 * lithographic figures of the dossier are folded into a single constructivist
 * diagram that runs live:
 *
 *   Fig. 1  ·  the three RV simplex (Virtual / Vegetal / Validada) curved apart,
 *              ringed by the slow phenological clock.
 *   Fig. 2/3 · the state machine — SENSED → PRESENT → OVERLAP → ADJUDICATED —
 *              and its two terminal states: INSCRIBED (BioToken) and OPAQUE
 *              (a veiled region the diagram refuses to draw inside).
 *   Fig. 4  ·  the desintermediation: the extractive line that leaves open for
 *              the Global North vs. the biocratic loop that closes on territory.
 *
 * Aesthetic: 1-bit / Russian-constructivist. Ink on paper, flat colour, hard
 * geometric primitives, NearestFilter text, NO glow / no additive bloom. The
 * palette is lifted verbatim from the LaTeX preamble of the dossier.
 *
 * The proof of the shared drone (read this with care):
 *   On every module the same `\opalDrone` hums underneath; its body is driven by
 *   the ETH inflow (/tx → transactionInfluence). This module *also* drives it.
 *   Each voice that reaches INSCRIBED raises the machine's throughput; the loader
 *   (btransito.ts) reads getThroughput()/getCoherence() and pushes it back as
 *   /soneth/dronedepth · dronemix · dronefade · dronespace — the very busses
 *   `\opalDrone` reads. The HUD prints the values being sent, so the deliberative
 *   machine is heard deepening the same base drone the blockchain feeds.
 *
 * Only THREE built-ins are used (Line / Mesh / Sprite / Basic materials), so the
 * module is safe to evaluate inside the sandboxed `new Function` loader.
 */

class Transito extends BaseThreeJsModule {

  // ── controls (mirror parliament.html sonETH sliders) + ETH affects ────────
  static methods = [
    { name: "setMasterVol",     executeOnLoad: true,  options: [{ name: "level", defaultVal: 0.5, type: "number", min: 0, max: 1 }] },
    { name: "setPitchShift",    executeOnLoad: true,  options: [{ name: "value", defaultVal: 0.5, type: "number", min: 0, max: 1 }] },
    { name: "setTimeDilation",  executeOnLoad: true,  options: [{ name: "value", defaultVal: 0.3, type: "number", min: 0, max: 1 }] },
    { name: "setSpectralShift", executeOnLoad: true,  options: [{ name: "value", defaultVal: 0.4, type: "number", min: 0, max: 1 }] },
    { name: "setSpatialSpread", executeOnLoad: true,  options: [{ name: "value", defaultVal: 0.5, type: "number", min: 0, max: 1 }] },
    { name: "setCoherence",     executeOnLoad: false, options: [{ name: "value", defaultVal: 0.5, type: "number", min: 0, max: 1 }] },
    { name: "pulse",            executeOnLoad: false, options: [{ name: "intensity", defaultVal: 1.4, type: "number", min: 0.3, max: 4 }] },
    { name: "emitVoice",        executeOnLoad: false, options: [{ name: "count", defaultVal: 1, type: "number", min: 1, max: 12 }] },
    { name: "triggerCO2",        executeOnLoad: false, options: [{ name: "amount", defaultVal: 50, type: "number", min: 10, max: 200 }] },
    { name: "triggerMycoPulse",  executeOnLoad: false, options: [{ name: "intensity", defaultVal: 1, type: "number", min: 0.1, max: 5 }] },
    { name: "triggerPhosphorus", executeOnLoad: false, options: [{ name: "amount", defaultVal: 30, type: "number", min: 10, max: 100 }] },
    { name: "triggerNitrogen",   executeOnLoad: false, options: [{ name: "amount", defaultVal: 30, type: "number", min: 10, max: 100 }] },
    { name: "whisper",           executeOnLoad: false, options: [{ name: "text", defaultVal: "", type: "string" }] },
  ];

  // Monochrome — black & white with grey tones. Elements are told apart by
  // shape / line-weight / dash / value, not hue. (Glow + transparency below use
  // grey, never colour.) Three tones: black, dark-grey, mid-grey.
  static PALETTE = {
    paper:    "#F5F5F1",   // near-white paper
    ink:      "#141414",   // black — primary lines, dots, fonts
    rule:     "#C4C4BC",   // light grey — faint base structure
    virtual:  "#3A3A3A",   // dark grey — the telematic / the simulated
    vegetal:  "#141414",   // black — the living voice / the spine
    validada: "#8C8C86",   // mid grey — the authorized / extractive
    token:    "#141414",   // black — BioToken (the hexagon shape carries it)
    opaque:   "#7C7C76",   // grey — the veil (dash + transparency carry it)
    warn:     "#141414",   // black — the cut (the X carries it)
  };

  // Global line weight. Tubes stand in for >1px lines (WebGL clamps linewidth);
  // this single factor scales every tube radius — lower = finer hairline.
  static LW = 0.5;

  // The five states + two terminals of the autómata (Fig. 3), placed in space.
  // Coordinates live in a mostly-vertical plane (XY) with small Z relief so the
  // bifurcation and the opaque retention read when the viewer orbits.
  static STATES = {
    sensed:      { p: [ 4.4, -1.6, 0.5], label: "SENSED",      sub: "AudioMoth · polysensing", accent: "vegetal" },
    present:     { p: [ 2.5,  0.5, 0.8], label: "PRESENT",     sub: "cede ~3 s",               accent: "virtual" },
    overlap:     { p: [ 0.0,  2.6, 1.1], label: "OVERLAP",     sub: "simular antes de ejecutar", accent: "opaque" },
    adjudicated: { p: [-1.7,  4.1, 0.6], label: "ADJUDICATED", sub: "una retención que abre",  accent: "ink" },
    inscribed:   { p: [-4.2,  6.0, 0.2], label: "INSCRIBED",   sub: "BioToken → cadena",        accent: "token" },
    opaque:      { p: [-2.6,  1.7, -1.4], label: "OPAQUE",     sub: "resto no inscribible",     accent: "opaque" },
  };

  // The three RV poles of the simplex (Fig. 1).
  static RV = {
    virtual:  { p: [ 0.0,  7.6, 0.0], label: "RV VIRTUAL",  sub: "la máquina · telemática", accent: "virtual" },
    vegetal:  { p: [ 7.4, -3.4, 0.0], label: "RV VEGETAL",  sub: "lo vivo · lo opaco",      accent: "vegetal" },
    validada: { p: [-7.4, -3.4, 0.0], label: "RV VALIDADA", sub: "realidad autorizada",     accent: "validada" },
  };

  // Phenological ring arcs (reloj lento) — [startDeg, endDeg, accent, label].
  static SEASONS = [
    [ 95, 200, "vegetal",  "LLUVIAS · FLORACIÓN"],
    [  5,  70, "validada", "SECA"],
    [-30,   5, "virtual",  "TRANSICIÓN"],
    [200, 285, "vegetal",  "AULLIDO · REPRODUCCIÓN"],
  ];

  constructor(container) {
    super(container);

    this._t = 0;
    this._last = performance.now();
    this._animationId = null;

    // smoothed control state (read from window.__sonethParams each frame)
    this.ctl = { vol: 0.5, pitch: 0.5, time: 0.3, spectral: 0.4, spatial: 0.5 };
    this.tgt = { vol: 0.5, pitch: 0.5, time: 0.3, spectral: 0.4, spatial: 0.5 };
    this.coherence = 0.5; this.coherenceTgt = 0.5;
    this.ethPressure = 0.0; this.ethPressureTgt = 0.0;

    // machine state
    this.voices = [];
    this.inscribedCount = 0;
    this.opaqueCount = 0;
    this._opaqueRate = 0;       // decaying counters of recent arrivals…
    this._inscribeRate = 0;     // …their ratio = how much is being retained
    this.opacityLoad = 0.0;     // 0..1 eased — fraction retained (veil pressure)
    this.throughput = 0.0;      // 0..1 eased — drives the drone push
    this._throughputPulse = 0;  // decays; bumped on each inscription
    this._spawnAccum = 0;
    this._pulseAmt = 0;
    this._branchCount = 4;      // von-Foerster branches at OVERLAP (∝ harmonicrich)

    this._curves = {};
    this._sprites = [];

    this.init();
  }

  // ───────────────────────────────────────────────────────────────────────
  init() {
    if (!THREE) return;
    const P = Transito.PALETTE;

    this.scene.background = new THREE.Color(P.paper);
    // Paper has no fog; we want crisp ink edges at every depth.
    this.scene.fog = null;

    this.camera.fov = 50;
    this.camera.near = 0.1;
    this.camera.far = 400;
    this.camera.position.set(2.5, 2.0, 22);
    this.camera.updateProjectionMatrix();

    if (this.controls) {
      this.controls.enabled = true;
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.07;
      this.controls.enablePan = true;
      this.controls.enableZoom = true;
      this.controls.enableRotate = true;
      this.controls.minDistance = 6;
      this.controls.maxDistance = 90;
      this.controls.maxPolarAngle = Math.PI * 0.96;
      this.controls.target.set(0, 1.8, 0);
      this.controls.update();
    }

    // Flat unlit look — MeshBasicMaterial ignores lights, but a faint ambient
    // keeps any accidental lit material legible. No point/spot lights → no glow.
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.0));

    this.world = new THREE.Group();
    this.scene.add(this.world);

    // shared geometry + halo texture for voice tokens (small core + soft glow)
    this._voiceGeo = new THREE.SphereGeometry(0.06, 10, 8);
    this._haloTex = this._radialTexture();

    this._buildBaseline();
    this._buildPhenoRing();
    this._buildSimplex();
    this._buildMachine();
    this._buildDesintermediation();
    this._buildHUD();

    this.show();
    this._animate = this._animate.bind(this);
    this._animationId = requestAnimationFrame(this._animate);
  }

  // ── small helpers ─────────────────────────────────────────────────────────
  _c01(v) { v = +v; return isFinite(v) ? Math.max(0, Math.min(1, v)) : 0; }
  _col(name) { return new THREE.Color(Transito.PALETTE[name] || Transito.PALETTE.ink); }
  _v(arr) { return new THREE.Vector3(arr[0], arr[1], arr[2]); }

  _lineMat(name, opacity = 1, width = 1) {
    return new THREE.LineBasicMaterial({
      color: this._col(name), transparent: true, opacity, linewidth: width, fog: false,
    });
  }

  // flat unlit material for the tube "lines" (constructivist bold ink, no glow)
  _basicMat(name, opacity = 1) {
    return new THREE.MeshBasicMaterial({ color: this._col(name), transparent: true, opacity, fog: false });
  }

  // ── tube primitives ──────────────────────────────────────────────────────
  // WebGL/ANGLE clamps LineBasicMaterial.linewidth to 1px, so genuine "1px
  // thicker" lines are drawn as thin TubeGeometry instead. Default radius reads
  // as ~2px at the framing distance — bold hairlines, true constructivist bars.
  _tubeSeg(a, b, name, opacity = 0.9, r = 0.03) {
    const g = new THREE.TubeGeometry(new THREE.LineCurve3(a, b), 1, r * Transito.LW, 5, false);
    return new THREE.Mesh(g, this._basicMat(name, opacity));
  }
  _tubeCurve(curve, name, opacity = 0.9, r = 0.03, seg = 48, closed = false) {
    const c = Array.isArray(curve) ? new THREE.CatmullRomCurve3(curve, closed) : curve;
    const g = new THREE.TubeGeometry(c, seg, r * Transito.LW, 5, closed);
    return new THREE.Mesh(g, this._basicMat(name, opacity));
  }
  _tubeRing(cx, cy, r, name, opacity = 0.9, z = 0, tubeR = 0.026) {
    const pts = this._ringPoints(cx, cy, r, Math.max(28, Math.round(r * 10)), z);
    pts.pop(); // drop the duplicated closing vertex for a clean closed curve
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), Math.max(48, pts.length * 2), tubeR * Transito.LW, 5, true);
    return new THREE.Mesh(g, this._basicMat(name, opacity));
  }

  // white radial sprite texture (tinted per-voice) — adapted from DarkForest's
  // halo. On the paper background we tint + NormalBlend it so a voice reads as
  // an *illuminated* coloured dot rather than additive bloom.
  _radialTexture() {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,255,255,1.0)");
    grd.addColorStop(0.35, "rgba(255,255,255,0.55)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c); tex.needsUpdate = true;
    return tex;
  }

  // straight bold line between two Vector3 (now a thin tube)
  _segment(a, b, name, opacity = 0.9, r = 0.03) {
    const m = this._tubeSeg(a, b, name, opacity, r);
    this.world.add(m);
    return m;
  }

  // dashed line (used for the opacity veil + overlap aura) — needs distances
  _dashed(points, name, opacity, dash = 0.18, gap = 0.14) {
    const g = new THREE.BufferGeometry().setFromPoints(points);
    const l = new THREE.Line(g, new THREE.LineDashedMaterial({
      color: this._col(name), transparent: true, opacity, dashSize: dash, gapSize: gap, fog: false,
    }));
    l.computeLineDistances();
    this.world.add(l);
    return l;
  }

  // closed polygon ring (circle of n segments) in the XY plane at z
  _ringPoints(cx, cy, r, n, z = 0) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push(new THREE.Vector3(cx + Math.cos(a) * r, cy + Math.sin(a) * r, z));
    }
    return pts;
  }

  // 1-bit ink label sprite (ink title + grey subtitle), transparent background
  _label(label, sub, accent = "ink", scale = 2.6) {
    const cw = 256, ch = sub ? 88 : 56;
    const c = document.createElement("canvas"); c.width = cw; c.height = ch;
    const g = c.getContext("2d");
    g.clearRect(0, 0, cw, ch);
    g.textAlign = "left"; g.textBaseline = "middle";
    g.font = "700 28px 'Helvetica Neue',Arial,sans-serif";
    g.fillStyle = Transito.PALETTE[accent] || Transito.PALETTE.ink;
    g.fillText(label, 6, sub ? 26 : ch / 2);
    if (sub) {
      g.font = "400 16px 'Helvetica Neue',Arial,sans-serif";
      g.fillStyle = Transito.PALETTE.ink;
      g.globalAlpha = 0.55;
      g.fillText(sub, 6, 60);
      g.globalAlpha = 1;
    }
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.NearestFilter; tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false; tex.needsUpdate = true;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, fog: false, opacity: 0.92 });
    const s = new THREE.Sprite(mat);
    s.scale.set(scale, scale * ch / cw, 1);
    this._sprites.push(s);
    return s;
  }

  // a flat constructivist node-glyph at a state. Returns a Group.
  _nodeGlyph(kind, accent) {
    const grp = new THREE.Group();
    const col = this._col(accent);
    if (kind === "disc") {
      // ring + small dot — sensed/present
      const ring = this._tubeRing(0, 0, 0.42, accent, 0.95, 0, 0.028);
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.07, 18), new THREE.MeshBasicMaterial({ color: col, fog: false }));
      grp.add(ring, dot);
    } else if (kind === "square") {
      // adjudication — an ink square rotated 45° (a guard / threshold)
      const ep = [[-0.31, -0.31], [0.31, -0.31], [0.31, 0.31], [-0.31, 0.31], [-0.31, -0.31]]
        .map((p) => new THREE.Vector3(p[0], p[1], 0));
      const sq = this._tubeCurve(ep, accent, 1, 0.028, ep.length, false);
      sq.rotation.z = Math.PI / 4;
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.055, 12), new THREE.MeshBasicMaterial({ color: col, fog: false }));
      grp.add(sq, dot);
    } else if (kind === "hex") {
      // BioToken — hexagon outline + 3 diagonals (the dossier glyph)
      const hp = [];
      for (let i = 0; i <= 6; i++) { const a = Math.PI / 2 + i * Math.PI / 3; hp.push(new THREE.Vector3(Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0)); }
      grp.add(this._tubeCurve(hp, accent, 1, 0.03, 60, false));
      for (let i = 0; i < 3; i++) {
        const a = Math.PI / 2 + i * Math.PI / 3;
        const b = a + Math.PI;
        grp.add(this._mkSeg(new THREE.Vector3(Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0),
          new THREE.Vector3(Math.cos(b) * 0.5, Math.sin(b) * 0.5, 0), accent, 0.7));
      }
    }
    return grp;
  }

  // bold segment helper that returns a tube Mesh (not added to world)
  _mkSeg(a, b, name, opacity = 0.9, r = 0.028) {
    return this._tubeSeg(a, b, name, opacity, r);
  }

  // ── BASELINE — a faint constructivist ground cross (orients the orbit) ─────
  _buildBaseline() {
    const grp = new THREE.Group();
    // single horizon line + a couple of measure ticks, very faint rule grey
    const span = 13;
    grp.add(this._mkSeg(new THREE.Vector3(-span, -6.2, 0), new THREE.Vector3(span, -6.2, 0), "rule", 0.5));
    for (let x = -span; x <= span; x += 2) {
      grp.add(this._mkSeg(new THREE.Vector3(x, -6.2, 0), new THREE.Vector3(x, -6.0, 0), "rule", 0.4));
    }
    this.world.add(grp);
  }

  // ── FIG. 1 — phenological ring (reloj lento) ──────────────────────────────
  _buildPhenoRing() {
    this.phenoRing = new THREE.Group();
    const R = 10.6, z = -1.2;
    // base circle (faint)
    this.phenoRing.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(this._ringPoints(0, 0, R, 240, z)),
      this._lineMat("rule", 0.6)));
    // tick marks every 12°
    for (let a = 0; a < 360; a += 12) {
      const r0 = R - 0.22, r1 = R, rad = a * Math.PI / 180;
      this.phenoRing.add(this._mkSeg(
        new THREE.Vector3(Math.cos(rad) * r0, Math.sin(rad) * r0, z),
        new THREE.Vector3(Math.cos(rad) * r1, Math.sin(rad) * r1, z), "rule", 0.45));
    }
    // seasonal arcs (coloured, bold)
    for (const [s, e, accent] of Transito.SEASONS) {
      const pts = [];
      const steps = Math.max(4, Math.abs(e - s));
      for (let i = 0; i <= steps; i++) {
        const a = (s + (e - s) * i / steps) * Math.PI / 180;
        pts.push(new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, z));
      }
      this.phenoRing.add(this._tubeCurve(pts, accent, 0.9, 0.04, steps, false));
    }
    // the "now" marker — an ink dot that the seasons rotate past
    const now = new THREE.Mesh(new THREE.CircleGeometry(0.1, 18), new THREE.MeshBasicMaterial({ color: this._col("ink"), fog: false }));
    now.position.set(Math.cos(2.1) * R, Math.sin(2.1) * R, z + 0.01);
    this.phenoRing.add(now);
    this.world.add(this.phenoRing);
  }

  // ── FIG. 1 — the three RV simplex (curved edges) ──────────────────────────
  _buildSimplex() {
    this.simplex = new THREE.Group();
    const V = this._v(Transito.RV.virtual.p);
    const G = this._v(Transito.RV.vegetal.p);
    const D = this._v(Transito.RV.validada.p);

    // edges curve apart slightly (so as not to fix Nature as euclidean objects)
    const bow = (a, b, lift) => {
      const mid = a.clone().add(b).multiplyScalar(0.5);
      mid.z += lift; // bow toward viewer
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      return this._tubeCurve(curve, "rule", 0.75, 0.03, 36, false);
    };
    this.simplex.add(bow(V, G, 0.9), bow(V, D, 0.9), bow(G, D, -0.6));

    // poles
    for (const key of ["virtual", "vegetal", "validada"]) {
      const rv = Transito.RV[key];
      const p = this._v(rv.p);
      const ring = this._tubeRing(0, 0, 0.7, rv.accent, 0.9, 0, 0.032);
      ring.position.copy(p);
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.1, 20), new THREE.MeshBasicMaterial({ color: this._col(rv.accent), fog: false }));
      dot.position.copy(p);
      const lab = this._label(rv.label, rv.sub, rv.accent, 3.1);
      lab.position.copy(p).add(new THREE.Vector3(0, 1.15, 0));
      this.simplex.add(ring, dot, lab);
      if (key === "virtual") this._rvVirtual = ring;
      if (key === "vegetal") this._rvVegetal = ring;
      if (key === "validada") this._rvValidada = ring;
    }
    this.world.add(this.simplex);

    // biofotones (Narby) — faint dotted signal-as-light between presences
    this._dashed([G.clone(), G.clone().lerp(V, 0.5).add(new THREE.Vector3(-1.2, 0.4, 0.6)), V.clone()], "vegetal", 0.4, 0.12, 0.16);
    this._dashed([D.clone(), D.clone().lerp(V, 0.5).add(new THREE.Vector3(1.2, 0.4, 0.6)), V.clone()], "virtual", 0.32, 0.12, 0.16);
  }

  // ── FIG. 2/3 — the state machine (the transit) ────────────────────────────
  _buildMachine() {
    this.machine = new THREE.Group();
    const S = Transito.STATES;

    // main transit curve SENSED → PRESENT → OVERLAP → ADJUDICATED
    this._curves.main = new THREE.CatmullRomCurve3(
      [S.sensed, S.present, S.overlap, S.adjudicated].map((s) => this._v(s.p)), false, "catmullrom", 0.4);
    // bifurcation branches from ADJUDICATED
    this._curves.inscribe = new THREE.CatmullRomCurve3(
      [this._v(S.adjudicated.p), this._v(S.adjudicated.p).lerp(this._v(S.inscribed.p), 0.5).add(new THREE.Vector3(-0.6, 0.3, 0)), this._v(S.inscribed.p)], false);
    this._curves.opacify = new THREE.CatmullRomCurve3(
      [this._v(S.adjudicated.p), this._v(S.adjudicated.p).lerp(this._v(S.opaque.p), 0.5).add(new THREE.Vector3(0.4, -0.4, -0.8)), this._v(S.opaque.p)], false);

    // draw the transit spine (ink) and the two branch routes (token / opaque)
    this.machine.add(this._tubeCurve(this._curves.main, "vegetal", 0.85, 0.034, 80, false));
    this.machine.add(this._tubeCurve(this._curves.inscribe, "token", 0.85, 0.034, 40, false));
    // the opaque branch fades into a dashed stub — its destiny is not drawn
    this._dashed(this._curves.opacify.getPoints(30), "opaque", 0.6, 0.16, 0.16);

    // arrowheads at mid-transit (constructivist direction marks)
    this._arrow(this._curves.main, 0.30, "vegetal");
    this._arrow(this._curves.main, 0.72, "virtual");

    // station glyphs + labels
    const place = (key, kind) => {
      const st = S[key];
      const g = this._nodeGlyph(kind, st.accent);
      g.position.copy(this._v(st.p));
      const lab = this._label(st.label, st.sub, st.accent, 2.4);
      lab.position.copy(this._v(st.p)).add(new THREE.Vector3(0.1, -0.75, 0));
      this.machine.add(g, lab);
      return g;
    };
    place("sensed", "disc");
    place("present", "disc");
    this._overlapGlyph = place("overlap", "disc");
    place("adjudicated", "square");
    this._inscribedGlyph = place("inscribed", "hex");

    // OVERLAP BUFFER — dashed aura + von-Foerster branches (the deliberation)
    this.overlapPos = this._v(S.overlap.p);
    this._overlapAura = this._dashed(this._ringPoints(this.overlapPos.x, this.overlapPos.y, 0.95, 64, this.overlapPos.z), "opaque", 0.7, 0.2, 0.18);
    this._branchGroup = new THREE.Group();
    this.machine.add(this._branchGroup);
    this._rebuildBranches();

    // OPAQUE terminal — the veil: a dotted disc the diagram refuses to fill.
    this.opaquePos = this._v(S.opaque.p);
    const veil = this._dashed(this._ringPoints(this.opaquePos.x, this.opaquePos.y, 0.75, 40, this.opaquePos.z), "opaque", 0.85, 0.14, 0.12);
    this._opaqueVeil = veil;
    const olab = this._label(S.opaque.label, S.opaque.sub, "opaque", 2.3);
    olab.position.copy(this.opaquePos).add(new THREE.Vector3(0.1, -0.95, 0));
    this.machine.add(olab);

    // INSCRIBED → cadena comunitaria: three little linked rings trailing off
    let prev = this._v(S.inscribed.p).add(new THREE.Vector3(-0.9, 0.4, 0));
    for (let i = 0; i < 3; i++) {
      const r = this._tubeRing(0, 0, 0.16, "token", 0.75, 0, 0.024);
      r.position.copy(prev);
      this.machine.add(r);
      prev = prev.clone().add(new THREE.Vector3(-0.46, 0.18, 0));
    }

    this.world.add(this.machine);
  }

  _rebuildBranches() {
    if (!this._branchGroup) return;
    while (this._branchGroup.children.length) {
      const c = this._branchGroup.children.pop();
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    }
    const n = this._branchCount;
    this._branches = [];
    for (let i = 0; i < n; i++) {
      const ang = (Math.PI * 0.32) + (i / Math.max(1, n - 1)) * (Math.PI * 0.42);
      const tip = this.overlapPos.clone().add(new THREE.Vector3(Math.cos(ang) * 1.5, Math.sin(ang) * 1.5, 0.2));
      const line = this._mkSeg(this.overlapPos.clone(), tip, "virtual", 0.55);
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.06, 10), new THREE.MeshBasicMaterial({ color: this._col("virtual"), transparent: true, opacity: 0.7, fog: false }));
      dot.position.copy(tip);
      this._branchGroup.add(line, dot);
      this._branches.push({ line, dot, base: tip.clone(), phase: Math.random() * Math.PI * 2 });
    }
  }

  // a small filled triangle arrowhead at parameter t along a curve
  _arrow(curve, t, accent) {
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t).normalize();
    const n = new THREE.Vector3(-tan.y, tan.x, 0).multiplyScalar(0.16);
    const tip = p.clone().add(tan.clone().multiplyScalar(0.22));
    const a = p.clone().add(n), b = p.clone().sub(n);
    const geo = new THREE.BufferGeometry().setFromPoints([a, tip, b]);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: this._col(accent), side: THREE.DoubleSide, fog: false }));
    this.machine.add(mesh);
  }

  // ── FIG. 4 — desintermediation (extractive line vs biocratic loop) ────────
  _buildDesintermediation() {
    this.diap = new THREE.Group();
    const src = new THREE.Vector3(2.2, -7.6, 1.6);     // AudioMoth · sensed común
    const ngo = new THREE.Vector3(8.8, -5.2, -1.0);    // ONG · punto de paso
    const north = new THREE.Vector3(13.5, -3.2, -4.5); // Norte Global
    const gate = new THREE.Vector3(2.2, -10.4, 1.2);   // tokenización
    const chain = new THREE.Vector3(-3.6, -10.0, 0.4); // cadena comunitaria

    // common source
    const srcDot = new THREE.Mesh(new THREE.CircleGeometry(0.1, 18), new THREE.MeshBasicMaterial({ color: this._col("vegetal"), fog: false }));
    srcDot.position.copy(src);
    this.diap.add(srcDot, this._labelAt("AUDIOMOTH", "sensado comunitario", "vegetal", src, [0.2, 0.55, 0]));

    // EXTRACTIVE circuit — grey, open, escapes to the North. With a cut mark.
    this.diap.add(this._mkSeg(src, ngo, "validada", 0.7));
    this.diap.add(this._mkSeg(ngo, north, "validada", 0.7));
    const escape = north.clone().add(new THREE.Vector3(2.4, 0.4, 0));
    this.diap.add(this._mkSeg(north, escape, "validada", 0.6));
    this.diap.add(this._labelAt("ONG", "punto de paso obligado", "validada", ngo, [0.2, 0.5, 0]));
    this.diap.add(this._labelAt("NORTE GLOBAL", "valor + autoridad →", "validada", north, [0.2, 0.55, 0]));
    // the cut (Fig. 4 severancia) — a warn X across the src→ngo link
    const cutAt = src.clone().lerp(ngo, 0.45);
    this.diap.add(this._mkSeg(cutAt.clone().add(new THREE.Vector3(-0.22, -0.22, 0)), cutAt.clone().add(new THREE.Vector3(0.22, 0.22, 0)), "warn", 1));
    this.diap.add(this._mkSeg(cutAt.clone().add(new THREE.Vector3(0.05, -0.28, 0)), cutAt.clone().add(new THREE.Vector3(0.34, 0.16, 0)), "warn", 1));

    // BIOCRATIC circuit — vivid, closed: src → gate → BioToken → chain → src
    this.diap.add(this._mkSeg(src, gate, "vegetal", 0.85));
    const tok = gate.clone().lerp(chain, 0.5).add(new THREE.Vector3(0, 0.1, 0));
    const hex = this._nodeGlyph("hex", "token"); hex.scale.setScalar(0.7); hex.position.copy(tok);
    this.diap.add(this._mkSeg(gate, tok, "token", 0.85), hex, this._mkSeg(tok, chain, "token", 0.85));
    // closed loop back to territory
    const loopMid = chain.clone().lerp(src, 0.5).add(new THREE.Vector3(-0.4, -1.4, 0.8));
    const loop = new THREE.CatmullRomCurve3([chain.clone(), loopMid, src.clone()]);
    this.diap.add(this._tubeCurve(loop, "vegetal", 0.8, 0.032, 40, false));
    this.diap.add(this._labelAt("TOKENIZACIÓN", "dIAP · cláusula de opacidad", "opaque", gate, [0.2, -0.55, 0]));
    this.diap.add(this._labelAt("CADENA COMUNITARIA", "Parlamento de lo Vivo", "vegetal", chain, [0.2, -0.55, 0]));
    this.diap.add(this._labelAt("¬ ONG", "punto de paso disuelto", "warn", cutAt, [0.5, -0.5, 0]));

    this.world.add(this.diap);
  }

  _labelAt(label, sub, accent, pos, off) {
    const s = this._label(label, sub, accent, 2.2);
    s.position.copy(pos).add(new THREE.Vector3(off[0], off[1], off[2]));
    return s;
  }

  // ── HUD (DOM overlay, 1-bit ink on paper) — prints the drone proof ────────
  _buildHUD() {
    const host = this.elem;
    if (!host) return;
    if (getComputedStyle(host).position === "static") host.style.position = "relative";
    const el = document.createElement("div");
    el.style.cssText = [
      "position:absolute", "top:10px", "left:10px", "z-index:5",
      "font-family:'Menlo','Consolas','DejaVu Sans Mono',monospace", // sans-serif mono (aligns bars)
      "font-size:11px", "line-height:1.5", "letter-spacing:0.02em",
      "color:#141414", "background:rgba(245,245,241,0.85)",
      "border:1px solid #141414", "padding:7px 9px", "max-width:280px",
      "text-transform:uppercase", "pointer-events:none",
      "-webkit-font-smoothing:none",
    ].join(";");
    host.appendChild(el);
    this._hud = el;
    // hint, bottom-left
    const hint = document.createElement("div");
    hint.textContent = "arrastrar: rotar · rueda: zoom · B · el tránsito de una voz";
    hint.style.cssText = [
      "position:absolute", "bottom:8px", "left:10px", "z-index:5",
      "font-family:'Helvetica Neue',Arial,sans-serif", "font-size:10px",
      "letter-spacing:0.04em", "color:rgba(20,20,20,0.55)",
      "text-transform:uppercase", "pointer-events:none",
      "-webkit-font-smoothing:none",
    ].join(";");
    host.appendChild(hint);
    this._hint = hint;
  }

  _updateHUD() {
    if (!this._hud) return;
    const d = (typeof window !== "undefined" && window.__transitoDrone) ? window.__transitoDrone : null;
    const bar = (v) => { const n = Math.round(this._c01(v) * 12); return "█".repeat(n) + "·".repeat(12 - n); };
    const transit = this.voices.length;
    const lines = [
      "MÓDULO B · EL TRÁNSITO DE UNA VOZ",
      "—",
      `ETH /tx   ${bar(this.ethPressure)} ${this.ethPressure.toFixed(2)}`,
      `consenso  ${bar(this.coherence)} ${this.coherence.toFixed(2)}`,
      `en tránsito ${String(transit).padStart(2, "0")}  inscritas ${String(this.inscribedCount).padStart(3, "0")}`,
      `opacas    ${String(this.opaqueCount).padStart(3, "0")}  flujo ${this.throughput.toFixed(2)}`,
      `opacidad  ${bar(this.opacityLoad)} ${this.opacityLoad.toFixed(2)}`,
      "—",
      "DRONE ← tránsito  →SC /soneth/*",
    ];
    if (d) {
      if (d.held) {
        lines.push("⟂ retenido — deliberación (overlap buffer)");
      } else {
        lines.push(`depth ${bar(d.depth)} ${d.depth.toFixed(2)}`);
        lines.push(`mix   ${bar(d.mix)} ${d.mix.toFixed(2)}`);
        lines.push(`fade  ${bar(d.fade)} ${d.fade.toFixed(2)}`);
      }
      if (typeof d.veil === "number" && d.veil < 0.98) {
        lines.push(`velo ×${d.veil.toFixed(2)} (resto no inscrito)`);
      }
    } else {
      lines.push("(bridge fuera de línea)");
    }
    this._hud.innerHTML = lines.join("<br>");
  }

  // ───────────────────────────────────────────────────────────────────────
  // VOICES — the political act in transit
  // ───────────────────────────────────────────────────────────────────────
  _spawnVoice() {
    if (this.voices.length > 42) return;
    const col = this._col("vegetal");
    const mesh = new THREE.Mesh(this._voiceGeo, new THREE.MeshBasicMaterial({ color: col, fog: false }));
    mesh.position.copy(this._curves.main.getPoint(0));
    // illuminated halo — a soft GREY aura (glow on white paper is grey, not
    // colour). DarkForest's head-glow, normal-blended so it reads on paper.
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._haloTex, color: this._col("validada"), transparent: true,
      depthWrite: false, depthTest: false, fog: false, opacity: 0.4,
    }));
    halo.scale.setScalar(0.5);
    mesh.position.z += 0.02; // keep the core just above its halo
    this.world.add(mesh, halo);
    this.voices.push({ t: 0, branch: null, mesh, halo, done: false, fade: 1 });
  }

  _updateVoices(dt) {
    const speed = THREE.MathUtils.lerp(0.62, 0.16, this.ctl.time); // timedilation slows transit
    // probability the event is retained as OPAQUE rises with closeness to the
    // Vegetal pole and with the season (here: inverse of coherence + a slow drift)
    const seasonDrift = 0.5 + 0.5 * Math.sin(this._t * 0.08);
    const voiceScale = THREE.MathUtils.lerp(0.7, 1.7, this.ctl.vol); // Master Vol → presence of each voice
    const glow = 0.45 + this.ctl.vol * 0.55;                         // Master Vol → illumination
    for (let i = this.voices.length - 1; i >= 0; i--) {
      const v = this.voices[i];
      v.mesh.scale.setScalar(voiceScale);
      v.t += dt * speed;
      if (v.t <= 1) {
        v.mesh.position.copy(this._curves.main.getPoint(this._c01(v.t)));
      } else if (v.t <= 2) {
        if (v.branch === null) {
          const pOpaque = Math.max(0.06, Math.min(0.62, 0.14 + (1 - this.coherence) * 0.3 + seasonDrift * 0.16));
          v.branch = Math.random() < pOpaque ? "opaque" : "inscribed";
        }
        const bt = this._c01(v.t - 1);
        const curve = v.branch === "inscribed" ? this._curves.inscribe : this._curves.opacify;
        v.mesh.position.copy(curve.getPoint(bt));
        if (v.branch === "inscribed") { v.mesh.material.color.copy(this._col("token")); v.halo.material.color.copy(this._col("token")); }
        else {
          v.mesh.material.color.copy(this._col("opaque")); v.halo.material.color.copy(this._col("opaque"));
          v.fade = 1 - bt; v.mesh.material.opacity = Math.max(0, v.fade); v.mesh.material.transparent = true;
        }
      } else {
        // arrived
        if (!v.done) {
          v.done = true;
          if (v.branch === "inscribed") { this.inscribedCount++; this._inscribeRate += 1; this._throughputPulse = Math.min(1.6, this._throughputPulse + 0.5); this._flashInscribed(); }
          else { this.opaqueCount++; this._opaqueRate += 1; this._flashOpaque(); }
        }
        this._disposeVoice(v);
        this.voices.splice(i, 1);
        continue;
      }
      // illuminate the halo — pulse like DarkForest's flow heads, scaled by
      // Master Vol + throughput. On paper this reads as a lit coloured dot.
      const env = (v.branch === "opaque") ? Math.max(0, v.fade) : 1;
      const pulse = 0.5 + 0.5 * Math.sin(this._t * 6 + i);
      v.halo.position.copy(v.mesh.position);
      v.halo.material.opacity = (0.16 + 0.4 * pulse) * glow * env;
      v.halo.scale.setScalar((0.4 + 0.16 * pulse + 0.28 * this.throughput) * voiceScale);
    }
  }

  _disposeVoice(v) {
    if (v.mesh) { this.world.remove(v.mesh); if (v.mesh.material) v.mesh.material.dispose(); }
    if (v.halo) { this.world.remove(v.halo); if (v.halo.material) v.halo.material.dispose(); }
  }

  _flashInscribed() { this._inscribedFlash = 1; }
  _flashOpaque() { this._opaqueFlash = 1; }

  // ───────────────────────────────────────────────────────────────────────
  // PUBLIC API (mirrors index.html sliders + ETH affects + reverse readouts)
  // ───────────────────────────────────────────────────────────────────────
  setMasterVol({ level = 0.5 } = {})     { this.tgt.vol = this._c01(level); }
  setPitchShift({ value = 0.5 } = {})    { this.tgt.pitch = this._c01(value); }
  setTimeDilation({ value = 0.3 } = {})  { this.tgt.time = this._c01(value); }
  setSpectralShift({ value = 0.4 } = {}) { this.tgt.spectral = this._c01(value); }
  setSpatialSpread({ value = 0.5 } = {}) { this.tgt.spatial = this._c01(value); }
  setCoherence({ value = 0.5 } = {})     { this.coherenceTgt = this._c01(value); }
  pulse({ intensity = 1.4 } = {}) { this._pulseAmt = Math.min(3, this._pulseAmt + intensity); this._spawnVoice(); }
  emitVoice({ count = 1 } = {}) { for (let i = 0; i < Math.max(1, Math.min(12, count | 0)); i++) this._spawnVoice(); }
  // ETH eco signals → bursts of voices entering the machine
  triggerCO2({ amount = 50 } = {}) { const n = Math.max(1, Math.round(amount / 60)); for (let i = 0; i < n; i++) this._spawnVoice(); this.ethPressureTgt = Math.min(1, this.ethPressureTgt + 0.12); }
  triggerMycoPulse({ intensity = 1 } = {}) { this._spawnVoice(); this._pulseAmt = Math.min(3, this._pulseAmt + intensity * 0.4); }
  triggerPhosphorus({ amount = 30 } = {}) { this._spawnVoice(); }
  triggerNitrogen({ amount = 30 } = {}) { this._spawnVoice(); }
  whisper() { /* reserved */ }

  getVitality() { return this._c01(this.throughput); }
  getThroughput() { return this._c01(this.throughput); }
  getCoherence() { return this._c01(this.coherence); }
  // fraction of recent voices retained as OPAQUE rather than inscribed — the
  // veil pressure the loader uses to hold back the drone (opacity clause on out).
  getOpacityLoad() { return this._c01(this.opacityLoad); }

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

    // ETH inflow → spontaneous voice generation (the political act recurs)
    this._spawnAccum += dt * (0.25 + this.ethPressure * 2.4 + this._pulseAmt * 0.6);
    while (this._spawnAccum >= 1) { this._spawnAccum -= 1; this._spawnVoice(); }
    this._updateVoices(dt);

    // throughput eases toward recent inscription pulse
    this._throughputPulse = Math.max(0, this._throughputPulse - dt * 0.5);
    const thrTgt = Math.min(1, this._throughputPulse * 0.6 + this.voices.length / 28 + this.ethPressure * 0.2);
    this.throughput += (thrTgt - this.throughput) * (1 - Math.pow(0.02, dt));

    // opacity load: decay the arrival counters, ease toward opaque/(opaque+inscribed)
    const decay = Math.pow(0.6, dt); // ~half-life a couple seconds
    this._opaqueRate *= decay; this._inscribeRate *= decay;
    const tot = this._opaqueRate + this._inscribeRate;
    const loadTgt = tot > 0.05 ? this._opaqueRate / tot : 0;
    this.opacityLoad += (loadTgt - this.opacityLoad) * (1 - Math.pow(0.05, dt));

    this._updateScene(dt);
    this._updateHUD();

    this._pulseAmt = Math.max(0, this._pulseAmt - dt * 1.1);
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
    if (typeof sp.harmonicrich === "number") {
      const want = 3 + Math.round(this._c01(sp.harmonicrich) * 5); // 3..8 branches
      if (want !== this._branchCount) { this._branchCount = want; this._rebuildBranches(); }
    }
  }

  _updateControls(dt) {
    const k = 1 - Math.pow(0.0025, dt);
    for (const key of ["vol", "pitch", "time", "spectral", "spatial"]) this.ctl[key] += (this.tgt[key] - this.ctl[key]) * k;
    this.coherence += (this.coherenceTgt - this.coherence) * k;
    this.ethPressure += (this.ethPressureTgt - this.ethPressure) * k;

    // Spatial Sprd → spread of the whole diagram (tight ↔ diffuse)
    if (this.world) {
      const s = THREE.MathUtils.lerp(0.82, 1.22, this.ctl.spatial);
      this.world.scale.x += (s - this.world.scale.x) * k;
      this.world.scale.y += (s - this.world.scale.y) * k;
    }
  }

  _updateScene(dt) {
    // reloj fenológico — slow rotation, scaled by timedilation (slow time)
    if (this.phenoRing) this.phenoRing.rotation.z += dt * THREE.MathUtils.lerp(0.16, 0.02, this.ctl.time);

    // Pitch Shift → which RV pole is emphasised (scale pulse on the chosen ring)
    const emph = this.ctl.pitch; // 0=vegetal, .5=validada, 1=virtual
    const sV = 1 + Math.max(0, 1 - Math.abs(emph - 1) * 3) * 0.4;
    const sD = 1 + Math.max(0, 1 - Math.abs(emph - 0.5) * 3) * 0.4;
    const sG = 1 + Math.max(0, 1 - Math.abs(emph - 0) * 3) * 0.4;
    if (this._rvVirtual) this._rvVirtual.scale.setScalar(this._lerpS(this._rvVirtual.scale.x, sV, dt));
    if (this._rvValidada) this._rvValidada.scale.setScalar(this._lerpS(this._rvValidada.scale.x, sD, dt));
    if (this._rvVegetal) this._rvVegetal.scale.setScalar(this._lerpS(this._rvVegetal.scale.x, sG, dt));

    // OVERLAP aura breathes with coherence; von-Foerster branches flicker
    if (this._overlapAura) {
      const s = 1 + 0.12 * Math.sin(this._t * 1.4) + this.coherence * 0.18;
      this._overlapAura.scale.setScalar(s);
      this._overlapAura.material.opacity = 0.45 + this.coherence * 0.4;
    }
    if (this._branches) {
      // Spectral Shift → flicker rate of the simulated futures (cool ↔ agitated)
      const rate = THREE.MathUtils.lerp(1.2, 3.6, this.ctl.spectral);
      for (const b of this._branches) {
        const f = 0.5 + 0.5 * Math.sin(this._t * rate + b.phase);
        b.dot.material.opacity = 0.3 + f * 0.6 * (0.4 + this.throughput * 0.6);
        b.line.material.opacity = 0.3 + f * 0.4;
      }
    }

    // inscription / opacity flashes
    if (this._inscribedFlash > 0 && this._inscribedGlyph) {
      this._inscribedFlash = Math.max(0, this._inscribedFlash - dt * 2.5);
      this._inscribedGlyph.scale.setScalar(1 + this._inscribedFlash * 0.5);
    }
    if (this._opaqueFlash > 0 && this._opaqueVeil) {
      this._opaqueFlash = Math.max(0, this._opaqueFlash - dt * 2.5);
      this._opaqueVeil.material.opacity = 0.6 + this._opaqueFlash * 0.4;
    }
    // (Sprite labels auto-billboard toward the camera, so they stay legible
    //  through any orbit/zoom without per-frame work here.)
  }

  _lerpS(cur, want, dt) { return cur + (want - cur) * (1 - Math.pow(0.01, dt)); }

  // ───────────────────────────────────────────────────────────────────────
  destroy() {
    if (this._animationId) { cancelAnimationFrame(this._animationId); this._animationId = null; }
    try {
      for (const el of [this._hud, this._hint]) if (el && el.parentNode) el.parentNode.removeChild(el);
      for (const v of this.voices) this._disposeVoice(v);
      this.voices = [];
      if (this._voiceGeo) this._voiceGeo.dispose();
      if (this._haloTex) this._haloTex.dispose();
      for (const s of this._sprites) { if (s.material && s.material.map) s.material.map.dispose(); if (s.material) s.material.dispose(); }
      this._sprites = [];
    } catch (e) { /* ignore */ }
    super.destroy();
  }
}

export default Transito;
