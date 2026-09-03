/**
 * Loading placeholders shaped like the content they replace, so the layout does not shift when
 * the schedule arrives.
 */
export function ResultsSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="rounded-[var(--radius-card)] border border-line bg-surface-raised p-5"
        >
          <div className="h-5 w-56 rounded bg-wash" />
          <div className="mt-3 h-4 w-40 rounded bg-wash-faint" />
        </div>
      ))}
    </div>
  );
}
