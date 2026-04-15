import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  TextInput,
  Keyboard,
  ActivityIndicator,
  StyleSheet,
  useWindowDimensions,
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
const IMAGE_WIDTH = CARD_WIDTH - spacing.sm * 2;
const IMAGE_HEIGHT = Math.round(IMAGE_WIDTH * (88 / 63));
// Total sheet content height: header + filter + card list + padding
const SHEET_CONTENT_HEIGHT = IMAGE_HEIGHT + 180;

export function VersionPicker({ visible, cardName, currentId, onSelect, onClose }: Props) {
  const { height: screenHeight } = useWindowDimensions();
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

  function handleClose() {
    Keyboard.dismiss();
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      {/* Tap to dismiss area */}
      <TouchableOpacity
        style={styles.dismissArea}
        activeOpacity={1}
        onPress={handleClose}
      />

      {/* Sheet — tall enough that keyboard covers the bottom part,
          but the content stays visible above the keyboard */}
      <View style={[styles.sheet, { height: SHEET_CONTENT_HEIGHT + screenHeight * 0.4 }]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerInfo}>
            <Text style={styles.title}>Select Version</Text>
            <Text style={styles.subtitle}>{cardName}</Text>
          </View>
          <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
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
            autoCapitalize="none"
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
          />
          {filter.length > 0 && (
            <TouchableOpacity onPress={() => setFilter('')}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Versions */}
        <View style={styles.listContainer}>
          {isLoading ? (
            <View style={styles.centeredContent}>
              <ActivityIndicator color={colors.primary} size="large" />
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.centeredContent}>
              <Ionicons name="search" size={24} color={colors.textMuted} />
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
              keyboardShouldPersistTaps="handled"
              onScrollBeginDrag={() => Keyboard.dismiss()}
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
  dismissArea: {
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingTop: spacing.md,
    ...shadows.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  headerInfo: {
    flex: 1,
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
    gap: spacing.sm,
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
