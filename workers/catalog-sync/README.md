# catalog-sync

Daily worker that mirrors Scryfall bulk data into Supabase and publishes
snapshot + delta artifacts so clients can run a fast offline catalog.

## What it does

1. Fetches Scryfall `/sets` and upserts to `public.sets`.
2. Streams the Scryfall `default_cards` bulk JSON (~500 MB), filters to paper-only printings, and upserts to `public.cards` in batches of 500.
3. Builds a compact JSON delta of cards whose `updated_at` is newer than the previous successful run, gzips it, and uploads to the `catalog-deltas/YYYY-MM-DD.json.gz` bucket object. Updates `catalog-deltas/index.json`.
4. Builds a compact SQLite snapshot (live columns only) weekly (or when forced), gzips it, and uploads to `catalog-snapshots/YYYY-MM-DD.sqlite.gz`.
5. Records the run in `public.catalog_sync_runs`.

## Running locally

```bash
cd workers/catalog-sync
export SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...
npm install
npm start
```

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `SUPABASE_URL` | yes | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Service role key (bypasses RLS). Never commit. |
| `FORCE_SNAPSHOT` | no | `true` to always rebuild the snapshot regardless of cadence |
| `SKIP_SNAPSHOT` | no | `true` to skip snapshot generation (faster iteration) |
| `SKIP_DELTA` | no | `true` to skip delta generation (useful for the very first bootstrap) |

## First-time bootstrap

Trigger the GitHub Action manually with:

```
FORCE_SNAPSHOT=true
SKIP_DELTA=true
```

so the first run populates `cards` + `sets` and produces the baseline snapshot without a nonsense delta.
