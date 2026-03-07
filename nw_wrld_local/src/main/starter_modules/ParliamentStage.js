// Parliament of All Things — 3D Telemetry Stage
// Fase 5: Dynamic post-processing atmosphere fully wired to parliament state
//   - Bloom ∝ consensusLevel (high consensus = harmonic glow)
//   - Chromatic aberration ∝ turbulence / low consensus
//   - Vignette breathing with 120s parliament cycle
//   - Film grain ∝ ETH CO₂ / transaction density
//   - Color grading: warm/gold (consensus) → cool/fragmented (dissent) → red (emergency)

import { BaseThreeJsModule } from "../../projector/helpers/threeBase";
import * as THREE from "three";
import { EffectComposer }   from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass }       from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass }  from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { AfterimagePass }   from "three/examples/jsm/postprocessing/AfterimagePass.js";
import { ShaderPass }       from "three/examples/jsm/postprocessing/ShaderPass.js";
import { FilmPass }         from "three/examples/jsm/postprocessing/FilmPass.js";
import { VignetteShader }   from "three/examples/jsm/shaders/VignetteShader.js";
import { animationManager } from "../../projector/helpers/animationManager";
import parliamentStore      from "../../projector/parliament/parliamentStore";

// ─── Chromatic aberration (RGB split) GLSL shader ───────────────────────────
const ChromaticAberrationShader = {
  uniforms: {
    tDiffuse: { value: null },
    amount:   { value: 0.0 },   // 0 = none, 0.01 = strong
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float amount;
    varying vec2 vUv;
    void main() {
      vec2 dir = vUv - 0.5;
      float d = length(dir);
      vec2 off = normalize(dir) * amount * d;
      float r = texture2D(tDiffuse, vUv + off).r;
      float g = texture2D(tDiffuse, vUv       ).g;
      float b = texture2D(tDiffuse, vUv - off).b;
      gl_FragColor = vec4(r, g, b, 1.0);
    }
  `,
};

// ─── Color grade (warm↔cool↔red) GLSL shader ────────────────────────────────
const ColorGradeShader = {
  uniforms: {
    tDiffuse:  { value: null },
    warmth:    { value: 0.5 },   // 1 = warm gold, 0 = cool blue
    emergency: { value: 0.0 },   // 0-1: blends toward red saturation
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float warmth;
    uniform float emergency;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      // Warm: boost R/G, cool: shift toward blue-teal
      float w = warmth;
      vec3 warm = vec3(c.r * (1.0 + 0.25 * w), c.g * (1.0 + 0.12 * w), c.b * (1.0 - 0.18 * w));
      float cw = 1.0 - w;
      vec3 cool = vec3(c.r * (1.0 - 0.20 * cw), c.g * (1.0 + 0.08 * cw), c.b * (1.0 + 0.28 * cw));
      vec3 graded = mix(cool, warm, w);
      // Emergency: crush greens/blues, push red
      vec3 emerg = vec3(graded.r * (1.0 + 0.8 * emergency), graded.g * (1.0 - 0.5 * emergency), graded.b * (1.0 - 0.6 * emergency));
      gl_FragColor = vec4(mix(graded, emerg, emergency), c.a);
    }
  `,
};

// ─── Palette ─────────────────────────────────────────────────────────────────
const AMBER        = 0xff8800;
const AMBER_DIM    = 0x663300;
const AMBER_BRIGHT = 0xffcc44;
const AMBER_PALE   = 0x331a00;
const BG           = 0x000804;

// ─── Layout ──────────────────────────────────────────────────────────────────
const SPECIES_R = 4.2;
const EDNA_R    = 7.8;
const RINGS     = [2, 4, 6, 8];

const SPECIES_ANGLES = [0, 72, 144, 216, 288].map((d) => (d * Math.PI) / 180);
const SPECIES_NAMES  = ["Ara macao", "Atlapetes", "Cecropia", "Alouatta", "Tinamus"];
const EDNA_ANGLES    = Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2);
const EDNA_IDS       = ["CHO", "AMZ", "COR", "CAR", "ORI", "PAC", "MAG", "GUA"];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function makeCircle(radius, segments, color, opacity) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  return new THREE.Line(geo, mat);
}

function makeParticleHalo(count, radius, color) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    const r     = radius * (0.7 + Math.random() * 0.6);
    positions[i * 3]     = Math.sin(phi) * Math.cos(theta) * r;
    positions[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * r;
    positions[i * 3 + 2] = Math.cos(phi) * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color,
    size: 0.04,
    transparent: true,
    opacity: 0.6,
    sizeAttenuation: true,
  });
  return new THREE.Points(geo, mat);
}

