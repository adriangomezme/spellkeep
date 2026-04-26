import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '../BottomSheet';
import { colors, spacing, fontSize } from '../../constants';
import type { GroupBy } from '../../lib/hooks/useGroupByPref';

const GROUP_OPTIONS: {
  key: GroupBy;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}[] = [
  { key: 'none', label: 'No Grouping', icon: 'remove-outline' },
  { key: 'rarity', label: 'Rarity', icon: 'diamond-outline' },
  { key: 'set', label: 'Set', icon: 'albums-outline' },
  { key: 'color', label: 'Color', icon: 'color-palette-outline' },
  { key: 'type', label: 'Type', icon: 'shapes-outline' },
  { key: 'tags', label: 'Tags', icon: 'pricetags-outline' },
];

type Props = {
  visible: boolean;
  current: GroupBy;
  onSelect: (g: GroupBy) => void;
  onClose: () => void;
  /** Collapse-all chip — only meaningful when grouping is active and
   *  there is at least one group. */
  allCollapsed?: boolean;
  onToggleAllCollapsed?: () => void;
  collapseDisabled?: boolean;
};

export function GroupBySheet({
  visible,
  current,
  onSelect,
  onClose,
  allCollapsed,
  onToggleAllCollapsed,
  collapseDisabled,
}: Props) {
  const showCollapseChip = current !== 'none' && !!onToggleAllCollapsed;
  return (
    <BottomSheet visible={visible} onClose={onClose} snapPoints={['45%']}>
      <View style={styles.header}>
        <Text style={styles.title}>Group By</Text>
        {showCollapseChip && (
          <TouchableOpacity
            style={[styles.collapseButton, collapseDisabled && styles.collapseButtonDisabled]}
            onPress={onToggleAllCollapsed}
            disabled={collapseDisabled}
            activeOpacity={0.6}
          >
            <Ionicons
              name={allCollapsed ? 'chevron-down' : 'chevron-up'}
              size={16}
              color={colors.primary}
            />
            <Text style={styles.collapseLabel}>
              {allCollapsed ? 'Expand All' : 'Collapse All'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {GROUP_OPTIONS.map((option) => {
        const isActive = current === option.key;
        return (
          <TouchableOpacity
            key={option.key}
            style={styles.option}
            onPress={() => onSelect(option.key)}
            activeOpacity={0.5}
          >
            <Ionicons
              name={option.icon}
              size={18}
              color={isActive ? colors.primary : colors.textMuted}
            />
            <Text style={[styles.optionLabel, isActive && styles.optionLabelActive]}>
              {option.label}
            </Text>
            {isActive && (
              <Ionicons name="checkmark" size={18} color={colors.primary} style={{ marginLeft: 'auto' }} />
            )}
          </TouchableOpacity>
        );
      })}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
  },
  collapseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primaryLight,
    borderRadius: 999,
  },
  collapseButtonDisabled: {
    opacity: 0.4,
  },
  collapseLabel: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
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
  optionLabelActive: {
    color: colors.primary,
    fontWeight: '600',
  },
});
