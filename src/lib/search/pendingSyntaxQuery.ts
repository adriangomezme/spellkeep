// Tiny module-level stash for "load this into the Search input"
// hand-offs from sibling routes. Search screen consumes it on focus
// and clears.
//
// Module-level rather than param-passing because the Search tab is a
// root-of-the-tabs route — pushing params back from a stacked route
// is awkward via expo-router.

import type { SearchFilterState } from './searchFilters';

export type PendingSearchIntent =
  | {
      /** Raw text/query syntax to drop into the input and submit. */
      kind: 'syntax';
      query: string;
    }
  | {
      /** Structured filter hand-off — used for "tap the artist pill",
       *  "browse this set", etc. The Search screen wipes any active
       *  filters, applies these, defaults sort to EDHREC ASC, and
       *  records the action in the recents list under `recentLabel`. */
      kind: 'filtered';
      filters: Partial<SearchFilterState>;
      /** Free-text shown in the input (also used as the recent-search
       *  key). Empty string means filters-only with no input text. */
      query: string;
      /** Label persisted in the recents history. Falls back to the
       *  raw `query` when omitted. */
      recentLabel?: string;
    };

let pending: PendingSearchIntent | null = null;

export function stagePendingSearch(intent: PendingSearchIntent): void {
  pending = intent;
}

export function consumePendingSearch(): PendingSearchIntent | null {
  const p = pending;
  pending = null;
  return p;
}

// ── Back-compat helpers for the callers that still hand a raw
// syntax string (syntax-help page). New callers should use
// `stagePendingSearch` directly. ───────────────────────────────────

export function stagePendingSyntaxQuery(query: string): void {
  pending = { kind: 'syntax', query };
}

export function consumePendingSyntaxQuery(): string | null {
  if (pending?.kind === 'syntax') {
    const q = pending.query;
    pending = null;
    return q;
  }
  return null;
}
