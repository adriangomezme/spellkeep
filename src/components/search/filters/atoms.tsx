import { memo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Pressable,
  type ViewStyle,
  type TextInput as TextInputType,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  type MultiSelectMode,
  type StatComparator,
  type StatFilter,
} from '../../../lib/search/searchFilters';
import { colors, spacing, fontSize, borderRadius, shadows } from '../../../constants';

// ─────────────────────────────────────────────────────────────────────
// FilterCard — generic card wrapper for filter sections. Each filter
// dimension lives in its own card so the screen reads as a tidy stack
// of grouped controls instead of one undifferentiated wall of inputs.
// ─────────────────────────────────────────────────────────────────────

export const FilterCard = memo(function FilterCard({
  title,
  icon,
  trailing,
  children,
  noPaddingBottom,
  style,
}: {
  title: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  trailing?: React.ReactNode;
  children: React.ReactNode;
  noPaddingBottom?: boolean;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.card, noPaddingBottom && { paddingBottom: spacing.sm }, style]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <Ionicons name={icon} size={16} color={colors.primary} />
          <Text style={styles.cardTitle}>{title}</Text>
        </View>
        {trailing}
      </View>
      {children}
    </View>
  );
});

// ─────────────────────────────────────────────────────────────────────
// NumericStatRow — comparator + stepper for power / toughness /
// loyalty / mana value / price. The stepper covers the practical
// 0–20+ range with - / + buttons, plus a free-text input for special
// values like `*` or `X`.
// ─────────────────────────────────────────────────────────────────────

const COMPARATORS: { key: StatComparator; label: string }[] = [
  { key: 'gte', label: '≥' },
  { key: 'eq', label: '=' },
  { key: 'lte', label: '≤' },
];

const MAX_NUMERIC = 20;

