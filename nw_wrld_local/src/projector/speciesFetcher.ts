// speciesFetcher.ts
// Fetches Colombian endangered species from the IUCN Red List API v4
// Populates the SPECIES_ROSTER with real data including plants.
// Falls back to hardcoded roster if the API is unreachable.

const IUCN_API_BASE = "https://api.iucnredlist.org";
// Injected at build time by webpack DefinePlugin from .env
declare const __IUCN_TOKEN__: string;
const IUCN_TOKEN = typeof __IUCN_TOKEN__ !== "undefined" ? __IUCN_TOKEN__ : "";

// RLI local server (if running) — has CORS enabled
const RLI_SERVER = "http://localhost:3001";

export interface IUCNSpecies {
  taxonid: number;
  scientific_name: string;
  category: string;        // CR, EN, VU, NT, LC, DD, etc.
  class_name?: string;     // MAMMALIA, AVES, REPTILIA, AMPHIBIA, MAGNOLIOPSIDA, etc.
  order_name?: string;
  family_name?: string;
  main_common_name?: string;
}

// Roster tuple: [shortLabel, scientificName, iucnStatus]
export type RosterEntry = [string, string, string];

// IUCN multipliers for BioToken formula
const IUCN_MULT_MAP: Record<string, number> = {
  CR: 5, EN: 3, VU: 2, NT: 1, LC: 1, DD: 1, NE: 1, EW: 5, EX: 5,
};

// Generate a 3-char short label from a scientific name
function shortLabel(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    // First 3 chars of genus, capitalized
    return parts[0].slice(0, 3).charAt(0).toUpperCase() + parts[0].slice(1, 3).toLowerCase();
  }
  return name.slice(0, 3).charAt(0).toUpperCase() + name.slice(1, 3).toLowerCase();
}

// Priority order for categories (we want threatened species first)
const CATEGORY_PRIORITY: Record<string, number> = {
  CR: 0, EN: 1, VU: 2, NT: 3, DD: 4, LC: 5, NE: 6,
};

// Try fetching from the RLI local server first (CORS-friendly)
async function fetchFromRLI(): Promise<IUCNSpecies[]> {
  const categories = ["CR", "EN", "VU", "NT"];
  const allSpecies: IUCNSpecies[] = [];

  for (const cat of categories) {
    try {
      const resp = await fetch(`${RLI_SERVER}/api/species/colombia?category=${cat}&limit=100`);
      if (!resp.ok) continue;
      const data = await resp.json();
      if (data.success && Array.isArray(data.data)) {
        allSpecies.push(...data.data.map((s: any) => ({
          taxonid: s.taxonid ?? s.id ?? 0,
          scientific_name: s.scientific_name,
          category: s.category,
          class_name: s.class_name,
          order_name: s.order_name,
          family_name: s.family_name,
          main_common_name: s.main_common_name,
        })));
      }
    } catch { /* skip this category */ }
  }

  // Also fetch some LC species for diversity (plants often LC)
  try {
    const resp = await fetch(`${RLI_SERVER}/api/species/colombia/common?limit=100`);
    if (resp.ok) {
      const data = await resp.json();
      if (data.success && Array.isArray(data.data)) {
        allSpecies.push(...data.data.map((s: any) => ({
          taxonid: s.taxonid ?? s.id ?? 0,
          scientific_name: s.scientific_name,
          category: s.category,
          class_name: s.class_name,
          order_name: s.order_name,
          family_name: s.family_name,
          main_common_name: s.main_common_name,
        })));
      }
    }
  } catch { /* ok */ }

  return allSpecies;
}

// Try fetching directly from the IUCN API v4
async function fetchFromIUCN(): Promise<IUCNSpecies[]> {
  const resp = await fetch(`${IUCN_API_BASE}/api/v4/countries/CO`, {
    headers: { "Authorization": `Bearer ${IUCN_TOKEN}` },
  });
  if (!resp.ok) throw new Error(`IUCN API ${resp.status}`);
  const data = await resp.json();

  if (!data.result && !data.assessments) {
    throw new Error("Unexpected IUCN response format");
  }

  const raw = data.result ?? data.assessments ?? [];
  return raw.map((s: any) => ({
    taxonid: s.taxonid ?? s.sis_taxon_id ?? 0,
    scientific_name: s.scientific_name ?? s.taxon?.scientific_name ?? "",
    category: s.category ?? s.red_list_category?.code ?? "DD",
    class_name: s.class_name ?? s.taxon?.class_name ?? "",
    order_name: s.order_name ?? s.taxon?.order_name ?? "",
    family_name: s.family_name ?? s.taxon?.family_name ?? "",
    main_common_name: s.main_common_name ?? "",
  }));
}

