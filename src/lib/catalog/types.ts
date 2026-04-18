export type CatalogIndex = {
  snapshot_version?: string;
  snapshot_url?: string;
  snapshot_sha256?: string;
  snapshot_raw_bytes?: number;
  snapshot_gz_bytes?: number;
  snapshot_card_count?: number;
  snapshot_set_count?: number;
  updated_at?: string;
};

export type CatalogSyncStatus = 'idle' | 'checking' | 'downloading' | 'applying' | 'ready' | 'error';

export type CatalogSyncState = {
  status: CatalogSyncStatus;
  progress?: number;       // 0..1 for the active download/apply
  snapshotVersion?: string;
  lastSyncAt?: string;
  error?: string;
};
