import { config, type Format } from './config.ts';
import {
  fetchMetagame,
  fetchDeckTabletopTxt,
  sleep,
  type MetagameArchetype,
} from './sources/mtggoldfish.ts';
import { parseTabletop, type ParsedLine } from './parser/tabletopTxt.ts';
import { resolveDeck, type ResolvedRow } from './resolver/cards.ts';
import { typeLineToCategory } from './categorize/typeLine.ts';
import {
  replaceDeck,
  sweepStaleDecks,
  type CardPayload,
} from './sink/supabase.ts';

const COLOR_ORDER: ReadonlyArray<string> = ['W', 'U', 'B', 'R', 'G'];

async function processArchetype(
  format: Format,
  position: number,
  archetype: MetagameArchetype
): Promise<{ inserted: number; missing: number }> {
  console.log(
    `[meta-decks] ${format} #${position} ${archetype.slug} fetching txt…`
  );
  const txt = await fetchDeckTabletopTxt(archetype.url);

  const parsed = parseTabletop(txt);
  if (parsed.length === 0) {
    throw new Error(`empty parse for ${format}/${archetype.slug}`);
  }

  const { resolved, missing } = await resolveDeck(parsed);
  if (missing.length > 0) {
    console.warn(
      `[meta-decks] ${format}/${archetype.slug} missing ${missing.length} ` +
      `card(s): ${missing.slice(0, 5).map((m) => `${m.qty} ${m.name} [${m.set}]`).join(' | ')}` +
      (missing.length > 5 ? ' …' : '')
    );
  }

  // Build the JSONB array passed to the RPC. We carry quantity/
  // board/category/position so the row is rendering-ready downstream.
  const resolvedByIndex = new Map(resolved.map((r) => [r.index, r] as const));
  const cards: CardPayload[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const line = parsed[i]!;
    const r = resolvedByIndex.get(i);
    if (!r) continue;
    cards.push({
      scryfall_id: r.scryfall_id,
      quantity: line.qty,
      board: line.board,
      category:
        line.board === 'side' ? 'sideboard' : typeLineToCategory(r.type_line),
      position: line.position,
    });
  }

  if (cards.length === 0) {
    throw new Error(`zero resolved cards for ${format}/${archetype.slug}`);
  }

  const colors = deriveColors(parsed, resolved);

  await replaceDeck({
    format,
    slug: archetype.slug,
    name: archetype.name,
    colors,
    archetypeUrl: archetype.url,
    metaShare: archetype.metaShare,
    position,
    cards,
  });

  return { inserted: cards.length, missing: missing.length };
}

/**
 * Deck colors = unique color identity letters across mainboard cards
 * (sideboard is intentionally excluded — splash colors that only
 * exist in the SB shouldn't dictate the deck's primary color label).
 * Ordered WUBRG. Empty string for fully colorless mainboards.
 */
function deriveColors(
  lines: ParsedLine[],
  resolved: ResolvedRow[]
): string {
  const seen = new Set<string>();
  const resolvedByIndex = new Map(resolved.map((r) => [r.index, r] as const));
  lines.forEach((line, index) => {
    if (line.board !== 'main') return;
    const r = resolvedByIndex.get(index);
    if (!r) return;
    for (const c of r.color_identity) {
      if (COLOR_ORDER.includes(c)) seen.add(c);
    }
  });
  return COLOR_ORDER.filter((c) => seen.has(c)).join('');
}

async function processFormat(
  format: Format
): Promise<{ archetypes: number; inserted: number; missing: number; deleted: number }> {
  const runStartedAt = new Date();

  console.log(`[meta-decks] ${format} fetching metagame index…`);
  const archetypes = await fetchMetagame(format, config.topN);
  console.log(
    `[meta-decks] ${format} archetypes=${archetypes.length}: ${archetypes
      .map((a) => a.slug)
      .join(', ')}`
  );

  let inserted = 0;
  let missing = 0;
  for (let i = 0; i < archetypes.length; i++) {
    const a = archetypes[i]!;
    const position = i + 1;
    try {
      const r = await processArchetype(format, position, a);
      inserted += r.inserted;
      missing += r.missing;
      console.log(
        `[meta-decks] ${format}/${a.slug} inserted=${r.inserted} missing=${r.missing}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[meta-decks] ${format}/${a.slug} FAILED: ${msg}`);
    }

    if (i < archetypes.length - 1) {
      await sleep(config.betweenFetchSleepMs);
    }
  }

  // Sweep archetypes that no longer appear in the current top-N. The
  // threshold is the run-start timestamp, so any archetype that was
  // *not* upserted during this run will have an older refreshed_at
  // and gets removed.
  const { deleted } = await sweepStaleDecks(format, runStartedAt);

  return { archetypes: archetypes.length, inserted, missing, deleted };
}

async function main(): Promise<void> {
  console.log(
    `[meta-decks] starting run formats=${config.formats.join(',')} topN=${config.topN}`
  );

  const summary: Record<string, unknown> = {};
  for (let i = 0; i < config.formats.length; i++) {
    const format = config.formats[i]!;
    try {
      const r = await processFormat(format);
      summary[format] = r;
      console.log(
        `[meta-decks] ${format} done archetypes=${r.archetypes} ` +
        `inserted=${r.inserted} missing=${r.missing} deleted=${r.deleted}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[meta-decks] ${format} FORMAT FAILED: ${msg}`);
      summary[format] = { error: msg };
    }

    if (i < config.formats.length - 1) {
      await sleep(config.betweenFetchSleepMs);
    }
  }

  console.log(`[meta-decks] done summary=${JSON.stringify(summary)}`);
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[meta-decks] FATAL: ${msg}`);
  process.exit(1);
});
