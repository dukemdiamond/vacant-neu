import { describe, expect, it } from "vitest";
import { DAY_BITS } from "@vacantneu/core";
import type { BannerSection } from "./schema.js";
import {
  decodeEntities,
  normalizeRoom,
  parseBannerDate,
  parseBannerTime,
  roomId,
  transform,
} from "./transform.js";

describe("parseBannerTime", () => {
  it("converts HHMM to minutes since midnight", () => {
    expect(parseBannerTime("0800")).toBe(480);
    expect(parseBannerTime("0905")).toBe(545);
    expect(parseBannerTime("0000")).toBe(0);
    expect(parseBannerTime("2225")).toBe(1345);
  });

  it("rejects absent or malformed values rather than guessing", () => {
    expect(parseBannerTime(null)).toBeNull();
    expect(parseBannerTime("")).toBeNull();
    expect(parseBannerTime("800")).toBeNull();
    expect(parseBannerTime("TBA")).toBeNull();
    expect(parseBannerTime("2560")).toBeNull();
  });
});

describe("parseBannerDate", () => {
  it("converts MM/DD/YYYY to ISO", () => {
    expect(parseBannerDate("09/09/2026")).toBe("2026-09-09");
    expect(parseBannerDate("12/20/2026")).toBe("2026-12-20");
  });

  it("rejects malformed values", () => {
    expect(parseBannerDate(null)).toBeNull();
    expect(parseBannerDate("2026-09-09")).toBeNull();
  });
});

describe("room keys", () => {
  it("preserves Banner's leading zeros but normalizes case and whitespace", () => {
    expect(normalizeRoom(" 070 ")).toBe("070");
    expect(normalizeRoom("2ab")).toBe("2AB");
    expect(roomId("dg", " 070 ")).toBe("DG-070");
  });
});

/** Builds a Banner-shaped section with one meeting, overriding meetingTime fields as needed. */
function section(overrides: Record<string, unknown> = {}, courseNumber = "2500"): BannerSection {
  return {
    courseReferenceNumber: "10324",
    subject: "CS",
    courseNumber,
    courseTitle: "Fundamentals of Computer Science 1",
    meetingsFaculty: [
      {
        meetingTime: {
          building: "DG",
          buildingDescription: "Dodge Hall",
          room: "070",
          campus: "BOS",
          campusDescription: "Boston",
          beginTime: "0800",
          endTime: "0905",
          startDate: "09/09/2026",
          endDate: "12/20/2026",
          monday: true,
          tuesday: false,
          wednesday: true,
          thursday: true,
          friday: false,
          saturday: false,
          sunday: false,
          ...overrides,
        },
      },
    ],
  } as unknown as BannerSection;
}

