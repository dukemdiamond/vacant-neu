"use client";

import { useEffect, useMemo, useState } from "react";
import MiniSearch from "minisearch";
import { useNow } from "./clock";
import {
  allRoomStatuses,
  dedupeMeetings,
  indexMeetingsByRoom,
  searchBookings,
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
          // Deduplicated here as well as in the scraper, so an artifact published before that
          // fix, or a repeat between the two sources, still lists each booking once.
          artifact: {
            ...artifact,
            meetings: dedupeMeetings(
              extra.length ? [...artifact.meetings, ...extra] : artifact.meetings,
            ),
          },
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

interface SearchDoc {
  id: string;
  room: string;
  roomLoose: string;
  building: string;
  buildingCode: string;
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
  /**
   * The classes or events in this room that answered the query, so the card can say when they
   * meet. A card otherwise lists only today, and a room found through a class that meets there
   * on Thursdays, or only for its final, would look like it matched nothing.
   */
  matched: Meeting[];
}

/**
 * Builds the room lookup, which answers two different questions.
 *
 * "Which room is Ryder 155?" is answered by MiniSearch over building name, building code, and room
 * number in both the padded and unpadded spelling, because Banner writes "070" and students type
 * "70". Building names tolerate typos.
 *
 * "Where does CS3650 meet?" is answered by {@link searchBookings}, which matches each class or
 * event on its own and without typo tolerance. Those cannot share one index: pooling a room's
 * class titles lets the words of a query match across different classes, and fuzzy matching
 * makes CS3650 find CS6650.
 */
export interface RoomIndex {
  search: MiniSearch<SearchDoc>;
  rooms: Map<string, Room>;
  meetings: Map<string, Meeting[]>;
  buildingNames: Map<string, string>;
  /**
   * Rooms matching a query, ranked, each tagged with how it matched: rooms named by the query
   * first, then rooms hosting a matching class. Bookings that ended before `today` (campus ISO
   * date) do not count.
   */
  lookup(query: string, today?: string): RoomHit[];
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
        // Building names tolerate typos, anything with a digit must not: with a flat fuzzy
        // factor, "Ryder 155" also matches 153, 154, 156 and 158, burying the room asked for.
        fuzzy: (term) => (/\d/.test(term) ? false : 0.2),
        boost: { buildingCode: 2, room: 2, roomLoose: 2 },
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
      })),
    );

    return {
      search,
      rooms,
      meetings,
      buildingNames,
      lookup(query: string, today?: string): RoomHit[] {
        const trimmed = query.trim();
        if (!trimmed) return [];

        const bookings = searchBookings(trimmed, meetings, today);
        const hits: RoomHit[] = [];
        const seen = new Set<string>();

        for (const hit of search.search(trimmed)) {
          const room = rooms.get(hit.id as string);
          if (!room) continue;
          seen.add(room.id);
          hits.push({ room, viaBooking: false, matched: bookings.get(room.id)?.meetings ?? [] });
        }

        // Best match first, and a room the class meets in every week ahead of one it visits
        // once, for a final. Ties keep the artifact's room order, which is stable.
        const viaBooking = [...bookings]
          .filter(([id]) => !seen.has(id) && rooms.has(id))
          .sort(([, a], [, b]) => b.score - a.score || Number(b.recurring) - Number(a.recurring));
        for (const [id, match] of viaBooking) {
          hits.push({ room: rooms.get(id)!, viaBooking: true, matched: match.meetings });
        }
        return hits;
      },
    };
  }, [artifact]);
}

/** Live status for every room, recomputed when the clock ticks. */
export function useAllStatuses(artifact: ScheduleArtifact | null, now: Date): RoomStatus[] {
  return useMemo(() => (artifact ? allRoomStatuses(artifact, now) : []), [artifact, now]);
}

export { useNow };
