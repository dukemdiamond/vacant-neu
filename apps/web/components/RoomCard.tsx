"use client";

import { useId, useState } from "react";
import { CalendarBlankIcon, CaretDownIcon } from "@phosphor-icons/react";
import {
  DAY_BITS,
  campusTime,
  formatDuration,
  formatMinutes,
  formatRange,
  isExamPeriod,
  meetingsOnDay,
  type AcademicCalendar,
  type Meeting,
  type Room,
  type RoomStatus,
} from "@vacantneu/core";
import { DirectionsLink } from "@/components/DirectionsLink";
import { RoomScheduleDialog } from "@/components/RoomScheduleDialog";
import { useBuildingLocations } from "@/lib/buildings";

/** A class starting within this window makes the room not worth walking to. */
const CLOSING_SOON_MINUTES = 20;

interface Props {
  room: Room;
  status: RoomStatus;
  meetings: Meeting[];
  calendar: AcademicCalendar;
  now: Date;
  /** Opens the day schedule on first render. Used when a search resolves to one room. */
  defaultOpen?: boolean;
  /**
   * Whether the heading repeats the building name. False where a group header already names it,
   * so a card reads "204" rather than "Behrakis Health Sciences Cntr 204" directly beneath a
   * heading that says exactly that.
   */
  showBuilding?: boolean;
  /**
   * The classes or events that a search matched in this room. Shown on the card itself, because
   * the day list below covers only today and the match may meet here on another day.
   */
  matched?: Meeting[];
}

/**
 * One room's live answer, with the rest of the day behind a disclosure.
 *
 * Free and occupied are distinguished by surface weight rather than by a green/red pair: free
 * rooms sit raised on the page, occupied rooms recede into the sunken wash. Northeastern red is
 * held back for the one case that genuinely needs urgency, a room about to be reclaimed.
 * Status is never carried by colour alone; the label and the duration say it in words.
 */
