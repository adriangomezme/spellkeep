import { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  TextInput,
  LayoutAnimation,
  Platform,
  UIManager,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import {
  ScryfallCard,
  searchCards,
  getCardImageUri,
  formatPrice,
} from '../../lib/scryfall';
import { SetFilterScreen } from './SetFilterScreen';
import { colors, shadows, spacing, fontSize, borderRadius } from '../../constants';

type Props = {
  visible: boolean;
  cardName: string;
  currentId: string;
  onSelect: (card: ScryfallCard) => void;
  onClose: () => void;
};

const CARD_WIDTH_H = 150;
const IMAGE_WIDTH_H = CARD_WIDTH_H - spacing.sm * 2;
const IMAGE_HEIGHT_H = Math.round(IMAGE_WIDTH_H * (88 / 63));
const CARD_GAP = spacing.sm;

function PriceLabels({ card }: { card: ScryfallCard }) {
  const prices: string[] = [];
  if (card.prices?.usd) prices.push(`$${parseFloat(card.prices.usd).toFixed(2)}`);
  if (card.prices?.usd_foil) prices.push(`Foil $${parseFloat(card.prices.usd_foil).toFixed(2)}`);
  if (prices.length === 0) prices.push('—');

  return (
    <View style={priceStyles.row}>
      {prices.map((p, i) => (
        <Text key={i} style={priceStyles.text}>{p}</Text>
      ))}
    </View>
  );
}

const priceStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap', justifyContent: 'center' },
  text: { color: colors.primary, fontSize: fontSize.xs, fontWeight: '600' },
});

