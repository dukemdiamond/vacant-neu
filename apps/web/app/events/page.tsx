"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowSquareOutIcon, CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { campusDateISO, formatRange, type CampusEvent } from "@vacantneu/core";
import { useNow } from "@/lib/clock";

/**
 * What is happening on campus, by day.
 *
 * A companion to the room pages rather than part of them: most club events are nowhere near a
 * timetabled classroom, so they can say nothing about whether one is free, but they are still
 * the answer to "what is on today". Events that do sit in a room we track say so, which is the
 * only place the two views meet.
 */
export default function EventsPage() {
  const now = useNow();
  const [events, setEvents] = useState<CampusEvent[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [date, setDate] = useState(() => campusDateISO(now));

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

  const byDate = useMemo(() => {
    const map = new Map<string, CampusEvent[]>();
    for (const e of events ?? []) {
      const list = map.get(e.date);
      if (list) list.push(e);
      else map.set(e.date, [e]);
    }
    return map;
  }, [events]);

  const today = campusDateISO(now);
  const onDay = byDate.get(date) ?? [];

  /** Days that actually have something on, so the arrows can skip empty stretches. */
  const days = useMemo(() => [...byDate.keys()].sort(), [byDate]);
  const nextWithEvents = (from: string, direction: 1 | -1) =>
    direction === 1
      ? (days.find((d) => d > from) ?? null)
      : ([...days].reverse().find((d) => d < from) ?? null);

  return (
    <main className="mx-auto max-w-5xl px-5 pt-14 pb-24 sm:px-8 sm:pt-20">
      <section className="text-center">
        <h1 className="display-lg text-4xl font-semibold sm:text-5xl">What&rsquo;s on</h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-ink-muted">
          Club events from Engage, day by day.
        </p>
      </section>

      <div className="mt-10 flex items-center justify-between gap-3 border-y border-line py-3">
        <StepButton label="Previous day with events" to={nextWithEvents(date, -1)} onGo={setDate}>
          <CaretLeftIcon size={14} weight="bold" aria-hidden />
        </StepButton>
        <div className="text-center">
          <p className="text-base">{formatDay(date)}</p>
          {date !== today && (
            <button
              type="button"
              onClick={() => setDate(today)}
              className="text-xs text-ink-muted underline underline-offset-2 transition-colors hover:text-ink"
            >
              Back to today
            </button>
          )}
        </div>
        <StepButton label="Next day with events" to={nextWithEvents(date, 1)} onGo={setDate}>
          <CaretRightIcon size={14} weight="bold" aria-hidden />
        </StepButton>
      </div>

      <p className="tabular mt-5 text-sm text-ink-muted">
        {failed
          ? "Events could not be loaded."
          : events === null
            ? "Loading events."
            : `${onDay.length} ${onDay.length === 1 ? "event" : "events"} on this day.`}
      </p>

      {events !== null && onDay.length === 0 && !failed && (
        <div className="mt-4 rounded-[var(--radius-card)] border border-line p-8 text-center">
          <p className="text-ink">Nothing listed for {formatDay(date)}.</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted">
            Engage only carries upcoming events, and clubs tend to post close to the date.
          </p>
        </div>
      )}

      <ul className="mt-4 flex flex-col gap-2">
        {onDay.map((event) => (
          <li key={event.id}>
            <EventRow event={event} />
          </li>
        ))}
      </ul>

      <p className="mt-10 max-w-2xl text-sm text-ink-muted">
        Listings come from Engage and are only as complete as the clubs make them. Venues shown as a
        private location are hidden by the organiser, and many events have no room assigned yet.
      </p>
    </main>
  );
}

function StepButton({
  label,
  to,
  onGo,
  children,
}: {
  label: string;
  to: string | null;
  onGo: (date: string) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={to === null}
      onClick={() => to && onGo(to)}
      className="rounded-[var(--radius-control)] p-2 text-ink-muted transition-colors hover:bg-wash hover:text-ink disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function EventRow({ event }: { event: CampusEvent }) {
  return (
    <article className="rounded-[var(--radius-card)] border border-line bg-surface-raised px-5 py-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
        <p className="tabular w-40 shrink-0 text-sm whitespace-nowrap text-ink-muted">
          {formatRange(event.start, event.end)}
          {event.spansDays && <span className="text-ink-faint"> +1</span>}
        </p>
        <div className="min-w-0 flex-1">
          <h2 className="text-base leading-tight text-ink">
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
          </h2>
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

function formatDay(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
