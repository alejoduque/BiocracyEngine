// phenoData.ts
// What the ring stages know about the forest before anything sounds.
//
// Three sources, all read-only and all already served by the dev server:
//
//   manakai_species.json   572 entries, 442 distinct species over five taxa
//                          once duplicates are folded (slot P folds them the
//                          same way) — the roster the Cámara Fenológica reads,
//                          so the rings and the calendar name the same forest.
//   corpus/manifest.json   261 dated AudioMoth clips: day, hour, ecological
//                          role, bancada, opacity. What the SC ring actually
//                          plays (14_phenological_corpus.scd).
//   corpus/cameratrap.json the MANAKAI camera trap's days.
//
// Loaded once per page and shared by every ring stage. A stage must never keep
// this object in one of its own fields across destroy(): BaseThreeJsModule's
// teardown nulls every object-valued field, and a reference is all it needs to
// sever a singleton from the next stage that mounts.

export type Taxon = "flora" | "amphibians" | "reptiles" | "mammals" | "birds";

/** Innermost → outermost, the order PhenologicalCalendar.TAXA stacks them. */
export const TAXA: { key: Taxon; label: string; color: number }[] = [
  { key: "flora",      label: "FLORA",    color: 0x9fc25e },
  { key: "amphibians", label: "AMPHIBIA", color: 0xa98cf5 },
  { key: "reptiles",   label: "REPTILIA", color: 0xdb8350 },
  { key: "mammals",    label: "MAMMALIA", color: 0xe9c45c },
  { key: "birds",      label: "AVES",     color: 0x5fc9e2 },
];

export const TAXON_COLOR: Record<Taxon, number> = Object.fromEntries(
  TAXA.map((t) => [t.key, t.color])
) as Record<Taxon, number>;

/** The howler. Article 46 gives it the one alert protocol in the statute; it
 *  is always seated, and it is the one body that burns phosphor white. */
export const HOWLER_SCI = "Alouatta seniculus";
export const PHOSPHOR = 0xf2fff4;

/**
 * Which voice of the engine each taxon answers to, chosen by what the voice
 * does rather than by index: the pad is the wash the flora is, dust the
 * granular crackle of a frog chorus, the kick the rare low weight of a
 * reptile, the drone the sustained presence of the mammals, the struck perc
 * the birds. One voice each, no repeats.
 */
export const TAXON_VOICE: Record<Taxon, string> = {
  flora: "pad",
  amphibians: "dust",
  reptiles: "kick",
  mammals: "drone",
  birds: "perc",
};

export const VOICE_COLOR: Record<string, number> = {
  kick: 0xdb8350,
  perc: 0x5fc9e2,
  dust: 0xa98cf5,
  pad: 0x9fc25e,
  drone: 0xe9c45c,
  sample: 0xf2fff4,
};

// ─── Roles ──────────────────────────────────────────────────────────────────
// The AudioMoth corpus carries no taxonomy: the detector yields ECOLOGICAL
// ROLES, and so do these events. `affinity` is which taxa could plausibly be
// heard in that role — it moves orbiters toward an event, it does not name
// what made the sound. Insects are not in the roster at all, so an insect
// chorus pulls nobody; it stands on the ring alone, which is the truth of it.
export type RoleInfo = { letter: string; label: string; color: number; affinity: Taxon[]; weak?: boolean };

export const ROLE_INFO: Record<string, RoleInfo> = {
  nocturnal_voice:         { letter: "N", label: "voz nocturna",   color: 0x6f8fd8, affinity: ["amphibians", "mammals"] },
  insect_chorus:           { letter: "I", label: "coro de insectos", color: 0x8a9a6a, affinity: [] },
  dusk_chorus_participant: { letter: "C", label: "coro del ocaso", color: 0x3fb8b0, affinity: ["birds", "amphibians"] },
  dawn_chorus_participant: { letter: "C", label: "coro del alba",  color: 0x3fb8b0, affinity: ["birds", "amphibians"] },
  community_shift:         { letter: "Δ", label: "cambio de comunidad", color: 0x8c8f8d, affinity: ["flora", "amphibians", "reptiles", "mammals", "birds"], weak: true },
  activity_to_silence:     { letter: "·", label: "hacia el silencio", color: 0x5a5e5c, affinity: [] },
  silence_to_activity:     { letter: "·", label: "desde el silencio", color: 0x5a5e5c, affinity: [] },
};

