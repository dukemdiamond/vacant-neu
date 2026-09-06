/**
 * Resolves an Engage venue string to a room in our inventory.
 *
 * Engage locations are free text typed by whoever created the event, so the same room appears as
 * "West Village H Room 110", "West Village H 110", and "WVH 110". The job here is to recognise
 * those as one room without ever inventing one: a match is only returned when the resulting id
 * exists in the artifact, because claiming a room is occupied on the strength of a guess is worse
 * than admitting we could not tell.
 */

/** Venue strings that are explicitly not a location. Matched case-insensitively. */
const NON_LOCATIONS = [
  "tbd",
  "tba",
  "n/a",
  "none",
  "online event",
  "online",
  "virtual",
  "zoom",
  "off campus",
  "off-campus",
];

/** Engage redacts most venues unless the request is authenticated. */
export function isRedacted(location: string): boolean {
  return /private location/i.test(location);
}

export function isNonLocation(location: string): boolean {
  const clean = location.trim().toLowerCase();
  return clean.length === 0 || NON_LOCATIONS.includes(clean);
}

/**
 * Building spellings Engage uses that do not appear in Banner's own building descriptions.
 *
 * Keys are matched against the venue text after normalisation; values are Banner building codes.
 * Ordered longest-first at match time so "west village h" wins over a bare "west village".
 */
const BUILDING_ALIASES: Record<string, string> = {
  "west village a": "WVA",
  "west village c": "WVC",
  "west village f": "WVF",
  "west village g": "WVG",
  "west village h": "WVH",
  wvh: "WVH",
  wvg: "WVG",
  wvf: "WVF",
  wvc: "WVC",
  "east village": "EV",
  ev: "EV",
  hastings: "HS",
  "hastings hall": "HS",
  "hastings suite": "HS",
  dodge: "DG",
  "dodge hall": "DG",
  robinson: "RB",
  "robinson hall": "RB",
  richards: "RI",
  "richards hall": "RI",
  ryder: "RY",
  "ryder hall": "RY",
  shillman: "SH",
  "shillman hall": "SH",
  snell: "SL",
  "snell library": "SL",
  "snell engineering": "SN",
  "snell engineering center": "SN",
  kariotis: "KA",
  "kariotis hall": "KA",
  hayden: "HA",
  "hayden hall": "HA",
  churchill: "CH",
  "churchill hall": "CH",
  forsyth: "FR",
  "forsyth building": "FR",
  cahners: "CA",
  "cahners hall": "CA",
  behrakis: "BK",
  "behrakis health science center": "BK",
  "behrakis health sciences center": "BK",
  dockser: "DK",
  "dockser hall": "DK",
  cargill: "CG",
  "cargill hall": "CG",
  knowles: "KN",
  "knowles center": "KN",
  holmes: "HO",
  "holmes hall": "HO",
  hurtig: "HT",
  "hurtig hall": "HT",
  lake: "LA",
  "lake hall": "LA",
  meserve: "ME",
  "meserve hall": "ME",
  nightingale: "NI",
  "nightingale hall": "NI",
  mugar: "MU",
  "mugar life sciences": "MU",
  "dana research center": "DA",
  dana: "DA",
  cullinane: "CN",
  "cullinane hall": "CN",
  ell: "EL",
  "ell hall": "EL",
  stearns: "ST",
  "stearns center": "ST",
  "stetson east": "SE",
  "international village": "INV",
  invillage: "INV",
  isec: "ISEC",
  "interdisciplinary science and engineering complex": "ISEC",
  "science and engineering complex": "ISEC",
  exp: "EXP",
  "fenway center": "FC",
  "271 huntington": "271",
};

/** Collapses punctuation and spacing so spellings compare equal. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/&[a-z]+;/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export interface LocationMatch {
  roomId: string;
  building: string;
  room: string;
}

export interface Matcher {
  match(location: string): LocationMatch | null;
}

/**
 * Builds a matcher over a known room inventory.
 *
 * `rooms` is the set of ids the artifact actually contains, and `buildings` supplies Banner's own
 * names so "Snell Library 002" resolves without needing an alias entry for every building.
 */
export function createMatcher(
  rooms: Iterable<string>,
  buildings: { code: string; name: string }[],
): Matcher {
  const known = new Set(rooms);

  // Alias table plus every building's own code and name, longest key first so the most specific
  // spelling wins ("west village h" before "west village").
  const aliases = new Map<string, string>();
  for (const [key, code] of Object.entries(BUILDING_ALIASES)) aliases.set(normalize(key), code);
  for (const b of buildings) {
    aliases.set(normalize(b.name), b.code);
    aliases.set(normalize(b.code), b.code);
  }
  const keys = [...aliases.keys()].sort((a, b) => b.length - a.length);

  return {
    match(location: string): LocationMatch | null {
      if (isRedacted(location) || isNonLocation(location)) return null;
      const text = normalize(location);
      if (!text) return null;

      for (const key of keys) {
        // Whole-word containment, so "ev" does not match inside "event" or "seven".
        const at = new RegExp(`(?:^| )${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?: |$)`).exec(
          text,
        );
        if (!at) continue;
        const code = aliases.get(key)!;

        // Room tokens are looked for after the building name, then anywhere, because Engage writes
        // both "Robinson Hall 409" and "409 Robinson".
        const after = text.slice(at.index + at[0].length);
        for (const scope of [after, text]) {
          for (const token of scope.match(/\b\d{1,4}[a-z]?\b/g) ?? []) {
            for (const candidate of roomSpellings(token)) {
              const id = `${code}-${candidate}`;
              if (known.has(id)) return { roomId: id, building: code, room: candidate };
            }
          }
        }
        // The building was recognised but no room in it was, e.g. "Behrakis 4th floor labs".
        return null;
      }
      return null;
    },
  };
}

/**
 * Room numbers Banner might be using for a token Engage wrote.
 *
 * Banner pads some rooms ("070") and not others ("110"), and event organisers type whichever they
 * remember, so both spellings are tried before giving up.
 */
function roomSpellings(token: string): string[] {
  const upper = token.toUpperCase();
  const bare = upper.replace(/^0+/, "");
  const out = new Set([upper, bare, bare.padStart(3, "0"), bare.padStart(2, "0")]);
  return [...out].filter(Boolean);
}
