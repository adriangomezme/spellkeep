import { db } from '../powersync/system';

const TABLE = 'catalog_meta';

export async function getMeta(key: string): Promise<string | null> {
  const row = await db.getOptional<{ value: string }>(
    `SELECT value FROM ${TABLE} WHERE key = ?`,
    [key]
  );
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `INSERT OR REPLACE INTO ${TABLE} (id, key, value, updated_at) VALUES (?, ?, ?, ?)`,
    [key, key, value, now]
  );
}

export async function getAllMeta(): Promise<Record<string, string>> {
  const rows = await db.getAll<{ key: string; value: string }>(
    `SELECT key, value FROM ${TABLE}`
  );
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