// ─── Pseudo-FFT (fallback when no external bins) ─────────────────────────────
function buildFftBins(state, elapsed, numBins = 64) {
  const bins = new Float32Array(numBins);
  if (!state) {
    for (let i = 0; i < numBins; i++)
      bins[i] = Math.max(0, Math.sin(elapsed * 2 + i * 0.4) * 0.3 + Math.random() * 0.05);
    return bins;
  }
  for (const sp of state.species) {
    const freq   = sp.freq || 440;
    const binIdx = Math.floor(((freq - 220) / 1780) * (numBins - 1));
    const amp    = sp.presence * sp.activity;
    for (let i = 0; i < numBins; i++) {
      const dist = Math.abs(i - binIdx);
      bins[i] += amp * Math.exp(-dist * dist / 12);
    }
  }
  const avgBio = state.edna.reduce((s, e) => s + e.biodiversity, 0) / state.edna.length;
  for (let i = 0; i < numBins; i++) bins[i] += avgBio * 0.15 * Math.random();
  bins[0] += state.eco.co2 / 127 * 0.5;
  bins[1] += state.eco.mycoPulse / 5 * 0.4;
  const mx = Math.max(...bins, 0.01);
  for (let i = 0; i < numBins; i++) bins[i] = Math.min(1, bins[i] / mx);
  return bins;
}

// ─── Smooth lerp helper ───────────────────────────────────────────────────────
function lerp(a, b, t) { return a + (b - a) * t; }

class ParliamentStage extends BaseThreeJsModule {
  constructor(container) {
    super(container);

    this.clock            = new THREE.Clock();
    this.parliamentState  = null;
    this._fftBinsExternal = null;  // set by parliamentEntry.ts

    // sonETH instrument params — written by applySonethToViz(), read in updateStage()
    this._sonethPitchZ       = 0.5;  // pitchshift → species Z oscillation amplitude
    this._sonethTimeScale    = 0.3;  // timedilation → orbit speed multiplier (0=fast, 1=slow)
    this._sonethHarmonicLiss = 0.5;  // harmonicrich → lissajous curve complexity

    // Smoothed atmosphere values (prevent jumps)
    this._smoothConsensus  = 0.5;
    this._smoothTurbulence = 0.0;
    this._smoothEmergency  = 0.0;
    this._smoothCo2        = 0.0;
    this._smoothWarmth     = 0.5;

    // ─── Renderer ─────────────────────────────────────────────────────────
    this.renderer.setClearColor(BG, 1);
    this.renderer.toneMapping         = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    // ─── Camera ───────────────────────────────────────────────────────────
    this.camera.fov  = 50;
    this.camera.near = 0.1;
    this.camera.far  = 200;
    this.camera.position.set(0, 4, 20);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();

    this.controls.enabled         = true;
    this.controls.enableDamping   = true;
    this.controls.dampingFactor   = 0.05;
    this.controls.autoRotate      = true;
    this.controls.autoRotateSpeed = 0.3;
    this.controls.minDistance     = 8;
    this.controls.maxDistance     = 40;

    // ─── Lights ───────────────────────────────────────────────────────────
    const ambient = new THREE.AmbientLight(AMBER, 0.15);
    this.scene.add(ambient);
    this._ptLight = new THREE.PointLight(AMBER_BRIGHT, 1.5, 30);
    this._ptLight.position.set(0, 0, 5);
    this.scene.add(this._ptLight);

    // ─── Post-processing pipeline ─────────────────────────────────────────
    const w = container.offsetWidth  || 1280;
    const h = container.offsetHeight || 720;

    this._composer = new EffectComposer(this.renderer);
    this._composer.addPass(new RenderPass(this.scene, this.camera));

    // 1. Bloom — strength driven by consensus (0.3 idle → 1.4 high consensus)
    this._bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.6, 0.5, 0.20);
    this._composer.addPass(this._bloom);

    // 2. AfterimagePass — persistence trail (damp driven by activity)
    this._afterimage = new AfterimagePass(0.88);
    this._composer.addPass(this._afterimage);

    // 3. Chromatic aberration — amount driven by turbulence (low consensus)
    this._chromaPass = new ShaderPass(ChromaticAberrationShader);
    this._chromaPass.uniforms.amount.value = 0.0;
    this._composer.addPass(this._chromaPass);

    // 4. Film grain — intensity driven by ETH CO₂/transaction density
    //    FilmPass(intensity, grayscale) — modern three.js API
    this._filmPass = new FilmPass(0.0, false);
    this._composer.addPass(this._filmPass);

    // 5. Color grading — warmth / emergency
    this._colorGradePass = new ShaderPass(ColorGradeShader);
    this._colorGradePass.uniforms.warmth.value    = 0.5;
    this._colorGradePass.uniforms.emergency.value = 0.0;
    this._composer.addPass(this._colorGradePass);

    // 6. Vignette — offset/darkness driven by parliament cycle phase
    this._vignettePass = new ShaderPass(VignetteShader);
    this._vignettePass.uniforms.offset.value   = 0.95;
    this._vignettePass.uniforms.darkness.value = 1.2;
    this._vignettePass.renderToScreen = true;
    this._composer.addPass(this._vignettePass);

