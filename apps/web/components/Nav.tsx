import Link from "next/link";
import { LiveClock } from "@/components/LiveClock";

/**
 * Single-line navigation.
 *
 * Full-bleed rather than constrained to the content column, so the wordmark sits near the
 * viewport edge and reads as a masthead rather than as the first item of the page body.
 */
export function Nav() {
  return (
    <header className="border-b border-line">
      <nav className="flex h-16 items-center justify-between px-4 sm:h-20 sm:px-6">
        <Link
          href="/"
          className="display-lg text-xl font-semibold tracking-tight text-ink transition-opacity hover:opacity-80 sm:text-3xl"
        >
          <span className="text-accent">vacant</span>NEU
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <LiveClock />
          <div className="flex items-center gap-1">
            <NavLink href="/browse">Browse</NavLink>
            <NavLink href="/events">Events</NavLink>
            <NavLink href="/map">Map</NavLink>
          </div>
        </div>
      </nav>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-[var(--radius-control)] px-2 py-2 text-sm whitespace-nowrap text-ink-body transition-colors hover:bg-wash hover:text-ink sm:px-3 sm:text-base"
    >
      {children}
    </Link>
  );
}
