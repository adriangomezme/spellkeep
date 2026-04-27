import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Pressable,
  type TextInput as RNTextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MTGGlyph, type ManaGlyph } from '../../src/components/MTGGlyph';
import {
  FilterCard,
  MultiSelectModeSegmented,
  NumericStatRow,
  SearchableMultiSelect,
  SegmentedSelector,
  ToggleRow,
  ToggleSwitch,
  type SearchableOption,
} from '../../src/components/search/filters/atoms';
import { FilterPresetsSheet } from '../../src/components/search/filters/FilterPresetsSheet';
import { useSearchFilters } from '../../src/lib/hooks/useSearchFilters';
import {
  EMPTY_SEARCH_FILTERS,
  countActiveSearchFilters,
  normalizeOracleTexts,
  type MultiSelectMode,
  type OracleTextConstraint,
  type SearchFilterState,
  type SearchUniqueMode,
} from '../../src/lib/search/searchFilters';
import { useScryfallCatalog } from '../../src/lib/hooks/useScryfallCatalog';
import { useLocalSets } from '../../src/lib/hooks/useLocalSets';
import type { ColorMatchMode } from '../../src/components/collection/FilterSheet';
import { colors, spacing, fontSize, borderRadius, shadows } from '../../src/constants';

// ──────────────────────────────────────────────────────────────────────
// Static reference data
// ──────────────────────────────────────────────────────────────────────

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

// Top-level types most users care about. The Scryfall catalog is
// fetched lazily and replaces this fallback once it lands.
const FALLBACK_CARD_TYPES = [
  'Artifact', 'Battle', 'Creature', 'Enchantment',
  'Instant', 'Land', 'Planeswalker', 'Sorcery',
];

// Supertypes are a tiny fixed set; hardcoded for the first paint and
// then replaced (identically) by the Scryfall catalog fetch.
const FALLBACK_SUPERTYPES = ['Basic', 'Elite', 'Legendary', 'Ongoing', 'Snow', 'Token', 'World'];

// Hardcoded short-list keywords used as a fallback while the full
// Scryfall catalog (218 entries) loads on first run. Picked for
// recognizability — not a permanent set.
const FALLBACK_KEYWORDS = [
  'Cycling', 'Deathtouch', 'Defender', 'Double strike', 'Evoke',
  'First strike', 'Flash', 'Flying', 'Haste', 'Hexproof',
  'Indestructible', 'Lifelink', 'Menace', 'Reach', 'Trample',
  'Vigilance', 'Ward', 'Warp',
];

const GAMES: { key: string; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { key: 'paper', label: 'Paper', icon: 'document-outline' },
  { key: 'arena', label: 'Arena', icon: 'phone-portrait-outline' },
  { key: 'mtgo', label: 'MTGO', icon: 'desktop-outline' },
  { key: 'astral', label: 'Astral', icon: 'planet-outline' },
];

const FORMATS = [
  { key: 'standard', label: 'Standard' },
  { key: 'pioneer', label: 'Pioneer' },
  { key: 'modern', label: 'Modern' },
  { key: 'legacy', label: 'Legacy' },
  { key: 'vintage', label: 'Vintage' },
  { key: 'pauper', label: 'Pauper' },
  { key: 'commander', label: 'Commander' },
  { key: 'brawl', label: 'Brawl' },
  { key: 'historic', label: 'Historic' },
  { key: 'alchemy', label: 'Alchemy' },
  { key: 'timeless', label: 'Timeless' },
  { key: 'penny', label: 'Penny' },
  { key: 'oathbreaker', label: 'Oathbreaker' },
  { key: 'explorer', label: 'Explorer' },
] as const;

// ──────────────────────────────────────────────────────────────────────
// Screen
// ──────────────────────────────────────────────────────────────────────

type Tab = 'simple' | 'advanced';

