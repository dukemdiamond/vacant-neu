/**
 * Client for Northeastern's Engage (CampusGroups) event list.
 *
 * This is an internal `mobile_ws` endpoint, not a documented API, so it is treated as hostile
 * input: every response is parsed defensively and validated before use.
 *
 * Two things about it are worth knowing. It answers anonymous requests, but redacts the venue of
 * most events to "Private Location (sign in to display)" unless the request carries a logged-in
 * CampusGroups session. And it returns JSON under a `text/html` content type, so the header
 * cannot be used to tell a data response from a login page.
 */
import { setTimeout as sleep } from "node:timers/promises";
import { engageResponse, type EngageRecord } from "./engage-schema.js";

const ENDPOINT = "https://engage.northeastern.edu/mobile_ws/v17/mobile_events_list";

/** Records per request. 200 is verified; the documented 40 is unnecessarily slow. */
const PAGE_SIZE = 200;

const REQUEST_DELAY_MS = 400;

const USER_AGENT =
  "vacantNEU/0.1 (Northeastern classroom availability; +https://github.com/vacantneu)";

export class EngageSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngageSessionError";
  }
}

/**
 * Session cookies for an authenticated pull.
 *
 * These are CampusGroups' own session, not Northeastern SSO, so the two values can be lifted from
 * a browser and replayed without touching a login form or MFA. They expire on no published
 * schedule and are treated as a credential: read from the environment, never committed.
 */
export function cookieHeaderFromEnv(): string | null {
  const raw = process.env.ENGAGE_COOKIE?.trim();
  if (raw) return raw;

  const session = process.env.ENGAGE_SESSION_ID?.trim();
  const uid = process.env.ENGAGE_UID?.trim();
  if (!session || !uid) return null;

  /*
   * Sent verbatim, not decoded.
   *
   * The session value contains percent sequences (%2b, %3d) and CampusGroups expects them exactly
   * as the browser stores them. Decoding to "+" and "=" first produces a token the server does not
   * recognise: it silently mints a fresh anonymous session instead of rejecting the request, so
   * the pull succeeds while every venue stays redacted. Copy the value straight out of DevTools.
   */
  return `CG.SessionID=${session}; cg_uid=${uid}`;
}

async function fetchPage(range: number, cookie: string | null): Promise<EngageRecord[]> {
  const query = new URLSearchParams({
    range: String(range),
    limit: String(PAGE_SIZE),
    filter4_contains: "OR",
    filter4_notcontains: "OR",
    order: "undefined",
    search_word: "",
    _: String(Date.now()),
  });

  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: "application/json, text/plain, */*",
  };
  if (cookie) headers["Cookie"] = cookie;

  const response = await fetch(`${ENDPOINT}?${query}`, { headers });
  if (!response.ok) {
    throw new Error(`Engage returned ${response.status} ${response.statusText}`);
  }

  /*
   * Expiry detection.
   *
   * A rejected session is not an error here: the endpoint quietly mints a fresh anonymous session
   * and serves a 200 with every venue redacted, so the run looks like a success that found almost
   * nothing. A session it accepts is left alone and no CG.SessionID comes back. So a Set-Cookie
   * for that name, on a request that carried one, means ours was refused.
   */
  if (cookie && response.headers.getSetCookie().some((c) => c.startsWith("CG.SessionID="))) {
    throw new EngageSessionError(
      "Engage replaced the session cookie, which means the one supplied was rejected. It has " +
        "either expired or was altered in transit. Refresh ENGAGE_SESSION_ID and ENGAGE_UID, " +
        "copying the values verbatim from DevTools without decoding them.",
    );
  }

  const text = await response.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    // A dead session answers with a login page rather than an auth error.
    throw new EngageSessionError(
      `Engage returned HTML instead of JSON, which usually means the session cookie has expired. ` +
        `Refresh ENGAGE_SESSION_ID and ENGAGE_UID. Response began: ${text.slice(0, 120)}`,
    );
  }

  return engageResponse.parse(json);
}

export interface EngagePull {
  events: Record<string, string | null>[];
  /** Total records the endpoint claims, events and date separators together. */
  counter: number;
  authenticated: boolean;
}

/**
 * Fetches every upcoming event.
 *
 * The endpoint reports its own total in each record's `counter`, which grows through the
 * semester, so pagination reads it rather than assuming a fixed size.
 */
export async function fetchEvents(
  onProgress?: (got: number, total: number) => void,
): Promise<EngagePull> {
  const cookie = cookieHeaderFromEnv();
  const events: Record<string, string | null>[] = [];
  let range = 0;
  let counter = Infinity;

  while (range < counter) {
    const records = await fetchPage(range, cookie);
    if (records.length === 0) break;

    if (counter === Infinity) {
      counter = Number(records[0]?.counter ?? 0) || records.length;
    }

    for (const record of records) {
      // Date separators mark a new day in the list and carry no event data.
      if (record.listingSeparator === "true") continue;
      events.push(decodeRecord(record));
    }
    onProgress?.(events.length, counter);

    range += PAGE_SIZE;
    if (range < counter) await sleep(REQUEST_DELAY_MS);
  }

  return { events, counter: counter === Infinity ? 0 : counter, authenticated: cookie !== null };
}

/**
 * Turns a positional record into a plain object.
 *
 * Each record carries a comma-separated `fields` list naming what `p0`, `p1` and so on hold, so
 * values are read by name. Reading by fixed index would silently mis-map every field the day
 * Engage inserts a column.
 */
export function decodeRecord(record: EngageRecord): Record<string, string | null> {
  const names = record.fields.split(",");
  const out: Record<string, string | null> = {};
  names.forEach((name, i) => {
    const key = name.trim();
    if (!key) return;
    const value = (record as Record<string, unknown>)[`p${i}`];
    out[key] = typeof value === "string" ? value : value === null ? null : String(value ?? "");
  });
  return out;
}