export function RoomCard({
  room,
  status,
  meetings,
  calendar,
  now,
  defaultOpen = false,
  showBuilding = true,
  matched = [],
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [showSchedule, setShowSchedule] = useState(false);
  const panelId = useId();
  const location = useBuildingLocations().get(room.building);

  const free = status.state === "free";
  const closingSoon =
    free && status.minutesUntilChange !== null && status.minutesUntilChange <= CLOSING_SOON_MINUTES;

  return (
    <article
      className={[
        "rounded-[var(--radius-card)] border px-5 py-4 transition-colors duration-200",
        free ? "border-line bg-surface-raised" : "border-transparent bg-wash-faint",
      ].join(" ")}
    >
      <div className="flex items-baseline gap-2">
        <h3 className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={panelId}
            className="flex w-full items-baseline justify-between gap-4 text-left"
          >
            <span
              className={["text-lg leading-tight", free ? "text-ink" : "text-ink-muted"].join(" ")}
            >
              {showBuilding ? room.displayName : room.room}
            </span>
            <span
              className={[
                "flex shrink-0 items-center gap-1.5 text-sm",
                closingSoon ? "text-accent" : free ? "text-ink-body" : "text-ink-faint",
              ].join(" ")}
            >
              {free ? "Open" : "In use"}
              <CaretDownIcon
                size={12}
                weight="bold"
                aria-hidden
                className={[
                  "transition-transform duration-200",
                  open ? "rotate-180" : "",
                  free ? "text-ink-faint" : "text-ink-faint",
                ].join(" ")}
              />
            </span>
          </button>
        </h3>
        <DirectionsLink location={location} compact />
        <button
          type="button"
          onClick={() => setShowSchedule(true)}
          className="shrink-0 rounded-[var(--radius-control)] p-1.5 text-ink-faint transition-colors hover:bg-wash hover:text-ink"
          aria-label={`Full day schedule for ${room.displayName}`}
          title="Full day schedule"
        >
          <CalendarBlankIcon size={16} weight="regular" aria-hidden />
        </button>
      </div>

      <p className="tabular mt-1.5 text-sm text-ink-muted">
        {free ? <FreeDetail status={status} /> : <BusyDetail status={status} />}
      </p>

      {matched.length > 0 && <MatchedBookings meetings={matched} calendar={calendar} />}

      <div id={panelId} hidden={!open}>
        <DaySchedule meetings={meetings} status={status} calendar={calendar} now={now} />
        <button
          type="button"
          onClick={() => setShowSchedule(true)}
          className="mt-3 text-sm text-ink-body underline underline-offset-2 transition-opacity hover:opacity-70"
        >
          Open full day schedule
        </button>
      </div>

      {showSchedule && (
        <RoomScheduleDialog
          room={room}
          meetings={meetings}
          calendar={calendar}
          now={now}
          onClose={() => setShowSchedule(false)}
        />
      )}
    </article>
  );
}

/** Courses shown before the rest collapse into a count. */
const MATCHED_COURSES = 2;
/** Meeting times shown per course. */
const MATCHED_TIMES = 3;

const DAY_NAMES = Object.entries(DAY_BITS) as [keyof typeof DAY_BITS, number][];

/** "Tue, Fri 3:25 to 5:05 PM", or "Final, Tue Dec 15, 3:30 to 5:30 PM" for a single date. */
function describeTime(m: Meeting, calendar: AcademicCalendar): string {
  const range = formatRange(m.start, m.end);
  if (m.startDate === m.endDate) {
    const [year, month, day] = m.startDate.split("-").map(Number);
    const date = new Date(Date.UTC(year!, month! - 1, day!)).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
    // A one-off session in the exam period is the final, which is worth saying in words.
    const prefix = m.kind === "class" && isExamPeriod(calendar, m.startDate) ? "Final, " : "";
    return `${prefix}${date.replace(",", "")}, ${range}`;
  }
  const days = DAY_NAMES.filter(([, bit]) => m.days & bit).map(([name]) => name);
  return `${days.join(", ")} ${range}`;
}

/**
 * Why a search found this room: which matched class meets here, and when.
 *
 * Without it a room found through a class's Thursday slot, or its final exam, shows a list of
 * today's unrelated classes and looks like a wrong result.
 */
function MatchedBookings({
  meetings,
  calendar,
}: {
  meetings: Meeting[];
  calendar: AcademicCalendar;
}) {
  const courses = new Map<string, { label: string; detail: string; times: string[] }>();
  for (const m of meetings) {
    const key = `${m.label}\u0000${m.detail}`;
    const course = courses.get(key) ?? { label: m.label, detail: m.detail, times: [] };
    const time = describeTime(m, calendar);
    if (!course.times.includes(time)) course.times.push(time);
    courses.set(key, course);
  }
  const list = [...courses.values()];
  const hidden = list.length - MATCHED_COURSES;

  return (
    <ul className="mt-2 flex flex-col gap-1 text-sm">
      {list.slice(0, MATCHED_COURSES).map((c) => (
        <li key={`${c.label}-${c.detail}`} className="text-ink-muted">
          <span className="text-ink">{c.label}</span>{" "}
          {c.detail && <span className="text-ink-faint">{c.detail}</span>}
          <span className="tabular block text-ink-muted">
            {c.times.slice(0, MATCHED_TIMES).join("; ")}
            {c.times.length > MATCHED_TIMES && `; ${c.times.length - MATCHED_TIMES} more`}
          </span>
        </li>
      ))}
      {hidden > 0 && (
        <li className="text-ink-faint">
          and {hidden} more matching {hidden === 1 ? "class" : "classes"}
        </li>
      )}
    </ul>
  );
}

function FreeDetail({ status }: { status: RoomStatus }) {
  if (status.minutesUntilChange === null) {
    return <>Nothing else scheduled today.</>;
  }
  return (
    <>
      Free for {formatDuration(status.minutesUntilChange)}, until{" "}
      {formatMinutes(status.next!.start)}. Then {status.next!.label}.
    </>
  );
}

function BusyDetail({ status }: { status: RoomStatus }) {
  const { current, minutesUntilChange } = status;
  if (!current) return <>In use.</>;
  return (
    <>
      {current.label}
      {current.kind === "event" && current.detail ? ` (${current.detail})` : ""} until{" "}
      {formatMinutes(current.end)}
      {minutesUntilChange !== null && <>, {formatDuration(minutesUntilChange)} left</>}.
    </>
  );
}

/**
 * The room's classes for today.
 *
 * This reuses the same day filter the vacancy engine uses, so the list can never disagree with
 * the status line above it: a holiday or an out-of-range date empties both at once.
 *
 * Classes that have already finished are dimmed rather than dropped. What is left in the day is
 * the useful part, but a class that ended ten minutes ago explains why a room still has people in
 * it, so removing it would lose real context.
 */
function DaySchedule({
  meetings,
  status,
  calendar,
  now,
}: {
  meetings: Meeting[];
  status: RoomStatus;
  calendar: AcademicCalendar;
  now: Date;
}) {
  const clock = campusTime(now);
  const today = meetingsOnDay(meetings, calendar, clock).sort((a, b) => a.start - b.start);

  if (today.length === 0) {
    return (
      <p className="mt-4 border-t border-line pt-4 text-sm text-ink-faint">
        Nothing is scheduled in this room today.
      </p>
    );
  }

  const remaining = today.filter((m) => m.end > clock.minutes).length;

  return (
    <div className="mt-4 border-t border-line pt-4">
      <h4 className="text-xs text-ink-faint">
        {remaining === 0
          ? "Today in this room, all finished"
          : `Today in this room, ${remaining} left`}
      </h4>
      <ul className="mt-2.5 flex flex-col gap-2">
        {today.map((m, i) => {
          const active =
            status.current !== null &&
            status.current.label === m.label &&
            status.current.start === m.start;
          const past = m.end <= clock.minutes;
          return (
            <li key={`${m.label}-${m.start}-${i}`} className="flex items-baseline gap-3 text-sm">
              <span
                className={[
                  "tabular w-40 shrink-0 whitespace-nowrap",
                  active ? "text-ink" : past ? "text-ink-faint opacity-60" : "text-ink-muted",
                ].join(" ")}
              >
                {formatRange(m.start, m.end)}
              </span>
              <span
                className={
                  past ? "text-ink-faint opacity-60" : active ? "text-ink" : "text-ink-muted"
                }
              >
                {m.label} <span className="text-ink-faint">{m.detail}</span>
                {/* Classes and club events sit in one chronological list, so the source of a
                    booking has to be readable without decoding the wording. */}
                {m.kind === "event" && (
                  <span className="ml-1.5 align-middle rounded-[4px] border border-line px-1.5 py-px text-[11px] text-ink-faint">
                    club
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
