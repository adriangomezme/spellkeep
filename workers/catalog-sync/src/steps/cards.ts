import { streamBulkCards } from '../scryfall.ts';
import { upsertCards } from '../db.ts';
import { mapScryfallCard } from '../mapper.ts';

// Keep batches small enough that each INSERT ... ON CONFLICT UPDATE with
// all secondary indexes (name COLLATE NOCASE, set_code, oracle_id, GIN on
// color_identity, partial edhrec_rank, etc.) completes well under Supabase's
// ~30s statement timeout. 200 rows × ~9 index maintenance ops per row fits
// comfortably; 500 started tripping the timeout around the 90k-row mark
// once the table had 100k+ rows.
const BATCH_SIZE = 200;
// Scryfall includes digital-only printings (Arena, MTGO) in default_cards.
// Our catalog is for paper play, so we filter them out.
const PAPER_ONLY = true;

export async function syncCards(downloadUri: string): Promise<{ processed: number; inserted: number; updated: number }> {
  const now = new Date().toISOString();
  let buffer: Record<string, unknown>[] = [];
  let processed = 0;
  let skipped = 0;

  for await (const card of streamBulkCards(downloadUri)) {
    if (PAPER_ONLY && !isPaperCard(card)) {
      skipped++;
      continue;
    }
    buffer.push(mapScryfallCard(card, now));
    if (buffer.length >= BATCH_SIZE) {
      await upsertCards(buffer);
      processed += buffer.length;
      buffer = [];
      if (processed % 10000 === 0) {
        console.log(`[catalog-sync] cards progress: ${processed} upserted (${skipped} skipped)`);
      }
    }
  }

  if (buffer.length > 0) {
    await upsertCards(buffer);
    processed += buffer.length;
  }

  console.log(`[catalog-sync] cards final: ${processed} upserted, ${skipped} skipped (digital-only)`);

  // We don't split inserted vs updated here — Postgres doesn't return that
  // cheaply from a bulk upsert. We populate `processed` as the aggregate and
  // leave the split fields at 0. If we want the split later, we can run
  // a COUNT query before/after, or switch to a CTE upsert that returns
  // xmax = 0 for inserts.
  return { processed, inserted: 0, updated: processed };
}

function isPaperCard(card: any): boolean {
  const games: string[] = card.games ?? [];
  return games.includes('paper');
}
