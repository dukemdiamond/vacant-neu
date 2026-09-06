"use client";

import { useCallback, useEffect, useState } from "react";
import type { Campus, Room, RoomStatus, ScheduleArtifact } from "@vacantneu/core";

export const DEFAULT_CAMPUS = "BOS";
const STORAGE_KEY = "vacantneu.campus";

/**
 * The campus every count and list on a page is scoped to.
 *
 * Remembered across pages and visits, because someone studying in Oakland is studying in Oakland
 * tomorrow too, and re-picking it on every navigation would be tedious. Read after mount rather
 * than during render: the server cannot know the stored value, so using it in the first paint
 * would guarantee a hydration mismatch.
 */
export function useCampus(): [string, (code: string) => void] {
  const [campus, setCampus] = useState(DEFAULT_CAMPUS);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) setCampus(saved);
  }, []);

  const choose = useCallback((code: string) => {
    setCampus(code);
    try {
      window.localStorage.setItem(STORAGE_KEY, code);
    } catch {
      // Private browsing can refuse writes. Losing the preference is not worth an error.
    }
  }, []);

  return [campus, choose];
}

/** The campus record for a code, falling back to the largest campus if it is unknown. */
export function resolveCampus(campuses: Campus[], code: string): Campus | null {
  return campuses.find((c) => c.code === code) ?? campuses[0] ?? null;
}

/** Rooms on one campus. */
export function roomsOnCampus(artifact: ScheduleArtifact, campus: string): Room[] {
  return artifact.rooms.filter((r) => r.campus === campus);
}

/** Statuses for one campus, keyed for lookup. */
export function statusesOnCampus(
  artifact: ScheduleArtifact,
  statuses: RoomStatus[],
  campus: string,
): RoomStatus[] {
  const onCampus = new Set(roomsOnCampus(artifact, campus).map((r) => r.id));
  return statuses.filter((s) => onCampus.has(s.roomId));
}
