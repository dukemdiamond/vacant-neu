"use client";

export interface Segment<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  label: string;
  value: T;
  segments: readonly Segment<T>[];
  onChange: (value: T) => void;
}

/**
 * A single-choice control rendered as adjacent buttons.
 *
 * Uses `aria-pressed` rather than radio semantics because each option applies immediately rather
 * than staging a form submission. The active segment takes the primary dark treatment so the
 * current filter is legible without relying on a colour cue.
 */
export function SegmentedControl<T extends string>({ label, value, segments, onChange }: Props<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex gap-0.5 rounded-[var(--radius-control)] border border-line bg-surface-raised p-0.5"
    >
      {segments.map((segment) => {
        const active = segment.value === value;
        return (
          <button
            key={segment.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(segment.value)}
            className={[
              "rounded-[4px] px-3 py-1.5 text-sm whitespace-nowrap transition-colors active:opacity-80",
              active
                ? "bg-ink text-ink-inverse shadow-[var(--shadow-inset)]"
                : "text-ink-muted hover:bg-wash hover:text-ink",
            ].join(" ")}
          >
            {segment.label}
          </button>
        );
      })}
    </div>
  );
}
