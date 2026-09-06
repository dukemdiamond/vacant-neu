/**
 * Scraper CLI: Banner -> validated -> normalized -> data/<term>.json
 *
 * Usage:
 *   pnpm scrape                 # auto-selects the current term
 *   pnpm scrape --term 202710   # explicit term
 *   pnpm scrape --dry-run       # scrape and report, write nothing
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ACADEMIC_CALENDAR_2026_2027, type ScheduleArtifact } from "@vacantneu/core";
import { BannerClient } from "./banner.js";
import { transform } from "./transform.js";

/**
 * Sanity floors. A Banner outage that returns an empty or truncated result set would otherwise
 * publish an artifact marking every room on campus free — the single most damaging thing this
 * app can do. Refusing to publish and keeping yesterday's data is always the better failure.
 */
const MIN_BUILDINGS = 25;
const MIN_ROOMS = 250;
const MIN_MEETINGS = 3000;

const DATA_DIR = join(import.meta.dirname, "../../../data");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

/**
 * Picks the term to scrape.
 *
 * Banner marks past terms "(View Only)", so the live term is the newest one without that marker.
 * Summer/CPS quarters overlap the main semesters, so we prefer plain semesters.
 */
async function selectTerm(client: BannerClient) {
  const terms = await client.getTerms();
  const live = terms.filter((t) => !/view only/i.test(t.description));
  const preferred = live.find((t) => /semester/i.test(t.description)) ?? live[0];
  if (!preferred) throw new Error("No active term found in Banner's term list");
  return preferred;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const client = new BannerClient();

  const explicit = arg("term");
  const term = explicit
    ? {
        code: explicit,
        description:
          (await client.getTerms()).find((t) => t.code === explicit)?.description ?? explicit,
      }
    : await selectTerm(client);

  console.log(`Scraping ${term.description} (${term.code}) from Banner...`);

  const sections = await client.getSections(term.code, (got, total) => {
    process.stdout.write(`\r  sections ${got}/${total}`);
  });
  process.stdout.write("\n");

  const { campuses, buildings, rooms, meetings, stats } = transform(sections);

  console.log(`\nParsed ${stats.sections} sections / ${stats.meetingRows} meeting rows`);
  console.log(
    `  skipped: no room ${stats.skippedNoRoom}, no usable campus ${stats.skippedNoCampus},`,
  );
  console.log(
    `           excluded building ${stats.skippedExcludedBuilding}, unusable time ${stats.skippedBadTime}, no days ${stats.skippedNoDays}`,
  );
  console.log(
    `\n${buildings.length} buildings, ${rooms.length} rooms, ${meetings.length} meetings across ${campuses.length} campuses:`,
  );
  for (const c of campuses) {
    console.log(
      `   ${c.code.padEnd(5)} ${c.name.padEnd(24)} ${String(c.buildingCount).padStart(3)} buildings, ${String(c.roomCount).padStart(4)} rooms`,
    );
  }

  const failures = [
    buildings.length < MIN_BUILDINGS && `buildings ${buildings.length} < ${MIN_BUILDINGS}`,
    rooms.length < MIN_ROOMS && `rooms ${rooms.length} < ${MIN_ROOMS}`,
    meetings.length < MIN_MEETINGS && `meetings ${meetings.length} < ${MIN_MEETINGS}`,
  ].filter(Boolean);

  if (failures.length > 0) {
    console.error(`\nRefusing to publish — implausible result set: ${failures.join("; ")}`);
    console.error("Existing data is left untouched. Banner may be degraded; re-run later.");
    process.exit(1);
  }

  const artifact: ScheduleArtifact = {
    term,
    // Date only: a full timestamp would change on every run and churn a daily commit even when
    // the schedule itself is identical.
    generatedAt: new Date().toISOString().slice(0, 10),
    campuses,
    buildings,
    rooms,
    meetings,
    calendar: ACADEMIC_CALENDAR_2026_2027,
  };

  if (dryRun) {
    console.log("\n--dry-run: nothing written.");
    return;
  }

  mkdirSync(DATA_DIR, { recursive: true });
  const outPath = join(DATA_DIR, `${term.code}.json`);
  const json = `${JSON.stringify(artifact, null, 2)}\n`;

  if (existsSync(outPath) && readFileSync(outPath, "utf8") === json) {
    console.log(`\nNo changes. ${outPath} is already current.`);
    return;
  }

  writeFileSync(outPath, json);
  writeFileSync(
    join(DATA_DIR, "current.json"),
    JSON.stringify({ term: term.code }, null, 2) + "\n",
  );
  console.log(`\nWrote ${outPath} (${(json.length / 1024).toFixed(0)} KB)`);
}

main().catch((error) => {
  console.error("\nScrape failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
