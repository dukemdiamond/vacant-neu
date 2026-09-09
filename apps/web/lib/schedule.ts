"use client";

import { useEffect, useMemo, useState } from "react";
import MiniSearch from "minisearch";
import { useNow } from "./clock";
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
  | { status: "ready"; artifact: ScheduleArtifact; clubEvents: number };

interface EventArtifact {
  meetings: Meeting[];
}

/**
 * Loads the class schedule and the club events, and merges them into one set of bookings.
 *
 * Both are fetched rather than imported so they stay out of the JS bundle and can be revalidated
 * by the CDN independently of a code deploy.
 *
 * The two sources are not equal partners. The class schedule is required; the club events come
 * from an undocumented endpoint behind a credential that expires, so a failure to load them
 * degrades the answer rather than breaking the page. Getting that backwards would mean an expired
 * cookie takes down the thing the app is actually for.
 */
export function useSchedule(): LoadState {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    const schedule = fetch("./data/schedule.json", { signal: controller.signal }).then(
      (response) => {
        if (!response.ok) throw new Error(`Schedule unavailable (${response.status})`);
        return response.json() as Promise<ScheduleArtifact>;
      },
    );

    const events = fetch("./data/events.json", { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<EventArtifact>) : null))
      .catch(() => null);

    Promise.all([schedule, events])
      .then(([artifact, clubs]) => {
        const extra = clubs?.meetings ?? [];
        setState({
          status: "ready",
          artifact: extra.length
            ? { ...artifact, meetings: [...artifact.meetings, ...extra] }
            : artifact,
          clubEvents: extra.length,
        });
      })
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
  /** Every class and event that meets in this room, so a course code finds its classroom. */
  bookings: string;
}

/** A room the query matched, and whether it matched only because of what is booked in it. */
export interface RoomHit {
  room: Room;
  /**
   * True when the query hit a class or event name rather than a building or room number.
   *
   * Searching a course code is a request to find that class's room, not a free room, so callers
   * use this to keep the result visible even when an availability filter would drop it.
   */
  viaBooking: boolean;
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
  /** Rooms matching a query, ranked, each tagged with how it matched. */
  lookup(query: string): RoomHit[];
}

export function useRoomIndex(artifact: ScheduleArtifact | null): RoomIndex | null {
  return useMemo(() => {
    if (!artifact) return null;

    const buildingNames = new Map(artifact.buildings.map((b) => [b.code, b.name]));
    const search = new MiniSearch<SearchDoc>({
      fields: ["room", "roomLoose", "building", "buildingCode", "bookings"],
      storeFields: ["id"],
      searchOptions: {
        prefix: true,
        // Building names tolerate typos, room numbers must not: with a flat fuzzy factor,
        // "Ryder 155" also matches 153, 154, 156 and 158, burying the room actually asked for.
        fuzzy: (term) => (/^\d+$/.test(term) ? false : 0.2),
        // A room number should outrank a course that happens to contain the same digits.
        boost: { buildingCode: 2, room: 2, roomLoose: 2, bookings: 0.5 },
        combineWith: "AND",
      },
    });

    const meetings = indexMeetingsByRoom(artifact.meetings);
    const rooms = new Map(artifact.rooms.map((r) => [r.id, r]));

    search.addAll(
      artifact.rooms.map((room) => ({
        id: room.id,
        room: room.room,
        roomLoose: room.room.replace(/^0+/, ""),
        building: buildingNames.get(room.building) ?? room.building,
        buildingCode: room.building,
        // Deduplicated: a lecture repeating three times a week should not weight its room three
        // times as heavily as one that meets once.
        bookings: [
          ...new Set((meetings.get(room.id) ?? []).flatMap((m) => [m.label, m.detail])),
        ].join(" "),
      })),
    );

    const ROOM_FIELDS = new Set(["room", "roomLoose", "building", "buildingCode"]);

    return {
      search,
      rooms,
      meetings,
      buildingNames,
      lookup(query: string): RoomHit[] {
        const trimmed = query.trim();
        if (!trimmed) return [];
        return search
          .search(trimmed)
          .map((hit) => {
            const room = rooms.get(hit.id as string);
            if (!room) return null;
            // `match` maps each matched term to the fields it was found in.
            const fields = Object.values(hit.match).flat();
            return { room, viaBooking: !fields.some((f) => ROOM_FIELDS.has(f)) };
          })
          .filter((hit): hit is RoomHit => hit !== null);
      },
    };
  }, [artifact]);
}

/** Live status for every room, recomputed when the clock ticks. */
export function useAllStatuses(artifact: ScheduleArtifact | null, now: Date): RoomStatus[] {
  return useMemo(() => (artifact ? allRoomStatuses(artifact, now) : []), [artifact, now]);
}

export { useNow };
