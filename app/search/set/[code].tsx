import { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Dimensions,
  type TextInput as RNTextInput,
} from 'react-native';
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
import { filterScryfallCards } from '../../../src/lib/search/filterScryfallCards';
import {
  nextViewMode,
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
import { groupCardsForSet } from '../../../src/lib/search/setGrouping';
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

  // Set page leans on its own sort palette. If the global pref isn't
  // one of those, render as if `collector_number` is selected without
  // mutating the persisted value.
  const effectiveSortBy: SortOption = useMemo(() => {
    return ALLOWED_SORTS.includes(sortBy) ? sortBy : 'collector_number';
  }, [sortBy]);
  const isGroupedSort = effectiveSortBy === 'collector_number';

  const [search, setSearch] = useState('');
  const [showSort, setShowSort] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
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

  // ── Sort (flat path) ──
  const sorted = useMemo(() => {
    if (isGroupedSort) return visible;
    const dir = sortAsc ? 1 : -1;
    const arr = [...visible];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (effectiveSortBy) {
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
  }, [visible, effectiveSortBy, isGroupedSort, sortAsc]);

  // ── Grouped path: build Group<ScryfallCard>[] for GroupedCollectionList ──
  const groups: Group<ScryfallCard>[] = useMemo(() => {
    if (!isGroupedSort) return [];
    const setGroups = groupCardsForSet(visible, setMeta?.card_count ?? null);
    return setGroups.map<Group<ScryfallCard>>((g) => ({
      key: g.id,
      label: g.title,
      icon: { kind: 'none' },
      entries: g.cards,
      cardCount: g.cards.length,
      uniqueCount: g.cards.length,
      subtotal: null,
    }));
  }, [isGroupedSort, visible, setMeta]);

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

  const handleCardPress = useCallback(
    (card: ScryfallCard) => {
      router.push({
        pathname: '/card/[id]',
        params: { id: card.id, cardJson: JSON.stringify(card) },
      });
    },
    [router]
  );

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
      {/* Status-bar slab — extends the hero color into the safe area
          so there's no white strip above the chrome row. */}
      <View style={[styles.statusBarBg, { height: insets.top }]} />

      {/* ── Colored header ── */}
      <View style={styles.heroChrome}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={26} color="#FFF" />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          {/* 3-dot menu — settings sheet ships next iteration. */}
          <Ionicons name="ellipsis-horizontal-circle-outline" size={24} color="#FFF" />
        </TouchableOpacity>
      </View>

      <SetHeader
        setMeta={setMeta}
        totalCards={cards.length}
        marketValue={stats.value}
        rarityCounts={stats.rarityCounts}
      />

      {/* ── Toolbar (size driven by /profile/grid) ── */}
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
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={m.searchIcon} color={colors.textMuted} />
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
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge} />
          )}
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

      {/* ── Body ── */}
      {!isReady ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : isGroupedSort && groups.length > 0 ? (
        // GroupHeader + the card-row wrapper inside GroupedCollectionList
        // already inject `paddingHorizontal: spacing.lg`, so we MUST NOT
        // add it again here — otherwise headers + cards float visually
        // inset from the screen edge (the bug in screenshot 32/33).
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
        />
      ) : (
        <FlatList
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
        // Surface the active set as the only Sets entry so the tab
        // isn't a dead end. Languages + Tags hide automatically when
        // their lists are empty.
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
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Header — primary-tinted hero panel with set icon + stats
// ──────────────────────────────────────────────────────────────────────

function SetHeader({
  setMeta,
  totalCards,
  marketValue,
  rarityCounts,
}: {
  setMeta: { name: string; code: string; released_at: string | null; icon_svg_uri: string | null } | null;
  totalCards: number;
  marketValue: number;
  rarityCounts: Record<string, number>;
}) {
  return (
    <View style={styles.hero}>
      <View style={styles.heroTop}>
        <View style={styles.setIconWrap}>
          {setMeta?.icon_svg_uri ? (
            <Image
              source={{ uri: setMeta.icon_svg_uri }}
              style={styles.setIcon}
              contentFit="contain"
              tintColor="#FFF"
            />
          ) : (
            <Ionicons name="albums-outline" size={28} color="#FFF" />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.setName} numberOfLines={2}>
            {setMeta?.name ?? '—'}
          </Text>
          <Text style={styles.setMeta}>
            {(setMeta?.code ?? '—').toUpperCase()}
            {setMeta?.released_at ? ` · ${setMeta.released_at}` : ''}
            {totalCards > 0 ? ` · ${totalCards} cards` : ''}
          </Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        {RARITY_META.map((r) => {
          const count = rarityCounts[r.key] ?? 0;
          if (count === 0) return null;
          return (
            <View key={r.key} style={styles.rarityChip}>
              {/* Same MTG rarity glyph used in the binder/list group-by
                  headers — keeps the visual vocabulary consistent. */}
              <MTGGlyph kind="rarity" code={r.key} size={16} />
              <Text style={styles.rarityCount}>{count}</Text>
            </View>
          );
        })}
        <View style={{ flex: 1 }} />
        <View style={styles.valueChip}>
          <Ionicons name="cash-outline" size={12} color="#FFF" />
          <Text style={styles.valueLabel}>{formatUSD(marketValue.toFixed(2))}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  statusBarBg: {
    backgroundColor: '#0F172A',
    width: '100%',
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
  /* Hero (header chrome + set info) — primary-tinted slab so the set
     identity reads as its own zone, separated from the white results
     panel underneath. Inspired by the Price Alerts hero. */
  heroChrome: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    backgroundColor: '#0F172A',
  },
  hero: {
    backgroundColor: '#0F172A',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: borderRadius.lg,
    borderBottomRightRadius: borderRadius.lg,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  setIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  setIcon: {
    width: 32,
    height: 32,
  },
  setName: {
    color: '#FFF',
    fontSize: fontSize.xl,
    fontWeight: '800',
  },
  setMeta: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: fontSize.xs,
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
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  rarityCount: {
    color: '#FFF',
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
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  valueLabel: {
    color: '#FFF',
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  /* Toolbar */
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
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
  // Used ONLY by GroupedCollectionList. Headers + card-rows manage
  // their own horizontal padding internally; adding any here would
  // double-pad and shrink everything inward from the screen edge.
  groupedListContent: {
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
  // List row dimensions mirror collection/owned.tsx so the visual
  // language stays consistent across binder / list / owned / set pages.
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
