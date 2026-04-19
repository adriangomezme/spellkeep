import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
  Dimensions,
} from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '../BottomSheet';
import { colors, spacing, fontSize, borderRadius } from '../../constants';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const CHROME_HEIGHT = 220; // header + tabs + search + apply + padding
const SELECTED_BAR_HEIGHT = 40;

function getSetListMax(snapFraction: number, hasSelected: boolean): number {
  return SCREEN_HEIGHT * snapFraction - CHROME_HEIGHT - (hasSelected ? SELECTED_BAR_HEIGHT : 0);
}

/* ── MTG color definitions ── */
const MTG_COLORS = [
  { key: 'W', label: 'White', color: '#F9FAF4', border: '#D5D0C8' },
  { key: 'U', label: 'Blue', color: '#0E68AB', border: '#0E68AB' },
  { key: 'B', label: 'Black', color: '#150B00', border: '#150B00' },
  { key: 'R', label: 'Red', color: '#D3202A', border: '#D3202A' },
  { key: 'G', label: 'Green', color: '#00733E', border: '#00733E' },
  { key: 'C', label: 'Colorless', color: '#CCC2C0', border: '#B0A8A6' },
] as const;

const RARITIES = [
  { key: 'common', label: 'Common', color: '#1A1A1A' },
  { key: 'uncommon', label: 'Uncommon', color: '#6B8E9B' },
  { key: 'rare', label: 'Rare', color: '#C9A829' },
  { key: 'mythic', label: 'Mythic', color: '#D34F2B' },
] as const;

const CARD_TYPES = [
  'Creature', 'Instant', 'Sorcery', 'Enchantment',
  'Artifact', 'Planeswalker', 'Land', 'Battle',
] as const;

const MANA_RANGES = [
  { key: '0', label: '0' }, { key: '1', label: '1' }, { key: '2', label: '2' },
  { key: '3', label: '3' }, { key: '4', label: '4' }, { key: '5', label: '5' },
  { key: '6', label: '6' }, { key: '7+', label: '7+' },
] as const;

export type PriceMode = 'gte' | 'lte';

export type FilterState = {
  colors: string[];
  rarity: string[];
  types: string[];
  manaValue: string[];
  isLegendary: boolean | null;
  priceMode: PriceMode;
  priceValue: string;
  sets: string[];
};

export const EMPTY_FILTERS: FilterState = {
  colors: [],
  rarity: [],
  types: [],
  manaValue: [],
  isLegendary: null,
  priceMode: 'gte',
  priceValue: '',
  sets: [],
};

export function countActiveFilters(f: FilterState): number {
  let count = 0;
  if (f.colors.length) count++;
  if (f.rarity.length) count++;
  if (f.types.length) count++;
  if (f.manaValue.length) count++;
  if (f.isLegendary !== null) count++;
  if (f.priceValue.trim()) count++;
  if (f.sets.length) count++;
  return count;
}

export type SetInfo = {
  code: string;
  name: string;
  count: number;
};

type Tab = 'general' | 'set';

type Props = {
  visible: boolean;
  filters: FilterState;
  availableSets: SetInfo[];
  onApply: (filters: FilterState) => void;
  onReset: () => void;
  onClose: () => void;
};

