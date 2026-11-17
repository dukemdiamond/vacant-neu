# Architecture

vacantNEU is the inverse of a course catalog. Every registrar system answers "where is my class?";
this one answers "which rooms have nothing in them?" — the same dataset read backwards. A room is
free exactly when no booking covers the current instant.

Every structural decision here follows from one measurement: **a full term of room bookings is
86 KB gzipped and barely changes within the term.** That number is what makes a database
unnecessary, a server unnecessary, and a client-side vacancy engine correct rather than clever.

## The system in one picture

Two halves that share no runtime dependency. The write path produces an artifact once a day; the
read path serves it. If the scraper never ran again, the site would keep working — degrading
slowly as the term drifts, rather than failing.

```mermaid
flowchart TB
    subgraph W["WRITE PATH — GitHub Actions, daily 09:15 UTC, about 2m20s"]
        direction TB
        B1["Banner 9 SSB API<br/>public, unauthenticated<br/>~20 paginated requests<br/><b>REQUIRED</b>"]
        E1["Engage / CampusGroups<br/>undocumented, cookie auth<br/>credential expires<br/><b>OPTIONAL</b>"]

        B2["BannerClient<br/>cookie handshake, retry + backoff"]
        E2["EngageClient<br/>detects silent session rejection"]

        B3["Zod schema"]
        E3["Zod schema"]

        B4["transform<br/>normalize to buildings / rooms / meetings"]
        E4["transformEvents + location.ts<br/>resolve venue text to a room id, or null"]

        GATE{"Plausibility floors<br/>25 buildings · 250 rooms · 3,000 meetings"}
        STOP["exit 1 — publish nothing<br/>yesterday's artifact stays live"]

        GATE2{"Would this overwrite<br/>good data with worse?"}
        STOP2["exit 3 — keep existing bookings"]

        A1[("data/202710.json")]
        A2[("data/events.json")]

        B1 --> B2 --> B3 --> B4 --> GATE
        E1 --> E2 --> E3 --> E4 --> GATE2
        GATE -- "fails" --> STOP
        GATE -- "passes" --> A1
        GATE2 -- "yes" --> STOP2
        GATE2 -- "no" --> A2
    end

    COMMIT["git commit + push<br/>only when content actually changed"]
    A1 --> COMMIT
    A2 --> COMMIT

    subgraph R["READ PATH — static, every request"]
        direction TB
        BUILD["Vercel build<br/>sync-data.mjs minifies into public/data<br/>next build with output: export"]
        CDN[("CDN<br/>schedule.json · events.json · buildings.geojson")]
        BUILD --> CDN
    end

    COMMIT -- "triggers deploy" --> BUILD

    subgraph BR["BROWSER"]
        direction TB
        FETCH["useSchedule — fetch both artifacts, merge bookings<br/>useRoomIndex — MiniSearch<br/>useNow — ticks on the minute boundary"]
        CORE["<b>packages/core/vacancy.ts</b><br/>pure · zero dependencies<br/>the only definition of 'free'"]
        UI["Home · Browse · Map · Events"]
        FETCH --> CORE --> UI
    end

    CDN -- "fetch, not bundled" --> FETCH
```

`vacancy.ts` is also what the `pnpm inspect` CLI and the 106 unit tests run against. One definition
of "free", four consumers: if the map and Browse ever disagree about a room, that is a UI bug, not
a data question.

## Why there is no database

The entire room schedule is 86 KB gzipped and effectively immutable within a term. A database
would add cost, latency, and an ops burden while making the product _worse_ — every "is this room
free?" would become a network round trip for arithmetic the browser can do in microseconds. The
browser downloads the dataset once and answers every subsequent question locally, including
questions asked while offline.

The artifact is nonetheless modeled as normalized tables, so outgrowing it is a loader script
rather than a remodelling exercise.

```mermaid
erDiagram
    CAMPUS ||--o{ BUILDING : "contains"
    BUILDING ||--o{ ROOM : "contains"
    ROOM ||--o{ MEETING : "is booked by"
    ROOM |o--o{ CAMPUS_EVENT : "may resolve to"

    CAMPUS {
        string code PK "BOS"
        string name "Boston"
        int buildingCount
        int roomCount
    }
    BUILDING {
        string code PK "DG — unique across all campuses"
        string name "Dodge Hall"
        string campus FK
    }
    ROOM {
        string id PK "DG-070, synthetic building-room key"
        string campus FK
        string building FK
        string room "070, as Banner spells it"
        string displayName "Dodge Hall 070"
    }
    MEETING {
        string roomId FK
        enum kind "class | event"
        int days "7-bit mask, Mon = bit 0"
        int start "minutes since campus-local midnight, inclusive"
        int end "exclusive"
        date startDate "inclusive"
        date endDate "inclusive"
        string label "course code, or event name"
        string detail "course title, or hosting club"
    }
    CAMPUS_EVENT {
        string id PK
        string name
        string club
        string location "verbatim from Engage, including TBD"
        string roomId FK "null when the venue resolves to nothing"
    }
```

