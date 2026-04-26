import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  FlatList,
  RefreshControlProps,
  StyleProp,
  View,
  ViewStyle,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { GroupHeader } from './GroupHeader';
import type { Group } from '../../lib/cardListUtils';
import { spacing } from '../../constants';

type HeaderItem<T> = {
  type: 'header';
  group: Group<T>;
  isCollapsed: boolean;
};
type CardRowItem<T> = {
  type: 'card-row';
  groupKey: string;
  rowIndex: number;
  /** True only for the first card-row of each group — used to add a
   *  breathing-room margin under the sticky header. */
  isFirstInGroup: boolean;
  cards: T[];
};
type Item<T> = HeaderItem<T> | CardRowItem<T>;

type Props<T> = {
  groups: Group<T>[];
  cardsPerRow: number;
  /** Width assigned to each card in a row (already computed by caller). */
  cardWidth: number;
  /** Gap between cards inside a row (matches the ungrouped grid). */
  gridGap: number;
  /** Render a single card. Width is provided so caller can keep one
   *  source of truth for card sizing. */
  renderCard: (item: T, width: number) => React.ReactElement;
  /** keyExtractor per item — must be stable across renders. */
  cardKey: (item: T) => string;
  /** Controlled collapse state owned by the parent so the sheet can
   *  collapse-all / expand-all without losing per-group toggles. */
  collapsedKeys: Set<string>;
  onToggleKey: (key: string) => void;
  contentContainerStyle?: StyleProp<ViewStyle>;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  onScroll?: (...args: any[]) => void;
  scrollEventThrottle?: number;
  ListEmptyComponent?: React.ReactElement | null;
};

export function GroupedCollectionList<T>({
  groups,
  cardsPerRow,
  cardWidth,
  gridGap,
  renderCard,
  cardKey,
  collapsedKeys,
  onToggleKey,
  contentContainerStyle,
  refreshControl,
  onScroll,
  scrollEventThrottle,
  ListEmptyComponent,
}: Props<T>) {
  const listRef = useRef<FlatList<Item<T>>>(null);

  const { items, stickyIndices } = useMemo(() => {
    const out: Item<T>[] = [];
    const sticky: number[] = [];
    for (const g of groups) {
      if (g.entries.length === 0) continue;
      sticky.push(out.length);
      const isCollapsed = collapsedKeys.has(g.key);
      out.push({ type: 'header', group: g, isCollapsed });
      if (isCollapsed) continue;
      // Chunk into rows of N. List view ⇒ cardsPerRow = 1.
      for (let i = 0; i < g.entries.length; i += cardsPerRow) {
        const rowIndex = i / cardsPerRow;
        out.push({
          type: 'card-row',
          groupKey: g.key,
          rowIndex,
          isFirstInGroup: rowIndex === 0,
          cards: g.entries.slice(i, i + cardsPerRow),
        });
      }
    }
    return { items: out, stickyIndices: sticky };
  }, [groups, collapsedKeys, cardsPerRow]);

  const keyExtractor = useCallback((item: Item<T>) => {
    if (item.type === 'header') return `header:${item.group.key}`;
    return `row:${item.groupKey}:${item.rowIndex}`;
  }, []);

  // Items are mutated synchronously through useMemo; this ref lets the
  // post-collapse scroll handler look up the new layout on the next
  // paint without re-binding to a stale closure.
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  // Collapsing a deeply-scrolled group leaves the user "deep" inside
  // the next group, because removing 500 rows above the current
  // scrollY shifts everything up but the offset stays put. Snap the
  // toggled header to the viewport top so the next group reads from
  // its actual start.
  const handleHeaderToggle = useCallback(
    (key: string) => {
      const wasCollapsed = collapsedKeys.has(key);
      onToggleKey(key);
      if (wasCollapsed) return;
      requestAnimationFrame(() => {
        const next = itemsRef.current;
        const idx = next.findIndex(
          (it) => it.type === 'header' && it.group.key === key,
        );
        if (idx >= 0) {
          listRef.current?.scrollToIndex({
            index: idx,
            viewPosition: 0,
            animated: false,
          });
        }
      });
    },
    [collapsedKeys, onToggleKey],
  );

  const handleScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      // Headers are usually in-viewport when toggled, so this is rare.
      // Defensive fallback uses the average row length to land near
      // the target; FlatList will then re-virtualize and we retry.
      listRef.current?.scrollToOffset({
        offset: Math.max(0, info.index * info.averageItemLength),
        animated: false,
      });
      requestAnimationFrame(() => {
        listRef.current?.scrollToIndex({
          index: info.index,
          viewPosition: 0,
          animated: false,
        });
      });
    },
    [],
  );

  // iOS sticky-header bug: when scrolling fast in either direction,
  // the FlatList briefly paints the wrong "candidate" sticky on top
  // of the active one (e.g. tag #1 flashes while you're at tag #5).
  // Bumping zIndex on header cells via CellRendererComponent puts
  // the active sticky reliably above its neighbours during transition.
  const CellRenderer = useCallback(
    ({ index, children, style, ...rest }: any) => {
      const isHeader = itemsRef.current[index]?.type === 'header';
      return (
        <View
          style={[style, isHeader && { zIndex: 10, elevation: 10 }]}
          {...rest}
        >
          {children}
        </View>
      );
    },
    [],
  );

  const baseRowStyle = useMemo<ViewStyle>(
    () => ({
      flexDirection: 'row',
      gap: gridGap,
      paddingHorizontal: spacing.lg,
      marginBottom: gridGap,
    }),
    [gridGap],
  );
  const firstRowStyle = useMemo<ViewStyle>(
    () => ({ ...baseRowStyle, marginTop: spacing.md }),
    [baseRowStyle],
  );
  const firstListRowStyle = useMemo<ViewStyle>(
    () => ({ ...listRowWrap, marginTop: spacing.md }),
    [],
  );

  const renderItem = useCallback(
    ({ item }: { item: Item<T> }) => {
      if (item.type === 'header') {
        return (
          <GroupHeader
            group={item.group as Group<unknown>}
            isCollapsed={item.isCollapsed}
            onToggle={handleHeaderToggle}
          />
        );
      }
      // List view (1 col): render directly without the row wrapper to
      // keep the existing list-row styling intact.
      if (cardsPerRow === 1) {
        const only = item.cards[0];
        return (
          <View style={item.isFirstInGroup ? firstListRowStyle : listRowWrap}>
            {renderCard(only, cardWidth)}
          </View>
        );
      }
      return (
        <View style={item.isFirstInGroup ? firstRowStyle : baseRowStyle}>
          {item.cards.map((c) => (
            <View key={cardKey(c)}>{renderCard(c, cardWidth)}</View>
          ))}
        </View>
      );
    },
    [cardsPerRow, cardWidth, renderCard, cardKey, baseRowStyle, firstRowStyle, firstListRowStyle, handleHeaderToggle],
  );

  return (
    <Animated.FlatList
      ref={listRef as any}
      data={items}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      stickyHeaderIndices={stickyIndices}
      CellRendererComponent={CellRenderer as any}
      contentContainerStyle={contentContainerStyle}
      refreshControl={refreshControl}
      onScroll={onScroll}
      scrollEventThrottle={scrollEventThrottle ?? 16}
      ListEmptyComponent={ListEmptyComponent}
      removeClippedSubviews={false}
      windowSize={11}
      onScrollToIndexFailed={handleScrollToIndexFailed}
    />
  );
}

const listRowWrap: ViewStyle = {
  paddingHorizontal: spacing.lg,
};
