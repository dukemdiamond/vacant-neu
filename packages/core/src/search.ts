/**
 * Matching a search query against the classes and events booked in rooms.
 *
 * The question a class search asks is "where does this class meet?", so a room counts only when
 * one booking in it answers the whole query. Pooling every title in a room into one bag of words
 * gets this wrong in a way that looks like noise: "computer systems" then finds a room holding
 * "Computer Networks" at 11 and "Healthcare System" at 2, neither of which was asked for.
 *
 * Course codes are matched exactly, never fuzzily. CS3650 and CS6650 are one edit apart and
 * entirely different courses, so typo tolerance that suits a building name is wrong here.
 */
import type { Meeting } from "./types.js";

/** Words a query can leave out without changing what it asks for. */
const STOP_WORDS = new Set(["a", "an", "and", "for", "in", "of", "on", "the", "to", "with"]);

/** How well a booking answers a query. Higher is better; 0 is no match. */
export const MatchScore = {
  None: 0,
  /** Every query word appears in the booking's title or code. */
  Words: 1,
  /** The query appears in the title as a phrase, in order. */
  Phrase: 2,
  /** The query is the whole title, as with "computer systems" for Computer Systems. */
  Title: 3,
  /** The query names the course code exactly. */
  Code: 4,
} as const;

/** Lowercase, accents folded, punctuation as spaces. "Intro & Ethics" -> "intro and ethics". */
export function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Folds a plural onto its singular, so "systems" and "system" meet. Applied to both sides. */
function stem(word: string): string {
  return word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word;
}

const CODE = /^([a-z]{2,5})(\d{1,4}[a-z]?)$/;

/** What a booking is searched by, computed once per distinct booking. */
interface BookingKey {
  /** "cs3650" for a class; null for an event, whose label is a name rather than a code. */
  code: string | null;
  subject: string | null;
  number: string | null;
  /** Normalized words of the title (and an event's name), in order. */
  words: string[];
  stems: Set<string>;
  /** The title, normalized and space-padded, for phrase matching. */
  phraseText: string;
}

function keyFor(meeting: Pick<Meeting, "kind" | "label" | "detail">): BookingKey {
  const compact = normalize(meeting.label).replace(/ /g, "");
  const code = meeting.kind === "class" ? CODE.exec(compact) : null;
  const titleText =
    meeting.kind === "class"
      ? normalize(meeting.detail)
      : normalize(`${meeting.label} ${meeting.detail}`);
  const words = titleText ? titleText.split(" ") : [];
  return {
    code: code ? compact : null,
    subject: code ? code[1]! : null,
    number: code ? code[2]! : null,
    words,
    stems: new Set(words.map(stem)),
    phraseText: ` ${titleText} `,
  };
}

interface Token {
  text: string;
  /** Only the word still being typed may match as a prefix. */
  last: boolean;
}

/**
 * A query, parsed once and reusable against any number of bookings.
 *
 * Two readings of the query are tried. "cs 3650" is most likely a course code with a space in it,
 * but "week 3" in an event name is two words, so both the joined and the literal reading count.
 */
export interface BookingQuery {
  match(meeting: Pick<Meeting, "kind" | "label" | "detail">): number;
}

function tokenize(words: string[]): Token[] {
  return words.map((text, i) => ({ text, last: i === words.length - 1 }));
}

/** Joins a subject followed by a number ("cs", "3650") into one code token ("cs3650"). */
function joinCodes(words: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!;
    const next = words[i + 1];
    if (next !== undefined && /^[a-z]{2,5}$/.test(word) && /^\d{1,4}[a-z]?$/.test(next)) {
      out.push(word + next);
      i++;
    } else {
      out.push(word);
    }
  }
  return out;
}

function tokenMatches(token: Token, key: BookingKey): boolean {
  const t = token.text;

  if (CODE.test(t)) {
    // A full code matches exactly; a partial one ("cs36") is a code still being typed.
    return key.code !== null && (key.code === t || (token.last && key.code.startsWith(t)));
  }
  if (/^\d+[a-z]?$/.test(t)) {
    if (key.number !== null && (key.number === t || (token.last && key.number.startsWith(t)))) {
      return true;
    }
    return key.words.includes(t);
  }
  // A bare subject finds its courses: "cs" means Computer Science, never CHEM or CRIM.
  if (key.subject === t) return true;
  if (key.stems.has(stem(t))) return true;
  return token.last && t.length >= 3 && key.words.some((w) => w.startsWith(t));
}

