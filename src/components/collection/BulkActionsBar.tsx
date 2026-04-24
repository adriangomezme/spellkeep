import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, fontSize, spacing } from '../../constants';

// Replaces CollectionToolbar while the user is in bulk-selection
// mode. Shows the selection count on the left and the available
// actions on the right. Phase 1 ships Delete only; Move and Add land
// in the next iteration.
type Props = {
  count: number;
  onDelete: () => void;
};

export function BulkActionsBar({ count, onDelete }: Props) {
  const disabled = count === 0;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.count}>
          {count} {count === 1 ? 'card' : 'cards'} selected
        </Text>

        <TouchableOpacity
          style={[styles.action, disabled && styles.actionDisabled]}
          onPress={onDelete}
          disabled={disabled}
          activeOpacity={0.7}
        >
          <Ionicons
            name="trash-outline"
            size={18}
            color={disabled ? colors.textMuted : colors.error}
          />
          <Text
            style={[
              styles.actionLabel,
              { color: disabled ? colors.textMuted : colors.error },
            ]}
          >
            Delete
          </Text>
        </TouchableOpacity>
      </View>
    </View>
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
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
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
