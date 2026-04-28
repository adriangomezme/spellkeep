import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import { colors, shadows, spacing, fontSize, borderRadius } from '../../constants';

const DEFAULT_FOLDER_COLOR = '#A0A8B8';

type Props = {
  name: string;
  itemCount: number;
  color?: string | null;
  onPress: () => void;
  onLongPress?: () => void;
  onSwipeDelete?: () => void;
};

export function FolderListItem({ name, itemCount, color, onPress, onLongPress, onSwipeDelete }: Props) {
  const iconColor = color || DEFAULT_FOLDER_COLOR;

  const row = (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.6}
    >
      <View style={[styles.iconSquare, { backgroundColor: iconColor + '18' }]}>
        <Ionicons name="folder" size={20} color={iconColor} />
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        <Text style={styles.subtitle}>
          {itemCount} {itemCount === 1 ? 'item' : 'items'}
        </Text>
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
    paddingVertical: 15,
    marginBottom: spacing.sm,
    gap: spacing.md,
    ...shadows.sm,
  },
  iconSquare: {
    width: 36,
    height: 36,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
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
  deleteAction: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
