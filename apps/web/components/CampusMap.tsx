"use client";

import { useEffect, useRef, useState } from "react";
import {
  GeolocateControl,
  Map as MapLibreMap,
  NavigationControl,
  type GeoJSONSource,
  type LayerSpecification,
  type MapMouseEvent,
  type StyleSpecification,
} from "maplibre-gl";

import "maplibre-gl/dist/maplibre-gl.css";

/** OpenFreeMap serves OpenMapTiles-schema vector tiles with no API key or sign-up. */
const BASE_STYLE = "https://tiles.openfreemap.org/styles/positron";

const CAMPUS_CENTER: [number, number] = [-71.0892, 42.3392];

export interface BuildingFeature {
  code: string;
  name: string;
  openCount: number;
  roomCount: number;
}

interface Props {
  /** Building footprints, already merged with live open counts. */
  data: GeoJSON.FeatureCollection;
  selected: string | null;
  onSelect: (code: string | null) => void;
  dark: boolean;
}

/** Palette per theme, mirroring the CSS tokens. MapLibre cannot read custom properties. */
const THEME = {
  light: {
    land: "#f7f4ed",
    water: "#e6e6dd",
    road: "#eceae4",
    roadMajor: "#e4e1d8",
    label: "#5f5f5d",
    labelHalo: "#f7f4ed",
    baseBuilding: "#efece4",
    open: "#fcfbf8",
    openLine: "#1c1c1c",
    closed: "rgba(28,28,28,0.06)",
    closedLine: "rgba(28,28,28,0.18)",
    accent: "#c8102e",
    text: "#1c1c1c",
  },
  dark: {
    land: "#1a1815",
    water: "#121110",
    road: "#262320",
    roadMajor: "#2e2a25",
    label: "#a09a8e",
    labelHalo: "#1a1815",
    baseBuilding: "#211e1a",
    open: "#2b2721",
    openLine: "#f2efe7",
    closed: "rgba(242,239,231,0.05)",
    closedLine: "rgba(242,239,231,0.16)",
    accent: "#f2556b",
    text: "#f2efe7",
  },
} as const;

/**
 * Recolours the borrowed basemap onto our palette.
 *
 * Positron is a light neutral style, not a cream one, so dropping it in unchanged would put a
 * cold grey rectangle in the middle of a warm page. Layers are remapped by type and by a few id
 * patterns rather than by an exhaustive list, so an upstream style change loses a tint at worst
 * instead of throwing.
 */
function recolour(style: StyleSpecification, dark: boolean): StyleSpecification {
  const c = THEME[dark ? "dark" : "light"];

  // Shaded relief and administrative boundaries read as noise at campus zoom.
  const noise = (id: string) =>
    id.startsWith("landcover_") || id.includes("hillshade") || id.startsWith("boundary");

  const layers = style.layers
    .filter((layer) => !noise(layer.id))
    .map((layer): LayerSpecification => {
      const id = layer.id;
      const paint = (extra: Record<string, unknown>) =>
        ({ ...layer, paint: { ...layer.paint, ...extra } }) as LayerSpecification;

      switch (layer.type) {
        case "background":
          return paint({ "background-color": c.land });
        case "fill": {
          const water = id.includes("water") || id.includes("ocean");
          return paint({
            "fill-color": water ? c.water : id === "building" ? c.baseBuilding : c.land,
            "fill-opacity": water ? 1 : 0.9,
            "fill-outline-color": water ? c.water : c.road,
          });
        }
        case "line": {
          const major = id.includes("motorway") || id.includes("trunk") || id.includes("primary");
          return paint({ "line-color": major ? c.roadMajor : c.road });
        }
        case "symbol":
          return paint({
            "text-color": c.label,
            "text-halo-color": c.labelHalo,
            "text-halo-width": 1.2,
          });
        default:
          return layer;
      }
    });

  /*
   * Keep only sources some surviving layer actually draws.
   *
   * Positron ships a `ne2_shaded` raster source that no layer references and whose tiles 404.
   * MapLibre still tries to load it, so the style never reports loaded, the `load` event never
   * fires, and the map renders as a blank rectangle with no error. Dropping unreferenced sources
   * fixes that and removes a dead network dependency at the same time.
   */
  const used = new Set(
    layers.map((layer) => ("source" in layer ? layer.source : undefined)).filter(Boolean),
  );
  const sources = Object.fromEntries(
    Object.entries(style.sources).filter(([name]) => used.has(name)),
  );

  return { ...style, sources, layers };
}

