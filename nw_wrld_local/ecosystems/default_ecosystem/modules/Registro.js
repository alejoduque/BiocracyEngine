/*
@nwWrld name: Registro
@nwWrld category: 3D
@nwWrld imports: BaseThreeJsModule, THREE, loadJson
*/

/*
 * Registro — "El registro vivo"  ·  Módulo R · Corporación Manakai
 * ---------------------------------------------------------------------------
 * HYBRID 3D + ASCII FIELD — the monospace brightness field of Cheng Lou's
 * pretext demo composited OVER a lit Three.js scene. The optimization-graph
 * nodes (slot 6 fusion) are realised as a BatchedMesh of torus knots and a
 * sphere — three attractor poles rotating in a fog-filled scene, probed by
 * raycaster needles whose scatter visualises the field's deliberative tension.
 *
 * The ASCII canvas is semi-transparent: paper bleeds into the 3D geometry,
 * fusing both layers. The four flows still map to the field:
 *   · CONSENSUS  — high → field organises + raycaster probes tighten;
 *                  low → turbulence + probes scatter wide.
 *   · BUFFER     — woven legible lines that type out, hold, and fade.
 *   · OPACITY    — sensitive species redacts a block (▓).
 *   · PHENOLOGY  — window.__activeSpecies is a bright attractor + headline.
 *
 * Three.js features (from batched raycaster demo):
 *   · BatchedMesh with 3 geometries (2 TorusKnot + 1 Sphere)
 *   · MeshPhongMaterial (lit, ink-coloured)
 *   · DirectionalLight + AmbientLight
 *   · Scene fog (THREE.Fog)
 *   · Per-instance matrix animation (dolly pattern)
 *   · Raycaster probes — origin spheres, hit spheres, connecting cylinders
 *   · Container Object3D rotation driven by timedilation
 */

class Registro extends BaseThreeJsModule {

  static methods = [
    { name: "setMasterVol",     executeOnLoad: true,  options: [{ name: "level", defaultVal: 0.5, type: "number", min: 0, max: 1 }] },
    { name: "setPitchShift",    executeOnLoad: true,  options: [{ name: "value", defaultVal: 0.5, type: "number", min: 0, max: 1 }] },
    { name: "setTimeDilation",  executeOnLoad: true,  options: [{ name: "value", defaultVal: 0.3, type: "number", min: 0, max: 1 }] },
    { name: "setSpectralShift", executeOnLoad: true,  options: [{ name: "value", defaultVal: 0.4, type: "number", min: 0, max: 1 }] },
    { name: "setSpatialSpread", executeOnLoad: true,  options: [{ name: "value", defaultVal: 0.5, type: "number", min: 0, max: 1 }] },
    { name: "setCoherence",     executeOnLoad: false, options: [{ name: "value", defaultVal: 0.5, type: "number", min: 0, max: 1 }] },
    { name: "pulse",            executeOnLoad: false, options: [{ name: "intensity", defaultVal: 1.4, type: "number", min: 0.3, max: 4 }] },
    { name: "whisper",          executeOnLoad: false, options: [{ name: "text", defaultVal: "", type: "string" }] },
    { name: "triggerCO2",        executeOnLoad: false, options: [{ name: "amount", defaultVal: 50, type: "number", min: 10, max: 200 }] },
    { name: "triggerMycoPulse",  executeOnLoad: false, options: [{ name: "intensity", defaultVal: 1, type: "number", min: 0.1, max: 5 }] },
    { name: "triggerPhosphorus", executeOnLoad: false, options: [{ name: "amount", defaultVal: 30, type: "number", min: 10, max: 100 }] },
    { name: "triggerNitrogen",   executeOnLoad: false, options: [{ name: "amount", defaultVal: 30, type: "number", min: 10, max: 100 }] },
  ];

  static PAPER = "#F5F5F1";
  static GREY = "rgba(140,140,134,";   // dim band  (append "a)")
  static MID  = "rgba(74,74,69,";      // mid band
  static INK  = "rgba(20,20,20,";      // hot band
  // value ramp, light → dark (single-weight monospace ASCII)
  static RAMP = " ·.:-=+*coaem#%@";

  // 3D constants (from batched raycaster demo)
  static BG_COLOR  = 0xF5F5F1;
  static MESH_COLOR = 0x141414;  // ink
  static LINE_COLOR = 0xB43C50;  // muted accent for raycaster probes
  static POINT_DIST = 12;       // raycaster orbit radius

