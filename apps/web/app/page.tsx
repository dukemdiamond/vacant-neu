"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRightIcon } from "@phosphor-icons/react";
import type { AcademicCalendar, Building, Campus, Room, RoomStatus } from "@vacantneu/core";
import { CampusPicker } from "@/components/CampusPicker";
import { PhaseNotice } from "@/components/PhaseNotice";
import { RoomCard } from "@/components/RoomCard";
import { ResultsSkeleton } from "@/components/Skeleton";
import { SearchField } from "@/components/SearchField";
import { useAllStatuses, useNow, useRoomIndex, useSchedule, type RoomIndex } from "@/lib/schedule";
import { resolveCampus, roomsOnCampus, useCampus } from "@/lib/campus";
import { formatDay, termPhase, type TermPhase } from "@/lib/term";

/** Results shown before the list offers to reveal the rest. */
const RESULTS_PAGE = 24;
/** Buildings shown before the list hands off to the browse page. */
const OVERVIEW_LIMIT = 12;

export default function Home() {
  const state = useSchedule();
  const now = useNow();
  const [query, setQuery] = useState("");
  const [campus, setCampus] = useCampus();
  const [showAll, setShowAll] = useState(false);

  const artifact = state.status === "ready" ? state.artifact : null;
  const clubEvents = state.status === "ready" ? state.clubEvents : undefined;
  const index = useRoomIndex(artifact);
  const statuses = useAllStatuses(artifact, now);
  const phase = useMemo(() => (artifact ? termPhase(artifact, now) : null), [artifact, now]);

  const statusById = useMemo(() => new Map(statuses.map((s) => [s.roomId, s])), [statuses]);

  const active = artifact ? resolveCampus(artifact.campuses, campus) : null;
  const campusCode = active?.code ?? campus;

  // Everything below is scoped to one campus. Pooling them would make "412 rooms are open" true
  // and useless, since some of those rooms are on another continent.
  const campusRooms = useMemo(
    () => (artifact ? roomsOnCampus(artifact, campusCode) : []),
    [artifact, campusCode],
  );
  const campusStatuses = useMemo(() => {
    const ids = new Set(campusRooms.map((r) => r.id));
    return statuses.filter((s) => ids.has(s.roomId));
  }, [statuses, campusRooms]);
  const campusBuildings = useMemo(
    () => (artifact ? artifact.buildings.filter((b) => b.campus === campusCode) : []),
    [artifact, campusCode],
  );

  const matches = useMemo(() => {
    const trimmed = query.trim();
    if (!index || trimmed.length === 0) return null;
    return index.search
      .search(trimmed)
      .map((hit) => index.rooms.get(hit.id as string))
      .filter((room): room is Room => room !== undefined && room.campus === campusCode);
  }, [index, query, campusCode]);

  // Reset the expansion when the query or campus changes, so a new search starts short again.
  useEffect(() => setShowAll(false), [query, campusCode]);

  return (
    <main className="mx-auto max-w-7xl px-5 pb-24 sm:px-8">
      <section className="pt-14 text-center sm:pt-20">
        <h1 className="display-xl mx-auto text-[2.75rem] font-semibold sm:text-6xl">
          {/* pr-1 reserves room for the italic slant so the "d" does not crowd the next word. */}
          <span className="pr-1 text-accent italic">Find</span> a free classroom
        </h1>
        {/* Balanced wrapping, and no break before the campus name, so the sentence never leaves a
            lone word on its own line. */}
        <p className="mx-auto mt-5 max-w-2xl text-lg text-balance text-ink-muted lg:max-w-none lg:whitespace-nowrap">
          {active ? (
            <>
              Every Northeastern classroom in{" "}
              <span className="whitespace-nowrap">{active.name}</span>, and whether a class or event
              is in it right now.
            </>
          ) : (
            <>Every classroom at Northeastern, and whether a class or event is in it right now.</>
          )}
        </p>

        <div className="mx-auto mt-8 max-w-xl">
          <SearchField
            value={query}
            onChange={setQuery}
            disabled={state.status !== "ready"}
            resultCount={matches?.length ?? null}
          />
        </div>

        {artifact && (
          <div className="mt-5">
            <CampusPicker
              campuses={artifact.campuses}
              value={campusCode}
              onChange={setCampus}
              centered
            />
          </div>
        )}
      </section>

      <section className="mt-12">
        {state.status === "loading" && <ResultsSkeleton />}
        {state.status === "error" && <ErrorState message={state.message} />}
        {state.status === "ready" && artifact && index && phase && (
          <>
            <PhaseNotice phase={phase} />
            {matches === null ? (
              <Overview
                statuses={campusStatuses}
                buildings={campusBuildings}
                phase={phase}
                onPickBuilding={setQuery}
              />
            ) : (
              <Results
                matches={matches}
                showAll={showAll}
                onShowAll={() => setShowAll(true)}
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

      <Footnote generatedAt={artifact?.generatedAt} clubEvents={clubEvents} />
    </main>
  );
}

/* ---------------------------------------------------------------- search results */

function Results({
  matches,
  showAll,
  onShowAll,
  statusById,
  index,
  calendar,
  now,
  query,
}: {
  matches: Room[];
  showAll: boolean;
  onShowAll: () => void;
  statusById: Map<string, RoomStatus>;
  index: RoomIndex;
  calendar: AcademicCalendar;
  now: Date;
  query: string;
}) {
  const rooms = showAll ? matches : matches.slice(0, RESULTS_PAGE);
  const total = matches.length;
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
  const expandFirst = total === 1 || namesExactRoom(query, rooms[0]);

  return (
    <>
      <p className="tabular mb-4 text-sm text-ink-muted">
        {total} {total === 1 ? "room" : "rooms"}, {openCount} open now.
      </p>
      <div
        className={[
          "grid items-start gap-2",
          // A single exact match keeps the full width for its schedule; a list of candidates is
          // easier to scan two-up than as one very wide column.
          expandFirst && total === 1 ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2",
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

      {total > rooms.length && (
        <button
          type="button"
          onClick={onShowAll}
          className="mt-4 rounded-[var(--radius-control)] border border-line px-4 py-2 text-sm text-ink-body transition-colors hover:border-line-strong hover:text-ink"
        >
          Show the other {total - rooms.length}
        </button>
      )}
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
      <p className="tabular text-center text-xl leading-snug text-balance text-ink sm:text-2xl sm:whitespace-nowrap">
        {totalOpen} of {statuses.length} rooms have nothing scheduled in them right now.
      </p>

      <h2 className="mt-12 text-sm text-ink-muted">
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
function Footnote({ generatedAt, clubEvents }: { generatedAt?: string; clubEvents?: number }) {
  return (
    <footer className="mt-20 border-t border-line pt-6">
      <p className="max-w-2xl text-sm text-ink-muted">
        vacantNEU shows where nothing is scheduled: classes from Northeastern&rsquo;s course
        catalog, plus club events from Engage whose venue names a room we track. That is still not
        the same as unlocked. Departments book rooms directly, exams follow their own schedule, and
        a room with nothing in it can simply be locked. Only rooms that host at least one class
        appear here.
      </p>
      {generatedAt && (
        <p className="tabular mt-3 text-xs text-ink-faint">
          Schedule from Northeastern Banner, updated {formatDay(generatedAt, true)}.
          {clubEvents !== undefined &&
            clubEvents > 0 &&
            ` Plus ${clubEvents} club bookings from Engage.`}
        </p>
      )}
    </footer>
  );
}