export function VersionPicker({ visible, cardName, currentId, onSelect, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [versions, setVersions] = useState<ScryfallCard[]>([]);
  const [filtered, setFiltered] = useState<ScryfallCard[]>([]);
  const [filter, setFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [showSetFilter, setShowSetFilter] = useState(false);
  const [selectedSet, setSelectedSet] = useState<string | null>(null);
  const [setFilteredVersions, setSetFilteredVersions] = useState<ScryfallCard[]>([]);
  const [isLoadingSet, setIsLoadingSet] = useState(false);
  const listRef = useRef<FlatList>(null);
  const pageRef = useRef(1);

  useEffect(() => {
    if (!visible || !cardName) return;
    setIsLoading(true);
    setFilter('');
    setFullscreen(false);
    pageRef.current = 1;
    searchCards(`!"${cardName}" unique:prints`, 1)
      .then((result) => {
        const cards = result?.data ?? [];
        setVersions(cards);
        setFiltered(cards);
        setHasMore(result?.has_more ?? false);
      })
      .catch(() => { setVersions([]); setFiltered([]); setHasMore(false); })
      .finally(() => setIsLoading(false));
  }, [visible, cardName]);

  function loadMore() {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    const nextPage = pageRef.current + 1;
    searchCards(`!"${cardName}" unique:prints`, nextPage)
      .then((result) => {
        const cards = result?.data ?? [];
        pageRef.current = nextPage;
        setVersions((prev) => {
          const updated = [...prev, ...cards];
          // Re-apply filter
          if (filter) {
            const lower = filter.toLowerCase();
            setFiltered(updated.filter((v) =>
              v.set_name.toLowerCase().includes(lower) || v.set.toLowerCase().includes(lower)
            ));
          } else {
            setFiltered(updated);
          }
          return updated;
        });
        setHasMore(result?.has_more ?? false);
      })
      .catch(() => {})
      .finally(() => setIsLoadingMore(false));
  }

  const selectedIndex = versions.findIndex((v) => v.id === currentId);

  // When a set is selected, fetch versions for that set
  useEffect(() => {
    if (!selectedSet) {
      setSetFilteredVersions([]);
      return;
    }
    setIsLoadingSet(true);
    searchCards(`!"${cardName}" set:${selectedSet} unique:prints`, 1)
      .then((result) => {
        setSetFilteredVersions(result?.data ?? []);
      })
      .catch(() => setSetFilteredVersions([]))
      .finally(() => setIsLoadingSet(false));
  }, [selectedSet, cardName]);

  const fullscreenData = selectedSet ? setFilteredVersions : filtered;

  useEffect(() => {
    if (!filter) { setFiltered(versions); return; }
    const lower = filter.toLowerCase();
    setFiltered(versions.filter((v) =>
      v.set_name.toLowerCase().includes(lower) || v.set.toLowerCase().includes(lower)
    ));
  }, [filter, versions]);

  function renderCard(item: ScryfallCard, isHorizontal: boolean) {
    const isSelected = item.id === currentId;
    const cardStyle = isHorizontal ? styles.versionCardH : styles.versionCardV;
    const imageStyle = isHorizontal ? styles.versionImageH : styles.versionImageV;

    return (
      <TouchableOpacity
        style={[cardStyle, isSelected && styles.versionCardSelected]}
        onPress={() => onSelect(item)}
        activeOpacity={0.6}
      >
        <Image
          source={{ uri: getCardImageUri(item, 'normal') }}
          style={imageStyle}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={item.id}
        />
        <Text style={styles.versionSet} numberOfLines={2}>{item.set_name}</Text>
        <Text style={styles.versionNumber}>#{item.collector_number}</Text>
        <PriceLabels card={item} />
      </TouchableOpacity>
    );
  }

  // ── Single Modal — switches layout based on state ──
  return (
    <Modal visible={visible} transparent={!fullscreen} animationType="slide" onRequestClose={onClose}>
      {/* Set filter sub-screen */}
      {showSetFilter ? (
        <SetFilterScreen
          selectedSet={selectedSet}
          onSelect={setSelectedSet}
          onBack={() => setShowSetFilter(false)}
        />
      ) : fullscreen ? (
        /* Fullscreen grid */
        <View style={[styles.fullContainer, { paddingTop: insets.top }]}>
          <View style={styles.fullHeader}>
            <View style={styles.headerInfo}>
              <Text style={styles.title}>Select Version</Text>
              <Text style={styles.subtitle}>{cardName}</Text>
            </View>
            <View style={styles.headerButtons}>
              <TouchableOpacity style={styles.headerBtn} onPress={() => { LayoutAnimation.configureNext({ duration: 400, update: { type: LayoutAnimation.Types.easeInEaseOut } }); setFullscreen(false); }}>
                <Ionicons name="contract-outline" size={18} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerBtn} onPress={onClose}>
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.filterContainer}>
            <View style={styles.filterRow}>
              <Ionicons name="search" size={16} color={colors.textMuted} />
              <TextInput
                style={styles.filterInput}
                value={filter}
                onChangeText={setFilter}
                placeholder="Filter by name..."
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
              />
              {filter.length > 0 && (
                <TouchableOpacity onPress={() => setFilter('')}>
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={[styles.setFilterBtn, selectedSet && styles.setFilterBtnActive]}
              onPress={() => setShowSetFilter(true)}
            >
              <Ionicons name="funnel" size={16} color={selectedSet ? '#FFFFFF' : colors.textMuted} />
            </TouchableOpacity>
          </View>

          {selectedSet && (
            <View style={styles.activeSetChip}>
              <Text style={styles.activeSetText}>Set: {selectedSet.toUpperCase()}</Text>
              <TouchableOpacity onPress={() => setSelectedSet(null)}>
                <Ionicons name="close-circle" size={18} color={colors.primary} />
              </TouchableOpacity>
            </View>
          )}

          {isLoading || isLoadingSet ? (
            <View style={styles.centeredContent}>
              <ActivityIndicator color={colors.primary} size="large" />
            </View>
          ) : (
            <FlatList
              data={fullscreenData}
              keyExtractor={(item) => item.id}
              numColumns={2}
              columnWrapperStyle={styles.gridRow}
              contentContainerStyle={styles.gridContent}
              renderItem={({ item }) => renderCard(item, false)}
              onEndReached={selectedSet ? undefined : loadMore}
              onEndReachedThreshold={0.3}
              ListEmptyComponent={
                <View style={styles.centeredContent}>
                  <Text style={styles.emptyText}>No versions found</Text>
                </View>
              }
              ListFooterComponent={isLoadingMore ? <ActivityIndicator color={colors.primary} style={{ padding: spacing.lg }} /> : null}
            />
          )}
        </View>
      ) : (
        /* Bottom sheet */
        <View style={styles.root}>
          <TouchableOpacity style={styles.dismissArea} activeOpacity={1} onPress={onClose} />

          <View style={styles.sheet}>
            <View style={styles.header}>
              <View style={styles.headerInfo}>
                <Text style={styles.title}>Select Version</Text>
                <Text style={styles.subtitle}>{cardName}</Text>
              </View>
              <View style={styles.headerButtons}>
                <TouchableOpacity style={styles.headerBtn} onPress={() => { LayoutAnimation.configureNext({ duration: 400, update: { type: LayoutAnimation.Types.easeInEaseOut } }); setFullscreen(true); }}>
                  <Ionicons name="expand-outline" size={18} color={colors.text} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.headerBtn} onPress={onClose}>
                  <Ionicons name="close" size={20} color={colors.text} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.listContainerH}>
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
                  contentContainerStyle={styles.listContentH}
                  initialScrollIndex={selectedIndex > 0 ? selectedIndex : undefined}
                  getItemLayout={(_, index) => ({
                    length: CARD_WIDTH_H + CARD_GAP,
                    offset: (CARD_WIDTH_H + CARD_GAP) * index,
                    index,
                  })}
                  onScrollToIndexFailed={(info) => {
                    setTimeout(() => {
                      listRef.current?.scrollToIndex({ index: info.index, animated: false, viewPosition: 0.5 });
                    }, 200);
                  }}
                  renderItem={({ item }) => renderCard(item, true)}
                  onEndReached={loadMore}
                  onEndReachedThreshold={0.5}
                  ListFooterComponent={isLoadingMore ? <ActivityIndicator color={colors.primary} style={{ marginLeft: spacing.md }} /> : null}
                />
              )}
            </View>
          </View>
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  // ── Bottom sheet mode ──
  root: { flex: 1, justifyContent: 'flex-end' },
  dismissArea: { flex: 1 },
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
  headerButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  headerBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: colors.text, fontSize: fontSize.xl, fontWeight: '800' },
  subtitle: { color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 2 },
  listContainerH: { height: IMAGE_HEIGHT_H + 100 },
  listContentH: { paddingHorizontal: spacing.lg, gap: CARD_GAP },
  centeredContent: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  emptyText: { color: colors.textMuted, fontSize: fontSize.md },

  // ── Horizontal cards ──
  versionCardH: {
    width: CARD_WIDTH_H,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  versionImageH: {
    width: IMAGE_WIDTH_H,
    height: IMAGE_HEIGHT_H,
    borderRadius: 4,
    backgroundColor: colors.border,
    marginBottom: spacing.xs,
  },
  versionCardSelected: { borderColor: colors.primary },
  versionSet: { color: colors.text, fontSize: fontSize.xs, fontWeight: '600', textAlign: 'center' },
  versionNumber: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 1 },

  // ── Fullscreen mode ──
  fullContainer: { flex: 1, backgroundColor: colors.background },
  fullHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    marginBottom: spacing.sm,
  },
  filterContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  filterRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    height: 44,
    gap: spacing.sm,
    ...shadows.sm,
  },
  filterInput: { flex: 1, color: colors.text, fontSize: fontSize.md },
  setFilterBtn: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setFilterBtnActive: {
    backgroundColor: colors.primary,
  },
  activeSetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    alignSelf: 'flex-start',
  },
  activeSetText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  gridContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  gridRow: { gap: spacing.sm, marginBottom: spacing.sm },

  // ── Vertical grid cards ──
  versionCardV: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    ...shadows.sm,
  },
  versionImageV: {
    width: '100%',
    aspectRatio: 63 / 88,
    borderRadius: 4,
    backgroundColor: colors.border,
    marginBottom: spacing.xs,
  },
});
