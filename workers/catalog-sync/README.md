# catalog-sync

Daily worker that mirrors Scryfall bulk data into Supabase and publishes a
SQLite snapshot so clients can run a fast offline catalog.

## What it does

1. Fetches Scryfall `/sets` and upserts to `public.sets`.
2. Streams the Scryfall `default_cards` bulk JSON (~500 MB), filters to paper-only printings, and upserts to `public.cards` in batches of 200 (chosen to stay under Supabase's 30 s statement timeout once the `cards` table passes 100k rows with all secondary indexes).
3. Builds a compact SQLite snapshot of the catalog (live columns only, heavy text fields left for on-demand fetch) weekly — or on every run when `FORCE_SNAPSHOT=true` — and uploads the raw `.sqlite` file to `catalog-snapshots/YYYY-MM-DD.sqlite`. Clients stream it straight to disk via `expo-file-system` and attach it with `quick-sqlite`; no gzip so decompression never blocks the UI thread.
4. Writes `catalog-deltas/index.json` pointing at the freshest snapshot (url, sha256, row counts) — that's the single file clients poll.
5. Prunes stale snapshot files in the `catalog-snapshots` bucket.
6. Records the run in `public.catalog_sync_runs`.

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

## First-time bootstrap

Trigger the GitHub Action manually with `FORCE_SNAPSHOT=true` so the first
run populates `cards` + `sets` and produces the baseline snapshot.
