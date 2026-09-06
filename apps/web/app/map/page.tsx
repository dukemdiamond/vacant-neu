"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowLeftIcon } from "@phosphor-icons/react";
import type { AcademicCalendar, Building, Meeting, Room, RoomStatus } from "@vacantneu/core";
import { RoomCard } from "@/components/RoomCard";
import { useAllStatuses, useNow, useRoomIndex, useSchedule } from "@/lib/schedule";

// MapLibre needs `window` and is by far the heaviest dependency in the app, so it is loaded only
// on this route and only in the browser.
const CampusMap = dynamic(() => import("@/components/CampusMap").then((m) => m.CampusMap), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-wash-faint" />,
});

/** Tracks the OS colour scheme so the map style can follow the rest of the page. */
function usePrefersDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    setDark(query.matches);
    const onChange = (event: MediaQueryListEvent) => setDark(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return dark;
}

export default function MapPage() {
  const state = useSchedule();
  const now = useNow();
  const dark = usePrefersDark();
  const [footprints, setFootprints] = useState<GeoJSON.FeatureCollection | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const artifact = state.status === "ready" ? state.artifact : null;
  const index = useRoomIndex(artifact);
  const statuses = useAllStatuses(artifact, now);
  const statusById = useMemo(() => new Map(statuses.map((s) => [s.roomId, s])), [statuses]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("./data/buildings.geojson", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setFootprints)
      .catch(() => setFootprints({ type: "FeatureCollection", features: [] }));
    return () => controller.abort();
  }, []);

  /*
   * Boston only.
   *
   * The footprints come from OpenStreetMap around the Boston campus, so a map of them cannot
   * show a room in Oakland. Rather than plot nothing for the other ten campuses, this view is
   * scoped to the one it can actually draw.
   */
  const bostonRooms = useMemo(
    () => new Set((artifact?.rooms ?? []).filter((r) => r.campus === "BOS").map((r) => r.id)),
    [artifact],
  );
  const bostonBuildings = useMemo(
    () => (artifact?.buildings ?? []).filter((b) => b.campus === "BOS"),
    [artifact],
  );

  const openByBuilding = useMemo(() => {
    const counts = new Map<string, number>();
    for (const status of statuses) {
      if (status.state !== "free" || !bostonRooms.has(status.roomId)) continue;
      const code = status.roomId.slice(0, status.roomId.lastIndexOf("-"));
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    return counts;
  }, [statuses, bostonRooms]);

  /** Footprints with the live open count merged in, which is what the map styles against. */
  const mapData = useMemo<GeoJSON.FeatureCollection>(() => {
    if (!footprints) return { type: "FeatureCollection", features: [] };
    return {
      ...footprints,
      features: footprints.features.map((feature) => ({
        ...feature,
        properties: {
          ...feature.properties,
          openCount: openByBuilding.get(feature.properties?.code as string) ?? 0,
        },
      })),
    };
  }, [footprints, openByBuilding]);

  const selectedBuilding = bostonBuildings.find((b) => b.code === selected) ?? null;

  return (
    /*
     * A definite height, not flex-1. The body only sets a minimum height, so a flex child has no
     * definite size to resolve against and the map stretches to whatever the building list needs.
     * 10rem is the masthead plus the footer, leaving the map and its panel to fill one screen.
     */
    <main className="flex h-[calc(100dvh-10rem)] min-h-[30rem] flex-col lg:flex-row">
      <div className="h-[45%] shrink-0 border-b border-line lg:h-full lg:flex-1 lg:border-r lg:border-b-0">
        <CampusMap data={mapData} selected={selected} onSelect={setSelected} dark={dark} />
      </div>

      <aside className="min-h-0 flex-1 overflow-y-auto lg:w-[26rem] lg:flex-none">
        <div className="px-5 py-6 sm:px-6">
          {state.status === "loading" && <p className="text-sm text-ink-muted">Loading rooms.</p>}
          {state.status === "error" && (
            <p className="text-sm text-ink-muted">The schedule did not load. {state.message}</p>
          )}
          {state.status === "ready" && artifact && index && (
            <>
              {selectedBuilding ? (
                <BuildingPanel
                  building={selectedBuilding}
                  rooms={artifact.rooms.filter((r) => r.building === selectedBuilding.code)}
                  statusById={statusById}
                  meetings={index.meetings}
                  calendar={artifact.calendar}
                  now={now}
                  onBack={() => setSelected(null)}
                />
              ) : (
                <Legend
                  buildings={bostonBuildings}
                  openByBuilding={openByBuilding}
                  totalOpen={
                    statuses.filter((s) => s.state === "free" && bostonRooms.has(s.roomId)).length
                  }
                  onSelect={setSelected}
                />
              )}
            </>
          )}
        </div>
      </aside>
    </main>
  );
}