export const NumericStatRow = memo(function NumericStatRow({
  stat,
  onChange,
  unit,
  placeholder,
}: {
  stat: StatFilter;
  onChange: (next: StatFilter) => void;
  /** Optional unit prefix (e.g. `$` for price). */
  unit?: string;
  placeholder?: string;
}) {
  const numericValue = parseFloat(stat.value);
  const isNumeric = !isNaN(numericValue);
  const inputRef = useRef<TextInputType | null>(null);

  function step(delta: number) {
    const base = isNumeric ? numericValue : 0;
    const next = Math.max(0, Math.min(MAX_NUMERIC + 5, base + delta));
    onChange({ ...stat, value: String(next) });
  }

  return (
    <View style={styles.statRow}>
      <View style={styles.modeSegmented}>
        {COMPARATORS.map((c) => {
          const active = stat.comparator === c.key;
          return (
            <TouchableOpacity
              key={c.key}
              style={[styles.modeSegment, active && styles.modeSegmentActive]}
              onPress={() => onChange({ ...stat, comparator: c.key })}
              activeOpacity={0.6}
            >
              <Text style={[styles.modeSegmentLabel, active && styles.modeSegmentLabelActive]}>
                {c.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <TouchableOpacity
        style={styles.stepBtn}
        onPress={() => step(-1)}
        activeOpacity={0.6}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Ionicons name="remove" size={18} color={colors.text} />
      </TouchableOpacity>
      <Pressable style={styles.valueWrap} onPress={() => inputRef.current?.focus()}>
        {unit && <Text style={styles.unit}>{unit}</Text>}
        <TextInput
          ref={inputRef}
          style={styles.valueInput}
          value={stat.value}
          onChangeText={(t) => onChange({ ...stat, value: t.replace(/[^0-9.X*]/gi, '') })}
          placeholder={placeholder ?? 'Off'}
          placeholderTextColor={colors.textMuted}
          keyboardType="decimal-pad"
          returnKeyType="done"
          textAlign="center"
        />
      </Pressable>
      <TouchableOpacity
        style={styles.stepBtn}
        onPress={() => step(1)}
        activeOpacity={0.6}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Ionicons name="add" size={18} color={colors.text} />
      </TouchableOpacity>
    </View>
  );
});

// ─────────────────────────────────────────────────────────────────────
// ToggleSwitch — the visual knob+track only. Used in FilterCard's
// `trailing` slot when the card's title doubles as the toggle label
// (e.g. "Exact name" card → switch lives in the header, description
// fills the body). The whole knob is tappable.
// ─────────────────────────────────────────────────────────────────────

export const ToggleSwitch = memo(function ToggleSwitch({
  active,
  onPress,
}: {
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      style={[styles.toggleSwitch, active && styles.toggleSwitchActive]}
    >
      <View style={[styles.toggleKnob, active && styles.toggleKnobActive]} />
    </Pressable>
  );
});

// ─────────────────────────────────────────────────────────────────────
// ToggleRow — two-line toggle (label + description) for stacks of
// related toggles inside a single card (e.g. Misc card with Reserved
// List / Game Changer / Promo / Reprint). Tap anywhere to flip.
// ─────────────────────────────────────────────────────────────────────

export const ToggleRow = memo(function ToggleRow({
  label,
  description,
  active,
  onPress,
}: {
  label: string;
  description?: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.toggleRow} onPress={onPress}>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {description && <Text style={styles.toggleDesc}>{description}</Text>}
      </View>
      <ToggleSwitch active={active} onPress={onPress} />
    </Pressable>
  );
});

// ─────────────────────────────────────────────────────────────────────
// MultiSelectModeSegmented — Any / All / Not chip set used inside
// FilterCard's `trailing` slot for Keywords, Card Type, Subtypes,
// Legality. Reuses the same compact look as the color-mode segmented
// control so users learn the pattern once.
// ─────────────────────────────────────────────────────────────────────

const MULTI_SELECT_OPTIONS: { key: MultiSelectMode; label: string }[] = [
  { key: 'any', label: 'Any' },
  { key: 'all', label: 'All' },
  { key: 'not', label: 'Not' },
];

export const MultiSelectModeSegmented = memo(function MultiSelectModeSegmented({
  value,
  onChange,
}: {
  value: MultiSelectMode;
  onChange: (next: MultiSelectMode) => void;
}) {
  return (
    <View style={styles.compactSegmented}>
      {MULTI_SELECT_OPTIONS.map((o) => {
        const active = value === o.key;
        return (
          <TouchableOpacity
            key={o.key}
            style={[styles.compactSeg, active && styles.compactSegActive]}
            onPress={() => onChange(o.key)}
            activeOpacity={0.6}
          >
            <Text style={[styles.compactSegLabel, active && styles.compactSegLabelActive]}>
              {o.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
});

// ─────────────────────────────────────────────────────────────────────
// SegmentedSelector — generic n-state segmented control, equal width
// across segments. Used inline inside cards (Group mode, etc).
// ─────────────────────────────────────────────────────────────────────

export const SegmentedSelector = memo(function SegmentedSelector<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <View style={styles.segmentedRow}>
      {options.map((o) => {
        const active = value === o.key;
        return (
          <TouchableOpacity
            key={o.key}
            style={[styles.segmentedSeg, active && styles.segmentedSegActive]}
            onPress={() => onChange(o.key)}
            activeOpacity={0.6}
          >
            <Text style={[styles.segmentedLabel, active && styles.segmentedLabelActive]}>
              {o.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
});

// ─────────────────────────────────────────────────────────────────────
// SearchableMultiSelect — search box, chip strip of currently-selected
// values, then a scrollable list of options. Used for Sets, Artists,
// Keywords, Subtypes — anything with a long predefined list. The
// `renderRow` prop lets each consumer control row layout (icon vs
// plain text) while the chrome / search / selection logic stays here.
// ─────────────────────────────────────────────────────────────────────

export type SearchableOption = {
  /** Persisted in filter state (e.g. set code, artist name). */
  key: string;
  /** Display string used for filtering. */
  label: string;
  /** Optional secondary line / count. */
  meta?: string;
};

export const SearchableMultiSelect = memo(function SearchableMultiSelect({
  options,
  selected,
  onChange,
  placeholder,
  renderLeading,
  emptyText,
  maxVisible = 8,
}: {
  options: SearchableOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  renderLeading?: (opt: SearchableOption) => React.ReactNode;
  emptyText?: string;
  /** Caps the inline list height — anything longer scrolls inside the
   *  card without making the parent page jump. */
  maxVisible?: number;
}) {
  const [search, setSearch] = useState('');
  const inputRef = useRef<TextInputType | null>(null);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? options.filter(
        (o) => o.label.toLowerCase().includes(q) || o.key.toLowerCase().includes(q)
      )
    : options;
  const visibleHeight = maxVisible * 44; // row height ≈ 44px

  function toggle(key: string) {
    onChange(selected.includes(key) ? selected.filter((s) => s !== key) : [...selected, key]);
  }

  return (
    <View>
      {selected.length > 0 && (
        <View style={styles.selectedRow}>
          {selected.map((k) => {
            const opt = options.find((o) => o.key === k);
            return (
              <TouchableOpacity
                key={k}
                style={styles.selectedChip}
                onPress={() => toggle(k)}
                activeOpacity={0.6}
              >
                <Text style={styles.selectedChipLabel} numberOfLines={1}>
                  {opt?.label ?? k}
                </Text>
                <Ionicons name="close" size={12} color={colors.primary} />
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <Pressable style={styles.searchField} onPress={() => inputRef.current?.focus()}>
        <Ionicons name="search" size={14} color={colors.textMuted} />
        <TextInput
          ref={inputRef}
          style={styles.searchInput}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={14} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </Pressable>

      <ScrollView
        style={[styles.optionList, { maxHeight: visibleHeight }]}
        nestedScrollEnabled
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
      >
        {filtered.length === 0 ? (
          <Text style={styles.emptyHint}>{emptyText ?? `No matches for "${search}"`}</Text>
        ) : (
          filtered.slice(0, 200).map((opt) => {
            const active = selected.includes(opt.key);
            return (
              <TouchableOpacity
                key={opt.key}
                style={styles.optionRow}
                onPress={() => toggle(opt.key)}
                activeOpacity={0.5}
              >
                <View style={[styles.checkbox, active && styles.checkboxActive]}>
                  {active && <Ionicons name="checkmark" size={12} color="#FFF" />}
                </View>
                {renderLeading && renderLeading(opt)}
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.optionLabel, active && { color: colors.primary }]}
                    numberOfLines={1}
                  >
                    {opt.label}
                  </Text>
                </View>
                {opt.meta && <Text style={styles.optionMeta}>{opt.meta}</Text>}
              </TouchableOpacity>
            );
          })
        )}
        {filtered.length > 200 && (
          <Text style={styles.emptyHint}>
            Showing first 200 — refine the search to see more.
          </Text>
        )}
      </ScrollView>
    </View>
  );
});

// ─────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  /* NumericStatRow */
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  modeSegmented: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.sm,
    padding: 2,
    gap: 2,
  },
  modeSegment: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: borderRadius.sm - 2,
    minWidth: 32,
    alignItems: 'center',
  },
  modeSegmentActive: {
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  modeSegmentLabel: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  modeSegmentLabelActive: {
    color: colors.primary,
  },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.sm,
    height: 36,
    paddingHorizontal: spacing.sm,
    gap: 2,
  },
  unit: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  valueInput: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
    padding: 0,
  },
  /* ToggleRow */
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  toggleLabel: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  toggleDesc: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  toggleSwitch: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.surfaceSecondary,
    padding: 3,
    justifyContent: 'center',
  },
  toggleSwitchActive: {
    backgroundColor: colors.primary,
  },
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  toggleKnobActive: {
    transform: [{ translateX: 18 }],
  },
  /* MultiSelectModeSegmented */
  compactSegmented: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.sm,
    padding: 2,
    gap: 2,
  },
  compactSeg: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm - 2,
    minWidth: 38,
    alignItems: 'center',
  },
  compactSegActive: {
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  compactSegLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  compactSegLabelActive: {
    color: colors.primary,
  },
  /* SegmentedSelector */
  segmentedRow: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.sm,
    padding: 2,
    gap: 2,
  },
  segmentedSeg: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: borderRadius.sm - 2,
  },
  segmentedSegActive: {
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  segmentedLabel: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  segmentedLabelActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  /* SearchableMultiSelect */
  selectedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.primaryLight,
    maxWidth: 160,
  },
  selectedChipLabel: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  searchField: {
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
    color: colors.text,
    fontSize: fontSize.sm,
    padding: 0,
  },
  optionList: {
    marginTop: spacing.sm,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md - 1,
    paddingHorizontal: spacing.xs,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.divider,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  optionLabel: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  optionMeta: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  emptyHint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
});
