import { describe, expect, it } from "vitest";
import { DAY_BITS } from "@vacantneu/core";
import { parseEventDates, toMeetings, transformEvents } from "./engage-transform.js";
import { createMatcher, isNonLocation, isRedacted } from "./location.js";

/** A slice of the real inventory, enough to exercise every alias path. */
const ROOMS = [
  "WVH-110",
  "WVG-106",
  "WVG-104",
  "RB-409",
  "HS-210",
  "EV-008",
  "SL-002",
  "RY-155",
  "DG-070",
  "BK-007",
];
const BUILDINGS = [
  { code: "WVH", name: "West Village H" },
  { code: "WVG", name: "West Village G" },
  { code: "RB", name: "Robinson Hall" },
  { code: "HS", name: "Hastings Suite" },
  { code: "EV", name: "East Village" },
  { code: "SL", name: "Snell Library" },
  { code: "RY", name: "Ryder Hall" },
  { code: "DG", name: "Dodge Hall" },
  { code: "BK", name: "Behrakis Health Sciences Cntr" },
];
const match = (venue: string) => createMatcher(ROOMS, BUILDINGS).match(venue)?.roomId ?? null;

describe("venue matching", () => {
  it("resolves the spellings Engage actually uses", () => {
    // Every one of these is a real location string from the live feed or the seed dataset.
    expect(match("West Village H Room 110")).toBe("WVH-110");
    expect(match("West Village G 106")).toBe("WVG-106");
    expect(match("West Village G Room 104")).toBe("WVG-104");
    expect(match("Robinson Hall 409")).toBe("RB-409");
    expect(match("Hastings 210")).toBe("HS-210");
    expect(match("EV 008")).toBe("EV-008");
  });

  it("tolerates the padding students leave off", () => {
    // Banner stores "008" and "070"; nobody types the leading zeros.
    expect(match("EV 8")).toBe("EV-008");
    expect(match("Dodge Hall 70")).toBe("DG-070");
    expect(match("Behrakis 7")).toBe("BK-007");
  });

  it("reads a room number written before the building", () => {
    expect(match("409 Robinson")).toBe("RB-409");
  });

  it("is case and punctuation insensitive", () => {
    expect(match("west village h, room 110")).toBe("WVH-110");
    expect(match("SNELL LIBRARY 002")).toBe("SL-002");
  });

  it("refuses a building it knows when the room is not one we track", () => {
    // Naming a real building is not licence to invent a room inside it.
    expect(match("Behrakis Health Science Center 4th floor labs")).toBeNull();
    expect(match("Ryder Hall 999")).toBeNull();
    expect(match("Snell Library")).toBeNull();
  });

  it("returns nothing for buildings outside the inventory", () => {
    // Curry, Egan and Marino host no scheduled classes, so we track no rooms in them.
    expect(match("Curry 348")).toBeNull();
    expect(match("440 Egan")).toBeNull();
    expect(match("Marino Recreational Center")).toBeNull();
    expect(match("Raytheon Amphitheater")).toBeNull();
    expect(match("BU Beach")).toBeNull();
  });

  it("does not match a building code hiding inside another word", () => {
    // "EV" must not fire on "Event" or "Seven".
    expect(match("Evening Social 008")).toBeNull();
    expect(match("Seven Hills Meetup 008")).toBeNull();
  });

  it("classifies the non-locations Engage emits", () => {
    expect(isRedacted("Private Location (sign in to display)")).toBe(true);
    expect(isRedacted("Private Location (register to display)")).toBe(true);
    expect(isNonLocation("TBD")).toBe(true);
    expect(isNonLocation("Online Event")).toBe(true);
    expect(isNonLocation("   ")).toBe(true);
    expect(isNonLocation("Robinson Hall 409")).toBe(false);
    expect(match("TBD")).toBeNull();
    expect(match("Private Location (sign in to display)")).toBeNull();
  });
});

describe("parseEventDates", () => {
  it("parses the same-day shape", () => {
    // Verbatim from the live feed.
    expect(
      parseEventDates(
        "<p style='margin:0;'>Sat, Sep 5, 2026</p><p style='margin:0;'>7 PM &ndash; 9 PM</p>",
      ),
    ).toEqual({
      startDate: "2026-09-05",
      startMinutes: 19 * 60,
      endDate: "2026-09-05",
      endMinutes: 21 * 60,
    });
  });

  it("parses half hours on either side", () => {
    expect(parseEventDates("<p>Sun, Sep 6, 2026</p><p>1:30 PM &ndash; 2:30 PM</p>")).toMatchObject({
      startMinutes: 13 * 60 + 30,
      endMinutes: 14 * 60 + 30,
    });
    expect(parseEventDates("<p>Wed, Sep 16, 2026</p><p>11:30 AM &ndash; 7 PM</p>")).toMatchObject({
      startMinutes: 11 * 60 + 30,
      endMinutes: 19 * 60,
    });
  });

  it("parses the spanning shape, where each paragraph carries its own date", () => {
    expect(
      parseEventDates(
        "<p style='margin:0;'>Fri, Sep 11, 2026 8:00 PM &ndash; </p>" +
          "<p style='margin:0;'>Sat, Sep 12, 2026 12:00 AM</p>",
      ),
    ).toEqual({
      startDate: "2026-09-11",
      startMinutes: 20 * 60,
      endDate: "2026-09-12",
      endMinutes: 0,
    });
  });

  it("handles noon and midnight without wrapping", () => {
    expect(parseEventDates("<p>Wed, Sep 16, 2026</p><p>12 PM &ndash; 1 PM</p>")).toMatchObject({
      startMinutes: 12 * 60,
      endMinutes: 13 * 60,
    });
    expect(parseEventDates("<p>Wed, Sep 16, 2026</p><p>12 AM &ndash; 1 AM</p>")).toMatchObject({
      startMinutes: 0,
      endMinutes: 60,
    });
  });

  it("returns null rather than guessing at unreadable input", () => {
    expect(parseEventDates("")).toBeNull();
    expect(parseEventDates("<p>Sometime next week</p>")).toBeNull();
    expect(parseEventDates("<p>Wed, Sep 16, 2026</p><p>all day</p>")).toBeNull();
  });
});

