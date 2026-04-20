import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { useQuery } from '@powersync/react';
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
import { Ionicons } from '@expo/vector-icons';
import { CardImage } from '../../src/components/collection/CardImage';
import { formatPrice } from '../../src/lib/scryfall';
import { serializeCardForNavigation } from '../../src/lib/cardDetail';
import { useLocalCardEntries, type EnrichedEntry } from '../../src/lib/hooks/useLocalCardEntries';
import { filterAndSort, deriveAvailableSets } from '../../src/lib/cardListUtils';
import { LanguageBadge } from '../../src/components/collection/LanguageBadge';
import { CollectionToolbar, type ViewMode, nextViewMode } from '../../src/components/collection/CollectionToolbar';
import { SortSheet, type SortOption } from '../../src/components/collection/SortSheet';
import { FilterSheet, type FilterState, EMPTY_FILTERS, countActiveFilters } from '../../src/components/collection/FilterSheet';
import { colors, shadows, spacing, fontSize, borderRadius } from '../../src/constants';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_GAP = spacing.sm;
const GRID_PADDING = spacing.lg;
const GRID_ITEM_WIDTH = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP) / 2;
const CARD_IMAGE_RATIO = 1.395;

const SEARCH_DEBOUNCE_MS = 200;
// How many rows to render up-front. Grows by the same amount on end-reached
// — pagination is free locally (just slicing in-memory) so we only do it to
// keep the initial FlatList mount cheap for 100k-row collections.
const INITIAL_VISIBLE = 200;
const PAGE_STEP = 200;

// Merged owned row — one entry per unique (card_id, condition, language),
// summing quantities across every binder the card appears in.
type OwnedRow = {
  card_id: string;
  condition: string;
  language: string;
  quantity_normal: number;
  quantity_foil: number;
  quantity_etched: number;
  added_at: string;
  cards: EnrichedEntry['cards'];
};

function rowKey(r: OwnedRow): string {
  return `${r.card_id}|${r.condition}|${(r.language ?? 'en').toLowerCase()}`;
}

function totalQty(r: OwnedRow): number {
  return r.quantity_normal + r.quantity_foil + r.quantity_etched;
}