// Deduplicate by scientific name
function dedup(species: IUCNSpecies[]): IUCNSpecies[] {
  const seen = new Set<string>();
  return species.filter(s => {
    const key = s.scientific_name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Select a diverse roster: mix of threatened animals + plants
function buildRoster(species: IUCNSpecies[], maxSize: number): RosterEntry[] {
  // Sort by threat level (most endangered first)
  const sorted = species.slice().sort((a, b) => {
    const pa = CATEGORY_PRIORITY[a.category] ?? 6;
    const pb = CATEGORY_PRIORITY[b.category] ?? 6;
    return pa - pb;
  });

  // Classify by broad group
  const plantClasses = new Set([
    "MAGNOLIOPSIDA", "LILIOPSIDA", "POLYPODIOPSIDA", "PINOPSIDA",
    "CYCADOPSIDA", "BRYOPSIDA", "LYCOPODIOPSIDA",
  ]);
  const isPlant = (s: IUCNSpecies) =>
    plantClasses.has((s.class_name ?? "").toUpperCase()) ||
    (s.family_name ?? "").toLowerCase().includes("ceae"); // plant families end in -aceae/-ceae

  const plants = sorted.filter(isPlant);
  const animals = sorted.filter(s => !isPlant(s));

  // Build a diverse roster: ~30% plants, ~70% animals
  const plantSlots = Math.max(4, Math.floor(maxSize * 0.3));
  const animalSlots = maxSize - plantSlots;

  // Diversify animals by class
  const animalsByClass = new Map<string, IUCNSpecies[]>();
  animals.forEach(s => {
    const cls = s.class_name ?? "UNKNOWN";
    if (!animalsByClass.has(cls)) animalsByClass.set(cls, []);
    animalsByClass.get(cls)!.push(s);
  });

  const picked: IUCNSpecies[] = [];

  // Round-robin across animal classes
  const classQueues = [...animalsByClass.values()];
  let qi = 0;
  while (picked.length < animalSlots && classQueues.some(q => q.length > 0)) {
    const q = classQueues[qi % classQueues.length];
    if (q.length > 0) picked.push(q.shift()!);
    qi++;
  }

  // Add plants
  picked.push(...plants.slice(0, plantSlots));

  // If we still need more, backfill from remaining
  if (picked.length < maxSize) {
    const remaining = sorted.filter(s => !picked.includes(s));
    picked.push(...remaining.slice(0, maxSize - picked.length));
  }

  // Convert to roster entries
  return picked.slice(0, maxSize).map(s => [
    shortLabel(s.scientific_name),
    s.scientific_name,
    s.category,
  ] as RosterEntry);
}

// Compute IUCN multipliers for the first N species
export function computeIUCNMults(roster: RosterEntry[]): number[] {
  return roster.map(([, , cat]) => IUCN_MULT_MAP[cat] ?? 1);
}

// ─── Main fetch + build pipeline ─────────────────────────────────────────────

export async function fetchSpeciesRoster(maxSize = 30): Promise<{
  roster: RosterEntry[];
  source: "iucn" | "rli" | "fallback";
}> {
  // 1. Try RLI local server first (CORS-friendly)
  try {
    console.log("[speciesFetcher] Trying RLI local server...");
    const species = await fetchFromRLI();
    if (species.length > 0) {
      const unique = dedup(species);
      console.log(`[speciesFetcher] RLI returned ${unique.length} species`);
      return { roster: buildRoster(unique, maxSize), source: "rli" };
    }
  } catch (e) {
    console.log("[speciesFetcher] RLI unavailable:", (e as Error).message);
  }

  // 2. Try IUCN API directly
  try {
    console.log("[speciesFetcher] Trying IUCN API directly...");
    const species = await fetchFromIUCN();
    if (species.length > 0) {
      const unique = dedup(species);
      console.log(`[speciesFetcher] IUCN returned ${unique.length} species`);
      return { roster: buildRoster(unique, maxSize), source: "iucn" };
    }
  } catch (e) {
    console.log("[speciesFetcher] IUCN API unavailable:", (e as Error).message);
  }

  // 3. Fallback
  console.log("[speciesFetcher] Using fallback roster");
  return { roster: [], source: "fallback" };
}
