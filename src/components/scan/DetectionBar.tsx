import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { ScryfallCard, getCardImageUri } from '../../lib/scryfall';
import { Condition, Finish, CONDITIONS } from '../../lib/collection';
import { getPriceForFinish } from './useScanState';
import { colors, shadows, spacing, fontSize, borderRadius } from '../../constants';

const FINISH_LABELS: Record<Finish, string> = {
  normal: 'Normal',
  foil: 'Foil',
  etched: 'Etched',
};

function formatPrice(price?: string): string {
  if (!price) return '—';
  return `$${parseFloat(price).toFixed(2)}`;
}

type Props = {
  card: ScryfallCard;
  condition: Condition;
  finish: Finish;
  quantity: number;
  onConditionChange: (c: Condition) => void;
  onCycleFinish: () => void;
  onIncrementQty: () => void;
  onResetQty: () => void;
  onConfirm: () => void;
  onDismiss: () => void;
};

export function DetectionBar({
  card,
  condition,
  finish,
  quantity,
  onConditionChange,
  onCycleFinish,
  onIncrementQty,
  onResetQty,
  onConfirm,
  onDismiss,
}: Props) {
  const price = getPriceForFinish(card, finish);

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.dismissButton} onPress={onDismiss}>
        <Ionicons name="close" size={18} color={colors.textMuted} />
      </TouchableOpacity>

      {/* Card info */}
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
          <Text style={styles.cardPrice}>{formatPrice(price)}</Text>
        </View>
      </View>

      {/* Condition pills + Finish toggle */}
      <View style={styles.controlsRow}>
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

        {/* Finish toggle — tap to cycle */}
        <TouchableOpacity style={styles.finishToggle} onPress={onCycleFinish}>
          <Text style={styles.finishText}>{FINISH_LABELS[finish]}</Text>
          <Ionicons name="swap-horizontal" size={14} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Quantity (tap +1, long press reset) + Confirm */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.qtyButton}
          onPress={onIncrementQty}
          onLongPress={onResetQty}
          delayLongPress={500}
        >
          <Text style={styles.qtyLabel}>QTY</Text>
          <Text style={styles.qtyValue}>{quantity}</Text>
        </TouchableOpacity>

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
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  conditionRow: {
    flexDirection: 'row',
    gap: spacing.xs + 2,
    flex: 1,
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
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  conditionTextActive: {
    color: '#FFFFFF',
  },
  finishToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  finishText: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  qtyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  qtyLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  qtyValue: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
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
