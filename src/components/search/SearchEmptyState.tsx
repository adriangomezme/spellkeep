import { memo, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CardImage } from '../collection/CardImage';
import { RecentSearchPreview } from './RecentSearchPreview';
import type { RecentCard } from '../../lib/hooks/useRecentlyViewedCards';
import type { RecentSearch } from '../../lib/hooks/useRecentSearches';
import type { ScryfallCard } from '../../lib/scryfall';
import { getCardImageUri } from '../../lib/scryfall';
import type { AiSuggestionChip } from '../../lib/search/aiSuggestionChips';
import { colors, spacing, fontSize, borderRadius } from '../../constants';

type Props = {
  recentSearches: RecentSearch[];
  recentlyViewed: RecentCard[];
  trendingCards: ScryfallCard[];
  latestSetName: string | null;
  latestSetCards: ScryfallCard[];
  aiChips: AiSuggestionChip[];
  onTapSearch: (query: string) => void;
  onRemoveSearch: (query: string) => void;
  onClearSearches: () => void;
  onTapCard: (card: RecentCard) => void;
  onTapDiscoverCard: (card: ScryfallCard) => void;
  onTapAiChip: (chip: AiSuggestionChip) => void;
};

const PREVIEW_CARD_WIDTH = 180;
const PREVIEW_MAX = 10;

function SearchEmptyStateInner({
  recentSearches,
  recentlyViewed,
  trendingCards,
  latestSetName,
  latestSetCards,
  aiChips,
  onTapSearch,
  onRemoveSearch,
  onClearSearches,
  onTapCard,
  onTapDiscoverCard,
  onTapAiChip,
}: Props) {
  const recentsWithResults = useMemo(
    () => recentSearches.filter((rs) => (rs.total ?? 0) > 0).slice(0, PREVIEW_MAX),
    [recentSearches]
  );
  const hasRecents = recentsWithResults.length > 0;
  const hasViewed = recentlyViewed.length > 0;
  const hasTrending = trendingCards.length > 0;
  const hasLatest = latestSetCards.length > 0;
  const hasAi = aiChips.length > 0;

  // Brand-new install with no catalog data and no history yet — keep
  // the original placeholder so the screen isn't a blank slate.
  if (!hasRecents && !hasViewed && !hasTrending && !hasLatest && !hasAi) {
    return (
      <View style={styles.empty}>
        <View style={styles.emptyIcon}>
          <Ionicons name="sparkles-outline" size={32} color={colors.textMuted} />
        </View>
        <Text style={styles.emptyText}>Search for any Magic card</Text>
        <Text style={styles.emptyHint}>Try a card name, type, or set</Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {hasRecents && (
        <Section
          title="Recent searches"
          action={{ label: 'Clear', onPress: onClearSearches }}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.row}
          >
            {recentsWithResults.map((rs) => (
              <RecentSearchPreview
                key={rs.query}
                item={rs}
                width={PREVIEW_CARD_WIDTH}
                onPress={onTapSearch}
                onRemove={onRemoveSearch}
              />
            ))}
          </ScrollView>
        </Section>
      )}

      {hasAi && (
        <Section
          title="Try a search"
          subtitle="Pre-cooked queries to get you started."
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {aiChips.map((chip) => (
              <TouchableOpacity
                key={chip.id}
                style={styles.aiChip}
                onPress={() => onTapAiChip(chip)}
                activeOpacity={0.6}
              >
                <Ionicons name={chip.icon} size={14} color={colors.primary} />
                <Text style={styles.aiChipLabel}>{chip.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Section>
      )}

      {hasTrending && (
        <Section title="Trending now" subtitle="Top EDHREC cards from recent sets.">
          <DiscoverCarousel
            cards={trendingCards}
            onPress={onTapDiscoverCard}
          />
        </Section>
      )}

      {hasLatest && (
        <Section
          title="Latest release"
          subtitle={latestSetName ? `Highlights from ${latestSetName}` : undefined}
        >
          <DiscoverCarousel
            cards={latestSetCards}
            onPress={onTapDiscoverCard}
          />
        </Section>
      )}

      {hasViewed && (
        <Section title="Recently viewed">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.viewedRow}
          >
            {recentlyViewed.map((c) => (
              <TouchableOpacity
                key={c.id + '-' + c.viewed_at}
                style={styles.viewedCard}
                onPress={() => onTapCard(c)}
                activeOpacity={0.7}
              >
                <CardImage uri={c.image_uri_small} style={styles.viewedImage} />
                <Text style={styles.viewedName} numberOfLines={1}>{c.name}</Text>
                <Text style={styles.viewedSet} numberOfLines={1}>
                  {c.set_code.toUpperCase()} #{c.collector_number}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Section>
      )}
    </ScrollView>
  );
}

export const SearchEmptyState = memo(SearchEmptyStateInner);

// ──────────────────────────────────────────────────────────────────────
// Subcomponents
// ──────────────────────────────────────────────────────────────────────

function Section({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: { label: string; onPress: () => void };
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
        </View>
        {action && (
          <TouchableOpacity onPress={action.onPress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.sectionAction}>{action.label}</Text>
          </TouchableOpacity>
        )}
      </View>
      {children}
    </View>
  );
}

const DISCOVER_CARD_WIDTH = 96;

const DiscoverCarousel = memo(function DiscoverCarousel({
  cards,
  onPress,
}: {
  cards: ScryfallCard[];
  onPress: (card: ScryfallCard) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.viewedRow}
    >
      {cards.map((c) => (
        <TouchableOpacity
          key={c.id}
          style={styles.viewedCard}
          onPress={() => onPress(c)}
          activeOpacity={0.7}
        >
          <CardImage uri={getCardImageUri(c, 'small')} style={styles.viewedImage} />
          <Text style={styles.viewedName} numberOfLines={1}>{c.name}</Text>
          <Text style={styles.viewedSet} numberOfLines={1}>
            {c.set.toUpperCase()} #{c.collector_number}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  scroll: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  emptyHint: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    marginTop: spacing.xs,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  sectionSubtitle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  sectionAction: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  row: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  /* AI chips */
  chipRow: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  aiChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    backgroundColor: colors.primaryLight,
  },
  aiChipLabel: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  /* Discover + Recently viewed shared carousel cell */
  viewedRow: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  viewedCard: {
    width: DISCOVER_CARD_WIDTH,
  },
  viewedImage: {
    width: DISCOVER_CARD_WIDTH,
    height: DISCOVER_CARD_WIDTH * 1.395,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceSecondary,
  },
  viewedName: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  viewedSet: {
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 1,
  },
});
