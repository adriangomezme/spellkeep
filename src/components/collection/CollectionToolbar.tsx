import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius } from '../../constants';

export type ViewMode = 'grid-compact' | 'grid' | 'list';

const VIEW_CYCLE: ViewMode[] = ['grid-compact', 'grid', 'list'];

const VIEW_ICONS: Record<ViewMode, React.ComponentProps<typeof Ionicons>['name']> = {
  'grid-compact': 'grid-outline',
  'grid': 'grid',
  'list': 'list',
};

type Props = {
  searchQuery: string;
  onSearchChange: (text: string) => void;
  viewMode: ViewMode;
  onToggleView: () => void;
  onSortPress: () => void;
  onFilterPress: () => void;
  activeFilters: number;
};

export function CollectionToolbar({
  searchQuery,
  onSearchChange,
  viewMode,
  onToggleView,
  onSortPress,
  onFilterPress,
  activeFilters,
}: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <View style={styles.searchField}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search cards..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={onSearchChange}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => onSearchChange('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity style={styles.iconButton} onPress={onSortPress} activeOpacity={0.6}>
          <Ionicons name="swap-vertical" size={18} color={colors.text} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.iconButton} onPress={onFilterPress} activeOpacity={0.6}>
          <Ionicons name="options-outline" size={18} color={activeFilters > 0 ? colors.primary : colors.text} />
          {activeFilters > 0 && <View style={styles.filterBadge} />}
        </TouchableOpacity>

        <TouchableOpacity style={styles.iconButton} onPress={onToggleView} activeOpacity={0.6}>
          <Ionicons name={VIEW_ICONS[viewMode]} size={18} color={colors.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function nextViewMode(current: ViewMode): ViewMode {
  const idx = VIEW_CYCLE.indexOf(current);
  return VIEW_CYCLE[(idx + 1) % VIEW_CYCLE.length];
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  searchField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    height: 36,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.text,
    padding: 0,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
});
