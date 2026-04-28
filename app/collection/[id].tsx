import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import Animated, {
  interpolate,
  Extrapolation,
  FadeIn,
  FadeOut,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useQuery } from '@powersync/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { CardImage } from '../../src/components/collection/CardImage';
import { formatPrice } from '../../src/lib/scryfall';
import { serializeCardForNavigation } from '../../src/lib/cardDetail';
import { EditCollectionCardModal } from '../../src/components/EditCollectionCardModal';
import { CollectionActionSheet } from '../../src/components/collection/CollectionActionSheet';
import { setQuickAddTargetId, useQuickAddTargetId } from '../../src/lib/quickAdd';
import { showToast } from '../../src/components/Toast';
import { EditCollectionInfoModal } from '../../src/components/collection/EditCollectionInfoModal';
import { MergeModal } from '../../src/components/collection/MergeModal';
import { ExportModal } from '../../src/components/collection/ExportModal';
import { ImportModal } from '../../src/components/collection/ImportModal';
import { FolderPickerModal } from '../../src/components/collection/FolderPickerModal';
import { LanguageBadge } from '../../src/components/collection/LanguageBadge';
import { CollectionToolbar, nextViewMode, toolbarHeightFor } from '../../src/components/collection/CollectionToolbar';
import { SortSheet } from '../../src/components/collection/SortSheet';
import { GroupBySheet } from '../../src/components/collection/GroupBySheet';
import { GroupedCollectionList } from '../../src/components/collection/GroupedCollectionList';
import { FilterSheet, type FilterState, EMPTY_FILTERS, countActiveFilters } from '../../src/components/collection/FilterSheet';
import { AddCardFAB } from '../../src/components/collection/AddCardFAB';
import {
  duplicateCollection,
  type CollectionType,
} from '../../src/lib/collections';
import {
  deleteCollectionLocal,
  emptyCollectionLocal,
  moveToFolderLocal,
  deleteCollectionCardsLocal,
  moveCollectionCardsLocal,
  duplicateCollectionCardsLocal,
  bulkAddTagsToCardsLocal,
  bulkRemoveTagsFromCardsLocal,
} from '../../src/lib/collections.local';
import { TagPicker } from '../../src/components/collection/TagPicker';
import { useLocalCardEntries, type EnrichedEntry } from '../../src/lib/hooks/useLocalCardEntries';
import { useCachedCollectionStats, useWriteCollectionStatsCache } from '../../src/lib/hooks/useCollectionStatsCache';
import { useCollectionViewPrefs } from '../../src/lib/hooks/useCollectionViewPrefs';
import { useGroupByPref } from '../../src/lib/hooks/useGroupByPref';
import { useGroupCollapsePref } from '../../src/lib/hooks/useGroupCollapsePref';
import { useBulkSelection } from '../../src/lib/hooks/useBulkSelection';
import { GridCard, GridCompactCard } from '../../src/components/collection/CollectionGridCards';
import { BulkActionsBar } from '../../src/components/collection/BulkActionsBar';
import { DestinationPickerModal } from '../../src/components/DestinationPickerModal';
import { useCollectionsHub } from '../../src/lib/hooks/useCollectionsHub';
import { type CollectionSummary } from '../../src/lib/collections';
import { useCardTagIds, useUserTags, type TagWithCount } from '../../src/lib/hooks/useUserTags';
import { COLLECTION_COLORS } from '../../src/components/collection/ColorPicker';
import { db } from '../../src/lib/powersync/system';
import { filterAndSort, deriveAvailableSets, deriveAvailableLanguages, deriveAvailableTags, displayPriceForRow, groupEntries } from '../../src/lib/cardListUtils';
import { colors, shadows, spacing, fontSize, borderRadius } from '../../src/constants';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_GAP = spacing.sm;
const GRID_PADDING = spacing.lg;
const CARD_IMAGE_RATIO = 1.395; // MTG card ratio (h/w)

function computeGridItemWidth(cardsPerRow: number): number {
  return (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP * (cardsPerRow - 1)) / cardsPerRow;
}