export function FilterSheet({ visible, filters, availableSets, onApply, onReset, onClose }: Props) {
  const [local, setLocal] = useState<FilterState>(filters);
  const [tab, setTab] = useState<Tab>('general');
  const [setSearch, setSetSearch] = useState('');
  const [snapFraction, setSnapFraction] = useState(0.65);

  const SNAP_FRACTIONS = [0.65, 0.95];

  useEffect(() => {
    if (visible) {
      setLocal(filters);
      setTab('general');
      setSetSearch('');
      setSnapFraction(0.65);
    }
  }, [visible]);

  function toggleArray(arr: string[], value: string): string[] {
    return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
  }

  function handleApply() {
    onApply(local);
    onClose();
  }

  function handleReset() {
    setLocal(EMPTY_FILTERS);
    onReset();
    onClose();
  }

  const activeCount = countActiveFilters(local);

  const filteredSets = setSearch.trim()
    ? availableSets.filter(
        (s) =>
          s.name.toLowerCase().includes(setSearch.trim().toLowerCase()) ||
          s.code.toLowerCase().includes(setSearch.trim().toLowerCase()),
      )
    : availableSets;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      snapPoints={['65%', '95%']}
      onSnapChange={(index) => {
        if (index >= 0) {
          LayoutAnimation.configureNext(LayoutAnimation.create(250, 'easeInEaseOut', 'opacity'));
          setSnapFraction(SNAP_FRACTIONS[index] ?? 0.65);
        }
      }}
    >
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.title}>Filters</Text>
        {activeCount > 0 && (
          <TouchableOpacity onPress={handleReset} activeOpacity={0.6}>
            <Text style={styles.resetText}>Reset All</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Tabs ── */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, tab === 'general' && styles.tabActive]}
          onPress={() => setTab('general')}
          activeOpacity={0.6}
        >
          <Text style={[styles.tabLabel, tab === 'general' && styles.tabLabelActive]}>General</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'set' && styles.tabActive]}
          onPress={() => setTab('set')}
          activeOpacity={0.6}
        >
          <Text style={[styles.tabLabel, tab === 'set' && styles.tabLabelActive]}>
            Set{local.sets.length > 0 ? ` (${local.sets.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Tab content ── */}
      {tab === 'general' ? (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} nestedScrollEnabled>
          {/* Colors */}
          <Text style={styles.sectionLabel}>Color Identity</Text>
          <View style={styles.chipRow}>
            {MTG_COLORS.map((c) => {
              const active = local.colors.includes(c.key);
              return (
                <TouchableOpacity
                  key={c.key}
                  style={[
                    styles.colorChip,
                    { backgroundColor: c.color, borderColor: c.border },
                    active && styles.colorChipActive,
                  ]}
                  onPress={() => setLocal({ ...local, colors: toggleArray(local.colors, c.key) })}
                  activeOpacity={0.6}
                >
                  {active && (
                    <Ionicons
                      name="checkmark-circle"
                      size={14}
                      color={c.key === 'W' || c.key === 'C' ? '#333' : '#FFF'}
                    />
                  )}
                  <Text
                    style={[
                      styles.colorChipLabel,
                      { color: c.key === 'W' || c.key === 'C' ? '#333' : '#FFF' },
                    ]}
                  >
                    {c.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Rarity */}
          <Text style={styles.sectionLabel}>Rarity</Text>
          <View style={styles.chipRow}>
            {RARITIES.map((r) => {
              const active = local.rarity.includes(r.key);
              return (
                <TouchableOpacity
                  key={r.key}
                  style={[styles.pill, active && styles.pillActive]}
                  onPress={() => setLocal({ ...local, rarity: toggleArray(local.rarity, r.key) })}
                  activeOpacity={0.6}
                >
                  <View style={[styles.rarityDot, { backgroundColor: r.color }]} />
                  <Text style={[styles.pillLabel, active && styles.pillLabelActive]}>{r.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Mana Value */}
          <Text style={styles.sectionLabel}>Mana Value</Text>
          <View style={styles.chipRow}>
            {MANA_RANGES.map((m) => {
              const active = local.manaValue.includes(m.key);
              return (
                <TouchableOpacity
                  key={m.key}
                  style={[styles.manaChip, active && styles.manaChipActive]}
                  onPress={() => setLocal({ ...local, manaValue: toggleArray(local.manaValue, m.key) })}
                  activeOpacity={0.6}
                >
                  <Text style={[styles.manaChipLabel, active && styles.manaChipLabelActive]}>{m.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Card Type */}
          <Text style={styles.sectionLabel}>Card Type</Text>
          <View style={styles.chipRow}>
            {CARD_TYPES.map((t) => {
              const active = local.types.includes(t);
              return (
                <TouchableOpacity
                  key={t}
                  style={[styles.pill, active && styles.pillActive]}
                  onPress={() => setLocal({ ...local, types: toggleArray(local.types, t) })}
                  activeOpacity={0.6}
                >
                  <Text style={[styles.pillLabel, active && styles.pillLabelActive]}>{t}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Legendary + Price */}
          <View style={styles.legendaryPriceRow}>
            <View>
              <Text style={styles.sectionLabel}>Legendary</Text>
              <TouchableOpacity
                style={[styles.pill, local.isLegendary === true && styles.pillActive]}
                onPress={() => setLocal({ ...local, isLegendary: local.isLegendary === true ? null : true })}
                activeOpacity={0.6}
              >
                <Text style={[styles.pillLabel, local.isLegendary === true && styles.pillLabelActive]}>Legendary</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionLabel}>Price</Text>
              <View style={styles.priceRow}>
                <View style={styles.priceModeRow}>
                  <TouchableOpacity
                    style={[styles.priceModePill, local.priceMode === 'gte' && styles.priceModePillActive]}
                    onPress={() => setLocal({ ...local, priceMode: 'gte' })}
                    activeOpacity={0.6}
                  >
                    <Text style={[styles.priceModeLabel, local.priceMode === 'gte' && styles.priceModeLabelActive]}>≥</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.priceModePill, local.priceMode === 'lte' && styles.priceModePillActive]}
                    onPress={() => setLocal({ ...local, priceMode: 'lte' })}
                    activeOpacity={0.6}
                  >
                    <Text style={[styles.priceModeLabel, local.priceMode === 'lte' && styles.priceModeLabelActive]}>≤</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.priceInputWrap}>
                  <Text style={styles.priceDollar}>$</Text>
                  <TextInput
                    style={styles.priceInput}
                    placeholder="0.00"
                    placeholderTextColor={colors.textMuted}
                    value={local.priceValue}
                    onChangeText={(t) => setLocal({ ...local, priceValue: t.replace(/[^0-9.]/g, '') })}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                  />
                </View>
              </View>
            </View>
          </View>

          <View style={{ height: spacing.xl }} />
        </ScrollView>
      ) : (
        /* ── Set tab ── */
        <View style={{ flex: 1 }}>
          {/* Selected sets summary */}
          {local.sets.length > 0 && (
            <View style={styles.selectedSetsBar}>
              <Text style={styles.selectedSetsText}>
                {local.sets.length === 1
                  ? availableSets.find((s) => s.code === local.sets[0])?.name ?? local.sets[0].toUpperCase()
                  : `${local.sets.length} sets selected`}
              </Text>
              <TouchableOpacity onPress={() => setLocal({ ...local, sets: [] })} activeOpacity={0.6}>
                <Text style={styles.selectedSetsClear}>Clear</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Search */}
          <View style={styles.setSearchField}>
            <Ionicons name="search" size={14} color={colors.textMuted} />
            <TextInput
              style={styles.setSearchInput}
              placeholder="Search sets..."
              placeholderTextColor={colors.textMuted}
              value={setSearch}
              onChangeText={setSetSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {setSearch.length > 0 && (
              <TouchableOpacity onPress={() => setSetSearch('')}>
                <Ionicons name="close-circle" size={14} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Full set list */}
          <ScrollView style={{ maxHeight: getSetListMax(snapFraction, local.sets.length > 0) }} nestedScrollEnabled showsVerticalScrollIndicator>
            {filteredSets.map((s) => {
              const active = local.sets.includes(s.code);
              return (
                <TouchableOpacity
                  key={s.code}
                  style={styles.setRow}
                  onPress={() => setLocal({ ...local, sets: toggleArray(local.sets, s.code) })}
                  activeOpacity={0.5}
                >
                  <View style={[styles.setCheck, active && styles.setCheckActive]}>
                    {active && <Ionicons name="checkmark" size={12} color="#FFF" />}
                  </View>
                  <View style={styles.setInfo}>
                    <Text style={[styles.setName, active && { color: colors.primary }]} numberOfLines={1}>
                      {s.name}
                    </Text>
                    <Text style={styles.setCode}>{s.code.toUpperCase()}</Text>
                  </View>
                  <Text style={styles.setCount}>{s.count}</Text>
                </TouchableOpacity>
              );
            })}
            {filteredSets.length === 0 && setSearch.trim() !== '' && (
              <Text style={styles.setEmpty}>No sets match "{setSearch}"</Text>
            )}
          </ScrollView>
        </View>
      )}

      {/* ── Apply button ── */}
      <TouchableOpacity style={styles.applyButton} onPress={handleApply} activeOpacity={0.6}>
        <Ionicons name="checkmark" size={18} color="#FFF" />
        <Text style={styles.applyText}>
          Apply{activeCount > 0 ? ` (${activeCount})` : ''}
        </Text>
      </TouchableOpacity>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
  },
  resetText: {
    color: colors.error,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  /* Tabs */
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    marginBottom: spacing.sm,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.primary,
  },
  tabLabel: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: colors.primary,
  },
  /* Sections */
  sectionLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  /* Color chips */
  colorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  colorChipActive: {
    borderWidth: 2,
  },
  colorChipLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  /* Rarity dot */
  rarityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  /* Generic pills */
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  pillActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  pillLabel: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.text,
  },
  pillLabelActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  /* Mana value chips */
  manaChip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  manaChipActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  manaChipLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text,
  },
  manaChipLabelActive: {
    color: colors.primary,
  },
  /* Legendary + Price row */
  legendaryPriceRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  /* Price */
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  priceModeRow: {
    flexDirection: 'row',
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  priceModePill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
  },
  priceModePillActive: {
    backgroundColor: colors.primaryLight,
  },
  priceModeLabel: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.textMuted,
  },
  priceModeLabelActive: {
    color: colors.primary,
  },
  priceInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    height: 36,
  },
  priceDollar: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    fontWeight: '600',
    marginRight: 4,
  },
  priceInput: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.text,
    padding: 0,
  },
  /* Set tab */
  selectedSetsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  selectedSetsText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  selectedSetsClear: {
    color: colors.error,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  setSearchField: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    height: 40,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  setSearchInput: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.text,
    padding: 0,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.divider,
  },
  setCheck: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setCheckActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  setInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  setName: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '500',
    flex: 1,
  },
  setCode: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  setCount: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    minWidth: 24,
    textAlign: 'right',
  },
  setEmpty: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  /* Apply button */
  applyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  applyText: {
    color: '#FFF',
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
});
