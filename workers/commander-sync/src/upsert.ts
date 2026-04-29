import { supabase } from './supabase.ts';
import type { CommanderWindow } from './edhrec.ts';
import type { Resolved } from './resolve.ts';

/**
 * Replace the entire ranking for a single window in one transaction-
 * like operation. EDHREC's order shifts run-to-run; we don't need to
 * preserve historical rows, so the simplest correct shape is:
 *   1. delete every row for `window`
 *   2. insert the fresh top-N
 *
 * If the insert fails after the delete, the next worker run will
 * repopulate. The mobile app gracefully handles an empty window
 * (carousel hides itself).
 */
export async function replaceWindow(
  window: CommanderWindow,
  resolved: Resolved[]
): Promise<{ inserted: number }> {
  const { error: delErr } = await supabase
    .from('top_commanders')
    .delete()
    .eq('time_window', window);
  if (delErr) {
    throw new Error(`delete window=${window} failed: ${delErr.message}`);
  }
  if (resolved.length === 0) return { inserted: 0 };

  const rows = resolved.map((r) => ({
    time_window: window,
    rank: r.rank,
    scryfall_id: r.scryfall_id,
    edhrec_slug: r.edhrec_slug,
  }));
  const { error: insErr } = await supabase.from('top_commanders').insert(rows);
  if (insErr) {
    throw new Error(`insert window=${window} failed: ${insErr.message}`);
  }
  return { inserted: rows.length };
}
