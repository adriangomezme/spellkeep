import { useMemo } from 'react';
import { useQuery } from '@powersync/react';
import type { SortMode } from '../collections.local';

// ─────────────────────────────────────────────────────────────────────────
// Sort preferences live on the signed-in user's `profiles` row. One row
// per user, so we read via the PowerSync `useQuery` hook reactively —
// toggling the setting in Profile updates the Hub on the next tick.
//
// The shape mirrors migration 00045: three independent columns, one per
// surface (Folders, Binders, Lists). Default is `created_desc` to match
// the order the Hub displayed before this feature landed.
// ─────────────────────────────────────────────────────────────────────────

export type SortPreferences = {
  folder: SortMode;
  binder: SortMode;
  list: SortMode;
};

const DEFAULTS: SortPreferences = {
  folder: 'created_desc',
  binder: 'created_desc',
  list: 'created_desc',
};

type ProfileRow = {
  folder_sort_mode: string | null;
  binder_sort_mode: string | null;
  list_sort_mode: string | null;
};

const ALLOWED: ReadonlySet<SortMode> = new Set([
  'name_asc',
  'name_desc',
  'created_asc',
  'created_desc',
  'custom',
]);

function coerce(value: string | null | undefined, fallback: SortMode): SortMode {
  if (!value) return fallback;
  return ALLOWED.has(value as SortMode) ? (value as SortMode) : fallback;
}

export function useSortPreference(): SortPreferences {
  const rows = useQuery<ProfileRow>(
    `SELECT folder_sort_mode, binder_sort_mode, list_sort_mode FROM profiles LIMIT 1`
  );
  return useMemo(() => {
    const row = rows.data?.[0];
    if (!row) return DEFAULTS;
    return {
      folder: coerce(row.folder_sort_mode, DEFAULTS.folder),
      binder: coerce(row.binder_sort_mode, DEFAULTS.binder),
      list: coerce(row.list_sort_mode, DEFAULTS.list),
    };
  }, [rows.data]);
}

/**
 * SQL ORDER BY clause for a given sort mode. `custom` falls back to
 * `created_at ASC` when two rows share the same sort_order (should be
 * rare with the 1024-gap scheme, but safe).
 *
 * Inserts the clause raw — DO NOT pass user input through here; `mode`
 * is a discriminated union, and the only other column names used are
 * hardcoded identifiers from the caller.
 */
export function orderByClause(mode: SortMode, nameCol = 'name', createdCol = 'created_at', sortOrderCol = 'sort_order'): string {
  switch (mode) {
    case 'name_asc':      return `ORDER BY LOWER(${nameCol}) ASC`;
    case 'name_desc':     return `ORDER BY LOWER(${nameCol}) DESC`;
    case 'created_asc':   return `ORDER BY ${createdCol} ASC`;
    case 'created_desc':  return `ORDER BY ${createdCol} DESC`;
    case 'custom':        return `ORDER BY ${sortOrderCol} ASC, ${createdCol} ASC`;
  }
}
