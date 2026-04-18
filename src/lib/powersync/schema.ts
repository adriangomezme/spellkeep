import { column, Schema, Table } from '@powersync/react-native';

// ============================================================
// Card catalog (synced from Supabase, read-only locally)
// ============================================================

const sets = new Table({
  scryfall_id: column.text,
  code: column.text,
  name: column.text,
  set_type: column.text,
  released_at: column.text,
  card_count: column.integer,
  icon_svg_uri: column.text,
  updated_at: column.text,
}, { indexes: { code: ['code'] } });

const cards = new Table({
  scryfall_id: column.text,
  oracle_id: column.text,
  name: column.text,
  mana_cost: column.text,
  cmc: column.real,
  type_line: column.text,
  oracle_text: column.text,
  colors: column.text,           // JSON array stored as text
  color_identity: column.text,   // JSON array stored as text
  keywords: column.text,         // JSON array stored as text
  power: column.text,
  toughness: column.text,
  loyalty: column.text,
  rarity: column.text,
  set_code: column.text,
  set_name: column.text,
  collector_number: column.text,
  image_uri_small: column.text,
  image_uri_normal: column.text,
  image_uri_large: column.text,
  image_uri_art_crop: column.text,
  price_usd: column.real,
  price_usd_foil: column.real,
  price_eur: column.real,
  price_eur_foil: column.real,
  legalities: column.text,       // JSON stored as text
  released_at: column.text,
  artist: column.text,
  is_legendary: column.integer,  // boolean as 0/1
  produced_mana: column.text,    // JSON array stored as text
  layout: column.text,
  card_faces: column.text,       // JSON stored as text
  updated_at: column.text,
}, {
  indexes: {
    oracle_id: ['oracle_id'],
    name: ['name'],
    set_code: ['set_code'],
    name_collector: ['name', 'collector_number'],
    set_collector: ['set_code', 'collector_number'],
  }
});

// ============================================================
// User data (bidirectional sync)
// ============================================================

const profiles = new Table({
  is_anonymous: column.integer,
  username: column.text,
  display_name: column.text,
  avatar_url: column.text,
  created_at: column.text,
  updated_at: column.text,
});

const collection_folders = new Table({
  user_id: column.text,
  name: column.text,
  type: column.text,
  color: column.text,
  created_at: column.text,
  updated_at: column.text,
}, { indexes: { user_id: ['user_id'] } });

const collections = new Table({
  user_id: column.text,
  name: column.text,
  type: column.text,
  description: column.text,
  is_public: column.integer,
  share_token: column.text,
  folder_id: column.text,
  color: column.text,
  created_at: column.text,
  updated_at: column.text,
}, { indexes: { user_id: ['user_id'], folder_id: ['folder_id'] } });

const collection_cards = new Table({
  collection_id: column.text,
  card_id: column.text,
  condition: column.text,
  quantity_normal: column.integer,
  quantity_foil: column.integer,
  quantity_etched: column.integer,
  purchase_price: column.real,
  tags: column.text,             // JSON array stored as text
  notes: column.text,
  added_at: column.text,
  updated_at: column.text,
}, {
  indexes: {
    collection_id: ['collection_id'],
    card_id: ['card_id'],
  }
});

const deck_folders = new Table({
  user_id: column.text,
  name: column.text,
  parent_folder_id: column.text,
  sort_order: column.integer,
  created_at: column.text,
  updated_at: column.text,
}, { indexes: { user_id: ['user_id'] } });

const decks = new Table({
  user_id: column.text,
  folder_id: column.text,
  name: column.text,
  description: column.text,
  format: column.text,
  commander_card_id: column.text,
  companion_card_id: column.text,
  visibility: column.text,
  share_token: column.text,
  created_at: column.text,
  updated_at: column.text,
}, {
  indexes: {
    user_id: ['user_id'],
    folder_id: ['folder_id'],
  }
});

const deck_cards = new Table({
  deck_id: column.text,
  card_id: column.text,
  quantity: column.integer,
  board: column.text,
  custom_tag: column.text,
  added_at: column.text,
}, {
  indexes: {
    deck_id: ['deck_id'],
    card_id: ['card_id'],
  }
});

// ============================================================
// Catalog sync metadata (local-only)
// ============================================================
// Tracks the state of the separate catalog.db that lives alongside the
// PowerSync database. The actual catalog cards/sets data lives in that
// file — opened independently via react-native-quick-sqlite — not here.
// Keys: 'snapshot_version', 'last_sync_at'.

const catalog_meta = new Table({
  key: column.text,
  value: column.text,
  updated_at: column.text,
}, {
  localOnly: true,
  indexes: { key: ['key'] }
});

// ============================================================
// Scan history (user-scoped, synced)
// ============================================================

const scan_history = new Table({
  user_id: column.text,
  card_id: column.text,
  confidence: column.real,
  action_taken: column.text,
  target_id: column.text,
  scanned_at: column.text,
  image_uri: column.text,
}, { indexes: { user_id: ['user_id'] } });

// ============================================================
// Export schema
// ============================================================

export const AppSchema = new Schema({
  sets,
  cards,
  profiles,
  collection_folders,
  collections,
  collection_cards,
  deck_folders,
  decks,
  deck_cards,
  scan_history,
  catalog_meta,
});

export type Database = (typeof AppSchema)['types'];
export type CardRecord = Database['cards'];
export type SetRecord = Database['sets'];
export type CollectionFolderRecord = Database['collection_folders'];
export type CollectionRecord = Database['collections'];
export type CollectionCardRecord = Database['collection_cards'];
export type DeckRecord = Database['decks'];
export type DeckCardRecord = Database['deck_cards'];
export type CatalogMetaRecord = Database['catalog_meta'];
