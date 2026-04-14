import { View, FlatList, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SearchBar } from '../../src/components/SearchBar';
import { CardListItem } from '../../src/components/CardListItem';
import { useCardSearch } from '../../src/hooks/useCardSearch';
import { ScryfallCard } from '../../src/lib/scryfall';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize } from '../../src/constants';

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    query,
    setQuery,
    results,
    totalCards,
    isLoading,
    error,
    hasMore,
    loadMore,
    clear,
  } = useCardSearch();

  function handleCardPress(card: ScryfallCard) {
    router.push({
      pathname: '/card/[id]',
      params: { id: card.id, cardJson: JSON.stringify(card) },
    });
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Search</Text>
        {totalCards > 0 && (
          <Text style={styles.resultCount}>
            {totalCards.toLocaleString()} results
          </Text>
        )}
      </View>

      <View style={styles.searchBarContainer}>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          onClear={clear}
          placeholder="Search cards..."
        />
      </View>

      {error && (
        <View style={styles.errorContainer}>
          <Ionicons name="warning" size={18} color={colors.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <CardListItem card={item} onPress={handleCardPress} />
        )}
        contentContainerStyle={styles.list}
        onEndReached={hasMore ? loadMore : undefined}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          !isLoading && query.length >= 2 ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIcon}>
                <Ionicons name="search" size={32} color={colors.textMuted} />
              </View>
              <Text style={styles.emptyText}>No cards found</Text>
            </View>
          ) : query.length < 2 ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIcon}>
                <Ionicons name="sparkles-outline" size={32} color={colors.textMuted} />
              </View>
              <Text style={styles.emptyText}>Search for any Magic card</Text>
              <Text style={styles.emptyHint}>
                Try a card name, type, or set
              </Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          isLoading ? (
            <ActivityIndicator
              size="small"
              color={colors.primary}
              style={styles.loader}
            />
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xxxl,
    fontWeight: '800',
  },
  resultCount: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  searchBarContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  emptyHint: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    marginTop: spacing.xs,
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
  loader: {
    paddingVertical: spacing.lg,
  },
});
