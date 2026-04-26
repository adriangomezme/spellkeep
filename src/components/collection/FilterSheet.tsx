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
import { MTGGlyph, type ManaGlyph } from '../MTGGlyph';
import { colors, spacing, fontSize, borderRadius } from '../../constants';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const CHROME_HEIGHT = 220; // header + tabs + search + apply + padding
const SELECTED_BAR_HEIGHT = 40;

function getSetListMax(snapFraction: number, hasSelected: boolean): number {
  return SCREEN_HEIGHT * snapFraction - CHROME_HEIGHT - (hasSelected ? SELECTED_BAR_HEIGHT : 0);
}

/* ── MTG color definitions — pastel "gem" backgrounds matching the
 *  canonical Wizards palette (the same ones printed on real cards),
 *  with a near-black glyph rendered on top via the mana font. ── */
const MTG_COLORS: { key: ManaGlyph; label: string; bg: string; fg: string }[] = [
  { key: 'W', label: 'White',     bg: '#FFFBD5', fg: '#1A1718' },
  { key: 'U', label: 'Blue',      bg: '#AAE0FA', fg: '#1A1718' },
  { key: 'B', label: 'Black',     bg: '#CBC2BF', fg: '#1A1718' },
  { key: 'R', label: 'Red',       bg: '#F9AA8F', fg: '#1A1718' },
  { key: 'G', label: 'Green',     bg: '#9BD3AE', fg: '#1A1718' },
  { key: 'C', label: 'Colorless', bg: '#E8E4E0', fg: '#1A1718' },
];

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

/** Color comparison modes — mirror Scryfall's `c:` / `id:` operators.
 *  - `gte` ≥ : card has at least the selected colors (mana-cost default).
 *  - `eq`  = : card's set equals the selection exactly.
 *  - `lte` ≤ : card's set is within the selection (color-identity default
 *               — commander deck-building semantics). */
export type ColorMatchMode = 'gte' | 'eq' | 'lte';

export type FilterState = {
  /** Mana-cost colors selection (rule 903.4: cost + color indicator). */
  colors: string[];
  colorsMode: ColorMatchMode;
  /** Color identity selection (cost + rules-text symbols + indicator
   *  + characteristic-defining abilities). */
  colorIdentity: string[];
  colorIdentityMode: ColorMatchMode;
  rarity: string[];
  types: string[];
  manaValue: string[];
  isLegendary: boolean | null;
  priceMode: PriceMode;
  priceValue: string;
  sets: string[];
  languages: string[];
  tags: string[];
};

export const EMPTY_FILTERS: FilterState = {
  colors: [],
  colorsMode: 'gte',
  colorIdentity: [],
  colorIdentityMode: 'lte',
  rarity: [],
  types: [],
  manaValue: [],
  isLegendary: null,
  priceMode: 'gte',
  priceValue: '',
  sets: [],
  languages: [],
  tags: [],
};

export function countActiveFilters(f: FilterState): number {
  let count = 0;
  if (f.colors.length) count++;
  if (f.colorIdentity.length) count++;
  if (f.rarity.length) count++;
  if (f.types.length) count++;
  if (f.manaValue.length) count++;
  if (f.isLegendary !== null) count++;
  if (f.priceValue.trim()) count++;
  if (f.sets.length) count++;
  if (f.languages.length) count++;
  if (f.tags.length) count++;
  return count;
}

export type SetInfo = {
  code: string;
  name: string;
  count: number;
};

export type LanguageInfo = {
  code: string;
  label: string;
  count: number;
};

export type TagFilterInfo = {
  id: string;
  name: string;
  color: string | null;
  count: number;
};

type Tab = 'general' | 'set' | 'language' | 'tag';

const COLOR_MODE_LABELS: Record<ColorMatchMode, string> = {
  gte: 'Has all',
  eq: 'Exact',
  lte: 'Within',
};

const COLOR_MODE_HELP: Record<ColorMatchMode, string> = {
  gte: 'Card has at least the chosen colors.',
  eq: 'Card matches exactly the chosen colors.',
  lte: 'Card fits within the chosen colors.',
};

