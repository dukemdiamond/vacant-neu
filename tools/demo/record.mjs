/**
 * Records a demo of the running app.
 *
 * Drives the real product rather than reconstructing it, so the film cannot drift from what the
 * app actually does. Playwright captures the browser; the overlay adds a visible cursor and
 * captions, because a recording with an invisible pointer is hard to follow.
 *
 * Usage:  node tools/demo/record.mjs [baseUrl] [outDir]
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync, renameSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const BASE = process.argv[2] ?? "http://localhost:3000";
const OUT = process.argv[3] ?? join(here, "../../demo");
const OVERLAY = readFileSync(join(here, "overlay.js"), "utf8");

const SIZE = { width: 1280, height: 720 };
/** Wednesday mid-morning during term, when the schedule has something to show. */
const WHEN = new Date("2026-09-16T14:30:00Z");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  mkdirSync(OUT, { recursive: true });

  // The full browser, not the headless shell: video capture is unsupported in the shell build.
  const browser = await chromium.launch({ channel: "chromium" });
  const context = await browser.newContext({
    viewport: SIZE,
    recordVideo: { dir: OUT, size: SIZE },
    colorScheme: "light",
    deviceScaleFactor: 1,
  });
  // Re-injected on every navigation, so captions survive moving between pages.
  await context.addInitScript(OVERLAY);

  const page = await context.newPage();
  await page.clock.setFixedTime(WHEN);

  const demo = {
    say: (t) => page.evaluate((x) => window.__demo.say(x), t),
    card: (html) => page.evaluate((h) => window.__demo.showCard(h), html),
    hideCard: () => page.evaluate(() => window.__demo.hideCard()),
    hideCursor: (v) => page.evaluate((x) => window.__demo.hideCursor(x), v),
  };

  /** Moves the real pointer and the drawn one together, so clicks land where the arrow is. */
  async function pointTo(locator) {
    const box = await locator.boundingBox();
    if (!box) throw new Error("target has no box");
    const x = Math.round(box.x + box.width / 2);
    const y = Math.round(box.y + box.height / 2);
    await page.evaluate(([px, py]) => window.__demo.move(px, py), [x, y]);
    await page.mouse.move(x, y, { steps: 12 });
    await wait(560);
    return { x, y };
  }

  async function click(locator) {
    await pointTo(locator);
    await page.evaluate(() => window.__demo.tap());
    await wait(140);
    await locator.click();
  }

  async function type(selector, text) {
    await click(page.locator(selector));
    for (const ch of text) {
      await page.keyboard.type(ch);
      await wait(52);
    }
  }

  const go = async (path) => {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1600);
  };

  // ---------------------------------------------------------------- open
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await demo.hideCursor(true);
  await demo.card(
    `<div class="wordmark"><em>vacant</em>NEU</div>
     <div class="sub">Find a free classroom at Northeastern</div>`,
  );
  // The card covers the first paint, so the film opens on the title rather than on a loading page.
  await page.waitForTimeout(2000);
  await wait(2200);
  await demo.hideCard();
  await wait(900);
  await demo.hideCursor(false);

  // ---------------------------------------------------------------- search
  await demo.say("Search any classroom");
  await type("#room-search", "Snell Library");
  await wait(1900);

  await demo.say("Open now, and for how long");
  await wait(2100);

  // ---------------------------------------------------------------- day schedule
  await demo.say("The whole day, at a glance");
  await click(page.locator("main article button[aria-label^='Full day schedule']").first());
  await page.waitForTimeout(1400);
  await wait(2600);
  await page.keyboard.press("Escape");
  await wait(900);

  // ---------------------------------------------------------------- campuses
  await demo.say("Eleven campuses");
  await page.locator("#room-search").fill("");
  await wait(700);
  await click(page.getByRole("button", { name: /^New York/ }));
  await wait(2200);
  await click(page.getByRole("button", { name: /^Boston/ }));
  await wait(1400);

  // ---------------------------------------------------------------- browse
  await go("/browse");
  await demo.say("Filter by how long you need it");
  await wait(1200);
  await click(page.getByRole("button", { name: "2 hours", exact: true }));
  await wait(2300);

  await demo.say("Or check any date and time");
  await click(page.locator("#browse-time"));
  await page.locator("#browse-time").fill("19:30");
  await wait(2400);

  // ---------------------------------------------------------------- events
  await go("/events");
  await demo.say("Club events, straight from Engage");
  await wait(3000);
  await demo.say("Search by club");
  await type("#event-search", "smash");
  await wait(2300);

  // ---------------------------------------------------------------- map
  await go("/map");
  await page.waitForTimeout(5200);
  await demo.say("Or find it on the campus map");
  await wait(2400);
  await click(page.getByRole("button", { name: /^Snell Library/ }).first());
  await wait(3000);

  // ---------------------------------------------------------------- close
  await demo.say(null);
  await demo.hideCursor(true);
  await demo.card(
    `<div class="wordmark"><em>vacant</em>NEU</div>
     <div class="sub">Classes from Banner. Events from Engage.</div>
     <div class="url">vacantneu.vercel.app</div>`,
  );
  await wait(3000);

  await page.close();
  await context.close();
  await browser.close();

  const file = readdirSync(OUT).filter((f) => f.endsWith(".webm")).sort().pop();
  if (file) {
    renameSync(join(OUT, file), join(OUT, "vacantneu-demo.webm"));
    console.log(`recorded ${join(OUT, "vacantneu-demo.webm")}`);
  }
}

main().catch((error) => {
  console.error("demo recording failed:", error);
  process.exit(1);
});
