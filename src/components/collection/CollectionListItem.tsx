import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import { colors, shadows, spacing, fontSize, borderRadius } from '../../constants';
import type { CollectionType } from '../../lib/collections';

type Props = {
  name: string;
  type: CollectionType;
  subtitle: string;
  color?: string | null;
  onPress: () => void;
  onLongPress?: () => void;
  onSwipeDelete?: () => void;
};

export function CollectionListItem({ name, type, subtitle, color, onPress, onLongPress, onSwipeDelete }: Props) {
  const row = (
    <TouchableOpacity
      style={[styles.row, onSwipeDelete && styles.rowNoMargin]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.6}
    >
      {color && <View style={[styles.colorBar, { backgroundColor: color }]} />}
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );

  if (!onSwipeDelete) return row;

  return (
    <Swipeable
      renderRightActions={() => (
        <TouchableOpacity style={styles.deleteAction} onPress={onSwipeDelete}>
          <Ionicons name="trash-outline" size={24} color={colors.error} />
        </TouchableOpacity>
      )}
      overshootRight={false}
      containerStyle={styles.swipeContainer}
    >
      {row}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 16,
    marginBottom: spacing.sm,
    overflow: 'hidden',
    ...shadows.sm,
  },
  colorBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: borderRadius.md,
    borderBottomLeftRadius: borderRadius.md,
  },
  info: {
    flex: 1,
  },
  name: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '500',
    marginTop: 2,
  },
  swipeContainer: {
    marginBottom: spacing.sm,
  },
  rowNoMargin: {
    marginBottom: 0,
  },
  deleteAction: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
