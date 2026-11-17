import { describe, expect, it } from "vitest";
import type { BannerSection } from "./schema.js";
import { LEAD_DAYS, chooseTerm, isMainSemester, termSpan, type TermCandidate } from "./term.js";

/** A section whose meetings run over the given MM/DD/YYYY ranges. */
function section(...ranges: [string, string][]): BannerSection {
  return {
    courseReferenceNumber: "10324",
    subject: "CS",
    courseNumber: "2500",
    courseTitle: "Fundamentals of Computer Science 1",
    meetingsFaculty: ranges.map(([startDate, endDate]) => ({
      meetingTime: {
        building: "WVH",
        buildingDescription: "West Village H",
        room: "110",
        campus: "BOS",
        campusDescription: "Boston",
        beginTime: "0800",
        endTime: "0905",
        startDate,
        endDate,
        monday: true,
        tuesday: false,
        wednesday: true,
        thursday: false,
        friday: false,
        saturday: false,
        sunday: false,
      },
    })),
  } as BannerSection;
}

function repeat<T>(n: number, value: T): T[] {
  return Array.from({ length: n }, () => value);
}

describe("isMainSemester", () => {
  it("accepts the full-term semesters", () => {
    expect(isMainSemester("Fall 2026 Semester")).toBe(true);
    expect(isMainSemester("Spring 2027 Semester")).toBe(true);
    expect(isMainSemester("Summer 2026 Semester (View Only)")).toBe(true);
    expect(isMainSemester("Summer Full 2025 Semester (View Only)")).toBe(true);
  });

  it("rejects the overlapping CPS and Law calendars", () => {
    expect(isMainSemester("Fall 2025 CPS Quarter (View Only)")).toBe(false);
    expect(isMainSemester("Summer 2025 CPS Semester (View Only)")).toBe(false);
    expect(isMainSemester("Spring 2025 Law Semester (View Only)")).toBe(false);
  });
});

describe("termSpan", () => {
  it("starts on the common first day, not an off-calendar outlier", () => {
    const span = termSpan([
      ...repeat(40, section(["09/09/2026", "12/20/2026"])),
      section(["08/24/2026", "12/20/2026"]), // A pre-term intensive.
    ]);
    expect(span?.start).toBe("2026-09-09");
  });

  it("ends when nearly everything has ended, ignoring a row that runs long", () => {
    const span = termSpan([
      ...repeat(30, section(["09/09/2026", "12/13/2026"])),
      ...repeat(20, section(["09/09/2026", "12/20/2026"])), // Finals week.
      section(["09/09/2026", "05/02/2027"]), // Mis-dated, or a year-long course.
    ]);
    expect(span?.end).toBe("2026-12-20");
  });

  it("reads every meeting of a section, not just the first", () => {
    const span = termSpan(
      repeat(10, section(["01/13/2027", "02/27/2027"], ["03/15/2027", "05/02/2027"])),
    );
    expect(span).toEqual({ start: "2027-01-13", end: "2027-05-02" });
  });

  it("returns null when nothing is dated", () => {
    expect(termSpan([])).toBeNull();
    expect(termSpan([{ ...section(), meetingsFaculty: [{ meetingTime: null }] }])).toBeNull();
  });
});

describe("chooseTerm", () => {
  // Spans as Banner reported them in November 2026, newest first as Banner lists them.
  const SPRING_27: TermCandidate = {
    code: "202730",
    description: "Spring 2027 Semester",
    span: { start: "2027-01-13", end: "2027-05-02" },
  };
  const FALL_26: TermCandidate = {
    code: "202710",
    description: "Fall 2026 Semester",
    span: { start: "2026-09-09", end: "2026-12-20" },
  };
  const SUMMER_26: TermCandidate = {
    code: "202650",
    description: "Summer 2026 Semester (View Only)",
    span: { start: "2026-05-06", end: "2026-08-16" },
  };
  const SPRING_26: TermCandidate = {
    code: "202630",
    description: "Spring 2026 Semester (View Only)",
    span: { start: "2026-01-07", end: "2026-04-26" },
  };
  const NOV_2026 = [SPRING_27, FALL_26, SUMMER_26];

  const pick = (candidates: TermCandidate[], today: string) =>
    chooseTerm(candidates, today)?.term.code;

  it("keeps the term in session once the next one opens for registration", () => {
    // The regression: Banner lists Spring first from early November, weeks before it starts.
    expect(pick(NOV_2026, "2026-11-10")).toBe("202710");
  });

  it("keeps the term through its finals", () => {
    expect(pick(NOV_2026, "2026-12-20")).toBe("202710");
  });

  it("holds the finished term over a break, until the next is close", () => {
    expect(pick(NOV_2026, "2026-12-21")).toBe("202710");
    expect(pick(NOV_2026, "2027-01-05")).toBe("202710");
  });

  it(`switches ${LEAD_DAYS} days before the next term starts`, () => {
    expect(pick(NOV_2026, "2027-01-06")).toBe("202730");
    expect(pick(NOV_2026, "2027-01-13")).toBe("202730");
    expect(pick(NOV_2026, "2027-03-01")).toBe("202730");
  });

  it("never cuts a term's finals short for an imminent one", () => {
    // Spring finals end Apr 26; Summer starts May 6, inside the lead window from Apr 29.
    const candidates = [SUMMER_26, SPRING_26];
    expect(pick(candidates, "2026-04-26")).toBe("202630");
    expect(pick(candidates, "2026-04-28")).toBe("202630");
    expect(pick(candidates, "2026-04-29")).toBe("202650");
  });

  it("does not depend on Banner's ordering", () => {
    expect(pick([...NOV_2026].reverse(), "2026-11-10")).toBe("202710");
  });

  it("prefers the later-starting of two overlapping terms", () => {
    const full: TermCandidate = {
      code: "202550",
      description: "Summer Full 2025 Semester",
      span: { start: "2025-05-07", end: "2025-08-16" },
    };
    const second: TermCandidate = {
      code: "202560",
      description: "Summer 2 2025 Semester",
      span: { start: "2025-07-01", end: "2025-08-16" },
    };
    expect(pick([second, full], "2025-06-01")).toBe("202550");
    expect(pick([second, full], "2025-07-10")).toBe("202560");
  });

  it("falls back to the earliest upcoming term when nothing has started", () => {
    expect(pick([SPRING_27, FALL_26], "2026-06-01")).toBe("202710");
  });

  it("skips candidates whose dates could not be read", () => {
    const undated = { ...SPRING_27, span: null };
    expect(pick([undated, FALL_26], "2027-02-01")).toBe("202710");
    expect(chooseTerm([undated], "2027-02-01")).toBeNull();
  });

  it("explains the choice", () => {
    expect(chooseTerm(NOV_2026, "2026-11-10")?.reason).toMatch(/in session/);
    expect(chooseTerm(NOV_2026, "2027-01-08")?.reason).toMatch(/start 2027-01-13/);
    expect(chooseTerm(NOV_2026, "2026-12-28")?.reason).toMatch(/between terms/);
  });
});
