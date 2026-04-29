import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from './BottomSheet';
import { colors, spacing, fontSize, borderRadius } from '../constants';
import type { AlertsSortKey } from '../lib/hooks/useAlertsSortPref';

type Option = {
  key: AlertsSortKey;
  label: string;
  description: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
};

const OPTIONS: Option[] = [
  {
    key: 'created',
    label: 'Created',
    description: 'When the alert was added',
    icon: 'time-outline',
  },
  {
    key: 'closest',
    label: 'Closest to trigger',
    description: 'Nearest target price first',
    icon: 'flash-outline',
  },
  {
    key: 'most_triggered',
    label: 'Most triggered',
    description: 'By number of triggers',
    icon: 'pulse-outline',
  },
  {
    key: 'recently_triggered',
    label: 'Recently triggered',
    description: 'Latest trigger first',
    icon: 'notifications-outline',
  },
];

type Props = {
  visible: boolean;
  currentKey: AlertsSortKey;
  ascending: boolean;
  onSelect: (key: AlertsSortKey) => void;
  onToggleDirection: () => void;
  onClose: () => void;
};

export function AlertsSortSheet({
  visible,
  currentKey,
  ascending,
  onSelect,
  onToggleDirection,
  onClose,
}: Props) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Sort by</Text>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
      </View>

      {/* Direction pill */}
      <TouchableOpacity
        style={styles.directionButton}
        onPress={onToggleDirection}
        activeOpacity={0.6}
      >
        <Ionicons
          name={ascending ? 'arrow-up' : 'arrow-down'}
          size={14}
          color={colors.primary}
        />
        <Text style={styles.directionLabel}>
          {ascending ? 'Ascending' : 'Descending'}
        </Text>
        <Ionicons
          name="swap-vertical"
          size={14}
          color={colors.primary}
          style={{ marginLeft: 'auto' }}
        />
      </TouchableOpacity>

      {/* Section label */}
      <Text style={styles.sectionLabel}>Order by</Text>

      {/* Options list */}
      <View style={styles.list}>
        {OPTIONS.map((option, idx) => {
          const isActive = currentKey === option.key;
          const isLast = idx === OPTIONS.length - 1;
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
              <View style={styles.optionText}>
                <Text
                  style={[styles.optionLabel, isActive && styles.optionLabelActive]}
                  numberOfLines={1}
                >
                  {option.label}
                </Text>
                <Text style={styles.optionDescription} numberOfLines={1}>
                  {option.description}
                </Text>
              </View>
              {isActive && <Ionicons name="checkmark" size={18} color={colors.primary} />}
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
  cancel: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  directionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.sm + 2,
    marginBottom: spacing.md,
  },
  directionLabel: {
    color: colors.primary,
    fontSize: fontSize.sm,
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
  optionText: {
    flex: 1,
    minWidth: 0,
  },
  optionLabel: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  optionLabelActive: {
    color: colors.primary,
  },
  optionDescription: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '500',
    marginTop: 2,
  },
});
