// RingStageBase.ts
// What the three ring stages (slot 0 nested clocks, slot O reference, slot T
// taxon lanes) share: the renderer and its passes, a camera that can be taken
// right down onto a day tile, the per-frame read of the engine, the label
// overlay and the status line.
//
// The contract with parliamentEntry.ts is kept field for field. applySonethToViz
// and the /parliament/consensus bypass write straight into these names on
// whatever stage is active (_bloom, _afterimage, _chromaPass, _filmPass,
// _ptLight, _smoothConsensus, _sonethTimeScale…), so every ring stage answers
// them the way slot 0 always has. The difference is that the FX are rebuilt
// every frame from consensus, sonETH and zoom, so a direct write is a nudge
// that the next frame settles, not a latch.
//
// The look is the reference's: crisp white on black, hairline rings, one warm
// playhead. Bloom, trails, split and grain are kept but pared right back, and
// they fade as the camera closes in — at the distance where someone is reading
// a day's spectrum, nothing may smear it.

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { AfterimagePass } from "three/examples/jsm/postprocessing/AfterimagePass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { FilmPass } from "three/examples/jsm/postprocessing/FilmPass.js";
import { VignetteShader } from "three/examples/jsm/shaders/VignetteShader.js";
import { BaseThreeJsModule } from "../helpers/threeBase";
import { animationManager } from "../helpers/animationManager";
import parliamentStore from "../parliament/parliamentStore";
import { LiveFeeds } from "./liveFeeds";
import { RingLabels, type LabelSpec } from "./ringLabels";
import { getPhenoData, loadPhenoData, type PhenoData } from "./phenoData";
import { ChromaticAberrationShader, ColorGradeShader } from "./postfx";
import { approach, lerp, smoothstep } from "./ringMath";
import type { OrbParams } from "./orbiters";
import { getYearMemory } from "./polarSpectrogram";

export const BG = 0x000804;

/** fitRadius: the world radius (labels included) the default view must show whole. */
export type ViewSpec = { fitRadius: number; polarDeg: number; azimuthDeg: number };

type Flight = {
  t0: number; dur: number;
  fromPos: THREE.Vector3; toPos: THREE.Vector3;
  fromTgt: THREE.Vector3; toTgt: THREE.Vector3;
};

export class RingStageBase extends BaseThreeJsModule {
  /** parliamentEntry hides its five legacy seat labels for a stage that draws its own. */
  ownsLabels = true;

  // ── Written by parliamentEntry (see header) ─────────────────────────────
  _fftBinsExternal: Float32Array | null = null;
  _fftSourceExternal: string | null = null;
  _sonethVolume = 0.5;
  _sonethMasterAmp = 0.7;
  _sonethTimeScale = 0.3;
  _sonethPitchZ = 0.5;
  _sonethHarmonicLiss = 0.5;
  _sonethDroneDepth = 0.4;
  _sonethTxInfluence = 0;
  _phenoOpacityFloor = 0;
  _smoothConsensus = 0.5;
  _smoothTurbulence = 0;
  _smoothWarmth = 0.5;
  _smoothEmergency = 0;

  _composer: EffectComposer | null = null;
  _bloom: UnrealBloomPass | null = null;
  _afterimage: AfterimagePass | null = null;
  _chromaPass: ShaderPass | null = null;
  _filmPass: FilmPass | null = null;
  _colorGradePass: ShaderPass | null = null;
  _vignettePass: ShaderPass | null = null;
  _ptLight: THREE.PointLight | null = null;

  feeds = new LiveFeeds();
  labels: RingLabels | null = null;
  overlayEl: HTMLDivElement | null = null;
  statusEl: HTMLDivElement | null = null;
  defaultView: ViewSpec = { fitRadius: 9.8, polarDeg: 10, azimuthDeg: 0 };
  /** Where the default view looks. The dials look at their centre; slot 1's
   *  landscape looks into its middle distance. */
  viewTarget = new THREE.Vector3(0, 0, 0);

  voteFlash = 0;
  voteAlarm = false;

