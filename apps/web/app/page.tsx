"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRightIcon, InfoIcon } from "@phosphor-icons/react";
import type { AcademicCalendar, Building, Room, RoomStatus } from "@vacantneu/core";
import { RoomCard } from "@/components/RoomCard";
import { ResultsSkeleton } from "@/components/Skeleton";
import { SearchField } from "@/components/SearchField";
import { useAllStatuses, useNow, useRoomIndex, useSchedule, type RoomIndex } from "@/lib/schedule";
import { formatDay, termPhase, type TermPhase } from "@/lib/term";

const MAX_RESULTS = 24;
/** Buildings shown before the list hands off to the browse page. */
const OVERVIEW_LIMIT = 12;

export default function Home() {
  const state = useSchedule();
  const now = useNow();
  const [query, setQuery] = useState("");

  const artifact = state.status === "ready" ? state.artifact : null;
  const index = useRoomIndex(artifact);
  const statuses = useAllStatuses(artifact, now);
  const phase = useMemo(() => (artifact ? termPhase(artifact, now) : null), [artifact, now]);

  const statusById = useMemo(() => new Map(statuses.map((s) => [s.roomId, s])), [statuses]);

  const results = useMemo(() => {
    const trimmed = query.trim();
    if (!index || trimmed.length === 0) return null;
    const matched = index.search
      .search(trimmed)
      .map((hit) => index.rooms.get(hit.id as string))
      .filter((room): room is Room => room !== undefined);
    // The visible list is capped, so the count is tracked separately; reporting the length of the
    // truncated list would silently understate how many rooms actually matched.
    return { rooms: matched.slice(0, MAX_RESULTS), total: matched.length };
  }, [index, query]);

  return (
    <main className="mx-auto max-w-7xl px-5 pb-24 sm:px-8">
      <section className="pt-14 sm:pt-20">
        <h1 className="display-xl max-w-3xl text-[2.75rem] font-semibold sm:text-6xl">
          {/* pr-1 reserves room for the italic slant so the "d" does not crowd the next word. */}
          <span className="pr-1 text-accent italic">Find</span> a free classroom
        </h1>
        <p className="mt-5 max-w-xl text-lg text-ink-muted">
          Every classroom on the Boston campus, and whether a class is in it right now.
        </p>

        <div className="mt-8 max-w-xl">
          <SearchField
            value={query}
            onChange={setQuery}
            disabled={state.status !== "ready"}
            resultCount={results?.total ?? null}
          />
        </div>
      </section>

      <section className="mt-12">
        {state.status === "loading" && <ResultsSkeleton />}
        {state.status === "error" && <ErrorState message={state.message} />}
        {state.status === "ready" && artifact && index && phase && (
          <>
            <PhaseNotice phase={phase} />
            {results === null ? (
              <Overview
                statuses={statuses}
                buildings={artifact.buildings}
                phase={phase}
                onPickBuilding={setQuery}
              />
            ) : (
              <Results
                rooms={results.rooms}
                total={results.total}
                statusById={statusById}
                index={index}
                calendar={artifact.calendar}
                now={now}
                query={query}
              />
            )}
          </>
        )}
      </section>

      <Footnote generatedAt={artifact?.generatedAt} />
    </main>
  );
}

/* ---------------------------------------------------------------- search results */

function Results({
  rooms,
  total,
  statusById,
  index,
  calendar,
  now,
  query,
}: {
  rooms: Room[];
  total: number;
  statusById: Map<string, RoomStatus>;
  index: RoomIndex;
  calendar: AcademicCalendar;
  now: Date;
  query: string;
}) {
  if (rooms.length === 0) {
    return (
      <div className="rounded-[var(--radius-card)] border border-line p-8">
        <p className="text-ink">No rooms match “{query.trim()}”.</p>
        <p className="mt-2 max-w-md text-sm text-ink-muted">
          Try a building name like Shillman, a building code like ISEC, or a room number like 155.
          Only rooms that host at least one class are listed.
        </p>
      </div>
    );
  }

  const openCount = rooms.filter((r) => statusById.get(r.id)?.state === "free").length;
  // A query naming a specific room number should land on that room, not on a list to scan.
  const expandFirst = rooms.length === 1 || namesExactRoom(query, rooms[0]);

  return (
    <>
      <p className="tabular mb-4 text-sm text-ink-muted">
        {total} {total === 1 ? "room" : "rooms"}, {openCount} open now.
        {total > rooms.length && <> Showing the first {rooms.length}.</>}
      </p>
      <div
        className={[
          "grid items-start gap-2",
          // A single exact match keeps the full width for its schedule; a list of candidates is
          // easier to scan two-up than as one very wide column.
          expandFirst && rooms.length === 1 ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2",
        ].join(" ")}
      >
        {rooms.map((room) => {
          const status = statusById.get(room.id);
          if (!status) return null;
          return (
            <RoomCard
              key={room.id}
              room={room}
              status={status}
              meetings={index.meetings.get(room.id) ?? []}
              calendar={calendar}
              now={now}
              defaultOpen={expandFirst && room.id === rooms[0]?.id}
            />
          );
        })}
      </div>
    </>
  );
}

/**
 * True when the query spells out this exact room, e.g. "Ryder 155" against Ryder Hall 155.
 * Used to decide whether the top result opens straight to its schedule.
 */
function namesExactRoom(query: string, room: Room | undefined): boolean {
  if (!room) return false;
  const digits = query.match(/\d+/g);
  if (!digits) return false;
  const bare = room.room.replace(/^0+/, "");
  return digits.some((d) => d === room.room || d.replace(/^0+/, "") === bare);
}

