import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { ScryfallCard, getCardImageUri, formatPrice } from '../../lib/scryfall';
import { Condition, CONDITIONS } from '../../lib/collection';
import { colors, shadows, spacing, fontSize, borderRadius } from '../../constants';

type Props = {
  card: ScryfallCard;
  condition: Condition;
  quantity: number;
  onConditionChange: (c: Condition) => void;
  onQuantityChange: (q: number) => void;
  onConfirm: () => void;
  onDismiss: () => void;
};

export function DetectionBar({
  card,
  condition,
  quantity,
  onConditionChange,
  onQuantityChange,
  onConfirm,
  onDismiss,
}: Props) {
  return (
    <View style={styles.container}>
      {/* Dismiss button */}
      <TouchableOpacity style={styles.dismissButton} onPress={onDismiss}>
        <Ionicons name="close" size={18} color={colors.textMuted} />
      </TouchableOpacity>

      {/* Card info row */}
      <View style={styles.cardRow}>
        <Image
          source={{ uri: getCardImageUri(card, 'small') }}
          style={styles.cardImage}
          contentFit="cover"
        />
        <View style={styles.cardInfo}>
          <Text style={styles.cardName} numberOfLines={1}>{card.name}</Text>
          <Text style={styles.cardSet} numberOfLines={1}>
            {card.set_name} · #{card.collector_number}
          </Text>
          <Text style={styles.cardPrice}>{formatPrice(card.prices?.usd)}</Text>
        </View>
      </View>

      {/* Condition selector */}
      <View style={styles.conditionRow}>
        {CONDITIONS.map((c) => (
          <TouchableOpacity
            key={c.value}
            style={[
              styles.conditionPill,
              condition === c.value && styles.conditionPillActive,
            ]}
            onPress={() => onConditionChange(c.value)}
          >
            <Text
              style={[
                styles.conditionText,
                condition === c.value && styles.conditionTextActive,
              ]}
            >
              {c.value}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Quantity + Confirm row */}
      <View style={styles.actionRow}>
        <View style={styles.quantityControl}>
          <TouchableOpacity
            style={styles.qtyButton}
            onPress={() => onQuantityChange(quantity - 1)}
          >
            <Ionicons name="remove" size={18} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.qtyText}>{quantity}</Text>
          <TouchableOpacity
            style={styles.qtyButton}
            onPress={() => onQuantityChange(quantity + 1)}
          >
            <Ionicons name="add" size={18} color={colors.text} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.confirmButton} onPress={onConfirm}>
          <Ionicons name="checkmark" size={20} color="#FFFFFF" />
          <Text style={styles.confirmText}>Add to Tray</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    ...shadows.lg,
  },
  dismissButton: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  cardImage: {
    width: 50,
    height: 70,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceSecondary,
  },
  cardInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  cardName: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  cardSet: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 1,
  },
  cardPrice: {
    color: colors.primary,
    fontSize: fontSize.lg,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  conditionRow: {
    flexDirection: 'row',
    gap: spacing.xs + 2,
    marginBottom: spacing.md,
  },
  conditionPill: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
  },
  conditionPillActive: {
    backgroundColor: colors.primary,
  },
  conditionText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  conditionTextActive: {
    color: '#FFFFFF',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  qtyButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
    minWidth: 24,
    textAlign: 'center',
  },
  confirmButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 4,
    gap: spacing.xs,
  },
  confirmText: {
    color: '#FFFFFF',
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
});
