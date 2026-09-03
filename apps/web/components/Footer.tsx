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
      <div className="flex flex-col gap-3 px-4 py-6 text-sm text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>2026 Duke Diamond</p>
        <nav className="flex items-center gap-5" aria-label="Legal">
          <FooterLink href="/terms">Terms and Conditions</FooterLink>
          <FooterLink href="/privacy">Privacy Policy</FooterLink>
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
