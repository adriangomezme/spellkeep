import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/lib/supabase';
import { formatPrice } from '../../src/lib/scryfall';
import { EditCollectionCardModal } from '../../src/components/EditCollectionCardModal';
import { colors, shadows, spacing, fontSize, borderRadius } from '../../src/constants';

type CollectionEntry = {
  id: string;
  card_id: string;
  condition: string;
  quantity_normal: number;
  quantity_foil: number;
  quantity_etched: number;
  cards: {
    id: string;
    scryfall_id: string;
    oracle_id: string;
    name: string;
    set_name: string;
    set_code: string;
    collector_number: string;
    rarity: string;
    type_line: string;
    image_uri_small: string;
    image_uri_normal: string;
    price_usd: number | null;
    price_usd_foil: number | null;
    color_identity: string[];
  };
};

function getTotalQuantity(entry: CollectionEntry): number {
  return entry.quantity_normal + entry.quantity_foil + entry.quantity_etched;
}

function getFinishLabel(entry: CollectionEntry): string {
  const parts: string[] = [];
  if (entry.quantity_normal > 0) parts.push(`${entry.quantity_normal}x`);
  if (entry.quantity_foil > 0) parts.push(`${entry.quantity_foil}x Foil`);
  if (entry.quantity_etched > 0) parts.push(`${entry.quantity_etched}x Etched`);
  return parts.join(', ');
}

export default function CollectionScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [entries, setEntries] = useState<CollectionEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [totalValue, setTotalValue] = useState(0);
  const [editEntry, setEditEntry] = useState<{
    id: string;
    condition: string;
    quantity_normal: number;
    quantity_foil: number;
    quantity_etched: number;
    cardName: string;
    setName: string;
    collectorNumber: string;
  } | null>(null);

  const fetchCollection = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: collection } = await supabase
        .from('collections')
        .select('id')
        .eq('user_id', user.id)
        .eq('type', 'collection')
        .single();

      if (!collection) return;

      const { data, error } = await supabase
        .from('collection_cards')
        .select(`
          id,
          card_id,
          condition,
          quantity_normal,
          quantity_foil,
          quantity_etched,
          cards (
            id, scryfall_id, oracle_id, name, set_name, set_code,
            collector_number, rarity, type_line, image_uri_small,
            image_uri_normal, price_usd, price_usd_foil, color_identity
          )
        `)
        .eq('collection_id', collection.id)
        .order('added_at', { ascending: false });

      if (error) {
        console.error('Fetch collection error:', error);
        return;
      }

      const items = (data ?? []) as unknown as CollectionEntry[];
      setEntries(items);

      let value = 0;
      for (const entry of items) {
        const card = entry.cards;
        if (card?.price_usd) value += card.price_usd * entry.quantity_normal;
        if (card?.price_usd_foil) value += card.price_usd_foil * entry.quantity_foil;
        // Etched foil uses foil price if available, otherwise normal
        const etchedPrice = card?.price_usd_foil ?? card?.price_usd;
        if (etchedPrice) value += etchedPrice * entry.quantity_etched;
      }
      setTotalValue(value);
    } catch (err) {
      console.error('Collection fetch error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchCollection();
    }, [fetchCollection])
  );

  function handleRefresh() {
    setIsRefreshing(true);
    fetchCollection();
  }

  function handleCardPress(entry: CollectionEntry) {
    const card = entry.cards;
    router.push({
      pathname: '/card/[id]',
      params: {
        id: card.scryfall_id,
        cardJson: JSON.stringify({
          id: card.scryfall_id,
          oracle_id: card.oracle_id,
          name: card.name,
          set: card.set_code,
          set_name: card.set_name,
          collector_number: card.collector_number,
          rarity: card.rarity,
          type_line: card.type_line,
          image_uris: {
            small: card.image_uri_small,
            normal: card.image_uri_normal,
          },
          prices: {
            usd: card.price_usd?.toString(),
            usd_foil: card.price_usd_foil?.toString(),
          },
          color_identity: card.color_identity,
          legalities: {},
          cmc: 0,
          keywords: [],
          layout: 'normal',
        }),
      },
    });
  }

  function handleEditPress(entry: CollectionEntry) {
    const card = entry.cards;
    setEditEntry({
      id: entry.id,
      condition: entry.condition,
      quantity_normal: entry.quantity_normal,
      quantity_foil: entry.quantity_foil,
      quantity_etched: entry.quantity_etched,
      cardName: card.name,
      setName: card.set_name,
      collectorNumber: card.collector_number,
    });
  }

  const totalCards = entries.reduce((sum, e) => sum + getTotalQuantity(e), 0);
  const uniqueCards = entries.length;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Collection</Text>
      </View>

      {entries.length > 0 && (
        <View style={styles.statsBar}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{totalCards}</Text>
            <Text style={styles.statLabel}>Cards</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{uniqueCards}</Text>
            <Text style={styles.statLabel}>Unique</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.primary }]}>
              ${totalValue.toFixed(2)}
            </Text>
            <Text style={styles.statLabel}>Value</Text>
          </View>
        </View>
      )}

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const card = item.cards;
            if (!card) return null;

            return (
              <TouchableOpacity
                style={styles.cardRow}
                onPress={() => handleCardPress(item)}
                activeOpacity={0.6}
              >
                <Image
                  source={{ uri: card.image_uri_small }}
                  style={styles.cardImage}
                  contentFit="cover"
                  transition={200}
                />
                <View style={styles.cardInfo}>
                  <Text style={styles.cardName} numberOfLines={1}>
                    {card.name}
                  </Text>
                  <Text style={styles.cardSet} numberOfLines={1}>
                    {card.set_name} #{card.collector_number}
                  </Text>
                  <Text style={styles.cardMeta}>
                    {item.condition} · {getFinishLabel(item)}
                  </Text>
                </View>
                <View style={styles.cardRight}>
                  <Text style={styles.cardPrice}>
                    {formatPrice(card.price_usd?.toString())}
                  </Text>
                  <Text style={styles.cardQuantity}>
                    x{getTotalQuantity(item)}
                  </Text>
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={() => handleEditPress(item)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="pencil" size={14} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <View style={styles.emptyIcon}>
                <Ionicons name="library-outline" size={40} color={colors.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>No cards yet</Text>
              <Text style={styles.emptySubtitle}>
                Search for cards and add them to your collection
              </Text>
              <TouchableOpacity
                style={styles.searchButton}
                onPress={() => router.push('/(tabs)/search')}
              >
                <Ionicons name="search" size={18} color="#FFFFFF" />
                <Text style={styles.searchButtonText}>Search Cards</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      <EditCollectionCardModal
        visible={editEntry !== null}
        entry={editEntry}
        onClose={() => setEditEntry(null)}
        onSaved={() => {
          setEditEntry(null);
          fetchCollection();
        }}
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xxxl,
    fontWeight: '800',
  },
  statsBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.border,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.sm + 2,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  cardImage: {
    width: 46,
    height: 64,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceSecondary,
  },
  cardInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  cardName: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  cardSet: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 1,
  },
  cardMeta: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  cardRight: {
    alignItems: 'flex-end',
    marginLeft: spacing.sm,
  },
  cardPrice: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  cardQuantity: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  editButton: {
    marginTop: spacing.xs,
    padding: spacing.xs,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginHorizontal: spacing.xl,
  },
  searchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  searchButtonText: {
    color: '#FFFFFF',
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
});