export function roleInfo(role: string): RoleInfo {
  return ROLE_INFO[role] || { letter: "?", label: role, color: 0x8c8f8d, affinity: [] };
}

export type Species = {
  idx: number;
  taxon: Taxon;
  sci: string;
  common: string | null;
  family: string | null;
  habit: string | null;
  peakDay: number;
  window: number;
};

export type Clip = {
  key: string;
  doy: number;
  hour: number;
  /** Minute of the day the recording started, from the key's HHMMSS. */
  minute: number;
  temporada: string;
  role: string;
  /** 0-based: nocturnal, insects, chorus, shift (−1 for transitions). */
  bancada: number;
  confidence: number;
  duration: number;
  opaque: boolean;
  ultrasonic: number;
};

export type DayInfo = { doy: number; clips: number; biophony: number; richness: number; activity: number };

export type PhenoData = {
  species: Species[];
  byTaxon: Record<Taxon, Species[]>;
  howler: Species | null;
  clips: Clip[];
  clipsByDoy: Map<number, Clip[]>;
  clipByKey: Map<string, Clip>;
  recordedDays: Set<number>;
  /** gapDepth[doy] — days to the nearest recording, index 1..365. */
  gapDepth: number[];
  dayInfo: Map<number, DayInfo>;
  /** Camera-trap days: doy → number of clips. Names deliberately not kept. */
  cameraDays: Map<number, number>;
};

const ROSTER_URL = "/ecosystems/default_ecosystem/assets/json/manakai_species.json";
const MANIFEST_URL = "/corpus/manifest.json";
const CAMERATRAP_URL = "/corpus/cameratrap.json";

// ─── Deterministic phenology ────────────────────────────────────────────────
// Ported VERBATIM from PhenologicalCalendar.js (_hash01, _gaussian, _wrapDay,
// _assignPeakDay, _assignWindow). Keep the two in sync: a species must fall on
// the same day in slot P and on these rings, or the instrument contradicts
// itself across a key press.

