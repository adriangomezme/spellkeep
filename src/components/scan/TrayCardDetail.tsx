import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { ScryfallCard, getCardImageUri, formatPrice } from '../../lib/scryfall';
import { colors, shadows, spacing, fontSize, borderRadius } from '../../constants';

type Props = {
  card: ScryfallCard;
  onBack: () => void;
};

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export function TrayCardDetail({ card, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const imageUri = getCardImageUri(card, 'large');
  const oracleText = card.oracle_text ?? card.card_faces?.[0]?.oracle_text;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{card.name}</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.imageContainer}>
          <Image
            source={{ uri: imageUri }}
            style={styles.cardImage}
            contentFit="contain"
            transition={200}
          />
        </View>

        <View style={styles.priceRow}>
          <View style={styles.priceItem}>
            <Text style={styles.priceLabel}>Normal</Text>
            <Text style={styles.priceValue}>{formatPrice(card.prices?.usd)}</Text>
          </View>
          <View style={styles.priceDivider} />
          <View style={styles.priceItem}>
            <Text style={styles.priceLabel}>Foil</Text>
            <Text style={styles.priceValue}>{formatPrice(card.prices?.usd_foil)}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <InfoRow label="Type" value={card.type_line} />
          <InfoRow label="Mana Cost" value={card.mana_cost ?? card.card_faces?.[0]?.mana_cost} />
          <InfoRow label="Set" value={`${card.set_name} (#${card.collector_number})`} />
          <InfoRow label="Rarity" value={card.rarity} />
          <InfoRow label="Artist" value={card.artist} />
          {card.power && <InfoRow label="P/T" value={`${card.power}/${card.toughness}`} />}
        </View>

        {oracleText && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Oracle Text</Text>
            <Text style={styles.oracleText}>{oracleText}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    textAlign: 'center',
  },
  content: {
    paddingBottom: spacing.xxl,
  },
  imageContainer: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  cardImage: {
    width: 240,
    height: 336,
    borderRadius: borderRadius.md,
  },
  priceRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  priceItem: {
    flex: 1,
    alignItems: 'center',
  },
  priceLabel: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  priceValue: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
    marginTop: 4,
  },
  priceDivider: {
    width: 1,
    height: 36,
    backgroundColor: colors.border,
  },
  card: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs + 2,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.divider,
  },
  infoLabel: {
    color: colors.textMuted,
    fontSize: fontSize.md,
  },
  infoValue: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
    marginLeft: spacing.md,
  },
  oracleText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    lineHeight: 22,
  },
});
