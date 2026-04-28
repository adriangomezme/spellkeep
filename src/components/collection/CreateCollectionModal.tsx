import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetTextInput, BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { useQuery } from '@powersync/react';
import { BottomSheet } from '../BottomSheet';
import { colors, spacing, fontSize, borderRadius } from '../../constants';
import {
  type CollectionType,
  type FolderSummary,
} from '../../lib/collections';
import { createCollectionLocal, createFolderLocal } from '../../lib/collections.local';
import { ColorPicker } from './ColorPicker';
import { PrimaryCTA } from '../PrimaryCTA';

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

const NAME_MAX = 40;

const TYPE_OPTIONS: {
  value: CreateType;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}[] = [
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
  // Read folders straight from local PowerSync SQLite so the picker has
  // data on the first frame.
  const folderRows = useQuery<FolderSummary & { item_count: number }>(
    `SELECT id, name, type, color,
            (SELECT COUNT(*) FROM collections c WHERE c.folder_id = f.id) AS item_count
       FROM collection_folders f
      ORDER BY LOWER(f.name)`
  );
  const folders = useMemo<FolderSummary[]>(
    () => (folderRows.data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      color: r.color,
      item_count: Number(r.item_count ?? 0),
    })),
    [folderRows.data]
  );
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
          <Text style={styles.pickerTitle}>Select folder</Text>
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
  const ctaLabel = `Create ${isFolder ? 'folder' : type}`;

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Create new</Text>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
      </View>

      <View>
        {/* Type selector */}
        {!isLocked && (
          <View style={styles.typeRow}>
            {TYPE_OPTIONS.map((opt) => {
              const active = type === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.typeButton, active && styles.typeButtonActive]}
                  onPress={() => {
                    setType(opt.value);
                    setFolderId(lockedFolderId ?? null);
                  }}
                  activeOpacity={0.6}
                >
                  <Ionicons
                    name={opt.icon}
                    size={17}
                    color={active ? colors.primary : colors.textSecondary}
                  />
                  <Text style={[styles.typeLabel, active && styles.typeLabelActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Name */}
        <View style={styles.fieldLabelRow}>
          <Text style={styles.fieldLabel}>
            Name <Text style={styles.required}>*</Text>
          </Text>
        </View>
        <View style={styles.inputWrap}>
          <BottomSheetTextInput
            style={styles.input}
            placeholder={
              isFolder ? 'Folder name'
              : type === 'binder' ? 'Binder name'
              : 'List name'
            }
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={(v) => setName(v.slice(0, NAME_MAX))}
            autoFocus={!skipAutoFocus}
            returnKeyType="done"
            onSubmitEditing={handleSave}
            maxLength={NAME_MAX}
          />
          <Text style={styles.inputCounter}>{name.length}/{NAME_MAX}</Text>
        </View>

        {/* Color identifier */}
        <View style={styles.fieldLabelRow}>
          <Text style={styles.fieldLabel}>Color identifier</Text>
          <Text style={styles.fieldHelper}>Helps you spot it in lists</Text>
        </View>
        <ColorPicker selected={color} onSelect={setColor} />

        {/* Folder for — folder type only */}
        {isFolder && (
          <>
            <View style={styles.fieldLabelRow}>
              <Text style={styles.fieldLabel}>Folder for</Text>
            </View>
            <View style={styles.folderForRow}>
              <TouchableOpacity
                style={[styles.folderForButton, folderFor === 'binder' && styles.folderForButtonActive]}
                onPress={() => setFolderFor('binder')}
                activeOpacity={0.6}
              >
                <Ionicons
                  name="albums"
                  size={16}
                  color={folderFor === 'binder' ? colors.primary : colors.textSecondary}
                />
                <Text style={[styles.folderForText, folderFor === 'binder' && styles.folderForTextActive]}>
                  Binders
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.folderForButton, folderFor === 'list' && styles.folderForButtonActive]}
                onPress={() => setFolderFor('list')}
                activeOpacity={0.6}
              >
                <Ionicons
                  name="list"
                  size={16}
                  color={folderFor === 'list' ? colors.primary : colors.textSecondary}
                />
                <Text style={[styles.folderForText, folderFor === 'list' && styles.folderForTextActive]}>
                  Lists
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Parent folder — binder/list only */}
        {!isFolder && !lockedFolderId && matchingFolders.length > 0 && (
          <>
            <View style={styles.fieldLabelRow}>
              <Text style={styles.fieldLabel}>
                Parent folder <Text style={styles.optional}>(optional)</Text>
              </Text>
            </View>
            <TouchableOpacity
              style={styles.parentRow}
              onPress={() => setView('folder-picker')}
              activeOpacity={0.6}
            >
              <View
                style={[
                  styles.parentThumb,
                  {
                    backgroundColor:
                      (selectedFolder?.color ?? '#A0A8B8') + '22',
                  },
                ]}
              >
                <Ionicons
                  name="folder"
                  size={16}
                  color={selectedFolder?.color ?? colors.textSecondary}
                />
              </View>
              <Text
                style={[
                  styles.parentName,
                  !selectedFolder && styles.parentNameMuted,
                ]}
                numberOfLines={1}
              >
                {selectedFolder ? selectedFolder.name : 'No folder'}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </>
        )}
      </View>

      <PrimaryCTA
        variant="solid"
        style={styles.cta}
        label={ctaLabel}
        onPress={handleSave}
        loading={isSaving}
        disabled={!name.trim()}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  // ── Header ──────────────────────────────────────────────────────────
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

  // ── Type selector ──────────────────────────────────────────────────
  typeRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.sm + 2,
    padding: 4,
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 2,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.sm,
  },
  typeButtonActive: {
    backgroundColor: colors.surface,
  },
  typeLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  typeLabelActive: {
    color: colors.primary,
    fontWeight: '700',
  },

  // ── Field labels ───────────────────────────────────────────────────
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
  optional: {
    color: colors.textMuted,
    fontWeight: '500',
    textTransform: 'none',
    letterSpacing: 0,
  },
  fieldHelper: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '500',
  },

  // ── Name input ─────────────────────────────────────────────────────
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

  // ── Folder-for selector (folder type only) ─────────────────────────
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
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.sm + 2,
    backgroundColor: colors.surfaceSecondary,
  },
  folderForButtonActive: {
    backgroundColor: colors.primaryLight,
  },
  folderForText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  folderForTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },

  // ── Parent folder row ──────────────────────────────────────────────
  parentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm + 4,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.sm + 2,
    marginBottom: spacing.sm,
  },
  parentThumb: {
    width: 28,
    height: 28,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  parentName: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  parentNameMuted: {
    color: colors.textSecondary,
    fontWeight: '500',
  },

  // ── CTA ────────────────────────────────────────────────────────────
  cta: {
    minHeight: 44,
    marginTop: spacing.sm,
  },

  // ── Folder picker view ─────────────────────────────────────────────
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
