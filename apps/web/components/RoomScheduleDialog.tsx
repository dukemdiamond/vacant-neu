"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CaretLeftIcon, CaretRightIcon, XIcon } from "@phosphor-icons/react";
import {
  campusDateISO,
  campusTime,
  formatRange,
  meetingsOnDay,
  type AcademicCalendar,
  type Meeting,
  type Room,
} from "@vacantneu/core";

/** Pixels per hour. Enough that a 50 minute class is comfortably readable. */
const HOUR = 56;
/** The window shown when a day's bookings fit inside it. */
const DEFAULT_START = 7;
const DEFAULT_END = 23;

interface Props {
  room: Room;
  meetings: Meeting[];
  calendar: AcademicCalendar;
  /** The day to open on, and the instant the "now" marker tracks. */
  now: Date;
  onClose: () => void;
}

/**
 * A room's whole day as a timeline.
 *
 * The card's list answers "what is in here"; this answers "where are the gaps", which a list of
 * start times cannot show. Blocks are drawn to scale against an hour grid, so a free hour looks
 * like an hour, and the day can be stepped through without leaving the room.
 */
export function RoomScheduleDialog({ room, meetings, calendar, now, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [date, setDate] = useState(() => campusDateISO(now));

  // showModal gives focus trapping, inertness of the page behind, and Escape for free.
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (!el.open) el.showModal();
    const onCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    el.addEventListener("cancel", onCancel);
    return () => el.removeEventListener("cancel", onCancel);
  }, [onClose]);

  const clock = campusTime(now);
  const shownIsToday = date === clock.date;

  const day = useMemo(
    () =>
      meetingsOnDay(meetings, calendar, { date, dayBit: dayBitOf(date), minutes: 0 }).sort(
        (a, b) => a.start - b.start || a.end - b.end,
      ),
    [meetings, calendar, date],
  );

  // The window grows to fit anything scheduled outside the usual teaching day.
  const startHour = Math.min(DEFAULT_START, ...day.map((m) => Math.floor(m.start / 60)));
  const endHour = Math.max(DEFAULT_END, ...day.map((m) => Math.ceil(m.end / 60)));
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);
  const top = (minutes: number) => ((minutes - startHour * 60) / 60) * HOUR;

  const columns = useMemo(() => packColumns(day), [day]);
  const columnCount = Math.max(1, ...columns.map((c) => c + 1));

  /*
   * Open where the day is happening.
   *
   * The grid starts at 7 AM, so a room whose only booking is an evening event would otherwise
   * open on two hours of empty gridlines. Scroll to the present when looking at today, and to the
   * first booking otherwise, keeping a little context above it.
   */
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const anchor = shownIsToday ? clock.minutes : (day[0]?.start ?? startHour * 60);
    el.scrollTop = Math.max(0, ((anchor - startHour * 60) / 60) * HOUR - HOUR);
  }, [date, day, shownIsToday, clock.minutes, startHour]);

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-label={`Schedule for ${room.displayName}`}
      className={[
        "m-auto w-[min(46rem,calc(100vw-2rem))] rounded-[var(--radius-container)] border border-line",
        "bg-surface p-0 text-ink backdrop:bg-[rgb(28_28_28/0.35)]",
      ].join(" ")}
    >
      <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-surface px-5 py-4">
        <div className="min-w-0">
          <h2 className="display-lg truncate text-xl font-semibold">{room.displayName}</h2>
          <p className="mt-0.5 text-sm text-ink-muted">Everything scheduled in this room</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close schedule"
          className="-mr-1 shrink-0 rounded-full p-2 text-ink-faint transition-colors hover:bg-wash hover:text-ink"
        >
          <XIcon size={16} weight="bold" aria-hidden />
        </button>
      </header>

      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <NavButton label="Previous day" onClick={() => setDate(addDays(date, -1))}>
          <CaretLeftIcon size={14} weight="bold" aria-hidden />
        </NavButton>
        <div className="text-center">
          <p className="text-base">{formatHeading(date)}</p>
          {!shownIsToday && (
            <button
              type="button"
              onClick={() => setDate(clock.date)}
              className="text-xs text-ink-muted underline underline-offset-2 transition-colors hover:text-ink"
            >
              {/* Names the day rather than saying "today": on Browse the anchor is whatever
                  instant is being inspected, which is often not today. */}
              Back to {formatHeading(clock.date)}
            </button>
          )}
        </div>
        <NavButton label="Next day" onClick={() => setDate(addDays(date, 1))}>
          <CaretRightIcon size={14} weight="bold" aria-hidden />
        </NavButton>
      </div>

      <div ref={scroller} className="max-h-[60vh] overflow-y-auto px-5 py-4">
        {day.length === 0 && (
          <p className="py-6 text-sm text-ink-muted">
            Nothing is scheduled in this room on {formatHeading(date)}.
          </p>
        )}

        <div className="relative" style={{ height: (endHour - startHour) * HOUR + 8 }}>
          {hours.map((hour) => (
            <div
              key={hour}
              className="absolute right-0 left-0 flex items-start gap-3"
              style={{ top: (hour - startHour) * HOUR }}
            >
              <span className="tabular w-14 shrink-0 -translate-y-2 text-right text-xs text-ink-faint">
                {hourLabel(hour)}
              </span>
              <span className="mt-0 h-px flex-1 bg-line" />
            </div>
          ))}

          <div className="absolute top-0 right-0 bottom-0 left-[4.25rem]">
            {day.map((meeting, i) => {
              const column = columns[i] ?? 0;
              const height = Math.max(24, ((meeting.end - meeting.start) / 60) * HOUR - 3);
              return (
                <article
                  key={`${meeting.label}-${meeting.start}-${i}`}
                  className={[
                    "absolute overflow-hidden rounded-[var(--radius-control)] border border-line",
                    "bg-surface-raised px-2.5 py-1.5",
                    meeting.kind === "event"
                      ? "border-l-[3px] border-l-accent"
                      : "border-l-[3px] border-l-ink-faint",
                  ].join(" ")}
                  style={{
                    top: top(meeting.start),
                    height,
                    left: `${(column / columnCount) * 100}%`,
                    width: `calc(${100 / columnCount}% - 4px)`,
                  }}
                >
                  {/* The chip sits outside the truncating span so a long event name cannot
                      clip the one label that says where the booking came from. */}
                  <p className="flex items-center gap-1.5 text-sm leading-tight text-ink">
                    <span className="truncate">{meeting.label}</span>
                    {meeting.kind === "event" && (
                      <span className="shrink-0 rounded-[4px] border border-line px-1 py-px text-[10px] text-ink-faint">
                        club
                      </span>
                    )}
                  </p>
                  {height > 34 && (
                    <p className="tabular truncate text-xs text-ink-muted">
                      {formatRange(meeting.start, meeting.end)}
                    </p>
                  )}
                  {height > 58 && meeting.detail && (
                    <p className="truncate text-xs text-ink-faint">{meeting.detail}</p>
                  )}
                </article>
              );
            })}

            {/* The present moment, drawn only on the day it belongs to. */}
            {shownIsToday && clock.minutes >= startHour * 60 && clock.minutes <= endHour * 60 && (
              <div
                className="pointer-events-none absolute right-0 left-0 flex items-center"
                style={{ top: top(clock.minutes) }}
                aria-hidden
                title="The moment you are viewing"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                <span className="h-px flex-1 bg-accent" />
              </div>
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
}

function NavButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="rounded-[var(--radius-control)] p-2 text-ink-muted transition-colors hover:bg-wash hover:text-ink"
    >
      {children}
    </button>
  );
}

/**
 * Assigns each booking to a column so overlapping ones sit side by side.
 *
 * Rooms are occasionally double-booked in Banner, and a club event can be listed over a class, so
 * drawing every block at full width would hide one behind the other.
 */
function packColumns(day: Meeting[]): number[] {
  const endByColumn: number[] = [];
  return day.map((meeting) => {
    const free = endByColumn.findIndex((end) => end <= meeting.start);
    const column = free === -1 ? endByColumn.length : free;
    endByColumn[column] = meeting.end;
    return column;
  });
}

function dayBitOf(iso: string): number {
  const bits = [64, 1, 2, 4, 8, 16, 32]; // Sun first, matching Date#getUTCDay
  return bits[new Date(`${iso}T12:00:00Z`).getUTCDay()] ?? 0;
}

function addDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function formatHeading(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function hourLabel(hour: number): string {
  const h = hour % 24;
  if (h === 0) return "midnight";
  if (h === 12) return "noon";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}
