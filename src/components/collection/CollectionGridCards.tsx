import { memo } from 'react';
import {
  StyleSheet,
  StyleProp,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CardImage } from './CardImage';
import { LanguageBadge } from './LanguageBadge';
import type { EnrichedEntry } from '../../lib/hooks/useLocalCardEntries';
import { formatPrice } from '../../lib/scryfall';
import { displayPriceForRow } from '../../lib/cardListUtils';
import { colors, shadows, spacing, fontSize, borderRadius } from '../../constants';

// MTG card aspect ratio (height / width) — shared between compact and
// meta variants so a grid row lays out identically either way.
const CARD_IMAGE_RATIO = 1.395;

type CommonProps = {
  item: EnrichedEntry;
  width: number;
  spacingStyle?: StyleProp<ViewStyle>;
  isSelected: boolean;
  onPress: (item: EnrichedEntry) => void;
  onLongPress: (item: EnrichedEntry) => void;
};

function totalQty(item: EnrichedEntry): number {
  return item.quantity_normal + item.quantity_foil + item.quantity_etched;
}

function GridCompactCardImpl({
  item,
  width,
  spacingStyle,
  isSelected,
  onPress,
  onLongPress,
}: CommonProps) {
  const card = item.cards;
  if (!card) return null;

  return (
    <TouchableOpacity
      style={[styles.compactCard, { width }, spacingStyle]}
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress(item)}
      activeOpacity={0.7}
    >
      <CardImage
        uri={card.image_uri_normal || card.image_uri_small}
        style={styles.compactImage}
        transition={0}
      />
      {isSelected && <SelectionOverlay />}
    </TouchableOpacity>
  );
}

export const GridCompactCard = memo(GridCompactCardImpl);

function GridCardImpl({
  item,
  width,
  spacingStyle,
  isSelected,
  onPress,
  onLongPress,
}: CommonProps) {
  const card = item.cards;
  if (!card) return null;
  const qty = totalQty(item);
  const rowPrice = displayPriceForRow(
    item.quantity_normal,
    item.quantity_foil,
    item.quantity_etched,
    card.price_usd,
    card.price_usd_foil,
    card.price_usd_etched
  );

  return (
    <TouchableOpacity
      style={[styles.card, { width }, spacingStyle]}
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.imageWrap}>
        <CardImage
          uri={card.image_uri_normal || card.image_uri_small}
          style={styles.image}
          transition={0}
        />
        <LanguageBadge language={item.language} style="corner" />
        {qty > 1 && (
          <View style={styles.qtyBadge}>
            <Text style={styles.qtyBadgeText}>x{qty}</Text>
          </View>
        )}
        {isSelected && <SelectionOverlay />}
      </View>
      <View style={styles.meta}>
        <Text style={styles.name} numberOfLines={1}>{card.name}</Text>
        <View style={styles.bottom}>
          <Text style={styles.set} numberOfLines={1}>
            {card.set_code.toUpperCase()} #{card.collector_number}
          </Text>
          <Text style={styles.price}>
            {formatPrice(rowPrice != null ? rowPrice.toString() : undefined)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export const GridCard = memo(GridCardImpl);

// Selection overlay: soft primary wash + checkmark badge in the top-
// right corner. Kept as its own component so both card variants share
// pixel-for-pixel behavior.
function SelectionOverlay() {
  return (
    <>
      <View style={styles.selectionDim} pointerEvents="none" />
      <View style={styles.selectionCheck} pointerEvents="none">
        <Ionicons name="checkmark" size={16} color="#FFFFFF" />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  /* ── Grid compact ── */
  compactCard: {
    aspectRatio: 1 / CARD_IMAGE_RATIO,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceSecondary,
  },
  compactImage: {
    width: '100%',
    height: '100%',
  },

  /* ── Grid with meta ── */
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    ...shadows.sm,
  },
  imageWrap: {
    width: '100%',
    aspectRatio: 1 / CARD_IMAGE_RATIO,
    backgroundColor: colors.surfaceSecondary,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  qtyBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  qtyBadgeText: {
    color: '#FFF',
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  meta: {
    padding: spacing.sm,
  },
  name: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
    lineHeight: 16,
  },
  bottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 3,
  },
  set: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    flex: 1,
  },
  price: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },

  /* ── Selection ── */
  selectionDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 35, 133, 0.28)',
    borderRadius: borderRadius.md,
  },
  selectionCheck: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
});
