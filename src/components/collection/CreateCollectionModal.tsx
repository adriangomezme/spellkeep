import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { BottomSheet } from '../BottomSheet';
import { colors, spacing, fontSize, borderRadius } from '../../constants';
import {
  fetchFolders,
  type CollectionType,
  type FolderSummary,
} from '../../lib/collections';
import { createCollectionLocal, createFolderLocal } from '../../lib/collections.local';
import { ColorPicker } from './ColorPicker';

type CreateType = 'binder' | 'list' | 'folder';

type Props = {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
  lockedType?: CollectionType;
  lockedFolderId?: string;
};

const TYPE_OPTIONS: { value: CreateType; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { value: 'binder', label: 'Binder', icon: 'albums' },
  { value: 'list', label: 'List', icon: 'list' },
  { value: 'folder', label: 'Folder', icon: 'folder' },
];

export function CreateCollectionModal({ visible, onClose, onCreated, lockedType, lockedFolderId }: Props) {
  const [type, setType] = useState<CreateType>('binder');
  const [name, setName] = useState('');
  const [folderId, setFolderId] = useState<string | null>(null);
  const [folderFor, setFolderFor] = useState<CollectionType>('binder');
  const [folders, setFolders] = useState<FolderSummary[]>([]);
  const [color, setColor] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showFolderPicker, setShowFolderPicker] = useState(false);

  const isLocked = !!lockedType;

  useEffect(() => {
    if (!visible) {
      setType(lockedType ?? 'binder');
      setName('');
      setFolderId(lockedFolderId ?? null);
      setFolderFor('binder');
      setColor(null);
      setShowFolderPicker(false);
      return;
    }
    if (lockedType) setType(lockedType);
    if (lockedFolderId) setFolderId(lockedFolderId);

    (async () => {
      const { data: { user } } = await (await import('../../lib/supabase')).supabase.auth.getUser();
      if (!user) return;
      const f = await fetchFolders(user.id);
      setFolders(f);
    })();
  }, [visible]);

  const matchingFolders = type === 'folder' ? [] : folders.filter((f) => f.type === type);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;

    setIsSaving(true);
    try {
      if (type === 'folder') {
        await createFolderLocal(trimmed, folderFor, color ?? null);
      } else {
        await createCollectionLocal({
          name: trimmed,
          type: type as CollectionType,
          folderId: folderId ?? null,
          color: color ?? null,
        });
      }
      onCreated();
    } catch (err: any) {
      console.error('Create error:', err);
      const { Alert } = require('react-native');
      Alert.alert('Create failed', err?.message ?? String(err));
    } finally {
      setIsSaving(false);
    }
  }

  const selectedFolder = folders.find((f) => f.id === folderId);
  const isFolder = type === 'folder';

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={styles.title}>
        {isLocked ? `New ${lockedType === 'binder' ? 'Binder' : 'List'}` : 'Create New'}
      </Text>

      {!isLocked && (
        <View style={styles.typeRow}>
          {TYPE_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.typeButton, type === opt.value && styles.typeButtonActive]}
              onPress={() => {
                setType(opt.value);
                setFolderId(lockedFolderId ?? null);
                setShowFolderPicker(false);
              }}
              activeOpacity={0.6}
            >
              <Ionicons
                name={opt.icon}
                size={18}
                color={type === opt.value ? '#FFFFFF' : colors.textSecondary}
              />
              <Text style={[styles.typeLabel, type === opt.value && styles.typeLabelActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <BottomSheetTextInput
        style={styles.input}
        placeholder={
          isFolder ? 'Folder name'
          : type === 'binder' ? 'Binder name'
          : 'List name'
        }
        placeholderTextColor={colors.textMuted}
        value={name}
        onChangeText={setName}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={handleSave}
      />

      <Text style={styles.fieldLabel}>Color Identifier</Text>
      <ColorPicker selected={color} onSelect={setColor} />

      {isFolder && (
        <>
          <Text style={styles.fieldLabel}>Folder for</Text>
          <View style={styles.folderForRow}>
            <TouchableOpacity
              style={[styles.folderForButton, folderFor === 'binder' && styles.folderForButtonActive]}
              onPress={() => setFolderFor('binder')}
              activeOpacity={0.6}
            >
              <Ionicons name="albums" size={16} color={folderFor === 'binder' ? '#FFFFFF' : colors.textSecondary} />
              <Text style={[styles.folderForText, folderFor === 'binder' && styles.folderForTextActive]}>Binders</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.folderForButton, folderFor === 'list' && styles.folderForButtonActive]}
              onPress={() => setFolderFor('list')}
              activeOpacity={0.6}
            >
              <Ionicons name="list" size={16} color={folderFor === 'list' ? '#FFFFFF' : colors.textSecondary} />
              <Text style={[styles.folderForText, folderFor === 'list' && styles.folderForTextActive]}>Lists</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {!isFolder && !lockedFolderId && matchingFolders.length > 0 && (
        <>
          <TouchableOpacity
            style={styles.folderPicker}
            onPress={() => setShowFolderPicker(!showFolderPicker)}
            activeOpacity={0.6}
          >
            <Ionicons name="folder-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.folderLabel}>
              {selectedFolder ? selectedFolder.name : 'No folder'}
            </Text>
            <Ionicons name={showFolderPicker ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
          </TouchableOpacity>

          {showFolderPicker && (
            <View style={styles.folderList}>
              <TouchableOpacity
                style={[styles.folderOption, !folderId && styles.folderOptionActive]}
                onPress={() => { setFolderId(null); setShowFolderPicker(false); }}
              >
                <Text style={styles.folderOptionText}>No folder</Text>
              </TouchableOpacity>
              {matchingFolders.map((f) => (
                <TouchableOpacity
                  key={f.id}
                  style={[styles.folderOption, folderId === f.id && styles.folderOptionActive]}
                  onPress={() => { setFolderId(f.id); setShowFolderPicker(false); }}
                >
                  <Text style={styles.folderOptionText}>{f.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </>
      )}

      <TouchableOpacity
        style={[styles.saveButton, (!name.trim() || isSaving) && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={!name.trim() || isSaving}
      >
        {isSaving ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Text style={styles.saveText}>Create</Text>
        )}
      </TouchableOpacity>
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
  typeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceSecondary,
  },
  typeButtonActive: {
    backgroundColor: colors.primary,
  },
  typeLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  typeLabelActive: {
    color: '#FFFFFF',
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
  folderForRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  folderForButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm + 2,
    backgroundColor: colors.surfaceSecondary,
  },
  folderForButtonActive: {
    backgroundColor: colors.primary,
  },
  folderForText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  folderForTextActive: {
    color: '#FFFFFF',
  },
  folderPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  folderLabel: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: fontSize.md,
  },
  folderList: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  folderOption: {
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.divider,
  },
  folderOptionActive: {
    backgroundColor: colors.primary + '14',
  },
  folderOptionText: {
    color: colors.text,
    fontSize: fontSize.md,
  },
  saveButton: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    marginTop: spacing.md,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveText: {
    color: '#FFFFFF',
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
});
