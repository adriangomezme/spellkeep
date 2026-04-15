import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import {
  ScryfallCard,
  searchCards,
  getCardImageUri,
  formatPrice,
} from '../../lib/scryfall';
import { colors, shadows, spacing, fontSize, borderRadius } from '../../constants';

type Props = {
  visible: boolean;
  cardName: string;
  currentId: string;
  onSelect: (card: ScryfallCard) => void;
  onClose: () => void;
};

export function VersionPicker({ visible, cardName, currentId, onSelect, onClose }: Props) {
  const [versions, setVersions] = useState<ScryfallCard[]>([]);
  const [filtered, setFiltered] = useState<ScryfallCard[]>([]);
  const [filter, setFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!visible || !cardName) return;

    setIsLoading(true);
    setFilter('');

    searchCards(`!"${cardName}" unique:prints`, 1)
      .then((result) => {
        const cards = result?.data ?? [];
        setVersions(cards);
        setFiltered(cards);
      })
      .catch(() => {
        setVersions([]);
        setFiltered([]);
      })
      .finally(() => setIsLoading(false));
  }, [visible, cardName]);

  useEffect(() => {
    if (!filter) {
      setFiltered(versions);
      return;
    }
    const lower = filter.toLowerCase();
    setFiltered(
      versions.filter(
        (v) =>
          v.set_name.toLowerCase().includes(lower) ||
          v.set.toLowerCase().includes(lower)
      )
    );
  }, [filter, versions]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header with X */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Select Version</Text>
              <Text style={styles.subtitle}>{cardName}</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Filter */}
          <View style={styles.filterRow}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              style={styles.filterInput}
              value={filter}
              onChangeText={setFilter}
              placeholder="Filter sets..."
              placeholderTextColor={colors.textMuted}
            />
          </View>

          {/* Horizontal scroll of versions */}
          {isLoading ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => {
                const isSelected = item.id === currentId;
                return (
                  <TouchableOpacity
                    style={[styles.versionCard, isSelected && styles.versionCardSelected]}
                    onPress={() => onSelect(item)}
                    activeOpacity={0.6}
                  >
                    <Image
                      source={{ uri: getCardImageUri(item, 'small') }}
                      style={styles.versionImage}
                      contentFit="cover"
                    />
                    <Text style={styles.versionSet} numberOfLines={1}>
                      {item.set_name}
                    </Text>
                    <Text style={styles.versionNumber}>
                      #{item.collector_number}
                    </Text>
                    <Text style={styles.versionPrice}>
                      {formatPrice(item.prices?.usd)}
                    </Text>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.emptyText}>No versions found</Text>
              }
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    ...shadows.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    height: 40,
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  filterInput: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
  },
  loader: {
    paddingVertical: spacing.xl,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  versionCard: {
    width: 130,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  versionCardSelected: {
    borderColor: colors.primary,
  },
  versionImage: {
    width: 110,
    height: 154,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.border,
    marginBottom: spacing.xs,
  },
  versionSet: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: '600',
    textAlign: 'center',
  },
  versionNumber: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 1,
  },
  versionPrice: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '700',
    marginTop: 2,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
});
