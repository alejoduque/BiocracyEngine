// orbiters.ts
// The species in session: who is on the rings today, and where each one is.
//
// The five fixed seats are gone. The floor is today's forest — the species the
// Cámara Fenológica's own model says are active on the day the ring stands on,
// the most active N of them — and each body moves between three lanes by what
// is happening to it:
//
//   calendar  present by phenology. It librates about its own peak day rather
//             than orbiting freely, so it can still be read against the year.
//   voice     its taxon's voice in the engine just struck (flora→pad,
//             amphibians→dust, reptiles→kick, mammals→drone, birds→perc). It
//             leaves its day, orbits, swells on the strike, and an arc ties it
//             to the strike's node on the waveform ring.
//   event     a field recording just began whose ecological ROLE it has
//             affinity with. It goes to where that recording is drawn and
//             holds for as long as the ring plays it. Affinity, not
//             identification: the corpus carries roles, never species.
//
// Consensus is gravity: the more the chamber agrees, the nearer each body is
// drawn to the core, in proportion to how present it is. Article 47 withholds
// a NAME, never a body: a veiled species still sits and still moves, drawn
// hollow, labelled as reserved.
//
// The howler is always seated, and burns white (Art. 46).

import * as THREE from "three";
import { ArcBuffer } from "./ringPrims";
import { LiveFeeds } from "./liveFeeds";
import {
  activityOn, hash01, isVeiled, PHOSPHOR, PhenoData, roleInfo,
  Species, Taxon, TAXON_COLOR, TAXON_VOICE,
} from "./phenoData";
import { angleDiff, approach, TAU } from "./ringMath";
import type { LabelSpec } from "./ringLabels";

export type OrbState = "calendar" | "voice" | "event";
export type Lane = { rIn: number; rOut: number; y: number };

export interface OrbiterHost {
  laneFor(state: OrbState, taxon: Taxon): Lane;
  /** Ring angle of a species' peak day on this stage's calendar. */
  homeAngle(s: Species): number;
  /** Where a sounding clip is drawn on this stage, or null. */
  eventTarget(key: string): THREE.Vector3 | null;
  /** The latest strike of a voice on the waveform ring, or null. */
  voiceTarget(voice: string): THREE.Vector3 | null;
}

type Orb = {
  s: Species;
  act: number;
  alpha: number;
  leaving: boolean;
  state: OrbState;
  until: number;
  eventKey: string | null;
  slot: number;
  angle: number;
  r: number;
  y: number;
  env: number;
  phase: number;
  howler: boolean;
  pos: THREE.Vector3;
};

export type OrbParams = {
  /** 0..1 smoothed chamber consensus. */
  consensus: number;
  /** Orbit speed multiplier from timedilation. */
  timeScale: number;
  /** 0..1, pitchshift: how far bodies bob out of their plane. */
  pitchZ: number;
  /** Overall brightness from the engine's own level. */
  level: number;
  /** 0..1, how deep arcs bow toward the centre. */
  bow: number;
};

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

