"use client";

import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react";
import { campusDateISO, campusTimeHHMM } from "@vacantneu/core";

export interface Moment {
  date: string;
  time: string;
}

interface Props {
  /** null means follow the live clock. */
  value: Moment | null;
  onChange: (value: Moment | null) => void;
  /** The live clock, used to prefill the inputs while following it. */
  now: Date;
}

const FIELD =
  "rounded-[var(--radius-control)] border border-line bg-surface-raised px-2.5 py-1.5 text-sm text-ink " +
  "tabular focus-within:shadow-[var(--shadow-focus)] [color-scheme:light] dark:[color-scheme:dark]";

/**
 * Inspect the schedule at any date and time rather than only at this moment.
 *
 * While following the live clock the inputs show the current campus date and time, so editing
 * either starts from where you already are instead of from an empty field. The values are read as
 * campus-local: someone checking from another timezone gets the schedule Boston is on, not their
 * own, which is the whole point of the control.
 */
export function TimeTravel({ value, onChange, now }: Props) {
  const live = value === null;
  const date = value?.date ?? campusDateISO(now);
  const time = value?.time ?? campusTimeHHMM(now);

  const update = (next: Partial<Moment>) => onChange({ date, time, ...next });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-sm text-ink-muted" htmlFor="browse-date">
        At
      </label>
      <input
        id="browse-date"
        type="date"
        value={date}
        onChange={(e) => update({ date: e.target.value })}
        className={FIELD}
      />
      <label className="sr-only" htmlFor="browse-time">
        Time of day on the Boston campus
      </label>
      <input
        id="browse-time"
        type="time"
        value={time}
        onChange={(e) => update({ time: e.target.value })}
        className={FIELD}
      />
      {live ? (
        <span className="text-sm text-ink-faint">now</span>
      ) : (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] px-2 py-1.5 text-sm text-ink-body transition-colors hover:bg-wash hover:text-ink"
        >
          <ArrowCounterClockwiseIcon size={13} weight="bold" aria-hidden />
          Now
        </button>
      )}
    </div>
  );
}
