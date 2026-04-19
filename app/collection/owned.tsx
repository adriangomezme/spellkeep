import { useState, useCallback, useMemo } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/lib/supabase';
import { formatPrice } from '../../src/lib/scryfall';
import { serializeCardForNavigation } from '../../src/lib/cardDetail';
import {
  fetchOwnedCardStats,
  fetchCollectionCardsInStreamed,
  type OwnedCardStats,
} from '../../src/lib/collections';
import { EditCollectionCardModal } from '../../src/components/EditCollectionCardModal';
import { LanguageBadge } from '../../src/components/collection/LanguageBadge';
import { CollectionToolbar, type ViewMode, nextViewMode } from '../../src/components/collection/CollectionToolbar';
import { SortSheet, type SortOption } from '../../src/components/collection/SortSheet';
import { FilterSheet, type FilterState, EMPTY_FILTERS, countActiveFilters } from '../../src/components/collection/FilterSheet';
import { filterAndSort, deriveAvailableSets } from '../../src/lib/cardListUtils';
import { colors, shadows, spacing, fontSize, borderRadius } from '../../src/constants';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_GAP = spacing.sm;
const GRID_PADDING = spacing.lg;
const GRID_ITEM_WIDTH = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP) / 2;
const CARD_IMAGE_RATIO = 1.395;

type CollectionEntry = {
  id: string;
  card_id: string;
  condition: string;
  language: string;
  added_at: string;
  quantity_normal: number;
  quantity_foil: number;
  quantity_etched: number;
  collection_id: string;
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

export default function OwnedCardsScreen() {
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

  const fetchOwnedCards = useCallback(async () => {
    setEntries([]);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Resolve binders + aggregate stats first — cheap queries so the
      // header paints immediately.
      const [{ data: binders }, stats] = await Promise.all([
        supabase
          .from('collections')
          .select('id')
          .eq('user_id', user.id)
          .eq('type', 'binder'),
        fetchOwnedCardStats(user.id),
      ]);
      setServerStats(stats);

      const binderIds = (binders ?? []).map((b) => b.id);
      if (binderIds.length === 0) {
        setIsLoading(false);
        return;
      }

      // Same slimmed select as the binder detail view. card_faces and
      // mana_cost stay off the list query to cut payload bytes — detail
      // refetches them on open.
      const SELECT = `
        id, card_id, condition, language, added_at, collection_id,
        quantity_normal, quantity_foil, quantity_etched,
        cards (
          id, scryfall_id, oracle_id, name, set_name, set_code,
          collector_number, rarity, type_line, cmc, is_legendary,
          image_uri_small, image_uri_normal,
          price_usd, price_usd_foil,
          color_identity, layout, artist
        )
      `;

      let firstPainted = false;
      await fetchCollectionCardsInStreamed(binderIds, SELECT, (page) => {
        setEntries((prev) => [...prev, ...(page as unknown as CollectionEntry[])]);
        if (!firstPainted) {
          firstPainted = true;
          setIsLoading(false);
        }
      }, { initialPageSize: 100, concurrency: 8 });
    } catch (err) {
      console.error('Owned fetch error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => { fetchOwnedCards(); }, [fetchOwnedCards])
  );

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
      onRefresh={() => { setIsRefreshing(true); fetchOwnedCards(); }}
      tintColor={colors.primary}
    />
  );

  const emptyComponent = (
    <View style={styles.centered}>
      <View style={styles.emptyIcon}>
        <Ionicons name="library-outline" size={40} color={colors.textMuted} />
      </View>
      <Text style={styles.emptyTitle}>No owned cards</Text>
      <Text style={styles.emptySubtitle}>
        Cards added to binders will appear here
      </Text>
    </View>
  );

  /* ── Grid compact ── */
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

  /* ── Grid with meta ── */
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
          <Text style={styles.title}>Owned Cards</Text>
          {uniqueCards > 0 && (
            <Text style={styles.headerSubtitle}>
              {totalCards.toLocaleString()} cards · {uniqueCards.toLocaleString()} unique · ${displayValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          )}
        </View>
        <View style={{ width: 28 }} />
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

      {/* ── Edit card modal ── */}
      <EditCollectionCardModal
        visible={editEntry !== null}
        entry={editEntry}
        onClose={() => setEditEntry(null)}
        onSaved={() => { setEditEntry(null); fetchOwnedCards(); }}
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

  /* ── Grid compact ── */
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
