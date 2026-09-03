/**
 * Copies the scraped artifact into public/ as minified JSON.
 *
 * data/*.json is pretty-printed so the daily scrape produces readable git diffs; the copy the
 * browser downloads does not need that whitespace.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "../../../data");
const outDir = join(here, "../public/data");

if (!existsSync(join(dataDir, "current.json"))) {
  console.error("No data/current.json — run `pnpm scrape` first.");
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
const { term } = JSON.parse(readFileSync(join(dataDir, "current.json"), "utf8"));
const artifact = JSON.parse(readFileSync(join(dataDir, `${term}.json`), "utf8"));

writeFileSync(join(outDir, "schedule.json"), JSON.stringify(artifact));
const kb = (JSON.stringify(artifact).length / 1024).toFixed(0);
console.log(`synced ${term}: ${artifact.rooms.length} rooms, ${kb} KB -> public/data/schedule.json`);

// Building footprints for the campus map. Generated separately by `pnpm buildings`, which runs
// rarely, so it is copied rather than regenerated on every build.
const geojsonPath = join(dataDir, "buildings.geojson");
if (existsSync(geojsonPath)) {
  const geo = JSON.parse(readFileSync(geojsonPath, "utf8"));
  writeFileSync(join(outDir, "buildings.geojson"), JSON.stringify(geo));
  console.log(`synced ${geo.features.length} building footprints`);
} else {
  console.warn("No data/buildings.geojson - the map will have no buildings. Run `pnpm buildings`.");
}
