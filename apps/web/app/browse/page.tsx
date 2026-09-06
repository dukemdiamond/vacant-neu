"use client";

import { useMemo, useState } from "react";
import {
  campusInstant,
  isFreeFor,
  type Building,
  type Room,
  type RoomStatus,
} from "@vacantneu/core";
import { CampusSelect } from "@/components/CampusSelect";
import { PhaseNotice } from "@/components/PhaseNotice";
import { RoomCard } from "@/components/RoomCard";
import { SearchField } from "@/components/SearchField";
import { SegmentedControl, type Segment } from "@/components/SegmentedControl";
import { TimeTravel, type Moment } from "@/components/TimeTravel";
import { ResultsSkeleton } from "@/components/Skeleton";
import { useAllStatuses, useNow, useRoomIndex, useSchedule, type RoomIndex } from "@/lib/schedule";
import { resolveCampus, useCampus } from "@/lib/campus";
import { termPhase } from "@/lib/term";

type Availability = "all" | "now" | "1h" | "2h";

/** "Open now" is only true while following the clock; inspecting another moment relabels it. */
function availabilitySegments(viewingOtherDay: boolean): readonly Segment<Availability>[] {
  return [
    { value: "all", label: "All" },
    { value: "now", label: viewingOtherDay ? "Open then" : "Open now" },
    { value: "1h", label: "1 hour" },
    { value: "2h", label: "2 hours" },
  ];
}

/** Minutes a room must stay free to satisfy each filter. */
const REQUIRED_MINUTES: Record<Availability, number> = { all: 0, now: 0, "1h": 60, "2h": 120 };

const ALL_BUILDINGS = "__all__";

