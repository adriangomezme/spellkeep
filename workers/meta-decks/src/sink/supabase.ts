import { supabase } from '../supabase.ts';
import type { Format } from '../config.ts';

/**
 * Card payload row matching the JSONB shape that
 * `admin_replace_meta_deck` expects. The RPC unpacks the array into
 * meta_deck_cards rows in a single statement so the deck never
 * shows a half-written card list to readers.
 */
export type CardPayload = {
  scryfall_id: string;
  quantity: number;
  board: 'main' | 'side';
  category: string;
  position: number;
};

export async function replaceDeck(args: {
  format: Format;
  slug: string;
  name: string;
  colors: string;
  archetypeUrl: string;
  metaShare: number | null;
  position: number;
  cards: CardPayload[];
}): Promise<{ deckId: string }> {
  const { data, error } = await supabase.rpc('admin_replace_meta_deck', {
    p_format: args.format,
    p_slug: args.slug,
    p_name: args.name,
    p_colors: args.colors,
    p_archetype_url: args.archetypeUrl,
    p_meta_share: args.metaShare,
    p_position: args.position,
    p_cards: args.cards,
  });
  if (error) {
    throw new Error(
      `admin_replace_meta_deck ${args.format}/${args.slug} failed: ${error.message}`
    );
  }
  return { deckId: String(data) };
}

/**
 * After all archetypes for a format have been replace-upserted, sweep
 * any deck whose `refreshed_at` is older than `threshold` — those
 * have dropped out of the live top-N and should disappear from the
 * carousel on the next PowerSync push.
 */
export async function sweepStaleDecks(
  format: Format,
  threshold: Date
): Promise<{ deleted: number }> {
  const { data, error } = await supabase.rpc('admin_sweep_meta_decks', {
    p_format: format,
    p_threshold: threshold.toISOString(),
  });
  if (error) {
    throw new Error(`admin_sweep_meta_decks ${format} failed: ${error.message}`);
  }
  return { deleted: Number(data ?? 0) };
}
