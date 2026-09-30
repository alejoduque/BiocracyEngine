// ringMath.ts
// The one polar convention the three ring stages (slots 0, O, T) share.
//
// The rings lie in the XZ plane and the layers stack on +Y, so the view reads
// as the flat dial of the reference from above and separates into its clocks
// when the performer tilts it. Angle 0 is twelve o'clock — world −Z, which is
// the top of the screen for the near-top-down default camera — and the angle
// grows CLOCKWISE seen from above, like the Cámara Fenológica's own ring (day 1
// at the top, the year running clockwise), so a species sits at the same place
// on every calendar in the instrument.

import * as THREE from "three";

export const TAU = Math.PI * 2;

/** World position of (radius, angle) at height y. */
export function polar(r: number, a: number, y = 0, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(Math.sin(a) * r, y, -Math.cos(a) * r);
}

/** Day of year (1..365) to ring angle. Day 1 at the top, clockwise. */
export function doyAngle(doy: number): number {
  return (((((doy - 1) % 365) + 365) % 365) / 365) * TAU;
}

/** Minute of the day (0..1439) to ring angle. Midnight at the top. */
export function minuteAngle(min: number): number {
  return ((((min % 1440) + 1440) % 1440) / 1440) * TAU;
}

/** Fraction of a turn (0..1) to ring angle. */
export function fracAngle(f: number): number {
  return (((f % 1) + 1) % 1) * TAU;
}

/** Signed shortest difference b − a, in (−π, π]. */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/** Frame-rate independent approach: the fraction of the way to go this frame. */
export function approach(dt: number, tau: number): number {
  return 1 - Math.exp(-dt / Math.max(1e-4, tau));
}

// ─── The four bancadas, at their own places on the year ─────────────────────
// Ported from the previous ParliamentStage (and PhenologicalCalendar's
// _seasonFirstDay). The manifest carries the same table as `temporadas`; this
// is the fallback until it resolves, and the source of the labels.
export type Season = { key: string; label: string; d0: number; d1: number; taxa: string };

export const SEASONS: Season[] = [
  { key: "seca",             label: "SECA",        d0: 335, d1: 90,  taxa: "reptiles · aves" },
  { key: "primeras_lluvias", label: "1as LLUVIAS", d0: 91,  d1: 151, taxa: "anfibios · aves" },
  { key: "medio_seco",       label: "MEDIO SECO",  d0: 152, d1: 243, taxa: "mamíferos" },
  { key: "segundas_lluvias", label: "2as LLUVIAS", d0: 244, d1: 334, taxa: "flora" },
];

export function seasonSpan(sn: Season): number {
  return sn.d1 >= sn.d0 ? sn.d1 - sn.d0 : 365 - sn.d0 + sn.d1;
}

/** Mid-day of a season, handling the one that wraps the new year. */
export function seasonMidDoy(sn: Season): number {
  return sn.d0 + seasonSpan(sn) / 2;
}

export function inSeason(sn: Season, doy: number): boolean {
  return sn.d1 >= sn.d0 ? doy >= sn.d0 && doy <= sn.d1 : doy >= sn.d0 || doy <= sn.d1;
}

export function seasonOf(doy: number): Season {
  return SEASONS.find((s) => inSeason(s, doy)) || SEASONS[0];
}

export const MONTHS_ES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
/** First DOY of each month, non-leap — the ring has 365 days. */
export const MONTH_START_DOY = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];

// ─── The civil clock at the site ────────────────────────────────────────────
// Planeta Rica keeps Colombian time: UTC−5 all year, no daylight saving, so a
// fixed offset is exact and needs no Intl time-zone database.
const SITE_UTC_OFFSET_MIN = -5 * 60;

function siteNow(date: Date): Date {
  return new Date(date.getTime() + SITE_UTC_OFFSET_MIN * 60000);
}

/** Today's day of year at the site, 1..365 (a leap day folds onto 365). */
export function civilDoy(date = new Date()): number {
  const d = siteNow(date);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const doy = Math.floor((d.getTime() - start) / 86400000) + 1;
  return Math.max(1, Math.min(365, doy));
}

/** Minutes since midnight at the site. */
export function civilMinute(date = new Date()): number {
  const d = siteNow(date);
  return d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
}

export function hhmm(min: number): string {
  const m = Math.floor(((min % 1440) + 1440) % 1440);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

// ─── Frequency axis ─────────────────────────────────────────────────────────
// The spectrogram rings run the same log axis SuperCollider analyses:
// \masterScope and \corpusScope place their bands geometrically from 40 Hz to
// 10 kHz, so v (0 at the inner edge, 1 at the outer) is log-frequency.
export const F_LO = 40;
export const F_HI = 10000;

export function freqToV(f: number): number {
  return clamp01(Math.log(f / F_LO) / Math.log(F_HI / F_LO));
}

/** The kHz guides drawn across every spectrogram ring, as in the reference. */
export const FREQ_GUIDES = [500, 1000, 2000, 3000, 4000, 6000, 8000];

export function freqLabel(f: number): string {
  return f >= 1000 ? `${f / 1000}k` : `${f}`;
}
