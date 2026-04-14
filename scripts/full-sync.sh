#!/bin/bash
# ============================================================
# SpellKeep - Full Scryfall Sync Script
# ============================================================
# Orchestrates the sync-scryfall Edge Function to do a full
# initial load. Calls the function page by page until all
# cards are synced.
#
# Usage:
#   ./scripts/full-sync.sh [mode]
#
# Modes:
#   sets    — Sync all sets (default, fast)
#   cards   — Sync all cards (slow, ~500 pages)
#   prices  — Update prices only
#
# Prerequisites:
#   - Edge Function deployed: supabase functions deploy sync-scryfall
#   - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set in environment
#     or provide them below
# ============================================================

set -euo pipefail

MODE="${1:-sets}"
SUPABASE_URL="${EXPO_PUBLIC_SUPABASE_URL:-https://akpjeckkglycksavszne.supabase.co}"
# Use the service role key for Edge Function auth
SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"
FUNCTION_URL="${SUPABASE_URL}/functions/v1/sync-scryfall"

if [ -z "$SERVICE_KEY" ]; then
  echo "Error: SUPABASE_SERVICE_ROLE_KEY is not set"
  echo "Set it with: export SUPABASE_SERVICE_ROLE_KEY=your_key_here"
  exit 1
fi

echo "=== SpellKeep Scryfall Sync ==="
echo "Mode: $MODE"
echo "URL:  $FUNCTION_URL"
echo ""

if [ "$MODE" = "sets" ]; then
  echo "Syncing sets..."
  RESPONSE=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer $SERVICE_KEY" \
    "${FUNCTION_URL}?mode=sets")

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | head -1)

  echo "Status: $HTTP_CODE"
  echo "Response: $BODY"
  exit 0
fi

# For cards and prices, paginate
PAGE=1
TOTAL=0

while true; do
  echo -n "Page $PAGE... "

  RESPONSE=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer $SERVICE_KEY" \
    "${FUNCTION_URL}?mode=${MODE}&page=${PAGE}")

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | head -1)

  if [ "$HTTP_CODE" != "200" ]; then
    echo "ERROR ($HTTP_CODE): $BODY"
    echo "Retrying in 5 seconds..."
    sleep 5
    continue
  fi

  SYNCED=$(echo "$BODY" | python3 -c "import json,sys; print(json.load(sys.stdin).get('synced', 0))" 2>/dev/null || echo "0")
  HAS_MORE=$(echo "$BODY" | python3 -c "import json,sys; print(json.load(sys.stdin).get('hasMore', False))" 2>/dev/null || echo "False")

  TOTAL=$((TOTAL + SYNCED))
  echo "${SYNCED} synced (total: ${TOTAL})"

  if [ "$HAS_MORE" = "False" ] || [ "$HAS_MORE" = "false" ]; then
    echo ""
    echo "=== Done! Total synced: $TOTAL ==="
    break
  fi

  PAGE=$((PAGE + 1))

  # Respect Scryfall rate limits
  sleep 0.2
done
