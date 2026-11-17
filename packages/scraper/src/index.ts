/**
 * Scraper CLI: Banner -> validated -> normalized -> data/<term>.json
 *
 * Usage:
 *   pnpm scrape                      # picks the term in session today (see term.ts)
 *   pnpm scrape --term 202710        # explicit term
 *   pnpm scrape --dry-run            # scrape and report, write nothing
 *   pnpm scrape --today 2026-12-30   # choose the term as if it were that date
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ACADEMIC_CALENDAR_2026_2027, campusDateISO, type ScheduleArtifact } from "@vacantneu/core";
import { BannerClient, type BannerTerm } from "./banner.js";
import { chooseTerm, isMainSemester, termSpan, type TermCandidate } from "./term.js";
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
 * How many of Banner's newest main semesters to consider. Three always spans the term in
 * session, the one open for registration after it, and the one just finished.
 */
const CANDIDATE_TERMS = 3;

/**
 * Picks the term to scrape by date, not by Banner's ordering: see term.ts for why the newest
 * open term is the wrong answer for weeks at a time. "(View Only)" terms stay in the running,
 * because that marker flips on an administrative schedule rather than when classes end.
 */
async function selectTerm(terms: BannerTerm[], today: string) {
  const semesters = terms.filter((t) => isMainSemester(t.description)).slice(0, CANDIDATE_TERMS);
  if (semesters.length === 0) throw new Error("No semester found in Banner's term list");

  const candidates: TermCandidate[] = [];
  for (const t of semesters) {
    // Banner pins a session to one term, so each probe gets its own.
    const span = termSpan(await new BannerClient().sampleSections(t.code));
    candidates.push({ ...t, span });
    console.log(
      `  ${t.code}  ${t.description.padEnd(38)} ${span ? `${span.start} to ${span.end}` : "no dated meetings"}`,
    );
  }

  const choice = chooseTerm(candidates, today);
  if (!choice) throw new Error("Could not read dates for any candidate term");
  console.log(`  -> ${choice.term.code}: ${choice.reason}\n`);
  return { code: choice.term.code, description: choice.term.description };
}

/** The site shows the term's name, and Banner's "(View Only)" is not part of it. */
function displayName(description: string): string {
  return description.replace(/\s*\(view only\)\s*$/i, "");
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const client = new BannerClient();
  const terms = await client.getTerms();
  // Overridable so the selection can be rehearsed for any date: `--today 2026-12-30 --dry-run`.
  const today = arg("today") ?? campusDateISO(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today))
    throw new Error(`--today must be YYYY-MM-DD, got ${today}`);

  const explicit = arg("term");
  let term: BannerTerm;
  if (explicit) {
    term = {
      code: explicit,
      description: terms.find((t) => t.code === explicit)?.description ?? explicit,
    };
  } else {
    console.log(`Choosing the term for ${today}:`);
    term = await selectTerm(terms, today);
  }
  term = { ...term, description: displayName(term.description) };

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
    `           excluded building ${stats.skippedExcludedBuilding}, unusable time ${stats.skippedBadTime}, no days ${stats.skippedNoDays},`,
  );
  console.log(
    `           duplicate rows ${stats.duplicateRows} (sections sharing a room and slot)`,
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

  // The pointer is written independently of the schedule: switching back to a term whose
  // artifact is already up to date must still move the site onto it.
  const pointerPath = join(DATA_DIR, "current.json");
  const pointer = JSON.stringify({ term: term.code }, null, 2) + "\n";
  if (!existsSync(pointerPath) || readFileSync(pointerPath, "utf8") !== pointer) {
    writeFileSync(pointerPath, pointer);
    console.log(`\nPointed ${pointerPath} at ${term.code}`);
  }

  if (existsSync(outPath) && readFileSync(outPath, "utf8") === json) {
    console.log(`\nNo changes. ${outPath} is already current.`);
    return;
  }

  writeFileSync(outPath, json);
  console.log(`\nWrote ${outPath} (${(json.length / 1024).toFixed(0)} KB)`);
}

main().catch((error) => {
  console.error("\nScrape failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
