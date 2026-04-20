import { useState, useCallback, useMemo } from 'react';
import { useQuery } from '@powersync/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CardImage } from '../../src/components/collection/CardImage';
import { formatPrice } from '../../src/lib/scryfall';
import { serializeCardForNavigation } from '../../src/lib/cardDetail';
import { EditCollectionCardModal } from '../../src/components/EditCollectionCardModal';
import { CollectionActionSheet } from '../../src/components/collection/CollectionActionSheet';
import { EditCollectionInfoModal } from '../../src/components/collection/EditCollectionInfoModal';
import { MergeModal } from '../../src/components/collection/MergeModal';
import { ExportModal } from '../../src/components/collection/ExportModal';
import { ImportModal } from '../../src/components/collection/ImportModal';
import { FolderPickerModal } from '../../src/components/collection/FolderPickerModal';
import { LanguageBadge } from '../../src/components/collection/LanguageBadge';
import { CollectionToolbar, nextViewMode } from '../../src/components/collection/CollectionToolbar';
import { SortSheet } from '../../src/components/collection/SortSheet';
import { FilterSheet, type FilterState, EMPTY_FILTERS, countActiveFilters } from '../../src/components/collection/FilterSheet';
import { AddCardFAB } from '../../src/components/collection/AddCardFAB';
import {
  duplicateCollection,
  emptyCollection,
  type CollectionType,
} from '../../src/lib/collections';
import {
  deleteCollectionLocal,
  moveToFolderLocal,
} from '../../src/lib/collections.local';
import { useLocalCardEntries, type EnrichedEntry } from '../../src/lib/hooks/useLocalCardEntries';
import { useCachedCollectionStats, useWriteCollectionStatsCache } from '../../src/lib/hooks/useCollectionStatsCache';
import { useCollectionViewPrefs } from '../../src/lib/hooks/useCollectionViewPrefs';
import { filterAndSort, deriveAvailableSets, deriveAvailableLanguages, displayPriceForRow } from '../../src/lib/cardListUtils';
import { colors, shadows, spacing, fontSize, borderRadius } from '../../src/constants';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_GAP = spacing.sm;
const GRID_PADDING = spacing.lg;
const GRID_ITEM_WIDTH = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP) / 2;
const CARD_IMAGE_RATIO = 1.395; // MTG card ratio (h/w)

type CollectionEntry = EnrichedEntry;

function getTotalQuantity(entry: CollectionEntry): number {
  return entry.quantity_normal + entry.quantity_foil + entry.quantity_etched;
}

function getFinishLabel(entry: CollectionEntry): string {
  const parts: string[] = [];
  if (entry.quantity_normal > 0) parts.push(`${entry.quantity_normal}x`);
  if (entry.quantity_foil > 0) parts.push(`${entry.quantity_foil}x Foil`);
  if (entry.quantity_etched > 0) parts.push(`${entry.quantity_etched}x Etched`);
  return parts.join(', ');
}

