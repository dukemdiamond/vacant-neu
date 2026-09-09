"use client";

import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import { useRef } from "react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  resultCount: number | null;
  placeholder?: string;
  /** Overrides the visually hidden label when the field filters rather than searches. */
  label?: string;
}

/**
 * The primary interaction on the page.
 *
 * Results update as you type, so there is no submit button to press and no spinner to wait on.
 * The live region announces the result count for screen readers, which otherwise get no signal
 * that the list below has changed.
 */
export function SearchField({
  value,
  onChange,
  disabled = false,
  resultCount,
  placeholder = "Try Snell Library, Ryder 155, or CS2500",
  label = "Search for a classroom by building or room number",
}: Props) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <div className="w-full">
      <label htmlFor="room-search" className="sr-only">
        {label}
      </label>

      <div
        className={[
          "flex items-center gap-3 rounded-[var(--radius-control)] border bg-surface-raised",
          "border-line px-4 py-3.5 transition-shadow duration-200",
          "focus-within:shadow-[var(--shadow-focus)]",
          disabled && "opacity-60",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <MagnifyingGlassIcon
          size={20}
          weight="regular"
          aria-hidden
          className="shrink-0 text-ink-faint"
        />
        <input
          id="room-search"
          data-focus-parent
          ref={input}
          type="search"
          inputMode="search"
          autoComplete="off"
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={[
            "w-full bg-transparent text-base text-ink outline-none",
            "placeholder:text-ink-muted",
            // Safari renders a native clear affordance on type=search that fights our own.
            "[&::-webkit-search-cancel-button]:appearance-none",
          ].join(" ")}
        />
        {value.length > 0 && (
          <button
            type="button"
            onClick={() => {
              onChange("");
              input.current?.focus();
            }}
            className="shrink-0 rounded-full p-1 text-ink-faint transition-colors hover:bg-wash hover:text-ink active:opacity-80"
            aria-label="Clear search"
          >
            <XIcon size={16} weight="bold" aria-hidden />
          </button>
        )}
      </div>

      <p aria-live="polite" className="sr-only">
        {resultCount === null ? "" : `${resultCount} ${resultCount === 1 ? "room" : "rooms"} found`}
      </p>
    </div>
  );
}
