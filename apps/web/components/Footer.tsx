import Link from "next/link";

/**
 * Site footer.
 *
 * Full-bleed to match the masthead: attribution against the left edge, legal links against the
 * right, so the page is bracketed by the same margins top and bottom.
 */
export function Footer() {
  return (
    <footer className="mt-auto border-t border-line">
      {/*
        One row that wraps, rather than a column that always stacks. Stacked, this was 101px of a
        844px phone screen, which is a lot of the viewport to spend on a byline.
      */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-xs text-ink-muted sm:px-6 sm:py-5 sm:text-sm">
        <p>2026 Duke Diamond</p>
        <nav className="flex items-center gap-4 sm:gap-5" aria-label="Legal">
          {/* Abbreviated on narrow screens so the whole footer stays one line. */}
          <FooterLink href="/terms">
            <span className="sm:hidden">Terms</span>
            <span className="hidden sm:inline">Terms and Conditions</span>
          </FooterLink>
          <FooterLink href="/privacy">
            <span className="sm:hidden">Privacy</span>
            <span className="hidden sm:inline">Privacy Policy</span>
          </FooterLink>
        </nav>
      </div>
    </footer>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="transition-colors hover:text-ink">
      {children}
    </Link>
  );
}
