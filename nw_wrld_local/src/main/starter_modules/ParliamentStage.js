// Parliament of All Things — 3D Telemetry Stage
// Amber scientific instrument aesthetic.
// 5 distinct 3D species objects (center ring) + 8 eDNA orbital nodes (outer ring)
// Spectrogram scrolling background + FFT ring + bloom post-processing

import { BaseThreeJsModule } from "../../projector/helpers/threeBase";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { AfterimagePass } from "three/examples/jsm/postprocessing/AfterimagePass.js";
import { animationManager } from "../../projector/helpers/animationManager";
import parliamentStore from "../../projector/parliament/parliamentStore";

// ─── Palette ───
const AMBER       = 0xff8800;
const AMBER_DIM   = 0x663300;
const AMBER_BRIGHT= 0xffcc44;
const AMBER_PALE  = 0x331a00;
const BG          = 0x000804;

const C_AMBER  = new THREE.Color(AMBER);
const C_BRIGHT = new THREE.Color(AMBER_BRIGHT);
const C_DIM    = new THREE.Color(AMBER_DIM);

// ─── Layout ───
const SPECIES_R = 4.2;   // inner ring radius
const EDNA_R    = 7.8;   // outer ring radius
const RINGS     = [2, 4, 6, 8];

// ─── Species definitions (5 distinct geometry types) ───
const SPECIES_ANGLES = [0, 72, 144, 216, 288].map((d) => (d * Math.PI) / 180);
const SPECIES_NAMES  = ["Ara macao", "Atlapetes", "Cecropia", "Alouatta", "Tinamus"];

// ─── eDNA (8 sites) ───
const EDNA_ANGLES = Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2);
const EDNA_IDS    = ["CHO", "AMZ", "COR", "CAR", "ORI", "PAC", "MAG", "GUA"];

// ─── Helper: make a circle LineLoop ───
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

// ─── FFT simulation from OSC data ───
// Since we don't have Web Audio, synthesize a pseudo-FFT from species freqs + eco signals
function buildFftBins(state, elapsed, numBins = 64) {
  const bins = new Float32Array(numBins);
  if (!state) {
    // Autonomous noise
    for (let i = 0; i < numBins; i++) {
      bins[i] = Math.max(0, Math.sin(elapsed * 2 + i * 0.4) * 0.3 + Math.random() * 0.05);
    }
    return bins;
  }

  // Species: add gaussian peak at each species freq
  for (const sp of state.species) {
    const freq   = sp.freq || 440;
    // Map freq (220-2000 Hz) to bin index
    const binIdx = Math.floor(((freq - 220) / 1780) * (numBins - 1));
    const amp    = sp.presence * sp.activity;
    for (let i = 0; i < numBins; i++) {
      const dist  = Math.abs(i - binIdx);
      bins[i] += amp * Math.exp(-dist * dist / 12);
    }
  }
  // eDNA: broadband noise floor
  const avgBio = state.edna.reduce((s, e) => s + e.biodiversity, 0) / state.edna.length;
  for (let i = 0; i < numBins; i++) {
    bins[i] += avgBio * 0.15 * Math.random();
  }
  // Eco: low-frequency rumble
  bins[0] += state.eco.co2 / 127 * 0.5;
  bins[1] += state.eco.mycoPulse / 5 * 0.4;

  // Normalize
  const mx = Math.max(...bins, 0.01);
  for (let i = 0; i < numBins; i++) bins[i] = Math.min(1, bins[i] / mx);

  return bins;
}

// ─── Particle halo builder ───
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

