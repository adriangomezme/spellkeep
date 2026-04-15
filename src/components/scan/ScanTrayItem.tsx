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
};

export function ScanTrayItemRow({ item, onEdit, onDelete }: Props) {
  const { card, condition, quantity } = item;

  return (
    <View style={styles.container}>
      <Image
        source={{ uri: getCardImageUri(card, 'small') }}
        style={styles.image}
        contentFit="cover"
      />
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {quantity}x {card.name}
        </Text>
        <Text style={styles.set} numberOfLines={1}>
          {card.set_name} · #{card.collector_number}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.condition}>{condition}</Text>
          <Text style={styles.price}>{formatPrice(card.prices?.usd)}</Text>
        </View>
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
    paddingHorizontal: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.divider,
  },
  image: {
    width: 40,
    height: 56,
    borderRadius: borderRadius.sm,
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
  set: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    marginTop: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 2,
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
  price: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    padding: spacing.xs,
  },
});