// Toolbar collapse height is derived from the user's preferred size
// (small / medium / large). See `toolbarHeightFor`.

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
  const { viewMode, sortBy, sortAsc, cardsPerRow, toolbarSize, setViewMode, setSortBy, setSortAsc } =
    useCollectionViewPrefs();
  const toolbarHeight = toolbarHeightFor(toolbarSize);
  const gridItemWidth = useMemo(() => computeGridItemWidth(cardsPerRow), [cardsPerRow]);
  const bulk = useBulkSelection();
  // Tag lookup for the list view. Every row inside this collection
  // only ever sees globals + tags scoped to `id`, so we load them
  // once here and pass a Map down to each list row.
  const { tags: availableTags } = useUserTags(id);
  const tagsById = useMemo(() => {
    const m = new Map<string, TagWithCount>();
    for (const t of availableTags) m.set(t.id, t);
    return m;
  }, [availableTags]);
  // Card ids in the bulk selection — passed to the TagPicker so it
  // can compute applied counts for the Remove tab.
  const selectedIdsList = useMemo(() => Array.from(bulk.selectedIds), [bulk.selectedIds]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [showSort, setShowSort] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [showGroupBy, setShowGroupBy] = useState(false);

  // Per-binder Group By selection (AsyncStorage). Default 'none'.
  const { groupBy, setGroupBy } = useGroupByPref(id ?? null);

  // Collapse state for grouped view, persisted per-binder per-mode so
  // re-opening a vault lands on the same view you left. The hook
  // re-hydrates whenever (binder, mode) changes — old keys are
  // discarded automatically.
  const { collapsedKeys, setCollapsedKeys, toggleKey: handleToggleGroupKey } =
    useGroupCollapsePref(id ?? null, groupBy);

  // Action modals
  const [showActions, setShowActions] = useState(false);
  const [showEditInfo, setShowEditInfo] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  // Bulk picker mode: 'move' re-parents selected rows, 'add' duplicates
  // them. Null means the picker is closed.
  const [bulkPickerMode, setBulkPickerMode] = useState<'move' | 'add' | null>(null);
  // Separate state for the Tag action — TagPicker is its own modal.
  const [bulkTagSheetOpen, setBulkTagSheetOpen] = useState(false);

  // Destinations for the picker — same shape Add-to-collection uses.
  // Move excludes the current collection; Add includes everything
  // (duplicating into the same binder is valid — it merges quantities).
  const { binders: hubBinders, lists: hubLists } = useCollectionsHub();
  const bulkDestinations = useMemo<CollectionSummary[]>(() => {
    const all = [...hubBinders, ...hubLists];
    if (bulkPickerMode === 'move') return all.filter((d) => d.id !== id);
    return all;
  }, [hubBinders, hubLists, bulkPickerMode, id]);

  // Watch the collection row itself for color / folder_id. Local query so
  // rename/move/color-edit propagate without a refetch.
  const quickAddTargetId = useQuickAddTargetId();

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

  // Hide the grid until enrichment finishes. Once painted we stay
  // painted — writes re-enrich in the background without hiding it.
  const [hasPaintedGrid, setHasPaintedGrid] = useState(false);
  const [loaderVisible, setLoaderVisible] = useState(false);
  const canCommitPaint = isReady && entries.length > 0;
  const showGrid = hasPaintedGrid || canCommitPaint || (isReady && entries.length === 0);

  useEffect(() => {
    if (showGrid) {
      if (!hasPaintedGrid) setHasPaintedGrid(true);
      if (loaderVisible) setLoaderVisible(false);
      return;
    }
    const t = setTimeout(() => setLoaderVisible(true), 120);
    return () => clearTimeout(t);
  }, [showGrid, hasPaintedGrid, loaderVisible]);

  // Ref-stable handlers are critical: GridCompactCard / GridCard are
  // React.memo'd, so if these refs changed every render the memo would
  // be defeated and 21k items would repaint on every tap.
  const bulkRef = useRef(bulk);
  useEffect(() => { bulkRef.current = bulk; }, [bulk]);
  const viewModeRef = useRef(viewMode);
  useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);

  const handleCardPress = useCallback((entry: CollectionEntry) => {
    const b = bulkRef.current;
    if (b.isActive) {
      b.toggle(entry.id);
      return;
    }
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
  }, [router, id]);

  const handleEditPress = useCallback((entry: CollectionEntry) => {
    // Long-press in a grid view enters / extends bulk mode. In list
    // view it keeps the original behavior (open edit modal) — bulk is
    // grid-only.
    const b = bulkRef.current;
    if (viewModeRef.current !== 'list') {
      if (b.isActive) b.toggle(entry.id);
      else b.enter(entry.id);
      return;
    }
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
  }, []);

  // Auto-exit bulk mode if the user switches to list view (bulk is
  // grid-only) — prevents a stale selection bar over list rows that
  // can't render the checkmark overlay.
  useEffect(() => {
    if (bulk.isActive && viewMode === 'list') bulk.exit();
  }, [bulk, viewMode]);

  function handleBulkDelete() {
    const ids = Array.from(bulk.selectedIds);
    if (ids.length === 0) return;
    // Count copies across selected rows for an honest "M copies" in the
    // alert. Defensive: the entry may have disappeared between the
    // selection and the tap (e.g. background sync removed it).
    const selectedRows = entries.filter((e) => bulk.selectedIds.has(e.id));
    const totalCopies = selectedRows.reduce(
      (sum, e) =>
        sum + e.quantity_normal + e.quantity_foil + e.quantity_etched,
      0
    );
    Alert.alert(
      `Delete ${ids.length} ${ids.length === 1 ? 'card' : 'cards'}?`,
      `This removes ${totalCopies} ${totalCopies === 1 ? 'copy' : 'copies'} from "${collectionName ?? 'this collection'}". This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteCollectionCardsLocal(ids)
              .catch((err) => console.warn('[bulk-delete] failed', err));
            bulk.exit();
          },
        },
      ]
    );
  }

  function handleBulkMove() {
    if (bulk.size === 0) return;
    setBulkPickerMode('move');
  }

  function handleBulkAdd() {
    if (bulk.size === 0) return;
    setBulkPickerMode('add');
  }

  function handleBulkTag() {
    if (bulk.size === 0) return;
    setBulkTagSheetOpen(true);
  }

  function handleTagPickerAdd(tagIds: string[]) {
    const ids = selectedIdsList;
    setBulkTagSheetOpen(false);
    if (ids.length === 0 || tagIds.length === 0) {
      bulk.exit();
      return;
    }
    bulkAddTagsToCardsLocal(ids, tagIds)
      .then(() => {
        showToast(
          `Tagged ${ids.length} ${ids.length === 1 ? 'card' : 'cards'}`
        );
      })
      .catch((err) => {
        console.warn('[bulk-tag] add failed', err);
        Alert.alert('Error', 'Failed to apply tags.');
      });
    bulk.exit();
  }

  function handleTagPickerRemove(tagIds: string[]) {
    const ids = selectedIdsList;
    setBulkTagSheetOpen(false);
    if (ids.length === 0 || tagIds.length === 0) {
      bulk.exit();
      return;
    }
    bulkRemoveTagsFromCardsLocal(ids, tagIds)
      .then(() => {
        showToast(
          `Untagged ${ids.length} ${ids.length === 1 ? 'card' : 'cards'}`
        );
      })
      .catch((err) => {
        console.warn('[bulk-tag] remove failed', err);
        Alert.alert('Error', 'Failed to remove tags.');
      });
    bulk.exit();
  }

  function handleBulkPickerSelect(destId: string) {
    const ids = Array.from(bulk.selectedIds);
    const mode = bulkPickerMode;
    const dest = bulkDestinations.find((d) => d.id === destId);
    setBulkPickerMode(null);
    if (ids.length === 0 || mode === null || !dest) return;

    const op =
      mode === 'move'
        ? moveCollectionCardsLocal(ids, dest.id)
        : duplicateCollectionCardsLocal(ids, dest.id);

    op
      .then(() => {
        const verb = mode === 'move' ? 'Moved' : 'Added';
        showToast(`${verb} ${ids.length} ${ids.length === 1 ? 'card' : 'cards'} to ${dest.name}`);
      })
      .catch((err) => {
        console.warn(`[bulk-${mode}] failed`, err);
        Alert.alert('Error', `Failed to ${mode} cards.`);
      });
    bulk.exit();
  }

  // Tag join lookup for the filter pipeline + the Tags filter tab.
  // JOIN over collection_cards so we only stream the joins that belong
  // to this binder/list, never the user's full corpus.
  const tagJoinRows = useQuery<{ collection_card_id: string; tag_id: string }>(
    `SELECT cct.collection_card_id, cct.tag_id
       FROM collection_card_tags cct
       JOIN collection_cards cc ON cc.id = cct.collection_card_id
      WHERE cc.collection_id = ?`,
    [id]
  );
  const tagsByEntryId = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of tagJoinRows.data ?? []) {
      const arr = m.get(r.collection_card_id) ?? [];
      arr.push(r.tag_id);
      m.set(r.collection_card_id, arr);
    }
    return m;
  }, [tagJoinRows.data]);

  const displayEntries = useMemo(
    () => filterAndSort(entries, searchQuery, sortBy, sortAsc, filters, tagsByEntryId),
    [entries, searchQuery, sortBy, sortAsc, filters, tagsByEntryId],
  );

  // Set metadata for the Group-by-Set header — name, year, and the
  // SVG icon URL. Only queried when grouping by set so we don't pay
  // the cost on every binder open.
  const setsRows = useQuery<{ code: string; name: string; released_at: string | null; icon_svg_uri: string | null }>(
    groupBy === 'set'
      ? `SELECT code, name, released_at, icon_svg_uri FROM sets`
      : `SELECT code, name, released_at, icon_svg_uri FROM sets WHERE 1 = 0`,
    [],
  );
  const setsMeta = useMemo(() => {
    const m = new Map<string, { name: string; released_at: string | null; icon_svg_uri: string | null }>();
    for (const r of setsRows.data ?? []) {
      m.set(r.code.toLowerCase(), {
        name: r.name,
        released_at: r.released_at,
        icon_svg_uri: r.icon_svg_uri,
      });
    }
    return m;
  }, [setsRows.data]);

  const groups = useMemo(() => {
    if (groupBy === 'none') return [];
    return groupEntries(displayEntries, groupBy, {
      tagsByEntryId,
      tagsCatalog: availableTags,
      setsMeta,
    });
  }, [displayEntries, groupBy, tagsByEntryId, availableTags, setsMeta]);

  // True iff every visible (non-empty) group is currently collapsed —
  // drives the chip's label between "Collapse All" and "Expand All".
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

  // Non-blocking image prefetch for the first viewport. Fire-and-forget
  // so the paint isn't gated by CDN latency — with transition=0 on the
  // grid cards, disk-cached images pop in instantly and uncached ones
  // just swap the placeholder without a 150 ms fade cascade.
  useEffect(() => {
    if (!isReady || displayEntries.length === 0) return;
    const uris = displayEntries
      .slice(0, cardsPerRow * 6)
      .map((e) => e.cards.image_uri_normal || e.cards.image_uri_small)
      .filter((u): u is string => !!u);
    if (uris.length > 0) ExpoImage.prefetch(uris).catch(() => {});
  }, [isReady, displayEntries, cardsPerRow]);

  const availableSets = useMemo(() => deriveAvailableSets(entries), [entries]);
  const availableLanguages = useMemo(() => deriveAvailableLanguages(entries), [entries]);
  const availableFilterTags = useMemo(
    () => deriveAvailableTags(entries, tagsByEntryId, availableTags),
    [entries, tagsByEntryId, availableTags],
  );

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
  // During enrichment the live value ticks up chunk-by-chunk. Pin to
  // the cached value until isReady so the header doesn't flicker.
  const displayValue = isReady
    ? liveStats.displayValue
    : (!isFiltered && cachedStats ? cachedStats.total_value : 0);
  const isGrid = viewMode !== 'list';

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

  // When numColumns is 1, FlatList ignores columnWrapperStyle — fall back
  // to per-item marginBottom so row spacing stays consistent. useMemo
  // so the style object is ref-stable between renders; otherwise the
  // memoized card components would repaint on every parent render.
  const itemSpacingStyle = useMemo(
    () => (cardsPerRow === 1 ? { marginBottom: GRID_GAP } : null),
    [cardsPerRow]
  );

  // Render funcs are recreated when the selection changes (so the
  // individual `isSelected` props update), but the heavy lifting —
  // deciding whether to actually repaint — happens inside each memo'd
  // card: if that card's isSelected + stable refs didn't change, it
  // skips the render. Net effect: toggling one card repaints two
  // cards, not 21k.
  const renderGridCompactItem = useCallback(
    ({ item }: { item: CollectionEntry }) => (
      <GridCompactCard
        item={item}
        width={gridItemWidth}
        spacingStyle={itemSpacingStyle}
        isSelected={bulk.isSelected(item.id)}
        onPress={handleCardPress}
        onLongPress={handleEditPress}
      />
    ),
    [gridItemWidth, itemSpacingStyle, bulk.isSelected, handleCardPress, handleEditPress]
  );

  const renderGridItem = useCallback(
    ({ item }: { item: CollectionEntry }) => (
      <GridCard
        item={item}
        width={gridItemWidth}
        spacingStyle={itemSpacingStyle}
        isSelected={bulk.isSelected(item.id)}
        onPress={handleCardPress}
        onLongPress={handleEditPress}
      />
    ),
    [gridItemWidth, itemSpacingStyle, bulk.isSelected, handleCardPress, handleEditPress]
  );

  /* ── List view ── */
  function renderListItem({ item }: { item: CollectionEntry }) {
    return (
      <ListRow
        item={item}
        tagsById={tagsById}
        onPress={handleCardPress}
        onLongPress={handleEditPress}
      />
    );
  }

  // Single render path used by GroupedCollectionList. Routes to the
  // same memoized card components the ungrouped path uses; width is
  // injected from the grouped list (which knows its own row layout).
  const renderCardForGrouped = useCallback(
    (item: CollectionEntry, width: number) => {
      if (viewMode === 'list') {
        return (
          <ListRow
            item={item}
            tagsById={tagsById}
            onPress={handleCardPress}
            onLongPress={handleEditPress}
          />
        );
      }
      if (viewMode === 'grid-compact') {
        return (
          <GridCompactCard
            item={item}
            width={width}
            isSelected={bulk.isSelected(item.id)}
            onPress={handleCardPress}
            onLongPress={handleEditPress}
          />
        );
      }
      return (
        <GridCard
          item={item}
          width={width}
          isSelected={bulk.isSelected(item.id)}
          onPress={handleCardPress}
          onLongPress={handleEditPress}
        />
      );
    },
    [viewMode, tagsById, bulk.isSelected, handleCardPress, handleEditPress],
  );

  // Direction-driven toolbar collapse.
  // `hidden` is a 0..1 flag: scroll down past 40 px flips it to 1, any
  // reverse drag flips it back to 0 — even mid-scroll, matching Safari
  // / Instagram. Spring keeps the motion fluid, not on/off.
  const lastY = useSharedValue(0);
  const hidden = useSharedValue(0);
  const SPRING = { damping: 20, stiffness: 140, mass: 0.8 } as const;

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      const y = e.contentOffset.y;
      const delta = y - lastY.value;
      if (y <= 0) {
        hidden.value = withSpring(0, SPRING);
      } else if (delta > 2 && y > 40) {
        hidden.value = withSpring(1, SPRING);
      } else if (delta < -2) {
        hidden.value = withSpring(0, SPRING);
      }
      lastY.value = y;
    },
  });

  const toolbarStyle = useAnimatedStyle(() => ({
    opacity: 1 - hidden.value,
    height: interpolate(hidden.value, [0, 1], [toolbarHeight, 0], Extrapolation.CLAMP),
    overflow: 'hidden',
  }));

  // When grouping is active, sticky group headers collide with the
  // header card's rounded corner and the page bg "tooths" through. We
  // interpolate the bottom radius to 0 once scroll starts so the seam
  // stays clean. With no grouping (the FlatList renders cards directly,
  // no sticky chrome) we keep the corner static — there's nothing to
  // collide with.
  const isGrouped = groupBy !== 'none';
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

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.headerCard, headerCardStyle]}>
        <View style={[styles.headerInner, { paddingTop: insets.top + spacing.sm }]}>
          {/* ── Header ── Cross-fade between normal and bulk so the switch
              doesn't feel like a jump cut. 180 ms fade is long enough to
              read as "smooth" and short enough to not impede bulk entry.
              The bulk header uses a non-breaking-space subtitle so its
              height matches the normal header — no layout shift. */}
          {bulk.isActive ? (
            <Animated.View
              key="bulk-header"
              entering={FadeIn.duration(180)}
              exiting={FadeOut.duration(180)}
              style={styles.headerRow}
            >
              <TouchableOpacity onPress={bulk.exit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={28} color={colors.text} />
              </TouchableOpacity>
              <View style={styles.headerCenter}>
                <Text style={styles.title} numberOfLines={1}>
                  {bulk.size === 0 ? 'Select cards' : `${bulk.size} selected`}
                </Text>
                <Text style={styles.headerSubtitle}>
                  {bulk.size === 0 ? 'Tap cards to select' : '\u00A0'}
                </Text>
              </View>
              <View style={{ width: 28 }} />
            </Animated.View>
          ) : (
            <Animated.View
              key="normal-header"
              entering={FadeIn.duration(180)}
              exiting={FadeOut.duration(180)}
              style={styles.headerRow}
            >
              <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="chevron-back" size={28} color={colors.text} />
              </TouchableOpacity>
              <View style={styles.headerCenter}>
                <Text style={styles.title} numberOfLines={1}>{collectionName ?? 'Collection'}</Text>
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
              <TouchableOpacity onPress={() => setShowActions(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="ellipsis-horizontal-circle-outline" size={28} color={colors.text} />
              </TouchableOpacity>
            </Animated.View>
          )}
        </View>

        {/* ── Toolbar inside the header card (collapses on scroll) ── */}
        {bulk.isActive ? (
          <Animated.View
            key="bulk-bar"
            entering={FadeIn.duration(180)}
            exiting={FadeOut.duration(180)}
          >
            <BulkActionsBar
              count={bulk.size}
              onTag={handleBulkTag}
              onMove={handleBulkMove}
              onAdd={handleBulkAdd}
              onDelete={handleBulkDelete}
            />
          </Animated.View>
        ) : (
          <Animated.View
            key="normal-bar"
            entering={FadeIn.duration(180)}
            exiting={FadeOut.duration(180)}
            style={toolbarStyle}
          >
            <CollectionToolbar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              viewMode={viewMode}
              onToggleView={() => setViewMode(nextViewMode(viewMode))}
              onSortPress={() => setShowSort(true)}
              onFilterPress={() => setShowFilter(true)}
              activeFilters={countActiveFilters(filters)}
              onGroupPress={() => setShowGroupBy(true)}
              groupActive={groupBy !== 'none'}
              size={toolbarSize}
            />
          </Animated.View>
        )}
      </Animated.View>

      {/* ── Content ──
          On first open we wait for enrichment before painting the grid
          — placeholder cards resolving chunk-by-chunk looked like
          flickering on big binders. Once painted the grid stays up;
          later writes re-enrich in the background without hiding it. */}
      {!showGrid ? (
        <View style={styles.centered}>
          {loaderVisible && (
            <ActivityIndicator color={colors.primary} size="large" />
          )}
        </View>
      ) : groupBy !== 'none' ? (
        <GroupedCollectionList
          groups={groups}
          cardsPerRow={isGrid ? cardsPerRow : 1}
          cardWidth={isGrid ? gridItemWidth : SCREEN_WIDTH - GRID_PADDING * 2}
          gridGap={GRID_GAP}
          renderCard={renderCardForGrouped}
          cardKey={(item) => item.id}
          collapsedKeys={collapsedKeys}
          onToggleKey={handleToggleGroupKey}
          contentContainerStyle={styles.groupedList}
          onScroll={scrollHandler}
          ListEmptyComponent={isReady ? emptyComponent : null}
        />
      ) : isGrid ? (
        <Animated.FlatList
          key={`${viewMode}-${cardsPerRow}`}
          data={displayEntries}
          keyExtractor={(item) => item.id}
          renderItem={viewMode === 'grid-compact' ? renderGridCompactItem : renderGridItem}
          numColumns={cardsPerRow}
          columnWrapperStyle={cardsPerRow > 1 ? styles.gridRow : undefined}
          contentContainerStyle={styles.gridList}
          ListEmptyComponent={isReady ? emptyComponent : null}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
        />
      ) : (
        <Animated.FlatList
          key="list"
          data={displayEntries}
          keyExtractor={(item) => item.id}
          renderItem={renderListItem}
          contentContainerStyle={styles.listList}
          ListEmptyComponent={isReady ? emptyComponent : null}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
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
        availableTags={availableFilterTags}
        onApply={setFilters}
        onReset={() => setFilters(EMPTY_FILTERS)}
        onClose={() => setShowFilter(false)}
      />

      <GroupBySheet
        visible={showGroupBy}
        current={groupBy}
        onSelect={(g) => { setGroupBy(g); setShowGroupBy(false); }}
        onClose={() => setShowGroupBy(false)}
        allCollapsed={allGroupsCollapsed}
        onToggleAllCollapsed={handleToggleAllCollapsed}
        collapseDisabled={groups.length === 0}
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
        itemColor={collectionColor}
        itemCount={totalCards}
        itemValue={displayValue}
        inFolder={!!collectionFolderId}
        isQuickAddTarget={id === quickAddTargetId}
        hideReorder
        canSelectCards={viewMode !== 'list'}
        onAction={(key) => {
          setShowActions(false);
          if (key === 'select-cards') {
            bulk.enter();
            return;
          }
          if (key === 'edit') setShowEditInfo(true);
          else if (key === 'merge') setShowMerge(true);
          else if (key === 'import') setShowImport(true);
          else if (key === 'export') setShowExport(true);
          else if (key === 'move-to-folder') setShowFolderPicker(true);
          else if (key === 'remove-from-folder') {
            moveToFolderLocal(id!, null).catch(() => {});
          } else if (key === 'set-quick-add') {
            setQuickAddTargetId(id!).then(() => {
              showToast(`Quick Add → ${collectionName}`);
            });
          } else if (key === 'clear-quick-add') {
            setQuickAddTargetId(null).then(() => {
              showToast('Quick Add target cleared');
            });
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
                    emptyCollectionLocal(id!)
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

      <DestinationPickerModal
        visible={bulkPickerMode !== null}
        destinations={bulkDestinations}
        selectedId={null}
        onSelect={handleBulkPickerSelect}
        onClose={() => setBulkPickerMode(null)}
      />

      <TagPicker
        visible={bulkTagSheetOpen}
        collectionId={id}
        selectedCardIds={selectedIdsList}
        onAddTags={handleTagPickerAdd}
        onRemoveTags={handleTagPickerRemove}
        onClose={() => setBulkTagSheetOpen(false)}
      />
    </View>
  );
}

// List-view row — extracted so we can call useCardTagIds (hooks in a
// render callback aren't allowed). Tag lookups resolve via the
// tagsById map built once in the parent; each row only triggers one
// extra reactive query (its own tag ids).
function ListRow({
  item,
  tagsById,
  onPress,
  onLongPress,
}: {
  item: CollectionEntry;
  tagsById: Map<string, TagWithCount>;
  onPress: (entry: CollectionEntry) => void;
  onLongPress: (entry: CollectionEntry) => void;
}) {
  const card = item.cards;
  const tagIds = useCardTagIds(item.id);
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

  const qty =
    item.quantity_normal + item.quantity_foil + item.quantity_etched;

  const visibleTags = tagIds
    .map((id) => tagsById.get(id))
    .filter((t): t is TagWithCount => !!t);

  return (
    <TouchableOpacity
      style={styles.listCard}
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress(item)}
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
        {visibleTags.length > 0 && (
          <View style={styles.listTagsRow}>
            {visibleTags.map((tag) => (
              <View key={tag.id} style={styles.listTagChip}>
                <View
                  style={[
                    styles.listTagDot,
                    { backgroundColor: tag.color ?? COLLECTION_COLORS[5] },
                  ]}
                />
                <Text style={styles.listTagLabel} numberOfLines={1}>
                  {tag.name}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
      <View style={styles.listRight}>
        <Text style={styles.listPrice}>
          {formatPrice(rowPrice != null ? rowPrice.toString() : undefined)}
        </Text>
        <Text style={styles.listQty}>x{qty}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  /* ── Header ──
   *  Bottom radius is animated via headerCardStyle (collapses to 0 once
   *  scroll starts so sticky group headers seal cleanly against the
   *  card's edge). */
  headerCard: {
    backgroundColor: colors.surface,
    paddingBottom: spacing.xs + 2,
    ...shadows.sm,
  },
  headerInner: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
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

  /* ── Grouped list (sticky headers + chunked rows) ── */
  groupedList: {
    paddingTop: spacing.sm,
    paddingBottom: 100,
  },

  /* Grid card styles moved to CollectionGridCards component. */

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
  listTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  listTagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceSecondary,
  },
  listTagDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  listTagLabel: {
    color: colors.text,
    fontSize: 10,
    fontWeight: '600',
    maxWidth: 80,
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
