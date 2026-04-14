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
import { colors, spacing, fontSize, borderRadius } from '../constants';

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
          <Ionicons name="remove" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.quantityValue}>{value}</Text>
        <TouchableOpacity
          style={styles.quantityButton}
          onPress={() => onChange(value + 1)}
        >
          <Ionicons name="add" size={20} color={colors.text} />
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

          {/* Condition */}
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

          {/* Quantities by finish */}
          <Text style={styles.sectionLabel}>Quantities</Text>
          <QuantityControl label="Normal" value={qtyNormal} onChange={setQtyNormal} />
          <QuantityControl label="Foil" value={qtyFoil} onChange={setQtyFoil} />
          <QuantityControl label="Etched" value={qtyEtched} onChange={setQtyEtched} />

          {totalQty === 0 && (
            <Text style={styles.warningText}>
              Setting all quantities to 0 will remove this card
            </Text>
          )}

          {/* Actions */}
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={22} color={colors.error} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveButton, !hasChanges && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={isLoading || !hasChanges}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.text} />
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
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxl + 20,
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: colors.borderLight,
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
    fontSize: fontSize.sm,
    fontWeight: '600',
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
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionButtonSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  optionText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  optionTextSelected: {
    color: colors.text,
  },
  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  quantityLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.lg,
    fontWeight: '500',
  },
  quantityActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  quantityButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
    minWidth: 30,
    textAlign: 'center',
  },
  warningText: {
    color: colors.warning,
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginTop: spacing.sm,
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
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: colors.text,
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