  static CORPUS = [
    "el parlamento no vive en el disparo sino en la demora",
    "simular antes de ejecutar — el overlap buffer retiene la voz",
    "aumentar el número de opciones · von foerster",
    "donde el diagrama calla la biocracia decide no gobernar de más",
    "escuchar no es extraer su legibilidad",
    "el resto opaco se desprende del registro · no inscribible",
    "inscribir o retener — la aceptación se duplica",
    "el bosque nunca se reduce a un número canjeable",
    "la ausencia medida también es voz",
    "cada futuro simulado abre una opción más",
  ];
  static MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  static MONTH_STARTS = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];

  constructor(container) {
    super(container);
    this._t = 0; this._frame = 0;
    this._last = performance.now();
    this._animationId = null;

    this.ctl = { vol: 0.5, pitch: 0.5, time: 0.3, spectral: 0.4, spatial: 0.5 };
    this.tgt = { vol: 0.5, pitch: 0.5, time: 0.3, spectral: 0.4, spatial: 0.5 };
    this.coherence = 0.5; this.coherenceTgt = 0.5;

    // record buffer (woven legible lines)
    this._log = []; this._stream = null; this._queue = [];
    this._corpusIdx = 0; this._composeAccum = 0; this._cursorBlink = 0;
    this._lastActiveSci = ""; this._inscribed = 0; this._redacted = 0;
    this._composeKind = 0;                          // rotate utterance kinds → variety
    this._eth = { co2: 0, n: 0, p: 0, myco: 0 };    // accumulate ETH, summarise (not 1 line each)

    // optimization graph (fused with slot 6) — attractors of the field
    this._nodes = [];
    this._renderAccum = 0;

    // 3D state
    this._rayCasterObjects = [];
    this._dolly = new THREE.Object3D();
    this._raycaster = new THREE.Raycaster();
    this._batchedMesh = null;
    this._containerObj = null;

    this.init();
  }

  _c01(v) { v = +v; return isFinite(v) ? Math.max(0, Math.min(1, v)) : 0; }
  _hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

  init() {
    // Enable orbit controls for the 3D layer
    if (this.controls) {
      this.controls.enabled = true;
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.06;
      this.controls.enableRotate = true;
      this.controls.enableZoom = true;
      this.controls.enablePan = true;
      this.controls.minDistance = 15;
      this.controls.maxDistance = 70;
    }

    // Show the WebGL renderer on top of the ASCII background
    if (this.renderer) {
      this.renderer.setClearColor(Registro.BG_COLOR, 0); // transparent background clear
      this.renderer.setPixelRatio(window.devicePixelRatio);
      if (this.renderer.domElement) {
        this.renderer.domElement.style.position = "absolute";
        this.renderer.domElement.style.inset = "0";
        this.renderer.domElement.style.width = "100%";
        this.renderer.domElement.style.height = "100%";
        this.renderer.domElement.style.zIndex = "1"; // z-index 1 (foreground)
        this.renderer.domElement.style.display = "block";
      }
    }

    const host = this.elem;
    if (host && getComputedStyle(host).position === "static") host.style.position = "relative";

    // ASCII canvas — positioned in the background
    this._cv = document.createElement("canvas");
    this._cv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;z-index:0;display:block;background:transparent;pointer-events:none;";
    if (host) host.appendChild(this._cv);
    this._cx = this._cv.getContext("2d");
    this._off = document.createElement("canvas").getContext("2d");

    this._buildNodes(16);
    this._resize();
    this._ro = new ResizeObserver(() => this._resize());
    if (host) this._ro.observe(host);

    // Build the 3D scene
    this._build3DScene();
    this._createBatchedMesh();
    this._buildRaycasters(40);

    this._buildHUD();
    this._pushUtterance("REGISTRO ABIERTO · CÁMARA FENOLÓGICA DE LO VIVO", { kind: "head" });
    this._pushUtterance(Registro.CORPUS[0], { kind: "corpus" });

    this.show();
    this._animate = this._animate.bind(this);
    this._animationId = requestAnimationFrame(this._animate);
  }

  // ── 3D SCENE — fog, lights, container, camera ──────────────────────────────
  _build3DScene() {
    if (!this.scene) return;

    // Scene fog — depth fading to solid paper color
    this.scene.fog = new THREE.Fog(Registro.BG_COLOR, 25, 65);
    this.scene.background = null; // transparent background so ASCII behind it is visible

    // Lighting — directional + ambient for MeshPhongMaterial
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(1, 1, 1);
    this.scene.add(dirLight);
    this._dirLight = dirLight;
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.8));

    // Container Object3D — holds the batched mesh, slowly rotates
    this._containerObj = new THREE.Object3D();
    this._containerObj.scale.multiplyScalar(3);
    this._containerObj.rotation.x = Math.random() * Math.PI * 2;
    this._containerObj.rotation.y = Math.random() * Math.PI * 2;
    this.scene.add(this._containerObj);

    // Camera configuration
    this.camera.fov = 60;
    this.camera.near = 0.1;
    this.camera.far = 80;
    this.camera.position.set(0, 0, 35);
    this.camera.updateProjectionMatrix();

    if (this.controls) {
      this.controls.target.set(0, 0, 0);
      this.controls.update();
    }
  }

  // ── BATCHED MESH — TorusKnot + Sphere as attractor geometry ────────────────
  _createBatchedMesh() {
    if (!this._containerObj) return;

    const radius = 0.5;

    // Three geometries: two torus knots + one sphere
    const knotGeometry  = new THREE.TorusKnotGeometry(radius, 0.2, 120, 60, 2, 3);
    const knot2Geometry = new THREE.TorusKnotGeometry(radius, 0.2, 120, 60, 3, 4);
    const sphereGeometry = new THREE.SphereGeometry(radius, 60, 60);

    const maxVertices = knotGeometry.attributes.position.count
                      + knot2Geometry.attributes.position.count
                      + sphereGeometry.attributes.position.count;
    const maxIndexes = knotGeometry.index.count
                     + knot2Geometry.index.count
                     + sphereGeometry.index.count;

    // MeshPhongMaterial — lit, ink-coloured
    this._batchMaterial = new THREE.MeshPhongMaterial({ color: Registro.MESH_COLOR });

    this._batchedMesh = new THREE.BatchedMesh(3, maxVertices, maxIndexes, this._batchMaterial);

    const knotGeoId   = this._batchedMesh.addGeometry(knotGeometry);
    const knot2GeoId  = this._batchedMesh.addGeometry(knot2Geometry);
    const sphereGeoId = this._batchedMesh.addGeometry(sphereGeometry);

    const dolly = this._dolly;

    // Position the three instances
    dolly.position.set(-1.5, 0, 0);
    dolly.rotation.set(0, 0, 0);
    dolly.updateMatrix();
    this._batchedMesh.setMatrixAt(0, dolly.matrix);

    dolly.position.set(0, 0, 0);
    dolly.updateMatrix();
    this._batchedMesh.setMatrixAt(1, dolly.matrix);

    dolly.position.set(1.5, 0, 0);
    dolly.updateMatrix();
    this._batchedMesh.setMatrixAt(2, dolly.matrix);

    this._containerObj.add(this._batchedMesh);

    // Dispose source geometries (data is now in the batched mesh)
    knotGeometry.dispose();
    knot2Geometry.dispose();
    sphereGeometry.dispose();
  }

  // ── PER-INSTANCE ANIMATION (dolly matrix pattern) ──────────────────────────
  _updateBatchedInstances() {
    if (!this._batchedMesh) return;
    const time = performance.now();
    const dolly = this._dolly;
    const pitchMul = 0.6 + this.ctl.pitch * 0.8; // pitchshift → rotation speed

    // Instance 0 — consensus knot
    this._batchedMesh.getMatrixAt(0, dolly.matrix);
    dolly.matrix.decompose(dolly.position, dolly.quaternion, dolly.scale);
    dolly.rotation.set(0.0003 * time * pitchMul, 0.0003 * time * pitchMul, 0);
    dolly.updateMatrix();
    this._batchedMesh.setMatrixAt(0, dolly.matrix);

    // Instance 1 — buffer knot
    this._batchedMesh.getMatrixAt(1, dolly.matrix);
    dolly.matrix.decompose(dolly.position, dolly.quaternion, dolly.scale);
    dolly.rotation.set(0.0009 * time * pitchMul, 0.0009 * time * pitchMul, 0);
    dolly.updateMatrix();
    this._batchedMesh.setMatrixAt(1, dolly.matrix);

    // Instance 2 — phenology sphere
    this._batchedMesh.getMatrixAt(2, dolly.matrix);
    dolly.matrix.decompose(dolly.position, dolly.quaternion, dolly.scale);
    dolly.rotation.set(0.0005 * time * pitchMul, 0.0005 * time * pitchMul, 0);
    dolly.updateMatrix();
    this._batchedMesh.setMatrixAt(2, dolly.matrix);
  }

  // ── RAYCASTER PROBES — deliberation needles ────────────────────────────────
  _buildRaycasters(count) {
    const sphereGeo = new THREE.SphereGeometry(0.25, 12, 12);
    const cylinderGeo = new THREE.CylinderGeometry(0.01, 0.01);
    const pointDist = Registro.POINT_DIST;

    this._rcSphereGeo = sphereGeo;
    this._rcCylinderGeo = cylinderGeo;

    for (let i = 0; i < count; i++) {
      this._addRaycaster(sphereGeo, cylinderGeo, pointDist);
    }
  }

  _addRaycaster(sphereGeo, cylinderGeo, pointDist) {
    const lineColor = Registro.LINE_COLOR;
    const material = new THREE.MeshBasicMaterial({ color: lineColor });

    const obj = new THREE.Object3D();

    const origMesh = new THREE.Mesh(sphereGeo, material);
    origMesh.scale.multiplyScalar(0.5);

    const hitMesh = new THREE.Mesh(sphereGeo, material.clone());
    hitMesh.scale.multiplyScalar(0.25);

    const cylinderMesh = new THREE.Mesh(cylinderGeo, new THREE.MeshBasicMaterial({
      color: lineColor, transparent: true, opacity: 0.35,
    }));

    obj.add(cylinderMesh);
    obj.add(origMesh);
    obj.add(hitMesh);
    this.scene.add(obj);

    // Place origin at orbit distance
    origMesh.position.set(pointDist, 0, 0);

    // Random initial rotation
    const x = Math.random() * 10;
    const y = Math.random() * 10;
    const z = Math.random() * 10;

    // Random angular velocities
    const xDir = (Math.random() - 0.5);
    const yDir = (Math.random() - 0.5);
    const zDir = (Math.random() - 0.5);

    // Reusable vectors
    const origVec = new THREE.Vector3();
    const dirVec = new THREE.Vector3();
    const raycaster = this._raycaster;
    const containerObj = this._containerObj;

    this._rayCasterObjects.push({
      obj, origMesh, hitMesh, cylinderMesh, material,
      update: () => {
        const time = performance.now();
        // Modulate scatter by consensus — low consensus → wider orbits
        const consensusScale = 1 + (1 - this.coherence) * 0.8;

        obj.rotation.x = xDir * 0.0001 * time * consensusScale + x;
        obj.rotation.y = yDir * 0.0001 * time * consensusScale + y;
        obj.rotation.z = zDir * 0.0001 * time * consensusScale + z;

        origMesh.updateMatrixWorld();
        origVec.setFromMatrixPosition(origMesh.matrixWorld);
        dirVec.copy(origVec).multiplyScalar(-1).normalize();

        raycaster.set(origVec, dirVec);
        raycaster.firstHitOnly = true;

        const res = raycaster.intersectObject(containerObj, true);
        const length = res.length ? res[0].distance : pointDist;

        hitMesh.position.set(pointDist - length, 0, 0);

        // Hit sphere visibility — only show when there's a hit
        hitMesh.visible = res.length > 0;

        const lineLength = res.length
          ? length - raycaster.near
          : length - raycaster.near - (pointDist - raycaster.far);

        cylinderMesh.position.set(pointDist - raycaster.near - (lineLength / 2), 0, 0);
        cylinderMesh.scale.set(1, Math.max(0.01, lineLength), 1);
        cylinderMesh.rotation.z = Math.PI / 2;

        // Fade opacity by consensus — high consensus → bolder probes
        const baseOpacity = 0.15 + this.coherence * 0.35;
        cylinderMesh.material.opacity = baseOpacity;
      },
      remove: () => {
        this.scene.remove(obj);
        material.dispose();
      }
    });
  }

  _updateRaycasters() {
    for (let i = 0; i < this._rayCasterObjects.length; i++) {
      this._rayCasterObjects[i].update();
    }
  }

  // ── 3D SCENE UPDATE — container rotation, fog, light ───────────────────────
  _update3DScene(dt) {
    if (!this._containerObj) return;

    // Container rotation speed driven by timedilation (slow time → slow rotation)
    const rotSpeed = THREE.MathUtils.lerp(0.0002, 0.00005, this.ctl.time);
    const time = performance.now();
    this._containerObj.rotation.x = rotSpeed * time;
    this._containerObj.rotation.y = rotSpeed * time;
    this._containerObj.updateMatrixWorld();

    // Fog near/far driven by spectralshift — high spectral → less fog (revealing depth)
    if (this.scene.fog) {
      this.scene.fog.near = THREE.MathUtils.lerp(18, 35, this.ctl.spectral);
      this.scene.fog.far = THREE.MathUtils.lerp(50, 85, this.ctl.spectral);
    }

    // Raycaster near/far driven by consensus
    this._raycaster.near = THREE.MathUtils.lerp(2, 0, this.coherence);
    this._raycaster.far = Registro.POINT_DIST;
  }

  // ── NODES — optimization graph attractors (unchanged logic) ────────────────
  _buildNodes(n) {
    this._nodes = [];
    for (let i = 0; i < n; i++) this._nodes.push({ x: 0, y: 0, tx: 0, ty: 0, act: 0 });
  }

  // size canvas to host (CSS px for perf) + compute the monospace grid
  _resize() {
    const host = this.elem; if (!host || !this._cx) return;
    const W = Math.max(2, host.clientWidth || 800);
    const H = Math.max(2, host.clientHeight || 600);
    this._cv.width = W; this._cv.height = H;
    this._W = W; this._H = H;
    this._px = Math.max(11, Math.round(H / 46));          // glyph size ~ viewport
    this._font = `400 ${this._px}px 'Menlo','Consolas','DejaVu Sans Mono',monospace`;
    this._off.font = this._font;
    this._cw = this._off.measureText("M").width || this._px * 0.6;
    this._ch = Math.round(this._px * 1.12);
    this._cols = Math.max(8, Math.floor(W / this._cw));
    this._rows = Math.max(6, Math.floor(H / this._ch));
    this._buf = new Float32Array(this._cols * this._rows);

    // Also resize the WebGL renderer
    if (this.renderer) {
      this.renderer.setSize(W, H);
      if (this.camera) {
        this.camera.aspect = W / H;
        this.camera.updateProjectionMatrix();
      }
    }
  }

  // ── slot-6 fusion: tree-layout optimization graph as the field's attractors ──
  _updateNodes(dt) {
    const sp = this._soneth();
    const pitch = sp.pitchshift, spat = sp.spatialspread, spec = sp.spectralshift;
    const noise = sp.noiselevel, tDil = this.ctl.time;
    const consensus = this.coherence;
    const N = this._nodes.length;

    // pseudo-activities → root is the most active node
    let maxAct = -1, root = 0;
    for (let i = 0; i < N; i++) {
      this._nodes[i].act = 0.5 + 0.5 * Math.sin(this._t * 0.5 + i * 1.3);
      if (this._nodes[i].act > maxAct) { maxAct = this._nodes[i].act; root = i; }
    }
    const rootY = 0.7 - pitch * 0.5;                 // normalized [-1,1], y up
    const layerSpacing = 0.18 + pitch * 0.4;
    const treeW = THREE.MathUtils.lerp(0.4, 0.95, spat);
    let child = 0;
    for (let i = 0; i < N; i++) {
      const n = this._nodes[i];
      if (i === root) {
        n.tx = 0; n.ty = rootY - Math.sin(this._t * (0.6 + tDil)) * 0.06;
      } else {
        const layer = Math.floor(Math.log2(child + 2));
        const cnt = Math.pow(2, layer);
        const pos = (child + 2) - cnt;
        const breathe = Math.sin(this._t * (0.6 + tDil) + layer) * (0.08 + spec * 0.14) * (1.1 - consensus);
        n.tx = THREE.MathUtils.lerp(-treeW, treeW, (pos + 0.5) / cnt) + breathe;
        n.ty = rootY - layer * layerSpacing + (this._hash(i + this._frame * 0.02) - 0.5) * 0.12 * noise * 3;
        child++;
      }
      // snap eases harder when there's consensus; loose + jittery without it
      const snap = Math.min(0.05 + (1 - consensus) * 0.35 * (0.5 + tDil), 1) * (dt * 60) * 0.06 + 0.04;
      n.x += (n.tx - n.x) * Math.min(1, snap);
      n.y += (n.ty - n.y) * Math.min(1, snap);
      if (consensus < 0.8) { n.x += (Math.random() - 0.5) * 0.02 * (1 - consensus); n.y += (Math.random() - 0.5) * 0.02 * (1 - consensus); }
    }
    this._root = root;
  }

  // ── build the brightness field + render it as ASCII (per-row, semi-transparent) ──
  _renderAscii() {
    const cx = this._cx, cols = this._cols, rows = this._rows, buf = this._buf;
    // Clear to transparent so the 3D scene shows through
    cx.clearRect(0, 0, this._W, this._H);

    // Solid paper wash — renders behind the 3D geometry
    cx.fillStyle = "#F5F5F1";
    cx.fillRect(0, 0, this._W, this._H);

    const consensus = this.coherence;
    const turb = (1 - consensus) * 0.55;              // low consensus → noisy field
    const sp = this._soneth();
    const amp = 0.45 + sp.harmonicrich * 0.4;
    const t = this._t;

    // base field — coherent waves; turbulence sprinkled when no consensus
    for (let r = 0; r < rows; r++) {
      const ny = 1 - (r / rows) * 2;
      for (let c = 0; c < cols; c++) {
        const nx = (c / cols) * 2 - 1;
        let v = 0.42
          + 0.26 * Math.sin(nx * 3.0 + t * 0.6) * Math.cos(ny * 3.0 - t * 0.4)
          + 0.16 * Math.sin((nx + ny) * 5.0 - t * 0.8);
        if (turb > 0) v += (this._hash(c * 7.3 + r * 13.1 + this._frame) - 0.5) * turb;
        buf[r * cols + c] = v;
      }
    }

    // attractors = optimization-graph nodes (slot 6 fusion)
    const sigma = Math.max(2.2, cols * 0.05);
    for (let i = 0; i < this._nodes.length; i++) {
      const n = this._nodes[i];
      const ccol = (n.x * 0.5 + 0.5) * cols;
      const crow = (1 - (n.y * 0.5 + 0.5)) * rows;
      const a = (i === this._root ? 0.9 : 0.5) * amp * (0.6 + n.act * 0.6);
      this._deposit(ccol, crow, a, i === this._root ? sigma * 1.3 : sigma);
      // edge to root → brightness ridge
      if (i !== this._root) {
        const rn = this._nodes[this._root];
        const rc = (rn.x * 0.5 + 0.5) * cols, rr = (1 - (rn.y * 0.5 + 0.5)) * rows;
        for (let s = 0; s < 6; s++) { const u = s / 6; this._deposit(ccol + (rc - ccol) * u, crow + (rr - crow) * u, 0.18 * amp, sigma * 0.5); }
      }
    }

    // phenology: the active species is a bright attractor
    const active = this._activeSpecies();
    if (active && active.ring) {
      const ac = (this._c01(active.ring.x * 0.5 + 0.5)) * cols;
      const ar = (1 - this._c01(active.ring.y * 0.5 + 0.5)) * rows;
      this._deposit(ac, ar, 1.0 * amp, sigma * 1.1);
    }

    // ── draw the field: semi-transparent ink so 3D geometry bleeds through
    cx.font = this._font; cx.textBaseline = "top";
    cx.fillStyle = "rgba(20,20,20,0.72)";
    const RAMP = Registro.RAMP, RN = RAMP.length - 1;
    for (let r = 0; r < rows; r++) {
      let s = "";
      for (let c = 0; c < cols; c++) {
        let v = buf[r * cols + c]; if (v < 0) v = 0; else if (v > 1) v = 1;
        s += RAMP[Math.round(v * RN)];
      }
      cx.fillText(s, 0, r * this._ch);
    }

    this._drawWoven(cx, cols, rows);
    this._drawCorner(cx);
  }

  _deposit(ccol, crow, amp, sig) {
    const cols = this._cols, rows = this._rows, buf = this._buf;
    const rad = Math.ceil(sig * 3), s2 = 2 * sig * sig;
    const x0 = Math.max(0, Math.floor(ccol - rad)), x1 = Math.min(cols - 1, Math.ceil(ccol + rad));
    const y0 = Math.max(0, Math.floor(crow - rad)), y1 = Math.min(rows - 1, Math.ceil(crow + rad));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = x - ccol, dy = y - crow;
      buf[y * cols + x] += amp * Math.exp(-(dx * dx + dy * dy) / s2);
    }
  }

  // legible record lines woven over the field (buffer) + redaction (opacity)
  _drawWoven(cx, cols, rows) {
    const startRow = Math.max(1, rows - 9);
    const x0 = Math.round(this._cw * 3);
    let row = startRow;
    const lines = this._log.slice(-6);
    for (let i = 0; i < lines.length; i++) {
      const ut = lines[i];
      const recency = (i + 1) / lines.length;
      const alpha = (0.3 + 0.7 * recency) * Math.max(0.2, 1 - ut.age / 22);
      this._drawWovenLine(cx, ut.text, x0, row * this._ch, alpha, ut.sensitive, ut.kind === "head");
      row++;
    }
    if (this._stream) {
      const shown = this._stream.text.slice(0, Math.floor(this._stream.shown));
      const cursor = (this._cursorBlink < 0.5) ? "▏" : " ";
      this._drawWovenLine(cx, shown + cursor, x0, row * this._ch, 1, this._stream.sensitive, this._stream.kind === "head");
    }
  }

  _drawWovenLine(cx, text, x, y, alpha, sensitive, head) {
    cx.font = head ? `700 ${this._px}px 'Menlo','Consolas',monospace` : this._font;
    cx.textBaseline = "top";
    const w = cx.measureText(text).width;
    // paper underlay so the words stay legible over the field + 3D
    cx.fillStyle = "rgba(245,245,241," + (0.82 * alpha).toFixed(2) + ")";
    cx.fillRect(x - 4, y - 1, w + 8, this._px + 3);
    if (sensitive) {
      // OPACITY: redact — solid ink blocks instead of glyphs (right to opacity)
      cx.fillStyle = "rgba(20,20,20," + alpha.toFixed(2) + ")";
      cx.fillText("█".repeat(Math.max(1, text.length)), x, y);
    } else {
      cx.fillStyle = "rgba(20,20,20," + alpha.toFixed(2) + ")";
      cx.fillText(text, x, y);
    }
  }

  _drawCorner(cx) {
    const { dstr, season } = this._dateStr();
    const a = this._activeSpecies();
    const who = a ? (a.sensitive ? "Sp. * (vulnerable)" : (a.sci || "—")) : "—";
    const cs = this.coherence > 0.66 ? "consenso · campo ordenado"
             : this.coherence > 0.33 ? "deliberando" : "sin consenso · campo turbulento";
    cx.font = `400 ${Math.round(this._px * 0.95)}px 'Menlo','Consolas',monospace`;
    cx.textBaseline = "top";
    const pad = 10;
    const lines = [`MÓDULO R · REGISTRO VIVO`, `${dstr} · ${season}`, `peak: ${who}`, cs];
    let maxW = 0; for (const l of lines) maxW = Math.max(maxW, cx.measureText(l).width);
    cx.fillStyle = "rgba(245,245,241,0.88)";
    cx.fillRect(pad - 4, pad - 2, maxW + 8, lines.length * (this._px + 4) + 4);
    cx.fillStyle = "rgba(20,20,20,0.9)";
    for (let i = 0; i < lines.length; i++) cx.fillText(lines[i], pad, pad + i * (this._px + 4));
  }

  _soneth() {
    let sp = null;
    try { sp = (typeof window !== "undefined") ? window.__sonethParams : null; } catch (e) { sp = null; }
    sp = sp || {};
    return {
      volume: this._c01(sp.volume ?? this.ctl.vol),
      pitchshift: this._c01(sp.pitchshift ?? 0.5),
      spatialspread: this._c01(sp.spatialspread ?? 0.5),
      spectralshift: this._c01(sp.spectralshift ?? 0.4),
      timedilation: this._c01(sp.timedilation ?? 0.3),
      noiselevel: this._c01(sp.noiselevel ?? 0.2),
      harmonicrich: this._c01(sp.harmonicrich ?? 0.5),
    };
  }
  _activeSpecies() { try { return (typeof window !== "undefined") ? window.__activeSpecies : null; } catch (e) { return null; } }
  _dayOfYear() { const n = new Date(); const s = new Date(n.getFullYear(), 0, 0); return Math.max(1, Math.min(365, Math.floor((n - s) / 86400000))); }
  _dateStr() {
    const a = this._activeSpecies();
    let day = (a && Number.isFinite(a.day)) ? a.day : this._dayOfYear();
    let m = 11; for (let i = 0; i < 12; i++) if (day >= Registro.MONTH_STARTS[i]) m = i;
    const dom = day - Registro.MONTH_STARTS[m] + 1;
    const season = (day >= 60 && day < 152) || (day >= 244 && day < 335) ? "lluvias" : "seca";
    return { dstr: `día ${day}/365 · ${dom} ${Registro.MONTHS[m]}`, season };
  }

  // ── record buffer / streaming ────────────────────────────────────────────────
  _pushUtterance(text, opts = {}) { if (text) this._queue.push({ text: String(text), sensitive: !!opts.sensitive, kind: opts.kind || "event" }); }

  // Rotate utterance KINDS so the record stays varied and visibly reactive —
  // species · consensus (live value) · ETH summary · corpus. A changed active
  // species always pre-empts (it is the event with weight).
  _composeTick(dt) {
    this._composeAccum += dt * THREE.MathUtils.lerp(0.7, 0.18, this.ctl.time);
    if (this._composeAccum < 1) return; this._composeAccum = 0;

    // priority: the being-in-peak just changed → it speaks (or is shielded)
    const a = this._activeSpecies();
    if (a && a.sci && a.sci !== this._lastActiveSci) {
      this._lastActiveSci = a.sci;
      if (a.sensitive) { this._pushUtterance(`[resto retenido · ${a.taxon || "taxón"}]`, { sensitive: true, kind: "opaque" }); this._redacted++; }
      else { this._pushUtterance(`«${a.sci}» en peak — inscrita`, { kind: "inscribe" }); this._inscribed++; }
      return;
    }

    // otherwise cycle the kinds
    for (let tries = 0; tries < 4; tries++) {
      const kind = this._composeKind % 4; this._composeKind++;
      if (kind === 0) { // consensus — reactive: shows the live value + field state
        const cstate = this.coherence > 0.66 ? "campo ordenado" : this.coherence > 0.33 ? "deliberando" : "campo turbulento";
        this._pushUtterance(`consenso ${this.coherence.toFixed(2)} — ${cstate}`, { kind: "event" });
        return;
      }
      if (kind === 1 && a && a.sci) { // current peak species (if any)
        this._pushUtterance(a.sensitive ? `peak velado · ${a.taxon || "taxón"}` : `peak: ${a.sci} (${a.taxon || "—"})`, { sensitive: !!a.sensitive, kind: "species" });
        return;
      }
      if (kind === 2) { // ETH — one summarised line from accumulated flow
        const e = this._eth;
        if (e.co2 + e.n + e.p + e.myco > 1) {
          this._pushUtterance(`flujo ETH · C+${Math.round(e.co2)} N+${Math.round(e.n)} P+${Math.round(e.p)}`, { kind: "eth" });
          this._eth = { co2: 0, n: 0, p: 0, myco: 0 };
          return;
        }
      }
      if (kind === 3) { // standing corpus
        this._pushUtterance(Registro.CORPUS[this._corpusIdx % Registro.CORPUS.length], { kind: "corpus" });
        this._corpusIdx++;
        return;
      }
    }
    // fallback (e.g. no species/eth this round)
    this._pushUtterance(Registro.CORPUS[this._corpusIdx++ % Registro.CORPUS.length], { kind: "corpus" });
  }
  _updateStream(dt) {
    if (!this._stream && this._queue.length) this._stream = Object.assign({ shown: 0 }, this._queue.shift());
    if (this._stream) {
      this._stream.shown += dt * THREE.MathUtils.lerp(70, 22, this.ctl.time);
      if (this._stream.shown >= this._stream.text.length) {
        this._log.push({ text: this._stream.text, sensitive: this._stream.sensitive, kind: this._stream.kind, age: 0 });
        if (this._log.length > 26) this._log.shift();
        this._stream = null;
      }
    }
  }
  _ageBuffer(dt) { for (let i = this._log.length - 1; i >= 0; i--) { this._log[i].age += dt; if (this._log[i].age > 22 && this._log.length > 8) this._log.splice(i, 1); } }

  // ── public API ────────────────────────────────────────────────────────────────
  setMasterVol({ level = 0.5 } = {})     { this.tgt.vol = this._c01(level); }
  setPitchShift({ value = 0.5 } = {})    { this.tgt.pitch = this._c01(value); }
  setTimeDilation({ value = 0.3 } = {})  { this.tgt.time = this._c01(value); }
  setSpectralShift({ value = 0.4 } = {}) { this.tgt.spectral = this._c01(value); }
  setSpatialSpread({ value = 0.5 } = {}) { this.tgt.spatial = this._c01(value); }
  setCoherence({ value = 0.5 } = {})     { this.coherenceTgt = this._c01(value); }
  pulse({ intensity = 1.4 } = {}) { this._pushUtterance(`voto — consenso ${this.coherence.toFixed(2)}`, { kind: "event" }); }
  whisper({ text = "" } = {}) { if (text) this._pushUtterance(String(text), { kind: "event" }); }
  // ETH eco signals accumulate; _composeTick emits one summarised line (no flood)
  triggerCO2({ amount = 50 } = {}) { this._eth.co2 += amount; }
  triggerMycoPulse({ intensity = 1 } = {}) { this._eth.myco += intensity; }
  triggerPhosphorus({ amount = 30 } = {}) { this._eth.p += amount; }
  triggerNitrogen({ amount = 30 } = {}) { this._eth.n += amount; }
  getCoherence() { return this._c01(this.coherence); }
  getBufferLoad() { return this._c01(this._log.length / 26); }

  // ── loop ─────────────────────────────────────────────────────────────────────
  _animate() {
    this._animationId = requestAnimationFrame(this._animate);
    if (this.destroyed || !this._cx) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now; this._t += dt; this._frame++;
    this._cursorBlink = (this._cursorBlink + dt) % 1;

    this._readControls();
    const k = 1 - Math.pow(0.0025, dt);
    for (const key of ["vol", "pitch", "time", "spectral", "spatial"]) this.ctl[key] += (this.tgt[key] - this.ctl[key]) * k;
    this.coherence += (this.coherenceTgt - this.coherence) * k;

    this._composeTick(dt); this._updateStream(dt); this._ageBuffer(dt);
    this._updateNodes(dt);

    // 3D updates — batched mesh instances, raycasters, scene params
    this._update3DScene(dt);
    this._updateBatchedInstances();
    this._updateRaycasters();

    // Update orbit controls
    if (this.controls) this.controls.update();

    // Render the 3D scene FIRST (behind the ASCII overlay)
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }

    // render the ASCII field ~24 fps (composited over the 3D)
    this._renderAccum += dt;
    if (this._renderAccum >= 1 / 24) { this._renderAccum = 0; this._renderAscii(); }
    this._updateHUD();
  }

  _readControls() {
    const sp = this._soneth();
    this.tgt.vol = sp.volume; this.tgt.pitch = sp.pitchshift; this.tgt.time = sp.timedilation;
    this.tgt.spectral = sp.spectralshift; this.tgt.spatial = sp.spatialspread;
  }

  // ── HUD (DOM, monochrome) ─────────────────────────────────────────────────────
  _buildHUD() {
    const host = this.elem; if (!host) return;
    const el = document.createElement("div");
    el.style.cssText = [
      "position:absolute", "top:10px", "right:10px", "z-index:5",
      "font-family:'Menlo','Consolas',monospace", "font-size:11px", "line-height:1.5",
      "letter-spacing:0.02em", "color:#141414", "background:rgba(245,245,241,0.85)",
      "border:1px solid #141414", "padding:7px 9px", "max-width:280px",
      "text-transform:uppercase", "pointer-events:none", "-webkit-font-smoothing:none",
    ].join(";");
    host.appendChild(el); this._hud = el;
    const hint = document.createElement("div");
    hint.textContent = "R · el registro vivo — campo ascii × 3D (pretext × slot 6)";
    hint.style.cssText = [
      "position:absolute", "bottom:8px", "right:10px", "z-index:5",
      "font-family:'Menlo','Consolas',monospace", "font-size:10px",
      "letter-spacing:0.04em", "color:rgba(20,20,20,0.55)",
      "text-transform:uppercase", "pointer-events:none", "-webkit-font-smoothing:none",
    ].join(";");
    host.appendChild(hint); this._hint = hint;
  }
  _updateHUD() {
    if (!this._hud) return;
    const bar = (v) => { const n = Math.round(this._c01(v) * 12); return "█".repeat(n) + "·".repeat(12 - n); };
    this._hud.innerHTML = [
      "MÓDULO R · CAMPO ASCII × 3D",
      "—",
      `consenso  ${bar(this.coherence)} ${this.coherence.toFixed(2)}`,
      `buffer    ${bar(this._log.length / 26)} ${String(this._log.length).padStart(2, "0")}/26`,
      `inscritas ${String(this._inscribed).padStart(3, "0")}  redact ${String(this._redacted).padStart(3, "0")}`,
      `grafo     ${this._nodes.length} nodos · raíz ${this._root ?? 0}`,
      `sondas    ${this._rayCasterObjects.length} raycasters`,
      this.coherence > 0.5 ? "campo ORDENADO" : "campo TURBULENTO",
    ].join("<br>");
  }

  destroy() {
    if (this._animationId) { cancelAnimationFrame(this._animationId); this._animationId = null; }
    try {
      if (this._ro) { this._ro.disconnect(); this._ro = null; }
      for (const el of [this._cv, this._hud, this._hint]) if (el && el.parentNode) el.parentNode.removeChild(el);

      // Dispose 3D resources
      while (this._rayCasterObjects.length) {
        this._rayCasterObjects.pop().remove();
      }
      if (this._rcSphereGeo) { this._rcSphereGeo.dispose(); this._rcSphereGeo = null; }
      if (this._rcCylinderGeo) { this._rcCylinderGeo.dispose(); this._rcCylinderGeo = null; }
      if (this._batchedMesh) {
        if (this._containerObj) this._containerObj.remove(this._batchedMesh);
        this._batchedMesh.dispose();
        this._batchedMesh = null;
      }
      if (this._batchMaterial) { this._batchMaterial.dispose(); this._batchMaterial = null; }
      if (this._containerObj) { this.scene.remove(this._containerObj); this._containerObj = null; }
    } catch (e) { /* ignore */ }
    super.destroy();
  }
}

export default Registro;
