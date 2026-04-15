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
  showVersionPicker: boolean;
  onOpenVersionPicker: () => void;
  onCloseVersionPicker: () => void;
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
  showVersionPicker,
  onOpenVersionPicker,
  onCloseVersionPicker,
}: Props) {
  const [showConditionDropdown, setShowConditionDropdown] = useState(false);
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
          <Text style={styles.cardSet} numberOfLines={1}>{card.set_name} · #{card.collector_number}</Text>
          <View style={styles.priceRow}>
            {card.prices?.usd && (
              <Text style={styles.cardPrice}>{formatPrice(card.prices.usd)}</Text>
            )}
            {card.prices?.usd_foil && (
              <Text style={styles.cardPriceFoil}>Foil {formatPrice(card.prices.usd_foil)}</Text>
            )}
          </View>
        </View>
      </View>

      {/* Controls row */}
      <View style={styles.controlsRow}>
        {/* Set + Version */}
        <TouchableOpacity
          style={styles.chip}
          onPress={onOpenVersionPicker}
        >
          <Text style={styles.chipText} numberOfLines={1}>
            {card.set.toUpperCase()} #{card.collector_number}
          </Text>
          <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
        </TouchableOpacity>

        {/* Finish toggle */}
        <TouchableOpacity style={styles.chipAccent} onPress={onCycleFinish}>
          <Text style={styles.chipAccentText}>{FINISH_LABELS[finish]}</Text>
        </TouchableOpacity>

        {/* Quantity */}
        <TouchableOpacity
          style={styles.chipQty}
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
            <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
          </TouchableOpacity>

          {showConditionDropdown && (
            <View style={styles.dropdown}>
              {CONDITIONS.map((c) => (
                <TouchableOpacity
                  key={c.value}
                  style={[
                    styles.dropdownItem,
                    c.value === condition && styles.dropdownItemActive,
                  ]}
                  onPress={() => {
                    onConditionChange(c.value);
                    setShowConditionDropdown(false);
                  }}
                >
                  <Text
                    style={[
                      styles.dropdownText,
                      c.value === condition && styles.dropdownTextActive,
                    ]}
                  >
                    {c.value}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </View>

      <VersionPicker
        visible={showVersionPicker}
        cardName={card.name}
        currentId={card.id}
        onSelect={(newCard) => {
          onVersionChange(newCard);
          onCloseVersionPicker();
        }}
        onClose={onCloseVersionPicker}
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    ...shadows.lg,
  },
  dismissButton: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
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
    marginRight: spacing.xl,
  },
  cardImage: {
    width: 46,
    height: 64,
    borderRadius: 4,
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
    marginTop: 2,
  },
  priceRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  cardPrice: {
    color: colors.text,
    fontSize: fontSize.md,
  },
  cardPriceFoil: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm + 2,
    minHeight: 38,
  },
  chipAccent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm + 2,
    minHeight: 38,
    minWidth: 72,
  },
  chipAccentText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  chipQty: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm + 2,
    minHeight: 38,
    minWidth: 62,
  },
  chipLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  chipValue: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
    maxWidth: 90,
  },
  dropdown: {
    position: 'absolute',
    bottom: '100%',
    right: 0,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    minWidth: 56,
    ...shadows.lg,
    zIndex: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dropdownItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  dropdownItemActive: {
    backgroundColor: colors.primaryLight,
  },
  dropdownText: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  dropdownTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
});
