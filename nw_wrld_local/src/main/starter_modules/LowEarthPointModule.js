// LowEarthPointModule — slot 2 visualization
// 500 white + 250 red point clouds in a 10×10×10 cube,
// connected by quadratic Bézier line segments.

import { BaseThreeJsModule } from "../../projector/helpers/threeBase";
import * as THREE from "three";

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
    } catch {}
  });
  group.clear();
};

const createQuadraticBezierLineSegments = ({
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
    const sx = start.x, sy = start.y, sz = start.z;

    for (let j = i + 1; j < n; j++) {
      const end = points[j];
      const ex = end.x, ey = end.y, ez = end.z;

      const mx = (sx + ex) / 2;
      const my = (sy + ey) / 2;
      const mz = ((sz + ez) / 2) * midZScale;

      let px = sx, py = sy, pz = sz;

      for (let s = 1; s <= segmentsPerCurve; s++) {
        const t = s / segmentsPerCurve;
        const it = 1 - t;
        const a = it * it, b = 2 * it * t, c = t * t;

        const cx = a * sx + b * mx + c * ex;
        const cy = a * sy + b * my + c * ey;
        const cz = a * sz + b * mz + c * ez;

        positions[idx++] = px; positions[idx++] = py; positions[idx++] = pz;
        positions[idx++] = cx; positions[idx++] = cy; positions[idx++] = cz;

        px = cx; py = cy; pz = cz;
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

// ─── Module ──────────────────────────────────────────────────────────────────

class LowEarthPointModule extends BaseThreeJsModule {
  static methods = [
    ...BaseThreeJsModule.methods,
    {
      name: "primary",
      executeOnLoad: false,
      options: [
        {
          name: "duration",
          defaultVal: 0,
          type: "number",
          description: "Duration for primary method animations",
        },
      ],
    },
  ];

  constructor(container) {
    super(container);

    this.customGroup   = new THREE.Group();
    this.customObjects = [];
    this.points        = [];
    this.redPoints     = [];
    this.linesGroup    = new THREE.Group();
    this.redLinesGroup = new THREE.Group();
    this.customGroup.add(this.linesGroup);
    this.customGroup.add(this.redLinesGroup);
    this.pointCloud    = null;
    this.redPointCloud = null;

    this.primary = this.primary.bind(this);
    this.setCustomAnimate(this.animateLoop.bind(this));
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
    const positions = [];
    for (let i = 0; i < 500; i++) {
      const x = Math.random() * 10 - 5;
      const y = Math.random() * 10 - 5;
      const z = Math.random() * 10 - 5;
      positions.push(x, y, z);
      this.points.push(new THREE.Vector3(x, y, z));
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    this.pointCloud = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xffffff, size: 0.05 }));
    this.customGroup.add(this.pointCloud);
    this.customObjects.push(this.pointCloud);
  }

  createRedPoints() {
    if (this.destroyed) return;
    const positions = [];
    for (let i = 0; i < 250; i++) {
      const x = (Math.random() * 10 - 5) * 0.5;
      const y = (Math.random() * 10 - 5) * 0.5;
      const z = (Math.random() * 10 - 5) * 0.5;
      positions.push(x, y, z);
      this.redPoints.push(new THREE.Vector3(x, y, z));
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    this.redPointCloud = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xff0000, size: 0.045 }));
    this.customGroup.add(this.redPointCloud);
    this.customObjects.push(this.redPointCloud);
  }

  createLines() {
    if (this.destroyed) return;
    clearThreeGroup(this.linesGroup);
    const seg = createQuadraticBezierLineSegments({
      points: this.points,
      count: Math.floor(this.points.length / 3),
      color: 0xffffff,
      opacity: 0.1,
      midZScale: 1,
    });
    if (seg) { this.linesGroup.add(seg); this.customObjects.push(seg); }
  }

  createRedLines() {
    if (this.destroyed) return;
    clearThreeGroup(this.redLinesGroup);
    const seg = createQuadraticBezierLineSegments({
      points: this.redPoints,
      count: Math.floor(this.redPoints.length / 2),
      color: 0xff0000,
      opacity: 0.15,
      midZScale: 2,
    });
    if (seg) { this.redLinesGroup.add(seg); this.customObjects.push(seg); }
  }

  animateLoop() {
    if (this.destroyed) return;
    const speed = this.cameraSettings?.cameraSpeed ?? 1;
    if (this.pointCloud)    { this.pointCloud.rotation.x += 0.0005 * speed; this.pointCloud.rotation.y += 0.0005 * speed; }
    if (this.redPointCloud) { this.redPointCloud.rotation.x += 0.0003 * speed; this.redPointCloud.rotation.y += 0.0003 * speed; }
    this.linesGroup.rotation.x    += 0.0003 * speed; this.linesGroup.rotation.y    += 0.0003 * speed;
    this.redLinesGroup.rotation.x += 0.0003 * speed; this.redLinesGroup.rotation.y += 0.0003 * speed;
  }

  primary({ duration } = {}) {
    if (this.destroyed) return;
    const millis = (Number(duration) || 0) > 0 ? Number(duration) * 1000 : 500;
    const selected = this.points.slice().sort(() => Math.random() - 0.5).slice(0, 5);
    const spheres = selected.map((point) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      mesh.position.copy(point);
      this.scene?.add(mesh);
      return mesh;
    });
    setTimeout(() => {
      spheres.forEach((mesh) => {
        this.scene?.remove(mesh);
        try { mesh.geometry?.dispose(); mesh.material?.dispose(); } catch {}
      });
    }, millis);
  }

  destroy() {
    if (this.destroyed) return;
    this.customObjects.forEach((obj) => {
      try { obj.geometry?.dispose(); } catch {}
      try {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m?.dispose());
        else obj.material?.dispose();
      } catch {}
      this.scene?.remove(obj);
    });
    this.customObjects = [];
    this.linesGroup?.clear();
    this.redLinesGroup?.clear();
    super.destroy();
  }
}

LowEarthPointModule.moduleName = "LowEarthPointModule";
export default LowEarthPointModule;
