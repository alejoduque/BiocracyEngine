/*
@nwWrld name: Sympoiesis
@nwWrld category: 3D
@nwWrld imports: BaseThreeJsModule, THREE, loadJson
*/

/* ════════════════════════════════════════════════════════════════════════
 * SYMPOIESIS — un ensamblaje de afectos  ·  switch [F]
 * ------------------------------------------------------------------------
 * Si el PhenologicalCalendar (switch [P]) es un instrumento científico —un
 * cuadrante con fechas, conteos, sitios y un anillo de 365 días— esta pieza
 * es su reverso poético. No mide: hace-con. Sympoiesis (Donna Haraway,
 * "making-with") nombra que nada se hace a sí mismo; todo se compone con
 * otros. Aquí no hay panel ni cifra canjeable: hay un volumen vivo donde
 * mónadas (seres solos, Rössler) se enlazan por filamentos micorrícicos y
 * se pasan AFECTOS —en el sentido de Spinoza: affectus, la capacidad de
 * afectar y ser afectado—. La benevolencia de von Foerster ("A está mejor
 * si B está mejor") no vive en ningún nodo: vive en el flujo entre ellos.
 *
 * Lo que se ve:
 *   · NÉBULA      — un fondo volumétrico de esporas y bruma (fbm en GLSL),
 *                   la "Gran Pantalla" donde el sistema se imagina el bosque.
 *   · MÓNADAS     — nodos-concepto que respiran (fresnel + desplazamiento),
 *                   cada uno con un nombre: afecto, simbiosis, umbral, rizoma…
 *   · FILAMENTOS  — la red de relaciones; tenue, siempre viva, late con la red.
 *   · NÓMADAS     — partículas de afecto que viajan de mónada a mónada; son
 *                   el intercambio hecho luz (carbono, fósforo, nitrógeno…).
 *   · SUSURROS    — texto que aparece y se desvanece, nombrando los enlaces
 *                   y las afecciones del intermix de conceptos.
 *
 * Cómo respira (sinestesia con el motor sonoro):
 *   Los 5 controles de index.html mueven a la vez el drone y la imagen —
 *   Master Vol (luz), Pitch Shift (registro/altura+matiz), Time Dilat (la
 *   velocidad del tiempo del enjambre), Spectral Sh (rotación del espectro
 *   de afectos), Spatial Sprd (dispersión del ensamblaje en el espacio).
 *   Y el flujo ETH (co2 / mycoPulse / fósforo / nitrógeno), que genera el
 *   drone, hace florecer la red: cada transacción es un afecto que viaja.
 *   La vitalidad acumulada del ensamblaje vuelve al drone (reverse-breath)
 *   y lo ahonda. Mirar y oír son, aquí, el mismo gesto.
 *
 * Sólo usa THREE core + ShaderMaterial (sin post-process), para correr tanto
 * en el escenario del Parlamento (bridge WS/OSC) como en el sandbox del SDK.
 * Véase Cap. 4 §6 — del Benevolence Engine al BiocracyEngine.
 * ════════════════════════════════════════════════════════════════════════ */

class Sympoiesis extends BaseThreeJsModule {

  // ── SDK / bridge methods ────────────────────────────────────────────────
  // The first five mirror the index.html controls (Master Vol, Pitch Shift,
  // Time Dilat, Spectral Sh, Spatial Sprd). In the parliament stage the module
  // also reads window.__sonethParams directly each frame, so it stays synced
  // even without the bridge; the setters let the SDK sandbox drive it too.
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

  // ── Deep-ecological palette (living, not fluorescent) ───────────────────
  static PALETTE = {
    night:  new THREE.Color("#070F0E"),
    peat:   new THREE.Color("#13201C"),
    moss:   new THREE.Color("#6E8B5C"),
    gold:   new THREE.Color("#C9A24B"),
    violet: new THREE.Color("#8E6FB0"),
    teal:   new THREE.Color("#4FB3A6"),
    rust:   new THREE.Color("#B5623C"),
    indigo: new THREE.Color("#4A5B86"),
    ivory:  new THREE.Color("#E6DEC9"),
  };

  // The four biogeochemical affects (ETH inflow) and their hue/colour.
  static AFFECTS = {
    co2:        { color: new THREE.Color("#9FE6E0"), name: "carbono" },
    mycoPulse:  { color: new THREE.Color("#A7D08A"), name: "señal" },
    phosphorus: { color: new THREE.Color("#E08A45"), name: "fósforo" },
    nitrogen:   { color: new THREE.Color("#7E8BD9"), name: "nitrógeno" },
  };

  // Concept-monads: the "intermix of concepts" the piece is poetic about.
  static CONCEPTS = [
    "afecto", "simbiosis", "mónada", "nómada", "umbral", "rizoma",
    "reciprocidad", "opacidad", "devenir", "mutualismo", "deriva", "espora",
    "humus", "latencia", "enjambre", "endófisis", "pliegue", "cuidado",
    "intemperie", "resonancia", "linaje", "fermento", "vínculo", "deseo",
    "exterioridad", "quórum",
  ];

  // Free-floating fragments that surface and fade.
  static LEXICON = [
    "lo vivo no se hace solo",
    "A está mejor si B está mejor",
    "vivimos siempre en una interfaz",
    "afectar y ser afectado",
    "la relación es anterior al nodo",
    "hacer-con, devenir-con",
    "el hongo redistribuye el don",
    "ningún ser es un número canjeable",
    "el presente se desvanece en tres segundos",
    "the forest is not a board to be managed",
    "we are in the mesh, not above it",
    "lo que cuida también es cuidado",
  ];

