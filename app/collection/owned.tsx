import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'expo-router';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
} from 'react-native';
import Animated, {
  interpolate,
  Extrapolation,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { CardImage } from '../../src/components/collection/CardImage';
import { formatPrice } from '../../src/lib/scryfall';
import { serializeCardForNavigation } from '../../src/lib/cardDetail';
import { useLocalCardEntries, type EnrichedEntry } from '../../src/lib/hooks/useLocalCardEntries';
import { useCachedCollectionStats, useWriteCollectionStatsCache } from '../../src/lib/hooks/useCollectionStatsCache';
import { useCollectionViewPrefs } from '../../src/lib/hooks/useCollectionViewPrefs';

// Sentinel id for the aggregate "Owned" view since it spans multiple
// binders. Uses a fixed UUID-shaped string so PowerSync is happy with
// the id column type.
const OWNED_CACHE_ID = '00000000-0000-0000-0000-000000006177';
import { filterAndSort, deriveAvailableSets, deriveAvailableLanguages, displayPriceForRow } from '../../src/lib/cardListUtils';
import { LanguageBadge } from '../../src/components/collection/LanguageBadge';
import { CollectionToolbar, nextViewMode, toolbarHeightFor } from '../../src/components/collection/CollectionToolbar';
import { SortSheet } from '../../src/components/collection/SortSheet';
import { FilterSheet, type FilterState, EMPTY_FILTERS, countActiveFilters } from '../../src/components/collection/FilterSheet';
import { colors, shadows, spacing, fontSize, borderRadius } from '../../src/constants';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_GAP = spacing.sm;
const GRID_PADDING = spacing.lg;
const CARD_IMAGE_RATIO = 1.395;

function computeGridItemWidth(cardsPerRow: number): number {
  return (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP * (cardsPerRow - 1)) / cardsPerRow;
}

const SEARCH_DEBOUNCE_MS = 200;

// Toolbar collapse height is derived from the user's preferred size
// (small / medium / large) — see `toolbarHeightFor`.
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

  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);

  // UI state — view + sort persist per device via AsyncStorage so
  // toggling them here also carries to binder/list detail next open.
  // Filters stay session-only.
  const { viewMode, sortBy, sortAsc, cardsPerRow, toolbarSize, setViewMode, setSortBy, setSortAsc } =
    useCollectionViewPrefs();
  const toolbarHeight = toolbarHeightFor(toolbarSize);
  const gridItemWidth = useMemo(() => computeGridItemWidth(cardsPerRow), [cardsPerRow]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
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
  // targets and never count toward Owned. Single query with JOIN —
  // earlier we had two useQuerys (binderIds → useLocalCardEntries),
  // which caused a cascade: every time PowerSync re-emitted the binder
  // list (even with identical IDs) the inner params ref changed, the
  // inner query refetched, isReady flipped, and 21k merged rows
  // re-enriched chunk-by-chunk in the background — the Owned blink.
  // One query removes that whole feedback loop.
  const ownedQuery = useMemo(
    () => ({
      join: `JOIN collections c ON c.id = cc.collection_id`,
      where: `c.type = 'binder'`,
      params: [] as any[],
    }),
    []
  );
  const { entries: rawEntries, isReady } = useLocalCardEntries(ownedQuery);
  const cachedStats = useCachedCollectionStats(OWNED_CACHE_ID);

  // ── Paint gate ──
  // Hide the grid until enrichment resolves. Once painted we stay
  // painted — writes re-enrich in the background without hiding it.
  const [hasPaintedGrid, setHasPaintedGrid] = useState(false);
  const [loaderVisible, setLoaderVisible] = useState(false);
  const canCommitPaint = isReady && rawEntries.length > 0;
  const showGrid =
    hasPaintedGrid || canCommitPaint || (isReady && rawEntries.length === 0);

  useEffect(() => {
    if (showGrid) {
      if (!hasPaintedGrid) setHasPaintedGrid(true);
      if (loaderVisible) setLoaderVisible(false);
      return;
    }
    const t = setTimeout(() => setLoaderVisible(true), 120);
    return () => clearTimeout(t);
  }, [showGrid, hasPaintedGrid, loaderVisible]);

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
      // Needed by filterAndSort's language filter (CardEntry.language).
      // Without this the Language tab in the filter sheet silently
      // matches nothing in the owned view.
      language: r.language,
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

  // Non-blocking prefetch for the first viewport of images. Paired with
  // transition={0} on the grid cards, disk-cached images pop in instant
  // and uncached ones swap the placeholder without a fade cascade.
  useEffect(() => {
    if (!isReady || visibleRows.length === 0) return;
    const uris = visibleRows
      .slice(0, cardsPerRow * 6)
      .map((r) => r.cards.image_uri_normal || r.cards.image_uri_small)
      .filter((u): u is string => !!u);
    if (uris.length > 0) ExpoImage.prefetch(uris).catch(() => {});
  }, [isReady, visibleRows, cardsPerRow]);

  const loadMore = useCallback(() => {
    if (!hasMore) return;
    setVisibleCount((c) => c + PAGE_STEP);
  }, [hasMore]);

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
          lang: card.lang,
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
  const availableLanguages = useMemo(() => deriveAvailableLanguages(mergedRows as any), [mergedRows]);

  const isFilterActive =
    !!debouncedSearch || countActiveFilters(filters) > 0;

  // Stats: if no filters are active, sum the full merged set; otherwise
  // sum the filtered result so the header matches the list.
  const liveStats = useMemo(() => {
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
      const ep = c?.price_usd_etched ?? c?.price_usd_foil;
      if (ep) value += ep * r.quantity_etched;
    }
    return { totalCards: cards, uniqueCards: unique, displayValue: value };
  }, [mergedRows, displayRows, isFilterActive]);

  useWriteCollectionStatsCache(OWNED_CACHE_ID, isReady && !isFilterActive, {
    card_count: liveStats.totalCards,
    unique_cards: liveStats.uniqueCards,
    total_value: liveStats.displayValue,
  });

  const totalCards = liveStats.totalCards;
  const uniqueCards = liveStats.uniqueCards;
  // During enrichment the live value ticks up chunk-by-chunk as prices
  // land. Pin to cached value while loading; swap to live once ready.
  const displayValue = isReady
    ? liveStats.displayValue
    : (!isFilterActive && cachedStats ? cachedStats.total_value : 0);

  const isGrid = viewMode !== 'list';

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

  // When numColumns is 1, FlatList ignores columnWrapperStyle — fall back
  // to per-item marginBottom so row spacing stays consistent.
  const itemSpacingStyle = cardsPerRow === 1 ? { marginBottom: GRID_GAP } : null;

  /* ── Grid compact: pure card, no overlays ── */
  function renderGridCompactItem({ item }: { item: OwnedRow }) {
    const card = item.cards;
    return (
      <TouchableOpacity
        style={[styles.gridCompactCard, { width: gridItemWidth }, itemSpacingStyle]}
        onPress={() => handleCardPress(item)}
        activeOpacity={0.7}
      >
        <CardImage
          uri={card.image_uri_normal || card.image_uri_small}
          style={styles.gridCompactImage}
          transition={0}
        />
      </TouchableOpacity>
    );
  }

  /* ── Grid with meta ── */
  function renderGridItem({ item }: { item: OwnedRow }) {
    const qty = totalQty(item);
    const card = item.cards;
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
        style={[styles.gridCard, { width: gridItemWidth }, itemSpacingStyle]}
        onPress={() => handleCardPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.gridImageWrap}>
          <CardImage
            uri={card.image_uri_normal || card.image_uri_small}
            style={styles.gridImage}
            transition={0}
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
  function renderListItem({ item }: { item: OwnedRow }) {
    const finishParts: string[] = [];
    if (item.quantity_normal > 0) finishParts.push('Normal');
    if (item.quantity_foil > 0) finishParts.push('Foil');
    if (item.quantity_etched > 0) finishParts.push('Etched Foil');
    const card = item.cards;
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

  // Toolbar collapse — see app/collection/[id].tsx for the rationale.
  // Translate-only animation (no `height`) so the TextInput's frame stays
  // constant and iOS doesn't re-measure children every frame.
  const COLLAPSE_THRESHOLD = 220;
  const lastY = useSharedValue(0);
  const accumulator = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      const y = e.contentOffset.y;
      const delta = y - lastY.value;
      lastY.value = y;

      if (y <= 0) {
        accumulator.value = 0;
        return;
      }

      const next = accumulator.value + delta;
      accumulator.value =
        next < 0 ? 0 : next > COLLAPSE_THRESHOLD ? COLLAPSE_THRESHOLD : next;
    },
  });

  const toolbarStyle = useAnimatedStyle(() => {
    if (toolbarHeight === 0) return { opacity: 1 };
    const progress = accumulator.value / COLLAPSE_THRESHOLD;
    return {
      transform: [{ translateY: -toolbarHeight * progress }],
      marginBottom: -toolbarHeight * progress,
      opacity: interpolate(progress, [0, 0.45, 1], [1, 0, 0], Extrapolation.CLAMP),
    };
  });

  return (
    <View style={styles.container}>
      <View style={styles.headerCard}>
        <View style={[styles.headerInner, { paddingTop: insets.top + spacing.sm }]}>
          {/* ── Header ── */}
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="chevron-back" size={28} color={colors.text} />
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <Text style={styles.title}>Owned Cards</Text>
              {uniqueCards > 0 ? (
                <Text style={styles.headerSubtitle} numberOfLines={1}>
                  <Text style={styles.metaBold}>{totalCards.toLocaleString('en-US')}</Text>
                  <Text style={styles.metaLabel}> cards</Text>
                  <Text style={styles.metaDot}>  ·  </Text>
                  <Text style={styles.metaBold}>{uniqueCards.toLocaleString('en-US')}</Text>
                  <Text style={styles.metaLabel}> unique</Text>
                  {displayValue > 0 && (
                    <>
                      <Text style={styles.metaDot}>  ·  </Text>
                      <Text style={styles.metaValue}>
                        ${displayValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </>
                  )}
                </Text>
              ) : (
                <Text style={styles.headerSubtitle}>{'\u00A0'}</Text>
              )}
            </View>
            <View style={{ width: 28 }} />
          </View>
        </View>

        {/* ── Toolbar inside the header card (collapses on scroll) ──
            Wrapped in a clipping View so the translate-out doesn't leak
            past the header card's bottom edge. */}
        <View style={styles.toolbarClip}>
        <Animated.View style={toolbarStyle}>
          <CollectionToolbar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            viewMode={viewMode}
            onToggleView={() => setViewMode(nextViewMode(viewMode))}
            onSortPress={() => setShowSort(true)}
            onFilterPress={() => setShowFilter(true)}
            activeFilters={countActiveFilters(filters)}
            size={toolbarSize}
          />
        </Animated.View>
        </View>
      </View>

      {/* ── Content ── */}
      {!showGrid ? (
        <View style={styles.centered}>
          {loaderVisible && (
            <ActivityIndicator color={colors.primary} size="large" />
          )}
        </View>
      ) : isGrid ? (
        <Animated.FlatList
          key={`${viewMode}-${cardsPerRow}`}
          data={visibleRows}
          keyExtractor={rowKey}
          renderItem={viewMode === 'grid-compact' ? renderGridCompactItem : renderGridItem}
          numColumns={cardsPerRow}
          columnWrapperStyle={cardsPerRow > 1 ? styles.gridRow : undefined}
          contentContainerStyle={styles.gridList}
          ListEmptyComponent={isReady ? emptyComponent : null}
          ListFooterComponent={listFooter}
          onEndReached={loadMore}
          onEndReachedThreshold={0.6}
          removeClippedSubviews
          onScroll={scrollHandler}
          scrollEventThrottle={16}
        />
      ) : (
        <Animated.FlatList
          key="list"
          data={visibleRows}
          keyExtractor={rowKey}
          renderItem={renderListItem}
          contentContainerStyle={styles.listList}
          ListEmptyComponent={isReady ? emptyComponent : null}
          ListFooterComponent={listFooter}
          onEndReached={loadMore}
          onEndReachedThreshold={0.6}
          removeClippedSubviews
          onScroll={scrollHandler}
          scrollEventThrottle={16}
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
        availableLanguages={availableLanguages}
        availableTags={[]}
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
  headerCard: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: borderRadius.xl,
    borderBottomRightRadius: borderRadius.xl,
    paddingBottom: spacing.xs + 2,
    ...shadows.sm,
  },
  headerInner: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  toolbarClip: {
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
    letterSpacing: -0.4,
  },
  headerSubtitle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  metaBold: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  metaLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  metaDot: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  metaValue: {
    color: colors.success,
    fontSize: fontSize.xs,
    fontWeight: '500',
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
