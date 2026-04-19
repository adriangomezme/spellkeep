import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ImportFormat } from './import';

// Local-only (AsyncStorage) journal of completed and failed imports. One
// entry per import run. We never persist the full CSV payload or any card
// data — just enough metadata for the user to see "what happened, where did
// it go, did it succeed". Intentionally kept small (~200 bytes per entry)
// so the list stays cheap to read and the storage footprint is trivial.

const STORAGE_KEY = 'spellkeep_import_history_v1';
const MAX_ENTRIES = 100;

export type ImportHistoryStatus = 'completed' | 'failed';

export type ImportHistoryEntry = {
  id: string;
  startedAt: number;
  finishedAt: number;
  format: ImportFormat;
  collectionId: string;
  collectionName: string;
  status: ImportHistoryStatus;
  // Physical card quantities (sum of qty_normal + qty_foil + qty_etched).
  imported: number;
  updated: number;
  // Distinct (print × finish) variants for the same buckets. Optional so
  // entries written before variants were persisted still read cleanly.
  imported_variants?: number;
  updated_variants?: number;
  failedCount: number;
  // First N names that failed to resolve — useful to audit without bloating
  // storage on huge imports.
  failedSample: string[];
  // Only populated when status === 'failed'.
  errorMessage?: string;
};

type Listener = (entries: ImportHistoryEntry[]) => void;

let cache: ImportHistoryEntry[] | null = null;
const listeners = new Set<Listener>();

export async function getImportHistory(): Promise<ImportHistoryEntry[]> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as ImportHistoryEntry[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

export async function recordImportHistory(entry: ImportHistoryEntry): Promise<void> {
  const current = await getImportHistory();
  const next = [entry, ...current].slice(0, MAX_ENTRIES);
  cache = next;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // AsyncStorage errors are non-fatal here — history is a nice-to-have.
  }
  for (const l of listeners) l(next);
}

export async function clearImportHistory(): Promise<void> {
  cache = [];
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {}
  for (const l of listeners) l([]);
}

export async function removeImportHistoryEntry(id: string): Promise<void> {
  const current = await getImportHistory();
  const next = current.filter((e) => e.id !== id);
  cache = next;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}
  for (const l of listeners) l(next);
}

export function subscribeImportHistory(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
