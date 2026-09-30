// Parliament of the Living — slot 0 · Anillos fenológicos (relojes anidados)
//
// The concentric rings are a live calendar, nested from the year down to the
// second, and every ring is written by something the engine actually did:
//
//   YEAR   365 days. Each day's column is the CORPUS bus's spectrum while the
//          SC ring (14_phenological_corpus.scd) stood on that day — the forest's
//          own voice, remembered across sessions. Unrecorded days are hatched
//          by how far they are from any recording; the amber hand is the ring's
//          DOY (/pheno/cursor), the green one today's civil date.
//   DAY    the 24 hours of the day under that hand. The day's AudioMoth
//          recordings sit as tiles at the minute they were made, coloured by
//          ecological role, and fill with the corpus spectrum while they sound.
//          Hours the recorder does not keep are hatched as outside its schedule.
//   NOW    thirty seconds of the MASTER bus as a radar-swept spectrogram, the
//          reference's dial: 0 s at twelve o'clock, the kHz axis on its edge.
//   WAVE   the bus level round the dial, a node where each voice struck, and
//          arcs bowing through the centre between strikes of the same voice.
//
// Between the rings, today's species — the most active on the ring's day in
// the Cámara Fenológica's own model — move between three lanes: their calendar
// day, the voice lane when their taxon's voice strikes, and the event lane
// when a recording of a role they have affinity with begins (orbiters.ts).
// Consensus draws them in toward the core. Article 47 withholds names, never
// bodies. The howler is always seated, in white.
//
// Zoom goes all the way in (wheel, toward the cursor; double-click flies to a
// point); pressing 0 again returns to the whole dial. The five fixed seats,
// the radar grid, the season nodes and the fungi lines of the earlier stage
// are gone: none of them was driven by anything but its own defaults.

import * as THREE from "three";
import { RingStageBase } from "../../projector/rings/RingStageBase";
import { CoreDot, DayRing, doyCentre, NowRing, YearRing } from "../../projector/rings/components";
import { WaveformRing } from "../../projector/rings/waveformRing";
import { Orbiters } from "../../projector/rings/orbiters";

// ─── Layout (world units; y lifts the inner clocks off the plane) ───────────
const L = {
  core:     { y: 0.50 },
  wave:     { r: 1.12, amp: 0.42, y: 0.42 },
  now:      { rIn: 1.8, rOut: 3.3, y: 0.32 },
  voice:    { rIn: 3.42, rOut: 3.85, y: 0.26 },
  day:      { rIn: 4.1, rOut: 5.3, y: 0.16, bandR0: 3.95, bandR1: 4.05, progressR: 5.42 },
  event:    { rIn: 5.55, rOut: 5.8, y: 0.12 },
  calendar: { rIn: 5.88, rOut: 6.28, y: 0.06 },
  year:     { rIn: 6.4, rOut: 8.4, y: 0.0, seasonR0: 8.8, seasonR1: 8.98, labelR: 9.35 },
};

const NOW_PERIOD = 30;

class ParliamentStage extends RingStageBase {
  constructor(container) {
    super(container);
    this.defaultView = { fitRadius: 9.9, polarDeg: 9, azimuthDeg: 0 };

    this.core = new CoreDot(L.core.y, 0.2);
    this.wave = new WaveformRing(L.wave.r, L.wave.amp, L.wave.y, 720);
    this.now = new NowRing({
      rIn: L.now.rIn, rOut: L.now.rOut, y: L.now.y,
      playR0: L.wave.r - 0.25, playR1: L.now.rOut + 0.12,
    });
    this.day = new DayRing({
      rIn: L.day.rIn, rOut: L.day.rOut, y: L.day.y,
      bandR0: L.day.bandR0, bandR1: L.day.bandR1, progressR: L.day.progressR,
    });
    this.year = new YearRing({
      rIn: L.year.rIn, rOut: L.year.rOut, y: L.year.y,
      seasonR0: L.year.seasonR0, seasonR1: L.year.seasonR1, labelR: L.year.labelR,
      cursorR0: L.year.rIn - 0.12, cursorR1: L.year.seasonR1 + 0.12,
    });

    this._tmpTarget = new THREE.Vector3();
    this.orbiters = new Orbiters({
      laneFor: (state) => (state === "voice" ? L.voice : state === "event" ? L.event : L.calendar),
      homeAngle: (s) => doyCentre(s.peakDay),
      eventTarget: (key) => this.day.tilePos(key, this._tmpTarget),
      voiceTarget: (voice) => this.wave.latest(voice),
    }, 36);

    this.scene.add(
      this.year.group, this.day.group, this.now.group, this.wave.group,
      this.core.group, this.orbiters.group
    );

    this.start();
  }

  onPhenoData(data) {
    this.year.onData(data);
    this.day.onData(data);
  }

  updateRings(dt, t, data) {
    const f = this.feeds;
    const p = this.orbParams();
    // Memory feed is how long the sweep's past stays lit.
    const trail = 0.6 - f.soneth("memoryfeed", 0.4) * 0.4;
    this.now.update(f, NOW_PERIOD, trail);
    this.wave.update(f, this.now.frac, NOW_PERIOD, p.bow, Math.min(1.3, p.level));
    this.day.update(f, data);
    this.year.update(f);
    this.orbiters.update(f, data, dt, t, p);
    this.core.update(this._smoothConsensus, this.voteFlash, this.voteAlarm);
  }

  collectLabels(add) {
    const f = this.feeds;
    this.now.labels(add, "now");
    this.day.labels(add, f, "day");
    this.year.labels(add, f, "year");
    this.orbiters.labels(add, f.opacityFloor);
  }

  statusExtra() {
    const c = this.orbiters.census();
    return `${c.calendar + c.voice + c.event} especies en sesión · ${c.voice} en voz · ${c.event} en evento`;
  }

  disposeRings() {
    this.now?.spec.dispose();
    this.year?.dispose();
    this.day?.dispose();
    this.wave?.dispose();
    this.orbiters?.dispose();
  }
}

ParliamentStage.moduleName        = "ParliamentStage";
ParliamentStage.moduleDescription = "Parliament of the Living — nested phenological clocks (year · day · now) driven by the SC buses";

export default ParliamentStage;
