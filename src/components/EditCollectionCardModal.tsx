import { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { Condition, CONDITIONS } from '../lib/collection';
import { colors, shadows, spacing, fontSize, borderRadius } from '../constants';

type CollectionEntry = {
  id: string;
  condition: string;
  quantity_normal: number;
  quantity_foil: number;
  quantity_etched: number;
  cardName: string;
  setName: string;
  collectorNumber: string;
};

type Props = {
  visible: boolean;
  entry: CollectionEntry | null;
  onClose: () => void;
  onSaved: () => void;
};

function QuantityControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={styles.quantityControl}>
      <Text style={styles.quantityLabel}>{label}</Text>
      <View style={styles.quantityActions}>
        <TouchableOpacity
          style={styles.quantityButton}
          onPress={() => onChange(Math.max(0, value - 1))}
        >
          <Ionicons name="remove" size={18} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.quantityValue}>{value}</Text>
        <TouchableOpacity
          style={styles.quantityButton}
          onPress={() => onChange(value + 1)}
        >
          <Ionicons name="add" size={18} color={colors.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function EditCollectionCardModal({ visible, entry, onClose, onSaved }: Props) {
  const [condition, setCondition] = useState<Condition>('NM');
  const [qtyNormal, setQtyNormal] = useState(0);
  const [qtyFoil, setQtyFoil] = useState(0);
  const [qtyEtched, setQtyEtched] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (entry) {
      setCondition(entry.condition as Condition);
      setQtyNormal(entry.quantity_normal);
      setQtyFoil(entry.quantity_foil);
      setQtyEtched(entry.quantity_etched);
    }
  }, [entry]);

  if (!entry) return null;

  const totalQty = qtyNormal + qtyFoil + qtyEtched;
  const hasChanges =
    condition !== entry.condition ||
    qtyNormal !== entry.quantity_normal ||
    qtyFoil !== entry.quantity_foil ||
    qtyEtched !== entry.quantity_etched;

  async function handleSave() {
    if (totalQty === 0) {
      handleDelete();
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('collection_cards')
        .update({
          condition,
          quantity_normal: qtyNormal,
          quantity_foil: qtyFoil,
          quantity_etched: qtyEtched,
        })
        .eq('id', entry!.id);

      if (error) throw new Error(error.message);
      onSaved();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setIsLoading(false);
    }
  }

  function handleDelete() {
    Alert.alert(
      'Remove Card',
      `Remove ${entry!.cardName} from your collection?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setIsLoading(true);
            try {
              const { error } = await supabase
                .from('collection_cards')
                .delete()
                .eq('id', entry!.id);

              if (error) throw new Error(error.message);
              onSaved();
            } catch (err: any) {
              Alert.alert('Error', err.message);
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handleBar} />

          <Text style={styles.title}>Edit Card</Text>
          <Text style={styles.cardName} numberOfLines={1}>{entry.cardName}</Text>
          <Text style={styles.cardSet}>
            {entry.setName} #{entry.collectorNumber}
          </Text>

          <Text style={styles.sectionLabel}>Condition</Text>
          <View style={styles.optionRow}>
            {CONDITIONS.map((c) => (
              <TouchableOpacity
                key={c.value}
                style={[
                  styles.optionButton,
                  condition === c.value && styles.optionButtonSelected,
                ]}
                onPress={() => setCondition(c.value)}
              >
                <Text
                  style={[
                    styles.optionText,
                    condition === c.value && styles.optionTextSelected,
                  ]}
                >
                  {c.value}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionLabel}>Quantities</Text>
          <QuantityControl label="Normal" value={qtyNormal} onChange={setQtyNormal} />
          <QuantityControl label="Foil" value={qtyFoil} onChange={setQtyFoil} />
          <QuantityControl label="Etched" value={qtyEtched} onChange={setQtyEtched} />

          {totalQty === 0 && (
            <View style={styles.warningContainer}>
              <Ionicons name="warning" size={16} color={colors.warning} />
              <Text style={styles.warningText}>
                Setting all to 0 will remove this card
              </Text>
            </View>
          )}

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={20} color={colors.error} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveButton, !hasChanges && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={isLoading || !hasChanges}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.saveButtonText}>
                  {totalQty === 0 ? 'Remove' : 'Save Changes'}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
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
    padding: spacing.lg,
    paddingBottom: spacing.xxl + 20,
    ...shadows.lg,
  },
  handleBar: {
    width: 36,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
    textAlign: 'center',
  },
  cardName: {
    color: colors.textSecondary,
    fontSize: fontSize.lg,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  cardSet: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  optionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  optionButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceSecondary,
  },
  optionButtonSelected: {
    backgroundColor: colors.primary,
  },
  optionText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  optionTextSelected: {
    color: '#FFFFFF',
  },
  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.md,
    padding: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  quantityLabel: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '500',
  },
  quantityActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  quantityButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityValue: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
    minWidth: 28,
    textAlign: 'center',
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.warningLight,
    borderRadius: borderRadius.sm,
  },
  warningText: {
    color: colors.warning,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  deleteButton: {
    width: 52,
    height: 52,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.errorLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: 10,
    padding: spacing.md,
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  cancelButton: {
    alignItems: 'center',
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  cancelText: {
    color: colors.textMuted,
    fontSize: fontSize.lg,
  },
});
