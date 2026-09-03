/**
 * Generates building footprints for the campus map by matching Banner building descriptions to
 * OpenStreetMap building geometry.
 *
 * Run occasionally, not daily — building locations don't change. Output is committed.
 * Matches are fuzzy (Banner says "Behrakis Health Sciences Cntr", OSM says "Behrakis Health
 * Sciences Center"), so every automatic match is written into `overrides.json` where it can be
 * corrected by hand. Manual corrections are never overwritten by a re-run.
 *
 * Usage: pnpm buildings [--term 202710]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Building, ScheduleArtifact } from "@vacantneu/core";

const DATA_DIR = join(import.meta.dirname, "../../../data");
const OVERRIDES_PATH = join(DATA_DIR, "building-overrides.json");
const OUT_PATH = join(DATA_DIR, "buildings.geojson");

/** Centre of NEU's Boston campus, used as the Overpass search origin. */
const CAMPUS_CENTER = { lat: 42.3398, lon: -71.0892 };
const SEARCH_RADIUS_M = 700;

interface OverpassElement {
  type: string;
  id: number;
  tags?: Record<string, string>;
  center?: { lat: number; lon: number };
  geometry?: { lat: number; lon: number }[];
}

/** Strips generic building words so "Dodge Hall" and "Dodge" compare equal. */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(hall|building|bldg|center|centre|cntr|complex|the|of|at)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/** Dice coefficient over character bigrams — tolerant of abbreviations like "Cntr". */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = (s: string) => {
    const out = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      out.set(g, (out.get(g) ?? 0) + 1);
    }
    return out;
  };
  const aG = bigrams(a);
  const bG = bigrams(b);
  let shared = 0;
  for (const [g, count] of aG) shared += Math.min(count, bG.get(g) ?? 0);
  return (2 * shared) / (a.length - 1 + (b.length - 1));
}

const MATCH_THRESHOLD = 0.62;

/** Public Overpass instances, tried in order — the main one throttles under load. */
const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
];

async function fetchOsmBuildings(): Promise<OverpassElement[]> {
  // `out tags center` only: we need a point per building, and asking for full geometry makes the
  // response large enough that the public instances time out.
  const query = `[out:json][timeout:60];
    (way["building"](around:${SEARCH_RADIUS_M},${CAMPUS_CENTER.lat},${CAMPUS_CENTER.lon});
     relation["building"](around:${SEARCH_RADIUS_M},${CAMPUS_CENTER.lat},${CAMPUS_CENTER.lon}););
    out tags center;`;

  let lastError: unknown;
  for (const mirror of OVERPASS_MIRRORS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(mirror, {
          method: "POST",
          body: new URLSearchParams({ data: query }),
          headers: { "User-Agent": "vacantNEU/0.1 (classroom availability)" },
        });
        if (!response.ok) throw new Error(`${mirror} returned ${response.status}`);
        const json = (await response.json()) as { elements: OverpassElement[] };
        return json.elements.filter((e) => e.tags?.name && e.center);
      } catch (error) {
        lastError = error;
        console.warn(`  Overpass attempt failed: ${String(error)}`);
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      }
    }
  }
  throw new Error(`All Overpass mirrors failed: ${String(lastError)}`);
}

function loadBuildings(): Building[] {
  const current = JSON.parse(readFileSync(join(DATA_DIR, "current.json"), "utf8")) as {
    term: string;
  };
  const artifact = JSON.parse(
    readFileSync(join(DATA_DIR, `${current.term}.json`), "utf8"),
  ) as ScheduleArtifact;
  return artifact.buildings;
}

interface Override {
  code: string;
  name: string;
  /** null means "deliberately has no map location" (e.g. off-campus). */
  lat: number | null;
  lon: number | null;
  osmName?: string;
  source: "auto" | "manual" | "excluded";
}

async function main() {
  const buildings = loadBuildings();
  const osm = await fetchOsmBuildings();
  console.log(`Fetched ${osm.length} named OSM buildings near campus`);

  const existing: Record<string, Override> = existsSync(OVERRIDES_PATH)
    ? JSON.parse(readFileSync(OVERRIDES_PATH, "utf8"))
    : {};

  const overrides: Record<string, Override> = {};
  const unmatched: string[] = [];

  for (const building of buildings) {
    const prior = existing[building.code];
    // Hand-written entries are authoritative and survive re-runs.
    if (prior && prior.source !== "auto") {
      overrides[building.code] = { ...prior, name: building.name };
      continue;
    }

    const target = normalizeName(building.name);
    let best: { element: OverpassElement; score: number } | null = null;
    for (const element of osm) {
      const score = similarity(target, normalizeName(element.tags!.name!));
      if (!best || score > best.score) best = { element, score };
    }

    if (best && best.score >= MATCH_THRESHOLD && best.element.center) {
      overrides[building.code] = {
        code: building.code,
        name: building.name,
        lat: best.element.center.lat,
        lon: best.element.center.lon,
        osmName: best.element.tags!.name!,
        source: "auto",
      };
    } else {
      overrides[building.code] = {
        code: building.code,
        name: building.name,
        lat: null,
        lon: null,
        source: "auto",
      };
      unmatched.push(`${building.code} = ${building.name}`);
    }
  }

  writeFileSync(OVERRIDES_PATH, JSON.stringify(overrides, null, 2) + "\n");

  const features = Object.values(overrides)
    .filter((o) => o.lat !== null && o.lon !== null)
    .map((o) => ({
      type: "Feature" as const,
      properties: {
        code: o.code,
        name: o.name,
        roomCount: buildings.find((b) => b.code === o.code)?.roomCount ?? 0,
      },
      geometry: { type: "Point" as const, coordinates: [o.lon, o.lat] },
    }));

  writeFileSync(OUT_PATH, JSON.stringify({ type: "FeatureCollection", features }, null, 2) + "\n");

  console.log(`\nMatched ${features.length}/${buildings.length} buildings to coordinates`);
  if (unmatched.length > 0) {
    console.log(`\nNeed manual coordinates in ${OVERRIDES_PATH}`);
    console.log(
      `(set lat/lon and change "source" to "manual", or "excluded" if not a real venue):`,
    );
    for (const u of unmatched) console.log(`   ${u}`);
  }
}

main().catch((error) => {
  console.error("Building match failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
