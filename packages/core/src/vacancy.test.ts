import { describe, expect, it } from "vitest";
import { ACADEMIC_CALENDAR_2026_2027 as CAL } from "./calendar.js";
import { campusTime, formatDuration, formatMinutes, formatRange } from "./time.js";
import { DAY_BITS, type AcademicCalendar, type Meeting } from "./types.js";
import { isFreeFor, roomStatus } from "./vacancy.js";

const { Mon, Wed, Thu } = DAY_BITS;

/** Dodge Hall 070, MWR 8:00-9:05, full Fall 2026 semester (a real row from the Banner scrape). */
const dodge: Meeting = {
  roomId: "DG-070",
  days: Mon | Wed | Thu,
  start: 8 * 60,
  end: 9 * 60 + 5,
  startDate: "2026-09-09",
  endDate: "2026-12-20",
  course: "CS2500",
  title: "Fundamentals of Computer Science 1",
};

/** Campus-local instant helper. EDT is UTC-4 in Sept/Oct, EST is UTC-5 from Nov 1. */
const edt = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00-04:00`);
const est = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00-05:00`);

describe("campusTime", () => {
  it("reads the wall clock in campus time regardless of the caller's timezone", () => {
    // 08:30 EDT on a Wednesday.
    const t = campusTime(edt("2026-09-16", "08:30"));
    expect(t.date).toBe("2026-09-16");
    expect(t.minutes).toBe(510);
    expect(t.dayBit).toBe(Wed);
  });

  it("handles the EDT->EST transition", () => {
    // Nov 4 2026 is after the Nov 1 DST change, so campus is UTC-5.
    expect(campusTime(est("2026-11-04", "08:30")).date).toBe("2026-11-04");
    expect(campusTime(est("2026-11-04", "08:30")).minutes).toBe(510);
  });

  it("does not roll the date backwards for a late-evening class", () => {
    const t = campusTime(edt("2026-09-16", "22:15"));
    expect(t.date).toBe("2026-09-16");
    expect(t.minutes).toBe(22 * 60 + 15);
  });
});

