import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { getCardImageUri, formatPrice } from '../../lib/scryfall';
import { ScanTrayItem as TrayItemType } from './useScanState';
import { colors, spacing, fontSize, borderRadius } from '../../constants';

type Props = {
  item: TrayItemType;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onCardPress: (item: TrayItemType) => void;
};

export function ScanTrayItemRow({ item, onEdit, onDelete, onCardPress }: Props) {
  const { card, condition, quantity } = item;
  const setIconUri = `https://svgs.scryfall.io/sets/${card.set}.svg`;

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => onCardPress(item)} activeOpacity={0.7}>
        <Image
          source={{ uri: getCardImageUri(card, 'small') }}
          style={styles.image}
          contentFit="cover"
        />
      </TouchableOpacity>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {quantity}x {card.name}
        </Text>
        <View style={styles.setRow}>
          <Image
            source={{ uri: setIconUri }}
            style={styles.setIcon}
            contentFit="contain"
            tintColor={colors.textSecondary}
          />
          <Text style={styles.set} numberOfLines={1}>
            {card.set_name} · #{card.collector_number}
          </Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.condition}>{condition}</Text>
          {item.finish !== 'normal' && (
            <Text style={styles.finishBadge}>{item.finish === 'foil' ? 'Foil' : 'Etched'}</Text>
          )}
        </View>
        <Text style={styles.price}>{formatPrice(
          item.finish === 'foil' ? card.prices?.usd_foil : card.prices?.usd
        )}</Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => onEdit(item.id)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="pencil" size={16} color={colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => onDelete(item.id)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="trash-outline" size={16} color={colors.error} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.divider,
  },
  image: {
    width: 65,
    height: 91,
    borderRadius: 3,
    backgroundColor: colors.surfaceSecondary,
  },
  info: {
    flex: 1,
    marginLeft: spacing.md,
  },
  name: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 3,
  },
  setIcon: {
    width: 14,
    height: 14,
  },
  set: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  condition: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  finishBadge: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '600',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  price: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '700',
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    padding: spacing.xs,
  },
});
