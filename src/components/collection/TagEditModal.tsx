import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { BottomSheet } from '../BottomSheet';
import { ColorPicker } from './ColorPicker';
import {
  deleteTagLocal,
  renameTagLocal,
  updateTagColorLocal,
} from '../../lib/collections.local';
import type { TagWithMeta } from '../../lib/hooks/useUserTags';
import { borderRadius, colors, fontSize, spacing } from '../../constants';

// Edit a single tag from the management screen. Uses the project's
// shared BottomSheet — capped to a fixed snap point so the sheet
// doesn't fill the screen for what's really just a name/color +
// delete affordance.

type Props = {
  visible: boolean;
  tag: TagWithMeta | null;
  onClose: () => void;
};

const SNAP_POINTS = ['45%'];

export function TagEditModal({ visible, tag, onClose }: Props) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (visible && tag) {
      setName(tag.name);
      setColor(tag.color);
    }
  }, [visible, tag]);

  if (!tag) return null;

  const trimmed = name.trim();
  const hasChanges = trimmed !== tag.name || color !== tag.color;
  const canSave = trimmed.length > 0 && hasChanges && !isSaving && !isDeleting;

  async function handleSave() {
    if (!canSave || !tag) return;
    setIsSaving(true);
    try {
      if (trimmed !== tag.name) await renameTagLocal(tag.id, trimmed);
      if (color !== tag.color) await updateTagColorLocal(tag.id, color);
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to save tag');
    } finally {
      setIsSaving(false);
    }
  }

  function handleDelete() {
    if (!tag) return;
    const count = tag.card_count;
    const usage =
      count === 0
        ? "This tag isn't applied to any cards."
        : `This tag is applied to ${count} ${count === 1 ? 'card' : 'cards'}. Deleting it removes it from all of them.`;
    Alert.alert(
      `Delete "${tag.name}"?`,
      `${usage} This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              await deleteTagLocal(tag.id);
              onClose();
            } catch (err: any) {
              Alert.alert('Error', err?.message ?? 'Failed to delete tag');
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  }

  const scopeLabel = tag.scope_collection_id
    ? tag.scope_collection_name
      ? `Only in ${tag.scope_collection_name}`
      : 'Collection-specific'
    : 'Global · available everywhere';

  return (
    <BottomSheet visible={visible} onClose={onClose} snapPoints={SNAP_POINTS}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Edit tag</Text>
        <TouchableOpacity onPress={handleSave} disabled={!canSave} hitSlop={10}>
          {isSaving ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={[styles.saveLabel, !canSave && styles.saveLabelDisabled]}>
              Save
            </Text>
          )}
        </TouchableOpacity>
      </View>
      <Text style={styles.scope} numberOfLines={1}>{scopeLabel}</Text>

      <Text style={styles.sectionLabel}>Name</Text>
      <BottomSheetTextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Tag name"
        placeholderTextColor={colors.textMuted}
        returnKeyType="done"
        onSubmitEditing={handleSave}
        autoCapitalize="words"
      />

      <Text style={styles.sectionLabel}>Color</Text>
      <ColorPicker selected={color} onSelect={setColor} />

      <Text style={styles.usageText}>
        Applied to {tag.card_count} {tag.card_count === 1 ? 'card' : 'cards'}
      </Text>

      <TouchableOpacity
        style={[styles.deleteBtn, (isDeleting || isSaving) && styles.deleteBtnDisabled]}
        onPress={handleDelete}
        disabled={isDeleting || isSaving}
        activeOpacity={0.7}
      >
        <Ionicons name="trash-outline" size={18} color={colors.error} />
        <Text style={styles.deleteBtnLabel}>Delete tag</Text>
      </TouchableOpacity>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
  },
  saveLabel: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  saveLabelDisabled: { opacity: 0.4 },
  scope: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
  },

  sectionLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  input: {
    height: 44,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.sm,
    color: colors.text,
    fontSize: fontSize.md,
  },
  usageText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: spacing.lg,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.errorLight,
  },
  deleteBtnDisabled: { opacity: 0.5 },
  deleteBtnLabel: {
    color: colors.error,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
});