export default function BrowsePage() {
  const state = useSchedule();
  const now = useNow();

  const [availability, setAvailability] = useState<Availability>("now");
  const [building, setBuilding] = useState<string>(ALL_BUILDINGS);
  const [query, setQuery] = useState("");
  const [moment, setMoment] = useState<Moment | null>(null);
  const [campus, setCampus] = useCampus();

  /**
   * The instant every room on this page is evaluated against. Null moment means follow the clock;
   * an unparseable one falls back to it rather than showing a blank page.
   */
  const at = useMemo(
    () => (moment ? (campusInstant(moment.date, moment.time) ?? now) : now),
    [moment, now],
  );
  const viewingOtherDay = moment !== null;

  const artifact = state.status === "ready" ? state.artifact : null;
  const index = useRoomIndex(artifact);
  const statuses = useAllStatuses(artifact, at);
  const statusById = useMemo(() => new Map(statuses.map((s) => [s.roomId, s])), [statuses]);

  const activeCampus = artifact ? resolveCampus(artifact.campuses, campus) : null;
  const campusCode = activeCampus?.code ?? campus;
  const campusBuildings = useMemo(
    () => (artifact ? artifact.buildings.filter((b) => b.campus === campusCode) : []),
    [artifact, campusCode],
  );

  /**
   * Rooms passing the availability filter and the text query, before the building filter.
   *
   * The building filter is applied last and separately so the sidebar can show how many rooms
   * each building would contribute under the current filters. Counting after the building filter
   * would leave every other building reading zero.
   */
  const candidates = useMemo(() => {
    if (!artifact || !index) return [];

    const allowed = query.trim()
      ? new Set(index.search.search(query.trim()).map((hit) => hit.id as string))
      : null;

    return artifact.rooms.filter((room) => {
      // One campus at a time. A pooled list would put Vancouver rooms in a Boston search.
      if (room.campus !== campusCode) return false;
      if (allowed && !allowed.has(room.id)) return false;
      const status = statusById.get(room.id);
      if (!status) return false;
      if (availability === "all") return true;
      return isFreeFor(status, REQUIRED_MINUTES[availability]);
    });
  }, [artifact, index, query, statusById, availability, campusCode]);

  const countByBuilding = useMemo(() => {
    const counts = new Map<string, number>();
    for (const room of candidates) counts.set(room.building, (counts.get(room.building) ?? 0) + 1);
    return counts;
  }, [candidates]);

  const visible = useMemo(
    () =>
      building === ALL_BUILDINGS ? candidates : candidates.filter((r) => r.building === building),
    [candidates, building],
  );

  const phase = useMemo(
    () => (artifact ? termPhase(artifact, at) : { kind: "in-session" as const }),
    [artifact, at],
  );

  const grouped = useMemo(() => {
    if (!artifact) return [];
    const byCode = new Map<string, Room[]>();
    for (const room of visible) {
      const list = byCode.get(room.building);
      if (list) list.push(room);
      else byCode.set(room.building, [room]);
    }
    return campusBuildings
      .filter((b) => byCode.has(b.code))
      .map((b) => ({ building: b, rooms: byCode.get(b.code)! }));
  }, [visible, campusBuildings]);

  return (
    <main className="mx-auto max-w-7xl px-5 pb-24 sm:px-8">
      <section className="pt-14 text-center sm:pt-20">
        <h1 className="display-lg text-4xl font-semibold sm:text-5xl">Every classroom</h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-balance text-ink-muted">
          Filter by building or by how long you need the room, at any date and time.
        </p>
      </section>

      {state.status === "loading" && (
        <div className="mt-12">
          <ResultsSkeleton />
        </div>
      )}
      {state.status === "error" && (
        <p className="mt-12 rounded-[var(--radius-card)] border border-line p-8 text-ink">
          The schedule did not load. {state.message}
        </p>
      )}

      {state.status === "ready" && artifact && index && (
        <>
          <div className="mt-10 flex flex-col gap-4 border-b border-line pb-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-sm flex-1">
                <SearchField
                  value={query}
                  onChange={setQuery}
                  resultCount={visible.length}
                  placeholder="Filter by building or room"
                  label="Filter classrooms by building or room number"
                />
              </div>
              {/* Scrollable on narrow screens so the segments never wrap onto two rows. */}
              <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
                <SegmentedControl
                  label="Filter by how long the room stays free"
                  value={availability}
                  segments={availabilitySegments(viewingOtherDay)}
                  onChange={setAvailability}
                />
              </div>
            </div>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <TimeTravel value={moment} onChange={setMoment} now={now} />
              <CampusSelect campuses={artifact.campuses} value={campusCode} onChange={setCampus} />
            </div>
          </div>

          <p className="tabular mt-6 text-sm text-ink-muted">
            {summarize(
              visible.length,
              availability,
              phase.kind === "in-session",
              at,
              viewingOtherDay,
            )}
          </p>

          <div className="mt-6">
            <PhaseNotice phase={phase} viewingOtherDay={viewingOtherDay} />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-[17rem_1fr]">
            <BuildingFilter
              buildings={campusBuildings}
              counts={countByBuilding}
              total={candidates.length}
              selected={building}
              onSelect={setBuilding}
            />

            <div className="min-w-0">
              {grouped.length === 0 ? (
                <EmptyState
                  onReset={() => {
                    setAvailability("all");
                    setQuery("");
                    setBuilding(ALL_BUILDINGS);
                  }}
                />
              ) : (
                <div className="flex flex-col gap-10">
                  {grouped.map(({ building: b, rooms }) => (
                    <section key={b.code}>
                      <h2 className="text-sm text-ink-muted">
                        {b.name}
                        <span className="tabular text-ink-faint"> {rooms.length}</span>
                      </h2>
                      {/* Two columns once the results pane is wide enough; these cards are a
                          single line of detail and stretch badly across a full desktop width. */}
                      {/* items-start so expanding one card does not stretch its row neighbour. */}
                      <div className="mt-3 grid grid-cols-1 items-start gap-2 md:grid-cols-2">
                        {rooms.map((room) => (
                          <RoomCard
                            key={room.id}
                            room={room}
                            status={statusById.get(room.id)!}
                            meetings={index.meetings.get(room.id) ?? []}
                            calendar={artifact.calendar}
                            now={at}
                            showBuilding={false}
                          />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </main>
  );
}

const MOMENT_LABEL = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function summarize(
  count: number,
  availability: Availability,
  inSession: boolean,
  at: Date,
  viewingOtherDay: boolean,
): string {
  const rooms = `${count} ${count === 1 ? "room" : "rooms"}`;
  const when = viewingOtherDay ? `at ${MOMENT_LABEL.format(at)}` : "right now";

  if (availability === "all") return `${rooms} on campus.`;
  if (!inSession) {
    return `${rooms}. No classes are scheduled ${viewingOtherDay ? "then" : "today"}, so everything reads as open.`;
  }
  if (availability === "now") return `${rooms} open ${when}.`;
  const window = availability === "1h" ? "an hour" : "two hours";
  return `${rooms} open for at least ${window} ${viewingOtherDay ? `from ${MOMENT_LABEL.format(at)}` : "from now"}.`;
}

/**
 * Building filter.
 *
 * Sticky beside the results on desktop so the list stays reachable during a long scroll, and a
 * bounded scroll panel above them on mobile rather than 40 rows the user must swipe past to
 * reach the rooms they came for.
 */
function BuildingFilter({
  buildings,
  counts,
  total,
  selected,
  onSelect,
}: {
  buildings: Building[];
  counts: Map<string, number>;
  total: number;
  selected: string;
  onSelect: (code: string) => void;
}) {
  const withRooms = buildings.filter((b) => (counts.get(b.code) ?? 0) > 0);

  return (
    <nav
      aria-label="Filter by building"
      className={[
        // On mobile this is a bounded scroll panel, so it needs a visible edge; without one the
        // list just stops mid-building and reads as a truncation bug rather than a scroll region.
        "max-h-64 overflow-y-auto rounded-[var(--radius-card)] border border-line p-1",
        "lg:sticky lg:top-6 lg:max-h-[calc(100dvh-4rem)] lg:self-start lg:rounded-none lg:border-0 lg:p-0",
      ].join(" ")}
    >
      <ul className="flex flex-col">
        <BuildingRow
          label="All buildings"
          count={total}
          active={selected === ALL_BUILDINGS}
          onSelect={() => onSelect(ALL_BUILDINGS)}
        />
        {withRooms.map((b) => (
          <BuildingRow
            key={b.code}
            label={b.name}
            count={counts.get(b.code) ?? 0}
            active={selected === b.code}
            onSelect={() => onSelect(b.code)}
          />
        ))}
      </ul>
    </nav>
  );
}

function BuildingRow({
  label,
  count,
  active,
  onSelect,
}: {
  label: string;
  count: number;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        aria-current={active ? "true" : undefined}
        onClick={onSelect}
        className={[
          "flex w-full items-baseline justify-between gap-3 rounded-[var(--radius-control)] px-3 py-2 text-left text-sm transition-colors",
          active ? "bg-wash text-ink" : "text-ink-muted hover:bg-wash-faint hover:text-ink",
        ].join(" ")}
      >
        <span className="truncate">{label}</span>
        <span className="tabular shrink-0 text-ink-faint">{count}</span>
      </button>
    </li>
  );
}

function EmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line p-8">
      <p className="text-ink">No rooms match these filters.</p>
      <p className="mt-2 max-w-md text-sm text-ink-muted">
        Every classroom may be booked at this hour. Try a shorter window, or check back between
        classes.
      </p>
      <button
        type="button"
        onClick={onReset}
        className="mt-5 rounded-[var(--radius-control)] bg-ink px-4 py-2 text-sm text-ink-inverse shadow-[var(--shadow-inset)] transition-opacity active:opacity-80"
      >
        Clear filters
      </button>
    </div>
  );
}
