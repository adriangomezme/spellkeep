// Tiny module-level stash for "load this query into the Search input"
// hand-offs from sibling routes (e.g. the syntax-help page tapping
// "Try this query"). Search screen consumes it on focus and clears.
//
// Module-level rather than param-passing because the Search tab is a
// root-of-the-tabs route — pushing params back from a stacked route
// is awkward via expo-router.

let pending: string | null = null;

export function stagePendingSyntaxQuery(query: string): void {
  pending = query;
}

export function consumePendingSyntaxQuery(): string | null {
  const q = pending;
  pending = null;
  return q;
}