export default function FilterScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { filters, setFilters, resetFilters } = useSearchFilters();
  const [local, setLocal] = useState<SearchFilterState>(filters);
  const [tab, setTab] = useState<Tab>('simple');
  const [presetsOpen, setPresetsOpen] = useState(false);
  // Advanced is the heavier tab (5 catalog hooks: keywords, creature
  // types, planeswalker types, land types, artists). We defer its
  // mount until the user actually visits it — initial open of /filters
  // shouldn't pay for catalogs the user may never see. Once mounted we
  // keep it alive (display:none toggle) so subsequent flips are free.
  const [mountedAdvanced, setMountedAdvanced] = useState(false);

  // Snapshot the filter state at mount; back without Apply discards
  // local edits.
  useEffect(() => {
    setLocal(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stable callback identities so memoized SimpleSection/Advanced
  // sections don't re-render on every keystroke just because the
  // parent re-renders with a new function reference.
  const update = useCallback(
    <K extends keyof SearchFilterState>(key: K, value: SearchFilterState[K]) => {
      setLocal((p) => ({ ...p, [key]: value }));
    },
    []
  );

  const toggleArr = useCallback(
    (arr: string[], v: string): string[] =>
      arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v],
    []
  );

  function handleApply() {
    setFilters(local);
    router.back();
  }

  function handleReset() {
    setLocal(EMPTY_SEARCH_FILTERS);
    resetFilters();
  }

  const activeCount = countActiveSearchFilters(local);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Filters</Text>
        <View style={styles.headerActions}>
          {activeCount > 0 && (
            <TouchableOpacity onPress={handleReset} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.resetLink}>Reset</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => setPresetsOpen(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="bookmark-outline" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Simple / Advanced segmented ── */}
      <View style={styles.segmentRow}>
        <TouchableOpacity
          style={[styles.segment, tab === 'simple' && styles.segmentActive]}
          onPress={() => setTab('simple')}
          activeOpacity={0.6}
        >
          <Text style={[styles.segmentLabel, tab === 'simple' && styles.segmentLabelActive]}>Simple</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segment, tab === 'advanced' && styles.segmentActive]}
          onPress={() => {
            setMountedAdvanced(true);
            setTab('advanced');
          }}
          activeOpacity={0.6}
        >
          <Text style={[styles.segmentLabel, tab === 'advanced' && styles.segmentLabelActive]}>Advanced</Text>
        </TouchableOpacity>
      </View>

      {/* ── Body ──
           Two ScrollViews, one per tab, both kept mounted. Switching
           via `display` (instead of conditional render) preserves each
           tab's scroll position independently AND avoids the rebuild
           cost of every FilterCard on every flip. The cost is a small
           extra mount on the first paint — worth it. */}
      <View style={styles.scroll}>
        <ScrollView
          style={tab === 'simple' ? styles.tabPaneActive : styles.tabPaneHidden}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <SimpleSection local={local} update={update} toggleArr={toggleArr} />
        </ScrollView>
        {mountedAdvanced && (
          <ScrollView
            style={tab === 'advanced' ? styles.tabPaneActive : styles.tabPaneHidden}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <AdvancedSection local={local} update={update} toggleArr={toggleArr} />
          </ScrollView>
        )}
      </View>

      {/* ── Sticky footer ── */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
        <TouchableOpacity style={styles.applyBtn} onPress={handleApply} activeOpacity={0.7}>
          <Ionicons name="checkmark" size={18} color="#FFF" />
          <Text style={styles.applyText}>
            Apply{activeCount > 0 ? ` (${activeCount})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      <FilterPresetsSheet
        visible={presetsOpen}
        currentFilters={local}
        onLoad={(preset) => {
          // Old presets (saved before schema additions like
          // producedManaCount or the per-phrase oracleTexts shape)
          // don't carry every field — spread onto EMPTY so missing
          // keys hydrate to the current defaults, and oracleTexts
          // legacy strings get coerced through the normaliser.
          setLocal({
            ...EMPTY_SEARCH_FILTERS,
            ...preset.filters,
            oracleTexts: normalizeOracleTexts(preset.filters.oracleTexts as unknown),
          });
        }}
        onClose={() => setPresetsOpen(false)}
      />
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Sub-sections
// ──────────────────────────────────────────────────────────────────────

type SectionProps = {
  local: SearchFilterState;
  update: <K extends keyof SearchFilterState>(key: K, value: SearchFilterState[K]) => void;
  toggleArr: (arr: string[], v: string) => string[];
};

const SimpleSection = memo(function SimpleSection({ local, update, toggleArr }: SectionProps) {
  const cardTypes = useScryfallCatalog('cardTypes', FALLBACK_CARD_TYPES);
  const supertypes = useScryfallCatalog('supertypes', FALLBACK_SUPERTYPES);
  const sets = useLocalSets();
  const setOptions: SearchableOption[] = useMemo(
    () =>
      sets.map((s) => ({
        key: s.code,
        label: s.name,
        meta: s.code.toUpperCase(),
      })),
    [sets]
  );

  return (
    <View>
      {/* 1. Group results — was previously the sticky "Print mode" row */}
      <FilterCard title="Group results" icon="copy-outline">
        <Text style={styles.helperText}>
          How printings are grouped in the result list.
          {' '}<Text style={styles.bold}>Cards</Text> shows one row per unique
          card, <Text style={styles.bold}>Unique art</Text> shows one per
          artwork, <Text style={styles.bold}>All prints</Text> shows every
          printing.
        </Text>
        <SegmentedSelector
          options={[
            { key: 'cards', label: 'Cards' },
            { key: 'art', label: 'Unique art' },
            { key: 'prints', label: 'All prints' },
          ]}
          value={local.uniqueMode}
          onChange={(m) => update('uniqueMode', m as SearchUniqueMode)}
        />
      </FilterCard>

      {/* 2. Exact name — title doubles as the toggle label, switch
          sits in the header to avoid the doubled "Exact name" + "Match
          name exactly" hierarchy. Whole card body is tappable. */}
      <FilterCard
        title="Exact name"
        icon="text-outline"
        trailing={
          <ToggleSwitch
            active={local.exactName}
            onPress={() => update('exactName', !local.exactName)}
          />
        }
      >
        <Pressable onPress={() => update('exactName', !local.exactName)}>
          <Text style={styles.toggleDescription}>
            Wraps your text in !"…" so only cards whose name matches
            character-for-character are returned. Off = partial match.
          </Text>
        </Pressable>
      </FilterCard>

      {/* "My cards" used to live here; that mode is centralized in the
          Owned cards screen, not Search. */}

      {/* Colors */}
      <FilterCard
        title="Colors"
        icon="color-palette-outline"
        trailing={
          <ColorModeSegmented
            value={local.colorsMode}
            onChange={(m) => update('colorsMode', m)}
          />
        }
      >
        <ColorBlock
          help="Mana cost only."
          mode={local.colorsMode}
          value={local.colors}
          onToggle={(c) => update('colors', toggleArr(local.colors, c))}
        />
      </FilterCard>

      {/* 5. Color Identity */}
      <FilterCard
        title="Color Identity"
        icon="layers-outline"
        trailing={
          <ColorModeSegmented
            value={local.colorIdentityMode}
            onChange={(m) => update('colorIdentityMode', m)}
          />
        }
      >
        <ColorBlock
          help="Cost + rules text. Used for Commander deck-building."
          mode={local.colorIdentityMode}
          value={local.colorIdentity}
          onToggle={(c) => update('colorIdentity', toggleArr(local.colorIdentity, c))}
        />
      </FilterCard>

      {/* 6. Card Type — Any/All/Not mode */}
      <FilterCard
        title="Card Type"
        icon="cube-outline"
        trailing={
          <MultiSelectModeSegmented
            value={local.typesMode}
            onChange={(m) => update('typesMode', m)}
          />
        }
      >
        <View style={styles.chipRow}>
          {cardTypes.map((t) => {
            const active = local.types.includes(t);
            return (
              <TouchableOpacity
                key={t}
                style={[styles.pill, active && styles.pillActive]}
                onPress={() => update('types', toggleArr(local.types, t))}
                activeOpacity={0.6}
              >
                <Text style={[styles.pillLabel, active && styles.pillLabelActive]}>{t}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </FilterCard>

      {/* 6.5 Supertypes — Basic / Snow / Legendary / World / etc */}
      <FilterCard
        title="Supertypes"
        icon="star-outline"
        trailing={
          <MultiSelectModeSegmented
            value={local.supertypesMode}
            onChange={(m) => update('supertypesMode', m)}
          />
        }
      >
        <Text style={styles.helperText}>
          Modifiers that come before the dash on a card type line —
          e.g. <Text style={styles.bold}>Legendary</Text> Creature, {' '}
          <Text style={styles.bold}>Snow</Text> Land.
        </Text>
        <View style={styles.chipRow}>
          {supertypes.map((s) => {
            const active = local.supertypes.includes(s);
            return (
              <TouchableOpacity
                key={s}
                style={[styles.pill, active && styles.pillActive]}
                onPress={() => update('supertypes', toggleArr(local.supertypes, s))}
                activeOpacity={0.6}
              >
                <Text style={[styles.pillLabel, active && styles.pillLabelActive]}>{s}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </FilterCard>

      {/* 7. Rarity */}
      <FilterCard title="Rarity" icon="diamond-outline">
        <View style={styles.chipRow}>
          {RARITIES.map((r) => {
            const active = local.rarity.includes(r.key);
            return (
              <TouchableOpacity
                key={r.key}
                style={[styles.pill, active && styles.pillActive]}
                onPress={() => update('rarity', toggleArr(local.rarity, r.key))}
                activeOpacity={0.6}
              >
                <View style={[styles.rarityDot, { backgroundColor: r.color }]} />
                <Text style={[styles.pillLabel, active && styles.pillLabelActive]}>{r.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </FilterCard>

      {/* 8. Mana Value */}
      <FilterCard title="Mana Value" icon="flame-outline">
        <NumericStatRow
          stat={local.manaValue}
          onChange={(s) => update('manaValue', s)}
          placeholder="Off"
        />
      </FilterCard>

      {/* 9. Sets */}
      <FilterCard title="Sets" icon="albums-outline">
        <SearchableMultiSelect
          options={setOptions}
          selected={local.sets}
          onChange={(s) => update('sets', s)}
          placeholder="Search sets..."
          maxVisible={6}
        />
      </FilterCard>

      {/* 10. Price */}
      <FilterCard title="Price (USD)" icon="pricetag-outline">
        <NumericStatRow
          stat={local.price}
          onChange={(s) => update('price', s)}
          unit="$"
          placeholder="0.00"
        />
      </FilterCard>

      {/* 11. Game availability */}
      <FilterCard title="Game availability" icon="game-controller-outline">
        <Text style={styles.helperText}>
          Where the card is legal to play. Multiple selections OR'd —
          e.g. Arena + MTGO surfaces cards available on either client.
        </Text>
        <View style={styles.chipRow}>
          {GAMES.map((g) => {
            const active = local.games.includes(g.key);
            return (
              <TouchableOpacity
                key={g.key}
                style={[styles.pill, active && styles.pillActive]}
                onPress={() => update('games', toggleArr(local.games, g.key))}
                activeOpacity={0.6}
              >
                <Ionicons
                  name={g.icon}
                  size={14}
                  color={active ? colors.primary : colors.textMuted}
                />
                <Text style={[styles.pillLabel, active && styles.pillLabelActive]}>
                  {g.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </FilterCard>
    </View>
  );
});

const AdvancedSection = memo(function AdvancedSection({ local, update, toggleArr }: SectionProps) {
  const keywords = useScryfallCatalog('keywordAbilities', FALLBACK_KEYWORDS);
  const creatureTypes = useScryfallCatalog('creatureTypes');
  const planeswalkerTypes = useScryfallCatalog('planeswalkerTypes');
  const landTypes = useScryfallCatalog('landTypes');
  const artists = useScryfallCatalog('artists');

  // Subtype catalogs: union, dedupe, sort.
  const subtypeOptions: SearchableOption[] = useMemo(() => {
    const all = new Set<string>([...creatureTypes, ...planeswalkerTypes, ...landTypes]);
    return Array.from(all)
      .sort((a, b) => a.localeCompare(b))
      .map((t) => ({ key: t, label: t }));
  }, [creatureTypes, planeswalkerTypes, landTypes]);

  // Sort keywords alphabetically (Scryfall returns them sorted but the
  // fallback is in author order; canonicalize for both).
  const keywordOptions: SearchableOption[] = useMemo(
    () => [...keywords].sort((a, b) => a.localeCompare(b)).map((k) => ({ key: k, label: k })),
    [keywords]
  );

  const artistOptions: SearchableOption[] = useMemo(
    () => artists.map((a) => ({ key: a, label: a })),
    [artists]
  );

  return (
    <View>
      <View style={styles.advancedBanner}>
        <Ionicons name="cloud-outline" size={14} color={colors.primary} />
        <Text style={styles.advancedBannerText}>
          Advanced filters require a connection — the offline catalog
          doesn't carry oracle text or keywords.
        </Text>
      </View>

      {/* 1. Oracle Text — per-phrase Any/All/Not (each row has its own
            mode so a single search can MIX inclusive and exclusive
            phrases, e.g. "counter target" + NOT "creature"). */}
      <FilterCard title="Oracle Text" icon="document-text-outline">
        <Text style={styles.helperText}>
          Tap the badge on each row to switch its role — ALL requires
          it, ANY allows it as one of several alternatives, NOT excludes
          it.
        </Text>
        <OracleTextInputs
          values={local.oracleTexts}
          onChange={(arr) => update('oracleTexts', arr)}
        />
      </FilterCard>

      {/* 2. Keywords — Any/All/Not mode */}
      <FilterCard
        title="Keywords"
        icon="bookmarks-outline"
        trailing={
          <MultiSelectModeSegmented
            value={local.keywordsMode}
            onChange={(m) => update('keywordsMode', m)}
          />
        }
      >
        <SearchableMultiSelect
          options={keywordOptions}
          selected={local.keywords}
          onChange={(s) => update('keywords', s)}
          placeholder="Search keywords (e.g. evoke, warp)…"
          maxVisible={6}
        />
      </FilterCard>

      {/* 3. Subtypes — Any/All/Not mode */}
      <FilterCard
        title="Subtypes"
        icon="git-branch-outline"
        trailing={
          <MultiSelectModeSegmented
            value={local.subtypesMode}
            onChange={(m) => update('subtypesMode', m)}
          />
        }
      >
        <SearchableMultiSelect
          options={subtypeOptions}
          selected={local.subtypes}
          onChange={(s) => update('subtypes', s)}
          placeholder="Search subtypes (e.g. elf, equipment)…"
          maxVisible={6}
        />
      </FilterCard>

      {/* 4. Legality — Any/All/Not mode */}
      <FilterCard
        title="Legality"
        icon="shield-checkmark-outline"
        trailing={
          <MultiSelectModeSegmented
            value={local.legalitiesMode}
            onChange={(m) => update('legalitiesMode', m)}
          />
        }
      >
        <View style={styles.chipRow}>
          {FORMATS.map((f) => {
            const active = local.legalities.some((l) => l.format === f.key);
            return (
              <TouchableOpacity
                key={f.key}
                style={[styles.pill, active && styles.pillActive]}
                onPress={() => {
                  const next = active
                    ? local.legalities.filter((l) => l.format !== f.key)
                    : [...local.legalities, { format: f.key, status: 'legal' as const }];
                  update('legalities', next);
                }}
                activeOpacity={0.6}
              >
                <Text style={[styles.pillLabel, active && styles.pillLabelActive]}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </FilterCard>

      {/* 5. Produces Mana — Any/All/Not on selected colors, plus a
            numeric "produces N+ colors" filter for triomes/5C lands. */}
      <FilterCard
        title="Produces Mana"
        icon="water-outline"
        trailing={
          <MultiSelectModeSegmented
            value={local.producedManaMode}
            onChange={(m) => update('producedManaMode', m)}
          />
        }
      >
        <Text style={styles.helperText}>Cards that can produce these colors.</Text>
        <View style={styles.chipRow}>
          {MTG_COLORS.map((c) => {
            const active = local.producedMana.includes(c.key);
            return (
              <TouchableOpacity
                key={c.key}
                style={[
                  styles.colorChip,
                  { backgroundColor: c.bg },
                  active && styles.colorChipActive,
                ]}
                onPress={() => update('producedMana', toggleArr(local.producedMana, c.key))}
                activeOpacity={0.7}
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
        <View style={{ height: spacing.sm }} />
        <Text style={styles.helperText}>How many colors of mana it produces.</Text>
        <NumericStatRow
          stat={local.producedManaCount}
          onChange={(s) => update('producedManaCount', s)}
        />
      </FilterCard>

      {/* 6-8. Power / Toughness / Loyalty */}
      <FilterCard title="Power" icon="flash-outline">
        <NumericStatRow stat={local.power} onChange={(s) => update('power', s)} />
      </FilterCard>

      <FilterCard title="Toughness" icon="shield-outline">
        <NumericStatRow stat={local.toughness} onChange={(s) => update('toughness', s)} />
      </FilterCard>

      <FilterCard title="Loyalty" icon="ribbon-outline">
        <NumericStatRow stat={local.loyalty} onChange={(s) => update('loyalty', s)} />
      </FilterCard>

      {/* 9. Artist */}
      <FilterCard title="Artist" icon="brush-outline">
        <SearchableMultiSelect
          options={artistOptions}
          selected={local.artists}
          onChange={(s) => update('artists', s)}
          placeholder="Search artists..."
          maxVisible={6}
        />
      </FilterCard>

      {/* 10. Miscellaneous */}
      <FilterCard title="Miscellaneous" icon="ellipsis-horizontal-circle-outline">
        <ToggleRow
          label="Reserved List"
          description="Cards Wizards has promised never to reprint."
          active={local.reservedList}
          onPress={() => update('reservedList', !local.reservedList)}
        />
        <ToggleRow
          label="Game Changer"
          description="Commander game changers (recently flagged by Wizards)."
          active={local.gameChanger}
          onPress={() => update('gameChanger', !local.gameChanger)}
        />
        <ToggleRow
          label="Universes Beyond"
          description="Cross-IP printings (LotR, Final Fantasy, etc)."
          active={local.universesBeyond}
          onPress={() => update('universesBeyond', !local.universesBeyond)}
        />
        <ToggleRow
          label="Promo"
          description="Promotional printings."
          active={local.promo}
          onPress={() => update('promo', !local.promo)}
        />
        <ToggleRow
          label="Reprint"
          description="Cards that have been reprinted at least once."
          active={local.reprint}
          onPress={() => update('reprint', !local.reprint)}
        />
      </FilterCard>
    </View>
  );
});

// ──────────────────────────────────────────────────────────────────────
// Inline atoms
// ──────────────────────────────────────────────────────────────────────

// Word-based labels matching the collection FilterSheet so users see
// the same vocabulary across Search and binder/list/owned filters.
const COLOR_MODE_LABELS: Record<ColorMatchMode, string> = {
  gte: 'Has all',
  eq: 'Exact',
  lte: 'Within',
};

const COLOR_MODE_HELP: Record<ColorMatchMode, string> = {
  gte: 'has at least the chosen colors',
  eq: 'matches exactly the chosen colors',
  lte: 'fits within the chosen colors',
};

// Same display order in both Colors and Color Identity for consistency.
// Defaults differ per variant (gte for colors, lte for identity) but
// the ordering of the segmented control stays put.
const COLOR_MODE_ORDER: ColorMatchMode[] = ['gte', 'eq', 'lte'];

function ColorModeSegmented({
  value,
  onChange,
}: {
  value: ColorMatchMode;
  onChange: (m: ColorMatchMode) => void;
}) {
  return (
    <View style={styles.modeSegmented}>
      {COLOR_MODE_ORDER.map((m) => {
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

function ColorBlock({
  help,
  value,
  mode,
  onToggle,
}: {
  help: string;
  value: string[];
  mode: ColorMatchMode;
  onToggle: (c: string) => void;
}) {
  return (
    <View>
      <Text style={styles.colorHelp}>{help} Card {COLOR_MODE_HELP[mode]}.</Text>
      <View style={styles.chipRow}>
        {MTG_COLORS.map((c) => {
          const active = value.includes(c.key);
          return (
            <TouchableOpacity
              key={c.key}
              style={[styles.colorChip, { backgroundColor: c.bg }, active && styles.colorChipActive]}
              onPress={() => onToggle(c.key)}
              activeOpacity={0.7}
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
    </View>
  );
}

// Cycle order shown when the user taps the leading pill.
const ORACLE_MODE_CYCLE: Record<MultiSelectMode, MultiSelectMode> = {
  all: 'any',
  any: 'not',
  not: 'all',
};

const ORACLE_MODE_META: Record<
  MultiSelectMode,
  { label: string; bg: string; fg: string }
> = {
  all: { label: 'ALL', bg: colors.primaryLight, fg: colors.primary },
  any: { label: 'ANY', bg: '#E0E7FF', fg: '#4338CA' },
  not: { label: 'NOT', bg: '#FEE2E2', fg: '#B91C1C' },
};

function OracleTextInputs({
  values,
  onChange,
}: {
  values: OracleTextConstraint[];
  onChange: (next: OracleTextConstraint[]) => void;
}) {
  const editable = useMemo<OracleTextConstraint[]>(
    () => (values.length ? values : [{ text: '', mode: 'all' }]),
    [values]
  );

  function setRow(idx: number, patch: Partial<OracleTextConstraint>) {
    const next = editable.map((row, i) => (i === idx ? { ...row, ...patch } : row));
    const trimmed = next.filter(
      (row, i) => row.text.trim() !== '' || i === next.length - 1
    );
    onChange(trimmed);
  }

  return (
    <View>
      {editable.map((row, idx) => {
        const meta = ORACLE_MODE_META[row.mode];
        return (
          <View key={idx} style={styles.oraclePillRow}>
            {/* Leading mode pill — tap to cycle ALL → ANY → NOT.
                Color-coded so a row of three phrases reads at a glance:
                two greens + one red is "include X and Y, exclude Z". */}
            <TouchableOpacity
              style={[styles.oracleModePill, { backgroundColor: meta.bg }]}
              onPress={() => setRow(idx, { mode: ORACLE_MODE_CYCLE[row.mode] })}
              activeOpacity={0.7}
            >
              <Text style={[styles.oracleModePillLabel, { color: meta.fg }]}>
                {meta.label}
              </Text>
            </TouchableOpacity>
            <OracleTextRow
              value={row.text}
              placeholder={idx === 0 ? 'e.g. draw a card' : 'another phrase…'}
              onChangeText={(t) => setRow(idx, { text: t })}
            />
            {editable.length > 1 && (
              <TouchableOpacity
                onPress={() => onChange(editable.filter((_, i) => i !== idx))}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        );
      })}
      <View style={styles.addRowWrap}>
        <TouchableOpacity
          style={styles.addRow}
          onPress={() => onChange([...editable, { text: '', mode: 'all' }])}
          activeOpacity={0.6}
          hitSlop={{ top: 6, bottom: 6, left: 12, right: 6 }}
        >
          <Ionicons name="add" size={16} color={colors.primary} />
          <Text style={styles.addRowLabel}>Add phrase</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/**
 * Single oracle-text row that wraps the TextInput in a Pressable so a
 * tap anywhere in the surrounding pill focuses the input. Without
 * this, the gray padding above/below the text would swallow taps and
 * not trigger the keyboard.
 */
function OracleTextRow({
  value,
  placeholder,
  onChangeText,
}: {
  value: string;
  placeholder: string;
  onChangeText: (text: string) => void;
}) {
  const ref = useRef<RNTextInput | null>(null);
  return (
    <Pressable style={[styles.textInput, { flex: 1 }]} onPress={() => ref.current?.focus()}>
      <TextInput
        ref={ref}
        style={styles.textInputInner}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </Pressable>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerTitle: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
  },
  resetLink: {
    color: colors.error,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  segmentRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.sm,
    padding: 2,
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: borderRadius.sm - 2,
  },
  segmentActive: {
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  segmentLabel: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  segmentLabelActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
    marginTop: spacing.md,
  },
  tabPaneActive: {
    flex: 1,
  },
  tabPaneHidden: {
    // `display: none` is React Native's recommended way to hide a
    // mounted view without unmounting it — keeps scroll state intact.
    display: 'none',
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  helperText: {
    color: colors.textMuted,
    fontSize: 11,
    marginBottom: spacing.sm,
    lineHeight: 16,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  /* Color */
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
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm - 2,
    alignItems: 'center',
    minWidth: 50,
  },
  modeSegmentActive: {
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  modeSegmentLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  modeSegmentLabelActive: {
    color: colors.primary,
  },
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
  /* Pills */
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
  rarityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  /* Generic text input — split into a Pressable wrapper that owns the
     pill chrome (bg, padding, height) and an inner TextInput that
     just hosts the text. The wrapper makes the entire pill area
     focus-the-input on tap, fixing the dead zone problem. */
  textInput: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
  },
  textInputInner: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.text,
    padding: 0,
  },
  helperBold: {
    fontWeight: '700',
    color: colors.text,
  },
  /* Description text inside a FilterCard whose title doubles as the
     toggle label (Exact name). Slightly bigger / less muted
     than helperText since it's the only body content. */
  toggleDescription: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: 18,
  },
  bold: {
    fontWeight: '700',
  },
  /* Oracle text — single horizontal row per phrase: [mode][input][×] */
  oraclePillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  oracleModePill: {
    minWidth: 44,
    height: 30,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  oracleModePillLabel: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  addRowWrap: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.md,
  },
  addRowLabel: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  /* Advanced banner */
  advancedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  advancedBannerText: {
    flex: 1,
    color: colors.primary,
    fontSize: fontSize.xs,
    lineHeight: 16,
  },
  /* Footer */
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  applyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
  },
  applyText: {
    color: '#FFF',
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
});
