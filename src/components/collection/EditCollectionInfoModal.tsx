import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { BottomSheet } from '../BottomSheet';
import { colors, spacing, fontSize, borderRadius } from '../../constants';
import {
  renameCollectionLocal,
  renameFolderLocal,
  updateCollectionColorLocal,
  updateFolderColorLocal,
} from '../../lib/collections.local';
import { ColorPicker } from './ColorPicker';
import { PrimaryCTA } from '../PrimaryCTA';

const NAME_MAX = 40;

type Props = {
  visible: boolean;
  itemId: string;
  itemName: string;
  itemColor: string | null;
  itemType: 'binder' | 'list' | 'folder';
  onClose: () => void;
  onSaved: () => void;
};

export function EditCollectionInfoModal({
  visible,
  itemId,
  itemName,
  itemColor,
  itemType,
  onClose,
  onSaved,
}: Props) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(itemName);
      setColor(itemColor);
    }
  }, [visible, itemName, itemColor]);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;

    setIsSaving(true);
    try {
      if (itemType === 'folder') {
        await renameFolderLocal(itemId, trimmed);
        await updateFolderColorLocal(itemId, color ?? null);
      } else {
        await renameCollectionLocal(itemId, trimmed);
        await updateCollectionColorLocal(itemId, color ?? null);
      }
      onSaved();
    } catch (err) {
      console.error('Edit error:', err);
    } finally {
      setIsSaving(false);
    }
  }

  const typeLabel = itemType === 'folder' ? 'folder' : itemType === 'binder' ? 'binder' : 'list';

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Edit {typeLabel}</Text>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
      </View>

      {/* Name */}
      <View style={styles.fieldLabelRow}>
        <Text style={styles.fieldLabel}>
          Name <Text style={styles.required}>*</Text>
        </Text>
      </View>
      <View style={styles.inputWrap}>
        <BottomSheetTextInput
          style={styles.input}
          placeholder={`${typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)} name`}
          placeholderTextColor={colors.textMuted}
          value={name}
          onChangeText={(v) => setName(v.slice(0, NAME_MAX))}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={handleSave}
          maxLength={NAME_MAX}
        />
        <Text style={styles.inputCounter}>{name.length}/{NAME_MAX}</Text>
      </View>

      {/* Color */}
      <View style={styles.fieldLabelRow}>
        <Text style={styles.fieldLabel}>Color identifier</Text>
        <Text style={styles.fieldHelper}>Helps you spot it in lists</Text>
      </View>
      <ColorPicker selected={color} onSelect={setColor} />

      <PrimaryCTA
        variant="solid"
        style={styles.cta}
        label="Save changes"
        onPress={handleSave}
        loading={isSaving}
        disabled={!name.trim()}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  cancel: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  fieldLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing.sm,
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  required: {
    color: colors.error,
    fontWeight: '700',
  },
  fieldHelper: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  inputWrap: {
    position: 'relative',
    marginBottom: spacing.md,
  },
  input: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.sm + 2,
    paddingVertical: spacing.md,
    paddingLeft: spacing.md,
    paddingRight: 60,
    fontSize: fontSize.lg,
    color: colors.text,
  },
  inputCounter: {
    position: 'absolute',
    right: spacing.md,
    top: 0,
    bottom: 0,
    textAlignVertical: 'center',
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: '500',
    lineHeight: 50,
  },
  cta: {
    minHeight: 44,
    marginTop: spacing.sm,
  },
});