function BuildingPanel({
  building,
  rooms,
  statusById,
  meetings,
  calendar,
  now,
  onBack,
}: {
  building: Building;
  rooms: Room[];
  statusById: Map<string, RoomStatus>;
  meetings: Map<string, Meeting[]>;
  calendar: AcademicCalendar;
  now: Date;
  onBack: () => void;
}) {
  const open = rooms.filter((r) => statusById.get(r.id)?.state === "free");
  const busy = rooms.filter((r) => statusById.get(r.id)?.state === "occupied");

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="-ml-2 inline-flex items-center gap-2 rounded-[var(--radius-control)] px-2 py-1 text-sm text-ink-muted transition-colors hover:bg-wash hover:text-ink"
      >
        <ArrowLeftIcon size={14} weight="bold" aria-hidden />
        All buildings
      </button>

      <h1 className="display-lg mt-4 text-2xl font-semibold">{building.name}</h1>
      <p className="tabular mt-1 text-sm text-ink-muted">
        {open.length} of {rooms.length} rooms open right now
      </p>

      {open.length > 0 && (
        <div className="mt-6 flex flex-col gap-2">
          {open.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              status={statusById.get(room.id)!}
              meetings={meetings.get(room.id) ?? []}
              calendar={calendar}
              now={now}
              showBuilding={false}
            />
          ))}
        </div>
      )}

      {busy.length > 0 && (
        <>
          <h2 className="mt-8 text-sm text-ink-muted">In use</h2>
          <div className="mt-3 flex flex-col gap-2">
            {busy.map((room) => (
              <RoomCard
                key={room.id}
                room={room}
                status={statusById.get(room.id)!}
                meetings={meetings.get(room.id) ?? []}
                calendar={calendar}
                now={now}
                showBuilding={false}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function Legend({
  buildings,
  openByBuilding,
  totalOpen,
  onSelect,
}: {
  buildings: Building[];
  openByBuilding: Map<string, number>;
  totalOpen: number;
  onSelect: (code: string) => void;
}) {
  const ranked = buildings
    .map((b) => ({ ...b, open: openByBuilding.get(b.code) ?? 0 }))
    .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));

  return (
    <>
      <h1 className="display-lg text-2xl font-semibold">Campus map</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Buildings with open rooms are outlined and labelled with how many. Pick one on the map, or
        from the list.
      </p>
      <p className="tabular mt-4 text-sm text-ink">{totalOpen} rooms open right now.</p>

      <ul className="mt-4 flex flex-col">
        {ranked.map((b) => (
          <li key={b.code}>
            <button
              type="button"
              onClick={() => onSelect(b.code)}
              className="flex w-full items-baseline justify-between gap-3 border-b border-line py-2.5 text-left text-sm transition-colors hover:border-line-strong"
            >
              <span className={b.open > 0 ? "text-ink" : "text-ink-faint"}>{b.name}</span>
              <span className="tabular shrink-0 text-ink-muted">
                {b.open} of {b.roomCount}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
