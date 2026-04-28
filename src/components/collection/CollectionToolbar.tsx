import { useRef } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius } from '../../constants';

export type ViewMode = 'grid-compact' | 'grid' | 'list';

export type ToolbarSize = 'small' | 'medium' | 'large';

const VIEW_CYCLE: ViewMode[] = ['grid-compact', 'grid', 'list'];

const VIEW_ICONS: Record<ViewMode, React.ComponentProps<typeof Ionicons>['name']> = {
  'grid-compact': 'grid-outline',
  'grid': 'grid',
  'list': 'list',
};

// Per-size metrics. Small matches the original toolbar (densest, the
// default); Large is the biggest tap target. Exported so screens can
// compute their collapse-on-scroll height and animate consistently.
type Metrics = {
  controlHeight: number;
  iconBtn: number;
  searchIcon: number;
  actionIcon: number;
  badgeOffset: number;
  badgeSize: number;
  searchFontSize: number;
};

const METRICS: Record<ToolbarSize, Metrics> = {
  small:  { controlHeight: 36, iconBtn: 36, searchIcon: 16, actionIcon: 18, badgeOffset: 6, badgeSize: 6, searchFontSize: fontSize.md },
  medium: { controlHeight: 40, iconBtn: 40, searchIcon: 17, actionIcon: 20, badgeOffset: 6, badgeSize: 7, searchFontSize: fontSize.md },
  large:  { controlHeight: 44, iconBtn: 44, searchIcon: 18, actionIcon: 22, badgeOffset: 7, badgeSize: 7, searchFontSize: fontSize.lg },
};

/**
 * Total visible height the toolbar occupies, including its top and
 * bottom padding. Screens use this to drive the scroll-collapse
 * animation (the row interpolates from this down to 0). Must stay in
 * sync with `container.paddingTop` and `container.paddingBottom`
 * below — otherwise the toolbar clips during animation.
 */
export function toolbarHeightFor(size: ToolbarSize): number {
  return METRICS[size].controlHeight + (spacing.sm + 2) + spacing.sm;
}

/**
 * Per-size visual metrics. Exported so a preview / settings UI can
 * render a faithful miniature without re-defining the numbers.
 */
export function toolbarMetricsFor(size: ToolbarSize): {
  controlHeight: number;
  iconBtn: number;
  searchIcon: number;
  actionIcon: number;
  searchFontSize: number;
} {
  const m = METRICS[size];
  return {
    controlHeight: m.controlHeight,
    iconBtn: m.iconBtn,
    searchIcon: m.searchIcon,
    actionIcon: m.actionIcon,
    searchFontSize: m.searchFontSize,
  };
}

type Props = {
  searchQuery: string;
  onSearchChange: (text: string) => void;
  viewMode: ViewMode;
  onToggleView: () => void;
  onSortPress: () => void;
  onFilterPress: () => void;
  activeFilters: number;
  /** When provided, renders the Group By button. Active state is
   *  signalled by `groupActive` (mirrors the Filter badge dot). */
  onGroupPress?: () => void;
  groupActive?: boolean;
  size?: ToolbarSize;
};

export function CollectionToolbar({
  searchQuery,
  onSearchChange,
  viewMode,
  onToggleView,
  onSortPress,
  onFilterPress,
  activeFilters,
  onGroupPress,
  groupActive,
  size = 'small',
}: Props) {
  const m = METRICS[size];
  const inputRef = useRef<TextInput | null>(null);
  const searchFieldStyle: ViewStyle = { ...styles.searchField, height: m.controlHeight };
  const searchInputStyle: TextStyle = { ...styles.searchInput, fontSize: m.searchFontSize };
  const iconButtonStyle: ViewStyle = {
    ...styles.iconButton,
    width: m.iconBtn,
    height: m.iconBtn,
  };
  const badgeStyle: ViewStyle = {
    ...styles.filterBadge,
    top: m.badgeOffset,
    right: m.badgeOffset,
    width: m.badgeSize,
    height: m.badgeSize,
    borderRadius: m.badgeSize / 2,
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        {/* The pill is taller than the TextInput's intrinsic height, so
            a tap on the gray padding around the text used to do nothing.
            Wrapping in a Pressable that focuses the input on tap makes
            the whole pill the active target. */}
        <Pressable style={searchFieldStyle} onPress={() => inputRef.current?.focus()}>
          <Ionicons name="search" size={m.searchIcon} color={colors.textMuted} />
          <TextInput
            ref={inputRef}
            style={searchInputStyle}
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
              <Ionicons name="close-circle" size={m.searchIcon} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </Pressable>

        <TouchableOpacity style={iconButtonStyle} onPress={onSortPress} activeOpacity={0.6}>
          <Ionicons name="swap-vertical" size={m.actionIcon} color={colors.text} />
        </TouchableOpacity>

        <TouchableOpacity style={iconButtonStyle} onPress={onFilterPress} activeOpacity={0.6}>
          <Ionicons name="options-outline" size={m.actionIcon} color={activeFilters > 0 ? colors.primary : colors.text} />
          {activeFilters > 0 && <View style={badgeStyle} />}
        </TouchableOpacity>

        {onGroupPress && (
          <TouchableOpacity style={iconButtonStyle} onPress={onGroupPress} activeOpacity={0.6}>
            <Ionicons name="layers-outline" size={m.actionIcon} color={groupActive ? colors.primary : colors.text} />
            {groupActive && <View style={badgeStyle} />}
          </TouchableOpacity>
        )}

        <TouchableOpacity style={iconButtonStyle} onPress={onToggleView} activeOpacity={0.6}>
          <Ionicons name={VIEW_ICONS[viewMode]} size={m.actionIcon} color={colors.text} />
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
    paddingTop: spacing.sm + 2,
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
    borderRadius: 6,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    padding: 0,
  },
  iconButton: {
    borderRadius: 6,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadge: {
    position: 'absolute',
    backgroundColor: colors.primary,
  },
});
