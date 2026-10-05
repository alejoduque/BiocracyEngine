// domeLayout.ts — where things sit on the dome, in the dome's own terms
// ===========================================================================
// The convention the domemaster uses (dome/domemaster.ts, setBasisWorld):
// the audience at the origin, +Y the zenith, −Z the front, +X the audience's
// right. Azimuth is measured from the front toward the right, elevation from
// the horizon up, both in degrees. A slot that authors its world this way and
// sets scene.userData.domeEye = (0,0,0) is shown on the dome exactly as laid
// out here.

import * as THREE from "three";

const DEG = Math.PI / 180;

/** The unit direction for an azimuth / elevation, degrees. */
export function domeDir(azDeg: number, elDeg: number, out = new THREE.Vector3()): THREE.Vector3 {
  const az = azDeg * DEG, el = elDeg * DEG;
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
}

/**
 * Put `obj` at an azimuth / elevation and distance, its face (+Z) turned to
 * the audience and its up along the dome's meridian, so text stands upright
 * for someone looking at it from the centre.
 */
export function placeOnDome(obj: THREE.Object3D, azDeg: number, elDeg: number, dist: number) {
  const p = domeDir(azDeg, elDeg).multiplyScalar(dist);
  obj.position.copy(p);
  // Up: toward the zenith along the meridian; straight overhead, toward the back.
  if (elDeg > 85) obj.up.copy(domeDir(azDeg, 0)).negate();
  else obj.up.set(0, 1, 0);
  obj.lookAt(0, 0, 0);
}

/** World size that subtends `deg` degrees at distance `dist`. */
export function angularSize(deg: number, dist: number): number {
  return 2 * dist * Math.tan((deg * DEG) / 2);
}