describe("transform", () => {
  it("extracts a room and meeting from a well-formed section", () => {
    const { buildings, rooms, meetings } = transform([section()]);
    expect(buildings).toEqual([{ code: "DG", name: "Dodge Hall", roomCount: 1 }]);
    expect(rooms[0]).toEqual({
      id: "DG-070",
      building: "DG",
      room: "070",
      displayName: "Dodge Hall 070",
    });
    expect(meetings[0]).toMatchObject({
      roomId: "DG-070",
      days: DAY_BITS.Mon | DAY_BITS.Wed | DAY_BITS.Thu,
      start: 480,
      end: 545,
      startDate: "2026-09-09",
      endDate: "2026-12-20",
      course: "CS2500",
    });
  });

  it("drops sections with no physical room (online, one-on-one)", () => {
    const { rooms, stats } = transform([section({ building: null, room: null })]);
    expect(rooms).toHaveLength(0);
    expect(stats.skippedNoRoom).toBe(1);
  });

  it("drops other campuses", () => {
    const { rooms, stats } = transform([section({ campus: "OAK", campusDescription: "Oakland" })]);
    expect(rooms).toHaveLength(0);
    expect(stats.skippedOtherCampus).toBe(1);
  });

  it("excludes non-classroom venues like Ruggles Station", () => {
    const { rooms, stats } = transform([
      section({ building: "RG", buildingDescription: "Ruggles Station", room: "1" }),
    ]);
    expect(rooms).toHaveLength(0);
    expect(stats.skippedExcludedBuilding).toBe(1);
  });

  it("drops TBA rows rather than inventing a time", () => {
    const { meetings, stats } = transform([section({ beginTime: null, endTime: null })]);
    expect(meetings).toHaveLength(0);
    expect(stats.skippedBadTime).toBe(1);
  });

  it("drops rows with no meeting days", () => {
    const { meetings, stats } = transform([
      section({ monday: false, wednesday: false, thursday: false }),
    ]);
    expect(meetings).toHaveLength(0);
    expect(stats.skippedNoDays).toBe(1);
  });

  it("drops rows whose end time precedes their start", () => {
    const { meetings, stats } = transform([section({ beginTime: "0905", endTime: "0800" })]);
    expect(meetings).toHaveLength(0);
    expect(stats.skippedBadTime).toBe(1);
  });

  it("deduplicates rooms across many sections and counts rooms per building", () => {
    const { buildings, rooms } = transform([
      section(),
      section({ beginTime: "1000", endTime: "1105" }, "2510"),
      section({ room: "170" }, "3500"),
    ]);
    expect(rooms).toHaveLength(2);
    expect(buildings[0]?.roomCount).toBe(2);
  });

  it("backfills display names when the building description appears on a later row", () => {
    // First row carries no description; a later row for the same building does.
    const { rooms } = transform([
      section({ buildingDescription: null, room: "100" }),
      section({ room: "070" }),
    ]);
    expect(rooms.map((r) => r.displayName)).toEqual(["Dodge Hall 070", "Dodge Hall 100"]);
  });

  it("produces deterministic ordering so re-runs are byte-identical", () => {
    const a = transform([section({ room: "170" }, "3500"), section()]);
    const b = transform([section(), section({ room: "170" }, "3500")]);
    expect(JSON.stringify(a.meetings)).toBe(JSON.stringify(b.meetings));
    expect(JSON.stringify(a.rooms)).toBe(JSON.stringify(b.rooms));
  });

  it("tolerates a section with a null meetingsFaculty array", () => {
    const bare = { ...section(), meetingsFaculty: null } as unknown as BannerSection;
    expect(() => transform([bare])).not.toThrow();
  });
});

describe("decodeEntities", () => {
  it("decodes the entities Banner embeds in course titles", () => {
    expect(decodeEntities("Fin Accounting &amp; Reporting")).toBe("Fin Accounting & Reporting");
    expect(decodeEntities("Women&#39;s Health")).toBe("Women's Health");
    expect(decodeEntities("Design &mdash; Studio")).toBe("Design — Studio");
    expect(decodeEntities("The &quot;Modern&quot; Novel")).toBe('The "Modern" Novel');
  });

  it("handles double-encoded titles", () => {
    expect(decodeEntities("A &amp;amp; B")).toBe("A & B");
  });

  it("leaves unknown entities and plain text alone", () => {
    expect(decodeEntities("Calculus 1")).toBe("Calculus 1");
    expect(decodeEntities("R&D &weird;")).toBe("R&D &weird;");
  });
});

describe("decodeEntities — double encoding", () => {
  it("decodes numeric entities Banner wraps in an extra &amp;", () => {
    expect(decodeEntities("Journalist&amp;#8217;s Toolbox")).toBe("Journalist’s Toolbox");
    expect(decodeEntities("Bouv&amp;#233; Co-op")).toBe("Bouvé Co-op");
    expect(decodeEntities("Capstone&amp;#8212;Research")).toBe("Capstone—Research");
  });

  it("decodes hex entities", () => {
    expect(decodeEntities("caf&#xe9;")).toBe("café");
  });

  it("terminates on pathological input instead of looping", () => {
    expect(decodeEntities("&amp;".repeat(50)).length).toBeLessThanOrEqual(50);
    expect(decodeEntities("&#0;")).toBe("&#0;");
    expect(decodeEntities("&#99999999;")).toBe("&#99999999;");
  });
});
