import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ScrollView,
  Animated,
  Easing,
  type TextInput as RNTextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '../BottomSheet';
import {
  aiSearchFromPrompt,
  type AiSearchResult,
} from '../../lib/search/aiSearch';
import {
  EMPTY_SEARCH_FILTERS,
  countActiveSearchFilters,
  normalizeOracleTexts,
  type OracleTextConstraint,
  type SearchFilterState,
} from '../../lib/search/searchFilters';
import { useAiModel } from '../../lib/hooks/useAiModel';
import { AI_MODEL_PRESETS } from '../../lib/ai/aiModelPresets';
import { colors, spacing, fontSize, borderRadius, shadows } from '../../constants';

// Curated examples — three simple to surface the easy wins, three a
// shade more advanced to show the AI can handle exclusions, oracle-
// text strings, and numeric thresholds. All have been QA'd against
// claude-haiku-4.5 + gemini-3-flash and translate cleanly.
const PROMPT_SUGGESTIONS = [
  // Simple
  'Cards similar to Farseek',
  'Cheap mono-red burn spells',
  'Equipment that grants flying',
  // Mid
  'Mono-green creatures with 7+ power and trample',
  'Blue counterspells with the word \u201cinstead\u201d',
  'Bant commanders with 4+ power that draw cards',
  'Fetchlands, shocklands, and triomes in Temur colors',
];

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Called when the user accepts the AI's translation. The parent
   *  merges `filters` into search state, sets the text query, and
   *  fires a search. */
  onApply: (filters: SearchFilterState, query: string) => void;
  /** Optional prefill — when the sheet opens, the prompt input is
   *  seeded with this text. Used by the AI Search promotional banner
   *  so tapping an example pill walks the user straight into a
   *  populated query they can submit or tweak. */
  initialPrompt?: string;
};