function shortCommon(s: Species): string {
  const c = (s.common || "").split(/[,/;(]/)[0].trim();
  return (c || s.sci).toUpperCase();
}

export class Orbiters {
  readonly group = new THREE.Group();
  private readonly solid: THREE.InstancedMesh;
  private readonly hollow: THREE.InstancedMesh;
  private readonly arcs = new ArcBuffer(72, 20);
  orbs: Orb[] = [];
  private selectAt = -1;
  private selectKey = "";
  private voiceSeen: Record<string, number> = {};

  constructor(private host: OrbiterHost, private max = 36) {
    const cap = max + 8;
    this.solid = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      cap
    );
    // The veiled body: a ring lying in the plane of the dial — the seat is
    // held, the occupant is not shown.
    const torus = new THREE.TorusGeometry(1, 0.14, 8, 32);
    torus.rotateX(Math.PI / 2);
    this.hollow = new THREE.InstancedMesh(torus, new THREE.MeshBasicMaterial({ color: 0xffffff }), cap);
    this.solid.count = 0;
    this.hollow.count = 0;
    this.solid.frustumCulled = false;
    this.hollow.frustumCulled = false;
    this.group.add(this.solid, this.hollow, this.arcs.lines);
  }

  // ── Who is sitting ──────────────────────────────────────────────────────
  private select(feeds: LiveFeeds, data: PhenoData): void {
    const doy = feeds.doy;
    const thr = feeds.threshold;
    const acts = new Float32Array(data.species.length);
    for (const s of data.species) acts[s.idx] = activityOn(s, doy, feeds.windowScale);

    const seated = new Set<string>();
    for (const o of this.orbs) {
      o.act = acts[o.s.idx] ?? 0;
      if (o.howler) { o.leaving = false; seated.add(o.s.sci); continue; }
      // Hysteresis: a body stays until it is well below the threshold, so the
      // floor does not churn every ring day.
      if (o.act < thr * 0.8) o.leaving = true;
      else if (o.leaving && o.act >= thr) o.leaving = false;
      if (!o.leaving) seated.add(o.s.sci);
    }

    const present = this.orbs.filter((o) => !o.leaving).length;
    let free = this.max - present;
    if (free > 0) {
      const cand = data.species
        .filter((s) => !seated.has(s.sci) && acts[s.idx] >= thr)
        .sort((a, b) => (acts[b.idx] - acts[a.idx]) || (a.idx - b.idx));
      for (const s of cand) {
        if (free <= 0) break;
        // A species that is still fading out re-takes its body.
        const back = this.orbs.find((o) => o.s.sci === s.sci);
        if (back) { back.leaving = false; free--; continue; }
        this.orbs.push(this.spawn(s, acts[s.idx], false));
        free--;
      }
    }
    if (data.howler && !this.orbs.some((o) => o.howler)) {
      this.orbs.push(this.spawn(data.howler, acts[data.howler.idx] ?? 0, true));
    }
  }

  private spawn(s: Species, act: number, howler: boolean): Orb {
    const home = this.host.homeAngle(s);
    const lane = this.host.laneFor("calendar", s.taxon);
    return {
      s, act, alpha: 0, leaving: false, state: "calendar", until: 0, eventKey: null, slot: 0,
      angle: home, r: lane.rOut, y: lane.y, env: 0, phase: hash01(s.sci + "|orb") * TAU,
      howler, pos: new THREE.Vector3(),
    };
  }

  // ── What is happening to them ───────────────────────────────────────────
  private trigger(feeds: LiveFeeds, data: PhenoData): void {
    const now = feeds.now;

    // A voice struck: the most present bodies of its taxon answer.
    for (const taxon of Object.keys(TAXON_VOICE) as Taxon[]) {
      const voice = TAXON_VOICE[taxon];
      const at = feeds.voiceAt(voice);
      if (this.voiceSeen[voice] === undefined) { this.voiceSeen[voice] = at; continue; }
      if (!(at > 0) || at === this.voiceSeen[voice]) continue;
      this.voiceSeen[voice] = at;
      const amp = feeds.voiceAmp(voice);
      const pick = this.orbs
        .filter((o) => !o.leaving && o.s.taxon === taxon && o.state !== "event")
        .sort((a, b) => b.act - a.act)
        .slice(0, 3);
      for (const o of pick) {
        o.state = "voice";
        o.until = now + 2.5 + amp * 2.5;
        o.env = Math.max(o.env, 0.6 + amp * 0.4);
      }
    }

    // A recording began: bodies with affinity for its role go to it.
    for (const ev of feeds.newClips) {
      const clip = data.clipByKey.get(ev.key);
      if (feeds.bancada > 0 && clip && clip.bancada !== feeds.bancada - 1) continue;
      const info = roleInfo(ev.role);
      if (!info.affinity.length) continue;
      const pick = this.orbs
        .filter((o) => !o.leaving && info.affinity.includes(o.s.taxon) && o.state !== "event")
        .sort((a, b) => b.act - a.act)
        .slice(0, info.weak ? 2 : 3);
      const hold = Math.max(4, Math.min(90, feeds.secsPerDay * 0.9));
      pick.forEach((o, k) => {
        o.state = "event";
        o.eventKey = ev.key;
        o.slot = k;
        o.until = now + hold;
        o.env = Math.max(o.env, 0.5);
      });
    }
  }

  update(feeds: LiveFeeds, data: PhenoData | null, dt: number, t: number, p: OrbParams): void {
    if (!data) return;
    const key = `${feeds.doy}|${feeds.threshold.toFixed(3)}|${feeds.windowScale.toFixed(3)}`;
    if (key !== this.selectKey || t - this.selectAt > 2) {
      this.selectKey = key;
      this.selectAt = t;
      this.select(feeds, data);
    }
    this.trigger(feeds, data);

    const now = feeds.now;
    const floor = feeds.opacityFloor;
    let ns = 0, nh = 0;
    this.arcs.begin();

    for (const o of this.orbs) {
      // State expiry. An event also ends when the ring stops playing its clip.
      if (o.state !== "calendar" && now > o.until) o.state = "calendar";
      if (o.state === "event" && o.eventKey && !feeds.sounding.has(o.eventKey)) o.state = "calendar";
      if (o.state === "calendar") o.eventKey = null;

      const lane = this.host.laneFor(o.state, o.s.taxon);
      const pull = p.consensus * Math.min(1, o.act);
      const rT = lane.rOut - pull * (lane.rOut - lane.rIn);

      if (o.state === "calendar") {
        const home = this.host.homeAngle(o.s);
        const lib = (o.s.window / 365) * TAU * 0.35 * Math.sin(t * (0.05 + 0.04 * (o.phase / TAU)) + o.phase);
        o.angle += angleDiff(o.angle, home + lib) * approach(dt, 1.4);
      } else if (o.state === "voice") {
        o.angle += (0.16 + o.act * 0.3) * p.timeScale * dt;
      } else {
        const tgt = o.eventKey ? this.host.eventTarget(o.eventKey) : null;
        if (tgt) {
          const aT = Math.atan2(tgt.x, -tgt.z) + (o.slot - 1) * 0.035;
          o.angle += angleDiff(o.angle, aT) * approach(dt, 0.7);
        }
      }
      o.angle = ((o.angle % TAU) + TAU) % TAU;
      o.r += (rT - o.r) * approach(dt, 0.9);
      const bob = Math.sin(t * 0.6 + o.phase) * 0.06 * (0.2 + p.pitchZ * 1.6) * Math.min(1, o.act + 0.2);
      o.y += (lane.y + bob - o.y) * approach(dt, 0.5);

      // Fast attack on a strike, slow release: the same shape as the seats had.
      const venv = o.state === "voice" ? feeds.voiceEnv(TAXON_VOICE[o.s.taxon]) : 0;
      if (venv > o.env) o.env += (venv - o.env) * 0.55;
      else o.env *= Math.exp(-dt / 0.6);

      o.alpha += ((o.leaving ? 0 : 1) - o.alpha) * approach(dt, o.leaving ? 0.8 : 1.2);

      o.pos.set(Math.sin(o.angle) * o.r, o.y, -Math.cos(o.angle) * o.r);

      const size = (0.045 + Math.min(1, o.act) * 0.075) * (1 + o.env * 1.1) * o.alpha * (o.howler ? 1.5 : 1);
      _s.setScalar(Math.max(1e-4, size));
      _m.compose(o.pos, _q, _s);
      const bright = Math.min(1.4, (0.45 + feeds.quorum * 0.35 + o.env * 0.5) * p.level) * o.alpha;
      _c.setHex(o.howler ? PHOSPHOR : TAXON_COLOR[o.s.taxon]).multiplyScalar(bright);
      if (isVeiled(o.s, floor)) {
        this.hollow.setMatrixAt(nh, _m);
        this.hollow.setColorAt(nh, _c);
        nh++;
      } else {
        this.solid.setMatrixAt(ns, _m);
        this.solid.setColorAt(ns, _c);
        ns++;
      }

      // Arcs to whatever the body is answering.
      if (o.state === "voice") {
        const tgt = this.host.voiceTarget(TAXON_VOICE[o.s.taxon]);
        if (tgt) {
          _c.setHex(o.howler ? PHOSPHOR : TAXON_COLOR[o.s.taxon]);
          this.arcs.add(o.pos, tgt, _c, (0.25 + o.env * 0.6) * o.alpha, 0.35 + p.bow * 0.4);
        }
      } else if (o.state === "event" && o.eventKey) {
        const tgt = this.host.eventTarget(o.eventKey);
        if (tgt) {
          _c.setHex(o.howler ? PHOSPHOR : TAXON_COLOR[o.s.taxon]);
          this.arcs.add(o.pos, tgt, _c, 0.45 * o.alpha, 0.15, 0.25);
        }
      }
    }
    this.orbs = this.orbs.filter((o) => !(o.leaving && o.alpha < 0.01));
    this.solid.count = ns;
    this.hollow.count = nh;
    this.solid.instanceMatrix.needsUpdate = true;
    this.hollow.instanceMatrix.needsUpdate = true;
    if (this.solid.instanceColor) this.solid.instanceColor.needsUpdate = true;
    if (this.hollow.instanceColor) this.hollow.instanceColor.needsUpdate = true;
    this.arcs.end();
  }

  /** Names, for the overlay. Bodies in voice or event always speak; the rest when you come close. */
  labels(add: (s: LabelSpec) => void, floor: number): void {
    const ranked = this.orbs.filter((o) => !o.leaving).sort((a, b) => b.act - a.act);
    const top = new Set(ranked.slice(0, 6).map((o) => o.s.sci));
    for (const o of this.orbs) {
      if (o.alpha < 0.3) continue;
      const veiled = isVeiled(o.s, floor);
      const active = o.state !== "calendar";
      const hex = "#" + _c.setHex(o.howler ? PHOSPHOR : TAXON_COLOR[o.s.taxon]).getHexString();
      add({
        id: "orb:" + o.s.sci,
        pos: o.pos,
        text: veiled ? "· · · · ·" : shortCommon(o.s),
        sub: veiled ? "reservado" : o.s.sci,
        cls: "orb" + (veiled ? " veiled" : "") + (active ? " live" : ""),
        color: hex,
        priority: 20 + (o.howler ? 6 : 0) + (active ? 8 : 0) + o.act * 4,
        maxDist: active || o.howler || top.has(o.s.sci) ? undefined : 11,
        opacity: Math.min(1, o.alpha * (active ? 1 : 0.8)),
        anchor: "l",
        dx: 8,
      });
    }
  }

  /** How many bodies are in each state — for the stage's status line. */
  census(): { calendar: number; voice: number; event: number } {
    const c = { calendar: 0, voice: 0, event: 0 };
    for (const o of this.orbs) if (!o.leaving) c[o.state]++;
    return c;
  }

  dispose(): void {
    this.solid.geometry.dispose();
    (this.solid.material as THREE.Material).dispose();
    this.hollow.geometry.dispose();
    (this.hollow.material as THREE.Material).dispose();
    this.arcs.dispose();
  }
}

