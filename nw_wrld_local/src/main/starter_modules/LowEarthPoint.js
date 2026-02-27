/*
@nwWrld name: LowEarthPoint
@nwWrld category: 3D
@nwWrld imports: BaseThreeJsModule, THREE
*/

const sampleN = (arr, n) => {
  if (!arr || arr.length === 0) return [];
  const copy = arr.slice();
  const out = [];
  const count = Math.max(0, Math.min(copy.length, n));
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy[idx]);
    copy.splice(idx, 1);
  }
  return out;
};

const clearThreeGroup = (group) => {
  if (!group) return;
  group.children.forEach((child) => {
    try {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m && m.dispose && m.dispose());
        } else {
          child.material.dispose && child.material.dispose();
        }
      }
    } catch { }
  });
  group.clear();
};

const createQuadraticBezierLineSegments = ({
  THREE,
  points,
  count,
  color,
  opacity,
  midZScale = 1,
}) => {
  const n = Math.max(0, Math.min(points?.length || 0, count || 0));
  if (n < 2) return null;

  const segmentsPerCurve = 5;
  const totalPairs = (n * (n - 1)) / 2;
  const totalSegments = totalPairs * segmentsPerCurve;
  const positions = new Float32Array(totalSegments * 6);

  let idx = 0;

  for (let i = 0; i < n; i++) {
    const start = points[i];
    const sx = start.x;
    const sy = start.y;
    const sz = start.z;

    for (let j = i + 1; j < n; j++) {
      const end = points[j];
      const ex = end.x;
      const ey = end.y;
      const ez = end.z;

      const mx = (sx + ex) / 2;
      const my = (sy + ey) / 2;
      const mz = ((sz + ez) / 2) * midZScale;

      let px = sx;
      let py = sy;
      let pz = sz;

      for (let s = 1; s <= segmentsPerCurve; s++) {
        const t = s / segmentsPerCurve;
        const it = 1 - t;
        const a = it * it;
        const b = 2 * it * t;
        const c = t * t;

        const cx = a * sx + b * mx + c * ex;
        const cy = a * sy + b * my + c * ey;
        const cz = a * sz + b * mz + c * ez;

        positions[idx++] = px;
        positions[idx++] = py;
        positions[idx++] = pz;
        positions[idx++] = cx;
        positions[idx++] = cy;
        positions[idx++] = cz;

        px = cx;
        py = cy;
        pz = cz;
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color,
    linewidth: 1,
    opacity,
    transparent: true,
  });
  return new THREE.LineSegments(geometry, material);
};

class LowEarthPointModule extends BaseThreeJsModule {
  static methods = [
    {
      name: "primary",
      executeOnLoad: false,
      options: [
        {
          name: "duration",
          defaultVal: 500,
          type: "number",
          unit: "ms",
          min: 0,
        },
      ],
    },
  ];

  constructor(container) {
    super(container);
    if (!THREE) return;

    this.name = LowEarthPointModule.name;
    this.customGroup = new THREE.Group();
    this.customObjects = [];
    this.points = [];
    this.redPoints = [];
    this.linesGroup = new THREE.Group();
    this.redLinesGroup = new THREE.Group();
    this.customGroup.add(this.linesGroup);
    this.customGroup.add(this.redLinesGroup);
    this.pointCloud = null;
    this.redPointCloud = null;
    this._bridgeWS = null;
    this._bridgeReady = false;

    // Modulation parameters from SC sliders
    this.p_colorHueOff = 0;
    this.p_scaleObj = 1.0;
    this.p_opacity = 0.1;
    this.p_speedOff = 0;
    this.p_zScale = 1.0;

    this.primary = this.primary.bind(this);
    this.setCustomAnimate(this.animateLoop.bind(this));

    this._connectBridge();
    this.init();
  }

  init() {
    if (this.destroyed) return;
    this.createPoints();
    this.createRedPoints();
    this.createLines();
    this.createRedLines();
    this.setModel(this.customGroup);
  }

  createPoints() {
    if (this.destroyed) return;

    const geometry = new THREE.BufferGeometry();
    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.05,
    });
    const positions = [];

    const count = 500;
    for (let i = 0; i < count; i++) {
      const x = Math.random() * 10 - 5;
      const y = Math.random() * 10 - 5;
      const z = Math.random() * 10 - 5;
      positions.push(x, y, z);
      this.points.push(new THREE.Vector3(x, y, z));
    }

    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3)
    );

    this.pointCloud = new THREE.Points(geometry, material);
    this.customGroup.add(this.pointCloud);
    this.customObjects.push(this.pointCloud);
  }

  createRedPoints() {
    if (this.destroyed) return;

    const redGeometry = new THREE.BufferGeometry();
    const redMaterial = new THREE.PointsMaterial({
      color: 0xff0000,
      size: 0.045,
    });
    const redPositions = [];

    const count = 250;
    for (let i = 0; i < count; i++) {
      const x = (Math.random() * 10 - 5) * 0.5;
      const y = (Math.random() * 10 - 5) * 0.5;
      const z = (Math.random() * 10 - 5) * 0.5;
      redPositions.push(x, y, z);
      this.redPoints.push(new THREE.Vector3(x, y, z));
    }

    redGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(redPositions, 3)
    );

    this.redPointCloud = new THREE.Points(redGeometry, redMaterial);
    this.customGroup.add(this.redPointCloud);
    this.customObjects.push(this.redPointCloud);
  }

  createLines() {
    if (this.destroyed) return;

    clearThreeGroup(this.linesGroup);
    const halfPointIndex = Math.floor(this.points.length / 3);
    const lineSegments = createQuadraticBezierLineSegments({
      THREE,
      points: this.points,
      count: halfPointIndex,
      color: new THREE.Color().setHSL(this.p_colorHueOff, 0.5, 0.5).getHex(),
      opacity: this.p_opacity,
      midZScale: this.p_zScale,
    });
    if (lineSegments) {
      this.linesGroup.add(lineSegments);
      this.customObjects.push(lineSegments);
    }
  }

  createRedLines() {
    if (this.destroyed) return;

    clearThreeGroup(this.redLinesGroup);
    const halfRedPointIndex = Math.floor(this.redPoints.length / 2);
    const redLineSegments = createQuadraticBezierLineSegments({
      THREE,
      points: this.redPoints,
      count: halfRedPointIndex,
      color: new THREE.Color().setHSL((this.p_colorHueOff + 0.5) % 1.0, 1.0, 0.5).getHex(),
      opacity: this.p_opacity * 1.5,
      midZScale: this.p_zScale * 2,
    });
    if (redLineSegments) {
      this.redLinesGroup.add(redLineSegments);
      this.customObjects.push(redLineSegments);
    }
  }

  animateLoop() {
    if (this.destroyed) return;

    const baseSpeed = this.cameraSettings.cameraSpeed + this.p_speedOff;

    if (this.pointCloud) {
      this.pointCloud.rotation.x += 0.0005 * baseSpeed;
      this.pointCloud.rotation.y += 0.0005 * baseSpeed;
      this.pointCloud.scale.setScalar(this.p_scaleObj);
    }

    if (this.redPointCloud) {
      this.redPointCloud.rotation.x += 0.0003 * baseSpeed;
      this.redPointCloud.rotation.y += 0.0003 * baseSpeed;
      this.redPointCloud.scale.setScalar(this.p_scaleObj);
    }

    this.linesGroup.rotation.x += 0.0003 * baseSpeed;
    this.linesGroup.rotation.y += 0.0003 * baseSpeed;
    this.linesGroup.scale.setScalar(this.p_scaleObj);

    this.redLinesGroup.rotation.x += 0.0003 * baseSpeed;
    this.redLinesGroup.rotation.y += 0.0003 * baseSpeed;
    this.redLinesGroup.scale.setScalar(this.p_scaleObj);
  }

  primary({ duration } = {}) {
    if (this.destroyed) return;

    const millis = Number(duration);
    const timeout = Number.isFinite(millis) ? Math.max(0, millis) : 500;
    const selected = sampleN(this.points, 5);
    const spheres = [];

    selected.forEach((point) => {
      const geometry = new THREE.SphereGeometry(0.09, 8, 8);
      const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(point);
      this.scene.add(mesh);
      spheres.push(mesh);
    });

    setTimeout(() => {
      spheres.forEach((mesh) => {
        this?.scene?.remove(mesh);
        try {
          mesh.geometry && mesh.geometry.dispose();
          mesh.material && mesh.material.dispose();
        } catch { }
      });
    }, timeout);
  }

  // ── Bridge WebSocket (browser → SC via parliament-bridge) ──────────────────
  _connectBridge() {
    try {
      this._bridgeWS = new WebSocket("ws://localhost:3334");
      this._bridgeWS.onopen = () => {
        this._bridgeReady = true;
        console.log(`[${this.name}] Bridge WS connected ✅`);
      };
      this._bridgeWS.onclose = () => {
        this._bridgeReady = false;
        console.warn(`[${this.name}] Bridge WS closed, retrying in 3s...`);
        setTimeout(() => this._connectBridge(), 3000);
      };
      this._bridgeWS.onerror = () => { this._bridgeReady = false; };
      this._bridgeWS.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "method-trigger" && msg.data) {
            const methodName = msg.data.channelName.replace("/ch/", "");
            if (typeof this[methodName] === "function") {
              const val = msg.data.velocity || 0;
              let options = { isRemote: true };

              if (methodName === "primary") {
                options = { duration: val * 1000, isRemote: true };
              } else if (methodName === "updateDensity") {
                options = { densityValue: val, isRemote: true };
              }

              this[methodName](options);
            }
          }
        } catch (e) { console.error(`[${this.name}] Error parsing bridge message:`, e); }
      };
    } catch (e) {
      console.warn(`[${this.name}] Could not connect to bridge:`, e);
    }
  }

  sendToSC(address, value) {
    if (!this._bridgeWS || !this._bridgeReady) return;
    this._bridgeWS.send(JSON.stringify({ direction: "toSC", address, args: [value] }));
  }

  // --- MAPPED DATA METHODS ---
  // Received from SC via /bio/density
  updateDensity({ densityValue, isRemote = false }) {
    // densityValue is mapped roughly 0.0-1.0 from SC based on Tx per second
    // Increase global rotation speed and trigger connection highlights based on density

    // Scale camera speed dynamically (1.0 is default, up to 5.0 for high density)
    const targetSpeed = 1.0 + (densityValue * 4.0);
    this.cameraSettings.cameraSpeed = targetSpeed;

    // If high density, trigger point flashes
    if (densityValue > 0.6) {
      this.primary({ duration: densityValue * 500 });
    }

    console.log(`[${this.name}] Global Density Updated: ${densityValue.toFixed(3)} -> Speed: ${targetSpeed.toFixed(2)}`);
  }

  // Reactive UI Methods (0.0 to 1.0 coming from SC Sliders)
  setVolume({ velocity }) { this.p_scaleObj = 0.5 + (velocity * 2.0); } // Scale the globe 0.5x to 2.5x
  setPitchShift({ velocity }) { this.p_speedOff = velocity * 5.0; } // Increase rotation speed
  setTimeDilation({ velocity }) { } // Already mapped globally
  setSpectralShift({ velocity }) {
    this.p_colorHueOff = velocity;
    this.createLines(); // Rebuild lines to apply color
    this.createRedLines();
  }
  setSpatialSpread({ velocity }) {
    this.p_zScale = 0.5 + (velocity * 3.0);
    this.createLines(); // Rebuild lines to apply Z spread
    this.createRedLines();
  }
  setTextureDepth({ velocity }) {
    this.p_opacity = velocity * 0.5;
    this.createLines(); // Rebuild lines to apply opacity
    this.createRedLines();
  }
  setAtmosphereMix({ velocity }) { }
  setMemoryFeed({ velocity }) { }
  setHarmonicRich({ velocity }) { }
  setResonantBody({ velocity }) { }

  destroy() {
    if (this.destroyed) return;

    this.customObjects.forEach((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach((mat) => mat.dispose());
        } else {
          obj.material.dispose();
        }
      }
      this.scene.remove(obj);
    });
    this.customObjects = [];
    this.linesGroup.clear();
    this.redLinesGroup.clear();
    super.destroy();
  }
}

export default LowEarthPointModule;
