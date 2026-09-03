import Link from "next/link";

/**
 * Single-line navigation, 64px tall.
 *
 * The wordmark carries the one piece of brand colour that appears on every page, matching the
 * accent in the headline so the two read as the same system.
 */
export function Nav() {
  return (
    <header className="border-b border-line">
      <nav className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5 sm:px-8">
        <Link
          href="/"
          className="text-base tracking-tight text-ink transition-opacity hover:opacity-80"
        >
          <span className="text-accent">vacant</span>NEU
        </Link>
        <div className="flex items-center gap-1">
          <NavLink href="/browse">Browse</NavLink>
          <NavLink href="/map">Map</NavLink>
        </div>
      </nav>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-[var(--radius-control)] px-3 py-2 text-sm text-ink-body transition-colors hover:bg-wash hover:text-ink"
    >
      {children}
    </Link>
  );
}