export function CampusMap({ data, selected, onSelect, dark }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  // Held in refs so the map is built once; rebuilding it on every prop change would reset the
  // user's pan and zoom mid-interaction.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  // Bumped when the building layers exist, so the data effects below re-run against a live map
  // instead of silently no-oping on the first render.
  const [ready, setReady] = useState(0);
  const observers = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    if (!container.current || map.current) return;
    let cancelled = false;

    /*
     * The style is fetched and recoloured before the map is constructed rather than after.
     * Calling setStyle from inside a style.load handler re-fires style.load, which both loops and
     * destroys the building layers added on load, leaving a blank canvas.
     */
    (async () => {
      let style: string | StyleSpecification = BASE_STYLE;
      try {
        const response = await fetch(BASE_STYLE);
        if (response.ok) style = recolour((await response.json()) as StyleSpecification, dark);
      } catch {
        // Fall back to the unmodified hosted style: a correctly-coloured map matters less than
        // having one at all.
      }
      if (cancelled || !container.current) return;

      const instance = new MapLibreMap({
        container: container.current,
        style,
        center: CAMPUS_CENTER,
        zoom: 15.2,
        minZoom: 13,
        maxZoom: 18,
        attributionControl: { compact: true },
      });
      map.current = instance;
      if (process.env.NODE_ENV !== "production") {
        (window as unknown as { __map?: MapLibreMap }).__map = instance;
      }

      // MapLibre reports missing tiles, sprites and style problems here. Left in place because a
      // silent failure on this route looks identical to an empty campus.
      instance.on("error", (event) => {
        console.error("[map]", event.error?.message ?? event);
      });

      instance.addControl(new NavigationControl({ showCompass: false }), "top-right");
      instance.addControl(
        new GeolocateControl({ trackUserLocation: false, showAccuracyCircle: true }),
        "top-right",
      );

      /*
       * The map sits in a flex layout that switches from a stacked to a side-by-side arrangement
       * at the lg breakpoint. MapLibre only watches the window, not its container, so without
       * this the canvas keeps the old dimensions after a layout change and renders letterboxed.
       */
      const observer = new ResizeObserver(() => instance.resize());
      if (container.current) observer.observe(container.current);
      observers.current = observer;

      instance.on("load", () => {
        if (cancelled) return;
        addBuildingLayers(instance, dark);
        setReady((n) => n + 1);

        const pick = (event: MapMouseEvent) => {
          const hit = instance.queryRenderedFeatures(event.point, {
            layers: ["buildings-fill", "buildings-point"],
          })[0];
          onSelectRef.current(hit ? (hit.properties?.code as string) : null);
        };
        instance.on("click", pick);

        for (const layer of ["buildings-fill", "buildings-point"]) {
          instance.on("mouseenter", layer, () => {
            instance.getCanvas().style.cursor = "pointer";
          });
          instance.on("mouseleave", layer, () => {
            instance.getCanvas().style.cursor = "";
          });
        }
      });
    })();

    return () => {
      cancelled = true;
      observers.current?.disconnect();
      observers.current = null;
      map.current?.remove();
      map.current = null;
    };
    // Built once. Theme and data changes are applied by the effects below rather than by tearing
    // the instance down and losing the user's pan and zoom.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the source in sync as the clock ticks and open counts change.
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const source = instance.getSource("buildings") as GeoJSONSource | undefined;
    source?.setData(data);
  }, [data, ready]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !instance.getLayer("buildings-outline")) return;
    const c = THEME[dark ? "dark" : "light"];
    instance.setPaintProperty("buildings-outline", "line-color", [
      "case",
      ["boolean", ["feature-state", "selected"], false],
      c.accent,
      [">", ["get", "openCount"], 0],
      c.openLine,
      c.closedLine,
    ]);
  }, [dark, ready]);

  // Highlight the selected building without re-sending the whole source.
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    if (!instance.getSource("buildings")) return;
    for (const feature of data.features) {
      const code = feature.properties?.code as string;
      instance.setFeatureState({ source: "buildings", id: code }, { selected: code === selected });
    }
    if (selected) {
      const match = data.features.find((f) => f.properties?.code === selected);
      const lon = match?.properties?.lon as number | undefined;
      const lat = match?.properties?.lat as number | undefined;
      if (lon !== undefined && lat !== undefined) {
        instance.easeTo({
          center: [lon, lat],
          duration: 600,
          zoom: Math.max(instance.getZoom(), 16),
        });
      }
    }
  }, [selected, data, ready]);

  return <div ref={container} className="h-full w-full" aria-label="Campus map of Northeastern" />;
}

/**
 * Buildings are encoded by weight rather than by a green/red pair: those with open rooms sit
 * raised and outlined, those without recede into the wash. The count label carries the actual
 * number, so the map never depends on colour alone.
 */
function addBuildingLayers(instance: MapLibreMap, dark: boolean) {
  const c = THEME[dark ? "dark" : "light"];

  instance.addSource("buildings", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
    promoteId: "code",
  });

  instance.addLayer({
    id: "buildings-fill",
    type: "fill",
    source: "buildings",
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: {
      "fill-color": ["case", [">", ["get", "openCount"], 0], c.open, c.closed],
      "fill-opacity": 0.95,
    },
  });

  instance.addLayer({
    id: "buildings-outline",
    type: "line",
    source: "buildings",
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: {
      "line-color": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        c.accent,
        [">", ["get", "openCount"], 0],
        c.openLine,
        c.closedLine,
      ],
      "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 2.5, 1],
    },
  });

  // The two buildings with no OpenStreetMap outline still need to be clickable.
  instance.addLayer({
    id: "buildings-point",
    type: "circle",
    source: "buildings",
    filter: ["==", ["geometry-type"], "Point"],
    paint: {
      "circle-radius": 7,
      "circle-color": ["case", [">", ["get", "openCount"], 0], c.open, c.closed],
      "circle-stroke-width": ["case", ["boolean", ["feature-state", "selected"], false], 2.5, 1],
      "circle-stroke-color": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        c.accent,
        [">", ["get", "openCount"], 0],
        c.openLine,
        c.closedLine,
      ],
    },
  });

  instance.addLayer({
    id: "buildings-label",
    type: "symbol",
    source: "buildings",
    minzoom: 14.5,
    layout: {
      "text-field": [
        "case",
        [">", ["get", "openCount"], 0],
        ["to-string", ["get", "openCount"]],
        "",
      ],
      "text-font": ["Noto Sans Regular"],
      "text-size": 12,
      "text-allow-overlap": false,
    },
    paint: {
      "text-color": c.text,
      "text-halo-color": c.labelHalo,
      "text-halo-width": 1.5,
    },
  });
}