Two modelling choices carry weight. Classes and club events collapse into one `Meeting` shape,
because a room is occupied if _anything_ is in it — they are distinguished only for display, and
so a failure to reach one source can never be mistaken for the room being free. And times are
stored as minutes since campus-local midnight plus a day bitmask rather than timestamps: compact,
and every comparison the engine makes is integer arithmetic.

## Computing vacancy

Pure, dependency-free, and shared by every surface. The only input beyond the artifact is the
instant being asked about, which is why the page cannot be prerendered.

```mermaid
flowchart TB
    IN["roomStatus: roomId, meetings, instant, calendar"]
    T["campusTime<br/>convert the instant to America/New_York<br/>yielding date, dayBit, minutes-since-midnight"]
    F["meetingsOnDay<br/>keep bookings whose day bit matches<br/>and whose date range covers today"]
    H{"Is today a<br/>no-class date?"}
    HC["Drop classes only.<br/>A holiday cancels classes, not the building —<br/>clubs book rooms precisely on those days."]
    M["busyBlocks<br/>sort by start, merge overlapping and exactly<br/>adjacent intervals into contiguous blocks"]
    Q{"Does a block cover<br/>the current minute?"}
    OCC["occupied<br/>current = the specific meeting covering now<br/>minutesUntilChange = block end − now"]
    FREE["free<br/>minutesUntilChange = next block start − now<br/>or null if nothing else today"]
    OUT["RoomStatus<br/>+ scheduleUnreliable during exam periods"]

    IN --> T --> F --> H
    H -- "yes" --> HC --> M
    H -- "no" --> M
    M --> Q
    Q -- "yes" --> OCC --> OUT
    Q -- "no" --> FREE --> OUT
```

Only _touching_ intervals merge. A 10-minute passing period between two classes is reported
honestly as 10 free minutes; deciding such a gap is too short to be useful is a UI concern, handled
by the "free for at least N minutes" filter, not a data concern.

The academic calendar is the one input that cannot be scraped. Banner's meeting rows carry a date
range and day flags but know nothing about holidays — a Mon/Wed class dated 09/09–12/20 will
happily claim its room on Thanksgiving. So `packages/core/calendar.ts` is transcribed by hand from
the registrar's PDF and must be reviewed every academic year.

## The failure model

This is the part with the most thought in it, because the failure modes are asymmetric. Stale data
is mildly annoying. **Wrong data sends someone to a room with a lecture already in it** — and the
specific way this pipeline breaks, a truncated or empty upstream response, produces exactly that:
an artifact marking every room on campus free. Every gate below exists to make "publish nothing"
the default outcome of anything unexpected.

```mermaid
flowchart TB
    START["Daily run"]
    T{"pnpm test — 106 unit tests"}
    TF["Fail the job. If the vacancy engine has<br/>drifted, its output is not publishable."]

    TERM["Choose the term by date<br/>sample each candidate's meeting dates"]
    S{"Banner scrape"}
    SF["exit 1 — Banner degraded or changed shape.<br/>Zod fails loudly at the boundary."]
    P{"Plausibility floors"}
    PF["exit 1 — implausible result set.<br/>Keep yesterday's artifact."]
    SI["File a GitHub issue.<br/>The job fails, but events still run."]

    E{"Engage scrape"}
    E2{"Session refused?<br/>detected via the server replacing the cookie"}
    EF2["exit 2 — file a GitHub issue<br/>with cookie-refresh steps.<br/>continue-on-error: the run proceeds."]
    E3{"Pull worse?<br/>fewer upcoming bookings than an authenticated<br/>artifact, or under half the upcoming ones"}
    EF3["exit 3 — refuse to trade a good<br/>artifact for a hollow one."]

    C{"Did any file change?"}
    NOOP["No commit. An unchanged schedule<br/>should not churn git history."]
    OK["Commit, push, deploy"]

    START --> T
    T -- "fail" --> TF
    T -- "pass" --> TERM --> S
    S -- "fail" --> SF --> SI
    S -- "ok" --> P
    P -- "below floor" --> PF --> SI
    P -- "ok" --> E
    SI --> E
    E --> E2
    E2 -- "yes" --> EF2 --> C
    E2 -- "no" --> E3
    E3 -- "yes" --> EF3 --> C
    E3 -- "no" --> C
    C -- "no" --> NOOP
    C -- "yes" --> OK
```

### Which term is current

Banner keeps several terms open at once: from early November, Spring is open for registration
and listed above Fall, weeks before its first class and with most of its rooms unassigned. The
scraper originally took the newest open term, so on November 2 it switched to Spring. The floors
then refused the thin result every day, which kept bad data off the site but left it serving
stale data.

The term is now chosen by date. For Banner's three newest main semesters (CPS and Law calendars
excluded, "(View Only)" ignored because it flips on an administrative schedule), one sample page
gives the term's span. The start is the most common meeting start date, and the end is the date by
which 90% of meetings have finished, so finals count and a stray long-running row does not. Then:
the term in session wins. Failing that, a term starting within 7 days. Failing that, the term
that most recently ended, because during a break its schedule correctly shows rooms free. The
rules live in `term.ts` and are tested across a full year of transitions.

