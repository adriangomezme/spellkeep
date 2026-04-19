import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '../BottomSheet';
import { colors, spacing, fontSize } from '../../constants';

export type SortOption =
  | 'added'
  | 'name'
  | 'mana_value'
  | 'price'
  | 'color_identity'
  | 'rarity'
  | 'collector_number'
  | 'set_code'
  | 'set_name';

const SORT_OPTIONS: { key: SortOption; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { key: 'added', label: 'Last Added', icon: 'time-outline' },
  { key: 'name', label: 'Name', icon: 'text-outline' },
  { key: 'mana_value', label: 'Mana Value', icon: 'flame-outline' },
  { key: 'price', label: 'Price', icon: 'pricetag-outline' },
  { key: 'color_identity', label: 'Color Identity', icon: 'color-palette-outline' },
  { key: 'rarity', label: 'Rarity', icon: 'diamond-outline' },
  { key: 'collector_number', label: 'Collector Number', icon: 'barcode-outline' },
  { key: 'set_code', label: 'Set Code', icon: 'layers-outline' },
  { key: 'set_name', label: 'Set Name', icon: 'albums-outline' },
];

type Props = {
  visible: boolean;
  currentSort: SortOption;
  ascending: boolean;
  onSelect: (sort: SortOption) => void;
  onToggleDirection: () => void;
  onClose: () => void;
};

export function SortSheet({ visible, currentSort, ascending, onSelect, onToggleDirection, onClose }: Props) {
  return (
    <BottomSheet visible={visible} onClose={onClose} snapPoints={['55%']}>
      <View style={styles.header}>
        <Text style={styles.title}>Sort By</Text>
        <TouchableOpacity style={styles.directionButton} onPress={onToggleDirection} activeOpacity={0.6}>
          <Ionicons
            name={ascending ? 'arrow-up' : 'arrow-down'}
            size={16}
            color={colors.primary}
          />
          <Text style={styles.directionLabel}>{ascending ? 'Ascending' : 'Descending'}</Text>
        </TouchableOpacity>
      </View>

      {SORT_OPTIONS.map((option) => {
        const isActive = currentSort === option.key;
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
  directionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primaryLight,
    borderRadius: 999,
  },
  directionLabel: {
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
