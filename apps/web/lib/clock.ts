"use client";

import { useEffect, useState } from "react";

/**
 * A clock that re-renders on the minute boundary.
 *
 * Vacancy is a function of the current minute, so a page left open would otherwise drift out of
 * date. Ticking on the boundary rather than every 60 seconds keeps countdowns honest: a page
 * opened at 10:29:58 updates two seconds later, not a minute later.
 */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const msToNextMinute = 60_000 - (Date.now() % 60_000);
      timer = setTimeout(() => {
        setNow(new Date());
        schedule();
      }, msToNextMinute + 50);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);

  return now;
}