### Sources are tiered, not equal partners

Banner is public, unauthenticated, and required. Engage is undocumented, sits behind a credential
that expires on no published schedule, and is optional. That asymmetry is enforced at every layer
— separate artifacts, separate CI steps with `continue-on-error`, separate `fetch` calls in the
browser where the events request ends in `.catch(() => null)`. Getting it backwards would mean an
expired cookie takes down the thing the app is actually for.

### The failure that looks like success

Engage does not reject a stale session. It silently mints a fresh anonymous one, returns 200, and
redacts nearly every venue to `Private Location (sign in to display)`. The scrape appears to
succeed and quietly finds almost nothing — on an anonymous pull roughly 95% of events have no
usable location.

Two defences. The client infers rejection from the server _replacing_ the session cookie, which
only happens when the one sent was refused, and raises `EngageSessionError` for a distinct exit
code. And the writer refuses to overwrite an authenticated artifact with an anonymous pull that
finds fewer bookings, or to accept a pull with under half the previous bookings, so even an
undetected downgrade cannot silently discard weeks of real data.

Both comparisons count only bookings that are still ahead. Events are dated, so an artifact decays
on its own. Counting every booking let a single authenticated pull from early September block every
anonymous pull through November, long after most of its bookings had passed.

The same trap catches humans: the session token contains percent sequences (`%2b`, `%3d`) and
CampusGroups expects them byte-for-byte as the browser stores them. Decoding them first yields a
token the server does not recognise — and does not complain about.

## The read path

```mermaid
sequenceDiagram
    participant U as Visitor
    participant CDN as CDN
    participant JS as Client bundle
    participant V as vacancy.ts

    U->>CDN: GET /
    CDN-->>U: static shell, 119 KB JS
    Note over JS: Vacancy depends on the current minute,<br/>so nothing here can be prerendered.
    JS->>CDN: fetch data/schedule.json
    JS->>CDN: fetch data/events.json
    CDN-->>JS: 86 KB gzipped
    CDN-->>JS: club bookings, or a failure that is swallowed
    JS->>JS: merge bookings, build the MiniSearch index
    JS->>V: allRoomStatuses(artifact, now)
    V-->>JS: 566 room statuses
    JS-->>U: render
    loop every minute boundary
        JS->>V: recompute against the new minute
        V-->>JS: updated statuses
    end
```

The artifacts are fetched rather than imported. That keeps them out of the JS bundle and lets the
CDN revalidate data without a code deploy — a schedule refresh does not require shipping code.

The clock ticks on the minute _boundary_ rather than every 60 seconds, so a page opened at 10:29:58
updates two seconds later rather than a minute later, and countdowns stay honest.

All reasoning happens in campus time. A student checking from a laptop still set to Pacific sees
the same answer as one standing in the hallway.

### Search

MiniSearch over rooms, indexed by building name, building code, and room number in both the padded
and unpadded spelling, because Banner writes `070` and students type `70`. Three tuning decisions
worth noting:

- **Fuzzy matching is disabled for digits.** With a flat fuzzy factor, "Ryder 155" also matches 153,
  154, 156 and 158, burying the room actually asked for.
- **Bookings are deduplicated before indexing.** A lecture meeting three times a week should not
  weight its room three times as heavily as one that meets once.
- **A class match survives the availability filter.** Searching a course code is a request to find
  _that_ room; answering "no rooms match" because the class is in session is the opposite of useful.

## Where the map data comes from

Building footprints are a third pipeline, run rarely rather than daily, because buildings do not
move. `pnpm buildings` queries OpenStreetMap via Overpass around the Boston campus and matches
Banner's building descriptions to OSM geometry using a Dice coefficient over character bigrams —
tolerant enough that "Behrakis Health Sciences Cntr" matches "Behrakis Health Sciences Center".

Every automatic match is written into `data/building-overrides.json`, where it can be corrected by
hand, and manual corrections are never overwritten by a re-run. Fuzzy matching is acceptable only
because a human can pin any result it gets wrong.

## Known limits

- **Every visitor downloads every campus.** At 566 rooms this is cheaper than paginating. At ten
  times the size it would not be, and the fix is per-campus shards, which the `campus` field on
  every row already permits.
- **Club events depend on a manually refreshed cookie.** A human is in the loop on a recurring
  basis. CI files an issue rather than letting it rot silently, but it is still the weakest
  operational link.
- **One term at a time.** `data/current.json` names the live artifact; older terms remain on disk
  but nothing serves them.
- **The academic calendar is hand-transcribed** and Boston-only. Canada-specific observances for
  the Vancouver campus are deliberately excluded.
- **London is absent** because Banner publishes no room for any of its 282 meeting rows. Nothing
  can be inferred from a booking with no location.
