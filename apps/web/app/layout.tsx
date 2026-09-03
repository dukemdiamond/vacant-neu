import type { Metadata, Viewport } from "next";
import { Instrument_Sans } from "next/font/google";
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
      <body className="min-h-[100dvh] bg-surface">
        <Nav />
        {children}
      </body>
    </html>
  );
}
