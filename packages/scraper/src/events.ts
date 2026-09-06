/**
 * Event scraper CLI: Engage -> validated -> matched to rooms -> data/events.json
 *
 * Deliberately separate from the class scrape and from its artifact. Engage is an undocumented
 * endpoint behind a credential that expires on no published schedule, and a failure here must
 * never be able to take down the class schedule, which is the thing the app is actually for.
 *
 * Usage:
 *   pnpm events              # fetch and write data/events.json
 *   pnpm events --dry-run    # fetch and report, write nothing
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Meeting, ScheduleArtifact } from "@vacantneu/core";
import { EngageSessionError, cookieHeaderFromEnv, fetchEvents } from "./engage.js";
import { transformEvents } from "./engage-transform.js";

const DATA_DIR = join(import.meta.dirname, "../../../data");

export interface EventArtifact {
  source: "engage";
  /** ISO date of the scrape. */
  generatedAt: string;
  /** Whether the pull carried a session cookie. Without one most venues are redacted. */
  authenticated: boolean;
  meetings: Meeting[];
  stats: Record<string, number>;
}

function loadSchedule(): ScheduleArtifact {
  const currentPath = join(DATA_DIR, "current.json");
  if (!existsSync(currentPath)) {
    throw new Error("No data/current.json. Run `pnpm scrape` first so rooms are known.");
  }
  const { term } = JSON.parse(readFileSync(currentPath, "utf8")) as { term: string };
  return JSON.parse(readFileSync(join(DATA_DIR, `${term}.json`), "utf8")) as ScheduleArtifact;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const schedule = loadSchedule();
  const authenticated = cookieHeaderFromEnv() !== null;

  console.log(
    `Fetching Engage events ${authenticated ? "with a session cookie" : "anonymously"}...`,
  );

  const pull = await fetchEvents((got, total) => {
    process.stdout.write(`\r  events ${got} of about ${total} records`);
  });
  process.stdout.write("\n");

  const { meetings, stats, unmatchedSamples } = transformEvents(
    pull.events,
    schedule.rooms.map((r) => r.id),
    schedule.buildings,
  );

  console.log(`\nRead ${stats.events} events`);
  console.log(`  venue redacted by Engage : ${stats.redacted}`);
  console.log(`  no location given        : ${stats.noLocation}`);
  console.log(`  venue outside our rooms  : ${stats.unmatchedVenue}`);
  console.log(`  dates unparseable        : ${stats.unparsedDates}`);
  console.log(`  matched to a room        : ${stats.matched}  (${meetings.length} bookings)`);

  if (unmatchedSamples.length > 0) {
    console.log(`\nVenues we could not resolve (first ${unmatchedSamples.length}):`);
    for (const venue of unmatchedSamples.slice(0, 15)) console.log(`   ${venue}`);
    console.log("  Add a spelling to BUILDING_ALIASES in location.ts if one of these is a room.");
  }

  if (!pull.authenticated && stats.redacted > stats.events * 0.5) {
    console.log(
      `\nEngage hid ${stats.redacted} of ${stats.events} venues because the request was anonymous.` +
        `\nSet ENGAGE_SESSION_ID and ENGAGE_UID to see them. See README for how to obtain them.`,
    );
  }

  if (dryRun) {
    console.log("\n--dry-run: nothing written.");
    return;
  }

  const artifact: EventArtifact = {
    source: "engage",
    generatedAt: new Date().toISOString().slice(0, 10),
    authenticated: pull.authenticated,
    meetings,
    stats,
  };

  const outPath = join(DATA_DIR, "events.json");
  const json = `${JSON.stringify(artifact, null, 2)}\n`;
  if (existsSync(outPath) && readFileSync(outPath, "utf8") === json) {
    console.log(`\nNo changes. ${outPath} is already current.`);
    return;
  }
  writeFileSync(outPath, json);
  console.log(`\nWrote ${outPath} (${meetings.length} bookings)`);
}

main().catch((error) => {
  if (error instanceof EngageSessionError) {
    console.error(`\nEngage session problem: ${error.message}`);
    // Distinct exit code so a scheduled run can alert on an expired cookie specifically rather
    // than treating it as a generic crash.
    process.exit(2);
  }
  console.error("\nEvent scrape failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
