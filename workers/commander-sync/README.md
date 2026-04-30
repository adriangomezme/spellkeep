# commander-sync

Worker that scrapes EDHREC's `commanders/{week,month,year}` JSON
feeds and upserts the top single-card commanders into Supabase.
The mobile app reads the `top_commanders` table via PowerSync and
renders the first 30 entries per window in the Search hub's "Top
Commanders" carousel.

## Schedule

GitHub Actions cron every 5 days at 06:00 UTC. EDHREC's all-time
list is stable; week/month shift slowly enough that this cadence
keeps the carousel meaningfully fresh without putting load on
EDHREC's servers.

## Source

Unofficial public EDHREC `.json` endpoints on the
`json.edhrec.com` host:

- `https://json.edhrec.com/pages/commanders/week.json`
- `https://json.edhrec.com/pages/commanders/month.json`
- `https://json.edhrec.com/pages/commanders/year.json` (the all-time
  / past-2-year root list — note the trailing `year`; the bare
  `commanders.json` returns 403)

Each response carries a `container.json_dict.cardlists[].cardviews[]`
array. Every entry includes an `id` field that is the canonical
Scryfall ID of the printing EDHREC features on the page — we use
that id directly as our `scryfall_id`. No name matching.

## Resolution

For each fetched commander, the resolver only validates that
`id` exists in the local `cards` catalog and that the row's
`layout` is renderable (i.e. not in the SKIP list:
`art_series`, `token`, `double_faced_token`, `emblem`,
`planar`, `scheme`, `vanguard`, `reversible_card`,
`minigame`). EDHREC's pick is otherwise taken at face value — it
already chose the print whose art is the page hero.

## Env

- `SUPABASE_URL` (required)
- `SUPABASE_SERVICE_ROLE_KEY` (required)
- `COMMANDER_TOP_N` (default 100 — number of entries persisted
  per window; the app shows the first 30)
- `COMMANDER_UA` (User-Agent — defaults to a SpellKeep identifier)
- `COMMANDER_SLEEP_MS` (default 1500 — polite pause between
  per-window fetches)

## Running locally

```bash
cd workers/commander-sync
npm install
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run start
```

## Output shape

For each window the worker deletes the existing rows and inserts
the fresh top-N re-ranked densely (1..N).

```sql
top_commanders (
  id uuid primary key default gen_random_uuid(),
  time_window text,        -- 'week' | 'month' | 'two-years'
  rank smallint,           -- 1..100
  scryfall_id uuid,        -- canonical Scryfall ID, FK semantics
  edhrec_slug text,        -- back-reference
  refreshed_at timestamptz,
  unique (time_window, rank)
)
```

PowerSync edition-3 buckets each synced row by its `id` column,
which is why `id` is the PK and `(time_window, rank)` is a unique
constraint instead of the natural composite key.

## Attribution

The carousel surfaces "Data from EDHREC" beneath the title — please
keep that attribution intact wherever this feed is rendered.
