import { useState, useCallback, useEffect, useMemo } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/lib/supabase';
import { formatPrice } from '../../src/lib/scryfall';
import { serializeCardForNavigation } from '../../src/lib/cardDetail';
import { EditCollectionCardModal } from '../../src/components/EditCollectionCardModal';
import { CollectionActionSheet } from '../../src/components/collection/CollectionActionSheet';
import { EditCollectionInfoModal } from '../../src/components/collection/EditCollectionInfoModal';
import { MergeModal } from '../../src/components/collection/MergeModal';
import { ExportModal } from '../../src/components/collection/ExportModal';
import { ImportModal } from '../../src/components/collection/ImportModal';
import { FolderPickerModal } from '../../src/components/collection/FolderPickerModal';
import { useImportJob } from '../../src/components/collection/ImportJobProvider';
import { LanguageBadge } from '../../src/components/collection/LanguageBadge';
import { CollectionToolbar, type ViewMode, nextViewMode } from '../../src/components/collection/CollectionToolbar';
import { SortSheet, type SortOption } from '../../src/components/collection/SortSheet';
import { FilterSheet, type FilterState, EMPTY_FILTERS, countActiveFilters } from '../../src/components/collection/FilterSheet';
import { AddCardFAB } from '../../src/components/collection/AddCardFAB';
import {
  duplicateCollection,
  deleteCollection,
  emptyCollection,
  moveToFolder,
  fetchCollectionStats,
  fetchCollectionCardsStreamed,
  type CollectionType,
  type OwnedCardStats,
} from '../../src/lib/collections';
import { filterAndSort, deriveAvailableSets } from '../../src/lib/cardListUtils';
import { colors, shadows, spacing, fontSize, borderRadius } from '../../src/constants';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_GAP = spacing.sm;
const GRID_PADDING = spacing.lg;
const GRID_ITEM_WIDTH = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP) / 2;
const CARD_IMAGE_RATIO = 1.395; // MTG card ratio (h/w)

