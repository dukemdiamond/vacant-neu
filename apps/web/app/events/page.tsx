"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowSquareOutIcon,
  CaretLeftIcon,
  CaretRightIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import { campusDateISO, formatRange, type CampusEvent } from "@vacantneu/core";
import { useNow } from "@/lib/clock";

/**
 * What is happening on campus, a week at a time.
 *
 * A week rather than a day because Engage is uneven: some days carry eight events and the next
 * three carry none, so stepping day by day means clicking through empty screens to find anything.
 * A week is also how someone actually plans, and it still fits on one page.
 */
export default function EventsPage() {
  const now = useNow();
  const [events, setEvents] = useState<CampusEvent[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(campusDateISO(now)));
  const [query, setQuery] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("./data/events.json", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { events?: CampusEvent[] }) => setEvents(d.events ?? []))
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setFailed(true);
      });
    return () => controller.abort();
  }, []);

  const matching = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return events ?? [];
    return (events ?? []).filter(
      (e) =>
        e.club.toLowerCase().includes(q) ||
        e.name.toLowerCase().includes(q) ||
        e.location.toLowerCase().includes(q),
    );
  }, [events, query]);

  const days = useMemo(() => {
    const out: { date: string; events: CampusEvent[] }[] = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(weekStart, i);
      out.push({ date, events: matching.filter((e) => e.date === date) });
    }
    return out;
  }, [matching, weekStart]);

  const total = days.reduce((n, d) => n + d.events.length, 0);
  const today = campusDateISO(now);

  return (
    <main className="mx-auto max-w-5xl px-5 pt-14 pb-24 sm:px-8 sm:pt-20">
      <section className="text-center">
        <h1 className="display-lg text-4xl font-semibold sm:text-5xl">What&rsquo;s on</h1>
        <p className="mx-auto mt-4 text-lg text-ink-muted">Events this week, pulled from Engage</p>
      </section>

      <div className="mt-10 flex items-center justify-between gap-3 border-y border-line py-3">
        <StepButton label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))}>
          <CaretLeftIcon size={14} weight="bold" aria-hidden />
        </StepButton>
        <p className="text-center text-base">{formatWeek(weekStart)}</p>
        <StepButton label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))}>
          <CaretRightIcon size={14} weight="bold" aria-hidden />
        </StepButton>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex max-w-xs flex-1 items-center gap-2 rounded-[var(--radius-control)] border border-line bg-surface-raised px-3 py-2 focus-within:shadow-[var(--shadow-focus)]">
          <MagnifyingGlassIcon size={15} weight="regular" aria-hidden className="text-ink-faint" />
          <label htmlFor="event-search" className="sr-only">
            Search events by club, name, or venue
          </label>
          <input
            id="event-search"
            data-focus-parent
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a club"
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted [&::-webkit-search-cancel-button]:appearance-none"
          />
        </div>

        {/* A quiet way to jump somewhere specific without turning the page into a form. */}
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          Jump to
          <input
            type="date"
            value={weekStart}
            onChange={(e) => e.target.value && setWeekStart(startOfWeek(e.target.value))}
            className="tabular rounded-[var(--radius-control)] border border-line bg-surface-raised px-2.5 py-1.5 text-sm text-ink [color-scheme:light] focus-visible:shadow-[var(--shadow-focus)] dark:[color-scheme:dark]"
          />
        </label>
      </div>

      <p className="tabular mt-5 text-sm text-ink-muted">
        {failed
          ? "Events could not be loaded."
          : events === null
            ? "Loading events."
            : `${total} ${total === 1 ? "event" : "events"} this week${query.trim() ? " matching your search" : ""}.`}
      </p>

      {events !== null && !failed && total === 0 && (
        <p className="mt-6 rounded-[var(--radius-card)] border border-line p-8 text-center text-ink">
          {query.trim() ? "Nothing matches your search this week." : "Nothing listed this week."}
        </p>
      )}

      <div className="mt-6 flex flex-col gap-8">
        {days
          .filter((d) => d.events.length > 0)
          .map((day) => (
            <section key={day.date}>
              <h2 className="text-sm text-ink-muted">
                {formatDay(day.date)}
                {day.date === today && <span className="ml-2 text-accent">today</span>}
              </h2>
              <ul className="mt-3 flex flex-col gap-2">
                {day.events.map((event) => (
                  <li key={event.id}>
                    <EventRow event={event} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </div>
    </main>
  );
}

function StepButton({
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
      aria-label={label}
      onClick={onClick}
      className="rounded-[var(--radius-control)] p-2 text-ink-muted transition-colors hover:bg-wash hover:text-ink"
    >
      {children}
    </button>
  );
}

function EventRow({ event }: { event: CampusEvent }) {
  return (
    <article className="rounded-[var(--radius-card)] border border-line bg-surface-raised px-5 py-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
        <p className="tabular w-36 shrink-0 text-sm whitespace-nowrap text-ink-muted">
          {formatRange(event.start, event.end)}
          {event.spansDays && <span className="text-ink-faint"> +1</span>}
        </p>
        <div className="min-w-0 flex-1">
          <h3 className="text-base leading-tight text-ink">
            {event.url ? (
              <a
                href={event.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-baseline gap-1.5 underline-offset-2 hover:underline"
              >
                {event.name}
                <ArrowSquareOutIcon
                  size={12}
                  weight="bold"
                  aria-hidden
                  className="text-ink-faint"
                />
              </a>
            ) : (
              event.name
            )}
          </h3>
          <p className="mt-0.5 text-sm text-ink-muted">{event.club}</p>
          <p className="mt-1 text-sm text-ink-body">
            {event.location}
            {/* The one place the events view meets the room views. */}
            {event.roomId && (
              <span className="ml-2 rounded-[4px] border border-line px-1.5 py-px text-[11px] text-ink-faint">
                tracked room
              </span>
            )}
          </p>
        </div>
      </div>
    </article>
  );
}

/** Monday of the week containing an ISO date. */
function startOfWeek(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const shift = (d.getUTCDay() + 6) % 7; // Monday is 0
  d.setUTCDate(d.getUTCDate() - shift);
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function formatDay(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "Sep 14 to 20" or "Sep 28 to Oct 4" when the week straddles a month. */
function formatWeek(start: string): string {
  const end = addDays(start, 6);
  const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  return sameMonth
    ? `${fmt(start, { month: "short", day: "numeric" })} to ${fmt(end, { day: "numeric" })}`
    : `${fmt(start, { month: "short", day: "numeric" })} to ${fmt(end, { month: "short", day: "numeric" })}`;
}
