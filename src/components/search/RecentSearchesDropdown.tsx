import { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import type { RecentSearch } from '../../lib/hooks/useRecentSearches';
import { colors, spacing, fontSize, borderRadius, shadows } from '../../constants';

type Props = {
  items: RecentSearch[];
  onSelect: (rs: RecentSearch) => void;
  onRemove: (query: string) => void;
  /** Tap target that takes the user to the Scryfall syntax reference
   *  page. Rendered as the dropdown's footer so it's always within
   *  reach without crowding the recents above. */
  onOpenSyntaxGuide?: () => void;
};

/**
 * Compact dropdown of recent searches shown when the input is focused
 * but empty (Reddit / Google pattern). Different from the Pinterest-
 * style cards on the landing — this one is text-only and shares the
 * same frosted-glass chrome as `SearchSuggestionsList` so the user
 * reads it as the same overlay surface.
 */
function RecentSearchesDropdownInner({
  items,
  onSelect,
  onRemove,
  onOpenSyntaxGuide,
}: Props) {
  // Cap the visible recents so the syntax-guide row never gets pushed
  // off-screen below the keyboard. 7 is the sweet spot — enough to
  // resurface yesterday's intent, short enough to scan in one glance.
  const visibleItems = items.slice(0, 7);
  // Even with no recents, surface the syntax guide so brand-new users
  // discover the operator catalog immediately.
  const hasRecents = visibleItems.length > 0;
  if (!hasRecents && !onOpenSyntaxGuide) return null;

  return (
    <BlurView
      intensity={60}
      tint="light"
      experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : 'none'}
      style={styles.container}
    >
      <View style={styles.tint}>
        {visibleItems.map((rs, idx) => (
          <View key={rs.query}>
            <TouchableOpacity
              style={styles.row}
              onPress={() => onSelect(rs)}
              activeOpacity={0.6}
            >
              <Ionicons name="time-outline" size={16} color={colors.textMuted} />
              <Text style={styles.text} numberOfLines={1}>{rs.query}</Text>
              <TouchableOpacity
                onPress={() => onRemove(rs.query)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </TouchableOpacity>
            {idx < visibleItems.length - 1 && <View style={styles.separator} />}
          </View>
        ))}

        {onOpenSyntaxGuide && (
          <TouchableOpacity
            style={[styles.row, styles.guideRow]}
            onPress={onOpenSyntaxGuide}
            activeOpacity={0.6}
          >
            <Ionicons name="book-outline" size={16} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.guideTitle} numberOfLines={1}>
                Search syntax guide
              </Text>
              <Text style={styles.guideSubtitle} numberOfLines={1}>
                Operators, examples & power-user shortcuts
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>
    </BlurView>
  );
}

export const RecentSearchesDropdown = memo(RecentSearchesDropdownInner);

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    borderBottomLeftRadius: borderRadius.sm,
    borderBottomRightRadius: borderRadius.sm,
    overflow: 'hidden',
    ...shadows.md,
  },
  tint: {
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md - 2,
    gap: spacing.md,
  },
  text: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.06)',
    marginLeft: spacing.lg + 16 + spacing.md,
  },
  guideRow: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.08)',
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  guideTitle: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  guideSubtitle: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
});
