import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { BottomSheet } from './BottomSheet';
import { DestinationPickerModal } from './DestinationPickerModal';
import { PrintPickerModal } from './PrintPickerModal';
import { ScryfallCard, getCardImageUri, formatUSD } from '../lib/scryfall';
import {
  Condition,
  Finish,
  CONDITIONS,
} from '../lib/collection';
import { addCardToCollectionLocal } from '../lib/collections.local';
import {
  getLastUsedDestination,
  setLastUsedDestination,
  type CollectionSummary,
} from '../lib/collections';
import { useCollectionsHub } from '../lib/hooks/useCollectionsHub';
import { colors, spacing, fontSize, borderRadius } from '../constants';
import { PrimaryCTA } from './PrimaryCTA';

type Props = {
  visible: boolean;
  card: ScryfallCard;
  prints?: ScryfallCard[];
  onClose: () => void;
  onSuccess: () => void;
  /**
   * When the sheet is opened from inside a specific binder/list detail
   * view, the caller passes that id here so the picker pre-selects it.
   * Takes precedence over the last-used destination so the user doesn't
   * have to re-pick the binder they were already browsing.
   */
  preferredDestinationId?: string | null;
};

const DEST_ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  binder: 'albums',
  list: 'list',
};

const FINISH_LABELS: Record<Finish, string> = {
  normal: 'Normal',
  foil: 'Foil',
  etched: 'Etched',
};

function getAvailableFinishes(card: ScryfallCard): Finish[] {
  const set = new Set<Finish>();
  if (card.finishes && card.finishes.length > 0) {
    for (const f of card.finishes) {
      if (f === 'nonfoil') set.add('normal');
      else if (f === 'foil') set.add('foil');
      else if (f === 'etched') set.add('etched');
    }
  } else {
    if (card.prices?.usd) set.add('normal');
    if (card.prices?.usd_foil) set.add('foil');
    if (card.prices?.usd_etched) set.add('etched');
    if (set.size === 0) set.add('normal');
  }
  return (['normal', 'foil', 'etched'] as Finish[]).filter((f) => set.has(f));
}

function getMarketPrice(card: ScryfallCard, finish: Finish): number | null {
  const raw =
    finish === 'normal'
      ? card.prices?.usd
      : finish === 'foil'
      ? card.prices?.usd_foil
      : card.prices?.usd_etched;
  return raw ? parseFloat(raw) : null;
}

