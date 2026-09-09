"use client";

import { useEffect, useState } from "react";
import { useNow } from "@/lib/clock";

const CAMPUS_TIME = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * Campus-local clock in the masthead.
 *
 * Every answer this app gives is relative to a moment, so the moment is worth stating. It also
 * makes the page visibly live: the minute ticking over is the signal that what you are reading
 * is current rather than a cached snapshot.
 *
 * Rendered only after mount. The server has no way to know the visitor's clock, so emitting a
 * time during prerender would guarantee a hydration mismatch.
 */
export function LiveClock() {
  const [mounted, setMounted] = useState(false);
  const now = useNow();

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <time
      dateTime={now.toISOString()}
      /*
       * Hidden below the small breakpoint. The nav cannot fit a wordmark, a clock and three links
       * on a 360px phone, and the clock is the one element the device already provides in its own
       * status bar, so it is the one to drop rather than a navigation link.
       */
      className="tabular hidden text-sm whitespace-nowrap text-ink-muted sm:inline"
      title="Current time on the Boston campus"
    >
      {CAMPUS_TIME.format(now)}
      <span className="hidden sm:inline"> ET</span>
    </time>
  );
}
