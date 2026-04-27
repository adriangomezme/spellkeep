import { forwardRef, useImperativeHandle, useRef } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  type ViewStyle,
  type TextStyle,
  type TextInput as TextInputType,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  toolbarMetricsFor,
  type ToolbarSize,
  type ViewMode,
} from '../collection/CollectionToolbar';
import { colors, spacing, fontSize, borderRadius } from '../../constants';

const VIEW_ICONS: Record<ViewMode, React.ComponentProps<typeof Ionicons>['name']> = {
  'grid-compact': 'grid-outline',
  'grid': 'grid',
  'list': 'list',
};

type Props = {
  query: string;
  onChangeQuery: (text: string) => void;
  onClear: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onSubmit?: () => void;
  viewMode: ViewMode;
  onToggleView: () => void;
  onSortPress: () => void;
  onFilterPress: () => void;
  /** Number of active filter dimensions — drives the badge dot. Meta
   *  toggles (exact / unique / my-cards) are not counted; see
   *  `countActiveSearchFilters`. */
  activeFilters: number;
  /** Opens the AI search modal. Optional so screens that don't want
   *  the AI affordance (set detail, etc) can leave it off. */
  onAiPress?: () => void;
  size?: ToolbarSize;
  /** Square the bottom corners of the search field — used when a
   *  suggestions dropdown is rendered directly underneath, so the two
   *  feel like a single attached surface. */
  fieldSquareBottom?: boolean;
};

export const SearchToolbar = forwardRef<TextInputType, Props>(function SearchToolbar(
  {
    query,
    onChangeQuery,
    onClear,
    onFocus,
    onBlur,
    onSubmit,
    viewMode,
    onToggleView,
    onSortPress,
    onFilterPress,
    activeFilters,
    onAiPress,
    size = 'small',
    fieldSquareBottom,
  },
  ref
) {
  const m = toolbarMetricsFor(size);
  // Internal ref so we can focus the input from a Pressable wrapping
  // the entire field (otherwise tapping the padding around the text
  // does nothing). We forward it back out via useImperativeHandle so
  // the parent (search.tsx) can still drive focus / blur.
  const innerRef = useRef<TextInputType | null>(null);
  useImperativeHandle(ref, () => innerRef.current as TextInputType, []);
  const fieldStyle: ViewStyle = {
    ...styles.field,
    height: m.controlHeight,
    borderBottomLeftRadius: fieldSquareBottom ? 0 : borderRadius.sm,
    borderBottomRightRadius: fieldSquareBottom ? 0 : borderRadius.sm,
  };
  const inputStyle: TextStyle = { ...styles.input, fontSize: m.searchFontSize };
  const iconBtnStyle: ViewStyle = {
    ...styles.iconButton,
    width: m.iconBtn,
    height: m.iconBtn,
  };
  const badgeStyle: ViewStyle = {
    ...styles.filterBadge,
    top: 6,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 3.5,
  };

  return (
    <View style={styles.container}>
      <Pressable style={fieldStyle} onPress={() => innerRef.current?.focus()}>
        <Ionicons name="search" size={m.searchIcon} color={colors.textMuted} />
        <TextInput
          ref={innerRef}
          style={inputStyle}
          placeholder="Search any Magic card..."
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={onChangeQuery}
          onFocus={onFocus}
          onBlur={onBlur}
          onSubmitEditing={onSubmit}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={onClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={m.searchIcon} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </Pressable>

      <TouchableOpacity style={iconBtnStyle} onPress={onSortPress} activeOpacity={0.6}>
        <Ionicons name="swap-vertical" size={m.actionIcon} color={colors.text} />
      </TouchableOpacity>

      <TouchableOpacity style={iconBtnStyle} onPress={onFilterPress} activeOpacity={0.6}>
        <Ionicons
          name="options-outline"
          size={m.actionIcon}
          color={activeFilters > 0 ? colors.primary : colors.text}
        />
        {activeFilters > 0 && <View style={badgeStyle} />}
      </TouchableOpacity>

      {onAiPress && (
        <TouchableOpacity style={iconBtnStyle} onPress={onAiPress} activeOpacity={0.6}>
          <Ionicons name="sparkles" size={m.actionIcon} color={colors.primary} />
        </TouchableOpacity>
      )}

      <TouchableOpacity style={iconBtnStyle} onPress={onToggleView} activeOpacity={0.6}>
        <Ionicons name={VIEW_ICONS[viewMode]} size={m.actionIcon} color={colors.text} />
      </TouchableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSecondary,
    borderTopLeftRadius: borderRadius.sm,
    borderTopRightRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    color: colors.text,
    padding: 0,
  },
  iconButton: {
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadge: {
    position: 'absolute',
    backgroundColor: colors.primary,
  },
});
