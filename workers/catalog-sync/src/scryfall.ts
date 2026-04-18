import { Readable } from 'node:stream';
import StreamArray from 'stream-json/streamers/StreamArray.js';
import { parser } from 'stream-json';

const SCRYFALL_API = 'https://api.scryfall.com';

export type BulkDataEntry = {
  id: string;
  type: string;
  updated_at: string;
  uri: string;
  name: string;
  description: string;
  download_uri: string;
  size: number;
  content_type: string;
  content_encoding: string;
};

export async function getBulkData(type: 'default_cards' | 'all_cards' | 'oracle_cards'): Promise<BulkDataEntry> {
  const res = await fetch(`${SCRYFALL_API}/bulk-data`);
  if (!res.ok) throw new Error(`Scryfall bulk-data metadata failed: ${res.status}`);
  const body = await res.json() as { data: BulkDataEntry[] };
  const entry = body.data.find((d) => d.type === type);
  if (!entry) throw new Error(`Bulk data type not found: ${type}`);
  return entry;
}

export async function getAllSets(): Promise<any[]> {
  const res = await fetch(`${SCRYFALL_API}/sets`);
  if (!res.ok) throw new Error(`Scryfall /sets failed: ${res.status}`);
  const body = await res.json() as { data: any[] };
  return body.data;
}

/**
 * Streams the bulk JSON file (~500 MB) from Scryfall and yields cards one at a time.
 * Uses stream-json so we never hold the whole payload in memory.
 */
export async function* streamBulkCards(downloadUri: string): AsyncGenerator<any> {
  const res = await fetch(downloadUri);
  if (!res.ok || !res.body) {
    throw new Error(`Bulk download failed: ${res.status}`);
  }

  const nodeStream = Readable.fromWeb(res.body as any);
  const stream = nodeStream.pipe(parser()).pipe(new StreamArray());

  for await (const chunk of stream) {
    yield chunk.value;
  }
}
