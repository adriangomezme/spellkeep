import { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
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

const CARD_WIDTH = 150;
const CARD_GAP = spacing.sm;
const IMAGE_WIDTH = CARD_WIDTH - spacing.sm * 2;
const IMAGE_HEIGHT = Math.round(IMAGE_WIDTH * (88 / 63));

export function VersionPicker({ visible, cardName, currentId, onSelect, onClose }: Props) {
  const [versions, setVersions] = useState<ScryfallCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!visible || !cardName) return;
    setIsLoading(true);
    searchCards(`!"${cardName}" unique:prints`, 1)
      .then((result) => {
        const cards = result?.data ?? [];
        setVersions(cards);
      })
      .catch(() => setVersions([]))
      .finally(() => setIsLoading(false));
  }, [visible, cardName]);

  // Scroll to selected card when data loads
  useEffect(() => {
    if (isLoading || versions.length === 0) return;
    const idx = versions.findIndex((v) => v.id === currentId);
    if (idx > 0 && listRef.current) {
      setTimeout(() => {
        listRef.current?.scrollToIndex({
          index: idx,
          animated: false,
          viewPosition: 0.5,
        });
      }, 100);
    }
  }, [isLoading, versions, currentId]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <TouchableOpacity style={styles.dismissArea} activeOpacity={1} onPress={onClose} />

        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerInfo}>
              <Text style={styles.title}>Select Version</Text>
              <Text style={styles.subtitle}>{cardName}</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.listContainer}>
            {isLoading ? (
              <View style={styles.centeredContent}>
                <ActivityIndicator color={colors.primary} size="large" />
              </View>
            ) : versions.length === 0 ? (
              <View style={styles.centeredContent}>
                <Text style={styles.emptyText}>No versions found</Text>
              </View>
            ) : (
              <FlatList
                ref={listRef}
                data={versions}
                keyExtractor={(item) => item.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.listContent}
                getItemLayout={(_, index) => ({
                  length: CARD_WIDTH + CARD_GAP,
                  offset: (CARD_WIDTH + CARD_GAP) * index,
                  index,
                })}
                onScrollToIndexFailed={(info) => {
                  setTimeout(() => {
                    listRef.current?.scrollToIndex({
                      index: info.index,
                      animated: false,
                      viewPosition: 0.5,
                    });
                  }, 200);
                }}
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
                      <Text style={styles.versionSet} numberOfLines={2}>{item.set_name}</Text>
                      <Text style={styles.versionNumber}>#{item.collector_number}</Text>
                      <Text style={styles.versionPrice}>{formatPrice(item.prices?.usd)}</Text>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  dismissArea: {
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    ...shadows.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  headerInfo: { flex: 1 },
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
  listContainer: {
    height: IMAGE_HEIGHT + 90,
  },
  centeredContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    gap: CARD_GAP,
  },
  versionCard: {
    width: CARD_WIDTH,
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
    width: IMAGE_WIDTH,
    height: IMAGE_HEIGHT,
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
  },
});
