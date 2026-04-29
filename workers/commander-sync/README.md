# commander-sync

Worker that scrapes EDHREC's `commanders/{week,month,}` JSON feeds and
upserts the top single-card commanders into Supabase. The mobile app
reads the `top_commanders` table via PowerSync and renders the first 30
entries per window in the Search hub's "Top Commanders" carousel.

## Schedule

Cron every 5 days. EDHREC's all-time list is stable; week/month shift
slowly enough that a 5-day cadence keeps the carousel meaningfully
fresh without putting load on EDHREC's servers.

## Source

Unofficial public EDHREC `.json` endpoints:

- `https://edhrec.com/commanders/week.json`
- `https://edhrec.com/commanders/month.json`
- `https://edhrec.com/commanders.json` (past 2 years / all-time root)

Each response carries a `container.json_dict.cardlists[].cardviews[]`
array. We pull the first N entries (default 100; configurable via
`COMMANDER_TOP_N`).

## Filtering

Partner pairs are skipped. Heuristic: a name with " // " is tried
first as a single canonical card (DFCs / split cards resolve here);
if that misses, we try the front face only. If both miss, the entry
is dropped — partner pairs naturally fall into this bucket.

## Env

- `SUPABASE_URL` (required)
- `SUPABASE_SERVICE_ROLE_KEY` (required)
- `COMMANDER_TOP_N` (default 100)
- `COMMANDER_UA` (User-Agent — defaults to a SpellKeep identifier)
- `COMMANDER_SLEEP_MS` (default 1500 — polite pause between windows)

## Running locally

```bash
cd workers/commander-sync
npm install
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run start
```

## Output shape

For each window we delete the existing rows and insert the fresh top-N
re-ranked densely (1..N). The Search hub shows the first 30 entries.

```sql
top_commanders (
  window text,            -- 'week' | 'month' | 'two-years'
  rank smallint,          -- 1..100
  scryfall_id uuid,       -- canonical Scryfall ID, FK semantics
  edhrec_slug text,       -- back-reference
  refreshed_at timestamptz
)
```

## Attribution

The carousel surfaces "Data from EDHREC" beneath the title — please
keep that attribution intact wherever this feed is rendered.
