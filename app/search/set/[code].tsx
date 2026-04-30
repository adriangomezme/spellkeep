import { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  type TextInput as RNTextInput,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { CardImage } from '../../../src/components/collection/CardImage';
import { MTGGlyph } from '../../../src/components/MTGGlyph';
import {
  SortSheet,
  type SortOption,
  type SortOptionDef,
} from '../../../src/components/collection/SortSheet';
import {
  FilterSheet,
  EMPTY_FILTERS,
  countActiveFilters,
  type FilterState,
} from '../../../src/components/collection/FilterSheet';
import {
  GroupBySheet,
  type GroupByOption,
} from '../../../src/components/collection/GroupBySheet';
import { filterScryfallCards } from '../../../src/lib/search/filterScryfallCards';
import {
  nextViewMode,
  toolbarHeightFor,
  toolbarMetricsFor,
} from '../../../src/components/collection/CollectionToolbar';
import { GroupedCollectionList } from '../../../src/components/collection/GroupedCollectionList';
import type { Group } from '../../../src/lib/cardListUtils';
import {
  formatUSD,
  pickAnyPrice,
  getCardImageUri,
  type ScryfallCard,
} from '../../../src/lib/scryfall';
import { useLocalSets } from '../../../src/lib/hooks/useLocalSets';
import { useSetCards } from '../../../src/lib/hooks/useSetCards';
import { useSearchViewPrefs } from '../../../src/lib/hooks/useSearchViewPrefs';
import { useCollectionViewPrefs } from '../../../src/lib/hooks/useCollectionViewPrefs';
import { groupSetCardsBy } from '../../../src/lib/search/setGrouping';
import type { GroupBy } from '../../../src/lib/hooks/useGroupByPref';
import {
  colors,
  spacing,
  fontSize,
  borderRadius,
  shadows,
} from '../../../src/constants';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_GAP = spacing.sm;
const GRID_PADDING = spacing.lg;
const CARD_IMAGE_RATIO = 1.395;

function computeGridItemWidth(cardsPerRow: number): number {
  return (
    (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP * (cardsPerRow - 1)) / cardsPerRow
  );
}

const SET_SORT_OPTIONS: SortOptionDef[] = [
  { key: 'collector_number', label: 'Set Number', icon: 'list-outline' },
  { key: 'name', label: 'Name', icon: 'text-outline' },
  { key: 'edhrec_rank', label: 'EDHREC Rank', icon: 'trending-up-outline' },
  { key: 'mana_value', label: 'Mana Value', icon: 'flame-outline' },
  { key: 'price', label: 'Price', icon: 'pricetag-outline' },
  { key: 'color_identity', label: 'Color Identity', icon: 'color-palette-outline' },
  { key: 'rarity', label: 'Rarity', icon: 'diamond-outline' },
];

const ALLOWED_SORTS: SortOption[] = SET_SORT_OPTIONS.map((o) => o.key);

// Group By options surfaced on the Set Detail screen. We deliberately
// hide `set` (we're already inside one set) and `tags` (no per-card
// tags here). `print_group` reproduces Scryfall's set-page sectioning
// (Main / Borderless / Showcase / Extended Art / Promos / Tokens).
const SET_GROUP_OPTIONS: GroupByOption[] = [
  { key: 'none', label: 'No grouping', icon: 'remove-outline' },
  { key: 'rarity', label: 'Rarity', icon: 'diamond-outline' },
  { key: 'color', label: 'Color', icon: 'color-palette-outline' },
  { key: 'type', label: 'Type', icon: 'shapes-outline' },
  { key: 'print_group', label: 'Print Group', icon: 'albums-outline' },
];

const RARITY_META: { key: 'mythic' | 'rare' | 'uncommon' | 'common'; label: string }[] = [
  { key: 'mythic', label: 'M' },
  { key: 'rare', label: 'R' },
  { key: 'uncommon', label: 'U' },
  { key: 'common', label: 'C' },
];

export default function SetDetailScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const inputRef = useRef<RNTextInput | null>(null);

  const sets = useLocalSets();
  const setMeta = useMemo(
    () => sets.find((s) => s.code === code?.toLowerCase()) ?? null,
    [sets, code]
  );

  const { cards, isReady } = useSetCards(code);

  const { viewMode, sortBy, sortAsc, setViewMode, setSortBy, setSortAsc } =
    useSearchViewPrefs();
  const { cardsPerRow, toolbarSize } = useCollectionViewPrefs();
  const m = toolbarMetricsFor(toolbarSize);
  const toolbarHeight = toolbarHeightFor(toolbarSize);

  // Set page leans on its own sort palette. If the global pref isn't
  // one of those, render as if `collector_number` is selected without
  // mutating the persisted value.
  const effectiveSortBy: SortOption = useMemo(() => {
    return ALLOWED_SORTS.includes(sortBy) ? sortBy : 'collector_number';
  }, [sortBy]);

  const [search, setSearch] = useState('');
  const [showSort, setShowSort] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [showGroupBy, setShowGroupBy] = useState(false);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  // Group By is local to this screen — not persisted. Defaults to
  // none so the user lands on the literal sort they picked; switching
  // to print_group reproduces the previous "Set Number sort builds
  // Scryfall sections" behavior on demand.
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const activeFilterCount = countActiveFilters(filters);

  // ── Header derivations ──
  const stats = useMemo(() => {
    let value = 0;
    const rarityCounts: Record<string, number> = {};
    for (const c of cards) {
      const price = pickAnyPrice(c);
      if (price) {
        const n = parseFloat(price);
        if (isFinite(n)) value += n;
      }
      rarityCounts[c.rarity] = (rarityCounts[c.rarity] ?? 0) + 1;
    }
    return { value, rarityCounts };
  }, [cards]);

  // ── Filter ──
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = cards;
    if (q) {
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.type_line.toLowerCase().includes(q) ||
          c.collector_number.toLowerCase().includes(q)
      );
    }
    return filterScryfallCards(result, filters);
  }, [cards, search, filters]);

  // ── Sort ──
  // Set Number now sorts literally by collector number — no implicit
  // grouping. The Scryfall-style sectioning lives under Group By
  // ("Print Group") so the two axes (sort + group) are independent.
  const sorted = useMemo(() => {
    const dir = sortAsc ? 1 : -1;
    const arr = [...visible];
    const collatorCN = (a: string, b: string) => {
      const ma = a.match(/^(\d+)/);
      const mb = b.match(/^(\d+)/);
      const na = ma ? parseInt(ma[1], 10) : Number.MAX_SAFE_INTEGER;
      const nb = mb ? parseInt(mb[1], 10) : Number.MAX_SAFE_INTEGER;
      if (na !== nb) return na - nb;
      return a.localeCompare(b);
    };
    arr.sort((a, b) => {
      let cmp = 0;
      switch (effectiveSortBy) {
        case 'collector_number':
          cmp = collatorCN(a.collector_number ?? '', b.collector_number ?? '');
          break;
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'mana_value':
          cmp = (a.cmc ?? 0) - (b.cmc ?? 0);
          break;
        case 'price': {
          const pa = parseFloat(pickAnyPrice(a) ?? '');
          const pb = parseFloat(pickAnyPrice(b) ?? '');
          const aMissing = !isFinite(pa);
          const bMissing = !isFinite(pb);
          if (aMissing && bMissing) cmp = 0;
          else if (aMissing) return 1;
          else if (bMissing) return -1;
          else cmp = pa - pb;
          break;
        }
        case 'color_identity':
          cmp = (a.color_identity ?? []).length - (b.color_identity ?? []).length;
          break;
        case 'rarity': {
          const order: Record<string, number> = { common: 0, uncommon: 1, rare: 2, mythic: 3 };
          cmp = (order[a.rarity] ?? -1) - (order[b.rarity] ?? -1);
          break;
        }
        case 'edhrec_rank': {
          const ra = a.edhrec_rank ?? Number.MAX_SAFE_INTEGER;
          const rb = b.edhrec_rank ?? Number.MAX_SAFE_INTEGER;
          cmp = ra - rb;
          break;
        }
      }
      return cmp * dir;
    });
    return arr;
  }, [visible, effectiveSortBy, sortAsc]);

  // ── Group ──
  // print_group ignores sortBy and uses its own collector-number
  // ordering inside each section (Main Set / Borderless / Showcase
  // / etc — the natural reading order). The other modes group the
  // already-sorted list so each bucket preserves the user's chosen
  // sort.
  const groups: Group<ScryfallCard>[] = useMemo(() => {
    if (groupBy === 'none') return [];
    if (groupBy === 'rarity' || groupBy === 'color' || groupBy === 'type') {
      return groupSetCardsBy(sorted, groupBy, setMeta?.card_count ?? null);
    }
    if (groupBy === 'print_group') {
      return groupSetCardsBy(visible, 'print_group', setMeta?.card_count ?? null);
    }
    return [];
  }, [groupBy, sorted, visible, setMeta]);

  const isGrouped = groupBy !== 'none' && groups.length > 0;

  // Section collapse state — local to this screen; not persisted yet.
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set());
  const handleToggleKey = useCallback((key: string) => {
    setCollapsedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Collapse-all chip wiring — mirrors binder/[id].tsx. We only flag
  // the deck as "all collapsed" when every non-empty visible group
  // is in `collapsedKeys`; tapping the chip then either expands them
  // all or collapses them all.
  const allGroupsCollapsed = useMemo(() => {
    if (groups.length === 0) return false;
    for (const g of groups) {
      if (g.entries.length === 0) continue;
      if (!collapsedKeys.has(g.key)) return false;
    }
    return true;
  }, [groups, collapsedKeys]);

  const handleToggleAllCollapsed = useCallback(() => {
    if (allGroupsCollapsed) {
      setCollapsedKeys(new Set());
      return;
    }
    const all = new Set<string>();
    for (const g of groups) {
      if (g.entries.length > 0) all.add(g.key);
    }
    setCollapsedKeys(all);
  }, [allGroupsCollapsed, groups]);

  const handleCardPress = useCallback(
    (card: ScryfallCard) => {
      router.push({
        pathname: '/card/[id]',
        params: { id: card.id, cardJson: JSON.stringify(card) },
      });
    },
    [router]
  );

  // ── Toolbar collapse on scroll — same pattern used by Owned and the
  //    binder/list detail screens. The toolbar lives inside the header
  //    card and translates up while the user scrolls down. Any upward
  //    drag (delta < 0) brings it back instantly without waiting for
  //    the user to reach the top — Instagram / Safari behavior.
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

  // When grouping is active, the sticky group header collides with
  // the header card's rounded bottom corner and the page bg "tooths"
  // through the seam. Interpolate the bottom radius to 0 once the
  // user starts scrolling so the section header seals cleanly into
  // the bottom of the header card. Without grouping (FlatList only,
  // no sticky chrome) we keep the corner static — there's nothing
  // for it to collide with.
  const headerCardStyle = useAnimatedStyle(() => {
    if (!isGrouped) {
      return {
        borderBottomLeftRadius: borderRadius.xl,
        borderBottomRightRadius: borderRadius.xl,
      };
    }
    const radius = interpolate(
      lastY.value,
      [0, 6],
      [borderRadius.xl, 0],
      Extrapolation.CLAMP,
    );
    return {
      borderBottomLeftRadius: radius,
      borderBottomRightRadius: radius,
    };
  });

  // ── Card renderers (shared with grouped + flat paths) ──
  const isGrid = viewMode !== 'list';
  const gridItemWidth = useMemo(() => computeGridItemWidth(cardsPerRow), [cardsPerRow]);
  const fullWidth = SCREEN_WIDTH - GRID_PADDING * 2;

  const renderCard = useCallback(
    (item: ScryfallCard, width: number) => {
      if (viewMode === 'grid-compact') {
        return (
          <TouchableOpacity
            style={[styles.gridCompactCard, { width }]}
            onPress={() => handleCardPress(item)}
            activeOpacity={0.7}
          >
            <CardImage uri={getCardImageUri(item, 'normal')} style={styles.gridCompactImage} transition={0} />
          </TouchableOpacity>
        );
      }
      if (viewMode === 'grid') {
        return (
          <TouchableOpacity
            style={[styles.gridCard, { width }]}
            onPress={() => handleCardPress(item)}
            activeOpacity={0.7}
          >
            <View style={styles.gridImageWrap}>
              <CardImage uri={getCardImageUri(item, 'normal')} style={styles.gridImage} transition={0} />
            </View>
            <View style={styles.gridMeta}>
              <Text style={styles.gridName} numberOfLines={1}>{item.name}</Text>
              <View style={styles.gridBottom}>
                <Text style={styles.gridSet} numberOfLines={1}>
                  #{item.collector_number}
                </Text>
                <Text style={styles.gridPrice}>{formatUSD(pickAnyPrice(item))}</Text>
              </View>
            </View>
          </TouchableOpacity>
        );
      }
      // list
      return (
        <TouchableOpacity
          style={styles.listCard}
          onPress={() => handleCardPress(item)}
          activeOpacity={0.6}
        >
          <CardImage uri={getCardImageUri(item, 'small')} style={styles.listImage} />
          <View style={styles.listInfo}>
            <Text style={styles.listName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.listType} numberOfLines={1}>{item.type_line}</Text>
            <Text style={styles.listMeta} numberOfLines={1}>
              #{item.collector_number} · {item.rarity}
            </Text>
          </View>
          <Text style={styles.listPrice}>{formatUSD(pickAnyPrice(item))}</Text>
        </TouchableOpacity>
      );
    },
    [viewMode, handleCardPress]
  );

  const cardKey = useCallback((c: ScryfallCard) => c.id, []);

  const emptyComponent = (
    <View style={styles.empty}>
      <Ionicons name="search" size={28} color={colors.textMuted} />
      <Text style={styles.emptyText}>No cards match</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* ── White header card ──
           Hosts back/menu chrome, set identity (icon + name + stats),
           and the search/sort/filter/view toolbar that collapses on
           scroll. Same pattern used by Owned and binder/list detail
           screens — single white surface with a soft bottom radius
           that flattens when grouping is active. */}
      <Animated.View style={[styles.headerCard, headerCardStyle]}>
        <View style={[styles.headerInner, { paddingTop: insets.top + spacing.sm }]}>
          {/* Back chevron + 3-dot menu */}
          <View style={styles.chromeRow}>
            <TouchableOpacity
              onPress={() => router.back()}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="chevron-back" size={28} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons
                name="ellipsis-horizontal-circle-outline"
                size={28}
                color={colors.text}
              />
            </TouchableOpacity>
          </View>

          {/* Set identity row — icon + name + meta */}
          <View style={styles.identityRow}>
            <View style={styles.setIconWrap}>
              {setMeta?.icon_svg_uri ? (
                <Image
                  source={{ uri: setMeta.icon_svg_uri }}
                  style={styles.setIcon}
                  contentFit="contain"
                  tintColor={colors.text}
                />
              ) : (
                <Ionicons name="albums-outline" size={26} color={colors.text} />
              )}
            </View>
            <View style={styles.identityText}>
              <Text style={styles.setName} numberOfLines={2}>
                {setMeta?.name ?? '—'}
              </Text>
              <Text style={styles.setMeta} numberOfLines={1}>
                {(setMeta?.code ?? '—').toUpperCase()}
                {setMeta?.released_at ? ` · ${setMeta.released_at}` : ''}
                {cards.length > 0 ? ` · ${cards.length} cards` : ''}
              </Text>
            </View>
          </View>

          {/* Stats row — rarity counts + total market value */}
          <View style={styles.statsRow}>
            {RARITY_META.map((r) => {
              const count = stats.rarityCounts[r.key] ?? 0;
              if (count === 0) return null;
              return (
                <View key={r.key} style={styles.rarityChip}>
                  <MTGGlyph kind="rarity" code={r.key} size={14} />
                  <Text style={styles.rarityCount}>{count}</Text>
                </View>
              );
            })}
            <View style={{ flex: 1 }} />
            {stats.value > 0 && (
              <View style={styles.valueChip}>
                <Ionicons name="cash-outline" size={12} color={colors.primary} />
                <Text style={styles.valueLabel}>
                  {formatUSD(stats.value.toFixed(2))}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Toolbar inside the header — collapses on scroll. The clip
            wrapper hides the translate-out so it doesn't bleed past
            the header card's bottom edge. */}
        <View style={styles.toolbarClip}>
          <Animated.View style={toolbarStyle}>
            <View style={styles.toolbar}>
              <Pressable
                style={[styles.searchField, { height: m.controlHeight }]}
                onPress={() => inputRef.current?.focus()}
              >
                <Ionicons name="search" size={m.searchIcon} color={colors.textMuted} />
                <TextInput
                  ref={inputRef}
                  style={[styles.searchInput, { fontSize: m.searchFontSize }]}
                  placeholder="Filter this set…"
                  placeholderTextColor={colors.textMuted}
                  value={search}
                  onChangeText={setSearch}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {search.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setSearch('')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons
                      name="close-circle"
                      size={m.searchIcon}
                      color={colors.textMuted}
                    />
                  </TouchableOpacity>
                )}
              </Pressable>
              <TouchableOpacity
                style={[styles.iconBtn, { width: m.iconBtn, height: m.iconBtn }]}
                onPress={() => setShowSort(true)}
                activeOpacity={0.6}
              >
                <Ionicons name="swap-vertical" size={m.actionIcon} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.iconBtn, { width: m.iconBtn, height: m.iconBtn }]}
                onPress={() => setShowFilter(true)}
                activeOpacity={0.6}
              >
                <Ionicons
                  name="options-outline"
                  size={m.actionIcon}
                  color={activeFilterCount > 0 ? colors.primary : colors.text}
                />
                {activeFilterCount > 0 && <View style={styles.filterBadge} />}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.iconBtn, { width: m.iconBtn, height: m.iconBtn }]}
                onPress={() => setShowGroupBy(true)}
                activeOpacity={0.6}
              >
                <Ionicons
                  name="layers-outline"
                  size={m.actionIcon}
                  color={isGrouped ? colors.primary : colors.text}
                />
                {isGrouped && <View style={styles.filterBadge} />}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.iconBtn, { width: m.iconBtn, height: m.iconBtn }]}
                onPress={() => setViewMode(nextViewMode(viewMode))}
                activeOpacity={0.6}
              >
                <Ionicons
                  name={viewMode === 'list' ? 'list' : viewMode === 'grid' ? 'grid' : 'grid-outline'}
                  size={m.actionIcon}
                  color={colors.text}
                />
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Animated.View>

      {/* ── Body ── */}
      {!isReady ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : isGrouped ? (
        <GroupedCollectionList
          groups={groups}
          cardsPerRow={isGrid ? cardsPerRow : 1}
          cardWidth={isGrid ? gridItemWidth : fullWidth}
          gridGap={GRID_GAP}
          renderCard={renderCard}
          cardKey={cardKey}
          collapsedKeys={collapsedKeys}
          onToggleKey={handleToggleKey}
          contentContainerStyle={styles.groupedListContent}
          ListEmptyComponent={emptyComponent}
          onScroll={scrollHandler}
        />
      ) : (
        <Animated.FlatList
          key={`${viewMode}-${cardsPerRow}`}
          data={sorted}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => renderCard(item, isGrid ? gridItemWidth : fullWidth)}
          numColumns={isGrid ? cardsPerRow : 1}
          columnWrapperStyle={isGrid && cardsPerRow > 1 ? styles.gridRow : undefined}
          contentContainerStyle={isGrid ? styles.gridList : styles.listContent}
          ListEmptyComponent={emptyComponent}
          removeClippedSubviews
          initialNumToRender={12}
          windowSize={7}
          maxToRenderPerBatch={10}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
        />
      )}

      <SortSheet
        visible={showSort}
        currentSort={effectiveSortBy}
        ascending={sortAsc}
        onSelect={(s) => { setSortBy(s); setShowSort(false); }}
        onToggleDirection={() => setSortAsc(!sortAsc)}
        onClose={() => setShowSort(false)}
        options={SET_SORT_OPTIONS}
      />

      <FilterSheet
        visible={showFilter}
        filters={filters}
        availableSets={
          setMeta
            ? [{ code: setMeta.code, name: setMeta.name, count: cards.length }]
            : []
        }
        availableLanguages={[]}
        availableTags={[]}
        onApply={setFilters}
        onReset={() => setFilters(EMPTY_FILTERS)}
        onClose={() => setShowFilter(false)}
      />

      <GroupBySheet
        visible={showGroupBy}
        current={groupBy}
        options={SET_GROUP_OPTIONS}
        onSelect={(g) => {
          setGroupBy(g);
          setShowGroupBy(false);
        }}
        onClose={() => setShowGroupBy(false)}
        allCollapsed={allGroupsCollapsed}
        onToggleAllCollapsed={isGrouped ? handleToggleAllCollapsed : undefined}
        collapseDisabled={!isGrouped}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  /* Header card — white refactor pattern matching Owned and binder
     detail. Single surface, soft shadow, rounded bottom corners,
     hosts every above-the-fold control. */
  headerCard: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: borderRadius.xl,
    borderBottomRightRadius: borderRadius.xl,
    paddingBottom: spacing.xs + 2,
    ...shadows.sm,
  },
  headerInner: {
    paddingHorizontal: spacing.md + 2,
    paddingBottom: spacing.sm,
  },
  chromeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  setIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setIcon: {
    width: 28,
    height: 28,
  },
  identityText: {
    flex: 1,
    minWidth: 0,
  },
  setName: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  setMeta: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '500',
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    flexWrap: 'wrap',
  },
  rarityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.surfaceSecondary,
  },
  rarityCount: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  valueChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.primaryLight,
  },
  valueLabel: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  /* Toolbar */
  toolbarClip: {
    overflow: 'hidden',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm + 2,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  searchField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    padding: 0,
  },
  iconBtn: {
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.primary,
  },
  /* Card renderers (grid + list shared) */
  gridList: {
    paddingHorizontal: GRID_PADDING,
    paddingTop: spacing.sm,
    paddingBottom: 100,
  },
  gridRow: {
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  listContent: {
    paddingHorizontal: GRID_PADDING,
    paddingTop: spacing.sm,
    paddingBottom: 100,
  },
  /* Grouped list — paddingTop creates a visible gap between the
     header card's rounded bottom corner and the first sticky group
     header at rest. As the user scrolls down, that padding scrolls
     up at the same rate the headerCardStyle interpolates the bottom
     radius to 0, so the section header lands flush against the
     (now-square) bottom of the header card. Same trick used by
     binder/list detail. */
  groupedListContent: {
    paddingTop: spacing.sm,
    paddingBottom: 100,
  },
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
  listType: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 1,
  },
  listMeta: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  listPrice: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '400',
    marginLeft: spacing.sm,
  },
  /* Empty / loading */
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    alignItems: 'center',
    paddingTop: 80,
    gap: spacing.sm,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
});