/** FNV-1a → [0,1). Same hash, same keys (sci + "|peak", "|opacity"…). */
export function hash01(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

function gaussian(u: number): number {
  const v = hash01(String(u * 9301 + 49297));
  return Math.sqrt(-2 * Math.log(Math.max(1e-6, u))) * Math.cos(2 * Math.PI * v);
}

function wrapDay(d: number): number {
  d = Math.round(d);
  while (d < 1) d += 365;
  while (d > 365) d -= 365;
  return d;
}

function assignPeakDay(s: { taxon: Taxon; sci: string; habit: string | null; family: string | null }): number {
  const h1 = hash01(s.sci + "|peak");
  const h2 = hash01(s.sci + "|mode");
  if (s.taxon === "flora") {
    const isTree = s.habit && /árbol|arbol|palmoide/i.test(s.habit);
    if (isTree) {
      const c = h2 < 0.5 ? 75 : 220;
      return wrapDay(c + gaussian(h1) * 30);
    }
    const c = h2 < 0.5 ? 115 : 270;
    return wrapDay(c + gaussian(h1) * 22);
  }
  if (s.taxon === "amphibians") {
    const c = h2 < 0.65 ? 110 : 275;
    return wrapDay(c + gaussian(h1) * 18);
  }
  if (s.taxon === "reptiles") return wrapDay(60 + gaussian(h1) * 45);
  if (s.taxon === "mammals") return wrapDay(190 + gaussian(h1) * 70);
  if (s.taxon === "birds") {
    const migFamilies = /parulidae|hirundinidae/i;
    const migGenera = /^(catharus|contopus|piranga|setophaga|empidonax|dolichonyx|protonotaria|leiothlypis|parkesia|mniotilta)/i;
    const migSpecies = /tyrannus savana|tyrannus tyrannus/i;
    const isMig = (s.family && migFamilies.test(s.family))
      || (s.sci && migGenera.test(s.sci))
      || (s.sci && migSpecies.test(s.sci));
    if (isMig) return wrapDay(315 + gaussian(h1) * 35);
    return wrapDay(135 + gaussian(h1) * 40);
  }
  return Math.floor(h1 * 365) + 1;
}

const WINDOW_DAYS: Record<Taxon, number> = { flora: 38, amphibians: 22, reptiles: 55, mammals: 60, birds: 35 };

/**
 * How present a species is on a given day, 0..1. The calendar's own gaussian
 * (PhenologicalCalendar._updateHtmlOverlays): distance to the peak day on the
 * circle, against the taxon's window scaled by Art. 44.
 */
export function activityOn(s: Species, doy: number, windowScale = 1): number {
  let d = Math.abs(s.peakDay - doy);
  if (d > 182) d = 365 - d;
  const sigma = Math.max(1, s.window * windowScale);
  return Math.exp(-(d * d) / (2 * sigma * sigma * 0.6));
}

/** Art. 44 window, from the normalised fader: 0..1 → 0.4..2.5 (breath.ts). */
export function windowScaleFromNorm(v: number): number {
  return 0.4 + (Number.isFinite(v) ? v : 0.29) * 2.1;
}

/** Art. 45 threshold, from the normalised fader: 0..1 → 0.20..0.85. */
export function thresholdFromNorm(v: number): number {
  return 0.2 + (Number.isFinite(v) ? v : 0.46) * 0.65;
}

/** Art. 47 floor, from the normalised fader: 0..1 → 0..0.7, as slot P reads it. */
export function opacityFloorFromNorm(v: number): number {
  return (Number.isFinite(v) ? v : 0) * 0.7;
}

/**
 * Art. 47 applies to the NAME, never the body. Deterministic per species and
 * on the calendar's own hash key, so a species withheld here is the species
 * withheld in slot P — the refusal is the chamber's, not one module's.
 */
export function isVeiled(s: Species, floor: number): boolean {
  if (s.sci === HOWLER_SCI) return false;
  return floor > 0.001 && hash01(s.sci + "|opacity") < floor;
}

// ─── Loading ────────────────────────────────────────────────────────────────

let _data: PhenoData | null = null;
let _loading: Promise<PhenoData> | null = null;

export function getPhenoData(): PhenoData | null {
  return _data;
}

// The three files are read as loose JSON and every field is coerced where it
// is used, so a missing or malformed field degrades to a default, not a throw.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchJson(url: string): Promise<any> {
  try {
    const r = await fetch(url, { cache: "force-cache" });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

function minuteFromKey(key: string, hour: number): number {
  // YYYYMMDD_HHMMSS_n
  const m = /^\d{8}_(\d{2})(\d{2})(\d{2})/.exec(key);
  if (m) return Number(m[1]) * 60 + Number(m[2]) + Number(m[3]) / 60;
  return (Number(hour) || 0) * 60;
}

export function loadPhenoData(): Promise<PhenoData> {
  if (_data) return Promise.resolve(_data);
  if (_loading) return _loading;
  _loading = (async () => {
    const [roster, manifest, camera] = await Promise.all([
      fetchJson(ROSTER_URL), fetchJson(MANIFEST_URL), fetchJson(CAMERATRAP_URL),
    ]);

    const species: Species[] = [];
    const seen = new Set<string>();
    const byTaxon = { flora: [], amphibians: [], reptiles: [], mammals: [], birds: [] } as Record<Taxon, Species[]>;
    for (const t of TAXA) {
      const list = (roster && Array.isArray(roster[t.key])) ? roster[t.key] : [];
      for (const r of list) {
        if (!r || !r.s) continue;
        const sci = String(r.s).trim();
        const k = t.key + "|" + sci.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        const base = { taxon: t.key, sci, habit: r.h || null, family: r.f || null };
        const s: Species = {
          idx: species.length,
          taxon: t.key,
          sci,
          common: r.c || null,
          family: r.f || null,
          habit: r.h || null,
          peakDay: assignPeakDay(base),
          window: WINDOW_DAYS[t.key] || 30,
        };
        species.push(s);
        byTaxon[t.key].push(s);
      }
    }
    // The howler is seated whether or not the roster loaded.
    let howler = species.find((s) => s.sci === HOWLER_SCI) || null;
    if (!howler) {
      const base = { taxon: "mammals" as Taxon, sci: HOWLER_SCI, habit: null, family: "Atelidae" };
      howler = {
        idx: species.length, taxon: "mammals", sci: HOWLER_SCI, common: "Mono aullador",
        family: "Atelidae", habit: null, peakDay: assignPeakDay(base), window: WINDOW_DAYS.mammals,
      };
      species.push(howler);
      byTaxon.mammals.push(howler);
    }

    const clips: Clip[] = [];
    const clipsByDoy = new Map<number, Clip[]>();
    const clipByKey = new Map<string, Clip>();
    for (const c of (manifest && Array.isArray(manifest.clips)) ? manifest.clips : []) {
      if (!c || !c.key) continue;
      const clip: Clip = {
        key: String(c.key),
        doy: Number(c.doy) || 1,
        hour: Number(c.hour) || 0,
        minute: minuteFromKey(String(c.key), c.hour),
        temporada: String(c.temporada || ""),
        role: String(c.role || ""),
        bancada: Number.isFinite(Number(c.bancada)) ? Number(c.bancada) : -1,
        confidence: Number(c.confidence) || 0,
        duration: Number(c.duration_s) || 60,
        opaque: !!c.opaque,
        ultrasonic: Number(c.ultrasonic_share) || 0,
      };
      clips.push(clip);
      clipByKey.set(clip.key, clip);
      if (!clipsByDoy.has(clip.doy)) clipsByDoy.set(clip.doy, []);
      clipsByDoy.get(clip.doy)!.push(clip);
    }
    for (const list of clipsByDoy.values()) list.sort((a, b) => a.minute - b.minute);

    const ring = (manifest && manifest.ring) || {};
    const recordedDays = new Set<number>(
      (Array.isArray(ring.recorded_days) ? ring.recorded_days : [...clipsByDoy.keys()]).map(Number)
    );
    const gapDepth = new Array(366).fill(365);
    if (Array.isArray(ring.gap_depth)) {
      // Index 0 of the manifest's array is day 1 (14_phenological_corpus.scd:106).
      for (let d = 1; d <= 365; d++) gapDepth[d] = Number(ring.gap_depth[d - 1]) || 0;
    } else {
      for (const d of recordedDays) gapDepth[d] = 0;
    }
    const dayInfo = new Map<number, DayInfo>();
    for (const d of Array.isArray(ring.days) ? ring.days : []) {
      dayInfo.set(Number(d.doy), {
        doy: Number(d.doy), clips: Number(d.clips) || 0,
        biophony: Number(d.cv_biophony) || 0, richness: Number(d.cv_richness) || 0,
        activity: Number(d.cv_activity) || 0,
      });
    }

    const cameraDays = new Map<number, number>();
    for (const d of (camera && camera.ring && Array.isArray(camera.ring.days)) ? camera.ring.days : []) {
      cameraDays.set(Number(d.doy), Number(d.clips) || 1);
    }

    _data = { species, byTaxon, howler, clips, clipsByDoy, clipByKey, recordedDays, gapDepth, dayInfo, cameraDays };
    return _data;
  })();
  return _loading;
}
