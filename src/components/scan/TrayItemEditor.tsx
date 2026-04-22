import { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { ScryfallCard, getCardImageUri } from '../../lib/scryfall';
import { Condition, Finish, CONDITIONS } from '../../lib/collection';
import { getPriceForFinish, ScanTrayItem } from './useScanState';
import { VersionPicker } from './VersionPicker';
import { colors, shadows, spacing, fontSize, borderRadius } from '../../constants';
import { PrimaryCTA } from '../PrimaryCTA';

const FINISH_LABELS: Record<Finish, string> = {
  normal: 'Normal',
  foil: 'Foil',
  etched: 'Etched',
};

function formatPrice(price?: string): string {
  if (!price) return '—';
  return `$${parseFloat(price).toFixed(2)}`;
}

function getAvailableFinishes(card: ScryfallCard): Finish[] {
  const finishes: Finish[] = [];
  if (card.prices?.usd !== undefined && card.prices.usd !== null) finishes.push('normal');
  if (card.prices?.usd_foil !== undefined && card.prices.usd_foil !== null) finishes.push('foil');
  if (finishes.length === 0) finishes.push('normal');
  return finishes;
}

type Props = {
  visible: boolean;
  item: ScanTrayItem | null;
  onSave: (id: string, updates: Partial<ScanTrayItem>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
};

export function TrayItemEditor({ visible, item, onSave, onDelete, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [card, setCard] = useState<ScryfallCard | null>(null);
  const [condition, setCondition] = useState<Condition>('NM');
  const [finish, setFinish] = useState<Finish>('normal');
  const [availableFinishes, setAvailableFinishes] = useState<Finish[]>(['normal']);
  const [quantity, setQuantity] = useState(1);
  const [showVersionPicker, setShowVersionPicker] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [loadedItemId, setLoadedItemId] = useState<string | null>(null);

  // Load item data only when a different tray item is opened
  if (item && item.id !== loadedItemId) {
    setLoadedItemId(item.id);
    setCard(item.card);
    setCondition(item.condition);
    setFinish(item.finish);
    setAvailableFinishes(getAvailableFinishes(item.card));
    setQuantity(item.quantity);
    setHasChanges(false);
  }

  if (!item || !card) return null;

  const price = getPriceForFinish(card, finish);

  function handleCycleFinish() {
    const idx = availableFinishes.indexOf(finish);
    const next = availableFinishes[(idx + 1) % availableFinishes.length];
    setFinish(next);
    setHasChanges(true);
  }

  function handleVersionChange(newCard: ScryfallCard) {
    const newFinishes = getAvailableFinishes(newCard);
    setCard(newCard);
    setFinish(newFinishes[0]);
    setAvailableFinishes(newFinishes);
    setShowVersionPicker(false);
    setHasChanges(true);
  }

  function handleSave() {
    onSave(item!.id, { card: card!, condition, finish, quantity });
    setLoadedItemId(null);
    onClose();
  }

  function handleDelete() {
    onDelete(item!.id);
    setLoadedItemId(null);
    onClose();
  }

  const setIconUri = `https://svgs.scryfall.io/sets/${card.set}.svg`;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.editor, { paddingBottom: insets.bottom + spacing.md }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Edit Card</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Card preview */}
          <View style={styles.cardSection}>
            <Image
              source={{ uri: getCardImageUri(card, 'small') }}
              style={styles.cardImage}
              contentFit="cover"
            />
            <View style={styles.cardInfo}>
              <Text style={styles.cardName} numberOfLines={2}>{card.name}</Text>
              <TouchableOpacity
                style={styles.setRow}
                onPress={() => setShowVersionPicker(true)}
              >
                <Image
                  source={{ uri: setIconUri }}
                  style={styles.setIcon}
                  contentFit="contain"
                  tintColor={colors.primary}
                />
                <Text style={styles.setText} numberOfLines={1}>
                  {card.set_name} #{card.collector_number}
                </Text>
                <Ionicons name="chevron-forward" size={14} color={colors.primary} />
              </TouchableOpacity>
              <View style={styles.priceRow}>
                {card.prices?.usd && <Text style={styles.priceText}>${parseFloat(card.prices.usd).toFixed(2)}</Text>}
                {card.prices?.usd_foil && <Text style={styles.priceTextFoil}>Foil ${parseFloat(card.prices.usd_foil).toFixed(2)}</Text>}
              </View>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Controls */}
          <View style={styles.controlGroup}>
            <Text style={styles.controlLabel}>Condition</Text>
            <View style={styles.pillRow}>
              {CONDITIONS.map((c) => (
                <TouchableOpacity
                  key={c.value}
                  style={[styles.pill, condition === c.value && styles.pillActive]}
                  onPress={() => { setCondition(c.value); setHasChanges(true); }}
                >
                  <Text style={[styles.pillText, condition === c.value && styles.pillTextActive]}>
                    {c.value}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.controlRow}>
            <View style={styles.controlItem}>
              <Text style={styles.controlLabel}>Finish</Text>
              <TouchableOpacity style={styles.valueChip} onPress={handleCycleFinish}>
                <Text style={styles.valueChipText}>{FINISH_LABELS[finish]}</Text>
                <Ionicons name="swap-horizontal" size={14} color={colors.primary} />
              </TouchableOpacity>
            </View>

            <View style={styles.controlItem}>
              <Text style={styles.controlLabel}>Quantity</Text>
              <View style={styles.qtyRow}>
                <TouchableOpacity
                  style={styles.qtyBtn}
                  onPress={() => { setQuantity(Math.max(1, quantity - 1)); setHasChanges(true); }}
                >
                  <Ionicons name="remove" size={16} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.qtyValue}>{quantity}</Text>
                <TouchableOpacity
                  style={styles.qtyBtn}
                  onPress={() => { setQuantity(quantity + 1); setHasChanges(true); }}
                >
                  <Ionicons name="add" size={16} color={colors.text} />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={18} color={colors.error} />
              <Text style={styles.deleteBtnText}>Remove</Text>
            </TouchableOpacity>
            <PrimaryCTA
              style={styles.saveBtn}
              leading={<Text style={styles.qtyBadge}>{quantity}×</Text>}
              label="Save changes"
              onPress={handleSave}
              disabled={!hasChanges}
            />
          </View>
        </View>
      </View>

      <VersionPicker
        visible={showVersionPicker}
        cardName={card.name}
        currentId={card.id}
        onSelect={handleVersionChange}
        onClose={() => setShowVersionPicker(false)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  editor: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    ...shadows.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  headerTitle: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardSection: {
    flexDirection: 'row',
    marginBottom: spacing.lg,
  },
  cardImage: {
    width: 72,
    height: 100,
    borderRadius: 4,
    backgroundColor: colors.surfaceSecondary,
  },
  cardInfo: {
    flex: 1,
    marginLeft: spacing.md,
    justifyContent: 'center',
  },
  cardName: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  setIcon: {
    width: 14,
    height: 14,
  },
  setText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
    flex: 1,
  },
  priceRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  priceText: {
    color: colors.text,
    fontSize: fontSize.md,
  },
  priceTextFoil: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
  },
  divider: {
    height: 1,
    backgroundColor: colors.divider,
    marginBottom: spacing.lg,
  },
  controlGroup: {
    marginBottom: spacing.lg,
  },
  controlLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  pillRow: {
    flexDirection: 'row',
    gap: spacing.xs + 2,
  },
  pill: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
  },
  pillActive: {
    backgroundColor: colors.primary,
  },
  pillText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  pillTextActive: {
    color: '#FFFFFF',
  },
  controlRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginBottom: spacing.lg,
  },
  controlItem: {
    flex: 1,
  },
  valueChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm + 2,
  },
  valueChipText: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.xs + 2,
  },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyValue: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
    minWidth: 28,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.errorLight,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  deleteBtnText: {
    color: colors.error,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  saveBtn: {
    flex: 1,
  },
  qtyBadge: {
    color: '#FFFFFF',
    fontSize: fontSize.md,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
