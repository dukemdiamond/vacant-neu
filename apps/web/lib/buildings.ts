"use client";

import { useEffect, useState } from "react";

export interface BuildingLocation {
  code: string;
  name: string;
  lat: number;
  lon: number;
}

/**
 * Building coordinates, shared by the map and by the directions links.
 *
 * Fetched once per page load and cached at module scope: several room cards can ask for it at the
 * same moment, and each mounting its own request would be wasteful.
 */
let pending: Promise<Map<string, BuildingLocation>> | null = null;

function load(): Promise<Map<string, BuildingLocation>> {
  pending ??= fetch("./data/buildings.geojson")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((geo: GeoJSON.FeatureCollection) => {
      const out = new Map<string, BuildingLocation>();
      for (const feature of geo.features) {
        const p = feature.properties ?? {};
        if (typeof p.code === "string" && typeof p.lat === "number" && typeof p.lon === "number") {
          out.set(p.code, { code: p.code, name: String(p.name ?? p.code), lat: p.lat, lon: p.lon });
        }
      }
      return out;
    })
    // Directions are an extra. Losing them should never surface as an error on a room list.
    .catch(() => new Map<string, BuildingLocation>());
  return pending;
}

export function useBuildingLocations(): Map<string, BuildingLocation> {
  const [locations, setLocations] = useState<Map<string, BuildingLocation>>(new Map());
  useEffect(() => {
    let live = true;
    load().then((m) => live && setLocations(m));
    return () => {
      live = false;
    };
  }, []);
  return locations;
}
