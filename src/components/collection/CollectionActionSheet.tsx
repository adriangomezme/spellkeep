import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '../BottomSheet';
import { colors, spacing, fontSize, borderRadius } from '../../constants';

type ActionOption = {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  destructive?: boolean;
};

type Props = {
  visible: boolean;
  itemName: string;
  itemType: 'binder' | 'list' | 'folder';
  /** Whether the item is currently inside a folder */
  inFolder?: boolean;
  /** Whether this item is the current Quick Add target. Toggles the label
   *  of the "Set/Clear Quick Add target" action. */
  isQuickAddTarget?: boolean;
  /** Hide the Reorder action — used when the sheet is opened from a
   *  context where reordering siblings would be confusing (the folder's
   *  own detail screen, a binder's own detail screen). */
  hideReorder?: boolean;
  onAction: (key: string) => void;
  onClose: () => void;
};

export function CollectionActionSheet({
  visible,
  itemName,
  itemType,
  inFolder,
  isQuickAddTarget,
  hideReorder,
  onAction,
  onClose,
}: Props) {
  // Quick actions shown as top buttons (binder/list only)
  const quickActions: ActionOption[] = [];
  // List actions shown below
  const listActions: ActionOption[] = [];

  if (itemType === 'folder') {
    quickActions.push({ key: 'edit', label: 'Edit', icon: 'create-outline' });
    if (!hideReorder) {
      quickActions.push({ key: 'reorder', label: 'Reorder', icon: 'reorder-three-outline' });
    }
    quickActions.push({ key: 'delete', label: 'Delete', icon: 'trash-outline', destructive: true });
  } else {
    // Quick actions: Edit, Duplicate, Move/Remove folder
    quickActions.push(
      { key: 'edit', label: 'Edit', icon: 'create-outline' },
      { key: 'duplicate', label: 'Duplicate', icon: 'copy-outline' },
    );
    if (inFolder) {
      quickActions.push({ key: 'remove-from-folder', label: 'Remove', icon: 'exit-outline' });
    } else {
      quickActions.push({ key: 'move-to-folder', label: 'Move', icon: 'folder-outline' });
    }

    // Remaining list actions
    listActions.push(
      {
        key: isQuickAddTarget ? 'clear-quick-add' : 'set-quick-add',
        label: isQuickAddTarget ? 'Clear Quick Add target' : 'Set as Quick Add target',
        icon: isQuickAddTarget ? 'flash-off-outline' : 'flash-outline',
      },
      { key: 'merge', label: 'Merge', icon: 'git-merge-outline' },
      { key: 'import', label: 'Import', icon: 'arrow-down-circle-outline' },
      { key: 'export', label: 'Export', icon: 'arrow-up-circle-outline' },
      ...(hideReorder
        ? []
        : [{ key: 'reorder' as const, label: 'Reorder', icon: 'reorder-three-outline' as const }]),
      { key: 'empty', label: 'Empty', icon: 'refresh-outline', destructive: true },
      { key: 'delete', label: 'Delete', icon: 'trash-outline', destructive: true },
    );
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} snapPoints={[itemType === 'folder' ? '22%' : '60%']}>
      <Text style={styles.title} numberOfLines={1}>{itemName}</Text>

      {/* Quick action buttons */}
      {quickActions.length > 0 && (
        <View style={styles.quickRow}>
          {quickActions.map((action) => (
            <TouchableOpacity
              key={action.key}
              style={styles.quickButton}
              onPress={() => onAction(action.key)}
              activeOpacity={0.5}
            >
              <Ionicons name={action.icon} size={22} color={action.destructive ? colors.error : colors.text} />
              <Text style={[styles.quickLabel, action.destructive && styles.optionDestructive]}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* List actions */}
      {listActions.map((action) => (
        <TouchableOpacity
          key={action.key}
          style={styles.option}
          onPress={() => onAction(action.key)}
          activeOpacity={0.5}
        >
          <Ionicons
            name={action.icon}
            size={20}
            color={action.destructive ? colors.error : colors.text}
          />
          <Text style={[styles.optionLabel, action.destructive && styles.optionDestructive]}>
            {action.label}
          </Text>
        </TouchableOpacity>
      ))}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  /* Quick action buttons row */
  quickRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  quickButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.md,
  },
  quickLabel: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  /* List options */
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.divider,
  },
  optionLabel: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '500',
  },
  optionDestructive: {
    color: colors.error,
  },
});