export function AddCardSheet({
  visible,
  card,
  prints,
  onClose,
  onSuccess,
  preferredDestinationId,
}: Props) {
  const [selectedCard, setSelectedCard] = useState<ScryfallCard>(card);
  const availableFinishes = useMemo(
    () => getAvailableFinishes(selectedCard),
    [selectedCard]
  );

  const [finish, setFinish] = useState<Finish>(availableFinishes[0] ?? 'normal');
  const [condition, setCondition] = useState<Condition>('NM');
  const [quantity, setQuantity] = useState(1);
  const [priceText, setPriceText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [destinationId, setDestinationId] = useState<string | null>(null);
  const [showDestPicker, setShowDestPicker] = useState(false);
  const [showPrintPicker, setShowPrintPicker] = useState(false);

  // Destinations come from the local hub — instant on open, reactive
  // to renames / creates, and fully offline. Previously this hit
  // fetchCollectionSummaries (Supabase RPC), which lagged ~1 s online
  // and blocked the sheet entirely on airplane mode.
  const { binders, lists } = useCollectionsHub();
  const destinations = useMemo<CollectionSummary[]>(
    () => [...binders, ...lists],
    [binders, lists]
  );

  const selectedDest = destinations.find((d) => d.id === destinationId);
  const marketPrice = getMarketPrice(selectedCard, finish);

  useEffect(() => {
    if (!visible) return;
    setSelectedCard(card);
    setFinish(getAvailableFinishes(card)[0] ?? 'normal');
    setCondition('NM');
    setQuantity(1);
    setPriceText('');
    setShowDestPicker(false);
    setShowPrintPicker(false);
  }, [visible, card]);

  // Pick an initial destination once the hub list is populated.
  //   1. `preferredDestinationId` — set when opened from a specific
  //      binder/list detail. Wins so the user doesn't have to re-pick
  //      the binder they were already browsing.
  //   2. `lastUsedDestination` saved in AsyncStorage across sessions.
  //   3. First binder in the list.
  //   4. First entry of any type (covers users with only lists).
  // Split into its own effect so it re-runs when destinations hydrate
  // without clobbering a user's manual mid-sheet selection.
  useEffect(() => {
    if (!visible) return;
    if (destinationId && destinations.some((d) => d.id === destinationId)) return;
    if (destinations.length === 0) return;

    if (preferredDestinationId && destinations.some((d) => d.id === preferredDestinationId)) {
      setDestinationId(preferredDestinationId);
      return;
    }

    let cancelled = false;
    (async () => {
      const last = await getLastUsedDestination();
      if (cancelled) return;
      if (last && destinations.some((s) => s.id === last)) {
        setDestinationId(last);
        return;
      }
      const firstBinder = destinations.find((s) => s.type === 'binder');
      const fallback = firstBinder ?? destinations[0];
      if (!cancelled && fallback) setDestinationId(fallback.id);
    })();
    return () => { cancelled = true; };
  }, [visible, destinations, destinationId, preferredDestinationId]);

  useEffect(() => {
    if (!availableFinishes.includes(finish)) {
      setFinish(availableFinishes[0] ?? 'normal');
    }
  }, [availableFinishes, finish]);

  async function handleAdd() {
    if (!destinationId) {
      Alert.alert('No destination', 'Select a binder or list first');
      return;
    }
    setIsLoading(true);
    try {
      const parsed = parseFloat(priceText.replace(/[^0-9.]/g, ''));
      const purchasePrice = isFinite(parsed) && parsed > 0 ? parsed : null;
      await addCardToCollectionLocal({
        card: selectedCard,
        collectionId: destinationId,
        condition,
        finish,
        quantity,
        purchasePrice,
      });
      await setLastUsedDestination(destinationId);
      onSuccess();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to add card');
    } finally {
      setIsLoading(false);
    }
  }

  const hasMultiplePrints = (prints?.length ?? 0) > 1;

  return (
    <>
      <BottomSheet visible={visible} onClose={onClose}>
        <View style={styles.container}>
          {/* Header card summary */}
          <View style={styles.header}>
            <Image
              source={{ uri: getCardImageUri(selectedCard, 'normal') }}
              style={styles.thumb}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={150}
            />
            <View style={styles.headerText}>
              <Text style={styles.title} numberOfLines={1}>{selectedCard.name}</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {selectedCard.set_name} · #{selectedCard.collector_number}
              </Text>
              {marketPrice != null && (
                <Text style={styles.market}>
                  {formatUSD(marketPrice)} <Text style={styles.marketLabel}>market</Text>
                </Text>
              )}
              {hasMultiplePrints && (
                <TouchableOpacity
                  onPress={() => setShowPrintPicker(true)}
                  style={styles.changePrint}
                >
                  <Ionicons name="swap-horizontal" size={13} color={colors.primary} />
                  <Text style={styles.changePrintText}>Change print</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.bodyContent}>
            {/* Destination */}
            <Text style={styles.label}>Destination</Text>
            <TouchableOpacity
              style={styles.selector}
              onPress={() => setShowDestPicker(true)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={selectedDest ? DEST_ICONS[selectedDest.type] ?? 'albums' : 'albums'}
                size={18}
                // Match the hub / DestinationPickerModal: colorless
                // binders render neutral, not accent-blue.
                color={selectedDest?.color ?? colors.textSecondary}
              />
              <Text style={styles.selectorText} numberOfLines={1}>
                {selectedDest?.name ?? 'Select destination…'}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>

            {/* Finish */}
            <Text style={styles.label}>Finish</Text>
            <View style={styles.segmented}>
              {(['normal', 'foil', 'etched'] as Finish[]).map((f) => {
                const enabled = availableFinishes.includes(f);
                const selected = finish === f;
                return (
                  <TouchableOpacity
                    key={f}
                    style={[
                      styles.segment,
                      selected && enabled && styles.segmentSelected,
                      !enabled && styles.segmentDisabled,
                    ]}
                    onPress={() => enabled && setFinish(f)}
                    disabled={!enabled}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        selected && enabled && styles.segmentTextSelected,
                        !enabled && styles.segmentTextDisabled,
                      ]}
                    >
                      {FINISH_LABELS[f]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Condition */}
            <Text style={styles.label}>Condition</Text>
            <View style={styles.segmented}>
              {CONDITIONS.map((c) => (
                <TouchableOpacity
                  key={c.value}
                  style={[styles.segment, condition === c.value && styles.segmentSelected]}
                  onPress={() => setCondition(c.value)}
                >
                  <Text style={[
                    styles.segmentText,
                    condition === c.value && styles.segmentTextSelected,
                  ]}>
                    {c.value}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Quantity */}
            <Text style={styles.label}>Quantity</Text>
            <View style={styles.stepper}>
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={() => setQuantity((q) => Math.max(1, q - 1))}
              >
                <Ionicons name="remove" size={22} color={colors.text} />
              </TouchableOpacity>
              <Text style={styles.stepperText}>{quantity}</Text>
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={() => setQuantity((q) => q + 1)}
              >
                <Ionicons name="add" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Purchase price */}
            <View style={styles.labelRow}>
              <Text style={styles.label}>Purchase price</Text>
              <Text style={styles.labelOptional}>Optional</Text>
            </View>
            <View style={styles.priceField}>
              <Text style={styles.priceCurrency}>$</Text>
              <BottomSheetTextInput
                style={styles.priceInput}
                value={priceText}
                onChangeText={setPriceText}
                placeholder={
                  marketPrice != null
                    ? marketPrice.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    : '0.00'
                }
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                returnKeyType="done"
              />
            </View>
          </View>

          {/* Footer CTA — Stripe-style: quantity lives in the left slot
              as a structural badge, not buried inside the label copy. */}
          <View style={styles.footer}>
            <PrimaryCTA
              style={styles.cta}
              leading={<Text style={styles.ctaCount}>{quantity}×</Text>}
              label={`Add to ${selectedDest?.name ?? '…'}`}
              onPress={handleAdd}
              loading={isLoading}
              disabled={!destinationId}
            />
          </View>
        </View>
      </BottomSheet>

      <DestinationPickerModal
        visible={showDestPicker}
        destinations={destinations}
        selectedId={destinationId}
        onSelect={(id) => {
          setDestinationId(id);
          setShowDestPicker(false);
        }}
        onClose={() => setShowDestPicker(false)}
      />

      <PrintPickerModal
        visible={showPrintPicker}
        prints={prints ?? []}
        selectedId={selectedCard.id}
        onSelect={(p) => {
          setSelectedCard(p);
          setShowPrintPicker(false);
        }}
        onClose={() => setShowPrintPicker(false)}
      />
    </>
  );
}

// ============================================================
// Styles
// ============================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingBottom: spacing.md,
  },
  thumb: {
    width: 96,
    height: 134,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceSecondary,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  market: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
    marginTop: 4,
  },
  marketLabel: {
    color: colors.textMuted,
    fontWeight: '400',
    fontSize: fontSize.xs,
  },
  changePrint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  changePrintText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    marginHorizontal: -spacing.lg,
  },

  // Body
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  label: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  labelOptional: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontStyle: 'italic',
  },

  // Selector
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selectorText: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },

  // Segmented
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.md,
    padding: 3,
    gap: 2,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
  },
  segmentSelected: {
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  segmentDisabled: {
    opacity: 0.35,
  },
  segmentText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  segmentTextSelected: {
    color: colors.text,
  },
  segmentTextDisabled: {
    color: colors.textMuted,
  },

  // Stepper
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    height: 52,
  },
  stepperBtn: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperText: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: '800',
    minWidth: 40,
    textAlign: 'center',
  },

  // Price
  priceField: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    height: 52,
    paddingHorizontal: spacing.md,
  },
  priceCurrency: {
    color: colors.textMuted,
    fontSize: fontSize.lg,
    fontWeight: '600',
    marginRight: 6,
  },
  priceInput: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
    padding: 0,
  },

  // Footer
  footer: {
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  cta: {
    minHeight: 44,
  },
  ctaCount: {
    color: '#FFFFFF',
    fontSize: fontSize.lg,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