describe("roomStatus", () => {
  it("reports occupied mid-class, with time until the room empties", () => {
    const s = roomStatus("DG-070", [dodge], edt("2026-09-16", "08:30"), CAL);
    expect(s.state).toBe("occupied");
    expect(s.current?.course).toBe("CS2500");
    expect(s.minutesUntilChange).toBe(35);
  });

  it("reports free overnight", () => {
    const s = roomStatus("DG-070", [dodge], edt("2026-09-16", "03:00"), CAL);
    expect(s.state).toBe("free");
    expect(s.minutesUntilChange).toBe(300); // 3:00 -> 8:00
    expect(s.next?.course).toBe("CS2500");
  });

  it("is free on a weekday the class does not meet", () => {
    // Tuesday: the class meets Mon/Wed/Thu.
    const s = roomStatus("DG-070", [dodge], edt("2026-09-15", "08:30"), CAL);
    expect(s.state).toBe("free");
    expect(s.minutesUntilChange).toBeNull();
  });

  it("treats beginTime as inclusive and endTime as exclusive", () => {
    expect(roomStatus("DG-070", [dodge], edt("2026-09-16", "08:00"), CAL).state).toBe("occupied");
    // 9:05 is the end time; the room is free the instant class ends.
    expect(roomStatus("DG-070", [dodge], edt("2026-09-16", "09:05"), CAL).state).toBe("free");
    expect(roomStatus("DG-070", [dodge], edt("2026-09-16", "07:59"), CAL).state).toBe("free");
  });

  it("is free before the term's first meeting date", () => {
    // Sept 8 is a Tuesday before classes begin; also outside the meeting's date range.
    const s = roomStatus("DG-070", [dodge], edt("2026-09-02", "08:30"), CAL);
    expect(s.state).toBe("free");
  });

  it("is free on a university holiday even though the day-of-week matches", () => {
    // Nov 11 2026 (Veterans Day) is a Wednesday inside the meeting's date range.
    expect(campusTime(est("2026-11-11", "08:30")).dayBit).toBe(Wed);
    const s = roomStatus("DG-070", [dodge], est("2026-11-11", "08:30"), CAL);
    expect(s.state).toBe("free");
    expect(s.next).toBeNull();
  });

  it("is free during Thanksgiving break", () => {
    // Nov 25 2026 is a Wednesday; fall break runs Nov 25-29.
    const s = roomStatus("DG-070", [dodge], est("2026-11-25", "08:30"), CAL);
    expect(s.state).toBe("free");
  });

  it("does not let a half-semester meeting block the rest of the term", () => {
    const sessionA: Meeting = {
      ...dodge,
      startDate: "2026-09-09",
      endDate: "2026-10-25",
      course: "MGMT1000",
    };
    expect(roomStatus("DG-070", [sessionA], edt("2026-10-14", "08:30"), CAL).state).toBe(
      "occupied",
    );
    // Same weekday and time in November, after the session ended.
    expect(roomStatus("DG-070", [sessionA], est("2026-11-18", "08:30"), CAL).state).toBe("free");
  });

  it("flags exam periods, where Banner's class schedule no longer applies", () => {
    const s = roomStatus("DG-070", [dodge], est("2026-12-16", "08:30"), CAL);
    expect(s.scheduleUnreliable).toBe(true);
  });

  it("chains back-to-back classes into one occupied block", () => {
    const second: Meeting = { ...dodge, start: 9 * 60 + 5, end: 10 * 60 + 10, course: "CS2510" };
    const s = roomStatus("DG-070", [dodge, second], edt("2026-09-16", "08:30"), CAL);
    expect(s.state).toBe("occupied");
    // Free at 10:10, not 9:05 — the next class starts the moment this one ends.
    expect(s.minutesUntilChange).toBe(100);
  });

  it("reports the class actually in the room, not just the block's first class", () => {
    const second: Meeting = { ...dodge, start: 9 * 60 + 5, end: 10 * 60 + 10, course: "CS2510" };
    const s = roomStatus("DG-070", [dodge, second], edt("2026-09-16", "09:30"), CAL);
    expect(s.current?.course).toBe("CS2510");
  });

  it("reports a real gap between classes honestly", () => {
    const later: Meeting = { ...dodge, start: 9 * 60 + 15, end: 10 * 60 + 20, course: "CS2510" };
    const s = roomStatus("DG-070", [dodge, later], edt("2026-09-16", "09:05"), CAL);
    expect(s.state).toBe("free");
    expect(s.minutesUntilChange).toBe(10);
  });

  it("handles overlapping meetings (double-booked rooms exist in Banner)", () => {
    const overlap: Meeting = { ...dodge, start: 8 * 60 + 30, end: 10 * 60, course: "ENGW1111" };
    const s = roomStatus("DG-070", [dodge, overlap], edt("2026-09-16", "09:30"), CAL);
    expect(s.state).toBe("occupied");
    expect(s.minutesUntilChange).toBe(30);
  });

  it("treats a room with no meetings at all as free", () => {
    const s = roomStatus("XX-100", [], edt("2026-09-16", "08:30"), CAL);
    expect(s.state).toBe("free");
    expect(s.minutesUntilChange).toBeNull();
  });
});

describe("isFreeFor", () => {
  const at = (hhmm: string) => roomStatus("DG-070", [dodge], edt("2026-09-16", hhmm), CAL);

  it("rejects an occupied room", () => {
    expect(isFreeFor(at("08:30"), 30)).toBe(false);
  });

  it("rejects a gap shorter than the requested window", () => {
    // 07:30 leaves only 30 minutes before the 08:00 class.
    expect(isFreeFor(at("07:30"), 60)).toBe(false);
    expect(isFreeFor(at("07:30"), 30)).toBe(true);
  });

  it("accepts a room with nothing left on the schedule today", () => {
    expect(isFreeFor(at("18:00"), 240)).toBe(true);
  });

  it("treats an empty calendar as having no holidays", () => {
    const empty: AcademicCalendar = { noClassDates: [], examPeriods: [] };
    const s = roomStatus("DG-070", [dodge], est("2026-11-11", "08:30"), empty);
    expect(s.state).toBe("occupied");
  });
});

describe("formatting", () => {
  it("formats times as 12-hour labels", () => {
    expect(formatMinutes(0)).toBe("12:00 AM");
    expect(formatMinutes(545)).toBe("9:05 AM");
    expect(formatMinutes(720)).toBe("12:00 PM");
    expect(formatMinutes(1345)).toBe("10:25 PM");
  });

  it("formats durations compactly", () => {
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(135)).toBe("2h 15m");
  });
});

describe("formatRange", () => {
  it("prints the meridiem once when both ends share it", () => {
    expect(formatRange(555, 620)).toBe("9:15 to 10:20 AM");
    expect(formatRange(870, 990)).toBe("2:30 to 4:30 PM");
  });

  it("prints both when the range crosses noon or midnight", () => {
    expect(formatRange(690, 810)).toBe("11:30 AM to 1:30 PM");
    expect(formatRange(1380, 1439)).toBe("11:00 to 11:59 PM");
  });
});