export function AiSearchSheet({ visible, onClose, onApply, initialPrompt }: Props) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AiSearchResult | null>(null);
  const inputRef = useRef<RNTextInput | null>(null);
  const { model } = useAiModel();
  const activePreset = model ? AI_MODEL_PRESETS.find((p) => p.slug === model) : null;
  const modelLabel = model
    ? activePreset?.label ?? model
    : 'Server default';

  // Reset state every time the sheet (re)opens so each session starts
  // clean. We deliberately DO NOT auto-focus the input — the keyboard
  // popping up immediately fights the sheet's snap animation and ends
  // up hiding the suggestions before the user has even seen them. The
  // user taps into the field when they're ready.
  useEffect(() => {
    if (visible) {
      setPrompt(initialPrompt ?? '');
      setResult(null);
      setLoading(false);
    }
  }, [visible, initialPrompt]);

  const handleSubmit = useCallback(async () => {
    const trimmed = prompt.trim();
    if (trimmed.length < 2 || loading) return;
    // Dismiss the keyboard the moment the user fires translate — the
    // sheet feels much smoother when the result card lands without
    // the keyboard fighting for vertical space underneath it.
    inputRef.current?.blur();
    setLoading(true);
    setResult(null);
    const r = await aiSearchFromPrompt(trimmed);
    setLoading(false);
    setResult(r);
  }, [prompt, loading]);

  const handleApply = useCallback(() => {
    if (result?.kind !== 'filters') return;
    // Merge AI-provided fields onto the empty defaults so the user
    // gets a clean filter state with only the keys the model touched.
    const aiFilters = result.filters;
    const merged: SearchFilterState = {
      ...EMPTY_SEARCH_FILTERS,
      ...aiFilters,
      // Defensive normalisations — the AI is text-in / JSON-out, so
      // small drifts (uppercase set codes, legacy oracleTexts shape)
      // are smoothed here instead of polluting downstream code.
      oracleTexts: normalizeOracleTexts(aiFilters.oracleTexts as unknown),
      sets: Array.isArray(aiFilters.sets)
        ? aiFilters.sets.map((s) => String(s).toLowerCase())
        : EMPTY_SEARCH_FILTERS.sets,
      // AI-driven results always group by card concept (one row per
      // oracle_id) — discovery is more useful than seeing every printing.
      uniqueMode: 'cards',
    };
    onApply(merged, result.query ?? '');
    onClose();
  }, [result, onApply, onClose]);

  const handleSuggestion = useCallback((s: string) => {
    setPrompt(s);
    inputRef.current?.focus();
  }, []);

  return (
    // Two snap points: a roomy default that fits header + input +
    // button + suggestions on iPhone, and a tall one Gorhom jumps to
    // when the keyboard opens (keyboardBehavior="extend"). With auto-
    // focus removed, the user starts at 60%, sees suggestions, and
    // only triggers the bigger snap once they actually tap into the
    // field — so the suggestions are always visible at first paint.
    <BottomSheet
      visible={visible}
      onClose={onClose}
      snapPoints={['60%', '92%']}
      keyboardBehavior="extend"
    >
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons name="sparkles" size={20} color={colors.primary} />
          <Text style={styles.title}>AI Search</Text>
          <View style={styles.modelChip}>
            <Ionicons name="hardware-chip-outline" size={11} color={colors.textMuted} />
            <Text style={styles.modelChipText} numberOfLines={1}>
              {modelLabel}
            </Text>
          </View>
        </View>
        <Text style={styles.subtitle}>
          Describe what you&rsquo;re looking for. The AI translates it
          into filters you can review before running the search.
        </Text>
      </View>

      <Pressable style={styles.promptField} onPress={() => inputRef.current?.focus()}>
        <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.textMuted} />
        <TextInput
          ref={inputRef}
          style={styles.promptInput}
          placeholder="e.g. mono-white angels with 4 power that create tokens"
          placeholderTextColor={colors.textMuted}
          value={prompt}
          onChangeText={setPrompt}
          multiline
          autoCapitalize="sentences"
          autoCorrect
          maxLength={500}
        />
      </Pressable>

      <TouchableOpacity
        style={[styles.submitBtn, (prompt.trim().length < 2 || loading) && styles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={prompt.trim().length < 2 || loading}
        activeOpacity={0.7}
      >
        {loading ? (
          <ThinkingIndicator />
        ) : (
          <>
            <Ionicons name="sparkles" size={16} color="#FFF" />
            <Text style={styles.submitLabel}>Translate</Text>
          </>
        )}
      </TouchableOpacity>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {!result && !loading && (
          <View style={styles.suggestionsSection}>
            <Text style={styles.sectionLabel}>Try these</Text>
            <View style={styles.suggestionRow}>
              {PROMPT_SUGGESTIONS.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={styles.suggestion}
                  onPress={() => handleSuggestion(s)}
                  activeOpacity={0.6}
                >
                  <Text style={styles.suggestionLabel}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {result?.kind === 'filters' && (
          <View style={styles.resultSection}>
            <Text style={styles.sectionLabel}>Translated filters</Text>
            <Text style={styles.reasoning}>{result.reasoning}</Text>
            <FilterPreview filters={result.filters} query={result.query} />
            <TouchableOpacity
              style={styles.applyBtn}
              onPress={handleApply}
              activeOpacity={0.7}
            >
              <Ionicons name="checkmark" size={18} color="#FFF" />
              <Text style={styles.applyLabel}>
                Apply &amp; search
                {countActiveSearchFilters({ ...EMPTY_SEARCH_FILTERS, ...result.filters }) > 0
                  ? ` (${countActiveSearchFilters({ ...EMPTY_SEARCH_FILTERS, ...result.filters })})`
                  : ''}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {result?.kind === 'clarify' && (
          <View style={styles.clarifyCard}>
            <Ionicons name="help-circle-outline" size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.clarifyTitle}>Quick clarification</Text>
              <Text style={styles.clarifyText}>{result.question}</Text>
            </View>
          </View>
        )}

        {result?.kind === 'error' && (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={20} color={colors.error} />
            <Text style={styles.errorText}>{result.error}</Text>
          </View>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Inline preview of the AI's filter output — shows what will be
// applied before the user commits.
// ──────────────────────────────────────────────────────────────────────

function FilterPreview({
  filters,
  query,
}: {
  filters: Partial<SearchFilterState>;
  query: string;
}) {
  const chips: string[] = [];
  if (query) chips.push(`text: "${query}"`);
  if (filters.colors?.length)
    chips.push(`colors ${labelFor(filters.colorsMode ?? 'gte')}: ${filters.colors.join('')}`);
  if (filters.colorIdentity?.length)
    chips.push(`identity ${labelFor(filters.colorIdentityMode ?? 'lte')}: ${filters.colorIdentity.join('')}`);
  if (filters.types?.length) chips.push(`type: ${filters.types.join(' / ')}`);
  if (filters.supertypes?.length) chips.push(`supertype: ${filters.supertypes.join(' / ')}`);
  if (filters.subtypes?.length) chips.push(`subtype: ${filters.subtypes.join(' / ')}`);
  if (filters.rarity?.length) chips.push(`rarity: ${filters.rarity.join(' / ')}`);
  if (filters.manaValue?.value) chips.push(`mana value ${cmpLabel(filters.manaValue.comparator)} ${filters.manaValue.value}`);
  if (filters.power?.value) chips.push(`power ${cmpLabel(filters.power.comparator)} ${filters.power.value}`);
  if (filters.toughness?.value) chips.push(`toughness ${cmpLabel(filters.toughness.comparator)} ${filters.toughness.value}`);
  if (filters.loyalty?.value) chips.push(`loyalty ${cmpLabel(filters.loyalty.comparator)} ${filters.loyalty.value}`);
  if (filters.price?.value) chips.push(`price ${cmpLabel(filters.price.comparator)} $${filters.price.value}`);
  if (filters.keywords?.length) chips.push(`keywords: ${filters.keywords.join(', ')}`);
  if (filters.legalities?.length)
    chips.push(`legality: ${filters.legalities.map((l) => `${l.status} in ${l.format}`).join(', ')}`);
  if (filters.oracleTexts?.length) {
    const phrases = normalizeOracleTexts(filters.oracleTexts as unknown);
    for (const p of phrases) {
      const modeLabel = p.mode === 'not' ? 'NOT' : p.mode === 'any' ? 'ANY' : 'ALL';
      chips.push(`text ${modeLabel}: "${p.text}"`);
    }
  }
  if (filters.producedMana?.length) {
    const mode = filters.producedManaMode ?? 'any';
    const modeLabel = mode === 'all' ? 'all' : mode === 'not' ? 'not' : 'any';
    chips.push(`produces (${modeLabel}): ${filters.producedMana.join('')}`);
  }
  if (filters.producedManaCount?.value)
    chips.push(`produces colors ${cmpLabel(filters.producedManaCount.comparator)} ${filters.producedManaCount.value}`);
  if (filters.artists?.length) chips.push(`artist: ${filters.artists.join(', ')}`);
  if (filters.sets?.length) chips.push(`set: ${filters.sets.join(', ').toUpperCase()}`);
  if (filters.games?.length) chips.push(`game: ${filters.games.join(', ')}`);
  if (filters.exactName) chips.push('exact name');
  if (filters.uniqueMode && filters.uniqueMode !== 'art') chips.push(`group: ${filters.uniqueMode}`);
  if (filters.reservedList) chips.push('reserved list');
  if (filters.gameChanger) chips.push('game changer');
  if (filters.universesBeyond) chips.push('universes beyond');
  if (filters.promo) chips.push('promo');
  if (filters.reprint) chips.push('reprint');

  if (chips.length === 0) {
    return (
      <Text style={styles.previewEmpty}>
        The AI didn't add any filters — the search will run on text alone.
      </Text>
    );
  }

  return (
    <View style={styles.chipBox}>
      {chips.map((c, i) => (
        <View key={i} style={styles.previewChip}>
          <Text style={styles.previewChipText}>{c}</Text>
        </View>
      ))}
    </View>
  );
}

function labelFor(mode: 'gte' | 'eq' | 'lte'): string {
  return mode === 'gte' ? '≥' : mode === 'eq' ? '=' : '≤';
}
function cmpLabel(c: 'eq' | 'gte' | 'lte'): string {
  return c === 'gte' ? '≥' : c === 'lte' ? '≤' : '=';
}

// ──────────────────────────────────────────────────────────────────────
// "Thinking" indicator — staggered three-dot pulse + a gently breathing
// sparkles glyph. Imitates the Apple-Intelligence / Linear-AI vibe
// without pulling in Lottie or a SVG animation library.
// ──────────────────────────────────────────────────────────────────────

function ThinkingIndicator() {
  // One driver looped 0→1 on a 1.2s cycle. Each dot reads from a
  // distinct slice of the cycle so they pulse with a 200ms stagger.
  const driver = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(driver, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [driver]);

  // Sparkles slowly inhales/exhales in scale + opacity.
  const sparkleScale = driver.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.12, 1],
  });
  const sparkleOpacity = driver.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.7, 1, 0.7],
  });

  function dotOpacity(offset: number) {
    // Each dot's opacity rides a triangular wave centered on `offset`
    // so dot-1 peaks at t=0.16, dot-2 at t=0.5, dot-3 at t=0.83.
    return driver.interpolate({
      inputRange: [
        Math.max(offset - 0.25, 0),
        offset,
        Math.min(offset + 0.25, 1),
      ],
      outputRange: [0.25, 1, 0.25],
      extrapolate: 'clamp',
    });
  }

  return (
    <View style={styles.thinkingRow}>
      <Animated.View
        style={{
          opacity: sparkleOpacity,
          transform: [{ scale: sparkleScale }],
        }}
      >
        <Ionicons name="sparkles" size={16} color="#FFF" />
      </Animated.View>
      <Text style={styles.thinkingLabel}>Thinking</Text>
      <View style={styles.thinkingDots}>
        {[0.16, 0.5, 0.83].map((t) => (
          <Animated.View
            key={t}
            style={[styles.thinkingDot, { opacity: dotOpacity(t) }]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  modelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 999,
    maxWidth: 180,
  },
  modelChipText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  promptField: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 60,
  },
  promptInput: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
    padding: 0,
    paddingTop: 2,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitLabel: {
    color: '#FFF',
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  suggestionsSection: {
    marginTop: spacing.sm,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  suggestionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  suggestion: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    backgroundColor: colors.primaryLight,
  },
  suggestionLabel: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  resultSection: {
    marginTop: spacing.sm,
  },
  reasoning: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontStyle: 'italic',
    marginBottom: spacing.sm,
  },
  chipBox: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    ...shadows.sm,
  },
  previewChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.surfaceSecondary,
  },
  previewChipText: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  previewEmpty: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  applyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
  },
  applyLabel: {
    color: '#FFF',
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  clarifyCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  clarifyTitle: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  clarifyText: {
    color: colors.text,
    fontSize: fontSize.sm,
    marginTop: 2,
    lineHeight: 18,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.errorLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  errorText: {
    flex: 1,
    color: colors.error,
    fontSize: fontSize.sm,
  },
  /* Thinking indicator — see ThinkingIndicator. */
  thinkingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  thinkingLabel: {
    color: '#FFF',
    fontSize: fontSize.md,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  thinkingDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginLeft: 2,
  },
  thinkingDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#FFF',
  },
});
