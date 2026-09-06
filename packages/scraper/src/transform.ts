/**
 * Turns raw Banner sections into the normalized buildings / rooms / meetings model.
 *
 * The interesting work is filtering: only about half of Banner's meeting rows describe a physical
 * room at all. Online, "One-On-One", and study-abroad sections carry no building, and other
 * campuses (NYC, Oakland, London, Seattle, Portland) are out of scope for v1.
 */
import type { Building, Meeting, Room } from "@vacantneu/core";
import { DAY_BITS } from "@vacantneu/core";
import type { BannerMeetingTime, BannerSection } from "./schema.js";

export const BOSTON_CAMPUS = "BOS";

/**
 * Banner building codes that appear in room assignments but aren't usable study spaces.
 * Kept out of the room inventory so we never send someone to a subway stop.
 */
const EXCLUDED_BUILDINGS = new Set([
  "BOS", // Generic "Boston" placeholder, not a building.
  "RG", // Ruggles Station (the MBTA stop).
]);

/** "0800" -> 480 minutes since midnight. Returns null for malformed or absent times. */
export function parseBannerTime(value: string | null): number | null {
  if (!value || !/^\d{4}$/.test(value)) return null;
  const hours = Number(value.slice(0, 2));
  const minutes = Number(value.slice(2, 4));
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** "09/09/2026" -> "2026-09-09". Returns null for malformed dates. */
export function parseBannerDate(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;
  return `${match[3]}-${match[1]}-${match[2]}`;
}

/** Collapses Banner's seven booleans into a single bitmask. */
export function parseDays(mt: BannerMeetingTime): number {
  return (
    (mt.monday ? DAY_BITS.Mon : 0) |
    (mt.tuesday ? DAY_BITS.Tue : 0) |
    (mt.wednesday ? DAY_BITS.Wed : 0) |
    (mt.thursday ? DAY_BITS.Thu : 0) |
    (mt.friday ? DAY_BITS.Fri : 0) |
    (mt.saturday ? DAY_BITS.Sat : 0) |
    (mt.sunday ? DAY_BITS.Sun : 0)
  );
}

/**
 * Normalizes a room number for use in a key.
 * Banner is inconsistent about leading zeros and whitespace ("070" vs "70"), so searching for
 * either spelling has to land on the same room.
 */
export function normalizeRoom(room: string): string {
  return room.trim().toUpperCase();
}

export function roomId(building: string, room: string): string {
  return `${building.trim().toUpperCase()}-${normalizeRoom(room)}`;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  rsquo: "\u2019",
  lsquo: "\u2018",
  ldquo: "\u201c",
  rdquo: "\u201d",
  mdash: "\u2014",
  ndash: "\u2013",
  nbsp: " ",
};

function decodeOnce(value: string): string {
  return value
    .replace(/&#(\d+);/g, (m, code: string) => {
      const n = Number(code);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    })
    .replace(/&#x([0-9a-f]+);/gi, (m, hex: string) => {
      const n = Number.parseInt(hex, 16);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    })
    .replace(/&([a-z]+);/gi, (m, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

/**
 * Decodes the HTML entities Banner embeds in course titles ("Fin Accounting &amp; Reporting").
 * Left alone these render literally in the UI and break substring search.
 *
 * Some titles are double-encoded ("&amp;#8217;"), so decoding runs to a fixed point rather than
 * once. The iteration is bounded: a title of literal ampersands must not loop forever, and an
 * unknown entity is deliberately left as-is rather than mangled.
 */
export function decodeEntities(value: string): string {
  let current = value;
  for (let i = 0; i < 3; i++) {
    const next = decodeOnce(current);
    if (next === current) break;
    current = next;
  }
  return current;
}

export interface TransformResult {
  buildings: Building[];
  rooms: Room[];
  meetings: Meeting[];
  /** Counters explaining what was dropped, surfaced by the CLI so filtering stays auditable. */
  stats: {
    sections: number;
    meetingRows: number;
    skippedNoRoom: number;
    skippedOtherCampus: number;
    skippedExcludedBuilding: number;
    skippedBadTime: number;
    skippedNoDays: number;
  };
}

export function transform(sections: BannerSection[], campus = BOSTON_CAMPUS): TransformResult {
  const stats: TransformResult["stats"] = {
    sections: sections.length,
    meetingRows: 0,
    skippedNoRoom: 0,
    skippedOtherCampus: 0,
    skippedExcludedBuilding: 0,
    skippedBadTime: 0,
    skippedNoDays: 0,
  };

  const buildingNames = new Map<string, string>();
  const rooms = new Map<string, Room>();
  const meetings: Meeting[] = [];

  for (const section of sections) {
    for (const entry of section.meetingsFaculty ?? []) {
      const mt = entry.meetingTime;
      if (!mt) continue;
      stats.meetingRows++;

      if (!mt.building || !mt.room) {
        stats.skippedNoRoom++;
        continue;
      }
      if (mt.campus !== campus) {
        stats.skippedOtherCampus++;
        continue;
      }

      const building = mt.building.trim().toUpperCase();
      if (EXCLUDED_BUILDINGS.has(building)) {
        stats.skippedExcludedBuilding++;
        continue;
      }

      const start = parseBannerTime(mt.beginTime);
      const end = parseBannerTime(mt.endTime);
      const startDate = parseBannerDate(mt.startDate);
      const endDate = parseBannerDate(mt.endDate);

      // A meeting with no usable clock time (TBA) tells us nothing about occupancy. Dropping it
      // is the honest choice: we cannot claim the room is busy, and we must not claim it's free
      // on the strength of a row we couldn't read.
      if (start === null || end === null || end <= start || !startDate || !endDate) {
        stats.skippedBadTime++;
        continue;
      }

      const days = parseDays(mt);
      if (days === 0) {
        stats.skippedNoDays++;
        continue;
      }

      const room = normalizeRoom(mt.room);
      const id = roomId(building, room);

      if (mt.buildingDescription) buildingNames.set(building, mt.buildingDescription.trim());
      if (!rooms.has(id)) {
        rooms.set(id, {
          id,
          building,
          room,
          displayName: `${buildingNames.get(building) ?? building} ${room}`,
        });
      }

      meetings.push({
        roomId: id,
        kind: "class",
        days,
        start,
        end,
        startDate,
        endDate,
        label: `${section.subject}${section.courseNumber}`,
        detail: decodeEntities(section.courseTitle?.trim() ?? ""),
      });
    }
  }

  // Room display names are built as rooms are first seen, but a building's description may only
  // appear on a later row. Rewrite them once all names are known.
  for (const room of rooms.values()) {
    room.displayName = `${buildingNames.get(room.building) ?? room.building} ${room.room}`;
  }

  const roomsByBuilding = new Map<string, number>();
  for (const room of rooms.values()) {
    roomsByBuilding.set(room.building, (roomsByBuilding.get(room.building) ?? 0) + 1);
  }

  const buildings: Building[] = [...roomsByBuilding]
    .map(([code, roomCount]) => ({ code, name: buildingNames.get(code) ?? code, roomCount }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    buildings,
    rooms: [...rooms.values()].sort((a, b) => a.id.localeCompare(b.id)),
    // Sorted so re-running the scraper produces a byte-identical artifact and the daily cron
    // doesn't churn commits when nothing actually changed.
    meetings: meetings.sort(
      (a, b) =>
        a.roomId.localeCompare(b.roomId) ||
        a.startDate.localeCompare(b.startDate) ||
        a.start - b.start ||
        a.label.localeCompare(b.label),
    ),
    stats,
  };
}
