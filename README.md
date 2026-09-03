# vacantNEU

Find an empty classroom at Northeastern.

Every course catalog answers "where is my class?". vacantNEU answers the inverse: **which rooms
have no class in them right now?** A room's free time is the complement of its class bookings, so
the whole product is one dataset — the registrar's room schedule — read backwards.

## Status

**Phase 1 (data pipeline) is complete and verified.** The UI is not built yet.

| | |
|---|---|
| Term | Fall 2026 (`202710`) |
| Coverage | Boston campus |
| Buildings | 40 (38 mapped, 2 off-campus) |
| Rooms | 385 |
| Scheduled meetings | 4,524 |
| Artifact size | 1.1 MB raw / **86 KB gzipped** |

## How it works

```
Banner 9 Self-Service API  ->  Zod validation  ->  transform  ->  data/202710.json
    (nubanner.neu.edu)         (fail loudly)      (normalize)      (committed, 86 KB gz)
                                                                          |
                                              packages/core/vacancy.ts <--+
                                              (pure: isFree, nextTransition)
                                                          |
                                          home / map / browse all read the same answer
```

Course data comes from Northeastern's **Banner 9 Self-Service API** — the same public,
unauthenticated endpoint SearchNEU's scraper reads. A full term is ~20 paginated requests
(`searchResults` accepts no subject filter, so one sweep covers the whole catalog).

### Why there's no database

The entire Boston room schedule is 86 KB gzipped and effectively immutable within a term. A
database would add cost, latency, and ops burden while making the product worse — every "is this
room free?" query would become a network round trip for arithmetic the browser can do instantly.
The scraper emits a static JSON artifact instead.

The artifact is modeled as normalized tables (`buildings` / `rooms` / `meetings`), so if the app
later needs accounts, saved rooms, or crowdsourced occupancy reports, adding Postgres is a loader
script rather than a rewrite.

## Commands

```bash
pnpm install

pnpm scrape                    # scrape current term -> data/<term>.json
pnpm scrape --dry-run          # scrape and report, write nothing
pnpm scrape --term 202710      # pin a specific term

pnpm buildings                 # regenerate map coordinates from OpenStreetMap (run rarely)

pnpm inspect                   # list buildings
pnpm inspect --free            # what's free right now
pnpm inspect --room DG-070     # one room's full weekly schedule
pnpm inspect --building SL     # every room in a building, with live status
pnpm inspect --free --at 2026-09-16T14:30

pnpm test                      # 45 unit tests
pnpm typecheck
```

`pnpm inspect --room` exists so a human can compare a room against Banner's own UI. Automated
tests prove the code matches our assumptions; only that comparison proves the assumptions match
reality.

## Layout

```
packages/core/       Pure vacancy engine + types. No dependencies. Shared by scraper and UI, so
                     there is exactly one definition of "free".
packages/scraper/    Banner client, Zod schemas, transform, OSM building matching, CLIs.
data/                Generated artifacts (committed) + the hand-maintained academic calendar.
```

## Two things that are easy to get wrong

**Banner does not encode holidays.** A meeting row says "Mon/Wed, 09/09–12/20" and will happily
claim its room is occupied on Thanksgiving. `packages/core/src/calendar.ts` is transcribed by hand
from the registrar's PDF and **must be reviewed every academic year**. It is the only input to the
pipeline that cannot be scraped.

**"No class scheduled" is not "unlocked and available."** Banner knows nothing about club
meetings, department events, exam proctoring, room reservations, or whether the door is locked. We
also only know a room exists if a class was scheduled in it, so the real classroom inventory is
larger than 385. This is a limitation of the data source, not a bug — the UI must say "no class
scheduled here" rather than "free," or it will send people to locked doors.

## Safety

The scraper refuses to publish an artifact with implausibly few buildings, rooms, or meetings.
A Banner outage returning an empty result set would otherwise mark every room on campus free —
the most damaging thing this app could do. Failing and keeping yesterday's data is always better.

`.github/workflows/scrape.yml` re-scrapes daily, runs the test suite as a gate, and commits only
when the schedule actually changed.

## Data source

Northeastern Banner 9 Self-Service, `https://nubanner.neu.edu/StudentRegistrationSsb/ssb`.
Public and unauthenticated. The scrape is ~20 requests per day with a courtesy delay between
them. Building footprints come from OpenStreetMap via Overpass.
