/**
 * Inspection CLI for the generated artifact — the human half of verification.
 *
 * Automated tests prove the code matches our assumptions; this exists so a person can read a
 * room's schedule and compare it against Banner's own UI, which is the only thing that proves
 * the assumptions match reality.
 *
 * Usage:
 *   pnpm inspect --room DG-070        # full weekly schedule for one room
 *   pnpm inspect --free               # what's free right now
 *   pnpm inspect --free --at 2026-09-16T14:30
 *   pnpm inspect --building SL
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  allRoomStatuses,
  formatDuration,
  formatMinutes,
  indexMeetingsByRoom,
  isNoClassDate,
  roomStatus,
  type ScheduleArtifact,
} from "@vacantneu/core";

const DATA_DIR = join(import.meta.dirname, "../../../data");
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function load(): ScheduleArtifact {
  const { term } = JSON.parse(readFileSync(join(DATA_DIR, "current.json"), "utf8"));
  return JSON.parse(readFileSync(join(DATA_DIR, `${term}.json`), "utf8"));
}

function dayLabel(mask: number): string {
  return DAY_NAMES.filter((_, i) => (mask & (1 << i)) !== 0).join("");
}

const artifact = load();
// Treat a bare "YYYY-MM-DDTHH:MM" as campus-local by pinning it to Eastern time.
const atArg = arg("at");
const instant = atArg
  ? new Date(/[Z+]|-\d{2}:\d{2}$/.test(atArg.slice(10)) ? atArg : `${atArg}:00-04:00`)
  : new Date();

const roomArg = arg("room");
const buildingArg = arg("building");

if (roomArg) {
  const id = roomArg.toUpperCase();
  const room = artifact.rooms.find((r) => r.id === id);
  if (!room) {
    console.error(`No room "${id}". Try: ${artifact.rooms.slice(0, 3).map((r) => r.id).join(", ")}`);
    process.exit(1);
  }
  const meetings = indexMeetingsByRoom(artifact.meetings).get(id) ?? [];
  console.log(`\n${room.displayName}  (${id}) — ${meetings.length} scheduled meetings\n`);
  for (const m of [...meetings].sort((a, b) => a.start - b.start || a.days - b.days)) {
    console.log(
      `  ${dayLabel(m.days).padEnd(8)} ${formatMinutes(m.start)}–${formatMinutes(m.end)}` +
        `  ${m.course.padEnd(10)} ${m.startDate}→${m.endDate}  ${m.title}`,
    );
  }
  const status = roomStatus(id, meetings, instant, artifact.calendar);
  console.log(`\n  Right now: ${status.state.toUpperCase()}`);
  if (status.current) console.log(`  In session: ${status.current.course} — ${status.current.title}`);
  if (status.minutesUntilChange !== null) {
    const verb = status.state === "free" ? "free for another" : "busy for another";
    console.log(`  ${verb} ${formatDuration(status.minutesUntilChange)}`);
  } else {
    console.log("  Nothing else scheduled today.");
  }
} else if (process.argv.includes("--free")) {
  const statuses = allRoomStatuses(artifact, instant);
  const byId = new Map(artifact.rooms.map((r) => [r.id, r]));
  const free = statuses.filter((s) => s.state === "free");
  const noClassToday = isNoClassDate(artifact.calendar, instant.toISOString().slice(0, 10));

  console.log(`\nAt ${instant.toLocaleString("en-US", { timeZone: "America/New_York" })} ET`);
  console.log(`${free.length} of ${statuses.length} known rooms have no class scheduled.`);
  if (noClassToday) console.log("(University holiday — no classes at all today.)");
  if (statuses.some((s) => s.scheduleUnreliable)) {
    console.log("(Exam period — the regular class schedule does not apply.)");
  }

  const soonest = free
    .filter((s) => s.minutesUntilChange !== null)
    .sort((a, b) => (a.minutesUntilChange ?? 0) - (b.minutesUntilChange ?? 0))
    .slice(0, 10);
  if (soonest.length > 0) {
    console.log("\nFree now but reclaimed soonest:");
    for (const s of soonest) {
      console.log(
        `  ${(byId.get(s.roomId)?.displayName ?? s.roomId).padEnd(42)}` +
          ` free ${formatDuration(s.minutesUntilChange!)} (next: ${s.next?.course})`,
      );
    }
  }
  const allDay = free.filter((s) => s.minutesUntilChange === null).length;
  console.log(`\n${allDay} rooms have nothing scheduled for the rest of the day.`);
} else if (buildingArg) {
  const code = buildingArg.toUpperCase();
  const building = artifact.buildings.find((b) => b.code === code);
  if (!building) {
    console.error(`No building "${code}".`);
    process.exit(1);
  }
  const index = indexMeetingsByRoom(artifact.meetings);
  console.log(`\n${building.name} (${code}) — ${building.roomCount} rooms\n`);
  for (const room of artifact.rooms.filter((r) => r.building === code)) {
    const s = roomStatus(room.id, index.get(room.id) ?? [], instant, artifact.calendar);
    const detail =
      s.state === "free"
        ? s.minutesUntilChange === null
          ? "free — nothing else today"
          : `free for ${formatDuration(s.minutesUntilChange)}`
        : `${s.current?.course} until ${formatMinutes(s.current!.end)}`;
    console.log(`  ${room.room.padEnd(10)} ${s.state === "free" ? "○" : "●"} ${detail}`);
  }
} else {
  console.log(`\n${artifact.term.description} (${artifact.term.code}) — scraped ${artifact.generatedAt}`);
  console.log(`${artifact.buildings.length} buildings, ${artifact.rooms.length} rooms, ${artifact.meetings.length} meetings\n`);
  for (const b of artifact.buildings) {
    console.log(`  ${b.code.padEnd(6)} ${b.name.padEnd(36)} ${String(b.roomCount).padStart(3)} rooms`);
  }
  console.log("\nTry: pnpm inspect --free | --room DG-070 | --building SL");
}
