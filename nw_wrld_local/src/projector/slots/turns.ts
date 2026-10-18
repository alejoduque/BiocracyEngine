// turns.ts — how each of the blended slots 5–9 turns
// ===========================================================================
// All five used to write `root.rotation.y = vm.angle * chain.turn * k`. The
// angle only ever grows, and `turn` is the block parity, which reverses at
// every block. So every ~12 s the whole assembly swung from +angle to −angle
// — the same swing in all five slots, larger the longer the show ran, and
// timed by sonETH's block clock rather than by anything on stage.
//
// Now each slot INTEGRATES its own turn from vizMotion.speed, which is
// ROTATION SPD (signed: left of centre turns the other way, centre stops)
// eased in by the idle ramp. The chain still leans on the rate, through
// smoothed values only, so nothing it does can jump the orientation. And each
// slot has its own way of turning, so the five no longer read as one motion:
//
//   5  gyroscope    spins about its axis while the axis itself circles
//   6  oblique      a heavy body on a leaning axis; the rate has inertia
//   7  escapement   advances in uneven ticks, each one settling on a spring
//   8  pendulum     a stack does not spin: it swings, and the swing drifts
//   9  irregular    the rate wanders, never periodic, and the ring banks
//                   into its own acceleration

import * as THREE from "three";

type Chain = { fullness: number; entropy: number };

/** One degree per second — vizMotion's BASE, the speed at ROTATION SPD 1.00x. */
const DEG = Math.PI / 180;
const Y = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _ax = new THREE.Vector3();

/** 5 · PRESENT. Spin about its own axis; the axis precesses the same way. */
export function gyroscope() {
  let spin = 0, prec = 0;
  return (root: THREE.Object3D, dt: number, speed: number, c: Chain, tilt: number) => {
    spin += speed * 2.4 * (0.75 + c.fullness * 0.5) * dt;
    prec += speed * 0.7 * dt;
    _ax.set(Math.cos(prec), 0, Math.sin(prec));
    root.quaternion.setFromAxisAngle(_ax, tilt).multiply(_q.setFromAxisAngle(Y, spin));
  };
}

/** 6 · OVERLAP. A leaning axis, and a rate that takes seconds to change. */
export function oblique() {
  const axis = new THREE.Vector3(0.24, 1, 0.13).normalize();
  let a = 0, rate = 0;
  return (root: THREE.Object3D, dt: number, speed: number, c: Chain) => {
    const target = speed * 1.9 * (0.7 + c.fullness * 0.6);
    rate += (target - rate) * (1 - Math.exp(-dt / 3.0));
    a += rate * dt;
    root.quaternion.setFromAxisAngle(axis, a);
  };
}

/** Tick sizes for 7, in degrees: uneven, so the cadence never settles into a beat. */
const TICKS = [24, 41, 17, 33, 52, 29, 13, 38].map((d) => d * DEG);

/** 7 · ADJUDICATED. One verdict at a time: the yaw steps, and settles. */
export function escapement() {
  let acc = 0, target = 0, yaw = 0, vel = 0, k = 0;
  return (dt: number, speed: number, c: Chain): number => {
    acc += speed * 3.0 * (0.8 + c.fullness * 0.4) * dt;
    const s = TICKS[k % TICKS.length];
    if (acc - target > s * 0.5) { target += s; k++; }
    else if (target - acc > s * 0.5) { target -= s; k++; }
    // Underdamped spring: each tick overshoots a little and comes back,
    // which is what a released escapement wheel does.
    const h = Math.min(dt, 1 / 30);
    vel += (16 * (target - yaw) - 4.4 * vel) * h;
    yaw += vel * h;
    return yaw;
  };
}

/** 8 · INSCRIBED. Swings about a centre that drifts slowly the slider's way. */
export function pendulum() {
  let centre = 0, ph = 0, amp = 0;
  return (dt: number, speed: number): number => {
    centre += speed * 0.45 * dt;
    // ~20 s a swing at 1.00x, quicker as the slider opens; reversed, it
    // swings the other way round.
    ph += speed * 18 * dt;
    const want = 0.30 * Math.min(1.6, Math.abs(speed) / DEG);
    amp += (want - amp) * (1 - Math.exp(-dt / 2.5));
    return centre + amp * Math.sin(ph);
  };
}

/** 9 · OPAQUE. A rate you cannot read ahead; the ring banks as it changes. */
export function irregular() {
  let yaw = 0, t = 0, rate = 0, bank = 0;
  return (root: THREE.Object3D, dt: number, speed: number, c: Chain) => {
    t += dt;
    // Three incommensurate periods (48, 88, 203 s) and the chain's entropy:
    // the sum never repeats within a show.
    const n = 0.5 + 0.25 * Math.sin(t * 0.131) + 0.15 * Math.sin(t * 0.0713 + 1.3)
      + 0.10 * Math.sin(t * 0.0309 + 4.1);
    const w = n * 0.65 + c.entropy * 0.35;
    const next = speed * 2.2 * (0.25 + 1.5 * w);
    const accel = (next - rate) / Math.max(dt, 1e-3);
    rate = next;
    yaw += rate * dt;
    bank += (THREE.MathUtils.clamp(accel * 6, -0.08, 0.08) - bank) * (1 - Math.exp(-dt / 1.2));
    root.rotation.set(0, yaw, bank);
  };
}
