import { memo, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { CardImage } from '../collection/CardImage';
import { RecentSearchPreview } from './RecentSearchPreview';
import { MTGGlyph, type ManaGlyph } from '../MTGGlyph';
import type { RecentCard } from '../../lib/hooks/useRecentlyViewedCards';
import type { RecentSearch } from '../../lib/hooks/useRecentSearches';
import type { ScryfallCard } from '../../lib/scryfall';
import { getCardImageUri } from '../../lib/scryfall';
import type { AiSuggestionChip } from '../../lib/search/aiSuggestionChips';
import type { DiscoveryBucket } from '../../lib/hooks/useWeeklyBucket';
import {
  useTopCommanders,
  type CommanderWindow,
} from '../../lib/hooks/useTopCommanders';
import {
  useMetaDecks,
  type MetaFormat,
  type MetaDeck,
} from '../../lib/hooks/useMetaDecks';
import { colors, spacing, fontSize, borderRadius, shadows } from '../../constants';

type Props = {
  recentSearches: RecentSearch[];
  recentlyViewed: RecentCard[];
  /** Cards printed across the catalog in the last ~45 days (Layer 2
   *  of the Discovery redesign). Replaces the old Trending/Latest
   *  pair which both converged on the same Commander staples. */
  newlyPrintedCards: ScryfallCard[];
  /** This week's themed bucket loaded from Supabase, plus its cards
   *  (Layer 4). When the bucket fetch fails or returns zero hits the
   *  whole section is hidden — discovery is additive, not load-bearing. */
  weeklyBucket: DiscoveryBucket | null;
  weeklyBucketCards: ScryfallCard[];
  aiChips: AiSuggestionChip[];
  onTapSearch: (rs: RecentSearch) => void;
  onRemoveSearch: (query: string) => void;
  onClearSearches: () => void;
  onTapCard: (card: RecentCard) => void;
  onTapDiscoverCard: (card: ScryfallCard) => void;
  onTapAiChip: (chip: AiSuggestionChip) => void;
  /** Stage the weekly bucket's Scryfall query into the search input
   *  so the user can browse the full result set, not just the
   *  preview row. */
  onTapWeeklyBucketSeeAll: (bucket: DiscoveryBucket) => void;
  /** Opens the AI Search modal — wired to the editorial AD's header
   *  area between Weekly bucket and Newly printed. */
  onOpenAi: () => void;
  /** Tapping an example pill in the AI AD opens the AI Search modal
   *  with the prompt prefilled. */
  onTapAiExample: (prompt: string) => void;
  /** "See all" action shared by every Newly-printed-style placeholder
   *  block — stages a Scryfall query covering the last release window
   *  into the search input so the user can browse the full catalog
   *  for that section. */
  onSeeAllNewlyPrinted: () => void;
};

const PREVIEW_CARD_WIDTH = 180;
const PREVIEW_MAX = 16;

function SearchEmptyStateInner({
  recentSearches,
  recentlyViewed,
  newlyPrintedCards,
  weeklyBucket,
  weeklyBucketCards,
  aiChips,
  onTapSearch,
  onRemoveSearch,
  onClearSearches,
  onTapCard,
  onTapDiscoverCard,
  onTapAiChip,
  onTapWeeklyBucketSeeAll,
  onOpenAi,
  onTapAiExample,
  onSeeAllNewlyPrinted,
}: Props) {
  // Show recent entries even when total/previews aren't recorded yet —
  // the preview card pads with empty thumbnail slots, so older entries
  // (saved before the previews feature shipped) still surface here.
  const recentsWithResults = useMemo(
    () => recentSearches.slice(0, PREVIEW_MAX),
    [recentSearches]
  );
  const hasRecents = recentsWithResults.length > 0;
  const hasViewed = recentlyViewed.length > 0;
  const hasNewlyPrinted = newlyPrintedCards.length > 0;
  const hasBucket = !!weeklyBucket && weeklyBucketCards.length > 0;
  const hasAi = aiChips.length > 0;

  // Brand-new install with no catalog data and no history yet — keep
  // the original placeholder so the screen isn't a blank slate.
  if (!hasRecents && !hasViewed && !hasNewlyPrinted && !hasBucket && !hasAi) {
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
      {/* 1. Pre-cooked query pills — no title/subtitle, the row leads. */}
      {hasAi && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillsRow}
          style={styles.pillsBlock}
        >
          {aiChips.map((chip) => (
            <TouchableOpacity
              key={chip.id}
              style={styles.aiChip}
              onPress={() => onTapAiChip(chip)}
              activeOpacity={0.6}
            >
              <Ionicons name={chip.icon} size={14} color={colors.accent} />
              <Text style={styles.aiChipLabel}>{chip.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* 2. Recently viewed — gallery layout with a vertical
            "LAST VIEWED" blur strip on the LEFT edge. The strip is
            absolutely positioned so cards scroll BEHIND it and the
            blur picks up the underlying art for a frosted-glass look. */}
      {hasViewed && (
        <View style={styles.stripSection}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.stripCarouselRow}
          >
            {recentlyViewed.map((c) => (
              <TouchableOpacity
                key={c.id + '-' + c.viewed_at}
                style={styles.viewedCard}
                onPress={() => onTapCard(c)}
                activeOpacity={0.7}
              >
                <CardImage
                  uri={c.image_uri_normal ?? c.image_uri_small}
                  style={styles.viewedImage}
                />
              </TouchableOpacity>
            ))}
          </ScrollView>
          <BlurView intensity={28} tint="light" style={styles.stripRight}>
            <Text style={styles.stripLabel}>LAST VIEWED</Text>
          </BlurView>
        </View>
      )}

      {/* 3. Recent searches — white card with shadow, conventional
            title + Clear action. Preview cards (180 px) are too big
            to share the vertical-strip pattern with Recently viewed. */}
      {hasRecents && (
        <Section
          title="Recent searches"
          action={{ label: 'Clear', onPress: onClearSearches }}
          variant="white"
          compactTitle
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

      {/* 4. This Week's pick — full-bleed editorial accent. */}
      {hasBucket && weeklyBucket && (
        <WeeklyBucketSection
          bucket={weeklyBucket}
          cards={weeklyBucketCards}
          onPressCard={onTapDiscoverCard}
          onPressSeeAll={() => onTapWeeklyBucketSeeAll(weeklyBucket)}
        />
      )}

      {/* AI Search promotional banner — premium navy surface that
          motivates first-time use by showing what natural-language
          queries look like. Header tap → opens the AI Search sheet
          empty; tapping any example pill → opens it pre-filled with
          that prompt. */}
      <AiSearchAd onOpenEmpty={onOpenAi} onTapExample={onTapAiExample} />

      {/* 5. Newly printed — single section with "See all" that stages
            a recent-release query into the search input. */}
      {hasNewlyPrinted && (
        <Section
          title="Newly printed"
          subtitle="Fresh prints from the last 45 days, across every set type."
          variant="white"
          action={{ label: 'See all', onPress: onSeeAllNewlyPrinted }}
        >
          <DiscoverCarousel
            cards={newlyPrintedCards}
            onPress={onTapDiscoverCard}
            cardWidth={WEEKLY_CARD_WIDTH}
          />
        </Section>
      )}

      {/* 6. Top Commanders — EDHREC feed (week / month / 2-year)
            sourced by the commander-sync worker, served via PowerSync.
            The section renders independently of the newly-printed
            feed; it shows whatever the worker has populated. */}
      <TopCommandersSection onPressCard={onTapDiscoverCard} />

      {/* 7-9. Meta sections — sourced from MTGGoldfish via the
            meta-decks worker, top 4 archetypes per format. Each
            section hides itself when the worker has not populated
            the format yet (additive, not load-bearing). */}
      <MetaSection format="standard" onPressCard={onTapDiscoverCard} />
      <MetaSection format="modern" onPressCard={onTapDiscoverCard} />
      <MetaSection format="pioneer" onPressCard={onTapDiscoverCard} />
    </ScrollView>
  );
}

export const SearchEmptyState = memo(SearchEmptyStateInner);

// ──────────────────────────────────────────────────────────────────────
// Subcomponents
// ──────────────────────────────────────────────────────────────────────

type SectionVariant = 'white' | 'tinted' | 'gray';

function Section({
  title,
  subtitle,
  action,
  variant,
  fullBleed,
  compactTitle,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: { label: string; onPress: () => void };
  variant: SectionVariant;
  /** Edge-to-edge background — drops the horizontal margin and rounds
   *  to 0. Inner header/content padding shifts to `lg` so text aligns
   *  with the rest of the screen edge. */
  fullBleed?: boolean;
  /** Smaller section title (md vs default xl). For sections that
   *  are visually anchored by their content (Recent searches preview
   *  cards, Recently viewed thumbnails) and don't need a heavyweight
   *  title competing with the carousel underneath. */
  compactTitle?: boolean;
  children: React.ReactNode;
}) {
  const baseStyle =
    variant === 'white'
      ? styles.sectionCardWhite
      : variant === 'tinted'
        ? styles.sectionCardTinted
        : styles.sectionCardGray;
  return (
    <View
      style={[
        styles.section,
        baseStyle,
        fullBleed && styles.sectionCardFullBleed,
      ]}
    >
      <View style={[styles.sectionHeader, fullBleed && styles.sectionHeaderFullBleed]}>
        <View style={{ flex: 1 }}>
          <Text
            style={[
              styles.sectionTitle,
              compactTitle && styles.sectionTitleCompact,
            ]}
          >
            {title}
          </Text>
          {subtitle && (
            <Text style={styles.sectionSubtitle}>{subtitle}</Text>
          )}
        </View>
        {action && (
          <TouchableOpacity
            onPress={action.onPress}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.sectionAction}>{action.label}</Text>
          </TouchableOpacity>
        )}
      </View>
      {children}
    </View>
  );
}

// Plain-English example prompts shown in the AI Search promotional
// banner. Static (not from `aiSuggestionChips` which are pre-cooked
// Scryfall syntax) so the banner illustrates the *value* of natural
// language: "type how you'd describe the cards out loud".
const AI_AD_EXAMPLES = [
  'Cheap red burn under 2 mana',
  'Black creatures with sacrifice synergy',
  'Counterspells legal in modern',
];

function AiSearchAd({
  onOpenEmpty,
  onTapExample,
}: {
  onOpenEmpty: () => void;
  onTapExample: (prompt: string) => void;
}) {
  return (
    <View style={styles.aiAd}>
      <TouchableOpacity
        style={styles.aiAdHeader}
        onPress={onOpenEmpty}
        activeOpacity={0.85}
      >
        <View style={styles.aiAdIconBadge}>
          <Ionicons name="sparkles" size={20} color={colors.accent} />
        </View>
        <View style={styles.aiAdHeaderText}>
          <View style={styles.aiAdTitleRow}>
            <Text style={styles.aiAdTitle}>AI Search</Text>
            <View style={styles.aiAdNewPill}>
              <Text style={styles.aiAdNewPillText}>NEW</Text>
            </View>
          </View>
          <Text style={styles.aiAdSubtitle}>
            Describe what you want in any language. We translate it
            into the Scryfall query that finds it.
          </Text>
        </View>
        <Ionicons name="arrow-forward" size={18} color={colors.surface} style={styles.aiAdArrow} />
      </TouchableOpacity>

      <View style={styles.aiAdExamples}>
        {AI_AD_EXAMPLES.map((ex) => (
          <TouchableOpacity
            key={ex}
            style={styles.aiAdExamplePill}
            onPress={() => onTapExample(ex)}
            activeOpacity={0.7}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={12} color={colors.accent} />
            <Text style={styles.aiAdExampleText} numberOfLines={1}>{ex}</Text>
            <Ionicons name="arrow-forward" size={12} color={'rgba(255,255,255,0.5)'} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// Featured presentation for the weekly bucket — chrome distinct from
// the plain Sections so the curated pick reads as a "this week's
// editorial" call-out rather than another grid of cards. Full-bleed
// background (edge-to-edge) with text + carousel padded to lg so the
// section reads as a banner instead of a card.
function WeeklyBucketSection({
  bucket,
  cards,
  onPressCard,
  onPressSeeAll,
}: {
  bucket: DiscoveryBucket;
  cards: ScryfallCard[];
  onPressCard: (card: ScryfallCard) => void;
  onPressSeeAll: () => void;
}) {
  const iconName = (bucket.icon || 'sparkles-outline') as React.ComponentProps<
    typeof Ionicons
  >['name'];
  return (
    <View style={styles.bucketSection}>
      <View style={styles.bucketHeader}>
        <View style={styles.bucketIcon}>
          <Ionicons name={iconName} size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.bucketKicker}>This week&rsquo;s pick</Text>
          <Text style={styles.bucketTitle} numberOfLines={1}>
            {bucket.title}
          </Text>
          {bucket.subtitle && (
            <Text style={styles.bucketSubtitle}>{bucket.subtitle}</Text>
          )}
        </View>
        <TouchableOpacity
          onPress={onPressSeeAll}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.bucketSeeAll}>See all</Text>
        </TouchableOpacity>
      </View>
      <DiscoverCarousel
        cards={cards}
        onPress={onPressCard}
        fullBleed
        cardWidth={WEEKLY_CARD_WIDTH}
      />
    </View>
  );
}

// Standard discovery card — used by Recently viewed. Each bump
// builds on the last: 96 px base × 1.2 × 1.15 = 132 px.
const DISCOVER_CARD_WIDTH = Math.round(96 * 1.2 * 1.15);
// Editorial card — used by This Week's pick, Newly printed, Top
// Commanders, and the Standard / Modern Meta sections. Same 1.15×
// bump applied on top of the previous editorial size so the
// hierarchy ratio (editorial ≈ 1.32× discover) stays intact:
// 96 × 1.38 × 1.15 × 1.15 = 175 px.
const WEEKLY_CARD_WIDTH = Math.round(96 * 1.38 * 1.15 * 1.15);

// ──────────────────────────────────────────────────────────────────────
// Meta decks — top-4 archetype lists per format scraped from
// MTGGoldfish by the meta-decks worker every 5 days. Each section
// shows a segmented control (one button per archetype) and a card
// carousel of the active archetype's mainboard. The section hides
// itself entirely while the worker hasn't populated the format yet.
// ──────────────────────────────────────────────────────────────────────

const FORMAT_LABELS: Record<MetaFormat, string> = {
  standard: 'Standard',
  modern: 'Modern',
  pioneer: 'Pioneer',
};

function MetaSection({
  format,
  onPressCard,
}: {
  format: MetaFormat;
  onPressCard: (card: ScryfallCard) => void;
}) {
  const { decks } = useMetaDecks(format);
  if (decks.length === 0) return null;
  return (
    <MetaDeckSection
      formatLabel={FORMAT_LABELS[format]}
      decks={decks}
      onPressCard={onPressCard}
    />
  );
}

const COLOR_TO_GLYPH: Record<string, ManaGlyph> = {
  W: 'W',
  U: 'U',
  B: 'B',
  R: 'R',
  G: 'G',
};

function colorsToGlyphs(colors: string): ManaGlyph[] {
  if (!colors || colors.length === 0) return ['C'];
  const out: ManaGlyph[] = [];
  for (const c of colors.toUpperCase()) {
    const g = COLOR_TO_GLYPH[c];
    if (g) out.push(g);
  }
  return out.length === 0 ? ['C'] : out;
}

function MetaDeckSection({
  formatLabel,
  decks,
  onPressCard,
}: {
  formatLabel: string;
  decks: MetaDeck[];
  onPressCard: (card: ScryfallCard) => void;
}) {
  const [activeId, setActiveId] = useState<string>(decks[0]?.id ?? '');
  // Reset active selection if the worker swaps the deck list out from
  // under us (e.g. an archetype dropped out of the top-N).
  useEffect(() => {
    if (!decks.some((d) => d.id === activeId) && decks[0]) {
      setActiveId(decks[0].id);
    }
  }, [decks, activeId]);

  const activeDeck = decks.find((d) => d.id === activeId) ?? decks[0];
  const cards = activeDeck?.cards ?? [];

  return (
    <View style={styles.metaSection}>
      <View style={styles.metaHeader}>
        <Text style={styles.metaSectionTitle}>{formatLabel} Meta</Text>
        <Text style={styles.metaSectionSubtitle}>
          Top archetypes scraped from the live tournament metagame.
        </Text>
        <Text style={styles.metaAttribution}>Data from MTGGoldfish</Text>
      </View>

      <View style={styles.metaSegmentTrack}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.metaSegmentScroll}
        >
          {decks.map((deck) => {
            const active = deck.id === activeId;
            const glyphs = colorsToGlyphs(deck.colors);
            return (
              <TouchableOpacity
                key={deck.id}
                style={[styles.metaSegmentBtn, active && styles.metaSegmentBtnActive]}
                onPress={() => setActiveId(deck.id)}
                activeOpacity={0.6}
              >
                <View style={styles.metaSegmentGems}>
                  {glyphs.map((c, i) => {
                    const gem = MANA_GEMS[c];
                    return (
                      <View
                        key={i}
                        style={[styles.metaSegmentGem, { backgroundColor: gem.bg }]}
                      >
                        <MTGGlyph
                          kind="mana"
                          code={c}
                          size={10}
                          color={gem.fg}
                        />
                      </View>
                    );
                  })}
                </View>
                <Text
                  style={[
                    styles.metaSegmentLabel,
                    active && styles.metaSegmentLabelActive,
                  ]}
                  numberOfLines={1}
                >
                  {deck.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <DiscoverCarousel
        cards={cards}
        onPress={onPressCard}
        cardWidth={WEEKLY_CARD_WIDTH}
      />
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Top Commanders — sourced from EDHREC via the commander-sync worker.
// Mirrors EDHREC's commander discovery flow (week / month / root).
// Three time windows; each carousel reads up to 30 ranked commanders
// from the local PowerSync-synced `top_commanders` table.
// ──────────────────────────────────────────────────────────────────────

const COMMANDER_WINDOWS: { id: CommanderWindow; label: string }[] = [
  { id: 'week', label: 'Past Week' },
  { id: 'month', label: 'Past Month' },
  { id: 'two-years', label: 'Past 2 Years' },
];

function TopCommandersSection({
  onPressCard,
}: {
  onPressCard: (card: ScryfallCard) => void;
}) {
  const [activeId, setActiveId] = useState<CommanderWindow>('week');
  const { cards } = useTopCommanders(activeId, 30);

  // The section always renders its chrome — an empty carousel on
  // first paint (fresh install, before PowerSync delivers the
  // bucket) is acceptable; the user can flip windows and the
  // carousel populates as soon as data lands.

  return (
    <View style={styles.metaSection}>
      <View style={styles.metaHeader}>
        <Text style={styles.metaSectionTitle}>Top Commanders</Text>
        <Text style={styles.metaSectionSubtitle}>
          Most-played commanders in the EDHREC meta — pick a window to browse.
        </Text>
        <Text style={styles.metaAttribution}>Data from EDHREC</Text>
      </View>

      <View style={styles.metaSegmentTrack}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.metaSegmentScroll}
        >
          {COMMANDER_WINDOWS.map((win) => {
            const active = win.id === activeId;
            return (
              <TouchableOpacity
                key={win.id}
                style={[styles.metaSegmentBtn, active && styles.metaSegmentBtnActive]}
                onPress={() => setActiveId(win.id)}
                activeOpacity={0.6}
              >
                <Text
                  style={[
                    styles.metaSegmentLabel,
                    active && styles.metaSegmentLabelActive,
                  ]}
                  numberOfLines={1}
                >
                  {win.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <DiscoverCarousel
        cards={cards}
        onPress={onPressCard}
        cardWidth={WEEKLY_CARD_WIDTH}
      />
    </View>
  );
}

// Canonical Wizards "gem" colors — pastel pill bg + near-black glyph,
// same palette the FilterSheet uses for color identity. Drop the
// baked-in WUBRG mana font tint in favor of these on tinted surfaces.
const MANA_GEMS: Record<ManaGlyph, { bg: string; fg: string }> = {
  W: { bg: '#FFFBD5', fg: '#1A1718' },
  U: { bg: '#AAE0FA', fg: '#1A1718' },
  B: { bg: '#CBC2BF', fg: '#1A1718' },
  R: { bg: '#F9AA8F', fg: '#1A1718' },
  G: { bg: '#9BD3AE', fg: '#1A1718' },
  C: { bg: '#E8E4E0', fg: '#1A1718' },
};

const DiscoverCarousel = memo(function DiscoverCarousel({
  cards,
  onPress,
  fullBleed,
  cardWidth = DISCOVER_CARD_WIDTH,
}: {
  cards: ScryfallCard[];
  onPress: (card: ScryfallCard) => void;
  /** When true, carousel padding aligns with screen edge (lg) instead
   *  of card-inner padding (md). Used by the full-bleed weekly bucket. */
  fullBleed?: boolean;
  /** Override cell width for sections that want a different visual
   *  weight (e.g. the editorial weekly bucket). Defaults to 96 px. */
  cardWidth?: number;
}) {
  const cellStyle = { width: cardWidth };
  const imageStyle = {
    width: cardWidth,
    height: cardWidth * 1.395,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
  };
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={fullBleed ? styles.viewedRowFullBleed : styles.viewedRow}
    >
      {cards.map((c, i) => (
        <TouchableOpacity
          key={`${c.id}-${i}`}
          style={cellStyle}
          onPress={() => onPress(c)}
          activeOpacity={0.7}
        >
          <CardImage uri={getCardImageUri(c, 'normal')} style={imageStyle} />
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
    paddingTop: spacing.md,
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

  /* Pre-cooked query pills — leads the page, no header. */
  pillsBlock: {
    marginBottom: spacing.lg,
  },
  pillsRow: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  aiChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 3,
    borderRadius: borderRadius.sm + 2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  aiChipLabel: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
    letterSpacing: -0.1,
  },

  /* Section base + variants. */
  section: {
    marginBottom: spacing.lg + spacing.xs,
  },
  sectionCardWhite: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    overflow: 'hidden',
    ...shadows.sm,
  },
  // Tinted variant uses primaryLight — gives white preview cards
  // inside it strong contrast and visually anchors the section.
  sectionCardTinted: {
    backgroundColor: colors.primaryLight,
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    overflow: 'hidden',
  },
  // Gray variant — whisper slate (#E5E6EB). Sits ~5% darker than the
  // page bg `#F5F5F7` so it reads as a distinct surface but stays
  // light and gentle. White preview cards inside still differentiate
  // subtly through the shadow on their thumbnails.
  sectionCardGray: {
    backgroundColor: '#E5E6EB',
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    overflow: 'hidden',
  },
  // Full-bleed override — drops the horizontal margin + rounding so
  // the section bleeds edge-to-edge.
  sectionCardFullBleed: {
    marginHorizontal: 0,
    borderRadius: 0,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingHorizontal: spacing.md + 2,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  sectionHeaderFullBleed: {
    paddingHorizontal: spacing.lg,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  sectionTitleCompact: {
    fontSize: fontSize.md,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  sectionSubtitle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '500',
    marginTop: 2,
    lineHeight: 16,
  },
  sectionAction: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },

  /* Recent searches preview row. */
  row: {
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },

  /* Vertical-strip section — shared layout for Recently viewed and
     Recent searches. A frosted-glass blur strip pinned to the LEFT
     edge carries the section label rotated 90°; cards scroll behind
     it so the blur picks up the underlying art for a premium look. */
  stripSection: {
    position: 'relative',
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg + spacing.xs,
    borderRadius: borderRadius.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    overflow: 'hidden',
    ...shadows.sm,
  },
  // Carousel content shifts left to leave room for the strip on the
  // right. The strip is 32 px wide; the trailing paddingRight keeps
  // the last card mostly visible to the left of the strip rather
  // than fully buried under the blur.
  stripCarouselRow: {
    paddingLeft: spacing.md,
    paddingRight: 36,
    gap: spacing.md,
  },
  stripRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(219, 227, 247, 0.55)',
  },
  stripLabel: {
    color: colors.text,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    transform: [{ rotate: '-90deg' }],
    width: 160,
    textAlign: 'center',
  },
  /* Discover + Recently viewed shared carousel cell. */
  viewedRow: {
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  viewedRowFullBleed: {
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
    backgroundColor: colors.surface,
  },
  viewedName: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: '600',
    marginTop: spacing.xs,
    letterSpacing: -0.1,
  },
  viewedSet: {
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 1,
    fontWeight: '500',
  },

  /* AI Search promotional banner — premium navy surface, accent pops
     from the sparkle icon, NEW pill and the chat-bubble glyphs in the
     example pills. Tappable as a single CTA into the AI Search sheet. */
  aiAd: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg + spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    ...shadows.md,
  },
  aiAdHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  aiAdIconBadge: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.sm,
    backgroundColor: 'rgba(59, 130, 246, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiAdHeaderText: {
    flex: 1,
  },
  aiAdTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 4,
  },
  aiAdTitle: {
    color: colors.surface,
    fontSize: fontSize.xl,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  aiAdNewPill: {
    backgroundColor: colors.accent,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  aiAdNewPillText: {
    color: colors.surface,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  aiAdSubtitle: {
    color: 'rgba(255, 255, 255, 0.78)',
    fontSize: fontSize.xs,
    fontWeight: '500',
    lineHeight: 16,
  },
  aiAdArrow: {
    marginTop: 8,
  },
  aiAdExamples: {
    gap: spacing.sm,
  },
  aiAdExamplePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  aiAdExampleText: {
    color: colors.surface,
    fontSize: fontSize.sm,
    fontWeight: '500',
    flex: 1,
    letterSpacing: -0.1,
  },

  /* Meta deck section — own chrome distinct from the standard Section
     so the title + selector + carousel can lean on the accent color
     family (vivid blue) instead of the navy primary that dominates
     the rest of the search hub. */
  metaSection: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg + spacing.xs,
    borderRadius: borderRadius.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    overflow: 'hidden',
    ...shadows.sm,
  },
  metaHeader: {
    paddingHorizontal: spacing.md + 2,
    marginBottom: spacing.md,
  },
  metaSectionTitle: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  metaSectionSubtitle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '500',
    marginTop: 2,
    lineHeight: 16,
  },
  metaAttribution: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    opacity: 0.7,
  },
  /* Meta segmented control — iOS-style track. Mirrors the Binders/
     Lists segment in the Collection hub: a gray surfaceSecondary
     track holds N segments; the active one fills white + sm shadow,
     the rest stay transparent on the track. Horizontally scrollable
     so 4+ deck names + mana glyphs fit naturally. */
  metaSegmentTrack: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.md,
    padding: 3,
  },
  metaSegmentScroll: {
    gap: 0,
  },
  metaSegmentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: borderRadius.sm,
  },
  metaSegmentBtnActive: {
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  metaSegmentLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  metaSegmentLabelActive: {
    color: '#3A3A3A',
    fontWeight: '700',
  },
  metaSegmentGems: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  metaSegmentGem: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Weekly bucket — full-bleed editorial banner. */
  bucketSection: {
    backgroundColor: colors.primaryLight,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    marginBottom: spacing.lg + spacing.xs,
  },
  bucketHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  bucketIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bucketKicker: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  bucketTitle: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
    marginTop: 2,
    letterSpacing: -0.4,
  },
  bucketSubtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontWeight: '500',
    marginTop: 2,
    lineHeight: 16,
  },
  bucketSeeAll: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
});