  // ─────────────────────────────────────────────────────────────────────────
  constructor(container) {
    super(container);

    this._t = 0;
    this._lastFrameTime = performance.now();
    this._animationId = null;

    // Smoothed control state (eased toward target every frame).
    // ctl = what the visuals currently use; tgt = where the knobs point.
    this.ctl = { vol: 0.5, pitch: 0.5, time: 0.3, spectral: 0.4, spatial: 0.5 };
    this.tgt = { vol: 0.5, pitch: 0.5, time: 0.3, spectral: 0.4, spatial: 0.5 };

    this.coherence = 0.5;     // parliament consensus → web tautness / sync
    this.coherenceTgt = 0.5;
    this.vitality = 0.0;      // recent affect throughput (ETH) → drone depth
    this.pulseAmt = 0.0;      // vote / event flash, decays
    this.ethPressure = 0.0;   // live ETH inflow (txInfluence) → ambient flow
    this.ethPressureTgt = 0.0;
    this._flowBudget = 0.0;   // accumulator for continuous affect emission

    this.nodes = [];          // {pos, base, concept, guild, size, phase, lum}
    this.filaments = [];      // {a, b, base, glow}
    this.nomads = [];         // active travelling affects
    this.rings = [];          // expanding myco shock rings (pool)
    this.texts = [];          // text-sprite pool

    this._camAz = 0.6;        // camera azimuth (slow cinematic drift)
    this._nomadCursor = 0;
    this._spareNomads = [];   // index freelist into the nomad Points buffer
    this._whisperTimer = 0;

    this.init();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // INIT
  // ──────────────────────────────────────────────────────────────────────────
  init() {
    if (!THREE) return;
    const P = Sympoiesis.PALETTE;

    this.scene.background = P.night.clone();
    this.scene.fog = new THREE.FogExp2(P.peat.clone(), 0.085);

    // Cinematic, non-interactive camera (this is a projector surface).
    this.camera.fov = 58;
    this.camera.near = 0.1;
    this.camera.far = 120;
    this.camera.position.set(0, 1.2, 14);
    this.camera.updateProjectionMatrix();
    if (this.controls) { this.controls.enabled = false; }

    // Soft fill — the piece is mostly emissive/additive, light is atmosphere.
    const amb = new THREE.AmbientLight(0xbfd8cf, 0.35);
    this.scene.add(amb);
    const key = new THREE.DirectionalLight(0xE6DEC9, 0.45);
    key.position.set(3, 6, 5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x4FB3A6, 0.35);
    rim.position.set(-5, -2, -4);
    this.scene.add(rim);

    this.world = new THREE.Group();   // everything that breathes / lifts / spreads
    this.scene.add(this.world);

    this._buildNebula();
    this._buildAssemblage();
    this._buildFilaments();
    this._buildSpores();
    this._buildNomadSystem();
    this._buildRings();
    this._buildTextPool();

    this.show();
    this._animate = this._animate.bind(this);
    this._animationId = requestAnimationFrame(this._animate);
  }

  // ── NÉBULA — volumetric backdrop (inward sphere + fbm) ───────────────────
  _buildNebula() {
    const P = Sympoiesis.PALETTE;
    const uniforms = {
      uTime:     { value: 0 },
      uColA:     { value: P.peat.clone() },
      uColB:     { value: P.indigo.clone() },
      uColC:     { value: P.teal.clone() },
      uHue:      { value: 0 },
      uLumens:   { value: 0.5 },
      uCoherence:{ value: 0.5 },
    };
    this._nebulaUniforms = uniforms;

    const mat = new THREE.ShaderMaterial({
      uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      transparent: false,
      fog: false,
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        precision highp float;
        varying vec3 vDir;
        uniform float uTime, uHue, uLumens, uCoherence;
        uniform vec3 uColA, uColB, uColC;

        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453123); }
        float vnoise(vec2 p){
          vec2 i=floor(p), f=fract(p);
          float a=hash(i), b=hash(i+vec2(1.,0.)), c=hash(i+vec2(0.,1.)), d=hash(i+vec2(1.,1.));
          vec2 u=f*f*(3.-2.*f);
          return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
        }
        float fbm(vec2 p){
          float s=0.0, a=0.55; mat2 m=mat2(1.6,1.2,-1.2,1.6);
          for(int i=0;i<5;i++){ s+=a*vnoise(p); p=m*p; a*=0.5; }
          return s;
        }
        // cheap hue rotation in RGB
        vec3 hueShift(vec3 col, float h){
          const vec3 k = vec3(0.57735);
          float c = cos(h), s = sin(h);
          return col*c + cross(k,col)*s + k*dot(k,col)*(1.0-c);
        }
        void main(){
          // map the view direction to spherical-ish uv
          vec2 uv = vec2(atan(vDir.z, vDir.x)*0.1591 + 0.5, vDir.y*0.5 + 0.5);
          float drift = uTime*0.012;
          float n1 = fbm(uv*4.0 + vec2(drift, -drift*0.6));
          float n2 = fbm(uv*9.0 - vec2(drift*0.8, drift*0.3) + n1);
          float neb = pow(clamp(n1*0.7 + n2*0.5, 0.0, 1.0), 1.6);

          vec3 col = mix(uColA, uColB, smoothstep(0.1, 0.9, n1));
          col = mix(col, uColC, neb * (0.35 + 0.4*uCoherence));
          col = hueShift(col, uHue);

          // vertical depth: darker below (humus), opener above (canopy)
          float vert = smoothstep(-0.9, 0.9, vDir.y);
          col *= mix(0.45, 1.05, vert);

          // a few faint distant spores
          float spark = step(0.92, vnoise(uv*120.0 + drift*5.0));
          col += spark * uColC * 0.25;

          col *= (0.55 + 0.85*uLumens);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const geo = new THREE.SphereGeometry(60, 48, 32);
    this.nebula = new THREE.Mesh(geo, mat);
    this.nebula.frustumCulled = false;
    this.scene.add(this.nebula); // outside `world` so it doesn't lift/spread
  }

  // ── MÓNADAS — concept nodes that breathe (fresnel + displacement) ────────
  _buildAssemblage() {
    const P = Sympoiesis.PALETTE;
    const guildColors = [P.moss, P.teal, P.violet, P.gold, P.rust];
    const N = Sympoiesis.CONCEPTS.length; // 26
    const golden = Math.PI * (3 - Math.sqrt(5));

    this.nodeGroup = new THREE.Group();
    this.world.add(this.nodeGroup);
    this.nodeMeshes = [];

    for (let i = 0; i < N; i++) {
      // fibonacci sphere → an even, organic 3D scatter (then jittered)
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = golden * i;
      const jitter = 0.22;
      const base = new THREE.Vector3(
        Math.cos(theta) * r + (Math.random() - 0.5) * jitter,
        y * 0.82 + (Math.random() - 0.5) * jitter,
        Math.sin(theta) * r + (Math.random() - 0.5) * jitter
      ).multiplyScalar(4.4);

      const guild = i % guildColors.length;
      const size = 0.16 + Math.random() * 0.22;
      const node = {
        base,
        pos: base.clone(),
        concept: Sympoiesis.CONCEPTS[i],
        guild,
        size,
        phase: Math.random() * Math.PI * 2,
        lum: 0.6 + Math.random() * 0.4,
        affectGlow: 0, // brightens when an affect arrives
      };
      this.nodes.push(node);

      const uniforms = {
        uTime:   { value: 0 },
        uCore:   { value: guildColors[guild].clone() },
        uRim:    { value: P.ivory.clone() },
        uBreath: { value: 0 },
        uLumens: { value: 0.6 },
        uGlow:   { value: 0 },
        uRimPow: { value: 2.4 },
      };
      const mat = new THREE.ShaderMaterial({
        uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        vertexShader: /* glsl */`
          precision highp float;
          uniform float uTime, uBreath;
          varying vec3 vN;
          varying vec3 vView;
          varying float vFres;
          // value noise for gentle organic surface displacement
          float hash(vec3 p){ return fract(sin(dot(p, vec3(17.1,113.5,71.7)))*43758.5453); }
          void main(){
            vec3 p = position;
            float d = hash(normalize(position)*3.7);
            float warp = sin(uTime*1.3 + d*6.2831 + p.y*4.0) * 0.06 * (0.6 + uBreath);
            p += normal * warp;
            vN = normalize(normalMatrix * normal);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            vView = normalize(-mv.xyz);
            vFres = pow(1.0 - max(dot(vN, vView), 0.0), 2.4);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */`
          precision highp float;
          uniform vec3 uCore, uRim;
          uniform float uLumens, uGlow, uBreath, uRimPow;
          varying vec3 vN;
          varying vec3 vView;
          varying float vFres;
          void main(){
            float fres = pow(1.0 - max(dot(normalize(vN), normalize(vView)), 0.0), uRimPow);
            vec3 col = mix(uCore * 0.5, uRim, fres);
            col += uCore * (0.35 + uGlow);
            float a = (0.30 + 0.7*fres) * (0.55 + 0.9*uLumens) * (0.7 + 0.6*uBreath + uGlow);
            gl_FragColor = vec4(col * (0.8 + uLumens), a);
          }
        `,
      });
      // Icosahedron, detail 2 → a faceted-yet-round body (don't simplify the shape)
      const geo = new THREE.IcosahedronGeometry(size, 2);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(base);
      mesh.frustumCulled = false;
      node.mesh = mesh;
      node.uniforms = uniforms;
      this.nodeGroup.add(mesh);
      this.nodeMeshes.push(mesh);

      // a soft halo billboard behind each monad for body in the volume
      const halo = this._makeHalo(guildColors[guild], size * 6.0);
      halo.position.copy(base);
      node.halo = halo;
      this.nodeGroup.add(halo);
    }
  }

  _makeHalo(color, size) {
    if (!this._haloTex) this._haloTex = this._radialTexture();
    const mat = new THREE.SpriteMaterial({
      map: this._haloTex,
      color: color.clone(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.5,
      fog: false,
    });
    const s = new THREE.Sprite(mat);
    s.scale.setScalar(size);
    return s;
  }

  _radialTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0.0, "rgba(255,255,255,0.9)");
    grd.addColorStop(0.25, "rgba(255,255,255,0.35)");
    grd.addColorStop(1.0, "rgba(255,255,255,0.0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  // ── FILAMENTOS — the mycorrhizal web (faint, always-alive) ───────────────
  _buildFilaments() {
    const P = Sympoiesis.PALETTE;
    // connect each node to its k nearest neighbours → a sparse living mesh
    const K = 3;
    const pairKey = (a, b) => (a < b ? a + "_" + b : b + "_" + a);
    const seen = new Set();
    for (let i = 0; i < this.nodes.length; i++) {
      const di = this.nodes
        .map((n, j) => ({ j, d: this.nodes[i].base.distanceTo(n.base) }))
        .filter((o) => o.j !== i)
        .sort((a, b) => a.d - b.d)
        .slice(0, K);
      for (const o of di) {
        const key = pairKey(i, o.j);
        if (seen.has(key)) continue;
        seen.add(key);
        this.filaments.push({ a: i, b: o.j, glow: 0, base: 0.10 + Math.random() * 0.06 });
      }
    }

    const segs = this.filaments.length;
    const positions = new Float32Array(segs * 2 * 3);
    const along = new Float32Array(segs * 2);       // 0 at a, 1 at b
    const seed = new Float32Array(segs * 2);
    for (let i = 0; i < segs; i++) {
      along[i * 2] = 0; along[i * 2 + 1] = 1;
      const s = Math.random();
      seed[i * 2] = s; seed[i * 2 + 1] = s;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aAlong", new THREE.BufferAttribute(along, 1));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));

    const uniforms = {
      uTime:    { value: 0 },
      uColor:   { value: P.teal.clone() },
      uColor2:  { value: P.moss.clone() },
      uFlow:    { value: 0.4 },
      uLumens:  { value: 0.5 },
      uHue:     { value: 0 },
    };
    this._filUniforms = uniforms;
    const mat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      vertexShader: /* glsl */`
        precision highp float;
        attribute float aAlong;
        attribute float aSeed;
        varying float vAlong;
        varying float vSeed;
        void main(){
          vAlong = aAlong; vSeed = aSeed;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        precision highp float;
        uniform float uTime, uFlow, uLumens, uHue;
        uniform vec3 uColor, uColor2;
        varying float vAlong;
        varying float vSeed;
        vec3 hueShift(vec3 col, float h){
          const vec3 k = vec3(0.57735);
          float c = cos(h), s = sin(h);
          return col*c + cross(k,col)*s + k*dot(k,col)*(1.0-c);
        }
        void main(){
          // a soft brightness wave travels along each filament
          float wave = 0.5 + 0.5*sin((vAlong*6.2831 - uTime*uFlow*3.0) + vSeed*12.566);
          vec3 col = mix(uColor2, uColor, vAlong);
          col = hueShift(col, uHue);
          float a = (0.10 + 0.5*pow(wave, 2.0)) * (0.4 + 0.9*uLumens);
          gl_FragColor = vec4(col * a, a);
        }
      `,
    });
    this.filMesh = new THREE.LineSegments(geo, mat);
    this.filMesh.frustumCulled = false;
    this.world.add(this.filMesh);
    this._filPositions = positions;
  }

  // ── ESPORAS — drifting point haze that fills the volume ──────────────────
  _buildSpores() {
    const P = Sympoiesis.PALETTE;
    const COUNT = 1500;
    const positions = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    const sizes = new Float32Array(COUNT);
    const phase = new Float32Array(COUNT);
    const palette = [P.moss, P.teal, P.violet, P.gold, P.ivory];
    for (let i = 0; i < COUNT; i++) {
      const r = 2.5 + Math.random() * 7.5;
      const u = Math.random() * Math.PI * 2;
      const v = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = Math.sin(v) * Math.cos(u) * r;
      positions[i * 3 + 1] = Math.cos(v) * r * 0.8;
      positions[i * 3 + 2] = Math.sin(v) * Math.sin(u) * r;
      const c = palette[(Math.random() * palette.length) | 0];
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
      sizes[i] = 6 + Math.random() * 22;
      phase[i] = Math.random() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));

    const uniforms = {
      uTime:   { value: 0 },
      uLumens: { value: 0.5 },
      uScale:  { value: (this.renderer ? this.renderer.getPixelRatio() : 1) },
    };
    this._sporeUniforms = uniforms;
    const mat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      vertexShader: /* glsl */`
        precision highp float;
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aPhase;
        uniform float uTime, uLumens, uScale;
        varying vec3 vColor;
        varying float vTw;
        void main(){
          vColor = aColor;
          vTw = 0.55 + 0.45*sin(uTime*0.7 + aPhase);
          vec3 p = position;
          p.y += sin(uTime*0.25 + aPhase)*0.18;   // slow vertical drift
          p.x += cos(uTime*0.18 + aPhase)*0.12;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = aSize * uScale * (0.5 + uLumens) * (60.0 / max(0.1, -mv.z));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */`
        precision highp float;
        varying vec3 vColor;
        varying float vTw;
        uniform float uLumens;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.0, d) * vTw * (0.35 + 0.6*uLumens);
          gl_FragColor = vec4(vColor, a * 0.6);
        }
      `,
    });
    this.spores = new THREE.Points(geo, mat);
    this.spores.frustumCulled = false;
    this.world.add(this.spores);
  }

  // ── NÓMADAS — travelling affect particles (the visible exchange) ─────────
  _buildNomadSystem() {
    const MAX = 900;
    this._nomadMax = MAX;
    const positions = new Float32Array(MAX * 3);
    const colors = new Float32Array(MAX * 3);
    const sizes = new Float32Array(MAX);
    for (let i = 0; i < MAX; i++) {
      sizes[i] = 0;                    // size 0 = inactive
      this._spareNomads.push(i);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

    const uniforms = {
      uTime:   { value: 0 },
      uLumens: { value: 0.5 },
      uScale:  { value: (this.renderer ? this.renderer.getPixelRatio() : 1) },
    };
    this._nomadUniforms = uniforms;
    const mat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      vertexShader: /* glsl */`
        precision highp float;
        attribute vec3 aColor;
        attribute float aSize;
        uniform float uLumens, uScale;
        varying vec3 vColor;
        void main(){
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale * (0.6 + 0.8*uLumens) * (90.0 / max(0.1, -mv.z));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */`
        precision highp float;
        varying vec3 vColor;
        uniform float uLumens;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          float core = smoothstep(0.5, 0.0, d);
          float a = core * (0.6 + 0.9*uLumens);
          gl_FragColor = vec4(vColor * (1.0 + core), a);
        }
      `,
    });
    this.nomadPoints = new THREE.Points(geo, mat);
    this.nomadPoints.frustumCulled = false;
    this.world.add(this.nomadPoints);
    this._nomadGeo = geo;
  }

  // ── RINGS — expanding myco-pulse shocks (pool) ───────────────────────────
  _buildRings() {
    const P = Sympoiesis.PALETTE;
    this.ringGroup = new THREE.Group();
    this.world.add(this.ringGroup);
    for (let i = 0; i < 6; i++) {
      const geo = new THREE.RingGeometry(0.9, 1.0, 96);
      const mat = new THREE.MeshBasicMaterial({
        color: P.teal.clone(),
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.ringGroup.add(mesh);
      this.rings.push({ mesh, life: 0, max: 1, origin: new THREE.Vector3() });
    }
  }

  // ── SUSURROS — poetic text that appears and disappears ───────────────────
  _buildTextPool() {
    this.textGroup = new THREE.Group();
    this.scene.add(this.textGroup); // outside `world` so text stays legible
    for (let i = 0; i < 5; i++) {
      const canvas = document.createElement("canvas");
      canvas.width = 1024; canvas.height = 256;
      const tex = new THREE.CanvasTexture(canvas);
      tex.minFilter = THREE.LinearFilter;
      const mat = new THREE.SpriteMaterial({
        map: tex, transparent: true, depthWrite: false, opacity: 0,
        blending: THREE.NormalBlending, fog: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(5.2, 1.3, 1);
      sprite.visible = false;
      this.textGroup.add(sprite);
      this.texts.push({ sprite, canvas, ctx: canvas.getContext("2d"), tex, life: 0, hold: 0, state: "idle" });
    }
  }

  _drawText(slot, text) {
    const ctx = slot.ctx;
    const P = Sympoiesis.PALETTE;
    ctx.clearRect(0, 0, 1024, 256);
    ctx.font = "300 64px 'Georgia','Times New Roman',serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const iv = P.ivory;
    const col = `rgb(${(iv.r * 255) | 0},${(iv.g * 255) | 0},${(iv.b * 255) | 0})`;
    ctx.shadowColor = "rgba(79,179,166,0.55)";
    ctx.shadowBlur = 24;
    ctx.fillStyle = col;
    // italic, lower-case, intimate
    ctx.font = "italic 300 60px 'Georgia',serif";
    ctx.fillText(text, 512, 128);
    slot.tex.needsUpdate = true;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CONTROL SETTERS (index.html · 5 controls)  —  mirror the drone
  // ──────────────────────────────────────────────────────────────────────────
  setMasterVol({ level = 0.5 } = {})     { this.tgt.vol = this._c01(level); }
  setPitchShift({ value = 0.5 } = {})    { this.tgt.pitch = this._c01(value); }
  setTimeDilation({ value = 0.3 } = {})  { this.tgt.time = this._c01(value); }
  setSpectralShift({ value = 0.4 } = {}) { this.tgt.spectral = this._c01(value); }
  setSpatialSpread({ value = 0.5 } = {}) { this.tgt.spatial = this._c01(value); }
  setCoherence({ value = 0.5 } = {})     { this.coherenceTgt = this._c01(value); }

  _c01(v) { v = Number(v); return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.5; }

  // ──────────────────────────────────────────────────────────────────────────
  // ETH AFFECTS — each transaction is an affect that travels the web
  // ──────────────────────────────────────────────────────────────────────────
  pulse({ intensity = 1.4 } = {}) {
    this.pulseAmt = Math.min(4, this.pulseAmt + intensity);
    // a vote ripples through every monad
    for (const n of this.nodes) n.affectGlow = Math.min(2.5, n.affectGlow + 0.25 * intensity);
  }

  triggerCO2({ amount = 50 } = {}) {
    // carbon drawn inward toward a "tree" monad — the canopy inhales
    const sink = this._nodeByConcept("humus") ?? this._randomNode();
    const burst = Math.max(2, Math.min(26, (amount / 200) * 26));
    for (let i = 0; i < burst; i++) {
      const src = this._randomNode();
      this._emitNomad(src, sink, Sympoiesis.AFFECTS.co2.color, 26, 2.0 + Math.random() * 1.4);
    }
    this.vitality = Math.min(1, this.vitality + amount / 320);
    this._maybeWhisperLink(this._randomNode(), sink, "carbono");
  }

  triggerMycoPulse({ intensity = 1 } = {}) {
    // the fungus speaks: a shock ring + a brightening of the whole web
    const hub = this._nodeByConcept("rizoma") ?? this._nodeByConcept("simbiosis") ?? this._randomNode();
    this._spawnRing(hub.pos, intensity);
    for (const f of this.filaments) f.glow = Math.min(2.5, f.glow + 0.6 * intensity);
    for (const n of this.nodes) n.affectGlow = Math.min(2.5, n.affectGlow + 0.18 * intensity);
    // a few signals radiate from the hub to neighbours
    const neigh = this._neighbours(this._nodeIndex(hub)).slice(0, 5);
    for (const j of neigh) this._emitNomad(hub, this.nodes[j], Sympoiesis.AFFECTS.mycoPulse.color, 30, 2.4);
    this.vitality = Math.min(1, this.vitality + 0.08 * intensity);
  }

  triggerPhosphorus({ amount = 30 } = {}) {
    this._affectFlow(Sympoiesis.AFFECTS.phosphorus.color, amount, "fósforo");
  }
  triggerNitrogen({ amount = 30 } = {}) {
    this._affectFlow(Sympoiesis.AFFECTS.nitrogen.color, amount, "nitrógeno");
  }

  _affectFlow(color, amount, label) {
    const a = this._nodeByConcept("simbiosis") ?? this._randomNode();
    const b = this._randomNode();
    const burst = Math.max(2, Math.min(14, (amount / 100) * 14));
    for (let i = 0; i < burst; i++) {
      this._emitNomad(a, this._randomNode(), color, 24, 2.2 + Math.random());
    }
    this.vitality = Math.min(1, this.vitality + amount / 360);
    this._maybeWhisperLink(a, b, label);
  }

  // ── readouts for the reverse-breath (module → drone) ─────────────────────
  getVitality()  { return this.vitality; }
  getCoherence() { return this.coherence; }

  // ──────────────────────────────────────────────────────────────────────────
  // NOMAD EMISSION + helpers
  // ──────────────────────────────────────────────────────────────────────────
  _emitNomad(from, to, color, size, speed) {
    if (!from || !to || this._spareNomads.length === 0) return;
    const idx = this._spareNomads.pop();
    // organic arc: bow the path outward from the centre
    const mid = from.pos.clone().add(to.pos).multiplyScalar(0.5);
    const out = mid.clone().normalize().multiplyScalar(0.6 + Math.random() * 0.9);
    const ctrl = mid.add(out);
    this.nomads.push({
      idx, from, to, ctrl,
      t: 0, speed: speed * (0.5 + Math.random() * 0.6),
      color, size: size * (0.7 + Math.random() * 0.6),
    });
    // brighten the destination on arrival is handled in the update loop
  }

  _spawnRing(origin, intensity) {
    let slot = this.rings.find((r) => r.life <= 0) || this.rings[0];
    slot.life = 1.0;
    slot.max = 2.2 + intensity * 1.4;
    slot.origin.copy(origin);
    slot.mesh.position.copy(origin);
    slot.mesh.visible = true;
    // face the camera roughly
    slot.mesh.lookAt(this.camera.position);
  }

  _nodeByConcept(name) { return this.nodes.find((n) => n.concept === name) || null; }
  _randomNode() { return this.nodes[(Math.random() * this.nodes.length) | 0]; }
  _nodeIndex(node) { return this.nodes.indexOf(node); }
  _neighbours(i) {
    const out = [];
    for (const f of this.filaments) {
      if (f.a === i) out.push(f.b);
      else if (f.b === i) out.push(f.a);
    }
    return out;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SUSURROS — generative phrases linking two concept-monads
  // ──────────────────────────────────────────────────────────────────────────
  _maybeWhisperLink(a, b, affectLabel) {
    if (Math.random() > 0.4) return;
    if (!a || !b || a === b) return;
    const verbs = ["enlaza", "afecta", "se compone con", "alimenta", "responde a", "cuida"];
    const v = verbs[(Math.random() * verbs.length) | 0];
    this.whisper({ text: `${a.concept} ${v} ${b.concept}` });
  }

  whisper({ text = "" } = {}) {
    if (!text) text = Sympoiesis.LEXICON[(Math.random() * Sympoiesis.LEXICON.length) | 0];
    const slot = this.texts.find((t) => t.state === "idle");
    if (!slot) return;
    this._drawText(slot, text);
    // place near a node or floating mid-volume, in front of the camera plane
    const anchor = this._randomNode().pos.clone();
    anchor.y += 0.6 + Math.random() * 0.5;
    anchor.multiplyScalar(0.9);
    slot.sprite.position.copy(anchor);
    slot.sprite.visible = true;
    slot.state = "in";
    slot.life = 0;
    slot.hold = 2.4 + Math.random() * 2.2;
  }

  _autoWhisper(dt) {
    this._whisperTimer -= dt;
    if (this._whisperTimer <= 0) {
      // rarer when time is dilated (suspended), more frequent when lively
      this._whisperTimer = 5.5 + Math.random() * 6.0 + this.ctl.time * 4.0;
      this.whisper({});
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // MAIN LOOP
  // ──────────────────────────────────────────────────────────────────────────
  _animate() {
    this._animationId = requestAnimationFrame(this._animate);
    if (this.destroyed || !this.renderer || !this.scene || !this.camera) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - this._lastFrameTime) / 1000);
    this._lastFrameTime = now;

    this._readControls();
    this._updateControls(dt);

    // breath rate: dilated time → slow suspended breath; lively → quicker
    const breathRate = THREE.MathUtils.lerp(1.4, 0.35, this.ctl.time);
    this._t += dt * breathRate;
    const breath = 0.5 + 0.5 * Math.sin(this._t * 1.4);

    this._updateCamera(dt);
    this._updateGlobalUniforms(breath);
    this._updateNodes(dt, breath);
    this._updateFilaments(dt);
    this._updateAmbientFlow(dt);
    this._updateNomads(dt);
    this._updateRings(dt);
    this._autoWhisper(dt);
    this._updateText(dt);

    // decays
    if (this.pulseAmt > 0) this.pulseAmt = Math.max(0, this.pulseAmt - dt * 1.3);
    this.vitality = Math.max(0, this.vitality - dt * 0.12); // forgetting → drone settles

    this.renderer.render(this.scene, this.camera);
  }

  // read the live control surface (parliament stage) — keeps drone & image synced
  _readControls() {
    let sp = null;
    try { sp = (typeof window !== "undefined") ? window.__sonethParams : null; } catch (e) { sp = null; }
    if (!sp) return;
    if (typeof sp.volume === "number")        this.tgt.vol = sp.volume;
    if (typeof sp.pitchshift === "number")    this.tgt.pitch = sp.pitchshift;
    if (typeof sp.timedilation === "number")  this.tgt.time = sp.timedilation;
    if (typeof sp.spectralshift === "number") this.tgt.spectral = sp.spectralshift;
    if (typeof sp.spatialspread === "number") this.tgt.spatial = sp.spatialspread;
    // ETH inflow — SC echoes /soneth/txInfluence from live transaction activity.
    // The same number that swells the drone here grows the affect-flow on screen.
    if (typeof sp.txInfluence === "number") this.ethPressureTgt = sp.txInfluence;
  }

  _updateControls(dt) {
    const k = 1 - Math.pow(0.0015, dt); // smooth, frame-rate independent ease
    this.ctl.vol      += (this.tgt.vol - this.ctl.vol) * k;
    this.ctl.pitch    += (this.tgt.pitch - this.ctl.pitch) * k;
    this.ctl.time     += (this.tgt.time - this.ctl.time) * k;
    this.ctl.spectral += (this.tgt.spectral - this.ctl.spectral) * k;
    this.ctl.spatial  += (this.tgt.spatial - this.ctl.spatial) * k;
    this.coherence    += (this.coherenceTgt - this.coherence) * k;
    this.ethPressure  += (this.ethPressureTgt - this.ethPressure) * k;
  }

  // continuous ETH pressure → a living trickle of affects along the web,
  // independent of the discrete /eco bursts. More transactions = busier
  // mycelium AND (via vitality → reverse-breath) a deeper drone.
  _updateAmbientFlow(dt) {
    const P = Sympoiesis.PALETTE;
    const guildColors = [P.moss, P.teal, P.violet, P.gold, P.rust];
    const rate = (0.6 + this.ethPressure * 7.0) * (0.4 + this.ctl.vol * 0.8); // affects/sec
    this._flowBudget += dt * rate;
    let guard = 0;
    while (this._flowBudget >= 1 && this._spareNomads.length > 4 && guard < 12) {
      this._flowBudget -= 1;
      guard++;
      if (this.filaments.length === 0) break;
      const f = this.filaments[(Math.random() * this.filaments.length) | 0];
      const fwd = Math.random() < 0.5;
      const from = this.nodes[fwd ? f.a : f.b];
      const to = this.nodes[fwd ? f.b : f.a];
      this._emitNomad(from, to, guildColors[from.guild], 16 + this.ethPressure * 18, 1.6 + Math.random() * 1.2);
      f.glow = Math.min(2.0, f.glow + 0.22);
    }
    // ETH inflow accumulates as vitality (drives the drone via reverse-breath)
    this.vitality = Math.min(1, this.vitality + this.ethPressure * dt * 0.18);
  }

  _updateCamera(dt) {
    // Spatial Spread → camera distance (tight cluster ↔ diffuse cloud)
    const dist = THREE.MathUtils.lerp(9.5, 19.0, this.ctl.spatial);
    // Pitch Shift → register: lift the eye and the whole world
    const lift = (this.ctl.pitch - 0.5) * 2.4;
    this._camAz += dt * (0.04 + this.ctl.time * 0.02); // slow cinematic drift
    const el = 1.1 + Math.sin(this._t * 0.18) * 0.5 + lift * 0.4;
    this.camera.position.set(
      Math.cos(this._camAz) * dist,
      el,
      Math.sin(this._camAz) * dist
    );
    this.camera.lookAt(0, lift * 0.3, 0);

    // world: pitch lifts it; spatial spreads the node field; coherence draws it in
    const spread = THREE.MathUtils.lerp(0.78, 1.5, this.ctl.spatial) * THREE.MathUtils.lerp(1.04, 0.94, this.coherence);
    this.world.scale.setScalar(spread);
    this.world.position.y = lift * 0.5;
    this.world.rotation.y += dt * 0.03 * (0.5 + this.coherence);
  }

  _updateGlobalUniforms(breath) {
    const lum = this.ctl.vol;
    // Spectral Shift → hue rotation of nébula, filaments, affects (radians)
    const hue = (this.ctl.spectral - 0.4) * 3.4;
    const flow = THREE.MathUtils.lerp(1.5, 0.28, this.ctl.time); // dilated → slow flow

    if (this._nebulaUniforms) {
      this._nebulaUniforms.uTime.value = this._t;
      this._nebulaUniforms.uHue.value = hue * 0.6;
      this._nebulaUniforms.uLumens.value = lum;
      this._nebulaUniforms.uCoherence.value = this.coherence;
    }
    if (this._filUniforms) {
      this._filUniforms.uTime.value = this._t;
      this._filUniforms.uFlow.value = flow;
      this._filUniforms.uLumens.value =
        lum * (0.7 + 0.6 * this.coherence) + this.pulseAmt * 0.1 + this.ethPressure * 0.3;
      this._filUniforms.uHue.value = hue;
    }
    if (this._sporeUniforms) {
      this._sporeUniforms.uTime.value = this._t;
      this._sporeUniforms.uLumens.value = lum;
    }
    if (this._nomadUniforms) {
      this._nomadUniforms.uTime.value = this._t;
      this._nomadUniforms.uLumens.value = lum;
    }
  }

  _updateNodes(dt, breath) {
    const lum = this.ctl.vol;
    // pitch tints the monads warm (low) → cool (high) via rim colour pull
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      // gentle living wander around the base position
      const w = 0.12 * (0.5 + this.ctl.spatial);
      n.pos.set(
        n.base.x + Math.sin(this._t * 0.6 + n.phase) * w,
        n.base.y + Math.cos(this._t * 0.5 + n.phase * 1.3) * w,
        n.base.z + Math.sin(this._t * 0.4 + n.phase * 0.7) * w
      );
      n.mesh.position.copy(n.pos);
      if (n.halo) {
        n.halo.position.copy(n.pos);
        n.halo.material.opacity = 0.28 + 0.5 * lum + n.affectGlow * 0.25;
      }
      const nb = 0.5 + 0.5 * Math.sin(this._t * 1.4 + n.phase);
      n.uniforms.uTime.value = this._t + n.phase;
      n.uniforms.uBreath.value = nb * (0.6 + 0.6 * this.coherence);
      n.uniforms.uLumens.value = lum * n.lum;
      n.uniforms.uGlow.value = n.affectGlow + this.pulseAmt * 0.12;
      // affect glow fades
      n.affectGlow = Math.max(0, n.affectGlow - dt * 1.1);
    }
  }

  _updateFilaments(dt) {
    // refresh segment endpoints from live node positions (the web breathes)
    const pos = this._filPositions;
    for (let i = 0; i < this.filaments.length; i++) {
      const f = this.filaments[i];
      const a = this.nodes[f.a].pos, b = this.nodes[f.b].pos;
      const o = i * 6;
      pos[o] = a.x; pos[o + 1] = a.y; pos[o + 2] = a.z;
      pos[o + 3] = b.x; pos[o + 4] = b.y; pos[o + 5] = b.z;
      if (f.glow > 0) f.glow = Math.max(0, f.glow - dt * 0.9);
    }
    this.filMesh.geometry.attributes.position.needsUpdate = true;
  }

  _updateNomads(dt) {
    const geo = this._nomadGeo;
    const pos = geo.attributes.position.array;
    const col = geo.attributes.aColor.array;
    const siz = geo.attributes.aSize.array;
    const speedScale = THREE.MathUtils.lerp(1.6, 0.4, this.ctl.time); // dilation slows travel
    const tmp = new THREE.Vector3();
    for (let k = this.nomads.length - 1; k >= 0; k--) {
      const nm = this.nomads[k];
      nm.t += dt * nm.speed * speedScale * 0.45;
      if (nm.t >= 1) {
        // arrival: deposit affect into the target monad + its links
        nm.to.affectGlow = Math.min(2.8, nm.to.affectGlow + 0.5);
        siz[nm.idx] = 0;
        this._spareNomads.push(nm.idx);
        this.nomads.splice(k, 1);
        continue;
      }
      // quadratic bezier from→ctrl→to (organic arc)
      const t = nm.t, it = 1 - t;
      tmp.copy(nm.from.pos).multiplyScalar(it * it)
        .addScaledVector(nm.ctrl, 2 * it * t)
        .addScaledVector(nm.to.pos, t * t);
      const o = nm.idx * 3;
      pos[o] = tmp.x; pos[o + 1] = tmp.y; pos[o + 2] = tmp.z;
      col[o] = nm.color.r; col[o + 1] = nm.color.g; col[o + 2] = nm.color.b;
      // pulse the size mid-flight so it reads as a comet
      siz[nm.idx] = nm.size * (0.6 + 0.8 * Math.sin(t * Math.PI));
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aColor.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
  }

  _updateRings(dt) {
    for (const r of this.rings) {
      if (r.life <= 0) { if (r.mesh.visible) r.mesh.visible = false; continue; }
      r.life -= dt * THREE.MathUtils.lerp(0.9, 0.4, this.ctl.time);
      const grow = (1 - r.life) * r.max;
      r.mesh.scale.setScalar(0.2 + grow);
      r.mesh.material.opacity = Math.max(0, r.life) * 0.5 * (0.5 + this.ctl.vol);
      r.mesh.lookAt(this.camera.position);
      if (r.life <= 0) r.mesh.visible = false;
    }
  }

  _updateText(dt) {
    const fade = 1.6;
    for (const slot of this.texts) {
      if (slot.state === "idle") continue;
      if (slot.state === "in") {
        slot.life += dt;
        slot.sprite.material.opacity = Math.min(1, slot.life / fade) * (0.6 + 0.4 * this.ctl.vol);
        // gentle upward drift
        slot.sprite.position.y += dt * 0.12;
        if (slot.life >= fade) { slot.state = "hold"; slot.life = 0; }
      } else if (slot.state === "hold") {
        slot.life += dt;
        slot.sprite.position.y += dt * 0.06;
        slot.sprite.material.opacity = (0.6 + 0.4 * this.ctl.vol);
        if (slot.life >= slot.hold) { slot.state = "out"; slot.life = 0; }
      } else if (slot.state === "out") {
        slot.life += dt;
        slot.sprite.material.opacity = Math.max(0, 1 - slot.life / fade) * (0.6 + 0.4 * this.ctl.vol);
        slot.sprite.position.y += dt * 0.05;
        if (slot.life >= fade) { slot.state = "idle"; slot.sprite.visible = false; }
      }
      // keep text gently facing the camera plane (sprites already billboard)
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  destroy() {
    if (this._animationId) { cancelAnimationFrame(this._animationId); this._animationId = null; }
    try {
      if (this._haloTex) this._haloTex.dispose();
      for (const slot of (this.texts || [])) { if (slot.tex) slot.tex.dispose(); }
    } catch (e) { /* ignore */ }
    super.destroy();
  }
}

export default Sympoiesis;
