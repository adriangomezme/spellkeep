import { useState } from 'react';
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
import { ScryfallCard } from '../lib/scryfall';
import {
  addToCollection,
  Condition,
  Finish,
  CONDITIONS,
  FINISHES,
} from '../lib/collection';
import { colors, spacing, fontSize, borderRadius } from '../constants';

type Props = {
  visible: boolean;
  card: ScryfallCard;
  onClose: () => void;
  onSuccess: () => void;
};

function OptionButton<T extends string>({
  value,
  label,
  selected,
  onPress,
}: {
  value: T;
  label: string;
  selected: boolean;
  onPress: (v: T) => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.optionButton, selected && styles.optionButtonSelected]}
      onPress={() => onPress(value)}
    >
      <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function AddToCollectionModal({ visible, card, onClose, onSuccess }: Props) {
  const [condition, setCondition] = useState<Condition>('NM');
  const [finish, setFinish] = useState<Finish>('normal');
  const [quantity, setQuantity] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  async function handleAdd() {
    setIsLoading(true);
    try {
      await addToCollection(card, condition, finish, quantity);
      onSuccess();
      // Reset for next use
      setCondition('NM');
      setFinish('normal');
      setQuantity(1);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to add card');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Handle bar */}
          <View style={styles.handleBar} />

          {/* Title */}
          <Text style={styles.title}>Add to Collection</Text>
          <Text style={styles.cardName} numberOfLines={1}>{card.name}</Text>
          <Text style={styles.cardSet}>
            {card.set_name} #{card.collector_number}
          </Text>

          {/* Condition */}
          <Text style={styles.sectionLabel}>Condition</Text>
          <View style={styles.optionRow}>
            {CONDITIONS.map((c) => (
              <OptionButton
                key={c.value}
                value={c.value}
                label={c.value}
                selected={condition === c.value}
                onPress={setCondition}
              />
            ))}
          </View>

          {/* Finish */}
          <Text style={styles.sectionLabel}>Finish</Text>
          <View style={styles.optionRow}>
            {FINISHES.map((f) => (
              <OptionButton
                key={f.value}
                value={f.value}
                label={f.label}
                selected={finish === f.value}
                onPress={setFinish}
              />
            ))}
          </View>

          {/* Quantity */}
          <Text style={styles.sectionLabel}>Quantity</Text>
          <View style={styles.quantityRow}>
            <TouchableOpacity
              style={styles.quantityButton}
              onPress={() => setQuantity((q) => Math.max(1, q - 1))}
            >
              <Ionicons name="remove" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.quantityText}>{quantity}</Text>
            <TouchableOpacity
              style={styles.quantityButton}
              onPress={() => setQuantity((q) => q + 1)}
            >
              <Ionicons name="add" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Actions */}
          <TouchableOpacity
            style={styles.addButton}
            onPress={handleAdd}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <>
                <Ionicons name="add-circle" size={22} color={colors.text} />
                <Text style={styles.addButtonText}>
                  Add {quantity}x {condition} {finish !== 'normal' ? finish : ''}
                </Text>
              </>
            )}
          </TouchableOpacity>

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
    marginBottom: spacing.lg,
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
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  quantityButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityText: {
    color: colors.text,
    fontSize: fontSize.xxxl,
    fontWeight: '800',
    minWidth: 50,
    textAlign: 'center',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  addButtonText: {
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
