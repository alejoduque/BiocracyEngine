// avgnData.ts — the corpus's vocal latent space, as tools/build_avgn.py left it
// ===========================================================================
// AVGN (Sainburg, Thielk & Gentner 2020, github.com/timsainb/AVGN) run over
// the AudioMoth corpus: every call cut out of its recording by dynamic
// thresholding, drawn as a log-mel tile, projected with UMAP (3-D and 2-D) and
// grouped with HDBSCAN. /corpus/avgn.json is read once and shared by the slots
// that draw it (2 and O).
//
// Article 47 is applied twice: the build never analyses an opaque clip, and
// every unit keeps its clip's opacity so a slot withholds it at the same
// opacityFloor SuperCollider uses (a clip sounds while opacity < 1 − floor).

const URL = "/corpus/avgn.json";

export type AvgnCluster = {
  id: number;
  n: number;
  clips: number;
  role: string;
  share: number;
  hz: number;
  ms: number;
  hour: number;
  c3: [number, number, number];
  c2: [number, number];
};

export type AvgnData = {
  /** Units, in clip and time order. */
  count: number;
  clip: Uint16Array;
  t: Float32Array;
  d: Float32Array;
  hz: Float32Array;
  p3: Float32Array;
  p2: Float32Array;
  /** Cluster id, 1..k; 0 = not clustered. */
  c: Uint8Array;
  clusters: AvgnCluster[];
  clipKeys: string[];
  clipOpacity: Float32Array;
  clipRole: string[];
  clipHour: Uint8Array;
  /** The clip's bancada, 0..3 (−1 when it has none), as in the manifest. */
  clipBancada: Int8Array;
  /** Units of a clip: [first, end) into the unit arrays. */
  range: Map<string, [number, number]>;
  veiled: number;
};

let _data: AvgnData | null = null;
let _loading: Promise<AvgnData | null> | null = null;

export function getAvgn(): AvgnData | null {
  return _data;
}

/** Load once; null when the file is absent (the build has not been run). */
export function loadAvgn(): Promise<AvgnData | null> {
  if (_data) return Promise.resolve(_data);
  if (_loading) return _loading;
  _loading = (async () => {
    try {
      const r = await fetch(URL, { cache: "force-cache" });
      if (!r.ok) return null;
      const j = await r.json();
      const u = j.units;
      const n = u.clip.length;
      const clips = j.clips as { key: string; opacity: number; role: string; hour: number; bancada?: number }[];
      const range = new Map<string, [number, number]>();
      for (let i = 0; i < n; i++) {
        const key = clips[u.clip[i]].key;
        const rg = range.get(key);
        if (rg) rg[1] = i + 1;
        else range.set(key, [i, i + 1]);
      }
      _data = {
        count: n,
        clip: Uint16Array.from(u.clip),
        t: Float32Array.from(u.t),
        d: Float32Array.from(u.d),
        hz: Float32Array.from(u.hz),
        p3: Float32Array.from(u.p3),
        p2: Float32Array.from(u.p2),
        c: Uint8Array.from(u.c),
        clusters: j.clusters,
        clipKeys: clips.map((c) => c.key),
        clipOpacity: Float32Array.from(clips.map((c) => Number(c.opacity) || 0)),
        clipRole: clips.map((c) => c.role),
        clipHour: Uint8Array.from(clips.map((c) => Number(c.hour) || 0)),
        clipBancada: Int8Array.from(clips.map((c) => (Number.isFinite(Number(c.bancada)) ? Number(c.bancada) : -1))),
        range,
        veiled: Number(j.veiled) || 0,
      };
      return _data;
    } catch {
      return null;
    } finally {
      _loading = null;
    }
  })();
  return _loading;
}
