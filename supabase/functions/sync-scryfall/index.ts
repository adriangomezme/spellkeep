/**
 * SpellKeep - Scryfall Sync Edge Function
 *
 * Strategy:
 * Since the full Scryfall bulk data is ~510MB (too large for an Edge Function),
 * we split the sync into two modes:
 *
 * 1. "sets"   — Syncs all sets (~1k rows). Fast, runs in seconds.
 * 2. "cards"  — Syncs cards using the Scryfall API paginated search.
 *              Uses /cards/search with pagination (175 cards per page).
 *              Designed to be called repeatedly with a cursor (page number).
 *
 * For initial bulk load of cards, use an external script or the Supabase
 * SQL editor to import the bulk JSON directly. This function handles
 * incremental daily syncs (new cards, price updates).
 *
 * Endpoints:
 *   POST /sync-scryfall?mode=sets          — Sync all sets
 *   POST /sync-scryfall?mode=cards&page=1  — Sync cards page by page
 *   POST /sync-scryfall?mode=prices        — Update prices only (lighter)
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SCRYFALL_API = "https://api.scryfall.com";
const SCRYFALL_DELAY = 100; // ms between requests (Scryfall asks for 50-100ms)

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================
// SETS SYNC
// ============================================================

async function syncSets(): Promise<{ synced: number; errors: string[] }> {
  const response = await fetch(`${SCRYFALL_API}/sets`);
  if (!response.ok) {
    throw new Error(`Scryfall sets API error: ${response.status}`);
  }

  const data = await response.json();
  const sets = data.data;
  const errors: string[] = [];
  let synced = 0;

  // Process in batches of 100
  for (let i = 0; i < sets.length; i += 100) {
    const batch = sets.slice(i, i + 100).map((set: any) => ({
      scryfall_id: set.id,
      code: set.code,
      name: set.name,
      set_type: set.set_type,
      released_at: set.released_at,
      card_count: set.card_count,
      icon_svg_uri: set.icon_svg_uri,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from("sets")
      .upsert(batch, { onConflict: "code" });

    if (error) {
      errors.push(`Batch ${i}: ${error.message}`);
    } else {
      synced += batch.length;
    }
  }

  return { synced, errors };
}

// ============================================================
// CARDS SYNC (paginated via Scryfall search)
// ============================================================

interface CardPage {
  synced: number;
  hasMore: boolean;
  nextPage: number;
  errors: string[];
}

function mapCard(card: any) {
  // Handle double-faced cards
  const faces = card.card_faces;
  const mainFace = faces?.[0] ?? card;

  return {
    scryfall_id: card.id,
    oracle_id: card.oracle_id,
    name: card.name,
    mana_cost: mainFace.mana_cost ?? card.mana_cost,
    cmc: card.cmc ?? 0,
    type_line: card.type_line ?? mainFace.type_line,
    oracle_text: mainFace.oracle_text ?? card.oracle_text,
    colors: card.colors ?? mainFace.colors ?? [],
    color_identity: card.color_identity ?? [],
    keywords: card.keywords ?? [],
    power: mainFace.power ?? card.power,
    toughness: mainFace.toughness ?? card.toughness,
    loyalty: mainFace.loyalty ?? card.loyalty,
    rarity: card.rarity,
    set_code: card.set,
    set_name: card.set_name,
    collector_number: card.collector_number,
    image_uri_small: card.image_uris?.small ?? faces?.[0]?.image_uris?.small,
    image_uri_normal: card.image_uris?.normal ?? faces?.[0]?.image_uris?.normal,
    image_uri_large: card.image_uris?.large ?? faces?.[0]?.image_uris?.large,
    image_uri_art_crop:
      card.image_uris?.art_crop ?? faces?.[0]?.image_uris?.art_crop,
    price_usd: card.prices?.usd ? parseFloat(card.prices.usd) : null,
    price_usd_foil: card.prices?.usd_foil
      ? parseFloat(card.prices.usd_foil)
      : null,
    price_eur: card.prices?.eur ? parseFloat(card.prices.eur) : null,
    price_eur_foil: card.prices?.eur_foil
      ? parseFloat(card.prices.eur_foil)
      : null,
    legalities: card.legalities ?? {},
    released_at: card.released_at,
    artist: card.artist,
    is_legendary: (card.type_line ?? "").includes("Legendary"),
    produced_mana: card.produced_mana ?? [],
    layout: card.layout,
    card_faces: faces ? JSON.stringify(faces) : null,
    updated_at: new Date().toISOString(),
  };
}

async function syncCardsPage(page: number): Promise<CardPage> {
  // Use Scryfall search to get all cards, paginated
  // "game:paper" filters to paper cards only (no digital-only)
  const url = `${SCRYFALL_API}/cards/search?q=game%3Apaper&order=set&page=${page}`;

  const response = await fetch(url);
  if (!response.ok) {
    if (response.status === 404) {
      // No more results
      return { synced: 0, hasMore: false, nextPage: page, errors: [] };
    }
    throw new Error(`Scryfall search API error: ${response.status}`);
  }

  const data = await response.json();
  const cards = data.data;
  const errors: string[] = [];
  let synced = 0;

  // Map and upsert in batches of 50
  for (let i = 0; i < cards.length; i += 50) {
    const batch = cards.slice(i, i + 50).map(mapCard);

    const { error } = await supabase
      .from("cards")
      .upsert(batch, { onConflict: "scryfall_id" });

    if (error) {
      errors.push(`Page ${page}, batch ${i}: ${error.message}`);
    } else {
      synced += batch.length;
    }
  }

  await delay(SCRYFALL_DELAY);

  return {
    synced,
    hasMore: data.has_more ?? false,
    nextPage: page + 1,
    errors,
  };
}

// ============================================================
// PRICE UPDATE (lightweight — only updates price columns)
// ============================================================

async function syncPrices(page: number): Promise<CardPage> {
  const url = `${SCRYFALL_API}/cards/search?q=game%3Apaper&order=set&page=${page}`;

  const response = await fetch(url);
  if (!response.ok) {
    if (response.status === 404) {
      return { synced: 0, hasMore: false, nextPage: page, errors: [] };
    }
    throw new Error(`Scryfall API error: ${response.status}`);
  }

  const data = await response.json();
  const errors: string[] = [];
  let synced = 0;

  // Only update price fields
  for (let i = 0; i < data.data.length; i += 50) {
    const batch = data.data.slice(i, i + 50).map((card: any) => ({
      scryfall_id: card.id,
      price_usd: card.prices?.usd ? parseFloat(card.prices.usd) : null,
      price_usd_foil: card.prices?.usd_foil
        ? parseFloat(card.prices.usd_foil)
        : null,
      price_eur: card.prices?.eur ? parseFloat(card.prices.eur) : null,
      price_eur_foil: card.prices?.eur_foil
        ? parseFloat(card.prices.eur_foil)
        : null,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from("cards")
      .upsert(batch, { onConflict: "scryfall_id" });

    if (error) {
      errors.push(`Price page ${page}, batch ${i}: ${error.message}`);
    } else {
      synced += batch.length;
    }
  }

  await delay(SCRYFALL_DELAY);

  return {
    synced,
    hasMore: data.has_more ?? false,
    nextPage: page + 1,
    errors,
  };
}

// ============================================================
// HANDLER
// ============================================================

Deno.serve(async (req: Request) => {
  try {
    // JWT validation is handled by Supabase Edge Functions runtime (verify_jwt: true).
    // Only service_role or valid authenticated tokens reach this point.

    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") ?? "sets";
    const page = parseInt(url.searchParams.get("page") ?? "1", 10);

    let result: any;

    switch (mode) {
      case "sets":
        result = await syncSets();
        break;

      case "cards":
        result = await syncCardsPage(page);
        break;

      case "prices":
        result = await syncPrices(page);
        break;

      default:
        return new Response(
          JSON.stringify({ error: `Unknown mode: ${mode}` }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }
        );
    }

    return new Response(JSON.stringify({ mode, page, ...result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Sync error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
