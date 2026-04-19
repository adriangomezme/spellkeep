import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
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
  type OwnedCardStats,
} from '../../src/lib/collections';
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

// Page size for server pagination. Small enough that the first page
// arrives fast (< 500 ms for typical users), large enough that scrolling
// doesn't paginate every few swipes.
const PAGE_SIZE = 100;
const SEARCH_DEBOUNCE_MS = 300;

// One row as returned by get_owned_cards_merged. Flat shape — no nested
// `cards` join like collection_cards does — so we don't lose render
// fidelity but don't hold duplicated per-binder rows either.
type OwnedRow = {
  card_id: string;
  condition: string;
  language: string;
  quantity_normal: number;
  quantity_foil: number;
  quantity_etched: number;
  added_at: string;
  scryfall_id: string;
  oracle_id: string;
  name: string;
  set_name: string;
  set_code: string;
  collector_number: string;
  rarity: string;
  type_line: string;
  cmc: number | null;
  is_legendary: boolean;
  image_uri_small: string | null;
  image_uri_normal: string | null;
  price_usd: number | null;
  price_usd_foil: number | null;
  color_identity: string[] | null;
  layout: string | null;
  artist: string | null;
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

  const [rows, setRows] = useState<OwnedRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [serverStats, setServerStats] = useState<OwnedCardStats | null>(null);

  // UI state
  const [viewMode, setViewMode] = useState<ViewMode>('grid-compact');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('added');
  const [sortAsc, setSortAsc] = useState(false);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [showSort, setShowSort] = useState(false);
  const [showFilter, setShowFilter] = useState(false);

  // Debounce the search box so keystrokes don't each hit the server.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Token so a slow in-flight request can't clobber a newer one.
  const requestTokenRef = useRef(0);

  // Current request parameters — memoised so the fetcher closures are
  // stable and we can compare without deep-equality logic.
  const queryParams = useMemo(
    () => ({
      search: debouncedSearch || null,
      sort: sortBy,
      ascending: sortAsc,
      filters,
    }),
    [debouncedSearch, sortBy, sortAsc, filters]
  );

  async function runQuery(offset: number): Promise<OwnedRow[]> {
    const { data, error } = await supabase.rpc('get_owned_cards_merged', {
      p_search: queryParams.search,
      p_sort: queryParams.sort,
      p_ascending: queryParams.ascending,
      p_filters: queryParams.filters as any,
      p_limit: PAGE_SIZE,
      p_offset: offset,
    });
    if (error) throw new Error(error.message);
    return (data ?? []) as OwnedRow[];
  }

  const loadFirstPage = useCallback(async () => {
    const token = ++requestTokenRef.current;
    setIsLoading(true);
    setHasMore(true);
    try {
      const page = await runQuery(0);
      if (token !== requestTokenRef.current) return;
      setRows(page);
      setHasMore(page.length === PAGE_SIZE);
    } catch (err) {
      if (token !== requestTokenRef.current) return;
      console.error('Owned fetch error:', err);
      setRows([]);
      setHasMore(false);
    } finally {
      if (token === requestTokenRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryParams]);

  const loadMore = useCallback(async () => {
    if (!hasMore || isFetchingMore || isLoading) return;
    const token = requestTokenRef.current;
    setIsFetchingMore(true);
    try {
      const page = await runQuery(rows.length);
      if (token !== requestTokenRef.current) return;
      setRows((prev) => [...prev, ...page]);
      setHasMore(page.length === PAGE_SIZE);
    } catch (err) {
      console.error('Owned fetch more error:', err);
    } finally {
      if (token === requestTokenRef.current) {
        setIsFetchingMore(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, isFetchingMore, isLoading, rows.length, queryParams]);

  const fetchStats = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const stats = await fetchOwnedCardStats(user.id);
      setServerStats(stats);
    } catch (err) {
      // Stats error shouldn't block the list.
      console.error('Owned stats error:', err);
    }
  }, []);

  // Any change in search/sort/filter resets pagination and refetches
  // page 0. Stats are refetched independently so the header stays
  // correct regardless of the filter.
  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  useFocusEffect(
    useCallback(() => {
      fetchStats();
      loadFirstPage();
    }, [fetchStats, loadFirstPage])
  );

  const onPullRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchStats();
    loadFirstPage();
  }, [fetchStats, loadFirstPage]);

  function handleCardPress(row: OwnedRow) {
    router.push({
      pathname: '/card/[id]',
      params: {
        id: row.scryfall_id,
        cardJson: serializeCardForNavigation({
          scryfall_id: row.scryfall_id,
          oracle_id: row.oracle_id,
          name: row.name,
          set_name: row.set_name,
          set_code: row.set_code,
          collector_number: row.collector_number,
          rarity: row.rarity,
          type_line: row.type_line,
          cmc: row.cmc,
          is_legendary: row.is_legendary ? 1 : 0,
          image_uri_small: row.image_uri_small ?? '',
          image_uri_normal: row.image_uri_normal ?? '',
          price_usd: row.price_usd,
          price_usd_foil: row.price_usd_foil,
          color_identity: row.color_identity ?? [],
          layout: row.layout ?? undefined,
          artist: row.artist ?? undefined,
        } as any),
      },
    });
  }

  // Available sets from currently loaded page — good enough for the
  // filter sheet's UX; when the user filters by set, the server fetches
  // a fresh result set for the full collection.
  const availableSets = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();
    for (const r of rows) {
      const existing = map.get(r.set_code);
      if (existing) existing.count++;
      else map.set(r.set_code, { name: r.set_name, count: 1 });
    }
    return Array.from(map.entries())
      .map(([code, { name, count }]) => ({ code, name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  // Header stats: the server RPCs give us the overall totals across the
  // entire collection (not filtered). When the user has an active
  // search / filter the totals below the title still show the full-
  // collection numbers — the filter only narrows the list beneath.
  const totalCards = serverStats?.total_cards ?? 0;
  const uniqueCards = serverStats?.unique_cards ?? 0;
  const displayValue = serverStats?.total_value ?? 0;

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
    return (
      <TouchableOpacity
        style={styles.gridCompactCard}
        onPress={() => handleCardPress(item)}
        activeOpacity={0.7}
      >
        <Image
          source={{ uri: item.image_uri_normal || item.image_uri_small || undefined }}
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
  function renderGridItem({ item }: { item: OwnedRow }) {
    const qty = totalQty(item);
    return (
      <TouchableOpacity
        style={styles.gridCard}
        onPress={() => handleCardPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.gridImageWrap}>
          <Image
            source={{ uri: item.image_uri_normal || item.image_uri_small || undefined }}
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
          <Text style={styles.gridName} numberOfLines={1}>{item.name}</Text>
          <View style={styles.gridBottom}>
            <Text style={styles.gridSet} numberOfLines={1}>
              {item.set_code.toUpperCase()} #{item.collector_number}
            </Text>
            <Text style={styles.gridPrice}>
              {formatPrice(item.price_usd?.toString())}
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

    return (
      <TouchableOpacity
        style={styles.listCard}
        onPress={() => handleCardPress(item)}
        activeOpacity={0.6}
      >
        <Image
          source={{ uri: item.image_uri_small || undefined }}
          style={styles.listImage}
          contentFit="cover"
          transition={200}
        />
        <View style={styles.listInfo}>
          <Text style={styles.listName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.listSet} numberOfLines={1}>
            {item.set_name} #{item.collector_number}
          </Text>
          <Text style={styles.listLang}>{(item.language ?? 'en').toUpperCase()}</Text>
          <Text style={styles.listFinish}>{finishParts.join(', ')}</Text>
        </View>
        <View style={styles.listRight}>
          <Text style={styles.listPrice}>
            {formatPrice(item.price_usd?.toString())}
          </Text>
          <Text style={styles.listQty}>x{totalQty(item)}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  const listFooter = isFetchingMore ? (
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
      {isLoading && rows.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : isGrid ? (
        <FlatList
          key={viewMode}
          data={rows}
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
          data={rows}
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
