import { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { borderRadius, colors, fontSize, spacing } from '../../constants';

/**
 * Skeleton row for the Meta / Weekly-bucket / Top Commanders carousels
 * while their data is still in flight. Designed to feel like *cards
 * loading in*, not a generic spinner: each placeholder is the same
 * silhouette as a real card (1.395 aspect ratio), and a soft diagonal
 * shimmer sweeps across each one with a small per-card delay so the
 * row feels alive instead of synchronised. The optional section
 * header bars (title + subtitle) sit above so the user reads "this
 * is the X section, loading" before the cards arrive.
 */
const ASPECT_RATIO = 1.395;

export function LoadingCardRow({
  count = 6,
  cardWidth = 175,
  showHeader = true,
  variant = 'white',
}: {
  /** How many card placeholders to render. Match the carousel's
   *  visible-count budget so the skeleton doesn't read smaller than
   *  the populated row. */
  count?: number;
  cardWidth?: number;
  /** Render the title/subtitle skeleton bars above the card row.
   *  Disable when the section is rendering its own header already
   *  (e.g. MetaDeckSection's chrome). */
  showHeader?: boolean;
  /** Background variant — 'white' for inset cards, 'tinted' for
   *  full-bleed editorial banners (Weekly bucket). */
  variant?: 'white' | 'tinted';
}) {
  const cardHeight = cardWidth * ASPECT_RATIO;

  return (
    <View style={[variant === 'tinted' && styles.tintedWrap]}>
      {showHeader && (
        <View style={styles.header}>
          <View style={styles.titleBar} />
          <View style={styles.subtitleBar} />
        </View>
      )}
      <ScrollView
        horizontal
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {Array.from({ length: count }).map((_, i) => (
          <SkeletonCard key={i} index={i} width={cardWidth} height={cardHeight} />
        ))}
      </ScrollView>
    </View>
  );
}

function SkeletonCard({
  index,
  width,
  height,
}: {
  index: number;
  width: number;
  height: number;
}) {
  // Each card runs the same shimmer animation but starts slightly
  // later than the one before it, so the row reads as a wave instead
  // of a synchronised pulse.
  const shimmer = useSharedValue(0);
  useEffect(() => {
    shimmer.value = withDelay(
      index * 130,
      withRepeat(
        withTiming(1, {
          duration: 1500,
          easing: Easing.inOut(Easing.cubic),
        }),
        -1,
        false
      )
    );
  }, [index, shimmer]);

  // The shimmer is a tall, diagonally-skewed white slab that travels
  // from off-screen-left to off-screen-right. The skew + width make
  // it look like light running over a foil card — enough personality
  // for the user to feel "MTG cards are loading" without a glyph or
  // mascot in the corner.
  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          shimmer.value,
          [0, 1],
          [-width * 0.6, width * 1.6]
        ),
      },
      { skewX: '-20deg' },
    ],
  }));

  return (
    <View style={[styles.card, { width }]}>
      <View
        style={[
          styles.cardSurface,
          { width, height, borderRadius: borderRadius.md },
        ]}
      >
        <Animated.View style={[styles.shimmer, shimmerStyle]} />
      </View>
      <View style={[styles.nameBar, { marginTop: spacing.xs }]} />
      <View style={styles.setBar} />
    </View>
  );
}

const styles = StyleSheet.create({
  tintedWrap: {
    backgroundColor: colors.primaryLight,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  header: {
    paddingHorizontal: spacing.md + 2,
    marginBottom: spacing.md,
    gap: 6,
  },
  titleBar: {
    height: fontSize.xl,
    width: 180,
    borderRadius: 6,
    backgroundColor: '#E5E6EB',
  },
  subtitleBar: {
    height: 10,
    width: 240,
    borderRadius: 5,
    backgroundColor: '#EBECEF',
  },
  row: {
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  card: {
    // Width is set inline.
  },
  cardSurface: {
    backgroundColor: '#E5E6EB',
    overflow: 'hidden',
  },
  shimmer: {
    position: 'absolute',
    top: -10,
    bottom: -10,
    width: 56,
    backgroundColor: 'rgba(255, 255, 255, 0.55)',
  },
  nameBar: {
    height: 10,
    width: '70%',
    borderRadius: 4,
    backgroundColor: '#E5E6EB',
  },
  setBar: {
    height: 8,
    width: '40%',
    borderRadius: 4,
    backgroundColor: '#EBECEF',
    marginTop: 4,
  },
});