function scoreReading(tokens: Token[], key: BookingKey, phrase: string): number {
  if (tokens.length === 0) return MatchScore.None;
  if (!tokens.every((token) => tokenMatches(token, key))) return MatchScore.None;
  if (key.code !== null && tokens.length === 1 && tokens[0]!.text === key.code) {
    return MatchScore.Code;
  }
  if (key.phraseText === ` ${phrase} `) return MatchScore.Title;
  // The last word may be half typed, so the phrase is matched as a prefix at its end.
  if (phrase.includes(" ") && key.phraseText.includes(` ${phrase}`)) return MatchScore.Phrase;
  return MatchScore.Words;
}

/** Parses a query for booking search, or returns null when it has nothing to match on. */
export function parseBookingQuery(query: string): BookingQuery | null {
  const phrase = normalize(query);
  if (!phrase) return null;

  const all = phrase.split(" ");
  const meaningful = all.filter((w) => !STOP_WORDS.has(w));
  // A query made only of stop words ("the") still means something literal.
  const words = meaningful.length > 0 ? meaningful : all;

  const readings = [tokenize(joinCodes(words))];
  const literal = tokenize(words);
  if (literal.length !== readings[0]!.length) readings.push(literal);

  const cache = new Map<string, BookingKey>();
  return {
    match(meeting) {
      const id = `${meeting.kind}\u0000${meeting.label}\u0000${meeting.detail}`;
      let key = cache.get(id);
      if (!key) {
        key = keyFor(meeting);
        cache.set(id, key);
      }
      return Math.max(...readings.map((tokens) => scoreReading(tokens, key, phrase)));
    },
  };
}

/** The bookings in one room that answered a query. */
export interface BookingMatch {
  /** The best score among the matched bookings. */
  score: number;
  /** True when at least one matched booking recurs, rather than meeting on a single date. */
  recurring: boolean;
  /** The matched bookings, deduplicated, regular meetings first then by date and time. */
  meetings: Meeting[];
}

/**
 * Finds the rooms whose bookings answer a query.
 *
 * Bookings that finished before `today` (campus-local ISO date) are left out: a room that hosted
 * a class's one-off session in September is not where that class is now.
 */
export function searchBookings(
  query: string,
  meetingsByRoom: ReadonlyMap<string, readonly Meeting[]>,
  today?: string,
): Map<string, BookingMatch> {
  const parsed = parseBookingQuery(query);
  const result = new Map<string, BookingMatch>();
  if (!parsed) return result;

  for (const [roomId, meetings] of meetingsByRoom) {
    let score = 0;
    const matched: Meeting[] = [];
    for (const meeting of meetings) {
      if (today && meeting.endDate < today) continue;
      const s = parsed.match(meeting);
      if (s === MatchScore.None) continue;
      score = Math.max(score, s);
      matched.push(meeting);
    }
    if (matched.length === 0) continue;

    // Only the best-scoring bookings explain the match: an exact code hit should not be listed
    // alongside every other course that happens to share a subject.
    const best = dedupeMeetings(matched.filter((m) => parsed.match(m) === score)).sort(
      (a, b) =>
        Number(a.startDate === a.endDate) - Number(b.startDate === b.endDate) ||
        a.startDate.localeCompare(b.startDate) ||
        a.start - b.start ||
        a.label.localeCompare(b.label),
    );
    result.set(roomId, {
      score,
      recurring: best.some((m) => m.startDate !== m.endDate),
      meetings: best,
    });
  }
  return result;
}

/** Identity of a booking as the room experiences it: same room, same slot, same name. */
function meetingKey(m: Meeting): string {
  return [m.roomId, m.kind, m.days, m.start, m.end, m.startDate, m.endDate, m.label, m.detail].join(
    "\u0000",
  );
}

/**
 * Drops bookings that are identical in every field.
 *
 * Banner lists each section of a course separately, and the artifact does not carry the section,
 * so eleven capstone sections sharing one room and one slot arrive as eleven identical rows. To a
 * room they are a single booking, and listing them eleven times is noise. Order is preserved.
 */
export function dedupeMeetings<T extends Meeting>(meetings: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const m of meetings) {
    const key = meetingKey(m);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}
