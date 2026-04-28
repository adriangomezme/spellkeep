import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '../BottomSheet';
import { colors, spacing, fontSize, borderRadius } from '../../constants';
import type { GroupBy } from '../../lib/hooks/useGroupByPref';

const GROUP_OPTIONS: {
  key: GroupBy;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}[] = [
  { key: 'none', label: 'No grouping', icon: 'remove-outline' },
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
    <BottomSheet visible={visible} onClose={onClose}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Group by</Text>
        {showCollapseChip && (
          <TouchableOpacity
            style={[styles.collapseButton, collapseDisabled && styles.collapseButtonDisabled]}
            onPress={onToggleAllCollapsed}
            disabled={collapseDisabled}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.6}
          >
            <Ionicons
              name={allCollapsed ? 'chevron-down' : 'chevron-up'}
              size={13}
              color={colors.primary}
            />
            <Text style={styles.collapseLabel}>
              {allCollapsed ? 'Expand all' : 'Collapse all'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Section label */}
      <Text style={styles.sectionLabel}>Available groups</Text>

      {/* Options list */}
      <View style={styles.list}>
        {GROUP_OPTIONS.map((option, idx) => {
          const isActive = current === option.key;
          const isLast = idx === GROUP_OPTIONS.length - 1;
          return (
            <TouchableOpacity
              key={option.key}
              style={[styles.option, !isLast && styles.optionDivider]}
              onPress={() => onSelect(option.key)}
              activeOpacity={0.6}
            >
              <Ionicons
                name={option.icon}
                size={18}
                color={isActive ? colors.primary : colors.text}
                style={styles.optionIcon}
              />
              <Text
                style={[styles.optionLabel, isActive && styles.optionLabelActive]}
                numberOfLines={1}
              >
                {option.label}
              </Text>
              {isActive && (
                <Ionicons name="checkmark" size={18} color={colors.primary} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
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
    fontSize: fontSize.xxl,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  collapseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    backgroundColor: colors.primaryLight,
    borderRadius: 999,
  },
  collapseButtonDisabled: {
    opacity: 0.4,
  },
  collapseLabel: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  list: {},
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  optionDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  optionIcon: {
    width: 20,
    textAlign: 'center',
  },
  optionLabel: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  optionLabelActive: {
    color: colors.primary,
  },
});