// Order chosen so each filter's most natural default sits first.
// Colors (mana cost) defaults to "Has all" (>= — Scryfall's `c:`).
// Color Identity defaults to "Within" (<= — Scryfall's `id:`).
const COLOR_MODE_ORDER: Record<'colors' | 'identity', ColorMatchMode[]> = {
  colors: ['gte', 'eq', 'lte'],
  identity: ['lte', 'eq', 'gte'],
};

function ColorModeSegmented({
  variant,
  value,
  onChange,
}: {
  variant: 'colors' | 'identity';
  value: ColorMatchMode;
  onChange: (next: ColorMatchMode) => void;
}) {
  const order = COLOR_MODE_ORDER[variant];
  return (
    <View style={styles.modeSegmented}>
      {order.map((m) => {
        const active = value === m;
        return (
          <TouchableOpacity
            key={m}
            style={[styles.modeSegment, active && styles.modeSegmentActive]}
            onPress={() => onChange(m)}
            activeOpacity={0.6}
          >
            <Text style={[styles.modeSegmentLabel, active && styles.modeSegmentLabelActive]}>
              {COLOR_MODE_LABELS[m]}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

type Props = {
  visible: boolean;
  filters: FilterState;
  availableSets: SetInfo[];
  availableLanguages: LanguageInfo[];
  /** Tags applied to at least one of the entries this picker is
   *  filtering. Empty list hides the Tags tab entirely. */
  availableTags: TagFilterInfo[];
  onApply: (filters: FilterState) => void;
  onReset: () => void;
  onClose: () => void;
};

export function FilterSheet({ visible, filters, availableSets, availableLanguages, availableTags, onApply, onReset, onClose }: Props) {
  const [local, setLocal] = useState<FilterState>(filters);
  const [tab, setTab] = useState<Tab>('general');
  const [setSearch, setSetSearch] = useState('');
  const [languageSearch, setLanguageSearch] = useState('');
  const [tagSearch, setTagSearch] = useState('');
  const [snapFraction, setSnapFraction] = useState(0.80);

  const SNAP_FRACTIONS = [0.80, 0.95];

  useEffect(() => {
    if (visible) {
      setLocal(filters);
      setTab('general');
      setSetSearch('');
      setLanguageSearch('');
      setTagSearch('');
      setSnapFraction(0.80);
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

  const filteredLanguages = languageSearch.trim()
    ? availableLanguages.filter(
        (l) =>
          l.label.toLowerCase().includes(languageSearch.trim().toLowerCase()) ||
          l.code.toLowerCase().includes(languageSearch.trim().toLowerCase()),
      )
    : availableLanguages;

  const filteredTags = tagSearch.trim()
    ? availableTags.filter((t) =>
        t.name.toLowerCase().includes(tagSearch.trim().toLowerCase()),
      )
    : availableTags;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      snapPoints={['80%', '95%']}
      onSnapChange={(index) => {
        if (index >= 0) {
          LayoutAnimation.configureNext(LayoutAnimation.create(250, 'easeInEaseOut', 'opacity'));
          setSnapFraction(SNAP_FRACTIONS[index] ?? 0.80);
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
        {availableLanguages.length > 1 && (
          <TouchableOpacity
            style={[styles.tab, tab === 'language' && styles.tabActive]}
            onPress={() => setTab('language')}
            activeOpacity={0.6}
          >
            <Text style={[styles.tabLabel, tab === 'language' && styles.tabLabelActive]}>
              Language{local.languages.length > 0 ? ` (${local.languages.length})` : ''}
            </Text>
          </TouchableOpacity>
        )}
        {availableTags.length > 0 && (
          <TouchableOpacity
            style={[styles.tab, tab === 'tag' && styles.tabActive]}
            onPress={() => setTab('tag')}
            activeOpacity={0.6}
          >
            <Text style={[styles.tabLabel, tab === 'tag' && styles.tabLabelActive]}>
              Tags{local.tags.length > 0 ? ` (${local.tags.length})` : ''}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Tab content ── */}
      {tab === 'general' ? (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} nestedScrollEnabled>
          {/* ── Colors (mana cost) ── */}
          <View style={styles.colorHeaderRow}>
            <Text style={styles.sectionLabel}>Colors</Text>
            <ColorModeSegmented
              variant="colors"
              value={local.colorsMode}
              onChange={(m) => setLocal({ ...local, colorsMode: m })}
            />
          </View>
          <Text style={styles.colorHelp}>
            Mana cost only. {COLOR_MODE_HELP[local.colorsMode]}
          </Text>
          <View style={styles.chipRow}>
            {MTG_COLORS.map((c) => {
              const active = local.colors.includes(c.key);
              return (
                <TouchableOpacity
                  key={c.key}
                  style={[
                    styles.colorChip,
                    { backgroundColor: c.bg },
                    active && styles.colorChipActive,
                  ]}
                  onPress={() => setLocal({ ...local, colors: toggleArray(local.colors, c.key) })}
                  activeOpacity={0.7}
                  accessibilityLabel={c.label}
                  accessibilityState={{ selected: active }}
                >
                  <MTGGlyph kind="mana" code={c.key} size={20} color={c.fg} />
                  {active && (
                    <View style={styles.colorChipCheck} pointerEvents="none">
                      <Ionicons name="checkmark" size={10} color="#FFFFFF" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Color Identity (commander) ── */}
          <View style={styles.colorHeaderRow}>
            <Text style={styles.sectionLabel}>Color Identity</Text>
            <ColorModeSegmented
              variant="identity"
              value={local.colorIdentityMode}
              onChange={(m) => setLocal({ ...local, colorIdentityMode: m })}
            />
          </View>
          <Text style={styles.colorHelp}>
            Cost + rules text. {COLOR_MODE_HELP[local.colorIdentityMode]}
          </Text>
          <View style={styles.chipRow}>
            {MTG_COLORS.map((c) => {
              const active = local.colorIdentity.includes(c.key);
              return (
                <TouchableOpacity
                  key={c.key}
                  style={[
                    styles.colorChip,
                    { backgroundColor: c.bg },
                    active && styles.colorChipActive,
                  ]}
                  onPress={() => setLocal({ ...local, colorIdentity: toggleArray(local.colorIdentity, c.key) })}
                  activeOpacity={0.7}
                  accessibilityLabel={c.label}
                  accessibilityState={{ selected: active }}
                >
                  <MTGGlyph kind="mana" code={c.key} size={20} color={c.fg} />
                  {active && (
                    <View style={styles.colorChipCheck} pointerEvents="none">
                      <Ionicons name="checkmark" size={10} color="#FFFFFF" />
                    </View>
                  )}
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
      ) : tab === 'set' ? (
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
      ) : tab === 'language' ? (
        /* ── Language tab ── */
        <View style={{ flex: 1 }}>
          {local.languages.length > 0 && (
            <View style={styles.selectedSetsBar}>
              <Text style={styles.selectedSetsText}>
                {local.languages.length === 1
                  ? availableLanguages.find((l) => l.code === local.languages[0])?.label ?? local.languages[0].toUpperCase()
                  : `${local.languages.length} languages selected`}
              </Text>
              <TouchableOpacity onPress={() => setLocal({ ...local, languages: [] })} activeOpacity={0.6}>
                <Text style={styles.selectedSetsClear}>Clear</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.setSearchField}>
            <Ionicons name="search" size={14} color={colors.textMuted} />
            <TextInput
              style={styles.setSearchInput}
              placeholder="Search languages..."
              placeholderTextColor={colors.textMuted}
              value={languageSearch}
              onChangeText={setLanguageSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {languageSearch.length > 0 && (
              <TouchableOpacity onPress={() => setLanguageSearch('')}>
                <Ionicons name="close-circle" size={14} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView style={{ maxHeight: getSetListMax(snapFraction, local.languages.length > 0) }} nestedScrollEnabled showsVerticalScrollIndicator>
            {filteredLanguages.map((l) => {
              const active = local.languages.includes(l.code);
              return (
                <TouchableOpacity
                  key={l.code}
                  style={styles.setRow}
                  onPress={() => setLocal({ ...local, languages: toggleArray(local.languages, l.code) })}
                  activeOpacity={0.5}
                >
                  <View style={[styles.setCheck, active && styles.setCheckActive]}>
                    {active && <Ionicons name="checkmark" size={12} color="#FFF" />}
                  </View>
                  <View style={styles.setInfo}>
                    <Text style={[styles.setName, active && { color: colors.primary }]} numberOfLines={1}>
                      {l.label}
                    </Text>
                    <Text style={styles.setCode}>{l.code.toUpperCase()}</Text>
                  </View>
                  <Text style={styles.setCount}>{l.count}</Text>
                </TouchableOpacity>
              );
            })}
            {filteredLanguages.length === 0 && languageSearch.trim() !== '' && (
              <Text style={styles.setEmpty}>No languages match "{languageSearch}"</Text>
            )}
          </ScrollView>
        </View>
      ) : (
        /* ── Tags tab ── */
        <View style={{ flex: 1 }}>
          {local.tags.length > 0 && (
            <View style={styles.selectedSetsBar}>
              <Text style={styles.selectedSetsText}>
                {local.tags.length === 1
                  ? availableTags.find((t) => t.id === local.tags[0])?.name ?? '1 tag selected'
                  : `${local.tags.length} tags selected`}
              </Text>
              <TouchableOpacity onPress={() => setLocal({ ...local, tags: [] })} activeOpacity={0.6}>
                <Text style={styles.selectedSetsClear}>Clear</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.setSearchField}>
            <Ionicons name="search" size={14} color={colors.textMuted} />
            <TextInput
              style={styles.setSearchInput}
              placeholder="Search tags..."
              placeholderTextColor={colors.textMuted}
              value={tagSearch}
              onChangeText={setTagSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {tagSearch.length > 0 && (
              <TouchableOpacity onPress={() => setTagSearch('')}>
                <Ionicons name="close-circle" size={14} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView style={{ maxHeight: getSetListMax(snapFraction, local.tags.length > 0) }} nestedScrollEnabled showsVerticalScrollIndicator>
            {filteredTags.map((t) => {
              const active = local.tags.includes(t.id);
              return (
                <TouchableOpacity
                  key={t.id}
                  style={styles.setRow}
                  onPress={() => setLocal({ ...local, tags: toggleArray(local.tags, t.id) })}
                  activeOpacity={0.5}
                >
                  <View style={[styles.setCheck, active && styles.setCheckActive]}>
                    {active && <Ionicons name="checkmark" size={12} color="#FFF" />}
                  </View>
                  <View
                    style={[
                      styles.tagFilterDot,
                      { backgroundColor: t.color ?? colors.textMuted },
                    ]}
                  />
                  <View style={styles.setInfo}>
                    <Text style={[styles.setName, active && { color: colors.primary }]} numberOfLines={1}>
                      {t.name}
                    </Text>
                  </View>
                  <Text style={styles.setCount}>{t.count}</Text>
                </TouchableOpacity>
              );
            })}
            {filteredTags.length === 0 && tagSearch.trim() !== '' && (
              <Text style={styles.setEmpty}>No tags match "{tagSearch}"</Text>
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
  /* Color section header (label + mode segmented control on one row) */
  colorHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  colorHelp: {
    color: colors.textMuted,
    fontSize: 11,
    marginBottom: spacing.sm,
  },
  modeSegmented: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.sm,
    padding: 2,
    gap: 2,
  },
  modeSegment: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: borderRadius.sm - 2,
  },
  modeSegmentActive: {
    backgroundColor: colors.surface,
  },
  modeSegmentLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  modeSegmentLabelActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  /* Color chips — canonical Wizards "gem" look: pastel background
   *  matching the mana color, with the dark mana-font glyph centered
   *  on top. Geometry is constant active/inactive so the row never
   *  reflows; selection state is a navy ring + corner check badge. */
  colorChip: {
    position: 'relative',
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    overflow: 'visible',
  },
  colorChipActive: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  colorChipCheck: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.surface,
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
    paddingVertical: spacing.md - 1,
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
  tagFilterDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  setInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  setName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '500',
    flex: 1,
  },
  setCode: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  setCount: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    minWidth: 32,
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
