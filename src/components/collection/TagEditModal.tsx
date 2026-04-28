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

// Edit a single tag from the management screen.

const NAME_MAX = 40;

type Props = {
  visible: boolean;
  tag: TagWithMeta | null;
  onClose: () => void;
};

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
    <BottomSheet visible={visible} onClose={onClose}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>Edit tag</Text>
          <Text style={styles.scope} numberOfLines={1}>{scopeLabel}</Text>
        </View>
        <TouchableOpacity
          onPress={handleDelete}
          disabled={isDeleting || isSaving}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={[styles.deleteIconBtn, (isDeleting || isSaving) && styles.deleteIconBtnDisabled]}
        >
          <Ionicons name="trash-outline" size={18} color={colors.error} />
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
          value={name}
          onChangeText={(v) => setName(v.slice(0, NAME_MAX))}
          placeholder="Tag name"
          placeholderTextColor={colors.textMuted}
          returnKeyType="done"
          onSubmitEditing={handleSave}
          autoCapitalize="words"
          maxLength={NAME_MAX}
          autoFocus
        />
        <Text style={styles.inputCounter}>{name.length}/{NAME_MAX}</Text>
      </View>

      {/* Color */}
      <View style={styles.fieldLabelRow}>
        <Text style={styles.fieldLabel}>Color</Text>
        <Text style={styles.fieldHelper}>
          Applied to {tag.card_count} {tag.card_count === 1 ? 'card' : 'cards'}
        </Text>
      </View>
      <ColorPicker selected={color} onSelect={setColor} />

      {/* Save CTA */}
      <TouchableOpacity
        style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={!canSave}
        activeOpacity={0.85}
      >
        {isSaving ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Text style={styles.saveLabel}>Save changes</Text>
        )}
      </TouchableOpacity>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  scope: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '500',
    marginTop: 2,
  },
  deleteIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.errorLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  deleteIconBtnDisabled: {
    opacity: 0.5,
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

  saveBtn: {
    minHeight: 44,
    backgroundColor: colors.primary,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  saveBtnDisabled: {
    opacity: 0.45,
  },
  saveLabel: {
    color: '#FFFFFF',
    fontSize: fontSize.lg,
    fontWeight: '700',
    letterSpacing: -0.2,
  },

});
