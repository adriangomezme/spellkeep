import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, fontSize, spacing } from '../../constants';

// Replaces CollectionToolbar while the user is in bulk-selection
// mode. Left: count. Right: actions — Move (re-parent rows), Add
// (duplicate rows to another collection), Delete (remove rows).
type Props = {
  count: number;
  onMove: () => void;
  onAdd: () => void;
  onDelete: () => void;
};

export function BulkActionsBar({ count, onMove, onAdd, onDelete }: Props) {
  const disabled = count === 0;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.count}>
          {count} {count === 1 ? 'card' : 'cards'}
        </Text>

        <View style={styles.actions}>
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
  return (
    <TouchableOpacity
      style={[styles.action, disabled && styles.actionDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <Ionicons name={icon} size={17} color={disabled ? colors.textMuted : color} />
      <Text
        style={[
          styles.actionLabel,
          { color: disabled ? colors.textMuted : color },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    height: 36,
  },
  count: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  actionDisabled: {
    opacity: 0.5,
  },
  actionLabel: {
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
});