describe("toMeetings", () => {
  const dates = (o: Partial<Parameters<typeof toMeetings>[1]> = {}) => ({
    startDate: "2026-09-16",
    startMinutes: 18 * 60,
    endDate: "2026-09-16",
    endMinutes: 19 * 60,
    ...o,
  });

  it("produces one meeting for a same-day event", () => {
    const [m] = toMeetings("EV-008", dates(), "Loteria Night", "ALPFA");
    expect(m).toEqual({
      roomId: "EV-008",
      kind: "event",
      days: DAY_BITS.Wed,
      start: 1080,
      end: 1140,
      startDate: "2026-09-16",
      endDate: "2026-09-16",
      label: "Loteria Night",
      detail: "ALPFA",
    });
  });

  it("splits an overnight event at midnight", () => {
    // A meeting cannot straddle midnight, because the engine works in minutes within one day.
    const out = toMeetings(
      "RB-409",
      dates({
        startDate: "2026-09-11",
        startMinutes: 20 * 60,
        endDate: "2026-09-12",
        endMinutes: 0,
      }),
      "Welcomeback Kickback",
      "NASO",
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ startDate: "2026-09-11", start: 1200, end: 1440 });
  });

  it("covers both days when an event genuinely runs past midnight", () => {
    const out = toMeetings(
      "RB-409",
      dates({
        startDate: "2026-09-12",
        startMinutes: 20 * 60,
        endDate: "2026-09-13",
        endMinutes: 60,
      }),
      "College Clash",
      "NASO",
    );
    expect(out.map((m) => [m.startDate, m.start, m.end])).toEqual([
      ["2026-09-12", 1200, 1440],
      ["2026-09-13", 0, 60],
    ]);
    expect(out[1]!.days).toBe(DAY_BITS.Sun);
  });

  it("caps a run-on listing rather than occupying a room for a week", () => {
    const out = toMeetings(
      "RB-409",
      dates({
        startDate: "2026-08-31",
        startMinutes: 9 * 60,
        endDate: "2026-09-08",
        endMinutes: 600,
      }),
      "Welcome Week Hub",
      "CSI",
    );
    expect(out.length).toBeLessThanOrEqual(3);
  });

  it("drops an event that ends before it starts", () => {
    expect(toMeetings("EV-008", dates({ endMinutes: 17 * 60 }), "Broken", "Club")).toEqual([]);
  });
});

describe("transformEvents", () => {
  const event = (over: Record<string, string> = {}) => ({
    eventName: "Loteria Night",
    clubName: "Association of Latino Professionals for America",
    eventLocation: "Hastings 210",
    eventDates: "<p>Tue, Sep 15, 2026</p><p>6 PM &ndash; 7 PM</p>",
    ...over,
  });

  it("keeps events in rooms we track and counts the rest", () => {
    const result = transformEvents(
      [
        event(),
        event({ eventLocation: "Private Location (sign in to display)" }),
        event({ eventLocation: "TBD" }),
        event({ eventLocation: "Curry 348" }),
        event({ eventDates: "<p>nonsense</p>" }),
      ],
      ROOMS,
      BUILDINGS,
    );
    expect(result.meetings).toHaveLength(1);
    expect(result.meetings[0]).toMatchObject({
      roomId: "HS-210",
      kind: "event",
      label: "Loteria Night",
    });
    expect(result.stats).toMatchObject({
      events: 5,
      matched: 1,
      redacted: 1,
      noLocation: 1,
      // "Curry 348" names a building we track no rooms in; the nonsense-dates event has a
      // perfectly good venue, so it is counted against the date parser instead.
      unmatchedVenue: 1,
      unparsedDates: 1,
    });
  });

  it("reports unresolved venues so the alias table can be tuned", () => {
    const result = transformEvents([event({ eventLocation: "Curry 348" })], ROOMS, BUILDINGS);
    expect(result.unmatchedSamples).toContain("Curry 348");
  });

  it("decodes the entities Engage leaves in names", () => {
    const result = transformEvents(
      [event({ eventName: "Donuts &amp; Donors", clubName: "Bob&#39;s Club" })],
      ROOMS,
      BUILDINGS,
    );
    expect(result.meetings[0]!.label).toBe("Donuts & Donors");
    expect(result.meetings[0]!.detail).toBe("Bob's Club");
  });

  it("orders output deterministically so a re-run does not churn the artifact", () => {
    const a = transformEvents([event(), event({ eventLocation: "EV 008" })], ROOMS, BUILDINGS);
    const b = transformEvents([event({ eventLocation: "EV 008" }), event()], ROOMS, BUILDINGS);
    expect(JSON.stringify(a.meetings)).toBe(JSON.stringify(b.meetings));
  });
});
