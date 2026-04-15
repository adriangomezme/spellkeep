/**
 * Ensures a card exists in the cards table.
 * Called by the client when adding a card from Scryfall search results.
 * Uses service_role to insert into the cards table (users cannot insert directly).
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

    // Insert the card with service_role (bypasses RLS)
    const { data: inserted, error } = await supabase
      .from("cards")
      .insert({ scryfall_id, ...card_data })
      .select("id")
      .single();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ card_id: inserted.id }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