class ParliamentStage extends BaseThreeJsModule {
  constructor(container) {
    super(container);

    this.clock           = new THREE.Clock();
    this.parliamentState = null;
    this._fftBinsExternal = null; // set by parliamentEntry.ts animation loop

    // ─── Renderer ───
    this.renderer.setClearColor(BG, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    // ─── Camera ───
    this.camera.fov  = 50;
    this.camera.near = 0.1;
    this.camera.far  = 200;
    this.camera.position.set(0, 4, 20);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();

    // OrbitControls: let user navigate, but start with slow auto-orbit
    this.controls.enabled      = true;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.autoRotate    = true;
    this.controls.autoRotateSpeed = 0.3;
    this.controls.minDistance   = 8;
    this.controls.maxDistance   = 40;

    // ─── Lights (for MeshPhongMaterial glow look) ───
    const ambient = new THREE.AmbientLight(AMBER, 0.15);
    this.scene.add(ambient);
    const ptLight = new THREE.PointLight(AMBER_BRIGHT, 1.5, 30);
    ptLight.position.set(0, 0, 5);
    this.scene.add(ptLight);
    this._ptLight = ptLight;

    // ─── Post-processing ───
    this._composer = new EffectComposer(this.renderer);
    this._composer.addPass(new RenderPass(this.scene, this.camera));
    this._bloom = new UnrealBloomPass(
      new THREE.Vector2(container.offsetWidth || 1280, container.offsetHeight || 720),
      0.7,  // strength
      0.5,  // radius
      0.15  // threshold
    );
    this._composer.addPass(this._bloom);
    this._afterimage = new AfterimagePass(0.88);
    this._composer.addPass(this._afterimage);

    // Intercept render
    this._origRender = this.render.bind(this);
    this.render = () => {
      this._composer.render();
    };

    // ─── Scene construction ───
    this.buildRadarGrid();
    this.buildSpeciesObjects();
    this.buildEdnaNodes();
    this.buildFftRing();
    this.buildFungiLines();
    this.buildConsensusCore();

    parliamentStore.connect();
    parliamentStore.subscribe((state) => { this.parliamentState = state; });

    this.setCustomAnimate(() => this.updateStage());
    if (!this.isInitialized) {
      this.isInitialized = true;
      animationManager.subscribe(this.animate);
    }
  }

  // ─── RADAR GRID ───
  buildRadarGrid() {
    // Concentric rings in XY plane
    RINGS.forEach((r, i) => {
      const opacity = i === RINGS.length - 1 ? 0.3 : 0.08;
      const ring = makeCircle(r, 128, AMBER, opacity);
      this.scene.add(ring);
    });

    // Axis lines
    const axLen = RINGS[RINGS.length - 1] + 0.3;
    const axPts = [
      new THREE.Vector3(-axLen, 0, 0), new THREE.Vector3(axLen, 0, 0),
      new THREE.Vector3(0, -axLen, 0), new THREE.Vector3(0, axLen, 0),
    ];
    const axGeo = new THREE.BufferGeometry().setFromPoints(axPts);
    this.scene.add(new THREE.LineSegments(axGeo, new THREE.LineBasicMaterial({ color: AMBER, transparent: true, opacity: 0.06 })));

    // Tick marks
    const tickPts = [];
    for (let deg = 0; deg < 360; deg += 30) {
      const a  = (deg * Math.PI) / 180;
      const r0 = RINGS[RINGS.length - 1];
      tickPts.push(
        new THREE.Vector3(Math.cos(a) * r0, Math.sin(a) * r0, 0),
        new THREE.Vector3(Math.cos(a) * (r0 + 0.3), Math.sin(a) * (r0 + 0.3), 0)
      );
    }
    const tickGeo = new THREE.BufferGeometry().setFromPoints(tickPts);
    this.scene.add(new THREE.LineSegments(tickGeo, new THREE.LineBasicMaterial({ color: AMBER, transparent: true, opacity: 0.35 })));
  }

  // ─── 5 SPECIES OBJECTS (distinct 3D geometries) ───
  buildSpeciesObjects() {
    this.speciesGroups  = [];
    this.speciesHalos   = [];
    this.speciesMeshes  = [];
    this.speciesOrbitAngle = SPECIES_ANGLES.slice(); // mutable for independent orbit

    // Each species gets a unique geometry
    const geometries = [
      new THREE.IcosahedronGeometry(0.38, 1),         // Ara macao   — icosahedron
      new THREE.OctahedronGeometry(0.42, 0),           // Atlapetes   — octahedron
      new THREE.TetrahedronGeometry(0.45, 0),          // Cecropia    — tetrahedron
      new THREE.TorusKnotGeometry(0.25, 0.08, 64, 8, 2, 3), // Alouatta — torus knot
      new THREE.DodecahedronGeometry(0.38, 0),         // Tinamus     — dodecahedron
    ];

    for (let i = 0; i < 5; i++) {
      const group = new THREE.Group();

      // Wireframe shell
      const wireMat = new THREE.MeshBasicMaterial({
        color: AMBER_BRIGHT,
        wireframe: true,
        transparent: true,
        opacity: 0.7,
      });
      const wireMesh = new THREE.Mesh(geometries[i], wireMat);

      // Solid core (very dim, just for depth)
      const solidMat = new THREE.MeshPhongMaterial({
        color: AMBER_DIM,
        emissive: AMBER_DIM,
        transparent: true,
        opacity: 0.15,
        wireframe: false,
      });
      const solidMesh = new THREE.Mesh(geometries[i].clone(), solidMat);

      group.add(solidMesh);
      group.add(wireMesh);

      // Particle halo
      const halo = makeParticleHalo(120, 0.65, AMBER);
      group.add(halo);
      this.speciesHalos.push(halo);

      // Position on inner ring
      const a  = SPECIES_ANGLES[i];
      const cx = Math.cos(a) * SPECIES_R;
      const cy = Math.sin(a) * SPECIES_R;
      group.position.set(cx, cy, 0);

      this.scene.add(group);
      this.speciesGroups.push(group);
      this.speciesMeshes.push(wireMesh);
    }
  }

  // ─── 8 eDNA ORBITAL NODES ───
  buildEdnaNodes() {
    this.ednaGroups      = [];
    this.ednaMeshes      = [];
    this.ednaOrbitAngle  = EDNA_ANGLES.slice();
    this.ednaOrbitSpeed  = EDNA_ANGLES.map((_, i) => 0.003 + i * 0.0004); // different speeds

    // Each eDNA site gets a distinct geometry
    const ednaGeos = [
      new THREE.BoxGeometry(0.35, 0.35, 0.35),       // CHO
      new THREE.CylinderGeometry(0, 0.28, 0.5, 5),   // AMZ — cone
      new THREE.CapsuleGeometry(0.12, 0.28, 4, 8),   // COR
      new THREE.SphereGeometry(0.22, 8, 4),           // CAR — low-poly sphere
      new THREE.BoxGeometry(0.4, 0.2, 0.4),           // ORI — flat box
      new THREE.OctahedronGeometry(0.28, 0),           // PAC
      new THREE.CylinderGeometry(0.22, 0.22, 0.35, 6), // MAG — hexagonal prism
      new THREE.TorusGeometry(0.2, 0.06, 6, 12),      // GUA — torus
    ];

    for (let i = 0; i < 8; i++) {
      const group = new THREE.Group();

      // Wireframe
      const mat = new THREE.MeshBasicMaterial({
        color: AMBER,
        wireframe: true,
        transparent: true,
        opacity: 0.55,
      });
      const mesh = new THREE.Mesh(ednaGeos[i], mat);
      group.add(mesh);

      // Crosshair axes (tiny, local to node)
      const chSize = 0.38;
      const chPts = [
        new THREE.Vector3(-chSize, 0, 0), new THREE.Vector3(chSize, 0, 0),
        new THREE.Vector3(0, -chSize, 0), new THREE.Vector3(0, chSize, 0),
        new THREE.Vector3(0, 0, -chSize), new THREE.Vector3(0, 0, chSize),
      ];
      const chGeo = new THREE.BufferGeometry().setFromPoints(chPts);
      const chMat = new THREE.LineBasicMaterial({ color: AMBER_DIM, transparent: true, opacity: 0.4 });
      group.add(new THREE.LineSegments(chGeo, chMat));

      // Orbit ring (local circle) shows the node's orbital path
      const orbitRing = makeCircle(0.5, 32, AMBER_DIM, 0.15);
      orbitRing.rotation.x = Math.PI / 2; // lay flat
      group.add(orbitRing);

      const a  = EDNA_ANGLES[i];
      group.position.set(Math.cos(a) * EDNA_R, Math.sin(a) * EDNA_R, 0);

      this.scene.add(group);
      this.ednaGroups.push(group);
      this.ednaMeshes.push(mesh);
    }
  }

  // ─── FFT RING ───
  // Ring of vertical bars around center, driven by pseudo-FFT data
  buildFftRing() {
    const NUM_BARS  = 64;
    const RING_R    = 2.0;   // radius of FFT ring
    const MAX_BAR_H = 1.2;   // max bar height (radially outward)

    this._fftBars       = [];
    this._fftNumBars    = NUM_BARS;
    this._fftRingR      = RING_R;
    this._fftMaxBarH    = MAX_BAR_H;

    // Build bars as LineSegments pairs
    const positions = new Float32Array(NUM_BARS * 2 * 3);
    const geo       = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({
      color: AMBER,
      transparent: true,
      opacity: 0.7,
      vertexColors: false,
    });
    this._fftLines          = new THREE.LineSegments(geo, mat);
    this._fftPositions      = positions;
    this.scene.add(this._fftLines);

    // Initialize to zero height
    for (let i = 0; i < NUM_BARS; i++) {
      const a      = (i / NUM_BARS) * Math.PI * 2;
      const ix     = Math.cos(a) * RING_R;
      const iy     = Math.sin(a) * RING_R;
      positions[i * 6]     = ix;
      positions[i * 6 + 1] = iy;
      positions[i * 6 + 2] = 0;
      positions[i * 6 + 3] = ix;
      positions[i * 6 + 4] = iy;
      positions[i * 6 + 5] = 0;
    }
  }

  // ─── FUNGI LINES ───
  buildFungiLines() {
    // 5 species × 2 eDNA connections each = 10 line segments
    const COUNT     = 10;
    const positions = new Float32Array(COUNT * 2 * 3);
    const geo       = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({ color: AMBER_DIM, transparent: true, opacity: 0.25 });
    this._fungiLines     = new THREE.LineSegments(geo, mat);
    this._fungiPositions = positions;
    this.scene.add(this._fungiLines);

    // Precompute nearest eDNA for each species (by angle)
    this._fungiConnections = [];
    for (let si = 0; si < 5; si++) {
      const sa   = SPECIES_ANGLES[si];
      const dists = EDNA_ANGLES.map((ea, ei) => ({
        ei,
        dist: Math.abs(((ea - sa + Math.PI * 3) % (Math.PI * 2)) - Math.PI),
      }));
      dists.sort((a, b) => a.dist - b.dist);
      this._fungiConnections.push(dists[0].ei, dists[1].ei);
    }
  }

  // ─── CONSENSUS CORE (center sphere) ───
  buildConsensusCore() {
    // Outer wireframe sphere pulsing with consensus
    const geo = new THREE.IcosahedronGeometry(0.7, 2);
    const mat = new THREE.MeshBasicMaterial({
      color: AMBER_BRIGHT,
      wireframe: true,
      transparent: true,
      opacity: 0.5,
    });
    this._consensusMesh = new THREE.Mesh(geo, mat);
    this.scene.add(this._consensusMesh);

    // Inner core — solid glowing sphere
    const innerGeo = new THREE.SphereGeometry(0.3, 12, 8);
    const innerMat = new THREE.MeshPhongMaterial({
      color: AMBER,
      emissive: AMBER,
      emissiveIntensity: 1.0,
      transparent: true,
      opacity: 0.8,
    });
    this._consensusCore = new THREE.Mesh(innerGeo, innerMat);
    this.scene.add(this._consensusCore);

    // Lissajous figure (AI) — floats slightly above center
    const lissPts = [];
    for (let i = 0; i <= 256; i++) {
      const t = (i / 256) * Math.PI * 2;
      lissPts.push(new THREE.Vector3(Math.sin(3 * t) * 0.6, Math.sin(2 * t) * 0.6, Math.cos(t) * 0.2));
    }
    const lissGeo = new THREE.BufferGeometry().setFromPoints(lissPts);
    const lissMat = new THREE.LineBasicMaterial({ color: AMBER_BRIGHT, transparent: true, opacity: 0.8 });
    this._lissajousLine  = new THREE.Line(lissGeo, lissMat);
    this._lissajousPos   = lissGeo.attributes.position.array;
    this._lissajousLine.position.z = 0.5;
    this.scene.add(this._lissajousLine);
  }

  // ─── MAIN UPDATE LOOP ───
  updateStage() {
    const state   = this.parliamentState;
    const elapsed = this.clock.getElapsedTime();
    const dt      = this.clock.getDelta ? 0.016 : 0.016; // fixed ~60fps step

    const phase      = state ? state.phase      : (elapsed / 120) % 1;
    const consensus  = state ? state.consensus  : 0.5 + Math.sin(elapsed * 0.3) * 0.3;
    const consensusW = state ? state.consensusWave : 0.5;

    // ─── Auto-rotate camera (modulated by consensus) ───
    this.controls.autoRotateSpeed = 0.2 + consensus * 0.5;

    // ─── Point light: pulse with consensus wave ───
    this._ptLight.intensity = 0.8 + consensusW * 1.2;

    // ─── FFT: use external bins from entry, fallback to autonomous ───
    const fftBins = this._fftBinsExternal || buildFftBins(state, elapsed);

    // ─── FFT ring bars ───
    const N   = this._fftNumBars;
    const R   = this._fftRingR;
    const MH  = this._fftMaxBarH;
    const pos = this._fftPositions;
    for (let i = 0; i < N; i++) {
      const a   = (i / N) * Math.PI * 2;
      const v   = fftBins[Math.floor((i / N) * fftBins.length)] || 0;
      const r0  = R;
      const r1  = R + v * MH;
      pos[i * 6]     = Math.cos(a) * r0;
      pos[i * 6 + 1] = Math.sin(a) * r0;
      pos[i * 6 + 2] = 0;
      pos[i * 6 + 3] = Math.cos(a) * r1;
      pos[i * 6 + 4] = Math.sin(a) * r1;
      pos[i * 6 + 5] = 0;
    }
    this._fftLines.geometry.attributes.position.needsUpdate = true;

    // ─── Species objects ───
    for (let i = 0; i < 5; i++) {
      const sp  = state ? state.species[i] : { presence: 0.5, activity: 0.5, freq: 440, votes: 0 };
      const grp = this.speciesGroups[i];
      const wfm = this.speciesMeshes[i];

      // Independent slow orbit: each species drifts at slightly different speed
      const orbitSpeed = 0.002 + i * 0.0003 + sp.activity * 0.002;
      this.speciesOrbitAngle[i] += orbitSpeed;
      const a  = this.speciesOrbitAngle[i];
      const cx = Math.cos(a) * SPECIES_R;
      const cy = Math.sin(a) * SPECIES_R;
      // Z oscillation creates 3D depth
      const cz = Math.sin(elapsed * 0.4 + i * 1.2) * 1.2;
      grp.position.set(cx, cy, cz);

      // Each geometry rotates on its own axes
      grp.rotation.x += 0.005 + sp.activity * 0.01;
      grp.rotation.y += 0.007 + sp.presence * 0.008;

      // Wireframe brightness from presence
      wfm.material.opacity  = 0.35 + sp.presence * 0.55;
      wfm.material.color.setHex(sp.activity > 0.7 ? AMBER_BRIGHT : AMBER);

      // Scale pulses at audio frequency
      const freq      = sp.freq || 440;
      const pulseRate = 0.5 + ((freq - 220) / 660) * 2;
      const pulse     = 0.5 + Math.sin(elapsed * pulseRate * Math.PI * 2) * 0.5;
      const scale     = 0.85 + sp.presence * 0.3 + pulse * sp.activity * 0.2;
      grp.scale.setScalar(scale);

      // Halo particles: opacity from activity
      this.speciesHalos[i].material.opacity = 0.2 + sp.activity * 0.6;
    }

    // ─── eDNA nodes ───
    for (let i = 0; i < 8; i++) {
      const ed  = state ? state.edna[i] : { biodiversity: 0.5, validation: 0.5 };
      const grp = this.ednaGroups[i];
      const msh = this.ednaMeshes[i];

      // Independent orbit: each at different speed + Z wobble
      this.ednaOrbitAngle[i] += this.ednaOrbitSpeed[i] * (0.7 + ed.validation * 0.6);
      const a  = this.ednaOrbitAngle[i];
      const cz = Math.sin(elapsed * 0.25 + i * 0.7) * 1.8;
      grp.position.set(Math.cos(a) * EDNA_R, Math.sin(a) * EDNA_R, cz);

      // Self-rotation
      grp.rotation.y += 0.008 + ed.biodiversity * 0.01;
      grp.rotation.z += 0.005;

      // Opacity from biodiversity
      msh.material.opacity  = 0.25 + ed.biodiversity * 0.55;
      msh.material.color.setHex(ed.validation > 0.6 ? AMBER_BRIGHT : AMBER);
    }

    // ─── Fungi lines (connect species to eDNA in 3D) ───
    let idx = 0;
    for (let si = 0; si < 5; si++) {
      const sg  = this.speciesGroups[si].position;
      for (let c = 0; c < 2; c++) {
        const ei = this._fungiConnections[si * 2 + c];
        const eg = this.ednaGroups[ei].position;
        this._fungiPositions[idx++] = sg.x;
        this._fungiPositions[idx++] = sg.y;
        this._fungiPositions[idx++] = sg.z;
        this._fungiPositions[idx++] = eg.x;
        this._fungiPositions[idx++] = eg.y;
        this._fungiPositions[idx++] = eg.z;
      }
    }
    this._fungiLines.geometry.attributes.position.needsUpdate = true;
    const avgConn = state ? state.fungi.reduce((s, f) => s + f.connectivity, 0) / 4 : 0.5;
    this._fungiLines.material.opacity = 0.08 + avgConn * 0.35;

    // ─── Consensus core ───
    const coreScale = 0.8 + consensus * 0.6;
    this._consensusMesh.scale.setScalar(coreScale);
    this._consensusMesh.rotation.y += 0.005 + consensus * 0.01;
    this._consensusMesh.rotation.x += 0.003;
    this._consensusMesh.material.opacity = 0.25 + consensus * 0.45;

    this._consensusCore.scale.setScalar(0.5 + consensusW * 0.8);
    this._ptLight.position.set(
      Math.sin(elapsed * 0.3) * 1.5,
      Math.cos(elapsed * 0.4) * 1.5,
      4
    );

    // ─── Lissajous (AI) ───
    const ai     = state ? state.ai : { consciousness: 0.5, optimization: 64 };
    const a_rat  = 2 + Math.round(ai.consciousness * 3); // 2-5
    const delta  = (ai.optimization / 127) * Math.PI + elapsed * 0.25;
    const lScale = 0.55 + ai.consciousness * 0.2;
    const lPos   = this._lissajousPos;
    const lSegs  = lPos.length / 3 - 1;
    for (let i = 0; i <= lSegs; i++) {
      const t  = (i / lSegs) * Math.PI * 2;
      lPos[i * 3]     = Math.sin(a_rat * t + delta) * lScale;
      lPos[i * 3 + 1] = Math.sin(3 * t) * lScale;
      lPos[i * 3 + 2] = Math.cos(t * 2) * lScale * 0.4;
    }
    this._lissajousLine.geometry.attributes.position.needsUpdate = true;
    this._lissajousLine.material.opacity = 0.5 + ai.consciousness * 0.4;
    this._lissajousLine.rotation.y = elapsed * 0.1;

    // ─── Vote event: flash ───
    if (state && state.events.voteResult) {
      const passed = state.events.voteResult.passed;
      for (const grp of this.speciesGroups) {
        grp.children[1].material.color.setHex(passed ? AMBER_BRIGHT : AMBER_DIM);
      }
      parliamentStore.consumeEvents();
    }
  }

  static methods = [...BaseThreeJsModule.methods];

  destroy() {
    parliamentStore.disconnect();
    super.destroy();
  }
}

ParliamentStage.moduleName = "ParliamentStage";
ParliamentStage.moduleDescription = "Parliament of All Things — 3D telemetry stage";

export default ParliamentStage;
