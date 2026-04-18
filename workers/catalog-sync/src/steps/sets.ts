import { getAllSets } from '../scryfall.ts';
import { upsertSets } from '../db.ts';
import { mapScryfallSet } from '../mapper.ts';

export async function syncSets(): Promise<{ upserted: number }> {
  const sets = await getAllSets();
  const now = new Date().toISOString();
  const mapped = sets.map((s) => mapScryfallSet(s, now));

  const BATCH = 200;
  let upserted = 0;
  for (let i = 0; i < mapped.length; i += BATCH) {
    const batch = mapped.slice(i, i + BATCH);
    upserted += await upsertSets(batch);
  }
  return { upserted };
}