export default function CollectionDetailScreen() {
  const { id, name: collectionName, type: collectionType } = useLocalSearchParams<{ id: string; name: string; type?: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [editEntry, setEditEntry] = useState<{
    id: string;
    condition: string;
    quantity_normal: number;
    quantity_foil: number;
    quantity_etched: number;
    cardName: string;
    setName: string;
    collectorNumber: string;
  } | null>(null);

  // UI state — view mode + sort are persisted per device (AsyncStorage)
  // via the shared hook so flipping them in any binder carries over to
  // the next open. Filters are intentionally NOT persisted.
  const { viewMode, sortBy, sortAsc, setViewMode, setSortBy, setSortAsc } =
    useCollectionViewPrefs();
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [showSort, setShowSort] = useState(false);
  const [showFilter, setShowFilter] = useState(false);

  // Action modals
  const [showActions, setShowActions] = useState(false);
  const [showEditInfo, setShowEditInfo] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showFolderPicker, setShowFolderPicker] = useState(false);

  // Watch the collection row itself for color / folder_id. Local query so
  // rename/move/color-edit propagate without a refetch.
  const collectionRow = useQuery<{ color: string | null; folder_id: string | null }>(
    `SELECT color, folder_id FROM collections WHERE id = ? LIMIT 1`,
    [id]
  );
  const collectionColor = collectionRow.data?.[0]?.color ?? null;
  const collectionFolderId = collectionRow.data?.[0]?.folder_id ?? null;

  // Local-first entries. useQuery watches collection_cards WHERE
  // collection_id = ?, and the hook enriches each row against catalog.db
  // (price overrides layered on top). Reads are instant from SQLite;
  // writes via collections.local.ts mutate the same table and propagate
  // through this hook automatically.
  const { entries, isReady } = useLocalCardEntries({
    where: `collection_id = ?`,
    params: [id],
  });

  // Persistent cache so the `$X.XX` segment paints on the very first
  // frame instead of waiting for the catalog enrichment to finish.
  const cachedStats = useCachedCollectionStats(id);

  function handleCardPress(entry: CollectionEntry) {
    router.push({
      pathname: '/card/[id]',
      params: {
        id: entry.cards.scryfall_id,
        cardJson: serializeCardForNavigation(entry.cards as any),
        // Stickily pre-select this binder/list as the default destination
        // when the user taps "+ Add to collection" from the card detail
        // that opened via this screen.
        fromCollectionId: id!,
      },
    });
  }

  function handleEditPress(entry: CollectionEntry) {
    const card = entry.cards;
    setEditEntry({
      id: entry.id,
      condition: entry.condition,
      quantity_normal: entry.quantity_normal,
      quantity_foil: entry.quantity_foil,
      quantity_etched: entry.quantity_etched,
      cardName: card.name,
      setName: card.set_name,
      collectorNumber: card.collector_number,
    });
  }

  const displayEntries = useMemo(
    () => filterAndSort(entries, searchQuery, sortBy, sortAsc, filters),
    [entries, searchQuery, sortBy, sortAsc, filters],
  );

  const availableSets = useMemo(() => deriveAvailableSets(entries), [entries]);
  const availableLanguages = useMemo(() => deriveAvailableLanguages(entries), [entries]);

  const isFiltered =
    searchQuery.trim().length > 0 || countActiveFilters(filters) > 0;

  // Live stats computed from the (filtered or full) entries. With
  // local-first reads we always have every row; the sum is always
  // consistent with what the list renders below.
  const liveStats = useMemo(() => {
    const source = isFiltered ? displayEntries : entries;
    let cards = 0;
    let unique = 0;
    let value = 0;
    for (const e of source) {
      cards += getTotalQuantity(e);
      if (e.quantity_normal > 0) unique += 1;
      if (e.quantity_foil > 0) unique += 1;
      if (e.quantity_etched > 0) unique += 1;
      const c = e.cards;
      if (c?.price_usd) value += c.price_usd * e.quantity_normal;
      if (c?.price_usd_foil) value += c.price_usd_foil * e.quantity_foil;
      // Etched prefers its own price; falls back to foil if catalog
      // only knows the foil number (e.g. Scryfall grouped them).
      const ep = c?.price_usd_etched ?? c?.price_usd_foil;
      if (ep) value += ep * e.quantity_etched;
    }
    return { totalCards: cards, uniqueCards: unique, displayValue: value };
  }, [entries, displayEntries, isFiltered]);

  // Persist the full (unfiltered) stats back to cache once enrichment
  // finishes, so the next open paints the same numbers instantly.
  useWriteCollectionStatsCache(id, isReady && !isFiltered, {
    card_count: liveStats.totalCards,
    unique_cards: liveStats.uniqueCards,
    total_value: liveStats.displayValue,
  });

  // Header stats: prefer live values when enrichment has already
  // populated them (value > 0 signals "I have prices"); otherwise fall
  // back to the persistent cache from the last open so the header
  // doesn't flash `$0.00` before prices resolve. Counts come straight
  // from liveStats — those are SUM over a single SQLite table and are
  // always immediate.
  const totalCards = liveStats.totalCards;
  const uniqueCards = liveStats.uniqueCards;
  const displayValue =
    liveStats.displayValue > 0
      ? liveStats.displayValue
      : (!isFiltered && cachedStats ? cachedStats.total_value : 0);
  const isGrid = viewMode !== 'list';

  // Pull-to-refresh is now a cosmetic gesture — the data is always live
  // from the local DB. We flash the indicator for a frame so the
  // interaction still feels responsive, then release.
  const handlePullRefresh = useCallback(() => {
    setIsRefreshing(true);
    requestAnimationFrame(() => setIsRefreshing(false));
  }, []);

  const refreshControl = (
    <RefreshControl
      refreshing={isRefreshing}
      onRefresh={handlePullRefresh}
      tintColor={colors.primary}
    />
  );

  const emptyComponent = (
    <View style={styles.centered}>
      <View style={styles.emptyIcon}>
        <Ionicons name="albums-outline" size={40} color={colors.textMuted} />
      </View>
      <Text style={styles.emptyTitle}>No cards yet</Text>
      <Text style={styles.emptySubtitle}>
        Tap + to add cards via Scan, Search, or Import
      </Text>
    </View>
  );

  /* ── Grid compact: pure card, no overlays ── */
  function renderGridCompactItem({ item }: { item: CollectionEntry }) {
    const card = item.cards;
    if (!card) return null;

    return (
      <TouchableOpacity
        style={styles.gridCompactCard}
        onPress={() => handleCardPress(item)}
        onLongPress={() => handleEditPress(item)}
        activeOpacity={0.7}
      >
        <CardImage
          uri={card.image_uri_normal || card.image_uri_small}
          style={styles.gridCompactImage}
        />
      </TouchableOpacity>
    );
  }

  /* ── Grid with meta: image + name/set/price ── */
  function renderGridItem({ item }: { item: CollectionEntry }) {
    const card = item.cards;
    if (!card) return null;
    const qty = getTotalQuantity(item);
    const rowPrice = displayPriceForRow(
      item.quantity_normal,
      item.quantity_foil,
      item.quantity_etched,
      card.price_usd,
      card.price_usd_foil,
      card.price_usd_etched
    );

    return (
      <TouchableOpacity
        style={styles.gridCard}
        onPress={() => handleCardPress(item)}
        onLongPress={() => handleEditPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.gridImageWrap}>
          <CardImage
            uri={card.image_uri_normal || card.image_uri_small}
            style={styles.gridImage}
          />
          <LanguageBadge language={item.language} style="corner" />
          {qty > 1 && (
            <View style={styles.qtyBadge}>
              <Text style={styles.qtyBadgeText}>x{qty}</Text>
            </View>
          )}
        </View>
        <View style={styles.gridMeta}>
          <Text style={styles.gridName} numberOfLines={1}>{card.name}</Text>
          <View style={styles.gridBottom}>
            <Text style={styles.gridSet} numberOfLines={1}>
              {card.set_code.toUpperCase()} #{card.collector_number}
            </Text>
            <Text style={styles.gridPrice}>
              {formatPrice(rowPrice != null ? rowPrice.toString() : undefined)}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  /* ── List view ── */
  function renderListItem({ item }: { item: CollectionEntry }) {
    const card = item.cards;
    if (!card) return null;

    const finishParts: string[] = [];
    if (item.quantity_normal > 0) finishParts.push('Normal');
    if (item.quantity_foil > 0) finishParts.push('Foil');
    if (item.quantity_etched > 0) finishParts.push('Etched Foil');

    const rowPrice = displayPriceForRow(
      item.quantity_normal,
      item.quantity_foil,
      item.quantity_etched,
      card.price_usd,
      card.price_usd_foil,
      card.price_usd_etched
    );

    return (
      <TouchableOpacity
        style={styles.listCard}
        onPress={() => handleCardPress(item)}
        onLongPress={() => handleEditPress(item)}
        activeOpacity={0.6}
      >
        <CardImage uri={card.image_uri_small} style={styles.listImage} />
        <View style={styles.listInfo}>
          <Text style={styles.listName} numberOfLines={1}>{card.name}</Text>
          <Text style={styles.listSet} numberOfLines={1}>
            {card.set_name} #{card.collector_number}
          </Text>
          <Text style={styles.listLang}>{(item.language ?? 'en').toUpperCase()}</Text>
          <Text style={styles.listFinish}>{finishParts.join(', ')}</Text>
        </View>
        <View style={styles.listRight}>
          <Text style={styles.listPrice}>
            {formatPrice(rowPrice != null ? rowPrice.toString() : undefined)}
          </Text>
          <Text style={styles.listQty}>x{getTotalQuantity(item)}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.title} numberOfLines={1}>{collectionName ?? 'Collection'}</Text>
          {/* Always render the subtitle so the header height is
              reserved from the first frame. Before the stats resolve
              we use opacity:0 with a placeholder string so the slot
              takes its real vertical space but shows no visible
              character — the numbers fade in cleanly when they land. */}
          <Text
            style={[styles.headerSubtitle, uniqueCards === 0 && { opacity: 0 }]}
          >
            {uniqueCards > 0
              ? `${totalCards.toLocaleString()} cards · ${uniqueCards.toLocaleString()} unique${displayValue > 0 ? ` · $${displayValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''}`
              : '\u00A0'}
          </Text>
        </View>
        <TouchableOpacity onPress={() => setShowActions(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="ellipsis-horizontal" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* ── Toolbar ── */}
      <CollectionToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        viewMode={viewMode}
        onToggleView={() => setViewMode(nextViewMode(viewMode))}
        onSortPress={() => setShowSort(true)}
        onFilterPress={() => setShowFilter(true)}
        activeFilters={countActiveFilters(filters)}
      />

      {/* ── Content ──
          We render the list immediately even before enrichment lands:
          rows carry placeholder card data (CardImage falls back to the
          bundled placeholder) so the grid takes the right shape and size
          from the first frame. Names, prices and real images fill in as
          the catalog chunks resolve. */}
      {isGrid ? (
        <FlatList
          key={viewMode}
          data={displayEntries}
          keyExtractor={(item) => item.id}
          renderItem={viewMode === 'grid-compact' ? renderGridCompactItem : renderGridItem}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.gridList}
          refreshControl={refreshControl}
          ListEmptyComponent={isReady ? emptyComponent : null}
        />
      ) : (
        <FlatList
          key="list"
          data={displayEntries}
          keyExtractor={(item) => item.id}
          renderItem={renderListItem}
          contentContainerStyle={styles.listList}
          refreshControl={refreshControl}
          ListEmptyComponent={isReady ? emptyComponent : null}
        />
      )}

      {/* ── FAB ── */}
      <AddCardFAB
        onScan={() => console.log('TODO: Scan')}
        onSearch={() => console.log('TODO: Search')}
        onImport={() => setShowImport(true)}
      />

      {/* ── Sort & Filter sheets ── */}
      <SortSheet
        visible={showSort}
        currentSort={sortBy}
        ascending={sortAsc}
        onSelect={(s) => { setSortBy(s); setShowSort(false); }}
        onToggleDirection={() => setSortAsc(!sortAsc)}
        onClose={() => setShowSort(false)}
      />

      <FilterSheet
        visible={showFilter}
        filters={filters}
        availableSets={availableSets}
        availableLanguages={availableLanguages}
        onApply={setFilters}
        onReset={() => setFilters(EMPTY_FILTERS)}
        onClose={() => setShowFilter(false)}
      />

      {/* ── Existing modals ── */}
      <EditCollectionCardModal
        visible={editEntry !== null}
        entry={editEntry}
        onClose={() => setEditEntry(null)}
        onSaved={() => { setEditEntry(null); }}
      />

      <CollectionActionSheet
        visible={showActions && !showEditInfo && !showMerge && !showExport && !showImport && !showFolderPicker}
        itemName={collectionName ?? ''}
        itemType={(collectionType as 'binder' | 'list') ?? 'binder'}
        inFolder={!!collectionFolderId}
        onAction={(key) => {
          setShowActions(false);
          if (key === 'edit') setShowEditInfo(true);
          else if (key === 'merge') setShowMerge(true);
          else if (key === 'import') setShowImport(true);
          else if (key === 'export') setShowExport(true);
          else if (key === 'move-to-folder') setShowFolderPicker(true);
          else if (key === 'remove-from-folder') {
            moveToFolderLocal(id!, null).catch(() => {});
          } else if (key === 'duplicate') {
            duplicateCollection(id!)
              .then(() => router.back())
              .catch((err) => Alert.alert('Duplicate failed', err?.message ?? 'Unknown error'));
          } else if (key === 'empty') {
            const label = (collectionType as 'binder' | 'list') === 'list' ? 'list' : 'binder';
            Alert.alert(
              `Empty this ${label}?`,
              `All cards will be removed. The ${label} itself stays with its name and settings.`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Empty',
                  style: 'destructive',
                  onPress: () => {
                    emptyCollection(id!)
                      .catch((err) => Alert.alert('Error', err?.message ?? 'Failed to empty'));
                  },
                },
              ]
            );
          } else if (key === 'delete') {
            Alert.alert('Delete?', 'This will delete all cards inside.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => {
                deleteCollectionLocal(id!).then(() => router.back()).catch(() => {});
              }},
            ]);
          }
        }}
        onClose={() => setShowActions(false)}
      />

      <EditCollectionInfoModal
        visible={showEditInfo}
        itemId={id!}
        itemName={collectionName ?? ''}
        itemColor={collectionColor}
        itemType={(collectionType as 'binder' | 'list') ?? 'binder'}
        onClose={() => setShowEditInfo(false)}
        onSaved={() => { setShowEditInfo(false); }}
      />

      {id && (
        <MergeModal
          visible={showMerge}
          sourceId={id}
          sourceName={collectionName ?? ''}
          sourceType={(collectionType as CollectionType) ?? 'binder'}
          onClose={() => setShowMerge(false)}
          onMerged={() => { setShowMerge(false); router.back(); }}
        />
      )}

      <ExportModal
        visible={showExport}
        collectionId={id!}
        collectionName={collectionName ?? ''}
        onClose={() => setShowExport(false)}
      />

      <ImportModal
        visible={showImport}
        collectionId={id!}
        collectionName={collectionName ?? ''}
        onClose={() => setShowImport(false)}
        onImported={() => setShowImport(false)}
      />

      <FolderPickerModal
        visible={showFolderPicker}
        collectionId={id!}
        collectionType={(collectionType as CollectionType) ?? 'binder'}
        onClose={() => setShowFolderPicker(false)}
        onMoved={() => setShowFolderPicker(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  /* ── Header ── */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 1,
  },

  /* ── Grid shared ── */
  gridList: {
    paddingHorizontal: GRID_PADDING,
    paddingTop: spacing.sm,
    paddingBottom: 100,
  },
  gridRow: {
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },

  /* ── Grid compact (image only) ── */
  gridCompactCard: {
    width: GRID_ITEM_WIDTH,
    aspectRatio: 1 / CARD_IMAGE_RATIO,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceSecondary,
  },
  gridCompactImage: {
    width: '100%',
    height: '100%',
  },

  /* ── Grid with meta ── */
  gridCard: {
    width: GRID_ITEM_WIDTH,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    ...shadows.sm,
  },
  gridImageWrap: {
    width: '100%',
    aspectRatio: 1 / CARD_IMAGE_RATIO,
    backgroundColor: colors.surfaceSecondary,
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  qtyBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  qtyBadgeText: {
    color: '#FFF',
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  gridMeta: {
    padding: spacing.sm,
  },
  gridName: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
    lineHeight: 16,
  },
  gridBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 3,
  },
  gridSet: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    flex: 1,
  },
  gridPrice: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },

  /* ── List view ── */
  listList: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: 100,
  },
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.sm + 2,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  listImage: {
    width: 79,
    height: 110,
    borderRadius: borderRadius.sm / 2,
    backgroundColor: colors.surfaceSecondary,
  },
  listInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  listName: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  listSet: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 1,
  },
  listLang: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  listFinish: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  listRight: {
    alignItems: 'flex-end',
    marginLeft: spacing.sm,
  },
  listPrice: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '400',
  },
  listQty: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginTop: 2,
  },

  /* ── Empty / Loading ── */
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginHorizontal: spacing.xl,
  },
});
