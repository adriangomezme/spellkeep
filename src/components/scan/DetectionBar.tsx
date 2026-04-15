import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { ScryfallCard, getCardImageUri } from '../../lib/scryfall';
import { Condition, Finish, CONDITIONS } from '../../lib/collection';
import { getPriceForFinish } from './useScanState';
import { VersionPicker } from './VersionPicker';
import { colors, shadows, spacing, fontSize, borderRadius } from '../../constants';

const FINISH_LABELS: Record<Finish, string> = {
  normal: 'Normal',
  foil: 'Foil',
  etched: 'Etched',
};

const CONDITION_LABELS = CONDITIONS.map((c) => c.value);

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
  onVersionChange: (card: ScryfallCard) => void;
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
  onVersionChange,
  onDismiss,
}: Props) {
  const [showConditionDropdown, setShowConditionDropdown] = useState(false);
  const [showVersionPicker, setShowVersionPicker] = useState(false);
  const price = getPriceForFinish(card, finish);

  return (
    <View style={styles.container}>
      {/* Dismiss */}
      <TouchableOpacity style={styles.dismissButton} onPress={onDismiss}>
        <Ionicons name="close" size={16} color={colors.textMuted} />
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
          <Text style={styles.cardPrice}>{formatPrice(price)}</Text>
        </View>
      </View>

      {/* Controls row: [Set #CN] [Finish] [QTY] [Condition] */}
      <View style={styles.controlsRow}>
        {/* Set + Collector Number → tap opens version picker */}
        <TouchableOpacity
          style={styles.chip}
          onPress={() => setShowVersionPicker(true)}
        >
          <Text style={styles.chipTextSmall} numberOfLines={1}>
            {card.set.toUpperCase()} #{card.collector_number}
          </Text>
          <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
        </TouchableOpacity>

        {/* Finish toggle */}
        <TouchableOpacity style={styles.chipAccent} onPress={onCycleFinish}>
          <Text style={styles.chipAccentText}>{FINISH_LABELS[finish]}</Text>
        </TouchableOpacity>

        {/* Quantity: tap +1, long press reset */}
        <TouchableOpacity
          style={styles.chip}
          onPress={onIncrementQty}
          onLongPress={onResetQty}
          delayLongPress={500}
        >
          <Text style={styles.chipLabel}>QTY</Text>
          <Text style={styles.chipValue}>{quantity}</Text>
        </TouchableOpacity>

        {/* Condition dropdown */}
        <View>
          <TouchableOpacity
            style={styles.chip}
            onPress={() => setShowConditionDropdown(!showConditionDropdown)}
          >
            <Text style={styles.chipValue}>{condition}</Text>
            <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
          </TouchableOpacity>

          {showConditionDropdown && (
            <View style={styles.dropdown}>
              {CONDITION_LABELS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[
                    styles.dropdownItem,
                    c === condition && styles.dropdownItemActive,
                  ]}
                  onPress={() => {
                    onConditionChange(c as Condition);
                    setShowConditionDropdown(false);
                  }}
                >
                  <Text
                    style={[
                      styles.dropdownText,
                      c === condition && styles.dropdownTextActive,
                    ]}
                  >
                    {c}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </View>

      {/* Version picker modal */}
      <VersionPicker
        visible={showVersionPicker}
        cardName={card.name}
        currentId={card.id}
        onSelect={(newCard) => {
          onVersionChange(newCard);
          setShowVersionPicker(false);
        }}
        onClose={() => setShowVersionPicker(false)}
      />
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
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    ...shadows.lg,
  },
  dismissButton: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    marginRight: spacing.xl,
  },
  cardImage: {
    width: 42,
    height: 58,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceSecondary,
  },
  cardInfo: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  cardName: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  cardPrice: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: '800',
    marginTop: 2,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs + 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 3,
  },
  chipAccent: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 3,
  },
  chipAccentText: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  chipLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  chipValue: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  chipTextSmall: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontWeight: '600',
    maxWidth: 80,
  },
  dropdown: {
    position: 'absolute',
    bottom: '100%',
    right: 0,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing.xs,
    minWidth: 60,
    ...shadows.md,
    zIndex: 10,
  },
  dropdownItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  dropdownItemActive: {
    backgroundColor: colors.primaryLight,
  },
  dropdownText: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  dropdownTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
});
