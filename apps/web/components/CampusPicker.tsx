"use client";

import { useEffect, useRef, useState } from "react";
import type { Campus } from "@vacantneu/core";

interface Props {
  campuses: Campus[];
  value: string;
  onChange: (code: string) => void;
  /** Centres the row, for the home page hero. */
  centered?: boolean;
}

/**
 * Campuses shown before the row offers the rest.
 *
 * Eleven pills is a wall. Four covers almost everyone, since Boston, New York and Oakland hold
 * 87% of all timetabled rooms between them.
 */
const VISIBLE = 4;

/**
 * Campus selector.
 *
 * One campus at a time, never all of them pooled: "412 rooms are open" is meaningless if some of
 * them are in Vancouver. Pills scroll horizontally rather than wrapping, so the row stays one
 * line however many campuses Banner grows.
 */
export function CampusPicker({ campuses, value, onChange, centered = false }: Props) {
  const selected = useRef<HTMLButtonElement>(null);

  /*
   * Keep the chosen campus visible.
   *
   * Eleven pills overflow most screens, and the row can be scrolled anywhere, so the one that is
   * actually selected could easily sit off-screen and make the page look unfiltered.
   */
  useEffect(() => {
    selected.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [value]);

  const [expanded, setExpanded] = useState(false);

  if (campuses.length < 2) return null;

  // The selected campus is always shown, even when it sits outside the visible few.
  const selectedIndex = campuses.findIndex((c) => c.code === value);
  const shown =
    expanded || selectedIndex >= VISIBLE
      ? expanded
        ? campuses
        : [...campuses.slice(0, VISIBLE), campuses[selectedIndex]!]
      : campuses.slice(0, VISIBLE);
  const hidden = campuses.length - shown.length;

  return (
    <div
      role="group"
      aria-label="Choose a campus"
      /*
       * An inline-flex inside a text-aligned scroller, rather than justify-center on the flex
       * container itself. Centring a flex row that overflows pushes its first items past the
       * scroll origin, where they cannot be reached.
       */
      className={[
        "-mx-5 overflow-x-auto px-5 pb-1 sm:mx-0 sm:px-0",
        centered ? "sm:text-center" : "",
      ].join(" ")}
    >
      <div className="inline-flex gap-2">
        {shown.map((campus) => {
          const active = campus.code === value;
          return (
            <button
              key={campus.code}
              ref={active ? selected : undefined}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(campus.code)}
              className={[
                "shrink-0 rounded-full px-4 py-1.5 text-sm whitespace-nowrap transition-colors active:opacity-80",
                active
                  ? "bg-accent text-[#fcfbf8] shadow-[var(--shadow-inset)]"
                  : "border border-line bg-surface-raised text-ink-muted hover:border-line-strong hover:text-ink",
              ].join(" ")}
            >
              {campus.name}
              {/* Only the selected campus shows its size. Eleven counts at once is noise, and it
                  roughly halves the width of the row. */}
              {active && <span className="ml-2 opacity-70">{campus.roomCount}</span>}
            </button>
          );
        })}
        {(hidden > 0 || expanded) && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 rounded-full border border-line bg-surface-raised px-4 py-1.5 text-sm whitespace-nowrap text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
          >
            {expanded ? "Show less" : `${hidden} more`}
          </button>
        )}
      </div>
    </div>
  );
}
