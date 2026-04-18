export type CatalogIndex = {
  snapshot_version?: string;
  snapshot_base_url?: string;        // new chunked layout
  snapshot_card_chunks?: number;
  snapshot_card_chunk_size?: number;
  snapshot_card_count?: number;
  snapshot_set_count?: number;
  snapshot_gz_bytes?: number;
  latest_delta?: string;
  latest_delta_url?: string;
  updated_at?: string;
};

export type CatalogDelta = {
  version: string;
  generated_at: string;
  previous_run_started_at: string;
  changed_cards: CatalogCardPayload[];
};

export type CatalogCardPayload = {
  id: string;
  scryfall_id: string;
  oracle_id: string | null;
  name: string;
  mana_cost: string | null;
  cmc: number | null;
  type_line: string | null;
  colors: string[] | null;
  color_identity: string[] | null;
  rarity: string | null;
  set_code: string | null;
  set_name: string | null;
  collector_number: string | null;
  image_uri_small: string | null;
  image_uri_normal: string | null;
  price_usd: number | null;
  price_usd_foil: number | null;
  price_eur: number | null;
  price_eur_foil: number | null;
  legalities: Record<string, string> | null;
  released_at: string | null;
  is_legendary: boolean | null;
  layout: string | null;
  updated_at: string;
};

export type CatalogSyncStatus = 'idle' | 'checking' | 'downloading' | 'applying' | 'ready' | 'error';

export type CatalogSyncState = {
  status: CatalogSyncStatus;
  progress?: number;       // 0..1 for the active download/apply
  snapshotVersion?: string;
  lastSyncAt?: string;
  error?: string;
};
