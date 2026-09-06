"use client";

import { NavigationArrowIcon } from "@phosphor-icons/react";
import type { BuildingLocation } from "@/lib/buildings";

/**
 * Opens walking directions in whatever map app the device prefers.
 *
 * Apple platforms get maps.apple.com, which hands off to Maps; everything else gets Google's
 * universal directions URL, which opens the Google Maps app when it is installed and the web
 * otherwise. Renders nothing when the building has no coordinates, which is every campus outside
 * Boston: the footprints come from an OpenStreetMap query around that campus.
 */
export function DirectionsLink({
  location,
  compact = false,
}: {
  location: BuildingLocation | undefined;
  compact?: boolean;
}) {
  if (!location) return null;

  const href = directionsUrl(location);
  const label = `Directions to ${location.name}`;

  if (compact) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        title="Directions"
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 rounded-[var(--radius-control)] p-1.5 text-ink-faint transition-colors hover:bg-wash hover:text-ink"
      >
        <NavigationArrowIcon size={15} weight="regular" aria-hidden />
      </a>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border border-line px-3 py-1.5 text-sm text-ink-body transition-colors hover:border-line-strong hover:text-ink"
    >
      <NavigationArrowIcon size={14} weight="regular" aria-hidden />
      Directions
    </a>
  );
}

function directionsUrl({ lat, lon, name }: BuildingLocation): string {
  const isApple =
    typeof navigator !== "undefined" && /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
  const coords = `${lat},${lon}`;
  return isApple
    ? `https://maps.apple.com/?daddr=${coords}&dirflg=w&q=${encodeURIComponent(name)}`
    : `https://www.google.com/maps/dir/?api=1&destination=${coords}&travelmode=walking`;
}
