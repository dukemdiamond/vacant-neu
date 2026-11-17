import { describe, expect, it } from "vitest";
import { MatchScore, dedupeMeetings, parseBookingQuery, searchBookings } from "./search.js";
import type { Meeting } from "./types.js";

function cls(roomId: string, label: string, detail: string, extra: Partial<Meeting> = {}): Meeting {
  return {
    roomId,
    kind: "class",
    days: 2 | 16,
    start: 925,
    end: 1025,
    startDate: "2026-09-09",
    endDate: "2026-12-09",
    label,
    detail,
    ...extra,
  };
}

function score(query: string, meeting: Meeting): number {
  return parseBookingQuery(query)?.match(meeting) ?? MatchScore.None;
}

const systems = cls("WVH-210", "CS3650", "Computer Systems");
const distributed = cls("SJ-902", "CS6650", "Building Scalable Distributed Systems");
const networks = cls("SH-425", "EECE7374", "Fundamentals of Computer Networks");
const healthcare = cls("SH-425", "PHTH1260", "The U.S. Healthcare System");
const chem = cls("RI-200", "CHEM1211", "General Chemistry 1");

describe("course codes", () => {
  it("matches the exact code, and never a code one edit away", () => {
    expect(score("CS3650", systems)).toBe(MatchScore.Code);
    expect(score("CS3650", distributed)).toBe(MatchScore.None);
  });

  it("accepts a space, a hyphen, or any case between subject and number", () => {
    for (const q of ["cs 3650", "cs-3650", "Cs3650", " CS 3650 "]) {
      expect(score(q, systems), q).toBe(MatchScore.Code);
    }
  });

  it("treats a partial code as one still being typed", () => {
    expect(score("cs36", systems)).toBeGreaterThan(0);
    expect(score("cs36", distributed)).toBe(MatchScore.None);
  });

  it("finds a subject's courses by the bare subject, and only that subject's", () => {
    expect(score("cs", systems)).toBeGreaterThan(0);
    expect(score("ch", chem)).toBe(MatchScore.None);
  });

  it("matches a bare course number", () => {
    expect(score("3650", systems)).toBeGreaterThan(0);
    expect(score("3650", distributed)).toBe(MatchScore.None);
  });
});

describe("titles", () => {
  it("needs every word in the same booking", () => {
    expect(score("computer systems", systems)).toBe(MatchScore.Title);
    expect(score("computer systems", networks)).toBe(MatchScore.None);
    expect(score("computer systems", healthcare)).toBe(MatchScore.None);
  });

  it("folds plurals both ways", () => {
    expect(score("computer system", systems)).toBeGreaterThan(0);
    expect(score("healthcare systems", healthcare)).toBeGreaterThan(0);
  });

  it("lets only the last word match as a prefix", () => {
    expect(score("computer sys", systems)).toBe(MatchScore.Phrase);
    expect(score("comp systems", systems)).toBe(MatchScore.None);
  });

  it("ranks a phrase above the same words out of order", () => {
    expect(score("systems computer", systems)).toBe(MatchScore.Words);
    expect(score("scalable distributed", distributed)).toBe(MatchScore.Phrase);
    expect(score("computer systems", systems)).toBe(MatchScore.Title);
  });

  it("ignores stop words the title does not have", () => {
    expect(score("fundamentals computer networks", networks)).toBeGreaterThan(0);
    expect(score("foundations of networks", networks)).toBe(MatchScore.None);
  });

  it("does not let a title word that only resembles the query through", () => {
    expect(score("chemistry", cls("X-1", "BIOL1111", "General Biology 1"))).toBe(MatchScore.None);
  });

  it("matches an event by its name or its club, and keeps numbers in names literal", () => {
    const event: Meeting = {
      ...systems,
      kind: "event",
      label: "Week 3 Hack Night",
      detail: "Oasis",
    };
    expect(score("hack night", event)).toBe(MatchScore.Phrase);
    expect(score("oasis", event)).toBeGreaterThan(0);
    expect(score("week 3", event)).toBeGreaterThan(0);
  });
});

describe("searchBookings", () => {
  const rooms = new Map<string, Meeting[]>([
    ["SH-425", [networks, healthcare]],
    ["WVH-210", [systems]],
    [
      "SL-121",
      [
        cls("SL-121", "CS3650", "Computer Systems", {
          startDate: "2026-12-15",
          endDate: "2026-12-15",
        }),
      ],
    ],
    [
      "OLD-1",
      [
        cls("OLD-1", "CS3650", "Computer Systems", {
          startDate: "2026-09-01",
          endDate: "2026-09-01",
        }),
      ],
    ],
  ]);

  it("returns only rooms where one booking answers the whole query", () => {
    const hits = searchBookings("computer systems", rooms, "2026-11-17");
    expect([...hits.keys()].sort()).toEqual(["SL-121", "WVH-210"]);
  });

  it("drops bookings that are already over", () => {
    expect(searchBookings("CS3650", rooms, "2026-11-17").has("OLD-1")).toBe(false);
    expect(searchBookings("CS3650", rooms).has("OLD-1")).toBe(true);
  });

  it("tells a regular class apart from a one-off session", () => {
    const hits = searchBookings("CS3650", rooms, "2026-11-17");
    expect(hits.get("WVH-210")?.recurring).toBe(true);
    expect(hits.get("SL-121")?.recurring).toBe(false);
  });

  it("explains a match with the best bookings only, each once", () => {
    const room = new Map([
      ["R-1", [systems, { ...systems }, cls("R-1", "CS2500", "Fundamentals of CS")]],
    ]);
    const hit = searchBookings("CS3650", room).get("R-1")!;
    expect(hit.score).toBe(MatchScore.Code);
    expect(hit.meetings.map((m) => m.label)).toEqual(["CS3650"]);
  });

  it("returns nothing for an empty query", () => {
    expect(searchBookings("  ", rooms).size).toBe(0);
  });
});

describe("dedupeMeetings", () => {
  it("collapses identical rows and keeps the first of each, in order", () => {
    const capstone = cls("BK-010", "MEIE4702", "Capstone Design 2");
    const out = dedupeMeetings([capstone, { ...capstone }, systems, { ...capstone }]);
    expect(out).toEqual([capstone, systems]);
  });

  it("keeps rows that differ in any field", () => {
    const a = cls("BK-010", "MEIE4702", "Capstone Design 2");
    expect(
      dedupeMeetings([a, { ...a, start: a.start + 5 }, { ...a, roomId: "BK-011" }]),
    ).toHaveLength(3);
  });
});