    // Override render to always go through composer
    this.render = () => { this._composer.render(); };

    // ─── Scene ────────────────────────────────────────────────────────────
    this.buildRadarGrid();
    this.buildSpeciesObjects();
    this.buildEdnaNodes();
    this.buildFftRing();
    this.buildFungiLines();
    this.buildConsensusCore();

    parliamentStore.connect();
    // Grab current state immediately so first frame has data even before next notification
    this.parliamentState = parliamentStore.state;
    this._unsubscribeStore = parliamentStore.subscribe((state) => { this.parliamentState = state; });

    this.setCustomAnimate(() => this.updateStage());
    if (!this.isInitialized) {
      this.isInitialized = true;
      animationManager.subscribe(this.animate);
    }
  }

  // ─── RADAR GRID (reactive) ─────────────────────────────────────────────────
  // Rings rotate slowly and pulse in opacity/scale driven by consensus, OSC, and ETH.
  buildRadarGrid() {
    this._radarGroup = new THREE.Group();
    this._radarRings = [];
    this._radarBaseOpacities = [];

    RINGS.forEach((r, i) => {
      const baseOp = i === RINGS.length - 1 ? 0.28 : 0.06;
      const ring = makeCircle(r, 128, AMBER, baseOp);
      this._radarGroup.add(ring);
      this._radarRings.push(ring);
      this._radarBaseOpacities.push(baseOp);
    });

    // Coordinate axes — stored for opacity modulation
    const axLen = RINGS[RINGS.length - 1] + 0.3;
    const axPts = [
      new THREE.Vector3(-axLen, 0, 0), new THREE.Vector3(axLen, 0, 0),
      new THREE.Vector3(0, -axLen, 0), new THREE.Vector3(0, axLen, 0),
    ];
    this._radarAxes = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(axPts),
      new THREE.LineBasicMaterial({ color: AMBER, transparent: true, opacity: 0.05 })
    );
    this._radarGroup.add(this._radarAxes);

    // Tick marks at 30° intervals
    const tickPts = [];
    for (let deg = 0; deg < 360; deg += 30) {
      const a  = (deg * Math.PI) / 180;
      const r0 = RINGS[RINGS.length - 1];
      tickPts.push(
        new THREE.Vector3(Math.cos(a) * r0, Math.sin(a) * r0, 0),
        new THREE.Vector3(Math.cos(a) * (r0 + 0.3), Math.sin(a) * (r0 + 0.3), 0)
      );
    }
    this._radarTicks = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(tickPts),
      new THREE.LineBasicMaterial({ color: AMBER, transparent: true, opacity: 0.30 })
    );
    this._radarGroup.add(this._radarTicks);

    this.scene.add(this._radarGroup);
  }

  // ─── 5 SPECIES OBJECTS ─────────────────────────────────────────────────────
  buildSpeciesObjects() {
    this.speciesGroups     = [];
    this.speciesHalos      = [];
    this.speciesMeshes     = [];
    this.speciesSolidMats  = [];
    this.speciesOrbitAngle = SPECIES_ANGLES.slice();

    const geometries = [
      new THREE.IcosahedronGeometry(0.38, 1),               // Ara macao   CR
      new THREE.OctahedronGeometry(0.42, 0),                // Atlapetes   VU
      new THREE.TetrahedronGeometry(0.45, 0),               // Cecropia    LC
      new THREE.TorusKnotGeometry(0.25, 0.08, 64, 8, 2, 3), // Alouatta   VU
      new THREE.DodecahedronGeometry(0.38, 0),              // Tinamus     LC
    ];

    // IUCN-coded base hue for each species' glow
    // CR=red-orange, VU=yellow-amber, LC=green-amber
    const iucnColors = [0xff4400, 0xff9900, 0x88cc00, 0xff9900, 0x88cc00];

    for (let i = 0; i < 5; i++) {
      const group = new THREE.Group();

      const wireMat = new THREE.MeshBasicMaterial({
        color: AMBER_BRIGHT,
        wireframe: true,
        transparent: true,
        opacity: 0.7,
      });
      const wireMesh = new THREE.Mesh(geometries[i], wireMat);

      const solidMat = new THREE.MeshPhongMaterial({
        color: iucnColors[i],
        emissive: iucnColors[i],
        emissiveIntensity: 0.4,
        transparent: true,
        opacity: 0.15,
      });
      const solidMesh = new THREE.Mesh(geometries[i].clone(), solidMat);

      group.add(solidMesh);
      group.add(wireMesh);

      const halo = makeParticleHalo(120, 0.65, AMBER);
      group.add(halo);
      this.speciesHalos.push(halo);
      this.speciesSolidMats.push(solidMat);

      const a = SPECIES_ANGLES[i];
      group.position.set(Math.cos(a) * SPECIES_R, Math.sin(a) * SPECIES_R, 0);

      this.scene.add(group);
      this.speciesGroups.push(group);
      this.speciesMeshes.push(wireMesh);
    }

    // Inter-species connection lines (all 10 pairs: 5 choose 2)
    // Positions updated every frame in updateStage; opacity driven by combined activity.
    const numPairs = 10; // C(5,2)
    this._speciesConnPositions = new Float32Array(numPairs * 6); // 2 endpoints × 3 floats
    const connGeo = new THREE.BufferGeometry();
    connGeo.setAttribute("position", new THREE.BufferAttribute(this._speciesConnPositions, 3));
    this._speciesConnLines = new THREE.LineSegments(connGeo, new THREE.LineBasicMaterial({
      color: AMBER_BRIGHT,
      transparent: true,
      opacity: 0.0,
    }));
    this.scene.add(this._speciesConnLines);
  }

  // ─── 8 eDNA ORBITAL NODES ──────────────────────────────────────────────────
  buildEdnaNodes() {
    this.ednaGroups     = [];
    this.ednaMeshes     = [];
    this.ednaOrbitAngle = EDNA_ANGLES.slice();
    this.ednaOrbitSpeed = EDNA_ANGLES.map((_, i) => 0.003 + i * 0.0004);

    const ednaGeos = [
      new THREE.BoxGeometry(0.35, 0.35, 0.35),
      new THREE.CylinderGeometry(0, 0.28, 0.5, 5),
      new THREE.CapsuleGeometry(0.12, 0.28, 4, 8),
      new THREE.SphereGeometry(0.22, 8, 4),
      new THREE.BoxGeometry(0.4, 0.2, 0.4),
      new THREE.OctahedronGeometry(0.28, 0),
      new THREE.CylinderGeometry(0.22, 0.22, 0.35, 6),
      new THREE.TorusGeometry(0.2, 0.06, 6, 12),
    ];

    for (let i = 0; i < 8; i++) {
      const group = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color: AMBER, wireframe: true, transparent: true, opacity: 0.55 });
      const mesh = new THREE.Mesh(ednaGeos[i], mat);
      group.add(mesh);

      const chSize = 0.38;
      const chPts = [
        new THREE.Vector3(-chSize, 0, 0), new THREE.Vector3(chSize, 0, 0),
        new THREE.Vector3(0, -chSize, 0), new THREE.Vector3(0, chSize, 0),
        new THREE.Vector3(0, 0, -chSize), new THREE.Vector3(0, 0, chSize),
      ];
      group.add(new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(chPts),
        new THREE.LineBasicMaterial({ color: AMBER_DIM, transparent: true, opacity: 0.4 })
      ));

      const orbitRing = makeCircle(0.5, 32, AMBER_DIM, 0.15);
      orbitRing.rotation.x = Math.PI / 2;
      group.add(orbitRing);

      const a = EDNA_ANGLES[i];
      group.position.set(Math.cos(a) * EDNA_R, Math.sin(a) * EDNA_R, 0);

      this.scene.add(group);
      this.ednaGroups.push(group);
      this.ednaMeshes.push(mesh);
    }
  }

  // ─── FFT RING ──────────────────────────────────────────────────────────────
  buildFftRing() {
    const NUM_BARS  = 64;
    const RING_R    = 2.0;
    const MAX_BAR_H = 1.2;

    this._fftNumBars = NUM_BARS;
    this._fftRingR   = RING_R;
    this._fftMaxBarH = MAX_BAR_H;

    const positions = new Float32Array(NUM_BARS * 2 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({ color: AMBER, transparent: true, opacity: 0.7 });
    this._fftLines     = new THREE.LineSegments(geo, mat);
    this._fftPositions = positions;
    this.scene.add(this._fftLines);

    for (let i = 0; i < NUM_BARS; i++) {
      const a = (i / NUM_BARS) * Math.PI * 2;
      const ix = Math.cos(a) * RING_R, iy = Math.sin(a) * RING_R;
      positions[i * 6] = ix; positions[i * 6 + 1] = iy; positions[i * 6 + 2] = 0;
      positions[i * 6 + 3] = ix; positions[i * 6 + 4] = iy; positions[i * 6 + 5] = 0;
    }
  }

  // ─── FUNGI LINES ───────────────────────────────────────────────────────────
  buildFungiLines() {
    const COUNT     = 10;
    const positions = new Float32Array(COUNT * 2 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({ color: AMBER_DIM, transparent: true, opacity: 0.25 });
    this._fungiLines     = new THREE.LineSegments(geo, mat);
    this._fungiPositions = positions;
    this.scene.add(this._fungiLines);

    this._fungiConnections = [];
    for (let si = 0; si < 5; si++) {
      const sa    = SPECIES_ANGLES[si];
      const dists = EDNA_ANGLES.map((ea, ei) => ({
        ei, dist: Math.abs(((ea - sa + Math.PI * 3) % (Math.PI * 2)) - Math.PI),
      }));
      dists.sort((a, b) => a.dist - b.dist);
      this._fungiConnections.push(dists[0].ei, dists[1].ei);
    }
  }

  // ─── CONSENSUS CORE ────────────────────────────────────────────────────────
  buildConsensusCore() {
    const geo = new THREE.IcosahedronGeometry(0.7, 2);
    const mat = new THREE.MeshBasicMaterial({ color: AMBER_BRIGHT, wireframe: true, transparent: true, opacity: 0.5 });
    this._consensusMesh = new THREE.Mesh(geo, mat);
    this.scene.add(this._consensusMesh);

    const innerGeo = new THREE.SphereGeometry(0.3, 12, 8);
    const innerMat = new THREE.MeshPhongMaterial({ color: AMBER, emissive: AMBER, emissiveIntensity: 1.0, transparent: true, opacity: 0.8 });
    this._consensusCore = new THREE.Mesh(innerGeo, innerMat);
    this.scene.add(this._consensusCore);

    const lissPts = [];
    for (let i = 0; i <= 256; i++) {
      const t = (i / 256) * Math.PI * 2;
      lissPts.push(new THREE.Vector3(Math.sin(3 * t) * 0.6, Math.sin(2 * t) * 0.6, Math.cos(t) * 0.2));
    }
    const lissGeo = new THREE.BufferGeometry().setFromPoints(lissPts);
    const lissMat = new THREE.LineBasicMaterial({ color: AMBER_BRIGHT, transparent: true, opacity: 0.8 });
    this._lissajousLine = new THREE.Line(lissGeo, lissMat);
    this._lissajousPos  = lissGeo.attributes.position.array;
    this._lissajousLine.position.z = 0.5;
    this.scene.add(this._lissajousLine);
  }

  // ─── MAIN UPDATE LOOP ──────────────────────────────────────────────────────
  updateStage() {
    const state   = this.parliamentState;
    const elapsed = this.clock.getElapsedTime();

    const phase      = state ? state.phase      : (elapsed / 120) % 1;
    const consensus  = state ? state.consensus  : 0.5 + Math.sin(elapsed * 0.3) * 0.3;
    const consensusW = state ? state.consensusWave : 0.5;
    const co2        = state ? state.eco.co2 / 127    : 0.0;
    const nitrogen   = state ? state.eco.nitrogen / 127 : 0.0;
    const votes      = state ? state.votes : 0;

    // Turbulence = inverse of consensus, sharpened
    const turbulence = Math.pow(1.0 - Math.min(1, consensus), 2.0);

    // Emergency: low consensus + high votes in flight
    const emergencyLevel = state ? Math.max(0, (1 - consensus) * Math.min(1, votes / 10) - 0.2) : 0.0;

    // Warmth: consensus drives warm/gold; dissent drives cool/fragmented
    const targetWarmth = 0.25 + consensus * 0.75;

    // Smooth all atmosphere values (prevent jerky updates at 10Hz state rate)
    const k = 0.04; // lerp speed per frame
    this._smoothConsensus  = lerp(this._smoothConsensus,  consensus,      k);
    this._smoothTurbulence = lerp(this._smoothTurbulence, turbulence,     k);
    this._smoothEmergency  = lerp(this._smoothEmergency,  emergencyLevel, k);
    this._smoothCo2        = lerp(this._smoothCo2,        co2,            k * 0.5);
    this._smoothWarmth     = lerp(this._smoothWarmth,     targetWarmth,   k);

    // ── 1. BLOOM: strength ∝ consensus ─────────────────────────────────────
    //    Range: 0.25 (low consensus, dim) → 1.5 (high consensus, harmonic glow)
    //    Also pulses gently with consensusWave
    const bloomPulse    = 0.5 + consensusW * 0.5;
    this._bloom.strength = lerp(0.25, 1.5, this._smoothConsensus) * (0.85 + bloomPulse * 0.15);
    //    Radius tightens at high consensus (focused glow), loosens at low (diffuse haze)
    this._bloom.radius   = lerp(0.65, 0.30, this._smoothConsensus);
    //    Threshold drops with consensus: more elements glow when in agreement
    this._bloom.threshold = lerp(0.35, 0.08, this._smoothConsensus);

    // ── 2. CHROMATIC ABERRATION: turbulence ──────────────────────────────
    //    Range: 0.0 (full consensus) → 0.010 (maximum dissent)
    this._chromaPass.uniforms.amount.value = this._smoothTurbulence * 0.010;

    // ── 3. FILM GRAIN: ETH CO₂ + nitrogen density ─────────────────────────
    //    intensity: 0 (no ETH activity) → 0.35 (high gas price / tx density)
    const grainIntensity = this._smoothCo2 * 0.30 + nitrogen * 0.08;
    this._filmPass.uniforms.intensity.value = grainIntensity;

    // ── 4. AFTERIMAGE: persistence damp from activity ─────────────────────
    //    High species activity = more trails (0.93), low = less ghost (0.82)
    const avgActivity = state
      ? state.species.reduce((s, sp) => s + sp.activity, 0) / 5
      : 0.5;
    this._afterimage.uniforms.damp.value = lerp(0.82, 0.93, avgActivity);

    // ── 5. COLOR GRADING ─────────────────────────────────────────────────
    this._colorGradePass.uniforms.warmth.value    = this._smoothWarmth;
    this._colorGradePass.uniforms.emergency.value = this._smoothEmergency;

    // ── 6. VIGNETTE: breathes with 120s parliament cycle ─────────────────
    //    Offset: 0.6 (dark corners near vote) → 1.2 (open, wide at mid-cycle)
    //    Phase 0-0.5: opening, 0.5-1: contracting toward vote
    const cycleBreath = Math.sin(phase * Math.PI); // 0 → 1 → 0
    this._vignettePass.uniforms.offset.value   = lerp(0.60, 1.15, cycleBreath);
    //    Darkness increases as emergency grows
    this._vignettePass.uniforms.darkness.value = lerp(1.1, 2.2, this._smoothEmergency);

    // ── Point light ───────────────────────────────────────────────────────
    this.controls.autoRotateSpeed = 0.2 + this._smoothConsensus * 0.5;
    this._ptLight.intensity = 0.8 + consensusW * 1.2;
    this._ptLight.position.set(
      Math.sin(elapsed * 0.3) * 1.5,
      Math.cos(elapsed * 0.4) * 1.5,
      4
    );

    // ── FFT ring ─────────────────────────────────────────────────────────
    const fftBins = this._fftBinsExternal || buildFftBins(state, elapsed);
    const N = this._fftNumBars, R = this._fftRingR, MH = this._fftMaxBarH;
    const pos = this._fftPositions;
    for (let i = 0; i < N; i++) {
      const a  = (i / N) * Math.PI * 2;
      const v  = fftBins[Math.floor((i / N) * fftBins.length)] || 0;
      pos[i * 6]     = Math.cos(a) * R;
      pos[i * 6 + 1] = Math.sin(a) * R;
      pos[i * 6 + 2] = 0;
      pos[i * 6 + 3] = Math.cos(a) * (R + v * MH);
      pos[i * 6 + 4] = Math.sin(a) * (R + v * MH);
      pos[i * 6 + 5] = 0;
    }
    this._fftLines.geometry.attributes.position.needsUpdate = true;
    // FFT bar opacity modulated by consensus (brighter when in agreement)
    this._fftLines.material.opacity = 0.4 + this._smoothConsensus * 0.5;

    // ── Species objects ───────────────────────────────────────────────────
    for (let i = 0; i < 5; i++) {
      const sp  = state ? state.species[i] : { presence: 0.5, activity: 0.5, freq: 440, votes: 0 };
      const grp = this.speciesGroups[i];
      const wfm = this.speciesMeshes[i];
      const sdm = this.speciesSolidMats[i];

      // Orbit speed: activity-driven, modulated by sonETH timeDilation
      // timeDilation 0→fast orbits (×1.5), 1→slow orbits (×0.2)
      const timeScaleMul = 1.5 - (this._sonethTimeScale ?? 0.3) * 1.3;
      const orbitSpeed = (0.0008 + i * 0.0002 + sp.activity * 0.021) * Math.max(0.1, timeScaleMul);
      this.speciesOrbitAngle[i] += orbitSpeed;
      const a  = this.speciesOrbitAngle[i];
      // Orbit radius shrinks when presence is low (agent fading from parliament)
      const orbitR = SPECIES_R * (0.4 + sp.presence * 0.6);
      const cx = Math.cos(a) * orbitR;
      const cy = Math.sin(a) * orbitR;
      // Z oscillation: activity × sonETH pitchShift (0→no Z, 1→full Z swing)
      const pitchZ = this._sonethPitchZ ?? 0.5;
      const cz = Math.sin(elapsed * 0.4 + i * 1.2) * (sp.activity * 3.5 * (0.2 + pitchZ * 1.6));
      grp.position.set(cx, cy, cz);

      // Self-rotation: activity → fast spin (0.005 → 0.12 rad/frame)
      grp.rotation.x += 0.005 + sp.activity * 0.115;
      grp.rotation.y += 0.007 + sp.activity * 0.08;

      // Wireframe: fully transparent at presence=0, fully bright at presence=1
      wfm.material.opacity = sp.presence;
      // Color: orange-dim (dormant) → amber-bright (active) with smooth blend
      const wireHex = sp.activity > 0.7
        ? AMBER_BRIGHT
        : sp.activity > 0.4
          ? AMBER
          : AMBER_DIM;
      wfm.material.color.setHex(wireHex);

      // Solid core: very visible glow at high presence
      sdm.emissiveIntensity = sp.presence * 2.5 + this._smoothConsensus * 0.5;
      sdm.opacity           = 0.05 + sp.presence * 0.60;

      // Scale: dramatic range — presence 0 → 0.25 (tiny), presence 1 → 2.2 (large)
      // Plus activity pulse that stretches the shape further
      const freq      = sp.freq || 440;
      const pulseRate = 0.5 + ((freq - 220) / 660) * 2;
      const pulse     = 0.5 + Math.sin(elapsed * pulseRate * Math.PI * 2) * 0.5;
      const scale     = 0.25 + sp.presence * 1.95 + pulse * sp.activity * 0.5;
      grp.scale.setScalar(scale);

      // Halo: full-range opacity and size from activity + presence
      this.speciesHalos[i].material.opacity = sp.activity * 0.9 + this._smoothTurbulence * 0.15;
      this.speciesHalos[i].material.size    = 0.02 + sp.presence * 0.12 + sp.activity * 0.08;
    }

    // ── Inter-species connection lines ─────────────────────────────────────
    // Draw a line between every pair of species. Opacity = product of both activities.
    // High mutual activity = bright link; dormant species = invisible.
    {
      let pairIdx = 0;
      const cp = this._speciesConnPositions;
      let maxPairActivity = 0;
      for (let a2 = 0; a2 < 5; a2++) {
        for (let b2 = a2 + 1; b2 < 5; b2++) {
          const pa = this.speciesGroups[a2].position;
          const pb = this.speciesGroups[b2].position;
          cp[pairIdx * 6]     = pa.x; cp[pairIdx * 6 + 1] = pa.y; cp[pairIdx * 6 + 2] = pa.z;
          cp[pairIdx * 6 + 3] = pb.x; cp[pairIdx * 6 + 4] = pb.y; cp[pairIdx * 6 + 5] = pb.z;
          const actA = state ? state.species[a2].activity : 0.5;
          const actB = state ? state.species[b2].activity : 0.5;
          maxPairActivity = Math.max(maxPairActivity, actA * actB);
          pairIdx++;
        }
      }
      this._speciesConnLines.geometry.attributes.position.needsUpdate = true;
      // Opacity: visible only when species are mutually active
      this._speciesConnLines.material.opacity = Math.pow(maxPairActivity, 0.6) * 0.75;
    }

    // ── eDNA nodes ────────────────────────────────────────────────────────
    for (let i = 0; i < 8; i++) {
      const ed  = state ? state.edna[i] : { biodiversity: 0.5, validation: 0.5 };
      const grp = this.ednaGroups[i];
      const msh = this.ednaMeshes[i];

      this.ednaOrbitAngle[i] += this.ednaOrbitSpeed[i] * (0.7 + ed.validation * 0.6);
      const a  = this.ednaOrbitAngle[i];
      const cz = Math.sin(elapsed * 0.25 + i * 0.7) * 1.8;
      grp.position.set(Math.cos(a) * EDNA_R, Math.sin(a) * EDNA_R, cz);

      grp.rotation.y += 0.008 + ed.biodiversity * 0.01;
      grp.rotation.z += 0.005;

      // High biodiversity nodes are brighter and larger
      msh.material.opacity = 0.20 + ed.biodiversity * 0.60;
      msh.material.color.setHex(ed.validation > 0.6 ? AMBER_BRIGHT : AMBER);
      const ednaScale = 0.8 + ed.biodiversity * 0.5;
      grp.scale.setScalar(ednaScale);
    }

    // ── Fungi lines ───────────────────────────────────────────────────────
    let idx = 0;
    for (let si = 0; si < 5; si++) {
      const sg = this.speciesGroups[si].position;
      for (let c = 0; c < 2; c++) {
        const ei = this._fungiConnections[si * 2 + c];
        const eg = this.ednaGroups[ei].position;
        this._fungiPositions[idx++] = sg.x; this._fungiPositions[idx++] = sg.y; this._fungiPositions[idx++] = sg.z;
        this._fungiPositions[idx++] = eg.x; this._fungiPositions[idx++] = eg.y; this._fungiPositions[idx++] = eg.z;
      }
    }
    this._fungiLines.geometry.attributes.position.needsUpdate = true;
    const avgConn = state ? state.fungi.reduce((s, f) => s + f.connectivity, 0) / 4 : 0.5;
    const avgChem = state ? state.fungi.reduce((s, f) => s + f.chemical,     0) / 4 : 0.5;
    // Chemical signal pulses fungi line brightness at 6s cycle
    const fungiPulse = 0.5 + Math.sin(elapsed * (Math.PI * 2 / 6)) * 0.5;
    this._fungiLines.material.opacity = (0.06 + avgConn * 0.30) * (0.6 + avgChem * fungiPulse * 0.8);

    // ── Consensus core ────────────────────────────────────────────────────
    const coreScale = 0.8 + this._smoothConsensus * 0.6;
    this._consensusMesh.scale.setScalar(coreScale);
    this._consensusMesh.rotation.y += 0.005 + this._smoothConsensus * 0.01;
    this._consensusMesh.rotation.x += 0.003;
    this._consensusMesh.material.opacity = 0.20 + this._smoothConsensus * 0.50;

    this._consensusCore.scale.setScalar(0.5 + consensusW * 0.8);
    // Core emissive intensity from consensus — bloom then amplifies
    this._consensusCore.material.emissiveIntensity = 0.6 + this._smoothConsensus * 1.2;

    // ── Lissajous (AI + sonETH harmonicRich) ────────────────────────────
    const ai     = state ? state.ai : { consciousness: 0.5, optimization: 64 };
    // harmonicRich adds extra lobes (FM ratio → visual complexity)
    const harmLiss = this._sonethHarmonicLiss ?? 0.5;
    const a_rat  = 2 + Math.round(ai.consciousness * 3 + harmLiss * 3);
    const delta  = (ai.optimization / 127) * Math.PI + elapsed * (0.15 + harmLiss * 0.3);
    const lScale = 0.55 + ai.consciousness * 0.2 + harmLiss * 0.15;
    const lPos   = this._lissajousPos;
    const lSegs  = lPos.length / 3 - 1;
    for (let i = 0; i <= lSegs; i++) {
      const t = (i / lSegs) * Math.PI * 2;
      lPos[i * 3]     = Math.sin(a_rat * t + delta) * lScale;
      lPos[i * 3 + 1] = Math.sin(3 * t) * lScale;
      lPos[i * 3 + 2] = Math.cos(t * 2) * lScale * 0.4;
    }
    this._lissajousLine.geometry.attributes.position.needsUpdate = true;
    this._lissajousLine.material.opacity = 0.5 + ai.consciousness * 0.4;
    this._lissajousLine.rotation.y       = elapsed * 0.1;

    // ── Reactive radar grid ───────────────────────────────────────────────
    if (this._radarGroup && this._radarRings) {
      const txInf   = this._sonethTxInfluence ?? 0.0;
      const droneD  = this._sonethDroneDepth  ?? 0.4;
      const timeScl = this._sonethTimeScale   ?? 0.3;

      // Slow counter-clockwise drift — timeDilation controls speed, txInfluence adds bursts
      this._radarGroup.rotation.z -= 0.00025 + timeScl * 0.0006 + txInf * 0.0012;

      // Breath scale: consensus wave + drone depth subtly expand/contract rings
      const breath = 1.0 + Math.sin(elapsed * 0.6) * 0.025 * (0.5 + consensusW)
                   + (droneD - 0.4) * 0.08;
      this._radarGroup.scale.setScalar(breath);

      // Per-ring opacity: outermost pulses with txInfluence, inner rings echo consensus
      this._radarRings.forEach((ring, i) => {
        const base   = this._radarBaseOpacities[i];
        const phase  = elapsed * (1.2 + i * 0.4);
        const cons   = this._smoothConsensus;
        const txBeat = txInf * 0.18 * Math.max(0, Math.sin(phase));
        // outer ring much brighter at high consensus, inner rings shimmer
        const targetOp = base
          + cons * (i === RINGS.length - 1 ? 0.25 : 0.05)
          + txBeat;
        ring.material.opacity = Math.min(0.75, Math.max(0, targetOp));
      });

      // Tick marks flash with ETH activity (co2-driven)
      this._radarTicks.material.opacity = 0.18 + this._smoothConsensus * 0.25 + this._smoothCo2 * 0.20;
      this._radarAxes.material.opacity  = 0.03 + this._smoothConsensus * 0.06;
    }

    // ── Vote event: flash ────────────────────────────────────────────────
    if (state && state.events.voteResult) {
      const passed = state.events.voteResult.passed;
      for (const grp of this.speciesGroups)
        grp.children[1].material.color.setHex(passed ? AMBER_BRIGHT : AMBER_DIM);
      parliamentStore.consumeEvents();
    }
  }

  static methods = [...BaseThreeJsModule.methods];

  destroy() {
    // Unsubscribe from store but do NOT disconnect — it's a singleton shared across viz switches.
    if (this._unsubscribeStore) { this._unsubscribeStore(); this._unsubscribeStore = null; }

    // Null out the direct reference to parliamentStore.state BEFORE super.destroy().
    // BaseThreeJsModule.destroy() runs a nuclear "for-in" loop that calls disposeObject()
    // on every object-valued property. If this.parliamentState still points to
    // parliamentStore.state, disposeObject will null all its array fields (species, edna,
    // fungi, ...), corrupting the singleton store for all future slider interactions.
    this.parliamentState = null;

    super.destroy();
  }
}

ParliamentStage.moduleName        = "ParliamentStage";
ParliamentStage.moduleDescription = "Parliament of All Things — 3D telemetry stage with Fase 5 dynamic atmosphere";

export default ParliamentStage;
