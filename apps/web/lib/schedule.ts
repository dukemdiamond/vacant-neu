"use client";

import { useEffect, useMemo, useState } from "react";
import MiniSearch from "minisearch";
import {
  allRoomStatuses,
  indexMeetingsByRoom,
  type Meeting,
  type Room,
  type RoomStatus,
  type ScheduleArtifact,
} from "@vacantneu/core";

export type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; artifact: ScheduleArtifact };

/**
 * Loads the schedule artifact once and builds a search index over rooms.
 *
 * The artifact is fetched rather than imported so it stays out of the JS bundle and can be
 * revalidated by the CDN independently of a code deploy.
 */
export function useSchedule(): LoadState {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    fetch("./data/schedule.json", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Schedule unavailable (${response.status})`);
        return response.json() as Promise<ScheduleArtifact>;
      })
      .then((artifact) => setState({ status: "ready", artifact }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Could not load the schedule.",
        });
      });
    return () => controller.abort();
  }, []);

  return state;
}

/**
 * A clock that re-renders on a cadence.
 *
 * Vacancy is a function of the current minute, so a page left open would otherwise drift out of
 * date. Ticking on the minute boundary rather than every 60s keeps the countdown honest.
 */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const msToNextMinute = 60_000 - (Date.now() % 60_000);
      timer = setTimeout(() => {
        setNow(new Date());
        schedule();
      }, msToNextMinute + 50);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);

  return now;
}

export interface RoomHit {
  room: Room;
  status: RoomStatus;
  meetings: Meeting[];
}

interface SearchDoc {
  id: string;
  room: string;
  roomLoose: string;
  building: string;
  buildingCode: string;
}

/**
 * Builds the MiniSearch index and a room lookup.
 *
 * Rooms are indexed by building name, building code, and room number in both the padded and
 * unpadded spelling, because Banner writes "070" and students type "70".
 */
export interface RoomIndex {
  search: MiniSearch<SearchDoc>;
  rooms: Map<string, Room>;
  meetings: Map<string, Meeting[]>;
  buildingNames: Map<string, string>;
}

export function useRoomIndex(artifact: ScheduleArtifact | null): RoomIndex | null {
  return useMemo(() => {
    if (!artifact) return null;

    const buildingNames = new Map(artifact.buildings.map((b) => [b.code, b.name]));
    const search = new MiniSearch<SearchDoc>({
      fields: ["room", "roomLoose", "building", "buildingCode"],
      storeFields: ["id"],
      searchOptions: {
        prefix: true,
        // Building names tolerate typos, room numbers must not: with a flat fuzzy factor,
        // "Ryder 155" also matches 153, 154, 156 and 158, burying the room actually asked for.
        fuzzy: (term) => (/^\d+$/.test(term) ? false : 0.2),
        boost: { buildingCode: 2, room: 2, roomLoose: 2 },
        combineWith: "AND",
      },
    });

    search.addAll(
      artifact.rooms.map((room) => ({
        id: room.id,
        room: room.room,
        roomLoose: room.room.replace(/^0+/, ""),
        building: buildingNames.get(room.building) ?? room.building,
        buildingCode: room.building,
      })),
    );

    return {
      search,
      rooms: new Map(artifact.rooms.map((r) => [r.id, r])),
      meetings: indexMeetingsByRoom(artifact.meetings),
      buildingNames,
    };
  }, [artifact]);
}

/** Live status for every room, recomputed when the clock ticks. */
export function useAllStatuses(artifact: ScheduleArtifact | null, now: Date): RoomStatus[] {
  return useMemo(() => (artifact ? allRoomStatuses(artifact, now) : []), [artifact, now]);
}
