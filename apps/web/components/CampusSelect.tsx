"use client";

import type { Campus } from "@vacantneu/core";

/**
 * Campus chooser as a native select.
 *
 * Browse already carries a search field, an availability control and a date and time, so a row of
 * pills would be one control too many. A select collapses eleven options into the width of the
 * longest one and gets the platform's own picker on a phone.
 */
export function CampusSelect({
  campuses,
  value,
  onChange,
}: {
  campuses: Campus[];
  value: string;
  onChange: (code: string) => void;
}) {
  if (campuses.length < 2) return null;

  return (
    <label className="flex items-center gap-2 text-sm text-ink-muted">
      Campus
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-[var(--radius-control)] border border-line bg-surface-raised px-2.5 py-1.5 text-sm text-ink focus-visible:shadow-[var(--shadow-focus)]"
      >
        {campuses.map((campus) => (
          <option key={campus.code} value={campus.code}>
            {campus.name} ({campus.roomCount})
          </option>
        ))}
      </select>
    </label>
  );
}
