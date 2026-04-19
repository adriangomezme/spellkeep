/**
 * Ensures a card exists in the cards table.
 * Also ensures the card's set exists (FK constraint).
 * Uses service_role to insert (users cannot insert directly via RLS).
 *
 * Request body: { scryfall_id: string, card_data: object }
 * Response: { card_id: string }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { scryfall_id, card_data } = await req.json();

    if (!scryfall_id || !card_data) {
      return new Response(
        JSON.stringify({ error: "scryfall_id and card_data are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check if card already exists
    const { data: existing } = await supabase
      .from("cards")
      .select("id")
      .eq("scryfall_id", scryfall_id)
      .single();

    if (existing) {
      return new Response(JSON.stringify({ card_id: existing.id }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Ensure the set exists (cards.set_code FK → sets.code)
    if (card_data.set_code) {
      const { data: existingSet } = await supabase
        .from("sets")
        .select("id")
        .eq("code", card_data.set_code)
        .single();

      if (!existingSet) {
        // Fetch set info from Scryfall
        let setData: any = {
          scryfall_id: card_data.set_code,
          code: card_data.set_code,
          name: card_data.set_name || card_data.set_code,
        };

        try {
          const res = await fetch(`https://api.scryfall.com/sets/${card_data.set_code}`);
          if (res.ok) {
            const scryfallSet = await res.json();
            setData = {
              scryfall_id: scryfallSet.id,
              code: scryfallSet.code,
              name: scryfallSet.name,
              set_type: scryfallSet.set_type,
              released_at: scryfallSet.released_at,
              card_count: scryfallSet.card_count,
              icon_svg_uri: scryfallSet.icon_svg_uri,
            };
          }
        } catch {
          // Use minimal data if Scryfall fetch fails
        }

        await supabase.from("sets").insert(setData);
      }
    }

    // Ensure array fields are proper arrays
    const arrayFields = ["colors", "color_identity", "keywords", "produced_mana"];
    for (const field of arrayFields) {
      if (card_data[field] && typeof card_data[field] === "string") {
        try { card_data[field] = JSON.parse(card_data[field]); } catch { card_data[field] = []; }
      }
      if (!Array.isArray(card_data[field])) {
        card_data[field] = [];
      }
    }

    // Insert the card with service_role (bypasses RLS). Use upsert so
    // parallel workers racing on the same scryfall_id don't 500 on a
    // unique-constraint violation — the second one just reads the
    // already-inserted row.
    const { data: inserted, error } = await supabase
      .from("cards")
      .upsert({ scryfall_id, ...card_data }, { onConflict: "scryfall_id" })
      .select("id")
      .single();

    if (error) {
      // Last-ditch attempt: fetch the row in case the upsert raced with
      // another request that already committed it.
      const { data: fallback } = await supabase
        .from("cards")
        .select("id")
        .eq("scryfall_id", scryfall_id)
        .single();
      if (fallback) {
        return new Response(JSON.stringify({ card_id: fallback.id }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ card_id: inserted.id }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
