"use client";

import { useEffect, useRef } from "react";
import type { Campus } from "@vacantneu/core";

interface Props {
  campuses: Campus[];
  value: string;
  onChange: (code: string) => void;
  /** Centres the row, for the home page hero. */
  centered?: boolean;
}

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

  if (campuses.length < 2) return null;

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
        {campuses.map((campus) => {
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
      </div>
    </div>
  );
}