type CollectionEntry = {
  id: string;
  card_id: string;
  condition: string;
  language: string;
  added_at: string;
  quantity_normal: number;
  quantity_foil: number;
  quantity_etched: number;
  cards: {
    id: string;
    scryfall_id: string;
    oracle_id: string;
    name: string;
    set_name: string;
    set_code: string;
    collector_number: string;
    rarity: string;
    type_line: string;
    cmc: number | null;
    is_legendary: number | null;
    image_uri_small: string;
    image_uri_normal: string;
    price_usd: number | null;
    price_usd_foil: number | null;
    color_identity: string[];
  };
};

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
  const [entries, setEntries] = useState<CollectionEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [serverStats, setServerStats] = useState<OwnedCardStats | null>(null);
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

  // UI state
  const [viewMode, setViewMode] = useState<ViewMode>('grid-compact');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('added');
  const [sortAsc, setSortAsc] = useState(false);
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
  const [collectionColor, setCollectionColor] = useState<string | null>(null);
  const [collectionFolderId, setCollectionFolderId] = useState<string | null>(null);

  const fetchCards = useCallback(async () => {
    if (!id) return;
    // Reset so re-entries don't mix old and new rows visually.
    setEntries([]);
    try {
      // Stats + color/folder metadata first — cheap queries that paint
      // the header before the (potentially huge) entries list streams in.
      const [{ data: colData }, stats] = await Promise.all([
        supabase.from('collections').select('color, folder_id').eq('id', id).single(),
        fetchCollectionStats(id),
      ]);

      if (colData) {
        setCollectionColor(colData.color);
        setCollectionFolderId(colData.folder_id);
      }
      setServerStats(stats);

      const SELECT = `
        id, card_id, condition, language, added_at,
        quantity_normal, quantity_foil, quantity_etched,
        cards (
          id, scryfall_id, oracle_id, name, set_name, set_code,
          collector_number, rarity, type_line, mana_cost, cmc, is_legendary,
          image_uri_small, image_uri_normal,
          price_usd, price_usd_foil,
          color_identity, layout, card_faces, artist
        )
      `;

      // Streamed fetch: first 1k rows paint the FlatList immediately;
      // remaining pages fan out with concurrency 6 and append as they
      // land. On a 100k-row binder this is ~5 s end-to-end vs the
      // ~50 s the old serial pagination took.
      let firstPainted = false;
      await fetchCollectionCardsStreamed(id, SELECT, (page) => {
        setEntries((prev) => [...prev, ...(page as unknown as CollectionEntry[])]);
        if (!firstPainted) {
          firstPainted = true;
          setIsLoading(false);
        }
      });
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => { fetchCards(); }, [fetchCards])
  );

  // When a background import that targeted this collection finishes, pull
  // the fresh totals + entries so the UI reflects the new state without
  // requiring the user to pull-to-refresh.
  const { job } = useImportJob();
  useEffect(() => {
    if (!job) return;
    if (job.collectionId !== id) return;
    if (job.status !== 'completed') return;
    fetchCards();
  }, [job, id, fetchCards]);

  function handleCardPress(entry: CollectionEntry) {
    router.push({
      pathname: '/card/[id]',
      params: {
        id: entry.cards.scryfall_id,
        cardJson: serializeCardForNavigation(entry.cards as any),
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

  const isFiltered =
    searchQuery.trim().length > 0 || countActiveFilters(filters) > 0;

  const { totalCards, uniqueCards, displayValue } = useMemo(() => {
    // While filters are off the server-side stats are authoritative — they
    // reflect the full collection even before every page has streamed in.
    // The client-side sum would under-count until the final page lands.
    if (!isFiltered && serverStats) {
      return {
        totalCards: serverStats.total_cards,
        uniqueCards: serverStats.unique_cards,
        displayValue: serverStats.total_value,
      };
    }
    let cards = 0;
    let unique = 0;
    let value = 0;
    for (const e of displayEntries) {
      cards += getTotalQuantity(e);
      // Unique = distinct (print × finish) variants. One row with
      // qty_normal=1 + qty_foil=1 contributes 2 unique, not 1.
      if (e.quantity_normal > 0) unique += 1;
      if (e.quantity_foil > 0) unique += 1;
      if (e.quantity_etched > 0) unique += 1;
      const c = e.cards;
      if (c?.price_usd) value += c.price_usd * e.quantity_normal;
      if (c?.price_usd_foil) value += c.price_usd_foil * e.quantity_foil;
      const ep = c?.price_usd_foil ?? c?.price_usd;
      if (ep) value += ep * e.quantity_etched;
    }
    return { totalCards: cards, uniqueCards: unique, displayValue: value };
  }, [displayEntries, isFiltered, serverStats]);
  const isGrid = viewMode !== 'list';

  const refreshControl = (
    <RefreshControl
      refreshing={isRefreshing}
      onRefresh={() => { setIsRefreshing(true); fetchCards(); }}
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

  /* ── Grid compact: image only ── */
  function renderGridCompactItem({ item }: { item: CollectionEntry }) {
    const card = item.cards;
    if (!card) return null;
    const qty = getTotalQuantity(item);

    return (
      <TouchableOpacity
        style={styles.gridCompactCard}
        onPress={() => handleCardPress(item)}
        onLongPress={() => handleEditPress(item)}
        activeOpacity={0.7}
      >
        <Image
          source={{ uri: card.image_uri_normal || card.image_uri_small }}
          style={styles.gridCompactImage}
          contentFit="cover"
          transition={200}
        />
        <LanguageBadge language={item.language} style="corner" />
        {qty > 1 && (
          <View style={styles.qtyBadge}>
            <Text style={styles.qtyBadgeText}>x{qty}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  /* ── Grid with meta: image + name/set/price ── */
  function renderGridItem({ item }: { item: CollectionEntry }) {
    const card = item.cards;
    if (!card) return null;
    const qty = getTotalQuantity(item);

    return (
      <TouchableOpacity
        style={styles.gridCard}
        onPress={() => handleCardPress(item)}
        onLongPress={() => handleEditPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.gridImageWrap}>
          <Image
            source={{ uri: card.image_uri_normal || card.image_uri_small }}
            style={styles.gridImage}
            contentFit="cover"
            transition={200}
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
              {formatPrice(card.price_usd?.toString())}
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

    return (
      <TouchableOpacity
        style={styles.listCard}
        onPress={() => handleCardPress(item)}
        onLongPress={() => handleEditPress(item)}
        activeOpacity={0.6}
      >
        <Image
          source={{ uri: card.image_uri_small }}
          style={styles.listImage}
          contentFit="cover"
          transition={200}
        />
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
            {formatPrice(card.price_usd?.toString())}
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
          {uniqueCards > 0 && (
            <Text style={styles.headerSubtitle}>
              {totalCards.toLocaleString()} cards · {uniqueCards.toLocaleString()} unique · ${displayValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          )}
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

      {/* ── Content ── */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : isGrid ? (
        <FlatList
          key={viewMode}
          data={displayEntries}
          keyExtractor={(item) => item.id}
          renderItem={viewMode === 'grid-compact' ? renderGridCompactItem : renderGridItem}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.gridList}
          refreshControl={refreshControl}
          ListEmptyComponent={emptyComponent}
        />
      ) : (
        <FlatList
          key="list"
          data={displayEntries}
          keyExtractor={(item) => item.id}
          renderItem={renderListItem}
          contentContainerStyle={styles.listList}
          refreshControl={refreshControl}
          ListEmptyComponent={emptyComponent}
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
        onApply={setFilters}
        onReset={() => setFilters(EMPTY_FILTERS)}
        onClose={() => setShowFilter(false)}
      />

      {/* ── Existing modals ── */}
      <EditCollectionCardModal
        visible={editEntry !== null}
        entry={editEntry}
        onClose={() => setEditEntry(null)}
        onSaved={() => { setEditEntry(null); fetchCards(); }}
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
            moveToFolder(id!, null).then(() => { setCollectionFolderId(null); }).catch(() => {});
          } else if (key === 'duplicate') {
            duplicateCollection(id!).then(() => router.back()).catch(() => {});
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
                      .then(() => fetchCards())
                      .catch((err) => Alert.alert('Error', err?.message ?? 'Failed to empty'));
                  },
                },
              ]
            );
          } else if (key === 'delete') {
            Alert.alert('Delete?', 'This will delete all cards inside.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => {
                deleteCollection(id!).then(() => router.back()).catch(() => {});
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
        onSaved={() => { setShowEditInfo(false); fetchCards(); }}
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
        onImported={() => { setShowImport(false); fetchCards(); }}
      />

      <FolderPickerModal
        visible={showFolderPicker}
        collectionId={id!}
        collectionType={(collectionType as CollectionType) ?? 'binder'}
        onClose={() => setShowFolderPicker(false)}
        onMoved={() => { setShowFolderPicker(false); setCollectionFolderId('moved'); }}
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
