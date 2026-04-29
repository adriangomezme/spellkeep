import { memo, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CardImage } from '../collection/CardImage';
import {
  formatUSD,
  pickAnyPrice,
  type ScryfallCard,
  getCardImageUri,
} from '../../lib/scryfall';
import type { ViewMode } from '../collection/CollectionToolbar';
import { colors, spacing, fontSize, borderRadius, shadows } from '../../constants';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_GAP = spacing.sm;
const GRID_PADDING = spacing.lg;
const CARD_IMAGE_RATIO = 1.395;

function computeGridItemWidth(cardsPerRow: number): number {
  return (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP * (cardsPerRow - 1)) / cardsPerRow;
}

type Props = {
  results: ScryfallCard[];
  viewMode: ViewMode;
  cardsPerRow: number;
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onPress: (card: ScryfallCard) => void;
  isEmpty: boolean;
  /** Total count from the latest search query — rendered as a small
   *  caption above the first result. Hidden when 0 / loading-into-empty. */
  totalCards?: number;
};

function CompactItem({ card, onPress, width, marginBottom }: { card: ScryfallCard; onPress: (c: ScryfallCard) => void; width: number; marginBottom: number | null }) {
  return (
    <TouchableOpacity
      style={[styles.gridCompactCard, { width }, marginBottom != null ? { marginBottom } : null]}
      onPress={() => onPress(card)}
      activeOpacity={0.7}
    >
      <CardImage uri={getCardImageUri(card, 'normal')} style={styles.gridCompactImage} transition={0} />
    </TouchableOpacity>
  );
}

function GridItem({ card, onPress, width, marginBottom }: { card: ScryfallCard; onPress: (c: ScryfallCard) => void; width: number; marginBottom: number | null }) {
  return (
    <TouchableOpacity
      style={[styles.gridCard, { width }, marginBottom != null ? { marginBottom } : null]}
      onPress={() => onPress(card)}
      activeOpacity={0.7}
    >
      <View style={styles.gridImageWrap}>
        <CardImage uri={getCardImageUri(card, 'normal')} style={styles.gridImage} transition={0} />
      </View>
      <View style={styles.gridMeta}>
        <Text style={styles.gridName} numberOfLines={1}>{card.name}</Text>
        <View style={styles.gridBottom}>
          <Text style={styles.gridSet} numberOfLines={1}>
            {card.set.toUpperCase()} #{card.collector_number}
          </Text>
          <Text style={styles.gridPrice}>{formatUSD(pickAnyPrice(card))}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function ListItem({ card, onPress }: { card: ScryfallCard; onPress: (c: ScryfallCard) => void }) {
  return (
    <TouchableOpacity
      style={styles.listCard}
      onPress={() => onPress(card)}
      activeOpacity={0.6}
    >
      <CardImage uri={getCardImageUri(card, 'small')} style={styles.listImage} />
      <View style={styles.listInfo}>
        <Text style={styles.listName} numberOfLines={1}>{card.name}</Text>
        <Text style={styles.listType} numberOfLines={1}>{card.type_line}</Text>
        <Text style={styles.listSet} numberOfLines={1}>
          {card.set_name} · #{card.collector_number}
        </Text>
      </View>
      <View style={styles.listRight}>
        <Text style={styles.listPrice}>{formatUSD(pickAnyPrice(card))}</Text>
        <Text style={styles.listRarity}>{card.rarity}</Text>
      </View>
    </TouchableOpacity>
  );
}

function SearchResultsInner({
  results,
  viewMode,
  cardsPerRow,
  isLoading,
  hasMore,
  onLoadMore,
  onPress,
  isEmpty,
  totalCards,
}: Props) {
  const gItemWidth = useMemo(() => computeGridItemWidth(cardsPerRow), [cardsPerRow]);
  // FlatList ignores columnWrapperStyle when numColumns === 1, so we
  // fall back to per-item marginBottom in that case.
  const itemMarginBottom = cardsPerRow === 1 ? GRID_GAP : null;

  const renderCompact = useCallback(
    ({ item }: { item: ScryfallCard }) => (
      <CompactItem card={item} onPress={onPress} width={gItemWidth} marginBottom={itemMarginBottom} />
    ),
    [onPress, gItemWidth, itemMarginBottom]
  );

  const renderGrid = useCallback(
    ({ item }: { item: ScryfallCard }) => (
      <GridItem card={item} onPress={onPress} width={gItemWidth} marginBottom={itemMarginBottom} />
    ),
    [onPress, gItemWidth, itemMarginBottom]
  );

  const renderList = useCallback(
    ({ item }: { item: ScryfallCard }) => (
      <ListItem card={item} onPress={onPress} />
    ),
    [onPress]
  );

  const empty = isEmpty && !isLoading ? (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name="search" size={32} color={colors.textMuted} />
      </View>
      <Text style={styles.emptyText}>No cards found</Text>
    </View>
  ) : null;

  const footer = isLoading ? (
    <ActivityIndicator size="small" color={colors.primary} style={styles.loader} />
  ) : null;

  // Result-count caption pinned above the first result. Only shown
  // when we actually have results so the "no cards found" empty
  // state stays uncluttered.
  const header = totalCards != null && totalCards > 0 && results.length > 0 ? (
    <Text style={styles.resultCount}>
      {totalCards.toLocaleString()} {totalCards === 1 ? 'result' : 'results'}
    </Text>
  ) : null;

  if (viewMode === 'list') {
    return (
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        renderItem={renderList}
        contentContainerStyle={styles.listContainer}
        onEndReached={hasMore ? onLoadMore : undefined}
        onEndReachedThreshold={0.4}
        initialNumToRender={12}
        windowSize={7}
        maxToRenderPerBatch={10}
        removeClippedSubviews
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
      />
    );
  }

  return (
    <FlatList
      key={`${viewMode}-${cardsPerRow}`}
      data={results}
      keyExtractor={(item) => item.id}
      renderItem={viewMode === 'grid-compact' ? renderCompact : renderGrid}
      numColumns={cardsPerRow}
      columnWrapperStyle={cardsPerRow > 1 ? styles.gridRow : undefined}
      contentContainerStyle={styles.gridContainer}
      onEndReached={hasMore ? onLoadMore : undefined}
      onEndReachedThreshold={0.5}
      initialNumToRender={8}
      windowSize={7}
      maxToRenderPerBatch={6}
      removeClippedSubviews
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ListFooterComponent={footer}
    />
  );
}

export const SearchResults = memo(SearchResultsInner);

const styles = StyleSheet.create({
  gridContainer: {
    paddingHorizontal: GRID_PADDING,
    paddingTop: spacing.sm,
    paddingBottom: 100,
  },
  resultCount: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '700',
    letterSpacing: -0.1,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm + 2,
  },
  gridRow: {
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
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
  listContainer: {
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
    width: 56,
    height: 78,
    borderRadius: borderRadius.sm,
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
  listSet: {
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
    fontWeight: '700',
  },
  listRarity: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  empty: {
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  loader: {
    paddingVertical: spacing.lg,
  },
});
