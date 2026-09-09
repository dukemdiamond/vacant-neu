/**
 * Captures the link-preview image from the running app.
 *
 * A screenshot of the real home page rather than a composed graphic: the preview then shows what
 * someone actually lands on, and it cannot fall out of date with the design without this being
 * re-run. Dark mode, because that is what the app looks like on a phone in the evening, which is
 * when a link like this gets shared.
 *
 * Usage:  node tools/og/capture.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const BASE = process.argv[2] ?? "http://localhost:3000";
const APP = join(here, "../../apps/web/app");

/** The size every platform expects for a large summary card. */
const SIZE = { width: 1200, height: 630 };
/** A Wednesday mid-morning in term, so the room counts read as a live product. */
const WHEN = new Date("2026-09-16T14:30:00Z");

const browser = await chromium.launch({ channel: "chromium" });
const page = await browser.newPage({
  viewport: SIZE,
  colorScheme: "dark",
  // Rendered at 2x so the type stays crisp after a platform rescales it.
  deviceScaleFactor: 2,
});
await page.clock.setFixedTime(WHEN);
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3500);

// The dev overlay is not part of the product.
await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
await page.waitForTimeout(300);

for (const name of ["opengraph-image.png", "twitter-image.png"]) {
  await page.screenshot({ path: join(APP, name) });
  console.log(`wrote apps/web/app/${name}`);
}

await browser.close();
