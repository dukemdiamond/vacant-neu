import { describe, expect, it } from "vitest";
import { refuseOverwrite, upcoming, type EventsSnapshot } from "./events-guard.js";

const TODAY = "2026-11-10";

function snapshot(authenticated: boolean, endDates: string[]): EventsSnapshot {
  return { authenticated, meetings: endDates.map((endDate) => ({ endDate })) };
}

const ahead = (n: number) => Array.from({ length: n }, () => "2026-12-01");
const past = (n: number) => Array.from({ length: n }, () => "2026-09-20");

describe("upcoming", () => {
  it("counts bookings that have not finished, today included", () => {
    expect(upcoming(snapshot(true, ["2026-11-09", TODAY, "2026-11-11"]).meetings, TODAY)).toBe(2);
  });
});

describe("refuseOverwrite", () => {
  it("refuses to trade a live authenticated artifact for a thinner anonymous pull", () => {
    const refusal = refuseOverwrite(snapshot(true, ahead(40)), snapshot(false, ahead(3)), TODAY);
    expect(refusal).toMatch(/anonymous/);
  });

  it("lets a fresh anonymous pull replace an authenticated artifact that has gone stale", () => {
    // The regression: one authenticated pull from September, 14 of its 18 bookings past,
    // was blocking every anonymous pull with 34 upcoming bookings.
    const stale = snapshot(true, [...past(14), ...ahead(4)]);
    expect(refuseOverwrite(stale, snapshot(false, ahead(34)), TODAY)).toBeNull();
  });

  it("refuses a pull that would halve the upcoming bookings", () => {
    const refusal = refuseOverwrite(snapshot(true, ahead(40)), snapshot(true, ahead(15)), TODAY);
    expect(refusal).toMatch(/40 to 15/);
  });

  it("ignores past bookings when judging a collapse", () => {
    const previous = snapshot(true, [...past(100), ...ahead(10)]);
    expect(refuseOverwrite(previous, snapshot(true, ahead(8)), TODAY)).toBeNull();
  });

  it("treats a drop among a handful of bookings as noise", () => {
    expect(refuseOverwrite(snapshot(false, ahead(4)), snapshot(false, ahead(0)), TODAY)).toBeNull();
  });

  it("always accepts a pull that gains authentication", () => {
    expect(
      refuseOverwrite(snapshot(false, ahead(30)), snapshot(true, ahead(30)), TODAY),
    ).toBeNull();
  });
});
