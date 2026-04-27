import { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CardImage } from '../collection/CardImage';
import type { RecentSearch } from '../../lib/hooks/useRecentSearches';
import { colors, spacing, fontSize, borderRadius, shadows } from '../../constants';

type Props = {
  item: RecentSearch;
  width: number;
  onPress: (rs: RecentSearch) => void;
  onRemove: (query: string) => void;
};

const CARD_RATIO = 1.395;

/**
 * Pinterest-style preview card for a recent search:
 *   - 2x2 mini grid of result thumbnails (up to 4, padded with empty
 *     slots if the search returned fewer)
 *   - Search keyword (or friendly label for structured searches)
 *   - Result count (only when known — older entries that haven't
 *     re-run since the previews feature shipped will lack this)
 *
 * Tap → re-runs the search (text + filters + sort if structured).
 * × → removes the entry from history.
 */
function RecentSearchPreviewInner({ item, width, onPress, onRemove }: Props) {
  const previews = (item.previews ?? []).slice(0, 4);
  const slots: (string | null)[] = [
    previews[0] ?? null,
    previews[1] ?? null,
    previews[2] ?? null,
    previews[3] ?? null,
  ];
  const innerPad = spacing.sm;
  const innerGap = spacing.xs;
  const thumbWidth = (width - innerPad * 2 - innerGap) / 2;
  const thumbHeight = thumbWidth * CARD_RATIO;

  return (
    <Pressable
      style={[styles.card, { width }]}
      onPress={() => onPress(item)}
    >
      <View style={[styles.grid, { padding: innerPad, gap: innerGap }]}>
        {[0, 2].map((rowStart) => (
          <View key={rowStart} style={[styles.gridRow, { gap: innerGap }]}>
            {[0, 1].map((col) => {
              const uri = slots[rowStart + col];
              return (
                <View
                  key={col}
                  style={{
                    width: thumbWidth,
                    height: thumbHeight,
                    borderRadius: borderRadius.sm / 2,
                    overflow: 'hidden',
                    backgroundColor: colors.surfaceSecondary,
                  }}
                >
                  {uri ? (
                    <CardImage uri={uri} style={{ width: '100%', height: '100%' }} transition={0} />
                  ) : null}
                </View>
              );
            })}
          </View>
        ))}
      </View>

      <View style={styles.meta}>
        <View style={styles.metaText}>
          <Text style={styles.query} numberOfLines={1}>{item.query}</Text>
          <Text style={styles.count} numberOfLines={1}>
            {item.total != null
              ? `${item.total.toLocaleString()} result${item.total === 1 ? '' : 's'}`
              : 'Tap to search again'}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => onRemove(item.query)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
    </Pressable>
  );
}

export const RecentSearchPreview = memo(RecentSearchPreviewInner);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    ...shadows.sm,
  },
  grid: {
    backgroundColor: colors.surfaceSecondary,
  },
  gridRow: {
    flexDirection: 'row',
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  metaText: {
    flex: 1,
  },
  query: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  count: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
});
