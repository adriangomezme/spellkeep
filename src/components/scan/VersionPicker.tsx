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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

const CARD_WIDTH = 150;
const CARD_IMAGE_HEIGHT = Math.round((CARD_WIDTH - spacing.sm * 2) * (88 / 63));

export function VersionPicker({ visible, cardName, currentId, onSelect, onClose }: Props) {
  const insets = useSafeAreaInsets();
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
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Select Version</Text>
            <Text style={styles.subtitle}>{cardName}</Text>
          </View>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={22} color={colors.text} />
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
            autoCapitalize="none"
          />
          {filter.length > 0 && (
            <TouchableOpacity onPress={() => setFilter('')}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Versions list */}
        <View style={styles.listContainer}>
          {isLoading ? (
            <View style={styles.centeredContent}>
              <ActivityIndicator color={colors.primary} size="large" />
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.centeredContent}>
              <Ionicons name="search" size={28} color={colors.textMuted} />
              <Text style={styles.emptyText}>
                {filter ? 'No matching sets' : 'No versions found'}
              </Text>
            </View>
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
                      source={{ uri: getCardImageUri(item, 'normal') }}
                      style={styles.versionImage}
                      contentFit="cover"
                    />
                    <Text style={styles.versionSet} numberOfLines={2}>
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
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  headerText: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    marginTop: 2,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    height: 44,
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  filterInput: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.lg,
  },
  listContainer: {
    flex: 1,
  },
  centeredContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  versionCard: {
    width: CARD_WIDTH,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    ...shadows.sm,
  },
  versionCardSelected: {
    borderColor: colors.primary,
  },
  versionImage: {
    width: CARD_WIDTH - spacing.sm * 2,
    height: CARD_IMAGE_HEIGHT,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceSecondary,
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
    fontSize: fontSize.lg,
  },
});
