import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '../BottomSheet';
import { colors, spacing, fontSize, borderRadius } from '../../constants';

export type SortOption =
  | 'added'
  | 'name'
  | 'mana_value'
  | 'price'
  | 'color_identity'
  | 'rarity'
  | 'collector_number'
  | 'set_code'
  | 'set_name'
  | 'edhrec_rank';

export type SortOptionDef = {
  key: SortOption;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
};

/**
 * Default options used by Owned / binder / list. The Search tab passes
 * its own list (relabeled `added` → "Release Date" + extra
 * `edhrec_rank`) — see SEARCH_SORT_OPTIONS in app/(tabs)/search.tsx.
 */
export const COLLECTION_SORT_OPTIONS: SortOptionDef[] = [
  { key: 'added', label: 'Last added', icon: 'time-outline' },
  { key: 'name', label: 'Name', icon: 'text-outline' },
  { key: 'mana_value', label: 'Mana value', icon: 'flame-outline' },
  { key: 'price', label: 'Price', icon: 'pricetag-outline' },
  { key: 'color_identity', label: 'Color identity', icon: 'color-palette-outline' },
  { key: 'rarity', label: 'Rarity', icon: 'diamond-outline' },
  { key: 'collector_number', label: 'Collector number', icon: 'barcode-outline' },
  { key: 'set_code', label: 'Set code', icon: 'layers-outline' },
  { key: 'set_name', label: 'Set name', icon: 'albums-outline' },
];

type Props = {
  visible: boolean;
  currentSort: SortOption;
  ascending: boolean;
  onSelect: (sort: SortOption) => void;
  onToggleDirection: () => void;
  onClose: () => void;
  options?: SortOptionDef[];
};

export function SortSheet({
  visible,
  currentSort,
  ascending,
  onSelect,
  onToggleDirection,
  onClose,
  options = COLLECTION_SORT_OPTIONS,
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
        <Ionicons name="swap-vertical" size={14} color={colors.primary} style={{ marginLeft: 'auto' }} />
      </TouchableOpacity>

      {/* Options list */}
      <Text style={styles.sectionLabel}>Order by</Text>
      <View style={styles.list}>
        {options.map((option, idx) => {
          const isActive = currentSort === option.key;
          const isLast = idx === options.length - 1;
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
