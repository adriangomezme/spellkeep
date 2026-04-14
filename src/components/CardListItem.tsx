import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { ScryfallCard, getCardImageUri, formatPrice } from '../lib/scryfall';
import { colors, spacing, fontSize, borderRadius } from '../constants';

type Props = {
  card: ScryfallCard;
  onPress: (card: ScryfallCard) => void;
};

const MANA_COLORS: Record<string, string> = {
  W: colors.manaWhite,
  U: colors.manaBlue,
  B: colors.manaBlack,
  R: colors.manaRed,
  G: colors.manaGreen,
};

function ColorDots({ colors: cardColors }: { colors: string[] }) {
  if (!cardColors || cardColors.length === 0) {
    return <View style={[styles.colorDot, { backgroundColor: colors.manaColorless }]} />;
  }

  return (
    <View style={styles.colorDots}>
      {cardColors.map((c) => (
        <View
          key={c}
          style={[styles.colorDot, { backgroundColor: MANA_COLORS[c] ?? colors.manaColorless }]}
        />
      ))}
    </View>
  );
}

export function CardListItem({ card, onPress }: Props) {
  const imageUri = getCardImageUri(card, 'small');

  return (
    <TouchableOpacity style={styles.container} onPress={() => onPress(card)} activeOpacity={0.7}>
      <Image
        source={{ uri: imageUri }}
        style={styles.image}
        contentFit="cover"
        transition={200}
        placeholder={{ blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' }}
      />
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {card.name}
        </Text>
        <Text style={styles.typeLine} numberOfLines={1}>
          {card.type_line}
        </Text>
        <View style={styles.meta}>
          <Text style={styles.set}>{card.set_name}</Text>
          <ColorDots colors={card.colors ?? card.color_identity} />
        </View>
      </View>
      <View style={styles.priceContainer}>
        <Text style={styles.price}>{formatPrice(card.prices?.usd)}</Text>
        <Text style={styles.rarity}>{card.rarity}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  image: {
    width: 48,
    height: 68,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceLight,
  },
  info: {
    flex: 1,
    marginLeft: spacing.md,
    justifyContent: 'center',
  },
  name: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  typeLine: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  set: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },
  colorDots: {
    flexDirection: 'row',
    gap: 3,
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  priceContainer: {
    alignItems: 'flex-end',
    marginLeft: spacing.sm,
  },
  price: {
    color: colors.accent,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  rarity: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
    textTransform: 'capitalize',
  },
});
