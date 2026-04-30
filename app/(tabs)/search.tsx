import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  type TextInput as TextInputType,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { SearchToolbar } from '../../src/components/search/SearchToolbar';
import { SearchEmptyState } from '../../src/components/search/SearchEmptyState';
import { SearchSuggestionsList } from '../../src/components/search/SearchSuggestionsList';
import { RecentSearchesDropdown } from '../../src/components/search/RecentSearchesDropdown';
import { SyntaxChips } from '../../src/components/search/SyntaxChips';
import { AiSearchSheet } from '../../src/components/search/AiSearchSheet';
import { SetsBrowser } from '../../src/components/search/SetsBrowser';
import type { LocalSetInfo } from '../../src/lib/hooks/useLocalSets';
import { SearchResults } from '../../src/components/search/SearchResults';
import { SortSheet, type SortOptionDef } from '../../src/components/collection/SortSheet';
import { nextViewMode } from '../../src/components/collection/CollectionToolbar';
import { useCardSearch } from '../../src/hooks/useCardSearch';
import { useSearchSuggestions } from '../../src/lib/hooks/useSearchSuggestions';
import { useSearchViewPrefs } from '../../src/lib/hooks/useSearchViewPrefs';
import { useCollectionViewPrefs } from '../../src/lib/hooks/useCollectionViewPrefs';
import {
  useRecentSearches,
  addRecentSearch,
  type RecentSearch,
  updateRecentSearchMeta,
} from '../../src/lib/hooks/useRecentSearches';
import { useRecentlyViewedCards, type RecentCard } from '../../src/lib/hooks/useRecentlyViewedCards';
import { useNewlyPrintedCards } from '../../src/lib/hooks/useNewlyPrintedCards';
import { useWeeklyBucket, type DiscoveryBucket } from '../../src/lib/hooks/useWeeklyBucket';
import { AI_SUGGESTION_CHIPS, type AiSuggestionChip } from '../../src/lib/search/aiSuggestionChips';
import { useSearchFilters } from '../../src/lib/hooks/useSearchFilters';
import type { SearchFilterState } from '../../src/lib/search/searchFilters';
import { buildSearchQueryFragment } from '../../src/lib/search/buildSearchQuery';
import {
  EMPTY_SEARCH_FILTERS,
  countActiveSearchFilters,
} from '../../src/lib/search/searchFilters';
import {
  parseScryfallSyntax,
  removeClauseFromQuery,
  type ParsedClause,
} from '../../src/lib/search/queryParser';
import { consumePendingSearch } from '../../src/lib/search/pendingSyntaxQuery';
import { getCardImageUri, type ScryfallCard } from '../../src/lib/scryfall';
import { colors, spacing, fontSize, borderRadius, shadows } from '../../src/constants';

