import type { Metadata, Viewport } from "next";
import { Instrument_Sans } from "next/font/google";
import { Analytics } from "@/components/Analytics";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import "./globals.css";

/**
 * The design system specifies Camera Plain Variable, which is proprietary. Instrument Sans is the
 * closest freely licensable substitute: humanist rather than geometric, with the same slightly
 * soft terminals, and variable so the 400/600 split in the type scale holds.
 */
const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Find a free classroom at Northeastern | vacantNEU",
  description:
    "Search Northeastern's Boston campus for classrooms with no class scheduled right now.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f4ed" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1815" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={instrumentSans.variable}>
      {/*
        Column layout so the footer is pushed to the bottom on short pages and the map route can
        claim the remaining height with `h-full` rather than hard-coding a viewport calculation.
      */}
      <body className="flex min-h-[100dvh] flex-col bg-surface">
        <Nav />
        {/*
          A plain block, not a flex container. As a flex item of the body it stretches to full
          width, but inside it the page is normal flow, so `mx-auto max-w-*` on a <main> resolves
          against the viewport. Making this a flex column instead causes `mx-auto` to override
          align-items: stretch, and every page silently shrinks to fit its own content.
        */}
        <div className="flex-1">{children}</div>
        <Footer />
        <Analytics />
      </body>
    </html>
  );
}
