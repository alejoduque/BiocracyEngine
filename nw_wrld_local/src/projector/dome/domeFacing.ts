// domeFacing.ts — text planes that turn to whichever camera draws them
// ===========================================================================
// A label in a slot's scene has to read twice: on the screen, from the slot's
// own camera, and on the dome, from the six cameras of the domemaster's cube.
// THREE.Sprite cannot do the second: it is laid out in the drawing camera's
// view space, and three's cube cameras draw with a −90° field of view, so
// every sprite came out turned 180° on the dome.
//
// These are planes whose matrixWorld is written in onBeforeRender — three
// calls it after the scene's matrices are updated and before it reads
// matrixWorld, so the write holds for that one draw:
//   · the screen's camera: square to it
//   · a cube face: facing the seat, upright for an audience facing the front
//     (up is the zenith at the horizon and the back at the zenith, head
//     tipped back — the domemaster's own convention, from scene.userData
//     .domeUp and .domeForward)
// Their size follows the distance, so a label keeps a readable angle.
//
// mesh.userData, read every draw:
//   aspect  width / height of the plane
//   k       extra scale (default 1)
//   ax, ay  shift, in plane widths and heights (anchor; default 0)
//   world   when set, a fixed height in world units instead of a fixed
//           angle: a label that belongs to the drawing (a stratum, a state
//           of the automaton) and grows and shrinks with it, as a Sprite did
// The geometry is labelPlane(): x from 0 to 1, y from −0.5 to 0.5, so with no
// shift the label starts at its point and is centred on it vertically.

import * as THREE from "three";

/** A label's height per unit of distance: ~1.9° on screen, ~2.3° on the dome. */
const ANGLE_FLAT = 0.033;
const ANGLE_DOME = 0.04;

const _p = new THREE.Vector3();
const _e = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _up = new THREE.Vector3();
const _s = new THREE.Vector3();

/** The plane every facing label uses (one per owner: dispose it with the owner). */
export function labelPlane(): THREE.PlaneGeometry {
  return new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0);
}

/** Make `mesh` face whichever camera draws it, at `scale` × the standard reading size. */
export function faceCamera(mesh: THREE.Mesh, scale: number): void {
  const u = mesh.userData;
  if (u.k === undefined) u.k = 1;
  if (u.aspect === undefined) u.aspect = 1;
  mesh.frustumCulled = false;
  mesh.onBeforeRender = (_r, scene, camera) => {
    const parent = mesh.parent;
    if (!parent) return;
    _p.copy(mesh.position).applyMatrix4(parent.matrixWorld);
    let dist: number, angle: number;
    if (camera.parent?.type === "CubeCamera") {
      _e.setFromMatrixPosition(camera.parent.matrixWorld);
      _z.subVectors(_e, _p);
      dist = _z.length() || 1;
      _z.divideScalar(dist);
      const zen = scene.userData?.domeUp, fwd = scene.userData?.domeForward;
      _up.copy(zen && zen.isVector3 ? zen : _y.set(0, 1, 0));
      _up.sub(fwd && fwd.isVector3 ? fwd : _y.set(0, 0, -1));
      _x.crossVectors(_up, _z);
      if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0).cross(_z);
      _x.normalize();
      _y.crossVectors(_z, _x);
      angle = ANGLE_DOME;
    } else {
      _e.setFromMatrixPosition(camera.matrixWorld);
      dist = _e.distanceTo(_p);
      _x.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
      _y.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
      _z.setFromMatrixColumn(camera.matrixWorld, 2).normalize();
      angle = ANGLE_FLAT;
    }
    // A world-size label scales with its parent, as a Sprite did.
    const h = (u.world ? u.world * _s.setFromMatrixScale(parent.matrixWorld).y : dist * angle * scale) * u.k;
    if (u.world) _x.multiplyScalar(_s.x / (_s.y || 1));
    _x.multiplyScalar(h * u.aspect);
    _y.multiplyScalar(h);
    if (u.ax) _p.addScaledVector(_x, u.ax);
    if (u.ay) _p.addScaledVector(_y, u.ay);
    mesh.matrixWorld.makeBasis(_x, _y, _z).setPosition(_p);
  };
}

// One plane for every facingLabel; never disposed (it is shared by design).
let _plane: THREE.PlaneGeometry | null = null;

/**
 * A THREE.Sprite replacement that also reads on the dome: a plane of
 * `worldW` × `worldH` world units, centred on its position, facing whichever
 * camera draws it. Sprites are laid out in the drawing camera's view space,
 * so each cube face of the domemaster drew its own piece of one — sheared
 * and split at the seams, in the dome and on its NDI feed. Dispose the
 * material (and its map) with the owner; the geometry is shared.
 */
export function facingLabel(
  map: THREE.Texture, worldW: number, worldH: number,
  opts: { opacity?: number; depthTest?: boolean; fog?: boolean } = {}
): THREE.Mesh {
  _plane ??= labelPlane();
  const mesh = new THREE.Mesh(_plane, new THREE.MeshBasicMaterial({
    map, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    depthTest: opts.depthTest ?? true, fog: opts.fog ?? false, opacity: opts.opacity ?? 1,
  }));
  mesh.userData.world = worldH;
  mesh.userData.aspect = worldW / worldH;
  mesh.userData.ax = -0.5;
  faceCamera(mesh, 1);
  return mesh;
}