export default function OwnedCardsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);

  // UI state
  const [viewMode, setViewMode] = useState<ViewMode>('grid-compact');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('added');
  const [sortAsc, setSortAsc] = useState(false);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [showSort, setShowSort] = useState(false);
  const [showFilter, setShowFilter] = useState(false);

  // Debounce the search box so the filterAndSort memo doesn't re-run on
  // every keystroke — still cheaper than the old RPC but a 100k-row
  // filter/sort is noticeable.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // "Owned" = every card in every binder. Lists are wishlists / trade
  // targets and never count toward Owned. We limit the useQuery scope to
  // binder ids directly so PowerSync watches only those rows.
  const binderIds = useQuery<{ id: string }>(
    `SELECT id FROM collections WHERE type = 'binder'`
  );
  const binderIdList = useMemo(
    () => (binderIds.data ?? []).map((b) => b.id),
    [binderIds.data]
  );

  const whereClause = useMemo(() => {
    if (binderIdList.length === 0) return { where: '0 = 1', params: [] as any[] };
    const placeholders = binderIdList.map(() => '?').join(',');
    return {
      where: `collection_id IN (${placeholders})`,
      params: binderIdList,
    };
  }, [binderIdList]);

  const { entries: rawEntries, isInitializing } = useLocalCardEntries(whereClause);

  // Merge duplicate (card_id, condition, language) across multiple binders
  // so one copy in Binder A + one copy in Binder B shows as a single row
  // with qty = 2. Matches the old `get_owned_cards_merged` RPC contract.
  const mergedRows = useMemo<OwnedRow[]>(() => {
    const byKey = new Map<string, OwnedRow>();
    for (const e of rawEntries) {
      const lang = (e.language ?? 'en').toLowerCase();
      const key = `${e.card_id}|${e.condition}|${lang}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.quantity_normal += e.quantity_normal;
        existing.quantity_foil += e.quantity_foil;
        existing.quantity_etched += e.quantity_etched;
        if (e.added_at > existing.added_at) existing.added_at = e.added_at;
      } else {
        byKey.set(key, {
          card_id: e.card_id,
          condition: e.condition,
          language: lang,
          quantity_normal: e.quantity_normal,
          quantity_foil: e.quantity_foil,
          quantity_etched: e.quantity_etched,
          added_at: e.added_at,
          cards: e.cards,
        });
      }
    }
    return Array.from(byKey.values());
  }, [rawEntries]);

  // filterAndSort expects the CardEntry shape (id, added_at, qty_*, cards).
  // Merged rows are already shaped that way except for `id` — we stamp the
  // rowKey in so keyExtractor can reuse it.
  const displayRows = useMemo(() => {
    const shaped = mergedRows.map((r) => ({
      id: rowKey(r),
      added_at: r.added_at,
      quantity_normal: r.quantity_normal,
      quantity_foil: r.quantity_foil,
      quantity_etched: r.quantity_etched,
      cards: r.cards,
      _owned: r,
    }));
    return filterAndSort(shaped, debouncedSearch, sortBy, sortAsc, filters);
  }, [mergedRows, debouncedSearch, sortBy, sortAsc, filters]);

  // Reset pagination when the filter/sort set changes so we don't display
  // a mismatched slice while the user is scrolling the previous result.
  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE);
  }, [debouncedSearch, sortBy, sortAsc, filters]);

  const visibleRows = useMemo(
    () => displayRows.slice(0, visibleCount).map((e) => (e as any)._owned as OwnedRow),
    [displayRows, visibleCount]
  );
  const hasMore = displayRows.length > visibleCount;

  const loadMore = useCallback(() => {
    if (!hasMore) return;
    setVisibleCount((c) => c + PAGE_STEP);
  }, [hasMore]);

  const onPullRefresh = useCallback(() => {
    setIsRefreshing(true);
    requestAnimationFrame(() => setIsRefreshing(false));
  }, []);

  function handleCardPress(row: OwnedRow) {
    const card = row.cards;
    if (!card.scryfall_id) return;
    router.push({
      pathname: '/card/[id]',
      params: {
        id: card.scryfall_id,
        cardJson: serializeCardForNavigation({
          scryfall_id: card.scryfall_id,
          oracle_id: card.oracle_id,
          name: card.name,
          set_name: card.set_name,
          set_code: card.set_code,
          collector_number: card.collector_number,
          rarity: card.rarity,
          type_line: card.type_line,
          cmc: card.cmc,
          is_legendary: card.is_legendary ?? 0,
          image_uri_small: card.image_uri_small,
          image_uri_normal: card.image_uri_normal,
          price_usd: card.price_usd,
          price_usd_foil: card.price_usd_foil,
          color_identity: card.color_identity,
          layout: card.layout,
          artist: card.artist,
        } as any),
      },
    });
  }

  // Available sets reflect what the user is currently looking at. With
  // local-first data we don't need a server RPC — same derivation as the
  // binder detail screen.
  const availableSets = useMemo(() => deriveAvailableSets(mergedRows as any), [mergedRows]);

  const isFilterActive =
    !!debouncedSearch || countActiveFilters(filters) > 0;

  // Stats: if no filters are active, sum the full merged set; otherwise
  // sum the filtered result so the header matches the list.
  const { totalCards, uniqueCards, displayValue } = useMemo(() => {
    const source = isFilterActive ? (displayRows as any as OwnedRow[]) : mergedRows;
    let cards = 0;
    let unique = 0;
    let value = 0;
    for (const r of source) {
      cards += r.quantity_normal + r.quantity_foil + r.quantity_etched;
      if (r.quantity_normal > 0) unique += 1;
      if (r.quantity_foil > 0) unique += 1;
      if (r.quantity_etched > 0) unique += 1;
      const c = r.cards;
      if (c?.price_usd) value += c.price_usd * r.quantity_normal;
      if (c?.price_usd_foil) value += c.price_usd_foil * r.quantity_foil;
      const ep = c?.price_usd_foil ?? c?.price_usd;
      if (ep) value += ep * r.quantity_etched;
    }
    return { totalCards: cards, uniqueCards: unique, displayValue: value };
  }, [mergedRows, displayRows, isFilterActive]);

  const isLoading = isInitializing;

  const isGrid = viewMode !== 'list';

  const refreshControl = (
    <RefreshControl
      refreshing={isRefreshing}
      onRefresh={onPullRefresh}
      tintColor={colors.primary}
    />
  );

  const emptyComponent = (
    <View style={styles.centered}>
      <View style={styles.emptyIcon}>
        <Ionicons name="library-outline" size={40} color={colors.textMuted} />
      </View>
      <Text style={styles.emptyTitle}>
        {debouncedSearch || countActiveFilters(filters) > 0
          ? 'No matches'
          : 'No owned cards'}
      </Text>
      <Text style={styles.emptySubtitle}>
        {debouncedSearch || countActiveFilters(filters) > 0
          ? 'Try a different search or clear filters'
          : 'Cards added to binders will appear here'}
      </Text>
    </View>
  );

  /* ── Grid compact ── */
  function renderGridCompactItem({ item }: { item: OwnedRow }) {
    const qty = totalQty(item);
    const card = item.cards;
    return (
      <TouchableOpacity
        style={styles.gridCompactCard}
        onPress={() => handleCardPress(item)}
        activeOpacity={0.7}
      >
        <CardImage
          uri={card.image_uri_normal || card.image_uri_small}
          style={styles.gridCompactImage}
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
  function renderGridItem({ item }: { item: OwnedRow }) {
    const qty = totalQty(item);
    const card = item.cards;
    return (
      <TouchableOpacity
        style={styles.gridCard}
        onPress={() => handleCardPress(item)}
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
              {formatPrice(card.price_usd?.toString())}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  /* ── List view ── */
  function renderListItem({ item }: { item: OwnedRow }) {
    const finishParts: string[] = [];
    if (item.quantity_normal > 0) finishParts.push('Normal');
    if (item.quantity_foil > 0) finishParts.push('Foil');
    if (item.quantity_etched > 0) finishParts.push('Etched Foil');
    const card = item.cards;

    return (
      <TouchableOpacity
        style={styles.listCard}
        onPress={() => handleCardPress(item)}
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
            {formatPrice(card.price_usd?.toString())}
          </Text>
          <Text style={styles.listQty}>x{totalQty(item)}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  const listFooter = hasMore ? (
    <View style={styles.footerLoader}>
      <ActivityIndicator color={colors.primary} />
    </View>
  ) : null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>Owned Cards</Text>
          <Text
            style={[styles.headerSubtitle, uniqueCards === 0 && { opacity: 0 }]}
          >
            {uniqueCards > 0
              ? `${totalCards.toLocaleString()} cards · ${uniqueCards.toLocaleString()} unique · $${displayValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : '\u00A0'}
          </Text>
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
          data={visibleRows}
          keyExtractor={rowKey}
          renderItem={viewMode === 'grid-compact' ? renderGridCompactItem : renderGridItem}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.gridList}
          refreshControl={refreshControl}
          ListEmptyComponent={emptyComponent}
          ListFooterComponent={listFooter}
          onEndReached={loadMore}
          onEndReachedThreshold={0.6}
          removeClippedSubviews
        />
      ) : (
        <FlatList
          key="list"
          data={visibleRows}
          keyExtractor={rowKey}
          renderItem={renderListItem}
          contentContainerStyle={styles.listList}
          refreshControl={refreshControl}
          ListEmptyComponent={emptyComponent}
          ListFooterComponent={listFooter}
          onEndReached={loadMore}
          onEndReachedThreshold={0.6}
          removeClippedSubviews
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

  /* ── Footer loader ── */
  footerLoader: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
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