/* ---------------------------------------------------------------- resting state */

/**
 * What the page shows before anyone types.
 *
 * A student's real question is usually "which building do I walk to?", so the resting state
 * answers that rather than listing rooms: open counts per building, heaviest first. It doubles as
 * the search's empty state and as a shortcut into it.
 */
function Overview({
  statuses,
  buildings,
  phase,
  onPickBuilding,
}: {
  statuses: RoomStatus[];
  buildings: Building[];
  phase: TermPhase;
  onPickBuilding: (name: string) => void;
}) {
  const ranked = useMemo(() => {
    const open = new Map<string, number>();
    for (const status of statuses) {
      if (status.state !== "free") continue;
      const code = status.roomId.slice(0, status.roomId.lastIndexOf("-"));
      open.set(code, (open.get(code) ?? 0) + 1);
    }
    return buildings
      .map((b) => ({ ...b, open: open.get(b.code) ?? 0 }))
      .filter((b) => b.open > 0)
      .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
  }, [statuses, buildings]);

  const totalOpen = statuses.filter((s) => s.state === "free").length;
  // Before the term starts every room is open, so the per-building ratio is the same everywhere
  // and printing it 40 times is noise rather than information.
  const showRatio = phase.kind === "in-session";

  return (
    <>
      <p className="tabular max-w-xl text-2xl leading-snug text-ink">
        {totalOpen} of {statuses.length} rooms have no class in them right now.
      </p>

      <h2 className="mt-10 text-sm text-ink-muted">
        {showRatio ? "Open rooms by building" : "Buildings with classrooms"}
      </h2>

      <ul className="mt-2 grid grid-cols-1 gap-x-10 sm:grid-cols-2">
        {ranked.slice(0, OVERVIEW_LIMIT).map((building) => (
          <li key={building.code}>
            <button
              type="button"
              onClick={() => onPickBuilding(building.name)}
              className="group flex w-full items-baseline justify-between gap-4 border-b border-line py-3.5 text-left transition-colors hover:border-line-strong"
            >
              <span className="text-ink transition-opacity group-hover:opacity-70">
                {building.name}
              </span>
              <span className="tabular flex shrink-0 items-center gap-2 text-sm text-ink-muted">
                {showRatio ? `${building.open} of ${building.roomCount}` : `${building.roomCount}`}
                <ArrowRightIcon
                  size={14}
                  weight="bold"
                  aria-hidden
                  className="opacity-0 transition-opacity group-hover:opacity-50"
                />
              </span>
            </button>
          </li>
        ))}
      </ul>

      {ranked.length > OVERVIEW_LIMIT && (
        <Link
          href="/browse"
          className="mt-6 inline-flex items-center gap-2 text-sm text-ink-body transition-opacity hover:opacity-70"
        >
          See all {ranked.length} buildings
          <ArrowRightIcon size={14} weight="bold" aria-hidden />
        </Link>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- notices */

/**
 * Says out loud when Banner's class schedule is not what is happening on campus.
 *
 * These are the days the app would otherwise be confidently wrong, so each one gets named rather
 * than silently reporting an empty schedule as universal vacancy.
 */
function PhaseNotice({ phase }: { phase: TermPhase }) {
  const message = noticeFor(phase);
  if (!message) return null;

  return (
    <div className="mb-8 flex gap-3 rounded-[var(--radius-card)] border border-line bg-wash-faint p-4">
      <InfoIcon size={18} weight="regular" aria-hidden className="mt-0.5 shrink-0 text-accent" />
      <p className="max-w-2xl text-sm text-ink-body">{message}</p>
    </div>
  );
}

function noticeFor(phase: TermPhase): string | null {
  switch (phase.kind) {
    case "before-term":
      return `Fall classes begin ${formatDay(phase.firstDay)}. Until then nothing is scheduled, so every room below reads as open.`;
    case "after-term":
      return "The term has ended, so no classes are scheduled and every room reads as open.";
    case "holiday":
      return "No classes are scheduled today, so every room reads as open. Buildings may still be closed.";
    case "exams":
      return "It is the final exam period. Exams follow a separate schedule that Banner does not publish, so a room shown as open may still be in use.";
    case "in-session":
      return null;
  }
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line p-8">
      <p className="text-ink">The schedule did not load.</p>
      <p className="mt-2 max-w-sm text-sm text-ink-muted">{message}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-5 rounded-[var(--radius-control)] bg-ink px-4 py-2 text-sm text-ink-inverse shadow-[var(--shadow-inset)] transition-opacity active:opacity-80"
      >
        Try again
      </button>
    </div>
  );
}

/**
 * The caveat this product cannot ship without.
 *
 * Banner only knows about registrar-scheduled classes. A room with no class in it may still be
 * locked, booked by a club, or holding an exam. Saying so plainly is what keeps the app honest.
 */
function Footnote({ generatedAt }: { generatedAt?: string }) {
  return (
    <footer className="mt-20 border-t border-line pt-6">
      <p className="max-w-2xl text-sm text-ink-muted">
        vacantNEU shows where no class is scheduled. That is not the same as unlocked: rooms can be
        booked for events, held for exams, or simply locked. Only rooms that host at least one class
        appear here.
      </p>
      {generatedAt && (
        <p className="tabular mt-3 text-xs text-ink-faint">
          Schedule from Northeastern Banner, updated {formatDay(generatedAt, true)}.
        </p>
      )}
    </footer>
  );
}
