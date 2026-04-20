import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetTextInput, BottomSheetFlatList } from '@gorhom/bottom-sheet';
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
type ModalView = 'form' | 'folder-picker';

type Props = {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
  /** Locks the picker to this type (used when creating from within a folder). */
  lockedType?: CollectionType;
  /** Locks the destination folder. */
  lockedFolderId?: string;
  /** Pre-selects the type when the picker is NOT locked — so opening the
   *  "+" from the Binders tab defaults to Binder, from Lists defaults to
   *  List. The user can still switch. */
  defaultType?: CreateType;
  /** Pre-selects the "folder for" target when creating a folder so it
   *  matches the caller context. */
  defaultFolderFor?: CollectionType;
};

const TYPE_OPTIONS: { value: CreateType; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { value: 'binder', label: 'Binder', icon: 'albums' },
  { value: 'list', label: 'List', icon: 'list' },
  { value: 'folder', label: 'Folder', icon: 'folder' },
];

export function CreateCollectionModal({
  visible,
  onClose,
  onCreated,
  lockedType,
  lockedFolderId,
  defaultType,
  defaultFolderFor,
}: Props) {
  const [type, setType] = useState<CreateType>('binder');
  const [name, setName] = useState('');
  const [folderId, setFolderId] = useState<string | null>(null);
  const [folderFor, setFolderFor] = useState<CollectionType>('binder');
  const [folders, setFolders] = useState<FolderSummary[]>([]);
  const [color, setColor] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [view, setView] = useState<ModalView>('form');
  const [folderQuery, setFolderQuery] = useState('');
  // When the user comes back from the folder picker, the form re-mounts
  // and any BottomSheetTextInput with autoFocus re-grabs the keyboard.
  // Flip this flag on picker → form so we skip the auto-focus until the
  // modal is closed and reopened.
  const [skipAutoFocus, setSkipAutoFocus] = useState(false);

  const isLocked = !!lockedType;

  // Every time `visible` flips to true, sync state with the CURRENT props.
  // The component stays mounted while the sheet animates in/out, so a stale
  // useState(defaultType) at mount wouldn't pick up a later tab change.
  useEffect(() => {
    if (!visible) {
      setView('form');
      setName('');
      setColor(null);
      setFolderQuery('');
      setSkipAutoFocus(false);
      return;
    }
    setType(lockedType ?? defaultType ?? 'binder');
    setFolderId(lockedFolderId ?? null);
    setFolderFor(
      defaultFolderFor
      ?? (lockedType && lockedType !== undefined ? lockedType : undefined)
      ?? (defaultType && defaultType !== 'folder' ? (defaultType as CollectionType) : 'binder')
    );

    (async () => {
      const { data: { user } } = await (await import('../../lib/supabase')).supabase.auth.getUser();
      if (!user) return;
      const f = await fetchFolders(user.id);
      setFolders(f);
    })();
  }, [visible, lockedType, lockedFolderId, defaultType, defaultFolderFor]);

  const matchingFolders = useMemo(
    () => (type === 'folder' ? [] : folders.filter((f) => f.type === type)),
    [folders, type]
  );

  const filteredFolders = useMemo(() => {
    const q = folderQuery.trim().toLowerCase();
    if (!q) return matchingFolders;
    return matchingFolders.filter((f) => f.name.toLowerCase().includes(q));
  }, [matchingFolders, folderQuery]);

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

  // ── Folder picker view ──
  // Rendered in place of the form inside the same sheet. Single layer of
  // modal, back button returns to the form without losing any state.
  if (view === 'folder-picker') {
    return (
      <BottomSheet visible={visible} onClose={onClose} snapPoints={['75%']}>
        <View style={styles.pickerHeader}>
          <TouchableOpacity
            onPress={() => { setSkipAutoFocus(true); setView('form'); setFolderQuery(''); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.pickerTitle}>Select Folder</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.searchRow}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <BottomSheetTextInput
            value={folderQuery}
            onChangeText={setFolderQuery}
            placeholder="Search folders…"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>

        <BottomSheetFlatList
          data={filteredFolders}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <TouchableOpacity
              style={[styles.pickerRow, folderId == null && styles.pickerRowActive]}
              onPress={() => { setFolderId(null); setSkipAutoFocus(true); setView('form'); setFolderQuery(''); }}
              activeOpacity={0.6}
            >
              <Ionicons name="close-circle-outline" size={22} color={colors.textMuted} />
              <View style={styles.pickerRowText}>
                <Text style={styles.pickerRowName}>No folder</Text>
              </View>
              {folderId == null && (
                <Ionicons name="checkmark" size={22} color={colors.primary} />
              )}
            </TouchableOpacity>
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {folderQuery ? 'No folders match your search.' : 'No folders yet.'}
            </Text>
          }
          renderItem={({ item }) => {
            const selected = item.id === folderId;
            return (
              <TouchableOpacity
                style={[styles.pickerRow, selected && styles.pickerRowActive]}
                onPress={() => { setFolderId(item.id); setSkipAutoFocus(true); setView('form'); setFolderQuery(''); }}
                activeOpacity={0.6}
              >
                <Ionicons name="folder" size={22} color={item.color || '#A0A8B8'} />
                <View style={styles.pickerRowText}>
                  <Text style={styles.pickerRowName} numberOfLines={1}>{item.name}</Text>
                </View>
                {selected && <Ionicons name="checkmark" size={22} color={colors.primary} />}
              </TouchableOpacity>
            );
          }}
        />
      </BottomSheet>
    );
  }

  // ── Form view ──
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
        autoFocus={!skipAutoFocus}
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
        <TouchableOpacity
          style={styles.folderPicker}
          onPress={() => setView('folder-picker')}
          activeOpacity={0.6}
        >
          <Ionicons
            name={selectedFolder ? 'folder' : 'folder-outline'}
            size={20}
            color={selectedFolder ? selectedFolder.color ?? colors.textSecondary : colors.textSecondary}
          />
          <Text style={styles.folderLabel}>
            {selectedFolder ? selectedFolder.name : 'No folder'}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>
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
    // Match the "Binder name" input's padding so both form fields are
    // the same visual height.
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  folderLabel: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: fontSize.lg,
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
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  pickerTitle: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
    padding: 0,
  },
  // Card-style rows — same visual language as the binder destination
  // picker so the UI feels coherent between "add to binder" and "pick
  // folder". Active state uses the primary tint; idle state carries the
  // subtle surface fill.
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    marginBottom: 6,
  },
  pickerRowActive: {
    backgroundColor: colors.primary + '14',
  },
  pickerRowText: {
    flex: 1,
    minWidth: 0,
  },
  pickerRowName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
});
