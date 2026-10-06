// domeSeat.ts — the audience's seat inside a slot's world, for the dome
// ===========================================================================
// The domemaster normally films a slot from the slot's own camera, slid
// forward by "inmersión": a world built to be looked AT ends up as a patch in
// front. A slot built to be sat INSIDE names the seat instead
// (scene.userData.domeEye / domeUp / domeForward, see domemaster.ts
// renderFrame). This sets those three from a group of the slot's own, every
// time the scene is drawn: if the world tilts, spins or is carried by the
// performer's orbit, the seat goes with it, and the dome stays oriented to
// the world rather than to the screen.
//
//   eye      where the audience sits, in the group's coordinates
//   up       the zenith, as a direction in the group's coordinates
//   forward  what lies in front (the domemaster's bottom edge)

import * as THREE from "three";

export type SeatSpec = { eye: THREE.Vector3; up: THREE.Vector3; forward: THREE.Vector3 };

/** Seat the dome inside `scene`, in the coordinates of `group` (or of the scene itself when null). */
export function installDomeSeat(scene: THREE.Scene, group: THREE.Object3D | null, spec: SeatSpec) {
  const eye = new THREE.Vector3(), up = new THREE.Vector3(), fwd = new THREE.Vector3();
  const set = () => {
    eye.copy(spec.eye); up.copy(spec.up); fwd.copy(spec.forward);
    if (group) {
      eye.applyMatrix4(group.matrixWorld);
      up.transformDirection(group.matrixWorld);
      fwd.transformDirection(group.matrixWorld);
    }
    scene.userData.domeEye = eye;
    scene.userData.domeUp = up;
    scene.userData.domeForward = fwd;
  };
  set();
  // Every draw — the slot's own included, which runs first each frame and
  // has just brought the group's matrixWorld up to date.
  const prev = scene.onBeforeRender;
  scene.onBeforeRender = function (...args: any[]) {
    set();
    return (prev as any).apply(this, args);
  };
}
