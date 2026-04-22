import { useState, useEffect } from 'react';
import { Text, StyleSheet } from 'react-native';
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

type Props = {
  visible: boolean;
  itemId: string;
  itemName: string;
  itemColor: string | null;
  itemType: 'binder' | 'list' | 'folder';
  onClose: () => void;
  onSaved: () => void;
};

export function EditCollectionInfoModal({ visible, itemId, itemName, itemColor, itemType, onClose, onSaved }: Props) {
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

  const typeLabel = itemType === 'folder' ? 'Folder' : itemType === 'binder' ? 'Binder' : 'List';

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={styles.title}>Edit {typeLabel}</Text>

      <BottomSheetTextInput
        style={styles.input}
        placeholder={`${typeLabel} name`}
        placeholderTextColor={colors.textMuted}
        value={name}
        onChangeText={setName}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={handleSave}
      />

      <Text style={styles.fieldLabel}>Color Identifier</Text>
      <ColorPicker selected={color} onSelect={setColor} />

      <PrimaryCTA
        variant="solid"
        style={styles.saveButton}
        label="Save changes"
        onPress={handleSave}
        loading={isSaving}
        disabled={!name.trim()}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
    marginBottom: spacing.lg,
  },
  input: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: fontSize.lg,
    color: colors.text,
    marginBottom: spacing.md,
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  saveButton: {
    marginTop: spacing.sm,
    minHeight: 44,
  },
});
