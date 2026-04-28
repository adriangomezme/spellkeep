import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, spacing } from '../../constants';

// Replaces CollectionToolbar while the user is in bulk-selection mode.
// Left: count. Right: actions — Tag, Move (re-parent rows), Add
// (duplicate rows to another collection), Delete (remove rows).
type Props = {
  count: number;
  onMove: () => void;
  onAdd: () => void;
  onTag: () => void;
  onDelete: () => void;
};

export function BulkActionsBar({
  count,
  onMove,
  onAdd,
  onTag,
  onDelete,
}: Props) {
  const disabled = count === 0;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.count}>
          <Text style={styles.countNumber}>{count}</Text>
          <Text style={styles.countLabel}>{count === 1 ? ' card' : ' cards'}</Text>
        </Text>

        <View style={styles.actions}>
          <ActionButton
            icon="pricetag-outline"
            label="Tag"
            disabled={disabled}
            color={colors.text}
            onPress={onTag}
          />
          <ActionButton
            icon="arrow-redo-outline"
            label="Move"
            disabled={disabled}
            color={colors.text}
            onPress={onMove}
          />
          <ActionButton
            icon="copy-outline"
            label="Add"
            disabled={disabled}
            color={colors.text}
            onPress={onAdd}
          />
          <ActionButton
            icon="trash-outline"
            label="Delete"
            disabled={disabled}
            color={colors.error}
            onPress={onDelete}
          />
        </View>
      </View>
    </View>
  );
}

function ActionButton({
  icon,
  label,
  color,
  disabled,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  color: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const tint = disabled ? colors.textMuted : color;
  return (
    <TouchableOpacity
      style={[styles.action, disabled && styles.actionDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.6}
    >
      <Ionicons name={icon} size={17} color={tint} />
      <Text style={[styles.actionLabel, { color: tint }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm + 2,
    paddingBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    minHeight: 40,
  },
  count: {
    fontSize: fontSize.sm,
  },
  countNumber: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  countLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.xs - 1,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 1,
    borderRadius: 5,
  },
  actionDisabled: {
    opacity: 0.45,
  },
  actionLabel: {
    fontSize: fontSize.xs + 1,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
});
