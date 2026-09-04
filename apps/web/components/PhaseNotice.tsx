import { InfoIcon } from "@phosphor-icons/react";
import { formatDay, type TermPhase } from "@/lib/term";

/**
 * Says out loud when Banner's class schedule is not what is happening on campus.
 *
 * These are the days the app would otherwise be confidently wrong, reporting an empty schedule as
 * universal vacancy, so each one gets named. On Browse the phase follows whichever instant is
 * being inspected, which is how someone checking a date in December learns it is exam week.
 */
export function PhaseNotice({
  phase,
  viewingOtherDay = false,
}: {
  phase: TermPhase;
  viewingOtherDay?: boolean;
}) {
  const message = noticeFor(phase, viewingOtherDay);
  if (!message) return null;

  return (
    <div className="mb-8 flex gap-3 rounded-[var(--radius-card)] border border-line bg-wash-faint p-4">
      <InfoIcon size={18} weight="regular" aria-hidden className="mt-0.5 shrink-0 text-accent" />
      <p className="max-w-2xl text-sm text-ink-body">{message}</p>
    </div>
  );
}

function noticeFor(phase: TermPhase, other: boolean): string | null {
  const rooms = other ? "every room below reads as open" : "every room below reads as open";
  switch (phase.kind) {
    case "before-term":
      return `Fall classes begin ${formatDay(phase.firstDay)}. Nothing is scheduled before then, so ${rooms}.`;
    case "after-term":
      return `The term has ended by ${other ? "that date" : "now"}, so no classes are scheduled and ${rooms}.`;
    case "holiday":
      return other
        ? "No classes are scheduled that day, so every room reads as open. Buildings may still be closed."
        : "No classes are scheduled today, so every room reads as open. Buildings may still be closed.";
    case "exams":
      return `${other ? "That date falls in" : "It is"} the final exam period. Exams follow a separate schedule that Banner does not publish, so a room shown as open may still be in use.`;
    case "in-session":
      return null;
  }
}