  private _clock = new THREE.Clock();
  private _lastT = 0;
  private _flight: Flight | null = null;
  private _interacting = false;
  private _idleUntil = 0;
  private _statusAt = 0;
  private _lastVoteAt = 0;
  private _ro: ResizeObserver | null = null;
  private _onStart: (() => void) | null = null;
  private _onEnd: (() => void) | null = null;
  private _onDbl: ((e: MouseEvent) => void) | null = null;
  private _lastNear = 0;

  /** Height of the dome's seat above the dial (world units; the year ring is r ≈ 6–9). */
  static readonly DOME_EYE_HEIGHT = 2.4;

  constructor(container: HTMLElement) {
    super(container);

    // The base class feeds autoRotateSpeed from __vizMotion on a 200 ms timer,
    // which would fight the per-frame value below once every fifth of a second.
    if (this._autoRotateTimer) { clearInterval(this._autoRotateTimer); this._autoRotateTimer = null; }

    this.renderer.setClearColor(BG, 1);
    this.renderer.toneMapping = THREE.NoToneMapping;

    this.camera.fov = 45;
    this.camera.near = 0.05;
    this.camera.far = 400;
    this.camera.updateProjectionMatrix();

    const c = this.controls;
    c.enabled = true;
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.enablePan = true;
    c.screenSpacePanning = true;
    c.zoomToCursor = true;
    c.minDistance = 0.03;
    c.maxDistance = 90;
    c.zoomSpeed = 1.2;
    c.autoRotate = true;
    c.autoRotateSpeed = 0;

    // A light for anything that is not self-lit; the rings are.
    this._ptLight = new THREE.PointLight(0xffcc88, 0.8, 40);
    this._ptLight.position.set(0, 6, 0);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.3));
    this.scene.add(this._ptLight);

    // ── In the dome: the audience at the centre of the dial ────────────────
    // The flat screen looks at the rings from outside, so on a dome they were
    // a small disc in front. In the dome the seat is just above the dial's
    // centre, looking DOWN (zenith −Y): the dial becomes the sky. The year
    // ring lands ~15–20° above the horizon, the inner clocks (the now, the
    // strike, the core) open toward the zenith. Front is six o'clock (+Z), so
    // the domemaster reads like the flat dial seen from above — twelve
    // o'clock at the back, east and west where they are on screen. The eye
    // sits clear of the highest layer (the core, y 0.5). See
    // dome/domemaster.ts setBasisWorld.
    this.scene.userData.domeEye = new THREE.Vector3(0, RingStageBase.DOME_EYE_HEIGHT, 0);
    this.scene.userData.domeUp = new THREE.Vector3(0, -1, 0);
    this.scene.userData.domeForward = new THREE.Vector3(0, 0, 1);

    // ── Passes ─────────────────────────────────────────────────────────────
    const w = container.offsetWidth || 1280;
    const h = container.offsetHeight || 720;
    this._composer = new EffectComposer(this.renderer);
    this._composer.addPass(new RenderPass(this.scene, this.camera));
    this._bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.3, 0.35, 0.5);
    this._composer.addPass(this._bloom);
    this._afterimage = new AfterimagePass(0.5);
    this._composer.addPass(this._afterimage);
    this._chromaPass = new ShaderPass(ChromaticAberrationShader);
    this._composer.addPass(this._chromaPass);
    this._filmPass = new FilmPass(0.0, false);
    this._composer.addPass(this._filmPass);
    this._colorGradePass = new ShaderPass(ColorGradeShader);
    this._composer.addPass(this._colorGradePass);
    // Last pass straight to the screen, with no OutputPass: slot 0's colours
    // have always been authored as display values, and an sRGB encode on top
    // lifts the #000804 ground to a grey-green haze.
    // VignetteShader mixes toward (1 − darkness), so darkness must stay above
    // 1 to darken the edges at all; below it, the corners go grey.
    this._vignettePass = new ShaderPass(VignetteShader);
    this._vignettePass.uniforms.offset.value = 1.0;
    this._vignettePass.uniforms.darkness.value = 1.15;
    this._vignettePass.renderToScreen = true;
    this._composer.addPass(this._vignettePass);

    // ── Overlay: labels and the status line ────────────────────────────────
    this.overlayEl = document.createElement("div");
    this.overlayEl.className = "ring-overlay";
    container.appendChild(this.overlayEl);
    this.labels = new RingLabels(this.overlayEl);
    this.statusEl = document.createElement("div");
    this.statusEl.className = "ring-status";
    this.overlayEl.appendChild(this.statusEl);

    // ── Interaction ────────────────────────────────────────────────────────
    // Auto-rotation pauses the moment a hand is on the view and waits twenty
    // seconds after it leaves: nobody can read a day tile that is turning.
    this._onStart = () => { this._interacting = true; this._flight = null; };
    this._onEnd = () => { this._interacting = false; this._idleUntil = performance.now() + 20000; };
    c.addEventListener("start", this._onStart);
    c.addEventListener("end", this._onEnd);
    this._onDbl = (e: MouseEvent) => this.flyToScreen(e);
    this.renderer.domElement.addEventListener("dblclick", this._onDbl);

    if (typeof ResizeObserver !== "undefined") {
      this._ro = new ResizeObserver(() => this.onWindowResize());
      this._ro.observe(container);
    }
  }

  /** Subclasses call this last in their constructor, once their scene exists. */
  start(): void {
    this.resetView(false);
    parliamentStore.connect();
    loadPhenoData().then((d) => { if (!this.destroyed) this.onPhenoData(d); });
    if (getPhenoData()) this.onPhenoData(getPhenoData() as PhenoData);
    this.setCustomAnimate(() => this.frame());
    if (!this.isInitialized) {
      this.isInitialized = true;
      animationManager.subscribe(this.animate);
    }
  }

  // ── Hooks ──────────────────────────────────────────────────────────────
  onPhenoData(_data: PhenoData): void { /* subclass */ }
  updateRings(_dt: number, _t: number, _data: PhenoData | null): void { /* subclass */ }
  collectLabels(_add: (s: LabelSpec) => void, _data: PhenoData | null): void { /* subclass */ }
  statusExtra(): string { return ""; }
  disposeRings(): void { /* subclass */ }

  render(): void {
    if (this.destroyed || !this.renderer) return;
    if (this._composer) this._composer.render();
    else super.render();
  }

  onWindowResize(): void {
    if (!this.renderer || !this.camera || this.destroyed || !this.elem) return;
    const w = this.elem.offsetWidth, h = this.elem.offsetHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this._composer) this._composer.setSize(w, h);
  }

  // ── Camera ─────────────────────────────────────────────────────────────
  resetView(animate = true): void {
    if (!this.camera || !this.controls) return;
    const v = this.defaultView;
    // Fit the dial to the narrower side: the centre column is often portrait,
    // and a distance chosen for the height alone clips the rings at the sides.
    const half = Math.tan(((this.camera.fov / 2) * Math.PI) / 180);
    const dist = (v.fitRadius / half / Math.min(1, this.camera.aspect || 1)) * 1.03;
    const ph = (v.polarDeg * Math.PI) / 180, th = (v.azimuthDeg * Math.PI) / 180;
    const toTgt = this.viewTarget.clone();
    const toPos = new THREE.Vector3(
      dist * Math.sin(ph) * Math.sin(th),
      dist * Math.cos(ph),
      dist * Math.sin(ph) * Math.cos(th)
    ).add(toTgt);
    if (!animate) {
      this.camera.position.copy(toPos);
      this.controls.target.copy(toTgt);
      this.camera.lookAt(toTgt);
      this.controls.update();
      return;
    }
    this.fly(toPos, toTgt, 0.9);
  }

  private fly(toPos: THREE.Vector3, toTgt: THREE.Vector3, dur: number): void {
    this._flight = {
      t0: performance.now() / 1000, dur,
      fromPos: this.camera.position.clone(), toPos,
      fromTgt: this.controls.target.clone(), toTgt,
    };
    this._idleUntil = performance.now() + 20000;
  }

  /** Double-click: fly to the point under the cursor on the dial, and closer. */
  private flyToScreen(e: MouseEvent): void {
    if (!this.camera || !this.renderer) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.1), hit)) return;
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    const dist = Math.max(0.35, this.camera.position.distanceTo(this.controls.target) * 0.3);
    this.fly(hit.clone().add(dir.multiplyScalar(dist)), hit, 0.8);
  }

  /** Distance of the default whole-dial view at the current aspect. */
  defaultDistance(): number {
    const half = Math.tan(((this.camera?.fov ?? 45) / 2) * Math.PI / 180);
    return (this.defaultView.fitRadius / half / Math.min(1, this.camera?.aspect || 1)) * 1.03;
  }

  cameraDistance(): number {
    return this.camera && this.controls ? this.camera.position.distanceTo(this.controls.target) : 20;
  }

  private updateCamera(dt: number): void {
    const c = this.controls;
    const now = performance.now();
    if (this._flight) {
      const f = this._flight;
      const k = smoothstep(0, 1, (now / 1000 - f.t0) / f.dur);
      this.camera.position.lerpVectors(f.fromPos, f.toPos, k);
      c.target.lerpVectors(f.fromTgt, f.toTgt, k);
      if (k >= 1) this._flight = null;
    }
    const drift = this.feeds.vizDrift * (30 / Math.PI);
    c.autoRotateSpeed = (0.2 + this._smoothConsensus * 0.5 + drift) * 0.3;
    c.autoRotate = !this._interacting && !this._flight && now > this._idleUntil;

    // Near plane follows the distance, so the camera can be taken to a few
    // hundredths of a unit from a tile without the tile being clipped away.
    const d = this.cameraDistance();
    const near = Math.max(0.0005, Math.min(0.2, d * 0.004));
    if (Math.abs(near - this._lastNear) > this._lastNear * 0.05) {
      this._lastNear = near;
      this.camera.near = near;
      this.camera.far = Math.max(200, d * 10);
      this.camera.updateProjectionMatrix();
    }
    void dt;
  }

  // ── Per frame ──────────────────────────────────────────────────────────
  private frame(): void {
    if (this.destroyed || !this.camera || !this.renderer) return;
    const t = this._clock.getElapsedTime();
    const dt = Math.min(0.1, Math.max(0.001, t - this._lastT));
    this._lastT = t;

    this.feeds.update(this);

    const st = parliamentStore.state;
    const cons = this.feeds.consensus;
    const votes = st ? st.votes || 0 : 0;
    const k = approach(dt, 0.45);
    this._smoothConsensus += (cons - this._smoothConsensus) * k;
    this._smoothTurbulence += (Math.pow(1 - cons, 2) - this._smoothTurbulence) * k;
    this._smoothWarmth += (0.25 + cons * 0.75 - this._smoothWarmth) * k;
    this._smoothEmergency += (Math.max(0, (1 - cons) * Math.min(1, votes / 10) - 0.2) - this._smoothEmergency) * k;

    // A vote reads as an event: a decaying flash, alarm-red for the failing kinds.
    const ev = (window as unknown as { __voteEvent?: { time: number; type: string } }).__voteEvent;
    if (ev && ev.time !== this._lastVoteAt) {
      this._lastVoteAt = ev.time;
      this.voteFlash = 1;
      this.voteAlarm = ev.type === "failed" || ev.type === "emergency" || ev.type === "stop";
    }
    this.voteFlash *= Math.exp(-dt * 1.6);

    this.updateCamera(dt);
    const data = getPhenoData();
    this.updateRings(dt, t, data);
    this.updateFx();

    if (this.labels && this.elem) {
      this.labels.begin();
      this.collectLabels((s) => this.labels!.add(s), data);
      this.labels.end(this.camera, this.elem.offsetWidth, this.elem.offsetHeight);
    }
    if (t - this._statusAt > 0.25) { this._statusAt = t; this.updateStatus(); }
    getYearMemory().maybeSave();
  }

  private updateFx(): void {
    const dist = this.cameraDistance();
    // FX fade by how close the camera is relative to the whole-dial view.
    const zf = smoothstep(0.12, 0.65, dist / Math.max(1, this.defaultDistance()));
    const consLum = this._smoothConsensus * 0.5;
    const f = this.feeds;
    if (this._bloom) {
      this._bloom.strength = (0.16 + consLum * 0.5 + this.voteFlash * 0.5) * (0.2 + 0.8 * zf);
      this._bloom.radius = 0.35;
      this._bloom.threshold = lerp(0.55, 0.42, consLum);
    }
    if (this._afterimage) {
      // Trails smear a spectrogram; below reading distance they are off.
      this._afterimage.enabled = dist > this.defaultDistance() * 0.35;
      const atmo = f.soneth("atmospheremix", 0.5);
      this._afterimage.uniforms.damp.value = (0.35 + atmo * 0.35) * zf;
    }
    if (this._chromaPass) this._chromaPass.uniforms.amount.value = this._smoothTurbulence * 0.004 * zf;
    if (this._filmPass?.uniforms?.intensity) {
      const co2 = parliamentStore.state ? (parliamentStore.state.eco?.co2 || 0) / 127 : 0;
      this._filmPass.uniforms.intensity.value =
        (co2 * 0.15 + f.soneth("texturedepth", 0.3) * 0.12) * (0.3 + 0.7 * zf);
    }
    if (this._colorGradePass) {
      this._colorGradePass.uniforms.warmth.value = 0.35 + this._smoothConsensus * 0.3;
      this._colorGradePass.uniforms.emergency.value =
        Math.max(this._smoothEmergency, this.voteAlarm ? this.voteFlash * 0.6 : 0);
    }
    if (this._vignettePass) {
      this._vignettePass.uniforms.darkness.value = 1.1 + this._smoothEmergency * 1.0;
    }
  }

  /** The values orbiters take from the engine's faders. */
  orbParams(): OrbParams {
    const f = this.feeds;
    const td = f.soneth("timedilation", this._sonethTimeScale);
    const amp = f.soneth("masteramp", this._sonethMasterAmp);
    const vol = f.soneth("volume", this._sonethVolume);
    return {
      consensus: this._smoothConsensus,
      timeScale: Math.max(0.1, 1.5 - td * 1.3),
      pitchZ: f.soneth("pitchshift", this._sonethPitchZ),
      level: (0.55 + amp * 0.6) * (0.6 + vol * 0.8),
      bow: f.soneth("harmonicrich", this._sonethHarmonicLiss),
    };
  }

  private updateStatus(): void {
    if (!this.statusEl) return;
    const f = this.feeds;
    const ring = f.cursorLive
      ? `ANILLO SC · DOY ${f.doy} · ${f.temporada.replace(/_/g, " ")} · ` +
        (f.dayClips > 0 ? `${f.dayClips} clip${f.dayClips === 1 ? "" : "s"}` : `ausencia ${f.gap}d`) +
        ` · quórum ${f.quorum.toFixed(2)} · ${f.secsPerDay.toFixed(f.secsPerDay < 10 ? 1 : 0)} s/día`
      : `RELOJ CIVIL · DOY ${f.civil} · anillo SC sin señal`;
    const bus = f.masterSource === "sc" ? "BUS SC" : f.masterSource === "mic" ? "BUS MIC" : "BUS sin señal";
    const corpus = f.corpusLive ? "CORPUS vivo" : "CORPUS —";
    const extra = this.statusExtra();
    const text = [ring, `${bus} · ${corpus}`, extra].filter(Boolean).join("\n");
    if (this.statusEl.textContent !== text) this.statusEl.textContent = text;
    this.statusEl.classList.toggle("stale", !f.cursorLive);
  }

  destroy(): void {
    if (this.destroyed) return;
    try { getYearMemory().maybeSave(true); } catch { /* ignore */ }
    const c = this.controls;
    if (c) {
      if (this._onStart) c.removeEventListener("start", this._onStart);
      if (this._onEnd) c.removeEventListener("end", this._onEnd);
    }
    if (this._onDbl && this.renderer) this.renderer.domElement.removeEventListener("dblclick", this._onDbl);
    this._ro?.disconnect();
    this._ro = null;
    try { this.disposeRings(); } catch (e) { console.warn("[rings] disposeRings:", e); }
    this.labels?.dispose();
    this.labels = null;
    this.overlayEl?.remove();
    this.overlayEl = null;
    this.statusEl = null;
    if (this._composer) {
      for (const p of this._composer.passes || []) { try { p.dispose?.(); } catch { /* ignore */ } }
      try { this._composer.dispose?.(); } catch { /* ignore */ }
    }
    // Plain references only; nothing shared is held in a field (see phenoData).
    this.feeds = null as unknown as LiveFeeds;
    super.destroy();
  }
}