// Search uses a different sort palette than Owned/binder/list:
//  - "Last Added" doesn't exist in the universe of all cards, so we
//    relabel `added` → "Release Date".
//  - EDHREC rank only applies when browsing the catalog, not when
//    sorting your own pile.
// Persistence is also separate (useSearchViewPrefs), so the user can
// keep e.g. "EDHREC rank" here and "Last Added" in their binders.
const SEARCH_SORT_OPTIONS: SortOptionDef[] = [
  { key: 'added', label: 'Release Date', icon: 'calendar-outline' },
  { key: 'edhrec_rank', label: 'EDHREC Rank', icon: 'trending-up-outline' },
  { key: 'name', label: 'Name', icon: 'text-outline' },
  { key: 'mana_value', label: 'Mana Value', icon: 'flame-outline' },
  { key: 'price', label: 'Price', icon: 'pricetag-outline' },
  { key: 'color_identity', label: 'Color Identity', icon: 'color-palette-outline' },
  { key: 'rarity', label: 'Rarity', icon: 'diamond-outline' },
  { key: 'set_code', label: 'Set', icon: 'layers-outline' },
];

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const inputRef = useRef<TextInputType | null>(null);

  // Search-specific layout (viewMode + sort) lives in its own AsyncStorage
  // key. Toolbar size + cards-per-row are shared with binder/list/owned
  // because they are device-wide grid preferences set in /profile/grid.
  const { viewMode, sortBy, sortAsc, setViewMode, setSortBy, setSortAsc } =
    useSearchViewPrefs();
  const { toolbarSize, cardsPerRow } = useCollectionViewPrefs();

  // Filters live in a session-scoped store shared with the
  // /search/filters route. Re-derive the Scryfall syntax fragment
  // whenever the filter state changes.
  const { filters, setFilters } = useSearchFilters();
  const filterFragment = useMemo(() => buildSearchQueryFragment(filters), [filters]);
  const activeFilterCount = useMemo(() => countActiveSearchFilters(filters), [filters]);
  const uniqueMode = filters.uniqueMode;

  // Friendly label keyed against `recent_searches` for the most-recent
  // search the user kicked off. For text searches it equals the typed
  // query; for structured hand-offs (artist tap, AI search) it's the
  // synthesized label like "Artist: Greg Staples". Used to link the
  // result-thumbnail meta back to the correct recent entry — without
  // this, structured searches saved with a label but submitted with an
  // empty query would never get their previews populated.
  const [activeRecentLabel, setActiveRecentLabel] = useState<string | null>(null);

  const {
    query,
    setQuery,
    submittedQuery,
    submit,
    results,
    totalCards,
    isLoading,
    error,
    hasMore,
    loadMore,
    clear,
  } = useCardSearch({
    sortBy,
    sortAsc,
    extraQuery: filterFragment,
    exactName: filters.exactName,
    uniqueMode,
  });

  // "My cards" / owned-only browsing was removed from Search — that
  // workflow lives in the Owned cards screen. Keeping the rename here
  // (`filteredResults`) so any downstream wiring stays stable.
  const filteredResults = results;

  const { suggestions } = useSearchSuggestions(query);

  // Live Scryfall-syntax detection — typing `c:r cmc>=4` surfaces two
  // chips ("Color: Red", "Mana value ≥ 4"). The chips are advisory;
  // the raw query still passes through to Scryfall unchanged.
  const syntaxClauses = useMemo(() => parseScryfallSyntax(query), [query]);
  const handleRemoveClause = useCallback(
    (clause: ParsedClause) => {
      const next = removeClauseFromQuery(query, clause);
      setQuery(next);
      // If the user already submitted, re-submit without the removed
      // clause so results refresh immediately. Otherwise just update
      // the input — they'll trigger a search themselves.
      if (submittedQuery.length > 0) submit(next);
    },
    [query, submittedQuery, setQuery, submit]
  );
  const { items: recentSearches, remove: removeRecentSearch, clear: clearRecentSearches } =
    useRecentSearches();
  const { items: recentlyViewed } = useRecentlyViewedCards();
  const newlyPrinted = useNewlyPrintedCards(12);
  const weekly = useWeeklyBucket(12);

  const [isFocused, setIsFocused] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const [showAi, setShowAi] = useState(false);
  /** Optional prefill for the AI Search sheet — populated when the
   *  user taps an example pill in the AI promotional banner so the
   *  sheet opens already-loaded with that prompt. */
  const [aiInitialPrompt, setAiInitialPrompt] = useState<string | undefined>(undefined);
  // Two top-level views: 'cards' = the universal search experience,
  // 'sets' = a browseable list of every set in the catalog. Tapping a
  // set in 'sets' mode hands a `set:CODE` query back to 'cards'.
  const [searchView, setSearchView] = useState<'cards' | 'sets'>('cards');

  const handleSelectSet = useCallback(
    (set: LocalSetInfo) => {
      // Sets get their own dedicated route (Scryfall-style grouped
      // listing + header stats + 3-dot menu) rather than a syntax
      // hand-off to the search input. Recent searches stay focused on
      // text queries the user typed themselves.
      router.push({ pathname: '/search/set/[code]', params: { code: set.code } });
    },
    [router]
  );

  const goToCard = useCallback(
    (card: ScryfallCard) => {
      // Tapping a result card is an explicit intent to navigate —
      // record the active query as a recent search before leaving.
      const trimmed = query.trim();
      if (trimmed.length >= 2) {
        void addRecentSearch(trimmed);
      }
      router.push({
        pathname: '/card/[id]',
        params: { id: card.id, cardJson: JSON.stringify(card) },
      });
    },
    [router, query]
  );

  const submitFromSuggestion = useCallback(
    (name: string) => {
      // Suggestions act like Google's autocomplete: tap to run that
      // search, NOT to jump to the card. Surfaces the full results
      // page where the user can browse all matching printings.
      setQuery(name);
      submit(name);
      void addRecentSearch(name);
      inputRef.current?.blur();
    },
    [setQuery, submit]
  );

  const goToRecentCard = useCallback(
    (rc: RecentCard) => {
      router.push({ pathname: '/card/[id]', params: { id: rc.id } });
    },
    [router]
  );

  const tapAiChip = useCallback(
    (chip: AiSuggestionChip) => {
      // Today the chip's `query` is a hand-written Scryfall syntax
      // string. When AI search ships in Phase 6 we'll route this
      // through the model — UI stays the same.
      //
      // Mechanic chips (counterspells, removal, ramp, tutors, …)
      // declare `unique: 'cards'` so the result list dedupes by
      // oracle_id and reads as N distinct cards. Land / commander
      // chips leave it alone so the previous selection persists and
      // collectors can still browse every printing.
      if (chip.unique) {
        setFilters({ ...filters, uniqueMode: chip.unique });
      }
      setQuery(chip.query);
      submit(chip.query);
      void addRecentSearch(chip.query);
      inputRef.current?.blur();
    },
    [filters, setFilters, setQuery, submit]
  );

  const tapSeeAllNewlyPrinted = useCallback(() => {
    // Mirror the local "Newly printed" carousel as closely as Scryfall
    // syntax allows: cards released in the last 45 days, basics
    // excluded, one row per oracle (so showcase + regular don't both
    // surface). Reprints stay in — a Sol Ring reprinted today *is*
    // newly printed by the section's lens, and the carousel includes
    // it. The friendly label "Newly printed" is what we save to
    // recents instead of the raw syntax.
    const cutoff = new Date(Date.now() - 45 * 86400000)
      .toISOString()
      .slice(0, 10);
    const text = `date>=${cutoff} -t:basic unique:cards`;
    setQuery(text);
    setSortBy('added');
    setSortAsc(false);
    submit(text);
    void addRecentSearch('Newly printed', { text });
    inputRef.current?.blur();
  }, [setQuery, setSortBy, setSortAsc, submit]);

  const tapWeeklyBucketSeeAll = useCallback(
    (bucket: DiscoveryBucket) => {
      // "See all" on the weekly editorial card stages the bucket's
      // Scryfall query into the input so the user can browse the
      // full result set (instead of the 12-card preview row).
      //
      // We mirror the carousel's sort and unique-mode so the See-all
      // page reads as the carousel "expanded": same dedup, same
      // ordering. Without this, See-all would inherit whatever sort
      // the user last selected — confusing when the carousel is
      // ordered by EDHREC popularity and See-all shows it by name.
      const sortMap: Record<
        DiscoveryBucket['sort_by'],
        { by: 'edhrec_rank' | 'price' | 'added'; asc: boolean }
      > = {
        edhrec_asc: { by: 'edhrec_rank', asc: true },
        edhrec_desc: { by: 'edhrec_rank', asc: false },
        price_asc: { by: 'price', asc: true },
        price_desc: { by: 'price', asc: false },
        released_asc: { by: 'added', asc: true },
        released_desc: { by: 'added', asc: false },
      };
      const m = sortMap[bucket.sort_by];
      setFilters({ ...filters, uniqueMode: 'cards' });
      setSortBy(m.by);
      setSortAsc(m.asc);
      setQuery(bucket.query);
      submit(bucket.query);
      void addRecentSearch(bucket.title, {
        text: bucket.query,
      });
      inputRef.current?.blur();
    },
    [filters, setFilters, setQuery, setSortBy, setSortAsc, submit]
  );

  const handleAiApply = useCallback(
    (aiFilters: SearchFilterState, aiQuery: string) => {
      // Push the AI-translated filter state into the shared store so
      // the toolbar badge + Filter screen reflect what just got
      // applied. Then submit the text portion (if any) so results
      // land instantly.
      setFilters(aiFilters);
      setQuery(aiQuery);
      // AI-driven results default to EDHREC popularity (ASC = most
      // popular first) — the cards a player is most likely curious
      // about for a given prompt. Grouping (uniqueMode='cards') is
      // applied inside the AI sheet's handleApply.
      setSortBy('edhrec_rank');
      setSortAsc(true);
      // The filter fragment alone is enough to trigger the search
      // even when the text is empty — useCardSearch handles that.
      submit(aiQuery);
      inputRef.current?.blur();
    },
    [setFilters, setQuery, setSortBy, setSortAsc, submit]
  );

  const tapRecentSearch = useCallback(
    (rs: RecentSearch) => {
      // Re-tapping a recent restores its FULL context. For structured
      // entries (artist tap, AI search) that means re-applying the
      // saved filters, sort and free-text portion together — without
      // this the user would re-run only the label as plain text and
      // get nothing back. Plain text recents flow through the same
      // path with `text === query`.
      const text = rs.text ?? rs.query;
      if (rs.filters && Object.keys(rs.filters).length > 0) {
        setFilters({ ...EMPTY_SEARCH_FILTERS, ...rs.filters });
        setSortBy('edhrec_rank');
        setSortAsc(true);
      }
      setQuery(text);
      setActiveRecentLabel(rs.query);
      submit(text);
      void addRecentSearch(rs.query, { text: rs.text, filters: rs.filters });
      inputRef.current?.blur();
    },
    [setFilters, setQuery, setSortBy, setSortAsc, submit]
  );

  // Clearing or editing the input invalidates any active structured
  // recent label — we don't want a fresh text submit to re-overwrite
  // the meta of "Artist: …" with thumbnails from the new query.
  useEffect(() => {
    if (activeRecentLabel && query.trim() !== activeRecentLabel) {
      setActiveRecentLabel(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const onSubmit = useCallback(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    submit(trimmed);
    void addRecentSearch(trimmed);
    inputRef.current?.blur();
  }, [query, submit]);

  const trimmedQuery = query.trim();
  // Active filters or a submitted text are enough to drive results.
  // Otherwise the discover-style landing stays put.
  const hasActiveFilters = filterFragment.length > 0;
  const showLanding = submittedQuery.length === 0 && !hasActiveFilters;
  const showSuggestions =
    isFocused && trimmedQuery.length >= 2 && suggestions.length > 0;
  // Reddit / Google pattern: focused + empty input → drop down the
  // recent-searches list. The dropdown ALSO surfaces the syntax-guide
  // entry, so we open it even when there are no recents yet (new users
  // benefit most from discovering the operator catalog).
  const showRecentsDropdown = isFocused && trimmedQuery.length === 0;

  // Consume hand-offs from sibling routes: a syntax string (from the
  // syntax-help page) or a structured filter intent (artist tap from
  // card detail, future "browse this set" pills, etc).
  useFocusEffect(
    useCallback(() => {
      const intent = consumePendingSearch();
      if (!intent) return;

      if (intent.kind === 'syntax') {
        setQuery(intent.query);
        submit(intent.query);
        void addRecentSearch(intent.query);
        inputRef.current?.blur();
        return;
      }

      // kind === 'filtered' — the source already decided what filters
      // it wants. Wipe the current filter state, apply the new one,
      // reset sort to EDHREC ASC (so "popular results first" matches
      // what AI search and similar discovery flows do), and save the
      // friendly label to recents.
      const mergedFilters = { ...EMPTY_SEARCH_FILTERS, ...intent.filters };
      setFilters(mergedFilters);
      setQuery(intent.query);
      setSortBy('edhrec_rank');
      setSortAsc(true);
      submit(intent.query);
      const label = (intent.recentLabel ?? intent.query).trim();
      if (label.length >= 2) {
        void addRecentSearch(label, {
          text: intent.query,
          filters: intent.filters,
        });
      }
      inputRef.current?.blur();
    }, [setFilters, setQuery, setSortBy, setSortAsc, submit])
  );

  // Persist preview thumbnails + total count for the active recent
  // search the moment we know the result set. We also write meta when
  // a query returns ZERO results so the landing UI can decide to hide
  // those entries (Pinterest-style cards with no thumbnails are ugly
  // and serve little purpose).
  useEffect(() => {
    // Use the active recent label if there is one (artist tap, AI
    // search, etc.) so structured searches with an empty `submitted
    // Query` still get their preview thumbnails recorded under the
    // friendly label they were saved under.
    const key = (activeRecentLabel ?? submittedQuery).trim();
    if (key.length < 2 || isLoading) return;
    const previews = results
      .slice(0, 4)
      .map((c) => getCardImageUri(c, 'normal'))
      .filter((u): u is string => !!u);
    void updateRecentSearchMeta(key, previews, totalCards);
  }, [activeRecentLabel, submittedQuery, results, isLoading, totalCards]);

  return (
    <View style={styles.container}>
      {/* White-card header — title + Cards/Sets segment + (cards-mode only)
          search toolbar. Same editorial mood used across the app: full
          bleed surface, bottom-radius, sm shadow. */}
      <View style={styles.headerCard}>
        <View style={[styles.headerInner, { paddingTop: insets.top + spacing.sm }]}>
          {/* Title row + Cards/Sets segment side-by-side. The previous
              loading-indicator + result-count slot was removed; the
              status of an in-flight search needs a new home — see the
              session TODO list for the follow-up decision. */}
          <View style={styles.headerTopRow}>
            <Text style={styles.title}>Search</Text>
            <View style={styles.headerRightCluster}>
              {searchView === 'cards' && isLoading && (
                <ActivityIndicator size="small" color={colors.primary} />
              )}
              <View style={styles.viewSegment}>
              {(['cards', 'sets'] as const).map((view) => {
                const active = searchView === view;
                return (
                  <TouchableOpacity
                    key={view}
                    style={[styles.viewSeg, active && styles.viewSegActive]}
                    onPress={() => setSearchView(view)}
                    activeOpacity={0.6}
                  >
                    <Ionicons
                      name={view === 'cards' ? 'search' : 'albums-outline'}
                      size={14}
                      color={active ? colors.primary : colors.textMuted}
                    />
                    <Text
                      style={[styles.viewSegLabel, active && styles.viewSegLabelActive]}
                    >
                      {view === 'cards' ? 'Cards' : 'Sets'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              </View>
            </View>
          </View>
        </View>

        {searchView === 'cards' && (
          <SearchToolbar
            ref={inputRef}
            query={query}
            onChangeQuery={setQuery}
            onClear={clear}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onSubmit={onSubmit}
            viewMode={viewMode}
            onToggleView={() => setViewMode(nextViewMode(viewMode))}
            onSortPress={() => setShowSort(true)}
            onFilterPress={() => router.push('/search/filters')}
            activeFilters={activeFilterCount}
            onAiPress={() => setShowAi(true)}
            size={toolbarSize}
            fieldSquareBottom={showSuggestions}
          />
        )}
      </View>

      {searchView === 'sets' ? (
        <SetsBrowser onSelectSet={handleSelectSet} />
      ) : (
        <>
      <SyntaxChips clauses={syntaxClauses} onRemove={handleRemoveClause} />

      {error && (
        <View style={styles.errorContainer}>
          <Ionicons name="warning" size={18} color={colors.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Wrap content + suggestions overlay in a relative container so
          the dropdown floats ABOVE the landing / results instead of
          pushing them down. */}
      <View style={styles.body}>
        {showLanding ? (
          <SearchEmptyState
            recentSearches={recentSearches}
            recentlyViewed={recentlyViewed}
            newlyPrintedCards={newlyPrinted.cards}
            weeklyBucket={weekly.bucket}
            weeklyBucketCards={weekly.cards}
            weeklyBucketLoading={weekly.loading}
            aiChips={AI_SUGGESTION_CHIPS}
            onTapSearch={tapRecentSearch}
            onRemoveSearch={removeRecentSearch}
            onClearSearches={clearRecentSearches}
            onTapCard={goToRecentCard}
            onTapDiscoverCard={goToCard}
            onTapAiChip={tapAiChip}
            onTapWeeklyBucketSeeAll={tapWeeklyBucketSeeAll}
            onOpenAi={() => {
              setAiInitialPrompt(undefined);
              setShowAi(true);
            }}
            onTapAiExample={(prompt) => {
              setAiInitialPrompt(prompt);
              setShowAi(true);
            }}
            onSeeAllNewlyPrinted={tapSeeAllNewlyPrinted}
          />
        ) : (
          <SearchResults
            results={filteredResults}
            viewMode={viewMode}
            cardsPerRow={cardsPerRow}
            isLoading={isLoading}
            hasMore={hasMore}
            onLoadMore={loadMore}
            onPress={goToCard}
            isEmpty={filteredResults.length === 0}
            totalCards={totalCards}
          />
        )}

        {showSuggestions && (
          <View style={styles.suggestionsOverlay} pointerEvents="box-none">
            <SearchSuggestionsList
              suggestions={suggestions}
              onSelect={submitFromSuggestion}
            />
          </View>
        )}

        {showRecentsDropdown && !showSuggestions && (
          <View style={styles.suggestionsOverlay} pointerEvents="box-none">
            <RecentSearchesDropdown
              items={recentSearches}
              onSelect={tapRecentSearch}
              onRemove={removeRecentSearch}
              onOpenSyntaxGuide={() => {
                inputRef.current?.blur();
                router.push('/search/syntax-help');
              }}
            />
          </View>
        )}
      </View>
        </>
      )}

      <SortSheet
        visible={showSort}
        currentSort={sortBy}
        ascending={sortAsc}
        onSelect={(s) => { setSortBy(s); setShowSort(false); }}
        onToggleDirection={() => setSortAsc(!sortAsc)}
        onClose={() => setShowSort(false)}
        options={SEARCH_SORT_OPTIONS}
      />

      <AiSearchSheet
        visible={showAi}
        onClose={() => setShowAi(false)}
        onApply={handleAiApply}
        initialPrompt={aiInitialPrompt}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerCard: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: borderRadius.xl,
    borderBottomRightRadius: borderRadius.xl,
    paddingBottom: spacing.xs + 2,
    ...shadows.sm,
  },
  headerInner: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  headerRightCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xxxl,
    fontWeight: '800',
    letterSpacing: -1,
  },
  body: {
    flex: 1,
    position: 'relative',
  },
  suggestionsOverlay: {
    position: 'absolute',
    // The toolbar's bottom padding is `spacing.sm`; pulling the
    // dropdown up by the same amount makes its top edge touch the
    // bottom edge of the search field above.
    top: -spacing.sm,
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 10,
    elevation: 10,
  },
  viewSegment: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.sm + 2,
    padding: 2,
    alignSelf: 'center',
  },
  viewSeg: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: borderRadius.sm,
  },
  viewSegActive: {
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  viewSegLabel: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  viewSegLabelActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.errorLight,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: 12,
    gap: spacing.sm,
  },
  errorText: {
    color: colors.error,
    fontSize: fontSize.sm,
    flex: 1,
  },
});
